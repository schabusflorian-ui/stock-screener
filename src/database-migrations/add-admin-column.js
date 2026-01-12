// src/database-migrations/add-admin-column.js
// Database migration to add is_admin column to users

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('Starting admin column migration...');

// Helper to check if column exists
function columnExists(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some(col => col.name === column);
}

// Helper to check if table exists
function tableExists(tableName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name=?
  `).get(tableName);
  return !!result;
}

// Add is_admin column to users
if (tableExists('users') && !columnExists('users', 'is_admin')) {
  db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`);
  console.log('Added is_admin column to users table');
} else if (tableExists('users')) {
  console.log('users.is_admin already exists, skipping');
} else {
  console.log('users table does not exist');
}

// Make the first user an admin if no admins exist
const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get();
if (adminCount.count === 0) {
  const firstUser = db.prepare('SELECT id, email FROM users ORDER BY created_at ASC LIMIT 1').get();
  if (firstUser) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(firstUser.id);
    console.log(`Made first user (${firstUser.email}) an admin`);
  }
}

db.close();
console.log('Admin column migration completed successfully!');
