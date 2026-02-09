// src/services/earningsTranscriptService.js
// Fetches and stores earnings call transcripts for PRISM report analysis
// Uses FMP API for transcript data

require('dotenv').config();
const https = require('https');
const { getDatabaseAsync } = require('../lib/db');

class EarningsTranscriptService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.fmpApiKey = process.env.FMP_API_KEY;
    this.baseUrl = 'https://financialmodelingprep.com/api/v3';
    this.delay = 1000; // 1 second between requests
    this.lastRequest = 0;
  }

  /**
   * Rate limiter
   */
  async rateLimit() {
    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < this.delay) {
      await new Promise(r => setTimeout(r, this.delay - elapsed));
    }
    this.lastRequest = Date.now();
  }

  /**
   * Make HTTP request
   */
  fetchJSON(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${e.message}`));
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Fetch transcript list for a symbol from FMP
   */
  async fetchTranscriptList(symbol) {
    if (!this.fmpApiKey) {
      console.warn('  FMP API key not set - skipping transcript fetch');
      return [];
    }

    await this.rateLimit();

    try {
      const url = `${this.baseUrl}/earning_call_transcript/${symbol}?apikey=${this.fmpApiKey}`;
      const data = await this.fetchJSON(url);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error(`  Error fetching transcript list for ${symbol}: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch full transcript for a specific quarter
   */
  async fetchFullTranscript(symbol, year, quarter) {
    if (!this.fmpApiKey) {
      return null;
    }

    await this.rateLimit();

    try {
      const url = `${this.baseUrl}/earning_call_transcript/${symbol}?year=${year}&quarter=${quarter}&apikey=${this.fmpApiKey}`;
      const data = await this.fetchJSON(url);

      if (Array.isArray(data) && data.length > 0) {
        return data[0];
      }
      return null;
    } catch (error) {
      console.error(`  Error fetching transcript for ${symbol} Q${quarter} ${year}: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze transcript content for key signals
   */
  analyzeTranscript(content) {
    if (!content) {
      return {
        sentimentScore: null,
        tone: 'neutral',
        guidancePhrases: {},
        uncertaintyPhrases: 0,
        forwardLookingCount: 0,
        riskMentions: 0
      };
    }

    const text = content.toLowerCase();

    // Sentiment analysis (simple keyword-based)
    const positiveWords = ['strong', 'growth', 'exceed', 'beat', 'record', 'momentum', 'confident', 'optimistic', 'outperform', 'acceleration'];
    const negativeWords = ['challenge', 'headwind', 'decline', 'pressure', 'weakness', 'uncertainty', 'slowdown', 'miss', 'difficult', 'concern'];

    const positiveCount = positiveWords.reduce((sum, word) =>
      sum + (text.match(new RegExp(`\\b${word}\\w*\\b`, 'gi')) || []).length, 0);
    const negativeCount = negativeWords.reduce((sum, word) =>
      sum + (text.match(new RegExp(`\\b${word}\\w*\\b`, 'gi')) || []).length, 0);

    const totalSentiment = positiveCount + negativeCount;
    const sentimentScore = totalSentiment > 0
      ? (positiveCount - negativeCount) / totalSentiment
      : 0;

    let tone = 'neutral';
    if (sentimentScore > 0.3) tone = 'positive';
    else if (sentimentScore > 0.1) tone = 'cautious_positive';
    else if (sentimentScore < -0.3) tone = 'negative';
    else if (sentimentScore < -0.1) tone = 'cautious';

    // Guidance phrases
    const guidancePhrases = {
      raised: (text.match(/\b(rais(e|ed|ing)|increas(e|ed|ing)|upgrad(e|ed|ing)) (our |the )?(guidance|outlook|forecast|expect)/gi) || []).length,
      maintained: (text.match(/\b(maintain(ed)?|reaffirm(ed)?|reiterat(e|ed)) (our |the )?(guidance|outlook|forecast)/gi) || []).length,
      lowered: (text.match(/\b(lower(ed)?|reduc(e|ed)|cut|downgrad(e|ed)) (our |the )?(guidance|outlook|forecast)/gi) || []).length
    };

    // Uncertainty language
    const uncertaintyWords = ['uncertain', 'volatil', 'unpredictable', 'depend', 'contingent', 'may', 'might', 'could'];
    const uncertaintyPhrases = uncertaintyWords.reduce((sum, word) =>
      sum + (text.match(new RegExp(`\\b${word}\\w*\\b`, 'gi')) || []).length, 0);

    // Forward-looking statements
    const forwardLookingCount = (text.match(/\b(expect|anticipat|project|forecast|outlook|guidance|plan to|intend|target|goal)\b/gi) || []).length;

    // Risk mentions
    const riskMentions = (text.match(/\b(risk|headwind|challeng|threat|concern|exposure|vulnerab)\w*\b/gi) || []).length;

    return {
      sentimentScore: Math.round(sentimentScore * 100) / 100,
      tone,
      guidancePhrases,
      uncertaintyPhrases,
      forwardLookingCount,
      riskMentions
    };
  }

  /**
   * Split transcript into prepared remarks and Q&A
   */
  splitTranscript(content) {
    if (!content) {
      return { preparedRemarks: null, qaSection: null };
    }

    // Common Q&A section markers
    const qaMarkers = [
      /question-and-answer session/i,
      /q&a session/i,
      /operator:\s*thank you.*questions?/i,
      /we will now begin.*question/i,
      /let me.*turn.*over.*for questions/i
    ];

    let splitIndex = -1;
    for (const marker of qaMarkers) {
      const match = content.search(marker);
      if (match > 0 && (splitIndex === -1 || match < splitIndex)) {
        splitIndex = match;
      }
    }

    if (splitIndex > 0) {
      return {
        preparedRemarks: content.substring(0, splitIndex).trim(),
        qaSection: content.substring(splitIndex).trim()
      };
    }

    // If no clear split, assume mostly prepared remarks
    return {
      preparedRemarks: content.trim(),
      qaSection: null
    };
  }

  /**
   * Extract mentioned executives and analysts from transcript
   */
  extractParticipants(content) {
    const executives = [];
    const analysts = [];

    if (!content) {
      return { executives, analysts };
    }

    // Common executive title patterns
    const execPatterns = [
      /\b([A-Z][a-z]+ [A-Z][a-z]+),?\s*(?:Chief Executive Officer|CEO|President|Chief Financial Officer|CFO|Chief Operating Officer|COO|Chairman)/gi,
      /\b(CEO|CFO|President|Chairman)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/gi
    ];

    // Common analyst patterns
    const analystPatterns = [
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\s*[-–]\s*(?:Goldman|Morgan Stanley|JPMorgan|Citi|Bank of America|Barclays|UBS|Credit Suisse|Deutsche Bank|Wells Fargo|Jefferies|Evercore|Bernstein)/gi,
      /(?:from|at)\s*(?:Goldman|Morgan Stanley|JPMorgan|Citi|Bank of America|Barclays|UBS|Credit Suisse|Deutsche Bank|Wells Fargo|Jefferies|Evercore|Bernstein)[,:]?\s*([A-Z][a-z]+ [A-Z][a-z]+)/gi
    ];

    for (const pattern of execPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1] || match[2];
        if (name && !executives.includes(name)) {
          executives.push(name);
        }
      }
    }

    for (const pattern of analystPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const name = match[1] || match[2];
        if (name && !analysts.includes(name)) {
          analysts.push(name);
        }
      }
    }

    return { executives: executives.slice(0, 10), analysts: analysts.slice(0, 15) };
  }

  /**
   * Fetch and store transcripts for a symbol
   */
  async fetchAndStoreTranscripts(symbol, quarters = 4) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE symbol = $1',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      console.warn(`  Company ${symbol} not found in database`);
      return { fetched: 0, stored: 0 };
    }

    console.log(`  Fetching transcripts for ${symbol}...`);

    // Get available transcripts
    const transcriptList = await this.fetchTranscriptList(symbol);

    if (transcriptList.length === 0) {
      console.log(`  No transcripts available for ${symbol}`);
      return { fetched: 0, stored: 0 };
    }

    // Sort by date descending and take most recent
    const sorted = transcriptList
      .filter(t => t.year && t.quarter)
      .sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.quarter - a.quarter;
      })
      .slice(0, quarters);

    let stored = 0;

    for (const item of sorted) {
      // Check if we already have this transcript
      const existingResult = await database.query(`
        SELECT id, call_date, fiscal_year, fiscal_quarter
        FROM earnings_transcripts
        WHERE company_id = $1 AND fiscal_year = $2 AND fiscal_quarter = $3
      `, [company.id, item.year, item.quarter]);
      const existing = existingResult.rows[0];

      if (existing && existing.full_transcript) {
        console.log(`    Q${item.quarter} ${item.year}: Already stored`);
        continue;
      }

      // Fetch full transcript
      const transcript = await this.fetchFullTranscript(symbol, item.year, item.quarter);

      if (!transcript || !transcript.content) {
        console.log(`    Q${item.quarter} ${item.year}: No content available`);
        continue;
      }

      // Process transcript
      const { preparedRemarks, qaSection } = this.splitTranscript(transcript.content);
      const analysis = this.analyzeTranscript(transcript.content);
      const { executives, analysts } = this.extractParticipants(transcript.content);

      try {
        await database.query(`
          INSERT INTO earnings_transcripts (
            company_id, symbol, fiscal_year, fiscal_quarter, call_date, call_type,
            title, full_transcript, prepared_remarks, qa_section,
            executives, analysts, sentiment_score, tone,
            guidance_phrases, uncertainty_phrases, forward_looking_count, risk_mentions,
            source, source_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT(company_id, fiscal_year, fiscal_quarter, call_type) DO UPDATE SET
            full_transcript = excluded.full_transcript,
            prepared_remarks = excluded.prepared_remarks,
            qa_section = excluded.qa_section,
            executives = excluded.executives,
            analysts = excluded.analysts,
            sentiment_score = excluded.sentiment_score,
            tone = excluded.tone,
            guidance_phrases = excluded.guidance_phrases,
            fetched_at = CURRENT_TIMESTAMP
        `, [
          company.id,
          symbol.toUpperCase(),
          item.year,
          item.quarter,
          transcript.date || item.date || new Date().toISOString().split('T')[0],
          'earnings',
          `Q${item.quarter} ${item.year} Earnings Call`,
          transcript.content,
          preparedRemarks,
          qaSection,
          JSON.stringify(executives),
          JSON.stringify(analysts),
          analysis.sentimentScore,
          analysis.tone,
          JSON.stringify(analysis.guidancePhrases),
          analysis.uncertaintyPhrases,
          analysis.forwardLookingCount,
          analysis.riskMentions,
          'fmp',
          null
        ]);
        stored++;
        console.log(`    Q${item.quarter} ${item.year}: Stored (${analysis.tone} tone)`);
      } catch (error) {
        console.error(`    Error storing transcript: ${error.message}`);
      }
    }

    return { fetched: sorted.length, stored };
  }

  /**
   * Get transcripts for a company from database
   */
  async getTranscripts(symbol, limit = 4) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE symbol = $1',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) return [];

    const transcriptsResult = await database.query(`
      SELECT * FROM earnings_transcripts
      WHERE company_id = $1
      ORDER BY fiscal_year DESC, fiscal_quarter DESC
      LIMIT $2
    `, [company.id, limit]);

    return transcriptsResult.rows;
  }

  /**
   * Get transcript summary for PRISM report
   */
  async getTranscriptSummary(symbol) {
    const transcripts = await this.getTranscripts(symbol, 4);

    if (transcripts.length === 0) {
      return null;
    }

    const latest = transcripts[0];

    // Parse stored JSON fields
    let guidancePhrases = {};
    let executives = [];
    try {
      guidancePhrases = JSON.parse(latest.guidance_phrases || '{}');
      executives = JSON.parse(latest.executives || '[]');
    } catch (e) {}

    // Calculate tone trend
    let toneTrend = 'stable';
    if (transcripts.length >= 2) {
      const sentiments = transcripts
        .filter(t => t.sentiment_score != null)
        .map(t => t.sentiment_score);

      if (sentiments.length >= 2) {
        const recentAvg = sentiments.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        const olderAvg = sentiments.slice(-2).reduce((a, b) => a + b, 0) / 2;
        if (recentAvg > olderAvg + 0.1) toneTrend = 'improving';
        else if (recentAvg < olderAvg - 0.1) toneTrend = 'deteriorating';
      }
    }

    // Determine guidance direction
    let guidanceDirection = 'maintained';
    if (guidancePhrases.raised > guidancePhrases.lowered) {
      guidanceDirection = 'raised';
    } else if (guidancePhrases.lowered > guidancePhrases.raised) {
      guidanceDirection = 'lowered';
    }

    return {
      latestCall: {
        quarter: `Q${latest.fiscal_quarter} ${latest.fiscal_year}`,
        date: latest.call_date,
        tone: latest.tone,
        sentimentScore: latest.sentiment_score
      },
      guidanceDirection,
      executives,
      toneTrend,
      forwardLookingStatements: latest.forward_looking_count,
      riskMentions: latest.risk_mentions,
      uncertaintyLevel: latest.uncertainty_phrases,
      hasPreparedRemarks: !!latest.prepared_remarks,
      hasQASection: !!latest.qa_section,
      transcriptsAvailable: transcripts.length
    };
  }

  /**
   * Extract key quotes from transcript for PRISM report
   */
  async extractKeyQuotes(symbol, maxQuotes = 3) {
    const transcripts = await this.getTranscripts(symbol, 1);

    if (transcripts.length === 0 || !transcripts[0].prepared_remarks) {
      return [];
    }

    const content = transcripts[0].prepared_remarks;
    const quotes = [];

    // Look for sentences with key business indicators
    const indicators = [
      /(?:revenue|sales|growth|margin|profit|cash flow).*(?:grew|increased|rose|expanded|improved|reached|exceeded)/i,
      /(?:we expect|we anticipate|our outlook|our guidance|we are raising|we are maintaining)/i,
      /(?:market share|competitive position|customer|demand|pipeline|backlog)/i,
      /(?:innovation|new product|launch|AI|technology|transformation)/i
    ];

    const sentences = content.split(/(?<=[.!?])\s+/);

    for (const pattern of indicators) {
      for (const sentence of sentences) {
        if (pattern.test(sentence) && sentence.length > 50 && sentence.length < 500) {
          const cleaned = sentence.trim();
          if (!quotes.includes(cleaned)) {
            quotes.push(cleaned);
          }
          if (quotes.length >= maxQuotes) break;
        }
      }
      if (quotes.length >= maxQuotes) break;
    }

    return quotes;
  }
}

module.exports = EarningsTranscriptService;

// Test if run directly
if (require.main === module) {
  const service = new EarningsTranscriptService();

  (async () => {
    console.log('\n📞 Testing Earnings Transcript Service...\n');

    // Test fetching transcripts for AAPL
    const result = await service.fetchAndStoreTranscripts('AAPL', 2);
    console.log(`\nResult: Fetched ${result.fetched}, Stored ${result.stored}`);

    // Test getting summary
    const summary = await service.getTranscriptSummary('AAPL');
    if (summary) {
      console.log('\nTranscript Summary:');
      console.log(JSON.stringify(summary, null, 2));
    }

    // Test key quotes
    const quotes = await service.extractKeyQuotes('AAPL');
    if (quotes.length > 0) {
      console.log('\nKey Quotes:');
      quotes.forEach((q, i) => console.log(`${i + 1}. "${q.substring(0, 150)}..."`));
    }
  })();
}
