// src/services/screeningService.js
const db = require('../database');

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'roic', 'roe', 'roa', 'operating_margin', 'net_margin', 'gross_margin',
  'fcf_yield', 'fcf_margin', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
  'debt_to_equity', 'debt_to_assets', 'current_ratio', 'quick_ratio', 'interest_coverage',
  'revenue_growth_yoy', 'earnings_growth_yoy', 'fcf_growth_yoy', 'asset_turnover',
  'data_quality_score', 'market_cap', 'symbol', 'name'
];

/**
 * Screening Service
 *
 * Fast, flexible stock screening with preset strategies and custom criteria
 */
class ScreeningService {
  constructor() {
    this.db = db.getDatabase();
    console.log('✅ Screening Service initialized');
  }

  /**
   * Get available filter options (sectors, industries, date ranges)
   */
  getFilterOptions() {
    const sectors = this.db.prepare(`
      SELECT DISTINCT sector
      FROM companies
      WHERE sector IS NOT NULL
      ORDER BY sector
    `).all().map(r => r.sector);

    const industries = this.db.prepare(`
      SELECT DISTINCT industry, sector
      FROM companies
      WHERE industry IS NOT NULL
      ORDER BY sector, industry
    `).all();

    // Group industries by sector
    const industriesBySector = {};
    industries.forEach(({ industry, sector }) => {
      if (!industriesBySector[sector]) {
        industriesBySector[sector] = [];
      }
      industriesBySector[sector].push(industry);
    });

    const periodRanges = this.db.prepare(`
      SELECT
        MIN(fiscal_period) as min_date,
        MAX(fiscal_period) as max_date
      FROM calculated_metrics
      WHERE fiscal_period BETWEEN '2010-01-01' AND '2030-12-31'
    `).get();

    const availablePeriods = this.db.prepare(`
      SELECT DISTINCT
        fiscal_period,
        period_type,
        COUNT(DISTINCT company_id) as company_count
      FROM calculated_metrics
      WHERE fiscal_period BETWEEN '2015-01-01' AND '2030-12-31'
      GROUP BY fiscal_period, period_type
      HAVING company_count >= 5
      ORDER BY fiscal_period DESC
      LIMIT 50
    `).all();

    return {
      sectors,
      industriesBySector,
      periodRange: {
        min: periodRanges?.min_date,
        max: periodRanges?.max_date
      },
      availablePeriods,
      sortableFields: VALID_SORT_COLUMNS.filter(col => !['symbol', 'name', 'market_cap'].includes(col))
    };
  }

  /**
   * Advanced screen with comprehensive criteria
   */
  screen(criteria = {}) {
    const {
      // Profitability criteria
      minROIC, maxROIC,
      minROE, maxROE,
      minROA, maxROA,

      // Margin criteria
      minGrossMargin, maxGrossMargin,
      minOperatingMargin, maxOperatingMargin,
      minNetMargin, maxNetMargin,

      // Cash flow criteria
      minFCFYield, maxFCFYield,
      minFCFMargin, maxFCFMargin,

      // Valuation criteria
      minPERatio, maxPERatio,
      minPBRatio, maxPBRatio,
      minPSRatio, maxPSRatio,
      minEVEBITDA, maxEVEBITDA,

      // Financial health criteria
      minDebtToEquity, maxDebtToEquity,
      minDebtToAssets, maxDebtToAssets,
      minCurrentRatio, maxCurrentRatio,
      minQuickRatio, maxQuickRatio,
      minInterestCoverage, maxInterestCoverage,

      // Growth criteria
      minRevenueGrowth, maxRevenueGrowth,
      minEarningsGrowth, maxEarningsGrowth,
      minFCFGrowth, maxFCFGrowth,

      // Efficiency criteria
      minAssetTurnover, maxAssetTurnover,

      // Quality filter
      minQualityScore,

      // Sector/Industry filters
      sectors = [],
      industries = [],

      // Market cap filters (in billions)
      minMarketCap,
      maxMarketCap,

      // Period selection for historical screening
      periodType = 'annual',
      asOfDate = null, // Specific historical date
      lookbackYears = null, // Screen X years ago

      // Sorting and pagination
      sortBy = 'roic',
      sortOrder = 'DESC',
      limit = 100,
      offset = 0
    } = criteria;

    // Build WHERE clauses
    const where = [];
    const params = [];

    // Period/date filtering
    if (asOfDate) {
      // Historical screening: get metrics closest to asOfDate
      where.push(`m.fiscal_period <= ?`);
      params.push(asOfDate);
      where.push(`m.fiscal_period = (
        SELECT MAX(m2.fiscal_period)
        FROM calculated_metrics m2
        WHERE m2.company_id = m.company_id
          AND m2.fiscal_period <= ?
          AND m2.period_type = ?
      )`);
      params.push(asOfDate, periodType);
    } else if (lookbackYears) {
      // Screen X years ago
      const targetDate = new Date();
      targetDate.setFullYear(targetDate.getFullYear() - lookbackYears);
      const dateStr = targetDate.toISOString().split('T')[0];
      where.push(`m.fiscal_period <= ?`);
      params.push(dateStr);
      where.push(`m.fiscal_period = (
        SELECT MAX(m2.fiscal_period)
        FROM calculated_metrics m2
        WHERE m2.company_id = m.company_id
          AND m2.fiscal_period <= ?
          AND m2.period_type = ?
      )`);
      params.push(dateStr, periodType);
    } else {
      // Current screening: use latest period for each company
      where.push(`m.fiscal_period = (
        SELECT MAX(m2.fiscal_period)
        FROM calculated_metrics m2
        WHERE m2.company_id = m.company_id
          AND m2.period_type = ?
      )`);
      params.push(periodType);
    }

    // Period type filter
    where.push('m.period_type = ?');
    params.push(periodType);

    // Helper function to add range criteria
    const addRangeCriteria = (column, minVal, maxVal) => {
      if (minVal !== undefined && minVal !== null && minVal !== '') {
        where.push(`m.${column} >= ?`);
        params.push(parseFloat(minVal));
      }
      if (maxVal !== undefined && maxVal !== null && maxVal !== '') {
        where.push(`m.${column} <= ?`);
        params.push(parseFloat(maxVal));
      }
    };

    // Profitability
    addRangeCriteria('roic', minROIC, maxROIC);
    addRangeCriteria('roe', minROE, maxROE);
    addRangeCriteria('roa', minROA, maxROA);

    // Margins
    addRangeCriteria('gross_margin', minGrossMargin, maxGrossMargin);
    addRangeCriteria('operating_margin', minOperatingMargin, maxOperatingMargin);
    addRangeCriteria('net_margin', minNetMargin, maxNetMargin);

    // Cash flow
    addRangeCriteria('fcf_yield', minFCFYield, maxFCFYield);
    addRangeCriteria('fcf_margin', minFCFMargin, maxFCFMargin);

    // Valuation
    addRangeCriteria('pe_ratio', minPERatio, maxPERatio);
    addRangeCriteria('pb_ratio', minPBRatio, maxPBRatio);
    addRangeCriteria('ps_ratio', minPSRatio, maxPSRatio);
    addRangeCriteria('ev_ebitda', minEVEBITDA, maxEVEBITDA);

    // Financial health
    addRangeCriteria('debt_to_equity', minDebtToEquity, maxDebtToEquity);
    addRangeCriteria('debt_to_assets', minDebtToAssets, maxDebtToAssets);
    addRangeCriteria('current_ratio', minCurrentRatio, maxCurrentRatio);
    addRangeCriteria('quick_ratio', minQuickRatio, maxQuickRatio);
    addRangeCriteria('interest_coverage', minInterestCoverage, maxInterestCoverage);

    // Growth
    addRangeCriteria('revenue_growth_yoy', minRevenueGrowth, maxRevenueGrowth);
    addRangeCriteria('earnings_growth_yoy', minEarningsGrowth, maxEarningsGrowth);
    addRangeCriteria('fcf_growth_yoy', minFCFGrowth, maxFCFGrowth);

    // Efficiency
    addRangeCriteria('asset_turnover', minAssetTurnover, maxAssetTurnover);

    // Quality score
    if (minQualityScore !== undefined && minQualityScore !== null) {
      where.push('m.data_quality_score >= ?');
      params.push(parseInt(minQualityScore));
    }

    // Sector filter
    if (sectors.length > 0) {
      where.push(`c.sector IN (${sectors.map(() => '?').join(',')})`);
      params.push(...sectors);
    }

    // Industry filter
    if (industries.length > 0) {
      where.push(`c.industry IN (${industries.map(() => '?').join(',')})`);
      params.push(...industries);
    }

    // Market cap filter (convert from billions to actual value)
    if (minMarketCap !== undefined && minMarketCap !== null && minMarketCap !== '') {
      where.push('c.market_cap >= ?');
      params.push(parseFloat(minMarketCap) * 1e9);
    }
    if (maxMarketCap !== undefined && maxMarketCap !== null && maxMarketCap !== '') {
      where.push('c.market_cap <= ?');
      params.push(parseFloat(maxMarketCap) * 1e9);
    }

    // Validate sort column to prevent SQL injection
    const safeSortBy = VALID_SORT_COLUMNS.includes(sortBy) ? sortBy : 'roic';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Handle sorting by company fields vs metric fields
    const sortColumn = ['market_cap', 'symbol', 'name'].includes(safeSortBy)
      ? `c.${safeSortBy}`
      : `m.${safeSortBy}`;

    const sql = `
      SELECT
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        c.market_cap,
        m.fiscal_period,
        m.period_type,
        m.roic,
        m.roe,
        m.roa,
        m.gross_margin,
        m.operating_margin,
        m.net_margin,
        m.fcf_yield,
        m.fcf_margin,
        m.pe_ratio,
        m.pb_ratio,
        m.ps_ratio,
        m.ev_ebitda,
        m.debt_to_equity,
        m.debt_to_assets,
        m.current_ratio,
        m.quick_ratio,
        m.interest_coverage,
        m.revenue_growth_yoy,
        m.earnings_growth_yoy,
        m.fcf_growth_yoy,
        m.asset_turnover,
        m.data_quality_score as quality_score
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${safeSortOrder} NULLS LAST
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit), parseInt(offset));

    const startTime = Date.now();
    const results = this.db.prepare(sql).all(...params);
    const duration = Date.now() - startTime;

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE ${where.join(' AND ')}
    `;
    const countParams = params.slice(0, -2); // Remove limit and offset
    const totalCount = this.db.prepare(countSql).get(...countParams)?.total || 0;

    console.log(`\n📊 Screen completed in ${duration}ms`);
    console.log(`   Found ${results.length} of ${totalCount} matches\n`);

    return {
      results,
      total: totalCount,
      limit: parseInt(limit),
      offset: parseInt(offset),
      duration
    };
  }

  /**
   * Buffett-style: Quality companies
   */
  buffettQuality(limit = 50) {
    console.log('\n🎯 BUFFETT QUALITY SCREEN');
    console.log('   Criteria: ROIC > 15%, Debt/Equity < 0.5, Positive FCF\n');

    const result = this.screen({
      minROIC: 15,
      maxDebtToEquity: 0.5,
      minFCFYield: 0,
      sortBy: 'roic',
      limit
    });
    return result.results;
  }

  /**
   * Graham-style: Deep value
   */
  deepValue(limit = 50) {
    console.log('\n🎯 DEEP VALUE SCREEN (Graham)');
    console.log('   Criteria: P/E < 15, P/B < 1.5, Positive ROE\n');

    const result = this.screen({
      maxPERatio: 15,
      maxPBRatio: 1.5,
      minROIC: 0,
      sortBy: 'pe_ratio',
      sortOrder: 'ASC',
      limit
    });
    return result.results;
  }

  /**
   * Magic Formula (Greenblatt)
   */
  magicFormula(limit = 50) {
    console.log('\n🎯 MAGIC FORMULA SCREEN (Greenblatt)');
    console.log('   Criteria: High ROIC + Low P/E\n');

    const result = this.screen({
      minROIC: 15,
      maxPERatio: 25,
      sortBy: 'roic',
      limit
    });
    return result.results;
  }

  /**
   * High quality, any price
   */
  qualityAtAnyPrice(limit = 50) {
    console.log('\n🎯 QUALITY AT ANY PRICE');
    console.log('   Criteria: ROIC > 20%, Low debt\n');

    const result = this.screen({
      minROIC: 20,
      maxDebtToEquity: 1.0,
      sortBy: 'roic',
      limit
    });
    return result.results;
  }

  /**
   * High growth companies
   */
  highGrowth(limit = 50) {
    console.log('\n🎯 HIGH GROWTH SCREEN');
    console.log('   Criteria: Revenue Growth > 15%, Earnings Growth > 15%\n');

    const result = this.screen({
      minRevenueGrowth: 15,
      minEarningsGrowth: 15,
      sortBy: 'revenue_growth_yoy',
      limit
    });
    return result.results;
  }

  /**
   * Dividend value
   */
  dividendValue(limit = 50) {
    console.log('\n🎯 DIVIDEND VALUE SCREEN');
    console.log('   Criteria: FCF Yield > 5%, Low Debt, Positive Growth\n');

    const result = this.screen({
      minFCFYield: 5,
      maxDebtToEquity: 1.0,
      minRevenueGrowth: 0,
      sortBy: 'fcf_yield',
      limit
    });
    return result.results;
  }

  /**
   * Financial fortress (strong balance sheet)
   */
  financialFortress(limit = 50) {
    console.log('\n🎯 FINANCIAL FORTRESS SCREEN');
    console.log('   Criteria: Low Debt, High Current Ratio, Strong Cash Flow\n');

    const result = this.screen({
      maxDebtToEquity: 0.3,
      minCurrentRatio: 2,
      minFCFYield: 0,
      sortBy: 'current_ratio',
      limit
    });
    return result.results;
  }
}

module.exports = ScreeningService;
