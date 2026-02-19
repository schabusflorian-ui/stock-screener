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
const { getDatabaseAsync, isUsingPostgres } = require('../../../lib/db');
const StockTwitsFetcher = require('../../stocktwitsFetcher');

class SentimentBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
    this.stockTwitsFetcher = new StockTwitsFetcher();
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
    const database = await getDatabaseAsync();
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

          const stats = await this.getSentimentStats(database);
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
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting StockTwits sentiment update...');

    try {
      // Get tickers to update - try watchlist/portfolio first, fall back to top companies
      let tickers = [];

      // Try to get tickers from watchlist (may not exist in all environments)
      try {
        const watchlistResult = await database.query(`
          SELECT DISTINCT c.symbol
          FROM watchlist w
          JOIN companies c ON w.company_id = c.id
        `);
        tickers.push(...watchlistResult.rows);
      } catch {
        // Table doesn't exist, skip
      }

      // Try to get tickers from portfolio_positions (may not exist in all environments)
      try {
        const portfolioResult = await database.query(`
          SELECT DISTINCT c.symbol FROM portfolio_positions pp
          JOIN companies c ON pp.company_id = c.id
        `);
        tickers.push(...portfolioResult.rows);
      } catch {
        // Table doesn't exist, skip
      }

      // Always get top companies by market cap as fallback
      const topCompaniesResult = await database.query(`
        SELECT symbol FROM companies
        WHERE market_cap > 10000000000
        ORDER BY market_cap DESC
        LIMIT 100
      `);
      tickers.push(...topCompaniesResult.rows);

      // Deduplicate
      const uniqueSymbols = [...new Set(tickers.map(t => t.symbol))];
      tickers = uniqueSymbols.map(symbol => ({ symbol }));

      await onProgress(10, `Updating ${tickers.length} tickers...`);

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < tickers.length; i++) {
        const progress = 10 + Math.floor((i / tickers.length) * 85);
        await onProgress(progress, `Processing ${tickers[i].symbol}...`);

        try {
          // Get company_id for this symbol
          const companyResult = await database.query(
            'SELECT id FROM companies WHERE symbol = $1',
            [tickers[i].symbol]
          );
          const companyId = companyResult.rows[0]?.id;

          if (companyId) {
            await this.stockTwitsFetcher.fetchSymbolSentiment(tickers[i].symbol, companyId);
            updated++;
          }
        } catch (error) {
          console.error(`StockTwits error for ${tickers[i].symbol}:`, error.message);
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
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting trending analysis...');

    // Dialect-aware date interval
    const interval24h = isUsingPostgres()
      ? `CURRENT_TIMESTAMP - INTERVAL '24 hours'`
      : `datetime('now', '-24 hours')`;

    try {
      // Analyze recent sentiment data for trends
      const result = await database.query(`
        SELECT c.symbol, COUNT(*) as mention_count, AVG(rp.sentiment_score) as avg_sentiment
        FROM reddit_posts rp
        JOIN companies c ON rp.company_id = c.id
        WHERE rp.posted_at > ${interval24h}
        GROUP BY c.symbol
        ORDER BY mention_count DESC
        LIMIT 100
      `);
      const recentMentions = result.rows;

      await onProgress(50, `Analyzing ${recentMentions.length} trending tickers...`);

      // Update trending scores
      for (const ticker of recentMentions) {
        try {
          await database.query(`
            INSERT INTO trending_tickers (symbol, mention_count, avg_sentiment, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (symbol) DO UPDATE SET
              mention_count = $2,
              avg_sentiment = $3,
              updated_at = CURRENT_TIMESTAMP
          `, [ticker.symbol, ticker.mention_count, ticker.avg_sentiment]);
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

  async getSentimentStats(database) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const totalTickersResult = await database.query(`
        SELECT COUNT(DISTINCT c.symbol) as count
        FROM reddit_posts rp
        JOIN companies c ON rp.company_id = c.id
      `);
      const totalTickers = totalTickersResult.rows[0]?.count || 0;

      const updatedTodayResult = await database.query(`
        SELECT COUNT(DISTINCT c.symbol) as count
        FROM reddit_posts rp
        JOIN companies c ON rp.company_id = c.id
        WHERE DATE(rp.posted_at) = $1
      `, [today]);
      const updatedToday = updatedTodayResult.rows[0]?.count || 0;

      return { totalTickers, updatedToday };
    } catch {
      return { totalTickers: 0, updatedToday: 0 };
    }
  }
}

const sentimentBundle = new SentimentBundle();

module.exports = {
  execute: async (jobKey, db, context) => sentimentBundle.execute(jobKey, db, context)
};
