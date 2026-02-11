// src/database-migrations/004-add-notes-tables-postgres.js
// PostgreSQL migration: Research notes and investment thesis tables

async function migrate(db) {
  console.log('📝 Creating Notes & Thesis tables for PostgreSQL...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      notebook_type TEXT DEFAULT 'research',
      is_default INTEGER DEFAULT 0,
      color TEXT DEFAULT '#3B82F6',
      icon TEXT DEFAULT 'book',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      archived_at TIMESTAMP
    )
  `);

  const nbCount = await db.query('SELECT COUNT(*)::int as c FROM notebooks');
  if (nbCount.rows[0].c === 0) {
    await db.query(`
      INSERT INTO notebooks (name, description, notebook_type, is_default, color, icon)
      VALUES
        ('Research Notes', 'General research and analysis notes', 'research', 1, '#3B82F6', 'book'),
        ('Investment Theses', 'Structured investment theses with tracking', 'thesis', 0, '#10B981', 'target'),
        ('Watchlist Notes', 'Quick notes on watched companies', 'watchlist', 0, '#F59E0B', 'eye')
    `);
    console.log('   Seeded default notebooks');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      user_id TEXT,
      title TEXT NOT NULL,
      content TEXT,
      excerpt TEXT,
      note_type TEXT DEFAULT 'general',
      status TEXT DEFAULT 'draft',
      word_count INTEGER DEFAULT 0,
      reading_time_minutes INTEGER DEFAULT 0,
      is_pinned INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      ai_summary TEXT,
      ai_summary_generated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS note_versions (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      change_summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(note_id, version_number)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS note_attachments (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      attachment_type TEXT NOT NULL,
      symbol TEXT,
      company_id INTEGER REFERENCES companies(id),
      portfolio_id INTEGER REFERENCES portfolios(id),
      sector TEXT,
      industry TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6B7280',
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    )
  `);

  const tagCount = await db.query('SELECT COUNT(*)::int as c FROM tags');
  if (tagCount.rows[0].c === 0) {
    const defaultTags = [
      ['earnings', '#10B981'], ['valuation', '#3B82F6'], ['growth', '#8B5CF6'],
      ['risk', '#EF4444'], ['competitive-advantage', '#F59E0B'], ['management', '#6366F1'],
      ['catalyst', '#EC4899'], ['macro', '#14B8A6'], ['sector', '#84CC16'], ['technical', '#F97316']
    ];
    for (const [name, color] of defaultTags) {
      await db.query('INSERT INTO tags (name, color) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, color]);
    }
    console.log('   Seeded default tags');
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS note_data_snapshots (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      price REAL,
      market_cap REAL,
      pe_ratio REAL,
      pb_ratio REAL,
      ps_ratio REAL,
      ev_ebitda REAL,
      revenue REAL,
      net_income REAL,
      gross_margin REAL,
      operating_margin REAL,
      net_margin REAL,
      roic REAL,
      roe REAL,
      revenue_growth_yoy REAL,
      earnings_growth_yoy REAL,
      debt_to_equity REAL,
      current_ratio REAL,
      fcf_yield REAL,
      metrics_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS investment_theses (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL UNIQUE REFERENCES notes(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id),
      thesis_type TEXT DEFAULT 'long',
      conviction_level INTEGER CHECK (conviction_level BETWEEN 1 AND 5),
      target_price REAL,
      stop_loss_price REAL,
      entry_price REAL,
      current_price REAL,
      time_horizon_months INTEGER,
      review_date DATE,
      thesis_status TEXT DEFAULT 'active',
      status_changed_at TIMESTAMP,
      status_reason TEXT,
      actual_return_pct REAL,
      outcome_notes TEXT,
      closed_at TIMESTAMP,
      template_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS thesis_assumptions (
      id SERIAL PRIMARY KEY,
      thesis_id INTEGER NOT NULL REFERENCES investment_theses(id) ON DELETE CASCADE,
      assumption_text TEXT NOT NULL,
      assumption_type TEXT,
      importance TEXT DEFAULT 'medium',
      validation_metric TEXT,
      validation_operator TEXT,
      validation_threshold REAL,
      current_value REAL,
      status TEXT DEFAULT 'valid',
      status_changed_at TIMESTAMP,
      status_notes TEXT,
      auto_validate INTEGER DEFAULT 0,
      last_validated_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sort_order INTEGER DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS thesis_catalysts (
      id SERIAL PRIMARY KEY,
      thesis_id INTEGER NOT NULL REFERENCES investment_theses(id) ON DELETE CASCADE,
      catalyst_text TEXT NOT NULL,
      catalyst_type TEXT,
      expected_date DATE,
      expected_date_range TEXT,
      status TEXT DEFAULT 'pending',
      actual_date DATE,
      outcome TEXT,
      outcome_notes TEXT,
      expected_impact TEXT DEFAULT 'medium',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sort_order INTEGER DEFAULT 0
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS thesis_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sections TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS note_comments (
      id SERIAL PRIMARY KEY,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      parent_comment_id INTEGER,
      content TEXT NOT NULL,
      selection_start INTEGER,
      selection_end INTEGER,
      quoted_text TEXT,
      resolved INTEGER DEFAULT 0,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS note_activity_log (
      id SERIAL PRIMARY KEY,
      note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
      notebook_id INTEGER REFERENCES notebooks(id) ON DELETE SET NULL,
      thesis_id INTEGER REFERENCES investment_theses(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      action_details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id);
    CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
    CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);
    CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_thesis_note ON investment_theses(note_id);
    CREATE INDEX IF NOT EXISTS idx_thesis_symbol ON investment_theses(symbol);
    CREATE INDEX IF NOT EXISTS idx_thesis_status ON investment_theses(thesis_status);
  `);

  console.log('✅ Notes & Thesis tables ready');
}

module.exports = migrate;
