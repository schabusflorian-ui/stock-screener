// 026-fix-user-factors-higher-is-better-postgres.js
// Fix user_factors.higher_is_better column - change from BIGINT to BOOLEAN

const { isUsingPostgres } = require('../lib/db');

async function up(db) {
  if (!isUsingPostgres()) {
    console.log('⏭️  Skipping PostgreSQL-specific migration (not using PostgreSQL)');
    return;
  }

  console.log('🔄 Running migration: 026-fix-user-factors-higher-is-better');

  try {
    await db.query(`
      ALTER TABLE user_factors 
      ALTER COLUMN higher_is_better TYPE BOOLEAN 
      USING CASE WHEN higher_is_better = 0 THEN FALSE ELSE TRUE END
    `);
    console.log('✓ Fixed user_factors.higher_is_better column type');

    console.log('✅ Migration 026 completed successfully');
  } catch (error) {
    console.error('❌ Migration 026 failed:', error.message);
    throw error;
  }
}

async function down(db) {
  if (!isUsingPostgres()) return;
  await db.query(`
    ALTER TABLE user_factors 
    ALTER COLUMN higher_is_better TYPE BIGINT 
    USING CASE WHEN higher_is_better THEN 1 ELSE 0 END
  `);
}

module.exports = { up, down };
