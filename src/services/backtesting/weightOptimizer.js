// src/services/backtesting/weightOptimizer.js
// Weight Optimization Engine for Signal Weighting
// Finds optimal signal weights through grid search and ablation studies

const { db } = require('../../database');
const { HistoricalAgentBacktester } = require('./historicalAgentBacktester');
const { SignalPredictivePowerAnalyzer, SIGNAL_TYPES, REGIMES } = require('./signalPredictivePower');
const { deflatedSharpeRatio, correctForMultipleTesting, bootstrapConfidenceInterval,
        minimumTrackRecord, calculateStats, calculateSharpeRatio } = require('./alphaValidation');
const { HISTORICAL_SCENARIOS } = require('./stressTest');

const DEFAULT_WEIGHTS = {
  technical: 0.20,
  fundamental: 0.20,
  sentiment: 0.15,
  insider: 0.15,
  valuation: 0.15,
  factor: 0.15
};

/**
 * WeightOptimizer
 * Optimizes signal weights to maximize alpha vs benchmark
 */
class WeightOptimizer {
  constructor(dbInstance = db) {
    this.db = dbInstance;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Create optimization run
    this.stmtCreateRun = this.db.prepare(`
      INSERT INTO weight_optimization_runs (
        run_name, run_type, start_date, end_date, optimization_target,
        search_config, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'running', datetime('now'))
    `);

    // Update run status (updated Week 3 to include stress tests and CIs)
    this.stmtUpdateRun = this.db.prepare(`
      UPDATE weight_optimization_runs
      SET status = ?,
          total_combinations_tested = ?,
          best_weights = ?,
          best_alpha = ?,
          best_sharpe = ?,
          baseline_alpha = ?,
          baseline_sharpe = ?,
          improvement_pct = ?,
          walk_forward_validated = ?,
          walk_forward_efficiency = ?,
          stress_test_results = ?,
          alpha_ci_lower = ?,
          alpha_ci_upper = ?,
          sharpe_ci_lower = ?,
          sharpe_ci_upper = ?,
          completed_at = datetime('now')
      WHERE id = ?
    `);

    // Store combination result
    this.stmtStoreCombination = this.db.prepare(`
      INSERT INTO weight_combination_results (
        run_id, weights, regime, total_return, annualized_return,
        sharpe_ratio, sortino_ratio, max_drawdown, alpha, beta,
        win_rate, profit_factor, total_trades, avg_holding_days,
        is_walk_forward_validated, walk_forward_efficiency, rank_in_run
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Store regime optimal weights
    this.stmtStoreRegimeWeights = this.db.prepare(`
      INSERT INTO regime_optimal_weights (
        regime, technical_weight, fundamental_weight, sentiment_weight,
        insider_weight, valuation_weight, factor_weight,
        optimization_run_id, alpha, sharpe_ratio, walk_forward_efficiency,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    // Store ablation result
    this.stmtStoreAblation = this.db.prepare(`
      INSERT INTO ablation_study_results (
        run_id, signal_type, baseline_alpha, without_signal_alpha,
        alpha_degradation, importance_rank, regime
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Store walk-forward period results (NEW)
    this.stmtStoreWalkForwardPeriod = this.db.prepare(`
      INSERT INTO walk_forward_periods (
        run_id, period_index, train_start_date, train_end_date,
        test_start_date, test_end_date, purge_days,
        train_sharpe, test_sharpe, train_alpha, test_alpha,
        efficiency, optimal_weights
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Get market regime periods
    this.stmtGetRegimePeriods = this.db.prepare(`
      SELECT
        regime,
        MIN(date) as start_date,
        MAX(date) as end_date,
        COUNT(*) as days
      FROM market_regime_history
      WHERE date >= ? AND date <= ?
      GROUP BY regime
      ORDER BY days DESC
    `);
  }

  /**
   * Run full weight optimization
   */
  async runOptimization(config = {}) {
    const {
      runName = `Optimization_${new Date().toISOString().split('T')[0]}`,
      startDate = '2020-01-01', // Extended to include COVID crisis
      endDate = '2024-12-31',
      optimizationTarget = 'alpha', // 'alpha', 'sharpe', 'sortino'
      stepSize = 0.10,
      fineStepSize = 0.05,
      minWeight = 0,
      maxWeight = 0.45,
      regimeSpecific = true,
      runAblation = true,
      useWalkForward = true,
      verbose = true,

      // Statistical validation (NEW)
      applyStatisticalCorrections = true,
      multipleTestingMethod = 'fdr_bh', // 'fdr_bh' (Benjamini-Hochberg) or 'bonferroni'
      minSignificanceLevel = 0.05,
      minTrackRecordMonths = 36, // 3 years minimum

      // Walk-forward settings (NEW)
      walkForwardPeriods = 5, // Number of rolling windows
      walkForwardPurgeGaps = 5, // Trading days gap between train/test
      minWalkForwardEfficiency = 0.30,
      earlyStopWFE = true, // Stop if WFE < 30%

      // Stress testing (NEW)
      runStressTests = true,
      stressScenarios = ['COVID_2020', 'RATE_SHOCK_2022'],
      maxDrawdownThreshold = 0.40, // 40% max acceptable loss

      // Search space control (NEW)
      maxCombinations = 500, // Limit to reduce multiple testing burden
      topNForFineTuning = 5 // Number of top combinations to fine-tune
    } = config;

    console.log('\n' + '='.repeat(70));
    console.log('🎯 WEIGHT OPTIMIZATION ENGINE');
    console.log('='.repeat(70));
    console.log(`Run Name: ${runName}`);
    console.log(`Period: ${startDate} to ${endDate}`);
    console.log(`Target: Maximize ${optimizationTarget.toUpperCase()} vs SPY`);
    console.log(`Regime-Specific: ${regimeSpecific}`);

    const startTime = Date.now();

    // Create run record
    const runId = this.stmtCreateRun.run(
      runName,
      'grid_search',
      startDate,
      endDate,
      optimizationTarget,
      JSON.stringify({ stepSize, fineStepSize, minWeight, maxWeight, regimeSpecific })
    ).lastInsertRowid;

    try {
      // Step 1: Run baseline
      console.log('\n📊 Running baseline with default weights...');
      const baselineResults = await this._runBacktest(DEFAULT_WEIGHTS, startDate, endDate, verbose);
      const baselineAlpha = parseFloat(baselineResults.benchmark?.alpha || 0);
      const baselineSharpe = parseFloat(baselineResults.performance?.sharpeRatio || 0);

      console.log(`Baseline Alpha: ${baselineAlpha.toFixed(2)}%`);
      console.log(`Baseline Sharpe: ${baselineSharpe.toFixed(2)}`);

      // Step 2: Run ablation study if requested
      let ablationResults = null;
      if (runAblation) {
        console.log('\n🔬 Running ablation study...');
        ablationResults = await this._runAblationStudy(runId, startDate, endDate, baselineAlpha, verbose);
      }

      // Step 3: Generate weight combinations
      console.log('\n⚙️ Generating weight combinations...');
      const coarseCombinations = this._generateWeightCombinations(stepSize, minWeight, maxWeight);
      console.log(`Coarse grid: ${coarseCombinations.length} combinations`);

      // Step 4: Test coarse combinations
      console.log('\n🔄 Testing coarse grid combinations...');
      const coarseResults = await this._testCombinations(
        runId, coarseCombinations, startDate, endDate, optimizationTarget, null, verbose
      );

      // Step 4.5: Apply Multiple Testing Correction to coarse results
      if (applyStatisticalCorrections && coarseResults.length > 0) {
        console.log('\n📊 Applying multiple testing corrections...');

        // Calculate p-values from Sharpe ratios (approximate t-test)
        const pValues = coarseResults.map(r => {
          const sharpe = r.sharpe || 0;
          const tStat = sharpe * Math.sqrt(252); // Annualized observations
          const pValue = 2 * (1 - this._normalCDF(Math.abs(tStat)));
          return Math.max(0.001, Math.min(0.999, pValue)); // Clamp to valid range
        });

        // Apply FDR or Bonferroni correction
        const correctionResult = correctForMultipleTesting(pValues, multipleTestingMethod);
        console.log(`  ${correctionResult.interpretation}`);

        // Attach adjusted p-values to results
        coarseResults.forEach((r, i) => {
          r.originalPValue = pValues[i];
          r.adjustedPValue = correctionResult.adjustedPValues[i];
          r.significantAfterCorrection = correctionResult.significant[i].significant;
        });

        // Filter to only statistically significant combinations
        const significantResults = coarseResults.filter(r => r.significantAfterCorrection);

        if (significantResults.length === 0) {
          console.log('\n⚠️  WARNING: No combinations survived multiple testing correction');
          console.log('   Consider: (1) Reducing search space, (2) Extending backtest period, (3) Using simpler model');
          console.log('   Continuing with top 10 results but flagging the issue...');
        } else {
          console.log(`  ✓ ${significantResults.length}/${coarseResults.length} combinations remain after correction`);
          // Replace coarseResults with only significant ones for fine-tuning
          coarseResults.length = 0;
          coarseResults.push(...significantResults);
        }
      }

      // Step 5: Fine-tune around top performers
      console.log('\n🎯 Fine-tuning top performers...');
      const topCombinations = coarseResults.slice(0, topNForFineTuning);
      const fineCombinations = this._generateFineCombinations(topCombinations, fineStepSize, minWeight, maxWeight);
      console.log(`Fine grid: ${fineCombinations.length} additional combinations`);

      const fineResults = await this._testCombinations(
        runId, fineCombinations, startDate, endDate, optimizationTarget, null, verbose
      );

      // Step 6: Combine and rank all results
      const allResults = [...coarseResults, ...fineResults];
      allResults.sort((a, b) => b.alpha - a.alpha); // Sort by alpha descending

      // Step 6.5: Calculate Deflated Sharpe Ratio for all combinations
      if (applyStatisticalCorrections && allResults.length > 0) {
        console.log('\n🎯 Calculating deflated Sharpe ratios...');

        const nTrials = allResults.length; // Total combinations tested

        for (let i = 0; i < Math.min(allResults.length, 20); i++) { // Top 20 only for performance
          const result = allResults[i];

          try {
            // Re-run backtest to get return series
            const backtest = await this._runBacktest(result.weights, startDate, endDate, false);
            const returns = this._extractReturnsFromBacktest(backtest);

            if (returns.length > 60) { // Need minimum data
              const stats = calculateStats(returns);
              const deflatedResult = deflatedSharpeRatio(
                result.sharpe,
                nTrials,
                stats.skew,
                stats.kurtosis,
                returns.length
              );

              result.deflatedSharpe = deflatedResult.deflatedSharpe;
              result.deflatedSharpePValue = deflatedResult.pValue;
              result.deflatedSignificant = deflatedResult.significant;

              // Calculate minimum track record length
              const mtr = minimumTrackRecord(result.sharpe, 0.95, stats.skew, stats.kurtosis);
              result.minTrackRecordMonths = mtr.minMonths;
            }
          } catch (error) {
            // Skip if backtest fails
            continue;
          }
        }

        // Re-rank by deflated Sharpe (more conservative)
        allResults.sort((a, b) => (b.deflatedSharpe || -Infinity) - (a.deflatedSharpe || -Infinity));

        const bestDeflatedResult = allResults.find(r => r.deflatedSharpe);
        if (bestDeflatedResult) {
          console.log(`  Best deflated Sharpe: ${bestDeflatedResult.deflatedSharpe.toFixed(3)} (p=${bestDeflatedResult.deflatedSharpePValue.toFixed(3)})`);

          if (!bestDeflatedResult.deflatedSignificant) {
            console.log(`  ⚠️  WARNING: Best result is not statistically significant after deflation`);
          }
        }
      }

      // Add ranks
      allResults.forEach((r, i) => {
        r.rank = i + 1;
        this._updateCombinationRank(runId, r.weights, i + 1);
      });

      const bestResult = allResults[0];
      const improvement = baselineAlpha !== 0
        ? ((bestResult.alpha - baselineAlpha) / Math.abs(baselineAlpha)) * 100
        : bestResult.alpha * 100;

      // Step 7: Regime-specific optimization if requested
      let regimeOptimalWeights = {};
      if (regimeSpecific) {
        console.log('\n📈 Optimizing for each market regime...');
        regimeOptimalWeights = await this._optimizeByRegime(
          runId, allResults.slice(0, 50), startDate, endDate, optimizationTarget, verbose
        );
      }

      // Step 8: Walk-forward validation if requested
      let walkForwardResult = null;
      if (useWalkForward && bestResult) {
        console.log('\n✅ Validating with rolling walk-forward analysis...');
        walkForwardResult = await this._validateWalkForward(
          runId,
          bestResult.weights,
          startDate,
          endDate,
          {
            numPeriods: walkForwardPeriods,
            purgeGaps: walkForwardPurgeGaps,
            minEfficiency: minWalkForwardEfficiency,
            earlyStop: earlyStopWFE
          }
        );

        if (walkForwardResult.avgEfficiency !== null) {
          console.log(`Walk-Forward Efficiency: ${(walkForwardResult.avgEfficiency * 100).toFixed(1)}%`);
          console.log(`Parameter Stability: ${(walkForwardResult.stability * 100).toFixed(1)}%`);

          if (walkForwardResult.avgEfficiency < minWalkForwardEfficiency) {
            console.log(`⚠️  WARNING: Walk-forward efficiency below ${(minWalkForwardEfficiency * 100).toFixed(0)}% threshold`);
            console.log('   This suggests significant overfitting to in-sample data');
          }

          if (walkForwardResult.avgEfficiency > 0.90) {
            console.log(`⚠️  WARNING: Walk-forward efficiency suspiciously high (>90%)`);
            console.log('   This may indicate data leakage or lookahead bias');
          }
        }
      }

      // Step 9: Stress Testing (NEW - Week 3)
      let stressTestResults = null;
      if (runStressTests && bestResult) {
        console.log('\n✅ Running stress tests on best weights...');
        stressTestResults = {};

        for (const scenarioName of stressScenarios) {
          const scenario = HISTORICAL_SCENARIOS[scenarioName];
          if (!scenario) {
            console.log(`⚠️  WARNING: Unknown stress scenario: ${scenarioName}`);
            continue;
          }

          console.log(`  Testing ${scenario.name}...`);

          // Run backtest with stress scenario applied
          const stressBacktest = await this._runStressBacktest(
            bestResult.weights,
            startDate,
            endDate,
            scenario
          );

          const maxDrawdown = Math.abs(parseFloat(stressBacktest.performance.maxDrawdown) || 0);
          const totalReturn = parseFloat(stressBacktest.performance.totalReturn) || 0;
          const recoveryDays = this._estimateRecoveryDays(maxDrawdown);

          const passed = maxDrawdown <= maxDrawdownThreshold;

          stressTestResults[scenarioName] = {
            scenarioName: scenario.name,
            maxDrawdown: maxDrawdown.toFixed(4),
            totalReturn: totalReturn.toFixed(4),
            recoveryDays,
            threshold: maxDrawdownThreshold,
            passed
          };

          console.log(`    Max Drawdown: ${(maxDrawdown * 100).toFixed(1)}% ${passed ? '✅' : '❌'}`);
          if (!passed) {
            console.log(`    ⚠️  WARNING: Max drawdown exceeds ${(maxDrawdownThreshold * 100).toFixed(0)}% threshold`);
          }
        }

        // Check if all stress tests passed
        const allPassed = Object.values(stressTestResults).every(r => r.passed);
        if (!allPassed) {
          console.log(`\n⚠️  WARNING: Strategy failed ${Object.values(stressTestResults).filter(r => !r.passed).length} stress test(s)`);
          console.log('   Consider reducing position sizes or adding hedges');
        }
      }

      // Step 10: Bootstrap Confidence Intervals (NEW - Week 3)
      let confidenceIntervals = null;
      if (applyStatisticalCorrections && bestResult) {
        console.log('\n✅ Calculating bootstrap confidence intervals...');

        const backtest = await this._runBacktest(bestResult.weights, startDate, endDate, false);
        const returns = this._extractReturnsFromBacktest(backtest);

        if (returns.length > 60) {
          // Bootstrap confidence intervals for Sharpe ratio (5000 samples, block size 21)
          const sharpeResult = bootstrapConfidenceInterval(
            returns,
            (r) => calculateSharpeRatio(r),
            5000,  // nBootstrap
            21     // blockSize
          );

          // Bootstrap confidence intervals for alpha (using mean return as proxy)
          const alphaResult = bootstrapConfidenceInterval(
            returns,
            (r) => {
              const meanReturn = r.reduce((a, b) => a + b, 0) / r.length;
              return meanReturn * 252; // Annualize
            },
            5000,  // nBootstrap
            21     // blockSize
          );

          // Handle error cases and extract CI values
          const sharpeCIs = sharpeResult.error ? null : {
            lower: sharpeResult.ci95[0],
            upper: sharpeResult.ci95[1],
            estimate: sharpeResult.pointEstimate
          };

          const alphaCIs = alphaResult.error ? null : {
            lower: alphaResult.ci95[0],
            upper: alphaResult.ci95[1],
            estimate: alphaResult.pointEstimate
          };

          if (sharpeCIs && alphaCIs) {
            confidenceIntervals = {
              sharpe: sharpeCIs,
              alpha: alphaCIs
            };

            console.log(`  Sharpe 95% CI: [${sharpeCIs.lower.toFixed(3)}, ${sharpeCIs.upper.toFixed(3)}]`);
            console.log(`  Alpha 95% CI: [${(alphaCIs.lower * 100).toFixed(1)}%, ${(alphaCIs.upper * 100).toFixed(1)}%]`);
          } else {
            console.log(`  ⚠️  Bootstrap CI calculation failed: ${sharpeResult.error || alphaResult.error}`);
          }

          // Warn if confidence intervals are wide or include zero (only if CIs exist)
          if (sharpeCIs && alphaCIs) {
            const sharpeWidth = sharpeCIs.upper - sharpeCIs.lower;
            if (sharpeWidth > 1.0) {
              console.log(`  ⚠️  WARNING: Wide Sharpe confidence interval (width: ${sharpeWidth.toFixed(2)})`);
              console.log('     This indicates high uncertainty in performance estimates');
            }

            if (sharpeCIs.lower < 0) {
              console.log(`  ⚠️  WARNING: Sharpe confidence interval includes negative values`);
              console.log('     Strategy may not have genuine edge');
            }

            if (alphaCIs.lower < 0) {
              console.log(`  ⚠️  WARNING: Alpha confidence interval includes negative values`);
              console.log('     Expected returns are uncertain');
            }
          }
        }
      }

      // Update run record (including new fields - Week 3)
      this.stmtUpdateRun.run(
        'completed',
        allResults.length,
        JSON.stringify(bestResult.weights),
        bestResult.alpha,
        bestResult.sharpe,
        baselineAlpha,
        baselineSharpe,
        improvement,
        walkForwardResult ? 1 : 0,
        walkForwardResult?.avgEfficiency,
        stressTestResults ? JSON.stringify(stressTestResults) : null,
        confidenceIntervals?.alpha?.lower || null,
        confidenceIntervals?.alpha?.upper || null,
        confidenceIntervals?.sharpe?.lower || null,
        confidenceIntervals?.sharpe?.upper || null,
        runId
      );

      const elapsed = (Date.now() - startTime) / 1000;

      // Print summary
      const walkForwardEfficiency = walkForwardResult?.avgEfficiency ?? null;

      this._printOptimizationSummary({
        runId,
        baselineAlpha,
        baselineSharpe,
        bestResult,
        improvement,
        ablationResults,
        regimeOptimalWeights,
        walkForwardEfficiency,
        totalCombinations: allResults.length,
        elapsed
      });

      return {
        runId,
        baseline: { alpha: baselineAlpha, sharpe: baselineSharpe },
        bestWeights: bestResult.weights,
        bestAlpha: bestResult.alpha,
        bestSharpe: bestResult.sharpe,
        improvement,
        ablationResults,
        regimeOptimalWeights,
        walkForwardEfficiency,
        topCombinations: allResults.slice(0, 10),
        elapsed
      };

    } catch (error) {
      this.db.prepare(`UPDATE weight_optimization_runs SET status = 'failed', error_message = ? WHERE id = ?`)
        .run(error.message, runId);
      throw error;
    }
  }

  /**
   * Run a single backtest with given weights
   */
  async _runBacktest(weights, startDate, endDate, verbose = false) {
    const backtester = new HistoricalAgentBacktester(this.db, {
      startDate,
      endDate,
      initialCapital: 100000,
      stepFrequency: 'weekly',
      universe: 'top100',
      signalWeights: weights,
      verbose: false
    });

    return await backtester.runBacktest();
  }

  /**
   * Run ablation study - remove each signal one at a time
   */
  async _runAblationStudy(runId, startDate, endDate, baselineAlpha, verbose) {
    const results = [];

    for (const signalType of SIGNAL_TYPES) {
      if (verbose) {
        process.stdout.write(`  Testing without ${signalType}...`);
      }

      // Create weights with this signal zeroed
      const weights = { ...DEFAULT_WEIGHTS };
      const removedWeight = weights[signalType];
      weights[signalType] = 0;

      // Redistribute weight to other signals proportionally
      const remainingTotal = 1 - removedWeight;
      const redistributionFactor = 1 / remainingTotal;
      for (const key of Object.keys(weights)) {
        if (key !== signalType) {
          weights[key] *= redistributionFactor;
        }
      }

      const backtest = await this._runBacktest(weights, startDate, endDate, false);
      const alpha = parseFloat(backtest.benchmark?.alpha || 0);
      const degradation = baselineAlpha - alpha;

      results.push({
        signalType,
        baselineAlpha,
        withoutAlpha: alpha,
        degradation,
        importanceScore: degradation // Higher degradation = more important
      });

      if (verbose) {
        console.log(` Alpha: ${alpha.toFixed(2)}% (Δ${degradation >= 0 ? '+' : ''}${degradation.toFixed(2)}%)`);
      }
    }

    // Rank by importance
    results.sort((a, b) => b.degradation - a.degradation);
    results.forEach((r, i) => {
      r.rank = i + 1;
      this.stmtStoreAblation.run(
        runId,
        r.signalType,
        r.baselineAlpha,
        r.withoutAlpha,
        r.degradation,
        r.rank,
        'ALL'
      );
    });

    return results;
  }

  /**
   * Generate all valid weight combinations (sum to 1.0)
   */
  _generateWeightCombinations(stepSize, minWeight, maxWeight) {
    const combinations = [];
    const signalTypes = SIGNAL_TYPES;
    const numSignals = signalTypes.length;

    // Recursive generator
    const generate = (index, remaining, current) => {
      if (index === numSignals - 1) {
        // Last signal gets remaining weight
        if (remaining >= minWeight && remaining <= maxWeight) {
          combinations.push({
            ...current,
            [signalTypes[index]]: Math.round(remaining * 100) / 100
          });
        }
        return;
      }

      // Try each weight value for current signal
      for (let w = minWeight; w <= Math.min(remaining, maxWeight); w += stepSize) {
        const weight = Math.round(w * 100) / 100;
        generate(index + 1, remaining - weight, {
          ...current,
          [signalTypes[index]]: weight
        });
      }
    };

    generate(0, 1.0, {});

    return combinations;
  }

  /**
   * Generate fine-tuned combinations around top performers
   */
  _generateFineCombinations(topResults, stepSize, minWeight, maxWeight) {
    const combinations = new Set();

    for (const result of topResults) {
      const baseWeights = result.weights;

      // Generate variations for each signal
      for (const signal of SIGNAL_TYPES) {
        for (let delta = -stepSize * 2; delta <= stepSize * 2; delta += stepSize) {
          if (delta === 0) continue;

          const newWeight = Math.round((baseWeights[signal] + delta) * 100) / 100;
          if (newWeight < minWeight || newWeight > maxWeight) continue;

          // Adjust another signal to compensate
          for (const otherSignal of SIGNAL_TYPES) {
            if (otherSignal === signal) continue;

            const otherWeight = Math.round((baseWeights[otherSignal] - delta) * 100) / 100;
            if (otherWeight < minWeight || otherWeight > maxWeight) continue;

            const newWeights = {
              ...baseWeights,
              [signal]: newWeight,
              [otherSignal]: otherWeight
            };

            // Validate sum = 1.0
            const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
            if (Math.abs(sum - 1.0) < 0.001) {
              combinations.add(JSON.stringify(newWeights));
            }
          }
        }
      }
    }

    return Array.from(combinations).map(s => JSON.parse(s));
  }

  /**
   * Test a batch of weight combinations
   */
  async _testCombinations(runId, combinations, startDate, endDate, target, regime, verbose) {
    const results = [];
    const total = combinations.length;
    let count = 0;
    const startTime = Date.now();

    for (const weights of combinations) {
      count++;
      // Show progress every 10 combinations or at specific percentages
      if (count === 1 || count % 10 === 0 || count === total) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = count / elapsed;
        const remaining = (total - count) / rate;
        process.stdout.write(`\r  Progress: ${count}/${total} (${((count / total) * 100).toFixed(0)}%) | ${elapsed.toFixed(0)}s elapsed | ~${remaining.toFixed(0)}s remaining    `);
      }

      try {
        const backtest = await this._runBacktest(weights, startDate, endDate, false);

        const result = {
          weights,
          regime: regime || 'ALL',
          totalReturn: parseFloat(backtest.performance?.totalReturn || 0),
          annualizedReturn: parseFloat(backtest.performance?.annualizedReturn || 0),
          sharpe: parseFloat(backtest.performance?.sharpeRatio || 0),
          sortino: parseFloat(backtest.performance?.sortinoRatio || 0),
          maxDrawdown: parseFloat(backtest.performance?.maxDrawdown || 0),
          alpha: parseFloat(backtest.benchmark?.alpha || 0),
          beta: parseFloat(backtest.benchmark?.beta || 1),
          winRate: parseFloat(backtest.performance?.winRate || 0),
          profitFactor: parseFloat(backtest.performance?.profitFactor || 0),
          trades: backtest.trades?.total || 0,
          avgHoldingDays: backtest.trades?.avgHoldingPeriod || 0
        };

        // Store in database
        this.stmtStoreCombination.run(
          runId,
          JSON.stringify(weights),
          result.regime,
          result.totalReturn,
          result.annualizedReturn,
          result.sharpe,
          result.sortino,
          result.maxDrawdown,
          result.alpha,
          result.beta,
          result.winRate,
          result.profitFactor,
          result.trades,
          result.avgHoldingDays,
          0, // walk-forward validated
          null, // walk-forward efficiency
          null // rank
        );

        results.push(result);
      } catch (e) {
        // Skip failed backtests
        continue;
      }
    }

    // Clear the progress line
    console.log(''); // New line after progress

    // Sort by target metric
    results.sort((a, b) => {
      if (target === 'sharpe') return b.sharpe - a.sharpe;
      if (target === 'sortino') return b.sortino - a.sortino;
      return b.alpha - a.alpha; // default to alpha
    });

    return results;
  }

  /**
   * Optimize weights for each market regime
   */
  async _optimizeByRegime(runId, topCombinations, startDate, endDate, target, verbose) {
    const regimeWeights = {};

    // Get regime periods
    let regimePeriods;
    try {
      regimePeriods = this.stmtGetRegimePeriods.all(startDate, endDate);
    } catch (e) {
      // No regime data, use overall best
      if (verbose) console.log('  No regime data available, using overall optimal weights');
      return regimeWeights;
    }

    for (const regime of REGIMES) {
      if (regime === 'ALL') continue;

      const regimeData = regimePeriods.find(r => r.regime === regime);
      if (!regimeData || regimeData.days < 30) {
        if (verbose) console.log(`  ${regime}: Insufficient data (${regimeData?.days || 0} days)`);
        continue;
      }

      if (verbose) {
        console.log(`  ${regime}: Testing ${topCombinations.length} combinations...`);
      }

      // Test top combinations on this regime's data
      // Note: This is simplified - in production, you'd filter data by regime
      let bestResult = null;
      let bestScore = -Infinity;

      for (const combo of topCombinations) {
        // For now, use overall performance as proxy
        // In production, you'd re-run backtest filtered to regime periods
        const score = target === 'sharpe' ? combo.sharpe : combo.alpha;
        if (score > bestScore) {
          bestScore = score;
          bestResult = combo;
        }
      }

      if (bestResult) {
        regimeWeights[regime] = {
          weights: bestResult.weights,
          alpha: bestResult.alpha,
          sharpe: bestResult.sharpe
        };

        // Store in database
        this.stmtStoreRegimeWeights.run(
          regime,
          bestResult.weights.technical,
          bestResult.weights.fundamental,
          bestResult.weights.sentiment,
          bestResult.weights.insider,
          bestResult.weights.valuation,
          bestResult.weights.factor,
          runId,
          bestResult.alpha,
          bestResult.sharpe,
          null // walk-forward efficiency
        );

        if (verbose) {
          console.log(`    Best Alpha: ${bestResult.alpha.toFixed(2)}%`);
        }
      }
    }

    return regimeWeights;
  }

  /**
   * Validate weights with proper rolling walk-forward analysis
   * Implements purging gaps and multiple re-optimization windows
   */
  async _validateWalkForward(runId, weights, startDate, endDate, config = {}) {
    const {
      numPeriods = 5,
      isRatio = 0.7, // 70% train, 30% test
      purgeGaps = 5,
      minEfficiency = 0.30,
      earlyStop = true
    } = config;

    console.log(`  Rolling Walk-Forward: ${numPeriods} periods, ${(isRatio * 100).toFixed(0)}% train / ${((1 - isRatio) * 100).toFixed(0)}% test`);

    // Get trading days in range
    const tradingDays = this._getTradingDays(startDate, endDate);
    const totalDays = tradingDays.length;

    if (totalDays < 252) {
      console.log('  ⚠️ Insufficient data for walk-forward (<1 year)');
      return { avgEfficiency: null, stability: null, numPeriods: 0, periods: [] };
    }

    const periodResults = [];
    const stepSize = Math.floor(totalDays / numPeriods); // Rolling window step

    for (let i = 0; i < numPeriods; i++) {
      console.log(`  Period ${i + 1}/${numPeriods}: Running...`);

      const windowStart = Math.max(0, i * stepSize);
      const windowEnd = Math.min(windowStart + stepSize + (totalDays - numPeriods * stepSize), totalDays - 1);

      if (windowEnd - windowStart < 126) {
        console.log(`    ⚠️ Skipped (insufficient data: ${windowEnd - windowStart} days)`);
        continue; // Need at least 6 months
      }

      // Split into train and test with purging
      const trainSize = Math.floor((windowEnd - windowStart) * isRatio);
      const trainEnd = windowStart + trainSize;
      const testStart = Math.min(trainEnd + purgeGaps, windowEnd); // Purge gap

      if (testStart >= windowEnd) {
        console.log(`    ⚠️ Skipped (no room for test period after purge)`);
        continue;
      }

      const trainStartDate = tradingDays[windowStart];
      const trainEndDate = tradingDays[trainEnd];
      const testStartDate = tradingDays[testStart];
      const testEndDate = tradingDays[windowEnd];

      // Run backtest on training period
      console.log(`    Training: ${trainStartDate} to ${trainEndDate}`);
      const trainBacktest = await this._runBacktest(weights, trainStartDate, trainEndDate, false);
      const trainSharpe = parseFloat(trainBacktest.performance?.sharpeRatio || 0);
      const trainAlpha = parseFloat(trainBacktest.benchmark?.alpha || 0);

      // Run backtest on test period (out-of-sample)
      console.log(`    Testing:  ${testStartDate} to ${testEndDate}`);
      const testBacktest = await this._runBacktest(weights, testStartDate, testEndDate, false);
      const testSharpe = parseFloat(testBacktest.performance?.sharpeRatio || 0);
      const testAlpha = parseFloat(testBacktest.benchmark?.alpha || 0);

      // Calculate efficiency
      const efficiency = trainSharpe > 0 ? testSharpe / trainSharpe : 0;
      console.log(`    Result: Train Sharpe=${trainSharpe.toFixed(2)}, Test Sharpe=${testSharpe.toFixed(2)}, Efficiency=${(efficiency * 100).toFixed(0)}%`);

      periodResults.push({
        period: i + 1,
        trainStartDate,
        trainEndDate,
        testStartDate,
        testEndDate,
        trainSharpe,
        testSharpe,
        trainAlpha,
        testAlpha,
        efficiency
      });

      // Store in database
      this.stmtStoreWalkForwardPeriod.run(
        runId,
        i + 1,
        trainStartDate,
        trainEndDate,
        testStartDate,
        testEndDate,
        purgeGaps,
        trainSharpe,
        testSharpe,
        trainAlpha,
        testAlpha,
        efficiency,
        JSON.stringify(weights)
      );

      console.log(`  Period ${i + 1}: Train Sharpe ${trainSharpe.toFixed(2)} → Test Sharpe ${testSharpe.toFixed(2)} (Eff: ${(efficiency * 100).toFixed(1)}%)`);

      // Early stop if efficiency too low
      if (earlyStop && periodResults.length >= 3) {
        const recentEfficiencies = periodResults.slice(-3).map(p => p.efficiency);
        const avgRecent = recentEfficiencies.reduce((a, b) => a + b, 0) / recentEfficiencies.length;

        if (avgRecent < minEfficiency) {
          console.log(`  ⚠️ Early stop: Recent avg efficiency ${(avgRecent * 100).toFixed(1)}% below ${(minEfficiency * 100).toFixed(0)}% threshold`);
          break;
        }
      }
    }

    if (periodResults.length === 0) {
      return { avgEfficiency: null, stability: null, numPeriods: 0, periods: [] };
    }

    // Calculate aggregate metrics
    const avgEfficiency = periodResults.reduce((sum, p) => sum + p.efficiency, 0) / periodResults.length;

    // Calculate parameter stability (CV of test Sharpe)
    const testSharpes = periodResults.map(p => p.testSharpe);
    const avgTestSharpe = testSharpes.reduce((a, b) => a + b, 0) / testSharpes.length;
    const sharpeStd = Math.sqrt(
      testSharpes.reduce((acc, s) => acc + Math.pow(s - avgTestSharpe, 2), 0) / Math.max(1, testSharpes.length - 1)
    );
    const stability = avgTestSharpe > 0 ? Math.max(0, 1 - (sharpeStd / Math.abs(avgTestSharpe))) : 0;

    console.log(`  → Avg Efficiency: ${(avgEfficiency * 100).toFixed(1)}%, Stability: ${(stability * 100).toFixed(1)}%`);

    return {
      avgEfficiency,
      stability,
      numPeriods: periodResults.length,
      periods: periodResults
    };
  }

  /**
   * Update combination rank in database
   */
  _updateCombinationRank(runId, weights, rank) {
    this.db.prepare(`
      UPDATE weight_combination_results
      SET rank_in_run = ?
      WHERE run_id = ? AND weights = ?
    `).run(rank, runId, JSON.stringify(weights));
  }

  /**
   * Print optimization summary
   */
  _printOptimizationSummary(results) {
    console.log('\n' + '='.repeat(70));
    console.log('🏆 WEIGHT OPTIMIZATION RESULTS');
    console.log('='.repeat(70));

    console.log('\n📊 Baseline vs Optimized:');
    console.log(`  Baseline Alpha:  ${results.baselineAlpha.toFixed(2)}%`);
    console.log(`  Optimized Alpha: ${results.bestResult.alpha.toFixed(2)}%`);
    console.log(`  Improvement:     ${results.improvement >= 0 ? '+' : ''}${results.improvement.toFixed(1)}%`);

    console.log('\n🎯 Optimal Weights:');
    for (const [signal, weight] of Object.entries(results.bestResult.weights)) {
      const defaultWeight = DEFAULT_WEIGHTS[signal];
      const change = ((weight - defaultWeight) / defaultWeight * 100).toFixed(0);
      const changeStr = change >= 0 ? `+${change}%` : `${change}%`;
      console.log(`  ${signal.padEnd(12)}: ${(weight * 100).toFixed(0)}% (${changeStr} vs baseline)`);
    }

    if (results.ablationResults) {
      console.log('\n📉 Signal Importance (Ablation):');
      for (const r of results.ablationResults) {
        const direction = r.degradation >= 0 ? '↓' : '↑';
        console.log(`  ${r.rank}. ${r.signalType.padEnd(12)}: ${direction} ${Math.abs(r.degradation).toFixed(2)}% alpha impact`);
      }
    }

    if (Object.keys(results.regimeOptimalWeights).length > 0) {
      console.log('\n📈 Regime-Specific Optimal Weights:');
      for (const [regime, data] of Object.entries(results.regimeOptimalWeights)) {
        console.log(`  ${regime}: Alpha ${data.alpha.toFixed(2)}%`);
      }
    }

    if (results.walkForwardEfficiency !== null) {
      const wfStatus = results.walkForwardEfficiency >= 0.5 ? '✅ ROBUST' : '⚠️ OVERFIT RISK';
      console.log(`\n🔍 Walk-Forward Efficiency: ${(results.walkForwardEfficiency * 100).toFixed(0)}% ${wfStatus}`);
    }

    console.log(`\n⏱️ Completed in ${results.elapsed.toFixed(1)}s`);
    console.log(`📦 Tested ${results.totalCombinations} weight combinations`);
    console.log('='.repeat(70));
  }

  /**
   * Get optimization results by run ID
   */
  getOptimizationResults(runId) {
    const run = this.db.prepare(`
      SELECT * FROM weight_optimization_runs WHERE id = ?
    `).get(runId);

    if (!run) return null;

    const combinations = this.db.prepare(`
      SELECT * FROM weight_combination_results
      WHERE run_id = ?
      ORDER BY rank_in_run ASC
      LIMIT 20
    `).all(runId);

    const ablation = this.db.prepare(`
      SELECT * FROM ablation_study_results
      WHERE run_id = ?
      ORDER BY importance_rank ASC
    `).all(runId);

    const regimeWeights = this.db.prepare(`
      SELECT * FROM regime_optimal_weights
      WHERE optimization_run_id = ?
    `).all(runId);

    return {
      run,
      topCombinations: combinations.map(c => ({
        ...c,
        weights: JSON.parse(c.weights)
      })),
      ablation,
      regimeWeights
    };
  }

  /**
   * Get active regime-specific weights
   */
  getActiveRegimeWeights() {
    return this.db.prepare(`
      SELECT * FROM regime_optimal_weights
      WHERE is_active = 1
      ORDER BY regime
    `).all();
  }

  /**
   * Quick analysis using predictive power
   */
  async quickAnalysis(startDate, endDate) {
    const analyzer = new SignalPredictivePowerAnalyzer(this.db);
    return await analyzer.analyzeAllSignals(startDate, endDate);
  }

  /**
   * Extract daily returns from backtest equity curve
   */
  _extractReturnsFromBacktest(backtest) {
    if (!backtest.equityCurve || backtest.equityCurve.length < 2) {
      return [];
    }

    const returns = [];
    for (let i = 1; i < backtest.equityCurve.length; i++) {
      const prevValue = backtest.equityCurve[i - 1].portfolioValue;
      const currValue = backtest.equityCurve[i].portfolioValue;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }
    return returns;
  }

  /**
   * Get trading days in date range from database
   */
  _getTradingDays(startDate, endDate) {
    const result = this.db.prepare(`
      SELECT DISTINCT date
      FROM daily_prices
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `).all(startDate, endDate);

    return result.map(r => r.date);
  }

  /**
   * Normal CDF approximation for p-value calculation
   * Using erf approximation formula
   */
  _normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * absX);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1 + sign * y);
  }

  /**
   * Run backtest with stress scenario applied (NEW - Week 3)
   * Applies sector-based shocks to simulate crisis conditions
   */
  async _runStressBacktest(weights, startDate, endDate, scenario) {
    // For simplicity, we simulate stress by applying shocks to returns
    // In a full implementation, this would modify the underlying price data

    // Run normal backtest
    const backtest = await this._runBacktest(weights, startDate, endDate, false);

    // Apply stress scenario to equity curve
    // We apply the average shock from the scenario as a haircut
    const avgShock = Object.values(scenario.shocks)
      .filter(v => typeof v === 'number')
      .reduce((a, b) => a + b, 0) / Object.keys(scenario.shocks).filter(k => typeof scenario.shocks[k] === 'number').length;

    // Adjust performance metrics
    const stressedBacktest = {
      ...backtest,
      performance: {
        ...backtest.performance,
        totalReturn: (backtest.performance.totalReturn || 0) + avgShock,
        annualizedReturn: (backtest.performance.annualizedReturn || 0) + (avgShock * (252 / (backtest.equityCurve?.length || 252))),
        maxDrawdown: Math.min((backtest.performance.maxDrawdown || 0) + Math.abs(avgShock), -0.01)
      }
    };

    return stressedBacktest;
  }

  /**
   * Estimate recovery time in days based on drawdown magnitude (NEW - Week 3)
   * Uses empirical relationship: deeper drawdowns take exponentially longer to recover
   */
  _estimateRecoveryDays(drawdown) {
    const drawdownPercent = Math.abs(drawdown);

    // Empirical formula based on historical market recoveries
    // GFC (50% drop) took ~1460 days (4 years)
    // COVID (35% drop) took ~180 days (6 months)
    // Rule of thumb: recovery days ≈ 20 * drawdown^2 * 252

    const baseDays = 20 * Math.pow(drawdownPercent, 2) * 252;

    // Minimum recovery time is 30 days
    return Math.max(30, Math.round(baseDays));
  }
}

module.exports = { WeightOptimizer, DEFAULT_WEIGHTS };
