// enrich-ipo-data.js
// Script to enrich IPO data with detailed information from SEC filings

const https = require('https');
const db = require('./src/database');
const { IPOTracker } = require('./src/services/ipoTracker');

const database = db.getDatabase();
const ipoTracker = new IPOTracker(database, 'Stock Analyzer contact@example.com');

// Rate limiting
let lastRequestTime = 0;
const REQUEST_DELAY = 120;

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
 * Fetch company info from SEC submissions API
 */
async function fetchCompanyInfo(cik) {
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
 * Map SIC code to sector/industry
 */
function mapSICToSector(sicCode) {
  const sic = parseInt(sicCode);
  if (!sic) return { sector: null, industry: null };

  // SIC code ranges to sectors
  if (sic >= 100 && sic < 1000) return { sector: 'Agriculture', industry: 'Agriculture, Forestry, Fishing' };
  if (sic >= 1000 && sic < 1500) return { sector: 'Mining', industry: 'Mining & Extraction' };
  if (sic >= 1500 && sic < 1800) return { sector: 'Construction', industry: 'Construction' };
  if (sic >= 2000 && sic < 4000) return { sector: 'Manufacturing', industry: mapManufacturingIndustry(sic) };
  if (sic >= 4000 && sic < 5000) return { sector: 'Transportation & Utilities', industry: mapTransportIndustry(sic) };
  if (sic >= 5000 && sic < 5200) return { sector: 'Wholesale Trade', industry: 'Wholesale Trade' };
  if (sic >= 5200 && sic < 6000) return { sector: 'Retail Trade', industry: 'Retail Trade' };
  if (sic >= 6000 && sic < 6800) return { sector: 'Finance', industry: mapFinanceIndustry(sic) };
  if (sic >= 7000 && sic < 9000) return { sector: 'Services', industry: mapServicesIndustry(sic) };
  if (sic >= 9000) return { sector: 'Public Administration', industry: 'Government' };

  return { sector: 'Other', industry: 'Other' };
}

function mapManufacturingIndustry(sic) {
  if (sic >= 2800 && sic < 2900) return 'Chemicals & Pharmaceuticals';
  if (sic >= 3500 && sic < 3600) return 'Industrial Machinery';
  if (sic >= 3570 && sic < 3580) return 'Computer Equipment';
  if (sic >= 3600 && sic < 3700) return 'Electronics & Electrical';
  if (sic >= 3670 && sic < 3680) return 'Semiconductors';
  if (sic >= 3700 && sic < 3800) return 'Transportation Equipment';
  if (sic >= 3800 && sic < 3900) return 'Instruments & Medical Devices';
  return 'Manufacturing';
}

function mapTransportIndustry(sic) {
  if (sic >= 4800 && sic < 4900) return 'Communications & Telecom';
  if (sic >= 4900 && sic < 5000) return 'Utilities';
  return 'Transportation';
}

function mapFinanceIndustry(sic) {
  if (sic >= 6000 && sic < 6100) return 'Banking';
  if (sic >= 6200 && sic < 6300) return 'Securities & Investment';
  if (sic >= 6300 && sic < 6400) return 'Insurance';
  if (sic >= 6500 && sic < 6600) return 'Real Estate';
  if (sic >= 6700 && sic < 6800) return 'Investment Funds';
  return 'Financial Services';
}

function mapServicesIndustry(sic) {
  if (sic >= 7370 && sic < 7380) return 'Software & IT Services';
  if (sic >= 7300 && sic < 7400) return 'Business Services';
  if (sic >= 8000 && sic < 8100) return 'Healthcare Services';
  if (sic >= 8700 && sic < 8800) return 'Engineering & R&D';
  return 'Services';
}

/**
 * Get filing index to find main document
 */
async function getFilingIndex(cik, accessionNumber) {
  try {
    const paddedCik = cik.toString().padStart(10, '0');
    const accessionClean = accessionNumber.replace(/-/g, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionClean}/index.json`;
    const data = await fetchText(url);
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Fetch and parse S-1 document for detailed info
 */
async function parseS1Document(cik, accessionNumber) {
  const result = {
    ticker: null,
    exchange: null,
    priceRangeLow: null,
    priceRangeHigh: null,
    sharesOffered: null,
    leadUnderwriters: null,
    businessDescription: null,
    headquarters: null,
    website: null
  };

  try {
    const index = await getFilingIndex(cik, accessionNumber);
    if (!index?.directory?.item) return result;

    // Find the main HTML document (usually the largest .htm file, not index)
    const items = index.directory.item;
    let mainDoc = items.find(item =>
      item.name.endsWith('.htm') &&
      !item.name.includes('index') &&
      !item.name.includes('FilingSummary') &&
      !item.name.startsWith('R')
    );

    if (!mainDoc) {
      mainDoc = items.find(item => item.name.endsWith('.htm') && !item.name.includes('index'));
    }

    if (!mainDoc) return result;

    // Fetch the document
    const paddedCik = cik.toString().padStart(10, '0');
    const accessionClean = accessionNumber.replace(/-/g, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${paddedCik}/${accessionClean}/${mainDoc.name}`;

    const content = await fetchText(url);
    if (!content) return result;

    // Extract data using patterns
    result.ticker = extractTicker(content);
    result.exchange = extractExchange(content);
    const pricing = extractPricing(content);
    result.priceRangeLow = pricing.low;
    result.priceRangeHigh = pricing.high;
    result.sharesOffered = pricing.shares;
    result.leadUnderwriters = extractUnderwriters(content);
    result.businessDescription = extractBusinessDescription(content);
    result.headquarters = extractHeadquarters(content);
    result.website = extractWebsite(content);

  } catch (error) {
    // Silent fail - return partial results
  }

  return result;
}

/**
 * Extract proposed ticker symbol
 */
function extractTicker(content) {
  const patterns = [
    /symbol\s*[:\-"']?\s*["\']?([A-Z]{1,5})["\']?\s*(?:on|for|at)/i,
    /proposed\s+(?:ticker|trading)\s+symbol[:\s]*["\']?([A-Z]{1,5})["\']?/i,
    /list(?:ed|ing)\s+(?:under\s+the\s+symbol|our\s+common\s+stock\s+on)[:\s]*["\']?([A-Z]{1,5})["\']?/i,
    /(?:NASDAQ|NYSE|NYSE\s*American)[:\s]+["\']?([A-Z]{1,5})["\']?/i,
    /trade\s+(?:on|under)\s+(?:the\s+)?(?:NASDAQ|NYSE)[^"]*["\']([A-Z]{1,5})["\']?/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1].length >= 1 && match[1].length <= 5) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

/**
 * Extract proposed exchange
 */
function extractExchange(content) {
  const upperContent = content.toUpperCase();

  if (upperContent.includes('NASDAQ GLOBAL SELECT')) return 'NASDAQ';
  if (upperContent.includes('NASDAQ GLOBAL MARKET')) return 'NASDAQ';
  if (upperContent.includes('NASDAQ CAPITAL')) return 'NASDAQ';
  if (upperContent.includes('NASDAQ')) return 'NASDAQ';
  if (upperContent.includes('NEW YORK STOCK EXCHANGE') || upperContent.includes('NYSE')) return 'NYSE';
  if (upperContent.includes('NYSE AMERICAN') || upperContent.includes('NYSE MKT')) return 'NYSE MKT';

  return null;
}

/**
 * Extract price range and shares offered
 */
function extractPricing(content) {
  const result = { low: null, high: null, shares: null };

  // Price range: "$X.XX to $Y.YY per share" or "$X.XX and $Y.YY per share"
  const pricePatterns = [
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:to|and|-)\s*\$\s*(\d+(?:\.\d{1,2})?)\s*per\s*share/i,
    /between\s*\$\s*(\d+(?:\.\d{1,2})?)\s*and\s*\$\s*(\d+(?:\.\d{1,2})?)\s*per\s*share/i,
    /price\s*(?:range|of)\s*\$\s*(\d+(?:\.\d{1,2})?)\s*(?:to|-)\s*\$\s*(\d+(?:\.\d{1,2})?)/i
  ];

  for (const pattern of pricePatterns) {
    const match = content.match(pattern);
    if (match) {
      result.low = parseFloat(match[1]);
      result.high = parseFloat(match[2]);
      break;
    }
  }

  // Shares offered
  const sharesPatterns = [
    /(\d{1,3}(?:,\d{3})*)\s*shares\s*of\s*(?:our\s+)?(?:common\s+)?stock/i,
    /offering\s*(\d{1,3}(?:,\d{3})*)\s*shares/i,
    /(\d{1,3}(?:,\d{3})*)\s*shares\s*(?:are\s+)?(?:being\s+)?offered/i
  ];

  for (const pattern of sharesPatterns) {
    const match = content.match(pattern);
    if (match) {
      result.shares = parseInt(match[1].replace(/,/g, ''), 10);
      break;
    }
  }

  return result;
}

/**
 * Extract lead underwriters
 */
function extractUnderwriters(content) {
  const patterns = [
    /(?:joint\s+)?(?:book-running\s+)?(?:managing\s+)?underwriter[s]?[:\s]+([^<\n]{10,200})/i,
    /(Goldman\s+Sachs|Morgan\s+Stanley|J\.?P\.?\s*Morgan|Citigroup|BofA\s+Securities|Barclays|Credit\s+Suisse|Deutsche\s+Bank|UBS|Wells\s+Fargo|Jefferies)/gi
  ];

  // Try first pattern for explicit underwriter list
  const match = content.match(patterns[0]);
  if (match) {
    // Clean up the result
    let underwriters = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200);

    // Remove trailing partial text
    const endIdx = underwriters.search(/\.\s|Securities\s+Act|herein|prospectus/i);
    if (endIdx > 10) underwriters = underwriters.substring(0, endIdx);

    return underwriters;
  }

  // Try to find major bank names
  const bankMatches = content.match(patterns[1]);
  if (bankMatches && bankMatches.length > 0) {
    // Deduplicate
    const unique = [...new Set(bankMatches.map(b => b.trim()))];
    return unique.slice(0, 5).join(', ');
  }

  return null;
}

/**
 * Extract business description (first paragraph of "Business" section)
 */
function extractBusinessDescription(content) {
  // Look for business overview section
  const patterns = [
    /(?:overview|our\s+business|company\s+overview)[:\s]*(?:<[^>]+>)*\s*([^<]{50,500})/i,
    /(?:we\s+are\s+a|the\s+company\s+is\s+a|we\s+develop|we\s+provide|we\s+operate)\s+([^<\.]{30,300})/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let desc = match[1] || match[0];
      desc = desc
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      if (desc.length > 50) {
        return desc.substring(0, 500);
      }
    }
  }

  return null;
}

/**
 * Extract headquarters state
 */
function extractHeadquarters(content) {
  const states = ['CA', 'NY', 'TX', 'FL', 'MA', 'WA', 'IL', 'PA', 'NJ', 'GA', 'NC', 'VA', 'CO', 'AZ', 'MD', 'TN', 'OH', 'MN', 'MO', 'CT', 'UT', 'OR', 'NV', 'DE'];

  const patterns = [
    /(?:headquarters|principal\s+(?:executive\s+)?offices?|located)\s+(?:is|are)?\s*(?:in|at)\s+[^,]+,\s*([A-Z]{2})\b/i,
    /(?:headquartered|based)\s+in\s+[^,]+,\s*([A-Z]{2})\b/i,
    /address[:\s]+[^,]+,\s*[^,]+,\s*([A-Z]{2})\s+\d{5}/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && states.includes(match[1].toUpperCase())) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

/**
 * Extract company website
 */
function extractWebsite(content) {
  const patterns = [
    /(?:our\s+)?(?:corporate\s+)?website[:\s]+(?:is\s+)?(?:located\s+at\s+)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i,
    /(?:www\.)?([a-zA-Z0-9-]+\.com)/i
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      let website = match[1].toLowerCase();
      if (!website.startsWith('www.') && !website.startsWith('http')) {
        website = 'www.' + website;
      }
      // Skip common false positives
      if (website.includes('sec.gov') || website.includes('edgar') || website.includes('example')) {
        continue;
      }
      return website;
    }
  }

  return null;
}

/**
 * Main enrichment function
 */
async function enrichIPOs() {
  console.log('========================================');
  console.log('IPO Data Enrichment');
  console.log('========================================\n');

  const startTime = Date.now();

  // Get all IPOs that need enrichment (missing key fields)
  const ipos = database.prepare(`
    SELECT * FROM ipo_tracker
    WHERE is_active = 1
    ORDER BY initial_s1_date DESC
  `).all();

  console.log(`Found ${ipos.length} IPOs to enrich\n`);

  let enrichedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < ipos.length; i++) {
    const ipo = ipos[i];
    console.log(`[${i + 1}/${ipos.length}] Processing: ${ipo.company_name} (CIK: ${ipo.cik})`);

    try {
      const updates = {};

      // 1. Fetch company info from SEC API
      const companyInfo = await fetchCompanyInfo(ipo.cik);

      if (companyInfo) {
        // Get basic company data
        if (!ipo.ticker_proposed && companyInfo.tickers?.length > 0) {
          updates.ticker_proposed = companyInfo.tickers[0];
        }

        // Get sector/industry from SIC code
        if (!ipo.sector || !ipo.industry) {
          const sicCode = companyInfo.sic;
          if (sicCode) {
            const { sector, industry } = mapSICToSector(sicCode);
            if (!ipo.sector && sector) updates.sector = sector;
            if (!ipo.industry && industry) updates.industry = industry;
          }
        }

        // Get state from addresses
        if (!ipo.headquarters_state && companyInfo.addresses?.business?.stateOrCountry) {
          const state = companyInfo.addresses.business.stateOrCountry;
          if (state.length === 2) {
            updates.headquarters_state = state;
          }
        }

        // Get exchange
        if (!ipo.exchange_proposed && companyInfo.exchanges?.length > 0) {
          updates.exchange_proposed = companyInfo.exchanges[0];
        }
      }

      // 2. Find the latest S-1 filing and parse it for detailed info
      const latestFiling = database.prepare(`
        SELECT accession_number FROM ipo_filings
        WHERE ipo_id = ? AND (form_type = 'S-1' OR form_type = 'S-1/A' OR form_type = 'F-1' OR form_type = 'F-1/A')
        ORDER BY filing_date DESC
        LIMIT 1
      `).get(ipo.id);

      if (latestFiling) {
        console.log(`   Parsing latest filing: ${latestFiling.accession_number}`);
        const s1Data = await parseS1Document(ipo.cik, latestFiling.accession_number);

        if (s1Data.ticker && !ipo.ticker_proposed && !updates.ticker_proposed) {
          updates.ticker_proposed = s1Data.ticker;
        }

        if (s1Data.exchange && !ipo.exchange_proposed && !updates.exchange_proposed) {
          updates.exchange_proposed = s1Data.exchange;
        }

        if (s1Data.priceRangeLow && !ipo.price_range_low) {
          updates.price_range_low = s1Data.priceRangeLow;
          updates.price_range_high = s1Data.priceRangeHigh;

          // Update status if we found price range
          if (ipo.status === 'S1_FILED' || ipo.status === 'S1_AMENDED') {
            updates.status = 'PRICE_RANGE_SET';
          }
        }

        if (s1Data.sharesOffered && !ipo.shares_offered) {
          updates.shares_offered = s1Data.sharesOffered;

          // Calculate deal size if we have price and shares
          const priceHigh = updates.price_range_high || ipo.price_range_high;
          const priceLow = updates.price_range_low || ipo.price_range_low;
          if (priceHigh && priceLow) {
            const midPrice = (priceHigh + priceLow) / 2;
            updates.deal_size = midPrice * s1Data.sharesOffered;
          }
        }

        if (s1Data.leadUnderwriters && !ipo.lead_underwriters) {
          updates.lead_underwriters = s1Data.leadUnderwriters;
        }

        if (s1Data.businessDescription && !ipo.business_description) {
          updates.business_description = s1Data.businessDescription;
        }

        if (s1Data.headquarters && !ipo.headquarters_state && !updates.headquarters_state) {
          updates.headquarters_state = s1Data.headquarters;
        }

        if (s1Data.website && !ipo.website) {
          updates.website = s1Data.website;
        }
      }

      // 3. Apply updates if any
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        ipoTracker.updateIPO(ipo.id, updates);
        enrichedCount++;
        console.log(`   Updated: ${Object.keys(updates).join(', ')}`);
      } else {
        console.log(`   No new data found`);
      }

    } catch (error) {
      console.error(`   Error: ${error.message}`);
      errorCount++;
    }

    // Progress indicator
    if ((i + 1) % 10 === 0) {
      console.log(`\n   Progress: ${i + 1}/${ipos.length} processed, ${enrichedCount} enriched\n`);
    }
  }

  // Print summary
  const stats = ipoTracker.getStatistics();

  console.log('\n========================================');
  console.log('Enrichment Complete!');
  console.log('========================================');
  console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`);
  console.log(`\nResults:`);
  console.log(`  IPOs processed: ${ipos.length}`);
  console.log(`  IPOs enriched: ${enrichedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`\nDatabase status:`);
  console.log(`  Total active: ${stats.total_active}`);
  console.log(`  With price range: ${stats.price_set || 0}`);
  console.log(`  Priced: ${stats.priced || 0}`);

  // Show sample of enriched data
  const sample = database.prepare(`
    SELECT company_name, ticker_proposed, exchange_proposed, sector, industry,
           price_range_low, price_range_high, shares_offered, deal_size, headquarters_state
    FROM ipo_tracker
    WHERE is_active = 1 AND (ticker_proposed IS NOT NULL OR sector IS NOT NULL)
    LIMIT 5
  `).all();

  if (sample.length > 0) {
    console.log('\nSample enriched IPOs:');
    for (const s of sample) {
      console.log(`  ${s.ticker_proposed || '???'} - ${s.company_name}`);
      console.log(`    Sector: ${s.sector || 'N/A'}, Industry: ${s.industry || 'N/A'}`);
      console.log(`    Exchange: ${s.exchange_proposed || 'N/A'}, State: ${s.headquarters_state || 'N/A'}`);
      if (s.price_range_low) {
        console.log(`    Price: $${s.price_range_low}-$${s.price_range_high}, Shares: ${s.shares_offered?.toLocaleString() || 'N/A'}`);
      }
      console.log('');
    }
  }
}

// Run enrichment
enrichIPOs().then(() => {
  console.log('Done!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
