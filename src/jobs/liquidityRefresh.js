// src/jobs/liquidityRefresh.js
// Liquidity Metrics Calculator (Agent 2 - Trading)
// Calculates volume, volatility, and trading cost metrics for all stocks

const cron = require('node-cron');

class LiquidityRefresh {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      getCompaniesWithPrices: this.db.prepare(`
        SELECT DISTINCT c.id, c.symbol, c.market_cap
        FROM companies c
        JOIN daily_prices dp ON c.id = dp.company_id
        WHERE dp.date >= date('now', '-60 days')
        GROUP BY c.id
        HAVING COUNT(*) >= 30
      `),

      getPriceHistory: this.db.prepare(`
        SELECT date, open, high, low, close, volume
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 60
      `),

      upsertLiquidity: this.db.prepare(`
        INSERT INTO liquidity_metrics (
          company_id, avg_volume_30d, avg_value_30d, volume_volatility,
          bid_ask_spread_bps, amihud_illiquidity, volatility_30d, volatility_60d,
          turnover_ratio, estimated_impact_1pct, estimated_impact_5pct, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(company_id) DO UPDATE SET
          avg_volume_30d = excluded.avg_volume_30d,
          avg_value_30d = excluded.avg_value_30d,
          volume_volatility = excluded.volume_volatility,
          bid_ask_spread_bps = excluded.bid_ask_spread_bps,
          amihud_illiquidity = excluded.amihud_illiquidity,
          volatility_30d = excluded.volatility_30d,
          volatility_60d = excluded.volatility_60d,
          turnover_ratio = excluded.turnover_ratio,
          estimated_impact_1pct = excluded.estimated_impact_1pct,
          estimated_impact_5pct = excluded.estimated_impact_5pct,
          updated_at = CURRENT_TIMESTAMP
      `),
    };
  }

  // Schedule daily liquidity calculation at 8:00 PM ET
  start() {
    cron.schedule('0 20 * * 1-5', async () => {
      console.log('💧 Running scheduled liquidity metrics refresh...');
      await this.refreshAll();
    }, {
      timezone: 'America/New_York'
    });

    console.log('💧 Liquidity Refresh scheduled: 8:00 PM ET, weekdays');
  }

  // Refresh liquidity metrics for all companies
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
      const companies = this.stmts.getCompaniesWithPrices.all();
      console.log(`💧 Calculating liquidity for ${companies.length} companies...`);

      for (const company of companies) {
        try {
          const metrics = this._calculateLiquidity(company);
          if (metrics) {
            this.stmts.upsertLiquidity.run(
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
              metrics.impact5pct
            );
            updated++;
          }
        } catch (e) {
          errors++;
        }
        processed++;

        // Progress update every 500 companies
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
        executionTimeMs: elapsedMs
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

  // Calculate liquidity metrics for a single company
  _calculateLiquidity(company) {
    const prices = this.stmts.getPriceHistory.all(company.id);
    if (prices.length < 30) return null;

    // Calculate returns
    const returns = [];
    for (let i = 0; i < prices.length - 1; i++) {
      const prevClose = prices[i + 1].close;
      const currClose = prices[i].close;
      if (prevClose > 0) {
        returns.push((currClose - prevClose) / prevClose);
      }
    }

    // Volume metrics (30 days)
    const volumes30 = prices.slice(0, 30).map(p => p.volume);
    const avgVolume30d = volumes30.reduce((a, b) => a + b, 0) / volumes30.length;

    // Dollar volume
    const values30 = prices.slice(0, 30).map(p => p.volume * p.close);
    const avgValue30d = values30.reduce((a, b) => a + b, 0) / values30.length;

    // Volume volatility (std dev)
    const volMean = avgVolume30d;
    const volumeVolatility = Math.sqrt(
      volumes30.reduce((s, v) => s + Math.pow(v - volMean, 2), 0) / volumes30.length
    );

    // Volatility (annualized)
    const returns30 = returns.slice(0, 30);
    const returns60 = returns.slice(0, Math.min(60, returns.length));

    const volatility30d = this._calculateVolatility(returns30);
    const volatility60d = this._calculateVolatility(returns60);

    // Bid-ask spread estimate (using OHLC range as proxy)
    // Spread ≈ 2 × (High - Low) / (High + Low)
    const spreads = prices.slice(0, 30).map(p => {
      if (p.high + p.low > 0) {
        return 2 * (p.high - p.low) / (p.high + p.low);
      }
      return 0;
    });
    const bidAskSpreadBps = (spreads.reduce((a, b) => a + b, 0) / spreads.length) * 10000;

    // Amihud illiquidity (daily return / dollar volume)
    let amihudSum = 0;
    let amihudCount = 0;
    for (let i = 0; i < Math.min(30, returns.length); i++) {
      const dollarVol = prices[i].volume * prices[i].close;
      if (dollarVol > 0) {
        amihudSum += Math.abs(returns[i]) / dollarVol;
        amihudCount++;
      }
    }
    const amihudIlliquidity = amihudCount > 0 ? (amihudSum / amihudCount) * 1e6 : 0;

    // Turnover ratio (volume / market cap proxy)
    const sharesEstimate = company.market_cap && prices[0].close > 0
      ? company.market_cap / prices[0].close
      : avgVolume30d * 100; // Fallback estimate
    const turnoverRatio = sharesEstimate > 0 ? avgVolume30d / sharesEstimate : 0;

    // Market impact estimates (simplified Almgren-Chriss)
    // Impact ≈ σ × sqrt(participation rate)
    const impact1pct = volatility30d * Math.sqrt(0.01) * 100; // 1% of ADV
    const impact5pct = volatility30d * Math.sqrt(0.05) * 100; // 5% of ADV

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
    if (returns.length < 2) return 0.20; // Default 20%
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance * 252); // Annualized
  }

  // Get liquidity for a specific company
  getLiquidity(companyId) {
    return this.db.prepare(`
      SELECT * FROM liquidity_metrics WHERE company_id = ?
    `).get(companyId);
  }

  // Get most liquid stocks
  getMostLiquid(limit = 50) {
    return this.db.prepare(`
      SELECT lm.*, c.symbol, c.name
      FROM liquidity_metrics lm
      JOIN companies c ON lm.company_id = c.id
      ORDER BY lm.avg_value_30d DESC
      LIMIT ?
    `).all(limit);
  }

  // Get most volatile stocks
  getMostVolatile(limit = 50) {
    return this.db.prepare(`
      SELECT lm.*, c.symbol, c.name
      FROM liquidity_metrics lm
      JOIN companies c ON lm.company_id = c.id
      ORDER BY lm.volatility_30d DESC
      LIMIT ?
    `).all(limit);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      schedule: {
        time: '8:00 PM ET',
        days: 'Monday - Friday',
        timezone: 'America/New_York'
      }
    };
  }
}

// Factory function
function createLiquidityRefresh(db) {
  return new LiquidityRefresh(db);
}

module.exports = {
  LiquidityRefresh,
  createLiquidityRefresh
};

// If run directly
if (require.main === module) {
  const db = require('../database').getDatabase();
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
}
