// src/services/agent/riskManager.js
// Risk Manager - Validates trades against risk limits before execution
// Enhanced with stress test integration from HF-style backtesting framework

const { VaRCalculator } = require('../portfolio/varCalculator');

// Lazy load stress test module
let stressTest = null;
function loadStressTestModule() {
  try {
    if (!stressTest) {
      stressTest = require('../backtesting/stressTest');
    }
    return true;
  } catch (error) {
    return false;
  }
}

class RiskManager {
  constructor(db, config = {}) {
    this.db = db;
    this.varCalculator = new VaRCalculator();
    this.stressTestEnabled = loadStressTestModule();

    // Configurable risk limits
    this.limits = {
      maxPositionSize: config.maxPositionSize || 0.10,        // 10% max per position
      maxSectorExposure: config.maxSectorExposure || 0.30,    // 30% max per sector
      maxDailyTrades: config.maxDailyTrades || 10,            // Max trades per day
      minCashReserve: config.minCashReserve || 0.05,          // 5% cash minimum
      maxCorrelation: config.maxCorrelation || 0.7,           // Max correlation between positions
      maxDrawdownPause: config.maxDrawdownPause || 0.15,      // Pause if down 15%
      maxSingleDayLoss: config.maxSingleDayLoss || 0.03,      // Alert if single day loss > 3%
      maxConcentration: config.maxConcentration || 0.25,      // Top position max 25%
      maxPortfolioVaR: config.maxPortfolioVaR || 0.03,        // 3% max daily VaR (99%)
      maxMarginalVaR: config.maxMarginalVaR || 0.005,         // 0.5% max marginal VaR impact
      maxStressLoss: config.maxStressLoss || 0.40,            // 40% max stress scenario loss
    };

    // Cache for stress test results (refreshed daily by OutcomeUpdater)
    this.stressTestCache = new Map();
    this.stressCacheTTL = 24 * 60 * 60 * 1000; // 24 hours

    this._prepareStatements();
    console.log('🛡️ Risk Manager initialized' + (this.stressTestEnabled ? ' (stress tests enabled)' : ''));
  }

  _prepareStatements() {
    this.stmts = {
      getPortfolio: this.db.prepare(`
        SELECT * FROM portfolios WHERE id = ?
      `),

      getPositions: this.db.prepare(`
        SELECT pp.*, c.symbol, c.sector, c.industry
        FROM portfolio_positions pp
        JOIN companies c ON pp.company_id = c.id
        WHERE pp.portfolio_id = ?
      `),

      getCompanySector: this.db.prepare(`
        SELECT sector, industry FROM companies WHERE id = ?
      `),

      getDailyTradeCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM portfolio_transactions
        WHERE portfolio_id = ?
        AND date(executed_at) = date('now')
      `),

      getPortfolioSnapshots: this.db.prepare(`
        SELECT * FROM portfolio_snapshots
        WHERE portfolio_id = ?
        ORDER BY snapshot_date DESC
        LIMIT 30
      `),

      storeRiskCheck: this.db.prepare(`
        INSERT INTO risk_check_history
        (recommendation_id, portfolio_id, company_id, approved, checks,
         original_position_size, adjusted_position_size, warnings, blockers)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
    };
  }

  /**
   * Validate a recommendation against risk limits
   * @param {AgentRecommendation} recommendation
   * @param {number} portfolioId
   * @param {MarketRegime} regime
   * @returns {RiskCheck}
   */
  async validate(recommendation, portfolioId, regime = null) {
    const checks = [];
    const portfolio = await this._getPortfolioState(portfolioId);

    if (!portfolio) {
      return {
        approved: false,
        checks: [{ rule: 'portfolio_exists', passed: false, critical: true, message: 'Portfolio not found' }],
        adjustedPositionSize: 0,
        warnings: [],
        blockers: ['Portfolio not found'],
      };
    }

    // Store original position size
    const originalPositionSize = recommendation.positionSize;
    let adjustedPositionSize = originalPositionSize;

    // 1. Position size check
    checks.push(this._checkPositionSize(recommendation, portfolio));

    // 2. Sector concentration check
    const sectorCheck = await this._checkSectorExposure(recommendation, portfolio);
    checks.push(sectorCheck);

    // 3. Daily trade limit
    checks.push(await this._checkDailyTradeLimit(portfolioId));

    // 4. Cash reserve check (for buys)
    if (recommendation.action.includes('buy')) {
      checks.push(this._checkCashReserve(recommendation, portfolio));
    }

    // 5. Drawdown check
    checks.push(await this._checkDrawdown(portfolioId, portfolio));

    // 6. Concentration check
    checks.push(this._checkConcentration(recommendation, portfolio));

    // 7. VaR impact check (hedge fund-grade risk check)
    const varCheck = await this._checkVaRImpact(recommendation, portfolio);
    if (varCheck) {
      checks.push(varCheck);
    }

    // 8. Correlation check (avoid highly correlated positions)
    const correlationCheck = await this._checkCorrelation(recommendation, portfolio);
    if (correlationCheck) {
      checks.push(correlationCheck);
    }

    // 9. Regime adjustment
    if (regime) {
      const regimeCheck = this._getRegimeAdjustment(recommendation, regime);
      checks.push(regimeCheck);

      // Apply regime adjustment to position size
      if (regimeCheck.adjustment && regimeCheck.adjustment < 1) {
        adjustedPositionSize *= regimeCheck.adjustment;
      }
    }

    // 10. Stress test check (HF-style scenario analysis)
    const stressCheck = await this._checkStressTestLimits(portfolioId, recommendation);
    if (stressCheck) {
      checks.push(stressCheck);

      // Reduce position size if stress test shows excessive risk
      if (!stressCheck.passed && stressCheck.adjustment) {
        adjustedPositionSize *= stressCheck.adjustment;
      }
    }

    // Calculate results
    const allPassed = checks.every(c => c.passed);
    const criticalFailed = checks.some(c => !c.passed && c.critical);
    const passedCount = checks.filter(c => c.passed).length;
    const passRate = passedCount / checks.length;

    // P2 FIX: Raise to 90% pass rate (Expert Panel: Taleb, Simons recommendation)
    // Old: passRate >= 0.7 - too lenient, allowed 3/10 failures
    // New: passRate >= 0.9 - requires 9/10 checks to pass, stricter risk control
    const approved = allPassed || (!criticalFailed && passRate >= 0.9);

    const warnings = checks.filter(c => !c.passed && !c.critical).map(c => c.message).filter(Boolean);
    const blockers = checks.filter(c => !c.passed && c.critical).map(c => c.message).filter(Boolean);

    const result = {
      approved,
      checks,
      originalPositionSize,
      adjustedPositionSize: Math.round(adjustedPositionSize * 10000) / 10000,
      warnings,
      blockers,
      passRate: Math.round(passRate * 100),
      timestamp: new Date().toISOString(),
    };

    // Store risk check history
    this._storeRiskCheck(recommendation, portfolioId, result);

    return result;
  }

  /**
   * Get portfolio state for risk calculations
   */
  async _getPortfolioState(portfolioId) {
    const portfolio = this.stmts.getPortfolio.get(portfolioId);
    if (!portfolio) return null;

    const positions = this.stmts.getPositions.all(portfolioId);

    const totalPositionsValue = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);
    const cash = portfolio.current_cash || 0;
    const totalAssets = totalPositionsValue + cash;

    // Calculate sector allocation
    const sectors = {};
    for (const pos of positions) {
      const sector = pos.sector || 'Unknown';
      if (!sectors[sector]) {
        sectors[sector] = { value: 0, weight: 0, positions: [] };
      }
      sectors[sector].value += pos.current_value || 0;
      sectors[sector].positions.push(pos.symbol);
    }

    // Calculate weights
    for (const sector of Object.keys(sectors)) {
      sectors[sector].weight = totalAssets > 0 ? sectors[sector].value / totalAssets : 0;
    }

    return {
      portfolio,
      positions,
      totalPositionsValue,
      cash,
      totalAssets,
      sectors,
      positionCount: positions.length,
    };
  }

  /**
   * Check position size limit
   */
  _checkPositionSize(recommendation, portfolio) {
    const positionValue = recommendation.positionSize * portfolio.totalAssets;
    const positionPct = portfolio.totalAssets > 0 ? positionValue / portfolio.totalAssets : 0;

    const passed = positionPct <= this.limits.maxPositionSize;

    return {
      rule: 'max_position_size',
      passed,
      critical: true,
      value: Math.round(positionPct * 10000) / 100,
      limit: Math.round(this.limits.maxPositionSize * 100),
      message: !passed
        ? `Position size ${(positionPct * 100).toFixed(1)}% exceeds limit ${(this.limits.maxPositionSize * 100)}%`
        : null,
    };
  }

  /**
   * Check sector concentration
   */
  async _checkSectorExposure(recommendation, portfolio) {
    // Get sector of recommended stock
    const company = this.stmts.getCompanySector.get(recommendation.companyId);
    const sector = company?.sector || 'Unknown';

    const currentSectorValue = portfolio.sectors[sector]?.value || 0;
    const newPositionValue = recommendation.positionSize * portfolio.totalAssets;
    const newSectorValue = currentSectorValue + newPositionValue;
    const sectorPct = portfolio.totalAssets > 0 ? newSectorValue / portfolio.totalAssets : 0;

    const passed = sectorPct <= this.limits.maxSectorExposure;

    return {
      rule: 'max_sector_exposure',
      passed,
      critical: true, // P2 FIX: Now critical (Expert Panel: Dalio recommendation)
      value: Math.round(sectorPct * 10000) / 100,
      limit: Math.round(this.limits.maxSectorExposure * 100),
      sector,
      currentExposure: Math.round((currentSectorValue / portfolio.totalAssets) * 10000) / 100,
      message: !passed
        ? `Sector ${sector} exposure would be ${(sectorPct * 100).toFixed(1)}%, exceeds limit ${(this.limits.maxSectorExposure * 100)}%`
        : null,
    };
  }

  /**
   * Check daily trade limit
   */
  async _checkDailyTradeLimit(portfolioId) {
    const result = this.stmts.getDailyTradeCount.get(portfolioId);
    const count = result?.count || 0;

    const passed = count < this.limits.maxDailyTrades;

    return {
      rule: 'max_daily_trades',
      passed,
      critical: true,
      value: count,
      limit: this.limits.maxDailyTrades,
      message: !passed
        ? `Daily trade limit reached (${count}/${this.limits.maxDailyTrades})`
        : null,
    };
  }

  /**
   * Check cash reserve after trade
   */
  _checkCashReserve(recommendation, portfolio) {
    const tradeValue = recommendation.positionSize * portfolio.totalAssets;
    const remainingCash = portfolio.cash - tradeValue;
    const cashPct = portfolio.totalAssets > 0 ? remainingCash / portfolio.totalAssets : 0;

    const passed = cashPct >= this.limits.minCashReserve;

    return {
      rule: 'min_cash_reserve',
      passed,
      critical: true,
      value: Math.round(cashPct * 10000) / 100,
      limit: Math.round(this.limits.minCashReserve * 100),
      currentCash: portfolio.cash,
      tradeValue: Math.round(tradeValue * 100) / 100,
      remainingCash: Math.round(remainingCash * 100) / 100,
      message: !passed
        ? `Trade would leave only ${(cashPct * 100).toFixed(1)}% cash, below ${(this.limits.minCashReserve * 100)}% minimum`
        : null,
    };
  }

  /**
   * Check portfolio drawdown
   */
  async _checkDrawdown(portfolioId, portfolio) {
    const snapshots = this.stmts.getPortfolioSnapshots.all(portfolioId);

    if (snapshots.length === 0) {
      return {
        rule: 'max_drawdown_pause',
        passed: true,
        critical: true, // Drawdown check is critical - blocks new BUY positions
        value: 0,
        limit: Math.round(this.limits.maxDrawdownPause * 100),
        message: null,
      };
    }

    // Find peak value
    const peakValue = Math.max(...snapshots.map(s => s.total_value));
    const currentValue = portfolio.totalAssets;
    const drawdown = peakValue > 0 ? (peakValue - currentValue) / peakValue : 0;

    const inDrawdownPause = drawdown >= this.limits.maxDrawdownPause;

    return {
      rule: 'max_drawdown_pause',
      passed: !inDrawdownPause,
      critical: true, // Drawdown check is critical - blocks new BUY positions
      value: Math.round(drawdown * 10000) / 100,
      limit: Math.round(this.limits.maxDrawdownPause * 100),
      peakValue: Math.round(peakValue * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
      message: inDrawdownPause
        ? `Portfolio in ${(drawdown * 100).toFixed(1)}% drawdown exceeds limit (${Math.round(this.limits.maxDrawdownPause * 100)}%). New BUY positions BLOCKED until drawdown recovers.`
        : null,
    };
  }

  /**
   * Check position concentration
   */
  _checkConcentration(recommendation, portfolio) {
    if (portfolio.positionCount === 0) {
      // First position, check if it would exceed max concentration
      const passed = recommendation.positionSize <= this.limits.maxConcentration;
      return {
        rule: 'max_concentration',
        passed,
        critical: true, // P2 FIX: Now critical (Expert Panel: Dalio recommendation)
        value: Math.round(recommendation.positionSize * 10000) / 100,
        limit: Math.round(this.limits.maxConcentration * 100),
        message: !passed
          ? `Single position concentration ${(recommendation.positionSize * 100).toFixed(1)}% exceeds max ${(this.limits.maxConcentration * 100)}%`
          : null,
      };
    }

    // Find current largest position
    const largestPosition = portfolio.positions.reduce((max, p) => {
      const weight = portfolio.totalAssets > 0 ? (p.current_value || 0) / portfolio.totalAssets : 0;
      return weight > max.weight ? { symbol: p.symbol, weight } : max;
    }, { symbol: null, weight: 0 });

    // Check if new position would become largest and exceed limit
    const newPositionWeight = recommendation.positionSize;
    const wouldBeLargest = newPositionWeight > largestPosition.weight;
    const exceedsLimit = newPositionWeight > this.limits.maxConcentration;

    const passed = !exceedsLimit;

    return {
      rule: 'max_concentration',
      passed,
      critical: true, // P2 FIX: Now critical (Expert Panel: Dalio recommendation)
      value: Math.round(newPositionWeight * 10000) / 100,
      limit: Math.round(this.limits.maxConcentration * 100),
      currentLargest: largestPosition.symbol,
      currentLargestWeight: Math.round(largestPosition.weight * 10000) / 100,
      message: !passed
        ? `Position would be ${(newPositionWeight * 100).toFixed(1)}% of portfolio, exceeds concentration limit ${(this.limits.maxConcentration * 100)}%`
        : null,
    };
  }

  /**
   * Get regime-based position size adjustment
   */
  _getRegimeAdjustment(recommendation, regime) {
    const adjustments = {
      'BULL': { adjustment: 1.0, note: 'Normal sizing in bull market' },
      'BEAR': { adjustment: 0.7, note: 'Reduced sizing in bear market' },
      'SIDEWAYS': { adjustment: 0.9, note: 'Slightly reduced sizing in sideways market' },
      'HIGH_VOL': { adjustment: 0.5, note: 'Half position size due to high volatility' },
      'CRISIS': { adjustment: 0.3, note: 'Minimal sizing during crisis' },
    };

    const adj = adjustments[regime.regime] || { adjustment: 1.0, note: 'Unknown regime' };

    return {
      rule: 'regime_adjustment',
      passed: true, // Always "passes" but may adjust size
      critical: true, // P2 FIX: Now critical (Expert Panel: Dalio recommendation)
      adjustment: adj.adjustment,
      regime: regime.regime,
      message: adj.note,
    };
  }

  /**
   * Store risk check in history
   */
  _storeRiskCheck(recommendation, portfolioId, result) {
    try {
      this.stmts.storeRiskCheck.run(
        recommendation.id || null,
        portfolioId,
        recommendation.companyId,
        result.approved ? 1 : 0,
        JSON.stringify(result.checks),
        result.originalPositionSize,
        result.adjustedPositionSize,
        JSON.stringify(result.warnings),
        JSON.stringify(result.blockers)
      );
    } catch (error) {
      console.error('Error storing risk check:', error.message);
    }
  }

  /**
   * Get risk check history for a portfolio
   */
  getRiskCheckHistory(portfolioId, limit = 50) {
    const rows = this.db.prepare(`
      SELECT rch.*, c.symbol, c.name
      FROM risk_check_history rch
      JOIN companies c ON rch.company_id = c.id
      WHERE rch.portfolio_id = ?
      ORDER BY rch.created_at DESC
      LIMIT ?
    `).all(portfolioId, limit);

    return rows.map(row => ({
      ...row,
      checks: row.checks ? JSON.parse(row.checks) : [],
      warnings: row.warnings ? JSON.parse(row.warnings) : [],
      blockers: row.blockers ? JSON.parse(row.blockers) : [],
    }));
  }

  /**
   * Quick validation without full check (for screening)
   */
  quickValidate(recommendation, portfolioContext) {
    // Just check the critical rules
    const tradeValue = recommendation.positionSize * (portfolioContext.totalValue + portfolioContext.cash);

    // Cash check
    if (recommendation.action.includes('buy')) {
      if (tradeValue > portfolioContext.cash * 0.95) {
        return { valid: false, reason: 'Insufficient cash' };
      }
    }

    // Position size check
    if (recommendation.positionSize > this.limits.maxPositionSize) {
      return { valid: false, reason: 'Position too large' };
    }

    return { valid: true };
  }

  /**
   * Check VaR impact of adding new position
   * Calculates marginal VaR contribution
   */
  async _checkVaRImpact(recommendation, portfolio) {
    try {
      // Need at least 30 days of returns for VaR calculation
      if (portfolio.positions.length === 0) {
        return null; // Skip VaR check for first position
      }

      // Get portfolio returns from snapshots
      const snapshots = this.stmts.getPortfolioSnapshots.all(portfolio.portfolio.id);
      if (snapshots.length < 30) {
        return null; // Not enough data for VaR
      }

      // Calculate daily returns from snapshots
      const returns = [];
      for (let i = 0; i < snapshots.length - 1; i++) {
        const prevValue = snapshots[i + 1].total_value;
        const currValue = snapshots[i].total_value;
        if (prevValue > 0) {
          returns.push((currValue - prevValue) / prevValue);
        }
      }

      if (returns.length < 20) {
        return null;
      }

      // Calculate current portfolio VaR
      const varResult = this.varCalculator.calculateVaR(returns, portfolio.totalAssets);
      if (varResult.error) {
        return null;
      }

      const currentVaR = Math.abs(varResult.historical['99_1d']?.varPercent || 0);

      // Estimate new VaR with position added
      // Simple approximation: new stock adds vol proportional to position size
      const newStockReturns = await this._getStockReturns(recommendation.companyId);
      if (!newStockReturns || newStockReturns.length < 20) {
        return null;
      }

      // Calculate stock volatility
      const stockMean = newStockReturns.reduce((a, b) => a + b, 0) / newStockReturns.length;
      const stockVar = newStockReturns.reduce((s, r) => s + Math.pow(r - stockMean, 2), 0) / newStockReturns.length;
      const stockVol = Math.sqrt(stockVar * 252);

      // Marginal VaR approximation (simplified)
      const positionWeight = recommendation.positionSize;
      const marginalVaRImpact = positionWeight * stockVol * 2.326 / Math.sqrt(252); // 99% Z-score

      // Check against limits
      const portfolioVaRPassed = currentVaR <= this.limits.maxPortfolioVaR * 100;
      const marginalVaRPassed = marginalVaRImpact <= this.limits.maxMarginalVaR;

      const passed = portfolioVaRPassed && marginalVaRPassed;

      return {
        rule: 'var_impact',
        passed,
        critical: true, // P2 FIX: Now critical (Expert Panel: Taleb recommendation)
        currentPortfolioVaR: Math.round(currentVaR * 100) / 100,
        portfolioVaRLimit: this.limits.maxPortfolioVaR * 100,
        marginalVaRImpact: Math.round(marginalVaRImpact * 10000) / 100,
        marginalVaRLimit: this.limits.maxMarginalVaR * 100,
        stockVolatility: Math.round(stockVol * 10000) / 100,
        message: !passed
          ? marginalVaRPassed
            ? `Portfolio VaR (${currentVaR.toFixed(2)}%) exceeds limit (${(this.limits.maxPortfolioVaR * 100).toFixed(1)}%)`
            : `Trade adds ${(marginalVaRImpact * 100).toFixed(2)}% marginal VaR, exceeds ${(this.limits.maxMarginalVaR * 100).toFixed(1)}% limit`
          : null,
      };
    } catch (error) {
      console.error('VaR check error:', error.message);
      return null; // Don't block on VaR calculation errors
    }
  }

  /**
   * Check correlation with existing positions
   * Prevents adding positions that are too highly correlated with existing holdings
   */
  async _checkCorrelation(recommendation, portfolio) {
    try {
      // Need at least 1 existing position to check correlation
      if (portfolio.positions.length === 0) {
        return null;
      }

      // Get returns for new stock
      const newStockReturns = await this._getStockReturns(recommendation.companyId);
      if (!newStockReturns || newStockReturns.length < 30) {
        return null; // Not enough data
      }

      // Calculate correlation with each existing position
      const correlations = [];
      let highestCorrelation = 0;
      let mostCorrelatedStock = null;

      for (const position of portfolio.positions) {
        const existingReturns = await this._getStockReturns(position.company_id);
        if (!existingReturns || existingReturns.length < 30) {
          continue;
        }

        // Use minimum common length
        const minLength = Math.min(newStockReturns.length, existingReturns.length);
        const newReturns = newStockReturns.slice(0, minLength);
        const existReturns = existingReturns.slice(0, minLength);

        const correlation = this._calculateCorrelation(newReturns, existReturns);

        correlations.push({
          symbol: position.symbol,
          correlation: Math.round(correlation * 1000) / 1000,
          weight: portfolio.totalAssets > 0 ? (position.current_value || 0) / portfolio.totalAssets : 0,
        });

        if (Math.abs(correlation) > Math.abs(highestCorrelation)) {
          highestCorrelation = correlation;
          mostCorrelatedStock = position.symbol;
        }
      }

      if (correlations.length === 0) {
        return null;
      }

      // Calculate weighted average correlation
      const weightedAvgCorr = correlations.reduce((sum, c) => sum + c.correlation * c.weight, 0) /
        correlations.reduce((sum, c) => sum + c.weight, 0);

      // Check against limit
      const passed = Math.abs(highestCorrelation) <= this.limits.maxCorrelation;

      // Count highly correlated positions
      const highlyCorrelated = correlations.filter(c => Math.abs(c.correlation) > this.limits.maxCorrelation);

      return {
        rule: 'max_correlation',
        passed,
        critical: true, // P2 FIX: Now critical (Expert Panel: Dalio recommendation)
        highestCorrelation: Math.round(highestCorrelation * 1000) / 1000,
        mostCorrelatedWith: mostCorrelatedStock,
        weightedAvgCorrelation: Math.round(weightedAvgCorr * 1000) / 1000,
        limit: this.limits.maxCorrelation,
        highlyCorrelatedPositions: highlyCorrelated.length,
        correlationDetails: correlations.slice(0, 5), // Top 5 correlations
        message: !passed
          ? `Correlation of ${(highestCorrelation * 100).toFixed(0)}% with ${mostCorrelatedStock} exceeds ${(this.limits.maxCorrelation * 100).toFixed(0)}% limit`
          : highlyCorrelated.length > 0
          ? `High correlation with ${highlyCorrelated.length} position(s) - diversification concern`
          : null,
      };
    } catch (error) {
      console.error('Correlation check error:', error.message);
      return null;
    }
  }

  /**
   * Calculate Pearson correlation between two return series
   */
  _calculateCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 5) return 0;

    const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
    const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;

    let cov = 0, varX = 0, varY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      cov += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    if (varX === 0 || varY === 0) return 0;
    return cov / Math.sqrt(varX * varY);
  }

  /**
   * Get historical returns for a stock
   */
  async _getStockReturns(companyId) {
    try {
      const prices = this.db.prepare(`
        SELECT date, close FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 60
      `).all(companyId);

      if (prices.length < 21) return null;

      const returns = [];
      for (let i = 0; i < prices.length - 1; i++) {
        const prevPrice = prices[i + 1].close;
        const currPrice = prices[i].close;
        if (prevPrice > 0) {
          returns.push((currPrice - prevPrice) / prevPrice);
        }
      }

      return returns;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if adding position would breach stress test limits
   * Uses cached stress test results from daily backtesting analysis
   */
  async _checkStressTestLimits(portfolioId, recommendation) {
    try {
      // Get cached or fresh stress test results
      const stressResults = await this._getStressTestResults(portfolioId);

      if (!stressResults || !stressResults.scenarios) {
        return null; // No stress test data available
      }

      // Find worst-case scenario
      let worstScenario = null;
      let worstLoss = 0;

      for (const [scenarioName, result] of Object.entries(stressResults.scenarios)) {
        const loss = Math.abs(result.portfolioImpact || 0);
        if (loss > worstLoss) {
          worstLoss = loss;
          worstScenario = scenarioName;
        }
      }

      // Check if worst-case exceeds limit
      const passed = worstLoss <= this.limits.maxStressLoss;

      // Calculate position size adjustment based on stress severity
      let adjustment = 1.0;
      if (!passed) {
        // How much over limit are we?
        const overLimit = worstLoss - this.limits.maxStressLoss;
        // Reduce position size proportionally (max 50% reduction)
        adjustment = Math.max(0.5, 1 - overLimit);
      }

      return {
        rule: 'stress_test_limit',
        passed,
        critical: true, // P2 FIX: Now critical (Expert Panel: Taleb recommendation)
        worstScenario,
        worstScenarioLoss: Math.round(worstLoss * 10000) / 100,
        limit: Math.round(this.limits.maxStressLoss * 100),
        adjustment: passed ? 1.0 : adjustment,
        scenariosAnalyzed: Object.keys(stressResults.scenarios).length,
        message: !passed
          ? `Stress scenario "${worstScenario}" shows ${(worstLoss * 100).toFixed(1)}% loss, exceeds ${(this.limits.maxStressLoss * 100)}% limit - reducing position`
          : null,
      };
    } catch (error) {
      console.error('Stress test check error:', error.message);
      return null;
    }
  }

  /**
   * Get stress test results (from cache or database)
   */
  async _getStressTestResults(portfolioId) {
    // Check cache first
    const cacheKey = `stress_${portfolioId}`;
    const cached = this.stressTestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.stressCacheTTL) {
      return cached.data;
    }

    // Try to get from database (stored by OutcomeUpdater)
    try {
      const dbResults = this.db.prepare(`
        SELECT scenario_name, portfolio_impact, position_impacts
        FROM stress_test_results
        WHERE portfolio_id = ?
          AND run_date >= datetime('now', '-2 days')
        ORDER BY run_date DESC
      `).all(portfolioId);

      if (dbResults.length > 0) {
        const scenarios = {};
        for (const row of dbResults) {
          scenarios[row.scenario_name] = {
            portfolioImpact: row.portfolio_impact,
            positionImpacts: row.position_impacts ? JSON.parse(row.position_impacts) : null
          };
        }

        const result = { scenarios, fromDb: true };
        this.stressTestCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }

      // If no cached results and stress test module available, run quick test
      if (this.stressTestEnabled && stressTest) {
        const quickResult = await this._runQuickStressTest(portfolioId);
        if (quickResult) {
          this.stressTestCache.set(cacheKey, { data: quickResult, timestamp: Date.now() });
          return quickResult;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Run quick stress test for critical scenarios only
   */
  async _runQuickStressTest(portfolioId) {
    if (!stressTest || !stressTest.runHistoricalStress) {
      return null;
    }

    try {
      const scenarios = {};

      // Only run key scenarios for quick check
      const keyScenarios = ['GFC_2008', 'COVID_2020'];

      for (const scenarioName of keyScenarios) {
        try {
          const result = stressTest.runHistoricalStress(this.db, portfolioId, scenarioName);
          if (result && result.portfolioImpact !== undefined) {
            scenarios[scenarioName] = {
              portfolioImpact: result.portfolioImpact
            };
          }
        } catch (e) {
          // Skip failed scenarios
        }
      }

      if (Object.keys(scenarios).length === 0) {
        return null;
      }

      return { scenarios, fromQuickTest: true };
    } catch (error) {
      return null;
    }
  }

  /**
   * Update risk limits
   */
  updateLimits(newLimits) {
    this.limits = { ...this.limits, ...newLimits };
    console.log('🛡️ Risk limits updated:', this.limits);
  }

  /**
   * Get current risk limits
   */
  getLimits() {
    return { ...this.limits };
  }

  /**
   * Get portfolio VaR summary
   */
  async getPortfolioVaR(portfolioId) {
    const portfolio = await this._getPortfolioState(portfolioId);
    if (!portfolio) {
      return { error: 'Portfolio not found' };
    }

    const snapshots = this.stmts.getPortfolioSnapshots.all(portfolioId);
    if (snapshots.length < 30) {
      return { error: 'Insufficient history for VaR calculation' };
    }

    // Calculate returns
    const returns = [];
    for (let i = 0; i < snapshots.length - 1; i++) {
      const prevValue = snapshots[i + 1].total_value;
      const currValue = snapshots[i].total_value;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    return this.varCalculator.calculateVaR(returns, portfolio.totalAssets);
  }
}

module.exports = { RiskManager };
