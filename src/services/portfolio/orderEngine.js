// src/services/portfolio/orderEngine.js
// Order engine for managing standing orders (stop loss, limit, trailing stop)

const { getDatabaseAsync } = require('../../database');
const { ORDER_TYPES, ORDER_STATUS } = require('../../constants/portfolio');

class OrderEngine {
  constructor(holdingsEngine) {
    this.holdingsEngine = holdingsEngine;
  }

  // ============================================
  // Order Creation
  // ============================================

  async createOrder(portfolioId, {
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
    const database = await getDatabaseAsync();

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
      const positionResult = await database.query(`
        SELECT * FROM portfolio_positions
        WHERE portfolio_id = $1 AND company_id = $2
      `, [portfolioId, companyId]);
      position = positionResult.rows[0];

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
      const latestPriceResult = await database.query(`
        SELECT close as price, date
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [companyId]);
      const latestPrice = latestPriceResult.rows[0];

      if (!latestPrice) {
        throw new Error(`No price data available for company ${companyId}`);
      }
      trailingHighPrice = latestPrice.price;
      trailingTriggerPrice = trailingHighPrice * (1 - trailingPct / 100);
      // Override triggerPrice with calculated trailing trigger
      triggerPrice = trailingTriggerPrice;
    }

    const result = await database.query(`
      INSERT INTO portfolio_orders
      (portfolio_id, company_id, position_id, order_type, order_side,
       trigger_price, trigger_comparison, limit_price, trailing_pct,
       trailing_high_price, trailing_trigger_price, shares, shares_pct,
       valid_until, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `, [
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
    ]);

    return {
      success: true,
      orderId: result.rows[0].id,
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

  async getOrder(orderId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT po.*, c.symbol, c.name as company_name
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      WHERE po.id = $1
    `, [orderId]);
    return result.rows[0];
  }

  async getActiveOrders(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT po.*, c.symbol, c.name as company_name
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      WHERE po.portfolio_id = $1 AND po.status = 'active'
      ORDER BY po.created_at DESC
    `, [portfolioId]);
    return result.rows;
  }

  async getAllActiveOrders() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT po.*, c.symbol, c.name as company_name, p.name as portfolio_name
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      JOIN portfolios p ON po.portfolio_id = p.id
      WHERE po.status = 'active'
      ORDER BY po.company_id, po.created_at DESC
    `);
    return result.rows;
  }

  async getOrderHistory(portfolioId, { limit = 50, offset = 0 } = {}) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT po.*, c.symbol, c.name as company_name
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      WHERE po.portfolio_id = $1
      ORDER BY po.created_at DESC
      LIMIT $2 OFFSET $3
    `, [portfolioId, limit, offset]);
    return result.rows;
  }

  // ============================================
  // Order Management
  // ============================================

  async cancelOrder(orderId) {
    const database = await getDatabaseAsync();
    const order = await this.getOrder(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (order.status !== ORDER_STATUS.ACTIVE) {
      throw new Error(`Order ${orderId} is not active (status: ${order.status})`);
    }

    await database.query(`
      UPDATE portfolio_orders
      SET status = 'cancelled',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [orderId]);

    return { success: true, orderId };
  }

  async expireOrders() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      UPDATE portfolio_orders
      SET status = 'expired',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'active' AND valid_until < CURRENT_DATE
    `);
    return { expiredCount: result.rowCount };
  }

  // ============================================
  // Order Execution
  // ============================================

  async checkAndExecuteOrders() {
    const database = await getDatabaseAsync();

    // First expire any orders past their valid_until date
    await this.expireOrders();

    // Get all active orders grouped by company
    const activeOrders = await this.getAllActiveOrders();
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
      const latestPriceResult = await database.query(`
        SELECT close as price, date
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [Number(companyId)]);
      const latestPrice = latestPriceResult.rows[0];

      if (!latestPrice) continue;

      const currentPrice = latestPrice.price;

      for (const order of orders) {
        try {
          const triggered = await this._checkOrder(order, currentPrice);
          if (triggered) {
            const result = await this._executeOrder(order, currentPrice);
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

  async _checkOrder(order, currentPrice) {
    // Handle trailing stop specially
    if (order.order_type === ORDER_TYPES.TRAILING_STOP) {
      return await this._checkTrailingStop(order, currentPrice);
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

  async _checkTrailingStop(order, currentPrice) {
    // If price is higher than trailing_high_price, update the trailing stop
    if (currentPrice > order.trailing_high_price) {
      const database = await getDatabaseAsync();
      const newHighPrice = currentPrice;
      const newTriggerPrice = newHighPrice * (1 - order.trailing_pct / 100);

      await database.query(`
        UPDATE portfolio_orders
        SET trigger_price = $1,
            trailing_high_price = $2,
            trailing_trigger_price = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [newTriggerPrice, newHighPrice, newTriggerPrice, order.id]);

      // Not triggered yet, just updated
      return false;
    }

    // Check if price has fallen to or below the trailing trigger
    return currentPrice <= order.trailing_trigger_price;
  }

  async _executeOrder(order, currentPrice) {
    const database = await getDatabaseAsync();
    const executedAt = new Date().toISOString();

    // Determine shares to trade
    let sharesToTrade = order.shares;
    if (!sharesToTrade && order.shares_pct) {
      const positionResult = await database.query(`
        SELECT * FROM portfolio_positions
        WHERE portfolio_id = $1 AND company_id = $2
      `, [order.portfolio_id, order.company_id]);
      const position = positionResult.rows[0];

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
      result = await this.holdingsEngine.executeSell(order.portfolio_id, {
        companyId: order.company_id,
        shares: sharesToTrade,
        pricePerShare: executionPrice,
        fees: 0,
        notes: `Triggered by ${order.order_type} order at ${currentPrice}`,
        executedAt,
        orderId: order.id
      });
    } else {
      result = await this.holdingsEngine.executeBuy(order.portfolio_id, {
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
    await database.query(`
      UPDATE portfolio_orders
      SET status = 'triggered',
          triggered_at = $1,
          triggered_price = $2,
          execution_transaction_id = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [executedAt, currentPrice, null, order.id]);

    return result;
  }

  // ============================================
  // Helper Methods
  // ============================================

  async updateTrailingStops() {
    const database = await getDatabaseAsync();

    // Update all trailing stops based on current prices
    const trailingOrdersResult = await database.query(`
      SELECT po.*, c.symbol
      FROM portfolio_orders po
      JOIN companies c ON po.company_id = c.id
      WHERE po.status = 'active' AND po.order_type = 'trailing_stop'
    `);
    const trailingOrders = trailingOrdersResult.rows;

    let updated = 0;
    for (const order of trailingOrders) {
      const latestPriceResult = await database.query(`
        SELECT close as price, date
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [order.company_id]);
      const latestPrice = latestPriceResult.rows[0];

      if (!latestPrice) continue;

      if (latestPrice.price > order.trailing_high_price) {
        const newHighPrice = latestPrice.price;
        const newTriggerPrice = newHighPrice * (1 - order.trailing_pct / 100);

        await database.query(`
          UPDATE portfolio_orders
          SET trigger_price = $1,
              trailing_high_price = $2,
              trailing_trigger_price = $3,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `, [newTriggerPrice, newHighPrice, newTriggerPrice, order.id]);

        updated++;
      }
    }

    return { trailingOrdersChecked: trailingOrders.length, updated };
  }

  async getOrderSummary(portfolioId) {
    const activeOrders = await this.getActiveOrders(portfolioId);

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
