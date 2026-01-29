// src/database-migrations/add-admin-column.js
// Database migration to add is_admin column to users

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

console.log('Starting admin column migration...');

// Helper to check if column exists

// Helper to check if table exists

// Add is_admin column to users
if (tableExists(db, 'users') && !columnExists(db, 'users', 'is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  console.log('Added is_admin column to users table');
} else if (tableExists(db, 'users')) {
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
console.log('Admin column migration completed successfully!');
