// src/api/routes/earnings.js
// API routes for earnings calendar data

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const EarningsCalendarService = require('../../services/earningsCalendar');
const { EUEarningsCalendarService } = require('../../services/euEarningsCalendar');

// Lazy initialization - services created on first request
let servicesCache = null;
let database, earningsService, euEarningsService;

async function initializeServices() {
  if (!servicesCache) {
    database = await getDatabaseAsync();
    try {
      earningsService = new EarningsCalendarService(database);
      await earningsService.createTable();
    } catch (error) {
      console.error('Failed to initialize earnings service:', error.message);
    }
    try {
      euEarningsService = new EUEarningsCalendarService(database);
    } catch (error) {
      console.error('Failed to initialize EU earnings service:', error.message);
    }
    servicesCache = { database, earningsService, euEarningsService };
  }
  return servicesCache;
}

// Middleware to ensure services are initialized before any route
router.use(async (req, res, next) => {
  try {
    await initializeServices();
    next();
  } catch (error) {
    console.error('Failed to initialize earnings services:', error);
    res.status(500).json({ error: 'Service initialization failed' });
  }
});

/**
 * GET /api/earnings/:symbol
 * Get earnings data for a specific symbol
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { refresh } = req.query;

    // Get company ID
    const companyResult = await database.query(`
      SELECT id, symbol, name, sector FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows?.[0];

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Check for cached data first (unless refresh requested)
    if (refresh !== 'true') {
      const cached = earningsService.getStoredEarningsData(company.id);
      if (cached) {
        // Check if cached data is less than 24 hours old
        const fetchedAt = new Date(cached.fetched_at);
        const now = new Date();
        const hoursSinceFetch = (now - fetchedAt) / (1000 * 60 * 60);

        if (hoursSinceFetch < 24) {
          return res.json({
            success: true,
            data: {
              symbol: company.symbol,
              name: company.name,
              sector: company.sector,
              fetchedAt: cached.fetched_at,
              fromCache: true,
              nextEarnings: cached.next_earnings_date ? {
                date: cached.next_earnings_date,
                isEstimate: cached.is_estimate === 1,
                epsEstimate: cached.eps_estimate,
                epsLow: cached.eps_low,
                epsHigh: cached.eps_high,
                revenueEstimate: cached.revenue_estimate,
                revenueLow: cached.revenue_low,
                revenueHigh: cached.revenue_high,
              } : null,
              dividend: {
                exDate: cached.ex_dividend_date,
                payDate: cached.dividend_pay_date,
              },
              stats: {
                beatRate: cached.beat_rate,
                avgSurprise: cached.avg_surprise,
                consecutiveBeats: cached.consecutive_beats,
              },
              history: cached.history || [],
            }
          });
        }
      }
    }

    // Fetch fresh data from Yahoo Finance
    const data = await earningsService.fetchEarningsData(symbol.toUpperCase());

    if (!data) {
      return res.json({
        success: false,
        error: 'Could not fetch earnings data'
      });
    }

    // Store in database
    earningsService.storeEarningsData(company.id, data);

    res.json({
      success: true,
      data: {
        symbol: company.symbol,
        name: company.name,
        sector: company.sector,
        fromCache: false,
        ...data
      }
    });

  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/upcoming/watchlist
 * Get upcoming earnings for user's watchlist
 */
router.get('/upcoming/watchlist', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    // Get watchlist company IDs
    const watchlistResult = await database.query(`
      SELECT company_id FROM watchlist ORDER BY added_at DESC
    `);
    const watchlist = watchlistResult.rows || [];

    if (!watchlist.length) {
      return res.json({
        success: true,
        data: [],
        message: 'No companies in watchlist'
      });
    }

    const companyIds = watchlist.map(w => w.company_id);
    const upcoming = await earningsService.getUpcomingEarnings(companyIds, parseInt(days));

    res.json({
      success: true,
      count: upcoming.length,
      data: upcoming
    });

  } catch (error) {
    console.error('Error fetching watchlist earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/calendar/range
 * Get earnings for companies in a date range
 */
router.get('/calendar/range', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      sector,
      limit = 100
    } = req.query;

    // Default to next 2 weeks if no dates provided
    const start = startDate || new Date().toISOString().split('T')[0];
    const end = endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const earnings = await earningsService.getEarningsInRange(start, end, {
      sector,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      dateRange: { start, end },
      count: earnings.length,
      data: earnings
    });

  } catch (error) {
    console.error('Error fetching earnings calendar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/calendar/week
 * Get this week's earnings
 */
router.get('/calendar/week', async (req, res) => {
  try {
    if (!earningsService) {
      return res.json({
        success: true,
        weekStart: new Date().toISOString().split('T')[0],
        weekEnd: new Date().toISOString().split('T')[0],
        totalCount: 0,
        byDay: {},
        data: []
      });
    }

    const { sector, limit = 50 } = req.query;

    // Calculate this week's range (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const earnings = await earningsService.getEarningsInRange(
      monday.toISOString().split('T')[0],
      sunday.toISOString().split('T')[0],
      { sector, limit: parseInt(limit) }
    ) || [];

    // Group by day
    const byDay = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    (earnings || []).forEach(e => {
      const date = new Date(e.date);
      const dayName = days[date.getDay()];
      if (!byDay[dayName]) byDay[dayName] = [];
      byDay[dayName].push(e);
    });

    res.json({
      success: true,
      weekStart: monday.toISOString().split('T')[0],
      weekEnd: sunday.toISOString().split('T')[0],
      totalCount: earnings.length,
      byDay,
      data: earnings
    });

  } catch (error) {
    console.error('Error fetching weekly earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/history/:symbol
 * Get earnings history (past quarters) for a symbol
 */
router.get('/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { quarters = 8 } = req.query;

    const data = await earningsService.fetchEarningsData(symbol.toUpperCase());

    if (!data) {
      return res.json({
        success: false,
        error: 'Could not fetch earnings history'
      });
    }

    // Get the detailed history
    const history = data.history.slice(0, parseInt(quarters));
    const quarterlyEarnings = data.quarterlyEarnings.slice(0, parseInt(quarters));

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      stats: data.stats,
      history,
      quarterlyEarnings
    });

  } catch (error) {
    console.error('Error fetching earnings history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/earnings/batch
 * Fetch earnings for multiple symbols
 */
router.post('/batch', async (req, res) => {
  try {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'symbols array required'
      });
    }

    const results = [];
    const errors = [];

    for (const symbol of symbols.slice(0, 20)) { // Limit to 20
      try {
        const data = await earningsService.fetchEarningsData(symbol.toUpperCase());
        if (data) {
          // Get company info
          const companyRes = await database.query(`
            SELECT id, name, sector FROM companies WHERE symbol = $1
          `, [symbol.toUpperCase()]);
          const company = companyRes.rows?.[0];

          if (company) {
            earningsService.storeEarningsData(company.id, data);
          }

          results.push({
            symbol: symbol.toUpperCase(),
            name: company?.name,
            nextEarnings: data.nextEarnings,
            stats: data.stats
          });
        }
      } catch (e) {
        errors.push({ symbol, error: e.message });
      }
    }

    res.json({
      success: true,
      fetched: results.length,
      errors: errors.length,
      data: results,
      errorDetails: errors
    });

  } catch (error) {
    console.error('Error in batch earnings fetch:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/stats
 * Get earnings statistics (beat rates, etc.) across companies
 */
router.get('/stats', async (req, res) => {
  try {
    // Get stored earnings data stats
    const statsResult = await database.query(`
      SELECT
        COUNT(*) as companies_tracked,
        AVG(beat_rate) as avg_beat_rate,
        AVG(avg_surprise) as avg_surprise,
        COUNT(CASE WHEN next_earnings_date >= date('now') AND next_earnings_date <= date('now', '+7 days') THEN 1 END) as earnings_this_week,
        COUNT(CASE WHEN next_earnings_date >= date('now') AND next_earnings_date <= date('now', '+30 days') THEN 1 END) as earnings_this_month
      FROM earnings_calendar
      WHERE fetched_at >= datetime('now', '-7 days')
    `);
    const stats = statsResult.rows?.[0];

    // Get sector breakdown
    const bySectorResult = await database.query(`
      SELECT
        c.sector,
        COUNT(*) as count,
        AVG(ec.beat_rate) as avg_beat_rate,
        AVG(ec.avg_surprise) as avg_surprise
      FROM earnings_calendar ec
      JOIN companies c ON c.id = ec.company_id
      WHERE ec.fetched_at >= datetime('now', '-7 days')
        AND c.sector IS NOT NULL
      GROUP BY c.sector
      ORDER BY count DESC
    `);
    const bySector = bySectorResult.rows || [];

    // Get upcoming earnings summary
    const upcomingResult = await database.query(`
      SELECT
        DATE(next_earnings_date) as date,
        COUNT(*) as count
      FROM earnings_calendar
      WHERE next_earnings_date >= date('now')
        AND next_earnings_date <= date('now', '+14 days')
      GROUP BY DATE(next_earnings_date)
      ORDER BY date
    `);
    const upcoming = upcomingResult.rows || [];

    res.json({
      success: true,
      data: {
        overall: stats,
        bySector,
        upcomingByDate: upcoming
      }
    });

  } catch (error) {
    console.error('Error fetching earnings stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/calendar/stored
 * Get earnings calendar from stored data (fast, no live fetch)
 * This is the preferred endpoint for calendar views
 */
router.get('/calendar/stored', async (req, res) => {
  try {
    const { days = 30, sector, watchlistOnly } = req.query;

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + parseInt(days));

    let query = `
      SELECT
        c.id as companyId,
        c.symbol,
        c.name,
        c.sector,
        ec.next_earnings_date as date,
        ec.is_estimate as isEstimate,
        ec.eps_estimate as epsEstimate,
        ec.eps_low as epsLow,
        ec.eps_high as epsHigh,
        ec.revenue_estimate as revenueEstimate,
        ec.beat_rate as beatRate,
        ec.avg_surprise as avgSurprise,
        ec.consecutive_beats as consecutiveBeats,
        ec.history_json,
        ec.fetched_at,
        CASE WHEN w.company_id IS NOT NULL THEN 1 ELSE 0 END as inWatchlist
      FROM earnings_calendar ec
      JOIN companies c ON c.id = ec.company_id
      LEFT JOIN watchlist w ON w.company_id = c.id
      WHERE ec.next_earnings_date >= date('now')
        AND ec.next_earnings_date <= date('now', '+' || ? || ' days')
    `;

    const params = [parseInt(days)];

    if (sector) {
      query += ' AND c.sector = ?';
      params.push(sector);
    }

    if (watchlistOnly === 'true') {
      query += ' AND w.company_id IS NOT NULL';
    }

    query += ' ORDER BY ec.next_earnings_date ASC';

    let paramIndex = 0;
    const pgQuery = query.replace(/\?/g, () => `$${++paramIndex}`);
    const earningsResult = await database.query(pgQuery, params);
    const earnings = earningsResult.rows || [];

    // Parse history and format response
    const data = earnings.map(e => ({
      companyId: e.companyId,
      symbol: e.symbol,
      name: e.name,
      sector: e.sector,
      date: e.date,
      isEstimate: e.isEstimate === 1,
      epsEstimate: e.epsEstimate,
      epsLow: e.epsLow,
      epsHigh: e.epsHigh,
      revenueEstimate: e.revenueEstimate,
      beatRate: e.beatRate,
      avgSurprise: e.avgSurprise,
      consecutiveBeats: e.consecutiveBeats,
      inWatchlist: e.inWatchlist === 1,
      history: e.history_json ? JSON.parse(e.history_json).slice(0, 4) : [],
      fetchedAt: e.fetched_at
    }));

    // Group by day of week for calendar view
    const byDay = {};
    const days_arr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    data.forEach(e => {
      const date = new Date(e.date);
      const dayName = days_arr[date.getDay()];
      if (!byDay[dayName]) byDay[dayName] = [];
      byDay[dayName].push(e);
    });

    // Group by date for calendar grid
    const byDate = {};
    data.forEach(e => {
      const dateKey = e.date.split('T')[0];
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(e);
    });

    res.json({
      success: true,
      fromCache: true,
      count: data.length,
      dateRange: {
        start: new Date().toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      byDay,
      byDate,
      data
    });

  } catch (error) {
    console.error('Error fetching stored earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/earnings/refresh
 * Trigger a refresh of earnings data
 */
router.post('/refresh', async (req, res) => {
  try {
    const { mode = 'watchlist', maxCompanies = 50 } = req.body;

    // Import the refresh job
    const { refreshEarnings, refreshWatchlistEarnings, getEarningsSummary } = require('../../jobs/earningsRefresh');

    // Get before stats
    const beforeStats = getEarningsSummary();

    let result;
    if (mode === 'watchlist') {
      result = await refreshWatchlistEarnings({ staleHours: 1 });
    } else {
      result = await refreshEarnings({
        maxCompanies: parseInt(maxCompanies),
        staleHours: 6
      });
    }

    // Get after stats
    const afterStats = getEarningsSummary();

    res.json({
      success: true,
      mode,
      result,
      stats: {
        before: beforeStats,
        after: afterStats
      }
    });

  } catch (error) {
    console.error('Error refreshing earnings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/earnings/coverage
 * Get coverage statistics for earnings data
 */
router.get('/coverage', async (req, res) => {
  try {
    const { getEarningsSummary } = require('../../jobs/earningsRefresh');
    const summary = getEarningsSummary();

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    console.error('Error getting coverage:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// EU/UK EARNINGS ROUTES (XBRL-based)
// ============================================

/**
 * GET /api/earnings/eu/upcoming
 * Get upcoming EU/UK earnings (estimated from XBRL filing patterns)
 */
router.get('/eu/upcoming', (req, res) => {
  try {
    if (!euEarningsService) {
      return res.status(503).json({ success: false, error: 'EU earnings service not initialized' });
    }

    const { days = 60, country } = req.query;
    const upcoming = euEarningsService.getUpcomingEarnings(parseInt(days), country || null);

    res.json({
      success: true,
      count: upcoming.length,
      daysAhead: parseInt(days),
      country: country || 'all',
      note: 'Dates are estimates based on historical filing patterns',
      data: upcoming
    });
  } catch (error) {
    console.error('Error fetching EU upcoming earnings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/earnings/eu/recent
 * Get recent EU/UK earnings announcements (actual XBRL filings)
 */
router.get('/eu/recent', (req, res) => {
  try {
    if (!euEarningsService) {
      return res.status(503).json({ success: false, error: 'EU earnings service not initialized' });
    }

    const { days = 30, country } = req.query;
    const recent = euEarningsService.getRecentEarnings(parseInt(days), country || null);

    res.json({
      success: true,
      count: recent.length,
      daysBack: parseInt(days),
      country: country || 'all',
      data: recent
    });
  } catch (error) {
    console.error('Error fetching EU recent earnings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/earnings/eu/company/:identifierId
 * Get earnings data for a specific EU/UK company by identifier ID
 */
router.get('/eu/company/:identifierId', (req, res) => {
  try {
    if (!euEarningsService) {
      return res.status(503).json({ success: false, error: 'EU earnings service not initialized' });
    }

    const { identifierId } = req.params;
    const data = euEarningsService.getEarningsDataByIdentifierId(parseInt(identifierId));

    if (!data) {
      return res.status(404).json({ success: false, error: 'Company not found or no filings available' });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching EU company earnings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/earnings/eu/stats
 * Get EU/UK earnings coverage statistics
 */
router.get('/eu/stats', async (req, res) => {
  try {
    const statsResult = await database.query(`
      SELECT
        COUNT(DISTINCT i.id) as companies_with_filings,
        COUNT(f.id) as total_filings,
        COUNT(CASE WHEN f.parsed = 1 THEN 1 END) as parsed_filings,
        COUNT(DISTINCT i.country) as countries_covered
      FROM company_identifiers i
      LEFT JOIN xbrl_filings f ON f.identifier_id = i.id
    `);
    const stats = statsResult.rows?.[0];

    const byCountryResult = await database.query(`
      SELECT
        i.country,
        COUNT(DISTINCT i.id) as companies,
        COUNT(f.id) as filings
      FROM company_identifiers i
      LEFT JOIN xbrl_filings f ON f.identifier_id = i.id
      GROUP BY i.country
      ORDER BY companies DESC
    `);
    const byCountry = byCountryResult.rows || [];

    res.json({
      success: true,
      data: {
        overall: stats,
        byCountry
      }
    });
  } catch (error) {
    console.error('Error fetching EU earnings stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
