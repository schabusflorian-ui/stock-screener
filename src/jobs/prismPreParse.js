// src/jobs/prismPreParse.js
// Job to pre-parse SEC 10-K filings for S&P 500 companies

const { getDatabaseAsync } = require('../lib/db');
const SECFilingParser = require('../services/secFilingParser');

const parser = new SECFilingParser();
let databasePromise;

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = getDatabaseAsync();
  }
  return databasePromise;
}

// S&P 500 symbols (can be updated or fetched dynamically)
// This is a subset of top companies for initial implementation
const SP500_TOP_100 = [
  // Technology
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'NVDA', 'AVGO', 'CSCO', 'ORCL', 'ADBE',
  'CRM', 'AMD', 'INTC', 'QCOM', 'TXN', 'IBM', 'NOW', 'AMAT', 'MU', 'LRCX',

  // Healthcare
  'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY',
  'AMGN', 'GILD', 'MDT', 'ISRG', 'VRTX', 'REGN', 'SYK', 'BSX', 'ELV', 'CI',

  // Financials
  'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'SPGI', 'BLK',
  'AXP', 'C', 'SCHW', 'MMC', 'CB', 'PGR', 'USB', 'AON', 'ICE', 'CME',

  // Consumer
  'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'LOW', 'TJX', 'BKNG', 'MAR',
  'TGT', 'COST', 'PG', 'KO', 'PEP', 'WMT', 'DIS', 'NFLX', 'CMCSA', 'VZ',

  // Industrials & Energy
  'UNP', 'HON', 'UPS', 'BA', 'CAT', 'GE', 'RTX', 'LMT', 'DE', 'MMM',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'KMI'
];

/**
 * Get S&P 500 symbols from database index constituents
 */
async function getSP500FromDatabase() {
  try {
    const database = await getDatabase();
    const symbolsResult = await database.query(`
      SELECT c.symbol
      FROM index_constituents ic
      JOIN stock_indexes si ON ic.index_id = si.id
      JOIN companies c ON ic.company_id = c.id
      WHERE si.code = 'SPX'
      AND ic.removed_at IS NULL
    `);
    const symbols = symbolsResult.rows;

    return symbols.map(s => s.symbol);
  } catch (error) {
    console.log('Could not fetch S&P 500 from database, using static list');
    return [];
  }
}

/**
 * Get symbols that need SEC filing parsing
 * (either no filing or filing older than 90 days)
 */
async function getSymbolsNeedingParsing(symbols) {
  const needsParsing = [];
  const database = await getDatabase();

  for (const symbol of symbols) {
    const existingResult = await database.query(`
      SELECT parsed_at FROM sec_filings
      WHERE symbol = $1 AND form_type = '10-K'
      ORDER BY filing_date DESC
      LIMIT 1
    `, [symbol]);
    const existing = existingResult.rows[0];

    if (!existing) {
      needsParsing.push({ symbol, reason: 'no_filing' });
    } else {
      const parsedAt = new Date(existing.parsed_at);
      const daysSinceParsed = (Date.now() - parsedAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceParsed > 90) {
        needsParsing.push({ symbol, reason: 'stale', daysSinceParsed: Math.floor(daysSinceParsed) });
      }
    }
  }

  return needsParsing;
}

/**
 * Run the pre-parsing job
 */
async function runPreParseJob(options = {}) {
  const {
    maxSymbols = 50,       // Maximum symbols to process per run
    delayMs = 300,         // Delay between requests (SEC rate limit)
    forceRefresh = false,  // Force refresh even if recent
    symbolList = null      // Custom symbol list (overrides S&P 500)
  } = options;

  console.log('='.repeat(60));
  console.log('PRISM Pre-Parse Job - SEC 10-K Filings');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Get symbol list
  let symbols;
  if (symbolList) {
    symbols = symbolList;
  } else {
    // Try to get from database first
    const dbSymbols = await getSP500FromDatabase();
    symbols = dbSymbols.length > 0 ? dbSymbols : SP500_TOP_100;
  }

  console.log(`Total symbols in list: ${symbols.length}`);

  // Find symbols needing parsing
  let toProcess;
  if (forceRefresh) {
    toProcess = symbols.slice(0, maxSymbols).map(s => ({ symbol: s, reason: 'forced' }));
  } else {
    toProcess = (await getSymbolsNeedingParsing(symbols)).slice(0, maxSymbols);
  }

  console.log(`Symbols needing parsing: ${toProcess.length}`);
  console.log('');

  if (toProcess.length === 0) {
    console.log('All symbols are up to date. Nothing to process.');
    return { processed: 0, success: 0, failed: 0 };
  }

  // Process symbols
  const results = {
    processed: 0,
    success: [],
    failed: [],
    skipped: []
  };

  for (const { symbol, reason } of toProcess) {
    results.processed++;
    console.log(`[${results.processed}/${toProcess.length}] Processing ${symbol} (${reason})...`);

    try {
      const parsed = await parser.parseAndCache10K(symbol, true);

      if (parsed && (parsed.businessDescription || parsed.riskFactors)) {
        results.success.push(symbol);
        console.log(`  ✓ Successfully parsed ${symbol}`);
      } else {
        results.skipped.push({ symbol, reason: 'no_content' });
        console.log(`  - Skipped ${symbol} (no extractable content)`);
      }
    } catch (error) {
      results.failed.push({ symbol, error: error.message });
      console.log(`  ✗ Failed ${symbol}: ${error.message}`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, delayMs));
  }

  // Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('Job Complete');
  console.log('='.repeat(60));
  console.log(`Processed: ${results.processed}`);
  console.log(`Success: ${results.success.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('');
    console.log('Failed symbols:');
    for (const { symbol, error } of results.failed) {
      console.log(`  - ${symbol}: ${error}`);
    }
  }

  console.log('');
  console.log(`Completed at: ${new Date().toISOString()}`);

  return results;
}

/**
 * Get parsing statistics
 */
async function getParsingStats() {
  const database = await getDatabase();
  const totalResult = await database.query(`
    SELECT COUNT(DISTINCT symbol) as count FROM sec_filings WHERE form_type = '10-K'
  `);
  const recentResult = await database.query(`
    SELECT COUNT(DISTINCT symbol) as count FROM sec_filings
    WHERE form_type = '10-K'
    AND parsed_at > datetime('now', '-30 days')
  `);
  const withContentResult = await database.query(`
    SELECT COUNT(DISTINCT symbol) as count FROM sec_filings
    WHERE form_type = '10-K'
    AND (business_description IS NOT NULL OR risk_factors IS NOT NULL)
  `);

  return {
    totalFilings: totalResult.rows[0].count,
    recentlyParsed: recentResult.rows[0].count,
    withExtractedContent: withContentResult.rows[0].count
  };
}

// Export functions
module.exports = {
  runPreParseJob,
  getParsingStats,
  getSP500FromDatabase,
  getSymbolsNeedingParsing,
  SP500_TOP_100
};

// If run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max' && args[i + 1]) {
      options.maxSymbols = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      options.delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--force') {
      options.forceRefresh = true;
    } else if (args[i] === '--symbols' && args[i + 1]) {
      options.symbolList = args[i + 1].split(',').map(s => s.trim().toUpperCase());
      i++;
    } else if (args[i] === '--stats') {
      getParsingStats().then(stats => {
        console.log('SEC Filing Parsing Statistics:');
        console.log(`  Total 10-K filings: ${stats.totalFilings}`);
        console.log(`  Recently parsed (30 days): ${stats.recentlyParsed}`);
        console.log(`  With extracted content: ${stats.withExtractedContent}`);
        process.exit(0);
      }).catch(error => {
        console.error('Stats failed:', error.message);
        process.exit(1);
      });
    } else if (args[i] === '--help') {
      console.log(`
PRISM Pre-Parse Job - SEC 10-K Filings

Usage: node prismPreParse.js [options]

Options:
  --max <number>      Maximum symbols to process (default: 50)
  --delay <ms>        Delay between requests in ms (default: 300)
  --force             Force refresh even if recently parsed
  --symbols <list>    Comma-separated list of symbols to process
  --stats             Show parsing statistics and exit
  --help              Show this help message

Examples:
  node prismPreParse.js                          # Run with defaults
  node prismPreParse.js --max 100                # Process up to 100 symbols
  node prismPreParse.js --symbols AAPL,MSFT,GOOGL  # Process specific symbols
  node prismPreParse.js --force --max 10         # Force refresh top 10
  node prismPreParse.js --stats                  # Show statistics
`);
      process.exit(0);
    }
  }

  // Run the job
  runPreParseJob(options)
    .then(results => {
      process.exit(results.failed.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Job failed:', error);
      process.exit(1);
    });
}
