// tests/workers/workerPool.test.js
// Tests for Worker Pool and Monte Carlo simulation parallelization

const {
  WorkerPool,
  runParallelMonteCarlo,
  calculateSimulationStats
} = require('../../src/workers/workerPool');
const { quickDCF, runSimulationBatch } = require('../../src/workers/monteCarloWorker');
const path = require('path');

describe('quickDCF', () => {
  const baseParams = {
    revenue: 100000000000, // $100B
    ebitdaMargin: 0.30,
    growth: [0.15, 0.10, 0.05],
    terminalGrowth: 0.025,
    wacc: 0.10,
    exitMultiple: 12,
    netDebt: 10000000000, // $10B
    sharesOutstanding: 5000000000 // 5B shares
  };

  test('should calculate positive intrinsic value for valid inputs', () => {
    const value = quickDCF(baseParams);
    expect(value).toBeGreaterThan(0);
    expect(typeof value).toBe('number');
    expect(isFinite(value)).toBe(true);
  });

  test('should return null for missing revenue', () => {
    const result = quickDCF({ ...baseParams, revenue: 0 });
    expect(result).toBeNull();
  });

  test('should return null for invalid shares outstanding', () => {
    const result = quickDCF({ ...baseParams, sharesOutstanding: 0 });
    expect(result).toBeNull();
  });

  test('should handle high growth scenarios', () => {
    const highGrowthParams = {
      ...baseParams,
      growth: [0.30, 0.25, 0.20],
      ebitdaMargin: 0.40
    };
    const value = quickDCF(highGrowthParams);
    expect(value).toBeGreaterThan(quickDCF(baseParams));
  });

  test('should handle low/negative net debt', () => {
    const netCashParams = {
      ...baseParams,
      netDebt: -5000000000 // Net cash position
    };
    const value = quickDCF(netCashParams);
    // More cash = higher equity value per share
    expect(value).toBeGreaterThan(quickDCF(baseParams));
  });

  test('should produce reasonable valuation range', () => {
    // Typical large cap parameters
    const value = quickDCF(baseParams);
    // Value should be reasonable (not astronomical or tiny)
    expect(value).toBeGreaterThan(1);
    expect(value).toBeLessThan(10000);
  });
});

describe('runSimulationBatch', () => {
  const config = {
    startIdx: 0,
    batchSize: 100,
    baseParams: {
      revenue: 50000000000,
      growth1: 0.12,
      growth2: 0.08,
      growth3: 0.05,
      margin: 0.25,
      wacc: 0.10,
      exitMultiple: 12,
      terminalGrowth: 0.025,
      netDebt: 5000000000,
      sharesOutstanding: 2000000000
    },
    uncertainties: {
      growth: 0.05,
      margin: 0.03,
      wacc: 0.02,
      multiple: 2
    },
    distributionType: 'normal',
    df: 5
  };

  test('should generate array of valuations', () => {
    const results = runSimulationBatch(config);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(config.batchSize);
  });

  test('should only include positive finite values', () => {
    const results = runSimulationBatch(config);
    results.forEach(value => {
      expect(value).toBeGreaterThan(0);
      expect(isFinite(value)).toBe(true);
    });
  });

  test('should produce different values due to randomization', () => {
    const results = runSimulationBatch(config);
    const uniqueValues = new Set(results);
    // With randomization, we should have many unique values
    expect(uniqueValues.size).toBeGreaterThan(1);
  });

  test('should work with studentT distribution', () => {
    const studentTConfig = { ...config, distributionType: 'studentT', df: 5 };
    const results = runSimulationBatch(studentTConfig);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  test('should handle small batch sizes', () => {
    const smallConfig = { ...config, batchSize: 5 };
    const results = runSimulationBatch(smallConfig);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});

describe('calculateSimulationStats', () => {
  const mockValuations = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  test('should calculate expected value correctly', () => {
    const stats = calculateSimulationStats(mockValuations, 30);
    expect(stats.expectedValue).toBe(32.5); // Mean of 10-55
  });

  test('should calculate standard deviation', () => {
    const stats = calculateSimulationStats(mockValuations, 30);
    expect(stats.standardDeviation).toBeGreaterThan(0);
    expect(typeof stats.standardDeviation).toBe('number');
  });

  test('should return all percentiles', () => {
    const stats = calculateSimulationStats(mockValuations, 30);
    expect(stats.percentiles).toHaveProperty('p5');
    expect(stats.percentiles).toHaveProperty('p25');
    expect(stats.percentiles).toHaveProperty('p50');
    expect(stats.percentiles).toHaveProperty('p75');
    expect(stats.percentiles).toHaveProperty('p95');
  });

  test('should calculate undervalued probabilities', () => {
    const stats = calculateSimulationStats(mockValuations, 30);
    expect(stats.probabilities).toHaveProperty('undervalued10pct');
    expect(stats.probabilities).toHaveProperty('undervalued20pct');
    expect(stats.probabilities).toHaveProperty('overvalued');

    // Sanity check: percentages between 0-100
    expect(stats.probabilities.undervalued10pct).toBeGreaterThanOrEqual(0);
    expect(stats.probabilities.undervalued10pct).toBeLessThanOrEqual(100);
  });

  test('should return null for empty valuations', () => {
    expect(calculateSimulationStats([], 30)).toBeNull();
    expect(calculateSimulationStats(null, 30)).toBeNull();
  });

  test('should handle currentPrice of 0', () => {
    const stats = calculateSimulationStats(mockValuations, 0);
    // Should not throw, probabilities should be 0
    expect(stats.probabilities.undervalued10pct).toBe(0);
    expect(stats.probabilities.overvalued).toBe(0);
  });
});

describe('WorkerPool', () => {
  let pool;
  const workerPath = path.join(__dirname, '../../src/workers/monteCarloWorker.js');

  beforeEach(() => {
    pool = new WorkerPool(workerPath, 2);
  });

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  test('should initialize with correct pool size', async () => {
    await pool.initialize();
    const stats = pool.getStats();
    expect(stats.poolSize).toBe(2);
    expect(stats.availableWorkers).toBe(2);
  });

  test('should only initialize once', async () => {
    await pool.initialize();
    await pool.initialize(); // Second call should be no-op
    const stats = pool.getStats();
    expect(stats.poolSize).toBe(2);
  });

  test('should track queued tasks', async () => {
    await pool.initialize();
    const stats = pool.getStats();
    expect(stats.queuedTasks).toBe(0);
  });

  test('should shutdown cleanly', async () => {
    await pool.initialize();
    await pool.shutdown();
    expect(pool.initialized).toBe(false);
    expect(pool.taskQueue.length).toBe(0);
  });
});

describe('runParallelMonteCarlo', () => {
  const config = {
    simulations: 100, // Small number for fast tests
    baseParams: {
      revenue: 50000000000,
      growth1: 0.10,
      growth2: 0.07,
      growth3: 0.04,
      margin: 0.25,
      wacc: 0.10,
      exitMultiple: 12,
      terminalGrowth: 0.025,
      netDebt: 5000000000,
      sharesOutstanding: 2000000000
    },
    uncertainties: {
      growth: 0.03,
      margin: 0.02,
      wacc: 0.01,
      multiple: 1.5
    },
    distributionType: 'normal',
    df: 5
  };

  test('should return success result with valuations', async () => {
    const result = await runParallelMonteCarlo(config);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.valuations)).toBe(true);
  }, 30000); // 30 second timeout for worker threads

  test('should use multiple workers', async () => {
    const result = await runParallelMonteCarlo(config);
    expect(result.workersUsed).toBeGreaterThan(0);
  }, 30000);

  test('should produce correct number of valuations approximately', async () => {
    const result = await runParallelMonteCarlo(config);
    // Should have approximately the requested number (some may be filtered out)
    expect(result.valuations.length).toBeGreaterThan(config.simulations * 0.8);
    expect(result.valuations.length).toBeLessThanOrEqual(config.simulations);
  }, 30000);

  test('should work with Student t distribution', async () => {
    const studentTConfig = { ...config, distributionType: 'studentT', df: 5 };
    const result = await runParallelMonteCarlo(studentTConfig);
    expect(result.success).toBe(true);
    expect(result.valuations.length).toBeGreaterThan(0);
  }, 30000);

  test('should handle small simulation counts', async () => {
    const smallConfig = { ...config, simulations: 10 };
    const result = await runParallelMonteCarlo(smallConfig);
    expect(result.success).toBe(true);
  }, 30000);
});

describe('Integration: Full Monte Carlo Pipeline', () => {
  test('should run complete simulation and calculate stats', async () => {
    const config = {
      simulations: 100,
      baseParams: {
        revenue: 100000000000,
        growth1: 0.12,
        growth2: 0.08,
        growth3: 0.05,
        margin: 0.28,
        wacc: 0.10,
        exitMultiple: 14,
        terminalGrowth: 0.025,
        netDebt: 10000000000,
        sharesOutstanding: 4000000000
      },
      uncertainties: {
        growth: 0.04,
        margin: 0.03,
        wacc: 0.015,
        multiple: 2
      },
      distributionType: 'studentT',
      df: 5
    };

    const currentPrice = 25;

    // Run parallel simulation
    const simResult = await runParallelMonteCarlo(config);
    expect(simResult.success).toBe(true);

    // Calculate statistics
    const stats = calculateSimulationStats(simResult.valuations, currentPrice);

    // Verify complete output structure
    expect(stats).toHaveProperty('simulations');
    expect(stats).toHaveProperty('expectedValue');
    expect(stats).toHaveProperty('standardDeviation');
    expect(stats).toHaveProperty('coefficientOfVariation');
    expect(stats).toHaveProperty('percentiles');
    expect(stats).toHaveProperty('probabilities');

    // Verify reasonable outputs
    expect(stats.expectedValue).toBeGreaterThan(0);
    expect(stats.standardDeviation).toBeGreaterThan(0);
    expect(stats.percentiles.p50).toBeGreaterThan(0);
  }, 30000);
});
