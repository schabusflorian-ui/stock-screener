// src/services/signals/valueSignals.js
// Value Investing Signals: Piotroski F-Score, Altman Z-Score, Magic Formula
// These signals are specifically designed for value/quality investing strategies

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

/**
 * ValueSignals
 *
 * Implements classic value investing metrics:
 *
 * 1. Piotroski F-Score (0-9): Fundamental quality score
 *    - 9 binary signals for profitability, leverage, and efficiency
 *    - High score (7-9) = strong fundamentals
 *    - Low score (0-3) = weak fundamentals
 *
 * 2. Altman Z-Score: Bankruptcy prediction
 *    - Z > 2.99 = Safe zone
 *    - 1.81 < Z < 2.99 = Grey zone
 *    - Z < 1.81 = Distress zone
 *
 * 3. Magic Formula (Greenblatt): Earnings Yield + Return on Capital
 *    - Ranks stocks by cheapness and quality
 *    - Combined rank identifies best value opportunities
 *
 * 4. Quality-Adjusted P/E (GARP): Growth at Reasonable Price
 *    - PEG ratio adjusted for quality metrics
 *
 * 5. Contrarian Value: Insider buying during drawdowns
 */
class ValueSignals {
  constructor(dbInstance = null) {
    this.db = dbInstance;
    this.dbPromise = null;
    this.normalizedDb = null;
    console.log('📊 Value Signals initialized (Piotroski, Altman, Magic Formula)');
  }

  async _getDatabase() {
    if (this.normalizedDb) return this.normalizedDb;
    if (this.db) {
      this.normalizedDb = this._normalizeDb(this.db);
      return this.normalizedDb;
    }
    if (!this.dbPromise) {
      this.dbPromise = getDatabaseAsync();
    }
    return this.dbPromise;
  }

  _normalizeDb(database) {
    if (database?.query) return database;
    if (!database?.prepare) {
      throw new Error('Unsupported database instance for ValueSignals');
    }

    return {
      query: async (sql, params = []) => {
        const normalizedSql = sql.replace(/\$\d+/g, '?');
        const normalizedParams = params.map((param) => {
          if (typeof param === 'boolean') return param ? 1 : 0;
          return param;
        });
        const stmt = database.prepare(normalizedSql);
        if (/^\s*select\b/i.test(normalizedSql)) {
          return { rows: stmt.all(normalizedParams) };
        }
        const info = stmt.run(normalizedParams);
        return { rows: [], lastInsertRowid: info.lastInsertRowid, changes: info.changes };
      },
    };
  }

  async _getFinancials(companyId) {
    const database = await this._getDatabase();
    const result = await database.query(
      `
        SELECT
          f.*,
          c.symbol,
          c.name,
          c.sector,
          c.market_cap
        FROM financial_data f
        JOIN companies c ON f.company_id = c.id
        WHERE f.company_id = $1
          AND f.statement_type = 'income_statement'
          AND f.period_type = 'annual'
        ORDER BY f.fiscal_date_ending DESC
        LIMIT 2
      `,
      [companyId]
    );
    return result.rows;
  }

  async _getBalanceSheet(companyId) {
    const database = await this._getDatabase();
    const result = await database.query(
      `
        SELECT *
        FROM financial_data
        WHERE company_id = $1
          AND statement_type = 'balance_sheet'
          AND period_type = 'annual'
        ORDER BY fiscal_date_ending DESC
        LIMIT 2
      `,
      [companyId]
    );
    return result.rows;
  }

  async _getCashFlow(companyId) {
    const database = await this._getDatabase();
    const result = await database.query(
      `
        SELECT *
        FROM financial_data
        WHERE company_id = $1
          AND statement_type = 'cash_flow'
          AND period_type = 'annual'
        ORDER BY fiscal_date_ending DESC
        LIMIT 2
      `,
      [companyId]
    );
    return result.rows;
  }

  async _getPriceMetrics(companyId) {
    const database = await this._getDatabase();
    const result = await database.query(
      `
        SELECT *
        FROM price_metrics
        WHERE company_id = $1
      `,
      [companyId]
    );
    return result.rows[0];
  }

  async _getPriceDrawdown(companyId) {
    const database = await this._getDatabase();
    const result = await database.query(
      `
        SELECT
          pm.high_52w,
          pm.last_price,
          pm.change_1m,
          pm.change_3m
        FROM price_metrics pm
        WHERE pm.company_id = $1
        LIMIT 1
      `,
      [companyId]
    );
    return result.rows[0];
  }

  async _getInsiderBuysDuringDrawdown(companyId) {
    const database = await this._getDatabase();
    const dateFilter = isUsingPostgres()
      ? "CURRENT_DATE - INTERVAL '90 days'"
      : "date('now', '-90 days')";
    const result = await database.query(
      `
        SELECT
          it.transaction_date,
          it.shares_transacted,
          it.total_value,
          i.name as insider_name,
          i.title
        FROM insider_transactions it
        JOIN insiders i ON it.insider_id = i.id
        WHERE it.company_id = $1
          AND it.transaction_code = 'P'
          AND it.acquisition_disposition = 'A'
          AND it.transaction_date >= ${dateFilter}
        ORDER BY it.transaction_date DESC
      `,
      [companyId]
    );
    return result.rows;
  }

  async _getAllCompanies() {
    const database = await this._getDatabase();
    const result = await database.query(
      `
        SELECT id, symbol, name, sector, market_cap
        FROM companies
        WHERE market_cap > 0
          AND symbol NOT LIKE 'CIK_%'
        ORDER BY market_cap DESC
      `
    );
    return result.rows;
  }

  // ============================================
  // PIOTROSKI F-SCORE
  // ============================================

  /**
   * Calculate Piotroski F-Score (0-9)
   *
   * Profitability (4 points):
   * 1. ROA > 0
   * 2. Operating Cash Flow > 0
   * 3. ROA increasing YoY
   * 4. Cash Flow > Net Income (accruals quality)
   *
   * Leverage/Liquidity (3 points):
   * 5. Long-term debt ratio decreasing
   * 6. Current ratio increasing
   * 7. No new shares issued
   *
   * Operating Efficiency (2 points):
   * 8. Gross margin increasing
   * 9. Asset turnover increasing
   */
  async calculatePiotroskiScore(companyId) {
    const incomeData = await this._getFinancials(companyId);
    const balanceData = await this._getBalanceSheet(companyId);
    const cashFlowData = await this._getCashFlow(companyId);

    if (incomeData.length < 2 || balanceData.length < 2 || cashFlowData.length < 2) {
      return { score: null, details: null, error: 'Insufficient historical data' };
    }

    const current = {
      income: incomeData[0],
      balance: balanceData[0],
      cashFlow: cashFlowData[0],
    };
    const prior = {
      income: incomeData[1],
      balance: balanceData[1],
      cashFlow: cashFlowData[1],
    };

    const details = {};
    let score = 0;

    // --- PROFITABILITY ---

    // 1. ROA > 0
    const netIncome = this._getField(current.income, ['net_income', 'netIncome']);
    const totalAssets = this._getField(current.balance, ['total_assets', 'totalAssets']);
    const roa = totalAssets > 0 ? (netIncome / totalAssets) : null;
    details.roa = roa;
    if (roa !== null && roa > 0) {
      score++;
      details.roa_positive = true;
    } else {
      details.roa_positive = false;
    }

    // 2. Operating Cash Flow > 0
    const ocf = this._getField(current.cashFlow, ['operating_cash_flow', 'operatingCashflow', 'cash_from_operations']);
    details.ocf = ocf;
    if (ocf !== null && ocf > 0) {
      score++;
      details.ocf_positive = true;
    } else {
      details.ocf_positive = false;
    }

    // 3. ROA increasing YoY
    const priorNetIncome = this._getField(prior.income, ['net_income', 'netIncome']);
    const priorTotalAssets = this._getField(prior.balance, ['total_assets', 'totalAssets']);
    const priorRoa = priorTotalAssets > 0 ? (priorNetIncome / priorTotalAssets) : null;
    if (roa !== null && priorRoa !== null && roa > priorRoa) {
      score++;
      details.roa_increasing = true;
    } else {
      details.roa_increasing = false;
    }

    // 4. Accruals: Operating CF > Net Income
    if (ocf !== null && netIncome !== null && ocf > netIncome) {
      score++;
      details.accruals_quality = true;
    } else {
      details.accruals_quality = false;
    }

    // --- LEVERAGE / LIQUIDITY ---

    // 5. Long-term debt ratio decreasing
    const ltDebt = this._getField(current.balance, ['long_term_debt', 'longTermDebt']);
    const priorLtDebt = this._getField(prior.balance, ['long_term_debt', 'longTermDebt']);
    const ltDebtRatio = totalAssets > 0 ? (ltDebt || 0) / totalAssets : null;
    const priorLtDebtRatio = priorTotalAssets > 0 ? (priorLtDebt || 0) / priorTotalAssets : null;
    details.lt_debt_ratio = ltDebtRatio;
    if (ltDebtRatio !== null && priorLtDebtRatio !== null && ltDebtRatio <= priorLtDebtRatio) {
      score++;
      details.leverage_decreasing = true;
    } else {
      details.leverage_decreasing = false;
    }

    // 6. Current ratio increasing
    const currentAssets = this._getField(current.balance, ['total_current_assets', 'currentAssets']);
    const currentLiabilities = this._getField(current.balance, ['total_current_liabilities', 'currentLiabilities']);
    const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;

    const priorCurrentAssets = this._getField(prior.balance, ['total_current_assets', 'currentAssets']);
    const priorCurrentLiabilities = this._getField(prior.balance, ['total_current_liabilities', 'currentLiabilities']);
    const priorCurrentRatio = priorCurrentLiabilities > 0 ? priorCurrentAssets / priorCurrentLiabilities : null;

    details.current_ratio = currentRatio;
    if (currentRatio !== null && priorCurrentRatio !== null && currentRatio > priorCurrentRatio) {
      score++;
      details.liquidity_increasing = true;
    } else {
      details.liquidity_increasing = false;
    }

    // 7. No share dilution (shares outstanding not increased)
    const sharesOut = this._getField(current.balance, ['common_stock_shares_outstanding', 'sharesOutstanding']);
    const priorSharesOut = this._getField(prior.balance, ['common_stock_shares_outstanding', 'sharesOutstanding']);
    details.shares_outstanding = sharesOut;
    if (sharesOut !== null && priorSharesOut !== null && sharesOut <= priorSharesOut) {
      score++;
      details.no_dilution = true;
    } else {
      details.no_dilution = false;
    }

    // --- OPERATING EFFICIENCY ---

    // 8. Gross margin increasing
    const revenue = this._getField(current.income, ['total_revenue', 'revenue', 'totalRevenue']);
    const cogs = this._getField(current.income, ['cost_of_revenue', 'costOfRevenue', 'cost_of_goods_sold']);
    const grossProfit = revenue && cogs ? revenue - cogs : this._getField(current.income, ['gross_profit', 'grossProfit']);
    const grossMargin = revenue > 0 ? (grossProfit / revenue) : null;

    const priorRevenue = this._getField(prior.income, ['total_revenue', 'revenue', 'totalRevenue']);
    const priorCogs = this._getField(prior.income, ['cost_of_revenue', 'costOfRevenue', 'cost_of_goods_sold']);
    const priorGrossProfit = priorRevenue && priorCogs ? priorRevenue - priorCogs : this._getField(prior.income, ['gross_profit', 'grossProfit']);
    const priorGrossMargin = priorRevenue > 0 ? (priorGrossProfit / priorRevenue) : null;

    details.gross_margin = grossMargin;
    if (grossMargin !== null && priorGrossMargin !== null && grossMargin > priorGrossMargin) {
      score++;
      details.margin_improving = true;
    } else {
      details.margin_improving = false;
    }

    // 9. Asset turnover increasing
    const assetTurnover = totalAssets > 0 ? (revenue / totalAssets) : null;
    const priorAssetTurnover = priorTotalAssets > 0 ? (priorRevenue / priorTotalAssets) : null;
    details.asset_turnover = assetTurnover;
    if (assetTurnover !== null && priorAssetTurnover !== null && assetTurnover > priorAssetTurnover) {
      score++;
      details.efficiency_improving = true;
    } else {
      details.efficiency_improving = false;
    }

    return {
      score,
      maxScore: 9,
      interpretation: this._interpretPiotroski(score),
      details,
    };
  }

  _interpretPiotroski(score) {
    if (score >= 8) return 'Strong fundamentals - high quality value candidate';
    if (score >= 6) return 'Above average fundamentals';
    if (score >= 4) return 'Average fundamentals';
    if (score >= 2) return 'Below average fundamentals';
    return 'Weak fundamentals - potential value trap';
  }

  // ============================================
  // ALTMAN Z-SCORE
  // ============================================

  /**
   * Calculate Altman Z-Score for bankruptcy prediction
   *
   * Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
   *
   * A = Working Capital / Total Assets
   * B = Retained Earnings / Total Assets
   * C = EBIT / Total Assets
   * D = Market Cap / Total Liabilities
   * E = Revenue / Total Assets
   *
   * Zones:
   * Z > 2.99: Safe
   * 1.81 < Z < 2.99: Grey (uncertain)
   * Z < 1.81: Distress (high bankruptcy risk)
   */
  async calculateAltmanZScore(companyId) {
    const balanceData = await this._getBalanceSheet(companyId);
    const incomeData = await this._getFinancials(companyId);
    const priceMetrics = await this._getPriceMetrics(companyId);

    if (balanceData.length === 0 || incomeData.length === 0) {
      return { zScore: null, zone: null, error: 'Insufficient data' };
    }

    const balance = balanceData[0];
    const income = incomeData[0];

    const totalAssets = this._getField(balance, ['total_assets', 'totalAssets']);
    const totalLiabilities = this._getField(balance, ['total_liabilities', 'totalLiabilities']);
    const currentAssets = this._getField(balance, ['total_current_assets', 'currentAssets']);
    const currentLiabilities = this._getField(balance, ['total_current_liabilities', 'currentLiabilities']);
    const retainedEarnings = this._getField(balance, ['retained_earnings', 'retainedEarnings']);
    const revenue = this._getField(income, ['total_revenue', 'revenue', 'totalRevenue']);
    const ebit = this._getField(income, ['operating_income', 'ebit', 'operatingIncome']);
    const marketCap = priceMetrics?.market_cap || income.market_cap;

    if (!totalAssets || totalAssets <= 0) {
      return { zScore: null, zone: null, error: 'Missing total assets' };
    }

    // Calculate components
    const workingCapital = (currentAssets || 0) - (currentLiabilities || 0);
    const A = workingCapital / totalAssets;
    const B = (retainedEarnings || 0) / totalAssets;
    const C = (ebit || 0) / totalAssets;
    const D = totalLiabilities > 0 ? (marketCap || 0) / totalLiabilities : 0;
    const E = (revenue || 0) / totalAssets;

    // Calculate Z-Score
    const zScore = 1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E;

    // Determine zone
    let zone, interpretation;
    if (zScore > 2.99) {
      zone = 'SAFE';
      interpretation = 'Low bankruptcy risk';
    } else if (zScore > 1.81) {
      zone = 'GREY';
      interpretation = 'Moderate bankruptcy risk - requires monitoring';
    } else {
      zone = 'DISTRESS';
      interpretation = 'High bankruptcy risk - potential value trap';
    }

    return {
      zScore: Math.round(zScore * 100) / 100,
      zone,
      interpretation,
      components: {
        A_workingCapitalRatio: Math.round(A * 1000) / 1000,
        B_retainedEarningsRatio: Math.round(B * 1000) / 1000,
        C_ebitRatio: Math.round(C * 1000) / 1000,
        D_marketToDebt: Math.round(D * 1000) / 1000,
        E_assetTurnover: Math.round(E * 1000) / 1000,
      },
    };
  }

  // ============================================
  // MAGIC FORMULA (GREENBLATT)
  // ============================================

  /**
   * Calculate Magic Formula metrics for a company
   *
   * Magic Formula ranks stocks by:
   * 1. Earnings Yield (EBIT / Enterprise Value) - cheapness
   * 2. Return on Capital (EBIT / (Net Working Capital + Net Fixed Assets)) - quality
   *
   * Combined rank (lowest = best) identifies cheap, high-quality stocks
   */
  async calculateMagicFormula(companyId) {
    const balanceData = await this._getBalanceSheet(companyId);
    const incomeData = await this._getFinancials(companyId);
    const priceMetrics = await this._getPriceMetrics(companyId);

    if (balanceData.length === 0 || incomeData.length === 0) {
      return { earningsYield: null, returnOnCapital: null, error: 'Insufficient data' };
    }

    const balance = balanceData[0];
    const income = incomeData[0];

    const ebit = this._getField(income, ['operating_income', 'ebit', 'operatingIncome']);
    const marketCap = priceMetrics?.market_cap || income.market_cap;
    const totalDebt = this._getField(balance, ['total_debt', 'totalDebt', 'long_term_debt']) || 0;
    const cash = this._getField(balance, ['cash_and_equivalents', 'cash', 'cashAndEquivalents']) || 0;
    const currentAssets = this._getField(balance, ['total_current_assets', 'currentAssets']) || 0;
    const currentLiabilities = this._getField(balance, ['total_current_liabilities', 'currentLiabilities']) || 0;
    const ppe = this._getField(balance, ['property_plant_equipment', 'ppe', 'netPPE']) || 0;

    // Enterprise Value = Market Cap + Total Debt - Cash
    const enterpriseValue = (marketCap || 0) + totalDebt - cash;

    // Earnings Yield = EBIT / Enterprise Value
    const earningsYield = enterpriseValue > 0 ? (ebit || 0) / enterpriseValue : null;

    // Net Working Capital (excluding cash)
    const netWorkingCapital = currentAssets - cash - currentLiabilities;

    // Invested Capital = NWC + Net Fixed Assets
    const investedCapital = netWorkingCapital + ppe;

    // Return on Capital = EBIT / Invested Capital
    const returnOnCapital = investedCapital > 0 ? (ebit || 0) / investedCapital : null;

    return {
      earningsYield: earningsYield !== null ? Math.round(earningsYield * 10000) / 100 : null, // As percentage
      returnOnCapital: returnOnCapital !== null ? Math.round(returnOnCapital * 10000) / 100 : null, // As percentage
      ebit,
      enterpriseValue,
      investedCapital,
      interpretation: this._interpretMagicFormula(earningsYield, returnOnCapital),
    };
  }

  _interpretMagicFormula(earningsYield, roc) {
    if (earningsYield === null || roc === null) return 'Insufficient data';

    const ey = earningsYield * 100; // Convert to percentage for comparison
    const rocPct = roc * 100;

    if (ey > 15 && rocPct > 25) return 'Strong Magic Formula candidate - cheap and high quality';
    if (ey > 10 && rocPct > 15) return 'Good Magic Formula candidate';
    if (ey > 5 && rocPct > 10) return 'Average Magic Formula metrics';
    if (ey < 5 || rocPct < 5) return 'Weak Magic Formula metrics - either expensive or low quality';
    return 'Mixed Magic Formula metrics';
  }

  // ============================================
  // COMBINED VALUE SCORE
  // ============================================

  /**
   * Calculate comprehensive value score combining all signals
   */
  async calculateCombinedValueScore(companyId) {
    const [piotroski, altman, magicFormula] = await Promise.all([
      this.calculatePiotroskiScore(companyId),
      this.calculateAltmanZScore(companyId),
      this.calculateMagicFormula(companyId),
    ]);

    // Normalize scores to 0-100 scale
    let score = 0;
    let confidence = 0;
    let components = 0;

    // Piotroski contribution (0-33 points)
    if (piotroski.score !== null) {
      score += (piotroski.score / 9) * 33;
      confidence += 0.33;
      components++;
    }

    // Altman Z contribution (0-33 points)
    if (altman.zScore !== null) {
      // Map Z-score to 0-33: Z < 1.81 = 0, Z > 3.5 = 33
      const altmanNorm = Math.max(0, Math.min(33, ((altman.zScore - 1.81) / (3.5 - 1.81)) * 33));
      score += altmanNorm;
      confidence += 0.33;
      components++;
    }

    // Magic Formula contribution (0-34 points)
    if (magicFormula.earningsYield !== null && magicFormula.returnOnCapital !== null) {
      // Higher earnings yield and ROC = better
      const eyScore = Math.min(17, magicFormula.earningsYield); // Cap at 17%
      const rocScore = Math.min(17, magicFormula.returnOnCapital / 2); // ROC up to 34% = 17 points
      score += eyScore + rocScore;
      confidence += 0.34;
      components++;
    }

    const finalScore = components > 0 ? Math.round(score * (1 / confidence)) : null;

    return {
      combinedScore: finalScore,
      confidence,
      piotroski,
      altman,
      magicFormula,
      interpretation: this._interpretCombinedScore(finalScore, piotroski, altman, magicFormula),
    };
  }

  _interpretCombinedScore(score, piotroski, altman, magicFormula) {
    if (score === null) return 'Insufficient data for value analysis';

    const warnings = [];

    // Check for value traps
    if (altman.zone === 'DISTRESS') {
      warnings.push('High bankruptcy risk');
    }
    if (piotroski.score !== null && piotroski.score <= 3) {
      warnings.push('Weak fundamentals');
    }

    if (warnings.length > 0) {
      return `Potential value trap: ${warnings.join(', ')}`;
    }

    if (score >= 80) return 'Excellent value opportunity - high quality at attractive price';
    if (score >= 60) return 'Good value candidate';
    if (score >= 40) return 'Average value metrics';
    return 'Poor value metrics';
  }

  // ============================================
  // CONTRARIAN SIGNAL: INSIDER BUYING + DRAWDOWN
  // ============================================

  /**
   * Detect insider buying during price drawdowns
   * This is a strong contrarian bullish signal
   */
  async getContrarianSignal(companyId) {
    const drawdown = await this._getPriceDrawdown(companyId);
    const insiderBuys = await this._getInsiderBuysDuringDrawdown(companyId);

    if (!drawdown) {
      return { signal: 'neutral', confidence: 0, error: 'No price data' };
    }

    const { high_52w, last_price, change_1m, change_3m } = drawdown;

    // Calculate drawdown from 52-week high
    const drawdownPct = high_52w > 0 ? ((high_52w - last_price) / high_52w) * 100 : 0;
    const isInDrawdown = drawdownPct > 15; // More than 15% off highs

    // Calculate total insider buying
    const totalInsiderBuying = insiderBuys.reduce((sum, buy) => sum + (buy.total_value || 0), 0);
    const buyCount = insiderBuys.length;

    let signal = 'neutral';
    let score = 0;
    let confidence = 0.3;

    if (isInDrawdown && buyCount > 0) {
      // Strong contrarian signal: insiders buying during drawdown
      signal = 'bullish';
      score = 0.7;
      confidence = 0.7;

      if (totalInsiderBuying > 100000) {
        score = 0.85;
        confidence = 0.8;
      }
      if (totalInsiderBuying > 500000) {
        score = 0.95;
        confidence = 0.9;
      }
    } else if (isInDrawdown && buyCount === 0) {
      // In drawdown but no insider buying - could be value trap
      signal = 'cautious';
      score = -0.2;
      confidence = 0.4;
    } else if (!isInDrawdown && buyCount > 0) {
      // Insider buying without drawdown - moderately bullish
      signal = 'bullish';
      score = 0.3;
      confidence = 0.5;
    }

    return {
      signal,
      score,
      confidence,
      drawdownPct: Math.round(drawdownPct * 10) / 10,
      change1m: change_1m,
      change3m: change_3m,
      insiderBuys: buyCount,
      totalInsiderBuyValue: totalInsiderBuying,
      insiderDetails: insiderBuys.slice(0, 5), // Top 5 buys
      interpretation: this._interpretContrarianSignal(signal, drawdownPct, buyCount, totalInsiderBuying),
    };
  }

  _interpretContrarianSignal(signal, drawdown, buyCount, buyValue) {
    if (signal === 'bullish' && drawdown > 15) {
      return `Strong contrarian buy signal: ${buyCount} insider buys ($${(buyValue / 1000).toFixed(0)}K) during ${drawdown.toFixed(0)}% drawdown`;
    }
    if (signal === 'cautious') {
      return `Stock in ${drawdown.toFixed(0)}% drawdown with no insider buying - potential value trap`;
    }
    if (signal === 'bullish') {
      return `Insider buying detected (${buyCount} transactions)`;
    }
    return 'No significant contrarian signal';
  }

  // ============================================
  // SCREENING & RANKING
  // ============================================

  /**
   * Screen for top value stocks using Magic Formula ranking
   */
  async screenMagicFormula(options = {}) {
    const { limit = 50, minMarketCap = 500000000, excludeFinancials = true } = options;

    const companies = await this._getAllCompanies();
    const results = [];

    for (const company of companies) {
      if (company.market_cap < minMarketCap) continue;
      if (excludeFinancials && company.sector?.toLowerCase().includes('financial')) continue;

      const mf = await this.calculateMagicFormula(company.id);
      if (mf.earningsYield === null || mf.returnOnCapital === null) continue;

      results.push({
        companyId: company.id,
        symbol: company.symbol,
        name: company.name,
        sector: company.sector,
        marketCap: company.market_cap,
        earningsYield: mf.earningsYield,
        returnOnCapital: mf.returnOnCapital,
      });
    }

    // Rank by earnings yield (higher = cheaper)
    results.sort((a, b) => b.earningsYield - a.earningsYield);
    results.forEach((r, i) => r.earningsYieldRank = i + 1);

    // Rank by return on capital (higher = better quality)
    results.sort((a, b) => b.returnOnCapital - a.returnOnCapital);
    results.forEach((r, i) => r.rocRank = i + 1);

    // Combined rank (lower = better)
    results.forEach(r => r.combinedRank = r.earningsYieldRank + r.rocRank);

    // Sort by combined rank
    results.sort((a, b) => a.combinedRank - b.combinedRank);

    return results.slice(0, limit);
  }

  /**
   * Screen for high Piotroski score stocks
   */
  async screenPiotroski(options = {}) {
    const { minScore = 7, limit = 50, minMarketCap = 100000000 } = options;

    const companies = await this._getAllCompanies();
    const results = [];

    for (const company of companies) {
      if (company.market_cap < minMarketCap) continue;

      const piotroski = await this.calculatePiotroskiScore(company.id);
      if (piotroski.score === null || piotroski.score < minScore) continue;

      results.push({
        companyId: company.id,
        symbol: company.symbol,
        name: company.name,
        sector: company.sector,
        marketCap: company.market_cap,
        piotroskiScore: piotroski.score,
        details: piotroski.details,
        interpretation: piotroski.interpretation,
      });
    }

    // Sort by score (higher = better)
    results.sort((a, b) => b.piotroskiScore - a.piotroskiScore);

    return results.slice(0, limit);
  }

  // ============================================
  // HELPER METHODS
  // ============================================
  // SIGNAL FORMAT FOR TRADING AGENT
  // ============================================

  /**
   * Get combined value signal in TradingAgent-compatible format
   * Combines Piotroski, Altman, Magic Formula, and Contrarian signals
   * @returns {{ score: number, confidence: number, source: string, details: object, interpretation: string }}
   */
  async getCombinedValueSignal(companyId) {
    const [combined, contrarian] = await Promise.all([
      this.calculateCombinedValueScore(companyId),
      this.getContrarianSignal(companyId),
    ]);

    // Default to no signal
    if (combined.confidence === 0 && contrarian.confidence === 0) {
      return { score: 0, confidence: 0, source: 'valueQuality', details: {} };
    }

    // Normalize combined score to -1 to 1 range
    // Score 0-40 = bearish (-1 to -0.2), 40-60 = neutral, 60-100 = bullish (0.2 to 1)
    let score = 0;
    if (combined.combinedScore !== null) {
      if (combined.combinedScore >= 60) {
        score = 0.2 + ((combined.combinedScore - 60) / 40) * 0.8; // 60-100 maps to 0.2-1.0
      } else if (combined.combinedScore <= 40) {
        score = -0.2 - ((40 - combined.combinedScore) / 40) * 0.8; // 0-40 maps to -1.0 to -0.2
      } else {
        score = (combined.combinedScore - 50) / 50; // 40-60 maps to -0.2 to 0.2
      }
    }

    // Boost score if contrarian signal is bullish
    if (contrarian.signal === 'bullish' && contrarian.confidence > 0.3) {
      score = score * 0.7 + 0.5 * 0.3; // Blend in bullish boost
    }

    // Reduce score if value trap indicators present
    if (combined.altman?.zone === 'DISTRESS') {
      score = Math.min(score, -0.3); // Cap score for distressed companies
    }
    if (combined.piotroski?.score !== null && combined.piotroski.score <= 3) {
      score = score * 0.7; // Reduce confidence in low Piotroski
    }

    // Calculate weighted confidence
    const confidence = Math.min(1, combined.confidence * 0.7 + contrarian.confidence * 0.3);

    return {
      score: Math.max(-1, Math.min(1, score)),
      confidence,
      source: 'valueQuality',
      details: {
        piotroski: combined.piotroski,
        altman: combined.altman,
        magicFormula: combined.magicFormula,
        combinedScore: combined.combinedScore,
        contrarian: contrarian,
      },
      interpretation: this._buildSignalInterpretation(combined, contrarian),
    };
  }

  _buildSignalInterpretation(combined, contrarian) {
    const parts = [];

    if (combined.piotroski?.score !== null) {
      parts.push(`Piotroski ${combined.piotroski.score}/9`);
    }
    if (combined.altman?.zone) {
      parts.push(`Altman ${combined.altman.zone}`);
    }
    if (contrarian.signal === 'bullish') {
      parts.push('Insider buying in drawdown');
    }
    if (contrarian.signal === 'cautious') {
      parts.push('No insider conviction in drawdown');
    }

    if (parts.length === 0) return 'Limited value data available';

    return parts.join(' | ');
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  _getField(data, fieldNames) {
    if (!data) return null;
    for (const name of fieldNames) {
      if (data[name] !== undefined && data[name] !== null) {
        const val = parseFloat(data[name]);
        if (!isNaN(val)) return val;
      }
    }
    return null;
  }
}

module.exports = { ValueSignals };
