/**
 * Background job to refresh earnings calendar data
 *
 * Can be run:
 * 1. Manually: node src/jobs/earningsRefresh.js
 * 2. Via cron: Add to crontab or use node-cron
 * 3. Via API: POST /api/earnings/refresh
 *
 * Stores earnings data in the database so calendar views load instantly
 * without needing to fetch from Yahoo Finance each time.
 */

const db = require('../database');
const EarningsCalendarService = require('../services/earningsCalendar');

const database = db.getDatabase();
let earningsService;

try {
  earningsService = new EarningsCalendarService(database);
  earningsService.createTable();
} catch (error) {
  console.error('Failed to initialize earnings service:', error.message);
  process.exit(1);
}

/**
 * Refresh earnings data for companies that need updating
 */
async function refreshEarnings(options = {}) {
  const {
    maxCompanies = 100,
    staleHours = 12,
    delayBetweenMs = 500,
    prioritizeWatchlist = true,
    onlyWithAnalysts = true
  } = options;

  console.log(`\n📅 Refreshing earnings calendar data...`);
  console.log(`   Stale threshold: ${staleHours} hours`);
  console.log(`   Max companies: ${maxCompanies}`);

  try {
    // Build query for companies needing refresh
    let query = `
      SELECT DISTINCT c.id, c.symbol, c.name, c.sector,
             ec.fetched_at as last_fetched,
             CASE WHEN w.company_id IS NOT NULL THEN 1 ELSE 0 END as in_watchlist
      FROM companies c
      LEFT JOIN earnings_calendar ec ON ec.company_id = c.id
      LEFT JOIN watchlist w ON w.company_id = c.id
    `;

    const conditions = [
      `c.symbol IS NOT NULL`,
      `c.symbol NOT LIKE 'CIK_%'`,
      `c.is_active = 1`
    ];

    // Only companies with analyst coverage (more likely to have earnings data)
    if (onlyWithAnalysts) {
      query = query.replace('LEFT JOIN earnings_calendar', `
        INNER JOIN analyst_estimates ae ON ae.company_id = c.id
        LEFT JOIN earnings_calendar`);
    }

    // Filter for stale or missing data
    conditions.push(`(
      ec.fetched_at IS NULL
      OR ec.fetched_at < datetime('now', '-${staleHours} hours')
    )`);

    query += ` WHERE ${conditions.join(' AND ')}`;

    // Order: watchlist first, then by staleness
    if (prioritizeWatchlist) {
      query += ` ORDER BY in_watchlist DESC, ec.fetched_at ASC NULLS FIRST`;
    } else {
      query += ` ORDER BY ec.fetched_at ASC NULLS FIRST`;
    }

    query += ` LIMIT ?`;

    const companies = database.prepare(query).all(maxCompanies);

    console.log(`   Found ${companies.length} companies to refresh\n`);

    if (companies.length === 0) {
      console.log('✅ All earnings data is up to date!');
      return { refreshed: 0, errors: 0, skipped: 0 };
    }

    let refreshed = 0;
    let errors = 0;
    let skipped = 0;

    for (const company of companies) {
      try {
        const status = company.in_watchlist ? '⭐' : '  ';
        process.stdout.write(`${status} ${company.symbol.padEnd(6)} `);

        // Fetch from Yahoo Finance
        const data = await earningsService.fetchEarningsData(company.symbol);

        if (data) {
          // Store in database
          earningsService.storeEarningsData(company.id, data);

          const nextDate = data.nextEarnings?.date
            ? new Date(data.nextEarnings.date).toISOString().split('T')[0]
            : 'N/A';

          console.log(`✓ Next: ${nextDate}, Beat rate: ${data.stats?.beatRate?.toFixed(0) || 'N/A'}%`);
          refreshed++;
        } else {
          console.log(`- No data available`);
          skipped++;
        }

        // Rate limit
        if (delayBetweenMs > 0) {
          await new Promise(r => setTimeout(r, delayBetweenMs));
        }

      } catch (error) {
        console.log(`✗ Error: ${error.message}`);
        errors++;
      }
    }

    console.log(`\n📊 Earnings refresh complete:`);
    console.log(`   ✓ Refreshed: ${refreshed}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   ✗ Errors: ${errors}`);

    return { refreshed, errors, skipped };

  } catch (error) {
    console.error('Error in earnings refresh:', error);
    throw error;
  }
}

/**
 * Refresh only watchlist companies (faster)
 */
async function refreshWatchlistEarnings(options = {}) {
  const {
    staleHours = 6,
    delayBetweenMs = 300
  } = options;

  console.log(`\n⭐ Refreshing watchlist earnings...`);

  try {
    const watchlist = database.prepare(`
      SELECT c.id, c.symbol, c.name,
             ec.fetched_at as last_fetched
      FROM watchlist w
      JOIN companies c ON c.id = w.company_id
      LEFT JOIN earnings_calendar ec ON ec.company_id = c.id
      WHERE ec.fetched_at IS NULL
         OR ec.fetched_at < datetime('now', '-${staleHours} hours')
      ORDER BY w.added_at DESC
    `).all();

    console.log(`   Found ${watchlist.length} watchlist companies to refresh\n`);

    let refreshed = 0;
    let errors = 0;

    for (const company of watchlist) {
      try {
        process.stdout.write(`⭐ ${company.symbol.padEnd(6)} `);

        const data = await earningsService.fetchEarningsData(company.symbol);

        if (data) {
          earningsService.storeEarningsData(company.id, data);

          const nextDate = data.nextEarnings?.date
            ? new Date(data.nextEarnings.date).toISOString().split('T')[0]
            : 'N/A';

          console.log(`✓ Next: ${nextDate}`);
          refreshed++;
        } else {
          console.log(`- No data`);
        }

        if (delayBetweenMs > 0) {
          await new Promise(r => setTimeout(r, delayBetweenMs));
        }

      } catch (error) {
        console.log(`✗ ${error.message}`);
        errors++;
      }
    }

    console.log(`\n✅ Watchlist earnings refresh complete: ${refreshed} updated, ${errors} errors`);
    return { refreshed, errors };

  } catch (error) {
    console.error('Error refreshing watchlist earnings:', error);
    throw error;
  }
}

/**
 * Get summary of stored earnings data
 */
function getEarningsSummary() {
  const stats = database.prepare(`
    SELECT
      COUNT(*) as total_stored,
      COUNT(CASE WHEN fetched_at >= datetime('now', '-24 hours') THEN 1 END) as fresh_24h,
      COUNT(CASE WHEN fetched_at >= datetime('now', '-7 days') THEN 1 END) as fresh_7d,
      COUNT(CASE WHEN next_earnings_date >= date('now')
                  AND next_earnings_date <= date('now', '+7 days') THEN 1 END) as earnings_this_week,
      COUNT(CASE WHEN next_earnings_date >= date('now')
                  AND next_earnings_date <= date('now', '+30 days') THEN 1 END) as earnings_this_month,
      MIN(fetched_at) as oldest_fetch,
      MAX(fetched_at) as newest_fetch
    FROM earnings_calendar
  `).get();

  const watchlistCoverage = database.prepare(`
    SELECT
      COUNT(*) as total_watchlist,
      COUNT(ec.id) as with_earnings_data,
      COUNT(CASE WHEN ec.fetched_at >= datetime('now', '-24 hours') THEN 1 END) as fresh_24h
    FROM watchlist w
    JOIN companies c ON c.id = w.company_id
    LEFT JOIN earnings_calendar ec ON ec.company_id = c.id
  `).get();

  return { overall: stats, watchlist: watchlistCoverage };
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'refresh';

  console.log('═══════════════════════════════════════════════════');
  console.log('           EARNINGS CALENDAR REFRESH JOB           ');
  console.log('═══════════════════════════════════════════════════');

  try {
    switch (command) {
      case 'watchlist':
        await refreshWatchlistEarnings();
        break;

      case 'full':
        await refreshEarnings({
          maxCompanies: 200,
          staleHours: 24,
          onlyWithAnalysts: false
        });
        break;

      case 'stats':
        const summary = getEarningsSummary();
        console.log('\n📊 Earnings Data Summary:');
        console.log(`   Total stored: ${summary.overall.total_stored}`);
        console.log(`   Fresh (24h): ${summary.overall.fresh_24h}`);
        console.log(`   Fresh (7d): ${summary.overall.fresh_7d}`);
        console.log(`   Earnings this week: ${summary.overall.earnings_this_week}`);
        console.log(`   Earnings this month: ${summary.overall.earnings_this_month}`);
        console.log(`\n⭐ Watchlist Coverage:`);
        console.log(`   Total: ${summary.watchlist.total_watchlist}`);
        console.log(`   With data: ${summary.watchlist.with_earnings_data}`);
        console.log(`   Fresh (24h): ${summary.watchlist.fresh_24h}`);
        break;

      case 'refresh':
      default:
        await refreshEarnings({
          maxCompanies: 100,
          staleHours: 12,
          prioritizeWatchlist: true
        });
        break;
    }

    console.log('\n═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Job failed:', error);
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  refreshEarnings,
  refreshWatchlistEarnings,
  getEarningsSummary
};

// Run if called directly
if (require.main === module) {
  main().then(() => process.exit(0));
}
