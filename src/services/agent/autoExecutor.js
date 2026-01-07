// src/services/agent/autoExecutor.js
// Auto-execution service for portfolio-specific trade execution
// Supports both automatic execution and pending approval workflow

const { getPortfolioService } = require('../portfolio');

class AutoExecutor {
  constructor(db) {
    this.db = db;
    this.portfolioService = null; // Lazy loaded to avoid circular dependency
    this._prepareStatements();
  }

  /**
   * Get portfolio service instance (lazy loaded)
   */
  _getPortfolioService() {
    if (!this.portfolioService) {
      this.portfolioService = getPortfolioService(this.db);
    }
    return this.portfolioService;
  }

  _prepareStatements() {
    this.stmts = {
      // Get portfolio execution settings
      getPortfolioSettings: this.db.prepare(`
        SELECT
          id,
          name,
          auto_execute,
          execution_threshold,
          max_auto_position_pct,
          require_confirmation,
          auto_execute_actions
        FROM portfolios
        WHERE id = ?
      `),

      // Get portfolio summary for position sizing
      getPortfolioSummary: this.db.prepare(`
        SELECT
          current_value as total_value,
          current_cash as total_cash,
          (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = portfolios.id AND shares > 0) as position_count
        FROM portfolios
        WHERE id = ?
      `),

      // Check existing position
      getExistingPosition: this.db.prepare(`
        SELECT
          id,
          shares,
          average_cost,
          current_value
        FROM portfolio_positions
        WHERE portfolio_id = ?
          AND company_id = ?
          AND shares > 0
      `),

      // Get current price
      getCurrentPrice: this.db.prepare(`
        SELECT close as price
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `),

      // Queue pending execution
      queueExecution: this.db.prepare(`
        INSERT INTO pending_executions (
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now', '+24 hours'))
      `),

      // Get pending executions
      getPendingExecutions: this.db.prepare(`
        SELECT
          pe.*,
          c.name as company_name,
          p.name as portfolio_name
        FROM pending_executions pe
        LEFT JOIN companies c ON pe.company_id = c.id
        LEFT JOIN portfolios p ON pe.portfolio_id = p.id
        WHERE pe.portfolio_id = ?
          AND pe.status = 'pending'
        ORDER BY pe.created_at DESC
      `),

      // Get all pending executions
      getAllPendingExecutions: this.db.prepare(`
        SELECT
          pe.*,
          c.name as company_name,
          p.name as portfolio_name
        FROM pending_executions pe
        LEFT JOIN companies c ON pe.company_id = c.id
        LEFT JOIN portfolios p ON pe.portfolio_id = p.id
        WHERE pe.status = 'pending'
        ORDER BY pe.created_at DESC
      `),

      // Update execution status
      updateExecutionStatus: this.db.prepare(`
        UPDATE pending_executions
        SET status = ?,
            decided_at = datetime('now'),
            decided_by = ?
        WHERE id = ?
      `),

      // Reject execution
      rejectExecution: this.db.prepare(`
        UPDATE pending_executions
        SET status = 'rejected',
            decided_at = datetime('now'),
            decided_by = ?,
            rejection_reason = ?
        WHERE id = ?
      `),

      // Mark as executed
      markExecuted: this.db.prepare(`
        UPDATE pending_executions
        SET status = 'executed',
            executed_at = datetime('now'),
            executed_price = ?,
            executed_shares = ?
        WHERE id = ?
      `),

      // Expire old pending executions
      expireOldExecutions: this.db.prepare(`
        UPDATE pending_executions
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at < datetime('now')
      `),

      // Get execution by ID
      getExecution: this.db.prepare(`
        SELECT
          pe.*,
          c.name as company_name,
          c.symbol,
          p.name as portfolio_name
        FROM pending_executions pe
        LEFT JOIN companies c ON pe.company_id = c.id
        LEFT JOIN portfolios p ON pe.portfolio_id = p.id
        WHERE pe.id = ?
      `),

      // Update portfolio execution settings
      updatePortfolioSettings: this.db.prepare(`
        UPDATE portfolios
        SET auto_execute = ?,
            execution_threshold = ?,
            max_auto_position_pct = ?,
            require_confirmation = ?,
            auto_execute_actions = ?
        WHERE id = ?
      `),

      // Get company by symbol
      getCompany: this.db.prepare(`
        SELECT id, symbol, name FROM companies WHERE symbol = ? COLLATE NOCASE
      `),
    };
  }

  /**
   * Process a recommendation for auto-execution
   * @param {Object} recommendation - The trading recommendation
   * @param {number} portfolioId - Portfolio ID
   * @returns {Object} Result of processing
   */
  processRecommendation(recommendation, portfolioId) {
    // Get portfolio settings
    const settings = this.stmts.getPortfolioSettings.get(portfolioId);
    if (!settings) {
      return { processed: false, error: 'Portfolio not found' };
    }

    // Check if auto-execute is enabled
    if (!settings.auto_execute) {
      return { processed: false, reason: 'Auto-execute disabled for this portfolio' };
    }

    // Check if action is allowed
    const allowedActions = (settings.auto_execute_actions || 'buy,sell').toLowerCase().split(',');
    const action = recommendation.action.toLowerCase().replace('strong_', '');
    if (!allowedActions.includes(action)) {
      return { processed: false, reason: `Action '${action}' not allowed for auto-execute` };
    }

    // Check score threshold
    if (Math.abs(recommendation.score) < settings.execution_threshold) {
      return {
        processed: false,
        reason: `Score ${recommendation.score.toFixed(3)} below threshold ${settings.execution_threshold}`,
      };
    }

    // Get portfolio summary
    const portfolio = this.stmts.getPortfolioSummary.get(portfolioId);
    if (!portfolio) {
      return { processed: false, error: 'Could not get portfolio summary' };
    }

    // Calculate position size
    const totalValue = portfolio.total_value + portfolio.total_cash;
    const maxPositionValue = totalValue * settings.max_auto_position_pct;

    // Get current price
    const priceData = this.stmts.getCurrentPrice.get(recommendation.companyId);
    if (!priceData) {
      return { processed: false, error: 'No price data available' };
    }
    const currentPrice = priceData.price;

    // Calculate shares
    let shares;
    let positionValue;
    const isBuy = action === 'buy';

    if (isBuy) {
      // For buys, use the smaller of suggested value and max auto position
      positionValue = Math.min(
        recommendation.suggestedValue || maxPositionValue,
        maxPositionValue,
        portfolio.total_cash // Can't buy more than available cash
      );
      shares = Math.floor(positionValue / currentPrice);
    } else {
      // For sells, get existing position
      const position = this.stmts.getExistingPosition.get(portfolioId, recommendation.companyId);
      if (!position || position.shares <= 0) {
        return { processed: false, reason: 'No existing position to sell' };
      }
      shares = position.shares;
      positionValue = shares * currentPrice;
    }

    if (shares <= 0) {
      return { processed: false, reason: 'Calculated shares is zero or negative' };
    }

    // Risk check
    const riskCheck = this._performRiskCheck(recommendation, portfolio, settings, shares, currentPrice);
    if (!riskCheck.approved) {
      return { processed: false, reason: riskCheck.reason, riskCheck };
    }

    // Queue or execute based on confirmation setting
    if (settings.require_confirmation) {
      const queuedId = this._queueForApproval(recommendation, portfolioId, shares, currentPrice, positionValue);
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
      const result = this._executeImmediately(recommendation, portfolioId, shares, currentPrice);
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
    const totalValue = portfolio.total_value + portfolio.total_cash;

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
    if (isBuy && tradeValue > portfolio.total_cash) {
      return {
        approved: false,
        reason: `Insufficient cash: need $${tradeValue.toFixed(2)}, have $${portfolio.total_cash.toFixed(2)}`,
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
  _queueForApproval(recommendation, portfolioId, shares, price, value) {
    const result = this.stmts.queueExecution.run(
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
      value / ((this.stmts.getPortfolioSummary.get(portfolioId)?.total_value || 1) +
               (this.stmts.getPortfolioSummary.get(portfolioId)?.total_cash || 0))
    );

    return result.lastInsertRowid;
  }

  /**
   * Execute trade immediately (paper trading)
   * Adds position to portfolio via trade
   */
  _executeImmediately(recommendation, portfolioId, shares, price) {
    // This would integrate with portfolio service to execute
    // For now, we queue with auto-approval
    const queuedId = this._queueForApproval(recommendation, portfolioId, shares, price, shares * price);

    // Auto-approve
    this.stmts.updateExecutionStatus.run('approved', 'auto', queuedId);

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
  approveExecution(executionId, approvedBy = 'user') {
    const execution = this.stmts.getExecution.get(executionId);
    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.status !== 'pending') {
      return { success: false, error: `Execution already ${execution.status}` };
    }

    this.stmts.updateExecutionStatus.run('approved', approvedBy, executionId);

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
  rejectExecution(executionId, reason = null, rejectedBy = 'user') {
    const execution = this.stmts.getExecution.get(executionId);
    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.status !== 'pending') {
      return { success: false, error: `Execution already ${execution.status}` };
    }

    this.stmts.rejectExecution.run(rejectedBy, reason, executionId);

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
  executeApprovedTrade(executionId, actualPrice = null, actualShares = null) {
    const execution = this.stmts.getExecution.get(executionId);
    if (!execution) {
      return { success: false, error: 'Execution not found' };
    }

    if (execution.status !== 'approved') {
      return { success: false, error: `Execution must be approved first (current: ${execution.status})` };
    }

    const price = actualPrice || execution.estimated_price;
    const shares = actualShares || execution.shares;
    const portfolioService = this._getPortfolioService();

    try {
      let tradeResult;
      const action = execution.action.toUpperCase();
      const isBuy = action === 'BUY' || action === 'STRONG_BUY';

      if (isBuy) {
        // Execute buy through portfolio service
        tradeResult = portfolioService.executeBuy(execution.portfolio_id, {
          companyId: execution.company_id,
          shares: shares,
          pricePerShare: price,
          fees: 0,
          notes: `AI Agent recommendation #${executionId}: ${action}`
        });
      } else {
        // Execute sell through portfolio service
        tradeResult = portfolioService.executeSell(execution.portfolio_id, {
          companyId: execution.company_id,
          shares: shares,
          pricePerShare: price,
          fees: 0,
          notes: `AI Agent recommendation #${executionId}: ${action}`
        });
      }

      // Mark as executed in pending_executions table
      this.stmts.markExecuted.run(price, shares, executionId);

      // Link the recommendation outcome if available
      if (execution.recommendation_outcome_id) {
        this._updateRecommendationOutcome(execution.recommendation_outcome_id, {
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
      this.db.prepare(`
        UPDATE pending_executions
        SET status = 'failed',
            notes = ?
        WHERE id = ?
      `).run(`Execution failed: ${error.message}`, executionId);

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
  _updateRecommendationOutcome(outcomeId, details) {
    try {
      this.db.prepare(`
        UPDATE recommendation_outcomes
        SET executed = 1,
            executed_at = ?,
            executed_price = ?,
            executed_shares = ?,
            transaction_id = ?
        WHERE id = ?
      `).run(
        details.executedAt,
        details.executedPrice,
        details.executedShares,
        details.transactionId,
        outcomeId
      );
    } catch (error) {
      // Non-critical - log but don't fail the trade
      console.warn(`Could not update recommendation outcome: ${error.message}`);
    }
  }

  /**
   * Get pending executions for a portfolio
   */
  getPendingExecutions(portfolioId = null) {
    if (portfolioId) {
      return this.stmts.getPendingExecutions.all(portfolioId);
    }
    return this.stmts.getAllPendingExecutions.all();
  }

  /**
   * Get execution settings for a portfolio
   */
  getPortfolioSettings(portfolioId) {
    const settings = this.stmts.getPortfolioSettings.get(portfolioId);
    if (!settings) {
      return null;
    }

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
  updatePortfolioSettings(portfolioId, settings) {
    const {
      autoExecute,
      executionThreshold,
      maxAutoPositionPct,
      requireConfirmation,
      autoExecuteActions,
    } = settings;

    this.stmts.updatePortfolioSettings.run(
      autoExecute ? 1 : 0,
      executionThreshold || 0.3,
      maxAutoPositionPct || 0.05,
      requireConfirmation !== false ? 1 : 0,
      Array.isArray(autoExecuteActions) ? autoExecuteActions.join(',') : (autoExecuteActions || 'buy,sell'),
      portfolioId
    );

    return this.getPortfolioSettings(portfolioId);
  }

  /**
   * Approve all pending executions for a portfolio
   */
  approveAllPending(portfolioId, approvedBy = 'user') {
    const pending = this.getPendingExecutions(portfolioId);
    const results = [];

    for (const exec of pending) {
      const result = this.approveExecution(exec.id, approvedBy);
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
  rejectAllPending(portfolioId, reason = 'Batch rejection', rejectedBy = 'user') {
    const pending = this.getPendingExecutions(portfolioId);
    const results = [];

    for (const exec of pending) {
      const result = this.rejectExecution(exec.id, reason, rejectedBy);
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
  expireOldExecutions() {
    const result = this.stmts.expireOldExecutions.run();
    return { expired: result.changes };
  }

  /**
   * Get execution history for a portfolio
   */
  getExecutionHistory(portfolioId, limit = 50) {
    const stmt = this.db.prepare(`
      SELECT
        pe.*,
        c.name as company_name,
        c.symbol
      FROM pending_executions pe
      LEFT JOIN companies c ON pe.company_id = c.id
      WHERE pe.portfolio_id = ?
        AND pe.status IN ('executed', 'rejected', 'expired')
      ORDER BY pe.decided_at DESC, pe.created_at DESC
      LIMIT ?
    `);

    return stmt.all(portfolioId, limit);
  }

  /**
   * Get execution statistics for a portfolio
   */
  getExecutionStats(portfolioId) {
    const stmt = this.db.prepare(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'executed' THEN executed_shares * executed_price ELSE 0 END) as total_value
      FROM pending_executions
      WHERE portfolio_id = ?
      GROUP BY status
    `);

    const rows = stmt.all(portfolioId);
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
      executed: 0,
      expired: 0,
      totalExecutedValue: 0,
    };

    for (const row of rows) {
      stats[row.status] = row.count;
      if (row.status === 'executed') {
        stats.totalExecutedValue = row.total_value || 0;
      }
    }

    return stats;
  }

  /**
   * Execute all approved trades for a portfolio (or all portfolios)
   * @param {number|null} portfolioId - Portfolio ID or null for all
   * @returns {Object} Execution results
   */
  executeAllApproved(portfolioId = null) {
    // Get approved executions
    const stmt = portfolioId
      ? this.db.prepare(`
          SELECT id FROM pending_executions
          WHERE portfolio_id = ? AND status = 'approved'
          ORDER BY created_at ASC
        `)
      : this.db.prepare(`
          SELECT id FROM pending_executions
          WHERE status = 'approved'
          ORDER BY created_at ASC
        `);

    const approved = portfolioId ? stmt.all(portfolioId) : stmt.all();
    const results = [];

    for (const exec of approved) {
      const result = this.executeApprovedTrade(exec.id);
      results.push({
        executionId: exec.id,
        ...result,
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
  submitRecommendation(recommendation) {
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
      const company = this.stmts.getCompany.get(symbol);
      if (!company) {
        return { success: false, error: `Company not found: ${symbol}` };
      }
      resolvedCompanyId = company.id;
    }

    // Get current price if not provided
    let resolvedPrice = price;
    if (!resolvedPrice) {
      const priceData = this.stmts.getCurrentPrice.get(resolvedCompanyId);
      if (!priceData) {
        return { success: false, error: `No price data for ${symbol}` };
      }
      resolvedPrice = priceData.price;
    }

    // Calculate shares if not provided
    let resolvedShares = shares;
    if (!resolvedShares) {
      const portfolio = this.stmts.getPortfolioSummary.get(portfolioId);
      if (!portfolio) {
        return { success: false, error: 'Portfolio not found' };
      }
      const settings = this.stmts.getPortfolioSettings.get(portfolioId);
      const maxPositionPct = settings?.max_auto_position_pct || 0.05;
      const totalValue = portfolio.total_value + portfolio.total_cash;
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
    const result = this.processRecommendation(fullRecommendation, portfolioId);

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
  getApprovedExecutions(portfolioId = null) {
    const stmt = portfolioId
      ? this.db.prepare(`
          SELECT pe.*, c.name as company_name, p.name as portfolio_name
          FROM pending_executions pe
          LEFT JOIN companies c ON pe.company_id = c.id
          LEFT JOIN portfolios p ON pe.portfolio_id = p.id
          WHERE pe.portfolio_id = ? AND pe.status = 'approved'
          ORDER BY pe.created_at DESC
        `)
      : this.db.prepare(`
          SELECT pe.*, c.name as company_name, p.name as portfolio_name
          FROM pending_executions pe
          LEFT JOIN companies c ON pe.company_id = c.id
          LEFT JOIN portfolios p ON pe.portfolio_id = p.id
          WHERE pe.status = 'approved'
          ORDER BY pe.created_at DESC
        `);

    return portfolioId ? stmt.all(portfolioId) : stmt.all();
  }
}

module.exports = { AutoExecutor };
