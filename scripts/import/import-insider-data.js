/**
 * Import Insider Trading Data from SEC EDGAR
 *
 * Fetches Form 4 filings for tracked companies from the last 3 months
 */

const axios = require('axios');
const path = require('path');

// Navigate to project root from scripts/import/
const projectRoot = path.join(__dirname, '..', '..');
const db = require(path.join(projectRoot, 'src/database'));
const Form4Parser = require(path.join(projectRoot, 'src/services/form4Parser'));

const database = db.getDatabase();
const form4Parser = new Form4Parser();

// SEC API rate limiting - 10 requests per second max
const REQUEST_DELAY = 150; // 150ms to be safe
let lastRequestTime = 0;

const USER_AGENT = 'InvestmentResearch/1.0 (contact@example.com)';

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY) {
    await new Promise(r => setTimeout(r, REQUEST_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchJson(url) {
  await rateLimit();
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchXml(url) {
  await rateLimit();
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/xml',
      },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get companies with CIKs from the database
 * @param {number} limit - Max number of companies to fetch (0 = all)
 */
function getCompaniesWithCIK(limit = 0) {
  // Prioritize S&P 500 and major companies by symbol
  const topSymbols = [
    'AAPL', 'MSFT', 'AMZN', 'NVDA', 'GOOGL', 'META', 'TSLA', 'BRK-B', 'UNH', 'JPM',
    'V', 'JNJ', 'XOM', 'MA', 'PG', 'HD', 'CVX', 'LLY', 'ABBV', 'MRK',
    'AVGO', 'KO', 'PEP', 'COST', 'ADBE', 'WMT', 'TMO', 'BAC', 'MCD', 'CRM',
    'CSCO', 'ACN', 'PFE', 'LIN', 'ABT', 'DHR', 'NFLX', 'NKE', 'DIS', 'WFC',
    'ORCL', 'TXN', 'INTC', 'AMD', 'QCOM', 'INTU', 'IBM', 'CAT', 'BA', 'GS'
  ];

  // First get priority companies
  const priorityPlaceholders = topSymbols.map(() => '?').join(',');
  const priorityCompanies = database.prepare(`
    SELECT id, symbol, name, cik
    FROM companies
    WHERE cik IS NOT NULL AND is_active = 1 AND symbol IN (${priorityPlaceholders})
    ORDER BY symbol
  `).all(...topSymbols);

  if (limit > 0 && priorityCompanies.length >= limit) {
    return priorityCompanies.slice(0, limit);
  }

  // If we need more companies and no limit, get all
  if (limit === 0) {
    return database.prepare(`
      SELECT id, symbol, name, cik
      FROM companies
      WHERE cik IS NOT NULL AND is_active = 1
      ORDER BY symbol
    `).all();
  }

  // Get additional companies up to the limit
  const remaining = limit - priorityCompanies.length;
  const additionalCompanies = database.prepare(`
    SELECT id, symbol, name, cik
    FROM companies
    WHERE cik IS NOT NULL AND is_active = 1 AND symbol NOT IN (${priorityPlaceholders})
    ORDER BY symbol
    LIMIT ?
  `).all(...topSymbols, remaining);

  return [...priorityCompanies, ...additionalCompanies];
}

/**
 * Get Form 4 filings for a company from SEC submissions
 */
async function getForm4Filings(cik, days = 90) {
  const paddedCik = cik.toString().padStart(10, '0');
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

  const data = await fetchJson(url);
  if (!data) return [];

  const filings = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Get recent filings from the main array
  const recentFilings = data.filings?.recent;
  if (!recentFilings) return [];

  for (let i = 0; i < recentFilings.form.length; i++) {
    const form = recentFilings.form[i];
    if (form !== '4' && form !== '4/A') continue;

    const filingDate = new Date(recentFilings.filingDate[i]);
    if (filingDate < cutoffDate) continue;

    filings.push({
      accessionNumber: recentFilings.accessionNumber[i],
      filingDate: recentFilings.filingDate[i],
      primaryDocument: recentFilings.primaryDocument[i],
      form: form,
    });
  }

  return filings;
}

/**
 * Fetch and parse a single Form 4 filing
 */
async function fetchAndParseForm4(cik, filing) {
  // CIK should be numeric (not padded with zeros) for the SEC Archives URL
  const numericCik = parseInt(cik, 10);
  const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');

  // Always fetch index.json to find the raw XML file
  // The primaryDocument often points to xslF345X05/... which is XSLT-rendered HTML, not raw XML
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionNoDashes}/index.json`;
  const indexData = await fetchJson(indexUrl);

  if (!indexData?.directory?.item) return null;

  // Find the raw XML file - look for .xml files NOT in xsl directories
  const xmlFile = indexData.directory.item.find(f => {
    const name = f.name.toLowerCase();
    return name.endsWith('.xml') &&
           !name.includes('filingsummary') &&
           !name.startsWith('xsl') &&
           !f.name.includes('/');  // Skip files in subdirectories
  });

  if (!xmlFile) return null;

  const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accessionNoDashes}/${xmlFile.name}`;
  const xmlContent = await fetchXml(xmlUrl);
  if (!xmlContent) return null;

  try {
    const parsed = await form4Parser.parse(xmlContent);
    return parsed;
  } catch (error) {
    console.error(`  Error parsing Form 4 ${filing.accessionNumber}: ${error.message}`);
    return null;
  }
}

/**
 * Upsert an insider record
 */
function upsertInsider(companyId, ownerData) {
  if (!ownerData) return null;

  // Try to find existing insider by CIK
  let insider = null;
  if (ownerData.cik) {
    insider = database.prepare(`
      SELECT id FROM insiders WHERE company_id = ? AND cik = ?
    `).get(companyId, ownerData.cik);
  }

  if (insider) {
    // Update existing
    database.prepare(`
      UPDATE insiders SET
        name = COALESCE(?, name),
        title = COALESCE(?, title),
        is_officer = ?,
        is_director = ?,
        is_ten_percent_owner = ?
      WHERE id = ?
    `).run(
      ownerData.name,
      ownerData.officerTitle,
      ownerData.isOfficer ? 1 : 0,
      ownerData.isDirector ? 1 : 0,
      ownerData.isTenPercentOwner ? 1 : 0,
      insider.id
    );
    return insider.id;
  } else {
    // Insert new
    const result = database.prepare(`
      INSERT INTO insiders (company_id, cik, name, title, is_officer, is_director, is_ten_percent_owner, first_filing_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, date('now'))
    `).run(
      companyId,
      ownerData.cik,
      ownerData.name,
      ownerData.officerTitle,
      ownerData.isOfficer ? 1 : 0,
      ownerData.isDirector ? 1 : 0,
      ownerData.isTenPercentOwner ? 1 : 0
    );
    return result.lastInsertRowid;
  }
}

/**
 * Store a transaction
 */
function storeTransaction(companyId, insiderId, filing, tx) {
  try {
    const result = database.prepare(`
      INSERT OR IGNORE INTO insider_transactions (
        company_id, insider_id, accession_number, filing_date,
        transaction_date, transaction_code, transaction_type,
        shares_transacted, shares_owned_after, price_per_share, total_value,
        is_derivative, derivative_security, exercise_price, expiration_date, underlying_shares,
        acquisition_disposition, direct_indirect
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      insiderId,
      filing.accessionNumber,
      filing.filingDate,
      tx.transactionDate,
      tx.transactionCode,
      tx.transactionType,
      tx.shares,
      tx.sharesOwnedAfter,
      tx.pricePerShare,
      tx.totalValue,
      tx.isDerivative ? 1 : 0,
      tx.securityTitle,
      tx.conversionOrExercisePrice || tx.exercisePrice,
      tx.expirationDate,
      tx.underlyingShares,
      tx.acquisitionDisposition,
      tx.directIndirect
    );

    return result.changes > 0;
  } catch (error) {
    if (!error.message.includes('UNIQUE constraint')) {
      console.error('Error storing transaction:', error.message);
    }
    return false;
  }
}

/**
 * Calculate and store summary for a company
 */
function calculateAndStoreSummary(companyId, period = '3m') {
  const days = period === '3m' ? 90 : period === '1m' ? 30 : period === '6m' ? 180 : 90;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // Get all transactions in period
  const transactions = database.prepare(`
    SELECT
      t.*,
      i.name as insider_name,
      i.title as insider_title,
      i.is_officer,
      i.is_director,
      i.is_ten_percent_owner
    FROM insider_transactions t
    JOIN insiders i ON t.insider_id = i.id
    WHERE t.company_id = ?
      AND t.transaction_date >= ?
      AND t.transaction_type IN ('buy', 'sell')
      AND t.is_derivative = 0
    ORDER BY t.transaction_date DESC
  `).all(companyId, cutoffStr);

  // Separate buys and sells
  const buys = transactions.filter(t => t.transaction_type === 'buy');
  const sells = transactions.filter(t => t.transaction_type === 'sell');

  // Calculate metrics
  const buyCount = buys.length;
  const buyShares = buys.reduce((sum, t) => sum + (t.shares_transacted || 0), 0);
  const buyValue = buys.reduce((sum, t) => sum + (t.total_value || 0), 0);
  const uniqueBuyers = new Set(buys.map(t => t.insider_id)).size;

  const sellCount = sells.length;
  const sellShares = sells.reduce((sum, t) => sum + (t.shares_transacted || 0), 0);
  const sellValue = sells.reduce((sum, t) => sum + (t.total_value || 0), 0);
  const uniqueSellers = new Set(sells.map(t => t.insider_id)).size;

  const netShares = buyShares - sellShares;
  const netValue = buyValue - sellValue;

  // Calculate signal
  let score = 0;

  // CEO/CFO buying
  const ceoBuys = buys.filter(t => /\b(ceo|chief\s+executive)\b/i.test(t.insider_title || ''));
  const cfoBuys = buys.filter(t => /\b(cfo|chief\s+financial)\b/i.test(t.insider_title || ''));

  if (ceoBuys.length > 0) score += 15;
  if (cfoBuys.length > 0) score += 12;

  // Director buying
  score += buys.filter(t => t.is_director).length * 5;

  // Officer buying
  score += buys.filter(t => t.is_officer).length * 4;

  // Cluster bonus
  if (uniqueBuyers >= 3) score += 10;
  else if (uniqueBuyers >= 2) score += 5;

  // Large buy bonus
  if (buyValue >= 500000) score += 5;
  else if (buyValue >= 100000) score += 3;

  // Selling penalties
  const ceoSells = sells.filter(t => /\b(ceo|chief\s+executive)\b/i.test(t.insider_title || ''));
  const cfoSells = sells.filter(t => /\b(cfo|chief\s+financial)\b/i.test(t.insider_title || ''));

  if (ceoSells.length > 0) score -= 5;
  if (cfoSells.length > 0) score -= 4;

  // Determine signal
  let signal, strength;
  if (score >= 15) { signal = 'bullish'; strength = 5; }
  else if (score >= 10) { signal = 'bullish'; strength = 4; }
  else if (score >= 5) { signal = 'bullish'; strength = 3; }
  else if (score >= 1) { signal = 'neutral'; strength = 2; }
  else if (score <= -5) { signal = 'bearish'; strength = 3; }
  else if (score < 0) { signal = 'bearish'; strength = 2; }
  else { signal = 'neutral'; strength = 1; }

  // Store summary
  database.prepare(`
    INSERT OR REPLACE INTO insider_activity_summary (
      company_id, period,
      buy_count, buy_shares, buy_value, unique_buyers,
      sell_count, sell_shares, sell_value, unique_sellers,
      net_shares, net_value,
      insider_signal, signal_strength, signal_score,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    companyId,
    period,
    buyCount,
    buyShares,
    buyValue,
    uniqueBuyers,
    sellCount,
    sellShares,
    sellValue,
    uniqueSellers,
    netShares,
    netValue,
    signal,
    strength,
    score
  );

  return { buyCount, sellCount, signal, score };
}

/**
 * Main import function
 * @param {number} days - Number of days to look back
 * @param {number} limit - Maximum number of companies to process (0 = all)
 */
async function importInsiderData(days = 90, limit = 50) {
  console.log(`\n📊 Starting Insider Trading Data Import (last ${days} days)`);
  if (limit > 0) {
    console.log(`   Limited to ${limit} companies (prioritizing major stocks)`);
  }
  console.log('='.repeat(60));

  const companies = getCompaniesWithCIK(limit);
  console.log(`Found ${companies.length} companies with CIK numbers\n`);

  let totalFilings = 0;
  let totalTransactions = 0;
  let companiesProcessed = 0;
  let companiesWithData = 0;

  for (const company of companies) {
    companiesProcessed++;
    process.stdout.write(`[${companiesProcessed}/${companies.length}] ${company.symbol.padEnd(6)} `);

    try {
      // Get Form 4 filings
      const filings = await getForm4Filings(company.cik, days);

      if (filings.length === 0) {
        console.log('- No Form 4 filings');
        continue;
      }

      let companyTransactions = 0;

      for (const filing of filings) {
        try {
          const parsed = await fetchAndParseForm4(company.cik, filing);
          if (!parsed) continue;

          totalFilings++;

          // Process owners
          const owners = Array.isArray(parsed.owner) ? parsed.owner : [parsed.owner];

          for (const ownerData of owners) {
            if (!ownerData) continue;

            const insiderId = upsertInsider(company.id, ownerData);
            if (!insiderId) continue;

            // Store transactions
            for (const tx of parsed.transactions) {
              if (tx.isHolding) continue;

              const stored = storeTransaction(company.id, insiderId, filing, tx);
              if (stored) {
                totalTransactions++;
                companyTransactions++;
              }
            }
          }
        } catch (error) {
          // Skip individual filing errors
        }
      }

      if (companyTransactions > 0) {
        companiesWithData++;
        // Calculate summaries
        calculateAndStoreSummary(company.id, '1m');
        calculateAndStoreSummary(company.id, '3m');
        calculateAndStoreSummary(company.id, '6m');
      }

      console.log(`- ${filings.length} filings, ${companyTransactions} transactions`);

    } catch (error) {
      console.log(`- Error: ${error.message}`);
    }

    // Add small delay between companies
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Import Complete!');
  console.log(`   Companies processed: ${companiesProcessed}`);
  console.log(`   Companies with data: ${companiesWithData}`);
  console.log(`   Total filings: ${totalFilings}`);
  console.log(`   Total transactions: ${totalTransactions}`);

  // Show summary stats
  const stats = database.prepare(`
    SELECT
      COUNT(DISTINCT company_id) as companies,
      COUNT(DISTINCT insider_id) as insiders,
      COUNT(*) as transactions,
      SUM(CASE WHEN transaction_type = 'buy' THEN 1 ELSE 0 END) as buys,
      SUM(CASE WHEN transaction_type = 'sell' THEN 1 ELSE 0 END) as sells,
      SUM(CASE WHEN transaction_type = 'buy' THEN total_value ELSE 0 END) as buy_value,
      SUM(CASE WHEN transaction_type = 'sell' THEN total_value ELSE 0 END) as sell_value
    FROM insider_transactions
  `).get();

  console.log('\n📈 Database Stats:');
  console.log(`   Companies: ${stats.companies}`);
  console.log(`   Insiders: ${stats.insiders}`);
  console.log(`   Transactions: ${stats.transactions}`);
  console.log(`   Buys: ${stats.buys} ($${(stats.buy_value / 1e6).toFixed(1)}M)`);
  console.log(`   Sells: ${stats.sells} ($${(stats.sell_value / 1e6).toFixed(1)}M)`);

  // Show signal distribution
  const signals = database.prepare(`
    SELECT insider_signal, COUNT(*) as count
    FROM insider_activity_summary
    WHERE period = '3m'
    GROUP BY insider_signal
  `).all();

  console.log('\n🎯 Signal Distribution (3m):');
  signals.forEach(s => {
    console.log(`   ${s.insider_signal}: ${s.count}`);
  });
}

// Run the import
// Usage: node import-insider-data.js [days] [limit]
// days: Number of days to look back (default: 90)
// limit: Max companies to process (default: 50, 0 = all)
const days = parseInt(process.argv[2]) || 90;
const limit = parseInt(process.argv[3]) || 50;
importInsiderData(days, limit)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
