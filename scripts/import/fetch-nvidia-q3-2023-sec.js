// Fetch Nvidia Q3 2023 data directly from SEC
const axios = require('axios');

const USER_AGENT = 'StockAnalyzer/1.0 schabus.florian@gmail.com';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCIK(ticker) {
  try {
    console.log('🔍 Looking up CIK for', ticker);
    const url = 'https://www.sec.gov/files/company_tickers.json';
    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT }
    });

    const companies = Object.values(response.data);
    const company = companies.find(c =>
      c.ticker.toUpperCase() === ticker.toUpperCase()
    );

    if (company) {
      // Pad CIK to 10 digits
      const cik = company.cik_str.toString().padStart(10, '0');
      console.log(`✓ Found CIK: ${cik} (${company.title})`);
      return cik;
    }

    throw new Error(`CIK not found for ${ticker}`);
  } catch (error) {
    throw new Error(`Failed to get CIK: ${error.message}`);
  }
}

async function getCompanyFacts(cik) {
  try {
    console.log(`\n📊 Fetching company facts for CIK ${cik}...`);
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

    await sleep(200); // Rate limit

    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    console.log('✓ Data received');
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('Company facts not found. Company may not file with SEC.');
    }
    throw new Error(`Failed to get company facts: ${error.message}`);
  }
}

function findAccountsReceivable(facts) {
  // Common XBRL tags for accounts receivable
  const possibleTags = [
    'AccountsReceivableNetCurrent',
    'AccountsReceivableNet',
    'ReceivablesNetCurrent',
    'AccountsReceivableCurrent',
    'TradeAccountsReceivableCurrent'
  ];

  // Search in US GAAP
  const usGaap = facts.facts['us-gaap'];
  if (!usGaap) {
    console.log('⚠️  No US-GAAP data found');
    return null;
  }

  for (const tag of possibleTags) {
    if (usGaap[tag]) {
      console.log(`\n✓ Found tag: ${tag}`);
      return { tag, data: usGaap[tag] };
    }
  }

  // Show available tags that might be related
  console.log('\n⚠️  Standard AR tags not found. Related tags available:');
  const relatedTags = Object.keys(usGaap).filter(tag =>
    tag.toLowerCase().includes('receiv') ||
    tag.toLowerCase().includes('account')
  );
  relatedTags.slice(0, 20).forEach(tag => console.log(`   - ${tag}`));

  return null;
}

function findQ3_2023(arData) {
  // Look for Q3 2023 data (around Oct 2023 for Nvidia fiscal Q3 FY2024)
  // Nvidia fiscal year ends in January, so Q3 FY2024 ends around Oct 29, 2023

  if (!arData || !arData.units || !arData.units.USD) {
    console.log('⚠️  No USD data found');
    return null;
  }

  const usdData = arData.units.USD;

  // Find entries for 2023 Q3
  // Look for dates around July-October 2023
  const q3Candidates = usdData.filter(entry => {
    const endDate = entry.end;
    // Q3 2023: looking for fiscal period ending around Oct 2023
    return endDate && (
      endDate.startsWith('2023-10') ||
      endDate.startsWith('2023-11') ||
      endDate.startsWith('2023-09')
    ) && entry.form === '10-Q'; // Quarterly report
  });

  return q3Candidates;
}

async function main() {
  try {
    console.log('═══════════════════════════════════════════════');
    console.log('NVIDIA Q3 2023 ACCOUNTS RECEIVABLE');
    console.log('═══════════════════════════════════════════════\n');

    // Get CIK
    const cik = await getCIK('NVDA');

    // Get company facts
    const facts = await getCompanyFacts(cik);

    console.log('\n📋 Company:', facts.entityName);
    console.log('CIK:', facts.cik);

    // Find accounts receivable
    const arInfo = findAccountsReceivable(facts);

    if (!arInfo) {
      console.log('\n❌ Could not find accounts receivable data');
      process.exit(1);
    }

    // Find Q3 2023 specifically
    console.log('\n🔍 Looking for Q3 2023 data...');
    const q3Data = findQ3_2023(arInfo.data);

    if (!q3Data || q3Data.length === 0) {
      console.log('❌ No Q3 2023 quarterly data found');
      console.log('\n📅 Available reporting periods:');
      const periods = arInfo.data.units.USD
        .filter(e => e.form === '10-Q' && e.end.startsWith('2023'))
        .map(e => ({ date: e.end, filed: e.filed, value: e.val, form: e.form }));
      console.table(periods);
    } else {
      console.log(`✓ Found ${q3Data.length} Q3 2023 record(s)\n`);

      q3Data.forEach(entry => {
        console.log('═══════════════════════════════════════════════');
        console.log('✅ NVIDIA Q3 2023 ACCOUNTS RECEIVABLE');
        console.log('═══════════════════════════════════════════════');
        console.log(`Period End: ${entry.end}`);
        console.log(`Filed: ${entry.filed}`);
        console.log(`Form: ${entry.form}`);
        console.log(`Frame: ${entry.frame || 'N/A'}`);
        console.log('');
        console.log(`💰 Accounts Receivable: $${(entry.val / 1000000).toFixed(2)} Million`);
        console.log(`   Raw value: $${entry.val.toLocaleString()}`);
        console.log('');
        console.log(`📝 XBRL Tag: ${arInfo.tag}`);
        console.log(`Accession: ${entry.accn}`);
        console.log('═══════════════════════════════════════════════\n');
      });
    }

    // Show all 2023 data for context
    console.log('\n📊 All 2023 Accounts Receivable Data:');
    const all2023 = arInfo.data.units.USD.filter(e =>
      e.end && e.end.startsWith('2023') && (e.form === '10-Q' || e.form === '10-K')
    );

    console.table(all2023.map(e => ({
      'Period End': e.end,
      'Form': e.form,
      'Filed': e.filed,
      'AR ($M)': (e.val / 1000000).toFixed(2),
      'Frame': e.frame || 'N/A'
    })));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

main();
