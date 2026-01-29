// src/database-migrations/add-currency-columns.js
// Add currency columns for cross-currency comparison support

const { getDatabase } = require('../database');

// Currency mapping by country code
const COUNTRY_CURRENCY_MAP = {
  'US': 'USD',
  'GB': 'GBP',
  'UK': 'GBP',
  'DE': 'EUR',
  'FR': 'EUR',
  'IT': 'EUR',
  'ES': 'EUR',
  'NL': 'EUR',
  'BE': 'EUR',
  'AT': 'EUR',
  'FI': 'EUR',
  'IE': 'EUR',
  'PT': 'EUR',
  'GR': 'EUR',
  'LU': 'EUR',
  'CH': 'CHF',
  'SE': 'SEK',
  'NO': 'NOK',
  'DK': 'DKK',
  'PL': 'PLN',
  'JP': 'JPY',
  'CN': 'CNY',
  'HK': 'HKD',
  'SG': 'SGD',
  'AU': 'AUD',
  'NZ': 'NZD',
  'CA': 'CAD',
  'BR': 'BRL',
  'MX': 'MXN',
  'ZA': 'ZAR',
  'IN': 'INR',
  'KR': 'KRW',
};

// Default exchange rates (USD base)
const DEFAULT_EXCHANGE_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CHF: 0.90,
  JPY: 157.5,
  SEK: 11.0,
  NOK: 11.3,
  DKK: 7.05,
  PLN: 4.02,
  CAD: 1.44,
  AUD: 1.62,
  CNY: 7.30,
  INR: 85.5,
  KRW: 1480,
  BRL: 6.20,
  MXN: 17.2,
  SGD: 1.36,
  HKD: 7.82,
  ZAR: 18.5,
  NZD: 1.78,
};

function runMigration() {
  const db = getDatabase();

  console.log('Adding currency columns for cross-currency support...');

  // 1. Add reporting_currency to companies table
  try {
    db.exec('ALTER TABLE companies ADD COLUMN reporting_currency TEXT DEFAULT \'USD\'');
    console.log('✓ Added reporting_currency column to companies');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('→ reporting_currency column already exists');
    } else {
      throw e;
    }
  }

  // 2. Add market_cap_usd to price_metrics table
  try {
    db.exec('ALTER TABLE price_metrics ADD COLUMN market_cap_usd REAL');
    console.log('✓ Added market_cap_usd column to price_metrics');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('→ market_cap_usd column already exists');
    } else {
      throw e;
    }
  }

  // 3. Update reporting_currency based on country
  console.log('\nUpdating reporting_currency based on country...');

  const updateCurrency = db.prepare(`
    UPDATE companies SET reporting_currency = ? WHERE country = ?
  `);

  for (const [country, currency] of Object.entries(COUNTRY_CURRENCY_MAP)) {
    const result = updateCurrency.run(currency, country);
    if (result.changes > 0) {
      console.log(`  Updated ${result.changes} companies in ${country} to ${currency}`);
    }
  }

  // 4. Update market_cap_usd based on reporting currency
  console.log('\nCalculating market_cap_usd for non-USD companies...');

  // Get all non-USD companies with market cap
  const nonUsdCompanies = db.prepare(`
    SELECT c.id, c.reporting_currency, pm.market_cap
    FROM companies c
    JOIN price_metrics pm ON pm.company_id = c.id
    WHERE c.reporting_currency != 'USD'
      AND c.reporting_currency IS NOT NULL
      AND pm.market_cap IS NOT NULL
  `).all();

  const updateMarketCapUsd = db.prepare(`
    UPDATE price_metrics SET market_cap_usd = ? WHERE company_id = ?
  `);

  let updated = 0;
  for (const company of nonUsdCompanies) {
    const rate = DEFAULT_EXCHANGE_RATES[company.reporting_currency] || 1;
    const marketCapUsd = company.market_cap / rate;
    updateMarketCapUsd.run(marketCapUsd, company.id);
    updated++;
  }
  console.log(`  Updated ${updated} companies with USD-converted market caps`);

  // 5. For USD companies, market_cap_usd = market_cap
  const usdResult = db.prepare(`
    UPDATE price_metrics
    SET market_cap_usd = market_cap
    WHERE company_id IN (
      SELECT id FROM companies WHERE reporting_currency = 'USD' OR reporting_currency IS NULL
    )
  `).run();
  console.log(`  Set market_cap_usd = market_cap for ${usdResult.changes} USD companies`);

  // 6. Create index for faster lookups
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_companies_currency ON companies(reporting_currency)');
    console.log('✓ Created index on reporting_currency');
  } catch (e) {
    console.log('→ Index already exists');
  }

  console.log('\n✅ Currency migration complete!');

  // Print summary
  const summary = db.prepare(`
    SELECT
      reporting_currency,
      COUNT(*) as count,
      ROUND(SUM(pm.market_cap_usd) / 1e9, 2) as total_market_cap_usd_b
    FROM companies c
    LEFT JOIN price_metrics pm ON pm.company_id = c.id
    GROUP BY reporting_currency
    ORDER BY count DESC
  `).all();

  console.log('\nCurrency distribution:');
  console.table(summary);
}

// Run if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, COUNTRY_CURRENCY_MAP, DEFAULT_EXCHANGE_RATES };
