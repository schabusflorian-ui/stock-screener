// test-insider-signals.js
// Test the insider trading signal generator

const Database = require('better-sqlite3');
const { InsiderTradingSignals } = require('./src/services/signals/insiderTradingSignals');

const db = new Database('./data/stocks.db');
const insiderSignals = new InsiderTradingSignals(db);

console.log('\n' + '='.repeat(80));
console.log('🔍 INSIDER TRADING SIGNAL GENERATOR TEST');
console.log('='.repeat(80));

// Check data coverage
console.log('\n📊 Data Coverage:');
const coverage = insiderSignals.getDataCoverage();
console.log(`   Total Transactions: ${coverage.total_transactions}`);
console.log(`   Companies with Data: ${coverage.companies_with_data}`);
console.log(`   Buy Transactions: ${coverage.buy_transactions}`);
console.log(`   Sell Transactions: ${coverage.sell_transactions}`);
console.log(`   Date Range: ${coverage.earliest_transaction} to ${coverage.latest_transaction}`);

// Find current buy clusters
console.log('\n\n' + '='.repeat(80));
console.log('🎯 CURRENT BUY CLUSTERS (3+ Insiders in 30 Days)');
console.log('='.repeat(80));

const clusters = insiderSignals.findBuyClusters();

if (clusters.length === 0) {
  console.log('\n   No buy clusters found in last 30 days');
} else {
  console.log(`\n   Found ${clusters.length} companies with insider buy clusters:\n`);

  for (const [idx, cluster] of clusters.entries()) {
    console.log(`${idx + 1}. ${cluster.symbol} - ${cluster.name}`);
    console.log(`   Insiders Buying: ${cluster.insider_count}`);
    console.log(`   Total Transactions: ${cluster.transaction_count}`);
    console.log(`   Total Buy Value: $${(cluster.total_buy_value / 1000000).toFixed(2)}M`);
    console.log(`   Avg Buy Price: $${cluster.avg_buy_price?.toFixed(2)}`);
    console.log(`   Date Range: ${cluster.first_buy_date} to ${cluster.last_buy_date}`);
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

  const detailedSignal = insiderSignals.generateSignal(topCluster.company_id);

  if (detailedSignal) {
    console.log(`\nCompany: ${detailedSignal.companyName} (${detailedSignal.symbol})`);
    console.log(`Signal: ${detailedSignal.signal}`);
    console.log(`Score: ${detailedSignal.score.toFixed(3)}`);
    console.log(`Confidence: ${detailedSignal.confidence.toFixed(3)}`);
    console.log(`Strength: ${detailedSignal.signalStrength}`);
    console.log(`Expected Alpha: +${detailedSignal.expectedAlpha}%`);

    console.log(`\nMetrics:`);
    console.log(`   Unique Insiders: ${detailedSignal.metrics.uniqueInsiders}`);
    console.log(`   Total Transactions: ${detailedSignal.metrics.totalTransactions}`);
    console.log(`   Total Buy Value: $${(detailedSignal.metrics.totalBuyValue / 1000000).toFixed(2)}M`);
    console.log(`   Large Buys (>$100k): ${detailedSignal.metrics.largeBuyCount}`);
    console.log(`   Is Cluster: ${detailedSignal.metrics.isCluster ? 'YES' : 'NO'}`);
    console.log(`   Very Recent (<7 days): ${detailedSignal.metrics.veryRecentCount}`);

    console.log(`\nReasons:`);
    detailedSignal.reasons.forEach(reason => console.log(`   • ${reason}`));

    console.log(`\nRecent Transactions (Last 5):`);
    detailedSignal.recentTransactions.forEach((txn, i) => {
      console.log(`   ${i + 1}. ${txn.insiderName} (${txn.insiderTitle})`);
      console.log(`      Date: ${txn.transactionDate}`);
      console.log(`      Shares: ${txn.shares?.toLocaleString()} @ $${txn.pricePerShare?.toFixed(2)}`);
      console.log(`      Total: $${txn.totalValue?.toLocaleString()}`);
    });

    console.log(`\n💡 SME Insight:`);
    console.log(`   ${detailedSignal.smeInsight}`);
  }
}

// Test with a few known companies
console.log('\n\n' + '='.repeat(80));
console.log('🔍 SPOT CHECKS: Popular Companies');
console.log('='.repeat(80));

const testSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META'];

for (const symbol of testSymbols) {
  const company = db.prepare('SELECT id, name FROM companies WHERE symbol = ?').get(symbol);
  if (company) {
    const signal = insiderSignals.generateSignal(company.id);
    if (signal) {
      console.log(`\n${symbol}: ${signal.signalStrength.toUpperCase()} signal (score: ${signal.score.toFixed(2)})`);
      console.log(`   ${signal.metrics.uniqueInsiders} insiders, $${(signal.metrics.totalBuyValue / 1000).toFixed(0)}K total`);
    } else {
      console.log(`\n${symbol}: No recent insider buying`);
    }
  }
}

console.log('\n\n' + '='.repeat(80));
console.log('📈 SENTIMENT DATA ASSESSMENT');
console.log('='.repeat(80));

// Check sentiment data coverage
const sentimentCoverage = db.prepare(`
  SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT company_id) as companies,
    AVG(sources_used) as avg_sources,
    AVG(confidence) as avg_confidence,
    MIN(calculated_at) as earliest,
    MAX(calculated_at) as latest
  FROM combined_sentiment
`).get();

console.log(`\nCurrent Sentiment Data:`);
console.log(`   Total Records: ${sentimentCoverage.total_records}`);
console.log(`   Companies Covered: ${sentimentCoverage.companies}`);
console.log(`   Avg Sources per Record: ${sentimentCoverage.avg_sources?.toFixed(1)}`);
console.log(`   Avg Confidence: ${(sentimentCoverage.avg_confidence * 100)?.toFixed(1)}%`);
console.log(`   Date Range: ${sentimentCoverage.earliest} to ${sentimentCoverage.latest}`);

// Check sentiment sources
const sentimentBreakdown = db.prepare(`
  SELECT
    COUNT(CASE WHEN reddit_sentiment IS NOT NULL THEN 1 END) as has_reddit,
    COUNT(CASE WHEN stocktwits_sentiment IS NOT NULL THEN 1 END) as has_stocktwits,
    COUNT(CASE WHEN news_sentiment IS NOT NULL THEN 1 END) as has_news,
    COUNT(CASE WHEN market_sentiment IS NOT NULL THEN 1 END) as has_market
  FROM combined_sentiment
`).get();

console.log(`\nSentiment Sources:`);
console.log(`   Reddit: ${sentimentBreakdown.has_reddit} records`);
console.log(`   StockTwits: ${sentimentBreakdown.has_stocktwits} records`);
console.log(`   News: ${sentimentBreakdown.has_news} records`);
console.log(`   Market: ${sentimentBreakdown.has_market} records`);

// SME Panel assessment
console.log(`\n\n💡 SME Panel Assessment:`);

console.log(`\n✅ INSIDER TRADING DATA:`);
console.log(`   Coverage: ${coverage.companies_with_data} companies`);
console.log(`   Quality: ${coverage.buy_transactions} buy transactions (high signal)`);
console.log(`   Status: SUFFICIENT - Ready to use for alpha generation`);
console.log(`   Expected Alpha: +3-5% from clusters`);

console.log(`\n⚠️  SENTIMENT DATA:`);
console.log(`   Coverage: ${sentimentCoverage.companies} companies (limited)`);
console.log(`   Quality: ${sentimentCoverage.avg_sources?.toFixed(1)} sources per record (moderate)`);
console.log(`   Recency: ${sentimentCoverage.latest?.split(' ')[0]} (recent)`);

if (sentimentCoverage.companies < 100) {
  console.log(`   Status: LIMITED - Only covers ${sentimentCoverage.companies} companies`);
  console.log(`   Recommendation: Expand coverage OR use for CONTRARIAN signals only at extremes`);
} else {
  console.log(`   Status: ADEQUATE - Can use for signals`);
}

console.log(`\n🎯 According to SME Panel:`);
console.log(`   • Sentiment is TIER 2 (moderate value) - only useful at EXTREMES`);
console.log(`   • Daily sentiment is NOISE - need to track EXTREMES (euphoria/panic)`);
console.log(`   • Your current data: ${sentimentCoverage.companies} companies with ${sentimentCoverage.avg_sources?.toFixed(1)} sources`);
console.log(`   • Recommendation: Use for contrarian signals only, not daily trading`);

console.log('\n\n' + '='.repeat(80));
console.log('✅ Testing Complete');
console.log('='.repeat(80) + '\n');

db.close();
