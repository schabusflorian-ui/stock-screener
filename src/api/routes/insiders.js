// src/api/routes/insiders.js
// API routes for insider trading data

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
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
    res.status(500).json({ error: error.message });
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

    const stmt1 = await database.prepare(`
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
      LIMIT ?
    `);
    const transactions = await stmt1.all(parseInt(limit));

    res.json({
      count: transactions.length,
      filter: type,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    let whereClause = '';
    if (signal !== 'all') {
      whereClause = `AND ias.insider_signal = '${signal}'`;
    }

    const stmt2 = await database.prepare(`
      SELECT
        ias.*,
        c.symbol,
        c.name as company_name,
        c.sector,
        c.industry
      FROM insider_activity_summary ias
      JOIN companies c ON ias.company_id = c.id
      WHERE ias.period = ?
      ${whereClause}
      ORDER BY ias.signal_score DESC
    `);
    const signals = await stmt2.all(period);

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
    res.status(500).json({ error: error.message });
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

    const stmt3 = await database.prepare(
      'SELECT id, symbol, name FROM companies WHERE LOWER(symbol) = LOWER(?)'
    );
    const company = await stmt3.get(symbol.toUpperCase());

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
    const stmt4 = await database.prepare(`
      SELECT
        i.*,
        COUNT(it.id) as transaction_count,
        SUM(CASE WHEN it.transaction_type = 'buy' THEN it.total_value ELSE 0 END) as total_bought,
        SUM(CASE WHEN it.transaction_type = 'sell' THEN it.total_value ELSE 0 END) as total_sold,
        MAX(it.transaction_date) as last_transaction
      FROM insiders i
      LEFT JOIN insider_transactions it ON i.id = it.insider_id
      WHERE i.company_id = ?
      GROUP BY i.id
      ORDER BY i.is_officer DESC, transaction_count DESC
    `);
    const insiders = await stmt4.all(company.id);

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
    res.status(500).json({ error: error.message });
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

    const stmt5 = await database.prepare(
      'SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)'
    );
    const company = await stmt5.get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get monthly aggregated data
    const stmt6 = await database.prepare(`
      SELECT
        strftime('%Y-%m', transaction_date) as month,
        SUM(CASE WHEN transaction_type = 'buy' THEN total_value ELSE 0 END) as buy_value,
        SUM(CASE WHEN transaction_type = 'sell' THEN total_value ELSE 0 END) as sell_value,
        SUM(CASE WHEN transaction_type = 'buy' THEN shares_transacted ELSE 0 END) as buy_shares,
        SUM(CASE WHEN transaction_type = 'sell' THEN shares_transacted ELSE 0 END) as sell_shares,
        COUNT(CASE WHEN transaction_type = 'buy' THEN 1 END) as buy_count,
        COUNT(CASE WHEN transaction_type = 'sell' THEN 1 END) as sell_count,
        COUNT(DISTINCT insider_id) as unique_insiders
      FROM insider_transactions
      WHERE company_id = ?
        AND transaction_date >= ?
        AND transaction_type IN ('buy', 'sell')
      GROUP BY strftime('%Y-%m', transaction_date)
      ORDER BY month ASC
    `);
    const monthlyData = await stmt6.all(company.id, startDateStr);

    // Get individual transactions for scatter plot
    const stmt7 = await database.prepare(`
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
      WHERE it.company_id = ?
        AND it.transaction_date >= ?
        AND it.transaction_type IN ('buy', 'sell')
      ORDER BY it.transaction_date ASC
    `);
    const transactions = await stmt7.all(company.id, startDateStr);

    res.json({
      monthly: monthlyData,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    const stmt8 = await database.prepare(`
      SELECT i.*, c.symbol, c.name as company_name
      FROM insiders i
      JOIN companies c ON i.company_id = c.id
      WHERE i.cik = ?
    `);
    const insider = await stmt8.all(cik);

    if (insider.length === 0) {
      return res.status(404).json({ error: 'Insider not found' });
    }

    // Get all transactions for this insider
    const stmt9 = await database.prepare(`
      SELECT
        it.*,
        c.symbol,
        c.name as company_name
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      JOIN companies c ON it.company_id = c.id
      WHERE i.cik = ?
      ORDER BY it.transaction_date DESC
    `);
    const transactions = await stmt9.all(cik);

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
    res.status(500).json({ error: error.message });
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

    const stmt10 = await database.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name as company_name,
        c.sector,
        COUNT(DISTINCT it.insider_id) as unique_buyers,
        SUM(it.total_value) as total_buy_value,
        SUM(it.shares_transacted) as total_shares,
        MIN(it.transaction_date) as first_buy,
        MAX(it.transaction_date) as last_buy,
        GROUP_CONCAT(DISTINCT i.name) as buyer_names
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.transaction_type = 'buy'
        AND it.transaction_date >= ?
        AND it.is_derivative = 0
      GROUP BY c.id
      HAVING COUNT(DISTINCT it.insider_id) >= ?
      ORDER BY unique_buyers DESC, total_buy_value DESC
    `);
    const clusters = await stmt10.all(startDateStr, parseInt(minInsiders));

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
    res.status(500).json({ error: error.message });
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
    const stmt11 = await database.prepare(`
      SELECT
        COUNT(DISTINCT company_id) as companies_with_data,
        COUNT(DISTINCT insider_id) as total_insiders,
        COUNT(*) as total_transactions,
        MAX(created_at) as last_import_time,
        MAX(transaction_date) as latest_transaction
      FROM insider_transactions
    `);
    const stats = await stmt11.get();

    // Get signal distribution
    const stmt12 = await database.prepare(`
      SELECT insider_signal, COUNT(*) as count
      FROM insider_activity_summary
      WHERE period = '3m'
      GROUP BY insider_signal
    `);
    const signals = await stmt12.all();

    res.json({
      lastImport: stats.last_import_time,
      latestTransaction: stats.latest_transaction,
      companiesWithData: stats.companies_with_data,
      totalInsiders: stats.total_insiders,
      totalTransactions: stats.total_transactions,
      signalDistribution: Object.fromEntries(signals.map(s => [s.insider_signal, s.count]))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/insiders/stats
 * Get overall insider trading statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    // Overall stats
    const stmt13 = await database.prepare(`
      SELECT
        COUNT(DISTINCT it.company_id) as companies_with_activity,
        COUNT(DISTINCT it.insider_id) as active_insiders,
        COUNT(*) as total_transactions,
        SUM(CASE WHEN it.transaction_type = 'buy' THEN 1 ELSE 0 END) as buy_count,
        SUM(CASE WHEN it.transaction_type = 'sell' THEN 1 ELSE 0 END) as sell_count,
        SUM(CASE WHEN it.transaction_type = 'buy' THEN it.total_value ELSE 0 END) as total_buy_value,
        SUM(CASE WHEN it.transaction_type = 'sell' THEN it.total_value ELSE 0 END) as total_sell_value
      FROM insider_transactions it
      WHERE it.transaction_date >= date('now', '-1 year')
    `);
    const stats = await stmt13.get();

    // Monthly trend
    const stmt14 = await database.prepare(`
      SELECT
        strftime('%Y-%m', transaction_date) as month,
        SUM(CASE WHEN transaction_type = 'buy' THEN total_value ELSE 0 END) as buy_value,
        SUM(CASE WHEN transaction_type = 'sell' THEN total_value ELSE 0 END) as sell_value,
        COUNT(CASE WHEN transaction_type = 'buy' THEN 1 END) as buy_count,
        COUNT(CASE WHEN transaction_type = 'sell' THEN 1 END) as sell_count
      FROM insider_transactions
      WHERE transaction_date >= date('now', '-12 months')
      GROUP BY strftime('%Y-%m', transaction_date)
      ORDER BY month ASC
    `);
    const monthlyTrend = await stmt14.all();

    // Signal distribution
    const stmt15 = await database.prepare(`
      SELECT
        insider_signal,
        COUNT(*) as count
      FROM insider_activity_summary
      WHERE period = '3m'
      GROUP BY insider_signal
    `);
    const signalDistribution = await stmt15.all();

    res.json({
      yearToDate: stats,
      monthlyTrend,
      signalDistribution: Object.fromEntries(
        signalDistribution.map(s => [s.insider_signal, s.count])
      )
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
