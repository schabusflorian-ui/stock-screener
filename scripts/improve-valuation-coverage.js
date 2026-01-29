/**
 * Improve Valuation Coverage
 *
 * This script improves valuation metric coverage by:
 * 1. Marking ETFs/Funds/LPs/Trusts as valuation_applicable = 0
 * 2. Fetching current market cap from Yahoo Finance for companies missing EPS
 * 3. Calculating valuations for recent periods using current market cap
 */

const db = require('../src/database');
const https = require('https');

class ValuationCoverageImprover {
  constructor() {
    this.database = db.getDatabase();
    this.stats = {
      markedNotApplicable: 0,
      marketCapFetched: 0,
      valuationsAdded: 0,
      errors: 0
    };
  }

  /**
   * Identify and mark entities where valuation metrics don't apply
   */
  markNonApplicableEntities() {
    console.log('\n📋 Marking non-applicable entities...\n');

    // Patterns for non-applicable entities
    const patterns = [
      // ETFs and Funds
      { pattern: '%ETF%', type: 'ETF' },
      { pattern: '%Fund%', type: 'Fund' },
      { pattern: '%Trust%', type: 'Trust' },
      { pattern: '%Index%', type: 'Index' },
      // Limited Partnerships
      { pattern: '% LP', type: 'LP' },
      { pattern: '% L.P.%', type: 'LP' },
      { pattern: '%Limited Partnership%', type: 'LP' },
      { pattern: '%Partners%LP%', type: 'LP' },
      // Special vehicles
      { pattern: '%SPAC%', type: 'SPAC' },
      { pattern: '%Acquisition Corp%', type: 'SPAC' },
      { pattern: '%Blank Check%', type: 'SPAC' },
    ];

    let totalMarked = 0;

    for (const { pattern, type } of patterns) {
      const result = this.database.prepare(`
        UPDATE calculated_metrics
        SET valuation_applicable = 0
        WHERE company_id IN (
          SELECT id FROM companies WHERE name LIKE ?
        )
        AND valuation_applicable = 1
      `).run(pattern);

      if (result.changes > 0) {
        console.log(`  Marked ${result.changes} periods as non-applicable (${type})`);
        totalMarked += result.changes;
      }
    }

    // Also mark based on symbol patterns
    const symbolPatterns = [
      { pattern: '%-UN', type: 'Unit' },
      { pattern: '%-WT', type: 'Warrant' },
      { pattern: '%-WS', type: 'Warrant' },
      { pattern: '%-RT', type: 'Right' },
    ];

    for (const { pattern, type } of symbolPatterns) {
      const result = this.database.prepare(`
        UPDATE calculated_metrics
        SET valuation_applicable = 0
        WHERE company_id IN (
          SELECT id FROM companies WHERE symbol LIKE ?
        )
        AND valuation_applicable = 1
      `).run(pattern);

      if (result.changes > 0) {
        console.log(`  Marked ${result.changes} periods as non-applicable (${type} by symbol)`);
        totalMarked += result.changes;
      }
    }

    // Mark periods without revenue (typically funds/ETFs)
    const noRevenueResult = this.database.prepare(`
      UPDATE calculated_metrics
      SET valuation_applicable = 0
      WHERE pe_ratio IS NULL
        AND valuation_applicable = 1
        AND company_id IN (
          SELECT DISTINCT fd.company_id
          FROM financial_data fd
          WHERE fd.statement_type = 'income_statement'
            AND fd.period_type = 'annual'
            AND json_extract(fd.data, '$.revenue') IS NULL
            AND json_extract(fd.data, '$.totalRevenue') IS NULL
            AND json_extract(fd.data, '$.Revenues') IS NULL
        )
    `).run();

    if (noRevenueResult.changes > 0) {
      console.log(`  Marked ${noRevenueResult.changes} periods as non-applicable (no revenue data)`);
      totalMarked += noRevenueResult.changes;
    }

    this.stats.markedNotApplicable = totalMarked;
    console.log(`\n  Total marked as non-applicable: ${totalMarked}`);
  }

  /**
   * Fetch market cap from Yahoo Finance
   */
  async fetchMarketCap(symbol) {
    return new Promise((resolve) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const quote = json?.chart?.result?.[0]?.meta;
            if (quote) {
              resolve({
                marketCap: quote.marketCap || null,
                price: quote.regularMarketPrice || null,
                symbol: symbol
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Get companies that need market cap data
   */
  getCompaniesNeedingMarketCap() {
    return this.database.prepare(`
      SELECT DISTINCT
        c.id,
        c.symbol,
        c.name
      FROM companies c
      JOIN calculated_metrics cm ON cm.company_id = c.id
      JOIN financial_data fd ON fd.company_id = c.id
        AND fd.fiscal_date_ending = cm.fiscal_period
        AND fd.statement_type = 'income_statement'
        AND fd.period_type = cm.period_type
      WHERE cm.pe_ratio IS NULL
        AND cm.valuation_applicable = 1
        AND cm.period_type = 'annual'
        AND cm.fiscal_period >= '2023-01-01'
        AND c.symbol NOT LIKE 'CIK_%'
        AND c.symbol NOT LIKE '%-%'
        AND EXISTS (SELECT 1 FROM daily_prices dp WHERE dp.company_id = c.id)
        AND json_extract(fd.data, '$.EarningsPerShareBasic') IS NULL
        AND json_extract(fd.data, '$.EarningsPerShareDiluted') IS NULL
        AND json_extract(fd.data, '$.netIncome') IS NOT NULL
      ORDER BY c.symbol
      LIMIT 500
    `).all();
  }

  /**
   * Calculate and store valuation metrics using fetched market cap
   */
  calculateValuationWithMarketCap(companyId, fiscalPeriod, periodType, marketCap, financialData) {
    if (!marketCap || !financialData) return false;

    const data = typeof financialData === 'string' ? JSON.parse(financialData) : financialData;

    const netIncome = parseFloat(data.netIncome) || parseFloat(data.NetIncomeLoss);
    const revenue = parseFloat(data.revenue) || parseFloat(data.totalRevenue) || parseFloat(data.Revenues);

    const updates = {};

    if (netIncome && netIncome !== 0) {
      updates.pe_ratio = marketCap / netIncome;
    }

    if (revenue && revenue > 0) {
      updates.ps_ratio = marketCap / revenue;
    }

    if (Object.keys(updates).length === 0) return false;

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), companyId, fiscalPeriod, periodType];

    this.database.prepare(`
      UPDATE calculated_metrics
      SET ${setClauses}
      WHERE company_id = ? AND fiscal_period = ? AND period_type = ?
    `).run(...values);

    return true;
  }

  /**
   * Fetch market caps and update valuations
   */
  async fetchAndUpdateMarketCaps(options = {}) {
    const { limit = 100, delayMs = 200 } = options;

    console.log('\n💰 Fetching market caps for companies missing EPS...\n');

    const companies = this.getCompaniesNeedingMarketCap().slice(0, limit);
    console.log(`  Found ${companies.length} companies needing market cap data\n`);

    let fetched = 0;
    let updated = 0;

    for (const company of companies) {
      try {
        const marketData = await this.fetchMarketCap(company.symbol);

        if (marketData?.marketCap) {
          fetched++;

          const periods = this.database.prepare(`
            SELECT cm.fiscal_period, cm.period_type, fd.data
            FROM calculated_metrics cm
            JOIN financial_data fd ON fd.company_id = cm.company_id
              AND fd.fiscal_date_ending = cm.fiscal_period
              AND fd.statement_type = 'income_statement'
              AND fd.period_type = cm.period_type
            WHERE cm.company_id = ?
              AND cm.pe_ratio IS NULL
              AND cm.valuation_applicable = 1
              AND cm.fiscal_period >= '2023-01-01'
            ORDER BY cm.fiscal_period DESC
            LIMIT 2
          `).all(company.id);

          for (const period of periods) {
            const success = this.calculateValuationWithMarketCap(
              company.id, period.fiscal_period, period.period_type,
              marketData.marketCap, period.data
            );
            if (success) updated++;
          }

          if ((fetched % 20) === 0) {
            process.stdout.write(`\r  Fetched ${fetched}/${companies.length} market caps, updated ${updated} periods`);
          }
        }

        await new Promise(r => setTimeout(r, delayMs));
      } catch {
        this.stats.errors++;
      }
    }

    console.log(`\n\n  Market caps fetched: ${fetched}`);
    console.log(`  Valuations updated: ${updated}`);

    this.stats.marketCapFetched = fetched;
    this.stats.valuationsAdded = updated;
  }

  /**
   * Print coverage statistics
   */
  printCoverageStats() {
    console.log('\n📊 Valuation Coverage Statistics:\n');

    const stats = this.database.prepare(`
      SELECT
        COUNT(*) as total_periods,
        SUM(CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END) as with_pe,
        SUM(CASE WHEN valuation_applicable = 0 THEN 1 ELSE 0 END) as not_applicable,
        SUM(CASE WHEN pe_ratio IS NULL AND valuation_applicable = 1 THEN 1 ELSE 0 END) as missing
      FROM calculated_metrics
      WHERE period_type = 'annual'
    `).get();

    const applicablePeriods = stats.total_periods - stats.not_applicable;
    const coverageAll = ((stats.with_pe / stats.total_periods) * 100).toFixed(1);
    const coverageApplicable = ((stats.with_pe / applicablePeriods) * 100).toFixed(1);

    console.log(`  Total annual periods:        ${stats.total_periods.toLocaleString()}`);
    console.log(`  With P/E ratio:              ${stats.with_pe.toLocaleString()}`);
    console.log(`  Not applicable (ETF/LP/etc): ${stats.not_applicable.toLocaleString()}`);
    console.log(`  Missing (should have):       ${stats.missing.toLocaleString()}`);
    console.log('');
    console.log(`  Overall coverage:            ${coverageAll}%`);
    console.log(`  Applicable coverage:         ${coverageApplicable}%`);
  }

  /**
   * Run all improvements
   */
  async runAllImprovements(options = {}) {
    console.log('\n🚀 Running Valuation Coverage Improvements\n');
    console.log('='.repeat(60));

    this.markNonApplicableEntities();

    if (options.fetchMarketCap !== false) {
      await this.fetchAndUpdateMarketCaps({
        limit: options.marketCapLimit || 100,
        delayMs: options.delayMs || 200
      });
    }

    console.log('\n' + '='.repeat(60));
    this.printCoverageStats();

    return this.stats;
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  const options = {
    fetchMarketCap: true,
    marketCapLimit: 100,
    delayMs: 200
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-fetch') {
      options.fetchMarketCap = false;
    } else if (args[i] === '--limit' || args[i] === '-l') {
      options.marketCapLimit = parseInt(args[++i]);
    } else if (args[i] === '--stats' || args[i] === '-s') {
      options.statsOnly = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node scripts/improve-valuation-coverage.js [options]

Options:
  --no-fetch         Skip fetching market caps from Yahoo Finance
  --limit N, -l N    Limit market cap fetches to N companies (default: 100)
  --stats, -s        Only show coverage statistics
  --help, -h         Show this help message
      `);
      process.exit(0);
    }
  }

  const improver = new ValuationCoverageImprover();

  if (options.statsOnly) {
    improver.printCoverageStats();
  } else {
    improver.runAllImprovements(options);
  }
}

module.exports = ValuationCoverageImprover;
