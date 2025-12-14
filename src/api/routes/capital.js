// src/api/routes/capital.js
// API routes for capital allocation data (buybacks, dividends, shareholder returns)

const express = require('express');
const router = express.Router();
const db = require('../../database');
const CapitalAllocationTracker = require('../../services/capitalAllocationTracker');

const database = db.getDatabase();
let capitalTracker;

// Initialize capital allocation tracker
try {
  capitalTracker = new CapitalAllocationTracker(database);
} catch (error) {
  console.error('Failed to initialize CapitalAllocationTracker:', error.message);
}

/**
 * GET /api/capital/top-yield
 * Get companies with highest shareholder yield
 * Query params:
 *   - limit: number of results (default 20)
 */
router.get('/top-yield', (req, res) => {
  try {
    if (!capitalTracker) {
      return res.status(503).json({ error: 'Capital allocation service unavailable' });
    }

    const { limit = 20 } = req.query;
    const results = capitalTracker.getTopShareholderYield(parseInt(limit));

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
 * Get companies with long dividend increase streaks
 * Query params:
 *   - minYears: minimum years of increases (default 10)
 */
router.get('/dividend-aristocrats', (req, res) => {
  try {
    if (!capitalTracker) {
      return res.status(503).json({ error: 'Capital allocation service unavailable' });
    }

    const { minYears = 10 } = req.query;
    const results = capitalTracker.getDividendAristocrats(parseInt(minYears));

    res.json({
      minYears: parseInt(minYears),
      count: results.length,
      companies: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/recent-events
 * Get recent capital allocation events (buyback announcements, dividend changes)
 * Query params:
 *   - limit: number of results (default 50)
 *   - type: event type filter (optional)
 */
router.get('/recent-events', (req, res) => {
  try {
    if (!capitalTracker) {
      return res.status(503).json({ error: 'Capital allocation service unavailable' });
    }

    const { limit = 50, type } = req.query;
    let events = capitalTracker.getRecentCapitalEvents(parseInt(limit));

    if (type) {
      events = events.filter(e => e.event_type === type);
    }

    // Group by type for summary
    const byType = {};
    events.forEach(e => {
      byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    });

    res.json({
      count: events.length,
      byType,
      events
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
router.get('/company/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { quarters = 8 } = req.query;

    const company = database.prepare(
      'SELECT id, symbol, name, market_cap FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    if (!capitalTracker) {
      return res.status(503).json({ error: 'Capital allocation service unavailable' });
    }

    const overview = capitalTracker.getCapitalAllocationOverview(
      company.id,
      parseInt(quarters)
    );

    // Calculate dividend yield if we have market cap
    if (company.market_cap && overview.dividends.annualDividend) {
      // Get shares outstanding from latest balance sheet
      const sharesData = database.prepare(`
        SELECT data FROM financial_data
        WHERE company_id = ? AND statement_type = 'balance_sheet'
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `).get(company.id);

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
router.get('/company/:symbol/buybacks', (req, res) => {
  try {
    const { symbol } = req.params;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get all buyback programs
    const programs = database.prepare(`
      SELECT * FROM buyback_programs
      WHERE company_id = ?
      ORDER BY announced_date DESC
    `).all(company.id);

    // Get quarterly execution
    const activity = database.prepare(`
      SELECT * FROM buyback_activity
      WHERE company_id = ?
      ORDER BY fiscal_quarter DESC
      LIMIT 20
    `).all(company.id);

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
 * Get dividend history for a company
 * Query params:
 *   - limit: number of records (default 40)
 */
router.get('/company/:symbol/dividends', (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 40 } = req.query;

    const company = database.prepare(
      'SELECT id, market_cap FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get dividend history
    const dividends = database.prepare(`
      SELECT * FROM dividends
      WHERE company_id = ?
      ORDER BY ex_dividend_date DESC
      LIMIT ?
    `).all(company.id, parseInt(limit));

    // Get annual dividend info
    let annualInfo = null;
    if (capitalTracker) {
      annualInfo = capitalTracker.getAnnualDividend(company.id);
    }

    // Calculate stats
    const regularDividends = dividends.filter(d => d.dividend_type === 'regular');
    const stats = {
      totalDividends: dividends.length,
      regularDividends: regularDividends.length,
      specialDividends: dividends.filter(d => d.dividend_type === 'special').length,
      increases: regularDividends.filter(d => d.is_increase).length,
      decreases: regularDividends.filter(d => d.is_decrease).length,
      consecutiveIncreases: regularDividends[0]?.consecutive_increases || 0
    };

    res.json({
      annualDividend: annualInfo?.annualDividend || null,
      dividendYield: annualInfo?.dividendYield || null,
      frequency: annualInfo?.frequency || null,
      stats,
      history: dividends
    });
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
router.get('/company/:symbol/chart', (req, res) => {
  try {
    const { symbol } = req.params;
    const { quarters = 20 } = req.query;

    const company = database.prepare(
      'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
    ).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get capital allocation summary
    const summary = database.prepare(`
      SELECT * FROM capital_allocation_summary
      WHERE company_id = ?
      ORDER BY fiscal_quarter DESC
      LIMIT ?
    `).all(company.id, parseInt(quarters));

    // Get buyback activity
    const buybacks = database.prepare(`
      SELECT fiscal_quarter, amount_spent, shares_repurchased, average_price
      FROM buyback_activity
      WHERE company_id = ?
      ORDER BY fiscal_quarter DESC
      LIMIT ?
    `).all(company.id, parseInt(quarters));

    // Get dividend payments aggregated by quarter
    const dividends = database.prepare(`
      SELECT
        strftime('%Y', ex_dividend_date) || '-Q' ||
        ((CAST(strftime('%m', ex_dividend_date) AS INTEGER) + 2) / 3) as fiscal_quarter,
        SUM(dividend_amount) as total_dividend,
        COUNT(*) as payment_count
      FROM dividends
      WHERE company_id = ?
        AND dividend_type = 'regular'
      GROUP BY fiscal_quarter
      ORDER BY fiscal_quarter DESC
      LIMIT ?
    `).all(company.id, parseInt(quarters));

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
 */
router.get('/stats', (req, res) => {
  try {
    // Companies with buyback programs
    const buybackStats = database.prepare(`
      SELECT
        COUNT(DISTINCT company_id) as companies_with_programs,
        SUM(authorization_amount) as total_authorized,
        SUM(amount_spent) as total_spent,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_programs
      FROM buyback_programs
    `).get();

    // Dividend statistics
    const dividendStats = database.prepare(`
      SELECT
        COUNT(DISTINCT company_id) as dividend_payers,
        AVG(dividend_amount) as avg_dividend,
        MAX(consecutive_increases) as max_streak
      FROM dividends
      WHERE dividend_type = 'regular'
        AND ex_dividend_date >= date('now', '-1 year')
    `).get();

    // Recent capital allocation events
    const recentEvents = database.prepare(`
      SELECT
        event_type,
        COUNT(*) as count
      FROM significant_events
      WHERE event_date >= date('now', '-3 months')
        AND event_type IN ('buyback_announcement', 'dividend_increase', 'dividend_decrease', 'dividend_initiation')
      GROUP BY event_type
    `).all();

    // Top shareholder yield
    const topYield = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        cas.shareholder_yield
      FROM capital_allocation_summary cas
      JOIN companies c ON cas.company_id = c.id
      WHERE cas.shareholder_yield IS NOT NULL
        AND cas.fiscal_quarter = (
          SELECT MAX(fiscal_quarter) FROM capital_allocation_summary
          WHERE company_id = cas.company_id
        )
      ORDER BY cas.shareholder_yield DESC
      LIMIT 5
    `).all();

    res.json({
      buybacks: buybackStats,
      dividends: dividendStats,
      recentEvents: Object.fromEntries(recentEvents.map(e => [e.event_type, e.count])),
      topShareholderYield: topYield
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/capital/dividend-calendar
 * Get upcoming dividend ex-dates
 * Query params:
 *   - days: days ahead to look (default 30)
 */
router.get('/dividend-calendar', (req, res) => {
  try {
    const { days = 30 } = req.query;

    const upcoming = database.prepare(`
      SELECT
        d.*,
        c.symbol,
        c.name as company_name,
        c.sector
      FROM dividends d
      JOIN companies c ON d.company_id = c.id
      WHERE d.ex_dividend_date >= date('now')
        AND d.ex_dividend_date <= date('now', '+' || ? || ' days')
      ORDER BY d.ex_dividend_date ASC
    `).all(parseInt(days));

    // Group by date
    const byDate = {};
    upcoming.forEach(d => {
      if (!byDate[d.ex_dividend_date]) {
        byDate[d.ex_dividend_date] = [];
      }
      byDate[d.ex_dividend_date].push(d);
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
router.get('/sector-comparison', (req, res) => {
  try {
    const comparison = database.prepare(`
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
      WHERE cas.fiscal_quarter = (
        SELECT MAX(fiscal_quarter) FROM capital_allocation_summary
        WHERE company_id = cas.company_id
      )
        AND c.sector IS NOT NULL
      GROUP BY c.sector
      HAVING COUNT(DISTINCT c.id) >= 3
      ORDER BY avg_shareholder_yield DESC
    `).all();

    res.json({
      sectors: comparison
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
