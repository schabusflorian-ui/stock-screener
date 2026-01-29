// src/services/backtesting/executionSimulator.js
// Execution Simulation for Realistic Backtest Performance
// Models slippage, market impact, and execution costs

const { db } = require('../../database');

/**
 * Market Impact Models
 */
const IMPACT_MODELS = {
  // Linear impact: impact = eta * (order_size / avg_volume)
  LINEAR: 'linear',

  // Square-root impact (Almgren-Chriss): impact = sigma * sqrt(order_size / avg_volume)
  SQUARE_ROOT: 'square_root',

  // Power law: impact = sigma * (order_size / avg_volume)^gamma
  POWER_LAW: 'power_law',

  // Kyle's Lambda: permanent impact proportional to order flow
  KYLE: 'kyle'
};

/**
 * Calculate market impact using square-root model (Almgren-Chriss)
 * This is the industry standard for estimating execution costs
 *
 * @param {number} orderSize - Order size in shares
 * @param {number} avgVolume - Average daily volume
 * @param {number} volatility - Daily volatility (decimal)
 * @param {number} price - Current price
 * @returns {Object} Impact estimates
 */
function squareRootImpact(orderSize, avgVolume, volatility, price) {
  if (avgVolume <= 0 || orderSize <= 0) {
    return { temporary: 0, permanent: 0, total: 0, bps: 0 };
  }

  const participationRate = orderSize / avgVolume;

  // Empirical constants from Almgren-Chriss
  const eta = 0.142; // Temporary impact coefficient
  const gamma = 0.314; // Permanent impact coefficient

  // Temporary impact (mean-reverting)
  const temporaryImpact = eta * volatility * Math.sqrt(participationRate);

  // Permanent impact (information leakage)
  const permanentImpact = gamma * volatility * participationRate;

  const totalImpact = temporaryImpact + permanentImpact;
  const impactBps = totalImpact * 10000;

  return {
    temporary: temporaryImpact,
    permanent: permanentImpact,
    total: totalImpact,
    bps: impactBps,
    dollarImpact: totalImpact * price * orderSize,
    participationRate: (participationRate * 100).toFixed(2) + '%'
  };
}

/**
 * Calculate market impact using linear model
 */
function linearImpact(orderSize, avgVolume, volatility, price) {
  if (avgVolume <= 0 || orderSize <= 0) {
    return { temporary: 0, permanent: 0, total: 0, bps: 0 };
  }

  const participationRate = orderSize / avgVolume;

  // Linear impact: simpler but less accurate for large orders
  const eta = 0.1; // Impact coefficient

  const totalImpact = eta * volatility * participationRate;
  const impactBps = totalImpact * 10000;

  return {
    temporary: totalImpact * 0.7, // 70% temporary
    permanent: totalImpact * 0.3, // 30% permanent
    total: totalImpact,
    bps: impactBps,
    dollarImpact: totalImpact * price * orderSize,
    participationRate: (participationRate * 100).toFixed(2) + '%'
  };
}

/**
 * Estimate bid-ask spread cost
 */
function estimateSpreadCost(price, avgVolume, marketCap) {
  // Spread tends to be wider for smaller/less liquid stocks
  // Empirical relationship: spread ~ 0.1% for large caps, up to 1%+ for small caps

  let spreadBps;

  if (marketCap > 100e9) {
    spreadBps = 1 + Math.random() * 2; // 1-3 bps for mega caps
  } else if (marketCap > 10e9) {
    spreadBps = 3 + Math.random() * 5; // 3-8 bps for large caps
  } else if (marketCap > 2e9) {
    spreadBps = 8 + Math.random() * 12; // 8-20 bps for mid caps
  } else if (marketCap > 500e6) {
    spreadBps = 20 + Math.random() * 30; // 20-50 bps for small caps
  } else {
    spreadBps = 50 + Math.random() * 100; // 50-150 bps for micro caps
  }

  // Adjust for volume (low volume = wider spread)
  if (avgVolume < 100000) {
    spreadBps *= 2;
  } else if (avgVolume < 500000) {
    spreadBps *= 1.5;
  }

  return {
    spreadBps,
    halfSpreadBps: spreadBps / 2, // Cost per side
    spreadPercent: (spreadBps / 100).toFixed(3) + '%'
  };
}

/**
 * Simulate order execution
 *
 * @param {Object} order - Order details
 * @param {Object} marketData - Market data for the stock
 * @param {string} model - Impact model to use
 * @returns {Object} Execution results
 */
function simulateExecution(order, marketData, model = 'square_root') {
  const {
    symbol,
    side, // 'buy' or 'sell'
    shares,
    limitPrice = null
  } = order;

  const {
    price,
    avgVolume,
    volatility,
    marketCap = 10e9 // default to mid-cap if unknown
  } = marketData;

  // Calculate market impact
  let impact;
  switch (model) {
    case 'linear':
      impact = linearImpact(shares, avgVolume, volatility, price);
      break;
    case 'square_root':
    default:
      impact = squareRootImpact(shares, avgVolume, volatility, price);
  }

  // Calculate spread cost
  const spread = estimateSpreadCost(price, avgVolume, marketCap);

  // Calculate slippage (timing + microstructure)
  const timingSlippageBps = 2 + Math.random() * 5; // 2-7 bps random slippage

  // Total execution cost
  const totalCostBps = impact.bps + spread.halfSpreadBps + timingSlippageBps;

  // Effective price
  const slippageMultiplier = side === 'buy' ? 1 + totalCostBps / 10000 : 1 - totalCostBps / 10000;
  const effectivePrice = price * slippageMultiplier;

  // Check limit price
  let fillRatio = 1.0;
  let fillShares = shares;

  if (limitPrice) {
    if (side === 'buy' && effectivePrice > limitPrice) {
      // Partial fill or no fill
      fillRatio = Math.max(0, 1 - (effectivePrice - limitPrice) / (effectivePrice * 0.01));
      fillShares = Math.floor(shares * fillRatio);
    } else if (side === 'sell' && effectivePrice < limitPrice) {
      fillRatio = Math.max(0, 1 - (limitPrice - effectivePrice) / (effectivePrice * 0.01));
      fillShares = Math.floor(shares * fillRatio);
    }
  }

  const notional = fillShares * effectivePrice;
  const idealNotional = fillShares * price;
  const implementationShortfall = side === 'buy'
    ? notional - idealNotional
    : idealNotional - notional;

  return {
    order: {
      symbol,
      side,
      requestedShares: shares,
      limitPrice
    },
    execution: {
      filledShares: fillShares,
      fillRatio: (fillRatio * 100).toFixed(1) + '%',
      effectivePrice: effectivePrice.toFixed(4),
      referencePrice: price.toFixed(4)
    },
    costs: {
      marketImpactBps: impact.bps.toFixed(2),
      spreadCostBps: spread.halfSpreadBps.toFixed(2),
      timingSlippageBps: timingSlippageBps.toFixed(2),
      totalCostBps: totalCostBps.toFixed(2),
      totalCostDollars: (totalCostBps / 10000 * notional).toFixed(2)
    },
    analysis: {
      participationRate: impact.participationRate,
      implementationShortfall: implementationShortfall.toFixed(2),
      implementationShortfallBps: (implementationShortfall / idealNotional * 10000).toFixed(2)
    },
    model
  };
}

/**
 * Analyze execution costs for a backtest
 */
async function analyzeExecutionCosts(params) {
  const {
    portfolioId,
    backtestId,
    trades // Array of {symbol, side, shares, price, date}
  } = params;

  if (!trades || trades.length === 0) {
    return { error: 'No trades provided' };
  }

  let totalSlippageBps = 0;
  let totalMarketImpactBps = 0;
  let totalSpreadCostBps = 0;
  let totalNotional = 0;
  let grossReturn = 0;

  const tradeResults = [];

  for (const trade of trades) {
    // Get market data for the trade date
    const marketData = await getMarketDataForTrade(trade.symbol, trade.date);

    if (!marketData) {
      continue;
    }

    const execution = simulateExecution(
      {
        symbol: trade.symbol,
        side: trade.side,
        shares: trade.shares
      },
      marketData
    );

    const tradeNotional = trade.shares * trade.price;
    totalNotional += tradeNotional;

    totalSlippageBps += parseFloat(execution.costs.timingSlippageBps);
    totalMarketImpactBps += parseFloat(execution.costs.marketImpactBps);
    totalSpreadCostBps += parseFloat(execution.costs.spreadCostBps);

    // Track P&L
    if (trade.exitPrice) {
      const grossPnL = trade.side === 'buy'
        ? (trade.exitPrice - trade.price) * trade.shares
        : (trade.price - trade.exitPrice) * trade.shares;
      grossReturn += grossPnL;
    }

    tradeResults.push({
      ...trade,
      execution
    });
  }

  const numTrades = tradeResults.length;
  const avgSlippageBps = numTrades > 0 ? totalSlippageBps / numTrades : 0;
  const avgMarketImpactBps = numTrades > 0 ? totalMarketImpactBps / numTrades : 0;
  const avgSpreadCostBps = numTrades > 0 ? totalSpreadCostBps / numTrades : 0;
  const totalCostBps = avgSlippageBps + avgMarketImpactBps + avgSpreadCostBps;

  // Calculate net return
  const totalCostDollars = totalCostBps / 10000 * totalNotional;
  const netReturn = grossReturn - totalCostDollars;

  // Store results
  if (portfolioId) {
    db.prepare(`
      INSERT INTO execution_analysis
      (portfolio_id, backtest_id, total_trades, avg_slippage_bps, total_slippage_bps,
       avg_market_impact_bps, total_market_impact_bps, avg_spread_cost_bps, total_spread_cost_bps,
       gross_return, net_return, implementation_shortfall)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      portfolioId,
      backtestId || null,
      numTrades,
      avgSlippageBps,
      totalSlippageBps,
      avgMarketImpactBps,
      totalMarketImpactBps,
      avgSpreadCostBps,
      totalSpreadCostBps,
      grossReturn,
      netReturn,
      totalCostDollars
    );
  }

  return {
    summary: {
      totalTrades: numTrades,
      totalNotional: totalNotional.toFixed(2),
      avgSlippageBps: avgSlippageBps.toFixed(2),
      avgMarketImpactBps: avgMarketImpactBps.toFixed(2),
      avgSpreadCostBps: avgSpreadCostBps.toFixed(2),
      totalCostBps: totalCostBps.toFixed(2),
      totalCostDollars: totalCostDollars.toFixed(2)
    },
    performance: {
      grossReturn: grossReturn.toFixed(2),
      netReturn: netReturn.toFixed(2),
      costDrag: (totalCostDollars / Math.abs(grossReturn || 1) * 100).toFixed(2) + '%'
    },
    interpretation: generateExecutionInterpretation(totalCostBps, avgMarketImpactBps),
    trades: tradeResults.slice(0, 100) // Return first 100 for detail
  };
}

/**
 * Get market data for a specific trade
 */
async function getMarketDataForTrade(symbol, date) {
  // Get price and volume
  const priceData = db.prepare(`
    SELECT close as price, volume
    FROM daily_prices
    WHERE symbol = ? AND date <= ?
    ORDER BY date DESC
    LIMIT 1
  `).get(symbol, date);

  if (!priceData) return null;

  // Get average volume (20-day)
  const avgVolumeData = db.prepare(`
    SELECT AVG(volume) as avgVolume
    FROM daily_prices
    WHERE symbol = ? AND date <= ?
    ORDER BY date DESC
    LIMIT 20
  `).get(symbol, date);

  // Get volatility (20-day)
  const returns = db.prepare(`
    SELECT close
    FROM daily_prices
    WHERE symbol = ? AND date <= ?
    ORDER BY date DESC
    LIMIT 21
  `).all(symbol, date);

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

  // Get market cap
  const company = db.prepare(`
    SELECT market_cap FROM companies WHERE symbol = ?
  `).get(symbol);

  return {
    price: priceData.price,
    volume: priceData.volume,
    avgVolume: avgVolumeData?.avgVolume || priceData.volume,
    volatility,
    marketCap: company?.market_cap || 10e9
  };
}

/**
 * Compare VWAP vs TWAP vs Market order execution
 */
function compareExecutionStrategies(order, marketData, tradingHours = 6.5) {
  const { shares } = order;
  const { price, avgVolume, volatility } = marketData;

  // Market order (immediate execution)
  const marketExec = simulateExecution(order, marketData, 'square_root');

  // TWAP (Time-Weighted Average Price) - spread over trading day
  const twapSlices = Math.ceil(tradingHours * 2); // Every 30 minutes
  const sliceSize = shares / twapSlices;
  let twapCost = 0;

  for (let i = 0; i < twapSlices; i++) {
    const sliceExec = simulateExecution(
      { ...order, shares: sliceSize },
      { ...marketData, avgVolume: avgVolume / twapSlices }
    );
    twapCost += parseFloat(sliceExec.costs.totalCostBps) / twapSlices;
  }

  // VWAP (Volume-Weighted Average Price) - follow volume profile
  // Simplified: assume U-shaped volume profile
  const volumeProfile = [0.15, 0.08, 0.07, 0.06, 0.06, 0.06, 0.06, 0.06, 0.07, 0.08, 0.10, 0.15];
  let vwapCost = 0;

  for (let i = 0; i < volumeProfile.length; i++) {
    const sliceShares = shares * volumeProfile[i];
    const sliceVolume = avgVolume * volumeProfile[i];
    const sliceExec = simulateExecution(
      { ...order, shares: sliceShares },
      { ...marketData, avgVolume: sliceVolume }
    );
    vwapCost += parseFloat(sliceExec.costs.totalCostBps) * volumeProfile[i];
  }

  return {
    strategies: {
      market: {
        name: 'Market Order',
        costBps: parseFloat(marketExec.costs.totalCostBps),
        description: 'Immediate execution, highest impact'
      },
      twap: {
        name: 'TWAP',
        costBps: twapCost.toFixed(2),
        description: 'Spread evenly over time, reduces impact'
      },
      vwap: {
        name: 'VWAP',
        costBps: vwapCost.toFixed(2),
        description: 'Follow volume profile, minimize tracking error'
      }
    },
    recommendation: vwapCost < twapCost && vwapCost < parseFloat(marketExec.costs.totalCostBps)
      ? 'VWAP'
      : twapCost < parseFloat(marketExec.costs.totalCostBps)
        ? 'TWAP'
        : 'Market (small order)',
    savingsVsMarket: {
      twap: (parseFloat(marketExec.costs.totalCostBps) - twapCost).toFixed(2) + ' bps',
      vwap: (parseFloat(marketExec.costs.totalCostBps) - vwapCost).toFixed(2) + ' bps'
    }
  };
}

/**
 * Generate execution interpretation
 */
function generateExecutionInterpretation(totalCostBps, marketImpactBps) {
  const interpretations = [];

  if (totalCostBps > 50) {
    interpretations.push('HIGH execution costs - consider reducing trade sizes or using algorithmic execution');
  } else if (totalCostBps > 20) {
    interpretations.push('MODERATE execution costs - TWAP/VWAP algorithms recommended for larger orders');
  } else {
    interpretations.push('LOW execution costs - current execution approach is efficient');
  }

  if (marketImpactBps > 30) {
    interpretations.push('Market impact is significant - trade sizes may be too large relative to liquidity');
  }

  return interpretations;
}

/**
 * Get execution analysis history
 */
function getExecutionHistory(portfolioId, limit = 10) {
  return db.prepare(`
    SELECT *
    FROM execution_analysis
    WHERE portfolio_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(portfolioId, limit);
}

module.exports = {
  simulateExecution,
  squareRootImpact,
  linearImpact,
  estimateSpreadCost,
  analyzeExecutionCosts,
  compareExecutionStrategies,
  getExecutionHistory,
  IMPACT_MODELS
};
