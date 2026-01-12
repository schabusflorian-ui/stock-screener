/**
 * Mark Untradeable Companies Script
 *
 * Identifies companies that are likely not publicly traded:
 * - Banks and financial institutions (subsidiaries, not main entity)
 * - Holding companies and SPVs
 * - Private companies
 * - Development agencies
 * - Cooperative societies
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Patterns that indicate non-tradeable entities
const NON_TRADEABLE_PATTERNS = [
  // Banks and financial services (subsidiaries)
  /MORGAN STANLEY.*INTERNATIONAL/i,
  /CREDIT SUISSE.*INTERNATIONAL/i,
  /BNP PARIBAS.*FORTIS/i,
  /BELFIUS BANK/i,
  /GRENKE FINANCE/i,
  /DEUTSCHE BANK.*TRUST/i,
  /GOLDMAN SACHS.*INTERNATIONAL/i,
  /JP MORGAN.*INTERNATIONAL/i,
  /BARCLAYS.*INTERNATIONAL/i,
  /HSBC.*FRANCE/i,
  /CITIBANK.*EUROPE/i,
  /COMMERZBANK.*INTERNATIONAL/i,
  /UBS.*INTERNATIONAL/i,
  /NOMURA.*INTERNATIONAL/i,

  // Development agencies and government entities
  /AGENCE.*DEVELOPPEMENT/i,
  /CAISSE.*DEPOTS/i,
  /BANQUE.*FEDERATIVE/i,
  /CAISSE.*NATIONALE/i,
  /BANQUE FEDERATIVE/i,

  // Holding patterns (generic)
  /FINANCE.*INTERNATIONAL.*B\.?V\.?/i,
  /FINANCE.*PUBLIC.*LIMITED/i,
  /HOLDING.*LLC/i,
  /^LLC /i,
  /CAPITAL.*HOLDING.*S\.?A\.?$/i,

  // Investment vehicles and SPVs
  /ACQUISITION.*B\.?V\.?/i,
  /TRANSITION.*CAPITAL.*ACQUISITION/i,
  /CLIMATE.*TRANSITION.*CAPITAL/i,

  // Private trading companies
  /LOUIS DREYFUS.*COMPANY/i,
  /WURTH FINANCE/i,
  /SOFISA/i,

  // Cooperatives (often not publicly traded)
  /COÖPERATIEF.*U\.?A\.?/i,
  /SCOOP$/i,
  /EROSKI.*SCOOP/i,
];

// Companies to explicitly mark as no_symbol
const EXPLICIT_NO_SYMBOL = [
  'IMC S.A.',
  'MORGAN STANLEY & CO. INTERNATIONAL PLC',
  'CREDIT SUISSE INTERNATIONAL',
  'Würth Finance International B.V.',
  'LOUIS DREYFUS COMPANY LLC',
  'BELFIUS BANK SA NV',
  'BNP Paribas Fortis',
  'SOCIÉTÉ ELECTRIQUE DE L\'OUR',
  'SOFISA SA',
  'GRENKE FINANCE PUBLIC LIMITED COMPANY',
  'AGENCE FRANCAISE DE DEVELOPPEMENT',
  'BANQUE FEDERATIVE DU CREDIT MUTUEL',
  'Deutsche Bank Trust Company Americas',
  '"CASSA DEPOSITI E PRESTITI SOCIETA\' PER AZIONI"',
  'CASSA DEPOSITI E PRESTITI',
];

// Get pending companies
const pending = db.prepare(`
  SELECT id, legal_name, country
  FROM company_identifiers
  WHERE link_status = 'pending'
`).all();

console.log(`Found ${pending.length} pending companies`);

const markNoSymbol = db.prepare(`
  UPDATE company_identifiers
  SET link_status = 'no_symbol'
  WHERE id = ?
`);

let marked = 0;

for (const company of pending) {
  let shouldMark = false;

  // Check explicit list
  for (const explicit of EXPLICIT_NO_SYMBOL) {
    if (company.legal_name.includes(explicit) || explicit.includes(company.legal_name)) {
      shouldMark = true;
      break;
    }
  }

  // Check patterns
  if (!shouldMark) {
    for (const pattern of NON_TRADEABLE_PATTERNS) {
      if (pattern.test(company.legal_name)) {
        shouldMark = true;
        break;
      }
    }
  }

  if (shouldMark) {
    markNoSymbol.run(company.id);
    console.log(`✗ Marked no_symbol: ${company.legal_name.substring(0, 60)} (${company.country})`);
    marked++;
  }
}

console.log(`\nMarked ${marked} companies as no_symbol`);

// Show updated stats
const stats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM company_identifiers WHERE ticker IS NOT NULL AND ticker != '') as with_ticker,
    (SELECT COUNT(*) FROM company_identifiers WHERE link_status = 'pending') as pending,
    (SELECT COUNT(*) FROM company_identifiers WHERE link_status = 'no_symbol') as no_symbol
`).get();

console.log(`\n=== Database Status ===`);
console.log(`With ticker: ${stats.with_ticker}`);
console.log(`Pending: ${stats.pending}`);
console.log(`No symbol: ${stats.no_symbol}`);

db.close();
