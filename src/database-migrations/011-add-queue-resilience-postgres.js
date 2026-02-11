// src/database-migrations/011-add-queue-resilience-postgres.js
// Add last_heartbeat to update_queue for stalled item detection

async function migrate(db) {
  console.log('🐘 Adding queue resilience (last_heartbeat) to update_queue...');

  const colCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'update_queue' AND column_name = 'last_heartbeat'
  `);
  if (colCheck.rows.length === 0) {
    await db.query('ALTER TABLE update_queue ADD COLUMN last_heartbeat TIMESTAMP');
    console.log('  Added last_heartbeat column.');
  }
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_update_queue_heartbeat ON update_queue(status, last_heartbeat)
  `);

  console.log('✅ Queue resilience ready.');
}

module.exports = migrate;
