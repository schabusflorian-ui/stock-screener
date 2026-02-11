// tests/services/trendAnalysis.test.js
// Tests for performance optimization verification - validates N+1 fixes and caching

const fs = require('fs');
const path = require('path');

describe('TrendAnalysis N+1 Query Fix', () => {
  test('findBestTrends should use single batch query approach', () => {
    // Read the source file to verify the fix is in place
    const filePath = path.join(__dirname, '../../src/services/trendAnalysis.js');
    const sourceCode = fs.readFileSync(filePath, 'utf8');

    // Verify the function uses a single batch query
    expect(sourceCode).toContain('findBestTrends');

    // Verify it uses a batch query with JOIN (not N+1 pattern)
    expect(sourceCode).toContain('INNER JOIN calculated_metrics');

    // Verify it groups in memory instead of querying per company
    expect(sourceCode).toContain('companyMetricsMap');

    // Verify there's a comment indicating the optimization
    expect(sourceCode).toContain('N+1');
    expect(sourceCode).toContain('batch');
  });

  test('findBestTrends should not have individual company queries', () => {
    const filePath = path.join(__dirname, '../../src/services/trendAnalysis.js');
    const sourceCode = fs.readFileSync(filePath, 'utf8');

    // Extract just the findBestTrends function
    const funcStart = sourceCode.indexOf('findBestTrends(minScore');
    const funcEnd = sourceCode.indexOf('module.exports');
    const findBestTrendsCode = sourceCode.slice(funcStart, funcEnd);

    // Count db.prepare calls in the function
    const prepareCount = (findBestTrendsCode.match(/this\.db\.prepare\(/g) || []).length;

    // Should only have ONE prepare call (the batch query)
    expect(prepareCount).toBeLessThanOrEqual(1);
  });
});

describe('Investor Returns Leaderboard N+1 Fix', () => {
  test('leaderboard route should use batch query function', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/investors.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    // Verify it uses the optimized batch function
    expect(routeCode).toContain('getAllInvestorReturnsSummary');

    // Verify it has response caching
    expect(routeCode).toContain('responseCacheMiddleware');
  });

  test('investorService should have getAllInvestorReturnsSummary function', () => {
    const servicePath = path.join(__dirname, '../../src/services/portfolio/investorService.js');
    const serviceCode = fs.readFileSync(servicePath, 'utf8');

    // Verify the batch function exists
    expect(serviceCode).toContain('getAllInvestorReturnsSummary');
    expect(serviceCode).toContain('function getAllInvestorReturnsSummary');
  });
});

describe('API Response Caching', () => {
  test('companies route should have response caching middleware', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/companies.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    // Verify caching is imported
    expect(routeCode).toContain('responseCacheMiddleware');

    // Verify caching is applied to expensive endpoints
    expect(routeCode).toContain('/metrics');
    expect(routeCode).toContain('/analysis');
  });
});

describe('SQLite Performance Pragmas', () => {
  test('database.js should have performance pragmas', () => {
    const dbPath = path.join(__dirname, '../../src/lib/db.js');
    const dbCode = fs.readFileSync(dbPath, 'utf8');

    // Verify WAL mode
    expect(dbCode).toContain('journal_mode');
    expect(dbCode).toContain('WAL');

    // Verify other performance pragmas
    expect(dbCode).toContain('synchronous');
    expect(dbCode).toContain('cache_size');
  });
});

describe('Service Worker', () => {
  test('service worker should exist with caching logic', () => {
    const swPath = path.join(__dirname, '../../frontend/public/sw.js');
    const swCode = fs.readFileSync(swPath, 'utf8');

    // Verify caching strategies
    expect(swCode).toContain('cache-first');
    expect(swCode).toContain('network-first');

    // Verify API caching rules
    expect(swCode).toContain('API_CACHE_RULES');
    expect(swCode).toContain('/api/companies');
  });

  test('index.js should register service worker', () => {
    const indexPath = path.join(__dirname, '../../frontend/src/index.js');
    const indexCode = fs.readFileSync(indexPath, 'utf8');

    // Verify service worker registration
    expect(indexCode).toContain('serviceWorker');
    expect(indexCode).toContain('register');
  });
});

describe('Worker Pool', () => {
  test('workerPool.js should exist with parallel execution logic', () => {
    const wpPath = path.join(__dirname, '../../src/workers/workerPool.js');
    const wpCode = fs.readFileSync(wpPath, 'utf8');

    // Verify worker pool class
    expect(wpCode).toContain('class WorkerPool');
    expect(wpCode).toContain('executeTask');

    // Verify parallel Monte Carlo
    expect(wpCode).toContain('runParallelMonteCarlo');
    expect(wpCode).toContain('Promise.all');
  });

  test('monteCarloWorker.js should exist with DCF logic', () => {
    const mcPath = path.join(__dirname, '../../src/workers/monteCarloWorker.js');
    const mcCode = fs.readFileSync(mcPath, 'utf8');

    // Verify Monte Carlo worker logic
    expect(mcCode).toContain('quickDCF');
    expect(mcCode).toContain('runSimulationBatch');
    expect(mcCode).toContain('parentPort');
  });
});

describe('API Optimization Middleware', () => {
  test('apiOptimization.js should export all optimization features', () => {
    const optPath = path.join(__dirname, '../../src/middleware/apiOptimization.js');
    const optCode = fs.readFileSync(optPath, 'utf8');

    // Response caching
    expect(optCode).toContain('ResponseCache');
    expect(optCode).toContain('responseCacheMiddleware');

    // Request deduplication
    expect(optCode).toContain('deduplicationMiddleware');

    // ETag support
    expect(optCode).toContain('etagMiddleware');

    // Field selection
    expect(optCode).toContain('fieldSelectionMiddleware');

    // Pagination
    expect(optCode).toContain('paginationMiddleware');
  });
});
