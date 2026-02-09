// src/api/routes/capital.js
// API routes for capital allocation data (buybacks, dividends, shareholder returns)

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const CapitalAllocationTracker = require('../../services/capitalAllocationTracker');
const DividendService = require('../../services/dividendService');

// Lazy initialization cache
let capitalTracker = null;
let capitalTrackerPromise = null;

async function getCapitalTracker() {
  if (capitalTracker) return capitalTracker;
  if (capitalTrackerPromise) return capitalTrackerPromise;

  capitalTrackerPromise = (async () => {
    try {
      const database = await getDatabaseAsync();
      capitalTracker = new CapitalAllocationTracker(database);
      return capitalTracker;
    } catch (error) {
      console.error('Failed to initialize CapitalAllocationTracker:', error.message);
      capitalTrackerPromise = null;
      throw error;
    }
  })();

  return capitalTrackerPromise;
}

/**
 * GET /api/capital/top-yield
 * Get companies with highest shareholder yield
 * Query params:
 *   - limit: number of results (default 20)
 */
router.get('/top-yield', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const database = await getDatabaseAsync();

    // Try the capitalTracker method first
    try {
      const tracker = await getCapitalTracker();
      const results = await tracker.getTopShareholderYield(parseInt(limit));
      if (results.length > 0) {
        return res.json({
          count: results.length,
          companies: results
        });
      }
    } catch (trackerError) {
      console.log('CapitalTracker unavailable, using fallback query');
    }

    // Fallback: query directly for companies with highest total shareholder return
    // This works even when shareholder_yield is not calculated (requires market cap)
    const resultsQuery = await database.query(`
      SELECT
        c.id, c.symbol, c.name, c.sector,
        cas.fiscal_quarter,
        cas.total_shareholder_return,
        cas.dividends_paid,
        cas.buybacks_executed,
        cas.free_cash_flow,
        cas.dividend_pct_of_fcf,
        cas.buyback_pct_of_fcf,
        cas.dividend_payout_ratio,
        cas.shareholder_yield
      FROM capital_allocation_summary cas
      JOIN companies c ON cas.company_id = c.id
      WHERE cas.fiscal_quarter LIKE '%-FY'
        AND cas.total_shareholder_return IS NOT NULL
        AND cas.total_shareholder_return > 0
        AND cas.fiscal_quarter = (
          SELECT MAX(fiscal_quarter) FROM capital_allocation_summary
          WHERE company_id = cas.company_id AND fiscal_quarter LIKE '%-FY'
        )
      ORDER BY cas.total_shareholder_return DESC
      LIMIT $1
    `, [parseInt(limit)]);
    const results = resultsQuery.rows;

    res.json({
      count: results.length,
      companies: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividend-aristocrats
 * Get dividend aristocrats (25+ years of consecutive dividend growth)
 * Uses dividend_metrics table with pre-calculated years of growth
 * Query params:
 *   - minYears: minimum years of dividend growth (default 25 for true aristocrats)
 */
router.get('/dividend-aristocrats', async (req, res) => {
  try {
    const { minYears = 25 } = req.query;
    const database = await getDatabaseAsync();

    // First try the new dividend_metrics table
    const resultsQuery = await database.query(`
      SELECT
        c.id, c.symbol, c.name, c.sector, c.market_cap,
        dm.dividend_yield,
        dm.years_of_growth,
        dm.current_annual_dividend,
        dm.dividend_growth_1y,
        dm.dividend_growth_5y,
        dm.dividend_growth_10y,
        dm.payout_ratio,
        dm.dividend_frequency,
        dm.last_increase_date,
        dm.last_increase_pct,
        dm.ex_dividend_date,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.years_of_growth >= $1
        AND dm.dividend_yield > 0
      ORDER BY dm.years_of_growth DESC, dm.dividend_yield DESC
    `, [parseInt(minYears)]);
    const results = resultsQuery.rows;

    if (results.length > 0) {
      return res.json({
        minYears: parseInt(minYears),
        count: results.length,
        companies: results,
        note: minYears >= 25 ? 'Dividend Aristocrats: 25+ years of consecutive dividend increases' : `Companies with ${minYears}+ years of dividend growth`
      });
    }

    // Fallback: Use capitalTracker method if dividend_metrics is empty
    try {
      const tracker = await getCapitalTracker();
      const fallbackResults = await tracker.getDividendAristocrats(parseInt(minYears));
      if (fallbackResults.length > 0) {
        return res.json({
          minYears: parseInt(minYears),
          count: fallbackResults.length,
          companies: fallbackResults,
          note: 'Based on dividend payment history'
        });
      }
    } catch (trackerError) {
      console.log('CapitalTracker unavailable for aristocrats, using fallback');
    }

    // Final fallback: Use capital_allocation_summary
    const fallbackQuery = await database.query(`
      WITH dividend_years AS (
        SELECT
          company_id,
          SUBSTR(fiscal_quarter, 1, 4) as year,
          SUM(dividends_paid) as annual_dividends
        FROM capital_allocation_summary
        WHERE fiscal_quarter LIKE '%-FY'
          AND dividends_paid > 0
        GROUP BY company_id, SUBSTR(fiscal_quarter, 1, 4)
      ),
      company_streaks AS (
        SELECT
          company_id,
          COUNT(*) as years_paying_dividends,
          MAX(year) as latest_year,
          AVG(annual_dividends) as avg_annual_dividend
        FROM dividend_years
        GROUP BY company_id
        HAVING COUNT(*) >= $1
      )
      SELECT
        c.id, c.symbol, c.name, c.sector,
        cs.years_paying_dividends as years_of_growth,
        cs.avg_annual_dividend,
        cs.latest_year,
        cas.dividends_paid as latest_dividend_total,
        cas.dividend_pct_of_fcf,
        cas.dividend_payout_ratio as payout_ratio
      FROM company_streaks cs
      JOIN companies c ON cs.company_id = c.id
      LEFT JOIN capital_allocation_summary cas ON cas.company_id = c.id
        AND cas.fiscal_quarter = cs.latest_year || '-FY'
      ORDER BY cs.years_paying_dividends DESC, cs.avg_annual_dividend DESC
      LIMIT 100
    `, [parseInt(minYears)]);
    const fallbackResults = fallbackQuery.rows;

    res.json({
      minYears: parseInt(minYears),
      count: fallbackResults.length,
      companies: fallbackResults,
      note: 'Based on consistent annual dividend payments from financial statements'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividend-kings
 * Get dividend kings (50+ years of consecutive dividend growth)
 */
router.get('/dividend-kings', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const resultsQuery = await database.query(`
      SELECT
        c.id, c.symbol, c.name, c.sector, c.market_cap,
        dm.dividend_yield,
        dm.years_of_growth,
        dm.current_annual_dividend,
        dm.dividend_growth_1y,
        dm.dividend_growth_5y,
        dm.dividend_growth_10y,
        dm.payout_ratio,
        dm.dividend_frequency,
        dm.last_increase_date,
        dm.last_increase_pct,
        dm.ex_dividend_date
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.is_dividend_king = 1
        OR dm.years_of_growth >= 50
      ORDER BY dm.years_of_growth DESC, dm.dividend_yield DESC
    `);
    const results = resultsQuery.rows;

    res.json({
      count: results.length,
      companies: results,
      note: 'Dividend Kings: 50+ years of consecutive dividend increases'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/top-dividend-yielders
 * Get stocks with highest dividend yields
 * Query params:
 *   - minYield: minimum yield (default 0)
 *   - maxYield: maximum yield (default 15, to filter outliers)
 *   - sector: filter by sector
 *   - minYearsGrowth: minimum years of growth
 *   - limit: number of results (default 50)
 */
router.get('/top-dividend-yielders', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      minYield = 0,
      maxYield = 15,
      sector,
      minYearsGrowth = 0,
      limit = 50
    } = req.query;

    let sql = `
      SELECT
        c.id, c.symbol, c.name, c.sector, c.market_cap,
        dm.dividend_yield,
        dm.current_annual_dividend,
        dm.payout_ratio,
        dm.years_of_growth,
        dm.dividend_growth_5y,
        dm.dividend_frequency,
        dm.ex_dividend_date,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.dividend_yield >= $1
        AND dm.dividend_yield <= $2
        AND dm.years_of_growth >= $3
        AND dm.dividend_yield IS NOT NULL
    `;

    const params = [parseFloat(minYield), parseFloat(maxYield), parseInt(minYearsGrowth)];

    if (sector) {
      sql += ' AND c.sector = $4';
      params.push(sector);
    }

    sql += ` ORDER BY dm.dividend_yield DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const resultsQuery = await database.query(sql, params);
    const results = resultsQuery.rows;

    res.json({
      count: results.length,
      filters: { minYield, maxYield, sector, minYearsGrowth },
      companies: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividend-growth-leaders
 * Get companies with highest dividend growth rates
 * Query params:
 *   - period: '1y', '3y', '5y', '10y' (default '5y')
 *   - limit: number of results (default 50)
 */
router.get('/dividend-growth-leaders', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { period = '5y', limit = 50 } = req.query;

    const growthColumn = {
      '1y': 'dividend_growth_1y',
      '3y': 'dividend_growth_3y',
      '5y': 'dividend_growth_5y',
      '10y': 'dividend_growth_10y'
    }[period] || 'dividend_growth_5y';

    const resultsQuery = await database.query(`
      SELECT
        c.id, c.symbol, c.name, c.sector, c.market_cap,
        dm.dividend_yield,
        dm.${growthColumn} as growth_rate,
        dm.years_of_growth,
        dm.current_annual_dividend,
        dm.payout_ratio,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.${growthColumn} IS NOT NULL
        AND dm.${growthColumn} > 0
        AND dm.dividend_yield > 0
      ORDER BY dm.${growthColumn} DESC
      LIMIT $1
    `, [parseInt(limit)]);
    const results = resultsQuery.rows;

    res.json({
      period,
      count: results.length,
      companies: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividends-by-sector
 * Get dividend statistics grouped by sector
 */
router.get('/dividends-by-sector', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const resultsQuery = await database.query(`
      SELECT
        c.sector,
        COUNT(*) as company_count,
        ROUND(AVG(dm.dividend_yield), 2) as avg_yield,
        ROUND(AVG(dm.payout_ratio), 2) as avg_payout_ratio,
        ROUND(AVG(dm.years_of_growth), 1) as avg_years_growth,
        ROUND(AVG(dm.dividend_growth_5y), 2) as avg_5y_growth,
        SUM(CASE WHEN dm.is_dividend_aristocrat = 1 THEN 1 ELSE 0 END) as aristocrats,
        SUM(CASE WHEN dm.is_dividend_king = 1 THEN 1 ELSE 0 END) as kings
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE c.sector IS NOT NULL
        AND dm.dividend_yield > 0
      GROUP BY c.sector
      ORDER BY avg_yield DESC
    `);
    const results = resultsQuery.rows;

    res.json({
      sectorCount: results.length,
      sectors: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividend-screen
 * Screen dividend stocks with multiple criteria
 * Query params: minYield, maxYield, minPayoutRatio, maxPayoutRatio, minYearsGrowth, sector, sp500Only, sortBy, limit
 */
router.get('/dividend-screen', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      minYield,
      maxYield,
      minPayoutRatio,
      maxPayoutRatio,
      minYearsGrowth,
      minGrowth5y,
      sector,
      sp500Only,
      aristocratsOnly,
      kingsOnly,
      sortBy = 'dividend_yield',
      sortOrder = 'DESC',
      limit = 100
    } = req.query;

    let sql = `
      SELECT
        c.id, c.symbol, c.name, c.sector, c.market_cap, c.is_sp500,
        dm.dividend_yield,
        dm.current_annual_dividend,
        dm.payout_ratio,
        dm.years_of_growth,
        dm.dividend_growth_1y,
        dm.dividend_growth_5y,
        dm.dividend_frequency,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king,
        dm.ex_dividend_date
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.dividend_yield > 0
    `;

    const params = [];
    let paramIndex = 1;

    if (minYield) {
      sql += ` AND dm.dividend_yield >= $${paramIndex++}`;
      params.push(parseFloat(minYield));
    }
    if (maxYield) {
      sql += ` AND dm.dividend_yield <= $${paramIndex++}`;
      params.push(parseFloat(maxYield));
    }
    if (minPayoutRatio) {
      sql += ` AND dm.payout_ratio >= $${paramIndex++}`;
      params.push(parseFloat(minPayoutRatio));
    }
    if (maxPayoutRatio) {
      sql += ` AND dm.payout_ratio <= $${paramIndex++}`;
      params.push(parseFloat(maxPayoutRatio));
    }
    if (minYearsGrowth) {
      sql += ` AND dm.years_of_growth >= $${paramIndex++}`;
      params.push(parseInt(minYearsGrowth));
    }
    if (minGrowth5y) {
      sql += ` AND dm.dividend_growth_5y >= $${paramIndex++}`;
      params.push(parseFloat(minGrowth5y));
    }
    if (sector) {
      sql += ` AND c.sector = $${paramIndex++}`;
      params.push(sector);
    }
    if (sp500Only === 'true') {
      sql += ' AND c.is_sp500 = 1';
    }
    if (aristocratsOnly === 'true') {
      sql += ' AND dm.is_dividend_aristocrat = 1';
    }
    if (kingsOnly === 'true') {
      sql += ' AND dm.is_dividend_king = 1';
    }

    // Validate sort column
    const validSortColumns = [
      'dividend_yield', 'payout_ratio', 'years_of_growth',
      'dividend_growth_5y', 'market_cap', 'current_annual_dividend'
    ];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'dividend_yield';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY dm.${sortColumn} ${order} NULLS LAST LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const resultsQuery = await database.query(sql, params);
    const results = resultsQuery.rows;

    res.json({
      count: results.length,
      companies: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/recent-events
 * Get recent capital allocation events derived from financial data changes
 * Query params:
 *   - limit: number of results (default 50)
 *   - type: event type filter (optional)
 */
router.get('/recent-events', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { limit = 50, type } = req.query;

    // First try the capitalTracker method (queries significant_events table)
    if (capitalTracker) {
      const events = await capitalTracker.getRecentCapitalEvents(parseInt(limit));
      if (events.length > 0) {
        const filteredEvents = type ? events.filter(e => e.event_type === type) : events;
        const byType = {};
        filteredEvents.forEach(e => {
          byType[e.event_type] = (byType[e.event_type] || 0) + 1;
        });
        return res.json({
          count: filteredEvents.length,
          byType,
          events: filteredEvents
        });
      }
    }

    // Fallback: Generate events from significant changes in capital allocation data
    // Find companies with notable dividend or buyback changes year-over-year
    const eventsQuery = await database.query(`
      WITH yearly_data AS (
        SELECT
          cas.company_id,
          SUBSTR(cas.fiscal_quarter, 1, 4) as year,
          cas.dividends_paid,
          cas.buybacks_executed,
          cas.total_shareholder_return,
          cas.free_cash_flow
        FROM capital_allocation_summary cas
        WHERE cas.fiscal_quarter LIKE '%-FY'
      ),
      yoy_changes AS (
        SELECT
          y1.company_id,
          y1.year as event_year,
          y1.dividends_paid as current_dividends,
          y2.dividends_paid as prior_dividends,
          y1.buybacks_executed as current_buybacks,
          y2.buybacks_executed as prior_buybacks,
          CASE
            WHEN y2.dividends_paid > 0 AND y1.dividends_paid > y2.dividends_paid * 1.05
            THEN 'dividend_increase'
            WHEN y2.dividends_paid > 0 AND y1.dividends_paid < y2.dividends_paid * 0.95
            THEN 'dividend_decrease'
            WHEN y2.dividends_paid IS NULL OR y2.dividends_paid = 0 AND y1.dividends_paid > 0
            THEN 'dividend_initiation'
            WHEN y1.buybacks_executed > 1000000000
            THEN 'large_buyback'
            ELSE NULL
          END as event_type,
          CASE
            WHEN y2.dividends_paid > 0
            THEN ((y1.dividends_paid - y2.dividends_paid) / y2.dividends_paid) * 100
            ELSE NULL
          END as change_pct
        FROM yearly_data y1
        LEFT JOIN yearly_data y2 ON y1.company_id = y2.company_id
          AND CAST(y1.year AS INTEGER) = CAST(y2.year AS INTEGER) + 1
        WHERE y1.year >= '2020'
      )
      SELECT
        c.id, c.symbol, c.name as company_name, c.sector,
        yoy.event_year || '-12-31' as event_date,
        yoy.event_type,
        CASE
          WHEN yoy.event_type = 'dividend_increase'
          THEN 'Dividend Increased ' || ROUND(yoy.change_pct, 1) || '%'
          WHEN yoy.event_type = 'dividend_decrease'
          THEN 'Dividend Decreased ' || ROUND(ABS(yoy.change_pct), 1) || '%'
          WHEN yoy.event_type = 'dividend_initiation'
          THEN 'Dividend Initiated'
          WHEN yoy.event_type = 'large_buyback'
          THEN 'Large Buyback: $' || ROUND(yoy.current_buybacks / 1000000000.0, 1) || 'B'
          ELSE 'Capital Event'
        END as headline,
        yoy.current_dividends as value,
        yoy.change_pct
      FROM yoy_changes yoy
      JOIN companies c ON yoy.company_id = c.id
      WHERE yoy.event_type IS NOT NULL
      ORDER BY yoy.event_year DESC, yoy.current_dividends DESC
      LIMIT $1
    `, [parseInt(limit)]);
    const events = eventsQuery.rows;

    // Filter by type if specified
    const filteredEvents = type ? events.filter(e => e.event_type === type) : events;

    // Group by type for summary
    const byType = {};
    filteredEvents.forEach(e => {
      byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    });

    res.json({
      count: filteredEvents.length,
      byType,
      events: filteredEvents,
      note: 'Events derived from year-over-year changes in financial data'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/top-buybacks
 * Get companies with highest buyback activity
 * Query params:
 *   - limit: number of results (default 20)
 */
router.get('/top-buybacks', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { limit = 20 } = req.query;

    const resultsQuery = await database.query(`
      SELECT
        c.id, c.symbol, c.name, c.sector,
        cas.fiscal_quarter,
        cas.buybacks_executed,
        cas.buyback_pct_of_fcf,
        cas.free_cash_flow,
        cas.total_shareholder_return,
        cas.dividends_paid
      FROM capital_allocation_summary cas
      JOIN companies c ON cas.company_id = c.id
      WHERE cas.fiscal_quarter LIKE '%-FY'
        AND cas.buybacks_executed IS NOT NULL
        AND cas.buybacks_executed > 0
        AND cas.fiscal_quarter = (
          SELECT MAX(fiscal_quarter) FROM capital_allocation_summary
          WHERE company_id = cas.company_id AND fiscal_quarter LIKE '%-FY'
        )
      ORDER BY cas.buybacks_executed DESC
      LIMIT $1
    `, [parseInt(limit)]);
    const results = resultsQuery.rows;

    res.json({
      count: results.length,
      companies: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/company/:symbol
 * Get comprehensive capital allocation data for a specific company
 * Query params:
 *   - quarters: number of quarters of history (default 8)
 */
router.get('/company/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { quarters = 8 } = req.query;

    const companyQuery = await database.query(
      'SELECT id, symbol, name, market_cap FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyQuery.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!capitalTracker) {
      return res.status(503).json({ error: 'Capital allocation service unavailable' });
    }

    const overview = await capitalTracker.getCapitalAllocationOverview(
      company.id,
      parseInt(quarters)
    );

    // Calculate dividend yield if we have market cap
    if (company.market_cap && overview.dividends.annualDividend) {
      // Get shares outstanding from latest balance sheet
      const sharesDataQuery = await database.query(`
        SELECT data FROM financial_data
        WHERE company_id = $1 AND statement_type = 'balance_sheet'
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `, [company.id]);
      const sharesData = sharesDataQuery.rows[0];

      if (sharesData) {
        const data = JSON.parse(sharesData.data);
        const sharesOutstanding = parseFloat(data.commonSharesOutstanding) ||
                                  parseFloat(data.CommonStockSharesOutstanding) || 0;

        if (sharesOutstanding > 0) {
          const pricePerShare = company.market_cap / sharesOutstanding;
          overview.dividends.dividendYield =
            (overview.dividends.annualDividend / pricePerShare) * 100;
        }
      }
    }

    res.json({
      company: {
        symbol: company.symbol,
        name: company.name,
        marketCap: company.market_cap
      },
      ...overview
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/company/:symbol/buybacks
 * Get buyback programs and activity for a company
 */
router.get('/company/:symbol/buybacks', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;

    const companyQuery = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyQuery.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get all buyback programs
    const programsQuery = await database.query(`
      SELECT * FROM buyback_programs
      WHERE company_id = $1
      ORDER BY announced_date DESC
    `, [company.id]);
    const programs = programsQuery.rows;

    // Get quarterly execution
    const activityQuery = await database.query(`
      SELECT * FROM buyback_activity
      WHERE company_id = $1
      ORDER BY fiscal_quarter DESC
      LIMIT 20
    `, [company.id]);
    const activity = activityQuery.rows;

    // Calculate totals
    const totals = {
      totalAuthorized: programs.reduce((sum, p) => sum + (p.authorization_amount || 0), 0),
      totalRepurchased: programs.reduce((sum, p) => sum + (p.amount_spent || 0), 0),
      activePrograms: programs.filter(p => p.status === 'active').length,
      ttmRepurchased: activity.slice(0, 4).reduce((sum, a) => sum + (a.amount_spent || 0), 0)
    };

    res.json({
      totals,
      programs,
      quarterlyActivity: activity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/company/:symbol/dividends
 * Get comprehensive dividend data for a company
 * Combines dividend_metrics, dividend_history, and capital_allocation data
 * Query params:
 *   - limit: number of history records (default 40)
 */
router.get('/company/:symbol/dividends', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { limit = 40 } = req.query;

    const companyQuery = await database.query(
      'SELECT id, symbol, name, market_cap, sector FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyQuery.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get dividend metrics from dividend_metrics table (primary source)
    const metricsQuery = await database.query(`
      SELECT
        dm.*
      FROM dividend_metrics dm
      WHERE dm.company_id = $1
    `, [company.id]);
    const metrics = metricsQuery.rows[0];

    // Get dividend history from dividend_history table (per-share dividends from yfinance)
    const historyQuery = await database.query(`
      SELECT
        ex_date,
        payment_date,
        amount,
        frequency
      FROM dividend_history
      WHERE company_id = $1
      ORDER BY ex_date DESC
      LIMIT $2
    `, [company.id, parseInt(limit)]);
    const history = historyQuery.rows;

    // Fallback: Get from old dividends table if dividend_history is empty
    let fallbackHistory = [];
    if (history.length === 0) {
      const fallbackQuery = await database.query(`
        SELECT
          ex_dividend_date as ex_date,
          payment_date,
          dividend_amount as amount,
          frequency
        FROM dividends
        WHERE company_id = $1
        ORDER BY ex_dividend_date DESC
        LIMIT $2
      `, [company.id, parseInt(limit)]);
      fallbackHistory = fallbackQuery.rows;
    }

    // Get annual dividend info from capital allocation if metrics not available
    let annualInfo = null;
    if (!metrics && capitalTracker) {
      annualInfo = await capitalTracker.getAnnualDividend(company.id);
    }

    // Build response with all available data
    const response = {
      company: {
        symbol: company.symbol,
        name: company.name,
        sector: company.sector,
        marketCap: company.market_cap
      },
      metrics: metrics ? {
        currentAnnualDividend: metrics.current_annual_dividend,
        dividendYield: metrics.dividend_yield,
        payoutRatio: metrics.payout_ratio,
        yearsOfGrowth: metrics.years_of_growth,
        dividendGrowth1y: metrics.dividend_growth_1y,
        dividendGrowth3y: metrics.dividend_growth_3y,
        dividendGrowth5y: metrics.dividend_growth_5y,
        dividendGrowth10y: metrics.dividend_growth_10y,
        lastIncreaseDate: metrics.last_increase_date,
        lastIncreasePct: metrics.last_increase_pct,
        frequency: metrics.dividend_frequency,
        exDividendDate: metrics.ex_dividend_date,
        isDividendAristocrat: !!metrics.is_dividend_aristocrat,
        isDividendKing: !!metrics.is_dividend_king,
        lastUpdated: metrics.last_updated
      } : (annualInfo ? {
        currentAnnualDividend: annualInfo.annualDividend,
        dividendYield: annualInfo.dividendYield,
        frequency: annualInfo.frequency
      } : null),
      history: history.length > 0 ? history : fallbackHistory,
      stats: {
        totalPayments: history.length || fallbackHistory.length,
        yearsOfData: history.length > 0
          ? Math.ceil(history.length / (metrics?.dividend_frequency === 'quarterly' ? 4 : 12))
          : null
      }
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/company/:symbol/chart
 * Get chart-ready capital allocation data
 * Query params:
 *   - quarters: number of quarters (default 20)
 */
router.get('/company/:symbol/chart', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { quarters = 20 } = req.query;

    const companyQuery = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)',
      [symbol.toUpperCase()]
    );
    const company = companyQuery.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get capital allocation summary
    const summaryQuery = await database.query(`
      SELECT * FROM capital_allocation_summary
      WHERE company_id = $1
      ORDER BY fiscal_quarter DESC
      LIMIT $2
    `, [company.id, parseInt(quarters)]);
    const summary = summaryQuery.rows;

    // Get buyback activity
    const buybacksQuery = await database.query(`
      SELECT fiscal_quarter, amount_spent, shares_repurchased, average_price
      FROM buyback_activity
      WHERE company_id = $1
      ORDER BY fiscal_quarter DESC
      LIMIT $2
    `, [company.id, parseInt(quarters)]);
    const buybacks = buybacksQuery.rows;

    // Get dividend payments aggregated by quarter
    const dividendsQuery = await database.query(`
      SELECT
        TO_CHAR(ex_dividend_date, 'YYYY') || '-Q' ||
        EXTRACT(QUARTER FROM ex_dividend_date)::text as fiscal_quarter,
        SUM(dividend_amount) as total_dividend,
        COUNT(*) as payment_count
      FROM dividends
      WHERE company_id = $1
        AND dividend_type = 'regular'
      GROUP BY fiscal_quarter
      ORDER BY fiscal_quarter DESC
      LIMIT $2
    `, [company.id, parseInt(quarters)]);
    const dividends = dividendsQuery.rows;

    // Format for charts
    const chartData = summary.reverse().map(s => ({
      quarter: s.fiscal_quarter,
      fcf: s.free_cash_flow,
      dividends: s.dividends_paid,
      buybacks: s.buybacks_executed,
      capex: s.capex,
      shareholderYield: s.shareholder_yield
    }));

    res.json({
      quarterlyData: chartData,
      buybackActivity: buybacks,
      dividendHistory: dividends
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/stats
 * Get overall capital allocation statistics
 * Optimized: Combined multiple queries into a single batch query
 */
router.get('/stats', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    // Combined query for all stats - runs as single transaction
    const allStatsQuery = await database.query(`
      WITH summary_stats AS (
        SELECT
          COUNT(DISTINCT company_id) as companies_with_data,
          SUM(CASE WHEN buybacks_executed > 0 THEN 1 ELSE 0 END) as buyback_quarters,
          SUM(CASE WHEN dividends_paid > 0 THEN 1 ELSE 0 END) as dividend_quarters,
          SUM(buybacks_executed) as total_buybacks,
          SUM(dividends_paid) as total_dividends,
          COUNT(DISTINCT CASE WHEN dividends_paid > 0 THEN company_id END) as dividend_payers,
          COUNT(DISTINCT CASE WHEN buybacks_executed > 0 THEN company_id END) as companies_with_buybacks
        FROM capital_allocation_summary
        WHERE fiscal_quarter LIKE '%-FY'
      ),
      buyback_stats AS (
        SELECT
          COUNT(DISTINCT company_id) as companies_with_programs,
          SUM(authorization_amount) as total_authorized,
          SUM(amount_spent) as total_spent,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_programs
        FROM buyback_programs
      ),
      dividend_stats AS (
        SELECT
          COUNT(*) as total_dividend_payers,
          SUM(CASE WHEN is_dividend_aristocrat = 1 THEN 1 ELSE 0 END) as aristocrats,
          SUM(CASE WHEN is_dividend_king = 1 THEN 1 ELSE 0 END) as kings,
          ROUND(AVG(dividend_yield), 2) as avg_yield,
          ROUND(AVG(CASE WHEN payout_ratio BETWEEN 0 AND 200 THEN payout_ratio END), 2) as avg_payout_ratio,
          ROUND(AVG(years_of_growth), 1) as avg_years_growth,
          MAX(years_of_growth) as max_years_growth
        FROM dividend_metrics
        WHERE dividend_yield > 0
      )
      SELECT
        ss.*,
        bs.companies_with_programs,
        bs.total_authorized,
        bs.total_spent,
        bs.active_programs,
        ds.total_dividend_payers,
        ds.aristocrats,
        ds.kings,
        ds.avg_yield,
        ds.avg_payout_ratio,
        ds.avg_years_growth,
        ds.max_years_growth
      FROM summary_stats ss, buyback_stats bs, dividend_stats ds
    `);
    const allStats = allStatsQuery.rows[0];

    // Build buyback stats - use summary data as fallback
    const buybackStats = {
      companies_with_programs: allStats.companies_with_programs || allStats.companies_with_buybacks,
      total_authorized: allStats.total_authorized,
      total_spent: allStats.total_spent || allStats.total_buybacks,
      active_programs: allStats.active_programs
    };

    // Build dividend stats - use summary data as fallback
    const dividendStats = {
      total_dividend_payers: allStats.total_dividend_payers || allStats.dividend_payers,
      aristocrats: allStats.aristocrats,
      kings: allStats.kings,
      avg_yield: allStats.avg_yield,
      avg_payout_ratio: allStats.avg_payout_ratio,
      avg_years_growth: allStats.avg_years_growth,
      max_years_growth: allStats.max_years_growth
    };

    // Get recent events and top yielders in parallel (these are fast)
    const recentEventsQuery = await database.query(`
      SELECT event_type, COUNT(*) as count
      FROM significant_events
      WHERE event_date >= CURRENT_DATE - INTERVAL '3 months'
        AND event_type IN ('buyback_announcement', 'dividend_increase', 'dividend_decrease', 'dividend_initiation')
      GROUP BY event_type
    `);
    const recentEvents = recentEventsQuery.rows;

    // Top dividend yielders - with index on dividend_yield
    const topYieldersQuery = await database.query(`
      SELECT c.symbol, c.name, dm.dividend_yield, dm.years_of_growth,
             dm.is_dividend_aristocrat, dm.is_dividend_king
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.dividend_yield > 0 AND dm.dividend_yield < 15
      ORDER BY dm.dividend_yield DESC
      LIMIT 5
    `);
    const topYielders = topYieldersQuery.rows;

    // Top shareholder return - optimized with direct join
    const topYieldQuery = await database.query(`
      SELECT c.symbol, c.name, cas.shareholder_yield, cas.total_shareholder_return
      FROM capital_allocation_summary cas
      JOIN companies c ON cas.company_id = c.id
      WHERE cas.fiscal_quarter LIKE '%-FY'
        AND (cas.shareholder_yield IS NOT NULL OR cas.total_shareholder_return > 0)
        AND cas.fiscal_quarter = (
          SELECT MAX(fiscal_quarter) FROM capital_allocation_summary cas2
          WHERE cas2.company_id = cas.company_id AND cas2.fiscal_quarter LIKE '%-FY'
        )
      ORDER BY COALESCE(cas.shareholder_yield, 0) DESC, cas.total_shareholder_return DESC
      LIMIT 5
    `);
    const topYield = topYieldQuery.rows;

    res.json({
      buybacks: buybackStats,
      dividends: dividendStats,
      recentEvents: Object.fromEntries(recentEvents.map(e => [e.event_type, e.count])),
      topDividendYielders: topYielders,
      topShareholderYield: topYield
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividend-calendar
 * Get upcoming dividend ex-dates from dividend_metrics and dividend_history
 * Query params:
 *   - days: days ahead to look (default 30)
 */
router.get('/dividend-calendar', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { days = 30 } = req.query;

    // Try dividend_metrics first (has ex_dividend_date from yfinance)
    const upcomingQuery = await database.query(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name as company_name,
        c.sector,
        dm.ex_dividend_date,
        dm.dividend_yield,
        dm.current_annual_dividend,
        ROUND(dm.current_annual_dividend / 4, 4) as est_quarterly_dividend,
        dm.dividend_frequency,
        dm.years_of_growth,
        dm.is_dividend_aristocrat,
        dm.is_dividend_king
      FROM dividend_metrics dm
      JOIN companies c ON dm.company_id = c.id
      WHERE dm.ex_dividend_date >= CURRENT_DATE
        AND dm.ex_dividend_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
        AND dm.dividend_yield > 0
      ORDER BY dm.ex_dividend_date ASC
    `, [parseInt(days)]);
    let upcoming = upcomingQuery.rows;

    // Fallback to old dividends table if dividend_metrics has no upcoming
    if (upcoming.length === 0) {
      const fallbackQuery = await database.query(`
        SELECT
          d.company_id,
          c.symbol,
          c.name as company_name,
          c.sector,
          d.ex_dividend_date,
          d.dividend_amount,
          d.frequency as dividend_frequency
        FROM dividends d
        JOIN companies c ON d.company_id = c.id
        WHERE d.ex_dividend_date >= CURRENT_DATE
          AND d.ex_dividend_date <= CURRENT_DATE + $1 * INTERVAL '1 day'
        ORDER BY d.ex_dividend_date ASC
      `, [parseInt(days)]);
      upcoming = fallbackQuery.rows;
    }

    // Group by date
    const byDate = {};
    upcoming.forEach(d => {
      const exDate = d.ex_dividend_date;
      if (!byDate[exDate]) {
        byDate[exDate] = [];
      }
      byDate[exDate].push(d);
    });

    res.json({
      days: parseInt(days),
      count: upcoming.length,
      byDate,
      list: upcoming
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/sector-comparison
 * Compare capital allocation across sectors
 */
router.get('/sector-comparison', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const comparisonQuery = await database.query(`
      SELECT
        c.sector,
        COUNT(DISTINCT c.id) as company_count,
        AVG(cas.shareholder_yield) as avg_shareholder_yield,
        AVG(cas.dividend_pct_of_fcf) as avg_dividend_pct,
        AVG(cas.buyback_pct_of_fcf) as avg_buyback_pct,
        AVG(cas.dividend_payout_ratio) as avg_payout_ratio,
        AVG(cas.total_shareholder_return) as avg_total_return
      FROM capital_allocation_summary cas
      JOIN companies c ON cas.company_id = c.id
      WHERE cas.fiscal_quarter LIKE '%-FY'
        AND cas.fiscal_quarter = (
          SELECT MAX(fiscal_quarter) FROM capital_allocation_summary
          WHERE company_id = cas.company_id AND fiscal_quarter LIKE '%-FY'
        )
        AND c.sector IS NOT NULL
      GROUP BY c.sector
      HAVING COUNT(DISTINCT c.id) >= 3
      ORDER BY avg_total_return DESC NULLS LAST
    `);
    const comparison = comparisonQuery.rows;

    res.json({
      sectors: comparison
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/update-status
 * Get current status of capital allocation data
 */
router.get('/update-status', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    // Get data freshness stats
    const summaryStatsQuery = await database.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT company_id) as companies_tracked,
        MAX(updated_at) as last_update,
        MAX(fiscal_quarter) as latest_fiscal_quarter
      FROM capital_allocation_summary
    `);
    const summaryStats = summaryStatsQuery.rows[0];

    // Get fiscal year breakdown
    const fyBreakdownQuery = await database.query(`
      SELECT
        SUBSTR(fiscal_quarter, 1, 4) as year,
        COUNT(DISTINCT company_id) as companies,
        COUNT(*) as records
      FROM capital_allocation_summary
      WHERE fiscal_quarter LIKE '%-FY'
      GROUP BY SUBSTR(fiscal_quarter, 1, 4)
      ORDER BY year DESC
      LIMIT 5
    `);
    const fyBreakdown = fyBreakdownQuery.rows;

    res.json({
      status: 'ready',
      totalRecords: summaryStats.total_records,
      companiesTracked: summaryStats.companies_tracked,
      lastUpdate: summaryStats.last_update,
      latestFiscalQuarter: summaryStats.latest_fiscal_quarter,
      dataByYear: fyBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/capital/update
 * Trigger capital allocation data recalculation from financial_data
 * This re-runs the import script logic to refresh capital allocation data
 * Returns immediately and runs processing in background
 */
router.post('/update', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    // Get company count for status message
    const countResultQuery = await database.query('SELECT COUNT(*) as count FROM companies');
    const countResult = countResultQuery.rows[0];
    const totalCompanies = countResult.count;

    // Return immediately
    res.json({
      success: true,
      message: `Capital allocation update started for ${totalCompanies} companies`,
      checkStatus: '/api/capital/update-status'
    });

    // Run processing in background
    setImmediate(() => {
      runCapitalUpdate();
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Background capital allocation update function
async function runCapitalUpdate() {
  try {
    const database = await getDatabaseAsync();
    const companiesQuery = await database.query('SELECT id, symbol FROM companies');
    const companies = companiesQuery.rows;
    let processed = 0;
    let recordsUpdated = 0;

    // Helper functions
    const parseNum = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    };

    const extractValue = (data, ...fieldNames) => {
      for (const field of fieldNames) {
        if (data[field] !== undefined && data[field] !== null) {
          return parseNum(data[field]);
        }
      }
      return null;
    };

    const getFiscalQuarter = (fiscalDateEnding, fiscalPeriod, periodType) => {
      if (periodType === 'annual') {
        const year = fiscalDateEnding.substring(0, 4);
        return `${year}-FY`;
      }
      if (fiscalPeriod && fiscalPeriod.match(/Q[1-4]/)) {
        const year = fiscalDateEnding.substring(0, 4);
        return `${year}-${fiscalPeriod}`;
      }
      const date = new Date(fiscalDateEnding);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      let quarter;
      if (month <= 3) quarter = 'Q1';
      else if (month <= 6) quarter = 'Q2';
      else if (month <= 9) quarter = 'Q3';
      else quarter = 'Q4';
      return `${year}-${quarter}`;
    };

    // Process companies
    for (const company of companies) {
      try {
        // Get cash flow data
        const cashFlowDataQuery = await database.query(`
          SELECT fiscal_date_ending, fiscal_period, period_type, data
          FROM financial_data
          WHERE company_id = $1 AND statement_type = 'cash_flow'
          ORDER BY fiscal_date_ending DESC
        `, [company.id]);
        const cashFlowData = cashFlowDataQuery.rows;

        if (cashFlowData.length === 0) continue;

        // Get income data for payout ratios
        const incomeDataQuery = await database.query(`
          SELECT fiscal_date_ending, period_type, total_revenue,
            data->>'netIncome' as net_income,
            data->>'NetIncomeLoss' as net_income2
          FROM financial_data
          WHERE company_id = $1 AND statement_type = 'income_statement'
        `, [company.id]);
        const incomeData = incomeDataQuery.rows;

        const incomeMap = {};
        for (const row of incomeData) {
          incomeMap[`${row.fiscal_date_ending}_${row.period_type}`] = {
            revenue: parseNum(row.total_revenue),
            netIncome: parseNum(row.net_income) || parseNum(row.net_income2)
          };
        }

        // Get market cap
        const companyInfoQuery = await database.query('SELECT market_cap FROM companies WHERE id = $1', [company.id]);
        const companyInfo = companyInfoQuery.rows[0];
        const marketCap = parseNum(companyInfo?.market_cap);

        let count = 0;

        for (const row of cashFlowData) {
          try {
            const data = JSON.parse(row.data);
            const fiscalQuarter = getFiscalQuarter(row.fiscal_date_ending, row.fiscal_period, row.period_type);

            const operatingCashFlow = extractValue(data, 'operatingCashFlow', 'NetCashProvidedByUsedInOperatingActivities');
            const capex = extractValue(data, 'capitalExpenditures', 'PaymentsToAcquirePropertyPlantAndEquipment');
            const dividendsPaid = extractValue(data, 'dividends', 'PaymentsOfDividends');
            const buybacks = extractValue(data, 'stockRepurchase', 'PaymentsForRepurchaseOfCommonStock');
            const debtRepayment = extractValue(data, 'debtRepayment', 'RepaymentsOfLongTermDebt', 'RepaymentsOfDebt');
            const debtIssuance = extractValue(data, 'debtIssuance', 'ProceedsFromIssuanceOfLongTermDebt');
            const acquisitions = extractValue(data, 'acquisitionsNet', 'PaymentsToAcquireBusinessesNetOfCashAcquired');

            const freeCashFlow = operatingCashFlow !== null ? operatingCashFlow - Math.abs(capex || 0) : null;
            const totalShareholderReturn = (dividendsPaid !== null || buybacks !== null)
              ? Math.abs(dividendsPaid || 0) + Math.abs(buybacks || 0)
              : null;

            let dividendPctOfFcf = null, buybackPctOfFcf = null;
            if (freeCashFlow && freeCashFlow > 0) {
              if (dividendsPaid !== null) dividendPctOfFcf = (Math.abs(dividendsPaid) / freeCashFlow) * 100;
              if (buybacks !== null) buybackPctOfFcf = (Math.abs(buybacks) / freeCashFlow) * 100;
            }

            const income = incomeMap[`${row.fiscal_date_ending}_${row.period_type}`] || {};
            const capexPctOfRevenue = (capex !== null && income.revenue > 0) ? (Math.abs(capex) / income.revenue) * 100 : null;

            let dividendPayoutRatio = null, totalPayoutRatio = null;
            if (income.netIncome > 0) {
              if (dividendsPaid !== null) dividendPayoutRatio = (Math.abs(dividendsPaid) / income.netIncome) * 100;
              if (totalShareholderReturn !== null) totalPayoutRatio = (totalShareholderReturn / income.netIncome) * 100;
            }

            let shareholderYield = null;
            if (marketCap > 0 && totalShareholderReturn !== null) {
              shareholderYield = (totalShareholderReturn / marketCap) * 100;
              if (row.period_type === 'quarterly') shareholderYield *= 4;
            }

            await database.query(`
              INSERT INTO capital_allocation_summary (
                company_id, fiscal_quarter,
                operating_cash_flow, free_cash_flow,
                dividends_paid, buybacks_executed, capex,
                acquisitions, debt_repayment, debt_issuance,
                total_shareholder_return, shareholder_yield,
                dividend_pct_of_fcf, buyback_pct_of_fcf, capex_pct_of_revenue,
                dividend_payout_ratio, total_payout_ratio
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
              )
              ON CONFLICT(company_id, fiscal_quarter) DO UPDATE SET
                operating_cash_flow = EXCLUDED.operating_cash_flow,
                free_cash_flow = EXCLUDED.free_cash_flow,
                dividends_paid = EXCLUDED.dividends_paid,
                buybacks_executed = EXCLUDED.buybacks_executed,
                capex = EXCLUDED.capex,
                acquisitions = EXCLUDED.acquisitions,
                debt_repayment = EXCLUDED.debt_repayment,
                debt_issuance = EXCLUDED.debt_issuance,
                total_shareholder_return = EXCLUDED.total_shareholder_return,
                shareholder_yield = EXCLUDED.shareholder_yield,
                dividend_pct_of_fcf = EXCLUDED.dividend_pct_of_fcf,
                buyback_pct_of_fcf = EXCLUDED.buyback_pct_of_fcf,
                capex_pct_of_revenue = EXCLUDED.capex_pct_of_revenue,
                dividend_payout_ratio = EXCLUDED.dividend_payout_ratio,
                total_payout_ratio = EXCLUDED.total_payout_ratio,
                updated_at = CURRENT_TIMESTAMP
            `, [
              company.id, fiscalQuarter, operatingCashFlow, freeCashFlow,
              dividendsPaid ? Math.abs(dividendsPaid) : null,
              buybacks ? Math.abs(buybacks) : null,
              capex ? Math.abs(capex) : null,
              acquisitions ? Math.abs(acquisitions) : null,
              debtRepayment ? Math.abs(debtRepayment) : null,
              debtIssuance, totalShareholderReturn, shareholderYield,
              dividendPctOfFcf, buybackPctOfFcf, capexPctOfRevenue,
              dividendPayoutRatio, totalPayoutRatio
            ]);
            count++;
          } catch (err) {
            continue;
          }
        }

        recordsUpdated += count;
        processed++;
      } catch (err) {
        console.error(`Error processing ${company.symbol}:`, err.message);
      }
    }

    console.log(`[Capital Update] Completed: ${processed} companies, ${recordsUpdated} records updated`);
  } catch (error) {
    console.error('[Capital Update] Error:', error.message);
  }
}

module.exports = router;
