// src/services/execution/algorithmicExecutor.js
// World-Class Algorithmic Execution Engine
// Implements TWAP, VWAP, Implementation Shortfall, and Adaptive algorithms

const { db } = require('../../database');
const EventEmitter = require('events');

/**
 * Execution Algorithm Types
 */
const ALGORITHMS = {
  TWAP: 'twap',           // Time-Weighted Average Price
  VWAP: 'vwap',           // Volume-Weighted Average Price
  IS: 'is',               // Implementation Shortfall (Almgren-Chriss)
  POV: 'pov',             // Percentage of Volume
  ADAPTIVE: 'adaptive',   // Adaptive algorithm based on market conditions
  ICEBERG: 'iceberg',     // Hidden size algorithm
  SNIPER: 'sniper'        // Opportunistic liquidity seeking
};

/**
 * Order urgency levels affecting algorithm parameters
 */
const URGENCY = {
  PASSIVE: { name: 'passive', participationRate: 0.05, aggression: 0.1 },
  NORMAL: { name: 'normal', participationRate: 0.10, aggression: 0.3 },
  AGGRESSIVE: { name: 'aggressive', participationRate: 0.20, aggression: 0.6 },
  URGENT: { name: 'urgent', participationRate: 0.35, aggression: 0.9 }
};

/**
 * Intraday volume profile (30-min buckets)
 * Based on typical U.S. equity market patterns
 */
const VOLUME_PROFILE = {
  // Hour-based weights (9:30-16:00 ET)
  '09:30': 0.08, '10:00': 0.07, '10:30': 0.06, '11:00': 0.055,
  '11:30': 0.05, '12:00': 0.045, '12:30': 0.045, '13:00': 0.05,
  '13:30': 0.055, '14:00': 0.06, '14:30': 0.07, '15:00': 0.09,
  '15:30': 0.12, // Close auction ramp
};

/**
 * Algorithmic Execution Engine
 * Manages order scheduling, slicing, and execution tracking
 */
class AlgorithmicExecutor extends EventEmitter {
  constructor() {
    super();
    this.activeOrders = new Map(); // orderId -> ExecutionOrder
    this.executionStats = new Map(); // orderId -> stats
    this.initialized = false;
  }

  /**
   * Initialize the executor and load any pending orders
   */
  async initialize() {
    this._ensureTablesExist();
    await this._loadActiveOrders();
    this.initialized = true;
    console.log(`AlgorithmicExecutor initialized with ${this.activeOrders.size} active orders`);
  }

  /**
   * Ensure database tables exist
   */
  _ensureTablesExist() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS algo_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        total_shares INTEGER NOT NULL,
        filled_shares INTEGER DEFAULT 0,
        algorithm TEXT NOT NULL,
        urgency TEXT DEFAULT 'normal',

        -- Timing
        start_time TEXT,
        end_time TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,

        -- Prices
        arrival_price REAL,
        limit_price REAL,
        avg_fill_price REAL,

        -- Constraints
        min_fill_size INTEGER DEFAULT 100,
        max_participation_rate REAL DEFAULT 0.20,

        -- Status
        status TEXT DEFAULT 'pending',

        -- Parameters (JSON)
        parameters TEXT,

        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_algo_orders_status ON algo_orders(status);
      CREATE INDEX IF NOT EXISTS idx_algo_orders_portfolio ON algo_orders(portfolio_id);

      CREATE TABLE IF NOT EXISTS algo_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        slice_number INTEGER NOT NULL,
        scheduled_time TEXT,
        executed_time TEXT,

        -- Execution details
        target_shares INTEGER,
        filled_shares INTEGER,
        price REAL,

        -- Costs
        slippage_bps REAL,
        market_impact_bps REAL,

        -- Market conditions
        volume_at_execution INTEGER,
        spread_at_execution REAL,

        status TEXT DEFAULT 'pending',

        FOREIGN KEY (order_id) REFERENCES algo_orders(id)
      );

      CREATE INDEX IF NOT EXISTS idx_algo_exec_order ON algo_executions(order_id);

      CREATE TABLE IF NOT EXISTS execution_benchmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,

        -- Benchmark prices
        arrival_price REAL,
        vwap_price REAL,
        twap_price REAL,
        close_price REAL,

        -- Performance vs benchmarks
        vs_arrival_bps REAL,
        vs_vwap_bps REAL,
        vs_twap_bps REAL,

        -- Implementation shortfall breakdown
        delay_cost_bps REAL,
        market_impact_bps REAL,
        timing_cost_bps REAL,
        opportunity_cost_bps REAL,

        created_at TEXT DEFAULT (datetime('now')),

        FOREIGN KEY (order_id) REFERENCES algo_orders(id)
      );
    `);
  }

  /**
   * Load active orders from database
   */
  async _loadActiveOrders() {
    const orders = db.prepare(`
      SELECT * FROM algo_orders WHERE status IN ('pending', 'active', 'paused')
    `).all();

    for (const order of orders) {
      this.activeOrders.set(order.id, {
        ...order,
        parameters: JSON.parse(order.parameters || '{}')
      });
    }
  }

  /**
   * Submit a new algorithmic order
   */
  async submitOrder(params) {
    const {
      portfolioId,
      symbol,
      side,
      shares,
      algorithm = ALGORITHMS.VWAP,
      urgency = 'normal',
      startTime = null,
      endTime = null,
      limitPrice = null,
      parameters = {}
    } = params;

    // Validate inputs
    if (!portfolioId || !symbol || !side || !shares) {
      throw new Error('Missing required order parameters');
    }

    if (!Object.values(ALGORITHMS).includes(algorithm)) {
      throw new Error(`Invalid algorithm: ${algorithm}`);
    }

    // Get arrival price
    const arrivalPrice = await this._getCurrentPrice(symbol);
    if (!arrivalPrice) {
      throw new Error(`Cannot get price for ${symbol}`);
    }

    // Calculate execution schedule
    const schedule = this._generateSchedule({
      symbol,
      shares,
      algorithm,
      urgency,
      startTime,
      endTime,
      parameters
    });

    // Insert order
    const result = db.prepare(`
      INSERT INTO algo_orders
      (portfolio_id, symbol, side, total_shares, algorithm, urgency,
       start_time, end_time, arrival_price, limit_price, parameters, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      portfolioId,
      symbol,
      side,
      shares,
      algorithm,
      urgency,
      startTime || this._getMarketOpen(),
      endTime || this._getMarketClose(),
      arrivalPrice,
      limitPrice,
      JSON.stringify({ ...parameters, schedule })
    );

    const orderId = result.lastInsertRowid;

    // Create execution slices
    for (let i = 0; i < schedule.slices.length; i++) {
      const slice = schedule.slices[i];
      db.prepare(`
        INSERT INTO algo_executions
        (order_id, slice_number, scheduled_time, target_shares, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(orderId, i + 1, slice.time, slice.shares);
    }

    // Add to active orders
    const order = {
      id: orderId,
      portfolioId,
      symbol,
      side,
      total_shares: shares,
      filled_shares: 0,
      algorithm,
      urgency,
      arrival_price: arrivalPrice,
      limit_price: limitPrice,
      parameters: { ...parameters, schedule },
      status: 'pending'
    };

    this.activeOrders.set(orderId, order);
    this.emit('orderSubmitted', order);

    return {
      orderId,
      symbol,
      side,
      shares,
      algorithm,
      schedule: {
        slices: schedule.slices.length,
        duration: schedule.durationMinutes,
        estimatedCostBps: schedule.estimatedCostBps
      }
    };
  }

  /**
   * Generate execution schedule based on algorithm
   */
  _generateSchedule(params) {
    const { symbol, shares, algorithm, urgency, startTime, endTime, parameters } = params;

    switch (algorithm) {
      case ALGORITHMS.TWAP:
        return this._generateTWAPSchedule(shares, startTime, endTime, urgency);
      case ALGORITHMS.VWAP:
        return this._generateVWAPSchedule(shares, startTime, endTime, urgency);
      case ALGORITHMS.IS:
        return this._generateISSchedule(shares, startTime, endTime, urgency, parameters);
      case ALGORITHMS.POV:
        return this._generatePOVSchedule(shares, startTime, endTime, parameters);
      case ALGORITHMS.ADAPTIVE:
        return this._generateAdaptiveSchedule(shares, startTime, endTime, urgency);
      default:
        return this._generateVWAPSchedule(shares, startTime, endTime, urgency);
    }
  }

  /**
   * Generate TWAP (Time-Weighted Average Price) schedule
   * Spreads order evenly across time intervals
   */
  _generateTWAPSchedule(shares, startTime, endTime, urgency) {
    const urgencyConfig = URGENCY[urgency.toUpperCase()] || URGENCY.NORMAL;
    const durationMinutes = this._getMinutesBetween(startTime, endTime);

    // Slice every 5-30 minutes based on urgency
    const sliceIntervalMinutes = Math.max(5, Math.min(30, Math.floor(30 * (1 - urgencyConfig.aggression))));
    const numSlices = Math.max(1, Math.floor(durationMinutes / sliceIntervalMinutes));
    const sharesPerSlice = Math.floor(shares / numSlices);
    const remainder = shares - (sharesPerSlice * numSlices);

    const slices = [];
    let currentTime = new Date(startTime || this._getMarketOpen());

    for (let i = 0; i < numSlices; i++) {
      const sliceShares = sharesPerSlice + (i === numSlices - 1 ? remainder : 0);
      slices.push({
        time: currentTime.toISOString(),
        shares: sliceShares,
        weight: 1 / numSlices,
        type: 'twap'
      });
      currentTime = new Date(currentTime.getTime() + sliceIntervalMinutes * 60000);
    }

    return {
      algorithm: 'TWAP',
      slices,
      durationMinutes,
      intervalMinutes: sliceIntervalMinutes,
      estimatedCostBps: this._estimateTWAPCost(shares, durationMinutes, urgencyConfig)
    };
  }

  /**
   * Generate VWAP (Volume-Weighted Average Price) schedule
   * Follows historical volume profile
   */
  _generateVWAPSchedule(shares, startTime, endTime, urgency) {
    const urgencyConfig = URGENCY[urgency.toUpperCase()] || URGENCY.NORMAL;
    const durationMinutes = this._getMinutesBetween(startTime, endTime);

    // Map time buckets within the execution window
    const buckets = Object.entries(VOLUME_PROFILE);
    const slices = [];
    let totalWeight = 0;

    // Calculate weights within execution window
    const start = new Date(startTime || this._getMarketOpen());
    const end = new Date(endTime || this._getMarketClose());

    for (const [time, weight] of buckets) {
      const [hours, minutes] = time.split(':').map(Number);
      const bucketTime = new Date(start);
      bucketTime.setHours(hours, minutes, 0, 0);

      if (bucketTime >= start && bucketTime <= end) {
        slices.push({
          time: bucketTime.toISOString(),
          weight,
          type: 'vwap'
        });
        totalWeight += weight;
      }
    }

    // Normalize weights and assign shares
    let assignedShares = 0;
    for (let i = 0; i < slices.length; i++) {
      const normalizedWeight = slices[i].weight / totalWeight;
      const sliceShares = i === slices.length - 1
        ? shares - assignedShares
        : Math.round(shares * normalizedWeight);
      slices[i].shares = sliceShares;
      slices[i].normalizedWeight = normalizedWeight;
      assignedShares += sliceShares;
    }

    return {
      algorithm: 'VWAP',
      slices,
      durationMinutes,
      estimatedCostBps: this._estimateVWAPCost(shares, durationMinutes, urgencyConfig)
    };
  }

  /**
   * Generate Implementation Shortfall (Almgren-Chriss) schedule
   * Optimizes trade-off between market impact and timing risk
   */
  _generateISSchedule(shares, startTime, endTime, urgency, parameters) {
    const urgencyConfig = URGENCY[urgency.toUpperCase()] || URGENCY.NORMAL;
    const durationMinutes = this._getMinutesBetween(startTime, endTime);

    // Risk aversion parameter (higher = more front-loaded)
    const lambda = parameters.riskAversion || (0.5 + urgencyConfig.aggression * 0.5);

    // Almgren-Chriss optimal trajectory
    // x(t) = X * sinh(kappa * (T - t)) / sinh(kappa * T)
    const T = durationMinutes / 60; // Hours
    const kappa = Math.sqrt(lambda); // Decay rate

    const numSlices = Math.max(6, Math.min(24, Math.floor(durationMinutes / 15)));
    const slices = [];
    let currentTime = new Date(startTime || this._getMarketOpen());
    let previousPosition = shares;

    for (let i = 0; i < numSlices; i++) {
      const t = (i + 1) * (T / numSlices);
      const remainingFraction = Math.sinh(kappa * (T - t)) / Math.sinh(kappa * T);
      const targetPosition = Math.round(shares * remainingFraction);
      const sliceShares = previousPosition - targetPosition;

      if (sliceShares > 0) {
        slices.push({
          time: currentTime.toISOString(),
          shares: sliceShares,
          remainingPosition: targetPosition,
          type: 'is'
        });
      }

      previousPosition = targetPosition;
      currentTime = new Date(currentTime.getTime() + (durationMinutes / numSlices) * 60000);
    }

    // Add any remaining shares to last slice
    if (previousPosition > 0 && slices.length > 0) {
      slices[slices.length - 1].shares += previousPosition;
    }

    return {
      algorithm: 'IS',
      slices,
      durationMinutes,
      riskAversion: lambda,
      estimatedCostBps: this._estimateISCost(shares, durationMinutes, lambda)
    };
  }

  /**
   * Generate POV (Percentage of Volume) schedule
   * Targets a specific participation rate
   */
  _generatePOVSchedule(shares, startTime, endTime, parameters) {
    const targetPOV = parameters.participationRate || 0.10;
    const durationMinutes = this._getMinutesBetween(startTime, endTime);

    // Use VWAP buckets but adjust shares based on POV target
    const buckets = Object.entries(VOLUME_PROFILE);
    const slices = [];

    for (const [time, volumeWeight] of buckets) {
      const [hours, minutes] = time.split(':').map(Number);
      const bucketTime = new Date(startTime || this._getMarketOpen());
      bucketTime.setHours(hours, minutes, 0, 0);

      // Estimate volume for this bucket (placeholder - would use historical data)
      const estimatedVolume = 100000 * volumeWeight;
      const targetShares = Math.round(estimatedVolume * targetPOV);

      slices.push({
        time: bucketTime.toISOString(),
        shares: Math.min(targetShares, shares / 13), // Cap at equal distribution
        targetPOV,
        estimatedVolume,
        type: 'pov'
      });
    }

    // Adjust to ensure we execute full order
    const totalSliceShares = slices.reduce((sum, s) => sum + s.shares, 0);
    const adjustmentFactor = shares / totalSliceShares;

    for (const slice of slices) {
      slice.shares = Math.round(slice.shares * adjustmentFactor);
    }

    return {
      algorithm: 'POV',
      slices,
      durationMinutes,
      targetPOV,
      estimatedCostBps: this._estimatePOVCost(shares, targetPOV)
    };
  }

  /**
   * Generate Adaptive schedule
   * Adjusts based on real-time market conditions
   */
  _generateAdaptiveSchedule(shares, startTime, endTime, urgency) {
    // Start with VWAP as base
    const vwapSchedule = this._generateVWAPSchedule(shares, startTime, endTime, urgency);

    // Mark slices as adaptive for real-time adjustment
    for (const slice of vwapSchedule.slices) {
      slice.type = 'adaptive';
      slice.adjustable = true;
      slice.minShares = Math.round(slice.shares * 0.5);
      slice.maxShares = Math.round(slice.shares * 2.0);
    }

    return {
      ...vwapSchedule,
      algorithm: 'ADAPTIVE',
      adaptiveParams: {
        volumeThreshold: 1.2, // Speed up if volume > 120% expected
        spreadThreshold: 1.5, // Slow down if spread > 150% normal
        momentumFactor: 0.3   // Adjust for price momentum
      }
    };
  }

  /**
   * Execute the next pending slice for an order
   */
  async executeNextSlice(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order || order.status === 'completed') {
      return null;
    }

    // Get next pending slice
    const slice = db.prepare(`
      SELECT * FROM algo_executions
      WHERE order_id = ? AND status = 'pending'
      ORDER BY slice_number ASC
      LIMIT 1
    `).get(orderId);

    if (!slice) {
      await this._completeOrder(orderId);
      return null;
    }

    // Get current market data
    const marketData = await this._getMarketData(order.symbol);

    // Check limit price
    if (order.limit_price) {
      if (order.side === 'buy' && marketData.price > order.limit_price) {
        return { skipped: true, reason: 'Price above limit' };
      }
      if (order.side === 'sell' && marketData.price < order.limit_price) {
        return { skipped: true, reason: 'Price below limit' };
      }
    }

    // Simulate execution
    const execution = this._simulateSliceExecution(slice, marketData, order);

    // Update slice
    db.prepare(`
      UPDATE algo_executions
      SET executed_time = datetime('now'),
          filled_shares = ?,
          price = ?,
          slippage_bps = ?,
          market_impact_bps = ?,
          volume_at_execution = ?,
          spread_at_execution = ?,
          status = 'filled'
      WHERE id = ?
    `).run(
      execution.filledShares,
      execution.price,
      execution.slippageBps,
      execution.marketImpactBps,
      marketData.volume,
      marketData.spread,
      slice.id
    );

    // Update order totals
    const newFilledShares = order.filled_shares + execution.filledShares;
    const newAvgPrice = order.avg_fill_price
      ? ((order.avg_fill_price * order.filled_shares) + (execution.price * execution.filledShares)) / newFilledShares
      : execution.price;

    db.prepare(`
      UPDATE algo_orders
      SET filled_shares = ?,
          avg_fill_price = ?,
          status = 'active'
      WHERE id = ?
    `).run(newFilledShares, newAvgPrice, orderId);

    order.filled_shares = newFilledShares;
    order.avg_fill_price = newAvgPrice;
    order.status = 'active';

    this.emit('sliceExecuted', {
      orderId,
      slice: slice.slice_number,
      execution
    });

    // Check if order is complete
    if (newFilledShares >= order.total_shares) {
      await this._completeOrder(orderId);
    }

    return execution;
  }

  /**
   * Simulate slice execution with realistic costs
   */
  _simulateSliceExecution(slice, marketData, order) {
    const { target_shares } = slice;
    const { price, avgVolume, volatility, spread } = marketData;

    // Calculate participation rate
    const participationRate = target_shares / (avgVolume / 13); // Assuming 13 30-min buckets

    // Market impact (Almgren-Chriss square root model)
    const eta = 0.142;
    const marketImpactBps = eta * volatility * Math.sqrt(participationRate) * 10000;

    // Spread cost (half spread for crossing)
    const spreadCostBps = (spread / price) * 5000;

    // Timing slippage (random component)
    const timingSlippageBps = 1 + Math.random() * 3;

    // Total slippage
    const totalSlippageBps = marketImpactBps + spreadCostBps + timingSlippageBps;

    // Effective price
    const slippageMultiplier = order.side === 'buy'
      ? 1 + totalSlippageBps / 10000
      : 1 - totalSlippageBps / 10000;
    const effectivePrice = price * slippageMultiplier;

    // Partial fill probability based on urgency
    const fillRatio = Math.min(1.0, 0.9 + Math.random() * 0.1);
    const filledShares = Math.round(target_shares * fillRatio);

    return {
      targetShares: target_shares,
      filledShares,
      price: effectivePrice,
      referencePrice: price,
      slippageBps: totalSlippageBps,
      marketImpactBps,
      spreadCostBps,
      participationRate: participationRate * 100
    };
  }

  /**
   * Complete an order and calculate benchmarks
   */
  async _completeOrder(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order) return;

    // Get all executions
    const executions = db.prepare(`
      SELECT * FROM algo_executions WHERE order_id = ? AND status = 'filled'
    `).all(orderId);

    // Calculate benchmarks
    const currentPrice = await this._getCurrentPrice(order.symbol);
    const vwapPrice = this._calculateVWAP(executions);
    const twapPrice = this._calculateTWAP(executions);

    // Implementation shortfall components
    const arrivalPrice = order.arrival_price;
    const avgFillPrice = order.avg_fill_price;

    const vsArrivalBps = ((avgFillPrice - arrivalPrice) / arrivalPrice) * 10000 * (order.side === 'buy' ? 1 : -1);
    const vsVwapBps = ((avgFillPrice - vwapPrice) / vwapPrice) * 10000 * (order.side === 'buy' ? 1 : -1);
    const vsTwapBps = ((avgFillPrice - twapPrice) / twapPrice) * 10000 * (order.side === 'buy' ? 1 : -1);

    // Store benchmarks
    db.prepare(`
      INSERT INTO execution_benchmarks
      (order_id, arrival_price, vwap_price, twap_price, close_price,
       vs_arrival_bps, vs_vwap_bps, vs_twap_bps,
       market_impact_bps, timing_cost_bps)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      arrivalPrice,
      vwapPrice,
      twapPrice,
      currentPrice,
      vsArrivalBps,
      vsVwapBps,
      vsTwapBps,
      executions.reduce((sum, e) => sum + (e.market_impact_bps || 0), 0) / executions.length,
      executions.reduce((sum, e) => sum + (e.slippage_bps || 0), 0) / executions.length
    );

    // Update order status
    db.prepare(`
      UPDATE algo_orders
      SET status = 'completed', completed_at = datetime('now')
      WHERE id = ?
    `).run(orderId);

    order.status = 'completed';
    this.activeOrders.delete(orderId);

    this.emit('orderCompleted', {
      orderId,
      symbol: order.symbol,
      side: order.side,
      filledShares: order.filled_shares,
      avgPrice: avgFillPrice,
      benchmarks: {
        vsArrivalBps,
        vsVwapBps,
        vsTwapBps
      }
    });
  }

  /**
   * Cancel an active order
   */
  async cancelOrder(orderId, reason = 'User requested') {
    const order = this.activeOrders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Cancel pending slices
    db.prepare(`
      UPDATE algo_executions
      SET status = 'cancelled'
      WHERE order_id = ? AND status = 'pending'
    `).run(orderId);

    // Update order
    db.prepare(`
      UPDATE algo_orders
      SET status = 'cancelled', completed_at = datetime('now')
      WHERE id = ?
    `).run(orderId);

    this.activeOrders.delete(orderId);

    this.emit('orderCancelled', {
      orderId,
      reason,
      filledShares: order.filled_shares,
      remainingShares: order.total_shares - order.filled_shares
    });

    return {
      orderId,
      cancelled: true,
      filledShares: order.filled_shares,
      remainingShares: order.total_shares - order.filled_shares
    };
  }

  /**
   * Get order status and execution progress
   */
  getOrderStatus(orderId) {
    const order = this.activeOrders.get(orderId) || db.prepare(`
      SELECT * FROM algo_orders WHERE id = ?
    `).get(orderId);

    if (!order) return null;

    const executions = db.prepare(`
      SELECT * FROM algo_executions WHERE order_id = ?
    `).all(orderId);

    const filledSlices = executions.filter(e => e.status === 'filled');
    const pendingSlices = executions.filter(e => e.status === 'pending');

    return {
      order: {
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        algorithm: order.algorithm,
        status: order.status,
        totalShares: order.total_shares,
        filledShares: order.filled_shares,
        fillPercent: ((order.filled_shares / order.total_shares) * 100).toFixed(1) + '%',
        avgFillPrice: order.avg_fill_price,
        arrivalPrice: order.arrival_price
      },
      progress: {
        completedSlices: filledSlices.length,
        pendingSlices: pendingSlices.length,
        totalSlices: executions.length
      },
      executions: filledSlices.map(e => ({
        slice: e.slice_number,
        time: e.executed_time,
        shares: e.filled_shares,
        price: e.price,
        slippageBps: e.slippage_bps
      })),
      performance: this._calculatePerformance(order, filledSlices)
    };
  }

  /**
   * Calculate execution performance metrics
   */
  _calculatePerformance(order, executions) {
    if (!order.avg_fill_price || executions.length === 0) {
      return null;
    }

    const arrivalPrice = order.arrival_price;
    const avgFillPrice = order.avg_fill_price;
    const avgSlippageBps = executions.reduce((sum, e) => sum + (e.slippage_bps || 0), 0) / executions.length;
    const avgMarketImpactBps = executions.reduce((sum, e) => sum + (e.market_impact_bps || 0), 0) / executions.length;

    const implementationShortfallBps = ((avgFillPrice - arrivalPrice) / arrivalPrice) * 10000 * (order.side === 'buy' ? 1 : -1);

    return {
      avgSlippageBps: avgSlippageBps.toFixed(2),
      avgMarketImpactBps: avgMarketImpactBps.toFixed(2),
      implementationShortfallBps: implementationShortfallBps.toFixed(2),
      quality: implementationShortfallBps < 10 ? 'Excellent' :
               implementationShortfallBps < 25 ? 'Good' :
               implementationShortfallBps < 50 ? 'Fair' : 'Poor'
    };
  }

  /**
   * Get execution analytics across orders
   */
  getAnalytics(portfolioId, options = {}) {
    const { startDate, endDate, algorithm } = options;

    let query = `
      SELECT
        ao.algorithm,
        COUNT(*) as order_count,
        SUM(ao.total_shares) as total_shares,
        AVG(eb.vs_arrival_bps) as avg_vs_arrival_bps,
        AVG(eb.vs_vwap_bps) as avg_vs_vwap_bps,
        AVG(eb.market_impact_bps) as avg_impact_bps
      FROM algo_orders ao
      LEFT JOIN execution_benchmarks eb ON ao.id = eb.order_id
      WHERE ao.status = 'completed'
    `;

    const params = [];

    if (portfolioId) {
      query += ' AND ao.portfolio_id = ?';
      params.push(portfolioId);
    }

    if (startDate) {
      query += ' AND ao.created_at >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND ao.created_at <= ?';
      params.push(endDate);
    }

    if (algorithm) {
      query += ' AND ao.algorithm = ?';
      params.push(algorithm);
    }

    query += ' GROUP BY ao.algorithm';

    const results = db.prepare(query).all(...params);

    return {
      byAlgorithm: results.map(r => ({
        algorithm: r.algorithm,
        orderCount: r.order_count,
        totalShares: r.total_shares,
        avgVsArrivalBps: r.avg_vs_arrival_bps?.toFixed(2) || 'N/A',
        avgVsVwapBps: r.avg_vs_vwap_bps?.toFixed(2) || 'N/A',
        avgImpactBps: r.avg_impact_bps?.toFixed(2) || 'N/A'
      })),
      recommendation: this._getAlgorithmRecommendation(results)
    };
  }

  /**
   * Recommend best algorithm based on historical performance
   */
  _getAlgorithmRecommendation(results) {
    if (!results || results.length === 0) {
      return { algorithm: 'VWAP', reason: 'Default recommendation - no historical data' };
    }

    // Find algorithm with lowest implementation shortfall
    let bestAlgo = results[0];
    for (const r of results) {
      if (r.avg_vs_arrival_bps && r.avg_vs_arrival_bps < bestAlgo.avg_vs_arrival_bps) {
        bestAlgo = r;
      }
    }

    return {
      algorithm: bestAlgo.algorithm,
      reason: `Lowest avg implementation shortfall: ${bestAlgo.avg_vs_arrival_bps?.toFixed(2)} bps`
    };
  }

  // Helper methods
  async _getCurrentPrice(symbol) {
    const result = db.prepare(`
      SELECT dp.close as price
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = ?
      ORDER BY dp.date DESC
      LIMIT 1
    `).get(symbol);
    return result?.price;
  }

  async _getMarketData(symbol) {
    const price = await this._getCurrentPrice(symbol);
    const volumeData = db.prepare(`
      SELECT AVG(dp.volume) as avgVolume
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE c.symbol = ?
      ORDER BY dp.date DESC
      LIMIT 20
    `).get(symbol);

    return {
      price,
      avgVolume: volumeData?.avgVolume || 1000000,
      volatility: 0.02,
      spread: price * 0.0005,
      volume: volumeData?.avgVolume || 1000000
    };
  }

  _calculateVWAP(executions) {
    if (!executions || executions.length === 0) return 0;
    const totalValue = executions.reduce((sum, e) => sum + (e.price * e.filled_shares), 0);
    const totalShares = executions.reduce((sum, e) => sum + e.filled_shares, 0);
    return totalValue / totalShares;
  }

  _calculateTWAP(executions) {
    if (!executions || executions.length === 0) return 0;
    return executions.reduce((sum, e) => sum + e.price, 0) / executions.length;
  }

  _getMinutesBetween(start, end) {
    const startTime = new Date(start || this._getMarketOpen());
    const endTime = new Date(end || this._getMarketClose());
    return (endTime - startTime) / 60000;
  }

  _getMarketOpen() {
    const now = new Date();
    now.setHours(9, 30, 0, 0);
    return now.toISOString();
  }

  _getMarketClose() {
    const now = new Date();
    now.setHours(16, 0, 0, 0);
    return now.toISOString();
  }

  _estimateTWAPCost(shares, durationMinutes, urgency) {
    const baseImpact = 5;
    const urgencyMultiplier = 1 + urgency.aggression;
    return baseImpact * urgencyMultiplier * Math.sqrt(shares / 10000);
  }

  _estimateVWAPCost(shares, durationMinutes, urgency) {
    const baseImpact = 4;
    const urgencyMultiplier = 1 + urgency.aggression * 0.8;
    return baseImpact * urgencyMultiplier * Math.sqrt(shares / 10000);
  }

  _estimateISCost(shares, durationMinutes, riskAversion) {
    const baseImpact = 4.5;
    return baseImpact * Math.sqrt(riskAversion) * Math.sqrt(shares / 10000);
  }

  _estimatePOVCost(shares, targetPOV) {
    const baseImpact = 3;
    return baseImpact * Math.sqrt(targetPOV) * Math.sqrt(shares / 10000);
  }
}

// Singleton instance
let executorInstance = null;

function getExecutor() {
  if (!executorInstance) {
    executorInstance = new AlgorithmicExecutor();
  }
  return executorInstance;
}

module.exports = {
  AlgorithmicExecutor,
  getExecutor,
  ALGORITHMS,
  URGENCY
};
