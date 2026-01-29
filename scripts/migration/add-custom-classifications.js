// add-custom-classifications.js
// Adds user_sector and user_industry columns for custom classifications

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stocks.db');
const db = new Database(dbPath);

console.log('Adding custom classification columns...\n');

// Check if columns already exist
const tableInfo = db.prepare("PRAGMA table_info(companies)").all();
const existingColumns = tableInfo.map(c => c.name);

const columnsToAdd = [
  { name: 'user_sector', type: 'TEXT' },
  { name: 'user_industry', type: 'TEXT' },
  { name: 'user_subsector', type: 'TEXT' },
  { name: 'user_tags', type: 'TEXT' }  // JSON array of custom tags
];

for (const col of columnsToAdd) {
  if (existingColumns.includes(col.name)) {
    console.log(`Column '${col.name}' already exists, skipping`);
  } else {
    db.prepare(`ALTER TABLE companies ADD COLUMN ${col.name} ${col.type}`).run();
    console.log(`Added column '${col.name}'`);
  }
}

// Create a table for user-defined sector/industry definitions
db.exec(`
  CREATE TABLE IF NOT EXISTS custom_classifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,           -- 'sector', 'industry', 'subsector', 'tag'
    name TEXT NOT NULL,
    description TEXT,
    parent_name TEXT,             -- For hierarchy (e.g., industry belongs to sector)
    color TEXT,                   -- For UI display
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, name)
  )
`);
console.log('\nCreated custom_classifications table');

// Create index for faster lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_custom_classifications_type
  ON custom_classifications(type)
`);

// Insert some default custom sectors that are more investor-friendly
const defaultSectors = [
  { name: 'Big Tech', description: 'Large technology companies (FAANG+)', color: '#8b5cf6' },
  { name: 'AI & Machine Learning', description: 'Companies focused on artificial intelligence', color: '#3b82f6' },
  { name: 'Cloud Computing', description: 'Cloud infrastructure and SaaS', color: '#06b6d4' },
  { name: 'Cybersecurity', description: 'Security software and services', color: '#ef4444' },
  { name: 'Fintech', description: 'Financial technology companies', color: '#22c55e' },
  { name: 'Clean Energy', description: 'Renewable energy and clean tech', color: '#84cc16' },
  { name: 'EVs & Batteries', description: 'Electric vehicles and battery tech', color: '#f59e0b' },
  { name: 'Biotech', description: 'Biotechnology and gene therapy', color: '#ec4899' },
  { name: 'E-commerce', description: 'Online retail and marketplaces', color: '#f97316' },
  { name: 'Streaming & Gaming', description: 'Entertainment streaming and video games', color: '#a855f7' },
  { name: 'Dividend Aristocrats', description: 'Companies with 25+ years of dividend growth', color: '#14b8a6' },
  { name: 'Blue Chips', description: 'Large, established, stable companies', color: '#6366f1' },
  { name: 'Growth Stocks', description: 'High growth potential companies', color: '#10b981' },
  { name: 'Value Stocks', description: 'Undervalued companies', color: '#0ea5e9' },
  { name: 'Small Caps', description: 'Small market cap companies', color: '#f43f5e' }
];

const insertSector = db.prepare(`
  INSERT OR IGNORE INTO custom_classifications (type, name, description, color)
  VALUES ('sector', ?, ?, ?)
`);

console.log('\nAdding default custom sectors:');
for (const sector of defaultSectors) {
  const result = insertSector.run(sector.name, sector.description, sector.color);
  if (result.changes > 0) {
    console.log(`  + ${sector.name}`);
  }
}

// Add some default tags
const defaultTags = [
  { name: 'Watchlist', description: 'On my watchlist', color: '#fbbf24' },
  { name: 'Owned', description: 'Currently own', color: '#22c55e' },
  { name: 'Researching', description: 'Currently researching', color: '#3b82f6' },
  { name: 'Avoid', description: 'Not interested', color: '#ef4444' },
  { name: 'High Conviction', description: 'High conviction pick', color: '#8b5cf6' },
  { name: 'Speculative', description: 'Speculative position', color: '#f97316' }
];

const insertTag = db.prepare(`
  INSERT OR IGNORE INTO custom_classifications (type, name, description, color)
  VALUES ('tag', ?, ?, ?)
`);

console.log('\nAdding default tags:');
for (const tag of defaultTags) {
  const result = insertTag.run(tag.name, tag.description, tag.color);
  if (result.changes > 0) {
    console.log(`  + ${tag.name}`);
  }
}

// Show final stats
const stats = db.prepare(`
  SELECT type, COUNT(*) as count
  FROM custom_classifications
  GROUP BY type
`).all();

console.log('\nCustom classification stats:');
stats.forEach(s => console.log(`  ${s.type}: ${s.count}`));

db.close();
console.log('\nDone!');
