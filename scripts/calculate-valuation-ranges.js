#!/usr/bin/env node
/**
 * Calculate Valuation Ranges
 *
 * Computes historical valuation percentiles for each company.
 * This enables "cheap vs own history" analysis.
 */

const db = require('../src/database');

console.log('\n📊 Calculating Valuation Ranges and Percentiles...\n');

const dbConn = db.getDatabase();

// Get companies with sufficient valuation history (at least 3 data points)
const companies = dbConn.prepare(`
  SELECT DISTINCT vh.company_id, vh.symbol, COUNT(*) as data_points
  FROM valuation_history vh
  GROUP BY vh.company_id
  HAVING COUNT(*) >= 3
  ORDER BY data_points DESC
`).all();

console.log(`Found ${companies.length} companies with sufficient history\n`);

// Prepare insert statement
const insertStmt = dbConn.prepare(`
  INSERT INTO valuation_ranges (
    company_id, symbol,
    pe_min_1y, pe_max_1y, pe_avg_1y, pe_median_1y,
    pe_min_3y, pe_max_3y, pe_avg_3y, pe_median_3y,
    pe_min_5y, pe_max_5y, pe_avg_5y, pe_median_5y,
    pb_min_5y, pb_max_5y, pb_avg_5y, pb_median_5y,
    ev_ebitda_min_5y, ev_ebitda_max_5y, ev_ebitda_avg_5y,
    fcf_yield_min_5y, fcf_yield_max_5y, fcf_yield_avg_5y,
    current_pe, current_pe_percentile,
    current_pb, current_pb_percentile,
    current_fcf_yield, current_fcf_yield_percentile,
    valuation_signal, signal_confidence
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id) DO UPDATE SET
    pe_min_1y = excluded.pe_min_1y, pe_max_1y = excluded.pe_max_1y,
    pe_avg_1y = excluded.pe_avg_1y, pe_median_1y = excluded.pe_median_1y,
    pe_min_3y = excluded.pe_min_3y, pe_max_3y = excluded.pe_max_3y,
    pe_avg_3y = excluded.pe_avg_3y, pe_median_3y = excluded.pe_median_3y,
    pe_min_5y = excluded.pe_min_5y, pe_max_5y = excluded.pe_max_5y,
    pe_avg_5y = excluded.pe_avg_5y, pe_median_5y = excluded.pe_median_5y,
    pb_min_5y = excluded.pb_min_5y, pb_max_5y = excluded.pb_max_5y,
    pb_avg_5y = excluded.pb_avg_5y, pb_median_5y = excluded.pb_median_5y,
    ev_ebitda_min_5y = excluded.ev_ebitda_min_5y, ev_ebitda_max_5y = excluded.ev_ebitda_max_5y,
    ev_ebitda_avg_5y = excluded.ev_ebitda_avg_5y,
    fcf_yield_min_5y = excluded.fcf_yield_min_5y, fcf_yield_max_5y = excluded.fcf_yield_max_5y,
    fcf_yield_avg_5y = excluded.fcf_yield_avg_5y,
    current_pe = excluded.current_pe, current_pe_percentile = excluded.current_pe_percentile,
    current_pb = excluded.current_pb, current_pb_percentile = excluded.current_pb_percentile,
    current_fcf_yield = excluded.current_fcf_yield, current_fcf_yield_percentile = excluded.current_fcf_yield_percentile,
    valuation_signal = excluded.valuation_signal, signal_confidence = excluded.signal_confidence,
    calculated_at = CURRENT_TIMESTAMP
`);

// Helper functions
function calculateStats(values) {
  if (!values || values.length === 0) return { min: null, max: null, avg: null, median: null };

  const filtered = values.filter(v => v !== null && v > 0 && v < 500); // Reasonable P/E range
  if (filtered.length === 0) return { min: null, max: null, avg: null, median: null };

  const sorted = [...filtered].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  return { min, max, avg, median, values: sorted };
}

function calculatePercentile(sortedValues, value) {
  if (!sortedValues || sortedValues.length === 0 || value === null) return null;
  let count = 0;
  for (const v of sortedValues) {
    if (v <= value) count++;
  }
  return Math.round((count / sortedValues.length) * 100);
}

function getValuationSignal(pePercentile, fcfYieldPercentile) {
  if (pePercentile === null && fcfYieldPercentile === null) {
    return { signal: 'unknown', confidence: 0 };
  }

  // Lower PE percentile = cheaper, Higher FCF yield percentile = cheaper
  let valuationScore = 50;
  let dataPoints = 0;

  if (pePercentile !== null) {
    valuationScore = 100 - pePercentile;
    dataPoints++;
  }
  if (fcfYieldPercentile !== null) {
    valuationScore = (valuationScore + fcfYieldPercentile) / (dataPoints + 1);
    dataPoints++;
  }

  let signal, confidence;
  if (valuationScore > 80) { signal = 'very_cheap'; confidence = 0.9; }
  else if (valuationScore > 65) { signal = 'cheap'; confidence = 0.7; }
  else if (valuationScore > 35) { signal = 'fair'; confidence = 0.5; }
  else if (valuationScore > 20) { signal = 'expensive'; confidence = 0.7; }
  else { signal = 'very_expensive'; confidence = 0.9; }

  return { signal, confidence };
}

let processed = 0;

const processCompany = dbConn.transaction((company) => {
  // Get all history for this company
  const history = dbConn.prepare(`
    SELECT pe_ratio, pb_ratio, fcf_yield, ev_ebitda, snapshot_date
    FROM valuation_history
    WHERE company_id = ?
    ORDER BY snapshot_date DESC
  `).all(company.company_id);

  // Get current values
  const current = dbConn.prepare(`
    SELECT pe_ratio, pb_ratio, fcf_yield
    FROM valuation_history
    WHERE company_id = ?
    ORDER BY snapshot_date DESC
    LIMIT 1
  `).get(company.company_id);

  // Calculate ranges for different time periods
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().split('T')[0];
  const threeYearsAgo = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()).toISOString().split('T')[0];
  const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate()).toISOString().split('T')[0];

  const history1y = history.filter(h => h.snapshot_date >= oneYearAgo);
  const history3y = history.filter(h => h.snapshot_date >= threeYearsAgo);
  const history5y = history.filter(h => h.snapshot_date >= fiveYearsAgo);

  // Calculate PE stats
  const pe1y = calculateStats(history1y.map(h => h.pe_ratio));
  const pe3y = calculateStats(history3y.map(h => h.pe_ratio));
  const pe5y = calculateStats(history5y.map(h => h.pe_ratio));

  // Calculate P/B stats (5y only)
  const pb5y = calculateStats(history5y.map(h => h.pb_ratio));

  // Calculate EV/EBITDA stats (5y only)
  const evEbitda5y = calculateStats(history5y.map(h => h.ev_ebitda));

  // Calculate FCF Yield stats (5y only) - no upper filter needed
  const fcfYieldValues = history5y.map(h => h.fcf_yield).filter(v => v !== null);
  const fcfYield5y = {
    min: fcfYieldValues.length > 0 ? Math.min(...fcfYieldValues) : null,
    max: fcfYieldValues.length > 0 ? Math.max(...fcfYieldValues) : null,
    avg: fcfYieldValues.length > 0 ? fcfYieldValues.reduce((a, b) => a + b, 0) / fcfYieldValues.length : null,
    values: [...fcfYieldValues].sort((a, b) => a - b)
  };

  // Calculate current percentiles
  const currentPePercentile = calculatePercentile(pe5y.values, current?.pe_ratio);
  const currentPbPercentile = calculatePercentile(pb5y.values, current?.pb_ratio);
  const currentFcfYieldPercentile = calculatePercentile(fcfYield5y.values, current?.fcf_yield);

  // Get valuation signal
  const { signal, confidence } = getValuationSignal(currentPePercentile, currentFcfYieldPercentile);

  // Insert/update
  insertStmt.run(
    company.company_id, company.symbol,
    pe1y.min, pe1y.max, pe1y.avg, pe1y.median,
    pe3y.min, pe3y.max, pe3y.avg, pe3y.median,
    pe5y.min, pe5y.max, pe5y.avg, pe5y.median,
    pb5y.min, pb5y.max, pb5y.avg, pb5y.median,
    evEbitda5y.min, evEbitda5y.max, evEbitda5y.avg,
    fcfYield5y.min, fcfYield5y.max, fcfYield5y.avg,
    current?.pe_ratio, currentPePercentile,
    current?.pb_ratio, currentPbPercentile,
    current?.fcf_yield, currentFcfYieldPercentile,
    signal, confidence
  );
});

for (const company of companies) {
  try {
    processCompany(company);
    processed++;

    if (processed % 500 === 0) {
      console.log(`  Processed ${processed}/${companies.length} companies`);
    }
  } catch (err) {
    console.error(`Error processing ${company.symbol}:`, err.message);
  }
}

console.log(`\n✅ Range calculation complete!`);
console.log(`   Companies processed: ${processed}\n`);

// Verify
const count = dbConn.prepare('SELECT COUNT(*) as cnt FROM valuation_ranges').get();
console.log(`📊 Total valuation_ranges records: ${count.cnt.toLocaleString()}\n`);

// Show signal distribution
const signalDist = dbConn.prepare(`
  SELECT valuation_signal, COUNT(*) as count
  FROM valuation_ranges
  GROUP BY valuation_signal
  ORDER BY count DESC
`).all();

console.log('Valuation Signal Distribution:');
console.table(signalDist);

// Show cheapest quality stocks
console.log('\n📉 Cheapest Quality Stocks (vs their own history):');
const cheapest = dbConn.prepare(`
  SELECT
    vr.symbol,
    c.name,
    ROUND(vr.current_pe, 1) as current_pe,
    ROUND(vr.pe_avg_5y, 1) as avg_5y_pe,
    vr.current_pe_percentile as pe_pctl,
    ROUND(vr.current_fcf_yield, 1) as fcf_yield,
    vr.valuation_signal as signal
  FROM valuation_ranges vr
  JOIN companies c ON vr.company_id = c.id
  JOIN calculated_metrics cm ON cm.company_id = c.id AND cm.period_type = 'annual'
  WHERE vr.valuation_signal IN ('cheap', 'very_cheap')
    AND vr.current_pe_percentile IS NOT NULL
    AND vr.current_pe_percentile < 25
    AND cm.roic > 0.10
  ORDER BY vr.current_pe_percentile ASC
  LIMIT 15
`).all();
console.table(cheapest);

process.exit(0);
