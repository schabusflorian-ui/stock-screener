/**
 * Sentiment Signal Generator
 *
 * Converts raw sentiment data into actionable buy/sell/hold signals
 */

class SentimentSignalGenerator {
  constructor(db) {
    this.db = db;
  }

  /**
   * Calculate sentiment summary and signal for a company
   */
  async calculateSignal(companyId, symbol, period = '7d') {
    const days = this.parsePeriod(period);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    // Get posts from database
    const posts = this.db.prepare(`
      SELECT * FROM reddit_posts
      WHERE company_id = ?
        AND posted_at >= ?
        AND sentiment_score IS NOT NULL
      ORDER BY posted_at DESC
    `).all(companyId, cutoff.toISOString());

    if (posts.length === 0) {
      return this.createEmptySignal(companyId, period);
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(posts);

    // Get prior period for momentum
    const priorCutoff = new Date(cutoff);
    priorCutoff.setDate(priorCutoff.getDate() - days);

    const priorPosts = this.db.prepare(`
      SELECT * FROM reddit_posts
      WHERE company_id = ?
        AND posted_at >= ?
        AND posted_at < ?
        AND sentiment_score IS NOT NULL
    `).all(companyId, priorCutoff.toISOString(), cutoff.toISOString());

    const priorMetrics = priorPosts.length > 0
      ? this.calculateMetrics(priorPosts)
      : null;

    // Calculate momentum
    const momentum = priorMetrics
      ? metrics.weightedSentiment - priorMetrics.weightedSentiment
      : 0;

    const volumeChange = priorMetrics && priorMetrics.totalPosts > 0
      ? (metrics.totalPosts - priorMetrics.totalPosts) / priorMetrics.totalPosts
      : 0;

    // Generate signal
    const signal = this.generateSignal(metrics, momentum, volumeChange);

    // Create summary
    const summary = {
      companyId,
      period,
      source: 'reddit',
      ...metrics,
      sentimentChange: momentum,
      volumeChange,
      ...signal,
    };

    // Store summary
    this.storeSummary(summary);

    // Update company record
    this.updateCompany(companyId, summary);

    return summary;
  }

  /**
   * Calculate sentiment metrics from posts
   */
  calculateMetrics(posts) {
    const sentiments = posts.map(p => p.sentiment_score).filter(s => s !== null);

    // Counts
    const positiveCount = posts.filter(p => p.sentiment_label === 'positive').length;
    const negativeCount = posts.filter(p => p.sentiment_label === 'negative').length;
    const neutralCount = posts.length - positiveCount - negativeCount;

    // Simple average
    const avgSentiment = sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0;

    // Weighted by score and recency
    const weightedSentiment = this.calculateWeightedSentiment(posts);

    // Standard deviation (sentiment volatility)
    const stdDev = this.calculateStdDev(sentiments, avgSentiment);

    // Engagement
    const totalScore = posts.reduce((sum, p) => sum + (p.score || 0), 0);
    const totalComments = posts.reduce((sum, p) => sum + (p.num_comments || 0), 0);

    // WSB metrics
    const ddPosts = posts.filter(p => p.is_dd).length;
    const yoloPosts = posts.filter(p => p.is_yolo).length;
    const buyMentions = posts.filter(p => p.mentions_buy).length;
    const sellMentions = posts.filter(p => p.mentions_sell).length;
    const rocketCount = posts.reduce((sum, p) => sum + (p.has_rockets || 0), 0);

    return {
      totalPosts: posts.length,
      positiveCount,
      negativeCount,
      neutralCount,
      totalScore,
      totalComments,
      avgSentiment: Math.round(avgSentiment * 1000) / 1000,
      weightedSentiment: Math.round(weightedSentiment * 1000) / 1000,
      sentimentStdDev: Math.round(stdDev * 1000) / 1000,
      ddPosts,
      yoloPosts,
      buyMentions,
      sellMentions,
      rocketCount,
    };
  }

  /**
   * Calculate time and engagement weighted sentiment
   */
  calculateWeightedSentiment(posts) {
    if (posts.length === 0) return 0;

    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;

    for (const post of posts) {
      if (post.sentiment_score === null) continue;

      const postTime = new Date(post.posted_at).getTime();
      const hoursAgo = (now - postTime) / (1000 * 60 * 60);

      // Time decay: half-life of 48 hours
      const timeWeight = Math.exp(-hoursAgo / 48);

      // Engagement weight: log scale of score
      const engagementWeight = Math.log(Math.max(post.score, 1) + 1);

      // DD posts get 2x weight (more thoughtful analysis)
      const ddMultiplier = post.is_dd ? 2 : 1;

      const weight = timeWeight * engagementWeight * ddMultiplier;

      weightedSum += post.sentiment_score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate standard deviation
   */
  calculateStdDev(values, mean) {
    if (values.length < 2) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Generate signal from metrics
   */
  generateSignal(metrics, momentum, volumeChange) {
    let score = 0;

    // Base score from weighted sentiment (-100 to +100)
    score += metrics.weightedSentiment * 100;

    // Momentum bonus/penalty (-30 to +30)
    score += momentum * 75;

    // High volume of posts amplifies signal
    if (metrics.totalPosts >= 20 && Math.abs(metrics.weightedSentiment) > 0.1) {
      score += Math.sign(metrics.weightedSentiment) * 10;
    }

    // Buy/sell mention ratio
    const mentionRatio = metrics.buyMentions / Math.max(metrics.sellMentions, 1);
    if (mentionRatio > 2) score += 10;
    if (mentionRatio < 0.5) score -= 10;

    // DD posts are higher quality signal
    if (metrics.ddPosts >= 2) {
      score += Math.sign(metrics.weightedSentiment) * 5;
    }

    // Rocket emojis (WSB bullishness)
    if (metrics.rocketCount >= 10) score += 5;

    // High sentiment volatility = lower confidence
    const volatilityPenalty = metrics.sentimentStdDev > 0.4 ? 0.8 : 1;

    // Determine signal
    let signal, strength;

    if (score >= 40) {
      signal = 'strong_buy';
      strength = 5;
    } else if (score >= 25) {
      signal = 'buy';
      strength = 4;
    } else if (score >= 10) {
      signal = 'lean_buy';
      strength = 3;
    } else if (score <= -40) {
      signal = 'strong_sell';
      strength = 5;
    } else if (score <= -25) {
      signal = 'sell';
      strength = 4;
    } else if (score <= -10) {
      signal = 'lean_sell';
      strength = 3;
    } else {
      signal = 'hold';
      strength = 2;
    }

    // Calculate confidence
    let confidence;
    if (metrics.totalPosts >= 30) {
      confidence = 0.9;
    } else if (metrics.totalPosts >= 15) {
      confidence = 0.7;
    } else if (metrics.totalPosts >= 5) {
      confidence = 0.5;
    } else {
      confidence = 0.3;
      signal = 'hold'; // Not enough data
      strength = 1;
    }

    confidence *= volatilityPenalty;

    return {
      signal,
      signalStrength: strength,
      confidence: Math.round(confidence * 100) / 100,
      rawScore: Math.round(score),
    };
  }

  /**
   * Store summary in database
   */
  storeSummary(summary) {
    this.db.prepare(`
      INSERT OR REPLACE INTO sentiment_summary (
        company_id, period, source, calculated_at,
        total_posts, positive_count, negative_count, neutral_count,
        total_score, total_comments,
        avg_sentiment, weighted_sentiment, sentiment_std_dev,
        sentiment_change, volume_change,
        dd_posts, yolo_posts, buy_mentions, sell_mentions, rocket_count,
        signal, signal_strength, confidence
      ) VALUES (
        ?, ?, 'reddit', datetime('now'),
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(
      summary.companyId,
      summary.period,
      summary.totalPosts,
      summary.positiveCount,
      summary.negativeCount,
      summary.neutralCount,
      summary.totalScore,
      summary.totalComments,
      summary.avgSentiment,
      summary.weightedSentiment,
      summary.sentimentStdDev,
      summary.sentimentChange,
      summary.volumeChange,
      summary.ddPosts,
      summary.yoloPosts,
      summary.buyMentions,
      summary.sellMentions,
      summary.rocketCount,
      summary.signal,
      summary.signalStrength,
      summary.confidence
    );

    // Also store in history (daily snapshot)
    this.storeHistory(summary);
  }

  /**
   * Store daily history snapshot for charting
   */
  storeHistory(summary) {
    const today = new Date().toISOString().split('T')[0];

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO sentiment_history (
          company_id, snapshot_date, source,
          post_count, mention_count,
          avg_sentiment, weighted_sentiment, sentiment_std_dev,
          positive_count, negative_count, neutral_count,
          total_score, total_comments, avg_engagement,
          signal, signal_strength,
          rocket_count, dd_count, yolo_count
        ) VALUES (
          ?, ?, 'reddit',
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?
        )
      `).run(
        summary.companyId,
        today,
        summary.totalPosts,
        summary.totalPosts, // mention_count = post_count for now
        summary.avgSentiment,
        summary.weightedSentiment,
        summary.sentimentStdDev || 0,
        summary.positiveCount,
        summary.negativeCount,
        summary.neutralCount,
        summary.totalScore,
        summary.totalComments,
        summary.totalPosts > 0 ? (summary.totalScore + summary.totalComments) / summary.totalPosts : 0,
        summary.signal,
        summary.signalStrength,
        summary.rocketCount || 0,
        summary.ddPosts || 0,
        summary.yoloPosts || 0
      );
    } catch (err) {
      // Ignore duplicate errors - we only want one entry per day
      if (!err.message.includes('UNIQUE')) {
        console.error('Error storing sentiment history:', err.message);
      }
    }
  }

  /**
   * Get sentiment history for charting
   */
  getHistory(companyId, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db.prepare(`
      SELECT
        snapshot_date,
        post_count,
        avg_sentiment,
        weighted_sentiment,
        positive_count,
        negative_count,
        neutral_count,
        total_score,
        total_comments,
        signal,
        signal_strength,
        rocket_count
      FROM sentiment_history
      WHERE company_id = ?
        AND snapshot_date >= ?
      ORDER BY snapshot_date ASC
    `).all(companyId, cutoff.toISOString().split('T')[0]);
  }

  /**
   * Get sentiment history from posts (fallback when no history table data)
   */
  getHistoryFromPosts(companyId, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return this.db.prepare(`
      SELECT
        DATE(posted_at) as snapshot_date,
        COUNT(*) as post_count,
        AVG(sentiment_score) as avg_sentiment,
        SUM(CASE WHEN sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(score) as total_score,
        SUM(num_comments) as total_comments,
        SUM(has_rockets) as rocket_count
      FROM reddit_posts
      WHERE company_id = ?
        AND posted_at >= ?
        AND sentiment_score IS NOT NULL
      GROUP BY DATE(posted_at)
      ORDER BY DATE(posted_at) ASC
    `).all(companyId, cutoff.toISOString());
  }

  /**
   * Update company with latest sentiment
   */
  updateCompany(companyId, summary) {
    this.db.prepare(`
      UPDATE companies SET
        sentiment_signal = ?,
        sentiment_score = ?,
        sentiment_confidence = ?,
        sentiment_updated_at = datetime('now'),
        reddit_mentions_24h = ?
      WHERE id = ?
    `).run(
      summary.signal,
      summary.weightedSentiment,
      summary.confidence,
      summary.totalPosts,
      companyId
    );
  }

  /**
   * Create empty signal when no data
   */
  createEmptySignal(companyId, period) {
    return {
      companyId,
      period,
      source: 'reddit',
      totalPosts: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      avgSentiment: 0,
      weightedSentiment: 0,
      signal: 'hold',
      signalStrength: 1,
      confidence: 0,
      message: 'Insufficient data',
    };
  }

  parsePeriod(period) {
    const match = period.match(/^(\d+)([dwm])$/);
    if (!match) return 7;
    const [, num, unit] = match;
    switch (unit) {
      case 'd': return parseInt(num);
      case 'w': return parseInt(num) * 7;
      case 'm': return parseInt(num) * 30;
      default: return 7;
    }
  }
}

module.exports = SentimentSignalGenerator;
