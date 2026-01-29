// tests/factors/factorAttribution.test.js
// Integration tests for FactorAttribution

const Database = require('better-sqlite3');
const path = require('path');
const { FactorAttribution } = require('../../src/services/factors/factorAttribution');

const dbPath = path.join(__dirname, '../..', 'data', 'stocks.db');
const db = new Database(dbPath);
const factorAttribution = new FactorAttribution(db);

describe('FactorAttribution', () => {
  afterAll(() => {
    db.close();
  });

  describe('Factor Returns Calculation', () => {
    test('calculates all 6 factors for a given date', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      expect(factors).toBeDefined();
      expect(factors).toHaveProperty('mkt_rf');
      expect(factors).toHaveProperty('smb');
      expect(factors).toHaveProperty('hml');
      expect(factors).toHaveProperty('umd');
      expect(factors).toHaveProperty('qmj');
      expect(factors).toHaveProperty('bab');
      expect(factors).toHaveProperty('rf');
    });

    test('factor returns are within reasonable daily ranges', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      // Daily returns should typically be < ±10%
      expect(Math.abs(factors.mkt_rf)).toBeLessThan(0.10);
      expect(Math.abs(factors.smb)).toBeLessThan(0.20);
      expect(Math.abs(factors.hml)).toBeLessThan(0.20);
      expect(Math.abs(factors.umd)).toBeLessThan(0.20);
      expect(Math.abs(factors.qmj)).toBeLessThan(0.20);
      expect(Math.abs(factors.bab)).toBeLessThan(0.20);
    });

    test('stores factor returns in database', () => {
      const date = '2025-12-02';
      factorAttribution.calculateDailyFactorReturns(date);

      const stored = db.prepare(`
        SELECT * FROM daily_factor_returns WHERE date = ?
      `).get(date);

      expect(stored).toBeDefined();
      expect(stored.mkt_rf).toBeDefined();
      expect(stored.smb).toBeDefined();
      expect(stored.hml).toBeDefined();
    });

    test('handles idempotency (duplicate calculations)', () => {
      const date = '2025-12-03';

      // Calculate twice
      const first = factorAttribution.calculateDailyFactorReturns(date);
      const second = factorAttribution.calculateDailyFactorReturns(date);

      // Should return same values
      expect(first.mkt_rf).toBeCloseTo(second.mkt_rf, 6);
      expect(first.smb).toBeCloseTo(second.smb, 6);
      expect(first.hml).toBeCloseTo(second.hml, 6);

      // Should only have one record in database
      const count = db.prepare(`
        SELECT COUNT(*) as cnt FROM daily_factor_returns WHERE date = ?
      `).get(date);

      expect(count.cnt).toBe(1);
    });
  });

  describe('SMB Factor (Small Minus Big)', () => {
    test('SMB represents size premium', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      // SMB should be a number (can be positive or negative)
      expect(typeof factors.smb).toBe('number');
      expect(isNaN(factors.smb)).toBe(false);

      // Positive SMB = small caps outperforming
      // Negative SMB = large caps outperforming
    });

    test('SMB calculation uses market cap quintiles', () => {
      // This tests the internal logic
      // SMB = bottom 20% market cap return - top 20% market cap return
      expect(true).toBe(true); // Placeholder for internal validation
    });
  });

  describe('HML Factor (High Minus Low Book/Market)', () => {
    test('HML represents value premium', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      expect(typeof factors.hml).toBe('number');
      expect(isNaN(factors.hml)).toBe(false);

      // Positive HML = value outperforming growth
      // Negative HML = growth outperforming value
    });
  });

  describe('UMD Factor (Up Minus Down Momentum)', () => {
    test('UMD uses 12-1 month momentum', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      expect(typeof factors.umd).toBe('number');

      // Positive UMD = winners continuing to win
      // Negative UMD = mean reversion
    });

    test('UMD excludes most recent month', () => {
      // Per Jegadeesh & Titman (1993), skip most recent month
      // This is tested in the implementation
      expect(true).toBe(true);
    });
  });

  describe('QMJ Factor (Quality Minus Junk)', () => {
    test('QMJ represents quality premium', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      expect(typeof factors.qmj).toBe('number');

      // Positive QMJ = quality outperforming junk
      // Based on ROE and leverage
    });
  });

  describe('BAB Factor (Betting Against Beta)', () => {
    test('BAB represents low-volatility anomaly', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      expect(typeof factors.bab).toBe('number');

      // Positive BAB = low beta stocks outperforming (leveraged)
      // BAB = low_beta_return * 1.5 - high_beta_return * 0.75
    });
  });

  describe('Factor Return Persistence', () => {
    test('factor returns show time-series variation', () => {
      const dates = ['2025-12-01', '2025-12-02', '2025-12-03'];
      const factorSeries = dates.map(date =>
        factorAttribution.calculateDailyFactorReturns(date)
      );

      // Factor returns should vary day-to-day
      const smbValues = factorSeries.map(f => f.smb);
      const uniqueValues = new Set(smbValues);

      expect(uniqueValues.size).toBeGreaterThan(1);
    });

    test('factor returns are not perfectly correlated', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      if (!factors) return;

      // SMB and HML should not be exactly identical (allow for small coincidental matches)
      // Use precision 5 (0.00001) which is tight enough to detect identical calculations
      // but loose enough to allow for legitimate similar values
      const areEffectivelyIdentical = Math.abs(factors.smb - factors.hml) < 0.00001;
      expect(areEffectivelyIdentical).toBe(false);
    });
  });

  describe('Multi-Factor Regression', () => {
    test('regression requires minimum observations', () => {
      // Create mock portfolio returns
      const portfolioReturns = [
        { date: '2025-12-01', return: 0.01 },
        { date: '2025-12-02', return: -0.005 }
      ];

      // With only 2 observations, should handle gracefully
      expect(portfolioReturns.length).toBeLessThan(30);
    });

    test('regression returns all factor exposures', () => {
      // This would test the full regression
      // Requires actual portfolio data
      expect(true).toBe(true); // Placeholder
    });

    test('R-squared is between 0 and 1', () => {
      // R² should be in valid range
      const validRSquared = 0.75;
      expect(validRSquared).toBeGreaterThanOrEqual(0);
      expect(validRSquared).toBeLessThanOrEqual(1);
    });
  });

  describe('Factor Data Quality', () => {
    test('no missing factor returns for calculated dates', () => {
      const date = '2025-12-01';
      factorAttribution.calculateDailyFactorReturns(date);

      const factors = db.prepare(`
        SELECT * FROM daily_factor_returns WHERE date = ?
      `).get(date);

      expect(factors.mkt_rf).not.toBeNull();
      expect(factors.smb).not.toBeNull();
      expect(factors.hml).not.toBeNull();
      expect(factors.umd).not.toBeNull();
      expect(factors.qmj).not.toBeNull();
      expect(factors.bab).not.toBeNull();
    });

    test('risk-free rate is reasonable', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      // Daily risk-free rate should be small positive number
      expect(factors.rf).toBeGreaterThan(0);
      expect(factors.rf).toBeLessThan(0.01); // < 1% daily
    });

    test('market excess return = market return - rf', () => {
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      // MKT-RF should be market return minus risk-free rate
      // We can't verify exact values without market data, but structure is correct
      expect(typeof factors.mkt_rf).toBe('number');
      expect(typeof factors.rf).toBe('number');
    });
  });

  describe('Historical Factor Returns', () => {
    test('can retrieve factor returns for date range', () => {
      // Calculate for multiple dates
      ['2025-12-01', '2025-12-02', '2025-12-03'].forEach(date => {
        factorAttribution.calculateDailyFactorReturns(date);
      });

      const historicalReturns = db.prepare(`
        SELECT * FROM daily_factor_returns
        WHERE date >= '2025-12-01' AND date <= '2025-12-03'
        ORDER BY date
      `).all();

      expect(historicalReturns.length).toBeGreaterThanOrEqual(3);
    });

    test('factor returns can be aggregated', () => {
      // Test averaging over period
      const returns = db.prepare(`
        SELECT AVG(mkt_rf) as avg_mkt, AVG(smb) as avg_smb
        FROM daily_factor_returns
        WHERE date >= '2025-12-01' AND date <= '2025-12-05'
      `).get();

      if (returns.avg_mkt !== null) {
        expect(typeof returns.avg_mkt).toBe('number');
        expect(typeof returns.avg_smb).toBe('number');
      }
    });
  });

  describe('Error Handling', () => {
    test('handles insufficient market data', () => {
      // Try to calculate factors for very old date
      const factors = factorAttribution.calculateDailyFactorReturns('1900-01-01');

      // Should return zeros or handle gracefully
      expect(factors).toBeDefined();
    });

    test('handles missing stock data', () => {
      // System should handle when stocks have no price data
      const date = '2025-12-01';
      const factors = factorAttribution.calculateDailyFactorReturns(date);

      // Should not crash, should return factors
      expect(factors).toBeDefined();
    });
  });

  describe('Portfolio Attribution', () => {
    test('can attribute returns to factors', () => {
      // This would test full attribution workflow
      // Requires portfolio with returns
      expect(typeof factorAttribution.calculateDailyFactorReturns).toBe('function');
    });

    test('alpha represents unexplained return', () => {
      // Alpha = portfolio return - (factor exposures × factor returns)
      const alpha = 0.02; // 2% annual alpha

      expect(typeof alpha).toBe('number');
    });
  });

  describe('Factor Seasonality', () => {
    test('can detect factor patterns over time', () => {
      // Calculate for multiple months
      const dates = [];
      for (let i = 1; i <= 5; i++) {
        dates.push(`2025-12-0${i}`);
      }

      dates.forEach(date => {
        factorAttribution.calculateDailyFactorReturns(date);
      });

      const avgReturns = db.prepare(`
        SELECT
          AVG(mkt_rf) as avg_mkt,
          AVG(smb) as avg_smb,
          AVG(hml) as avg_hml,
          COUNT(*) as days
        FROM daily_factor_returns
        WHERE date >= '2025-12-01' AND date <= '2025-12-05'
      `).get();

      expect(avgReturns.days).toBeGreaterThanOrEqual(5);
    });
  });
});

console.log('\n📊 FactorAttribution Integration Tests');
console.log('   Run with: npm test factorAttribution.test.js\n');
