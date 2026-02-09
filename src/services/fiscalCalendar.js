// src/services/fiscalCalendar.js
// Fiscal calendar service for quarter mapping and period translation

const { getDatabaseAsync } = require('../lib/db');

class FiscalCalendarService {
  constructor() {
    this.configCache = new Map(); // company_id -> fiscal config
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour
    this.lastCacheRefresh = 0;
  }

  /**
   * Get fiscal year end configuration for a company
   */
  async getFiscalConfig(companyId) {
    // Refresh cache if stale
    if (Date.now() - this.lastCacheRefresh > this.cacheTimeout) {
      this.configCache.clear();
      this.lastCacheRefresh = Date.now();
    }

    if (this.configCache.has(companyId)) {
      return this.configCache.get(companyId);
    }

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT fiscal_year_end, fiscal_year_end_month, fiscal_year_end_day
      FROM company_fiscal_config
      WHERE company_id = $1
    `, [companyId]);

    const config = result.rows[0];

    if (config) {
      this.configCache.set(companyId, config);
    }

    return config;
  }

  /**
   * Get fiscal year end for a company by symbol
   */
  async getFiscalYearEnd(symbol) {
    const database = await getDatabaseAsync();
    const queryResult = await database.query(`
      SELECT fc.fiscal_year_end, fc.fiscal_year_end_month, fc.fiscal_year_end_day
      FROM company_fiscal_config fc
      JOIN companies c ON c.id = fc.company_id
      WHERE c.symbol = $1
    `, [symbol.toUpperCase()]);

    const result = queryResult.rows[0];

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
  async calendarToFiscal(companyId, calendarYear, calendarQuarter) {
    const config = await this.getFiscalConfig(companyId);
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
  async fiscalToCalendar(companyId, fiscalYear, fiscalQuarter) {
    const config = await this.getFiscalConfig(companyId);
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
  async getFiscalCalendar(companyId, options = {}) {
    const database = await getDatabaseAsync();
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
      WHERE fc.company_id = $1
    `;

    const params = [companyId];
    let paramCounter = 2;

    if (fiscalYear) {
      query += ` AND fc.fiscal_year = $${paramCounter++}`;
      params.push(fiscalYear);
    }

    if (!includeFY) {
      query += ' AND fc.fiscal_period != \'FY\'';
    }

    query += ` ORDER BY fc.period_end DESC LIMIT $${paramCounter}`;
    params.push(limit);

    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Get fiscal calendar for a company by symbol
   */
  async getFiscalCalendarBySymbol(symbol, options = {}) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT id FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);

    const company = result.rows[0];

    if (!company) return null;

    return await this.getFiscalCalendar(company.id, options);
  }

  /**
   * Find the fiscal period that contains a specific date
   */
  async findPeriodForDate(companyId, date) {
    const database = await getDatabaseAsync();
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    const result = await database.query(`
      SELECT
        fc.fiscal_year,
        fc.fiscal_period,
        fc.period_start,
        fc.period_end,
        fc.calendar_quarter,
        fc.calendar_year
      FROM fiscal_calendar fc
      WHERE fc.company_id = $1
        AND fc.period_start <= $2
        AND fc.period_end >= $3
        AND fc.fiscal_period != 'FY'
      ORDER BY fc.period_end DESC
      LIMIT 1
    `, [companyId, dateStr, dateStr]);

    return result.rows[0];
  }

  /**
   * Get upcoming fiscal period ends (for earnings expectations)
   */
  async getUpcomingPeriodEnds(options = {}) {
    const database = await getDatabaseAsync();
    const { days = 30, limit = 100 } = options;

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await database.query(`
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
      WHERE fc.period_end >= $1
        AND fc.period_end <= $2
        AND fc.fiscal_period != 'FY'
        AND fc.filed_date IS NULL
      ORDER BY fc.period_end ASC
      LIMIT $3
    `, [today, futureDate, limit]);

    return result.rows;
  }

  /**
   * Compare fiscal periods across companies for the same calendar period
   */
  async getComparablePeriods(symbols, calendarYear, calendarQuarter) {
    const database = await getDatabaseAsync();
    const upperSymbols = symbols.map(s => s.toUpperCase());
    const placeholders = upperSymbols.map((_, i) => `$${i + 1}`).join(',');

    const result = await database.query(`
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
        AND fc.calendar_year = $${upperSymbols.length + 1}
        AND fc.calendar_quarter = $${upperSymbols.length + 2}
        AND fc.fiscal_period != 'FY'
      ORDER BY c.symbol
    `, [...upperSymbols, calendarYear, calendarQuarter]);

    return result.rows;
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
  async getFiscalYearStats() {
    const database = await getDatabaseAsync();

    const result = await database.query(`
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
    `);

    return result.rows;
  }
}

module.exports = FiscalCalendarService;
