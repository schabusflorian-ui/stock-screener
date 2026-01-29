#!/usr/bin/env node
/**
 * AI Agent User Testing Script
 *
 * Tests the NL Query system and Analyst Chat with common user scenarios.
 * Generates a detailed test report.
 */

const http = require('http');
const https = require('https');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3001';
const TIMEOUT = 15000; // 15 seconds per test (reduced for faster feedback)

// Test results storage
const results = {
  timestamp: new Date().toISOString(),
  summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
  tests: [],
  issues: []
};

// HTTP request helper
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: TIMEOUT
    };

    const protocol = url.protocol === 'https:' ? https : http;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            parseError: e.message
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Test runner
async function runTest(testCase) {
  const startTime = Date.now();
  const result = {
    id: testCase.id,
    name: testCase.name,
    category: testCase.category,
    query: testCase.query,
    expectedIntent: testCase.expectedIntent,
    expectedEntities: testCase.expectedEntities,
    status: 'pending',
    responseTime: 0,
    response: null,
    errors: []
  };

  try {
    const response = await makeRequest('POST', '/api/nl/query', {
      query: testCase.query,
      context: testCase.context || {}
    });

    result.responseTime = Date.now() - startTime;
    result.response = response.data;
    result.httpStatus = response.status;

    // Evaluate test
    if (response.status !== 200) {
      result.status = 'failed';
      result.errors.push(`HTTP ${response.status}`);
    } else if (!response.data.success && testCase.expectSuccess !== false) {
      result.status = 'failed';
      result.errors.push(`API returned success=false: ${response.data.error || 'unknown error'}`);
    } else {
      // Check intent if specified
      if (testCase.expectedIntent) {
        const actualIntent = response.data.intent?.toLowerCase() || '';
        const expectedIntent = testCase.expectedIntent.toLowerCase();
        if (actualIntent !== expectedIntent && !actualIntent.includes(expectedIntent)) {
          result.errors.push(`Intent mismatch: expected "${expectedIntent}", got "${actualIntent}"`);
        }
      }

      // Check for LLM response quality (only a warning in mock mode)
      if (testCase.checkLLMResponse) {
        const answer = response.data.result?.answer || response.data.result?.llm_explanation || '';
        const isMockMode = response.data.confidence_reason?.includes('Python service not available') ||
                           response.data.result?.type === 'processed_response';
        if (!answer || answer.length < 20) {
          if (isMockMode) {
            // In mock mode, LLM not available is expected - just note it
            result.warnings = result.warnings || [];
            result.warnings.push('LLM not available (mock mode)');
          } else {
            result.errors.push('LLM response missing or too short');
          }
        }
      }

      // Check response time (warning only, not failure)
      if (result.responseTime > 10000) {
        result.warnings = result.warnings || [];
        result.warnings.push(`Slow response: ${result.responseTime}ms`);
      }

      result.status = result.errors.length === 0 ? 'passed' : 'failed';
    }
  } catch (error) {
    result.status = 'failed';
    result.responseTime = Date.now() - startTime;
    result.errors.push(error.message);
  }

  return result;
}

// Test definitions
const testCases = [
  // Suite 1: NL Query - Basic Understanding
  {
    id: 1,
    category: 'NL Query - Basic',
    name: 'P/E Ratio Lookup',
    query: "What is Apple's P/E ratio?",
    expectedIntent: 'lookup',
    expectedEntities: { symbols: ['AAPL'], metrics: ['pe_ratio'] },
    checkLLMResponse: true
  },
  {
    id: 2,
    category: 'NL Query - Basic',
    name: 'NOPAT Lookup (LLM-first test)',
    query: "What is the NOPAT of Apple?",
    expectedIntent: 'lookup',
    expectedEntities: { symbols: ['AAPL'], metrics: ['nopat'] },
    checkLLMResponse: true
  },
  {
    id: 3,
    category: 'NL Query - Basic',
    name: 'Stock Screening',
    query: "Show me undervalued tech stocks",
    expectedIntent: 'screen',
    checkLLMResponse: false
  },
  {
    id: 4,
    category: 'NL Query - Basic',
    name: 'Company Comparison',
    query: "Compare AAPL to MSFT",
    expectedIntent: 'compare',
    expectedEntities: { symbols: ['AAPL', 'MSFT'] }
  },
  {
    id: 5,
    category: 'NL Query - Basic',
    name: 'Similar Stocks',
    query: "Find stocks similar to Costco",
    expectedIntent: 'similarity',
    expectedEntities: { symbols: ['COST'] }
  },

  // Suite 2: NL Query - Complex & Edge Cases
  {
    id: 6,
    category: 'NL Query - Complex',
    name: 'Multi-filter Screen',
    query: "cheap tech stocks with high dividends",
    expectedIntent: 'screen'
  },
  {
    id: 7,
    category: 'NL Query - Complex',
    name: 'Driver Analysis',
    query: "What's driving NVDA's growth?",
    expectedIntent: 'driver',
    checkLLMResponse: true
  },
  {
    id: 8,
    category: 'NL Query - Complex',
    name: 'Investor Holdings',
    query: "Show Warren Buffett's holdings",
    expectedIntent: 'investor'
  },
  {
    id: 9,
    category: 'NL Query - Complex',
    name: 'Historical Analysis',
    query: "How has Tesla's revenue changed over 5 years?",
    expectedIntent: 'historical'
  },
  {
    id: 10,
    category: 'NL Query - Complex',
    name: 'Lowercase No Punctuation',
    query: "what is the PE of apple",
    expectedIntent: 'lookup',
    checkLLMResponse: true
  },

  // Suite 3: Error Handling
  {
    id: 15,
    category: 'Error Handling',
    name: 'Unknown Stock Symbol',
    query: "What is the P/E of XYZABC123?",
    expectedIntent: 'lookup',
    expectSuccess: true, // Should still return with helpful message
    checkLLMResponse: true
  },
  {
    id: 16,
    category: 'Error Handling',
    name: 'Nonsensical Query',
    query: "asdfghjkl qwerty",
    expectedIntent: 'unknown',
    expectSuccess: true // Should provide suggestions
  },
  {
    id: 17,
    category: 'Error Handling',
    name: 'Empty-like Query',
    query: "show me",
    expectedIntent: 'unknown',
    expectSuccess: true
  }
];

// Report generator
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('AI AGENT USER TESTING REPORT');
  console.log('='.repeat(80));
  console.log(`Generated: ${results.timestamp}`);
  console.log(`Server: ${BASE_URL}`);
  console.log('\n');

  // Summary
  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total Tests: ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed} (${((results.summary.passed/results.summary.total)*100).toFixed(1)}%)`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Skipped: ${results.summary.skipped}`);
  console.log('\n');

  // Group by category
  const categories = {};
  results.tests.forEach(t => {
    if (!categories[t.category]) {
      categories[t.category] = { passed: 0, failed: 0, tests: [] };
    }
    categories[t.category].tests.push(t);
    if (t.status === 'passed') categories[t.category].passed++;
    else if (t.status === 'failed') categories[t.category].failed++;
  });

  // Detailed results by category
  for (const [category, data] of Object.entries(categories)) {
    console.log(`\n${category.toUpperCase()}`);
    console.log('-'.repeat(40));
    console.log(`Results: ${data.passed}/${data.tests.length} passed`);
    console.log('');

    data.tests.forEach(test => {
      const statusIcon = test.status === 'passed' ? '[PASS]' : '[FAIL]';
      console.log(`${statusIcon} Test #${test.id}: ${test.name}`);
      console.log(`   Query: "${test.query}"`);
      console.log(`   Response Time: ${test.responseTime}ms`);

      if (test.response) {
        console.log(`   Intent: ${test.response.intent || 'N/A'}`);
        if (test.response.result?.answer) {
          const answer = test.response.result.answer.substring(0, 150);
          console.log(`   Answer: ${answer}${test.response.result.answer.length > 150 ? '...' : ''}`);
        }
        if (test.response.result?.type) {
          console.log(`   Result Type: ${test.response.result.type}`);
        }
      }

      if (test.errors.length > 0) {
        console.log(`   Errors: ${test.errors.join(', ')}`);
      }
      console.log('');
    });
  }

  // Issues summary
  if (results.issues.length > 0) {
    console.log('\nISSUES FOUND');
    console.log('-'.repeat(40));
    results.issues.forEach((issue, i) => {
      console.log(`${i+1}. ${issue}`);
    });
  }

  // Recommendations
  console.log('\nRECOMMENDATIONS');
  console.log('-'.repeat(40));

  const failedTests = results.tests.filter(t => t.status === 'failed');
  if (failedTests.length === 0) {
    console.log('All tests passed! The AI agents are working as expected.');
  } else {
    const intentFailures = failedTests.filter(t => t.errors.some(e => e.includes('Intent mismatch')));
    const llmFailures = failedTests.filter(t => t.errors.some(e => e.includes('LLM')));
    const timeoutFailures = failedTests.filter(t => t.errors.some(e => e.includes('timeout')));

    if (intentFailures.length > 0) {
      console.log(`- ${intentFailures.length} tests had intent classification issues. Review classifier patterns.`);
    }
    if (llmFailures.length > 0) {
      console.log(`- ${llmFailures.length} tests had LLM response issues. Check ANTHROPIC_API_KEY or OLLAMA_URL.`);
    }
    if (timeoutFailures.length > 0) {
      console.log(`- ${timeoutFailures.length} tests timed out. Server may be overloaded or LLM is slow.`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('END OF REPORT');
  console.log('='.repeat(80) + '\n');
}

// Check server health
async function checkServerHealth() {
  try {
    const response = await makeRequest('GET', '/api/ai/status');
    console.log('Server Status:', response.data);
    return response.status === 200;
  } catch (error) {
    console.error('Server health check failed:', error.message);
    return false;
  }
}

// Main execution
async function main() {
  console.log('AI Agent User Testing');
  console.log('=====================\n');
  console.log(`Testing server: ${BASE_URL}`);
  console.log(`Total test cases: ${testCases.length}\n`);

  // Check server health first
  console.log('Checking server health...');
  const serverHealthy = await checkServerHealth();

  if (!serverHealthy) {
    console.log('\nWARNING: Server health check failed. Tests may fail.');
    console.log('Make sure the server is running: npm start\n');
  }

  console.log('\nRunning tests...\n');

  // Run all tests
  for (const testCase of testCases) {
    process.stdout.write(`Running test #${testCase.id}: ${testCase.name}... `);
    const result = await runTest(testCase);
    results.tests.push(result);
    results.summary.total++;

    if (result.status === 'passed') {
      results.summary.passed++;
      console.log('PASS');
    } else if (result.status === 'failed') {
      results.summary.failed++;
      console.log('FAIL');
      if (result.errors.length > 0) {
        results.issues.push(`Test #${testCase.id} (${testCase.name}): ${result.errors.join(', ')}`);
      }
    } else {
      results.summary.skipped++;
      console.log('SKIP');
    }
  }

  // Generate report
  generateReport();

  // Exit with appropriate code
  process.exit(results.summary.failed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
