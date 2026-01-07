// src/services/backtesting/regimeAnalysis.js
// Regime-Conditional Performance Analysis
// Analyzes strategy performance across different market regimes

const { db } = require('../../database');
const { calculateMetrics } = require('./walkForwardEngine');

/**
 * Market regime definitions
 */
const REGIMES = {
  BULL: {
    description: 'Sustained uptrend with low volatility',
    characteristics: ['Positive returns', 'Low VIX', 'Expanding multiples']
  },
  BEAR: {
    description: 'Sustained downtrend with elevated volatility',
    characteristics: ['Negative returns', 'High VIX', 'Contracting multiples']
  },
  SIDEWAYS: {
    description: 'Range-bound market with moderate volatility',
    characteristics: ['Flat returns', 'Normal VIX', 'Stable multiples']
  },
  HIGH_VOL: {
    description: 'Elevated volatility regardless of direction',
    characteristics: ['Variable returns', 'Very high VIX', 'Wide swings']
  },
  CRISIS: {
    description: 'Extreme stress and correlation breakdown',
    characteristics: ['Sharp negative returns', 'Extreme VIX', 'Liquidity issues']
  }
};

/**
 * Analyze portfolio performance by market regime
 */
async function analyzeByRegime(params) {
  const {
    portfolioId,
    startDate,
    endDate
  } = params;

  // Get portfolio returns
  const portfolioReturns = db.prepare(`
    SELECT snapshot_date as date, daily_return_pct as daily_return
    FROM portfolio_snapshots
    WHERE portfolio_id = ?
      AND snapshot_date >= COALESCE(?, '1900-01-01')
      AND snapshot_date <= COALESCE(?, '2100-01-01')
    ORDER BY snapshot_date ASC
  `).all(portfolioId, startDate, endDate);

  if (portfolioReturns.length === 0) {
    throw new Error('No portfolio data available');
  }

  // Get market regime history
  const regimes = db.prepare(`
    SELECT date, regime, vix, trend_strength, confidence as regime_confidence
    FROM market_regimes
    WHERE date >= COALESCE(?, '1900-01-01')
      AND date <= COALESCE(?, '2100-01-01')
    ORDER BY date ASC
  `).all(startDate, endDate);

  // Create regime lookup
  const regimeMap = new Map();
  for (const r of regimes) {
    regimeMap.set(r.date, r.regime);
  }

  // If no regime data, estimate from returns
  if (regimes.length === 0) {
    await estimateRegimes(portfolioReturns, regimeMap);
  }

  // Group returns by regime
  const returnsByRegime = {
    BULL: [],
    BEAR: [],
    SIDEWAYS: [],
    HIGH_VOL: [],
    CRISIS: [],
    UNKNOWN: []
  };

  for (const pr of portfolioReturns) {
    const regime = regimeMap.get(pr.date) || 'UNKNOWN';
    if (returnsByRegime[regime]) {
      returnsByRegime[regime].push(pr.daily_return);
    } else {
      returnsByRegime.UNKNOWN.push(pr.daily_return);
    }
  }

  // Calculate metrics for each regime
  const regimeResults = {};

  for (const [regime, returns] of Object.entries(returnsByRegime)) {
    if (returns.length < 5) {
      regimeResults[regime] = {
        regime,
        tradingDays: returns.length,
        metrics: null,
        note: 'Insufficient data'
      };
      continue;
    }

    const metrics = calculateMetrics(returns);

    // Additional regime-specific metrics
    const wins = returns.filter(r => r > 0).length;
    const losses = returns.filter(r => r < 0).length;
    const avgWin = wins > 0 ? returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / losses) : 0;
    const profitFactor = avgLoss > 0 ? (avgWin * wins) / (avgLoss * losses) : Infinity;

    regimeResults[regime] = {
      regime,
      description: REGIMES[regime]?.description || 'Unknown',
      tradingDays: returns.length,
      percentOfTotal: ((returns.length / portfolioReturns.length) * 100).toFixed(1) + '%',
      metrics: {
        ...metrics,
        winRate: (wins / returns.length * 100).toFixed(1) + '%',
        avgWin: (avgWin * 100).toFixed(3) + '%',
        avgLoss: (avgLoss * 100).toFixed(3) + '%',
        profitFactor: profitFactor.toFixed(2)
      }
    };

    // Store in database
    db.prepare(`
      INSERT INTO regime_performance
      (portfolio_id, regime, start_date, end_date, trading_days,
       total_return, annualized_return, volatility, sharpe_ratio, sortino_ratio,
       max_drawdown, win_rate, avg_win, avg_loss, profit_factor, calmar_ratio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      portfolioId,
      regime,
      startDate || portfolioReturns[0]?.date,
      endDate || portfolioReturns[portfolioReturns.length - 1]?.date,
      returns.length,
      metrics.totalReturn,
      metrics.annualizedReturn,
      metrics.volatility,
      metrics.sharpe,
      metrics.sortino,
      metrics.maxDrawdown,
      wins / returns.length,
      avgWin,
      avgLoss,
      profitFactor,
      metrics.calmar
    );
  }

  // Calculate regime transition analysis
  const transitions = analyzeRegimeTransitionsInternal(portfolioReturns, regimeMap);

  return {
    portfolioId,
    period: {
      start: portfolioReturns[0]?.date,
      end: portfolioReturns[portfolioReturns.length - 1]?.date,
      totalDays: portfolioReturns.length
    },
    regimeBreakdown: regimeResults,
    transitions,
    bestRegime: findBestRegime(regimeResults),
    worstRegime: findWorstRegime(regimeResults),
    interpretation: generateRegimeInterpretation(regimeResults)
  };
}

/**
 * Estimate market regimes from returns if no regime data available
 */
async function estimateRegimes(returns, regimeMap) {
  const windowSize = 21; // 1 month rolling window

  for (let i = windowSize; i < returns.length; i++) {
    const windowReturns = returns.slice(i - windowSize, i).map(r => r.daily_return);

    const mean = windowReturns.reduce((a, b) => a + b, 0) / windowSize;
    const variance = windowReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / windowSize;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);
    const cumReturn = windowReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;
    const annualizedReturn = Math.pow(1 + cumReturn, 252 / windowSize) - 1;

    let regime;

    if (volatility > 0.40) {
      regime = cumReturn < -0.10 ? 'CRISIS' : 'HIGH_VOL';
    } else if (annualizedReturn > 0.15 && volatility < 0.20) {
      regime = 'BULL';
    } else if (annualizedReturn < -0.10) {
      regime = 'BEAR';
    } else {
      regime = 'SIDEWAYS';
    }

    regimeMap.set(returns[i].date, regime);
  }
}

/**
 * Analyze regime transitions
 */
function analyzeRegimeTransitionsInternal(returns, regimeMap) {
  const transitions = [];
  let prevRegime = null;
  let transitionReturns = {
    before: [],
    after: []
  };

  const lookback = 5; // Days before/after transition

  for (let i = 0; i < returns.length; i++) {
    const currentRegime = regimeMap.get(returns[i].date);

    if (prevRegime && currentRegime && prevRegime !== currentRegime) {
      // Found a transition
      const beforeReturns = returns.slice(Math.max(0, i - lookback), i).map(r => r.daily_return);
      const afterReturns = returns.slice(i, Math.min(returns.length, i + lookback)).map(r => r.daily_return);

      transitions.push({
        date: returns[i].date,
        from: prevRegime,
        to: currentRegime,
        returnBefore: beforeReturns.reduce((a, b) => a + b, 0) * 100,
        returnAfter: afterReturns.reduce((a, b) => a + b, 0) * 100
      });
    }

    prevRegime = currentRegime;
  }

  // Summarize transition performance
  const transitionSummary = {};

  for (const t of transitions) {
    const key = `${t.from}_to_${t.to}`;
    if (!transitionSummary[key]) {
      transitionSummary[key] = {
        count: 0,
        avgReturnBefore: 0,
        avgReturnAfter: 0
      };
    }
    transitionSummary[key].count++;
    transitionSummary[key].avgReturnBefore += t.returnBefore;
    transitionSummary[key].avgReturnAfter += t.returnAfter;
  }

  for (const key in transitionSummary) {
    transitionSummary[key].avgReturnBefore = (transitionSummary[key].avgReturnBefore / transitionSummary[key].count).toFixed(2) + '%';
    transitionSummary[key].avgReturnAfter = (transitionSummary[key].avgReturnAfter / transitionSummary[key].count).toFixed(2) + '%';
  }

  return {
    totalTransitions: transitions.length,
    recentTransitions: transitions.slice(-10),
    summary: transitionSummary
  };
}

/**
 * Analyze how signals perform in different regimes
 */
async function analyzeSignalsByRegime(params) {
  const {
    signalTypes = ['technical', 'fundamental', 'sentiment', 'insider'],
    startDate,
    endDate
  } = params;

  // Get regime history
  const regimes = db.prepare(`
    SELECT date, regime
    FROM market_regimes
    WHERE date >= COALESCE(?, '1900-01-01')
      AND date <= COALESCE(?, '2100-01-01')
    ORDER BY date ASC
  `).all(startDate, endDate);

  const regimeMap = new Map(regimes.map(r => [r.date, r.regime]));

  const results = {};

  for (const signalType of signalTypes) {
    // Get IC history for this signal type
    const icHistory = db.prepare(`
      SELECT regime, AVG(ic_value) as avg_ic, AVG(t_stat) as avg_t,
             COUNT(*) as sample_count
      FROM signal_ic_history
      WHERE signal_type = ?
        AND calculated_date >= COALESCE(?, '1900-01-01')
        AND calculated_date <= COALESCE(?, '2100-01-01')
      GROUP BY regime
    `).all(signalType, startDate, endDate);

    results[signalType] = {};

    for (const row of icHistory) {
      results[signalType][row.regime] = {
        avgIC: row.avg_ic?.toFixed(4) || 'N/A',
        avgTStat: row.avg_t?.toFixed(2) || 'N/A',
        sampleCount: row.sample_count,
        significant: Math.abs(row.avg_t || 0) > 2
      };
    }
  }

  // Generate recommendations
  const recommendations = generateSignalRecommendations(results);

  return {
    signalPerformanceByRegime: results,
    recommendations,
    optimalSignalWeights: calculateOptimalWeights(results)
  };
}

/**
 * Calculate optimal signal weights by regime
 */
function calculateOptimalWeights(signalResults) {
  const weights = {};

  for (const regime of Object.keys(REGIMES)) {
    weights[regime] = {};

    let totalIC = 0;
    const signalICs = {};

    for (const [signal, regimeData] of Object.entries(signalResults)) {
      const ic = parseFloat(regimeData[regime]?.avgIC) || 0;
      if (ic > 0) {
        signalICs[signal] = ic;
        totalIC += ic;
      }
    }

    // Normalize weights
    for (const [signal, ic] of Object.entries(signalICs)) {
      weights[regime][signal] = totalIC > 0 ? (ic / totalIC).toFixed(3) : 0;
    }
  }

  return weights;
}

/**
 * Generate signal recommendations based on regime analysis
 */
function generateSignalRecommendations(results) {
  const recommendations = [];

  for (const [signal, regimeData] of Object.entries(results)) {
    const bullIC = parseFloat(regimeData.BULL?.avgIC) || 0;
    const bearIC = parseFloat(regimeData.BEAR?.avgIC) || 0;
    const crisisIC = parseFloat(regimeData.CRISIS?.avgIC) || 0;

    if (bullIC > 0.03 && bearIC < 0.01) {
      recommendations.push(`${signal}: Strong in bull markets, weak in bear - consider reducing weight in defensive regimes`);
    }

    if (bearIC > bullIC) {
      recommendations.push(`${signal}: Performs better in bear markets - increase weight during downturns`);
    }

    if (crisisIC < -0.02) {
      recommendations.push(`${signal}: Negative IC during crises - consider inverting or ignoring during extreme stress`);
    }
  }

  return recommendations;
}

/**
 * Find best performing regime
 */
function findBestRegime(regimeResults) {
  let best = null;
  let bestSharpe = -Infinity;

  for (const [regime, data] of Object.entries(regimeResults)) {
    if (data.metrics && data.metrics.sharpe > bestSharpe && data.tradingDays >= 20) {
      bestSharpe = data.metrics.sharpe;
      best = regime;
    }
  }

  return {
    regime: best,
    sharpe: bestSharpe.toFixed(2),
    interpretation: best ? `Strategy performs best in ${best} markets` : 'Insufficient data'
  };
}

/**
 * Find worst performing regime
 */
function findWorstRegime(regimeResults) {
  let worst = null;
  let worstSharpe = Infinity;

  for (const [regime, data] of Object.entries(regimeResults)) {
    if (data.metrics && data.metrics.sharpe < worstSharpe && data.tradingDays >= 20) {
      worstSharpe = data.metrics.sharpe;
      worst = regime;
    }
  }

  return {
    regime: worst,
    sharpe: worstSharpe.toFixed(2),
    interpretation: worst ? `Strategy struggles in ${worst} markets - consider hedging` : 'Insufficient data'
  };
}

/**
 * Generate interpretation of regime analysis
 */
function generateRegimeInterpretation(regimeResults) {
  const interpretations = [];

  // Check for regime-dependent performance
  const sharpes = [];
  for (const data of Object.values(regimeResults)) {
    if (data.metrics) {
      sharpes.push(data.metrics.sharpe);
    }
  }

  if (sharpes.length > 1) {
    const sharpeRange = Math.max(...sharpes) - Math.min(...sharpes);

    if (sharpeRange > 1.5) {
      interpretations.push('Strategy shows high regime sensitivity - performance varies significantly across market conditions');
    } else if (sharpeRange < 0.5) {
      interpretations.push('Strategy shows consistent performance across regimes - good diversification');
    }
  }

  // Check crisis performance
  if (regimeResults.CRISIS?.metrics) {
    if (regimeResults.CRISIS.metrics.sharpe < -0.5) {
      interpretations.push('Strategy underperforms significantly in crisis periods - consider tail risk hedges');
    } else if (regimeResults.CRISIS.metrics.sharpe > 0) {
      interpretations.push('Strategy shows positive returns during crises - good defensive characteristics');
    }
  }

  return interpretations;
}

/**
 * Get regime performance history
 */
function getRegimePerformanceHistory(portfolioId, limit = 10) {
  return db.prepare(`
    SELECT *
    FROM regime_performance
    WHERE portfolio_id = ?
    ORDER BY calculated_at DESC
    LIMIT ?
  `).all(portfolioId, limit);
}

/**
 * Get current market regime
 */
function getCurrentRegime() {
  const latest = db.prepare(`
    SELECT * FROM market_regimes
    ORDER BY date DESC
    LIMIT 1
  `).get();

  return {
    regime: latest?.regime || 'UNKNOWN',
    date: latest?.date,
    confidence: latest?.regime_confidence,
    vixLevel: latest?.vix_level,
    description: REGIMES[latest?.regime]?.description || 'Unknown market conditions'
  };
}

module.exports = {
  analyzeByRegime,
  analyzeSignalsByRegime,
  getRegimePerformanceHistory,
  getCurrentRegime,
  REGIMES
};
