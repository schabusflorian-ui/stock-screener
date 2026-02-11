/**
 * Background job to refresh sentiment data
 *
 * Can be run:
 * 1. Manually: node src/jobs/sentimentRefresh.js
 * 2. Via cron: Add to crontab or use node-cron
 * 3. As a scheduled task in your hosting environment
 */

const { getDatabaseAsync } = require('../lib/db');
const RedditFetcher = require('../services/redditFetcher');
const SentimentSignalGenerator = require('../services/sentimentSignal');

let databaseInstance;
let redditFetcher;
let signalGenerator;

async function getServices() {
  if (!databaseInstance) {
    databaseInstance = await getDatabaseAsync();
  }
  if (!redditFetcher) {
    redditFetcher = new RedditFetcher(databaseInstance);
  }
  if (!signalGenerator) {
    signalGenerator = new SentimentSignalGenerator(databaseInstance);
  }
  return { database: databaseInstance, redditFetcher, signalGenerator };
}

/**
 * Scan for trending tickers across Reddit
 */
async function refreshTrending() {
  console.log('Scanning subreddits for trending tickers...');
  try {
    const { redditFetcher: fetcher } = await getServices();
    const trending = await fetcher.scanTrendingTickers();
    console.log(`Found ${trending.length} trending tickers`);
    return trending;
  } catch (error) {
    console.error('Trending scan failed:', error.message);
    return [];
  }
}

/**
 * Process a single company's sentiment refresh
 */
async function refreshSingleCompany(company) {
  try {
    const { redditFetcher: fetcher, signalGenerator: generator } = await getServices();
    // Fetch from Reddit
    await fetcher.fetchTickerSentiment(company.symbol, company.id);
    // Calculate signal
    await generator.calculateSignal(company.id, company.symbol, '7d');
    return { symbol: company.symbol, success: true };
  } catch (error) {
    console.error(`  Error refreshing ${company.symbol}:`, error.message);
    return { symbol: company.symbol, success: false, error: error.message };
  }
}

/**
 * Process companies in parallel batches
 * @param {Array} companies - Companies to process
 * @param {number} batchSize - Number of concurrent requests
 * @param {number} delayBetweenBatches - Delay in ms between batches (rate limiting)
 */
async function processBatches(companies, batchSize = 5, delayBetweenBatches = 1000) {
  const results = [];

  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(companies.length / batchSize);

    console.log(`  Processing batch ${batchNum}/${totalBatches}: ${batch.map(c => c.symbol).join(', ')}`);

    // Process batch in parallel
    const batchResults = await Promise.all(batch.map(refreshSingleCompany));
    results.push(...batchResults);

    // Delay between batches to respect rate limits
    if (i + batchSize < companies.length && delayBetweenBatches > 0) {
      await new Promise(r => setTimeout(r, delayBetweenBatches));
    }
  }

  return results;
}

/**
 * Refresh sentiment for companies that need updating
 * Uses parallel batch processing for ~5x faster execution
 */
async function refreshWatchlist(options = {}) {
  const {
    maxCompanies = 50,
    staleHours = 1,  // Reduced from 4 hours for more timely ML signals
    batchSize = 5,   // Process 5 companies in parallel
    delayBetweenBatches = 1000  // 1 second between batches
  } = options;

  console.log(`Refreshing sentiment for companies stale > ${staleHours} hours...`);

  try {
    // Get companies that need refreshing
    const { database } = await getServices();
    const companiesResult = await database.query(`
      SELECT id, symbol FROM companies
      WHERE sentiment_updated_at < datetime('now', '-${staleHours} hours')
         OR sentiment_updated_at IS NULL
      ORDER BY
        CASE WHEN sentiment_updated_at IS NULL THEN 0 ELSE 1 END,
        sentiment_updated_at ASC
      LIMIT $1
    `, [maxCompanies]);
    const companies = companiesResult.rows;

    console.log(`Found ${companies.length} companies to refresh (batch size: ${batchSize})`);

    if (companies.length === 0) {
      return 0;
    }

    // Process in parallel batches
    const results = await processBatches(companies, batchSize, delayBetweenBatches);

    const refreshed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      console.log(`  Failed: ${failed.map(f => f.symbol).join(', ')}`);
    }

    console.log(`Refreshed ${refreshed}/${companies.length} companies`);
    return refreshed;
  } catch (error) {
    console.error('Watchlist refresh failed:', error.message);
    return 0;
  }
}

/**
 * Refresh sentiment for specific symbols
 * Uses batched parallel processing for faster execution
 */
async function refreshSymbols(symbols, options = {}) {
  const { batchSize = 5, delayBetweenBatches = 1000 } = options;

  console.log(`Refreshing sentiment for: ${symbols.join(', ')}`);

  // Batch lookup all company IDs at once (avoids N+1 queries)
  const { database } = await getServices();
  const placeholders = symbols.map((_, index) => `$${index + 1}`).join(',');
  const companiesResult = await database.query(`
    SELECT id, symbol FROM companies
    WHERE UPPER(symbol) IN (${placeholders})
  `, symbols.map(s => s.toUpperCase()));
  const companies = companiesResult.rows;

  const foundSymbols = new Set(companies.map(c => c.symbol));
  const notFound = symbols.filter(s => !foundSymbols.has(s.toUpperCase()));

  if (notFound.length > 0) {
    console.log(`  Symbols not found: ${notFound.join(', ')}`);
  }

  if (companies.length === 0) {
    console.log('No valid symbols to refresh');
    return 0;
  }

  // Process in parallel batches
  const results = await processBatches(companies, batchSize, delayBetweenBatches);

  const refreshed = results.filter(r => r.success).length;
  console.log(`Refreshed ${refreshed}/${symbols.length} symbols`);
  return refreshed;
}

/**
 * Run full refresh cycle
 */
async function runFullRefresh() {
  console.log('\n=== Starting Full Sentiment Refresh ===\n');
  const startTime = Date.now();

  // Step 1: Scan trending
  console.log('Step 1: Scanning trending tickers...');
  await refreshTrending();

  // Step 2: Refresh stale companies
  console.log('\nStep 2: Refreshing stale company sentiment...');
  await refreshWatchlist({ maxCompanies: 25, staleHours: 1 });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== Refresh Complete (${elapsed}s) ===\n`);
}

// Export for use as module
module.exports = {
  refreshTrending,
  refreshWatchlist,
  refreshSymbols,
  runFullRefresh,
};

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--trending')) {
    refreshTrending().then(() => process.exit(0));
  } else if (args.includes('--symbols')) {
    const symbolsArg = args[args.indexOf('--symbols') + 1];
    if (symbolsArg) {
      const symbols = symbolsArg.split(',');
      refreshSymbols(symbols).then(() => process.exit(0));
    } else {
      console.error('Usage: node sentimentRefresh.js --symbols AAPL,MSFT,NVDA');
      process.exit(1);
    }
  } else if (args.includes('--watchlist')) {
    refreshWatchlist().then(() => process.exit(0));
  } else {
    // Default: run full refresh
    runFullRefresh().then(() => process.exit(0));
  }
}
