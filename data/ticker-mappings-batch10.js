/**
 * Ticker Mappings Batch 10 - Final cleanup of known public companies
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// More French companies
const FRENCH_FINAL = {
  'DEEZER': { ticker: 'DEEZR', yahoo: 'DEEZR.PA' },
  'EIFFAGE': { ticker: 'FGR', yahoo: 'FGR.PA' },
  'EKINOPS': { ticker: 'EKI', yahoo: 'EKI.PA' },
  'EQUASENS': { ticker: 'EQS', yahoo: 'EQS.PA' },
  'EUROPCAR': { ticker: 'EUCAR', yahoo: 'EUCAR.PA' },
  'EXAIL': { ticker: 'EXA', yahoo: 'EXA.PA' },
  'EXCLUSIVE NETWORKS': { ticker: 'EXN', yahoo: 'EXN.PA' },
  'GENERIX': { ticker: 'GNRX', yahoo: 'GNRX.PA' },
  'GROUPE CRIT': { ticker: 'CEN', yahoo: 'CEN.PA' },
  'CRIT': { ticker: 'CEN', yahoo: 'CEN.PA' },
  'GUILLEMOT': { ticker: 'GUI', yahoo: 'GUI.PA' },
  'HEXAOM': { ticker: 'HEXA', yahoo: 'HEXA.PA' },
  'HOPSCOTCH': { ticker: 'ALHOP', yahoo: 'ALHOP.PA' },
  'INTERPARFUMS': { ticker: 'ITP', yahoo: 'ITP.PA' },
  'INVENTIVA': { ticker: 'IVA', yahoo: 'IVA.PA' },
  'ITESOFT': { ticker: 'ITE', yahoo: 'ITE.PA' },
  'LHYFE': { ticker: 'LHYFE', yahoo: 'LHYFE.PA' },
  'LNA SANTE': { ticker: 'LNA', yahoo: 'LNA.PA' },
  'LYSOGENE': { ticker: 'LYS', yahoo: 'LYS.PA' },
  'METROPOLE TELEVISION': { ticker: 'MMT', yahoo: 'MMT.PA' },
  'M6': { ticker: 'MMT', yahoo: 'MMT.PA' },
  'MICROPOLE': { ticker: 'MUN', yahoo: 'MUN.PA' },
  'NRJ GROUP': { ticker: 'NRG', yahoo: 'NRG.PA' },
  'NRJ': { ticker: 'NRG', yahoo: 'NRG.PA' },
  'ORANGE': { ticker: 'ORA', yahoo: 'ORA.PA' },
  'PARROT': { ticker: 'PARRO', yahoo: 'PARRO.PA' },
  'PCAS': { ticker: 'PCA', yahoo: 'PCA.PA' },
  'POXEL': { ticker: 'POXEL', yahoo: 'POXEL.PA' },
  'PRECIA': { ticker: 'PREC', yahoo: 'PREC.PA' },
  'SOGECLAIR': { ticker: 'SOG', yahoo: 'SOG.PA' },
  'SOLOCAL': { ticker: 'LOCAL', yahoo: 'LOCAL.PA' },
  'SQLI': { ticker: 'SQI', yahoo: 'SQI.PA' },
  'SRP GROUPE': { ticker: 'SRP', yahoo: 'SRP.PA' },
  'TIKEHAU': { ticker: 'TKO', yahoo: 'TKO.PA' },
  'UNIBEL': { ticker: 'UNBL', yahoo: 'UNBL.PA' },
  'VERIMATRIX': { ticker: 'VMX', yahoo: 'VMX.PA' },
  'VETOQUINOL': { ticker: 'VETO', yahoo: 'VETO.PA' },
  'VILMORIN': { ticker: 'RIN', yahoo: 'RIN.PA' },
  'VITURA': { ticker: 'VTR', yahoo: 'VTR.PA' },
  'VOLTALIA': { ticker: 'VLTSA', yahoo: 'VLTSA.PA' },
  'VUSIONGROUP': { ticker: 'VU', yahoo: 'VU.PA' },
  'GCC': { ticker: 'GCC', yahoo: 'GCC.PA' },
  'LAB GPO': { ticker: 'LAB', yahoo: 'LAB.PA' },
};

// More Polish companies
const POLISH_FINAL = {
  'ARCTIC PAPER': { ticker: 'ATC', yahoo: 'ATC.WA' },
  'BANK HANDLOWY': { ticker: 'BHW', yahoo: 'BHW.WA' },
  'BNP PARIBAS BANK POLSKA': { ticker: 'BNP', yahoo: 'BNP.WA' },
  'ELEMENTAL HOLDING': { ticker: 'ELT', yahoo: 'ELT.WA' },
  'KERNEL': { ticker: 'KER', yahoo: 'KER.WA' },
  'LOKUM DEWELOPER': { ticker: 'LKD', yahoo: 'LKD.WA' },
  'ONEX': { ticker: 'ONX', yahoo: 'ONX.WA' },
  'OPEN FINANCE': { ticker: 'OPF', yahoo: 'OPF.WA' },
  'PEPCO': { ticker: 'PCO', yahoo: 'PCO.WA' },
  'PHOTON ENERGY': { ticker: 'PEN', yahoo: 'PEN.WA' },
  'PLAYWAY': { ticker: 'PLW', yahoo: 'PLW.WA' },
  'POLIMEX-MOSTOSTAL': { ticker: 'PXM', yahoo: 'PXM.WA' },
  'R22': { ticker: 'R22', yahoo: 'R22.WA' },
  'SNIEZKA': { ticker: 'SKA', yahoo: 'SKA.WA' },
  'ŚNIEŻKA': { ticker: 'SKA', yahoo: 'SKA.WA' },
  'TEN SQUARE GAMES': { ticker: 'TEN', yahoo: 'TEN.WA' },
  'WAWEL': { ticker: 'WWL', yahoo: 'WWL.WA' },
  'WITTCHEN': { ticker: 'WTN', yahoo: 'WTN.WA' },
  'IFIRMA': { ticker: 'IFI', yahoo: 'IFI.WA' },
  'BRAND24': { ticker: 'B24', yahoo: 'B24.WA' },
  'CREEPY JAR': { ticker: 'CRJ', yahoo: 'CRJ.WA' },
  'CI GAMES': { ticker: 'CIG', yahoo: 'CIG.WA' },
  '11 BIT STUDIOS': { ticker: '11B', yahoo: '11B.WA' },
  'PCF GROUP': { ticker: 'PCF', yahoo: 'PCF.WA' },
  'BLOOBER TEAM': { ticker: 'BLO', yahoo: 'BLO.WA' },
};

// Italian additions
const ITALIAN_FINAL = {
  'GEFRAN': { ticker: 'GE', yahoo: 'GE.MI' },
  'IRCE': { ticker: 'IRC', yahoo: 'IRC.MI' },
  'ISAGRO': { ticker: 'ISA', yahoo: 'ISA.MI' },
  'MONDADORI': { ticker: 'MN', yahoo: 'MN.MI' },
  'MONRIF': { ticker: 'MON', yahoo: 'MON.MI' },
  'PIQUADRO': { ticker: 'PQ', yahoo: 'PQ.MI' },
  'POLIGRAFICI EDITORIALE': { ticker: 'POL', yahoo: 'POL.MI' },
  'RCS MEDIAGROUP': { ticker: 'RCS', yahoo: 'RCS.MI' },
  'SOGEFI': { ticker: 'SO', yahoo: 'SO.MI' },
  'TISCALI': { ticker: 'TIS', yahoo: 'TIS.MI' },
  'WIIT': { ticker: 'WIIT', yahoo: 'WIIT.MI' },
};

// Luxembourg - many are holding companies or not publicly traded
// Mark some as no_symbol
const LUXEMBOURG_NO_SYMBOL = [
  'CPI FIM SA',
  'NORSKE TOG AS',
  'Elia Transmission Belgium',
  'Euroclear Holding SA',
  'FERRERO INTERNATIONAL S.A.',
  'IKEA SUPPLY AG',
  'Intelsat',
  'KPMG LUXEMBOURG',
  'LOMBARD INTERNATIONAL ASSURANCE',
  'Luxembourg Stock Exchange',
  'PayPal',
  'PLASTINVEST',
  'PROLOGIS EUROPEAN LOGISTICS',
  'REYL (LUXEMBOURG)',
  'RICOH INTERNATIONAL',
  'SPOTIFY',
  'TARKETT',
  'VONOVIA SE',
  'WORLDLINE LUXEMBOURG',
];

// Portuguese - many are SGPSes (holding companies)
const PORTUGUESE_FINAL = {
  'ALTRI': { ticker: 'ALTR', yahoo: 'ALTR.LS' },
  'BANCO COMERCIAL PORTUGUES': { ticker: 'BCP', yahoo: 'BCP.LS' },
  'BCP': { ticker: 'BCP', yahoo: 'BCP.LS' },
  'CORTICEIRA AMORIM': { ticker: 'COR', yahoo: 'COR.LS' },
  'CTT': { ticker: 'CTT', yahoo: 'CTT.LS' },
  'EDP': { ticker: 'EDP', yahoo: 'EDP.LS' },
  'GALP': { ticker: 'GALP', yahoo: 'GALP.LS' },
  'JERONIMO MARTINS': { ticker: 'JMT', yahoo: 'JMT.LS' },
  'NOS': { ticker: 'NOS', yahoo: 'NOS.LS' },
  'REN': { ticker: 'RENE', yahoo: 'RENE.LS' },
  'SEMAPA': { ticker: 'SEM', yahoo: 'SEM.LS' },
  'SONAE': { ticker: 'SON', yahoo: 'SON.LS' },
  'SPORTING': { ticker: 'SCP', yahoo: 'SCP.LS' },
  'VISTA ALEGRE': { ticker: 'VAF', yahoo: 'VAF.LS' },
};

// Greek remaining
const GREEK_FINAL = {
  'CORAL': { ticker: 'CRL', yahoo: 'CRL.AT' },
};

const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, link_status = 'linked'
  WHERE id = ?
`);

const markNoSymbolStmt = db.prepare(`
  UPDATE company_identifiers
  SET link_status = 'no_symbol'
  WHERE id = ?
`);

function processCountry(country, mappings, countryName) {
  const pending = db.prepare(`
    SELECT id, legal_name
    FROM company_identifiers
    WHERE country = ?
    AND link_status = 'pending'
    AND (ticker IS NULL OR ticker = '')
  `).all(country);

  console.log(`\n=== ${countryName} (${country}) - ${pending.length} pending ===`);

  let updated = 0;

  for (const company of pending) {
    const cleanName = company.legal_name
      .toUpperCase()
      .replace(/^["']|["']$/g, '')
      .replace(/\s*S\.?A\.?\s*$/i, '')
      .replace(/\s*S\.?P\.?A\.?\s*$/i, '')
      .replace(/\s*N\.?V\.?\s*$/i, '')
      .replace(/\s*SPÓŁKA AKCYJNA\s*$/i, '')
      .replace(/\s*GROUP\s*$/i, '')
      .replace(/\s*SE\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    for (const [pattern, data] of Object.entries(mappings)) {
      const cleanPattern = pattern.toUpperCase().trim();

      if (cleanName === cleanPattern ||
          cleanName.includes(cleanPattern) ||
          (cleanPattern.length > 4 && cleanName.startsWith(cleanPattern.substring(0, Math.min(cleanPattern.length, 10))))) {
        updateStmt.run(data.ticker, data.yahoo, company.id);
        console.log(`✓ ${company.legal_name.substring(0, 50)} → ${data.yahoo}`);
        updated++;
        break;
      }
    }
  }

  console.log(`Updated: ${updated}`);
  return updated;
}

// Mark Luxembourg no_symbol companies
function markLuxembourgNoSymbol() {
  const pending = db.prepare(`
    SELECT id, legal_name FROM company_identifiers
    WHERE country = 'LU' AND link_status = 'pending'
  `).all();

  let marked = 0;
  for (const company of pending) {
    const cleanName = company.legal_name.toUpperCase();
    for (const pattern of LUXEMBOURG_NO_SYMBOL) {
      if (cleanName.includes(pattern.toUpperCase())) {
        markNoSymbolStmt.run(company.id);
        console.log(`✗ ${company.legal_name.substring(0, 50)} → no_symbol`);
        marked++;
        break;
      }
    }
  }
  return marked;
}

let total = 0;
total += processCountry('FR', FRENCH_FINAL, 'France');
total += processCountry('PL', POLISH_FINAL, 'Poland');
total += processCountry('IT', ITALIAN_FINAL, 'Italy');
total += processCountry('PT', PORTUGUESE_FINAL, 'Portugal');
total += processCountry('GR', GREEK_FINAL, 'Greece');

console.log('\n=== Marking Luxembourg holding companies ===');
markLuxembourgNoSymbol();

// Final stats
const stats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM company_identifiers WHERE ticker IS NOT NULL AND ticker != '') as with_ticker,
    (SELECT COUNT(*) FROM company_identifiers WHERE link_status = 'pending') as pending,
    (SELECT COUNT(*) FROM company_identifiers WHERE link_status = 'no_symbol') as no_symbol
`).get();

console.log(`\n=== Final Database Status ===`);
console.log(`With ticker: ${stats.with_ticker}`);
console.log(`Pending: ${stats.pending}`);
console.log(`No symbol: ${stats.no_symbol}`);
console.log(`\nTotal updated this batch: ${total}`);

db.close();
