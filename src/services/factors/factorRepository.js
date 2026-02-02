// src/services/factors/factorRepository.js
// CRUD operations for user-defined factors

const crypto = require('crypto');
const { validateFormula } = require('./factorFormulaParser');

/**
 * FactorRepository
 *
 * Manages user-defined factors:
 * - Create/Read/Update/Delete factors
 * - Validate formulas
 * - Track factor performance over time
 */
class FactorRepository {
  constructor(db) {
    this.db = db;
    this._availableMetrics = null;
  }

  /**
   * Get available metrics for factor construction
   */
  getAvailableMetrics() {
    if (this._availableMetrics) {
      return this._availableMetrics;
    }

    try {
      this._availableMetrics = this.db.prepare(`
        SELECT metric_code, metric_name, category, description, higher_is_better
        FROM available_metrics
        WHERE is_active = 1
        ORDER BY category, metric_name
      `).all();
    } catch (err) {
      // Table might not exist yet
      this._availableMetrics = [];
    }

    return this._availableMetrics;
  }

  /**
   * Get metric codes only
   */
  getMetricCodes() {
    return this.getAvailableMetrics().map(m => m.metric_code);
  }

  /**
   * Create a new user-defined factor
   */
  createFactor(data) {
    const {
      userId = null,
      name,
      formula,
      description = null,
      higherIsBetter = true,
      transformations = {}
    } = data;

    // Validate formula
    const availableMetrics = this.getMetricCodes();
    const validation = validateFormula(formula, availableMetrics);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        unknownMetrics: validation.unknownMetrics
      };
    }

    const id = crypto.randomUUID();

    try {
      this.db.prepare(`
        INSERT INTO user_factors (
          id, user_id, name, formula, description,
          higher_is_better, required_metrics, transformations,
          is_valid, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(
        id,
        userId,
        name,
        formula,
        description,
        higherIsBetter ? 1 : 0,
        JSON.stringify(validation.requiredMetrics),
        JSON.stringify(transformations)
      );

      return {
        success: true,
        factor: this.getFactorById(id)
      };
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Get factor by ID
   */
  getFactorById(id) {
    const factor = this.db.prepare(`
      SELECT * FROM user_factors WHERE id = ?
    `).get(id);

    if (!factor) return null;

    return this._formatFactor(factor);
  }

  /**
   * Get all factors for a user
   */
  getUserFactors(userId, options = {}) {
    const { includeInactive = false, sortBy = 'created_at', order = 'DESC' } = options;

    let query = `
      SELECT * FROM user_factors
      WHERE user_id = ? OR user_id IS NULL
    `;

    if (!includeInactive) {
      query += ' AND is_valid = 1';
    }

    // Validate sort column to prevent SQL injection
    const validSortColumns = ['created_at', 'name', 'ic_tstat', 'wfe', 'uniqueness_score'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortColumn} ${sortOrder}`;

    const factors = this.db.prepare(query).all(userId);
    return factors.map(f => this._formatFactor(f));
  }

  /**
   * Get all active factors (for combining)
   */
  getActiveFactors(userId = null) {
    let query = `
      SELECT * FROM user_factors
      WHERE is_active = 1 AND is_valid = 1
    `;

    if (userId) {
      query += ' AND (user_id = ? OR user_id IS NULL)';
      return this.db.prepare(query).all(userId).map(f => this._formatFactor(f));
    }

    return this.db.prepare(query).all().map(f => this._formatFactor(f));
  }

  /**
   * Update a factor
   */
  updateFactor(id, updates) {
    const factor = this.getFactorById(id);
    if (!factor) {
      return { success: false, error: 'Factor not found' };
    }

    const allowedUpdates = ['name', 'description', 'higher_is_better', 'transformations', 'is_active', 'notes'];
    const setClauses = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
      if (allowedUpdates.includes(dbKey)) {
        setClauses.push(`${dbKey} = ?`);
        if (typeof value === 'object') {
          params.push(JSON.stringify(value));
        } else if (typeof value === 'boolean') {
          params.push(value ? 1 : 0);
        } else {
          params.push(value);
        }
      }
    }

    if (setClauses.length === 0) {
      return { success: false, error: 'No valid updates provided' };
    }

    setClauses.push('updated_at = datetime(\'now\')');
    params.push(id);

    try {
      this.db.prepare(`
        UPDATE user_factors SET ${setClauses.join(', ')} WHERE id = ?
      `).run(...params);

      return { success: true, factor: this.getFactorById(id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Update factor formula (requires re-validation)
   */
  updateFactorFormula(id, formula) {
    const availableMetrics = this.getMetricCodes();
    const validation = validateFormula(formula, availableMetrics);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        unknownMetrics: validation.unknownMetrics
      };
    }

    try {
      // Get current formula to detect changes
      const current = this.db.prepare('SELECT formula FROM user_factors WHERE id = ?').get(id);
      if (!current) {
        return { success: false, error: 'Factor not found' };
      }

      const formulaChanged = current.formula.trim() !== formula.trim();

      // Update formula and reset stats
      this.db.prepare(`
        UPDATE user_factors SET
          formula = ?,
          required_metrics = ?,
          is_valid = 1,
          validation_error = NULL,
          ic_stats = NULL,
          wfe = NULL,
          uniqueness_score = NULL,
          last_analyzed_at = NULL,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(formula, JSON.stringify(validation.requiredMetrics), id);

      // CRITICAL: Clear cached values if formula changed
      let cachedValuesRemoved = 0;
      if (formulaChanged) {
        try {
          const deleteResult = this.db.prepare(
            'DELETE FROM factor_values_cache WHERE factor_id = ?'
          ).run(id);

          cachedValuesRemoved = deleteResult.changes;
          console.log(`[Cache Invalidation] Cleared ${cachedValuesRemoved} cached values for factor ${id}`);
        } catch (cacheErr) {
          console.warn(`[Cache Warning] Could not clear cache for factor ${id}:`, cacheErr.message);
          // Don't fail the update if cache clear fails
        }
      }

      return {
        success: true,
        factor: this.getFactorById(id),
        cacheCleared: formulaChanged,
        cachedValuesRemoved
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Delete a factor
   */
  deleteFactor(id) {
    try {
      // Check if factor exists first
      const factor = this.db.prepare('SELECT id FROM user_factors WHERE id = ?').get(id);
      if (!factor) {
        return { success: false, error: 'Factor not found' };
      }

      // Delete related data - wrap in try/catch as tables may not exist
      const relatedTables = [
        'factor_values_cache',
        'factor_ic_history',
        'factor_correlations',
        'factor_signals'
      ];

      for (const table of relatedTables) {
        try {
          this.db.prepare(`DELETE FROM ${table} WHERE factor_id = ?`).run(id);
        } catch (tableErr) {
          // Table might not exist - that's OK, continue
          console.warn(`Could not delete from ${table}: ${tableErr.message}`);
        }
      }

      // Delete factor
      const result = this.db.prepare('DELETE FROM user_factors WHERE id = ?').run(id);

      if (result.changes === 0) {
        return { success: false, error: 'Factor could not be deleted' };
      }

      return { success: true, deleted: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Update factor statistics after IC analysis
   */
  updateFactorStats(id, stats) {
    const {
      icStats = null,
      icTstat = null,
      icIr = null,
      wfe = null,
      uniquenessScore = null,
      turnoverMonthly = null
    } = stats;

    try {
      this.db.prepare(`
        UPDATE user_factors SET
          ic_stats = ?,
          ic_tstat = ?,
          ic_ir = ?,
          wfe = ?,
          uniqueness_score = ?,
          turnover_monthly = ?,
          last_analyzed_at = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        icStats ? JSON.stringify(icStats) : null,
        icTstat,
        icIr,
        wfe,
        uniquenessScore,
        turnoverMonthly,
        id
      );

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Toggle factor active status
   */
  toggleActive(id, active) {
    try {
      this.db.prepare(`
        UPDATE user_factors SET is_active = ?, updated_at = datetime('now') WHERE id = ?
      `).run(active ? 1 : 0, id);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Store IC history for a factor
   */
  storeICHistory(factorId, data) {
    const {
      calculationDate,
      ic1d, ic5d, ic21d, ic63d, ic126d, ic252d,
      tstat21d, pvalue21d,
      universeSize, universeType = 'ALL'
    } = data;

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO factor_ic_history (
          factor_id, calculation_date,
          ic_1d, ic_5d, ic_21d, ic_63d, ic_126d, ic_252d,
          tstat_21d, pvalue_21d,
          universe_size, universe_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        factorId, calculationDate,
        ic1d, ic5d, ic21d, ic63d, ic126d, ic252d,
        tstat21d, pvalue21d,
        universeSize, universeType
      );

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get IC history for a factor
   */
  getICHistory(factorId, options = {}) {
    const { limit = 100, universeType = null } = options;

    let query = `
      SELECT * FROM factor_ic_history
      WHERE factor_id = ?
    `;
    const params = [factorId];

    if (universeType) {
      query += ' AND universe_type = ?';
      params.push(universeType);
    }

    query += ' ORDER BY calculation_date DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Store factor correlations
   */
  storeCorrelations(factorId, data) {
    const {
      calculationDate,
      corrValue, corrQuality, corrMomentum, corrGrowth, corrSize, corrVolatility,
      userFactorCorrelations = {},
      vif,
      uniquenessScore,
      mostSimilarFactor
    } = data;

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO factor_correlations (
          factor_id, calculation_date,
          corr_value, corr_quality, corr_momentum, corr_growth, corr_size, corr_volatility,
          user_factor_correlations, vif, uniqueness_score, most_similar_factor, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        factorId, calculationDate,
        corrValue, corrQuality, corrMomentum, corrGrowth, corrSize, corrVolatility,
        JSON.stringify(userFactorCorrelations), vif, uniquenessScore, mostSimilarFactor
      );

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Store backtest run
   */
  storeBacktestRun(data) {
    const {
      factorId,
      userId,
      config,
      results
    } = data;

    const id = crypto.randomUUID();

    try {
      this.db.prepare(`
        INSERT INTO factor_backtest_runs (
          id, factor_id, user_id, config,
          total_return, annualized_return, sharpe_ratio, max_drawdown,
          alpha, beta, is_ic, oos_ic, wfe,
          overfitting_flags, deflated_sharpe,
          equity_curve, period_returns, run_at, run_duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).run(
        id,
        factorId,
        userId,
        JSON.stringify(config),
        results.totalReturn,
        results.annualizedReturn,
        results.sharpeRatio,
        results.maxDrawdown,
        results.alpha,
        results.beta,
        results.isIC,
        results.oosIC,
        results.wfe,
        results.overfittingFlags ? JSON.stringify(results.overfittingFlags) : null,
        results.deflatedSharpe,
        results.equityCurve ? JSON.stringify(results.equityCurve) : null,
        results.periodReturns ? JSON.stringify(results.periodReturns) : null,
        results.runDurationMs
      );

      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get backtest runs for a factor
   */
  getBacktestRuns(factorId, limit = 10) {
    const runs = this.db.prepare(`
      SELECT * FROM factor_backtest_runs
      WHERE factor_id = ?
      ORDER BY run_at DESC
      LIMIT ?
    `).all(factorId, limit);

    return runs.map(r => ({
      ...r,
      config: JSON.parse(r.config || '{}'),
      overfittingFlags: JSON.parse(r.overfitting_flags || '[]'),
      equityCurve: JSON.parse(r.equity_curve || '[]'),
      periodReturns: JSON.parse(r.period_returns || '[]')
    }));
  }

  /**
   * Format factor from database row
   */
  _formatFactor(row) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      formula: row.formula,
      description: row.description,
      higherIsBetter: row.higher_is_better === 1,
      requiredMetrics: JSON.parse(row.required_metrics || '[]'),
      transformations: JSON.parse(row.transformations || '{}'),
      icStats: JSON.parse(row.ic_stats || 'null'),
      icTstat: row.ic_tstat,
      icIr: row.ic_ir,
      wfe: row.wfe,
      uniquenessScore: row.uniqueness_score,
      turnoverMonthly: row.turnover_monthly,
      isActive: row.is_active === 1,
      isValid: row.is_valid === 1,
      validationError: row.validation_error,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAnalyzedAt: row.last_analyzed_at
    };
  }
}

module.exports = FactorRepository;
