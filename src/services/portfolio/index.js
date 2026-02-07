// src/services/portfolio/index.js
// Main portfolio service - orchestrates holdings and order engines

const { getDatabaseAsync } = require('../../database');
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

// Lazy-loaded engines (converted to singletons)
let holdingsEngineInstance = null;
let orderEngineInstance = null;
let alertsServiceInstance = null;

class PortfolioService {
  // Lazy load the holdings engine
  get holdingsEngine() {
    if (!holdingsEngineInstance) {
      holdingsEngineInstance = new HoldingsEngine();
    }
    return holdingsEngineInstance;
  }

  // Lazy load the order engine
  get orderEngine() {
    if (!orderEngineInstance) {
      orderEngineInstance = new OrderEngine();
    }
    return orderEngineInstance;
  }

  // Lazy load the alerts service
  get alertsService() {
    if (!alertsServiceInstance) {
      alertsServiceInstance = new PortfolioAlertsService();
    }
    return alertsServiceInstance;
  }

  // ============================================
  // Portfolio CRUD
  // ============================================

  /**
   * Get all portfolios (for admin) or user-specific portfolios
   * @param {string|null} userId - User ID to filter by, or null for all (admin)
   */
  async getAllPortfolios(userId = null) {
    const database = await getDatabaseAsync();

    // First, get the list of portfolios to refresh
    let portfolios;
    if (userId) {
      const result = await database.query(`
        SELECT p.*,
          p.current_value as total_value,
          p.current_cash as cash_balance,
          (p.current_value - p.total_deposited + p.total_withdrawn) as total_gain,
          CASE
            WHEN (p.total_deposited - p.total_withdrawn) > 0
            THEN ((p.current_value - p.total_deposited + p.total_withdrawn) / (p.total_deposited - p.total_withdrawn)) * 100
            ELSE 0
          END as total_gain_pct,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
        FROM portfolios p
        WHERE p.is_archived = false AND p.user_id = $1
        ORDER BY p.created_at DESC
      `, [userId]);
      portfolios = result.rows;
    } else {
      const result = await database.query(`
        SELECT p.*,
          p.current_value as total_value,
          p.current_cash as cash_balance,
          (p.current_value - p.total_deposited + p.total_withdrawn) as total_gain,
          CASE
            WHEN (p.total_deposited - p.total_withdrawn) > 0
            THEN ((p.current_value - p.total_deposited + p.total_withdrawn) / (p.total_deposited - p.total_withdrawn)) * 100
            ELSE 0
          END as total_gain_pct,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
        FROM portfolios p
        WHERE p.is_archived = false
        ORDER BY p.created_at DESC
      `);
      portfolios = result.rows;
    }

    // Refresh position values for each portfolio to ensure current_value is up-to-date
    // This prevents stale values when market prices change between trade executions
    for (const portfolio of portfolios) {
      try {
        await this.holdingsEngine.refreshPositionValues(portfolio.id);
      } catch (error) {
        console.error(`Failed to refresh portfolio ${portfolio.id}:`, error);
        // Continue with stale value rather than failing entirely
      }
    }

    // Re-query to get updated values after refresh
    if (userId) {
      const result = await database.query(`
        SELECT p.*,
          p.current_value as total_value,
          p.current_cash as cash_balance,
          (p.current_value - p.total_deposited + p.total_withdrawn) as total_gain,
          CASE
            WHEN (p.total_deposited - p.total_withdrawn) > 0
            THEN ((p.current_value - p.total_deposited + p.total_withdrawn) / (p.total_deposited - p.total_withdrawn)) * 100
            ELSE 0
          END as total_gain_pct,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
        FROM portfolios p
        WHERE p.is_archived = false AND p.user_id = $1
        ORDER BY p.created_at DESC
      `, [userId]);
      return result.rows;
    }
    const result = await database.query(`
      SELECT p.*,
        p.current_value as total_value,
        p.current_cash as cash_balance,
        (p.current_value - p.total_deposited + p.total_withdrawn) as total_gain,
        CASE
          WHEN (p.total_deposited - p.total_withdrawn) > 0
          THEN ((p.current_value - p.total_deposited + p.total_withdrawn) / (p.total_deposited - p.total_withdrawn)) * 100
          ELSE 0
        END as total_gain_pct,
        (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
      FROM portfolios p
      WHERE p.is_archived = false
      ORDER BY p.created_at DESC
    `);
    return result.rows;
  }

  async getPortfolio(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count,
        (SELECT COUNT(*) FROM portfolio_orders WHERE portfolio_id = p.id AND status = 'active') as active_orders_count
      FROM portfolios p
      WHERE p.id = $1
    `, [portfolioId]);
    return result.rows[0];
  }

  /**
   * Check if a user owns a portfolio
   * @param {number} portfolioId
   * @param {string} userId
   * @returns {boolean}
   */
  async isPortfolioOwner(portfolioId, userId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT user_id FROM portfolios WHERE id = $1
    `, [portfolioId]);
    const owner = result.rows[0];
    if (!owner) return false;
    // If portfolio has no user_id (legacy), allow access
    if (!owner.user_id) return true;
    return owner.user_id === userId;
  }

  /**
   * Get portfolio owner
   * @param {number} portfolioId
   * @returns {string|null}
   */
  async getPortfolioOwner(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT user_id FROM portfolios WHERE id = $1
    `, [portfolioId]);
    const owner = result.rows[0];
    return owner?.user_id || null;
  }

  async createPortfolio({
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
    const database = await getDatabaseAsync();
    const date = initialDate || new Date().toISOString().split('T')[0];

    const result = await database.query(`
      INSERT INTO portfolios
      (name, description, portfolio_type, benchmark_index_id, currency,
       initial_cash, initial_date, current_cash, current_value,
       total_deposited, clone_investor_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
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
    ]);

    return {
      success: true,
      portfolioId: result.rows[0].id,
      name,
      initialCash,
      initialDate: date,
      userId
    };
  }

  async updatePortfolio(portfolioId, { name = null, description = null, benchmarkIndexId = null }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE portfolios
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          benchmark_index_id = COALESCE($3, benchmark_index_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [name, description, benchmarkIndexId, portfolioId]);
    return { success: true, portfolioId };
  }

  async archivePortfolio(portfolioId) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE portfolios
      SET is_archived = true,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [portfolioId]);
    return { success: true, portfolioId, archived: true };
  }

  async deletePortfolio(portfolioId) {
    const database = await getDatabaseAsync();
    // This will cascade delete positions, lots, transactions, orders due to FK constraints
    await database.query(`DELETE FROM portfolios WHERE id = $1`, [portfolioId]);
    return { success: true, portfolioId, deleted: true };
  }

  // ============================================
  // Full Portfolio Summary
  // ============================================

  async getPortfolioSummary(portfolioId) {
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Refresh position values
    await this.holdingsEngine.refreshPositionValues(portfolioId);

    // Get value calculation
    const values = await this.holdingsEngine.calculatePortfolioValue(portfolioId);

    // Get positions
    const positions = await this.holdingsEngine.getPositions(portfolioId);

    // Get active orders
    const activeOrders = await this.orderEngine.getActiveOrders(portfolioId);

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
        createdAt: portfolio.created_at,
        agentId: portfolio.agent_id // For agent-managed portfolios
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

  async takeSnapshot(portfolioId, snapshotDate = null) {
    const database = await getDatabaseAsync();
    const date = snapshotDate || new Date().toISOString().split('T')[0];

    // Refresh values first
    await this.holdingsEngine.refreshPositionValues(portfolioId);

    const portfolioResult = await database.query(`SELECT * FROM portfolios WHERE id = $1`, [portfolioId]);
    const portfolio = portfolioResult.rows[0];
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const values = await this.holdingsEngine.calculatePortfolioValue(portfolioId);

    // Get benchmark value if benchmark_index_id is set
    let benchmarkValue = null;
    if (portfolio.benchmark_index_id) {
      const benchmarkResult = await database.query(`
        SELECT close FROM market_index_prices
        WHERE index_id = $1 AND date <= $2
        ORDER BY date DESC
        LIMIT 1
      `, [portfolio.benchmark_index_id, date]);
      const benchmarkPrice = benchmarkResult.rows[0];
      benchmarkValue = benchmarkPrice?.close || null;
    }

    await database.query(`
      INSERT INTO portfolio_snapshots
      (portfolio_id, snapshot_date, total_value, cash_value, positions_value,
       total_cost_basis, unrealized_pnl, realized_pnl, total_deposited,
       total_withdrawn, positions_count, benchmark_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE SET
        total_value = excluded.total_value,
        cash_value = excluded.cash_value,
        positions_value = excluded.positions_value,
        total_cost_basis = excluded.total_cost_basis,
        unrealized_pnl = excluded.unrealized_pnl,
        realized_pnl = excluded.realized_pnl,
        total_deposited = excluded.total_deposited,
        total_withdrawn = excluded.total_withdrawn,
        positions_count = excluded.positions_count,
        benchmark_value = excluded.benchmark_value
    `, [
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
    ]);

    // Update high water mark if current value exceeds it
    if (values.totalValue > (portfolio.high_water_mark || 0)) {
      await database.query(`
        UPDATE portfolios SET high_water_mark = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `, [values.totalValue, portfolioId]);
    }

    return {
      success: true,
      portfolioId,
      snapshotDate: date,
      totalValue: values.totalValue,
      benchmarkValue
    };
  }

  async getSnapshots(portfolioId, limit = 365) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM portfolio_snapshots
      WHERE portfolio_id = $1
      ORDER BY snapshot_date DESC
      LIMIT $2
    `, [portfolioId, limit]);
    return result.rows;
  }

  async getSnapshotRange(portfolioId, startDate, endDate) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM portfolio_snapshots
      WHERE portfolio_id = $1
        AND snapshot_date BETWEEN $2 AND $3
      ORDER BY snapshot_date ASC
    `, [portfolioId, startDate, endDate]);
    return result.rows;
  }

  // ============================================
  // Convenience methods (delegate to engines)
  // ============================================

  // Holdings
  async getPositions(portfolioId) {
    return await this.holdingsEngine.getPositions(portfolioId);
  }

  async getPosition(portfolioId, companyId) {
    return await this.holdingsEngine.getPosition(portfolioId, companyId);
  }

  async getLots(positionId, openOnly = false) {
    return await this.holdingsEngine.getLots(positionId, openOnly);
  }

  async executeBuy(portfolioId, params) {
    return await this.holdingsEngine.executeBuy(portfolioId, params);
  }

  async executeSell(portfolioId, params) {
    return await this.holdingsEngine.executeSell(portfolioId, params);
  }

  async deposit(portfolioId, amount, options = {}) {
    return await this.holdingsEngine.deposit(portfolioId, amount, options);
  }

  async withdraw(portfolioId, amount, options = {}) {
    return await this.holdingsEngine.withdraw(portfolioId, amount, options);
  }

  async recordDividend(portfolioId, params) {
    return await this.holdingsEngine.recordDividend(portfolioId, params);
  }

  async getTransactions(portfolioId, options = {}) {
    return await this.holdingsEngine.getTransactions(portfolioId, options);
  }

  // Orders
  async createOrder(portfolioId, params) {
    return await this.orderEngine.createOrder(portfolioId, params);
  }

  async getActiveOrders(portfolioId) {
    return await this.orderEngine.getActiveOrders(portfolioId);
  }

  async cancelOrder(orderId) {
    return await this.orderEngine.cancelOrder(orderId);
  }

  async checkAndExecuteOrders() {
    return await this.orderEngine.checkAndExecuteOrders();
  }

  async refreshValues(portfolioId) {
    return await this.holdingsEngine.refreshPositionValues(portfolioId);
  }

  // ============================================
  // Integration Helpers (for UI integration)
  // ============================================

  // Quick add from company detail page
  async addFromCompanyPage(portfolioId, companyId, shares, price) {
    // Validate first
    const validation = await this.holdingsEngine.validateTrade(portfolioId, {
      companyId,
      side: 'buy',
      shares,
      price
    });

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    return await this.holdingsEngine.executeBuy(portfolioId, {
      companyId,
      shares,
      pricePerShare: price,
      fees: 0,
      notes: 'Added from company page'
    });
  }

  // Add multiple stocks from screener results
  async addFromScreener(portfolioId, selections, allocation = 'equal') {
    const database = await getDatabaseAsync();
    // selections: [{ companyId, shares?, weight? }]
    const portfolio = await this.getPortfolio(portfolioId);
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
        const result = await database.query('SELECT market_cap FROM companies WHERE id = $1', [sel.companyId]);
        const company = result.rows[0];
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
        const priceResult = await database.query(`
          SELECT close as price FROM daily_prices
          WHERE company_id = $1 ORDER BY date DESC LIMIT 1
        `, [alloc.companyId]);
        const priceRow = priceResult.rows[0];

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

        const result = await this.holdingsEngine.executeBuy(portfolioId, {
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
  async createFromWatchlist(watchlistItems, { name, initialCash, allocation = 'equal' }) {
    // watchlistItems: [{ companyId, symbol }]

    // Create portfolio
    const portfolio = await this.createPortfolio({
      name,
      description: 'Created from watchlist',
      initialCash
    });

    // Add stocks from watchlist
    const selections = watchlistItems.map(item => ({ companyId: item.companyId || item.company_id }));
    const addResult = await this.addFromScreener(portfolio.portfolioId, selections, allocation);

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
  async getPortfolioSummaries(userId = null) {
    const portfolios = await this.getAllPortfolios(userId);

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

  async duplicatePortfolio(portfolioId, newName) {
    const database = await getDatabaseAsync();
    const originalResult = await database.query('SELECT * FROM portfolios WHERE id = $1', [portfolioId]);
    const original = originalResult.rows[0];
    if (!original) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Create new portfolio with same settings
    const newPortfolio = await this.createPortfolio({
      name: newName || `${original.name} (Copy)`,
      description: original.description ? `Copy of: ${original.description}` : `Copy of portfolio ${portfolioId}`,
      portfolioType: original.portfolio_type,
      benchmarkIndexId: original.benchmark_index_id,
      currency: original.currency,
      initialCash: original.current_cash // Start with same cash
    });

    // Copy positions
    const positions = await this.holdingsEngine.getPositions(portfolioId);
    const copiedPositions = [];

    for (const pos of positions) {
      try {
        // Get current price
        const priceResult = await database.query(`
          SELECT close as price FROM daily_prices
          WHERE company_id = $1 ORDER BY date DESC LIMIT 1
        `, [pos.company_id]);
        const priceRow = priceResult.rows[0];

        const price = priceRow?.price || pos.average_cost;

        // Buy same number of shares
        const result = await this.holdingsEngine.executeBuy(newPortfolio.portfolioId, {
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
    await database.query(`
      UPDATE portfolios SET dividend_reinvest = $1 WHERE id = $2
    `, [original.dividend_reinvest || false, newPortfolio.portfolioId]);

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
  async liquidatePortfolio(portfolioId) {
    return await this.holdingsEngine.liquidatePortfolio(portfolioId);
  }

  async closePosition(portfolioId, companyId) {
    return await this.holdingsEngine.closePosition(portfolioId, companyId);
  }

  async processDividend(portfolioId, params) {
    return await this.holdingsEngine.processDividend(portfolioId, params);
  }

  async validateTrade(portfolioId, params) {
    return await this.holdingsEngine.validateTrade(portfolioId, params);
  }

  // Stock split processing
  async processStockSplit(companyId, splitRatio, effectiveDate = null) {
    return await this.holdingsEngine.processStockSplit(companyId, splitRatio, effectiveDate);
  }

  async processStockSplitForPortfolio(portfolioId, companyId, splitRatio, effectiveDate = null) {
    return await this.holdingsEngine.processStockSplitForPortfolio(portfolioId, companyId, splitRatio, effectiveDate);
  }

  // Set DRIP setting for portfolio
  async setDividendReinvest(portfolioId, enabled) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE portfolios SET dividend_reinvest = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [enabled ? true : false, portfolioId]);
    return { success: true, portfolioId, dividendReinvest: enabled };
  }

  async refreshAllPortfolios() {
    const portfolios = await this.getAllPortfolios();
    const results = [];

    for (const portfolio of portfolios) {
      try {
        const refreshResult = await this.holdingsEngine.refreshPositionValues(portfolio.id);
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

  async takeAllSnapshots(snapshotDate = null) {
    const portfolios = await this.getAllPortfolios();
    const results = [];

    for (const portfolio of portfolios) {
      try {
        const snapshotResult = await this.takeSnapshot(portfolio.id, snapshotDate);
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

  async getAlertSettings(portfolioId) {
    return await this.alertsService.getAlertSettings(portfolioId);
  }

  async updateAlertSetting(portfolioId, alertType, settings) {
    return await this.alertsService.updateAlertSetting(portfolioId, alertType, settings);
  }

  async getAlerts(portfolioId, options = {}) {
    return await this.alertsService.getAlerts(portfolioId, options);
  }

  async getUnreadAlertCount(portfolioId) {
    return await this.alertsService.getUnreadCount(portfolioId);
  }

  async markAlertsAsRead(alertIds) {
    return await this.alertsService.markAsRead(alertIds);
  }

  async markAllAlertsAsRead(portfolioId) {
    return await this.alertsService.markAllAsRead(portfolioId);
  }

  async dismissAlert(alertId) {
    return await this.alertsService.dismissAlert(alertId);
  }

  /**
   * Check all alerts for a single portfolio
   */
  async checkPortfolioAlerts(portfolioId) {
    const database = await getDatabaseAsync();
    // Refresh values first
    await this.holdingsEngine.refreshPositionValues(portfolioId);

    const portfolioResult = await database.query('SELECT * FROM portfolios WHERE id = $1', [portfolioId]);
    const portfolio = portfolioResult.rows[0];
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const values = await this.holdingsEngine.calculatePortfolioValue(portfolioId);
    const positions = await this.holdingsEngine.getPositions(portfolioId);

    // Get yesterday's snapshot for daily change calculation
    const yesterdayResult = await database.query(`
      SELECT total_value FROM portfolio_snapshots
      WHERE portfolio_id = $1 AND snapshot_date < CURRENT_DATE
      ORDER BY snapshot_date DESC LIMIT 1
    `, [portfolioId]);
    const yesterdaySnapshot = yesterdayResult.rows[0];

    const previousValue = yesterdaySnapshot?.total_value || values.totalValue;
    const dailyChange = values.totalValue - previousValue;
    const dailyChangePct = previousValue > 0 ? (dailyChange / previousValue) * 100 : 0;

    // Get high water mark from snapshots
    const highWaterMarkResult = await database.query(`
      SELECT MAX(total_value) as high_water_mark FROM portfolio_snapshots
      WHERE portfolio_id = $1
    `, [portfolioId]);
    const highWaterMarkRow = highWaterMarkResult.rows[0];

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

    return await this.alertsService.checkPortfolioAlerts(portfolioId, portfolioData);
  }

  /**
   * Check alerts for all portfolios
   */
  async checkAllPortfolioAlerts() {
    const portfolios = await this.getAllPortfolios();
    const results = [];

    for (const portfolio of portfolios) {
      try {
        const alerts = await this.checkPortfolioAlerts(portfolio.id);
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
  async createOrderTriggeredAlert(portfolioId, order, result) {
    return await this.alertsService.createOrderTriggeredAlert(portfolioId, order, result);
  }

  /**
   * Create dividend alert (called from holdings engine after dividend processing)
   */
  async createDividendAlert(portfolioId, dividendData) {
    return await this.alertsService.createDividendAlert(portfolioId, dividendData);
  }

  /**
   * Get all unread alerts across all portfolios (for dashboard notification badge)
   */
  async getAllUnreadAlerts(limit = 20) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT pa.*, p.name as portfolio_name
      FROM portfolio_alerts pa
      JOIN portfolios p ON pa.portfolio_id = p.id
      WHERE pa.is_read = false
      ORDER BY pa.created_at DESC
      LIMIT $1
    `, [limit]);

    const alerts = result.rows;

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
  async getTotalUnreadAlertCount() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT COUNT(*) as count FROM portfolio_alerts WHERE is_read = false
    `);
    return result.rows[0].count;
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
