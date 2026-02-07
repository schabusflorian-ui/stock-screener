// src/services/portfolio/stressTestEngine.js
// Stress Testing Engine - Historical Crisis Simulations (Agent 2)

const { getDatabaseAsync } = require('../../database');

// Built-in historical stress scenarios
const STRESS_SCENARIOS = {
  FINANCIAL_CRISIS_2008: {
    id: 'financial_crisis_2008',
    name: '2008 Financial Crisis',
    startDate: '2008-09-01',
    endDate: '2009-03-31',
    description: 'The global financial crisis triggered by the subprime mortgage collapse'
  },
  COVID_CRASH: {
    id: 'covid_crash',
    name: 'COVID Crash 2020',
    startDate: '2020-02-19',
    endDate: '2020-03-23',
    description: 'The rapid market crash at the onset of the COVID-19 pandemic'
  },
  DOT_COM_BUST: {
    id: 'dot_com_bust',
    name: 'Dot-Com Bust',
    startDate: '2000-03-10',
    endDate: '2002-10-09',
    description: 'The bursting of the technology bubble'
  },
  BLACK_MONDAY_1987: {
    id: 'black_monday_1987',
    name: 'Black Monday 1987',
    startDate: '1987-10-14',
    endDate: '1987-10-19',
    description: 'The largest single-day percentage decline in stock market history'
  },
  BEAR_MARKET_2022: {
    id: 'bear_market_2022',
    name: '2022 Bear Market',
    startDate: '2022-01-03',
    endDate: '2022-10-12',
    description: 'Interest rate driven bear market'
  },
  EURO_CRISIS_2011: {
    id: 'euro_crisis_2011',
    name: 'European Debt Crisis',
    startDate: '2011-07-01',
    endDate: '2011-10-03',
    description: 'European sovereign debt crisis'
  },
  FLASH_CRASH_2010: {
    id: 'flash_crash_2010',
    name: 'Flash Crash 2010',
    startDate: '2010-05-06',
    endDate: '2010-05-06',
    description: 'The sudden trillion-dollar stock market crash'
  },
  CHINA_CRASH_2015: {
    id: 'china_crash_2015',
    name: 'China Market Crash 2015',
    startDate: '2015-06-12',
    endDate: '2015-08-26',
    description: 'Chinese stock market turbulence'
  }
};

class StressTestEngine {
  constructor() {
    this.scenarios = STRESS_SCENARIOS;
    console.log('🔥 Stress Test Engine initialized');
  }

  // ============================================
  // Run Stress Test
  // ============================================
  async runStressTest(portfolioId, scenarioId = null, customScenario = null, options = {}) {
    const startTime = Date.now();
    const { save = true } = options;

    // Get portfolio allocations
    const allocations = await this._getPortfolioAllocations(portfolioId);
    if (allocations.length === 0) {
      throw new Error('Portfolio has no positions');
    }

    // Determine scenario
    let scenario;
    if (customScenario) {
      scenario = {
        id: 'custom',
        name: customScenario.name || 'Custom Scenario',
        startDate: customScenario.startDate,
        endDate: customScenario.endDate,
        description: customScenario.description || 'Custom stress test scenario'
      };
    } else if (scenarioId) {
      scenario = Object.values(this.scenarios).find(s => s.id === scenarioId);
      if (!scenario) {
        throw new Error(`Unknown scenario: ${scenarioId}`);
      }
    } else {
      throw new Error('Either scenarioId or customScenario is required');
    }

    // Run the stress test
    const result = await this._simulateScenario(allocations, scenario);

    // Get benchmark comparison (S&P 500)
    const benchmarkResult = await this._getBenchmarkPerformance(scenario);

    const executionTime = Date.now() - startTime;

    const testResult = {
      portfolioId,
      scenario: {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        startDate: scenario.startDate,
        endDate: scenario.endDate
      },
      portfolio: result,
      benchmark: benchmarkResult,
      comparison: {
        relativeDrawdown: result.maxDrawdown - (benchmarkResult?.maxDrawdown || 0),
        outperformed: result.maxDrawdown < (benchmarkResult?.maxDrawdown || 0),
        betaEstimate: benchmarkResult?.totalReturn !== 0
          ? result.totalReturn / benchmarkResult.totalReturn
          : null
      },
      executionTimeMs: executionTime
    };

    // Save to database if requested
    if (save && result.hasData) {
      testResult.savedId = await this._saveResult(portfolioId, scenario, result, benchmarkResult, testResult.comparison, executionTime);
    }

    return testResult;
  }

  // ============================================
  // Run All Scenarios
  // ============================================
  async runAllScenarios(portfolioId) {
    const results = [];

    for (const scenario of Object.values(this.scenarios)) {
      try {
        const result = await this.runStressTest(portfolioId, scenario.id);
        results.push({
          scenario: scenario.name,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          scenario: scenario.name,
          success: false,
          error: error.message
        });
      }
    }

    // Summary statistics
    const successfulTests = results.filter(r => r.success);
    const avgDrawdown = successfulTests.length > 0
      ? successfulTests.reduce((sum, r) => sum + r.portfolio.maxDrawdown, 0) / successfulTests.length
      : null;
    const worstScenario = successfulTests.length > 0
      ? successfulTests.reduce((worst, r) =>
          r.portfolio.maxDrawdown > worst.portfolio.maxDrawdown ? r : worst
        )
      : null;

    return {
      portfolioId,
      scenariosRun: results.length,
      successful: successfulTests.length,
      failed: results.length - successfulTests.length,
      summary: {
        averageDrawdown: avgDrawdown,
        worstScenario: worstScenario?.scenario.name,
        worstDrawdown: worstScenario?.portfolio.maxDrawdown
      },
      results
    };
  }

  // ============================================
  // List Available Scenarios
  // ============================================
  getAvailableScenarios() {
    return Object.values(this.scenarios).map(s => ({
      id: s.id,
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
      description: s.description
    }));
  }

  // ============================================
  // Custom Scenario Builder
  // ============================================
  createCustomScenario(name, startDate, endDate, description = null) {
    return {
      id: 'custom',
      name,
      startDate,
      endDate,
      description: description || `Custom scenario from ${startDate} to ${endDate}`
    };
  }

  // ============================================
  // Historical Results
  // ============================================

  /**
   * Get saved stress test results for a portfolio
   */
  async getStressTestHistory(portfolioId, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 50, scenarioId = null } = options;

    let query = `
      SELECT * FROM stress_test_runs
      WHERE portfolio_id = $1
    `;
    const params = [portfolioId];

    if (scenarioId) {
      query += ' AND scenario_id = $2';
      params.push(scenarioId);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await database.query(query, params);
    const results = result.rows;

    return results.map(r => ({
      id: r.id,
      portfolioId: r.portfolio_id,
      scenario: {
        id: r.scenario_id,
        name: r.scenario_name,
        description: r.scenario_description,
        startDate: r.scenario_start_date,
        endDate: r.scenario_end_date
      },
      portfolio: {
        hasData: r.has_data === true,
        dataPoints: r.data_points,
        startValue: r.start_value,
        endValue: r.end_value,
        totalReturn: r.total_return,
        maxDrawdown: r.max_drawdown,
        maxDrawdownStart: r.max_drawdown_start,
        maxDrawdownEnd: r.max_drawdown_end,
        recoveryDays: r.recovery_days,
        worstDay: r.worst_day_date ? {
          date: r.worst_day_date,
          return: r.worst_day_return
        } : null,
        valueSeries: r.value_series ? JSON.parse(r.value_series) : null
      },
      benchmark: r.benchmark_symbol ? {
        symbol: r.benchmark_symbol,
        totalReturn: r.benchmark_total_return,
        maxDrawdown: r.benchmark_max_drawdown
      } : null,
      comparison: {
        relativeDrawdown: r.relative_drawdown,
        outperformed: r.outperformed === true,
        betaEstimate: r.beta_estimate
      },
      executionTimeMs: r.execution_time_ms,
      createdAt: r.created_at
    }));
  }

  /**
   * Get a specific saved stress test result
   */
  async getStressTestResult(resultId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM stress_test_runs WHERE id = $1
    `, [resultId]);

    const r = result.rows[0];

    if (!r) {
      return null;
    }

    return {
      id: r.id,
      portfolioId: r.portfolio_id,
      scenario: {
        id: r.scenario_id,
        name: r.scenario_name,
        description: r.scenario_description,
        startDate: r.scenario_start_date,
        endDate: r.scenario_end_date
      },
      portfolio: {
        hasData: r.has_data === true,
        dataPoints: r.data_points,
        startValue: r.start_value,
        endValue: r.end_value,
        totalReturn: r.total_return,
        maxDrawdown: r.max_drawdown,
        maxDrawdownStart: r.max_drawdown_start,
        maxDrawdownEnd: r.max_drawdown_end,
        recoveryDays: r.recovery_days,
        worstDay: r.worst_day_date ? {
          date: r.worst_day_date,
          return: r.worst_day_return
        } : null,
        valueSeries: r.value_series ? JSON.parse(r.value_series) : null
      },
      benchmark: r.benchmark_symbol ? {
        symbol: r.benchmark_symbol,
        totalReturn: r.benchmark_total_return,
        maxDrawdown: r.benchmark_max_drawdown
      } : null,
      comparison: {
        relativeDrawdown: r.relative_drawdown,
        outperformed: r.outperformed === true,
        betaEstimate: r.beta_estimate
      },
      executionTimeMs: r.execution_time_ms,
      createdAt: r.created_at
    };
  }

  /**
   * Delete a saved stress test result
   */
  async deleteStressTestResult(resultId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      DELETE FROM stress_test_runs WHERE id = $1
    `, [resultId]);

    return { deleted: result.rowCount > 0 };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Save stress test result to database
   */
  async _saveResult(portfolioId, scenario, result, benchmarkResult, comparison, executionTime) {
    const database = await getDatabaseAsync();

    const insertResult = await database.query(`
      INSERT INTO stress_test_runs (
        portfolio_id, scenario_id, scenario_name, scenario_description,
        scenario_start_date, scenario_end_date, data_points, has_data,
        start_value, end_value, total_return, max_drawdown,
        max_drawdown_start, max_drawdown_end, recovery_days,
        worst_day_date, worst_day_return,
        benchmark_symbol, benchmark_total_return, benchmark_max_drawdown,
        relative_drawdown, outperformed, beta_estimate,
        value_series, execution_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING id
    `, [
      portfolioId,
      scenario.id,
      scenario.name,
      scenario.description,
      scenario.startDate,
      scenario.endDate,
      result.dataPoints,
      result.hasData,
      result.startValue,
      result.endValue,
      result.totalReturn,
      result.maxDrawdown,
      result.maxDrawdownStart,
      result.maxDrawdownEnd,
      result.recoveryDays,
      result.worstDay?.date,
      result.worstDay?.return,
      benchmarkResult?.symbol,
      benchmarkResult?.totalReturn,
      benchmarkResult?.maxDrawdown,
      comparison.relativeDrawdown,
      comparison.outperformed,
      comparison.betaEstimate,
      result.valueSeries ? JSON.stringify(result.valueSeries) : null,
      executionTime
    ]);

    return insertResult.rows[0].id;
  }

  async _getPortfolioAllocations(portfolioId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        pp.company_id,
        c.symbol,
        pp.shares,
        pm.last_price
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);

    const positions = result.rows;

    // Calculate weights based on current values
    let totalValue = 0;
    for (const pos of positions) {
      const price = pos.last_price || 0;
      pos.value = pos.shares * price;
      totalValue += pos.value;
    }

    return positions.map(pos => ({
      symbol: pos.symbol,
      companyId: pos.company_id,
      weight: totalValue > 0 ? pos.value / totalValue : 1 / positions.length
    }));
  }

  async _simulateScenario(allocations, scenario) {
    const { startDate, endDate } = scenario;
    const database = await getDatabaseAsync();

    // Load price data for each position
    const priceData = {};
    const tradingDaysSet = new Set();

    for (const alloc of allocations) {
      const result = await database.query(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = $1 AND date >= $2 AND date <= $3
        ORDER BY date ASC
      `, [alloc.companyId, startDate, endDate]);

      const prices = result.rows;

      priceData[alloc.companyId] = {};
      for (const price of prices) {
        priceData[alloc.companyId][price.date] = price.adjusted_close || price.close;
        tradingDaysSet.add(price.date);
      }
    }

    // Filter to days where all positions have data
    const tradingDays = Array.from(tradingDaysSet).sort();
    const validDays = tradingDays.filter(day =>
      allocations.every(alloc => priceData[alloc.companyId]?.[day])
    );

    if (validDays.length < 2) {
      return {
        hasData: false,
        error: 'Insufficient price data for this scenario period',
        dataPoints: validDays.length
      };
    }

    // Calculate portfolio returns
    const values = [];
    const startValue = 100; // Normalized starting value

    for (let i = 0; i < validDays.length; i++) {
      const day = validDays[i];

      if (i === 0) {
        values.push({ date: day, value: startValue });
        continue;
      }

      let dailyReturn = 0;
      for (const alloc of allocations) {
        const prevPrice = priceData[alloc.companyId][validDays[i - 1]];
        const currPrice = priceData[alloc.companyId][day];
        if (prevPrice && currPrice) {
          dailyReturn += ((currPrice - prevPrice) / prevPrice) * alloc.weight;
        }
      }

      const prevValue = values[values.length - 1].value;
      values.push({
        date: day,
        value: prevValue * (1 + dailyReturn),
        dailyReturn: dailyReturn * 100
      });
    }

    // Calculate metrics
    const endValue = values[values.length - 1].value;
    const totalReturn = ((endValue - startValue) / startValue) * 100;

    // Max drawdown
    let peak = startValue;
    let maxDrawdown = 0;
    let maxDrawdownStart = validDays[0];
    let maxDrawdownEnd = validDays[0];
    let currentDrawdownStart = validDays[0];

    for (const v of values) {
      if (v.value > peak) {
        peak = v.value;
        currentDrawdownStart = v.date;
      }
      const drawdown = ((peak - v.value) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownStart = currentDrawdownStart;
        maxDrawdownEnd = v.date;
      }
    }

    // Worst day
    const worstDay = values.reduce((worst, v) =>
      (v.dailyReturn || 0) < (worst.dailyReturn || 0) ? v : worst
    );

    // Recovery days (if any)
    let recoveryDays = null;
    const troughIndex = values.findIndex(v => v.date === maxDrawdownEnd);
    for (let i = troughIndex + 1; i < values.length; i++) {
      if (values[i].value >= peak) {
        recoveryDays = i - troughIndex;
        break;
      }
    }

    return {
      hasData: true,
      dataPoints: validDays.length,
      startDate: validDays[0],
      endDate: validDays[validDays.length - 1],
      startValue,
      endValue,
      totalReturn,
      maxDrawdown,
      maxDrawdownStart,
      maxDrawdownEnd,
      recoveryDays,
      worstDay: {
        date: worstDay.date,
        return: worstDay.dailyReturn
      },
      valueSeries: values.filter((_, i) => i % Math.max(1, Math.floor(values.length / 100)) === 0 || i === values.length - 1)
    };
  }

  async _getBenchmarkPerformance(scenario) {
    const { startDate, endDate } = scenario;
    const database = await getDatabaseAsync();

    // Get S&P 500 prices
    const indexResult = await database.query(`
      SELECT id FROM market_indices WHERE symbol = '^GSPC' OR symbol = 'SPY' LIMIT 1
    `);

    const benchmarkIndex = indexResult.rows[0];

    if (!benchmarkIndex) {
      return null;
    }

    const pricesResult = await database.query(`
      SELECT date, close
      FROM market_index_prices
      WHERE index_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date ASC
    `, [benchmarkIndex.id, startDate, endDate]);

    const prices = pricesResult.rows;

    if (prices.length < 2) {
      return null;
    }

    const startValue = prices[0].close;
    const endValue = prices[prices.length - 1].close;
    const totalReturn = ((endValue - startValue) / startValue) * 100;

    // Calculate max drawdown
    let peak = startValue;
    let maxDrawdown = 0;

    for (const price of prices) {
      if (price.close > peak) {
        peak = price.close;
      }
      const drawdown = ((peak - price.close) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return {
      symbol: 'S&P 500',
      totalReturn,
      maxDrawdown,
      dataPoints: prices.length
    };
  }
}

// Export singleton instance and scenarios
module.exports = {
  stressTestEngine: new StressTestEngine(),
  STRESS_SCENARIOS
};
