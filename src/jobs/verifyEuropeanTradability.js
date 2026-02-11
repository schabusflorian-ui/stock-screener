/**
 * Verify European Company Tradability
 *
 * Tests whether European companies are actually publicly traded
 * by checking if Yahoo Finance can find a valid quote.
 *
 * Usage:
 *   node src/jobs/verifyEuropeanTradability.js              # Verify all unchecked
 *   node src/jobs/verifyEuropeanTradability.js --country DE # Specific country
 *   node src/jobs/verifyEuropeanTradability.js --limit 100  # Limit batch size
 *   node src/jobs/verifyEuropeanTradability.js --recheck    # Re-verify all
 */

const { getDatabaseAsync } = require('../lib/db');

// Yahoo Finance exchange suffixes by country
const COUNTRY_SUFFIXES = {
  'GB': ['.L', '.IL'],           // London, LSE International
  'DE': ['.DE', '.F', '.XETRA'], // XETRA, Frankfurt
  'FR': ['.PA'],                 // Euronext Paris
  'NL': ['.AS'],                 // Euronext Amsterdam
  'BE': ['.BR'],                 // Euronext Brussels
  'ES': ['.MC'],                 // Bolsa de Madrid
  'IT': ['.MI'],                 // Borsa Italiana
  'DK': ['.CO'],                 // Nasdaq Copenhagen
  'NO': ['.OL'],                 // Oslo Bors
  'SE': ['.ST'],                 // Nasdaq Stockholm
  'FI': ['.HE'],                 // Nasdaq Helsinki
  'PL': ['.WA'],                 // Warsaw Stock Exchange
  'PT': ['.LS'],                 // Euronext Lisbon
  'GR': ['.AT'],                 // Athens Stock Exchange
  'AT': ['.VI'],                 // Vienna Stock Exchange
  'LU': ['.LU'],                 // Luxembourg
  'IE': ['.IR'],                 // Irish Stock Exchange
  'CH': ['.SW'],                 // SIX Swiss Exchange
};

// European countries to check
const EUROPEAN_COUNTRIES = Object.keys(COUNTRY_SUFFIXES);

class TradabilityVerifier {
  constructor() {
    this.databasePromise = null;
    this.yahooFinance = null;
    this.rateLimitMs = 3000; // 3 seconds between Yahoo requests (very conservative)
    this.lastRequestTime = 0;
    this.maxRetries = 5;
    this.retryDelayMs = 30000; // 30 seconds on rate limit
    this.stats = {
      total: 0,
      verified: 0,
      notTradable: 0,
      errors: 0,
    };
  }

  async getDatabase() {
    if (!this.databasePromise) {
      this.databasePromise = getDatabaseAsync();
    }
    return this.databasePromise;
  }

  /**
   * Initialize Yahoo Finance (ESM module)
   */
  async init() {
    if (!this.yahooFinance) {
      const yf = await import('yahoo-finance2');
      const YahooFinance = yf.default;
      this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    }
  }

  /**
   * Rate limiter
   */
  async rateLimit() {
    const elapsed = Date.now() - this.lastRequestTime;
    if (elapsed < this.rateLimitMs) {
      await new Promise(r => setTimeout(r, this.rateLimitMs - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Test a single symbol with retry on rate limit
   */
  async testSingleSymbol(testSymbol, retryCount = 0) {
    try {
      await this.rateLimit();
      const quote = await this.yahooFinance.quote(testSymbol);

      if (quote && quote.regularMarketPrice > 0) {
        return {
          found: true,
          tradable: true,
          yahooSymbol: testSymbol,
          price: quote.regularMarketPrice,
          currency: quote.currency,
          quoteType: quote.quoteType,
        };
      }
      return { found: false };
    } catch (error) {
      // Handle rate limiting with retry
      if (error.message?.includes('429') || error.message?.includes('Too Many')) {
        if (retryCount < this.maxRetries) {
          const delay = this.retryDelayMs * (retryCount + 1);
          console.log(`  Rate limited, waiting ${delay/1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          return this.testSingleSymbol(testSymbol, retryCount + 1);
        }
        throw new Error('Rate limit exceeded after retries');
      }
      // Symbol not found is expected
      if (error.message?.includes('Not Found') || error.message?.includes('404')) {
        return { found: false };
      }
      // Other errors
      return { found: false, error: error.message };
    }
  }

  /**
   * Test if a symbol is tradable on Yahoo Finance
   * @returns {Object} { tradable: boolean, yahooSymbol: string|null }
   */
  async testSymbol(symbol, country) {
    // Get suffixes for this country
    const suffixes = COUNTRY_SUFFIXES[country] || [''];

    // Clean the symbol - remove existing suffix if present
    const baseSymbol = symbol.replace(/\.(DE|F|PA|AS|L|MI|MC|CO|OL|ST|HE|WA|LS|AT|VI|LU|IR|SW|BR|IL|XETRA)$/i, '');

    // Try the base symbol with each suffix
    const symbolsToTry = [baseSymbol, ...suffixes.map(s => baseSymbol + s)];

    for (const testSymbol of symbolsToTry) {
      const result = await this.testSingleSymbol(testSymbol);

      if (result.found && result.tradable) {
        return result;
      }
    }

    return { tradable: false, yahooSymbol: null };
  }

  /**
   * Get companies to verify
   */
  async getCompaniesToVerify(options = {}) {
    const { country, limit, recheck } = options;

    let query = `
      SELECT id, symbol, name, country, exchange
      FROM companies
    `;
    const params = [];

    if (country) {
      query += ' WHERE country = $1';
      params.push(country);
    } else {
      const placeholders = EUROPEAN_COUNTRIES.map((_, index) => `$${index + 1}`).join(',');
      query += ` WHERE country IN (${placeholders})`;
      params.push(...EUROPEAN_COUNTRIES);
    }

    if (!recheck) {
      query += ' AND is_publicly_traded IS NULL';
    }

    query += ' ORDER BY country, symbol';

    if (limit) {
      query += ` LIMIT ${parseInt(limit)}`;
    }

    const database = await this.getDatabase();
    const result = await database.query(query, params);
    return result.rows;
  }

  /**
   * Update company tradability status
   */
  async updateCompany(companyId, result) {
    const database = await this.getDatabase();
    await database.query(`
      UPDATE companies
      SET is_publicly_traded = $1,
          yahoo_symbol = $2,
          tradability_checked_at = $3
      WHERE id = $4
    `, [
      result.tradable ? 1 : 0,
      result.yahooSymbol,
      new Date().toISOString(),
      companyId
    ]);
  }

  /**
   * Run verification
   */
  async run(options = {}) {
    await this.init();

    console.log('\n' + '='.repeat(60));
    console.log('  European Tradability Verification');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    if (options.country) console.log(`  Country: ${options.country}`);
    if (options.limit) console.log(`  Limit: ${options.limit}`);
    if (options.recheck) console.log(`  Mode: Re-check all`);
    console.log('='.repeat(60) + '\n');

    const companies = await this.getCompaniesToVerify(options);
    this.stats.total = companies.length;

    console.log(`Found ${companies.length} companies to verify\n`);

    if (companies.length === 0) {
      console.log('No companies to verify. Use --recheck to re-verify all.');
      return this.stats;
    }

    let currentCountry = null;

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];

      // Print country header
      if (company.country !== currentCountry) {
        currentCountry = company.country;
        console.log(`\n--- ${currentCountry} ---`);
      }

      // Progress
      const pct = ((i + 1) / companies.length * 100).toFixed(1);
      process.stdout.write(`[${i + 1}/${companies.length}] ${pct}% ${company.symbol.padEnd(12)}`);

      try {
        const result = await this.testSymbol(company.symbol, company.country);

        if (result.tradable) {
          console.log(`  ✓ Tradable (${result.yahooSymbol}) ${result.currency} ${result.price}`);
          this.stats.verified++;
        } else {
          console.log(`  ✗ Not found`);
          this.stats.notTradable++;
        }

        await this.updateCompany(company.id, result);

      } catch (error) {
        console.log(`  ⚠ Error: ${error.message}`);
        this.stats.errors++;
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('  Verification Complete');
    console.log('='.repeat(60));
    console.log(`  Total checked:   ${this.stats.total}`);
    console.log(`  ✓ Tradable:      ${this.stats.verified} (${(this.stats.verified/this.stats.total*100).toFixed(1)}%)`);
    console.log(`  ✗ Not tradable:  ${this.stats.notTradable} (${(this.stats.notTradable/this.stats.total*100).toFixed(1)}%)`);
    console.log(`  ⚠ Errors:        ${this.stats.errors}`);
    console.log('='.repeat(60) + '\n');

    return this.stats;
  }

  /**
   * Get summary of tradability status
   */
  async getSummary() {
    const database = await this.getDatabase();
    const placeholders = EUROPEAN_COUNTRIES.map((_, index) => `$${index + 1}`).join(',');
    const summaryResult = await database.query(`
      SELECT
        country,
        COUNT(*) as total,
        SUM(CASE WHEN is_publicly_traded = 1 THEN 1 ELSE 0 END) as tradable,
        SUM(CASE WHEN is_publicly_traded = 0 THEN 1 ELSE 0 END) as not_tradable,
        SUM(CASE WHEN is_publicly_traded IS NULL THEN 1 ELSE 0 END) as unchecked
      FROM companies
      WHERE country IN (${placeholders})
      GROUP BY country
      ORDER BY country
    `, EUROPEAN_COUNTRIES);

    return summaryResult.rows;
  }
}

// CLI entry point
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    const options = {
      country: null,
      limit: null,
      recheck: false,
    };

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--country' && args[i + 1]) {
        options.country = args[i + 1].toUpperCase();
        i++;
      } else if (args[i] === '--limit' && args[i + 1]) {
        options.limit = parseInt(args[i + 1]);
        i++;
      } else if (args[i] === '--recheck') {
        options.recheck = true;
      } else if (args[i] === '--status') {
        const verifier = new TradabilityVerifier();
        const summary = await verifier.getSummary();

        console.log('\n' + '='.repeat(60));
        console.log('  European Tradability Status');
        console.log('='.repeat(60));
        console.log('Country | Total | Tradable | Not Tradable | Unchecked');
        console.log('-'.repeat(60));

        let totals = { total: 0, tradable: 0, not_tradable: 0, unchecked: 0 };
        for (const row of summary) {
          console.log(
            `${row.country.padEnd(7)} | ${String(row.total).padStart(5)} | ${String(row.tradable).padStart(8)} | ${String(row.not_tradable).padStart(12)} | ${String(row.unchecked).padStart(9)}`
          );
          totals.total += row.total;
          totals.tradable += row.tradable;
          totals.not_tradable += row.not_tradable;
          totals.unchecked += row.unchecked;
        }
        console.log('-'.repeat(60));
        console.log(
          `${'TOTAL'.padEnd(7)} | ${String(totals.total).padStart(5)} | ${String(totals.tradable).padStart(8)} | ${String(totals.not_tradable).padStart(12)} | ${String(totals.unchecked).padStart(9)}`
        );
        console.log('='.repeat(60) + '\n');
        process.exit(0);
      } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
European Tradability Verifier

Usage:
  node src/jobs/verifyEuropeanTradability.js [options]

Options:
  --country XX    Verify only companies from country code (e.g., DE, GB)
  --limit N       Limit to N companies
  --recheck       Re-verify all (including already checked)
  --status        Show current tradability status
  --help, -h      Show this help

Examples:
  node src/jobs/verifyEuropeanTradability.js                     # Verify all unchecked
  node src/jobs/verifyEuropeanTradability.js --country DE        # Only Germany
  node src/jobs/verifyEuropeanTradability.js --limit 50          # First 50
  node src/jobs/verifyEuropeanTradability.js --status            # Show summary
`);
        process.exit(0);
      }
    }

    // Run verification
    const verifier = new TradabilityVerifier();
    await verifier.run(options);
    process.exit(0);
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = TradabilityVerifier;
