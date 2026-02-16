// 028-add-update-locks-unique-postgres.js
// Ensures update_locks(job_key) has a UNIQUE constraint so ON CONFLICT (job_key) works.

const { isUsingPostgres } = require('../lib/db');

async function up(db) {
  if (!isUsingPostgres()) {
    console.log('⏭️  Skipping PostgreSQL-specific migration (not using PostgreSQL)');
    return;
  }

  console.log('🔄 Running migration: 028-add-update-locks-unique');

  try {
    const r = await db.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'update_locks'
    `);
    if (!r.rows || r.rows.length === 0) {
      console.log('⏭️  update_locks table does not exist; skipping');
      return;
    }

    const hasUnique = await db.query(`
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid AND t.relname = 'update_locks'
      WHERE c.contype = 'u'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = t.oid AND a.attname = 'job_key'
        AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
      )
    `);
    if (hasUnique.rows && hasUnique.rows.length > 0) {
      console.log('✓ update_locks(job_key) already has UNIQUE constraint');
      return;
    }

    await db.query(`
      ALTER TABLE update_locks ADD CONSTRAINT update_locks_job_key_key UNIQUE (job_key)
    `);
    console.log('✓ Added UNIQUE constraint on update_locks(job_key)');
    console.log('✅ Migration 028 completed successfully');
  } catch (error) {
    if (error.code === '23505') {
      console.log('✓ UNIQUE constraint already present (duplicate key)');
      return;
    }
    console.error('❌ Migration 028 failed:', error.message);
    throw error;
  }
}

async function down(db) {
  if (!isUsingPostgres()) return;
  await db.query(`
    ALTER TABLE update_locks DROP CONSTRAINT IF EXISTS update_locks_job_key_key
  `);
}

module.exports = { up, down };
