#!/usr/bin/env node
// Insert prices.alpha job directly into database

const { Pool } = require('pg');

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Get prices bundle ID
    const bundleResult = await client.query("SELECT id FROM update_bundles WHERE name = 'prices'");
    const bundleId = bundleResult.rows[0]?.id;
    console.log('Prices bundle ID:', bundleId);

    if (!bundleId) {
      console.error('Prices bundle not found!');
      process.exit(1);
    }

    // Check if job exists
    const existingJob = await client.query("SELECT id FROM update_jobs WHERE job_key = 'prices.alpha'");
    if (existingJob.rows.length > 0) {
      console.log('Job already exists with ID:', existingJob.rows[0].id);
      return;
    }

    // Insert job
    const insertResult = await client.query(`
      INSERT INTO update_jobs (
        bundle_id, job_key, name, description, cron_expression,
        is_enabled, is_automatic, batch_size, batch_delay_ms, timeout_seconds
      ) VALUES (
        $1, 'prices.alpha', 'Alpha Vantage Critical Update',
        'Update critical stocks (indices + top 12) via Alpha Vantage API',
        '0 18 * * 1-5',
        1, 1, 20, 2000, 600
      )
      RETURNING id
    `, [bundleId]);

    console.log('Created job with ID:', insertResult.rows[0].id);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
