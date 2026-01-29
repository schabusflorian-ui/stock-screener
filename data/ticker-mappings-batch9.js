/**
 * Ticker Mappings Batch 9 - Additional Known Public Companies
 *
 * Companies that should have been mapped but were missed
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Belgian companies still pending
const BELGIAN_ADDITIONS = {
  'ANHEUSER-BUSCH INBEV': { ticker: 'ABI', yahoo: 'ABI.BR' },
  'CAMPINE': { ticker: 'CAMB', yahoo: 'CAMB.BR' },
  'SYENSQO': { ticker: 'SYENS', yahoo: 'SYENS.BR' },
  'IMMOBEL': { ticker: 'IMMO', yahoo: 'IMMO.BR' },
  'CFE': { ticker: 'CFEB', yahoo: 'CFEB.BR' },
  'AANNEMINGSMAATSCHAPPIJ CFE': { ticker: 'CFEB', yahoo: 'CFEB.BR' },
  'ACACIA PHARMA': { ticker: 'ACPH', yahoo: 'ACPH.BR' },
  'BEFIMMO': { ticker: 'BEFB', yahoo: 'BEFB.BR' },
  'CELYAD': { ticker: 'CYAD', yahoo: 'CYAD.BR' },
  'CMB.TECH': { ticker: 'CMB', yahoo: 'CMB.BR' },
  'COMPAGNIE DU BOIS SAUVAGE': { ticker: 'COMB', yahoo: 'COMB.BR' },
  'BOIS SAUVAGE': { ticker: 'COMB', yahoo: 'COMB.BR' },
  'CRESCENT': { ticker: 'CRES', yahoo: 'CRES.BR' },
  'EKOPAK': { ticker: 'EKOP', yahoo: 'EKOP.BR' },
  'FOUNTAIN': { ticker: 'FOU', yahoo: 'FOU.BR' },
  'FLUVIUS': { ticker: 'FLUX', yahoo: 'FLUX.BR' },
  'INTERVEST': { ticker: 'INTO', yahoo: 'INTO.BR' },
  'KEYWARE': { ticker: 'KEYW', yahoo: 'KEYW.BR' },
  'MDXHEALTH': { ticker: 'MDXH', yahoo: 'MDXH.BR' },
  'MIKO': { ticker: 'MIKO', yahoo: 'MIKO.BR' },
  'MITHRA': { ticker: 'MITRA', yahoo: 'MITRA.BR' },
  'MOURY CONSTRUCT': { ticker: 'MOUR', yahoo: 'MOUR.BR' },
  'NEXTENSA': { ticker: 'NEXTA', yahoo: 'NEXTA.BR' },
  'ROSIER': { ticker: 'ROS', yahoo: 'ROS.BR' },
  'SMARTPHOTO': { ticker: 'SMAR', yahoo: 'SMAR.BR' },
  'TEXAF': { ticker: 'TEXF', yahoo: 'TEXF.BR' },
  'VANDEMOORTELE': { ticker: 'VAN', yahoo: 'VAN.BR' },
  'VASTNED': { ticker: 'VASTB', yahoo: 'VASTB.BR' },
  'WERELDHAVE BELGIUM': { ticker: 'WEHB', yahoo: 'WEHB.BR' },
  'WHAT\'S COOKING': { ticker: 'WHATS', yahoo: 'WHATS.BR' },
  'ALLIANCE DEVELOPPEMENT': { ticker: 'ADC', yahoo: 'ADC.PA' },  // Listed in Paris
  'BANIMMO': { ticker: 'BANI', yahoo: 'BANI.BR' },
};

// Spanish companies still pending
const SPANISH_ADDITIONS = {
  'AYCO GRUPO': { ticker: 'AYC', yahoo: 'AYC.MC' },
  'COMPAÑIA LEVANTINA': { ticker: 'LEV', yahoo: 'LEV.MC' },
  'CEVASA': { ticker: 'CEV', yahoo: 'CEV.MC' },
  'COMPAÑÍA ESPAÑOLA DE VIVIENDAS': { ticker: 'CEV', yahoo: 'CEV.MC' },
  'DESA': { ticker: 'DESA', yahoo: 'DESA.MC' },
  'DESARROLLOS ESPECIALES': { ticker: 'DESA', yahoo: 'DESA.MC' },
  'ECOLUMBER': { ticker: 'ECL', yahoo: 'ECL.MC' },
  'EZENTIS': { ticker: 'EZE', yahoo: 'EZE.MC' },
  'GRUPO EZENTIS': { ticker: 'EZE', yahoo: 'EZE.MC' },
  'HELIOS RE': { ticker: 'YHEL', yahoo: 'YHEL.MC' },
  'IBERCAJA': { ticker: 'IBRC', yahoo: 'IBRC.MC' },
  'INMOBILIARIA DEL SUR': { ticker: 'ISUR', yahoo: 'ISUR.MC' },
  'INMOCEMENTO': { ticker: 'INM', yahoo: 'INM.MC' },
  'INNOVATIVE SOLUTIONS': { ticker: 'INSOL', yahoo: 'INSOL.MC' },
  'REIG JOFRE': { ticker: 'RJF', yahoo: 'RJF.MC' },
  'LABORATORIO REIG JOFRE': { ticker: 'RJF', yahoo: 'RJF.MC' },
  'LIBERTAS 7': { ticker: 'LIB', yahoo: 'LIB.MC' },
  'LIWE': { ticker: 'LIW', yahoo: 'LIW.MC' },
  'MINERALES Y PRODUCTOS': { ticker: 'MPN', yahoo: 'MPN.MC' },
  'MINOR HOTELS': { ticker: 'MINT', yahoo: 'MINT.MC' },
  'MONTEBALITO': { ticker: 'MTB', yahoo: 'MTB.MC' },
  'NATURHOUSE': { ticker: 'NTH', yahoo: 'NTH.MC' },
  'OPDENERGY': { ticker: 'OPDE', yahoo: 'OPDE.MC' },
  'PRIM': { ticker: 'PRM', yahoo: 'PRM.MC' },
  'PROMOTORA DE INFORMACIONES': { ticker: 'PRS', yahoo: 'PRS.MC' },  // PRISA
  'PUIG BRANDS': { ticker: 'PUIG', yahoo: 'PUIG.MC' },
  'RENTA 4': { ticker: 'R4', yahoo: 'R4.MC' },
  'SANTANDER CONSUMER': { ticker: 'SCFP', yahoo: 'SCFP.MC' },
  'SOLTEC': { ticker: 'SOL', yahoo: 'SOL.MC' },
  'TECNICAS REUNIDAS': { ticker: 'TRE', yahoo: 'TRE.MC' },
  'TUBACEX': { ticker: 'TUB', yahoo: 'TUB.MC' },
  'TUBOS REUNIDOS': { ticker: 'TRG', yahoo: 'TRG.MC' },
  'URBAS': { ticker: 'UBS', yahoo: 'UBS.MC' },
  'VOCENTO': { ticker: 'VOC', yahoo: 'VOC.MC' },
};

// French companies still pending
const FRENCH_ADDITIONS = {
  'AIR LIQUIDE': { ticker: 'AI', yahoo: 'AI.PA' },
  'L\'AIR LIQUIDE': { ticker: 'AI', yahoo: 'AI.PA' },
  'BIC': { ticker: 'BB', yahoo: 'BB.PA' },
  'SOCIETE BIC': { ticker: 'BB', yahoo: 'BB.PA' },
  'GAZTRANSPORT': { ticker: 'GTT', yahoo: 'GTT.PA' },
  'GTT': { ticker: 'GTT', yahoo: 'GTT.PA' },
  'HIGH CO': { ticker: 'HCO', yahoo: 'HCO.PA' },
  'HSBC CONTINENTAL EUROPE': { ticker: 'HSBC', yahoo: 'HSBA.L' },
  'INNATE PHARMA': { ticker: 'IPH', yahoo: 'IPH.PA' },
  'JCDECAUX': { ticker: 'DEC', yahoo: 'DEC.PA' },
  'KAUFMAN & BROAD': { ticker: 'KOF', yahoo: 'KOF.PA' },
  'MCPHY': { ticker: 'MCPHY', yahoo: 'MCPHY.PA' },
  'MRM': { ticker: 'MRM', yahoo: 'MRM.PA' },
  'NHOA': { ticker: 'NHOA', yahoo: 'NHOA.PA' },
  'OSE IMMUNOTHERAPEUTICS': { ticker: 'OSE', yahoo: 'OSE.PA' },
  'PHAXIAM': { ticker: 'PHXM', yahoo: 'PHXM.PA' },
  'QUADIENT': { ticker: 'QDT', yahoo: 'QDT.PA' },
  'RAMSAY': { ticker: 'RGS', yahoo: 'RGS.PA' },
  'ROCHE BOBOIS': { ticker: 'RBO', yahoo: 'RBO.PA' },
  'SECHE ENVIRONNEMENT': { ticker: 'SCHP', yahoo: 'SCHP.PA' },
  'SERGEFERRARI': { ticker: 'SEFER', yahoo: 'SEFER.PA' },
  'SOCIETE FONCIERE LYONNAISE': { ticker: 'FLY', yahoo: 'FLY.PA' },
  'TOUAX': { ticker: 'TOUP', yahoo: 'TOUP.PA' },
  'VIRIDIEN': { ticker: 'VIE', yahoo: 'VIRI.PA' },
  'WAVESTONE': { ticker: 'WAVE', yahoo: 'WAVE.PA' },
  'BAINS DE MER': { ticker: 'BAIN', yahoo: 'BAIN.PA' },
  'GENEU': { ticker: 'GNRO', yahoo: 'GNRO.PA' },
  'GENEURO': { ticker: 'GNRO', yahoo: 'GNRO.PA' },
  'FORSEE POWER': { ticker: 'FORSE', yahoo: 'FORSE.PA' },
  'MAROC TELECOM': { ticker: 'IAM', yahoo: 'IAM.PA' },
  'ITISSALAT AL-MAGHRIB': { ticker: 'IAM', yahoo: 'IAM.PA' },
};

// Italian additions
const ITALIAN_ADDITIONS = {
  'MOLTIPLY GROUP': { ticker: 'MLY', yahoo: 'MLY.MI' },
  'MOL GROUP': { ticker: 'MLY', yahoo: 'MLY.MI' },
  'BEEWIZE': { ticker: 'BW', yahoo: 'BW.MI' },
};

// Greek additions (transliterated)
const GREEK_ADDITIONS = {
  'IKTINOS': { ticker: 'IKTIN', yahoo: 'IKTIN.AT' },
  'INTRALOT': { ticker: 'INLOT', yahoo: 'INLOT.AT' },
  'CENERGY': { ticker: 'CENER', yahoo: 'CENER.AT' },
};

// Luxembourg additions
const LUXEMBOURG_ADDITIONS = {
  'SOCFINASIA': { ticker: 'SOCF', yahoo: 'SOCF.BR' },  // Listed in Brussels
  'SWORD GROUP': { ticker: 'SWP', yahoo: 'SWP.PA' },   // Listed in Paris
  'H2APEX': { ticker: 'H2A', yahoo: 'H2A.DE' },
};

// Portuguese additions
const PORTUGUESE_ADDITIONS = {
  'EDP RENOVAVEIS': { ticker: 'EDPR', yahoo: 'EDPR.LS' },
  'GREENVOLT': { ticker: 'GVOLT', yahoo: 'GVOLT.LS' },
  'MOTA-ENGIL': { ticker: 'EGL', yahoo: 'EGL.LS' },
  'NAVIGATOR': { ticker: 'NVG', yahoo: 'NVG.LS' },
};

// Dutch additions
const DUTCH_ADDITIONS = {
  'BEVER HOLDING': { ticker: 'BEVER', yahoo: 'BEVER.AS' },
  'GREEN EARTH': { ticker: 'GREEN', yahoo: 'GREEN.AS' },
  'MOTORK': { ticker: 'MTRK', yahoo: 'MTRK.AS' },
};

// Finnish addition
const FINNISH_ADDITIONS = {
  'ROBIT': { ticker: 'ROBIT', yahoo: 'ROBIT.HE' },
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
      .replace(/\s*S\.?A\.?S\.?\s*$/i, '')
      .replace(/\s*N\.?V\.?\s*$/i, '')
      .replace(/\s*PLC\s*$/i, '')
      .replace(/\s*GROUP\s*$/i, '')
      .replace(/\s+OU\s+.*$/i, '')  // Handle Belgian multi-name format
      .replace(/\s+/g, ' ')
      .trim();

    for (const [pattern, data] of Object.entries(mappings)) {
      const cleanPattern = pattern.toUpperCase().trim();

      if (cleanName === cleanPattern ||
          cleanName.includes(cleanPattern) ||
          cleanPattern.includes(cleanName) ||
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

let total = 0;
total += processCountry('BE', BELGIAN_ADDITIONS, 'Belgium');
total += processCountry('ES', SPANISH_ADDITIONS, 'Spain');
total += processCountry('FR', FRENCH_ADDITIONS, 'France');
total += processCountry('IT', ITALIAN_ADDITIONS, 'Italy');
total += processCountry('GR', GREEK_ADDITIONS, 'Greece');
total += processCountry('LU', LUXEMBOURG_ADDITIONS, 'Luxembourg');
total += processCountry('PT', PORTUGUESE_ADDITIONS, 'Portugal');
total += processCountry('NL', DUTCH_ADDITIONS, 'Netherlands');
total += processCountry('FI', FINNISH_ADDITIONS, 'Finland');

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
