// src/utils/schemaManager.js
const db = require('../database');

/**
 * Schema Manager
 *
 * Handles schema migrations and ensures all required columns exist
 * Makes the application robust against schema changes
 */
class SchemaManager {
  constructor() {
    this.database = db.getDatabase();
  }

  /**
   * Get all columns in a table
   */
  getTableColumns(tableName) {
    const columns = this.database.prepare(`
      PRAGMA table_info(${tableName})
    `).all();

    return columns.map(col => col.name);
  }

  /**
   * Check if a column exists
   */
  columnExists(tableName, columnName) {
    const columns = this.getTableColumns(tableName);
    return columns.includes(columnName);
  }

  /**
   * Add a column if it doesn't exist
   */
  addColumnIfNotExists(tableName, columnName, columnType, defaultValue = null) {
    if (this.columnExists(tableName, columnName)) {
      console.log(`  ✓ Column ${columnName} already exists`);
      return false;
    }

    try {
      let sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
      if (defaultValue !== null) {
        sql += ` DEFAULT ${defaultValue}`;
      }

      this.database.exec(sql);
      console.log(`  ✓ Added column: ${columnName} (${columnType})`);
      return true;
    } catch (error) {
      console.error(`  ✗ Failed to add column ${columnName}:`, error.message);
      return false;
    }
  }

  /**
   * Ensure all required columns exist for calculated_metrics
   */
  ensureCalculatedMetricsSchema() {
    console.log('\n🔧 Ensuring calculated_metrics schema is complete...\n');

    const requiredColumns = [
      { name: 'roic', type: 'REAL' },
      { name: 'roe', type: 'REAL' },
      { name: 'roa', type: 'REAL' },
      { name: 'operating_margin', type: 'REAL' },
      { name: 'net_margin', type: 'REAL' },
      { name: 'gross_margin', type: 'REAL' },
      { name: 'fcf', type: 'REAL' },
      { name: 'fcf_yield', type: 'REAL' },
      { name: 'fcf_margin', type: 'REAL' },
      { name: 'fcf_per_share', type: 'REAL' },
      { name: 'pe_ratio', type: 'REAL' },
      { name: 'pb_ratio', type: 'REAL' },
      { name: 'ps_ratio', type: 'REAL' },
      { name: 'peg_ratio', type: 'REAL' },
      { name: 'pegy_ratio', type: 'REAL' },
      { name: 'tobins_q', type: 'REAL' },
      { name: 'msi', type: 'REAL' },
      { name: 'ev_ebitda', type: 'REAL' },
      { name: 'earnings_yield', type: 'REAL' },
      { name: 'debt_to_equity', type: 'REAL' },
      { name: 'debt_to_assets', type: 'REAL' },
      { name: 'current_ratio', type: 'REAL' },
      { name: 'quick_ratio', type: 'REAL' },
      { name: 'interest_coverage', type: 'REAL' },
      { name: 'revenue_growth_yoy', type: 'REAL' },
      { name: 'earnings_growth_yoy', type: 'REAL' },
      { name: 'fcf_growth_yoy', type: 'REAL' },
      { name: 'revenue_growth_qoq', type: 'REAL' },
      { name: 'earnings_growth_qoq', type: 'REAL' },
      { name: 'revenue_cagr_3y', type: 'REAL' },
      { name: 'revenue_cagr_5y', type: 'REAL' },
      { name: 'earnings_cagr_3y', type: 'REAL' },
      { name: 'earnings_cagr_5y', type: 'REAL' },
      { name: 'equity_multiplier', type: 'REAL' },
      { name: 'dupont_roe', type: 'REAL' },
      { name: 'data_quality_score', type: 'INTEGER', default: 100 },
      { name: 'asset_turnover', type: 'REAL' },
      { name: 'owner_earnings', type: 'REAL' },
      { name: 'graham_number', type: 'REAL' },
      { name: 'dividend_yield', type: 'REAL' },
      { name: 'buyback_yield', type: 'REAL' },
      { name: 'shareholder_yield', type: 'REAL' },
      { name: 'roce', type: 'REAL' }
    ];

    let added = 0;
    for (const column of requiredColumns) {
      if (this.addColumnIfNotExists(
        'calculated_metrics',
        column.name,
        column.type,
        column.default
      )) {
        added++;
      }
    }

    if (added > 0) {
      console.log(`\n✅ Added ${added} missing columns`);
    } else {
      console.log('\n✅ All columns already exist');
    }

    return added;
  }

  /**
   * Get available columns for a table (safe querying)
   */
  getAvailableMetricColumns() {
    const allColumns = this.getTableColumns('calculated_metrics');

    // Filter out system columns
    const systemColumns = ['id', 'company_id', 'fiscal_period', 'period_type', 'created_at', 'updated_at'];
    const metricColumns = allColumns.filter(col => !systemColumns.includes(col));

    return metricColumns;
  }

  /**
   * Build a safe SELECT query with only existing columns
   */
  buildSafeSelectQuery(tableName, requestedColumns, tableAlias = '') {
    const availableColumns = this.getTableColumns(tableName);
    const prefix = tableAlias ? `${tableAlias}.` : '';

    const safeColumns = requestedColumns.filter(col => {
      const colName = col.split(' as ')[0].trim(); // Handle "column as alias"
      const exists = availableColumns.includes(colName);

      if (!exists) {
        console.warn(`⚠️  Column ${colName} doesn't exist, skipping`);
      }

      return exists;
    });

    return safeColumns.map(col => `${prefix}${col}`).join(', ');
  }

  /**
   * Get available columns for any table
   */
  getAvailableColumns(tableName) {
    return this.getTableColumns(tableName);
  }

  /**
   * Insert or update metrics (handles schema dynamically)
   */
  insertOrUpdateMetrics(companyId, fiscalDateEnding, fiscalYear, metrics, periodType = 'annual') {
    // Get available columns
    const availableColumns = this.getAvailableColumns('calculated_metrics');

    // Build column list (only use columns that exist)
    const columns = ['company_id', 'fiscal_period', 'period_type'];
    const values = [companyId, fiscalDateEnding, periodType];

    // Add fiscal_year if the column exists
    if (availableColumns.includes('fiscal_year')) {
      columns.push('fiscal_year');
      values.push(fiscalYear);
    }

    // Add metric columns that exist
    const metricMapping = {
      roic: 'roic',
      roce: 'roce',
      roe: 'roe',
      roa: 'roa',
      grossMargin: 'gross_margin',
      operatingMargin: 'operating_margin',
      netMargin: 'net_margin',
      assetTurnover: 'asset_turnover',
      debtToEquity: 'debt_to_equity',
      debtToAssets: 'debt_to_assets',
      currentRatio: 'current_ratio',
      quickRatio: 'quick_ratio',
      interestCoverage: 'interest_coverage',
      fcf: 'fcf',
      fcfYield: 'fcf_yield',
      ownerEarnings: 'owner_earnings',
      peRatio: 'pe_ratio',
      pbRatio: 'pb_ratio',
      psRatio: 'ps_ratio',
      pegRatio: 'peg_ratio',
      evEbitda: 'ev_ebitda',
      earningsYield: 'earnings_yield',
      dataQualityScore: 'data_quality_score',
      tobins_q: 'tobins_q',
      msi: 'msi',
      revenue_growth_yoy: 'revenue_growth_yoy',
      earnings_growth_yoy: 'earnings_growth_yoy',
      fcf_growth_yoy: 'fcf_growth_yoy',
      revenue_growth_qoq: 'revenue_growth_qoq',
      earnings_growth_qoq: 'earnings_growth_qoq',
      revenue_cagr_3y: 'revenue_cagr_3y',
      revenue_cagr_5y: 'revenue_cagr_5y',
      earnings_cagr_3y: 'earnings_cagr_3y',
      earnings_cagr_5y: 'earnings_cagr_5y',
      equityMultiplier: 'equity_multiplier',
      dupontRoe: 'dupont_roe',
      graham_number: 'graham_number',
      dividend_yield: 'dividend_yield',
      buyback_yield: 'buyback_yield',
      shareholder_yield: 'shareholder_yield'
    };

    for (const [metricKey, columnName] of Object.entries(metricMapping)) {
      if (availableColumns.includes(columnName) && metrics[metricKey] !== undefined) {
        columns.push(columnName);
        values.push(metrics[metricKey]);
      }
    }

    // Build SQL
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter(c => !['company_id', 'fiscal_period', 'period_type', 'fiscal_year'].includes(c))
      .map(c => `${c} = excluded.${c}`)
      .join(', ');

    const sql = `
      INSERT INTO calculated_metrics (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(company_id, fiscal_period, period_type)
      DO UPDATE SET ${updates}
    `;

    this.database.prepare(sql).run(...values);
  }

  /**
   * Print schema information
   */
  printSchema(tableName) {
    console.log(`\n📋 Schema for ${tableName}:\n`);

    const columns = this.database.prepare(`
      PRAGMA table_info(${tableName})
    `).all();

    console.log('Column Name               | Type       | Not Null | Default');
    console.log('-'.repeat(70));

    columns.forEach(col => {
      console.log(
        `${col.name.padEnd(25)} | ${col.type.padEnd(10)} | ` +
        `${col.notnull ? 'YES' : 'NO '}      | ${col.dflt_value || 'NULL'}`
      );
    });

    console.log('');
  }
}

module.exports = SchemaManager;

// If run directly
if (require.main === module) {
  const manager = new SchemaManager();

  console.log('\n🔍 DATABASE SCHEMA CHECKER\n');
  console.log('='.repeat(60));

  // Ensure schema is complete
  manager.ensureCalculatedMetricsSchema();

  // Print schema
  manager.printSchema('calculated_metrics');

  console.log('='.repeat(60) + '\n');
}
