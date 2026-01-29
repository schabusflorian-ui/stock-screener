#!/usr/bin/env node
// src/services/xbrl/test-xbrl.js
/**
 * XBRL Infrastructure Test Script
 *
 * Tests all components of the XBRL data infrastructure:
 * 1. XBRLFilingsClient - Fetch filings from filings.xbrl.org
 * 2. XBRLParser - Parse xBRL-JSON into normalized financials
 * 3. FundamentalStore - Database operations
 * 4. CompaniesHouseClient - UK company data (if API key configured)
 */

const { XBRLFilingsClient } = require('./xbrlFilingsClient');
const { CompaniesHouseClient } = require('./companiesHouseClient');
const { XBRLParser } = require('./xbrlParser');
const { FundamentalStore } = require('./fundamentalStore');
const db = require('../../database');

// Test configuration
const TEST_COUNTRY = 'GB'; // UK has good coverage
const TEST_LEI = '213800KXKVPU9FB1BV53'; // Shell PLC - well-known company

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 XBRL INFRASTRUCTURE TEST SUITE');
  console.log('='.repeat(60) + '\n');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
  };

  // ========================================
  // Test 1: XBRLFilingsClient - Search by Country
  // ========================================
  console.log('📋 Test 1: XBRLFilingsClient - Search by Country');
  console.log('-'.repeat(50));

  try {
    const client = new XBRLFilingsClient();
    const { filings, meta } = await client.getFilingsByCountry(TEST_COUNTRY, { pageSize: 5 });

    console.log(`   ✅ Found ${filings.length} filings for ${TEST_COUNTRY}`);
    console.log(`   📊 Total available: ${meta.total}`);

    if (filings.length > 0) {
      const sample = filings[0];
      console.log('   📄 Sample filing:');
      console.log(`      Entity: ${sample.entityName}`);
      console.log(`      LEI: ${sample.entityLEI}`);
      console.log(`      Period: ${sample.periodEnd}`);
      console.log(`      Hash: ${sample.hash}`);
    }

    results.tests.push({ name: 'FilingsClient - Search', status: 'passed' });
    results.passed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'FilingsClient - Search', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Test 2: XBRLFilingsClient - Get xBRL-JSON
  // ========================================
  console.log('📋 Test 2: XBRLFilingsClient - Fetch xBRL-JSON');
  console.log('-'.repeat(50));

  let testFilingHash = null;
  let xbrlJson = null;
  let testFiling = null;

  try {
    const client = new XBRLFilingsClient();

    // Get a filing to test with
    const { filings } = await client.getFilingsByCountry(TEST_COUNTRY, { pageSize: 10 });

    // Find one that has jsonUrl available
    for (const filing of filings) {
      if (!filing.jsonUrl) continue;

      try {
        testFilingHash = filing.hash;
        testFiling = filing;
        // Use jsonUrl instead of hash
        xbrlJson = await client.getXBRLJson(filing.jsonUrl);
        console.log('   ✅ Successfully fetched xBRL-JSON');
        console.log(`      LEI: ${filing.entityLEI}`);
        console.log(`      Period: ${filing.periodEnd}`);
        console.log(`      Facts count: ${Object.keys(xbrlJson.facts || {}).length}`);
        break;
      } catch (e) {
        // Try next filing
        continue;
      }
    }

    if (!xbrlJson) {
      throw new Error('Could not find a filing with available xBRL-JSON');
    }

    results.tests.push({ name: 'FilingsClient - xBRL-JSON', status: 'passed' });
    results.passed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'FilingsClient - xBRL-JSON', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Test 3: XBRLParser - Parse xBRL-JSON
  // ========================================
  console.log('📋 Test 3: XBRLParser - Parse xBRL-JSON');
  console.log('-'.repeat(50));

  let parsedData = null;

  try {
    if (!xbrlJson) {
      throw new Error('No xBRL-JSON available from previous test');
    }

    const parser = new XBRLParser();
    parsedData = parser.parseXBRLJson(xbrlJson);

    console.log('   ✅ Successfully parsed xBRL-JSON');
    console.log('   📊 Parse stats:');
    console.log(`      Total facts: ${parsedData.parseStats.totalFacts}`);
    console.log(`      Mapped facts: ${parsedData.parseStats.mappedFacts}`);
    console.log(`      Unmapped: ${parsedData.parseStats.unmappedFacts}`);
    console.log(`      Periods found: ${Object.keys(parsedData.periods).length}`);

    // Show some extracted metrics
    const latestPeriod = Object.keys(parsedData.periods).sort().pop();
    if (latestPeriod) {
      const metrics = parsedData.periods[latestPeriod].metrics;
      console.log(`   💰 Latest period (${latestPeriod}):`);
      if (metrics.revenue) console.log(`      Revenue: ${(metrics.revenue / 1e9).toFixed(2)}B`);
      if (metrics.net_income) console.log(`      Net Income: ${(metrics.net_income / 1e9).toFixed(2)}B`);
      if (metrics.total_assets) console.log(`      Total Assets: ${(metrics.total_assets / 1e9).toFixed(2)}B`);
      if (metrics.total_equity) console.log(`      Total Equity: ${(metrics.total_equity / 1e9).toFixed(2)}B`);
    }

    results.tests.push({ name: 'XBRLParser - Parse', status: 'passed' });
    results.passed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'XBRLParser - Parse', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Test 4: XBRLParser - toFlatRecord
  // ========================================
  console.log('📋 Test 4: XBRLParser - Convert to Flat Record');
  console.log('-'.repeat(50));

  let flatRecord = null;

  try {
    if (!parsedData) {
      throw new Error('No parsed data available from previous test');
    }

    const parser = new XBRLParser();
    flatRecord = parser.toFlatRecord(parsedData);

    if (!flatRecord) {
      throw new Error('toFlatRecord returned null');
    }

    console.log('   ✅ Successfully converted to flat record');
    console.log('   📊 Record fields:');
    console.log(`      Period: ${flatRecord.period_end}`);
    console.log(`      Currency: ${flatRecord.currency}`);

    // Count non-null fields
    const nonNullFields = Object.entries(flatRecord).filter(([k, v]) => v !== null).length;
    console.log(`      Non-null fields: ${nonNullFields}/${Object.keys(flatRecord).length}`);

    // Show some key metrics
    const keyMetrics = ['revenue', 'net_income', 'total_assets', 'operating_cash_flow', 'roe', 'net_margin'];
    for (const metric of keyMetrics) {
      if (flatRecord[metric] !== null) {
        const value = typeof flatRecord[metric] === 'number' && Math.abs(flatRecord[metric]) > 1000
          ? (flatRecord[metric] / 1e9).toFixed(2) + 'B'
          : flatRecord[metric]?.toFixed?.(4) || flatRecord[metric];
        console.log(`      ${metric}: ${value}`);
      }
    }

    results.tests.push({ name: 'XBRLParser - FlatRecord', status: 'passed' });
    results.passed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'XBRLParser - FlatRecord', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Test 5: FundamentalStore - Database Operations
  // ========================================
  console.log('📋 Test 5: FundamentalStore - Database Operations');
  console.log('-'.repeat(50));

  try {
    const database = db.getDatabase();
    const store = new FundamentalStore(database);

    // Test upsert identifier
    const testIdentifier = store.upsertIdentifier({
      lei: 'TEST123456789012345',
      companyName: 'Test Company PLC',
      country: 'GB',
      ticker: 'TEST',
      exchange: 'LSE'
    });

    console.log(`   ✅ Created identifier: ID ${testIdentifier.id}`);

    // Test get identifier
    const retrieved = store.getIdentifierByLEI('TEST123456789012345');
    if (!retrieved) {
      throw new Error('Failed to retrieve identifier');
    }
    console.log(`   ✅ Retrieved identifier: ${retrieved.company_name}`);

    // Test store filing
    const testFiling = store.storeFiling({
      hash: 'test-hash-' + Date.now(),
      entityLEI: 'TEST123456789012345',
      entityName: 'Test Company PLC',
      country: 'GB',
      periodEnd: '2024-12-31',
      source: 'test'
    });

    console.log(`   ✅ Stored filing: ID ${testFiling.id}`);

    // Test store metrics (if we have flat record from previous test)
    if (flatRecord) {
      const storedMetrics = store.storeMetrics(
        { ...flatRecord, period_end: '2024-12-31' },
        testIdentifier.id,
        testFiling.id
      );
      console.log(`   ✅ Stored metrics: ID ${storedMetrics.id}`);

      // Test retrieve metrics
      const retrievedMetrics = store.getLatestMetrics(testIdentifier.id);
      if (retrievedMetrics) {
        console.log(`   ✅ Retrieved metrics: period ${retrievedMetrics.period_end}`);
      }
    }

    // Test stats
    const stats = store.getStats();
    console.log('   📊 Database stats:');
    console.log(`      Identifiers: ${stats.identifiers}`);
    console.log(`      Filings: ${stats.filings.total} (${stats.filings.parsed} parsed)`);
    console.log(`      Metrics: ${stats.metrics}`);

    // Cleanup test data
    database.prepare('DELETE FROM xbrl_fundamental_metrics WHERE identifier_id = ?').run(testIdentifier.id);
    database.prepare('DELETE FROM xbrl_filings WHERE identifier_id = ?').run(testIdentifier.id);
    database.prepare('DELETE FROM company_identifiers WHERE lei = ?').run('TEST123456789012345');
    console.log('   🧹 Cleaned up test data');

    results.tests.push({ name: 'FundamentalStore - DB Ops', status: 'passed' });
    results.passed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'FundamentalStore - DB Ops', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Test 6: CompaniesHouseClient (Optional)
  // ========================================
  console.log('📋 Test 6: CompaniesHouseClient - UK Data');
  console.log('-'.repeat(50));

  try {
    if (!process.env.COMPANIES_HOUSE_API_KEY) {
      console.log('   ⏭️  SKIPPED: COMPANIES_HOUSE_API_KEY not set');
      console.log('   💡 Get free key at: https://developer.company-information.service.gov.uk/');
      results.tests.push({ name: 'CompaniesHouse', status: 'skipped', reason: 'No API key' });
      results.skipped++;
    } else {
      const client = new CompaniesHouseClient();

      // Test search
      const searchResult = await client.searchCompanies('Shell', { itemsPerPage: 3 });
      console.log(`   ✅ Search returned ${searchResult.companies.length} results`);

      if (searchResult.companies.length > 0) {
        const company = searchResult.companies[0];
        console.log(`   📄 First result: ${company.companyName} (${company.companyNumber})`);

        // Test get company details
        const details = await client.getCompany(company.companyNumber);
        console.log('   ✅ Retrieved company details');
        console.log(`      Status: ${details.company_status}`);
        console.log(`      Type: ${details.type}`);
      }

      results.tests.push({ name: 'CompaniesHouse', status: 'passed' });
      results.passed++;
    }
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'CompaniesHouse', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Test 7: End-to-End Sync Test
  // ========================================
  console.log('📋 Test 7: End-to-End - Fetch, Parse, Store');
  console.log('-'.repeat(50));

  try {
    const client = new XBRLFilingsClient();
    const parser = new XBRLParser();
    const database = db.getDatabase();
    const store = new FundamentalStore(database);

    // Fetch a real filing - use GB which we know works from earlier tests
    const { filings } = await client.getFilingsByCountry('GB', { pageSize: 20 });

    let successfulFiling = null;
    for (const filing of filings) {
      if (!filing.jsonUrl) continue;

      try {
        // Fetch xBRL-JSON using jsonUrl
        const json = await client.getXBRLJson(filing.jsonUrl);

        // Parse
        const parsed = parser.parseXBRLJson(json);
        const record = parser.toFlatRecord(parsed);

        if (record && record.revenue) {
          successfulFiling = { filing, parsed, record };
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!successfulFiling) {
      throw new Error('Could not complete end-to-end test with available filings');
    }

    const { filing, parsed, record } = successfulFiling;

    // Store in database - storeFiling automatically creates identifier
    const storedFiling = store.storeFiling(filing);

    // Get the identifier that was created
    const identifier = store.getIdentifierByLEI(filing.entityLEI);
    if (!identifier) {
      throw new Error('Failed to create identifier');
    }

    // Store metrics using the identifier and filing IDs
    const storedMetrics = store.storeMetrics(record, identifier.id, storedFiling.id);

    console.log('   ✅ End-to-end test successful!');
    console.log(`   📄 LEI: ${filing.entityLEI}`);
    console.log(`   📅 Period: ${record.period_end}`);
    console.log(`   💰 Revenue: ${(record.revenue / 1e6).toFixed(1)}M ${record.currency}`);
    if (record.net_income) console.log(`   💵 Net Income: ${(record.net_income / 1e6).toFixed(1)}M`);
    console.log(`   🗄️ Stored with metrics ID: ${storedMetrics.id}`);

    results.tests.push({ name: 'End-to-End Sync', status: 'passed' });
    results.passed++;
  } catch (error) {
    console.log(`   ❌ FAILED: ${error.message}`);
    results.tests.push({ name: 'End-to-End Sync', status: 'failed', error: error.message });
    results.failed++;
  }

  console.log('');

  // ========================================
  // Summary
  // ========================================
  console.log('='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⏭️  Skipped: ${results.skipped}`);
  console.log('');

  for (const test of results.tests) {
    const icon = test.status === 'passed' ? '✅' : test.status === 'skipped' ? '⏭️' : '❌';
    console.log(`   ${icon} ${test.name}${test.error ? `: ${test.error}` : ''}`);
  }

  console.log('');

  if (results.failed === 0) {
    console.log('🎉 All tests passed! XBRL infrastructure is ready.\n');
  } else {
    console.log(`⚠️  ${results.failed} test(s) failed. Please review the errors above.\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
