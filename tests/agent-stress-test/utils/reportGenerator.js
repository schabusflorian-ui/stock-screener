/**
 * Report Generator
 *
 * Generates comprehensive test reports in JSON and Markdown formats
 */

const fs = require('fs');
const path = require('path');

class ReportGenerator {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './tests/agent-stress-test/results';
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generate and save full report
   */
  async save(report) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save JSON report
    const jsonPath = path.join(this.outputDir, `stress-test-report-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Save Markdown report
    const mdPath = path.join(this.outputDir, `stress-test-report-${timestamp}.md`);
    fs.writeFileSync(mdPath, this.generateMarkdown(report));

    // Save latest symlinks/copies
    const latestJsonPath = path.join(this.outputDir, 'latest-report.json');
    const latestMdPath = path.join(this.outputDir, 'latest-report.md');
    fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestMdPath, this.generateMarkdown(report));

    console.log(`\n  Reports saved:`);
    console.log(`    JSON: ${jsonPath}`);
    console.log(`    Markdown: ${mdPath}`);

    return { jsonPath, mdPath };
  }

  /**
   * Generate Markdown report
   */
  generateMarkdown(report) {
    const lines = [];

    // Header
    lines.push('# AI Trading Agent Stress Test Report');
    lines.push('');
    lines.push(`Generated: ${report.metadata.timestamp}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Runtime | ${report.metadata.totalRuntime} |`);
    lines.push(`| Users Tested | ${report.metadata.usersCreated} |`);
    lines.push(`| Days Simulated | ${report.metadata.simulationDays} |`);
    lines.push(`| Total Issues | ${report.summary.totalIssues} |`);
    lines.push(`| Critical Issues | ${report.summary.criticalIssues} |`);
    lines.push(`| High Issues | ${report.summary.highIssues} |`);
    lines.push(`| Medium Issues | ${report.summary.mediumIssues} |`);
    lines.push(`| Low Issues | ${report.summary.lowIssues} |`);
    lines.push('');

    // Status
    const status = report.summary.criticalIssues === 0 ? 'PASSED' : 'FAILED';
    const statusEmoji = status === 'PASSED' ? '' : '';
    lines.push(`### Overall Status: ${status} ${statusEmoji}`);
    lines.push('');

    // Coverage
    lines.push('## Coverage');
    lines.push('');
    lines.push('### Cross-Sectional Coverage (User Types)');
    lines.push('');
    lines.push('| User ID | Name | Risk Tolerance | Tested |');
    lines.push('|---------|------|----------------|--------|');
    for (const [userId, user] of Object.entries(report.crossSectionalCoverage || {})) {
      const tested = user.tested ? 'Yes' : 'No';
      lines.push(`| ${userId} | ${user.name} | ${user.riskTolerance} | ${tested} |`);
    }
    lines.push('');

    lines.push('### Temporal Coverage (Market Scenarios)');
    lines.push('');
    if (report.temporalCoverage) {
      lines.push(`Coverage: ${report.temporalCoverage.coverage}`);
      lines.push('');
      lines.push('| Scenario | Covered |');
      lines.push('|----------|---------|');
      for (const detail of report.temporalCoverage.details || []) {
        lines.push(`| ${detail.scenario} | ${detail.covered ? 'Yes' : 'No'} |`);
      }
    }
    lines.push('');

    // Metrics
    if (report.metrics) {
      lines.push('## Performance Metrics');
      lines.push('');
      lines.push('### Overview');
      lines.push('');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      lines.push(`| Total Signals Generated | ${report.metrics.totalSignals || 0} |`);
      lines.push(`| Total Trades Executed | ${report.metrics.totalTrades || 0} |`);
      lines.push(`| Avg Signals/Day | ${report.metrics.avgSignalsPerDay || 0} |`);
      lines.push(`| Avg Trades/Day | ${report.metrics.avgTradesPerDay || 0} |`);
      lines.push('');

      if (report.metrics.perUser && Object.keys(report.metrics.perUser).length > 0) {
        lines.push('### Per-User Metrics');
        lines.push('');
        lines.push('| User | Days | Signals | Trades | Avg Signals/Day |');
        lines.push('|------|------|---------|--------|-----------------|');
        for (const [userId, stats] of Object.entries(report.metrics.perUser)) {
          lines.push(`| ${userId} | ${stats.daysSimulated} | ${stats.totalSignals} | ${stats.totalTrades} | ${stats.avgSignalsPerDay} |`);
        }
        lines.push('');
      }
    }

    // Issues
    lines.push('## Issues Found');
    lines.push('');

    if (report.issues) {
      // Critical issues
      if (report.issues.CRITICAL && report.issues.CRITICAL.length > 0) {
        lines.push('### Critical Issues');
        lines.push('');
        for (const issue of report.issues.CRITICAL) {
          lines.push(`- **[${issue.category}]** ${issue.message}`);
          if (issue.userId) lines.push(`  - User: ${issue.userId}`);
          if (issue.day) lines.push(`  - Day: ${issue.day}`);
        }
        lines.push('');
      }

      // High issues
      if (report.issues.BUG && report.issues.BUG.length > 0) {
        lines.push('### High Priority Bugs');
        lines.push('');
        for (const issue of report.issues.BUG.slice(0, 20)) {
          lines.push(`- **[${issue.category}]** ${issue.message}`);
        }
        if (report.issues.BUG.length > 20) {
          lines.push(`- ... and ${report.issues.BUG.length - 20} more`);
        }
        lines.push('');
      }

      // Edge case issues
      if (report.issues.EDGE_CASE && report.issues.EDGE_CASE.length > 0) {
        lines.push('### Edge Case Issues');
        lines.push('');
        for (const issue of report.issues.EDGE_CASE.slice(0, 10)) {
          lines.push(`- **[${issue.caseId || issue.category}]** ${issue.message}`);
        }
        if (report.issues.EDGE_CASE.length > 10) {
          lines.push(`- ... and ${report.issues.EDGE_CASE.length - 10} more`);
        }
        lines.push('');
      }

      // UI validation issues
      if (report.issues.UI && report.issues.UI.length > 0) {
        lines.push('### UI Validation Issues');
        lines.push('');
        for (const issue of report.issues.UI.slice(0, 10)) {
          lines.push(`- ${issue.message}`);
        }
        if (report.issues.UI.length > 10) {
          lines.push(`- ... and ${report.issues.UI.length - 10} more`);
        }
        lines.push('');
      }
    }

    // Recommendations
    if (report.recommendations && report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`### [${rec.priority}] ${rec.area}`);
        lines.push('');
        lines.push(rec.recommendation);
        lines.push('');
      }
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Report generated by AI Trading Agent Stress Test Framework*');

    return lines.join('\n');
  }

  /**
   * Generate recommendations based on issues
   */
  static generateRecommendations(issues) {
    const recommendations = [];
    const issueCounts = {
      SETUP: 0,
      SIMULATION: 0,
      EDGE_CASE: 0,
      UI_VALIDATION: 0,
      PERFORMANCE: 0
    };

    for (const issue of issues) {
      if (issueCounts[issue.category] !== undefined) {
        issueCounts[issue.category]++;
      }
    }

    if (issueCounts.SETUP > 0) {
      recommendations.push({
        priority: 'HIGH',
        area: 'Agent Setup',
        recommendation: `Review agent creation flow - ${issueCounts.SETUP} setup failures detected. Check database schema, required fields, and portfolio linking.`
      });
    }

    if (issueCounts.SIMULATION > 5) {
      recommendations.push({
        priority: 'MEDIUM',
        area: 'Trading Simulation',
        recommendation: `Improve error handling in signal generation - ${issueCounts.SIMULATION} day failures. Consider adding retry logic and better fallbacks.`
      });
    }

    if (issueCounts.EDGE_CASE > 3) {
      recommendations.push({
        priority: 'MEDIUM',
        area: 'Edge Case Handling',
        recommendation: `Strengthen input validation - ${issueCounts.EDGE_CASE} edge case failures. Review boundary conditions and error messages.`
      });
    }

    if (issueCounts.UI_VALIDATION > 5) {
      recommendations.push({
        priority: 'LOW',
        area: 'UI Validation',
        recommendation: `Improve frontend validation messages - ${issueCounts.UI_VALIDATION} validation issues. Ensure error messages are user-friendly.`
      });
    }

    if (issueCounts.PERFORMANCE > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        area: 'Performance',
        recommendation: `Investigate performance bottlenecks - ${issueCounts.PERFORMANCE} performance issues. Consider caching, query optimization, or async processing.`
      });
    }

    // Check for specific patterns
    const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
    if (criticalCount > 0) {
      recommendations.unshift({
        priority: 'CRITICAL',
        area: 'System Stability',
        recommendation: `${criticalCount} critical issues require immediate attention. These may indicate system instability or data corruption risks.`
      });
    }

    return recommendations;
  }
}

module.exports = { ReportGenerator };
