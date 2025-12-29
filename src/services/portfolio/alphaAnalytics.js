// src/services/portfolio/alphaAnalytics.js
// Advanced Alpha Analytics - Multiple alpha calculation methods

const db = require('../../database');

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.05; // 5% annual

class AlphaAnalytics {
  constructor() {
    this.db = db.getDatabase();
    console.log('Alpha Analytics Engine initialized');
  }

  // ============================================
  // Comprehensive Alpha Analysis
  // Multiple methods + attribution + consistency
  // ============================================
  getComprehensiveAlpha(portfolioId, params = {}) {
    const {
      period = '3y',
      benchmarkSymbol = 'SPY'
    } = params;

    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);

    // Load portfolio and benchmark returns
    const portfolioReturns = this._loadPortfolioReturns(portfolioId, startDate);
    const benchmarkReturns = this._loadBenchmarkReturns(benchmarkSymbol, startDate);

    if (portfolioReturns.length < 60) {
      return { error: 'Insufficient data for alpha analysis (need 60+ days)' };
    }

    // Align returns
    const aligned = this._alignReturns(portfolioReturns, benchmarkReturns);

    // Calculate various alpha measures
    const jensensAlpha = this._calculateJensensAlpha(aligned);
    const multiFactor = this._calculateMultiFactorAlpha(positions, startDate, aligned);
    const rollingAlpha = this._calculateRollingAlpha(aligned);
    const attribution = this._calculateAlphaAttribution(positions, startDate, aligned);
    const skillAnalysis = this._analyzeSkillVsLuck(aligned, rollingAlpha);

    return {
      portfolioId,
      period,
      benchmark: benchmarkSymbol,
      tradingDays: aligned.dates.length,

      // Summary metrics
      summary: {
        jensensAlpha: jensensAlpha.alpha,
        multifactorAlpha: multiFactor.alpha,
        alphaConfidence: skillAnalysis.skillConfidence,
        alphaConsistency: rollingAlpha.consistency,
        informationRatio: jensensAlpha.informationRatio,
        alphaRating: this._getAlphaRating(jensensAlpha.alpha, skillAnalysis.skillConfidence)
      },

      // Detailed results
      jensensAlpha,
      multiFactor,
      rollingAlpha,
      attribution,
      skillAnalysis
    };
  }

  // ============================================
  // Jensen's Alpha (CAPM-based)
  // alpha = Rp - [Rf + beta * (Rm - Rf)]
  // ============================================
  _calculateJensensAlpha(aligned) {
    const { portfolioReturns, benchmarkReturns } = aligned;
    const n = portfolioReturns.length;

    if (n < 20) return { error: 'Insufficient data' };

    // Calculate means
    const avgPortfolio = portfolioReturns.reduce((a, b) => a + b, 0) / n;
    const avgBenchmark = benchmarkReturns.reduce((a, b) => a + b, 0) / n;

    // Calculate beta via covariance/variance
    let covariance = 0;
    let benchmarkVariance = 0;
    let portfolioVariance = 0;

    for (let i = 0; i < n; i++) {
      const pDev = portfolioReturns[i] - avgPortfolio;
      const bDev = benchmarkReturns[i] - avgBenchmark;
      covariance += pDev * bDev;
      benchmarkVariance += bDev * bDev;
      portfolioVariance += pDev * pDev;
    }

    covariance /= (n - 1);
    benchmarkVariance /= (n - 1);
    portfolioVariance /= (n - 1);

    const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : 1;

    // Annualize returns
    const annualizedPortfolio = avgPortfolio * TRADING_DAYS_PER_YEAR;
    const annualizedBenchmark = avgBenchmark * TRADING_DAYS_PER_YEAR;

    // Jensen's Alpha
    const expectedReturn = RISK_FREE_RATE + beta * (annualizedBenchmark - RISK_FREE_RATE);
    const alpha = annualizedPortfolio - expectedReturn;

    // Calculate tracking error and information ratio
    const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / n;
    const trackingVariance = excessReturns.reduce((s, r) => s + Math.pow(r - avgExcess, 2), 0) / (n - 1);
    const trackingError = Math.sqrt(trackingVariance * TRADING_DAYS_PER_YEAR);
    const informationRatio = trackingError > 0 ? (annualizedPortfolio - annualizedBenchmark) / trackingError : 0;

    // Statistical significance (t-stat for alpha)
    const alphaStdError = Math.sqrt(portfolioVariance * TRADING_DAYS_PER_YEAR) / Math.sqrt(n);
    const tStat = alphaStdError > 0 ? alpha / alphaStdError : 0;
    const pValue = this._tStatToPValue(Math.abs(tStat), n - 2);
    const isSignificant = pValue < 0.05;

    // Correlation and R-squared
    const correlation = covariance / (Math.sqrt(portfolioVariance) * Math.sqrt(benchmarkVariance)) || 0;
    const rSquared = correlation * correlation;

    return {
      alpha: Math.round(alpha * 10000) / 100, // As percentage
      beta: Math.round(beta * 100) / 100,
      expectedReturn: Math.round(expectedReturn * 10000) / 100,
      actualReturn: Math.round(annualizedPortfolio * 10000) / 100,
      benchmarkReturn: Math.round(annualizedBenchmark * 10000) / 100,
      trackingError: Math.round(trackingError * 10000) / 100,
      informationRatio: Math.round(informationRatio * 100) / 100,
      correlation: Math.round(correlation * 100) / 100,
      rSquared: Math.round(rSquared * 100) / 100,
      tStatistic: Math.round(tStat * 100) / 100,
      pValue: Math.round(pValue * 1000) / 1000,
      isStatisticallySignificant: isSignificant,
      interpretation: this._interpretJensensAlpha(alpha, beta, isSignificant)
    };
  }

  // ============================================
  // Multi-Factor Alpha (Fama-French style)
  // Using Size, Value, Momentum, Quality factors
  // ============================================
  _calculateMultiFactorAlpha(positions, startDate, aligned) {
    const { portfolioReturns, benchmarkReturns, dates } = aligned;
    const n = portfolioReturns.length;

    if (n < 60) return { error: 'Need 60+ days for factor analysis' };

    // Calculate factor returns from position characteristics
    const factorExposures = this._calculateFactorExposures(positions);

    // Simulated factor returns (ideally from actual factor data)
    // Using position characteristics as proxies
    const factorReturns = this._estimateFactorReturns(positions, startDate, dates);

    // Multi-factor regression
    // Rp - Rf = alpha + b1*(Rm-Rf) + b2*SMB + b3*HML + b4*MOM + b5*QMJ + epsilon
    const excessPortfolio = portfolioReturns.map(r => r - RISK_FREE_RATE / TRADING_DAYS_PER_YEAR);
    const excessMarket = benchmarkReturns.map(r => r - RISK_FREE_RATE / TRADING_DAYS_PER_YEAR);

    // Simple OLS for each factor (in practice, use multiple regression)
    const marketBeta = this._calculateSingleFactorBeta(excessPortfolio, excessMarket);

    // Calculate residual returns (what's left after market)
    const residualReturns = excessPortfolio.map((r, i) =>
      r - marketBeta * excessMarket[i]
    );

    // Estimate factor contributions based on exposures
    const avgResidual = residualReturns.reduce((a, b) => a + b, 0) / n;
    const multifactorAlpha = avgResidual * TRADING_DAYS_PER_YEAR;

    // Factor contribution breakdown
    const factorContributions = {
      market: {
        exposure: marketBeta,
        contribution: marketBeta * (benchmarkReturns.reduce((a, b) => a + b, 0) / n * TRADING_DAYS_PER_YEAR) * 100
      },
      size: {
        exposure: factorExposures.sizeTilt,
        estimatedContribution: factorExposures.sizeTilt * 2 // SMB premium ~2%
      },
      value: {
        exposure: factorExposures.valueTilt,
        estimatedContribution: factorExposures.valueTilt * 3 // HML premium ~3%
      },
      momentum: {
        exposure: factorExposures.momentumTilt,
        estimatedContribution: factorExposures.momentumTilt * 4 // MOM premium ~4%
      },
      quality: {
        exposure: factorExposures.qualityTilt,
        estimatedContribution: factorExposures.qualityTilt * 2 // QMJ premium ~2%
      }
    };

    // Adjust alpha for factor exposures
    const factorAdjustedAlpha = multifactorAlpha
      - factorContributions.size.estimatedContribution / 100
      - factorContributions.value.estimatedContribution / 100
      - factorContributions.momentum.estimatedContribution / 100
      - factorContributions.quality.estimatedContribution / 100;

    return {
      alpha: Math.round(multifactorAlpha * 10000) / 100,
      factorAdjustedAlpha: Math.round(factorAdjustedAlpha * 10000) / 100,
      marketBeta: Math.round(marketBeta * 100) / 100,
      factors: factorContributions,
      exposures: factorExposures,
      interpretation: this._interpretMultiFactorAlpha(multifactorAlpha, factorAdjustedAlpha, factorExposures)
    };
  }

  // ============================================
  // Rolling Alpha (Consistency Analysis)
  // ============================================
  _calculateRollingAlpha(aligned, windowDays = 60) {
    const { portfolioReturns, benchmarkReturns, dates } = aligned;
    const n = portfolioReturns.length;

    if (n < windowDays + 20) {
      return { error: 'Insufficient data for rolling analysis' };
    }

    const rollingAlphas = [];
    const rollingBetas = [];

    for (let i = windowDays; i < n; i++) {
      const windowPortfolio = portfolioReturns.slice(i - windowDays, i);
      const windowBenchmark = benchmarkReturns.slice(i - windowDays, i);

      const avgP = windowPortfolio.reduce((a, b) => a + b, 0) / windowDays;
      const avgB = windowBenchmark.reduce((a, b) => a + b, 0) / windowDays;

      let cov = 0, varB = 0;
      for (let j = 0; j < windowDays; j++) {
        cov += (windowPortfolio[j] - avgP) * (windowBenchmark[j] - avgB);
        varB += Math.pow(windowBenchmark[j] - avgB, 2);
      }
      cov /= (windowDays - 1);
      varB /= (windowDays - 1);

      const beta = varB > 0 ? cov / varB : 1;
      const annualizedP = avgP * TRADING_DAYS_PER_YEAR;
      const annualizedB = avgB * TRADING_DAYS_PER_YEAR;
      const expectedReturn = RISK_FREE_RATE + beta * (annualizedB - RISK_FREE_RATE);
      const alpha = annualizedP - expectedReturn;

      rollingAlphas.push({
        date: dates[i],
        alpha: Math.round(alpha * 10000) / 100
      });
      rollingBetas.push(beta);
    }

    // Analyze alpha consistency
    const alphaValues = rollingAlphas.map(r => r.alpha);
    const positiveAlphas = alphaValues.filter(a => a > 0).length;
    const consistency = (positiveAlphas / alphaValues.length) * 100;

    const avgAlpha = alphaValues.reduce((a, b) => a + b, 0) / alphaValues.length;
    const alphaStdDev = Math.sqrt(
      alphaValues.reduce((s, a) => s + Math.pow(a - avgAlpha, 2), 0) / alphaValues.length
    );

    // Trend analysis
    const firstHalf = alphaValues.slice(0, Math.floor(alphaValues.length / 2));
    const secondHalf = alphaValues.slice(Math.floor(alphaValues.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const trend = secondAvg > firstAvg ? 'improving' : secondAvg < firstAvg ? 'declining' : 'stable';

    // Find best/worst periods
    const sortedAlphas = [...rollingAlphas].sort((a, b) => b.alpha - a.alpha);

    return {
      windowDays,
      rollingData: rollingAlphas.slice(-90), // Last 90 data points
      statistics: {
        average: Math.round(avgAlpha * 100) / 100,
        stdDev: Math.round(alphaStdDev * 100) / 100,
        min: Math.round(Math.min(...alphaValues) * 100) / 100,
        max: Math.round(Math.max(...alphaValues) * 100) / 100,
        current: alphaValues[alphaValues.length - 1]
      },
      consistency: Math.round(consistency),
      trend,
      trendMagnitude: Math.round((secondAvg - firstAvg) * 100) / 100,
      bestPeriods: sortedAlphas.slice(0, 3).map(a => ({ date: a.date, alpha: a.alpha })),
      worstPeriods: sortedAlphas.slice(-3).reverse().map(a => ({ date: a.date, alpha: a.alpha })),
      interpretation: this._interpretRollingAlpha(consistency, trend, avgAlpha)
    };
  }

  // ============================================
  // Alpha Attribution (By Position)
  // Which positions contributed alpha?
  // ============================================
  _calculateAlphaAttribution(positions, startDate, aligned) {
    const { portfolioReturns, benchmarkReturns, dates } = aligned;

    // Load individual position returns
    const positionReturns = {};
    for (const pos of positions) {
      positionReturns[pos.symbol] = this._loadPositionReturns(pos.company_id, startDate, dates);
    }

    // Calculate weights
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = {};
    positions.forEach(p => {
      weights[p.symbol] = totalValue > 0 ? (p.value || 0) / totalValue : 1 / positions.length;
    });

    // Calculate attribution for each position
    const attribution = [];
    const n = dates.length;

    for (const pos of positions) {
      const returns = positionReturns[pos.symbol] || [];
      if (returns.length < n * 0.8) continue; // Skip if missing too much data

      // Calculate position's excess return over benchmark
      const alignedPosReturns = dates.map((date, i) => {
        const idx = returns.findIndex(r => r.date === date);
        return idx >= 0 ? returns[idx].return : 0;
      });

      const avgPosReturn = alignedPosReturns.reduce((a, b) => a + b, 0) / n;
      const avgBenchReturn = benchmarkReturns.reduce((a, b) => a + b, 0) / n;

      const positionAlpha = (avgPosReturn - avgBenchReturn) * TRADING_DAYS_PER_YEAR;
      const weightedAlphaContribution = positionAlpha * weights[pos.symbol];

      // Calculate position beta
      const posBeta = this._calculateSingleFactorBeta(alignedPosReturns, benchmarkReturns);

      attribution.push({
        symbol: pos.symbol,
        weight: Math.round(weights[pos.symbol] * 10000) / 100,
        annualizedReturn: Math.round(avgPosReturn * TRADING_DAYS_PER_YEAR * 10000) / 100,
        excessReturn: Math.round(positionAlpha * 10000) / 100,
        alphaContribution: Math.round(weightedAlphaContribution * 10000) / 100,
        beta: Math.round(posBeta * 100) / 100,
        sector: pos.sector || 'Unknown'
      });
    }

    // Sort by alpha contribution
    attribution.sort((a, b) => b.alphaContribution - a.alphaContribution);

    // Sector aggregation
    const sectorAttribution = {};
    for (const attr of attribution) {
      if (!sectorAttribution[attr.sector]) {
        sectorAttribution[attr.sector] = { weight: 0, alphaContribution: 0, positions: 0 };
      }
      sectorAttribution[attr.sector].weight += attr.weight;
      sectorAttribution[attr.sector].alphaContribution += attr.alphaContribution;
      sectorAttribution[attr.sector].positions++;
    }

    const sectors = Object.entries(sectorAttribution)
      .map(([sector, data]) => ({
        sector,
        ...data,
        weight: Math.round(data.weight * 100) / 100,
        alphaContribution: Math.round(data.alphaContribution * 100) / 100
      }))
      .sort((a, b) => b.alphaContribution - a.alphaContribution);

    // Top/bottom contributors
    const topContributors = attribution.filter(a => a.alphaContribution > 0).slice(0, 5);
    const bottomContributors = attribution.filter(a => a.alphaContribution < 0)
      .sort((a, b) => a.alphaContribution - b.alphaContribution)
      .slice(0, 5);

    return {
      positions: attribution,
      sectorAttribution: sectors,
      topContributors,
      bottomContributors,
      concentration: {
        top3AlphaShare: attribution.slice(0, 3)
          .reduce((sum, a) => sum + Math.abs(a.alphaContribution), 0),
        totalAlpha: attribution.reduce((sum, a) => sum + a.alphaContribution, 0)
      }
    };
  }

  // ============================================
  // Skill vs Luck Analysis
  // Is the alpha statistically meaningful?
  // ============================================
  _analyzeSkillVsLuck(aligned, rollingAlpha) {
    const { portfolioReturns, benchmarkReturns } = aligned;
    const n = portfolioReturns.length;

    // Calculate excess returns
    const excessReturns = portfolioReturns.map((r, i) => r - benchmarkReturns[i]);
    const avgExcess = excessReturns.reduce((a, b) => a + b, 0) / n;
    const annualizedExcess = avgExcess * TRADING_DAYS_PER_YEAR;

    // Standard error of excess returns
    const excessVariance = excessReturns.reduce((s, r) => s + Math.pow(r - avgExcess, 2), 0) / (n - 1);
    const stdError = Math.sqrt(excessVariance / n) * Math.sqrt(TRADING_DAYS_PER_YEAR);

    // T-statistic for excess returns
    const tStat = stdError > 0 ? annualizedExcess / stdError : 0;
    const pValue = this._tStatToPValue(Math.abs(tStat), n - 1);

    // Hit rate analysis
    const winningDays = excessReturns.filter(r => r > 0).length;
    const hitRate = (winningDays / n) * 100;

    // Win/loss ratio
    const wins = excessReturns.filter(r => r > 0);
    const losses = excessReturns.filter(r => r < 0);
    const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Consistency metric (from rolling alpha)
    const alphaConsistency = rollingAlpha.consistency || 50;

    // Skill confidence score (0-100)
    // Based on: statistical significance, consistency, hit rate, win/loss ratio
    let skillScore = 0;
    if (pValue < 0.01) skillScore += 30;
    else if (pValue < 0.05) skillScore += 20;
    else if (pValue < 0.10) skillScore += 10;

    skillScore += Math.min(30, (alphaConsistency - 50) * 0.6);
    skillScore += Math.min(20, (hitRate - 50) * 0.4);
    skillScore += Math.min(20, (winLossRatio - 1) * 10);

    skillScore = Math.max(0, Math.min(100, skillScore));

    // Bootstrap analysis for luck probability
    const bootstrapPValue = this._bootstrapSignificance(excessReturns, 1000);

    // Luck probability (inverse of skill)
    const luckProbability = Math.min(95, Math.max(5, 100 - skillScore));

    return {
      skillConfidence: Math.round(skillScore),
      luckProbability: Math.round(luckProbability),
      statisticalTests: {
        tStatistic: Math.round(tStat * 100) / 100,
        pValue: Math.round(pValue * 1000) / 1000,
        bootstrapPValue: Math.round(bootstrapPValue * 1000) / 1000,
        isSignificantAt5Pct: pValue < 0.05,
        isSignificantAt1Pct: pValue < 0.01
      },
      performanceMetrics: {
        hitRate: Math.round(hitRate * 10) / 10,
        winLossRatio: Math.round(winLossRatio * 100) / 100,
        avgWin: Math.round(avgWin * 10000) / 100,
        avgLoss: Math.round(avgLoss * 10000) / 100,
        consistency: alphaConsistency
      },
      interpretation: this._interpretSkillAnalysis(skillScore, pValue, alphaConsistency),
      recommendation: this._getSkillRecommendation(skillScore, annualizedExcess)
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  _getPortfolioPositions(portfolioId) {
    return this.db.prepare(`
      SELECT
        pp.company_id,
        pp.shares,
        pp.cost_basis,
        c.symbol,
        c.name,
        c.sector,
        c.market_cap,
        pm.last_price,
        pm.beta,
        pm.change_1y
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = ?
    `).all(portfolioId).map(pos => ({
      ...pos,
      value: pos.shares * (pos.last_price || 0)
    }));
  }

  _getPeriodDates(period) {
    const now = new Date();
    const periodDays = {
      '6m': 180, '1y': 365, '2y': 730, '3y': 1095, '5y': 1825
    };
    const days = periodDays[period] || 1095;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    };
  }

  _loadPortfolioReturns(portfolioId, startDate) {
    // First try snapshots
    const snapshots = this.db.prepare(`
      SELECT snapshot_date as date, total_value
      FROM portfolio_snapshots
      WHERE portfolio_id = ? AND snapshot_date >= ?
      ORDER BY snapshot_date ASC
    `).all(portfolioId, startDate);

    if (snapshots.length > 60) {
      const returns = [];
      for (let i = 1; i < snapshots.length; i++) {
        if (snapshots[i - 1].total_value > 0) {
          returns.push({
            date: snapshots[i].date,
            return: (snapshots[i].total_value - snapshots[i - 1].total_value) / snapshots[i - 1].total_value
          });
        }
      }
      return returns;
    }

    // Fallback: Calculate synthetic returns from positions' price history
    return this._calculateSyntheticReturns(portfolioId, startDate);
  }

  _calculateSyntheticReturns(portfolioId, startDate) {
    // Get portfolio positions with weights
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) return [];

    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = {};
    positions.forEach(p => {
      weights[p.company_id] = totalValue > 0 ? (p.value || 0) / totalValue : 1 / positions.length;
    });

    // Get all price dates for all positions
    const allPrices = {};
    const allDates = new Set();

    for (const pos of positions) {
      const prices = this.db.prepare(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = ? AND date >= ?
        ORDER BY date ASC
      `).all(pos.company_id, startDate);

      allPrices[pos.company_id] = new Map();
      for (const p of prices) {
        const price = p.adjusted_close || p.close;
        allPrices[pos.company_id].set(p.date, price);
        allDates.add(p.date);
      }
    }

    // Sort dates
    const sortedDates = [...allDates].sort();

    // Calculate daily portfolio returns using weighted average of position returns
    const returns = [];
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = sortedDates[i - 1];
      const currDate = sortedDates[i];

      let portfolioReturn = 0;
      let totalWeight = 0;

      for (const pos of positions) {
        const prevPrice = allPrices[pos.company_id].get(prevDate);
        const currPrice = allPrices[pos.company_id].get(currDate);

        if (prevPrice && currPrice && prevPrice > 0) {
          const posReturn = (currPrice - prevPrice) / prevPrice;
          portfolioReturn += posReturn * weights[pos.company_id];
          totalWeight += weights[pos.company_id];
        }
      }

      if (totalWeight > 0.5) { // Only if we have data for at least half the portfolio
        returns.push({
          date: currDate,
          return: portfolioReturn / totalWeight * totalWeight // Normalize
        });
      }
    }

    return returns;
  }

  _loadBenchmarkReturns(symbol, startDate) {
    // Try to get benchmark from ETF/index prices
    const company = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(symbol);

    if (!company) {
      // Fallback: use S&P 500 index if available
      const indexPrices = this.db.prepare(`
        SELECT date, close
        FROM index_prices
        WHERE index_id = 1 AND date >= ?
        ORDER BY date ASC
      `).all(startDate);

      const returns = [];
      for (let i = 1; i < indexPrices.length; i++) {
        if (indexPrices[i - 1].close > 0) {
          returns.push({
            date: indexPrices[i].date,
            return: (indexPrices[i].close - indexPrices[i - 1].close) / indexPrices[i - 1].close
          });
        }
      }
      return returns;
    }

    const prices = this.db.prepare(`
      SELECT date, adjusted_close, close
      FROM daily_prices
      WHERE company_id = ? AND date >= ?
      ORDER BY date ASC
    `).all(company.id, startDate);

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1].adjusted_close || prices[i - 1].close;
      const curr = prices[i].adjusted_close || prices[i].close;
      if (prev > 0) {
        returns.push({
          date: prices[i].date,
          return: (curr - prev) / prev
        });
      }
    }
    return returns;
  }

  _loadPositionReturns(companyId, startDate, targetDates) {
    const prices = this.db.prepare(`
      SELECT date, adjusted_close, close
      FROM daily_prices
      WHERE company_id = ? AND date >= ?
      ORDER BY date ASC
    `).all(companyId, startDate);

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      const prev = prices[i - 1].adjusted_close || prices[i - 1].close;
      const curr = prices[i].adjusted_close || prices[i].close;
      if (prev > 0) {
        returns.push({
          date: prices[i].date,
          return: (curr - prev) / prev
        });
      }
    }
    return returns;
  }

  _alignReturns(portfolioReturns, benchmarkReturns) {
    const portfolioDates = new Set(portfolioReturns.map(r => r.date));
    const benchmarkDates = new Set(benchmarkReturns.map(r => r.date));

    const commonDates = [...portfolioDates].filter(d => benchmarkDates.has(d)).sort();

    const portfolioMap = new Map(portfolioReturns.map(r => [r.date, r.return]));
    const benchmarkMap = new Map(benchmarkReturns.map(r => [r.date, r.return]));

    return {
      dates: commonDates,
      portfolioReturns: commonDates.map(d => portfolioMap.get(d)),
      benchmarkReturns: commonDates.map(d => benchmarkMap.get(d))
    };
  }

  _calculateFactorExposures(positions) {
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);

    let sizeTilt = 0;
    let valueTilt = 0;
    let momentumTilt = 0;
    let qualityTilt = 0;

    for (const pos of positions) {
      const weight = totalValue > 0 ? (pos.value || 0) / totalValue : 1 / positions.length;

      // Size tilt based on market cap
      const mc = pos.market_cap || 0;
      if (mc >= 200e9) sizeTilt += weight * 1.0;
      else if (mc >= 10e9) sizeTilt += weight * 0.5;
      else if (mc >= 2e9) sizeTilt += weight * 0;
      else if (mc >= 300e6) sizeTilt += weight * -0.5;
      else sizeTilt += weight * -1.0;

      // Momentum from 1Y change
      if (pos.change_1y !== null) {
        const normMom = Math.max(-1, Math.min(1, pos.change_1y / 50));
        momentumTilt += normMom * weight;
      }

      // Beta as quality proxy (lower beta = higher quality)
      if (pos.beta !== null) {
        qualityTilt += (1 - pos.beta) * weight;
      }
    }

    return {
      sizeTilt: Math.round(sizeTilt * 100) / 100,
      valueTilt: Math.round(valueTilt * 100) / 100,
      momentumTilt: Math.round(momentumTilt * 100) / 100,
      qualityTilt: Math.round(qualityTilt * 100) / 100
    };
  }

  _estimateFactorReturns(positions, startDate, dates) {
    // Placeholder - in production, load actual factor returns from Fama-French data
    return {
      market: dates.map(() => Math.random() * 0.001),
      smb: dates.map(() => (Math.random() - 0.5) * 0.001),
      hml: dates.map(() => (Math.random() - 0.5) * 0.001),
      mom: dates.map(() => (Math.random() - 0.5) * 0.001)
    };
  }

  _calculateSingleFactorBeta(returns1, returns2) {
    const n = Math.min(returns1.length, returns2.length);
    if (n < 20) return 1;

    const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
    const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

    let cov = 0, var2 = 0;
    for (let i = 0; i < n; i++) {
      cov += (returns1[i] - mean1) * (returns2[i] - mean2);
      var2 += Math.pow(returns2[i] - mean2, 2);
    }

    return var2 > 0 ? cov / var2 : 1;
  }

  _tStatToPValue(tStat, df) {
    // Approximate p-value using normal distribution for large df
    if (df > 30) {
      const z = tStat;
      return 2 * (1 - this._normalCDF(z));
    }
    // For smaller df, use approximation
    return 2 * (1 - this._normalCDF(tStat * Math.sqrt(df / (df + tStat * tStat))));
  }

  _normalCDF(x) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  _bootstrapSignificance(returns, iterations) {
    const n = returns.length;
    const observedMean = returns.reduce((a, b) => a + b, 0) / n;

    let countMoreExtreme = 0;

    for (let i = 0; i < iterations; i++) {
      // Resample with replacement
      const sample = [];
      for (let j = 0; j < n; j++) {
        sample.push(returns[Math.floor(Math.random() * n)]);
      }
      const sampleMean = sample.reduce((a, b) => a + b, 0) / n;

      if (observedMean >= 0 && sampleMean <= 0) countMoreExtreme++;
      if (observedMean < 0 && sampleMean >= 0) countMoreExtreme++;
    }

    return countMoreExtreme / iterations;
  }

  _interpretJensensAlpha(alpha, beta, isSignificant) {
    const alphaDesc = alpha > 0 ? 'positive' : alpha < 0 ? 'negative' : 'neutral';
    const sigDesc = isSignificant ? 'statistically significant' : 'not statistically significant';
    const betaDesc = beta > 1.2 ? 'aggressive' : beta < 0.8 ? 'defensive' : 'market-neutral';

    if (alpha > 5 && isSignificant) {
      return `Strong ${alphaDesc} alpha (${sigDesc}) with ${betaDesc} risk profile. Portfolio is generating substantial excess returns.`;
    } else if (alpha > 0 && isSignificant) {
      return `Modest ${alphaDesc} alpha (${sigDesc}). Portfolio outperforming on risk-adjusted basis.`;
    } else if (alpha > 0) {
      return `Positive alpha but ${sigDesc}. Could be skill or luck - more data needed.`;
    } else if (alpha < -5) {
      return `Negative alpha indicates underperformance vs CAPM expectations. Review position selection.`;
    } else {
      return `Near-zero alpha suggests returns are explained by market exposure. No significant edge detected.`;
    }
  }

  _interpretMultiFactorAlpha(rawAlpha, factorAdjusted, exposures) {
    const difference = rawAlpha - factorAdjusted;

    if (Math.abs(difference) > 3) {
      return `Factor exposures explain ${Math.abs(difference).toFixed(1)}% of apparent alpha. True stock-picking alpha is ${factorAdjusted.toFixed(1)}%.`;
    } else if (factorAdjusted > 2) {
      return `Genuine alpha of ${factorAdjusted.toFixed(1)}% after factor adjustment. Strong stock selection skill.`;
    } else if (factorAdjusted < -2) {
      return `Negative factor-adjusted alpha. Portfolio would benefit from passive factor exposure instead.`;
    } else {
      return `Factor-adjusted alpha near zero. Returns largely explained by systematic factor tilts.`;
    }
  }

  _interpretRollingAlpha(consistency, trend, avgAlpha) {
    if (consistency > 70 && avgAlpha > 2) {
      return `Highly consistent alpha generation (${consistency}% of periods positive). Strong evidence of skill.`;
    } else if (consistency > 60) {
      return `Moderate consistency. Alpha is ${trend === 'improving' ? 'improving' : trend === 'declining' ? 'declining' : 'stable'} over time.`;
    } else if (consistency < 40) {
      return `Low alpha consistency suggests high variability. Performance may be timing-dependent.`;
    } else {
      return `Mixed results - alpha positive about half the time. Edge is marginal.`;
    }
  }

  _interpretSkillAnalysis(skillScore, pValue, consistency) {
    if (skillScore >= 80) {
      return 'Strong evidence of investment skill. Outperformance is unlikely due to chance.';
    } else if (skillScore >= 60) {
      return 'Moderate evidence of skill. Results suggest some genuine edge, but continue monitoring.';
    } else if (skillScore >= 40) {
      return 'Inconclusive - could be skill or luck. Longer track record needed for confidence.';
    } else if (skillScore >= 20) {
      return 'Limited evidence of skill. Results could easily be explained by random chance.';
    } else {
      return 'No statistical evidence of skill. Consider passive strategies or strategy review.';
    }
  }

  _getSkillRecommendation(skillScore, excessReturn) {
    if (skillScore >= 70 && excessReturn > 0) {
      return { action: 'maintain', message: 'Continue current strategy - evidence supports your approach.' };
    } else if (skillScore >= 50) {
      return { action: 'refine', message: 'Look for ways to increase consistency and reduce variance.' };
    } else if (excessReturn > 0) {
      return { action: 'extend', message: 'Positive returns but need longer track record to confirm skill.' };
    } else {
      return { action: 'review', message: 'Consider reviewing strategy or increasing passive exposure.' };
    }
  }

  _getAlphaRating(alpha, skillConfidence) {
    if (alpha > 5 && skillConfidence > 70) return 'Excellent';
    if (alpha > 2 && skillConfidence > 50) return 'Good';
    if (alpha > 0 && skillConfidence > 40) return 'Fair';
    if (alpha > -2) return 'Neutral';
    return 'Poor';
  }

  // ============================================
  // Public API Methods (Individual endpoints)
  // ============================================

  /**
   * Get only Jensen's Alpha analysis
   */
  getJensensAlpha(portfolioId, params = {}) {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    const { startDate } = this._getPeriodDates(period);

    const portfolioReturns = this._loadPortfolioReturns(portfolioId, startDate);
    const benchmarkReturns = this._loadBenchmarkReturns(benchmarkSymbol, startDate);

    if (portfolioReturns.length < 20) {
      return { error: 'Insufficient data for Jensen\'s alpha (need 20+ days)' };
    }

    const aligned = this._alignReturns(portfolioReturns, benchmarkReturns);
    const result = this._calculateJensensAlpha(aligned);

    return {
      portfolioId,
      period,
      benchmark: benchmarkSymbol,
      tradingDays: aligned.dates.length,
      ...result
    };
  }

  /**
   * Get multi-factor alpha analysis
   */
  getMultiFactorAlpha(portfolioId, params = {}) {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const portfolioReturns = this._loadPortfolioReturns(portfolioId, startDate);
    const benchmarkReturns = this._loadBenchmarkReturns(benchmarkSymbol, startDate);

    if (portfolioReturns.length < 60) {
      return { error: 'Insufficient data for multi-factor analysis (need 60+ days)' };
    }

    const aligned = this._alignReturns(portfolioReturns, benchmarkReturns);
    const result = this._calculateMultiFactorAlpha(positions, startDate, aligned);

    return {
      portfolioId,
      period,
      benchmark: benchmarkSymbol,
      tradingDays: aligned.dates.length,
      ...result
    };
  }

  /**
   * Get rolling alpha analysis
   */
  getRollingAlpha(portfolioId, params = {}) {
    const { period = '1y', benchmarkSymbol = 'SPY', windowDays = 60 } = params;
    const { startDate } = this._getPeriodDates(period);

    const portfolioReturns = this._loadPortfolioReturns(portfolioId, startDate);
    const benchmarkReturns = this._loadBenchmarkReturns(benchmarkSymbol, startDate);

    if (portfolioReturns.length < windowDays + 20) {
      return { error: `Insufficient data for rolling alpha (need ${windowDays + 20}+ days)` };
    }

    const aligned = this._alignReturns(portfolioReturns, benchmarkReturns);
    const result = this._calculateRollingAlpha(aligned, windowDays);

    return {
      portfolioId,
      period,
      benchmark: benchmarkSymbol,
      tradingDays: aligned.dates.length,
      ...result
    };
  }

  /**
   * Get alpha attribution by position
   */
  getAlphaAttribution(portfolioId, params = {}) {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    const { startDate } = this._getPeriodDates(period);
    const portfolioReturns = this._loadPortfolioReturns(portfolioId, startDate);
    const benchmarkReturns = this._loadBenchmarkReturns(benchmarkSymbol, startDate);

    if (portfolioReturns.length < 20) {
      return { error: 'Insufficient data for attribution (need 20+ days)' };
    }

    const aligned = this._alignReturns(portfolioReturns, benchmarkReturns);
    const result = this._calculateAlphaAttribution(positions, startDate, aligned);

    return {
      portfolioId,
      period,
      benchmark: benchmarkSymbol,
      tradingDays: aligned.dates.length,
      ...result
    };
  }

  /**
   * Get skill vs luck analysis
   */
  getSkillAnalysis(portfolioId, params = {}) {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    const { startDate } = this._getPeriodDates(period);

    const portfolioReturns = this._loadPortfolioReturns(portfolioId, startDate);
    const benchmarkReturns = this._loadBenchmarkReturns(benchmarkSymbol, startDate);

    if (portfolioReturns.length < 60) {
      return { error: 'Insufficient data for skill analysis (need 60+ days)' };
    }

    const aligned = this._alignReturns(portfolioReturns, benchmarkReturns);
    const rollingAlpha = this._calculateRollingAlpha(aligned);
    const result = this._analyzeSkillVsLuck(aligned, rollingAlpha);

    return {
      portfolioId,
      period,
      benchmark: benchmarkSymbol,
      tradingDays: aligned.dates.length,
      ...result
    };
  }
}

module.exports = new AlphaAnalytics();
