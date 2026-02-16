/**
 * Historical Investor Backfill Job
 * Fetches 10 years of historical 13F filings for famous investors
 *
 * This job:
 *   - Fetches all historical 13F filings from SEC EDGAR
 *   - Processes them chronologically (oldest first for proper change tracking)
 *   - Tracks progress for resumability
 *   - Respects SEC rate limits (150ms between requests)
 *
 * Usage:
 *   node src/jobs/historicalInvestorBackfill.js --investor 1   # Backfill single investor
 *   node src/jobs/historicalInvestorBackfill.js --all          # Backfill all investors
 *   node src/jobs/historicalInvestorBackfill.js --resume       # Resume from checkpoint
 *   node src/jobs/historicalInvestorBackfill.js --status       # Show progress status
 *   node src/jobs/historicalInvestorBackfill.js --verify       # Verify data completeness
 *   node src/jobs/historicalInvestorBackfill.js --years 5      # Backfill 5 years (default: 10)
 */

const fs = require('fs');
const path = require('path');
const { getDatabaseAsync } = require('../lib/db');
const investorService = require('../services/portfolio/investorService');

const CHECKPOINT_FILE = path.join(__dirname, '../../data/backfill_checkpoint.json');

class HistoricalInvestorBackfill {
  constructor() {
    this.isRunning = false;
    this.progress = {
      currentInvestor: null,
      currentInvestorName: null,
      investorsProcessed: 0,
      investorsTotal: 0,
      filingsProcessed: 0,
      filingsTotal: 0,
      errors: []
    };
  }

  /**
   * Save checkpoint for resumability
   */
  async saveCheckpoint(investorId, lastAccession, status = 'in_progress') {
    const checkpoint = {
      investorId,
      lastAccessionNumber: lastAccession,
      status,
      timestamp: new Date().toISOString(),
      progress: { ...this.progress }
    };

    // Ensure data directory exists
    const dataDir = path.dirname(CHECKPOINT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));

    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO backfill_progress (
        investor_id, last_accession_number, last_filing_date,
        filings_processed, filings_total, status, started_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE(
        (SELECT started_at FROM backfill_progress WHERE investor_id = $7),
        CURRENT_TIMESTAMP
      ), CURRENT_TIMESTAMP)
      ON CONFLICT(investor_id) DO UPDATE SET
        last_accession_number = excluded.last_accession_number,
        last_filing_date = excluded.last_filing_date,
        filings_processed = excluded.filings_processed,
        filings_total = excluded.filings_total,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `, [investorId, lastAccession, null, this.progress.filingsProcessed, this.progress.filingsTotal, status, investorId]);
  }

  /**
   * Load checkpoint for resuming
   */
  loadCheckpoint() {
    try {
      if (fs.existsSync(CHECKPOINT_FILE)) {
        const data = fs.readFileSync(CHECKPOINT_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading checkpoint:', error.message);
    }
    return null;
  }

  /**
   * Get backfill progress from database
   */
  async getBackfillProgress() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        bp.*,
        fi.name as investor_name
      FROM backfill_progress bp
      JOIN famous_investors fi ON fi.id = bp.investor_id
      ORDER BY bp.updated_at DESC
    `);
    return result.rows || [];
  }

  /**
   * Backfill a single investor
   */
  async backfillInvestor(investorId, options = {}) {
    const { yearsBack = 10 } = options;

    const investor = await investorService.getInvestor(investorId);
    if (!investor) {
      throw new Error(`Investor not found: ${investorId}`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📜 Backfilling ${investor.name} (${yearsBack} years)`);
    console.log(`CIK: ${investor.cik}`);
    console.log('='.repeat(60));

    this.progress.currentInvestor = investorId;
    this.progress.currentInvestorName = investor.name;

    try {
      const result = await investorService.backfillInvestorFilings(investorId, {
        yearsBack,
        onProgress: async (current, total, filing) => {
          this.progress.filingsProcessed = current;
          this.progress.filingsTotal = total;
          await this.saveCheckpoint(investorId, filing.accessionNumber);
        },
        onError: (filing, error) => {
          this.progress.errors.push({
            investorId,
            investorName: investor.name,
            filingDate: filing.filingDate,
            error: error.message
          });
        }
      });

      // Mark as completed
      await this.saveCheckpoint(investorId, null, 'completed');
      const database = await getDatabaseAsync();
      await database.query(`
        UPDATE backfill_progress
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE investor_id = $1
      `, [investorId]);

      return result;
    } catch (error) {
      await this.saveCheckpoint(investorId, null, 'error');
      const database = await getDatabaseAsync();
      await database.query(`
        UPDATE backfill_progress
        SET status = 'error', error_message = $1
        WHERE investor_id = $2
      `, [error.message, investorId]);
      throw error;
    }
  }

  /**
   * Backfill all investors
   */
  async backfillAll(options = {}) {
    const { yearsBack = 10, startFrom = null } = options;

    if (this.isRunning) {
      throw new Error('Backfill already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${new Date().toISOString()}] Starting historical backfill for all investors`);
    console.log(`Years: ${yearsBack}`);
    console.log('='.repeat(60));

    try {
      const investors = (await investorService.getAllInvestors())
        .filter(i => i.cik); // Only investors with CIK

      this.progress.investorsTotal = investors.length;

      // If resuming, find where to start
      let startIndex = 0;
      if (startFrom) {
        startIndex = investors.findIndex(i => i.id === startFrom);
        if (startIndex === -1) startIndex = 0;
        console.log(`Resuming from investor ${startFrom} (index ${startIndex})`);
      }

      const results = {
        success: true,
        processed: 0,
        skipped: 0,
        failed: 0,
        errors: []
      };

      for (let i = startIndex; i < investors.length; i++) {
        const investor = investors[i];
        this.progress.investorsProcessed = i + 1;

        console.log(`\n[${i + 1}/${investors.length}] Processing ${investor.name}...`);

        try {
          const result = await this.backfillInvestor(investor.id, { yearsBack });

          if (result.filingsProcessed > 0) {
            results.processed++;
          } else {
            results.skipped++;
          }

          // Add delay between investors to be nice to SEC
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`❌ Failed to backfill ${investor.name}: ${error.message}`);
          results.failed++;
          results.errors.push({
            investorId: investor.id,
            investorName: investor.name,
            error: error.message
          });
        }
      }

      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${new Date().toISOString()}] Backfill completed in ${duration} minutes`);
      console.log(`Processed: ${results.processed}, Skipped: ${results.skipped}, Failed: ${results.failed}`);
      console.log('='.repeat(60));

      return results;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Resume from last checkpoint
   */
  async resume(options = {}) {
    const checkpoint = this.loadCheckpoint();

    if (!checkpoint || checkpoint.status === 'completed') {
      console.log('No incomplete backfill to resume.');

      const database = await getDatabaseAsync();
      const incompleteResult = await database.query(`
        SELECT investor_id FROM backfill_progress
        WHERE status = 'in_progress' OR status = 'error'
        ORDER BY investor_id
        LIMIT 1
      `);
      const incomplete = (incompleteResult.rows && incompleteResult.rows[0]) || null;

      if (incomplete) {
        console.log(`Found incomplete investor ${incomplete.investor_id} in database, resuming...`);
        return this.backfillAll({ ...options, startFrom: incomplete.investor_id });
      }

      return { success: true, message: 'Nothing to resume' };
    }

    console.log('Resuming from checkpoint:');
    console.log(`  Investor: ${checkpoint.investorId}`);
    console.log(`  Timestamp: ${checkpoint.timestamp}`);

    return this.backfillAll({ ...options, startFrom: checkpoint.investorId });
  }

  /**
   * Get detailed status of backfill
   */
  async getStatus() {
    const database = await getDatabaseAsync();

    // Get investor filing counts (years_covered computed in JS for dialect compatibility)
    const filingsResult = await database.query(`
      SELECT
        fi.id,
        fi.name,
        fi.cik,
        COUNT(DISTINCT if2.id) as filing_count,
        MIN(if2.filing_date) as earliest_filing,
        MAX(if2.filing_date) as latest_filing
      FROM famous_investors fi
      LEFT JOIN investor_filings if2 ON if2.investor_id = fi.id
      WHERE fi.is_active = 1 AND fi.cik IS NOT NULL
      GROUP BY fi.id
      ORDER BY fi.display_order
    `);
    const rows = filingsResult.rows || [];
    const filingsPerInvestor = rows.map(r => ({
      ...r,
      years_covered: (r.earliest_filing && r.latest_filing)
        ? parseFloat((((new Date(r.latest_filing) - new Date(r.earliest_filing)) / (86400 * 1000 * 365.25))).toFixed(1))
        : null
    }));

    // Get backfill progress
    const backfillProgress = await this.getBackfillProgress();

    // Get error count
    const errorResult = await database.query(`
      SELECT COUNT(*) as count FROM backfill_progress WHERE status = 'error'
    `);
    const errorCount = (errorResult.rows && errorResult.rows[0]) || { count: 0 };

    // Calculate coverage stats
    const totalInvestors = filingsPerInvestor.length;
    const investorsWithData = filingsPerInvestor.filter(i => i.filing_count > 0).length;
    const investorsWithFullHistory = filingsPerInvestor.filter(i => i.years_covered >= 9).length;
    const totalFilings = filingsPerInvestor.reduce((sum, i) => sum + (i.filing_count || 0), 0);
    const averageFilingsPerInvestor = totalInvestors > 0 ? (totalFilings / totalInvestors).toFixed(1) : '0';

    return {
      isRunning: this.isRunning,
      checkpoint: this.loadCheckpoint(),
      coverage: {
        totalInvestors,
        investorsWithData,
        investorsWithFullHistory,
        averageFilingsPerInvestor
      },
      investors: filingsPerInvestor,
      backfillProgress,
      errorCount: errorCount.count
    };
  }

  /**
   * Verify data completeness
   */
  async verify() {
    console.log('\n📊 Verifying backfill data completeness...\n');

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        fi.id,
        fi.name,
        fi.cik,
        COUNT(DISTINCT if2.report_date) as quarters,
        MIN(if2.report_date) as earliest,
        MAX(if2.report_date) as latest
      FROM famous_investors fi
      LEFT JOIN investor_filings if2 ON if2.investor_id = fi.id
      WHERE fi.is_active = 1 AND fi.cik IS NOT NULL
      GROUP BY fi.id
      ORDER BY fi.display_order
    `);
    const rows = result.rows || [];
    const investors = rows.map(r => ({
      ...r,
      years: (r.earliest && r.latest)
        ? parseFloat((((new Date(r.latest) - new Date(r.earliest)) / (86400 * 1000 * 365.25))).toFixed(1))
        : null
    }));

    const issues = [];

    for (const inv of investors) {
      const expectedQuarters = 40; // 10 years * 4 quarters
      const coverage = ((inv.quarters / expectedQuarters) * 100).toFixed(0);

      let status = '✅';
      if (inv.quarters === 0) {
        status = '❌';
        issues.push({ investor: inv.name, issue: 'No filings' });
      } else if (inv.quarters < 20) {
        status = '⚠️';
        issues.push({ investor: inv.name, issue: `Only ${inv.quarters} quarters (${coverage}% coverage)` });
      } else if (inv.years < 5) {
        status = '⚠️';
        issues.push({ investor: inv.name, issue: `Only ${inv.years} years of history` });
      }

      console.log(`${status} ${inv.name.padEnd(25)} | ${String(inv.quarters).padStart(3)} quarters | ${inv.earliest || 'N/A'} to ${inv.latest || 'N/A'} | ${coverage}%`);
    }

    // Check returns calculation
    console.log('\n📈 Checking returns calculation availability...\n');

    for (const inv of investors) {
      if (inv.quarters >= 2) {
        try {
          const returns = await investorService.getPortfolioReturns(inv.id, { limit: 50 });
          const hasReturns = returns && returns.returns && returns.returns.length > 0;
          console.log(`${hasReturns ? '✅' : '❌'} ${inv.name.padEnd(25)} | ${hasReturns ? returns.returns.length + ' periods' : 'No returns data'}`);
        } catch (error) {
          console.log(`❌ ${inv.name.padEnd(25)} | Error: ${error.message}`);
        }
      }
    }

    if (issues.length > 0) {
      console.log('\n⚠️ Issues found:');
      issues.forEach(i => console.log(`  - ${i.investor}: ${i.issue}`));
    } else {
      console.log('\n✅ All investors have adequate data coverage');
    }

    return { investors, issues };
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const backfiller = new HistoricalInvestorBackfill();

  // Parse years argument
  let yearsBack = 10;
  const yearsIdx = args.indexOf('--years');
  if (yearsIdx !== -1 && args[yearsIdx + 1]) {
    yearsBack = parseInt(args[yearsIdx + 1]);
  }

  if (args.includes('--investor')) {
    const investorIdx = args.indexOf('--investor');
    const investorId = parseInt(args[investorIdx + 1]);

    if (!investorId) {
      console.error('Please provide an investor ID: --investor <id>');
      process.exit(1);
    }

    backfiller.backfillInvestor(investorId, { yearsBack })
      .then(result => {
        console.log('\nBackfill completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Backfill failed:', error);
        process.exit(1);
      });

  } else if (args.includes('--all')) {
    backfiller.backfillAll({ yearsBack })
      .then(result => {
        console.log('\nBackfill completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Backfill failed:', error);
        process.exit(1);
      });

  } else if (args.includes('--resume')) {
    backfiller.resume({ yearsBack })
      .then(result => {
        console.log('\nResume completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Resume failed:', error);
        process.exit(1);
      });

  } else if (args.includes('--status')) {
    backfiller.getStatus().then(status => {
    console.log('\n📊 Historical Backfill Status');
    console.log('='.repeat(60));
    console.log(`Running: ${status.isRunning}`);
    console.log('\nCoverage:');
    console.log(`  Total Investors: ${status.coverage.totalInvestors}`);
    console.log(`  With Data: ${status.coverage.investorsWithData}`);
    console.log(`  With Full History (9+ years): ${status.coverage.investorsWithFullHistory}`);
    console.log(`  Avg Filings/Investor: ${status.coverage.averageFilingsPerInvestor}`);

    console.log('\nInvestor Filing Counts:');
    status.investors.forEach(inv => {
      const bar = '█'.repeat(Math.min(inv.filing_count, 40));
      console.log(`  ${inv.name.padEnd(25)} | ${String(inv.filing_count).padStart(3)} | ${bar}`);
    });

    if (status.checkpoint) {
      console.log('\nLast Checkpoint:');
      console.log(`  Investor: ${status.checkpoint.investorId}`);
      console.log(`  Status: ${status.checkpoint.status}`);
      console.log(`  Timestamp: ${status.checkpoint.timestamp}`);
    }

    process.exit(0);
    }).catch(err => { console.error(err); process.exit(1); });

  } else if (args.includes('--verify')) {
    backfiller.verify()
      .then(() => process.exit(0))
      .catch(err => { console.error(err); process.exit(1); });

  } else {
    console.log(`
Historical Investor Backfill Job
================================

Usage:
  node src/jobs/historicalInvestorBackfill.js --investor <id>  Backfill single investor
  node src/jobs/historicalInvestorBackfill.js --all            Backfill all investors
  node src/jobs/historicalInvestorBackfill.js --resume         Resume from checkpoint
  node src/jobs/historicalInvestorBackfill.js --status         Show progress status
  node src/jobs/historicalInvestorBackfill.js --verify         Verify data completeness

Options:
  --years <n>   Number of years to backfill (default: 10)

Examples:
  node src/jobs/historicalInvestorBackfill.js --investor 1 --years 5
  node src/jobs/historicalInvestorBackfill.js --all --years 10
`);
    process.exit(0);
  }
}

module.exports = HistoricalInvestorBackfill;
