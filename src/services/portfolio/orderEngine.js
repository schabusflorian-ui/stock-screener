// src/services/portfolio/orderEngine.js
// Order engine for managing standing orders (stop loss, limit, trailing stop)

const { ORDER_TYPES, ORDER_STATUS } = require('../../constants/portfolio');

class OrderEngine {
  constructor(db, holdingsEngine) {
    this.db = db;
    this.holdingsEngine = holdingsEngine;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Order queries
      getOrder: this.db.prepare(`
        SELECT po.*, c.symbol, c.name as company_name
        FROM portfolio_orders po
        JOIN companies c ON po.company_id = c.id
        WHERE po.id = ?
      `),

      getActiveOrders: this.db.prepare(`
        SELECT po.*, c.symbol, c.name as company_name
        FROM portfolio_orders po
        JOIN companies c ON po.company_id = c.id
        WHERE po.portfolio_id = ? AND po.status = 'active'
        ORDER BY po.created_at DESC
      `),

      getAllActiveOrders: this.db.prepare(`
        SELECT po.*, c.symbol, c.name as company_name, p.name as portfolio_name
        FROM portfolio_orders po
        JOIN companies c ON po.company_id = c.id
        JOIN portfolios p ON po.portfolio_id = p.id
        WHERE po.status = 'active'
        ORDER BY po.company_id, po.created_at DESC
      `),

      getActiveOrdersByCompany: this.db.prepare(`
        SELECT po.*, c.symbol, c.name as company_name, p.name as portfolio_name
        FROM portfolio_orders po
        JOIN companies c ON po.company_id = c.id
        JOIN portfolios p ON po.portfolio_id = p.id
        WHERE po.status = 'active' AND po.company_id = ?
        ORDER BY po.created_at DESC
      `),

      getOrderHistory: this.db.prepare(`
        SELECT po.*, c.symbol, c.name as company_name
        FROM portfolio_orders po
        JOIN companies c ON po.company_id = c.id
        WHERE po.portfolio_id = ?
        ORDER BY po.created_at DESC
        LIMIT ? OFFSET ?
      `),

      createOrder: this.db.prepare(`
        INSERT INTO portfolio_orders
        (portfolio_id, company_id, position_id, order_type, order_side,
         trigger_price, trigger_comparison, limit_price, trailing_pct,
         trailing_high_price, trailing_trigger_price, shares, shares_pct,
         valid_until, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateOrder: this.db.prepare(`
        UPDATE portfolio_orders
        SET trigger_price = ?,
            trailing_high_price = ?,
            trailing_trigger_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      cancelOrder: this.db.prepare(`
        UPDATE portfolio_orders
        SET status = 'cancelled',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      triggerOrder: this.db.prepare(`
        UPDATE portfolio_orders
        SET status = 'triggered',
            triggered_at = ?,
            triggered_price = ?,
            execution_transaction_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      expireOrders: this.db.prepare(`
        UPDATE portfolio_orders
        SET status = 'expired',
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' AND valid_until < date('now')
      `),

      // Price queries
      getLatestPrice: this.db.prepare(`
        SELECT close as price, date
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `),

      // Position queries
      getPosition: this.db.prepare(`
        SELECT * FROM portfolio_positions
        WHERE portfolio_id = ? AND company_id = ?
      `)
    };
  }

  // ============================================
  // Order Creation
  // ============================================

  createOrder(portfolioId, {
    companyId,
    orderType,
    triggerPrice,
    shares = null,
    sharesPct = null,
    limitPrice = null,
    trailingPct = null,
    validUntil = null,
    notes = null
  }) {
    // Validate order type
    const validOrderTypes = Object.values(ORDER_TYPES);
    if (!validOrderTypes.includes(orderType)) {
      throw new Error(`Invalid order type: ${orderType}. Must be one of: ${validOrderTypes.join(', ')}`);
    }

    // Determine order side based on type
    let orderSide;
    let triggerComparison;

    switch (orderType) {
      case ORDER_TYPES.STOP_LOSS:
        orderSide = 'sell';
        triggerComparison = 'lte'; // Trigger when price <= trigger
        break;
      case ORDER_TYPES.TAKE_PROFIT:
        orderSide = 'sell';
        triggerComparison = 'gte'; // Trigger when price >= trigger
        break;
      case ORDER_TYPES.LIMIT_BUY:
        orderSide = 'buy';
        triggerComparison = 'lte'; // Buy when price <= limit
        break;
      case ORDER_TYPES.LIMIT_SELL:
        orderSide = 'sell';
        triggerComparison = 'gte'; // Sell when price >= limit
        break;
      case ORDER_TYPES.TRAILING_STOP:
        orderSide = 'sell';
        triggerComparison = 'lte';
        if (!trailingPct || trailingPct <= 0 || trailingPct > 100) {
          throw new Error('Trailing stop requires trailingPct between 0 and 100');
        }
        break;
      default:
        throw new Error(`Unhandled order type: ${orderType}`);
    }

    // Validate shares specification
    if (!shares && !sharesPct) {
      throw new Error('Must specify either shares or sharesPct');
    }

    // For sell orders, verify position exists
    let position = null;
    if (orderSide === 'sell') {
      position = this.stmts.getPosition.get(portfolioId, companyId);
      if (!position) {
        throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
      }
      if (position.shares <= 0) {
        throw new Error('Position has no shares to sell');
      }
    }

    // Calculate trailing stop values
    let trailingHighPrice = null;
    let trailingTriggerPrice = null;

    if (orderType === ORDER_TYPES.TRAILING_STOP) {
      const latestPrice = this.stmts.getLatestPrice.get(companyId);
      if (!latestPrice) {
        throw new Error(`No price data available for company ${companyId}`);
      }
      trailingHighPrice = latestPrice.price;
      trailingTriggerPrice = trailingHighPrice * (1 - trailingPct / 100);
      // Override triggerPrice with calculated trailing trigger
      triggerPrice = trailingTriggerPrice;
    }

    const result = this.stmts.createOrder.run(
      portfolioId,
      companyId,
      position ? position.id : null,
      orderType,
      orderSide,
      triggerPrice,
      triggerComparison,
      limitPrice,
      trailingPct,
      trailingHighPrice,
      trailingTriggerPrice,
      shares,
      sharesPct,
      validUntil,
      ORDER_STATUS.ACTIVE,
      notes
    );

    return {
      success: true,
      orderId: result.lastInsertRowid,
      orderType,
      orderSide,
      triggerPrice,
      trailingPct,
      trailingHighPrice,
      trailingTriggerPrice
    };
  }

  // ============================================
  // Order Retrieval
  // ============================================

  getOrder(orderId) {
    return this.stmts.getOrder.get(orderId);
  }

  getActiveOrders(portfolioId) {
    return this.stmts.getActiveOrders.all(portfolioId);
  }

  getAllActiveOrders() {
    return this.stmts.getAllActiveOrders.all();
  }

  getOrderHistory(portfolioId, { limit = 50, offset = 0 } = {}) {
    return this.stmts.getOrderHistory.all(portfolioId, limit, offset);
  }

  // ============================================
  // Order Management
  // ============================================

  cancelOrder(orderId) {
    const order = this.getOrder(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status !== ORDER_STATUS.ACTIVE) {
      throw new Error(`Order ${orderId} is not active (status: ${order.status})`);
    }

    this.stmts.cancelOrder.run(orderId);
    return { success: true, orderId };
  }

  expireOrders() {
    const result = this.stmts.expireOrders.run();
    return { expiredCount: result.changes };
  }

  // ============================================
  // Order Execution
  // ============================================

  checkAndExecuteOrders() {
    // First expire any orders past their valid_until date
    this.expireOrders();

    // Get all active orders grouped by company
    const activeOrders = this.getAllActiveOrders();
    const triggeredOrders = [];
    const errors = [];

    // Group orders by company for efficient price lookup
    const ordersByCompany = {};
    for (const order of activeOrders) {
      if (!ordersByCompany[order.company_id]) {
        ordersByCompany[order.company_id] = [];
      }
      ordersByCompany[order.company_id].push(order);
    }

    // Check each company's orders
    for (const [companyId, orders] of Object.entries(ordersByCompany)) {
      const latestPrice = this.stmts.getLatestPrice.get(Number(companyId));
      if (!latestPrice) continue;

      const currentPrice = latestPrice.price;

      for (const order of orders) {
        try {
          const triggered = this._checkOrder(order, currentPrice);
          if (triggered) {
            const result = this._executeOrder(order, currentPrice);
            triggeredOrders.push({
              orderId: order.id,
              orderType: order.order_type,
              symbol: order.symbol,
              triggeredPrice: currentPrice,
              result
            });
          }
        } catch (error) {
          errors.push({
            orderId: order.id,
            symbol: order.symbol,
            error: error.message
          });
        }
      }
    }

    return {
      checked: activeOrders.length,
      triggered: triggeredOrders.length,
      triggeredOrders,
      errors
    };
  }

  _checkOrder(order, currentPrice) {
    // Handle trailing stop specially
    if (order.order_type === ORDER_TYPES.TRAILING_STOP) {
      return this._checkTrailingStop(order, currentPrice);
    }

    // Check trigger condition
    switch (order.trigger_comparison) {
      case 'lte':
        return currentPrice <= order.trigger_price;
      case 'gte':
        return currentPrice >= order.trigger_price;
      case 'lt':
        return currentPrice < order.trigger_price;
      case 'gt':
        return currentPrice > order.trigger_price;
      default:
        return false;
    }
  }

  _checkTrailingStop(order, currentPrice) {
    // If price is higher than trailing_high_price, update the trailing stop
    if (currentPrice > order.trailing_high_price) {
      const newHighPrice = currentPrice;
      const newTriggerPrice = newHighPrice * (1 - order.trailing_pct / 100);

      this.stmts.updateOrder.run(
        newTriggerPrice,
        newHighPrice,
        newTriggerPrice,
        order.id
      );

      // Not triggered yet, just updated
      return false;
    }

    // Check if price has fallen to or below the trailing trigger
    return currentPrice <= order.trailing_trigger_price;
  }

  _executeOrder(order, currentPrice) {
    const executedAt = new Date().toISOString();

    // Determine shares to trade
    let sharesToTrade = order.shares;
    if (!sharesToTrade && order.shares_pct) {
      const position = this.stmts.getPosition.get(order.portfolio_id, order.company_id);
      if (!position) {
        throw new Error('Position no longer exists');
      }
      sharesToTrade = Math.floor(position.shares * order.shares_pct);
    }

    if (sharesToTrade <= 0) {
      throw new Error('No shares to trade');
    }

    // Use limit price if specified, otherwise use current price
    const executionPrice = order.limit_price || currentPrice;

    let result;
    if (order.order_side === 'sell') {
      result = this.holdingsEngine.executeSell(order.portfolio_id, {
        companyId: order.company_id,
        shares: sharesToTrade,
        pricePerShare: executionPrice,
        fees: 0,
        notes: `Triggered by ${order.order_type} order at ${currentPrice}`,
        executedAt,
        orderId: order.id
      });
    } else {
      result = this.holdingsEngine.executeBuy(order.portfolio_id, {
        companyId: order.company_id,
        shares: sharesToTrade,
        pricePerShare: executionPrice,
        fees: 0,
        notes: `Triggered by ${order.order_type} order at ${currentPrice}`,
        executedAt,
        orderId: order.id
      });
    }

    // Mark order as triggered
    this.stmts.triggerOrder.run(
      executedAt,
      currentPrice,
      null, // transaction_id - could link if needed
      order.id
    );

    return result;
  }

  // ============================================
  // Helper Methods
  // ============================================

  updateTrailingStops() {
    // Update all trailing stops based on current prices
    const trailingOrders = this.db.prepare(`
      SELECT po.*, c.symbol
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      WHERE po.status = 'active' AND po.order_type = 'trailing_stop'
    `).all();

    let updated = 0;
    for (const order of trailingOrders) {
      const latestPrice = this.stmts.getLatestPrice.get(order.company_id);
      if (!latestPrice) continue;

      if (latestPrice.price > order.trailing_high_price) {
        const newHighPrice = latestPrice.price;
        const newTriggerPrice = newHighPrice * (1 - order.trailing_pct / 100);

        this.stmts.updateOrder.run(
          newTriggerPrice,
          newHighPrice,
          newTriggerPrice,
          order.id
        );
        updated++;
      }
    }

    return { trailingOrdersChecked: trailingOrders.length, updated };
  }

  getOrderSummary(portfolioId) {
    const activeOrders = this.getActiveOrders(portfolioId);

    const summary = {
      total: activeOrders.length,
      byType: {},
      bySide: { buy: 0, sell: 0 }
    };

    for (const order of activeOrders) {
      // By type
      if (!summary.byType[order.order_type]) {
        summary.byType[order.order_type] = 0;
      }
      summary.byType[order.order_type]++;

      // By side
      summary.bySide[order.order_side]++;
    }

    return summary;
  }
}

module.exports = OrderEngine;
