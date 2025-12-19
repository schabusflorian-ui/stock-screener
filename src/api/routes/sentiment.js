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

    const { period = '24h', limit = 20, refresh = 'false' } = req.query;

    if (refresh === 'true') {
      await redditFetcher.scanTrendingTickers();
    }

    const trending = database.prepare(`
      SELECT
        t.*,
        c.name as company_name
      FROM trending_tickers t
      LEFT JOIN companies c ON t.symbol = c.symbol
      WHERE t.period = ?
      ORDER BY t.rank_by_mentions
      LIMIT ?
    `).all(period, parseInt(limit));

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
    const { refresh = 'false' } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const combined = await sentimentAggregator.aggregateSentiment(
      symbol.toUpperCase(),
      company.id,
      { skipCache: refresh === 'true' }
    );

    res.json({
      symbol: company.symbol,
      name: company.name,
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

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Fetch fresh data
    const posts = await redditFetcher.fetchTickerSentiment(
      symbol.toUpperCase(),
      company.id
    );

    // Recalculate signal
    const signal = await signalGenerator.calculateSignal(company.id, symbol, '7d');

    res.json({
      message: `Fetched ${posts.length} posts for ${symbol}`,
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
      { skipCache: true }
    );

    res.json({
      message: `Refreshed all sentiment sources for ${symbol}`,
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
        query += ` AND subreddit = ?`;
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
        query += ` AND subreddit = ?`;
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
    const { refresh = 'false', limit = 20 } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ?'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Optionally refresh from news sources
    if (refresh === 'true') {
      await newsFetcher.fetchAllNews(symbol.toUpperCase(), company.id);
    }

    // Get recent news
    const articles = newsFetcher.getRecentNews(company.id, parseInt(limit));

    // Get summary stats
    const summary = newsFetcher.getNewsSummary(company.id, 7);

    res.json({
      symbol: symbol.toUpperCase(),
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
