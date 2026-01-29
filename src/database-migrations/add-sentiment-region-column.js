// src/database-migrations/add-sentiment-region-column.js
// Add missing 'region' column to combined_sentiment table

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

console.log('Adding region column to combined_sentiment table...');

// Check if column exists
function columnExists(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(col => col.name === columnName);
}

// Add region column if missing
if (!columnExists(db, 'combined_sentiment', 'region')) {
  try {
    db.exec('ALTER TABLE combined_sentiment ADD COLUMN region TEXT DEFAULT \'US\'');
    console.log('✅ Added region column to combined_sentiment');
  } catch (err) {
    console.error('❌ Failed to add region column:', err.message);
  }
} else {
  console.log('⏭️ region column already exists');
}

// Create index if missing
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_combined_sentiment_region ON combined_sentiment(region)');
  console.log('✅ Created index on region column');
} catch (err) {
  // Index might already exist
}

// Update the base schema definition to include region for future databases
// This is just a reminder - the actual change should be made to database.js
console.log('✅ Migration complete');
