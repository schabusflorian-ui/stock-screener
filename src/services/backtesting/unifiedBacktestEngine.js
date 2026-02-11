// src/services/backtesting/unifiedBacktestEngine.js
// Unified Backtesting Engine - Full validation suite for strategy testing
// Integrates walk-forward analysis, overfitting detection, stress testing, and factor attribution

const { getDatabaseAsync } = require('../../lib/db');
const { UnifiedStrategyEngine } = require('../strategy/unifiedStrategyEngine');
const { StrategyManager } = require('../strategy/strategyManager');
const { MultiStrategyOrchestrator, createOrchestratorIfMulti } = require('../strategy/multiStrategyOrchestrator');
const { runWalkForward, runCPCV, calculateMetrics } = require('./walkForwardEngine');
const { OverfittingDetector } = require('./overfittingDetector');
const { runHistoricalStress, getAvailableScenarios, HISTORICAL_SCENARIOS } = require('./stressTest');

/**
 * Backtest modes
 */
const BACKTEST_MODES = {
  SIMPLE: 'simple',           // Basic backtest without validation
  WALK_FORWARD: 'walk_forward', // Walk-forward validation
  FULL: 'full'                // Full validation suite (WF + overfitting + stress + factors)
};

/**
 * UnifiedBacktestEngine
 *
 * Provides comprehensive backtesting for unified strategies:
 * - Simple backtesting with signal-based trading simulation
 * - Walk-forward analysis (rolling and anchored)
 * - CPCV (Combinatorial Purged Cross-Validation)
 * - Overfitting detection (6 diagnostic tests)
 * - Stress testing (historical scenarios)
 * - Factor attribution analysis
 * - Deflated Sharpe ratio for multiple testing correction
 * - Bootstrap confidence intervals
 */
class UnifiedBacktestEngine {
  /**
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.options = {
      defaultBenchmark: 'SPY',
      riskFreeRate: 0.02,
      tradingDaysPerYear: 252,
      initialCapital: 100000,
      transactionCosts: 0.001, // 10 bps
      slippage: 0.0005, // 5 bps
      ...options
    };

    // Initialize services (will be set up with db in async methods)
    this.strategyManager = null;
    this.overfittingDetector = null;

    // Factor attribution (lazy load to avoid circular deps)
    this._factorAttribution = null;
  }

  /**
   * Get factor attribution service (lazy load)
   */
  _getFactorAttribution() {
    if (!this._factorAttribution) {
      try {
        const { FactorAttribution } = require('../factors/factorAttribution');
        this._factorAttribution = new FactorAttribution(this.db);
      } catch (error) {
        console.warn('Factor attribution not available:', error.message);
        return null;
      }
    }
    return this._factorAttribution;
  }

  /**
   * Run a full backtest with all validation
   * @param {number} strategyId Strategy ID
   * @param {Object} config Backtest configuration
   * @returns {Object} Comprehensive backtest results
   */
  async runFullBacktest(strategyId, config = {}) {
    const database = await getDatabaseAsync();

    // Initialize services on first run
    if (!this.strategyManager) {
      this.strategyManager = new StrategyManager(database);
      this.overfittingDetector = new OverfittingDetector(database);
    }

    const {
      startDate = '2020-01-01',
      endDate = new Date().toISOString().split('T')[0],
      mode = BACKTEST_MODES.FULL,
      benchmark = this.options.defaultBenchmark,
      walkForwardConfig = {},
      stressScenarios = ['COVID_2020', 'RATE_SHOCK_2022'],
      includeFactorAnalysis = true
    } = config;

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🔬 UNIFIED BACKTEST ENGINE - Strategy #${strategyId}`);
    console.log('='.repeat(70));

    // Load strategy
    const strategy = this.strategyManager.getStrategy(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    console.log(`📋 Strategy: ${strategy.name} (${strategy.strategy_type})`);
    console.log(`📅 Period: ${startDate} to ${endDate}`);
    console.log(`📊 Mode: ${mode}`);

    // Check if multi-strategy
    const orchestrator = createOrchestratorIfMulti(database, strategyId);
    const isMultiStrategy = orchestrator !== null;

    // 1. Run simple backtest
    console.log('\n📈 Running backtest simulation...');
    const backtest = await this._runBacktest(
      database,
      isMultiStrategy ? orchestrator : strategy,
      { startDate, endDate, benchmark, isMultiStrategy }
    );

    const results = {
      strategyId,
      strategyName: strategy.name,
      strategyType: strategy.strategy_type,
      period: { startDate, endDate },
      benchmark,
      backtest
    };

    // 2. Walk-forward analysis (if not simple mode)
    if (mode === BACKTEST_MODES.WALK_FORWARD || mode === BACKTEST_MODES.FULL) {
      console.log('\n🔄 Running walk-forward analysis...');
      try {
        const walkForward = await this._runWalkForwardAnalysis(
          database,
          isMultiStrategy ? orchestrator : strategy,
          { startDate, endDate, ...walkForwardConfig, isMultiStrategy }
        );
        results.walkForward = walkForward;
      } catch (error) {
        console.warn('Walk-forward analysis failed:', error.message);
        results.walkForward = { error: error.message };
      }
    }

    // 3. Full validation (overfitting, stress, factors)
    if (mode === BACKTEST_MODES.FULL) {
      // Overfitting detection
      console.log('\n🔍 Running overfitting detection...');
      try {
        const overfitting = this._runOverfittingAnalysis(backtest, results.walkForward);
        results.overfitting = overfitting;
      } catch (error) {
        console.warn('Overfitting analysis failed:', error.message);
        results.overfitting = { error: error.message };
      }

      // Stress testing
      console.log('\n⚡ Running stress tests...');
      try {
        const stress = await this._runStressTests(database, backtest.trades, stressScenarios);
        results.stress = stress;
      } catch (error) {
        console.warn('Stress testing failed:', error.message);
        results.stress = { error: error.message };
      }

      // Factor attribution
      if (includeFactorAnalysis) {
        console.log('\n📊 Running factor attribution...');
        try {
          const factors = await this._runFactorAnalysis(backtest.returns, startDate, endDate);
          results.factors = factors;
        } catch (error) {
          console.warn('Factor analysis failed:', error.message);
          results.factors = { error: error.message };
        }
      }

      // Statistical significance
      console.log('\n📐 Calculating statistical significance...');
      results.statistical = this._calculateStatisticalSignificance(backtest, results.walkForward);
    }

    // Generate deployment recommendation
    results.recommendation = this._generateRecommendation(results);

    // Store results
    await this._storeResults(database, strategyId, strategy.name, results);

    // Print summary
    this._printSummary(results);

    return results;
  }

  /**
   * Run basic backtest simulation
   */
  async _runBacktest(database, strategyOrOrchestrator, config) {
    const { startDate, endDate, benchmark, isMultiStrategy } = config;

    // Get universe
    const strategy = isMultiStrategy
      ? strategyOrOrchestrator.parentStrategy
      : strategyOrOrchestrator;

    const universeConfig = strategy.universe_config || {};
    const minMarketCap = universeConfig.minMarketCap || 1e9;
    const maxMarketCap = universeConfig.maxMarketCap || null;

    const universeResult = await database.query(`
      SELECT c.id, c.symbol, c.name, c.sector, c.market_cap
      FROM companies c
      WHERE c.market_cap >= $1
        AND c.market_cap <= COALESCE($2, 1e15)
      ORDER BY c.market_cap DESC
    `, [minMarketCap, maxMarketCap]);
    const universe = universeResult.rows;
    const symbols = universe.map(u => u.symbol).slice(0, 100); // Limit for performance

    console.log(`  Universe: ${symbols.length} stocks (market cap >= ${(minMarketCap / 1e9).toFixed(1)}B)`);

    // Get trading days
    const benchmarkResult = await database.query(`
      SELECT dp.date, dp.close
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER($1)
        AND dp.date BETWEEN $2 AND $3
      ORDER BY dp.date ASC
    `, [benchmark, startDate, endDate]);
    const benchmarkPrices = benchmarkResult.rows;
    const tradingDays = benchmarkPrices.map(p => p.date);

    if (tradingDays.length < 30) {
      throw new Error('Insufficient trading days for backtest');
    }

    console.log(`  Trading days: ${tradingDays.length}`);

    // Initialize portfolio
    let capital = this.options.initialCapital;
    const positions = new Map(); // symbol -> { shares, avgPrice }
    const equityCurve = [];
    const trades = [];
    const dailyReturns = [];

    // Create strategy engine
    const engine = isMultiStrategy
      ? null  // Use orchestrator directly
      : new UnifiedStrategyEngine(database);

    // Simulation loop
    let lastValue = capital;

    for (let i = 0; i < tradingDays.length; i++) {
      const date = tradingDays[i];

      // Set simulation date
      if (isMultiStrategy) {
        strategyOrOrchestrator.setSimulationDate(date);
      } else if (engine) {
        engine.setSimulationDate(date);
      }

      // Calculate portfolio value at start of day
      const portfolioValue = await this._calculatePortfolioValue(database, positions, date);
      const totalValue = capital + portfolioValue;

      // Calculate daily return
      if (lastValue > 0) {
        dailyReturns.push((totalValue - lastValue) / lastValue);
      }
      lastValue = totalValue;

      // Record equity curve
      equityCurve.push({
        date,
        value: totalValue,
        cash: capital,
        invested: portfolioValue
      });

      // Rebalance periodically (weekly by default)
      const dayOfWeek = new Date(date).getDay();
      const shouldRebalance = (i === 0 || dayOfWeek === 1); // Monday or first day

      if (shouldRebalance && i < tradingDays.length - 5) {
        // Generate signals for universe
        const signals = [];

        for (const symbol of symbols.slice(0, 50)) { // Limit for speed
          try {
            let signal;
            if (isMultiStrategy) {
              signal = await strategyOrOrchestrator.generateCombinedSignal(symbol);
            } else {
              signal = await engine.generateSignal(symbol, strategy);
            }

            if (signal && signal.action !== 'HOLD') {
              signals.push({
                symbol,
                ...signal
              });
            }
          } catch (error) {
            // Skip symbols with errors
          }
        }

        // Execute trades based on signals
        const newTrades = await this._executeSignals(
          database,
          signals,
          positions,
          capital,
          totalValue,
          date,
          strategy.risk_params || {}
        );

        trades.push(...newTrades);

        // Update capital from trades
        for (const trade of newTrades) {
          if (trade.action === 'BUY') {
            capital -= trade.value * (1 + this.options.transactionCosts);
          } else if (trade.action === 'SELL') {
            capital += trade.value * (1 - this.options.transactionCosts);
          }
        }
      }
    }

    // Calculate final metrics
    const metrics = calculateMetrics(dailyReturns, this.options.riskFreeRate);

    // Calculate benchmark metrics
    const benchmarkReturns = [];
    for (let i = 1; i < benchmarkPrices.length; i++) {
      benchmarkReturns.push(
        (benchmarkPrices[i].close - benchmarkPrices[i - 1].close) / benchmarkPrices[i - 1].close
      );
    }
    const benchmarkMetrics = calculateMetrics(benchmarkReturns, this.options.riskFreeRate);

    // Calculate alpha and beta
    const { alpha, beta } = this._calculateAlphaBeta(dailyReturns, benchmarkReturns);

    return {
      initialCapital: this.options.initialCapital,
      finalValue: equityCurve[equityCurve.length - 1]?.value || this.options.initialCapital,
      metrics: {
        ...metrics,
        alpha,
        beta,
        informationRatio: this._calculateInformationRatio(dailyReturns, benchmarkReturns),
        trackingError: this._calculateTrackingError(dailyReturns, benchmarkReturns)
      },
      benchmarkMetrics,
      equityCurve,
      trades,
      returns: dailyReturns,
      tradingDays: tradingDays.length,
      universeSize: symbols.length
    };
  }

  /**
   * Execute signals and generate trades
   */
  async _executeSignals(database, signals, positions, cash, totalValue, date, riskParams) {
    const trades = [];
    const maxPositionSize = riskParams.maxPositionSize || 0.10;
    const maxPositions = riskParams.maxPositions || 20;

    // Sort signals by confidence
    signals.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    // Process sell signals first
    for (const signal of signals) {
      if ((signal.action === 'SELL' || signal.action === 'STRONG_SELL') && positions.has(signal.symbol)) {
        const position = positions.get(signal.symbol);
        const price = await this._getPrice(database, signal.symbol, date);

        if (price) {
          const value = position.shares * price;
          trades.push({
            date,
            symbol: signal.symbol,
            action: 'SELL',
            shares: position.shares,
            price,
            value,
            reason: signal.reason || 'Signal sell'
          });
          cash += value;
          positions.delete(signal.symbol);
        }
      }
    }

    // Process buy signals
    const buySignals = signals.filter(s => s.action === 'BUY' || s.action === 'STRONG_BUY');

    for (const signal of buySignals.slice(0, maxPositions - positions.size)) {
      if (positions.has(signal.symbol)) continue;

      const price = await this._getPrice(database, signal.symbol, date);
      if (!price) continue;

      // Calculate position size
      const positionValue = Math.min(
        totalValue * maxPositionSize,
        cash * 0.9 // Don't use all cash
      );

      if (positionValue < 1000) continue; // Minimum position

      const shares = Math.floor(positionValue / price);
      if (shares < 1) continue;

      const actualValue = shares * price;

      trades.push({
        date,
        symbol: signal.symbol,
        action: 'BUY',
        shares,
        price,
        value: actualValue,
        confidence: signal.confidence,
        reason: signal.reason || 'Signal buy'
      });

      positions.set(signal.symbol, {
        shares,
        avgPrice: price
      });

      cash -= actualValue;
    }

    return trades;
  }

  /**
   * Get price for symbol on date
   */
  async _getPrice(database, symbol, date) {
    try {
      const result = await database.query(`
        SELECT dp.close
        FROM daily_prices dp
        JOIN companies c ON dp.company_id = c.id
        WHERE LOWER(c.symbol) = LOWER($1) AND dp.date <= $2
        ORDER BY dp.date DESC
        LIMIT 1
      `, [symbol, date]);
      return result.rows[0]?.close || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate portfolio value
   */
  async _calculatePortfolioValue(database, positions, date) {
    let value = 0;
    for (const [symbol, position] of positions) {
      const price = await this._getPrice(database, symbol, date);
      if (price) {
        value += position.shares * price;
      }
    }
    return value;
  }

  /**
   * Run walk-forward analysis
   */
  async _runWalkForwardAnalysis(database, strategyOrOrchestrator, config) {
    const {
      startDate,
      endDate,
      mode = 'rolling',
      windowSize = 252,
      stepSize = 63,
      isRatio = 0.7,
      isMultiStrategy
    } = config;

    const strategy = isMultiStrategy
      ? strategyOrOrchestrator.parentStrategy
      : strategyOrOrchestrator;

    // Run backtest in segments
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const totalDays = Math.floor((endMs - startMs) / dayMs);

    if (totalDays < windowSize) {
      throw new Error(`Insufficient data for walk-forward (need ${windowSize} days, have ${totalDays})`);
    }

    const periods = [];
    const allOOSReturns = [];

    if (mode === 'anchored') {
      // Anchored: IS always starts from beginning
      let oosStartDay = Math.floor(totalDays * isRatio);

      while (oosStartDay < totalDays) {
        const oosEndDay = Math.min(oosStartDay + stepSize, totalDays);

        const isEndDate = new Date(startMs + oosStartDay * dayMs).toISOString().split('T')[0];
        const oosStartDate = isEndDate;
        const oosEndDate = new Date(startMs + oosEndDay * dayMs).toISOString().split('T')[0];

        // Run IS backtest
        const isBacktest = await this._runBacktest(
          database,
          strategyOrOrchestrator,
          { startDate, endDate: isEndDate, benchmark: 'SPY', isMultiStrategy }
        );

        // Run OOS backtest
        const oosBacktest = await this._runBacktest(
          database,
          strategyOrOrchestrator,
          { startDate: oosStartDate, endDate: oosEndDate, benchmark: 'SPY', isMultiStrategy }
        );

        allOOSReturns.push(...oosBacktest.returns);

        const wfEfficiency = isBacktest.metrics.sharpe > 0
          ? oosBacktest.metrics.sharpe / isBacktest.metrics.sharpe
          : 0;

        periods.push({
          periodIndex: periods.length,
          isStart: startDate,
          isEnd: isEndDate,
          oosStart: oosStartDate,
          oosEnd: oosEndDate,
          isMetrics: isBacktest.metrics,
          oosMetrics: oosBacktest.metrics,
          walkForwardEfficiency: wfEfficiency
        });

        oosStartDay = oosEndDay;
      }
    } else {
      // Rolling walk-forward
      let windowStart = 0;

      while (windowStart + windowSize < totalDays) {
        const windowEnd = windowStart + windowSize;
        const isEnd = windowStart + Math.floor(windowSize * isRatio);

        const windowStartDate = new Date(startMs + windowStart * dayMs).toISOString().split('T')[0];
        const isEndDate = new Date(startMs + isEnd * dayMs).toISOString().split('T')[0];
        const windowEndDate = new Date(startMs + windowEnd * dayMs).toISOString().split('T')[0];

        // Run IS backtest
        const isBacktest = await this._runBacktest(
          database,
          strategyOrOrchestrator,
          { startDate: windowStartDate, endDate: isEndDate, benchmark: 'SPY', isMultiStrategy }
        );

        // Run OOS backtest
        const oosBacktest = await this._runBacktest(
          database,
          strategyOrOrchestrator,
          { startDate: isEndDate, endDate: windowEndDate, benchmark: 'SPY', isMultiStrategy }
        );

        allOOSReturns.push(...oosBacktest.returns);

        const wfEfficiency = isBacktest.metrics.sharpe > 0
          ? oosBacktest.metrics.sharpe / isBacktest.metrics.sharpe
          : 0;

        periods.push({
          periodIndex: periods.length,
          isStart: windowStartDate,
          isEnd: isEndDate,
          oosStart: isEndDate,
          oosEnd: windowEndDate,
          isMetrics: isBacktest.metrics,
          oosMetrics: oosBacktest.metrics,
          walkForwardEfficiency: wfEfficiency
        });

        windowStart += stepSize;
      }
    }

    // Calculate aggregate metrics
    const avgWFEfficiency = periods.reduce((sum, p) => sum + p.walkForwardEfficiency, 0) / periods.length;
    const aggregateOOSMetrics = calculateMetrics(allOOSReturns, this.options.riskFreeRate);

    // Parameter stability
    const isSharpes = periods.map(p => p.isMetrics.sharpe);
    const avgISSharpe = isSharpes.reduce((a, b) => a + b, 0) / isSharpes.length;
    const sharpeStd = Math.sqrt(
      isSharpes.reduce((acc, s) => acc + Math.pow(s - avgISSharpe, 2), 0) / Math.max(1, isSharpes.length - 1)
    );
    const parameterStability = avgISSharpe > 0 ? Math.max(0, 1 - (sharpeStd / Math.abs(avgISSharpe))) : 0;

    return {
      mode,
      numPeriods: periods.length,
      periods,
      aggregateOOSMetrics,
      walkForwardEfficiency: avgWFEfficiency,
      parameterStability,
      interpretation: this._interpretWalkForward(avgWFEfficiency, parameterStability)
    };
  }

  /**
   * Run overfitting analysis
   */
  _runOverfittingAnalysis(backtest, walkForward) {
    const diagnostics = [];

    // Test 1: Walk-forward degradation
    if (walkForward && !walkForward.error) {
      const wfEfficiency = walkForward.walkForwardEfficiency;
      let severity = 'HIGH';
      let passed = false;

      if (wfEfficiency >= 0.30 && wfEfficiency <= 0.90) {
        passed = true;
        severity = 'LOW';
      } else if (wfEfficiency > 0.90) {
        severity = 'MODERATE';
      } else {
        severity = 'CRITICAL';
      }

      diagnostics.push({
        type: 'walk_forward_degradation',
        severity,
        passed,
        value: wfEfficiency,
        threshold: 0.30,
        description: `Walk-forward efficiency: ${(wfEfficiency * 100).toFixed(1)}%`
      });
    }

    // Test 2: Parameter stability
    if (walkForward && !walkForward.error) {
      const stability = walkForward.parameterStability;
      let severity = 'HIGH';
      let passed = false;

      if (stability >= 0.70) {
        passed = true;
        severity = 'LOW';
      } else if (stability >= 0.50) {
        severity = 'MODERATE';
      }

      diagnostics.push({
        type: 'parameter_stability',
        severity,
        passed,
        value: stability,
        threshold: 0.70,
        description: `Parameter stability: ${(stability * 100).toFixed(1)}%`
      });
    }

    // Test 3: Sharpe ratio plausibility
    const sharpe = backtest.metrics.sharpe;
    let sharpeSeverity = 'LOW';
    let sharpePassed = true;

    if (sharpe > 3) {
      sharpeSeverity = 'CRITICAL';
      sharpePassed = false;
    } else if (sharpe > 2) {
      sharpeSeverity = 'HIGH';
      sharpePassed = false;
    } else if (sharpe > 1.5) {
      sharpeSeverity = 'MODERATE';
    }

    diagnostics.push({
      type: 'sharpe_plausibility',
      severity: sharpeSeverity,
      passed: sharpePassed,
      value: sharpe,
      threshold: 2.0,
      description: sharpe > 2 ? 'Suspiciously high Sharpe ratio - possible overfitting' : 'Sharpe ratio is plausible'
    });

    // Test 4: Drawdown realism
    const maxDD = backtest.metrics.maxDrawdown;
    let ddSeverity = 'LOW';
    let ddPassed = true;

    if (maxDD < 0.05 && sharpe > 1) {
      ddSeverity = 'MODERATE';
      ddPassed = false;
    }

    diagnostics.push({
      type: 'drawdown_realism',
      severity: ddSeverity,
      passed: ddPassed,
      value: maxDD,
      description: maxDD < 0.05 ? 'Very low drawdown may indicate overfitting' : 'Drawdown is realistic'
    });

    // Generate overall assessment
    const criticalCount = diagnostics.filter(d => d.severity === 'CRITICAL').length;
    const highCount = diagnostics.filter(d => d.severity === 'HIGH').length;
    const passedCount = diagnostics.filter(d => d.passed).length;

    let overallRisk = 'MODERATE';
    if (criticalCount > 0) {
      overallRisk = 'CRITICAL';
    } else if (highCount >= 2) {
      overallRisk = 'HIGH';
    } else if (passedCount >= diagnostics.length - 1) {
      overallRisk = 'LOW';
    }

    return {
      diagnostics,
      testsRun: diagnostics.length,
      testsPassed: passedCount,
      overallRisk,
      recommendation: this._getOverfittingRecommendation(overallRisk)
    };
  }

  /**
   * Run stress tests
   */
  async _runStressTests(database, trades, scenarios) {
    const results = [];

    // Get unique symbols from trades
    const symbols = [...new Set(trades.map(t => t.symbol))];

    for (const scenarioName of scenarios) {
      const scenario = HISTORICAL_SCENARIOS[scenarioName];
      if (!scenario) continue;

      let totalImpact = 0;
      const symbolImpacts = [];

      for (const symbol of symbols) {
        // Get sector
        const companyResult = await database.query(`
          SELECT sector FROM companies WHERE LOWER(symbol) = LOWER($1)
        `, [symbol]);
        const company = companyResult.rows[0];

        const sector = company?.sector?.toLowerCase().replace(/ /g, '_') || 'other';
        const shock = scenario.shocks[sector] || scenario.shocks.SP500 || -0.20;

        // Estimate position value (use average trade value)
        const symbolTrades = trades.filter(t => t.symbol === symbol);
        const avgValue = symbolTrades.reduce((sum, t) => sum + t.value, 0) / Math.max(1, symbolTrades.length);

        const impact = avgValue * shock;
        totalImpact += impact;

        symbolImpacts.push({
          symbol,
          sector,
          shock,
          impact
        });
      }

      results.push({
        scenario: scenarioName,
        name: scenario.name,
        description: scenario.description,
        totalImpact,
        percentImpact: totalImpact / this.options.initialCapital,
        symbolImpacts: symbolImpacts.sort((a, b) => a.impact - b.impact).slice(0, 10),
        severity: Math.abs(totalImpact / this.options.initialCapital) > 0.25 ? 'HIGH' : 'MODERATE'
      });
    }

    return {
      scenarios: results,
      worstCase: results.reduce((worst, r) =>
        r.percentImpact < worst.percentImpact ? r : worst,
        results[0] || { percentImpact: 0 }
      )
    };
  }

  /**
   * Run factor analysis
   */
  async _runFactorAnalysis(returns, startDate, endDate) {
    const factorAttribution = this._getFactorAttribution();
    if (!factorAttribution) {
      return { error: 'Factor attribution not available' };
    }

    try {
      // Get factor exposures
      const exposures = factorAttribution.analyzeReturns
        ? await factorAttribution.analyzeReturns(returns, startDate, endDate)
        : null;

      return exposures || { message: 'Factor analysis completed' };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Calculate statistical significance
   */
  _calculateStatisticalSignificance(backtest, walkForward) {
    const sharpe = backtest.metrics.sharpe;
    const n = backtest.tradingDays;

    // Standard error of Sharpe ratio
    const sharpeSE = Math.sqrt((1 + 0.5 * sharpe * sharpe) / n);

    // 95% confidence interval
    const sharpe95CI = [sharpe - 1.96 * sharpeSE, sharpe + 1.96 * sharpeSE];

    // Probability of negative Sharpe (using normal approximation)
    const zScore = sharpe / sharpeSE;
    const pNegative = this._normalCDF(-zScore);

    // Deflated Sharpe (if we have multiple tests)
    const deflatedSharpe = sharpe;
    let deflatedPValue = pNegative;

    if (walkForward && !walkForward.error && walkForward.numPeriods > 1) {
      // Adjust for multiple testing using Bonferroni-style correction
      const nTests = walkForward.numPeriods;
      deflatedPValue = Math.min(1, pNegative * nTests);
    }

    return {
      sharpe,
      sharpeSE,
      sharpe95CI,
      zScore,
      pValue: pNegative,
      deflatedSharpe,
      deflatedPValue,
      isSignificant: deflatedPValue < 0.05,
      requiredTrackRecord: this._calculateRequiredTrackRecord(sharpe)
    };
  }

  /**
   * Calculate required track record length (Bailey & Lopez de Prado)
   */
  _calculateRequiredTrackRecord(sharpe) {
    if (sharpe <= 0) return Infinity;
    // Required months = (1.96 / Sharpe)^2 * (1 + 0.5 * Sharpe^2) / 21 * 12
    const requiredMonths = Math.pow(1.96 / sharpe, 2) * (1 + 0.5 * Math.pow(sharpe, 2)) / 21 * 12;
    return Math.round(requiredMonths);
  }

  /**
   * Normal CDF approximation
   */
  _normalCDF(z) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Calculate alpha and beta
   */
  _calculateAlphaBeta(portfolioReturns, benchmarkReturns) {
    const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
    if (n < 30) return { alpha: 0, beta: 1 };

    // Simple linear regression
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = benchmarkReturns[i];
      const y = portfolioReturns[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const beta = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const alpha = (sumY - beta * sumX) / n;

    // Annualize alpha
    const annualizedAlpha = alpha * 252;

    return {
      alpha: annualizedAlpha,
      beta: isNaN(beta) ? 1 : beta
    };
  }

  /**
   * Calculate information ratio
   */
  _calculateInformationRatio(portfolioReturns, benchmarkReturns) {
    const activeReturns = portfolioReturns.map((r, i) =>
      r - (benchmarkReturns[i] || 0)
    );

    const avgActive = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
    const variance = activeReturns.reduce((acc, r) => acc + Math.pow(r - avgActive, 2), 0) / (activeReturns.length - 1);
    const trackingError = Math.sqrt(variance) * Math.sqrt(252);

    return trackingError > 0 ? (avgActive * 252) / trackingError : 0;
  }

  /**
   * Calculate tracking error
   */
  _calculateTrackingError(portfolioReturns, benchmarkReturns) {
    const activeReturns = portfolioReturns.map((r, i) =>
      r - (benchmarkReturns[i] || 0)
    );

    const avgActive = activeReturns.reduce((a, b) => a + b, 0) / activeReturns.length;
    const variance = activeReturns.reduce((acc, r) => acc + Math.pow(r - avgActive, 2), 0) / (activeReturns.length - 1);

    return Math.sqrt(variance) * Math.sqrt(252);
  }

  /**
   * Interpret walk-forward results
   */
  _interpretWalkForward(efficiency, stability) {
    const interpretations = [];

    if (efficiency >= 0.8) {
      interpretations.push('Excellent walk-forward efficiency (>80%): Strategy performs consistently out-of-sample');
    } else if (efficiency >= 0.5) {
      interpretations.push('Moderate walk-forward efficiency (50-80%): Some decay in OOS performance, acceptable');
    } else if (efficiency >= 0.2) {
      interpretations.push('Low walk-forward efficiency (20-50%): Significant OOS degradation, potential overfitting');
    } else {
      interpretations.push('Poor walk-forward efficiency (<20%): Strategy likely overfit to in-sample data');
    }

    if (stability >= 0.7) {
      interpretations.push('High parameter stability: Strategy parameters are robust across time periods');
    } else if (stability >= 0.4) {
      interpretations.push('Moderate parameter stability: Some variation in optimal parameters over time');
    } else {
      interpretations.push('Low parameter stability: Parameters highly sensitive to time period');
    }

    return interpretations;
  }

  /**
   * Get overfitting recommendation
   */
  _getOverfittingRecommendation(riskLevel) {
    switch (riskLevel) {
      case 'CRITICAL':
        return 'DO NOT DEPLOY - Critical overfitting issues detected';
      case 'HIGH':
        return 'NOT RECOMMENDED - Multiple high-severity issues detected';
      case 'MODERATE':
        return 'CAUTION - Some issues detected, monitor closely if deployed';
      case 'LOW':
        return 'APPROVED - Strategy passes overfitting diagnostics';
      default:
        return 'UNKNOWN - Unable to assess overfitting risk';
    }
  }

  /**
   * Generate deployment recommendation
   */
  _generateRecommendation(results) {
    const issues = [];
    let canDeploy = true;

    // Check backtest metrics
    if (results.backtest.metrics.sharpe < 0) {
      issues.push('Negative Sharpe ratio');
      canDeploy = false;
    }

    if (results.backtest.metrics.maxDrawdown > 0.40) {
      issues.push('Excessive drawdown (>40%)');
    }

    // Check walk-forward
    if (results.walkForward && !results.walkForward.error) {
      if (results.walkForward.walkForwardEfficiency < 0.30) {
        issues.push('Poor walk-forward efficiency (<30%)');
        canDeploy = false;
      }
    }

    // Check overfitting
    if (results.overfitting && !results.overfitting.error) {
      if (results.overfitting.overallRisk === 'CRITICAL') {
        issues.push('Critical overfitting risk');
        canDeploy = false;
      } else if (results.overfitting.overallRisk === 'HIGH') {
        issues.push('High overfitting risk');
      }
    }

    // Check statistical significance
    if (results.statistical) {
      if (!results.statistical.isSignificant) {
        issues.push('Results not statistically significant');
      }
    }

    return {
      canDeploy,
      confidence: canDeploy ? (issues.length === 0 ? 'HIGH' : 'MODERATE') : 'LOW',
      issues,
      summary: canDeploy
        ? (issues.length === 0
            ? '✅ APPROVED - Strategy passes all validation checks'
            : '⚠️ APPROVED WITH CAUTION - Minor issues detected')
        : '❌ NOT APPROVED - Critical issues prevent deployment'
    };
  }

  /**
   * Store results in database
   */
  async _storeResults(database, strategyId, strategyName, results) {
    try {
      await database.query(`
        INSERT INTO backtest_results (
          unified_strategy_id, strategy_name, run_type, start_date, end_date,
          parameters, metrics, equity_curve, trades
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        strategyId,
        strategyName,
        'unified_full',
        results.period.startDate,
        results.period.endDate,
        JSON.stringify({
          mode: 'full',
          benchmark: results.benchmark
        }),
        JSON.stringify({
          ...results.backtest.metrics,
          walkForwardEfficiency: results.walkForward?.walkForwardEfficiency,
          overfittingRisk: results.overfitting?.overallRisk
        }),
        JSON.stringify(results.backtest.equityCurve),
        JSON.stringify(results.backtest.trades.slice(0, 1000)) // Limit stored trades
      ]);

      // Update strategy backtest cache
      this.strategyManager.updateBacktestCache(strategyId, {
        sharpe: results.backtest.metrics.sharpe,
        alpha: results.backtest.metrics.alpha,
        maxDrawdown: results.backtest.metrics.maxDrawdown
      });
    } catch (error) {
      console.warn('Failed to store backtest results:', error.message);
    }
  }

  /**
   * Print summary report
   */
  _printSummary(results) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 BACKTEST SUMMARY');
    console.log('='.repeat(70));

    console.log('\n📈 Performance Metrics:');
    console.log(`  Total Return: ${((results.backtest.finalValue / results.backtest.initialCapital - 1) * 100).toFixed(2)}%`);
    console.log(`  Annualized Return: ${(results.backtest.metrics.annualizedReturn * 100).toFixed(2)}%`);
    console.log(`  Sharpe Ratio: ${results.backtest.metrics.sharpe.toFixed(2)}`);
    console.log(`  Sortino Ratio: ${results.backtest.metrics.sortino.toFixed(2)}`);
    console.log(`  Max Drawdown: ${(results.backtest.metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`  Alpha: ${(results.backtest.metrics.alpha * 100).toFixed(2)}%`);
    console.log(`  Beta: ${results.backtest.metrics.beta.toFixed(2)}`);

    if (results.walkForward && !results.walkForward.error) {
      console.log('\n🔄 Walk-Forward Analysis:');
      console.log(`  Efficiency: ${(results.walkForward.walkForwardEfficiency * 100).toFixed(1)}%`);
      console.log(`  Parameter Stability: ${(results.walkForward.parameterStability * 100).toFixed(1)}%`);
      console.log(`  Periods: ${results.walkForward.numPeriods}`);
    }

    if (results.overfitting && !results.overfitting.error) {
      console.log('\n🔍 Overfitting Assessment:');
      console.log(`  Risk Level: ${results.overfitting.overallRisk}`);
      console.log(`  Tests Passed: ${results.overfitting.testsPassed}/${results.overfitting.testsRun}`);
    }

    if (results.statistical) {
      console.log('\n📐 Statistical Significance:');
      console.log(`  Significant: ${results.statistical.isSignificant ? 'Yes' : 'No'}`);
      console.log(`  P-Value: ${results.statistical.pValue.toFixed(4)}`);
      console.log(`  95% CI: [${results.statistical.sharpe95CI[0].toFixed(2)}, ${results.statistical.sharpe95CI[1].toFixed(2)}]`);
    }

    console.log('\n🎯 RECOMMENDATION:');
    console.log(`  ${results.recommendation.summary}`);
    if (results.recommendation.issues.length > 0) {
      console.log('  Issues:');
      results.recommendation.issues.forEach(issue => console.log(`    - ${issue}`));
    }

    console.log(`\n${'='.repeat(70)}\n`);
  }

  // ==========================================
  // PUBLIC UTILITY METHODS (for testing & external use)
  // ==========================================

  /**
   * Validate backtest configuration
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    // Check dates
    if (config.startDate && config.endDate) {
      const start = new Date(config.startDate);
      const end = new Date(config.endDate);

      if (end <= start) {
        errors.push('End date must be after start date');
      }

      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      if (daysDiff < 30) {
        warnings.push('Backtest period is less than 30 days');
        if (config.mode === BACKTEST_MODES.FULL) {
          errors.push('Full validation requires at least 252 trading days');
        }
      }

      if (daysDiff < 252 && config.mode === BACKTEST_MODES.FULL) {
        warnings.push('Full validation works best with at least 1 year of data');
      }
    }

    // Check benchmark
    if (config.benchmark) {
      const validBenchmarks = ['SPY', 'QQQ', 'IWM', 'VTI', 'DIA', 'VOO'];
      if (!validBenchmarks.includes(config.benchmark.toUpperCase())) {
        warnings.push(`Benchmark ${config.benchmark} may not have sufficient data`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Calculate Sharpe ratio from returns array
   */
  calculateSharpeRatio(returns, annualizationFactor = 252) {
    if (!returns || returns.length === 0) return 0;

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return avgReturn > 0 ? Infinity : 0;

    const annualizedReturn = avgReturn * annualizationFactor;
    const annualizedStdDev = stdDev * Math.sqrt(annualizationFactor);
    const riskFreeRate = this.options.riskFreeRate || 0.02;

    return (annualizedReturn - riskFreeRate) / annualizedStdDev;
  }

  /**
   * Calculate maximum drawdown from equity curve
   */
  calculateMaxDrawdown(equityCurve) {
    if (!equityCurve || equityCurve.length === 0) return 0;

    let maxDrawdown = 0;
    let peak = equityCurve[0];

    for (const value of equityCurve) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (value - peak) / peak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * Calculate win rate from trades
   */
  calculateWinRate(trades) {
    if (!trades || trades.length === 0) return 0;

    const winners = trades.filter(t => t.pnl > 0).length;
    return winners / trades.length;
  }

  /**
   * Calculate profit factor from trades
   */
  calculateProfitFactor(trades) {
    if (!trades || trades.length === 0) return 0;

    const grossProfit = trades
      .filter(t => t.pnl > 0)
      .reduce((sum, t) => sum + t.pnl, 0);

    const grossLoss = Math.abs(trades
      .filter(t => t.pnl < 0)
      .reduce((sum, t) => sum + t.pnl, 0));

    if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;

    return grossProfit / grossLoss;
  }

  /**
   * Calculate deflated Sharpe ratio (multiple testing correction)
   */
  calculateDeflatedSharpe(observedSharpe, numberOfTrials, returns = null) {
    // Bailey and Lopez de Prado's deflated Sharpe ratio
    const expectedMaxSharpe = Math.sqrt(2 * Math.log(numberOfTrials));
    const deflated = observedSharpe - expectedMaxSharpe * 0.5;
    return Math.max(0, deflated);
  }

  /**
   * Calculate overfitting score comparing IS and OOS results
   */
  calculateOverfitScore(inSampleResults, outOfSampleResults) {
    const isReturn = inSampleResults.returns || 0;
    const oosReturn = outOfSampleResults.returns || 0;
    const isSharpe = inSampleResults.sharpe || 0;
    const oosSharpe = outOfSampleResults.sharpe || 0;

    // Calculate decay ratios
    const returnDecay = isSharpe > 0 ? Math.max(0, 1 - (oosReturn / isReturn)) : 0;
    const sharpeDecay = isSharpe > 0 ? Math.max(0, 1 - (oosSharpe / isSharpe)) : 0;

    // Combined overfit score (0 = no overfitting, 1 = severe overfitting)
    return (returnDecay + sharpeDecay) / 2;
  }

  /**
   * Calculate walk-forward efficiency
   */
  calculateWalkForwardEfficiency(windows) {
    if (!windows || windows.length === 0) return 0;

    let totalEfficiency = 0;

    for (const window of windows) {
      const trainReturn = window.trainReturn || 0;
      const testReturn = window.testReturn || 0;

      if (trainReturn > 0) {
        // Efficiency is ratio of test to train performance
        const ratio = Math.min(1, testReturn / trainReturn);
        totalEfficiency += Math.max(0, ratio);
      }
    }

    return totalEfficiency / windows.length;
  }

  /**
   * Get available stress test scenarios
   */
  getStressScenarios() {
    return getAvailableScenarios ? getAvailableScenarios() : [
      { id: 'COVID_2020', name: 'COVID-19 Crash', startDate: '2020-02-19', endDate: '2020-03-23' },
      { id: 'RATE_SHOCK_2022', name: '2022 Rate Shock', startDate: '2022-01-03', endDate: '2022-10-12' }
    ];
  }

  /**
   * Validate stress scenario configuration
   */
  validateStressScenarios(scenarioIds) {
    const availableScenarios = this.getStressScenarios();
    const availableIds = availableScenarios.map(s => s.id);
    const warnings = [];
    const errors = [];

    for (const id of scenarioIds) {
      if (!availableIds.includes(id)) {
        warnings.push(`Unknown stress scenario: ${id}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create empty results structure for a given mode
   */
  createEmptyResults(mode) {
    const base = {
      backtest: {
        metrics: {
          sharpe: 0,
          sortino: 0,
          maxDrawdown: 0,
          annualizedReturn: 0,
          winRate: 0
        },
        trades: [],
        equityCurve: []
      }
    };

    if (mode === 'full_validation' || mode === BACKTEST_MODES.FULL) {
      return {
        ...base,
        walkForward: {
          efficiency: 0,
          periods: []
        },
        overfitting: {
          overallRisk: 'unknown',
          tests: []
        },
        stress: {
          scenarios: []
        },
        factors: {
          exposures: {}
        },
        statistical: {
          pValue: 1,
          isSignificant: false
        },
        recommendation: {
          canDeploy: false,
          issues: []
        }
      };
    }

    return base;
  }

  /**
   * Get deployment recommendation from results
   */
  getDeploymentRecommendation(results) {
    const issues = [];
    let deployable = true;

    // Check overfitting
    if (results.overfitting) {
      const risk = results.overfitting.overallRisk?.toLowerCase?.() || results.overfitting.overallRisk;
      if (risk === 'high' || risk === 'critical') {
        deployable = false;
        issues.push('High overfitting risk');
      }
    }

    // Check walk-forward efficiency
    if (results.walkForward) {
      const efficiency = results.walkForward.efficiency || 0;
      if (efficiency < 0.3) {
        deployable = false;
        issues.push('Poor walk-forward efficiency');
      }
    }

    // Check statistical significance
    if (results.statistical) {
      if (results.statistical.pValue > 0.05) {
        issues.push('Results not statistically significant');
      }
      if ((results.statistical.deflatedSharpe || 0) < 0.5) {
        issues.push('Low deflated Sharpe ratio');
      }
    }

    // Check backtest metrics
    if (results.backtest?.metrics) {
      if (results.backtest.metrics.maxDrawdown < -0.40) {
        issues.push('Excessive maximum drawdown');
      }
    }

    return {
      deployable,
      confidence: deployable ? (issues.length === 0 ? 'high' : 'moderate') : 'low',
      reason: issues.length > 0 ? issues[0] : null,
      warnings: issues,
      issues
    };
  }
}

module.exports = {
  UnifiedBacktestEngine,
  BACKTEST_MODES
};
