// src/lib/db.js
// Database abstraction layer supporting both SQLite (development) and PostgreSQL (production)

const path = require('path');
const fs = require('fs');

// Determine database type from environment
const DATABASE_URL = process.env.DATABASE_URL;
const isPostgres = !!(DATABASE_URL && DATABASE_URL.startsWith('postgres'));

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
      // Convert PostgreSQL-style $1, $2... placeholders to SQLite-style ?
      // This allows code written for PostgreSQL to work with SQLite
      let convertedSql = sql;
      const pgPlaceholders = sql.match(/\$\d+/g);
      if (pgPlaceholders) {
        // Get unique placeholders and sort by numeric value in descending order
        // This prevents replacing $1 before $10 (e.g., $10 would become ?0)
        const uniquePlaceholders = [...new Set(pgPlaceholders)].sort((a, b) => {
          return parseInt(b.substring(1)) - parseInt(a.substring(1));
        });
        // Replace each $N with ? in descending order
        uniquePlaceholders.forEach(placeholder => {
          // Use a regex that matches the exact placeholder with word boundary
          const regex = new RegExp('\\' + placeholder + '\\b', 'g');
          convertedSql = convertedSql.replace(regex, '?');
        });
      }

      const stmt = sqliteDb.prepare(convertedSql);
      if (convertedSql.trim().toUpperCase().startsWith('SELECT')) {
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
 * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
 * This properly handles string literals to avoid replacing ? inside quotes.
 *
 * @param {string} sql - SQL string with ? placeholders
 * @returns {string} - SQL string with $N placeholders
 */
function convertPlaceholders(sql) {
  let result = '';
  let paramIndex = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < sql.length) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Handle escape sequences in strings
    if ((inSingleQuote || inDoubleQuote) && char === '\\') {
      result += char + (nextChar || '');
      i += 2;
      continue;
    }

    // Track string boundaries (handle '' escape in single quotes)
    if (char === "'" && !inDoubleQuote) {
      if (inSingleQuote && nextChar === "'") {
        // Escaped single quote ''
        result += "''";
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    // Replace ? with $N only when not inside a string
    if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      paramIndex++;
      result += '$' + paramIndex;
    } else {
      result += char;
    }

    i++;
  }

  return result;
}

/**
 * Table conflict column mappings for INSERT OR REPLACE conversion
 * Maps table names to their primary key or unique constraint columns
 */
const TABLE_CONFLICT_COLUMNS = {
  // Core data tables
  companies: 'symbol',
  daily_prices: 'company_id, date',
  price_metrics: 'company_id',
  calculated_metrics: 'company_id, fiscal_period',

  // ETF tables
  etf_definitions: 'symbol',
  lazy_portfolios: 'slug',
  lazy_portfolio_allocations: 'portfolio_id, etf_symbol',

  // Factor tables
  stock_factor_scores: 'company_id, score_date',
  factor_ic_history: 'factor_id, calculation_date',
  factor_correlations: 'factor_id, calculation_date',
  daily_factor_returns: 'date',
  portfolio_factor_exposures: 'investor_id, snapshot_date',

  // Signal tables
  signal_ic_history: 'signal_type, horizon_days, calculated_date',
  signal_predictive_power: 'signal_type, horizon_days',
  aggregated_signals: 'company_id',

  // Sentiment tables
  sentiment_posts: 'post_id',
  stocktwits_messages: 'message_id',
  sentiment_summary: 'company_id, period',

  // Investor tables
  investor_holdings: 'investor_id, company_id, period_date',
  investor_performance_cache: 'investor_id, period',

  // Settings and user tables
  app_settings: 'key',
  user_preferences: 'user_id, preference_key',
  usage_tracking: 'user_id, usage_type, period_start, period_type',

  // Economic data
  economic_indicators: 'series_id, observation_date',
  yield_curve: 'curve_date',

  // Model/ML tables
  model_performance_log: 'model_name, version, log_date',
  ml_predictions: 'model_id, company_id, prediction_date',

  // Trading tables
  cointegration_pairs: 'symbol1, symbol2',
  var_exceptions: 'portfolio_id, exception_date',

  // IPO tables
  ipo_watchlist: 'ipo_id',
};

/**
 * Convert SQLite-specific SQL syntax to PostgreSQL
 *
 * Handles:
 * - INSERT OR IGNORE → ON CONFLICT DO NOTHING
 * - INSERT OR REPLACE → ON CONFLICT DO UPDATE
 * - COLLATE NOCASE → case-insensitive comparison
 * - GROUP_CONCAT → STRING_AGG
 * - IFNULL → COALESCE
 * - datetime('now') → NOW()
 * - strftime → date functions
 *
 * @param {string} sql - SQLite SQL string
 * @returns {string} - PostgreSQL-compatible SQL string
 */
function convertSQLDialect(sql) {
  let converted = sql;

  // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  // This is a simplified conversion - complex cases may need manual handling
  converted = converted.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)/gi,
    'INSERT INTO $1'
  );
  // Add ON CONFLICT DO NOTHING after VALUES clause if INSERT OR IGNORE was used
  if (/INSERT\s+OR\s+IGNORE/i.test(sql)) {
    // We need to add ON CONFLICT at the end - this is a heuristic
    // Real implementation would need to parse the full statement
    if (!converted.includes('ON CONFLICT')) {
      converted = converted.replace(/(\)\s*;?\s*)$/i, ') ON CONFLICT DO NOTHING$1');
    }
  }

  // INSERT OR REPLACE → INSERT ... ON CONFLICT (...) DO UPDATE SET ...
  // Uses table mapping to determine conflict columns
  const insertOrReplaceMatch = converted.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (insertOrReplaceMatch) {
    const tableName = insertOrReplaceMatch[1].toLowerCase();
    const columnList = insertOrReplaceMatch[2];
    const columns = columnList.split(',').map(c => c.trim());

    // Get conflict columns from mapping, or use 'id' as fallback
    const conflictCols = TABLE_CONFLICT_COLUMNS[tableName] || 'id';

    // Generate SET clause for all non-conflict columns
    const conflictColArray = conflictCols.split(',').map(c => c.trim());
    const updateCols = columns.filter(c => !conflictColArray.includes(c));
    const setClause = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ');

    // Replace INSERT OR REPLACE with INSERT INTO
    converted = converted.replace(
      /INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)/gi,
      'INSERT INTO $1'
    );

    // Add ON CONFLICT clause after the VALUES clause
    // Look for the closing parenthesis of VALUES and add ON CONFLICT there
    if (setClause) {
      converted = converted.replace(
        /\)\s*$/,
        `) ON CONFLICT (${conflictCols}) DO UPDATE SET ${setClause}`
      );
    } else {
      // All columns are conflict columns, use DO NOTHING
      converted = converted.replace(
        /\)\s*$/,
        `) ON CONFLICT (${conflictCols}) DO NOTHING`
      );
    }
  } else {
    // Simple fallback - just strip OR REPLACE
    converted = converted.replace(
      /INSERT\s+OR\s+REPLACE\s+INTO/gi,
      'INSERT INTO'
    );
  }

  // COLLATE NOCASE - remove it as PostgreSQL has different collation handling
  // The application code should use LOWER() for case-insensitive comparisons
  converted = converted.replace(/\s+COLLATE\s+NOCASE/gi, '');

  // GROUP_CONCAT → STRING_AGG
  // GROUP_CONCAT(col) → STRING_AGG(col::text, ',')
  // GROUP_CONCAT(col, sep) → STRING_AGG(col::text, sep)
  converted = converted.replace(
    /GROUP_CONCAT\s*\(\s*([^,)]+)\s*,\s*'([^']+)'\s*\)/gi,
    "STRING_AGG($1::text, '$2')"
  );
  converted = converted.replace(
    /GROUP_CONCAT\s*\(\s*([^,)]+)\s*\)/gi,
    "STRING_AGG($1::text, ',')"
  );

  // IFNULL → COALESCE
  converted = converted.replace(/IFNULL\s*\(/gi, 'COALESCE(');

  // datetime('now') → NOW()
  converted = converted.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');

  // datetime('now', '-X days') → NOW() - INTERVAL 'X days'
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*,\s*'(-?\d+)\s+(\w+)'\s*\)/gi,
    "NOW() + INTERVAL '$1 $2'"
  );

  // strftime('%Y-%m-%d', col) → DATE(col) or TO_CHAR(col, 'YYYY-MM-DD')
  converted = converted.replace(
    /strftime\s*\(\s*'%Y-%m-%d'\s*,\s*([^)]+)\s*\)/gi,
    'DATE($1)'
  );
  converted = converted.replace(
    /strftime\s*\(\s*'%Y-%m'\s*,\s*([^)]+)\s*\)/gi,
    "TO_CHAR($1, 'YYYY-MM')"
  );
  converted = converted.replace(
    /strftime\s*\(\s*'%Y'\s*,\s*([^)]+)\s*\)/gi,
    "EXTRACT(YEAR FROM $1)::text"
  );

  // date('now') → CURRENT_DATE
  converted = converted.replace(/date\s*\(\s*'now'\s*\)/gi, 'CURRENT_DATE');

  // date('now', '-X days') → CURRENT_DATE - INTERVAL 'X days'
  // Handle both formats: date('now', '-30 days') and date(?, '-' || ? || ' days')
  converted = converted.replace(
    /date\s*\(\s*'now'\s*,\s*'(-?\d+)\s+(\w+)'\s*\)/gi,
    "CURRENT_DATE + INTERVAL '$1 $2'"
  );

  // date(column, '-' || ? || ' days') pattern used in SQLite for dynamic intervals
  // This is a complex pattern that needs special handling for PostgreSQL
  // Convert: date('now', '-' || ? || ' days') → CURRENT_DATE - (? || ' days')::interval
  converted = converted.replace(
    /date\s*\(\s*'now'\s*,\s*'-'\s*\|\|\s*\?\s*\|\|\s*'\s*days'\s*\)/gi,
    "CURRENT_DATE - (? || ' days')::interval"
  );

  // GLOB → LIKE (note: GLOB is case-sensitive, LIKE in PG is case-sensitive too)
  converted = converted.replace(/\s+GLOB\s+/gi, ' LIKE ');

  // Replace * wildcards with % for LIKE (only in LIKE patterns)
  // This is risky without proper parsing, so we'll be conservative

  // INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
  converted = converted.replace(
    /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi,
    'SERIAL PRIMARY KEY'
  );

  // AUTOINCREMENT alone (rare)
  converted = converted.replace(/\s+AUTOINCREMENT/gi, '');

  // ====== CRITICAL POSTGRESQL FIXES ======

  // Boolean comparisons: PostgreSQL strict about types
  // Convert: column = true → column = 1, column = false → column = 0
  // This handles cases where SQLite uses INTEGER for booleans but code uses true/false
  converted = converted.replace(/\b(=|!=|<>)\s*(true|false)\b/gi, (match, operator, value) => {
    const numValue = value.toLowerCase() === 'true' ? '1' : '0';
    return `${operator} ${numValue}`;
  });

  // Also handle IS TRUE/IS FALSE comparisons
  converted = converted.replace(/\bIS\s+(NOT\s+)?(true|false)\b/gi, (match, notPart, value) => {
    const numValue = value.toLowerCase() === 'true' ? '1' : '0';
    if (notPart) {
      return `!= ${numValue}`;
    }
    return `= ${numValue}`;
  });

  // SUBSTR → SUBSTRING (PostgreSQL function name)
  // SQLite uses SUBSTR, PostgreSQL uses SUBSTRING
  converted = converted.replace(/\bSUBSTR\s*\(/gi, 'SUBSTRING(');

  // Handle NULLS LAST / NULLS FIRST in ORDER BY
  // PostgreSQL supports this, SQLite doesn't have it
  // This is actually fine - PostgreSQL handles NULLS LAST natively
  // Just ensure it's preserved if already in query

  // Handle LENGTH vs LENGTH() - both work in PostgreSQL but standardize
  // This is already fine - both databases support LENGTH()

  return converted;
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
    console.log('📊 PostgreSQL database connected');
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
      // IMPORTANT: Only replace ? outside of string literals
      let pgSql = convertPlaceholders(sql);

      // Also apply SQL dialect conversions
      pgSql = convertSQLDialect(pgSql);

      return pool.query(pgSql, params);
    },

    // Execute raw SQL
    exec: async (sql) => pool.query(sql),

    // Get a client for transactions
    getClient: () => pool.connect(),

    // Prepare statement (SQLite compatibility layer)
    // Returns statement object with .run(), .get(), .all() methods
    // This allows routes using req.app.get('db').prepare() to work with PostgreSQL
    prepare: (sql) => {
      // Convert ? placeholders to $1, $2, etc.
      const convertedSql = convertPlaceholders(sql);
      const dialectSql = convertSQLDialect(convertedSql);

      return {
        // Run statement (INSERT/UPDATE/DELETE)
        // Returns promise but can be called without await in transaction callbacks
        run: (...params) => {
          return pool.query(dialectSql, params).then(result => ({
            changes: result.rowCount || 0,
            lastInsertRowid: result.rows[0]?.id || null,
          }));
        },

        // Get single row (SELECT - first result)
        get: (...params) => {
          return pool.query(dialectSql, params).then(result => result.rows[0] || null);
        },

        // Get all rows (SELECT - all results)
        all: (...params) => {
          return pool.query(dialectSql, params).then(result => result.rows);
        }
      };
    },

    // Transaction support (handles both SQLite and PostgreSQL signatures)
    // Supports both: db.transaction(() => { stmt.run(...); }) [SQLite style]
    //           and: db.transaction(async (client) => { await client.query(...); }) [PostgreSQL style]
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Check function signature to determine callback style
        const fnString = fn.toString();
        const hasClientParam = fnString.match(/^\s*(async\s+)?\(\s*client\s*\)/);

        let result;
        if (hasClientParam) {
          // PostgreSQL style: fn(client) receives client for queries
          result = await fn(client);
        } else {
          // SQLite style: fn() uses closured prepared statements
          // The function will call stmt.run() which returns promises
          result = await fn();
        }

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
 * Alias for getDatabase() - for clarity in async contexts
 */
const getDatabaseAsync = getDatabase;

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
  // Database type check
  isPostgres: () => isPostgres,
  isSQLite: () => !isPostgres,

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

  // Case-insensitive comparison
  // Usage: dialect.caseInsensitive('symbol', value) → "LOWER(symbol) = LOWER(?)"
  caseInsensitive: (column, paramPlaceholder = '?') => {
    if (isPostgres) {
      return `LOWER(${column}) = LOWER(${paramPlaceholder})`;
    }
    return `${column} = ${paramPlaceholder} COLLATE NOCASE`;
  },

  // Case-insensitive LIKE
  caseInsensitiveLike: (column, paramPlaceholder = '?') => {
    if (isPostgres) {
      return `LOWER(${column}) LIKE LOWER(${paramPlaceholder})`;
    }
    return `${column} LIKE ${paramPlaceholder} COLLATE NOCASE`;
  },

  // INSERT OR IGNORE equivalent
  // Usage: dialect.insertIgnore('table', ['col1', 'col2'], ['?', '?'], 'id')
  insertIgnore: (table, columns, values, conflictColumn = 'id') => {
    if (isPostgres) {
      return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (${conflictColumn}) DO NOTHING`;
    }
    return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
  },

  // INSERT OR REPLACE equivalent (upsert)
  // Usage: dialect.upsert('table', ['col1', 'col2'], ['?', '?'], 'id', ['col2 = EXCLUDED.col2'])
  upsert: (table, columns, values, conflictColumn, updateSets) => {
    if (isPostgres) {
      return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateSets.join(', ')}`;
    }
    return `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')})`;
  },

  // Upsert conflict clause
  upsertConflict: (columns) => {
    if (isPostgres) {
      return `ON CONFLICT (${columns}) DO UPDATE SET`;
    }
    return `ON CONFLICT(${columns}) DO UPDATE SET`;
  },

  // ON CONFLICT DO NOTHING
  conflictDoNothing: (columns) => {
    if (isPostgres) {
      return `ON CONFLICT (${columns}) DO NOTHING`;
    }
    // SQLite uses INSERT OR IGNORE, this is just the suffix
    return '';
  },

  // Returning clause
  returning: isPostgres ? 'RETURNING *' : '',
  returningId: isPostgres ? 'RETURNING id' : '',

  // LIMIT/OFFSET
  limitOffset: (limit, offset) => {
    return `LIMIT ${limit} OFFSET ${offset}`;
  },

  // GROUP_CONCAT / STRING_AGG
  groupConcat: (column, separator = ',') => {
    if (isPostgres) {
      return `STRING_AGG(${column}::text, '${separator}')`;
    }
    return `GROUP_CONCAT(${column}, '${separator}')`;
  },

  // Table existence check
  tableExistsQuery: (tableName) => {
    if (isPostgres) {
      return `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${tableName}')`;
    }
    return `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`;
  },

  // Column info query
  columnInfoQuery: (tableName) => {
    if (isPostgres) {
      return `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `;
    }
    return `PRAGMA table_info(${tableName})`;
  },

  // Date/time functions
  now: () => isPostgres ? 'NOW()' : "datetime('now')",
  currentDate: () => isPostgres ? 'CURRENT_DATE' : "date('now')",

  // Date arithmetic
  dateAdd: (column, interval, unit) => {
    if (isPostgres) {
      return `${column} + INTERVAL '${interval} ${unit}'`;
    }
    return `datetime(${column}, '+${interval} ${unit}')`;
  },

  dateSub: (column, interval, unit) => {
    if (isPostgres) {
      return `${column} - INTERVAL '${interval} ${unit}'`;
    }
    return `datetime(${column}, '-${interval} ${unit}')`;
  },

  // Extract date part
  extractDate: (column) => {
    if (isPostgres) {
      return `DATE(${column})`;
    }
    return `date(${column})`;
  },

  // Convert SQLite-specific syntax to PostgreSQL (full query conversion)
  convertQuery: (sql) => {
    if (!isPostgres) return sql;
    return convertSQLDialect(sql);
  },

  // Convert placeholders only
  convertPlaceholders: (sql) => {
    if (!isPostgres) return sql;
    return convertPlaceholders(sql);
  }
};

module.exports = {
  getDatabase,
  getDatabaseAsync,
  getDatabaseSync,
  getDatabaseType,
  isUsingPostgres,
  dialect,
  // Export conversion functions for manual use
  convertPlaceholders,
  convertSQLDialect,
  // Export initialization functions for testing
  initSQLite,
  initPostgres
};
