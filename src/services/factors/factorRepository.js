// src/services/factors/factorRepository.js
// CRUD operations for user-defined factors

const crypto = require('crypto');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');
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
  constructor() {
    this._availableMetrics = null;
  }

  /**
   * Get available metrics for factor construction
   */
  async getAvailableMetrics() {
    if (this._availableMetrics) {
      return this._availableMetrics;
    }

    try {
      const database = await getDatabaseAsync();
      // available_metrics.is_active is INTEGER (0/1) in both SQLite and PostgreSQL
      const result = await database.query(`
        SELECT metric_code, metric_name, category, description, higher_is_better
        FROM available_metrics
        WHERE is_active = 1
        ORDER BY category, metric_name
      `);
      this._availableMetrics = result.rows;
    } catch (err) {
      // Table might not exist yet
      this._availableMetrics = [];
    }

    return this._availableMetrics;
  }

  /**
   * Get metric codes only
   */
  async getMetricCodes() {
    const metrics = await this.getAvailableMetrics();
    return metrics.map(m => m.metric_code);
  }

  /**
   * Create a new user-defined factor
   */
  async createFactor(data) {
    const {
      userId = null,
      name,
      formula,
      description = null,
      higherIsBetter = true,
      transformations = {}
    } = data;

    // Validate formula
    const availableMetrics = await this.getMetricCodes();
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
      const database = await getDatabaseAsync();
      await database.query(`
        INSERT INTO user_factors (
          id, user_id, name, formula, description,
          higher_is_better, required_metrics, transformations,
          is_valid, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        id,
        userId,
        name,
        formula,
        description,
        higherIsBetter,
        JSON.stringify(validation.requiredMetrics),
        JSON.stringify(transformations)
      ]);

      return {
        success: true,
        factor: await this.getFactorById(id)
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
  async getFactorById(id) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM user_factors WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) return null;

    return this._formatFactor(result.rows[0]);
  }

  /**
   * Get all factors for a user
   */
  async getUserFactors(userId, options = {}) {
    const { includeInactive = false, sortBy = 'created_at', order = 'DESC' } = options;

    let query = `
      SELECT * FROM user_factors
      WHERE user_id = $1 OR user_id IS NULL
    `;

    if (!includeInactive) {
      query += ' AND is_valid = true';
    }

    // Validate sort column to prevent SQL injection
    const validSortColumns = ['created_at', 'name', 'ic_tstat', 'wfe', 'uniqueness_score'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortColumn} ${sortOrder}`;

    const database = await getDatabaseAsync();
    const result = await database.query(query, [userId]);
    return result.rows.map(f => this._formatFactor(f));
  }

  /**
   * Get all active factors (for combining)
   */
  async getActiveFactors(userId = null) {
    const database = await getDatabaseAsync();
    // user_factors.is_active and is_valid are INTEGER (0/1) in both SQLite and PostgreSQL
    let query = `
      SELECT * FROM user_factors
      WHERE is_active = 1 AND is_valid = 1
    `;

    if (userId) {
      query += ' AND (user_id = $1 OR user_id IS NULL)';
      const result = await database.query(query, [userId]);
      return result.rows.map(f => this._formatFactor(f));
    }

    const result = await database.query(query);
    return result.rows.map(f => this._formatFactor(f));
  }

  /**
   * Update a factor
   */
  async updateFactor(id, updates) {
    const factor = await this.getFactorById(id);
    if (!factor) {
      return { success: false, error: 'Factor not found' };
    }

    const allowedUpdates = ['name', 'description', 'higher_is_better', 'transformations', 'is_active', 'notes'];
    const setClauses = [];
    const params = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
      if (allowedUpdates.includes(dbKey)) {
        setClauses.push(`${dbKey} = $${paramIndex}`);
        if (typeof value === 'object') {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return { success: false, error: 'No valid updates provided' };
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    try {
      const database = await getDatabaseAsync();
      await database.query(`
        UPDATE user_factors SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
      `, params);

      return { success: true, factor: await this.getFactorById(id) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Update factor formula (requires re-validation)
   */
  async updateFactorFormula(id, formula) {
    const availableMetrics = await this.getMetricCodes();
    const validation = validateFormula(formula, availableMetrics);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        unknownMetrics: validation.unknownMetrics
      };
    }

    try {
      const database = await getDatabaseAsync();

      // Get current formula to detect changes
      const currentResult = await database.query('SELECT formula FROM user_factors WHERE id = $1', [id]);
      if (currentResult.rows.length === 0) {
        return { success: false, error: 'Factor not found' };
      }

      const current = currentResult.rows[0];
      const formulaChanged = current.formula.trim() !== formula.trim();

      // Update formula and reset stats
      await database.query(`
        UPDATE user_factors SET
          formula = $1,
          required_metrics = $2,
          is_valid = true,
          validation_error = NULL,
          ic_stats = NULL,
          wfe = NULL,
          uniqueness_score = NULL,
          last_analyzed_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [formula, JSON.stringify(validation.requiredMetrics), id]);

      // CRITICAL: Clear cached values if formula changed
      let cachedValuesRemoved = 0;
      if (formulaChanged) {
        try {
          const deleteResult = await database.query(
            'DELETE FROM factor_values_cache WHERE factor_id = $1',
            [id]
          );

          cachedValuesRemoved = deleteResult.rowCount;
          console.log(`[Cache Invalidation] Cleared ${cachedValuesRemoved} cached values for factor ${id}`);
        } catch (cacheErr) {
          console.warn(`[Cache Warning] Could not clear cache for factor ${id}:`, cacheErr.message);
          // Don't fail the update if cache clear fails
        }
      }

      return {
        success: true,
        factor: await this.getFactorById(id),
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
  async deleteFactor(id) {
    try {
      const database = await getDatabaseAsync();

      // Check if factor exists first
      const checkResult = await database.query('SELECT id FROM user_factors WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
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
          await database.query(`DELETE FROM ${table} WHERE factor_id = $1`, [id]);
        } catch (tableErr) {
          // Table might not exist - that's OK, continue
          console.warn(`Could not delete from ${table}: ${tableErr.message}`);
        }
      }

      // Delete factor
      const result = await database.query('DELETE FROM user_factors WHERE id = $1', [id]);

      if (result.rowCount === 0) {
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
  async updateFactorStats(id, stats) {
    const {
      icStats = null,
      icTstat = null,
      icIr = null,
      wfe = null,
      uniquenessScore = null,
      turnoverMonthly = null
    } = stats;

    try {
      const database = await getDatabaseAsync();
      await database.query(`
        UPDATE user_factors SET
          ic_stats = $1,
          ic_tstat = $2,
          ic_ir = $3,
          wfe = $4,
          uniqueness_score = $5,
          turnover_monthly = $6,
          last_analyzed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
      `, [
        icStats ? JSON.stringify(icStats) : null,
        icTstat,
        icIr,
        wfe,
        uniquenessScore,
        turnoverMonthly,
        id
      ]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Toggle factor active status
   */
  async toggleActive(id, active) {
    try {
      const database = await getDatabaseAsync();
      await database.query(`
        UPDATE user_factors SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
      `, [active, id]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Store IC history for a factor
   */
  async storeICHistory(factorId, data) {
    const {
      calculationDate,
      ic1d, ic5d, ic21d, ic63d, ic126d, ic252d,
      tstat21d, pvalue21d,
      universeSize, universeType = 'ALL'
    } = data;

    try {
      const database = await getDatabaseAsync();
      await database.query(`
        INSERT INTO factor_ic_history (
          factor_id, calculation_date,
          ic_1d, ic_5d, ic_21d, ic_63d, ic_126d, ic_252d,
          tstat_21d, pvalue_21d,
          universe_size, universe_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        ON CONFLICT (factor_id, calculation_date) DO UPDATE SET
          ic_1d = EXCLUDED.ic_1d,
          ic_5d = EXCLUDED.ic_5d,
          ic_21d = EXCLUDED.ic_21d,
          ic_63d = EXCLUDED.ic_63d,
          ic_126d = EXCLUDED.ic_126d,
          ic_252d = EXCLUDED.ic_252d,
          tstat_21d = EXCLUDED.tstat_21d,
          pvalue_21d = EXCLUDED.pvalue_21d,
          universe_size = EXCLUDED.universe_size,
          universe_type = EXCLUDED.universe_type
      `, [
        factorId, calculationDate,
        ic1d, ic5d, ic21d, ic63d, ic126d, ic252d,
        tstat21d, pvalue21d,
        universeSize, universeType
      ]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get IC history for a factor
   */
  async getICHistory(factorId, options = {}) {
    const { limit = 100, universeType = null } = options;

    let query = `
      SELECT * FROM factor_ic_history
      WHERE factor_id = $1
    `;
    const params = [factorId];
    let paramIndex = 2;

    if (universeType) {
      query += ` AND universe_type = $${paramIndex}`;
      params.push(universeType);
      paramIndex++;
    }

    query += ` ORDER BY calculation_date DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const database = await getDatabaseAsync();
    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Store factor correlations
   */
  async storeCorrelations(factorId, data) {
    const {
      calculationDate,
      corrValue, corrQuality, corrMomentum, corrGrowth, corrSize, corrVolatility,
      userFactorCorrelations = {},
      vif,
      uniquenessScore,
      mostSimilarFactor
    } = data;

    try {
      const database = await getDatabaseAsync();
      await database.query(`
        INSERT INTO factor_correlations (
          factor_id, calculation_date,
          corr_value, corr_quality, corr_momentum, corr_growth, corr_size, corr_volatility,
          user_factor_correlations, vif, uniqueness_score, most_similar_factor, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        ON CONFLICT (factor_id, calculation_date) DO UPDATE SET
          corr_value = EXCLUDED.corr_value,
          corr_quality = EXCLUDED.corr_quality,
          corr_momentum = EXCLUDED.corr_momentum,
          corr_growth = EXCLUDED.corr_growth,
          corr_size = EXCLUDED.corr_size,
          corr_volatility = EXCLUDED.corr_volatility,
          user_factor_correlations = EXCLUDED.user_factor_correlations,
          vif = EXCLUDED.vif,
          uniqueness_score = EXCLUDED.uniqueness_score,
          most_similar_factor = EXCLUDED.most_similar_factor
      `, [
        factorId, calculationDate,
        corrValue, corrQuality, corrMomentum, corrGrowth, corrSize, corrVolatility,
        JSON.stringify(userFactorCorrelations), vif, uniquenessScore, mostSimilarFactor
      ]);

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Store backtest run
   */
  async storeBacktestRun(data) {
    const {
      factorId,
      userId,
      config,
      results
    } = data;

    const id = crypto.randomUUID();

    try {
      const database = await getDatabaseAsync();
      await database.query(`
        INSERT INTO factor_backtest_runs (
          id, factor_id, user_id, config,
          total_return, annualized_return, sharpe_ratio, max_drawdown,
          alpha, beta, is_ic, oos_ic, wfe,
          overfitting_flags, deflated_sharpe,
          equity_curve, period_returns, run_at, run_duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, $18)
      `, [
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
      ]);

      return { success: true, id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Get backtest runs for a factor
   */
  async getBacktestRuns(factorId, limit = 10) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM factor_backtest_runs
      WHERE factor_id = $1
      ORDER BY run_at DESC
      LIMIT $2
    `, [factorId, limit]);

    return result.rows.map(r => ({
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
      higherIsBetter: row.higher_is_better === true,
      requiredMetrics: JSON.parse(row.required_metrics || '[]'),
      transformations: JSON.parse(row.transformations || '{}'),
      icStats: JSON.parse(row.ic_stats || 'null'),
      icTstat: row.ic_tstat,
      icIr: row.ic_ir,
      wfe: row.wfe,
      uniquenessScore: row.uniqueness_score,
      turnoverMonthly: row.turnover_monthly,
      isActive: row.is_active === true,
      isValid: row.is_valid === true,
      validationError: row.validation_error,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAnalyzedAt: row.last_analyzed_at
    };
  }
}

module.exports = FactorRepository;
