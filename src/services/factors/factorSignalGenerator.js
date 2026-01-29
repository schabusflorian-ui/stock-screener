// src/services/factors/factorSignalGenerator.js
// Factor Signal Generator - Generates actionable buy/sell signals from factor analysis

/**
 * FactorSignalGenerator
 *
 * Generates current trading signals based on factor scores:
 * - User specifies factor weights
 * - Engine calculates combined scores for all stocks
 * - Returns top N buy signals and bottom N sell signals
 * - Includes factor breakdown for each signal
 */
class FactorSignalGenerator {
  constructor(db, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this.options = {
      defaultTopN: 10,
      defaultMinMarketCap: 1e9,
      ...options
    };

    this._prepareStatements();
  }

  _prepareStatements() {
    // Get most recent factor scores
    this.stmtGetLatestScores = this.db.prepare(`
      SELECT
        sfs.symbol,
        sfs.company_id,
        sfs.score_date,
        sfs.value_percentile,
        sfs.quality_percentile,
        sfs.momentum_percentile,
        sfs.growth_percentile,
        sfs.size_percentile,
        sfs.volatility_score as volatility_percentile,
        c.name,
        c.sector,
        c.industry,
        c.market_cap
      FROM stock_factor_scores sfs
      JOIN companies c ON sfs.company_id = c.id
      WHERE sfs.score_date = (
        SELECT MAX(score_date) FROM stock_factor_scores WHERE score_date <= date('now')
      )
      AND c.market_cap >= ?
      AND c.symbol IS NOT NULL
      AND c.symbol NOT LIKE 'CIK%'
    `);

    // Get current price
    this.stmtGetCurrentPrice = this.db.prepare(`
      SELECT dp.close, dp.date
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE LOWER(c.symbol) = LOWER(?)
      ORDER BY dp.date DESC
      LIMIT 1
    `);

    // Get price change (momentum)
    this.stmtGetPriceChange = this.db.prepare(`
      SELECT
        (SELECT close FROM daily_prices dp
         JOIN companies c ON dp.company_id = c.id
         WHERE LOWER(c.symbol) = LOWER(?)
         ORDER BY dp.date DESC LIMIT 1) as current_price,
        (SELECT close FROM daily_prices dp
         JOIN companies c ON dp.company_id = c.id
         WHERE LOWER(c.symbol) = LOWER(?)
         AND dp.date <= date('now', '-30 days')
         ORDER BY dp.date DESC LIMIT 1) as price_30d_ago
    `);
  }

  /**
   * Generate trading signals based on factor weights
   *
   * @param {Object} factorWeights - { value: 0.4, quality: 0.3, ... }
   * @param {Object} options - Configuration options
   * @returns {Object} Buy and sell signals with factor breakdowns
   */
  async generateSignals(factorWeights, options = {}) {
    const {
      topN = this.options.defaultTopN,
      minMarketCap = this.options.defaultMinMarketCap,
      sectors = null, // Filter by sectors
      excludeSymbols = [] // Symbols to exclude (e.g., current holdings)
    } = options;

    console.log('\n' + '='.repeat(50));
    console.log('🎯 GENERATING FACTOR SIGNALS');
    console.log('='.repeat(50));
    console.log('Factor Weights:', factorWeights);

    // Normalize weights
    const normalizedWeights = this._normalizeWeights(factorWeights);

    // Get latest factor scores
    const scores = this.stmtGetLatestScores.all(minMarketCap);

    if (scores.length === 0) {
      return {
        success: false,
        error: 'No factor scores available',
        generatedAt: new Date().toISOString()
      };
    }

    console.log(`Found ${scores.length} stocks with factor scores`);
    console.log(`Score date: ${scores[0]?.score_date}`);

    // Filter and calculate combined scores
    const rankedStocks = scores
      .filter(stock => {
        if (excludeSymbols.includes(stock.symbol)) return false;
        if (sectors && sectors.length > 0 && !sectors.includes(stock.sector)) return false;
        return true;
      })
      .map(stock => this._calculateCombinedScore(stock, normalizedWeights))
      .sort((a, b) => b.combinedScore - a.combinedScore);

    // Get top N (buy signals)
    const buySignals = rankedStocks.slice(0, topN).map((stock, rank) => ({
      rank: rank + 1,
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      marketCap: stock.marketCap,
      combinedScore: Math.round(stock.combinedScore * 10) / 10,
      signal: 'BUY',
      strength: this._getSignalStrength(stock.combinedScore),
      factorScores: stock.factorScores,
      priceInfo: this._getPriceInfo(stock.symbol)
    }));

    // Get bottom N (sell signals / avoid)
    const sellSignals = rankedStocks.slice(-topN).reverse().map((stock, rank) => ({
      rank: rank + 1,
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      marketCap: stock.marketCap,
      combinedScore: Math.round(stock.combinedScore * 10) / 10,
      signal: 'AVOID',
      strength: this._getSignalStrength(100 - stock.combinedScore),
      factorScores: stock.factorScores,
      priceInfo: this._getPriceInfo(stock.symbol)
    }));

    // Calculate sector distribution of buy signals
    const sectorDistribution = this._calculateSectorDistribution(buySignals);

    // Generate summary insights
    const insights = this._generateInsights(buySignals, normalizedWeights);

    const result = {
      success: true,
      generatedAt: new Date().toISOString(),
      scoreDate: scores[0]?.score_date,
      factorWeights: normalizedWeights,
      universeSize: rankedStocks.length,
      buySignals,
      sellSignals,
      sectorDistribution,
      insights,
      methodology: this._getMethodologyDescription(normalizedWeights)
    };

    this._printSummary(result);

    return result;
  }

  /**
   * Get signals for a specific stock
   */
  async getStockSignal(symbol, factorWeights) {
    const normalizedWeights = this._normalizeWeights(factorWeights);

    // Get factor scores for this stock
    const scores = this.stmtGetLatestScores.all(0);
    const stock = scores.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());

    if (!stock) {
      return {
        success: false,
        error: `No factor scores found for ${symbol}`
      };
    }

    const scored = this._calculateCombinedScore(stock, normalizedWeights);

    // Calculate percentile rank among all stocks
    const allScores = scores.map(s => this._calculateCombinedScore(s, normalizedWeights).combinedScore);
    allScores.sort((a, b) => a - b);
    const rank = allScores.findIndex(s => s >= scored.combinedScore);
    const percentileRank = Math.round((rank / allScores.length) * 100);

    return {
      success: true,
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      combinedScore: Math.round(scored.combinedScore * 10) / 10,
      percentileRank,
      signal: percentileRank >= 80 ? 'BUY' : percentileRank <= 20 ? 'AVOID' : 'HOLD',
      strength: this._getSignalStrength(scored.combinedScore),
      factorScores: scored.factorScores,
      factorWeights: normalizedWeights,
      priceInfo: this._getPriceInfo(symbol),
      scoreDate: stock.score_date
    };
  }

  /**
   * Normalize factor weights to sum to 1
   */
  _normalizeWeights(weights) {
    const factors = ['value', 'quality', 'momentum', 'growth', 'size', 'volatility'];
    const normalized = {};

    let sum = 0;
    for (const factor of factors) {
      const weight = weights[factor] || 0;
      normalized[factor] = Math.max(0, weight);
      sum += normalized[factor];
    }

    if (sum === 0) {
      // Default to equal weight
      for (const factor of factors) {
        normalized[factor] = 1 / factors.length;
      }
    } else {
      for (const factor of factors) {
        normalized[factor] = normalized[factor] / sum;
      }
    }

    return normalized;
  }

  /**
   * Calculate combined factor score for a stock
   */
  _calculateCombinedScore(stock, weights) {
    const factorScores = {
      value: stock.value_percentile || 50,
      quality: stock.quality_percentile || 50,
      momentum: stock.momentum_percentile || 50,
      growth: stock.growth_percentile || 50,
      size: stock.size_percentile || 50,
      volatility: 100 - (stock.volatility_percentile || 50) // Lower volatility is better
    };

    const combinedScore =
      weights.value * factorScores.value +
      weights.quality * factorScores.quality +
      weights.momentum * factorScores.momentum +
      weights.growth * factorScores.growth +
      weights.size * factorScores.size +
      weights.volatility * factorScores.volatility;

    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      marketCap: stock.market_cap,
      combinedScore,
      factorScores
    };
  }

  /**
   * Get signal strength label
   */
  _getSignalStrength(score) {
    if (score >= 85) return 'Very Strong';
    if (score >= 70) return 'Strong';
    if (score >= 55) return 'Moderate';
    if (score >= 40) return 'Weak';
    return 'Very Weak';
  }

  /**
   * Get current price info for a symbol
   */
  _getPriceInfo(symbol) {
    try {
      const priceData = this.stmtGetCurrentPrice.get(symbol);
      const changeData = this.stmtGetPriceChange.get(symbol, symbol);

      if (!priceData) return null;

      const change30d = changeData?.price_30d_ago
        ? ((priceData.close - changeData.price_30d_ago) / changeData.price_30d_ago) * 100
        : null;

      return {
        price: priceData.close,
        date: priceData.date,
        change30d: change30d ? Math.round(change30d * 10) / 10 : null
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Calculate sector distribution
   */
  _calculateSectorDistribution(signals) {
    const distribution = {};
    for (const signal of signals) {
      const sector = signal.sector || 'Unknown';
      distribution[sector] = (distribution[sector] || 0) + 1;
    }
    return distribution;
  }

  /**
   * Generate insights from signals
   */
  _generateInsights(buySignals, weights) {
    const insights = [];

    // Dominant factor
    const dominantFactor = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])[0];

    if (dominantFactor[1] > 0.3) {
      insights.push(`Your strategy emphasizes ${dominantFactor[0]} (${Math.round(dominantFactor[1] * 100)}% weight)`);
    }

    // Sector concentration
    const sectors = buySignals.map(s => s.sector).filter(Boolean);
    const sectorCounts = {};
    sectors.forEach(s => sectorCounts[s] = (sectorCounts[s] || 0) + 1);
    const topSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0];

    if (topSector && topSector[1] >= buySignals.length * 0.4) {
      insights.push(`High concentration in ${topSector[0]} sector (${topSector[1]}/${buySignals.length} signals)`);
    }

    // Average score
    const avgScore = buySignals.reduce((sum, s) => sum + s.combinedScore, 0) / buySignals.length;
    if (avgScore >= 75) {
      insights.push(`Strong overall signal quality (avg score: ${avgScore.toFixed(1)})`);
    }

    return insights;
  }

  /**
   * Get methodology description
   */
  _getMethodologyDescription(weights) {
    const activeFactors = Object.entries(weights)
      .filter(([_, w]) => w > 0.05)
      .map(([f, w]) => `${f} (${Math.round(w * 100)}%)`)
      .join(', ');

    return `Stocks ranked by weighted factor score combining: ${activeFactors}. ` +
      `Top-ranked stocks are buy signals; bottom-ranked are avoid signals. ` +
      `Factor scores are percentile ranks within the investable universe.`;
  }

  /**
   * Print summary to console
   */
  _printSummary(result) {
    console.log('\n📊 TOP BUY SIGNALS:');
    console.log('-'.repeat(50));
    for (const signal of result.buySignals.slice(0, 5)) {
      console.log(`  ${signal.rank}. ${signal.symbol} (${signal.name?.substring(0, 20) || 'N/A'})`);
      console.log(`     Score: ${signal.combinedScore} | Strength: ${signal.strength}`);
    }

    console.log('\n⚠️ TOP AVOID SIGNALS:');
    console.log('-'.repeat(50));
    for (const signal of result.sellSignals.slice(0, 3)) {
      console.log(`  ${signal.rank}. ${signal.symbol} - Score: ${signal.combinedScore}`);
    }

    console.log('\n💡 INSIGHTS:');
    for (const insight of result.insights) {
      console.log(`  • ${insight}`);
    }
  }
}

module.exports = { FactorSignalGenerator };
