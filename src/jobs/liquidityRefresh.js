// src/jobs/liquidityRefresh.js
// Liquidity Metrics Calculator - works with both SQLite and PostgreSQL

const cron = require('node-cron');
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');

class LiquidityRefresh {
  constructor(_db) {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  start() {
    cron.schedule('0 20 * * 1-5', async () => {
      console.log('💧 Running scheduled liquidity metrics refresh...');
      await this.refreshAll();
    }, { timezone: 'America/New_York' });
    console.log('💧 Liquidity Refresh scheduled: 8:00 PM ET, weekdays');
  }

  async refreshAll() {
    if (this.isRunning) {
      console.log('⚠️ Liquidity refresh already in progress');
      return { success: false, error: 'Already running' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    let processed = 0;
    let updated = 0;
    let errors = 0;

    try {
      const db = await getDatabaseAsync();
      const dateFilter = isUsingPostgres()
        ? `dp.date >= CURRENT_DATE - INTERVAL '60 days'`
        : `dp.date >= date('now', '-60 days')`;

      const companiesResult = await db.query(`
        SELECT DISTINCT c.id, c.symbol, c.market_cap
        FROM companies c
        JOIN daily_prices dp ON c.id = dp.company_id
        WHERE ${dateFilter}
        GROUP BY c.id, c.symbol, c.market_cap
        HAVING COUNT(*) >= 30
      `);
      const companies = companiesResult.rows;

      console.log(`💧 Calculating liquidity for ${companies.length} companies...`);

      for (const company of companies) {
        try {
          const metrics = await this._calculateLiquidity(db, company);
          if (metrics) {
            const conflictCol = isUsingPostgres() ? 'company_id' : 'company_id';
            const upsertSql = isUsingPostgres()
              ? `INSERT INTO liquidity_metrics (
                  company_id, avg_volume_30d, avg_value_30d, volume_volatility,
                  bid_ask_spread_bps, amihud_illiquidity, volatility_30d, volatility_60d,
                  turnover_ratio, estimated_impact_1pct, estimated_impact_5pct, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                ON CONFLICT (company_id) DO UPDATE SET
                  avg_volume_30d = EXCLUDED.avg_volume_30d,
                  avg_value_30d = EXCLUDED.avg_value_30d,
                  volume_volatility = EXCLUDED.volume_volatility,
                  bid_ask_spread_bps = EXCLUDED.bid_ask_spread_bps,
                  amihud_illiquidity = EXCLUDED.amihud_illiquidity,
                  volatility_30d = EXCLUDED.volatility_30d,
                  volatility_60d = EXCLUDED.volatility_60d,
                  turnover_ratio = EXCLUDED.turnover_ratio,
                  estimated_impact_1pct = EXCLUDED.estimated_impact_1pct,
                  estimated_impact_5pct = EXCLUDED.estimated_impact_5pct,
                  updated_at = NOW()`
              : `INSERT INTO liquidity_metrics (
                  company_id, avg_volume_30d, avg_value_30d, volume_volatility,
                  bid_ask_spread_bps, amihud_illiquidity, volatility_30d, volatility_60d,
                  turnover_ratio, estimated_impact_1pct, estimated_impact_5pct, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
                ON CONFLICT (company_id) DO UPDATE SET
                  avg_volume_30d = EXCLUDED.avg_volume_30d,
                  avg_value_30d = EXCLUDED.avg_value_30d,
                  volume_volatility = EXCLUDED.volume_volatility,
                  bid_ask_spread_bps = EXCLUDED.bid_ask_spread_bps,
                  amihud_illiquidity = EXCLUDED.amihud_illiquidity,
                  volatility_30d = EXCLUDED.volatility_30d,
                  volatility_60d = EXCLUDED.volatility_60d,
                  turnover_ratio = EXCLUDED.turnover_ratio,
                  estimated_impact_1pct = EXCLUDED.estimated_impact_1pct,
                  estimated_impact_5pct = EXCLUDED.estimated_impact_5pct,
                  updated_at = CURRENT_TIMESTAMP`;

            await db.query(upsertSql, [
              company.id,
              metrics.avgVolume30d,
              metrics.avgValue30d,
              metrics.volumeVolatility,
              metrics.bidAskSpreadBps,
              metrics.amihudIlliquidity,
              metrics.volatility30d,
              metrics.volatility60d,
              metrics.turnoverRatio,
              metrics.impact1pct,
              metrics.impact5pct,
            ]);
            updated++;
          }
        } catch (e) {
          errors++;
        }
        processed++;
        if (processed % 500 === 0) {
          console.log(`   Processed ${processed}/${companies.length}...`);
        }
      }

      const elapsedMs = Date.now() - startTime;
      this.lastRun = new Date().toISOString();
      this.lastResult = {
        success: true,
        processed,
        updated,
        errors,
        executionTimeMs: elapsedMs,
      };
      console.log(`✅ Liquidity refresh complete: ${updated} updated, ${errors} errors in ${elapsedMs}ms`);
      return this.lastResult;
    } catch (error) {
      console.error('❌ Liquidity refresh error:', error);
      this.lastResult = { success: false, error: error.message };
      return this.lastResult;
    } finally {
      this.isRunning = false;
    }
  }

  async _calculateLiquidity(db, company) {
    const pricesResult = await db.query(
      `SELECT date, open, high, low, close, volume FROM daily_prices
       WHERE company_id = $1 ORDER BY date DESC LIMIT 60`,
      [company.id]
    );
    const prices = pricesResult.rows;
    if (prices.length < 30) return null;

    const returns = [];
    for (let i = 0; i < prices.length - 1; i++) {
      const prevClose = parseFloat(prices[i + 1].close);
      const currClose = parseFloat(prices[i].close);
      if (prevClose > 0) returns.push((currClose - prevClose) / prevClose);
    }

    const volumes30 = prices.slice(0, 30).map(p => parseFloat(p.volume));
    const avgVolume30d = volumes30.reduce((a, b) => a + b, 0) / volumes30.length;

    const values30 = prices.slice(0, 30).map(p => parseFloat(p.volume) * parseFloat(p.close));
    const avgValue30d = values30.reduce((a, b) => a + b, 0) / values30.length;

    const volMean = avgVolume30d;
    const volumeVolatility = Math.sqrt(
      volumes30.reduce((s, v) => s + Math.pow(v - volMean, 2), 0) / volumes30.length
    );

    const returns30 = returns.slice(0, 30);
    const returns60 = returns.slice(0, Math.min(60, returns.length));
    const volatility30d = this._calculateVolatility(returns30);
    const volatility60d = this._calculateVolatility(returns60);

    const spreads = prices.slice(0, 30).map(p => {
      const h = parseFloat(p.high), l = parseFloat(p.low);
      return (h + l) > 0 ? 2 * (h - l) / (h + l) : 0;
    });
    const bidAskSpreadBps = (spreads.reduce((a, b) => a + b, 0) / spreads.length) * 10000;

    let amihudSum = 0, amihudCount = 0;
    for (let i = 0; i < Math.min(30, returns.length); i++) {
      const dollarVol = parseFloat(prices[i].volume) * parseFloat(prices[i].close);
      if (dollarVol > 0) {
        amihudSum += Math.abs(returns[i]) / dollarVol;
        amihudCount++;
      }
    }
    const amihudIlliquidity = amihudCount > 0 ? (amihudSum / amihudCount) * 1e6 : 0;

    const marketCap = company.market_cap ? parseFloat(company.market_cap) : null;
    const sharesEstimate = marketCap && parseFloat(prices[0].close) > 0
      ? marketCap / parseFloat(prices[0].close)
      : avgVolume30d * 100;
    const turnoverRatio = sharesEstimate > 0 ? avgVolume30d / sharesEstimate : 0;

    const impact1pct = volatility30d * Math.sqrt(0.01) * 100;
    const impact5pct = volatility30d * Math.sqrt(0.05) * 100;

    return {
      avgVolume30d: Math.round(avgVolume30d),
      avgValue30d: Math.round(avgValue30d),
      volumeVolatility: Math.round(volumeVolatility),
      bidAskSpreadBps: Math.round(bidAskSpreadBps * 10) / 10,
      amihudIlliquidity: Math.round(amihudIlliquidity * 1000) / 1000,
      volatility30d: Math.round(volatility30d * 10000) / 10000,
      volatility60d: Math.round(volatility60d * 10000) / 10000,
      turnoverRatio: Math.round(turnoverRatio * 10000) / 10000,
      impact1pct: Math.round(impact1pct * 100) / 100,
      impact5pct: Math.round(impact5pct * 100) / 100,
    };
  }

  _calculateVolatility(returns) {
    if (returns.length < 2) return 0.20;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance * 252);
  }

  async getLiquidity(companyId) {
    try {
      const db = await getDatabaseAsync();
      const result = await db.query(
        `SELECT * FROM liquidity_metrics WHERE company_id = $1`,
        [companyId]
      );
      return result.rows[0] || null;
    } catch {
      return null;
    }
  }

  async getMostLiquid(limit = 50) {
    try {
      const db = await getDatabaseAsync();
      const result = await db.query(
        `SELECT lm.*, c.symbol, c.name
         FROM liquidity_metrics lm
         JOIN companies c ON lm.company_id = c.id
         ORDER BY lm.avg_value_30d DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting most liquid:', error.message);
      return [];
    }
  }

  async getMostVolatile(limit = 50) {
    try {
      const db = await getDatabaseAsync();
      const result = await db.query(
        `SELECT lm.*, c.symbol, c.name
         FROM liquidity_metrics lm
         JOIN companies c ON lm.company_id = c.id
         ORDER BY lm.volatility_30d DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting most volatile:', error.message);
      return [];
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      schedule: { time: '8:00 PM ET', days: 'Monday - Friday', timezone: 'America/New_York' },
    };
  }
}

function createLiquidityRefresh(db) {
  return new LiquidityRefresh(db);
}

module.exports = { LiquidityRefresh, createLiquidityRefresh };

if (require.main === module) {
  const { getDatabase } = require('../lib/db');
  getDatabase().then(db => {
    const refresher = new LiquidityRefresh(db);
    console.log('🚀 Starting Liquidity Refresh...');
    if (process.argv.includes('--now')) {
      refresher.refreshAll().then(result => {
        console.log('Result:', JSON.stringify(result, null, 2));
        process.exit(0);
      });
    } else {
      refresher.start();
    }
  });
}
