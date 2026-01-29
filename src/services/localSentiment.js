/**
 * Local Sentiment Analysis using Transformer models
 * Enhanced with financial-specific lexicon adjustments
 *
 * Uses DistilBERT fine-tuned on sentiment analysis.
 * Runs locally - unlimited, free, no API calls.
 *
 * First run downloads model (~250MB), then cached in ~/.cache/huggingface
 */

let pipeline = null;

// Available models in order of preference
const MODELS = [
  'Xenova/distilbert-base-uncased-finetuned-sst-2-english', // Fast, reliable
  'Xenova/bert-base-multilingual-uncased-sentiment',        // Multilingual backup
];

// Financial lexicon for sentiment adjustment
// These words have specific meaning in financial context
const FINANCIAL_LEXICON = {
  // Strong bullish signals
  strongBullish: [
    'moon', 'mooning', 'rocket', 'rockets', 'tendies', 'diamond hands', 'diamondhands',
    'bullish', 'bull', 'calls', 'long', 'buy the dip', 'btd', 'undervalued',
    'beat earnings', 'beats', 'exceeded', 'upgrade', 'upgraded', 'outperform',
    'strong buy', 'accumulate', 'breakout', 'rally', 'squeeze', 'gamma squeeze',
    'short squeeze', 'massive upside', 'explosive growth', 'printing money'
  ],
  // Moderate bullish signals
  bullish: [
    'buy', 'buying', 'bought', 'hold', 'holding', 'hodl', 'gains', 'gain',
    'profit', 'profits', 'winner', 'winning', 'green', 'up', 'rising',
    'growth', 'growing', 'positive', 'optimistic', 'confident', 'support',
    'rebound', 'recovery', 'recovering', 'opportunity', 'upside', 'potential'
  ],
  // Strong bearish signals
  strongBearish: [
    'crash', 'crashing', 'dump', 'dumping', 'tank', 'tanking', 'collapse',
    'puts', 'short', 'shorting', 'overvalued', 'bubble', 'scam', 'fraud',
    'miss earnings', 'missed', 'downgrade', 'downgraded', 'underperform',
    'sell off', 'selloff', 'bagholding', 'bagholder', 'rekt', 'guh',
    'bankruptcy', 'bankrupt', 'delisted', 'worthless'
  ],
  // Moderate bearish signals
  bearish: [
    'sell', 'selling', 'sold', 'drop', 'dropping', 'fall', 'falling',
    'loss', 'losses', 'losing', 'loser', 'red', 'down', 'declining',
    'decline', 'negative', 'pessimistic', 'worried', 'concern', 'risk',
    'risky', 'overpriced', 'expensive', 'resistance', 'pullback', 'correction'
  ],
  // Neutral/informational (reduce sentiment weight)
  neutral: [
    'dd', 'due diligence', 'analysis', 'research', 'question', 'thoughts',
    'opinion', 'imo', 'imho', 'what do you think', 'discussion', 'news'
  ]
};

// Pre-compile regex patterns for performance
const LEXICON_PATTERNS = {
  strongBullish: new RegExp(`\\b(${FINANCIAL_LEXICON.strongBullish.join('|')})\\b`, 'gi'),
  bullish: new RegExp(`\\b(${FINANCIAL_LEXICON.bullish.join('|')})\\b`, 'gi'),
  strongBearish: new RegExp(`\\b(${FINANCIAL_LEXICON.strongBearish.join('|')})\\b`, 'gi'),
  bearish: new RegExp(`\\b(${FINANCIAL_LEXICON.bearish.join('|')})\\b`, 'gi'),
  neutral: new RegExp(`\\b(${FINANCIAL_LEXICON.neutral.join('|')})\\b`, 'gi'),
  rockets: /🚀/g,
  charts: /📈/g,
  fire: /🔥/g,
  money: /💰|💵|💸/g,
  warning: /⚠️|🚨/g,
  down: /📉/g
};

class LocalSentimentAnalyzer {
  constructor() {
    this.classifier = null;
    this.isLoading = false;
    this.loadPromise = null;
    this.modelName = null;
  }

  /**
   * Initialize sentiment model (lazy load)
   */
  async initialize() {
    if (this.classifier) return;

    if (this.isLoading) {
      await this.loadPromise;
      return;
    }

    this.isLoading = true;
    console.log('Loading sentiment analysis model...');

    try {
      // Dynamic import for ES modules compatibility
      if (!pipeline) {
        const transformers = await import('@xenova/transformers');
        pipeline = transformers.pipeline;
      }

      // Try models in order until one works
      for (const model of MODELS) {
        try {
          console.log(`Trying model: ${model}`);
          this.loadPromise = pipeline(
            'sentiment-analysis',
            model,
            { progress_callback: this.onProgress.bind(this) }
          );
          this.classifier = await this.loadPromise;
          this.modelName = model;
          console.log(`\nSentiment model loaded: ${model}`);
          return;
        } catch (e) {
          console.log(`Model ${model} failed, trying next...`);
        }
      }

      throw new Error('No sentiment models available');
    } catch (error) {
      console.error('Failed to load sentiment model:', error.message);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  onProgress(progress) {
    if (progress.status === 'downloading') {
      const pct = ((progress.loaded / progress.total) * 100).toFixed(1);
      process.stdout.write(`\rDownloading model: ${pct}%`);
    }
  }

  /**
   * Calculate financial lexicon adjustment
   * Returns a value between -0.4 and +0.4 to adjust base sentiment
   */
  calculateFinancialAdjustment(text) {
    const lowerText = text.toLowerCase();

    // Count matches in each category
    const strongBullishMatches = (lowerText.match(LEXICON_PATTERNS.strongBullish) || []).length;
    const bullishMatches = (lowerText.match(LEXICON_PATTERNS.bullish) || []).length;
    const strongBearishMatches = (lowerText.match(LEXICON_PATTERNS.strongBearish) || []).length;
    const bearishMatches = (lowerText.match(LEXICON_PATTERNS.bearish) || []).length;
    const neutralMatches = (lowerText.match(LEXICON_PATTERNS.neutral) || []).length;

    // Count emoji sentiment
    const rocketCount = (text.match(LEXICON_PATTERNS.rockets) || []).length;
    const chartUpCount = (text.match(LEXICON_PATTERNS.charts) || []).length;
    const fireCount = (text.match(LEXICON_PATTERNS.fire) || []).length;
    const moneyCount = (text.match(LEXICON_PATTERNS.money) || []).length;
    const warningCount = (text.match(LEXICON_PATTERNS.warning) || []).length;
    const chartDownCount = (text.match(LEXICON_PATTERNS.down) || []).length;

    // Calculate weighted scores
    const bullishScore = (strongBullishMatches * 0.15) + (bullishMatches * 0.05) +
                         (rocketCount * 0.1) + (chartUpCount * 0.05) +
                         (fireCount * 0.03) + (moneyCount * 0.05);

    const bearishScore = (strongBearishMatches * 0.15) + (bearishMatches * 0.05) +
                         (warningCount * 0.08) + (chartDownCount * 0.05);

    // Neutral content dampens the overall sentiment
    const neutralDampen = neutralMatches > 2 ? 0.8 : 1.0;

    // Calculate net adjustment (capped at +/- 0.4)
    let adjustment = (bullishScore - bearishScore) * neutralDampen;
    adjustment = Math.max(-0.4, Math.min(0.4, adjustment));

    return {
      adjustment,
      details: {
        strongBullish: strongBullishMatches,
        bullish: bullishMatches,
        strongBearish: strongBearishMatches,
        bearish: bearishMatches,
        neutral: neutralMatches,
        emojiBullish: rocketCount + chartUpCount + fireCount + moneyCount,
        emojiBearish: warningCount + chartDownCount
      }
    };
  }

  /**
   * Analyze single text with financial lexicon enhancement
   * @param {string} text - Text to analyze
   * @returns {Object} { label, score, confidence, financialAdjustment }
   */
  async analyze(text) {
    await this.initialize();

    if (!text || text.trim().length === 0) {
      return { label: 'neutral', score: 0, confidence: 0, financialAdjustment: 0 };
    }

    // Truncate to model's max (512 tokens ~ 1500 chars)
    const truncated = text.slice(0, 1500);

    try {
      const result = await this.classifier(truncated);
      const output = result[0];

      // Get base score from model
      let baseScore;
      switch (output.label.toLowerCase()) {
        case 'positive':
          baseScore = output.score;
          break;
        case 'negative':
          baseScore = -output.score;
          break;
        default:
          baseScore = 0;
      }

      // Apply financial lexicon adjustment
      const { adjustment, details } = this.calculateFinancialAdjustment(text);

      // Combine base score with financial adjustment
      // Weight: 70% model, 30% lexicon
      let finalScore = (baseScore * 0.7) + (adjustment * 0.3);

      // Additional boost if model and lexicon agree strongly
      if ((baseScore > 0.3 && adjustment > 0.1) || (baseScore < -0.3 && adjustment < -0.1)) {
        finalScore += adjustment * 0.2; // Extra 20% of lexicon score
      }

      // Clamp to [-1, 1]
      finalScore = Math.max(-1, Math.min(1, finalScore));

      // Determine final label
      let label;
      if (finalScore > 0.1) label = 'positive';
      else if (finalScore < -0.1) label = 'negative';
      else label = 'neutral';

      return {
        label,
        score: Math.round(finalScore * 1000) / 1000,
        confidence: Math.round(output.score * 1000) / 1000,
        financialAdjustment: Math.round(adjustment * 1000) / 1000,
        lexiconDetails: details
      };
    } catch (error) {
      console.error('Sentiment analysis error:', error.message);
      return { label: 'neutral', score: 0, confidence: 0, financialAdjustment: 0 };
    }
  }

  /**
   * Analyze batch of texts (more efficient)
   * @param {string[]} texts - Array of texts
   * @returns {Object[]} Array of { label, score, confidence, financialAdjustment }
   */
  async analyzeBatch(texts) {
    await this.initialize();

    if (!texts || texts.length === 0) return [];

    const results = [];
    const batchSize = 8; // Process 8 at a time for memory efficiency

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts
        .slice(i, i + batchSize)
        .map(t => (t || '').slice(0, 1500));

      try {
        const batchResults = await this.classifier(batch);

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const originalText = texts[i + j] || '';
          const output = Array.isArray(result) ? result[0] : result;

          // Get base score
          let baseScore;
          switch (output.label.toLowerCase()) {
            case 'positive':
              baseScore = output.score;
              break;
            case 'negative':
              baseScore = -output.score;
              break;
            default:
              baseScore = 0;
          }

          // Apply financial lexicon adjustment
          const { adjustment } = this.calculateFinancialAdjustment(originalText);

          // Combine scores
          let finalScore = (baseScore * 0.7) + (adjustment * 0.3);
          if ((baseScore > 0.3 && adjustment > 0.1) || (baseScore < -0.3 && adjustment < -0.1)) {
            finalScore += adjustment * 0.2;
          }
          finalScore = Math.max(-1, Math.min(1, finalScore));

          let label;
          if (finalScore > 0.1) label = 'positive';
          else if (finalScore < -0.1) label = 'negative';
          else label = 'neutral';

          results.push({
            label,
            score: Math.round(finalScore * 1000) / 1000,
            confidence: Math.round(output.score * 1000) / 1000,
            financialAdjustment: Math.round(adjustment * 1000) / 1000
          });
        }
      } catch (error) {
        // On error, fill with neutral
        for (let j = 0; j < batch.length; j++) {
          results.push({ label: 'neutral', score: 0, confidence: 0, financialAdjustment: 0 });
        }
      }
    }

    return results;
  }

  /**
   * Analyze title + body together (for Reddit posts)
   */
  async analyzePost(title, body = '') {
    const combined = body
      ? `${title}. ${body.slice(0, 1000)}`
      : title;
    return this.analyze(combined);
  }

  /**
   * Quick financial sentiment check (lexicon only, no ML)
   * Useful for fast pre-filtering
   */
  quickAnalyze(text) {
    const { adjustment, details } = this.calculateFinancialAdjustment(text);

    let label;
    if (adjustment > 0.1) label = 'positive';
    else if (adjustment < -0.1) label = 'negative';
    else label = 'neutral';

    return { label, score: adjustment, details };
  }
}

// Singleton instance
const analyzer = new LocalSentimentAnalyzer();
module.exports = analyzer;
