// 030-add-portfolio-eu-bundles-postgres.js
// Add portfolio and EU bundles for liquidity metrics, portfolio snapshots, and EU/UK data

async function migrate(db) {
  console.log('Adding portfolio and EU bundles...');

  // === ADD BUNDLES ===
  const bundles = [
    ['portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55, 1],
    ['eu', 'EU/UK Data', 'European and UK company data from XBRL', 65, 1]
  ];

  for (const [name, display_name, description, priority, is_automatic] of bundles) {
    await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (SELECT 1 FROM update_bundles WHERE name = $1)`,
      [name, display_name, description, priority, is_automatic]
    );
  }
  console.log('  ✓ portfolio and eu bundles added');

  // Helper to get bundle ID
  async function getBundleId(name) {
    const result = await db.query('SELECT id FROM update_bundles WHERE name = $1', [name]);
    console.log(`  DEBUG: getBundleId('${name}') result:`, result.rows);
    return result.rows[0]?.id;
  }

  // Helper to insert job if not exists
  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) return;
    await db.query(
      `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       WHERE NOT EXISTS (SELECT 1 FROM update_jobs WHERE job_key = $2)`,
      [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
    );
  }

  // === PORTFOLIO BUNDLE ===
  const portfolioId = await getBundleId('portfolio');
  console.log('  DEBUG: portfolioId =', portfolioId, typeof portfolioId);
  if (portfolioId) {
    await insertJob(
      portfolioId,
      'portfolio.liquidity',
      'Liquidity Metrics',
      'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
      '0 20 * * 1-5',  // 8:00 PM ET weekdays
      1,
      500,
      100,
      7200
    );
    await insertJob(
      portfolioId,
      'portfolio.snapshots',
      'Portfolio Snapshots',
      'Create daily portfolio value snapshots for performance tracking',
      '0 19 * * 1-5',  // 7:00 PM ET weekdays
      1,
      50,
      500,
      3600
    );
    console.log('  ✓ portfolio jobs seeded');
  }

  // === EU BUNDLE ===
  const euId = await getBundleId('eu');
  console.log('  DEBUG: euId =', euId, typeof euId);
  if (euId) {
    await insertJob(
      euId,
      'eu.xbrl_import',
      'XBRL Filing Import',
      'Import XBRL filings from EU/UK regulatory sources',
      '0 2 * * 0',  // 2:00 AM Sunday
      1,
      100,
      2000,
      14400  // 4 hours
    );
    await insertJob(
      euId,
      'eu.sync',
      'XBRL Data Sync',
      'Link XBRL companies and sync metrics to main tables',
      '0 4 * * 0',  // 4:00 AM Sunday
      1,
      200,
      500,
      7200
    );
    await insertJob(
      euId,
      'eu.indices',
      'European Indices',
      'Update European stock indices (FTSE, DAX, CAC, etc.)',
      '0 18 * * 1-5',  // 6:00 PM weekdays (after EU close)
      1,
      30,
      1000,
      1800
    );
    await insertJob(
      euId,
      'eu.prices',
      'EU/UK Prices',
      'Fetch daily prices for EU/UK companies',
      '0 17 * * 1-5',  // 5:00 PM weekdays (after EU close)
      1,
      100,
      500,
      3600
    );
    console.log('  ✓ eu jobs seeded');
  }

  // === ADD MISSING MAINTENANCE JOBS ===
  const maintenanceId = await getBundleId('maintenance');
  if (maintenanceId) {
    await insertJob(
      maintenanceId,
      'maintenance.health_check',
      'Health Check',
      'Check database health and data freshness',
      '0 */6 * * *',  // Every 6 hours
      1,
      10,
      100,
      600
    );
    await insertJob(
      maintenanceId,
      'maintenance.stale_check',
      'Stale Data Check',
      'Identify companies with stale price or financial data',
      '0 6 * * *',  // 6:00 AM daily
      1,
      100,
      100,
      1800
    );
    console.log('  ✓ maintenance jobs updated');
  }

  // === ADD MISSING FUNDAMENTALS JOB ===
  const fundamentalsId = await getBundleId('fundamentals');
  if (fundamentalsId) {
    await insertJob(
      fundamentalsId,
      'fundamentals.dividends',
      'Dividend Update',
      'Update dividend data for dividend-paying companies',
      '0 9 * * *',  // 9:00 AM daily
      1,
      100,
      500,
      3600
    );
    console.log('  ✓ fundamentals jobs updated');
  }

  console.log('✅ Portfolio and EU bundles ready.');
}

module.exports = migrate;
