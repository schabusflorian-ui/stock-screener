/**
 * Parse XBRL Filings Script
 *
 * Fetches xBRL-JSON from filings.xbrl.org and extracts fundamental metrics
 * for all unparsed filings in the database.
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Import parser
const { XBRLParser } = require('../src/services/xbrl/xbrlParser');
const parser = new XBRLParser();

// Rate limiting
const BATCH_SIZE = 50;
const DELAY_BETWEEN_REQUESTS = 200; // ms
const DELAY_BETWEEN_BATCHES = 2000; // ms

// Stats
let stats = {
  processed: 0,
  success: 0,
  failed: 0,
  metricsStored: 0
};

/**
 * Fetch JSON from filings.xbrl.org
 */
function fetchJson(jsonPath) {
  return new Promise((resolve, reject) => {
    const url = `https://filings.xbrl.org${jsonPath}`;

    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 InvestmentPlatform/1.0' },
      timeout: 30000
    }, (res) => {
      if (res.statusCode === 404) {
        resolve(null);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject)
      .on('timeout', () => reject(new Error('Timeout')));
  });
}

/**
 * Store parsed metrics in database
 */
function storeMetrics(identifierId, filingId, companyId, flatRecord) {
  if (!flatRecord || !flatRecord.period_end) return false;

  // Check if already exists
  const existing = db.prepare(`
    SELECT id FROM xbrl_fundamental_metrics
    WHERE identifier_id = ? AND period_end = ? AND period_type = ?
  `).get(identifierId, flatRecord.period_end, flatRecord.period_type || 'annual');

  if (existing) {
    // Update existing
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(flatRecord)) {
      if (value !== null && value !== undefined && key !== 'period_end' && key !== 'period_type') {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length > 0) {
      values.push(existing.id);
      db.prepare(`UPDATE xbrl_fundamental_metrics SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    }
    return true;
  }

  // Insert new
  const fields = ['identifier_id', 'filing_id', 'company_id'];
  const values = [identifierId, filingId, companyId];

  for (const [key, value] of Object.entries(flatRecord)) {
    if (value !== null && value !== undefined) {
      fields.push(key);
      values.push(value);
    }
  }

  const placeholders = fields.map(() => '?').join(', ');
  db.prepare(`INSERT INTO xbrl_fundamental_metrics (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);

  return true;
}

/**
 * Process a single filing
 */
async function processFiling(filing) {
  try {
    if (!filing.json_url) {
      db.prepare('UPDATE xbrl_filings SET parsed = 1, parse_errors = ? WHERE id = ?')
        .run('No JSON URL', filing.id);
      return false;
    }

    // Fetch JSON
    const json = await fetchJson(filing.json_url);

    if (!json) {
      db.prepare('UPDATE xbrl_filings SET parsed = 1, parse_errors = ? WHERE id = ?')
        .run('JSON not found (404)', filing.id);
      return false;
    }

    // Parse
    const parsed = parser.parseXBRLJson(json);

    if (!parsed || Object.keys(parsed.periods).length === 0) {
      db.prepare('UPDATE xbrl_filings SET parsed = 1, parse_errors = ? WHERE id = ?')
        .run('No periods extracted', filing.id);
      return false;
    }

    // Get company_id from identifier
    let companyId = null;
    if (filing.identifier_id) {
      const identifier = db.prepare('SELECT company_id FROM company_identifiers WHERE id = ?').get(filing.identifier_id);
      companyId = identifier?.company_id;
    }

    // Store metrics for each period
    let stored = 0;
    for (const [periodKey, periodData] of Object.entries(parsed.periods)) {
      const flatRecord = parser.toFlatRecord(parsed, periodKey);
      if (flatRecord && storeMetrics(filing.identifier_id, filing.id, companyId, flatRecord)) {
        stored++;
      }
    }

    // Mark as parsed
    db.prepare('UPDATE xbrl_filings SET parsed = 1, parse_errors = NULL WHERE id = ?').run(filing.id);
    stats.metricsStored += stored;

    return true;
  } catch (error) {
    db.prepare('UPDATE xbrl_filings SET parsed = 1, parse_errors = ? WHERE id = ?')
      .run(error.message, filing.id);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n=== XBRL Filing Parser ===\n');

  // Get unparsed filings
  const unparsed = db.prepare(`
    SELECT f.*, ci.company_id
    FROM xbrl_filings f
    LEFT JOIN company_identifiers ci ON f.identifier_id = ci.id
    WHERE f.parsed = 0
    ORDER BY f.period_end DESC
  `).all();

  console.log(`Found ${unparsed.length} unparsed filings\n`);

  if (unparsed.length === 0) {
    console.log('Nothing to parse!');
    return;
  }

  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < unparsed.length; i += BATCH_SIZE) {
    const batch = unparsed.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(unparsed.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} filings)`);

    for (const filing of batch) {
      stats.processed++;

      const success = await processFiling(filing);
      if (success) {
        stats.success++;
      } else {
        stats.failed++;
      }

      // Rate limit
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
    }

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = stats.processed / elapsed;
    const remaining = unparsed.length - stats.processed;
    const eta = remaining / rate;

    console.log(`  Processed: ${stats.processed}/${unparsed.length} | Success: ${stats.success} | Failed: ${stats.failed} | ETA: ${Math.round(eta)}s`);

    // Pause between batches
    if (i + BATCH_SIZE < unparsed.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
  }

  console.log('\n=== Final Results ===');
  console.log(`Processed: ${stats.processed}`);
  console.log(`Success: ${stats.success}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Metrics stored: ${stats.metricsStored}`);

  // Show updated stats
  const metricsCount = db.prepare('SELECT COUNT(*) as count FROM xbrl_fundamental_metrics').get();
  const byCountry = db.prepare(`
    SELECT ci.country, COUNT(DISTINCT m.identifier_id) as companies, COUNT(m.id) as metrics
    FROM xbrl_fundamental_metrics m
    JOIN company_identifiers ci ON m.identifier_id = ci.id
    GROUP BY ci.country
    ORDER BY companies DESC
  `).all();

  console.log(`\nTotal metrics in DB: ${metricsCount.count}`);
  console.log('\nBy country:');
  byCountry.forEach(c => console.log(`  ${c.country}: ${c.companies} companies, ${c.metrics} metrics`));
}

main().catch(console.error);
