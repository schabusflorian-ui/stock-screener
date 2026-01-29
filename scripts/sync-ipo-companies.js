#!/usr/bin/env node
/**
 * Sync Trading IPOs to Companies
 * Creates company entries for trading IPOs that don't have them
 */

const db = require('../src/database').getDatabase();

// Get all trading IPOs without company_id
const tradingIPOs = db.prepare(`
  SELECT * FROM ipo_tracker
  WHERE status = 'TRADING'
    AND (company_id IS NULL OR company_id = 0)
    AND (ticker_final IS NOT NULL OR ticker_proposed IS NOT NULL)
`).all();

console.log('Found', tradingIPOs.length, 'trading IPOs without companies\n');

let created = 0, linked = 0, errors = [];

for (const ipo of tradingIPOs) {
  const ticker = ipo.ticker_final || ipo.ticker_proposed;
  if (!ticker) continue;

  try {
    // Check if company already exists
    const existing = db.prepare(`SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE`).get(ticker);

    if (existing) {
      db.prepare(`UPDATE ipo_tracker SET company_id = ? WHERE id = ?`).run(existing.id, ipo.id);
      console.log('  Linked:', ipo.company_name, '->', ticker, '(company id:', existing.id + ')');
      linked++;
    } else {
      // Create new company
      const exchange = ipo.exchange_final || ipo.exchange_proposed || ipo.listing_venue;
      const country = ipo.headquarters_country || (ipo.region === 'US' ? 'US' : ipo.home_member_state) || 'US';

      const result = db.prepare(`
        INSERT INTO companies (symbol, name, sector, industry, exchange, country, is_active, cik)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
      `).run(ticker, ipo.company_name, ipo.sector, ipo.industry, exchange, country, ipo.cik);

      db.prepare(`UPDATE ipo_tracker SET company_id = ? WHERE id = ?`).run(result.lastInsertRowid, ipo.id);
      console.log('  Created:', ipo.company_name, '->', ticker, '(company id:', result.lastInsertRowid + ')');
      created++;
    }
  } catch (err) {
    errors.push(ipo.company_name + ': ' + err.message);
    console.error('  Error:', ipo.company_name, err.message);
  }
}

console.log('\n====================================');
console.log('Results:');
console.log('  Created:', created);
console.log('  Linked:', linked);
console.log('  Errors:', errors.length);
console.log('====================================');

if (errors.length > 0) {
  console.log('\nErrors:');
  errors.forEach(e => console.log('  -', e));
}
