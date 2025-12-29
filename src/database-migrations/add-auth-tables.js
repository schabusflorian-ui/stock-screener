// src/database-migrations/add-auth-tables.js
// Database migration for authentication system

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('Starting auth tables migration...');

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

// ============================================
// TABLE 1: Users
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
  )
`);
console.log('Created users table');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

// ============================================
// TABLE 2: Sessions (for express-session)
// Note: better-sqlite3-session-store creates this table automatically
// with columns: sid, sess, expire
// We just ensure the index exists
// ============================================
try {
  // Check if sessions table exists (created by session store)
  const sessionsExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'
  `).get();

  if (sessionsExists) {
    // Check column names - the store uses 'expire' not 'expired'
    const columns = db.prepare(`PRAGMA table_info(sessions)`).all();
    const hasExpire = columns.some(col => col.name === 'expire');
    const hasExpired = columns.some(col => col.name === 'expired');

    if (hasExpire) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);`);
    } else if (hasExpired) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);`);
    }
    console.log('Sessions table ready (created by session store)');
  } else {
    // Create manually if store hasn't created it yet
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess JSON NOT NULL,
        expire TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);`);
    console.log('Created sessions table');
  }
} catch (e) {
  console.log('Sessions table setup:', e.message);
}

// ============================================
// ADD user_id TO EXISTING TABLES
// ============================================

// Add user_id to portfolios
if (tableExists('portfolios') && !columnExists('portfolios', 'user_id')) {
  db.exec(`ALTER TABLE portfolios ADD COLUMN user_id TEXT REFERENCES users(id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id)`);
  console.log('Added user_id to portfolios table');
} else if (tableExists('portfolios')) {
  console.log('portfolios.user_id already exists, skipping');
}

// Add user_id to notes if exists
if (tableExists('notes') && !columnExists('notes', 'user_id')) {
  db.exec(`ALTER TABLE notes ADD COLUMN user_id TEXT REFERENCES users(id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id)`);
  console.log('Added user_id to notes table');
}

// Add user_id to theses if exists
if (tableExists('theses') && !columnExists('theses', 'user_id')) {
  db.exec(`ALTER TABLE theses ADD COLUMN user_id TEXT REFERENCES users(id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_theses_user_id ON theses(user_id)`);
  console.log('Added user_id to theses table');
}

db.close();
console.log('Auth tables migration completed successfully!');
