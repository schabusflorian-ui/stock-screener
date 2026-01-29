// GLEIF API Batch Lookup for Unknown Entities
const Database = require('better-sqlite3');
const https = require('https');

const db = new Database('/Users/florianschabus/Investment Project/data/stocks.db');

// Get companies with Unknown names that have LEIs
const unknownCompanies = db.prepare(`
  SELECT id, lei, legal_name, country
  FROM company_identifiers 
  WHERE legal_name LIKE 'Unknown%' 
    AND lei IS NOT NULL 
    AND lei != ''
  ORDER BY country
  LIMIT 200
`).all();

console.log(`Found ${unknownCompanies.length} companies with Unknown names to lookup`);

const updateStmt = db.prepare(`
  UPDATE company_identifiers 
  SET legal_name = ?, jurisdiction = ?
  WHERE id = ?
`);

function fetchLEI(lei) {
  return new Promise((resolve, reject) => {
    const url = `https://api.gleif.org/api/v1/lei-records/${lei}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data);
            resolve(json);
          } else if (res.statusCode === 404) {
            resolve(null);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  
  for (let i = 0; i < unknownCompanies.length; i++) {
    const company = unknownCompanies[i];
    
    try {
      const result = await fetchLEI(company.lei);
      
      if (result && result.data && result.data.attributes) {
        const attrs = result.data.attributes;
        const entity = attrs.entity;
        const legalName = entity?.legalName?.name;
        const jurisdiction = entity?.jurisdiction;
        
        if (legalName && legalName !== company.legal_name) {
          updateStmt.run(legalName, jurisdiction || null, company.id);
          updated++;
          console.log(`[${i+1}/${unknownCompanies.length}] ${company.country}: ${legalName}`);
        } else {
          console.log(`[${i+1}/${unknownCompanies.length}] ${company.country}: No name change for ${company.lei}`);
        }
      } else {
        notFound++;
        console.log(`[${i+1}/${unknownCompanies.length}] ${company.country}: LEI not found: ${company.lei}`);
      }
      
      // Rate limit - 100ms between requests
      await sleep(100);
      
    } catch (err) {
      errors++;
      console.error(`[${i+1}/${unknownCompanies.length}] Error for ${company.lei}: ${err.message}`);
      await sleep(500);
    }
    
    // Progress every 50
    if ((i + 1) % 50 === 0) {
      console.log(`\n--- Progress: ${i+1}/${unknownCompanies.length} | Updated: ${updated} | Not found: ${notFound} | Errors: ${errors} ---\n`);
    }
  }
  
  console.log(`\n=== Final Results ===`);
  console.log(`Processed: ${unknownCompanies.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  
  // Show remaining Unknown count
  const remaining = db.prepare(`SELECT COUNT(*) as cnt FROM company_identifiers WHERE legal_name LIKE 'Unknown%'`).get();
  console.log(`\nRemaining Unknown entities: ${remaining.cnt}`);
  
  db.close();
}

main().catch(console.error);
