#!/usr/bin/env node
// src/scripts/migrate-data-to-user.js
// Run this AFTER your first Google login to assign existing data to your user account

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

function migrateData() {
  // Get the user ID from command line or find the first/only user
  let userId = process.argv[2];

  if (!userId) {
    const user = db.prepare('SELECT id, email FROM users ORDER BY created_at LIMIT 1').get();
    if (!user) {
      console.error('No users found! Please login with Google first.');
      console.log('\nTo use this script:');
      console.log('1. Start the server: npm start');
      console.log('2. Visit http://localhost:3001 and login with Google');
      console.log('3. Run this script again: node src/scripts/migrate-data-to-user.js');
      process.exit(1);
    }
    userId = user.id;
    console.log(`Found user: ${user.email} (${userId})`);
  } else {
    // Verify user exists
    const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
    if (!user) {
      console.error(`User ${userId} not found!`);
      process.exit(1);
    }
    console.log(`Using user: ${user.email}`);
  }

  console.log('\n=== Migrating existing data ===\n');

  // Helper to check if table exists
  function tableExists(tableName) {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name=?
    `).get(tableName);
    return !!result;
  }

  // Helper to check if column exists
  function columnExists(table, column) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.some(col => col.name === column);
  }

  // Migrate portfolios
  if (tableExists('portfolios') && columnExists('portfolios', 'user_id')) {
    const result = db.prepare(`
      UPDATE portfolios SET user_id = ? WHERE user_id IS NULL
    `).run(userId);
    console.log(`Portfolios migrated: ${result.changes}`);
  } else {
    console.log('Portfolios: table or user_id column not found, skipping');
  }

  // Migrate user_preferences
  if (tableExists('user_preferences')) {
    const result = db.prepare(`
      UPDATE user_preferences SET user_id = ? WHERE user_id = 'default'
    `).run(userId);
    console.log(`User preferences migrated: ${result.changes}`);
  }

  // Migrate notes
  if (tableExists('notes') && columnExists('notes', 'user_id')) {
    const result = db.prepare(`
      UPDATE notes SET user_id = ? WHERE user_id IS NULL
    `).run(userId);
    console.log(`Notes migrated: ${result.changes}`);
  }

  // Migrate theses
  if (tableExists('theses') && columnExists('theses', 'user_id')) {
    const result = db.prepare(`
      UPDATE theses SET user_id = ? WHERE user_id IS NULL
    `).run(userId);
    console.log(`Theses migrated: ${result.changes}`);
  }

  console.log('\n=== Migration complete! ===\n');
}

try {
  migrateData();
  db.close();
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  db.close();
  process.exit(1);
}
