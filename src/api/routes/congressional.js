// src/api/routes/congressional.js
// API routes for congressional trading data (async DB; supports Postgres and SQLite)

const express = require('express');
const router = express.Router();
const { getDatabaseAsync, isUsingPostgres, dialect } = require('../../lib/db');

// Use congressional_politicians (Quiver schema); alias cp.name as politician_name / full_name for compatibility

function dateFilterDays(column, paramIndex) {
  return isUsingPostgres()
    ? `${column} >= CURRENT_DATE - ($${paramIndex}::integer || ' days')::interval`
    : `${column} >= date('now', '-' || $${paramIndex} || ' days')`;
}

function likeOp(paramIndex) {
  return isUsingPostgres() ? `cp.name ILIKE $${paramIndex}` : `cp.name LIKE $${paramIndex}`;
}

/**
 * GET /api/congressional/trades
 * Get all congressional trades with filters
 */
router.get('/trades', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      limit = 100,
      offset = 0,
      politician,
      chamber,
      party,
      type,
      ticker,
      minAmount,
      days = 90
    } = req.query;

    let paramIdx = 1;
    let sql = `
      SELECT
        ct.*,
        cp.name as politician_name,
        cp.chamber,
        cp.party,
        cp.state,
        c.symbol,
        c.name as company_name,
        c.market_cap,
        c.sector
      FROM congressional_trades ct
      JOIN congressional_politicians cp ON ct.politician_id = cp.id
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ${dateFilterDays('ct.transaction_date', paramIdx++)}
    `;
    const params = [days];

    if (politician) {
      sql += ' AND ' + likeOp(paramIdx++);
      params.push(`%${politician}%`);
    }
    if (chamber) {
      sql += ' AND cp.chamber = $' + (paramIdx++) + '';
      params.push(chamber);
    }
    if (party) {
      sql += ' AND cp.party = $' + (paramIdx++) + '';
      params.push(party);
    }
    if (type) {
      sql += ' AND ct.transaction_type = $' + (paramIdx++) + '';
      params.push(type);
    }
    if (ticker) {
      sql += ' AND ct.ticker = $' + (paramIdx++) + '';
      params.push(ticker.toUpperCase());
    }
    if (minAmount) {
      sql += ' AND ct.amount_min >= $' + (paramIdx++) + '';
      params.push(parseInt(minAmount));
    }

    sql += ' ORDER BY ct.transaction_date DESC LIMIT $' + (paramIdx++) + ' OFFSET $' + (paramIdx++) + '';
    params.push(parseInt(limit), parseInt(offset));

    const result = await database.query(sql, params);
    const trades = result.rows;

    const countSql = `
      SELECT COUNT(*) as total
      FROM congressional_trades ct
      JOIN congressional_politicians cp ON ct.politician_id = cp.id
      WHERE ${dateFilterDays('ct.transaction_date', 1)}
    `;
    const countResult = await database.query(countSql, [days]);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);

    res.json({
      trades,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching congressional trades:', error);
    res.status(500).json({ error: 'Failed to fetch congressional trades' });
  }
});

/**
 * GET /api/congressional/politicians
 * Get list of politicians with trade counts
 */
router.get('/politicians', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { days = 90 } = req.query;
    const dateCond = dateFilterDays('ct.transaction_date', 1);
    const cast = isUsingPostgres() ? '::int' : '';

    const sql = `
      SELECT
        cp.id,
        cp.name as full_name,
        cp.chamber,
        cp.party,
        cp.state,
        COUNT(ct.id)${cast} as trade_count,
        SUM(CASE WHEN ct.transaction_type = 'purchase' THEN 1 ELSE 0 END)${cast} as purchase_count,
        SUM(CASE WHEN ct.transaction_type = 'sale' THEN 1 ELSE 0 END)${cast} as sale_count,
        MAX(ct.transaction_date) as latest_trade
      FROM congressional_politicians cp
      LEFT JOIN congressional_trades ct ON cp.id = ct.politician_id
        AND ${dateCond}
      GROUP BY cp.id
      HAVING COUNT(ct.id) > 0
      ORDER BY COUNT(ct.id) DESC
    `;
    const result = await database.query(sql, [days]);
    res.json({ politicians: result.rows });
  } catch (error) {
    console.error('Error fetching politicians:', error);
    res.status(500).json({ error: 'Failed to fetch politicians' });
  }
});

/**
 * GET /api/congressional/clusters
 * Get purchase clusters (multiple politicians buying same stock)
 */
router.get('/clusters', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { days = 30, minPoliticians = 2 } = req.query;
    const dateCond = dateFilterDays('ct.transaction_date', 1);
    const cast = isUsingPostgres() ? '::int' : '';
    const politiciansAgg = dialect.groupConcat('DISTINCT cp.name', ', ');

    const sql = `
      SELECT
        ct.ticker,
        c.name as company_name,
        c.symbol,
        c.sector,
        c.market_cap,
        COUNT(DISTINCT ct.politician_id)${cast} as politician_count,
        COUNT(*)${cast} as purchase_count,
        SUM(ct.amount_min) as total_amount_min,
        MAX(ct.transaction_date) as latest_purchase,
        ${politiciansAgg} as politicians
      FROM congressional_trades ct
      JOIN congressional_politicians cp ON ct.politician_id = cp.id
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ct.transaction_type IN ('purchase', 'buy')
        AND ${dateCond}
        AND ct.ticker IS NOT NULL
      GROUP BY ct.ticker, c.name, c.symbol, c.sector, c.market_cap
      HAVING COUNT(DISTINCT ct.politician_id) >= $2
      ORDER BY COUNT(DISTINCT ct.politician_id) DESC, COUNT(*) DESC
    `;
    const result = await database.query(sql, [days, parseInt(minPoliticians)]);
    res.json({ clusters: result.rows });
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Failed to fetch purchase clusters' });
  }
});

/**
 * GET /api/congressional/company/:ticker
 * Get congressional trades for a specific company
 */
router.get('/company/:ticker', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { ticker } = req.params;
    const { days = 365 } = req.query;
    const dateCond = dateFilterDays('ct.transaction_date', 2);

    const sql = `
      SELECT
        ct.*,
        cp.name as politician_name,
        cp.chamber,
        cp.party,
        cp.state
      FROM congressional_trades ct
      JOIN congressional_politicians cp ON ct.politician_id = cp.id
      WHERE ct.ticker = $1
        AND ${dateCond}
      ORDER BY ct.transaction_date DESC
    `;
    const result = await database.query(sql, [ticker.toUpperCase(), days]);
    res.json({ trades: result.rows });
  } catch (error) {
    console.error('Error fetching company trades:', error);
    res.status(500).json({ error: 'Failed to fetch company trades' });
  }
});

/**
 * GET /api/congressional/stats
 * Get overall statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    const [totalTrades, totalPoliticians, totalCompanies, latestTrade, purchaseCount, saleCount] = await Promise.all([
      database.query('SELECT COUNT(*) as count FROM congressional_trades'),
      database.query('SELECT COUNT(DISTINCT politician_id) as count FROM congressional_trades'),
      database.query('SELECT COUNT(DISTINCT company_id) as count FROM congressional_trades WHERE company_id IS NOT NULL'),
      database.query('SELECT MAX(transaction_date) as date FROM congressional_trades'),
      database.query("SELECT COUNT(*) as count FROM congressional_trades WHERE transaction_type IN ('purchase', 'buy')"),
      database.query("SELECT COUNT(*) as count FROM congressional_trades WHERE transaction_type IN ('sale', 'sell')")
    ]);

    const stats = {
      total_trades: parseInt(totalTrades.rows[0]?.count || 0, 10),
      total_politicians: parseInt(totalPoliticians.rows[0]?.count || 0, 10),
      total_companies: parseInt(totalCompanies.rows[0]?.count || 0, 10),
      latest_trade: latestTrade.rows[0]?.date || null,
      purchase_count: parseInt(purchaseCount.rows[0]?.count || 0, 10),
      sale_count: parseInt(saleCount.rows[0]?.count || 0, 10)
    };
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
