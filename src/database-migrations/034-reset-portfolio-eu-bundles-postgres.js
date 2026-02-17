// 034-reset-portfolio-eu-bundles-postgres.js
// Final fix for portfolio and EU bundles/jobs
// This migration:
// 1. Removes 032/033 from schema_migrations so they don't block future runs
// 2. Deletes corrupt bundle rows (id=NULL)
// 3. Ensures bundles exist with proper IDs
// 4. Inserts all jobs

async function migrate(db) {
  console.log('Resetting portfolio and EU bundles/jobs...');

  // Step 1: Remove 032/033 from schema_migrations to prevent them from blocking
  await db.query(`
    DELETE FROM schema_migrations
    WHERE name IN ('032-fix-portfolio-eu-jobs-postgres', '033-fix-corrupt-bundles-postgres')
  `);
  console.log('  Cleared 032/033 from migration history');

  // Step 2: Delete corrupt rows where id IS NULL
  const deleteResult = await db.query('DELETE FROM update_bundles WHERE id IS NULL RETURNING name');
  if (deleteResult.rowCount > 0) {
    console.log(`  Deleted ${deleteResult.rowCount} corrupt rows:`, deleteResult.rows.map(r => r.name).join(', '));
  }

  // Step 3: Check existing bundles
  const bundleCheck = await db.query('SELECT id, name FROM update_bundles WHERE name IN ($1, $2)', ['portfolio', 'eu']);
  console.log('  Existing bundles:', bundleCheck.rows.map(r => `${r.name}(id=${r.id})`).join(', ') || 'none');

  // Step 4: Create bundles if needed
  let portfolioId = bundleCheck.rows.find(r => r.name === 'portfolio')?.id;
  let euId = bundleCheck.rows.find(r => r.name === 'eu')?.id;

  if (!portfolioId) {
    const result = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING id`,
      ['portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55]
    );
    portfolioId = result.rows[0].id;
    console.log(`  Created portfolio bundle with id=${portfolioId}`);
  }

  if (!euId) {
    const result = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING id`,
      ['eu', 'EU/UK Data', 'European and UK company data from XBRL', 65]
    );
    euId = result.rows[0].id;
    console.log(`  Created eu bundle with id=${euId}`);
  }

  // Step 5: Insert jobs (using INSERT ... ON CONFLICT DO NOTHING)
  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) return false;

    // Use ON CONFLICT to handle existing jobs
    const result = await db.query(
      `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (job_key) DO NOTHING
       RETURNING id`,
      [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
    );

    if (result.rowCount > 0) {
      console.log(`  ✓ Created: ${jobKey} (id=${result.rows[0].id})`);
      return true;
    } else {
      console.log(`  - Exists: ${jobKey}`);
      return false;
    }
  }

  let inserted = 0;

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

  console.log(`✅ Reset complete: ${inserted} new jobs added`);
}

module.exports = migrate;
