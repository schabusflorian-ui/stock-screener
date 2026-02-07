// src/services/backtesting/stressTest.js
// Stress Testing Framework for Portfolio Risk Assessment
// Implements historical, hypothetical, factor, and reverse stress tests

const { getDatabaseAsync } = require('../../database');

/**
 * Predefined Historical Stress Scenarios
 * Based on actual market events and their impact factors
 */
const HISTORICAL_SCENARIOS = {
  GFC_2008: {
    name: 'Global Financial Crisis (2008)',
    description: 'Lehman Brothers collapse and credit crisis',
    shocks: {
      SP500: -0.50,
      NASDAQ: -0.45,
      financials: -0.70,
      energy: -0.45,
      technology: -0.40,
      healthcare: -0.25,
      utilities: -0.15,
      consumer_staples: -0.20,
      consumer_discretionary: -0.50,
      industrials: -0.50,
      materials: -0.55,
      real_estate: -0.55
    },
    volatilityMultiplier: 3.5,
    correlationBreakdown: true,
    duration: '6 months'
  },

  COVID_2020: {
    name: 'COVID-19 Crash (March 2020)',
    description: 'Pandemic-induced market crash and recovery',
    shocks: {
      SP500: -0.35,
      NASDAQ: -0.30,
      financials: -0.40,
      energy: -0.65,
      technology: -0.25,
      healthcare: -0.15,
      utilities: -0.20,
      consumer_staples: -0.15,
      consumer_discretionary: -0.40,
      industrials: -0.35,
      materials: -0.30,
      real_estate: -0.35
    },
    volatilityMultiplier: 4.0,
    correlationBreakdown: true,
    duration: '1 month'
  },

  RATE_SHOCK_2022: {
    name: 'Fed Rate Shock (2022)',
    description: 'Aggressive interest rate hikes to combat inflation',
    shocks: {
      SP500: -0.25,
      NASDAQ: -0.35,
      financials: -0.15,
      energy: +0.30,
      technology: -0.40,
      healthcare: -0.10,
      utilities: -0.15,
      consumer_staples: -0.10,
      consumer_discretionary: -0.30,
      industrials: -0.20,
      materials: -0.15,
      real_estate: -0.35
    },
    volatilityMultiplier: 1.8,
    correlationBreakdown: false,
    duration: '9 months'
  },

  DOT_COM_2000: {
    name: 'Dot-Com Bubble Burst (2000)',
    description: 'Technology bubble collapse',
    shocks: {
      SP500: -0.45,
      NASDAQ: -0.75,
      financials: -0.30,
      energy: +0.05,
      technology: -0.80,
      healthcare: -0.15,
      utilities: +0.10,
      consumer_staples: +0.05,
      consumer_discretionary: -0.35,
      industrials: -0.30,
      materials: -0.25,
      real_estate: -0.10
    },
    volatilityMultiplier: 2.5,
    correlationBreakdown: false,
    duration: '30 months'
  },

  FLASH_CRASH_2010: {
    name: 'Flash Crash (May 2010)',
    description: 'Sudden intraday market collapse',
    shocks: {
      SP500: -0.10,
      NASDAQ: -0.10,
      all_sectors: -0.10
    },
    volatilityMultiplier: 2.0,
    correlationBreakdown: false,
    duration: '1 day',
    intraday: true
  },

  LIQUIDITY_CRISIS: {
    name: 'Liquidity Crisis',
    description: 'Hypothetical severe liquidity crunch',
    shocks: {
      SP500: -0.20,
      small_cap: -0.40,
      mid_cap: -0.30,
      large_cap: -0.15,
      bid_ask_spread_multiplier: 5.0,
      volume_reduction: 0.80
    },
    volatilityMultiplier: 2.5,
    correlationBreakdown: true,
    duration: '2 weeks'
  },

  STAGFLATION: {
    name: 'Stagflation Scenario',
    description: 'High inflation + low growth',
    shocks: {
      SP500: -0.30,
      NASDAQ: -0.35,
      financials: -0.25,
      energy: +0.20,
      technology: -0.40,
      healthcare: -0.15,
      utilities: -0.10,
      consumer_staples: -0.10,
      consumer_discretionary: -0.45,
      industrials: -0.35,
      materials: +0.10,
      real_estate: -0.40
    },
    volatilityMultiplier: 1.5,
    correlationBreakdown: false,
    duration: '18 months'
  }
};

/**
 * Sector classification for stocks
 */
const SECTOR_MAPPING = {
  technology: ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'NVDA', 'AMD', 'INTC', 'CRM', 'ADBE', 'ORCL'],
  financials: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'BLK', 'SCHW', 'USB'],
  healthcare: ['JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'CVS'],
  energy: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'OXY', 'PSX', 'VLO', 'MPC', 'KMI'],
  consumer_discretionary: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'TJX', 'BKNG'],
  consumer_staples: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'MDLZ', 'CL', 'GIS', 'KHC', 'STZ'],
  industrials: ['UNP', 'HON', 'UPS', 'BA', 'CAT', 'GE', 'MMM', 'LMT', 'RTX', 'DE'],
  utilities: ['NEE', 'DUK', 'SO', 'D', 'AEP', 'SRE', 'XEL', 'ES', 'WEC', 'ED'],
  materials: ['LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'VMC', 'MLM', 'DD'],
  real_estate: ['AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'DLR', 'AVB']
};

/**
 * Get sector for a stock symbol
 */
function getSector(symbol) {
  for (const [sector, symbols] of Object.entries(SECTOR_MAPPING)) {
    if (symbols.includes(symbol.toUpperCase())) {
      return sector;
    }
  }
  return 'other';
}

/**
 * Get sector from database if available
 */
async function getSectorFromDB(symbol) {
  const database = await getDatabaseAsync();
  const result = await database.query(
    `SELECT sector FROM companies WHERE symbol = $1`,
    [symbol.toUpperCase()]
  );

  const company = result.rows[0];
  if (company?.sector) {
    // Map to our sector keys
    const sectorMap = {
      'Technology': 'technology',
      'Financial Services': 'financials',
      'Healthcare': 'healthcare',
      'Energy': 'energy',
      'Consumer Cyclical': 'consumer_discretionary',
      'Consumer Defensive': 'consumer_staples',
      'Industrials': 'industrials',
      'Utilities': 'utilities',
      'Basic Materials': 'materials',
      'Real Estate': 'real_estate'
    };
    return sectorMap[company.sector] || 'other';
  }

  return getSector(symbol);
}

/**
 * Run historical stress test on a portfolio
 */
async function runHistoricalStress(params) {
  const {
    portfolioId,
    scenarioName,
    customScenario = null
  } = params;

  const database = await getDatabaseAsync();
  const scenario = customScenario || HISTORICAL_SCENARIOS[scenarioName];

  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioName}`);
  }

  // Get portfolio positions
  const positionsResult = await database.query(`
    SELECT c.symbol, pp.shares, pp.current_value,
           pp.current_value * 1.0 / (SELECT SUM(current_value) FROM portfolio_positions WHERE portfolio_id = pp.portfolio_id) as weight
    FROM portfolio_positions pp
    JOIN companies c ON pp.company_id = c.id
    WHERE pp.portfolio_id = $1
  `, [portfolioId]);

  const positions = positionsResult.rows;
  if (positions.length === 0) {
    throw new Error('Portfolio has no positions');
  }

  // Get portfolio total value
  const portfolioResult = await database.query(`
    SELECT current_value FROM portfolios WHERE id = $1
  `, [portfolioId]);

  const portfolio = portfolioResult.rows[0];
  const totalValue = portfolio?.current_value || positions.reduce((sum, p) => sum + p.current_value, 0);

  // Calculate impact for each position
  const positionImpacts = [];
  let totalImpact = 0;
  let worstPosition = null;
  let worstImpact = 0;

  for (const position of positions) {
    const sector = await getSectorFromDB(position.symbol);
    let shock = scenario.shocks[sector] || scenario.shocks.SP500 || -0.20;

    // Apply market-wide shock if specified
    if (scenario.shocks.all_sectors !== undefined) {
      shock = scenario.shocks.all_sectors;
    }

    const positionImpact = position.current_value * shock;
    const percentImpact = shock * 100;

    positionImpacts.push({
      symbol: position.symbol,
      sector,
      currentValue: position.current_value,
      shock: shock,
      dollarImpact: positionImpact,
      percentImpact,
      stressedValue: position.current_value * (1 + shock)
    });

    totalImpact += positionImpact;

    if (positionImpact < worstImpact) {
      worstImpact = positionImpact;
      worstPosition = position.symbol;
    }
  }

  const portfolioImpactPercent = totalImpact / totalValue;

  // Estimate recovery time based on historical patterns
  const recoveryDays = estimateRecoveryTime(portfolioImpactPercent, scenario);

  // Store results
  await database.query(`
    INSERT INTO stress_test_results
    (portfolio_id, scenario_name, scenario_type, scenario_params,
     portfolio_impact, portfolio_impact_dollar, position_impacts,
     worst_position, worst_position_impact, recovery_time_days)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    portfolioId,
    scenario.name || scenarioName,
    'historical',
    JSON.stringify(scenario.shocks),
    portfolioImpactPercent,
    totalImpact,
    JSON.stringify(positionImpacts),
    worstPosition,
    worstImpact,
    recoveryDays
  ]);

  return {
    portfolioId,
    scenario: {
      name: scenario.name || scenarioName,
      description: scenario.description,
      duration: scenario.duration
    },
    results: {
      portfolioValue: totalValue,
      stressedValue: totalValue + totalImpact,
      totalImpact,
      percentImpact: (portfolioImpactPercent * 100).toFixed(2) + '%',
      worstPosition,
      worstPositionImpact: worstImpact,
      estimatedRecoveryDays: recoveryDays
    },
    positionImpacts: positionImpacts.sort((a, b) => a.dollarImpact - b.dollarImpact),
    interpretation: interpretStressResults(portfolioImpactPercent, scenario)
  };
}

/**
 * Run factor stress test
 * Apply custom factor shocks to the portfolio
 */
async function runFactorStress(params) {
  const {
    portfolioId,
    factorShocks // { equities: -0.20, rates: +0.02, credit: +0.03, volatility: +1.5 }
  } = params;

  const database = await getDatabaseAsync();

  // Get portfolio positions with betas
  const positionsResult = await database.query(`
    SELECT c.symbol, pp.shares, pp.current_value,
           pp.current_value * 1.0 / (SELECT SUM(current_value) FROM portfolio_positions WHERE portfolio_id = pp.portfolio_id) as weight,
           cm.value as beta
    FROM portfolio_positions pp
    JOIN companies c ON pp.company_id = c.id
    LEFT JOIN calculated_metrics cm ON c.symbol = cm.symbol
      AND cm.metric_name = 'beta'
      AND cm.date = (SELECT MAX(date) FROM calculated_metrics WHERE symbol = c.symbol AND metric_name = 'beta')
    WHERE pp.portfolio_id = $1
  `, [portfolioId]);

  const positions = positionsResult.rows;

  const portfolioResult = await database.query(`
    SELECT current_value FROM portfolios WHERE id = $1
  `, [portfolioId]);

  const portfolio = portfolioResult.rows[0];
  const totalValue = portfolio?.current_value || 0;
  const positionImpacts = [];
  let totalImpact = 0;

  for (const position of positions) {
    const beta = position.beta || 1.0;
    const sector = await getSectorFromDB(position.symbol);

    // Calculate impact based on factor exposures
    let shock = 0;

    // Equity market shock (beta-adjusted)
    if (factorShocks.equities) {
      shock += factorShocks.equities * beta;
    }

    // Rate sensitivity (sector-based)
    if (factorShocks.rates) {
      const rateSensitivity = {
        utilities: -5, // High duration
        real_estate: -4,
        financials: 2, // Benefits from higher rates
        technology: -2
      };
      shock += factorShocks.rates * (rateSensitivity[sector] || 0);
    }

    // Credit spread sensitivity
    if (factorShocks.credit) {
      const creditSensitivity = {
        financials: -3,
        consumer_discretionary: -2,
        industrials: -1.5
      };
      shock += factorShocks.credit * (creditSensitivity[sector] || -1);
    }

    // Volatility sensitivity (typically negative for equities)
    if (factorShocks.volatility) {
      shock += -0.02 * factorShocks.volatility * beta;
    }

    const positionImpact = position.current_value * shock;

    positionImpacts.push({
      symbol: position.symbol,
      sector,
      beta,
      shock,
      dollarImpact: positionImpact,
      percentImpact: shock * 100
    });

    totalImpact += positionImpact;
  }

  const portfolioImpactPercent = totalValue > 0 ? totalImpact / totalValue : 0;

  // Store results
  await database.query(`
    INSERT INTO stress_test_results
    (portfolio_id, scenario_name, scenario_type, scenario_params,
     portfolio_impact, portfolio_impact_dollar, position_impacts)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    portfolioId,
    'Custom Factor Stress',
    'factor',
    JSON.stringify(factorShocks),
    portfolioImpactPercent,
    totalImpact,
    JSON.stringify(positionImpacts)
  ]);

  return {
    portfolioId,
    factorShocks,
    results: {
      portfolioValue: totalValue,
      stressedValue: totalValue + totalImpact,
      totalImpact,
      percentImpact: (portfolioImpactPercent * 100).toFixed(2) + '%'
    },
    positionImpacts: positionImpacts.sort((a, b) => a.dollarImpact - b.dollarImpact),
    factorContributions: calculateFactorContributions(positionImpacts, factorShocks)
  };
}

/**
 * Run reverse stress test
 * Find the minimum shock needed to reach a target loss
 */
async function reverseStressTest(params) {
  const {
    portfolioId,
    targetLoss, // as percentage, e.g., 0.20 for 20%
    maxIterations = 100
  } = params;

  // Binary search for the shock level
  let minShock = 0;
  let maxShock = 1;
  let bestShock = null;
  let bestResult = null;

  for (let i = 0; i < maxIterations; i++) {
    const midShock = (minShock + maxShock) / 2;

    const result = await runFactorStress({
      portfolioId,
      factorShocks: { equities: -midShock }
    });

    const actualLoss = Math.abs(result.results.totalImpact / result.results.portfolioValue);

    if (Math.abs(actualLoss - targetLoss) < 0.001) {
      bestShock = midShock;
      bestResult = result;
      break;
    }

    if (actualLoss < targetLoss) {
      minShock = midShock;
    } else {
      maxShock = midShock;
      bestShock = midShock;
      bestResult = result;
    }
  }

  return {
    portfolioId,
    targetLoss: (targetLoss * 100).toFixed(1) + '%',
    results: {
      requiredMarketDrop: bestShock ? (bestShock * 100).toFixed(1) + '%' : 'Not found',
      actualLoss: bestResult?.results?.percentImpact || 'N/A',
      stressedValue: bestResult?.results?.stressedValue || 0
    },
    interpretation: bestShock
      ? `A ${(bestShock * 100).toFixed(1)}% market decline would result in approximately ${targetLoss * 100}% portfolio loss`
      : 'Could not find shock level for target loss',
    vulnerablePositions: bestResult?.positionImpacts?.slice(0, 5) || []
  };
}

/**
 * Calculate factor contributions to total impact
 */
function calculateFactorContributions(positionImpacts, factorShocks) {
  // Simplified attribution
  const contributions = {};
  let total = 0;

  for (const impact of positionImpacts) {
    total += Math.abs(impact.dollarImpact);
  }

  if (factorShocks.equities) {
    contributions.equities = `${(Math.abs(factorShocks.equities) / Object.values(factorShocks).reduce((a, b) => a + Math.abs(b), 0) * 100).toFixed(0)}%`;
  }
  if (factorShocks.rates) {
    contributions.rates = `${(Math.abs(factorShocks.rates * 10) / Object.values(factorShocks).reduce((a, b) => a + Math.abs(b), 0) * 100).toFixed(0)}%`;
  }

  return contributions;
}

/**
 * Estimate recovery time based on historical patterns
 */
function estimateRecoveryTime(drawdown, scenario) {
  // Empirical relationship: recovery time roughly scales with drawdown depth
  // GFC took ~4 years to recover from 50% drop
  // COVID took ~6 months to recover from 35% drop

  const drawdownPercent = Math.abs(drawdown);

  if (scenario.intraday) {
    return 1; // Flash crashes typically recover same day
  }

  // Rough estimate: 2 years per 10% drawdown, minimum 30 days
  const baseDays = drawdownPercent * 20 * 252; // 20 years for 100% loss

  // Adjust for scenario type
  let multiplier = 1.0;
  if (scenario.correlationBreakdown) {
    multiplier = 1.3; // Correlation breakdowns take longer to recover
  }

  return Math.max(30, Math.round(baseDays * multiplier));
}

/**
 * Interpret stress test results
 */
function interpretStressResults(impact, scenario) {
  const interpretations = [];
  const impactPercent = Math.abs(impact * 100);

  if (impactPercent > 40) {
    interpretations.push('SEVERE: Portfolio would experience catastrophic losses in this scenario');
    interpretations.push('Consider hedging strategies or reducing concentrated positions');
  } else if (impactPercent > 25) {
    interpretations.push('HIGH: Portfolio is significantly exposed to this scenario');
    interpretations.push('Review sector allocations and consider protective puts');
  } else if (impactPercent > 15) {
    interpretations.push('MODERATE: Portfolio shows reasonable resilience');
    interpretations.push('Monitor positions with highest impact');
  } else {
    interpretations.push('LOW: Portfolio appears well-positioned for this scenario');
  }

  if (scenario.correlationBreakdown) {
    interpretations.push('Note: Scenario includes correlation breakdown - diversification benefits may be reduced');
  }

  return interpretations;
}

/**
 * Get all available scenarios
 */
function getAvailableScenarios() {
  return Object.entries(HISTORICAL_SCENARIOS).map(([key, scenario]) => ({
    id: key,
    name: scenario.name,
    description: scenario.description,
    duration: scenario.duration,
    severity: estimateSeverity(scenario.shocks)
  }));
}

function estimateSeverity(shocks) {
  const avgShock = Object.values(shocks)
    .filter(v => typeof v === 'number')
    .reduce((a, b) => a + b, 0) / Object.keys(shocks).length;

  if (avgShock < -0.40) return 'EXTREME';
  if (avgShock < -0.25) return 'HIGH';
  if (avgShock < -0.15) return 'MODERATE';
  return 'LOW';
}

/**
 * Get stress test history for a portfolio
 */
async function getStressTestHistory(portfolioId, limit = 10) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT *
    FROM stress_test_results
    WHERE portfolio_id = $1
    ORDER BY run_date DESC
    LIMIT $2
  `, [portfolioId, limit]);

  return result.rows.map(row => ({
    ...row,
    scenario_params: JSON.parse(row.scenario_params || '{}'),
    position_impacts: JSON.parse(row.position_impacts || '[]')
  }));
}

module.exports = {
  runHistoricalStress,
  runFactorStress,
  reverseStressTest,
  getAvailableScenarios,
  getStressTestHistory,
  HISTORICAL_SCENARIOS
};
