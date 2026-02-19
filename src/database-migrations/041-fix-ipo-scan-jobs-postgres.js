// 041-fix-ipo-scan-jobs-postgres.js
// Fix: Migration 040 used wrong export format, so jobs weren't created
// This migration creates the ipo.scan and ipo.scan_eu jobs if they don't exist

async function run(db) {
  console.log('Fixing IPO scan jobs (040 used wrong export)...');

  // Get ipo bundle ID
  const bundleResult = await db.query('SELECT id FROM update_bundles WHERE name = $1', ['ipo']);
  const bundleId = bundleResult.rows[0]?.id;

  if (!bundleId) {
    console.log('  ⚠ ipo bundle not found, skipping');
    return;
  }

  console.log(`  Found ipo bundle with id=${bundleId}`);

  // Add ipo.scan job (US IPOs from SEC)
  const existingScan = await db.query('SELECT id FROM update_jobs WHERE job_key = $1', ['ipo.scan']);
  if (existingScan.rows.length > 0) {
    console.log('  ⚠ ipo.scan job already exists, skipping');
  } else {
    // Runs at 8:00 AM ET weekdays to catch new S-1 filings
    await db.query(`
      INSERT INTO update_jobs (
        bundle_id, job_key, name, description, cron_expression,
        is_enabled, is_automatic, batch_size, batch_delay_ms, timeout_seconds
      ) VALUES (
        $1, 'ipo.scan', 'US IPO Scan',
        'Scan SEC EDGAR for new S-1 filings and IPO updates',
        '0 8 * * 1-5',
        1, 1, 50, 500, 300
      )
    `, [bundleId]);
    console.log('  ✓ ipo.scan job added (runs 8 AM ET weekdays)');
  }

  // Add ipo.scan_eu job (EU/UK IPOs from ESMA/FCA)
  const existingScanEU = await db.query('SELECT id FROM update_jobs WHERE job_key = $1', ['ipo.scan_eu']);
  if (existingScanEU.rows.length > 0) {
    console.log('  ⚠ ipo.scan_eu job already exists, skipping');
  } else {
    // Runs at 9:00 AM ET weekdays (after US markets open, catches EU filings)
    await db.query(`
      INSERT INTO update_jobs (
        bundle_id, job_key, name, description, cron_expression,
        is_enabled, is_automatic, batch_size, batch_delay_ms, timeout_seconds
      ) VALUES (
        $1, 'ipo.scan_eu', 'EU/UK IPO Scan',
        'Scan ESMA and FCA for new prospectuses and EU/UK IPO updates',
        '0 9 * * 1-5',
        1, 1, 50, 1000, 600
      )
    `, [bundleId]);
    console.log('  ✓ ipo.scan_eu job added (runs 9 AM ET weekdays)');
  }

  console.log('  IPO scan jobs fix complete');
}

module.exports = { run };
