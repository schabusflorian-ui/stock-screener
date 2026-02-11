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
const MAX_PARAMETERS = 60000; // PostgreSQL limit is 65535, use 60000 for safety

/**
 * Get all table names from SQLite database
 * Automatically discovers all tables to migrate
 * @param {Database} sqliteDb - SQLite database instance
 * @param {Array<string>} excludeTables - Optional array of table names to exclude
 */
function getAllTableNames(sqliteDb, excludeTables = []) {
  const tables = sqliteDb.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  const allTables = tables.map(t => t.name);

  // Filter out excluded tables
  if (excludeTables.length > 0) {
    const excludeSet = new Set(excludeTables);
    return allTables.filter(t => !excludeSet.has(t));
  }

  return allTables;
}

/**
 * Convert SQLite schema to PostgreSQL
 */
function convertSchemaType(sqliteType) {
  const type = (sqliteType || 'TEXT').toUpperCase();

  if (type.includes('INTEGER PRIMARY KEY AUTOINCREMENT')) {
    return 'BIGSERIAL PRIMARY KEY';
  }
  if (type.includes('INTEGER PRIMARY KEY')) {
    return 'BIGINT PRIMARY KEY';
  }
  if (type === 'INTEGER' || type === 'INT') {
    return 'BIGINT';
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
 * Extract UNIQUE constraints from SQLite table
 */
function getUniqueConstraints(sqliteDb, tableName) {
  try {
    // Get the CREATE TABLE statement
    const schema = sqliteDb.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name=?
    `).get(tableName);

    if (!schema || !schema.sql) return [];

    const constraints = [];
    const sql = schema.sql;

    // Match UNIQUE constraints in format: UNIQUE(col1, col2, ...)
    const uniqueRegex = /UNIQUE\s*\(([^)]+)\)/gi;
    let match;

    while ((match = uniqueRegex.exec(sql)) !== null) {
      const columns = match[1].split(',').map(c => c.trim());
      constraints.push(columns);
    }

    return constraints;
  } catch (err) {
    return [];
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
      const colType = (col.type || 'TEXT').toUpperCase();

      // Convert SQLite defaults to PostgreSQL
      if (defaultVal === 'CURRENT_TIMESTAMP') {
        defaultVal = 'NOW()';
      } else if (defaultVal === "datetime('now')") {
        // Convert SQLite datetime() to PostgreSQL NOW()
        // Keep as TEXT if column type is TEXT, otherwise use TIMESTAMP
        defaultVal = colType === 'TEXT' ? "NOW()::TEXT" : 'NOW()';
      } else if (defaultVal === '0' && colType === 'BOOLEAN') {
        defaultVal = 'false';
      } else if (defaultVal === '1' && colType === 'BOOLEAN') {
        defaultVal = 'true';
      } else if (defaultVal === '1' || defaultVal === '0') {
        // Keep other numeric defaults as-is
      }
      def += ` DEFAULT ${defaultVal}`;
    }

    return def;
  });

  // Extract UNIQUE constraints
  const uniqueConstraints = getUniqueConstraints(sqliteDb, tableName);

  const createSQL = `
    CREATE TABLE IF NOT EXISTS "${tableName}" (
      ${columnDefs.join(',\n      ')}
    )
  `;

  try {
    await pgClient.query(createSQL);
    console.log(`  ✅ Created table: ${tableName}`);

    // Add UNIQUE constraints if they don't exist
    for (const columns of uniqueConstraints) {
      const constraintName = `${tableName}_${columns.join('_')}_key`;
      const columnList = columns.map(c => `"${c}"`).join(', ');

      try {
        await pgClient.query(`
          ALTER TABLE "${tableName}"
          ADD CONSTRAINT "${constraintName}"
          UNIQUE (${columnList})
        `);
        console.log(`    ✅ Added UNIQUE constraint: ${constraintName}`);
      } catch (err) {
        // Constraint might already exist (IF NOT EXISTS not supported for constraints)
        if (!err.message.includes('already exists')) {
          console.log(`    ⚠️  Could not add UNIQUE constraint: ${err.message}`);
        }
      }
    }

    return true;
  } catch (err) {
    console.error(`  ❌ Failed to create ${tableName}: ${err.message}`);
    return false;
  }
}

/**
 * Create a new PostgreSQL client connection
 */
function createPgClient(onConnectionError) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    // Prevent connection timeouts during long-running migration
    connectionTimeoutMillis: 60000, // 60 seconds to establish connection
    keepAlive: true, // Enable TCP keepalive
    keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
    statement_timeout: 600000, // 10 minutes per query (Railway default timeout)
  });

  // Handle connection errors at the driver level
  if (onConnectionError) {
    client.on('error', (err) => {
      console.log(`\n⚠️  Client error event: ${err.message}`);
      onConnectionError(err);
    });
  }

  return client;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get column names for a table in PostgreSQL
 */
async function getPostgresTableColumns(pgClient, tableName) {
  const result = await pgClient.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return result.rows.map(r => r.column_name);
}

/**
 * Migrate data from SQLite table to PostgreSQL with automatic retry on connection failures
 * @param {Object} opts - Options
 * @param {boolean} opts.dataOnly - If true, only insert into columns that exist in both SQLite and Postgres (for existing tables)
 */
async function migrateTableData(pgClientRef, sqliteDb, tableName, opts = {}) {
  const { dataOnly = false } = opts;

  // Check if table exists in SQLite
  const tableExists = sqliteDb.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(tableName);

  if (!tableExists) {
    return { skipped: true, rows: 0 };
  }

  // In data-only mode, check table exists in Postgres and get column intersection
  let columns = getTableInfo(sqliteDb, tableName);
  if (dataOnly) {
    try {
      const pgColumns = await getPostgresTableColumns(pgClientRef.client, tableName);
      if (pgColumns.length === 0) {
        console.log(`  ⏭️  ${tableName}: table does not exist in Postgres, skipping`);
        return { skipped: true, rows: 0 };
      }
      const pgColSet = new Set(pgColumns);
      columns = columns.filter(c => pgColSet.has(c.name));
      if (columns.length === 0) {
        console.log(`  ⏭️  ${tableName}: no common columns, skipping`);
        return { skipped: true, rows: 0 };
      }
      if (columns.length < getTableInfo(sqliteDb, tableName).length) {
        console.log(`  ℹ️  ${tableName}: using ${columns.length} shared columns (Postgres schema may differ)`);
      }
    } catch (err) {
      console.error(`  ❌ ${tableName}: could not read Postgres schema: ${err.message}`);
      return { skipped: true, rows: 0 };
    }
  }

  // Get row count
  const { count } = sqliteDb.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get();

  if (count === 0) {
    console.log(`  ⏭️  ${tableName}: empty`);
    return { skipped: false, rows: 0 };
  }

  const columnNames = columns.map(c => `"${c.name}"`);

  console.log(`  📦 ${tableName}: migrating ${count} rows...`);

  let migrated = 0;
  let offset = 0;
  const MAX_RETRIES = 5;
  let connectionErrorOccurred = false;

  // Calculate optimal batch size based on column count to avoid PostgreSQL parameter limit
  const columnCount = columns.length;
  const maxRowsPerBatch = Math.min(BATCH_SIZE, Math.floor(MAX_PARAMETERS / columnCount));
  const effectiveBatchSize = Math.max(1, maxRowsPerBatch);

  if (effectiveBatchSize < BATCH_SIZE) {
    console.log(`    ℹ️  Using batch size of ${effectiveBatchSize} rows (${columnCount} columns × ${effectiveBatchSize} = ${columnCount * effectiveBatchSize} parameters)`);
  }

  // Set up connection error handler
  const handleConnectionError = async (err) => {
    if (!connectionErrorOccurred) {
      connectionErrorOccurred = true;
      console.log(`\n⚠️  Handling connection error: ${err.message}`);
    }
  };

  while (offset < count) {
    // Check if we need to reconnect due to connection error
    if (connectionErrorOccurred) {
      console.log(`\n⚠️  Connection error detected, reconnecting...`);

      // Close old connection
      try {
        pgClientRef.client.removeAllListeners('error');
        await pgClientRef.client.end();
      } catch (e) {
        // Ignore errors closing dead connection
      }

      // Retry reconnection with exponential backoff
      let reconnectAttempt = 0;
      const MAX_RECONNECT_ATTEMPTS = 5;
      let reconnected = false;

      while (!reconnected && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempt++;
        const backoffMs = Math.min(5000 * Math.pow(2, reconnectAttempt - 1), 60000); // 5s, 10s, 20s, 40s, 60s

        console.log(`\n    Reconnect attempt ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS}, waiting ${backoffMs/1000}s...`);
        await sleep(backoffMs);

        try {
          // Create new connection with error handler
          pgClientRef.client = createPgClient(handleConnectionError);
          await pgClientRef.client.connect();
          console.log(`    ✅ Reconnected to PostgreSQL`);

          // Re-enable replica mode
          await pgClientRef.client.query('SET session_replication_role = replica');

          reconnected = true;
          connectionErrorOccurred = false;
        } catch (reconnectErr) {
          console.log(`    ❌ Reconnection failed: ${reconnectErr.message}`);

          if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
            throw new Error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts: ${reconnectErr.message}`);
          }
          // Try again after backoff
        }
      }
    }

    // Fetch batch from SQLite
    const rows = sqliteDb.prepare(`
      SELECT * FROM "${tableName}"
      LIMIT ${effectiveBatchSize} OFFSET ${offset}
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
        // Only convert to boolean if the SQLite column type is explicitly BOOLEAN
        // (not for INTEGER columns that happen to store 0/1)
        if (col.type === 'BOOLEAN') {
          return val === 1 || val === true || val === 'true';
        }
        return val;
      })
    );

    let retryCount = 0;
    let batchSuccess = false;

    while (!batchSuccess && retryCount < MAX_RETRIES) {
      // If connection error occurred, break and reconnect at the top of the main loop
      if (connectionErrorOccurred) {
        break;
      }

      try {
        await pgClientRef.client.query(insertSQL, values);
        migrated += rows.length;
        batchSuccess = true;
      } catch (err) {
        // Check if it's a connection error
        const isConnectionError =
          err.message.includes('Connection terminated') ||
          err.message.includes('Connection lost') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('socket hang up');

        if (isConnectionError && retryCount < MAX_RETRIES - 1) {
          retryCount++;
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
          console.log(`\n    ⚠️  Connection lost, reconnecting in ${backoffMs/1000}s (attempt ${retryCount}/${MAX_RETRIES})...`);

          // Close old connection
          try {
            pgClientRef.client.removeAllListeners('error');
            await pgClientRef.client.end();
          } catch (e) {
            // Ignore errors closing dead connection
          }

          // Wait before reconnecting
          await sleep(backoffMs);

          // Create new connection with error handler - wrap in try-catch to handle connection errors
          try {
            pgClientRef.client = createPgClient(handleConnectionError);
            await pgClientRef.client.connect();
            console.log(`    ✅ Reconnected to PostgreSQL`);

            // Re-enable replica mode
            await pgClientRef.client.query('SET session_replication_role = replica');

            // Retry the batch
            continue;
          } catch (reconnectErr) {
            console.log(`    ❌ Reconnection failed: ${reconnectErr.message}`);
            // Will retry on next iteration if retryCount < MAX_RETRIES - 1
            continue;
          }
        }

        // Not a connection error or max retries exceeded - try individual inserts
        console.error(`    ❌ Batch error: ${err.message}`);

        // Check if connection is still alive before trying individual inserts
        if (err.message.includes('not queryable') || err.message.includes('connection error')) {
          connectionErrorOccurred = true;
          break; // Will reconnect at top of main loop
        }

        for (const row of rows) {
          try {
            const singlePlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const singleSQL = `
              INSERT INTO "${tableName}" (${columnNames.join(', ')})
              VALUES (${singlePlaceholders})
              ON CONFLICT DO NOTHING
            `;
            const singleValues = columns.map(col => row[col.name]);
            await pgClientRef.client.query(singleSQL, singleValues);
            migrated++;
          } catch (rowErr) {
            // Check if individual insert failed due to connection error
            if (rowErr.message.includes('not queryable') || rowErr.message.includes('connection error')) {
              connectionErrorOccurred = true;
              break; // Stop individual inserts and reconnect
            }
            console.error(`    ❌ Row error: ${rowErr.message}`);
          }
        }
        batchSuccess = true; // Mark as done even if some individual rows failed
      }
    }

    if (!batchSuccess && !connectionErrorOccurred) {
      throw new Error(`Failed to migrate batch after ${MAX_RETRIES} retries`);
    }

    // Only advance offset if batch was successful
    if (batchSuccess) {
      offset += effectiveBatchSize;
      process.stdout.write(`\r    Progress: ${migrated}/${count} (${Math.floor(migrated/count*100)}%)`);
    }
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
 * Parse command-line args for --data-only flag
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const dataOnly = args.includes('--data-only');
  return { dataOnly };
}

/**
 * Main migration function
 */
async function migrate() {
  const { dataOnly } = parseArgs();

  console.log('\n🚀 SQLite to PostgreSQL Migration');
  if (dataOnly) {
    console.log('   Mode: --data-only (insert into existing tables)\n');
  } else {
    console.log('   Mode: full (create tables + migrate data)\n');
  }

  // Validate environment
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable required');
    console.log('');
    console.log('Usage:');
    console.log('  DATABASE_URL=postgresql://user:pass@host:5432/dbname node scripts/migrate-to-postgres.js');
    console.log('  DATABASE_URL=postgresql://... node scripts/migrate-to-postgres.js --data-only  # Sync data into existing tables');
    process.exit(1);
  }

  // Connect to SQLite - try multiple paths
  const sqlitePath = process.env.SQLITE_PATH || './data/stocks.db';
  const altSqlitePath = './database.sqlite';
  const resolvedPath = fs.existsSync(sqlitePath) ? sqlitePath : (fs.existsSync(altSqlitePath) ? altSqlitePath : null);
  if (!resolvedPath) {
    console.error(`❌ SQLite database not found. Tried: ${sqlitePath}, ${altSqlitePath}`);
    process.exit(1);
  }

  console.log(`📂 Source: ${resolvedPath}`);
  console.log(`📂 Target: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('');

  const sqliteDb = new Database(resolvedPath, { readonly: true });

  // Connect to PostgreSQL - use reference object so we can replace client on reconnect
  const globalConnectionErrorHandler = (err) => {
    console.log(`\n⚠️  Global connection error: ${err.message}`);
  };

  const pgClientRef = { client: createPgClient(globalConnectionErrorHandler) };

  try {
    await pgClientRef.client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Disable triggers during migration
    await pgClientRef.client.query('SET session_replication_role = replica');

    const results = {
      created: 0,
      migrated: 0,
      skipped: 0,
      totalRows: 0,
    };

    let TABLES;

    if (dataOnly) {
      // Data-only: migrate into tables that exist in BOTH SQLite and Postgres
      const sqliteTables = getAllTableNames(sqliteDb, []);
      const pgTablesResult = await pgClientRef.client.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' ORDER BY tablename
      `);
      const pgTableSet = new Set(pgTablesResult.rows.map(r => r.tablename));
      TABLES = sqliteTables.filter(t => pgTableSet.has(t));
      console.log(`📋 Data-only: migrating ${TABLES.length} tables (exist in both SQLite and Postgres)\n`);
    } else {
      // Full: create tables that don't exist in Postgres
      const pgTablesResult = await pgClientRef.client.query(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
      `);
      const alreadyMigrated = pgTablesResult.rows.map(r => r.tablename);
      TABLES = getAllTableNames(sqliteDb, alreadyMigrated);
      console.log(`📋 Full mode: ${TABLES.length} tables to create and migrate\n`);
    }

    for (const table of TABLES) {
      if (dataOnly) {
        const { skipped, rows } = await migrateTableData(pgClientRef, sqliteDb, table, { dataOnly: true });
        if (!skipped) {
          results.migrated++;
          results.totalRows += rows;
          await resetSequences(pgClientRef.client, table);
        } else {
          results.skipped++;
        }
      } else {
        const created = await createPostgresTable(pgClientRef.client, sqliteDb, table);
        if (created) {
          results.created++;
          const { skipped, rows } = await migrateTableData(pgClientRef, sqliteDb, table);
          if (!skipped) {
            results.migrated++;
            results.totalRows += rows;
            await resetSequences(pgClientRef.client, table);
          } else {
            results.skipped++;
          }
        }
      }
    }

    // Re-enable triggers
    await pgClientRef.client.query('SET session_replication_role = DEFAULT');

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary');
    console.log('='.repeat(50));
    if (!dataOnly) {
      console.log(`   Tables created: ${results.created}`);
    }
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
    await pgClientRef.client.end();
  }
}

// Run if executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
