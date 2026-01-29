// src/database-migrations/add-strategy-model-binding.js
// Migration to add ML model version binding to strategies

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

  try {
    // Check if column already exists
    const tableInfo = db.prepare('PRAGMA table_info(unified_strategies)').all();
    const hasColumn = tableInfo.some(col => col.name === 'ml_model_version');

    if (hasColumn) {
      console.log('ml_model_version column already exists, skipping migration');
      return { success: true, message: 'Already migrated' };
    }

    // Add ml_model_version column
    console.log('Adding ml_model_version column to unified_strategies...');
    db.exec(`
      ALTER TABLE unified_strategies
      ADD COLUMN ml_model_version TEXT DEFAULT NULL
    `);

    // Add ml_model_locked column (prevents auto-updates)
    const hasLockedColumn = tableInfo.some(col => col.name === 'ml_model_locked');
    if (!hasLockedColumn) {
      console.log('Adding ml_model_locked column...');
      db.exec(`
        ALTER TABLE unified_strategies
        ADD COLUMN ml_model_locked INTEGER DEFAULT 0
      `);
    }

    // Add ml_model_updated_at column
    const hasUpdatedColumn = tableInfo.some(col => col.name === 'ml_model_updated_at');
    if (!hasUpdatedColumn) {
      console.log('Adding ml_model_updated_at column...');
      db.exec(`
        ALTER TABLE unified_strategies
        ADD COLUMN ml_model_updated_at DATETIME DEFAULT NULL
      `);
    }

    // Create index for model version queries
    console.log('Creating index on ml_model_version...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_unified_strategies_model_version
      ON unified_strategies(ml_model_version)
    `);

    console.log('Migration completed successfully!');

    return { success: true, message: 'Migration completed' };

  } catch (error) {
    console.error('Migration failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run migration if called directly
if (require.main === module) {
  const result = migrate();
  process.exit(result.success ? 0 : 1);
}

module.exports = { migrate };
