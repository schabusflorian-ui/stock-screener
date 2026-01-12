// src/lib/db.js
// Database abstraction layer supporting both SQLite (development) and PostgreSQL (production)

const path = require('path');
const fs = require('fs');

// Determine database type from environment
const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = DATABASE_URL && DATABASE_URL.startsWith('postgres');

let db = null;
let dbType = 'sqlite';

/**
 * Initialize SQLite database
 */
function initSQLite() {
  const Database = require('better-sqlite3');

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'stocks.db');
  const sqliteDb = new Database(dbPath);

  // Enable foreign keys and WAL mode
  sqliteDb.pragma('foreign_keys = ON');
  sqliteDb.pragma('journal_mode = WAL');

  console.log(`📊 SQLite database initialized: ${dbPath}`);

  return {
    type: 'sqlite',
    raw: sqliteDb,

    // Query methods that match a common interface
    query: (sql, params = []) => {
      const stmt = sqliteDb.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return { rows: stmt.all(...params) };
      }
      const result = stmt.run(...params);
      return {
        rows: [],
        rowCount: result.changes,
        lastInsertRowid: result.lastInsertRowid
      };
    },

    // Execute raw SQL (for schema changes)
    exec: (sql) => sqliteDb.exec(sql),

    // Prepare statement
    prepare: (sql) => sqliteDb.prepare(sql),

    // Transaction support
    transaction: (fn) => sqliteDb.transaction(fn),

    // Health check
    healthCheck: async () => {
      try {
        sqliteDb.prepare('SELECT 1').get();
        return true;
      } catch (err) {
        console.error('SQLite health check failed:', err);
        return false;
      }
    },

    // Close connection
    close: () => {
      sqliteDb.close();
      console.log('🔒 SQLite connection closed');
    }
  };
}

/**
 * Initialize PostgreSQL database
 */
async function initPostgres() {
  const { Pool } = require('pg');

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
    min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    client.release();
    console.log(`📊 PostgreSQL database connected`);
  } catch (err) {
    console.error('Failed to connect to PostgreSQL:', err.message);
    throw err;
  }

  // Connection pool events
  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
  });

  return {
    type: 'postgres',
    raw: pool,

    // Query methods
    query: async (sql, params = []) => {
      // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
      let pgSql = sql;
      let paramIndex = 0;
      pgSql = pgSql.replace(/\?/g, () => `$${++paramIndex}`);

      return pool.query(pgSql, params);
    },

    // Execute raw SQL
    exec: async (sql) => pool.query(sql),

    // Get a client for transactions
    getClient: () => pool.connect(),

    // Transaction support (different API than SQLite)
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    // Health check
    healthCheck: async () => {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch (err) {
        console.error('PostgreSQL health check failed:', err);
        return false;
      }
    },

    // Close pool
    close: async () => {
      await pool.end();
      console.log('🔒 PostgreSQL pool closed');
    }
  };
}

/**
 * Get database instance (singleton)
 */
async function getDatabase() {
  if (db) return db;

  if (isPostgres) {
    dbType = 'postgres';
    db = await initPostgres();
  } else {
    dbType = 'sqlite';
    db = initSQLite();
  }

  return db;
}

/**
 * Get database instance synchronously (for SQLite backwards compatibility)
 * Throws error if using PostgreSQL
 */
function getDatabaseSync() {
  if (isPostgres) {
    throw new Error('getDatabaseSync() not supported with PostgreSQL. Use await getDatabase() instead.');
  }

  if (db) return db;

  db = initSQLite();
  return db;
}

/**
 * Check database type
 */
function getDatabaseType() {
  return dbType;
}

/**
 * Check if using PostgreSQL
 */
function isUsingPostgres() {
  return isPostgres;
}

/**
 * SQL dialect helpers - convert between SQLite and PostgreSQL syntax
 */
const dialect = {
  // Auto-increment primary key
  autoIncrement: isPostgres ? 'SERIAL' : 'INTEGER',

  // Primary key constraint
  primaryKey: isPostgres ? 'PRIMARY KEY' : 'PRIMARY KEY AUTOINCREMENT',

  // Current timestamp
  currentTimestamp: isPostgres ? 'NOW()' : 'CURRENT_TIMESTAMP',

  // Boolean type
  boolean: isPostgres ? 'BOOLEAN' : 'INTEGER',

  // JSON type
  json: isPostgres ? 'JSONB' : 'TEXT',

  // Upsert syntax
  upsertConflict: (columns) => {
    if (isPostgres) {
      return `ON CONFLICT (${columns}) DO UPDATE SET`;
    }
    return `ON CONFLICT(${columns}) DO UPDATE SET`;
  },

  // Returning clause
  returning: isPostgres ? 'RETURNING *' : '',

  // LIMIT/OFFSET
  limitOffset: (limit, offset) => {
    if (isPostgres) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit} OFFSET ${offset}`;
  },

  // Convert SQLite-specific syntax to PostgreSQL
  convertQuery: (sql) => {
    if (!isPostgres) return sql;

    let converted = sql;

    // Replace AUTOINCREMENT with SERIAL
    converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

    // Replace datetime() function
    converted = converted.replace(/datetime\('now'\)/gi, 'NOW()');
    converted = converted.replace(/CURRENT_TIMESTAMP/gi, 'NOW()');

    // Replace strftime
    converted = converted.replace(/strftime\('%Y-%m-%d', ([^)]+)\)/gi, 'DATE($1)');

    // Replace || for string concatenation (PostgreSQL also uses ||)
    // No change needed

    // Replace IFNULL with COALESCE
    converted = converted.replace(/IFNULL\(/gi, 'COALESCE(');

    // Replace GLOB with LIKE (case-sensitive in PostgreSQL)
    converted = converted.replace(/ GLOB /gi, ' LIKE ');

    return converted;
  }
};

module.exports = {
  getDatabase,
  getDatabaseSync,
  getDatabaseType,
  isUsingPostgres,
  dialect,
  // Export initialization functions for testing
  initSQLite,
  initPostgres
};
