// src/services/xbrl/valuationService.js

const { getDatabaseAsync } = require('../../lib/db');

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
  constructor() {
    console.log('✅ ValuationService initialized');
  }

  /**
   * Get companies needing valuation update
   * @private
   */
  async getCompaniesNeedingValuation() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
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
    return result.rows;
  }

  /**
   * Get price data for a company
   * @private
   */
  async getPriceData(companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        last_price,
        market_cap,
        enterprise_value
      FROM price_metrics
      WHERE company_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [companyId]);
    return result.rows[0] || null;
  }

  /**
   * Ensure metrics row exists
   * @private
   */
  async ensureMetricsRow(companyId, periodEnd) {
    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO calculated_metrics (company_id, fiscal_period, period_type, data_source)
      VALUES ($1, $2, 'annual', 'xbrl')
      ON CONFLICT (company_id, fiscal_period, period_type) DO NOTHING
    `, [companyId, periodEnd]);
  }

  /**
   * Update valuation metrics
   * @private
   */
  async updateValuation(companyId, periodEnd, valuation) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE calculated_metrics
      SET
        pe_ratio = $1,
        pb_ratio = $2,
        ps_ratio = $3,
        ev_ebitda = $4,
        earnings_yield = $5
      WHERE company_id = $6 AND fiscal_period = $7
    `, [
      valuation.pe_ratio,
      valuation.pb_ratio,
      valuation.ps_ratio,
      valuation.ev_ebitda,
      valuation.earnings_yield,
      companyId,
      periodEnd
    ]);
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
  async updateAllValuations() {
    const companies = await this.getCompaniesNeedingValuation();
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
        const priceData = await this.getPriceData(company.company_id);

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
        await this.ensureMetricsRow(company.company_id, company.period_end);

        // Update valuation
        await this.updateValuation(company.company_id, company.period_end, valuation);

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
  async updateCompanyValuation(symbol) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
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
      WHERE c.symbol = $1
      ORDER BY xfm.period_end DESC
      LIMIT 1
    `, [symbol]);

    const company = result.rows[0];
    if (!company) {
      return { success: false, error: 'Company not found' };
    }

    const priceData = await this.getPriceData(company.company_id);
    if (!priceData) {
      return { success: false, error: 'No price data' };
    }

    const valuation = this.calculateValuation(company, priceData);
    if (!valuation.success) {
      return valuation;
    }

    await this.ensureMetricsRow(company.company_id, company.period_end);
    await this.updateValuation(company.company_id, company.period_end, valuation);

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
  async getStats() {
    const database = await getDatabaseAsync();

    const euCompaniesResult = await database.query(`
      SELECT COUNT(DISTINCT c.id) as count
      FROM companies c
      WHERE c.country NOT IN ('US', 'USA', 'CA') AND c.is_active = true
    `);

    const withPEResult = await database.query(`
      SELECT COUNT(DISTINCT cm.company_id) as count
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND cm.pe_ratio IS NOT NULL
    `);

    const withPBResult = await database.query(`
      SELECT COUNT(DISTINCT cm.company_id) as count
      FROM calculated_metrics cm
      JOIN companies c ON cm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND cm.pb_ratio IS NOT NULL
    `);

    const withPriceResult = await database.query(`
      SELECT COUNT(DISTINCT pm.company_id) as count
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.country NOT IN ('US', 'USA', 'CA')
        AND pm.last_price IS NOT NULL
    `);

    const euCompanies = euCompaniesResult.rows[0];
    const withPE = withPEResult.rows[0];
    const withPB = withPBResult.rows[0];
    const withPrice = withPriceResult.rows[0];

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
