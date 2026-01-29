// src/database-migrations/add-user-preferences-table.js
const db = require('../database');

/**
 * Migration: Create user_preferences table for storing onboarding data
 * This allows the system to use user preferences throughout the app
 */

async function up() {
  const hasTable = await db.schema.hasTable('user_preferences');

  if (!hasTable) {
    await db.schema.createTable('user_preferences', (table) => {
      table.increments('id').primary();
      table.string('user_id').notNullable();
      table.text('interests'); // JSON array of interest IDs
      table.string('risk_profile'); // conservative, moderate, aggressive
      table.timestamp('onboarding_completed_at');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());

      // Index for fast lookups
      table.index('user_id');
    });

    console.log('✅ Created user_preferences table');
  } else {
    console.log('ℹ️  user_preferences table already exists');
  }
}

async function down() {
  await db.schema.dropTableIfExists('user_preferences');
  console.log('✅ Dropped user_preferences table');
}

// Run migration if called directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { up, down };
