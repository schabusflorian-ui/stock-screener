// 032-fix-portfolio-eu-jobs-postgres.js
// Fix: properly add portfolio and EU jobs (031 failed due to missing unique constraint)

async function migrate(db) {
  console.log('Fixing portfolio and EU jobs...');

  // First, add unique constraint on update_bundles.name if not exists
  try {
    await db.query(`
      ALTER TABLE update_bundles
      ADD CONSTRAINT update_bundles_name_unique UNIQUE (name)
    `);
    console.log('  Added unique constraint on update_bundles.name');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('  Unique constraint already exists');
    } else {
      console.log('  Could not add unique constraint:', err.message);
    }
  }

  // Helper to get bundle ID - with full row debug
  async function getBundleId(name) {
    const result = await db.query('SELECT * FROM update_bundles WHERE name = $1', [name]);
    if (result.rows.length > 0) {
      console.log(`  getBundleId('${name}'): id = ${result.rows[0].id}`);
      return result.rows[0].id;
    }
    console.log(`  getBundleId('${name}'): no rows found`);
    return null;
  }

  // Helper to ensure bundle exists and return ID
  async function ensureBundle(name, displayName, description, priority) {
    let bundleId = await getBundleId(name);
    if (bundleId) return bundleId;

    console.log(`  Creating bundle: ${name}`);
    // Insert new bundle
    const insertResult = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING id`,
      [name, displayName, description, priority]
    );
    console.log(`  Created bundle with id=${insertResult.rows[0].id}`);
    return insertResult.rows[0].id;
  }

  // Helper to insert job if not exists
  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) {
      console.log(`  SKIP: ${jobKey} - no bundle ID`);
      return false;
    }
    try {
      // Check if job exists
      const existsResult = await db.query('SELECT id FROM update_jobs WHERE job_key = $1', [jobKey]);
      if (existsResult.rows.length > 0) {
        console.log(`  - Exists: ${jobKey} (id=${existsResult.rows[0].id})`);
        return false;
      }

      // Insert new job
      const result = await db.query(
        `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
      );
      console.log(`  ✓ Inserted: ${jobKey} (id=${result.rows[0].id})`);
      return true;
    } catch (err) {
      console.error(`  ✗ Error inserting ${jobKey}:`, err.message);
      return false;
    }
  }

  let inserted = 0;

  // === PORTFOLIO BUNDLE ===
  const portfolioId = await ensureBundle('portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55);
  if (portfolioId) {
    if (await insertJob(portfolioId, 'portfolio.liquidity', 'Liquidity Metrics',
        'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
        '0 20 * * 1-5', 1, 500, 100, 7200)) inserted++;
    if (await insertJob(portfolioId, 'portfolio.snapshots', 'Portfolio Snapshots',
        'Create daily portfolio value snapshots for performance tracking',
        '0 19 * * 1-5', 1, 50, 500, 3600)) inserted++;
  }

  // === EU BUNDLE ===
  const euId = await ensureBundle('eu', 'EU/UK Data', 'European and UK company data from XBRL', 65);
  if (euId) {
    if (await insertJob(euId, 'eu.xbrl_import', 'XBRL Filing Import',
        'Import XBRL filings from EU/UK regulatory sources',
        '0 2 * * 0', 1, 100, 2000, 14400)) inserted++;
    if (await insertJob(euId, 'eu.sync', 'XBRL Data Sync',
        'Link XBRL companies and sync metrics to main tables',
        '0 4 * * 0', 1, 200, 500, 7200)) inserted++;
    if (await insertJob(euId, 'eu.indices', 'European Indices',
        'Update European stock indices (FTSE, DAX, CAC, etc.)',
        '0 18 * * 1-5', 1, 30, 1000, 1800)) inserted++;
    if (await insertJob(euId, 'eu.prices', 'EU/UK Prices',
        'Fetch daily prices for EU/UK companies',
        '0 17 * * 1-5', 1, 100, 500, 3600)) inserted++;
  }

  console.log(`✅ Added ${inserted} new jobs`);
}

module.exports = migrate;
