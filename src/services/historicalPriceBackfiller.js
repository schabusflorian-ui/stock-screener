/**
 * Historical Price Backfiller Service
 *
 * Identifies and tracks CUSIPs/companies from investor holdings that need
 * historical price data, and triggers backfill via the Python price_updater.
 *
 * Usage:
 *   node src/services/historicalPriceBackfiller.js --identify    # Find price gaps
 *   node src/services/historicalPriceBackfiller.js --backfill    # Trigger backfill
 *   node src/services/historicalPriceBackfiller.js --status      # Show gap status
 */

const { spawn } = require('child_process');
const path = require('path');
const db = require('../database');

class HistoricalPriceBackfiller {
  constructor() {
    this.database = db.getDatabase();
  }

  /**
   * Identify CUSIPs from investor holdings that are missing historical price data
   */
  identifyPriceGaps() {
    console.log('🔍 Identifying price gaps for investor holdings...\n');

    // Find all unique company_ids from investor_holdings with their earliest holding date
    const holdingsWithGaps = this.database.prepare(`
      WITH holding_dates AS (
        SELECT
          ih.company_id,
          c.symbol,
          MIN(ih.filing_date) as earliest_holding_date,
          COUNT(DISTINCT ih.filing_date) as filing_count
        FROM investor_holdings ih
        JOIN companies c ON c.id = ih.company_id
        WHERE ih.company_id IS NOT NULL
          AND c.symbol IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
        GROUP BY ih.company_id
      ),
      price_coverage AS (
        SELECT
          company_id,
          MIN(date) as earliest_price_date,
          MAX(date) as latest_price_date,
          COUNT(*) as price_records
        FROM daily_prices
        GROUP BY company_id
      )
      SELECT
        hd.company_id,
        hd.symbol,
        hd.earliest_holding_date,
        hd.filing_count,
        pc.earliest_price_date,
        pc.latest_price_date,
        pc.price_records,
        CASE
          WHEN pc.earliest_price_date IS NULL THEN 1
          WHEN pc.earliest_price_date > hd.earliest_holding_date THEN 1
          ELSE 0
        END as has_gap,
        CASE
          WHEN pc.earliest_price_date IS NULL THEN 3650
          ELSE CAST(julianday(pc.earliest_price_date) - julianday(hd.earliest_holding_date) AS INTEGER)
        END as gap_days
      FROM holding_dates hd
      LEFT JOIN price_coverage pc ON pc.company_id = hd.company_id
      WHERE pc.earliest_price_date IS NULL
         OR pc.earliest_price_date > hd.earliest_holding_date
      ORDER BY hd.filing_count DESC, gap_days DESC
    `).all();

    console.log(`Found ${holdingsWithGaps.length} companies with price gaps\n`);

    // Store in cusip_price_gaps table
    const insertGap = this.database.prepare(`
      INSERT OR REPLACE INTO cusip_price_gaps (
        cusip, company_id, symbol, earliest_holding_date,
        price_data_starts, gap_days, backfill_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
    `);

    const insertMany = this.database.transaction((gaps) => {
      for (const gap of gaps) {
        // Use symbol as CUSIP placeholder since we're working with company_id
        insertGap.run(
          gap.symbol, // Using symbol as unique key
          gap.company_id,
          gap.symbol,
          gap.earliest_holding_date,
          gap.earliest_price_date,
          gap.gap_days
        );
      }
    });

    insertMany(holdingsWithGaps);

    // Summary stats
    const noPrice = holdingsWithGaps.filter(h => !h.earliest_price_date).length;
    const partialPrice = holdingsWithGaps.filter(h => h.earliest_price_date).length;
    const totalGapDays = holdingsWithGaps.reduce((sum, h) => sum + h.gap_days, 0);

    console.log('Summary:');
    console.log(`  Companies with no price data: ${noPrice}`);
    console.log(`  Companies with partial price data: ${partialPrice}`);
    console.log(`  Total gap days to fill: ${totalGapDays.toLocaleString()}`);

    return holdingsWithGaps;
  }

  /**
   * Get symbols that need historical price backfill
   */
  getSymbolsNeedingBackfill(limit = 100) {
    return this.database.prepare(`
      SELECT
        cpg.symbol,
        cpg.company_id,
        cpg.earliest_holding_date,
        cpg.gap_days,
        c.country
      FROM cusip_price_gaps cpg
      JOIN companies c ON c.id = cpg.company_id
      WHERE cpg.backfill_status = 'pending'
        AND cpg.symbol IS NOT NULL
        AND cpg.symbol NOT LIKE 'CIK_%'
      ORDER BY cpg.gap_days DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Trigger Python price_updater for historical backfill
   */
  async runPythonBackfill(symbols, period = '10y') {
    const pythonScript = path.join(__dirname, '../../python-services/price_updater.py');
    const dbPath = path.join(__dirname, '../../database.sqlite');

    return new Promise((resolve, reject) => {
      // For now, we'll use the existing backfill mechanism
      // The Python script will be called with specific symbols
      console.log(`\n🐍 Running Python price backfill for ${symbols.length} symbols...`);
      console.log(`Period: ${period}`);

      const python = spawn('python3', [
        pythonScript,
        'backfill',
        '--db', dbPath
      ], {
        cwd: path.join(__dirname, '../../python-services')
      });

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      python.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text);
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output });
        } else {
          reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
        }
      });

      python.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Mark symbols as backfilled
   */
  markBackfilled(symbols) {
    const update = this.database.prepare(`
      UPDATE cusip_price_gaps
      SET backfill_status = 'completed',
          backfill_attempted_at = CURRENT_TIMESTAMP
      WHERE symbol = ?
    `);

    const updateMany = this.database.transaction((syms) => {
      for (const symbol of syms) {
        update.run(symbol);
      }
    });

    updateMany(symbols);
  }

  /**
   * Mark symbols as failed
   */
  markFailed(symbols, errorMessage) {
    const update = this.database.prepare(`
      UPDATE cusip_price_gaps
      SET backfill_status = 'error',
          error_message = ?,
          backfill_attempted_at = CURRENT_TIMESTAMP
      WHERE symbol = ?
    `);

    const updateMany = this.database.transaction((syms) => {
      for (const symbol of syms) {
        update.run(errorMessage, symbol);
      }
    });

    updateMany(symbols);
  }

  /**
   * Get status of price gap backfill
   */
  getStatus() {
    const summary = this.database.prepare(`
      SELECT
        backfill_status,
        COUNT(*) as count,
        SUM(gap_days) as total_gap_days
      FROM cusip_price_gaps
      GROUP BY backfill_status
    `).all();

    const topGaps = this.database.prepare(`
      SELECT symbol, company_id, earliest_holding_date, gap_days, backfill_status
      FROM cusip_price_gaps
      WHERE backfill_status = 'pending'
      ORDER BY gap_days DESC
      LIMIT 20
    `).all();

    const recentErrors = this.database.prepare(`
      SELECT symbol, error_message, backfill_attempted_at
      FROM cusip_price_gaps
      WHERE backfill_status = 'error'
      ORDER BY backfill_attempted_at DESC
      LIMIT 10
    `).all();

    return { summary, topGaps, recentErrors };
  }

  /**
   * Check if prices exist for a specific company and date range
   */
  checkPriceCoverage(companyId, startDate, endDate) {
    const coverage = this.database.prepare(`
      SELECT
        COUNT(*) as price_count,
        MIN(date) as earliest,
        MAX(date) as latest
      FROM daily_prices
      WHERE company_id = ?
        AND date >= ?
        AND date <= ?
    `).get(companyId, startDate, endDate);

    return coverage;
  }

  /**
   * Verify returns can be calculated after price backfill
   */
  verifyReturnsCalculation(investorId) {
    const investorService = require('./portfolio/investorService');

    try {
      const returns = investorService.getPortfolioReturns(investorId, 50);

      if (!returns || !returns.returns || returns.returns.length === 0) {
        return { success: false, message: 'No returns data available' };
      }

      return {
        success: true,
        periodsAvailable: returns.returns.length,
        earliestPeriod: returns.returns[0]?.startDate,
        latestPeriod: returns.returns[returns.returns.length - 1]?.endDate,
        summary: returns.summary
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);
  const backfiller = new HistoricalPriceBackfiller();

  if (args.includes('--identify')) {
    backfiller.identifyPriceGaps();
    process.exit(0);

  } else if (args.includes('--backfill')) {
    const symbols = backfiller.getSymbolsNeedingBackfill(100);

    if (symbols.length === 0) {
      console.log('No symbols need backfill');
      process.exit(0);
    }

    console.log(`Found ${symbols.length} symbols needing backfill`);

    backfiller.runPythonBackfill(symbols.map(s => s.symbol))
      .then(() => {
        backfiller.markBackfilled(symbols.map(s => s.symbol));
        console.log('\nBackfill completed');
        process.exit(0);
      })
      .catch(error => {
        console.error('Backfill failed:', error);
        backfiller.markFailed(symbols.map(s => s.symbol), error.message);
        process.exit(1);
      });

  } else if (args.includes('--status')) {
    const status = backfiller.getStatus();

    console.log('\n📊 Price Gap Backfill Status');
    console.log('='.repeat(50));

    console.log('\nBy Status:');
    status.summary.forEach(s => {
      console.log(`  ${s.backfill_status.padEnd(12)} | ${String(s.count).padStart(5)} symbols | ${String(s.total_gap_days || 0).padStart(8)} gap days`);
    });

    console.log('\nTop 20 Pending Gaps:');
    status.topGaps.forEach(g => {
      console.log(`  ${g.symbol.padEnd(10)} | ${g.earliest_holding_date} | ${String(g.gap_days).padStart(5)} days`);
    });

    if (status.recentErrors.length > 0) {
      console.log('\nRecent Errors:');
      status.recentErrors.forEach(e => {
        console.log(`  ${e.symbol}: ${e.error_message}`);
      });
    }

    process.exit(0);

  } else if (args.includes('--verify')) {
    const investorIdx = args.indexOf('--investor');
    const investorId = investorIdx !== -1 ? parseInt(args[investorIdx + 1]) : null;

    if (investorId) {
      const result = backfiller.verifyReturnsCalculation(investorId);
      console.log('\nReturns Calculation Verification:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Verify all investors
      const investors = backfiller.database.prepare(`
        SELECT id, name FROM famous_investors WHERE is_active = 1 AND cik IS NOT NULL
      `).all();

      console.log('\nReturns Calculation Verification for All Investors:');
      console.log('='.repeat(60));

      for (const inv of investors) {
        const result = backfiller.verifyReturnsCalculation(inv.id);
        const status = result.success ? '✅' : '❌';
        const periods = result.periodsAvailable || 0;
        console.log(`${status} ${inv.name.padEnd(25)} | ${String(periods).padStart(3)} periods`);
      }
    }

    process.exit(0);

  } else {
    console.log(`
Historical Price Backfiller
===========================

Usage:
  node src/services/historicalPriceBackfiller.js --identify   Find price gaps
  node src/services/historicalPriceBackfiller.js --backfill   Trigger backfill
  node src/services/historicalPriceBackfiller.js --status     Show gap status
  node src/services/historicalPriceBackfiller.js --verify     Verify returns calculation
  node src/services/historicalPriceBackfiller.js --verify --investor <id>  Verify specific investor
`);
    process.exit(0);
  }
}

module.exports = HistoricalPriceBackfiller;
