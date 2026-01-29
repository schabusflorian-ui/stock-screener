// import-ipo-history.js
// Script to import IPO filings from the last 6 months using SEC RSS feeds

const https = require('https');
const db = require('./src/database');
const { IPOTracker } = require('./src/services/ipoTracker');

const database = db.getDatabase();
const ipoTracker = new IPOTracker(database, 'Stock Analyzer contact@example.com');

// Rate limiting
let lastRequestTime = 0;
const REQUEST_DELAY = 120; // 120ms between requests (slightly under 10/sec limit)

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_DELAY) {
    await new Promise(r => setTimeout(r, REQUEST_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchText(url) {
  await rateLimit();

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Stock Analyzer contact@example.com',
        'Accept': '*/*'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else if (res.statusCode === 301 || res.statusCode === 302) {
          // Follow redirect
          fetchText(res.headers.location).then(resolve).catch(reject);
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

/**
 * Parse SEC Atom feed
 */
function parseAtomFeed(xml, formType) {
  const filings = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const titleRegex = /<title[^>]*>([^<]+)<\/title>/;
  const linkRegex = /<link[^>]*href="([^"]+)"/;
  const updatedRegex = /<updated>([^<]+)<\/updated>/;
  const idRegex = /<id>([^<]+)<\/id>/;

  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    try {
      const title = (titleRegex.exec(entry) || [])[1] || '';
      const link = (linkRegex.exec(entry) || [])[1] || '';
      const updated = (updatedRegex.exec(entry) || [])[1] || '';
      const id = (idRegex.exec(entry) || [])[1] || '';

      // Extract CIK from title - format: "Form Type - Company Name (CIK)"
      const cikMatch = title.match(/\((\d{10})\)/);
      const cik = cikMatch ? cikMatch[1].replace(/^0+/, '') : null;

      // Extract company name
      const nameMatch = title.match(/^\s*[\w\/-]+\s*-\s*(.+?)\s*\(\d{10}\)/);
      const companyName = nameMatch ? nameMatch[1].trim() : 'Unknown';

      // Extract accession number from id
      const accessionMatch = id.match(/accession-number=(\d{10}-\d{2}-\d{6})/);
      const accessionNumber = accessionMatch ? accessionMatch[1] : null;

      // Parse filing date
      const filingDate = updated ? updated.split('T')[0] : null;

      if (cik && accessionNumber && filingDate) {
        filings.push({
          cik,
          companyName,
          formType,
          accessionNumber,
          filingDate,
          filingUrl: link
        });
      }
    } catch (e) {
      // Skip malformed entries
    }
  }

  return filings;
}

/**
 * Fetch filings from RSS feed
 * The RSS feed returns most recent filings (limited by count parameter)
 */
async function fetchFilingsFromRSS(formType, count = 100) {
  console.log(`  Fetching ${formType} filings (max ${count})...`);

  try {
    const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(formType)}&company=&dateb=&owner=include&count=${count}&output=atom`;
    const xml = await fetchText(url);
    const filings = parseAtomFeed(xml, formType);
    console.log(`    Found ${filings.length} ${formType} filings`);
    return filings;
  } catch (error) {
    console.error(`    Error fetching ${formType}: ${error.message}`);
    return [];
  }
}

/**
 * Fetch company submissions to get older filings
 */
async function fetchCompanySubmissions(cik) {
  try {
    const paddedCik = cik.toString().padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
    const data = await fetchText(url);
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Process S-1 filings
 */
async function processS1Filings(filings) {
  console.log(`\nProcessing ${filings.length} registration filings...`);

  let newCount = 0;
  let skipCount = 0;

  for (const filing of filings) {
    if (!filing.cik) {
      skipCount++;
      continue;
    }

    const existing = ipoTracker.getIPOByCIK(filing.cik);
    if (existing) {
      skipCount++;
      continue;
    }

    try {
      const ipo = ipoTracker.createIPO({
        cik: filing.cik,
        company_name: filing.companyName,
        initial_s1_date: filing.filingDate,
        status: 'S1_FILED'
      });

      ipoTracker.createIPOFiling({
        ipo_id: ipo.id,
        form_type: filing.formType,
        accession_number: filing.accessionNumber,
        filing_date: filing.filingDate,
        filing_url: filing.filingUrl
      });

      newCount++;
    } catch (error) {
      // Skip duplicates
    }
  }

  console.log(`  Created ${newCount} new IPOs, skipped ${skipCount}`);
  return newCount;
}

/**
 * Process amendments
 */
async function processAmendments(filings) {
  console.log(`\nProcessing ${filings.length} amendments...`);

  let updateCount = 0;
  let skipCount = 0;

  for (const filing of filings) {
    if (!filing.cik) {
      skipCount++;
      continue;
    }

    const ipo = ipoTracker.getIPOByCIK(filing.cik);
    if (!ipo) {
      skipCount++;
      continue;
    }

    const existingFiling = ipoTracker.getFilingByAccession(filing.accessionNumber);
    if (existingFiling) {
      skipCount++;
      continue;
    }

    try {
      const newAmendmentDate = filing.filingDate > (ipo.latest_amendment_date || '')
        ? filing.filingDate : ipo.latest_amendment_date;

      ipoTracker.updateIPO(ipo.id, {
        latest_amendment_date: newAmendmentDate,
        amendment_count: ipo.amendment_count + 1,
        status: ipo.status === 'S1_FILED' ? 'S1_AMENDED' : ipo.status
      });

      ipoTracker.createIPOFiling({
        ipo_id: ipo.id,
        form_type: filing.formType,
        accession_number: filing.accessionNumber,
        filing_date: filing.filingDate,
        filing_url: filing.filingUrl,
        is_amendment: 1,
        amendment_number: ipo.amendment_count + 1
      });

      updateCount++;
    } catch (error) {
      // Skip errors
    }
  }

  console.log(`  Updated ${updateCount} IPOs, skipped ${skipCount}`);
  return updateCount;
}

/**
 * Process pricing filings
 */
async function processPricingFilings(filings) {
  console.log(`\nProcessing ${filings.length} pricing prospectuses...`);

  let updateCount = 0;

  for (const filing of filings) {
    if (!filing.cik) continue;

    const ipo = ipoTracker.getIPOByCIK(filing.cik);
    if (!ipo) continue;

    const existingFiling = ipoTracker.getFilingByAccession(filing.accessionNumber);
    if (existingFiling) continue;

    try {
      if (ipo.status !== 'TRADING') {
        ipoTracker.updateIPO(ipo.id, {
          pricing_date: filing.filingDate,
          status: 'PRICED'
        });
      }

      ipoTracker.createIPOFiling({
        ipo_id: ipo.id,
        form_type: filing.formType,
        accession_number: filing.accessionNumber,
        filing_date: filing.filingDate,
        filing_url: filing.filingUrl
      });

      updateCount++;
    } catch (error) {
      // Skip
    }
  }

  console.log(`  Updated ${updateCount} IPOs to PRICED`);
  return updateCount;
}

/**
 * Process EFFECT notices
 */
async function processEffectiveFilings(filings) {
  console.log(`\nProcessing ${filings.length} EFFECT notices...`);

  let updateCount = 0;

  for (const filing of filings) {
    if (!filing.cik) continue;

    const ipo = ipoTracker.getIPOByCIK(filing.cik);
    if (!ipo) continue;

    const existingFiling = ipoTracker.getFilingByAccession(filing.accessionNumber);
    if (existingFiling) continue;

    try {
      if (ipo.status !== 'PRICED' && ipo.status !== 'TRADING') {
        ipoTracker.updateIPO(ipo.id, {
          effective_date: filing.filingDate,
          status: 'EFFECTIVE'
        });
      } else {
        ipoTracker.updateIPO(ipo.id, { effective_date: filing.filingDate });
      }

      ipoTracker.createIPOFiling({
        ipo_id: ipo.id,
        form_type: 'EFFECT',
        accession_number: filing.accessionNumber,
        filing_date: filing.filingDate,
        filing_url: filing.filingUrl
      });

      updateCount++;
    } catch (error) {
      // Skip
    }
  }

  console.log(`  Updated ${updateCount} IPOs to EFFECTIVE`);
  return updateCount;
}

/**
 * For each IPO we found, fetch their full filing history to get historical amendments
 */
async function enrichIPOsWithHistory(monthsBack) {
  console.log(`\nEnriching IPOs with full filing history...`);

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const ipos = database.prepare(`SELECT * FROM ipo_tracker WHERE is_active = 1`).all();
  console.log(`  Checking ${ipos.length} IPOs for additional filings...`);

  let totalUpdates = 0;

  for (let i = 0; i < ipos.length; i++) {
    const ipo = ipos[i];

    if ((i + 1) % 20 === 0) {
      console.log(`    Progress: ${i + 1}/${ipos.length} IPOs checked, ${totalUpdates} updates...`);
    }

    try {
      const submissions = await fetchCompanySubmissions(ipo.cik);
      if (!submissions?.filings?.recent) continue;

      const recent = submissions.filings.recent;
      const forms = recent.form || [];
      const dates = recent.filingDate || [];
      const accessions = recent.accessionNumber || [];

      for (let j = 0; j < forms.length; j++) {
        const form = forms[j];
        const date = dates[j];
        const accession = accessions[j];

        // Skip if too old
        if (date < cutoffStr) continue;

        // Check if we already have this filing
        const existing = ipoTracker.getFilingByAccession(accession);
        if (existing) continue;

        // Process based on form type
        if (form === 'S-1/A' || form === 'F-1/A') {
          const newDate = date > (ipo.latest_amendment_date || '') ? date : ipo.latest_amendment_date;
          ipoTracker.updateIPO(ipo.id, {
            latest_amendment_date: newDate,
            amendment_count: ipo.amendment_count + 1,
            status: ipo.status === 'S1_FILED' ? 'S1_AMENDED' : ipo.status
          });

          ipoTracker.createIPOFiling({
            ipo_id: ipo.id,
            form_type: form,
            accession_number: accession,
            filing_date: date,
            filing_url: `https://www.sec.gov/Archives/edgar/data/${ipo.cik}/${accession.replace(/-/g, '')}/${accession}-index.htm`,
            is_amendment: 1,
            amendment_number: ipo.amendment_count + 1
          });

          ipo.amendment_count++;
          totalUpdates++;
        } else if (form.startsWith('424B')) {
          if (ipo.status !== 'TRADING' && ipo.status !== 'PRICED') {
            ipoTracker.updateIPO(ipo.id, { pricing_date: date, status: 'PRICED' });
            ipo.status = 'PRICED';
          }

          ipoTracker.createIPOFiling({
            ipo_id: ipo.id,
            form_type: form,
            accession_number: accession,
            filing_date: date,
            filing_url: `https://www.sec.gov/Archives/edgar/data/${ipo.cik}/${accession.replace(/-/g, '')}/${accession}-index.htm`
          });

          totalUpdates++;
        } else if (form === 'EFFECT') {
          if (ipo.status !== 'PRICED' && ipo.status !== 'TRADING') {
            ipoTracker.updateIPO(ipo.id, { effective_date: date, status: 'EFFECTIVE' });
            ipo.status = 'EFFECTIVE';
          } else {
            ipoTracker.updateIPO(ipo.id, { effective_date: date });
          }

          ipoTracker.createIPOFiling({
            ipo_id: ipo.id,
            form_type: 'EFFECT',
            accession_number: accession,
            filing_date: date,
            filing_url: `https://www.sec.gov/Archives/edgar/data/${ipo.cik}/${accession.replace(/-/g, '')}/${accession}-index.htm`
          });

          totalUpdates++;
        }
      }
    } catch (error) {
      // Skip this IPO on error
    }
  }

  console.log(`  Added ${totalUpdates} historical filings`);
  return totalUpdates;
}

/**
 * Main import function
 */
async function importIPOHistory(monthsBack = 6) {
  console.log('========================================');
  console.log(`IPO Historical Import - Last ${monthsBack} Months`);
  console.log('========================================\n');

  const startTime = Date.now();

  const results = {
    s1: 0,
    amendments: 0,
    pricing: 0,
    effective: 0,
    enriched: 0
  };

  try {
    // 1. Fetch from RSS feeds (most recent filings - max ~400 each type)
    // Note: RSS only returns recent filings but we'll enrich with company history later
    console.log('Step 1: Fetching from SEC RSS feeds...\n');

    const s1Filings = await fetchFilingsFromRSS('S-1', 400);
    const f1Filings = await fetchFilingsFromRSS('F-1', 100);
    results.s1 = await processS1Filings([...s1Filings, ...f1Filings]);

    const s1aFilings = await fetchFilingsFromRSS('S-1/A', 400);
    const f1aFilings = await fetchFilingsFromRSS('F-1/A', 100);
    results.amendments = await processAmendments([...s1aFilings, ...f1aFilings]);

    const pricingFilings = await fetchFilingsFromRSS('424B4', 200);
    results.pricing = await processPricingFilings(pricingFilings);

    const effectFilings = await fetchFilingsFromRSS('EFFECT', 200);
    results.effective = await processEffectiveFilings(effectFilings);

    // 2. Enrich each IPO with their full filing history
    console.log('\nStep 2: Enriching with company filing histories...');
    results.enriched = await enrichIPOsWithHistory(monthsBack);

  } catch (error) {
    console.error('\nError during import:', error.message);
  }

  // Log the import
  try {
    ipoTracker.logCheck('historical_import', results.s1,
      results.amendments + results.pricing + results.effective + results.enriched,
      null, Date.now() - startTime);
  } catch (e) {
    // Ignore logging errors
  }

  // Print summary
  const stats = ipoTracker.getStatistics();

  console.log('\n========================================');
  console.log('Import Complete!');
  console.log('========================================');
  console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`);
  console.log(`\nResults:`);
  console.log(`  New IPOs created: ${results.s1}`);
  console.log(`  Amendments processed: ${results.amendments}`);
  console.log(`  Pricing updates: ${results.pricing}`);
  console.log(`  Effective notices: ${results.effective}`);
  console.log(`  Historical filings added: ${results.enriched}`);
  console.log(`\nDatabase now contains:`);
  console.log(`  Total active IPOs: ${stats.total_active}`);
  console.log(`  Filed: ${stats.filed}`);
  console.log(`  Amended: ${stats.amended}`);
  console.log(`  Price Set: ${stats.price_set}`);
  console.log(`  Effective: ${stats.effective}`);
  console.log(`  Priced: ${stats.priced}`);
}

// Run the import
const monthsBack = parseInt(process.argv[2]) || 6;
importIPOHistory(monthsBack).then(() => {
  console.log('\nDone!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
