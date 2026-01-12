// src/services/portfolio/monteCarloEngine.js
// Monte Carlo Simulation Engine (Agent 2)
// Enhanced with Parametric Distribution Support

const db = require('../../database');
const { ParametricDistributions } = require('../statistics');

const TRADING_DAYS_PER_YEAR = 252;

class MonteCarloEngine {
  constructor() {
    this.db = db.getDatabase();
    this.parametricDist = new ParametricDistributions();
    console.log('🎲 Monte Carlo Engine initialized with parametric distribution support');
  }

  // ============================================
  // Run Monte Carlo Simulation
  // ============================================
  async runSimulation(config) {
    const startTime = Date.now();

    const {
      name = null,
      portfolioId = null,
      allocations = null, // Alternative to portfolioId
      simulationCount = 10000,
      timeHorizonYears = 30,
      returnModel = 'historical', // 'historical', 'parametric', 'forecasted'
      returnDistribution = 'normal', // NEW: 'normal', 'studentT', 'skewedT', 'auto'
      initialValue = 500000,
      annualContribution = 0,
      annualWithdrawal = 0,
      inflationRate = 0.025,
      expectedReturn = null, // For 'forecasted' model
      expectedVolatility = null, // For 'forecasted' model
      lookbackYears = 10 // For historical/parametric models
    } = config;

    // Get portfolio allocations
    let portfolioAllocations;
    if (portfolioId) {
      portfolioAllocations = this._getPortfolioAllocations(portfolioId);
    } else if (allocations) {
      portfolioAllocations = allocations;
    } else {
      throw new Error('Either portfolioId or allocations must be provided');
    }

    // Calculate historical returns for the portfolio
    const { returns, meanReturn, stdReturn } = await this._calculateHistoricalReturns(
      portfolioAllocations,
      lookbackYears
    );

    // Fit parametric distribution to returns (for enhanced modeling)
    let fittedDistribution = null;
    let distributionMoments = null;
    if (returns.length >= 30 && returnModel === 'parametric') {
      try {
        // Calculate annualized returns for fitting (convert daily to annual)
        const annualizedReturns = returns.map(r => r * Math.sqrt(TRADING_DAYS_PER_YEAR));

        if (returnDistribution === 'auto') {
          fittedDistribution = this.parametricDist.findBestFit(annualizedReturns);
        } else if (returnDistribution !== 'normal') {
          fittedDistribution = this.parametricDist.fitDistribution(annualizedReturns, returnDistribution);
        } else {
          // Normal distribution - just calculate moments
          fittedDistribution = {
            type: 'normal',
            params: { mean: meanReturn, std: stdReturn },
            moments: this.parametricDist.calculateMoments(annualizedReturns),
            goodnessOfFit: this.parametricDist.ksTest(annualizedReturns, { mean: meanReturn, std: stdReturn }, 'normal')
          };
        }

        distributionMoments = fittedDistribution.moments || this.parametricDist.calculateMoments(annualizedReturns);
      } catch (e) {
        console.warn('Failed to fit distribution:', e.message);
        // Fall back to normal
        fittedDistribution = {
          type: 'normal',
          params: { mean: meanReturn, std: stdReturn }
        };
      }
    }

    // Determine simulation parameters
    let simMean, simStd;
    switch (returnModel) {
      case 'historical':
        simMean = meanReturn;
        simStd = stdReturn;
        break;
      case 'parametric':
        simMean = meanReturn;
        simStd = stdReturn;
        break;
      case 'forecasted':
        simMean = expectedReturn || 0.07;
        simStd = expectedVolatility || 0.15;
        break;
      default:
        simMean = meanReturn;
        simStd = stdReturn;
    }

    // Run simulations
    const simulations = [];
    const endingValues = [];
    const depletionYears = [];

    for (let sim = 0; sim < simulationCount; sim++) {
      const path = this._runSingleSimulation({
        initialValue,
        timeHorizonYears,
        annualContribution,
        annualWithdrawal,
        inflationRate,
        meanReturn: simMean,
        stdReturn: simStd,
        historicalReturns: returns,
        returnModel,
        fittedDistribution,
        returnDistribution
      });

      simulations.push(path);
      endingValues.push(path[path.length - 1].value);

      if (path[path.length - 1].value <= 0) {
        depletionYears.push(path.findIndex(p => p.value <= 0));
      }
    }

    // Calculate statistics
    endingValues.sort((a, b) => a - b);
    const survivalRate = (simulations.filter(s => s[s.length - 1].value > 0).length / simulationCount) * 100;
    const medianEndingValue = this._percentile(endingValues, 50);
    const meanEndingValue = endingValues.reduce((a, b) => a + b, 0) / simulationCount;
    const percentile5 = this._percentile(endingValues, 5);
    const percentile25 = this._percentile(endingValues, 25);
    const percentile75 = this._percentile(endingValues, 75);
    const percentile95 = this._percentile(endingValues, 95);

    // Calculate median depletion year
    let medianDepletionYear = null;
    if (depletionYears.length > 0) {
      depletionYears.sort((a, b) => a - b);
      medianDepletionYear = this._percentile(depletionYears, 50);
    }

    // Generate percentile paths for fan chart
    const percentilePaths = this._generatePercentilePaths(simulations, timeHorizonYears);

    const executionTimeMs = Date.now() - startTime;

    // Save to database
    const result = {
      name,
      config: JSON.stringify(config),
      portfolioId,
      simulationCount,
      timeHorizonYears,
      returnModel,
      initialValue,
      annualContribution,
      annualWithdrawal,
      inflationRate,
      survivalRate,
      medianEndingValue,
      meanEndingValue,
      percentile5,
      percentile25,
      percentile75,
      percentile95,
      medianDepletionYear,
      percentilePaths: JSON.stringify(percentilePaths),
      executionTimeMs
    };

    const insertStmt = this.db.prepare(`
      INSERT INTO monte_carlo_runs (
        name, config, portfolio_id, simulation_count, time_horizon_years,
        return_model, initial_value, annual_contribution, annual_withdrawal,
        inflation_rate, survival_rate, median_ending_value, mean_ending_value,
        percentile_5, percentile_25, percentile_75, percentile_95,
        median_depletion_year, percentile_paths, execution_time_ms
      ) VALUES (
        @name, @config, @portfolioId, @simulationCount, @timeHorizonYears,
        @returnModel, @initialValue, @annualContribution, @annualWithdrawal,
        @inflationRate, @survivalRate, @medianEndingValue, @meanEndingValue,
        @percentile5, @percentile25, @percentile75, @percentile95,
        @medianDepletionYear, @percentilePaths, @executionTimeMs
      )
    `);

    const insertResult = insertStmt.run(result);
    result.id = insertResult.lastInsertRowid;

    // Calculate Cornish-Fisher VaR comparison if we have distribution moments
    let varComparison = null;
    if (distributionMoments) {
      varComparison = this.parametricDist.cornishFisherVaR(
        simMean,
        simStd,
        distributionMoments.skewness,
        distributionMoments.kurtosis,
        0.95
      );
    }

    // Return parsed data for API response
    return {
      ...result,
      config: config,
      percentilePaths,
      assumptions: {
        meanReturn: simMean * 100,
        stdReturn: simStd * 100,
        inflationAdjustedWithdrawal: annualWithdrawal > 0,
        dataYears: returns.length / TRADING_DAYS_PER_YEAR
      },
      // NEW: Distribution fit information
      distributionFit: fittedDistribution ? {
        type: fittedDistribution.type,
        typeName: this._getDistributionName(fittedDistribution.type),
        params: fittedDistribution.params,
        goodnessOfFit: fittedDistribution.goodnessOfFit,
        moments: distributionMoments ? {
          skewness: distributionMoments.skewness,
          kurtosis: distributionMoments.kurtosis,
          excessKurtosis: distributionMoments.excessKurtosis
        } : null,
        fatTails: distributionMoments ? distributionMoments.kurtosis > 4 : false,
        varComparison: varComparison ? {
          normalVaR95: (varComparison.normalVaR * 100).toFixed(2) + '%',
          adjustedVaR95: (varComparison.adjustedVaR * 100).toFixed(2) + '%',
          riskUnderestimation: Math.abs(varComparison.adjustmentPercent).toFixed(1) + '%'
        } : null
      } : null
    };
  }

  /**
   * Get human-readable distribution name
   */
  _getDistributionName(type) {
    const names = {
      normal: 'Normal (Gaussian)',
      studentT: "Student's t (Fat Tails)",
      skewedT: "Skewed t (Asymmetric)",
      johnsonSU: 'Johnson SU'
    };
    return names[type] || type;
  }

  // ============================================
  // Analyze Portfolio Return Distribution
  // ============================================
  async analyzeDistribution(config) {
    const {
      portfolioId = null,
      allocations = null,
      lookbackYears = 5,
      distributionType = 'auto'
    } = config;

    // Get portfolio allocations
    let portfolioAllocations;
    if (portfolioId) {
      portfolioAllocations = this._getPortfolioAllocations(portfolioId);
    } else if (allocations) {
      portfolioAllocations = allocations;
    } else {
      throw new Error('Either portfolioId or allocations must be provided');
    }

    // Calculate historical returns
    const { returns, meanReturn, stdReturn } = await this._calculateHistoricalReturns(
      portfolioAllocations,
      lookbackYears
    );

    if (returns.length < 30) {
      throw new Error('Insufficient data for distribution analysis (need at least 30 returns)');
    }

    // Annualize returns for analysis
    const annualizedReturns = returns.map(r => r * Math.sqrt(TRADING_DAYS_PER_YEAR));

    // Fit distribution
    let fittedDistribution;
    if (distributionType === 'auto') {
      fittedDistribution = this.parametricDist.findBestFit(annualizedReturns);
    } else {
      fittedDistribution = this.parametricDist.fitDistribution(annualizedReturns, distributionType);
    }

    // Get comprehensive summary
    const summary = this.parametricDist.getSummary(fittedDistribution);

    // Generate comparison data for visualization
    const comparisonData = this.parametricDist.generateComparisonData(annualizedReturns, fittedDistribution);

    // Generate PDF curves for charting
    const pdfCurve = this.parametricDist.generatePdfCurve(fittedDistribution.params, fittedDistribution.type);
    const normalPdfCurve = this.parametricDist.generatePdfCurve(
      { mean: meanReturn, std: stdReturn },
      'normal'
    );

    return {
      portfolioId,
      dataPoints: returns.length,
      lookbackYears,
      summary: {
        ...summary,
        annualizedMean: (meanReturn * 100).toFixed(2) + '%',
        annualizedStd: (stdReturn * 100).toFixed(2) + '%'
      },
      histogram: comparisonData.histogram,
      pdfCurves: {
        fitted: pdfCurve,
        normal: normalPdfCurve
      },
      riskMetrics: {
        var95Normal: summary.varComparison?.normalVaR,
        var95Adjusted: summary.varComparison?.adjustedVaR,
        riskUnderestimation: summary.varComparison?.adjustmentPercent,
        fatTailWarning: summary.riskCharacteristics.fatTails
          ? 'Portfolio has fat tails - normal distribution underestimates risk'
          : null
      }
    };
  }

  // ============================================
  // Get Saved Simulation
  // ============================================
  getSimulation(id) {
    const simulation = this.db.prepare(`
      SELECT * FROM monte_carlo_runs WHERE id = ?
    `).get(id);

    if (!simulation) {
      throw new Error(`Monte Carlo run ${id} not found`);
    }

    return {
      ...simulation,
      config: JSON.parse(simulation.config || '{}'),
      percentilePaths: JSON.parse(simulation.percentile_paths || '[]')
    };
  }

  // ============================================
  // List Simulations
  // ============================================
  listSimulations(limit = 20) {
    return this.db.prepare(`
      SELECT
        id, name, portfolio_id, simulation_count, time_horizon_years,
        initial_value, annual_withdrawal, survival_rate, median_ending_value,
        execution_time_ms, created_at
      FROM monte_carlo_runs
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  // ============================================
  // Delete Simulation
  // ============================================
  deleteSimulation(id) {
    const result = this.db.prepare(`DELETE FROM monte_carlo_runs WHERE id = ?`).run(id);
    return { deleted: result.changes > 0 };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  _getPortfolioAllocations(portfolioId) {
    const positions = this.db.prepare(`
      SELECT
        pp.company_id,
        c.symbol,
        pp.shares,
        pm.last_price
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = ?
    `).all(portfolioId);

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

  async _calculateHistoricalReturns(allocations, lookbackYears) {
    const lookbackDays = lookbackYears * TRADING_DAYS_PER_YEAR;
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - lookbackYears);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Load price data for each position
    const priceData = {};
    let tradingDaysSet = new Set();

    for (const alloc of allocations) {
      let companyId = alloc.companyId;

      // Resolve symbol if needed
      if (!companyId && alloc.symbol) {
        const company = this.db.prepare(`
          SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
        `).get(alloc.symbol);
        if (!company) continue;
        companyId = company.id;
      }

      if (!companyId) continue;

      const prices = this.db.prepare(`
        SELECT date, adjusted_close, close
        FROM daily_prices
        WHERE company_id = ? AND date >= ? AND date <= ?
        ORDER BY date ASC
      `).all(companyId, startDateStr, endDate);

      priceData[companyId] = {};
      for (const price of prices) {
        priceData[companyId][price.date] = price.adjusted_close || price.close;
        tradingDaysSet.add(price.date);
      }
    }

    // Filter to days where all positions have data
    const tradingDays = Array.from(tradingDaysSet).sort();
    const validDays = tradingDays.filter(day =>
      allocations.every(alloc => {
        const companyId = alloc.companyId || this.db.prepare(
          `SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE`
        ).get(alloc.symbol)?.id;
        return priceData[companyId]?.[day];
      })
    );

    // Calculate portfolio returns
    const returns = [];
    for (let i = 1; i < validDays.length; i++) {
      let portfolioReturn = 0;

      for (const alloc of allocations) {
        const companyId = alloc.companyId || this.db.prepare(
          `SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE`
        ).get(alloc.symbol)?.id;

        if (!companyId) continue;

        const prevPrice = priceData[companyId][validDays[i - 1]];
        const currPrice = priceData[companyId][validDays[i]];

        if (prevPrice && currPrice) {
          const stockReturn = (currPrice - prevPrice) / prevPrice;
          portfolioReturn += stockReturn * alloc.weight;
        }
      }

      returns.push(portfolioReturn);
    }

    // Calculate mean and std
    const meanReturn = returns.length > 0
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;

    const variance = returns.length > 1
      ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
      : 0;

    const stdReturn = Math.sqrt(variance);

    // Annualize
    const annualizedMean = meanReturn * TRADING_DAYS_PER_YEAR;
    const annualizedStd = stdReturn * Math.sqrt(TRADING_DAYS_PER_YEAR);

    return {
      returns,
      meanReturn: annualizedMean,
      stdReturn: annualizedStd
    };
  }

  _runSingleSimulation(params) {
    const {
      initialValue,
      timeHorizonYears,
      annualContribution,
      annualWithdrawal,
      inflationRate,
      meanReturn,
      stdReturn,
      historicalReturns,
      returnModel,
      fittedDistribution,
      returnDistribution
    } = params;

    const path = [{ year: 0, value: initialValue }];
    let currentValue = initialValue;
    let currentWithdrawal = annualWithdrawal;
    let currentContribution = annualContribution;

    for (let year = 1; year <= timeHorizonYears; year++) {
      // Apply inflation to withdrawals/contributions
      currentWithdrawal *= (1 + inflationRate);
      currentContribution *= (1 + inflationRate);

      // Generate return for this year
      let yearReturn;

      if (returnModel === 'historical' && historicalReturns.length > 0) {
        // Bootstrap from historical returns
        // Sample 252 daily returns and compound them
        let compoundReturn = 1;
        for (let day = 0; day < TRADING_DAYS_PER_YEAR; day++) {
          const idx = Math.floor(Math.random() * historicalReturns.length);
          compoundReturn *= (1 + historicalReturns[idx]);
        }
        yearReturn = compoundReturn - 1;
      } else if (returnModel === 'parametric' && fittedDistribution && returnDistribution !== 'normal') {
        // NEW: Use fitted parametric distribution (Student's t, Skewed t, etc.)
        // This captures fat tails and skewness in the simulation
        yearReturn = this.parametricDist.sample(1, fittedDistribution.params, fittedDistribution.type)[0];
      } else {
        // Parametric with normal distribution
        yearReturn = this._normalRandom(meanReturn, stdReturn);
      }

      // Apply return
      currentValue *= (1 + yearReturn);

      // Apply cash flows (end of year)
      currentValue += currentContribution;
      currentValue -= currentWithdrawal;

      // Floor at zero
      if (currentValue < 0) currentValue = 0;

      path.push({ year, value: currentValue });
    }

    return path;
  }

  _normalRandom(mean, std) {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();

    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + std * z;
  }

  _percentile(sortedArray, p) {
    if (sortedArray.length === 0) return 0;

    const index = (p / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const fraction = index - lower;

    if (lower === upper) {
      return sortedArray[lower];
    }

    return sortedArray[lower] * (1 - fraction) + sortedArray[upper] * fraction;
  }

  _generatePercentilePaths(simulations, timeHorizonYears) {
    const percentiles = [5, 10, 25, 50, 75, 90, 95];
    const paths = {};

    for (const p of percentiles) {
      paths[`p${p}`] = [];
    }

    for (let year = 0; year <= timeHorizonYears; year++) {
      const valuesAtYear = simulations.map(sim => sim[year]?.value || 0).sort((a, b) => a - b);

      for (const p of percentiles) {
        const value = this._percentile(valuesAtYear, p);
        paths[`p${p}`].push({ year, value });
      }
    }

    return paths;
  }
}

// Export singleton instance
module.exports = new MonteCarloEngine();
