// src/database-migrations/add-notes-tables.js
// Database migration for research notes and investment thesis system

const db = require('../database').db;

console.log('📝 Running Notes & Investment Thesis migration...');

// ============================================
// TABLE 1: Notebooks (containers for notes)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    notebook_type TEXT DEFAULT 'research',
    is_default INTEGER DEFAULT 0,
    color TEXT DEFAULT '#3B82F6',
    icon TEXT DEFAULT 'book',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME
  )
`);
console.log('✓ Created notebooks table');

// Create default notebooks if they don't exist
const notebookCount = db.prepare('SELECT COUNT(*) as count FROM notebooks').get();
if (notebookCount.count === 0) {
  const insertNotebook = db.prepare(`
    INSERT INTO notebooks (name, description, notebook_type, is_default, color, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertNotebook.run('Research Notes', 'General research and analysis notes', 'research', 1, '#3B82F6', 'book');
  insertNotebook.run('Investment Theses', 'Structured investment theses with tracking', 'thesis', 0, '#10B981', 'target');
  insertNotebook.run('Watchlist Notes', 'Quick notes on watched companies', 'watchlist', 0, '#F59E0B', 'eye');
  console.log('✓ Created default notebooks');
}

// ============================================
// TABLE 2: Notes (individual research entries)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notebook_id INTEGER NOT NULL,
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
    ai_summary_generated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    published_at DATETIME,
    deleted_at DATETIME,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created notes table');

// ============================================
// TABLE 3: Note Versions (version history)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS note_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    change_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(note_id, version_number),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created note_versions table');

// ============================================
// TABLE 4: Note Attachments (links to companies/portfolios)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS note_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    attachment_type TEXT NOT NULL,
    symbol TEXT,
    company_id INTEGER,
    portfolio_id INTEGER,
    sector TEXT,
    industry TEXT,
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
  )
`);
console.log('✓ Created note_attachments table');

// ============================================
// TABLE 5: Tags
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6B7280',
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created tags tables');

// Seed default tags
const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get();
if (tagCount.count === 0) {
  const defaultTags = [
    ['earnings', '#10B981'], ['valuation', '#3B82F6'], ['growth', '#8B5CF6'],
    ['risk', '#EF4444'], ['competitive-advantage', '#F59E0B'], ['management', '#6366F1'],
    ['catalyst', '#EC4899'], ['macro', '#14B8A6'], ['sector', '#84CC16'], ['technical', '#F97316']
  ];
  const insertTag = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)');
  for (const [name, color] of defaultTags) {
    insertTag.run(name, color);
  }
  console.log('✓ Created default tags');
}

// ============================================
// TABLE 6: Data Snapshots (capture metrics at point in time)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS note_data_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created note_data_snapshots table');

// ============================================
// TABLE 7: Investment Thesis (extends notes)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investment_theses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    company_id INTEGER,
    thesis_type TEXT DEFAULT 'long',
    conviction_level INTEGER CHECK (conviction_level BETWEEN 1 AND 5),
    target_price REAL,
    stop_loss_price REAL,
    entry_price REAL,
    current_price REAL,
    time_horizon_months INTEGER,
    review_date DATE,
    thesis_status TEXT DEFAULT 'active',
    status_changed_at DATETIME,
    status_reason TEXT,
    actual_return_pct REAL,
    outcome_notes TEXT,
    closed_at DATETIME,
    template_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  )
`);
console.log('✓ Created investment_theses table');

// ============================================
// TABLE 8: Thesis Assumptions
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS thesis_assumptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thesis_id INTEGER NOT NULL,
    assumption_text TEXT NOT NULL,
    assumption_type TEXT,
    importance TEXT DEFAULT 'medium',
    validation_metric TEXT,
    validation_operator TEXT,
    validation_threshold REAL,
    current_value REAL,
    status TEXT DEFAULT 'valid',
    status_changed_at DATETIME,
    status_notes TEXT,
    auto_validate INTEGER DEFAULT 0,
    last_validated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (thesis_id) REFERENCES investment_theses(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created thesis_assumptions table');

// ============================================
// TABLE 9: Thesis Catalysts
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS thesis_catalysts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thesis_id INTEGER NOT NULL,
    catalyst_text TEXT NOT NULL,
    catalyst_type TEXT,
    expected_date DATE,
    expected_date_range TEXT,
    status TEXT DEFAULT 'pending',
    actual_date DATE,
    outcome TEXT,
    outcome_notes TEXT,
    expected_impact TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (thesis_id) REFERENCES investment_theses(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created thesis_catalysts table');

// ============================================
// TABLE 10: Thesis Templates
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS thesis_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sections TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('✓ Created thesis_templates table');

// Seed default templates
const templateCount = db.prepare('SELECT COUNT(*) as count FROM thesis_templates').get();
if (templateCount.count === 0) {
  const insertTemplate = db.prepare(`
    INSERT INTO thesis_templates (id, name, description, sections, is_default, is_system)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const longTemplate = JSON.stringify([
    { id: 'summary', title: 'Investment Summary', description: 'One paragraph summary', required: true, type: 'text' },
    { id: 'business', title: 'Business Overview', description: 'What does this company do?', required: true, type: 'text' },
    { id: 'competitive-advantage', title: 'Competitive Advantage / Moat', description: 'What protects this business?', required: true, type: 'text' },
    { id: 'key-assumptions', title: 'Key Assumptions', description: 'What must be true?', required: true, type: 'assumptions' },
    { id: 'catalysts', title: 'Catalysts', description: 'What events could drive the stock?', required: false, type: 'catalysts' },
    { id: 'valuation', title: 'Valuation', description: 'Why is the current price attractive?', required: true, type: 'text' },
    { id: 'risks', title: 'Risks', description: 'What could go wrong?', required: true, type: 'text' },
    { id: 'exit-criteria', title: 'Exit Criteria', description: 'When would you sell?', required: true, type: 'text' }
  ]);

  const valueTemplate = JSON.stringify([
    { id: 'summary', title: 'Investment Summary', required: true, type: 'text' },
    { id: 'margin-of-safety', title: 'Margin of Safety', description: 'Discount to intrinsic value', required: true, type: 'text' },
    { id: 'intrinsic-value', title: 'Intrinsic Value Calculation', required: true, type: 'text' },
    { id: 'quality', title: 'Business Quality', description: 'ROE, ROIC, margins', required: true, type: 'text' },
    { id: 'management', title: 'Management Quality', required: true, type: 'text' },
    { id: 'key-assumptions', title: 'Key Assumptions', required: true, type: 'assumptions' },
    { id: 'risks', title: 'Risks', required: true, type: 'text' }
  ]);

  const shortTemplate = JSON.stringify([
    { id: 'summary', title: 'Short Thesis Summary', required: true, type: 'text' },
    { id: 'red-flags', title: 'Red Flags / Warning Signs', required: true, type: 'text' },
    { id: 'overvaluation', title: 'Overvaluation Analysis', required: true, type: 'text' },
    { id: 'catalysts', title: 'Negative Catalysts', required: true, type: 'catalysts' },
    { id: 'key-assumptions', title: 'Key Assumptions', required: true, type: 'assumptions' },
    { id: 'risks', title: 'Short Squeeze Risks', required: true, type: 'text' }
  ]);

  insertTemplate.run('long-standard', 'Long Investment Thesis', 'Standard long position template', longTemplate, 1);
  insertTemplate.run('value-investor', 'Value Investment Thesis', 'Graham/Buffett style template', valueTemplate, 0);
  insertTemplate.run('short-thesis', 'Short Investment Thesis', 'Short position template', shortTemplate, 0);
  console.log('✓ Created default thesis templates');
}

// ============================================
// TABLE 11: Note Comments
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS note_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    parent_comment_id INTEGER,
    content TEXT NOT NULL,
    selection_start INTEGER,
    selection_end INTEGER,
    quoted_text TEXT,
    resolved INTEGER DEFAULT 0,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES note_comments(id) ON DELETE CASCADE
  )
`);
console.log('✓ Created note_comments table');

// ============================================
// TABLE 12: Note Activity Log
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS note_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER,
    notebook_id INTEGER,
    thesis_id INTEGER,
    action TEXT NOT NULL,
    action_details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
    FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL,
    FOREIGN KEY (thesis_id) REFERENCES investment_theses(id) ON DELETE SET NULL
  )
`);
console.log('✓ Created note_activity_log table');

// ============================================
// Indexes
// ============================================
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notes_notebook ON notes(notebook_id);
  CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
  CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
  CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned DESC, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);
  CREATE INDEX IF NOT EXISTS idx_note_attachments_symbol ON note_attachments(symbol);
  CREATE INDEX IF NOT EXISTS idx_note_attachments_company ON note_attachments(company_id);

  CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
  CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

  CREATE INDEX IF NOT EXISTS idx_note_snapshots_note ON note_data_snapshots(note_id);
  CREATE INDEX IF NOT EXISTS idx_note_snapshots_symbol ON note_data_snapshots(symbol);

  CREATE INDEX IF NOT EXISTS idx_thesis_note ON investment_theses(note_id);
  CREATE INDEX IF NOT EXISTS idx_thesis_symbol ON investment_theses(symbol);
  CREATE INDEX IF NOT EXISTS idx_thesis_status ON investment_theses(thesis_status);

  CREATE INDEX IF NOT EXISTS idx_assumptions_thesis ON thesis_assumptions(thesis_id);
  CREATE INDEX IF NOT EXISTS idx_assumptions_status ON thesis_assumptions(status);

  CREATE INDEX IF NOT EXISTS idx_catalysts_thesis ON thesis_catalysts(thesis_id);
  CREATE INDEX IF NOT EXISTS idx_catalysts_date ON thesis_catalysts(expected_date);
  CREATE INDEX IF NOT EXISTS idx_catalysts_status ON thesis_catalysts(status);

  CREATE INDEX IF NOT EXISTS idx_activity_note ON note_activity_log(note_id);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON note_activity_log(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_comments_note ON note_comments(note_id);
`);
console.log('✓ Created indexes');

console.log('✅ Notes & Investment Thesis migration completed!');
