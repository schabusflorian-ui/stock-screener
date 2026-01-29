// test-congressional-signals.js
// Test the congressional trading signal generator

const Database = require('better-sqlite3');
const { CongressionalTradingSignals } = require('./src/services/signals/congressionalTradingSignals');

const db = new Database('./data/stocks.db');
const congressionalSignals = new CongressionalTradingSignals(db);

console.log('\n' + '='.repeat(80));
console.log('🏛️  CONGRESSIONAL TRADING SIGNAL GENERATOR TEST');
console.log('='.repeat(80));

// Check data coverage
console.log('\n📊 Data Coverage:');
const coverage = congressionalSignals.getDataCoverage();
console.log(`   Total Transactions: ${coverage.total_transactions}`);
console.log(`   Companies with Data: ${coverage.companies_with_data}`);
console.log(`   Purchase Transactions: ${coverage.purchase_transactions}`);
console.log(`   Sale Transactions: ${coverage.sale_transactions}`);
console.log(`   Unique Politicians: ${coverage.unique_politicians}`);
console.log(`   Date Range: ${coverage.earliest_transaction} to ${coverage.latest_transaction}`);

if (coverage.chambers) {
  console.log('\n   Chamber Breakdown:');
  coverage.chambers.forEach(chamber => {
    console.log(`   - ${chamber.chamber}: ${chamber.politician_count} politicians, ${chamber.transaction_count} transactions`);
  });
}

// Find current purchase clusters
console.log('\n\n' + '='.repeat(80));
console.log('🎯 CURRENT PURCHASE CLUSTERS (2+ Politicians in 30 Days)');
console.log('='.repeat(80));

const clusters = congressionalSignals.findPurchaseClusters();

if (clusters.length === 0) {
  console.log('\n   No purchase clusters found in last 30 days');
  console.log('   This is expected with sample data - real data would show clusters');
} else {
  console.log(`\n   Found ${clusters.length} companies with congressional purchase clusters:\n`);

  for (const [idx, cluster] of clusters.entries()) {
    console.log(`${idx + 1}. ${cluster.symbol} - ${cluster.name}`);
    console.log(`   Politicians Buying: ${cluster.politician_count}`);
    console.log(`   Total Transactions: ${cluster.transaction_count}`);
    console.log(`   Estimated Total Value: $${(cluster.estimated_total_value / 1000000).toFixed(2)}M`);
    console.log(`   Date Range: ${cluster.first_purchase_date} to ${cluster.last_purchase_date}`);
    console.log(`   Party Diversity: ${cluster.party_diversity} parties`);
    console.log(`   Signal Strength: ${cluster.signalStrength}`);
    console.log(`   Expected Alpha: +${cluster.expectedAlpha}%`);
    console.log(`   📍 ${cluster.smeRecommendation}`);
    console.log('');
  }
}

// Get detailed signal for top cluster (if any)
if (clusters.length > 0) {
  const topCluster = clusters[0];
  console.log('\n' + '='.repeat(80));
  console.log(`📋 DETAILED SIGNAL: ${topCluster.symbol}`);
  console.log('='.repeat(80));

  const detailedSignal = congressionalSignals.generateSignal(topCluster.company_id);

  if (detailedSignal) {
    console.log(`\nSignal: ${detailedSignal.signal}`);
    console.log(`Score: ${detailedSignal.score.toFixed(3)}`);
    console.log(`Confidence: ${detailedSignal.confidence.toFixed(3)}`);
    console.log(`Strength: ${detailedSignal.signalStrength}`);
    console.log(`Expected Alpha: +${detailedSignal.expectedAlpha}%`);

    console.log('\nMetrics:');
    console.log(`   Unique Politicians: ${detailedSignal.metrics.uniquePoliticians}`);
    console.log(`   Total Transactions: ${detailedSignal.metrics.totalTransactions}`);
    console.log(`   Total Purchase Value: $${(detailedSignal.metrics.totalPurchaseValue / 1000000).toFixed(2)}M`);
    console.log(`   Large Purchases (>$100k): ${detailedSignal.metrics.largePurchaseCount}`);
    console.log(`   Is Cluster: ${detailedSignal.metrics.isCluster ? 'YES' : 'NO'}`);
    console.log(`   Bipartisan: ${detailedSignal.metrics.isBipartisan ? 'YES' : 'NO'}`);
    console.log(`   Senate Purchases: ${detailedSignal.metrics.senatePurchases}`);
    console.log(`   House Purchases: ${detailedSignal.metrics.housePurchases}`);

    console.log('\nReasons:');
    detailedSignal.reasons.forEach(reason => console.log(`   • ${reason}`));

    console.log(`\nPoliticians Buying (Latest ${Math.min(5, detailedSignal.politicians.length)}):`);
    detailedSignal.politicians.slice(0, 5).forEach((pol, i) => {
      console.log(`   ${i + 1}. ${pol.name} (${pol.chamber}, ${pol.party})`);
      console.log(`      Date: ${pol.transactionDate}`);
      console.log(`      Amount: ${pol.amountRange}`);
    });

    console.log('\n💡 SME Insight:');
    console.log(`   ${detailedSignal.smeInsight}`);
  }
}

// Test with a few known companies
console.log('\n\n' + '='.repeat(80));
console.log('🔍 SPOT CHECKS: Popular Companies in Sample Data');
console.log('='.repeat(80));

const testSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'JPM'];

for (const symbol of testSymbols) {
  const company = db.prepare('SELECT id, name FROM companies WHERE symbol = ?').get(symbol);
  if (company) {
    const signal = congressionalSignals.generateSignal(company.id);
    if (signal) {
      console.log(`\n${symbol}: ${signal.signalStrength.toUpperCase()} signal (score: ${signal.score.toFixed(2)})`);
      console.log(`   ${signal.metrics.uniquePoliticians} politicians, $${(signal.metrics.totalPurchaseValue / 1000).toFixed(0)}K total`);
      if (signal.metrics.isBipartisan) {
        console.log('   ⚖️  Bipartisan support');
      }
      if (signal.metrics.senatePurchases > 0) {
        console.log(`   🏛️  ${signal.metrics.senatePurchases} Senator(s) buying`);
      }
    } else {
      console.log(`\n${symbol}: No recent congressional purchases`);
    }
  }
}

console.log('\n\n' + '='.repeat(80));
console.log('📈 RESEARCH-BACKED INSIGHTS');
console.log('='.repeat(80));

console.log('\n✅ CONGRESSIONAL TRADING SIGNALS:');
console.log(`   Coverage: ${coverage.unique_politicians} politicians, ${coverage.companies_with_data} companies`);
console.log(`   Quality: ${coverage.purchase_transactions} purchase transactions (high signal)`);

if (coverage.total_transactions >= 50) {
  console.log('   Status: SUFFICIENT - Ready to use for alpha generation');
  console.log('   Expected Alpha: +6-10% from congressional trades');
} else if (coverage.total_transactions >= 20) {
  console.log('   Status: MODERATE - Can use but limited coverage');
  console.log('   Expected Alpha: +4-6% (limited data)');
} else {
  console.log('   Status: LIMITED - Need more data for reliable signals');
  console.log('   Recommendation: Backfill more historical data');
}

console.log('\n🎯 According to Academic Research:');
console.log('   • Senate trades outperform market by ~10% annually');
console.log('   • House trades outperform market by ~6% annually');
console.log('   • Bipartisan purchases = reduced political risk');
console.log('   • Committee-relevant trades show highest alpha');
console.log('   • Purchase clusters (2+) predict strong outperformance');

console.log('\n💡 Signal Quality:');
if (clusters.length > 0) {
  console.log(`   • Found ${clusters.length} current purchase clusters`);
  console.log('   • Clusters provide strongest signal (multiple politicians = consensus)');
  console.log('   • Combine with insider/fundamental signals for best results');
} else {
  console.log('   • Sample data generated - real data would show active clusters');
  console.log('   • To fetch real data: Set QUIVER_API_KEY or download CSV');
  console.log('   • See python-services/congressional_trading_fetcher.py');
}

console.log('\n\n' + '='.repeat(80));
console.log('✅ Testing Complete');
console.log('='.repeat(80) + '\n');

db.close();
