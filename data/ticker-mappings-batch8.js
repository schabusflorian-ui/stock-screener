/**
 * Ticker Mappings Batch 8 - Additional Polish Companies
 *
 * More Polish companies from GPW and NewConnect
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Additional Polish company mappings
const ADDITIONAL_POLISH = {
  // Energy and Utilities
  'COLUMBUS ENERGY': { ticker: 'CLC', yahoo: 'CLC.WA' },
  'POLENERGIA': { ticker: 'PEP', yahoo: 'PEP.WA' },

  // Waste Management and Environment
  'MO-BRUK': { ticker: 'MBR', yahoo: 'MBR.WA' },

  // Tech and Gaming
  'XTPL': { ticker: 'XTP', yahoo: 'XTP.WA' },
  'SHOPER': { ticker: 'SHO', yahoo: 'SHO.WA' },
  'GAMING FACTORY': { ticker: 'GFY', yahoo: 'GFY.WA' },
  'MOVIE GAMES': { ticker: 'MOV', yahoo: 'MOV.WA' },
  'DIGITAL NETWORK': { ticker: 'DGN', yahoo: 'DGN.WA' },
  'CREEPY JAR': { ticker: 'CRJ', yahoo: 'CRJ.WA' },

  // Real Estate
  'POLSKI HOLDING NIERUCHOMOŚCI': { ticker: 'PHN', yahoo: 'PHN.WA' },
  'BBI DEVELOPMENT': { ticker: 'BBI', yahoo: 'BBI.WA' },
  'REINO CAPITAL': { ticker: 'REI', yahoo: 'REI.WA' },
  'ED INVEST': { ticker: 'EDI', yahoo: 'EDI.WA' },

  // Manufacturing
  'WOJAS': { ticker: 'WOJ', yahoo: 'WOJ.WA' },
  'FERRUM': { ticker: 'FER', yahoo: 'FER.WA' },
  'OTMUCHÓW': { ticker: 'OTM', yahoo: 'OTM.WA' },
  'ZAKŁADY PRZEMYSŁU CUKIERNICZEGO': { ticker: 'OTM', yahoo: 'OTM.WA' },
  'KOMPAP': { ticker: 'KMP', yahoo: 'KMP.WA' },

  // Finance and Investment
  'MAGNA POLONIA': { ticker: 'MGP', yahoo: 'MGP.WA' },
  'KCI': { ticker: 'KCI', yahoo: 'KCI.WA' },

  // Food and Retail
  'MAKARONY POLSKIE': { ticker: 'MAK', yahoo: 'MAK.WA' },

  // Trading and Services
  'M.W. TRADE': { ticker: 'MWT', yahoo: 'MWT.WA' },
  'TERMO-REX': { ticker: 'TRX', yahoo: 'TRX.WA' },
  'TRANS POLONIA': { ticker: 'TRN', yahoo: 'TRN.WA' },

  // FinTech
  'PRAGMAGO': { ticker: 'PGO', yahoo: 'PGO.WA' },

  // Media
  'PMPG POLSKIE MEDIA': { ticker: 'PMP', yahoo: 'PMP.WA' },

  // Biotech
  'NANOGROUP': { ticker: 'NNG', yahoo: 'NNG.WA' },

  // Other
  'JWW INVEST': { ticker: 'JWW', yahoo: 'JWW.WA' },
  'DR. MIELE': { ticker: 'DRM', yahoo: 'DRM.WA' },
  'COSMED': { ticker: 'COS', yahoo: 'COS.WA' },
  'LESS': { ticker: 'LES', yahoo: 'LES.WA' },
  'GI GROUP POLAND': { ticker: 'GIG', yahoo: 'GIG.WA' },

  // Additional Polish companies
  'DATAWALK': { ticker: 'DAT', yahoo: 'DAT.WA' },
  'TEXT': { ticker: 'TXT', yahoo: 'TXT.WA' },
  'VERCOM': { ticker: 'VRC', yahoo: 'VRC.WA' },
  'BRAND24': { ticker: 'B24', yahoo: 'B24.WA' },
  'R22': { ticker: 'R22', yahoo: 'R22.WA' },
  'IFIRMA': { ticker: 'IFI', yahoo: 'IFI.WA' },
  'PRACUJ': { ticker: 'PJP', yahoo: 'PJP.WA' },
  'PEPCO': { ticker: 'PCO', yahoo: 'PCO.WA' },
  'MUZA': { ticker: 'MZA', yahoo: 'MZA.WA' },
  'KOGENERACJA': { ticker: 'KGN', yahoo: 'KGN.WA' },
  'KRKA': { ticker: 'KRK', yahoo: 'KRK.WA' },
  'KERNEL': { ticker: 'KER', yahoo: 'KER.WA' },
  'MENNICA POLSKA': { ticker: 'MNC', yahoo: 'MNC.WA' },
  'MARVIPOL': { ticker: 'MVP', yahoo: 'MVP.WA' },
  'MOSTALWAR': { ticker: 'MSW', yahoo: 'MSW.WA' },
  'MOSTOSTAL WARSZAWA': { ticker: 'MSW', yahoo: 'MSW.WA' },
  'PCC ROKITA': { ticker: 'PCR', yahoo: 'PCR.WA' },
  'PCC EXOL': { ticker: 'PCX', yahoo: 'PCX.WA' },
  'PEKAO': { ticker: 'PEO', yahoo: 'PEO.WA' },
  'POLWAX': { ticker: 'PWX', yahoo: 'PWX.WA' },
  'ŚNIEŻKA': { ticker: 'SKA', yahoo: 'SKA.WA' },
  'TEN SQUARE GAMES': { ticker: 'TEN', yahoo: 'TEN.WA' },
  'VERCOM': { ticker: 'VRC', yahoo: 'VRC.WA' },
  'WIRTUALNA': { ticker: 'WPL', yahoo: 'WPL.WA' },
  'WORK SERVICE': { ticker: 'WSE', yahoo: 'WSE.WA' },
  'ZAMET': { ticker: 'ZMT', yahoo: 'ZMT.WA' },
  'ZPC OTMUCHÓW': { ticker: 'OTM', yahoo: 'OTM.WA' },
};

const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, link_status = 'linked'
  WHERE id = ?
`);

const pending = db.prepare(`
  SELECT id, legal_name
  FROM company_identifiers
  WHERE country = 'PL'
  AND link_status = 'pending'
  AND (ticker IS NULL OR ticker = '')
`).all();

console.log(`Found ${pending.length} pending Polish companies`);

let updated = 0;

for (const company of pending) {
  const cleanName = company.legal_name
    .toUpperCase()
    .replace(/^["']|["']$/g, '')
    .replace(/SPÓŁKA AKCYJNA$/i, '')
    .replace(/S\.?A\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, data] of Object.entries(ADDITIONAL_POLISH)) {
    const cleanPattern = pattern.toUpperCase().trim();

    if (cleanName === cleanPattern ||
        cleanName.includes(cleanPattern) ||
        (cleanPattern.length > 5 && cleanName.startsWith(cleanPattern.substring(0, Math.min(cleanPattern.length, 10))))) {
      updateStmt.run(data.ticker, data.yahoo, company.id);
      console.log(`✓ ${company.legal_name.substring(0, 50)} → ${data.yahoo}`);
      updated++;
      break;
    }
  }
}

console.log(`\nUpdated: ${updated}`);

// Final stats
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
