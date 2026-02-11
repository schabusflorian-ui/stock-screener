#!/usr/bin/env node
// scripts/check-postgres-duplicates.js
// Check PostgreSQL tables for duplicate rows (e.g. after parallel migration runs)

require('dotenv').config();
const { Client } = require('pg');

// Known natural/unique key columns (from schema - used when Postgres constraints aren't discoverable)
// Use composite keys for logical duplicates - NOT surrogate 'id' which would hide duplicates
const KNOWN_UNIQUE_COLUMNS = {
  companies: ['symbol'],
  daily_prices: ['company_id', 'date'],
  price_metrics: ['company_id'],
  calculated_metrics: ['company_id', 'fiscal_period', 'period_type'],
  financial_data: ['company_id', 'statement_type', 'fiscal_date_ending', 'period_type'],
  capital_allocation_summary: ['company_id', 'fiscal_quarter'],
  valuation_history: ['company_id', 'snapshot_date'],
  dividend_history: ['company_id', 'ex_date'],
  fiscal_calendar: ['company_id', 'fiscal_period'],
  aggregated_signals: ['company_id', 'calculated_at'],
  etf_definitions: ['symbol'],
  lazy_portfolios: ['slug'],
  lazy_portfolio_allocations: ['portfolio_id', 'etf_symbol'],
  stock_factor_scores: ['company_id', 'score_date'],
  factor_ic_history: ['factor_id', 'calculation_date'],
  factor_correlations: ['factor_id', 'calculation_date'],
  daily_factor_returns: ['date'],
  portfolio_factor_exposures: ['investor_id', 'snapshot_date'],
  signal_ic_history: ['signal_type', 'horizon_days', 'calculated_date'],
  signal_predictive_power: ['signal_type', 'horizon_days'],
  sentiment_posts: ['post_id'],
  stocktwits_messages: ['message_id'],
  sentiment_summary: ['company_id', 'period'],
  investor_holdings: ['investor_id', 'company_id', 'period_date'],
  investor_performance_cache: ['investor_id', 'start_date'],
  investor_filings: ['investor_id', 'filing_date'],
  app_settings: ['key'],
  user_preferences: ['user_id', 'preference_key'],
  usage_tracking: ['user_id', 'usage_type', 'period_start', 'period_type'],
  economic_indicators: ['series_id', 'observation_date'],
  yield_curve: ['curve_date'],
  model_performance_log: ['model_name', 'version', 'log_date'],
  ml_predictions: ['model_id', 'company_id', 'prediction_date'],
  cointegration_pairs: ['symbol1', 'symbol2'],
  var_exceptions: ['portfolio_id', 'exception_date'],
  ipo_watchlist: ['ipo_id'],
  portfolio_snapshots: ['portfolio_id', 'snapshot_date'],
  portfolio_positions: ['portfolio_id', 'company_id'],
  note_versions: ['note_id', 'version_number'],
  regime_sector_multipliers: ['regime'],
  sentiment_history: ['company_id', 'snapshot_date', 'source'],
  xbrl_fundamental_metrics: ['identifier_id', 'period_end', 'period_type'],
  identifier_cache: ['identifier_type', 'identifier_value'],
};

async function getTables(pg) {
  const r = await pg.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return r.rows.map(row => row.tablename);
}

async function getPrimaryKeyColumns(pg, tableName) {
  const r = await pg.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) AND a.attnum > 0
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND i.indisprimary
      AND a.attisdropped = false
    ORDER BY array_position(i.indkey, a.attnum)
  `, [tableName]);
  return r.rows.map(row => row.attname);
}

async function getUniqueConstraintColumns(pg, tableName) {
  // Get first non-PK unique constraint's full column list (all columns, not LIMIT 1)
  const r = await pg.query(`
    SELECT i.indexrelid, a.attname, array_position(i.indkey, a.attnum) as pos
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) AND a.attnum > 0
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = $1
      AND i.indisunique
      AND NOT i.indisprimary
      AND a.attisdropped = false
    ORDER BY i.indexrelid, pos
  `, [tableName]);
  if (r.rows.length === 0) return null;
  const firstIndexId = r.rows[0].indexrelid;
  return r.rows.filter(row => row.indexrelid === firstIndexId).map(row => row.attname);
}

async function getTableColumns(pg, tableName) {
  const r = await pg.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);
  return r.rows.map(row => row.column_name);
}

async function checkDuplicates(pg, tableName, keyColumns) {
  const quotedCols = keyColumns.map(c => `"${c}"`).join(', ');
  const r = await pg.query(`
    SELECT COUNT(*) as total,
           COUNT(DISTINCT (${quotedCols})) as distinct_keys
    FROM "${tableName}"
  `);
  const total = parseInt(r.rows[0].total, 10);
  const distinctKeys = parseInt(r.rows[0].distinct_keys, 10);
  const duplicateCount = total - distinctKeys;
  return { total, distinctKeys, duplicateCount };
}

async function checkDuplicatesByGroupBy(pg, tableName, columns) {
  const quotedCols = columns.map(c => `"${c}"`).join(', ');
  const r = await pg.query(`
    SELECT COUNT(*) as dup_groups, SUM(cnt - 1) as extra_rows
    FROM (
      SELECT ${quotedCols}, COUNT(*) as cnt
      FROM "${tableName}"
      GROUP BY ${quotedCols}
      HAVING COUNT(*) > 1
    ) sub
  `);
  const dupGroups = parseInt(r.rows[0].dup_groups || 0, 10);
  const extraRows = parseInt(r.rows[0].extra_rows || 0, 10);
  return { dupGroups, extraRows };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL required');
    console.log('Usage: DATABASE_URL=postgresql://... node scripts/check-postgres-duplicates.js');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  console.log('\n🔍 Checking Postgres tables for duplicate rows\n');
  console.log('Target:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  console.log('');

  const tables = await getTables(client);
  const results = [];
  let tablesWithDuplicates = 0;

  for (const tableName of tables) {
    try {
      const columns = await getTableColumns(client, tableName);
      if (columns.length === 0) continue;

      // Prefer UNIQUE constraint (logical business key) over surrogate PK (id)
      let keyColumns = await getUniqueConstraintColumns(client, tableName);
      if (!keyColumns || keyColumns.length === 0) {
        if (KNOWN_UNIQUE_COLUMNS[tableName]) {
          const known = KNOWN_UNIQUE_COLUMNS[tableName];
          const exist = known.filter(c => columns.includes(c));
          if (exist.length === known.length) keyColumns = known;
        }
      }
      if (!keyColumns || keyColumns.length === 0) {
        const pkCols = await getPrimaryKeyColumns(client, tableName);
        if (pkCols.length > 0 && !(pkCols.length === 1 && pkCols[0] === 'id')) {
          keyColumns = pkCols;
        }
      }

      if (keyColumns && keyColumns.length > 0) {
        const { total, distinctKeys, duplicateCount } = await checkDuplicates(client, tableName, keyColumns);
        if (duplicateCount > 0) {
          results.push({ table: tableName, method: 'key', duplicateCount, total, keyColumns });
          tablesWithDuplicates++;
        }
      } else {
        const { dupGroups, extraRows } = await checkDuplicatesByGroupBy(client, tableName, columns);
        if (extraRows > 0) {
          results.push({ table: tableName, method: 'groupby', duplicateCount: extraRows, dupGroups });
          tablesWithDuplicates++;
        }
      }
    } catch (err) {
      console.error(`  ⚠️  ${tableName}: ${err.message}`);
    }
  }

  await client.end();

  if (tablesWithDuplicates === 0) {
    console.log('✅ No duplicate rows found in any table.\n');
    return;
  }

  console.log(`❌ Found duplicates in ${tablesWithDuplicates} table(s):\n`);
  for (const r of results) {
    if (r.method === 'key') {
      console.log(`  ${r.table}: ${r.duplicateCount} duplicate row(s) (total: ${r.total}, keys: ${r.keyColumns.join(', ')})`);
    } else {
      console.log(`  ${r.table}: ~${r.duplicateCount} extra row(s) from ${r.dupGroups} duplicate group(s) (no PK/unique found, used GROUP BY all columns)`);
    }
  }
  console.log('');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
