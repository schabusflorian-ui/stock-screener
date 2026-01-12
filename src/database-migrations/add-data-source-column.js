#!/usr/bin/env node
// src/database-migrations/add-data-source-column.js

/**
 * Migration: Add data_source column to calculated_metrics
 *
 * This allows tracking whether metrics came from:
 * - 'sec' - US SEC EDGAR filings
 * - 'xbrl' - EU/UK ESEF filings via filings.xbrl.org
 * - Future: 'hkex', 'tse', etc.
 */

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('\n📊 Migration: Adding data_source column to calculated_metrics\n');

  // Check if column already exists
  const columns = database.prepare("PRAGMA table_info(calculated_metrics)").all();
  const hasDataSource = columns.some(col => col.name === 'data_source');

  if (hasDataSource) {
    console.log('✅ data_source column already exists, skipping migration');
    return;
  }

  // Add column with default 'sec' for existing US data
  console.log('Adding data_source column...');
  database.exec(`
    ALTER TABLE calculated_metrics ADD COLUMN data_source TEXT DEFAULT 'sec';
  `);

  // Create index for filtering by data source
  console.log('Creating index on data_source...');
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_data_source ON calculated_metrics(data_source);
  `);

  // Backfill existing records
  console.log('Backfilling existing records with data_source = "sec"...');
  const result = database.prepare(`
    UPDATE calculated_metrics SET data_source = 'sec' WHERE data_source IS NULL
  `).run();

  console.log(`\n✅ Migration complete!`);
  console.log(`   - Column added: data_source`);
  console.log(`   - Index created: idx_metrics_data_source`);
  console.log(`   - Records updated: ${result.changes}`);
}

// Run migration
migrate();
