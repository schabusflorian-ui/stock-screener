#!/usr/bin/env node

/**
 * FMP Ground Truth Validation
 *
 * Validates our calculated metrics against Financial Modeling Prep data.
 * This provides a second source of truth beyond Yahoo Finance.
 *
 * Usage:
 *   FMP_API_KEY=your_key node scripts/validate-with-fmp.js [options]
 *
 * Options:
 *   --symbols=AAPL,MSFT,GOOGL  Specific symbols to validate
 *   --count=10                  Number of random symbols to validate
 *   --verbose                   Show detailed comparison for each metric
 *   --save                      Save results to JSON file
 *
 * API Usage:
 *   - 4 calls per symbol (ratios, keyMetrics, scores, quote)
 *   - Daily limit: 250 calls
 *   - Max ~62 symbols per day with full metrics
 */

const db = require('../src/database').getDatabase();
const FMPFetcher = require('../src/validation/fmpFetcher');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value || true;
  }
  return acc;
}, {});

// Configuration
const config = {
  symbols: args.symbols ? args.symbols.split(',') : null,
  count: parseInt(args.count) || 10,
  verbose: args.verbose || false,
  save: args.save || false,
};

// Metrics to compare and their tolerances (as percentage difference)
const METRICS_TO_COMPARE = {
  // Profitability (should match closely)
  gross_margin: { tolerance: 5, label: 'Gross Margin', skipForFinancials: true },
  operating_margin: { tolerance: 8, label: 'Operating Margin', skipForBanks: true },
  net_margin: { tolerance: 10, label: 'Net Margin', skipForBanks: true },
  roe: { tolerance: 20, label: 'ROE' },
  roa: { tolerance: 20, label: 'ROA' },
  roic: { tolerance: 25, label: 'ROIC/ROCE' },

  // Liquidity (should match well)
  current_ratio: { tolerance: 10, label: 'Current Ratio' },
  quick_ratio: { tolerance: 15, label: 'Quick Ratio' },

  // Leverage (can vary due to lease treatment)
  debt_to_equity: { tolerance: 25, label: 'Debt/Equity' },
  debt_to_assets: { tolerance: 20, label: 'Debt/Assets' },
  interest_coverage: { tolerance: 30, label: 'Interest Coverage' },

  // Efficiency
  asset_turnover: { tolerance: 15, label: 'Asset Turnover' },

  // Cash flow (can vary significantly)
  fcf_yield: { tolerance: 30, label: 'FCF Yield' },
};

// Companies that don't have traditional gross margin
// - Financial sector: Banks, insurance, payment processors
// - Energy sector: Oil & gas companies report differently
// - Healthcare: Insurance/managed care companies
// Check both sector and industry fields
const SECTORS_WITHOUT_GROSS_MARGIN = [
  // Financial
  'Financial Services', 'Finance', 'Insurance', 'Banks', 'Banking', 'Commercial Banks', 'National Commercial Banks',
  // Energy
  'Energy', 'Oil & Gas', 'Petroleum', 'Petroleum Refining',
  // Healthcare Insurance
  'Healthcare Plans', 'Managed Healthcare', 'Medical Insurance', 'Hospital & Medical Insurance',
  // Payment processors (categorized as Tech/Business Services but don't have traditional COGS)
  'Business Services'
];

/**
 * Get our TTM metrics for a symbol
 */
function getOurMetrics(symbol) {
  // First try TTM
  let result = db.prepare(`
    SELECT m.*, c.symbol, c.sector, c.industry
    FROM calculated_metrics m
    JOIN companies c ON c.id = m.company_id
    WHERE c.symbol = ?
      AND m.period_type = 'ttm'
    LIMIT 1
  `).get(symbol);

  // Fallback to most recent quarterly
  if (!result) {
    result = db.prepare(`
      SELECT m.*, c.symbol, c.sector, c.industry
      FROM calculated_metrics m
      JOIN companies c ON c.id = m.company_id
      WHERE c.symbol = ?
        AND m.period_type = 'quarterly'
      ORDER BY m.fiscal_period DESC
      LIMIT 1
    `).get(symbol);
  }

  // Fallback to annual
  if (!result) {
    result = db.prepare(`
      SELECT m.*, c.symbol, c.sector, c.industry
      FROM calculated_metrics m
      JOIN companies c ON c.id = m.company_id
      WHERE c.symbol = ?
        AND m.period_type = 'annual'
      ORDER BY m.fiscal_year DESC
      LIMIT 1
    `).get(symbol);
  }

  return result;
}

/**
 * Compare two metric values
 */
function compareValues(ours, fmp, tolerance) {
  if (ours == null && fmp == null) return { status: 'both_null', diff: null };
  if (ours == null) return { status: 'missing_ours', diff: null };
  if (fmp == null) return { status: 'missing_fmp', diff: null };

  // Handle zero values
  if (ours === 0 && fmp === 0) return { status: 'match', diff: 0 };
  if (ours === 0 || fmp === 0) {
    const absDiff = Math.abs(ours - fmp);
    return {
      status: absDiff < 1 ? 'close' : 'mismatch',
      diff: absDiff,
    };
  }

  // Calculate relative difference
  const avgAbs = (Math.abs(ours) + Math.abs(fmp)) / 2;
  const diff = Math.abs(ours - fmp) / avgAbs * 100;

  let status;
  if (diff <= tolerance * 0.5) status = 'exact';
  else if (diff <= tolerance) status = 'match';
  else if (diff <= tolerance * 1.5) status = 'close';
  else if (diff <= tolerance * 3) status = 'concerning';
  else status = 'major';

  return { status, diff };
}

/**
 * Select random symbols with data (excluding CIK-only symbols)
 */
function selectRandomSymbols(count) {
  return db.prepare(`
    SELECT DISTINCT c.symbol
    FROM companies c
    JOIN calculated_metrics m ON m.company_id = c.id
    WHERE c.is_active = 1
      AND m.gross_margin IS NOT NULL
      AND c.symbol NOT LIKE 'CIK_%'
      AND LENGTH(c.symbol) <= 5
    ORDER BY RANDOM()
    LIMIT ?
  `).all(count).map(r => r.symbol);
}

/**
 * Main validation function
 */
async function runValidation() {
  console.log('\n🔍 FMP GROUND TRUTH VALIDATION');
  console.log('='.repeat(60));

  const fetcher = new FMPFetcher({
    apiKey: process.env.FMP_API_KEY,
    delay: 400, // Conservative rate limiting
  });

  // Check API key
  if (!process.env.FMP_API_KEY) {
    console.error('❌ FMP_API_KEY environment variable not set');
    console.log('   Usage: FMP_API_KEY=your_key node scripts/validate-with-fmp.js');
    process.exit(1);
  }

  // Select symbols
  const symbols = config.symbols || selectRandomSymbols(config.count);
  console.log(`\n📋 Validating ${symbols.length} symbols: ${symbols.join(', ')}`);

  // Estimate API usage
  const estimate = fetcher.estimateCalls(symbols.length);
  console.log(`📊 API calls: ~${estimate.totalCalls} (${estimate.remainingAfter} remaining after)`);

  if (!estimate.canFetch) {
    console.error('❌ Not enough API calls remaining for this validation');
    process.exit(1);
  }

  // Results storage
  const results = {
    timestamp: new Date().toISOString(),
    symbolsValidated: symbols.length,
    byMetric: {},
    bySymbol: [],
    issues: [],
  };

  // Initialize metric aggregators
  for (const metric of Object.keys(METRICS_TO_COMPARE)) {
    results.byMetric[metric] = {
      exact: 0,
      match: 0,
      close: 0,
      concerning: 0,
      major: 0,
      missing_ours: 0,
      missing_fmp: 0,
      comparisons: [],
    };
  }

  console.log('\n📡 Fetching FMP data...\n');

  // Process each symbol
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    process.stdout.write(`  [${i + 1}/${symbols.length}] ${symbol}... `);

    // Get our data
    const ours = getOurMetrics(symbol);
    if (!ours) {
      console.log('❌ No data in our DB');
      continue;
    }

    // Fetch FMP data
    const fmpResult = await fetcher.fetchMetrics(symbol);
    if (!fmpResult.success) {
      console.log(`❌ FMP error: ${fmpResult.error}`);
      continue;
    }

    const fmp = fmpResult.data;

    // Compare metrics
    const comparison = {
      symbol,
      sector: ours.sector,
      periodType: ours.period_type,
      metrics: {},
    };

    let matchCount = 0;
    let totalCompared = 0;

    // Check if this is a sector/industry where gross margin doesn't apply
    const sectorMatch = ours.sector && SECTORS_WITHOUT_GROSS_MARGIN.some(s =>
      ours.sector.toLowerCase().includes(s.toLowerCase())
    );
    const industryMatch = ours.industry && SECTORS_WITHOUT_GROSS_MARGIN.some(s =>
      ours.industry.toLowerCase().includes(s.toLowerCase())
    );
    const skipGrossMargin = sectorMatch || industryMatch;

    // Banks have completely different income structures (interest income vs operating income)
    const isBankOrInsurance = ours.industry && (
      ours.industry.toLowerCase().includes('bank') ||
      ours.industry.toLowerCase().includes('insurance') ||
      ours.industry.toLowerCase().includes('finance')
    );

    for (const [metric, config] of Object.entries(METRICS_TO_COMPARE)) {
      // Skip gross_margin for sectors where it doesn't apply
      if (config.skipForFinancials && skipGrossMargin) {
        comparison.metrics[metric] = {
          ours: null,
          fmp: null,
          status: 'skipped_financial',
          diff: null,
        };
        continue;
      }

      // Skip operating/net margin for banks (different income structure)
      if (config.skipForBanks && isBankOrInsurance) {
        comparison.metrics[metric] = {
          ours: null,
          fmp: null,
          status: 'skipped_bank',
          diff: null,
        };
        continue;
      }

      const ourVal = ours[metric];
      const fmpVal = fmp[metric];

      const result = compareValues(ourVal, fmpVal, config.tolerance);
      comparison.metrics[metric] = {
        ours: ourVal,
        fmp: fmpVal,
        ...result,
      };

      // Aggregate
      const metricStats = results.byMetric[metric];
      metricStats[result.status]++;

      if (result.diff !== null) {
        metricStats.comparisons.push({
          symbol,
          ours: ourVal,
          fmp: fmpVal,
          diff: result.diff,
        });
        totalCompared++;

        if (result.status === 'exact' || result.status === 'match' || result.status === 'close') {
          matchCount++;
        }

        if (result.status === 'major') {
          results.issues.push({
            symbol,
            metric,
            label: config.label,
            ours: ourVal,
            fmp: fmpVal,
            diff: result.diff,
            sector: ours.sector,
          });
        }
      }
    }

    const accuracy = totalCompared > 0 ? ((matchCount / totalCompared) * 100).toFixed(0) : 'N/A';
    console.log(`✓ ${matchCount}/${totalCompared} metrics match (${accuracy}%)`);

    comparison.matchCount = matchCount;
    comparison.totalCompared = totalCompared;
    comparison.accuracy = accuracy;
    results.bySymbol.push(comparison);

    // Verbose output
    if (config.verbose) {
      for (const [metric, data] of Object.entries(comparison.metrics)) {
        if (data.status !== 'both_null' && data.status !== 'missing_fmp') {
          const statusIcon = {
            exact: '✅',
            match: '✅',
            close: '🟡',
            concerning: '🟠',
            major: '❌',
            missing_ours: '⬜',
            missing_fmp: '⬜',
          }[data.status];

          const diff = data.diff !== null ? `(${data.diff.toFixed(1)}% diff)` : '';
          console.log(`      ${statusIcon} ${METRICS_TO_COMPARE[metric].label}: ours=${data.ours?.toFixed(2) ?? 'null'} vs fmp=${data.fmp?.toFixed(2) ?? 'null'} ${diff}`);
        }
      }
      console.log('');
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(60));

  console.log('\n📋 RESULTS BY METRIC:');
  console.log('-'.repeat(60));

  let totalMatch = 0;
  let totalCompared = 0;

  for (const [metric, stats] of Object.entries(results.byMetric)) {
    const comparable = stats.exact + stats.match + stats.close + stats.concerning + stats.major;
    if (comparable === 0) continue;

    const goodMatches = stats.exact + stats.match + stats.close;
    const pct = ((goodMatches / comparable) * 100).toFixed(0);

    totalMatch += goodMatches;
    totalCompared += comparable;

    const bar = '█'.repeat(Math.round(goodMatches / comparable * 20));
    console.log(`  ${METRICS_TO_COMPARE[metric].label.padEnd(18)} ${bar.padEnd(20)} ${pct}% (${goodMatches}/${comparable})`);
  }

  console.log('-'.repeat(60));
  const overallAccuracy = totalCompared > 0 ? ((totalMatch / totalCompared) * 100).toFixed(1) : 0;
  console.log(`  ${'OVERALL'.padEnd(18)} ${overallAccuracy}% accuracy (${totalMatch}/${totalCompared} data points)`);

  // Show top issues
  if (results.issues.length > 0) {
    console.log('\n⚠️  TOP DISCREPANCIES:');
    const topIssues = results.issues
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 10);

    for (const issue of topIssues) {
      console.log(`  ${issue.symbol} ${issue.label}: ours=${issue.ours?.toFixed(2)} vs fmp=${issue.fmp?.toFixed(2)} (${issue.diff.toFixed(1)}% diff)`);
    }
  }

  // API usage
  const usage = fetcher.getUsageStats();
  console.log(`\n📡 API Usage: ${usage.callsMade} calls (${usage.remaining} remaining today)`);

  // Save results
  if (config.save) {
    const fs = require('fs');
    const filename = `fmp-validation-${new Date().toISOString().split('T')[0]}.json`;
    fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to ${filename}`);
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run validation
runValidation().catch(console.error);
