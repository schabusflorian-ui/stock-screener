// test-metrics-impact.js
// Compare current stored metrics vs what would be calculated with latest code
// Run: node scripts/test-metrics-impact.js

const path = require('path');
const projectRoot = path.join(__dirname, '..');
const db = require(path.join(projectRoot, 'src/database'));
const MetricCalculator = require(path.join(projectRoot, 'src/services/metricCalculator'));

const database = db.getDatabase();
const calculator = new MetricCalculator();

// Test companies - mix of sectors
const TEST_SYMBOLS = [
  'AAPL',  // Tech
  'MSFT',  // Tech
  'JPM',   // Financial
  'META',  // Tech (had debt_to_equity = 0)
  'XOM',   // Energy
  'JNJ',   // Healthcare
  'COST',  // Retail (had 100% gross margin issue)
  'HD',    // Retail (quick ratio was way off)
  'V',     // Payment processor
  'BRK-B'  // Conglomerate/Financial
];

const METRICS_TO_CHECK = [
  'gross_margin',
  'operating_margin',
  'net_margin',
  'roe',
  'roa',
  'current_ratio',
  'quick_ratio',
  'debt_to_equity'
];

function mergeFinancialStatements(financials) {
  const periods = new Map();

  for (const f of financials) {
    const periodKey = `${f.fiscal_year}_${f.fiscal_quarter || 'FY'}_${f.period_type}`;

    if (!periods.has(periodKey)) {
      periods.set(periodKey, {
        fiscalDateEnding: f.fiscal_date_ending,
        fiscalYear: f.fiscal_year,
        fiscalQuarter: f.fiscal_quarter,
        periodType: f.period_type || 'annual',
        balance_sheet: null,
        income_statement: null,
        cash_flow: null
      });
    }

    const data = JSON.parse(f.data);
    const period = periods.get(periodKey);

    if (f.statement_type === 'balance_sheet') {
      period.balance_sheet = data;
      period.fiscalDateEnding = f.fiscal_date_ending;
    } else if (f.statement_type === 'income_statement') {
      period.income_statement = data;
    } else if (f.statement_type === 'cash_flow') {
      period.cash_flow = data;
    }
  }

  return Array.from(periods.values());
}

function formatValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toFixed(2);
  return String(val);
}

function getDiff(stored, calculated) {
  if (stored === null && calculated === null) return '—';
  if (stored === null) return `NULL → ${formatValue(calculated)}`;
  if (calculated === null) return `${formatValue(stored)} → NULL`;

  const diff = Math.abs(stored - calculated);
  const pctDiff = stored !== 0 ? (diff / Math.abs(stored) * 100).toFixed(1) : '∞';

  if (diff < 0.01) return '≈ same';
  return `${formatValue(stored)} → ${formatValue(calculated)} (${pctDiff}% diff)`;
}

async function testMetricsImpact() {
  console.log('\n📊 METRICS IMPACT TEST\n');
  console.log('Comparing stored metrics vs recalculated values\n');
  console.log('='.repeat(80));

  const results = [];

  for (const symbol of TEST_SYMBOLS) {
    console.log(`\n🔍 ${symbol}`);
    console.log('-'.repeat(40));

    // Get company
    const company = database.prepare('SELECT id, symbol, sector FROM companies WHERE symbol = ?').get(symbol);
    if (!company) {
      console.log('  ❌ Company not found');
      continue;
    }

    // Get current stored metrics (most recent annual)
    const storedMetrics = database.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ? AND period_type = 'annual'
      ORDER BY fiscal_period DESC LIMIT 1
    `).get(company.id);

    if (!storedMetrics) {
      console.log('  ⚠️ No stored metrics');
      continue;
    }

    // Get financial data for same period
    const financials = database.prepare(`
      SELECT fiscal_date_ending, fiscal_year, fiscal_period as fiscal_quarter,
             period_type, statement_type, data
      FROM financial_data
      WHERE company_id = ? AND fiscal_year = ?
      ORDER BY fiscal_date_ending DESC
    `).all(company.id, storedMetrics.fiscal_year);

    if (financials.length === 0) {
      console.log('  ⚠️ No financial data for period');
      continue;
    }

    // Merge statements
    const periods = mergeFinancialStatements(financials);
    const latestPeriod = periods.find(p => p.periodType === 'annual');

    if (!latestPeriod || !latestPeriod.balance_sheet || !latestPeriod.income_statement) {
      console.log('  ⚠️ Incomplete financial statements');
      continue;
    }

    // Calculate fresh metrics
    const context = { companyId: company.id, fiscalDate: latestPeriod.fiscalDateEnding, periodType: 'annual' };
    const calculated = calculator.calculateAllMetrics(latestPeriod, null, null, context, null);

    console.log(`  Sector: ${company.sector || 'Unknown'}`);
    console.log(`  Period: FY${storedMetrics.fiscal_year}`);
    console.log('');

    const companyResults = { symbol, sector: company.sector, changes: [] };

    for (const metric of METRICS_TO_CHECK) {
      // Map metric name to stored column name
      const storedKey = metric;
      const calcKey = metric.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // snake_case to camelCase

      const storedVal = storedMetrics[storedKey];
      const calcVal = calculated[calcKey];

      const diff = getDiff(storedVal, calcVal);

      const hasChange = diff !== '≈ same' && diff !== '—';
      const icon = hasChange ? '⚠️' : '✓';

      console.log(`  ${icon} ${metric.padEnd(18)} ${diff}`);

      if (hasChange) {
        companyResults.changes.push({ metric, stored: storedVal, calculated: calcVal, diff });
      }
    }

    results.push(companyResults);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 SUMMARY\n');

  const companiesWithChanges = results.filter(r => r.changes.length > 0);
  console.log(`Companies with metric changes: ${companiesWithChanges.length}/${results.length}`);

  // Group by metric
  const metricChanges = {};
  for (const r of results) {
    for (const c of r.changes) {
      if (!metricChanges[c.metric]) metricChanges[c.metric] = [];
      metricChanges[c.metric].push({ symbol: r.symbol, sector: r.sector, ...c });
    }
  }

  console.log('\nChanges by metric:\n');
  for (const [metric, changes] of Object.entries(metricChanges)) {
    console.log(`${metric}: ${changes.length} companies affected`);
    for (const c of changes) {
      console.log(`  - ${c.symbol} (${c.sector || 'N/A'}): ${c.diff}`);
    }
    console.log('');
  }

  // Highlight significant changes
  console.log('\n⚠️ SIGNIFICANT CHANGES (NULL→value or >50% diff):\n');
  for (const r of results) {
    for (const c of r.changes) {
      const isNullChange = c.stored === null || c.calculated === null;
      const isPctChange = c.stored !== null && c.calculated !== null &&
                          Math.abs(c.stored - c.calculated) / Math.abs(c.stored) > 0.5;

      if (isNullChange || isPctChange) {
        console.log(`${r.symbol}.${c.metric}: ${c.diff}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nNote: To apply changes, run: node scripts/migration/calculate-all-metrics.js\n');
}

testMetricsImpact().catch(console.error);
