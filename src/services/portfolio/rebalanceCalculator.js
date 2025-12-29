// src/services/portfolio/rebalanceCalculator.js
// Rebalancing Calculator - Drift detection and trade calculation (Agent 2)

const db = require('../../database');

class RebalanceCalculator {
  constructor() {
    this.db = db.getDatabase();
    console.log('⚖️ Rebalance Calculator initialized');
  }

  // ============================================
  // Calculate Rebalance Trades
  // ============================================
  calculateRebalanceTrades(portfolioId, targetAllocation, options = {}) {
    // targetAllocation: [{ companyId or symbol, targetWeight }]
    // options: { minTradeValue, roundLots, useCurrentCash }

    const {
      minTradeValue = 100,
      roundLots = false,
      useCurrentCash = true
    } = options;

    const portfolio = this._getPortfolioData(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const currentPositions = this._getCurrentPositions(portfolioId);

    // Normalize target weights
    const totalTargetWeight = targetAllocation.reduce((sum, t) => sum + (t.targetWeight || t.weight || 0), 0);
    const normalizedTargets = targetAllocation.map(t => ({
      companyId: t.companyId || this._getCompanyId(t.symbol),
      symbol: t.symbol || this._getSymbol(t.companyId),
      targetWeight: ((t.targetWeight || t.weight || 0) / totalTargetWeight)
    }));

    // Calculate target values
    const rebalanceValue = useCurrentCash
      ? portfolio.totalValue
      : portfolio.positionsValue;

    const trades = [];
    let totalBuyValue = 0;
    let totalSellValue = 0;

    // Calculate trades for each target position
    for (const target of normalizedTargets) {
      if (!target.companyId) continue;

      const currentPos = currentPositions.find(p => p.company_id === target.companyId);
      const currentValue = currentPos ? currentPos.value : 0;
      const currentWeight = currentPos ? currentPos.weight : 0;
      const targetValue = rebalanceValue * target.targetWeight;
      const price = this._getCurrentPrice(target.companyId) ||
                   (currentPos?.last_price) ||
                   (currentPos?.average_cost);

      if (price <= 0) continue;

      const valueDiff = targetValue - currentValue;
      const weightDiff = target.targetWeight - currentWeight;

      if (Math.abs(valueDiff) < minTradeValue) continue;

      let shareDiff = valueDiff / price;
      if (roundLots) {
        shareDiff = Math.round(shareDiff / 100) * 100;
      } else {
        shareDiff = Math.floor(shareDiff);
      }

      if (shareDiff === 0) continue;

      const tradeValue = Math.abs(shareDiff * price);

      if (shareDiff > 0) {
        totalBuyValue += tradeValue;
      } else {
        totalSellValue += tradeValue;
      }

      trades.push({
        companyId: target.companyId,
        symbol: target.symbol,
        action: shareDiff > 0 ? 'buy' : 'sell',
        shares: Math.abs(shareDiff),
        estimatedPrice: price,
        estimatedValue: tradeValue,
        currentWeight: Math.round(currentWeight * 10000) / 100,
        targetWeight: Math.round(target.targetWeight * 10000) / 100,
        weightChange: Math.round(weightDiff * 10000) / 100,
        currentShares: currentPos?.shares || 0,
        newShares: (currentPos?.shares || 0) + shareDiff
      });
    }

    // Check for positions to close (not in target allocation)
    for (const pos of currentPositions) {
      const inTarget = normalizedTargets.find(t => t.companyId === pos.company_id);
      if (!inTarget && pos.shares > 0) {
        trades.push({
          companyId: pos.company_id,
          symbol: pos.symbol,
          action: 'sell',
          shares: pos.shares,
          estimatedPrice: pos.last_price,
          estimatedValue: pos.value,
          currentWeight: Math.round(pos.weight * 10000) / 100,
          targetWeight: 0,
          weightChange: -Math.round(pos.weight * 10000) / 100,
          currentShares: pos.shares,
          newShares: 0,
          reason: 'Not in target allocation'
        });
        totalSellValue += pos.value;
      }
    }

    // Sort trades: sells first, then buys
    trades.sort((a, b) => {
      if (a.action === 'sell' && b.action === 'buy') return -1;
      if (a.action === 'buy' && b.action === 'sell') return 1;
      return Math.abs(b.estimatedValue) - Math.abs(a.estimatedValue);
    });

    // Estimate costs
    const estimatedCosts = this._estimateTradingCosts(trades);

    // Check cash availability
    const cashNeeded = totalBuyValue - totalSellValue;
    const cashAvailable = portfolio.cashBalance;
    const canExecute = cashNeeded <= cashAvailable;

    return {
      portfolioId,
      currentValue: portfolio.totalValue,
      rebalanceValue,
      trades,
      summary: {
        tradesCount: trades.length,
        buyTrades: trades.filter(t => t.action === 'buy').length,
        sellTrades: trades.filter(t => t.action === 'sell').length,
        totalBuyValue: Math.round(totalBuyValue * 100) / 100,
        totalSellValue: Math.round(totalSellValue * 100) / 100,
        netCashFlow: Math.round((totalSellValue - totalBuyValue) * 100) / 100,
        cashNeeded: Math.round(cashNeeded * 100) / 100,
        cashAvailable: Math.round(cashAvailable * 100) / 100,
        canExecute
      },
      estimatedCosts,
      executionOrder: trades.map((t, i) => ({
        order: i + 1,
        symbol: t.symbol,
        action: t.action,
        shares: t.shares
      }))
    };
  }

  // ============================================
  // Check if Rebalancing is Needed
  // ============================================
  checkRebalanceNeeded(portfolioId, threshold = 5, targetAllocation = null) {
    const currentPositions = this._getCurrentPositions(portfolioId);

    if (currentPositions.length === 0) {
      return {
        needed: false,
        reason: 'No positions in portfolio',
        driftPositions: []
      };
    }

    // If no target allocation provided, use equal weight as default
    const targets = targetAllocation || currentPositions.map(p => ({
      companyId: p.company_id,
      symbol: p.symbol,
      targetWeight: 1 / currentPositions.length
    }));

    // Normalize targets
    const totalWeight = targets.reduce((sum, t) => sum + (t.targetWeight || 0), 0);
    const normalizedTargets = targets.map(t => ({
      ...t,
      targetWeight: (t.targetWeight || 0) / totalWeight
    }));

    const driftPositions = [];
    let maxDrift = 0;

    for (const target of normalizedTargets) {
      const companyId = target.companyId || this._getCompanyId(target.symbol);
      const currentPos = currentPositions.find(p => p.company_id === companyId);
      const currentWeight = currentPos ? currentPos.weight : 0;
      const drift = (currentWeight - target.targetWeight) * 100;
      const absDrift = Math.abs(drift);

      if (absDrift > threshold) {
        driftPositions.push({
          symbol: target.symbol || currentPos?.symbol,
          currentWeight: Math.round(currentWeight * 10000) / 100,
          targetWeight: Math.round(target.targetWeight * 10000) / 100,
          drift: Math.round(drift * 100) / 100,
          absDrift: Math.round(absDrift * 100) / 100,
          direction: drift > 0 ? 'overweight' : 'underweight'
        });
      }

      if (absDrift > maxDrift) {
        maxDrift = absDrift;
      }
    }

    // Check for positions not in target (100% drift)
    for (const pos of currentPositions) {
      const inTarget = normalizedTargets.find(t =>
        (t.companyId && t.companyId === pos.company_id) ||
        (t.symbol && t.symbol.toUpperCase() === pos.symbol.toUpperCase())
      );

      if (!inTarget) {
        driftPositions.push({
          symbol: pos.symbol,
          currentWeight: Math.round(pos.weight * 10000) / 100,
          targetWeight: 0,
          drift: Math.round(pos.weight * 10000) / 100,
          absDrift: Math.round(pos.weight * 10000) / 100,
          direction: 'not_in_target'
        });

        if (pos.weight * 100 > maxDrift) {
          maxDrift = pos.weight * 100;
        }
      }
    }

    // Sort by absolute drift
    driftPositions.sort((a, b) => b.absDrift - a.absDrift);

    const needed = driftPositions.length > 0;

    return {
      portfolioId,
      threshold,
      needed,
      reason: needed
        ? `${driftPositions.length} position(s) exceed ${threshold}% drift threshold`
        : 'All positions within drift threshold',
      maxDrift: Math.round(maxDrift * 100) / 100,
      driftPositions,
      summary: {
        overweight: driftPositions.filter(p => p.direction === 'overweight').length,
        underweight: driftPositions.filter(p => p.direction === 'underweight').length,
        notInTarget: driftPositions.filter(p => p.direction === 'not_in_target').length
      }
    };
  }

  // ============================================
  // Get Target Allocation Templates
  // ============================================
  getRebalanceTemplates() {
    return [
      {
        id: 'equal_weight',
        name: 'Equal Weight',
        description: 'Distribute equally across all positions',
        calculate: (positions) => positions.map(p => ({
          companyId: p.company_id,
          symbol: p.symbol,
          targetWeight: 1 / positions.length
        }))
      },
      {
        id: 'market_cap_weight',
        name: 'Market Cap Weight',
        description: 'Weight by market capitalization',
        calculate: (positions) => {
          const totalMC = positions.reduce((sum, p) => sum + (p.market_cap || 0), 0);
          return positions.map(p => ({
            companyId: p.company_id,
            symbol: p.symbol,
            targetWeight: totalMC > 0 ? (p.market_cap || 0) / totalMC : 1 / positions.length
          }));
        }
      },
      {
        id: 'risk_parity',
        name: 'Risk Parity',
        description: 'Weight inversely by volatility',
        calculate: (positions) => {
          const inverseVols = positions.map(p => 1 / (p.volatility || 20));
          const totalInverseVol = inverseVols.reduce((sum, v) => sum + v, 0);
          return positions.map((p, i) => ({
            companyId: p.company_id,
            symbol: p.symbol,
            targetWeight: inverseVols[i] / totalInverseVol
          }));
        }
      }
    ];
  }

  // ============================================
  // Apply Template
  // ============================================
  applyTemplate(portfolioId, templateId) {
    const currentPositions = this._getCurrentPositions(portfolioId);
    const template = this.getRebalanceTemplates().find(t => t.id === templateId);

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Enrich positions with data needed for templates
    const enrichedPositions = currentPositions.map(pos => {
      const company = this.db.prepare(`
        SELECT market_cap FROM companies WHERE id = ?
      `).get(pos.company_id);

      const metrics = this.db.prepare(`
        SELECT volatility_30d as volatility FROM price_metrics WHERE company_id = ?
      `).get(pos.company_id);

      return {
        ...pos,
        market_cap: company?.market_cap,
        volatility: metrics?.volatility
      };
    });

    const targetAllocation = template.calculate(enrichedPositions);

    return {
      templateId,
      templateName: template.name,
      targetAllocation: targetAllocation.map(t => ({
        symbol: t.symbol,
        targetWeight: Math.round(t.targetWeight * 10000) / 100
      })),
      trades: this.calculateRebalanceTrades(portfolioId, targetAllocation)
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
        c.symbol,
        c.name,
        pm.last_price
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

  _getCompanyId(symbol) {
    if (!symbol) return null;
    const company = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(symbol);
    return company?.id;
  }

  _getSymbol(companyId) {
    if (!companyId) return null;
    const company = this.db.prepare(`
      SELECT symbol FROM companies WHERE id = ?
    `).get(companyId);
    return company?.symbol;
  }

  _getCurrentPrice(companyId) {
    const price = this.db.prepare(`
      SELECT last_price FROM price_metrics WHERE company_id = ?
    `).get(companyId);
    return price?.last_price || 0;
  }

  _estimateTradingCosts(trades) {
    const totalValue = trades.reduce((sum, t) => sum + t.estimatedValue, 0);

    return {
      totalTurnover: Math.round(totalValue * 100) / 100,
      estimatedSpread: Math.round(totalValue * 0.001 * 100) / 100, // 0.1%
      estimatedCommission: Math.round(trades.length * 1 * 100) / 100, // $1 per trade
      totalEstimatedCost: Math.round((totalValue * 0.001 + trades.length) * 100) / 100
    };
  }
}

// Export singleton instance
module.exports = new RebalanceCalculator();
