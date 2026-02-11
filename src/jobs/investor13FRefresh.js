/**
 * 13F Filing Refresh Job
 * Fetches and updates famous investor holdings from SEC 13F filings
 *
 * Schedule:
 *   - Primary: 15th of Feb, May, Aug, Nov (45 days after quarter end)
 *   - Fallback: Weekly check for any missed filings
 *
 * Usage:
 *   node src/jobs/investor13FRefresh.js              # Run scheduler daemon
 *   node src/jobs/investor13FRefresh.js --now        # Run update immediately
 *   node src/jobs/investor13FRefresh.js --investor 1 # Update specific investor
 *   node src/jobs/investor13FRefresh.js --status     # Check status
 */

const cron = require('node-cron');
const { getDatabaseAsync } = require('../lib/db');
const investorService = require('../services/portfolio/investorService');

class Investor13FRefresh {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
    this.databasePromise = null;
  }

  async getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = getDatabaseAsync();
    }
    return this.databasePromise;
  }

  /**
   * Fetch 13F filings for all active investors
   */
  async fetchAll() {
    if (this.isRunning) {
      throw new Error('13F fetch already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] Starting 13F filing refresh...`);
    console.log('='.repeat(60));

    try {
      const results = await investorService.fetchAll13Fs();

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      this.lastRun = new Date().toISOString();
      this.lastResult = {
        success: true,
        duration: `${duration}s`,
        ...results
      };

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${new Date().toISOString()}] 13F refresh completed in ${duration}s`);
      console.log(`Results: ${results.processed} processed, ${results.updated} updated, ${results.failed} failed`);
      console.log('='.repeat(60));

      return this.lastResult;
    } catch (error) {
      this.lastResult = {
        success: false,
        error: error.message
      };
      console.error('13F refresh failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Fetch 13F for a specific investor
   */
  async fetchSingle(investorId) {
    console.log(`\n[${new Date().toISOString()}] Fetching 13F for investor ${investorId}...`);

    try {
      const result = await investorService.fetch13F(investorId);
      console.log('Result:', result);
      return result;
    } catch (error) {
      console.error(`Failed to fetch 13F for investor ${investorId}:`, error);
      throw error;
    }
  }

  /**
   * Get status of the refresh job
   */
  async getStatus() {
    const database = await this.getDatabase();
    const investorsResult = await database.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        MAX(latest_filing_date) as latest_filing
      FROM famous_investors
    `);
    const investors = investorsResult.rows[0];

    const recentFilingsResult = await database.query(`
      SELECT f.investor_id, i.name, f.report_date, f.filing_date, f.form_type
      FROM investor_filings f
      JOIN famous_investors i ON i.id = f.investor_id
      ORDER BY f.filing_date DESC
      LIMIT 5
    `);
    const recentFilings = recentFilingsResult.rows;

    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      investors,
      recentFilings
    };
  }

  /**
   * Start the scheduler
   */
  start() {
    console.log('Starting 13F Filing Refresh Scheduler...');
    console.log('Schedule:');
    console.log('  - Primary: 15th of Feb, May, Aug, Nov at 9:00 AM ET');
    console.log('  - Weekly: Every Sunday at 6:00 AM ET');

    // Primary schedule: 15th of filing months (45 days after quarter end)
    // Feb, May, Aug, Nov are the 13F deadline months
    cron.schedule('0 9 15 2,5,8,11 *', async () => {
      console.log('\n[SCHEDULED] Running primary quarterly 13F refresh...');
      try {
        await this.fetchAll();
      } catch (error) {
        console.error('Scheduled 13F refresh failed:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    // Weekly fallback: Check for any new filings every Sunday
    cron.schedule('0 6 * * 0', async () => {
      console.log('\n[SCHEDULED] Running weekly 13F check...');
      try {
        await this.fetchAll();
      } catch (error) {
        console.error('Weekly 13F check failed:', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    console.log('Scheduler started. Press Ctrl+C to stop.');
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const scheduler = new Investor13FRefresh();

  if (args.includes('--now')) {
    scheduler.fetchAll()
      .then(result => {
        console.log('Refresh completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Refresh failed:', error);
        process.exit(1);
      });
  } else if (args.includes('--investor')) {
    const investorIdx = args.indexOf('--investor');
    const investorId = parseInt(args[investorIdx + 1]);

    if (!investorId) {
      console.error('Please provide an investor ID: --investor <id>');
      process.exit(1);
    }

    scheduler.fetchSingle(investorId)
      .then(result => {
        console.log('Fetch completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Fetch failed:', error);
        process.exit(1);
      });
  } else if (args.includes('--status')) {
    const status = await scheduler.getStatus();
    console.log('\n13F Refresh Status:');
    console.log('='.repeat(40));
    console.log('Running:', status.isRunning);
    console.log('Last Run:', status.lastRun || 'Never');
    console.log('\nInvestors:');
    console.log(`  Total: ${status.investors.total}`);
    console.log(`  Active: ${status.investors.active}`);
    console.log(`  Latest Filing: ${status.investors.latest_filing || 'None'}`);
    console.log('\nRecent Filings:');
    status.recentFilings.forEach(f => {
      console.log(`  - ${f.name}: ${f.form_type} (${f.report_date})`);
    });
    process.exit(0);
  } else {
    scheduler.start();
  }
}

module.exports = Investor13FRefresh;
