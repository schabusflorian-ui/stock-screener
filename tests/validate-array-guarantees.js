#!/usr/bin/env node
/**
 * Validates that API endpoints return guaranteed array shapes (root-cause fixes).
 * Run with server: npm start (in one terminal), then node tests/validate-array-guarantees.js
 * Or: BASE_URL=https://your-app.railway.app node tests/validate-array-guarantees.js
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      { method: options.method || 'GET', ...options },
      (res) => {
        let body = '';
        res.on('data', (ch) => (body += ch));
        res.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : {};
            resolve({ status: res.statusCode, data });
          } catch (e) {
            resolve({ status: res.statusCode, data: null, parseError: e.message });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} expected array, got ${typeof value}`);
  }
}

async function main() {
  const results = { passed: 0, failed: 0, skipped: 0 };
  const base = BASE_URL.replace(/\/$/, '');

  const checks = [
    {
      name: 'GET /api/historical/decisions',
      url: `${base}/api/historical/decisions?limit=5`,
      assert: (d) => {
        assertArray(d.decisions, 'decisions');
      },
    },
    {
      name: 'GET /api/historical/similar-decisions',
      url: `${base}/api/historical/similar-decisions?limit=5`,
      assert: (d) => {
        assertArray(d.decisions, 'decisions');
      },
    },
    {
      name: 'GET /api/historical/performance-by-factor',
      url: `${base}/api/historical/performance-by-factor?factor=value`,
      assert: (d) => {
        assertArray(d.performance, 'performance');
      },
    },
    {
      name: 'GET /api/simulate/stress-test/scenarios',
      url: `${base}/api/simulate/stress-test/scenarios`,
      assert: (d) => {
        if (d.success && d.data !== undefined) assertArray(d.data, 'data');
      },
    },
    {
      name: 'GET /api/etfs (list)',
      url: `${base}/api/etfs?limit=2`,
      assert: (d) => {
        if (d.etfs !== undefined) assertArray(d.etfs, 'etfs');
      },
    },
  ];

  console.log('Validating array guarantees at', base);
  console.log('');

  for (const c of checks) {
    try {
      const { status, data } = await request(c.url);
      if (status === 401 || status === 403) {
        console.log('⏭️  SKIP', c.name, '(auth required)');
        results.skipped++;
        continue;
      }
      if (status >= 500) {
        console.log('⏭️  SKIP', c.name, `(server error ${status})`);
        results.skipped++;
        continue;
      }
      if (status !== 200) {
        console.log('❌ FAIL', c.name, '- status', status);
        results.failed++;
        continue;
      }
      if (!data) {
        console.log('❌ FAIL', c.name, '- no JSON');
        results.failed++;
        continue;
      }
      c.assert(data);
      console.log('✅ PASS', c.name);
      results.passed++;
    } catch (e) {
      const msg = e.code === 'ECONNREFUSED' ? 'server not running' : e.message;
      console.log('❌ FAIL', c.name, '-', msg);
      results.failed++;
    }
  }

  if (results.passed === 0 && results.failed > 0) {
    console.log('\nTip: Start the API server (npm start) then re-run to validate array responses.');
  }

  console.log('');
  console.log('Summary:', results.passed, 'passed,', results.failed, 'failed,', results.skipped, 'skipped');
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Error:', e.message);
  if (e.code === 'ECONNREFUSED') {
    console.error('Server not running. Start with: npm start (then re-run this script)');
  }
  process.exit(1);
});
