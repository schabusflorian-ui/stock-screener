// src/api/routes/portfolios.js
// API routes for portfolio management

const express = require('express');
const router = express.Router();
const { getPortfolioService } = require('../../services/portfolio');

// Middleware to get portfolio service
const getService = (req) => {
  const db = req.app.get('db');
  return getPortfolioService(db);
};

// ============================================
// Portfolio CRUD Routes
// ============================================

// GET /api/portfolios - List all portfolios
router.get('/', (req, res) => {
  try {
    const service = getService(req);
    const portfolios = service.getAllPortfolios();
    res.json({
      success: true,
      count: portfolios.length,
      portfolios
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios - Create a new portfolio
router.post('/', (req, res) => {
  try {
    const service = getService(req);
    const {
      name,
      description,
      portfolioType,
      type, // Frontend sends 'type' instead of 'portfolioType'
      benchmarkIndexId,
      currency,
      initialCash,
      initialDate,
      cloneInvestorId
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = service.createPortfolio({
      name,
      description,
      portfolioType: portfolioType || type || 'manual',
      benchmarkIndexId,
      currency,
      initialCash: parseFloat(initialCash) || 0,
      initialDate,
      cloneInvestorId
    });

    // Return a portfolio object with full structure for frontend compatibility
    res.status(201).json({
      ...result,
      portfolio: {
        id: result.portfolioId,
        name: result.name,
        type: portfolioType || type || 'manual',
        description: description || null,
        cash_balance: parseFloat(initialCash) || 0,
        total_value: parseFloat(initialCash) || 0,
        total_gain: 0,
        total_gain_pct: 0,
        positions_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Static Routes (must be before /:id routes)
// ============================================

// GET /api/portfolios/alerts - Get all unread alerts across all portfolios
router.get('/alerts', (req, res) => {
  try {
    const service = getService(req);
    const { limit = 20 } = req.query;

    const alerts = service.getAllUnreadAlerts(parseInt(limit));
    const totalUnread = service.getTotalUnreadAlertCount();

    res.json({
      success: true,
      totalUnread,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/summaries - Get all portfolio summaries for dashboard
router.get('/summaries', (req, res) => {
  try {
    const service = getService(req);
    const summaries = service.getPortfolioSummaries();
    res.json({
      success: true,
      count: summaries.length,
      summaries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id - Get portfolio with full summary
router.get('/:id', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);

    const summary = service.getPortfolioSummary(portfolioId);
    res.json(summary);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message
    });
  }
});

// PUT /api/portfolios/:id - Update portfolio
router.put('/:id', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { name, description, benchmarkIndexId } = req.body;

    const result = service.updatePortfolio(portfolioId, {
      name,
      description,
      benchmarkIndexId
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/portfolios/:id - Delete portfolio
router.delete('/:id', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { archive = false } = req.query;

    let result;
    if (archive === 'true') {
      result = service.archivePortfolio(portfolioId);
    } else {
      result = service.deletePortfolio(portfolioId);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Position Routes
// ============================================

// GET /api/portfolios/:id/holdings - Get all holdings (alias for positions)
router.get('/:id/holdings', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);

    // Refresh values first
    service.refreshValues(portfolioId);

    const positions = service.getPositions(portfolioId);
    res.json({
      success: true,
      portfolioId,
      count: positions.length,
      holdings: positions  // Frontend expects 'holdings'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/positions - Get all positions
router.get('/:id/positions', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);

    // Refresh values first
    service.refreshValues(portfolioId);

    const positions = service.getPositions(portfolioId);
    res.json({
      success: true,
      portfolioId,
      count: positions.length,
      positions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/positions/:positionId/lots - Get lots for a position
router.get('/:id/positions/:positionId/lots', (req, res) => {
  try {
    const service = getService(req);
    const positionId = parseInt(req.params.positionId);
    const { openOnly = 'false' } = req.query;

    const lots = service.getLots(positionId, openOnly === 'true');
    res.json({
      success: true,
      positionId,
      count: lots.length,
      lots
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Trading Routes
// ============================================

// POST /api/portfolios/:id/trade - Execute buy or sell
router.post('/:id/trade', (req, res) => {
  try {
    const service = getService(req);
    const db = require('../../database').getDatabase();
    const portfolioId = parseInt(req.params.id);
    let {
      companyId,
      symbol,
      side,
      shares,
      pricePerShare,
      price, // Alternative name for pricePerShare
      type,  // Alternative name for side (buy/sell)
      fees = 0,
      notes,
      executedAt,
      lotMethod
    } = req.body;

    // Support alternative field names
    if (!side && type) side = type;
    if (!pricePerShare && price) pricePerShare = price;

    // Look up companyId from symbol if not provided
    if (!companyId && symbol) {
      const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());
      if (!company) {
        return res.status(400).json({
          error: `Symbol not found: ${symbol}`
        });
      }
      companyId = company.id;
    }

    if (!companyId || !side || !shares || !pricePerShare) {
      return res.status(400).json({
        error: 'Missing required fields: companyId (or symbol), side, shares, pricePerShare (or price)'
      });
    }

    if (!['buy', 'sell'].includes(side)) {
      return res.status(400).json({
        error: 'Side must be "buy" or "sell"'
      });
    }

    let result;
    if (side === 'buy') {
      result = service.executeBuy(portfolioId, {
        companyId: parseInt(companyId),
        shares: parseFloat(shares),
        pricePerShare: parseFloat(pricePerShare),
        fees: parseFloat(fees) || 0,
        notes,
        executedAt
      });
    } else {
      result = service.executeSell(portfolioId, {
        companyId: parseInt(companyId),
        shares: parseFloat(shares),
        pricePerShare: parseFloat(pricePerShare),
        fees: parseFloat(fees) || 0,
        notes,
        executedAt,
        lotMethod
      });
    }

    res.json(result);
  } catch (error) {
    const status = error.message.includes('Insufficient') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================
// Cash Management Routes
// ============================================

// POST /api/portfolios/:id/deposit - Deposit cash
router.post('/:id/deposit', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { amount, date, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const result = service.deposit(portfolioId, parseFloat(amount), { date, notes });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/withdraw - Withdraw cash
router.post('/:id/withdraw', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { amount, date, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    const result = service.withdraw(portfolioId, parseFloat(amount), { date, notes });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('Insufficient') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/dividend - Record dividend payment
router.post('/:id/dividend', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { companyId, amount, dividendPerShare, date, notes } = req.body;

    if (!companyId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: companyId, amount'
      });
    }

    const result = service.recordDividend(portfolioId, {
      companyId: parseInt(companyId),
      amount: parseFloat(amount),
      dividendPerShare: dividendPerShare ? parseFloat(dividendPerShare) : null,
      date,
      notes
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Order Routes
// ============================================

// GET /api/portfolios/:id/orders - Get orders (active by default)
router.get('/:id/orders', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { history = 'false', limit = 50, offset = 0 } = req.query;

    let orders;
    if (history === 'true') {
      orders = service.orderEngine.getOrderHistory(portfolioId, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } else {
      orders = service.getActiveOrders(portfolioId);
    }

    res.json({
      success: true,
      portfolioId,
      count: orders.length,
      orders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/orders - Create a new order
router.post('/:id/orders', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const {
      companyId,
      orderType,
      triggerPrice,
      shares,
      sharesPct,
      limitPrice,
      trailingPct,
      validUntil,
      notes
    } = req.body;

    if (!companyId || !orderType) {
      return res.status(400).json({
        error: 'Missing required fields: companyId, orderType'
      });
    }

    // For trailing stops, triggerPrice is calculated; otherwise required
    if (orderType !== 'trailing_stop' && !triggerPrice) {
      return res.status(400).json({
        error: 'triggerPrice is required for non-trailing orders'
      });
    }

    const result = service.createOrder(portfolioId, {
      companyId: parseInt(companyId),
      orderType,
      triggerPrice: triggerPrice ? parseFloat(triggerPrice) : null,
      shares: shares ? parseFloat(shares) : null,
      sharesPct: sharesPct ? parseFloat(sharesPct) : null,
      limitPrice: limitPrice ? parseFloat(limitPrice) : null,
      trailingPct: trailingPct ? parseFloat(trailingPct) : null,
      validUntil,
      notes
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/portfolios/:id/orders/:orderId - Cancel an order
router.delete('/:id/orders/:orderId', (req, res) => {
  try {
    const service = getService(req);
    const orderId = parseInt(req.params.orderId);

    const result = service.cancelOrder(orderId);
    res.json(result);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================
// Transaction History Routes
// ============================================

// GET /api/portfolios/:id/transactions - Get transaction history
router.get('/:id/transactions', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { limit = 50, offset = 0 } = req.query;

    const transactions = service.getTransactions(portfolioId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      portfolioId,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Snapshot Routes
// ============================================

// GET /api/portfolios/:id/snapshots - Get portfolio snapshots
router.get('/:id/snapshots', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { limit = 365, startDate, endDate } = req.query;

    let snapshots;
    if (startDate && endDate) {
      snapshots = service.getSnapshotRange(portfolioId, startDate, endDate);
    } else {
      snapshots = service.getSnapshots(portfolioId, parseInt(limit));
    }

    res.json({
      success: true,
      portfolioId,
      count: snapshots.length,
      snapshots
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/snapshots - Take a snapshot
router.post('/:id/snapshots', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { date } = req.body;

    const result = service.takeSnapshot(portfolioId, date);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Utility Routes
// ============================================

// POST /api/portfolios/check-orders - Manually trigger order check
router.post('/check-orders', (req, res) => {
  try {
    const service = getService(req);
    const result = service.checkAndExecuteOrders();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/refresh-all - Refresh all portfolio values
router.post('/refresh-all', (req, res) => {
  try {
    const service = getService(req);
    const results = service.refreshAllPortfolios();
    res.json({
      success: true,
      portfoliosRefreshed: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/snapshot-all - Take snapshots for all portfolios
router.post('/snapshot-all', (req, res) => {
  try {
    const service = getService(req);
    const { date } = req.body;
    const results = service.takeAllSnapshots(date);
    res.json({
      success: true,
      snapshotsTaken: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Integration Helper Routes
// ============================================

// POST /api/portfolios/:id/add-from-company - Quick add from company page
router.post('/:id/add-from-company', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { companyId, shares, price } = req.body;

    if (!companyId || !shares || !price) {
      return res.status(400).json({
        error: 'Missing required fields: companyId, shares, price'
      });
    }

    const result = service.addFromCompanyPage(
      portfolioId,
      parseInt(companyId),
      parseFloat(shares),
      parseFloat(price)
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/add-from-screener - Add multiple from screener
router.post('/:id/add-from-screener', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { selections, allocation = 'equal' } = req.body;

    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({
        error: 'selections must be a non-empty array of { companyId }'
      });
    }

    const result = service.addFromScreener(portfolioId, selections, allocation);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/portfolios/from-watchlist - Create portfolio from watchlist
router.post('/from-watchlist', (req, res) => {
  try {
    const service = getService(req);
    const { watchlistItems, name, initialCash, allocation = 'equal' } = req.body;

    if (!watchlistItems || !Array.isArray(watchlistItems)) {
      return res.status(400).json({
        error: 'watchlistItems must be an array'
      });
    }

    if (!name || !initialCash) {
      return res.status(400).json({
        error: 'Missing required fields: name, initialCash'
      });
    }

    const result = service.createFromWatchlist(watchlistItems, {
      name,
      initialCash: parseFloat(initialCash),
      allocation
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Dividend Processing Routes
// ============================================

// POST /api/portfolios/:id/process-dividend - Process dividend with DRIP support
router.post('/:id/process-dividend', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { companyId, dividendPerShare, exDate, payDate } = req.body;

    if (!companyId || !dividendPerShare) {
      return res.status(400).json({
        error: 'Missing required fields: companyId, dividendPerShare'
      });
    }

    const result = service.processDividend(portfolioId, {
      companyId: parseInt(companyId),
      dividendPerShare: parseFloat(dividendPerShare),
      exDate,
      payDate
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/portfolios/:id/drip - Set DRIP setting
router.put('/:id/drip', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { enabled } = req.body;

    const result = service.setDividendReinvest(portfolioId, enabled === true);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Bulk Operation Routes
// ============================================

// POST /api/portfolios/:id/duplicate - Duplicate portfolio
router.post('/:id/duplicate', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { name } = req.body;

    const result = service.duplicatePortfolio(portfolioId, name);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/liquidate - Liquidate entire portfolio
router.post('/:id/liquidate', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);

    const result = service.liquidatePortfolio(portfolioId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/close-position - Close a single position
router.post('/:id/close-position', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }

    const result = service.closePosition(portfolioId, parseInt(companyId));
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Stock Split Routes
// ============================================

// POST /api/portfolios/stock-split - Process stock split for all portfolios holding a company
router.post('/stock-split', (req, res) => {
  try {
    const service = getService(req);
    const db = require('../../database').getDatabase();
    let { companyId, symbol, splitRatio, effectiveDate } = req.body;

    // Look up companyId from symbol if not provided
    if (!companyId && symbol) {
      const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());
      if (!company) {
        return res.status(400).json({ error: `Symbol not found: ${symbol}` });
      }
      companyId = company.id;
    }

    if (!companyId || !splitRatio) {
      return res.status(400).json({
        error: 'Missing required fields: companyId (or symbol) and splitRatio'
      });
    }

    const result = service.processStockSplit(
      parseInt(companyId),
      parseFloat(splitRatio),
      effectiveDate
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/stock-split - Process stock split for a specific portfolio
router.post('/:id/stock-split', (req, res) => {
  try {
    const service = getService(req);
    const db = require('../../database').getDatabase();
    const portfolioId = parseInt(req.params.id);
    let { companyId, symbol, splitRatio, effectiveDate } = req.body;

    // Look up companyId from symbol if not provided
    if (!companyId && symbol) {
      const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());
      if (!company) {
        return res.status(400).json({ error: `Symbol not found: ${symbol}` });
      }
      companyId = company.id;
    }

    if (!companyId || !splitRatio) {
      return res.status(400).json({
        error: 'Missing required fields: companyId (or symbol) and splitRatio'
      });
    }

    const result = service.processStockSplitForPortfolio(
      portfolioId,
      parseInt(companyId),
      parseFloat(splitRatio),
      effectiveDate
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// Validation Routes
// ============================================

// POST /api/portfolios/:id/validate-trade - Validate a trade before execution
router.post('/:id/validate-trade', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { companyId, side, shares, price } = req.body;

    const result = service.validateTrade(portfolioId, {
      companyId: parseInt(companyId),
      side,
      shares: parseFloat(shares),
      price: parseFloat(price)
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Alert Routes (portfolio-specific)
// ============================================

// GET /api/portfolios/:id/alerts - Get alerts for a portfolio
router.get('/:id/alerts', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { unreadOnly = 'false', limit = 50, offset = 0 } = req.query;

    const alerts = service.getAlerts(portfolioId, {
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const unreadCount = service.getUnreadAlertCount(portfolioId);

    res.json({
      success: true,
      portfolioId,
      unreadCount,
      count: alerts.length,
      alerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/check-alerts - Check alerts for a specific portfolio
router.post('/:id/check-alerts', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);

    const alerts = service.checkPortfolioAlerts(portfolioId);
    res.json({
      success: true,
      portfolioId,
      alertsTriggered: alerts.length,
      alerts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/alert-settings - Get alert settings for a portfolio
router.get('/:id/alert-settings', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);

    const settings = service.getAlertSettings(portfolioId);
    res.json({
      success: true,
      portfolioId,
      settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/portfolios/:id/alert-settings - Update alert setting
router.put('/:id/alert-settings', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { alertType, enabled, threshold } = req.body;

    if (!alertType) {
      return res.status(400).json({ error: 'alertType is required' });
    }

    const settings = service.updateAlertSetting(portfolioId, alertType, {
      enabled: enabled !== false,
      threshold: threshold !== undefined ? parseFloat(threshold) : null
    });

    res.json({
      success: true,
      portfolioId,
      settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/alerts/mark-read - Mark alerts as read
router.post('/:id/alerts/mark-read', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { alertIds, all = false } = req.body;

    let result;
    if (all === true) {
      result = service.markAllAlertsAsRead(portfolioId);
    } else if (alertIds && Array.isArray(alertIds)) {
      result = service.markAlertsAsRead(alertIds.map(id => parseInt(id)));
    } else {
      return res.status(400).json({
        error: 'Provide alertIds array or set all=true'
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/portfolios/:id/alerts/:alertId - Dismiss an alert
router.delete('/:id/alerts/:alertId', (req, res) => {
  try {
    const service = getService(req);
    const alertId = parseInt(req.params.alertId);

    service.dismissAlert(alertId);
    res.json({
      success: true,
      alertId,
      dismissed: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Export Routes
// ============================================
const exportService = require('../../services/portfolio/exportService');

// GET /api/portfolios/:id/export/holdings - Export holdings as CSV
router.get('/:id/export/holdings', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const csv = exportService.exportHoldingsCSV(portfolioId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio_${portfolioId}_holdings.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/export/transactions - Export transactions as CSV
router.get('/:id/export/transactions', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { startDate, endDate, type } = req.query;

    const csv = exportService.exportTransactionsCSV(portfolioId, {
      startDate, endDate, type
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio_${portfolioId}_transactions.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/export/summary - Export portfolio summary as JSON
router.get('/:id/export/summary', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const summary = exportService.exportSummary(portfolioId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/export/tax - Export tax report as CSV
router.get('/:id/export/tax', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { year = new Date().getFullYear() } = req.query;

    const csv = exportService.exportTaxReport(portfolioId, parseInt(year));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio_${portfolioId}_tax_${year}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/export/dividends - Export dividend report as CSV
router.get('/:id/export/dividends', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { year = new Date().getFullYear() } = req.query;

    const csv = exportService.exportDividendReport(portfolioId, parseInt(year));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="portfolio_${portfolioId}_dividends_${year}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
