#!/usr/bin/env node
// src/scripts/import-etf-data.js
// One-time script to seed ETF expansion data

const path = require('path');

// Run migration first
console.log('='.repeat(60));
console.log('  ETF Data Import Script');
console.log('='.repeat(60));
console.log('');

// Step 1: Run migration
console.log('Step 1: Running database migration...');
const { migrate } = require('../database-migrations/add-etf-expansion');
migrate();
console.log('');

// Now get database and data files
const db = require('../database');
const database = db.getDatabase();

const { ETF_CATEGORIES } = require('../data/etf-categories');
const { ETF_ISSUERS } = require('../data/etf-issuers');
const { CURATED_ETFS } = require('../data/curated-etfs');
const { LAZY_PORTFOLIOS } = require('../data/lazy-portfolios');

// Step 2: Seed categories
console.log('Step 2: Seeding ETF categories...');
const insertCategory = database.prepare(`
  INSERT OR IGNORE INTO etf_categories (name, slug, parent_id, description, icon, display_order)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getCategoryId = database.prepare('SELECT id FROM etf_categories WHERE slug = ?');

// First pass: insert all categories
for (const cat of ETF_CATEGORIES) {
  insertCategory.run(cat.name, cat.slug, null, cat.description || null, cat.icon || null, cat.displayOrder);
}

// Second pass: set parent IDs
const updateParent = database.prepare('UPDATE etf_categories SET parent_id = ? WHERE slug = ?');
for (const cat of ETF_CATEGORIES) {
  if (cat.parentSlug) {
    const parent = getCategoryId.get(cat.parentSlug);
    if (parent) {
      updateParent.run(parent.id, cat.slug);
    }
  }
}

console.log(`  Seeded ${ETF_CATEGORIES.length} categories`);

// Step 3: Seed issuers
console.log('Step 3: Seeding ETF issuers...');
const insertIssuer = database.prepare(`
  INSERT OR IGNORE INTO etf_issuers (name, slug, full_name, website)
  VALUES (?, ?, ?, ?)
`);

for (const issuer of ETF_ISSUERS) {
  insertIssuer.run(issuer.name, issuer.slug, issuer.fullName, issuer.website || null);
}

console.log(`  Seeded ${ETF_ISSUERS.length} issuers`);

// Step 4: Import curated ETFs
console.log('Step 4: Importing curated ETFs as Tier 1...');
const upsertEtf = database.prepare(`
  INSERT INTO etf_definitions (
    symbol, name, category, issuer, expense_ratio, is_essential,
    index_tracked, strategy, tier, data_source, is_active
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'curated', 1)
  ON CONFLICT(symbol) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    issuer = excluded.issuer,
    expense_ratio = COALESCE(excluded.expense_ratio, expense_ratio),
    is_essential = excluded.is_essential,
    index_tracked = excluded.index_tracked,
    strategy = excluded.strategy,
    tier = 1,
    data_source = 'curated',
    last_updated = CURRENT_TIMESTAMP
`);

let imported = 0;
let updated = 0;

for (const etf of CURATED_ETFS) {
  const existing = database.prepare('SELECT id FROM etf_definitions WHERE symbol = ?').get(etf.symbol);

  upsertEtf.run(
    etf.symbol,
    etf.name,
    etf.category,
    etf.issuer,
    etf.expenseRatio,
    etf.isEssential ? 1 : 0,
    etf.indexTracked || null,
    etf.strategy || 'Passive'
  );

  if (existing) {
    updated++;
  } else {
    imported++;
  }
}

console.log(`  Imported ${imported} new ETFs, updated ${updated} existing`);
console.log(`  Total curated ETFs: ${CURATED_ETFS.length}`);
console.log(`  Essential ETFs: ${CURATED_ETFS.filter(e => e.isEssential).length}`);

// Step 5: Seed lazy portfolios
console.log('Step 5: Seeding lazy portfolios...');
const insertPortfolio = database.prepare(`
  INSERT OR IGNORE INTO lazy_portfolios (name, slug, description, source, risk_level, is_featured)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insertAllocation = database.prepare(`
  INSERT OR IGNORE INTO lazy_portfolio_allocations (portfolio_id, etf_symbol, weight, asset_class, notes)
  VALUES (?, ?, ?, ?, ?)
`);

const getPortfolioId = database.prepare('SELECT id FROM lazy_portfolios WHERE slug = ?');

for (const portfolio of LAZY_PORTFOLIOS) {
  insertPortfolio.run(
    portfolio.name,
    portfolio.slug,
    portfolio.description,
    portfolio.source,
    portfolio.riskLevel,
    portfolio.isFeatured ? 1 : 0
  );

  const dbPortfolio = getPortfolioId.get(portfolio.slug);
  if (dbPortfolio) {
    for (const alloc of portfolio.allocations) {
      insertAllocation.run(
        dbPortfolio.id,
        alloc.symbol,
        alloc.weight,
        alloc.assetClass,
        alloc.notes || null
      );
    }
  }
}

console.log(`  Seeded ${LAZY_PORTFOLIOS.length} lazy portfolios`);
console.log(`  Featured portfolios: ${LAZY_PORTFOLIOS.filter(p => p.isFeatured).length}`);

// Step 6: Update issuer statistics
console.log('Step 6: Updating issuer statistics...');
const issuerStats = database.prepare(`
  SELECT issuer, COUNT(*) as etf_count, SUM(aum) as total_aum
  FROM etf_definitions
  WHERE is_active = 1 AND issuer IS NOT NULL
  GROUP BY issuer
`).all();

const updateIssuerStats = database.prepare(`
  UPDATE etf_issuers SET etf_count = ?, total_aum = ?, updated_at = CURRENT_TIMESTAMP
  WHERE slug = ?
`);

for (const stat of issuerStats) {
  updateIssuerStats.run(stat.etf_count, stat.total_aum || 0, stat.issuer);
}

console.log(`  Updated stats for ${issuerStats.length} issuers`);

// Step 7: Summary
console.log('');
console.log('='.repeat(60));
console.log('  Import Complete!');
console.log('='.repeat(60));
console.log('');

// Get final counts
const tierCounts = database.prepare(`
  SELECT tier, COUNT(*) as count FROM etf_definitions WHERE is_active = 1 GROUP BY tier ORDER BY tier
`).all();

const categoryCounts = database.prepare(`
  SELECT category, COUNT(*) as count FROM etf_definitions WHERE is_active = 1 AND category IS NOT NULL
  GROUP BY category ORDER BY count DESC LIMIT 10
`).all();

console.log('ETF Counts by Tier:');
for (const t of tierCounts) {
  const tierName = t.tier === 1 ? 'Tier 1 (Curated)' : t.tier === 2 ? 'Tier 2 (Indexed)' : 'Tier 3 (On-demand)';
  console.log(`  ${tierName}: ${t.count}`);
}

console.log('');
console.log('Top 10 Categories:');
for (const c of categoryCounts) {
  console.log(`  ${c.category}: ${c.count}`);
}

console.log('');
console.log('Tables populated:');
console.log(`  - etf_definitions: ${database.prepare('SELECT COUNT(*) as c FROM etf_definitions').get().c} records`);
console.log(`  - etf_categories: ${database.prepare('SELECT COUNT(*) as c FROM etf_categories').get().c} records`);
console.log(`  - etf_issuers: ${database.prepare('SELECT COUNT(*) as c FROM etf_issuers').get().c} records`);
console.log(`  - lazy_portfolios: ${database.prepare('SELECT COUNT(*) as c FROM lazy_portfolios').get().c} records`);
console.log(`  - lazy_portfolio_allocations: ${database.prepare('SELECT COUNT(*) as c FROM lazy_portfolio_allocations').get().c} records`);

console.log('');
console.log('Next steps:');
console.log('  1. Restart the API server to pick up new routes');
console.log('  2. Test: curl http://localhost:3000/api/etfs');
console.log('  3. Test: curl http://localhost:3000/api/etfs/categories');
console.log('  4. Test: curl http://localhost:3000/api/etfs/lazy-portfolios');
console.log('  5. Test: curl http://localhost:3000/api/etfs/VOO (resolves from DB)');
console.log('  6. Test: curl http://localhost:3000/api/etfs/ARKF (fetches on-demand)');
console.log('');
