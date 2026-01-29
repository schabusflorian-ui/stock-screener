// scripts/import_esma_backfill.js
// Import ESMA prospectus backfill data into the IPO tracker database

const { db } = require('../src/database');
const fs = require('fs');
const path = require('path');

const backfillFile = process.argv[2] || '/tmp/esma_backfill.json';

// Read backfill data
const data = JSON.parse(fs.readFileSync(backfillFile, 'utf8'));
console.log(`Loaded ${data.count} prospectuses from backfill file`);

let created = 0;
let skipped = 0;
let errors = 0;

for (const p of data.prospectuses) {
  // Skip if no company name
  if (!p.entity_name) {
    skipped++;
    continue;
  }

  // Check if exists by LEI or prospectus_id
  if (p.lei) {
    const existing = db.prepare('SELECT id FROM ipo_tracker WHERE lei = ?').get(p.lei);
    if (existing) {
      skipped++;
      continue;
    }
  }

  if (p.document_id) {
    const existing = db.prepare('SELECT id FROM ipo_tracker WHERE prospectus_id = ?').get(p.document_id);
    if (existing) {
      skipped++;
      continue;
    }
  }

  // Insert new IPO
  // Generate a synthetic CIK for EU IPOs (format: EU-{document_id or hash})
  const syntheticCik = `EU-${p.document_id || p.lei || Math.random().toString(36).substring(7)}`;

  try {
    db.prepare(`
      INSERT INTO ipo_tracker (
        cik, company_name, lei, isin, region, regulator,
        prospectus_id, prospectus_url, home_member_state,
        approval_date, initial_s1_date, status, is_active
      ) VALUES (?, ?, ?, ?, 'EU', 'ESMA', ?, ?, ?, ?, ?, 'EFFECTIVE', 1)
    `).run(
      syntheticCik,
      p.entity_name,
      p.lei || null,
      p.isin || null,
      p.document_id || null,
      p.prospectus_url || null,
      p.home_member_state || null,
      p.approval_date || null,
      p.approval_date || null
    );
    created++;
    console.log(`  Created: ${p.entity_name} (${p.home_member_state || 'EU'})`);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      skipped++;
    } else {
      console.error(`  Error: ${p.entity_name}: ${err.message}`);
      errors++;
    }
  }
}

console.log(`\nBackfill complete: ${created} created, ${skipped} skipped, ${errors} errors`);

// Show summary by country
const byCountry = db.prepare(`
  SELECT home_member_state, COUNT(*) as count
  FROM ipo_tracker
  WHERE region = 'EU'
  GROUP BY home_member_state
  ORDER BY count DESC
`).all();

console.log('\nEU IPOs by country:');
for (const row of byCountry) {
  console.log(`  ${row.home_member_state || 'Unknown'}: ${row.count}`);
}
