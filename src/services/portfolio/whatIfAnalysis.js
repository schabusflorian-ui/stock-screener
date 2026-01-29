// src/services/portfolio/whatIfAnalysis.js
// What-If Analysis - Simulate portfolio changes without executing (Agent 2)

const db = require('../../database');

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.05;

class WhatIfAnalysis {
  constructor() {
    this.db = db.getDatabase();
    console.log('🔮 What-If Analysis Engine initialized');
  }

  // ============================================
  // Simulate Portfolio Changes
  // ============================================
  simulateChange(portfolioId, changes) {
    // changes: [{ companyId, action: 'add'|'remove'|'adjust', shares, weight, symbol }]

    const portfolio = this._getPortfolioData(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Current state
    const currentPositions = this._getCurrentPositions(portfolioId);
    const currentMetrics = this._calculateMetrics(currentPositions);

    // Apply changes
    const newPositions = this._applyChanges(currentPositions, changes, portfolio.totalValue);

    // Calculate new metrics
    const newMetrics = this._calculateMetrics(newPositions);

    // Calculate impact
    const impact = this._calculateImpact(currentMetrics, newMetrics);

    // Calculate allocation changes
    const allocationChanges = this._getAllocationChanges(currentPositions, newPositions);

    return {
      portfolioId,
      changes,
      current: {
        positions: currentPositions.map(p => ({
          symbol: p.symbol,
          shares: p.shares,
          value: p.value,
          weight: p.weight
        })),
        metrics: currentMetrics
      },
      simulated: {
        positions: newPositions.map(p => ({
          symbol: p.symbol,
          shares: p.shares,
          value: p.value,
          weight: p.weight,
          change: p.change
        })),
        metrics: newMetrics
      },
      impact,
      allocationChanges,
      tradesToExecute: this._getTradesToExecute(currentPositions, newPositions),
      estimatedCost: this._estimateTradingCosts(currentPositions, newPositions)
    };
  }

  // ============================================
  // Simulate Weight Changes
  // ============================================
  simulateWeightChange(portfolioId, targetWeights) {
    // targetWeights: [{ symbol, weight }] or [{ companyId, weight }]

    const portfolio = this._getPortfolioData(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Convert target weights to changes
    const currentPositions = this._getCurrentPositions(portfolioId);
    const changes = [];

    for (const target of targetWeights) {
      const symbol = target.symbol || this._getSymbol(target.companyId);
      const companyId = target.companyId || this._getCompanyId(target.symbol);

      if (!companyId) continue;

      const currentPos = currentPositions.find(p => p.company_id === companyId);
      const targetValue = portfolio.totalValue * (target.weight / 100);
      const price = this._getCurrentPrice(companyId);
      const targetShares = price > 0 ? Math.floor(targetValue / price) : 0;

      if (!currentPos) {
        changes.push({
          companyId,
          symbol,
          action: 'add',
          shares: targetShares
        });
      } else if (targetShares > currentPos.shares) {
        changes.push({
          companyId,
          symbol,
          action: 'adjust',
          shares: targetShares
        });
      } else if (targetShares < currentPos.shares) {
        changes.push({
          companyId,
          symbol,
          action: 'adjust',
          shares: targetShares
        });
      }
    }

    return this.simulateChange(portfolioId, changes);
  }

  // ============================================
  // Compare Scenarios
  // ============================================
  compareScenarios(portfolioId, scenarios) {
    // scenarios: [{ name, changes: [...] }]

    const results = [];

    for (const scenario of scenarios) {
      try {
        const result = this.simulateChange(portfolioId, scenario.changes);
        results.push({
          name: scenario.name,
          success: true,
          metrics: result.simulated.metrics,
          impact: result.impact
        });
      } catch (error) {
        results.push({
          name: scenario.name,
          success: false,
          error: error.message
        });
      }
    }

    // Rank by Sharpe ratio improvement
    const ranked = results
      .filter(r => r.success)
      .sort((a, b) => (b.impact?.sharpeChange || 0) - (a.impact?.sharpeChange || 0));

    return {
      portfolioId,
      scenarios: results,
      bestScenario: ranked.length > 0 ? ranked[0].name : null,
      ranking: ranked.map((r, i) => ({
        rank: i + 1,
        name: r.name,
        sharpeImprovement: r.impact?.sharpeChange
      }))
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  _getPortfolioData(portfolioId) {
    const portfolio = this.db.prepare(`
      SELECT * FROM portfolios WHERE id = ?
    `).get(portfolioId);

    if (!portfolio) return null;

    const positions = this.db.prepare(`
      SELECT pp.*, pm.last_price
      FROM portfolio_positions pp
      LEFT JOIN price_metrics pm ON pp.company_id = pm.company_id
      WHERE pp.portfolio_id = ?
    `).all(portfolioId);

    const positionsValue = positions.reduce((sum, p) =>
      sum + p.shares * (p.last_price || p.average_cost), 0);

    return {
      ...portfolio,
      cashBalance: portfolio.current_cash || 0,
      positionsValue,
      totalValue: (portfolio.current_cash || 0) + positionsValue
    };
  }

  _getCurrentPositions(portfolioId) {
    const positions = this.db.prepare(`
      SELECT
        pp.company_id,
        pp.shares,
        pp.average_cost,
        pp.cost_basis,
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.volatility_30d as volatility,
        pm.beta
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = ?
    `).all(portfolioId);

    const totalValue = positions.reduce((sum, p) =>
      sum + p.shares * (p.last_price || p.average_cost), 0);

    return positions.map(p => ({
      ...p,
      value: p.shares * (p.last_price || p.average_cost),
      weight: totalValue > 0 ? (p.shares * (p.last_price || p.average_cost)) / totalValue : 0
    }));
  }

  _applyChanges(currentPositions, changes, totalValue) {
    const newPositions = currentPositions.map(p => ({ ...p, change: 'unchanged' }));

    for (const change of changes) {
      const companyId = change.companyId || this._getCompanyId(change.symbol);
      if (!companyId) continue;

      const existingIdx = newPositions.findIndex(p => p.company_id === companyId);

      switch (change.action) {
        case 'add':
          if (existingIdx >= 0) {
            // Increase existing position
            const pos = newPositions[existingIdx];
            const addShares = change.shares || this._calculateSharesForWeight(companyId, change.weight, totalValue);
            pos.shares += addShares;
            pos.value = pos.shares * (pos.last_price || pos.average_cost);
            pos.change = 'increased';
          } else {
            // New position
            const company = this._getCompanyData(companyId);
            const price = this._getCurrentPrice(companyId);
            const shares = change.shares || this._calculateSharesForWeight(companyId, change.weight, totalValue);
            newPositions.push({
              company_id: companyId,
              symbol: company.symbol,
              name: company.name,
              sector: company.sector,
              shares,
              last_price: price,
              volatility: company.volatility,
              beta: company.beta,
              value: shares * price,
              weight: 0, // Will be recalculated
              change: 'added'
            });
          }
          break;

        case 'remove':
          if (existingIdx >= 0) {
            newPositions[existingIdx].change = 'removed';
            newPositions[existingIdx].shares = 0;
            newPositions[existingIdx].value = 0;
          }
          break;

        case 'adjust':
          if (existingIdx >= 0) {
            const pos = newPositions[existingIdx];
            const newShares = change.shares !== undefined
              ? change.shares
              : this._calculateSharesForWeight(companyId, change.weight, totalValue);
            pos.change = newShares > pos.shares ? 'increased' : newShares < pos.shares ? 'decreased' : 'unchanged';
            pos.shares = newShares;
            pos.value = pos.shares * (pos.last_price || pos.average_cost);
          }
          break;
      }
    }

    // Filter out removed positions and recalculate weights
    const activePositions = newPositions.filter(p => p.shares > 0);
    const newTotalValue = activePositions.reduce((sum, p) => sum + p.value, 0);

    return activePositions.map(p => ({
      ...p,
      weight: newTotalValue > 0 ? p.value / newTotalValue : 0
    }));
  }

  _calculateMetrics(positions) {
    if (positions.length === 0) {
      return {
        positionCount: 0,
        totalValue: 0,
        weightedVolatility: 0,
        weightedBeta: 1,
        concentration: 0,
        estimatedSharpe: null
      };
    }

    const totalValue = positions.reduce((sum, p) => sum + p.value, 0);

    // Weighted volatility
    let weightedVol = 0;
    let volCount = 0;
    for (const pos of positions) {
      if (pos.volatility) {
        weightedVol += pos.volatility * pos.weight;
        volCount++;
      }
    }

    // Weighted beta
    let weightedBeta = 0;
    let betaCount = 0;
    for (const pos of positions) {
      if (pos.beta) {
        weightedBeta += pos.beta * pos.weight;
        betaCount++;
      }
    }

    // Concentration (HHI)
    const hhi = positions.reduce((sum, p) => sum + Math.pow(p.weight, 2), 0);

    // Estimated Sharpe (simplified)
    const estimatedReturn = 0.10; // Assume 10% market return
    const annualizedVol = weightedVol > 0 ? weightedVol / 100 : 0.20;
    const estimatedSharpe = annualizedVol > 0
      ? (estimatedReturn - RISK_FREE_RATE) / annualizedVol
      : null;

    return {
      positionCount: positions.length,
      totalValue,
      weightedVolatility: Math.round(weightedVol * 100) / 100,
      weightedBeta: betaCount > 0 ? Math.round(weightedBeta * 100) / 100 : 1,
      concentration: Math.round(hhi * 10000) / 100,
      estimatedSharpe: estimatedSharpe !== null ? Math.round(estimatedSharpe * 100) / 100 : null
    };
  }

  _calculateImpact(current, simulated) {
    return {
      positionCountChange: simulated.positionCount - current.positionCount,
      valueChange: simulated.totalValue - current.totalValue,
      valueChangePct: current.totalValue > 0
        ? ((simulated.totalValue - current.totalValue) / current.totalValue) * 100
        : 0,
      volatilityChange: simulated.weightedVolatility - current.weightedVolatility,
      betaChange: simulated.weightedBeta - current.weightedBeta,
      concentrationChange: simulated.concentration - current.concentration,
      sharpeChange: simulated.estimatedSharpe !== null && current.estimatedSharpe !== null
        ? simulated.estimatedSharpe - current.estimatedSharpe
        : null,
      riskImpact: this._assessRiskImpact(current, simulated)
    };
  }

  _assessRiskImpact(current, simulated) {
    const volChange = simulated.weightedVolatility - current.weightedVolatility;
    const betaChange = simulated.weightedBeta - current.weightedBeta;
    const concChange = simulated.concentration - current.concentration;

    let score = 0;
    if (volChange > 5) score -= 1;
    else if (volChange < -5) score += 1;

    if (betaChange > 0.1) score -= 1;
    else if (betaChange < -0.1) score += 1;

    if (concChange > 5) score -= 1;
    else if (concChange < -5) score += 1;

    if (score >= 2) return { level: 'decreased', description: 'Risk decreased' };
    if (score <= -2) return { level: 'increased', description: 'Risk increased' };
    return { level: 'unchanged', description: 'Risk relatively unchanged' };
  }

  _getAllocationChanges(current, simulated) {
    const changes = [];

    for (const pos of simulated) {
      const currentPos = current.find(p => p.company_id === pos.company_id);
      if (pos.change !== 'unchanged') {
        changes.push({
          symbol: pos.symbol,
          action: pos.change,
          previousWeight: currentPos ? Math.round(currentPos.weight * 10000) / 100 : 0,
          newWeight: Math.round(pos.weight * 10000) / 100,
          weightChange: Math.round((pos.weight - (currentPos?.weight || 0)) * 10000) / 100
        });
      }
    }

    // Check for removed positions
    for (const pos of current) {
      if (!simulated.find(p => p.company_id === pos.company_id)) {
        changes.push({
          symbol: pos.symbol,
          action: 'removed',
          previousWeight: Math.round(pos.weight * 10000) / 100,
          newWeight: 0,
          weightChange: -Math.round(pos.weight * 10000) / 100
        });
      }
    }

    return changes.sort((a, b) => Math.abs(b.weightChange) - Math.abs(a.weightChange));
  }

  _getTradesToExecute(current, simulated) {
    const trades = [];

    for (const newPos of simulated) {
      const currentPos = current.find(p => p.company_id === newPos.company_id);
      const shareDiff = newPos.shares - (currentPos?.shares || 0);

      if (shareDiff !== 0) {
        const price = newPos.last_price || 0;
        trades.push({
          symbol: newPos.symbol,
          action: shareDiff > 0 ? 'buy' : 'sell',
          shares: Math.abs(shareDiff),
          estimatedValue: Math.abs(shareDiff) * price,
          price
        });
      }
    }

    // Add sells for removed positions
    for (const pos of current) {
      if (!simulated.find(p => p.company_id === pos.company_id)) {
        trades.push({
          symbol: pos.symbol,
          action: 'sell',
          shares: pos.shares,
          estimatedValue: pos.value,
          price: pos.last_price
        });
      }
    }

    return trades;
  }

  _estimateTradingCosts(current, simulated) {
    const trades = this._getTradesToExecute(current, simulated);
    const totalTurnover = trades.reduce((sum, t) => sum + t.estimatedValue, 0);

    // Estimate costs (spread + commission)
    const estimatedSpread = totalTurnover * 0.001; // 0.1% spread
    const estimatedCommission = trades.length * 1; // $1 per trade

    return {
      totalTurnover,
      estimatedSpread: Math.round(estimatedSpread * 100) / 100,
      estimatedCommission: Math.round(estimatedCommission * 100) / 100,
      totalEstimatedCost: Math.round((estimatedSpread + estimatedCommission) * 100) / 100,
      tradesRequired: trades.length
    };
  }

  _getCompanyId(symbol) {
    const company = this.db.prepare(`
      SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
    `).get(symbol);
    return company?.id;
  }

  _getSymbol(companyId) {
    const company = this.db.prepare(`
      SELECT symbol FROM companies WHERE id = ?
    `).get(companyId);
    return company?.symbol;
  }

  _getCompanyData(companyId) {
    return this.db.prepare(`
      SELECT c.*, pm.volatility_30d as volatility, pm.beta
      FROM companies c
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE c.id = ?
    `).get(companyId) || {};
  }

  _getCurrentPrice(companyId) {
    const price = this.db.prepare(`
      SELECT last_price FROM price_metrics WHERE company_id = ?
    `).get(companyId);
    return price?.last_price || 0;
  }

  _calculateSharesForWeight(companyId, weight, totalValue) {
    const price = this._getCurrentPrice(companyId);
    if (price <= 0 || !weight) return 0;
    const targetValue = totalValue * (weight / 100);
    return Math.floor(targetValue / price);
  }
}

// Export singleton instance
module.exports = new WhatIfAnalysis();
