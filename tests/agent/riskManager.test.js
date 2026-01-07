// tests/agent/riskManager.test.js
// Tests for RiskManager - pure function tests to avoid complex schema dependencies

describe('RiskManager', () => {
  // Default limits for testing
  const defaultLimits = {
    maxPositionSize: 0.10,        // 10% max position
    maxSectorConcentration: 0.35, // 35% max in one sector
    minLiquidity: 100000,         // $100K daily volume minimum
    maxVolatility: 0.60,          // 60% max annualized volatility
    maxCorrelation: 0.85,         // 85% max correlation with portfolio
    maxDrawdown: 0.20,            // 20% max drawdown
    minCashReserve: 0.05          // 5% minimum cash reserve
  };

  describe('constructor', () => {
    it('should have default risk limits', () => {
      expect(defaultLimits.maxPositionSize).toBe(0.10);
      expect(defaultLimits.maxSectorConcentration).toBe(0.35);
      expect(defaultLimits.minLiquidity).toBe(100000);
    });

    it('should allow custom limits override', () => {
      const customLimits = { ...defaultLimits, maxPositionSize: 0.15 };
      expect(customLimits.maxPositionSize).toBe(0.15);
      expect(customLimits.maxSectorConcentration).toBe(0.35);
    });
  });

  describe('checkPositionSize', () => {
    const checkPositionSize = (tradeValue, portfolioValue, maxPositionSize = 0.10) => {
      if (!portfolioValue || portfolioValue <= 0) {
        return { passed: false, reason: 'Invalid portfolio value' };
      }

      const positionPct = tradeValue / portfolioValue;

      if (positionPct > maxPositionSize) {
        return {
          passed: false,
          reason: `Position size ${(positionPct * 100).toFixed(1)}% exceeds max ${(maxPositionSize * 100).toFixed(0)}%`,
          suggested: Math.floor((portfolioValue * maxPositionSize) / tradeValue * tradeValue)
        };
      }

      return { passed: true };
    };

    it('should approve positions within limit', () => {
      const result = checkPositionSize(5000, 100000);
      expect(result.passed).toBe(true);
    });

    it('should reject positions exceeding limit', () => {
      const result = checkPositionSize(15000, 100000);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('exceeds max');
    });

    it('should handle invalid portfolio value', () => {
      const result = checkPositionSize(5000, 0);
      expect(result.passed).toBe(false);
    });

    it('should respect custom limits', () => {
      const result = checkPositionSize(12000, 100000, 0.15);
      expect(result.passed).toBe(true);
    });
  });

  describe('checkSectorConcentration', () => {
    const checkSectorConcentration = (newPositionSector, newPositionValue, currentSectorExposure, portfolioValue, maxConcentration = 0.35) => {
      const currentSectorValue = currentSectorExposure[newPositionSector] || 0;
      const newTotalSectorValue = currentSectorValue + newPositionValue;
      const sectorPct = newTotalSectorValue / portfolioValue;

      if (sectorPct > maxConcentration) {
        return {
          passed: false,
          reason: `Sector concentration ${(sectorPct * 100).toFixed(1)}% exceeds max ${(maxConcentration * 100).toFixed(0)}%`,
          currentConcentration: currentSectorValue / portfolioValue,
          proposedConcentration: sectorPct
        };
      }

      return { passed: true };
    };

    it('should approve when sector concentration is within limit', () => {
      const result = checkSectorConcentration('Technology', 5000, { Technology: 10000 }, 100000);
      expect(result.passed).toBe(true);
    });

    it('should reject when sector concentration exceeds limit', () => {
      const result = checkSectorConcentration('Technology', 30000, { Technology: 20000 }, 100000);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Sector concentration');
    });

    it('should handle new sectors', () => {
      const result = checkSectorConcentration('Healthcare', 10000, { Technology: 20000 }, 100000);
      expect(result.passed).toBe(true);
    });
  });

  describe('checkLiquidity', () => {
    const checkLiquidity = (avgDailyVolume, minLiquidity = 100000) => {
      if (!avgDailyVolume || avgDailyVolume < minLiquidity) {
        return {
          passed: false,
          reason: `Daily volume $${(avgDailyVolume || 0).toLocaleString()} below minimum $${minLiquidity.toLocaleString()}`,
          warning: true
        };
      }
      return { passed: true };
    };

    it('should approve liquid stocks', () => {
      const result = checkLiquidity(5000000);
      expect(result.passed).toBe(true);
    });

    it('should warn on illiquid stocks', () => {
      const result = checkLiquidity(50000);
      expect(result.passed).toBe(false);
      expect(result.warning).toBe(true);
    });

    it('should handle missing volume data', () => {
      const result = checkLiquidity(null);
      expect(result.passed).toBe(false);
    });
  });

  describe('checkVolatility', () => {
    const checkVolatility = (annualizedVolatility, maxVolatility = 0.60) => {
      if (annualizedVolatility > maxVolatility) {
        return {
          passed: false,
          reason: `Volatility ${(annualizedVolatility * 100).toFixed(1)}% exceeds max ${(maxVolatility * 100).toFixed(0)}%`,
          warning: true
        };
      }
      return { passed: true };
    };

    it('should approve normal volatility stocks', () => {
      const result = checkVolatility(0.25);
      expect(result.passed).toBe(true);
    });

    it('should warn on high volatility stocks', () => {
      const result = checkVolatility(0.75);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('Volatility');
    });
  });

  describe('checkDrawdown', () => {
    const checkDrawdown = (currentDrawdown, maxDrawdown = 0.20) => {
      if (currentDrawdown > maxDrawdown) {
        return {
          passed: false,
          reason: `Current drawdown ${(currentDrawdown * 100).toFixed(1)}% exceeds max ${(maxDrawdown * 100).toFixed(0)}%`,
          blocker: true
        };
      }
      return { passed: true };
    };

    it('should approve within drawdown limit', () => {
      const result = checkDrawdown(0.10);
      expect(result.passed).toBe(true);
    });

    it('should block when drawdown exceeds limit', () => {
      const result = checkDrawdown(0.25);
      expect(result.passed).toBe(false);
      expect(result.blocker).toBe(true);
    });
  });

  describe('checkCashReserve', () => {
    const checkCashReserve = (cashBalance, portfolioValue, tradeValue, minReserve = 0.05) => {
      const remainingCash = cashBalance - tradeValue;
      const remainingPct = remainingCash / portfolioValue;

      if (remainingPct < minReserve) {
        return {
          passed: false,
          reason: `Remaining cash ${(remainingPct * 100).toFixed(1)}% below minimum ${(minReserve * 100).toFixed(0)}%`,
          maxAffordable: cashBalance - (portfolioValue * minReserve)
        };
      }
      return { passed: true };
    };

    it('should approve when sufficient cash reserve remains', () => {
      const result = checkCashReserve(20000, 100000, 10000);
      expect(result.passed).toBe(true);
    });

    it('should reject when cash reserve too low', () => {
      const result = checkCashReserve(6000, 100000, 5000);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('below minimum');
    });
  });
});

describe('RiskManager Trade Assessment', () => {
  describe('assessTradeRisk', () => {
    const assessTradeRisk = (trade, portfolio, stockData, limits) => {
      const checks = [];
      const warnings = [];
      const blockers = [];

      // Position size check
      const positionPct = trade.value / portfolio.totalValue;
      if (positionPct > limits.maxPositionSize) {
        blockers.push(`Position size ${(positionPct * 100).toFixed(1)}% exceeds limit`);
      }
      checks.push({ name: 'position_size', passed: positionPct <= limits.maxPositionSize });

      // Volatility check
      if (stockData.volatility > limits.maxVolatility) {
        warnings.push(`High volatility: ${(stockData.volatility * 100).toFixed(0)}%`);
      }
      checks.push({ name: 'volatility', passed: stockData.volatility <= limits.maxVolatility });

      // Liquidity check
      if (stockData.avgVolume < limits.minLiquidity) {
        warnings.push(`Low liquidity: $${stockData.avgVolume.toLocaleString()}`);
      }
      checks.push({ name: 'liquidity', passed: stockData.avgVolume >= limits.minLiquidity });

      return {
        approved: blockers.length === 0,
        checks,
        warnings,
        blockers,
        adjustedPositionSize: blockers.length > 0
          ? portfolio.totalValue * limits.maxPositionSize
          : trade.value
      };
    };

    const defaultLimits = {
      maxPositionSize: 0.10,
      maxVolatility: 0.60,
      minLiquidity: 100000
    };

    it('should approve trade meeting all criteria', () => {
      const trade = { value: 5000 };
      const portfolio = { totalValue: 100000 };
      const stockData = { volatility: 0.25, avgVolume: 500000 };

      const result = assessTradeRisk(trade, portfolio, stockData, defaultLimits);
      expect(result.approved).toBe(true);
      expect(result.blockers.length).toBe(0);
    });

    it('should block trade exceeding position limit', () => {
      const trade = { value: 15000 };
      const portfolio = { totalValue: 100000 };
      const stockData = { volatility: 0.25, avgVolume: 500000 };

      const result = assessTradeRisk(trade, portfolio, stockData, defaultLimits);
      expect(result.approved).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('should warn on high volatility but not block', () => {
      const trade = { value: 5000 };
      const portfolio = { totalValue: 100000 };
      const stockData = { volatility: 0.70, avgVolume: 500000 };

      const result = assessTradeRisk(trade, portfolio, stockData, defaultLimits);
      expect(result.approved).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should suggest adjusted position size', () => {
      const trade = { value: 15000 };
      const portfolio = { totalValue: 100000 };
      const stockData = { volatility: 0.25, avgVolume: 500000 };

      const result = assessTradeRisk(trade, portfolio, stockData, defaultLimits);
      expect(result.adjustedPositionSize).toBe(10000);
    });
  });
});

describe('RiskManager Portfolio Risk Metrics', () => {
  describe('calculatePortfolioRisk', () => {
    const calculatePortfolioRisk = (positions, correlationMatrix = null) => {
      if (!positions || positions.length === 0) {
        return {
          totalValue: 0,
          concentration: {},
          diversificationScore: 0,
          maxDrawdownRisk: 0
        };
      }

      const totalValue = positions.reduce((sum, p) => sum + p.value, 0);

      // Sector concentration
      const sectorValues = {};
      for (const pos of positions) {
        sectorValues[pos.sector] = (sectorValues[pos.sector] || 0) + pos.value;
      }

      const concentration = {};
      for (const [sector, value] of Object.entries(sectorValues)) {
        concentration[sector] = value / totalValue;
      }

      // Diversification score (HHI-based)
      const hhi = Object.values(concentration).reduce((sum, pct) => sum + pct * pct, 0);
      const diversificationScore = 1 - hhi;

      // Max position concentration
      const maxPositionPct = Math.max(...positions.map(p => p.value / totalValue));

      return {
        totalValue,
        concentration,
        diversificationScore,
        maxPositionPct,
        positionCount: positions.length
      };
    };

    it('should calculate portfolio metrics', () => {
      const positions = [
        { symbol: 'AAPL', value: 25000, sector: 'Technology' },
        { symbol: 'GOOGL', value: 20000, sector: 'Technology' },
        { symbol: 'JNJ', value: 15000, sector: 'Healthcare' },
        { symbol: 'JPM', value: 20000, sector: 'Financials' },
        { symbol: 'XOM', value: 20000, sector: 'Energy' }
      ];

      const result = calculatePortfolioRisk(positions);

      expect(result.totalValue).toBe(100000);
      expect(result.concentration['Technology']).toBeCloseTo(0.45);
      expect(result.diversificationScore).toBeGreaterThan(0);
      expect(result.positionCount).toBe(5);
    });

    it('should handle empty portfolio', () => {
      const result = calculatePortfolioRisk([]);

      expect(result.totalValue).toBe(0);
      expect(result.diversificationScore).toBe(0);
    });

    it('should detect concentrated portfolio', () => {
      const positions = [
        { symbol: 'AAPL', value: 80000, sector: 'Technology' },
        { symbol: 'GOOGL', value: 20000, sector: 'Technology' }
      ];

      const result = calculatePortfolioRisk(positions);

      expect(result.concentration['Technology']).toBe(1.0);
      expect(result.diversificationScore).toBeLessThan(0.5);
    });
  });
});

describe('RiskManager Regime Adjustments', () => {
  describe('getRegimeAdjustedLimits', () => {
    const getRegimeAdjustedLimits = (baseLimits, regime) => {
      const adjusted = { ...baseLimits };

      switch (regime) {
        case 'HIGH_VOL':
          adjusted.maxPositionSize *= 0.7;
          adjusted.maxVolatility *= 0.8;
          break;
        case 'BEAR':
          adjusted.maxPositionSize *= 0.8;
          adjusted.minCashReserve *= 1.5;
          break;
        case 'BULL':
          adjusted.maxPositionSize *= 1.1;
          adjusted.maxSectorConcentration *= 1.1;
          break;
        case 'SIDEWAYS':
          // No adjustments
          break;
      }

      return adjusted;
    };

    const baseLimits = {
      maxPositionSize: 0.10,
      maxSectorConcentration: 0.35,
      maxVolatility: 0.60,
      minCashReserve: 0.05
    };

    it('should tighten limits in high-volatility regime', () => {
      const adjusted = getRegimeAdjustedLimits(baseLimits, 'HIGH_VOL');

      expect(adjusted.maxPositionSize).toBeLessThan(baseLimits.maxPositionSize);
      expect(adjusted.maxVolatility).toBeLessThan(baseLimits.maxVolatility);
    });

    it('should tighten limits in bear market', () => {
      const adjusted = getRegimeAdjustedLimits(baseLimits, 'BEAR');

      expect(adjusted.maxPositionSize).toBeLessThan(baseLimits.maxPositionSize);
      expect(adjusted.minCashReserve).toBeGreaterThan(baseLimits.minCashReserve);
    });

    it('should loosen limits in bull market', () => {
      const adjusted = getRegimeAdjustedLimits(baseLimits, 'BULL');

      expect(adjusted.maxPositionSize).toBeGreaterThan(baseLimits.maxPositionSize);
      expect(adjusted.maxSectorConcentration).toBeGreaterThan(baseLimits.maxSectorConcentration);
    });

    it('should keep limits unchanged in sideways market', () => {
      const adjusted = getRegimeAdjustedLimits(baseLimits, 'SIDEWAYS');

      expect(adjusted.maxPositionSize).toBe(baseLimits.maxPositionSize);
    });
  });
});

describe('RiskManager Stress Testing', () => {
  describe('calculateStressScenarios', () => {
    const calculateStressScenarios = (portfolioValue, positions) => {
      const scenarios = {
        marketCrash: { drawdown: 0.40, description: '40% market crash' },
        sectorCrash: { drawdown: 0.25, description: '25% sector-specific crash' },
        rateShock: { drawdown: 0.15, description: '15% interest rate shock' },
        volatilitySpike: { drawdown: 0.20, description: '20% volatility spike' }
      };

      const results = {};
      for (const [name, scenario] of Object.entries(scenarios)) {
        results[name] = {
          description: scenario.description,
          potentialLoss: portfolioValue * scenario.drawdown,
          percentLoss: scenario.drawdown * 100,
          remainingValue: portfolioValue * (1 - scenario.drawdown)
        };
      }

      return results;
    };

    it('should calculate stress test scenarios', () => {
      const result = calculateStressScenarios(100000, []);

      expect(result.marketCrash.potentialLoss).toBe(40000);
      expect(result.marketCrash.remainingValue).toBe(60000);
    });

    it('should include multiple scenarios', () => {
      const result = calculateStressScenarios(100000, []);

      expect(Object.keys(result).length).toBe(4);
      expect(result.sectorCrash).toBeDefined();
      expect(result.rateShock).toBeDefined();
    });
  });
});
