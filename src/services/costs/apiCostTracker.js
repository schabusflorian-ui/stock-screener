// src/services/costs/apiCostTracker.js
/**
 * API Cost Tracking Service
 *
 * Tracks all API calls, calculates costs, and enforces budgets.
 * Prevents budget overruns by checking limits before expensive operations.
 *
 * Usage:
 *   const tracker = new ApiCostTracker(db);
 *   tracker.logCall('claude', '/v1/messages', 'sentiment_hourly', 0.05, 1000);
 *   const budget = await tracker.checkBudget('claude');
 *   if (!budget.withinBudget) throw new Error('Budget exceeded');
 */

class ApiCostTracker {
  constructor(db) {
    this.db = db;

    // Prepare statements for performance
    this.stmts = {
      // Log individual API call
      logCall: this.db.prepare(`
        INSERT INTO api_usage_log (provider, endpoint, job_key, cost_usd, tokens, cached)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      // Update daily aggregate
      updateDailyAggregate: this.db.prepare(`
        INSERT INTO api_usage_daily (provider, date, job_key, total_requests, total_cost_usd, cache_hits)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT (provider, date, job_key) DO UPDATE SET
          total_requests = total_requests + 1,
          total_cost_usd = total_cost_usd + excluded.total_cost_usd,
          cache_hits = cache_hits + excluded.cache_hits
      `),

      // Get budget configuration
      getBudget: this.db.prepare(`
        SELECT * FROM api_budgets WHERE provider = ?
      `),

      // Get today's usage
      getTodayUsage: this.db.prepare(`
        SELECT SUM(total_cost_usd) as cost_today
        FROM api_usage_daily
        WHERE provider = ? AND date = ?
      `),

      // Get current month's usage
      getMonthUsage: this.db.prepare(`
        SELECT SUM(total_cost_usd) as cost_month
        FROM api_usage_daily
        WHERE provider = ? AND date >= date('now', 'start of month')
      `),

      // Get usage stats for a provider
      getProviderStats: this.db.prepare(`
        SELECT
          SUM(total_requests) as total_requests,
          SUM(total_cost_usd) as total_cost,
          SUM(cache_hits) as cache_hits,
          MIN(date) as first_date,
          MAX(date) as last_date
        FROM api_usage_daily
        WHERE provider = ?
      `),
    };
  }

  /**
   * Log an API call with cost and token information
   * @param {string} provider - API provider (e.g., 'claude', 'alpha_vantage')
   * @param {string} endpoint - API endpoint called
   * @param {string} jobKey - Job that made the call
   * @param {number} costUsd - Cost in USD
   * @param {number} tokens - Number of tokens (for LLMs)
   * @param {boolean} cached - Whether the response was cached
   */
  logCall(provider, endpoint, jobKey, costUsd = 0, tokens = 0, cached = false) {
    try {
      // Log individual call
      this.stmts.logCall.run(
        provider,
        endpoint,
        jobKey,
        costUsd,
        tokens,
        cached ? 1 : 0
      );

      // Update daily aggregate
      const today = new Date().toISOString().split('T')[0];
      this.stmts.updateDailyAggregate.run(
        provider,
        today,
        jobKey || 'unknown',
        costUsd,
        cached ? 1 : 0
      );

      return true;
    } catch (error) {
      console.error('Failed to log API call:', {
        provider,
        endpoint,
        jobKey,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Check if provider is within budget limits
   * @param {string} provider - API provider to check
   * @returns {Object} Budget status with usage details
   */
  async checkBudget(provider) {
    try {
      const budget = this.stmts.getBudget.get(provider);

      // If no budget configured, always within budget
      if (!budget) {
        return {
          withinBudget: true,
          provider,
          message: 'No budget configured'
        };
      }

      const today = new Date().toISOString().split('T')[0];

      // Get usage
      const todayUsage = this.stmts.getTodayUsage.get(provider, today);
      const monthUsage = this.stmts.getMonthUsage.get(provider);

      const costToday = todayUsage?.cost_today || 0;
      const costMonth = monthUsage?.cost_month || 0;

      // Check daily budget
      const withinDailyBudget = !budget.daily_budget_usd ||
        costToday < budget.daily_budget_usd;

      // Check monthly budget
      const withinMonthlyBudget = !budget.monthly_budget_usd ||
        costMonth < budget.monthly_budget_usd;

      const withinBudget = withinDailyBudget && withinMonthlyBudget;

      // Calculate percentages
      const dailyPercent = budget.daily_budget_usd
        ? Math.round((costToday / budget.daily_budget_usd) * 100)
        : 0;

      const monthlyPercent = budget.monthly_budget_usd
        ? Math.round((costMonth / budget.monthly_budget_usd) * 100)
        : 0;

      return {
        withinBudget,
        provider,
        daily: {
          used: costToday,
          limit: budget.daily_budget_usd,
          percent: dailyPercent,
          exceeded: !withinDailyBudget
        },
        monthly: {
          used: costMonth,
          limit: budget.monthly_budget_usd,
          percent: monthlyPercent,
          exceeded: !withinMonthlyBudget
        },
        message: withinBudget
          ? 'Within budget'
          : `Budget exceeded: ${!withinDailyBudget ? 'daily' : 'monthly'} limit reached`
      };
    } catch (error) {
      console.error('Failed to check budget:', {
        provider,
        error: error.message
      });

      // On error, allow operation to proceed (fail open)
      return {
        withinBudget: true,
        provider,
        error: error.message
      };
    }
  }

  /**
   * Get usage statistics for a provider
   * @param {string} provider - API provider
   * @param {string} period - 'today', 'week', 'month', 'all'
   * @returns {Object} Usage statistics
   */
  getUsageStats(provider, period = 'all') {
    try {
      let dateFilter = '';

      switch (period) {
        case 'today':
          dateFilter = `AND date = date('now')`;
          break;
        case 'week':
          dateFilter = `AND date >= date('now', '-7 days')`;
          break;
        case 'month':
          dateFilter = `AND date >= date('now', 'start of month')`;
          break;
        case 'all':
        default:
          dateFilter = '';
      }

      const stats = this.db.prepare(`
        SELECT
          provider,
          SUM(total_requests) as total_requests,
          SUM(total_cost_usd) as total_cost,
          SUM(cache_hits) as cache_hits,
          COUNT(DISTINCT date) as days_active,
          MIN(date) as first_date,
          MAX(date) as last_date
        FROM api_usage_daily
        WHERE provider = ? ${dateFilter}
        GROUP BY provider
      `).get(provider);

      if (!stats) {
        return {
          provider,
          period,
          total_requests: 0,
          total_cost: 0,
          cache_hits: 0,
          cache_hit_rate: 0,
          avg_cost_per_request: 0
        };
      }

      const cacheHitRate = stats.total_requests > 0
        ? Math.round((stats.cache_hits / stats.total_requests) * 100)
        : 0;

      const avgCostPerRequest = stats.total_requests > 0
        ? stats.total_cost / stats.total_requests
        : 0;

      return {
        provider,
        period,
        total_requests: stats.total_requests,
        total_cost: stats.total_cost,
        cache_hits: stats.cache_hits,
        cache_hit_rate: cacheHitRate,
        avg_cost_per_request: avgCostPerRequest,
        days_active: stats.days_active,
        first_date: stats.first_date,
        last_date: stats.last_date
      };
    } catch (error) {
      console.error('Failed to get usage stats:', {
        provider,
        period,
        error: error.message
      });

      return {
        provider,
        period,
        error: error.message
      };
    }
  }

  /**
   * Get usage breakdown by job for a provider
   * @param {string} provider - API provider
   * @param {string} period - 'today', 'week', 'month'
   * @returns {Array} Usage by job
   */
  getUsageByJob(provider, period = 'month') {
    try {
      let dateFilter = '';

      switch (period) {
        case 'today':
          dateFilter = `AND date = date('now')`;
          break;
        case 'week':
          dateFilter = `AND date >= date('now', '-7 days')`;
          break;
        case 'month':
          dateFilter = `AND date >= date('now', 'start of month')`;
          break;
      }

      const usage = this.db.prepare(`
        SELECT
          job_key,
          SUM(total_requests) as total_requests,
          SUM(total_cost_usd) as total_cost,
          SUM(cache_hits) as cache_hits
        FROM api_usage_daily
        WHERE provider = ? ${dateFilter}
        GROUP BY job_key
        ORDER BY total_cost DESC
      `).all(provider);

      return usage.map(job => ({
        job_key: job.job_key,
        total_requests: job.total_requests,
        total_cost: job.total_cost,
        cache_hits: job.cache_hits,
        cache_hit_rate: job.total_requests > 0
          ? Math.round((job.cache_hits / job.total_requests) * 100)
          : 0
      }));
    } catch (error) {
      console.error('Failed to get usage by job:', {
        provider,
        period,
        error: error.message
      });

      return [];
    }
  }

  /**
   * Get all providers with their current usage status
   * @returns {Array} All providers with budget status
   */
  async getAllProviderStatus() {
    try {
      const providers = this.db.prepare(`
        SELECT DISTINCT provider FROM api_budgets
      `).all();

      const status = [];

      for (const { provider } of providers) {
        const budget = await this.checkBudget(provider);
        const stats = this.getUsageStats(provider, 'month');

        status.push({
          provider,
          budget_status: budget,
          monthly_stats: stats
        });
      }

      return status;
    } catch (error) {
      console.error('Failed to get all provider status:', error);
      return [];
    }
  }

  /**
   * Update budget limits for a provider
   * @param {string} provider - API provider
   * @param {number} dailyBudgetUsd - Daily budget in USD (null = no limit)
   * @param {number} monthlyBudgetUsd - Monthly budget in USD (null = no limit)
   */
  updateBudget(provider, dailyBudgetUsd, monthlyBudgetUsd) {
    try {
      this.db.prepare(`
        INSERT INTO api_budgets (provider, daily_budget_usd, monthly_budget_usd)
        VALUES (?, ?, ?)
        ON CONFLICT (provider) DO UPDATE SET
          daily_budget_usd = excluded.daily_budget_usd,
          monthly_budget_usd = excluded.monthly_budget_usd,
          updated_at = CURRENT_TIMESTAMP
      `).run(provider, dailyBudgetUsd, monthlyBudgetUsd);

      return true;
    } catch (error) {
      console.error('Failed to update budget:', {
        provider,
        error: error.message
      });

      return false;
    }
  }
}

module.exports = ApiCostTracker;
