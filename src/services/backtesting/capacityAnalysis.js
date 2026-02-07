// src/services/backtesting/capacityAnalysis.js
// Strategy Capacity Analysis
// Estimates maximum AUM before execution costs significantly degrade returns

const { getDatabaseAsync } = require('../../database');
const { squareRootImpact } = require('./executionSimulator');

/**
 * Estimate strategy capacity
 * Finds the AUM level where slippage equals a target threshold
 *
 * @param {Object} params - Capacity estimation parameters
 * @returns {Object} Capacity analysis results
 */
async function estimateCapacity(params) {
  const {
    portfolioId,
    targetSlippageBps = 25, // Default: 25 bps target slippage
    turnover = null, // Annual turnover (if null, estimate from history)
    returnTarget = null // Expected gross return for break-even analysis
  } = params;

  const database = await getDatabaseAsync();

  // Get portfolio positions and weights
  const positionsResult = await database.query(`
    SELECT c.symbol, c.id as company_id, pp.current_value,
           c.market_cap, COALESCE(lm.avg_volume_30d, 1000000) as avgVolume,
           pp.current_value * 1.0 / (SELECT SUM(current_value) FROM portfolio_positions WHERE portfolio_id = pp.portfolio_id) as weight
    FROM portfolio_positions pp
    JOIN companies c ON pp.company_id = c.id
    LEFT JOIN liquidity_metrics lm ON lm.company_id = c.id
    WHERE pp.portfolio_id = $1
  `, [portfolioId]);

  const positions = positionsResult.rows;

  if (positions.length === 0) {
    throw new Error('Portfolio has no positions');
  }

  // Get portfolio total value
  const portfolioResult = await database.query(`
    SELECT current_value, name FROM portfolios WHERE id = $1
  `, [portfolioId]);

  const portfolio = portfolioResult.rows[0];
  const currentValue = portfolio?.current_value || 0;

  // Estimate turnover if not provided
  let estimatedTurnover = turnover;
  if (!estimatedTurnover) {
    // Count trades in last year
    const tradesResult = await database.query(`
      SELECT COUNT(*) as count, SUM(ABS(total_amount)) as volume
      FROM portfolio_transactions
      WHERE portfolio_id = $1
        AND executed_at >= CURRENT_DATE - INTERVAL '1 year'
    `, [portfolioId]);

    const trades = tradesResult.rows[0];
    estimatedTurnover = trades?.volume && currentValue > 0
      ? trades.volume / currentValue
      : 2.0; // Default: 200% annual turnover
  }

  // Get volatility for each position
  const positionsWithVol = [];

  for (const pos of positions) {
    // Get 20-day volatility
    const returnsResult = await database.query(`
      SELECT close
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 21
    `, [pos.company_id]);

    const returns = returnsResult.rows;
    let volatility = 0.02; // Default 2% daily vol

    if (returns.length >= 2) {
      const dailyReturns = [];
      for (let i = 0; i < returns.length - 1; i++) {
        dailyReturns.push(returns[i].close / returns[i + 1].close - 1);
      }
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / dailyReturns.length;
      volatility = Math.sqrt(variance);
    }

    positionsWithVol.push({
      ...pos,
      volatility,
      avgVolume: pos.avgVolume || 1000000 // Default 1M shares
    });
  }

  // Calculate capacity at different AUM levels
  const aumLevels = [
    currentValue,
    currentValue * 2,
    currentValue * 5,
    currentValue * 10,
    10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 1e9, 2.5e9, 5e9, 10e9
  ].sort((a, b) => a - b);

  const capacityCurve = [];
  let capacityAt10bps = null;
  let capacityAt25bps = null;
  let capacityAt50bps = null;

  for (const aum of aumLevels) {
    const slippage = calculateSlippageAtAUM(positionsWithVol, aum, estimatedTurnover);

    capacityCurve.push({
      aum,
      aumFormatted: formatCurrency(aum),
      slippageBps: slippage.totalSlippageBps.toFixed(2),
      netReturnDrag: (slippage.totalSlippageBps / 100).toFixed(3) + '%'
    });

    if (!capacityAt10bps && slippage.totalSlippageBps >= 10) {
      capacityAt10bps = aum;
    }
    if (!capacityAt25bps && slippage.totalSlippageBps >= 25) {
      capacityAt25bps = aum;
    }
    if (!capacityAt50bps && slippage.totalSlippageBps >= 50) {
      capacityAt50bps = aum;
    }
  }

  // Find estimated capacity at target slippage
  const estimatedCapacity = findCapacityAtTarget(positionsWithVol, estimatedTurnover, targetSlippageBps);

  // Identify capacity constraints (positions with lowest capacity)
  const constraints = identifyConstraints(positionsWithVol, estimatedTurnover);

  // Liquidity score (0-100)
  const liquidityScore = calculateLiquidityScore(positionsWithVol, currentValue);

  // Store results
  await database.query(`
    INSERT INTO capacity_analysis
    (portfolio_id, strategy_name, estimated_capacity, capacity_at_10bps, capacity_at_25bps,
     capacity_at_50bps, avg_daily_turnover, avg_position_size, liquidity_score,
     market_impact_model, impact_curve)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id
  `, [
    portfolioId,
    portfolio?.name || 'Unknown',
    estimatedCapacity,
    capacityAt10bps,
    capacityAt25bps,
    capacityAt50bps,
    estimatedTurnover / 252, // Daily turnover
    currentValue / positions.length,
    liquidityScore,
    'square_root',
    JSON.stringify(capacityCurve)
  ]);

  return {
    portfolioId,
    currentAUM: formatCurrency(currentValue),
    estimatedCapacity: formatCurrency(estimatedCapacity),
    capacityMultiple: (estimatedCapacity / currentValue).toFixed(1) + 'x',
    thresholds: {
      capacityAt10bps: capacityAt10bps ? formatCurrency(capacityAt10bps) : '>$10B',
      capacityAt25bps: capacityAt25bps ? formatCurrency(capacityAt25bps) : '>$10B',
      capacityAt50bps: capacityAt50bps ? formatCurrency(capacityAt50bps) : '>$10B'
    },
    assumptions: {
      annualTurnover: (estimatedTurnover * 100).toFixed(0) + '%',
      targetSlippage: targetSlippageBps + ' bps',
      impactModel: 'Almgren-Chriss Square Root'
    },
    liquidityScore,
    liquidityRating: getLiquidityRating(liquidityScore),
    constraints,
    capacityCurve,
    interpretation: generateCapacityInterpretation(estimatedCapacity, currentValue, liquidityScore)
  };
}

/**
 * Calculate expected slippage at a given AUM level
 */
function calculateSlippageAtAUM(positions, aum, turnover) {
  let totalSlippageBps = 0;
  const positionSlippage = [];

  for (const pos of positions) {
    const positionValue = aum * (pos.weight || 1 / positions.length);
    const dailyTradingValue = positionValue * (turnover / 252);

    // Estimate daily shares traded
    const price = pos.current_value / (pos.weight || 1 / positions.length) * 0.01; // Rough estimate
    const dailySharesTraded = dailyTradingValue / (price || 100);

    // Calculate market impact
    const impact = squareRootImpact(
      dailySharesTraded,
      pos.avgVolume || 1000000,
      pos.volatility || 0.02,
      price || 100
    );

    const weightedSlippage = impact.bps * (pos.weight || 1 / positions.length);
    totalSlippageBps += weightedSlippage;

    positionSlippage.push({
      symbol: pos.symbol,
      slippageBps: impact.bps,
      weightedSlippageBps: weightedSlippage
    });
  }

  return {
    totalSlippageBps,
    positionSlippage
  };
}

/**
 * Find capacity at target slippage using binary search
 */
function findCapacityAtTarget(positions, turnover, targetBps) {
  let low = 0;
  let high = 100e9; // $100B max
  let iterations = 0;

  while (high - low > 1e6 && iterations < 50) { // $1M precision
    const mid = (low + high) / 2;
    const slippage = calculateSlippageAtAUM(positions, mid, turnover);

    if (slippage.totalSlippageBps < targetBps) {
      low = mid;
    } else {
      high = mid;
    }
    iterations++;
  }

  return Math.floor(low);
}

/**
 * Identify capacity constraints
 */
function identifyConstraints(positions, turnover) {
  const constraints = [];

  for (const pos of positions) {
    // Calculate position-level capacity
    const positionCapacity = calculatePositionCapacity(pos, turnover, 25);

    constraints.push({
      symbol: pos.symbol,
      weight: ((pos.weight || 0) * 100).toFixed(1) + '%',
      avgVolume: formatNumber(pos.avgVolume || 0),
      positionCapacity: formatCurrency(positionCapacity),
      constraint: positionCapacity < 100e6 ? 'LOW' : positionCapacity < 500e6 ? 'MODERATE' : 'HIGH'
    });
  }

  // Sort by most constraining
  return constraints.sort((a, b) => {
    const aVal = parseFloat(a.positionCapacity.replace(/[^0-9.]/g, ''));
    const bVal = parseFloat(b.positionCapacity.replace(/[^0-9.]/g, ''));
    return aVal - bVal;
  }).slice(0, 10);
}

/**
 * Calculate capacity for a single position
 */
function calculatePositionCapacity(position, turnover, targetBps) {
  const { avgVolume, volatility, weight } = position;
  const vol = avgVolume || 1000000;
  const sigma = volatility || 0.02;
  const w = weight || 0.05;

  // From Almgren-Chriss: impact = eta * sigma * sqrt(shares / avgVolume)
  // Solving for max position: shares = avgVolume * (targetBps / (eta * sigma * 10000))^2
  const eta = 0.142;
  const maxSharesPerDay = vol * Math.pow(targetBps / (eta * sigma * 10000), 2);

  // Max position value that can be traded daily
  const maxDailyTradingValue = maxSharesPerDay * 100; // Assume $100 avg price

  // Max total position = daily trading value * 252 / turnover / weight
  const maxPositionValue = maxDailyTradingValue * 252 / (turnover * w);

  return Math.min(maxPositionValue / w, 100e9); // Cap at $100B
}

/**
 * Calculate liquidity score (0-100)
 */
function calculateLiquidityScore(positions, portfolioValue) {
  if (positions.length === 0 || portfolioValue <= 0) return 0;

  let score = 100;

  // Penalize for illiquid positions
  for (const pos of positions) {
    const posValue = portfolioValue * (pos.weight || 1 / positions.length);
    const daysToLiquidate = posValue / ((pos.avgVolume || 1000000) * 100 * 0.1); // 10% of volume

    if (daysToLiquidate > 20) {
      score -= 20 * (pos.weight || 1 / positions.length);
    } else if (daysToLiquidate > 10) {
      score -= 10 * (pos.weight || 1 / positions.length);
    } else if (daysToLiquidate > 5) {
      score -= 5 * (pos.weight || 1 / positions.length);
    }
  }

  // Penalize for concentration
  const maxWeight = Math.max(...positions.map(p => p.weight || 1 / positions.length));
  if (maxWeight > 0.20) {
    score -= (maxWeight - 0.20) * 100;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get liquidity rating from score
 */
function getLiquidityRating(score) {
  if (score >= 80) return 'EXCELLENT';
  if (score >= 60) return 'GOOD';
  if (score >= 40) return 'MODERATE';
  if (score >= 20) return 'POOR';
  return 'VERY_POOR';
}

/**
 * Calculate liquidity-adjusted returns
 * Shows how returns degrade as AUM increases
 */
async function calculateLiquidityAdjustedReturns(params) {
  const {
    portfolioId,
    grossReturn, // Expected gross return (annual)
    aumLevels = null
  } = params;

  const database = await getDatabaseAsync();

  const portfolioResult = await database.query(`
    SELECT current_value FROM portfolios WHERE id = $1
  `, [portfolioId]);

  const portfolio = portfolioResult.rows[0];
  const currentValue = portfolio?.current_value || 1e6;

  const levels = aumLevels || [
    currentValue,
    currentValue * 2,
    currentValue * 5,
    currentValue * 10,
    50e6, 100e6, 250e6, 500e6, 1e9
  ].filter((v, i, arr) => arr.indexOf(v) === i).sort((a, b) => a - b);

  // Get positions
  const positionsResult = await database.query(`
    SELECT c.symbol, c.id as company_id, pp.current_value,
           COALESCE(lm.avg_volume_30d, 1000000) as avgVolume,
           pp.current_value * 1.0 / (SELECT SUM(current_value) FROM portfolio_positions WHERE portfolio_id = pp.portfolio_id) as weight
    FROM portfolio_positions pp
    JOIN companies c ON pp.company_id = c.id
    LEFT JOIN liquidity_metrics lm ON lm.company_id = c.id
    WHERE pp.portfolio_id = $1
  `, [portfolioId]);

  const positions = positionsResult.rows;

  // Add volatility estimates
  const positionsWithVol = await addVolatilityToPositions(positions);

  // Estimate turnover
  const turnover = 2.0; // Assume 200% annual

  const results = [];
  const targetGrossReturn = grossReturn || 0.15; // 15% default

  for (const aum of levels) {
    const slippage = calculateSlippageAtAUM(positionsWithVol, aum, turnover);
    const annualSlippageDrag = slippage.totalSlippageBps / 100 * turnover;
    const netReturn = targetGrossReturn - annualSlippageDrag / 100;

    results.push({
      aum: formatCurrency(aum),
      grossReturn: (targetGrossReturn * 100).toFixed(1) + '%',
      slippageDrag: annualSlippageDrag.toFixed(2) + '%',
      netReturn: (netReturn * 100).toFixed(2) + '%',
      returnRetention: ((netReturn / targetGrossReturn) * 100).toFixed(0) + '%'
    });
  }

  // Find break-even AUM (where net return = 0)
  const breakEvenAUM = findBreakEvenAUM(positionsWithVol, turnover, targetGrossReturn);

  return {
    portfolioId,
    grossReturn: (targetGrossReturn * 100).toFixed(1) + '%',
    results,
    breakEvenAUM: formatCurrency(breakEvenAUM),
    optimalAUM: formatCurrency(breakEvenAUM * 0.5), // 50% of break-even for safety
    interpretation: `Strategy can scale to ${formatCurrency(breakEvenAUM * 0.5)} while retaining most of its return`
  };
}

/**
 * Find AUM where returns go to zero
 */
function findBreakEvenAUM(positions, turnover, grossReturn) {
  let low = 0;
  let high = 100e9;
  let iterations = 0;

  while (high - low > 1e6 && iterations < 50) {
    const mid = (low + high) / 2;
    const slippage = calculateSlippageAtAUM(positions, mid, turnover);
    const drag = slippage.totalSlippageBps / 100 * turnover / 100;

    if (drag < grossReturn) {
      low = mid;
    } else {
      high = mid;
    }
    iterations++;
  }

  return Math.floor(low);
}

/**
 * Add volatility estimates to positions
 */
async function addVolatilityToPositions(positions) {
  const database = await getDatabaseAsync();
  const result = [];

  for (const pos of positions) {
    const returnsResult = await database.query(`
      SELECT close FROM daily_prices
      WHERE company_id = $1 ORDER BY date DESC LIMIT 21
    `, [pos.company_id]);

    const returns = returnsResult.rows;
    let volatility = 0.02;
    if (returns.length >= 2) {
      const dailyReturns = [];
      for (let i = 0; i < returns.length - 1; i++) {
        dailyReturns.push(returns[i].close / returns[i + 1].close - 1);
      }
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      volatility = Math.sqrt(dailyReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / dailyReturns.length);
    }

    result.push({ ...pos, volatility });
  }

  return result;
}

/**
 * Format currency for display
 */
function formatCurrency(value) {
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + value.toFixed(0);
}

/**
 * Format number for display
 */
function formatNumber(value) {
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(0) + 'K';
  return value.toFixed(0);
}

/**
 * Generate capacity interpretation
 */
function generateCapacityInterpretation(capacity, currentValue, liquidityScore) {
  const interpretations = [];
  const multiple = capacity / currentValue;

  if (multiple > 100) {
    interpretations.push('Excellent scalability - strategy can handle significant AUM growth');
  } else if (multiple > 10) {
    interpretations.push('Good scalability - room for substantial growth before capacity constraints');
  } else if (multiple > 3) {
    interpretations.push('Moderate scalability - some room for growth, monitor execution costs');
  } else {
    interpretations.push('Limited scalability - near capacity, consider position sizes and liquidity');
  }

  if (liquidityScore < 50) {
    interpretations.push('Liquidity concerns - consider adding more liquid positions or reducing concentration');
  }

  return interpretations;
}

/**
 * Get capacity analysis history
 */
async function getCapacityHistory(portfolioId, limit = 10) {
  const database = await getDatabaseAsync();

  const result = await database.query(`
    SELECT *
    FROM capacity_analysis
    WHERE portfolio_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [portfolioId, limit]);

  return result.rows.map(row => ({
    ...row,
    impact_curve: JSON.parse(row.impact_curve || '[]')
  }));
}

module.exports = {
  estimateCapacity,
  calculateLiquidityAdjustedReturns,
  calculateSlippageAtAUM,
  getCapacityHistory
};
