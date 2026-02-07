// src/services/portfolio/performanceAttribution.js
// Performance Attribution - Brinson-Fachler and Factor-based attribution
// Explains WHERE portfolio returns came from

const { getDatabaseAsync } = require('../../database');

/**
 * Performance Attribution Calculator
 * Implements:
 * - Brinson-Fachler Attribution (allocation, selection, interaction effects)
 * - Factor Attribution (market, size, value, momentum, quality)
 * - Holdings-based Attribution (contribution by position)
 */
class PerformanceAttribution {
  constructor() {
    // No database initialization needed for async pattern
  }

  /**
   * Brinson-Fachler Attribution
   * Decomposes active return into:
   * - Allocation Effect: Over/underweight in outperforming sectors
   * - Selection Effect: Stock picking within sectors
   * - Interaction Effect: Combined effect
   *
   * @param {number} portfolioId - Portfolio to analyze
   * @param {string} startDate - Period start
   * @param {string} endDate - Period end
   * @param {number} benchmarkIndexId - Benchmark to compare against
   */
  async brinsonFachler(portfolioId, startDate, endDate, benchmarkIndexId = 1) {
    // Get portfolio positions at start
    const startPositions = await this._getPositionsAtDate(portfolioId, startDate);
    const endPositions = await this._getPositionsAtDate(portfolioId, endDate);

    if (startPositions.length === 0) {
      return { error: 'No positions found at start date' };
    }

    // Get benchmark sector weights and returns
    const benchmarkData = await this._getBenchmarkSectorData(benchmarkIndexId, startDate, endDate);

    // Calculate portfolio sector weights and returns
    const portfolioSectors = this._calculateSectorData(startPositions, endPositions);

    // Get total portfolio and benchmark returns
    const portfolioReturn = this._calculatePortfolioReturn(startPositions, endPositions);
    const benchmarkReturn = benchmarkData.totalReturn;

    // Calculate attribution effects by sector
    const sectorAttribution = [];
    let totalAllocation = 0;
    let totalSelection = 0;
    let totalInteraction = 0;

    const allSectors = new Set([
      ...Object.keys(portfolioSectors),
      ...Object.keys(benchmarkData.sectors),
    ]);

    for (const sector of allSectors) {
      const pWeight = portfolioSectors[sector]?.weight || 0;
      const bWeight = benchmarkData.sectors[sector]?.weight || 0;
      const pReturn = portfolioSectors[sector]?.return || 0;
      const bReturn = benchmarkData.sectors[sector]?.return || benchmarkReturn;

      // Brinson-Fachler formulas
      const allocation = (pWeight - bWeight) * (bReturn - benchmarkReturn);
      const selection = bWeight * (pReturn - bReturn);
      const interaction = (pWeight - bWeight) * (pReturn - bReturn);

      totalAllocation += allocation;
      totalSelection += selection;
      totalInteraction += interaction;

      if (pWeight > 0 || bWeight > 0) {
        sectorAttribution.push({
          sector,
          portfolioWeight: Math.round(pWeight * 10000) / 100,
          benchmarkWeight: Math.round(bWeight * 10000) / 100,
          activeWeight: Math.round((pWeight - bWeight) * 10000) / 100,
          portfolioReturn: Math.round(pReturn * 10000) / 100,
          benchmarkReturn: Math.round(bReturn * 10000) / 100,
          allocationEffect: Math.round(allocation * 10000) / 100,
          selectionEffect: Math.round(selection * 10000) / 100,
          interactionEffect: Math.round(interaction * 10000) / 100,
          totalEffect: Math.round((allocation + selection + interaction) * 10000) / 100,
        });
      }
    }

    // Sort by total effect
    sectorAttribution.sort((a, b) => b.totalEffect - a.totalEffect);

    const activeReturn = portfolioReturn - benchmarkReturn;

    return {
      period: { startDate, endDate },
      portfolioReturn: Math.round(portfolioReturn * 10000) / 100,
      benchmarkReturn: Math.round(benchmarkReturn * 10000) / 100,
      activeReturn: Math.round(activeReturn * 10000) / 100,
      attribution: {
        allocationEffect: Math.round(totalAllocation * 10000) / 100,
        selectionEffect: Math.round(totalSelection * 10000) / 100,
        interactionEffect: Math.round(totalInteraction * 10000) / 100,
        totalExplained: Math.round((totalAllocation + totalSelection + totalInteraction) * 10000) / 100,
        residual: Math.round((activeReturn - totalAllocation - totalSelection - totalInteraction) * 10000) / 100,
      },
      interpretation: this._interpretBrinson(totalAllocation, totalSelection, totalInteraction),
      sectorAttribution,
    };
  }

  /**
   * Factor Attribution
   * Decomposes returns by factor exposures
   */
  async factorAttribution(portfolioId, startDate, endDate) {
    const startPositions = await this._getPositionsAtDate(portfolioId, startDate);
    const endPositions = await this._getPositionsAtDate(portfolioId, endDate);

    if (startPositions.length === 0) {
      return { error: 'No positions found at start date' };
    }

    // Calculate portfolio return
    const portfolioReturn = this._calculatePortfolioReturn(startPositions, endPositions);

    // Get factor exposures and returns
    const factorExposures = await this._calculateFactorExposures(startPositions);
    const factorReturns = await this._getFactorReturns(startDate, endDate);

    // Calculate factor contributions
    const factorContributions = {};
    let totalFactorReturn = 0;

    for (const [factor, exposure] of Object.entries(factorExposures)) {
      const factorRet = factorReturns[factor] || 0;
      const contribution = exposure * factorRet;
      factorContributions[factor] = {
        exposure: Math.round(exposure * 100) / 100,
        factorReturn: Math.round(factorRet * 10000) / 100,
        contribution: Math.round(contribution * 10000) / 100,
      };
      totalFactorReturn += contribution;
    }

    // Alpha is the residual
    const alpha = portfolioReturn - totalFactorReturn;

    return {
      period: { startDate, endDate },
      portfolioReturn: Math.round(portfolioReturn * 10000) / 100,
      factorContributions,
      summary: {
        marketContribution: factorContributions.market?.contribution || 0,
        sizeContribution: factorContributions.size?.contribution || 0,
        valueContribution: factorContributions.value?.contribution || 0,
        momentumContribution: factorContributions.momentum?.contribution || 0,
        qualityContribution: factorContributions.quality?.contribution || 0,
        totalFactorReturn: Math.round(totalFactorReturn * 10000) / 100,
        alpha: Math.round(alpha * 10000) / 100,
      },
      interpretation: this._interpretFactors(factorContributions, alpha),
    };
  }

  /**
   * Holdings-based Attribution
   * Shows contribution of each position to total return
   */
  async holdingsAttribution(portfolioId, startDate, endDate) {
    const startPositions = await this._getPositionsAtDate(portfolioId, startDate);
    const endPositions = await this._getPositionsAtDate(portfolioId, endDate);

    if (startPositions.length === 0) {
      return { error: 'No positions found at start date' };
    }

    const totalStartValue = startPositions.reduce((sum, p) => sum + (p.value || 0), 0);
    const contributions = [];

    for (const startPos of startPositions) {
      const endPos = endPositions.find(p => p.company_id === startPos.company_id);

      const startValue = startPos.value || 0;
      const endValue = endPos?.value || 0;
      const weight = totalStartValue > 0 ? startValue / totalStartValue : 0;

      // Get price change
      const startPrice = startPos.price || 0;
      const endPrice = endPos?.price || startPrice;
      const priceReturn = startPrice > 0 ? (endPrice - startPrice) / startPrice : 0;

      // Contribution = weight × return
      const contribution = weight * priceReturn;

      contributions.push({
        symbol: startPos.symbol,
        sector: startPos.sector || 'Unknown',
        startWeight: Math.round(weight * 10000) / 100,
        priceReturn: Math.round(priceReturn * 10000) / 100,
        contribution: Math.round(contribution * 10000) / 100,
        startValue: Math.round(startValue * 100) / 100,
        endValue: Math.round(endValue * 100) / 100,
        pnl: Math.round((endValue - startValue) * 100) / 100,
      });
    }

    // Sort by contribution (best to worst)
    contributions.sort((a, b) => b.contribution - a.contribution);

    const totalReturn = contributions.reduce((sum, c) => sum + c.contribution, 0);

    return {
      period: { startDate, endDate },
      totalReturn: Math.round(totalReturn * 100) / 100,
      positionCount: contributions.length,
      topContributors: contributions.slice(0, 5),
      bottomContributors: contributions.slice(-5).reverse(),
      allPositions: contributions,
      summary: {
        winnersCount: contributions.filter(c => c.contribution > 0).length,
        losersCount: contributions.filter(c => c.contribution < 0).length,
        hitRate: Math.round(contributions.filter(c => c.contribution > 0).length / contributions.length * 100),
        avgWinnerContribution: this._avg(contributions.filter(c => c.contribution > 0).map(c => c.contribution)),
        avgLoserContribution: this._avg(contributions.filter(c => c.contribution < 0).map(c => c.contribution)),
      },
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  async _getPositionsAtDate(portfolioId, date) {
    const database = await getDatabaseAsync();

    // Try to get from snapshot first
    const snapshotResult = await database.query(`
      SELECT ps.*, c.symbol, c.sector
      FROM portfolio_position_snapshots ps
      JOIN companies c ON ps.company_id = c.id
      WHERE ps.portfolio_id = $1 AND ps.snapshot_date <= $2
      ORDER BY ps.snapshot_date DESC
    `, [portfolioId, date]);
    const snapshot = snapshotResult.rows;

    if (snapshot.length > 0) {
      return snapshot.map(s => ({
        company_id: s.company_id,
        symbol: s.symbol,
        sector: s.sector,
        shares: s.shares,
        value: s.market_value,
        price: s.price,
      }));
    }

    // Fall back to current positions with historical prices
    const positionsResult = await database.query(`
      SELECT pp.*, c.symbol, c.sector
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);
    const positions = positionsResult.rows;

    // Get prices at date
    const result = [];
    for (const pos of positions) {
      const priceRowResult = await database.query(`
        SELECT close as price FROM daily_prices
        WHERE company_id = $1 AND date <= $2
        ORDER BY date DESC LIMIT 1
      `, [pos.company_id, date]);
      const priceRow = priceRowResult.rows[0];

      if (priceRow) {
        result.push({
          company_id: pos.company_id,
          symbol: pos.symbol,
          sector: pos.sector,
          shares: pos.shares,
          price: priceRow.price,
          value: pos.shares * priceRow.price,
        });
      }
    }

    return result;
  }

  async _getBenchmarkSectorData(benchmarkIndexId, startDate, endDate) {
    const database = await getDatabaseAsync();

    // Get benchmark prices
    const startPriceResult = await database.query(`
      SELECT close FROM market_index_prices
      WHERE index_id = $1 AND date <= $2
      ORDER BY date DESC LIMIT 1
    `, [benchmarkIndexId, startDate]);
    const startPrice = startPriceResult.rows[0];

    const endPriceResult = await database.query(`
      SELECT close FROM market_index_prices
      WHERE index_id = $1 AND date <= $2
      ORDER BY date DESC LIMIT 1
    `, [benchmarkIndexId, endDate]);
    const endPrice = endPriceResult.rows[0];

    const totalReturn = startPrice && endPrice
      ? (endPrice.close - startPrice.close) / startPrice.close
      : 0;

    // Approximate sector weights for S&P 500
    // In production, would fetch from index composition data
    const sectors = {
      'Technology': { weight: 0.28, return: totalReturn * 1.1 },
      'Healthcare': { weight: 0.13, return: totalReturn * 0.9 },
      'Financials': { weight: 0.12, return: totalReturn * 1.0 },
      'Consumer Discretionary': { weight: 0.11, return: totalReturn * 1.05 },
      'Communication Services': { weight: 0.09, return: totalReturn * 0.95 },
      'Industrials': { weight: 0.08, return: totalReturn * 1.0 },
      'Consumer Staples': { weight: 0.06, return: totalReturn * 0.85 },
      'Energy': { weight: 0.05, return: totalReturn * 1.2 },
      'Utilities': { weight: 0.03, return: totalReturn * 0.7 },
      'Real Estate': { weight: 0.03, return: totalReturn * 0.8 },
      'Materials': { weight: 0.02, return: totalReturn * 1.0 },
    };

    return { totalReturn, sectors };
  }

  _calculateSectorData(startPositions, endPositions) {
    const sectors = {};
    const totalStartValue = startPositions.reduce((sum, p) => sum + (p.value || 0), 0);

    for (const startPos of startPositions) {
      const sector = startPos.sector || 'Unknown';
      const endPos = endPositions.find(p => p.company_id === startPos.company_id);

      const startValue = startPos.value || 0;
      const endValue = endPos?.value || 0;
      const posReturn = startValue > 0 ? (endValue - startValue) / startValue : 0;
      const weight = totalStartValue > 0 ? startValue / totalStartValue : 0;

      if (!sectors[sector]) {
        sectors[sector] = { weight: 0, totalReturn: 0, totalWeight: 0 };
      }

      sectors[sector].weight += weight;
      sectors[sector].totalReturn += posReturn * weight;
      sectors[sector].totalWeight += weight;
    }

    // Calculate weighted average return per sector
    for (const sector of Object.keys(sectors)) {
      if (sectors[sector].totalWeight > 0) {
        sectors[sector].return = sectors[sector].totalReturn / sectors[sector].totalWeight;
      } else {
        sectors[sector].return = 0;
      }
    }

    return sectors;
  }

  _calculatePortfolioReturn(startPositions, endPositions) {
    const totalStartValue = startPositions.reduce((sum, p) => sum + (p.value || 0), 0);
    let totalEndValue = 0;

    for (const startPos of startPositions) {
      const endPos = endPositions.find(p => p.company_id === startPos.company_id);
      totalEndValue += endPos?.value || 0;
    }

    return totalStartValue > 0 ? (totalEndValue - totalStartValue) / totalStartValue : 0;
  }

  async _calculateFactorExposures(positions) {
    const database = await getDatabaseAsync();

    // Calculate portfolio factor exposures
    const totalValue = positions.reduce((sum, p) => sum + (p.value || 0), 0);

    const marketExposure = 1.0; // Beta to market
    let sizeExposure = 0;     // Small vs Large (negative = large cap)
    let valueExposure = 0;    // Value vs Growth
    let momentumExposure = 0; // High vs Low momentum
    let qualityExposure = 0;  // High vs Low quality

    for (const pos of positions) {
      const weight = totalValue > 0 ? (pos.value || 0) / totalValue : 0;

      // Get company metrics
      const metricsResult = await database.query(`
        SELECT * FROM calculated_metrics
        WHERE company_id = $1
        ORDER BY fiscal_period DESC LIMIT 1
      `, [pos.company_id]);
      const metrics = metricsResult.rows[0];

      const companyResult = await database.query(`
        SELECT market_cap FROM companies WHERE id = $1
      `, [pos.company_id]);
      const company = companyResult.rows[0];

      // Size factor (log market cap, normalized)
      if (company?.market_cap) {
        const logCap = Math.log10(company.market_cap);
        // Normalize: <10B = small (+1), >100B = large (-1)
        sizeExposure += weight * Math.max(-1, Math.min(1, (11 - logCap) / 2));
      }

      // Value factor (P/E based)
      if (metrics?.pe_ratio) {
        // Low P/E = value (+1), High P/E = growth (-1)
        valueExposure += weight * Math.max(-1, Math.min(1, (20 - metrics.pe_ratio) / 20));
      }

      // Quality factor (ROE based)
      if (metrics?.roe) {
        qualityExposure += weight * Math.max(-1, Math.min(1, (metrics.roe - 15) / 15));
      }

      // Momentum would need price data - simplified here
      const priceMetricsResult = await database.query(`
        SELECT change_6m FROM price_metrics WHERE company_id = $1
      `, [pos.company_id]);
      const priceMetrics = priceMetricsResult.rows[0];

      if (priceMetrics?.change_6m) {
        momentumExposure += weight * Math.max(-1, Math.min(1, priceMetrics.change_6m / 30));
      }
    }

    return {
      market: marketExposure,
      size: Math.round(sizeExposure * 100) / 100,
      value: Math.round(valueExposure * 100) / 100,
      momentum: Math.round(momentumExposure * 100) / 100,
      quality: Math.round(qualityExposure * 100) / 100,
    };
  }

  async _getFactorReturns(startDate, endDate) {
    const database = await getDatabaseAsync();

    // Get market return
    const marketStartResult = await database.query(`
      SELECT close FROM market_index_prices
      WHERE index_id = 1 AND date <= $1 ORDER BY date DESC LIMIT 1
    `, [startDate]);
    const marketStart = marketStartResult.rows[0];

    const marketEndResult = await database.query(`
      SELECT close FROM market_index_prices
      WHERE index_id = 1 AND date <= $1 ORDER BY date DESC LIMIT 1
    `, [endDate]);
    const marketEnd = marketEndResult.rows[0];

    const marketReturn = marketStart && marketEnd
      ? (marketEnd.close - marketStart.close) / marketStart.close
      : 0;

    // Approximate factor returns (in production, would use factor ETF data)
    // These are simplified estimates based on typical factor premiums
    return {
      market: marketReturn,
      size: marketReturn * 0.02,      // Small cap premium ~2% of market
      value: marketReturn * 0.01,     // Value premium ~1% of market
      momentum: marketReturn * 0.015, // Momentum premium ~1.5%
      quality: marketReturn * 0.01,   // Quality premium ~1%
    };
  }

  _interpretBrinson(allocation, selection, interaction) {
    const effects = [];

    if (allocation > 0.001) {
      effects.push('Good sector allocation added value');
    } else if (allocation < -0.001) {
      effects.push('Poor sector allocation detracted value');
    }

    if (selection > 0.001) {
      effects.push('Stock selection within sectors added value');
    } else if (selection < -0.001) {
      effects.push('Stock selection within sectors detracted value');
    }

    if (effects.length === 0) {
      effects.push('Attribution effects were minimal');
    }

    return effects.join('. ') + '.';
  }

  _interpretFactors(factorContributions, alpha) {
    const insights = [];

    if (factorContributions.market?.contribution > 0) {
      insights.push(`Market exposure contributed ${factorContributions.market.contribution}%`);
    }

    const significantFactors = Object.entries(factorContributions)
      .filter(([f, d]) => f !== 'market' && Math.abs(d.contribution) > 0.5)
      .sort((a, b) => Math.abs(b[1].contribution) - Math.abs(a[1].contribution));

    for (const [factor, data] of significantFactors.slice(0, 2)) {
      const direction = data.contribution > 0 ? 'added' : 'detracted';
      insights.push(`${factor} factor ${direction} ${Math.abs(data.contribution).toFixed(1)}%`);
    }

    if (alpha > 0.5) {
      insights.push(`Generated ${alpha.toFixed(1)}% alpha (stock-specific returns)`);
    } else if (alpha < -0.5) {
      insights.push(`Lost ${Math.abs(alpha).toFixed(1)}% to negative alpha`);
    }

    return insights.join('. ') + '.';
  }

  _avg(arr) {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 100) / 100;
  }
}

module.exports = { PerformanceAttribution };
