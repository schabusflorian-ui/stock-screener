#!/usr/bin/env node
/**
 * Earnings Call Transcript Fetcher
 *
 * Fetches transcripts from Financial Modeling Prep (FMP) API.
 * Requires FMP_API_KEY environment variable.
 *
 * Usage:
 *   node scripts/fetch-transcripts.js [--symbol AAPL] [--limit 10]
 *
 * FMP API Key: Get free key at https://financialmodelingprep.com/developer
 */

const https = require('https');
const db = require('../src/database');
const { TranscriptService } = require('../src/services/transcripts');

const API_KEY = process.env.FMP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';

// Rate limiting
const DELAY_MS = 300; // FMP allows 5 requests/second on free tier
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchTranscripts(symbol) {
  const url = `${BASE_URL}/earning_call_transcript/${symbol}?apikey=${API_KEY}`;
  try {
    const data = await fetchJSON(url);
    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`  Error fetching ${symbol}: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('\n📞 Earnings Call Transcript Fetcher\n');

  if (!API_KEY) {
    console.error('❌ FMP_API_KEY environment variable is required');
    console.log('   Get a free API key at: https://financialmodelingprep.com/developer\n');
    console.log('   Usage: FMP_API_KEY=your_key node scripts/fetch-transcripts.js\n');
    process.exit(1);
  }

  // Parse arguments
  const args = process.argv.slice(2);
  let symbols = [];
  let limit = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) {
      symbols = [args[i + 1].toUpperCase()];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1]);
      i++;
    }
  }

  const dbConn = db.getDatabase();
  const transcriptService = new TranscriptService(dbConn);

  // If no symbols specified, get top holdings by market cap
  if (symbols.length === 0) {
    const companies = dbConn.prepare(`
      SELECT c.symbol, c.id
      FROM companies c
      JOIN price_metrics pm ON pm.company_id = c.id
      WHERE c.symbol NOT LIKE 'CIK_%'
        AND pm.market_cap IS NOT NULL
      ORDER BY pm.market_cap DESC
      LIMIT ?
    `).all(limit);

    symbols = companies.map(c => c.symbol);
    console.log(`Fetching transcripts for top ${symbols.length} companies by market cap\n`);
  }

  let totalFetched = 0;
  let totalStored = 0;

  for (const symbol of symbols) {
    console.log(`Fetching ${symbol}...`);

    // Get company ID
    const company = dbConn.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol);
    if (!company) {
      console.log(`  ⚠️  Company not found in database, skipping`);
      continue;
    }

    const transcripts = await fetchTranscripts(symbol);

    if (transcripts.length === 0) {
      console.log(`  No transcripts found`);
    } else {
      console.log(`  Found ${transcripts.length} transcripts`);

      for (const t of transcripts.slice(0, 8)) { // Limit to last 8 quarters
        try {
          transcriptService.storeTranscript({
            companyId: company.id,
            symbol: symbol,
            fiscalYear: t.year,
            fiscalQuarter: t.quarter,
            callDate: t.date,
            callType: 'earnings',
            title: `Q${t.quarter} ${t.year} Earnings Call`,
            fullTranscript: t.content,
            source: 'fmp',
            sourceUrl: null
          });
          totalStored++;
        } catch (err) {
          console.log(`    Error storing Q${t.quarter} ${t.year}: ${err.message}`);
        }
      }
      totalFetched += transcripts.length;
    }

    // Update management track record
    try {
      transcriptService.updateTrackRecord(company.id, symbol);
    } catch (err) {
      // Ignore track record errors
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n✅ Fetch complete!`);
  console.log(`   Transcripts fetched: ${totalFetched}`);
  console.log(`   Transcripts stored: ${totalStored}\n`);

  // Show stats
  const count = dbConn.prepare('SELECT COUNT(*) as cnt FROM earnings_transcripts').get();
  console.log(`📊 Total transcripts in database: ${count.cnt}\n`);

  // Show sentiment distribution
  const sentimentDist = dbConn.prepare(`
    SELECT tone, COUNT(*) as count
    FROM earnings_transcripts
    WHERE tone IS NOT NULL
    GROUP BY tone
    ORDER BY count DESC
  `).all();

  if (sentimentDist.length > 0) {
    console.log('Sentiment Distribution:');
    console.table(sentimentDist);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
