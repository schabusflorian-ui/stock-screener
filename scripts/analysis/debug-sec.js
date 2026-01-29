// debug-sec.js
const axios = require('axios');

const userAgent = 'StockAnalyzer/1.0 (test@example.com)';

async function testEndpoint(url, description) {
  console.log(`\nTesting: ${description}`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`✓ Success! Status: ${response.status}`);
    console.log(`  Data type: ${typeof response.data}`);
    console.log(`  Keys: ${Object.keys(response.data).slice(0, 5).join(', ')}...`);
    
    return response.data;
    
  } catch (error) {
    console.log(`✗ Failed: ${error.response?.status || error.message}`);
    return null;
  }
}

(async () => {
  console.log('🔍 SEC API ENDPOINT INVESTIGATION\n');
  console.log('='.repeat(60));
  
  // Test various endpoints
  
  // 1. Company tickers (old endpoint)
  await testEndpoint(
    'https://data.sec.gov/files/company_tickers.json',
    'Company Tickers (old)'
  );
  
  // 2. Company tickers (alternative)
  await testEndpoint(
    'https://www.sec.gov/files/company_tickers.json',
    'Company Tickers (www subdomain)'
  );
  
  // 3. Company tickers exchange (newer format)
  const exchangeData = await testEndpoint(
    'https://www.sec.gov/files/company_tickers_exchange.json',
    'Company Tickers Exchange'
  );
  
  if (exchangeData) {
    console.log('\n  Sample entries:');
    const entries = Object.values(exchangeData.data).slice(0, 3);
    entries.forEach(e => {
      console.log(`    ${e[1]} (${e[2]}) - CIK: ${e[0]}`);
    });
  }
  
  // 4. Apple's submissions (using known CIK)
  await testEndpoint(
    'https://data.sec.gov/submissions/CIK0000320193.json',
    'Apple Submissions'
  );
  
  // 5. Apple's company facts
  await testEndpoint(
    'https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json',
    'Apple Company Facts'
  );
  
  console.log('\n' + '='.repeat(60));
})();