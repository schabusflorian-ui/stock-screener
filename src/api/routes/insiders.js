// src/api/routes/insiders.js
// API routes for insider trading data

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');

// Check if error is due to missing insider tables (e.g. in fresh PostgreSQL deployments)
function isInsiderTableMissingError(err) {
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  
  // Check for table name mentions
  const mentionsInsiderTable = 
    msg.includes('insider_transactions') ||
    msg.includes('insider_activity_summary') ||
    msg.includes('insiders');
  
  // Check for various "does not exist" errors
  const isNotExistError =
    msg.includes('does not exist') ||
    msg.includes('no such table') ||
    msg.includes('relation') && msg.includes('does not exist') ||
    code === '42P01' || // PostgreSQL: undefined_table
    code === '42703' || // PostgreSQL: undefined_column
    code === 'SQLITE_ERROR';
  
  // Also check for generic "relation" errors from PostgreSQL
  const isRelationError = code === '42P01' || (msg.includes('relation') && msg.includes('does not exist'));
  
  return (mentionsInsiderTable && isNotExistError) || isRelationError;
}
const InsiderTracker = require('../../services/insiderTracker');

let insiderTracker = null;
let insiderTrackerPromise = null;

async function getInsiderTracker() {
  if (insiderTracker) return insiderTracker;
  if (insiderTrackerPromise) return insiderTrackerPromise;

  insiderTrackerPromise = (async () => {
    try {
      const database = await getDatabaseAsync();
      insiderTracker = new InsiderTracker(database);
      return insiderTracker;
    } catch (error) {
      console.error('Failed to initialize InsiderTracker:', error.message);
      insiderTrackerPromise = null;
      throw error;
    }
  })();

  return insiderTrackerPromise;
}

/**
 * GET /api/insiders/top-buying
 * Get companies with strongest insider buying signals
 * Query params:
 *   - limit: number of results (default 20)
 *   - period: time period - '1m', '3m', '6m', '1y' (default '3m')
 */
router.get('/top-buying', async (req, res) => {
  try {
    const tracker = await getInsiderTracker();

    const { limit = 20, period = '3m' } = req.query;
    const results = await tracker.getTopInsiderBuying(parseInt(limit), period);

    res.json({
      period,
      count: results.length,
      companies: results
    });
  } catch (error) {
    if (isInsiderTableMissingError(error)) {
      return res.json({
        period: req.query.period || '3m',
        count: 0,
        companies: []
      });
    }
    console.error('Error fetching top buying companies:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/insiders/recent
 * Get recent insider transactions across all companies
 * Query params:
 *   - limit: number of results (default 50)
 *   - type: 'buy', 'sell', 'all' (default 'all')
 */
router.get('/recent', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { limit = 50, type = 'all' } = req.query;

    let whereClause = '';
    if (type === 'buy') {
      whereClause = "AND it.transaction_type = 'buy'";
    } else if (type === 'sell') {
      whereClause = "AND it.transaction_type = 'sell'";
    }

    const result = await database.query(`
      SELECT
        it.*,
        c.symbol,
        c.name as company_name,
        i.name as insider_name,
        i.title as insider_title,
        i.is_officer,
        i.is_director,
        i.is_ten_percent_owner
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.transaction_date IS NOT NULL
      ${whereClause}
      ORDER BY it.transaction_date DESC
      LIMIT $1
    `, [parseInt(limit)]);
    const transactions = result.rows;

    res.json({
      count: transactions.length,
      filter: type,
      transactions
    });
  } catch (error) {
    // ALWAYS return 200 with empty data
    console.error('Error fetching recent insider transactions:', error);
    return res.status(200).json({ count: 0, filter: req.query.type || 'all', transactions: [] });
  }
});

/**
 * GET /api/insiders/signals
 * Get insider sentiment signals for all tracked companies
 * Query params:
 *   - period: '1m', '3m', '6m' (default '3m')
 *   - signal: 'bullish', 'bearish', 'neutral', 'all' (default 'all')
 */
router.get('/signals', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { period = '3m', signal = 'all' } = req.query;

    let sql = `
      SELECT
        ias.*,
        c.symbol,
        c.name as company_name,
        c.sector,
        c.industry
      FROM insider_activity_summary ias
      JOIN companies c ON ias.company_id = c.id
      WHERE ias.period = $1
    `;
    const params = [period];
    if (signal !== 'all') {
      sql += ' AND ias.insider_signal = $2';
      params.push(signal);
    }
    sql += ' ORDER BY ias.signal_score DESC';

    const result = await database.query(sql, params);
    const signals = result.rows;

    // Group by signal type
    const grouped = {
      bullish: signals.filter(s => s.insider_signal === 'bullish'),
      bearish: signals.filter(s => s.insider_signal === 'bearish'),
      neutral: signals.filter(s => s.insider_signal === 'neutral')
    };

    res.json({
      period,
      filter: signal,
      total: signals.length,
      summary: {
        bullish: grouped.bullish.length,
        bearish: grouped.bearish.length,
        neutral: grouped.neutral.length
      },
      signals: signal === 'all' ? grouped : signals
    });
  } catch (error) {
    // ALWAYS return 200 with empty data
    console.error('Error fetching insider signals:', error);
    const period = req.query.period || '3m';
    const signal = req.query.signal || 'all';
    return res.status(200).json({
      period,
      filter: signal,
      total: 0,
      summary: { bullish: 0, bearish: 0, neutral: 0 },
      signals: signal === 'all' ? { bullish: [], bearish: [], neutral: [] } : []
    });
  }
});

/**
 * GET /api/insiders/company/:symbol
 * Get insider activity for a specific company
 * Query params:
 *   - months: how many months of history (default 12)
 *   - type: 'buy', 'sell', 'all' (default 'all')
 */
router.get('/company/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const tracker = await getInsiderTracker();
    const { symbol } = req.params;
    const { months = 12, type = 'all' } = req.query;

    const companyResult = await database.query(
      'SELECT id, symbol, name FROM companies WHERE UPPER(symbol) = UPPER($1)',
      [symbol]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Get activity
    const activity = await tracker.getInsiderActivity(company.id, {
      months: parseInt(months),
      transactionType: type === 'all' ? null : type
    });

    // Get summary for different periods
    const summaries = {};
    for (const period of ['1m', '3m', '6m', '1y']) {
      summaries[period] = await tracker.calculateSummary(company.id, period);
    }

    // Get list of insiders for this company
    const insidersResult = await database.query(`
      SELECT
        i.*,
        COUNT(it.id)::int as transaction_count,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'buy' THEN it.total_value ELSE 0 END), 0) as total_bought,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'sell' THEN it.total_value ELSE 0 END), 0) as total_sold,
        MAX(it.transaction_date) as last_transaction
      FROM insiders i
      LEFT JOIN insider_transactions it ON i.id = it.insider_id
      WHERE i.company_id = $1
      GROUP BY i.id
      ORDER BY i.is_officer DESC, transaction_count DESC
    `, [company.id]);
    const insiders = insidersResult.rows;

    res.json({
      company: {
        symbol: company.symbol,
        name: company.name
      },
      summaries,
      insiders,
      transactions: activity
    });
  } catch (error) {
    const { symbol } = req.params;
    if (isInsiderTableMissingError(error)) {
      return res.json({
        company: { symbol, name: symbol },
        summaries: { '1m': null, '3m': null, '6m': null, '1y': null },
        insiders: [],
        transactions: []
      });
    }
    console.error('Error fetching company insider data:', error);
    if (!res.headersSent) {
      res.json({
        company: { symbol, name: symbol },
        summaries: { '1m': null, '3m': null, '6m': null, '1y': null },
        insiders: [],
        transactions: []
      });
    }
  }
});

/**
 * GET /api/insiders/company/:symbol/chart
 * Get chart-ready data for insider activity visualization
 * Query params:
 *   - months: how many months (default 24)
 */
router.get('/company/:symbol/chart', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { months = 24 } = req.query;

    const companyResult = await database.query(
      'SELECT id FROM companies WHERE UPPER(symbol) = UPPER($1)',
      [symbol]
    );
    const company = companyResult.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get monthly aggregated data (Postgres: TO_CHAR for month)
    const monthlyResult = await database.query(`
      SELECT
        TO_CHAR(transaction_date, 'YYYY-MM') as month,
        SUM(CASE WHEN transaction_type = 'buy' THEN total_value ELSE 0 END) as buy_value,
        SUM(CASE WHEN transaction_type = 'sell' THEN total_value ELSE 0 END) as sell_value,
        SUM(CASE WHEN transaction_type = 'buy' THEN shares_transacted ELSE 0 END) as buy_shares,
        SUM(CASE WHEN transaction_type = 'sell' THEN shares_transacted ELSE 0 END) as sell_shares,
        COUNT(CASE WHEN transaction_type = 'buy' THEN 1 END)::int as buy_count,
        COUNT(CASE WHEN transaction_type = 'sell' THEN 1 END)::int as sell_count,
        COUNT(DISTINCT insider_id)::int as unique_insiders
      FROM insider_transactions
      WHERE company_id = $1
        AND transaction_date >= $2::date
        AND transaction_type IN ('buy', 'sell')
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
      ORDER BY month ASC
    `, [company.id, startDateStr]);
    const monthlyData = monthlyResult.rows;

    // Get individual transactions for scatter plot
    const transactionsResult = await database.query(`
      SELECT
        it.transaction_date as date,
        it.transaction_type as type,
        it.total_value as value,
        it.shares_transacted as shares,
        it.price_per_share as price,
        i.name as insider_name,
        i.title as insider_title,
        i.is_officer,
        i.is_director
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.company_id = $1
        AND it.transaction_date >= $2::date
        AND it.transaction_type IN ('buy', 'sell')
      ORDER BY it.transaction_date ASC
    `, [company.id, startDateStr]);
    const transactions = transactionsResult.rows;

    res.json({
      monthly: monthlyData,
      transactions
    });
  } catch (error) {
    if (isInsiderTableMissingError(error)) {
      return res.json({ monthly: [], transactions: [] });
    }
    console.error('Error fetching company chart data:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/insiders/insider/:cik
 * Get all activity for a specific insider across companies
 */
router.get('/insider/:cik', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { cik } = req.params;

    const insiderResult = await database.query(`
      SELECT i.*, c.symbol, c.name as company_name
      FROM insiders i
      JOIN companies c ON i.company_id = c.id
      WHERE i.cik = $1
    `, [cik]);
    const insider = insiderResult.rows;

    if (insider.length === 0) {
      return res.status(404).json({ error: 'Insider not found' });
    }

    // Get all transactions for this insider
    const transactionsResult = await database.query(`
      SELECT
        it.*,
        c.symbol,
        c.name as company_name
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      JOIN companies c ON it.company_id = c.id
      WHERE i.cik = $1
      ORDER BY it.transaction_date DESC
    `, [cik]);
    const transactions = transactionsResult.rows;

    // Calculate totals
    const totals = {
      totalBought: 0,
      totalSold: 0,
      buyCount: 0,
      sellCount: 0,
      companies: new Set()
    };

    transactions.forEach(tx => {
      totals.companies.add(tx.symbol);
      if (tx.transaction_type === 'buy') {
        totals.totalBought += tx.total_value || 0;
        totals.buyCount++;
      } else if (tx.transaction_type === 'sell') {
        totals.totalSold += tx.total_value || 0;
        totals.sellCount++;
      }
    });

    res.json({
      insider: insider[0], // Primary record
      companies: insider.map(i => ({ symbol: i.symbol, name: i.company_name })),
      totals: {
        ...totals,
        companies: totals.companies.size,
        netValue: totals.totalBought - totals.totalSold
      },
      transactions
    });
  } catch (error) {
    if (isInsiderTableMissingError(error)) {
      return res.status(404).json({ error: 'Insider not found' });
    }
    console.error('Error fetching insider data:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/insiders/cluster-buying
 * Find companies with cluster buying (multiple insiders buying)
 * Query params:
 *   - minInsiders: minimum number of insiders (default 2)
 *   - days: time window in days (default 30)
 */
router.get('/cluster-buying', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { minInsiders = 2, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const startDateStr = startDate.toISOString().split('T')[0];

    const clustersResult = await database.query(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name as company_name,
        c.sector,
        COUNT(DISTINCT it.insider_id)::int as unique_buyers,
        SUM(it.total_value) as total_buy_value,
        SUM(it.shares_transacted) as total_shares,
        MIN(it.transaction_date) as first_buy,
        MAX(it.transaction_date) as last_buy,
        STRING_AGG(DISTINCT i.name, ',') as buyer_names
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.transaction_type = 'buy'
        AND it.transaction_date >= $1::date
        AND (it.is_derivative = 0 OR it.is_derivative IS NULL)
      GROUP BY c.id
      HAVING COUNT(DISTINCT it.insider_id) >= $2
      ORDER BY unique_buyers DESC, total_buy_value DESC
    `, [startDateStr, parseInt(minInsiders)]);
    const clusters = clustersResult.rows;

    res.json({
      criteria: {
        minInsiders: parseInt(minInsiders),
        days: parseInt(days),
        startDate: startDateStr
      },
      count: clusters.length,
      clusters: clusters.map(c => ({
        ...c,
        buyer_names: c.buyer_names?.split(',') || []
      }))
    });
  } catch (error) {
    // ALWAYS return 200 with empty data on ANY error
    console.error('Error fetching cluster buying data:', error);
    return res.status(200).json({
      criteria: {
        minInsiders: parseInt(req.query.minInsiders || 2),
        days: parseInt(req.query.days || 30),
        startDate: new Date(Date.now() - parseInt(req.query.days || 30) * 86400000).toISOString().split('T')[0]
      },
      count: 0,
      clusters: []
    });
  }
});

/**
 * POST /api/insiders/update
 * Trigger insider data update from SEC EDGAR
 * Body params:
 *   - days: days of history to fetch (default 30)
 *   - limit: max companies to process (default 50, 0 = all)
 */
router.post('/update', async (req, res) => {
  try {
    const { days = 30, limit = 50 } = req.body || {};

    // Return immediately with status
    res.json({
      status: 'started',
      message: `Insider data update started for ${limit || 'all'} companies (last ${days} days)`,
      params: { days, limit }
    });

    // Run import asynchronously (don't await)
    const path = require('path');
    const { spawn } = require('child_process');
    const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'import', 'import-insider-data.js');

    const child = spawn('node', [scriptPath, days.toString(), limit.toString()], {
      cwd: path.join(__dirname, '..', '..', '..'),
      detached: true,
      stdio: 'ignore'
    });

    child.unref();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/insiders/update-status
 * Get the last insider data update status
 */
router.get('/update-status', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    // Get counts and latest transaction date
    const statsResult = await database.query(`
      SELECT
        COUNT(DISTINCT company_id)::int as companies_with_data,
        COUNT(DISTINCT insider_id)::int as total_insiders,
        COUNT(*)::int as total_transactions,
        MAX(created_at) as last_import_time,
        MAX(transaction_date) as latest_transaction
      FROM insider_transactions
    `);
    const stats = statsResult.rows[0];

    // Get signal distribution
    const signalsResult = await database.query(`
      SELECT insider_signal, COUNT(*)::int as count
      FROM insider_activity_summary
      WHERE period = '3m'
      GROUP BY insider_signal
    `);
    const signals = signalsResult.rows;

    res.json({
      lastImport: stats.last_import_time,
      latestTransaction: stats.latest_transaction,
      companiesWithData: stats.companies_with_data,
      totalInsiders: stats.total_insiders,
      totalTransactions: stats.total_transactions,
      signalDistribution: Object.fromEntries(signals.map(s => [s.insider_signal, s.count]))
    });
  } catch (error) {
    if (isInsiderTableMissingError(error)) {
      return res.json({
        lastImport: null,
        latestTransaction: null,
        companiesWithData: 0,
        totalInsiders: 0,
        totalTransactions: 0,
        signalDistribution: {}
      });
    }
    console.error('Error fetching update status:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/insiders/stats/debug
 * Debug endpoint to check table existence
 */
router.get('/stats/debug', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const tables = {};
    
    // Check each table
    const tablesToCheck = ['insider_transactions', 'insider_activity_summary', 'insiders', 'companies'];
    
    for (const tableName of tablesToCheck) {
      try {
        const result = await database.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        tables[tableName] = { exists: true, count: result.rows[0].count };
      } catch (err) {
        tables[tableName] = { 
          exists: false, 
          error: err.message,
          code: err.code 
        };
      }
    }
    
    // Check date range of insider_transactions
    let dateRange = null;
    try {
      const dateResult = await database.query(`
        SELECT 
          MIN(transaction_date) as oldest,
          MAX(transaction_date) as newest,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE transaction_date >= CURRENT_DATE - INTERVAL '1 year') as last_year,
          COUNT(*) FILTER (WHERE transaction_date >= CURRENT_DATE - INTERVAL '6 months') as last_6_months,
          COUNT(*) FILTER (WHERE transaction_date >= CURRENT_DATE - INTERVAL '3 months') as last_3_months,
          COUNT(*) FILTER (WHERE transaction_date >= CURRENT_DATE - INTERVAL '1 month') as last_month
        FROM insider_transactions
      `);
      dateRange = dateResult.rows[0];
    } catch (err) {
      dateRange = { error: err.message };
    }
    
    res.json({
      success: true,
      deployment_time: new Date().toISOString(),
      tables,
      dateRange,
      errorHandlerVersion: 'v2-comprehensive'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message,
      code: error.code,
      detail: error.detail
    });
  }
});

/**
 * GET /api/insiders/stats
 * Get overall insider trading statistics
 */
router.get('/stats', async (req, res) => {
  // ALWAYS return 200 with empty data on ANY error - absolute fallback
  const emptyResponse = () => ({
    yearToDate: {
      companies_with_activity: 0,
      active_insiders: 0,
      total_transactions: 0,
      buy_count: 0,
      sell_count: 0,
      total_buy_value: 0,
      total_sell_value: 0
    },
    monthlyTrend: [],
    signalDistribution: {},
    _debug_note: 'Insider data unavailable - tables may be missing or empty'
  });

  // Wrap EVERYTHING in try-catch to guarantee no 500 errors
  try {
    console.log('[insiders/stats] Starting request...');
    const database = await getDatabaseAsync();
    console.log('[insiders/stats] Database obtained');
    
    // Allow flexible time period via query param (default: all time)
    const { period = 'all' } = req.query;
    let whereClause = '';
    let monthsBack = 12;
    
    if (period !== 'all') {
      const periodMap = {
        '1m': { interval: '1 month', months: 1 },
        '3m': { interval: '3 months', months: 3 },
        '6m': { interval: '6 months', months: 6 },
        '1y': { interval: '1 year', months: 12 },
        '2y': { interval: '2 years', months: 24 }
      };
      
      const periodConfig = periodMap[period];
      if (periodConfig) {
        whereClause = `WHERE it.transaction_date >= CURRENT_DATE - INTERVAL '${periodConfig.interval}'`;
        monthsBack = periodConfig.months;
      }
    }
    
    console.log('[insiders/stats] Using period:', period, 'whereClause:', whereClause || 'NONE (all time)');
    
    // Overall stats
    console.log('[insiders/stats] Querying overall stats...');
    const statsResult = await database.query(`
      SELECT
        COUNT(DISTINCT it.company_id)::int as companies_with_activity,
        COUNT(DISTINCT it.insider_id)::int as active_insiders,
        COUNT(*)::int as total_transactions,
        SUM(CASE WHEN it.transaction_type = 'buy' THEN 1 ELSE 0 END)::int as buy_count,
        SUM(CASE WHEN it.transaction_type = 'sell' THEN 1 ELSE 0 END)::int as sell_count,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'buy' THEN it.total_value ELSE 0 END), 0) as total_buy_value,
        COALESCE(SUM(CASE WHEN it.transaction_type = 'sell' THEN it.total_value ELSE 0 END), 0) as total_sell_value
      FROM insider_transactions it
      ${whereClause}
    `);
    const stats = statsResult.rows[0];
    console.log('[insiders/stats] Stats retrieved:', stats);

    // Monthly trend (limit to last N months based on period)
    console.log('[insiders/stats] Querying monthly trend...');
    const trendWhereClause = period === 'all' 
      ? '' 
      : `WHERE transaction_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'`;
      
    const monthlyTrendResult = await database.query(`
      SELECT
        TO_CHAR(transaction_date, 'YYYY-MM') as month,
        SUM(CASE WHEN transaction_type = 'buy' THEN total_value ELSE 0 END) as buy_value,
        SUM(CASE WHEN transaction_type = 'sell' THEN total_value ELSE 0 END) as sell_value,
        COUNT(CASE WHEN transaction_type = 'buy' THEN 1 END)::int as buy_count,
        COUNT(CASE WHEN transaction_type = 'sell' THEN 1 END)::int as sell_count
      FROM insider_transactions
      ${trendWhereClause}
      GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
      ORDER BY month ASC
    `);
    const monthlyTrend = monthlyTrendResult.rows;
    console.log('[insiders/stats] Monthly trend retrieved, rows:', monthlyTrend.length);

    // Signal distribution (insider_activity_summary may not exist)
    let signalDistribution = {};
    try {
      console.log('[insiders/stats] Querying signal distribution...');
      const signalDistResult = await database.query(`
        SELECT
          insider_signal,
          COUNT(*)::int as count
        FROM insider_activity_summary
        WHERE period = '3m'
        GROUP BY insider_signal
      `);
      signalDistribution = Object.fromEntries(
        signalDistResult.rows.map(s => [s.insider_signal, s.count])
      );
      console.log('[insiders/stats] Signal distribution retrieved');
    } catch (signalErr) {
      console.log('[insiders/stats] Signal distribution query failed:', signalErr.message);
      // Don't throw - just continue with empty signal distribution
    }

    console.log('[insiders/stats] Sending successful response...');
    return res.json({
      period: period === 'all' ? 'all time' : period,
      yearToDate: stats,
      monthlyTrend,
      signalDistribution,
      _debug: {
        period_param: period,
        where_clause: whereClause || 'NONE',
        raw_stats: stats,
        has_monthly_data: monthlyTrend.length > 0
      }
    });
  } catch (error) {
    // Log full error details for debugging
    console.error('[insiders/stats] CAUGHT ERROR:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 5).join('\n')
    });
    
    // ALWAYS return 200 with empty data - NEVER return 500
    console.log('[insiders/stats] Returning empty response due to error');
    return res.status(200).json(emptyResponse());
  }
});

module.exports = router;
