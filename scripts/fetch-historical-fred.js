#!/usr/bin/env node
/**
 * Fetch Historical FRED Data
 *
 * Fetches long-term historical data for key economic indicators,
 * particularly Wilshire 5000 and GDP for Buffett Indicator calculation.
 *
 * Usage: node scripts/fetch-historical-fred.js
 *
 * Requires FRED_API_KEY environment variable
 */

require('dotenv').config();
const axios = require('axios');
const db = require('../src/database');

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

// Series to fetch with historical depth
const HISTORICAL_SERIES = [
  // Buffett Indicator directly from World Bank (Stock Market Cap / GDP)
  { id: 'DDDM01USA156NWDB', name: 'Stock Market Capitalization to GDP (Buffett Indicator)', category: 'market', lookbackYears: 50 },
  { id: 'GDP', name: 'Gross Domestic Product', category: 'growth', lookbackYears: 25 },
  { id: 'GDPC1', name: 'Real GDP', category: 'growth', lookbackYears: 25 },
];

async function fetchSeries(seriesId, startDate) {
  const apiKey = process.env.FRED_API_KEY;

  if (!apiKey) {
    throw new Error('FRED_API_KEY not set in environment');
  }

  console.log(`  Fetching ${seriesId} from ${startDate}...`);

  const response = await axios.get(`${FRED_BASE_URL}/series/observations`, {
    params: {
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      observation_start: startDate,
      sort_order: 'asc',
    },
  });

  const data = response.data.observations || [];

  return data
    .map(obs => ({
      date: obs.date,
      value: obs.value === '.' ? null : parseFloat(obs.value),
    }))
    .filter(obs => obs.value !== null);
}

async function storeSeries(seriesId, seriesName, category, data) {
  const dbConn = db.getDatabase();

  // Ensure series definition exists
  dbConn.prepare(`
    INSERT OR IGNORE INTO economic_series_definitions
    (series_id, series_name, category, is_active)
    VALUES (?, ?, ?, 1)
  `).run(seriesId, seriesName, category);

  // Insert observations
  const insert = dbConn.prepare(`
    INSERT OR REPLACE INTO economic_indicators
    (series_id, series_name, category, observation_date, value, source, updated_at)
    VALUES (?, ?, ?, ?, ?, 'FRED', datetime('now'))
  `);

  const transaction = dbConn.transaction(() => {
    for (const obs of data) {
      insert.run(seriesId, seriesName, category, obs.date, obs.value);
    }
  });

  transaction();

  console.log(`  Stored ${data.length} observations for ${seriesId}`);
}

async function main() {
  console.log('\n📊 Fetching Historical FRED Data\n');
  console.log('=' .repeat(50));

  if (!process.env.FRED_API_KEY) {
    console.error('❌ Error: FRED_API_KEY not set in environment');
    console.log('\nTo get a free API key:');
    console.log('1. Go to https://fred.stlouisfed.org/');
    console.log('2. Create an account');
    console.log('3. Go to My Account -> API Keys');
    console.log('4. Request an API key');
    console.log('5. Add FRED_API_KEY=your_key to your .env file\n');
    process.exit(1);
  }

  let totalStored = 0;

  for (const series of HISTORICAL_SERIES) {
    console.log(`\n📈 ${series.name} (${series.id})`);

    try {
      // Calculate start date
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - series.lookbackYears);
      const startDateStr = startDate.toISOString().split('T')[0];

      // Fetch data
      const data = await fetchSeries(series.id, startDateStr);

      if (data.length > 0) {
        // Store data
        await storeSeries(series.id, series.name, series.category, data);
        totalStored += data.length;

        // Show date range
        console.log(`  Date range: ${data[0].date} to ${data[data.length - 1].date}`);
      } else {
        console.log(`  No data returned`);
      }

      // Rate limit: wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log(`✅ Complete! Stored ${totalStored} total observations\n`);

  // Show current Buffett Indicator
  console.log('📊 Current Buffett Indicator Data:\n');

  const dbConn = db.getDatabase();

  const buffettDirect = dbConn.prepare(`
    SELECT value, observation_date
    FROM economic_indicators
    WHERE series_id = 'DDDM01USA156NWDB'
    ORDER BY observation_date DESC
    LIMIT 1
  `).get();

  if (buffettDirect) {
    console.log(`  Buffett Indicator (World Bank): ${buffettDirect.value.toFixed(1)}% (${buffettDirect.observation_date})`);
  } else {
    console.log('  No Buffett Indicator data available');
  }

  // Show historical data counts
  console.log('📊 Historical Data Summary:\n');

  for (const series of HISTORICAL_SERIES) {
    const count = dbConn.prepare(`
      SELECT COUNT(*) as count,
             MIN(observation_date) as earliest,
             MAX(observation_date) as latest
      FROM economic_indicators
      WHERE series_id = ?
    `).get(series.id);

    console.log(`  ${series.id}: ${count.count} observations (${count.earliest} to ${count.latest})`);
  }

  console.log('');
}

main().catch(console.error);
