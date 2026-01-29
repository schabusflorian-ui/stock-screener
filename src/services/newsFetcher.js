/**
 * News Sentiment Fetcher
 *
 * Multi-source news fetcher supporting:
 * - Google News RSS (FREE, no API key)
 * - Yahoo Finance RSS (FREE, no API key)
 * - Marketaux API (optional, 100 req/day free)
 * - GNews API (optional, 100 req/day free)
 * - NewsAPI (optional, 100 req/day free)
 *
 * Set NEWS_API_KEY and NEWS_API_PROVIDER in .env for paid sources
 */

const Parser = require('rss-parser');
const localSentiment = require('./localSentiment');

const rssParser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'StockAnalyzer/1.0 (Investment Research Tool)',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
  customFields: {
    item: [['media:content', 'media'], ['media:thumbnail', 'thumbnail']],
  },
});

// RSS Feed configurations - US sources
const RSS_SOURCES = {
  googleNews: {
    name: 'Google News',
    region: 'US',
    buildUrl: (symbol) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock')}&hl=en-US&gl=US&ceid=US:en`,
    parseItem: (item) => ({
      title: item.title?.replace(/ - [^-]+$/, '') || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: extractSourceFromTitle(item.title) || 'Google News',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: item.media?.['$']?.url || item.thumbnail?.['$']?.url || null,
    }),
  },
  yahooFinance: {
    name: 'Yahoo Finance',
    region: 'US',
    buildUrl: (symbol) =>
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol.toUpperCase()}&region=US&lang=en-US`,
    parseItem: (item) => ({
      title: item.title || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: 'Yahoo Finance',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: item.media?.['$']?.url || null,
    }),
  },
};

// European RSS Feed configurations
const EU_RSS_SOURCES = {
  googleNewsUK: {
    name: 'Google News UK',
    region: 'UK',
    buildUrl: (symbol) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock OR shares')}&hl=en-GB&gl=GB&ceid=GB:en`,
    parseItem: (item) => ({
      title: item.title?.replace(/ - [^-]+$/, '') || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: extractSourceFromTitle(item.title) || 'Google News UK',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: item.media?.['$']?.url || item.thumbnail?.['$']?.url || null,
    }),
  },
  googleNewsDE: {
    name: 'Google News Germany',
    region: 'DE',
    buildUrl: (symbol) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' aktie OR börse')}&hl=de&gl=DE&ceid=DE:de`,
    parseItem: (item) => ({
      title: item.title?.replace(/ - [^-]+$/, '') || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: extractSourceFromTitle(item.title) || 'Google News DE',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: item.media?.['$']?.url || item.thumbnail?.['$']?.url || null,
    }),
  },
  googleNewsFR: {
    name: 'Google News France',
    region: 'FR',
    buildUrl: (symbol) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' action OR bourse')}&hl=fr&gl=FR&ceid=FR:fr`,
    parseItem: (item) => ({
      title: item.title?.replace(/ - [^-]+$/, '') || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: extractSourceFromTitle(item.title) || 'Google News FR',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: item.media?.['$']?.url || item.thumbnail?.['$']?.url || null,
    }),
  },
  yahooFinanceUK: {
    name: 'Yahoo Finance UK',
    region: 'UK',
    buildUrl: (symbol) => {
      // For UK stocks, try with .L suffix for London Stock Exchange
      const ukSymbol = symbol.includes('.') ? symbol : symbol;
      return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ukSymbol.toUpperCase()}&region=UK&lang=en-GB`;
    },
    parseItem: (item) => ({
      title: item.title || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: 'Yahoo Finance UK',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: item.media?.['$']?.url || null,
    }),
  },
  investingComUK: {
    name: 'Investing.com UK',
    region: 'UK',
    buildUrl: () => 'https://www.investing.com/rss/news_301.rss', // UK Market news
    parseItem: (item) => ({
      title: item.title || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: 'Investing.com',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: null,
    }),
  },
  investingComEU: {
    name: 'Investing.com Europe',
    region: 'EU',
    buildUrl: () => 'https://www.investing.com/rss/news_314.rss', // European Market news
    parseItem: (item) => ({
      title: item.title || '',
      description: stripHtml(item.contentSnippet || item.content || ''),
      source: 'Investing.com EU',
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      imageUrl: null,
    }),
  },
};

// API-based news providers (optional)
const NEWS_PROVIDERS = {
  marketaux: {
    baseUrl: 'https://api.marketaux.com/v1/news/all',
    buildParams: (symbol, apiKey) => ({
      symbols: symbol,
      filter_entities: true,
      language: 'en',
      api_token: apiKey,
      limit: 50,
    }),
    parseResponse: (data) => data.data || [],
  },
  gnews: {
    baseUrl: 'https://gnews.io/api/v4/search',
    buildParams: (symbol, apiKey) => ({
      q: `${symbol} stock`,
      lang: 'en',
      country: 'us',
      max: 50,
      token: apiKey,
    }),
    parseResponse: (data) => data.articles || [],
  },
  newsapi: {
    baseUrl: 'https://newsapi.org/v2/everything',
    buildParams: (symbol, apiKey) => ({
      q: `${symbol} stock`,
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: 50,
      apiKey,
    }),
    parseResponse: (data) => data.articles || [],
  },
};

class NewsFetcher {
  constructor(db) {
    this.db = db;
    this.apiKey = process.env.NEWS_API_KEY || null;
    this.provider = process.env.NEWS_API_PROVIDER || 'marketaux';
    this.lastRequest = {};
    this.minDelay = 1500; // 1.5 seconds between requests per source

    this.ensureTable();
  }

  /**
   * Rate-limited fetch for a specific source
   */
  async rateLimitedFetch(source, fetchFn) {
    const now = Date.now();
    const lastReq = this.lastRequest[source] || 0;
    const elapsed = now - lastReq;

    if (elapsed < this.minDelay) {
      await new Promise((r) => setTimeout(r, this.minDelay - elapsed));
    }
    this.lastRequest[source] = Date.now();

    return fetchFn();
  }

  /**
   * Fetch news from RSS feed
   */
  async fetchRSS(symbol, sourceKey, sources = RSS_SOURCES) {
    const source = sources[sourceKey];
    if (!source) {
      throw new Error(`Unknown RSS source: ${sourceKey}`);
    }

    const url = source.buildUrl(symbol);

    try {
      const feed = await this.rateLimitedFetch(sourceKey, () => rssParser.parseURL(url));

      if (!feed.items || feed.items.length === 0) {
        return [];
      }

      return feed.items.slice(0, 20).map((item) => ({
        ...source.parseItem(item),
        feedSource: sourceKey,
      }));
    } catch (error) {
      console.error(`RSS fetch error (${source.name}):`, error.message);
      return [];
    }
  }

  /**
   * Fetch from Google News RSS (FREE)
   */
  async fetchGoogleNews(symbol) {
    console.log(`Fetching Google News for ${symbol}...`);
    return this.fetchRSS(symbol, 'googleNews');
  }

  /**
   * Fetch from Yahoo Finance RSS (FREE)
   */
  async fetchYahooFinance(symbol) {
    console.log(`Fetching Yahoo Finance for ${symbol}...`);
    return this.fetchRSS(symbol, 'yahooFinance');
  }

  /**
   * Fetch from paid API provider (if configured)
   */
  async fetchFromAPI(symbol) {
    if (!this.apiKey) {
      return [];
    }

    const providerConfig = NEWS_PROVIDERS[this.provider];
    if (!providerConfig) {
      console.warn(`Unknown news provider: ${this.provider}`);
      return [];
    }

    console.log(`Fetching news for ${symbol} from ${this.provider} API...`);

    try {
      const params = providerConfig.buildParams(symbol, this.apiKey);
      const response = await this.rateLimitedFetch('api', async () => {
        const res = await fetch(
          `${providerConfig.baseUrl}?${new URLSearchParams(params)}`,
          {
            headers: { 'User-Agent': 'StockAnalyzer/1.0' },
          }
        );
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        return res.json();
      });

      const articles = providerConfig.parseResponse(response);
      return articles.map((a) => this.normalizeAPIArticle(a, this.provider));
    } catch (error) {
      console.error(`API fetch error (${this.provider}):`, error.message);
      return [];
    }
  }

  /**
   * Normalize API article format
   */
  normalizeAPIArticle(article, provider) {
    switch (provider) {
      case 'marketaux':
        return {
          title: article.title,
          description: article.description,
          source: article.source,
          url: article.url,
          publishedAt: article.published_at,
          imageUrl: article.image_url,
          feedSource: 'marketaux',
        };
      case 'gnews':
        return {
          title: article.title,
          description: article.description,
          source: article.source?.name,
          url: article.url,
          publishedAt: article.publishedAt,
          imageUrl: article.image,
          feedSource: 'gnews',
        };
      case 'newsapi':
        return {
          title: article.title,
          description: article.description,
          source: article.source?.name,
          url: article.url,
          publishedAt: article.publishedAt,
          imageUrl: article.urlToImage,
          feedSource: 'newsapi',
        };
      default:
        return article;
    }
  }

  /**
   * Fetch European news from RSS feeds
   */
  async fetchEuropeanNews(symbol, region = 'EU') {
    console.log(`Fetching European news for ${symbol} (region: ${region})...`);

    const articles = [];
    const sourcesToFetch = [];

    // Determine which sources to use based on region
    if (region === 'UK' || region === 'EU') {
      sourcesToFetch.push('googleNewsUK', 'yahooFinanceUK', 'investingComUK');
    }
    if (region === 'DE' || region === 'EU') {
      sourcesToFetch.push('googleNewsDE');
    }
    if (region === 'FR' || region === 'EU') {
      sourcesToFetch.push('googleNewsFR');
    }
    if (region === 'EU') {
      sourcesToFetch.push('investingComEU');
    }

    // Fetch from each source
    for (const sourceKey of sourcesToFetch) {
      try {
        const sourceArticles = await this.fetchRSS(symbol, sourceKey, EU_RSS_SOURCES);
        articles.push(...sourceArticles);
      } catch (error) {
        console.warn(`Failed to fetch from ${sourceKey}:`, error.message);
      }
    }

    return articles;
  }

  /**
   * Fetch all news sources for a symbol
   */
  async fetchAllNews(symbol, companyId, options = {}) {
    const { region = 'US' } = options;
    console.log(`Fetching all news sources for ${symbol} (region: ${region})...`);

    let allArticles = [];

    if (region === 'US') {
      // Fetch from US sources in parallel
      const [googleNews, yahooNews, apiNews] = await Promise.all([
        this.fetchGoogleNews(symbol),
        this.fetchYahooFinance(symbol),
        this.fetchFromAPI(symbol),
      ]);
      allArticles = [...googleNews, ...yahooNews, ...apiNews];
    } else if (region === 'UK' || region === 'EU' || region === 'DE' || region === 'FR') {
      // Fetch from European sources
      const [euNews, apiNews] = await Promise.all([
        this.fetchEuropeanNews(symbol, region),
        this.fetchFromAPI(symbol), // API sources may have EU coverage
      ]);
      allArticles = [...euNews, ...apiNews];
    } else {
      // Global: fetch from both US and EU sources
      const [googleNews, yahooNews, euNews, apiNews] = await Promise.all([
        this.fetchGoogleNews(symbol),
        this.fetchYahooFinance(symbol),
        this.fetchEuropeanNews(symbol, 'EU'),
        this.fetchFromAPI(symbol),
      ]);
      allArticles = [...googleNews, ...yahooNews, ...euNews, ...apiNews];
    }

    // Deduplicate by URL
    const uniqueArticles = this.deduplicateArticles(allArticles);

    if (uniqueArticles.length === 0) {
      console.log(`No news found for ${symbol}`);
      return { articles: [], sentiment: null };
    }

    console.log(`Found ${uniqueArticles.length} unique articles for ${symbol}`);

    // Analyze sentiment
    const analyzed = await this.analyzeArticles(uniqueArticles);

    // Store in database
    await this.storeArticles(analyzed, companyId);

    // Calculate summary
    const summary = this.calculateNewsSummary(analyzed);

    return {
      articles: analyzed,
      sentiment: summary,
      region,
    };
  }

  /**
   * Deduplicate articles by URL and similar titles
   */
  deduplicateArticles(articles) {
    const seen = new Map();

    for (const article of articles) {
      if (!article.url) continue;

      // Normalize URL for comparison
      const normalizedUrl = article.url.toLowerCase().replace(/[?#].*$/, '');

      if (!seen.has(normalizedUrl)) {
        seen.set(normalizedUrl, article);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Analyze sentiment of news articles using FinBERT
   */
  async analyzeArticles(articles) {
    if (articles.length === 0) return [];

    try {
      const texts = articles.map((a) => `${a.title}. ${a.description || ''}`);
      const sentiments = await localSentiment.analyzeBatch(texts);

      return articles.map((article, i) => ({
        ...article,
        sentimentScore: sentiments[i].score,
        sentimentLabel: sentiments[i].label,
        sentimentConfidence: sentiments[i].confidence,
        financialAdjustment: sentiments[i].financialAdjustment || 0,
      }));
    } catch (error) {
      console.warn('Sentiment analysis failed:', error.message);
      // Return articles without sentiment
      return articles.map((article) => ({
        ...article,
        sentimentScore: 0,
        sentimentLabel: 'neutral',
        sentimentConfidence: 0,
        financialAdjustment: 0,
      }));
    }
  }

  /**
   * Calculate news sentiment summary
   */
  calculateNewsSummary(articles) {
    if (articles.length === 0) {
      return { sentiment: 0, confidence: 0, signal: 'neutral' };
    }

    const avgSentiment =
      articles.reduce((sum, a) => sum + (a.sentimentScore || 0), 0) / articles.length;

    const avgConfidence =
      articles.reduce((sum, a) => sum + (a.sentimentConfidence || 0), 0) / articles.length;

    const positive = articles.filter((a) => a.sentimentLabel === 'positive').length;
    const negative = articles.filter((a) => a.sentimentLabel === 'negative').length;
    const neutral = articles.filter((a) => a.sentimentLabel === 'neutral').length;

    // Determine signal
    let signal;
    if (avgSentiment >= 0.4) signal = 'strong_buy';
    else if (avgSentiment >= 0.2) signal = 'buy';
    else if (avgSentiment >= 0.05) signal = 'lean_buy';
    else if (avgSentiment <= -0.4) signal = 'strong_sell';
    else if (avgSentiment <= -0.2) signal = 'sell';
    else if (avgSentiment <= -0.05) signal = 'lean_sell';
    else signal = 'hold';

    // Confidence based on article count
    let confidence;
    if (articles.length >= 15) confidence = Math.min(avgConfidence + 0.1, 1);
    else if (articles.length >= 8) confidence = avgConfidence;
    else confidence = Math.max(avgConfidence - 0.1, 0.2);

    return {
      sentiment: Math.round(avgSentiment * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      signal,
      totalArticles: articles.length,
      positiveCount: positive,
      negativeCount: negative,
      neutralCount: neutral,
      sources: this.countSources(articles),
    };
  }

  /**
   * Count articles by source
   */
  countSources(articles) {
    const sources = {};
    for (const article of articles) {
      const src = article.feedSource || 'unknown';
      sources[src] = (sources[src] || 0) + 1;
    }
    return sources;
  }

  /**
   * Store articles in database
   */
  async storeArticles(articles, companyId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO news_articles (
        company_id, url, title, description, source, feed_source,
        published_at, image_url, sentiment_score, sentiment_label,
        sentiment_confidence, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    let stored = 0;
    for (const article of articles) {
      try {
        stmt.run(
          companyId,
          article.url,
          article.title,
          article.description,
          article.source,
          article.feedSource || null,
          article.publishedAt,
          article.imageUrl,
          article.sentimentScore,
          article.sentimentLabel,
          article.sentimentConfidence
        );
        stored++;
      } catch (error) {
        if (!error.message.includes('UNIQUE')) {
          console.error('Error storing article:', error.message);
        }
      }
    }

    return stored;
  }

  /**
   * Ensure news table exists with all required columns
   */
  ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        url TEXT UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        source TEXT,
        feed_source TEXT,
        published_at DATETIME,
        image_url TEXT,
        sentiment_score REAL,
        sentiment_label TEXT,
        sentiment_confidence REAL,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      CREATE INDEX IF NOT EXISTS idx_news_company ON news_articles(company_id);
      CREATE INDEX IF NOT EXISTS idx_news_date ON news_articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(feed_source);
    `);

    // Add feed_source column if it doesn't exist (migration)
    try {
      this.db.exec('ALTER TABLE news_articles ADD COLUMN feed_source TEXT');
    } catch (e) {
      // Column already exists
    }
  }

  /**
   * Get recent news for a company from database
   */
  getRecentNews(companyId, limit = 20) {
    return this.db
      .prepare(
        `
      SELECT * FROM news_articles
      WHERE company_id = ?
      ORDER BY published_at DESC
      LIMIT ?
    `
      )
      .all(companyId, limit);
  }

  /**
   * Get news sentiment summary from database
   */
  getNewsSummary(companyId, days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const summary = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total_articles,
        AVG(sentiment_score) as avg_sentiment,
        AVG(sentiment_confidence) as avg_confidence,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count
      FROM news_articles
      WHERE company_id = ?
        AND published_at >= ?
    `
      )
      .get(companyId, cutoff.toISOString());

    return summary;
  }

  /**
   * Fetch news for ticker (legacy method for compatibility)
   */
  async fetchNews(symbol, companyId) {
    return this.fetchAllNews(symbol, companyId);
  }
}

// Helper functions
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractSourceFromTitle(title) {
  if (!title) return null;
  // Google News format: "Title - Source"
  const match = title.match(/ - ([^-]+)$/);
  return match ? match[1].trim() : null;
}

module.exports = NewsFetcher;
