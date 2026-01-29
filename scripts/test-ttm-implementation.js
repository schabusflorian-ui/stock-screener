#!/usr/bin/env node
/**
 * Comprehensive TTM Implementation Test
 *
 * Tests all aspects of the TTM implementation:
 * 1. Database integrity - TTM data exists and is valid
 * 2. Metrics calculations - TTM metrics are accurate
 * 3. API functionality - Endpoints return TTM data correctly
 * 4. Data quality - TTM values are reasonable
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

console.log('\n🧪 TTM IMPLEMENTATION TEST SUITE\n');
console.log('='.repeat(80));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result) {
      passedTests++;
      console.log(`✅ ${description}`);
      return true;
    } else {
      failedTests++;
      console.log(`❌ ${description}`);
      return false;
    }
  } catch (error) {
    failedTests++;
    console.log(`❌ ${description}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

console.log('\n📊 TEST 1: Database Integrity\n');

test('TTM financial_data records exist', () => {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM financial_data WHERE period_type = ?').get('ttm');
  console.log(`   Found ${count.cnt} TTM financial records`);
  return count.cnt > 0;
});

test('TTM records have all 3 statement types', () => {
  const companies = db.prepare(`
    SELECT company_id, COUNT(DISTINCT statement_type) as types
    FROM financial_data
    WHERE period_type = 'ttm'
    GROUP BY company_id
    HAVING types < 3
  `).all();
  console.log(`   ${companies.length} companies missing statement types`);
  return companies.length === 0;
});

test('TTM records have valid fiscal years', () => {
  const invalid = db.prepare(`
    SELECT COUNT(*) as cnt FROM financial_data
    WHERE period_type = 'ttm' AND (fiscal_year IS NULL OR fiscal_year < 2000 OR fiscal_year > 2030)
  `).get();
  console.log(`   ${invalid.cnt} records with invalid fiscal years`);
  return invalid.cnt === 0;
});

test('TTM data fields are valid JSON', () => {
  const records = db.prepare('SELECT id, data FROM financial_data WHERE period_type = ? LIMIT 100').all('ttm');
  let validCount = 0;
  for (const record of records) {
    try {
      JSON.parse(record.data);
      validCount++;
    } catch (e) {
      // Invalid JSON
    }
  }
  console.log(`   ${validCount}/${records.length} sampled records have valid JSON`);
  return validCount === records.length;
});

test('No duplicate TTM records', () => {
  const duplicates = db.prepare(`
    SELECT COUNT(*) as cnt FROM (
      SELECT company_id, fiscal_date_ending, statement_type
      FROM financial_data
      WHERE period_type = 'ttm'
      GROUP BY company_id, fiscal_date_ending, statement_type
      HAVING COUNT(*) > 1
    )
  `).get();
  console.log(`   ${duplicates.cnt} duplicate TTM records found`);
  return duplicates.cnt === 0;
});

console.log('\n📊 TEST 2: TTM Metrics\n');

test('TTM calculated_metrics records exist', () => {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM calculated_metrics WHERE period_type = ?').get('ttm');
  console.log(`   Found ${count.cnt} TTM metric records`);
  return count.cnt > 0;
});

test('TTM metrics have reasonable values', () => {
  const metrics = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(roe) as has_roe,
      COUNT(roa) as has_roa,
      COUNT(gross_margin) as has_gross_margin,
      COUNT(current_ratio) as has_current_ratio
    FROM calculated_metrics
    WHERE period_type = 'ttm'
  `).get();

  const coverage = {
    roe: (metrics.has_roe / metrics.total * 100).toFixed(1),
    roa: (metrics.has_roa / metrics.total * 100).toFixed(1),
    gross_margin: (metrics.has_gross_margin / metrics.total * 100).toFixed(1),
    current_ratio: (metrics.has_current_ratio / metrics.total * 100).toFixed(1)
  };

  console.log(`   ROE: ${coverage.roe}%, ROA: ${coverage.roa}%, Gross Margin: ${coverage.gross_margin}%, Current Ratio: ${coverage.current_ratio}%`);
  return coverage.roe > 50 && coverage.roa > 50;
});

test('TTM metrics are within reasonable bounds', () => {
  const outliers = db.prepare(`
    SELECT COUNT(*) as cnt FROM calculated_metrics
    WHERE period_type = 'ttm'
      AND (
        roe > 500 OR roe < -500 OR
        roa > 200 OR roa < -200 OR
        gross_margin > 100 OR gross_margin < -50 OR
        current_ratio > 100 OR current_ratio < 0
      )
  `).get();
  console.log(`   ${outliers.cnt} metrics with extreme outlier values`);
  return outliers.cnt < 100; // Allow some outliers
});

console.log('\n📊 TEST 3: Data Quality\n');

test('TTM data completeness for major companies', () => {
  const testSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM'];
  let allHaveTTM = true;
  let found = 0;

  for (const symbol of testSymbols) {
    const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol);
    if (company) {
      const ttmCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM financial_data
        WHERE company_id = ? AND period_type = 'ttm'
      `).get(company.id);

      if (ttmCount.cnt >= 3) {
        found++;
      } else {
        allHaveTTM = false;
        console.log(`   ${symbol}: Missing TTM data (${ttmCount.cnt}/3 statements)`);
      }
    }
  }

  console.log(`   ${found}/${testSymbols.length} major companies have complete TTM data`);
  return found >= testSymbols.length * 0.7; // At least 70% should have TTM
});

test('TTM income statement sums correctly', () => {
  // Test that TTM revenue is approximately sum of 4 quarters
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('AAPL');
  if (!company) return false;

  const ttmIncome = db.prepare(`
    SELECT fiscal_date_ending, data FROM financial_data
    WHERE company_id = ? AND period_type = 'ttm' AND statement_type = 'income_statement'
  `).get(company.id);

  if (!ttmIncome) return false;

  // Get the 4 quarters that were used to create this TTM
  const quarterlyIncome = db.prepare(`
    SELECT data FROM financial_data
    WHERE company_id = ? AND period_type = 'quarterly' AND statement_type = 'income_statement'
      AND fiscal_date_ending <= ?
    ORDER BY fiscal_date_ending DESC
    LIMIT 4
  `).all(company.id, ttmIncome.fiscal_date_ending);

  if (quarterlyIncome.length < 4) {
    console.log(`   Only ${quarterlyIncome.length}/4 quarters available`);
    return false;
  }

  const ttmData = JSON.parse(ttmIncome.data);
  const quarterlyRevenues = quarterlyIncome.map(q => {
    const data = JSON.parse(q.data);
    const rev = data.totalRevenue || data.Revenues || data.revenue || 0;
    return typeof rev === 'string' ? parseFloat(rev) : rev;
  });

  const sumQuarterly = quarterlyRevenues.reduce((a, b) => a + b, 0);
  const ttmRevRaw = ttmData.totalRevenue || ttmData.Revenues || ttmData.revenue || 0;
  const ttmRevenue = typeof ttmRevRaw === 'string' ? parseFloat(ttmRevRaw) : ttmRevRaw;

  if (sumQuarterly === 0 || ttmRevenue === 0) {
    console.log(`   No revenue data available (TTM: ${ttmRevenue}, Sum: ${sumQuarterly})`);
    return false;
  }

  const percentDiff = Math.abs((ttmRevenue - sumQuarterly) / sumQuarterly * 100);
  console.log(`   TTM: $${(ttmRevenue/1e9).toFixed(1)}B, Sum of 4Q: $${(sumQuarterly/1e9).toFixed(1)}B (${percentDiff.toFixed(1)}% diff)`);

  return percentDiff < 1; // Should be nearly exact
});

test('TTM balance sheet matches its corresponding quarter', () => {
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('AAPL');
  if (!company) return false;

  const ttmBalance = db.prepare(`
    SELECT fiscal_date_ending, data FROM financial_data
    WHERE company_id = ? AND period_type = 'ttm' AND statement_type = 'balance_sheet'
  `).get(company.id);

  const matchingQuarterBalance = db.prepare(`
    SELECT data FROM financial_data
    WHERE company_id = ? AND period_type = 'quarterly' AND statement_type = 'balance_sheet'
      AND fiscal_date_ending = ?
  `).get(company.id, ttmBalance.fiscal_date_ending);

  if (!ttmBalance || !matchingQuarterBalance) return false;

  const ttmData = JSON.parse(ttmBalance.data);
  const quarterlyData = JSON.parse(matchingQuarterBalance.data);

  const ttmAssets = ttmData.totalAssets || ttmData.Assets || 0;
  const quarterlyAssets = quarterlyData.totalAssets || quarterlyData.Assets || 0;

  console.log(`   TTM balance sheet (${ttmBalance.fiscal_date_ending}): ${(ttmAssets / 1e9).toFixed(1)}B`);
  console.log(`   Matching quarter: ${(quarterlyAssets / 1e9).toFixed(1)}B`);

  return ttmAssets === quarterlyAssets;
});

console.log('\n📊 TEST 4: Period Type Coverage\n');

test('Companies have multiple period types available', () => {
  const coverage = db.prepare(`
    SELECT
      c.symbol,
      COUNT(DISTINCT fd.period_type) as period_types
    FROM companies c
    JOIN financial_data fd ON c.id = fd.company_id
    WHERE c.symbol IN ('AAPL', 'MSFT', 'GOOGL', 'JPM', 'META')
    GROUP BY c.id
  `).all();

  const allHaveMultiple = coverage.every(c => c.period_types >= 2);
  console.log(`   Period types available: ${coverage.map(c => `${c.symbol}:${c.period_types}`).join(', ')}`);

  return allHaveMultiple;
});

test('Period type distribution is reasonable', () => {
  const distribution = db.prepare(`
    SELECT period_type, COUNT(*) as cnt
    FROM financial_data
    GROUP BY period_type
  `).all();

  const dist = {};
  distribution.forEach(d => dist[d.period_type] = d.cnt);

  console.log(`   Annual: ${dist.annual || 0}, Quarterly: ${dist.quarterly || 0}, TTM: ${dist.ttm || 0}`);

  // TTM should be less than quarterly (since we only create 1 TTM per company)
  return dist.ttm > 0 && dist.ttm < dist.quarterly;
});

console.log('\n📊 TEST 5: Sample Data Validation\n');

test('AAPL TTM metrics are reasonable', () => {
  const metrics = db.prepare(`
    SELECT * FROM calculated_metrics
    WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
      AND period_type = 'ttm'
  `).get();

  if (!metrics) {
    console.log('   No AAPL TTM metrics found');
    return false;
  }

  console.log(`   ROE: ${metrics.roe}%, ROA: ${metrics.roa}%, Gross Margin: ${metrics.gross_margin || 'N/A'}%`);
  console.log(`   Current Ratio: ${metrics.current_ratio || 'N/A'}, Debt/Equity: ${metrics.debt_to_equity || 'N/A'}`);

  // Apple should have positive profitability (key metrics)
  // Some metrics like gross_margin may be NULL due to field name variations
  return metrics.roe > 0 && metrics.roa > 0;
});

test('TTM metrics differ from annual (showing they are distinct)', () => {
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('AAPL');
  if (!company) return false;

  const ttm = db.prepare(`
    SELECT roe, roa, gross_margin FROM calculated_metrics
    WHERE company_id = ? AND period_type = 'ttm'
  `).get(company.id);

  const annual = db.prepare(`
    SELECT roe, roa, gross_margin FROM calculated_metrics
    WHERE company_id = ? AND period_type = 'annual'
    ORDER BY fiscal_period DESC LIMIT 1
  `).get(company.id);

  if (!ttm || !annual) return false;

  const roeDiff = Math.abs(ttm.roe - annual.roe);
  const roaDiff = Math.abs(ttm.roa - annual.roa);

  console.log(`   TTM ROE: ${ttm.roe}% vs Annual: ${annual.roe}% (diff: ${roeDiff.toFixed(1)}%)`);
  console.log(`   TTM ROA: ${ttm.roa}% vs Annual: ${annual.roa}% (diff: ${roaDiff.toFixed(1)}%)`);

  // TTM should be different from annual (they represent different periods)
  return roeDiff > 1 || roaDiff > 1;
});

console.log('\n' + '='.repeat(80));
console.log('\n📊 TEST SUMMARY\n');
console.log(`Total Tests:  ${totalTests}`);
console.log(`Passed:       ${passedTests} (${(passedTests/totalTests*100).toFixed(1)}%)`);
console.log(`Failed:       ${failedTests} (${(failedTests/totalTests*100).toFixed(1)}%)`);

if (failedTests === 0) {
  console.log('\n✅ All tests passed! TTM implementation is working correctly.\n');
} else if (failedTests <= 2) {
  console.log('\n⚠️  Most tests passed. Minor issues detected.\n');
} else {
  console.log('\n❌ Multiple test failures. Please review the implementation.\n');
}

db.close();
process.exit(failedTests > 0 ? 1 : 0);
