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
const { getDatabaseAsync } = require('../lib/db');

class HistoricalPriceBackfiller {
  /**
   * Identify CUSIPs from investor holdings that are missing historical price data
   */
  async identifyPriceGaps() {
    const database = await getDatabaseAsync();
    console.log('🔍 Identifying price gaps for investor holdings...\n');

    // Find all unique company_ids from investor_holdings with their earliest holding date
    const holdingsWithGaps = await database.query(`
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
        GROUP BY ih.company_id, c.symbol
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
          ELSE CAST(pc.earliest_price_date - hd.earliest_holding_date AS INTEGER)
        END as gap_days
      FROM holding_dates hd
      LEFT JOIN price_coverage pc ON pc.company_id = hd.company_id
      WHERE pc.earliest_price_date IS NULL
         OR pc.earliest_price_date > hd.earliest_holding_date
      ORDER BY hd.filing_count DESC, gap_days DESC
    `);

    console.log(`Found ${holdingsWithGaps.rows.length} companies with price gaps\n`);

    // Store in cusip_price_gaps table
    if (holdingsWithGaps.rows.length > 0) {
      const values = [];
      const placeholders = [];

      holdingsWithGaps.rows.forEach((gap, idx) => {
        const base = idx * 6;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, 'pending')`);
        values.push(
          gap.symbol, // Using symbol as unique key
          gap.company_id,
          gap.symbol,
          gap.earliest_holding_date,
          gap.earliest_price_date,
          gap.gap_days
        );
      });

      await database.query(`
        INSERT INTO cusip_price_gaps (
          cusip, company_id, symbol, earliest_holding_date,
          price_data_starts, gap_days, backfill_status
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (cusip) DO UPDATE SET
          company_id = EXCLUDED.company_id,
          symbol = EXCLUDED.symbol,
          earliest_holding_date = EXCLUDED.earliest_holding_date,
          price_data_starts = EXCLUDED.price_data_starts,
          gap_days = EXCLUDED.gap_days,
          backfill_status = EXCLUDED.backfill_status
      `, values);
    }

    // Summary stats
    const noPrice = holdingsWithGaps.rows.filter(h => !h.earliest_price_date).length;
    const partialPrice = holdingsWithGaps.rows.filter(h => h.earliest_price_date).length;
    const totalGapDays = holdingsWithGaps.rows.reduce((sum, h) => sum + (h.gap_days || 0), 0);

    console.log('Summary:');
    console.log(`  Companies with no price data: ${noPrice}`);
    console.log(`  Companies with partial price data: ${partialPrice}`);
    console.log(`  Total gap days to fill: ${totalGapDays.toLocaleString()}`);

    return holdingsWithGaps.rows;
  }

  /**
   * Get symbols that need historical price backfill
   */
  async getSymbolsNeedingBackfill(limit = 100) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
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
      LIMIT $1
    `, [limit]);
    return result.rows;
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
  async markBackfilled(symbols) {
    if (symbols.length === 0) return;

    const database = await getDatabaseAsync();
    const placeholders = symbols.map((_, idx) => `$${idx + 1}`).join(', ');
    await database.query(`
      UPDATE cusip_price_gaps
      SET backfill_status = 'completed',
          backfill_attempted_at = CURRENT_TIMESTAMP
      WHERE symbol IN (${placeholders})
    `, symbols);
  }

  /**
   * Mark symbols as failed
   */
  async markFailed(symbols, errorMessage) {
    if (symbols.length === 0) return;

    const database = await getDatabaseAsync();
    const placeholders = symbols.map((_, idx) => `$${idx + 2}`).join(', ');
    await database.query(`
      UPDATE cusip_price_gaps
      SET backfill_status = 'error',
          error_message = $1,
          backfill_attempted_at = CURRENT_TIMESTAMP
      WHERE symbol IN (${placeholders})
    `, [errorMessage, ...symbols]);
  }

  /**
   * Get status of price gap backfill
   */
  async getStatus() {
    const database = await getDatabaseAsync();

    const summaryResult = await database.query(`
      SELECT
        backfill_status,
        COUNT(*) as count,
        SUM(gap_days) as total_gap_days
      FROM cusip_price_gaps
      GROUP BY backfill_status
    `);

    const topGapsResult = await database.query(`
      SELECT symbol, company_id, earliest_holding_date, gap_days, backfill_status
      FROM cusip_price_gaps
      WHERE backfill_status = 'pending'
      ORDER BY gap_days DESC
      LIMIT 20
    `);

    const recentErrorsResult = await database.query(`
      SELECT symbol, error_message, backfill_attempted_at
      FROM cusip_price_gaps
      WHERE backfill_status = 'error'
      ORDER BY backfill_attempted_at DESC
      LIMIT 10
    `);

    return {
      summary: summaryResult.rows,
      topGaps: topGapsResult.rows,
      recentErrors: recentErrorsResult.rows
    };
  }

  /**
   * Check if prices exist for a specific company and date range
   */
  async checkPriceCoverage(companyId, startDate, endDate) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        COUNT(*) as price_count,
        MIN(date) as earliest,
        MAX(date) as latest
      FROM daily_prices
      WHERE company_id = $1
        AND date >= $2
        AND date <= $3
    `, [companyId, startDate, endDate]);

    return result.rows[0];
  }

  /**
   * Verify returns can be calculated after price backfill
   */
  async verifyReturnsCalculation(investorId) {
    const investorService = require('./portfolio/investorService');

    try {
      const returns = await investorService.getPortfolioReturns(investorId, 50);

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

  (async () => {
    try {
      if (args.includes('--identify')) {
        await backfiller.identifyPriceGaps();
        process.exit(0);

      } else if (args.includes('--backfill')) {
        const symbols = await backfiller.getSymbolsNeedingBackfill(100);

        if (symbols.length === 0) {
          console.log('No symbols need backfill');
          process.exit(0);
        }

        console.log(`Found ${symbols.length} symbols needing backfill`);

        try {
          await backfiller.runPythonBackfill(symbols.map(s => s.symbol));
          await backfiller.markBackfilled(symbols.map(s => s.symbol));
          console.log('\nBackfill completed');
          process.exit(0);
        } catch (error) {
          console.error('Backfill failed:', error);
          await backfiller.markFailed(symbols.map(s => s.symbol), error.message);
          process.exit(1);
        }

      } else if (args.includes('--status')) {
        const status = await backfiller.getStatus();

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
          const result = await backfiller.verifyReturnsCalculation(investorId);
          console.log('\nReturns Calculation Verification:');
          console.log(JSON.stringify(result, null, 2));
        } else {
          // Verify all investors
          const database = await getDatabaseAsync();
          const investorsResult = await database.query(`
            SELECT id, name FROM famous_investors WHERE is_active = 1 AND cik IS NOT NULL
          `);

          console.log('\nReturns Calculation Verification for All Investors:');
          console.log('='.repeat(60));

          for (const inv of investorsResult.rows) {
            const result = await backfiller.verifyReturnsCalculation(inv.id);
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
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}

module.exports = HistoricalPriceBackfiller;
