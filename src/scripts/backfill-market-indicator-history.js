/**
 * Backfill Market Indicator History
 *
 * One-time script to calculate and store all historical market indicators.
 * Uses the existing HistoricalMarketIndicatorsService for accurate calculations.
 *
 * Run: node src/scripts/backfill-market-indicator-history.js
 *
 * Options:
 *   --start=2015-Q1   Start quarter (default: 2015-Q1)
 *   --end=2025-Q4     End quarter (default: current quarter)
 *   --force           Recalculate even if data exists
 */

const { getDatabaseSync } = require('../lib/db');
const { HistoricalMarketIndicatorsService } = require('../services/historicalMarketIndicators');
const { FREDService } = require('../services/dataProviders/fredService');

class MarketIndicatorBackfill {
  constructor() {
    this.dbWrapper = getDatabaseSync();
    this.db = this.dbWrapper.raw; // Get the raw better-sqlite3 instance
    this.indicatorService = new HistoricalMarketIndicatorsService();
    this.fredService = new FREDService(require('../database'));

    // Ensure aggregate_msi and buffett_source columns exist
    this.ensureColumns();
  }

  /**
   * Add missing columns to market_indicator_history table
   */
  ensureColumns() {
    const columns = this.db.pragma('table_info(market_indicator_history)');
    const columnNames = columns.map(c => c.name);

    // Add aggregate_msi column if missing
    if (!columnNames.includes('aggregate_msi')) {
      console.log('Adding aggregate_msi column to market_indicator_history...');
      this.db.exec('ALTER TABLE market_indicator_history ADD COLUMN aggregate_msi REAL');
    }

    // Add buffett_source column if missing (to track data provenance)
    if (!columnNames.includes('buffett_source')) {
      console.log('Adding buffett_source column to market_indicator_history...');
      this.db.exec("ALTER TABLE market_indicator_history ADD COLUMN buffett_source TEXT DEFAULT 'calculated'");
    }

    // Add fred_msi column if missing (FRED official MSI from NCBCEPNW series)
    if (!columnNames.includes('fred_msi')) {
      console.log('Adding fred_msi column to market_indicator_history...');
      this.db.exec('ALTER TABLE market_indicator_history ADD COLUMN fred_msi REAL');
    }
  }

  /**
   * Check coverage for a FRED series in economic_indicators table
   */
  getSeriesCoverage(seriesId) {
    const result = this.db.prepare(`
      SELECT
        COUNT(*) as count,
        MIN(observation_date) as firstDate,
        MAX(observation_date) as lastDate
      FROM economic_indicators
      WHERE series_id = ?
    `).get(seriesId);

    return {
      hasData: result.count > 0,
      count: result.count,
      firstDate: result.firstDate,
      lastDate: result.lastDate,
    };
  }

  /**
   * Generate list of quarters between start and end
   */
  generateQuarters(startQuarter, endQuarter) {
    const quarters = [];
    const [startYear, startQ] = startQuarter.split('-Q').map(Number);
    const [endYear, endQ] = endQuarter.split('-Q').map(Number);

    let year = startYear;
    let q = startQ;

    while (year < endYear || (year === endYear && q <= endQ)) {
      quarters.push(`${year}-Q${q}`);
      q++;
      if (q > 4) {
        q = 1;
        year++;
      }
    }
    return quarters;
  }

  /**
   * Get quarter end date
   */
  getQuarterEndDate(quarter) {
    const [year, q] = quarter.split('-Q').map(Number);
    const endMonths = { 1: '03-31', 2: '06-30', 3: '09-30', 4: '12-31' };
    return `${year}-${endMonths[q]}`;
  }

  /**
   * Get current quarter
   */
  getCurrentQuarter() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const q = Math.ceil(month / 3);
    return `${year}-Q${q}`;
  }

  /**
   * Check if quarter already has data
   */
  hasData(quarter) {
    const result = this.db.prepare(
      'SELECT 1 FROM market_indicator_history WHERE quarter = ?'
    ).get(quarter);
    return !!result;
  }

  /**
   * Insert or update a quarter's data
   */
  upsertQuarter(quarter, data) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO market_indicator_history (
        quarter, quarter_end_date,
        buffett_indicator, buffett_market_cap, buffett_gdp, buffett_stock_count, buffett_source,
        sp500_pe, sp500_market_cap, sp500_earnings, sp500_company_count,
        median_pe, median_pb, median_msi, aggregate_msi, fred_msi, pct_undervalued,
        total_stocks_analyzed, undervalued_count,
        treasury_2y, treasury_10y, yield_spread_2s10s,
        calculated_at, data_quality
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);

    stmt.run(
      quarter,
      this.getQuarterEndDate(quarter),
      data.buffett?.value || null,
      data.buffett?.rawMarketCap || null,
      data.buffett?.gdp || null,
      data.buffett?.companyCount || null,
      data.buffett?.source || 'calculated',
      data.sp500PE?.value || null,
      data.sp500PE?.marketCap || null,
      data.sp500PE?.earnings || null,
      data.sp500PE?.companyCount || null,
      data.aggregate?.medianPE || null,
      data.aggregate?.medianPB || null,
      data.aggregate?.medianMSI || null,
      data.aggregateMSI?.value || null,  // Aggregate MSI (Total EV / Total Book Value)
      data.fredMSI?.value || null,       // FRED MSI (NCBCEPNW: Corporate Equities / Net Worth)
      data.aggregate?.pctUndervalued || null,
      data.aggregate?.totalStocks || null,
      data.aggregate?.undervaluedCount || null,
      data.yields?.treasury2y || null,
      data.yields?.treasury10y || null,
      data.yields?.spread || null,
      data.quality || 'complete'
    );
  }

  /**
   * Calculate all metrics for a quarter using existing service
   */
  calculateQuarterMetrics(quarter) {
    const quarterEndDate = this.getQuarterEndDate(quarter);

    // Use existing service methods
    const buffett = this.indicatorService.calculateBuffettIndicator(quarter);
    // Use V2 method with proper Q4 inference and outlier filtering
    const sp500PETtm = this.indicatorService.getSP500PEForQuarterV2(quarter);

    // Calculate S&P 500 market cap separately (even if P/E can't be calculated due to missing earnings)
    const sp500MarketCapData = this.indicatorService.getSP500HistoricalMarketCap(quarterEndDate);

    // Use getQuarterMetricsAsOf() instead of getQuarterMetrics() to fix seasonal fluctuations
    // getQuarterMetrics() filters by fiscal_period date range, causing Q4 spikes (90% have Dec 31 FYE)
    // getQuarterMetricsAsOf() uses most recent data per company, giving consistent sample sizes
    const aggregateMetrics = this.indicatorService.getQuarterMetricsAsOf(quarter);
    // Calculate aggregate MSI (Total EV / Total Book Value) - fixes trend issue
    const aggregateMSI = this.indicatorService.calculateAggregateMSI(quarter);
    // Get FRED MSI (NCBCEPNW: Corporate Equities as % of Net Worth) - official Fed measure
    const fredMSI = this.indicatorService.getMSIFromFRED(quarter);

    // Get treasury yields
    const yields = this.db.prepare(`
      SELECT
        MAX(CASE WHEN series_id = 'DGS2' THEN value END) as y2,
        MAX(CASE WHEN series_id = 'DGS10' THEN value END) as y10
      FROM economic_indicators
      WHERE series_id IN ('DGS2', 'DGS10')
        AND observation_date <= ?
        AND observation_date >= date(?, '-30 days')
    `).get(quarterEndDate, quarterEndDate);

    return {
      buffett: buffett?.value ? {
        value: Math.round(buffett.value * 100) / 100,
        rawMarketCap: buffett.rawMarketCap,
        gdp: buffett.gdp,
        companyCount: buffett.companyCount,
        source: buffett.source || 'calculated'
      } : null,
      sp500PE: (sp500PETtm?.value || sp500MarketCapData?.totalMarketCapBillions) ? {
        value: sp500PETtm?.value ? Math.round(sp500PETtm.value * 100) / 100 : null,
        // Use marketCap from P/E calculation if available, otherwise use standalone calculation
        marketCap: sp500PETtm?.totalMarketCap || (sp500MarketCapData?.totalMarketCapBillions ? sp500MarketCapData.totalMarketCapBillions * 1e9 : null),
        earnings: sp500PETtm?.totalTTMEarnings || sp500PETtm?.totalImpliedEarnings || null,
        companyCount: sp500PETtm?.companyCount || sp500MarketCapData?.companyCount || null,
        method: sp500PETtm?.method || 'market_cap_only'
      } : null,
      aggregate: aggregateMetrics?.metrics ? {
        medianPE: aggregateMetrics.metrics.pe_ratio ? Math.round(aggregateMetrics.metrics.pe_ratio * 100) / 100 : null,
        medianPB: aggregateMetrics.metrics.pb_ratio ? Math.round(aggregateMetrics.metrics.pb_ratio * 100) / 100 : null,
        medianMSI: aggregateMetrics.metrics.msi ? Math.round(aggregateMetrics.metrics.msi * 1000) / 1000 : null,
        pctUndervalued: aggregateMetrics.metrics.pct_undervalued,
        totalStocks: aggregateMetrics.sampleSize,
        undervaluedCount: aggregateMetrics.metrics.undervalued_count
      } : null,
      // Aggregate MSI (Total EV / Total Book Value) - uses same methodology as external benchmarks
      aggregateMSI: aggregateMSI?.value ? {
        value: Math.round(aggregateMSI.value * 1000) / 1000,
        companyCount: aggregateMSI.companyCount,
        source: 'aggregate'
      } : null,
      // FRED MSI (NCBCEPNW: Corporate Equities / Net Worth) - official Fed measure
      // Matches external reference charts (range 0.5-2.5)
      fredMSI: fredMSI?.value ? {
        value: Math.round(fredMSI.value * 1000) / 1000,
        percentage: fredMSI.percentage,
        source: 'fred_ncbcepnw'
      } : null,
      yields: {
        treasury2y: yields?.y2 || null,
        treasury10y: yields?.y10 || null,
        spread: yields?.y2 && yields?.y10 ? Math.round((yields.y10 - yields.y2) * 100) / 100 : null
      }
    };
  }

  /**
   * Run the backfill
   */
  async run(options = {}) {
    const startQuarter = options.start || '2015-Q1';
    const endQuarter = options.end || this.getCurrentQuarter();
    const force = options.force || false;
    const skipFRED = options.skipFRED || false;

    console.log('='.repeat(60));
    console.log('Market Indicator History Backfill');
    console.log('='.repeat(60));
    console.log(`Range: ${startQuarter} to ${endQuarter}`);
    console.log(`Force recalculate: ${force}`);
    console.log('');

    // Step 1: Fetch FRED Wilshire 5000 historical data (if not skipped)
    // This provides accurate market cap data for Buffett Indicator (pre-June 2024)
    if (!skipFRED) {
      console.log('Step 1: Fetching FRED Wilshire 5000 historical data...');
      const wilshireCoverage = await this.fredService.getWilshire5000Coverage();
      if (wilshireCoverage.hasData && wilshireCoverage.count > 1000) {
        console.log(`  ✓ Wilshire 5000 data already present (${wilshireCoverage.count} observations)`);
        console.log(`    Date range: ${wilshireCoverage.firstDate} to ${wilshireCoverage.lastDate}`);
      } else {
        console.log('  Fetching from FRED API...');
        const fetchResult = await this.fredService.fetchWilshire5000History('2015-01-01');
        if (fetchResult.success) {
          console.log(`  ✓ Fetched ${fetchResult.count} Wilshire 5000 observations`);
        } else {
          console.log(`  ⚠ Could not fetch Wilshire 5000: ${fetchResult.error}`);
          console.log('    Will use calculated market cap with scaling instead');
        }
      }
      console.log('');

      // Step 1.5: Fetch FRED NCBCEPNW (MSI) historical data
      // This is the official MSI: Corporate Equities as % of Net Worth
      console.log('Step 1.5: Fetching FRED MSI (NCBCEPNW) historical data...');
      const ncbcepnwCoverage = this.getSeriesCoverage('NCBCEPNW');
      if (ncbcepnwCoverage.hasData && ncbcepnwCoverage.count > 100) {
        console.log(`  ✓ MSI data already present (${ncbcepnwCoverage.count} observations)`);
        console.log(`    Date range: ${ncbcepnwCoverage.firstDate} to ${ncbcepnwCoverage.lastDate}`);
      } else {
        console.log('  Fetching from FRED API...');
        try {
          const count = await this.fredService.updateSeries('NCBCEPNW', 365 * 40); // 40 years of data
          console.log(`  ✓ Fetched ${count} MSI observations`);
        } catch (error) {
          console.log(`  ⚠ Could not fetch MSI: ${error.message}`);
          console.log('    FRED MSI will be null in backfill');
        }
      }
      console.log('');
    }

    const quarters = this.generateQuarters(startQuarter, endQuarter);
    console.log(`Processing ${quarters.length} quarters...`);
    console.log('');

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const quarter of quarters) {
      try {
        // Skip if already has data (unless force)
        if (!force && this.hasData(quarter)) {
          process.stdout.write(`  ${quarter}: Skipped (already exists)\n`);
          skipped++;
          continue;
        }

        process.stdout.write(`  ${quarter}: Calculating...`);

        const data = this.calculateQuarterMetrics(quarter);

        // Determine data quality
        let quality = 'complete';
        if (!data.buffett || !data.sp500PE) quality = 'partial';
        if (!data.buffett && !data.sp500PE && !data.aggregate) quality = 'minimal';

        this.upsertQuarter(quarter, { ...data, quality });

        const summary = [];
        if (data.buffett) {
          const src = data.buffett.source === 'fred_wilshire5000' ? '(FRED)' : '(calc)';
          summary.push(`Buffett=${data.buffett.value}% ${src}`);
        }
        if (data.sp500PE) summary.push(`S&P PE=${data.sp500PE.value}`);
        if (data.fredMSI) summary.push(`FRED MSI=${data.fredMSI.value}`);
        if (data.aggregateMSI && !data.fredMSI) summary.push(`MSI=${data.aggregateMSI.value}`);

        process.stdout.write(`\r  ${quarter}: ${summary.join(', ') || 'Limited data'} [${quality}]\n`);
        processed++;
      } catch (error) {
        process.stdout.write(`\r  ${quarter}: ERROR - ${error.message}\n`);
        errors++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(`Completed: ${processed} processed, ${skipped} skipped, ${errors} errors`);
    console.log('='.repeat(60));

    // Show sample of data
    console.log('');
    console.log('Sample data (most recent):');
    const sample = this.db.prepare(`
      SELECT
        quarter,
        buffett_indicator as buffett,
        buffett_source as src,
        sp500_pe,
        fred_msi,
        aggregate_msi as stock_msi
      FROM market_indicator_history
      ORDER BY quarter DESC
      LIMIT 8
    `).all();
    console.table(sample);
  }
}

// Parse command line args
const args = process.argv.slice(2);
const options = {};
for (const arg of args) {
  if (arg.startsWith('--start=')) options.start = arg.split('=')[1];
  if (arg.startsWith('--end=')) options.end = arg.split('=')[1];
  if (arg === '--force') options.force = true;
  if (arg === '--skip-fred') options.skipFRED = true;
}

// Run backfill
const backfill = new MarketIndicatorBackfill();
backfill.run(options).then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
