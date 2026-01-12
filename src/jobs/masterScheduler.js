/**
 * Master Scheduler
 *
 * Unified scheduler for all automated jobs in the Investment Project.
 * Runs as a single daemon process managing all scheduled tasks.
 *
 * Jobs included:
 * - Price updates (weekdays 6 PM ET)
 * - Sentiment refresh (every 4 hours)
 * - Knowledge base refresh (daily 6 AM, full weekly Sunday 3 AM)
 * - SEC filing checks (weekdays 7 PM ET)
 * - Dividend data refresh (weekly Sunday 4 AM ET)
 *
 * Usage:
 *   node src/jobs/masterScheduler.js              # Start scheduler daemon
 *   node src/jobs/masterScheduler.js --status     # Show all job statuses
 *   node src/jobs/masterScheduler.js --run-all    # Run all jobs immediately
 *   node src/jobs/masterScheduler.js --list       # List scheduled jobs
 */

const cron = require('node-cron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Import individual job modules
const PriceUpdateScheduler = require('./priceUpdateScheduler');
const KnowledgeBaseRefresh = require('./knowledgeBaseRefresh');
const { getETFUpdateScheduler } = require('./etfUpdateScheduler');
const Investor13FRefresh = require('./investor13FRefresh');
const { refreshEarnings } = require('./earningsRefresh');
const { XBRLBulkImporter } = require('../services/xbrl/xbrlBulkImporter');

class MasterScheduler {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.logDir = path.join(this.projectRoot, 'logs');
    this.statusFile = path.join(this.projectRoot, 'data/scheduler_status.json');

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Initialize job instances
    this.priceUpdater = new PriceUpdateScheduler();
    this.knowledgeRefresher = new KnowledgeBaseRefresh();
    this.etfUpdater = getETFUpdateScheduler();
    this.investor13FRefresher = new Investor13FRefresh();

    // Track running jobs
    this.runningJobs = new Set();
    this.jobHistory = [];

    // Load existing status
    this.loadStatus();
  }

  /**
   * Log message with timestamp
   */
  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}`;
    console.log(logLine);

    // Also write to log file
    const logFile = path.join(this.logDir, `scheduler-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, logLine + '\n');
  }

  /**
   * Load status from file
   */
  loadStatus() {
    try {
      if (fs.existsSync(this.statusFile)) {
        const data = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        this.jobHistory = data.history || [];
      }
    } catch (e) {
      this.log(`Could not load status: ${e.message}`, 'WARN');
    }
  }

  /**
   * Save status to file
   */
  saveStatus() {
    try {
      const status = {
        lastUpdated: new Date().toISOString(),
        runningJobs: Array.from(this.runningJobs),
        history: this.jobHistory.slice(0, 100) // Keep last 100 entries
      };
      fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2));
    } catch (e) {
      this.log(`Could not save status: ${e.message}`, 'WARN');
    }
  }

  /**
   * Record job execution
   */
  recordJobRun(jobName, success, duration, message = '') {
    this.jobHistory.unshift({
      job: jobName,
      timestamp: new Date().toISOString(),
      success,
      duration,
      message
    });
    this.saveStatus();
  }

  /**
   * Run a job with tracking
   */
  async runJob(jobName, jobFn) {
    if (this.runningJobs.has(jobName)) {
      this.log(`${jobName} is already running, skipping`, 'WARN');
      return;
    }

    this.runningJobs.add(jobName);
    this.saveStatus();

    const startTime = Date.now();
    this.log(`Starting ${jobName}...`);

    try {
      await jobFn();
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      this.log(`${jobName} completed successfully (${duration} min)`);
      this.recordJobRun(jobName, true, `${duration} min`);
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      this.log(`${jobName} failed: ${error.message}`, 'ERROR');
      this.recordJobRun(jobName, false, `${duration} min`, error.message);
    } finally {
      this.runningJobs.delete(jobName);
      this.saveStatus();
    }
  }

  /**
   * Run sentiment refresh job
   */
  async runSentimentRefresh() {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'sentimentRefresh.js');
      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Sentiment refresh failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run SEC refresh job
   */
  async runSecRefresh() {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'secDirectRefresh.js');
      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`SEC refresh failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run dividend data refresh job
   * Fetches dividend history and metrics from Yahoo Finance
   */
  async runDividendRefresh(sp500Only = true) {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'python-services', 'dividend_fetcher.py');
      const args = sp500Only ? ['sp500'] : ['fetch'];
      const child = spawn('python3', [script, ...args], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Dividend refresh failed with code ${code}: ${output}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Process portfolio dividends
   * Credits dividends to portfolios when stocks go ex-dividend
   */
  async processPortfolioDividends(lookbackDays = 7) {
    const { getDatabase } = require('../database');
    const { getDividendProcessor } = require('../services/portfolio/dividendProcessor');

    const db = getDatabase();
    const processor = getDividendProcessor(db);

    const result = processor.processAllDividends({ lookbackDays });

    this.log(`Portfolio dividends processed: ${result.dividendsProcessed} dividends, $${result.totalAmount.toFixed(2)} total`);
    if (result.dripShares > 0) {
      this.log(`DRIP shares purchased: ${result.dripShares.toFixed(4)}`);
    }
    if (result.errors.length > 0) {
      this.log(`Dividend processing errors: ${result.errors.length}`, 'WARN');
    }

    return result;
  }

  /**
   * Run EU/UK price update
   * Updates prices for European companies with valid tickers
   */
  async runEuropeanPriceUpdate(countries = ['GB']) {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'python-services', 'price_updater.py');
      // Use test-country to bypass weekend check and update all EU/UK
      const child = spawn('python3', [script, 'test-country', '-c', countries[0], '-l', '1000'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
        // Log progress
        const lines = data.toString().split('\n').filter(l => l.trim());
        lines.forEach(line => {
          if (line.includes('Batch') || line.includes('Summary')) {
            this.log(`EU/UK Prices: ${line}`);
          }
        });
      });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          // Parse results from output
          const successMatch = output.match(/Successful: (\d+)/);
          const failedMatch = output.match(/Failed: (\d+)/);
          resolve({
            successful: successMatch ? parseInt(successMatch[1]) : 0,
            failed: failedMatch ? parseInt(failedMatch[1]) : 0,
            output
          });
        } else {
          reject(new Error(`EU/UK price update failed with code ${code}: ${output}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run European index constituents update
   * Fetches FTSE 100, DAX 40, CAC 40 constituents and marks companies
   */
  async runEuropeanIndexUpdate() {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'python-services', 'european_index_fetcher.py');
      const child = spawn('python3', [script, 'all'], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          this.log('European index constituents updated');
          resolve(output);
        } else {
          reject(new Error(`European index update failed with code ${code}: ${output}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Run valuation calculation for EU/UK companies
   * Calculates PE, PB, PS ratios using price data and XBRL fundamentals
   */
  async runEuropeanValuationUpdate() {
    const { getDatabase } = require('../database');
    const { ValuationService } = require('../services/xbrl');

    const database = getDatabase();
    const valuationService = new ValuationService(database);

    this.log('Starting EU/UK valuation calculation...');
    const result = valuationService.updateAllValuations();
    this.log(`Valuation update complete: ${result.updated} companies updated, ${result.errors} errors`);

    return result;
  }

  /**
   * Run sector/industry enrichment for EU/UK companies
   * Fetches missing sector/industry data from Yahoo Finance
   */
  async runEuropeanEnrichment() {
    const { getDatabase } = require('../database');
    const { EnrichmentService } = require('../services/xbrl');

    const database = getDatabase();
    const enrichmentService = new EnrichmentService(database);

    this.log('Starting EU/UK sector enrichment...');
    const result = await enrichmentService.enrichAllWithoutSector({ limit: 100 });
    this.log(`Enrichment complete: ${result.enriched} companies enriched, ${result.failed} failed`);

    return result;
  }

  /**
   * Run XBRL EU/UK bulk import
   * Imports XBRL filings from filings.xbrl.org for EU/UK companies
   */
  async runXBRLImport(options = {}) {
    const { getDatabase } = require('../database');
    const database = getDatabase();

    const importer = new XBRLBulkImporter(database, {
      startYear: options.startYear || 2021,
      batchSize: options.batchSize || 100
    });

    const countries = options.countries || ['GB', 'DE', 'FR', 'NL', 'SE'];

    this.log(`Starting EU/UK XBRL import for countries: ${countries.join(', ')}`);

    const results = await importer.importAllEuropeUK({
      countries,
      startYear: options.startYear || 2021,
      progressCallback: (progress) => {
        if (progress.stats.processed % 100 === 0) {
          this.log(`XBRL Progress: ${progress.currentCountry} - ${progress.stats.processed} processed, ${progress.stats.parsed} parsed`);
        }
      }
    });

    this.log(`XBRL Import complete: ${results.totals.processed} filings, ${results.totals.parsed} parsed, ${results.totals.errors} errors`);
    return results;
  }

  /**
   * Run insider transactions refresh
   * Fetches recent Form 4 filings for tracked companies
   */
  async runInsiderRefresh() {
    const InsiderTracker = require('../services/insiderTracker');
    const SECFilingFetcher = require('../services/secFilingFetcher');
    const db = require('../database');

    const database = db.getDatabase();
    const secFetcher = new SECFilingFetcher();
    const insiderTracker = new InsiderTracker(secFetcher);

    // Get top companies by market cap to check for insider activity
    const companies = database.prepare(`
      SELECT id, symbol, cik
      FROM companies
      WHERE cik IS NOT NULL AND market_cap > 1000000000
      ORDER BY market_cap DESC
      LIMIT 100
    `).all();

    this.log(`Checking insider transactions for ${companies.length} companies...`);

    let processed = 0;
    let updated = 0;

    for (const company of companies) {
      try {
        const result = await insiderTracker.fetchRecentFilings(company.id, company.cik, 7);
        if (result && result.length > 0) {
          updated += result.length;
        }
        processed++;

        // Rate limiting for SEC
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        this.log(`Error fetching insider data for ${company.symbol}: ${error.message}`, 'WARN');
      }
    }

    this.log(`Insider refresh complete: ${processed} companies checked, ${updated} new transactions`);
    return { processed, updated };
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    return {
      isRunning: true,
      runningJobs: Array.from(this.runningJobs),
      recentHistory: this.jobHistory.slice(0, 20),
      scheduledJobs: [
        { name: 'Price Update', schedule: 'Weekdays 6:00 PM ET' },
        { name: 'Price Backfill', schedule: 'Weekends 12:00 PM ET' },
        { name: 'Sentiment Refresh', schedule: 'Every 4 hours' },
        { name: 'Knowledge Base (Incremental)', schedule: 'Mon-Sat 6:00 AM ET' },
        { name: 'Knowledge Base (Full)', schedule: 'Sunday 3:00 AM ET' },
        { name: 'SEC Filing Check', schedule: 'Weekdays 7:00 PM ET' },
        { name: 'Dividend Refresh', schedule: 'Sunday 4:00 AM ET' },
        { name: 'Portfolio Dividend Processing', schedule: 'Weekdays 6:30 PM ET' },
        { name: 'ETF Update (Tier 1)', schedule: 'Weekdays 6:30 AM ET' },
        { name: 'ETF Update (Tier 2)', schedule: 'Saturday 8:00 AM ET' },
        { name: 'ETF Tier 3 Promotion', schedule: 'Sunday 7:00 AM ET' },
        { name: '13F Holdings Update', schedule: '15th of Feb/May/Aug/Nov 9 AM ET' },
        { name: '13F Holdings Check', schedule: 'Sunday 8 AM ET' },
        { name: 'Insider Transactions', schedule: 'Weekdays 7:30 PM ET' },
        { name: 'Earnings Calendar', schedule: 'Daily 5 AM ET' },
        { name: 'EU/UK XBRL Import', schedule: 'Sunday 2:00 AM ET' },
        { name: 'EU/UK Price Update (GB)', schedule: 'Weekdays 12:00 PM ET (5 PM GMT)' },
        { name: 'EU/UK Price Update (EU)', schedule: 'Weekdays 11:30 AM ET (5:30 PM CET)' },
        { name: 'EU/UK Valuation Update', schedule: 'Weekdays 12:30 PM ET' },
        { name: 'European Index Update', schedule: 'Sunday 5:00 AM ET' },
        { name: 'EU/UK Sector Enrichment', schedule: 'Sunday 6:00 AM ET' }
      ]
    };
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    this.log('=' .repeat(60));
    this.log('  Master Scheduler Started');
    this.log('='.repeat(60));
    this.log(`Project root: ${this.projectRoot}`);
    this.log(`Log directory: ${this.logDir}`);
    this.log('');

    // ============================================
    // PRICE UPDATES
    // ============================================

    // Weekdays at 6:00 PM ET - Daily price update
    cron.schedule('0 18 * * 1-5', async () => {
      await this.runJob('Price Update', async () => {
        await this.priceUpdater.runUpdate('update');
      });
    }, { timezone: 'America/New_York' });

    // Weekends at 12:00 PM ET - Backfill
    cron.schedule('0 12 * * 0,6', async () => {
      await this.runJob('Price Backfill', async () => {
        await this.priceUpdater.runUpdate('backfill');
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Price Update (Weekdays 6:00 PM ET)');
    this.log('Scheduled: Price Backfill (Weekends 12:00 PM ET)');

    // ============================================
    // SENTIMENT REFRESH
    // ============================================

    // Every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      await this.runJob('Sentiment Refresh', async () => {
        await this.runSentimentRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Sentiment Refresh (Every 4 hours)');

    // ============================================
    // KNOWLEDGE BASE
    // ============================================

    // Mon-Sat at 6:00 AM ET - Incremental refresh (tech sources)
    cron.schedule('0 6 * * 1-6', async () => {
      await this.runJob('Knowledge Base (Incremental)', async () => {
        await this.knowledgeRefresher.runIncrementalRefresh();
      });
    }, { timezone: 'America/New_York' });

    // Sunday at 3:00 AM ET - Full refresh (all sources)
    cron.schedule('0 3 * * 0', async () => {
      await this.runJob('Knowledge Base (Full)', async () => {
        await this.knowledgeRefresher.runFullRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Knowledge Base Incremental (Mon-Sat 6:00 AM ET)');
    this.log('Scheduled: Knowledge Base Full (Sunday 3:00 AM ET)');

    // ============================================
    // SEC FILING CHECKS
    // ============================================

    // Weekdays at 7:00 PM ET - Check for new filings
    cron.schedule('0 19 * * 1-5', async () => {
      await this.runJob('SEC Filing Check', async () => {
        await this.runSecRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: SEC Filing Check (Weekdays 7:00 PM ET)');

    // ============================================
    // DIVIDEND DATA REFRESH
    // ============================================

    // Sunday at 4:00 AM ET - Weekly dividend data refresh (S&P 500)
    cron.schedule('0 4 * * 0', async () => {
      await this.runJob('Dividend Refresh', async () => {
        await this.runDividendRefresh(true);
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Dividend Refresh (Sunday 4:00 AM ET)');

    // ============================================
    // PORTFOLIO DIVIDEND PROCESSING
    // ============================================

    // Weekdays at 6:30 PM ET - Process portfolio dividends (after price update)
    cron.schedule('30 18 * * 1-5', async () => {
      await this.runJob('Portfolio Dividend Processing', async () => {
        await this.processPortfolioDividends();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Portfolio Dividend Processing (Weekdays 6:30 PM ET)');

    // ============================================
    // ETF UPDATES
    // ============================================

    // Weekdays at 6:30 AM ET - Tier 1 (curated) ETF update
    cron.schedule('30 6 * * 1-5', async () => {
      await this.runJob('ETF Update (Tier 1)', async () => {
        await this.etfUpdater.updateTier1();
      });
    }, { timezone: 'America/New_York' });

    // Saturday at 8:00 AM ET - Tier 2 (indexed) ETF update
    cron.schedule('0 8 * * 6', async () => {
      await this.runJob('ETF Update (Tier 2)', async () => {
        await this.etfUpdater.updateTier2();
      });
    }, { timezone: 'America/New_York' });

    // Sunday at 7:00 AM ET - Tier 3 promotion check
    cron.schedule('0 7 * * 0', async () => {
      await this.runJob('ETF Tier 3 Promotion', async () => {
        await this.etfUpdater.promoteTier3();
        await this.etfUpdater.updateIssuerStats();
        this.etfUpdater.cleanupOldLogs();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: ETF Update Tier 1 (Weekdays 6:30 AM ET)');
    this.log('Scheduled: ETF Update Tier 2 (Saturday 8:00 AM ET)');
    this.log('Scheduled: ETF Tier 3 Promotion (Sunday 7:00 AM ET)');

    // ============================================
    // 13F INSTITUTIONAL HOLDINGS
    // ============================================

    // 15th of Feb, May, Aug, Nov at 9 AM ET - Primary 13F filing deadline
    // These are 45 days after quarter end when 13F filings are due
    cron.schedule('0 9 15 2,5,8,11 *', async () => {
      await this.runJob('13F Holdings Update', async () => {
        await this.investor13FRefresher.fetchAll();
      });
    }, { timezone: 'America/New_York' });

    // Weekly fallback check on Sundays at 8 AM ET for any missed filings
    cron.schedule('0 8 * * 0', async () => {
      await this.runJob('13F Holdings Check', async () => {
        await this.investor13FRefresher.fetchAll();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: 13F Holdings Update (15th of Feb/May/Aug/Nov 9 AM ET)');
    this.log('Scheduled: 13F Holdings Check (Sunday 8 AM ET)');

    // ============================================
    // INSIDER TRANSACTIONS
    // ============================================

    // Weekdays at 7:30 PM ET - After market close, check for new Form 4 filings
    cron.schedule('30 19 * * 1-5', async () => {
      await this.runJob('Insider Transactions', async () => {
        await this.runInsiderRefresh();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Insider Transactions (Weekdays 7:30 PM ET)');

    // ============================================
    // EARNINGS CALENDAR
    // ============================================

    // Daily at 5 AM ET - Refresh earnings calendar and momentum data
    cron.schedule('0 5 * * *', async () => {
      await this.runJob('Earnings Calendar', async () => {
        await refreshEarnings({ maxCompanies: 200, staleHours: 12 });
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: Earnings Calendar (Daily 5 AM ET)');

    // ============================================
    // XBRL EU/UK DATA IMPORT
    // ============================================

    // Sunday at 2 AM ET - EU/UK XBRL bulk import (low-traffic period)
    cron.schedule('0 2 * * 0', async () => {
      await this.runJob('EU/UK XBRL Import', async () => {
        await this.runXBRLImport({
          countries: ['GB', 'DE', 'FR', 'NL', 'SE', 'CH', 'ES', 'IT', 'BE', 'DK'],
          startYear: 2021
        });
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK XBRL Import (Sunday 2 AM ET)');

    // ============================================
    // EU/UK PRICE UPDATES
    // ============================================

    // Weekdays at 5:00 PM GMT (12:00 PM ET) - UK market close
    // Updates GB companies after LSE closes
    cron.schedule('0 12 * * 1-5', async () => {
      await this.runJob('EU/UK Price Update (GB)', async () => {
        await this.runEuropeanPriceUpdate(['GB']);
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Price Update GB (Weekdays 12:00 PM ET / 5:00 PM GMT)');

    // Weekdays at 5:30 PM CET (11:30 AM ET) - European market close
    // Updates DE, FR, NL, etc. companies after XETRA/Euronext closes
    cron.schedule('30 11 * * 1-5', async () => {
      await this.runJob('EU/UK Price Update (EU)', async () => {
        // Run for each major EU country
        for (const country of ['DE', 'FR', 'NL', 'CH', 'ES', 'IT']) {
          try {
            await this.runEuropeanPriceUpdate([country]);
          } catch (e) {
            this.log(`Price update failed for ${country}: ${e.message}`, 'WARN');
          }
        }
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Price Update EU (Weekdays 11:30 AM ET / 5:30 PM CET)');

    // ============================================
    // EU/UK VALUATION CALCULATION
    // ============================================

    // Weekdays at 12:30 PM ET - After EU/UK price updates
    cron.schedule('30 12 * * 1-5', async () => {
      await this.runJob('EU/UK Valuation Update', async () => {
        await this.runEuropeanValuationUpdate();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Valuation Update (Weekdays 12:30 PM ET)');

    // ============================================
    // EUROPEAN INDEX CONSTITUENTS
    // ============================================

    // Sunday at 5:00 AM ET - Update FTSE/DAX/CAC constituents weekly
    cron.schedule('0 5 * * 0', async () => {
      await this.runJob('European Index Update', async () => {
        await this.runEuropeanIndexUpdate();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: European Index Update (Sunday 5:00 AM ET)');

    // ============================================
    // EU/UK SECTOR ENRICHMENT
    // ============================================

    // Sunday at 6:00 AM ET - Enrich missing sector/industry data
    cron.schedule('0 6 * * 0', async () => {
      await this.runJob('EU/UK Sector Enrichment', async () => {
        await this.runEuropeanEnrichment();
      });
    }, { timezone: 'America/New_York' });

    this.log('Scheduled: EU/UK Sector Enrichment (Sunday 6:00 AM ET)');

    // ============================================
    // HEALTH CHECK
    // ============================================

    // Every hour - log that scheduler is alive
    cron.schedule('0 * * * *', () => {
      this.log('Scheduler heartbeat - all systems operational');
      this.saveStatus();
    });

    this.log('');
    this.log('All jobs scheduled. Press Ctrl+C to stop.');
    this.log('='.repeat(60));

    // Graceful shutdown
    process.on('SIGINT', () => {
      this.log('Received SIGINT, shutting down gracefully...');
      this.saveStatus();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, shutting down gracefully...');
      this.saveStatus();
      process.exit(0);
    });
  }

  /**
   * Run all jobs immediately (for testing)
   */
  async runAll() {
    this.log('Running all jobs immediately...');

    await this.runJob('Price Update', async () => {
      await this.priceUpdater.runUpdate('update');
    });

    await this.runJob('Sentiment Refresh', async () => {
      await this.runSentimentRefresh();
    });

    await this.runJob('Knowledge Base (Incremental)', async () => {
      await this.knowledgeRefresher.runIncrementalRefresh();
    });

    await this.runJob('SEC Filing Check', async () => {
      await this.runSecRefresh();
    });

    await this.runJob('13F Holdings Update', async () => {
      await this.investor13FRefresher.fetchAll();
    });

    await this.runJob('Insider Transactions', async () => {
      await this.runInsiderRefresh();
    });

    await this.runJob('Earnings Calendar', async () => {
      await refreshEarnings({ maxCompanies: 200, staleHours: 12 });
    });

    this.log('All jobs completed.');
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const scheduler = new MasterScheduler();

  if (args.includes('--status') || args.includes('-s')) {
    const status = scheduler.getStatus();
    console.log('\n' + '='.repeat(50));
    console.log('  Master Scheduler Status');
    console.log('='.repeat(50));

    console.log('\nScheduled Jobs:');
    for (const job of status.scheduledJobs) {
      console.log(`  - ${job.name}: ${job.schedule}`);
    }

    if (status.runningJobs.length > 0) {
      console.log('\nCurrently Running:');
      for (const job of status.runningJobs) {
        console.log(`  - ${job}`);
      }
    }

    if (status.recentHistory.length > 0) {
      console.log('\nRecent History:');
      for (const entry of status.recentHistory.slice(0, 10)) {
        const marker = entry.success ? '✓' : '✗';
        console.log(`  ${marker} ${entry.job} - ${entry.timestamp} (${entry.duration})`);
      }
    }
    console.log('');

  } else if (args.includes('--list') || args.includes('-l')) {
    console.log('\nScheduled Jobs:');
    console.log('  1. Price Update         - Weekdays 6:00 PM ET');
    console.log('  2. Price Backfill       - Weekends 12:00 PM ET');
    console.log('  3. Sentiment Refresh    - Every 4 hours');
    console.log('  4. Knowledge Incremental - Mon-Sat 6:00 AM ET');
    console.log('  5. Knowledge Full       - Sunday 3:00 AM ET');
    console.log('  6. SEC Filing Check     - Weekdays 7:00 PM ET');
    console.log('  7. Dividend Refresh     - Sunday 4:00 AM ET');
    console.log('');

  } else if (args.includes('--run-all')) {
    scheduler.runAll().then(() => process.exit(0)).catch((err) => {
      console.error('Error running all jobs:', err);
      process.exit(1);
    });

  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Master Scheduler - Unified Job Scheduler

Usage:
  node src/jobs/masterScheduler.js [options]

Options:
  (none)          Start the scheduler daemon
  --status, -s    Show status of all scheduled jobs
  --list, -l      List all scheduled jobs and their times
  --run-all       Run all jobs immediately (for testing)
  --help, -h      Show this help message

Jobs:
  - Price Update:          Updates stock prices (weekdays after market close)
  - Price Backfill:        Catches up on missed price updates (weekends)
  - Sentiment Refresh:     Scans Reddit for stock sentiment (every 4 hours)
  - Knowledge Incremental: Updates tech sources in knowledge base (daily)
  - Knowledge Full:        Full knowledge base rebuild (weekly)
  - SEC Filing Check:      Checks for new 10-K/10-Q filings (weekdays)
  - Dividend Refresh:      Updates dividend history and metrics (weekly)
`);

  } else {
    // Start scheduler daemon
    scheduler.start();
  }
}

module.exports = MasterScheduler;
