// test-providers-simple.js
/**
 * Simple provider health check
 * Tests actual methods that exist on each provider
 */

require('dotenv').config();
const db = require('./src/database');

async function testProviders() {
  console.log('🔍 Data Provider Health Check\n');

  const database = db.getDatabase();
  const results = [];

  // =============================================
  // Test 1: Alpha Vantage
  // =============================================
  console.log('1️⃣  Alpha Vantage Provider');
  console.log('─────────────────────────────────');

  try {
    const AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
    const provider = new AlphaVantageProvider(database);

    console.log('✅ Provider initialized');
    console.log(`   API Key: ${process.env.ALPHA_VANTAGE_KEY ? 'Configured' : 'Missing'}`);

    // Check deduplication
    if (provider.deduplicator) {
      const stats = provider.getDeduplicationStats();
      console.log(`   ✅ Request deduplication: Active`);
      console.log(`      Current stats: ${stats.totalRequests} requests, ${stats.deduplicationRate}% dedup rate`);
    }

    // Test a simple call if API key exists
    if (process.env.ALPHA_VANTAGE_KEY) {
      console.log('   Testing API call (AAPL quote)...');
      try {
        const quote = await provider.getQuote('AAPL');
        if (quote && quote.symbol) {
          console.log(`   ✅ API working - AAPL: $${quote.price || 'N/A'}`);
          results.push({ name: 'Alpha Vantage', status: 'working' });
        } else {
          console.log('   ⚠️  API returned unexpected format');
          results.push({ name: 'Alpha Vantage', status: 'partial' });
        }
      } catch (e) {
        console.log(`   ⚠️  API call failed: ${e.message}`);
        if (e.message.includes('rate limit')) {
          console.log('   ℹ️  Hit rate limit (5 calls/min on free tier)');
          results.push({ name: 'Alpha Vantage', status: 'rate_limited' });
        } else {
          results.push({ name: 'Alpha Vantage', status: 'error' });
        }
      }
    } else {
      console.log('   ⚠️  API key not configured');
      results.push({ name: 'Alpha Vantage', status: 'no_key' });
    }
  } catch (error) {
    console.log(`   ❌ Failed to initialize: ${error.message}`);
    results.push({ name: 'Alpha Vantage', status: 'failed' });
  }
  console.log('');

  // =============================================
  // Test 2: SEC EDGAR
  // =============================================
  console.log('2️⃣  SEC EDGAR Provider');
  console.log('─────────────────────────────────');

  try {
    const SECProvider = require('./src/providers/SECProvider');
    const provider = new SECProvider(database);

    console.log('✅ Provider initialized');
    console.log('   No API key required (public access)');

    // Test health check
    try {
      const health = await provider.healthCheck();
      // healthCheck() returns boolean true/false
      if (health === true) {
        console.log('   ✅ Health check passed');
        const stats = provider.getStats();
        console.log(`      Cache: ${stats.cacheSize} items`);
        console.log(`      Tickers: ${stats.tickersCached} loaded`);
        results.push({ name: 'SEC EDGAR', status: 'working' });
      } else {
        console.log('   ⚠️  Health check failed');
        results.push({ name: 'SEC EDGAR', status: 'degraded' });
      }
    } catch (e) {
      console.log(`   ⚠️  Health check error: ${e.message}`);
      results.push({ name: 'SEC EDGAR', status: 'error' });
    }
  } catch (error) {
    console.log(`   ❌ Failed to initialize: ${error.message}`);
    results.push({ name: 'SEC EDGAR', status: 'failed' });
  }
  console.log('');

  // =============================================
  // Test 3: FRED (Economic Data)
  // =============================================
  console.log('3️⃣  FRED Service');
  console.log('─────────────────────────────────');

  try {
    const { FREDService } = require('./src/services/dataProviders/fredService');
    const fredService = new FREDService(database);

    console.log('✅ Service loaded');
    console.log(`   API Key: ${process.env.FRED_API_KEY ? 'Configured' : 'Missing'}`);

    if (process.env.FRED_API_KEY) {
      console.log('   Testing API call (GDP data)...');
      try {
        // Use fetchSeries (not getSeries) with sortOrder desc to get latest first
        const data = await fredService.fetchSeries('GDP', { limit: 1, sortOrder: 'desc' });
        if (data && Array.isArray(data) && data.length > 0) {
          console.log(`   ✅ API working - Latest GDP: ${data[0].value} (${data[0].date})`);
          results.push({ name: 'FRED', status: 'working' });
        } else {
          console.log('   ⚠️  No data returned');
          results.push({ name: 'FRED', status: 'no_data' });
        }
      } catch (e) {
        console.log(`   ⚠️  API call failed: ${e.message}`);
        results.push({ name: 'FRED', status: 'error' });
      }
    } else {
      console.log('   ⚠️  API key not configured');
      results.push({ name: 'FRED', status: 'no_key' });
    }
  } catch (error) {
    console.log(`   ❌ Failed to load: ${error.message}`);
    results.push({ name: 'FRED', status: 'failed' });
  }
  console.log('');

  // =============================================
  // Test 4: Yahoo Finance
  // =============================================
  console.log('4️⃣  Yahoo Finance (Validation)');
  console.log('─────────────────────────────────');

  try {
    const YahooFetcher = require('./src/validation/yahooFetcher');
    const fetcher = new YahooFetcher();

    console.log('✅ Fetcher loaded');
    console.log('   No API key required (web scraping)');

    try {
      await fetcher.init();
      console.log('   Testing price fetch for AAPL...');

      const metrics = await fetcher.fetchMetrics('AAPL');
      if (metrics && metrics.symbol === 'AAPL') {
        console.log(`   ✅ API working - AAPL metrics retrieved`);
        console.log(`      Price: $${metrics.currentPrice || 'N/A'}`);
        results.push({ name: 'Yahoo Finance', status: 'working' });
      } else {
        console.log('   ⚠️  Unexpected response format');
        results.push({ name: 'Yahoo Finance', status: 'partial' });
      }
    } catch (e) {
      console.log(`   ⚠️  Fetch failed: ${e.message}`);
      if (e.message.includes('429') || e.message.includes('blocked')) {
        console.log('   ℹ️  Temporarily blocked (common with web scraping)');
        results.push({ name: 'Yahoo Finance', status: 'blocked' });
      } else {
        results.push({ name: 'Yahoo Finance', status: 'error' });
      }
    }
  } catch (error) {
    console.log(`   ❌ Failed to load: ${error.message}`);
    results.push({ name: 'Yahoo Finance', status: 'failed' });
  }
  console.log('');

  // =============================================
  // Test 5: FMP (Optional)
  // =============================================
  console.log('5️⃣  Financial Modeling Prep (Optional)');
  console.log('─────────────────────────────────');

  if (process.env.FMP_API_KEY) {
    console.log('✅ API key configured');
    console.log('   ℹ️  Detailed testing skipped (not critical)');
    results.push({ name: 'FMP', status: 'configured' });
  } else {
    console.log('ℹ️  Not configured (optional)');
    console.log('   This provider is for validation only');
    results.push({ name: 'FMP', status: 'not_configured' });
  }
  console.log('');

  // =============================================
  // Summary
  // =============================================
  console.log('═══════════════════════════════════════');
  console.log('📊 Provider Status Summary');
  console.log('═══════════════════════════════════════\n');

  const statusSymbols = {
    working: '✅',
    partial: '⚠️ ',
    degraded: '⚠️ ',
    error: '❌',
    failed: '❌',
    no_key: '⚠️ ',
    no_data: '⚠️ ',
    rate_limited: '⚠️ ',
    blocked: '⚠️ ',
    configured: '✅',
    not_configured: 'ℹ️ '
  };

  results.forEach(r => {
    const symbol = statusSymbols[r.status] || '?';
    console.log(`${symbol} ${r.name}: ${r.status.replace(/_/g, ' ')}`);
  });

  console.log('');

  // Count results
  const working = results.filter(r => r.status === 'working' || r.status === 'configured').length;
  const issues = results.filter(r => r.status === 'error' || r.status === 'failed').length;
  const warnings = results.filter(r =>
    ['partial', 'degraded', 'no_key', 'rate_limited', 'blocked'].includes(r.status)
  ).length;

  console.log(`Working: ${working}/${results.length}`);
  console.log(`Issues: ${issues}`);
  console.log(`Warnings: ${warnings}`);
  console.log('');

  // Final assessment
  if (issues === 0 && working >= 2) {
    console.log('✅ Core data providers operational');
    console.log('   System can fetch data from multiple sources');
    console.log('');
    console.log('ℹ️  Note: Some warnings are expected:');
    console.log('   - Rate limits (Alpha Vantage free tier)');
    console.log('   - Missing API keys (optional providers)');
    console.log('   - Temporary blocks (Yahoo web scraping)');
    return 0;
  } else if (issues <= 1 && working >= 1) {
    console.log('⚠️  System operational with reduced functionality');
    console.log('   At least one working data provider available');
    return 0;
  } else {
    console.log('❌ Multiple provider failures');
    console.log('   May need to review configuration');
    return 1;
  }
}

// Run tests
testProviders()
  .then((exitCode) => {
    console.log(`\nTest completed with exit code: ${exitCode}`);
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
