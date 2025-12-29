// src/database-migrations/add-preferences-columns.js
// Add new preference columns to user_preferences table

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('Adding new preference columns...');

// Add new columns if they don't exist
const columnsToAdd = [
  { name: 'show_percentages', sql: 'INTEGER DEFAULT 1' },
  { name: 'compact_numbers', sql: 'INTEGER DEFAULT 1' },
  { name: 'auto_refresh_interval', sql: 'INTEGER DEFAULT 0' },
  { name: 'notifications_enabled', sql: 'INTEGER DEFAULT 0' },
  { name: 'default_chart_period', sql: "TEXT DEFAULT '1Y'" },
];

// Check existing columns
const tableInfo = db.prepare("PRAGMA table_info(user_preferences)").all();
const existingColumns = new Set(tableInfo.map(col => col.name));

for (const col of columnsToAdd) {
  if (!existingColumns.has(col.name)) {
    try {
      db.exec(`ALTER TABLE user_preferences ADD COLUMN ${col.name} ${col.sql}`);
      console.log(`Added column: ${col.name}`);
    } catch (e) {
      console.log(`Column ${col.name} already exists or error: ${e.message}`);
    }
  } else {
    console.log(`Column ${col.name} already exists`);
  }
}

// Update default user preferences if they exist
db.prepare(`
  UPDATE user_preferences
  SET
    show_percentages = COALESCE(show_percentages, 1),
    compact_numbers = COALESCE(compact_numbers, 1),
    auto_refresh_interval = COALESCE(auto_refresh_interval, 0),
    notifications_enabled = COALESCE(notifications_enabled, 0)
  WHERE user_id = 'default'
`).run();

console.log('Preference columns migration complete!');
db.close();
