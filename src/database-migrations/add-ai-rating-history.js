// src/database-migrations/add-ai-rating-history.js
// Migration to add AI rating history tracking

const sqlite3 = require('sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/stocks.db');

async function runMigration() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);

    db.serialize(() => {
      // Create AI rating history table
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_rating_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          company_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
          label TEXT NOT NULL,
          summary TEXT,
          strengths TEXT,  -- JSON array
          risks TEXT,      -- JSON array
          analyst_id TEXT DEFAULT 'value',
          context_data TEXT,  -- JSON blob of metrics used for analysis
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

          FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('Error creating ai_rating_history table:', err);
        else console.log('Created ai_rating_history table');
      });

      // Create indexes for efficient queries
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_rating_company
        ON ai_rating_history(company_id)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_rating_symbol
        ON ai_rating_history(symbol)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_rating_date
        ON ai_rating_history(created_at DESC)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_rating_company_date
        ON ai_rating_history(company_id, created_at DESC)
      `);

      // Create screening suggestions cache table
      db.run(`
        CREATE TABLE IF NOT EXISTS ai_screening_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_goal TEXT NOT NULL,
          goal_hash TEXT NOT NULL,  -- Hash for deduplication
          suggested_filters TEXT NOT NULL,  -- JSON object of filter criteria
          explanation TEXT,
          suggested_presets TEXT,  -- JSON array of relevant preset IDs
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,

          UNIQUE(goal_hash)
        )
      `, (err) => {
        if (err) console.error('Error creating ai_screening_suggestions table:', err);
        else console.log('Created ai_screening_suggestions table');
      });

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_screening_hash
        ON ai_screening_suggestions(goal_hash)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_ai_screening_expires
        ON ai_screening_suggestions(expires_at)
      `);
    });

    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        reject(err);
      } else {
        console.log('AI rating history migration completed successfully');
        resolve();
      }
    });
  });
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
