// src/services/screeningService.js
const db = require('../database');
const { FREDService } = require('./data');

// Valid sortable columns to prevent SQL injection
const VALID_SORT_COLUMNS = [
  'roic', 'roe', 'roa', 'operating_margin', 'net_margin', 'gross_margin',
  'fcf_yield', 'fcf_margin', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
  'peg_ratio', 'pegy_ratio',
  'debt_to_equity', 'debt_to_assets', 'current_ratio', 'quick_ratio', 'interest_coverage',
  'revenue_growth_yoy', 'earnings_growth_yoy', 'fcf_growth_yoy', 'asset_turnover',
  'data_quality_score', 'market_cap', 'symbol', 'name',
  // Price metrics columns
  'beta', 'enterprise_value', 'last_price', 'change_1d', 'change_1w', 'change_1m', 'change_ytd',
  // Alpha columns (vs SPY benchmark)
  'alpha_1d', 'alpha_1w', 'alpha_1m', 'alpha_3m', 'alpha_6m', 'alpha_ytd', 'alpha_1y'
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

    // Get available countries with company counts
    const countryCounts = this.db.prepare(`
      SELECT
        c.country,
        COUNT(DISTINCT c.id) as company_count
      FROM companies c
      JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE c.country IS NOT NULL AND c.is_active = 1
      GROUP BY c.country
      HAVING company_count >= 1
      ORDER BY company_count DESC
    `).all();

    // Available regions for convenience filtering
    const availableRegions = [
      { code: 'US', name: 'United States', countries: ['US', 'USA'] },
      { code: 'UK', name: 'United Kingdom', countries: ['GB', 'UK'] },
      { code: 'EU', name: 'European Union', countries: ['DE', 'FR', 'NL', 'ES', 'IT', 'BE', 'AT', 'PT', 'IE', 'GR', 'LU', 'FI'] },
      { code: 'NORDIC', name: 'Nordic Countries', countries: ['SE', 'DK', 'NO', 'FI'] },
      { code: 'DACH', name: 'DACH Region', countries: ['DE', 'AT', 'CH'] },
      { code: 'APAC', name: 'Asia Pacific', countries: ['JP', 'CN', 'HK', 'SG', 'AU', 'KR', 'TW', 'IN'] }
    ];

    return {
      sectors,
      industriesBySector,
      countries: countryCounts,
      regions: availableRegions,
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
      minPEGRatio, maxPEGRatio,
      minPEGYRatio, maxPEGYRatio,

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

      // Alpha criteria (vs SPY benchmark)
      minAlpha1M, maxAlpha1M,
      minAlpha3M, maxAlpha3M,
      minAlphaYTD, maxAlphaYTD,
      minAlpha1Y, maxAlpha1Y,

      // Quality filter
      minQualityScore,

      // Sector/Industry filters
      sectors = [],
      industries = [],

      // Country/Region filters
      countries = [],        // ISO country codes: ['US', 'GB', 'DE', ...]
      excludeCountries = [], // Exclude specific countries
      regions = [],          // Region shortcuts: 'US', 'UK', 'EU', 'NORDIC', 'APAC'

      // Market cap filters (in billions)
      minMarketCap,
      maxMarketCap,

      // Volume filters
      minAvgVolume,
      maxAvgVolume,

      // Insider criteria
      minInsiderOwnership,   // Minimum insider ownership percentage
      requireInsiderBuying,  // Boolean: require recent insider buying

      // 52-week range criteria
      maxDistanceFrom52wHigh, // Maximum % distance from 52-week high (e.g., 10 = within 10% of high)
      minDistanceFrom52wLow,  // Minimum % distance from 52-week low (e.g., 50 = at least 50% above low)

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
    addRangeCriteria('peg_ratio', minPEGRatio, maxPEGRatio);
    addRangeCriteria('pegy_ratio', minPEGYRatio, maxPEGYRatio);

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

    // Alpha criteria (vs SPY benchmark) - these are in price_metrics table so need special handling
    const addAlphaCriteria = (column, minVal, maxVal) => {
      if (minVal !== undefined && minVal !== null && minVal !== '') {
        where.push(`pm.${column} >= ?`);
        params.push(parseFloat(minVal));
      }
      if (maxVal !== undefined && maxVal !== null && maxVal !== '') {
        where.push(`pm.${column} <= ?`);
        params.push(parseFloat(maxVal));
      }
    };
    addAlphaCriteria('alpha_1m', minAlpha1M, maxAlpha1M);
    addAlphaCriteria('alpha_3m', minAlpha3M, maxAlpha3M);
    addAlphaCriteria('alpha_ytd', minAlphaYTD, maxAlphaYTD);
    addAlphaCriteria('alpha_1y', minAlpha1Y, maxAlpha1Y);

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

    // Country/Region filter
    // Define region mappings
    const REGION_COUNTRIES = {
      'US': ['US', 'USA'],
      'UK': ['GB', 'UK'],
      'EU': ['DE', 'FR', 'NL', 'ES', 'IT', 'BE', 'AT', 'PT', 'IE', 'GR', 'LU', 'FI'],
      'NORDIC': ['SE', 'DK', 'NO', 'FI'],
      'DACH': ['DE', 'AT', 'CH'],
      'APAC': ['JP', 'CN', 'HK', 'SG', 'AU', 'KR', 'TW', 'IN'],
      'LATAM': ['BR', 'MX', 'AR', 'CL', 'CO', 'PE']
    };

    // Build list of countries to include
    let countryList = [...countries];
    for (const region of regions) {
      const regionCountries = REGION_COUNTRIES[region.toUpperCase()];
      if (regionCountries) {
        countryList.push(...regionCountries);
      }
    }
    // Remove duplicates
    countryList = [...new Set(countryList)];

    if (countryList.length > 0) {
      where.push(`c.country IN (${countryList.map(() => '?').join(',')})`);
      params.push(...countryList);
    }

    // Exclude specific countries
    if (excludeCountries.length > 0) {
      where.push(`c.country NOT IN (${excludeCountries.map(() => '?').join(',')})`);
      params.push(...excludeCountries);
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

    // Volume filters
    if (minAvgVolume !== undefined && minAvgVolume !== null && minAvgVolume !== '') {
      where.push('pm.avg_volume_30d >= ?');
      params.push(parseInt(minAvgVolume));
    }
    if (maxAvgVolume !== undefined && maxAvgVolume !== null && maxAvgVolume !== '') {
      where.push('pm.avg_volume_30d <= ?');
      params.push(parseInt(maxAvgVolume));
    }

    // 52-week range filters
    if (maxDistanceFrom52wHigh !== undefined && maxDistanceFrom52wHigh !== null && maxDistanceFrom52wHigh !== '') {
      // Calculate distance: ((high_52w - last_price) / high_52w) * 100 <= maxDistance
      // Rearranged: last_price >= high_52w * (1 - maxDistance/100)
      where.push('pm.last_price >= pm.high_52w * (1 - ? / 100.0)');
      params.push(parseFloat(maxDistanceFrom52wHigh));
    }
    if (minDistanceFrom52wLow !== undefined && minDistanceFrom52wLow !== null && minDistanceFrom52wLow !== '') {
      // Calculate distance: ((last_price - low_52w) / low_52w) * 100 >= minDistance
      // Rearranged: last_price >= low_52w * (1 + minDistance/100)
      where.push('pm.last_price >= pm.low_52w * (1 + ? / 100.0)');
      params.push(parseFloat(minDistanceFrom52wLow));
    }

    // Insider ownership filter
    if (minInsiderOwnership !== undefined && minInsiderOwnership !== null && minInsiderOwnership !== '') {
      // Filter companies with at least one 10% owner OR significant insider activity
      where.push(`(
        EXISTS (
          SELECT 1 FROM insiders i
          WHERE i.company_id = c.id AND i.is_ten_percent_owner = 1
        ) OR
        (
          SELECT COUNT(*) FROM insider_transactions it
          WHERE it.company_id = c.id
            AND it.transaction_date >= date('now', '-365 days')
            AND it.transaction_type IN ('P', 'Purchase', 'BUY')
        ) >= ?
      )`);
      // Require at least 5 purchases for non-10% owner companies
      params.push(Math.max(5, parseFloat(minInsiderOwnership) / 2));
    }

    // Require recent insider buying
    if (requireInsiderBuying) {
      where.push(`EXISTS (
        SELECT 1 FROM insider_transactions it
        WHERE it.company_id = c.id
          AND it.transaction_date >= date('now', '-90 days')
          AND it.transaction_type IN ('P', 'Purchase', 'BUY')
          AND it.shares > 0
      )`);
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
    const priceMetricsCols = [
      'market_cap', 'beta', 'enterprise_value', 'last_price',
      'change_1d', 'change_1w', 'change_1m', 'change_ytd',
      'alpha_1d', 'alpha_1w', 'alpha_1m', 'alpha_3m', 'alpha_6m', 'alpha_ytd', 'alpha_1y'
    ];
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
        -- Alpha metrics (vs SPY benchmark)
        pm.alpha_1d,
        pm.alpha_1w,
        pm.alpha_1m,
        pm.alpha_3m,
        pm.alpha_6m,
        pm.alpha_1y,
        pm.alpha_ytd,
        pm.benchmark_symbol,
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
        m.peg_ratio,
        m.pegy_ratio,
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
   * Companies with strong free cash flow yield and financial stability
   */
  dividendValue(limit) {
    console.log('\n🎯 DIVIDEND VALUE SCREEN');
    console.log('   Criteria: FCF Yield > 8%, Low Debt, Positive Growth\n');

    const result = this.screen({
      minFCFYield: 8,        // Strong FCF yield (now available with market cap data)
      minFCFMargin: 10,      // Also require good FCF margin
      maxDebtToEquity: 1.0,  // Financial stability
      minRevenueGrowth: 0,   // Growing business
      minMarketCap: 0.5,     // Require meaningful market cap
      sortBy: 'fcf_yield',
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
   * Looks for high ROCE, low debt, and insider alignment
   */
  akreCompounders(limit) {
    console.log('\n🎯 AKRE COMPOUNDERS SCREEN');
    console.log('   Criteria: ROCE > 20%, Debt/Equity < 0.5, Strong margins, Insider ownership\n');

    const result = this.screen({
      minROIC: 20,            // High returns on capital (using ROIC as proxy for ROCE)
      maxDebtToEquity: 0.5,   // Conservative debt levels
      minNetMargin: 10,       // Quality earnings
      minInsiderOwnership: 5, // Look for meaningful insider ownership/activity
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
        m.fcf_yield, m.fcf_margin, m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda, m.peg_ratio, m.pegy_ratio,
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
        m.fcf_yield, m.fcf_margin, m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda, m.peg_ratio, m.pegy_ratio,
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
   * Cheap stocks with quality characteristics, beaten-down prices, and insider conviction
   */
  pabraiAsymmetry(limit) {
    console.log('\n🎯 PABRAI ASYMMETRY SCREEN');
    console.log('   Criteria: P/E < 10, ROIC > 12%, Low debt, Near 52w lows, Insider buying\n');

    const result = this.screen({
      maxPERatio: 10,             // Very cheap
      minROIC: 12,                // Quality business
      maxDebtToEquity: 0.8,       // Not overleveraged
      minNetMargin: 5,            // Profitable
      minDistanceFrom52wLow: 20,  // Near 52-week lows (within 20% recovery)
      maxDistanceFrom52wHigh: 60, // Far from highs (at least 40% down)
      requireInsiderBuying: true, // Insiders showing conviction
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

  // ========================================
  // MACRO-AWARE SCREENING METHODS
  // ========================================

  /**
   * Get current macro context for screening decisions
   */
  getMacroContext() {
    try {
      const fredService = new FREDService(this.db);
      return fredService.getMacroSignals();
    } catch (error) {
      console.error('Failed to get macro context:', error.message);
      return null;
    }
  }

  /**
   * Recession-Resistant Value Screen
   * Defensive sectors when yield curve is flat/inverted or VIX elevated
   */
  recessionResistantValue(limit) {
    console.log('\n🎯 RECESSION-RESISTANT VALUE SCREEN');
    console.log('   Criteria: Defensive sectors, FCF Yield > 5%, Low debt\n');

    const macro = this.getMacroContext();
    if (macro) {
      console.log(`   Macro Context: VIX ${macro.vix?.value?.toFixed(1) || 'N/A'}, ` +
                  `2s10s Spread ${macro.yieldCurve?.spread2s10s?.toFixed(2) || 'N/A'}%\n`);
    }

    const result = this.screen({
      sectors: ['Consumer Staples', 'Healthcare', 'Utilities'],
      minFCFYield: 5,
      maxDebtToEquity: 1.0,
      minNetMargin: 5,
      sortBy: 'fcf_yield',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });

    return {
      results: result.results,
      macroContext: macro
    };
  }

  /**
   * Deep Value with Safe Macro
   * Only buy deep value when yield curve is not inverted
   */
  deepValueSafeMacro(limit) {
    console.log('\n🎯 DEEP VALUE + SAFE MACRO SCREEN');

    const macro = this.getMacroContext();
    const curveInverted = macro?.yieldCurve?.isInverted2s10s;

    if (curveInverted) {
      console.log('   ⚠️  Yield curve INVERTED - Deep value carries higher risk\n');
    } else {
      console.log('   ✅ Yield curve NORMAL - Favorable for deep value\n');
    }

    console.log('   Criteria: P/E < 12, FCF Yield > 8%, Low debt\n');

    const result = this.screen({
      maxPERatio: 12,
      minFCFYield: 8,
      maxDebtToEquity: 0.5,
      sortBy: 'fcf_yield',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });

    return {
      results: result.results,
      macroContext: macro,
      warning: curveInverted ? 'Yield curve inverted - elevated recession risk' : null
    };
  }

  /**
   * Quality at Reasonable Price (GARP) with Low Volatility
   * Buy quality when VIX is calm
   */
  garpLowVol(limit) {
    console.log('\n🎯 GARP + LOW VOLATILITY SCREEN');

    const macro = this.getMacroContext();
    const vixLevel = macro?.vix?.value;
    const vixElevated = vixLevel > 20;

    if (vixElevated) {
      console.log(`   ⚠️  VIX elevated at ${vixLevel?.toFixed(1)} - Wait for better entry\n`);
    } else {
      console.log(`   ✅ VIX calm at ${vixLevel?.toFixed(1)} - Good conditions for quality\n`);
    }

    console.log('   Criteria: ROIC > 15%, P/E < 25, Revenue Growth > 5%\n');

    const result = this.screen({
      minROIC: 15,
      maxPERatio: 25,
      minRevenueGrowth: 5,
      sortBy: 'roic',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });

    return {
      results: result.results,
      macroContext: macro,
      recommendation: vixElevated
        ? 'Consider waiting for VIX < 20 for better entry'
        : 'Favorable conditions for quality purchases'
    };
  }

  /**
   * Cyclical Value Screen
   * Buy cyclicals when curve is steep (early cycle)
   */
  cyclicalValue(limit) {
    console.log('\n🎯 CYCLICAL VALUE SCREEN');

    const macro = this.getMacroContext();
    const spread = macro?.yieldCurve?.spread2s10s;
    const steepCurve = spread > 1.0;

    if (steepCurve) {
      console.log(`   ✅ Yield curve steep (${spread?.toFixed(2)}%) - Favorable for cyclicals\n`);
    } else {
      console.log(`   ⚠️  Yield curve flat/inverted (${spread?.toFixed(2)}%) - Cyclicals risky\n`);
    }

    console.log('   Criteria: Cyclical sectors, P/E < 15, ROIC > 10%\n');

    const result = this.screen({
      sectors: ['Materials', 'Industrials', 'Consumer Discretionary', 'Energy', 'Financials'],
      maxPERatio: 15,
      minROIC: 10,
      minFCFMargin: 5,
      sortBy: 'pe_ratio',
      sortOrder: 'ASC',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });

    return {
      results: result.results,
      macroContext: macro,
      recommendation: steepCurve
        ? 'Early cycle conditions - cyclicals may outperform'
        : 'Late cycle/recession risk - prefer defensive positions'
    };
  }

  /**
   * Fear Buying Screen
   * Aggressive buying during high VIX (crisis) periods
   */
  fearBuying(limit) {
    console.log('\n🎯 FEAR BUYING SCREEN');

    const macro = this.getMacroContext();
    const vixLevel = macro?.vix?.value;
    const fearMode = vixLevel > 25;

    if (fearMode) {
      console.log(`   🔥 VIX at ${vixLevel?.toFixed(1)} - FEAR MODE - Aggressive buying opportunity\n`);
    } else {
      console.log(`   📊 VIX at ${vixLevel?.toFixed(1)} - Normal conditions\n`);
    }

    console.log('   Criteria: High quality companies at any reasonable price\n');

    const result = this.screen({
      minROIC: 20,
      minNetMargin: 10,
      maxDebtToEquity: 0.5,
      minCurrentRatio: 1.5,
      sortBy: 'roic',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });

    return {
      results: result.results,
      macroContext: macro,
      mode: fearMode ? 'FEAR_MODE' : 'NORMAL',
      recommendation: fearMode
        ? 'High quality companies on sale - aggressive accumulation opportunity'
        : 'Normal conditions - be selective'
    };
  }

  /**
   * Credit Stress Opportunities
   * Special situations when credit spreads widen
   */
  creditStressOpportunities(limit) {
    console.log('\n🎯 CREDIT STRESS OPPORTUNITIES SCREEN');

    const macro = this.getMacroContext();
    const hySpread = macro?.credit?.hySpread;
    const stressed = hySpread > 5;

    if (stressed) {
      console.log(`   🔥 HY Spread at ${hySpread?.toFixed(2)}% - Credit stress - Distressed opportunities\n`);
    } else {
      console.log(`   📊 HY Spread at ${hySpread?.toFixed(2)}% - Normal credit conditions\n`);
    }

    console.log('   Criteria: Strong balance sheets that can weather credit stress\n');

    // Look for companies with fortress balance sheets during stress
    const result = this.screen({
      maxDebtToEquity: 0.3,
      minCurrentRatio: 2.0,
      minInterestCoverage: 10,
      minFCFMargin: 10,
      sortBy: 'current_ratio',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    });

    return {
      results: result.results,
      macroContext: macro,
      stressLevel: stressed ? 'ELEVATED' : 'NORMAL',
      recommendation: stressed
        ? 'Credit stress period - fortress balance sheets will outperform'
        : 'Normal credit - broader opportunities available'
    };
  }

  /**
   * Comprehensive Value Investing Screen with Macro Overlay
   * Combines fundamental quality with macro context
   */
  valueInvestingWithMacro(limit) {
    console.log('\n🎯 VALUE INVESTING + MACRO OVERLAY SCREEN');

    const macro = this.getMacroContext();

    // Determine market regime
    let regime = 'NEUTRAL';
    let screenType = 'balanced';

    if (macro) {
      const vix = macro.vix?.value || 15;
      const spread = macro.yieldCurve?.spread2s10s || 0.5;
      const hySpread = macro.credit?.hySpread || 3;

      if (vix > 30 || hySpread > 7) {
        regime = 'CRISIS';
        screenType = 'defensive_quality';
      } else if (macro.yieldCurve?.isInverted2s10s) {
        regime = 'LATE_CYCLE';
        screenType = 'defensive';
      } else if (spread > 1.5 && vix < 20) {
        regime = 'EARLY_CYCLE';
        screenType = 'cyclical_value';
      } else if (vix > 25) {
        regime = 'FEAR';
        screenType = 'quality_accumulation';
      }

      console.log(`   Macro Regime: ${regime}`);
      console.log(`   VIX: ${vix.toFixed(1)}, 2s10s: ${spread.toFixed(2)}%, HY Spread: ${hySpread.toFixed(2)}%\n`);
    }

    let criteria = {
      sortBy: 'roic',
      maxDataAge: 2,
      excludeCIKOnly: true,
      ...(limit && { limit })
    };

    switch (screenType) {
      case 'defensive_quality':
        console.log('   Strategy: Defensive Quality (crisis conditions)\n');
        criteria = {
          ...criteria,
          sectors: ['Consumer Staples', 'Healthcare', 'Utilities'],
          minROIC: 15,
          maxDebtToEquity: 0.5,
          minCurrentRatio: 1.5
        };
        break;

      case 'defensive':
        console.log('   Strategy: Defensive (late cycle)\n');
        criteria = {
          ...criteria,
          minFCFYield: 5,
          maxDebtToEquity: 0.8,
          minNetMargin: 8
        };
        break;

      case 'cyclical_value':
        console.log('   Strategy: Cyclical Value (early cycle)\n');
        criteria = {
          ...criteria,
          maxPERatio: 15,
          minROIC: 12,
          minRevenueGrowth: 5
        };
        break;

      case 'quality_accumulation':
        console.log('   Strategy: Quality Accumulation (fear)\n');
        criteria = {
          ...criteria,
          minROIC: 18,
          maxDebtToEquity: 0.5,
          minGrossMargin: 40
        };
        break;

      default:
        console.log('   Strategy: Balanced Value (neutral)\n');
        criteria = {
          ...criteria,
          minROIC: 15,
          maxPERatio: 20,
          maxDebtToEquity: 1.0
        };
    }

    const result = this.screen(criteria);

    return {
      results: result.results,
      regime,
      strategy: screenType,
      macroContext: macro,
      total: result.total
    };
  }
}

module.exports = ScreeningService;
