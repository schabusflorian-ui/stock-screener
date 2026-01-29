// src/database-migrations/add-sentiment-tables.js
// Migration to add Reddit sentiment analysis tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting sentiment analysis tables migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // REDDIT POSTS TABLE
    // ============================================
    console.log('  Creating reddit_posts table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS reddit_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,

        -- Reddit identifiers
        post_id TEXT NOT NULL UNIQUE,
        subreddit TEXT NOT NULL,

        -- Content
        title TEXT NOT NULL,
        selftext TEXT,
        url TEXT,
        permalink TEXT,
        flair TEXT,

        -- Author & engagement
        author TEXT,
        score INTEGER DEFAULT 0,
        upvote_ratio REAL,
        num_comments INTEGER DEFAULT 0,

        -- Timing
        posted_at DATETIME NOT NULL,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- Sentiment (from FinBERT)
        sentiment_score REAL,              -- -1 to +1
        sentiment_label TEXT,              -- 'positive', 'negative', 'neutral'
        sentiment_confidence REAL,         -- 0 to 1

        -- WSB-specific flags
        is_dd INTEGER DEFAULT 0,           -- Due diligence post
        is_yolo INTEGER DEFAULT 0,         -- YOLO trade
        is_gain INTEGER DEFAULT 0,         -- Gain porn
        is_loss INTEGER DEFAULT 0,         -- Loss porn
        mentions_buy INTEGER DEFAULT 0,
        mentions_sell INTEGER DEFAULT 0,
        mentions_hold INTEGER DEFAULT 0,
        has_rockets INTEGER DEFAULT 0,     -- rocket emoji count
        has_diamond_hands INTEGER DEFAULT 0,

        -- Tickers mentioned
        tickers_mentioned TEXT,            -- JSON array

        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // ============================================
    // SENTIMENT SUMMARY TABLE
    // ============================================
    console.log('  Creating sentiment_summary table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS sentiment_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,

        period TEXT NOT NULL,              -- '1d', '7d', '30d'
        source TEXT DEFAULT 'reddit',      -- 'reddit', 'news', 'combined'

        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- Post counts
        total_posts INTEGER DEFAULT 0,
        positive_count INTEGER DEFAULT 0,
        negative_count INTEGER DEFAULT 0,
        neutral_count INTEGER DEFAULT 0,

        -- Engagement totals
        total_score INTEGER DEFAULT 0,
        total_comments INTEGER DEFAULT 0,

        -- Sentiment scores
        avg_sentiment REAL,                -- Simple average
        weighted_sentiment REAL,           -- Weighted by score/recency
        sentiment_std_dev REAL,            -- Volatility of opinion

        -- Momentum
        sentiment_change REAL,             -- vs prior period
        volume_change REAL,                -- Post volume vs prior

        -- WSB metrics
        dd_posts INTEGER DEFAULT 0,
        yolo_posts INTEGER DEFAULT 0,
        buy_mentions INTEGER DEFAULT 0,
        sell_mentions INTEGER DEFAULT 0,
        rocket_count INTEGER DEFAULT 0,

        -- Signal
        signal TEXT,                       -- 'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'
        signal_strength INTEGER,           -- 1-5
        confidence REAL,                   -- 0-1

        UNIQUE(company_id, period, source),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // ============================================
    // TRENDING TICKERS TABLE
    // ============================================
    console.log('  Creating trending_tickers table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS trending_tickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        symbol TEXT NOT NULL,
        company_id INTEGER,

        -- Metrics
        mention_count INTEGER DEFAULT 0,
        unique_posts INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        avg_sentiment REAL,

        -- Ranking
        rank_by_mentions INTEGER,
        rank_by_sentiment INTEGER,

        -- Period
        period TEXT NOT NULL,              -- '1h', '4h', '24h'
        calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(symbol, period),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // ============================================
    // ADD COLUMNS TO COMPANIES TABLE
    // ============================================
    console.log('  Adding sentiment columns to companies table...');

    // Check which columns already exist
    const existingColumns = database.prepare('PRAGMA table_info(companies)').all();
    const columnNames = existingColumns.map(c => c.name);

    if (!columnNames.includes('sentiment_signal')) {
      database.exec('ALTER TABLE companies ADD COLUMN sentiment_signal TEXT;');
    }
    if (!columnNames.includes('sentiment_score')) {
      database.exec('ALTER TABLE companies ADD COLUMN sentiment_score REAL;');
    }
    if (!columnNames.includes('sentiment_confidence')) {
      database.exec('ALTER TABLE companies ADD COLUMN sentiment_confidence REAL;');
    }
    if (!columnNames.includes('sentiment_updated_at')) {
      database.exec('ALTER TABLE companies ADD COLUMN sentiment_updated_at DATETIME;');
    }
    if (!columnNames.includes('reddit_mentions_24h')) {
      database.exec('ALTER TABLE companies ADD COLUMN reddit_mentions_24h INTEGER DEFAULT 0;');
    }

    // ============================================
    // INDEXES
    // ============================================
    console.log('  Creating indexes...');

    // Reddit posts indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_reddit_company ON reddit_posts(company_id);
      CREATE INDEX IF NOT EXISTS idx_reddit_posted ON reddit_posts(posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reddit_subreddit ON reddit_posts(subreddit);
      CREATE INDEX IF NOT EXISTS idx_reddit_score ON reddit_posts(score DESC);
      CREATE INDEX IF NOT EXISTS idx_reddit_sentiment ON reddit_posts(sentiment_score);
    `);

    // Sentiment summary indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_summary_company ON sentiment_summary(company_id);
      CREATE INDEX IF NOT EXISTS idx_summary_period ON sentiment_summary(period);
      CREATE INDEX IF NOT EXISTS idx_summary_signal ON sentiment_summary(signal);
    `);

    // Trending tickers indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_trending_period ON trending_tickers(period, rank_by_mentions);
      CREATE INDEX IF NOT EXISTS idx_trending_symbol ON trending_tickers(symbol);
    `);

    database.exec('COMMIT');

    console.log('Sentiment analysis tables migration completed!');
    console.log('');
    console.log('Tables created:');
    console.log('  - reddit_posts');
    console.log('  - sentiment_summary');
    console.log('  - trending_tickers');
    console.log('');
    console.log('Columns added to companies:');
    console.log('  - sentiment_signal');
    console.log('  - sentiment_score');
    console.log('  - sentiment_confidence');
    console.log('  - sentiment_updated_at');
    console.log('  - reddit_mentions_24h');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND (
        name = 'reddit_posts' OR
        name = 'sentiment_summary' OR
        name = 'trending_tickers'
      )
      ORDER BY name
    `).all();

    console.log('');
    console.log('Verified tables:', tables.map(t => t.name).join(', '));

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
    WHERE type='table' AND name='reddit_posts'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Sentiment tables already exist. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
