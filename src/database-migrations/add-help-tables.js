#!/usr/bin/env node
// src/database-migrations/add-help-tables.js
// PostgreSQL migration for help articles (Help Center feature)
// Run via: node run-postgres-migrations.js (add to POSTGRES_MIGRATIONS list)

async function migrate(db) {
  console.log('📚 Creating help_articles table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS help_articles (
      id SERIAL PRIMARY KEY,

      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT NOT NULL,

      category TEXT NOT NULL,
      subcategory TEXT,
      tags TEXT DEFAULT '[]',
      relevant_pages TEXT DEFAULT '[]',
      relevant_features TEXT DEFAULT '[]',
      search_keywords TEXT DEFAULT '[]',

      sort_order INTEGER DEFAULT 0,
      is_featured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'published',

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by TEXT,
      updated_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_help_articles_slug ON help_articles(slug);
    CREATE INDEX IF NOT EXISTS idx_help_articles_category ON help_articles(category);
    CREATE INDEX IF NOT EXISTS idx_help_articles_status ON help_articles(status);
  `);

  console.log('📊 Creating help_article_views table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS help_article_views (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES help_articles(id) ON DELETE CASCADE,
      user_id TEXT,
      session_id TEXT,
      from_page TEXT,
      search_query TEXT,
      was_helpful INTEGER,
      viewed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_article_views_article ON help_article_views(article_id);
    CREATE INDEX IF NOT EXISTS idx_article_views_viewed ON help_article_views(viewed_at);
  `);

  console.log('✅ Help tables migration complete');
}

module.exports = migrate;
