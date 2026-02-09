/**
 * Performance Attribution Service
 *
 * Analyzes completed trades to understand what factors drove returns.
 * Provides factor-level attribution for Agent 3 (Analytics & UI).
 *
 * Key Features:
 * - Trade-level attribution analysis
 * - Factor performance aggregation
 * - Regime-based performance breakdown
 * - Sector performance analysis
 */

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

const FACTORS = ['technical', 'sentiment', 'insider', 'fundamental'];

const FACTOR_WEIGHTS = {
  technical: 0.25,
  sentiment: 0.20,
  insider: 0.25,
  fundamental: 0.30,
};

class PerformanceAttribution {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  /**
   * Analyze a single completed trade
   * @param {number} transactionId - The transaction ID to analyze
   * @returns {TradeAttribution|null}
   */
  async analyzeTrade(transactionId) {
    const database = await getDatabaseAsync();

    // Get trade details with company info
    const result = await database.query(`
      SELECT
        pt.id,
        pt.portfolio_id,
        pt.company_id,
        pt.transaction_type,
        pt.shares,
        pt.price_per_share,
        pt.total_amount,
        pt.executed_at,
        pt.notes,
        c.symbol,
        c.name,
        c.sector,
        c.industry
      FROM portfolio_transactions pt
      JOIN companies c ON pt.company_id = c.id
      WHERE pt.id = $1
    `, [transactionId]);
    const trade = result.rows[0];

    if (!trade) {
      return null;
    }

    // For attribution, we need to find matching buy/sell pairs
    // This is a simplified version - in practice you'd track lots
    const tradeAnalysis = await this.getTradeAnalysis(trade);

    if (!tradeAnalysis) {
      return null; // Can only analyze closed trades
    }

    // Get recommendation at time of entry
    const entryRec = await this.getRecommendationAtDate(
      trade.company_id,
      tradeAnalysis.entryDate
    );

    // Get signals at entry
    const signalsAtEntry = entryRec?.signals ? JSON.parse(entryRec.signals) : null;
    const regimeAtEntry = entryRec?.regime_at_time || 'UNKNOWN';

    // Attribute returns to factors
    const attribution = this.calculateAttribution(signalsAtEntry, tradeAnalysis.pnlPct);

    // Store attribution
    await this.storeAttribution(transactionId, attribution);

    return {
      trade: {
        id: trade.id,
        symbol: trade.symbol,
        name: trade.name,
        sector: trade.sector,
        industry: trade.industry,
        entryDate: tradeAnalysis.entryDate,
        exitDate: tradeAnalysis.exitDate,
        entryPrice: tradeAnalysis.entryPrice,
        exitPrice: tradeAnalysis.exitPrice,
        quantity: tradeAnalysis.shares,
        side: tradeAnalysis.side,
      },
      performance: {
        pnlPct: tradeAnalysis.pnlPct,
        pnlDollar: tradeAnalysis.pnlDollar,
        holdingDays: tradeAnalysis.holdingDays,
        annualizedReturn: tradeAnalysis.holdingDays > 0
          ? tradeAnalysis.pnlPct * (365 / tradeAnalysis.holdingDays)
          : 0,
      },
      signalsAtEntry,
      regimeAtEntry,
      attribution,
      recommendation: entryRec ? {
        action: entryRec.action,
        score: entryRec.score,
        confidence: entryRec.confidence,
        positionSize: entryRec.position_size,
      } : null,
    };
  }

  /**
   * Get trade analysis by finding entry/exit pairs
   */
  async getTradeAnalysis(trade) {
    if (trade.transaction_type === 'sell') {
      const database = await getDatabaseAsync();

      // Find corresponding buy
      const result = await database.query(`
        SELECT
          executed_at,
          price_per_share,
          shares
        FROM portfolio_transactions
        WHERE portfolio_id = $1
          AND company_id = $2
          AND transaction_type = 'buy'
          AND executed_at < $3
        ORDER BY executed_at DESC
        LIMIT 1
      `, [trade.portfolio_id, trade.company_id, trade.executed_at]);
      const buyTrade = result.rows[0];

      if (!buyTrade) return null;

      const entryDate = new Date(buyTrade.executed_at);
      const exitDate = new Date(trade.executed_at);
      const holdingDays = Math.ceil((exitDate - entryDate) / (1000 * 60 * 60 * 24));
      const pnlPct = (trade.price_per_share - buyTrade.price_per_share) / buyTrade.price_per_share;
      const pnlDollar = (trade.price_per_share - buyTrade.price_per_share) * trade.shares;

      return {
        side: 'long',
        entryDate: buyTrade.executed_at,
        exitDate: trade.executed_at,
        entryPrice: buyTrade.price_per_share,
        exitPrice: trade.price_per_share,
        shares: trade.shares,
        holdingDays,
        pnlPct,
        pnlDollar,
      };
    }

    // For buys, we can't calculate P&L yet unless there's a sell
    return null;
  }

  /**
   * Get recommendation at or before a specific date for a company
   */
  async getRecommendationAtDate(companyId, date) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT *
      FROM agent_recommendations
      WHERE company_id = $1
        AND date <= $2
      ORDER BY date DESC
      LIMIT 1
    `, [companyId, date]);
    return result.rows[0];
  }

  /**
   * Calculate factor-level attribution for a trade
   */
  calculateAttribution(signals, pnlPct) {
    if (!signals) {
      return { factors: [], unexplained: pnlPct };
    }

    const factors = [];
    let explainedPnl = 0;

    for (const factorName of FACTORS) {
      const signal = signals[factorName];
      if (!signal) continue;

      const score = signal.score || 0;
      const weight = FACTOR_WEIGHTS[factorName] || 0.25;

      // Determine if signal was correct
      const correct = (score > 0 && pnlPct > 0) || (score < 0 && pnlPct < 0);

      // Calculate contribution (simplified model)
      const contribution = correct
        ? Math.abs(score) * Math.abs(pnlPct) * weight
        : -Math.abs(score) * Math.abs(pnlPct) * weight;

      factors.push({
        factor: factorName,
        signalAtEntry: score,
        correct,
        contribution,
        weight,
      });

      explainedPnl += Math.abs(contribution);
    }

    return {
      factors,
      totalPnl: pnlPct,
      explainedPnl,
      unexplained: pnlPct - (pnlPct > 0 ? explainedPnl : -explainedPnl),
    };
  }

  /**
   * Store attribution results in database
   */
  async storeAttribution(transactionId, attribution, tradeInfo = {}) {
    const database = await getDatabaseAsync();

    // Clear existing attributions for this transaction
    await database.query(`
      DELETE FROM trade_attributions WHERE transaction_id = $1
    `, [transactionId]);

    // Get transaction details if not provided
    if (!tradeInfo.portfolio_id || !tradeInfo.company_id) {
      const result = await database.query(`
        SELECT portfolio_id, company_id FROM portfolio_transactions WHERE id = $1
      `, [transactionId]);
      const tx = result.rows[0];
      tradeInfo = { ...tradeInfo, ...tx };
    }

    // Insert new attributions
    for (const factor of attribution.factors) {
      await database.query(`
        INSERT INTO trade_attributions
        (transaction_id, portfolio_id, company_id, factor, contribution, direction, signal_at_entry)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        transactionId,
        tradeInfo.portfolio_id,
        tradeInfo.company_id,
        factor.factor,
        factor.contribution,
        factor.correct ? 'long' : 'short',
        JSON.stringify({ score: factor.signalAtEntry })
      ]);
    }
  }

  /**
   * Get aggregated factor performance across all trades
   * @param {number} portfolioId
   * @param {string} period - '7d', '30d', '90d', '1y', 'all'
   */
  async getFactorPerformance(portfolioId, period = '90d') {
    const database = await getDatabaseAsync();
    const periodDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all': 9999 };
    const days = periodDays[period] || 90;

    // Get closed trades (sells) in the period
    const dateCondition = isUsingPostgres()
      ? `pt.executed_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `pt.executed_at >= datetime('now', '-' || ${days} || ' days')`;

    const result = await database.query(`
      SELECT pt.id
      FROM portfolio_transactions pt
      WHERE pt.portfolio_id = $1
        AND pt.transaction_type = 'sell'
        AND ${dateCondition}
    `, [portfolioId]);
    const trades = result.rows;

    const factorStats = {};
    for (const factor of FACTORS) {
      factorStats[factor] = {
        wins: 0,
        losses: 0,
        totalContribution: 0,
        totalSignal: 0,
        count: 0,
      };
    }

    // Analyze each trade
    for (const trade of trades) {
      const analysis = await this.analyzeTrade(trade.id);
      if (!analysis?.attribution?.factors) continue;

      for (const factor of analysis.attribution.factors) {
        const stats = factorStats[factor.factor];
        if (!stats) continue;

        if (factor.correct) stats.wins++;
        else stats.losses++;

        stats.totalContribution += factor.contribution;
        stats.totalSignal += Math.abs(factor.signalAtEntry);
        stats.count++;
      }
    }

    // Calculate final metrics
    const finalResult = {};
    for (const [factor, stats] of Object.entries(factorStats)) {
      const total = stats.wins + stats.losses;
      finalResult[factor] = {
        winRate: total > 0 ? stats.wins / total : 0,
        wins: stats.wins,
        losses: stats.losses,
        totalTrades: total,
        totalContribution: stats.totalContribution,
        avgContribution: total > 0 ? stats.totalContribution / total : 0,
        avgSignalStrength: stats.count > 0 ? stats.totalSignal / stats.count : 0,
      };
    }

    // Rank factors by win rate
    const ranked = Object.entries(finalResult)
      .sort((a, b) => b[1].winRate - a[1].winRate)
      .map(([factor, stats]) => ({ factor, ...stats }));

    return {
      period,
      totalTrades: trades.length,
      factors: finalResult,
      ranked,
      bestFactor: ranked[0]?.factor || null,
      worstFactor: ranked[ranked.length - 1]?.factor || null,
    };
  }

  /**
   * Get performance breakdown by market regime
   */
  async getPerformanceByRegime(portfolioId, period = '90d') {
    const database = await getDatabaseAsync();
    const periodDays = { '30d': 30, '90d': 90, '1y': 365, 'all': 9999 };
    const days = periodDays[period] || 90;

    // Get trades with regime context
    const dateCondition = isUsingPostgres()
      ? `pt.executed_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `pt.executed_at >= datetime('now', '-' || ${days} || ' days')`;

    const dateFunction = isUsingPostgres()
      ? `DATE(pt.executed_at)`
      : `date(pt.executed_at)`;

    const result = await database.query(`
      SELECT
        pt.id,
        pt.company_id,
        pt.price_per_share as exit_price,
        pt.shares,
        pt.executed_at as exit_date,
        (
          SELECT price_per_share
          FROM portfolio_transactions pt2
          WHERE pt2.portfolio_id = pt.portfolio_id
            AND pt2.company_id = pt.company_id
            AND pt2.transaction_type = 'buy'
            AND pt2.executed_at < pt.executed_at
          ORDER BY pt2.executed_at DESC
          LIMIT 1
        ) as entry_price,
        (
          SELECT executed_at
          FROM portfolio_transactions pt2
          WHERE pt2.portfolio_id = pt.portfolio_id
            AND pt2.company_id = pt.company_id
            AND pt2.transaction_type = 'buy'
            AND pt2.executed_at < pt.executed_at
          ORDER BY pt2.executed_at DESC
          LIMIT 1
        ) as entry_date,
        ar.regime_at_time as regime
      FROM portfolio_transactions pt
      LEFT JOIN agent_recommendations ar ON ar.company_id = pt.company_id
        AND ar.date <= ${dateFunction}
      WHERE pt.portfolio_id = $1
        AND pt.transaction_type = 'sell'
        AND ${dateCondition}
      GROUP BY pt.id
    `, [portfolioId]);
    const trades = result.rows;

    // Group by regime
    const regimeStats = {};
    for (const trade of trades) {
      if (!trade.entry_price) continue;

      const regime = trade.regime || 'UNKNOWN';
      if (!regimeStats[regime]) {
        regimeStats[regime] = { trades: 0, wins: 0, totalReturn: 0 };
      }

      const pnlPct = (trade.exit_price - trade.entry_price) / trade.entry_price;
      regimeStats[regime].trades++;
      regimeStats[regime].totalReturn += pnlPct;
      if (pnlPct > 0) regimeStats[regime].wins++;
    }

    // Format results
    const results = Object.entries(regimeStats).map(([regime, stats]) => ({
      regime,
      trades: stats.trades,
      wins: stats.wins,
      winRate: stats.trades > 0 ? stats.wins / stats.trades : 0,
      avgReturn: stats.trades > 0 ? stats.totalReturn / stats.trades : 0,
    }));

    return results.sort((a, b) => b.avgReturn - a.avgReturn);
  }

  /**
   * Get performance breakdown by sector
   */
  async getPerformanceBySector(portfolioId, period = '90d') {
    const database = await getDatabaseAsync();
    const periodDays = { '30d': 30, '90d': 90, '1y': 365, 'all': 9999 };
    const days = periodDays[period] || 90;

    const dateCondition = isUsingPostgres()
      ? `pt.executed_at >= CURRENT_TIMESTAMP - INTERVAL '${days} days'`
      : `pt.executed_at >= datetime('now', '-' || ${days} || ' days')`;

    const result = await database.query(`
      WITH trade_pairs AS (
        SELECT
          pt.id,
          pt.company_id,
          pt.price_per_share as exit_price,
          pt.shares,
          c.sector,
          (
            SELECT price_per_share
            FROM portfolio_transactions pt2
            WHERE pt2.portfolio_id = pt.portfolio_id
              AND pt2.company_id = pt.company_id
              AND pt2.transaction_type = 'buy'
              AND pt2.executed_at < pt.executed_at
            ORDER BY pt2.executed_at DESC
            LIMIT 1
          ) as entry_price
        FROM portfolio_transactions pt
        JOIN companies c ON pt.company_id = c.id
        WHERE pt.portfolio_id = $1
          AND pt.transaction_type = 'sell'
          AND ${dateCondition}
      )
      SELECT
        sector,
        COUNT(*) as trades,
        SUM(CASE WHEN exit_price > entry_price THEN 1 ELSE 0 END) as wins,
        AVG((exit_price - entry_price) / entry_price) as avg_return,
        SUM((exit_price - entry_price) * shares) as total_pnl
      FROM trade_pairs
      WHERE entry_price IS NOT NULL AND sector IS NOT NULL
      GROUP BY sector
      ORDER BY total_pnl DESC
    `, [portfolioId]);
    return result.rows;
  }

  /**
   * Get attribution summary for a specific trade
   */
  async getTradeAttributionSummary(transactionId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT *
      FROM trade_attributions
      WHERE transaction_id = $1
      ORDER BY ABS(contribution) DESC
    `, [transactionId]);
    const attributions = result.rows;

    if (!attributions.length) {
      return null;
    }

    const totalContribution = attributions.reduce((sum, a) => sum + Math.abs(a.contribution), 0);
    const positiveCount = attributions.filter(a => a.direction === 'positive').length;

    return {
      transactionId,
      factors: attributions.map(a => ({
        factor: a.factor,
        contribution: a.contribution,
        direction: a.direction,
        signalAtEntry: JSON.parse(a.signal_at_entry || '{}'),
        weight: a.weight,
        percentOfTotal: totalContribution > 0 ? Math.abs(a.contribution) / totalContribution : 0,
      })),
      summary: {
        totalFactors: attributions.length,
        correctCalls: positiveCount,
        incorrectCalls: attributions.length - positiveCount,
        accuracy: attributions.length > 0 ? positiveCount / attributions.length : 0,
      },
    };
  }

  /**
   * Analyze all closed trades in a portfolio for a given period
   * Returns a comprehensive attribution report
   */
  async generateAttributionReport(portfolioId, period = '90d') {
    const factorPerf = await this.getFactorPerformance(portfolioId, period);
    const regimePerf = await this.getPerformanceByRegime(portfolioId, period);
    const sectorPerf = await this.getPerformanceBySector(portfolioId, period);

    return {
      period,
      generatedAt: new Date().toISOString(),
      factorPerformance: factorPerf,
      regimePerformance: regimePerf,
      sectorPerformance: sectorPerf,
      insights: this.generateInsights(factorPerf, regimePerf, sectorPerf),
    };
  }

  /**
   * Generate actionable insights from attribution data
   */
  generateInsights(factorPerf, regimePerf, sectorPerf) {
    const insights = [];

    // Factor insights
    if (factorPerf.bestFactor && factorPerf.factors[factorPerf.bestFactor]?.winRate > 0.6) {
      insights.push({
        type: 'positive',
        category: 'factor',
        message: `${factorPerf.bestFactor} signals have a ${(factorPerf.factors[factorPerf.bestFactor].winRate * 100).toFixed(0)}% win rate - consider increasing weight`,
      });
    }

    if (factorPerf.worstFactor && factorPerf.factors[factorPerf.worstFactor]?.winRate < 0.4) {
      insights.push({
        type: 'warning',
        category: 'factor',
        message: `${factorPerf.worstFactor} signals have only ${(factorPerf.factors[factorPerf.worstFactor].winRate * 100).toFixed(0)}% win rate - review signal quality`,
      });
    }

    // Regime insights
    const bestRegime = regimePerf[0];
    if (bestRegime && bestRegime.avgReturn > 0.05) {
      insights.push({
        type: 'positive',
        category: 'regime',
        message: `${bestRegime.regime} regime trades averaged ${(bestRegime.avgReturn * 100).toFixed(1)}% return`,
      });
    }

    // Sector insights
    const topSector = sectorPerf[0];
    if (topSector && topSector.total_pnl > 0) {
      insights.push({
        type: 'positive',
        category: 'sector',
        message: `${topSector.sector} is your best performing sector with $${topSector.total_pnl.toFixed(2)} total P&L`,
      });
    }

    return insights;
  }
}

module.exports = { PerformanceAttribution };
