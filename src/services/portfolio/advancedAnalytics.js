// src/services/portfolio/advancedAnalytics.js
// Advanced Portfolio Analytics - Correlation, Factors, Diversification (Agent 2)

const db = require('../../database');

const TRADING_DAYS_PER_YEAR = 252;

class AdvancedAnalytics {
  constructor() {
    this.db = db.getDatabase();
    console.log('📊 Advanced Analytics Engine initialized');
  }

  // ============================================
  // Correlation Matrix
  // ============================================
  getCorrelationMatrix(portfolioId, period = '1y') {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length < 2) {
      return {
        error: 'Need at least 2 positions for correlation analysis',
        positionCount: positions.length
      };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadReturnsForPositions(positions, startDate);

    if (Object.keys(returns).length < 2) {
      return {
        error: 'Insufficient return data for correlation analysis',
        positionCount: positions.length
      };
    }

    const symbols = positions.map(p => p.symbol);
    const matrix = [];
    const highlyCorrelated = [];

    // Calculate correlation matrix
    for (let i = 0; i < symbols.length; i++) {
      const row = [];
      for (let j = 0; j < symbols.length; j++) {
        if (i === j) {
          row.push(1.0);
        } else if (j < i) {
          // Use symmetry
          row.push(matrix[j][i]);
        } else {
          const corr = this._calculateCorrelation(
            returns[positions[i].company_id] || [],
            returns[positions[j].company_id] || []
          );
          row.push(corr);

          // Track highly correlated pairs
          if (corr !== null && Math.abs(corr) > 0.7) {
            highlyCorrelated.push({
              pair: [symbols[i], symbols[j]],
              correlation: corr,
              level: Math.abs(corr) > 0.9 ? 'very_high' : 'high'
            });
          }
        }
      }
      matrix.push(row);
    }

    // Calculate average correlation (excluding diagonal)
    let totalCorr = 0;
    let count = 0;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = i + 1; j < matrix[i].length; j++) {
        if (matrix[i][j] !== null) {
          totalCorr += matrix[i][j];
          count++;
        }
      }
    }
    const avgCorrelation = count > 0 ? totalCorr / count : null;

    return {
      portfolioId,
      period,
      symbols,
      matrix,
      avgCorrelation,
      highlyCorrelated: highlyCorrelated.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)),
      diversificationBenefit: avgCorrelation !== null ? (1 - avgCorrelation) * 100 : null
    };
  }

  // ============================================
  // Diversification Score
  // ============================================
  getDiversificationScore(portfolioId) {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    // Calculate weights
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = positions.map(p => ({
      ...p,
      weight: totalValue > 0 ? (p.value || 0) / totalValue : 1 / positions.length
    }));

    // 1. Position concentration score (0-100)
    const hhi = weights.reduce((sum, w) => sum + Math.pow(w.weight, 2), 0);
    const positionScore = Math.max(0, (1 - hhi) * 100);

    // 2. Sector concentration score
    const sectorWeights = {};
    for (const pos of weights) {
      const sector = pos.sector || 'Unknown';
      sectorWeights[sector] = (sectorWeights[sector] || 0) + pos.weight;
    }
    const sectorHHI = Object.values(sectorWeights).reduce((sum, w) => sum + Math.pow(w, 2), 0);
    const sectorScore = Math.max(0, (1 - sectorHHI) * 100);

    // 3. Correlation score (if we have enough data)
    let correlationScore = 50; // Default to neutral
    try {
      const corrMatrix = this.getCorrelationMatrix(portfolioId, '1y');
      if (corrMatrix.avgCorrelation !== null) {
        // Lower correlation = better diversification
        correlationScore = (1 - corrMatrix.avgCorrelation) * 100;
      }
    } catch (e) {
      // Keep default
    }

    // 4. Market cap diversification
    const marketCapBuckets = { large: 0, mid: 0, small: 0, micro: 0 };
    for (const pos of weights) {
      const mc = pos.market_cap || 0;
      if (mc >= 10e9) marketCapBuckets.large += pos.weight;
      else if (mc >= 2e9) marketCapBuckets.mid += pos.weight;
      else if (mc >= 300e6) marketCapBuckets.small += pos.weight;
      else marketCapBuckets.micro += pos.weight;
    }
    const capHHI = Object.values(marketCapBuckets).reduce((sum, w) => sum + Math.pow(w, 2), 0);
    const marketCapScore = Math.max(0, (1 - capHHI) * 100);

    // Weighted overall score
    const overallScore = (
      positionScore * 0.30 +
      sectorScore * 0.30 +
      correlationScore * 0.25 +
      marketCapScore * 0.15
    );

    return {
      portfolioId,
      overallScore: Math.round(overallScore),
      components: {
        positionConcentration: {
          score: Math.round(positionScore),
          hhi: hhi,
          topPosition: weights.length > 0 ? weights.reduce((max, w) => w.weight > max.weight ? w : max).symbol : null,
          topWeight: weights.length > 0 ? Math.max(...weights.map(w => w.weight)) * 100 : 0
        },
        sectorConcentration: {
          score: Math.round(sectorScore),
          hhi: sectorHHI,
          sectors: Object.entries(sectorWeights).map(([sector, weight]) => ({
            sector,
            weight: weight * 100
          })).sort((a, b) => b.weight - a.weight)
        },
        correlation: {
          score: Math.round(correlationScore),
          avgCorrelation: (100 - correlationScore) / 100
        },
        marketCap: {
          score: Math.round(marketCapScore),
          buckets: Object.entries(marketCapBuckets).map(([bucket, weight]) => ({
            bucket,
            weight: weight * 100
          })).filter(b => b.weight > 0)
        }
      },
      rating: this._getDiversificationRating(overallScore),
      suggestions: this._getDiversificationSuggestions(overallScore, sectorWeights, weights)
    };
  }

  // ============================================
  // Factor Exposure Analysis
  // ============================================
  getFactorExposure(portfolioId) {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    // Get additional data for each position
    const positionsWithData = this._enrichPositionsWithFactorData(positions);

    // Calculate weights
    const totalValue = positionsWithData.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = positionsWithData.map(p => ({
      ...p,
      weight: totalValue > 0 ? (p.value || 0) / totalValue : 1 / positionsWithData.length
    }));

    // Calculate factor exposures

    // 1. Market Beta (weighted average of individual betas)
    let marketBeta = 0;
    let betaCount = 0;
    for (const pos of weights) {
      if (pos.beta !== null && pos.beta !== undefined) {
        marketBeta += pos.beta * pos.weight;
        betaCount++;
      }
    }
    marketBeta = betaCount > 0 ? marketBeta : 1.0; // Default to 1 if no data

    // 2. Size Tilt (based on market cap distribution)
    let sizeTilt = 0; // -1 = small cap, +1 = large cap
    for (const pos of weights) {
      const mc = pos.market_cap || 0;
      if (mc >= 200e9) sizeTilt += pos.weight * 1.0; // Mega cap
      else if (mc >= 10e9) sizeTilt += pos.weight * 0.5; // Large cap
      else if (mc >= 2e9) sizeTilt += pos.weight * 0.0; // Mid cap
      else if (mc >= 300e6) sizeTilt += pos.weight * -0.5; // Small cap
      else sizeTilt += pos.weight * -1.0; // Micro cap
    }

    // 3. Value Tilt (based on P/E ratios)
    let valueTilt = 0; // -1 = growth, +1 = value
    let peCount = 0;
    for (const pos of weights) {
      if (pos.pe_ratio !== null && pos.pe_ratio !== undefined && pos.pe_ratio > 0) {
        // Low P/E = value, High P/E = growth
        if (pos.pe_ratio < 15) valueTilt += pos.weight * 1.0;
        else if (pos.pe_ratio < 20) valueTilt += pos.weight * 0.5;
        else if (pos.pe_ratio < 30) valueTilt += pos.weight * -0.3;
        else valueTilt += pos.weight * -1.0;
        peCount++;
      }
    }

    // 4. Momentum Exposure (based on recent price performance)
    let momentumExposure = 0;
    for (const pos of weights) {
      if (pos.change_1y !== null && pos.change_1y !== undefined) {
        // Normalize momentum to -1 to +1 range
        const normMomentum = Math.max(-1, Math.min(1, pos.change_1y / 50)); // 50% = full momentum
        momentumExposure += normMomentum * pos.weight;
      }
    }

    // 5. Quality Exposure (based on ROE and margins)
    let qualityExposure = 0;
    let qualityCount = 0;
    for (const pos of weights) {
      let qualityScore = 0;
      let factors = 0;

      if (pos.roe !== null && pos.roe !== undefined) {
        qualityScore += pos.roe > 20 ? 1 : pos.roe > 10 ? 0.5 : pos.roe > 0 ? 0 : -0.5;
        factors++;
      }
      if (pos.operating_margin !== null && pos.operating_margin !== undefined) {
        qualityScore += pos.operating_margin > 20 ? 1 : pos.operating_margin > 10 ? 0.5 : pos.operating_margin > 0 ? 0 : -0.5;
        factors++;
      }

      if (factors > 0) {
        qualityExposure += (qualityScore / factors) * pos.weight;
        qualityCount++;
      }
    }

    // 6. Volatility (weighted average)
    let volatility = 0;
    for (const pos of weights) {
      if (pos.volatility !== null && pos.volatility !== undefined) {
        volatility += pos.volatility * pos.weight;
      }
    }

    return {
      portfolioId,
      factors: {
        marketBeta: {
          value: Math.round(marketBeta * 100) / 100,
          interpretation: marketBeta > 1.2 ? 'aggressive' : marketBeta < 0.8 ? 'defensive' : 'neutral'
        },
        sizeTilt: {
          value: Math.round(sizeTilt * 100) / 100,
          interpretation: sizeTilt > 0.3 ? 'large_cap' : sizeTilt < -0.3 ? 'small_cap' : 'balanced'
        },
        valueTilt: {
          value: Math.round(valueTilt * 100) / 100,
          interpretation: valueTilt > 0.3 ? 'value' : valueTilt < -0.3 ? 'growth' : 'blend'
        },
        momentumExposure: {
          value: Math.round(momentumExposure * 100) / 100,
          interpretation: momentumExposure > 0.3 ? 'high_momentum' : momentumExposure < -0.3 ? 'low_momentum' : 'neutral'
        },
        qualityExposure: {
          value: Math.round(qualityExposure * 100) / 100,
          interpretation: qualityExposure > 0.3 ? 'high_quality' : qualityExposure < -0.3 ? 'low_quality' : 'average'
        },
        volatility: {
          value: Math.round(volatility * 100) / 100,
          interpretation: volatility > 30 ? 'high' : volatility < 15 ? 'low' : 'moderate'
        }
      },
      style: this._getStyleBox(sizeTilt, valueTilt),
      summary: this._getFactorSummary(marketBeta, sizeTilt, valueTilt, qualityExposure)
    };
  }

  // ============================================
  // Covariance Matrix & Portfolio Variance
  // ============================================
  getCovarianceMatrix(portfolioId, period = '1y') {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length < 2) {
      return {
        error: 'Need at least 2 positions for covariance analysis',
        positionCount: positions.length
      };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadReturnsForPositions(positions, startDate);
    const symbols = positions.map(p => p.symbol);

    // Calculate weights
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = positions.map(p => totalValue > 0 ? (p.value || 0) / totalValue : 1 / positions.length);

    // Calculate covariance matrix
    const covMatrix = [];
    const annualizationFactor = TRADING_DAYS_PER_YEAR;

    for (let i = 0; i < positions.length; i++) {
      const row = [];
      for (let j = 0; j < positions.length; j++) {
        const cov = this._calculateCovariance(
          returns[positions[i].company_id] || [],
          returns[positions[j].company_id] || []
        );
        // Annualize covariance
        row.push(cov !== null ? cov * annualizationFactor : null);
      }
      covMatrix.push(row);
    }

    // Calculate portfolio variance: w' * Σ * w
    let portfolioVariance = 0;
    for (let i = 0; i < positions.length; i++) {
      for (let j = 0; j < positions.length; j++) {
        if (covMatrix[i][j] !== null) {
          portfolioVariance += weights[i] * weights[j] * covMatrix[i][j];
        }
      }
    }

    const portfolioVolatility = Math.sqrt(portfolioVariance) * 100;

    // Calculate individual volatilities
    const individualVolatilities = positions.map((pos, i) => ({
      symbol: pos.symbol,
      weight: weights[i] * 100,
      volatility: covMatrix[i][i] !== null ? Math.sqrt(covMatrix[i][i]) * 100 : null
    }));

    // Calculate weighted average volatility (for diversification benefit)
    const weightedAvgVol = individualVolatilities.reduce((sum, v) => {
      return sum + (v.volatility || 0) * (v.weight / 100);
    }, 0);

    const diversificationBenefit = weightedAvgVol > 0
      ? ((weightedAvgVol - portfolioVolatility) / weightedAvgVol) * 100
      : 0;

    return {
      portfolioId,
      period,
      symbols,
      covarianceMatrix: covMatrix,
      portfolioVariance,
      portfolioVolatility: Math.round(portfolioVolatility * 100) / 100,
      weightedAvgVolatility: Math.round(weightedAvgVol * 100) / 100,
      diversificationBenefit: Math.round(diversificationBenefit * 100) / 100,
      individualVolatilities,
      weights: weights.map((w, i) => ({ symbol: symbols[i], weight: w * 100 }))
    };
  }

  // ============================================
  // Marginal Risk Contribution
  // ============================================
  getMarginalRiskContribution(portfolioId, period = '1y') {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length < 2) {
      return {
        error: 'Need at least 2 positions for risk contribution analysis',
        positionCount: positions.length
      };
    }

    const covResult = this.getCovarianceMatrix(portfolioId, period);
    if (covResult.error) return covResult;

    const { covarianceMatrix, portfolioVolatility, symbols } = covResult;
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = positions.map(p => totalValue > 0 ? (p.value || 0) / totalValue : 1 / positions.length);

    const portfolioVariance = Math.pow(portfolioVolatility / 100, 2);
    const portfolioStdDev = portfolioVolatility / 100;

    // Marginal contribution to risk (MCR) = d(σp)/d(wi) = (Σ * w)i / σp
    // Risk contribution = wi * MCRi
    const riskContributions = [];

    for (let i = 0; i < positions.length; i++) {
      // Calculate (Σ * w)i
      let sigmaW = 0;
      for (let j = 0; j < positions.length; j++) {
        if (covarianceMatrix[i][j] !== null) {
          sigmaW += covarianceMatrix[i][j] * weights[j];
        }
      }

      const mcr = portfolioStdDev > 0 ? sigmaW / portfolioStdDev : 0;
      const riskContribution = weights[i] * mcr;
      const percentContribution = portfolioVariance > 0
        ? (riskContribution / portfolioStdDev) * 100
        : 0;

      riskContributions.push({
        symbol: symbols[i],
        weight: weights[i] * 100,
        value: positions[i].value,
        marginalContribution: mcr * 100,
        riskContribution: riskContribution * 100,
        percentOfTotalRisk: percentContribution,
        riskEfficiency: weights[i] > 0 ? percentContribution / (weights[i] * 100) : 0
      });
    }

    // Sort by risk contribution descending
    riskContributions.sort((a, b) => b.percentOfTotalRisk - a.percentOfTotalRisk);

    // Calculate concentration metrics
    const top3RiskConcentration = riskContributions
      .slice(0, 3)
      .reduce((sum, r) => sum + r.percentOfTotalRisk, 0);

    // Find over/under riskers
    const overRiskers = riskContributions.filter(r => r.riskEfficiency > 1.2);
    const underRiskers = riskContributions.filter(r => r.riskEfficiency < 0.8);

    return {
      portfolioId,
      period,
      portfolioVolatility,
      riskContributions,
      top3RiskConcentration: Math.round(top3RiskConcentration * 100) / 100,
      overRiskers: overRiskers.map(r => r.symbol),
      underRiskers: underRiskers.map(r => r.symbol),
      riskBalanceScore: this._calculateRiskBalanceScore(riskContributions),
      suggestions: this._getRiskContributionSuggestions(riskContributions, weights)
    };
  }

  // ============================================
  // Rolling Correlation
  // ============================================
  getRollingCorrelation(portfolioId, period = '1y', windowDays = 60) {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length < 2) {
      return {
        error: 'Need at least 2 positions for rolling correlation',
        positionCount: positions.length
      };
    }

    const { startDate } = this._getPeriodDates(period);
    const returns = this._loadReturnsForPositions(positions, startDate);
    const symbols = positions.map(p => p.symbol);

    // Get aligned dates
    const allDates = this._getAlignedDates(positions, startDate);
    if (allDates.length < windowDays + 10) {
      return {
        error: 'Insufficient data for rolling correlation',
        daysAvailable: allDates.length,
        windowDays
      };
    }

    // Calculate rolling average correlation
    const rollingData = [];

    for (let d = windowDays; d < allDates.length; d++) {
      const windowReturns = {};

      // Get returns for this window
      for (const pos of positions) {
        const posReturns = returns[pos.company_id] || [];
        windowReturns[pos.company_id] = posReturns.slice(d - windowDays, d);
      }

      // Calculate average pairwise correlation for this window
      let totalCorr = 0;
      let pairCount = 0;

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const corr = this._calculateCorrelation(
            windowReturns[positions[i].company_id] || [],
            windowReturns[positions[j].company_id] || []
          );
          if (corr !== null) {
            totalCorr += corr;
            pairCount++;
          }
        }
      }

      if (pairCount > 0) {
        rollingData.push({
          date: allDates[d],
          avgCorrelation: Math.round((totalCorr / pairCount) * 100) / 100,
          pairsAnalyzed: pairCount
        });
      }
    }

    // Calculate statistics
    const correlations = rollingData.map(d => d.avgCorrelation);
    const avgCorr = correlations.reduce((a, b) => a + b, 0) / correlations.length;
    const maxCorr = Math.max(...correlations);
    const minCorr = Math.min(...correlations);
    const currentCorr = correlations[correlations.length - 1];

    // Find correlation spikes (crisis periods)
    const spikes = rollingData.filter(d => d.avgCorrelation > avgCorr + 0.15);

    return {
      portfolioId,
      period,
      windowDays,
      symbols,
      rollingData: rollingData.slice(-90), // Last 90 data points for charting
      statistics: {
        average: Math.round(avgCorr * 100) / 100,
        current: Math.round(currentCorr * 100) / 100,
        max: Math.round(maxCorr * 100) / 100,
        min: Math.round(minCorr * 100) / 100,
        range: Math.round((maxCorr - minCorr) * 100) / 100
      },
      correlationSpikes: spikes.slice(-5).map(s => ({
        date: s.date,
        correlation: s.avgCorrelation
      })),
      trend: currentCorr > avgCorr ? 'increasing' : 'decreasing',
      warning: currentCorr > 0.7 ? 'High correlation - diversification benefit reduced' : null
    };
  }

  // ============================================
  // Cluster Analysis (Hierarchical)
  // ============================================
  getClusterAnalysis(portfolioId, period = '1y') {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length < 3) {
      return {
        error: 'Need at least 3 positions for cluster analysis',
        positionCount: positions.length
      };
    }

    const corrResult = this.getCorrelationMatrix(portfolioId, period);
    if (corrResult.error) return corrResult;

    const { matrix, symbols } = corrResult;
    const n = symbols.length;

    // Convert correlation to distance (1 - correlation)
    const distanceMatrix = matrix.map(row =>
      row.map(corr => corr !== null ? 1 - corr : 2)
    );

    // Simple hierarchical clustering (agglomerative, single linkage)
    const clusters = this._hierarchicalClustering(symbols, distanceMatrix);

    // Calculate total portfolio weight in each cluster
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);
    const weights = {};
    positions.forEach(p => {
      weights[p.symbol] = totalValue > 0 ? (p.value || 0) / totalValue * 100 : 100 / n;
    });

    // Enrich clusters with weights and sector info
    const enrichedClusters = clusters.map((cluster, i) => {
      const clusterWeight = cluster.members.reduce((sum, sym) => sum + (weights[sym] || 0), 0);
      const sectors = {};

      cluster.members.forEach(sym => {
        const pos = positions.find(p => p.symbol === sym);
        const sector = pos?.sector || 'Unknown';
        sectors[sector] = (sectors[sector] || 0) + 1;
      });

      return {
        id: i + 1,
        name: cluster.name || `Cluster ${i + 1}`,
        members: cluster.members,
        memberCount: cluster.members.length,
        combinedWeight: Math.round(clusterWeight * 100) / 100,
        avgIntraCorrelation: cluster.avgCorrelation,
        sectors: Object.entries(sectors)
          .map(([sector, count]) => ({ sector, count }))
          .sort((a, b) => b.count - a.count),
        riskLevel: clusterWeight > 40 ? 'high' : clusterWeight > 25 ? 'medium' : 'low'
      };
    });

    // Calculate cluster concentration risk
    const maxClusterWeight = Math.max(...enrichedClusters.map(c => c.combinedWeight));
    const clusterHHI = enrichedClusters.reduce((sum, c) =>
      sum + Math.pow(c.combinedWeight / 100, 2), 0
    );

    return {
      portfolioId,
      period,
      positionCount: n,
      clusterCount: enrichedClusters.length,
      clusters: enrichedClusters,
      concentrationRisk: {
        maxClusterWeight: Math.round(maxClusterWeight * 100) / 100,
        clusterHHI: Math.round(clusterHHI * 10000) / 10000,
        effectiveClusters: clusterHHI > 0 ? Math.round(1 / clusterHHI * 10) / 10 : n
      },
      hiddenRisks: this._identifyHiddenClusterRisks(enrichedClusters, positions),
      recommendations: this._getClusterRecommendations(enrichedClusters, maxClusterWeight)
    };
  }

  // ============================================
  // Income Projection
  // ============================================
  projectDividendIncome(portfolioId, years = 5, growthRate = 0.05) {
    const positions = this._getPortfolioPositions(portfolioId);
    if (positions.length === 0) {
      return { error: 'Portfolio has no positions' };
    }

    // Get dividend data for each position
    const positionsWithDividends = [];
    let totalCurrentIncome = 0;
    let totalValue = 0;

    for (const pos of positions) {
      // Get latest dividend data from dividend_metrics table
      const dividend = this.db.prepare(`
        SELECT dividend_yield, current_annual_dividend
        FROM dividend_metrics
        WHERE company_id = ?
      `).get(pos.company_id);

      // current_annual_dividend is already the annual amount per share
      const annualDividend = dividend?.current_annual_dividend
        ? dividend.current_annual_dividend * pos.shares
        : 0;

      totalCurrentIncome += annualDividend;
      totalValue += pos.value || 0;

      if (annualDividend > 0) {
        positionsWithDividends.push({
          symbol: pos.symbol,
          shares: pos.shares,
          value: pos.value,
          dividendYield: dividend?.dividend_yield || 0,
          annualDividend,
          quarterlyDividend: annualDividend / 4
        });
      }
    }

    // Project income for each year
    const annualIncome = [];
    let projectedIncome = totalCurrentIncome;

    for (let year = 0; year <= years; year++) {
      annualIncome.push({
        year,
        income: Math.round(projectedIncome * 100) / 100,
        monthlyIncome: Math.round(projectedIncome / 12 * 100) / 100
      });
      projectedIncome *= (1 + growthRate);
    }

    // Calculate yields
    const currentYield = totalValue > 0 ? (totalCurrentIncome / totalValue) * 100 : 0;

    // Get cost basis for yield on cost
    const costBasis = this.db.prepare(`
      SELECT SUM(cost_basis) as total_cost
      FROM portfolio_positions
      WHERE portfolio_id = ?
    `).get(portfolioId)?.total_cost || totalValue;

    const yieldOnCost = costBasis > 0 ? (totalCurrentIncome / costBasis) * 100 : 0;

    return {
      portfolioId,
      projectionYears: years,
      dividendGrowthRate: growthRate * 100,
      currentAnnualIncome: Math.round(totalCurrentIncome * 100) / 100,
      currentMonthlyIncome: Math.round(totalCurrentIncome / 12 * 100) / 100,
      currentYield: Math.round(currentYield * 100) / 100,
      yieldOnCost: Math.round(yieldOnCost * 100) / 100,
      projectedFinalIncome: Math.round(annualIncome[years].income * 100) / 100,
      projectedFinalYield: totalValue > 0
        ? Math.round((annualIncome[years].income / totalValue) * 100 * 100) / 100
        : 0,
      annualProjection: annualIncome,
      dividendPayers: positionsWithDividends.length,
      nonDividendPayers: positions.length - positionsWithDividends.length,
      topDividendPayers: positionsWithDividends
        .sort((a, b) => b.annualDividend - a.annualDividend)
        .slice(0, 5)
        .map(p => ({
          symbol: p.symbol,
          annualDividend: Math.round(p.annualDividend * 100) / 100,
          yield: Math.round(p.dividendYield * 100) / 100
        }))
    };
  }

  // ============================================
  // Private Helper Methods
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
        pm.volatility_30d as volatility,
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

  _enrichPositionsWithFactorData(positions) {
    return positions.map(pos => {
      const metrics = this.db.prepare(`
        SELECT roe, operating_margin, pe_ratio
        FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT 1
      `).get(pos.company_id);

      return {
        ...pos,
        roe: metrics?.roe,
        operating_margin: metrics?.operating_margin,
        pe_ratio: metrics?.pe_ratio
      };
    });
  }

  _getPeriodDates(period) {
    const now = new Date();
    const periodDays = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      '3y': 1095,
      '5y': 1825
    };

    const days = periodDays[period] || 365;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0]
    };
  }

  _loadReturnsForPositions(positions, startDate) {
    const returns = {};

    for (const pos of positions) {
      const prices = this.db.prepare(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = ? AND date >= ?
        ORDER BY date ASC
      `).all(pos.company_id, startDate);

      const dailyReturns = [];
      for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1].adjusted_close || prices[i - 1].close;
        const curr = prices[i].adjusted_close || prices[i].close;
        if (prev && curr) {
          dailyReturns.push((curr - prev) / prev);
        }
      }

      returns[pos.company_id] = dailyReturns;
    }

    return returns;
  }

  _calculateCorrelation(returns1, returns2) {
    // Align arrays to same length
    const minLen = Math.min(returns1.length, returns2.length);
    if (minLen < 20) return null; // Not enough data

    const r1 = returns1.slice(-minLen);
    const r2 = returns2.slice(-minLen);

    // Calculate means
    const mean1 = r1.reduce((a, b) => a + b, 0) / minLen;
    const mean2 = r2.reduce((a, b) => a + b, 0) / minLen;

    // Calculate covariance and standard deviations
    let covariance = 0;
    let var1 = 0;
    let var2 = 0;

    for (let i = 0; i < minLen; i++) {
      const d1 = r1[i] - mean1;
      const d2 = r2[i] - mean2;
      covariance += d1 * d2;
      var1 += d1 * d1;
      var2 += d2 * d2;
    }

    const std1 = Math.sqrt(var1 / minLen);
    const std2 = Math.sqrt(var2 / minLen);

    if (std1 === 0 || std2 === 0) return null;

    return Math.round((covariance / minLen) / (std1 * std2) * 100) / 100;
  }

  _getDiversificationRating(score) {
    if (score >= 80) return { rating: 'Excellent', description: 'Well-diversified portfolio' };
    if (score >= 60) return { rating: 'Good', description: 'Reasonably diversified' };
    if (score >= 40) return { rating: 'Fair', description: 'Moderate diversification' };
    if (score >= 20) return { rating: 'Poor', description: 'Limited diversification' };
    return { rating: 'Very Poor', description: 'Highly concentrated' };
  }

  _getDiversificationSuggestions(score, sectorWeights, weights) {
    const suggestions = [];

    // Check sector concentration
    const topSector = Object.entries(sectorWeights)
      .sort((a, b) => b[1] - a[1])[0];
    if (topSector && topSector[1] > 0.4) {
      suggestions.push({
        type: 'sector',
        severity: 'high',
        message: `${topSector[0]} sector is ${Math.round(topSector[1] * 100)}% of portfolio. Consider diversifying into other sectors.`
      });
    }

    // Check position concentration
    const topPosition = weights.length > 0
      ? weights.reduce((max, w) => w.weight > max.weight ? w : max)
      : null;
    if (topPosition && topPosition.weight > 0.2) {
      suggestions.push({
        type: 'position',
        severity: 'medium',
        message: `${topPosition.symbol} is ${Math.round(topPosition.weight * 100)}% of portfolio. Consider reducing concentration.`
      });
    }

    // Check number of positions
    if (weights.length < 10) {
      suggestions.push({
        type: 'count',
        severity: 'low',
        message: `Only ${weights.length} positions. Consider adding more to reduce single-stock risk.`
      });
    }

    return suggestions;
  }

  _getStyleBox(sizeTilt, valueTilt) {
    // 3x3 style box
    let size, style;

    if (sizeTilt > 0.3) size = 'Large';
    else if (sizeTilt < -0.3) size = 'Small';
    else size = 'Mid';

    if (valueTilt > 0.3) style = 'Value';
    else if (valueTilt < -0.3) style = 'Growth';
    else style = 'Blend';

    return {
      size,
      style,
      label: `${size} ${style}`
    };
  }

  _getFactorSummary(beta, size, value, quality) {
    const traits = [];

    if (beta > 1.2) traits.push('high-beta');
    else if (beta < 0.8) traits.push('low-beta');

    if (size > 0.3) traits.push('large-cap');
    else if (size < -0.3) traits.push('small-cap');

    if (value > 0.3) traits.push('value-oriented');
    else if (value < -0.3) traits.push('growth-oriented');

    if (quality > 0.3) traits.push('quality-focused');

    return traits.length > 0 ? traits.join(', ') : 'balanced';
  }

  // ============================================
  // Additional Helper Methods for New Analytics
  // ============================================

  _calculateCovariance(returns1, returns2) {
    const minLen = Math.min(returns1.length, returns2.length);
    if (minLen < 20) return null;

    const r1 = returns1.slice(-minLen);
    const r2 = returns2.slice(-minLen);

    const mean1 = r1.reduce((a, b) => a + b, 0) / minLen;
    const mean2 = r2.reduce((a, b) => a + b, 0) / minLen;

    let covariance = 0;
    for (let i = 0; i < minLen; i++) {
      covariance += (r1[i] - mean1) * (r2[i] - mean2);
    }

    return covariance / (minLen - 1); // Sample covariance
  }

  _getAlignedDates(positions, startDate) {
    // Get all unique dates from the first position
    if (positions.length === 0) return [];

    const dates = this.db.prepare(`
      SELECT DISTINCT date
      FROM daily_prices
      WHERE company_id = ? AND date >= ?
      ORDER BY date ASC
    `).all(positions[0].company_id, startDate).map(d => d.date);

    return dates;
  }

  _calculateRiskBalanceScore(riskContributions) {
    // Perfect risk balance = each position contributes proportionally to its weight
    // Score 0-100, higher = more balanced
    if (riskContributions.length === 0) return 0;

    let totalDeviation = 0;
    for (const rc of riskContributions) {
      const deviation = Math.abs(rc.riskEfficiency - 1);
      totalDeviation += deviation;
    }

    const avgDeviation = totalDeviation / riskContributions.length;
    // Convert to 0-100 score (0 deviation = 100 score)
    return Math.round(Math.max(0, (1 - avgDeviation) * 100));
  }

  _getRiskContributionSuggestions(riskContributions, weights) {
    const suggestions = [];

    // Find positions that contribute disproportionately high risk
    const overRiskers = riskContributions.filter(r => r.riskEfficiency > 1.5);
    for (const or of overRiskers.slice(0, 3)) {
      suggestions.push({
        type: 'reduce',
        symbol: or.symbol,
        message: `${or.symbol} contributes ${or.percentOfTotalRisk.toFixed(1)}% of risk but only ${or.weight.toFixed(1)}% of value. Consider reducing.`
      });
    }

    // Find positions that could be increased
    const underRiskers = riskContributions.filter(r => r.riskEfficiency < 0.5 && r.weight > 3);
    for (const ur of underRiskers.slice(0, 2)) {
      suggestions.push({
        type: 'increase',
        symbol: ur.symbol,
        message: `${ur.symbol} has low risk contribution relative to weight. Could increase for better risk-adjusted returns.`
      });
    }

    return suggestions;
  }

  _hierarchicalClustering(symbols, distanceMatrix) {
    const n = symbols.length;

    // Start with each symbol as its own cluster
    let clusters = symbols.map((sym, i) => ({
      members: [sym],
      indices: [i]
    }));

    // Track which clusters have been merged
    const merged = new Array(n).fill(false);

    // Keep merging until we have reasonable number of clusters (or distance threshold)
    const targetClusters = Math.max(2, Math.ceil(n / 3));
    const maxDistance = 0.5; // Correlation > 0.5 to be in same cluster

    while (clusters.filter((_, i) => !merged[i]).length > targetClusters) {
      // Find closest pair of clusters
      let minDist = Infinity;
      let minI = -1, minJ = -1;

      for (let i = 0; i < clusters.length; i++) {
        if (merged[i]) continue;
        for (let j = i + 1; j < clusters.length; j++) {
          if (merged[j]) continue;

          // Single linkage: min distance between any members
          let dist = Infinity;
          for (const ii of clusters[i].indices) {
            for (const jj of clusters[j].indices) {
              if (distanceMatrix[ii][jj] < dist) {
                dist = distanceMatrix[ii][jj];
              }
            }
          }

          if (dist < minDist) {
            minDist = dist;
            minI = i;
            minJ = j;
          }
        }
      }

      // Stop if minimum distance exceeds threshold
      if (minDist > maxDistance) break;

      // Merge clusters
      if (minI >= 0 && minJ >= 0) {
        clusters[minI] = {
          members: [...clusters[minI].members, ...clusters[minJ].members],
          indices: [...clusters[minI].indices, ...clusters[minJ].indices]
        };
        merged[minJ] = true;
      } else {
        break;
      }
    }

    // Calculate average intra-cluster correlation
    const finalClusters = clusters
      .filter((_, i) => !merged[i])
      .map(cluster => {
        let totalCorr = 0;
        let pairCount = 0;

        for (let i = 0; i < cluster.indices.length; i++) {
          for (let j = i + 1; j < cluster.indices.length; j++) {
            const corr = 1 - distanceMatrix[cluster.indices[i]][cluster.indices[j]];
            totalCorr += corr;
            pairCount++;
          }
        }

        return {
          members: cluster.members,
          avgCorrelation: pairCount > 0
            ? Math.round((totalCorr / pairCount) * 100) / 100
            : 1.0
        };
      });

    return finalClusters;
  }

  _identifyHiddenClusterRisks(clusters, positions) {
    const risks = [];

    for (const cluster of clusters) {
      if (cluster.memberCount > 1 && cluster.combinedWeight > 30) {
        // Check if stocks in same cluster are from different sectors
        // (hidden correlation not explained by sector)
        const uniqueSectors = new Set(cluster.sectors.map(s => s.sector));
        if (uniqueSectors.size > 1 && cluster.avgIntraCorrelation > 0.6) {
          risks.push({
            type: 'hidden_correlation',
            severity: cluster.combinedWeight > 50 ? 'high' : 'medium',
            cluster: cluster.id,
            message: `Cluster ${cluster.id} (${cluster.members.join(', ')}) shows high correlation (${cluster.avgIntraCorrelation}) across different sectors. Hidden risk factor may exist.`
          });
        }
      }

      // Check for sector-based cluster that's too concentrated
      if (cluster.sectors.length === 1 && cluster.combinedWeight > 25) {
        risks.push({
          type: 'sector_concentration',
          severity: cluster.combinedWeight > 40 ? 'high' : 'medium',
          cluster: cluster.id,
          sector: cluster.sectors[0].sector,
          message: `All ${cluster.memberCount} stocks in Cluster ${cluster.id} are in ${cluster.sectors[0].sector} sector, totaling ${cluster.combinedWeight.toFixed(1)}% of portfolio.`
        });
      }
    }

    return risks;
  }

  _getClusterRecommendations(clusters, maxClusterWeight) {
    const recommendations = [];

    if (maxClusterWeight > 50) {
      recommendations.push({
        priority: 'high',
        message: 'One cluster dominates the portfolio. Consider diversifying with uncorrelated assets.'
      });
    } else if (maxClusterWeight > 35) {
      recommendations.push({
        priority: 'medium',
        message: 'Largest cluster is significant. Monitor for increased correlation during market stress.'
      });
    }

    // Check for single-stock clusters (truly uncorrelated positions)
    const singletons = clusters.filter(c => c.memberCount === 1);
    if (singletons.length === 0 && clusters.length > 0) {
      recommendations.push({
        priority: 'low',
        message: 'All positions are correlated with at least one other. Consider adding a truly uncorrelated asset class.'
      });
    }

    if (clusters.length <= 2) {
      recommendations.push({
        priority: 'medium',
        message: 'Portfolio groups into only 2 clusters. True diversification may be limited.'
      });
    }

    return recommendations;
  }
}

// Export singleton instance
module.exports = new AdvancedAnalytics();
