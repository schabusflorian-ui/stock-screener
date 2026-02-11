// src/database-migrations/019-backfill-analyst-conversations-analyst-id-postgres.js
// Backfill NULL/empty analyst_id so every conversation has a valid analyst (root cause of "Invalid analyst: undefined")

async function migrate(db) {
  console.log('🐘 Backfilling analyst_conversations.analyst_id (Postgres)...');

  const result = await db.query(`
    UPDATE analyst_conversations
    SET analyst_id = 'value'
    WHERE analyst_id IS NULL OR TRIM(analyst_id) = ''
  `);

  const rowCount = result.rowCount ?? 0;
  if (rowCount > 0) {
    console.log(`✅ Backfilled analyst_id for ${rowCount} conversation(s).`);
  } else {
    console.log('✅ No rows needed backfill.');
  }
}

module.exports = migrate;
