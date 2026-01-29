/**
 * Issue Collector
 *
 * Collects, categorizes, and manages issues found during stress testing
 */

class IssueCollector {
  constructor() {
    this.issues = [];
    this.issueCounter = 0;
  }

  /**
   * Add a new issue to the collection
   * @param {Object} issue - Issue details
   * @param {string} issue.severity - CRITICAL, HIGH, MEDIUM, LOW
   * @param {string} issue.category - SETUP, SIMULATION, EDGE_CASE, UI_VALIDATION, PERFORMANCE, FRAMEWORK
   * @param {string} issue.message - Description of the issue
   * @param {string} [issue.userId] - Associated user ID
   * @param {number} [issue.day] - Simulation day when issue occurred
   * @param {string} [issue.scenario] - Market scenario when issue occurred
   * @param {Error} [issue.error] - Original error object
   * @param {string} [issue.stack] - Stack trace
   */
  addIssue(issue) {
    this.issueCounter++;
    const fullIssue = {
      id: this.issueCounter,
      timestamp: new Date().toISOString(),
      severity: issue.severity || 'MEDIUM',
      category: issue.category || 'UNKNOWN',
      message: issue.message || 'Unknown issue',
      userId: issue.userId || null,
      agentId: issue.agentId || null,
      day: issue.day || null,
      scenario: issue.scenario || null,
      caseId: issue.caseId || null,
      error: issue.error || null,
      stack: issue.stack || null,
      context: issue.context || {}
    };

    this.issues.push(fullIssue);
    return fullIssue;
  }

  /**
   * Get all collected issues
   */
  getAllIssues() {
    return [...this.issues];
  }

  /**
   * Get count of critical issues
   */
  getCriticalCount() {
    return this.issues.filter(i => i.severity === 'CRITICAL').length;
  }

  /**
   * Get issues by severity
   * @param {string} severity - CRITICAL, HIGH, MEDIUM, LOW
   */
  getByPriority(severity) {
    return this.issues.filter(i => i.severity === severity);
  }

  /**
   * Get issues by category
   * @param {string} category - Issue category
   */
  getByCategory(category) {
    return this.issues.filter(i => i.category === category);
  }

  /**
   * Get issues for a specific user
   * @param {string} userId - User ID
   */
  getByUser(userId) {
    return this.issues.filter(i => i.userId === userId);
  }

  /**
   * Get issues for a specific simulation day
   * @param {number} day - Simulation day
   */
  getByDay(day) {
    return this.issues.filter(i => i.day === day);
  }

  /**
   * Get issues for a specific scenario
   * @param {string} scenario - Scenario ID
   */
  getByScenario(scenario) {
    return this.issues.filter(i => i.scenario === scenario);
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const summary = {
      total: this.issues.length,
      bySeverity: {
        CRITICAL: this.getByPriority('CRITICAL').length,
        HIGH: this.getByPriority('HIGH').length,
        MEDIUM: this.getByPriority('MEDIUM').length,
        LOW: this.getByPriority('LOW').length
      },
      byCategory: {},
      byUser: {},
      byScenario: {}
    };

    // Count by category
    for (const issue of this.issues) {
      if (issue.category) {
        summary.byCategory[issue.category] = (summary.byCategory[issue.category] || 0) + 1;
      }
      if (issue.userId) {
        summary.byUser[issue.userId] = (summary.byUser[issue.userId] || 0) + 1;
      }
      if (issue.scenario) {
        summary.byScenario[issue.scenario] = (summary.byScenario[issue.scenario] || 0) + 1;
      }
    }

    return summary;
  }

  /**
   * Check if any critical issues exist
   */
  hasCriticalIssues() {
    return this.getCriticalCount() > 0;
  }

  /**
   * Get unique error types
   */
  getUniqueErrorTypes() {
    const errorTypes = new Set();
    for (const issue of this.issues) {
      if (issue.error) {
        errorTypes.add(issue.error);
      }
    }
    return Array.from(errorTypes);
  }

  /**
   * Export issues to a formatted object for reporting
   */
  exportForReport() {
    return {
      summary: this.getSummary(),
      critical: this.getByPriority('CRITICAL'),
      high: this.getByPriority('HIGH'),
      medium: this.getByPriority('MEDIUM'),
      low: this.getByPriority('LOW'),
      all: this.getAllIssues()
    };
  }

  /**
   * Clear all issues
   */
  clear() {
    this.issues = [];
    this.issueCounter = 0;
  }

  /**
   * Print a summary to console
   */
  printSummary() {
    const summary = this.getSummary();
    console.log('\n  Issue Summary:');
    console.log(`    Total: ${summary.total}`);
    console.log(`    Critical: ${summary.bySeverity.CRITICAL}`);
    console.log(`    High: ${summary.bySeverity.HIGH}`);
    console.log(`    Medium: ${summary.bySeverity.MEDIUM}`);
    console.log(`    Low: ${summary.bySeverity.LOW}`);

    if (Object.keys(summary.byCategory).length > 0) {
      console.log('\n  By Category:');
      for (const [cat, count] of Object.entries(summary.byCategory)) {
        console.log(`    ${cat}: ${count}`);
      }
    }
  }
}

module.exports = { IssueCollector };
