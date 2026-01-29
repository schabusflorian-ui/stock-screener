// get-sp500-list.js
const axios = require('axios');
const fs = require('fs');

/**
 * Get S&P 500 constituents from Wikipedia
 */
async function getSP500List() {
  console.log('\n📥 Fetching S&P 500 list from Wikipedia...\n');
  
  try {
    // Wikipedia maintains an updated S&P 500 list
    const url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies';
    const response = await axios.get(url);
    
    // Parse HTML (simple regex - gets the job done)
    const html = response.data;
    
    // Extract ticker symbols from the table
    const symbolRegex = /<td><a[^>]*>([A-Z]+(?:\.[A-Z]+)?)<\/a><\/td>/g;
    const symbols = [];
    let match;
    
    while ((match = symbolRegex.exec(html)) !== null) {
      const symbol = match[1].replace('.', '-'); // Handle BRK.B -> BRK-B
      if (!symbols.includes(symbol)) {
        symbols.push(symbol);
      }
    }
    
    console.log(`✅ Found ${symbols.length} S&P 500 companies\n`);
    console.log('First 10:', symbols.slice(0, 10).join(', '));
    console.log('Last 10:', symbols.slice(-10).join(', '));
    
    // Save to file
    fs.writeFileSync(
      'sp500-symbols.json',
      JSON.stringify(symbols, null, 2)
    );
    
    console.log('\n💾 Saved to sp500-symbols.json\n');
    
    return symbols;
    
  } catch (error) {
    console.error('❌ Error fetching S&P 500 list:', error.message);
    
    // Fallback: Use a known subset
    console.log('\n⚠️  Using fallback list of major companies...\n');
    const fallbackSymbols = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B',
      'UNH', 'JNJ', 'XOM', 'V', 'PG', 'JPM', 'MA', 'HD', 'CVX', 'MRK',
      'ABBV', 'PEP', 'COST', 'AVGO', 'KO', 'WMT', 'MCD', 'CSCO', 'TMO',
      'ACN', 'ABT', 'DHR', 'VZ', 'CMCSA', 'ADBE', 'NKE', 'CRM', 'NFLX',
      'DIS', 'TXN', 'WFC', 'PM', 'UNP', 'INTC', 'NEE', 'COP', 'BMY',
      'ORCL', 'RTX', 'UPS', 'MS', 'HON', 'BA', 'QCOM', 'GE', 'LOW'
    ];
    
    fs.writeFileSync(
      'sp500-symbols.json',
      JSON.stringify(fallbackSymbols, null, 2)
    );
    
    return fallbackSymbols;
  }
}

// Run it
getSP500List();