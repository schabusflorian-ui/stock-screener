// 031-add-portfolio-eu-jobs-postgres.js
// Add missing portfolio and EU jobs (bundles already exist from 030)

async function migrate(db) {
  console.log('Adding portfolio and EU jobs...');

  // Helper to get bundle ID
  async function getBundleId(name) {
    const result = await db.query('SELECT id FROM update_bundles WHERE name = $1', [name]);
    console.log(`  getBundleId('${name}'): rows =`, result.rows.length, ', id =', result.rows[0]?.id);
    return result.rows[0]?.id;
  }

  // Helper to insert job if not exists
  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) {
      console.log(`  SKIP: ${jobKey} - no bundle ID`);
      return false;
    }
    try {
      const result = await db.query(
        `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
         WHERE NOT EXISTS (SELECT 1 FROM update_jobs WHERE job_key = $2)
         RETURNING id`,
        [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
      );
      if (result.rows.length > 0) {
        console.log(`  ✓ Inserted: ${jobKey} (id=${result.rows[0].id})`);
        return true;
      } else {
        console.log(`  - Exists: ${jobKey}`);
        return false;
      }
    } catch (err) {
      console.error(`  ✗ Error inserting ${jobKey}:`, err.message);
      return false;
    }
  }

  let inserted = 0;

  // === PORTFOLIO BUNDLE ===
  const portfolioId = await getBundleId('portfolio');
  if (portfolioId) {
    if (await insertJob(portfolioId, 'portfolio.liquidity', 'Liquidity Metrics',
        'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
        '0 20 * * 1-5', 1, 500, 100, 7200)) inserted++;
    if (await insertJob(portfolioId, 'portfolio.snapshots', 'Portfolio Snapshots',
        'Create daily portfolio value snapshots for performance tracking',
        '0 19 * * 1-5', 1, 50, 500, 3600)) inserted++;
  } else {
    console.log('  WARNING: portfolio bundle not found, creating it...');
    await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ('portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55, 1)
       ON CONFLICT (name) DO NOTHING`
    );
    const newPortfolioId = await getBundleId('portfolio');
    if (newPortfolioId) {
      if (await insertJob(newPortfolioId, 'portfolio.liquidity', 'Liquidity Metrics',
          'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
          '0 20 * * 1-5', 1, 500, 100, 7200)) inserted++;
      if (await insertJob(newPortfolioId, 'portfolio.snapshots', 'Portfolio Snapshots',
          'Create daily portfolio value snapshots for performance tracking',
          '0 19 * * 1-5', 1, 50, 500, 3600)) inserted++;
    }
  }

  // === EU BUNDLE ===
  const euId = await getBundleId('eu');
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
  } else {
    console.log('  WARNING: eu bundle not found, creating it...');
    await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ('eu', 'EU/UK Data', 'European and UK company data from XBRL', 65, 1)
       ON CONFLICT (name) DO NOTHING`
    );
    const newEuId = await getBundleId('eu');
    if (newEuId) {
      if (await insertJob(newEuId, 'eu.xbrl_import', 'XBRL Filing Import',
          'Import XBRL filings from EU/UK regulatory sources',
          '0 2 * * 0', 1, 100, 2000, 14400)) inserted++;
      if (await insertJob(newEuId, 'eu.sync', 'XBRL Data Sync',
          'Link XBRL companies and sync metrics to main tables',
          '0 4 * * 0', 1, 200, 500, 7200)) inserted++;
      if (await insertJob(newEuId, 'eu.indices', 'European Indices',
          'Update European stock indices (FTSE, DAX, CAC, etc.)',
          '0 18 * * 1-5', 1, 30, 1000, 1800)) inserted++;
      if (await insertJob(newEuId, 'eu.prices', 'EU/UK Prices',
          'Fetch daily prices for EU/UK companies',
          '0 17 * * 1-5', 1, 100, 500, 3600)) inserted++;
    }
  }

  console.log(`✅ Added ${inserted} new jobs`);
}

module.exports = migrate;
