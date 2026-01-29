// src/database.js
// Compatibility shim - forwards to the unified database abstraction layer
// This allows existing code to continue working while using the new DB layer

const {
  getDatabase,
  getDatabaseSync,
  isUsingPostgres,
  dialect
} = require('./lib/db');

// Export the isPostgres flag for code that needs to check database type
const isPostgres = isUsingPostgres();

// For backwards compatibility, provide lazy-initialized db instance
let _dbInstance = null;

// In PostgreSQL mode, provide stub methods that no-op or throw helpful errors
const postgresStubs = {
  // SQLite-specific methods that don't exist in PostgreSQL
  exec: () => {
    console.warn('[Database] db.exec() called in PostgreSQL mode - operation skipped');
    console.warn('[Database] Schema should be managed via migrations, not exec()');
  },
  prepare: (sql) => {
    console.warn('[Database] db.prepare() called in PostgreSQL mode - returning stub');
    console.warn('[Database] SQL:', sql.substring(0, 100));
    // Return a stub that has .get(), .all(), .run() methods
    return {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 })
    };
  },
  pragma: () => {
    console.warn('[Database] db.pragma() called in PostgreSQL mode - operation skipped');
  },
  close: async () => {
    const database = await getDatabase();
    if (database && database.close) {
      await database.close();
    }
  }
};

const db = new Proxy({}, {
  get(target, prop) {
    // Initialize database on first access (SQLite only)
    if (!_dbInstance && !isPostgres) {
      try {
        _dbInstance = getDatabaseSync();
      } catch (err) {
        throw new Error(`Failed to initialize SQLite database: ${err.message}`);
      }
    }

    if (isPostgres) {
      // Return stub methods for PostgreSQL mode
      if (prop in postgresStubs) {
        return postgresStubs[prop];
      }

      // For other methods, warn and return undefined
      console.warn(`[Database] db.${String(prop)} accessed in PostgreSQL mode - returning undefined`);
      console.warn(`[Database] Please update code to use async getDatabase() for PostgreSQL`);
      return undefined;
    }

    return _dbInstance && _dbInstance.raw ? _dbInstance.raw[prop] : _dbInstance[prop];
  }
});

module.exports = {
  db,
  getDatabase,
  getDatabaseSync,
  isPostgres,
  dialect,

  // Backwards compatibility helper functions (synchronous, SQLite only)
  getCompany: (symbol) => {
    if (isPostgres) throw new Error('Use async getDatabase() for PostgreSQL');
    const database = getDatabaseSync();
    const stmt = database.raw.prepare('SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE');
    return stmt.get(symbol);
  },

  getAllCompanies: () => {
    if (isPostgres) throw new Error('Use async getDatabase() for PostgreSQL');
    const database = getDatabaseSync();
    const stmt = database.raw.prepare('SELECT * FROM companies WHERE is_active = 1 ORDER BY symbol');
    return stmt.all();
  },

  getCompanyCount: () => {
    if (isPostgres) throw new Error('Use async getDatabase() for PostgreSQL');
    const database = getDatabaseSync();
    const stmt = database.raw.prepare('SELECT COUNT(*) as count FROM companies WHERE is_active = 1');
    return stmt.get().count;
  },

  upsertCompany: (data) => {
    if (isPostgres) throw new Error('Use async getDatabase() for PostgreSQL');
    const database = getDatabaseSync();
    const stmt = database.raw.prepare(`
      INSERT INTO companies (symbol, name, sector, industry, exchange, market_cap, description)
      VALUES (@symbol, @name, @sector, @industry, @exchange, @market_cap, @description)
      ON CONFLICT(symbol) DO UPDATE SET
        name = @name,
        sector = @sector,
        industry = @industry,
        exchange = @exchange,
        market_cap = @market_cap,
        description = @description,
        last_updated = CURRENT_TIMESTAMP
    `);
    return stmt.run(data);
  },

  getMetrics: (companyId, limit = 5) => {
    if (isPostgres) throw new Error('Use async getDatabase() for PostgreSQL');
    const database = getDatabaseSync();
    const stmt = database.raw.prepare(`
      SELECT * FROM calculated_metrics
      WHERE company_id = ?
      ORDER BY fiscal_period DESC
      LIMIT ?
    `);
    return stmt.all(companyId, limit);
  },

  closeDatabase: async () => {
    if (isPostgres) {
      const database = await getDatabase();
      if (database && database.close) {
        await database.close();
      }
    } else if (_dbInstance && _dbInstance.close) {
      _dbInstance.close();
    }
    console.log('🔒 Database connection closed');
  }
};
