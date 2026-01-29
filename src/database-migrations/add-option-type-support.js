// src/database-migrations/add-option-type-support.js
// Database migration to add PUT/CALL option tracking to investor holdings

const db = require('../database').db;

console.log('📊 Running option type support migration...');

// ============================================
// Add option_type column to investor_holdings
// ============================================
// Values: NULL (common stock), 'PUT', 'CALL'

try {
  // Check if column already exists
  const tableInfo = db.prepare('PRAGMA table_info(investor_holdings)').all();
  const hasOptionType = tableInfo.some(col => col.name === 'option_type');

  if (!hasOptionType) {
    db.exec('ALTER TABLE investor_holdings ADD COLUMN option_type TEXT');
    console.log('✅ Added option_type column to investor_holdings');
  } else {
    console.log('ℹ️ option_type column already exists');
  }

  // Add title_of_class column (COM, CL A, PREF, etc.)
  const hasTitleOfClass = tableInfo.some(col => col.name === 'title_of_class');

  if (!hasTitleOfClass) {
    db.exec('ALTER TABLE investor_holdings ADD COLUMN title_of_class TEXT');
    console.log('✅ Added title_of_class column to investor_holdings');
  } else {
    console.log('ℹ️ title_of_class column already exists');
  }

} catch (err) {
  // SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we catch errors
  if (err.message.includes('duplicate column name')) {
    console.log('ℹ️ Columns already exist, skipping...');
  } else {
    throw err;
  }
}

// ============================================
// Create index for option type filtering
// ============================================
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_option_type
  ON investor_holdings(investor_id, option_type, filing_date DESC);
`);

console.log('✅ Created option_type index');

// ============================================
// Create view for stock-only holdings (excluding options)
// ============================================
db.exec(`
  DROP VIEW IF EXISTS investor_holdings_stocks_only;

  CREATE VIEW investor_holdings_stocks_only AS
  SELECT *
  FROM investor_holdings
  WHERE option_type IS NULL;
`);

console.log('✅ Created investor_holdings_stocks_only view');

// ============================================
// Create view for options-only holdings
// ============================================
db.exec(`
  DROP VIEW IF EXISTS investor_holdings_options_only;

  CREATE VIEW investor_holdings_options_only AS
  SELECT *
  FROM investor_holdings
  WHERE option_type IS NOT NULL;
`);

console.log('✅ Created investor_holdings_options_only view');

console.log('📊 Option type support migration complete!');

module.exports = { success: true };
