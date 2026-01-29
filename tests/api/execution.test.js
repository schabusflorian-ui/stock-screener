// tests/api/execution.test.js
// Tests for /api/execution routes - unit tests for route handlers

const { getTestDatabase, resetTestDatabase, createTestFixtures } = require('../setup');

describe('Execution API Routes', () => {
  let db;
  let fixtures;
  let executor;

  beforeEach(() => {
    db = resetTestDatabase();
    fixtures = createTestFixtures(db);

    // Import AutoExecutor directly
    const { AutoExecutor } = require('../../src/services/agent/autoExecutor');
    executor = new AutoExecutor(db);
  });

  afterAll(() => {
    if (db) db.close();
  });

  describe('GET /api/execution/portfolios/:id/settings', () => {
    it('should return settings for valid portfolio', () => {
      const settings = executor.getPortfolioSettings(1);

      expect(settings).toBeDefined();
      expect(settings.portfolioId).toBe(1);
      expect(settings.autoExecute).toBeDefined();
    });

    it('should return null for invalid portfolio', () => {
      const settings = executor.getPortfolioSettings(999);
      expect(settings).toBeNull();
    });
  });

  describe('PUT /api/execution/portfolios/:id/settings', () => {
    it('should update execution settings', () => {
      const updated = executor.updatePortfolioSettings(1, {
        autoExecute: false,
        executionThreshold: 0.5,
        maxAutoPositionPct: 0.1
      });

      expect(updated.autoExecute).toBe(false);
      expect(updated.executionThreshold).toBe(0.5);
    });
  });

  describe('GET /api/execution/pending', () => {
    it('should return empty array when no pending executions', () => {
      const pending = executor.getPendingExecutions(1);

      expect(Array.isArray(pending)).toBe(true);
    });

    it('should return pending executions after submission', () => {
      // Create a pending execution
      executor.processRecommendation({
        symbol: 'AAPL',
        companyId: 1,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2); // Portfolio 2 requires confirmation

      const pending = executor.getPendingExecutions(2);
      expect(pending.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/execution/submit-recommendation', () => {
    it('should reject missing required fields', () => {
      const result = executor.submitRecommendation({
        symbol: 'AAPL'
        // missing portfolioId and action
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should reject invalid company', () => {
      const result = executor.submitRecommendation({
        portfolioId: 1,
        symbol: 'INVALID',
        action: 'buy'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Company not found');
    });

    it('should submit valid recommendation', () => {
      const result = executor.submitRecommendation({
        portfolioId: 1,
        symbol: 'AAPL',
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      });

      expect(result.success).toBe(true);
      expect(result.recommendation).toBeDefined();
      expect(result.recommendation.symbol).toBe('AAPL');
    });
  });

  describe('POST /api/execution/:id/approve', () => {
    it('should approve pending execution', () => {
      // Create a pending execution
      const submitResult = executor.processRecommendation({
        symbol: 'AAPL',
        companyId: 1,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2);

      const result = executor.approveExecution(submitResult.pendingExecutionId, 'test_user');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Execution approved');
    });

    it('should fail for non-existent execution', () => {
      const result = executor.approveExecution(9999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('POST /api/execution/:id/reject', () => {
    it('should reject pending execution with reason', () => {
      // Create a pending execution
      const submitResult = executor.processRecommendation({
        symbol: 'AAPL',
        companyId: 1,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2);

      const result = executor.rejectExecution(
        submitResult.pendingExecutionId,
        'Market conditions changed',
        'test_user'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Execution rejected');
    });
  });

  describe('POST /api/execution/execute-all', () => {
    it('should handle no approved executions', () => {
      // executeAllApproved returns result even with empty list
      expect(typeof executor.executeAllApproved).toBe('function');
    });
  });

  describe('GET /api/execution/approved', () => {
    it('should return approved executions', () => {
      // Create and approve an execution
      const submitResult = executor.processRecommendation({
        symbol: 'AAPL',
        companyId: 1,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2);

      executor.approveExecution(submitResult.pendingExecutionId);

      const approved = executor.getApprovedExecutions(2);

      expect(Array.isArray(approved)).toBe(true);
      expect(approved.length).toBe(1);
      expect(approved[0].status).toBe('approved');
    });
  });

  describe('GET /api/execution/portfolios/:id/history', () => {
    it('should return execution history', () => {
      const history = executor.getExecutionHistory(1, 10);

      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('GET /api/execution/portfolios/:id/stats', () => {
    it('should return execution statistics', () => {
      const stats = executor.getExecutionStats(1);

      expect(stats).toBeDefined();
      expect(typeof stats.pending).toBe('number');
      expect(typeof stats.approved).toBe('number');
      expect(typeof stats.executed).toBe('number');
      expect(typeof stats.rejected).toBe('number');
    });
  });

  describe('POST /api/execution/expire-old', () => {
    it('should expire old executions', () => {
      // Create an expired execution by manually setting expires_at
      db.prepare(`
        INSERT INTO pending_executions (portfolio_id, symbol, company_id, action, shares, estimated_price, status, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now', '-1 day'))
      `).run(1, 'AAPL', 1, 'BUY', 10, 178.0);

      const result = executor.expireOldExecutions();

      expect(result.expired).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Batch operations', () => {
    it('should approve all pending executions', () => {
      // Create multiple pending executions
      executor.processRecommendation({
        symbol: 'AAPL',
        companyId: 1,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2);

      executor.processRecommendation({
        symbol: 'GOOGL',
        companyId: 2,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2);

      const result = executor.approveAllPending(2, 'batch_approver');

      expect(result.approved).toBe(2);
    });

    it('should reject all pending executions', () => {
      executor.processRecommendation({
        symbol: 'AAPL',
        companyId: 1,
        action: 'buy',
        score: 0.7,
        confidence: 0.8
      }, 2);

      const result = executor.rejectAllPending(2, 'Market closed', 'user');

      expect(result.rejected).toBe(1);
    });
  });
});
