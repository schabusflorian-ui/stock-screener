// src/services/portfolio/index.js
// Main portfolio service - orchestrates holdings and order engines

const HoldingsEngine = require('./holdingsEngine');
const OrderEngine = require('./orderEngine');
const PortfolioAlertsService = require('./portfolioAlerts');
const { PORTFOLIO_TYPES, PORTFOLIO_ALERT_TYPES } = require('../../constants/portfolio');

// Analytics engines (Agent 2)
const metricsEngine = require('./metricsEngine');
const backtestEngine = require('./backtestEngine');
const monteCarloEngine = require('./monteCarloEngine');
const positionSizing = require('./positionSizing');

// Advanced analytics (Agent 2)
const { stressTestEngine, STRESS_SCENARIOS } = require('./stressTestEngine');
const advancedAnalytics = require('./advancedAnalytics');
const whatIfAnalysis = require('./whatIfAnalysis');
const rebalanceCalculator = require('./rebalanceCalculator');

// Hedge fund-grade optimization (Agent 2 - Phase 2)
const { VaRCalculator } = require('./varCalculator');
const { EfficientFrontierCalculator } = require('./efficientFrontier');
const { HierarchicalRiskParity } = require('./hierarchicalRiskParity');
const { PerformanceAttribution } = require('./performanceAttribution');

// Dividend processing
const { DividendProcessor, getDividendProcessor } = require('./dividendProcessor');

class PortfolioService {
  constructor(db) {
    this.db = db;
    this.holdingsEngine = new HoldingsEngine(db);
    this.orderEngine = new OrderEngine(db, this.holdingsEngine);
    this.alertsService = new PortfolioAlertsService(db);
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Portfolio CRUD - with user filtering support
      getAllPortfolios: this.db.prepare(`
        SELECT p.*,
          p.current_value as total_value,
          p.current_cash as cash_balance,
          (p.current_value - p.total_deposited + p.total_withdrawn) as total_gain,
          CASE
            WHEN p.total_deposited > 0
            THEN ((p.current_value - p.total_deposited + p.total_withdrawn) / p.total_deposited) * 100
            ELSE 0
          END as total_gain_pct,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
        FROM portfolios p
        WHERE p.is_archived = 0
        ORDER BY p.created_at DESC
      `),

      // User-filtered portfolio list
      getPortfoliosByUser: this.db.prepare(`
        SELECT p.*,
          p.current_value as total_value,
          p.current_cash as cash_balance,
          (p.current_value - p.total_deposited + p.total_withdrawn) as total_gain,
          CASE
            WHEN p.total_deposited > 0
            THEN ((p.current_value - p.total_deposited + p.total_withdrawn) / p.total_deposited) * 100
            ELSE 0
          END as total_gain_pct,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
        FROM portfolios p
        WHERE p.is_archived = 0 AND p.user_id = ?
        ORDER BY p.created_at DESC
      `),

      getPortfolio: this.db.prepare(`
        SELECT * FROM portfolios WHERE id = ?
      `),

      getPortfolioWithDetails: this.db.prepare(`
        SELECT p.*,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count,
          (SELECT COUNT(*) FROM portfolio_orders WHERE portfolio_id = p.id AND status = 'active') as active_orders_count
        FROM portfolios p
        WHERE p.id = ?
      `),

      // Check portfolio ownership
      getPortfolioOwner: this.db.prepare(`
        SELECT user_id FROM portfolios WHERE id = ?
      `),

      createPortfolio: this.db.prepare(`
        INSERT INTO portfolios
        (name, description, portfolio_type, benchmark_index_id, currency,
         initial_cash, initial_date, current_cash, current_value,
         total_deposited, clone_investor_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updatePortfolio: this.db.prepare(`
        UPDATE portfolios
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            benchmark_index_id = COALESCE(?, benchmark_index_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      archivePortfolio: this.db.prepare(`
        UPDATE portfolios
        SET is_archived = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      deletePortfolio: this.db.prepare(`
        DELETE FROM portfolios WHERE id = ?
      `),

      // Snapshot queries
      createSnapshot: this.db.prepare(`
        INSERT OR REPLACE INTO portfolio_snapshots
        (portfolio_id, snapshot_date, total_value, cash_value, positions_value,
         total_cost_basis, unrealized_pnl, realized_pnl, total_deposited,
         total_withdrawn, positions_count, benchmark_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getSnapshots: this.db.prepare(`
        SELECT * FROM portfolio_snapshots
        WHERE portfolio_id = ?
        ORDER BY snapshot_date DESC
        LIMIT ?
      `),

      getSnapshotRange: this.db.prepare(`
        SELECT * FROM portfolio_snapshots
        WHERE portfolio_id = ?
          AND snapshot_date BETWEEN ? AND ?
        ORDER BY snapshot_date ASC
      `)
    };
  }

  // ============================================
  // Portfolio CRUD
  // ============================================

  /**
   * Get all portfolios (for admin) or user-specific portfolios
   * @param {string|null} userId - User ID to filter by, or null for all (admin)
   */
  getAllPortfolios(userId = null) {
    if (userId) {
      return this.stmts.getPortfoliosByUser.all(userId);
    }
    return this.stmts.getAllPortfolios.all();
  }

  getPortfolio(portfolioId) {
    return this.stmts.getPortfolioWithDetails.get(portfolioId);
  }

  /**
   * Check if a user owns a portfolio
   * @param {number} portfolioId
   * @param {string} userId
   * @returns {boolean}
   */
  isPortfolioOwner(portfolioId, userId) {
    const result = this.stmts.getPortfolioOwner.get(portfolioId);
    if (!result) return false;
    // If portfolio has no user_id (legacy), allow access
    if (!result.user_id) return true;
    return result.user_id === userId;
  }

  /**
   * Get portfolio owner
   * @param {number} portfolioId
   * @returns {string|null}
   */
  getPortfolioOwner(portfolioId) {
    const result = this.stmts.getPortfolioOwner.get(portfolioId);
    return result?.user_id || null;
  }

  createPortfolio({
    name,
    description = null,
    portfolioType = PORTFOLIO_TYPES.MANUAL,
    benchmarkIndexId = null,
    currency = 'USD',
    initialCash = 0,
    initialDate = null,
    cloneInvestorId = null,
    userId = null
  }) {
    const date = initialDate || new Date().toISOString().split('T')[0];

    const result = this.stmts.createPortfolio.run(
      name,
      description,
      portfolioType,
      benchmarkIndexId,
      currency,
      initialCash,
      date,
      initialCash, // current_cash = initial_cash
      initialCash, // current_value = initial_cash (no positions yet)
      initialCash, // total_deposited = initial_cash
      cloneInvestorId,
      userId
    );

    return {
      success: true,
      portfolioId: result.lastInsertRowid,
      name,
      initialCash,
      initialDate: date,
      userId
    };
  }

  updatePortfolio(portfolioId, { name = null, description = null, benchmarkIndexId = null }) {
    this.stmts.updatePortfolio.run(name, description, benchmarkIndexId, portfolioId);
    return { success: true, portfolioId };
  }

  archivePortfolio(portfolioId) {
    this.stmts.archivePortfolio.run(portfolioId);
    return { success: true, portfolioId, archived: true };
  }

  deletePortfolio(portfolioId) {
    // This will cascade delete positions, lots, transactions, orders due to FK constraints
    this.stmts.deletePortfolio.run(portfolioId);
    return { success: true, portfolioId, deleted: true };
  }

  // ============================================
  // Full Portfolio Summary
  // ============================================

  getPortfolioSummary(portfolioId) {
    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Refresh position values
    this.holdingsEngine.refreshPositionValues(portfolioId);

    // Get value calculation
    const values = this.holdingsEngine.calculatePortfolioValue(portfolioId);

    // Get positions
    const positions = this.holdingsEngine.getPositions(portfolioId);

    // Get active orders
    const activeOrders = this.orderEngine.getActiveOrders(portfolioId);

    // Calculate allocation
    const allocation = positions.map(p => ({
      symbol: p.symbol,
      name: p.company_name,
      sector: p.sector,
      shares: p.shares,
      currentValue: p.current_value || 0,
      weight: values.totalValue > 0 ? ((p.current_value || 0) / values.totalValue) * 100 : 0,
      unrealizedPnl: p.unrealized_pnl || 0,
      unrealizedPnlPct: p.unrealized_pnl_pct || 0
    }));

    // Sector allocation
    const sectorAllocation = {};
    for (const pos of allocation) {
      const sector = pos.sector || 'Unknown';
      if (!sectorAllocation[sector]) {
        sectorAllocation[sector] = { value: 0, weight: 0 };
      }
      sectorAllocation[sector].value += pos.currentValue;
      sectorAllocation[sector].weight += pos.weight;
    }

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        type: portfolio.portfolio_type,
        currency: portfolio.currency,
        createdAt: portfolio.created_at
      },
      values: {
        cashValue: values.cashValue,
        positionsValue: values.positionsValue,
        totalValue: values.totalValue,
        totalCostBasis: values.totalCostBasis,
        netInvested: values.netInvested,
        totalDeposited: portfolio.total_deposited,
        totalWithdrawn: portfolio.total_withdrawn
      },
      performance: {
        unrealizedPnl: values.unrealizedPnl,
        unrealizedPnlPct: values.totalCostBasis > 0
          ? (values.unrealizedPnl / values.totalCostBasis) * 100
          : 0,
        realizedPnl: values.realizedPnl,
        totalDividends: values.totalDividends,
        totalReturn: values.totalReturn,
        totalReturnPct: values.netInvested > 0
          ? (values.totalReturn / values.netInvested) * 100
          : 0
      },
      positions: {
        count: positions.length,
        allocation
      },
      sectorAllocation,
      orders: {
        activeCount: activeOrders.length,
        orders: activeOrders
      }
    };
  }

  // ============================================
  // Snapshots (for historical tracking)
  // ============================================

  takeSnapshot(portfolioId, snapshotDate = null) {
    const date = snapshotDate || new Date().toISOString().split('T')[0];

    // Refresh values first
    this.holdingsEngine.refreshPositionValues(portfolioId);

    const portfolio = this.stmts.getPortfolio.get(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const values = this.holdingsEngine.calculatePortfolioValue(portfolioId);

    // Get benchmark value if benchmark_index_id is set
    let benchmarkValue = null;
    if (portfolio.benchmark_index_id) {
      const benchmarkPrice = this.db.prepare(`
        SELECT close FROM market_index_prices
        WHERE index_id = ? AND date <= ?
        ORDER BY date DESC
        LIMIT 1
      `).get(portfolio.benchmark_index_id, date);
      benchmarkValue = benchmarkPrice?.close || null;
    }

    this.stmts.createSnapshot.run(
      portfolioId,
      date,
      values.totalValue,
      values.cashValue,
      values.positionsValue,
      values.totalCostBasis,
      values.unrealizedPnl,
      values.realizedPnl,
      portfolio.total_deposited,
      portfolio.total_withdrawn,
      values.positionsCount,
      benchmarkValue
    );

    // Update high water mark if current value exceeds it
    if (values.totalValue > (portfolio.high_water_mark || 0)) {
      this.db.prepare(`
        UPDATE portfolios SET high_water_mark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(values.totalValue, portfolioId);
    }

    return {
      success: true,
      portfolioId,
      snapshotDate: date,
      totalValue: values.totalValue,
      benchmarkValue
    };
  }

  getSnapshots(portfolioId, limit = 365) {
    return this.stmts.getSnapshots.all(portfolioId, limit);
  }

  getSnapshotRange(portfolioId, startDate, endDate) {
    return this.stmts.getSnapshotRange.all(portfolioId, startDate, endDate);
  }

  // ============================================
  // Convenience methods (delegate to engines)
  // ============================================

  // Holdings
  getPositions(portfolioId) {
    return this.holdingsEngine.getPositions(portfolioId);
  }

  getPosition(portfolioId, companyId) {
    return this.holdingsEngine.getPosition(portfolioId, companyId);
  }

  getLots(positionId, openOnly = false) {
    return this.holdingsEngine.getLots(positionId, openOnly);
  }

  executeBuy(portfolioId, params) {
    return this.holdingsEngine.executeBuy(portfolioId, params);
  }

  executeSell(portfolioId, params) {
    return this.holdingsEngine.executeSell(portfolioId, params);
  }

  deposit(portfolioId, amount, options = {}) {
    return this.holdingsEngine.deposit(portfolioId, amount, options);
  }

  withdraw(portfolioId, amount, options = {}) {
    return this.holdingsEngine.withdraw(portfolioId, amount, options);
  }

  recordDividend(portfolioId, params) {
    return this.holdingsEngine.recordDividend(portfolioId, params);
  }

  getTransactions(portfolioId, options = {}) {
    return this.holdingsEngine.getTransactions(portfolioId, options);
  }

  // Orders
  createOrder(portfolioId, params) {
    return this.orderEngine.createOrder(portfolioId, params);
  }

  getActiveOrders(portfolioId) {
    return this.orderEngine.getActiveOrders(portfolioId);
  }

  cancelOrder(orderId) {
    return this.orderEngine.cancelOrder(orderId);
  }

  checkAndExecuteOrders() {
    return this.orderEngine.checkAndExecuteOrders();
  }

  refreshValues(portfolioId) {
    return this.holdingsEngine.refreshPositionValues(portfolioId);
  }

  // ============================================
  // Integration Helpers (for UI integration)
  // ============================================

  // Quick add from company detail page
  addFromCompanyPage(portfolioId, companyId, shares, price) {
    // Validate first
    const validation = this.holdingsEngine.validateTrade(portfolioId, {
      companyId,
      side: 'buy',
      shares,
      price
    });

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return this.holdingsEngine.executeBuy(portfolioId, {
      companyId,
      shares,
      pricePerShare: price,
      fees: 0,
      notes: 'Added from company page'
    });
  }

  // Add multiple stocks from screener results
  addFromScreener(portfolioId, selections, allocation = 'equal') {
    // selections: [{ companyId, shares?, weight? }]
    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const availableCash = portfolio.current_cash;
    const results = [];

    // Calculate allocations
    let allocations;
    if (allocation === 'equal') {
      const perStock = availableCash / selections.length;
      allocations = selections.map(s => ({ ...s, amount: perStock }));
    } else if (allocation === 'market_cap') {
      // Get market caps
      const marketCaps = [];
      let totalMarketCap = 0;
      for (const sel of selections) {
        const company = this.db.prepare('SELECT market_cap FROM companies WHERE id = ?').get(sel.companyId);
        const cap = company?.market_cap || 0;
        marketCaps.push({ ...sel, marketCap: cap });
        totalMarketCap += cap;
      }
      allocations = marketCaps.map(s => ({
        ...s,
        amount: totalMarketCap > 0 ? (s.marketCap / totalMarketCap) * availableCash : availableCash / selections.length
      }));
    } else if (typeof allocation === 'object') {
      // Custom weights provided
      allocations = selections.map((s, i) => ({
        ...s,
        amount: (allocation[i] || 0) * availableCash
      }));
    } else {
      throw new Error('Invalid allocation type. Use "equal", "market_cap", or provide custom weights');
    }

    // Execute buys
    for (const alloc of allocations) {
      try {
        // Get current price
        const priceRow = this.db.prepare(`
          SELECT close as price FROM daily_prices
          WHERE company_id = ? ORDER BY date DESC LIMIT 1
        `).get(alloc.companyId);

        if (!priceRow) {
          results.push({
            companyId: alloc.companyId,
            success: false,
            error: 'No price data available'
          });
          continue;
        }

        const shares = alloc.shares || Math.floor(alloc.amount / priceRow.price);
        if (shares <= 0) {
          results.push({
            companyId: alloc.companyId,
            success: false,
            error: 'Insufficient funds for even 1 share'
          });
          continue;
        }

        const result = this.holdingsEngine.executeBuy(portfolioId, {
          companyId: alloc.companyId,
          shares,
          pricePerShare: priceRow.price,
          fees: 0,
          notes: 'Added from screener'
        });

        results.push({
          companyId: alloc.companyId,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          companyId: alloc.companyId,
          success: false,
          error: error.message
        });
      }
    }

    return {
      success: true,
      added: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // Convert watchlist to portfolio
  createFromWatchlist(watchlistItems, { name, initialCash, allocation = 'equal' }) {
    // watchlistItems: [{ companyId, symbol }]

    // Create portfolio
    const portfolio = this.createPortfolio({
      name,
      description: 'Created from watchlist',
      initialCash
    });

    // Add stocks from watchlist
    const selections = watchlistItems.map(item => ({ companyId: item.companyId || item.company_id }));
    const addResult = this.addFromScreener(portfolio.portfolioId, selections, allocation);

    return {
      success: true,
      portfolioId: portfolio.portfolioId,
      name,
      initialCash,
      positionsAdded: addResult.added,
      positionsFailed: addResult.failed,
      results: addResult.results
    };
  }

  // Get portfolio summaries for dashboard widget
  getPortfolioSummaries(userId = null) {
    const portfolios = this.getAllPortfolios(userId);

    return portfolios.map(p => {
      try {
        this.holdingsEngine.refreshPositionValues(p.id);
        const values = this.holdingsEngine.calculatePortfolioValue(p.id);

        return {
          id: p.id,
          name: p.name,
          type: p.portfolio_type,
          positionsCount: p.positions_count,
          cashValue: values.cashValue,
          positionsValue: values.positionsValue,
          totalValue: values.totalValue,
          totalReturn: values.totalReturn,
          totalReturnPct: values.netInvested > 0
            ? (values.totalReturn / values.netInvested) * 100
            : 0,
          unrealizedPnl: values.unrealizedPnl,
          realizedPnl: values.realizedPnl,
          createdAt: p.created_at
        };
      } catch (error) {
        return {
          id: p.id,
          name: p.name,
          type: p.portfolio_type,
          error: error.message
        };
      }
    });
  }

  // ============================================
  // Portfolio Duplication
  // ============================================

  duplicatePortfolio(portfolioId, newName) {
    const original = this.stmts.getPortfolio.get(portfolioId);
    if (!original) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Create new portfolio with same settings
    const newPortfolio = this.createPortfolio({
      name: newName || `${original.name} (Copy)`,
      description: original.description ? `Copy of: ${original.description}` : `Copy of portfolio ${portfolioId}`,
      portfolioType: original.portfolio_type,
      benchmarkIndexId: original.benchmark_index_id,
      currency: original.currency,
      initialCash: original.current_cash // Start with same cash
    });

    // Copy positions
    const positions = this.holdingsEngine.getPositions(portfolioId);
    const copiedPositions = [];

    for (const pos of positions) {
      try {
        // Get current price
        const priceRow = this.db.prepare(`
          SELECT close as price FROM daily_prices
          WHERE company_id = ? ORDER BY date DESC LIMIT 1
        `).get(pos.company_id);

        const price = priceRow?.price || pos.average_cost;

        // Buy same number of shares
        const result = this.holdingsEngine.executeBuy(newPortfolio.portfolioId, {
          companyId: pos.company_id,
          shares: pos.shares,
          pricePerShare: price,
          fees: 0,
          notes: `Duplicated from portfolio ${portfolioId}`
        });

        copiedPositions.push({
          symbol: pos.symbol,
          shares: pos.shares,
          success: true
        });
      } catch (error) {
        copiedPositions.push({
          symbol: pos.symbol,
          shares: pos.shares,
          success: false,
          error: error.message
        });
      }
    }

    // Copy DRIP setting
    this.db.prepare(`
      UPDATE portfolios SET dividend_reinvest = ? WHERE id = ?
    `).run(original.dividend_reinvest || 0, newPortfolio.portfolioId);

    return {
      success: true,
      originalId: portfolioId,
      newPortfolioId: newPortfolio.portfolioId,
      name: newPortfolio.name,
      positionsCopied: copiedPositions.filter(p => p.success).length,
      positionsFailed: copiedPositions.filter(p => !p.success).length,
      positions: copiedPositions
    };
  }

  // ============================================
  // Bulk Operations
  // ============================================

  // Delegate bulk operations to holdings engine
  liquidatePortfolio(portfolioId) {
    return this.holdingsEngine.liquidatePortfolio(portfolioId);
  }

  closePosition(portfolioId, companyId) {
    return this.holdingsEngine.closePosition(portfolioId, companyId);
  }

  processDividend(portfolioId, params) {
    return this.holdingsEngine.processDividend(portfolioId, params);
  }

  validateTrade(portfolioId, params) {
    return this.holdingsEngine.validateTrade(portfolioId, params);
  }

  // Stock split processing
  processStockSplit(companyId, splitRatio, effectiveDate = null) {
    return this.holdingsEngine.processStockSplit(companyId, splitRatio, effectiveDate);
  }

  processStockSplitForPortfolio(portfolioId, companyId, splitRatio, effectiveDate = null) {
    return this.holdingsEngine.processStockSplitForPortfolio(portfolioId, companyId, splitRatio, effectiveDate);
  }

  // Set DRIP setting for portfolio
  setDividendReinvest(portfolioId, enabled) {
    this.db.prepare(`
      UPDATE portfolios SET dividend_reinvest = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(enabled ? 1 : 0, portfolioId);
    return { success: true, portfolioId, dividendReinvest: enabled };
  }

  refreshAllPortfolios() {
    const portfolios = this.getAllPortfolios();
    const results = [];

    for (const portfolio of portfolios) {
      try {
        const refreshResult = this.holdingsEngine.refreshPositionValues(portfolio.id);
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: true,
          ...refreshResult
        });
      } catch (error) {
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  takeAllSnapshots(snapshotDate = null) {
    const portfolios = this.getAllPortfolios();
    const results = [];

    for (const portfolio of portfolios) {
      try {
        const snapshotResult = this.takeSnapshot(portfolio.id, snapshotDate);
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: true,
          ...snapshotResult
        });
      } catch (error) {
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // ============================================
  // Alerts (delegate to alertsService)
  // ============================================

  getAlertSettings(portfolioId) {
    return this.alertsService.getAlertSettings(portfolioId);
  }

  updateAlertSetting(portfolioId, alertType, settings) {
    return this.alertsService.updateAlertSetting(portfolioId, alertType, settings);
  }

  getAlerts(portfolioId, options = {}) {
    return this.alertsService.getAlerts(portfolioId, options);
  }

  getUnreadAlertCount(portfolioId) {
    return this.alertsService.getUnreadCount(portfolioId);
  }

  markAlertsAsRead(alertIds) {
    return this.alertsService.markAsRead(alertIds);
  }

  markAllAlertsAsRead(portfolioId) {
    return this.alertsService.markAllAsRead(portfolioId);
  }

  dismissAlert(alertId) {
    return this.alertsService.dismissAlert(alertId);
  }

  /**
   * Check all alerts for a single portfolio
   */
  checkPortfolioAlerts(portfolioId) {
    // Refresh values first
    this.holdingsEngine.refreshPositionValues(portfolioId);

    const portfolio = this.stmts.getPortfolio.get(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const values = this.holdingsEngine.calculatePortfolioValue(portfolioId);
    const positions = this.holdingsEngine.getPositions(portfolioId);

    // Get yesterday's snapshot for daily change calculation
    const yesterdaySnapshot = this.db.prepare(`
      SELECT total_value FROM portfolio_snapshots
      WHERE portfolio_id = ? AND snapshot_date < date('now')
      ORDER BY snapshot_date DESC LIMIT 1
    `).get(portfolioId);

    const previousValue = yesterdaySnapshot?.total_value || values.totalValue;
    const dailyChange = values.totalValue - previousValue;
    const dailyChangePct = previousValue > 0 ? (dailyChange / previousValue) * 100 : 0;

    // Get high water mark from snapshots
    const highWaterMarkRow = this.db.prepare(`
      SELECT MAX(total_value) as high_water_mark FROM portfolio_snapshots
      WHERE portfolio_id = ?
    `).get(portfolioId);

    const portfolioData = {
      totalValue: values.totalValue,
      cashBalance: values.cashValue,
      positionsValue: values.positionsValue,
      positions: positions.map(p => ({
        symbol: p.symbol,
        currentValue: p.current_value || 0,
        shares: p.shares
      })),
      dailyChange,
      dailyChangePct,
      highWaterMark: highWaterMarkRow?.high_water_mark || values.totalValue,
      previousHighWaterMark: portfolio.high_water_mark || 0
    };

    return this.alertsService.checkPortfolioAlerts(portfolioId, portfolioData);
  }

  /**
   * Check alerts for all portfolios
   */
  checkAllPortfolioAlerts() {
    const portfolios = this.getAllPortfolios();
    const results = [];

    for (const portfolio of portfolios) {
      try {
        const alerts = this.checkPortfolioAlerts(portfolio.id);
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: true,
          alertsTriggered: alerts.length,
          alerts
        });
      } catch (error) {
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: false,
          error: error.message
        });
      }
    }

    return {
      checked: results.length,
      successful: results.filter(r => r.success).length,
      totalAlerts: results.reduce((sum, r) => sum + (r.alertsTriggered || 0), 0),
      results
    };
  }

  /**
   * Create order triggered alert (called from order engine after execution)
   */
  createOrderTriggeredAlert(portfolioId, order, result) {
    return this.alertsService.createOrderTriggeredAlert(portfolioId, order, result);
  }

  /**
   * Create dividend alert (called from holdings engine after dividend processing)
   */
  createDividendAlert(portfolioId, dividendData) {
    return this.alertsService.createDividendAlert(portfolioId, dividendData);
  }

  /**
   * Get all unread alerts across all portfolios (for dashboard notification badge)
   */
  getAllUnreadAlerts(limit = 20) {
    const alerts = this.db.prepare(`
      SELECT pa.*, p.name as portfolio_name
      FROM portfolio_alerts pa
      JOIN portfolios p ON pa.portfolio_id = p.id
      WHERE pa.is_read = 0
      ORDER BY pa.created_at DESC
      LIMIT ?
    `).all(limit);

    return alerts.map(a => ({
      id: a.id,
      portfolioId: a.portfolio_id,
      portfolioName: a.portfolio_name,
      alertType: a.alert_type,
      severity: a.severity,
      message: a.message,
      data: a.data ? JSON.parse(a.data) : null,
      createdAt: a.created_at
    }));
  }

  /**
   * Get total unread alert count across all portfolios
   */
  getTotalUnreadAlertCount() {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM portfolio_alerts WHERE is_read = 0
    `).get();
    return result.count;
  }
}

// Singleton instance
let instance = null;

function getPortfolioService(db) {
  if (!instance) {
    instance = new PortfolioService(db);
  }
  return instance;
}

module.exports = {
  PortfolioService,
  getPortfolioService,
  // Analytics engines (Agent 2)
  metricsEngine,
  backtestEngine,
  monteCarloEngine,
  positionSizing,
  // Advanced analytics (Agent 2)
  stressTestEngine,
  STRESS_SCENARIOS,
  advancedAnalytics,
  whatIfAnalysis,
  rebalanceCalculator,
  // Hedge fund-grade optimization (Agent 2 - Phase 2)
  VaRCalculator,
  EfficientFrontierCalculator,
  HierarchicalRiskParity,
  PerformanceAttribution,
  // Dividend processing
  DividendProcessor,
  getDividendProcessor,
};
