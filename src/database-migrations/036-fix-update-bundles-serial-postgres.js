// 036-fix-update-bundles-serial-postgres.js
// Fix update_bundles.id to have proper SERIAL behavior
// The table was created without SERIAL (probably from data migration)

async function migrate(db) {
  console.log('Fixing update_bundles.id column to have SERIAL behavior...');

  // Step 1: Clean up any NULL id rows
  const deleteResult = await db.query('DELETE FROM update_bundles WHERE id IS NULL RETURNING name');
  if (deleteResult.rowCount > 0) {
    console.log(`  Deleted ${deleteResult.rowCount} rows with NULL id`);
  }

  // Step 2: Find the max ID currently in use
  const maxResult = await db.query('SELECT COALESCE(MAX(id), 0) as max_id FROM update_bundles');
  const maxId = maxResult.rows[0].max_id || 0;
  console.log(`  Current max ID: ${maxId}`);

  // Step 3: Create sequence if not exists
  try {
    await db.query(`CREATE SEQUENCE IF NOT EXISTS update_bundles_id_seq START WITH ${maxId + 1}`);
    console.log('  Created update_bundles_id_seq');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('  Sequence already exists');
      // Reset sequence to max id + 1
      await db.query(`SELECT setval('update_bundles_id_seq', $1, false)`, [maxId + 1]);
      console.log(`  Reset sequence to ${maxId + 1}`);
    } else {
      throw err;
    }
  }

  // Step 4: Set the column default
  await db.query(`ALTER TABLE update_bundles ALTER COLUMN id SET DEFAULT nextval('update_bundles_id_seq')`);
  console.log('  Set id column default to nextval()');

  // Step 5: Make column NOT NULL (if there are no NULL values)
  try {
    await db.query('ALTER TABLE update_bundles ALTER COLUMN id SET NOT NULL');
    console.log('  Set id column to NOT NULL');
  } catch (err) {
    console.log('  Could not set NOT NULL (may have NULL values):', err.message);
  }

  // Step 6: Now create the bundles
  const bundleCheck = await db.query('SELECT id, name FROM update_bundles WHERE name IN ($1, $2)', ['portfolio', 'eu']);
  console.log('  Existing bundles:', bundleCheck.rows.map(r => `${r.name}(id=${r.id})`).join(', ') || 'none');

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

  if (!portfolioId || !euId) {
    throw new Error(`Failed to create bundles: portfolio=${portfolioId}, eu=${euId}`);
  }

  // Step 7: Insert jobs
  let inserted = 0;

  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
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

  console.log(`✅ Fixed table structure and added ${inserted} new jobs`);
}

module.exports = migrate;
