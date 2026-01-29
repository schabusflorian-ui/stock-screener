// src/services/etfService.js
// ETF Basket Service - Create portfolios based on ETF allocations

const db = require('../database');

class EtfService {
  constructor() {
    this.db = db.getDatabase();
    console.log('📊 ETF Service initialized');
  }

  // ============================================
  // ETF Definitions
  // ============================================

  /**
   * Get all ETF definitions
   */
  getAllEtfs(options = {}) {
    const { category, assetClass, issuer, limit = 100 } = options;

    let query = `
      SELECT * FROM etf_definitions
      WHERE is_active = 1
    `;
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (assetClass) {
      query += ' AND asset_class = ?';
      params.push(assetClass);
    }
    if (issuer) {
      query += ' AND issuer = ?';
      params.push(issuer);
    }

    query += ' ORDER BY symbol ASC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get ETF by symbol
   */
  getEtfBySymbol(symbol) {
    return this.db.prepare(`
      SELECT * FROM etf_definitions WHERE LOWER(symbol) = LOWER(?)
    `).get(symbol);
  }

  /**
   * Get ETF categories
   */
  getCategories() {
    return this.db.prepare(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM etf_definitions
      WHERE is_active = 1 AND category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `).all();
  }

  /**
   * Get ETF holdings for an ETF
   */
  getEtfHoldings(etfIdOrSymbol, options = {}) {
    const { limit = 50 } = options;

    // Get ETF ID if symbol provided
    let etfId = etfIdOrSymbol;
    if (typeof etfIdOrSymbol === 'string') {
      const etf = this.getEtfBySymbol(etfIdOrSymbol);
      if (!etf) return { holdings: [], etf: null };
      etfId = etf.id;
    }

    const etf = this.db.prepare('SELECT * FROM etf_definitions WHERE id = ?').get(etfId);

    const holdings = this.db.prepare(`
      SELECT
        eh.*,
        c.name as company_name,
        c.sector as company_sector,
        pm.last_price
      FROM etf_holdings eh
      LEFT JOIN companies c ON eh.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE eh.etf_id = ?
      ORDER BY eh.weight DESC
      LIMIT ?
    `).all(etfId, limit);

    return { etf, holdings };
  }

  /**
   * Fetch and store holdings for an ETF from Yahoo Finance
   * @param {string} symbol - ETF symbol
   * @returns {Object} Result with holdings count
   */
  async fetchAndStoreHoldings(symbol) {
    const { getYFinanceETFFetcher } = require('./yfinanceETFFetcher');
    const fetcher = getYFinanceETFFetcher();

    // Get ETF ID
    const etf = this.getEtfBySymbol(symbol);
    if (!etf) {
      throw new Error(`ETF not found: ${symbol}`);
    }

    // Fetch holdings from Yahoo Finance
    const holdingsData = await fetcher.fetchHoldings(symbol);
    if (!holdingsData || !holdingsData.holdings || holdingsData.holdings.length === 0) {
      return { success: false, message: 'No holdings data available', holdings: 0 };
    }

    // Delete existing holdings for this ETF
    this.db.prepare('DELETE FROM etf_holdings WHERE etf_id = ?').run(etf.id);

    // Insert new holdings
    const insertStmt = this.db.prepare(`
      INSERT INTO etf_holdings (etf_id, symbol, security_name, weight, company_id, as_of_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let insertedCount = 0;
    for (const holding of holdingsData.holdings) {
      // Try to find matching company
      const company = this.db.prepare(
        'SELECT id FROM companies WHERE symbol = ?'
      ).get(holding.symbol?.toUpperCase());

      insertStmt.run(
        etf.id,
        holding.symbol || 'UNKNOWN',
        holding.name || holding.symbol,
        holding.weight,
        company?.id || null,
        holdingsData.asOfDate
      );
      insertedCount++;
    }

    // Update last_holdings_update timestamp
    this.db.prepare(`
      UPDATE etf_definitions SET last_holdings_update = CURRENT_TIMESTAMP WHERE id = ?
    `).run(etf.id);

    return {
      success: true,
      holdings: insertedCount,
      asOfDate: holdingsData.asOfDate,
      sectorWeightings: holdingsData.sectorWeightings,
      stockPosition: holdingsData.stockPosition,
      bondPosition: holdingsData.bondPosition
    };
  }

  /**
   * Get holdings for an ETF, fetching from Yahoo Finance if not in database
   * @param {string} symbol - ETF symbol
   * @param {Object} options
   * @returns {Object} Holdings data
   */
  async getHoldingsWithFetch(symbol, options = {}) {
    const { forceRefresh = false, limit = 50 } = options;

    // Check existing holdings
    const existing = this.getEtfHoldings(symbol, { limit });

    // If we have recent holdings and not forcing refresh, return them
    if (existing.holdings.length > 0 && !forceRefresh) {
      return existing;
    }

    // Fetch from Yahoo Finance
    try {
      await this.fetchAndStoreHoldings(symbol);
      return this.getEtfHoldings(symbol, { limit });
    } catch (error) {
      console.error(`Failed to fetch holdings for ${symbol}:`, error.message);
      return existing; // Return whatever we have
    }
  }

  // ============================================
  // Model Portfolios
  // ============================================

  /**
   * Get all model portfolios
   */
  getAllModelPortfolios() {
    const models = this.db.prepare(`
      SELECT
        mp.*,
        COUNT(mpa.id) as etf_count,
        SUM(mpa.target_weight) as total_weight
      FROM model_portfolios mp
      LEFT JOIN model_portfolio_allocations mpa ON mp.id = mpa.model_id
      WHERE mp.is_active = 1
      GROUP BY mp.id
      ORDER BY mp.name
    `).all();

    return models;
  }

  /**
   * Get model portfolio details with allocations
   */
  getModelPortfolio(modelIdOrName) {
    let model;

    if (typeof modelIdOrName === 'string') {
      model = this.db.prepare(`
        SELECT * FROM model_portfolios WHERE name = ?
      `).get(modelIdOrName);
    } else {
      model = this.db.prepare(`
        SELECT * FROM model_portfolios WHERE id = ?
      `).get(modelIdOrName);
    }

    if (!model) return null;

    const allocations = this.db.prepare(`
      SELECT
        mpa.*,
        e.symbol,
        e.name as etf_name,
        e.category,
        e.asset_class,
        e.expense_ratio
      FROM model_portfolio_allocations mpa
      JOIN etf_definitions e ON mpa.etf_id = e.id
      WHERE mpa.model_id = ?
      ORDER BY mpa.target_weight DESC
    `).all(model.id);

    // Calculate weighted expense ratio
    const weightedExpenseRatio = allocations.reduce((sum, a) =>
      sum + (a.expense_ratio * a.target_weight / 100), 0
    );

    return {
      ...model,
      allocations,
      weightedExpenseRatio: Math.round(weightedExpenseRatio * 10000) / 10000
    };
  }

  /**
   * Create a custom model portfolio
   */
  createModelPortfolio(name, description, allocations, options = {}) {
    const { riskLevel, investmentStyle } = options;

    // Validate allocations sum to ~100%
    const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
    if (Math.abs(totalWeight - 100) > 1) {
      throw new Error(`Allocations must sum to 100%, got ${totalWeight}%`);
    }

    const insertModel = this.db.prepare(`
      INSERT INTO model_portfolios (name, description, risk_level, investment_style)
      VALUES (?, ?, ?, ?)
    `);

    const insertAlloc = this.db.prepare(`
      INSERT INTO model_portfolio_allocations (model_id, etf_id, target_weight)
      VALUES (?, ?, ?)
    `);

    const getEtfId = this.db.prepare('SELECT id FROM etf_definitions WHERE LOWER(symbol) = LOWER(?)');

    const transaction = this.db.transaction(() => {
      const result = insertModel.run(name, description, riskLevel || null, investmentStyle || null);
      const modelId = result.lastInsertRowid;

      for (const alloc of allocations) {
        const etf = getEtfId.get(alloc.symbol);
        if (!etf) {
          throw new Error(`ETF not found: ${alloc.symbol}`);
        }
        insertAlloc.run(modelId, etf.id, alloc.weight);
      }

      return modelId;
    });

    const modelId = transaction();
    return this.getModelPortfolio(modelId);
  }

  // ============================================
  // Portfolio Creation from ETF Models
  // ============================================

  /**
   * Prepare trades to create a portfolio from a model
   * Returns the trades needed - actual portfolio creation is done by PortfolioService
   */
  preparePortfolioFromModel(modelIdOrName, amount, options = {}) {
    const { excludeEtfs = [], minAllocation = 0 } = options;

    const model = this.getModelPortfolio(modelIdOrName);
    if (!model) {
      throw new Error(`Model portfolio not found: ${modelIdOrName}`);
    }

    // Filter allocations
    const allocations = model.allocations
      .filter(a => !excludeEtfs.includes(a.symbol))
      .filter(a => a.target_weight >= minAllocation);

    // Normalize weights
    const totalWeight = allocations.reduce((sum, a) => sum + a.target_weight, 0);

    // Get current prices for ETFs (check if they exist in companies table)
    const trades = [];
    let cashNeeded = 0;

    for (const alloc of allocations) {
      const normalizedWeight = alloc.target_weight / totalWeight;
      const targetValue = amount * normalizedWeight;

      // Try to find ETF in companies table for price
      const company = this.db.prepare(`
        SELECT c.id, pm.last_price
        FROM companies c
        LEFT JOIN price_metrics pm ON c.id = pm.company_id
        WHERE LOWER(c.symbol) = LOWER(?)
      `).get(alloc.symbol);

      const estimatedPrice = company?.last_price || this._getEstimatedEtfPrice(alloc.symbol);
      const shares = Math.floor(targetValue / estimatedPrice);
      const actualValue = shares * estimatedPrice;

      trades.push({
        symbol: alloc.symbol,
        etfName: alloc.etf_name,
        category: alloc.category,
        assetClass: alloc.asset_class,
        targetWeight: normalizedWeight * 100,
        originalWeight: alloc.target_weight,
        shares,
        estimatedPrice,
        estimatedValue: actualValue,
        expenseRatio: alloc.expense_ratio
      });

      cashNeeded += actualValue;
    }

    // Calculate weighted expense ratio
    const weightedExpenseRatio = trades.reduce((sum, t) =>
      sum + (t.expenseRatio * t.targetWeight / 100), 0
    );

    return {
      modelId: model.id,
      modelName: model.name,
      description: model.description,
      riskLevel: model.risk_level,
      amount,
      cashNeeded: Math.round(cashNeeded * 100) / 100,
      remainingCash: Math.round((amount - cashNeeded) * 100) / 100,
      trades,
      positionsCount: trades.length,
      weightedExpenseRatio: Math.round(weightedExpenseRatio * 10000) / 10000,
      excludedCount: model.allocations.length - allocations.length
    };
  }

  /**
   * Prepare trades to create a portfolio from multiple ETFs
   */
  preparePortfolioFromEtfs(etfAllocations, amount) {
    // etfAllocations: [{ symbol, weight }]

    // Validate weights
    const totalWeight = etfAllocations.reduce((sum, a) => sum + a.weight, 0);
    if (Math.abs(totalWeight - 100) > 1) {
      throw new Error(`Weights must sum to 100%, got ${totalWeight}%`);
    }

    const trades = [];
    let cashNeeded = 0;

    for (const alloc of etfAllocations) {
      const etf = this.getEtfBySymbol(alloc.symbol);
      if (!etf) {
        throw new Error(`ETF not found: ${alloc.symbol}`);
      }

      const normalizedWeight = alloc.weight / totalWeight;
      const targetValue = amount * normalizedWeight;

      // Get price
      const company = this.db.prepare(`
        SELECT c.id, pm.last_price
        FROM companies c
        LEFT JOIN price_metrics pm ON c.id = pm.company_id
        WHERE LOWER(c.symbol) = LOWER(?)
      `).get(alloc.symbol);

      const estimatedPrice = company?.last_price || this._getEstimatedEtfPrice(alloc.symbol);
      const shares = Math.floor(targetValue / estimatedPrice);
      const actualValue = shares * estimatedPrice;

      trades.push({
        symbol: alloc.symbol,
        etfName: etf.name,
        category: etf.category,
        assetClass: etf.asset_class,
        targetWeight: normalizedWeight * 100,
        shares,
        estimatedPrice,
        estimatedValue: actualValue,
        expenseRatio: etf.expense_ratio
      });

      cashNeeded += actualValue;
    }

    const weightedExpenseRatio = trades.reduce((sum, t) =>
      sum + (t.expenseRatio * t.targetWeight / 100), 0
    );

    return {
      amount,
      cashNeeded: Math.round(cashNeeded * 100) / 100,
      remainingCash: Math.round((amount - cashNeeded) * 100) / 100,
      trades,
      positionsCount: trades.length,
      weightedExpenseRatio: Math.round(weightedExpenseRatio * 10000) / 10000
    };
  }

  // ============================================
  // ETF Comparison
  // ============================================

  /**
   * Compare multiple ETFs
   */
  compareEtfs(symbols) {
    const etfs = symbols.map(symbol => {
      const etf = this.getEtfBySymbol(symbol);
      if (!etf) return { symbol, error: 'Not found' };

      // Get price data if available
      const priceData = this.db.prepare(`
        SELECT pm.*
        FROM companies c
        JOIN price_metrics pm ON c.id = pm.company_id
        WHERE LOWER(c.symbol) = LOWER(?)
      `).get(symbol);

      return {
        ...etf,
        priceData: priceData || null
      };
    });

    // Find common metrics for comparison
    return {
      etfs,
      comparison: {
        lowestExpenseRatio: etfs.reduce((min, e) =>
          e.expense_ratio && e.expense_ratio < (min?.expense_ratio || Infinity) ? e : min, null
        ),
        highestExpenseRatio: etfs.reduce((max, e) =>
          e.expense_ratio && e.expense_ratio > (max?.expense_ratio || 0) ? e : max, null
        )
      }
    };
  }

  // ============================================
  // Asset Allocation Analysis
  // ============================================

  /**
   * Analyze asset allocation of a model portfolio
   */
  analyzeModelAllocation(modelIdOrName) {
    const model = this.getModelPortfolio(modelIdOrName);
    if (!model) return null;

    const byAssetClass = {};
    const byCategory = {};

    for (const alloc of model.allocations) {
      // By asset class
      const assetClass = alloc.asset_class || 'Other';
      if (!byAssetClass[assetClass]) {
        byAssetClass[assetClass] = { weight: 0, etfs: [] };
      }
      byAssetClass[assetClass].weight += alloc.target_weight;
      byAssetClass[assetClass].etfs.push(alloc.symbol);

      // By category
      const category = alloc.category || 'Other';
      if (!byCategory[category]) {
        byCategory[category] = { weight: 0, etfs: [] };
      }
      byCategory[category].weight += alloc.target_weight;
      byCategory[category].etfs.push(alloc.symbol);
    }

    return {
      model: model.name,
      riskLevel: model.risk_level,
      totalPositions: model.allocations.length,
      weightedExpenseRatio: model.weightedExpenseRatio,
      byAssetClass: Object.entries(byAssetClass)
        .map(([name, data]) => ({ assetClass: name, ...data }))
        .sort((a, b) => b.weight - a.weight),
      byCategory: Object.entries(byCategory)
        .map(([name, data]) => ({ category: name, ...data }))
        .sort((a, b) => b.weight - a.weight)
    };
  }

  // ============================================
  // Rebalancing
  // ============================================

  /**
   * Calculate rebalancing trades for an ETF-based portfolio
   */
  calculateRebalanceTrades(currentHoldings, targetModel, portfolioValue) {
    // currentHoldings: [{ symbol, shares, currentValue }]
    // targetModel: model ID or name

    const model = this.getModelPortfolio(targetModel);
    if (!model) {
      throw new Error(`Model not found: ${targetModel}`);
    }

    const trades = [];
    const currentBySymbol = new Map(currentHoldings.map(h => [h.symbol.toUpperCase(), h]));

    // Calculate target values
    for (const alloc of model.allocations) {
      const targetValue = portfolioValue * (alloc.target_weight / 100);
      const current = currentBySymbol.get(alloc.symbol.toUpperCase());
      const currentValue = current?.currentValue || 0;

      const valueDiff = targetValue - currentValue;
      const estimatedPrice = this._getEstimatedEtfPrice(alloc.symbol);
      const shareDiff = Math.floor(valueDiff / estimatedPrice);

      if (Math.abs(shareDiff) > 0) {
        trades.push({
          symbol: alloc.symbol,
          action: shareDiff > 0 ? 'buy' : 'sell',
          shares: Math.abs(shareDiff),
          estimatedPrice,
          estimatedValue: Math.abs(shareDiff * estimatedPrice),
          currentWeight: portfolioValue > 0 ? (currentValue / portfolioValue) * 100 : 0,
          targetWeight: alloc.target_weight,
          drift: portfolioValue > 0 ? ((currentValue / portfolioValue) * 100) - alloc.target_weight : 0
        });
      }

      currentBySymbol.delete(alloc.symbol.toUpperCase());
    }

    // Any remaining holdings need to be sold (not in target)
    for (const [symbol, holding] of currentBySymbol) {
      const estimatedPrice = this._getEstimatedEtfPrice(symbol);
      trades.push({
        symbol,
        action: 'sell',
        shares: holding.shares,
        estimatedPrice,
        estimatedValue: holding.currentValue,
        currentWeight: portfolioValue > 0 ? (holding.currentValue / portfolioValue) * 100 : 0,
        targetWeight: 0,
        drift: portfolioValue > 0 ? (holding.currentValue / portfolioValue) * 100 : 0,
        reason: 'Not in target model'
      });
    }

    // Sort: sells first, then buys
    trades.sort((a, b) => {
      if (a.action === 'sell' && b.action === 'buy') return -1;
      if (a.action === 'buy' && b.action === 'sell') return 1;
      return b.estimatedValue - a.estimatedValue;
    });

    return {
      targetModel: model.name,
      portfolioValue,
      trades,
      summary: {
        totalTrades: trades.length,
        buyTrades: trades.filter(t => t.action === 'buy').length,
        sellTrades: trades.filter(t => t.action === 'sell').length,
        totalBuyValue: trades.filter(t => t.action === 'buy').reduce((sum, t) => sum + t.estimatedValue, 0),
        totalSellValue: trades.filter(t => t.action === 'sell').reduce((sum, t) => sum + t.estimatedValue, 0)
      }
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  _getEstimatedEtfPrice(symbol) {
    // Try to get from companies/price_metrics first
    const company = this.db.prepare(`
      SELECT pm.last_price
      FROM companies c
      JOIN price_metrics pm ON c.id = pm.company_id
      WHERE LOWER(c.symbol) = LOWER(?)
    `).get(symbol);

    if (company?.last_price) {
      return company.last_price;
    }

    // Fallback estimated prices for common ETFs
    const estimates = {
      'SPY': 475, 'QQQ': 420, 'VTI': 250, 'VOO': 435,
      'IWM': 200, 'VEA': 48, 'VWO': 42, 'BND': 72,
      'AGG': 98, 'TLT': 95, 'GLD': 190, 'VNQ': 85,
      'XLK': 195, 'XLF': 40, 'XLE': 90, 'XLV': 145,
      'ARKK': 50, 'SCHD': 78
    };

    return estimates[symbol.toUpperCase()] || 100;
  }
}

// Singleton instance
let instance = null;

function getEtfService() {
  if (!instance) {
    instance = new EtfService();
  }
  return instance;
}

module.exports = {
  EtfService,
  getEtfService
};
