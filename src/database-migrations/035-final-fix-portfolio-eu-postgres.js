// 035-final-fix-portfolio-eu-postgres.js
// Final fix using explicit nextval() for ID generation

async function migrate(db) {
  console.log('Final fix for portfolio and EU bundles/jobs...');

  // Step 1: Diagnostic - check table structure
  const colInfo = await db.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'update_bundles' AND column_name = 'id'
  `);
  console.log('  Table structure:', JSON.stringify(colInfo.rows[0]));

  // Step 2: Clean up any rows with NULL id
  const deleteResult = await db.query('DELETE FROM update_bundles WHERE id IS NULL RETURNING name');
  if (deleteResult.rowCount > 0) {
    console.log(`  Deleted ${deleteResult.rowCount} corrupt rows:`, deleteResult.rows.map(r => r.name).join(', '));
  }

  // Step 3: Check if bundles exist with valid IDs
  const existingBundles = await db.query(
    'SELECT id, name FROM update_bundles WHERE name IN ($1, $2)',
    ['portfolio', 'eu']
  );
  console.log('  Existing bundles:', existingBundles.rows.map(r => `${r.name}(id=${r.id})`).join(', ') || 'none');

  let portfolioId = existingBundles.rows.find(r => r.name === 'portfolio')?.id;
  let euId = existingBundles.rows.find(r => r.name === 'eu')?.id;

  // Step 4: Create bundles using explicit nextval()
  if (!portfolioId) {
    console.log('  Creating portfolio bundle...');
    const result = await db.query(
      `INSERT INTO update_bundles (id, name, display_name, description, priority, is_automatic)
       VALUES (nextval('update_bundles_id_seq'), $1, $2, $3, $4, 1)
       RETURNING id, name`,
      ['portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55]
    );
    portfolioId = result.rows[0]?.id;
    console.log(`  Created portfolio: id=${portfolioId}, raw result:`, JSON.stringify(result.rows));

    // Verify it was actually created
    const verify = await db.query('SELECT id, name FROM update_bundles WHERE name = $1', ['portfolio']);
    console.log('  Verify portfolio:', JSON.stringify(verify.rows));
    portfolioId = verify.rows[0]?.id;
  }

  if (!euId) {
    console.log('  Creating eu bundle...');
    const result = await db.query(
      `INSERT INTO update_bundles (id, name, display_name, description, priority, is_automatic)
       VALUES (nextval('update_bundles_id_seq'), $1, $2, $3, $4, 1)
       RETURNING id, name`,
      ['eu', 'EU/UK Data', 'European and UK company data from XBRL', 65]
    );
    euId = result.rows[0]?.id;
    console.log(`  Created eu: id=${euId}, raw result:`, JSON.stringify(result.rows));

    // Verify it was actually created
    const verify = await db.query('SELECT id, name FROM update_bundles WHERE name = $1', ['eu']);
    console.log('  Verify eu:', JSON.stringify(verify.rows));
    euId = verify.rows[0]?.id;
  }

  // Final verification
  console.log(`  Final IDs: portfolio=${portfolioId}, eu=${euId}`);

  if (!portfolioId || !euId) {
    console.error('  ERROR: Failed to get valid bundle IDs!');
    console.error('  Aborting job creation.');
    return;
  }

  // Step 5: Insert jobs with explicit ON CONFLICT handling
  let inserted = 0;

  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    try {
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
    } catch (err) {
      console.error(`  ✗ Error creating ${jobKey}:`, err.message);
      return false;
    }
  }

  // Portfolio jobs
  if (await insertJob(portfolioId, 'portfolio.liquidity', 'Liquidity Metrics',
      'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
      '0 20 * * 1-5', 1, 500, 100, 7200)) inserted++;
  if (await insertJob(portfolioId, 'portfolio.snapshots', 'Portfolio Snapshots',
      'Create daily portfolio value snapshots for performance tracking',
      '0 19 * * 1-5', 1, 50, 500, 3600)) inserted++;

  // EU jobs
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

  console.log(`✅ Complete: ${inserted} new jobs added`);
}

module.exports = migrate;
