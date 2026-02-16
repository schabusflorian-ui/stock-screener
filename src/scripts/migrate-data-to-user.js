#!/usr/bin/env node
// src/scripts/migrate-data-to-user.js
// Run this AFTER your first Google login to assign existing data to your user account

const path = require('path');
const { getDatabaseAsync, dialect } = require('../lib/db');

async function migrateData() {
  const database = await getDatabaseAsync();

  // Get the user ID from command line or find the first/only user
  let userId = process.argv[2];

  if (!userId) {
    const r = await database.query('SELECT id, email FROM users ORDER BY created_at LIMIT 1');
    const user = r.rows && r.rows[0];
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
    const r = await database.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    const user = r.rows && r.rows[0];
    if (!user) {
      console.error(`User ${userId} not found!`);
      process.exit(1);
    }
    console.log(`Using user: ${user.email}`);
  }

  console.log('\n=== Migrating existing data ===\n');

  async function tableExists(tableName) {
    const result = await database.query(dialect.tableExistsQuery(tableName));
    const row = result.rows && result.rows[0];
    return !!(row && (row.exists === true || row.name === tableName));
  }

  async function columnExists(table, column) {
    const result = await database.query(dialect.columnInfoQuery(table));
    const rows = result.rows || [];
    return rows.some(col => (col.column_name || col.name) === column);
  }

  // Migrate portfolios
  if (await tableExists('portfolios') && await columnExists('portfolios', 'user_id')) {
    const result = await database.query(
      'UPDATE portfolios SET user_id = $1 WHERE user_id IS NULL',
      [userId]
    );
    const changes = result.rowCount ?? (result.rows && result.rows.length) ?? 0;
    console.log(`Portfolios migrated: ${changes}`);
  } else {
    console.log('Portfolios: table or user_id column not found, skipping');
  }

  // Migrate user_preferences
  if (await tableExists('user_preferences')) {
    const result = await database.query(
      "UPDATE user_preferences SET user_id = $1 WHERE user_id = 'default'",
      [userId]
    );
    const changes = result.rowCount ?? (result.rows && result.rows.length) ?? 0;
    console.log(`User preferences migrated: ${changes}`);
  }

  // Migrate notes
  if (await tableExists('notes') && await columnExists('notes', 'user_id')) {
    const result = await database.query(
      'UPDATE notes SET user_id = $1 WHERE user_id IS NULL',
      [userId]
    );
    const changes = result.rowCount ?? (result.rows && result.rows.length) ?? 0;
    console.log(`Notes migrated: ${changes}`);
  }

  // Migrate theses
  if (await tableExists('theses') && await columnExists('theses', 'user_id')) {
    const result = await database.query(
      'UPDATE theses SET user_id = $1 WHERE user_id IS NULL',
      [userId]
    );
    const changes = result.rowCount ?? (result.rows && result.rows.length) ?? 0;
    console.log(`Theses migrated: ${changes}`);
  }

  console.log('\n=== Migration complete! ===\n');
}

(async () => {
  try {
    await migrateData();
    const database = await getDatabaseAsync();
    if (database.close) database.close();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    try {
      const database = await getDatabaseAsync();
      if (database.close) database.close();
    } catch (_) {}
    process.exit(1);
  }
})();
