/**
 * Earnings Call Transcript Service
 *
 * Scrapes and analyzes earnings call transcripts for qualitative insights.
 * Focuses on sentiment analysis, guidance tracking, and management credibility.
 */

const db = require('../../database');

// NLP keywords for analysis
const SENTIMENT_KEYWORDS = {
  positive: [
    'strong', 'growth', 'exceeded', 'beat', 'record', 'momentum', 'confident',
    'optimistic', 'accelerating', 'robust', 'healthy', 'outperform', 'success',
    'improvement', 'opportunity', 'exciting', 'pleased', 'delighted', 'thrilled'
  ],
  negative: [
    'decline', 'weak', 'challenging', 'headwind', 'pressure', 'uncertain',
    'disappointing', 'miss', 'concern', 'risk', 'slowdown', 'difficult',
    'softness', 'cautious', 'prudent', 'constrained', 'impacted', 'disruption'
  ],
  hedging: [
    'may', 'might', 'could', 'possibly', 'potentially', 'uncertain',
    'depends', 'subject to', 'if', 'assuming', 'expect', 'believe',
    'anticipate', 'estimate', 'approximately', 'roughly'
  ],
  guidance: {
    raised: ['raising', 'increased', 'higher', 'upward revision', 'raised guidance'],
    maintained: ['maintaining', 'reaffirming', 'unchanged', 'consistent with'],
    lowered: ['lowering', 'reduced', 'lower', 'downward revision', 'lowered guidance'],
    withdrew: ['withdrawing', 'suspending', 'no longer providing', 'withdrew']
  }
};

class TranscriptService {
  constructor(dbInstance = null) {
    this.db = dbInstance || db.getDatabase();
  }

  /**
   * Store a transcript with NLP analysis
   */
  storeTranscript(data) {
    const {
      companyId,
      symbol,
      fiscalYear,
      fiscalQuarter,
      callDate,
      callType = 'earnings',
      title,
      fullTranscript,
      preparedRemarks,
      qaSection,
      executives,
      analysts,
      source,
      sourceUrl
    } = data;

    // Analyze the transcript
    const analysis = this.analyzeTranscript(fullTranscript || preparedRemarks || '');

    // Get prior quarter's sentiment for comparison
    const priorCall = this.getLatestTranscript(symbol);
    const toneChange = priorCall
      ? analysis.sentimentScore - (priorCall.sentiment_score || 0)
      : null;

    const stmt = this.db.prepare(`
      INSERT INTO earnings_transcripts (
        company_id, symbol, fiscal_year, fiscal_quarter, call_date, call_type,
        title, full_transcript, prepared_remarks, qa_section,
        executives, analysts,
        sentiment_score, confidence_score, tone,
        guidance_phrases, uncertainty_phrases, forward_looking_count, risk_mentions,
        tone_change, guidance_change,
        source, source_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, fiscal_year, fiscal_quarter, call_type) DO UPDATE SET
        title = excluded.title,
        full_transcript = excluded.full_transcript,
        prepared_remarks = excluded.prepared_remarks,
        qa_section = excluded.qa_section,
        executives = excluded.executives,
        analysts = excluded.analysts,
        sentiment_score = excluded.sentiment_score,
        confidence_score = excluded.confidence_score,
        tone = excluded.tone,
        guidance_phrases = excluded.guidance_phrases,
        uncertainty_phrases = excluded.uncertainty_phrases,
        forward_looking_count = excluded.forward_looking_count,
        risk_mentions = excluded.risk_mentions,
        tone_change = excluded.tone_change,
        guidance_change = excluded.guidance_change,
        source = excluded.source,
        source_url = excluded.source_url,
        fetched_at = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      companyId, symbol, fiscalYear, fiscalQuarter, callDate, callType,
      title, fullTranscript, preparedRemarks, qaSection,
      JSON.stringify(executives || []), JSON.stringify(analysts || []),
      analysis.sentimentScore, analysis.confidenceScore, analysis.tone,
      JSON.stringify(analysis.guidanceDetected), analysis.uncertaintyCount,
      analysis.forwardLookingCount, analysis.riskMentions,
      toneChange, analysis.guidanceChange,
      source, sourceUrl
    );
  }

  /**
   * Analyze transcript text for sentiment and key signals
   */
  analyzeTranscript(text) {
    if (!text || text.length === 0) {
      return {
        sentimentScore: 0,
        confidenceScore: 0,
        tone: 'neutral',
        guidanceDetected: {},
        uncertaintyCount: 0,
        forwardLookingCount: 0,
        riskMentions: 0,
        guidanceChange: null
      };
    }

    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/);
    const totalWords = words.length;

    // Count sentiment keywords
    let positiveCount = 0;
    let negativeCount = 0;
    let hedgingCount = 0;
    let riskCount = 0;
    let forwardCount = 0;

    const forwardPhrases = ['going forward', 'next quarter', 'next year', 'in the future',
      'outlook', 'forecast', 'projection', 'expect', 'anticipate'];

    for (const word of SENTIMENT_KEYWORDS.positive) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) positiveCount += matches.length;
    }

    for (const word of SENTIMENT_KEYWORDS.negative) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) negativeCount += matches.length;
    }

    for (const word of SENTIMENT_KEYWORDS.hedging) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) hedgingCount += matches.length;
    }

    // Count risk mentions
    const riskKeywords = ['risk', 'uncertainty', 'volatile', 'challenge', 'threat', 'concern'];
    for (const word of riskKeywords) {
      const regex = new RegExp(`\\b${word}\\w*\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) riskCount += matches.length;
    }

    // Count forward-looking statements
    for (const phrase of forwardPhrases) {
      const regex = new RegExp(phrase, 'gi');
      const matches = text.match(regex);
      if (matches) forwardCount += matches.length;
    }

    // Detect guidance changes
    const guidanceDetected = {};
    for (const [changeType, phrases] of Object.entries(SENTIMENT_KEYWORDS.guidance)) {
      for (const phrase of phrases) {
        if (lowerText.includes(phrase)) {
          guidanceDetected[changeType] = true;
          break;
        }
      }
    }

    // Calculate sentiment score (-1 to +1)
    const sentimentRatio = (positiveCount - negativeCount) / Math.max(positiveCount + negativeCount, 1);
    const normalizedSentiment = Math.max(-1, Math.min(1, sentimentRatio));

    // Calculate confidence (lower if more hedging language)
    const hedgingRatio = hedgingCount / Math.max(totalWords / 100, 1);
    const confidence = Math.max(0, Math.min(1, 1 - (hedgingRatio * 0.1)));

    // Determine tone
    let tone = 'neutral';
    if (normalizedSentiment > 0.3) tone = 'positive';
    else if (normalizedSentiment > 0.1) tone = 'cautiously_positive';
    else if (normalizedSentiment < -0.3) tone = 'negative';
    else if (normalizedSentiment < -0.1) tone = 'cautious';

    // Determine guidance change
    let guidanceChange = null;
    if (guidanceDetected.raised) guidanceChange = 'raised';
    else if (guidanceDetected.lowered) guidanceChange = 'lowered';
    else if (guidanceDetected.withdrew) guidanceChange = 'withdrew';
    else if (guidanceDetected.maintained) guidanceChange = 'maintained';

    return {
      sentimentScore: Math.round(normalizedSentiment * 1000) / 1000,
      confidenceScore: Math.round(confidence * 1000) / 1000,
      tone,
      guidanceDetected,
      uncertaintyCount: hedgingCount,
      forwardLookingCount: forwardCount,
      riskMentions: riskCount,
      guidanceChange
    };
  }

  /**
   * Get latest transcript for a symbol
   */
  getLatestTranscript(symbol) {
    return this.db.prepare(`
      SELECT * FROM earnings_transcripts
      WHERE symbol = ?
      ORDER BY call_date DESC
      LIMIT 1
    `).get(symbol);
  }

  /**
   * Get transcript history for a company
   */
  getTranscriptHistory(symbol, limit = 8) {
    return this.db.prepare(`
      SELECT
        id, symbol, fiscal_year, fiscal_quarter, call_date, call_type,
        title, sentiment_score, confidence_score, tone,
        uncertainty_phrases, forward_looking_count, risk_mentions,
        tone_change, guidance_change, source
      FROM earnings_transcripts
      WHERE symbol = ?
      ORDER BY call_date DESC
      LIMIT ?
    `).all(symbol, limit);
  }

  /**
   * Get sentiment trend for a company
   */
  getSentimentTrend(symbol, quarters = 8) {
    const transcripts = this.db.prepare(`
      SELECT fiscal_year, fiscal_quarter, call_date,
             sentiment_score, tone, tone_change, guidance_change
      FROM earnings_transcripts
      WHERE symbol = ?
      ORDER BY call_date DESC
      LIMIT ?
    `).all(symbol, quarters);

    if (transcripts.length < 2) {
      return { trend: 'insufficient_data', transcripts };
    }

    const scores = transcripts.map(t => t.sentiment_score).filter(s => s !== null);
    const avgRecent = scores.slice(0, 4).reduce((a, b) => a + b, 0) / Math.min(4, scores.length);
    const avgOlder = scores.slice(4).reduce((a, b) => a + b, 0) / Math.max(1, scores.slice(4).length);

    let trend = 'stable';
    if (avgRecent > avgOlder + 0.1) trend = 'improving';
    else if (avgRecent < avgOlder - 0.1) trend = 'deteriorating';

    return { trend, avgRecent, avgOlder, transcripts };
  }

  /**
   * Find companies with deteriorating sentiment
   */
  findDeterioratingSentiment() {
    return this.db.prepare(`
      WITH recent AS (
        SELECT company_id, symbol, sentiment_score, tone_change,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY call_date DESC) as rn
        FROM earnings_transcripts
      )
      SELECT r.symbol, r.sentiment_score, r.tone_change,
             c.name, c.sector
      FROM recent r
      JOIN companies c ON r.company_id = c.id
      WHERE r.rn = 1 AND r.tone_change < -0.2
      ORDER BY r.tone_change ASC
      LIMIT 20
    `).all();
  }

  /**
   * Find companies with improving sentiment
   */
  findImprovingSentiment() {
    return this.db.prepare(`
      WITH recent AS (
        SELECT company_id, symbol, sentiment_score, tone_change,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY call_date DESC) as rn
        FROM earnings_transcripts
      )
      SELECT r.symbol, r.sentiment_score, r.tone_change,
             c.name, c.sector
      FROM recent r
      JOIN companies c ON r.company_id = c.id
      WHERE r.rn = 1 AND r.tone_change > 0.2
      ORDER BY r.tone_change DESC
      LIMIT 20
    `).all();
  }

  /**
   * Store management guidance
   */
  storeGuidance(data) {
    const {
      companyId, symbol, guidanceDate, fiscalYear, fiscalQuarter,
      revenueLow, revenueHigh, revenueMid,
      epsLow, epsHigh, epsMid,
      grossMarginGuidance, operatingMarginGuidance,
      tone, keyDrivers, headwinds, tailwinds,
      source
    } = data;

    // Get prior guidance for comparison
    const prior = this.db.prepare(`
      SELECT revenue_low, revenue_high, eps_low, eps_high
      FROM management_guidance
      WHERE company_id = ? AND fiscal_year = ?
      ORDER BY guidance_date DESC
      LIMIT 1
    `).get(companyId, fiscalYear);

    let revenueChange = 'initiated';
    let epsChange = 'initiated';

    if (prior) {
      if (revenueMid && prior.revenue_mid) {
        const revChange = (revenueMid - (prior.revenue_low + prior.revenue_high) / 2) /
                          ((prior.revenue_low + prior.revenue_high) / 2);
        if (revChange > 0.02) revenueChange = 'raised';
        else if (revChange < -0.02) revenueChange = 'lowered';
        else revenueChange = 'maintained';
      }

      if (epsMid && prior.eps_mid) {
        const epsChg = (epsMid - (prior.eps_low + prior.eps_high) / 2) /
                       Math.abs((prior.eps_low + prior.eps_high) / 2);
        if (epsChg > 0.02) epsChange = 'raised';
        else if (epsChg < -0.02) epsChange = 'lowered';
        else epsChange = 'maintained';
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO management_guidance (
        company_id, symbol, guidance_date, fiscal_year, fiscal_quarter,
        revenue_low, revenue_high, revenue_mid,
        revenue_prior_low, revenue_prior_high, revenue_change,
        eps_low, eps_high, eps_mid,
        eps_prior_low, eps_prior_high, eps_change,
        gross_margin_guidance, operating_margin_guidance,
        tone, key_drivers, headwinds, tailwinds,
        source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      companyId, symbol, guidanceDate, fiscalYear, fiscalQuarter,
      revenueLow, revenueHigh, revenueMid,
      prior?.revenue_low, prior?.revenue_high, revenueChange,
      epsLow, epsHigh, epsMid,
      prior?.eps_low, prior?.eps_high, epsChange,
      grossMarginGuidance, operatingMarginGuidance,
      tone, JSON.stringify(keyDrivers || []),
      JSON.stringify(headwinds || []), JSON.stringify(tailwinds || []),
      source
    );
  }

  /**
   * Get guidance history
   */
  getGuidanceHistory(symbol, limit = 8) {
    return this.db.prepare(`
      SELECT * FROM management_guidance
      WHERE symbol = ?
      ORDER BY guidance_date DESC
      LIMIT ?
    `).all(symbol, limit);
  }

  /**
   * Update management track record
   */
  updateTrackRecord(companyId, symbol) {
    // Calculate guidance accuracy
    const guidanceStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN beat_prior_guidance = 1 THEN 1 ELSE 0 END) as beats,
        SUM(CASE WHEN beat_prior_guidance = 0 THEN 1 ELSE 0 END) as misses
      FROM management_guidance
      WHERE company_id = ?
    `).get(companyId);

    // Calculate earnings beat rate from analyst estimates
    const earningsStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN actual_eps > estimated_eps THEN 1 ELSE 0 END) as beats,
        SUM(CASE WHEN actual_eps < estimated_eps THEN 1 ELSE 0 END) as misses
      FROM analyst_estimates
      WHERE company_id = ? AND actual_eps IS NOT NULL
    `).get(companyId);

    // Calculate transparency/consistency from transcripts
    const sentimentStats = this.db.prepare(`
      SELECT
        AVG(confidence_score) as avg_confidence,
        STDEV(sentiment_score) as sentiment_volatility
      FROM earnings_transcripts
      WHERE company_id = ?
    `).get(companyId);

    const guidanceAccuracy = guidanceStats?.total > 0
      ? guidanceStats.beats / guidanceStats.total
      : null;

    const earningsBeatRate = earningsStats?.total > 0
      ? earningsStats.beats / earningsStats.total
      : null;

    const transparencyScore = sentimentStats?.avg_confidence
      ? sentimentStats.avg_confidence * 100
      : null;

    const consistencyScore = sentimentStats?.sentiment_volatility !== null
      ? Math.max(0, 100 - sentimentStats.sentiment_volatility * 100)
      : null;

    // Composite credibility score
    let credibilityScore = null;
    const components = [guidanceAccuracy, earningsBeatRate, transparencyScore / 100, consistencyScore / 100]
      .filter(c => c !== null);

    if (components.length > 0) {
      credibilityScore = (components.reduce((a, b) => a + b, 0) / components.length) * 100;
    }

    const stmt = this.db.prepare(`
      INSERT INTO management_track_record (
        company_id, symbol,
        total_guidance_given, guidance_beats, guidance_misses, guidance_accuracy_rate,
        earnings_beats, earnings_misses, earnings_beat_rate,
        transparency_score, consistency_score, credibility_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id) DO UPDATE SET
        total_guidance_given = excluded.total_guidance_given,
        guidance_beats = excluded.guidance_beats,
        guidance_misses = excluded.guidance_misses,
        guidance_accuracy_rate = excluded.guidance_accuracy_rate,
        earnings_beats = excluded.earnings_beats,
        earnings_misses = excluded.earnings_misses,
        earnings_beat_rate = excluded.earnings_beat_rate,
        transparency_score = excluded.transparency_score,
        consistency_score = excluded.consistency_score,
        credibility_score = excluded.credibility_score,
        last_updated = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      companyId, symbol,
      guidanceStats?.total || 0, guidanceStats?.beats || 0, guidanceStats?.misses || 0, guidanceAccuracy,
      earningsStats?.beats || 0, earningsStats?.misses || 0, earningsBeatRate,
      transparencyScore, consistencyScore, credibilityScore
    );
  }

  /**
   * Get most credible management teams
   */
  getTopCredibleManagement(limit = 20) {
    return this.db.prepare(`
      SELECT
        mtr.symbol, c.name, c.sector,
        mtr.guidance_accuracy_rate,
        mtr.earnings_beat_rate,
        mtr.transparency_score,
        mtr.credibility_score
      FROM management_track_record mtr
      JOIN companies c ON mtr.company_id = c.id
      WHERE mtr.credibility_score IS NOT NULL
      ORDER BY mtr.credibility_score DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = TranscriptService;
