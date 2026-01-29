/**
 * Metrics Collector
 *
 * Collects performance metrics and statistics during stress testing
 */

class MetricsCollector {
  constructor() {
    this.setupMetrics = new Map();
    this.dailyMetrics = new Map();
    this.coveredScenarios = new Set();
    this.performanceMetrics = [];
    this.startTime = null;
  }

  /**
   * Start the metrics timer
   */
  start() {
    this.startTime = Date.now();
  }

  /**
   * Record setup completion for a user
   */
  recordSetup(userId, data) {
    this.setupMetrics.set(userId, {
      ...data,
      setupTime: new Date().toISOString(),
      setupDuration: Date.now() - (this.startTime || Date.now())
    });
  }

  /**
   * Record a day's simulation results
   */
  recordDay(userId, day, result) {
    if (!this.dailyMetrics.has(userId)) {
      this.dailyMetrics.set(userId, []);
    }

    const dayRecord = {
      day,
      timestamp: new Date().toISOString(),
      ...result
    };

    this.dailyMetrics.get(userId).push(dayRecord);

    if (result.scenario) {
      this.coveredScenarios.add(result.scenario);
    }
  }

  /**
   * Record a performance measurement
   */
  recordPerformance(operation, durationMs, success = true, details = {}) {
    this.performanceMetrics.push({
      operation,
      durationMs,
      success,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  /**
   * Get all covered scenarios
   */
  getCoveredScenarios() {
    return Array.from(this.coveredScenarios);
  }

  /**
   * Get setup metrics for a user
   */
  getSetupMetrics(userId) {
    return this.setupMetrics.get(userId);
  }

  /**
   * Get daily metrics for a user
   */
  getDailyMetrics(userId) {
    return this.dailyMetrics.get(userId) || [];
  }

  /**
   * Calculate user statistics
   */
  getUserStats(userId) {
    const days = this.dailyMetrics.get(userId) || [];
    if (days.length === 0) {
      return null;
    }

    const totalSignals = days.reduce((sum, d) => sum + (d.signalsGenerated || 0), 0);
    const totalTrades = days.reduce((sum, d) => sum + (d.tradesExecuted || 0), 0);
    const totalErrors = days.reduce((sum, d) => sum + (d.errors?.length || 0), 0);
    const totalDuration = days.reduce((sum, d) => sum + (d.duration || 0), 0);

    return {
      userId,
      daysSimulated: days.length,
      totalSignals,
      totalTrades,
      totalErrors,
      avgSignalsPerDay: days.length > 0 ? (totalSignals / days.length).toFixed(2) : 0,
      avgTradesPerDay: days.length > 0 ? (totalTrades / days.length).toFixed(2) : 0,
      avgDayDuration: days.length > 0 ? (totalDuration / days.length).toFixed(0) : 0,
      errorRate: totalSignals > 0 ? ((totalErrors / totalSignals) * 100).toFixed(2) : 0
    };
  }

  /**
   * Get performance statistics for an operation type
   */
  getPerformanceStats(operation) {
    const ops = this.performanceMetrics.filter(p => p.operation === operation);
    if (ops.length === 0) {
      return null;
    }

    const durations = ops.map(p => p.durationMs);
    const successful = ops.filter(p => p.success).length;

    return {
      operation,
      count: ops.length,
      successRate: ((successful / ops.length) * 100).toFixed(1),
      avgDuration: (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50: this._percentile(durations, 50),
      p95: this._percentile(durations, 95),
      p99: this._percentile(durations, 99)
    };
  }

  /**
   * Calculate percentile
   */
  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get comprehensive summary
   */
  getSummary() {
    const summary = {
      runtime: this.startTime ? `${((Date.now() - this.startTime) / 1000).toFixed(2)}s` : 'N/A',
      usersSetup: this.setupMetrics.size,
      totalDaysSimulated: 0,
      totalSignals: 0,
      totalTrades: 0,
      totalErrors: 0,
      avgSignalsPerDay: 0,
      avgTradesPerDay: 0,
      scenariosCovered: this.coveredScenarios.size,
      perUser: {},
      performance: {}
    };

    // Aggregate user metrics
    for (const [userId] of this.dailyMetrics) {
      const userStats = this.getUserStats(userId);
      if (userStats) {
        summary.totalDaysSimulated += userStats.daysSimulated;
        summary.totalSignals += userStats.totalSignals;
        summary.totalTrades += userStats.totalTrades;
        summary.totalErrors += userStats.totalErrors;
        summary.perUser[userId] = userStats;
      }
    }

    // Calculate averages
    if (summary.totalDaysSimulated > 0) {
      summary.avgSignalsPerDay = (summary.totalSignals / summary.totalDaysSimulated).toFixed(2);
      summary.avgTradesPerDay = (summary.totalTrades / summary.totalDaysSimulated).toFixed(2);
    }

    // Get performance stats for key operations
    const operations = ['agent_scan', 'trade_execute', 'snapshot', 'signal_approve'];
    for (const op of operations) {
      const stats = this.getPerformanceStats(op);
      if (stats) {
        summary.performance[op] = stats;
      }
    }

    return summary;
  }

  /**
   * Export metrics for report
   */
  exportForReport() {
    const summary = this.getSummary();

    return {
      overview: {
        runtime: summary.runtime,
        usersSetup: summary.usersSetup,
        totalDaysSimulated: summary.totalDaysSimulated,
        totalSignals: summary.totalSignals,
        totalTrades: summary.totalTrades,
        scenariosCovered: summary.scenariosCovered
      },
      perUser: summary.perUser,
      performance: summary.performance,
      scenarios: this.getCoveredScenarios(),
      rawDaily: Object.fromEntries(this.dailyMetrics),
      rawSetup: Object.fromEntries(this.setupMetrics)
    };
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const summary = this.getSummary();
    console.log('\n  Metrics Summary:');
    console.log(`    Runtime: ${summary.runtime}`);
    console.log(`    Users Setup: ${summary.usersSetup}`);
    console.log(`    Days Simulated: ${summary.totalDaysSimulated}`);
    console.log(`    Total Signals: ${summary.totalSignals}`);
    console.log(`    Total Trades: ${summary.totalTrades}`);
    console.log(`    Scenarios Covered: ${summary.scenariosCovered}`);
    console.log(`    Avg Signals/Day: ${summary.avgSignalsPerDay}`);
    console.log(`    Avg Trades/Day: ${summary.avgTradesPerDay}`);
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.setupMetrics.clear();
    this.dailyMetrics.clear();
    this.coveredScenarios.clear();
    this.performanceMetrics = [];
    this.startTime = null;
  }
}

module.exports = { MetricsCollector };
