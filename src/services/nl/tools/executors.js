/**
 * Tool Executors for Claude API tool calling
 *
 * Each executor implements the logic to fetch data from our database
 * and return it in a format Claude can use to answer questions.
 */

const { getDatabaseAsync } = require('../../../lib/db');

class ToolExecutor {
  constructor() {
    // Cache of valid symbols for validation
    this._symbolCache = null;
    this._symbolCacheTime = 0;
  }

  async getDb() {
    return getDatabaseAsync();
  }

  async _query(sql, params = []) {
    const database = await this.getDb();
    const result = await database.query(sql, params);
    return Array.isArray(result.rows) ? result.rows : [];
  }

  async _queryOne(sql, params = []) {
    const rows = await this._query(sql, params);
    return rows[0] || null;
  }

  /**
   * Get cached list of valid symbols (refreshes every 5 minutes)
   */
  async getValidSymbols() {
    const now = Date.now();
    if (!this._symbolCache || (now - this._symbolCacheTime) > 300000) {
      const symbols = await this._query('SELECT symbol FROM companies WHERE is_active = 1');
      this._symbolCache = new Set(symbols.map(s => s.symbol.toUpperCase()));
      this._symbolCacheTime = now;
      console.log(`[ToolExecutor] Symbol cache refreshed: ${this._symbolCache.size} valid symbols`);
    }
    return this._symbolCache;
  }

  /**
   * Validate a stock symbol exists in our database
   * Returns { valid: boolean, suggestion?: string, error?: string }
   */
  async validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      return { valid: false, error: 'Symbol is required' };
    }

    const normalized = symbol.toUpperCase().trim();

    // Basic format validation - US stock symbols are 1-5 uppercase letters
    if (!/^[A-Z]{1,5}$/.test(normalized)) {
      return {
        valid: false,
        error: `Invalid symbol format: "${symbol}". Stock symbols should be 1-5 letters (e.g., AAPL, NVDA, MSFT).`
      };
    }

    const validSymbols = await this.getValidSymbols();

    if (validSymbols.has(normalized)) {
      return { valid: true };
    }

    // Find similar symbols for suggestion
    const suggestions = [];
    for (const valid of validSymbols) {
      if (valid.startsWith(normalized.slice(0, 2)) ||
          this.levenshteinDistance(valid, normalized) <= 2) {
        suggestions.push(valid);
        if (suggestions.length >= 3) break;
      }
    }

    return {
      valid: false,
      error: `Symbol "${normalized}" not found in database.`,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }

  /**
   * Simple Levenshtein distance for symbol suggestions
   */
  levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Main dispatch method - routes tool calls to specific executors
   */
  async execute(toolName, input) {
    console.log(`[ToolExecutor] Executing tool: ${toolName}`, JSON.stringify(input).slice(0, 200));

    try {
      switch (toolName) {
        case 'lookup_company_metrics':
          return await this.lookupCompanyMetrics(input);
        case 'get_risk_metrics':
          return await this.getRiskMetrics(input);
        case 'screen_stocks':
          return await this.screenStocks(input);
        case 'get_price_history':
          return await this.getPriceHistory(input);
        case 'calculate_metric':
          return await this.calculateMetric(input);
        case 'get_sentiment':
          return await this.getSentiment(input);
        case 'get_investor_holdings':
          return await this.getInvestorHoldings(input);
        case 'get_financial_statements':
          return await this.getFinancialStatements(input);
        case 'get_macro_data':
          return await this.getMacroData(input);
        case 'compare_companies':
          return await this.compareCompanies(input);
        case 'get_valuation_models':
          return await this.getValuationModels(input);
        case 'get_market_index':
          return await this.getMarketIndex(input);
        case 'get_market_sentiment':
          return await this.getMarketSentiment(input);
        case 'get_portfolio':
          return await this.getPortfolio(input);
        case 'get_congressional_trades':
          return await this.getCongressionalTrades(input);
        case 'get_insider_activity':
          return await this.getInsiderActivity(input);
        case 'get_technical_signals':
          return await this.getTechnicalSignals(input);
        case 'get_earnings_calendar':
          return await this.getEarningsCalendar(input);
        case 'get_short_interest':
          return await this.getShortInterest(input);
        case 'get_data_methodology':
          return await this.getDataMethodology(input);
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      console.error(`[ToolExecutor] Error executing ${toolName}:`, error);
      return { error: error.message };
    }
  }

  // ============================================
  // Tool: lookup_company_metrics
  // ============================================
  async lookupCompanyMetrics({ symbol, metrics }) {
    // Validate symbol before querying database
    const validation = await this.validateSymbol(symbol);
    if (!validation.valid) {
      return {
        error: validation.error,
        suggestions: validation.suggestions,
        hint: 'Please use a valid US stock ticker symbol like AAPL, MSFT, NVDA, etc.'
      };
    }

    const normalizedSymbol = symbol.toUpperCase();

    // Get company info and latest metrics
    const result = await this._queryOne(`
      SELECT
        c.id, c.symbol, c.name, c.sector, c.industry, c.market_cap, c.description,
        m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda, m.peg_ratio,
        m.roe, m.roa, m.roic, m.roce,
        m.gross_margin, m.operating_margin, m.net_margin,
        m.fcf, m.fcf_yield, m.fcf_margin,
        m.debt_to_equity, m.debt_to_assets, m.current_ratio, m.quick_ratio, m.interest_coverage,
        m.revenue_growth_yoy, m.earnings_growth_yoy, m.fcf_growth_yoy,
        m.fiscal_period, m.data_quality_score,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price,
        (SELECT date FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as price_date
      FROM companies c
      LEFT JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.symbol = ? AND c.is_active = 1
      ORDER BY m.fiscal_period DESC
      LIMIT 1
    `, [normalizedSymbol]);

    if (!result) {
      return { error: `No data found for symbol ${normalizedSymbol}` };
    }

    // Get analyst estimates if available
    const analystData = await this._queryOne(`
      SELECT target_mean, target_high, target_low, recommendation_key,
             upside_potential, strong_buy, buy, hold, sell, strong_sell
      FROM analyst_estimates
      WHERE company_id = ?
    `, [result.id]);

    // Filter to specific metrics if requested
    let metricsData = { ...result };
    if (metrics && metrics.length > 0) {
      metricsData = { symbol: result.symbol, name: result.name };
      for (const m of metrics) {
        if (result[m] !== undefined) {
          metricsData[m] = result[m];
        }
      }
    }

    // Clean up nulls and format response
    const response = {
      symbol: result.symbol,
      name: result.name,
      sector: result.sector,
      industry: result.industry,
      current_price: result.current_price,
      price_date: result.price_date,
      market_cap: result.market_cap,
      data_as_of: result.fiscal_period,
      metrics: this.cleanNulls(metricsData)
    };

    if (analystData) {
      response.analyst_data = this.cleanNulls(analystData);
    }

    return response;
  }

  // ============================================
  // Tool: screen_stocks
  // ============================================
  async screenStocks({ filters = [], sector, sort_by, sort_direction = 'desc', limit = 20 }) {
    const whereClauses = ['c.is_active = 1'];
    const params = [];

    // Apply sector filter
    if (sector) {
      whereClauses.push('c.sector = ?');
      params.push(sector);
    }

    // Apply metric filters
    for (const filter of filters) {
      const { field, operator, value, value2 } = filter;

      // Validate field to prevent SQL injection
      const validFields = [
        'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda', 'peg_ratio',
        'roe', 'roa', 'roic', 'roce',
        'gross_margin', 'operating_margin', 'net_margin',
        'fcf_yield', 'fcf_margin',
        'debt_to_equity', 'debt_to_assets', 'current_ratio', 'interest_coverage',
        'revenue_growth_yoy', 'earnings_growth_yoy', 'market_cap', 'dividend_yield'
      ];

      if (!validFields.includes(field)) continue;

      // Map field to column (most are in calculated_metrics as 'm.')
      const column = ['market_cap'].includes(field) ? `c.${field}` : `m.${field}`;

      switch (operator) {
        case '>':
          whereClauses.push(`${column} > ?`);
          params.push(value);
          break;
        case '<':
          whereClauses.push(`${column} < ?`);
          params.push(value);
          break;
        case '>=':
          whereClauses.push(`${column} >= ?`);
          params.push(value);
          break;
        case '<=':
          whereClauses.push(`${column} <= ?`);
          params.push(value);
          break;
        case '=':
          whereClauses.push(`${column} = ?`);
          params.push(value);
          break;
        case 'between':
          whereClauses.push(`${column} BETWEEN ? AND ?`);
          params.push(value, value2);
          break;
      }
    }

    // Determine sort column
    const validSortFields = ['pe_ratio', 'pb_ratio', 'roic', 'roe', 'market_cap', 'revenue_growth_yoy', 'fcf_yield', 'dividend_yield', 'debt_to_equity'];
    let orderBy = 'm.roic DESC'; // Default sort by ROIC
    if (sort_by && validSortFields.includes(sort_by)) {
      const sortCol = ['market_cap'].includes(sort_by) ? `c.${sort_by}` : `m.${sort_by}`;
      const dir = sort_direction === 'asc' ? 'ASC' : 'DESC';
      orderBy = `${sortCol} ${dir}`;
    }

    // Limit results
    const safeLimit = Math.min(Math.max(1, limit || 20), 50);

    const sql = `
      SELECT
        c.symbol, c.name, c.sector, c.industry, c.market_cap,
        m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
        m.roe, m.roic, m.gross_margin, m.net_margin,
        m.revenue_growth_yoy, m.debt_to_equity, m.fcf_yield, m.dividend_yield,
        m.fiscal_period,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
      FROM companies c
      JOIN calculated_metrics m ON c.id = m.company_id
      WHERE ${whereClauses.join(' AND ')}
        AND m.fiscal_period = (
          SELECT MAX(fiscal_period) FROM calculated_metrics WHERE company_id = c.id
        )
      ORDER BY ${orderBy}
      LIMIT ?
    `;

    params.push(safeLimit);

    const results = await this._query(sql, params);

    return {
      count: results.length,
      filters_applied: filters.length + (sector ? 1 : 0),
      sector: sector || 'all',
      stocks: results.map(r => this.cleanNulls(r))
    };
  }

  // ============================================
  // Tool: get_price_history
  // ============================================
  async getPriceHistory({ symbol, days = 90, include_technicals = false }) {
    // Validate symbol before querying database
    const validation = await this.validateSymbol(symbol);
    if (!validation.valid) {
      return {
        error: validation.error,
        suggestions: validation.suggestions,
        hint: 'Please use a valid US stock ticker symbol like AAPL, MSFT, NVDA, etc.'
      };
    }

    const normalizedSymbol = symbol.toUpperCase();
    const safeDays = Math.min(Math.max(1, days), 365);

    const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const prices = await this._query(`
      SELECT date, open, high, low, close, volume
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT ?
    `, [company.id, safeDays]);

    if (prices.length === 0) {
      return { error: `No price data found for ${normalizedSymbol}` };
    }

    // Reverse to chronological order
    prices.reverse();

    // Calculate basic stats
    const latestPrice = prices[prices.length - 1].close;
    const oldestPrice = prices[0].close;
    const periodReturn = ((latestPrice / oldestPrice) - 1) * 100;

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      period_days: prices.length,
      latest_price: latestPrice,
      period_return_pct: Math.round(periodReturn * 100) / 100,
      high_52w: Math.max(...prices.map(p => p.high)),
      low_52w: Math.min(...prices.map(p => p.low)),
      avg_volume: Math.round(prices.reduce((sum, p) => sum + (p.volume || 0), 0) / prices.length)
    };

    if (include_technicals) {
      // Calculate simple technicals
      const closes = prices.map(p => p.close);

      // 20-day SMA
      if (closes.length >= 20) {
        const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        response.sma_20 = Math.round(sma20 * 100) / 100;
      }

      // 50-day SMA
      if (closes.length >= 50) {
        const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
        response.sma_50 = Math.round(sma50 * 100) / 100;
      }

      // Simple RSI (14-day)
      if (closes.length >= 15) {
        response.rsi_14 = this.calculateRSI(closes.slice(-15));
      }

      // Volatility (annualized)
      if (closes.length >= 20) {
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push(Math.log(closes[i] / closes[i - 1]));
        }
        const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
        response.volatility_annualized = Math.round(Math.sqrt(variance * 252) * 10000) / 100;
      }
    }

    // Include recent prices (last 10 days)
    response.recent_prices = prices.slice(-10).map(p => ({
      date: p.date,
      close: p.close,
      volume: p.volume
    }));

    // Add chart data for frontend rendering (includes OHLC for candlestick support)
    response.chart_data = {
      type: 'area',
      title: `${normalizedSymbol} Price (${safeDays} Days)`,
      data: prices.map(p => ({
        time: p.date,
        value: p.close,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close
      })),
      volume: prices.map(p => ({
        time: p.date,
        value: p.volume,
        color: p.close >= p.open ? 'rgba(5, 150, 105, 0.5)' : 'rgba(220, 38, 38, 0.5)'
      })),
      color: periodReturn >= 0 ? '#22c55e' : '#ef4444',
      symbol: normalizedSymbol
    };

    return response;
  }

  // ============================================
  // Tool: calculate_metric
  // ============================================
  async calculateMetric({ symbol, metric, parameters = {} }) {
    const normalizedSymbol = symbol.toUpperCase();

    // Get company and financial data
    const company = await this._queryOne(`
      SELECT c.id, c.symbol, c.name, c.market_cap,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
      FROM companies c WHERE c.symbol = ?
    `, [normalizedSymbol]);

    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    // Get latest financial data
    const financials = await this._queryOne(`
      SELECT
        fd.total_revenue, fd.operating_income, fd.net_income,
        fd.total_assets, fd.total_liabilities, fd.shareholder_equity,
        fd.cash_and_equivalents, fd.long_term_debt, fd.short_term_debt,
        fd.operating_cashflow, fd.capital_expenditures,
        fd.data
      FROM financial_data fd
      JOIN companies c ON fd.company_id = c.id
      WHERE c.symbol = ? AND fd.period_type = 'annual'
      ORDER BY fd.fiscal_date_ending DESC
      LIMIT 1
    `, [normalizedSymbol]);

    if (!financials) {
      return { error: `No financial data found for ${normalizedSymbol}` };
    }

    // Parse full data JSON if needed
    let fullData = {};
    try {
      fullData = JSON.parse(financials.data || '{}');
    } catch (e) { /* ignore */ }

    // Get metrics for additional data
    const metrics = await this._queryOne(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC LIMIT 1
    `, [company.id]);

    switch (metric.toLowerCase()) {
      case 'nopat': {
        // NOPAT = Operating Income × (1 - Tax Rate)
        const operatingIncome = financials.operating_income;
        const taxExpense = fullData.incomeTaxExpense || fullData.income_tax_expense;
        const preTaxIncome = fullData.incomeBeforeTax || fullData.pretax_income || financials.net_income + taxExpense;

        let taxRate = 0.21; // Default US corporate rate
        if (taxExpense && preTaxIncome && preTaxIncome > 0) {
          taxRate = Math.min(0.4, Math.max(0, taxExpense / preTaxIncome));
        }

        const nopat = operatingIncome * (1 - taxRate);

        // Get historical data for chart
        const historicalData = await this._query(`
          SELECT fiscal_year, fiscal_date_ending, operating_income, data
          FROM financial_data
          WHERE company_id = ? AND period_type = 'annual' AND operating_income IS NOT NULL
          ORDER BY fiscal_date_ending ASC
          LIMIT 5
        `, [company.id]);

        const result = {
          symbol: normalizedSymbol,
          metric: 'NOPAT',
          value: nopat,
          formatted: this.formatLargeNumber(nopat),
          formula: 'Operating Income × (1 - Tax Rate)',
          inputs: {
            operating_income: this.formatLargeNumber(operatingIncome),
            tax_rate: `${(taxRate * 100).toFixed(1)}%`,
            tax_rate_source: taxExpense ? 'calculated from financials' : 'default US rate'
          },
          calculation: `${this.formatLargeNumber(operatingIncome)} × (1 - ${(taxRate * 100).toFixed(1)}%) = ${this.formatLargeNumber(nopat)}`
        };

        // Generate historical chart if we have data
        if (historicalData.length > 1) {
          const chartDataPoints = historicalData.map(d => {
            let yearTaxRate = taxRate;
            try {
              const parsed = JSON.parse(d.data || '{}');
              const te = parsed.incomeTaxExpense || parsed.income_tax_expense;
              const pti = parsed.incomeBeforeTax || parsed.pretax_income;
              if (te && pti && pti > 0) {
                yearTaxRate = Math.min(0.4, Math.max(0, te / pti));
              }
            } catch (e) { /* ignore */ }
            const yearNopat = d.operating_income * (1 - yearTaxRate);
            return {
              name: d.fiscal_year || d.fiscal_date_ending?.slice(0, 4),
              value: Math.round(yearNopat / 1e9 * 100) / 100, // Billions
              color: yearNopat >= 0 ? '#22c55e' : '#ef4444'
            };
          });

          result.chart_data = {
            type: 'bar',
            title: `${normalizedSymbol} NOPAT (Billions)`,
            data: chartDataPoints
          };
        }

        return result;
      }

      case 'ev':
      case 'enterprise_value': {
        // EV = Market Cap + Total Debt - Cash
        const marketCap = company.market_cap;
        const totalDebt = (financials.long_term_debt || 0) + (financials.short_term_debt || 0);
        const cash = financials.cash_and_equivalents || 0;
        const ev = marketCap + totalDebt - cash;

        return {
          symbol: normalizedSymbol,
          metric: 'Enterprise Value',
          value: ev,
          formatted: this.formatLargeNumber(ev),
          formula: 'Market Cap + Total Debt - Cash',
          inputs: {
            market_cap: this.formatLargeNumber(marketCap),
            total_debt: this.formatLargeNumber(totalDebt),
            cash: this.formatLargeNumber(cash)
          },
          calculation: `${this.formatLargeNumber(marketCap)} + ${this.formatLargeNumber(totalDebt)} - ${this.formatLargeNumber(cash)} = ${this.formatLargeNumber(ev)}`
        };
      }

      case 'wacc': {
        // WACC = (E/V) × Re + (D/V) × Rd × (1 - Tc)
        const riskFreeRate = parameters.risk_free_rate || 0.043;
        const beta = metrics?.beta || 1.0;
        const equityRiskPremium = parameters.equity_risk_premium || 0.05;

        const equity = company.market_cap;
        const debt = (financials.long_term_debt || 0) + (financials.short_term_debt || 0);
        const totalValue = equity + debt;

        const costOfEquity = riskFreeRate + beta * equityRiskPremium;
        const costOfDebt = parameters.cost_of_debt || 0.05; // Assume 5% if not provided
        const taxRate = parameters.tax_rate || 0.21;

        const wacc = (equity / totalValue) * costOfEquity + (debt / totalValue) * costOfDebt * (1 - taxRate);

        return {
          symbol: normalizedSymbol,
          metric: 'WACC',
          value: wacc,
          formatted: `${(wacc * 100).toFixed(2)}%`,
          formula: '(E/V) × Re + (D/V) × Rd × (1 - Tc)',
          inputs: {
            equity_weight: `${((equity / totalValue) * 100).toFixed(1)}%`,
            debt_weight: `${((debt / totalValue) * 100).toFixed(1)}%`,
            cost_of_equity: `${(costOfEquity * 100).toFixed(2)}%`,
            cost_of_debt: `${(costOfDebt * 100).toFixed(2)}%`,
            tax_rate: `${(taxRate * 100).toFixed(1)}%`,
            beta: beta.toFixed(2)
          }
        };
      }

      case 'graham_number': {
        // Graham Number = √(22.5 × EPS × Book Value per Share)
        const eps = fullData.dilutedEPS || fullData.eps_diluted || (financials.net_income / (company.market_cap / company.current_price));
        const bookValue = financials.shareholder_equity;
        const sharesOutstanding = company.market_cap / company.current_price;
        const bvps = bookValue / sharesOutstanding;

        if (eps <= 0 || bvps <= 0) {
          return { error: 'Graham Number requires positive EPS and book value' };
        }

        const grahamNumber = Math.sqrt(22.5 * eps * bvps);

        return {
          symbol: normalizedSymbol,
          metric: 'Graham Number',
          value: grahamNumber,
          formatted: `$${grahamNumber.toFixed(2)}`,
          current_price: company.current_price,
          upside: `${(((grahamNumber / company.current_price) - 1) * 100).toFixed(1)}%`,
          formula: '√(22.5 × EPS × Book Value per Share)',
          inputs: {
            eps: `$${eps.toFixed(2)}`,
            book_value_per_share: `$${bvps.toFixed(2)}`
          }
        };
      }

      case 'invested_capital': {
        // Invested Capital = Total Assets - Non-Interest-Bearing Current Liabilities - Cash
        const totalAssets = financials.total_assets;
        const cash = financials.cash_and_equivalents || 0;
        const currentLiab = fullData.totalCurrentLiabilities || fullData.current_liabilities || 0;
        const shortTermDebt = financials.short_term_debt || 0;

        // Non-interest-bearing current liabilities = Current Liabilities - Short-term Debt
        const nonInterestBearingCL = currentLiab - shortTermDebt;

        const investedCapital = totalAssets - nonInterestBearingCL - cash;

        return {
          symbol: normalizedSymbol,
          metric: 'Invested Capital',
          value: investedCapital,
          formatted: this.formatLargeNumber(investedCapital),
          formula: 'Total Assets - Non-Interest-Bearing Current Liabilities - Cash',
          inputs: {
            total_assets: this.formatLargeNumber(totalAssets),
            nibcl: this.formatLargeNumber(nonInterestBearingCL),
            cash: this.formatLargeNumber(cash)
          }
        };
      }

      case 'fcf_conversion': {
        // FCF Conversion = Free Cash Flow / Net Income
        const fcf = (financials.operating_cashflow || 0) - Math.abs(financials.capital_expenditures || 0);
        const netIncome = financials.net_income;

        if (netIncome <= 0) {
          return { error: 'FCF conversion requires positive net income' };
        }

        const conversion = fcf / netIncome;

        return {
          symbol: normalizedSymbol,
          metric: 'FCF Conversion',
          value: conversion,
          formatted: `${(conversion * 100).toFixed(1)}%`,
          interpretation: conversion > 1 ? 'Excellent - generating more cash than accounting profits' :
            conversion > 0.7 ? 'Good - healthy cash conversion' :
              conversion > 0.5 ? 'Moderate - some cash tied up in working capital' :
                'Weak - significant gap between profits and cash',
          formula: 'Free Cash Flow / Net Income',
          inputs: {
            free_cash_flow: this.formatLargeNumber(fcf),
            net_income: this.formatLargeNumber(netIncome)
          }
        };
      }

      default:
        return { error: `Metric calculation '${metric}' not implemented` };
    }
  }

  // ============================================
  // Tool: get_sentiment
  // ============================================
  async getSentiment({ symbol, sources, include_details = false }) {
    const normalizedSymbol = symbol.toUpperCase();

    const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      sources: {}
    };

    // Get combined sentiment summary
    const combined = await this._queryOne(`
      SELECT * FROM combined_sentiment
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `, [company.id]);

    if (combined) {
      response.overall = {
        score: combined.combined_score,
        signal: combined.combined_signal,
        confidence: combined.confidence,
        sources_used: combined.sources_used,
        agreement: combined.agreement_score,
        as_of: combined.calculated_at
      };

      // Include individual sources
      if (!sources || sources.includes('reddit') || sources.includes('combined')) {
        response.sources.reddit = {
          score: combined.reddit_sentiment,
          signal: combined.reddit_signal,
          confidence: combined.reddit_confidence
        };
      }

      if (!sources || sources.includes('stocktwits') || sources.includes('combined')) {
        response.sources.stocktwits = {
          score: combined.stocktwits_sentiment,
          signal: combined.stocktwits_signal,
          confidence: combined.stocktwits_confidence
        };
      }

      if (!sources || sources.includes('news') || sources.includes('combined')) {
        response.sources.news = {
          score: combined.news_sentiment,
          signal: combined.news_signal,
          confidence: combined.news_confidence
        };
      }
    }

    // Get analyst estimates
    if (!sources || sources.includes('analyst') || sources.includes('combined')) {
      const analyst = await this._queryOne(`
        SELECT recommendation_key, recommendation_mean, upside_potential,
               strong_buy, buy, hold, sell, strong_sell, signal, signal_strength
        FROM analyst_estimates
        WHERE company_id = ?
      `, [company.id]);

      if (analyst) {
        response.sources.analyst = {
          consensus: analyst.recommendation_key,
          rating_score: analyst.recommendation_mean,
          upside_potential: analyst.upside_potential,
          signal: analyst.signal,
          distribution: {
            strong_buy: analyst.strong_buy,
            buy: analyst.buy,
            hold: analyst.hold,
            sell: analyst.sell,
            strong_sell: analyst.strong_sell
          }
        };
      }
    }

    // Include details if requested
    if (include_details) {
      // Recent news
      const news = await this._query(`
        SELECT title, source, sentiment_label, published_at
        FROM news_articles
        WHERE company_id = ?
        ORDER BY published_at DESC
        LIMIT 5
      `, [company.id]);

      if (news.length > 0) {
        response.recent_news = news;
      }
    }

    // Add chart data for sentiment visualization
    if (combined) {
      // Calculate bullish/neutral/bearish percentages from overall score
      // Score is typically -1 to 1, convert to percentages
      const score = combined.combined_score || 0;
      let bullish, neutral, bearish;

      if (score > 0.2) {
        bullish = Math.min(70, 50 + score * 30);
        neutral = Math.max(15, 30 - score * 15);
        bearish = 100 - bullish - neutral;
      } else if (score < -0.2) {
        bearish = Math.min(70, 50 + Math.abs(score) * 30);
        neutral = Math.max(15, 30 - Math.abs(score) * 15);
        bullish = 100 - bearish - neutral;
      } else {
        neutral = 50;
        bullish = 25 + score * 25;
        bearish = 25 - score * 25;
      }

      response.chart_data = {
        type: 'sentiment',
        title: `${normalizedSymbol} Sentiment`,
        data: {
          bullish: Math.round(bullish),
          neutral: Math.round(neutral),
          bearish: Math.round(bearish)
        }
      };
    }

    // Also add analyst distribution as pie chart if available
    if (response.sources?.analyst?.distribution) {
      const dist = response.sources.analyst.distribution;
      const total = (dist.strong_buy || 0) + (dist.buy || 0) + (dist.hold || 0) + (dist.sell || 0) + (dist.strong_sell || 0);

      if (total > 0) {
        response.analyst_chart_data = {
          type: 'pie',
          title: 'Analyst Ratings',
          data: [
            { name: 'Strong Buy', value: dist.strong_buy || 0, color: '#22c55e' },
            { name: 'Buy', value: dist.buy || 0, color: '#86efac' },
            { name: 'Hold', value: dist.hold || 0, color: '#fbbf24' },
            { name: 'Sell', value: dist.sell || 0, color: '#f87171' },
            { name: 'Strong Sell', value: dist.strong_sell || 0, color: '#ef4444' }
          ].filter(d => d.value > 0)
        };
      }
    }

    return response;
  }

  // ============================================
  // Tool: get_investor_holdings
  // ============================================
  async getInvestorHoldings({ investor, symbol, show_changes = false }) {
    // Map investor aliases to names
    const investorAliases = {
      'buffett': 'Warren Buffett',
      'berkshire': 'Warren Buffett',
      'burry': 'Michael Burry',
      'scion': 'Michael Burry',
      'ackman': 'Bill Ackman',
      'pershing': 'Bill Ackman',
      'dalio': 'Ray Dalio',
      'bridgewater': 'Ray Dalio',
      'icahn': 'Carl Icahn',
      'soros': 'George Soros',
      'druckenmiller': 'Stanley Druckenmiller',
      'tepper': 'David Tepper',
      'cohen': 'Steven Cohen',
      'einhorn': 'David Einhorn',
      'loeb': 'Dan Loeb',
      'klarman': 'Seth Klarman',
      'marks': 'Howard Marks'
    };

    const investorName = investorAliases[investor.toLowerCase()] || investor;

    // Find investor in database
    const investorData = await this._queryOne(`
      SELECT id, name, fund_name, cik, latest_filing_date, latest_portfolio_value as total_value
      FROM famous_investors
      WHERE (name LIKE ? OR fund_name LIKE ?) AND is_active = 1
      LIMIT 1
    `, [`%${investorName}%`, `%${investorName}%`]);

    if (!investorData) {
      return {
        error: `Investor '${investor}' not found`,
        available_investors: Object.keys(investorAliases)
      };
    }

    const response = {
      investor: investorData.name,
      fund: investorData.fund_name,
      filing_date: investorData.latest_filing_date,
      total_value: investorData.total_value
    };

    // If specific symbol requested, check if investor holds it
    if (symbol) {
      const normalizedSymbol = symbol.toUpperCase();
      const holding = await this._queryOne(`
        SELECT
          ih.shares, ih.market_value, ih.portfolio_weight, ih.change_type,
          ih.shares_change, ih.shares_change_pct,
          c.symbol, c.name
        FROM investor_holdings ih
        JOIN companies c ON ih.company_id = c.id
        WHERE ih.investor_id = ? AND c.symbol = ? AND ih.filing_date = ?
      `, [investorData.id, normalizedSymbol, investorData.latest_filing_date]);

      if (holding) {
        response.holds_symbol = true;
        response.position = {
          symbol: holding.symbol,
          company: holding.name,
          shares: holding.shares,
          value: holding.market_value,
          portfolio_weight: `${(holding.portfolio_weight * 100).toFixed(2)}%`,
          change_type: holding.change_type,
          shares_change: holding.shares_change,
          shares_change_pct: holding.shares_change_pct
        };
      } else {
        response.holds_symbol = false;
        response.message = `${investorData.name} does not hold ${normalizedSymbol} as of ${investorData.latest_filing_date}`;
      }

      return response;
    }

    // Get top holdings
    const holdings = await this._query(`
      SELECT
        ih.shares, ih.market_value, ih.portfolio_weight, ih.change_type,
        ih.shares_change, ih.prev_shares,
        c.symbol, c.name, c.sector
      FROM investor_holdings ih
      JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = ? AND ih.filing_date = ?
      ORDER BY ih.portfolio_weight DESC
      LIMIT 20
    `, [investorData.id, investorData.latest_filing_date]);

    response.top_holdings = holdings.map(h => ({
      symbol: h.symbol,
      company: h.name,
      sector: h.sector,
      shares: h.shares,
      value: h.market_value,
      weight: `${(h.portfolio_weight * 100).toFixed(2)}%`,
      change_type: h.change_type
    }));

    // Show changes if requested
    if (show_changes) {
      const newPositions = holdings.filter(h => h.change_type === 'new');
      const increased = holdings.filter(h => h.change_type === 'increased');
      const decreased = holdings.filter(h => h.change_type === 'decreased');

      response.changes = {
        new_positions: newPositions.map(h => ({ symbol: h.symbol, value: h.market_value })),
        increased: increased.slice(0, 5).map(h => ({
          symbol: h.symbol,
          change_pct: h.prev_shares > 0 ? `+${((h.shares - h.prev_shares) / h.prev_shares * 100).toFixed(1)}%` : 'N/A'
        })),
        decreased: decreased.slice(0, 5).map(h => ({
          symbol: h.symbol,
          change_pct: h.prev_shares > 0 ? `${((h.shares - h.prev_shares) / h.prev_shares * 100).toFixed(1)}%` : 'N/A'
        }))
      };
    }

    return response;
  }

  // ============================================
  // Tool: get_financial_statements
  // ============================================
  async getFinancialStatements({ symbol, statement_type = 'all', periods = 4, period_type = 'annual' }) {
    const normalizedSymbol = symbol.toUpperCase();

    const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      period_type
    };

    const statementTypes = statement_type === 'all'
      ? ['income_statement', 'balance_sheet', 'cash_flow']
      : [statement_type];

    for (const stmtType of statementTypes) {
      const data = await this._query(`
        SELECT fiscal_date_ending, fiscal_year, data
        FROM financial_data
        WHERE company_id = ? AND statement_type = ? AND period_type = ?
        ORDER BY fiscal_date_ending DESC
        LIMIT ?
      `, [company.id, stmtType, period_type, periods]);

      if (data.length > 0) {
        response[stmtType] = data.map(d => {
          let parsed = {};
          try {
            parsed = JSON.parse(d.data || '{}');
          } catch (e) { /* ignore */ }

          return {
            period: d.fiscal_date_ending,
            year: d.fiscal_year,
            ...this.cleanNulls(parsed)
          };
        });
      }
    }

    // Generate multi-series chart data for income statement
    console.log('[getFinancialStatements] income_statement length:', response.income_statement?.length);
    if (response.income_statement && response.income_statement.length > 1) {
      const incomeData = response.income_statement.slice().reverse(); // Chronological order
      console.log('[getFinancialStatements] First income entry keys:', Object.keys(incomeData[0] || {}));

      // Define metrics to extract with their colors and labels
      // Multiple keys to check since database field names vary
      const metricDefs = [
        { keys: ['totalRevenue', 'revenue', 'Revenues'], label: 'Revenue', color: '#6366f1' },
        { keys: ['grossProfit', 'gross_profit', 'GrossProfit'], label: 'Gross Profit', color: '#22c55e' },
        { keys: ['operatingIncome', 'operating_income', 'OperatingIncomeLoss'], label: 'Operating Income', color: '#f59e0b' },
        { keys: ['ebitda', 'EBITDA'], label: 'EBITDA', color: '#8b5cf6' },
        { keys: ['netIncome', 'net_income', 'NetIncomeLoss'], label: 'Net Income', color: '#06b6d4' }
      ];

      // Helper to find value from multiple possible keys
      const getValue = (obj, keys) => {
        for (const key of keys) {
          if (obj[key] !== undefined && obj[key] !== null) return obj[key];
        }
        return null;
      };

      // Build multi-series data
      const series = [];
      for (const metric of metricDefs) {
        const data = incomeData
          .filter(d => getValue(d, metric.keys) !== null)
          .map(d => ({
            time: d.year?.toString() || d.period?.slice(0, 4),
            value: Math.round((getValue(d, metric.keys) / 1e9) * 100) / 100
          }));

        if (data.length > 1) {
          series.push({
            name: metric.label,
            color: metric.color,
            data
          });
        }
      }

      console.log('[getFinancialStatements] Series count:', series.length, 'Series names:', series.map(s => s.name));

      // Create a combined multi-series chart if we have multiple metrics
      if (series.length >= 2) {
        response.chart_data = {
          type: 'multi_line',
          title: `${normalizedSymbol} Financial Metrics (Billions)`,
          series: series.slice(0, 5), // Limit to 5 series for readability
          normalized: false
        };
        console.log('[getFinancialStatements] Created multi_line chart_data');
      } else if (series.length === 1) {
        // Fallback to bar chart for single metric
        response.chart_data = {
          type: 'bar',
          title: `${normalizedSymbol} ${series[0].name} (Billions)`,
          data: series[0].data.map(d => ({
            name: d.time,
            value: d.value,
            color: series[0].color
          }))
        };
      }
    }

    return response;
  }

  // ============================================
  // Tool: get_macro_data
  // ============================================
  async getMacroData({ indicators, include_regime = false }) {
    const response = {
      as_of: new Date().toISOString().split('T')[0],
      indicators: {}
    };

    // Map FRED series to indicator names
    const seriesMap = {
      'DFF': 'fed_funds',
      'FEDFUNDS': 'fed_funds',
      'DGS10': 'treasury_10y',
      'DGS2': 'treasury_2y',
      'T10Y2Y': 'yield_spread',
      'T10Y3M': 'yield_spread',
      'CPIAUCSL': 'cpi',
      'UNRATE': 'unemployment',
      'GDP': 'gdp',
      'GDPC1': 'gdp',
      'VIXCLS': 'vix',
      'BAMLH0A0HYM2': 'credit_spread',
      'STLFSI4': 'financial_stress',
      'RECPROUSM156N': 'recession_probability'
    };

    // Try to get from economic_indicators table (FRED data)
    try {
      const econData = await this._query(`
        SELECT series_id, value, observation_date, series_name, category
        FROM economic_indicators
        WHERE series_id IN (
          'DFF', 'FEDFUNDS', 'DGS10', 'DGS2', 'T10Y2Y', 'T10Y3M', 'CPIAUCSL',
          'UNRATE', 'GDP', 'GDPC1', 'VIXCLS', 'BAMLH0A0HYM2', 'STLFSI4', 'RECPROUSM156N'
        )
        ORDER BY observation_date DESC
      `);

      // Get latest value for each series
      const seen = new Set();
      for (const row of econData) {
        const indicator = seriesMap[row.series_id];
        if (indicator && !seen.has(indicator)) {
          seen.add(indicator);

          // Filter if specific indicators requested
          if (!indicators || indicators.includes(indicator)) {
            response.indicators[indicator] = {
              value: row.value,
              as_of: row.observation_date,
              series_name: row.series_name
            };
          }
        }
      }
    } catch (e) {
      // Table might not exist or be empty - use macro_regimes as fallback
      console.log('[getMacroData] economic_indicators query failed, using macro_regimes fallback');
    }

    // If we didn't get indicators from economic_indicators, try macro_regimes
    if (Object.keys(response.indicators).length === 0) {
      const latestRegime = await this._queryOne(`
        SELECT * FROM macro_regimes
        ORDER BY regime_date DESC
        LIMIT 1
      `);

      if (latestRegime) {
        response.indicators = {
          fed_funds: { value: latestRegime.fed_funds_rate, as_of: latestRegime.regime_date },
          unemployment: { value: latestRegime.unemployment_rate, as_of: latestRegime.regime_date },
          cpi: { value: latestRegime.cpi_yoy, as_of: latestRegime.regime_date },
          gdp: { value: latestRegime.gdp_growth_yoy, as_of: latestRegime.regime_date },
          vix: { value: latestRegime.vix, as_of: latestRegime.regime_date },
          yield_spread: { value: latestRegime.yield_curve_spread, as_of: latestRegime.regime_date },
          credit_spread: { value: latestRegime.credit_spread, as_of: latestRegime.regime_date },
          recession_probability: { value: latestRegime.recession_probability, as_of: latestRegime.regime_date }
        };

        // Filter to requested indicators if specified
        if (indicators && indicators.length > 0) {
          response.indicators = Object.fromEntries(
            Object.entries(response.indicators).filter(([k]) => indicators.includes(k))
          );
        }
      }
    }

    // Add regime classification if requested
    if (include_regime) {
      const regimeData = await this._queryOne(`
        SELECT * FROM macro_regimes
        ORDER BY calculation_date DESC
        LIMIT 1
      `);

      if (regimeData) {
        response.regime = {
          growth: regimeData.growth_regime,
          inflation: regimeData.inflation_regime,
          policy: regimeData.policy_regime,
          calculation_date: regimeData.calculation_date
        };
      }
    }

    // Get market sentiment (Fear & Greed)
    const marketSentiment = await this._queryOne(`
      SELECT indicator_value, indicator_label, fetched_at
      FROM market_sentiment
      WHERE indicator_type = 'cnn_fear_greed'
      ORDER BY fetched_at DESC
      LIMIT 1
    `);

    if (marketSentiment) {
      response.market_sentiment = {
        fear_greed_index: marketSentiment.indicator_value,
        label: marketSentiment.indicator_label,
        as_of: marketSentiment.fetched_at
      };
    }

    return response;
  }

  // ============================================
  // Tool: compare_companies
  // ============================================
  async compareCompanies({ symbols, metrics }) {
    if (symbols.length < 2 || symbols.length > 5) {
      return { error: 'Please provide 2-5 symbols to compare' };
    }

    const normalizedSymbols = symbols.map(s => s.toUpperCase());

    // Default metrics if not specified
    const metricsToCompare = metrics && metrics.length > 0 ? metrics : [
      'market_cap', 'pe_ratio', 'pb_ratio', 'ev_ebitda',
      'roic', 'roe', 'gross_margin', 'net_margin',
      'revenue_growth_yoy', 'debt_to_equity', 'fcf_yield'
    ];

    const companies = [];

    for (const symbol of normalizedSymbols) {
      const data = await this._queryOne(`
        SELECT
          c.symbol, c.name, c.sector, c.industry, c.market_cap,
          m.*,
          (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
        FROM companies c
        LEFT JOIN calculated_metrics m ON c.id = m.company_id
        WHERE c.symbol = ?
        ORDER BY m.fiscal_period DESC
        LIMIT 1
      `, [symbol]);

      if (data) {
        const companyData = {
          symbol: data.symbol,
          name: data.name,
          sector: data.sector,
          current_price: data.current_price
        };

        for (const metric of metricsToCompare) {
          companyData[metric] = data[metric];
        }

        companies.push(this.cleanNulls(companyData));
      }
    }

    // Build comparison table
    const comparison = {
      companies: companies.map(c => c.symbol),
      data: companies,
      metrics: metricsToCompare,
      analysis: this.generateComparisonAnalysis(companies, metricsToCompare)
    };

    // Add chart data for comparison visualization
    // Select key metrics for bar chart comparison
    const chartMetrics = ['pe_ratio', 'roic', 'gross_margin', 'revenue_growth_yoy', 'fcf_yield']
      .filter(m => metricsToCompare.includes(m));

    if (chartMetrics.length > 0 && companies.length >= 2) {
      // Create bar chart data for the first available comparison metric
      const primaryMetric = chartMetrics[0];
      const metricLabel = this.formatMetricLabel(primaryMetric);

      comparison.chart_data = {
        type: 'bar',
        title: `${metricLabel} Comparison`,
        data: companies
          .filter(c => c[primaryMetric] !== undefined && c[primaryMetric] !== null)
          .map(c => ({
            name: c.symbol,
            value: c[primaryMetric],
            color: this.getCompanyColor(c.symbol)
          }))
      };

      // Add additional metrics as horizontal bar charts
      comparison.additional_charts = chartMetrics.slice(1, 4).map(metric => ({
        type: 'horizontal_bar',
        title: this.formatMetricLabel(metric),
        data: companies
          .filter(c => c[metric] !== undefined && c[metric] !== null)
          .map(c => ({
            name: c.symbol,
            value: c[metric],
            color: this.getCompanyColor(c.symbol)
          }))
      })).filter(chart => chart.data.length >= 2);
    }

    // Add multi-series price comparison chart
    const priceSeriesData = await this.getMultiSeriesPriceData(normalizedSymbols, 90);
    console.log('[compareCompanies] priceSeriesData:', {
      exists: !!priceSeriesData,
      seriesCount: priceSeriesData?.series?.length,
      seriesNames: priceSeriesData?.series?.map(s => s.name)
    });
    if (priceSeriesData && priceSeriesData.series.length >= 2) {
      comparison.price_comparison_chart = {
        type: 'multi_line',
        title: 'Price Performance Comparison (90 Days)',
        series: priceSeriesData.series,
        normalized: true // Show percentage change for fair comparison
      };
      console.log('[compareCompanies] Created price_comparison_chart with', priceSeriesData.series.length, 'series');

      // Add scatter plot for risk vs return visualization
      const scatterData = await this.getRiskReturnScatterData(normalizedSymbols);
      if (scatterData && scatterData.length >= 2) {
        comparison.scatter_chart = {
          type: 'scatter',
          title: 'Risk vs Return (90 Days)',
          xLabel: 'Volatility %',
          yLabel: 'Return %',
          data: scatterData,
          companies: normalizedSymbols,
          symbols: normalizedSymbols
        };
      }

      // Add correlation heatmap if 3+ symbols
      if (normalizedSymbols.length >= 3) {
        const correlationMatrix = this.calculateCorrelationMatrix(priceSeriesData.series);
        if (correlationMatrix) {
          comparison.heatmap_chart = {
            type: 'heatmap',
            title: 'Price Correlation Matrix',
            matrix: correlationMatrix.matrix,
            labels: correlationMatrix.labels,
            correlationType: 'pearson'
          };
        }
      }
    }

    // Debug: log what we're returning
    console.log('[compareCompanies] FINAL return object keys:', Object.keys(comparison));
    console.log('[compareCompanies] Has price_comparison_chart:', !!comparison.price_comparison_chart);
    console.log('[compareCompanies] Has scatter_chart:', !!comparison.scatter_chart);
    if (comparison.price_comparison_chart) {
      console.log('[compareCompanies] price_comparison_chart series:', comparison.price_comparison_chart.series?.length);
    }

    return comparison;
  }

  // Helper to get risk/return data for scatter plot
  async getRiskReturnScatterData(symbols) {
    const data = [];

    for (const symbol of symbols) {
      const company = await this._queryOne('SELECT id FROM companies WHERE symbol = ?', [symbol]);
      if (!company) continue;

      const prices = await this._query(`
        SELECT date, close
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 90
      `, [company.id]);

      if (prices.length < 20) continue;

      // Calculate returns
      const returns = [];
      for (let i = 0; i < prices.length - 1; i++) {
        returns.push((prices[i].close - prices[i + 1].close) / prices[i + 1].close);
      }

      // Calculate total return
      const totalReturn = ((prices[0].close - prices[prices.length - 1].close) / prices[prices.length - 1].close) * 100;

      // Calculate volatility (annualized)
      const variance = returns.reduce((sum, r) => sum + r * r, 0) / returns.length;
      const volatility = Math.sqrt(variance * 252) * 100;

      data.push({
        symbol,
        label: symbol,
        x: Math.round(volatility * 100) / 100,
        y: Math.round(totalReturn * 100) / 100
      });
    }

    return data;
  }

  // Helper to calculate correlation matrix from price series
  calculateCorrelationMatrix(series) {
    if (!series || series.length < 2) return null;

    const labels = series.map(s => s.name);
    const matrix = {};

    // Initialize matrix
    labels.forEach(label => {
      matrix[label] = {};
    });

    // Calculate pairwise correlations
    for (let i = 0; i < series.length; i++) {
      for (let j = 0; j < series.length; j++) {
        const s1 = series[i];
        const s2 = series[j];

        if (i === j) {
          matrix[s1.name][s2.name] = 1.0;
        } else {
          const corr = this.calculatePearsonCorrelation(s1.data, s2.data);
          matrix[s1.name][s2.name] = Math.round(corr * 100) / 100;
        }
      }
    }

    return { matrix, labels };
  }

  // Calculate Pearson correlation between two price series
  calculatePearsonCorrelation(data1, data2) {
    // Align data by time
    const timeMap1 = new Map(data1.map(d => [d.time, d.value]));
    const timeMap2 = new Map(data2.map(d => [d.time, d.value]));

    const commonTimes = [...timeMap1.keys()].filter(t => timeMap2.has(t));
    if (commonTimes.length < 10) return 0;

    const x = commonTimes.map(t => timeMap1.get(t));
    const y = commonTimes.map(t => timeMap2.get(t));

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom !== 0 ? numerator / denom : 0;
  }

  // Helper to fetch multi-series price data for comparison charts
  async getMultiSeriesPriceData(symbols, days = 90) {
    const series = [];
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const company = await this._queryOne('SELECT id FROM companies WHERE symbol = ?', [symbol]);

      if (!company) continue;

      const prices = await this._query(`
        SELECT date, close
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT ?
      `, [company.id, days]);

      if (prices.length > 0) {
        // Reverse to chronological order
        prices.reverse();

        series.push({
          name: symbol,
          color: colors[i % colors.length],
          data: prices.map(p => ({
            time: p.date,
            value: p.close
          }))
        });
      }
    }

    return { series };
  }

  // Helper to format metric labels for charts
  formatMetricLabel(metric) {
    const labels = {
      pe_ratio: 'P/E Ratio',
      pb_ratio: 'P/B Ratio',
      ev_ebitda: 'EV/EBITDA',
      roic: 'ROIC %',
      roe: 'ROE %',
      roa: 'ROA %',
      gross_margin: 'Gross Margin %',
      net_margin: 'Net Margin %',
      revenue_growth_yoy: 'Revenue Growth %',
      debt_to_equity: 'Debt/Equity',
      fcf_yield: 'FCF Yield %',
      market_cap: 'Market Cap'
    };
    return labels[metric] || metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Helper to get consistent colors for company symbols
  getCompanyColor(symbol) {
    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
    const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  // ============================================
  // Tool: get_valuation_models
  // ============================================
  async getValuationModels({ symbol, models }) {
    const normalizedSymbol = symbol.toUpperCase();

    const company = await this._queryOne(`
      SELECT c.id, c.symbol, c.name, c.market_cap,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
      FROM companies c WHERE c.symbol = ?
    `, [normalizedSymbol]);

    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      current_price: company.current_price,
      valuations: {}
    };

    const modelsToGet = models && models.length > 0 && !models.includes('all')
      ? models
      : ['dcf', 'graham', 'analyst_target'];

    // Get DCF valuation if stored
    if (modelsToGet.includes('dcf')) {
      const dcf = await this._queryOne(`
        SELECT * FROM dcf_valuations
        WHERE company_id = ?
        ORDER BY calculated_at DESC
        LIMIT 1
      `, [company.id]);

      if (dcf) {
        response.valuations.dcf = {
          intrinsic_value: dcf.base_intrinsic_value,
          upside: `${(((dcf.base_intrinsic_value / company.current_price) - 1) * 100).toFixed(1)}%`,
          scenarios: {
            bull: dcf.bull_intrinsic_value,
            base: dcf.base_intrinsic_value,
            bear: dcf.bear_intrinsic_value
          },
          weighted_value: dcf.weighted_intrinsic_value,
          calculated_at: dcf.calculated_at
        };
      }
    }

    // Get analyst targets
    if (modelsToGet.includes('analyst_target')) {
      const analyst = await this._queryOne(`
        SELECT target_mean, target_high, target_low, upside_potential,
               recommendation_key, number_of_analysts
        FROM analyst_estimates
        WHERE company_id = ?
      `, [company.id]);

      if (analyst) {
        response.valuations.analyst_target = {
          mean_target: analyst.target_mean,
          high_target: analyst.target_high,
          low_target: analyst.target_low,
          upside: `${analyst.upside_potential?.toFixed(1)}%`,
          consensus: analyst.recommendation_key,
          analyst_count: analyst.number_of_analysts
        };
      }
    }

    // Calculate Graham Number on the fly
    if (modelsToGet.includes('graham')) {
      const result = await this.calculateMetric({ symbol: normalizedSymbol, metric: 'graham_number' });
      if (!result.error) {
        response.valuations.graham = {
          value: result.value,
          formatted: result.formatted,
          upside: result.upside
        };
      }
    }

    return response;
  }

  // ============================================
  // Helper Methods
  // ============================================

  cleanNulls(obj) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && key !== 'data') {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  formatLargeNumber(num) {
    if (num === null || num === undefined) return 'N/A';
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (absNum >= 1e12) return `${sign}$${(absNum / 1e12).toFixed(2)}T`;
    if (absNum >= 1e9) return `${sign}$${(absNum / 1e9).toFixed(2)}B`;
    if (absNum >= 1e6) return `${sign}$${(absNum / 1e6).toFixed(2)}M`;
    if (absNum >= 1e3) return `${sign}$${(absNum / 1e3).toFixed(2)}K`;
    return `${sign}$${num.toFixed(2)}`;
  }

  calculateRSI(prices) {
    if (prices.length < 2) return null;

    let gains = 0, losses = 0;
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / (prices.length - 1);
    const avgLoss = losses / (prices.length - 1);

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return Math.round((100 - (100 / (1 + rs))) * 100) / 100;
  }

  generateComparisonAnalysis(companies, metrics) {
    const analysis = [];

    // Find best/worst for key metrics
    const keyMetrics = ['roic', 'pe_ratio', 'revenue_growth_yoy', 'debt_to_equity'];

    for (const metric of keyMetrics) {
      if (!metrics.includes(metric)) continue;

      const values = companies
        .filter(c => c[metric] !== undefined && c[metric] !== null)
        .map(c => ({ symbol: c.symbol, value: c[metric] }));

      if (values.length >= 2) {
        values.sort((a, b) => {
          // For PE and debt, lower is better
          if (metric === 'pe_ratio' || metric === 'debt_to_equity') {
            return a.value - b.value;
          }
          return b.value - a.value;
        });

        const best = values[0];
        const worst = values[values.length - 1];

        const metricLabels = {
          roic: 'Return on Invested Capital',
          pe_ratio: 'P/E Ratio',
          revenue_growth_yoy: 'Revenue Growth',
          debt_to_equity: 'Debt/Equity'
        };

        analysis.push(`${metricLabels[metric]}: ${best.symbol} leads (${typeof best.value === 'number' ? best.value.toFixed(2) : best.value})`);
      }
    }

    return analysis;
  }

  // ============================================
  // Tool: get_market_index
  // ============================================
  async getMarketIndex({ index_name, days = 90 }) {
    const safeDays = Math.min(Math.max(1, days), 365);

    // Map common names to database entries
    const indexAliases = {
      's&p': 'S&P 500',
      's&p 500': 'S&P 500',
      'sp500': 'S&P 500',
      'spx': 'S&P 500',
      '^gspc': 'S&P 500',
      'nasdaq': 'NASDAQ Composite',
      'nasdaq composite': 'NASDAQ Composite',
      '^ixic': 'NASDAQ Composite',
      'dow': 'Dow Jones Industrial Average',
      'dow jones': 'Dow Jones Industrial Average',
      'djia': 'Dow Jones Industrial Average',
      '^dji': 'Dow Jones Industrial Average',
      'russell': 'Russell 2000',
      'russell 2000': 'Russell 2000',
      '^rut': 'Russell 2000',
      'ftse': 'FTSE 100',
      'ftse 100': 'FTSE 100',
      '^ftse': 'FTSE 100',
      'dax': 'DAX 40',
      'dax 40': 'DAX 40',
      '^gdaxi': 'DAX 40',
      'cac': 'CAC 40',
      'cac 40': 'CAC 40',
      '^fchi': 'CAC 40',
      'nikkei': 'Nikkei 225',
      'nikkei 225': 'Nikkei 225',
      '^n225': 'Nikkei 225',
      'atx': 'ATX',
      'austria': 'ATX',
      'austrian': 'ATX'
    };

    const searchName = indexAliases[index_name.toLowerCase()] || index_name;

    // Find the index
    const indexInfo = await this._queryOne(`
      SELECT id, name, symbol, short_name, description, index_type
      FROM market_indices
      WHERE name LIKE ? OR symbol LIKE ? OR short_name LIKE ?
      LIMIT 1
    `, [`%${searchName}%`, `%${searchName}%`, `%${searchName}%`]);

    if (!indexInfo) {
      // Return list of available indices
      const available = await this._query(`
        SELECT name, symbol FROM market_indices ORDER BY name
      `);

      return {
        error: `Index '${index_name}' not found`,
        available_indices: available.map(i => `${i.name} (${i.symbol})`)
      };
    }

    // Get price history
    const prices = await this._query(`
      SELECT date, open, high, low, close, volume
      FROM market_index_prices
      WHERE index_id = ?
      ORDER BY date DESC
      LIMIT ?
    `, [indexInfo.id, safeDays]);

    if (prices.length === 0) {
      return {
        index: indexInfo.name,
        symbol: indexInfo.symbol,
        error: 'No price data available for this index'
      };
    }

    // Reverse to chronological order
    prices.reverse();

    // Calculate performance metrics
    const latestPrice = prices[prices.length - 1].close;
    const oldestPrice = prices[0].close;
    const periodReturn = ((latestPrice / oldestPrice) - 1) * 100;

    // Calculate YTD return if we have enough data
    const currentYear = new Date().getFullYear();
    const ytdPrices = prices.filter(p => p.date.startsWith(String(currentYear)));
    let ytdReturn = null;
    if (ytdPrices.length > 1) {
      ytdReturn = ((latestPrice / ytdPrices[0].close) - 1) * 100;
    }

    const response = {
      index: indexInfo.name,
      symbol: indexInfo.symbol,
      short_name: indexInfo.short_name,
      type: indexInfo.index_type,
      latest_price: latestPrice,
      latest_date: prices[prices.length - 1].date,
      period_days: prices.length,
      period_return_pct: Math.round(periodReturn * 100) / 100,
      ytd_return_pct: ytdReturn ? Math.round(ytdReturn * 100) / 100 : null,
      high_period: Math.max(...prices.map(p => p.high)),
      low_period: Math.min(...prices.map(p => p.low)),
      recent_prices: prices.slice(-5).map(p => ({
        date: p.date,
        close: Math.round(p.close * 100) / 100
      }))
    };

    // Add chart data for frontend rendering
    response.chart_data = {
      type: 'area',
      title: `${indexInfo.name} (${safeDays} Days)`,
      data: prices.map(p => ({
        time: p.date,
        value: p.close
      })),
      color: periodReturn >= 0 ? '#22c55e' : '#ef4444'
    };

    return response;
  }

  // ============================================
  // Tool: get_market_sentiment
  // ============================================
  async getMarketSentiment({ include_history = false }) {
    // Get latest sentiment indicators
    const latestSentiment = await this._query(`
      SELECT indicator_type, indicator_label, indicator_value, fetched_at
      FROM market_sentiment
      WHERE fetched_at = (SELECT MAX(fetched_at) FROM market_sentiment)
    `);

    if (latestSentiment.length === 0) {
      return { error: 'No market sentiment data available' };
    }

    // Build response
    const response = {
      as_of: latestSentiment[0]?.fetched_at,
      indicators: {}
    };

    // Map indicator types to friendly names
    const indicatorLabels = {
      cnn_fear_greed: 'Fear & Greed Index',
      vix: 'VIX (Volatility Index)',
      put_call_ratio: 'Put/Call Ratio',
      high_yield_spread: 'High Yield Credit Spread',
      advance_decline: 'Advance/Decline Ratio',
      overall_market: 'Overall Market Sentiment'
    };

    for (const indicator of latestSentiment) {
      const name = indicatorLabels[indicator.indicator_type] || indicator.indicator_type;
      response.indicators[indicator.indicator_type] = {
        name,
        value: indicator.indicator_value,
        label: indicator.indicator_label
      };
    }

    // Determine overall sentiment interpretation
    const fearGreed = latestSentiment.find(i => i.indicator_type === 'cnn_fear_greed');
    if (fearGreed) {
      const value = fearGreed.indicator_value;
      let interpretation;
      if (value <= 25) interpretation = 'Extreme Fear - potential buying opportunity';
      else if (value <= 40) interpretation = 'Fear - market is cautious';
      else if (value <= 60) interpretation = 'Neutral - balanced sentiment';
      else if (value <= 75) interpretation = 'Greed - market is optimistic';
      else interpretation = 'Extreme Greed - potential market top, be cautious';

      response.interpretation = interpretation;
    }

    // Include historical data if requested
    if (include_history) {
      const history = await this._query(`
        SELECT indicator_type, indicator_value, fetched_at
        FROM market_sentiment
        WHERE indicator_type = 'cnn_fear_greed'
        ORDER BY fetched_at DESC
        LIMIT 30
      `);

      if (history.length > 0) {
        response.fear_greed_history = history.reverse().map(h => ({
          date: h.fetched_at.split(' ')[0],
          value: h.indicator_value
        }));
      }
    }

    // Add sentiment gauge chart
    if (fearGreed) {
      response.chart_data = {
        type: 'gauge',
        title: 'Fear & Greed Index',
        value: fearGreed.indicator_value,
        label: fearGreed.indicator_label,
        min: 0,
        max: 100,
        zones: [
          { min: 0, max: 25, color: '#ef4444', label: 'Extreme Fear' },
          { min: 25, max: 40, color: '#f97316', label: 'Fear' },
          { min: 40, max: 60, color: '#fbbf24', label: 'Neutral' },
          { min: 60, max: 75, color: '#84cc16', label: 'Greed' },
          { min: 75, max: 100, color: '#22c55e', label: 'Extreme Greed' }
        ]
      };
    }

    return response;
  }

  // ============================================
  // Tool: get_portfolio
  // ============================================
  async getPortfolio({ portfolio_name, include_performance = true }) {
    // If no name specified, list all portfolios
    if (!portfolio_name) {
      const portfolios = await this._query(`
        SELECT id, name, portfolio_type, current_value, current_cash, created_at
        FROM portfolios
        WHERE is_archived = 0
        ORDER BY current_value DESC
      `);

      return {
        portfolios: portfolios.map(p => ({
          name: p.name,
          type: p.portfolio_type,
          total_value: p.current_value + p.current_cash,
          cash: p.current_cash,
          invested: p.current_value
        })),
        message: portfolios.length > 0
          ? `Found ${portfolios.length} portfolio(s). Specify a portfolio name to see positions.`
          : 'No portfolios found. Create a portfolio first.'
      };
    }

    // Find specific portfolio
    const portfolio = await this._queryOne(`
      SELECT p.*, mi.name as benchmark_name
      FROM portfolios p
      LEFT JOIN market_indices mi ON p.benchmark_index_id = mi.id
      WHERE p.name LIKE ? AND p.is_archived = 0
      LIMIT 1
    `, [`%${portfolio_name}%`]);

    if (!portfolio) {
      const available = await this._query(`
        SELECT name FROM portfolios WHERE is_archived = 0
      `);

      return {
        error: `Portfolio '${portfolio_name}' not found`,
        available_portfolios: available.map(p => p.name)
      };
    }

    // Get positions
    const positions = await this._query(`
      SELECT
        pp.*,
        c.symbol, c.name as company_name, c.sector,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as latest_price
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ?
      ORDER BY pp.current_value DESC
    `, [portfolio.id]);

    const totalInvested = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);
    const totalValue = totalInvested + portfolio.current_cash;

    const response = {
      name: portfolio.name,
      type: portfolio.portfolio_type,
      total_value: totalValue,
      cash: portfolio.current_cash,
      invested_value: totalInvested,
      benchmark: portfolio.benchmark_name,
      positions: positions.map(p => ({
        symbol: p.symbol,
        company: p.company_name,
        sector: p.sector,
        shares: p.shares,
        avg_cost: p.average_cost,
        current_price: p.latest_price,
        current_value: p.current_value,
        weight: totalValue > 0 ? Math.round((p.current_value / totalValue) * 10000) / 100 : 0,
        gain_loss_pct: p.average_cost > 0
          ? Math.round(((p.latest_price / p.average_cost) - 1) * 10000) / 100
          : null
      })),
      position_count: positions.length
    };

    // Add sector allocation
    const sectorAlloc = {};
    for (const p of positions) {
      const sector = p.sector || 'Unknown';
      sectorAlloc[sector] = (sectorAlloc[sector] || 0) + (p.current_value || 0);
    }
    response.sector_allocation = Object.entries(sectorAlloc)
      .map(([sector, value]) => ({
        sector,
        value,
        weight: totalInvested > 0 ? Math.round((value / totalInvested) * 10000) / 100 : 0
      }))
      .sort((a, b) => b.value - a.value);

    // Add chart data for pie chart
    if (positions.length > 0) {
      const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#10b981'];
      response.chart_data = {
        type: 'pie',
        title: 'Portfolio Allocation',
        data: positions.slice(0, 8).map((p, i) => ({
          name: p.symbol,
          value: p.current_value || 0,
          color: colors[i % colors.length]
        }))
      };
    }

    return response;
  }

  // ============================================
  // Tool: get_congressional_trades
  // ============================================
  async getCongressionalTrades({ politician, symbol, trade_type = 'all', days = 90 }) {
    const safeDays = Math.min(Math.max(1, days), 365);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - safeDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let whereClause = 'ct.transaction_date >= ?';
    const params = [cutoffStr];

    // Filter by politician
    if (politician) {
      whereClause += ' AND (cp.name LIKE ? OR cp.last_name LIKE ?)';
      params.push(`%${politician}%`, `%${politician}%`);
    }

    // Filter by symbol
    if (symbol) {
      whereClause += ' AND c.symbol = ?';
      params.push(symbol.toUpperCase());
    }

    // Filter by trade type
    if (trade_type !== 'all') {
      if (trade_type === 'buy') {
        whereClause += " AND ct.transaction_type IN ('purchase', 'buy')";
      } else if (trade_type === 'sell') {
        whereClause += " AND ct.transaction_type IN ('sale', 'sell', 'sale_full', 'sale_partial')";
      }
    }

    const trades = await this._query(`
      SELECT
        ct.transaction_date,
        ct.transaction_type,
        ct.amount_range,
        ct.asset_description,
        cp.name as politician_name,
        cp.party,
        cp.chamber,
        cp.state,
        c.symbol,
        c.name as company_name
      FROM congressional_trades ct
      JOIN congressional_politicians cp ON ct.politician_id = cp.id
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ${whereClause}
      ORDER BY ct.transaction_date DESC
      LIMIT 50
    `, params);

    if (trades.length === 0) {
      return {
        message: 'No congressional trades found matching your criteria',
        filters: { politician, symbol, trade_type, days: safeDays }
      };
    }

    // Summarize by politician
    const byPolitician = {};
    const byStock = {};

    for (const trade of trades) {
      // By politician
      const polKey = trade.politician_name;
      if (!byPolitician[polKey]) {
        byPolitician[polKey] = {
          name: trade.politician_name,
          party: trade.party,
          chamber: trade.chamber,
          state: trade.state,
          trades: 0,
          buys: 0,
          sells: 0
        };
      }
      byPolitician[polKey].trades++;
      if (trade.transaction_type.includes('purchase') || trade.transaction_type === 'buy') {
        byPolitician[polKey].buys++;
      } else {
        byPolitician[polKey].sells++;
      }

      // By stock
      if (trade.symbol) {
        if (!byStock[trade.symbol]) {
          byStock[trade.symbol] = {
            symbol: trade.symbol,
            company: trade.company_name,
            trades: 0,
            buys: 0,
            sells: 0
          };
        }
        byStock[trade.symbol].trades++;
        if (trade.transaction_type.includes('purchase') || trade.transaction_type === 'buy') {
          byStock[trade.symbol].buys++;
        } else {
          byStock[trade.symbol].sells++;
        }
      }
    }

    const response = {
      period_days: safeDays,
      total_trades: trades.length,
      recent_trades: trades.slice(0, 20).map(t => ({
        date: t.transaction_date,
        politician: t.politician_name,
        party: t.party,
        type: t.transaction_type,
        symbol: t.symbol,
        company: t.company_name || t.asset_description,
        amount: t.amount_range
      })),
      most_active_politicians: Object.values(byPolitician)
        .sort((a, b) => b.trades - a.trades)
        .slice(0, 5),
      most_traded_stocks: Object.values(byStock)
        .sort((a, b) => b.trades - a.trades)
        .slice(0, 10)
    };

    return response;
  }

  // ============================================
  // Tool: get_insider_activity
  // ============================================
  async getInsiderActivity({ symbol, days = 90, transaction_type = 'all' }) {
    const normalizedSymbol = symbol.toUpperCase();
    const safeDays = Math.min(Math.max(1, days), 365);

    const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - safeDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Build where clause for transaction type
    let typeFilter = '';
    if (transaction_type === 'buy') {
      typeFilter = " AND it.transaction_type IN ('P', 'Purchase', 'Buy', 'A')";
    } else if (transaction_type === 'sell') {
      typeFilter = " AND it.transaction_type IN ('S', 'Sale', 'Sell', 'D')";
    }

    // Get insider transactions - join with insiders table for name/title
    const transactions = await this._query(`
      SELECT
        i.name as insider_name,
        i.title as insider_title,
        it.transaction_type,
        it.shares_transacted as shares,
        it.price_per_share as price,
        it.total_value,
        it.transaction_date,
        it.direct_indirect as ownership_type
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.company_id = ? AND it.transaction_date >= ?${typeFilter}
      ORDER BY it.transaction_date DESC
      LIMIT 30
    `, [company.id, cutoffStr]);

    // Get summary if available
    const summary = await this._queryOne(`
      SELECT *
      FROM insider_activity_summary
      WHERE company_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `, [company.id]);

    // Calculate aggregates
    let totalBuyValue = 0;
    let totalSellValue = 0;
    let buyCount = 0;
    let sellCount = 0;

    for (const txn of transactions) {
      const value = txn.total_value || (txn.shares * txn.price) || 0;
      const isBuy = ['P', 'Purchase', 'Buy', 'A'].includes(txn.transaction_type);

      if (isBuy) {
        totalBuyValue += value;
        buyCount++;
      } else {
        totalSellValue += value;
        sellCount++;
      }
    }

    // Determine sentiment
    let sentiment = 'neutral';
    let sentimentReason = '';
    if (buyCount > 0 && sellCount === 0) {
      sentiment = 'bullish';
      sentimentReason = 'Only insider buying, no selling';
    } else if (sellCount > 0 && buyCount === 0) {
      sentiment = 'bearish';
      sentimentReason = 'Only insider selling, no buying';
    } else if (totalBuyValue > totalSellValue * 2) {
      sentiment = 'bullish';
      sentimentReason = 'Buy value significantly exceeds sell value';
    } else if (totalSellValue > totalBuyValue * 2) {
      sentiment = 'bearish';
      sentimentReason = 'Sell value significantly exceeds buy value';
    } else {
      sentimentReason = 'Mixed insider activity';
    }

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      period_days: safeDays,
      total_transactions: transactions.length,
      summary: {
        buy_count: buyCount,
        sell_count: sellCount,
        total_buy_value: totalBuyValue,
        total_sell_value: totalSellValue,
        net_activity: totalBuyValue - totalSellValue,
        sentiment,
        sentiment_reason: sentimentReason
      },
      recent_transactions: transactions.slice(0, 15).map(t => ({
        date: t.transaction_date,
        insider: t.insider_name,
        title: t.insider_title,
        type: ['P', 'Purchase', 'Buy', 'A'].includes(t.transaction_type) ? 'Buy' : 'Sell',
        shares: t.shares,
        price: t.price,
        value: t.total_value || (t.shares * t.price)
      }))
    };

    // Add summary data if available
    if (summary) {
      response.activity_summary = {
        buy_count_3m: summary.buy_count_3m,
        sell_count_3m: summary.sell_count_3m,
        net_shares_3m: summary.net_shares_3m,
        buy_value_3m: summary.buy_value_3m,
        sell_value_3m: summary.sell_value_3m,
        insider_ownership_pct: summary.insider_ownership_pct,
        signal: summary.signal
      };
    }

    // Add chart data
    response.chart_data = {
      type: 'bar',
      title: `${normalizedSymbol} Insider Activity`,
      data: [
        { name: 'Buys', value: buyCount, color: '#22c55e' },
        { name: 'Sells', value: sellCount, color: '#ef4444' }
      ]
    };

    return response;
  }

  // ============================================
  // Tool: get_technical_signals
  // ============================================
  async getTechnicalSignals({ symbol, indicators }) {
    const normalizedSymbol = symbol.toUpperCase();

    const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    // Get technical signals from database
    const signals = await this._queryOne(`
      SELECT *
      FROM technical_signals
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `, [company.id]);

    // Get recent prices for additional calculations
    const prices = await this._query(`
      SELECT date, open, high, low, close, volume
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT 60
    `, [company.id]);

    if (!signals && prices.length < 14) {
      return { error: `Insufficient data for technical analysis of ${normalizedSymbol}` };
    }

    const indicatorsToGet = indicators && indicators.length > 0 && !indicators.includes('all')
      ? indicators
      : ['rsi', 'macd', 'moving_averages', 'bollinger', 'support_resistance', 'volume', 'momentum'];

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      as_of: signals?.calculated_at || prices[0]?.date,
      current_price: prices[0]?.close,
      signals: {}
    };

    // RSI
    if (indicatorsToGet.includes('rsi')) {
      const rsi = signals?.rsi_14 ?? this.calculateRSI(prices.slice(0, 15).map(p => p.close).reverse());
      let rsiSignal = 'neutral';
      if (rsi !== null) {
        if (rsi < 30) rsiSignal = 'oversold';
        else if (rsi > 70) rsiSignal = 'overbought';
      }
      response.signals.rsi = {
        value: rsi ? Math.round(rsi * 100) / 100 : null,
        signal: rsiSignal,
        interpretation: rsi < 30 ? 'Stock is oversold - potential bounce' :
          rsi > 70 ? 'Stock is overbought - potential pullback' :
            'RSI in neutral territory'
      };
    }

    // MACD
    if (indicatorsToGet.includes('macd')) {
      response.signals.macd = {
        macd_line: signals?.macd_line,
        signal_line: signals?.macd_signal,
        histogram: signals?.macd_histogram,
        signal: signals?.macd_signal_type || (
          signals?.macd_histogram > 0 ? 'bullish' :
            signals?.macd_histogram < 0 ? 'bearish' : 'neutral'
        ),
        interpretation: signals?.macd_histogram > 0
          ? 'MACD above signal line - bullish momentum'
          : 'MACD below signal line - bearish momentum'
      };
    }

    // Moving Averages
    if (indicatorsToGet.includes('moving_averages')) {
      const closes = prices.map(p => p.close).reverse();
      const sma20 = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : null;
      const sma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
      const currentPrice = prices[0]?.close;

      let trend = 'neutral';
      if (currentPrice && sma20 && sma50) {
        if (currentPrice > sma20 && sma20 > sma50) trend = 'bullish';
        else if (currentPrice < sma20 && sma20 < sma50) trend = 'bearish';
      }

      response.signals.moving_averages = {
        sma_20: sma20 ? Math.round(sma20 * 100) / 100 : null,
        sma_50: sma50 ? Math.round(sma50 * 100) / 100 : null,
        sma_200: signals?.sma_200,
        price_vs_sma20: currentPrice && sma20 ? ((currentPrice / sma20 - 1) * 100).toFixed(2) + '%' : null,
        price_vs_sma50: currentPrice && sma50 ? ((currentPrice / sma50 - 1) * 100).toFixed(2) + '%' : null,
        trend,
        golden_cross: signals?.golden_cross || false,
        death_cross: signals?.death_cross || false
      };
    }

    // Bollinger Bands
    if (indicatorsToGet.includes('bollinger')) {
      response.signals.bollinger = {
        upper: signals?.bb_upper,
        middle: signals?.bb_middle,
        lower: signals?.bb_lower,
        percent_b: signals?.bb_percent_b,
        bandwidth: signals?.bb_bandwidth,
        signal: signals?.bb_signal || 'neutral'
      };
    }

    // Support/Resistance
    if (indicatorsToGet.includes('support_resistance')) {
      // Calculate from price history
      const highs = prices.slice(0, 20).map(p => p.high);
      const lows = prices.slice(0, 20).map(p => p.low);

      response.signals.support_resistance = {
        resistance_1: Math.max(...highs),
        support_1: Math.min(...lows),
        pivot_point: signals?.pivot_point,
        distance_to_resistance: prices[0]?.close
          ? ((Math.max(...highs) / prices[0].close - 1) * 100).toFixed(2) + '%'
          : null,
        distance_to_support: prices[0]?.close
          ? ((prices[0].close / Math.min(...lows) - 1) * 100).toFixed(2) + '%'
          : null
      };
    }

    // Volume
    if (indicatorsToGet.includes('volume')) {
      const volumes = prices.slice(0, 20).map(p => p.volume);
      const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      const latestVolume = prices[0]?.volume;

      response.signals.volume = {
        latest: latestVolume,
        average_20d: Math.round(avgVolume),
        relative_volume: latestVolume && avgVolume
          ? (latestVolume / avgVolume).toFixed(2) + 'x'
          : null,
        signal: latestVolume > avgVolume * 1.5 ? 'high' :
          latestVolume < avgVolume * 0.5 ? 'low' : 'normal'
      };
    }

    // Momentum
    if (indicatorsToGet.includes('momentum')) {
      const closes = prices.map(p => p.close);
      const mom5 = closes[0] && closes[4] ? ((closes[0] / closes[4] - 1) * 100) : null;
      const mom10 = closes[0] && closes[9] ? ((closes[0] / closes[9] - 1) * 100) : null;
      const mom20 = closes[0] && closes[19] ? ((closes[0] / closes[19] - 1) * 100) : null;

      response.signals.momentum = {
        '5_day': mom5 ? Math.round(mom5 * 100) / 100 : null,
        '10_day': mom10 ? Math.round(mom10 * 100) / 100 : null,
        '20_day': mom20 ? Math.round(mom20 * 100) / 100 : null,
        trend: mom5 > 0 && mom10 > 0 && mom20 > 0 ? 'strong_bullish' :
          mom5 < 0 && mom10 < 0 && mom20 < 0 ? 'strong_bearish' :
            mom5 > 0 ? 'short_term_bullish' :
              mom5 < 0 ? 'short_term_bearish' : 'mixed'
      };
    }

    // Overall signal
    let bullishSignals = 0;
    let bearishSignals = 0;

    if (response.signals.rsi?.signal === 'oversold') bullishSignals++;
    if (response.signals.rsi?.signal === 'overbought') bearishSignals++;
    if (response.signals.macd?.signal === 'bullish') bullishSignals++;
    if (response.signals.macd?.signal === 'bearish') bearishSignals++;
    if (response.signals.moving_averages?.trend === 'bullish') bullishSignals++;
    if (response.signals.moving_averages?.trend === 'bearish') bearishSignals++;
    if (response.signals.momentum?.trend?.includes('bullish')) bullishSignals++;
    if (response.signals.momentum?.trend?.includes('bearish')) bearishSignals++;

    response.overall = {
      bullish_signals: bullishSignals,
      bearish_signals: bearishSignals,
      signal: bullishSignals > bearishSignals + 1 ? 'bullish' :
        bearishSignals > bullishSignals + 1 ? 'bearish' : 'neutral',
      strength: Math.abs(bullishSignals - bearishSignals) >= 3 ? 'strong' :
        Math.abs(bullishSignals - bearishSignals) >= 1 ? 'moderate' : 'weak'
    };

    return response;
  }

  // ============================================
  // Tool: get_earnings_calendar
  // ============================================
  async getEarningsCalendar({ symbol, direction = 'upcoming', days = 30 }) {
    const safeDays = Math.min(Math.max(1, days), 90);
    const today = new Date().toISOString().split('T')[0];

    const futureCutoff = new Date();
    futureCutoff.setDate(futureCutoff.getDate() + safeDays);
    const futureCutoffStr = futureCutoff.toISOString().split('T')[0];

    // If specific symbol requested
    if (symbol) {
      const normalizedSymbol = symbol.toUpperCase();
      const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);

      if (!company) {
        return { error: `Company ${normalizedSymbol} not found` };
      }

      // Get earnings data - note: schema has next_earnings_date and history_json
      const earnings = await this._queryOne(`
        SELECT ec.*, c.symbol, c.name
        FROM earnings_calendar ec
        JOIN companies c ON ec.company_id = c.id
        WHERE ec.company_id = ?
      `, [company.id]);

      if (!earnings) {
        return {
          symbol: normalizedSymbol,
          name: company.name,
          message: `No earnings data found for ${normalizedSymbol}`
        };
      }

      // Parse history JSON for past results
      let history = [];
      try {
        if (earnings.history_json) {
          history = JSON.parse(earnings.history_json);
        }
      } catch (e) { /* ignore */ }

      const response = {
        symbol: normalizedSymbol,
        name: company.name,
        next_earnings: earnings.next_earnings_date ? {
          date: earnings.next_earnings_date,
          is_estimate: earnings.is_estimate === 1,
          eps_estimate: earnings.eps_estimate,
          eps_estimate_range: earnings.eps_low && earnings.eps_high
            ? `${earnings.eps_low} - ${earnings.eps_high}`
            : null,
          revenue_estimate: earnings.revenue_estimate
        } : null,
        track_record: {
          // beat_rate is stored as percentage (e.g., 100.0 = 100%)
          beat_rate: earnings.beat_rate != null
            ? `${Math.round(earnings.beat_rate)}%`
            : null,
          avg_surprise: earnings.avg_surprise,
          consecutive_beats: earnings.consecutive_beats
        },
        recent_results: history.slice(0, 4).map(h => ({
          date: h.reportedDate || h.date,
          eps_actual: h.actualEPS || h.eps_actual,
          eps_estimate: h.estimatedEPS || h.eps_estimate,
          surprise_pct: h.surprise || h.surprise_pct,
          beat: h.actualEPS && h.estimatedEPS
            ? h.actualEPS > h.estimatedEPS
            : null
        }))
      };

      return response;
    }

    // No symbol - return calendar of upcoming earnings
    const response = {
      period_days: safeDays
    };

    if (direction === 'upcoming' || direction === 'both') {
      const upcoming = await this._query(`
        SELECT
          ec.next_earnings_date,
          ec.is_estimate,
          ec.eps_estimate,
          ec.revenue_estimate,
          c.symbol, c.name, c.sector
        FROM earnings_calendar ec
        JOIN companies c ON ec.company_id = c.id
        WHERE ec.next_earnings_date IS NOT NULL
          AND ec.next_earnings_date >= ?
          AND ec.next_earnings_date <= ?
        ORDER BY ec.next_earnings_date ASC
        LIMIT 30
      `, [today, futureCutoffStr]);

      response.upcoming = upcoming.map(e => ({
        date: e.next_earnings_date,
        is_estimate: e.is_estimate === 1,
        symbol: e.symbol,
        company: e.name,
        sector: e.sector,
        eps_estimate: e.eps_estimate,
        revenue_estimate: e.revenue_estimate
      }));
    }

    if (direction === 'recent' || direction === 'both') {
      // For recent, we need to look at history from all companies
      // This requires parsing history_json, which is expensive. Limit the query.
      const allEarnings = await this._query(`
        SELECT
          ec.history_json,
          ec.beat_rate,
          c.symbol, c.name
        FROM earnings_calendar ec
        JOIN companies c ON ec.company_id = c.id
        WHERE ec.history_json IS NOT NULL
        LIMIT 100
      `);

      const recentResults = [];
      for (const e of allEarnings) {
        try {
          const hist = JSON.parse(e.history_json || '[]');
          for (const h of hist.slice(0, 1)) { // Just most recent per company
            const date = h.reportedDate || h.date;
            if (date && date >= today.slice(0, 7) + '-01') { // Within last month roughly
              recentResults.push({
                date,
                symbol: e.symbol,
                company: e.name,
                eps_actual: h.actualEPS || h.eps_actual,
                eps_estimate: h.estimatedEPS || h.eps_estimate,
                beat: h.actualEPS && h.estimatedEPS ? h.actualEPS > h.estimatedEPS : null
              });
            }
          }
        } catch (ex) { /* ignore */ }
      }

      response.recent = recentResults
        .sort((a, b) => b.date?.localeCompare(a.date))
        .slice(0, 20);
    }

    return response;
  }

  // ============================================
  // Tool: get_short_interest
  // ============================================
  async getShortInterest({ symbol, include_history = false }) {
    // If specific symbol requested
    if (symbol) {
      const normalizedSymbol = symbol.toUpperCase();
      const company = await this._queryOne('SELECT id, name FROM companies WHERE symbol = ?', [normalizedSymbol]);

      if (!company) {
        return { error: `Company ${normalizedSymbol} not found` };
      }

      // Schema: short_interest, short_pct_float, short_pct_outstanding, days_to_cover
      const shortData = await this._queryOne(`
        SELECT *
        FROM short_interest
        WHERE company_id = ?
        ORDER BY settlement_date DESC
        LIMIT 1
      `, [company.id]);

      if (!shortData) {
        return {
          symbol: normalizedSymbol,
          message: `No short interest data found for ${normalizedSymbol}`
        };
      }

      // Determine squeeze potential
      let squeezePotential = 'low';
      let squeezeReason = '';

      const shortPctFloat = shortData.short_pct_float;
      const daysTocover = shortData.days_to_cover;

      if (shortPctFloat > 20 && daysTocover > 5) {
        squeezePotential = 'high';
        squeezeReason = 'High short % of float combined with high days to cover';
      } else if (shortPctFloat > 15 || daysTocover > 4) {
        squeezePotential = 'moderate';
        squeezeReason = 'Elevated short interest';
      } else {
        squeezeReason = 'Normal short interest levels';
      }

      // Also use squeeze_score if available
      if (shortData.squeeze_score && shortData.squeeze_score > 7) {
        squeezePotential = 'high';
        squeezeReason = `High squeeze score (${shortData.squeeze_score.toFixed(1)}/10)`;
      }

      const response = {
        symbol: normalizedSymbol,
        name: company.name,
        as_of: shortData.settlement_date,
        short_interest: {
          shares_short: shortData.short_interest,
          short_percent_of_float: shortData.short_pct_float,
          short_percent_of_outstanding: shortData.short_pct_outstanding,
          days_to_cover: shortData.days_to_cover,
          avg_daily_volume: shortData.avg_daily_volume
        },
        changes: {
          prior_short_interest: shortData.prior_short_interest,
          change_pct: shortData.change_pct
        },
        squeeze_analysis: {
          potential: squeezePotential,
          reason: squeezeReason,
          squeeze_score: shortData.squeeze_score,
          signal_score: shortData.signal_score
        }
      };

      // Include history if requested
      if (include_history) {
        const history = await this._query(`
          SELECT settlement_date, short_interest, short_pct_float, days_to_cover
          FROM short_interest
          WHERE company_id = ?
          ORDER BY settlement_date DESC
          LIMIT 12
        `, [company.id]);

        response.history = history.reverse().map(h => ({
          date: h.settlement_date,
          shares_short: h.short_interest,
          pct_float: h.short_pct_float,
          days_to_cover: h.days_to_cover
        }));

        // Add trend chart
        if (history.length > 1) {
          response.chart_data = {
            type: 'area',
            title: `${normalizedSymbol} Short Interest Trend`,
            data: history.map(h => ({
              time: h.settlement_date,
              value: h.short_pct_float
            })),
            color: '#f59e0b'
          };
        }
      }

      return response;
    }

    // No symbol - return most heavily shorted stocks
    const heavilyShorted = await this._query(`
      SELECT
        si.*,
        c.symbol, c.name, c.sector
      FROM short_interest si
      JOIN companies c ON si.company_id = c.id
      WHERE si.settlement_date = (SELECT MAX(settlement_date) FROM short_interest)
        AND si.short_pct_float IS NOT NULL
      ORDER BY si.short_pct_float DESC
      LIMIT 20
    `);

    if (heavilyShorted.length === 0) {
      return { message: 'No short interest data available' };
    }

    return {
      as_of: heavilyShorted[0]?.settlement_date,
      most_shorted: heavilyShorted.map(s => ({
        symbol: s.symbol,
        company: s.name,
        sector: s.sector,
        short_pct_float: s.short_pct_float,
        days_to_cover: s.days_to_cover,
        shares_short: s.short_interest,
        change_pct: s.change_pct,
        squeeze_score: s.squeeze_score
      }))
    };
  }

  // ============================================
  // Tool: get_risk_metrics
  // ============================================
  async getRiskMetrics({ portfolio_name, symbol, period = '1y' }) {
    const TRADING_DAYS_PER_YEAR = 252;
    const RISK_FREE_RATE = 0.045; // Current approximate risk-free rate

    // Helper to calculate Sharpe ratio
    const calculateSharpe = (annualReturn, volatility) => {
      if (!volatility || volatility === 0) return null;
      return Math.round(((annualReturn - RISK_FREE_RATE) / volatility) * 100) / 100;
    };

    // Helper to calculate Sortino ratio
    const calculateSortino = (dailyReturns, annualReturn) => {
      const negativeReturns = dailyReturns.filter(r => r < 0);
      if (negativeReturns.length < 2) return null;

      const squaredNegReturns = negativeReturns.map(r => Math.pow(r, 2));
      const downsideVariance = squaredNegReturns.reduce((a, b) => a + b, 0) / negativeReturns.length;
      const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

      if (downsideDeviation === 0) return null;
      return Math.round(((annualReturn - RISK_FREE_RATE) / downsideDeviation) * 100) / 100;
    };

    // Helper to calculate max drawdown
    const calculateMaxDrawdown = (prices) => {
      let maxDrawdown = 0;
      let peak = prices[0];
      let maxDrawdownStart = 0;
      let maxDrawdownEnd = 0;
      let currentPeak = 0;

      for (let i = 0; i < prices.length; i++) {
        if (prices[i] > peak) {
          peak = prices[i];
          currentPeak = i;
        }
        const drawdown = (peak - prices[i]) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDrawdownStart = currentPeak;
          maxDrawdownEnd = i;
        }
      }

      return {
        maxDrawdown: Math.round(maxDrawdown * 10000) / 100,
        maxDrawdownStart,
        maxDrawdownEnd
      };
    };

    // Determine number of days based on period
    const periodDays = {
      '1m': 21,
      '3m': 63,
      '6m': 126,
      '1y': 252,
      '2y': 504,
      '3y': 756
    };
    const days = periodDays[period] || 252;

    // If portfolio_name is provided, calculate portfolio-level metrics
    if (portfolio_name) {
      const portfolio = await this._queryOne(`
        SELECT p.id, p.name, p.current_value, p.current_cash
        FROM portfolios p
        WHERE p.name LIKE ? AND p.is_archived = 0
        LIMIT 1
      `, [`%${portfolio_name}%`]);

      if (!portfolio) {
        const available = await this._query('SELECT name FROM portfolios WHERE is_archived = 0');
        return {
          error: `Portfolio '${portfolio_name}' not found`,
          available_portfolios: available.map(p => p.name)
        };
      }

      // Get portfolio snapshots for performance calculation
      const snapshots = await this._query(`
        SELECT snapshot_date, total_value
        FROM portfolio_snapshots
        WHERE portfolio_id = ?
        ORDER BY snapshot_date DESC
        LIMIT ?
      `, [portfolio.id, days]);

      if (snapshots.length < 10) {
        return {
          portfolio_name: portfolio.name,
          error: 'Insufficient historical data for risk metrics calculation (need at least 10 days of snapshots)',
          hint: 'Portfolio snapshots are captured daily. Try again after more trading days.',
          current_value: portfolio.current_value + portfolio.current_cash
        };
      }

      // Reverse to chronological order
      snapshots.reverse();

      // Calculate daily returns
      const dailyReturns = [];
      const prices = snapshots.map(s => s.total_value);
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0) {
          dailyReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
      }

      if (dailyReturns.length < 5) {
        return {
          portfolio_name: portfolio.name,
          error: 'Insufficient data points for risk calculation',
          current_value: portfolio.current_value + portfolio.current_cash
        };
      }

      // Calculate metrics
      const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const annualReturn = avgDailyReturn * TRADING_DAYS_PER_YEAR;
      const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

      const sharpeRatio = calculateSharpe(annualReturn, volatility);
      const sortinoRatio = calculateSortino(dailyReturns, annualReturn);
      const drawdownInfo = calculateMaxDrawdown(prices);

      // Get benchmark comparison (S&P 500)
      const spyPrices = await this._query(`
        SELECT close
        FROM daily_prices dp
        JOIN companies c ON dp.company_id = c.id
        WHERE c.symbol = 'SPY'
        ORDER BY dp.date DESC
        LIMIT ?
      `, [days]);

      let benchmarkMetrics = null;
      let alpha = null;
      let beta = null;

      if (spyPrices.length >= dailyReturns.length) {
        spyPrices.reverse();
        const benchmarkReturns = [];
        for (let i = 1; i < Math.min(spyPrices.length, prices.length); i++) {
          if (spyPrices[i - 1].close > 0) {
            benchmarkReturns.push((spyPrices[i].close - spyPrices[i - 1].close) / spyPrices[i - 1].close);
          }
        }

        if (benchmarkReturns.length > 0) {
          const avgBenchmarkReturn = benchmarkReturns.reduce((a, b) => a + b, 0) / benchmarkReturns.length;
          const benchmarkAnnualReturn = avgBenchmarkReturn * TRADING_DAYS_PER_YEAR;
          const benchmarkVariance = benchmarkReturns.reduce((sum, r) => sum + Math.pow(r - avgBenchmarkReturn, 2), 0) / benchmarkReturns.length;
          const benchmarkVolatility = Math.sqrt(benchmarkVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

          // Calculate beta (covariance / variance of benchmark)
          const minLen = Math.min(dailyReturns.length, benchmarkReturns.length);
          let covariance = 0;
          for (let i = 0; i < minLen; i++) {
            covariance += (dailyReturns[i] - avgDailyReturn) * (benchmarkReturns[i] - avgBenchmarkReturn);
          }
          covariance /= minLen;
          beta = benchmarkVariance > 0 ? Math.round((covariance / benchmarkVariance) * 100) / 100 : null;

          // Calculate alpha (Jensen's alpha)
          if (beta !== null) {
            alpha = Math.round((annualReturn - (RISK_FREE_RATE + beta * (benchmarkAnnualReturn - RISK_FREE_RATE))) * 10000) / 100;
          }

          benchmarkMetrics = {
            benchmark: 'S&P 500 (SPY)',
            benchmark_return: Math.round(benchmarkAnnualReturn * 10000) / 100,
            benchmark_volatility: Math.round(benchmarkVolatility * 10000) / 100,
            benchmark_sharpe: calculateSharpe(benchmarkAnnualReturn, benchmarkVolatility)
          };
        }
      }

      return {
        portfolio_name: portfolio.name,
        period: period,
        data_points: dailyReturns.length,
        metrics: {
          annualized_return: Math.round(annualReturn * 10000) / 100,
          annualized_volatility: Math.round(volatility * 10000) / 100,
          sharpe_ratio: sharpeRatio,
          sortino_ratio: sortinoRatio,
          max_drawdown: drawdownInfo.maxDrawdown,
          beta: beta,
          alpha: alpha
        },
        interpretation: {
          sharpe: sharpeRatio > 1 ? 'Good risk-adjusted returns' :
                  sharpeRatio > 0.5 ? 'Acceptable risk-adjusted returns' :
                  sharpeRatio > 0 ? 'Below-average risk-adjusted returns' : 'Negative risk-adjusted returns',
          sortino: sortinoRatio > 1.5 ? 'Excellent downside risk management' :
                   sortinoRatio > 1 ? 'Good downside risk management' :
                   sortinoRatio > 0.5 ? 'Average downside risk' : 'High downside risk',
          drawdown: drawdownInfo.maxDrawdown > 30 ? 'Significant drawdown risk' :
                    drawdownInfo.maxDrawdown > 15 ? 'Moderate drawdown risk' : 'Low drawdown risk',
          alpha: alpha > 5 ? 'Significant outperformance vs benchmark' :
                 alpha > 0 ? 'Slight outperformance vs benchmark' :
                 alpha !== null ? 'Underperforming benchmark' : 'Benchmark comparison unavailable'
        },
        benchmark_comparison: benchmarkMetrics,
        risk_free_rate_used: `${RISK_FREE_RATE * 100}%`,
        methodology_note: 'Sharpe = (Return - RiskFreeRate) / Volatility. Sortino uses downside deviation instead of total volatility. Alpha measures excess return vs CAPM expected return.'
      };
    }

    // If symbol is provided, calculate single-stock metrics
    if (symbol) {
      const validation = await this.validateSymbol(symbol);
      if (!validation.valid) {
        return {
          error: validation.error,
          suggestions: validation.suggestions,
          hint: 'Please use a valid US stock ticker symbol like AAPL, MSFT, NVDA, etc.'
        };
      }

      const normalizedSymbol = symbol.toUpperCase();
      const company = await this._queryOne('SELECT id, name, sector FROM companies WHERE symbol = ?', [normalizedSymbol]);

      if (!company) {
        return { error: `Company ${normalizedSymbol} not found` };
      }

      const prices = await this._query(`
        SELECT date, close
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT ?
      `, [company.id, days]);

      if (prices.length < 20) {
        return {
          symbol: normalizedSymbol,
          error: 'Insufficient price history for risk metrics calculation (need at least 20 days)'
        };
      }

      prices.reverse();
      const closePrices = prices.map(p => p.close);

      // Calculate daily returns
      const dailyReturns = [];
      for (let i = 1; i < closePrices.length; i++) {
        if (closePrices[i - 1] > 0) {
          dailyReturns.push((closePrices[i] - closePrices[i - 1]) / closePrices[i - 1]);
        }
      }

      // Calculate metrics
      const avgDailyReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const annualReturn = avgDailyReturn * TRADING_DAYS_PER_YEAR;
      const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / dailyReturns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

      const sharpeRatio = calculateSharpe(annualReturn, volatility);
      const sortinoRatio = calculateSortino(dailyReturns, annualReturn);
      const drawdownInfo = calculateMaxDrawdown(closePrices);

      return {
        symbol: normalizedSymbol,
        company_name: company.name,
        sector: company.sector,
        period: period,
        data_points: dailyReturns.length,
        metrics: {
          annualized_return: Math.round(annualReturn * 10000) / 100,
          annualized_volatility: Math.round(volatility * 10000) / 100,
          sharpe_ratio: sharpeRatio,
          sortino_ratio: sortinoRatio,
          max_drawdown: drawdownInfo.maxDrawdown
        },
        interpretation: {
          sharpe: sharpeRatio > 1 ? 'Good risk-adjusted returns' :
                  sharpeRatio > 0.5 ? 'Acceptable risk-adjusted returns' :
                  sharpeRatio > 0 ? 'Below-average risk-adjusted returns' : 'Negative risk-adjusted returns',
          volatility: volatility > 0.4 ? 'High volatility (risky)' :
                      volatility > 0.25 ? 'Moderate volatility' : 'Low volatility (stable)'
        },
        methodology_note: 'Sharpe = (Return - RiskFreeRate) / Volatility. Higher is better. Risk-free rate used: ' + (RISK_FREE_RATE * 100) + '%'
      };
    }

    // No specific portfolio or symbol - return explanation
    return {
      message: 'Please specify either a portfolio_name or stock symbol to calculate risk metrics.',
      available_metrics: ['sharpe_ratio', 'sortino_ratio', 'alpha', 'beta', 'max_drawdown', 'volatility'],
      examples: [
        'Get risk metrics for my Growth Portfolio',
        'Show me Sharpe ratio for AAPL',
        'Calculate alpha and beta for NVDA'
      ]
    };
  }

  // ============================================
  // Tool: get_data_methodology
  // ============================================
  async getDataMethodology({ topic }) {
    const methodologies = {
      general: {
        title: 'Data Sources & Methodology Overview',
        description: 'This platform aggregates financial data from multiple institutional-grade sources to provide comprehensive investment analysis.',
        data_sources: [
          {
            category: 'Market Data',
            sources: ['Yahoo Finance API', 'Alpha Vantage'],
            update_frequency: 'Daily (after market close)',
            coverage: 'US equities, major ETFs, market indices',
            latency: '15-20 minute delay during market hours'
          },
          {
            category: 'Fundamental Data',
            sources: ['SEC EDGAR (10-K, 10-Q filings)', 'Company financial statements'],
            update_frequency: 'Quarterly (within 1-2 days of filing)',
            coverage: 'All US public companies',
            data_depth: '5+ years of historical financials'
          },
          {
            category: 'Institutional Holdings',
            sources: ['SEC 13F filings'],
            update_frequency: 'Quarterly (45 days after quarter end)',
            coverage: '5,000+ institutional investors',
            data_depth: 'Complete position history'
          },
          {
            category: 'Insider Activity',
            sources: ['SEC Form 4 filings'],
            update_frequency: 'Daily',
            coverage: 'All reported insider transactions'
          },
          {
            category: 'Sentiment Data',
            sources: ['StockTwits API', 'News aggregation'],
            update_frequency: 'Real-time to hourly',
            note: 'Social sentiment is supplementary, not primary analysis'
          }
        ],
        data_quality: {
          validation: 'Multi-source cross-validation for key metrics',
          error_handling: 'Outlier detection and flagging',
          missing_data: 'Clearly marked when data is unavailable',
          accuracy_target: '99%+ for price data, 95%+ for derived metrics'
        }
      },
      sharpe_ratio: {
        title: 'Sharpe Ratio Calculation Methodology',
        formula: 'Sharpe = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility',
        parameters: {
          returns: 'Arithmetic daily returns, annualized by multiplying by √252',
          risk_free_rate: '4.5% (current 10-year Treasury yield approximation)',
          volatility: 'Standard deviation of daily returns, annualized by multiplying by √252',
          period: 'Default: 1 year (252 trading days)'
        },
        interpretation: {
          '>2.0': 'Excellent - Very strong risk-adjusted returns',
          '1.0-2.0': 'Good - Above-average risk-adjusted returns',
          '0.5-1.0': 'Acceptable - Moderate risk-adjusted returns',
          '0-0.5': 'Below average - Low risk-adjusted returns',
          '<0': 'Poor - Negative risk-adjusted returns'
        },
        limitations: [
          'Assumes normally distributed returns (may underestimate tail risk)',
          'Backward-looking metric - past performance doesn\'t guarantee future results',
          'Can be manipulated by smoothing returns or leverage'
        ]
      },
      sortino_ratio: {
        title: 'Sortino Ratio Calculation Methodology',
        formula: 'Sortino = (Portfolio Return - Risk-Free Rate) / Downside Deviation',
        difference_from_sharpe: 'Uses only negative returns (downside volatility) instead of total volatility, better for asymmetric return distributions',
        parameters: {
          downside_deviation: 'Standard deviation of negative returns only, annualized',
          minimum_acceptable_return: 'Risk-free rate (4.5%)'
        },
        interpretation: {
          '>2.0': 'Excellent downside risk management',
          '1.0-2.0': 'Good downside protection',
          '0.5-1.0': 'Average downside risk',
          '<0.5': 'High downside risk'
        },
        when_to_use: 'Better than Sharpe when returns are not normally distributed or when you care more about avoiding losses than capturing upside volatility'
      },
      alpha: {
        title: 'Alpha (Jensen\'s Alpha) Calculation Methodology',
        formula: 'Alpha = Portfolio Return - [Risk-Free Rate + Beta × (Market Return - Risk-Free Rate)]',
        description: 'Measures excess return above what would be expected given the portfolio\'s market risk (beta)',
        benchmark: 'S&P 500 (SPY) used as market proxy',
        interpretation: {
          'Positive alpha': 'Outperforming the market on a risk-adjusted basis (generating excess returns)',
          'Zero alpha': 'Performing as expected given market risk',
          'Negative alpha': 'Underperforming on a risk-adjusted basis'
        },
        limitations: [
          'Depends on accuracy of beta estimate',
          'Single-factor model - doesn\'t account for size, value, momentum factors',
          'Backward-looking'
        ]
      },
      beta: {
        title: 'Beta Calculation Methodology',
        formula: 'Beta = Covariance(Portfolio, Market) / Variance(Market)',
        description: 'Measures sensitivity of portfolio returns to market movements',
        benchmark: 'S&P 500 (SPY)',
        interpretation: {
          'Beta = 1': 'Moves in line with market',
          'Beta > 1': 'More volatile than market (amplifies moves)',
          'Beta < 1': 'Less volatile than market (dampens moves)',
          'Beta < 0': 'Negatively correlated with market (rare)'
        },
        calculation_period: 'Default 1 year of daily returns'
      },
      correlations: {
        title: 'Correlation Calculation Methodology',
        formula: 'Pearson correlation coefficient between daily returns',
        period: '90 days default (can be adjusted)',
        interpretation: {
          '0.7 to 1.0': 'Strong positive correlation',
          '0.3 to 0.7': 'Moderate positive correlation',
          '-0.3 to 0.3': 'Weak/no correlation',
          '-0.7 to -0.3': 'Moderate negative correlation',
          '-1.0 to -0.7': 'Strong negative correlation'
        },
        use_cases: [
          'Portfolio diversification analysis',
          'Identifying hedging opportunities',
          'Risk aggregation'
        ]
      },
      valuation_metrics: {
        title: 'Valuation Metrics Methodology',
        metrics: {
          pe_ratio: {
            formula: 'Price / Earnings Per Share (TTM)',
            source: 'Latest quarterly filing + current price',
            note: 'Negative earnings result in N/A'
          },
          pb_ratio: {
            formula: 'Price / Book Value Per Share',
            source: 'Latest balance sheet book value'
          },
          ev_ebitda: {
            formula: 'Enterprise Value / EBITDA (TTM)',
            source: 'Market cap + debt - cash, divided by trailing EBITDA'
          },
          fcf_yield: {
            formula: 'Free Cash Flow / Market Cap × 100',
            source: 'TTM free cash flow from cash flow statement'
          }
        },
        update_frequency: 'Quarterly with financial statements, daily price updates'
      }
    };

    const requestedTopic = topic?.toLowerCase() || 'general';

    // Find matching topic
    if (methodologies[requestedTopic]) {
      return methodologies[requestedTopic];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(methodologies)) {
      if (key.includes(requestedTopic) || requestedTopic.includes(key)) {
        return value;
      }
    }

    // Return general overview with available topics
    return {
      ...methodologies.general,
      available_topics: Object.keys(methodologies),
      hint: `Ask about specific topics: ${Object.keys(methodologies).join(', ')}`
    };
  }
}

module.exports = { ToolExecutor };
