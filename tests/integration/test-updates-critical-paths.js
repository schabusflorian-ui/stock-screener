/**
 * Integration tests for update services critical paths.
 * Run from project root: node tests/integration/test-updates-critical-paths.js
 *
 * - Legacy updates API: status/quarters shape (SQLite) and 503 guard (Postgres)
 * - Price update path: PriceUpdateScheduler runUpdate result shape (mocked spawn)
 * - SEC/XBRL path: XBRLSyncService.resolvePendingTickers with limit 0 (no throw)
 */

const path = require('path');
const assert = require('assert');

const projectRoot = path.join(__dirname, '../..');
const srcPath = path.join(projectRoot, 'src');

async function testLegacyUpdatesApi() {
  console.log('\n--- Legacy updates API ---');
  const { isPostgres } = require(path.join(srcPath, 'database'));

  if (isPostgres) {
    const express = require('express');
    const http = require('http');
    const updatesRouter = require(path.join(srcPath, 'api/routes/updates'));
    const app = express();
    app.use(express.json());
    app.use('/api/updates', updatesRouter);
    const server = app.listen(0);
    const port = server.address().port;
    const [statusCode, body] = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/updates/status`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve([res.statusCode, data ? JSON.parse(data) : null]);
          } catch (e) {
            resolve([res.statusCode, null]);
          }
        });
      }).on('error', reject);
    });
    server.close();
    assert.strictEqual(statusCode, 503, 'Postgres: /api/updates/status should return 503');
    assert.ok(body && body.error && body.code === 'UPDATES_NOT_AVAILABLE');
    console.log('  OK Postgres guard returns 503 with UPDATES_NOT_AVAILABLE');
    return;
  }

  const db = require(path.join(srcPath, 'database'));
  const QuarterlyUpdater = require(path.join(srcPath, 'services/quarterlyUpdater'));
  const database = db.getDatabase();
  const updater = new QuarterlyUpdater(database);

  const currentQuarter = updater.getCurrentQuarter();
  const nextQuarter = updater.getNextQuarter();
  assert.ok(typeof currentQuarter === 'string' && /^\d{4}q[1-4]$/.test(currentQuarter));
  assert.ok(typeof nextQuarter === 'string');
  const status = await updater.getUpdateStatus();
  assert.ok(status === 'idle' || status === 'running' || typeof status === 'object');
  console.log('  OK SQLite: quarters and status shape valid');
}

async function testPriceUpdatePath() {
  console.log('\n--- Price update path ---');
  const EventEmitter = require('events');
  const originalSpawn = require('child_process').spawn;
  const fakeChild = new EventEmitter();
  fakeChild.stdout = new EventEmitter();
  fakeChild.stderr = new EventEmitter();
  require('child_process').spawn = () => {
    setImmediate(() => fakeChild.emit('close', 0));
    return fakeChild;
  };

  try {
    const PriceUpdateScheduler = require(path.join(srcPath, 'jobs/priceUpdateScheduler'));
    const scheduler = new PriceUpdateScheduler();
    const result = await scheduler.runUpdate('update');
    assert.ok(result && typeof result.success === 'boolean');
    assert.ok(typeof result.exitCode === 'number');
    assert.ok(result.timestamp);
    assert.ok(result.duration);
    console.log('  OK PriceUpdateScheduler.runUpdate returns result shape');
  } finally {
    require('child_process').spawn = originalSpawn;
  }
}

async function testXbrlPath() {
  console.log('\n--- SEC/XBRL path ---');
  const { XBRLSyncService } = require(path.join(srcPath, 'services/xbrl/xbrlSyncService'));
  const syncService = new XBRLSyncService({ autoResolveTickers: false });
  const result = await syncService.resolvePendingTickers(0, 100);
  assert.ok(result && typeof result === 'object');
  assert.ok(typeof result.processed === 'number');
  assert.ok(typeof result.resolved === 'number');
  assert.ok(typeof result.failed === 'number');
  console.log('  OK XBRLSyncService.resolvePendingTickers(0) returns shape');
}

async function main() {
  console.log('Update services critical paths integration test');
  try {
    await testLegacyUpdatesApi();
    await testPriceUpdatePath();
    await testXbrlPath();
    console.log('\nAll critical path checks passed.\n');
  } catch (err) {
    console.error('\nFailure:', err.message);
    process.exit(1);
  }
}

main();
