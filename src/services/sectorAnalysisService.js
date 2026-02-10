// src/services/sectorAnalysisService.js
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');

/**
 * Sector Analysis Service
 *
 * Provides industry-level aggregations, sector rotation insights,
 * top performers by sector, and industry margin comparisons
 *
 * NOTE: For cross-currency comparison, we use market_cap_usd (USD-normalized)
 * instead of market_cap to ensure apples-to-apples sector aggregations.
 * Ratio metrics (ROIC, margins, PE, etc.) are already currency-agnostic.
 * When price_metrics table is missing (e.g. migration not yet run), falls back
 * to using companies.market_cap so sector endpoints still work.
 */
class SectorAnalysisService {
  constructor() {
    this._priceMetricsExists = null; // cached: true/false, null = not checked
  }

  /** Return true if price_metrics table exists (Postgres only). Cached per instance. */
  async _hasPriceMetrics() {
    if (this._priceMetricsExists !== null) return this._priceMetricsExists;
    if (!isUsingPostgres()) {
      this._priceMetricsExists = true;
      return true;
    }
    try {
      const database = await getDatabaseAsync();
      const r = await database.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'price_metrics'`
      );
      this._priceMetricsExists = (r.rows && r.rows.length > 0);
    } catch {
      this._priceMetricsExists = false;
    }
    return this._priceMetricsExists;
  }

  /**
   * Get all sectors with aggregate metrics
   */
  async getSectorOverview(periodType = 'annual') {
    const database = await getDatabaseAsync();
    const usePm = await this._hasPriceMetrics();
    // Use bounded averages to exclude extreme outliers
    const sql = usePm
      ? `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          pm.market_cap,
          pm.market_cap_usd
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector IS NOT NULL
      )
      SELECT
        sector,
        COUNT(DISTINCT symbol) as company_count,
        ROUND(AVG(CASE WHEN roic BETWEEN -50 AND 200 THEN roic END), 2) as avg_roic,
        ROUND(AVG(CASE WHEN roe BETWEEN -50 AND 200 THEN roe END), 2) as avg_roe,
        ROUND(AVG(CASE WHEN roa BETWEEN -50 AND 100 THEN roa END), 2) as avg_roa,
        ROUND(AVG(CASE WHEN gross_margin BETWEEN -50 AND 100 THEN gross_margin END), 2) as avg_gross_margin,
        ROUND(AVG(CASE WHEN operating_margin BETWEEN -50 AND 100 THEN operating_margin END), 2) as avg_operating_margin,
        ROUND(AVG(CASE WHEN net_margin BETWEEN -50 AND 100 THEN net_margin END), 2) as avg_net_margin,
        ROUND(AVG(CASE WHEN pe_ratio BETWEEN 0 AND 500 THEN pe_ratio END), 2) as avg_pe_ratio,
        ROUND(AVG(CASE WHEN pb_ratio BETWEEN 0 AND 50 THEN pb_ratio END), 2) as avg_pb_ratio,
        ROUND(AVG(CASE WHEN ev_ebitda BETWEEN 0 AND 100 THEN ev_ebitda END), 2) as avg_ev_ebitda,
        ROUND(AVG(CASE WHEN debt_to_equity BETWEEN 0 AND 10 THEN debt_to_equity END), 2) as avg_debt_to_equity,
        ROUND(AVG(CASE WHEN current_ratio BETWEEN 0 AND 20 THEN current_ratio END), 2) as avg_current_ratio,
        ROUND(AVG(CASE WHEN revenue_growth_yoy BETWEEN -100 AND 500 THEN revenue_growth_yoy END), 2) as avg_revenue_growth,
        ROUND(AVG(CASE WHEN earnings_growth_yoy BETWEEN -100 AND 500 THEN earnings_growth_yoy END), 2) as avg_earnings_growth,
        ROUND(AVG(CASE WHEN fcf_yield BETWEEN -100 AND 100 THEN fcf_yield END), 2) as avg_fcf_yield,
        ROUND(AVG(CASE WHEN fcf_margin BETWEEN -100 AND 100 THEN fcf_margin END), 2) as avg_fcf_margin,
        ROUND(SUM(COALESCE(market_cap_usd, market_cap)) / 1e9, 2) as total_market_cap_b,
        ROUND(AVG(data_quality_score), 1) as avg_quality_score
      FROM latest_metrics
      GROUP BY sector
      ORDER BY company_count DESC
    `
      : `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap as market_cap,
          c.market_cap as market_cap_usd
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector IS NOT NULL
      )
      SELECT
        sector,
        COUNT(DISTINCT symbol) as company_count,
        ROUND(AVG(CASE WHEN roic BETWEEN -50 AND 200 THEN roic END), 2) as avg_roic,
        ROUND(AVG(CASE WHEN roe BETWEEN -50 AND 200 THEN roe END), 2) as avg_roe,
        ROUND(AVG(CASE WHEN roa BETWEEN -50 AND 100 THEN roa END), 2) as avg_roa,
        ROUND(AVG(CASE WHEN gross_margin BETWEEN -50 AND 100 THEN gross_margin END), 2) as avg_gross_margin,
        ROUND(AVG(CASE WHEN operating_margin BETWEEN -50 AND 100 THEN operating_margin END), 2) as avg_operating_margin,
        ROUND(AVG(CASE WHEN net_margin BETWEEN -50 AND 100 THEN net_margin END), 2) as avg_net_margin,
        ROUND(AVG(CASE WHEN pe_ratio BETWEEN 0 AND 500 THEN pe_ratio END), 2) as avg_pe_ratio,
        ROUND(AVG(CASE WHEN pb_ratio BETWEEN 0 AND 50 THEN pb_ratio END), 2) as avg_pb_ratio,
        ROUND(AVG(CASE WHEN ev_ebitda BETWEEN 0 AND 100 THEN ev_ebitda END), 2) as avg_ev_ebitda,
        ROUND(AVG(CASE WHEN debt_to_equity BETWEEN 0 AND 10 THEN debt_to_equity END), 2) as avg_debt_to_equity,
        ROUND(AVG(CASE WHEN current_ratio BETWEEN 0 AND 20 THEN current_ratio END), 2) as avg_current_ratio,
        ROUND(AVG(CASE WHEN revenue_growth_yoy BETWEEN -100 AND 500 THEN revenue_growth_yoy END), 2) as avg_revenue_growth,
        ROUND(AVG(CASE WHEN earnings_growth_yoy BETWEEN -100 AND 500 THEN earnings_growth_yoy END), 2) as avg_earnings_growth,
        ROUND(AVG(CASE WHEN fcf_yield BETWEEN -100 AND 100 THEN fcf_yield END), 2) as avg_fcf_yield,
        ROUND(AVG(CASE WHEN fcf_margin BETWEEN -100 AND 100 THEN fcf_margin END), 2) as avg_fcf_margin,
        ROUND(SUM(COALESCE(market_cap_usd, market_cap)) / 1e9, 2) as total_market_cap_b,
        ROUND(AVG(data_quality_score), 1) as avg_quality_score
      FROM latest_metrics
      GROUP BY sector
      ORDER BY company_count DESC
    `;

    const result = await database.query(sql, [periodType, periodType]);
    const results = result.rows;

    // Enhance with medians (more robust to outliers than averages)
    return Promise.all(results.map(async sector => {
      const companies = await this.getSectorCompaniesForMedian(sector.sector, periodType);
      return {
        ...sector,
        median_roic: this.median(companies, 'roic'),
        median_roe: this.median(companies, 'roe'),
        median_net_margin: this.median(companies, 'net_margin'),
        median_pe_ratio: this.median(companies, 'pe_ratio'),
        median_revenue_growth: this.median(companies, 'revenue_growth')
      };
    }));
  }

  /**
   * Get industries within a sector with aggregate metrics
   */
  async getIndustriesBySector(sector, periodType = 'annual') {
    const database = await getDatabaseAsync();
    const usePm = await this._hasPriceMetrics();
    const sql = usePm
      ? `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          pm.market_cap,
          pm.market_cap_usd
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector = $3
          AND c.industry IS NOT NULL
      )
      SELECT
        industry,
        COUNT(DISTINCT symbol) as company_count,
        ROUND(AVG(CASE WHEN roic BETWEEN -50 AND 200 THEN roic END), 2) as avg_roic,
        ROUND(AVG(CASE WHEN roe BETWEEN -50 AND 200 THEN roe END), 2) as avg_roe,
        ROUND(AVG(CASE WHEN roa BETWEEN -50 AND 100 THEN roa END), 2) as avg_roa,
        ROUND(AVG(CASE WHEN gross_margin BETWEEN -50 AND 100 THEN gross_margin END), 2) as avg_gross_margin,
        ROUND(AVG(CASE WHEN operating_margin BETWEEN -50 AND 100 THEN operating_margin END), 2) as avg_operating_margin,
        ROUND(AVG(CASE WHEN net_margin BETWEEN -50 AND 100 THEN net_margin END), 2) as avg_net_margin,
        ROUND(AVG(CASE WHEN pe_ratio BETWEEN 0 AND 500 THEN pe_ratio END), 2) as avg_pe_ratio,
        ROUND(AVG(CASE WHEN pb_ratio BETWEEN 0 AND 50 THEN pb_ratio END), 2) as avg_pb_ratio,
        ROUND(AVG(CASE WHEN debt_to_equity BETWEEN 0 AND 10 THEN debt_to_equity END), 2) as avg_debt_to_equity,
        ROUND(AVG(CASE WHEN current_ratio BETWEEN 0 AND 20 THEN current_ratio END), 2) as avg_current_ratio,
        ROUND(AVG(CASE WHEN revenue_growth_yoy BETWEEN -100 AND 500 THEN revenue_growth_yoy END), 2) as avg_revenue_growth,
        ROUND(AVG(CASE WHEN fcf_yield BETWEEN -100 AND 100 THEN fcf_yield END), 2) as avg_fcf_yield,
        ROUND(SUM(COALESCE(market_cap_usd, market_cap)) / 1e9, 2) as total_market_cap_b
      FROM latest_metrics
      GROUP BY industry
      ORDER BY company_count DESC
    `
      : `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap as market_cap,
          c.market_cap as market_cap_usd
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector = $3
          AND c.industry IS NOT NULL
      )
      SELECT
        industry,
        COUNT(DISTINCT symbol) as company_count,
        ROUND(AVG(CASE WHEN roic BETWEEN -50 AND 200 THEN roic END), 2) as avg_roic,
        ROUND(AVG(CASE WHEN roe BETWEEN -50 AND 200 THEN roe END), 2) as avg_roe,
        ROUND(AVG(CASE WHEN roa BETWEEN -50 AND 100 THEN roa END), 2) as avg_roa,
        ROUND(AVG(CASE WHEN gross_margin BETWEEN -50 AND 100 THEN gross_margin END), 2) as avg_gross_margin,
        ROUND(AVG(CASE WHEN operating_margin BETWEEN -50 AND 100 THEN operating_margin END), 2) as avg_operating_margin,
        ROUND(AVG(CASE WHEN net_margin BETWEEN -50 AND 100 THEN net_margin END), 2) as avg_net_margin,
        ROUND(AVG(CASE WHEN pe_ratio BETWEEN 0 AND 500 THEN pe_ratio END), 2) as avg_pe_ratio,
        ROUND(AVG(CASE WHEN pb_ratio BETWEEN 0 AND 50 THEN pb_ratio END), 2) as avg_pb_ratio,
        ROUND(AVG(CASE WHEN debt_to_equity BETWEEN 0 AND 10 THEN debt_to_equity END), 2) as avg_debt_to_equity,
        ROUND(AVG(CASE WHEN current_ratio BETWEEN 0 AND 20 THEN current_ratio END), 2) as avg_current_ratio,
        ROUND(AVG(CASE WHEN revenue_growth_yoy BETWEEN -100 AND 500 THEN revenue_growth_yoy END), 2) as avg_revenue_growth,
        ROUND(AVG(CASE WHEN fcf_yield BETWEEN -100 AND 100 THEN fcf_yield END), 2) as avg_fcf_yield,
        ROUND(SUM(COALESCE(market_cap_usd, market_cap)) / 1e9, 2) as total_market_cap_b
      FROM latest_metrics
      GROUP BY industry
      ORDER BY company_count DESC
    `;

    const result = await database.query(sql, [periodType, periodType, sector]);
    return result.rows;
  }

  /**
   * Get top performers by sector
   */
  async getTopPerformersBySector(metric = 'roic', limit = 5, periodType = 'annual') {
    const database = await getDatabaseAsync();
    const validMetrics = [
      'roic', 'roe', 'roa', 'net_margin', 'operating_margin', 'gross_margin',
      'fcf_yield', 'fcf_margin', 'revenue_growth_yoy', 'earnings_growth_yoy'
    ];
    const safeMetric = validMetrics.includes(metric) ? metric : 'roic';
    const usePm = await this._hasPriceMetrics();

    const sql = usePm
      ? `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          COALESCE(pm.market_cap_usd, pm.market_cap, c.market_cap) as market_cap_usd
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        LEFT JOIN price_metrics pm ON c.id = pm.company_id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector IS NOT NULL
          AND m.${safeMetric} IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND COALESCE(pm.market_cap_usd, pm.market_cap, c.market_cap) IS NOT NULL
      ),
      ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY sector ORDER BY ${safeMetric} DESC) as rank
        FROM latest_metrics
      )
      SELECT
        sector,
        symbol,
        name,
        industry,
        ROUND(roic, 2) as roic,
        ROUND(roe, 2) as roe,
        ROUND(net_margin, 2) as net_margin,
        ROUND(operating_margin, 2) as operating_margin,
        ROUND(fcf_yield, 2) as fcf_yield,
        ROUND(revenue_growth_yoy, 2) as revenue_growth,
        ROUND(market_cap_usd / 1e9, 2) as market_cap_b,
        fiscal_period,
        rank
      FROM ranked
      WHERE rank <= $3
      ORDER BY sector, rank
    `
      : `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap as market_cap_usd
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector IS NOT NULL
          AND m.${safeMetric} IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND c.market_cap IS NOT NULL
      ),
      ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY sector ORDER BY ${safeMetric} DESC) as rank
        FROM latest_metrics
      )
      SELECT
        sector,
        symbol,
        name,
        industry,
        ROUND(roic, 2) as roic,
        ROUND(roe, 2) as roe,
        ROUND(net_margin, 2) as net_margin,
        ROUND(operating_margin, 2) as operating_margin,
        ROUND(fcf_yield, 2) as fcf_yield,
        ROUND(revenue_growth_yoy, 2) as revenue_growth,
        ROUND(market_cap_usd / 1e9, 2) as market_cap_b,
        fiscal_period,
        rank
      FROM ranked
      WHERE rank <= $3
      ORDER BY sector, rank
    `;

    const result = await database.query(sql, [periodType, periodType, limit]);
    const results = result.rows;

    // Group by sector
    const grouped = {};
    results.forEach(row => {
      if (!grouped[row.sector]) {
        grouped[row.sector] = [];
      }
      grouped[row.sector].push(row);
    });

    return grouped;
  }

  /**
   * Get sector rotation data - historical performance by sector
   */
  async getSectorRotation(periods = 4, periodType = 'annual') {
    const database = await getDatabaseAsync();
    // First get the distinct periods that have actual data
    // Focus on main fiscal year endings with significant company counts
    const periodsQuery = `
      SELECT fiscal_period, COUNT(*) as company_count
      FROM calculated_metrics
      WHERE period_type = $1
        AND roic IS NOT NULL
        AND fiscal_period <= CURRENT_DATE
        AND fiscal_period >= CURRENT_DATE - INTERVAL '10 years'
      GROUP BY fiscal_period
      HAVING COUNT(*) >= 100
      ORDER BY fiscal_period DESC
      LIMIT $2
    `;
    const periodsResult = await database.query(periodsQuery, [periodType, periods]);
    const targetPeriods = periodsResult.rows;

    if (targetPeriods.length === 0) {
      return [];
    }

    const periodList = targetPeriods.map(p => p.fiscal_period);
    let paramCounter = 2;
    const placeholders = periodList.map(() => `$${paramCounter++}`).join(',');

    const sql = `
      WITH sector_periods AS (
        SELECT
          c.sector,
          m.fiscal_period,
          COUNT(DISTINCT c.symbol) as company_count,
          ROUND(AVG(CASE WHEN m.roic BETWEEN -50 AND 200 THEN m.roic END), 2) as avg_roic,
          ROUND(AVG(CASE WHEN m.roe BETWEEN -50 AND 200 THEN m.roe END), 2) as avg_roe,
          ROUND(AVG(CASE WHEN m.net_margin BETWEEN -50 AND 100 THEN m.net_margin END), 2) as avg_net_margin,
          ROUND(AVG(CASE WHEN m.revenue_growth_yoy BETWEEN -100 AND 500 THEN m.revenue_growth_yoy END), 2) as avg_revenue_growth,
          ROUND(AVG(CASE WHEN m.fcf_yield BETWEEN -100 AND 100 THEN m.fcf_yield END), 2) as avg_fcf_yield
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND c.sector IS NOT NULL
          AND m.fiscal_period IN (${placeholders})
        GROUP BY c.sector, m.fiscal_period
      )
      SELECT *
      FROM sector_periods
      ORDER BY sector, fiscal_period DESC
    `;

    const result = await database.query(sql, [periodType, ...periodList]);
    const results = result.rows;

    // Group by sector with period history
    const grouped = {};
    results.forEach(row => {
      if (!grouped[row.sector]) {
        grouped[row.sector] = {
          sector: row.sector,
          periods: []
        };
      }
      grouped[row.sector].periods.push({
        fiscal_period: row.fiscal_period,
        company_count: row.company_count,
        avg_roic: row.avg_roic,
        avg_roe: row.avg_roe,
        avg_net_margin: row.avg_net_margin,
        avg_revenue_growth: row.avg_revenue_growth,
        avg_fcf_yield: row.avg_fcf_yield
      });
    });

    // Calculate trends for each sector
    Object.values(grouped).forEach(sector => {
      if (sector.periods.length >= 2) {
        const latest = sector.periods[0];
        const previous = sector.periods[1];

        sector.trends = {
          roic_change: latest.avg_roic && previous.avg_roic
            ? +(latest.avg_roic - previous.avg_roic).toFixed(2) : null,
          roe_change: latest.avg_roe && previous.avg_roe
            ? +(latest.avg_roe - previous.avg_roe).toFixed(2) : null,
          margin_change: latest.avg_net_margin && previous.avg_net_margin
            ? +(latest.avg_net_margin - previous.avg_net_margin).toFixed(2) : null,
          growth_change: latest.avg_revenue_growth && previous.avg_revenue_growth
            ? +(latest.avg_revenue_growth - previous.avg_revenue_growth).toFixed(2) : null
        };

        // Determine overall trend
        const positiveChanges = [
          sector.trends.roic_change > 0,
          sector.trends.roe_change > 0,
          sector.trends.margin_change > 0
        ].filter(Boolean).length;

        sector.momentum = positiveChanges >= 2 ? 'IMPROVING' :
                          positiveChanges === 1 ? 'MIXED' : 'DECLINING';
      }
    });

    return Object.values(grouped);
  }

  /**
   * Compare margins across industries
   */
  async getIndustryMarginComparison(periodType = 'annual') {
    const database = await getDatabaseAsync();
    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.industry IS NOT NULL
      )
      SELECT
        sector,
        industry,
        COUNT(DISTINCT symbol) as company_count,

        -- Margin metrics (bounded to exclude extreme outliers)
        ROUND(AVG(CASE WHEN gross_margin BETWEEN -100 AND 100 THEN gross_margin END), 2) as avg_gross_margin,
        ROUND(MIN(CASE WHEN gross_margin BETWEEN -100 AND 100 THEN gross_margin END), 2) as min_gross_margin,
        ROUND(MAX(CASE WHEN gross_margin BETWEEN -100 AND 100 THEN gross_margin END), 2) as max_gross_margin,

        ROUND(AVG(CASE WHEN operating_margin BETWEEN -100 AND 100 THEN operating_margin END), 2) as avg_operating_margin,
        ROUND(MIN(CASE WHEN operating_margin BETWEEN -100 AND 100 THEN operating_margin END), 2) as min_operating_margin,
        ROUND(MAX(CASE WHEN operating_margin BETWEEN -100 AND 100 THEN operating_margin END), 2) as max_operating_margin,

        ROUND(AVG(CASE WHEN net_margin BETWEEN -100 AND 100 THEN net_margin END), 2) as avg_net_margin,
        ROUND(MIN(CASE WHEN net_margin BETWEEN -100 AND 100 THEN net_margin END), 2) as min_net_margin,
        ROUND(MAX(CASE WHEN net_margin BETWEEN -100 AND 100 THEN net_margin END), 2) as max_net_margin,

        ROUND(AVG(CASE WHEN fcf_margin BETWEEN -100 AND 100 THEN fcf_margin END), 2) as avg_fcf_margin

      FROM latest_metrics
      GROUP BY sector, industry
      HAVING COUNT(DISTINCT symbol) >= 2
      ORDER BY avg_net_margin DESC
    `;

    const result = await database.query(sql, [periodType, periodType]);
    return result.rows;
  }

  /**
   * Get detailed sector data with all companies
   */
  async getSectorDetail(sector, periodType = 'annual') {
    const database = await getDatabaseAsync();
    const usePm = await this._hasPriceMetrics();
    const sql = usePm
      ? `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap,
          pm.last_price,
          pm.change_1d,
          pm.change_1w,
          pm.change_1m,
          pm.change_ytd,
          pm.change_1y,
          pm.high_52w,
          pm.low_52w
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector = $3
      )
      SELECT
        symbol,
        name,
        industry,
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,
        ROUND(last_price, 2) as current_price,
        ROUND(change_1d, 2) as change_1d,
        ROUND(change_1w, 2) as change_1w,
        ROUND(change_1m, 2) as change_1m,
        ROUND(change_ytd, 2) as change_ytd,
        ROUND(change_1y, 2) as change_1y,
        ROUND(high_52w, 2) as high_52w,
        ROUND(low_52w, 2) as low_52w,
        ROUND(roic, 2) as roic,
        ROUND(roe, 2) as roe,
        ROUND(roa, 2) as roa,
        ROUND(gross_margin, 2) as gross_margin,
        ROUND(operating_margin, 2) as operating_margin,
        ROUND(net_margin, 2) as net_margin,
        ROUND(pe_ratio, 2) as pe_ratio,
        ROUND(pb_ratio, 2) as pb_ratio,
        ROUND(ev_ebitda, 2) as ev_ebitda,
        ROUND(debt_to_equity, 2) as debt_to_equity,
        ROUND(current_ratio, 2) as current_ratio,
        ROUND(revenue_growth_yoy, 2) as revenue_growth,
        ROUND(earnings_growth_yoy, 2) as earnings_growth,
        ROUND(fcf_yield, 2) as fcf_yield,
        ROUND(fcf_margin, 2) as fcf_margin,
        data_quality_score as quality_score
      FROM latest_metrics
      ORDER BY market_cap DESC
    `
      : `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap,
          NULL::numeric as last_price,
          NULL::numeric as change_1d,
          NULL::numeric as change_1w,
          NULL::numeric as change_1m,
          NULL::numeric as change_ytd,
          NULL::numeric as change_1y,
          NULL::numeric as high_52w,
          NULL::numeric as low_52w
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.sector = $3
      )
      SELECT
        symbol,
        name,
        industry,
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,
        ROUND(last_price, 2) as current_price,
        ROUND(change_1d, 2) as change_1d,
        ROUND(change_1w, 2) as change_1w,
        ROUND(change_1m, 2) as change_1m,
        ROUND(change_ytd, 2) as change_ytd,
        ROUND(change_1y, 2) as change_1y,
        ROUND(high_52w, 2) as high_52w,
        ROUND(low_52w, 2) as low_52w,

        -- Profitability
        ROUND(roic, 2) as roic,
        ROUND(roe, 2) as roe,
        ROUND(roa, 2) as roa,

        -- Margins
        ROUND(gross_margin, 2) as gross_margin,
        ROUND(operating_margin, 2) as operating_margin,
        ROUND(net_margin, 2) as net_margin,

        -- Valuation
        ROUND(pe_ratio, 2) as pe_ratio,
        ROUND(pb_ratio, 2) as pb_ratio,
        ROUND(ev_ebitda, 2) as ev_ebitda,

        -- Financial Health
        ROUND(debt_to_equity, 2) as debt_to_equity,
        ROUND(current_ratio, 2) as current_ratio,

        -- Growth
        ROUND(revenue_growth_yoy, 2) as revenue_growth,
        ROUND(earnings_growth_yoy, 2) as earnings_growth,

        -- Cash Flow
        ROUND(fcf_yield, 2) as fcf_yield,
        ROUND(fcf_margin, 2) as fcf_margin,

        data_quality_score as quality_score

      FROM latest_metrics
      ORDER BY market_cap DESC
    `;

    const result = await database.query(sql, [periodType, periodType, sector]);
    const companies = result.rows;

    // Calculate sector aggregates with both average and median
    const aggregate = {
      company_count: companies.length,
      // Averages
      avg_roic: this.avg(companies, 'roic'),
      avg_roe: this.avg(companies, 'roe'),
      avg_net_margin: this.avg(companies, 'net_margin'),
      avg_operating_margin: this.avg(companies, 'operating_margin'),
      avg_pe_ratio: this.avg(companies, 'pe_ratio'),
      avg_debt_to_equity: this.avg(companies, 'debt_to_equity'),
      avg_revenue_growth: this.avg(companies, 'revenue_growth'),
      avg_fcf_yield: this.avg(companies, 'fcf_yield'),
      total_market_cap_b: this.sum(companies, 'market_cap_b'),
      // Medians (for metrics where outliers significantly skew averages)
      median_roic: this.median(companies, 'roic'),
      median_pe_ratio: this.median(companies, 'pe_ratio'),
      median_net_margin: this.median(companies, 'net_margin'),
      median_debt_to_equity: this.median(companies, 'debt_to_equity'),
      median_revenue_growth: this.median(companies, 'revenue_growth'),
      median_fcf_yield: this.median(companies, 'fcf_yield')
    };

    return {
      sector,
      aggregate,
      companies
    };
  }

  /**
   * Get industry detail with all companies
   */
  async getIndustryDetail(industry, periodType = 'annual') {
    const database = await getDatabaseAsync();
    const usePm = await this._hasPriceMetrics();
    const sql = usePm
      ? `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap,
          pm.last_price,
          pm.change_1d,
          pm.change_1w,
          pm.change_ytd,
          pm.change_1y
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.industry = $3
      )
      SELECT
        symbol,
        name,
        sector,
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,
        ROUND(last_price, 2) as current_price,
        ROUND(change_1d, 2) as change_1d,
        ROUND(change_1w, 2) as change_1w,
        ROUND(change_ytd, 2) as change_ytd,
        ROUND(change_1y, 2) as change_1y,
        ROUND(roic, 2) as roic,
        ROUND(roe, 2) as roe,
        ROUND(gross_margin, 2) as gross_margin,
        ROUND(operating_margin, 2) as operating_margin,
        ROUND(net_margin, 2) as net_margin,
        ROUND(pe_ratio, 2) as pe_ratio,
        ROUND(debt_to_equity, 2) as debt_to_equity,
        ROUND(revenue_growth_yoy, 2) as revenue_growth,
        ROUND(fcf_yield, 2) as fcf_yield,
        data_quality_score as quality_score
      FROM latest_metrics
      ORDER BY market_cap DESC
    `
      : `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap,
          NULL::numeric as last_price,
          NULL::numeric as change_1d,
          NULL::numeric as change_1w,
          NULL::numeric as change_ytd,
          NULL::numeric as change_1y
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = $1
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = $2
          )
          AND c.industry = $3
      )
      SELECT
        symbol,
        name,
        sector,
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,
        ROUND(last_price, 2) as current_price,
        ROUND(change_1d, 2) as change_1d,
        ROUND(change_1w, 2) as change_1w,
        ROUND(change_ytd, 2) as change_ytd,
        ROUND(change_1y, 2) as change_1y,
        ROUND(roic, 2) as roic,
        ROUND(roe, 2) as roe,
        ROUND(gross_margin, 2) as gross_margin,
        ROUND(operating_margin, 2) as operating_margin,
        ROUND(net_margin, 2) as net_margin,
        ROUND(pe_ratio, 2) as pe_ratio,
        ROUND(debt_to_equity, 2) as debt_to_equity,
        ROUND(revenue_growth_yoy, 2) as revenue_growth,
        ROUND(fcf_yield, 2) as fcf_yield,
        data_quality_score as quality_score
      FROM latest_metrics
      ORDER BY market_cap DESC
    `;

    const result = await database.query(sql, [periodType, periodType, industry]);
    const companies = result.rows;

    const aggregate = {
      company_count: companies.length,
      sector: companies[0]?.sector,
      // Averages
      avg_roic: this.avg(companies, 'roic'),
      avg_roe: this.avg(companies, 'roe'),
      avg_net_margin: this.avg(companies, 'net_margin'),
      avg_operating_margin: this.avg(companies, 'operating_margin'),
      avg_pe_ratio: this.avg(companies, 'pe_ratio'),
      avg_debt_to_equity: this.avg(companies, 'debt_to_equity'),
      avg_revenue_growth: this.avg(companies, 'revenue_growth'),
      avg_fcf_yield: this.avg(companies, 'fcf_yield'),
      total_market_cap_b: this.sum(companies, 'market_cap_b'),
      // Medians (for metrics where outliers significantly skew averages)
      median_roic: this.median(companies, 'roic'),
      median_pe_ratio: this.median(companies, 'pe_ratio'),
      median_net_margin: this.median(companies, 'net_margin'),
      median_debt_to_equity: this.median(companies, 'debt_to_equity'),
      median_revenue_growth: this.median(companies, 'revenue_growth'),
      median_fcf_yield: this.median(companies, 'fcf_yield')
    };

    return {
      industry,
      aggregate,
      companies
    };
  }

  /**
   * Get sector rankings by various metrics
   */
  async getSectorRankings(periodType = 'annual') {
    const sectors = await this.getSectorOverview(periodType);

    const rankings = {
      by_roic: [...sectors].sort((a, b) => (b.avg_roic || 0) - (a.avg_roic || 0)),
      by_growth: [...sectors].sort((a, b) => (b.avg_revenue_growth || 0) - (a.avg_revenue_growth || 0)),
      by_margin: [...sectors].sort((a, b) => (b.avg_net_margin || 0) - (a.avg_net_margin || 0)),
      by_valuation: [...sectors].sort((a, b) => (a.avg_pe_ratio || 999) - (b.avg_pe_ratio || 999)),
      by_fcf_yield: [...sectors].sort((a, b) => (b.avg_fcf_yield || 0) - (a.avg_fcf_yield || 0)),
      by_leverage: [...sectors].sort((a, b) => (a.avg_debt_to_equity || 999) - (b.avg_debt_to_equity || 999))
    };

    return rankings;
  }

  /**
   * Get company metrics for a specific sector (used for median calculations)
   */
  async getSectorCompaniesForMedian(sector, periodType = 'annual') {
    const database = await getDatabaseAsync();
    const sql = `
      SELECT
        m.roic,
        m.roe,
        m.net_margin,
        m.pe_ratio,
        m.revenue_growth_yoy as revenue_growth
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE m.period_type = $1
        AND c.sector = $2
        AND m.fiscal_period = (
          SELECT MAX(m2.fiscal_period)
          FROM calculated_metrics m2
          WHERE m2.company_id = m.company_id
            AND m2.period_type = $3
        )
    `;
    const result = await database.query(sql, [periodType, sector, periodType]);
    return result.rows;
  }

  // Helper methods
  // Outlier bounds for different metric types
  // Tightened bounds for profitability metrics to exclude deeply distressed companies
  // that skew averages and don't represent typical sector performance
  static BOUNDS = {
    roic: [-50, 200],           // Tightened from -100 (excludes deeply distressed)
    roe: [-50, 200],            // Tightened from -100
    roa: [-50, 100],            // Tightened from -100
    net_margin: [-50, 100],     // Tightened from -100
    operating_margin: [-50, 100], // Tightened from -100
    gross_margin: [-50, 100],   // Tightened from -100
    fcf_yield: [-100, 100],
    fcf_margin: [-100, 100],
    pe_ratio: [0, 500],
    pb_ratio: [0, 50],
    ev_ebitda: [0, 100],
    debt_to_equity: [0, 10],
    current_ratio: [0, 20],
    revenue_growth: [-100, 500],
    earnings_growth: [-100, 500]
  };

  avg(arr, field) {
    const bounds = SectorAnalysisService.BOUNDS[field] || [-Infinity, Infinity];
    const values = arr.map(x => x[field])
      .filter(v => v !== null && v !== undefined && v >= bounds[0] && v <= bounds[1]);
    if (values.length === 0) return null;
    return +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
  }

  median(arr, field) {
    const bounds = SectorAnalysisService.BOUNDS[field] || [-Infinity, Infinity];
    const values = arr.map(x => x[field])
      .filter(v => v !== null && v !== undefined && v >= bounds[0] && v <= bounds[1])
      .sort((a, b) => a - b);
    if (values.length === 0) return null;
    const mid = Math.floor(values.length / 2);
    if (values.length % 2 === 0) {
      return +((values[mid - 1] + values[mid]) / 2).toFixed(2);
    }
    return +values[mid].toFixed(2);
  }

  sum(arr, field) {
    const values = arr.map(x => x[field]).filter(v => v !== null && v !== undefined);
    return +(values.reduce((a, b) => a + b, 0)).toFixed(2);
  }
}

module.exports = SectorAnalysisService;
