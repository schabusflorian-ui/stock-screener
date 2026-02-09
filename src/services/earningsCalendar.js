/**
 * Earnings Calendar Service
 *
 * Fetches earnings data from Yahoo Finance including:
 * - Upcoming earnings dates
 * - EPS estimates and actuals
 * - Revenue estimates
 * - Earnings history with beat/miss analysis
 */

const YahooFinance = require('yahoo-finance2').default;
const { getDatabaseAsync } = require('../lib/db');

class EarningsCalendarService {
  constructor() {
    this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour cache
    this.lastRequest = 0;
    this.minDelay = 300; // 300ms between requests
  }

  /**
   * Rate-limited request wrapper
   */
  async rateLimitedRequest(fn) {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minDelay) {
      await new Promise(r => setTimeout(r, this.minDelay - elapsed));
    }
    this.lastRequest = Date.now();
    return fn();
  }

  /**
   * Fetch earnings data for a single symbol
   */
  async fetchEarningsData(symbol) {
    // Check cache first
    const cached = this.cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    try {
      const result = await this.rateLimitedRequest(() =>
        this.yahooFinance.quoteSummary(symbol, {
          modules: ['calendarEvents', 'earningsHistory', 'earnings']
        })
      );

      const data = this.parseEarningsData(symbol, result);

      // Cache the result
      this.cache.set(symbol, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      console.error(`Error fetching earnings for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Parse Yahoo Finance response into clean earnings data
   */
  parseEarningsData(symbol, result) {
    const calendarEvents = result.calendarEvents || {};
    const earningsHistory = result.earningsHistory?.history || [];
    const earningsChart = result.earnings?.earningsChart || {};

    // Next earnings
    const nextEarnings = calendarEvents.earnings ? {
      date: calendarEvents.earnings.earningsDate?.[0] || null,
      isEstimate: calendarEvents.earnings.isEarningsDateEstimate || false,
      epsEstimate: calendarEvents.earnings.earningsAverage,
      epsLow: calendarEvents.earnings.earningsLow,
      epsHigh: calendarEvents.earnings.earningsHigh,
      revenueEstimate: calendarEvents.earnings.revenueAverage,
      revenueLow: calendarEvents.earnings.revenueLow,
      revenueHigh: calendarEvents.earnings.revenueHigh,
    } : null;

    // Dividend info
    const dividend = {
      exDate: calendarEvents.exDividendDate || null,
      payDate: calendarEvents.dividendDate || null,
    };

    // Past earnings history
    const history = earningsHistory.map(q => {
      const surprisePercent = q.surprisePercent
        ? (q.surprisePercent * 100)
        : null;

      return {
        quarter: q.quarter,
        period: q.period,
        epsActual: q.epsActual,
        epsEstimate: q.epsEstimate,
        epsDifference: q.epsDifference,
        surprisePercent,
        beat: q.epsActual > q.epsEstimate,
        currency: q.currency || 'USD',
      };
    });

    // Calculate beat rate
    const beatsCount = history.filter(h => h.beat).length;
    const beatRate = history.length > 0
      ? (beatsCount / history.length) * 100
      : null;

    // Average surprise
    const avgSurprise = history.length > 0
      ? history.reduce((sum, h) => sum + (h.surprisePercent || 0), 0) / history.length
      : null;

    // Quarterly earnings from chart (includes older data)
    const quarterlyEarnings = (earningsChart.quarterly || []).map(q => ({
      quarter: q.date,
      actual: q.actual,
      estimate: q.estimate,
      beat: q.actual > q.estimate,
    }));

    return {
      symbol,
      fetchedAt: new Date().toISOString(),
      nextEarnings,
      dividend,
      history,
      quarterlyEarnings,
      stats: {
        beatRate,
        avgSurprise,
        consecutiveBeats: this.countConsecutiveBeats(history),
        totalQuarters: history.length,
      }
    };
  }

  /**
   * Count consecutive beats from most recent
   */
  countConsecutiveBeats(history) {
    let count = 0;
    for (const q of history) {
      if (q.beat) count++;
      else break;
    }
    return count;
  }

  /**
   * Get upcoming earnings for watchlist or tracked companies
   */
  async getUpcomingEarnings(companyIds, daysAhead = 30) {
    const database = await getDatabaseAsync();
    const upcoming = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    // Get symbols for company IDs
    const placeholders = companyIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await database.query(`
      SELECT id, symbol, name FROM companies WHERE id IN (${placeholders})
    `, companyIds);
    const companies = result.rows;

    for (const company of companies) {
      try {
        const data = await this.fetchEarningsData(company.symbol);
        if (data?.nextEarnings?.date) {
          const earningsDate = new Date(data.nextEarnings.date);
          if (earningsDate <= cutoffDate) {
            upcoming.push({
              companyId: company.id,
              symbol: company.symbol,
              name: company.name,
              ...data.nextEarnings,
              beatRate: data.stats.beatRate,
              consecutiveBeats: data.stats.consecutiveBeats,
            });
          }
        }
      } catch (e) {
        // Skip companies with errors
      }
    }

    // Sort by date
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));

    return upcoming;
  }

  /**
   * Get earnings for companies in a date range
   */
  async getEarningsInRange(startDate, endDate, options = {}) {
    const database = await getDatabaseAsync();
    const { sector, limit = 100 } = options;

    // Get companies with analyst data (likely to have earnings data)
    let query = `
      SELECT DISTINCT c.id, c.symbol, c.name, c.sector
      FROM companies c
      INNER JOIN analyst_estimates ae ON ae.company_id = c.id
      WHERE c.symbol IS NOT NULL
    `;

    let paramCounter = 1;
    const params = [];

    if (sector) {
      query += ` AND c.sector = $${paramCounter++}`;
      params.push(sector);
    }

    query += ` ORDER BY ae.number_of_analysts DESC LIMIT $${paramCounter}`;
    params.push(limit);

    const result = await database.query(query, params);
    const companies = result.rows;

    const results = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (const company of companies) {
      try {
        const data = await this.fetchEarningsData(company.symbol);
        if (data?.nextEarnings?.date) {
          const earningsDate = new Date(data.nextEarnings.date);
          if (earningsDate >= start && earningsDate <= end) {
            results.push({
              companyId: company.id,
              symbol: company.symbol,
              name: company.name,
              sector: company.sector,
              ...data.nextEarnings,
              history: data.history.slice(0, 4), // Last 4 quarters
              beatRate: data.stats.beatRate,
              avgSurprise: data.stats.avgSurprise,
            });
          }
        }
      } catch (e) {
        // Skip errors
      }
    }

    results.sort((a, b) => new Date(a.date) - new Date(b.date));
    return results;
  }

  /**
   * Store earnings data in database for faster access
   */
  async storeEarningsData(companyId, data) {
    if (!data) return;

    const database = await getDatabaseAsync();

    // Helper to convert dates to ISO strings
    const toISOString = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString();
      if (typeof val === 'string') return val;
      return null;
    };

    try {
      await database.query(`
        INSERT INTO earnings_calendar (
          company_id, fetched_at,
          next_earnings_date, is_estimate,
          eps_estimate, eps_low, eps_high,
          revenue_estimate, revenue_low, revenue_high,
          ex_dividend_date, dividend_pay_date,
          beat_rate, avg_surprise, consecutive_beats,
          history_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (company_id) DO UPDATE SET
          fetched_at = EXCLUDED.fetched_at,
          next_earnings_date = EXCLUDED.next_earnings_date,
          is_estimate = EXCLUDED.is_estimate,
          eps_estimate = EXCLUDED.eps_estimate,
          eps_low = EXCLUDED.eps_low,
          eps_high = EXCLUDED.eps_high,
          revenue_estimate = EXCLUDED.revenue_estimate,
          revenue_low = EXCLUDED.revenue_low,
          revenue_high = EXCLUDED.revenue_high,
          ex_dividend_date = EXCLUDED.ex_dividend_date,
          dividend_pay_date = EXCLUDED.dividend_pay_date,
          beat_rate = EXCLUDED.beat_rate,
          avg_surprise = EXCLUDED.avg_surprise,
          consecutive_beats = EXCLUDED.consecutive_beats,
          history_json = EXCLUDED.history_json
      `, [
        companyId,
        data.fetchedAt,
        toISOString(data.nextEarnings?.date),
        data.nextEarnings?.isEstimate ? true : false,
        data.nextEarnings?.epsEstimate ?? null,
        data.nextEarnings?.epsLow ?? null,
        data.nextEarnings?.epsHigh ?? null,
        data.nextEarnings?.revenueEstimate ?? null,
        data.nextEarnings?.revenueLow ?? null,
        data.nextEarnings?.revenueHigh ?? null,
        toISOString(data.dividend?.exDate),
        toISOString(data.dividend?.payDate),
        data.stats?.beatRate ?? null,
        data.stats?.avgSurprise ?? null,
        data.stats?.consecutiveBeats ?? null,
        JSON.stringify(data.history)
      ]);
    } catch (error) {
      console.error(`Error storing earnings for company ${companyId}:`, error.message);
    }
  }

  /**
   * Get stored earnings data
   */
  async getStoredEarningsData(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM earnings_calendar
      WHERE company_id = $1
      ORDER BY fetched_at DESC
      LIMIT 1
    `, [companyId]);

    const row = result.rows[0];

    if (row) {
      return {
        ...row,
        history: row.history_json ? JSON.parse(row.history_json) : [],
      };
    }
    return null;
  }

}

module.exports = EarningsCalendarService;
