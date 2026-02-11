// src/api/routes/strategies.js
// API endpoints for strategy configuration and management

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');

module.exports = function(db) {
  const { StrategyConfigManager } = require('../../services/agent/strategyConfig');
  const { ConfigurableStrategyAgent } = require('../../services/agent/configurableStrategyAgent');
  const { MetaAllocator } = require('../../services/agent/metaAllocator');

  const configManager = new StrategyConfigManager(db);

  // ============================================================
  // PRESETS
  // ============================================================

  /**
   * GET /api/strategies/presets
   * Get all available strategy presets
   */
  router.get('/presets', async (req, res) => {
    try {
      const presets = await configManager.getPresets();
      res.json({
        success: true,
        presets: presets.map(p => ({
          name: p.name,
          description: p.description,
          category: p.category,
          riskProfile: p.risk_profile,
          holdingPeriod: p.typical_holding_period,
          config: p.config
        }))
      });
    } catch (error) {
      console.error('Error fetching presets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // STRATEGIES CRUD
  // ============================================================

  /**
   * GET /api/strategies
   * Get all strategies (optionally filter by active status)
   */
  router.get('/', async (req, res) => {
    try {
      const { active } = req.query;
      let strategies;

      if (active === 'true') {
        strategies = await configManager.getActiveStrategies();
      } else {
        const database = await getDatabaseAsync();
        const result = await database.query('SELECT * FROM strategy_configs ORDER BY name');
        strategies = result.rows;
      }

      res.json({
        success: true,
        strategies: strategies.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          mode: s.mode,
          isActive: !!s.is_active,
          createdAt: s.created_at,
          updatedAt: s.updated_at
        }))
      });
    } catch (error) {
      console.error('Error fetching strategies:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/strategies/:id
   * Get a single strategy with full configuration
   */
  router.get('/:id', async (req, res) => {
    try {
      const strategy = await configManager.getStrategy(parseInt(req.params.id));

      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      const agentConfig = await configManager.getAgentConfig(strategy.id);

      res.json({
        success: true,
        strategy,
        agentConfig
      });
    } catch (error) {
      console.error('Error fetching strategy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/strategies
   * Create a new strategy
   * Body: { name, description?, preset?, ...config }
   */
  router.post('/', (req, res) => {
    try {
      const { preset, ...config } = req.body;

      // Validate
      const validation = configManager.validateConfig(config);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors,
          warnings: validation.warnings
        });
      }

      const strategy = await configManager.createStrategy(config, preset);

      res.status(201).json({
        success: true,
        strategy,
        warnings: validation.warnings
      });
    } catch (error) {
      console.error('Error creating strategy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PUT /api/strategies/:id
   * Update an existing strategy
   */
  router.put('/:id', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);
      const updates = req.body;

      const existing = await configManager.getStrategy(strategyId);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      const merged = { ...existing, ...updates };
      const validation = configManager.validateConfig(merged);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          errors: validation.errors,
          warnings: validation.warnings
        });
      }

      const strategy = await configManager.updateStrategy(strategyId, updates);

      res.json({
        success: true,
        strategy,
        warnings: validation.warnings
      });
    } catch (error) {
      console.error('Error updating strategy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/strategies/:id
   * Deactivate a strategy (soft delete)
   */
  router.delete('/:id', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);

      const strategy = await configManager.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      await configManager.updateStrategy(strategyId, { is_active: 0 });

      res.json({ success: true, message: 'Strategy deactivated' });
    } catch (error) {
      console.error('Error deleting strategy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // MULTI-STRATEGY
  // ============================================================

  /**
   * POST /api/strategies/multi
   * Create a multi-strategy configuration
   * Body: { name, description, childStrategies: [{strategyId, targetAllocation, minAllocation?, maxAllocation?}] }
   */
  router.post('/multi', async (req, res) => {
    try {
      const { name, description, childStrategies } = req.body;

      if (!name || !childStrategies || childStrategies.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Multi-strategy requires a name and at least 2 child strategies'
        });
      }

      const totalAlloc = childStrategies.reduce((sum, c) => sum + (c.targetAllocation || 0), 0);
      if (Math.abs(totalAlloc - 1) > 0.01) {
        return res.status(400).json({
          success: false,
          error: `Target allocations must sum to 1.0 (currently ${totalAlloc.toFixed(2)})`
        });
      }

      for (const child of childStrategies) {
        const strategy = await configManager.getStrategy(child.strategyId);
        if (!strategy) {
          return res.status(400).json({
            success: false,
            error: `Child strategy ${child.strategyId} not found`
          });
        }
        if (strategy.mode === 'multi') {
          return res.status(400).json({
            success: false,
            error: 'Cannot nest multi-strategies'
          });
        }
      }

      const multiStrategy = await configManager.createMultiStrategy(name, description, childStrategies);

      res.status(201).json({
        success: true,
        strategy: multiStrategy
      });
    } catch (error) {
      console.error('Error creating multi-strategy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/strategies/:id/allocations
   * Get current optimal allocations for a multi-strategy
   */
  router.get('/:id/allocations', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);
      const strategy = await configManager.getStrategy(strategyId);

      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      if (strategy.mode !== 'multi') {
        return res.status(400).json({
          success: false,
          error: 'Allocations only available for multi-strategy mode'
        });
      }

      const allocator = new MetaAllocator(db, strategyId);
      const allocations = await allocator.calculateOptimalAllocations();

      res.json({
        success: true,
        ...allocations
      });
    } catch (error) {
      console.error('Error calculating allocations:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // STRATEGY EXECUTION
  // ============================================================

  /**
   * POST /api/strategies/:id/signals
   * Generate trading signals for a strategy
   * Body: { currentPositions?: [{symbol, shares, avgCost, marketValue}] }
   */
  router.post('/:id/signals', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);
      const { currentPositions = [] } = req.body;

      const strategy = await configManager.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      const positionsMap = new Map();
      for (const pos of currentPositions) {
        positionsMap.set(pos.symbol, pos);
      }

      let signals;

      if (strategy.mode === 'multi') {
        const allocator = new MetaAllocator(db, strategyId);
        signals = await allocator.getWeightedSignals(positionsMap);
      } else {
        const agent = new ConfigurableStrategyAgent(db, strategyId);
        await agent.initialize();
        const universe = await agent.getUniverse();

        signals = [];
        for (const stock of universe.slice(0, 100)) {
          const signal = await agent.generateSignal(stock, positionsMap);
          if (signal && (signal.action === 'buy' || signal.action === 'strong_buy' ||
                        signal.action === 'sell' || signal.action === 'strong_sell')) {
            signals.push(signal);
          }
        }
        signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
      }

      res.json({
        success: true,
        strategyName: strategy.name,
        mode: strategy.mode,
        signalCount: signals.length,
        signals: signals.slice(0, 50) // Return top 50
      });
    } catch (error) {
      console.error('Error generating signals:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/strategies/:id/position-size
   * Calculate position size for a signal
   * Body: { symbol, score, confidence, portfolioValue, currentPositions }
   */
  router.post('/:id/position-size', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);
      const { symbol, score, confidence, portfolioValue, currentPositions = [] } = req.body;

      const strategy = await configManager.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      if (strategy.mode === 'multi') {
        return res.status(400).json({
          success: false,
          error: 'Use child strategy for position sizing in multi-strategy mode'
        });
      }

      const agent = new ConfigurableStrategyAgent(db, strategyId);
      await agent.initialize();

      const database = await getDatabaseAsync();
      const stockRes = await database.query('SELECT * FROM companies WHERE LOWER(symbol) = LOWER($1)', [symbol]);
      const stock = stockRes.rows[0];
      if (!stock) {
        return res.status(404).json({ success: false, error: 'Stock not found' });
      }

      const priceRes = await database.query(`
        SELECT close as price FROM daily_prices
        WHERE company_id = $1 ORDER BY date DESC LIMIT 1
      `, [stock.id]);
      const price = priceRes.rows[0];

      const signal = { symbol, score, confidence, price: price?.price || 0, sector: stock.sector };

      const positionsMap = new Map();
      for (const pos of currentPositions) {
        positionsMap.set(pos.symbol, pos);
      }

      const sizing = agent.calculatePositionSize(signal, portfolioValue, positionsMap);

      res.json({
        success: true,
        symbol,
        ...sizing
      });
    } catch (error) {
      console.error('Error calculating position size:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================
  // STRATEGY ANALYSIS
  // ============================================================

  /**
   * GET /api/strategies/:id/universe
   * Get the stock universe for a strategy
   */
  router.get('/:id/universe', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);

      const strategy = await configManager.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      if (strategy.mode === 'multi') {
        return res.status(400).json({
          success: false,
          error: 'Universe varies by child strategy in multi-strategy mode'
        });
      }

      const agent = new ConfigurableStrategyAgent(db, strategyId);
      await agent.initialize();
      const universe = await agent.getUniverse();

      res.json({
        success: true,
        strategyName: strategy.name,
        universeSize: universe.length,
        stocks: universe.slice(0, 100).map(s => ({
          symbol: s.symbol,
          name: s.name,
          sector: s.sector,
          marketCap: s.market_cap
        }))
      });
    } catch (error) {
      console.error('Error fetching universe:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/strategies/:id/summary
   * Get strategy summary and current state
   */
  router.get('/:id/summary', async (req, res) => {
    try {
      const strategyId = parseInt(req.params.id);

      const strategy = await configManager.getStrategy(strategyId);
      if (!strategy) {
        return res.status(404).json({ success: false, error: 'Strategy not found' });
      }

      let summary;

      if (strategy.mode === 'multi') {
        const allocator = new MetaAllocator(db, strategyId);
        summary = await allocator.getSummary();
      } else {
        const agent = new ConfigurableStrategyAgent(db, strategyId);
        await agent.initialize();
        summary = await agent.getSummary();
      }

      res.json({
        success: true,
        ...summary
      });
    } catch (error) {
      console.error('Error fetching summary:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
};
