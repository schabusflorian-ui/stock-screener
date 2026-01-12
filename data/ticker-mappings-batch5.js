/**
 * Ticker Mappings Batch 5 - Polish Companies
 *
 * Maps Polish companies from XBRL filings to Yahoo Finance symbols.
 * All Polish companies trade on Warsaw Stock Exchange (GPW) with .WA suffix.
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Polish company mappings (GPW ticker → Yahoo symbol)
// Company names are matched case-insensitively
const MAPPINGS = {
  // A
  'AMBRA': { ticker: 'AMB', yahoo: 'AMB.WA' },
  'AMICA': { ticker: 'AMC', yahoo: 'AMC.WA' },
  'ARCTIC PAPER': { ticker: 'ATC', yahoo: 'ATC.WA' },
  'ATM GRUPA': { ticker: 'ATM', yahoo: 'ATM.WA' },
  'AB ': { ticker: 'ABE', yahoo: 'ABE.WA' },
  'ACTION': { ticker: 'ACT', yahoo: 'ACT.WA' },
  'AGORA': { ticker: 'AGO', yahoo: 'AGO.WA' },
  'AILLERON': { ticker: 'ALL', yahoo: 'ALL.WA' },
  'ALUMETAL': { ticker: 'AML', yahoo: 'AML.WA' },
  'APATOR': { ticker: 'APT', yahoo: 'APT.WA' },
  'APLISENS': { ticker: 'APL', yahoo: 'APL.WA' },
  'ARCHICOM': { ticker: 'ARC', yahoo: 'ARC.WA' },
  'ARTERIA': { ticker: 'ART', yahoo: 'ART.WA' },
  'ASBIS': { ticker: 'ASB', yahoo: 'ASB.WA' },
  'ASSECO BUSINESS SOLUTIONS': { ticker: 'ABS', yahoo: 'ABS.WA' },
  'ASSECO POLAND': { ticker: 'ACP', yahoo: 'ACP.WA' },
  'ASSECO SOUTH EASTERN EUROPE': { ticker: 'ASE', yahoo: 'ASE.WA' },
  'ASTARTA': { ticker: 'AST', yahoo: 'AST.WA' },
  'ATENDE': { ticker: 'ATD', yahoo: 'ATD.WA' },
  'ATAL': { ticker: 'AAT', yahoo: 'AAT.WA' },
  'ATREM': { ticker: 'ATR', yahoo: 'ATR.WA' },
  'AUTO PARTNER': { ticker: 'APR', yahoo: 'APR.WA' },
  'AUTOPARTNER': { ticker: 'APR', yahoo: 'APR.WA' },

  // B
  'BANK MILLENNIUM': { ticker: 'MIL', yahoo: 'MIL.WA' },
  'BANK PEKAO': { ticker: 'PEO', yahoo: 'PEO.WA' },
  'BANK POLSKA KASA OPIEKI': { ticker: 'PEO', yahoo: 'PEO.WA' },
  'BENEFIT SYSTEMS': { ticker: 'BFT', yahoo: 'BFT.WA' },
  'BETACOM': { ticker: 'BTC', yahoo: 'BTC.WA' },
  'BIOMED LUBLIN': { ticker: 'BML', yahoo: 'BML.WA' },
  'BOWIM': { ticker: 'BOW', yahoo: 'BOW.WA' },
  'BUDIMEX': { ticker: 'BDX', yahoo: 'BDX.WA' },
  'BUMECH': { ticker: 'BMC', yahoo: 'BMC.WA' },

  // C
  'CAPTOR THERAPEUTICS': { ticker: 'CTP', yahoo: 'CTP.WA' },
  'CD PROJEKT': { ticker: 'CDR', yahoo: 'CDR.WA' },
  'CCC': { ticker: 'CCC', yahoo: 'CCC.WA' },
  'CFI HOLDING': { ticker: 'CFI', yahoo: 'CFI.WA' },
  'CIECH': { ticker: 'CIE', yahoo: 'CIE.WA' },
  'COMARCH': { ticker: 'CMR', yahoo: 'CMR.WA' },
  'COMP': { ticker: 'CMP', yahoo: 'CMP.WA' },
  'CZERWONA TOREBKA': { ticker: 'CRT', yahoo: 'CRT.WA' },
  'CYFROWY POLSAT': { ticker: 'CPS', yahoo: 'CPS.WA' },
  'CENTRUM MEDYCZNE ENEL-MED': { ticker: 'ENE', yahoo: 'ENE.WA' },

  // D
  'DADELO': { ticker: 'DAD', yahoo: 'DAD.WA' },
  'DINO POLSKA': { ticker: 'DNP', yahoo: 'DNP.WA' },
  'DOM DEVELOPMENT': { ticker: 'DOM', yahoo: 'DOM.WA' },
  'DROZAPOL-PROFIL': { ticker: 'DRP', yahoo: 'DRP.WA' },

  // E
  'ECHO INVESTMENT': { ticker: 'ECH', yahoo: 'ECH.WA' },
  'ELEMENTAL HOLDING': { ticker: 'ELT', yahoo: 'ELT.WA' },
  'ELZAB': { ticker: 'ELZ', yahoo: 'ELZ.WA' },
  'ZAKŁADY URZĄDZEŃ KOMPUTEROWYCH ELZAB': { ticker: 'ELZ', yahoo: 'ELZ.WA' },
  'ENEA': { ticker: 'ENA', yahoo: 'ENA.WA' },
  'ENTER AIR': { ticker: 'ENT', yahoo: 'ENT.WA' },
  'ERGIS': { ticker: 'EGS', yahoo: 'EGS.WA' },
  'ES-SYSTEM': { ticker: 'ESS', yahoo: 'ESS.WA' },
  'EUROPEJSKIE CENTRUM ODSZKODOWAŃ': { ticker: 'EUC', yahoo: 'EUC.WA' },
  'EUROTEL': { ticker: 'ETL', yahoo: 'ETL.WA' },
  'EUROCASH': { ticker: 'EUR', yahoo: 'EUR.WA' },

  // F
  'FAMUR': { ticker: 'FMF', yahoo: 'FMF.WA' },
  'FAST FINANCE': { ticker: 'FFI', yahoo: 'FFI.WA' },
  'FEERUM': { ticker: 'FEE', yahoo: 'FEE.WA' },
  'FERRO': { ticker: 'FRO', yahoo: 'FRO.WA' },
  'FORTE': { ticker: 'FTE', yahoo: 'FTE.WA' },
  'GRUPA FORTE': { ticker: 'FTE', yahoo: 'FTE.WA' },

  // G
  'GETIN HOLDING': { ticker: 'GTN', yahoo: 'GTN.WA' },
  'GLOBE TRADE CENTRE': { ticker: 'GTC', yahoo: 'GTC.WA' },
  'GPW': { ticker: 'GPW', yahoo: 'GPW.WA' },
  'GRENEVIA': { ticker: 'GRN', yahoo: 'GRN.WA' },
  'GRODNO': { ticker: 'GRN', yahoo: 'GRN.WA' },
  'GROCLIN': { ticker: 'GCN', yahoo: 'GCN.WA' },
  'GRUDZIADZ': { ticker: 'GDZ', yahoo: 'GDZ.WA' },
  'GRUPA AZOTY': { ticker: 'ATT', yahoo: 'ATT.WA' },
  'GRUPA KETY': { ticker: 'KTY', yahoo: 'KTY.WA' },
  'GRUPA LOTOS': { ticker: 'LTS', yahoo: 'LTS.WA' },

  // H
  'HUUUGE': { ticker: 'HUG', yahoo: 'HUG.WA' },

  // I
  'IMS': { ticker: 'IMS', yahoo: 'IMS.WA' },
  'INC': { ticker: 'INC', yahoo: 'INC.WA' },
  'ING BANK SLASKI': { ticker: 'ING', yahoo: 'ING.WA' },
  'INTER CARS': { ticker: 'CAR', yahoo: 'CAR.WA' },
  'INTERBUD - LUBLIN': { ticker: 'ITB', yahoo: 'ITB.WA' },
  'INTROL': { ticker: 'INL', yahoo: 'INL.WA' },
  'IZOBLOK': { ticker: 'IZB', yahoo: 'IZB.WA' },
  'IZOSTAL': { ticker: 'IZS', yahoo: 'IZS.WA' },

  // J
  'JSW': { ticker: 'JSW', yahoo: 'JSW.WA' },
  'JASTRZEBSKA SPOLKA WEGLOWA': { ticker: 'JSW', yahoo: 'JSW.WA' },

  // K
  'KETY': { ticker: 'KTY', yahoo: 'KTY.WA' },
  'KERNEL': { ticker: 'KER', yahoo: 'KER.WA' },
  'KGHM POLSKA MIEDZ': { ticker: 'KGH', yahoo: 'KGH.WA' },
  'KINO POLSKA TV': { ticker: 'KPL', yahoo: 'KPL.WA' },
  'KOMPUTRONIK': { ticker: 'KOM', yahoo: 'KOM.WA' },
  'KOPEX': { ticker: 'KPX', yahoo: 'KPX.WA' },
  'KORPORACJA GOSPODARCZA EFEKT': { ticker: 'EFK', yahoo: 'EFK.WA' },
  'KREDYT INKASO': { ticker: 'KRI', yahoo: 'KRI.WA' },
  'KRUK': { ticker: 'KRU', yahoo: 'KRU.WA' },

  // L
  'LENA LIGHTING': { ticker: 'LEN', yahoo: 'LEN.WA' },
  'LENTEX': { ticker: 'LTX', yahoo: 'LTX.WA' },
  'LIBET': { ticker: 'LBT', yahoo: 'LBT.WA' },
  'LIVECHAT SOFTWARE': { ticker: 'LVC', yahoo: 'LVC.WA' },
  'LPP': { ticker: 'LPP', yahoo: 'LPP.WA' },
  'LUBAWA': { ticker: 'LBW', yahoo: 'LBW.WA' },

  // M
  'MABION': { ticker: 'MAB', yahoo: 'MAB.WA' },
  'MAXCOM': { ticker: 'MAX', yahoo: 'MAX.WA' },
  'MBANK': { ticker: 'MBK', yahoo: 'MBK.WA' },
  'MCR': { ticker: 'MCR', yahoo: 'MCR.WA' },
  'MEDICALGORITHMICS': { ticker: 'MDG', yahoo: 'MDG.WA' },
  'MERCOR': { ticker: 'MCR', yahoo: 'MCR.WA' },
  'MEX POLSKA': { ticker: 'MEX', yahoo: 'MEX.WA' },
  'MIRBUD': { ticker: 'MRB', yahoo: 'MRB.WA' },
  'MLPGROUP': { ticker: 'MLG', yahoo: 'MLG.WA' },
  'MLP GROUP': { ticker: 'MLG', yahoo: 'MLG.WA' },
  'MONNARI TRADE': { ticker: 'MON', yahoo: 'MON.WA' },

  // N
  'NEWAG': { ticker: 'NWG', yahoo: 'NWG.WA' },
  'NEUCA': { ticker: 'NEU', yahoo: 'NEU.WA' },
  'NTT SYSTEM': { ticker: 'NTT', yahoo: 'NTT.WA' },

  // O
  'OCTAVA': { ticker: 'OOV', yahoo: 'OOV.WA' },
  'OEX': { ticker: 'OEX', yahoo: 'OEX.WA' },
  'ONEX': { ticker: 'ONX', yahoo: 'ONX.WA' },
  'OPONEO.PL': { ticker: 'OPN', yahoo: 'OPN.WA' },
  'ORANGE POLSKA': { ticker: 'OPL', yahoo: 'OPL.WA' },
  'ORZEŁ BIAŁY': { ticker: 'ORB', yahoo: 'ORB.WA' },

  // P
  'PBG': { ticker: 'PBG', yahoo: 'PBG.WA' },
  'PC GUARD': { ticker: 'PCG', yahoo: 'PCG.WA' },
  'PELION': { ticker: 'PEL', yahoo: 'PEL.WA' },
  'PESA': { ticker: 'PSA', yahoo: 'PSA.WA' },
  'PGE POLSKA GRUPA ENERGETYCZNA': { ticker: 'PGE', yahoo: 'PGE.WA' },
  'PGE': { ticker: 'PGE', yahoo: 'PGE.WA' },
  'PGNIG': { ticker: 'PGN', yahoo: 'PGN.WA' },
  'PHARMENA': { ticker: 'PHR', yahoo: 'PHR.WA' },
  'PKN ORLEN': { ticker: 'PKN', yahoo: 'PKN.WA' },
  'PKO BANK POLSKI': { ticker: 'PKO', yahoo: 'PKO.WA' },
  'POLENERGIA': { ticker: 'PEP', yahoo: 'PEP.WA' },
  'POLISH OIL AND GAS': { ticker: 'PGN', yahoo: 'PGN.WA' },
  'POLIMEX-MOSTOSTAL': { ticker: 'PXM', yahoo: 'PXM.WA' },
  'POLNORD': { ticker: 'PND', yahoo: 'PND.WA' },
  'POLSAT': { ticker: 'CPS', yahoo: 'CPS.WA' },
  'PRATERM': { ticker: 'PRT', yahoo: 'PRT.WA' },
  'PRIME CAR MANAGEMENT': { ticker: 'PRM', yahoo: 'PRM.WA' },
  'PROTEKTOR': { ticker: 'PRT', yahoo: 'PRT.WA' },
  'PZU': { ticker: 'PZU', yahoo: 'PZU.WA' },
  'POWSZECHNY ZAKLAD UBEZPIECZEN': { ticker: 'PZU', yahoo: 'PZU.WA' },

  // Q
  'QUANTUM SOFTWARE': { ticker: 'QNT', yahoo: 'QNT.WA' },

  // R
  'RAFAKO': { ticker: 'RFK', yahoo: 'RFK.WA' },
  'RAINBOW': { ticker: 'RBW', yahoo: 'RBW.WA' },
  'RAWLPLUG': { ticker: 'RWL', yahoo: 'RWL.WA' },
  'RELPOL': { ticker: 'RLP', yahoo: 'RLP.WA' },
  'ROBYG': { ticker: 'ROB', yahoo: 'ROB.WA' },

  // S
  'SANOK RUBBER COMPANY': { ticker: 'SNK', yahoo: 'SNK.WA' },
  'SANPL': { ticker: 'SPL', yahoo: 'SPL.WA' },
  'SANTANDER BANK POLSKA': { ticker: 'SPL', yahoo: 'SPL.WA' },
  'SECO/WARWICK': { ticker: 'SWG', yahoo: 'SWG.WA' },
  'SELENA FM': { ticker: 'SEL', yahoo: 'SEL.WA' },
  'SFINKS POLSKA': { ticker: 'SFS', yahoo: 'SFS.WA' },
  'SILVAIR': { ticker: 'SIL', yahoo: 'SIL.WA' },
  'SKYLINE INVESTMENT': { ticker: 'SKY', yahoo: 'SKY.WA' },
  'SKARBIEC': { ticker: 'SKH', yahoo: 'SKH.WA' },
  'STELMET': { ticker: 'STL', yahoo: 'STL.WA' },
  'STALPRODUKT': { ticker: 'STF', yahoo: 'STF.WA' },
  'STALPRODUKT-PROFIL': { ticker: 'STP', yahoo: 'STP.WA' },
  'STALPROFIL': { ticker: 'STF', yahoo: 'STF.WA' },
  'SUWARY': { ticker: 'SUW', yahoo: 'SUW.WA' },
  'SYGNITY': { ticker: 'SGN', yahoo: 'SGN.WA' },

  // T
  'TARCZYŃSKI': { ticker: 'TAR', yahoo: 'TAR.WA' },
  'TAURON': { ticker: 'TPE', yahoo: 'TPE.WA' },
  'TAURON POLSKA ENERGIA': { ticker: 'TPE', yahoo: 'TPE.WA' },
  'TENDERHUT': { ticker: 'TEN', yahoo: 'TEN.WA' },
  'TIM': { ticker: 'TIM', yahoo: 'TIM.WA' },
  'TORPOL': { ticker: 'TOR', yahoo: 'TOR.WA' },
  'TOYA': { ticker: 'TOA', yahoo: 'TOA.WA' },
  'TRAKCJA': { ticker: 'TRK', yahoo: 'TRK.WA' },

  // U
  'ULMA CONSTRUCCION POLSKA': { ticker: 'ULM', yahoo: 'ULM.WA' },
  'UNIBEP': { ticker: 'UNI', yahoo: 'UNI.WA' },
  'UNIMOT': { ticker: 'UNT', yahoo: 'UNT.WA' },

  // V
  'VOXEL': { ticker: 'VOX', yahoo: 'VOX.WA' },
  'VOTUM': { ticker: 'VOT', yahoo: 'VOT.WA' },

  // W
  'WAWEL': { ticker: 'WWL', yahoo: 'WWL.WA' },
  'WIELTON': { ticker: 'WLT', yahoo: 'WLT.WA' },
  'WIRTUALNA POLSKA': { ticker: 'WPL', yahoo: 'WPL.WA' },

  // X
  'XTB': { ticker: 'XTB', yahoo: 'XTB.WA' },
  'X-TRADE BROKERS': { ticker: 'XTB', yahoo: 'XTB.WA' },

  // Z
  'ZE PAK': { ticker: 'ZEP', yahoo: 'ZEP.WA' },
  'ZESPOL ELEKTROWNI PATNOW-ADAMOW-KONIN': { ticker: 'ZEP', yahoo: 'ZEP.WA' },
  'ZPUE': { ticker: 'PUE', yahoo: 'PUE.WA' },

  // Additional Polish companies
  'FABRYKI SPRZĘTU I NARZĘDZI GÓRNICZYCH GRUPA KAPITAŁOWA FASING': { ticker: 'FSG', yahoo: 'FSG.WA' },
  'FASING': { ticker: 'FSG', yahoo: 'FSG.WA' },
  'ALL IN! GAMES': { ticker: 'ALI', yahoo: 'ALI.WA' },
  'ALTUS': { ticker: 'ALT', yahoo: 'ALT.WA' },
  'APS ENERGIA': { ticker: 'APS', yahoo: 'APS.WA' },
  'ADIUVO INVESTMENTS': { ticker: 'ADV', yahoo: 'ADV.WA' },
  'AIRWAY MEDIX': { ticker: 'AWM', yahoo: 'AWM.WA' },
};

// Prepare update statement
const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, link_status = 'linked'
  WHERE id = ?
`);

// Get pending Polish companies
const pendingPL = db.prepare(`
  SELECT id, legal_name, lei
  FROM company_identifiers
  WHERE country = 'PL'
  AND link_status = 'pending'
  AND (ticker IS NULL OR ticker = '')
`).all();

console.log(`Found ${pendingPL.length} pending Polish companies`);

let updated = 0;
let notFound = [];

for (const company of pendingPL) {
  // Clean company name for matching
  const cleanName = company.legal_name
    .toUpperCase()
    .replace(/^["']|["']$/g, '')       // Remove leading/trailing quotes
    .replace(/SPÓŁKA AKCYJNA$/i, '')   // Remove S.A. variations
    .replace(/S\.?A\.?$/i, '')
    .replace(/\s+/g, ' ')              // Normalize spaces
    .trim();

  let matched = false;

  // Try to find a match
  for (const [pattern, data] of Object.entries(MAPPINGS)) {
    const cleanPattern = pattern.toUpperCase().trim();

    if (cleanName === cleanPattern ||
        cleanName.includes(cleanPattern) ||
        cleanPattern.includes(cleanName.substring(0, 10))) {
      updateStmt.run(data.ticker, data.yahoo, company.id);
      console.log(`✓ ${company.legal_name.substring(0, 40)} → ${data.yahoo}`);
      updated++;
      matched = true;
      break;
    }
  }

  if (!matched) {
    notFound.push(company.legal_name);
  }
}

console.log(`\n=== Results ===`);
console.log(`Updated: ${updated}`);
console.log(`Not found: ${notFound.length}`);

if (notFound.length > 0 && notFound.length <= 50) {
  console.log(`\nNot found companies:`);
  notFound.forEach(n => console.log(`  - ${n}`));
}

// Show stats
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
