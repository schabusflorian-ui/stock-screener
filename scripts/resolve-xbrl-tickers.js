#!/usr/bin/env node
/**
 * Resolve XBRL Company Identifiers to Trading Tickers
 *
 * This script resolves LEI identifiers to proper trading tickers
 * using GLEIF (company info) and OpenFIGI (ticker resolution).
 *
 * Prerequisites:
 * - OPENFIGI_API_KEY env variable (optional, but recommended for higher rate limits)
 *
 * Usage:
 *   node scripts/resolve-xbrl-tickers.js
 *   node scripts/resolve-xbrl-tickers.js --limit 10  # Process only 10 identifiers
 *   node scripts/resolve-xbrl-tickers.js --dry-run   # Preview without updating
 */

require('dotenv').config();

const db = require('../src/database');
const identifiers = require('../src/services/identifiers');

async function resolveXbrlTickers(options = {}) {
  const { limit = 100, dryRun = false } = options;

  const database = db.getDatabase();

  console.log('\n🔍 XBRL Ticker Resolution');
  console.log('═'.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Limit: ${limit}`);

  // Check for OpenFIGI API key
  if (!process.env.OPENFIGI_API_KEY) {
    console.log('\n⚠️  No OPENFIGI_API_KEY set - using anonymous access (lower rate limits)');
  }

  // Initialize services
  const services = identifiers.createServices(database, {
    openFigiKey: process.env.OPENFIGI_API_KEY,
    cacheTtlDays: 30
  });

  // Get identifiers that need ticker resolution (either pending or linked but no ticker)
  const pendingIdentifiers = database.prepare(`
    SELECT ci.id, ci.lei, ci.isin, ci.legal_name, ci.country, ci.exchange,
           ci.ticker, ci.yahoo_symbol, ci.link_status, ci.company_id
    FROM company_identifiers ci
    WHERE ci.ticker IS NULL OR ci.yahoo_symbol IS NULL
    ORDER BY ci.id
    LIMIT ?
  `).all(limit);

  console.log(`\nFound ${pendingIdentifiers.length} identifiers to resolve\n`);

  if (pendingIdentifiers.length === 0) {
    console.log('✅ All identifiers already have tickers resolved!');
    return;
  }

  const summary = {
    processed: 0,
    resolved: 0,
    noSymbol: 0,
    failed: 0,
    skipped: 0
  };

  const results = [];

  // Process each identifier
  for (const identifier of pendingIdentifiers) {
    summary.processed++;
    const { id, lei, legal_name, country, company_id } = identifier;

    console.log(`[${summary.processed}/${pendingIdentifiers.length}] Processing: ${legal_name || lei}`);

    try {
      // Use resolver directly to get ticker info (bypasses the "already linked" check)
      const resolution = await services.resolver.resolveFromLEI(lei);

      if (!resolution) {
        summary.failed++;
        console.log(`   ❌ LEI not found in GLEIF`);
        results.push({ id, lei, legalName: legal_name, status: 'failed', reason: 'LEI not found' });
        continue;
      }

      const primaryListing = resolution.primaryListing;

      // Validate ticker - skip invalid symbols (warrants, options, derivatives)
      const isValidTicker = (ticker) => {
        if (!ticker) return false;
        // Skip tickers with = or + (typically warrants/options like "MSMWH=3", "ABC+")
        if (ticker.includes('=') || ticker.includes('+')) return false;
        // Skip tickers that are too long (likely invalid)
        if (ticker.length > 10) return false;
        return true;
      };

      if (primaryListing && primaryListing.ticker && primaryListing.yahooSymbol && isValidTicker(primaryListing.ticker)) {
        summary.resolved++;
        console.log(`   ✅ Resolved: ${primaryListing.ticker} (${primaryListing.yahooSymbol}) on ${primaryListing.exchange}`);

        if (!dryRun) {
          // Update company_identifiers with resolved data
          database.prepare(`
            UPDATE company_identifiers
            SET ticker = ?, yahoo_symbol = ?, exchange = ?,
                figi = ?, composite_figi = ?,
                link_status = 'linked', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            primaryListing.ticker,
            primaryListing.yahooSymbol,
            primaryListing.exchange,
            primaryListing.figi || null,
            primaryListing.compositeFigi || null,
            id
          );

          // Update the companies table symbol if it's using LEI as symbol
          if (company_id) {
            const company = database.prepare('SELECT symbol FROM companies WHERE id = ?').get(company_id);
            if (company && company.symbol === lei) {
              database.prepare('UPDATE companies SET symbol = ? WHERE id = ?').run(primaryListing.ticker, company_id);
              console.log(`   📝 Updated companies.symbol: ${lei} → ${primaryListing.ticker}`);
            }
          }
        }

        results.push({
          id,
          lei,
          legalName: legal_name,
          ticker: primaryListing.ticker,
          yahooSymbol: primaryListing.yahooSymbol,
          exchange: primaryListing.exchange,
          status: 'resolved'
        });
      } else {
        summary.noSymbol++;
        console.log(`   ⚠️  No tradeable symbol found (${resolution.listings?.length || 0} listings checked)`);

        if (!dryRun) {
          database.prepare(`
            UPDATE company_identifiers
            SET link_status = 'no_symbol', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(id);
        }

        results.push({ id, lei, legalName: legal_name, status: 'no_symbol' });
      }

      // Rate limiting - OpenFIGI anonymous limit is 5 req/min
      // Wait 13 seconds between calls to stay well under the limit
      const waitMs = process.env.OPENFIGI_API_KEY ? 500 : 13000;
      await new Promise(resolve => setTimeout(resolve, waitMs));

    } catch (error) {
      summary.failed++;
      console.log(`   ❌ Error: ${error.message}`);

      results.push({
        id,
        lei,
        legalName: legal_name,
        status: 'error',
        error: error.message
      });
    }
  }

  // Print summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Summary');
  console.log('═'.repeat(50));
  console.log(`Processed:    ${summary.processed}`);
  console.log(`Resolved:     ${summary.resolved} ✅`);
  console.log(`No Symbol:    ${summary.noSymbol} ⚠️`);
  console.log(`Failed:       ${summary.failed} ❌`);

  // Show resolved tickers
  const resolved = results.filter(r => r.status === 'resolved');
  if (resolved.length > 0) {
    console.log('\n📈 Resolved Tickers:');
    console.log('-'.repeat(70));
    for (const r of resolved) {
      const symbol = (r.yahooSymbol || 'N/A').padEnd(12);
      const name = (r.legalName || 'Unknown').substring(0, 40).padEnd(42);
      const exchange = r.exchange || 'N/A';
      console.log(`  ${symbol} ${name} (${exchange})`);
    }
  }

  // Show companies without symbols
  const noSymbol = results.filter(r => r.status === 'no_symbol');
  if (noSymbol.length > 0) {
    console.log('\n⚠️  Companies without tradeable symbols:');
    console.log('-'.repeat(70));
    for (const r of noSymbol) {
      console.log(`  ${r.lei} - ${r.legalName?.substring(0, 50)}`);
    }
  }

  // Final status
  console.log('\n' + '═'.repeat(50));

  if (dryRun) {
    console.log('ℹ️  Dry run complete - no changes made');
    console.log('   Run without --dry-run to apply changes');
  } else {
    // Verify final state
    const statusCounts = database.prepare(`
      SELECT link_status, COUNT(*) as count
      FROM company_identifiers
      GROUP BY link_status
    `).all();

    console.log('\n📊 Final Status:');
    for (const { link_status, count } of statusCounts) {
      console.log(`  ${link_status}: ${count}`);
    }
  }

  console.log('\n✅ Done!\n');

  return results;
}

// Parse command line args
const args = process.argv.slice(2);
const options = {
  limit: 100,
  dryRun: false
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--dry-run') {
    options.dryRun = true;
  }
}

// Run
resolveXbrlTickers(options)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
