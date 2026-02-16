#!/usr/bin/env node
// scripts/check-duplicates.js
// Check for and clean up duplicate rows caused by parallel migration

const { Client } = require('pg');
require('dotenv').config();

// Tables that were migrated by both parallel instances (from logs)
const AFFECTED_TABLES = [
  { name: 'ablation_study_results', expected: 60 },
  { name: 'agent_activity_log', expected: 31 },
  { name: 'agent_portfolios', expected: 10 },
  { name: 'agent_recommendations', expected: 84318 },
  { name: 'agent_signals', expected: 977 },
  { name: 'aggregated_signals', expected: 2562 },
  { name: 'alert_clusters', expected: 1208 },
  { name: 'alert_preferences', expected: 6 },
  { name: 'alerts', expected: 9399 },
  { name: 'algo_executions', expected: 26 },
  { name: 'algo_orders', expected: 2 },
  { name: 'analyst_conversations', expected: 238 },
  { name: 'analyst_estimates', expected: 2924 },
  { name: 'analyst_estimates_history', expected: 9 },
  { name: 'analyst_messages', expected: 1050 },
  { name: 'analytics_events', expected: 2519 },
  { name: 'analytics_sessions', expected: 204 },
  { name: 'api_budgets', expected: 4 },
  { name: 'api_integrations', expected: 8 },
  { name: 'api_usage_daily', expected: 1 },
  { name: 'api_usage_log', expected: 2 },
  { name: 'available_metrics', expected: 34 },
  { name: 'backfill_progress', expected: 45 },
  { name: 'backtests', expected: 35 },
  { name: 'bundesanzeiger_filings', expected: 276 },
  { name: 'calculated_metrics', expected: 509243 },
];

async function main() {
  const dryRun = !process.argv.includes('--fix');

  console.log('\n🔍 Duplicate Row Checker for PostgreSQL');
  console.log('=' .repeat(50));

  if (dryRun) {
    console.log('   Mode: CHECK ONLY (use --fix to remove duplicates)\n');
  } else {
    console.log('   Mode: FIX (will remove duplicate rows)\n');
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable required');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Step 1: Find tables without primary keys
    console.log('📋 Step 1: Checking for tables without primary keys...\n');

    const noPkResult = await client.query(`
      SELECT t.tablename
      FROM pg_tables t
      LEFT JOIN information_schema.table_constraints tc
        ON t.tablename = tc.table_name
        AND tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
      WHERE t.schemaname = 'public'
        AND tc.constraint_name IS NULL
      ORDER BY t.tablename
    `);

    const tablesWithoutPk = new Set(noPkResult.rows.map(r => r.tablename));

    if (tablesWithoutPk.size > 0) {
      console.log(`⚠️  Found ${tablesWithoutPk.size} tables WITHOUT primary keys:`);
      for (const tbl of tablesWithoutPk) {
        console.log(`   - ${tbl}`);
      }
      console.log('');
    } else {
      console.log('✅ All tables have primary keys\n');
    }

    // Step 2: Check row counts
    console.log('📋 Step 2: Checking row counts vs expected...\n');

    const issues = [];

    for (const { name, expected } of AFFECTED_TABLES) {
      try {
        const result = await client.query(`SELECT COUNT(*) as cnt FROM "${name}"`);
        const actual = parseInt(result.rows[0].cnt, 10);
        const diff = actual - expected;

        if (diff > 0) {
          const status = tablesWithoutPk.has(name) ? '🔴 NO PK - LIKELY DUPLICATES' : '🟡 Has PK (may be OK)';
          console.log(`   ${name}: ${actual} rows (expected ${expected}, +${diff}) ${status}`);
          issues.push({ name, actual, expected, diff, hasPk: !tablesWithoutPk.has(name) });
        } else if (diff < 0) {
          console.log(`   ${name}: ${actual} rows (expected ${expected}, ${diff}) ⚠️ MISSING ROWS`);
        } else {
          console.log(`   ${name}: ${actual} rows ✅`);
        }
      } catch (err) {
        console.log(`   ${name}: ❌ Error - ${err.message}`);
      }
    }

    console.log('');

    // Step 3: Check for actual duplicate rows
    console.log('📋 Step 3: Checking for duplicate rows...\n');

    let totalDuplicates = 0;
    const duplicateDetails = [];

    for (const { name } of issues.filter(i => !i.hasPk)) {
      // Get all columns for the table
      const colResult = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [name]);

      const columns = colResult.rows.map(r => `"${r.column_name}"`).join(', ');

      // Find duplicates by checking all columns
      const dupQuery = `
        SELECT ${columns}, COUNT(*) as dup_count
        FROM "${name}"
        GROUP BY ${columns}
        HAVING COUNT(*) > 1
        LIMIT 10
      `;

      try {
        const dupResult = await client.query(dupQuery);

        if (dupResult.rows.length > 0) {
          const dupCount = dupResult.rows.reduce((sum, r) => sum + parseInt(r.dup_count, 10) - 1, 0);
          console.log(`   🔴 ${name}: Found ${dupResult.rows.length} duplicate patterns (${dupCount}+ extra rows)`);
          totalDuplicates += dupCount;
          duplicateDetails.push({ name, columns: colResult.rows.map(r => r.column_name), dupCount });
        } else {
          console.log(`   ✅ ${name}: No duplicates found`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${name}: Could not check duplicates - ${err.message}`);
      }
    }

    // Also check tables with PK but extra rows (might have duplicates on non-PK columns)
    for (const { name } of issues.filter(i => i.hasPk)) {
      // Check if 'id' column exists and find duplicates
      try {
        const dupResult = await client.query(`
          SELECT id, COUNT(*) as cnt
          FROM "${name}"
          GROUP BY id
          HAVING COUNT(*) > 1
          LIMIT 5
        `);

        if (dupResult.rows.length > 0) {
          console.log(`   🟡 ${name}: Found duplicate IDs (should not happen with PK)`);
        }
      } catch (err) {
        // id column might not exist, that's ok
      }
    }

    console.log('');

    // Step 4: Fix duplicates if requested
    if (!dryRun && duplicateDetails.length > 0) {
      console.log('📋 Step 4: Removing duplicate rows...\n');

      for (const { name, columns } of duplicateDetails) {
        const colList = columns.map(c => `"${c}"`).join(', ');

        // Use ctid to delete duplicate rows (keeps one copy)
        const deleteQuery = `
          DELETE FROM "${name}" a
          USING "${name}" b
          WHERE a.ctid < b.ctid
            AND ${columns.map(c => `a."${c}" IS NOT DISTINCT FROM b."${c}"`).join(' AND ')}
        `;

        try {
          const result = await client.query(deleteQuery);
          console.log(`   ✅ ${name}: Removed ${result.rowCount} duplicate rows`);
        } catch (err) {
          console.log(`   ❌ ${name}: Failed to remove duplicates - ${err.message}`);
        }
      }

      console.log('');
    }

    // Summary
    console.log('=' .repeat(50));
    console.log('📊 Summary');
    console.log('=' .repeat(50));
    console.log(`   Tables without PK: ${tablesWithoutPk.size}`);
    console.log(`   Tables with row count issues: ${issues.length}`);
    console.log(`   Estimated duplicate rows: ${totalDuplicates}`);

    if (totalDuplicates > 0 && dryRun) {
      console.log('\n💡 To fix duplicates, run:');
      console.log('   DATABASE_URL="..." node scripts/check-duplicates.js --fix');
    }

    console.log('');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();