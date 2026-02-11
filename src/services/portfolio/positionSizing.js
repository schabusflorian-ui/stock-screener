// src/services/portfolio/positionSizing.js
// Position Sizing Calculator (Agent 2)

const { getDatabaseAsync } = require('../../database');

const TRADING_DAYS_PER_YEAR = 252;

class PositionSizing {
  // No constructor needed

  // ============================================
  // Calculate Position Size
  // ============================================
  calculate(method, params) {
    switch (method) {
      case 'fixed_risk':
        return this._fixedRisk(params);
      case 'kelly':
        return this._kellyCriterion(params);
      case 'equal_weight':
        return this._equalWeight(params);
      case 'volatility_based':
        // This one is async, so return the promise
        return this._volatilityBased(params);
      case 'percent_of_portfolio':
        return this._percentOfPortfolio(params);
      default:
        throw new Error(`Unknown position sizing method: ${method}`);
    }
  }

  // ============================================
  // Fixed Risk Method
  // Risk a fixed percentage of portfolio per trade
  // ============================================
  _fixedRisk(params) {
    const {
      portfolioValue,
      maxRiskPct = 2, // Default 2% risk per trade
      entryPrice,
      stopLossPrice
    } = params;

    if (!portfolioValue || !entryPrice || !stopLossPrice) {
      throw new Error('portfolioValue, entryPrice, and stopLossPrice are required');
    }

    const riskPerShare = Math.abs(entryPrice - stopLossPrice);
    if (riskPerShare === 0) {
      throw new Error('Entry price and stop loss price cannot be the same');
    }

    const riskAmount = portfolioValue * (maxRiskPct / 100);
    const shares = Math.floor(riskAmount / riskPerShare);
    const positionValue = shares * entryPrice;
    const positionPct = (positionValue / portfolioValue) * 100;
    const maxLoss = shares * riskPerShare;

    return {
      method: 'fixed_risk',
      shares,
      positionValue,
      positionPct,
      maxLoss,
      maxLossPct: maxRiskPct,
      riskRewardRatio: null, // Requires take profit target
      params: {
        portfolioValue,
        maxRiskPct,
        entryPrice,
        stopLossPrice,
        riskPerShare
      }
    };
  }

  // ============================================
  // Kelly Criterion
  // Optimal fraction based on win rate and payoff
  // ============================================
  _kellyCriterion(params) {
    const {
      portfolioValue,
      winRate, // Probability of winning (0-1)
      avgWin, // Average win amount or ratio
      avgLoss, // Average loss amount or ratio
      kellyFraction = 0.5, // Half-Kelly for safety
      entryPrice,
      maxPositionPct = 25 // Cap position size
    } = params;

    if (!portfolioValue || winRate === undefined || !avgWin || !avgLoss) {
      throw new Error('portfolioValue, winRate, avgWin, and avgLoss are required');
    }

    // Kelly formula: f* = (bp - q) / b
    // where b = avgWin/avgLoss, p = win probability, q = 1-p
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - p;

    let kellyPct = (b * p - q) / b;

    // Apply fraction (e.g., half-Kelly)
    kellyPct *= kellyFraction;

    // Cap at maximum
    kellyPct = Math.min(kellyPct, maxPositionPct / 100);

    // Don't bet if Kelly is negative
    if (kellyPct <= 0) {
      return {
        method: 'kelly',
        shares: 0,
        positionValue: 0,
        positionPct: 0,
        kellyPct: kellyPct * 100,
        recommendation: 'Do not take this trade - negative expected value',
        params: { portfolioValue, winRate, avgWin, avgLoss, kellyFraction }
      };
    }

    const positionValue = portfolioValue * kellyPct;
    let shares = 0;

    if (entryPrice) {
      shares = Math.floor(positionValue / entryPrice);
    }

    return {
      method: 'kelly',
      shares,
      positionValue,
      positionPct: kellyPct * 100,
      kellyPct: kellyPct * 100,
      fullKellyPct: (kellyPct / kellyFraction) * 100,
      expectedValue: (p * avgWin) - (q * avgLoss),
      params: {
        portfolioValue,
        winRate,
        avgWin,
        avgLoss,
        kellyFraction,
        entryPrice
      }
    };
  }

  // ============================================
  // Equal Weight
  // Divide portfolio equally among N positions
  // ============================================
  _equalWeight(params) {
    const {
      portfolioValue,
      numberOfPositions,
      entryPrice,
      cashReserve = 0 // Percentage to keep in cash
    } = params;

    if (!portfolioValue || !numberOfPositions) {
      throw new Error('portfolioValue and numberOfPositions are required');
    }

    const investableAmount = portfolioValue * (1 - cashReserve / 100);
    const positionValue = investableAmount / numberOfPositions;
    const positionPct = (positionValue / portfolioValue) * 100;

    let shares = 0;
    if (entryPrice) {
      shares = Math.floor(positionValue / entryPrice);
    }

    return {
      method: 'equal_weight',
      shares,
      positionValue,
      positionPct,
      numberOfPositions,
      investableAmount,
      cashReserveAmount: portfolioValue - investableAmount,
      cashReservePct: cashReserve,
      params: {
        portfolioValue,
        numberOfPositions,
        entryPrice,
        cashReserve
      }
    };
  }

  // ============================================
  // Volatility-Based Sizing
  // Size inversely proportional to volatility
  // ============================================
  async _volatilityBased(params) {
    const database = await getDatabaseAsync();
    const {
      portfolioValue,
      symbol,
      targetVolatility = 15, // Target portfolio volatility %
      maxPositionPct = 25, // Max position size as % of portfolio (diversification limit)
      lookbackDays = 30,
      entryPrice
    } = params;

    if (!portfolioValue || !symbol) {
      throw new Error('portfolioValue and symbol are required');
    }

    // Get stock volatility
    const companyResult = await database.query(`
      SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);
    const company = companyResult.rows[0];

    if (!company) {
      throw new Error(`Symbol ${symbol} not found`);
    }

    // Check price_metrics for pre-calculated volatility
    let stockVolatility = null;

    const metricsResult = await database.query(`
      SELECT volatility_30d FROM price_metrics WHERE company_id = $1
    `, [company.id]);
    const metrics = metricsResult.rows[0];

    if (metrics?.volatility_30d) {
      // price_metrics stores DAILY volatility as percentage (e.g., 1.6%)
      // Need to annualize: daily_vol * sqrt(252)
      stockVolatility = metrics.volatility_30d * Math.sqrt(TRADING_DAYS_PER_YEAR);
    } else {
      // Calculate from daily prices
      const pricesResult = await database.query(`
        SELECT close FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT $2
      `, [company.id, lookbackDays + 1]);
      const prices = pricesResult.rows;

      if (prices.length < 2) {
        throw new Error(`Insufficient price data for ${symbol}`);
      }

      const returns = [];
      for (let i = 0; i < prices.length - 1; i++) {
        returns.push((prices[i].close - prices[i + 1].close) / prices[i + 1].close);
      }

      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
      stockVolatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
    }

    // Position size = (Target Vol / Stock Vol) * Portfolio Value
    // Cap at maxPositionPct for diversification (default 25%)
    const rawWeightPct = targetVolatility / stockVolatility;
    const weightPct = Math.min(rawWeightPct, maxPositionPct / 100);
    const positionValue = portfolioValue * weightPct;
    const positionPct = weightPct * 100;

    let shares = 0;
    let currentPrice = entryPrice;

    if (!currentPrice) {
      const priceResult = await database.query(`
        SELECT last_price FROM price_metrics WHERE company_id = $1
      `, [company.id]);
      currentPrice = priceResult.rows[0]?.last_price;
    }

    if (currentPrice) {
      shares = Math.floor(positionValue / currentPrice);
    }

    return {
      method: 'volatility_based',
      shares,
      positionValue,
      positionPct,
      stockVolatility: Math.round(stockVolatility * 100) / 100, // Round for display
      targetVolatility,
      currentPrice,
      uncappedPct: Math.round(rawWeightPct * 10000) / 100, // What % would be without cap
      wasCapped: rawWeightPct > maxPositionPct / 100,
      params: {
        portfolioValue,
        symbol,
        targetVolatility,
        maxPositionPct,
        lookbackDays
      }
    };
  }

  // ============================================
  // Percent of Portfolio
  // Simple percentage-based sizing
  // ============================================
  _percentOfPortfolio(params) {
    const {
      portfolioValue,
      targetPct,
      entryPrice
    } = params;

    if (!portfolioValue || !targetPct) {
      throw new Error('portfolioValue and targetPct are required');
    }

    const positionValue = portfolioValue * (targetPct / 100);

    let shares = 0;
    if (entryPrice) {
      shares = Math.floor(positionValue / entryPrice);
    }

    return {
      method: 'percent_of_portfolio',
      shares,
      positionValue,
      positionPct: targetPct,
      params: {
        portfolioValue,
        targetPct,
        entryPrice
      }
    };
  }

  // ============================================
  // Risk/Reward Analysis
  // ============================================
  analyzeRiskReward(params) {
    const {
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      shares = 1,
      winRate = null // Optional historical win rate
    } = params;

    if (!entryPrice || !stopLossPrice || !takeProfitPrice) {
      throw new Error('entryPrice, stopLossPrice, and takeProfitPrice are required');
    }

    const riskPerShare = Math.abs(entryPrice - stopLossPrice);
    const rewardPerShare = Math.abs(takeProfitPrice - entryPrice);
    const riskRewardRatio = rewardPerShare / riskPerShare;

    const totalRisk = riskPerShare * shares;
    const totalReward = rewardPerShare * shares;
    const positionValue = entryPrice * shares;

    // Calculate breakeven win rate for this R:R
    const breakevenWinRate = 1 / (1 + riskRewardRatio);

    let expectedValue = null;
    let recommendation = null;

    if (winRate !== null) {
      expectedValue = (winRate * rewardPerShare) - ((1 - winRate) * riskPerShare);

      if (winRate > breakevenWinRate) {
        recommendation = 'Positive expected value - trade may be favorable';
      } else {
        recommendation = 'Negative expected value - consider passing';
      }
    }

    return {
      entryPrice,
      stopLossPrice,
      takeProfitPrice,
      shares,
      positionValue,
      riskPerShare,
      rewardPerShare,
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
      totalRisk,
      totalReward,
      riskPct: (totalRisk / positionValue) * 100,
      rewardPct: (totalReward / positionValue) * 100,
      breakevenWinRate: breakevenWinRate * 100,
      winRate: winRate !== null ? winRate * 100 : null,
      expectedValue,
      recommendation
    };
  }

  // ============================================
  // Optimal Positions Calculator
  // How many positions given max risk per position
  // ============================================
  calculateOptimalPositions(params) {
    const {
      portfolioValue,
      maxRiskPerPosition = 2, // Max % risk per position
      avgStopLossPct = 5, // Average stop loss distance
      targetInvested = 90 // Target % of portfolio invested
    } = params;

    // Each position risks maxRiskPerPosition% of portfolio
    // With avgStopLossPct stop loss, position size = risk% / stop%
    const positionSizePct = (maxRiskPerPosition / avgStopLossPct) * 100;

    // Number of positions to reach target invested %
    const optimalPositions = Math.round(targetInvested / positionSizePct);
    const actualInvested = optimalPositions * positionSizePct;
    const totalRisk = optimalPositions * maxRiskPerPosition;

    return {
      optimalPositions,
      positionSizePct,
      actualInvestedPct: actualInvested,
      cashReservePct: 100 - actualInvested,
      totalRiskPct: totalRisk,
      maxConcurrentLosses: Math.floor(100 / totalRisk),
      params: {
        portfolioValue,
        maxRiskPerPosition,
        avgStopLossPct,
        targetInvested
      }
    };
  }
}

// Export singleton instance
module.exports = new PositionSizing();
