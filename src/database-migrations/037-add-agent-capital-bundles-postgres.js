// 037-add-agent-capital-bundles-postgres.js
// Add agent and capital bundles with their jobs
// Also add missing jobs to portfolio and eu bundles

async function migrate(db) {
  console.log('Adding agent and capital bundles with jobs...');

  // Helper to get bundle ID
  async function getBundleId(name) {
    const result = await db.query('SELECT id FROM update_bundles WHERE name = $1', [name]);
    return result.rows[0]?.id;
  }

  // Helper to insert job if not exists
  async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
    if (!bundleId) {
      console.log(`  - Skipping ${jobKey} - bundle not found`);
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
    console.log(`  + Created: ${jobKey}`);
    return true;
  }

  let jobsCreated = 0;

  // === CREATE AGENT BUNDLE ===
  let agentId = await getBundleId('agent');
  if (!agentId) {
    const result = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1) RETURNING id`,
      ['agent', 'Trading Agents', 'AI trading agent signal generation and trade execution', 45]
    );
    agentId = result.rows[0].id;
    console.log(`  + Created agent bundle (id=${agentId})`);
  } else {
    console.log(`  - agent bundle already exists (id=${agentId})`);
  }

  // Agent jobs - signal scanning
  if (await insertJob(agentId, 'agent.signal_scan_morning', 'Morning Signal Scan',
    'Generate trading signals for all active agents (morning)',
    '0 10 * * 1-5', 1, 50, 500, 3600)) jobsCreated++;
  if (await insertJob(agentId, 'agent.signal_scan_afternoon', 'Afternoon Signal Scan',
    'Generate trading signals for all active agents (afternoon)',
    '0 14 * * 1-5', 1, 50, 500, 3600)) jobsCreated++;

  // Agent jobs - trade execution
  if (await insertJob(agentId, 'agent.execute_open', 'Market Open Execution',
    'Execute approved agent trades at market open',
    '30 9 * * 1-5', 1, 100, 200, 1800)) jobsCreated++;
  if (await insertJob(agentId, 'agent.execute_intraday', 'Intraday Execution',
    'Execute approved agent trades during market hours (every 30 min)',
    '0,30 10-15 * * 1-5', 1, 100, 200, 1800)) jobsCreated++;
  if (await insertJob(agentId, 'agent.execute_close', 'Market Close Execution',
    'Execute approved agent trades at market close',
    '0 16 * * 1-5', 1, 100, 200, 1800)) jobsCreated++;
  if (await insertJob(agentId, 'agent.execute_postmarket', 'Post-Market Execution',
    'Execute approved agent trades post-market',
    '45 18 * * 1-5', 1, 100, 200, 1800)) jobsCreated++;

  // === CREATE CAPITAL BUNDLE ===
  let capitalId = await getBundleId('capital');
  if (!capitalId) {
    const result = await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, 1) RETURNING id`,
      ['capital', 'Capital Allocation', 'Capital allocation and shareholder return tracking', 70]
    );
    capitalId = result.rows[0].id;
    console.log(`  + Created capital bundle (id=${capitalId})`);
  } else {
    console.log(`  - capital bundle already exists (id=${capitalId})`);
  }

  // Capital job
  if (await insertJob(capitalId, 'capital.allocation', 'Capital Allocation Update',
    'Recalculate capital_allocation_summary from financial_data',
    '0 5 * * 0', 1, 1000, 100, 7200)) jobsCreated++;

  // === ADD MISSING PORTFOLIO JOBS ===
  const portfolioId = await getBundleId('portfolio');
  if (portfolioId) {
    if (await insertJob(portfolioId, 'portfolio.dividends', 'Portfolio Dividend Processing',
      'Credit dividends to portfolios and process DRIP reinvestment',
      '30 18 * * 1-5', 1, 100, 500, 3600)) jobsCreated++;
  } else {
    console.log('  - portfolio bundle not found, skipping portfolio.dividends');
  }

  // === ADD MISSING EU JOBS ===
  const euId = await getBundleId('eu');
  if (euId) {
    if (await insertJob(euId, 'eu.valuation', 'EU/UK Valuation Update',
      'Calculate PE/PB/PS ratios from XBRL fundamentals and prices',
      '30 12 * * 1-5', 1, 200, 500, 3600)) jobsCreated++;
    if (await insertJob(euId, 'eu.enrichment', 'EU/UK Sector Enrichment',
      'Fetch sector/industry data from Yahoo Finance for EU/UK companies',
      '0 6 * * 0', 1, 100, 1000, 7200)) jobsCreated++;
    if (await insertJob(euId, 'eu.ticker_resolution', 'EU/UK Ticker Resolution',
      'Resolve tickers via GLEIF/ISIN/OpenFIGI for new EU/UK companies',
      '30 2 * * 0,2', 1, 100, 500, 3600)) jobsCreated++;
  } else {
    console.log('  - eu bundle not found, skipping eu.* jobs');
  }

  console.log(`\n Migration 037 complete: ${jobsCreated} new jobs created`);
}

module.exports = migrate;
