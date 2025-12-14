// src/services/sectorAnalysisService.js
const db = require('../database');

/**
 * Sector Analysis Service
 *
 * Provides industry-level aggregations, sector rotation insights,
 * top performers by sector, and industry margin comparisons
 */
class SectorAnalysisService {
  constructor() {
    this.db = db.getDatabase();
    console.log('✅ Sector Analysis Service initialized');
  }

  /**
   * Get all sectors with aggregate metrics
   */
  getSectorOverview(periodType = 'annual') {
    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = ?
          )
          AND c.sector IS NOT NULL
      )
      SELECT
        sector,
        COUNT(DISTINCT symbol) as company_count,

        -- Profitability
        ROUND(AVG(roic), 2) as avg_roic,
        ROUND(AVG(roe), 2) as avg_roe,
        ROUND(AVG(roa), 2) as avg_roa,

        -- Margins
        ROUND(AVG(gross_margin), 2) as avg_gross_margin,
        ROUND(AVG(operating_margin), 2) as avg_operating_margin,
        ROUND(AVG(net_margin), 2) as avg_net_margin,

        -- Valuation
        ROUND(AVG(pe_ratio), 2) as avg_pe_ratio,
        ROUND(AVG(pb_ratio), 2) as avg_pb_ratio,
        ROUND(AVG(ev_ebitda), 2) as avg_ev_ebitda,

        -- Financial Health
        ROUND(AVG(debt_to_equity), 2) as avg_debt_to_equity,
        ROUND(AVG(current_ratio), 2) as avg_current_ratio,

        -- Growth
        ROUND(AVG(revenue_growth_yoy), 2) as avg_revenue_growth,
        ROUND(AVG(earnings_growth_yoy), 2) as avg_earnings_growth,

        -- Cash Flow
        ROUND(AVG(fcf_yield), 2) as avg_fcf_yield,
        ROUND(AVG(fcf_margin), 2) as avg_fcf_margin,

        -- Market Cap totals
        ROUND(SUM(market_cap) / 1e9, 2) as total_market_cap_b,

        -- Quality
        ROUND(AVG(data_quality_score), 1) as avg_quality_score

      FROM latest_metrics
      GROUP BY sector
      ORDER BY company_count DESC
    `;

    return this.db.prepare(sql).all(periodType, periodType);
  }

  /**
   * Get industries within a sector with aggregate metrics
   */
  getIndustriesBySector(sector, periodType = 'annual') {
    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = ?
          )
          AND c.sector = ?
          AND c.industry IS NOT NULL
      )
      SELECT
        industry,
        COUNT(DISTINCT symbol) as company_count,

        -- Profitability
        ROUND(AVG(roic), 2) as avg_roic,
        ROUND(AVG(roe), 2) as avg_roe,
        ROUND(AVG(roa), 2) as avg_roa,

        -- Margins
        ROUND(AVG(gross_margin), 2) as avg_gross_margin,
        ROUND(AVG(operating_margin), 2) as avg_operating_margin,
        ROUND(AVG(net_margin), 2) as avg_net_margin,

        -- Valuation
        ROUND(AVG(pe_ratio), 2) as avg_pe_ratio,
        ROUND(AVG(pb_ratio), 2) as avg_pb_ratio,

        -- Financial Health
        ROUND(AVG(debt_to_equity), 2) as avg_debt_to_equity,
        ROUND(AVG(current_ratio), 2) as avg_current_ratio,

        -- Growth
        ROUND(AVG(revenue_growth_yoy), 2) as avg_revenue_growth,

        -- Cash Flow
        ROUND(AVG(fcf_yield), 2) as avg_fcf_yield,

        -- Market Cap
        ROUND(SUM(market_cap) / 1e9, 2) as total_market_cap_b

      FROM latest_metrics
      GROUP BY industry
      ORDER BY company_count DESC
    `;

    return this.db.prepare(sql).all(periodType, periodType, sector);
  }

  /**
   * Get top performers by sector
   */
  getTopPerformersBySector(metric = 'roic', limit = 5, periodType = 'annual') {
    // Validate metric to prevent SQL injection
    const validMetrics = [
      'roic', 'roe', 'roa', 'net_margin', 'operating_margin', 'gross_margin',
      'fcf_yield', 'fcf_margin', 'revenue_growth_yoy', 'earnings_growth_yoy'
    ];
    const safeMetric = validMetrics.includes(metric) ? metric : 'roic';

    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = ?
          )
          AND c.sector IS NOT NULL
          AND m.${safeMetric} IS NOT NULL
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
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,
        rank
      FROM ranked
      WHERE rank <= ?
      ORDER BY sector, rank
    `;

    const results = this.db.prepare(sql).all(periodType, periodType, limit);

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
  getSectorRotation(periods = 4, periodType = 'annual') {
    // First get the distinct periods we want to analyze
    const periodsQuery = `
      SELECT DISTINCT fiscal_period
      FROM calculated_metrics
      WHERE period_type = ?
        AND fiscal_period <= date('now')
        AND fiscal_period >= date('now', '-10 years')
      ORDER BY fiscal_period DESC
      LIMIT ?
    `;
    const targetPeriods = this.db.prepare(periodsQuery).all(periodType, periods);

    if (targetPeriods.length === 0) {
      return [];
    }

    const periodList = targetPeriods.map(p => p.fiscal_period);
    const placeholders = periodList.map(() => '?').join(',');

    const sql = `
      WITH sector_periods AS (
        SELECT
          c.sector,
          m.fiscal_period,
          COUNT(DISTINCT c.symbol) as company_count,
          ROUND(AVG(m.roic), 2) as avg_roic,
          ROUND(AVG(m.roe), 2) as avg_roe,
          ROUND(AVG(m.net_margin), 2) as avg_net_margin,
          ROUND(AVG(m.revenue_growth_yoy), 2) as avg_revenue_growth,
          ROUND(AVG(m.fcf_yield), 2) as avg_fcf_yield
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND c.sector IS NOT NULL
          AND m.fiscal_period IN (${placeholders})
        GROUP BY c.sector, m.fiscal_period
      )
      SELECT *
      FROM sector_periods
      ORDER BY sector, fiscal_period DESC
    `;

    const results = this.db.prepare(sql).all(periodType, ...periodList);

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
  getIndustryMarginComparison(periodType = 'annual') {
    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = ?
          )
          AND c.industry IS NOT NULL
      )
      SELECT
        sector,
        industry,
        COUNT(DISTINCT symbol) as company_count,

        -- Margin metrics
        ROUND(AVG(gross_margin), 2) as avg_gross_margin,
        ROUND(MIN(gross_margin), 2) as min_gross_margin,
        ROUND(MAX(gross_margin), 2) as max_gross_margin,

        ROUND(AVG(operating_margin), 2) as avg_operating_margin,
        ROUND(MIN(operating_margin), 2) as min_operating_margin,
        ROUND(MAX(operating_margin), 2) as max_operating_margin,

        ROUND(AVG(net_margin), 2) as avg_net_margin,
        ROUND(MIN(net_margin), 2) as min_net_margin,
        ROUND(MAX(net_margin), 2) as max_net_margin,

        ROUND(AVG(fcf_margin), 2) as avg_fcf_margin

      FROM latest_metrics
      GROUP BY sector, industry
      HAVING company_count >= 2
      ORDER BY avg_net_margin DESC
    `;

    return this.db.prepare(sql).all(periodType, periodType);
  }

  /**
   * Get detailed sector data with all companies
   */
  getSectorDetail(sector, periodType = 'annual') {
    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = ?
          )
          AND c.sector = ?
      )
      SELECT
        symbol,
        name,
        industry,
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,

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

    const companies = this.db.prepare(sql).all(periodType, periodType, sector);

    // Calculate sector aggregates
    const aggregate = {
      company_count: companies.length,
      avg_roic: this.avg(companies, 'roic'),
      avg_roe: this.avg(companies, 'roe'),
      avg_net_margin: this.avg(companies, 'net_margin'),
      avg_operating_margin: this.avg(companies, 'operating_margin'),
      avg_pe_ratio: this.avg(companies, 'pe_ratio'),
      avg_debt_to_equity: this.avg(companies, 'debt_to_equity'),
      avg_revenue_growth: this.avg(companies, 'revenue_growth'),
      avg_fcf_yield: this.avg(companies, 'fcf_yield'),
      total_market_cap_b: this.sum(companies, 'market_cap_b')
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
  getIndustryDetail(industry, periodType = 'annual') {
    const sql = `
      WITH latest_metrics AS (
        SELECT
          m.*,
          c.sector,
          c.industry,
          c.symbol,
          c.name,
          c.market_cap
        FROM calculated_metrics m
        JOIN companies c ON m.company_id = c.id
        WHERE m.period_type = ?
          AND m.fiscal_period = (
            SELECT MAX(m2.fiscal_period)
            FROM calculated_metrics m2
            WHERE m2.company_id = m.company_id
              AND m2.period_type = ?
          )
          AND c.industry = ?
      )
      SELECT
        symbol,
        name,
        sector,
        ROUND(market_cap / 1e9, 2) as market_cap_b,
        fiscal_period,

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

    const companies = this.db.prepare(sql).all(periodType, periodType, industry);

    const aggregate = {
      company_count: companies.length,
      sector: companies[0]?.sector,
      avg_roic: this.avg(companies, 'roic'),
      avg_roe: this.avg(companies, 'roe'),
      avg_net_margin: this.avg(companies, 'net_margin'),
      avg_operating_margin: this.avg(companies, 'operating_margin'),
      avg_pe_ratio: this.avg(companies, 'pe_ratio'),
      avg_debt_to_equity: this.avg(companies, 'debt_to_equity'),
      avg_revenue_growth: this.avg(companies, 'revenue_growth'),
      avg_fcf_yield: this.avg(companies, 'fcf_yield'),
      total_market_cap_b: this.sum(companies, 'market_cap_b')
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
  getSectorRankings(periodType = 'annual') {
    const sectors = this.getSectorOverview(periodType);

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

  // Helper methods
  avg(arr, field) {
    const values = arr.map(x => x[field]).filter(v => v !== null && v !== undefined);
    if (values.length === 0) return null;
    return +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
  }

  sum(arr, field) {
    const values = arr.map(x => x[field]).filter(v => v !== null && v !== undefined);
    return +(values.reduce((a, b) => a + b, 0)).toFixed(2);
  }
}

module.exports = SectorAnalysisService;
