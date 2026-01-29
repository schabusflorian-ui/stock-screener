// tests/stress/utils/reporter.js
// Test Reporter for Stress Tests

const fs = require('fs');
const path = require('path');

class Reporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './tests/stress/results';
    this.verbose = options.verbose || false;
  }

  printHeader(text) {
    const line = '='.repeat(70);
    console.log('\n' + line);
    console.log(text);
    console.log(line);
  }

  printSubHeader(text) {
    console.log('\n  ' + '-'.repeat(50));
    console.log('  ' + text);
    console.log('  ' + '-'.repeat(50));
  }

  printPersonaStart(persona) {
    this.printHeader(`PERSONA: ${persona.name} (${persona.id})`);
    console.log(`  Style: ${persona.description}`);
    console.log(`  Preferred Analyst: ${persona.preferredAnalyst}`);
  }

  printNLQueryResult(result, index) {
    const status = result.matchesExpectation ? '[PASS]' : '[FAIL]';
    const color = result.matchesExpectation ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';

    const queryPreview = result.query.length > 50
      ? result.query.substring(0, 47) + '...'
      : result.query;

    console.log(`    ${color}${status}${reset} "${queryPreview}" (${result.responseTime}ms)`);

    if (!result.matchesExpectation && this.verbose) {
      console.log(`          Expected: ${result.expectSuccess ? 'success' : 'failure'}`);
      console.log(`          Got: ${result.success ? 'success' : 'failure'}`);
      if (result.error) console.log(`          Error: ${result.error}`);
    }
  }

  printAnalystChatResult(result, index) {
    const status = result.success ? '[PASS]' : '[FAIL]';
    const color = result.success ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    const yellow = '\x1b[33m';
    const cyan = '\x1b[36m';

    const questionPreview = result.question?.length > 40
      ? result.question.substring(0, 37) + '...'
      : result.question || 'N/A';

    // Build quality indicator
    let qualityStr = '';
    if (result.qualityGrade) {
      const grade = result.qualityGrade.grade;
      const score = result.qualityGrade.overallScore;
      const gradeColor = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
      qualityStr = ` ${gradeColor}[${grade}:${score}]${reset}`;
    }

    // Build knowledge test indicator
    let knowledgeStr = '';
    if (result.knowledgeTest?.tested) {
      const kColor = result.knowledgeTest.passed ? '\x1b[32m' : '\x1b[31m';
      const kStatus = result.knowledgeTest.passed ? 'K:OK' : 'K:FAIL';
      knowledgeStr = ` ${kColor}[${kStatus}]${reset}`;
    }

    const details = result.isStreaming ? ', streaming' : '';
    console.log(`    ${color}${status}${reset}${qualityStr}${knowledgeStr} "${questionPreview}" (${result.responseTime}ms${details})`);

    if (this.verbose) {
      if (!result.success && result.error) {
        console.log(`          Error: ${result.error}`);
      }
      if (result.qualityGrade) {
        console.log(`          Scores: Persona=${result.qualityGrade.scores.personaAdherence}, Knowledge=${result.qualityGrade.scores.analystKnowledge}, Fluency=${result.qualityGrade.scores.fluency}`);
      }
      if (result.knowledgeTest?.tested && !result.knowledgeTest.passed) {
        console.log(`          Missing keywords: ${result.knowledgeTest.expectedKeywords.filter(k => !result.knowledgeTest.foundKeywords.includes(k)).join(', ')}`);
      }
    }
  }

  printSummary(allResults) {
    this.printHeader('STRESS TEST SUMMARY');

    // Overall stats
    let totalTests = 0;
    let totalPassed = 0;
    let totalNLQueries = 0;
    let totalChats = 0;
    let nlPassed = 0;
    let chatPassed = 0;
    const issues = [];
    const responseTimes = [];

    // Quality grading stats
    const qualityScores = [];
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let knowledgeTestsTotal = 0;
    let knowledgeTestsPassed = 0;
    const lowQualityResponses = [];

    for (const [personaId, results] of Object.entries(allResults)) {
      // NL Query stats
      if (results.nlQueries) {
        totalNLQueries += results.nlQueries.length;
        for (const r of results.nlQueries) {
          totalTests++;
          responseTimes.push(r.responseTime);
          if (r.matchesExpectation) {
            totalPassed++;
            nlPassed++;
          } else {
            issues.push({
              persona: personaId,
              type: 'NL Query',
              query: r.query,
              category: r.category,
              error: r.error || 'Did not match expectation',
              expected: r.expectSuccess ? 'success' : 'failure'
            });
          }
        }
      }

      // Chat stats with quality grading
      if (results.analystChats) {
        for (const r of results.analystChats) {
          if (r.operation === 'sendMessage') {
            totalChats++;
            totalTests++;
            responseTimes.push(r.responseTime);
            if (r.success) {
              totalPassed++;
              chatPassed++;
            } else {
              issues.push({
                persona: personaId,
                type: 'Analyst Chat',
                question: r.question,
                error: r.error || 'Chat failed'
              });
            }

            // Collect quality scores
            if (r.qualityGrade) {
              qualityScores.push(r.qualityGrade.overallScore);
              if (r.qualityGrade.grade) {
                gradeDistribution[r.qualityGrade.grade]++;
              }
              // Track low quality responses
              if (r.qualityGrade.overallScore < 70) {
                lowQualityResponses.push({
                  persona: personaId,
                  question: r.question,
                  score: r.qualityGrade.overallScore,
                  grade: r.qualityGrade.grade,
                  feedback: r.qualityGrade.feedback
                });
              }
            }

            // Collect knowledge test stats
            if (r.knowledgeTest?.tested) {
              knowledgeTestsTotal++;
              if (r.knowledgeTest.passed) {
                knowledgeTestsPassed++;
              }
            }
          }
        }
      }
    }

    const totalFailed = totalTests - totalPassed;
    const successRate = totalTests > 0
      ? ((totalPassed / totalTests) * 100).toFixed(1)
      : 0;

    // Print stats table
    console.log('\n  Results by Category:');
    console.log('  ' + '-'.repeat(50));
    console.log(`  | Category      | Total | Passed | Failed | Rate   |`);
    console.log('  ' + '-'.repeat(50));
    console.log(`  | NL Queries    | ${String(totalNLQueries).padStart(5)} | ${String(nlPassed).padStart(6)} | ${String(totalNLQueries - nlPassed).padStart(6)} | ${((nlPassed/totalNLQueries)*100 || 0).toFixed(1).padStart(5)}% |`);
    console.log(`  | Analyst Chat  | ${String(totalChats).padStart(5)} | ${String(chatPassed).padStart(6)} | ${String(totalChats - chatPassed).padStart(6)} | ${((chatPassed/totalChats)*100 || 0).toFixed(1).padStart(5)}% |`);
    console.log('  ' + '-'.repeat(50));
    console.log(`  | TOTAL         | ${String(totalTests).padStart(5)} | ${String(totalPassed).padStart(6)} | ${String(totalFailed).padStart(6)} | ${successRate.padStart(5)}% |`);
    console.log('  ' + '-'.repeat(50));

    // Print quality grading summary
    if (qualityScores.length > 0) {
      const avgQuality = Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length);
      const qualityColor = avgQuality >= 80 ? '\x1b[32m' : avgQuality >= 60 ? '\x1b[33m' : '\x1b[31m';
      const reset = '\x1b[0m';

      console.log('\n  CONVERSATION QUALITY GRADES:');
      console.log('  ' + '-'.repeat(50));
      console.log(`  Average Quality Score: ${qualityColor}${avgQuality}/100${reset}`);
      console.log(`  Grade Distribution: A=${gradeDistribution.A} B=${gradeDistribution.B} C=${gradeDistribution.C} D=${gradeDistribution.D} F=${gradeDistribution.F}`);

      // Knowledge test results
      if (knowledgeTestsTotal > 0) {
        const kPassRate = ((knowledgeTestsPassed / knowledgeTestsTotal) * 100).toFixed(1);
        const kColor = knowledgeTestsPassed === knowledgeTestsTotal ? '\x1b[32m' : '\x1b[33m';
        console.log(`  Knowledge Tests: ${kColor}${knowledgeTestsPassed}/${knowledgeTestsTotal} passed (${kPassRate}%)${reset}`);
      }

      // Show low quality responses
      if (lowQualityResponses.length > 0) {
        console.log('\n  LOW QUALITY RESPONSES (score < 70):');
        for (const r of lowQualityResponses.slice(0, 5)) { // Show max 5
          const questionPreview = r.question?.length > 40 ? r.question.substring(0, 37) + '...' : r.question;
          console.log(`    - [${r.grade}:${r.score}] ${r.persona}: "${questionPreview}"`);
          if (r.feedback && r.feedback.length > 0) {
            console.log(`      Feedback: ${r.feedback[0]}`);
          }
        }
        if (lowQualityResponses.length > 5) {
          console.log(`    ... and ${lowQualityResponses.length - 5} more`);
        }
      }
    }

    // Performance stats
    if (responseTimes.length > 0) {
      const sortedTimes = [...responseTimes].sort((a, b) => a - b);
      const avgTime = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
      const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
      const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const maxTime = Math.max(...responseTimes);

      console.log('\n  Performance:');
      console.log(`    Average Response Time: ${avgTime}ms`);
      console.log(`    P50 Response Time: ${p50}ms`);
      console.log(`    P95 Response Time: ${p95}ms`);
      console.log(`    Max Response Time: ${maxTime}ms`);
    }

    // Issues found
    if (issues.length > 0) {
      console.log('\n  ISSUES FOUND:');
      console.log('  ' + '-'.repeat(50));

      // Categorize issues
      const categorized = {
        BUG: [],
        EDGE: [],
        UX: []
      };

      for (const issue of issues) {
        if (issue.category?.startsWith('edge_')) {
          categorized.EDGE.push(issue);
        } else if (issue.error?.includes('timeout') || issue.error?.includes('500')) {
          categorized.BUG.push(issue);
        } else {
          categorized.UX.push(issue);
        }
      }

      let issueNum = 1;
      for (const [cat, catIssues] of Object.entries(categorized)) {
        for (const issue of catIssues) {
          const queryOrQuestion = issue.query || issue.question || 'N/A';
          const preview = queryOrQuestion.length > 40
            ? queryOrQuestion.substring(0, 37) + '...'
            : queryOrQuestion;
          console.log(`    ${issueNum}. [${cat}] ${issue.type}: "${preview}"`);
          console.log(`       Persona: ${issue.persona}, Error: ${issue.error}`);
          issueNum++;
        }
      }
    } else {
      console.log('\n  No issues found! All tests passed as expected.');
    }

    return {
      totalTests,
      totalPassed,
      totalFailed,
      successRate: successRate + '%',
      issues,
      performance: {
        avgResponseTime: responseTimes.length > 0
          ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
          : 0
      },
      quality: {
        avgScore: qualityScores.length > 0
          ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
          : 0,
        gradeDistribution,
        lowQualityResponses
      },
      knowledgeTests: {
        total: knowledgeTestsTotal,
        passed: knowledgeTestsPassed,
        failed: knowledgeTestsTotal - knowledgeTestsPassed,
        passRate: knowledgeTestsTotal > 0
          ? ((knowledgeTestsPassed / knowledgeTestsTotal) * 100).toFixed(1) + '%'
          : 'N/A'
      }
    };
  }

  async saveReport(allResults, summary) {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const report = {
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        },
        summary,
        detailedResults: allResults
      };

      const reportPath = path.join(this.outputDir, 'stress-test-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n  Report saved to: ${reportPath}`);
      return reportPath;
    } catch (error) {
      console.log(`  [WARN] Could not save report: ${error.message}`);
      return null;
    }
  }
}

module.exports = { Reporter };
