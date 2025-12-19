// src/database-migrations/add-sentiment-history.js
// Migration to add sentiment history tracking

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting sentiment history migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // SENTIMENT HISTORY TABLE
    // Stores daily snapshots for charting
    // ============================================
    console.log('  Creating sentiment_history table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS sentiment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,

        -- Date of the snapshot
        snapshot_date DATE NOT NULL,

        -- Source tracking
        source TEXT DEFAULT 'reddit',      -- 'reddit', 'news', 'combined'

        -- Post/mention counts
        post_count INTEGER DEFAULT 0,
        mention_count INTEGER DEFAULT 0,

        -- Sentiment metrics
        avg_sentiment REAL,
        weighted_sentiment REAL,
        sentiment_std_dev REAL,

        -- Distribution
        positive_count INTEGER DEFAULT 0,
        negative_count INTEGER DEFAULT 0,
        neutral_count INTEGER DEFAULT 0,

        -- Engagement metrics
        total_score INTEGER DEFAULT 0,
        total_comments INTEGER DEFAULT 0,
        avg_engagement REAL,

        -- Signal at this point in time
        signal TEXT,
        signal_strength INTEGER,

        -- WSB-specific metrics
        rocket_count INTEGER DEFAULT 0,
        dd_count INTEGER DEFAULT 0,
        yolo_count INTEGER DEFAULT 0,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(company_id, snapshot_date, source),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // ============================================
    // INDEXES
    // ============================================
    console.log('  Creating indexes...');
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_sentiment_history_company
        ON sentiment_history(company_id);
      CREATE INDEX IF NOT EXISTS idx_sentiment_history_date
        ON sentiment_history(snapshot_date DESC);
      CREATE INDEX IF NOT EXISTS idx_sentiment_history_company_date
        ON sentiment_history(company_id, snapshot_date DESC);
      CREATE INDEX IF NOT EXISTS idx_sentiment_history_source
        ON sentiment_history(source);
    `);

    database.exec('COMMIT');

    console.log('Sentiment history migration completed!');
    console.log('');
    console.log('Table created: sentiment_history');

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  }
}

// Helper function to check if migration has been run
function isMigrationNeeded() {
  const database = db.getDatabase();
  const result = database.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='sentiment_history'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Sentiment history table already exists. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
