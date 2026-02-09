// src/services/performanceAttribution.js
// Performance Attribution Service for Agent 3 (Analytics & UI)

const { getDatabaseAsync } = require('../lib/db');

class PerformanceAttribution {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  async analyzeCompletedTrade(trade) {
    const database = await getDatabaseAsync();

    const entrySignalsResult = await database.query(`
      SELECT overall_signal, technical_score, sentiment_score,
        insider_score, analyst_score, market_regime
      FROM aggregated_signals WHERE company_id = $1 AND date(calculated_at) <= date($2)
      ORDER BY calculated_at DESC LIMIT 1
    `, [trade.company_id, trade.entry_date]);
    const entrySignals = entrySignalsResult.rows[0];

    const exitSignalsResult = await database.query(`
      SELECT overall_signal, technical_score, sentiment_score,
        insider_score, analyst_score, market_regime
      FROM aggregated_signals WHERE company_id = $1 AND date(calculated_at) <= date($2)
      ORDER BY calculated_at DESC LIMIT 1
    `, [trade.company_id, trade.exit_date]);
    const exitSignals = exitSignalsResult.rows[0];

    const entryRegimeResult = await database.query(`
      SELECT regime, confidence, vix FROM market_regimes
      WHERE date <= $1 ORDER BY date DESC LIMIT 1
    `, [trade.entry_date]);
    const entryRegime = entryRegimeResult.rows[0];

    const returnPct = trade.entry_price > 0
      ? ((trade.exit_price - trade.entry_price) / trade.entry_price) * 100 : 0;
    const factors = this._identifyContributingFactors(entrySignals);
    for (const factor of factors) {
      try {
        await database.query(`
          INSERT INTO trade_attributions (transaction_id, portfolio_id, company_id,
            factor, contribution, direction, signal_at_entry, signal_at_exit,
            entry_date, exit_date, holding_period_days, entry_price, exit_price,
            return_pct, return_contribution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        `, [
          trade.sell_transaction_id, trade.portfolio_id,
          trade.company_id, factor.name, factor.weight, 'long',
          JSON.stringify({signal:entrySignals?.overall_signal,regime:entryRegime?.regime}),
          JSON.stringify({signal:exitSignals?.overall_signal}),
          trade.entry_date, trade.exit_date, trade.holding_days,
          trade.entry_price, trade.exit_price, returnPct, returnPct * factor.weight
        ]);
      } catch(e) { console.log('Attribution failed:', e.message); }
    }
    return { trade, returnPct, regime: entryRegime?.regime, factors };
  }

  _identifyContributingFactors(signals) {
    if (!signals) return [{ name: 'manual', weight: 1.0 }];
    const factors = [];
    for (const type of ['technical','sentiment','insider','analyst']) {
      const score = signals[type + '_score'];
      if (score != null && Math.abs(score) > 0.3)
        factors.push({ name: type, weight: Math.abs(score), score });
    }
    if (!factors.length) return [{ name: 'manual', weight: 1.0 }];
    const total = factors.reduce((s, f) => s + f.weight, 0);
    factors.forEach(f => f.weight /= total);
    return factors;
  }

  async analyzePortfolioTrades(portfolioId, startDate, endDate) {
    const database = await getDatabaseAsync();

    const tradesResult = await database.query(`
      SELECT pt_sell.id as sell_transaction_id, pt_sell.portfolio_id,
        pt_sell.company_id, c.symbol, c.sector,
        pt_sell.price_per_share as exit_price, pt_sell.executed_at as exit_date,
        pl.cost_per_share as entry_price, pl.acquired_at as entry_date,
        (EXTRACT(EPOCH FROM (pt_sell.executed_at - pl.acquired_at)) / 86400) as holding_days
      FROM portfolio_transactions pt_sell
      JOIN portfolio_lots pl ON pt_sell.lot_id = pl.id
      JOIN companies c ON pt_sell.company_id = c.id
      WHERE pt_sell.transaction_type = 'sell' AND pt_sell.portfolio_id = $1
        AND pt_sell.executed_at >= $2 AND pt_sell.executed_at <= $3
    `, [portfolioId, startDate, endDate]);
    const trades = tradesResult.rows;

    const results = [];
    for (const trade of trades) {
      try { results.push(await this.analyzeCompletedTrade(trade)); }
      catch(e) { console.log('Trade error:', e.message); }
    }
    return { portfolioId, startDate, endDate, tradesAnalyzed: results.length,
      summary: this._calculateSummary(results), trades: results };
  }

  _calculateSummary(results) {
    if (!results.length) return { totalTrades: 0, winRate: 0, avgReturn: 0, factorPerformance: [] };
    const wins = results.filter(r => r.returnPct > 0).length;
    const total = results.reduce((s, r) => s + r.returnPct, 0);
    const factorStats = {};
    for (const r of results) {
      for (const f of r.factors) {
        if (!factorStats[f.name]) factorStats[f.name] = { trades: 0, wins: 0, totalReturn: 0 };
        factorStats[f.name].trades++;
        if (r.returnPct > 0) factorStats[f.name].wins++;
        factorStats[f.name].totalReturn += r.returnPct * f.weight;
      }
    }
    return {
      totalTrades: results.length, winningTrades: wins,
      losingTrades: results.length - wins, winRate: wins/results.length*100,
      avgReturn: total/results.length, totalReturn: total,
      factorPerformance: Object.entries(factorStats).map(([name,s]) => ({
        factor: name, trades: s.trades, winRate: s.wins/s.trades*100, contribution: s.totalReturn
      })).sort((a,b) => b.contribution - a.contribution)
    };
  }

  async getFactorPerformanceSummary(portfolioId, lookbackDays = 365) {
    const database = await getDatabaseAsync();
    const d = new Date(); d.setDate(d.getDate() - lookbackDays);

    const result = await database.query(`
      SELECT factor, COUNT(*) as trades_count,
        SUM(CASE WHEN return_pct > 0 THEN 1 ELSE 0 END) as winning_trades,
        AVG(return_pct) as avg_return, SUM(return_contribution) as total_contribution
      FROM trade_attributions WHERE portfolio_id = $1 AND entry_date >= $2
      GROUP BY factor ORDER BY total_contribution DESC
    `, [portfolioId, d.toISOString().split('T')[0]]);

    return result.rows.map(f => ({ factor: f.factor, tradesCount: f.trades_count,
      winRate: f.winning_trades/f.trades_count*100, avgReturn: f.avg_return,
      totalContribution: f.total_contribution }));
  }

  async getAttributionSummary(portfolioId) {
    const database = await getDatabaseAsync();

    const overallResult = await database.query(`
      SELECT COUNT(*) as total_trades,
        SUM(CASE WHEN return_pct > 0 THEN 1 ELSE 0 END) as winning_trades,
        AVG(return_pct) as avg_return FROM trade_attributions WHERE portfolio_id = $1
    `, [portfolioId]);
    const overall = overallResult.rows[0];

    const topFactorsResult = await database.query(`
      SELECT factor, COUNT(*) as trades,
        SUM(return_contribution) as contribution FROM trade_attributions
      WHERE portfolio_id = $1 GROUP BY factor ORDER BY contribution DESC LIMIT 5
    `, [portfolioId]);
    const topFactors = topFactorsResult.rows;

    return {
      overall: { totalTrades: overall?.total_trades||0,
        winRate: overall?.total_trades>0 ? overall.winning_trades/overall.total_trades*100 : 0,
        avgReturn: overall?.avg_return||0 },
      topFactors: topFactors.map(f => ({ factor: f.factor, trades: f.trades, contribution: f.contribution }))
    };
  }
}

let instance = null;
const getPerformanceAttribution = () => instance || (instance = new PerformanceAttribution());
module.exports = { PerformanceAttribution, getPerformanceAttribution };
