// test-data-providers.js
/**
 * Test script for all data providers
 * Tests: Alpha Vantage, SEC, FRED, Yahoo, FMP
 */

const db = require('./src/database');
const config = require('./src/config');

// Import providers and services
let AlphaVantageProvider, SECProvider, fredService, yahooFetcher, fmpFetcher;

try {
  AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
} catch (e) {
  console.error('Failed to load AlphaVantageProvider:', e.message);
}

try {
  SECProvider = require('./src/providers/SECProvider');
} catch (e) {
  console.error('Failed to load SECProvider:', e.message);
}

try {
  fredService = require('./src/services/data/fredService');
} catch (e) {
  console.error('Failed to load FRED service:', e.message);
}

try {
  yahooFetcher = require('./src/validation/yahooFetcher');
} catch (e) {
  console.error('Failed to load Yahoo fetcher:', e.message);
}

try {
  fmpFetcher = require('./src/validation/fmpFetcher');
} catch (e) {
  console.error('Failed to load FMP fetcher:', e.message);
}

async function testProviders() {
  console.log('🔍 Testing Data Providers\n');
  console.log('═══════════════════════════════════════\n');

  const database = db.getDatabase();
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  };

  // =============================================
  // Test 1: Alpha Vantage Provider
  // =============================================
  console.log('1️⃣  Alpha Vantage Provider');
  console.log('─────────────────────────────────');
  results.total++;

  if (!config.alphaVantage?.apiKey) {
    console.log('⚠️  SKIPPED - No API key configured');
    console.log('   Set ALPHA_VANTAGE_KEY in .env file');
    results.skipped++;
  } else if (!AlphaVantageProvider) {
    console.log('❌ FAILED - Could not load provider');
    results.failed++;
  } else {
    try {
      const provider = new AlphaVantageProvider(database);
      console.log('✅ Provider initialized');
      console.log(`   API Key: ${config.alphaVantage.apiKey.substring(0, 8)}...`);

      // Test company overview
      console.log('   Testing company overview for AAPL...');
      const overview = await provider.getCompanyOverview('AAPL');

      if (overview && overview.Symbol === 'AAPL') {
        console.log('   ✅ Company overview retrieved');
        console.log(`      Name: ${overview.Name || 'N/A'}`);
        console.log(`      Sector: ${overview.Sector || 'N/A'}`);
        console.log(`      Market Cap: ${overview.MarketCapitalization || 'N/A'}`);
        results.passed++;
      } else {
        console.log('   ❌ Invalid response from Alpha Vantage');
        results.failed++;
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      if (error.message.includes('rate limit')) {
        console.log('   ℹ️  Rate limit hit (5 calls/min on free tier)');
      }
      results.failed++;
    }
  }
  console.log('');

  // =============================================
  // Test 2: SEC EDGAR Provider
  // =============================================
  console.log('2️⃣  SEC EDGAR Provider');
  console.log('─────────────────────────────────');
  results.total++;

  if (!SECProvider) {
    console.log('❌ FAILED - Could not load provider');
    results.failed++;
  } else {
    try {
      const secProvider = new SECProvider(database);
      console.log('✅ Provider initialized');

      // Test company submissions lookup (actual method that exists)
      console.log('   Testing submissions for Apple...');
      const submissions = await secProvider.getSubmissions('AAPL');

      if (submissions && submissions.name) {
        console.log('   ✅ SEC submissions retrieved');
        console.log(`      Company: ${submissions.name}`);
        console.log(`      CIK: ${submissions.cik}`);
        console.log(`      SIC: ${submissions.sicDescription || 'N/A'}`);
        results.passed++;
      } else {
        console.log('   ⚠️  No submissions found');
        results.failed++;
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        console.log('   ℹ️  Rate limit hit (10 req/sec limit)');
      }
      results.failed++;
    }
  }
  console.log('');

  // =============================================
  // Test 3: FRED Service (Economic Data)
  // =============================================
  console.log('3️⃣  FRED Service (Federal Reserve Data)');
  console.log('─────────────────────────────────');
  results.total++;

  if (!config.fred?.apiKey) {
    console.log('⚠️  SKIPPED - No API key configured');
    console.log('   Set FRED_API_KEY in .env file');
    results.skipped++;
  } else {
    try {
      const { FREDService } = require('./src/services/dataProviders/fredService');
      const fredServiceInstance = new FREDService(database);

      console.log('✅ Service available');
      console.log(`   API Key: ${config.fred.apiKey.substring(0, 8)}...`);

      // Test fetching GDP data
      console.log('   Testing GDP data fetch...');
      const gdpData = await fredServiceInstance.fetchSeries('GDP', { limit: 5, sortOrder: 'desc' });

      if (gdpData && Array.isArray(gdpData) && gdpData.length > 0) {
        console.log('   ✅ Economic data retrieved');
        console.log(`      Series: GDP (Gross Domestic Product)`);
        console.log(`      Data points: ${gdpData.length}`);
        console.log(`      Latest: ${gdpData[0]?.date || 'N/A'} = ${gdpData[0]?.value || 'N/A'}`);
        results.passed++;
      } else {
        console.log('   ❌ No data returned');
        results.failed++;
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      if (error.message.includes('rate limit')) {
        console.log('   ℹ️  Rate limit hit');
      }
      results.failed++;
    }
  }
  console.log('');

  // =============================================
  // Test 4: Yahoo Finance Fetcher
  // =============================================
  console.log('4️⃣  Yahoo Finance Fetcher (Validation)');
  console.log('─────────────────────────────────');
  results.total++;

  if (!yahooFetcher) {
    console.log('❌ FAILED - Could not load fetcher');
    results.failed++;
  } else {
    try {
      console.log('✅ Fetcher available');

      // Test fetching price data
      console.log('   Testing price fetch for AAPL...');
      const priceData = await yahooFetcher.fetchPrice('AAPL');

      if (priceData && priceData.symbol === 'AAPL' && priceData.price) {
        console.log('   ✅ Price data retrieved');
        console.log(`      Symbol: ${priceData.symbol}`);
        console.log(`      Price: $${priceData.price}`);
        console.log(`      Change: ${priceData.change || 'N/A'}%`);
        results.passed++;
      } else {
        console.log('   ❌ Invalid price data');
        results.failed++;
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        console.log('   ℹ️  Rate limit or temporary block');
      }
      results.failed++;
    }
  }
  console.log('');

  // =============================================
  // Test 5: FMP (Financial Modeling Prep)
  // =============================================
  console.log('5️⃣  Financial Modeling Prep API');
  console.log('─────────────────────────────────');
  results.total++;

  if (!process.env.FMP_API_KEY) {
    console.log('⚠️  SKIPPED - No API key configured');
    console.log('   Set FMP_API_KEY in .env file');
    console.log('   ℹ️  This is optional - used for validation/transcripts');
    results.skipped++;
  } else if (!fmpFetcher) {
    console.log('❌ FAILED - Could not load fetcher');
    results.failed++;
  } else {
    try {
      console.log('✅ Fetcher available');
      console.log(`   API Key: ${process.env.FMP_API_KEY.substring(0, 8)}...`);

      // Test fetching company profile
      console.log('   Testing company profile for AAPL...');
      const profile = await fmpFetcher.fetchCompanyProfile('AAPL');

      if (profile && profile.symbol === 'AAPL') {
        console.log('   ✅ Company profile retrieved');
        console.log(`      Name: ${profile.companyName || 'N/A'}`);
        console.log(`      Industry: ${profile.industry || 'N/A'}`);
        results.passed++;
      } else {
        console.log('   ❌ Invalid profile data');
        results.failed++;
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      if (error.message.includes('rate limit')) {
        console.log('   ℹ️  Rate limit hit (250 calls/day on free tier)');
      }
      results.failed++;
    }
  }
  console.log('');

  // =============================================
  // Test 6: Request Deduplication
  // =============================================
  console.log('6️⃣  Request Deduplication (Phase 3.4)');
  console.log('─────────────────────────────────');
  results.total++;

  if (!AlphaVantageProvider) {
    console.log('⚠️  SKIPPED - Alpha Vantage not available');
    results.skipped++;
  } else {
    try {
      const provider = new AlphaVantageProvider(database);

      // Check if deduplicator exists
      if (provider.deduplicator) {
        console.log('✅ Request deduplication active');

        const stats = provider.getDeduplicationStats();
        console.log(`   Total requests: ${stats.totalRequests}`);
        console.log(`   Unique requests: ${stats.uniqueRequests}`);
        console.log(`   Deduplicated: ${stats.deduplicatedRequests}`);
        console.log(`   Deduplication rate: ${stats.deduplicationRate}%`);
        results.passed++;
      } else {
        console.log('❌ Deduplication not integrated');
        results.failed++;
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      results.failed++;
    }
  }
  console.log('');

  // =============================================
  // Summary
  // =============================================
  console.log('═══════════════════════════════════════');
  console.log('📊 Provider Test Summary');
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Skipped: ${results.skipped} (missing API keys)`);
  console.log('');

  const successRate = results.total > 0
    ? Math.round((results.passed / (results.total - results.skipped)) * 100)
    : 0;

  console.log(`Success Rate: ${successRate}%`);
  console.log('');

  if (results.failed === 0) {
    console.log('✅ All configured providers working correctly!');
    console.log('');
    console.log('ℹ️  Note: Some providers skipped due to missing API keys.');
    console.log('   This is normal - not all data sources are required.');
    return 0;
  } else if (results.failed <= 2 && results.passed >= 2) {
    console.log('⚠️  Most providers working, some issues detected');
    console.log('   System can operate with reduced functionality');
    return 0;
  } else {
    console.log('❌ Multiple provider failures detected');
    console.log('   Review errors above and check:');
    console.log('   1. API keys are valid');
    console.log('   2. Network connectivity');
    console.log('   3. Rate limits not exceeded');
    return 1;
  }
}

// Run tests
testProviders()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
