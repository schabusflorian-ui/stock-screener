/**
 * Reddit Data Fetcher
 *
 * Uses Reddit's public JSON API - no authentication needed!
 * Rate limit: ~60 requests/minute (be respectful)
 */

const axios = require('axios');
const localSentiment = require('./localSentiment');

// Default subreddits (fallback if DB table not available)
const DEFAULT_SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'stockmarket',
  'options',
  'SecurityAnalysis',
  'ValueInvesting',
  'dividends',
  'thetagang',
  'smallstreetbets',
  'FluentInFinance',
  'Bogleheads',
  'pennystocks',
  'SPACs',
  'biotech',
];

// Post quality thresholds - filter low-quality content
const QUALITY_FILTERS = {
  minScore: 3,              // Minimum upvotes
  minComments: 0,           // Minimum comments
  minContentLength: 20,     // Minimum title + body length
  skipFlairs: new Set([
    'Meme', 'Shitpost', 'Daily Discussion', 'Weekend Discussion',
    'Daily Thread', 'Megathread', 'Off-Topic', 'Satire', 'Humor'
  ]),
};

// WSB slang patterns
const WSB_PATTERNS = {
  dd: /\b(DD|due\s*diligence)\b/i,
  yolo: /\b(YOLO|all\s*in)\b/i,
  gain: /\b(gain|tendies|profit|moon|lambo)\b/i,
  loss: /\b(loss|GUH|baghold|rekt)\b/i,
  buy: /\b(buy|buying|bought|calls?|long|bullish|bull)\b/i,
  sell: /\b(sell|selling|sold|puts?|short|bearish|bear)\b/i,
  hold: /\b(hold|holding|diamond\s*hands?)\b/i,
  rockets: /\u{1F680}/gu,
  diamondHands: /\u{1F48E}|diamond\s*hands?/giu,
};

class RedditFetcher {
  constructor(db) {
    this.db = db;
    this.baseUrl = 'https://www.reddit.com';
    this.userAgent = 'StockSentimentAnalyzer/1.0';
    this.lastRequest = 0;
    this.minDelay = 1000; // 1 second between requests
    this._subredditsCache = null;
    this._subredditsCacheTime = 0;
  }

  /**
   * Get active subreddits from database (with caching)
   */
  getActiveSubreddits() {
    // Cache for 5 minutes
    if (this._subredditsCache && Date.now() - this._subredditsCacheTime < 300000) {
      return this._subredditsCache;
    }

    try {
      const rows = this.db.prepare(`
        SELECT name FROM tracked_subreddits
        WHERE is_active = 1
        ORDER BY priority DESC, quality_score DESC
        LIMIT 20
      `).all();

      if (rows.length > 0) {
        this._subredditsCache = rows.map(r => r.name);
        this._subredditsCacheTime = Date.now();
        return this._subredditsCache;
      }
    } catch (e) {
      // Table might not exist yet
    }

    return DEFAULT_SUBREDDITS;
  }

  /**
   * Update subreddit stats after scanning
   */
  updateSubredditStats(subreddit, posts, tickerMentions) {
    try {
      const avgScore = posts.length > 0
        ? posts.reduce((sum, p) => sum + (p.score || 0), 0) / posts.length
        : 0;
      const avgComments = posts.length > 0
        ? posts.reduce((sum, p) => sum + (p.numComments || 0), 0) / posts.length
        : 0;

      this.db.prepare(`
        UPDATE tracked_subreddits SET
          total_posts_scanned = total_posts_scanned + ?,
          ticker_mentions_found = ticker_mentions_found + ?,
          avg_post_score = ?,
          avg_comments = ?,
          last_scanned_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE name = ?
      `).run(posts.length, tickerMentions, avgScore, avgComments, subreddit);
    } catch (e) {
      // Ignore if table doesn't exist
    }
  }

  /**
   * Discover new subreddits from crossposted content
   */
  discoverSubreddit(name, discoveredFrom) {
    if (!name || name === discoveredFrom) return;

    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO tracked_subreddits
          (name, category, priority, quality_score, is_active, discovered_from)
        VALUES (?, 'discovered', 20, 40, 0, ?)
      `).run(name, discoveredFrom);
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Check if a post passes quality filters
   */
  passesQualityFilter(post) {
    // Check minimum score
    if ((post.score || 0) < QUALITY_FILTERS.minScore) {
      return false;
    }

    // Check minimum comments
    if ((post.numComments || 0) < QUALITY_FILTERS.minComments) {
      return false;
    }

    // Check content length
    const contentLength = (post.title || '').length + (post.selftext || '').length;
    if (contentLength < QUALITY_FILTERS.minContentLength) {
      return false;
    }

    // Check flair
    if (post.flair && QUALITY_FILTERS.skipFlairs.has(post.flair)) {
      return false;
    }

    return true;
  }

  /**
   * Rate-limited fetch using axios
   */
  async fetch(url) {
    // Respect rate limits
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await new Promise(r => setTimeout(r, this.minDelay - elapsed));
    }
    this.lastRequest = Date.now();

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        console.warn('Reddit rate limited, waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
        return this.fetch(url); // Retry
      }
      throw new Error(`Reddit API error: ${error.response?.status || error.message}`);
    }
  }

  /**
   * Search for ticker mentions across subreddits
   */
  async searchTicker(symbol, options = {}) {
    const {
      subreddit = 'all',
      timeFilter = 'week',  // hour, day, week, month, year, all
      sort = 'relevance',   // relevance, hot, top, new, comments
      limit = 100,
    } = options;

    // Search terms (ticker with and without $)
    const query = `$${symbol} OR ${symbol} stock`;

    const url = `${this.baseUrl}/r/${subreddit}/search.json?` + new URLSearchParams({
      q: query,
      restrict_sr: subreddit !== 'all' ? 'true' : 'false',
      sort,
      t: timeFilter,
      limit: Math.min(limit, 100),
      type: 'link',
    });

    try {
      const data = await this.fetch(url);
      return this.parsePosts(data.data?.children || [], symbol);
    } catch (error) {
      console.error(`Reddit search error for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Get hot/new posts from a subreddit
   */
  async getSubredditPosts(subreddit, options = {}) {
    const {
      sort = 'hot',  // hot, new, top, rising
      limit = 50,
      timeFilter = 'day',
    } = options;

    let url = `${this.baseUrl}/r/${subreddit}/${sort}.json?limit=${limit}`;
    if (sort === 'top') {
      url += `&t=${timeFilter}`;
    }

    try {
      const data = await this.fetch(url);
      return this.parsePosts(data.data?.children || []);
    } catch (error) {
      console.error(`Reddit fetch error for r/${subreddit}:`, error.message);
      return [];
    }
  }

  /**
   * Parse Reddit API response into clean post objects
   */
  parsePosts(children, filterTicker = null) {
    const posts = [];

    for (const child of children) {
      if (child.kind !== 't3') continue; // Only link posts

      const data = child.data;

      // Skip removed/deleted
      if (data.removed_by_category || data.selftext === '[removed]') continue;

      // Detect tickers mentioned
      const tickers = this.extractTickers(data.title + ' ' + (data.selftext || ''));

      // If filtering by ticker, skip posts that don't mention it
      if (filterTicker && !tickers.includes(filterTicker.toUpperCase())) {
        continue;
      }

      // Detect WSB patterns
      const text = `${data.title} ${data.selftext || ''} ${data.link_flair_text || ''}`;
      const flags = this.detectPatterns(text);

      posts.push({
        postId: data.id,
        subreddit: data.subreddit,
        title: data.title,
        selftext: data.selftext || '',
        url: data.url,
        permalink: `https://reddit.com${data.permalink}`,
        flair: data.link_flair_text,
        author: data.author,
        score: data.score,
        upvoteRatio: data.upvote_ratio,
        numComments: data.num_comments,
        postedAt: new Date(data.created_utc * 1000).toISOString(),
        tickersMentioned: tickers,
        ...flags,
      });
    }

    return posts;
  }

  /**
   * Extract stock tickers from text using multiple strategies
   */
  extractTickers(text) {
    const tickers = new Set();

    // Common words that look like tickers but aren't
    const BLACKLIST = new Set([
      // Acronyms & abbreviations
      'CEO', 'CFO', 'COO', 'CTO', 'IPO', 'ATH', 'ATL', 'EOD', 'EOW', 'EOM', 'EOY',
      'IMO', 'IMHO', 'FOMO', 'FUD', 'DD', 'TA', 'FA', 'EPS', 'PE', 'PB', 'ROI', 'ROE',
      'PM', 'AM', 'USA', 'UK', 'EU', 'GDP', 'SEC', 'FDA', 'FED', 'ETF', 'NYSE', 'NASDAQ',
      'IRA', 'RSU', 'IV', 'DTE', 'OI', 'SI', 'PT', 'TP', 'SL', 'DCA', 'HODL', 'BTFD',
      'US', 'UK', 'EU', 'UN', 'USD', 'EUR', 'GBP', 'GDP', 'CPI', 'PPI', 'PMI',
      // Very common 2-letter words that get picked up
      'IT', 'IS', 'IF', 'IN', 'ON', 'TO', 'AT', 'BY', 'OR', 'AN', 'AS', 'BE', 'DO',
      'GO', 'HE', 'ME', 'MY', 'NO', 'OF', 'OK', 'SO', 'UP', 'US', 'WE',
      // Common 3-letter words
      'THE', 'FOR', 'AND', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAS', 'HAD',
      'WAS', 'HIS', 'HER', 'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HOW',
      'ITS', 'LET', 'MAY', 'NEW', 'NOW', 'OLD', 'OUR', 'OWN', 'SAY', 'SHE', 'TOO',
      'USE', 'WAY', 'WHO', 'BOY', 'DID', 'GOT', 'HAS', 'HER', 'HIM', 'HIS', 'HOW',
      'MAN', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'END', 'FAR',
      'FEW', 'GOT', 'HAS', 'LET', 'MEN', 'RAN', 'SAT', 'SET', 'TOP', 'TRY', 'YET',
      'AGO', 'BAD', 'BIG', 'YES', 'YET', 'WHY', 'ANY', 'ASK', 'BAD', 'BIG', 'BIT',
      // Common 4-letter words
      'THIS', 'THAT', 'WITH', 'FROM', 'HAVE', 'BEEN', 'WERE', 'SAID', 'EACH',
      'JUST', 'OVER', 'SUCH', 'INTO', 'YEAR', 'YOUR', 'SOME', 'THEM', 'THAN',
      'THEN', 'ALSO', 'BACK', 'ONLY', 'COME', 'MADE', 'FIND', 'HERE', 'MANY',
      'MORE', 'WILL', 'EACH', 'MAKE', 'LIKE', 'TIME', 'VERY', 'WHEN', 'MOST',
      'KNOW', 'TAKE', 'LAST', 'LONG', 'GOOD', 'WELL', 'MUCH', 'NEED', 'FEEL',
      'HIGH', 'WEEK', 'DOWN', 'EVER', 'GIVE', 'MOST', 'EVEN', 'TELL', 'WORK',
      'LIFE', 'LOOK', 'PART', 'REAL', 'SAME', 'SEEM', 'SHOW', 'SIDE', 'SURE',
      'TURN', 'WANT', 'WHAT', 'YEAH', 'CANT', 'DONT', 'WONT', 'ISNT', 'ISNT',
      'FUCK', 'SHIT', 'DAMN', 'HELL', 'LMAO', 'IDGAF', 'STFU', 'GTFO',
      'EDIT', 'POST', 'LINK', 'READ', 'HELP', 'FREE', 'BEST', 'NEXT', 'STILL',
      // Common 5-letter words
      'THERE', 'THEIR', 'ABOUT', 'WOULD', 'COULD', 'THESE', 'OTHER', 'WHICH',
      'AFTER', 'FIRST', 'NEVER', 'BEING', 'THOSE', 'GOING', 'THINK', 'MONEY',
      'THING', 'GREAT', 'STILL', 'WHERE', 'EVERY', 'WORLD', 'YEARS', 'SINCE',
      'RIGHT', 'THREE', 'PLACE', 'WHILE', 'TODAY', 'POINT', 'MIGHT', 'UNDER',
      'START', 'STOCK', 'SHARE', 'PRICE', 'VALUE', 'TRADE', 'LOOKS', 'MAYBE',
      // WSB/Reddit slang
      'WSB', 'YOLO', 'LOL', 'OMG', 'WTF', 'FYI', 'TBH', 'ATM', 'OTM', 'ITM',
      'TLDR', 'EDIT', 'UPDATE', 'PSA', 'LPT', 'TIL', 'AMA', 'IIRC', 'AFAIK',
      'IME', 'LMAO', 'LMFAO', 'RIP', 'IMHO', 'FWIW', 'BTW', 'NGL', 'TBF',
      // Trading terms
      'CALL', 'CALLS', 'PUT', 'PUTS', 'LONG', 'SHORT', 'BUY', 'SELL', 'HOLD',
      'BULL', 'BEAR', 'GREEN', 'RED', 'MOON', 'DIP', 'PUMP', 'DUMP', 'GAIN', 'LOSS',
      'BAGS', 'HODL', 'REKT', 'APES', 'TENDIES', 'LAMBO', 'YEET',
      // Time/date
      'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
      'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN',
      // Ambiguous tickers that match common words (only allow with $ prefix)
      'AI', 'NET', 'NOW', 'NICE', 'FAST', 'REAL', 'TRUE', 'OPEN', 'PLUS', 'PLAY',
      'HOME', 'LIFE', 'LOVE', 'LIVE', 'BILL', 'CASH', 'CLUB', 'GOLD', 'SAVE', 'TEAM',
      'PLAN', 'ZERO', 'CORE', 'IDEA', 'FORM', 'AUTO', 'UNIT', 'FIVE', 'WELL', 'PEAK',
      'PER', 'VERY', 'EVER', 'ONCE', 'ONLY', 'SUCH', 'BEEN', 'SAME', 'NEAR', 'FAR',
    ]);

    // Well-known tickers to always recognize (even without $ prefix)
    // NOTE: Avoiding very short/ambiguous tickers like AI, U, V, MA - they match too many false positives
    const KNOWN_TICKERS = new Set([
      // Mega caps (4+ letters preferred)
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRKB',
      'JPM', 'JNJ', 'UNH', 'XOM', 'CVX', 'MRK', 'ABBV',
      'PEP', 'AVGO', 'COST', 'TMO', 'MCD', 'WMT', 'CSCO', 'ACN', 'ABT', 'DHR', 'LLY',
      'NKE', 'ADBE', 'CRM', 'NFLX', 'AMD', 'INTC', 'QCOM', 'TXN', 'PYPL', 'ORCL',
      // Popular trading stocks
      'GME', 'AMC', 'NOK', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'BABA',
      'COIN', 'HOOD', 'RBLX', 'SNAP', 'UBER', 'LYFT', 'SHOP', 'ROKU',
      'CRWD', 'DDOG', 'SNOW', 'PATH', 'AFRM', 'UPST', 'MARA', 'RIOT',
      'SPCE', 'ARKK', 'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'VXX', 'UVXY', 'SQQQ', 'TQQQ',
      // AI/Tech hype
      'SMCI', 'ARM', 'MRVL', 'DELL', 'HPE',
      // Energy
      'OXY', 'SLB', 'HAL', 'DVN', 'EOG', 'PXD', 'FANG',
      // Pharma/Bio
      'MRNA', 'PFE', 'BNTX', 'GILD', 'BIIB', 'VRTX', 'REGN',
    ]);

    // Strategy 1: $TICKER format (highest confidence)
    const dollarPattern = /\$([A-Z]{1,5})\b/gi;
    let match;
    while ((match = dollarPattern.exec(text)) !== null) {
      const ticker = match[1].toUpperCase();
      if (!BLACKLIST.has(ticker)) {
        tickers.add(ticker);
      }
    }

    // Strategy 2: Known tickers as standalone words
    for (const knownTicker of KNOWN_TICKERS) {
      // Match as whole word, case insensitive
      const regex = new RegExp(`\\b${knownTicker}\\b`, 'i');
      if (regex.test(text)) {
        tickers.add(knownTicker);
      }
    }

    // Strategy 3: Words before stock-related terms (high confidence)
    const beforePattern = /\b([A-Z]{2,5})\s+(?:stock|calls?|puts?|shares?|options?|leaps?|weeklies|monthlies|position|bag|bags|holders?|earnings|guidance)\b/gi;
    while ((match = beforePattern.exec(text)) !== null) {
      const ticker = match[1].toUpperCase();
      if (!BLACKLIST.has(ticker) && ticker.length >= 2) {
        tickers.add(ticker);
      }
    }

    // Strategy 4: Check against database for uppercase words (validates against real tickers)
    // Only do this for words that could plausibly be tickers
    if (this.db) {
      const capsWords = text.match(/\b[A-Z]{2,5}\b/g) || [];
      for (const word of capsWords) {
        if (BLACKLIST.has(word)) continue;
        if (tickers.has(word)) continue; // Already found

        // Check if it's in our companies database - this validates it's a real ticker
        try {
          const exists = this.db.prepare(
            'SELECT 1 FROM companies WHERE symbol = ? LIMIT 1'
          ).get(word);
          if (exists) {
            tickers.add(word);
          }
        } catch (e) {
          // Ignore DB errors
        }
      }
    }

    return Array.from(tickers);
  }

  /**
   * Detect WSB-specific patterns
   */
  detectPatterns(text) {
    const rocketMatches = text.match(WSB_PATTERNS.rockets);

    return {
      isDD: WSB_PATTERNS.dd.test(text),
      isYolo: WSB_PATTERNS.yolo.test(text),
      isGain: WSB_PATTERNS.gain.test(text),
      isLoss: WSB_PATTERNS.loss.test(text),
      mentionsBuy: WSB_PATTERNS.buy.test(text),
      mentionsSell: WSB_PATTERNS.sell.test(text),
      mentionsHold: WSB_PATTERNS.hold.test(text),
      hasRockets: rocketMatches ? rocketMatches.length : 0,
      hasDiamondHands: WSB_PATTERNS.diamondHands.test(text),
    };
  }

  /**
   * Analyze sentiment of posts using FinBERT
   */
  async analyzePosts(posts) {
    if (posts.length === 0) return [];

    // Prepare texts for batch analysis
    const texts = posts.map(p =>
      `${p.title}${p.selftext ? '. ' + p.selftext.slice(0, 500) : ''}`
    );

    // Run FinBERT
    const sentiments = await localSentiment.analyzeBatch(texts);

    // Merge results
    return posts.map((post, i) => ({
      ...post,
      sentimentScore: sentiments[i].score,
      sentimentLabel: sentiments[i].label,
      sentimentConfidence: sentiments[i].confidence,
    }));
  }

  /**
   * Store posts in database
   */
  async storePosts(posts, companyId = null) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO reddit_posts (
        company_id, post_id, subreddit, title, selftext, url, permalink, flair,
        author, score, upvote_ratio, num_comments, posted_at,
        sentiment_score, sentiment_label, sentiment_confidence,
        is_dd, is_yolo, is_gain, is_loss,
        mentions_buy, mentions_sell, mentions_hold,
        has_rockets, has_diamond_hands, tickers_mentioned
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let stored = 0;
    for (const post of posts) {
      try {
        stmt.run(
          companyId,
          post.postId,
          post.subreddit,
          post.title,
          post.selftext,
          post.url,
          post.permalink,
          post.flair,
          post.author,
          post.score,
          post.upvoteRatio,
          post.numComments,
          post.postedAt,
          post.sentimentScore,
          post.sentimentLabel,
          post.sentimentConfidence,
          post.isDD ? 1 : 0,
          post.isYolo ? 1 : 0,
          post.isGain ? 1 : 0,
          post.isLoss ? 1 : 0,
          post.mentionsBuy ? 1 : 0,
          post.mentionsSell ? 1 : 0,
          post.mentionsHold ? 1 : 0,
          post.hasRockets || 0,
          post.hasDiamondHands ? 1 : 0,
          JSON.stringify(post.tickersMentioned || [])
        );
        stored++;
      } catch (error) {
        // Ignore duplicates
        if (!error.message.includes('UNIQUE')) {
          console.error('Error storing post:', error.message);
        }
      }
    }

    return stored;
  }

  /**
   * Fetch and analyze posts for a specific ticker
   */
  async fetchTickerSentiment(symbol, companyId) {
    console.log(`Fetching Reddit sentiment for ${symbol}...`);

    // Search across top subreddits from database
    const subreddits = this.getActiveSubreddits().slice(0, 5);
    const allPosts = [];

    for (const subreddit of subreddits) {
      const posts = await this.searchTicker(symbol, {
        subreddit,
        timeFilter: 'week',
        limit: 25,
      });
      allPosts.push(...posts);
    }

    // Also search in "all" for broader coverage
    const globalPosts = await this.searchTicker(symbol, {
      subreddit: 'all',
      timeFilter: 'week',
      limit: 50,
    });
    allPosts.push(...globalPosts);

    // Deduplicate by post ID
    const uniquePosts = Array.from(
      new Map(allPosts.map(p => [p.postId, p])).values()
    );

    console.log(`Found ${uniquePosts.length} unique posts for ${symbol}`);

    // Analyze sentiment
    const analyzed = await this.analyzePosts(uniquePosts);

    // Store in database
    await this.storePosts(analyzed, companyId);

    return analyzed;
  }

  /**
   * Scan all financial subreddits for trending tickers
   */
  async scanTrendingTickers() {
    const subreddits = this.getActiveSubreddits();
    console.log(`Scanning ${subreddits.length} subreddits for trending tickers...`);

    const tickerCounts = {};
    let totalPostsScanned = 0;
    let totalFiltered = 0;

    for (const subreddit of subreddits) {
      console.log(`  Scanning r/${subreddit}...`);

      const posts = await this.getSubredditPosts(subreddit, {
        sort: 'hot',
        limit: 50,
      });

      // Apply quality filters
      const qualityPosts = posts.filter(p => this.passesQualityFilter(p));
      totalFiltered += posts.length - qualityPosts.length;
      totalPostsScanned += qualityPosts.length;

      const analyzed = await this.analyzePosts(qualityPosts);

      // Track ticker mentions for this subreddit
      let subredditTickerMentions = 0;

      for (const post of analyzed) {
        for (const ticker of post.tickersMentioned) {
          if (!tickerCounts[ticker]) {
            tickerCounts[ticker] = { mentions: 0, score: 0, posts: 0, sentiments: [] };
          }
          tickerCounts[ticker].mentions++;
          tickerCounts[ticker].score += post.score;
          tickerCounts[ticker].posts++;
          subredditTickerMentions++;
          if (post.sentimentScore !== null) {
            tickerCounts[ticker].sentiments.push(post.sentimentScore);
          }
        }
      }

      // Update subreddit stats
      this.updateSubredditStats(subreddit, analyzed, subredditTickerMentions);
    }

    console.log(`Scanned ${totalPostsScanned} posts (filtered ${totalFiltered} low-quality)`);

    // Calculate averages and rank
    const trending = Object.entries(tickerCounts)
      .map(([symbol, data]) => ({
        symbol,
        mentionCount: data.mentions,
        uniquePosts: data.posts,
        totalScore: data.score,
        avgSentiment: data.sentiments.length > 0
          ? data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length
          : 0,
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 50);

    // Store trending
    this.storeTrending(trending, '24h');

    return trending;
  }

  /**
   * Store trending tickers
   */
  storeTrending(trending, period) {
    // Clear old data for period
    this.db.prepare(`DELETE FROM trending_tickers WHERE period = ?`).run(period);

    const stmt = this.db.prepare(`
      INSERT INTO trending_tickers (
        symbol, mention_count, unique_posts, total_score, avg_sentiment,
        rank_by_mentions, period
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    trending.forEach((t, index) => {
      stmt.run(
        t.symbol,
        t.mentionCount,
        t.uniquePosts,
        t.totalScore,
        t.avgSentiment,
        index + 1,
        period
      );
    });

    // Also store in trending_history for historical tracking
    this.storeTrendingHistory(trending, period);
  }

  /**
   * Store trending history for historical comparison
   */
  storeTrendingHistory(trending, period) {
    const today = new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trending_history (
        symbol, snapshot_date, period,
        mention_count, unique_posts, total_score,
        avg_sentiment, rank_by_mentions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    trending.forEach((t, index) => {
      try {
        stmt.run(
          t.symbol,
          today,
          period,
          t.mentionCount,
          t.uniquePosts,
          t.totalScore,
          t.avgSentiment,
          index + 1
        );
      } catch (e) {
        // Ignore errors (e.g., duplicate entries)
      }
    });
  }

  /**
   * Get trending history for a symbol
   */
  getTrendingHistory(symbol, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db.prepare(`
      SELECT
        snapshot_date,
        mention_count,
        unique_posts,
        total_score,
        avg_sentiment,
        rank_by_mentions
      FROM trending_history
      WHERE symbol = ? AND snapshot_date >= ?
      ORDER BY snapshot_date ASC
    `).all(symbol, cutoff.toISOString().split('T')[0]);
  }

  /**
   * Get sentiment status for updates page
   */
  getSentimentStatus() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT symbol) as tickers_tracked,
        SUM(mention_count) as total_mentions,
        MAX(calculated_at) as last_scan
      FROM trending_tickers
      WHERE period = '24h'
    `).get();

    const postStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_posts,
        COUNT(DISTINCT company_id) as companies_with_posts,
        MAX(fetched_at) as latest_fetch
      FROM reddit_posts
    `).get();

    const historyDays = this.db.prepare(`
      SELECT COUNT(DISTINCT snapshot_date) as days_tracked
      FROM trending_history
    `).get();

    return {
      tickersTracked: stats?.tickers_tracked || 0,
      totalMentions: stats?.total_mentions || 0,
      lastScan: stats?.last_scan || null,
      totalPosts: postStats?.total_posts || 0,
      companiesWithPosts: postStats?.companies_with_posts || 0,
      latestFetch: postStats?.latest_fetch || null,
      daysTracked: historyDays?.days_tracked || 0
    };
  }
}

module.exports = RedditFetcher;
