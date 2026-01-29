// query-metrics-robust.js
const db = require('./src/database');
const SchemaManager = require('./src/utils/schemaManager');

const database = db.getDatabase();
const schemaManager = new SchemaManager();

console.log('\n📊 METRIC QUERIES (ROBUST)\n');
console.log('='.repeat(60));

// Check what columns are available
const availableColumns = schemaManager.getAvailableMetricColumns();
console.log(`\n✅ Using ${availableColumns.length} available metric columns\n`);

// Helper function to check if column exists
function hasColumn(columnName) {
  return availableColumns.includes(columnName);
}

// Query 1: Best ROIC companies
console.log('\n1️⃣  TOP COMPANIES BY ROIC (Latest Year):\n');

try {
  const selectColumns = ['c.symbol', 'c.name'];
  const displayColumns = [];
  
  if (hasColumn('roic')) {
    selectColumns.push('m.roic');
    displayColumns.push('roic');
  }
  if (hasColumn('fcf_yield')) {
    selectColumns.push('m.fcf_yield');
    displayColumns.push('fcf_yield');
  }
  if (hasColumn('debt_to_equity')) {
    selectColumns.push('m.debt_to_equity');
    displayColumns.push('debt_to_equity');
  }
  if (hasColumn('data_quality_score')) {
    selectColumns.push('m.data_quality_score');
    displayColumns.push('data_quality_score');
  }
  
  const topROIC = database.prepare(`
    SELECT ${selectColumns.join(', ')}
    FROM calculated_metrics m
    JOIN companies c ON m.company_id = c.id
    WHERE m.fiscal_period = (
      SELECT MAX(fiscal_period) FROM calculated_metrics WHERE company_id = m.company_id
    )
    ${hasColumn('roic') ? 'ORDER BY m.roic DESC' : ''}
  `).all();

  topROIC.forEach((row, i) => {
    console.log(`${i + 1}. ${row.symbol} - ${row.name}`);
    
    const details = [];
    if (row.roic !== undefined) details.push(`ROIC: ${row.roic}%`);
    if (row.fcf_yield !== undefined) details.push(`FCF Yield: ${row.fcf_yield}%`);
    if (row.debt_to_equity !== undefined) details.push(`Debt/Equity: ${row.debt_to_equity}`);
    if (row.data_quality_score !== undefined) details.push(`Quality: ${row.data_quality_score}/100`);
    
    console.log(`   ${details.join(' | ')}`);
    console.log('');
  });
} catch (error) {
  console.error('❌ Query 1 failed:', error.message);
}

// Query 2: ROIC trend for a specific company
console.log('\n2️⃣  APPLE ROIC TREND (5 Years):\n');

try {
  const trendColumns = ['fiscal_period'];
  if (hasColumn('roic')) trendColumns.push('roic');
  if (hasColumn('roe')) trendColumns.push('roe');
  if (hasColumn('fcf_yield')) trendColumns.push('fcf_yield');
  
  const appleROIC = database.prepare(`
    SELECT ${trendColumns.join(', ')}
    FROM calculated_metrics m
    JOIN companies c ON m.company_id = c.id
    WHERE c.symbol = 'AAPL'
    ORDER BY fiscal_period DESC
    LIMIT 5
  `).all();

  appleROIC.forEach(row => {
    const parts = [row.fiscal_period];
    if (row.roic !== undefined) parts.push(`ROIC=${row.roic}%`);
    if (row.roe !== undefined) parts.push(`ROE=${row.roe}%`);
    if (row.fcf_yield !== undefined) parts.push(`FCF Yield=${row.fcf_yield}%`);
    
    console.log(parts.join(': '));
  });
} catch (error) {
  console.error('❌ Query 2 failed:', error.message);
}

// Query 3: Buffett-style screen
console.log('\n3️⃣  BUFFETT-STYLE SCREEN:\n');
console.log('   (ROIC > 15%, Debt/Equity < 1.0, Positive FCF)\n');

try {
  if (!hasColumn('roic') || !hasColumn('debt_to_equity') || !hasColumn('fcf')) {
    console.log('⚠️  Required columns not available for this screen');
  } else {
    const buffettScreen = database.prepare(`
      SELECT 
        c.symbol,
        c.name,
        ROUND(AVG(m.roic), 1) as avg_roic,
        ROUND(AVG(m.fcf_yield), 1) as avg_fcf_yield,
        ROUND(AVG(m.debt_to_equity), 2) as avg_debt,
        MIN(m.data_quality_score) as min_quality
      FROM calculated_metrics m
      JOIN companies c ON m.company_id = c.id
      WHERE m.roic > 15
        AND m.debt_to_equity < 1.0
        AND m.fcf > 0
      GROUP BY c.symbol, c.name
      HAVING COUNT(*) >= 3
      ORDER BY avg_roic DESC
    `).all();

    if (buffettScreen.length === 0) {
      console.log('   No companies meet all criteria');
    } else {
      buffettScreen.forEach((row, i) => {
        console.log(`${i + 1}. ${row.symbol} - ${row.name}`);
        console.log(`   Avg ROIC: ${row.avg_roic}% | Avg Debt: ${row.avg_debt} | Min Quality: ${row.min_quality}`);
        console.log('');
      });
    }
  }
} catch (error) {
  console.error('❌ Query 3 failed:', error.message);
}

console.log('='.repeat(60) + '\n');