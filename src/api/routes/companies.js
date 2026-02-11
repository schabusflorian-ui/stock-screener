// src/api/routes/companies.js
const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const newsService = require('../../services/newsService');
const currencyService = require('../../services/currencyService');
const indexMappingService = require('../../services/indexMappingService');
const { responseCacheMiddleware } = require('../../middleware/apiOptimization');

// Cache configurations for different endpoints (Tier 3 optimization)
const CACHE_SHORT = { ttl: 30000 };   // 30 seconds for frequently changing data
const CACHE_MEDIUM = { ttl: 120000 }; // 2 minutes for moderate data
const CACHE_LONG = { ttl: 300000 };   // 5 minutes for stable data

/**
 * Calculate Q4 data from annual report minus Q1+Q2+Q3
 * Companies don't file 10-Q for Q4, only 10-K annual reports
 * This function fills in the missing Q4 quarters
 */
async function calculateMissingQ4Data(database, companyId, existingQuarterly, limit) {
  // Get fiscal config to know fiscal year end
  const fiscalConfigResult = await database.query(`
    SELECT fiscal_year_end_month FROM company_fiscal_config WHERE company_id = ?
  `, [companyId]);
  const fiscalConfig = fiscalConfigResult.rows[0];

  if (!fiscalConfig) return existingQuarterly;

  const fyeMonth = fiscalConfig.fiscal_year_end_month;

  // Get annual data to calculate Q4s
  const annualDataResult = await database.query(`
    SELECT
      fiscal_date_ending,
      fiscal_year,
      total_revenue,
      cost_of_revenue,
      gross_profit,
      operating_income,
      net_income,
      data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'income_statement'
      AND period_type = 'annual'
    ORDER BY fiscal_date_ending DESC
    LIMIT 10
  `, [companyId]);
  const annualData = annualDataResult.rows;

  // Build a map of existing quarters by date for O(1) lookups (optimization from O(n*m) to O(n+m))
  const existingDates = new Set(existingQuarterly.map(q => q.fiscal_date_ending));
  const quartersByDate = new Map(existingQuarterly.map(q => [q.fiscal_date_ending, q]));

  // For each fiscal year, check if Q4 is missing and calculate it
  const calculatedQ4s = [];

  for (const annual of annualData) {
    const annualDate = new Date(annual.fiscal_date_ending);
    const annualYear = annualDate.getFullYear();

    // Q4 ends at fiscal year end (same as annual)
    const q4EndDate = annual.fiscal_date_ending;

    // Skip if Q4 already exists
    if (existingDates.has(q4EndDate)) continue;

    // Find Q1, Q2, Q3 for this fiscal year by looking at quarters
    // that fall within this fiscal year's date range
    // For Apple (Sept FYE): FY2024 annual ends 2024-09-30
    //   Q1 ends 2023-12-31, Q2 ends 2024-03-31, Q3 ends 2024-06-30

    // Calculate Q1/Q2/Q3 end dates based on FYE
    // Q1 ends 3 months after FY start = FYE + 3 months
    // Q2 ends 6 months after FY start = FYE + 6 months
    // Q3 ends 9 months after FY start = FYE + 9 months
    const getQuarterEndDate = (quarterNum) => {
      const monthsAfterFYE = quarterNum * 3;
      let month = fyeMonth + monthsAfterFYE;
      let year = annualYear;

      if (month > 12) {
        month = month - 12;
      } else {
        year = annualYear - 1;
      }

      // Get last day of month
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    };

    const q1End = getQuarterEndDate(1);
    const q2End = getQuarterEndDate(2);
    const q3End = getQuarterEndDate(3);

    // Find matching quarters using Map for O(1) lookups (was O(n) with .find())
    const q1 = quartersByDate.get(q1End);
    const q2 = quartersByDate.get(q2End);
    const q3 = quartersByDate.get(q3End);

    // Only calculate if we have all 3 quarters
    if (q1 && q2 && q3) {
      const sumQ123 = (field) => {
        return (q1[field] || 0) + (q2[field] || 0) + (q3[field] || 0);
      };

      // Calculate Q4 = Annual - (Q1 + Q2 + Q3)
      const q4Revenue = (annual.total_revenue || 0) - sumQ123('total_revenue');
      const q4CostOfRevenue = (annual.cost_of_revenue || 0) - sumQ123('cost_of_revenue');
      const q4GrossProfit = (annual.gross_profit || 0) - sumQ123('gross_profit');
      const q4OperatingIncome = (annual.operating_income || 0) - sumQ123('operating_income');
      const q4NetIncome = (annual.net_income || 0) - sumQ123('net_income');

      // Build Q4 data object (matching the structure of quarterly data)
      const q4Data = {
        fiscal_date_ending: q4EndDate,
        fiscal_year: annual.fiscal_year,
        fiscal_period: 'Q4',
        period_type: 'quarterly',
        total_revenue: q4Revenue,
        cost_of_revenue: q4CostOfRevenue,
        gross_profit: q4GrossProfit,
        operating_income: q4OperatingIncome,
        net_income: q4NetIncome,
        data: JSON.stringify({
          revenue: q4Revenue,
          costOfRevenue: q4CostOfRevenue,
          grossProfit: q4GrossProfit,
          operatingIncome: q4OperatingIncome,
          netIncome: q4NetIncome,
          _calculated: true,
          _note: 'Q4 calculated from annual - (Q1+Q2+Q3)'
        }),
        _calculated: true
      };

      calculatedQ4s.push(q4Data);
    }
  }

  // Merge calculated Q4s with existing data and sort by date descending
  const allQuarters = [...existingQuarterly, ...calculatedQ4s];
  allQuarters.sort((a, b) => b.fiscal_date_ending.localeCompare(a.fiscal_date_ending));

  // Apply limit
  return allQuarters.slice(0, limit);
}

/**
 * GET /api/companies
 * List all companies
 * Query params:
 *   - search: search term for symbol or name (optional)
 *   - include_cik: 'true' to include CIK-based symbols (default: false)
 *   - include_inactive: 'true' to include inactive/delisted companies (default: false)
 */
// On list/search errors (e.g. tables not migrated), return 200 with empty data so UI loads
function handleCompaniesListError(res, error) {
  console.warn('[Companies API]', error.message);
  return res.status(200).json({ count: 0, companies: [] });
}

router.get('/', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { search, include_cik = 'false', include_inactive = 'false' } = req.query;
    const excludeCIK = include_cik !== 'true';
    const activeOnly = include_inactive !== 'true';

    // If search provided, do an optimized search
    if (search && search.length >= 1) {
      const searchUpper = search.toUpperCase();
      const searchLower = search.toLowerCase();

      // Build a single query with prioritized results
      // Symbol exact match > Symbol prefix > Name contains
      const results = [];

      // 1. Exact symbol match (uses index, instant)
      const exactMatchResult = await database.query(`
        SELECT id, symbol, name, sector, industry
        FROM companies
        WHERE symbol = ?
          ${activeOnly ? 'AND is_active = 1' : ''}
      `, [searchUpper]);
      const exactMatch = exactMatchResult.rows[0];

      if (exactMatch) {
        results.push(exactMatch);
      }

      // 2. Symbol prefix matches (uses index)
      const prefixMatchesResult = await database.query(`
        SELECT id, symbol, name, sector, industry
        FROM companies
        WHERE symbol LIKE ? ESCAPE '\\'
          AND symbol != ?
          ${activeOnly ? 'AND is_active = 1' : ''}
          ${excludeCIK ? "AND symbol NOT LIKE 'CIK_%'" : ''}
        ORDER BY LENGTH(symbol), symbol
        LIMIT 8
      `, [searchUpper + '%', searchUpper]);
      const prefixMatches = prefixMatchesResult.rows;

      results.push(...prefixMatches);

      // 3. Name contains (only if we need more results)
      if (results.length < 10) {
        const existingSymbols = results.map(r => r.symbol);
        const placeholders = existingSymbols.length > 0
          ? `AND symbol NOT IN (${existingSymbols.map(() => '?').join(',')})`
          : '';
        const limit = 10 - results.length;

        const queryParams = ['%' + searchLower + '%', ...existingSymbols, searchLower + '%', limit];

        const nameMatchesResult = await database.query(`
          SELECT id, symbol, name, sector, industry
          FROM companies
          WHERE LOWER(name) LIKE ? ESCAPE '\\'
            ${activeOnly ? 'AND is_active = 1' : ''}
            ${excludeCIK ? "AND symbol NOT LIKE 'CIK_%'" : ''}
            ${placeholders}
          ORDER BY
            CASE WHEN LOWER(name) LIKE ? THEN 0 ELSE 1 END,
            LENGTH(name),
            symbol
          LIMIT ?
        `, queryParams);
        const nameMatches = nameMatchesResult.rows;

        results.push(...nameMatches);
      }

      return res.json({
        count: results.length,
        companies: results
      });
    }

    const companiesResult = await database.query(`
      SELECT
        c.*,
        COUNT(DISTINCT f.fiscal_date_ending) as years_of_data,
        MAX(f.fiscal_date_ending) as latest_data,
        MAX(m.roic) as latest_roic,
        MAX(m.roe) as latest_roe,
        MAX(m.net_margin) as latest_net_margin
      FROM companies c
      LEFT JOIN financial_data f ON c.id = f.company_id
      LEFT JOIN calculated_metrics m ON c.id = m.company_id
        AND m.fiscal_period = (
          SELECT MAX(fiscal_period) FROM calculated_metrics
          WHERE company_id = c.id AND period_type = 'annual'
        )
      WHERE 1=1
        ${activeOnly ? 'AND c.is_active = 1' : ''}
        ${excludeCIK ? "AND c.symbol NOT LIKE 'CIK_%'" : ''}
      GROUP BY c.id
      ORDER BY c.symbol
    `);
    const companies = companiesResult.rows;

    res.json({
      count: companies.length,
      companies
    });
  } catch (error) {
    handleCompaniesListError(res, error);
  }
});

/**
 * GET /api/companies/:symbol
 * Get single company details
 */
router.get('/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;

    const companyResult = await database.query(`
      SELECT * FROM companies WHERE LOWER(symbol) = LOWER(?)
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        symbol,
        code: 'COMPANY_NOT_FOUND',
        hint: 'Symbol may not exist in database. Try /api/companies?search=' + encodeURIComponent(symbol) + ' to find available symbols.'
      });
    }

    // Get latest metrics - prioritize records with COMPLETE valuation metrics
    // TTM records may have incomplete data, so prefer annual/quarterly if they have more metrics
    // Strategy: Find the most recent record that has valuation metrics (pe_ratio, peg_ratio, ev_ebitda)
    // If none found, fall back to any record with basic metrics
    let metricsResult = await database.query(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
        AND pe_ratio IS NOT NULL
        AND (peg_ratio IS NOT NULL OR ev_ebitda IS NOT NULL)
      ORDER BY fiscal_period DESC
      LIMIT 1
    `, [company.id]);
    let metrics = metricsResult.rows[0];

    // Fallback: if no record with full valuation metrics, get any with basic metrics
    if (!metrics) {
      metricsResult = await database.query(`
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
          AND (roic IS NOT NULL OR roe IS NOT NULL OR net_margin IS NOT NULL OR fcf IS NOT NULL)
        ORDER BY fiscal_period DESC
        LIMIT 1
      `, [company.id]);
      metrics = metricsResult.rows[0];
    }

    // Get current price metrics for live valuation and market data
    const priceMetricsResult = await database.query(`
      SELECT
        last_price,
        market_cap,
        shares_outstanding,
        beta,
        enterprise_value,
        change_1d,
        change_1w,
        change_1m,
        change_3m,
        change_6m,
        change_1y,
        change_ytd,
        high_52w,
        high_52w_date,
        low_52w,
        low_52w_date,
        sma_50,
        sma_200,
        rsi_14,
        volatility_30d,
        avg_volume_30d,
        max_drawdown_1y,
        max_drawdown_3y,
        max_drawdown_5y,
        drawdown_recovery_days,
        -- Alpha vs SPY (global benchmark)
        alpha_1d,
        alpha_1w,
        alpha_1m,
        alpha_3m,
        alpha_6m,
        alpha_1y,
        alpha_ytd,
        benchmark_symbol,
        -- Alpha vs home index
        alpha_1d_home,
        alpha_1w_home,
        alpha_1m_home,
        alpha_3m_home,
        alpha_6m_home,
        alpha_1y_home,
        alpha_ytd_home,
        home_benchmark,
        updated_at
      FROM price_metrics
      WHERE company_id = ?
    `, [company.id]);
    const priceMetrics = priceMetricsResult.rows[0];

    // If we have current market cap, recalculate valuation metrics
    const enrichedMetrics = metrics ? { ...metrics } : null;
    if (enrichedMetrics && priceMetrics?.market_cap && priceMetrics.market_cap > 0) {
      const currentMarketCap = priceMetrics.market_cap;

      // For valuation metrics (PE, PS), use annual/TTM data, not quarterly
      // Get the most recent annual data for valuation metrics
      const annualFinancialsResult = await database.query(`
        SELECT net_income, total_revenue, fiscal_date_ending
        FROM financial_data
        WHERE company_id = ? AND statement_type = 'income_statement' AND period_type = 'annual'
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `, [company.id]);
      const annualFinancials = annualFinancialsResult.rows[0];

      // Get balance sheet for current period (for P/B ratio)
      const balanceSheetResult = await database.query(`
        SELECT shareholder_equity
        FROM financial_data
        WHERE company_id = ? AND statement_type = 'balance_sheet'
        ORDER BY fiscal_date_ending DESC
        LIMIT 1
      `, [company.id]);
      const balanceSheet = balanceSheetResult.rows[0];

      // Get annual FCF (for FCF yield)
      const annualMetricsResult = await database.query(`
        SELECT fcf
        FROM calculated_metrics
        WHERE company_id = ? AND period_type = 'annual'
        ORDER BY fiscal_period DESC
        LIMIT 1
      `, [company.id]);
      const annualMetrics = annualMetricsResult.rows[0];

      if (annualFinancials) {
        const netIncome = annualFinancials.net_income;
        const revenue = annualFinancials.total_revenue;
        const bookValue = balanceSheet?.shareholder_equity;
        const annualFcf = annualMetrics?.fcf;

        // Recalculate valuation metrics with current market cap and annual financials
        if (netIncome && netIncome > 0) {
          enrichedMetrics.pe_ratio = currentMarketCap / netIncome;
          enrichedMetrics.earnings_yield = (netIncome / currentMarketCap) * 100;
        }
        if (annualFcf && annualFcf > 0) {
          enrichedMetrics.fcf_yield = (annualFcf / currentMarketCap) * 100;
        }
        if (revenue && revenue > 0) {
          enrichedMetrics.ps_ratio = currentMarketCap / revenue;
        }
        if (bookValue && bookValue > 0) {
          enrichedMetrics.pb_ratio = currentMarketCap / bookValue;
        }

        // Add market cap info to metrics
        enrichedMetrics.current_market_cap = currentMarketCap;
        enrichedMetrics.market_cap_updated_at = priceMetrics.updated_at;
        enrichedMetrics.valuation_based_on = annualFinancials.fiscal_date_ending;
      }
    }

    // Get reporting currency for non-US companies
    const reportingCurrency = await currencyService.getCompanyCurrency(company.id);
    const currencyInfo = currencyService.getCurrencyInfo(reportingCurrency);

    // Get home index for company based on country
    const homeIndex = indexMappingService.getHomeIndex(company.country);
    const isUS = indexMappingService.isUSCompany(company.country);

    res.json({
      company,
      latest_metrics: enrichedMetrics,
      price_metrics: priceMetrics,
      currency: {
        reporting: reportingCurrency,
        symbol: currencyInfo.symbol,
        name: currencyInfo.name,
        isUSD: reportingCurrency === 'USD'
      },
      home_index: {
        code: homeIndex.code,
        etf: homeIndex.etf,
        name: homeIndex.name,
        flag: homeIndex.flag,
        isUS: isUS
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/financials
 * Get all financial statements
 */
router.get('/:symbol/financials', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const financialsResult = await database.query(`
      SELECT
        statement_type,
        fiscal_date_ending,
        fiscal_year,
        period_type,
        data
      FROM financial_data
      WHERE company_id = ?
      ORDER BY fiscal_date_ending DESC
    `, [company.id]);
    const financials = financialsResult.rows;

    // Parse JSON data
    const parsed = financials.map(f => ({
      ...f,
      data: JSON.parse(f.data)
    }));

    // Group by statement type
    const grouped = {
      balance_sheet: parsed.filter(f => f.statement_type === 'balance_sheet'),
      income_statement: parsed.filter(f => f.statement_type === 'income_statement'),
      cash_flow: parsed.filter(f => f.statement_type === 'cash_flow')
    };

    res.json(grouped);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/metrics
 * Get all calculated metrics (historical)
 * Query params:
 *   - limit: number of records (default 20)
 *   - period_type: 'annual', 'quarterly', or 'all' (default 'annual')
 * Optimized: Batch queries instead of N+1 pattern
 */
router.get('/:symbol/metrics', responseCacheMiddleware(CACHE_MEDIUM), async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { limit = 20, period_type = 'annual' } = req.query;

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    let query;
    let params;

    if (period_type === 'all') {
      query = `
        SELECT * FROM calculated_metrics
        WHERE company_id = ?
        ORDER BY fiscal_period DESC
        LIMIT ?
      `;
      params = [company.id, parseInt(limit)];
    } else {
      query = `
        SELECT * FROM calculated_metrics
        WHERE company_id = ? AND period_type = ?
        ORDER BY fiscal_period DESC
        LIMIT ?
      `;
      params = [company.id, period_type, parseInt(limit)];
    }

    const metricsResult = await database.query(query, params);
    const metrics = metricsResult.rows;

    if (metrics.length === 0) {
      return res.json({
        symbol: symbol.toUpperCase(),
        count: 0,
        period_type,
        metrics: []
      });
    }

    // Get fiscal config for this company
    const fiscalConfigResult = await database.query(`
      SELECT fiscal_year_end, fiscal_year_end_month, fiscal_year_end_day
      FROM company_fiscal_config
      WHERE company_id = ?
    `, [company.id]);
    const fiscalConfig = fiscalConfigResult.rows[0];

    // Get current market cap from price_metrics for live valuation metrics
    const currentPriceMetricsResult = await database.query(`
      SELECT last_price, market_cap, updated_at
      FROM price_metrics
      WHERE company_id = ?
    `, [company.id]);
    const currentPriceMetrics = currentPriceMetricsResult.rows[0];
    const currentMarketCap = currentPriceMetrics?.market_cap;

    // OPTIMIZATION: Batch fetch all needed data upfront instead of N+1 queries
    const fiscalPeriods = metrics.map(m => m.fiscal_period);

    // Batch fetch income statement data for all periods
    const incomeDataBatchResult = await database.query(`
      SELECT fiscal_date_ending, total_revenue, net_income, operating_income, gross_profit, data
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'income_statement'
        AND fiscal_date_ending IN (${fiscalPeriods.map(() => '?').join(',')})
    `, [company.id, ...fiscalPeriods]);
    const incomeDataBatch = incomeDataBatchResult.rows;
    const incomeMap = new Map(incomeDataBatch.map(d => [d.fiscal_date_ending, d]));

    // Batch fetch balance sheet data for all periods
    const balanceSheetBatchResult = await database.query(`
      SELECT fiscal_date_ending, shareholder_equity
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'balance_sheet'
        AND fiscal_date_ending IN (${fiscalPeriods.map(() => '?').join(',')})
    `, [company.id, ...fiscalPeriods]);
    const balanceSheetBatch = balanceSheetBatchResult.rows;
    const balanceSheetMap = new Map(balanceSheetBatch.map(d => [d.fiscal_date_ending, d]));

    // Batch fetch stock prices - get latest price <= each fiscal period
    // Use window function to get the most recent price for each period
    // Handle edge case where there's only one period (avoid empty UNION ALL)
    let priceMap = new Map();
    if (fiscalPeriods.length > 0) {
      const periodUnionSQL = fiscalPeriods.length === 1
        ? 'SELECT ? as period'
        : `SELECT ? as period${fiscalPeriods.slice(1).map(() => ' UNION ALL SELECT ?').join('')}`;

      const priceDataBatchResult = await database.query(`
        WITH period_prices AS (
          SELECT
            fp.period,
            dp.adjusted_close,
            dp.close,
            dp.date,
            ROW_NUMBER() OVER (PARTITION BY fp.period ORDER BY dp.date DESC) as rn
          FROM (${periodUnionSQL}) fp
          JOIN daily_prices dp ON dp.company_id = ? AND dp.date <= CAST(fp.period AS DATE)
        )
        SELECT period, adjusted_close, close, date
        FROM period_prices
        WHERE rn = 1
      `, [...fiscalPeriods, company.id]);
    const priceDataBatch = priceDataBatchResult.rows;
      priceMap = new Map(priceDataBatch.map(d => [d.period, d]));
    }

    // Enrich metrics with pre-fetched data
    const enrichedMetrics = metrics.map(m => {
      const priceData = priceMap.get(m.fiscal_period);
      const incomeData = incomeMap.get(m.fiscal_period);
      const balanceSheet = balanceSheetMap.get(m.fiscal_period);

      // Build fiscal label - calculate based on fiscal year end config
      let fiscalLabel = null;
      let calendarLabel = null;
      let fiscalInfo = null;

      if (fiscalConfig && m.fiscal_period) {
        const periodDate = new Date(m.fiscal_period);
        const periodMonth = periodDate.getMonth() + 1;
        const periodYear = periodDate.getFullYear();
        const fyeMonth = fiscalConfig.fiscal_year_end_month;
        const calendarQuarter = Math.ceil(periodMonth / 3);

        if (m.period_type === 'annual') {
          const fiscalYear = m.fiscal_year || (periodMonth <= fyeMonth ? periodYear : periodYear + 1);
          fiscalLabel = `FY${fiscalYear}`;
          calendarLabel = String(periodYear);
        } else {
          const fyQ1StartMonth = (fyeMonth % 12) + 1;
          let monthsFromFYStart = periodMonth - fyQ1StartMonth;
          if (monthsFromFYStart < 0) monthsFromFYStart += 12;
          const fiscalQuarter = Math.floor(monthsFromFYStart / 3) + 1;
          let fiscalYear = periodYear;
          if (periodMonth > fyeMonth) fiscalYear = periodYear + 1;

          fiscalLabel = `FY${fiscalYear} Q${fiscalQuarter}`;
          calendarLabel = `Q${calendarQuarter} ${periodYear}`;
          fiscalInfo = {
            fiscalYear,
            fiscalQuarter: `Q${fiscalQuarter}`,
            periodEnd: m.fiscal_period,
            calendarQuarter,
            calendarYear: periodYear
          };
        }
      } else if (m.period_type === 'annual' && m.fiscal_year) {
        fiscalLabel = `FY${m.fiscal_year}`;
        calendarLabel = m.fiscal_period ? m.fiscal_period.substring(0, 4) : null;
      }

      // Calculate live valuation metrics using current market cap
      const liveValuationMetrics = {};
      if (currentMarketCap && currentMarketCap > 0 && incomeData) {
        const netIncome = incomeData.net_income;
        const revenue = incomeData.total_revenue;
        const bookValue = balanceSheet?.shareholder_equity;

        if (netIncome && netIncome > 0) {
          liveValuationMetrics.pe_ratio_live = currentMarketCap / netIncome;
          liveValuationMetrics.earnings_yield_live = (netIncome / currentMarketCap) * 100;
        }
        if (m.fcf && m.fcf > 0) {
          liveValuationMetrics.fcf_yield_live = (m.fcf / currentMarketCap) * 100;
        }
        if (revenue && revenue > 0) {
          liveValuationMetrics.ps_ratio_live = currentMarketCap / revenue;
        }
        if (bookValue && bookValue > 0) {
          liveValuationMetrics.pb_ratio_live = currentMarketCap / bookValue;
        }
      }

      // Parse EBITDA from JSON data if available
      let ebitda = null;
      if (incomeData?.data) {
        try {
          const fullData = JSON.parse(incomeData.data);
          ebitda = parseFloat(fullData.ebitda) || parseFloat(fullData.EBITDA) || null;
        } catch (e) {}
      }

      return {
        ...m,
        ...liveValuationMetrics,
        current_market_cap: currentMarketCap || null,
        stock_price: priceData ? (priceData.adjusted_close || priceData.close) : null,
        stock_price_date: priceData ? priceData.date : null,
        revenue: incomeData?.total_revenue || null,
        net_income: incomeData?.net_income || null,
        operating_income: incomeData?.operating_income || null,
        gross_profit: incomeData?.gross_profit || null,
        ebitda,
        fiscal_label: fiscalLabel,
        calendar_label: calendarLabel,
        fiscal_info: fiscalInfo
      };
    });

    // Get available period types for this company
    const periodTypesResult = await database.query(`
      SELECT DISTINCT period_type, COUNT(*) as count
      FROM calculated_metrics
      WHERE company_id = ?
      GROUP BY period_type
    `, [company.id]);
    const periodTypes = periodTypesResult.rows;

    // Build fiscal year end info
    const fiscalYearEndInfo = fiscalConfig ? {
      monthDay: fiscalConfig.fiscal_year_end,
      month: fiscalConfig.fiscal_year_end_month,
      day: fiscalConfig.fiscal_year_end_day,
      monthName: ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'][fiscalConfig.fiscal_year_end_month - 1]
    } : null;

    // Determine data source from metrics (sec = US quarterly, xbrl = EU annual)
    const dataSource = enrichedMetrics[0]?.data_source || 'sec';

    // Get reporting currency for non-US companies
    const reportingCurrency = await currencyService.getCompanyCurrency(company.id);
    const currencyInfo = currencyService.getCurrencyInfo(reportingCurrency);

    // Add USD-converted values for monetary fields if not already USD
    const metricsWithCurrency = enrichedMetrics.map(m => {
      const result = { ...m, reporting_currency: reportingCurrency };
      if (reportingCurrency !== 'USD') {
        // Add USD equivalents for key monetary values
        if (m.revenue) result.revenue_usd = currencyService.toUSD(m.revenue, reportingCurrency);
        if (m.net_income) result.net_income_usd = currencyService.toUSD(m.net_income, reportingCurrency);
        if (m.fcf) result.fcf_usd = currencyService.toUSD(m.fcf, reportingCurrency);
        if (m.operating_income) result.operating_income_usd = currencyService.toUSD(m.operating_income, reportingCurrency);
      }
      return result;
    });

    res.json({
      symbol: symbol.toUpperCase(),
      count: metricsWithCurrency.length,
      period_type,
      data_source: dataSource,
      fiscal_year_end: fiscalYearEndInfo,
      available_periods: periodTypes,
      metrics: metricsWithCurrency,
      currency: {
        reporting: reportingCurrency,
        symbol: currencyInfo.symbol,
        name: currencyInfo.name,
        isUSD: reportingCurrency === 'USD'
      },
      current_price_data: currentPriceMetrics ? {
        price: currentPriceMetrics.last_price,
        market_cap: currentPriceMetrics.market_cap,
        updated_at: currentPriceMetrics.updated_at
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/breakdown
 * Get detailed financial breakdown for analysis
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 *   - limit: number of periods (default 10)
 */
router.get('/:symbol/breakdown', responseCacheMiddleware(CACHE_MEDIUM), async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { period_type = 'annual', limit = 10 } = req.query;

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get income statement data with extracted fields and full JSON
    const incomeStatementsResult = await database.query(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_period,
        period_type,
        total_revenue,
        cost_of_revenue,
        gross_profit,
        operating_income,
        net_income,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'income_statement'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `, [company.id, period_type, parseInt(limit)]);
    let incomeStatements = incomeStatementsResult.rows;

    // For quarterly data, calculate Q4 from annual - (Q1+Q2+Q3) if missing
    // Companies don't file 10-Q for Q4, only 10-K annual reports
    if (period_type === 'quarterly') {
      incomeStatements = await calculateMissingQ4Data(database, company.id, incomeStatements, parseInt(limit));
    }

    // Get fiscal config for this company
    const fiscalConfigResult = await database.query(`
      SELECT fiscal_year_end, fiscal_year_end_month, fiscal_year_end_day
      FROM company_fiscal_config
      WHERE company_id = ?
    `, [company.id]);
    const fiscalConfig = fiscalConfigResult.rows[0];

    // Process and enrich the data
    const breakdown = incomeStatements.map(stmt => {
      const fullData = JSON.parse(stmt.data);
      const revenue = stmt.total_revenue || parseFloat(fullData.revenue) || 0;

      // Build fiscal label - always calculate based on fiscal year end config
      let fiscalLabel = null;
      let calendarLabel = null;
      let fiscalInfo = null;

      if (fiscalConfig && stmt.fiscal_date_ending) {
        const periodDate = new Date(stmt.fiscal_date_ending);
        const periodMonth = periodDate.getMonth() + 1; // 1-12
        const periodYear = periodDate.getFullYear();
        const fyeMonth = fiscalConfig.fiscal_year_end_month;
        const calendarQuarter = Math.ceil(periodMonth / 3);

        // For annual reports, use simple FY label
        if (period_type === 'annual') {
          const fiscalYear = stmt.fiscal_year || (periodMonth <= fyeMonth ? periodYear : periodYear + 1);
          fiscalLabel = `FY${fiscalYear}`;
          calendarLabel = String(periodYear);
        } else {
          // Quarterly: calculate which fiscal quarter this is
          const fyQ1StartMonth = (fyeMonth % 12) + 1;
          let monthsFromFYStart = periodMonth - fyQ1StartMonth;
          if (monthsFromFYStart < 0) monthsFromFYStart += 12;

          const fiscalQuarter = Math.floor(monthsFromFYStart / 3) + 1;
          let fiscalYear = periodYear;
          if (periodMonth > fyeMonth) {
            fiscalYear = periodYear + 1;
          }

          fiscalLabel = `FY${fiscalYear} Q${fiscalQuarter}`;
          calendarLabel = `Q${calendarQuarter} ${periodYear}`;

          fiscalInfo = {
            fiscal_year: fiscalYear,
            fiscal_quarter: `Q${fiscalQuarter}`,
            period_end: stmt.fiscal_date_ending,
            calendar_quarter: calendarQuarter,
            calendar_year: periodYear
          };
        }
      } else if (period_type === 'annual' && stmt.fiscal_year) {
        fiscalLabel = `FY${stmt.fiscal_year}`;
        calendarLabel = stmt.fiscal_date_ending ? stmt.fiscal_date_ending.substring(0, 4) : null;
      }

      // Extract cost components
      const costOfRevenue = stmt.cost_of_revenue || parseFloat(fullData.costOfRevenue) || 0;
      const grossProfit = stmt.gross_profit || parseFloat(fullData.grossProfit) || 0;
      const operatingIncome = stmt.operating_income || parseFloat(fullData.operatingIncome) || 0;
      const netIncome = stmt.net_income || parseFloat(fullData.netIncome) || 0;

      // Operating expenses breakdown
      const researchAndDevelopment = parseFloat(fullData.researchAndDevelopment) || parseFloat(fullData.ResearchAndDevelopmentExpense) || 0;
      const sellingGeneralAdmin = parseFloat(fullData.sellingGeneralAndAdministrative) || parseFloat(fullData.SellingGeneralAndAdministrativeExpense) || 0;
      const depreciation = parseFloat(fullData.depreciation) || parseFloat(fullData.DepreciationAndAmortization) || 0;
      const interestExpense = parseFloat(fullData.interestExpense) || parseFloat(fullData.InterestExpense) || 0;
      const incomeTaxExpense = parseFloat(fullData.incomeTaxExpense) || parseFloat(fullData.IncomeTaxExpenseBenefit) || 0;

      // Calculate derived values
      const operatingExpenses = grossProfit - operatingIncome;
      const otherExpenses = operatingIncome - netIncome - incomeTaxExpense;

      // Calculate percentages of revenue
      const calcPercent = (value) => revenue > 0 ? (value / revenue) * 100 : 0;

      return {
        period: stmt.fiscal_date_ending,
        fiscal_year: stmt.fiscal_year,
        fiscal_period: stmt.fiscal_period,
        period_type: stmt.period_type,
        fiscal_label: fiscalLabel,
        calendar_label: calendarLabel,
        fiscal_info: fiscalInfo ? {
          fiscalYear: fiscalInfo.fiscal_year,
          fiscalQuarter: fiscalInfo.fiscal_quarter,
          periodStart: fiscalInfo.period_start,
          periodEnd: fiscalInfo.period_end,
          calendarQuarter: fiscalInfo.calendar_quarter,
          calendarYear: fiscalInfo.calendar_year
        } : null,

        // Absolute values
        revenue,
        costOfRevenue,
        grossProfit,
        operatingExpenses,
        operatingIncome,
        netIncome,

        // Cost breakdown
        costs: {
          costOfRevenue,
          researchAndDevelopment,
          sellingGeneralAdmin,
          depreciation,
          interestExpense,
          incomeTaxExpense,
          otherExpenses: Math.max(0, otherExpenses)
        },

        // Margin percentages
        margins: {
          grossMargin: calcPercent(grossProfit),
          operatingMargin: calcPercent(operatingIncome),
          netMargin: calcPercent(netIncome),
          costOfRevenuePercent: calcPercent(costOfRevenue),
          rdPercent: calcPercent(researchAndDevelopment),
          sgaPercent: calcPercent(sellingGeneralAdmin),
          taxRate: operatingIncome > 0 ? (incomeTaxExpense / operatingIncome) * 100 : 0
        },

        // EPS data if available
        eps: {
          basic: parseFloat(fullData.ePSBasic) || parseFloat(fullData.EarningsPerShareBasic) || null,
          diluted: parseFloat(fullData.ePSDiluted) || parseFloat(fullData.EarningsPerShareDiluted) || null
        }
      };
    });

    // Get available periods
    const availablePeriodsResult = await database.query(`
      SELECT DISTINCT period_type, COUNT(*) as count
      FROM financial_data
      WHERE company_id = ? AND statement_type = 'income_statement'
      GROUP BY period_type
    `, [company.id]);
    const availablePeriods = availablePeriodsResult.rows;

    // Build fiscal year end info
    const fiscalYearEndInfo = fiscalConfig ? {
      monthDay: fiscalConfig.fiscal_year_end,
      month: fiscalConfig.fiscal_year_end_month,
      day: fiscalConfig.fiscal_year_end_day,
      monthName: ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'][fiscalConfig.fiscal_year_end_month - 1]
    } : null;

    // Get reporting currency for non-US companies
    const reportingCurrency = await currencyService.getCompanyCurrency(company.id);
    const currencyInfo = currencyService.getCurrencyInfo(reportingCurrency);

    // Add USD-converted values for monetary fields if not already USD
    const breakdownWithUSD = breakdown.map(item => {
      if (reportingCurrency === 'USD') {
        return item;
      }
      return {
        ...item,
        // USD equivalents for absolute values
        revenue_usd: currencyService.toUSD(item.revenue, reportingCurrency),
        costOfRevenue_usd: currencyService.toUSD(item.costOfRevenue, reportingCurrency),
        grossProfit_usd: currencyService.toUSD(item.grossProfit, reportingCurrency),
        operatingExpenses_usd: currencyService.toUSD(item.operatingExpenses, reportingCurrency),
        operatingIncome_usd: currencyService.toUSD(item.operatingIncome, reportingCurrency),
        netIncome_usd: currencyService.toUSD(item.netIncome, reportingCurrency),
        // USD equivalents for cost breakdown
        costs_usd: {
          costOfRevenue: currencyService.toUSD(item.costs.costOfRevenue, reportingCurrency),
          researchAndDevelopment: currencyService.toUSD(item.costs.researchAndDevelopment, reportingCurrency),
          sellingGeneralAdmin: currencyService.toUSD(item.costs.sellingGeneralAdmin, reportingCurrency),
          depreciation: currencyService.toUSD(item.costs.depreciation, reportingCurrency),
          interestExpense: currencyService.toUSD(item.costs.interestExpense, reportingCurrency),
          incomeTaxExpense: currencyService.toUSD(item.costs.incomeTaxExpense, reportingCurrency),
          otherExpenses: currencyService.toUSD(item.costs.otherExpenses, reportingCurrency),
        }
      };
    });

    res.json({
      symbol: symbol.toUpperCase(),
      period_type,
      fiscal_year_end: fiscalYearEndInfo,
      count: breakdownWithUSD.length,
      available_periods: availablePeriods,
      breakdown: breakdownWithUSD,
      currency: {
        reporting: reportingCurrency,
        symbol: currencyInfo.symbol,
        name: currencyInfo.name,
        isUSD: reportingCurrency === 'USD'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/balance-sheet
 * Get detailed balance sheet breakdown
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 *   - limit: number of periods (default 10)
 */
router.get('/:symbol/balance-sheet', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { period_type = 'annual', limit = 10 } = req.query;

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const balanceSheetsResult = await database.query(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_period,
        period_type,
        total_assets,
        total_liabilities,
        shareholder_equity,
        current_assets,
        current_liabilities,
        cash_and_equivalents,
        long_term_debt,
        short_term_debt,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'balance_sheet'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `, [company.id, period_type, parseInt(limit)]);
    const balanceSheets = balanceSheetsResult.rows;

    // Also fetch 'all' statement type for reconciliation
    // When 'all' balances but 'balance_sheet' doesn't, use 'all' values
    const allStatementsResult = await database.query(`
      SELECT
        fiscal_date_ending,
        total_assets,
        total_liabilities,
        shareholder_equity,
        current_assets,
        current_liabilities,
        cash_and_equivalents,
        long_term_debt,
        short_term_debt
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'all'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `, [company.id, period_type, parseInt(limit)]);
    const allStatements = allStatementsResult.rows;

    // Create lookup map for 'all' data by period
    const allDataMap = new Map();
    for (const a of allStatements) {
      allDataMap.set(a.fiscal_date_ending, a);
    }

    const breakdown = balanceSheets.map(stmt => {
      let fullData = {};
      try {
        fullData = JSON.parse(stmt.data || '{}');
      } catch (e) {
        fullData = {};
      }

      // ========================================
      // DATA QUALITY: Reconcile with 'all' statement if balance_sheet doesn't balance
      // ========================================
      const allData = allDataMap.get(stmt.fiscal_date_ending);
      let reconciledStmt = { ...stmt };

      if (allData && allData.total_assets && allData.total_liabilities && allData.shareholder_equity) {
        const allDiff = Math.abs(allData.total_assets - (allData.total_liabilities + allData.shareholder_equity)) / allData.total_assets;

        // If 'all' balances within 1%
        if (allDiff < 0.01 && stmt.total_assets && stmt.total_liabilities && stmt.shareholder_equity) {
          const bsDiff = Math.abs(stmt.total_assets - (stmt.total_liabilities + stmt.shareholder_equity)) / stmt.total_assets;

          // If balance_sheet doesn't balance (>5% difference), use 'all' values
          if (bsDiff > 0.05) {
            reconciledStmt.total_assets = allData.total_assets;
            reconciledStmt.total_liabilities = allData.total_liabilities;
            reconciledStmt.shareholder_equity = allData.shareholder_equity;
            reconciledStmt.current_assets = allData.current_assets || stmt.current_assets;
            reconciledStmt.current_liabilities = allData.current_liabilities || stmt.current_liabilities;
            reconciledStmt.cash_and_equivalents = allData.cash_and_equivalents || stmt.cash_and_equivalents;
            reconciledStmt.long_term_debt = allData.long_term_debt || stmt.long_term_debt;
            reconciledStmt.short_term_debt = allData.short_term_debt || stmt.short_term_debt;
          }
        }
      }

      // Track data quality status
      let dataQuality = {
        reconciled: false,
        balances: true,
        imbalancePct: 0,
        warning: null
      };

      // Check if reconciliation was applied
      if (reconciledStmt.total_assets !== stmt.total_assets ||
          reconciledStmt.shareholder_equity !== stmt.shareholder_equity) {
        dataQuality.reconciled = true;
      }

      // Use reconciled values
      stmt = reconciledStmt;

      // Assets breakdown
      const totalAssets = stmt.total_assets || parseFloat(fullData.totalAssets) || parseFloat(fullData.Assets) || 0;
      const currentAssets = stmt.current_assets || parseFloat(fullData.currentAssets) || parseFloat(fullData.AssetsCurrent) || 0;
      const noncurrentAssets = parseFloat(fullData.noncurrentAssets) || parseFloat(fullData.AssetsNoncurrent) || (totalAssets - currentAssets);

      // Current assets breakdown
      const cashAndEquivalents = stmt.cash_and_equivalents || parseFloat(fullData.cashAndEquivalents) || parseFloat(fullData.CashAndCashEquivalentsAtCarryingValue) || 0;
      const accountsReceivable = parseFloat(fullData.accountsReceivable) || parseFloat(fullData.AccountsReceivableNetCurrent) || 0;
      const inventory = parseFloat(fullData.inventory) || parseFloat(fullData.InventoryNet) || 0;
      const otherCurrentAssets = Math.max(0, currentAssets - cashAndEquivalents - accountsReceivable - inventory);

      // Non-current assets breakdown
      const propertyPlantEquipment = parseFloat(fullData.propertyPlantEquipment) || parseFloat(fullData.PropertyPlantAndEquipmentNet) || 0;
      const goodwill = parseFloat(fullData.goodwill) || parseFloat(fullData.Goodwill) || 0;
      const intangibleAssets = parseFloat(fullData.intangibleAssets) || parseFloat(fullData.IntangibleAssetsNetExcludingGoodwill) || 0;
      const longTermInvestments = parseFloat(fullData.longTermInvestments) || parseFloat(fullData.LongTermInvestments) || parseFloat(fullData.MarketableSecuritiesNoncurrent) || 0;
      const otherNoncurrentAssets = Math.max(0, noncurrentAssets - propertyPlantEquipment - goodwill - intangibleAssets - longTermInvestments);

      // Liabilities breakdown
      const totalLiabilities = stmt.total_liabilities || parseFloat(fullData.totalLiabilities) || parseFloat(fullData.Liabilities) || 0;
      const currentLiabilities = stmt.current_liabilities || parseFloat(fullData.currentLiabilities) || parseFloat(fullData.LiabilitiesCurrent) || 0;
      const noncurrentLiabilities = parseFloat(fullData.noncurrentLiabilities) || parseFloat(fullData.LiabilitiesNoncurrent) || (totalLiabilities - currentLiabilities);

      // Current liabilities breakdown
      const accountsPayable = parseFloat(fullData.accountsPayable) || parseFloat(fullData.AccountsPayableCurrent) || 0;
      const shortTermDebt = stmt.short_term_debt || parseFloat(fullData.shortTermDebt) || parseFloat(fullData.LongTermDebtCurrent) || parseFloat(fullData.ShortTermBorrowings) || 0;
      const deferredRevenue = parseFloat(fullData.deferredRevenue) || parseFloat(fullData.ContractWithCustomerLiabilityCurrent) || 0;
      const otherCurrentLiabilities = Math.max(0, currentLiabilities - accountsPayable - shortTermDebt - deferredRevenue);

      // Non-current liabilities breakdown
      const longTermDebt = stmt.long_term_debt || parseFloat(fullData.longTermDebt) || parseFloat(fullData.LongTermDebtNoncurrent) || 0;
      const deferredTaxLiabilities = parseFloat(fullData.deferredTaxLiabilities) || parseFloat(fullData.DeferredIncomeTaxLiabilitiesNet) || 0;
      const otherNoncurrentLiabilities = Math.max(0, noncurrentLiabilities - longTermDebt - deferredTaxLiabilities);

      // Equity breakdown
      const shareholderEquity = stmt.shareholder_equity || parseFloat(fullData.shareholderEquity) || parseFloat(fullData.StockholdersEquity) || 0;
      const retainedEarnings = parseFloat(fullData.retainedEarnings) || parseFloat(fullData.RetainedEarningsAccumulatedDeficit) || 0;
      const commonStock = parseFloat(fullData.commonStock) || parseFloat(fullData.CommonStockValue) || 0;
      const treasuryStock = parseFloat(fullData.treasuryStock) || parseFloat(fullData.TreasuryStockValue) || 0;
      const accumulatedOtherComprehensiveIncome = parseFloat(fullData.accumulatedOtherComprehensiveIncome) || parseFloat(fullData.AccumulatedOtherComprehensiveIncomeLossNetOfTax) || 0;

      // Calculate ratios
      const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
      const quickRatio = currentLiabilities > 0 ? (currentAssets - inventory) / currentLiabilities : 0;
      const debtToEquity = shareholderEquity > 0 ? totalLiabilities / shareholderEquity : 0;
      const debtToAssets = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
      const totalDebt = shortTermDebt + longTermDebt;
      const netDebt = totalDebt - cashAndEquivalents;

      // Check if final data balances (Assets = Liabilities + Equity)
      if (totalAssets > 0 && totalLiabilities >= 0 && shareholderEquity !== 0) {
        const imbalance = Math.abs(totalAssets - (totalLiabilities + shareholderEquity));
        dataQuality.imbalancePct = (imbalance / totalAssets) * 100;

        if (dataQuality.imbalancePct > 1) {
          dataQuality.balances = false;
          if (dataQuality.imbalancePct > 50) {
            dataQuality.warning = 'Critical data quality issue: Balance sheet does not balance. Assets ≠ Liabilities + Equity.';
          } else if (dataQuality.imbalancePct > 10) {
            dataQuality.warning = 'Data quality warning: Balance sheet has significant discrepancy.';
          } else {
            dataQuality.warning = 'Minor data discrepancy in balance sheet.';
          }
        }
      }

      return {
        period: stmt.fiscal_date_ending,
        fiscal_year: stmt.fiscal_year,
        fiscal_period: stmt.fiscal_period,
        period_type: stmt.period_type,

        // Summary totals
        summary: {
          totalAssets,
          totalLiabilities,
          shareholderEquity,
          totalDebt,
          netDebt,
          workingCapital: currentAssets - currentLiabilities
        },

        // Assets breakdown
        assets: {
          total: totalAssets,
          current: {
            total: currentAssets,
            cashAndEquivalents,
            accountsReceivable,
            inventory,
            other: otherCurrentAssets
          },
          noncurrent: {
            total: noncurrentAssets,
            propertyPlantEquipment,
            goodwill,
            intangibleAssets,
            longTermInvestments,
            other: otherNoncurrentAssets
          }
        },

        // Liabilities breakdown
        liabilities: {
          total: totalLiabilities,
          current: {
            total: currentLiabilities,
            accountsPayable,
            shortTermDebt,
            deferredRevenue,
            other: otherCurrentLiabilities
          },
          noncurrent: {
            total: noncurrentLiabilities,
            longTermDebt,
            deferredTaxLiabilities,
            other: otherNoncurrentLiabilities
          }
        },

        // Equity breakdown
        equity: {
          total: shareholderEquity,
          commonStock,
          retainedEarnings,
          treasuryStock,
          accumulatedOtherComprehensiveIncome
        },

        // Financial ratios
        ratios: {
          currentRatio,
          quickRatio,
          debtToEquity,
          debtToAssets,
          equityRatio: totalAssets > 0 ? shareholderEquity / totalAssets : 0,
          cashRatio: currentLiabilities > 0 ? cashAndEquivalents / currentLiabilities : 0
        },

        // Data quality indicator
        dataQuality
      };
    });

    // Get reporting currency for non-US companies
    const reportingCurrency = await currencyService.getCompanyCurrency(company.id);
    const currencyInfo = currencyService.getCurrencyInfo(reportingCurrency);

    res.json({
      symbol: symbol.toUpperCase(),
      period_type,
      count: breakdown.length,
      breakdown,
      currency: {
        reporting: reportingCurrency,
        symbol: currencyInfo.symbol,
        name: currencyInfo.name,
        isUSD: reportingCurrency === 'USD'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/cash-flow
 * Get detailed cash flow statement breakdown
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 *   - limit: number of periods (default 10)
 */
router.get('/:symbol/cash-flow', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { period_type = 'annual', limit = 10 } = req.query;

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get cash flow statements
    const cashFlowsResult = await database.query(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_period,
        period_type,
        operating_cashflow,
        capital_expenditures,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'cash_flow'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `, [company.id, period_type, parseInt(limit)]);
    const cashFlows = cashFlowsResult.rows;

    // Also get corresponding income statement data for context
    const incomeDataResult = await database.query(`
      SELECT
        fiscal_date_ending,
        net_income,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'income_statement'
        AND period_type = ?
      ORDER BY fiscal_date_ending DESC
      LIMIT ?
    `, [company.id, period_type, parseInt(limit)]);
    const incomeData = incomeDataResult.rows;

    // Create a map for quick lookup
    const incomeMap = {};
    incomeData.forEach(inc => {
      incomeMap[inc.fiscal_date_ending] = inc;
    });

    const breakdown = cashFlows.map(stmt => {
      const fullData = JSON.parse(stmt.data);
      const incomeStmt = incomeMap[stmt.fiscal_date_ending];
      const netIncome = incomeStmt?.net_income || 0;

      // Operating activities
      const operatingCashFlow = stmt.operating_cashflow || parseFloat(fullData.operatingCashFlow) || parseFloat(fullData.NetCashProvidedByUsedInOperatingActivities) || 0;
      const depreciation = parseFloat(fullData.depreciation) || parseFloat(fullData.DepreciationDepletionAndAmortization) || 0;
      const stockBasedCompensation = parseFloat(fullData.stockBasedCompensation) || parseFloat(fullData.ShareBasedCompensation) || 0;
      const deferredIncomeTax = parseFloat(fullData.deferredIncomeTax) || parseFloat(fullData.DeferredIncomeTaxExpenseBenefit) || 0;
      const changeInWorkingCapital = parseFloat(fullData.changeInWorkingCapital) || parseFloat(fullData.IncreaseDecreaseInOperatingCapital) || 0;
      const changeInReceivables = parseFloat(fullData.changeInReceivables) || parseFloat(fullData.IncreaseDecreaseInAccountsReceivable) || 0;
      const changeInInventory = parseFloat(fullData.changeInInventory) || parseFloat(fullData.IncreaseDecreaseInInventories) || 0;
      const changeInPayables = parseFloat(fullData.changeInPayables) || parseFloat(fullData.IncreaseDecreaseInAccountsPayable) || 0;

      // Investing activities
      const investingCashFlow = parseFloat(fullData.investingCashFlow) || parseFloat(fullData.NetCashProvidedByUsedInInvestingActivities) || 0;
      const capitalExpenditures = stmt.capital_expenditures || parseFloat(fullData.capitalExpenditures) || parseFloat(fullData.PaymentsToAcquirePropertyPlantAndEquipment) || 0;
      const acquisitions = parseFloat(fullData.acquisitions) || parseFloat(fullData.PaymentsToAcquireBusinessesNetOfCashAcquired) || 0;
      const investmentPurchases = parseFloat(fullData.investmentPurchases) || parseFloat(fullData.PaymentsToAcquireInvestments) || 0;
      const investmentSales = parseFloat(fullData.investmentSales) || parseFloat(fullData.ProceedsFromSaleOfInvestments) || parseFloat(fullData.ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities) || 0;

      // Financing activities
      const financingCashFlow = parseFloat(fullData.financingCashFlow) || parseFloat(fullData.NetCashProvidedByUsedInFinancingActivities) || 0;
      const dividends = parseFloat(fullData.dividends) || parseFloat(fullData.PaymentsOfDividends) || 0;
      const stockRepurchase = parseFloat(fullData.stockRepurchase) || parseFloat(fullData.PaymentsForRepurchaseOfCommonStock) || 0;
      const debtRepayment = parseFloat(fullData.debtRepayment) || parseFloat(fullData.RepaymentsOfLongTermDebt) || 0;
      const debtIssuance = parseFloat(fullData.debtIssuance) || parseFloat(fullData.ProceedsFromIssuanceOfLongTermDebt) || 0;
      const stockIssuance = parseFloat(fullData.stockIssuance) || parseFloat(fullData.ProceedsFromIssuanceOfCommonStock) || 0;

      // Calculate derived metrics
      const freeCashFlow = operatingCashFlow - Math.abs(capitalExpenditures);
      const netChangeInCash = operatingCashFlow + investingCashFlow + financingCashFlow;
      const capitalReturned = dividends + stockRepurchase;

      // Calculate quality metrics
      const cashFlowToNetIncome = netIncome !== 0 ? operatingCashFlow / netIncome : 0;
      const capexToOperatingCF = operatingCashFlow !== 0 ? Math.abs(capitalExpenditures) / operatingCashFlow : 0;
      const fcfToOperatingCF = operatingCashFlow !== 0 ? freeCashFlow / operatingCashFlow : 0;

      return {
        period: stmt.fiscal_date_ending,
        fiscal_year: stmt.fiscal_year,
        fiscal_period: stmt.fiscal_period,
        period_type: stmt.period_type,

        // Summary
        summary: {
          operatingCashFlow,
          investingCashFlow,
          financingCashFlow,
          netChangeInCash,
          freeCashFlow,
          netIncome,
          capitalReturned
        },

        // Operating activities breakdown
        operating: {
          total: operatingCashFlow,
          netIncome,
          adjustments: {
            depreciation,
            stockBasedCompensation,
            deferredIncomeTax,
            otherNonCash: operatingCashFlow - netIncome - depreciation - stockBasedCompensation - deferredIncomeTax - changeInWorkingCapital
          },
          workingCapitalChanges: {
            total: changeInWorkingCapital,
            receivables: changeInReceivables,
            inventory: changeInInventory,
            payables: changeInPayables
          }
        },

        // Investing activities breakdown
        investing: {
          total: investingCashFlow,
          capitalExpenditures: -Math.abs(capitalExpenditures), // Show as negative
          acquisitions: -Math.abs(acquisitions),
          investmentPurchases: -Math.abs(investmentPurchases),
          investmentSales: Math.abs(investmentSales),
          other: investingCashFlow + Math.abs(capitalExpenditures) + Math.abs(acquisitions) + Math.abs(investmentPurchases) - Math.abs(investmentSales)
        },

        // Financing activities breakdown
        financing: {
          total: financingCashFlow,
          dividends: -Math.abs(dividends),
          stockRepurchase: -Math.abs(stockRepurchase),
          debtRepayment: -Math.abs(debtRepayment),
          debtIssuance: Math.abs(debtIssuance),
          stockIssuance: Math.abs(stockIssuance),
          other: financingCashFlow + Math.abs(dividends) + Math.abs(stockRepurchase) + Math.abs(debtRepayment) - Math.abs(debtIssuance) - Math.abs(stockIssuance)
        },

        // Quality metrics
        quality: {
          cashFlowToNetIncome, // Should be > 1 ideally
          capexToOperatingCF, // Lower is better (more discretionary CF)
          fcfToOperatingCF, // Higher is better
          fcfConversion: netIncome !== 0 ? freeCashFlow / netIncome : 0
        }
      };
    });

    // Get reporting currency for non-US companies
    const reportingCurrency = await currencyService.getCompanyCurrency(company.id);
    const currencyInfo = currencyService.getCurrencyInfo(reportingCurrency);

    res.json({
      symbol: symbol.toUpperCase(),
      period_type,
      count: breakdown.length,
      breakdown,
      currency: {
        reporting: reportingCurrency,
        symbol: currencyInfo.symbol,
        name: currencyInfo.name,
        isUSD: reportingCurrency === 'USD'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/companies/:symbol/analysis
 * Get comprehensive analysis data including quality scores, peer comparison, valuation history
 * Query params:
 *   - period_type: 'annual' or 'quarterly' (default 'annual')
 */
router.get('/:symbol/analysis', responseCacheMiddleware(CACHE_MEDIUM), async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { period_type = 'annual' } = req.query;

    const companyResult = await database.query(
      'SELECT * FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get all financial data in a single query (3 queries -> 1)
    const allFinancialsResult = await database.query(`
      SELECT statement_type, fiscal_date_ending, fiscal_year, data,
             total_assets, total_liabilities, shareholder_equity,
             current_assets, current_liabilities, long_term_debt,
             total_revenue, net_income, operating_income, gross_profit,
             operating_cashflow, capital_expenditures
      FROM financial_data
      WHERE company_id = ? AND period_type = ?
        AND statement_type IN ('balance_sheet', 'income_statement', 'cash_flow')
      ORDER BY fiscal_date_ending DESC
    `, [company.id, period_type]);
    const allFinancials = allFinancialsResult.rows;

    // Split by statement type and limit to 5 each
    const balanceSheets = allFinancials
      .filter(f => f.statement_type === 'balance_sheet')
      .slice(0, 5);
    const incomeStatements = allFinancials
      .filter(f => f.statement_type === 'income_statement')
      .slice(0, 5);
    const cashFlows = allFinancials
      .filter(f => f.statement_type === 'cash_flow')
      .slice(0, 5);

    // Get historical metrics for valuation history
    const metricsHistoryResult = await database.query(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ? AND period_type = ?
      ORDER BY fiscal_period DESC
      LIMIT 10
    `, [company.id, period_type]);
    const metricsHistory = metricsHistoryResult.rows;

    // Calculate Piotroski F-Score (0-9 points)
    const piotroskiScore = calculatePiotroskiScore(balanceSheets, incomeStatements, cashFlows);

    // Calculate Altman Z-Score
    const altmanZScore = calculateAltmanZScore(balanceSheets, incomeStatements, company.market_cap);

    // Get peer companies and sector averages in a single optimized query using CTE
    // This avoids the N+1 correlated subquery pattern
    // Uses market_cap_usd for cross-currency comparison
    const peerAndSectorDataResult = await database.query(`
      WITH latest_metrics AS (
        SELECT company_id, MAX(fiscal_period) as max_period
        FROM calculated_metrics
        WHERE period_type = ?
        GROUP BY company_id
      ),
      company_latest AS (
        SELECT c.id, c.symbol, c.name, c.sector, c.industry,
               c.reporting_currency, c.country,
               pm.market_cap, pm.market_cap_usd,
               m.roic, m.roe, m.net_margin, m.debt_to_equity, m.fcf_yield,
               m.pe_ratio, m.pb_ratio, m.revenue_growth_yoy
        FROM companies c
        JOIN latest_metrics lm ON c.id = lm.company_id
        JOIN calculated_metrics m ON c.id = m.company_id
          AND m.fiscal_period = lm.max_period AND m.period_type = ?
        LEFT JOIN price_metrics pm ON c.id = pm.company_id
        WHERE c.is_active = 1
      )
      SELECT
        cl.*,
        CASE WHEN cl.industry = ? AND cl.symbol != ? THEN 1 ELSE 0 END as is_peer,
        CASE WHEN cl.sector = ? THEN 1 ELSE 0 END as is_sector
      FROM company_latest cl
      WHERE cl.industry = ? OR cl.sector = ?
    `, [period_type, period_type, company.industry, symbol.toUpperCase(), company.sector, company.industry, company.sector]);
    const peerAndSectorData = peerAndSectorDataResult.rows;

    // Split results into peers and calculate sector averages
    // Sort by USD-normalized market cap for fair cross-currency comparison
    const peers = peerAndSectorData
      .filter(r => r.is_peer)
      .sort((a, b) => (b.market_cap_usd || b.market_cap || 0) - (a.market_cap_usd || a.market_cap || 0))
      .slice(0, 10);

    const sectorCompanies = peerAndSectorData.filter(r => r.is_sector);
    const sectorAvg = sectorCompanies.length > 0 ? {
      avg_roic: sectorCompanies.reduce((sum, c) => sum + (c.roic || 0), 0) / sectorCompanies.length,
      avg_roe: sectorCompanies.reduce((sum, c) => sum + (c.roe || 0), 0) / sectorCompanies.length,
      avg_net_margin: sectorCompanies.reduce((sum, c) => sum + (c.net_margin || 0), 0) / sectorCompanies.length,
      avg_debt_to_equity: sectorCompanies.reduce((sum, c) => sum + (c.debt_to_equity || 0), 0) / sectorCompanies.length,
      avg_pe: sectorCompanies.reduce((sum, c) => sum + (c.pe_ratio || 0), 0) / sectorCompanies.length,
      avg_pb: sectorCompanies.reduce((sum, c) => sum + (c.pb_ratio || 0), 0) / sectorCompanies.length,
      company_count: sectorCompanies.length
    } : null;

    // Calculate capital allocation from cash flow
    const capitalAllocation = calculateCapitalAllocation(cashFlows);

    // Build valuation history
    const valuationHistory = metricsHistory.map(m => ({
      period: m.fiscal_period,
      pe_ratio: m.pe_ratio,
      pb_ratio: m.pb_ratio,
      ps_ratio: m.ps_ratio,
      ev_ebitda: m.ev_ebitda,
      fcf_yield: m.fcf_yield,
      earnings_yield: m.earnings_yield
    }));

    res.json({
      symbol: symbol.toUpperCase(),
      company: {
        name: company.name,
        sector: company.sector,
        industry: company.industry,
        market_cap: company.market_cap
      },
      qualityScores: {
        piotroski: piotroskiScore,
        altmanZ: altmanZScore
      },
      capitalAllocation,
      valuationHistory,
      peerComparison: {
        peers,
        sectorAverage: sectorAvg
      },
      latestMetrics: metricsHistory[0] || null
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Calculate Piotroski F-Score
function calculatePiotroskiScore(balanceSheets, incomeStatements, cashFlows) {
  if (balanceSheets.length < 2 || incomeStatements.length < 2 || cashFlows.length < 1) {
    return { score: null, components: {}, interpretation: 'Insufficient data' };
  }

  const current = {
    bs: balanceSheets[0],
    is: incomeStatements[0],
    cf: cashFlows[0]
  };
  const prior = {
    bs: balanceSheets[1],
    is: incomeStatements[1]
  };

  // Parse JSON data
  const currentBSData = JSON.parse(current.bs.data);
  const priorBSData = JSON.parse(prior.bs.data);
  const currentISData = JSON.parse(current.is.data);
  const priorISData = JSON.parse(prior.is.data);
  const currentCFData = JSON.parse(current.cf.data);

  // Extract values
  const netIncome = current.is.net_income || parseFloat(currentISData.netIncome) || 0;
  const totalAssets = current.bs.total_assets || parseFloat(currentBSData.totalAssets) || 1;
  const priorTotalAssets = prior.bs.total_assets || parseFloat(priorBSData.totalAssets) || 1;
  const avgAssets = (totalAssets + priorTotalAssets) / 2;

  const operatingCashFlow = current.cf.operating_cashflow || parseFloat(currentCFData.operatingCashFlow) || 0;

  const currentLiabilities = current.bs.current_liabilities || parseFloat(currentBSData.currentLiabilities) || 1;
  const priorCurrentLiabilities = prior.bs.current_liabilities || parseFloat(priorBSData.currentLiabilities) || 1;
  const currentAssets = current.bs.current_assets || parseFloat(currentBSData.currentAssets) || 0;
  const priorCurrentAssets = prior.bs.current_assets || parseFloat(priorBSData.currentAssets) || 0;

  const longTermDebt = current.bs.long_term_debt || parseFloat(currentBSData.longTermDebt) || 0;
  const priorLongTermDebt = prior.bs.long_term_debt || parseFloat(priorBSData.longTermDebt) || 0;

  const grossProfit = current.is.gross_profit || parseFloat(currentISData.grossProfit) || 0;
  const priorGrossProfit = prior.is.gross_profit || parseFloat(priorISData.grossProfit) || 0;
  const revenue = current.is.total_revenue || parseFloat(currentISData.revenue) || 1;
  const priorRevenue = prior.is.total_revenue || parseFloat(priorISData.revenue) || 1;

  const sharesOutstanding = parseFloat(currentBSData.commonSharesOutstanding) || parseFloat(currentBSData.CommonStockSharesOutstanding) || 1;
  const priorSharesOutstanding = parseFloat(priorBSData.commonSharesOutstanding) || parseFloat(priorBSData.CommonStockSharesOutstanding) || 1;

  // Calculate ratios
  const roa = netIncome / avgAssets;
  const priorROA = (prior.is.net_income || parseFloat(priorISData.netIncome) || 0) / priorTotalAssets;
  const currentRatio = currentAssets / currentLiabilities;
  const priorCurrentRatio = priorCurrentAssets / priorCurrentLiabilities;
  const grossMargin = grossProfit / revenue;
  const priorGrossMargin = priorGrossProfit / priorRevenue;
  const assetTurnover = revenue / avgAssets;
  const priorAssetTurnover = priorRevenue / priorTotalAssets;

  // Score components (1 point each if condition is met)
  const components = {
    // Profitability (4 points)
    positiveNetIncome: netIncome > 0 ? 1 : 0,
    positiveROA: roa > 0 ? 1 : 0,
    positiveCFO: operatingCashFlow > 0 ? 1 : 0,
    cfoGreaterThanNetIncome: operatingCashFlow > netIncome ? 1 : 0, // Accrual quality

    // Leverage & Liquidity (3 points)
    decreasingLeverage: longTermDebt <= priorLongTermDebt ? 1 : 0,
    increasingCurrentRatio: currentRatio >= priorCurrentRatio ? 1 : 0,
    noNewShares: sharesOutstanding <= priorSharesOutstanding ? 1 : 0,

    // Operating Efficiency (2 points)
    increasingGrossMargin: grossMargin >= priorGrossMargin ? 1 : 0,
    increasingAssetTurnover: assetTurnover >= priorAssetTurnover ? 1 : 0
  };

  const score = Object.values(components).reduce((sum, val) => sum + val, 0);

  let interpretation;
  if (score >= 8) interpretation = 'Strong - High quality stock';
  else if (score >= 6) interpretation = 'Good - Above average quality';
  else if (score >= 4) interpretation = 'Average - Mixed signals';
  else if (score >= 2) interpretation = 'Weak - Below average quality';
  else interpretation = 'Very Weak - Potential value trap';

  return {
    score,
    maxScore: 9,
    components,
    interpretation,
    period: current.is.fiscal_date_ending
  };
}

// Helper: Calculate Altman Z-Score
function calculateAltmanZScore(balanceSheets, incomeStatements, marketCap) {
  if (balanceSheets.length < 1 || incomeStatements.length < 1) {
    return { score: null, interpretation: 'Insufficient data' };
  }

  const bs = balanceSheets[0];
  const is = incomeStatements[0];
  const bsData = JSON.parse(bs.data);
  const isData = JSON.parse(is.data);

  const totalAssets = bs.total_assets || parseFloat(bsData.totalAssets) || 1;
  const totalLiabilities = bs.total_liabilities || parseFloat(bsData.totalLiabilities) || 0;
  const currentAssets = bs.current_assets || parseFloat(bsData.currentAssets) || 0;
  const currentLiabilities = bs.current_liabilities || parseFloat(bsData.currentLiabilities) || 0;
  const retainedEarnings = parseFloat(bsData.retainedEarnings) || parseFloat(bsData.RetainedEarningsAccumulatedDeficit) || 0;

  const revenue = is.total_revenue || parseFloat(isData.revenue) || 0;
  const operatingIncome = is.operating_income || parseFloat(isData.operatingIncome) || 0;

  // Use EBIT approximation
  const ebit = operatingIncome;

  // Working capital
  const workingCapital = currentAssets - currentLiabilities;

  // Market value of equity (use market cap if available, else book value)
  const bookEquity = totalAssets - totalLiabilities;
  const marketEquity = marketCap || bookEquity;

  // Altman Z-Score formula (for public manufacturing companies)
  // Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
  const A = workingCapital / totalAssets;  // Working Capital / Total Assets
  const B = retainedEarnings / totalAssets; // Retained Earnings / Total Assets
  const C = ebit / totalAssets;             // EBIT / Total Assets
  const D = marketEquity / totalLiabilities; // Market Value Equity / Total Liabilities
  const E = revenue / totalAssets;          // Sales / Total Assets

  const zScore = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);

  let interpretation, zone;
  if (zScore > 2.99) {
    interpretation = 'Safe Zone - Low bankruptcy risk';
    zone = 'safe';
  } else if (zScore >= 1.81) {
    interpretation = 'Grey Zone - Moderate risk, needs monitoring';
    zone = 'grey';
  } else {
    interpretation = 'Distress Zone - High bankruptcy risk';
    zone = 'distress';
  }

  return {
    score: parseFloat(zScore.toFixed(2)),
    zone,
    components: {
      workingCapitalRatio: parseFloat(A.toFixed(4)),
      retainedEarningsRatio: parseFloat(B.toFixed(4)),
      ebitRatio: parseFloat(C.toFixed(4)),
      marketToDebtRatio: parseFloat(D.toFixed(4)),
      assetTurnover: parseFloat(E.toFixed(4))
    },
    interpretation,
    period: bs.fiscal_date_ending
  };
}

// Helper: Calculate Capital Allocation
function calculateCapitalAllocation(cashFlows) {
  if (cashFlows.length < 1) {
    return null;
  }

  const allocations = cashFlows.map(cf => {
    const data = JSON.parse(cf.data);

    const operatingCF = cf.operating_cashflow || parseFloat(data.operatingCashFlow) || 0;
    const capex = Math.abs(cf.capital_expenditures || parseFloat(data.capitalExpenditures) || parseFloat(data.PaymentsToAcquirePropertyPlantAndEquipment) || 0);
    const dividends = Math.abs(parseFloat(data.dividends) || parseFloat(data.PaymentsOfDividends) || 0);
    const buybacks = Math.abs(parseFloat(data.stockRepurchase) || parseFloat(data.PaymentsForRepurchaseOfCommonStock) || 0);
    const debtRepayment = Math.abs(parseFloat(data.debtRepayment) || parseFloat(data.RepaymentsOfLongTermDebt) || 0);
    const debtIssuance = parseFloat(data.debtIssuance) || parseFloat(data.ProceedsFromIssuanceOfLongTermDebt) || 0;
    const acquisitions = Math.abs(parseFloat(data.acquisitions) || parseFloat(data.PaymentsToAcquireBusinessesNetOfCashAcquired) || 0);

    const fcf = operatingCF - capex;
    const totalReturned = dividends + buybacks;
    const netDebtChange = debtIssuance - debtRepayment;

    return {
      period: cf.fiscal_date_ending,
      operatingCashFlow: operatingCF,
      capex: -capex,
      freeCashFlow: fcf,
      dividends: -dividends,
      buybacks: -buybacks,
      totalReturned: -totalReturned,
      debtRepayment: -debtRepayment,
      debtIssuance,
      netDebtChange,
      acquisitions: -acquisitions,
      // Percentages of FCF
      dividendPayoutRatio: fcf > 0 ? (dividends / fcf) * 100 : null,
      buybackRatio: fcf > 0 ? (buybacks / fcf) * 100 : null,
      reinvestmentRate: fcf > 0 ? (capex / fcf) * 100 : null
    };
  });

  return allocations;
}

/**
 * GET /api/companies/:symbol/news
 * Get news, SEC filings, and analyst estimates
 */
router.get('/:symbol/news', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;

    const companyResult = await database.query(
      'SELECT * FROM companies WHERE LOWER(symbol) = LOWER(?)',
      [symbol.toUpperCase()]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get CIK if we have it (for SEC filings)
    const cik = company.cik || null;

    const newsData = await newsService.getCompanyNewsAndEvents(symbol, cik);

    res.json(newsData);
  } catch (error) {
    console.error('News API error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
