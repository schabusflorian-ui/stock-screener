#!/usr/bin/env node
// scripts/verify-api-connections.js
// Test API connectivity for all data sources

require('dotenv').config();

const tests = [
  {
    name: 'Yahoo Finance',
    test: async () => {
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d');
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
        return `OK - AAPL: $${data.chart.result[0].meta.regularMarketPrice}`;
      }
      return 'FAIL: No price data';
    }
  },
  {
    name: 'SEC EDGAR',
    test: async () => {
      const res = await fetch('https://data.sec.gov/submissions/CIK0000320193.json', {
        headers: { 'User-Agent': 'Investment-App contact@example.com' }
      });
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      return data.name ? `OK - Found: ${data.name}` : 'FAIL: No company data';
    }
  },
  {
    name: 'FMP API',
    test: async () => {
      const key = process.env.FMP_API_KEY;
      if (!key) return 'SKIP: FMP_API_KEY not set';
      const res = await fetch(`https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=${key}`);
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && data[0].price) {
        return `OK - AAPL: $${data[0].price}`;
      }
      if (data['Error Message']) {
        return `FAIL: ${data['Error Message']}`;
      }
      return `FAIL: Unexpected response: ${JSON.stringify(data).slice(0, 100)}`;
    }
  },
  {
    name: 'FMP Insider Trading',
    test: async () => {
      const key = process.env.FMP_API_KEY;
      if (!key) return 'SKIP: FMP_API_KEY not set';
      const res = await fetch(`https://financialmodelingprep.com/api/v4/insider-trading?symbol=AAPL&limit=1&apikey=${key}`);
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return `OK - Found ${data.length} insider transaction(s)`;
      }
      return 'FAIL: No insider data';
    }
  },
  {
    name: 'FMP Dividends',
    test: async () => {
      const key = process.env.FMP_API_KEY;
      if (!key) return 'SKIP: FMP_API_KEY not set';
      const res = await fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/stock_dividend/AAPL?apikey=${key}`);
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (data.historical && data.historical.length > 0) {
        return `OK - Found ${data.historical.length} dividend records`;
      }
      return 'FAIL: No dividend data';
    }
  },
  {
    name: 'FRED API',
    test: async () => {
      const key = process.env.FRED_API_KEY;
      if (!key) return 'SKIP: FRED_API_KEY not set';
      const res = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFF&limit=1&api_key=${key}&file_type=json`);
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (data.observations && data.observations.length > 0) {
        return `OK - Fed Funds Rate: ${data.observations[0].value}%`;
      }
      return 'FAIL: No FRED data';
    }
  },
  {
    name: 'XBRL Filings (EU)',
    test: async () => {
      const res = await fetch('https://filings.xbrl.org/api/filings?filter[country]=GB&page[size]=1');
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return `OK - Found ${data.meta?.count || data.data.length} UK filings`;
      }
      return 'FAIL: No XBRL data';
    }
  },
  {
    name: 'Yahoo Finance EU Index (FTSE)',
    test: async () => {
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EFTSE?interval=1d&range=1d');
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
        return `OK - FTSE: ${data.chart.result[0].meta.regularMarketPrice}`;
      }
      return 'FAIL: No FTSE data';
    }
  },
  {
    name: 'Yahoo Finance EU Stock (Siemens.DE)',
    test: async () => {
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/SIE.DE?interval=1d&range=1d');
      if (!res.ok) return `FAIL: HTTP ${res.status}`;
      const data = await res.json();
      if (data.chart?.result?.[0]?.meta?.regularMarketPrice) {
        return `OK - Siemens: EUR ${data.chart.result[0].meta.regularMarketPrice}`;
      }
      return 'FAIL: No Siemens data';
    }
  }
];

async function run() {
  console.log('\n🔌 API Connection Tests');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const t of tests) {
    try {
      const result = await t.test();
      const status = result.startsWith('OK') ? '✅' : result.startsWith('SKIP') ? '⏭️' : '❌';
      console.log(`${status} ${t.name.padEnd(30)} ${result}`);

      if (result.startsWith('OK')) passed++;
      else if (result.startsWith('SKIP')) skipped++;
      else failed++;
    } catch (e) {
      console.log(`❌ ${t.name.padEnd(30)} ERROR: ${e.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    console.log('⚠️  Some API connections failed. Check your API keys and network.');
    process.exit(1);
  }
}

run().catch(console.error);
