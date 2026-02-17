// 033-fix-corrupt-bundles-postgres.js
// Fix corrupt bundle rows where id is NULL and insert missing jobs

async function migrate(db) {
  console.log('Fixing corrupt bundle data...');

  // First, check what's in update_bundles for portfolio and eu
  const bundleCheck = await db.query('SELECT * FROM update_bundles WHERE name IN ($1, $2)', ['portfolio', 'eu']);
  console.log('  Current bundles:', bundleCheck.rows.map(r => `${r.name}(id=${r.id})`).join(', ') || 'none');

  // Delete corrupt rows (where id is NULL) - this shouldn't happen but let's clean up
  const deleteResult = await db.query('DELETE FROM update_bundles WHERE id IS NULL');
  if (deleteResult.rowCount > 0) {
    console.log(`  Deleted ${deleteResult.rowCount} corrupt bundle rows (id=NULL)`);
  }

  // Check if bundles exist after cleanup
  const portfolioCheck = await db.query('SELECT id FROM update_bundles WHERE name = $1', ['portfolio']);
  const euCheck = await db.query('SELECT id FROM update_bundles WHERE name = $1', ['eu']);

  let portfolioId = portfolioCheck.rows[0]?.id;
  let euId = euCheck.rows[0]?.id;

  // Create portfolio bundle if not exists
  if (!portfolioId) {
    console.log('  Creating portfolio bundle...');
    const result = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING id`,
      ['portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55]
    );
    portfolioId = result.rows[0].id;
    console.log(`  Created portfolio bundle with id=${portfolioId}`);
  } else {
    console.log(`  Portfolio bundle exists with id=${portfolioId}`);
  }

  // Create eu bundle if not exists
  if (!euId) {
    console.log('  Creating eu bundle...');
    const result = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING id`,
      ['eu', 'EU/UK Data', 'European and UK company data from XBRL', 65]
    );
    euId = result.rows[0].id;
    console.log(`  Created eu bundle with id=${euId}`);
  } else {
    console.log(`  EU bundle exists with id=${euId}`);
  }

  // Now insert jobs
  let inserted = 0;

  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) {
      console.log(`  SKIP: ${jobKey} - no bundle ID`);
      return false;
    }
    const existsResult = await db.query('SELECT id FROM update_jobs WHERE job_key = $1', [jobKey]);
    if (existsResult.rows.length > 0) {
      console.log(`  - Exists: ${jobKey}`);
      return false;
    }
    await db.query(
      `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
    );
    console.log(`  ✓ Inserted: ${jobKey}`);
    return true;
  }

  // Portfolio jobs
  if (portfolioId) {
    if (await insertJob(portfolioId, 'portfolio.liquidity', 'Liquidity Metrics',
        'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
        '0 20 * * 1-5', 1, 500, 100, 7200)) inserted++;
    if (await insertJob(portfolioId, 'portfolio.snapshots', 'Portfolio Snapshots',
        'Create daily portfolio value snapshots for performance tracking',
        '0 19 * * 1-5', 1, 50, 500, 3600)) inserted++;
  }

  // EU jobs
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
