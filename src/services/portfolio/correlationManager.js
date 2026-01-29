// src/services/portfolio/correlationManager.js
// Correlation Manager - Simons-inspired diversification with correlation awareness
// Manages position correlations to reduce idiosyncratic risk and avoid concentration

/**
 * CorrelationManager - Correlation-aware portfolio management
 *
 * Implements:
 * - Pairwise stock correlation calculation
 * - Position size adjustment for correlated holdings
 * - Sector diversification enforcement
 * - Portfolio correlation optimization
 */
class CorrelationManager {
  /**
   * @param {Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    this.db = db;
    this.correlationCache = new Map();
    this._initializeTables();
    this._prepareStatements();
    console.log('🔀 CorrelationManager initialized');
  }

  _initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_correlations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol1 TEXT NOT NULL,
        symbol2 TEXT NOT NULL,
        correlation REAL,
        lookback_days INTEGER,
        calculated_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(symbol1, symbol2, calculated_date)
      );

      CREATE TABLE IF NOT EXISTS sector_exposure (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER,
        date TEXT,
        sector TEXT,
        weight REAL,
        position_count INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS correlation_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        symbol TEXT,
        original_weight REAL,
        adjusted_weight REAL,
        adjustment_reason TEXT,
        correlated_with TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this.stmtGetCompanyId = this.db.prepare(`
      SELECT id, sector FROM companies WHERE LOWER(symbol) = LOWER(?)
    `);

    this.stmtGetPriceHistory = this.db.prepare(`
      SELECT date, close as price
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT ?
    `);

    this.stmtStoreCorrelation = this.db.prepare(`
      INSERT OR REPLACE INTO stock_correlations (
        symbol1, symbol2, correlation, lookback_days, calculated_date
      ) VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtGetCachedCorrelation = this.db.prepare(`
      SELECT correlation
      FROM stock_correlations
      WHERE symbol1 = ? AND symbol2 = ?
        AND calculated_date >= date('now', '-7 days')
      ORDER BY calculated_date DESC
      LIMIT 1
    `);

    this.stmtStoreSectorExposure = this.db.prepare(`
      INSERT INTO sector_exposure (portfolio_id, date, sector, weight, position_count)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtStoreAdjustment = this.db.prepare(`
      INSERT INTO correlation_adjustments (
        date, symbol, original_weight, adjusted_weight, adjustment_reason, correlated_with
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
  }

  /**
   * Calculate correlation between two stocks
   * @param {string} symbol1 - First stock symbol
   * @param {string} symbol2 - Second stock symbol
   * @param {number} lookback - Lookback period in days
   * @returns {number} Correlation coefficient
   */
  calculatePairwiseCorrelation(symbol1, symbol2, lookback = 63) {
    // Normalize symbol order for caching
    const [s1, s2] = [symbol1, symbol2].sort();
    const cacheKey = `${s1}_${s2}`;

    // Check cache first
    if (this.correlationCache.has(cacheKey)) {
      const cached = this.correlationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return cached.correlation;
      }
    }

    // Check database cache
    const dbCached = this.stmtGetCachedCorrelation.get(s1, s2);
    if (dbCached) {
      this.correlationCache.set(cacheKey, {
        correlation: dbCached.correlation,
        timestamp: Date.now()
      });
      return dbCached.correlation;
    }

    // Calculate fresh correlation
    const company1 = this.stmtGetCompanyId.get(symbol1);
    const company2 = this.stmtGetCompanyId.get(symbol2);

    if (!company1 || !company2) return 0;

    const prices1 = this.stmtGetPriceHistory.all(company1.id, lookback);
    const prices2 = this.stmtGetPriceHistory.all(company2.id, lookback);

    if (prices1.length < 30 || prices2.length < 30) return 0;

    // Calculate returns
    const returns1 = this._calculateReturns(prices1);
    const returns2 = this._calculateReturns(prices2);

    // Align by date
    const aligned = this._alignReturns(returns1, returns2);
    if (aligned.r1.length < 20) return 0;

    // Calculate Pearson correlation
    const correlation = this._pearsonCorrelation(aligned.r1, aligned.r2);

    // Cache result
    this.correlationCache.set(cacheKey, {
      correlation,
      timestamp: Date.now()
    });

    // Store to database
    const date = new Date().toISOString().split('T')[0];
    this.stmtStoreCorrelation.run(s1, s2, correlation, lookback, date);

    return correlation;
  }

  _calculateReturns(prices) {
    const returns = [];
    for (let i = 0; i < prices.length - 1; i++) {
      returns.push({
        date: prices[i].date,
        return: (prices[i].price - prices[i + 1].price) / prices[i + 1].price
      });
    }
    return returns;
  }

  _alignReturns(returns1, returns2) {
    const map1 = new Map(returns1.map(r => [r.date, r.return]));
    const r1 = [], r2 = [];

    for (const r of returns2) {
      if (map1.has(r.date)) {
        r1.push(map1.get(r.date));
        r2.push(r.return);
      }
    }

    return { r1, r2 };
  }

  _pearsonCorrelation(x, y) {
    const n = x.length;
    if (n < 2) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      sumX2 += dx * dx;
      sumY2 += dy * dy;
    }

    const denominator = Math.sqrt(sumX2 * sumY2);
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Calculate correlation matrix for portfolio positions
   * @param {Array} positions - Array of {symbol, ...}
   * @returns {Object} Correlation analysis
   */
  calculatePortfolioCorrelationMatrix(positions) {
    const symbols = positions.map(p => p.symbol);
    const n = symbols.length;
    const matrix = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = new Array(n).fill(0);
      matrix[i][i] = 1;

      for (let j = i + 1; j < n; j++) {
        const corr = this.calculatePairwiseCorrelation(symbols[i], symbols[j]);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }

    // Calculate summary stats
    const correlations = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        correlations.push(matrix[i][j]);
      }
    }

    const avgCorrelation = correlations.length > 0
      ? correlations.reduce((a, b) => a + b, 0) / correlations.length
      : 0;
    const maxCorrelation = correlations.length > 0
      ? Math.max(...correlations)
      : 0;

    // Find highly correlated pairs
    const highlyCorrelated = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (matrix[i][j] > 0.7) {
          highlyCorrelated.push({
            symbol1: symbols[i],
            symbol2: symbols[j],
            correlation: matrix[i][j]
          });
        }
      }
    }

    return {
      matrix,
      symbols,
      avgCorrelation,
      maxCorrelation,
      highlyCorrelatedPairs: highlyCorrelated,
      diversificationScore: Math.max(0, 1 - avgCorrelation)
    };
  }

  /**
   * Check if new position would create high correlation
   * @param {string} newSymbol - Symbol to add
   * @param {Array} existingPositions - Current positions
   * @param {number} threshold - Correlation threshold
   * @returns {Object} Recommendation
   */
  checkNewPositionCorrelation(newSymbol, existingPositions, threshold = 0.7) {
    const highlyCorrelatedWith = [];
    let sumCorrelation = 0;
    let count = 0;

    for (const position of existingPositions) {
      const corr = this.calculatePairwiseCorrelation(newSymbol, position.symbol);
      sumCorrelation += corr;
      count++;

      if (corr > threshold) {
        highlyCorrelatedWith.push({
          symbol: position.symbol,
          correlation: corr
        });
      }
    }

    const avgCorrelation = count > 0 ? sumCorrelation / count : 0;
    const canAdd = highlyCorrelatedWith.length === 0 || avgCorrelation < 0.5;

    return {
      canAdd,
      highlyCorrelatedWith,
      avgCorrelationWithPortfolio: avgCorrelation,
      recommendation: canAdd
        ? 'Position adds diversification'
        : `High correlation with ${highlyCorrelatedWith.map(h => h.symbol).join(', ')} - consider reducing size`
    };
  }

  /**
   * Adjust position sizes based on correlations
   * @param {number} baseSize - Base position size
   * @param {string} newSymbol - New symbol
   * @param {Array} existingPositions - Current positions with sizes
   * @returns {Object} Size adjustments
   */
  adjustSizeForCorrelation(baseSize, newSymbol, existingPositions) {
    const correlationCheck = this.checkNewPositionCorrelation(newSymbol, existingPositions);
    let adjustedNewSize = baseSize;
    const existingAdjustments = [];

    for (const correlated of correlationCheck.highlyCorrelatedWith) {
      const corr = correlated.correlation;

      // Reduce both positions based on correlation
      let reduction = 0;
      if (corr > 0.8) {
        reduction = 0.30; // 30% reduction for very high correlation
      } else if (corr > 0.7) {
        reduction = 0.15; // 15% reduction for high correlation
      }

      if (reduction > 0) {
        adjustedNewSize *= (1 - reduction);

        // Find existing position and calculate its new size
        const existingPos = existingPositions.find(p => p.symbol === correlated.symbol);
        if (existingPos) {
          existingAdjustments.push({
            symbol: correlated.symbol,
            oldSize: existingPos.size || existingPos.weight,
            newSize: (existingPos.size || existingPos.weight) * (1 - reduction),
            reduction,
            reason: `Correlation ${(corr * 100).toFixed(0)}% with ${newSymbol}`
          });
        }
      }
    }

    // Store adjustments
    const date = new Date().toISOString().split('T')[0];
    if (adjustedNewSize !== baseSize) {
      this.stmtStoreAdjustment.run(
        date,
        newSymbol,
        baseSize,
        adjustedNewSize,
        'High correlation with existing positions',
        JSON.stringify(correlationCheck.highlyCorrelatedWith.map(h => h.symbol))
      );
    }

    return {
      adjustedNewSize,
      originalSize: baseSize,
      sizeReduction: 1 - (adjustedNewSize / baseSize),
      existingAdjustments,
      totalCorrelationPenalty: correlationCheck.avgCorrelationWithPortfolio
    };
  }

  /**
   * Get sector diversification analysis
   * @param {Array} positions - Positions with sector info
   * @returns {Object} Sector analysis
   */
  getSectorDiversification(positions) {
    const sectorWeights = {};
    const sectorCounts = {};
    let totalValue = 0;

    for (const pos of positions) {
      const company = this.stmtGetCompanyId.get(pos.symbol);
      const sector = company?.sector || 'Unknown';
      const value = pos.value || pos.marketValue || 1;

      sectorWeights[sector] = (sectorWeights[sector] || 0) + value;
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
      totalValue += value;
    }

    // Convert to percentages
    for (const sector in sectorWeights) {
      sectorWeights[sector] = sectorWeights[sector] / totalValue;
    }

    const maxSectorWeight = Math.max(...Object.values(sectorWeights));
    const numSectors = Object.keys(sectorWeights).length;

    const recommendations = [];
    for (const [sector, weight] of Object.entries(sectorWeights)) {
      if (weight > 0.30) {
        recommendations.push(`Reduce ${sector} exposure (${(weight * 100).toFixed(1)}% > 30% limit)`);
      }
    }

    if (numSectors < 3) {
      recommendations.push('Add positions in more sectors for diversification');
    }

    return {
      sectorWeights,
      sectorCounts,
      maxSectorWeight,
      numSectors,
      isSectorConcentrated: maxSectorWeight > 0.30,
      meetsMinSectors: numSectors >= 3,
      recommendations
    };
  }

  /**
   * Enforce all diversification constraints
   * @param {Array} positions - Current positions
   * @param {Object} newTrade - Proposed trade
   * @returns {Object} Constraint check result
   */
  enforceDiversificationConstraints(positions, newTrade) {
    const violations = [];
    const adjustments = [];

    // 1. Check sector concentration
    const sectorCheck = this.getSectorDiversification([...positions, {
      symbol: newTrade.symbol,
      value: newTrade.value || 10000
    }]);

    if (sectorCheck.isSectorConcentrated) {
      violations.push({
        type: 'SECTOR_CONCENTRATION',
        message: 'Sector would exceed 30% limit',
        severity: 'warning'
      });
    }

    if (!sectorCheck.meetsMinSectors && positions.length >= 5) {
      violations.push({
        type: 'SECTOR_DIVERSITY',
        message: 'Fewer than 3 sectors represented',
        severity: 'info'
      });
    }

    // 2. Check correlation
    const correlationCheck = this.checkNewPositionCorrelation(
      newTrade.symbol,
      positions,
      0.7
    );

    if (correlationCheck.highlyCorrelatedWith.length > 0) {
      violations.push({
        type: 'HIGH_CORRELATION',
        message: `Highly correlated with: ${correlationCheck.highlyCorrelatedWith.map(h => h.symbol).join(', ')}`,
        severity: 'warning'
      });

      // Add size adjustment
      const sizeAdj = this.adjustSizeForCorrelation(
        newTrade.size || 0.03,
        newTrade.symbol,
        positions
      );

      adjustments.push({
        symbol: newTrade.symbol,
        originalSize: sizeAdj.originalSize,
        adjustedSize: sizeAdj.adjustedNewSize,
        reason: 'Correlation adjustment'
      });

      adjustments.push(...sizeAdj.existingAdjustments);
    }

    const hasBlockingViolation = violations.some(v =>
      v.severity === 'critical' || (v.severity === 'warning' && v.type === 'SECTOR_CONCENTRATION')
    );

    return {
      approved: !hasBlockingViolation,
      violations,
      adjustments,
      sectorAnalysis: sectorCheck,
      correlationAnalysis: correlationCheck
    };
  }

  /**
   * Select optimal positions from candidates to minimize correlation
   * @param {Array} candidates - Candidate stocks with scores
   * @param {number} maxPositions - Maximum positions to select
   * @param {number} targetCorrelation - Target average correlation
   * @returns {Array} Selected symbols
   */
  optimizePortfolioCorrelation(candidates, maxPositions, targetCorrelation = 0.3) {
    // Sort by score descending
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    const selected = [];

    // Greedy selection: add next best score that doesn't exceed correlation target
    for (const candidate of sorted) {
      if (selected.length >= maxPositions) break;

      if (selected.length === 0) {
        selected.push(candidate);
        continue;
      }

      // Check correlation with selected positions
      let sumCorr = 0;
      let highCorr = false;

      for (const sel of selected) {
        const corr = this.calculatePairwiseCorrelation(candidate.symbol, sel.symbol);
        sumCorr += corr;
        if (corr > 0.7) highCorr = true;
      }

      const avgCorr = sumCorr / selected.length;

      // Add if doesn't create high correlation
      if (!highCorr && avgCorr < targetCorrelation + 0.2) {
        selected.push(candidate);
      } else if (selected.length < maxPositions / 2) {
        // Force add some positions even if correlated, to meet minimum
        selected.push(candidate);
      }
    }

    return selected;
  }
}

function createCorrelationManager(db) {
  return new CorrelationManager(db);
}

module.exports = { CorrelationManager, createCorrelationManager };
