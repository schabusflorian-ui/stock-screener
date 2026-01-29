// src/api/routes/sentiment.js
// API routes for multi-source sentiment analysis

const express = require('express');
const router = express.Router();
const db = require('../../database');
const RedditFetcher = require('../../services/redditFetcher');
const SentimentSignalGenerator = require('../../services/sentimentSignal');
const NewsFetcher = require('../../services/newsFetcher');
const StockTwitsFetcher = require('../../services/stocktwitsFetcher');
const FearGreedFetcher = require('../../services/fearGreedFetcher');
const SentimentAggregator = require('../../services/sentimentAggregator');
const AnalystEstimatesFetcher = require('../../services/analystEstimates');

const database = db.getDatabase();
let redditFetcher;
let signalGenerator;
let newsFetcher;
let stocktwitsFetcher;
let fearGreedFetcher;
let sentimentAggregator;
let analystEstimatesFetcher;

/**
 * Safely map period parameter to SQLite datetime interval
 * Prevents SQL injection by using allowlist approach
 * @param {string} period - Period string ('24h', '7d', '30d', etc.)
 * @returns {string} - Safe SQLite interval string
 */
function getSafeDateInterval(period) {
  const PERIOD_MAP = {
    '24h': '-1 day',
    '1d': '-1 day',
    '3d': '-3 days',
    '7d': '-7 days',
    '14d': '-14 days',
    '30d': '-30 days',
    '90d': '-90 days',
  };
  return PERIOD_MAP[period] || '-7 days'; // Default to 7 days if invalid
}

// Initialize services
try {
  redditFetcher = new RedditFetcher(database);
  signalGenerator = new SentimentSignalGenerator(database);
  newsFetcher = new NewsFetcher(database);
  stocktwitsFetcher = new StockTwitsFetcher(database);
  fearGreedFetcher = new FearGreedFetcher(database);
  analystEstimatesFetcher = new AnalystEstimatesFetcher(database);
  sentimentAggregator = new SentimentAggregator(database, {
    reddit: redditFetcher,
    stocktwits: stocktwitsFetcher,
    news: newsFetcher,
    fearGreed: fearGreedFetcher,
    analyst: analystEstimatesFetcher,
  });
} catch (error) {
  console.error('Failed to initialize sentiment services:', error.message);
}

/**
 * GET /api/sentiment/status
 * Get sentiment data status for Updates page
 */
router.get('/status', async (req, res) => {
  try {
    // Get counts from trending_tickers
    const trendingStats = database.prepare(`
      SELECT
        COUNT(DISTINCT symbol) as tickers_tracked,
        SUM(mention_count) as total_mentions,
        MAX(calculated_at) as last_scan
      FROM trending_tickers
      WHERE period = '24h'
    `).get();

    // Get post counts
    const postStats = database.prepare(`
      SELECT
        COUNT(*) as total_posts,
        COUNT(DISTINCT company_id) as companies_with_posts
      FROM reddit_posts
    `).get();

    // Get sentiment distribution
    const sentimentDist = database.prepare(`
      SELECT
        SUM(CASE WHEN avg_sentiment > 0.05 THEN 1 ELSE 0 END) as bullish,
        SUM(CASE WHEN avg_sentiment < -0.05 THEN 1 ELSE 0 END) as bearish,
        SUM(CASE WHEN avg_sentiment BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral
      FROM trending_tickers
      WHERE period = '24h'
    `).get();

    // Get subreddit breakdown
    const subreddits = database.prepare(`
      SELECT
        subreddit,
        COUNT(*) as post_count
      FROM reddit_posts
      GROUP BY subreddit
      ORDER BY post_count DESC
      LIMIT 10
    `).all();

    // Get news article count
    const newsStats = database.prepare(`
      SELECT COUNT(*) as total_articles
      FROM news_articles
      WHERE published_at >= datetime('now', '-7 days')
    `).get();

    // Get StockTwits message count
    let stocktwitsStats = { total_messages: 0 };
    try {
      stocktwitsStats = database.prepare(`
        SELECT COUNT(*) as total_messages
        FROM stocktwits_messages
        WHERE posted_at >= datetime('now', '-7 days')
      `).get() || { total_messages: 0 };
    } catch (e) {
      // Table may not exist yet
    }

    res.json({
      tickersTracked: trendingStats?.tickers_tracked || 0,
      totalMentions: trendingStats?.total_mentions || 0,
      lastScan: trendingStats?.last_scan || null,
      totalPosts: postStats?.total_posts || 0,
      companiesWithPosts: postStats?.companies_with_posts || 0,
      sentimentDistribution: {
        bullish: sentimentDist?.bullish || 0,
        bearish: sentimentDist?.bearish || 0,
        neutral: sentimentDist?.neutral || 0,
      },
      subreddits,
      newsArticles: newsStats?.total_articles || 0,
      stocktwitsMessages: stocktwitsStats?.total_messages || 0,
    });
  } catch (error) {
    console.error('Sentiment status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/trending
 * Get trending tickers from Reddit
 */
router.get('/trending', async (req, res) => {
  try {
    if (!redditFetcher) {
      return res.status(503).json({ error: 'Sentiment service unavailable' });
    }

    const { period = '24h', limit = 20, refresh = 'false', region = 'US' } = req.query;

    if (refresh === 'true') {
      await redditFetcher.scanTrendingTickers({ region });
    }

    // Use region-specific period key for EU
    const periodKey = region === 'US' ? period : `${period}_${region}`;

    const trending = database.prepare(`
      SELECT
        t.*,
        c.name as company_name
      FROM trending_tickers t
      LEFT JOIN companies c ON t.symbol = c.symbol
      WHERE t.period = ?
      ORDER BY t.rank_by_mentions
      LIMIT ?
    `).all(periodKey, parseInt(limit));

    // Transform snake_case to camelCase for frontend
    const transformed = trending.map((t) => ({
      symbol: t.symbol,
      companyId: t.company_id,
      mentionCount: t.mention_count,
      uniquePosts: t.unique_posts,
      totalScore: t.total_score,
      avgSentiment: t.avg_sentiment,
      rankByMentions: t.rank_by_mentions,
      period: t.period,
      calculatedAt: t.calculated_at,
      companyName: t.company_name,
    }));

    res.json({ trending: transformed });
  } catch (error) {
    console.error('Trending API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/market
 * Get market-level sentiment (Fear & Greed, VIX)
 */
router.get('/market', async (req, res) => {
  try {
    if (!fearGreedFetcher) {
      return res.status(503).json({ error: 'Market sentiment service unavailable' });
    }

    const { refresh = 'false' } = req.query;

    if (refresh === 'true') {
      const data = await fearGreedFetcher.fetchAllIndicators();
      res.json(data);
    } else {
      // Return cached/stored data
      const stored = fearGreedFetcher.getLatestSentiment();

      if (Object.keys(stored).length === 0) {
        // No cached data, fetch fresh
        const data = await fearGreedFetcher.fetchAllIndicators();
        res.json(data);
      } else {
        res.json({
          cnn: stored.cnn_fear_greed,
          vix: stored.vix,
          overall: stored.overall_market,
          cached: true,
        });
      }
    }
  } catch (error) {
    console.error('Market sentiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/market/history
 * Get market sentiment history
 */
router.get('/market/history', async (req, res) => {
  try {
    if (!fearGreedFetcher) {
      return res.status(503).json({ error: 'Market sentiment service unavailable' });
    }

    const { indicator = 'cnn_fear_greed', days = 30 } = req.query;

    const history = fearGreedFetcher.getSentimentHistory(indicator, parseInt(days));

    res.json({
      indicator,
      days: parseInt(days),
      history,
    });
  } catch (error) {
    console.error('Market history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/batch/signals
 * Get sentiment signals for multiple stocks (watchlist)
 */
router.get('/batch/signals', async (req, res) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      return res.status(400).json({ error: 'symbols parameter required' });
    }

    const symbolList = symbols.split(',').map((s) => s.trim().toUpperCase());
    const placeholders = symbolList.map(() => '?').join(',');

    const signals = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sentiment_signal as signal,
        c.sentiment_score as sentiment,
        c.sentiment_confidence as confidence,
        c.sentiment_updated_at as updatedAt,
        c.reddit_mentions_24h as mentions24h,
        c.combined_sentiment as combinedSentiment
      FROM companies c
      WHERE c.symbol IN (${placeholders})
    `).all(...symbolList);

    res.json(signals);
  } catch (error) {
    console.error('Batch signals API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// IMPORTANT: Static routes must be defined before :symbol routes
// ========================================

/**
 * GET /api/sentiment/sources-overview
 * Get aggregated sentiment breakdown by source (Reddit, StockTwits, News)
 */
router.get('/sources-overview', async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    // Reddit sentiment summary
    const dateInterval = getSafeDateInterval(period);
    const redditStats = database.prepare(`
      SELECT
        COUNT(*) as post_count,
        AVG(sentiment_score) as avg_sentiment,
        SUM(CASE WHEN sentiment_score > 0.05 THEN 1 ELSE 0 END) as bullish_count,
        SUM(CASE WHEN sentiment_score < -0.05 THEN 1 ELSE 0 END) as bearish_count,
        SUM(CASE WHEN sentiment_score BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral_count
      FROM reddit_posts
      WHERE posted_at >= datetime('now', ?)
    `).get(dateInterval);

    // Top subreddits
    const topSubreddits = database.prepare(`
      SELECT subreddit, COUNT(*) as count
      FROM reddit_posts
      WHERE posted_at >= datetime('now', ?)
      GROUP BY subreddit
      ORDER BY count DESC
      LIMIT 5
    `).all(dateInterval);

    // StockTwits sentiment summary
    let stocktwitsStats = { message_count: 0, avg_sentiment: 0, bullish_count: 0, bearish_count: 0, neutral_count: 0 };
    try {
      stocktwitsStats = database.prepare(`
        SELECT
          COUNT(*) as message_count,
          AVG(nlp_sentiment_score) as avg_sentiment,
          SUM(CASE WHEN user_sentiment = 'Bullish' OR nlp_sentiment_score > 0.05 THEN 1 ELSE 0 END) as bullish_count,
          SUM(CASE WHEN user_sentiment = 'Bearish' OR nlp_sentiment_score < -0.05 THEN 1 ELSE 0 END) as bearish_count,
          SUM(CASE WHEN user_sentiment IS NULL AND nlp_sentiment_score BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral_count
        FROM stocktwits_messages
        WHERE posted_at >= datetime('now', ?)
      `).get(dateInterval) || stocktwitsStats;
    } catch (e) {
      // Table may not exist
    }

    // News sentiment summary
    let newsStats = { article_count: 0, avg_sentiment: 0, bullish_count: 0, bearish_count: 0, neutral_count: 0 };
    try {
      newsStats = database.prepare(`
        SELECT
          COUNT(*) as article_count,
          AVG(sentiment_score) as avg_sentiment,
          SUM(CASE WHEN sentiment_score > 0.05 THEN 1 ELSE 0 END) as bullish_count,
          SUM(CASE WHEN sentiment_score < -0.05 THEN 1 ELSE 0 END) as bearish_count,
          SUM(CASE WHEN sentiment_score BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral_count
        FROM news_articles
        WHERE published_at >= datetime('now', ?)
      `).get(dateInterval) || newsStats;
    } catch (e) {
      // Table may not exist
    }

    // Top news sources
    let topNewsSources = [];
    try {
      topNewsSources = database.prepare(`
        SELECT source, COUNT(*) as count
        FROM news_articles
        WHERE published_at >= datetime('now', ?)
        GROUP BY source
        ORDER BY count DESC
        LIMIT 5
      `).all(dateInterval);
    } catch (e) {
      // Table may not exist
    }

    // Calculate divergences - find stocks where sources disagree significantly
    // OPTIMIZED: Single batch query with subquery instead of N+1 loop queries
    const divergences = [];
    try {
      // Get tickers with both Reddit and News sentiment in one query using a correlated subquery
      const tickersWithDivergences = database.prepare(`
        SELECT
          t.symbol,
          t.avg_sentiment as reddit_sentiment,
          c.id as company_id,
          (
            SELECT AVG(sentiment_score)
            FROM news_articles na
            WHERE na.company_id = c.id
              AND na.published_at >= datetime('now', ?)
          ) as news_sentiment
        FROM trending_tickers t
        JOIN companies c ON t.symbol = c.symbol
        WHERE t.period = ?
          AND t.avg_sentiment IS NOT NULL
        ORDER BY t.mention_count DESC
        LIMIT 50
      `).all(dateInterval, period);

      for (const ticker of tickersWithDivergences) {
        if (ticker.news_sentiment !== null && ticker.reddit_sentiment !== null) {
          const diff = Math.abs(ticker.reddit_sentiment - ticker.news_sentiment);
          // Significant divergence if > 0.15 difference
          if (diff > 0.15) {
            divergences.push({
              symbol: ticker.symbol,
              reddit: ticker.reddit_sentiment,
              news: ticker.news_sentiment,
              difference: diff,
              severity: diff > 0.3 ? 'high' : 'medium',
              description: ticker.reddit_sentiment > ticker.news_sentiment
                ? `Reddit bullish (${(ticker.reddit_sentiment * 100).toFixed(0)}) vs News bearish (${(ticker.news_sentiment * 100).toFixed(0)})`
                : `Reddit bearish (${(ticker.reddit_sentiment * 100).toFixed(0)}) vs News bullish (${(ticker.news_sentiment * 100).toFixed(0)})`,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error calculating divergences:', e);
    }

    // Sort divergences by severity
    divergences.sort((a, b) => b.difference - a.difference);

    const totalReddit = (redditStats?.bullish_count || 0) + (redditStats?.bearish_count || 0) + (redditStats?.neutral_count || 0);
    const totalStocktwits = (stocktwitsStats?.bullish_count || 0) + (stocktwitsStats?.bearish_count || 0) + (stocktwitsStats?.neutral_count || 0);
    const totalNews = (newsStats?.bullish_count || 0) + (newsStats?.bearish_count || 0) + (newsStats?.neutral_count || 0);

    res.json({
      period,
      reddit: {
        avgSentiment: redditStats?.avg_sentiment || 0,
        postCount: redditStats?.post_count || 0,
        topSubreddits: topSubreddits.map(s => s.subreddit),
        bullishPct: totalReddit > 0 ? Math.round((redditStats?.bullish_count / totalReddit) * 100) : 0,
        bearishPct: totalReddit > 0 ? Math.round((redditStats?.bearish_count / totalReddit) * 100) : 0,
        neutralPct: totalReddit > 0 ? Math.round((redditStats?.neutral_count / totalReddit) * 100) : 0,
      },
      stocktwits: {
        avgSentiment: stocktwitsStats?.avg_sentiment || 0,
        messageCount: stocktwitsStats?.message_count || 0,
        bullishPct: totalStocktwits > 0 ? Math.round((stocktwitsStats?.bullish_count / totalStocktwits) * 100) : 0,
        bearishPct: totalStocktwits > 0 ? Math.round((stocktwitsStats?.bearish_count / totalStocktwits) * 100) : 0,
        neutralPct: totalStocktwits > 0 ? Math.round((stocktwitsStats?.neutral_count / totalStocktwits) * 100) : 0,
      },
      news: {
        avgSentiment: newsStats?.avg_sentiment || 0,
        articleCount: newsStats?.article_count || 0,
        topSources: topNewsSources.map(s => s.source),
        bullishPct: totalNews > 0 ? Math.round((newsStats?.bullish_count / totalNews) * 100) : 0,
        bearishPct: totalNews > 0 ? Math.round((newsStats?.bearish_count / totalNews) * 100) : 0,
        neutralPct: totalNews > 0 ? Math.round((newsStats?.neutral_count / totalNews) * 100) : 0,
      },
      divergences: divergences.slice(0, 10),
    });
  } catch (error) {
    console.error('Sources overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/analyst-activity
 * Get recent analyst rating changes and activity
 */
router.get('/analyst-activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get stocks with recent analyst estimate changes
    const recentChanges = [];

    // Check for price target changes by comparing current vs history
    const stocksWithHistory = database.prepare(`
      SELECT DISTINCT ae.company_id, c.symbol, c.name
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE EXISTS (
        SELECT 1 FROM analyst_estimates_history aeh
        WHERE aeh.company_id = ae.company_id
      )
      LIMIT 100
    `).all();

    for (const stock of stocksWithHistory) {
      const current = database.prepare(`
        SELECT
          target_mean, target_median, recommendation_key, recommendation_mean,
          buy_percent, number_of_analysts, fetched_at
        FROM analyst_estimates
        WHERE company_id = ?
      `).get(stock.company_id);

      const previous = database.prepare(`
        SELECT
          target_mean, target_median, recommendation_key, recommendation_mean,
          buy_percent, number_of_analysts, archived_at
        FROM analyst_estimates_history
        WHERE company_id = ?
        ORDER BY archived_at DESC
        LIMIT 1
      `).get(stock.company_id);

      if (current && previous) {
        // Check for rating change
        if (current.recommendation_key !== previous.recommendation_key) {
          const isUpgrade = current.recommendation_mean < previous.recommendation_mean;
          recentChanges.push({
            symbol: stock.symbol,
            name: stock.name,
            action: isUpgrade ? 'upgrade' : 'downgrade',
            from: previous.recommendation_key,
            to: current.recommendation_key,
            priceTarget: current.target_mean,
            date: current.fetched_at,
            type: 'rating_change',
          });
        }

        // Check for significant price target change (> 5%)
        if (current.target_mean && previous.target_mean) {
          const ptChange = ((current.target_mean - previous.target_mean) / previous.target_mean) * 100;
          if (Math.abs(ptChange) > 5) {
            recentChanges.push({
              symbol: stock.symbol,
              name: stock.name,
              action: ptChange > 0 ? 'pt_raise' : 'pt_lower',
              oldTarget: previous.target_mean,
              newTarget: current.target_mean,
              changePercent: ptChange,
              date: current.fetched_at,
              type: 'price_target',
            });
          }
        }

        // Check for significant consensus shift (> 10%)
        if (current.buy_percent && previous.buy_percent) {
          const consensusChange = current.buy_percent - previous.buy_percent;
          if (Math.abs(consensusChange) > 10) {
            recentChanges.push({
              symbol: stock.symbol,
              name: stock.name,
              action: consensusChange > 0 ? 'consensus_improve' : 'consensus_decline',
              oldBuyPercent: previous.buy_percent,
              newBuyPercent: current.buy_percent,
              change: consensusChange,
              date: current.fetched_at,
              type: 'consensus_shift',
            });
          }
        }
      }
    }

    // Sort by date, most recent first
    recentChanges.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get strong buy stocks (>80% buy consensus)
    const strongBuys = database.prepare(`
      SELECT
        c.symbol, c.name, c.sector,
        ae.buy_percent, ae.target_mean, ae.current_price,
        ae.upside_potential, ae.number_of_analysts
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE ae.buy_percent >= 80
        AND ae.number_of_analysts >= 5
      ORDER BY ae.buy_percent DESC, ae.upside_potential DESC
      LIMIT 10
    `).all();

    // Get top upside stocks
    const topUpside = database.prepare(`
      SELECT
        c.symbol, c.name, c.sector,
        ae.upside_potential, ae.target_mean, ae.current_price,
        ae.buy_percent, ae.number_of_analysts
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE ae.upside_potential > 0
        AND ae.number_of_analysts >= 5
      ORDER BY ae.upside_potential DESC
      LIMIT 10
    `).all();

    res.json({
      recentChanges: recentChanges.slice(0, parseInt(limit)),
      strongBuys,
      topUpside,
      totalChanges: recentChanges.length,
    });
  } catch (error) {
    console.error('Analyst activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/insider-activity
 * Get recent insider trading activity across all tracked stocks
 */
router.get('/insider-activity', async (req, res) => {
  try {
    const { days = 30, limit = 50 } = req.query;

    // Get significant insider buys (bullish signal)
    const significantBuys = database.prepare(`
      SELECT
        c.symbol,
        c.name as company_name,
        i.name as insider_name,
        i.title as insider_title,
        it.transaction_type,
        it.transaction_date,
        it.shares_transacted,
        it.price_per_share,
        it.total_value,
        it.shares_owned_after
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.transaction_type IN ('buy', 'purchase')
        AND it.transaction_date >= date('now', '-' || ? || ' days')
        AND it.total_value >= 50000
      ORDER BY it.total_value DESC
      LIMIT ?
    `).all(parseInt(days), parseInt(limit));

    // Get significant insider sells (bearish signal)
    const significantSells = database.prepare(`
      SELECT
        c.symbol,
        c.name as company_name,
        i.name as insider_name,
        i.title as insider_title,
        it.transaction_type,
        it.transaction_date,
        it.shares_transacted,
        it.price_per_share,
        it.total_value,
        it.shares_owned_after
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.transaction_type IN ('sell', 'sale')
        AND it.transaction_date >= date('now', '-' || ? || ' days')
        AND it.total_value >= 100000
      ORDER BY it.total_value DESC
      LIMIT ?
    `).all(parseInt(days), parseInt(limit));

    // Get insider activity summary by stock
    const activityByStock = database.prepare(`
      SELECT
        c.symbol,
        c.name as company_name,
        COUNT(CASE WHEN it.transaction_type IN ('buy', 'purchase') THEN 1 END) as buy_count,
        COUNT(CASE WHEN it.transaction_type IN ('sell', 'sale') THEN 1 END) as sell_count,
        SUM(CASE WHEN it.transaction_type IN ('buy', 'purchase') THEN it.total_value ELSE 0 END) as total_bought,
        SUM(CASE WHEN it.transaction_type IN ('sell', 'sale') THEN it.total_value ELSE 0 END) as total_sold,
        COUNT(DISTINCT it.insider_id) as unique_insiders,
        MAX(it.transaction_date) as last_activity
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      WHERE it.transaction_date >= date('now', '-' || ? || ' days')
      GROUP BY c.symbol, c.name
      HAVING (buy_count > 0 OR sell_count > 0)
      ORDER BY (total_bought - total_sold) DESC
      LIMIT 20
    `).all(parseInt(days));

    // Calculate net insider sentiment
    const netBuying = activityByStock.filter(s => s.total_bought > s.total_sold);
    const netSelling = activityByStock.filter(s => s.total_sold > s.total_bought);

    // Get overall statistics
    const overallStats = database.prepare(`
      SELECT
        COUNT(CASE WHEN transaction_type IN ('buy', 'purchase') THEN 1 END) as total_buys,
        COUNT(CASE WHEN transaction_type IN ('sell', 'sale') THEN 1 END) as total_sells,
        SUM(CASE WHEN transaction_type IN ('buy', 'purchase') THEN total_value ELSE 0 END) as total_buy_value,
        SUM(CASE WHEN transaction_type IN ('sell', 'sale') THEN total_value ELSE 0 END) as total_sell_value,
        COUNT(DISTINCT company_id) as companies_with_activity
      FROM insider_transactions
      WHERE transaction_date >= date('now', '-' || ? || ' days')
    `).get(parseInt(days));

    res.json({
      period: `${days} days`,
      overview: {
        totalBuys: overallStats?.total_buys || 0,
        totalSells: overallStats?.total_sells || 0,
        totalBuyValue: overallStats?.total_buy_value || 0,
        totalSellValue: overallStats?.total_sell_value || 0,
        companiesWithActivity: overallStats?.companies_with_activity || 0,
        buyToSellRatio: overallStats?.total_sells > 0
          ? (overallStats?.total_buys / overallStats?.total_sells).toFixed(2)
          : 'N/A',
      },
      significantBuys: significantBuys.map(tx => ({
        symbol: tx.symbol,
        companyName: tx.company_name,
        insiderName: tx.insider_name,
        insiderTitle: tx.insider_title,
        type: 'buy',
        date: tx.transaction_date,
        shares: tx.shares_transacted,
        pricePerShare: tx.price_per_share,
        totalValue: tx.total_value,
        sharesOwnedAfter: tx.shares_owned_after,
      })),
      significantSells: significantSells.map(tx => ({
        symbol: tx.symbol,
        companyName: tx.company_name,
        insiderName: tx.insider_name,
        insiderTitle: tx.insider_title,
        type: 'sell',
        date: tx.transaction_date,
        shares: tx.shares_transacted,
        pricePerShare: tx.price_per_share,
        totalValue: tx.total_value,
        sharesOwnedAfter: tx.shares_owned_after,
      })),
      netBuying: netBuying.slice(0, 10).map(s => ({
        symbol: s.symbol,
        companyName: s.company_name,
        buyCount: s.buy_count,
        sellCount: s.sell_count,
        netFlow: s.total_bought - s.total_sold,
        uniqueInsiders: s.unique_insiders,
        lastActivity: s.last_activity,
      })),
      netSelling: netSelling.slice(0, 10).map(s => ({
        symbol: s.symbol,
        companyName: s.company_name,
        buyCount: s.buy_count,
        sellCount: s.sell_count,
        netFlow: s.total_sold - s.total_bought,
        uniqueInsiders: s.unique_insiders,
        lastActivity: s.last_activity,
      })),
    });
  } catch (error) {
    console.error('Insider activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/trending-enhanced
 * Get enhanced trending tickers with multi-source breakdown
 */
router.get('/trending-enhanced', async (req, res) => {
  try {
    const { period = '24h', limit = 30, region = 'US' } = req.query;
    const dateInterval = getSafeDateInterval(period);
    // Use region-specific period key for EU
    const periodKey = region === 'US' ? period : `${period}_${region}`;

    // Get base trending data
    const trending = database.prepare(`
      SELECT
        t.*,
        c.name as company_name,
        c.sector,
        c.id as company_id
      FROM trending_tickers t
      LEFT JOIN companies c ON t.symbol = c.symbol
      WHERE t.period = ?
      ORDER BY t.rank_by_mentions
      LIMIT ?
    `).all(periodKey, parseInt(limit));

    // OPTIMIZED: Batch fetch all data sources instead of N+1 queries per ticker
    // Extract company_ids and symbols for batch queries
    const companyIds = trending.map(t => t.company_id).filter(Boolean);
    const symbols = trending.map(t => t.symbol);

    if (companyIds.length === 0) {
      return res.json({ period, region, count: 0, trending: [] });
    }

    const companyIdPlaceholders = companyIds.map(() => '?').join(',');

    // Batch query: Reddit data for all tickers
    const redditDataMap = new Map();
    try {
      const redditRows = database.prepare(`
        SELECT
          company_id,
          COUNT(*) as post_count,
          AVG(sentiment_score) as avg_sentiment,
          SUM(score) as total_score
        FROM reddit_posts
        WHERE company_id IN (${companyIdPlaceholders})
          AND posted_at >= datetime('now', ?)
        GROUP BY company_id
      `).all(...companyIds, dateInterval);
      for (const row of redditRows) {
        redditDataMap.set(row.company_id, row);
      }
    } catch (e) { /* table may not exist */ }

    // Batch query: StockTwits data for all tickers
    const stocktwitsDataMap = new Map();
    try {
      const stocktwitsRows = database.prepare(`
        SELECT
          company_id,
          COUNT(*) as message_count,
          AVG(nlp_sentiment_score) as avg_sentiment
        FROM stocktwits_messages
        WHERE company_id IN (${companyIdPlaceholders})
          AND posted_at >= datetime('now', ?)
        GROUP BY company_id
      `).all(...companyIds, dateInterval);
      for (const row of stocktwitsRows) {
        stocktwitsDataMap.set(row.company_id, row);
      }
    } catch (e) { /* table may not exist */ }

    // Batch query: News data for all tickers
    const newsDataMap = new Map();
    try {
      const newsRows = database.prepare(`
        SELECT
          company_id,
          COUNT(*) as article_count,
          AVG(sentiment_score) as avg_sentiment
        FROM news_articles
        WHERE company_id IN (${companyIdPlaceholders})
          AND published_at >= datetime('now', ?)
        GROUP BY company_id
      `).all(...companyIds, dateInterval);
      for (const row of newsRows) {
        newsDataMap.set(row.company_id, row);
      }
    } catch (e) { /* table may not exist */ }

    // Batch query: Insider activity for all tickers
    const insiderDataMap = new Map();
    try {
      const insiderRows = database.prepare(`
        SELECT
          company_id,
          COUNT(CASE WHEN transaction_type IN ('buy', 'purchase') THEN 1 END) as buy_count,
          COUNT(CASE WHEN transaction_type IN ('sell', 'sale') THEN 1 END) as sell_count,
          COALESCE(SUM(CASE WHEN transaction_type IN ('buy', 'purchase') THEN total_value ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN transaction_type IN ('sell', 'sale') THEN total_value ELSE 0 END), 0) as net_value
        FROM insider_transactions
        WHERE company_id IN (${companyIdPlaceholders})
          AND transaction_date >= date('now', '-30 days')
        GROUP BY company_id
      `).all(...companyIds);
      for (const row of insiderRows) {
        insiderDataMap.set(row.company_id, row);
      }
    } catch (e) { /* table may not exist */ }

    // Batch query: Analyst data for all tickers
    const analystDataMap = new Map();
    try {
      const analystRows = database.prepare(`
        SELECT
          company_id,
          target_mean,
          current_price,
          upside_potential,
          buy_percent,
          recommendation_key
        FROM analyst_estimates
        WHERE company_id IN (${companyIdPlaceholders})
      `).all(...companyIds);
      for (const row of analystRows) {
        analystDataMap.set(row.company_id, row);
      }
    } catch (e) { /* table may not exist */ }

    // Batch query: Recent sentiment (last 3 days) for momentum calculation
    const recentSentimentMap = new Map();
    try {
      const recentRows = database.prepare(`
        SELECT
          company_id,
          AVG(sentiment_score) as avg
        FROM reddit_posts
        WHERE company_id IN (${companyIdPlaceholders})
          AND posted_at >= datetime('now', '-3 days')
        GROUP BY company_id
      `).all(...companyIds);
      for (const row of recentRows) {
        recentSentimentMap.set(row.company_id, row.avg);
      }
    } catch (e) { /* ignore */ }

    // Batch query: Older sentiment (3-7 days ago) for momentum calculation
    const olderSentimentMap = new Map();
    try {
      const olderRows = database.prepare(`
        SELECT
          company_id,
          AVG(sentiment_score) as avg
        FROM reddit_posts
        WHERE company_id IN (${companyIdPlaceholders})
          AND posted_at >= datetime('now', '-7 days')
          AND posted_at < datetime('now', '-3 days')
        GROUP BY company_id
      `).all(...companyIds);
      for (const row of olderRows) {
        olderSentimentMap.set(row.company_id, row.avg);
      }
    } catch (e) { /* ignore */ }

    // Enhance each ticker with pre-fetched data (no additional queries!)
    const enhanced = [];

    for (const ticker of trending) {
      const companyId = ticker.company_id;

      // Look up pre-fetched data from Maps
      const redditData = redditDataMap.get(companyId) || { post_count: 0, avg_sentiment: 0, total_score: 0 };
      const stocktwitsData = stocktwitsDataMap.get(companyId) || { message_count: 0, avg_sentiment: 0 };
      const newsData = newsDataMap.get(companyId) || { article_count: 0, avg_sentiment: 0 };
      const insiderData = insiderDataMap.get(companyId) || { buy_count: 0, sell_count: 0, net_value: 0 };
      const analystData = analystDataMap.get(companyId) || null;

      // Calculate momentum from pre-fetched sentiment data
      let momentum = 0;
      const recentAvg = recentSentimentMap.get(companyId);
      const olderAvg = olderSentimentMap.get(companyId);
      if (recentAvg && olderAvg) {
        momentum = recentAvg - olderAvg;
      }

      // Calculate composite score (weighted average of sources)
      const weights = { reddit: 0.35, stocktwits: 0.25, news: 0.25, analyst: 0.15 };
      let compositeScore = 0;
      let totalWeight = 0;

      if (redditData?.avg_sentiment) {
        compositeScore += redditData.avg_sentiment * weights.reddit;
        totalWeight += weights.reddit;
      }
      if (stocktwitsData?.avg_sentiment) {
        compositeScore += stocktwitsData.avg_sentiment * weights.stocktwits;
        totalWeight += weights.stocktwits;
      }
      if (newsData?.avg_sentiment) {
        compositeScore += newsData.avg_sentiment * weights.news;
        totalWeight += weights.news;
      }
      if (analystData?.buy_percent) {
        // Normalize analyst buy_percent to -1 to 1 scale
        const analystSentiment = (analystData.buy_percent - 50) / 50;
        compositeScore += analystSentiment * weights.analyst;
        totalWeight += weights.analyst;
      }

      if (totalWeight > 0) {
        compositeScore = compositeScore / totalWeight;
      }

      enhanced.push({
        symbol: ticker.symbol,
        companyName: ticker.company_name,
        sector: ticker.sector,
        mentionCount: ticker.mention_count,
        uniquePosts: ticker.unique_posts,
        avgSentiment: ticker.avg_sentiment,
        compositeScore,
        momentum,
        sources: {
          reddit: {
            postCount: redditData?.post_count || 0,
            sentiment: redditData?.avg_sentiment || 0,
            score: redditData?.total_score || 0,
          },
          stocktwits: {
            messageCount: stocktwitsData?.message_count || 0,
            sentiment: stocktwitsData?.avg_sentiment || 0,
          },
          news: {
            articleCount: newsData?.article_count || 0,
            sentiment: newsData?.avg_sentiment || 0,
          },
        },
        insider: {
          buyCount: insiderData?.buy_count || 0,
          sellCount: insiderData?.sell_count || 0,
          netValue: insiderData?.net_value || 0,
          signal: insiderData?.net_value > 100000 ? 'bullish' :
                  insiderData?.net_value < -100000 ? 'bearish' : 'neutral',
        },
        analyst: analystData ? {
          targetPrice: analystData.target_mean,
          currentPrice: analystData.current_price,
          upsidePotential: analystData.upside_potential,
          buyPercent: analystData.buy_percent,
          recommendation: analystData.recommendation_key,
        } : null,
        calculatedAt: ticker.calculated_at,
      });
    }

    // Sort by composite score
    enhanced.sort((a, b) => Math.abs(b.compositeScore) - Math.abs(a.compositeScore));

    res.json({
      period,
      region,
      count: enhanced.length,
      trending: enhanced,
    });
  } catch (error) {
    console.error('Enhanced trending error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// Dynamic :symbol routes below
// ========================================

/**
 * GET /api/sentiment/:symbol
 * Get full sentiment analysis for a stock
 */
router.get('/:symbol', async (req, res) => {
  try {
    if (!redditFetcher || !signalGenerator) {
      return res.status(503).json({ error: 'Sentiment service unavailable' });
    }

    const { symbol } = req.params;
    const { period = '7d', refresh = 'false' } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Optionally refresh data from Reddit
    if (refresh === 'true') {
      await redditFetcher.fetchTickerSentiment(symbol.toUpperCase(), company.id);
    }

    // Calculate signal
    const signal = await signalGenerator.calculateSignal(company.id, symbol, period);

    // Get recent posts for display
    const recentPosts = database.prepare(`
      SELECT
        post_id, subreddit, title, permalink, score, num_comments,
        posted_at, sentiment_score, sentiment_label,
        is_dd, is_yolo, mentions_buy, mentions_sell, has_rockets
      FROM reddit_posts
      WHERE company_id = ?
      ORDER BY score DESC
      LIMIT 10
    `).all(company.id);

    res.json({
      symbol: company.symbol,
      name: company.name,
      analysis: signal,
      topPosts: recentPosts,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sentiment API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/combined
 * Get combined multi-source sentiment for a stock
 */
router.get('/:symbol/combined', async (req, res) => {
  try {
    if (!sentimentAggregator) {
      return res.status(503).json({ error: 'Sentiment aggregator unavailable' });
    }

    const { symbol } = req.params;
    const { refresh = 'false', region = 'US' } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const combined = await sentimentAggregator.aggregateSentiment(
      symbol.toUpperCase(),
      company.id,
      { skipCache: refresh === 'true', region }
    );

    res.json({
      symbol: company.symbol,
      name: company.name,
      region,
      ...combined,
    });
  } catch (error) {
    console.error('Combined sentiment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/stocktwits
 * Get StockTwits sentiment for a stock
 */
router.get('/:symbol/stocktwits', async (req, res) => {
  try {
    if (!stocktwitsFetcher) {
      return res.status(503).json({ error: 'StockTwits service unavailable' });
    }

    const { symbol } = req.params;
    const { refresh = 'false', limit = 30 } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (refresh === 'true') {
      const result = await stocktwitsFetcher.fetchSymbolSentiment(
        symbol.toUpperCase(),
        company.id
      );
      res.json({
        symbol: symbol.toUpperCase(),
        ...result,
      });
    } else {
      // Get from database
      const messages = database.prepare(`
        SELECT * FROM stocktwits_messages
        WHERE company_id = ?
        ORDER BY posted_at DESC
        LIMIT ?
      `).all(company.id, parseInt(limit));

      const summary = stocktwitsFetcher.calculateSummary(
        messages.map((m) => ({
          userSentiment: m.user_sentiment,
          nlpSentimentScore: m.nlp_sentiment_score,
          nlpSentimentLabel: m.nlp_sentiment_label,
        }))
      );

      res.json({
        symbol: symbol.toUpperCase(),
        messages,
        sentiment: summary,
      });
    }
  } catch (error) {
    console.error('StockTwits API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sentiment/:symbol/refresh
 * Force refresh sentiment data from Reddit
 */
router.post('/:symbol/refresh', async (req, res) => {
  try {
    if (!redditFetcher || !signalGenerator) {
      return res.status(503).json({ error: 'Sentiment service unavailable' });
    }

    const { symbol } = req.params;
    const { region = 'US' } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Fetch fresh data
    const posts = await redditFetcher.fetchTickerSentiment(
      symbol.toUpperCase(),
      company.id,
      { region }
    );

    // Recalculate signal
    const signal = await signalGenerator.calculateSignal(company.id, symbol, '7d');

    res.json({
      message: `Fetched ${posts.length} posts for ${symbol}`,
      region,
      signal: signal.signal,
      confidence: signal.confidence,
      postCount: posts.length,
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sentiment/:symbol/refresh-all
 * Force refresh all sentiment sources for a stock
 */
router.post('/:symbol/refresh-all', async (req, res) => {
  try {
    if (!sentimentAggregator) {
      return res.status(503).json({ error: 'Sentiment aggregator unavailable' });
    }

    const { symbol } = req.params;
    const { region = 'US' } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Force refresh all sources
    const combined = await sentimentAggregator.aggregateSentiment(
      symbol.toUpperCase(),
      company.id,
      { skipCache: true, region }
    );

    res.json({
      message: `Refreshed all sentiment sources for ${symbol}`,
      region,
      combined: combined.combined,
      sourcesUsed: combined.combined.sourcesUsed,
    });
  } catch (error) {
    console.error('Refresh-all error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/history
 * Get sentiment history for charting
 */
router.get('/:symbol/history', async (req, res) => {
  try {
    if (!signalGenerator) {
      return res.status(503).json({ error: 'Sentiment service unavailable' });
    }

    const { symbol } = req.params;
    const { days = 30, source = 'reddit' } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    let history;

    if (source === 'combined' && sentimentAggregator) {
      history = sentimentAggregator.getSentimentHistory(company.id, parseInt(days));
    } else {
      // Try to get from history table first
      history = signalGenerator.getHistory(company.id, parseInt(days));

      // If no history data, try to aggregate from posts
      if (history.length === 0) {
        history = signalGenerator.getHistoryFromPosts(company.id, parseInt(days));
      }
    }

    res.json({
      symbol: symbol.toUpperCase(),
      days: parseInt(days),
      source,
      history,
    });
  } catch (error) {
    console.error('History API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/posts
 * Get Reddit posts for a stock
 */
router.get('/:symbol/posts', async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      limit = 50,
      sort = 'score',
      subreddit = null,
    } = req.query;

    const upperSymbol = symbol.toUpperCase();

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(upperSymbol);

    let orderBy;
    switch (sort) {
      case 'date':
        orderBy = 'posted_at DESC';
        break;
      case 'sentiment':
        orderBy = 'sentiment_score DESC';
        break;
      default:
        orderBy = 'score DESC';
    }

    let posts;

    if (company) {
      let query = `
        SELECT * FROM reddit_posts
        WHERE company_id = ?
      `;
      const params = [company.id];

      if (subreddit) {
        query += ' AND subreddit = ?';
        params.push(subreddit);
      }

      query += ` ORDER BY ${orderBy} LIMIT ?`;
      params.push(parseInt(limit));

      posts = database.prepare(query).all(...params);
    } else {
      let query = `
        SELECT * FROM reddit_posts
        WHERE tickers_mentioned LIKE ?
      `;
      const params = [`%"${upperSymbol}"%`];

      if (subreddit) {
        query += ' AND subreddit = ?';
        params.push(subreddit);
      }

      query += ` ORDER BY ${orderBy} LIMIT ?`;
      params.push(parseInt(limit));

      posts = database.prepare(query).all(...params);
    }

    res.json({ posts });
  } catch (error) {
    console.error('Posts API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/news
 * Get news sentiment for a stock
 */
router.get('/:symbol/news', async (req, res) => {
  try {
    if (!newsFetcher) {
      return res.status(503).json({ error: 'News service unavailable' });
    }

    const { symbol } = req.params;
    const { refresh = 'false', limit = 20, region = 'US' } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Optionally refresh from news sources
    if (refresh === 'true') {
      await newsFetcher.fetchAllNews(symbol.toUpperCase(), company.id, { region });
    }

    // Get recent news
    const articles = newsFetcher.getRecentNews(company.id, parseInt(limit));

    // Get summary stats
    const summary = newsFetcher.getNewsSummary(company.id, 7);

    res.json({
      symbol: symbol.toUpperCase(),
      region,
      articles,
      summary,
    });
  } catch (error) {
    console.error('News API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sentiment/:symbol/news/refresh
 * Force refresh news from RSS feeds and APIs
 */
router.post('/:symbol/news/refresh', async (req, res) => {
  try {
    if (!newsFetcher) {
      return res.status(503).json({ error: 'News service unavailable' });
    }

    const { symbol } = req.params;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const result = await newsFetcher.fetchAllNews(symbol.toUpperCase(), company.id);

    res.json({
      message: `Fetched ${result.articles?.length || 0} news articles for ${symbol}`,
      articleCount: result.articles?.length || 0,
      sentiment: result.sentiment,
    });
  } catch (error) {
    console.error('News refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/sources-overview
 * Get aggregated sentiment breakdown by source (Reddit, StockTwits, News)
 */
router.get('/sources-overview', async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    // Reddit sentiment summary
    const dateInterval = getSafeDateInterval(period);
    const redditStats = database.prepare(`
      SELECT
        COUNT(*) as post_count,
        AVG(sentiment_score) as avg_sentiment,
        SUM(CASE WHEN sentiment_score > 0.05 THEN 1 ELSE 0 END) as bullish_count,
        SUM(CASE WHEN sentiment_score < -0.05 THEN 1 ELSE 0 END) as bearish_count,
        SUM(CASE WHEN sentiment_score BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral_count
      FROM reddit_posts
      WHERE posted_at >= datetime('now', ?)
    `).get(dateInterval);

    // Top subreddits
    const topSubreddits = database.prepare(`
      SELECT subreddit, COUNT(*) as count
      FROM reddit_posts
      WHERE posted_at >= datetime('now', ?)
      GROUP BY subreddit
      ORDER BY count DESC
      LIMIT 5
    `).all(dateInterval);

    // StockTwits sentiment summary
    let stocktwitsStats = { message_count: 0, avg_sentiment: 0, bullish_count: 0, bearish_count: 0, neutral_count: 0 };
    try {
      stocktwitsStats = database.prepare(`
        SELECT
          COUNT(*) as message_count,
          AVG(nlp_sentiment_score) as avg_sentiment,
          SUM(CASE WHEN user_sentiment = 'Bullish' OR nlp_sentiment_score > 0.05 THEN 1 ELSE 0 END) as bullish_count,
          SUM(CASE WHEN user_sentiment = 'Bearish' OR nlp_sentiment_score < -0.05 THEN 1 ELSE 0 END) as bearish_count,
          SUM(CASE WHEN user_sentiment IS NULL AND nlp_sentiment_score BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral_count
        FROM stocktwits_messages
        WHERE posted_at >= datetime('now', ?)
      `).get(dateInterval) || stocktwitsStats;
    } catch (e) {
      // Table may not exist
    }

    // News sentiment summary
    let newsStats = { article_count: 0, avg_sentiment: 0, bullish_count: 0, bearish_count: 0, neutral_count: 0 };
    try {
      newsStats = database.prepare(`
        SELECT
          COUNT(*) as article_count,
          AVG(sentiment_score) as avg_sentiment,
          SUM(CASE WHEN sentiment_score > 0.05 THEN 1 ELSE 0 END) as bullish_count,
          SUM(CASE WHEN sentiment_score < -0.05 THEN 1 ELSE 0 END) as bearish_count,
          SUM(CASE WHEN sentiment_score BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral_count
        FROM news_articles
        WHERE published_at >= datetime('now', ?)
      `).get(dateInterval) || newsStats;
    } catch (e) {
      // Table may not exist
    }

    // Top news sources
    let topNewsSources = [];
    try {
      topNewsSources = database.prepare(`
        SELECT source, COUNT(*) as count
        FROM news_articles
        WHERE published_at >= datetime('now', ?)
        GROUP BY source
        ORDER BY count DESC
        LIMIT 5
      `).all(dateInterval);
    } catch (e) {
      // Table may not exist
    }

    // Calculate divergences - find stocks where sources disagree significantly
    // OPTIMIZED: Single batch query with subquery instead of N+1 loop queries
    const divergences = [];
    try {
      // Get tickers with both Reddit and News sentiment in one query using a correlated subquery
      const tickersWithDivergences = database.prepare(`
        SELECT
          t.symbol,
          t.avg_sentiment as reddit_sentiment,
          c.id as company_id,
          (
            SELECT AVG(sentiment_score)
            FROM news_articles na
            WHERE na.company_id = c.id
              AND na.published_at >= datetime('now', ?)
          ) as news_sentiment
        FROM trending_tickers t
        JOIN companies c ON t.symbol = c.symbol
        WHERE t.period = ?
          AND t.avg_sentiment IS NOT NULL
        ORDER BY t.mention_count DESC
        LIMIT 50
      `).all(dateInterval, period);

      for (const ticker of tickersWithDivergences) {
        if (ticker.news_sentiment !== null && ticker.reddit_sentiment !== null) {
          const diff = Math.abs(ticker.reddit_sentiment - ticker.news_sentiment);
          // Significant divergence if > 0.15 difference
          if (diff > 0.15) {
            divergences.push({
              symbol: ticker.symbol,
              reddit: ticker.reddit_sentiment,
              news: ticker.news_sentiment,
              difference: diff,
              severity: diff > 0.3 ? 'high' : 'medium',
              description: ticker.reddit_sentiment > ticker.news_sentiment
                ? `Reddit bullish (${(ticker.reddit_sentiment * 100).toFixed(0)}) vs News bearish (${(ticker.news_sentiment * 100).toFixed(0)})`
                : `Reddit bearish (${(ticker.reddit_sentiment * 100).toFixed(0)}) vs News bullish (${(ticker.news_sentiment * 100).toFixed(0)})`,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error calculating divergences:', e);
    }

    // Sort divergences by severity
    divergences.sort((a, b) => b.difference - a.difference);

    const totalReddit = (redditStats?.bullish_count || 0) + (redditStats?.bearish_count || 0) + (redditStats?.neutral_count || 0);
    const totalStocktwits = (stocktwitsStats?.bullish_count || 0) + (stocktwitsStats?.bearish_count || 0) + (stocktwitsStats?.neutral_count || 0);
    const totalNews = (newsStats?.bullish_count || 0) + (newsStats?.bearish_count || 0) + (newsStats?.neutral_count || 0);

    res.json({
      period,
      reddit: {
        avgSentiment: redditStats?.avg_sentiment || 0,
        postCount: redditStats?.post_count || 0,
        topSubreddits: topSubreddits.map(s => s.subreddit),
        bullishPct: totalReddit > 0 ? Math.round((redditStats?.bullish_count / totalReddit) * 100) : 0,
        bearishPct: totalReddit > 0 ? Math.round((redditStats?.bearish_count / totalReddit) * 100) : 0,
        neutralPct: totalReddit > 0 ? Math.round((redditStats?.neutral_count / totalReddit) * 100) : 0,
      },
      stocktwits: {
        avgSentiment: stocktwitsStats?.avg_sentiment || 0,
        messageCount: stocktwitsStats?.message_count || 0,
        bullishPct: totalStocktwits > 0 ? Math.round((stocktwitsStats?.bullish_count / totalStocktwits) * 100) : 0,
        bearishPct: totalStocktwits > 0 ? Math.round((stocktwitsStats?.bearish_count / totalStocktwits) * 100) : 0,
        neutralPct: totalStocktwits > 0 ? Math.round((stocktwitsStats?.neutral_count / totalStocktwits) * 100) : 0,
      },
      news: {
        avgSentiment: newsStats?.avg_sentiment || 0,
        articleCount: newsStats?.article_count || 0,
        topSources: topNewsSources.map(s => s.source),
        bullishPct: totalNews > 0 ? Math.round((newsStats?.bullish_count / totalNews) * 100) : 0,
        bearishPct: totalNews > 0 ? Math.round((newsStats?.bearish_count / totalNews) * 100) : 0,
        neutralPct: totalNews > 0 ? Math.round((newsStats?.neutral_count / totalNews) * 100) : 0,
      },
      divergences: divergences.slice(0, 10),
    });
  } catch (error) {
    console.error('Sources overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/analyst-activity
 * Get recent analyst rating changes and activity
 */
router.get('/analyst-activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get stocks with recent analyst estimate changes
    const recentChanges = [];

    // Check for price target changes by comparing current vs history
    const stocksWithHistory = database.prepare(`
      SELECT DISTINCT ae.company_id, c.symbol, c.name
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE EXISTS (
        SELECT 1 FROM analyst_estimates_history aeh
        WHERE aeh.company_id = ae.company_id
      )
      LIMIT 100
    `).all();

    for (const stock of stocksWithHistory) {
      const current = database.prepare(`
        SELECT
          target_mean, target_median, recommendation_key, recommendation_mean,
          buy_percent, number_of_analysts, fetched_at
        FROM analyst_estimates
        WHERE company_id = ?
      `).get(stock.company_id);

      const previous = database.prepare(`
        SELECT
          target_mean, target_median, recommendation_key, recommendation_mean,
          buy_percent, number_of_analysts, archived_at
        FROM analyst_estimates_history
        WHERE company_id = ?
        ORDER BY archived_at DESC
        LIMIT 1
      `).get(stock.company_id);

      if (current && previous) {
        // Check for rating change
        if (current.recommendation_key !== previous.recommendation_key) {
          const isUpgrade = current.recommendation_mean < previous.recommendation_mean;
          recentChanges.push({
            symbol: stock.symbol,
            name: stock.name,
            action: isUpgrade ? 'upgrade' : 'downgrade',
            from: previous.recommendation_key,
            to: current.recommendation_key,
            priceTarget: current.target_mean,
            date: current.fetched_at,
            type: 'rating_change',
          });
        }

        // Check for significant price target change (> 5%)
        if (current.target_mean && previous.target_mean) {
          const ptChange = ((current.target_mean - previous.target_mean) / previous.target_mean) * 100;
          if (Math.abs(ptChange) > 5) {
            recentChanges.push({
              symbol: stock.symbol,
              name: stock.name,
              action: ptChange > 0 ? 'pt_raise' : 'pt_lower',
              oldTarget: previous.target_mean,
              newTarget: current.target_mean,
              changePercent: ptChange,
              date: current.fetched_at,
              type: 'price_target',
            });
          }
        }

        // Check for significant consensus shift (> 10%)
        if (current.buy_percent && previous.buy_percent) {
          const consensusChange = current.buy_percent - previous.buy_percent;
          if (Math.abs(consensusChange) > 10) {
            recentChanges.push({
              symbol: stock.symbol,
              name: stock.name,
              action: consensusChange > 0 ? 'consensus_improve' : 'consensus_decline',
              oldBuyPercent: previous.buy_percent,
              newBuyPercent: current.buy_percent,
              change: consensusChange,
              date: current.fetched_at,
              type: 'consensus_shift',
            });
          }
        }
      }
    }

    // Sort by date, most recent first
    recentChanges.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get strong buy stocks (>80% buy consensus)
    const strongBuys = database.prepare(`
      SELECT
        c.symbol, c.name, c.sector,
        ae.buy_percent, ae.target_mean, ae.current_price,
        ae.upside_potential, ae.number_of_analysts
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE ae.buy_percent >= 80
        AND ae.number_of_analysts >= 5
      ORDER BY ae.buy_percent DESC, ae.upside_potential DESC
      LIMIT 10
    `).all();

    // Get top upside stocks
    const topUpside = database.prepare(`
      SELECT
        c.symbol, c.name, c.sector,
        ae.upside_potential, ae.target_mean, ae.current_price,
        ae.buy_percent, ae.number_of_analysts
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE ae.upside_potential > 0
        AND ae.number_of_analysts >= 5
      ORDER BY ae.upside_potential DESC
      LIMIT 10
    `).all();

    res.json({
      recentChanges: recentChanges.slice(0, parseInt(limit)),
      strongBuys,
      topUpside,
      totalChanges: recentChanges.length,
    });
  } catch (error) {
    console.error('Analyst activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/movers
 * Get top sentiment movers
 */
router.get('/movers', async (req, res) => {
  try {
    if (!sentimentAggregator) {
      return res.status(503).json({ error: 'Sentiment aggregator unavailable' });
    }

    const { limit = 10 } = req.query;

    const movers = sentimentAggregator.getTopMovers(parseInt(limit));

    res.json({ movers });
  } catch (error) {
    console.error('Movers API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/analyst
 * Get analyst estimates and recommendations for a stock
 */
router.get('/:symbol/analyst', async (req, res) => {
  try {
    if (!analystEstimatesFetcher) {
      return res.status(503).json({ error: 'Analyst estimates service unavailable' });
    }

    const { symbol } = req.params;
    const { refresh = 'false' } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    let data;

    if (refresh === 'true') {
      // Force fresh fetch
      data = await analystEstimatesFetcher.fetchAndStore(symbol.toUpperCase(), company.id);
    } else {
      // Get cached or fetch if stale (60 minutes)
      data = await analystEstimatesFetcher.getAnalystData(symbol.toUpperCase(), company.id, 60);
    }

    if (!data) {
      return res.status(404).json({ error: 'No analyst data available for this symbol' });
    }

    res.json({
      symbol: company.symbol,
      name: company.name,
      ...data,
    });
  } catch (error) {
    console.error('Analyst estimates API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/analyst/top-upside
 * Get stocks with highest analyst upside potential
 */
router.get('/analyst/top-upside', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const stocks = database.prepare(`
      SELECT
        ae.*,
        c.symbol,
        c.name,
        c.sector
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE ae.upside_potential IS NOT NULL
        AND ae.number_of_analysts >= 5
      ORDER BY ae.upside_potential DESC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({ stocks });
  } catch (error) {
    console.error('Top upside API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/analyst/strong-buy
 * Get stocks with strong buy consensus
 */
router.get('/analyst/strong-buy', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const stocks = database.prepare(`
      SELECT
        ae.*,
        c.symbol,
        c.name,
        c.sector
      FROM analyst_estimates ae
      JOIN companies c ON ae.company_id = c.id
      WHERE ae.buy_percent >= 80
        AND ae.number_of_analysts >= 5
      ORDER BY ae.buy_percent DESC, ae.number_of_analysts DESC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({ stocks });
  } catch (error) {
    console.error('Strong buy API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sentiment/:symbol/analyst/history
 * Get historical analyst estimates for a stock
 */
router.get('/:symbol/analyst/history', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 50 } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get current estimate
    const current = database.prepare(`
      SELECT
        fetched_at as date,
        current_price as price,
        target_high as targetHigh,
        target_low as targetLow,
        target_mean as targetMean,
        target_median as targetMedian,
        number_of_analysts as numAnalysts,
        recommendation_key as recommendationKey,
        recommendation_mean as recommendationMean,
        upside_potential as upsidePotential,
        strong_buy as strongBuy,
        buy,
        hold,
        sell,
        strong_sell as strongSell,
        buy_percent as buyPercent,
        signal,
        signal_score as signalScore,
        'current' as type
      FROM analyst_estimates
      WHERE company_id = ?
    `).get(company.id);

    // Get historical estimates
    const history = database.prepare(`
      SELECT
        fetched_at as date,
        archived_at as archivedAt,
        current_price as price,
        target_high as targetHigh,
        target_low as targetLow,
        target_mean as targetMean,
        target_median as targetMedian,
        number_of_analysts as numAnalysts,
        recommendation_key as recommendationKey,
        recommendation_mean as recommendationMean,
        upside_potential as upsidePotential,
        strong_buy as strongBuy,
        buy,
        hold,
        sell,
        strong_sell as strongSell,
        buy_percent as buyPercent,
        signal,
        signal_score as signalScore,
        'historical' as type
      FROM analyst_estimates_history
      WHERE company_id = ?
      ORDER BY archived_at DESC
      LIMIT ?
    `).all(company.id, parseInt(limit));

    // Combine current + history, sorted by date
    const allData = current ? [current, ...history] : history;

    // Calculate changes if we have history
    let changes = null;
    if (allData.length >= 2) {
      const latest = allData[0];
      const previous = allData[1];
      changes = {
        targetMeanChange: latest.targetMean && previous.targetMean
          ? ((latest.targetMean - previous.targetMean) / previous.targetMean) * 100
          : null,
        numAnalystsChange: latest.numAnalysts && previous.numAnalysts
          ? latest.numAnalysts - previous.numAnalysts
          : null,
        buyPercentChange: latest.buyPercent && previous.buyPercent
          ? latest.buyPercent - previous.buyPercent
          : null,
        signalChange: latest.signal !== previous.signal
          ? { from: previous.signal, to: latest.signal }
          : null,
      };
    }

    res.json({
      symbol: company.symbol,
      name: company.name,
      current,
      history,
      changes,
      dataPoints: allData.length,
    });
  } catch (error) {
    console.error('Analyst history API error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
