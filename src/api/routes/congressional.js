// src/api/routes/congressional.js
// API routes for congressional trading data

const express = require('express');
const router = express.Router();
const { db, dialect, isPostgres } = require('../../database');

// Helper to build date filter based on database type
function dateFilter(column, daysParam) {
  if (isPostgres) {
    return `${column} >= CURRENT_DATE - INTERVAL '1 day' * $PARAM`;
  }
  return `${column} >= date('now', '-' || ? || ' days')`;
}

/**
 * GET /api/congressional/trades
 * Get all congressional trades with filters
 */
router.get('/trades', (req, res) => {
  try {
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

    let sql = `
      SELECT
        ct.*,
        p.full_name as politician_name,
        p.chamber,
        p.party,
        p.state,
        c.symbol,
        c.name as company_name,
        c.market_cap,
        c.sector
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ct.transaction_date >= date('now', '-' || ? || ' days')
    `;

    const params = [days];

    // Add filters
    if (politician) {
      sql += ' AND p.full_name LIKE ?';
      params.push(`%${politician}%`);
    }

    if (chamber) {
      sql += ' AND p.chamber = ?';
      params.push(chamber);
    }

    if (party) {
      sql += ' AND p.party = ?';
      params.push(party);
    }

    if (type) {
      sql += ' AND ct.transaction_type = ?';
      params.push(type);
    }

    if (ticker) {
      sql += ' AND ct.ticker = ?';
      params.push(ticker.toUpperCase());
    }

    if (minAmount) {
      sql += ' AND ct.amount_min >= ?';
      params.push(parseInt(minAmount));
    }

    sql += ' ORDER BY ct.transaction_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const trades = db.prepare(sql).all(...params);

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      WHERE ct.transaction_date >= date('now', '-' || ? || ' days')
    `;
    const countParams = [days];

    const { total } = db.prepare(countSql).get(...countParams);

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
router.get('/politicians', (req, res) => {
  try {
    const { days = 90 } = req.query;

    const sql = `
      SELECT
        p.id,
        p.full_name,
        p.chamber,
        p.party,
        p.state,
        COUNT(ct.id) as trade_count,
        SUM(CASE WHEN ct.transaction_type = 'purchase' THEN 1 ELSE 0 END) as purchase_count,
        SUM(CASE WHEN ct.transaction_type = 'sale' THEN 1 ELSE 0 END) as sale_count,
        MAX(ct.transaction_date) as latest_trade
      FROM politicians p
      LEFT JOIN congressional_trades ct ON p.id = ct.politician_id
        AND ct.transaction_date >= date('now', '-' || ? || ' days')
      GROUP BY p.id
      HAVING COUNT(ct.id) > 0
      ORDER BY COUNT(ct.id) DESC
    `;

    const politicians = db.prepare(sql).all(days);

    res.json({ politicians });

  } catch (error) {
    console.error('Error fetching politicians:', error);
    res.status(500).json({ error: 'Failed to fetch politicians' });
  }
});

/**
 * GET /api/congressional/clusters
 * Get purchase clusters (multiple politicians buying same stock)
 */
router.get('/clusters', (req, res) => {
  try {
    const { days = 30, minPoliticians = 2 } = req.query;

    // Use dialect helper for GROUP_CONCAT
    const politiciansList = dialect.groupConcat('DISTINCT p.full_name');

    const sql = `
      SELECT
        ct.ticker,
        c.name as company_name,
        c.symbol,
        c.sector,
        c.market_cap,
        COUNT(DISTINCT ct.politician_id) as politician_count,
        COUNT(*) as purchase_count,
        SUM(ct.amount_min) as total_amount_min,
        MAX(ct.transaction_date) as latest_purchase,
        ${politiciansList} as politicians
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      LEFT JOIN companies c ON ct.company_id = c.id
      WHERE ct.transaction_type IN ('purchase', 'buy')
        AND ct.transaction_date >= date('now', '-' || ? || ' days')
        AND ct.ticker IS NOT NULL
      GROUP BY ct.ticker, c.name, c.symbol, c.sector, c.market_cap
      HAVING COUNT(DISTINCT ct.politician_id) >= ?
      ORDER BY COUNT(DISTINCT ct.politician_id) DESC, COUNT(*) DESC
    `;

    const clusters = db.prepare(sql).all(days, minPoliticians);

    res.json({ clusters });

  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ error: 'Failed to fetch purchase clusters' });
  }
});

/**
 * GET /api/congressional/company/:ticker
 * Get congressional trades for a specific company
 */
router.get('/company/:ticker', (req, res) => {
  try {
    const { ticker } = req.params;
    const { days = 365 } = req.query;

    const sql = `
      SELECT
        ct.*,
        p.full_name as politician_name,
        p.chamber,
        p.party,
        p.state
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      WHERE ct.ticker = ?
        AND ct.transaction_date >= date('now', '-' || ? || ' days')
      ORDER BY ct.transaction_date DESC
    `;

    const trades = db.prepare(sql).all(ticker.toUpperCase(), days);

    res.json({ trades });

  } catch (error) {
    console.error('Error fetching company trades:', error);
    res.status(500).json({ error: 'Failed to fetch company trades' });
  }
});

/**
 * GET /api/congressional/stats
 * Get overall statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = {
      total_trades: db.prepare('SELECT COUNT(*) as count FROM congressional_trades').get().count,
      total_politicians: db.prepare('SELECT COUNT(DISTINCT politician_id) as count FROM congressional_trades').get().count,
      total_companies: db.prepare('SELECT COUNT(DISTINCT company_id) as count FROM congressional_trades WHERE company_id IS NOT NULL').get().count,
      latest_trade: db.prepare('SELECT MAX(transaction_date) as date FROM congressional_trades').get().date,
      purchase_count: db.prepare("SELECT COUNT(*) as count FROM congressional_trades WHERE transaction_type IN ('purchase', 'buy')").get().count,
      sale_count: db.prepare("SELECT COUNT(*) as count FROM congressional_trades WHERE transaction_type IN ('sale', 'sell')").get().count
    };

    res.json(stats);

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
