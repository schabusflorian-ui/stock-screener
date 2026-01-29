// src/api/routes/optimization.js
// API routes for hedge fund-grade optimization tools
// VaR, Efficient Frontier, Hierarchical Risk Parity

const express = require('express');
const router = express.Router();
const db = require('../../database');
const {
  VaRCalculator,
  EfficientFrontierCalculator,
  HierarchicalRiskParity,
  PerformanceAttribution,
} = require('../../services/portfolio');
const { SignalEnhancer } = require('../../services/agent');

// ============================================
// VaR ENDPOINTS
// ============================================

/**
 * GET /api/optimization/var/:portfolioId
 * Calculate VaR for a portfolio
 */
router.get('/var/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const database = db.getDatabase();

    // Get portfolio snapshots for returns
    const snapshots = database.prepare(`
      SELECT snapshot_date, total_value FROM portfolio_snapshots
      WHERE portfolio_id = ?
      ORDER BY snapshot_date DESC
      LIMIT 365
    `).all(portfolioId);

    if (snapshots.length < 30) {
      return res.status(400).json({
        success: false,
        error: 'Need at least 30 days of history for VaR calculation',
        available: snapshots.length,
      });
    }

    // Get current portfolio value
    const portfolio = database.prepare('SELECT current_value FROM portfolios WHERE id = ?').get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }

    // Calculate returns
    const returns = [];
    for (let i = 0; i < snapshots.length - 1; i++) {
      const prevValue = snapshots[i + 1].total_value;
      const currValue = snapshots[i].total_value;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    const calculator = new VaRCalculator();
    const varResult = calculator.calculateVaR(returns, portfolio.current_value);

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      ...varResult,
    });
  } catch (error) {
    console.error('VaR calculation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimization/var/stress-test/:portfolioId
 * Run VaR stress tests
 */
router.post('/var/stress-test/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { scenarios } = req.body;
    const database = db.getDatabase();

    const snapshots = database.prepare(`
      SELECT total_value FROM portfolio_snapshots
      WHERE portfolio_id = ?
      ORDER BY snapshot_date DESC
      LIMIT 365
    `).all(portfolioId);

    if (snapshots.length < 30) {
      return res.status(400).json({ success: false, error: 'Insufficient history' });
    }

    const portfolio = database.prepare('SELECT current_value FROM portfolios WHERE id = ?').get(portfolioId);

    const returns = [];
    for (let i = 0; i < snapshots.length - 1; i++) {
      const prevValue = snapshots[i + 1].total_value;
      const currValue = snapshots[i].total_value;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    const calculator = new VaRCalculator();
    const stressResult = calculator.stressTestVaR(returns, portfolio.current_value, scenarios || null);

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      ...stressResult,
    });
  } catch (error) {
    console.error('Stress test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EFFICIENT FRONTIER ENDPOINTS
// ============================================

/**
 * POST /api/optimization/efficient-frontier
 * Calculate efficient frontier for given assets
 */
router.post('/efficient-frontier', async (req, res) => {
  try {
    const { symbols, constraints, riskFreeRate } = req.body;
    const database = db.getDatabase();

    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Need at least 2 symbols for optimization',
      });
    }

    // Gather asset data
    const assets = [];
    for (const symbol of symbols) {
      const company = database.prepare(`
        SELECT id, symbol FROM companies WHERE LOWER(symbol) = LOWER(?)
      `).get(symbol);

      if (!company) continue;

      const prices = database.prepare(`
        SELECT date, close FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 252
      `).all(company.id);

      if (prices.length < 60) continue;

      // Calculate returns
      const returns = [];
      for (let i = 0; i < prices.length - 1; i++) {
        const ret = (prices[i].close - prices[i + 1].close) / prices[i + 1].close;
        returns.push(ret);
      }

      assets.push({
        symbol: company.symbol,
        returns,
      });
    }

    if (assets.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient data for at least 2 assets',
      });
    }

    const calculator = new EfficientFrontierCalculator({
      riskFreeRate: riskFreeRate || 0.05,
    });

    const result = calculator.calculateFrontier(assets, constraints || {});

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Efficient frontier error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimization/max-sharpe
 * Find maximum Sharpe ratio portfolio
 */
router.post('/max-sharpe', async (req, res) => {
  try {
    const { symbols, constraints, riskFreeRate } = req.body;
    const database = db.getDatabase();

    if (!symbols || symbols.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 symbols' });
    }

    const assets = await gatherAssetData(database, symbols);
    if (assets.length < 2) {
      return res.status(400).json({ success: false, error: 'Insufficient data' });
    }

    const calculator = new EfficientFrontierCalculator({ riskFreeRate: riskFreeRate || 0.05 });
    const result = calculator.optimizeForSharpe(assets, constraints || {});

    res.json({
      success: true,
      optimalPortfolio: result,
    });
  } catch (error) {
    console.error('Max Sharpe error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimization/black-litterman
 * Black-Litterman optimization with views
 */
router.post('/black-litterman', async (req, res) => {
  try {
    const { symbols, views, marketCaps } = req.body;
    const database = db.getDatabase();

    if (!symbols || symbols.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 symbols' });
    }

    if (!views || !Array.isArray(views) || views.length === 0) {
      return res.status(400).json({ success: false, error: 'Views are required for Black-Litterman' });
    }

    const assets = await gatherAssetData(database, symbols);
    if (assets.length < 2) {
      return res.status(400).json({ success: false, error: 'Insufficient data' });
    }

    const calculator = new EfficientFrontierCalculator();
    const result = calculator.blackLitterman(assets, views, marketCaps || {});

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Black-Litterman error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HIERARCHICAL RISK PARITY ENDPOINTS
// ============================================

/**
 * POST /api/optimization/hrp
 * Calculate Hierarchical Risk Parity weights
 */
router.post('/hrp', async (req, res) => {
  try {
    const { symbols } = req.body;
    const database = db.getDatabase();

    if (!symbols || symbols.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 symbols' });
    }

    const assets = await gatherAssetData(database, symbols);
    if (assets.length < 2) {
      return res.status(400).json({ success: false, error: 'Insufficient data' });
    }

    const hrp = new HierarchicalRiskParity();
    const result = hrp.calculateWeights(assets);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('HRP error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimization/hrp/compare
 * Compare HRP with other methods
 */
router.post('/hrp/compare', async (req, res) => {
  try {
    const { symbols } = req.body;
    const database = db.getDatabase();

    if (!symbols || symbols.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 symbols' });
    }

    const assets = await gatherAssetData(database, symbols);
    if (assets.length < 2) {
      return res.status(400).json({ success: false, error: 'Insufficient data' });
    }

    const hrp = new HierarchicalRiskParity();
    const result = hrp.compareWithOtherMethods(assets);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('HRP compare error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/optimization/portfolio/:portfolioId/optimize
 * Optimize existing portfolio holdings
 */
router.get('/portfolio/:portfolioId/optimize', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const method = req.query.method || 'hrp'; // hrp, sharpe, min-variance
    const database = db.getDatabase();

    // Get current positions
    const positions = database.prepare(`
      SELECT pp.company_id, pp.current_value, c.symbol
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ?
    `).all(portfolioId);

    if (positions.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Need at least 2 positions for optimization',
      });
    }

    const symbols = positions.map(p => p.symbol);
    const assets = await gatherAssetData(database, symbols);

    if (assets.length < 2) {
      return res.status(400).json({ success: false, error: 'Insufficient price data' });
    }

    let result;
    if (method === 'hrp') {
      const hrp = new HierarchicalRiskParity();
      result = hrp.calculateWeights(assets);
    } else if (method === 'sharpe') {
      const calc = new EfficientFrontierCalculator();
      result = calc.optimizeForSharpe(assets);
    } else if (method === 'min-variance') {
      const calc = new EfficientFrontierCalculator();
      result = calc.optimizeForMinVariance(assets);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid method. Use: hrp, sharpe, min-variance' });
    }

    // Calculate current vs optimal weights
    const totalValue = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);
    const currentWeights = positions.map(p => ({
      symbol: p.symbol,
      currentWeight: totalValue > 0 ? (p.current_value || 0) / totalValue : 0,
    }));

    // Merge current with optimal
    const comparison = currentWeights.map(cw => {
      const optimal = result.weights?.find(w => w.symbol === cw.symbol);
      return {
        symbol: cw.symbol,
        currentWeight: Math.round(cw.currentWeight * 10000) / 100,
        optimalWeight: optimal ? Math.round(optimal.weight * 10000) / 100 : 0,
        difference: optimal
          ? Math.round((optimal.weight - cw.currentWeight) * 10000) / 100
          : -Math.round(cw.currentWeight * 10000) / 100,
      };
    });

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      method,
      optimization: result,
      comparison,
      rebalanceRequired: comparison.some(c => Math.abs(c.difference) > 2), // >2% drift
    });
  } catch (error) {
    console.error('Portfolio optimization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PERFORMANCE ATTRIBUTION ENDPOINTS
// ============================================

/**
 * GET /api/optimization/attribution/:portfolioId
 * Calculate Brinson-Fachler performance attribution
 */
router.get('/attribution/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { startDate, endDate } = req.query;
    const database = db.getDatabase();

    const portfolio = database.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }

    // Get benchmark allocation (S&P 500 sector weights as default)
    const benchmarkWeights = {
      'Technology': 0.28,
      'Healthcare': 0.13,
      'Financials': 0.12,
      'Consumer Discretionary': 0.10,
      'Communication Services': 0.09,
      'Industrials': 0.08,
      'Consumer Staples': 0.07,
      'Energy': 0.05,
      'Utilities': 0.03,
      'Real Estate': 0.03,
      'Materials': 0.02,
    };

    // Get portfolio sector weights and returns
    const positions = database.prepare(`
      SELECT pp.*, c.symbol, c.sector
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ?
    `).all(portfolioId);

    const totalValue = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);

    // Calculate sector weights and returns for portfolio
    const sectorData = {};
    for (const pos of positions) {
      const sector = pos.sector || 'Unknown';
      if (!sectorData[sector]) {
        sectorData[sector] = { weight: 0, return: 0, positions: [] };
      }
      const weight = totalValue > 0 ? (pos.current_value || 0) / totalValue : 0;
      sectorData[sector].weight += weight;
      sectorData[sector].positions.push({
        symbol: pos.symbol,
        weight,
        return: pos.unrealized_pnl_pct || 0,
      });
    }

    // Calculate sector returns (weighted average of position returns)
    for (const sector of Object.keys(sectorData)) {
      const sectorWeight = sectorData[sector].weight;
      if (sectorWeight > 0) {
        sectorData[sector].return = sectorData[sector].positions.reduce(
          (sum, p) => sum + p.return * (p.weight / sectorWeight),
          0
        );
      }
    }

    // Build allocation arrays for attribution
    const portfolioWeights = {};
    const portfolioReturns = {};
    const benchmarkReturns = {}; // Estimate sector returns from market data

    for (const sector of Object.keys(sectorData)) {
      portfolioWeights[sector] = sectorData[sector].weight;
      portfolioReturns[sector] = sectorData[sector].return;
      benchmarkReturns[sector] = 8; // Default market return assumption
    }

    const attribution = new PerformanceAttribution(database);
    const result = attribution.brinsonFachler({
      portfolioWeights,
      benchmarkWeights,
      portfolioReturns,
      benchmarkReturns,
    });

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      ...result,
      sectorDetails: sectorData,
    });
  } catch (error) {
    console.error('Attribution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/optimization/factor-attribution/:portfolioId
 * Calculate factor-based performance attribution
 */
router.get('/factor-attribution/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const database = db.getDatabase();

    const portfolio = database.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolioId);
    if (!portfolio) {
      return res.status(404).json({ success: false, error: 'Portfolio not found' });
    }

    // Get portfolio returns from snapshots
    const snapshots = database.prepare(`
      SELECT snapshot_date, total_value FROM portfolio_snapshots
      WHERE portfolio_id = ?
      ORDER BY snapshot_date ASC
      LIMIT 252
    `).all(portfolioId);

    if (snapshots.length < 30) {
      return res.status(400).json({
        success: false,
        error: 'Need at least 30 days of history',
        available: snapshots.length,
      });
    }

    // Calculate portfolio returns
    const returns = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].total_value;
      const currValue = snapshots[i].total_value;
      if (prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }

    // Get market returns (S&P 500)
    const marketPrices = database.prepare(`
      SELECT date, close FROM market_index_prices
      WHERE index_id = 1
      ORDER BY date DESC
      LIMIT 252
    `).all();

    const marketReturns = [];
    for (let i = 0; i < marketPrices.length - 1; i++) {
      const prevPrice = marketPrices[i + 1].close;
      const currPrice = marketPrices[i].close;
      if (prevPrice > 0) {
        marketReturns.push((currPrice - prevPrice) / prevPrice);
      }
    }

    // Align return series length
    const minLength = Math.min(returns.length, marketReturns.length);

    const attribution = new PerformanceAttribution(database);
    const result = attribution.factorAttribution({
      portfolioReturns: returns.slice(0, minLength),
      marketReturns: marketReturns.slice(0, minLength),
      // Factor returns would ideally come from Fama-French data
    });

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      ...result,
    });
  } catch (error) {
    console.error('Factor attribution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/optimization/holdings-attribution/:portfolioId
 * Calculate holdings-level attribution
 */
router.get('/holdings-attribution/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const database = db.getDatabase();

    const attribution = new PerformanceAttribution(database);
    const result = attribution.holdingsAttribution(portfolioId);

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      ...result,
    });
  } catch (error) {
    console.error('Holdings attribution error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SIGNAL IC ENDPOINTS
// ============================================

/**
 * GET /api/optimization/signal-ic
 * Get aggregate Signal IC dashboard
 */
router.get('/signal-ic', async (req, res) => {
  try {
    const database = db.getDatabase();
    const enhancer = new SignalEnhancer(database);
    const dashboard = enhancer.getSignalICDashboard();

    res.json({
      success: true,
      ...dashboard,
    });
  } catch (error) {
    console.error('Signal IC dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/optimization/signal-ic/:symbol
 * Get Signal IC for a specific symbol
 */
router.get('/signal-ic/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const lookbackDays = parseInt(req.query.lookback) || 60;
    const database = db.getDatabase();

    const enhancer = new SignalEnhancer(database);
    const result = enhancer.calculateSignalIC(symbol, lookbackDays);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Signal IC error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimization/transaction-costs
 * Estimate transaction costs for a trade
 */
router.post('/transaction-costs', async (req, res) => {
  try {
    const { symbol, shares, price, avgDailyVolume } = req.body;
    const database = db.getDatabase();

    if (!symbol || !shares || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, shares, price',
      });
    }

    // Get average volume from database if not provided
    let volume = avgDailyVolume;
    if (!volume) {
      const company = database.prepare(`
        SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
      `).get(symbol);

      if (company) {
        const volumeData = database.prepare(`
          SELECT AVG(volume) as avg_vol FROM daily_prices
          WHERE company_id = ?
          ORDER BY date DESC
          LIMIT 30
        `).get(company.id);
        volume = volumeData?.avg_vol || 1000000;
      } else {
        volume = 1000000; // Default
      }
    }

    const enhancer = new SignalEnhancer(database);
    const costs = enhancer.estimateTransactionCosts({
      symbol,
      shares,
      price,
      avgDailyVolume: volume,
    });

    res.json({
      success: true,
      symbol,
      ...costs,
    });
  } catch (error) {
    console.error('Transaction cost error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/optimization/execution-strategy
 * Suggest optimal execution strategy
 */
router.post('/execution-strategy', async (req, res) => {
  try {
    const { symbol, shares, avgDailyVolume, urgency } = req.body;
    const database = db.getDatabase();

    if (!symbol || !shares) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, shares',
      });
    }

    // Get average volume from database if not provided
    let volume = avgDailyVolume;
    if (!volume) {
      const company = database.prepare(`
        SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
      `).get(symbol);

      if (company) {
        const volumeData = database.prepare(`
          SELECT AVG(volume) as avg_vol FROM daily_prices
          WHERE company_id = ?
          ORDER BY date DESC
          LIMIT 30
        `).get(company.id);
        volume = volumeData?.avg_vol || 1000000;
      } else {
        volume = 1000000;
      }
    }

    const enhancer = new SignalEnhancer(database);
    const strategy = enhancer.suggestExecutionStrategy({
      shares,
      avgDailyVolume: volume,
      urgency: urgency || 'normal',
    });

    res.json({
      success: true,
      symbol,
      shares,
      avgDailyVolume: volume,
      ...strategy,
    });
  } catch (error) {
    console.error('Execution strategy error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function gatherAssetData(database, symbols) {
  const assets = [];

  for (const symbol of symbols) {
    const company = database.prepare(`
      SELECT id, symbol FROM companies WHERE LOWER(symbol) = LOWER(?)
    `).get(symbol);

    if (!company) continue;

    const prices = database.prepare(`
      SELECT date, close FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT 252
    `).all(company.id);

    if (prices.length < 60) continue;

    const returns = [];
    for (let i = 0; i < prices.length - 1; i++) {
      const ret = (prices[i].close - prices[i + 1].close) / prices[i + 1].close;
      returns.push(ret);
    }

    assets.push({
      symbol: company.symbol,
      returns,
    });
  }

  return assets;
}

module.exports = router;
