// Database migration: Add queue resilience features
// Adds heartbeat column for detecting stalled queue items
// Run: node src/database-migrations/add-queue-resilience.js

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Starting Queue Resilience migration...');

  // Add last_heartbeat column to update_queue for detecting stalled items
  try {
    console.log('Adding last_heartbeat column to update_queue...');
    database.exec(`
      ALTER TABLE update_queue ADD COLUMN last_heartbeat DATETIME;
    `);
    console.log('✓ last_heartbeat column added');
  } catch (error) {
    if (error.message.includes('duplicate column')) {
      console.log('✓ last_heartbeat column already exists');
    } else {
      throw error;
    }
  }

  // Create index for finding stalled items efficiently
  console.log('Creating index for stalled item detection...');
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_update_queue_heartbeat
    ON update_queue(status, last_heartbeat);
  `);

  console.log('Queue Resilience migration completed!');
}

// Run migration
try {
  migrate();
  console.log('Migration successful!');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
