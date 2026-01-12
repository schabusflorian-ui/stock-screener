// src/services/trading/orderAbstraction.js
// Order Abstraction Layer - Unified interface for broker integration

/**
 * OrderAbstractionLayer - Unified interface for order execution
 *
 * Provides a consistent API for:
 * - Paper trading (simulation)
 * - Interactive Brokers API
 * - Alpaca API
 * - Future broker additions
 *
 * Methods:
 * - submitOrder(symbol, side, qty, orderType, params)
 * - cancelOrder(orderId)
 * - getOrderStatus(orderId)
 * - getPositions()
 * - getAccountBalance()
 */

/**
 * Order types supported across all brokers
 */
const OrderType = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
  STOP_LIMIT: 'STOP_LIMIT',
  TRAILING_STOP: 'TRAILING_STOP'
};

/**
 * Order sides
 */
const OrderSide = {
  BUY: 'BUY',
  SELL: 'SELL'
};

/**
 * Order status
 */
const OrderStatus = {
  PENDING: 'pending',
  OPEN: 'open',
  PARTIALLY_FILLED: 'partially_filled',
  FILLED: 'filled',
  CANCELED: 'canceled',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * Time in force options
 */
const TimeInForce = {
  DAY: 'DAY',           // Good for day
  GTC: 'GTC',           // Good till canceled
  IOC: 'IOC',           // Immediate or cancel
  FOK: 'FOK',           // Fill or kill
  OPG: 'OPG',           // At open
  CLS: 'CLS'            // At close
};

/**
 * Base broker adapter interface
 */
class BrokerAdapter {
  constructor(config = {}) {
    this.config = config;
    this.connected = false;
  }

  async connect() {
    throw new Error('connect() not implemented');
  }

  async disconnect() {
    throw new Error('disconnect() not implemented');
  }

  async submitOrder(order) {
    throw new Error('submitOrder() not implemented');
  }

  async cancelOrder(orderId) {
    throw new Error('cancelOrder() not implemented');
  }

  async getOrderStatus(orderId) {
    throw new Error('getOrderStatus() not implemented');
  }

  async getPositions() {
    throw new Error('getPositions() not implemented');
  }

  async getAccountBalance() {
    throw new Error('getAccountBalance() not implemented');
  }

  async getQuote(symbol) {
    throw new Error('getQuote() not implemented');
  }

  isConnected() {
    return this.connected;
  }
}

/**
 * Paper Trading Adapter
 */
class PaperTradingAdapter extends BrokerAdapter {
  constructor(config = {}) {
    super(config);
    this.engine = null;
    this.accountId = null;
  }

  async connect() {
    const { PaperTradingEngine } = require('./paperTrading');
    const database = require('../../database');
    const db = database.getDatabase();

    this.engine = new PaperTradingEngine(db, this.config);

    // Get or create account
    const accountName = this.config.accountName || 'default';
    try {
      const account = this.engine.getAccount(accountName);
      this.accountId = account.id;
    } catch (err) {
      const account = this.engine.createAccount(
        accountName,
        this.config.initialCapital || 100000
      );
      this.accountId = account.id;
    }

    this.connected = true;
    return { success: true, accountId: this.accountId };
  }

  async disconnect() {
    this.connected = false;
    return { success: true };
  }

  async submitOrder(order) {
    if (!this.connected) throw new Error('Not connected');

    return this.engine.submitOrder(this.accountId, {
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      orderType: order.orderType,
      limitPrice: order.limitPrice,
      stopPrice: order.stopPrice,
      notes: order.notes
    });
  }

  async cancelOrder(orderId) {
    if (!this.connected) throw new Error('Not connected');
    return this.engine.cancelOrder(this.accountId, orderId);
  }

  async getOrderStatus(orderId) {
    if (!this.connected) throw new Error('Not connected');
    const orders = this.engine.getOrders(this.accountId, 100);
    const order = orders.find(o => o.order_id === orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    return order;
  }

  async getPositions() {
    if (!this.connected) throw new Error('Not connected');
    return this.engine.getPositions(this.accountId);
  }

  async getAccountBalance() {
    if (!this.connected) throw new Error('Not connected');
    const status = this.engine.getAccountStatus(this.accountId);
    return {
      portfolioValue: status.summary.portfolioValue,
      cashBalance: status.summary.cashBalance,
      buyingPower: status.summary.buyingPower,
      positionsValue: status.summary.positionsValue
    };
  }

  async getQuote(symbol) {
    if (!this.connected) throw new Error('Not connected');
    const priceData = this.engine.stmtGetPrice.get(symbol);
    if (!priceData) throw new Error(`No price data for ${symbol}`);
    return {
      symbol,
      price: priceData.price,
      timestamp: priceData.price_date
    };
  }

  getPerformance(days = 30) {
    if (!this.connected) throw new Error('Not connected');
    return this.engine.getPerformance(this.accountId, days);
  }

  takeSnapshot() {
    if (!this.connected) throw new Error('Not connected');
    return this.engine.takeSnapshot(this.accountId);
  }
}

/**
 * Interactive Brokers Adapter (Stub)
 * Implement when ready for live trading
 */
class InteractiveBrokersAdapter extends BrokerAdapter {
  constructor(config = {}) {
    super(config);
    this.clientId = config.clientId || 1;
    this.host = config.host || '127.0.0.1';
    this.port = config.port || 7497; // TWS paper: 7497, live: 7496
  }

  async connect() {
    // TODO: Implement IB connection using ib-tws-api or similar
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async disconnect() {
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async submitOrder(order) {
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async cancelOrder(orderId) {
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async getOrderStatus(orderId) {
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async getPositions() {
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async getAccountBalance() {
    throw new Error('Interactive Brokers integration not yet implemented');
  }

  async getQuote(symbol) {
    throw new Error('Interactive Brokers integration not yet implemented');
  }
}

/**
 * Alpaca Adapter (Stub)
 * Implement when ready for live trading
 */
class AlpacaAdapter extends BrokerAdapter {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.paper = config.paper !== false; // Default to paper trading
    this.baseUrl = this.paper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }

  async connect() {
    // TODO: Implement Alpaca connection
    throw new Error('Alpaca integration not yet implemented');
  }

  async disconnect() {
    throw new Error('Alpaca integration not yet implemented');
  }

  async submitOrder(order) {
    throw new Error('Alpaca integration not yet implemented');
  }

  async cancelOrder(orderId) {
    throw new Error('Alpaca integration not yet implemented');
  }

  async getOrderStatus(orderId) {
    throw new Error('Alpaca integration not yet implemented');
  }

  async getPositions() {
    throw new Error('Alpaca integration not yet implemented');
  }

  async getAccountBalance() {
    throw new Error('Alpaca integration not yet implemented');
  }

  async getQuote(symbol) {
    throw new Error('Alpaca integration not yet implemented');
  }
}

/**
 * OrderAbstractionLayer - Main unified interface
 */
class OrderAbstractionLayer {
  /**
   * @param {string} brokerType Type of broker ('paper', 'ib', 'alpaca')
   * @param {Object} config Broker-specific configuration
   */
  constructor(brokerType = 'paper', config = {}) {
    this.brokerType = brokerType;
    this.config = config;
    this.adapter = this._createAdapter(brokerType, config);
  }

  _createAdapter(brokerType, config) {
    switch (brokerType.toLowerCase()) {
      case 'paper':
        return new PaperTradingAdapter(config);
      case 'ib':
      case 'interactive_brokers':
        return new InteractiveBrokersAdapter(config);
      case 'alpaca':
        return new AlpacaAdapter(config);
      default:
        throw new Error(`Unknown broker type: ${brokerType}`);
    }
  }

  /**
   * Connect to the broker
   */
  async connect() {
    return this.adapter.connect();
  }

  /**
   * Disconnect from the broker
   */
  async disconnect() {
    return this.adapter.disconnect();
  }

  /**
   * Check connection status
   */
  isConnected() {
    return this.adapter.isConnected();
  }

  /**
   * Submit an order
   * @param {string} symbol Stock symbol
   * @param {string} side 'BUY' or 'SELL'
   * @param {number} quantity Number of shares
   * @param {string} orderType Order type (MARKET, LIMIT, etc.)
   * @param {Object} params Additional parameters
   */
  async submitOrder(symbol, side, quantity, orderType = OrderType.MARKET, params = {}) {
    if (!this.isConnected()) {
      throw new Error('Not connected to broker');
    }

    const order = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      quantity,
      orderType: orderType.toUpperCase(),
      limitPrice: params.limitPrice,
      stopPrice: params.stopPrice,
      timeInForce: params.timeInForce || TimeInForce.DAY,
      notes: params.notes
    };

    return this.adapter.submitOrder(order);
  }

  /**
   * Cancel an open order
   */
  async cancelOrder(orderId) {
    if (!this.isConnected()) {
      throw new Error('Not connected to broker');
    }
    return this.adapter.cancelOrder(orderId);
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId) {
    if (!this.isConnected()) {
      throw new Error('Not connected to broker');
    }
    return this.adapter.getOrderStatus(orderId);
  }

  /**
   * Get all current positions
   */
  async getPositions() {
    if (!this.isConnected()) {
      throw new Error('Not connected to broker');
    }
    return this.adapter.getPositions();
  }

  /**
   * Get account balance and buying power
   */
  async getAccountBalance() {
    if (!this.isConnected()) {
      throw new Error('Not connected to broker');
    }
    return this.adapter.getAccountBalance();
  }

  /**
   * Get current quote for a symbol
   */
  async getQuote(symbol) {
    if (!this.isConnected()) {
      throw new Error('Not connected to broker');
    }
    return this.adapter.getQuote(symbol.toUpperCase());
  }

  /**
   * Execute a market buy order (convenience method)
   */
  async buy(symbol, quantity, params = {}) {
    return this.submitOrder(symbol, OrderSide.BUY, quantity, OrderType.MARKET, params);
  }

  /**
   * Execute a market sell order (convenience method)
   */
  async sell(symbol, quantity, params = {}) {
    return this.submitOrder(symbol, OrderSide.SELL, quantity, OrderType.MARKET, params);
  }

  /**
   * Execute a limit buy order (convenience method)
   */
  async limitBuy(symbol, quantity, limitPrice, params = {}) {
    return this.submitOrder(symbol, OrderSide.BUY, quantity, OrderType.LIMIT, {
      ...params,
      limitPrice
    });
  }

  /**
   * Execute a limit sell order (convenience method)
   */
  async limitSell(symbol, quantity, limitPrice, params = {}) {
    return this.submitOrder(symbol, OrderSide.SELL, quantity, OrderType.LIMIT, {
      ...params,
      limitPrice
    });
  }

  /**
   * Get broker type
   */
  getBrokerType() {
    return this.brokerType;
  }

  /**
   * Get underlying adapter (for broker-specific operations)
   */
  getAdapter() {
    return this.adapter;
  }
}

module.exports = {
  OrderAbstractionLayer,
  BrokerAdapter,
  PaperTradingAdapter,
  InteractiveBrokersAdapter,
  AlpacaAdapter,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce
};
