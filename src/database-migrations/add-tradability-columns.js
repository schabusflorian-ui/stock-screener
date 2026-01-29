/**
 * Migration: Add tradability verification columns to companies
 *
 * Adds columns to track whether a company is actually publicly traded
 * and what Yahoo Finance symbol works for it.
 *
 * This helps distinguish between:
 * - Active publicly traded companies
 * - Delisted/defunct companies
 * - Private companies incorrectly added
 * - Companies with wrong symbol format
 */

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

console.log('Adding tradability columns to companies table...');

// Check which columns already exist
const columns = db.prepare("PRAGMA table_info(companies)").all();
const columnNames = columns.map(col => col.name);

const columnsToAdd = [
  {
    name: 'is_publicly_traded',
    type: 'INTEGER', // SQLite boolean (0/1/NULL)
    description: 'Whether company is verified as publicly traded (NULL=unchecked, 0=no, 1=yes)'
  },
  {
    name: 'yahoo_symbol',
    type: 'TEXT',
    description: 'The Yahoo Finance symbol that works for this company (may include exchange suffix)'
  },
  {
    name: 'tradability_checked_at',
    type: 'TEXT', // ISO datetime
    description: 'When tradability was last verified'
  }
];

let addedCount = 0;

for (const col of columnsToAdd) {
  if (columnNames.includes(col.name)) {
    console.log(`  Column '${col.name}' already exists, skipping`);
  } else {
    db.exec(`ALTER TABLE companies ADD COLUMN ${col.name} ${col.type};`);
    console.log(`  Added column '${col.name}' (${col.type})`);
    addedCount++;
  }
}

if (addedCount > 0) {
  // Create index for efficient querying of unverified companies
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_companies_tradability
    ON companies(country, is_publicly_traded)
    WHERE is_publicly_traded IS NULL;
  `);
  console.log('  Created index idx_companies_tradability');
}

console.log(`Migration complete: ${addedCount} columns added`);
