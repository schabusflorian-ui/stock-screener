// tests/unified-strategy/testRunner.js
// Comprehensive test runner for the Unified Strategy System
// Run with: node tests/unified-strategy/testRunner.js

const path = require('path');

// Test result tracking
class TestRunner {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      errors: [],
      failures: [],
      tests: [],
      suites: {}
    };
    this.currentSuite = null;
  }

  suite(name, fn) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SUITE: ${name}`);
    console.log('='.repeat(60));

    this.currentSuite = name;
    this.results.suites[name] = { passed: 0, failed: 0, tests: [] };

    try {
      fn();
    } catch (err) {
      console.error(`Suite error: ${err.message}`);
      this.results.errors.push({ suite: name, error: err.message });
    }
  }

  async asyncSuite(name, fn) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SUITE: ${name}`);
    console.log('='.repeat(60));

    this.currentSuite = name;
    this.results.suites[name] = { passed: 0, failed: 0, tests: [] };

    try {
      await fn();
    } catch (err) {
      console.error(`Suite error: ${err.message}`);
      this.results.errors.push({ suite: name, error: err.message });
    }
  }

  test(name, fn) {
    process.stdout.write(`  ${name}... `);

    const testResult = { name, suite: this.currentSuite, status: 'unknown', error: null, passed: false };
    this.results.total++;

    try {
      fn();
      console.log('\x1b[32mPASSED\x1b[0m');
      testResult.status = 'passed';
      testResult.passed = true;
      this.results.passed++;
      this.results.suites[this.currentSuite].passed++;
    } catch (err) {
      console.log('\x1b[31mFAILED\x1b[0m');
      console.log(`    Error: ${err.message}`);
      testResult.status = 'failed';
      testResult.error = err.message;
      this.results.failed++;
      this.results.suites[this.currentSuite].failed++;
      this.results.errors.push({ suite: this.currentSuite, test: name, error: err.message });
      this.results.failures.push({ suite: this.currentSuite, test: name, message: err.message });
    }

    this.results.tests.push(testResult);
    this.results.suites[this.currentSuite].tests.push(testResult);
  }

  async asyncTest(name, fn) {
    process.stdout.write(`  ${name}... `);

    const testResult = { name, suite: this.currentSuite, status: 'unknown', error: null, passed: false };
    this.results.total++;

    try {
      await fn();
      console.log('\x1b[32mPASSED\x1b[0m');
      testResult.status = 'passed';
      testResult.passed = true;
      this.results.passed++;
      this.results.suites[this.currentSuite].passed++;
    } catch (err) {
      console.log('\x1b[31mFAILED\x1b[0m');
      console.log(`    Error: ${err.message}`);
      testResult.status = 'failed';
      testResult.error = err.message;
      this.results.failed++;
      this.results.suites[this.currentSuite].failed++;
      this.results.errors.push({ suite: this.currentSuite, test: name, error: err.message });
      this.results.failures.push({ suite: this.currentSuite, test: name, message: err.message });
    }

    this.results.tests.push(testResult);
    this.results.suites[this.currentSuite].tests.push(testResult);
  }

  skip(name) {
    console.log(`  ${name}... \x1b[33mSKIPPED\x1b[0m`);
    this.results.skipped++;
    this.results.suites[this.currentSuite].tests.push({ name, status: 'skipped' });
  }

  // Assertion helpers
  assert(condition, message = 'Assertion failed') {
    if (!condition) {
      throw new Error(message);
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
  }

  assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(message || `Objects not equal:\nExpected: ${expectedStr}\nActual: ${actualStr}`);
    }
  }

  assertInRange(value, min, max, message) {
    if (value < min || value > max) {
      throw new Error(message || `Value ${value} not in range [${min}, ${max}]`);
    }
  }

  assertThrows(fn, expectedError) {
    try {
      fn();
      throw new Error(`Expected function to throw ${expectedError || 'an error'}`);
    } catch (err) {
      if (expectedError && !err.message.includes(expectedError)) {
        throw new Error(`Expected error containing "${expectedError}", got "${err.message}"`);
      }
    }
  }

  async assertAsyncThrows(fn, expectedError) {
    try {
      await fn();
      throw new Error(`Expected function to throw ${expectedError || 'an error'}`);
    } catch (err) {
      if (expectedError && !err.message.includes(expectedError)) {
        throw new Error(`Expected error containing "${expectedError}", got "${err.message}"`);
      }
    }
  }

  assertDefined(value, message) {
    if (value === undefined || value === null) {
      throw new Error(message || 'Value is undefined or null');
    }
  }

  assertArray(value, message) {
    if (!Array.isArray(value)) {
      throw new Error(message || `Expected array, got ${typeof value}`);
    }
  }

  assertObject(value, message) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(message || `Expected object, got ${typeof value}`);
    }
  }

  // Get results for external reporting
  getResults() {
    return {
      total: this.results.total,
      passed: this.results.passed,
      failed: this.results.failed,
      skipped: this.results.skipped,
      failures: this.results.failures,
      tests: this.results.tests,
      suites: this.results.suites
    };
  }

  // Print summary
  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const total = this.results.passed + this.results.failed + this.results.skipped;

    console.log(`\nTotal: ${total} tests`);
    console.log(`  \x1b[32mPassed: ${this.results.passed}\x1b[0m`);
    console.log(`  \x1b[31mFailed: ${this.results.failed}\x1b[0m`);
    console.log(`  \x1b[33mSkipped: ${this.results.skipped}\x1b[0m`);

    if (this.results.errors.length > 0) {
      console.log('\n\x1b[31mFailed Tests:\x1b[0m');
      for (const err of this.results.errors) {
        console.log(`  - ${err.suite}${err.test ? ` > ${err.test}` : ''}: ${err.error}`);
      }
    }

    console.log('\nSuite Results:');
    for (const [name, suite] of Object.entries(this.results.suites)) {
      const status = suite.failed === 0 ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      console.log(`  ${status} ${name}: ${suite.passed}/${suite.passed + suite.failed} passed`);
    }

    const success = this.results.failed === 0;
    console.log(`\n${success ? '\x1b[32m✓ All tests passed!\x1b[0m' : '\x1b[31m✗ Some tests failed\x1b[0m'}`);

    return success;
  }
}

module.exports = TestRunner;

// Run tests if executed directly
if (require.main === module) {
  const runAllTests = require('./runAllTests');
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
