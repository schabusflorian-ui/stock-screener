// src/services/fiscalCalendar.js
// Fiscal calendar service for quarter mapping and period translation

class FiscalCalendarService {
  constructor(db) {
    this.db = db;
    this.configCache = new Map(); // company_id -> fiscal config
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour
    this.lastCacheRefresh = 0;
  }

  /**
   * Get fiscal year end configuration for a company
   */
  getFiscalConfig(companyId) {
    // Refresh cache if stale
    if (Date.now() - this.lastCacheRefresh > this.cacheTimeout) {
      this.configCache.clear();
      this.lastCacheRefresh = Date.now();
    }

    if (this.configCache.has(companyId)) {
      return this.configCache.get(companyId);
    }

    const config = this.db.prepare(`
      SELECT fiscal_year_end, fiscal_year_end_month, fiscal_year_end_day
      FROM company_fiscal_config
      WHERE company_id = ?
    `).get(companyId);

    if (config) {
      this.configCache.set(companyId, config);
    }

    return config;
  }

  /**
   * Get fiscal year end for a company by symbol
   */
  getFiscalYearEnd(symbol) {
    const result = this.db.prepare(`
      SELECT fc.fiscal_year_end, fc.fiscal_year_end_month, fc.fiscal_year_end_day
      FROM company_fiscal_config fc
      JOIN companies c ON c.id = fc.company_id
      WHERE c.symbol = ?
    `).get(symbol.toUpperCase());

    if (!result) return null;

    return {
      monthDay: result.fiscal_year_end, // "0930"
      month: result.fiscal_year_end_month,
      day: result.fiscal_year_end_day,
      monthName: this.getMonthName(result.fiscal_year_end_month)
    };
  }

  /**
   * Convert calendar quarter to fiscal quarter for a company
   */
  calendarToFiscal(companyId, calendarYear, calendarQuarter) {
    const config = this.getFiscalConfig(companyId);
    if (!config) return null;

    const fyeMonth = config.fiscal_year_end_month;

    // Calculate fiscal quarter based on fiscal year end month
    // Fiscal Q1 starts the month after fiscal year end
    const fyQ1StartMonth = (fyeMonth % 12) + 1;

    // Map calendar quarter end months: Q1=3, Q2=6, Q3=9, Q4=12
    const calQuarterEndMonth = calendarQuarter * 3;

    // Calculate months since fiscal year start
    let monthsFromFYStart = calQuarterEndMonth - fyQ1StartMonth;
    if (monthsFromFYStart < 0) monthsFromFYStart += 12;

    // Fiscal quarter (1-4)
    const fiscalQuarter = Math.floor(monthsFromFYStart / 3) + 1;

    // Fiscal year: if calendar month is after FYE month, it's next fiscal year
    let fiscalYear = calendarYear;
    if (calQuarterEndMonth > fyeMonth) {
      fiscalYear = calendarYear + 1;
    }

    return {
      fiscalYear,
      fiscalQuarter,
      fiscalPeriod: `Q${fiscalQuarter}`
    };
  }

  /**
   * Convert fiscal quarter to calendar quarter(s) for a company
   */
  fiscalToCalendar(companyId, fiscalYear, fiscalQuarter) {
    const config = this.getFiscalConfig(companyId);
    if (!config) return null;

    const fyeMonth = config.fiscal_year_end_month;

    // Fiscal Q1 starts the month after fiscal year end
    const fyQ1StartMonth = (fyeMonth % 12) + 1;

    // Calculate the end month of the fiscal quarter
    let quarterEndMonth = fyQ1StartMonth + (fiscalQuarter * 3) - 1;
    if (quarterEndMonth > 12) quarterEndMonth -= 12;

    // Determine calendar year
    let calendarYear = fiscalYear;
    if (quarterEndMonth <= fyeMonth) {
      calendarYear = fiscalYear; // Same calendar year as fiscal year end
    } else {
      calendarYear = fiscalYear - 1; // Previous calendar year
    }

    // Calendar quarter
    const calendarQuarter = Math.ceil(quarterEndMonth / 3);

    return {
      calendarYear,
      calendarQuarter,
      calendarPeriod: `Q${calendarQuarter} ${calendarYear}`,
      periodEndMonth: quarterEndMonth
    };
  }

  /**
   * Get the fiscal calendar for a company
   */
  getFiscalCalendar(companyId, options = {}) {
    const { limit = 20, fiscalYear, includeFY = true } = options;

    let query = `
      SELECT
        fc.fiscal_year,
        fc.fiscal_period,
        fc.period_start,
        fc.period_end,
        fc.filed_date,
        fc.form,
        fc.calendar_quarter,
        fc.calendar_year,
        cfg.fiscal_year_end,
        cfg.fiscal_year_end_month
      FROM fiscal_calendar fc
      JOIN company_fiscal_config cfg ON cfg.company_id = fc.company_id
      WHERE fc.company_id = ?
    `;

    const params = [companyId];

    if (fiscalYear) {
      query += ` AND fc.fiscal_year = ?`;
      params.push(fiscalYear);
    }

    if (!includeFY) {
      query += ` AND fc.fiscal_period != 'FY'`;
    }

    query += ` ORDER BY fc.period_end DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get fiscal calendar for a company by symbol
   */
  getFiscalCalendarBySymbol(symbol, options = {}) {
    const company = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(symbol.toUpperCase());

    if (!company) return null;

    return this.getFiscalCalendar(company.id, options);
  }

  /**
   * Find the fiscal period that contains a specific date
   */
  findPeriodForDate(companyId, date) {
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    return this.db.prepare(`
      SELECT
        fc.fiscal_year,
        fc.fiscal_period,
        fc.period_start,
        fc.period_end,
        fc.calendar_quarter,
        fc.calendar_year
      FROM fiscal_calendar fc
      WHERE fc.company_id = ?
        AND fc.period_start <= ?
        AND fc.period_end >= ?
        AND fc.fiscal_period != 'FY'
      ORDER BY fc.period_end DESC
      LIMIT 1
    `).get(companyId, dateStr, dateStr);
  }

  /**
   * Get upcoming fiscal period ends (for earnings expectations)
   */
  getUpcomingPeriodEnds(options = {}) {
    const { days = 30, limit = 100 } = options;

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return this.db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name,
        c.sector,
        fc.fiscal_year,
        fc.fiscal_period,
        fc.period_end,
        fc.filed_date,
        cfg.fiscal_year_end_month
      FROM fiscal_calendar fc
      JOIN companies c ON c.id = fc.company_id
      JOIN company_fiscal_config cfg ON cfg.company_id = c.id
      WHERE fc.period_end >= ?
        AND fc.period_end <= ?
        AND fc.fiscal_period != 'FY'
        AND fc.filed_date IS NULL
      ORDER BY fc.period_end ASC
      LIMIT ?
    `).all(today, futureDate, limit);
  }

  /**
   * Compare fiscal periods across companies for the same calendar period
   */
  getComparablePeriods(symbols, calendarYear, calendarQuarter) {
    const placeholders = symbols.map(() => '?').join(',');

    return this.db.prepare(`
      SELECT
        c.symbol,
        c.name,
        fc.fiscal_year,
        fc.fiscal_period,
        fc.period_start,
        fc.period_end,
        fc.filed_date,
        cfg.fiscal_year_end,
        cfg.fiscal_year_end_month
      FROM fiscal_calendar fc
      JOIN companies c ON c.id = fc.company_id
      JOIN company_fiscal_config cfg ON cfg.company_id = c.id
      WHERE c.symbol IN (${placeholders})
        AND fc.calendar_year = ?
        AND fc.calendar_quarter = ?
        AND fc.fiscal_period != 'FY'
      ORDER BY c.symbol
    `).all(...symbols.map(s => s.toUpperCase()), calendarYear, calendarQuarter);
  }

  /**
   * Get month name from month number
   */
  getMonthName(month) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month - 1] || '';
  }

  /**
   * Format fiscal period label
   */
  formatFiscalPeriod(fiscalYear, fiscalPeriod, periodEnd) {
    const endDate = new Date(periodEnd);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = months[endDate.getMonth()];

    return {
      short: `FY${fiscalYear} ${fiscalPeriod}`,
      long: `FY${fiscalYear} ${fiscalPeriod} (ends ${monthName} ${endDate.getFullYear()})`,
      calendar: `${monthName} ${endDate.getFullYear()}`
    };
  }

  /**
   * Get fiscal year summary statistics
   */
  getFiscalYearStats() {
    return this.db.prepare(`
      SELECT
        fiscal_year_end_month as month,
        COUNT(*) as company_count,
        CASE fiscal_year_end_month
          WHEN 1 THEN 'January'
          WHEN 2 THEN 'February'
          WHEN 3 THEN 'March'
          WHEN 4 THEN 'April'
          WHEN 5 THEN 'May'
          WHEN 6 THEN 'June'
          WHEN 7 THEN 'July'
          WHEN 8 THEN 'August'
          WHEN 9 THEN 'September'
          WHEN 10 THEN 'October'
          WHEN 11 THEN 'November'
          WHEN 12 THEN 'December'
        END as month_name
      FROM company_fiscal_config
      GROUP BY fiscal_year_end_month
      ORDER BY company_count DESC
    `).all();
  }
}

module.exports = FiscalCalendarService;
