// 024-fix-user-factors-boolean-columns-postgres.js
// Fix user_factors table - change integer columns to boolean

const { isUsingPostgres } = require('../lib/db');

async function up(db) {
  if (!isUsingPostgres()) {
    console.log('⏭️  Skipping PostgreSQL-specific migration (not using PostgreSQL)');
    return;
  }

  console.log('🔄 Running migration: 024-fix-user-factors-boolean-columns');

  try {
    // Drop default first so PG can cast column type (default for column cannot be cast automatically)
    await db.query(`ALTER TABLE user_factors ALTER COLUMN is_valid DROP DEFAULT`);
    await db.query(`
      ALTER TABLE user_factors 
      ALTER COLUMN is_valid TYPE BOOLEAN 
      USING CASE WHEN is_valid = 0 THEN FALSE ELSE TRUE END
    `);
    await db.query(`ALTER TABLE user_factors ALTER COLUMN is_valid SET DEFAULT TRUE`);
    console.log('✓ Fixed user_factors.is_valid column type');

    const checkActiveCol = await db.query(`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'user_factors' AND column_name = 'is_active'
    `);
    if (checkActiveCol.rows.length > 0 && checkActiveCol.rows[0].data_type !== 'boolean') {
      await db.query(`ALTER TABLE user_factors ALTER COLUMN is_active DROP DEFAULT`);
      await db.query(`
        ALTER TABLE user_factors 
        ALTER COLUMN is_active TYPE BOOLEAN 
        USING CASE WHEN is_active = 0 THEN FALSE ELSE TRUE END
      `);
      await db.query(`ALTER TABLE user_factors ALTER COLUMN is_active SET DEFAULT TRUE`);
      console.log('✓ Fixed user_factors.is_active column type');
    }

    console.log('✅ Migration 024 completed successfully');
  } catch (error) {
    console.error('❌ Migration 024 failed:', error.message);
    throw error;
  }
}

async function down(db) {
  if (!isUsingPostgres()) {
    return;
  }

  console.log('🔄 Rolling back migration: 024-fix-user-factors-boolean-columns');

  // Revert to BIGINT
  await db.query(`
    ALTER TABLE user_factors 
    ALTER COLUMN is_valid TYPE BIGINT 
    USING CASE WHEN is_valid THEN 1 ELSE 0 END
  `);

  await db.query(`
    ALTER TABLE user_factors 
    ALTER COLUMN is_active TYPE BIGINT 
    USING CASE WHEN is_active THEN 1 ELSE 0 END
  `);

  console.log('✅ Migration 024 rolled back');
}

module.exports = { up, down };
