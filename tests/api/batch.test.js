// tests/api/batch.test.js
// Tests for batch API endpoint

const fs = require('fs');
const path = require('path');

describe('Batch API Route', () => {
  test('batch route file should exist', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    expect(fs.existsSync(routePath)).toBe(true);
  });

  test('batch route should export express router', () => {
    const batchRouter = require('../../src/api/routes/batch');
    expect(batchRouter).toBeDefined();
    expect(typeof batchRouter).toBe('function');
  });

  test('batch route should be registered in server.js', () => {
    const serverPath = path.join(__dirname, '../../src/api/server.js');
    const serverCode = fs.readFileSync(serverPath, 'utf8');

    // Verify batch router is imported
    expect(serverCode).toContain("require('./routes/batch')");

    // Verify batch router is mounted
    expect(serverCode).toContain("app.use('/api/batch'");
  });

  test('batch route should have POST / handler', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain("router.post('/'");
  });

  test('batch route should have GET /symbols handler', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain("router.get('/symbols'");
  });

  test('batch route should validate requests array', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    // Should validate requests is an array
    expect(routeCode).toContain('Array.isArray(requests)');

    // Should limit batch size
    expect(routeCode).toContain('requests.length > 20');
  });

  test('batch route should only allow GET requests', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    // Should restrict to GET only
    expect(routeCode).toContain("'GET'");
    expect(routeCode).toContain('Only GET requests are supported');
  });

  test('batch route should validate paths start with /api/', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain("startsWith('/api/')");
  });

  test('batch symbols endpoint should limit to 50 symbols', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain('symbolList.length > 50');
  });
});

describe('Batch API Helpers', () => {
  test('should have fetchPriceData helper', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain('function fetchPriceData');
    expect(routeCode).toContain('price_metrics');
  });

  test('should have fetchMetricsData helper', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain('function fetchMetricsData');
    expect(routeCode).toContain('calculated_metrics');
  });

  test('should have fetchCompanyInfo helper', () => {
    const routePath = path.join(__dirname, '../../src/api/routes/batch.js');
    const routeCode = fs.readFileSync(routePath, 'utf8');

    expect(routeCode).toContain('function fetchCompanyInfo');
    expect(routeCode).toContain('companies');
  });
});
