/**
 * Earnings Data Service
 *
 * Aggregates earnings data from multiple free sources:
 * 1. Yahoo Finance (existing) - earnings calendar, estimates
 * 2. NASDAQ API (new) - reliable calendar data, no auth needed
 * 3. FMP API (existing) - transcripts when available
 *
 * Provides unified interface for:
 * - Upcoming earnings dates
 * - Historical earnings surprises
 * - Earnings transcripts (when FMP key available)
 */

const https = require('https');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class EarningsDataService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.fmpApiKey = process.env.FMP_API_KEY;

    // Cache for NASDAQ data (in-memory, 1 hour)
    this.cache = new Map();
    this.CACHE_TTL = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Fetch JSON from URL
   */
  fetchJSON(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; InvestmentProject/1.0)',
          'Accept': 'application/json',
          ...headers
        }
      };

      const protocol = urlObj.protocol === 'https:' ? https : require('http');

      const req = protocol.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            // Handle NASDAQ JSONP response
            if (data.startsWith('callback(')) {
              data = data.replace(/^callback\(/, '').replace(/\);?$/, '');
            }
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  /**
   * Fetch earnings calendar from NASDAQ API (free, no auth)
   */
  async fetchNasdaqCalendar(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = `nasdaq-calendar-${targetDate}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const url = `https://api.nasdaq.com/api/calendar/earnings?date=${targetDate}`;
      const data = await this.fetchJSON(url, {
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.nasdaq.com'
      });

      if (data?.data?.rows) {
        const earnings = data.data.rows.map(row => ({
          symbol: row.symbol,
          name: row.name,
          date: targetDate,
          time: row.time, // AMC (after market close), BMO (before market open)
          epsForecast: this.parseNumber(row.epsForecast),
          epsActual: this.parseNumber(row.eps),
          surprise: this.parseNumber(row.surprise),
          marketCap: row.marketCap
        }));

        // Cache result
        this.cache.set(cacheKey, { data: earnings, timestamp: Date.now() });
        return earnings;
      }

      return [];
    } catch (error) {
      console.error(`NASDAQ calendar fetch error: ${error.message}`);
      return [];
    }
  }

  /**
   * Fetch earnings from FMP API
   */
  async fetchFMPEarnings(symbol) {
    if (!this.fmpApiKey) {
      return { calendar: [], transcripts: [] };
    }

    try {
      // Earnings calendar
      const calendarUrl = `https://financialmodelingprep.com/api/v3/historical/earning_calendar/${symbol}?apikey=${this.fmpApiKey}`;
      const calendar = await this.fetchJSON(calendarUrl);

      // Earnings transcripts (uses API quota)
      const transcriptUrl = `https://financialmodelingprep.com/api/v3/earning_call_transcript/${symbol}?apikey=${this.fmpApiKey}`;
      const transcripts = await this.fetchJSON(transcriptUrl);

      return {
        calendar: Array.isArray(calendar) ? calendar : [],
        transcripts: Array.isArray(transcripts) ? transcripts : []
      };
    } catch (error) {
      console.error(`FMP earnings fetch error for ${symbol}: ${error.message}`);
      return { calendar: [], transcripts: [] };
    }
  }

  /**
   * Fetch upcoming earnings for next N days
   */
  async fetchUpcomingEarnings(days = 7) {
    const earnings = [];
    const startDate = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      // Skip weekends
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dayEarnings = await this.fetchNasdaqCalendar(dateStr);
      earnings.push(...dayEarnings.map(e => ({ ...e, date: dateStr })));

      // Small delay to be nice to NASDAQ
      await new Promise(r => setTimeout(r, 200));
    }

    return earnings;
  }

  /**
   * Store earnings data in database
   */
  async storeEarnings(earnings) {
    const database = await getDatabaseAsync();
    let stored = 0;

    for (const e of earnings) {
      // Get company ID
      const companyResult = await database.query(
        'SELECT id FROM companies WHERE symbol = $1',
        [e.symbol]
      );
      const company = companyResult.rows[0];
      if (!company) continue;

      // Parse fiscal quarter from date
      const date = new Date(e.date);
      const month = date.getMonth() + 1;
      const fiscalQuarter = Math.ceil(month / 3);
      const fiscalYear = date.getFullYear();

      try {
        await database.query(`
          INSERT INTO earnings_calendar (
            company_id, symbol, earnings_date, fiscal_quarter, fiscal_year,
            eps_estimate, eps_actual, revenue_estimate, revenue_actual,
            surprise_pct, source, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
          ON CONFLICT(company_id, earnings_date) DO UPDATE SET
            eps_estimate = COALESCE(excluded.eps_estimate, earnings_calendar.eps_estimate),
            eps_actual = COALESCE(excluded.eps_actual, earnings_calendar.eps_actual),
            revenue_estimate = COALESCE(excluded.revenue_estimate, earnings_calendar.revenue_estimate),
            revenue_actual = COALESCE(excluded.revenue_actual, earnings_calendar.revenue_actual),
            surprise_pct = COALESCE(excluded.surprise_pct, earnings_calendar.surprise_pct),
            updated_at = CURRENT_TIMESTAMP
        `, [
          company.id,
          e.symbol,
          e.date,
          fiscalQuarter,
          fiscalYear,
          e.epsForecast || null,
          e.epsActual || null,
          e.revenueForecast || null,
          e.revenueActual || null,
          e.surprise || null,
          e.source || 'nasdaq'
        ]);
        stored++;
      } catch (err) {
        // Ignore duplicates
      }
    }

    return stored;
  }

  /**
   * Get upcoming earnings from database
   */
  async getUpcoming(lookforwardDays = '+14 days', limit = 100) {
    const database = await getDatabaseAsync();

    // Build dialect-aware date filter
    const futureDate = isUsingPostgres()
      ? `ec.earnings_date >= CURRENT_DATE AND ec.earnings_date <= CURRENT_DATE + INTERVAL '${lookforwardDays}'`
      : `ec.earnings_date >= date('now') AND ec.earnings_date <= date('now', '${lookforwardDays}')`;

    const result = await database.query(`
      SELECT
        ec.*,
        c.name as company_name,
        c.sector,
        pm.market_cap,
        pm.last_price
      FROM earnings_calendar ec
      JOIN companies c ON ec.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE ${futureDate}
      ORDER BY ec.earnings_date ASC
      LIMIT $1
    `, [limit]);

    return result.rows;
  }

  /**
   * Get earnings history for a symbol
   */
  async getHistory(symbol, limit = 20) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE symbol = $1',
      [symbol]
    );
    const company = companyResult.rows[0];
    if (!company) return [];

    const result = await database.query(`
      SELECT * FROM earnings_calendar
      WHERE company_id = $1
      ORDER BY earnings_date DESC
      LIMIT $2
    `, [company.id, limit]);

    return result.rows;
  }

  /**
   * Calculate earnings beat rate
   */
  async calculateBeatRate(symbol) {
    const history = await this.getHistory(symbol, 12);

    if (history.length === 0) {
      return { beatRate: null, history: [] };
    }

    const beats = history.filter(h =>
      h.eps_actual !== null &&
      h.eps_estimate !== null &&
      h.eps_actual > h.eps_estimate
    );

    const measured = history.filter(h =>
      h.eps_actual !== null && h.eps_estimate !== null
    );

    return {
      beatRate: measured.length > 0 ? beats.length / measured.length : null,
      beats: beats.length,
      total: measured.length,
      consecutiveBeats: this.countConsecutiveBeats(history),
      avgSurprise: this.calculateAvgSurprise(history)
    };
  }

  countConsecutiveBeats(history) {
    let count = 0;
    for (const h of history) {
      if (h.eps_actual !== null && h.eps_estimate !== null && h.eps_actual > h.eps_estimate) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  calculateAvgSurprise(history) {
    const surprises = history
      .filter(h => h.surprise_pct !== null)
      .map(h => h.surprise_pct);

    if (surprises.length === 0) return null;
    return surprises.reduce((a, b) => a + b, 0) / surprises.length;
  }

  parseNumber(val) {
    if (val === null || val === undefined || val === '' || val === 'N/A') return null;
    const num = parseFloat(String(val).replace(/[$,%]/g, ''));
    return isNaN(num) ? null : num;
  }

  /**
   * Refresh earnings calendar
   */
  async refreshCalendar(days = 14) {
    console.log(`\n📅 Refreshing earnings calendar for next ${days} days...\n`);

    const earnings = await this.fetchUpcomingEarnings(days);
    const stored = await this.storeEarnings(earnings);

    console.log(`  Fetched ${earnings.length} earnings dates, stored ${stored}\n`);

    return { fetched: earnings.length, stored };
  }

  /**
   * Get earnings with transcript availability
   */
  async getEarningsWithTranscripts(symbol) {
    const history = await this.getHistory(symbol, 8);
    const fmpData = await this.fetchFMPEarnings(symbol);

    // Match transcripts to earnings dates
    const enriched = history.map(h => {
      const transcript = fmpData.transcripts.find(t =>
        t.year === h.fiscal_year && t.quarter === h.fiscal_quarter
      );

      return {
        ...h,
        hasTranscript: !!transcript,
        transcriptPreview: transcript?.content?.substring(0, 500)
      };
    });

    return enriched;
  }
}

module.exports = { EarningsDataService };
