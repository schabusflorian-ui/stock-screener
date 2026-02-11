// src/services/trading/paperTrading.js
// Paper Trading Engine - Simulated order execution and portfolio tracking
// Works with both SQLite and PostgreSQL via the app's db wrapper (query / oneOrNone / manyOrNone).

class PaperTradingEngine {
  /**
   * @param {Object} db App database wrapper (getDatabaseAsync result): must have query, oneOrNone, manyOrNone; optional exec for SQLite init
   * @param {Object} config Configuration options
   */
  constructor(db, config = {}) {
    if (!db || (typeof db.query !== 'function' && typeof db.oneOrNone !== 'function')) {
      throw new Error('PaperTradingEngine requires a database instance (query/oneOrNone/manyOrNone)');
    }
    this.db = db;
    this.config = {
      initialCapital: config.initialCapital || 100000,
      slippageModel: config.slippageModel || 'realistic',
      fixedSlippageBps: config.fixedSlippageBps || 10,
      commissionPerShare: config.commissionPerShare || 0,
      minCommission: config.minCommission || 0,
      commissionPercent: config.commissionPercent || 0,
      partialFillProbability: config.partialFillProbability || 0.1,
      fillDelayMs: config.fillDelayMs || 100,
      maxPositionSize: config.maxPositionSize || 0.2,
      maxTotalExposure: config.maxTotalExposure || 0.95,
      ...config
    };
    this.orderIdCounter = 1;
    this._isAsync = typeof this.db.oneOrNone === 'function';

    if (this.db.type === 'sqlite' && typeof this.db.exec === 'function') {
      this._initTablesSync();
    }
    console.log('📄 Paper Trading Engine initialized');
  }

  _initTablesSync() {
    const exec = (sql) => this.db.exec(sql);
    exec(`
      CREATE TABLE IF NOT EXISTS paper_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        initial_capital REAL NOT NULL,
        cash_balance REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    exec(`
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
    exec(`
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
    exec(`
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
    exec(`
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

  async _one(sql, params = []) {
    const row = this.db.oneOrNone ? await this.db.oneOrNone(sql, params) : null;
    return row ?? null;
  }

  async _many(sql, params = []) {
    if (this.db.manyOrNone) return await this.db.manyOrNone(sql, params);
    const res = await this.db.query(sql, params);
    return (res && res.rows) ? res.rows : [];
  }

  async _query(sql, params = []) {
    return await this.db.query(sql, params);
  }

  async createAccount(name, initialCapital = null) {
    const capital = initialCapital ?? this.config.initialCapital;
    try {
      await this._query(
        `INSERT INTO paper_accounts (name, initial_capital, cash_balance) VALUES ($1, $2, $3)`,
        [name, capital, capital]
      );
      const row = await this._one(`SELECT * FROM paper_accounts WHERE name = $1`, [name]);
      if (!row) throw new Error('Account not created');
      return {
        id: row.id,
        name: row.name,
        initialCapital: Number(row.initial_capital),
        cashBalance: Number(row.cash_balance),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
      };
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE') || err.code === '23505')) {
        throw new Error(`Account '${name}' already exists`);
      }
      throw err;
    }
  }

  async getAccount(idOrName) {
    const account = typeof idOrName === 'number'
      ? await this._one(`SELECT * FROM paper_accounts WHERE id = $1`, [idOrName])
      : await this._one(`SELECT * FROM paper_accounts WHERE name = $1`, [idOrName]);
    if (!account) throw new Error(`Account not found: ${idOrName}`);
    return account;
  }

  async getAccountStatus(accountId) {
    const account = await this.getAccount(accountId);
    const positions = await this._many(`SELECT * FROM paper_positions WHERE account_id = $1`, [accountId]);
    let positionsValue = 0;
    let unrealizedPnl = 0;
    const updatedPositions = [];
    for (const pos of positions) {
      const priceRow = await this._one(
        `SELECT p.close as price FROM daily_prices p JOIN companies c ON c.id = p.company_id WHERE c.symbol = $1 ORDER BY p.date DESC LIMIT 1`,
        [pos.symbol]
      );
      const currentPrice = priceRow?.price != null ? Number(priceRow.price) : (pos.current_price ?? pos.avg_cost);
      const marketValue = pos.quantity * (currentPrice || pos.avg_cost);
      const costBasis = pos.quantity * pos.avg_cost;
      const posUnrealizedPnl = marketValue - costBasis;
      positionsValue += marketValue;
      unrealizedPnl += posUnrealizedPnl;
      updatedPositions.push({
        ...pos,
        currentPrice: currentPrice || pos.avg_cost,
        marketValue,
        costBasis,
        unrealizedPnl: posUnrealizedPnl,
        unrealizedPnlPercent: costBasis > 0 ? (posUnrealizedPnl / costBasis * 100) : 0
      });
    }
    const portfolioValue = Number(account.cash_balance) + positionsValue;
    const totalReturn = portfolioValue - Number(account.initial_capital);
    const totalReturnPercent = (totalReturn / Number(account.initial_capital) * 100);
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

  async submitOrder(accountId, order) {
    const account = await this.getAccount(accountId);
    await this._validateOrder(account, order);
    const orderId = `PAPER-${Date.now()}-${this.orderIdCounter++}`;
    const priceRow = await this._one(
      `SELECT p.close as price FROM daily_prices p JOIN companies c ON c.id = p.company_id WHERE c.symbol = $1 ORDER BY p.date DESC LIMIT 1`,
      [order.symbol]
    );
    if (!priceRow || priceRow.price == null) {
      throw new Error(`No price data available for ${order.symbol}`);
    }
    const marketPrice = Number(priceRow.price);
    let fillPrice = marketPrice;
    let canFill = true;
    if (order.orderType === 'LIMIT') {
      if (order.side === 'BUY' && marketPrice > order.limitPrice) canFill = false;
      else if (order.side === 'SELL' && marketPrice < order.limitPrice) canFill = false;
      else fillPrice = order.limitPrice;
    } else if (order.orderType === 'STOP') {
      if (order.side === 'BUY' && marketPrice < order.stopPrice) canFill = false;
      else if (order.side === 'SELL' && marketPrice > order.stopPrice) canFill = false;
    }
    await this._query(
      `INSERT INTO paper_orders (account_id, order_id, symbol, side, order_type, quantity, limit_price, stop_price, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [accountId, orderId, order.symbol, order.side, order.orderType || 'MARKET', order.quantity, order.limitPrice ?? null, order.stopPrice ?? null, canFill ? 'pending' : 'open', order.notes ?? null]
    );
    if (canFill) return await this._executeOrder(accountId, orderId, order, fillPrice);
    return { orderId, status: 'open', symbol: order.symbol, side: order.side, quantity: order.quantity, orderType: order.orderType, limitPrice: order.limitPrice, stopPrice: order.stopPrice, message: 'Order submitted, waiting for fill conditions' };
  }

  async _executeOrder(accountId, orderId, order, basePrice) {
    const account = await this.getAccount(accountId);
    const slippage = this._calculateSlippage(order, basePrice);
    const fillPrice = order.side === 'BUY' ? basePrice * (1 + slippage) : basePrice * (1 - slippage);
    const commission = this._calculateCommission(order.quantity, fillPrice);
    const totalValue = order.quantity * fillPrice;
    const totalCost = order.side === 'BUY' ? totalValue + commission : totalValue - commission;
    if (order.side === 'BUY' && totalCost > Number(account.cash_balance)) {
      throw new Error(`Insufficient funds. Need $${totalCost.toFixed(2)}, have $${Number(account.cash_balance).toFixed(2)}`);
    }
    const existingPosition = await this._one(`SELECT * FROM paper_positions WHERE account_id = $1 AND symbol = $2`, [accountId, order.symbol]);
    let realizedPnl = 0;
    if (order.side === 'BUY') {
      if (existingPosition) {
        const newQuantity = existingPosition.quantity + order.quantity;
        const newCost = (existingPosition.quantity * existingPosition.avg_cost + order.quantity * fillPrice) / newQuantity;
        await this._query(
          `INSERT INTO paper_positions (account_id, symbol, quantity, avg_cost, current_price) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT(account_id, symbol) DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, current_price = EXCLUDED.current_price, updated_at = datetime('now')`,
          [accountId, order.symbol, newQuantity, newCost, fillPrice]
        );
      } else {
        await this._query(
          `INSERT INTO paper_positions (account_id, symbol, quantity, avg_cost, current_price) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT(account_id, symbol) DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, current_price = EXCLUDED.current_price, updated_at = datetime('now')`,
          [accountId, order.symbol, order.quantity, fillPrice, fillPrice]
        );
      }
      await this._query(`UPDATE paper_accounts SET cash_balance = $1, updated_at = datetime('now') WHERE id = $2`, [Number(account.cash_balance) - totalCost, accountId]);
    } else {
      if (!existingPosition || existingPosition.quantity < order.quantity) {
        throw new Error(`Cannot sell ${order.quantity} shares of ${order.symbol}. Current position: ${existingPosition?.quantity ?? 0}`);
      }
      realizedPnl = (fillPrice - existingPosition.avg_cost) * order.quantity - commission;
      const newQuantity = existingPosition.quantity - order.quantity;
      if (newQuantity > 0) {
        await this._query(
          `INSERT INTO paper_positions (account_id, symbol, quantity, avg_cost, current_price) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT(account_id, symbol) DO UPDATE SET quantity = EXCLUDED.quantity, avg_cost = EXCLUDED.avg_cost, current_price = EXCLUDED.current_price, updated_at = datetime('now')`,
          [accountId, order.symbol, newQuantity, existingPosition.avg_cost, fillPrice]
        );
      } else {
        await this._query(`DELETE FROM paper_positions WHERE account_id = $1 AND symbol = $2`, [accountId, order.symbol]);
      }
      await this._query(`UPDATE paper_accounts SET cash_balance = $1, updated_at = datetime('now') WHERE id = $2`, [Number(account.cash_balance) + (totalValue - commission), accountId]);
    }
    const slippageAmount = slippage * basePrice * order.quantity;
    await this._query(
      `UPDATE paper_orders SET filled_quantity = $1, avg_fill_price = $2, commission = $3, slippage = $4, status = $5, filled_at = datetime('now') WHERE order_id = $6`,
      [order.quantity, fillPrice, commission, slippageAmount, 'filled', orderId]
    );
    await this._query(
      `INSERT INTO paper_trades (account_id, order_id, symbol, side, quantity, price, commission, slippage, realized_pnl) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [accountId, orderId, order.symbol, order.side, order.quantity, fillPrice, commission, slippageAmount, realizedPnl || null]
    );
    return {
      orderId,
      status: 'filled',
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      fillPrice,
      avgFillPrice: fillPrice,
      filledQuantity: order.quantity,
      commission,
      slippage: (slippage * 100).toFixed(3) + '%',
      totalCost: order.side === 'BUY' ? totalCost : null,
      totalProceeds: order.side === 'SELL' ? totalValue - commission : null,
      realizedPnl: realizedPnl !== 0 ? realizedPnl : null
    };
  }

  async _validateOrder(account, order) {
    if (!order.symbol) throw new Error('Symbol is required');
    if (!order.side || !['BUY', 'SELL'].includes(order.side)) throw new Error('Side must be BUY or SELL');
    if (!order.quantity || order.quantity <= 0) throw new Error('Quantity must be positive');
    const orderType = order.orderType || 'MARKET';
    if (!['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(orderType)) throw new Error('Invalid order type');
    if (orderType === 'LIMIT' && !order.limitPrice) throw new Error('Limit price required for LIMIT orders');
    if (['STOP', 'STOP_LIMIT'].includes(orderType) && !order.stopPrice) throw new Error('Stop price required for STOP orders');
    const priceRow = await this._one(
      `SELECT p.close as price FROM daily_prices p JOIN companies c ON c.id = p.company_id WHERE c.symbol = $1 ORDER BY p.date DESC LIMIT 1`,
      [order.symbol]
    );
    if (priceRow && priceRow.price != null) {
      const orderValue = order.quantity * Number(priceRow.price);
      const status = await this.getAccountStatus(account.id);
      if (orderValue > status.summary.portfolioValue * this.config.maxPositionSize) {
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

  async getOrders(accountId, limit = 50) {
    return await this._many(`SELECT * FROM paper_orders WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2`, [accountId, limit]);
  }

  async getTrades(accountId, limit = 50) {
    return await this._many(`SELECT * FROM paper_trades WHERE account_id = $1 ORDER BY executed_at DESC LIMIT $2`, [accountId, limit]);
  }

  async getPendingOrders(accountId) {
    return await this._many(`SELECT * FROM paper_orders WHERE account_id = $1 AND status = 'pending'`, [accountId]);
  }

  async cancelOrder(accountId, orderId) {
    const order = await this._one(`SELECT * FROM paper_orders WHERE account_id = $1 AND order_id = $2`, [accountId, orderId]);
    if (!order) return { success: false, message: `Order ${orderId} not found` };
    if (order.status !== 'open' && order.status !== 'pending') {
      return { success: false, message: `Cannot cancel order with status: ${order.status}`, currentStatus: order.status };
    }
    await this._query(`UPDATE paper_orders SET status = 'cancelled', canceled_at = datetime('now') WHERE order_id = $1`, [orderId]);
    return { success: true, orderId, message: `Order ${orderId} successfully cancelled`, order: { symbol: order.symbol, side: order.side, quantity: order.quantity, orderType: order.order_type, previousStatus: order.status } };
  }

  async getPositions(accountId) {
    const status = await this.getAccountStatus(accountId);
    return status.positions;
  }

  async takeSnapshot(accountId) {
    const status = await this.getAccountStatus(accountId);
    const account = status.account;
    const previousSnapshots = await this._many(`SELECT * FROM paper_snapshots WHERE account_id = $1 ORDER BY snapshot_date DESC LIMIT 1`, [accountId]);
    const previousValue = previousSnapshots.length > 0 ? Number(previousSnapshots[0].portfolio_value) : Number(account.initialCapital);
    const dailyPnl = status.summary.portfolioValue - previousValue;
    const cumulativePnl = status.summary.totalReturn;
    const today = new Date().toISOString().split('T')[0];
    await this._query(
      `INSERT INTO paper_snapshots (account_id, snapshot_date, portfolio_value, cash_balance, positions_value, daily_pnl, cumulative_pnl)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (account_id, snapshot_date) DO UPDATE SET portfolio_value = EXCLUDED.portfolio_value, cash_balance = EXCLUDED.cash_balance, positions_value = EXCLUDED.positions_value, daily_pnl = EXCLUDED.daily_pnl, cumulative_pnl = EXCLUDED.cumulative_pnl`,
      [accountId, today, status.summary.portfolioValue, status.summary.cashBalance, status.summary.positionsValue, dailyPnl, cumulativePnl]
    );
    return { date: today, portfolioValue: status.summary.portfolioValue, dailyPnl, cumulativePnl };
  }

  async getPerformance(accountId, days = 30) {
    const snapshots = await this._many(`SELECT * FROM paper_snapshots WHERE account_id = $1 ORDER BY snapshot_date DESC LIMIT $2`, [accountId, days]);
    const account = await this.getAccount(accountId);
    if (snapshots.length === 0) return { message: 'No snapshots available', snapshots: [] };
    const returns = [];
    for (let i = 0; i < snapshots.length - 1; i++) {
      const dailyReturn = (snapshots[i].portfolio_value - snapshots[i + 1].portfolio_value) / snapshots[i + 1].portfolio_value;
      returns.push(dailyReturn);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 0 ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length : 0;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;
    let maxValue = Number(account.initial_capital);
    let maxDrawdown = 0;
    for (const snapshot of [...snapshots].reverse()) {
      maxValue = Math.max(maxValue, snapshot.portfolio_value);
      const drawdown = (maxValue - snapshot.portfolio_value) / maxValue;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    const latestSnapshot = snapshots[0];
    const firstSnapshot = snapshots[snapshots.length - 1];
    const winRate = await this._calculateWinRate(accountId);
    return {
      periodDays: days,
      periodReturn: ((latestSnapshot.portfolio_value - firstSnapshot.portfolio_value) / firstSnapshot.portfolio_value * 100).toFixed(2) + '%',
      totalReturn: ((latestSnapshot.portfolio_value - account.initial_capital) / account.initial_capital * 100).toFixed(2) + '%',
      annualizedReturn: (avgReturn * 252 * 100).toFixed(2) + '%',
      volatility: (stdDev * Math.sqrt(252) * 100).toFixed(2) + '%',
      sharpeRatio: sharpe.toFixed(2),
      maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
      winRate,
      snapshots: snapshots.slice(0, 10).map(s => ({ date: s.snapshot_date, value: s.portfolio_value, dailyPnl: s.daily_pnl }))
    };
  }

  async _calculateWinRate(accountId) {
    const trades = await this._many(`SELECT * FROM paper_trades WHERE account_id = $1 ORDER BY executed_at DESC LIMIT 1000`, [accountId]);
    const sellTrades = trades.filter(t => t.side === 'SELL' && t.realized_pnl != null);
    if (sellTrades.length === 0) return 'N/A';
    const wins = sellTrades.filter(t => t.realized_pnl > 0).length;
    return (wins / sellTrades.length * 100).toFixed(1) + '%';
  }
}

module.exports = { PaperTradingEngine };
