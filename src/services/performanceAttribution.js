// src/services/performanceAttribution.js
// Performance Attribution Service for Agent 3 (Analytics & UI)

class PerformanceAttribution {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      getClosedTrades: this.db.prepare(`
        SELECT pt_sell.id as sell_transaction_id, pt_sell.portfolio_id,
          pt_sell.company_id, c.symbol, c.sector,
          pt_sell.price_per_share as exit_price, pt_sell.executed_at as exit_date,
          pl.cost_per_share as entry_price, pl.acquired_at as entry_date,
          JULIANDAY(pt_sell.executed_at) - JULIANDAY(pl.acquired_at) as holding_days
        FROM portfolio_transactions pt_sell
        JOIN portfolio_lots pl ON pt_sell.lot_id = pl.id
        JOIN companies c ON pt_sell.company_id = c.id
        WHERE pt_sell.transaction_type = 'sell' AND pt_sell.portfolio_id = ?
          AND pt_sell.executed_at >= ? AND pt_sell.executed_at <= ?
      `),
      getSignalsAtDate: this.db.prepare(`
        SELECT overall_signal, technical_score, sentiment_score,
          insider_score, analyst_score, market_regime
        FROM aggregated_signals WHERE company_id = ? AND date(calculated_at) <= date(?)
        ORDER BY calculated_at DESC LIMIT 1
      `),
      getRegimeAtDate: this.db.prepare(`
        SELECT regime, confidence, vix FROM market_regimes
        WHERE date <= ? ORDER BY date DESC LIMIT 1
      `),
      storeAttribution: this.db.prepare(`
        INSERT INTO trade_attributions (transaction_id, portfolio_id, company_id,
          factor, contribution, direction, signal_at_entry, signal_at_exit,
          entry_date, exit_date, holding_period_days, entry_price, exit_price,
          return_pct, return_contribution) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `),
      getFactorPerformance: this.db.prepare(`
        SELECT factor, COUNT(*) as trades_count,
          SUM(CASE WHEN return_pct > 0 THEN 1 ELSE 0 END) as winning_trades,
          AVG(return_pct) as avg_return, SUM(return_contribution) as total_contribution
        FROM trade_attributions WHERE portfolio_id = ? AND entry_date >= ?
        GROUP BY factor ORDER BY total_contribution DESC
      `)
    };
  }

  async analyzeCompletedTrade(trade) {
    const entrySignals = this.stmts.getSignalsAtDate.get(trade.company_id, trade.entry_date);
    const exitSignals = this.stmts.getSignalsAtDate.get(trade.company_id, trade.exit_date);
    const entryRegime = this.stmts.getRegimeAtDate.get(trade.entry_date);
    const returnPct = trade.entry_price > 0
      ? ((trade.exit_price - trade.entry_price) / trade.entry_price) * 100 : 0;
    const factors = this._identifyContributingFactors(entrySignals);
    for (const factor of factors) {
      try {
        this.stmts.storeAttribution.run(trade.sell_transaction_id, trade.portfolio_id,
          trade.company_id, factor.name, factor.weight, 'long',
          JSON.stringify({signal:entrySignals?.overall_signal,regime:entryRegime?.regime}),
          JSON.stringify({signal:exitSignals?.overall_signal}),
          trade.entry_date, trade.exit_date, trade.holding_days,
          trade.entry_price, trade.exit_price, returnPct, returnPct * factor.weight);
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
    const trades = this.stmts.getClosedTrades.all(portfolioId, startDate, endDate);
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

  getFactorPerformanceSummary(portfolioId, lookbackDays = 365) {
    const d = new Date(); d.setDate(d.getDate() - lookbackDays);
    return this.stmts.getFactorPerformance.all(portfolioId, d.toISOString().split('T')[0])
      .map(f => ({ factor: f.factor, tradesCount: f.trades_count,
        winRate: f.winning_trades/f.trades_count*100, avgReturn: f.avg_return,
        totalContribution: f.total_contribution }));
  }

  getAttributionSummary(portfolioId) {
    const overall = this.db.prepare(`SELECT COUNT(*) as total_trades,
      SUM(CASE WHEN return_pct > 0 THEN 1 ELSE 0 END) as winning_trades,
      AVG(return_pct) as avg_return FROM trade_attributions WHERE portfolio_id = ?`).get(portfolioId);
    const topFactors = this.db.prepare(`SELECT factor, COUNT(*) as trades,
      SUM(return_contribution) as contribution FROM trade_attributions
      WHERE portfolio_id = ? GROUP BY factor ORDER BY contribution DESC LIMIT 5`).all(portfolioId);
    return {
      overall: { totalTrades: overall?.total_trades||0,
        winRate: overall?.total_trades>0 ? overall.winning_trades/overall.total_trades*100 : 0,
        avgReturn: overall?.avg_return||0 },
      topFactors: topFactors.map(f => ({ factor: f.factor, trades: f.trades, contribution: f.contribution }))
    };
  }
}

let instance = null;
const getPerformanceAttribution = db => instance || (instance = new PerformanceAttribution(db));
module.exports = { PerformanceAttribution, getPerformanceAttribution };
