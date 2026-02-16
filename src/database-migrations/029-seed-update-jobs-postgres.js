// 029-seed-update-jobs-postgres.js
// Seed all update jobs for each bundle
// This ensures all implemented jobs have database records for scheduling

async function migrate(db) {
  console.log('Seeding update jobs for all bundles...');

  // Helper to get bundle ID
  async function getBundleId(name) {
    const result = await db.query('SELECT id FROM update_bundles WHERE name = $1', [name]);
    return result.rows[0]?.id;
  }

  // Helper to insert job if not exists
  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) return;
    await db.query(
      `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       WHERE NOT EXISTS (SELECT 1 FROM update_jobs WHERE job_key = $2)`,
      [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
    );
  }

  // === PRICES BUNDLE ===
  const pricesId = await getBundleId('prices');
  if (pricesId) {
    await insertJob(pricesId, 'prices.daily', 'Daily Price Update', 'Fetch end-of-day prices for all tracked stocks', '0 18 * * 1-5', 1, 100, 500, 3600);
    await insertJob(pricesId, 'prices.backfill', 'Price Backfill', 'Fill in missing historical prices for stocks', '0 3 * * 0', 1, 50, 1000, 7200);
    await insertJob(pricesId, 'prices.intraday', 'Intraday Price Update', 'Update prices during market hours (manual)', null, 0, 50, 200, 600);
    await insertJob(pricesId, 'prices.index', 'Index Price Update', 'Update major index prices (SPY, QQQ, etc.)', '0 19 * * 1-5', 1, 10, 500, 600);
    console.log('  ✓ prices jobs seeded');
  }

  // === FUNDAMENTALS BUNDLE ===
  const fundamentalsId = await getBundleId('fundamentals');
  if (fundamentalsId) {
    await insertJob(fundamentalsId, 'fundamentals.quarterly', 'Quarterly Import', 'Import quarterly financial statements from SEC', '0 6 * * *', 1, 50, 1000, 7200);
    await insertJob(fundamentalsId, 'fundamentals.metrics', 'Metric Calculation', 'Recalculate derived metrics for all companies', '0 7 * * *', 1, 100, 500, 3600);
    await insertJob(fundamentalsId, 'fundamentals.ratios', 'Ratio Calculation', 'Calculate financial ratios', '0 8 * * *', 1, 100, 500, 3600);
    console.log('  ✓ fundamentals jobs seeded');
  }

  // === ETF BUNDLE ===
  const etfId = await getBundleId('etf');
  if (etfId) {
    await insertJob(etfId, 'etf.holdings', 'ETF Holdings Update', 'Update holdings for all tracked ETFs', '0 5 * * 1', 1, 20, 2000, 7200);
    await insertJob(etfId, 'etf.holdings_static', 'ETF Static Holdings', 'Update static ETF holdings data', '0 6 * * 1', 1, 20, 2000, 3600);
    await insertJob(etfId, 'etf.tier1', 'Tier 1 ETF Update', 'Update tier 1 (primary) ETFs', '0 4 * * 1-5', 1, 10, 1000, 1800);
    await insertJob(etfId, 'etf.tier2', 'Tier 2 ETF Update', 'Update tier 2 (secondary) ETFs', '0 4 * * 0', 1, 20, 1000, 3600);
    await insertJob(etfId, 'etf.promotion', 'ETF Tier Promotion', 'Promote/demote ETFs between tiers', '0 3 * * 0', 1, 50, 500, 1800);
    console.log('  ✓ etf jobs seeded');
  }

  // === MARKET BUNDLE ===
  const marketId = await getBundleId('market');
  if (marketId) {
    await insertJob(marketId, 'market.sectors', 'Sector Performance', 'Update sector performance data', '0 19 * * 1-5', 1, 11, 1000, 1800);
    await insertJob(marketId, 'market.indices', 'Index Data Update', 'Update market index data', '0 20 * * 1-5', 1, 10, 1000, 1800);
    await insertJob(marketId, 'market.calendar', 'Earnings Calendar', 'Update earnings calendar', '0 6 * * 1-5', 1, 100, 500, 1800);
    console.log('  ✓ market jobs seeded');
  }

  // === SENTIMENT BUNDLE ===
  const sentimentId = await getBundleId('sentiment');
  if (sentimentId) {
    await insertJob(sentimentId, 'sentiment.reddit', 'Reddit Sentiment', 'Analyze Reddit sentiment for tracked stocks', '0 */4 * * *', 1, 100, 500, 1800);
    await insertJob(sentimentId, 'sentiment.stocktwits', 'StockTwits Sentiment', 'Fetch StockTwits sentiment data', '0 */6 * * *', 1, 50, 1000, 1800);
    await insertJob(sentimentId, 'sentiment.trending', 'Trending Analysis', 'Identify trending tickers', '0 */2 * * *', 1, 200, 200, 900);
    console.log('  ✓ sentiment jobs seeded');
  }

  // === KNOWLEDGE BUNDLE ===
  const knowledgeId = await getBundleId('knowledge');
  if (knowledgeId) {
    await insertJob(knowledgeId, 'knowledge.full', 'Full Knowledge Refresh', 'Complete knowledge base rebuild', '0 2 * * 0', 1, 500, 100, 14400);
    await insertJob(knowledgeId, 'knowledge.incremental', 'Incremental Knowledge Update', 'Update knowledge base with new data', '0 3 * * *', 1, 100, 500, 3600);
    console.log('  ✓ knowledge jobs seeded');
  }

  // === SEC BUNDLE ===
  const secId = await getBundleId('sec');
  if (secId) {
    await insertJob(secId, 'sec.filings', 'SEC Filing Check', 'Check for new SEC filings', '0 7 * * *', 1, 100, 500, 3600);
    await insertJob(secId, 'sec.13f', '13F Import', 'Import 13F institutional holdings', '0 8 * * 1', 1, 50, 2000, 7200);
    await insertJob(secId, 'sec.insider', 'Insider Trading Import', 'Import Form 4 insider transactions', '0 9 * * *', 1, 100, 500, 3600);
    console.log('  ✓ sec jobs seeded');
  }

  // === IPO BUNDLE ===
  const ipoId = await getBundleId('ipo');
  if (ipoId) {
    await insertJob(ipoId, 'ipo.sync_trading_companies', 'IPO Trading Sync', 'Sync IPOs that started trading to companies table', '0 10 * * *', 1, 50, 1000, 1800);
    await insertJob(ipoId, 'ipo.check_status', 'IPO Status Check', 'Check and update IPO statuses', '0 11 * * *', 1, 100, 500, 1800);
    console.log('  ✓ ipo jobs seeded');
  }

  // === MAINTENANCE BUNDLE ===
  const maintenanceId = await getBundleId('maintenance');
  if (maintenanceId) {
    await insertJob(maintenanceId, 'maintenance.cleanup', 'Data Cleanup', 'Clean up stale and orphaned data', '0 3 * * 0', 1, 1000, 100, 7200);
    await insertJob(maintenanceId, 'maintenance.vacuum', 'Database Vacuum', 'Vacuum analyze database tables', '0 4 * * 0', 1, 1, 0, 3600);
    await insertJob(maintenanceId, 'maintenance.backup', 'Database Backup', 'Create database backup', '0 2 * * *', 1, 1, 0, 1800);
    await insertJob(maintenanceId, 'maintenance.integrity', 'Data Integrity Check', 'Check data integrity and consistency', '0 5 * * 0', 1, 1000, 100, 3600);
    console.log('  ✓ maintenance jobs seeded');
  }

  // === ANALYTICS BUNDLE (additional jobs not in 007) ===
  const analyticsId = await getBundleId('analytics');
  if (analyticsId) {
    // These two are already in 007, but insertJob is idempotent
    await insertJob(analyticsId, 'analytics.outcomes', 'Outcome Calculation', 'Calculate decision outcomes (return_1y, alpha)', '0 4 * * 0', 1, 2000, 0, 7200);
    await insertJob(analyticsId, 'analytics.investor_styles', 'Investor Style Classification', 'Re-classify investor styles from decisions', '0 5 * * 0', 1, 100, 500, 3600);
    // New jobs
    await insertJob(analyticsId, 'analytics.factors', 'Factor Analysis', 'Run factor analysis on tracked stocks', '0 6 * * 0', 1, 500, 500, 7200);
    await insertJob(analyticsId, 'analytics.factor_context', 'Factor Context Update', 'Update factor context for companies', '0 7 * * 0', 1, 200, 500, 3600);
    await insertJob(analyticsId, 'analytics.pattern_matching', 'Pattern Matching', 'Find historical patterns in current data', '0 8 * * 0', 1, 100, 1000, 7200);
    await insertJob(analyticsId, 'analytics.market_indicators', 'Market Indicators', 'Calculate market-wide indicators', '0 9 * * 0', 1, 50, 500, 3600);
    await insertJob(analyticsId, 'analytics.track_records', 'Track Record Update', 'Update analyst/investor track records', '0 10 * * 0', 1, 100, 500, 3600);
    console.log('  ✓ analytics jobs seeded');
  }

  console.log('✅ All update jobs seeded.');
}

module.exports = migrate;
