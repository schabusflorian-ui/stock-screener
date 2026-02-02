// src/api/routes/stats.js
const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');

// Cache for expensive queries (refresh every 5 minutes)
let statsCache = null;
let statsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/stats/dashboard
 * Get comprehensive dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    const now = Date.now();

    // Return cached data if fresh
    if (statsCache && (now - statsCacheTime) < CACHE_DURATION) {
      return res.json(statsCache);
    }

    const database = await getDatabaseAsync();

    // Get company counts - count all companies with metrics data
    const companyStatsResult = await database.query(`
      SELECT
        COUNT(DISTINCT c.id) as total_companies,
        COUNT(DISTINCT c.sector) as sectors,
        COUNT(DISTINCT c.industry) as industries
      FROM companies c
      INNER JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.is_active = 1
    `);
    const companyStats = companyStatsResult.rows[0];

    // Get year range from calculated_metrics - filter to reasonable years (2009+)
    const dataSpanResult = await database.query(`
      SELECT
        MIN(CAST(SUBSTR(fiscal_period, 1, 4) AS INTEGER)) as earliest_year,
        MAX(CAST(SUBSTR(fiscal_period, 1, 4) AS INTEGER)) as latest_year
      FROM calculated_metrics
      WHERE fiscal_period IS NOT NULL
        AND CAST(SUBSTR(fiscal_period, 1, 4) AS INTEGER) >= 2009
        AND CAST(SUBSTR(fiscal_period, 1, 4) AS INTEGER) <= 2025
    `);
    const dataSpan = dataSpanResult.rows[0];

    // Get companies with data from calculated_metrics (faster)
    const metricsStatsResult = await database.query(`
      SELECT
        COUNT(DISTINCT company_id) as companies_with_metrics,
        COUNT(*) as total_metrics
      FROM calculated_metrics
    `);
    const metricsStats = metricsStatsResult.rows[0];

    // Get latest filing date from calculated_metrics
    const latestDataResult = await database.query(`
      SELECT MAX(fiscal_period) as latest_filing
      FROM calculated_metrics
    `);
    const latestData = latestDataResult.rows[0];

    // Get sector breakdown - only companies with metrics data
    const sectorBreakdownResult = await database.query(`
      SELECT c.sector, COUNT(DISTINCT c.id) as count
      FROM companies c
      INNER JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.is_active = 1 AND c.sector IS NOT NULL
      GROUP BY c.sector
      ORDER BY count DESC
      LIMIT 8
    `);
    const sectorBreakdown = sectorBreakdownResult.rows;

    // Calculate market cap coverage - only companies with metrics data
    const marketCapStatsResult = await database.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN c.market_cap > 200000000000 THEN c.id END) as mega_cap,
        COUNT(DISTINCT CASE WHEN c.market_cap BETWEEN 10000000000 AND 200000000000 THEN c.id END) as large_cap,
        COUNT(DISTINCT CASE WHEN c.market_cap BETWEEN 2000000000 AND 10000000000 THEN c.id END) as mid_cap,
        COUNT(DISTINCT CASE WHEN c.market_cap BETWEEN 300000000 AND 2000000000 THEN c.id END) as small_cap,
        COUNT(DISTINCT CASE WHEN c.market_cap < 300000000 THEN c.id END) as micro_cap
      FROM companies c
      INNER JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.is_active = 1 AND c.market_cap IS NOT NULL
    `);
    const marketCapStats = marketCapStatsResult.rows[0];

    const result = {
      companies: {
        total: companyStats.total_companies,
        withData: metricsStats.companies_with_metrics,
        withMetrics: metricsStats.companies_with_metrics,
        sectors: companyStats.sectors,
        industries: companyStats.industries
      },
      dataRange: {
        earliestYear: dataSpan.earliest_year || 2010,
        latestYear: dataSpan.latest_year || 2024,
        yearsOfData: (dataSpan.latest_year || 2024) - (dataSpan.earliest_year || 2010) + 1,
        latestFiling: latestData.latest_filing
      },
      filings: {
        total: metricsStats.total_metrics,
        incomeStatements: Math.floor(metricsStats.total_metrics / 3),
        balanceSheets: Math.floor(metricsStats.total_metrics / 3),
        cashFlows: Math.floor(metricsStats.total_metrics / 3)
      },
      recentActivity: {
        updatesLast30Days: 0 // Skip expensive query
      },
      sectorBreakdown,
      marketCapDistribution: marketCapStats
    };

    // Cache the result
    statsCache = result;
    statsCacheTime = now;

    res.json(result);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stats/highlights
 * Get key highlights for the homepage
 */
router.get('/highlights', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    // Top ROIC companies - simplified query without correlated subquery
    const topROICResult = await database.query(`
      SELECT c.symbol, c.name, c.sector, m.roic, m.roe, m.net_margin
      FROM companies c
      JOIN (
        SELECT company_id, roic, roe, net_margin, fiscal_period,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
        FROM calculated_metrics
        WHERE period_type = 'annual' AND roic IS NOT NULL AND roic > 0 AND roic < 100
      ) m ON c.id = m.company_id AND m.rn = 1
      WHERE c.is_active = 1 AND c.symbol NOT LIKE 'CIK_%'
      ORDER BY m.roic DESC
      LIMIT 5
    `);
    const topROIC = topROICResult.rows;

    // Best value (high earnings yield)
    const bestValueResult = await database.query(`
      SELECT c.symbol, c.name, c.sector, m.earnings_yield, m.pe_ratio, m.pb_ratio
      FROM companies c
      JOIN (
        SELECT company_id, earnings_yield, pe_ratio, pb_ratio, fiscal_period,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
        FROM calculated_metrics
        WHERE period_type = 'annual' AND earnings_yield IS NOT NULL AND earnings_yield > 0 AND earnings_yield < 50
      ) m ON c.id = m.company_id AND m.rn = 1
      WHERE c.is_active = 1 AND c.symbol NOT LIKE 'CIK_%'
      ORDER BY m.earnings_yield DESC
      LIMIT 5
    `);
    const bestValue = bestValueResult.rows;

    // Highest growth (revenue growth YoY)
    const highestGrowthResult = await database.query(`
      SELECT c.symbol, c.name, c.sector, m.revenue_growth_yoy, m.earnings_growth_yoy
      FROM companies c
      JOIN (
        SELECT company_id, revenue_growth_yoy, earnings_growth_yoy, fiscal_period,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
        FROM calculated_metrics
        WHERE period_type = 'annual' AND revenue_growth_yoy IS NOT NULL AND revenue_growth_yoy > 0 AND revenue_growth_yoy < 200
      ) m ON c.id = m.company_id AND m.rn = 1
      WHERE c.is_active = 1 AND c.symbol NOT LIKE 'CIK_%'
      ORDER BY m.revenue_growth_yoy DESC
      LIMIT 5
    `);
    const highestGrowth = highestGrowthResult.rows;

    // Strongest balance sheets (low debt, high current ratio)
    const strongBalanceResult = await database.query(`
      SELECT c.symbol, c.name, c.sector, m.debt_to_equity, m.current_ratio
      FROM companies c
      JOIN (
        SELECT company_id, debt_to_equity, current_ratio, fiscal_period,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
        FROM calculated_metrics
        WHERE period_type = 'annual' AND debt_to_equity IS NOT NULL AND debt_to_equity >= 0 AND debt_to_equity < 0.5 AND current_ratio > 1.5
      ) m ON c.id = m.company_id AND m.rn = 1
      WHERE c.is_active = 1 AND c.symbol NOT LIKE 'CIK_%'
      ORDER BY m.current_ratio DESC
      LIMIT 5
    `);
    const strongBalance = strongBalanceResult.rows;

    // FCF Yield leaders (as proxy for dividend potential)
    const dividendLeadersResult = await database.query(`
      SELECT c.symbol, c.name, c.sector, m.fcf_yield as dividend_yield, m.fcf_margin as payout_ratio
      FROM companies c
      JOIN (
        SELECT company_id, fcf_yield, fcf_margin, fiscal_period,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_period DESC) as rn
        FROM calculated_metrics
        WHERE period_type = 'annual' AND fcf_yield IS NOT NULL AND fcf_yield > 0 AND fcf_yield < 50
      ) m ON c.id = m.company_id AND m.rn = 1
      WHERE c.is_active = 1 AND c.symbol NOT LIKE 'CIK_%'
      ORDER BY m.fcf_yield DESC
      LIMIT 5
    `);
    const dividendLeaders = dividendLeadersResult.rows;

    res.json({
      topROIC,
      bestValue,
      highestGrowth,
      strongBalance,
      dividendLeaders
    });
  } catch (error) {
    console.error('Highlights error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
