const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stocks.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== DATABASE FRESHNESS REPORT ===');
console.log(`Generated: ${new Date().toISOString()}`);
console.log('Today: 2026-01-07\n');

// Helper to calculate days old
function calculateAge(dateStr, format = 'date') {
  try {
    let queryDate = dateStr;
    if (format === 'filed') {
      // Convert YYYYMMDD to YYYY-MM-DD
      queryDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }
    const age = db.prepare('SELECT julianday(\'now\') - julianday(?) as age').get(queryDate);
    return Math.floor(age.age);
  } catch (e) {
    return null;
  }
}

// 1. STOCK PRICES
console.log('1. STOCK PRICES (daily_prices)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(date) as max_date,
      COUNT(*) as total_rows,
      COUNT(DISTINCT company_id) as total_companies
    FROM daily_prices
  `).get();

  const latestCount = db.prepare(`
    SELECT COUNT(DISTINCT company_id) as count
    FROM daily_prices
    WHERE date = ?
  `).get(stats.max_date);

  console.log(`  Latest date: ${stats.max_date}`);
  console.log(`  Companies on latest date: ${latestCount.count}`);
  console.log(`  Total companies: ${stats.total_companies}`);
  console.log(`  Total records: ${stats.total_rows.toLocaleString()}`);

  const age = calculateAge(stats.max_date);
  console.log(`  Age: ${age} days`);
  console.log(`  Status: ${age <= 1 ? '✓ FRESH' : age <= 7 ? '⚠ STALE' : '✗ OLD'}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 2. SEC FILINGS
console.log('2. SEC FILINGS (financial_data)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(filed_date) as max_filed_date,
      COUNT(*) as total
    FROM financial_data
  `).get();

  console.log(`  Latest filed_date: ${stats.max_filed_date}`);
  console.log(`  Total filings: ${stats.total.toLocaleString()}`);

  const age = calculateAge(stats.max_filed_date, 'filed');
  console.log(`  Age: ${age} days`);
  console.log(`  Status: ${age <= 7 ? '✓ FRESH' : age <= 30 ? '⚠ ACCEPTABLE' : '✗ STALE'}`);

  // Recent filings count
  const recentDate = db.prepare('SELECT strftime(\'%Y%m%d\', date(\'now\', \'-90 days\')) as d').get();
  const recentCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM financial_data
    WHERE filed_date >= ?
  `).get(recentDate.d);
  console.log(`  Filings (last 90d): ${recentCount.count.toLocaleString()}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 3. DIVIDENDS
console.log('3. DIVIDENDS (dividend_history)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(ex_date) as max_date,
      COUNT(*) as total
    FROM dividend_history
  `).get();

  const recent90 = db.prepare(`
    SELECT COUNT(*) as count, COUNT(DISTINCT company_id) as companies
    FROM dividend_history
    WHERE ex_date >= date('now', '-90 days')
  `).get();

  console.log(`  Latest ex_date: ${stats.max_date}`);
  console.log(`  Total records: ${stats.total.toLocaleString()}`);
  console.log(`  Recent (90d): ${recent90.count} from ${recent90.companies} companies`);

  const age = calculateAge(stats.max_date);
  console.log(`  Age: ${age} days`);
  console.log(`  Status: ${age <= 30 ? '✓ ACCEPTABLE' : age <= 90 ? '⚠ STALE' : '✗ OLD'}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 4. BUYBACKS
console.log('4. BUYBACKS (buyback_programs)');
console.log('─'.repeat(70));
try {
  const count = db.prepare('SELECT COUNT(*) as total FROM buyback_programs').get();
  console.log(`  Total records: ${count.total}`);
  console.log(`  Status: ${count.total === 0 ? '✗ NO DATA' : '✓ HAS DATA'}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 5. 13F HOLDINGS
console.log('5. 13F HOLDINGS (investor_holdings)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(filing_date) as max_date,
      COUNT(*) as total,
      COUNT(DISTINCT investor_id) as investors
    FROM investor_holdings
  `).get();

  const recent90 = db.prepare(`
    SELECT COUNT(*) as count, COUNT(DISTINCT investor_id) as investors
    FROM investor_holdings
    WHERE filing_date >= date('now', '-90 days')
  `).get();

  console.log(`  Latest filing_date: ${stats.max_date}`);
  console.log(`  Total holdings: ${stats.total.toLocaleString()}`);
  console.log(`  Total investors: ${stats.investors}`);
  console.log(`  Recent (90d): ${recent90.count.toLocaleString()} holdings, ${recent90.investors} investors`);

  const age = calculateAge(stats.max_date);
  console.log(`  Age: ${age} days`);
  console.log(`  Status: ${age <= 60 ? '✓ FRESH (quarterly)' : age <= 120 ? '⚠ STALE' : '✗ OLD'}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 6. ETF HOLDINGS
console.log('6. ETF HOLDINGS (etf_holdings)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(as_of_date) as max_date,
      COUNT(*) as total,
      COUNT(DISTINCT etf_id) as etfs
    FROM etf_holdings
  `).get();

  console.log(`  Latest as_of_date: ${stats.max_date}`);
  console.log(`  Total holdings: ${stats.total}`);
  console.log(`  Unique ETFs: ${stats.etfs}`);

  const age = calculateAge(stats.max_date);
  console.log(`  Age: ${age} days`);
  console.log(`  Status: ${age <= 1 ? '✓ FRESH' : age <= 7 ? '⚠ STALE' : '✗ OLD'}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 7. INSIDER TRADING
console.log('7. INSIDER TRADING (insider_transactions)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(transaction_date) as max_date,
      COUNT(*) as total
    FROM insider_transactions
  `).get();

  const recent90 = db.prepare(`
    SELECT COUNT(*) as count, COUNT(DISTINCT company_id) as companies
    FROM insider_transactions
    WHERE transaction_date >= date('now', '-90 days')
  `).get();

  console.log(`  Latest transaction_date: ${stats.max_date}`);
  console.log(`  Total transactions: ${stats.total.toLocaleString()}`);
  console.log(`  Recent (90d): ${recent90.count} from ${recent90.companies} companies`);

  const age = calculateAge(stats.max_date);
  console.log(`  Age: ${age} days`);
  console.log(`  Status: ${age <= 1 ? '✓ FRESH' : age <= 7 ? '⚠ ACCEPTABLE' : '✗ STALE'}`);
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// 8. REDDIT POSTS
console.log('8. REDDIT SENTIMENT (reddit_posts)');
console.log('─'.repeat(70));
try {
  const stats = db.prepare(`
    SELECT
      MAX(posted_at) as max_date,
      COUNT(*) as total
    FROM reddit_posts
  `).get();

  if (stats.max_date) {
    const recent7 = db.prepare(`
      SELECT COUNT(*) as count
      FROM reddit_posts
      WHERE posted_at >= datetime('now', '-7 days')
    `).get();

    console.log(`  Latest posted_at: ${stats.max_date}`);
    console.log(`  Total posts: ${stats.total.toLocaleString()}`);
    console.log(`  Recent (7d): ${recent7.count}`);

    const age = calculateAge(stats.max_date, 'datetime');
    console.log(`  Age: ${age} days`);
    console.log(`  Status: ${age <= 1 ? '✓ FRESH' : age <= 7 ? '⚠ STALE' : '✗ OLD'}`);
  } else {
    console.log('  Status: ✗ NO DATA');
  }
} catch (e) {
  console.log(`  Error: ${e.message}`);
}
console.log('');

// SUMMARY TABLE
console.log('SUMMARY');
console.log('─'.repeat(70));
console.log('Data Type              | Latest Date  | Age (days) | Status');
console.log('─'.repeat(70));

const summaries = [
  { name: 'Stock Prices', table: 'daily_prices', dateCol: 'date', type: 'date' },
  { name: 'SEC Filings', table: 'financial_data', dateCol: 'filed_date', type: 'filed' },
  { name: 'Dividends', table: 'dividend_history', dateCol: 'ex_date', type: 'date' },
  { name: '13F Holdings', table: 'investor_holdings', dateCol: 'filing_date', type: 'date' },
  { name: 'ETF Holdings', table: 'etf_holdings', dateCol: 'as_of_date', type: 'date' },
  { name: 'Insider Trading', table: 'insider_transactions', dateCol: 'transaction_date', type: 'date' },
  { name: 'Reddit Posts', table: 'reddit_posts', dateCol: 'posted_at', type: 'datetime' }
];

summaries.forEach(item => {
  try {
    const result = db.prepare(`SELECT MAX(${item.dateCol}) as d FROM ${item.table}`).get();
    if (result.d) {
      const age = calculateAge(result.d, item.type);
      const status = age <= 1 ? '✓ FRESH' : age <= 7 ? '⚠ STALE' : '✗ OLD';
      console.log(`${item.name.padEnd(22)} | ${result.d.padEnd(12)} | ${String(age).padStart(10)} | ${status}`);
    } else {
      console.log(`${item.name.padEnd(22)} | ${'N/A'.padEnd(12)} | ${'N/A'.padStart(10)} | ✗ NO DATA`);
    }
  } catch (e) {
    console.log(`${item.name.padEnd(22)} | ${'ERROR'.padEnd(12)} | ${'N/A'.padStart(10)} | ✗ ERROR`);
  }
});

console.log('\n=== END OF REPORT ===');
db.close();
