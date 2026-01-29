#!/usr/bin/env node
// scripts/migrate-to-postgres.js
// Migrate data from SQLite to PostgreSQL

const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Load environment
require('dotenv').config();

const BATCH_SIZE = 1000;

// Tables to migrate in order (respecting foreign key dependencies)
const TABLES = [
  // Core tables (no dependencies)
  'companies',
  'stock_indexes',
  'tracked_subreddits',

  // Dependent on companies
  'company_identifiers',
  'financial_data',
  'calculated_metrics',
  'daily_prices',
  'liquidity_metrics',
  'stocktwits_messages',
  'news_articles',
  'combined_sentiment',
  'analyst_estimates',
  'data_fetch_log',

  // Dependent on stock_indexes
  'index_constituents',
  'index_metrics',

  // NL conversations
  'nl_conversations',
  'nl_messages',

  // Market-wide data
  'market_sentiment',

  // Add any additional tables from migrations
  'users',
  'user_preferences',
  'portfolios',
  'portfolio_positions',
  'watchlists',
  'watchlist_items',
  'trades',
  'paper_trades',
  'paper_portfolios',
  'backtest_runs',
  'backtest_results',
  'investor_holdings',
  'investor_13f_filings',
  'etf_holdings',
  'knowledge_base',
  'notes',
  'theses',
  'alerts',
  'update_jobs',
  'update_runs',
  'sec_filings',
  'earnings_calendar',
  'macro_indicators',
  'factor_exposures',
  'risk_metrics',
  'sessions',
];

/**
 * Convert SQLite schema to PostgreSQL
 */
function convertSchemaType(sqliteType) {
  const type = (sqliteType || 'TEXT').toUpperCase();

  if (type.includes('INTEGER PRIMARY KEY AUTOINCREMENT')) {
    return 'SERIAL PRIMARY KEY';
  }
  if (type.includes('INTEGER PRIMARY KEY')) {
    return 'INTEGER PRIMARY KEY';
  }
  if (type === 'INTEGER' || type === 'INT') {
    return 'INTEGER';
  }
  if (type === 'REAL' || type === 'FLOAT' || type === 'DOUBLE') {
    return 'DOUBLE PRECISION';
  }
  if (type === 'BLOB') {
    return 'BYTEA';
  }
  if (type.includes('DATETIME') || type.includes('TIMESTAMP')) {
    return 'TIMESTAMP';
  }
  if (type === 'DATE') {
    return 'DATE';
  }
  if (type === 'BOOLEAN') {
    return 'BOOLEAN';
  }
  // TEXT, VARCHAR, etc.
  return 'TEXT';
}

/**
 * Get table info from SQLite
 */
function getTableInfo(sqliteDb, tableName) {
  try {
    return sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all();
  } catch {
    return null;
  }
}

/**
 * Create PostgreSQL table from SQLite schema
 */
async function createPostgresTable(pgClient, sqliteDb, tableName) {
  const columns = getTableInfo(sqliteDb, tableName);

  if (!columns || columns.length === 0) {
    console.log(`  ⏭️  Skipping ${tableName} (doesn't exist in SQLite)`);
    return false;
  }

  // Build CREATE TABLE statement
  const columnDefs = columns.map(col => {
    let def = `"${col.name}" ${convertSchemaType(col.type)}`;

    if (col.notnull && !col.pk) {
      def += ' NOT NULL';
    }

    if (col.dflt_value !== null && !col.pk) {
      let defaultVal = col.dflt_value;
      // Convert SQLite defaults to PostgreSQL
      if (defaultVal === 'CURRENT_TIMESTAMP') {
        defaultVal = 'NOW()';
      } else if (defaultVal === '1' || defaultVal === '0') {
        // Keep numeric defaults as-is
      }
      def += ` DEFAULT ${defaultVal}`;
    }

    return def;
  });

  const createSQL = `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      ${columnDefs.join(',\n      ')}
    )
  `;

  try {
    await pgClient.query(createSQL);
    console.log(`  ✅ Created table: ${tableName}`);
    return true;
  } catch (err) {
    console.error(`  ❌ Failed to create ${tableName}: ${err.message}`);
    return false;
  }
}

/**
 * Migrate data from SQLite table to PostgreSQL
 */
async function migrateTableData(pgClient, sqliteDb, tableName) {
  // Check if table exists in SQLite
  const tableExists = sqliteDb.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(tableName);

  if (!tableExists) {
    return { skipped: true, rows: 0 };
  }

  // Get row count
  const { count } = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get();

  if (count === 0) {
    console.log(`  ⏭️  ${tableName}: empty`);
    return { skipped: false, rows: 0 };
  }

  // Get column names
  const columns = getTableInfo(sqliteDb, tableName);
  const columnNames = columns.map(c => `"${c.name}"`);

  console.log(`  📦 ${tableName}: migrating ${count} rows...`);

  let migrated = 0;
  let offset = 0;

  while (offset < count) {
    // Fetch batch from SQLite
    const rows = sqliteDb.prepare(`
      SELECT * FROM "${tableName}"
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `).all();

    if (rows.length === 0) break;

    // Build INSERT statement
    const placeholders = rows.map((_, rowIdx) => {
      const rowPlaceholders = columns.map((_, colIdx) =>
        `$${rowIdx * columns.length + colIdx + 1}`
      );
      return `(${rowPlaceholders.join(', ')})`;
    }).join(',\n');

    const insertSQL = `
      INSERT INTO "${tableName}" (${columnNames.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT DO NOTHING
    `;

    // Flatten values
    const values = rows.flatMap(row =>
      columns.map(col => {
        const val = row[col.name];
        // Convert SQLite booleans (0/1) to PostgreSQL booleans
        if (col.type === 'BOOLEAN' || col.name.startsWith('is_')) {
          return val === 1 || val === true || val === 'true';
        }
        return val;
      })
    );

    try {
      await pgClient.query(insertSQL, values);
      migrated += rows.length;
    } catch (err) {
      console.error(`    ❌ Batch error: ${err.message}`);
      // Try individual inserts
      for (const row of rows) {
        try {
          const singlePlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');
          const singleSQL = `
            INSERT INTO "${tableName}" (${columnNames.join(', ')})
            VALUES (${singlePlaceholders})
            ON CONFLICT DO NOTHING
          `;
          const singleValues = columns.map(col => row[col.name]);
          await pgClient.query(singleSQL, singleValues);
          migrated++;
        } catch (rowErr) {
          console.error(`    ❌ Row error: ${rowErr.message}`);
        }
      }
    }

    offset += BATCH_SIZE;
    process.stdout.write(`\r    Progress: ${migrated}/${count}`);
  }

  console.log(`\r  ✅ ${tableName}: ${migrated} rows migrated`);
  return { skipped: false, rows: migrated };
}

/**
 * Reset sequences for auto-increment columns
 */
async function resetSequences(pgClient, tableName) {
  try {
    // Get serial columns
    const result = await pgClient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
        AND column_default LIKE 'nextval%'
    `, [tableName]);

    for (const row of result.rows) {
      const column = row.column_name;
      await pgClient.query(`
        SELECT setval(
          pg_get_serial_sequence($1, $2),
          COALESCE((SELECT MAX("${column}") FROM "${tableName}"), 1)
        )
      `, [tableName, column]);
    }
  } catch (err) {
    // Sequence might not exist, that's ok
  }
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('\n🚀 SQLite to PostgreSQL Migration\n');

  // Validate environment
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable required');
    console.log('');
    console.log('Usage:');
    console.log('  DATABASE_URL=postgresql://user:pass@host:5432/dbname node scripts/migrate-to-postgres.js');
    process.exit(1);
  }

  // Connect to SQLite
  const sqlitePath = process.env.SQLITE_PATH || './data/stocks.db';
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ SQLite database not found: ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`📂 Source: ${sqlitePath}`);
  console.log(`📂 Target: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('');

  const sqliteDb = new Database(sqlitePath, { readonly: true });

  // Connect to PostgreSQL
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Disable triggers during migration
    await pgClient.query('SET session_replication_role = replica');

    const results = {
      created: 0,
      migrated: 0,
      skipped: 0,
      totalRows: 0,
    };

    // Create tables and migrate data
    for (const table of TABLES) {
      const created = await createPostgresTable(pgClient, sqliteDb, table);
      if (created) {
        results.created++;
        const { skipped, rows } = await migrateTableData(pgClient, sqliteDb, table);
        if (!skipped) {
          results.migrated++;
          results.totalRows += rows;
          await resetSequences(pgClient, table);
        } else {
          results.skipped++;
        }
      }
    }

    // Re-enable triggers
    await pgClient.query('SET session_replication_role = DEFAULT');

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary');
    console.log('='.repeat(50));
    console.log(`   Tables created: ${results.created}`);
    console.log(`   Tables migrated: ${results.migrated}`);
    console.log(`   Tables skipped: ${results.skipped}`);
    console.log(`   Total rows: ${results.totalRows.toLocaleString()}`);
    console.log('='.repeat(50));
    console.log('\n✅ Migration complete!\n');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
}

// Run if executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
