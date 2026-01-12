// src/api/routes/portfolios.js
// API routes for portfolio management

const express = require('express');
const router = express.Router();
const { getPortfolioService } = require('../../services/portfolio');
const {
  requireAuth,
  optionalAuth,
  requirePortfolioOwnership,
  checkAdmin,
  attachUserId
} = require('../../middleware/auth');

// Middleware to get portfolio service
const getService = (req) => {
  const db = req.app.get('db');
  return getPortfolioService(db);
};

// Apply auth middleware to all routes
router.use(optionalAuth);
router.use(attachUserId);
router.use(checkAdmin);

// ============================================
// Portfolio CRUD Routes
// ============================================

// Cache for portfolio refresh timestamps - only refresh if stale (>15 min)
const REFRESH_TTL_MS = 15 * 60 * 1000; // 15 minutes
let lastPortfolioRefresh = 0;
const portfolioRefreshCache = new Map(); // Per-portfolio refresh timestamps

// Helper to check if a portfolio's values need refreshing
function shouldRefreshPortfolio(portfolioId, forceRefresh = false) {
  if (forceRefresh) return true;
  const lastRefresh = portfolioRefreshCache.get(portfolioId) || 0;
  return (Date.now() - lastRefresh) > REFRESH_TTL_MS;
}

function markPortfolioRefreshed(portfolioId) {
  portfolioRefreshCache.set(portfolioId, Date.now());
}

// GET /api/portfolios - List user's portfolios (or all if admin)
router.get('/', (req, res) => {
  try {
    const service = getService(req);
    const { refresh = 'auto' } = req.query;

    // Determine user filter - admins can see all, regular users see only their own
    const userId = req.isAdmin ? null : req.userId;

    // Only refresh if:
    // 1. refresh=true (force refresh)
    // 2. refresh=auto (default) AND data is stale (>15 min old)
    const now = Date.now();
    const isStale = (now - lastPortfolioRefresh) > REFRESH_TTL_MS;
    const shouldRefresh = refresh === 'true' || (refresh === 'auto' && isStale);

    if (shouldRefresh && refresh !== 'false') {
      try {
        service.refreshAllPortfolios();
        lastPortfolioRefresh = now;
      } catch (refreshError) {
        console.warn('Failed to refresh portfolio values:', refreshError.message);
      }
    }

    const portfolios = service.getAllPortfolios(userId);
    res.json({
      success: true,
      count: portfolios.length,
      portfolios,
      filtered: !req.isAdmin && req.userId ? true : false,
      cached: !shouldRefresh
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios - Create a new portfolio (requires auth)
router.post('/', requireAuth, (req, res) => {
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
      cloneInvestorId,
      userId: req.userId // Set the owner
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
        user_id: req.userId,
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

// GET /api/portfolios/:id - Get portfolio with full summary (requires ownership)
router.get('/:id', requireAuth, requirePortfolioOwnership, (req, res) => {
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

// PUT /api/portfolios/:id - Update portfolio (requires ownership)
router.put('/:id', requireAuth, requirePortfolioOwnership, (req, res) => {
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

// DELETE /api/portfolios/:id - Delete portfolio (requires ownership)
router.delete('/:id', requireAuth, requirePortfolioOwnership, (req, res) => {
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
// Position Routes (all require ownership)
// ============================================

// GET /api/portfolios/:id/holdings - Get all holdings (alias for positions)
router.get('/:id/holdings', requireAuth, requirePortfolioOwnership, (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const forceRefresh = req.query.refresh === 'true';

    // Only refresh if stale or forced
    if (shouldRefreshPortfolio(portfolioId, forceRefresh)) {
      service.refreshValues(portfolioId);
      markPortfolioRefreshed(portfolioId);
    }

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
router.get('/:id/positions', requireAuth, requirePortfolioOwnership, (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const forceRefresh = req.query.refresh === 'true';

    // Only refresh if stale or forced
    if (shouldRefreshPortfolio(portfolioId, forceRefresh)) {
      service.refreshValues(portfolioId);
      markPortfolioRefreshed(portfolioId);
    }

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

// GET /api/portfolios/:id/underlying - Get underlying holdings breakdown for ETF positions
router.get('/:id/underlying', async (req, res) => {
  try {
    const service = getService(req);
    const db = require('../../database').getDatabase();
    const { getEtfService } = require('../../services/etfService');
    const etfService = getEtfService();

    const portfolioId = parseInt(req.params.id);
    const { refresh = 'false' } = req.query;
    const forceRefresh = refresh === 'true';

    // Only refresh if stale or forced
    if (shouldRefreshPortfolio(portfolioId, forceRefresh)) {
      service.refreshValues(portfolioId);
      markPortfolioRefreshed(portfolioId);
    }

    // Get positions
    const positions = service.getPositions(portfolioId);

    // Find ETF positions
    const etfPositions = positions.filter(p => p.sector === 'ETF' || p.is_etf);

    // Build underlying exposure
    const underlyingExposure = new Map(); // symbol -> { name, value, sources: [] }
    const etfBreakdown = [];

    for (const pos of etfPositions) {
      // Check if this is an ETF in our database
      const etf = db.prepare('SELECT id, symbol FROM etf_definitions WHERE symbol = ?').get(pos.symbol);

      if (etf) {
        // Get holdings (fetch from Yahoo if needed)
        const holdingsData = await etfService.getHoldingsWithFetch(pos.symbol, {
          forceRefresh: refresh === 'true',
          limit: 100
        });

        const etfValue = pos.currentValue || pos.current_value || 0;
        const holdingsList = [];

        for (const holding of holdingsData.holdings || []) {
          const exposureValue = etfValue * (holding.weight / 100);

          // Add to underlying exposure map
          const key = holding.symbol || holding.security_name;
          if (underlyingExposure.has(key)) {
            const existing = underlyingExposure.get(key);
            existing.value += exposureValue;
            existing.sources.push({ etf: pos.symbol, weight: holding.weight, contribution: exposureValue });
          } else {
            underlyingExposure.set(key, {
              symbol: holding.symbol,
              name: holding.security_name || holding.company_name || holding.symbol,
              sector: holding.company_sector || holding.sector,
              value: exposureValue,
              sources: [{ etf: pos.symbol, weight: holding.weight, contribution: exposureValue }]
            });
          }

          holdingsList.push({
            symbol: holding.symbol,
            name: holding.security_name || holding.company_name,
            weight: holding.weight,
            exposureValue
          });
        }

        etfBreakdown.push({
          symbol: pos.symbol,
          name: pos.name,
          shares: pos.shares,
          value: etfValue,
          holdingsCount: holdingsList.length,
          topHoldings: holdingsList.slice(0, 10)
        });
      }
    }

    // Convert map to sorted array
    const underlyingHoldings = Array.from(underlyingExposure.values())
      .sort((a, b) => b.value - a.value);

    // Calculate total underlying value
    const totalUnderlyingValue = underlyingHoldings.reduce((sum, h) => sum + h.value, 0);

    // Add weight percentage
    underlyingHoldings.forEach(h => {
      h.weight = totalUnderlyingValue > 0 ? (h.value / totalUnderlyingValue) * 100 : 0;
    });

    res.json({
      success: true,
      portfolioId,
      etfPositions: etfBreakdown,
      underlyingHoldings: underlyingHoldings.slice(0, 100), // Top 100 underlying holdings
      totalUnderlyingValue,
      totalHoldings: underlyingHoldings.length
    });
  } catch (error) {
    console.error('Error getting underlying holdings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Trading Routes (all require ownership)
// ============================================

// POST /api/portfolios/:id/trade - Execute buy or sell
router.post('/:id/trade', requireAuth, requirePortfolioOwnership, async (req, res) => {
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
      lotMethod,
      skipRiskCheck = false, // Allow bypassing risk checks
      acknowledgeWarnings = false // Acknowledge warnings and proceed
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

    const positionValue = parseFloat(shares) * parseFloat(pricePerShare);

    // ============================================
    // RISK ASSESSMENT (for buys only, unless forced)
    // ============================================
    let riskAssessment = null;
    if (side === 'buy' && !skipRiskCheck) {
      try {
        const { BuffettTalebRiskManager } = require('../../services/riskManagement');
        const riskManager = new BuffettTalebRiskManager(db);

        riskAssessment = await riskManager.assessTradeRisk(
          portfolioId,
          parseInt(companyId),
          positionValue,
          { skipMOS: false }
        );

        // Block if risk check fails and warnings not acknowledged
        if (!riskAssessment.approved) {
          return res.status(400).json({
            error: 'Trade blocked by risk assessment',
            riskAssessment,
            message: 'Set skipRiskCheck=true to bypass or address the blockers'
          });
        }

        // Warn if there are warnings and not acknowledged
        if (riskAssessment.warnings.length > 0 && !acknowledgeWarnings) {
          return res.status(400).json({
            error: 'Trade has risk warnings',
            riskAssessment,
            message: 'Set acknowledgeWarnings=true to proceed despite warnings'
          });
        }
      } catch (riskError) {
        // Log but don't block if risk service fails
        console.error('Risk assessment error:', riskError.message);
        riskAssessment = { error: riskError.message, skipped: true };
      }
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

    // Include risk assessment in response
    if (riskAssessment) {
      result.riskAssessment = riskAssessment;
    }

    res.json(result);
  } catch (error) {
    const status = error.message.includes('Insufficient') ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================
// Cash Management Routes (all require ownership)
// ============================================

// POST /api/portfolios/:id/deposit - Deposit cash
router.post('/:id/deposit', requireAuth, requirePortfolioOwnership, (req, res) => {
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
router.post('/:id/withdraw', requireAuth, requirePortfolioOwnership, (req, res) => {
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

// GET /api/portfolios/:id/value-history - Get portfolio value history for charting
router.get('/:id/value-history', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    // Calculate days based on period
    const periodDays = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      '3y': 1095,
      '5y': 1825,
      'all': 10000
    };
    const days = periodDays[period] || 365;

    // Get snapshots for the period
    const snapshots = service.getSnapshots(portfolioId, days);

    // Transform to chart-friendly format
    const history = snapshots
      .sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date))
      .map(s => ({
        date: s.snapshot_date,
        value: s.total_value,
        cashValue: s.cash_value,
        positionsValue: s.positions_value,
        costBasis: s.total_cost_basis,
        unrealizedPnl: s.unrealized_pnl,
        positionsCount: s.positions_count
      }));

    res.json({
      success: true,
      portfolioId,
      period,
      count: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/performance - Get portfolio performance metrics
router.get('/:id/performance', (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    // Get portfolio and snapshots
    const portfolio = service.getPortfolio(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const periodDays = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      '3y': 1095,
      '5y': 1825,
      'all': 10000
    };
    const days = periodDays[period] || 365;

    const snapshots = service.getSnapshots(portfolioId, days);
    const sortedSnapshots = snapshots.sort((a, b) =>
      new Date(a.snapshot_date) - new Date(b.snapshot_date)
    );

    if (sortedSnapshots.length < 2) {
      return res.json({
        success: true,
        portfolioId,
        period,
        history: sortedSnapshots.map(s => ({
          date: s.snapshot_date,
          value: s.total_value
        })),
        metrics: null
      });
    }

    const first = sortedSnapshots[0];
    const last = sortedSnapshots[sortedSnapshots.length - 1];

    // Calculate performance metrics
    const totalReturn = last.total_value - first.total_value;
    const totalReturnPct = first.total_value > 0
      ? (totalReturn / first.total_value) * 100
      : 0;

    // Calculate daily returns for volatility
    const dailyReturns = [];
    for (let i = 1; i < sortedSnapshots.length; i++) {
      const prevValue = sortedSnapshots[i - 1].total_value;
      const currValue = sortedSnapshots[i].total_value;
      if (prevValue > 0) {
        dailyReturns.push((currValue - prevValue) / prevValue);
      }
    }

    // Annualized volatility
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / dailyReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized

    // Max drawdown
    let peak = first.total_value;
    let maxDrawdown = 0;
    for (const s of sortedSnapshots) {
      if (s.total_value > peak) peak = s.total_value;
      const drawdown = (s.total_value - peak) / peak;
      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    }

    // Annualized return (simple)
    const daysHeld = Math.max(1, sortedSnapshots.length);
    const annualizedReturn = ((1 + totalReturnPct / 100) ** (365 / daysHeld) - 1) * 100;

    // Sharpe ratio (assuming 4% risk-free rate)
    const riskFreeRate = 0.04;
    const sharpeRatio = volatility > 0
      ? (annualizedReturn / 100 - riskFreeRate) / (volatility / 100)
      : 0;

    res.json({
      success: true,
      portfolioId,
      period,
      history: sortedSnapshots.map(s => ({
        date: s.snapshot_date,
        value: s.total_value,
        cashValue: s.cash_value,
        positionsValue: s.positions_value
      })),
      metrics: {
        totalReturn,
        totalReturnPct,
        annualizedReturn,
        volatility,
        maxDrawdown: maxDrawdown * 100,
        sharpeRatio,
        startValue: first.total_value,
        endValue: last.total_value,
        startDate: first.snapshot_date,
        endDate: last.snapshot_date,
        daysHeld
      }
    });
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
    const date = req.body?.date || null;
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
router.post('/:id/validate-trade', async (req, res) => {
  try {
    const service = getService(req);
    const db = require('../../database').getDatabase();
    const portfolioId = parseInt(req.params.id);
    let { companyId, symbol, side, shares, price, includeRisk = true } = req.body;

    // Look up companyId from symbol if needed
    if (!companyId && symbol) {
      const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());
      if (company) companyId = company.id;
    }

    // Basic trade validation
    const basicResult = service.validateTrade(portfolioId, {
      companyId: parseInt(companyId),
      side,
      shares: parseFloat(shares),
      price: parseFloat(price)
    });

    // Add risk assessment for buys
    let riskAssessment = null;
    if (includeRisk && side === 'buy' && companyId) {
      try {
        const { BuffettTalebRiskManager } = require('../../services/riskManagement');
        const riskManager = new BuffettTalebRiskManager(db);

        const positionValue = parseFloat(shares) * parseFloat(price);
        riskAssessment = await riskManager.assessTradeRisk(
          portfolioId,
          parseInt(companyId),
          positionValue,
          { skipMOS: false }
        );
      } catch (riskError) {
        riskAssessment = { error: riskError.message };
      }
    }

    // Add margin of safety data
    let marginOfSafety = null;
    if (companyId) {
      try {
        const { MarginOfSafetyCalculator } = require('../../services/riskManagement');
        const mosCalc = new MarginOfSafetyCalculator(db);
        const mosResult = await mosCalc.calculateIntrinsicValue(parseInt(companyId));
        if (mosResult.success) {
          marginOfSafety = {
            intrinsicValue: mosResult.weightedIntrinsicValue,
            currentPrice: mosResult.currentPrice,
            marginOfSafety: mosResult.marginOfSafety,
            valuationSignal: mosResult.valuationSignal,
            confidence: mosResult.confidence,
            methods: Object.keys(mosResult.methods).filter(m => mosResult.methods[m]?.value)
          };
        }
      } catch (mosError) {
        marginOfSafety = { error: mosError.message };
      }
    }

    res.json({
      ...basicResult,
      riskAssessment,
      marginOfSafety
    });
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

// ============================================
// Hedge Suggestions Routes
// ============================================

// GET /api/portfolios/:id/hedge-suggestions - Get hedge recommendations
router.get('/:id/hedge-suggestions', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { HedgeOptimizer } = require('../../services/portfolio/hedgeOptimizer');
    const hedgeOptimizer = new HedgeOptimizer(db);

    const portfolioId = parseInt(req.params.id);

    // Get current regime if available
    let regime = null;
    try {
      const { RegimeDetector } = require('../../services/trading/regimeDetector');
      const regimeDetector = new RegimeDetector({ getDatabase: () => db });
      regime = await regimeDetector.detectRegime();
    } catch (regimeError) {
      // Use a default high-vol regime if detection fails
      regime = { regime: 'HIGH_VOL', confidence: 0.5 };
    }

    const suggestions = hedgeOptimizer.suggestHedges(portfolioId, regime);

    res.json({
      success: true,
      portfolioId,
      ...suggestions
    });
  } catch (error) {
    console.error('Error getting hedge suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/hedge-history - Get hedge suggestion history
router.get('/:id/hedge-history', (req, res) => {
  try {
    const db = req.app.get('db');
    const { HedgeOptimizer } = require('../../services/portfolio/hedgeOptimizer');
    const hedgeOptimizer = new HedgeOptimizer(db);

    const portfolioId = parseInt(req.params.id);
    const { limit = 10 } = req.query;

    const history = hedgeOptimizer.getRecentSuggestions(portfolioId, parseInt(limit));

    res.json({
      success: true,
      portfolioId,
      count: history.length,
      suggestions: history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/hedge-suggestions/:suggestionId/status - Update suggestion status
router.post('/:id/hedge-suggestions/:suggestionId/status', (req, res) => {
  try {
    const db = req.app.get('db');
    const { HedgeOptimizer } = require('../../services/portfolio/hedgeOptimizer');
    const hedgeOptimizer = new HedgeOptimizer(db);

    const { suggestionId } = req.params;
    const { status } = req.body;

    if (!['implemented', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "implemented" or "dismissed"' });
    }

    const result = hedgeOptimizer.updateSuggestionStatus(parseInt(suggestionId), status);

    res.json({
      success: true,
      suggestionId: parseInt(suggestionId),
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/hedge-summary - Get hedge summary
router.get('/:id/hedge-summary', (req, res) => {
  try {
    const db = req.app.get('db');
    const { HedgeOptimizer } = require('../../services/portfolio/hedgeOptimizer');
    const hedgeOptimizer = new HedgeOptimizer(db);

    const portfolioId = parseInt(req.params.id);
    const summary = hedgeOptimizer.getHedgeSummary(portfolioId);

    res.json({
      success: true,
      portfolioId,
      ...summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Dividend Processing Routes
// ============================================

// POST /api/portfolios/process-dividends - Process dividends for all portfolios
router.post('/process-dividends', (req, res) => {
  try {
    const db = req.app.get('db');
    const { getDividendProcessor } = require('../../services/portfolio/dividendProcessor');
    const processor = getDividendProcessor(db);

    const { lookbackDays = 7, dryRun = false } = req.body;

    const result = processor.processAllDividends({
      lookbackDays: parseInt(lookbackDays),
      dryRun: dryRun === true || dryRun === 'true'
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/pending-dividends - Preview pending dividends
router.get('/pending-dividends', (req, res) => {
  try {
    const db = req.app.get('db');
    const { getDividendProcessor } = require('../../services/portfolio/dividendProcessor');
    const processor = getDividendProcessor(db);

    const { lookbackDays = 7 } = req.query;

    const result = processor.getPendingDividends({ lookbackDays: parseInt(lookbackDays) });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios/:id/process-dividends - Process dividends for a specific portfolio
router.post('/:id/process-dividends', (req, res) => {
  try {
    const db = req.app.get('db');
    const { getDividendProcessor } = require('../../services/portfolio/dividendProcessor');
    const processor = getDividendProcessor(db);

    const portfolioId = parseInt(req.params.id);
    const { lookbackDays = 7, dryRun = false } = req.body;

    const result = processor.processPortfolioDividends(portfolioId, {
      lookbackDays: parseInt(lookbackDays),
      dryRun: dryRun === true || dryRun === 'true'
    });

    res.json({
      success: true,
      portfolioId,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/pending-dividends - Preview pending dividends for a portfolio
router.get('/:id/pending-dividends', (req, res) => {
  try {
    const db = req.app.get('db');
    const { getDividendProcessor } = require('../../services/portfolio/dividendProcessor');
    const processor = getDividendProcessor(db);

    const portfolioId = parseInt(req.params.id);
    const { lookbackDays = 7 } = req.query;

    const result = processor.getPendingDividends({ portfolioId, lookbackDays: parseInt(lookbackDays) });

    res.json({
      success: true,
      portfolioId,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id/dividend-history - Get dividend transaction history
router.get('/:id/dividend-history', (req, res) => {
  try {
    const db = req.app.get('db');
    const { getDividendProcessor } = require('../../services/portfolio/dividendProcessor');
    const processor = getDividendProcessor(db);

    const portfolioId = parseInt(req.params.id);
    const { limit = 50 } = req.query;

    const history = processor.getDividendHistory(portfolioId, parseInt(limit));

    res.json({
      success: true,
      portfolioId,
      count: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
