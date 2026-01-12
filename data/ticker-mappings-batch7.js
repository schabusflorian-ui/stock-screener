/**
 * Ticker Mappings Batch 7 - Luxembourg, Greece, Netherlands, Portugal, Belgium
 *
 * Luxembourg (.PA or .DE or no clear exchange - many are holding cos)
 * Greece (.AT suffix for Athens)
 * Netherlands (.AS for Amsterdam)
 * Portugal (.LS for Lisbon)
 * Belgium (.BR for Brussels)
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Luxembourg companies (often listed on multiple exchanges)
const LUXEMBOURG_MAPPINGS = {
  'D\'AMICO INTERNATIONAL SHIPPING': { ticker: 'DIS', yahoo: 'DIS.MI' },
  'SHURGARD SELF STORAGE': { ticker: 'SHUR', yahoo: 'SHUR.BR' },
  'MILLICOM INTERNATIONAL': { ticker: 'TIGO', yahoo: 'TIGO.ST' },
  'B&S GROUP': { ticker: 'BSGR', yahoo: 'BSGR.AS' },
  'CPI PROPERTY GROUP': { ticker: 'CPI', yahoo: 'CPI.PR' },
  'LOGWIN': { ticker: 'LOG', yahoo: 'LOG.DE' },
  'TONIES': { ticker: 'TNIE', yahoo: 'TNIE.DE' },
  'BEFESA': { ticker: 'BFSA', yahoo: 'BFSA.DE' },
  'MARLEY SPOON': { ticker: 'MMK', yahoo: 'MMK.DE' },
  'GLOBAL FASHION GROUP': { ticker: 'GFG', yahoo: 'GFG.DE' },
  'MAJOREL': { ticker: 'MAJ', yahoo: 'MAJ.AS' },
  'ORION': { ticker: 'ORION', yahoo: 'ORION.AS' },
  'ARCELOR': { ticker: 'MT', yahoo: 'MT.AS' },
  'ARCELORMITTAL': { ticker: 'MT', yahoo: 'MT.AS' },
  'SES': { ticker: 'SESG', yahoo: 'SESG.PA' },
  'RTL GROUP': { ticker: 'RRTL', yahoo: 'RRTL.DE' },
  'APERAM': { ticker: 'APAM', yahoo: 'APAM.AS' },
  'CORESTATE': { ticker: 'CCAP', yahoo: 'CCAP.DE' },
  'ADLER GROUP': { ticker: 'ADJ', yahoo: 'ADJ.DE' },
  'BRAIN BIOTECH': { ticker: 'BNN', yahoo: 'BNN.DE' },
  'EVOTEC': { ticker: 'EVT', yahoo: 'EVT.DE' },
  'GRAND CITY': { ticker: 'GYC', yahoo: 'GYC.DE' },
  'PUBLITY': { ticker: 'PBY', yahoo: 'PBY.DE' },
  'ROCKET INTERNET': { ticker: 'RKET', yahoo: 'RKET.DE' },
  'KION GROUP': { ticker: 'KGX', yahoo: 'KGX.DE' },
  'AUTO1': { ticker: 'AG1', yahoo: 'AG1.DE' },
  'SUBSEA 7': { ticker: 'SUBC', yahoo: 'SUBC.OL' },
};

// Greek companies (Athens Stock Exchange - .AT suffix)
const GREEK_MAPPINGS = {
  // Greek names have been transliterated
  'AVAX': { ticker: 'AVAX', yahoo: 'AVAX.AT' },
  'ΑΒΑΞ': { ticker: 'AVAX', yahoo: 'AVAX.AT' },
  'ΓΕΚ ΤΕΡΝΑ': { ticker: 'GEKTERNA', yahoo: 'GEKTERNA.AT' },
  'GEK TERNA': { ticker: 'GEKTERNA', yahoo: 'GEKTERNA.AT' },
  'FOURLIS': { ticker: 'FOYRK', yahoo: 'FOYRK.AT' },
  'ΑΕΡΟΠΟΡΙΑ ΑΙΓΑΙΟΥ': { ticker: 'AEGN', yahoo: 'AEGN.AT' },
  'AEGEAN AIRLINES': { ticker: 'AEGN', yahoo: 'AEGN.AT' },
  'AUTOHELLAS': { ticker: 'AUTOH', yahoo: 'AUTOH.AT' },
  'EΛΒΑΛΧΑΛΚΟΡ': { ticker: 'ELHA', yahoo: 'ELHA.AT' },
  'ELVALHALCOR': { ticker: 'ELHA', yahoo: 'ELHA.AT' },
  'MIG': { ticker: 'MIG', yahoo: 'MIG.AT' },
  'ΤΕΡΝΑ ΕΝΕΡΓΕΙΑΚΗ': { ticker: 'TENERG', yahoo: 'TENERG.AT' },
  'TERNA ENERGY': { ticker: 'TENERG', yahoo: 'TENERG.AT' },
  'QUEST': { ticker: 'QUEST', yahoo: 'QUEST.AT' },
  'FLEXOPACK': { ticker: 'FLEXO', yahoo: 'FLEXO.AT' },
  'BRIQ PROPERTIES': { ticker: 'BRIQ', yahoo: 'BRIQ.AT' },
  'ATTICA': { ticker: 'ATTICA', yahoo: 'ATTICA.AT' },
  'ΠΛΑΣΤΙΚΑ ΘΡΑΚΗΣ': { ticker: 'PLATH', yahoo: 'PLATH.AT' },
  'PLASTIKA THRAKIS': { ticker: 'PLATH', yahoo: 'PLATH.AT' },
  'THRACE': { ticker: 'PLATH', yahoo: 'PLATH.AT' },
  'ΤΕΧΝΙΚΗ ΟΛΥΜΠΙΑΚΗ': { ticker: 'OLYMP', yahoo: 'OLYMP.AT' },
  'OPTIMA BANK': { ticker: 'OPTIMA', yahoo: 'OPTIMA.AT' },
  'PROFILE': { ticker: 'PROF', yahoo: 'PROF.AT' },
  'PREMIA': { ticker: 'PREMIA', yahoo: 'PREMIA.AT' },
  'ΕΤΑΙΡΕΙΑ ΥΔΡΕΥΣΕΩΣ': { ticker: 'EYDAP', yahoo: 'EYDAP.AT' },
  'EYDAP': { ticker: 'EYDAP', yahoo: 'EYDAP.AT' },
  'TRADE ESTATES': { ticker: 'TRESTATE', yahoo: 'TRESTATE.AT' },
  'ΠΡΟΝΤΕΑ': { ticker: 'PRODEA', yahoo: 'PRODEA.AT' },
  'PRODEA': { ticker: 'PRODEA', yahoo: 'PRODEA.AT' },
  // Major Greek companies
  'ALPHA BANK': { ticker: 'ALPHA', yahoo: 'ALPHA.AT' },
  'EUROBANK': { ticker: 'EUROB', yahoo: 'EUROB.AT' },
  'NATIONAL BANK OF GREECE': { ticker: 'ETE', yahoo: 'ETE.AT' },
  'PIRAEUS BANK': { ticker: 'TPEIR', yahoo: 'TPEIR.AT' },
  'OTE': { ticker: 'OTE', yahoo: 'HTO.AT' },
  'HELLENIC TELECOM': { ticker: 'OTE', yahoo: 'HTO.AT' },
  'OPAP': { ticker: 'OPAP', yahoo: 'OPAP.AT' },
  'MOTOR OIL': { ticker: 'MOH', yahoo: 'MOH.AT' },
  'MYTILINEOS': { ticker: 'MYTIL', yahoo: 'MYTIL.AT' },
  'JUMBO': { ticker: 'BELA', yahoo: 'BELA.AT' },
  'LAMDA': { ticker: 'LAMDA', yahoo: 'LAMDA.AT' },
  'PUBLIC POWER': { ticker: 'PPC', yahoo: 'PPC.AT' },
  'TITAN CEMENT': { ticker: 'TITK', yahoo: 'TITK.AT' },
  'VIOHALCO': { ticker: 'VIO', yahoo: 'VIO.AT' },
  'METKA': { ticker: 'METKA', yahoo: 'METKA.AT' },
  'INTRALOT': { ticker: 'INLOT', yahoo: 'INLOT.AT' },
  'SARANTIS': { ticker: 'SAR', yahoo: 'SAR.AT' },
  'IKTINOS': { ticker: 'IKTIN', yahoo: 'IKTIN.AT' },
  'CENERGY': { ticker: 'CENERGY', yahoo: 'CENERGY.AT' },
};

// Dutch companies (Amsterdam - .AS suffix)
const DUTCH_MAPPINGS = {
  'ASR NEDERLAND': { ticker: 'ASRNL', yahoo: 'ASRNL.AS' },
  'ASR': { ticker: 'ASRNL', yahoo: 'ASRNL.AS' },
  'ENVIPCO': { ticker: 'ENVI', yahoo: 'ENVI.AS' },
  'ORDINA': { ticker: 'ORDI', yahoo: 'ORDI.AS' },
  'CNH INDUSTRIAL': { ticker: 'CNHI', yahoo: 'CNHI.AS' },
  'DSM': { ticker: 'DSM', yahoo: 'DSM.AS' },
  'FLOW TRADERS': { ticker: 'FLOW', yahoo: 'FLOW.AS' },
  'BETER BED': { ticker: 'BBED', yahoo: 'BBED.AS' },
  'ROODMICROTEC': { ticker: 'ROOD', yahoo: 'ROOD.AS' },
  'PHOTON ENERGY': { ticker: 'PTNR', yahoo: 'PEN.AS' },
  'ONWARD MEDICAL': { ticker: 'ONWD', yahoo: 'ONWD.AS' },
  'ARCONA': { ticker: 'ARCN', yahoo: 'ARCN.AS' },
  'BRILL': { ticker: 'BRILL', yahoo: 'BRILL.AS' },
  'AZERION': { ticker: 'AZRN', yahoo: 'AZRN.AS' },
  'MOREFIELD': { ticker: 'MORE', yahoo: 'MORE.AS' },
  // Major Dutch companies
  'AEGON': { ticker: 'AGN', yahoo: 'AGN.AS' },
  'AKZO NOBEL': { ticker: 'AKZA', yahoo: 'AKZA.AS' },
  'ASML': { ticker: 'ASML', yahoo: 'ASML.AS' },
  'HEINEKEN': { ticker: 'HEIA', yahoo: 'HEIA.AS' },
  'ING': { ticker: 'INGA', yahoo: 'INGA.AS' },
  'KPN': { ticker: 'KPN', yahoo: 'KPN.AS' },
  'NN GROUP': { ticker: 'NN', yahoo: 'NN.AS' },
  'PHILIPS': { ticker: 'PHIA', yahoo: 'PHIA.AS' },
  'RANDSTAD': { ticker: 'RAND', yahoo: 'RAND.AS' },
  'SHELL': { ticker: 'SHEL', yahoo: 'SHEL.AS' },
  'UNILEVER': { ticker: 'UNA', yahoo: 'UNA.AS' },
  'WOLTERS KLUWER': { ticker: 'WKL', yahoo: 'WKL.AS' },
  'JUST EAT': { ticker: 'TKWY', yahoo: 'TKWY.AS' },
  'TAKEAWAY': { ticker: 'TKWY', yahoo: 'TKWY.AS' },
  'PROSUS': { ticker: 'PRX', yahoo: 'PRX.AS' },
  'ADYEN': { ticker: 'ADYEN', yahoo: 'ADYEN.AS' },
  'SIGNIFY': { ticker: 'LIGHT', yahoo: 'LIGHT.AS' },
  'ABN AMRO': { ticker: 'ABN', yahoo: 'ABN.AS' },
  'VOPAK': { ticker: 'VPK', yahoo: 'VPK.AS' },
  'FUGRO': { ticker: 'FUR', yahoo: 'FUR.AS' },
  'BOSKALIS': { ticker: 'BOKA', yahoo: 'BOKA.AS' },
  'BASIC FIT': { ticker: 'BFIT', yahoo: 'BFIT.AS' },
  'CORBION': { ticker: 'CRBN', yahoo: 'CRBN.AS' },
  'AALBERTS': { ticker: 'AALB', yahoo: 'AALB.AS' },
  'ARCADIS': { ticker: 'ARCAD', yahoo: 'ARCAD.AS' },
  'BRUNEL': { ticker: 'BRNL', yahoo: 'BRNL.AS' },
  'TKH GROUP': { ticker: 'TWEKA', yahoo: 'TWEKA.AS' },
  'SBM OFFSHORE': { ticker: 'SBMO', yahoo: 'SBMO.AS' },
};

// Portuguese companies (Lisbon - .LS suffix)
const PORTUGUESE_MAPPINGS = {
  'ALTRI': { ticker: 'ALTR', yahoo: 'ALTR.LS' },
  'BANCO COMERCIAL PORTUGUES': { ticker: 'BCP', yahoo: 'BCP.LS' },
  'BCP': { ticker: 'BCP', yahoo: 'BCP.LS' },
  'CORTICEIRA AMORIM': { ticker: 'COR', yahoo: 'COR.LS' },
  'CTT': { ticker: 'CTT', yahoo: 'CTT.LS' },
  'EDP': { ticker: 'EDP', yahoo: 'EDP.LS' },
  'EDP RENOVAVEIS': { ticker: 'EDPR', yahoo: 'EDPR.LS' },
  'GALP': { ticker: 'GALP', yahoo: 'GALP.LS' },
  'GREENVOLT': { ticker: 'GVOLT', yahoo: 'GVOLT.LS' },
  'IBERSOL': { ticker: 'IBS', yahoo: 'IBS.LS' },
  'JERONIMO MARTINS': { ticker: 'JMT', yahoo: 'JMT.LS' },
  'MOTA-ENGIL': { ticker: 'EGL', yahoo: 'EGL.LS' },
  'NOS': { ticker: 'NOS', yahoo: 'NOS.LS' },
  'NAVIGATOR': { ticker: 'NVG', yahoo: 'NVG.LS' },
  'REN': { ticker: 'RENE', yahoo: 'RENE.LS' },
  'SEMAPA': { ticker: 'SEM', yahoo: 'SEM.LS' },
  'SONAE': { ticker: 'SON', yahoo: 'SON.LS' },
  'RAMADA': { ticker: 'RAM', yahoo: 'RAM.LS' },
  'IMPRESA': { ticker: 'IPR', yahoo: 'IPR.LS' },
  'PHAROL': { ticker: 'PHR', yahoo: 'PHR.LS' },
  'INAPA': { ticker: 'INA', yahoo: 'INA.LS' },
  'NOVABASE': { ticker: 'NBA', yahoo: 'NBA.LS' },
  'SAG GEST': { ticker: 'SVA', yahoo: 'SVA.LS' },
  'COFINA': { ticker: 'CFN', yahoo: 'CFN.LS' },
  'MEDIA CAPITAL': { ticker: 'MCP', yahoo: 'MCP.LS' },
  'REDITUS': { ticker: 'RED', yahoo: 'RED.LS' },
  'SPORTING': { ticker: 'SCP', yahoo: 'SCP.LS' },
  'TEIXEIRA DUARTE': { ticker: 'TDSA', yahoo: 'TDSA.LS' },
  'VAA VISTA ALEGRE': { ticker: 'VAF', yahoo: 'VAF.LS' },
};

// Belgian companies (Brussels - .BR suffix)
const BELGIAN_MAPPINGS = {
  // Additional Belgian companies not yet mapped
  'ACKERMANS': { ticker: 'ACKB', yahoo: 'ACKB.BR' },
  'AGEAS': { ticker: 'AGS', yahoo: 'AGS.BR' },
  'ARGEN-X': { ticker: 'ARGX', yahoo: 'ARGX.BR' },
  'COFINIMMO': { ticker: 'COFB', yahoo: 'COFB.BR' },
  'COLRUYT': { ticker: 'COLR', yahoo: 'COLR.BR' },
  'D\'IETEREN': { ticker: 'DIE', yahoo: 'DIE.BR' },
  'ELIA': { ticker: 'ELI', yahoo: 'ELI.BR' },
  'GALAPAGOS': { ticker: 'GLPG', yahoo: 'GLPG.BR' },
  'GBL': { ticker: 'GBLB', yahoo: 'GBLB.BR' },
  'KBC': { ticker: 'KBC', yahoo: 'KBC.BR' },
  'LOTUS BAKERIES': { ticker: 'LOTB', yahoo: 'LOTB.BR' },
  'PROXIMUS': { ticker: 'PROX', yahoo: 'PROX.BR' },
  'SOFINA': { ticker: 'SOF', yahoo: 'SOF.BR' },
  'SOLVAY': { ticker: 'SOLB', yahoo: 'SOLB.BR' },
  'UCB': { ticker: 'UCB', yahoo: 'UCB.BR' },
  'UMICORE': { ticker: 'UMI', yahoo: 'UMI.BR' },
  'WDP': { ticker: 'WDP', yahoo: 'WDP.BR' },
  'KINEPOLIS': { ticker: 'KIN', yahoo: 'KIN.BR' },
  'BARCO': { ticker: 'BAR', yahoo: 'BAR.BR' },
  'ONTEX': { ticker: 'ONTEX', yahoo: 'ONTEX.BR' },
  'TELENET': { ticker: 'TNET', yahoo: 'TNET.BR' },
  'TESSENDERLO': { ticker: 'TESB', yahoo: 'TESB.BR' },
  'VGP': { ticker: 'VGP', yahoo: 'VGP.BR' },
  'WAREHOUSES DE PAUW': { ticker: 'WDP', yahoo: 'WDP.BR' },
  'XIOR': { ticker: 'XIOR', yahoo: 'XIOR.BR' },
  'AZELIS': { ticker: 'AZE', yahoo: 'AZE.BR' },
  'EURONAV': { ticker: 'EURN', yahoo: 'EURN.BR' },
  'GREENYARD': { ticker: 'GREEN', yahoo: 'GREEN.BR' },
  'JENSEN': { ticker: 'JEN', yahoo: 'JEN.BR' },
  'LEASINVEST': { ticker: 'LEAS', yahoo: 'LEAS.BR' },
  'MONTEA': { ticker: 'MONT', yahoo: 'MONT.BR' },
  'RECTICEL': { ticker: 'REC', yahoo: 'REC.BR' },
  'SEQUANA MEDICAL': { ticker: 'SEQUA', yahoo: 'SEQUA.BR' },
  'SIPEF': { ticker: 'SIP', yahoo: 'SIP.BR' },
  'SOLVAC': { ticker: 'SOLV', yahoo: 'SOLV.BR' },
  'TINC': { ticker: 'TINC', yahoo: 'TINC.BR' },
  'EVS BROADCAST': { ticker: 'EVS', yahoo: 'EVS.BR' },
  'ONCOMFORT': { ticker: 'ONCOF', yahoo: 'ONCOF.BR' },
  'OPTION': { ticker: 'OPTI', yahoo: 'OPTI.BR' },
  'ROULARTA': { ticker: 'ROU', yahoo: 'ROU.BR' },
  'TITAN CEMENT': { ticker: 'TITC', yahoo: 'TITC.BR' },
  'VAN DE VELDE': { ticker: 'VAN', yahoo: 'VAN.BR' },
};

const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, link_status = 'linked'
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
      .replace(/\s*S\.?E\.?\s*$/i, '')
      .replace(/\s*N\.?V\.?\s*$/i, '')
      .replace(/\s*B\.?V\.?\s*$/i, '')
      .replace(/\s*PLC\s*$/i, '')
      .replace(/\s*LIMITED\s*$/i, '')
      .replace(/\s*LTD\s*$/i, '')
      .replace(/\s*AG\s*$/i, '')
      .replace(/\s*ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ\s*/gi, '')
      .replace(/\s*ΑΝΩΝΥΜΟΣ ΕΤΑΙΡΕΙΑ\s*/gi, '')
      .replace(/\s*Α\.Ε\.\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    for (const [pattern, data] of Object.entries(mappings)) {
      const cleanPattern = pattern.toUpperCase().trim();

      if (cleanName === cleanPattern ||
          cleanName.includes(cleanPattern) ||
          cleanPattern.includes(cleanName) ||
          (cleanPattern.length > 4 && cleanName.includes(cleanPattern.substring(0, Math.min(cleanPattern.length, 8))))) {
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

// Process each country
let total = 0;
total += processCountry('LU', LUXEMBOURG_MAPPINGS, 'Luxembourg');
total += processCountry('GR', GREEK_MAPPINGS, 'Greece');
total += processCountry('NL', DUTCH_MAPPINGS, 'Netherlands');
total += processCountry('PT', PORTUGUESE_MAPPINGS, 'Portugal');
total += processCountry('BE', BELGIAN_MAPPINGS, 'Belgium');

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
