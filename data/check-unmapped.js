const Database = require('better-sqlite3');
const db = new Database('/Users/florianschabus/Investment Project/data/stocks.db');

// Get companies with names that still need tickers
const rows = db.prepare(`
  SELECT country, legal_name 
  FROM company_identifiers 
  WHERE ticker IS NULL 
    AND legal_name NOT LIKE 'Unknown%' 
  ORDER BY country, legal_name
  LIMIT 150
`).all();

let current = "";
rows.forEach(r => {
  if (r.country !== current) {
    console.log(`\n=== ${r.country} ===`);
    current = r.country;
  }
  console.log(r.legal_name);
});
