// src/services/xbrl/valuationService.js

/**
 * Valuation Service
 *
 * Calculates valuation metrics (PE, PB, PS, EV/EBITDA) for EU/UK companies
 * by combining price data with fundamental metrics from XBRL.
 *
 * XBRL data provides fundamentals but not prices, so we need to:
 * 1. Get price data from Alpha Vantage or price_metrics table
 * 2. Combine with EPS, book value, revenue from xbrl_fundamental_metrics
 * 3. Update calculated_metrics with valuation ratios
 */

class ValuationService {
  constructor(database) {
    this.db = database;
    this._prepareStatements();
    console.log('✅ ValuationService initialized');
  }

  /**
   * Prepare SQL statements
   * @private
   */
  _prepareStatements() {
    // Get XBRL companies with fundamental data but missing valuation
    this.stmtGetCompaniesNeedingValuation = this.db.prepare(`
      SELECT DISTINCT
        c.id as company_id,
        c.symbol,
        c.name,
        c.country,
        xfm.period_end,
        xfm.eps_basic,
        xfm.eps_diluted,
        xfm.shares_outstanding,
        xfm.total_equity,
        xfm.revenue,
        xfm.ebitda,
        xfm.total_debt,
        xfm.cash_and_equivalents,
        xfm.net_income
      FROM companies c
      JOIN company_identifiers ci ON c.id = ci.company_id
      JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
      LEFT JOIN calculated_metrics cm ON c.id = cm.company_id AND xfm.period_end = cm.fiscal_period
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND (cm.pe_ratio IS NULL OR cm.pb_ratio IS NULL)
        AND (xfm.eps_basic IS NOT NULL OR xfm.total_equity IS NOT NULL)
      ORDER BY xfm.period_end DESC
    `);

    // Get price data for a company
    this.stmtGetPriceData = this.db.prepare(`
      SELECT
        last_price,
        market_cap,
        enterprise_value
      FROM price_metrics
      WHERE company_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    // Update calculated_metrics with valuation ratios
    this.stmtUpdateValuation = this.db.prepare(`
      UPDATE calculated_metrics
      SET
        pe_ratio = ?,
        pb_ratio = ?,
        ps_ratio = ?,
        ev_ebitda = ?,
        earnings_yield = ?
      WHERE company_id = ? AND fiscal_period = ?
    `);

    // Insert if not exists, then update
    this.stmtEnsureMetricsRow = this.db.prepare(`
      INSERT OR IGNORE INTO calculated_metrics (company_id, fiscal_period, period_type, data_source)
      VALUES (?, ?, 'annual', 'xbrl')
    `);
  }

  /**
   * Calculate valuation metrics for a single company
   * @param {Object} company - Company with fundamentals
   * @param {Object} priceData - Price data { last_price, market_cap, enterprise_value }
   * @returns {Object} - Calculated valuation metrics
   */
  calculateValuation(company, priceData) {
    const {
      eps_basic,
      eps_diluted,
      shares_outstanding,
      total_equity,
      revenue,
      ebitda,
      total_debt,
      cash_and_equivalents,
      net_income
    } = company;

    const { last_price, market_cap } = priceData;

    if (!last_price || last_price <= 0) {
      return { success: false, error: 'No price data' };
    }

    const result = {
      pe_ratio: null,
      pb_ratio: null,
      ps_ratio: null,
      ev_ebitda: null,
      earnings_yield: null
    };

    // P/E Ratio = Price / EPS
    const eps = eps_diluted || eps_basic;
    if (eps && eps > 0) {
      result.pe_ratio = last_price / eps;
      result.earnings_yield = eps / last_price;
    }

    // P/B Ratio = Price / Book Value per Share
    if (total_equity && shares_outstanding && shares_outstanding > 0) {
      const bookValuePerShare = total_equity / shares_outstanding;
      if (bookValuePerShare > 0) {
        result.pb_ratio = last_price / bookValuePerShare;
      }
    }

    // P/S Ratio = Market Cap / Revenue
    const effectiveMarketCap = market_cap || (last_price * shares_outstanding);
    if (effectiveMarketCap && revenue && revenue > 0) {
      result.ps_ratio = effectiveMarketCap / revenue;
    }

    // EV/EBITDA
    if (ebitda && ebitda > 0) {
      // Calculate EV if not provided
      let ev = priceData.enterprise_value;
      if (!ev && effectiveMarketCap) {
        const debt = total_debt || 0;
        const cash = cash_and_equivalents || 0;
        ev = effectiveMarketCap + debt - cash;
      }
      if (ev && ev > 0) {
        result.ev_ebitda = ev / ebitda;
      }
    }

    return { success: true, ...result };
  }

  /**
   * Update valuation for all EU/UK companies
   * @returns {Object} - Summary { processed, updated, skipped, errors }
   */
  updateAllValuations() {
    const companies = this.stmtGetCompaniesNeedingValuation.all();
    console.log(`Found ${companies.length} company-periods needing valuation update`);

    const summary = {
      processed: 0,
      updated: 0,
      skipped: 0,
      noPrice: 0,
      errors: 0
    };

    for (const company of companies) {
      summary.processed++;

      try {
        // Get price data
        const priceData = this.stmtGetPriceData.get(company.company_id);

        if (!priceData || !priceData.last_price) {
          summary.noPrice++;
          continue;
        }

        // Calculate valuation
        const valuation = this.calculateValuation(company, priceData);

        if (!valuation.success) {
          summary.skipped++;
          continue;
        }

        // Ensure metrics row exists
        this.stmtEnsureMetricsRow.run(company.company_id, company.period_end);

        // Update valuation
        this.stmtUpdateValuation.run(
          valuation.pe_ratio,
          valuation.pb_ratio,
          valuation.ps_ratio,
          valuation.ev_ebitda,
          valuation.earnings_yield,
          company.company_id,
          company.period_end
        );

        summary.updated++;
      } catch (error) {
        console.error(`Error updating valuation for ${company.symbol}:`, error.message);
        summary.errors++;
      }
    }

    console.log(`Valuation update complete: ${summary.updated} updated, ${summary.noPrice} missing price, ${summary.errors} errors`);
    return summary;
  }

  /**
   * Update valuation for a single company by symbol
   * @param {string} symbol - Company symbol
   * @returns {Object} - Update result
   */
  updateCompanyValuation(symbol) {
    const company = this.db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        xfm.period_end,
        xfm.eps_basic,
        xfm.eps_diluted,
        xfm.shares_outstanding,
        xfm.total_equity,
        xfm.revenue,
        xfm.ebitda,
        xfm.total_debt,
        xfm.cash_and_equivalents
      FROM companies c
      JOIN company_identifiers ci ON c.id = ci.company_id
      JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
      WHERE c.symbol = ?
      ORDER BY xfm.period_end DESC
      LIMIT 1
    `).get(symbol);

    if (!company) {
      return { success: false, error: 'Company not found' };
    }

    const priceData = this.stmtGetPriceData.get(company.company_id);
    if (!priceData) {
      return { success: false, error: 'No price data' };
    }

    const valuation = this.calculateValuation(company, priceData);
    if (!valuation.success) {
      return valuation;
    }

    this.stmtEnsureMetricsRow.run(company.company_id, company.period_end);
    this.stmtUpdateValuation.run(
      valuation.pe_ratio,
      valuation.pb_ratio,
      valuation.ps_ratio,
      valuation.ev_ebitda,
      valuation.earnings_yield,
      company.company_id,
      company.period_end
    );

    return {
      success: true,
      symbol,
      periodEnd: company.period_end,
      ...valuation
    };
  }

  /**
   * Get valuation statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const euCompanies = this.db.prepare(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM companies c
      WHERE c.country NOT IN ('US', 'USA', 'CA') AND c.is_active = 1
    `).get();

    const withPE = this.db.prepare(`
      SELECT COUNT(DISTINCT cm.company_id) as count
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND cm.pe_ratio IS NOT NULL
    `).get();

    const withPB = this.db.prepare(`
      SELECT COUNT(DISTINCT cm.company_id) as count
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND cm.pb_ratio IS NOT NULL
    `).get();

    const withPrice = this.db.prepare(`
      SELECT COUNT(DISTINCT pm.company_id) as count
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND pm.last_price IS NOT NULL
    `).get();

    return {
      totalEUCompanies: euCompanies.count,
      withPERatio: withPE.count,
      withPBRatio: withPB.count,
      withPriceData: withPrice.count,
      peCoverage: euCompanies.count > 0 ? (withPE.count / euCompanies.count * 100).toFixed(1) + '%' : '0%',
      pbCoverage: euCompanies.count > 0 ? (withPB.count / euCompanies.count * 100).toFixed(1) + '%' : '0%'
    };
  }
}

module.exports = { ValuationService };
