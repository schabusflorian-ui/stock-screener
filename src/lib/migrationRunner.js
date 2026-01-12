// src/lib/migrationRunner.js
// Database migration runner with version tracking

const fs = require('fs');
const path = require('path');

/**
 * Migration runner that works with both SQLite and PostgreSQL
 */
class MigrationRunner {
  constructor(db) {
    this.db = db;
    this.migrationsDir = path.join(__dirname, '../database-migrations');
  }

  /**
   * Initialize migrations tracking table
   */
  async init() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id ${this.db.type === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
        name TEXT UNIQUE NOT NULL,
        batch INTEGER NOT NULL,
        executed_at ${this.db.type === 'postgres' ? 'TIMESTAMP DEFAULT NOW()' : 'DATETIME DEFAULT CURRENT_TIMESTAMP'}
      )
    `;

    if (this.db.type === 'postgres') {
      await this.db.query(createTableSQL);
    } else {
      this.db.exec(createTableSQL);
    }

    console.log('✅ Migration tracking table ready');
  }

  /**
   * Get list of executed migrations
   */
  async getExecutedMigrations() {
    const sql = 'SELECT name FROM schema_migrations ORDER BY name';

    if (this.db.type === 'postgres') {
      const result = await this.db.query(sql);
      return result.rows.map(r => r.name);
    } else {
      const stmt = this.db.prepare(sql);
      return stmt.all().map(r => r.name);
    }
  }

  /**
   * Get available migration files
   */
  getAvailableMigrations() {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    return fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.js'))
      .sort();
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();

    return available.filter(m => !executed.includes(m));
  }

  /**
   * Run all pending migrations
   */
  async runPending() {
    await this.init();

    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      console.log('✅ No pending migrations');
      return { migrated: [], count: 0 };
    }

    console.log(`\n📦 Running ${pending.length} pending migration(s)...\n`);

    // Get next batch number
    let batch = 1;
    const batchSQL = 'SELECT MAX(batch) as max_batch FROM schema_migrations';
    if (this.db.type === 'postgres') {
      const result = await this.db.query(batchSQL);
      batch = (result.rows[0]?.max_batch || 0) + 1;
    } else {
      const stmt = this.db.prepare(batchSQL);
      const result = stmt.get();
      batch = (result?.max_batch || 0) + 1;
    }

    const migrated = [];

    for (const migrationFile of pending) {
      try {
        console.log(`  Running: ${migrationFile}`);

        // Load and execute migration
        const migrationPath = path.join(this.migrationsDir, migrationFile);
        const migration = require(migrationPath);

        // Check if migration exports an 'up' function or runs directly
        if (typeof migration.up === 'function') {
          await migration.up(this.db);
        } else if (typeof migration.migrate === 'function') {
          await migration.migrate(this.db);
        }
        // Otherwise, the migration runs on require (legacy support)

        // Record migration
        const insertSQL = 'INSERT INTO schema_migrations (name, batch) VALUES (?, ?)';
        if (this.db.type === 'postgres') {
          await this.db.query(insertSQL, [migrationFile, batch]);
        } else {
          this.db.prepare(insertSQL).run(migrationFile, batch);
        }

        migrated.push(migrationFile);
        console.log(`  ✅ ${migrationFile}`);
      } catch (err) {
        console.error(`  ❌ ${migrationFile}: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n✅ Migrated ${migrated.length} file(s)\n`);
    return { migrated, count: migrated.length };
  }

  /**
   * Get migration status
   */
  async status() {
    await this.init();

    const executed = await this.getExecutedMigrations();
    const available = this.getAvailableMigrations();
    const pending = await this.getPendingMigrations();

    return {
      total: available.length,
      executed: executed.length,
      pending: pending.length,
      migrations: available.map(m => ({
        name: m,
        status: executed.includes(m) ? 'executed' : 'pending'
      }))
    };
  }

  /**
   * Print migration status
   */
  async printStatus() {
    const status = await this.status();

    console.log('\n📋 Migration Status:');
    console.log(`   Total: ${status.total}`);
    console.log(`   Executed: ${status.executed}`);
    console.log(`   Pending: ${status.pending}`);

    if (status.migrations.length > 0) {
      console.log('\n   Migrations:');
      status.migrations.forEach(m => {
        const icon = m.status === 'executed' ? '✅' : '⏳';
        console.log(`   ${icon} ${m.name}`);
      });
    }
    console.log('');
  }
}

/**
 * Create migration runner for the given database
 */
function createMigrationRunner(db) {
  return new MigrationRunner(db);
}

/**
 * CLI runner
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  // Initialize database
  const { getDatabase } = require('./db');
  const db = await getDatabase();
  const runner = new MigrationRunner(db);

  try {
    switch (command) {
      case 'run':
      case 'migrate':
        await runner.runPending();
        break;

      case 'status':
        await runner.printStatus();
        break;

      default:
        console.log('Usage: node migrationRunner.js [command]');
        console.log('');
        console.log('Commands:');
        console.log('  status   Show migration status (default)');
        console.log('  run      Run pending migrations');
        console.log('  migrate  Alias for run');
    }
  } finally {
    if (db.type === 'postgres') {
      await db.close();
    }
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
  });
}

module.exports = {
  MigrationRunner,
  createMigrationRunner
};
