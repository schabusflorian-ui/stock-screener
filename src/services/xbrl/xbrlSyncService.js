// src/services/xbrl/xbrlSyncService.js

/**
 * XBRL Sync Service
 *
 * Bridges XBRL data (EU/UK) to the main application database:
 * 1. Links XBRL companies (company_identifiers) → companies table
 * 2. Syncs xbrl_fundamental_metrics → calculated_metrics
 * 3. Enables EU/UK companies to appear in screening and filtering
 * 4. Auto-resolves tickers for new companies via GLEIF → ISIN → OpenFIGI
 *
 * This is the critical integration layer that makes XBRL data seamless.
 */

const { getDatabaseAsync } = require('../../database');
const { SymbolResolver } = require('../identifiers/symbolResolver');

class XBRLSyncService {
  constructor(options = {}) {
    this.options = {
      autoResolveTickers: true,  // Auto-resolve tickers for new companies
      ...options
    };

    // Initialize SymbolResolver for ticker resolution
    try {
      this.symbolResolver = new SymbolResolver();
    } catch (error) {
      console.warn('⚠️ SymbolResolver initialization failed, ticker auto-resolution disabled:', error.message);
      this.symbolResolver = null;
    }

    console.log('✅ XBRLSyncService initialized');
  }

  // ========================================
  // Company Linking
  // ========================================

  /**
   * Link XBRL company to main companies table
   * Creates new company if doesn't exist, or links to existing
   * @param {Object} identifier - Record from company_identifiers
   * @returns {Promise<Object>} - { companyId, created, linked }
   */
  async linkCompany(identifier) {
    const database = await getDatabaseAsync();
    const { id: identifierId, lei, ticker, yahoo_symbol, legal_name, country, exchange, isin } = identifier;

    // Try to find existing company
    let company = null;
    const symbol = ticker || yahoo_symbol;

    // First try by LEI (most reliable)
    if (lei) {
      const result = await database.query(
        'SELECT id, symbol, name, country FROM companies WHERE lei = $1',
        [lei]
      );
      company = result.rows[0];
    }

    // Then try by symbol
    if (!company && symbol) {
      const result = await database.query(
        'SELECT id, symbol, name, country FROM companies WHERE symbol = $1',
        [symbol]
      );
      company = result.rows[0];
    }

    if (company) {
      // Update existing company with identifiers if missing
      await database.query(
        `UPDATE companies SET
          lei = COALESCE($1, lei),
          isin = COALESCE($2, isin),
          country = COALESCE($3, country),
          last_updated = CURRENT_TIMESTAMP
        WHERE id = $4`,
        [lei, isin, country, company.id]
      );
      // Link the identifier
      await database.query(
        'UPDATE company_identifiers SET company_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [company.id, identifierId]
      );

      return { companyId: company.id, created: false, linked: true };
    }

    // Create new company - use LEI as fallback symbol if no ticker available
    // This allows EU/UK companies without tickers to be stored and queried by LEI
    const effectiveSymbol = symbol || lei;
    if (!effectiveSymbol) {
      console.warn(`Cannot create company without symbol or LEI for identifier ${identifierId}`);
      return { companyId: null, created: false, linked: false, error: 'No symbol or LEI' };
    }

    try {
      const result = await database.query(
        `INSERT INTO companies (symbol, name, sector, industry, exchange, country, lei, isin, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        RETURNING id`,
        [
          effectiveSymbol,
          legal_name || effectiveSymbol,
          null, // sector - will be enriched later
          null, // industry
          exchange || this._inferExchange(country),
          country || 'EU',
          lei,
          isin
        ]
      );

      const companyId = result.rows[0].id;

      // Link the identifier
      await database.query(
        'UPDATE company_identifiers SET company_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [companyId, identifierId]
      );

      return { companyId, created: true, linked: true };
    } catch (error) {
      // Handle unique constraint violation (symbol already exists)
      if (error.message.includes('duplicate key')) {
        const existing = await database.query(
          'SELECT id FROM companies WHERE symbol = $1',
          [effectiveSymbol]
        );
        if (existing.rows.length > 0) {
          await database.query(
            'UPDATE company_identifiers SET company_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [existing.rows[0].id, identifierId]
          );
          return { companyId: existing.rows[0].id, created: false, linked: true };
        }
      }
      throw error;
    }
  }

  /**
   * Link all unlinked XBRL companies to main companies table
   * @returns {Promise<Object>} - Summary { processed, created, linked, errors }
   */
  async linkAllUnlinkedCompanies() {
    const database = await getDatabaseAsync();
    const result = await database.query(
      'SELECT * FROM company_identifiers WHERE company_id IS NULL'
    );
    const unlinked = result.rows;
    console.log(`Found ${unlinked.length} unlinked XBRL companies`);

    const summary = { processed: 0, created: 0, linked: 0, errors: 0 };

    for (const identifier of unlinked) {
      try {
        const linkResult = await this.linkCompany(identifier);
        summary.processed++;
        if (linkResult.created) summary.created++;
        if (linkResult.linked) summary.linked++;
      } catch (error) {
        console.error(`Error linking identifier ${identifier.id}:`, error.message);
        summary.errors++;
      }
    }

    return summary;
  }

  // ========================================
  // Ticker Resolution
  // ========================================

  /**
   * Resolve ticker for a single company via GLEIF → ISIN → OpenFIGI pipeline
   * @param {Object} identifier - Record from company_identifiers
   * @returns {Promise<Object>} - { resolved, ticker, yahooSymbol, figi, isin }
   */
  async resolveTickerForIdentifier(identifier) {
    if (!this.symbolResolver) {
      return { resolved: false, error: 'SymbolResolver not available' };
    }

    const database = await getDatabaseAsync();
    const { id, lei, legal_name } = identifier;

    if (!lei) {
      return { resolved: false, error: 'No LEI available' };
    }

    try {
      const resolutionResult = await this.symbolResolver.resolveFromLEI(lei);

      if (resolutionResult && resolutionResult.primaryListing) {
        const { ticker, yahooSymbol, figi, isin } = resolutionResult.primaryListing;

        // Update company_identifiers with resolved data
        await database.query(
          `UPDATE company_identifiers
          SET ticker = $1, yahoo_symbol = $2, figi = $3, isin = COALESCE($4, isin),
              link_status = 'linked', updated_at = CURRENT_TIMESTAMP
          WHERE id = $5`,
          [ticker, yahooSymbol, figi || null, isin || null, id]
        );

        console.log(`  ✓ Resolved ${legal_name?.substring(0, 30) || lei} → ${yahooSymbol}`);

        return {
          resolved: true,
          ticker,
          yahooSymbol,
          figi,
          isin,
          companyName: resolutionResult.companyName
        };
      } else if (resolutionResult && resolutionResult.listings && resolutionResult.listings.length > 0) {
        // Use first available listing if no primary
        const listing = resolutionResult.listings[0];

        await database.query(
          `UPDATE company_identifiers
          SET ticker = $1, yahoo_symbol = $2, figi = $3, isin = COALESCE($4, isin),
              link_status = 'linked', updated_at = CURRENT_TIMESTAMP
          WHERE id = $5`,
          [listing.ticker, listing.yahooSymbol, listing.figi || null, listing.isin || null, id]
        );

        console.log(`  ✓ Resolved (alt) ${legal_name?.substring(0, 30) || lei} → ${listing.yahooSymbol}`);

        return {
          resolved: true,
          ticker: listing.ticker,
          yahooSymbol: listing.yahooSymbol,
          figi: listing.figi,
          isin: listing.isin
        };
      }

      return { resolved: false, error: 'No listings found' };
    } catch (error) {
      console.warn(`  ✗ Failed to resolve ${legal_name || lei}: ${error.message}`);
      return { resolved: false, error: error.message };
    }
  }

  /**
   * Resolve tickers for pending companies in batch
   * @param {number} limit - Maximum number to process (default 50)
   * @param {number} delayMs - Delay between requests in ms (default 500)
   * @returns {Promise<Object>} - Summary { processed, resolved, failed }
   */
  async resolvePendingTickers(limit = 50, delayMs = 500) {
    if (!this.symbolResolver) {
      console.warn('SymbolResolver not available, skipping ticker resolution');
      return { processed: 0, resolved: 0, failed: 0, skipped: true };
    }

    const database = await getDatabaseAsync();
    const result = await database.query(
      `SELECT * FROM company_identifiers
      WHERE link_status = 'pending'
      AND lei IS NOT NULL AND lei != ''
      AND (ticker IS NULL OR ticker = '')
      ORDER BY created_at DESC
      LIMIT $1`,
      [limit]
    );
    const pending = result.rows;
    console.log(`\n🔍 Resolving tickers for ${pending.length} pending companies...`);

    const summary = { processed: 0, resolved: 0, failed: 0 };

    for (const identifier of pending) {
      const resolutionResult = await this.resolveTickerForIdentifier(identifier);
      summary.processed++;

      if (resolutionResult.resolved) {
        summary.resolved++;
      } else {
        summary.failed++;
      }

      // Rate limiting
      if (delayMs > 0 && summary.processed < pending.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log(`   Ticker resolution: ${summary.resolved} resolved, ${summary.failed} failed`);
    return summary;
  }

  /**
   * Link a company with auto ticker resolution if needed
   * @param {Object} identifier - Record from company_identifiers
   * @param {boolean} autoResolve - Whether to auto-resolve ticker if missing
   * @returns {Promise<Object>} - { companyId, created, linked, tickerResolved }
   */
  async linkCompanyWithResolution(identifier, autoResolve = true) {
    let { ticker, yahoo_symbol } = identifier;
    let tickerResolved = false;

    // If no ticker and auto-resolve is enabled, try to resolve it
    if (!ticker && !yahoo_symbol && autoResolve && this.options.autoResolveTickers) {
      const resolution = await this.resolveTickerForIdentifier(identifier);
      if (resolution.resolved) {
        ticker = resolution.ticker;
        yahoo_symbol = resolution.yahooSymbol;
        tickerResolved = true;

        // Update identifier object for linkCompany
        identifier = { ...identifier, ticker, yahoo_symbol };
      }
    }

    // Now link the company (sync method)
    const linkResult = this.linkCompany(identifier);

    return {
      ...linkResult,
      tickerResolved
    };
  }

  /**
   * Link all unlinked companies with ticker resolution
   * @param {Object} options - { autoResolve, resolutionLimit, delayMs }
   * @returns {Promise<Object>} - Summary
   */
  async linkAllUnlinkedCompaniesWithResolution(options = {}) {
    const {
      autoResolve = true,
      resolutionLimit = 100,
      delayMs = 300
    } = options;

    const database = await getDatabaseAsync();
    const result = await database.query(
      'SELECT * FROM company_identifiers WHERE company_id IS NULL'
    );
    const unlinked = result.rows;
    console.log(`Found ${unlinked.length} unlinked XBRL companies`);

    const summary = {
      processed: 0,
      created: 0,
      linked: 0,
      tickersResolved: 0,
      errors: 0
    };

    let resolutionsAttempted = 0;

    for (const identifier of unlinked) {
      try {
        // Only auto-resolve if we haven't hit the limit
        const shouldResolve = autoResolve &&
          resolutionsAttempted < resolutionLimit &&
          !identifier.ticker &&
          identifier.lei;

        const linkResult = await this.linkCompanyWithResolution(identifier, shouldResolve);

        summary.processed++;
        if (linkResult.created) summary.created++;
        if (linkResult.linked) summary.linked++;
        if (linkResult.tickerResolved) {
          summary.tickersResolved++;
          resolutionsAttempted++;

          // Rate limiting for API calls
          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      } catch (error) {
        console.error(`Error linking identifier ${identifier.id}:`, error.message);
        summary.errors++;
      }
    }

    return summary;
  }

  // ========================================
  // Metrics Sync
  // ========================================

  /**
   * Sync XBRL metrics to calculated_metrics table
   * @param {number} identifierId - Optional: sync specific identifier
   * @returns {Promise<Object>} - Summary { synced, skipped, errors }
   */
  async syncMetrics(identifierId = null) {
    const database = await getDatabaseAsync();
    let metricsResult;

    if (identifierId) {
      metricsResult = await database.query(
        `SELECT xfm.*, ci.company_id
        FROM xbrl_fundamental_metrics xfm
        JOIN company_identifiers ci ON xfm.identifier_id = ci.id
        WHERE xfm.identifier_id = $1 AND ci.company_id IS NOT NULL
        ORDER BY xfm.period_end DESC`,
        [identifierId]
      );
    } else {
      metricsResult = await database.query(
        `SELECT xfm.*, ci.company_id
        FROM xbrl_fundamental_metrics xfm
        JOIN company_identifiers ci ON xfm.identifier_id = ci.id
        WHERE ci.company_id IS NOT NULL
        ORDER BY xfm.period_end DESC`
      );
    }
    const metrics = metricsResult.rows;

    console.log(`Syncing ${metrics.length} XBRL metrics records to calculated_metrics`);

    const summary = { synced: 0, skipped: 0, errors: 0 };

    // Build lookup for prior year data (for YoY growth calculations)
    const priorYearData = {};
    for (const m of metrics) {
      if (!m.company_id) continue;
      const key = `${m.company_id}_${m.period_type || 'annual'}`;
      if (!priorYearData[key]) {
        priorYearData[key] = [];
      }
      priorYearData[key].push(m);
    }
    // Sort each company's data by period descending
    for (const key in priorYearData) {
      priorYearData[key].sort((a, b) => b.period_end.localeCompare(a.period_end));
    }


    for (const m of metrics) {
      if (!m.company_id) {
        summary.skipped++;
        continue;
      }

      try {
        // ===== DECIMAL TO PERCENTAGE CONVERSION =====
        // XBRL stores ratios as decimals (0.22 = 22%), but SEC/frontend expects percentages (22 = 22%)
        // Convert to percentage format for consistency with SEC data
        const toPercent = (value) => {
          if (value === null || value === undefined) return null;
          return value * 100;
        };

        // Data quality: cap extreme ratios at reasonable bounds (in percentage terms)
        // Extreme values typically indicate data issues (negative equity, tiny denominators)
        const capRatio = (value, min = -200, max = 200) => {
          if (value === null || value === undefined) return null;
          if (value < min || value > max) return null; // Treat extreme values as unreliable
          return value;
        };

        // Convert XBRL decimals to percentages, then cap at ±200%
        const cappedROE = capRatio(toPercent(m.roe));
        const cappedROIC = capRatio(toPercent(m.roic));
        const cappedROA = capRatio(toPercent(m.roa));
        const cappedROCE = capRatio(toPercent(m.roce));
        const cappedGrossMargin = capRatio(toPercent(m.gross_margin), -100, 100);
        const cappedOpMargin = capRatio(toPercent(m.operating_margin), -500, 100); // Allow larger losses
        const cappedNetMargin = capRatio(toPercent(m.net_margin), -500, 100);
        const cappedEquityMultiplier = capRatio(m.equity_multiplier, 0, 20); // Keep as ratio, not percentage
        const cappedDupontROE = capRatio(toPercent(m.dupont_roe));

        // ===== DEBT/EQUITY CALCULATION =====
        // XBRL data rarely has total_debt directly, so we calculate from available fields
        // Priority: 1) Use existing debt_to_equity if available
        //           2) Calculate from non_current_liabilities / equity (conservative proxy)
        //           3) Calculate from total_liabilities / equity (includes trade payables)
        let calculatedDebtToEquity = m.debt_to_equity;
        if (calculatedDebtToEquity === null && m.total_equity && m.total_equity > 0) {
          if (m.non_current_liabilities) {
            // Non-current liabilities is a better proxy for debt (excludes trade payables)
            calculatedDebtToEquity = capRatio(m.non_current_liabilities / m.total_equity, 0, 10);
          } else if (m.total_liabilities) {
            // Fall back to total liabilities (less accurate, includes operating liabilities)
            calculatedDebtToEquity = capRatio(m.total_liabilities / m.total_equity, 0, 10);
          }
        }

        // ===== FREE CASH FLOW CALCULATION =====
        // Priority: 1) Use existing FCF if available
        //           2) Calculate: OCF - CapEx
        //           3) Estimate: OCF + Investing CF (ICF is typically negative)
        let calculatedFCF = m.free_cash_flow;
        if (calculatedFCF === null) {
          if (m.operating_cash_flow && m.capital_expenditure) {
            // Standard FCF formula: OCF - CapEx
            // Note: capital_expenditure should be positive, we subtract it
            calculatedFCF = m.operating_cash_flow - Math.abs(m.capital_expenditure);
          } else if (m.operating_cash_flow && m.investing_cash_flow) {
            // Proxy: OCF + ICF (ICF includes CapEx and is typically negative)
            // This is less accurate but provides a reasonable estimate
            calculatedFCF = m.operating_cash_flow + m.investing_cash_flow;
          }
        }

        // Calculate FCF yield and FCF margin (convert to percentage)
        const fcfYield = calculatedFCF && m.total_equity && m.total_equity > 0
          ? capRatio((calculatedFCF / m.total_equity) * 100)
          : null;
        const fcfMargin = calculatedFCF && m.revenue
          ? capRatio((calculatedFCF / m.revenue) * 100, -200, 100)
          : null;

        // Calculate FCF per share
        const fcfPerShare = calculatedFCF && m.shares_outstanding
          ? calculatedFCF / m.shares_outstanding
          : null;

        // Find prior year data for growth calculations
        const key = `${m.company_id}_${m.period_type || 'annual'}`;
        const companyData = priorYearData[key] || [];
        const currentIdx = companyData.findIndex(d => d.period_end === m.period_end);
        const priorYear = currentIdx >= 0 && currentIdx < companyData.length - 1
          ? companyData[currentIdx + 1]
          : null;

        // Calculate YoY growth rates (convert to percentage)
        let revenueGrowthYoY = null;
        let earningsGrowthYoY = null;
        let fcfGrowthYoY = null;

        if (priorYear) {
          if (m.revenue && priorYear.revenue && priorYear.revenue !== 0) {
            revenueGrowthYoY = ((m.revenue - priorYear.revenue) / Math.abs(priorYear.revenue)) * 100;
          }
          if (m.net_income && priorYear.net_income && priorYear.net_income !== 0) {
            earningsGrowthYoY = ((m.net_income - priorYear.net_income) / Math.abs(priorYear.net_income)) * 100;
          }
          // Use calculatedFCF for growth calculations too
          const priorFCF = priorYear?.free_cash_flow ||
            (priorYear?.operating_cash_flow && priorYear?.capital_expenditure
              ? priorYear.operating_cash_flow - Math.abs(priorYear.capital_expenditure)
              : (priorYear?.operating_cash_flow && priorYear?.investing_cash_flow
                ? priorYear.operating_cash_flow + priorYear.investing_cash_flow
                : null));
          if (calculatedFCF && priorFCF && priorFCF !== 0) {
            fcfGrowthYoY = ((calculatedFCF - priorFCF) / Math.abs(priorFCF)) * 100;
          }
        }

        // Calculate data quality score based on available and valid data
        let qualityScore = 80; // Base score
        if (cappedROE === null && m.roe !== null) qualityScore -= 10; // Had to cap extreme value
        if (cappedROIC === null && m.roic !== null) qualityScore -= 10;
        if (m.total_equity < 0) qualityScore -= 15; // Negative equity is concerning
        if (!m.revenue || m.revenue <= 0) qualityScore -= 10;
        // Bonus for calculated fields
        if (calculatedDebtToEquity !== null && m.debt_to_equity === null) qualityScore += 5; // We derived D/E
        if (calculatedFCF !== null && m.free_cash_flow === null) qualityScore += 5; // We derived FCF

        await database.query(
          `INSERT INTO calculated_metrics (
            company_id, fiscal_period, period_type, data_source,
            roic, roe, roa, roce, gross_margin, operating_margin, net_margin,
            equity_multiplier, dupont_roe,
            fcf, fcf_yield, fcf_margin, fcf_per_share,
            debt_to_equity, debt_to_assets, current_ratio, quick_ratio, interest_coverage,
            asset_turnover,
            revenue_growth_yoy, earnings_growth_yoy, fcf_growth_yoy,
            pe_ratio, pb_ratio,
            data_quality_score
          )
          VALUES ($1, $2, $3, 'xbrl', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
          ON CONFLICT(company_id, fiscal_period, period_type)
          DO UPDATE SET
            data_source = 'xbrl',
            roic = excluded.roic,
            roe = excluded.roe,
            roa = excluded.roa,
            roce = excluded.roce,
            gross_margin = excluded.gross_margin,
            operating_margin = excluded.operating_margin,
            net_margin = excluded.net_margin,
            equity_multiplier = excluded.equity_multiplier,
            dupont_roe = excluded.dupont_roe,
            fcf = excluded.fcf,
            fcf_yield = excluded.fcf_yield,
            fcf_margin = excluded.fcf_margin,
            fcf_per_share = excluded.fcf_per_share,
            debt_to_equity = excluded.debt_to_equity,
            debt_to_assets = excluded.debt_to_assets,
            current_ratio = excluded.current_ratio,
            quick_ratio = excluded.quick_ratio,
            interest_coverage = excluded.interest_coverage,
            asset_turnover = excluded.asset_turnover,
            revenue_growth_yoy = excluded.revenue_growth_yoy,
            earnings_growth_yoy = excluded.earnings_growth_yoy,
            fcf_growth_yoy = excluded.fcf_growth_yoy,
            data_quality_score = excluded.data_quality_score`,
          [
            m.company_id,
            m.period_end,
            m.period_type || 'annual',
            cappedROIC,
            cappedROE,
            cappedROA,
            cappedROCE,
            cappedGrossMargin,
            cappedOpMargin,
            cappedNetMargin,
            cappedEquityMultiplier,
            cappedDupontROE,
            calculatedFCF,
            fcfYield,
            fcfMargin,
            fcfPerShare,
            calculatedDebtToEquity,
            m.debt_to_assets,
            m.current_ratio,
            m.quick_ratio,
            m.interest_coverage,
            m.asset_turnover,
            revenueGrowthYoY,
            earningsGrowthYoY,
            fcfGrowthYoY,
            null, // pe_ratio
            null, // pb_ratio
            qualityScore
          ]
        );

        summary.synced++;
      } catch (error) {
        console.error(`Error syncing metrics for company ${m.company_id}:`, error.message);
        summary.errors++;
      }
    }

    return summary;
  }

  /**
   * Sync XBRL raw financials to financial_data table
   * This bridges EU/UK company data to the same table used by US companies
   * Enables consistent API access to financial statements for all companies
   * @returns {Promise<Object>} - Summary { synced, skipped, errors }
   */
  async syncFinancialData() {
    const database = await getDatabaseAsync();
    // Get all XBRL metrics with linked companies
    const metricsResult = await database.query(`
      SELECT xfm.*, ci.company_id, c.reporting_currency
      FROM xbrl_fundamental_metrics xfm
      JOIN company_identifiers ci ON xfm.identifier_id = ci.id
      JOIN companies c ON ci.company_id = c.id
      WHERE ci.company_id IS NOT NULL
      ORDER BY xfm.period_end DESC
    `);
    const metrics = metricsResult.rows;

    console.log(`Syncing ${metrics.length} XBRL records to financial_data table`);

    const summary = { synced: 0, skipped: 0, errors: 0 };

    for (const m of metrics) {
      if (!m.company_id) {
        summary.skipped++;
        continue;
      }

      try {
        const fiscalYear = new Date(m.period_end).getFullYear();
        const periodType = m.period_type || 'annual';
        const currency = m.currency || m.reporting_currency || 'EUR';

        // Create income statement record
        if (m.revenue || m.net_income || m.operating_income) {
          const incomeData = JSON.stringify({
            revenue: m.revenue,
            costOfRevenue: m.cost_of_sales,
            grossProfit: m.gross_profit,
            operatingIncome: m.operating_income,
            ebitda: m.ebitda,
            netIncome: m.net_income,
            eps: m.eps_basic,
            epsDiluted: m.eps_diluted,
            interestExpense: m.interest_expense,
            incomeTaxExpense: m.income_tax_expense,
            currency: currency,
            _source: 'xbrl'
          });

          await database.query(
            `INSERT INTO financial_data (
              company_id, statement_type, fiscal_date_ending, fiscal_year,
              period_type, data,
              total_assets, total_liabilities, shareholder_equity,
              current_assets, current_liabilities, cash_and_equivalents,
              long_term_debt, short_term_debt,
              total_revenue, net_income, operating_income, cost_of_revenue, gross_profit,
              operating_cashflow, capital_expenditures, shares_outstanding
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
            DO UPDATE SET
              data = excluded.data,
              total_revenue = excluded.total_revenue,
              net_income = excluded.net_income,
              operating_income = excluded.operating_income,
              cost_of_revenue = excluded.cost_of_revenue,
              gross_profit = excluded.gross_profit,
              updated_at = CURRENT_TIMESTAMP`,
            [
              m.company_id, 'income_statement', m.period_end, fiscalYear,
              periodType, incomeData,
              null, null, null, null, null, null, null, null,
              m.revenue, m.net_income, m.operating_income, m.cost_of_sales, m.gross_profit,
              null, null, m.shares_outstanding
            ]
          );
          summary.synced++;
        }

        // Create balance sheet record
        if (m.total_assets || m.total_equity || m.total_liabilities) {
          const balanceData = JSON.stringify({
            totalAssets: m.total_assets,
            currentAssets: m.current_assets,
            nonCurrentAssets: m.non_current_assets,
            cashAndEquivalents: m.cash_and_equivalents,
            inventories: m.inventories,
            tradeReceivables: m.trade_receivables,
            totalLiabilities: m.total_liabilities,
            currentLiabilities: m.current_liabilities,
            nonCurrentLiabilities: m.non_current_liabilities,
            totalEquity: m.total_equity,
            retainedEarnings: m.retained_earnings,
            shareCapital: m.share_capital,
            totalDebt: m.total_debt,
            shortTermDebt: m.short_term_debt,
            longTermDebt: m.long_term_debt,
            currency: currency,
            _source: 'xbrl'
          });

          await database.query(
            `INSERT INTO financial_data (
              company_id, statement_type, fiscal_date_ending, fiscal_year,
              period_type, data,
              total_assets, total_liabilities, shareholder_equity,
              current_assets, current_liabilities, cash_and_equivalents,
              long_term_debt, short_term_debt,
              total_revenue, net_income, operating_income, cost_of_revenue, gross_profit,
              operating_cashflow, capital_expenditures, shares_outstanding
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
            DO UPDATE SET
              data = excluded.data,
              total_assets = excluded.total_assets,
              total_liabilities = excluded.total_liabilities,
              shareholder_equity = excluded.shareholder_equity,
              current_assets = excluded.current_assets,
              current_liabilities = excluded.current_liabilities,
              cash_and_equivalents = excluded.cash_and_equivalents,
              long_term_debt = excluded.long_term_debt,
              short_term_debt = excluded.short_term_debt,
              updated_at = CURRENT_TIMESTAMP`,
            [
              m.company_id, 'balance_sheet', m.period_end, fiscalYear,
              periodType, balanceData,
              m.total_assets, m.total_liabilities, m.total_equity,
              m.current_assets, m.current_liabilities, m.cash_and_equivalents,
              m.long_term_debt, m.short_term_debt,
              null, null, null, null, null,
              null, null, m.shares_outstanding
            ]
          );
          summary.synced++;
        }

        // Create cash flow record
        if (m.operating_cash_flow || m.investing_cash_flow || m.financing_cash_flow) {
          const cashFlowData = JSON.stringify({
            operatingCashFlow: m.operating_cash_flow,
            investingCashFlow: m.investing_cash_flow,
            financingCashFlow: m.financing_cash_flow,
            capitalExpenditure: m.capital_expenditure,
            depreciation: m.depreciation_amortization,
            freeCashFlow: m.operating_cash_flow && m.capital_expenditure
              ? m.operating_cash_flow - Math.abs(m.capital_expenditure)
              : null,
            currency: currency,
            _source: 'xbrl'
          });

          await database.query(
            `INSERT INTO financial_data (
              company_id, statement_type, fiscal_date_ending, fiscal_year,
              period_type, data,
              total_assets, total_liabilities, shareholder_equity,
              current_assets, current_liabilities, cash_and_equivalents,
              long_term_debt, short_term_debt,
              total_revenue, net_income, operating_income, cost_of_revenue, gross_profit,
              operating_cashflow, capital_expenditures, shares_outstanding
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
            DO UPDATE SET
              data = excluded.data,
              operating_cashflow = excluded.operating_cashflow,
              capital_expenditures = excluded.capital_expenditures,
              updated_at = CURRENT_TIMESTAMP`,
            [
              m.company_id, 'cash_flow', m.period_end, fiscalYear,
              periodType, cashFlowData,
              null, null, null, null, null, null, null, null,
              null, null, null, null, null,
              m.operating_cash_flow, m.capital_expenditure, null
            ]
          );
          summary.synced++;
        }

      } catch (error) {
        console.error(`Error syncing financial_data for company ${m.company_id}:`, error.message);
        summary.errors++;
      }
    }

    return summary;
  }

  /**
   * Full sync: link companies + sync metrics (synchronous, no ticker resolution)
   * @returns {Promise<Object>} - Combined summary
   */
  async fullSync() {
    console.log('\n📊 Starting full XBRL sync...\n');

    // Step 1: Link all unlinked companies
    console.log('Step 1: Linking XBRL companies to main database...');
    const linkSummary = await this.linkAllUnlinkedCompanies();
    console.log(`   Companies: ${linkSummary.created} created, ${linkSummary.linked} linked, ${linkSummary.errors} errors`);

    // Step 2: Sync metrics
    console.log('\nStep 2: Syncing metrics to calculated_metrics...');
    const metricsSummary = await this.syncMetrics();
    console.log(`   Metrics: ${metricsSummary.synced} synced, ${metricsSummary.skipped} skipped, ${metricsSummary.errors} errors`);

    // Step 3: Sync financial_data (raw financials for API compatibility)
    console.log('\nStep 3: Syncing raw financials to financial_data...');
    const financialDataSummary = await this.syncFinancialData();
    console.log(`   Financial data: ${financialDataSummary.synced} synced, ${financialDataSummary.skipped} skipped, ${financialDataSummary.errors} errors`);

    console.log('\n✅ Full sync complete!\n');

    return {
      companies: linkSummary,
      metrics: metricsSummary,
      financialData: financialDataSummary
    };
  }

  /**
   * Full sync with ticker resolution: resolve tickers → link companies → sync metrics
   * This is the recommended method for scheduled jobs and new data imports
   * @param {Object} options - { tickerLimit, delayMs }
   * @returns {Promise<Object>} - Combined summary
   */
  async fullSyncWithResolution(options = {}) {
    const { tickerLimit = 50, delayMs = 500 } = options;

    console.log('\n📊 Starting full XBRL sync with ticker resolution...\n');

    // Step 1: Resolve tickers for pending companies
    console.log('Step 1: Resolving tickers for pending companies...');
    const tickerSummary = await this.resolvePendingTickers(tickerLimit, delayMs);

    // Step 2: Link all unlinked companies (with any newly resolved tickers)
    console.log('\nStep 2: Linking XBRL companies to main database...');
    const linkSummary = await this.linkAllUnlinkedCompanies();
    console.log(`   Companies: ${linkSummary.created} created, ${linkSummary.linked} linked, ${linkSummary.errors} errors`);

    // Step 3: Sync metrics
    console.log('\nStep 3: Syncing metrics to calculated_metrics...');
    const metricsSummary = await this.syncMetrics();
    console.log(`   Metrics: ${metricsSummary.synced} synced, ${metricsSummary.skipped} skipped, ${metricsSummary.errors} errors`);

    // Step 4: Sync financial_data (raw financials for API compatibility)
    console.log('\nStep 4: Syncing raw financials to financial_data...');
    const financialDataSummary = await this.syncFinancialData();
    console.log(`   Financial data: ${financialDataSummary.synced} synced, ${financialDataSummary.skipped} skipped, ${financialDataSummary.errors} errors`);

    console.log('\n✅ Full sync with resolution complete!\n');

    return {
      tickers: tickerSummary,
      companies: linkSummary,
      metrics: metricsSummary,
      financialData: financialDataSummary
    };
  }

  /**
   * Sync a single company by LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Promise<Object>} - Sync result
   */
  async syncByLEI(lei) {
    const database = await getDatabaseAsync();
    // Get identifier
    const result = await database.query(
      'SELECT * FROM company_identifiers WHERE lei = $1',
      [lei]
    );
    const identifier = result.rows[0];

    if (!identifier) {
      throw new Error(`No identifier found for LEI: ${lei}`);
    }

    // Link company
    const linkResult = await this.linkCompany(identifier);

    // Sync metrics for this identifier
    const metricsResult = await this.syncMetrics(identifier.id);

    return {
      lei,
      companyId: linkResult.companyId,
      created: linkResult.created,
      linked: linkResult.linked,
      metricsSynced: metricsResult.synced
    };
  }

  // ========================================
  // Helpers
  // ========================================

  /**
   * Infer exchange from country code
   * @private
   */
  _inferExchange(country) {
    const exchangeMap = {
      'GB': 'LSE',
      'DE': 'XETRA',
      'FR': 'EPA',
      'NL': 'AMS',
      'ES': 'BME',
      'IT': 'BIT',
      'CH': 'SIX',
      'SE': 'STO',
      'DK': 'CPH',
      'NO': 'OSL',
      'FI': 'HEL',
      'BE': 'EBR',
      'AT': 'VIE',
      'PT': 'ELI',
      'IE': 'ISE',
      'PL': 'WSE',
    };
    return exchangeMap[country] || 'EU';
  }

  /**
   * Get sync statistics
   * @returns {Promise<Object>} - Statistics
   */
  async getStats() {
    const database = await getDatabaseAsync();

    const totalIdentifiersResult = await database.query('SELECT COUNT(*) as count FROM company_identifiers');
    const totalIdentifiers = totalIdentifiersResult.rows[0];

    const linkedIdentifiersResult = await database.query('SELECT COUNT(*) as count FROM company_identifiers WHERE company_id IS NOT NULL');
    const linkedIdentifiers = linkedIdentifiersResult.rows[0];

    const xbrlMetricsResult = await database.query('SELECT COUNT(*) as count FROM xbrl_fundamental_metrics');
    const xbrlMetrics = xbrlMetricsResult.rows[0];

    const calculatedMetricsResult = await database.query('SELECT COUNT(*) as count FROM calculated_metrics');
    const calculatedMetrics = calculatedMetricsResult.rows[0];

    const euCompaniesResult = await database.query(`
      SELECT country, COUNT(*) as count FROM companies
      WHERE country NOT IN ('US', 'USA', 'CA')
      GROUP BY country ORDER BY count DESC LIMIT 10
    `);
    const euCompanies = euCompaniesResult.rows;

    return {
      identifiers: {
        total: parseInt(totalIdentifiers.count),
        linked: parseInt(linkedIdentifiers.count),
        unlinked: parseInt(totalIdentifiers.count) - parseInt(linkedIdentifiers.count)
      },
      metrics: {
        xbrl: parseInt(xbrlMetrics.count),
        calculated: parseInt(calculatedMetrics.count)
      },
      euCompanies
    };
  }
}

module.exports = { XBRLSyncService };
