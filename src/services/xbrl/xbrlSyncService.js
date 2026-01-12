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

const { SymbolResolver } = require('../identifiers/symbolResolver');

class XBRLSyncService {
  constructor(database, options = {}) {
    this.db = database;
    this.options = {
      autoResolveTickers: true,  // Auto-resolve tickers for new companies
      ...options
    };

    // Initialize SymbolResolver for ticker resolution
    try {
      this.symbolResolver = new SymbolResolver(database);
    } catch (error) {
      console.warn('⚠️ SymbolResolver initialization failed, ticker auto-resolution disabled:', error.message);
      this.symbolResolver = null;
    }

    this._prepareStatements();
    console.log('✅ XBRLSyncService initialized');
  }

  /**
   * Prepare SQL statements for performance
   * @private
   */
  _prepareStatements() {
    // Check if company exists by symbol
    this.stmtGetCompanyBySymbol = this.db.prepare(`
      SELECT id, symbol, name, country FROM companies WHERE symbol = ?
    `);

    // Check if company exists by LEI
    this.stmtGetCompanyByLEI = this.db.prepare(`
      SELECT id, symbol, name, country FROM companies WHERE lei = ?
    `);

    // Insert new company
    this.stmtInsertCompany = this.db.prepare(`
      INSERT INTO companies (symbol, name, sector, industry, exchange, country, lei, isin, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    // Update company with LEI/ISIN
    this.stmtUpdateCompanyIdentifiers = this.db.prepare(`
      UPDATE companies SET
        lei = COALESCE(?, lei),
        isin = COALESCE(?, isin),
        country = COALESCE(?, country),
        last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Link company_identifiers to companies
    this.stmtLinkIdentifier = this.db.prepare(`
      UPDATE company_identifiers SET company_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    // Get unlinked identifiers
    this.stmtGetUnlinkedIdentifiers = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE company_id IS NULL
    `);

    // Update company_identifiers with resolved ticker
    this.stmtUpdateIdentifierTicker = this.db.prepare(`
      UPDATE company_identifiers
      SET ticker = ?, yahoo_symbol = ?, figi = ?, isin = COALESCE(?, isin),
          link_status = 'linked', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Get pending identifiers (need ticker resolution)
    this.stmtGetPendingIdentifiers = this.db.prepare(`
      SELECT * FROM company_identifiers
      WHERE link_status = 'pending'
      AND lei IS NOT NULL AND lei != ''
      AND (ticker IS NULL OR ticker = '')
      ORDER BY created_at DESC
      LIMIT ?
    `);

    // Check existing calculated_metrics
    this.stmtGetCalculatedMetric = this.db.prepare(`
      SELECT id FROM calculated_metrics WHERE company_id = ? AND fiscal_period = ? AND period_type = ?
    `);

    // Get XBRL metrics for syncing
    this.stmtGetXBRLMetrics = this.db.prepare(`
      SELECT xfm.*, ci.company_id
      FROM xbrl_fundamental_metrics xfm
      JOIN company_identifiers ci ON xfm.identifier_id = ci.id
      WHERE ci.company_id IS NOT NULL
      ORDER BY xfm.period_end DESC
    `);
  }

  // ========================================
  // Company Linking
  // ========================================

  /**
   * Link XBRL company to main companies table
   * Creates new company if doesn't exist, or links to existing
   * @param {Object} identifier - Record from company_identifiers
   * @returns {Object} - { companyId, created, linked }
   */
  linkCompany(identifier) {
    const { id: identifierId, lei, ticker, yahoo_symbol, legal_name, country, exchange, isin } = identifier;

    // Try to find existing company
    let company = null;
    const symbol = ticker || yahoo_symbol;

    // First try by LEI (most reliable)
    if (lei) {
      company = this.stmtGetCompanyByLEI.get(lei);
    }

    // Then try by symbol
    if (!company && symbol) {
      company = this.stmtGetCompanyBySymbol.get(symbol);
    }

    if (company) {
      // Update existing company with identifiers if missing
      this.stmtUpdateCompanyIdentifiers.run(lei, isin, country, company.id);
      // Link the identifier
      this.stmtLinkIdentifier.run(company.id, identifierId);

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
      const result = this.stmtInsertCompany.run(
        effectiveSymbol,
        legal_name || effectiveSymbol,
        null, // sector - will be enriched later
        null, // industry
        exchange || this._inferExchange(country),
        country || 'EU',
        lei,
        isin
      );

      const companyId = result.lastInsertRowid;

      // Link the identifier
      this.stmtLinkIdentifier.run(companyId, identifierId);

      return { companyId, created: true, linked: true };
    } catch (error) {
      // Handle unique constraint violation (symbol already exists)
      if (error.message.includes('UNIQUE constraint failed')) {
        const existing = this.stmtGetCompanyBySymbol.get(effectiveSymbol);
        if (existing) {
          this.stmtLinkIdentifier.run(existing.id, identifierId);
          return { companyId: existing.id, created: false, linked: true };
        }
      }
      throw error;
    }
  }

  /**
   * Link all unlinked XBRL companies to main companies table
   * @returns {Object} - Summary { processed, created, linked, errors }
   */
  linkAllUnlinkedCompanies() {
    const unlinked = this.stmtGetUnlinkedIdentifiers.all();
    console.log(`Found ${unlinked.length} unlinked XBRL companies`);

    const summary = { processed: 0, created: 0, linked: 0, errors: 0 };

    for (const identifier of unlinked) {
      try {
        const result = this.linkCompany(identifier);
        summary.processed++;
        if (result.created) summary.created++;
        if (result.linked) summary.linked++;
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

    const { id, lei, legal_name } = identifier;

    if (!lei) {
      return { resolved: false, error: 'No LEI available' };
    }

    try {
      const result = await this.symbolResolver.resolveFromLEI(lei);

      if (result && result.primaryListing) {
        const { ticker, yahooSymbol, figi, isin } = result.primaryListing;

        // Update company_identifiers with resolved data
        this.stmtUpdateIdentifierTicker.run(
          ticker,
          yahooSymbol,
          figi || null,
          isin || null,
          id
        );

        console.log(`  ✓ Resolved ${legal_name?.substring(0, 30) || lei} → ${yahooSymbol}`);

        return {
          resolved: true,
          ticker,
          yahooSymbol,
          figi,
          isin,
          companyName: result.companyName
        };
      } else if (result && result.listings && result.listings.length > 0) {
        // Use first available listing if no primary
        const listing = result.listings[0];

        this.stmtUpdateIdentifierTicker.run(
          listing.ticker,
          listing.yahooSymbol,
          listing.figi || null,
          listing.isin || null,
          id
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

    const pending = this.stmtGetPendingIdentifiers.all(limit);
    console.log(`\n🔍 Resolving tickers for ${pending.length} pending companies...`);

    const summary = { processed: 0, resolved: 0, failed: 0 };

    for (const identifier of pending) {
      const result = await this.resolveTickerForIdentifier(identifier);
      summary.processed++;

      if (result.resolved) {
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

    const unlinked = this.stmtGetUnlinkedIdentifiers.all();
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

        const result = await this.linkCompanyWithResolution(identifier, shouldResolve);

        summary.processed++;
        if (result.created) summary.created++;
        if (result.linked) summary.linked++;
        if (result.tickerResolved) {
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
   * @returns {Object} - Summary { synced, skipped, errors }
   */
  syncMetrics(identifierId = null) {
    let metrics;

    if (identifierId) {
      metrics = this.db.prepare(`
        SELECT xfm.*, ci.company_id
        FROM xbrl_fundamental_metrics xfm
        JOIN company_identifiers ci ON xfm.identifier_id = ci.id
        WHERE xfm.identifier_id = ? AND ci.company_id IS NOT NULL
        ORDER BY xfm.period_end DESC
      `).all(identifierId);
    } else {
      metrics = this.stmtGetXBRLMetrics.all();
    }

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

    const insertOrUpdate = this.db.prepare(`
      INSERT INTO calculated_metrics (
        company_id, fiscal_period, period_type, data_source,
        -- Profitability
        roic, roe, roa, gross_margin, operating_margin, net_margin,
        -- Cash Flow
        fcf, fcf_yield, fcf_margin, fcf_per_share,
        -- Financial Health
        debt_to_equity, debt_to_assets, current_ratio, quick_ratio, interest_coverage,
        -- Efficiency
        asset_turnover,
        -- Growth
        revenue_growth_yoy, earnings_growth_yoy, fcf_growth_yoy,
        -- Valuation (will be calculated with price data)
        pe_ratio, pb_ratio,
        -- Other
        data_quality_score
      )
      VALUES (?, ?, ?, 'xbrl', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, fiscal_period, period_type)
      DO UPDATE SET
        data_source = 'xbrl',
        roic = excluded.roic,
        roe = excluded.roe,
        roa = excluded.roa,
        gross_margin = excluded.gross_margin,
        operating_margin = excluded.operating_margin,
        net_margin = excluded.net_margin,
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
        data_quality_score = excluded.data_quality_score
    `);

    for (const m of metrics) {
      if (!m.company_id) {
        summary.skipped++;
        continue;
      }

      try {
        // Data quality: cap extreme ratios at reasonable bounds
        // Extreme values typically indicate data issues (negative equity, tiny denominators)
        const capRatio = (value, min = -2, max = 2) => {
          if (value === null || value === undefined) return null;
          if (value < min || value > max) return null; // Treat extreme values as unreliable
          return value;
        };

        // Apply caps to ratios (allow -200% to +200%)
        const cappedROE = capRatio(m.roe);
        const cappedROIC = capRatio(m.roic);
        const cappedROA = capRatio(m.roa);
        const cappedGrossMargin = capRatio(m.gross_margin, -1, 1);
        const cappedOpMargin = capRatio(m.operating_margin, -5, 1); // Allow larger losses
        const cappedNetMargin = capRatio(m.net_margin, -5, 1);

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

        // Calculate FCF yield and FCF margin
        const fcfYield = calculatedFCF && m.total_equity && m.total_equity > 0
          ? capRatio(calculatedFCF / m.total_equity)
          : null;
        const fcfMargin = calculatedFCF && m.revenue
          ? capRatio(calculatedFCF / m.revenue, -2, 1)
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

        // Calculate YoY growth rates
        let revenueGrowthYoY = null;
        let earningsGrowthYoY = null;
        let fcfGrowthYoY = null;

        if (priorYear) {
          if (m.revenue && priorYear.revenue && priorYear.revenue !== 0) {
            revenueGrowthYoY = (m.revenue - priorYear.revenue) / Math.abs(priorYear.revenue);
          }
          if (m.net_income && priorYear.net_income && priorYear.net_income !== 0) {
            earningsGrowthYoY = (m.net_income - priorYear.net_income) / Math.abs(priorYear.net_income);
          }
          // Use calculatedFCF for growth calculations too
          const priorFCF = priorYear?.free_cash_flow ||
            (priorYear?.operating_cash_flow && priorYear?.capital_expenditure
              ? priorYear.operating_cash_flow - Math.abs(priorYear.capital_expenditure)
              : (priorYear?.operating_cash_flow && priorYear?.investing_cash_flow
                ? priorYear.operating_cash_flow + priorYear.investing_cash_flow
                : null));
          if (calculatedFCF && priorFCF && priorFCF !== 0) {
            fcfGrowthYoY = (calculatedFCF - priorFCF) / Math.abs(priorFCF);
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

        insertOrUpdate.run(
          m.company_id,
          m.period_end,
          m.period_type || 'annual',
          // Profitability (using capped values)
          cappedROIC,
          cappedROE,
          cappedROA,
          cappedGrossMargin,
          cappedOpMargin,
          cappedNetMargin,
          // Cash Flow (using calculated FCF)
          calculatedFCF,
          fcfYield,
          fcfMargin,
          fcfPerShare,
          // Financial Health (using calculated debt/equity)
          calculatedDebtToEquity,
          m.debt_to_assets,
          m.current_ratio,
          m.quick_ratio,
          m.interest_coverage,
          // Efficiency
          m.asset_turnover,
          // Growth
          revenueGrowthYoY,
          earningsGrowthYoY,
          fcfGrowthYoY,
          // Valuation (PE and PB require price data)
          null, // pe_ratio
          null, // pb_ratio
          // Quality (use calculated score)
          qualityScore
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
   * Full sync: link companies + sync metrics (synchronous, no ticker resolution)
   * @returns {Object} - Combined summary
   */
  fullSync() {
    console.log('\n📊 Starting full XBRL sync...\n');

    // Step 1: Link all unlinked companies
    console.log('Step 1: Linking XBRL companies to main database...');
    const linkSummary = this.linkAllUnlinkedCompanies();
    console.log(`   Companies: ${linkSummary.created} created, ${linkSummary.linked} linked, ${linkSummary.errors} errors`);

    // Step 2: Sync metrics
    console.log('\nStep 2: Syncing metrics to calculated_metrics...');
    const metricsSummary = this.syncMetrics();
    console.log(`   Metrics: ${metricsSummary.synced} synced, ${metricsSummary.skipped} skipped, ${metricsSummary.errors} errors`);

    console.log('\n✅ Full sync complete!\n');

    return {
      companies: linkSummary,
      metrics: metricsSummary
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
    const linkSummary = this.linkAllUnlinkedCompanies();
    console.log(`   Companies: ${linkSummary.created} created, ${linkSummary.linked} linked, ${linkSummary.errors} errors`);

    // Step 3: Sync metrics
    console.log('\nStep 3: Syncing metrics to calculated_metrics...');
    const metricsSummary = this.syncMetrics();
    console.log(`   Metrics: ${metricsSummary.synced} synced, ${metricsSummary.skipped} skipped, ${metricsSummary.errors} errors`);

    console.log('\n✅ Full sync with resolution complete!\n');

    return {
      tickers: tickerSummary,
      companies: linkSummary,
      metrics: metricsSummary
    };
  }

  /**
   * Sync a single company by LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Object} - Sync result
   */
  async syncByLEI(lei) {
    // Get identifier
    const identifier = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE lei = ?
    `).get(lei);

    if (!identifier) {
      throw new Error(`No identifier found for LEI: ${lei}`);
    }

    // Link company
    const linkResult = this.linkCompany(identifier);

    // Sync metrics for this identifier
    const metricsResult = this.syncMetrics(identifier.id);

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
   * @returns {Object} - Statistics
   */
  getStats() {
    const totalIdentifiers = this.db.prepare('SELECT COUNT(*) as count FROM company_identifiers').get();
    const linkedIdentifiers = this.db.prepare('SELECT COUNT(*) as count FROM company_identifiers WHERE company_id IS NOT NULL').get();
    const xbrlMetrics = this.db.prepare('SELECT COUNT(*) as count FROM xbrl_fundamental_metrics').get();
    const calculatedMetrics = this.db.prepare('SELECT COUNT(*) as count FROM calculated_metrics').get();

    const euCompanies = this.db.prepare(`
      SELECT country, COUNT(*) as count FROM companies
      WHERE country NOT IN ('US', 'USA', 'CA')
      GROUP BY country ORDER BY count DESC LIMIT 10
    `).all();

    return {
      identifiers: {
        total: totalIdentifiers.count,
        linked: linkedIdentifiers.count,
        unlinked: totalIdentifiers.count - linkedIdentifiers.count
      },
      metrics: {
        xbrl: xbrlMetrics.count,
        calculated: calculatedMetrics.count
      },
      euCompanies
    };
  }
}

module.exports = { XBRLSyncService };
