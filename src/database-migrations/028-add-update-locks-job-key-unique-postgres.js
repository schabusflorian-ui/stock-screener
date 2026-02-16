// 028-add-update-locks-job-key-unique-postgres.js
// Ensure update_locks has a UNIQUE constraint on job_key so ON CONFLICT (job_key) works.

async function migrate(db) {
  try {
    await db.query(`
      ALTER TABLE update_locks
      ADD CONSTRAINT update_locks_job_key_key UNIQUE (job_key)
    `);
  } catch (e) {
    if (e.code !== '42710') throw e; // 42710 = duplicate_object (constraint already exists)
  }
}

module.exports = migrate;
