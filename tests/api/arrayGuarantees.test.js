/**
 * Unit tests: API routes enforce array guarantees (root-cause fixes).
 * Validates that route source code normalizes list responses with Array.isArray so
 * clients always receive arrays for decisions, holdings, performance, etc.
 */

const fs = require('fs');
const path = require('path');

const src = (p) => path.join(__dirname, '../../src/api/routes', p);

describe('API array guarantees (root cause)', () => {
  describe('historical.js', () => {
    let content;
    beforeAll(() => {
      content = fs.readFileSync(src('historical.js'), 'utf8');
    });

    it('GET /decisions normalizes decisions from DB and sends array', () => {
      expect(content).toMatch(/decisionsResult\.rows/);
      expect(content).toMatch(/Array\.isArray\(decisionsResult\.rows\)/);
      expect(content).toMatch(/decisions:\s*Array\.isArray\(decisions\)\s*\?\s*decisions\s*:\s*\[\]/);
    });

    it('GET /similar-decisions sends decisions as array', () => {
      expect(content).toMatch(/decisions:\s*Array\.isArray\(decisions\)\s*\?\s*decisions\s*:\s*\[\]/);
    });

    it('GET /performance-by-factor normalizes performance and sends array', () => {
      expect(content).toMatch(/Array\.isArray\(performanceResult\.rows\)/);
      expect(content).toMatch(/performance:\s*Array\.isArray\(performance\)\s*\?\s*performance\s*:\s*\[\]/);
    });
  });

  describe('investors.js', () => {
    let content;
    beforeAll(() => {
      content = fs.readFileSync(src('investors.js'), 'utf8');
    });

    it('GET /:id/holdings normalizes holdings and sends array', () => {
      expect(content).toMatch(/Array\.isArray\(data\.holdings\)/);
      expect(content).toMatch(/holdings:\s*Array\.isArray\(filteredHoldings\)/);
    });

    it('GET /:id/changes sends changes as array', () => {
      expect(content).toMatch(/Array\.isArray\(changes\)\s*\?\s*changes\s*:\s*\[\]/);
      expect(content).toMatch(/changes:\s*changesList/);
    });
  });

  describe('simulate.js', () => {
    let content;
    beforeAll(() => {
      content = fs.readFileSync(src('simulate.js'), 'utf8');
    });

    it('stress-test/scenarios returns data as array', () => {
      expect(content).toMatch(/Array\.isArray\(raw\)\s*\?\s*raw\s*:\s*\[\]/);
    });

    it('stress-test/all normalizes results array', () => {
      expect(content).toMatch(/results:\s*Array\.isArray\(result\.results\)/);
    });

    it('backtest run normalizes equityCurve and monthlyReturns', () => {
      expect(content).toMatch(/equityCurve:\s*Array\.isArray\(result\.equityCurve\)/);
      expect(content).toMatch(/monthlyReturns:\s*Array\.isArray\(result\.monthlyReturns\)/);
    });

    it('what-if normalizes tradesToExecute', () => {
      expect(content).toMatch(/tradesToExecute:\s*Array\.isArray\(result\.tradesToExecute\)/);
    });

    it('distribution normalizes returns', () => {
      expect(content).toMatch(/returns:\s*Array\.isArray\(result\.returns\)/);
    });

    it('rebalance-calc normalizes positions and trades', () => {
      expect(content).toMatch(/positions:\s*Array\.isArray\(result\.positions\)/);
      expect(content).toMatch(/trades:\s*Array\.isArray\(result\.trades\)/);
    });
  });

  describe('portfolios.js', () => {
    let content;
    beforeAll(() => {
      content = fs.readFileSync(src('portfolios.js'), 'utf8');
    });

    it('GET /:id/holdings sends holdings as array', () => {
      expect(content).toMatch(/holdings\s*=\s*Array\.isArray\(positions\)/);
      expect(content).toMatch(/count:\s*holdings\.length/);
    });

    it('GET /:id/orders sends orders as array', () => {
      expect(content).toMatch(/ordersList\s*=\s*Array\.isArray\(orders\)/);
    });

    it('GET /:id/transactions sends transactions as array', () => {
      expect(content).toMatch(/transactionsList\s*=\s*Array\.isArray\(transactions\)/);
    });

    it('GET /:id/positions sends positions as array', () => {
      expect(content).toMatch(/positionsList\s*=\s*Array\.isArray\(positions\)/);
    });
  });

  describe('etfs.js', () => {
    let content;
    beforeAll(() => {
      content = fs.readFileSync(src('etfs.js'), 'utf8');
    });

    it('GET / (list) sends etfs as array', () => {
      expect(content).toMatch(/etfs\s*=\s*Array\.isArray\(result\.etfs\)/);
      expect(content).toMatch(/count:\s*etfs\.length/);
    });
  });

  describe('paperTrading.js', () => {
    let content;
    beforeAll(() => {
      content = fs.readFileSync(src('paperTrading.js'), 'utf8');
    });

    it('GET /accounts sends data as array', () => {
      expect(content).toMatch(/Array\.isArray\(res_\.rows\)/);
    });

    it('GET /accounts/:id/positions sends data as array', () => {
      expect(content).toMatch(/positionsList\s*=\s*Array\.isArray\(positions\)/);
    });

    it('GET /accounts/:id/trades sends data as array', () => {
      expect(content).toMatch(/tradesList\s*=\s*Array\.isArray\(trades\)/);
    });
  });
});
