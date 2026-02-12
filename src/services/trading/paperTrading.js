// src/services/trading/paperTrading.js
// Paper Trading Engine - Simulated order execution and portfolio tracking
// Supports both SQLite and PostgreSQL via db abstraction layer

const { isUsingPostgres } = require('../../lib/db');

/**
 * PaperTradingEngine - Simulates order execution and tracks paper P&L
 *
 * Features:
 * - Realistic order fills with configurable slippage
 * - Real-time position and P&L tracking
 * - Performance comparison to backtest expectations
 * - Strategy validation before real money deployment
 */

class PaperTradingEngine {
  /**
   * @param {Object} db Database instance (SQLite or PostgreSQL via lib/db)
   * @param {Object} config Configuration options
   */
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Starting capital
      initialCapital: config.initialCapital || 100000,

      // Slippage model parameters
      slippageModel: config.slippageModel || 'realistic', // 'none', 'fixed', 'realistic'
      fixedSlippageBps: config.fixedSlippageBps || 10, // 10 bps = 0.1%

      // Commission model
      commissionPerShare: config.commissionPerShare || 0,
      minCommission: config.minCommission || 0,
      commissionPercent: config.commissionPercent || 0, // 0.01 = 1%

      // Market simulation
      partialFillProbability: config.partialFillProbability || 0.1,
      fillDelayMs: config.fillDelayMs || 100,

      // Risk limits
      maxPositionSize: config.maxPositionSize || 0.2, // 20% of portfolio
      maxTotalExposure: config.maxTotalExposure || 0.95, // 95% of capital

      ...config
    };

    // In-memory state (reset on restart)
    this.accounts = {};
    this.activeOrders = new Map();
    this.orderIdCounter = 1;

    // Initialize database tables (SQLite only - Postgres uses migration 024)
    if (!isUsingPostgres()) {
      this._initTablesSync();
    }

    console.log('📄 Paper Trading Engine initialized');
  }

  _initTablesSync() {
    if (typeof this.db.exec !== 'function') return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        initial_capital REAL NOT NULL,
        cash_balance REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        quantity REAL NOT NULL,
        avg_cost REAL NOT NULL,
        current_price REAL,
        unrealized_pnl REAL,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES paper_accounts(id),
        UNIQUE(account_id, symbol)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        order_id TEXT NOT NULL UNIQUE,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        order_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        limit_price REAL,
        stop_price REAL,
        filled_quantity REAL DEFAULT 0,
        avg_fill_price REAL,
        status TEXT DEFAULT 'pending',
        commission REAL DEFAULT 0,
        slippage REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        filled_at TEXT,
        canceled_at TEXT,
        notes TEXT,
        FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        order_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        commission REAL NOT NULL,
        slippage REAL NOT NULL,
        realized_pnl REAL,
        executed_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        snapshot_date TEXT NOT NULL,
        portfolio_value REAL NOT NULL,
        cash_balance REAL NOT NULL,
        positions_value REAL NOT NULL,
        daily_pnl REAL,
        cumulative_pnl REAL,
        FOREIGN KEY (account_id) REFERENCES paper_accounts(id),
        UNIQUE(account_id, snapshot_date)
      )
    `);
  }

  /** Run query - works with both sync SQLite and async Postgres */
  async _query(sql, params = []) {
    return Promise.resolve(this.db.query(sql, params));
  }

  /** Run query and return first row */
  async _queryOne(sql, params = []) {
    const res = await this._query(sql, params);
    const rows = res.rows || [];
    return rows[0] || null;
  }

  /** Run query and return all rows */
  async _queryAll(sql, params = []) {
    const res = await this._query(sql, params);
    return res.rows || [];
  }

  // ==========================================
  // ACCOUNT MANAGEMENT
  // ==========================================

  /**
   * Create a new paper trading account
   * @param {string} name Account name
   * @param {number} initialCapital Starting capital
   * @returns {Promise<Object>} Account details
   */
  async createAccount(name, initialCapital = null) {
    const capital = initialCapital || this.config.initialCapital;

    try {
      if (isUsingPostgres()) {
        const res = await this._query(
          'INSERT INTO paper_accounts (name, initial_capital, cash_balance) VALUES (?, ?, ?) RETURNING id',
          [name, capital, capital]
        );
        const id = (res.rows && res.rows[0]) ? res.rows[0].id : null;
        if (!id) throw new Error('Failed to create account');
        return {
          id,
          name,
          initialCapital: capital,
          cashBalance: capital,
          createdAt: new Date().toISOString()
        };
      }
      const res = await this._query(
        'INSERT INTO paper_accounts (name, initial_capital, cash_balance) VALUES (?, ?, ?)',
        [name, capital, capital]
      );
      const id = res.lastInsertRowid;
      return {
        id,
        name,
        initialCapital: capital,
        cashBalance: capital,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate'))) {
        throw new Error(`Account '${name}' already exists`);
      }
      throw err;
    }
  }

  /**
   * Get account by ID or name
   */
  async getAccount(idOrName) {
    const account = typeof idOrName === 'number'
      ? await this._queryOne('SELECT * FROM paper_accounts WHERE id = ?', [idOrName])
      : await this._queryOne('SELECT * FROM paper_accounts WHERE name = ?', [idOrName]);

    if (!account) {
      throw new Error(`Account not found: ${idOrName}`);
    }

    return account;
  }

  /**
   * Get full account status including positions and value
   */
  async getAccountStatus(accountId) {
    const account = await this.getAccount(accountId);
    const positions = await this._queryAll('SELECT * FROM paper_positions WHERE account_id = ?', [accountId]);

    // Update position prices and calculate value
    let positionsValue = 0;
    let unrealizedPnl = 0;

    const updatedPositions = [];
    for (const pos of positions) {
      const priceData = await this._queryOne(
        `SELECT p.close as price, p.date as price_date
         FROM daily_prices p
         JOIN companies c ON c.id = p.company_id
         WHERE c.symbol = ?
         ORDER BY p.date DESC
         LIMIT 1`,
        [pos.symbol]
      );
      const currentPrice = priceData?.price || pos.current_price || pos.avg_cost;
      const marketValue = pos.quantity * currentPrice;
      const costBasis = pos.quantity * pos.avg_cost;
      const posUnrealizedPnl = marketValue - costBasis;

      positionsValue += marketValue;
      unrealizedPnl += posUnrealizedPnl;

      updatedPositions.push({
        ...pos,
        currentPrice,
        marketValue,
        costBasis,
        unrealizedPnl: posUnrealizedPnl,
        unrealizedPnlPercent: costBasis > 0 ? (posUnrealizedPnl / costBasis * 100) : 0
      });
    }

    const portfolioValue = account.cash_balance + positionsValue;
    const totalReturn = portfolioValue - account.initial_capital;
    const totalReturnPercent = (totalReturn / account.initial_capital * 100);

    return {
      account: {
        id: account.id,
        name: account.name,
        initialCapital: account.initial_capital,
        cashBalance: account.cash_balance
      },
      positions: updatedPositions,
      summary: {
        portfolioValue,
        positionsValue,
        cashBalance: account.cash_balance,
        unrealizedPnl,
        totalReturn,
        totalReturnPercent: totalReturnPercent.toFixed(2) + '%',
        positionCount: positions.length,
        buyingPower: account.cash_balance
      }
    };
  }

  // ==========================================
  // ORDER MANAGEMENT
  // ==========================================

  /**
   * Submit a new order
   * @param {number} accountId Account ID
   * @param {Object} order Order details
   * @returns {Promise<Object>} Order confirmation
   */
  async submitOrder(accountId, order) {
    const account = await this.getAccount(accountId);

    // Validate order
    await this._validateOrder(account, order);

    // Generate order ID
    const orderId = `PAPER-${Date.now()}-${this.orderIdCounter++}`;

    // Get current market price
    const priceData = await this._queryOne(
      `SELECT p.close as price, p.date as price_date
       FROM daily_prices p
       JOIN companies c ON c.id = p.company_id
       WHERE c.symbol = ?
       ORDER BY p.date DESC
       LIMIT 1`,
      [order.symbol]
    );
    if (!priceData) {
      throw new Error(`No price data available for ${order.symbol}`);
    }
    const marketPrice = priceData.price;

    // Determine fill price based on order type
    let fillPrice = marketPrice;
    let canFill = true;

    if (order.orderType === 'LIMIT') {
      if (order.side === 'BUY' && marketPrice > order.limitPrice) {
        canFill = false;
      } else if (order.side === 'SELL' && marketPrice < order.limitPrice) {
        canFill = false;
      } else {
        fillPrice = order.limitPrice;
      }
    } else if (order.orderType === 'STOP') {
      if (order.side === 'BUY' && marketPrice < order.stopPrice) {
        canFill = false;
      } else if (order.side === 'SELL' && marketPrice > order.stopPrice) {
        canFill = false;
      }
    }

    // Insert order
    await this._query(
      `INSERT INTO paper_orders (
        account_id, order_id, symbol, side, order_type,
        quantity, limit_price, stop_price, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        orderId,
        order.symbol,
        order.side,
        order.orderType || 'MARKET',
        order.quantity,
        order.limitPrice || null,
        order.stopPrice || null,
        canFill ? 'pending' : 'open',
        order.notes || null
      ]
    );

    // If can fill immediately, execute
    if (canFill) {
      return this._executeOrder(accountId, orderId, order, fillPrice);
    }

    return {
      orderId,
      status: 'open',
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      orderType: order.orderType,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      message: 'Order submitted, waiting for fill conditions'
    };
  }

  /**
   * Execute an order (internal)
   */
  async _executeOrder(accountId, orderId, order, basePrice) {
    const account = await this.getAccount(accountId);

    // Calculate slippage
    const slippage = this._calculateSlippage(order, basePrice);
    const fillPrice = order.side === 'BUY'
      ? basePrice * (1 + slippage)
      : basePrice * (1 - slippage);

    // Calculate commission
    const commission = this._calculateCommission(order.quantity, fillPrice);

    // Calculate total cost/proceeds
    const totalValue = order.quantity * fillPrice;
    const totalCost = order.side === 'BUY'
      ? totalValue + commission
      : totalValue - commission;

    // Check buying power for buys
    if (order.side === 'BUY' && totalCost > account.cash_balance) {
      throw new Error(`Insufficient funds. Need $${totalCost.toFixed(2)}, have $${account.cash_balance.toFixed(2)}`);
    }

    // Update position
    const existingPosition = await this._queryOne(
      'SELECT * FROM paper_positions WHERE account_id = ? AND symbol = ?',
      [accountId, order.symbol]
    );
    let realizedPnl = 0;

    if (order.side === 'BUY') {
      const nowExpr = isUsingPostgres() ? 'NOW()' : "datetime('now')";
      if (existingPosition) {
        const newQuantity = existingPosition.quantity + order.quantity;
        const newCost = (existingPosition.quantity * existingPosition.avg_cost +
                        order.quantity * fillPrice) / newQuantity;
        await this._query(
          `INSERT INTO paper_positions (account_id, symbol, quantity, avg_cost, current_price)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(account_id, symbol) DO UPDATE SET
             quantity = excluded.quantity,
             avg_cost = excluded.avg_cost,
             current_price = excluded.current_price,
             updated_at = ${nowExpr}`,
          [accountId, order.symbol, newQuantity, newCost, fillPrice]
        );
      } else {
        await this._query(
          'INSERT INTO paper_positions (account_id, symbol, quantity, avg_cost, current_price) VALUES (?, ?, ?, ?, ?)',
          [accountId, order.symbol, order.quantity, fillPrice, fillPrice]
        );
      }

      await this._query(
        `UPDATE paper_accounts SET cash_balance = ?, updated_at = ${nowExpr} WHERE id = ?`,
        [account.cash_balance - totalCost, accountId]
      );
    } else {
      // SELL
      if (!existingPosition || existingPosition.quantity < order.quantity) {
        throw new Error(`Cannot sell ${order.quantity} shares of ${order.symbol}. ` +
                       `Current position: ${existingPosition?.quantity || 0}`);
      }

      realizedPnl = (fillPrice - existingPosition.avg_cost) * order.quantity - commission;

      const newQuantity = existingPosition.quantity - order.quantity;
      const nowExpr = isUsingPostgres() ? 'NOW()' : "datetime('now')";
      if (newQuantity > 0) {
        await this._query(
          `INSERT INTO paper_positions (account_id, symbol, quantity, avg_cost, current_price)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(account_id, symbol) DO UPDATE SET
             quantity = excluded.quantity,
             avg_cost = excluded.avg_cost,
             current_price = excluded.current_price,
             updated_at = ${nowExpr}`,
          [accountId, order.symbol, newQuantity, existingPosition.avg_cost, fillPrice]
        );
      } else {
        await this._query('DELETE FROM paper_positions WHERE account_id = ? AND symbol = ?', [accountId, order.symbol]);
      }

      await this._query(
        `UPDATE paper_accounts SET cash_balance = ?, updated_at = ${nowExpr} WHERE id = ?`,
        [account.cash_balance + (totalValue - commission), accountId]
      );
    }

    const nowExpr = isUsingPostgres() ? 'NOW()' : "datetime('now')";
    await this._query(
      `UPDATE paper_orders SET
        filled_quantity = ?,
        avg_fill_price = ?,
        commission = ?,
        slippage = ?,
        status = ?,
        filled_at = ${nowExpr}
      WHERE order_id = ?`,
      [order.quantity, fillPrice, commission, slippage * basePrice * order.quantity, 'filled', orderId]
    );

    await this._query(
      `INSERT INTO paper_trades (
        account_id, order_id, symbol, side, quantity,
        price, commission, slippage, realized_pnl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        accountId,
        orderId,
        order.symbol,
        order.side,
        order.quantity,
        fillPrice,
        commission,
        slippage * basePrice * order.quantity,
        realizedPnl || null
      ]
    );

    return {
      orderId,
      status: 'filled',
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      fillPrice,
      commission,
      slippage: (slippage * 100).toFixed(3) + '%',
      totalCost: order.side === 'BUY' ? totalCost : null,
      totalProceeds: order.side === 'SELL' ? totalValue - commission : null,
      realizedPnl: realizedPnl !== 0 ? realizedPnl : null
    };
  }

  /**
   * Validate order before submission
   */
  async _validateOrder(account, order) {
    if (!order.symbol) throw new Error('Symbol is required');
    if (!order.side || !['BUY', 'SELL'].includes(order.side)) {
      throw new Error('Side must be BUY or SELL');
    }
    if (!order.quantity || order.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    const orderType = order.orderType || 'MARKET';
    if (!['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(orderType)) {
      throw new Error('Invalid order type');
    }

    if (orderType === 'LIMIT' && !order.limitPrice) {
      throw new Error('Limit price required for LIMIT orders');
    }
    if (['STOP', 'STOP_LIMIT'].includes(orderType) && !order.stopPrice) {
      throw new Error('Stop price required for STOP orders');
    }

    const priceData = await this._queryOne(
      `SELECT p.close as price
       FROM daily_prices p
       JOIN companies c ON c.id = p.company_id
       WHERE c.symbol = ?
       ORDER BY p.date DESC
       LIMIT 1`,
      [order.symbol]
    );
    if (priceData) {
      const orderValue = order.quantity * priceData.price;
      const status = await this.getAccountStatus(account.id);
      const portfolioValue = status.summary.portfolioValue;

      if (orderValue > portfolioValue * this.config.maxPositionSize) {
        throw new Error(`Order exceeds max position size (${this.config.maxPositionSize * 100}% of portfolio)`);
      }
    }
  }

  _calculateSlippage(order, price) {
    if (this.config.slippageModel === 'none') return 0;
    if (this.config.slippageModel === 'fixed') return this.config.fixedSlippageBps / 10000;
    const baseSlippage = 0.0005;
    const orderValue = order.quantity * price;
    const sizeImpact = Math.log10(1 + orderValue / 100000) * 0.001;
    const noise = (Math.random() - 0.5) * 0.001;
    return Math.max(0, baseSlippage + sizeImpact + noise);
  }

  _calculateCommission(quantity, price) {
    const perShareCost = this.config.commissionPerShare * quantity;
    const percentCost = this.config.commissionPercent * quantity * price;
    return Math.max(this.config.minCommission, perShareCost + percentCost);
  }

  // ==========================================
  // QUERY METHODS
  // ==========================================

  async getOrders(accountId, limit = 50) {
    return this._queryAll(
      'SELECT * FROM paper_orders WHERE account_id = ? ORDER BY created_at DESC LIMIT ?',
      [accountId, limit]
    );
  }

  async getTrades(accountId, limit = 50) {
    return this._queryAll(
      'SELECT * FROM paper_trades WHERE account_id = ? ORDER BY executed_at DESC LIMIT ?',
      [accountId, limit]
    );
  }

  async getPendingOrders(accountId) {
    return this._queryAll(
      "SELECT * FROM paper_orders WHERE account_id = ? AND status = 'pending'",
      [accountId]
    );
  }

  async cancelOrder(accountId, orderId) {
    const order = await this._queryOne(
      'SELECT * FROM paper_orders WHERE account_id = ? AND order_id = ?',
      [accountId, orderId]
    );

    if (!order) {
      return { success: false, message: `Order ${orderId} not found` };
    }

    if (order.status !== 'open' && order.status !== 'pending') {
      return {
        success: false,
        message: `Cannot cancel order with status: ${order.status}`,
        currentStatus: order.status
      };
    }

    const nowExpr = isUsingPostgres() ? 'NOW()' : "datetime('now')";
    await this._query(
      `UPDATE paper_orders SET status = 'cancelled', updated_at = ${nowExpr} WHERE order_id = ?`,
      [orderId]
    );

    return {
      success: true,
      orderId,
      message: `Order ${orderId} successfully cancelled`,
      order: {
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        orderType: order.order_type,
        previousStatus: order.status
      }
    };
  }

  async getPositions(accountId) {
    const status = await this.getAccountStatus(accountId);
    return status.positions;
  }

  // ==========================================
  // PERFORMANCE TRACKING
  // ==========================================

  async takeSnapshot(accountId) {
    const status = await this.getAccountStatus(accountId);
    const account = status.account;

    const previousSnapshots = await this._queryAll(
      'SELECT * FROM paper_snapshots WHERE account_id = ? ORDER BY snapshot_date DESC LIMIT ?',
      [accountId, 1]
    );
    const previousValue = previousSnapshots.length > 0
      ? previousSnapshots[0].portfolio_value
      : account.initialCapital;

    const dailyPnl = status.summary.portfolioValue - previousValue;
    const cumulativePnl = status.summary.totalReturn;

    const dateExpr = isUsingPostgres() ? 'CURRENT_DATE' : "date('now')";
    await this._query(
      `INSERT INTO paper_snapshots (
        account_id, snapshot_date, portfolio_value, cash_balance,
        positions_value, daily_pnl, cumulative_pnl
      ) VALUES (?, ${dateExpr}, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, snapshot_date) DO UPDATE SET
        portfolio_value = excluded.portfolio_value,
        cash_balance = excluded.cash_balance,
        positions_value = excluded.positions_value,
        daily_pnl = excluded.daily_pnl,
        cumulative_pnl = excluded.cumulative_pnl`,
      [
        accountId,
        status.summary.portfolioValue,
        status.summary.cashBalance,
        status.summary.positionsValue,
        dailyPnl,
        cumulativePnl
      ]
    );

    return {
      date: new Date().toISOString().split('T')[0],
      portfolioValue: status.summary.portfolioValue,
      dailyPnl,
      cumulativePnl
    };
  }

  async getPerformance(accountId, days = 30) {
    const snapshots = await this._queryAll(
      'SELECT * FROM paper_snapshots WHERE account_id = ? ORDER BY snapshot_date DESC LIMIT ?',
      [accountId, days]
    );
    const account = await this.getAccount(accountId);

    if (snapshots.length === 0) {
      return { message: 'No snapshots available', snapshots: [] };
    }

    const returns = [];
    for (let i = 0; i < snapshots.length - 1; i++) {
      const dailyReturn = (snapshots[i].portfolio_value - snapshots[i + 1].portfolio_value) /
                         snapshots[i + 1].portfolio_value;
      returns.push(dailyReturn);
    }

    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0
      ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;

    let maxValue = account.initial_capital;
    let maxDrawdown = 0;
    for (const snapshot of [...snapshots].reverse()) {
      maxValue = Math.max(maxValue, snapshot.portfolio_value);
      const drawdown = (maxValue - snapshot.portfolio_value) / maxValue;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    const latestSnapshot = snapshots[0];
    const firstSnapshot = snapshots[snapshots.length - 1];

    return {
      periodDays: days,
      periodReturn: ((latestSnapshot.portfolio_value - firstSnapshot.portfolio_value) /
                    firstSnapshot.portfolio_value * 100).toFixed(2) + '%',
      totalReturn: ((latestSnapshot.portfolio_value - account.initial_capital) /
                   account.initial_capital * 100).toFixed(2) + '%',
      annualizedReturn: (avgReturn * 252 * 100).toFixed(2) + '%',
      volatility: (stdDev * Math.sqrt(252) * 100).toFixed(2) + '%',
      sharpeRatio: sharpe.toFixed(2),
      maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
      winRate: await this._calculateWinRate(accountId),
      snapshots: snapshots.slice(0, 10).map(s => ({
        date: s.snapshot_date,
        value: s.portfolio_value,
        dailyPnl: s.daily_pnl
      }))
    };
  }

  async _calculateWinRate(accountId) {
    const trades = await this._queryAll(
      'SELECT * FROM paper_trades WHERE account_id = ? ORDER BY executed_at DESC LIMIT ?',
      [accountId, 1000]
    );
    const sellTrades = trades.filter(t => t.side === 'SELL' && t.realized_pnl !== null);

    if (sellTrades.length === 0) return 'N/A';

    const wins = sellTrades.filter(t => t.realized_pnl > 0).length;
    return (wins / sellTrades.length * 100).toFixed(1) + '%';
  }
}

module.exports = {
  PaperTradingEngine
};
