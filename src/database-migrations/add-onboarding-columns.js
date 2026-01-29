// src/database-migrations/add-onboarding-columns.js
// Migration: Add onboarding columns to existing user_preferences table

const db = require('../database');

async function up() {
  const database = db.getDatabase();

  console.log('Starting migration: Add onboarding columns to user_preferences...');

  try {
    // Check if columns already exist
    const tableInfo = database.prepare('PRAGMA table_info(user_preferences)').all();
    const columnNames = tableInfo.map(col => col.name);

    const hasInterests = columnNames.includes('interests');
    const hasRiskProfile = columnNames.includes('risk_profile');
    const hasOnboardingCompleted = columnNames.includes('onboarding_completed_at');

    if (hasInterests && hasRiskProfile && hasOnboardingCompleted) {
      console.log('ℹ️  Onboarding columns already exist, skipping migration.');
      return;
    }

    // Add missing columns
    if (!hasInterests) {
      console.log('Adding interests column...');
      database.exec('ALTER TABLE user_preferences ADD COLUMN interests TEXT;');
    }

    if (!hasRiskProfile) {
      console.log('Adding risk_profile column...');
      database.exec('ALTER TABLE user_preferences ADD COLUMN risk_profile TEXT;');
    }

    if (!hasOnboardingCompleted) {
      console.log('Adding onboarding_completed_at column...');
      database.exec('ALTER TABLE user_preferences ADD COLUMN onboarding_completed_at DATETIME;');
    }

    console.log('✅ Migration complete!');
    console.log('');
    console.log('Added columns:');
    if (!hasInterests) console.log('- interests (TEXT) - JSON array of interest IDs');
    if (!hasRiskProfile) console.log('- risk_profile (TEXT) - low/medium/high');
    if (!hasOnboardingCompleted) console.log('- onboarding_completed_at (DATETIME) - completion timestamp');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  console.log('⚠️  Cannot drop columns in SQLite (not supported)');
  console.log('To rollback, you would need to recreate the table without these columns.');
}

// Run migration if executed directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration successful!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { up, down };
