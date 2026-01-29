/**
 * Monte Carlo Worker Thread
 * Offloads CPU-intensive simulation calculations to a separate thread
 * Tier 4 optimization
 */

const { parentPort, workerData } = require('worker_threads');

/**
 * Box-Muller transform for normal distribution
 */
function normalRandom(mean = 0, std = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

/**
 * Student's t distribution sample (using normal approximation for speed)
 * Lower df = fatter tails
 */
function studentTRandom(mean = 0, scale = 1, df = 5) {
  // Chi-squared approximation for Student's t
  let chi2 = 0;
  for (let i = 0; i < df; i++) {
    const z = normalRandom(0, 1);
    chi2 += z * z;
  }
  const t = normalRandom(0, 1) / Math.sqrt(chi2 / df);
  return mean + scale * t;
}

/**
 * Quick DCF calculation optimized for Monte Carlo (simplified for speed)
 */
function quickDCF(params) {
  const {
    revenue,
    ebitdaMargin,
    growth,          // [stage1, stage2, stage3]
    terminalGrowth,
    wacc,
    exitMultiple,
    netDebt,
    sharesOutstanding,
    taxRate = 0.21,
    capexPctRevenue = 0.05,
    daPctRevenue = 0.04,
    nwcPctRevenueChange = 0.10
  } = params;

  if (!revenue || !sharesOutstanding || sharesOutstanding <= 0) return null;

  // Project FCFs for 10 years
  let projectedRevenue = revenue;
  let pvFCFs = 0;
  let lastFCF = 0;

  for (let year = 1; year <= 10; year++) {
    // Determine growth rate by stage
    let growthRate;
    if (year <= 3) growthRate = growth[0];
    else if (year <= 7) growthRate = growth[1];
    else growthRate = growth[2];

    const prevRevenue = projectedRevenue;
    projectedRevenue = projectedRevenue * (1 + growthRate);

    // Calculate FCF from revenue
    const ebitda = projectedRevenue * ebitdaMargin;
    const da = projectedRevenue * daPctRevenue;
    const ebit = ebitda - da;
    const nopat = ebit * (1 - taxRate);
    const capex = projectedRevenue * capexPctRevenue;
    const nwcChange = (projectedRevenue - prevRevenue) * nwcPctRevenueChange;
    const fcf = nopat + da - capex - nwcChange;

    // Discount FCF
    const discountFactor = Math.pow(1 + wacc, year);
    pvFCFs += fcf / discountFactor;
    lastFCF = fcf;
  }

  // Terminal value (average of Gordon Growth and Exit Multiple)
  const gordonTV = (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  const exitTV = lastFCF * exitMultiple;
  const terminalValue = (gordonTV + exitTV) / 2;

  // Discount terminal value to present
  const pvTerminal = terminalValue / Math.pow(1 + wacc, 10);

  // Enterprise value to equity value
  const enterpriseValue = pvFCFs + pvTerminal;
  const equityValue = enterpriseValue - netDebt;

  // Per share value
  const valuePerShare = equityValue / sharesOutstanding;

  return valuePerShare > 0 ? valuePerShare : null;
}

/**
 * Run Monte Carlo simulation batch
 */
function runSimulationBatch(config) {
  const {
    startIdx,
    batchSize,
    baseParams,
    uncertainties,
    distributionType,
    df
  } = config;

  const valuations = [];

  for (let i = 0; i < batchSize; i++) {
    // Sample inputs from distributions
    let growth1, growth2, growth3, margin, wacc, exitMultiple;

    if (distributionType === 'normal') {
      growth1 = normalRandom(baseParams.growth1, uncertainties.growth);
      growth2 = normalRandom(baseParams.growth2, uncertainties.growth * 0.8);
      growth3 = normalRandom(baseParams.growth3, uncertainties.growth * 0.6);
      margin = normalRandom(baseParams.margin, uncertainties.margin);
      wacc = normalRandom(baseParams.wacc, uncertainties.wacc);
      exitMultiple = normalRandom(baseParams.exitMultiple, uncertainties.multiple);
    } else {
      // Student's t for fat tails
      growth1 = studentTRandom(baseParams.growth1, uncertainties.growth, df);
      growth2 = studentTRandom(baseParams.growth2, uncertainties.growth * 0.8, df);
      growth3 = studentTRandom(baseParams.growth3, uncertainties.growth * 0.6, df);
      margin = studentTRandom(baseParams.margin, uncertainties.margin, df);
      wacc = studentTRandom(baseParams.wacc, uncertainties.wacc, df);
      exitMultiple = studentTRandom(baseParams.exitMultiple, uncertainties.multiple, df);
    }

    // Apply bounds to prevent unrealistic values
    growth1 = Math.max(-0.20, Math.min(0.50, growth1));
    growth2 = Math.max(-0.10, Math.min(0.40, growth2));
    growth3 = Math.max(-0.05, Math.min(0.30, growth3));
    margin = Math.max(0.01, Math.min(0.60, margin));
    wacc = Math.max(0.04, Math.min(0.25, wacc));
    exitMultiple = Math.max(3, Math.min(30, exitMultiple));

    // Ensure terminal growth < wacc
    const terminalGrowth = Math.min(baseParams.terminalGrowth, wacc - 0.02);

    // Run quick DCF
    const simValue = quickDCF({
      revenue: baseParams.revenue,
      ebitdaMargin: margin,
      growth: [growth1, growth2, growth3],
      terminalGrowth,
      wacc,
      exitMultiple,
      netDebt: baseParams.netDebt,
      sharesOutstanding: baseParams.sharesOutstanding
    });

    if (simValue !== null && simValue > 0 && isFinite(simValue)) {
      valuations.push(simValue);
    }
  }

  return valuations;
}

// Main worker execution
if (parentPort) {
  const { config } = workerData;
  const results = runSimulationBatch(config);
  parentPort.postMessage({ valuations: results });
}

module.exports = { runSimulationBatch, quickDCF };
