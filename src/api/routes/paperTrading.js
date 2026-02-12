// src/api/routes/paperTrading.js
// API routes for paper trading functionality

const express = require('express');
const router = express.Router();
const { PaperTradingEngine } = require('../../services/trading/paperTrading');
const { OrderAbstractionLayer } = require('../../services/trading/orderAbstraction');
const { requireAuth } = require('../../middleware/auth');
const { requireFeature } = require('../../middleware/subscription');

let paperEngine = null;
const brokerConnections = new Map();

function getEngine(req) {
  if (!paperEngine) {
    const db = req.app.get('db');
    if (!db) throw new Error('Database not initialized');
    paperEngine = new PaperTradingEngine(db);
  }
  return paperEngine;
}

async function getBrokerConnection(db, accountName, initialCapital = 100000) {
  const key = accountName;

  if (!brokerConnections.has(key)) {
    const broker = new OrderAbstractionLayer('paper', {
      accountName,
      initialCapital
    });
    broker.adapter.engine = new PaperTradingEngine(db);
    try {
      const account = await broker.adapter.engine.getAccount(accountName);
      broker.adapter.accountId = account.id;
    } catch (err) {
      const account = await broker.adapter.engine.createAccount(accountName, initialCapital);
      broker.adapter.accountId = account.id;
    }
    broker.adapter.connected = true;
    brokerConnections.set(key, broker);
  }

  return brokerConnections.get(key);
}

/** Run query - works with both SQLite (sync) and Postgres (async) db */
async function query(db, sql, params = []) {
  return Promise.resolve(db.query(sql, params));
}

// ==========================================
// ACCOUNT ROUTES
// ==========================================

/**
 * GET /api/paper-trading/accounts
 * Get all paper trading accounts
 */
router.get('/accounts', async (req, res) => {
  try {
    getEngine(req);
    const db = req.app.get('db');
    const res_ = await query(db, 'SELECT * FROM paper_accounts ORDER BY created_at DESC');
    const accounts = res_.rows || [];
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('Error fetching paper accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/paper-trading/accounts
 * Create a new paper trading account
 * Requires Pro tier (paper_trading_bots feature)
 */
router.post('/accounts', requireAuth, requireFeature('paper_trading_bots'), async (req, res) => {
  try {
    const engine = getEngine(req);
    const { name, initialCapital } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Account name is required' });
    }

    const account = await engine.createAccount(name, initialCapital || 100000);
    res.json({ success: true, data: account });
  } catch (error) {
    console.error('Error creating paper account:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/paper-trading/accounts/:id
 * Get paper trading account details
 */
router.get('/accounts/:id', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const status = await engine.getAccountStatus(accountId);
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching paper account:', error);
    res.status(404).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/paper-trading/accounts/:id
 * Delete a paper trading account (and all associated data)
 */
router.delete('/accounts/:id', async (req, res) => {
  try {
    getEngine(req);
    const db = req.app.get('db');
    const accountId = parseInt(req.params.id);

    await query(db, 'DELETE FROM paper_snapshots WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_trades WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_orders WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_positions WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_accounts WHERE id = ?', [accountId]);

    res.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error('Error deleting paper account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ORDER ROUTES
// ==========================================

/**
 * POST /api/paper-trading/accounts/:id/orders
 * Submit a new order
 * Requires Pro tier (paper_trading_bots feature)
 */
router.post('/accounts/:id/orders', requireAuth, requireFeature('paper_trading_bots'), async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const { symbol, side, quantity, orderType, limitPrice, stopPrice, notes } = req.body;

    if (!symbol || !side || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'symbol, side, and quantity are required'
      });
    }

    const result = await engine.submitOrder(accountId, {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      quantity: parseFloat(quantity),
      orderType: orderType || 'MARKET',
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
      stopPrice: stopPrice ? parseFloat(stopPrice) : undefined,
      notes
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/paper-trading/accounts/:id/orders
 * Get order history for an account
 */
router.get('/accounts/:id/orders', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    const orders = await engine.getOrders(accountId, limit);
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/paper-trading/accounts/:id/orders/pending
 * Get pending orders for an account
 */
router.get('/accounts/:id/orders/pending', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const orders = await engine.getPendingOrders(accountId);
    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// POSITION ROUTES
// ==========================================

/**
 * GET /api/paper-trading/accounts/:id/positions
 * Get current positions for an account
 */
router.get('/accounts/:id/positions', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const positions = await engine.getPositions(accountId);
    res.json({ success: true, data: positions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// TRADE ROUTES
// ==========================================

/**
 * GET /api/paper-trading/accounts/:id/trades
 * Get trade history for an account
 */
router.get('/accounts/:id/trades', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    const trades = await engine.getTrades(accountId, limit);
    res.json({ success: true, data: trades });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PERFORMANCE ROUTES
// ==========================================

/**
 * GET /api/paper-trading/accounts/:id/performance
 * Get performance metrics for an account
 */
router.get('/accounts/:id/performance', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const days = parseInt(req.query.days) || 30;
    const performance = await engine.getPerformance(accountId, days);
    res.json({ success: true, data: performance });
  } catch (error) {
    console.error('Error fetching performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/paper-trading/accounts/:id/snapshot
 * Take a daily snapshot of account value
 */
router.post('/accounts/:id/snapshot', async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const snapshot = await engine.takeSnapshot(accountId);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    console.error('Error taking snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/paper-trading/accounts/:id/snapshots
 * Get historical snapshots for an account
 */
router.get('/accounts/:id/snapshots', async (req, res) => {
  try {
    getEngine(req);
    const db = req.app.get('db');
    const accountId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 90;

    const res_ = await query(db, `
      SELECT * FROM paper_snapshots
      WHERE account_id = ?
      ORDER BY snapshot_date DESC
      LIMIT ?
    `, [accountId, limit]);
    const snapshots = res_.rows || [];

    res.json({ success: true, data: snapshots });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// QUICK TRADE ROUTES (Convenience)
// ==========================================

/**
 * POST /api/paper-trading/accounts/:id/buy
 * Quick market buy order
 * Requires Pro tier (paper_trading_bots feature)
 */
router.post('/accounts/:id/buy', requireAuth, requireFeature('paper_trading_bots'), async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const { symbol, quantity, notes } = req.body;

    if (!symbol || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'symbol and quantity are required'
      });
    }

    const result = await engine.submitOrder(accountId, {
      symbol: symbol.toUpperCase(),
      side: 'BUY',
      quantity: parseFloat(quantity),
      orderType: 'MARKET',
      notes
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error executing buy:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/paper-trading/accounts/:id/sell
 * Quick market sell order
 * Requires Pro tier (paper_trading_bots feature)
 */
router.post('/accounts/:id/sell', requireAuth, requireFeature('paper_trading_bots'), async (req, res) => {
  try {
    const engine = getEngine(req);
    const accountId = parseInt(req.params.id);
    const { symbol, quantity, notes } = req.body;

    if (!symbol || !quantity) {
      return res.status(400).json({
        success: false,
        error: 'symbol and quantity are required'
      });
    }

    const result = await engine.submitOrder(accountId, {
      symbol: symbol.toUpperCase(),
      side: 'SELL',
      quantity: parseFloat(quantity),
      orderType: 'MARKET',
      notes
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error executing sell:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ==========================================
// AGENT INTEGRATION ROUTES
// ==========================================

/**
 * POST /api/paper-trading/execute-signal
 * Execute a trading signal from an agent
 */
router.post('/execute-signal', async (req, res) => {
  try {
    const engine = getEngine(req);
    const {
      accountId,
      signalId,
      symbol,
      action, // 'strong_buy', 'buy', 'sell', 'strong_sell'
      quantity,
      positionValue,
      confidence,
      notes
    } = req.body;

    if (!accountId || !symbol || !action) {
      return res.status(400).json({
        success: false,
        error: 'accountId, symbol, and action are required'
      });
    }

    // Map signal action to order side
    const side = ['strong_buy', 'buy'].includes(action) ? 'BUY' : 'SELL';

    // Calculate quantity if not provided
    let orderQuantity = quantity;
    if (!orderQuantity && positionValue) {
      const db = req.app.get('db');
      const res_ = await query(db, `
        SELECT p.close as price
        FROM daily_prices p
        JOIN companies c ON c.id = p.company_id
        WHERE c.symbol = ?
        ORDER BY p.date DESC
        LIMIT 1
      `, [symbol]);
      const priceData = (res_.rows && res_.rows[0]) ? res_.rows[0] : null;

      if (priceData) {
        orderQuantity = Math.floor(positionValue / priceData.price);
      }
    }

    if (!orderQuantity || orderQuantity <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Could not determine order quantity'
      });
    }

    const result = await engine.submitOrder(accountId, {
      symbol: symbol.toUpperCase(),
      side,
      quantity: orderQuantity,
      orderType: 'MARKET',
      notes: notes || `Signal execution: ${action} (confidence: ${(confidence * 100).toFixed(1)}%)${signalId ? ` [Signal #${signalId}]` : ''}`
    });

    res.json({
      success: true,
      data: {
        ...result,
        signalId,
        originalAction: action
      }
    });
  } catch (error) {
    console.error('Error executing signal:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/paper-trading/accounts/:id/reset
 * Reset a paper trading account to initial state
 */
router.post('/accounts/:id/reset', async (req, res) => {
  try {
    const db = req.app.get('db');
    const accountId = parseInt(req.params.id);
    const { newCapital } = req.body;

    const res_ = await query(db, 'SELECT * FROM paper_accounts WHERE id = ?', [accountId]);
    const account = (res_.rows && res_.rows[0]) ? res_.rows[0] : null;
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    const capital = newCapital || account.initial_capital;

    await query(db, 'DELETE FROM paper_snapshots WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_trades WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_orders WHERE account_id = ?', [accountId]);
    await query(db, 'DELETE FROM paper_positions WHERE account_id = ?', [accountId]);

    const { dialect } = require('../../lib/db');
    const nowExpr = dialect.now();
    await query(db, `
      UPDATE paper_accounts
      SET initial_capital = ?, cash_balance = ?, updated_at = ${nowExpr}
      WHERE id = ?
    `, [capital, capital, accountId]);

    res.json({
      success: true,
      data: {
        id: accountId,
        name: account.name,
        initialCapital: capital,
        cashBalance: capital,
        message: 'Account reset successfully'
      }
    });
  } catch (error) {
    console.error('Error resetting account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// LINK TO AGENT PORTFOLIO
// ==========================================

/**
 * POST /api/paper-trading/link-portfolio
 * Link a paper trading account to an agent portfolio
 */
router.post('/link-portfolio', async (req, res) => {
  try {
    const db = req.app.get('db');
    const engine = getEngine(req);
    const { portfolioId, agentId, initialCapital } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const portRes = await query(db, 'SELECT * FROM portfolios WHERE id = ?', [portfolioId]);
    const portfolio = (portRes.rows && portRes.rows[0]) ? portRes.rows[0] : null;
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }

    const accountName = `portfolio_${portfolioId}`;
    const capital = initialCapital || portfolio.initial_capital || 100000;

    let account;
    try {
      account = await engine.getAccount(accountName);
    } catch (err) {
      account = await engine.createAccount(accountName, capital);
    }

    const { dialect } = require('../../lib/db');
    const nowExpr = dialect.now();
    await query(db, `
      UPDATE portfolios
      SET paper_account_id = ?, trading_mode = 'paper', updated_at = ${nowExpr}
      WHERE id = ?
    `, [account.id, portfolioId]);

    if (agentId) {
      await query(db, `
        UPDATE agent_portfolios
        SET mode = 'paper'
        WHERE agent_id = ? AND portfolio_id = ?
      `, [agentId, portfolioId]);
    }

    res.json({
      success: true,
      data: {
        portfolioId,
        paperAccountId: account.id,
        accountName,
        initialCapital: capital,
        message: 'Portfolio linked to paper trading account'
      }
    });
  } catch (error) {
    console.error('Error linking portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
