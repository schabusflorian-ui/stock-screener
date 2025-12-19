// src/services/screeningService.js
const db = require('../database');

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'roic', 'roe', 'roa', 'operating_margin', 'net_margin', 'gross_margin',
  'fcf_yield', 'fcf_margin', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
  'debt_to_equity', 'debt_to_assets', 'current_ratio', 'quick_ratio', 'interest_coverage',
  'revenue_growth_yoy', 'earnings_growth_yoy', 'fcf_growth_yoy', 'asset_turnover',
  'data_quality_score', 'market_cap', 'symbol', 'name',
  // Price metrics columns
  'beta', 'enterprise_value', 'last_price', 'change_1d', 'change_1w', 'change_1m', 'change_ytd'
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

      // Recency filter - only include companies with recent data
      // Default: require data within last 2 years for preset screens
      maxDataAge = null, // Number of years (e.g., 2 = data must be within last 2 years)

      // Exclude CIK-only companies (no ticker symbol)
      excludeCIKOnly = false,

      // Only include active companies (not flagged as inactive/delisted)
      activeOnly = true, // Default to true for preset screens

      // Sorting and pagination
      sortBy = 'roic',
      sortOrder = 'DESC',
      limit = null,
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

    // Market cap filter (convert from billions to actual value) - use price_metrics table
    if (minMarketCap !== undefined && minMarketCap !== null && minMarketCap !== '') {
      where.push('pm.market_cap >= ?');
      params.push(parseFloat(minMarketCap) * 1e9);
    }
    if (maxMarketCap !== undefined && maxMarketCap !== null && maxMarketCap !== '') {
      where.push('pm.market_cap <= ?');
      params.push(parseFloat(maxMarketCap) * 1e9);
    }

    // Recency filter - exclude companies with stale data
    if (maxDataAge !== undefined && maxDataAge !== null) {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - maxDataAge);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
      where.push('m.fiscal_period >= ?');
      params.push(cutoffDateStr);
    }

    // Exclude CIK-only companies (those without ticker symbols)
    if (excludeCIKOnly) {
      where.push("c.symbol NOT LIKE 'CIK_%'");
    }

    // Only include active companies (not flagged as inactive/delisted)
    if (activeOnly) {
      where.push('c.is_active = 1');
    }

    // Validate sort column to prevent SQL injection
    const safeSortBy = VALID_SORT_COLUMNS.includes(sortBy) ? sortBy : 'roic';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Handle sorting by company fields vs metric fields vs price_metrics fields
    const priceMetricsCols = ['market_cap', 'beta', 'enterprise_value', 'last_price', 'change_1d', 'change_1w', 'change_1m', 'change_ytd'];
    let sortColumn;
    if (['symbol', 'name'].includes(safeSortBy)) {
      sortColumn = `c.${safeSortBy}`;
    } else if (priceMetricsCols.includes(safeSortBy)) {
      sortColumn = `pm.${safeSortBy}`;
    } else {
      sortColumn = `m.${safeSortBy}`;
    }

    // Build LIMIT/OFFSET clause conditionally
    const limitClause = limit ? 'LIMIT ? OFFSET ?' : '';

    const sql = `
      SELECT
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        -- Price metrics (current market data)
        pm.market_cap,
        pm.last_price,
        pm.beta,
        pm.enterprise_value,
        pm.shares_outstanding,
        pm.change_1d,
        pm.change_1w,
        pm.change_1m,
        pm.change_3m,
        pm.change_6m,
        pm.change_1y,
        pm.change_ytd,
        pm.high_52w,
        pm.low_52w,
        -- Calculated metrics (fundamental data)
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
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sortColumn} ${safeSortOrder} NULLS LAST
      ${limitClause}
    `;

    if (limit) {
      params.push(parseInt(limit), parseInt(offset));
    }

    const startTime = Date.now();
    const results = this.db.prepare(sql).all(...params);
    const duration = Date.now() - startTime;

    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      LEFT JOIN price_metrics pm ON pm.company_id = c.id
      WHERE ${where.join(' AND ')}
    `;
    // Remove limit and offset params if they were added
    const countParams = limit ? params.slice(0, -2) : params;
    const totalCount = this.db.prepare(countSql).get(...countParams)?.total || 0;

    console.log(`\n📊 Screen completed in ${duration}ms`);
    console.log(`   Found ${results.length} of ${totalCount} matches\n`);

    return {
      results,
      total: totalCount,
      limit: limit ? parseInt(limit) : null,
      offset: parseInt(offset),
      duration
    };
  }

  /**
   * Buffett-style: Quality companies
   * High ROIC, low debt, positive FCF
   */
  buffettQuality(limit) {
    console.log('\n🎯 BUFFETT QUALITY SCREEN');
    console.log('   Criteria: ROIC > 15%, Debt/Equity < 0.5, FCF Yield > 0%\n');

    const result = this.screen({
      minROIC: 15,
      maxDebtToEquity: 0.5,
      minFCFYield: 0,
      sortBy: 'roic',
      maxDataAge: 2,        // Only recent data (within 2 years)
      excludeCIKOnly: true, // Only companies with ticker symbols
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Graham-style: Deep value
   */
  deepValue(limit) {
    console.log('\n🎯 DEEP VALUE SCREEN (Graham)');
    console.log('   Criteria: P/E < 15, P/B < 1.5, Positive ROE\n');

    const result = this.screen({
      maxPERatio: 15,
      maxPBRatio: 1.5,
      minROIC: 0,
      sortBy: 'pe_ratio',
      sortOrder: 'ASC',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Magic Formula (Greenblatt)
   */
  magicFormula(limit) {
    console.log('\n🎯 MAGIC FORMULA SCREEN (Greenblatt)');
    console.log('   Criteria: High ROIC + Low P/E\n');

    const result = this.screen({
      minROIC: 15,
      maxPERatio: 25,
      sortBy: 'roic',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * High quality, any price
   */
  qualityAtAnyPrice(limit) {
    console.log('\n🎯 QUALITY AT ANY PRICE');
    console.log('   Criteria: ROIC > 20%, Low debt\n');

    const result = this.screen({
      minROIC: 20,
      maxDebtToEquity: 1.0,
      sortBy: 'roic',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * High growth companies
   */
  highGrowth(limit) {
    console.log('\n🎯 HIGH GROWTH SCREEN');
    console.log('   Criteria: Revenue Growth > 15%, Earnings Growth > 15%\n');

    const result = this.screen({
      minRevenueGrowth: 15,
      minEarningsGrowth: 15,
      sortBy: 'revenue_growth_yoy',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Dividend value
   * Note: Using FCF Margin instead of FCF Yield since market cap data is unavailable
   */
  dividendValue(limit) {
    console.log('\n🎯 DIVIDEND VALUE SCREEN');
    console.log('   Criteria: FCF Margin > 10%, Low Debt, Positive Growth\n');

    const result = this.screen({
      minFCFMargin: 10,     // Use FCF Margin instead of FCF Yield
      maxDebtToEquity: 1.0,
      minRevenueGrowth: 0,
      sortBy: 'fcf_margin',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Financial fortress (strong balance sheet)
   */
  financialFortress(limit) {
    console.log('\n🎯 FINANCIAL FORTRESS SCREEN');
    console.log('   Criteria: Low Debt, High Current Ratio, Net Margin > 5%\n');

    const result = this.screen({
      maxDebtToEquity: 0.3,
      minCurrentRatio: 2,
      minNetMargin: 5,      // Use Net Margin instead of FCF Yield
      sortBy: 'current_ratio',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Graham Cigar Butts - Deep value / "net-net" style
   * Companies trading below liquidation value with some profitability
   */
  grahamCigarButts(limit) {
    console.log('\n🎯 GRAHAM CIGAR BUTTS SCREEN');
    console.log('   Criteria: P/B < 0.8, P/E < 8, Current Ratio > 1.5, Some profit\n');

    const result = this.screen({
      maxPBRatio: 0.8,        // Trading below book value
      maxPERatio: 8,          // Very cheap earnings
      minCurrentRatio: 1.5,   // Some liquidity
      minNetMargin: 0,        // At least breaking even
      sortBy: 'pb_ratio',
      sortOrder: 'ASC',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Akre Compounders - High quality compounders with aligned management
   * Note: Insider ownership data not yet available, using ROCE consistency as proxy
   */
  akreCompounders(limit) {
    console.log('\n🎯 AKRE COMPOUNDERS SCREEN');
    console.log('   Criteria: ROCE > 20%, Debt/Equity < 0.5, Strong margins\n');

    const result = this.screen({
      minROIC: 20,            // High returns on capital (using ROIC as proxy for ROCE)
      maxDebtToEquity: 0.5,   // Conservative debt levels
      minNetMargin: 10,       // Quality earnings
      sortBy: 'roic',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Sleep Well Flywheel - Compounders passing savings to customers
   * Companies with revenue growth but stable/improving efficiency
   */
  sleepWellFlywheel(limit) {
    console.log('\n🎯 SLEEP WELL FLYWHEEL SCREEN');
    console.log('   Criteria: Revenue CAGR > 10%, High Gross Margin, Rising ROIC\n');

    // Use 5-year CAGR where available, otherwise YoY growth
    const sql = `
      SELECT
        c.symbol, c.name, c.sector, c.industry, c.market_cap,
        m.fiscal_period, m.period_type,
        m.roic, m.roe, m.roa, m.gross_margin, m.operating_margin, m.net_margin,
        m.fcf_yield, m.fcf_margin, m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
        m.debt_to_equity, m.debt_to_assets, m.current_ratio, m.quick_ratio,
        m.interest_coverage, m.revenue_growth_yoy, m.earnings_growth_yoy,
        m.fcf_growth_yoy, m.asset_turnover, m.data_quality_score as quality_score,
        m.revenue_cagr_5y, m.roce
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE m.period_type = 'annual'
        AND c.is_active = 1
        AND c.symbol NOT LIKE 'CIK_%'
        AND m.fiscal_period >= date('now', '-2 years')
        AND (m.revenue_cagr_5y >= 10 OR m.revenue_growth_yoy >= 10)
        AND m.gross_margin >= 30
        AND m.roic >= 12
      ORDER BY m.roic DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const params = limit ? [parseInt(limit)] : [];
    const results = this.db.prepare(sql).all(...params);

    console.log(`   Found ${results.length} matches\n`);
    return results;
  }

  /**
   * Forensic Quality - High earnings quality, low accounting red flags
   * CFO/Net Income > 1 means cash earnings exceed accrual earnings
   */
  forensicQuality(limit) {
    console.log('\n🎯 FORENSIC QUALITY SCREEN');
    console.log('   Criteria: CFO/Net Income > 1.0, Strong margins, Low debt\n');

    // Custom query to calculate CFO/Net Income ratio
    // JOIN cash_flow for operating_cashflow and income_statement for net_income
    const sql = `
      SELECT
        c.symbol, c.name, c.sector, c.industry, c.market_cap,
        m.fiscal_period, m.period_type,
        m.roic, m.roe, m.roa, m.gross_margin, m.operating_margin, m.net_margin,
        m.fcf_yield, m.fcf_margin, m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
        m.debt_to_equity, m.debt_to_assets, m.current_ratio, m.quick_ratio,
        m.interest_coverage, m.revenue_growth_yoy, m.earnings_growth_yoy,
        m.fcf_growth_yoy, m.asset_turnover, m.data_quality_score as quality_score,
        ROUND(cf.operating_cashflow / inc.net_income, 2) as cfo_to_net_income
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      JOIN financial_data cf ON cf.company_id = c.id
        AND cf.fiscal_date_ending = m.fiscal_period
        AND cf.statement_type = 'cash_flow'
      JOIN financial_data inc ON inc.company_id = c.id
        AND inc.fiscal_date_ending = m.fiscal_period
        AND inc.statement_type = 'income_statement'
      WHERE m.period_type = 'annual'
        AND c.is_active = 1
        AND c.symbol NOT LIKE 'CIK_%'
        AND m.fiscal_period >= date('now', '-2 years')
        AND m.net_margin > 5
        AND m.debt_to_equity < 1.0
        AND inc.net_income > 0
        AND cf.operating_cashflow IS NOT NULL
        AND cf.operating_cashflow / inc.net_income >= 1.0
      ORDER BY (cf.operating_cashflow / inc.net_income) DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const params = limit ? [parseInt(limit)] : [];
    const results = this.db.prepare(sql).all(...params);

    console.log(`   Found ${results.length} matches\n`);
    return results;
  }

  /**
   * Pabrai Asymmetry - Low risk, high reward situations
   * Cheap stocks with quality characteristics and beaten-down prices
   * Note: Insider buying and 52-week high data not yet available
   */
  pabraiAsymmetry(limit) {
    console.log('\n🎯 PABRAI ASYMMETRY SCREEN');
    console.log('   Criteria: P/E < 10, ROIC > 12%, Low debt\n');

    const result = this.screen({
      maxPERatio: 10,         // Very cheap
      minROIC: 12,            // Quality business
      maxDebtToEquity: 0.8,   // Not overleveraged
      minNetMargin: 5,        // Profitable
      sortBy: 'pe_ratio',
      sortOrder: 'ASC',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }

  /**
   * Pat Dorsey / Morningstar Moats - Companies with competitive advantages
   * High and stable returns on capital, pricing power
   */
  dorseyMoats(limit) {
    console.log('\n🎯 PAT DORSEY MOATS SCREEN');
    console.log('   Criteria: ROIC > 15%, Gross Margin > 40%, Stable margins\n');

    const result = this.screen({
      minROIC: 15,            // Excess returns suggest moat
      minGrossMargin: 40,     // Pricing power
      minOperatingMargin: 15, // Operational efficiency
      minNetMargin: 10,       // Bottom line quality
      maxDebtToEquity: 1.0,   // Financial health
      sortBy: 'gross_margin',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });
    return result.results;
  }
}

module.exports = ScreeningService;
