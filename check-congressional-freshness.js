// check-congressional-freshness.js
// Monitor data freshness for congressional trading data

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('./data/stocks.db');

console.log('\n' + '='.repeat(80));
console.log('🏛️  CONGRESSIONAL DATA FRESHNESS CHECK');
console.log('='.repeat(80));

// Check database stats
const stats = db.prepare(`
  SELECT
    COUNT(*) as total_trades,
    COUNT(DISTINCT politician_id) as unique_politicians,
    COUNT(DISTINCT company_id) as unique_companies,
    MIN(transaction_date) as oldest_trade,
    MAX(transaction_date) as latest_trade,
    MAX(created_at) as last_import
  FROM congressional_trades
`).get();

console.log('\n📊 Database Statistics:');
console.log(`   Total Trades: ${stats.total_trades}`);
console.log(`   Politicians: ${stats.unique_politicians}`);
console.log(`   Companies: ${stats.unique_companies}`);
console.log(`   Date Range: ${stats.oldest_trade} to ${stats.latest_trade}`);
console.log(`   Last Import: ${stats.last_import}`);

// Calculate freshness
const now = new Date();
const latestTrade = new Date(stats.latest_trade);
const daysSinceLatest = Math.floor((now - latestTrade) / (1000 * 60 * 60 * 24));

console.log('\n📅 Data Freshness:');
console.log(`   Days since latest trade: ${daysSinceLatest}`);

if (daysSinceLatest <= 7) {
  console.log(`   Status: ✅ FRESH (updated within 7 days)`);
} else if (daysSinceLatest <= 14) {
  console.log(`   Status: ⚠️  AGING (${daysSinceLatest} days old)`);
} else if (daysSinceLatest <= 30) {
  console.log(`   Status: ⚠️  STALE (${daysSinceLatest} days old - update recommended)`);
} else {
  console.log(`   Status: ❌ VERY STALE (${daysSinceLatest} days old - update required!)`);
}

// Check CSV file
const csvPath = './data/congressional_trades.csv';
if (fs.existsSync(csvPath)) {
  const csvStats = fs.statSync(csvPath);
  const csvAge = Math.floor((now - csvStats.mtime) / (1000 * 60 * 60 * 24));

  console.log('\n📂 CSV File Status:');
  console.log(`   Location: ${csvPath}`);
  console.log(`   Last Modified: ${csvStats.mtime.toISOString().split('T')[0]}`);
  console.log(`   Age: ${csvAge} days`);

  if (csvAge > 7) {
    console.log(`   ⚠️  CSV is ${csvAge} days old - download fresh data from Capitol Trades`);
  }
} else {
  console.log('\n📂 CSV File Status:');
  console.log(`   ❌ CSV file not found: ${csvPath}`);
  console.log(`   Download from: https://www.capitoltrades.com/trades`);
}

// Recent activity
const recentTrades = db.prepare(`
  SELECT
    COUNT(*) as trade_count,
    transaction_type,
    COUNT(DISTINCT politician_id) as politician_count
  FROM congressional_trades
  WHERE transaction_date >= date('now', '-30 days')
  GROUP BY transaction_type
  ORDER BY trade_count DESC
`).all();

if (recentTrades.length > 0) {
  console.log('\n📈 Recent Activity (Last 30 Days):');
  recentTrades.forEach(row => {
    console.log(`   ${row.transaction_type}: ${row.trade_count} trades from ${row.politician_count} politicians`);
  });
} else {
  console.log('\n📈 Recent Activity:');
  console.log(`   ❌ No trades in last 30 days - data is likely stale!`);
}

// Top traders
const topTraders = db.prepare(`
  SELECT
    p.full_name,
    p.chamber,
    p.party,
    COUNT(*) as trade_count,
    MAX(ct.transaction_date) as latest_trade
  FROM congressional_trades ct
  JOIN politicians p ON ct.politician_id = p.id
  WHERE ct.transaction_date >= date('now', '-90 days')
  GROUP BY p.id
  ORDER BY trade_count DESC
  LIMIT 5
`).all();

if (topTraders.length > 0) {
  console.log('\n🔥 Most Active Traders (Last 90 Days):');
  topTraders.forEach((trader, i) => {
    const party = trader.party ? ` (${trader.party})` : '';
    console.log(`   ${i + 1}. ${trader.full_name}${party} - ${trader.chamber}`);
    console.log(`      ${trader.trade_count} trades, latest: ${trader.latest_trade}`);
  });
}

// Purchase clusters
const clusters = db.prepare(`
  SELECT
    c.symbol,
    c.name,
    COUNT(DISTINCT ct.politician_id) as politician_count,
    COUNT(*) as transaction_count,
    MAX(ct.transaction_date) as latest_purchase
  FROM congressional_trades ct
  JOIN companies c ON ct.company_id = c.id
  WHERE ct.transaction_type = 'purchase'
    AND ct.transaction_date >= date('now', '-30 days')
  GROUP BY c.id
  HAVING politician_count >= 2
  ORDER BY politician_count DESC, transaction_count DESC
  LIMIT 5
`).all();

if (clusters.length > 0) {
  console.log('\n🎯 Active Purchase Clusters (Last 30 Days):');
  clusters.forEach((cluster, i) => {
    console.log(`   ${i + 1}. ${cluster.symbol} - ${cluster.politician_count} politicians, ${cluster.transaction_count} purchases`);
    console.log(`      Latest: ${cluster.latest_purchase}`);
  });
} else {
  console.log('\n🎯 Active Purchase Clusters:');
  console.log(`   No clusters detected in last 30 days`);
}

// Recommendations
console.log('\n\n' + '='.repeat(80));
console.log('💡 RECOMMENDATIONS');
console.log('='.repeat(80));

if (daysSinceLatest > 14 || !fs.existsSync(csvPath)) {
  console.log('\n⚠️  Action Required:');
  console.log('   1. Go to https://www.capitoltrades.com/trades');
  console.log('   2. Click "Export" and download CSV');
  console.log('   3. Save to: ./data/congressional_trades.csv');
  console.log('   4. Run: ./update-congressional-data.sh');
} else if (daysSinceLatest > 7) {
  console.log('\n📅 Update Recommended:');
  console.log('   Data is getting old. Consider downloading fresh CSV this week.');
} else {
  console.log('\n✅ Data is fresh!');
  console.log('   Next update recommended: ' + new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
}

console.log('\n📋 Update Schedule:');
console.log('   Recommended: Weekly updates');
console.log('   Minimum: Bi-weekly updates');
console.log('   To automate: Set up cron job (see CONGRESSIONAL_SETUP_GUIDE.md)');

console.log('\n' + '='.repeat(80));
console.log('✅ Freshness check complete');
console.log('='.repeat(80) + '\n');

db.close();
