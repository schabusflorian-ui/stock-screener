// Debug script to investigate XBRL parsing issues
const db = require('./src/database').getDatabase();
const { XBRLFilingsClient } = require('./src/services/xbrl/xbrlFilingsClient');
const { XBRLParser } = require('./src/services/xbrl/xbrlParser');
const { FundamentalStore } = require('./src/services/xbrl/fundamentalStore');

async function debugParsing() {
  const client = new XBRLFilingsClient();
  const parser = new XBRLParser();
  const store = new FundamentalStore(db);

  // Get a filing that failed parsing
  const unparsed = db.prepare('SELECT * FROM xbrl_filings WHERE parsed = 0 AND json_url IS NOT NULL LIMIT 1').get();

  console.log('Testing filing:');
  console.log('  ID:', unparsed.id);
  console.log('  LEI:', unparsed.lei);
  console.log('  Entity:', unparsed.entity_name);
  console.log('  identifier_id:', unparsed.identifier_id);
  console.log('  json_url:', unparsed.json_url);
  console.log('');

  // Fetch the xBRL-JSON
  console.log('Fetching xBRL-JSON...');
  try {
    const xbrlJson = await client.getXBRLJson(unparsed.json_url);
    console.log('  Fetched successfully, keys:', Object.keys(xbrlJson || {}).slice(0,5));

    // Parse it
    console.log('\nParsing xBRL-JSON...');
    const parsed = parser.parseXBRLJson(xbrlJson);
    console.log('  Entity:', parsed.entity?.name);
    console.log('  Periods:', Object.keys(parsed.periods || {}));

    // Check periods
    for (const [periodKey, periodData] of Object.entries(parsed.periods || {})) {
      console.log('\n  Period:', periodKey);
      console.log('    Type:', periodData.periodType);
      console.log('    Metrics count:', Object.keys(periodData.metrics || {}).length);

      if (periodData.periodType === 'annual' || periodData.periodType === 'semi-annual') {
        const metrics = parser.toFlatRecord(parsed, periodKey);
        console.log('    Flat record period_end:', metrics?.period_end);
        const hasRequiredFields = Boolean(metrics) && Boolean(unparsed.identifier_id);
        console.log('    Has required fields:', hasRequiredFields);

        if (metrics && unparsed.identifier_id) {
          console.log('\n  Attempting to store metrics...');
          try {
            const result = store.storeMetrics(metrics, unparsed.identifier_id, unparsed.id);
            console.log('    SUCCESS! Stored metrics ID:', result.id);
          } catch (storeErr) {
            console.log('    FAILED:', storeErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.log('  Error:', err.message);
    console.log('  Stack:', err.stack);
  }
}

debugParsing().catch(err => console.error('Debug error:', err));
