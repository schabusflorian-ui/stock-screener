// src/services/backtesting/walkForwardEngine.js
// Walk-Forward Optimization Engine for HF-style backtesting
// Implements rolling and anchored walk-forward analysis with CPCV support

const { getDatabaseAsync } = require('../../lib/db');

/**
 * Calculate basic performance metrics for a returns series
 */
function calculateMetrics(returns, riskFreeRate = 0.02) {
  if (!returns || returns.length === 0) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      volatility: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdown: 0,
      calmar: 0,
      winRate: 0
    };
  }

  const n = returns.length;
  const annualizationFactor = 252;

  // Total return (compounded)
  const totalReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;

  // Annualized return
  const annualizedReturn = Math.pow(1 + totalReturn, annualizationFactor / n) - 1;

  // Volatility
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (n - 1);
  const dailyVol = Math.sqrt(variance);
  const volatility = dailyVol * Math.sqrt(annualizationFactor);

  // Sharpe Ratio
  const excessReturn = annualizedReturn - riskFreeRate;
  const sharpe = volatility > 0 ? excessReturn / volatility : 0;

  // Sortino Ratio (downside deviation)
  const downsideReturns = returns.filter(r => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((acc, r) => acc + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideVol = Math.sqrt(downsideVariance) * Math.sqrt(annualizationFactor);
  const sortino = downsideVol > 0 ? excessReturn / downsideVol : 0;

  // Maximum Drawdown
  let peak = 1;
  let maxDrawdown = 0;
  let cumulative = 1;

  for (const r of returns) {
    cumulative *= (1 + r);
    if (cumulative > peak) peak = cumulative;
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Calmar Ratio
  const calmar = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

  // Win Rate
  const wins = returns.filter(r => r > 0).length;
  const winRate = n > 0 ? wins / n : 0;

  return {
    totalReturn,
    annualizedReturn,
    volatility,
    sharpe,
    sortino,
    maxDrawdown,
    calmar,
    winRate,
    tradingDays: n
  };
}

/**
 * Split data into in-sample and out-of-sample periods
 */
function splitPeriod(data, isRatio) {
  const splitIndex = Math.floor(data.length * isRatio);
  return {
    inSample: data.slice(0, splitIndex),
    outOfSample: data.slice(splitIndex)
  };
}

/**
 * Generate walk-forward periods
 * @param {Array} data - Array of {date, return, ...} objects
 * @param {Object} options - Walk-forward options
 * @returns {Array} Array of period definitions
 */
function generatePeriods(data, options) {
  const {
    mode = 'rolling', // 'rolling' or 'anchored'
    windowSize = 252, // trading days for in-sample
    stepSize = 63, // trading days to step forward
    isRatio = 0.7 // in-sample ratio (used if windowSize not specified)
  } = options;

  const periods = [];
  const n = data.length;

  if (mode === 'anchored') {
    // Anchored walk-forward: IS always starts from beginning
    let oosStart = Math.floor(n * isRatio);
    let periodIndex = 0;

    while (oosStart < n) {
      const oosEnd = Math.min(oosStart + stepSize, n);
      periods.push({
        periodIndex,
        isStart: 0,
        isEnd: oosStart,
        oosStart: oosStart,
        oosEnd: oosEnd
      });
      oosStart = oosEnd;
      periodIndex++;
    }
  } else {
    // Rolling walk-forward
    let windowStart = 0;
    let periodIndex = 0;

    while (windowStart + windowSize < n) {
      const isEnd = windowStart + Math.floor(windowSize * isRatio);
      const oosEnd = Math.min(windowStart + windowSize, n);

      periods.push({
        periodIndex,
        isStart: windowStart,
        isEnd: isEnd,
        oosStart: isEnd,
        oosEnd: oosEnd
      });

      windowStart += stepSize;
      periodIndex++;
    }
  }

  return periods;
}

/**
 * Run walk-forward analysis
 * @param {Object} params - Walk-forward parameters
 * @returns {Object} Walk-forward results
 */
async function runWalkForward(params) {
  const database = await getDatabaseAsync();
  const {
    portfolioId,
    strategyName = 'AI_TRADING',
    startDate,
    endDate,
    mode = 'rolling',
    windowSize = 252,
    stepSize = 63,
    isRatio = 0.7,
    benchmark = 'SPY'
  } = params;

  // Get portfolio returns
  const result = await database.query(`
    SELECT
      snapshot_date as date,
      daily_return_pct as return
    FROM portfolio_snapshots
    WHERE portfolio_id = $1
      AND snapshot_date >= COALESCE($2, '1900-01-01')
      AND snapshot_date <= COALESCE($3, '2100-01-01')
    ORDER BY snapshot_date ASC
  `, [portfolioId, startDate, endDate]);

  const returns = result.rows;

  if (returns.length < windowSize) {
    throw new Error(`Insufficient data: ${returns.length} days, need at least ${windowSize}`);
  }

  // Generate periods
  const periods = generatePeriods(returns, { mode, windowSize, stepSize, isRatio });

  if (periods.length === 0) {
    throw new Error('No valid walk-forward periods generated');
  }

  // Analyze each period
  const periodResults = [];
  let totalOOSReturn = 0;
  let totalOOSDays = 0;

  for (const period of periods) {
    const isData = returns.slice(period.isStart, period.isEnd);
    const oosData = returns.slice(period.oosStart, period.oosEnd);

    const isReturns = isData.map(d => d.return);
    const oosReturns = oosData.map(d => d.return);

    const isMetrics = calculateMetrics(isReturns);
    const oosMetrics = calculateMetrics(oosReturns);

    // Walk-forward efficiency = OOS Sharpe / IS Sharpe
    const wfEfficiency = isMetrics.sharpe > 0 ? oosMetrics.sharpe / isMetrics.sharpe : 0;

    const periodResult = {
      periodIndex: period.periodIndex,
      isStartDate: isData[0]?.date,
      isEndDate: isData[isData.length - 1]?.date,
      oosStartDate: oosData[0]?.date,
      oosEndDate: oosData[oosData.length - 1]?.date,
      isDays: isData.length,
      oosDays: oosData.length,
      isMetrics,
      oosMetrics,
      walkForwardEfficiency: wfEfficiency
    };

    periodResults.push(periodResult);

    // Accumulate OOS performance
    totalOOSReturn += oosMetrics.totalReturn;
    totalOOSDays += oosData.length;
  }

  // Calculate aggregate metrics
  const allOOSReturns = [];
  for (const period of periods) {
    const oosData = returns.slice(period.oosStart, period.oosEnd);
    allOOSReturns.push(...oosData.map(d => d.return));
  }

  const aggregateOOSMetrics = calculateMetrics(allOOSReturns);

  // Average walk-forward efficiency
  const avgWFEfficiency = periodResults.reduce((sum, p) => sum + p.walkForwardEfficiency, 0) / periodResults.length;

  // Parameter stability (std dev of IS Sharpe across periods)
  const isSharpes = periodResults.map(p => p.isMetrics.sharpe);
  const avgISSharpe = isSharpes.reduce((a, b) => a + b, 0) / isSharpes.length;
  const sharpeStd = Math.sqrt(
    isSharpes.reduce((acc, s) => acc + Math.pow(s - avgISSharpe, 2), 0) / (isSharpes.length - 1)
  );
  const parameterStability = avgISSharpe > 0 ? 1 - (sharpeStd / Math.abs(avgISSharpe)) : 0;

  // Store results
  const insertResult = await database.query(`
    INSERT INTO backtest_results
    (portfolio_id, strategy_name, run_type, start_date, end_date, parameters, metrics)
    VALUES ($1, $2, 'walk_forward', $3, $4, $5, $6)
    RETURNING id
  `, [
    portfolioId,
    strategyName,
    returns[0]?.date,
    returns[returns.length - 1]?.date,
    JSON.stringify({ mode, windowSize, stepSize, isRatio }),
    JSON.stringify({
      numPeriods: periodResults.length,
      avgWalkForwardEfficiency: avgWFEfficiency,
      parameterStability,
      aggregateOOSMetrics
    })
  ]);

  const backtestId = insertResult.rows[0].id;

  // Store period details
  for (const p of periodResults) {
    await database.query(`
      INSERT INTO walk_forward_results
      (backtest_id, period_index, is_start_date, is_end_date, oos_start_date, oos_end_date,
       is_sharpe, oos_sharpe, is_return, oos_return, is_max_drawdown, oos_max_drawdown,
       optimal_params, walk_forward_efficiency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      backtestId,
      p.periodIndex,
      p.isStartDate,
      p.isEndDate,
      p.oosStartDate,
      p.oosEndDate,
      p.isMetrics.sharpe,
      p.oosMetrics.sharpe,
      p.isMetrics.totalReturn,
      p.oosMetrics.totalReturn,
      p.isMetrics.maxDrawdown,
      p.oosMetrics.maxDrawdown,
      null, // optimal_params - would be set by optimization
      p.walkForwardEfficiency
    ]);
  }

  return {
    backtestId,
    portfolioId,
    strategyName,
    mode,
    numPeriods: periodResults.length,
    periods: periodResults,
    aggregateMetrics: {
      oosTotalReturn: aggregateOOSMetrics.totalReturn,
      oosAnnualizedReturn: aggregateOOSMetrics.annualizedReturn,
      oosSharpe: aggregateOOSMetrics.sharpe,
      oosSortino: aggregateOOSMetrics.sortino,
      oosMaxDrawdown: aggregateOOSMetrics.maxDrawdown,
      oosWinRate: aggregateOOSMetrics.winRate
    },
    walkForwardEfficiency: avgWFEfficiency,
    parameterStability,
    interpretation: interpretWalkForward(avgWFEfficiency, parameterStability)
  };
}

/**
 * Interpret walk-forward results
 */
function interpretWalkForward(efficiency, stability) {
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
    interpretations.push('Low parameter stability: Parameters highly sensitive to time period, consider simpler model');
  }

  return interpretations;
}

/**
 * Run Combinatorial Purged Cross-Validation (CPCV)
 * More sophisticated than simple walk-forward for testing multiple parameter combinations
 */
async function runCPCV(params) {
  const database = await getDatabaseAsync();
  const {
    portfolioId,
    strategyName = 'AI_TRADING',
    startDate,
    endDate,
    nSplits = 5, // number of groups
    nTestGroups = 2, // groups to use for testing in each iteration
    purgeGap = 5 // trading days gap to purge between train/test
  } = params;

  // Get portfolio returns
  const result = await database.query(`
    SELECT snapshot_date as date, daily_return_pct as return
    FROM portfolio_snapshots
    WHERE portfolio_id = $1
      AND snapshot_date >= COALESCE($2, '1900-01-01')
      AND snapshot_date <= COALESCE($3, '2100-01-01')
    ORDER BY snapshot_date ASC
  `, [portfolioId, startDate, endDate]);

  const returns = result.rows;

  const n = returns.length;
  const groupSize = Math.floor(n / nSplits);

  // Create groups
  const groups = [];
  for (let i = 0; i < nSplits; i++) {
    const start = i * groupSize;
    const end = i === nSplits - 1 ? n : (i + 1) * groupSize;
    groups.push({
      index: i,
      start,
      end,
      data: returns.slice(start, end)
    });
  }

  // Generate all combinations of test groups
  const combinations = getCombinations(nSplits, nTestGroups);
  const foldResults = [];

  for (const testIndices of combinations) {
    // Determine train and test groups
    const trainGroups = groups.filter(g => !testIndices.includes(g.index));
    const testGroups = groups.filter(g => testIndices.includes(g.index));

    // Apply purging: remove data points near train/test boundaries
    const trainReturns = [];
    const testReturns = [];

    for (const tg of trainGroups) {
      // Check if adjacent to a test group
      const adjacentToTest = testIndices.some(ti => Math.abs(ti - tg.index) === 1);

      if (adjacentToTest) {
        // Purge edges
        const purgedData = tg.data.slice(purgeGap, tg.data.length - purgeGap);
        trainReturns.push(...purgedData.map(d => d.return));
      } else {
        trainReturns.push(...tg.data.map(d => d.return));
      }
    }

    for (const tg of testGroups) {
      testReturns.push(...tg.data.map(d => d.return));
    }

    const trainMetrics = calculateMetrics(trainReturns);
    const testMetrics = calculateMetrics(testReturns);

    foldResults.push({
      testGroups: testIndices,
      trainDays: trainReturns.length,
      testDays: testReturns.length,
      trainSharpe: trainMetrics.sharpe,
      testSharpe: testMetrics.sharpe,
      trainReturn: trainMetrics.totalReturn,
      testReturn: testMetrics.totalReturn,
      efficiency: trainMetrics.sharpe > 0 ? testMetrics.sharpe / trainMetrics.sharpe : 0
    });
  }

  // Aggregate CPCV results
  const avgTestSharpe = foldResults.reduce((sum, f) => sum + f.testSharpe, 0) / foldResults.length;
  const avgEfficiency = foldResults.reduce((sum, f) => sum + f.efficiency, 0) / foldResults.length;

  // Standard error of test Sharpe
  const testSharpes = foldResults.map(f => f.testSharpe);
  const sharpeStd = Math.sqrt(
    testSharpes.reduce((acc, s) => acc + Math.pow(s - avgTestSharpe, 2), 0) / (testSharpes.length - 1)
  );
  const sharpeSE = sharpeStd / Math.sqrt(foldResults.length);

  return {
    portfolioId,
    strategyName,
    method: 'CPCV',
    nSplits,
    nTestGroups,
    purgeGap,
    numFolds: foldResults.length,
    folds: foldResults,
    aggregateMetrics: {
      avgTestSharpe,
      testSharpeSE: sharpeSE,
      sharpe95CI: [avgTestSharpe - 1.96 * sharpeSE, avgTestSharpe + 1.96 * sharpeSE],
      avgEfficiency
    },
    robustness: avgTestSharpe > 0 && avgTestSharpe - 1.96 * sharpeSE > 0
      ? 'ROBUST' : 'NOT_ROBUST'
  };
}

/**
 * Generate combinations for CPCV
 */
function getCombinations(n, k) {
  const result = [];

  function combine(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return result;
}

/**
 * Get walk-forward results for a backtest
 */
async function getWalkForwardResults(backtestId) {
  const database = await getDatabaseAsync();

  const backtestResult = await database.query(`
    SELECT * FROM backtest_results WHERE id = $1
  `, [backtestId]);

  const backtest = backtestResult.rows[0];

  if (!backtest || backtest.run_type !== 'walk_forward') {
    return null;
  }

  const periodsResult = await database.query(`
    SELECT * FROM walk_forward_results WHERE backtest_id = $1 ORDER BY period_index
  `, [backtestId]);

  const periods = periodsResult.rows;

  return {
    ...backtest,
    parameters: JSON.parse(backtest.parameters || '{}'),
    metrics: JSON.parse(backtest.metrics || '{}'),
    periods
  };
}

/**
 * List walk-forward backtests for a portfolio
 */
async function listWalkForwardBacktests(portfolioId, limit = 10) {
  const database = await getDatabaseAsync();

  const result = await database.query(`
    SELECT id, strategy_name, start_date, end_date, parameters, metrics, created_at
    FROM backtest_results
    WHERE portfolio_id = $1 AND run_type = 'walk_forward'
    ORDER BY created_at DESC
    LIMIT $2
  `, [portfolioId, limit]);

  return result.rows.map(row => ({
    ...row,
    parameters: JSON.parse(row.parameters || '{}'),
    metrics: JSON.parse(row.metrics || '{}')
  }));
}

module.exports = {
  runWalkForward,
  runCPCV,
  calculateMetrics,
  generatePeriods,
  getWalkForwardResults,
  listWalkForwardBacktests
};
