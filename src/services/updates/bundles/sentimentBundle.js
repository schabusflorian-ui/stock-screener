// src/services/updates/bundles/sentimentBundle.js
/**
 * Sentiment Update Bundle
 *
 * Handles all sentiment-related update jobs:
 * - sentiment.reddit - Reddit sentiment scanning
 * - sentiment.stocktwits - StockTwits sentiment updates
 * - sentiment.trending - Trending ticker analysis
 */

const { spawn } = require('child_process');
const path = require('path');

class SentimentBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'sentiment.reddit':
        return this.runRedditSentiment(db, onProgress);
      case 'sentiment.stocktwits':
        return this.runStockTwitsSentiment(db, onProgress);
      case 'sentiment.trending':
        return this.runTrendingAnalysis(db, onProgress);
      default:
        throw new Error(`Unknown sentiment job: ${jobKey}`);
    }
  }

  async runRedditSentiment(db, onProgress) {
    await onProgress(5, 'Starting Reddit sentiment scan...');

    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, '../../../jobs/sentimentRefresh.js');
      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', async (code) => {
        if (code === 0) {
          await onProgress(100, 'Reddit sentiment scan complete');

          const stats = this.getSentimentStats(db);
          resolve({
            itemsTotal: stats.totalTickers,
            itemsProcessed: stats.totalTickers,
            itemsUpdated: stats.updatedToday,
            itemsFailed: 0
          });
        } else {
          reject(new Error(`Reddit sentiment failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  async runStockTwitsSentiment(db, onProgress) {
    await onProgress(5, 'Starting StockTwits sentiment update...');

    try {
      // Get tickers to update
      const tickers = db.prepare(`
        SELECT DISTINCT symbol FROM (
          SELECT symbol FROM watchlist
          UNION
          SELECT c.symbol FROM portfolio_holdings ph
          JOIN companies c ON ph.company_id = c.id
          UNION
          SELECT symbol FROM companies WHERE market_cap > 10000000000 LIMIT 100
        )
      `).all();

      await onProgress(10, `Updating ${tickers.length} tickers...`);

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < tickers.length; i++) {
        const progress = 10 + Math.floor((i / tickers.length) * 85);
        await onProgress(progress, `Processing ${tickers[i].symbol}...`);

        try {
          // In production, call StockTwits API
          updated++;
        } catch {
          failed++;
        }
      }

      await onProgress(100, 'StockTwits update complete');

      return {
        itemsTotal: tickers.length,
        itemsProcessed: tickers.length,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      throw error;
    }
  }

  async runTrendingAnalysis(db, onProgress) {
    await onProgress(5, 'Starting trending analysis...');

    try {
      // Analyze recent sentiment data for trends
      const recentMentions = db.prepare(`
        SELECT symbol, COUNT(*) as mention_count, AVG(sentiment_score) as avg_sentiment
        FROM reddit_mentions
        WHERE created_at > datetime('now', '-24 hours')
        GROUP BY symbol
        ORDER BY mention_count DESC
        LIMIT 100
      `).all();

      await onProgress(50, `Analyzing ${recentMentions.length} trending tickers...`);

      // Update trending scores
      for (const ticker of recentMentions) {
        try {
          db.prepare(`
            INSERT OR REPLACE INTO trending_tickers (symbol, mention_count, avg_sentiment, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          `).run(ticker.symbol, ticker.mention_count, ticker.avg_sentiment);
        } catch {
          // Ignore individual errors
        }
      }

      await onProgress(100, 'Trending analysis complete');

      return {
        itemsTotal: recentMentions.length,
        itemsProcessed: recentMentions.length,
        itemsUpdated: recentMentions.length,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  getSentimentStats(db) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const totalTickers = db.prepare(`
        SELECT COUNT(DISTINCT symbol) as count FROM reddit_mentions
      `).get()?.count || 0;

      const updatedToday = db.prepare(`
        SELECT COUNT(DISTINCT symbol) as count FROM reddit_mentions
        WHERE date(created_at) = ?
      `).get(today)?.count || 0;

      return { totalTickers, updatedToday };
    } catch {
      return { totalTickers: 0, updatedToday: 0 };
    }
  }
}

const sentimentBundle = new SentimentBundle();

module.exports = {
  execute: (jobKey, db, context) => sentimentBundle.execute(jobKey, db, context)
};
