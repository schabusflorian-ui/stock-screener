// src/services/providers/xbrlProvider.js

/**
 * XBRL Provider
 *
 * Wrapper for XBRL data infrastructure (Agent 10) with consistent interface.
 * Provides access to EU/UK fundamental data from filings.xbrl.org and Companies House.
 *
 * This provider integrates with:
 * - FundamentalStore: Database access for stored XBRL data
 * - XBRLFilingsClient: Fetch filings from filings.xbrl.org
 * - XBRLParser: Parse xBRL-JSON into normalized financials
 */

const { FundamentalStore } = require('../xbrl/fundamentalStore');
const { XBRLFilingsClient } = require('../xbrl/xbrlFilingsClient');
const { XBRLParser } = require('../xbrl/xbrlParser');

class XBRLProvider {
  constructor(database) {
    this.db = database;
    this.store = new FundamentalStore(database);
    this.client = new XBRLFilingsClient();
    this.parser = new XBRLParser();

    console.log('   XBRLProvider initialized');
  }

  /**
   * Get fundamentals for a resolved identifier
   * @param {Object} resolved - Resolved identifier from DataRouter
   * @returns {Object} - Normalized fundamentals data
   */
  async getFundamentals(resolved) {
    const identifierId = await this._getIdentifierId(resolved);
    if (!identifierId) {
      return null;
    }

    const metrics = this.store.getMetricsByIdentifier(identifierId);
    if (!metrics || metrics.length === 0) {
      return null;
    }

    return {
      incomeStatement: this._buildIncomeStatement(metrics),
      balanceSheet: this._buildBalanceSheet(metrics),
      cashFlow: this._buildCashFlow(metrics),
    };
  }

  /**
   * Get income statement data
   * @param {Object} resolved - Resolved identifier
   * @returns {Object} - Income statement with annual/quarterly data
   */
  async getIncomeStatement(resolved) {
    const identifierId = await this._getIdentifierId(resolved);
    if (!identifierId) return null;

    const metrics = this.store.getMetricsByIdentifier(identifierId);
    return this._buildIncomeStatement(metrics);
  }

  /**
   * Get balance sheet data
   * @param {Object} resolved - Resolved identifier
   * @returns {Object} - Balance sheet with annual/quarterly data
   */
  async getBalanceSheet(resolved) {
    const identifierId = await this._getIdentifierId(resolved);
    if (!identifierId) return null;

    const metrics = this.store.getMetricsByIdentifier(identifierId);
    return this._buildBalanceSheet(metrics);
  }

  /**
   * Get cash flow statement data
   * @param {Object} resolved - Resolved identifier
   * @returns {Object} - Cash flow with annual/quarterly data
   */
  async getCashFlow(resolved) {
    const identifierId = await this._getIdentifierId(resolved);
    if (!identifierId) return null;

    const metrics = this.store.getMetricsByIdentifier(identifierId);
    return this._buildCashFlow(metrics);
  }

  /**
   * Get company profile/overview
   * @param {Object} resolved - Resolved identifier
   * @returns {Object} - Company profile data
   */
  async getCompanyProfile(resolved) {
    const identifierId = await this._getIdentifierId(resolved);
    if (!identifierId) return null;

    // Get identifier info
    let identifier;
    if (resolved.lei) {
      identifier = this.store.getIdentifierByLEI(resolved.lei);
    } else if (resolved.ticker && resolved.exchange) {
      identifier = this.store.getIdentifierByTicker(resolved.ticker, resolved.exchange);
    }

    if (!identifier) return null;

    // Get latest metrics for financial summary
    const latestMetrics = this.store.getLatestMetrics(identifierId);

    return {
      symbol: identifier.ticker || identifier.yahoo_symbol,
      name: identifier.legal_name || identifier.company_name,
      lei: identifier.lei,
      isin: identifier.isin,
      country: identifier.country,
      exchange: identifier.exchange,
      currency: latestMetrics?.currency || 'EUR',
      dataSource: 'xbrl',
      // Latest financial summary
      latestPeriod: latestMetrics?.period_end,
      revenue: latestMetrics?.revenue,
      netIncome: latestMetrics?.net_income,
      totalAssets: latestMetrics?.total_assets,
      totalEquity: latestMetrics?.total_equity,
      // Latest ratios
      grossMargin: latestMetrics?.gross_margin,
      operatingMargin: latestMetrics?.operating_margin,
      netMargin: latestMetrics?.net_margin,
      roe: latestMetrics?.roe,
      roa: latestMetrics?.roa,
      roic: latestMetrics?.roic,
    };
  }

  /**
   * Search companies in XBRL database
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} - Matching companies
   */
  async searchCompanies(query, options = {}) {
    const limit = options.limit || 50;
    const results = this.store.searchIdentifiers(query, limit);

    return results.map(r => ({
      symbol: r.ticker || r.yahoo_symbol,
      name: r.legal_name || r.company_name,
      country: r.country,
      exchange: r.exchange,
      lei: r.lei,
      isin: r.isin,
      type: 'equity',
      source: 'xbrl',
    }));
  }

  /**
   * Get companies by country
   * @param {string} countryCode - ISO country code
   * @param {Object} options - Options
   * @returns {Array} - Companies in the country
   */
  async getCompaniesByCountry(countryCode, options = {}) {
    const limit = options.limit || 100;
    const identifiers = this.store.getIdentifiersByCountry(countryCode, limit);

    return identifiers.map(r => ({
      symbol: r.ticker || r.yahoo_symbol,
      name: r.legal_name || r.company_name,
      country: r.country,
      exchange: r.exchange,
      lei: r.lei,
      identifierId: r.id,
    }));
  }

  /**
   * Fetch and parse fresh data from filings.xbrl.org
   * @param {string} lei - Legal Entity Identifier
   * @returns {Object} - Freshly fetched and parsed data
   */
  async fetchFreshData(lei) {
    if (!lei || lei.length !== 20) {
      throw new Error('Valid 20-character LEI is required');
    }

    // Fetch filings from API
    const filings = await this.client.getFilingsByLEI(lei);

    if (!filings || filings.length === 0) {
      return null;
    }

    // Get the most recent filing
    const latestFiling = filings[0];

    // Store filing metadata
    const storedFiling = this.store.storeFiling(latestFiling);

    // Fetch and parse xBRL-JSON
    try {
      const xbrlJson = await this.client.getXBRLJson(latestFiling.hash);
      const parsed = this.parser.parseXBRLJson(xbrlJson);
      const flatRecord = this.parser.toFlatRecord(parsed);

      if (flatRecord && storedFiling.identifierId) {
        // Store metrics
        this.store.storeMetrics(flatRecord, storedFiling.identifierId, storedFiling.id);
        this.store.markFilingParsed(storedFiling.id, true);
      }

      return {
        filing: storedFiling,
        metrics: flatRecord,
        parseStats: parsed.parseStats,
      };
    } catch (error) {
      this.store.markFilingParsed(storedFiling.id, false, error.message);
      throw error;
    }
  }

  /**
   * Get statistics about XBRL data coverage
   * @returns {Object} - Statistics
   */
  getStats() {
    return this.store.getStats();
  }

  // ========================================
  // Private helper methods
  // ========================================

  /**
   * Get identifier ID from resolved object
   * @private
   */
  async _getIdentifierId(resolved) {
    // Direct identifier ID
    if (resolved.identifierId) {
      return resolved.identifierId;
    }

    // Look up by LEI
    if (resolved.lei) {
      const identifier = this.store.getIdentifierByLEI(resolved.lei);
      return identifier?.id;
    }

    // Look up by ticker/exchange
    if (resolved.ticker && resolved.exchange) {
      const identifier = this.store.getIdentifierByTicker(resolved.ticker, resolved.exchange);
      return identifier?.id;
    }

    // Look up by company_id in the main companies table
    if (resolved.companyId) {
      const stmt = this.db.prepare(`
        SELECT id FROM company_identifiers WHERE company_id = ? LIMIT 1
      `);
      const result = stmt.get(resolved.companyId);
      return result?.id;
    }

    return null;
  }

  /**
   * Build income statement from metrics array
   * @private
   */
  _buildIncomeStatement(metrics) {
    if (!metrics || metrics.length === 0) return null;

    const annual = metrics
      .filter(m => m.period_type === 'annual')
      .map(m => ({
        fiscalDateEnding: m.period_end,
        currency: m.currency,
        revenue: m.revenue,
        costOfSales: m.cost_of_sales,
        grossProfit: m.gross_profit,
        operatingIncome: m.operating_income,
        ebitda: m.ebitda,
        interestExpense: m.interest_expense,
        interestIncome: m.interest_income,
        profitBeforeTax: m.profit_before_tax,
        incomeTaxExpense: m.income_tax_expense,
        netIncome: m.net_income,
        epsBasic: m.eps_basic,
        epsDiluted: m.eps_diluted,
        sharesOutstanding: m.shares_outstanding,
        dividendsPerShare: m.dividends_per_share,
      }));

    const quarterly = metrics
      .filter(m => m.period_type === 'quarterly')
      .map(m => ({
        fiscalDateEnding: m.period_end,
        currency: m.currency,
        revenue: m.revenue,
        grossProfit: m.gross_profit,
        operatingIncome: m.operating_income,
        netIncome: m.net_income,
      }));

    return {
      annual,
      quarterly,
      latestAnnual: annual[0] || null,
      _source: 'xbrl',
    };
  }

  /**
   * Build balance sheet from metrics array
   * @private
   */
  _buildBalanceSheet(metrics) {
    if (!metrics || metrics.length === 0) return null;

    const annual = metrics
      .filter(m => m.period_type === 'annual')
      .map(m => ({
        fiscalDateEnding: m.period_end,
        currency: m.currency,
        totalAssets: m.total_assets,
        currentAssets: m.current_assets,
        nonCurrentAssets: m.non_current_assets,
        cashAndEquivalents: m.cash_and_equivalents,
        inventories: m.inventories,
        tradeReceivables: m.trade_receivables,
        totalLiabilities: m.total_liabilities,
        currentLiabilities: m.current_liabilities,
        nonCurrentLiabilities: m.non_current_liabilities,
        tradePayables: m.trade_payables,
        totalDebt: m.total_debt,
        shortTermDebt: m.short_term_debt,
        longTermDebt: m.long_term_debt,
        totalEquity: m.total_equity,
        retainedEarnings: m.retained_earnings,
        shareCapital: m.share_capital,
      }));

    const quarterly = metrics
      .filter(m => m.period_type === 'quarterly')
      .map(m => ({
        fiscalDateEnding: m.period_end,
        currency: m.currency,
        totalAssets: m.total_assets,
        currentAssets: m.current_assets,
        totalLiabilities: m.total_liabilities,
        currentLiabilities: m.current_liabilities,
        totalEquity: m.total_equity,
      }));

    return {
      annual,
      quarterly,
      latestAnnual: annual[0] || null,
      _source: 'xbrl',
    };
  }

  /**
   * Build cash flow statement from metrics array
   * @private
   */
  _buildCashFlow(metrics) {
    if (!metrics || metrics.length === 0) return null;

    const annual = metrics
      .filter(m => m.period_type === 'annual')
      .map(m => ({
        fiscalDateEnding: m.period_end,
        currency: m.currency,
        operatingCashFlow: m.operating_cash_flow,
        investingCashFlow: m.investing_cash_flow,
        financingCashFlow: m.financing_cash_flow,
        capitalExpenditure: m.capital_expenditure,
        depreciationAmortization: m.depreciation_amortization,
        freeCashFlow: m.free_cash_flow,
        dividendsPaid: m.dividends_paid,
        shareRepurchases: m.share_repurchases,
      }));

    const quarterly = metrics
      .filter(m => m.period_type === 'quarterly')
      .map(m => ({
        fiscalDateEnding: m.period_end,
        operatingCashFlow: m.operating_cash_flow,
        freeCashFlow: m.free_cash_flow,
      }));

    return {
      annual,
      quarterly,
      latestAnnual: annual[0] || null,
      _source: 'xbrl',
    };
  }
}

module.exports = { XBRLProvider };
