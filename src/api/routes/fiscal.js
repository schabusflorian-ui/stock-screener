// src/api/routes/fiscal.js
// API routes for fiscal calendar data

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const FiscalCalendarService = require('../../services/fiscalCalendar');

// Lazy initialization - service created on first request
let servicesCache = null;
let database, fiscalService;

async function initializeService() {
  if (!servicesCache) {
    database = await getDatabaseAsync();
    try {
      fiscalService = new FiscalCalendarService(database);
    } catch (error) {
      console.error('Failed to initialize fiscal calendar service:', error.message);
    }
    servicesCache = { database, fiscalService };
  }
  return servicesCache;
}

// Middleware to ensure service is initialized before any route
router.use(async (req, res, next) => {
  try {
    await initializeService();
    next();
  } catch (error) {
    console.error('Failed to initialize fiscal service:', error);
    res.status(500).json({ error: 'Service initialization failed' });
  }
});

/**
 * GET /api/fiscal/config/:symbol
 * Get fiscal year end configuration for a company
 */
router.get('/config/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;

    const config = fiscalService.getFiscalYearEnd(symbol);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Fiscal configuration not found for this symbol'
      });
    }

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      data: {
        fiscalYearEnd: config.monthDay,
        fiscalYearEndMonth: config.month,
        fiscalYearEndDay: config.day,
        fiscalYearEndMonthName: config.monthName,
        description: `Fiscal year ends ${config.monthName} ${config.day}`
      }
    });

  } catch (error) {
    console.error('Error fetching fiscal config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fiscal/calendar/:symbol
 * Get fiscal calendar for a company
 */
router.get('/calendar/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 20, fiscalYear, includeFY = 'true' } = req.query;

    const calendar = fiscalService.getFiscalCalendarBySymbol(symbol, {
      limit: parseInt(limit),
      fiscalYear: fiscalYear ? parseInt(fiscalYear) : undefined,
      includeFY: includeFY === 'true'
    });

    if (!calendar) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Get fiscal config for context
    const config = fiscalService.getFiscalYearEnd(symbol);

    // Format the calendar entries
    const formatted = calendar.map(entry => ({
      fiscalYear: entry.fiscal_year,
      fiscalPeriod: entry.fiscal_period,
      periodStart: entry.period_start,
      periodEnd: entry.period_end,
      filedDate: entry.filed_date,
      form: entry.form,
      calendarQuarter: entry.calendar_quarter,
      calendarYear: entry.calendar_year,
      label: fiscalService.formatFiscalPeriod(
        entry.fiscal_year,
        entry.fiscal_period,
        entry.period_end
      )
    }));

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      fiscalYearEnd: config ? {
        month: config.month,
        day: config.day,
        monthName: config.monthName
      } : null,
      count: formatted.length,
      data: formatted
    });

  } catch (error) {
    console.error('Error fetching fiscal calendar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fiscal/translate
 * Translate between fiscal and calendar quarters
 */
router.get('/translate', (req, res) => {
  try {
    const { symbol, fiscalYear, fiscalQuarter, calendarYear, calendarQuarter } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'symbol is required'
      });
    }

    const company = database.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    let result;

    if (fiscalYear && fiscalQuarter) {
      // Translate fiscal to calendar
      result = fiscalService.fiscalToCalendar(
        company.id,
        parseInt(fiscalYear),
        parseInt(fiscalQuarter)
      );

      if (result) {
        res.json({
          success: true,
          direction: 'fiscal_to_calendar',
          input: { fiscalYear: parseInt(fiscalYear), fiscalQuarter: parseInt(fiscalQuarter) },
          output: result
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Could not translate fiscal period'
        });
      }

    } else if (calendarYear && calendarQuarter) {
      // Translate calendar to fiscal
      result = fiscalService.calendarToFiscal(
        company.id,
        parseInt(calendarYear),
        parseInt(calendarQuarter)
      );

      if (result) {
        res.json({
          success: true,
          direction: 'calendar_to_fiscal',
          input: { calendarYear: parseInt(calendarYear), calendarQuarter: parseInt(calendarQuarter) },
          output: result
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Could not translate calendar period'
        });
      }

    } else {
      res.status(400).json({
        success: false,
        error: 'Provide either (fiscalYear + fiscalQuarter) or (calendarYear + calendarQuarter)'
      });
    }

  } catch (error) {
    console.error('Error translating period:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fiscal/compare
 * Compare fiscal periods across companies for the same calendar period
 */
router.get('/compare', (req, res) => {
  try {
    const { symbols, calendarYear, calendarQuarter } = req.query;

    if (!symbols || !calendarYear || !calendarQuarter) {
      return res.status(400).json({
        success: false,
        error: 'symbols, calendarYear, and calendarQuarter are required'
      });
    }

    const symbolList = symbols.split(',').map(s => s.trim());

    const comparison = fiscalService.getComparablePeriods(
      symbolList,
      parseInt(calendarYear),
      parseInt(calendarQuarter)
    );

    // Group by symbol and add fiscal config context
    const grouped = comparison.map(c => ({
      symbol: c.symbol,
      name: c.name,
      fiscalYearEnd: c.fiscal_year_end,
      fiscalYearEndMonth: c.fiscal_year_end_month,
      fiscalYear: c.fiscal_year,
      fiscalPeriod: c.fiscal_period,
      periodStart: c.period_start,
      periodEnd: c.period_end,
      filedDate: c.filed_date
    }));

    res.json({
      success: true,
      calendarPeriod: `Q${calendarQuarter} ${calendarYear}`,
      count: grouped.length,
      data: grouped
    });

  } catch (error) {
    console.error('Error comparing periods:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fiscal/upcoming
 * Get upcoming fiscal period ends (potential earnings dates)
 */
router.get('/upcoming', (req, res) => {
  try {
    const { days = 30, limit = 100 } = req.query;

    const upcoming = fiscalService.getUpcomingPeriodEnds({
      days: parseInt(days),
      limit: parseInt(limit)
    });

    // Group by date
    const byDate = {};
    upcoming.forEach(u => {
      const date = u.period_end;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({
        symbol: u.symbol,
        name: u.name,
        sector: u.sector,
        fiscalYear: u.fiscal_year,
        fiscalPeriod: u.fiscal_period
      });
    });

    res.json({
      success: true,
      daysAhead: parseInt(days),
      count: upcoming.length,
      byDate,
      data: upcoming
    });

  } catch (error) {
    console.error('Error fetching upcoming periods:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fiscal/stats
 * Get fiscal year end distribution statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = fiscalService.getFiscalYearStats();

    // Calculate totals and percentages
    const total = stats.reduce((sum, s) => sum + s.company_count, 0);

    const withPercentage = stats.map(s => ({
      month: s.month,
      monthName: s.month_name,
      count: s.company_count,
      percentage: ((s.company_count / total) * 100).toFixed(1)
    }));

    res.json({
      success: true,
      totalCompanies: total,
      distribution: withPercentage
    });

  } catch (error) {
    console.error('Error fetching fiscal stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/fiscal/period-for-date/:symbol
 * Find which fiscal period contains a specific date
 */
router.get('/period-for-date/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date query parameter is required (YYYY-MM-DD)'
      });
    }

    const company = database.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    const period = fiscalService.findPeriodForDate(company.id, date);

    if (!period) {
      return res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        date,
        period: null,
        message: 'No fiscal period found for this date'
      });
    }

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      date,
      period: {
        fiscalYear: period.fiscal_year,
        fiscalPeriod: period.fiscal_period,
        periodStart: period.period_start,
        periodEnd: period.period_end,
        calendarQuarter: period.calendar_quarter,
        calendarYear: period.calendar_year
      }
    });

  } catch (error) {
    console.error('Error finding period for date:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
