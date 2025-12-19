/**
 * Background job to refresh sentiment data
 *
 * Can be run:
 * 1. Manually: node src/jobs/sentimentRefresh.js
 * 2. Via cron: Add to crontab or use node-cron
 * 3. As a scheduled task in your hosting environment
 */

const db = require('../database');
const RedditFetcher = require('../services/redditFetcher');
const SentimentSignalGenerator = require('../services/sentimentSignal');

const database = db.getDatabase();
const redditFetcher = new RedditFetcher(database);
const signalGenerator = new SentimentSignalGenerator(database);

/**
 * Scan for trending tickers across Reddit
 */
async function refreshTrending() {
  console.log('Scanning subreddits for trending tickers...');
  try {
    const trending = await redditFetcher.scanTrendingTickers();
    console.log(`Found ${trending.length} trending tickers`);
    return trending;
  } catch (error) {
    console.error('Trending scan failed:', error.message);
    return [];
  }
}

/**
 * Refresh sentiment for companies that need updating
 */
async function refreshWatchlist(options = {}) {
  const {
    maxCompanies = 50,
    staleHours = 4,
    delayBetweenMs = 2000
  } = options;

  console.log(`Refreshing sentiment for companies stale > ${staleHours} hours...`);

  try {
    // Get companies that need refreshing
    const companies = database.prepare(`
      SELECT id, symbol FROM companies
      WHERE sentiment_updated_at < datetime('now', '-${staleHours} hours')
         OR sentiment_updated_at IS NULL
      ORDER BY
        CASE WHEN sentiment_updated_at IS NULL THEN 0 ELSE 1 END,
        sentiment_updated_at ASC
      LIMIT ?
    `).all(maxCompanies);

    console.log(`Found ${companies.length} companies to refresh`);

    let refreshed = 0;
    for (const company of companies) {
      try {
        console.log(`  Refreshing ${company.symbol}...`);

        // Fetch from Reddit
        await redditFetcher.fetchTickerSentiment(company.symbol, company.id);

        // Calculate signal
        await signalGenerator.calculateSignal(company.id, company.symbol, '7d');

        refreshed++;

        // Respect rate limits
        if (delayBetweenMs > 0) {
          await new Promise(r => setTimeout(r, delayBetweenMs));
        }
      } catch (error) {
        console.error(`  Error refreshing ${company.symbol}:`, error.message);
      }
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
 */
async function refreshSymbols(symbols, delayBetweenMs = 2000) {
  console.log(`Refreshing sentiment for: ${symbols.join(', ')}`);

  let refreshed = 0;
  for (const symbol of symbols) {
    try {
      const company = database.prepare(
        'SELECT id FROM companies WHERE symbol = ?'
      ).get(symbol.toUpperCase());

      if (!company) {
        console.log(`  ${symbol}: Company not found, skipping`);
        continue;
      }

      console.log(`  Refreshing ${symbol}...`);

      await redditFetcher.fetchTickerSentiment(symbol.toUpperCase(), company.id);
      await signalGenerator.calculateSignal(company.id, symbol, '7d');

      refreshed++;

      if (delayBetweenMs > 0) {
        await new Promise(r => setTimeout(r, delayBetweenMs));
      }
    } catch (error) {
      console.error(`  Error refreshing ${symbol}:`, error.message);
    }
  }

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
  await refreshWatchlist({ maxCompanies: 25, staleHours: 4 });

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
