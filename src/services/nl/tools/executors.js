/**
 * Tool Executors for Claude API tool calling
 *
 * Each executor implements the logic to fetch data from our database
 * and return it in a format Claude can use to answer questions.
 */

const db = require('../../../database');

class ToolExecutor {
  constructor() {
    this.db = db.getDatabase();
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
    const normalizedSymbol = symbol.toUpperCase();

    // Get company info and latest metrics
    const result = this.db.prepare(`
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
    `).get(normalizedSymbol);

    if (!result) {
      return { error: `No data found for symbol ${normalizedSymbol}` };
    }

    // Get analyst estimates if available
    const analystData = this.db.prepare(`
      SELECT target_mean, target_high, target_low, recommendation_key,
             upside_potential, strong_buy, buy, hold, sell, strong_sell
      FROM analyst_estimates
      WHERE company_id = ?
    `).get(result.id);

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
    let whereClauses = ['c.is_active = 1'];
    let params = [];

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

    const results = this.db.prepare(sql).all(...params);

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
    const normalizedSymbol = symbol.toUpperCase();
    const safeDays = Math.min(Math.max(1, days), 365);

    const company = this.db.prepare('SELECT id, name FROM companies WHERE symbol = ?').get(normalizedSymbol);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const prices = this.db.prepare(`
      SELECT date, open, high, low, close, volume
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(company.id, safeDays);

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

    // Add chart data for frontend rendering
    response.chart_data = {
      type: 'area',
      title: `${normalizedSymbol} Price (${safeDays} Days)`,
      data: prices.map(p => ({
        time: p.date,
        value: p.close
      })),
      color: periodReturn >= 0 ? '#22c55e' : '#ef4444'
    };

    return response;
  }

  // ============================================
  // Tool: calculate_metric
  // ============================================
  async calculateMetric({ symbol, metric, parameters = {} }) {
    const normalizedSymbol = symbol.toUpperCase();

    // Get company and financial data
    const company = this.db.prepare(`
      SELECT c.id, c.symbol, c.name, c.market_cap,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
      FROM companies c WHERE c.symbol = ?
    `).get(normalizedSymbol);

    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    // Get latest financial data
    const financials = this.db.prepare(`
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
    `).get(normalizedSymbol);

    if (!financials) {
      return { error: `No financial data found for ${normalizedSymbol}` };
    }

    // Parse full data JSON if needed
    let fullData = {};
    try {
      fullData = JSON.parse(financials.data || '{}');
    } catch (e) { /* ignore */ }

    // Get metrics for additional data
    const metrics = this.db.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC LIMIT 1
    `).get(company.id);

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

        return {
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

    const company = this.db.prepare('SELECT id, name FROM companies WHERE symbol = ?').get(normalizedSymbol);
    if (!company) {
      return { error: `Company ${normalizedSymbol} not found` };
    }

    const response = {
      symbol: normalizedSymbol,
      name: company.name,
      sources: {}
    };

    // Get combined sentiment summary
    const combined = this.db.prepare(`
      SELECT * FROM combined_sentiment
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `).get(company.id);

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
      const analyst = this.db.prepare(`
        SELECT recommendation_key, recommendation_mean, upside_potential,
               strong_buy, buy, hold, sell, strong_sell, signal, signal_strength
        FROM analyst_estimates
        WHERE company_id = ?
      `).get(company.id);

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
      const news = this.db.prepare(`
        SELECT title, source, sentiment_label, published_at
        FROM news_articles
        WHERE company_id = ?
        ORDER BY published_at DESC
        LIMIT 5
      `).all(company.id);

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
    const investorData = this.db.prepare(`
      SELECT id, name, fund_name, cik, latest_filing_date, latest_portfolio_value as total_value
      FROM famous_investors
      WHERE (name LIKE ? OR fund_name LIKE ?) AND is_active = 1
      LIMIT 1
    `).get(`%${investorName}%`, `%${investorName}%`);

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
      const holding = this.db.prepare(`
        SELECT
          ih.shares, ih.market_value, ih.portfolio_weight, ih.change_type,
          ih.shares_change, ih.shares_change_pct,
          c.symbol, c.name
        FROM investor_holdings ih
        JOIN companies c ON ih.company_id = c.id
        WHERE ih.investor_id = ? AND c.symbol = ? AND ih.filing_date = ?
      `).get(investorData.id, normalizedSymbol, investorData.latest_filing_date);

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
    const holdings = this.db.prepare(`
      SELECT
        ih.shares, ih.market_value, ih.portfolio_weight, ih.change_type,
        ih.shares_change, ih.prev_shares,
        c.symbol, c.name, c.sector
      FROM investor_holdings ih
      JOIN companies c ON ih.company_id = c.id
      WHERE ih.investor_id = ? AND ih.filing_date = ?
      ORDER BY ih.portfolio_weight DESC
      LIMIT 20
    `).all(investorData.id, investorData.latest_filing_date);

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

    const company = this.db.prepare('SELECT id, name FROM companies WHERE symbol = ?').get(normalizedSymbol);
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
      const data = this.db.prepare(`
        SELECT fiscal_date_ending, fiscal_year, data
        FROM financial_data
        WHERE company_id = ? AND statement_type = ? AND period_type = ?
        ORDER BY fiscal_date_ending DESC
        LIMIT ?
      `).all(company.id, stmtType, period_type, periods);

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
      const econData = this.db.prepare(`
        SELECT series_id, value, observation_date, series_name, category
        FROM economic_indicators
        WHERE series_id IN (
          'DFF', 'FEDFUNDS', 'DGS10', 'DGS2', 'T10Y2Y', 'T10Y3M', 'CPIAUCSL',
          'UNRATE', 'GDP', 'GDPC1', 'VIXCLS', 'BAMLH0A0HYM2', 'STLFSI4', 'RECPROUSM156N'
        )
        ORDER BY observation_date DESC
      `).all();

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
      const latestRegime = this.db.prepare(`
        SELECT * FROM macro_regimes
        ORDER BY regime_date DESC
        LIMIT 1
      `).get();

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
      const regimeData = this.db.prepare(`
        SELECT * FROM macro_regimes
        ORDER BY calculation_date DESC
        LIMIT 1
      `).get();

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
    const marketSentiment = this.db.prepare(`
      SELECT indicator_value, indicator_label, fetched_at
      FROM market_sentiment
      WHERE indicator_type = 'cnn_fear_greed'
      ORDER BY fetched_at DESC
      LIMIT 1
    `).get();

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
      const data = this.db.prepare(`
        SELECT
          c.symbol, c.name, c.sector, c.industry, c.market_cap,
          m.*,
          (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
        FROM companies c
        LEFT JOIN calculated_metrics m ON c.id = m.company_id
        WHERE c.symbol = ?
        ORDER BY m.fiscal_period DESC
        LIMIT 1
      `).get(symbol);

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

    return comparison;
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

    const company = this.db.prepare(`
      SELECT c.id, c.symbol, c.name, c.market_cap,
        (SELECT close FROM daily_prices WHERE company_id = c.id ORDER BY date DESC LIMIT 1) as current_price
      FROM companies c WHERE c.symbol = ?
    `).get(normalizedSymbol);

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
      const dcf = this.db.prepare(`
        SELECT * FROM dcf_valuations
        WHERE company_id = ?
        ORDER BY calculated_at DESC
        LIMIT 1
      `).get(company.id);

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
      const analyst = this.db.prepare(`
        SELECT target_mean, target_high, target_low, upside_potential,
               recommendation_key, number_of_analysts
        FROM analyst_estimates
        WHERE company_id = ?
      `).get(company.id);

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
}

module.exports = { ToolExecutor };
