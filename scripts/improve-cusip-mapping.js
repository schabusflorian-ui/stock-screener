#!/usr/bin/env node
/**
 * CUSIP Mapping Improvement Script
 *
 * This script improves CUSIP-to-company mapping by:
 * 1. Finding unmapped CUSIPs from investment_decisions
 * 2. Trying to match them to companies by security name fuzzy matching
 * 3. Updating cusip_mapping and investment_decisions with company_ids
 */

const db = require('../src/database').db;

console.log('🔗 Starting CUSIP mapping improvement...\n');

// Step 1: Find all unique CUSIPs from holdings that aren't in cusip_mapping
const missingCusips = db.prepare(`
  SELECT DISTINCT ih.cusip, ih.security_name
  FROM investor_holdings ih
  LEFT JOIN cusip_mapping cm ON ih.cusip = cm.cusip
  WHERE cm.cusip IS NULL AND ih.cusip IS NOT NULL
`).all();

console.log(`📋 Found ${missingCusips.length} CUSIPs not in mapping table`);

// Step 2: Insert missing CUSIPs into cusip_mapping
const insertCusip = db.prepare(`
  INSERT OR IGNORE INTO cusip_mapping (cusip, security_name, created_at)
  VALUES (?, ?, datetime('now'))
`);

const insertMany = db.transaction((cusips) => {
  let added = 0;
  for (const c of cusips) {
    try {
      insertCusip.run(c.cusip, c.security_name);
      added++;
    } catch (e) {
      // Ignore duplicates
    }
  }
  return added;
});

const addedCount = insertMany(missingCusips);
console.log(`✅ Added ${addedCount} new CUSIPs to mapping table`);

// Step 3: Try to match CUSIPs to companies by name
console.log('\n🔍 Matching CUSIPs to companies by name...');

// Get all companies with price data for matching
const companiesWithPrices = db.prepare(`
  SELECT DISTINCT c.id, c.symbol, c.name,
    (SELECT COUNT(*) FROM daily_prices dp WHERE dp.company_id = c.id) as price_count
  FROM companies c
  WHERE c.name IS NOT NULL
`).all();

console.log(`📊 Companies available for matching: ${companiesWithPrices.length}`);

// Create lookup maps for faster matching
const symbolMap = new Map();
const nameMap = new Map();

for (const c of companiesWithPrices) {
  if (c.symbol) {
    symbolMap.set(c.symbol.toUpperCase(), c);
  }
  if (c.name) {
    // Create normalized name for matching
    const normalized = c.name.toUpperCase()
      .replace(/\s+(INC|CORP|CO|LTD|LLC|LP|PLC|SA|NV|AG|SE)\.?$/i, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .trim();
    nameMap.set(normalized, c);
  }
}

// Get unmapped CUSIPs
const unmappedCusips = db.prepare(`
  SELECT cusip, security_name
  FROM cusip_mapping
  WHERE company_id IS NULL AND security_name IS NOT NULL
`).all();

console.log(`📋 Unmapped CUSIPs to process: ${unmappedCusips.length}`);

// Try to match each CUSIP
const updateCusipMapping = db.prepare(`
  UPDATE cusip_mapping
  SET company_id = ?, symbol = ?, updated_at = datetime('now')
  WHERE cusip = ?
`);

let matched = 0;
let matchedWithPrices = 0;

const matchCusips = db.transaction(() => {
  for (const c of unmappedCusips) {
    const secName = c.security_name;
    if (!secName) continue;

    // Try exact symbol match from security name
    const symbolMatch = secName.match(/^([A-Z]{1,5})\s/);
    if (symbolMatch) {
      const symbol = symbolMatch[1];
      const company = symbolMap.get(symbol);
      if (company) {
        updateCusipMapping.run(company.id, company.symbol, c.cusip);
        matched++;
        if (company.price_count > 0) matchedWithPrices++;
        continue;
      }
    }

    // Try normalized name match
    const normalized = secName.toUpperCase()
      .replace(/\s+(INC|CORP|CO|LTD|LLC|LP|PLC|SA|NV|AG|SE|CLASS\s*[A-Z]|CL\s*[A-Z]|COM|COMMON|ORD|SHS?)\.?$/gi, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .trim();

    const nameMatch = nameMap.get(normalized);
    if (nameMatch) {
      updateCusipMapping.run(nameMatch.id, nameMatch.symbol, c.cusip);
      matched++;
      if (nameMatch.price_count > 0) matchedWithPrices++;
      continue;
    }

    // Try partial name match (first 10 characters)
    const partial = normalized.substring(0, 10);
    for (const [name, company] of nameMap) {
      if (name.startsWith(partial)) {
        updateCusipMapping.run(company.id, company.symbol, c.cusip);
        matched++;
        if (company.price_count > 0) matchedWithPrices++;
        break;
      }
    }
  }
});

matchCusips();
console.log(`✅ Matched ${matched} CUSIPs to companies (${matchedWithPrices} with price data)`);

// Step 4: Update investment_decisions with company_ids from cusip_mapping
console.log('\n🔄 Updating investment_decisions with company_ids...');

const updateDecisions = db.prepare(`
  UPDATE investment_decisions
  SET company_id = (
    SELECT cm.company_id
    FROM cusip_mapping cm
    WHERE cm.cusip = investment_decisions.cusip
  )
  WHERE company_id IS NULL
    AND cusip IN (SELECT cusip FROM cusip_mapping WHERE company_id IS NOT NULL)
`);

const result = updateDecisions.run();
console.log(`✅ Updated ${result.changes} investment_decisions with company_ids`);

// Step 5: Update investor_holdings with company_ids too
console.log('\n🔄 Updating investor_holdings with company_ids...');

const updateHoldings = db.prepare(`
  UPDATE investor_holdings
  SET company_id = (
    SELECT cm.company_id
    FROM cusip_mapping cm
    WHERE cm.cusip = investor_holdings.cusip
  )
  WHERE company_id IS NULL
    AND cusip IN (SELECT cusip FROM cusip_mapping WHERE company_id IS NOT NULL)
`);

const holdingsResult = updateHoldings.run();
console.log(`✅ Updated ${holdingsResult.changes} investor_holdings with company_ids`);

// Final stats
console.log('\n📊 Final Statistics:');

const stats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM cusip_mapping) as total_cusips,
    (SELECT COUNT(*) FROM cusip_mapping WHERE company_id IS NOT NULL) as mapped_cusips,
    (SELECT COUNT(*) FROM investment_decisions) as total_decisions,
    (SELECT COUNT(*) FROM investment_decisions WHERE company_id IS NOT NULL) as decisions_with_company,
    (SELECT COUNT(*) FROM investment_decisions WHERE return_1y IS NOT NULL) as decisions_with_returns
`).get();

console.log(`  CUSIP mappings: ${stats.mapped_cusips}/${stats.total_cusips} (${(stats.mapped_cusips/stats.total_cusips*100).toFixed(1)}%)`);
console.log(`  Decisions with company_id: ${stats.decisions_with_company}/${stats.total_decisions} (${(stats.decisions_with_company/stats.total_decisions*100).toFixed(1)}%)`);
console.log(`  Decisions with returns: ${stats.decisions_with_returns}`);

console.log('\n🔗 CUSIP mapping improvement complete!');
