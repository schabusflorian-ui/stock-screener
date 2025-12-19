/**
 * StockTwits Fetcher
 *
 * FREE API - No authentication required!
 * Rate limit: 200 requests/hour
 *
 * Best feature: Users self-tag sentiment as "Bullish" or "Bearish"
 */

const localSentiment = require('./localSentiment');

class StockTwitsFetcher {
  constructor(db) {
    this.db = db;
    this.baseUrl = 'https://api.stocktwits.com/api/2';
    this.lastRequest = 0;
    this.minDelay = 1500; // 1.5s between requests (safe for rate limit)
  }

  /**
   * Rate-limited fetch
   */
  async fetch(url) {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await new Promise(r => setTimeout(r, this.minDelay - elapsed));
    }
    this.lastRequest = Date.now();

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('StockTwits rate limited, waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
        return this.fetch(url);
      }
      throw new Error(`StockTwits API error: ${response.status}`);
    }

    // Check for Cloudflare challenge page
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      if (text.includes('cloudflare') || text.includes('Just a moment')) {
        throw new Error('StockTwits API blocked by Cloudflare protection - service unavailable');
      }
      throw new Error(`StockTwits returned non-JSON response: ${contentType}`);
    }

    return response.json();
  }

  /**
   * Get messages for a symbol
   */
  async getMessages(symbol, options = {}) {
    const {
      limit = 30,
      since = null,
      max = null,
      filter = null,
    } = options;

    let url = `${this.baseUrl}/streams/symbol/${symbol.toUpperCase()}.json?limit=${limit}`;

    if (since) url += `&since=${since}`;
    if (max) url += `&max=${max}`;
    if (filter) url += `&filter=${filter}`;

    try {
      const data = await this.fetch(url);

      if (!data.messages) {
        return { messages: [], symbol: data.symbol };
      }

      return {
        symbol: data.symbol,
        messages: this.parseMessages(data.messages),
        cursor: data.cursor,
      };
    } catch (error) {
      console.error(`StockTwits error for ${symbol}:`, error.message);
      return { messages: [], error: error.message };
    }
  }

  /**
   * Parse messages from API response
   */
  parseMessages(messages) {
    return messages.map(msg => ({
      messageId: String(msg.id),
      body: msg.body,

      userId: String(msg.user?.id),
      username: msg.user?.username,
      userFollowers: msg.user?.followers,
      userJoinDate: msg.user?.join_date,

      userSentiment: msg.entities?.sentiment?.basic || null,

      likesCount: msg.likes?.total || 0,
      resharesCount: msg.reshares?.total || 0,

      postedAt: msg.created_at,

      symbols: msg.symbols?.map(s => s.symbol) || [],
    }));
  }

  /**
   * Get trending symbols
   */
  async getTrending() {
    try {
      const data = await this.fetch(`${this.baseUrl}/trending/symbols.json`);
      return data.symbols || [];
    } catch (error) {
      console.error('StockTwits trending error:', error.message);
      return [];
    }
  }

  /**
   * Fetch and analyze messages for a company
   */
  async fetchSymbolSentiment(symbol, companyId) {
    console.log(`Fetching StockTwits for ${symbol}...`);

    const result = await this.getMessages(symbol, { limit: 30 });

    if (result.error || result.messages.length === 0) {
      return { messages: [], sentiment: null };
    }

    // Analyze messages without user sentiment using FinBERT
    const needsNlp = result.messages.filter(m => !m.userSentiment);
    if (needsNlp.length > 0) {
      try {
        const texts = needsNlp.map(m => m.body);
        const sentiments = await localSentiment.analyzeBatch(texts);

        needsNlp.forEach((msg, i) => {
          msg.nlpSentimentScore = sentiments[i].score;
          msg.nlpSentimentLabel = sentiments[i].label;
        });
      } catch (e) {
        console.warn('NLP analysis failed:', e.message);
      }
    }

    // Store messages
    await this.storeMessages(result.messages, companyId);

    // Calculate summary
    const summary = this.calculateSummary(result.messages);

    return {
      messages: result.messages,
      sentiment: summary,
    };
  }

  /**
   * Store messages in database
   */
  async storeMessages(messages, companyId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO stocktwits_messages (
        company_id, message_id, body,
        user_id, username, user_followers, user_join_date,
        user_sentiment, likes_count, reshares_count, posted_at,
        nlp_sentiment_score, nlp_sentiment_label
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const msg of messages) {
      try {
        stmt.run(
          companyId,
          msg.messageId,
          msg.body,
          msg.userId,
          msg.username,
          msg.userFollowers,
          msg.userJoinDate,
          msg.userSentiment,
          msg.likesCount,
          msg.resharesCount,
          msg.postedAt,
          msg.nlpSentimentScore || null,
          msg.nlpSentimentLabel || null
        );
      } catch (error) {
        // Ignore duplicates
      }
    }
  }

  /**
   * Calculate sentiment summary from messages
   */
  calculateSummary(messages) {
    if (messages.length === 0) {
      return { sentiment: 0, confidence: 0, signal: 'neutral' };
    }

    const bullish = messages.filter(m => m.userSentiment === 'Bullish').length;
    const bearish = messages.filter(m => m.userSentiment === 'Bearish').length;
    const tagged = bullish + bearish;
    const untagged = messages.length - tagged;

    let taggedSentiment = 0;
    if (tagged > 0) {
      taggedSentiment = (bullish - bearish) / tagged;
    }

    let nlpSentiment = 0;
    const nlpMessages = messages.filter(m => m.nlpSentimentScore !== null && m.nlpSentimentScore !== undefined);
    if (nlpMessages.length > 0) {
      nlpSentiment = nlpMessages.reduce((sum, m) => sum + m.nlpSentimentScore, 0) / nlpMessages.length;
    }

    const userWeight = 0.7;
    const nlpWeight = 0.3;

    let combinedSentiment;
    if (tagged > 0 && nlpMessages.length > 0) {
      combinedSentiment = (taggedSentiment * userWeight) + (nlpSentiment * nlpWeight);
    } else if (tagged > 0) {
      combinedSentiment = taggedSentiment;
    } else {
      combinedSentiment = nlpSentiment;
    }

    let confidence;
    if (messages.length >= 25) confidence = 0.9;
    else if (messages.length >= 15) confidence = 0.7;
    else if (messages.length >= 8) confidence = 0.5;
    else confidence = 0.3;

    if (tagged / messages.length > 0.5) {
      confidence = Math.min(confidence + 0.1, 1);
    }

    let signal;
    if (combinedSentiment >= 0.4) signal = 'strong_buy';
    else if (combinedSentiment >= 0.2) signal = 'buy';
    else if (combinedSentiment >= 0.05) signal = 'lean_buy';
    else if (combinedSentiment <= -0.4) signal = 'strong_sell';
    else if (combinedSentiment <= -0.2) signal = 'sell';
    else if (combinedSentiment <= -0.05) signal = 'lean_sell';
    else signal = 'hold';

    return {
      sentiment: Math.round(combinedSentiment * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      signal,
      totalMessages: messages.length,
      bullishCount: bullish,
      bearishCount: bearish,
      untaggedCount: untagged,
      bullishRatio: tagged > 0 ? Math.round((bullish / tagged) * 100) : null,
    };
  }

  /**
   * Get historical sentiment from database
   */
  getSentimentHistory(companyId, days = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const messages = this.db.prepare(`
      SELECT * FROM stocktwits_messages
      WHERE company_id = ?
        AND posted_at >= ?
      ORDER BY posted_at DESC
    `).all(companyId, cutoff.toISOString());

    return this.calculateSummary(messages);
  }
}

module.exports = StockTwitsFetcher;
