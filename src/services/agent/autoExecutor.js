// src/services/agent/autoExecutor.js
// Auto-execution service for portfolio-specific trade execution
// Supports both automatic execution and pending approval workflow

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');
const { getPortfolioService } = require('../portfolio');

class AutoExecutor {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.portfolioService = null; // Lazy loaded to avoid circular dependency
  }

  /**
   * Get portfolio service instance (lazy loaded)
   */
  _getPortfolioService() {
    if (!this.portfolioService) {
      this.portfolioService = getPortfolioService();
    }
    return this.portfolioService;
  }

  /**
   * Process a recommendation for auto-execution
   * @param {Object} recommendation - The trading recommendation
   * @param {number} portfolioId - Portfolio ID
   * @returns {Object} Result of processing
   */
  async processRecommendation(recommendation, portfolioId) {
    const database = await getDatabaseAsync();

    // Get portfolio settings
    const settings = await database.query(
      `SELECT
        id,
        name,
        auto_execute,
        execution_threshold,
        max_auto_position_pct,
        require_confirmation,
        auto_execute_actions
      FROM portfolios
      WHERE id = $1`,
      [portfolioId]
    );

    if (!settings.rows[0]) {
      return { processed: false, error: 'Portfolio not found' };
    }
    const settingsRow = settings.rows[0];

    // Check if auto-execute is enabled
    if (!settingsRow.auto_execute) {
      return { processed: false, reason: 'Auto-execute disabled for this portfolio' };
    }

    // Check if action is allowed
    const allowedActions = (settingsRow.auto_execute_actions || 'buy,sell').toLowerCase().split(',');
    const action = recommendation.action.toLowerCase().replace('strong_', '');
    if (!allowedActions.includes(action)) {
      return { processed: false, reason: `Action '${action}' not allowed for auto-execute` };
    }

    // Check score threshold
    if (Math.abs(recommendation.score) < settingsRow.execution_threshold) {
      return {
        processed: false,
        reason: `Score ${recommendation.score.toFixed(3)} below threshold ${settingsRow.execution_threshold}`,
      };
    }

    // Get portfolio summary
    const portfolioResult = await database.query(
      `SELECT
        current_value as total_value,
        current_cash as total_cash,
        (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = portfolios.id AND shares > 0) as position_count
      FROM portfolios
      WHERE id = $1`,
      [portfolioId]
    );

    if (!portfolioResult.rows[0]) {
      return { processed: false, error: 'Could not get portfolio summary' };
    }
    const portfolio = portfolioResult.rows[0];

    // Calculate position size
    const totalValue = parseFloat(portfolio.total_value) + parseFloat(portfolio.total_cash);
    const maxPositionValue = totalValue * settingsRow.max_auto_position_pct;

    // Get current price
    const priceResult = await database.query(
      `SELECT close as price
      FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1`,
      [recommendation.companyId]
    );

    if (!priceResult.rows[0]) {
      return { processed: false, error: 'No price data available' };
    }
    const currentPrice = parseFloat(priceResult.rows[0].price);

    // Calculate shares
    let shares;
    let positionValue;
    const isBuy = action === 'buy';

    if (isBuy) {
      // For buys, use the smaller of suggested value and max auto position
      positionValue = Math.min(
        recommendation.suggestedValue || maxPositionValue,
        maxPositionValue,
        parseFloat(portfolio.total_cash) // Can't buy more than available cash
      );
      shares = Math.floor(positionValue / currentPrice);
    } else {
      // For sells, get existing position
      const positionResult = await database.query(
        `SELECT
          id,
          shares,
          average_cost,
          current_value
        FROM portfolio_positions
        WHERE portfolio_id = $1
          AND company_id = $2
          AND shares > 0`,
        [portfolioId, recommendation.companyId]
      );

      if (!positionResult.rows[0] || positionResult.rows[0].shares <= 0) {
        return { processed: false, reason: 'No existing position to sell' };
      }
      shares = parseFloat(positionResult.rows[0].shares);
      positionValue = shares * currentPrice;
    }

    if (shares <= 0) {
      return { processed: false, reason: 'Calculated shares is zero or negative' };
    }

    // Risk check
    const riskCheck = this._performRiskCheck(recommendation, portfolio, settingsRow, shares, currentPrice);
    if (!riskCheck.approved) {
      return { processed: false, reason: riskCheck.reason, riskCheck };
    }

    // Queue or execute based on confirmation setting
    if (settingsRow.require_confirmation) {
      const queuedId = await this._queueForApproval(recommendation, portfolioId, shares, currentPrice, positionValue);
      return {
        processed: true,
        queued: true,
        pendingExecutionId: queuedId,
        message: 'Trade queued for approval',
        shares,
        estimatedValue: positionValue,
      };
    } else {
      // Execute immediately
      const result = await this._executeImmediately(recommendation, portfolioId, shares, currentPrice);
      return {
        processed: true,
        executed: true,
        ...result,
      };
    }
  }

  /**
   * Perform risk checks before execution
   */
  _performRiskCheck(recommendation, portfolio, settings, shares, price) {
    const tradeValue = shares * price;
    const totalValue = parseFloat(portfolio.total_value) + parseFloat(portfolio.total_cash);

    // Check position concentration
    const positionPct = tradeValue / totalValue;
    if (positionPct > settings.max_auto_position_pct * 1.5) {
      return {
        approved: false,
        reason: `Position would be ${(positionPct * 100).toFixed(1)}% of portfolio, exceeding limit`,
      };
    }

    // Check if buying with enough cash
    const isBuy = recommendation.action.toLowerCase().includes('buy');
    if (isBuy && tradeValue > parseFloat(portfolio.total_cash)) {
      return {
        approved: false,
        reason: `Insufficient cash: need $${tradeValue.toFixed(2)}, have $${parseFloat(portfolio.total_cash).toFixed(2)}`,
      };
    }

    // Check confidence level
    if (recommendation.confidence < 0.4) {
      return {
        approved: false,
        reason: `Low confidence (${(recommendation.confidence * 100).toFixed(0)}%) - requires manual review`,
      };
    }

    return { approved: true };
  }

  /**
   * Queue trade for user approval
   */
  async _queueForApproval(recommendation, portfolioId, shares, price, value) {
    const database = await getDatabaseAsync();

    const portfolioResult = await database.query(
      `SELECT current_value as total_value, current_cash as total_cash
      FROM portfolios
      WHERE id = $1`,
      [portfolioId]
    );

    const portfolioData = portfolioResult.rows[0] || { total_value: 1, total_cash: 0 };
    const positionPct = value / (parseFloat(portfolioData.total_value) + parseFloat(portfolioData.total_cash));

    const result = await database.query(
      `INSERT INTO pending_executions (
        portfolio_id,
        recommendation_outcome_id,
        symbol,
        company_id,
        action,
        shares,
        estimated_price,
        estimated_value,
        signal_score,
        confidence,
        regime,
        position_pct,
        status,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', CURRENT_TIMESTAMP + INTERVAL '24 hours')
      RETURNING id`,
      [
        portfolioId,
        recommendation.trackedOutcomeId || null,
        recommendation.symbol,
        recommendation.companyId,
        recommendation.action.toUpperCase(),
        shares,
        price,
        value,
        recommendation.score,
        recommendation.confidence,
        recommendation.regime?.regime || 'UNKNOWN',
        positionPct
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Execute trade immediately (paper trading)
   * Adds position to portfolio via trade
   */
  async _executeImmediately(recommendation, portfolioId, shares, price) {
    const database = await getDatabaseAsync();

    // This would integrate with portfolio service to execute
    // For now, we queue with auto-approval
    const queuedId = await this._queueForApproval(recommendation, portfolioId, shares, price, shares * price);

    // Auto-approve
    await database.query(
      `UPDATE pending_executions
      SET status = $1,
          decided_at = CURRENT_TIMESTAMP,
          decided_by = $2
      WHERE id = $3`,
      ['approved', 'auto', queuedId]
    );

    return {
      pendingExecutionId: queuedId,
      message: 'Trade auto-approved for execution',
      shares,
      price,
      value: shares * price,
    };
  }

  /**
   * Approve a pending execution
   */
  async approveExecution(executionId, approvedBy = 'user') {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `SELECT
        pe.*,
        c.name as company_name,
        c.symbol,
        p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.id = $1`,
      [executionId]
    );

    if (!result.rows[0]) {
      return { success: false, error: 'Execution not found' };
    }
    const execution = result.rows[0];

    if (execution.status !== 'pending') {
      return { success: false, error: `Execution already ${execution.status}` };
    }

    await database.query(
      `UPDATE pending_executions
      SET status = $1,
          decided_at = CURRENT_TIMESTAMP,
          decided_by = $2
      WHERE id = $3`,
      ['approved', approvedBy, executionId]
    );

    return {
      success: true,
      message: 'Execution approved',
      execution: {
        id: executionId,
        symbol: execution.symbol,
        action: execution.action,
        shares: execution.shares,
        price: execution.estimated_price,
      },
    };
  }

  /**
   * Reject a pending execution
   */
  async rejectExecution(executionId, reason = null, rejectedBy = 'user') {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `SELECT
        pe.*,
        c.name as company_name,
        c.symbol,
        p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.id = $1`,
      [executionId]
    );

    if (!result.rows[0]) {
      return { success: false, error: 'Execution not found' };
    }
    const execution = result.rows[0];

    if (execution.status !== 'pending') {
      return { success: false, error: `Execution already ${execution.status}` };
    }

    await database.query(
      `UPDATE pending_executions
      SET status = 'rejected',
          decided_at = CURRENT_TIMESTAMP,
          decided_by = $1,
          rejection_reason = $2
      WHERE id = $3`,
      [rejectedBy, reason, executionId]
    );

    return {
      success: true,
      message: 'Execution rejected',
      execution: {
        id: executionId,
        symbol: execution.symbol,
        action: execution.action,
        reason,
      },
    };
  }

  /**
   * Execute an approved trade
   * Integrates with portfolio service to add/remove positions
   */
  async executeApprovedTrade(executionId, actualPrice = null, actualShares = null) {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `SELECT
        pe.*,
        c.name as company_name,
        c.symbol,
        p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.id = $1`,
      [executionId]
    );

    if (!result.rows[0]) {
      return { success: false, error: 'Execution not found' };
    }
    const execution = result.rows[0];

    if (execution.status !== 'approved') {
      return { success: false, error: `Execution must be approved first (current: ${execution.status})` };
    }

    const price = actualPrice || parseFloat(execution.estimated_price);
    const shares = actualShares || parseFloat(execution.shares);
    const portfolioService = this._getPortfolioService();

    try {
      let tradeResult;
      const action = execution.action.toUpperCase();
      const isBuy = action === 'BUY' || action === 'STRONG_BUY';

      if (isBuy) {
        // Execute buy through portfolio service
        tradeResult = await portfolioService.executeBuy(execution.portfolio_id, {
          companyId: execution.company_id,
          shares: shares,
          pricePerShare: price,
          fees: 0,
          notes: `AI Agent recommendation #${executionId}: ${action}`
        });
      } else {
        // Execute sell through portfolio service
        tradeResult = await portfolioService.executeSell(execution.portfolio_id, {
          companyId: execution.company_id,
          shares: shares,
          pricePerShare: price,
          fees: 0,
          notes: `AI Agent recommendation #${executionId}: ${action}`
        });
      }

      // Mark as executed in pending_executions table
      await database.query(
        `UPDATE pending_executions
        SET status = 'executed',
            executed_at = CURRENT_TIMESTAMP,
            executed_price = $1,
            executed_shares = $2
        WHERE id = $3`,
        [price, shares, executionId]
      );

      // Link the recommendation outcome if available
      if (execution.recommendation_outcome_id) {
        await this._updateRecommendationOutcome(execution.recommendation_outcome_id, {
          executed: true,
          executedAt: new Date().toISOString(),
          executedPrice: price,
          executedShares: shares,
          transactionId: tradeResult.transactionId
        });
      }

      return {
        success: true,
        message: 'Trade executed successfully',
        trade: {
          id: executionId,
          symbol: execution.symbol,
          action: execution.action,
          shares,
          price,
          value: shares * price,
          transactionId: tradeResult.transactionId,
          positionId: tradeResult.positionId
        },
        portfolioUpdate: {
          newCashBalance: tradeResult.newCashBalance,
          totalShares: tradeResult.shares
        }
      };
    } catch (error) {
      // Mark as failed
      await database.query(
        `UPDATE pending_executions
        SET status = 'failed',
            notes = $1
        WHERE id = $2`,
        [`Execution failed: ${error.message}`, executionId]
      );

      return {
        success: false,
        error: `Trade execution failed: ${error.message}`,
        executionId
      };
    }
  }

  /**
   * Update recommendation outcome with execution details
   */
  async _updateRecommendationOutcome(outcomeId, details) {
    try {
      const database = await getDatabaseAsync();
      await database.query(
        `UPDATE recommendation_outcomes
        SET executed = true,
            executed_at = $1,
            executed_price = $2,
            executed_shares = $3,
            transaction_id = $4
        WHERE id = $5`,
        [
          details.executedAt,
          details.executedPrice,
          details.executedShares,
          details.transactionId,
          outcomeId
        ]
      );
    } catch (error) {
      // Non-critical - log but don't fail the trade
      console.warn(`Could not update recommendation outcome: ${error.message}`);
    }
  }

  /**
   * Get pending executions for a portfolio
   */
  async getPendingExecutions(portfolioId = null) {
    const database = await getDatabaseAsync();

    if (portfolioId) {
      const result = await database.query(
        `SELECT
          pe.*,
          c.name as company_name,
          p.name as portfolio_name
        FROM pending_executions pe
        LEFT JOIN companies c ON pe.company_id = c.id
        LEFT JOIN portfolios p ON pe.portfolio_id = p.id
        WHERE pe.portfolio_id = $1
          AND pe.status = 'pending'
        ORDER BY pe.created_at DESC`,
        [portfolioId]
      );
      return result.rows;
    }
    const result = await database.query(
      `SELECT
        pe.*,
        c.name as company_name,
        p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.status = 'pending'
      ORDER BY pe.created_at DESC`
    );
    return result.rows;
  }

  /**
   * Get execution settings for a portfolio
   */
  async getPortfolioSettings(portfolioId) {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `SELECT
        id,
        name,
        auto_execute,
        execution_threshold,
        max_auto_position_pct,
        require_confirmation,
        auto_execute_actions
      FROM portfolios
      WHERE id = $1`,
      [portfolioId]
    );

    if (!result.rows[0]) {
      return null;
    }
    const settings = result.rows[0];

    return {
      portfolioId: settings.id,
      portfolioName: settings.name,
      autoExecute: !!settings.auto_execute,
      executionThreshold: settings.execution_threshold,
      maxAutoPositionPct: settings.max_auto_position_pct,
      requireConfirmation: !!settings.require_confirmation,
      autoExecuteActions: (settings.auto_execute_actions || 'buy,sell').split(','),
    };
  }

  /**
   * Update execution settings for a portfolio
   */
  async updatePortfolioSettings(portfolioId, settings) {
    const database = await getDatabaseAsync();

    const {
      autoExecute,
      executionThreshold,
      maxAutoPositionPct,
      requireConfirmation,
      autoExecuteActions,
    } = settings;

    await database.query(
      `UPDATE portfolios
      SET auto_execute = $1,
          execution_threshold = $2,
          max_auto_position_pct = $3,
          require_confirmation = $4,
          auto_execute_actions = $5
      WHERE id = $6`,
      [
        autoExecute ? true : false,
        executionThreshold || 0.3,
        maxAutoPositionPct || 0.05,
        requireConfirmation !== false ? true : false,
        Array.isArray(autoExecuteActions) ? autoExecuteActions.join(',') : (autoExecuteActions || 'buy,sell'),
        portfolioId
      ]
    );

    return this.getPortfolioSettings(portfolioId);
  }

  /**
   * Approve all pending executions for a portfolio
   */
  async approveAllPending(portfolioId, approvedBy = 'user') {
    const pending = await this.getPendingExecutions(portfolioId);
    const results = [];

    for (const exec of pending) {
      const result = await this.approveExecution(exec.id, approvedBy);
      results.push({
        id: exec.id,
        symbol: exec.symbol,
        ...result,
      });
    }

    return {
      approved: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Reject all pending executions for a portfolio
   */
  async rejectAllPending(portfolioId, reason = 'Batch rejection', rejectedBy = 'user') {
    const pending = await this.getPendingExecutions(portfolioId);
    const results = [];

    for (const exec of pending) {
      const result = await this.rejectExecution(exec.id, reason, rejectedBy);
      results.push({
        id: exec.id,
        symbol: exec.symbol,
        ...result,
      });
    }

    return {
      rejected: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Expire old pending executions
   */
  async expireOldExecutions() {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `UPDATE pending_executions
      SET status = 'expired'
      WHERE status = 'pending'
        AND expires_at < CURRENT_TIMESTAMP`
    );
    return { expired: result.rowCount };
  }

  /**
   * Get execution history for a portfolio
   */
  async getExecutionHistory(portfolioId, limit = 50) {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `SELECT
        pe.*,
        c.name as company_name,
        c.symbol
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      WHERE pe.portfolio_id = $1
        AND pe.status IN ('executed', 'rejected', 'expired')
      ORDER BY pe.decided_at DESC, pe.created_at DESC
      LIMIT $2`,
      [portfolioId, limit]
    );

    return result.rows;
  }

  /**
   * Get execution statistics for a portfolio
   */
  async getExecutionStats(portfolioId) {
    const database = await getDatabaseAsync();

    const result = await database.query(
      `SELECT
        status,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'executed' THEN executed_shares * executed_price ELSE 0 END) as total_value
      FROM pending_executions
      WHERE portfolio_id = $1
      GROUP BY status`,
      [portfolioId]
    );

    const rows = result.rows;
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      executed: 0,
      expired: 0,
      totalExecutedValue: 0,
    };

    for (const row of rows) {
      stats[row.status] = parseInt(row.count);
      if (row.status === 'executed') {
        stats.totalExecutedValue = parseFloat(row.total_value) || 0;
      }
    }

    return stats;
  }

  /**
   * Execute all approved trades for a portfolio (or all portfolios)
   * @param {number|null} portfolioId - Portfolio ID or null for all
   * @returns {Object} Execution results
   */
  async executeAllApproved(portfolioId = null) {
    const database = await getDatabaseAsync();

    // Get approved executions
    const result = portfolioId
      ? await database.query(
          `SELECT id FROM pending_executions
          WHERE portfolio_id = $1 AND status = 'approved'
          ORDER BY created_at ASC`,
          [portfolioId]
        )
      : await database.query(
          `SELECT id FROM pending_executions
          WHERE status = 'approved'
          ORDER BY created_at ASC`
        );

    const approved = result.rows;
    const results = [];

    for (const exec of approved) {
      const execResult = await this.executeApprovedTrade(exec.id);
      results.push({
        executionId: exec.id,
        ...execResult,
      });
    }

    return {
      executed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      totalValue: results
        .filter(r => r.success)
        .reduce((sum, r) => sum + (r.trade?.value || 0), 0),
      results,
    };
  }

  /**
   * Submit a new recommendation from TradingAgent
   * This is the entry point for AI-generated trade recommendations
   * @param {Object} recommendation - The trading recommendation
   * @returns {Object} Result of submission
   */
  async submitRecommendation(recommendation) {
    const database = await getDatabaseAsync();

    const {
      portfolioId,
      symbol,
      companyId,
      action,
      shares,
      price,
      score,
      confidence,
      regime,
      reasoning,
      signals,
      targetPrice,
      stopLoss
    } = recommendation;

    // Validate required fields
    if (!portfolioId || !symbol || !action) {
      return {
        success: false,
        error: 'Missing required fields: portfolioId, symbol, action'
      };
    }

    // Get company ID if not provided
    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId) {
      const companyResult = await database.query(
        `SELECT id, symbol, name FROM companies WHERE LOWER(symbol) = LOWER($1)`,
        [symbol]
      );
      if (!companyResult.rows[0]) {
        return { success: false, error: `Company not found: ${symbol}` };
      }
      resolvedCompanyId = companyResult.rows[0].id;
    }

    // Get current price if not provided
    let resolvedPrice = price;
    if (!resolvedPrice) {
      const priceResult = await database.query(
        `SELECT close as price
        FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1`,
        [resolvedCompanyId]
      );
      if (!priceResult.rows[0]) {
        return { success: false, error: `No price data for ${symbol}` };
      }
      resolvedPrice = parseFloat(priceResult.rows[0].price);
    }

    // Calculate shares if not provided
    let resolvedShares = shares;
    if (!resolvedShares) {
      const portfolioResult = await database.query(
        `SELECT current_value as total_value, current_cash as total_cash
        FROM portfolios
        WHERE id = $1`,
        [portfolioId]
      );
      if (!portfolioResult.rows[0]) {
        return { success: false, error: 'Portfolio not found' };
      }
      const portfolio = portfolioResult.rows[0];

      const settingsResult = await database.query(
        `SELECT max_auto_position_pct FROM portfolios WHERE id = $1`,
        [portfolioId]
      );
      const maxPositionPct = settingsResult.rows[0]?.max_auto_position_pct || 0.05;
      const totalValue = parseFloat(portfolio.total_value) + parseFloat(portfolio.total_cash);
      const maxValue = totalValue * maxPositionPct;
      resolvedShares = Math.floor(maxValue / resolvedPrice);
    }

    if (resolvedShares <= 0) {
      return { success: false, error: 'Calculated shares is zero or negative' };
    }

    // Create the recommendation object for processing
    const fullRecommendation = {
      symbol,
      companyId: resolvedCompanyId,
      action,
      score: score || 0.5,
      confidence: confidence || 0.6,
      regime: regime || { regime: 'UNKNOWN' },
      suggestedValue: resolvedShares * resolvedPrice,
      reasoning,
      signals,
      targetPrice,
      stopLoss
    };

    // Process through the standard flow
    const result = await this.processRecommendation(fullRecommendation, portfolioId);

    return {
      success: result.processed,
      ...result,
      recommendation: {
        symbol,
        action,
        shares: resolvedShares,
        price: resolvedPrice,
        value: resolvedShares * resolvedPrice,
        confidence,
        score
      }
    };
  }

  /**
   * Get approved executions waiting to be executed
   */
  async getApprovedExecutions(portfolioId = null) {
    const database = await getDatabaseAsync();

    if (portfolioId) {
      const result = await database.query(
        `SELECT pe.*, c.name as company_name, p.name as portfolio_name
        FROM pending_executions pe
        LEFT JOIN companies c ON pe.company_id = c.id
        LEFT JOIN portfolios p ON pe.portfolio_id = p.id
        WHERE pe.portfolio_id = $1 AND pe.status = 'approved'
        ORDER BY pe.created_at DESC`,
        [portfolioId]
      );
      return result.rows;
    }

    const result = await database.query(
      `SELECT pe.*, c.name as company_name, p.name as portfolio_name
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      LEFT JOIN portfolios p ON pe.portfolio_id = p.id
      WHERE pe.status = 'approved'
      ORDER BY pe.created_at DESC`
    );
    return result.rows;
  }
}

module.exports = { AutoExecutor };
