// src/debug-database.js
// Comprehensive database debugging and testing script

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('🔍 Database Debug & Diagnostics Tool\n');
console.log('='.repeat(50));

// Check if better-sqlite3 is installed
try {
  require.resolve('better-sqlite3');
  console.log('✅ better-sqlite3 package found');
} catch (e) {
  console.error('❌ better-sqlite3 NOT installed!');
  console.error('   Run: npm install better-sqlite3');
  process.exit(1);
}

// Check data directory
const dataDir = path.join(__dirname, '../data');
console.log(`\n📁 Data Directory: ${dataDir}`);
if (!fs.existsSync(dataDir)) {
  console.log('   ⚠️  Directory does not exist - creating...');
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('   ✅ Created successfully');
} else {
  console.log('   ✅ Directory exists');
}

// Check database file
const dbPath = path.join(dataDir, 'stocks.db');
console.log(`\n💾 Database File: ${dbPath}`);
const dbExists = fs.existsSync(dbPath);
if (dbExists) {
  const stats = fs.statSync(dbPath);
  console.log(`   ✅ Database exists (${(stats.size / 1024).toFixed(2)} KB)`);
} else {
  console.log('   ⚠️  Database does not exist yet - will be created');
}

// Try to connect to database
let db;
try {
  db = new Database(dbPath);
  console.log('   ✅ Database connection established');
} catch (error) {
  console.error('   ❌ Failed to connect to database');
  console.error('   Error:', error.message);
  process.exit(1);
}

// Check pragmas
console.log('\n⚙️  Database Configuration:');
try {
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  console.log(`   Foreign Keys: ${foreignKeys ? '✅ ON' : '❌ OFF'}`);

  const journalMode = db.pragma('journal_mode', { simple: true });
  console.log(`   Journal Mode: ${journalMode}`);

  const pageSize = db.pragma('page_size', { simple: true });
  console.log(`   Page Size: ${pageSize} bytes`);
} catch (error) {
  console.error('   ❌ Error checking pragmas:', error.message);
}

// Check tables
console.log('\n📊 Database Tables:');
try {
  const tables = db.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type='table'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();

  if (tables.length === 0) {
    console.log('   ⚠️  No tables found - database might not be initialized');
    console.log('   Run: node src/database.js');
  } else {
    console.log(`   ✅ Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`      - ${table.name}`);
    });
  }
} catch (error) {
  console.error('   ❌ Error listing tables:', error.message);
}

// Check indexes
console.log('\n🔍 Database Indexes:');
try {
  const indexes = db.prepare(`
    SELECT name, tbl_name
    FROM sqlite_master
    WHERE type='index'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY tbl_name, name
  `).all();

  console.log(`   ✅ Found ${indexes.length} indexes`);

  // Group by table
  const indexesByTable = {};
  indexes.forEach(idx => {
    if (!indexesByTable[idx.tbl_name]) {
      indexesByTable[idx.tbl_name] = [];
    }
    indexesByTable[idx.tbl_name].push(idx.name);
  });

  Object.keys(indexesByTable).sort().forEach(table => {
    console.log(`      ${table}: ${indexesByTable[table].length} indexes`);
  });
} catch (error) {
  console.error('   ❌ Error listing indexes:', error.message);
}

// Test data counts
console.log('\n📈 Data Statistics:');
const tablesToCheck = [
  'companies',
  'financial_data',
  'calculated_metrics',
  'stock_indexes',
  'index_constituents',
  'index_metrics',
  'daily_prices',
  'data_fetch_log'
];

tablesToCheck.forEach(tableName => {
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    const icon = result.count > 0 ? '✅' : '⚪';
    console.log(`   ${icon} ${tableName.padEnd(20)}: ${result.count.toLocaleString()} rows`);
  } catch (error) {
    console.log(`   ❌ ${tableName.padEnd(20)}: Table doesn't exist or error`);
  }
});

// Test basic operations
console.log('\n🧪 Testing Database Operations:');

// Test 1: Insert a test company
console.log('\n   Test 1: Insert Company');
try {
  const insertStmt = db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, exchange, market_cap)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = insertStmt.run(
    'TEST',
    'Test Company Inc.',
    'Technology',
    'Software',
    'NYSE',
    1000000000
  );

  console.log('   ✅ Insert successful (ID:', result.lastInsertRowid, ')');

  // Verify it was inserted
  const company = db.prepare('SELECT * FROM companies WHERE symbol = ?').get('TEST');
  if (company) {
    console.log('   ✅ Verification: Company found');
    console.log('      Name:', company.name);
    console.log('      Sector:', company.sector);
  }
} catch (error) {
  if (error.message.includes('UNIQUE constraint failed')) {
    console.log('   ⚠️  Test company already exists (this is OK)');
  } else {
    console.error('   ❌ Insert failed:', error.message);
  }
}

// Test 2: Upsert (update or insert)
console.log('\n   Test 2: Upsert Company');
try {
  const upsertStmt = db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, exchange, market_cap)
    VALUES (@symbol, @name, @sector, @industry, @exchange, @market_cap)
    ON CONFLICT(symbol) DO UPDATE SET
      name = @name,
      sector = @sector,
      market_cap = @market_cap,
      last_updated = CURRENT_TIMESTAMP
  `);

  const result = upsertStmt.run({
    symbol: 'TEST',
    name: 'Test Company Inc. (Updated)',
    sector: 'Technology',
    industry: 'Software',
    exchange: 'NYSE',
    market_cap: 2000000000
  });

  console.log('   ✅ Upsert successful');

  const company = db.prepare('SELECT * FROM companies WHERE symbol = ?').get('TEST');
  console.log('   ✅ Updated market cap:', company.market_cap.toLocaleString());
} catch (error) {
  console.error('   ❌ Upsert failed:', error.message);
}

// Test 3: Foreign key constraint
console.log('\n   Test 3: Foreign Key Constraints');
try {
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('TEST');

  if (company) {
    const insertMetrics = db.prepare(`
      INSERT INTO calculated_metrics (company_id, fiscal_period, roic, roe)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertMetrics.run(company.id, '2024-12-31', 15.5, 20.2);
    console.log('   ✅ Foreign key relationship working');

    // Try to violate foreign key
    try {
      insertMetrics.run(99999, '2024-12-31', 10.0, 15.0);
      console.log('   ⚠️  Foreign key constraint NOT enforced!');
    } catch (fkError) {
      console.log('   ✅ Foreign key constraint enforced correctly');
    }
  }
} catch (error) {
  console.error('   ❌ Foreign key test failed:', error.message);
}

// Test 4: Transaction
console.log('\n   Test 4: Transactions');
try {
  const insertCompany = db.prepare(`
    INSERT INTO companies (symbol, name, sector)
    VALUES (?, ?, ?)
  `);

  const insertMetrics = db.prepare(`
    INSERT INTO calculated_metrics (company_id, fiscal_period, roic)
    VALUES (?, ?, ?)
  `);

  const transaction = db.transaction((symbol, name, sector, roic) => {
    const info = insertCompany.run(symbol, name, sector);
    insertMetrics.run(info.lastInsertRowid, '2024-12-31', roic);
    return info.lastInsertRowid;
  });

  try {
    const id = transaction('TRANS', 'Transaction Test Co.', 'Finance', 12.5);
    console.log('   ✅ Transaction successful (ID:', id, ')');
  } catch (txError) {
    if (txError.message.includes('UNIQUE constraint failed')) {
      console.log('   ⚠️  Test data already exists (this is OK)');
    } else {
      throw txError;
    }
  }
} catch (error) {
  console.error('   ❌ Transaction test failed:', error.message);
}

// Test 5: JSON storage in financial_data
console.log('\n   Test 5: JSON Data Storage');
try {
  const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('TEST');

  if (company) {
    const financialData = {
      totalRevenue: 1000000000,
      netIncome: 150000000,
      totalAssets: 5000000000,
      totalLiabilities: 2000000000,
      shareholderEquity: 3000000000
    };

    const insertFinancial = db.prepare(`
      INSERT INTO financial_data (
        company_id, statement_type, fiscal_date_ending,
        fiscal_year, period_type, data
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertFinancial.run(
      company.id,
      'balance_sheet',
      '2024-12-31',
      2024,
      'annual',
      JSON.stringify(financialData)
    );

    console.log('   ✅ JSON data stored successfully');

    // Retrieve and parse
    const stored = db.prepare(`
      SELECT data FROM financial_data
      WHERE company_id = ? AND statement_type = 'balance_sheet'
      LIMIT 1
    `).get(company.id);

    if (stored) {
      const parsed = JSON.parse(stored.data);
      console.log('   ✅ JSON data retrieved and parsed');
      console.log('      Total Revenue:', parsed.totalRevenue.toLocaleString());
    }
  }
} catch (error) {
  if (error.message.includes('UNIQUE constraint failed')) {
    console.log('   ⚠️  Test financial data already exists (this is OK)');
  } else {
    console.error('   ❌ JSON storage test failed:', error.message);
  }
}

// Cleanup test data (optional)
console.log('\n🧹 Cleanup Test Data:');
try {
  const deleteCompanies = db.prepare(`
    DELETE FROM companies
    WHERE symbol IN ('TEST', 'TRANS')
  `);

  const result = deleteCompanies.run();
  console.log(`   ✅ Removed ${result.changes} test companies`);
  console.log('   ✅ Related data cascade-deleted via foreign keys');
} catch (error) {
  console.error('   ❌ Cleanup failed:', error.message);
}

// Database integrity check
console.log('\n🔐 Database Integrity Check:');
try {
  const integrity = db.pragma('integrity_check', { simple: true });
  if (integrity === 'ok') {
    console.log('   ✅ Database integrity: OK');
  } else {
    console.log('   ⚠️  Integrity issues found:', integrity);
  }
} catch (error) {
  console.error('   ❌ Integrity check failed:', error.message);
}

// Performance stats
console.log('\n⚡ Performance Information:');
try {
  const pageCount = db.pragma('page_count', { simple: true });
  const pageSize = db.pragma('page_size', { simple: true });
  const cacheSize = db.pragma('cache_size', { simple: true });

  console.log(`   Pages: ${pageCount.toLocaleString()}`);
  console.log(`   Total Size: ${((pageCount * pageSize) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Cache Size: ${Math.abs(cacheSize).toLocaleString()} pages`);
} catch (error) {
  console.error('   ❌ Performance stats failed:', error.message);
}

// Close connection
db.close();
console.log('\n✅ Database connection closed');

console.log('\n' + '='.repeat(50));
console.log('🎉 Debug Complete!\n');
console.log('Next steps:');
console.log('  1. If tables are missing, run: node src/database.js');
console.log('  2. To populate data, create data fetching scripts');
console.log('  3. Check logs above for any ❌ errors\n');
