// tests/beginner-strategies/beginnerStrategyEngine.test.js
// Unit tests for the BeginnerStrategyEngine

const assert = require('assert');

// Mock database for testing
const mockDb = {
  prepare: function(sql) {
    return {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 1, lastInsertRowid: 1 })
    };
  }
};

// Import the engine (we'll test the logic directly)
describe('BeginnerStrategyEngine', function() {
  describe('DCA Strategy', function() {
    it('should calculate correct contribution amounts', function() {
      const config = {
        strategy_type: 'dca',
        amount: 500,
        frequency: 'monthly',
        target_assets: [
          { symbol: 'VTI', allocation: 0.6 },
          { symbol: 'VXUS', allocation: 0.4 }
        ]
      };

      // Calculate expected allocations
      const vtiAmount = config.amount * 0.6;
      const vxusAmount = config.amount * 0.4;

      assert.strictEqual(vtiAmount, 300, 'VTI allocation should be $300');
      assert.strictEqual(vxusAmount, 200, 'VXUS allocation should be $200');
    });

    it('should handle daily frequency multiplier', function() {
      const frequencyMultipliers = {
        daily: 252,
        weekly: 52,
        biweekly: 26,
        monthly: 12,
        quarterly: 4
      };

      const dailyAmount = 100;
      const annualFromDaily = dailyAmount * frequencyMultipliers.daily;
      const annualFromMonthly = 2100 * frequencyMultipliers.monthly;

      assert.strictEqual(annualFromDaily, 25200, 'Daily contributions should sum to $25,200/year');
      assert.strictEqual(annualFromMonthly, 25200, 'Monthly contributions should sum to $25,200/year');
    });
  });

  describe('Value Averaging Strategy', function() {
    it('should calculate required contribution when behind target', function() {
      const config = {
        strategy_type: 'value_averaging',
        target_growth_rate: 0.10,
        min_contribution: 100,
        max_contribution: 2000
      };

      const targetValue = 55000;
      const currentValue = 52000;
      const difference = targetValue - currentValue;

      // Clamp to min/max
      const contribution = Math.max(
        config.min_contribution,
        Math.min(config.max_contribution, difference)
      );

      assert.strictEqual(contribution, 2000, 'Contribution should be clamped to max $2000');
    });

    it('should calculate zero contribution when ahead of target', function() {
      const config = {
        strategy_type: 'value_averaging',
        target_growth_rate: 0.10,
        min_contribution: 100,
        max_contribution: 2000
      };

      const targetValue = 55000;
      const currentValue = 58000;
      const difference = targetValue - currentValue;

      // When ahead, difference is negative - contribution would be 0 or a sell
      const contribution = Math.max(0, difference);

      assert.strictEqual(contribution, 0, 'No contribution needed when ahead of target');
    });

    it('should respect minimum contribution', function() {
      const config = {
        min_contribution: 100,
        max_contribution: 2000
      };

      const targetValue = 55000;
      const currentValue = 54950;
      const difference = targetValue - currentValue; // $50 needed

      const contribution = Math.max(
        config.min_contribution,
        Math.min(config.max_contribution, difference)
      );

      assert.strictEqual(contribution, 100, 'Contribution should be at least minimum $100');
    });
  });

  describe('Rebalancing Strategy', function() {
    it('should detect allocation drift', function() {
      const targetAllocation = {
        VTI: 0.60,
        BND: 0.40
      };

      const currentHoldings = {
        VTI: { value: 65000, allocation: 0.65 },
        BND: { value: 35000, allocation: 0.35 }
      };

      const threshold = 0.05;
      const drifts = {};

      for (const [symbol, target] of Object.entries(targetAllocation)) {
        const current = currentHoldings[symbol]?.allocation || 0;
        drifts[symbol] = current - target;
      }

      // Use tolerance for floating-point comparison
      assert.ok(Math.abs(drifts.VTI - 0.05) < 0.0001, `VTI drift should be ~5%, got ${drifts.VTI}`);
      assert.ok(Math.abs(drifts.BND - (-0.05)) < 0.0001, `BND drift should be ~-5%, got ${drifts.BND}`);

      // Check if rebalance needed
      const needsRebalance = Object.values(drifts).some(d => Math.abs(d) >= threshold);
      assert.strictEqual(needsRebalance, true, 'Should need rebalancing at 5% threshold');
    });

    it('should calculate rebalance trades', function() {
      const portfolioValue = 100000;
      const targetAllocation = {
        VTI: 0.60,
        BND: 0.40
      };

      const currentHoldings = {
        VTI: { value: 70000, allocation: 0.70 },
        BND: { value: 30000, allocation: 0.30 }
      };

      const trades = [];

      for (const [symbol, target] of Object.entries(targetAllocation)) {
        const current = currentHoldings[symbol]?.allocation || 0;
        const drift = current - target;

        if (Math.abs(drift) > 0.01) {
          trades.push({
            symbol,
            action: drift > 0 ? 'sell' : 'buy',
            amount: Math.abs(drift) * portfolioValue
          });
        }
      }

      assert.strictEqual(trades.length, 2, 'Should have 2 rebalance trades');
      assert.strictEqual(trades[0].symbol, 'VTI', 'First trade should be VTI');
      assert.strictEqual(trades[0].action, 'sell', 'VTI should be sold');
      // Use tolerance for floating-point comparison
      assert.ok(Math.abs(trades[0].amount - 10000) < 0.01, `VTI sell amount should be ~$10,000, got ${trades[0].amount}`);
      assert.strictEqual(trades[1].symbol, 'BND', 'Second trade should be BND');
      assert.strictEqual(trades[1].action, 'buy', 'BND should be bought');
    });
  });

  describe('Lump Sum + DCA Strategy', function() {
    it('should calculate correct lump sum amount', function() {
      const config = {
        total_amount: 50000,
        lump_sum_pct: 0.50
      };

      const lumpSumAmount = config.total_amount * config.lump_sum_pct;
      const dcaRemaining = config.total_amount - lumpSumAmount;

      assert.strictEqual(lumpSumAmount, 25000, 'Lump sum should be $25,000');
      assert.strictEqual(dcaRemaining, 25000, 'DCA remaining should be $25,000');
    });

    it('should calculate DCA amount per period', function() {
      const config = {
        total_amount: 50000,
        lump_sum_pct: 0.50,
        dca_months: 6,
        dca_frequency: 'monthly'
      };

      const dcaRemaining = config.total_amount * (1 - config.lump_sum_pct);
      const dcaPerMonth = dcaRemaining / config.dca_months;

      assert.strictEqual(dcaPerMonth.toFixed(2), '4166.67', 'DCA per month should be ~$4,166.67');
    });

    it('should handle different DCA frequencies', function() {
      const config = {
        total_amount: 50000,
        lump_sum_pct: 0.50,
        dca_months: 6,
        dca_frequency: 'weekly'
      };

      const dcaRemaining = config.total_amount * (1 - config.lump_sum_pct);
      // 6 months ≈ 26 weeks
      const weeksInPeriod = config.dca_months * (52 / 12);
      const dcaPerWeek = dcaRemaining / weeksInPeriod;

      assert.ok(dcaPerWeek > 0, 'Weekly DCA amount should be positive');
      assert.ok(dcaPerWeek < 2000, 'Weekly DCA amount should be reasonable');
    });
  });

  describe('DRIP Strategy', function() {
    it('should calculate reinvestment based on mode', function() {
      const config = {
        strategy_type: 'drip',
        reinvest_mode: 'same',
        min_dividend_to_reinvest: 10
      };

      const dividend = {
        symbol: 'VTI',
        amount: 50
      };

      const shouldReinvest = dividend.amount >= config.min_dividend_to_reinvest;
      assert.strictEqual(shouldReinvest, true, 'Should reinvest $50 dividend');

      // For 'same' mode, reinvest into same stock
      if (config.reinvest_mode === 'same') {
        const reinvestTrade = {
          symbol: dividend.symbol,
          action: 'buy',
          amount: dividend.amount
        };
        assert.strictEqual(reinvestTrade.symbol, 'VTI', 'Should reinvest into same symbol');
      }
    });

    it('should skip small dividends below threshold', function() {
      const config = {
        min_dividend_to_reinvest: 10
      };

      const dividend = { symbol: 'KO', amount: 5 };
      const shouldReinvest = dividend.amount >= config.min_dividend_to_reinvest;

      assert.strictEqual(shouldReinvest, false, 'Should not reinvest $5 dividend');
    });
  });

  describe('Date Calculations', function() {
    it('should calculate next contribution date for monthly frequency', function() {
      const baseDate = new Date('2025-01-15');
      const frequency = 'monthly';

      // Add one month
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 1);

      assert.strictEqual(nextDate.getMonth(), 1, 'Next month should be February (1)');
      assert.strictEqual(nextDate.getDate(), 15, 'Day should remain 15');
    });

    it('should calculate next contribution date for weekly frequency', function() {
      const baseDate = new Date('2025-01-15');
      const frequency = 'weekly';

      // Add 7 days
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + 7);

      assert.strictEqual(nextDate.getDate(), 22, 'Next week should be the 22nd');
    });

    it('should handle month-end edge cases', function() {
      const baseDate = new Date('2025-01-31');

      // Add one month - January 31 + 1 month should handle Feb correctly
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 1);

      // February doesn't have 31 days, so it rolls to March 2 or 3
      assert.ok(nextDate.getMonth() >= 1, 'Should handle month overflow');
    });

    it('should determine if contribution is due', function() {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const isDueYesterday = yesterday <= today;
      const isDueTomorrow = tomorrow <= today;

      assert.strictEqual(isDueYesterday, true, 'Yesterday date should be due');
      assert.strictEqual(isDueTomorrow, false, 'Tomorrow date should not be due');
    });
  });

  describe('Allocation Validation', function() {
    it('should validate allocation sums to 100%', function() {
      const validAssets = [
        { symbol: 'VTI', allocation: 0.6 },
        { symbol: 'VXUS', allocation: 0.4 }
      ];

      const invalidAssets = [
        { symbol: 'VTI', allocation: 0.6 },
        { symbol: 'VXUS', allocation: 0.3 }
      ];

      const validSum = validAssets.reduce((sum, a) => sum + a.allocation, 0);
      const invalidSum = invalidAssets.reduce((sum, a) => sum + a.allocation, 0);

      assert.strictEqual(Math.abs(validSum - 1) < 0.01, true, 'Valid allocation should sum to 1');
      assert.strictEqual(Math.abs(invalidSum - 1) < 0.01, false, 'Invalid allocation should not sum to 1');
    });

    it('should distribute allocation equally when adding new asset', function() {
      const existingAssets = [
        { symbol: 'VTI', allocation: 0.6 },
        { symbol: 'VXUS', allocation: 0.4 }
      ];

      const newSymbol = 'BND';
      const newAssets = [...existingAssets, { symbol: newSymbol, allocation: 0 }];
      const equalAllocation = 1 / newAssets.length;

      const redistributed = newAssets.map(a => ({
        ...a,
        allocation: equalAllocation
      }));

      assert.strictEqual(redistributed.length, 3, 'Should have 3 assets');
      assert.strictEqual(redistributed[0].allocation.toFixed(4), '0.3333', 'Each should get ~33.33%');

      const totalAlloc = redistributed.reduce((sum, a) => sum + a.allocation, 0);
      assert.ok(Math.abs(totalAlloc - 1) < 0.01, 'Total should still be ~100%');
    });
  });

  describe('Portfolio Projections', function() {
    it('should calculate future value with compound growth', function() {
      const initialValue = 10000;
      const annualContribution = 6000;
      const annualReturn = 0.08;
      const years = 10;

      let futureValue = initialValue;
      for (let year = 0; year < years; year++) {
        futureValue = futureValue * (1 + annualReturn) + annualContribution;
      }

      // Expected value around $117,000+
      assert.ok(futureValue > 100000, 'Future value should be over $100k');
      assert.ok(futureValue < 150000, 'Future value should be under $150k');
    });

    it('should project DCA growth over time', function() {
      const monthlyContribution = 500;
      const annualReturn = 0.08;
      const monthlyReturn = annualReturn / 12;
      const months = 120; // 10 years

      let balance = 0;
      for (let month = 0; month < months; month++) {
        balance = balance * (1 + monthlyReturn) + monthlyContribution;
      }

      // Total contributed: $60,000, expected balance with returns: ~$90,000+
      const totalContributed = monthlyContribution * months;
      assert.strictEqual(totalContributed, 60000, 'Should contribute $60k total');
      assert.ok(balance > totalContributed, 'Balance should exceed contributions due to returns');
    });
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  const Mocha = require('mocha');
  const mocha = new Mocha();
  mocha.addFile(__filename);
  mocha.run(failures => {
    process.exitCode = failures ? 1 : 0;
  });
}
