// 038-add-prices-alpha-job-postgres.js
// Add prices.alpha job for Alpha Vantage updates of critical symbols

async function migrate(db) {
  console.log('Adding prices.alpha job...');

  // Get prices bundle ID
  const bundleResult = await db.query('SELECT id FROM update_bundles WHERE name = $1', ['prices']);
  const bundleId = bundleResult.rows[0]?.id;

  if (!bundleId) {
    console.log('  ⚠ prices bundle not found, skipping');
    return;
  }

  // Check if job already exists
  const existingJob = await db.query('SELECT id FROM update_jobs WHERE job_key = $1', ['prices.alpha']);
  if (existingJob.rows.length > 0) {
    console.log('  ⚠ prices.alpha job already exists, skipping');
    return;
  }

  // Insert the new job
  // Runs at 6:00 PM ET weekdays (5 minutes before prices.index)
  // Uses 20 of the 25 daily Alpha Vantage API calls
  await db.query(`
    INSERT INTO update_jobs (
      bundle_id, job_key, name, description, cron_expression,
      is_enabled, is_automatic, batch_size, batch_delay_ms, timeout_seconds
    ) VALUES (
      $1, 'prices.alpha', 'Alpha Vantage Critical Update',
      'Update critical stocks (indices + top 12) via Alpha Vantage API',
      '0 18 * * 1-5',
      1, 1, 20, 2000, 600
    )
  `, [bundleId]);

  console.log('  ✓ prices.alpha job added');
}

module.exports = { migrate };
