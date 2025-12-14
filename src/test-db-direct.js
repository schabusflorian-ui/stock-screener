// Direct database test
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../data/stocks.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);
console.log('Connected to database');

// Try to create a simple table
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_table (
      id INTEGER PRIMARY KEY,
      name TEXT
    );
  `);
  console.log('✅ Table created successfully!');

  // Check if it exists
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'
  `).all();

  console.log('Tables found:', tables);
} catch (error) {
  console.error('❌ Error:', error.message);
}

db.close();
