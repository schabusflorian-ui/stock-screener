// Additional EU Ticker Mappings - Batch 4
// Belgian, Italian, Spanish, Portuguese, Polish companies

const Database = require('better-sqlite3');
const db = new Database('/Users/florianschabus/Investment Project/data/stocks.db');

const MAPPINGS = {
  // BELGIAN COMPANIES (.BR suffix for Brussels)
  'MELEXIS': { ticker: 'MELE', yahoo: 'MELE.BR' },
  'ASCENCIO': { ticker: 'ASCE', yahoo: 'ASCE.BR' },
  'RETAIL ESTATES': { ticker: 'RET', yahoo: 'RET.BR' },
  'Gimv': { ticker: 'GIMB', yahoo: 'GIMB.BR' },
  'Greenyard': { ticker: 'GREEN', yahoo: 'GREEN.BR' },
  'Colruyt Group': { ticker: 'COLR', yahoo: 'COLR.BR' },
  'ORANGE BELGIUM': { ticker: 'OBEL', yahoo: 'OBEL.BR' },
  'CARE PROPERTY INVEST': { ticker: 'CPINV', yahoo: 'CPINV.BR' },
  'BARCO': { ticker: 'BAR', yahoo: 'BAR.BR' },
  'ATENOR': { ticker: 'ATEB', yahoo: 'ATEB.BR' },
  'FLUXYS BELGIUM': { ticker: 'FLUX', yahoo: 'FLUX.BR' },
  'EVS BROADCAST EQUIPMENT': { ticker: 'EVS', yahoo: 'EVS.BR' },
  'ELIA GROUP': { ticker: 'ELI', yahoo: 'ELI.BR' },
  'PROXIMUS': { ticker: 'PROX', yahoo: 'PROX.BR' },
  'NV BEKAERT SA': { ticker: 'BEKB', yahoo: 'BEKB.BR' },
  'TINC': { ticker: 'TINC', yahoo: 'TINC.BR' },
  'Fagron': { ticker: 'FAGR', yahoo: 'FAGR.BR' },
  'LOTUS BAKERIES': { ticker: 'LOTB', yahoo: 'LOTB.BR' },
  'WAREHOUSES DE PAUW': { ticker: 'WDP', yahoo: 'WDP.BR' },
  'DEME GROUP': { ticker: 'DEME', yahoo: 'DEME.BR' },
  'KBC GROEP': { ticker: 'KBC', yahoo: 'KBC.BR' },
  'X-Fab Silicon Foundries': { ticker: 'XFAB', yahoo: 'XFAB.BR' },
  'MONTEA': { ticker: 'MONT', yahoo: 'MONT.BR' },
  "D'IETEREN GROUP": { ticker: 'DIE', yahoo: 'DIE.BR' },
  'U C B': { ticker: 'UCB', yahoo: 'UCB.BR' },
  'Azelis Group': { ticker: 'AZE', yahoo: 'AZE.BR' },
  'ONTEX GROUP': { ticker: 'ONTEX', yahoo: 'ONTEX.BR' },
  'AGFA-GEVAERT': { ticker: 'AGFB', yahoo: 'AGFB.BR' },
  'Ion Beam Applications': { ticker: 'IBAB', yahoo: 'IBAB.BR' },
  'SIPEF': { ticker: 'SIP', yahoo: 'SIP.BR' },
  'RECTICEL': { ticker: 'RECT', yahoo: 'RECT.BR' },
  'NYXOAH': { ticker: 'NYXH', yahoo: 'NYXH.BR' },
  'ROULARTA MEDIA GROUP': { ticker: 'ROU', yahoo: 'ROU.BR' },
  'ECONOCOM GROUP': { ticker: 'ECONB', yahoo: 'ECONB.BR' },
  'XIOR STUDENT HOUSING': { ticker: 'XIOR', yahoo: 'XIOR.BR' },
  'Tessenderlo Group': { ticker: 'TESB', yahoo: 'TESB.BR' },
  'Cofinimmo': { ticker: 'COFB', yahoo: 'COFB.BR' },
  'HOME INVEST BELGIUM': { ticker: 'HOMI', yahoo: 'HOMI.BR' },
  'KINEPOLIS GROUP': { ticker: 'KIN', yahoo: 'KIN.BR' },
  'EXMAR': { ticker: 'EXM', yahoo: 'EXM.BR' },
  'AEDIFICA': { ticker: 'AED', yahoo: 'AED.BR' },
  'JENSEN GROUP': { ticker: 'JEN', yahoo: 'JEN.BR' },
  'ACKERMANS & VAN HAAREN': { ticker: 'ACKB', yahoo: 'ACKB.BR' },
  'VAN DE VELDE': { ticker: 'VAN', yahoo: 'VAN.BR' },
  'BPOST': { ticker: 'BPOST', yahoo: 'BPOST.BR' },
  'DECEUNINCK': { ticker: 'DECB', yahoo: 'DECB.BR' },
  'AGEAS SA/NV': { ticker: 'AGS', yahoo: 'AGS.BR' },
  'TELENET GROUP HOLDING': { ticker: 'TNET', yahoo: 'TNET.BR' },
  'VGP': { ticker: 'VGP', yahoo: 'VGP.BR' },
  'RESILUX': { ticker: 'RES', yahoo: 'RES.BR' },
  'PICANOL': { ticker: 'PIC', yahoo: 'PIC.BR' },

  // SPANISH COMPANIES (.MC suffix for Madrid)
  'AmRest Holdings SE': { ticker: 'EAT', yahoo: 'EAT.MC' },
  'EBRO FOODS, S.A.': { ticker: 'EBRO', yahoo: 'EBRO.MC' },
  'BANKINTER SOCIEDAD ANONIMA': { ticker: 'BKT', yahoo: 'BKT.MC' },
  'IBERDROLA SA': { ticker: 'IBE', yahoo: 'IBE.MC' },
  'ACERINOX SA': { ticker: 'ACX', yahoo: 'ACX.MC' },
  'ACS ACTIVIDADES DE CONSTRUCCION Y SERVICIOS, S.A.': { ticker: 'ACS', yahoo: 'ACS.MC' },
  'PHARMA MAR, S.A.': { ticker: 'PHM', yahoo: 'PHM.MC' },
  'Corporacion Acciona Energias Renovables SA': { ticker: 'ANE', yahoo: 'ANE.MC' },
  'PROSEGUR CASH, S.A.': { ticker: 'CASH', yahoo: 'CASH.MC' },
  'MAPFRE S.A.': { ticker: 'MAP', yahoo: 'MAP.MC' },
  'SOLARIA ENERGIA Y MEDIO AMBIENTE SA': { ticker: 'SLR', yahoo: 'SLR.MC' },
  'AENA S.M.E. SA': { ticker: 'AENA', yahoo: 'AENA.MC' },
  'ENCE ENERGIA Y CELULOSA S.A.': { ticker: 'ENC', yahoo: 'ENC.MC' },
  'FAES FARMA SA': { ticker: 'FAE', yahoo: 'FAE.MC' },
  'NATURGY ENERGY GROUP SA': { ticker: 'NTGY', yahoo: 'NTGY.MC' },
  'GRIFOLS S.A.': { ticker: 'GRF', yahoo: 'GRF.MC' },
  'LABORATORIOS FARMACEUTICOS ROVI S.A': { ticker: 'ROVI', yahoo: 'ROVI.MC' },
  'VISCOFAN SA': { ticker: 'VIS', yahoo: 'VIS.MC' },
  'BANCO BILBAO VIZCAYA ARGENTARIA SOCIEDAD ANONIMA': { ticker: 'BBVA', yahoo: 'BBVA.MC' },
  'CAIXABANK SA': { ticker: 'CABK', yahoo: 'CABK.MC' },
  'TELEFONICA SA': { ticker: 'TEF', yahoo: 'TEF.MC' },
  'REPSOL SA': { ticker: 'REP', yahoo: 'REP.MC' },
  'VIDRALA SA': { ticker: 'VID', yahoo: 'VID.MC' },
  'ALMIRALL S.A.': { ticker: 'ALM', yahoo: 'ALM.MC' },
  'ATRESMEDIA CORPORACION DE MEDIOS DE COMUNICACION, S.A.': { ticker: 'A3M', yahoo: 'A3M.MC' },
  'FOMENTO DE CONSTRUCCIONES Y CONTRATAS S.A.': { ticker: 'FCC', yahoo: 'FCC.MC' },
  'PROSEGUR COMPAÑIA DE SEGURIDAD, S.A.': { ticker: 'PSG', yahoo: 'PSG.MC' },
  'MELIA HOTELS INTERNATIONAL SA': { ticker: 'MEL', yahoo: 'MEL.MC' },
  'GRENERGY RENOVABLES SA': { ticker: 'GRE', yahoo: 'GRE.MC' },
  'UNICAJA BANCO SA': { ticker: 'UNI', yahoo: 'UNI.MC' },
  'REDEIA CORPORACION SA': { ticker: 'RED', yahoo: 'RED.MC' },
  'TALGO SA': { ticker: 'TLGO', yahoo: 'TLGO.MC' },
  'SACYR SA': { ticker: 'SCYR', yahoo: 'SCYR.MC' },
  'FLUIDRA S.A.': { ticker: 'FDR', yahoo: 'FDR.MC' },
  'INDRA SISTEMAS, S.A.': { ticker: 'IDR', yahoo: 'IDR.MC' },
  'CIE AUTOMOTIVE SA': { ticker: 'CIE', yahoo: 'CIE.MC' },
  'CORPORACION FINANCIERA ALBA, S.A.': { ticker: 'ALB', yahoo: 'ALB.MC' },
  'LINEA DIRECTA ASEGURADORA SOCIEDAD ANONIMA COMPAÑIA DE SEGUROS Y REASEGUROS': { ticker: 'LDA', yahoo: 'LDA.MC' },
  'AMADEUS IT GROUP SOCIEDAD ANONIMA': { ticker: 'AMS', yahoo: 'AMS.MC' },
  'LOGISTA INTEGRAL SA': { ticker: 'LOG', yahoo: 'LOG.MC' },
  'Acciona SA': { ticker: 'ANA', yahoo: 'ANA.MC' },
  'GESTAMP AUTOMOCION SA': { ticker: 'GEST', yahoo: 'GEST.MC' },
  'CELLNEX TELECOM SA': { ticker: 'CLNX', yahoo: 'CLNX.MC' },
  'ENDESA SA': { ticker: 'ELE', yahoo: 'ELE.MC' },
  'ELECNOR SA': { ticker: 'ENO', yahoo: 'ENO.MC' },
  'FERROVIAL SA': { ticker: 'FER', yahoo: 'FER.MC' },
  'CONSTRUCCIONES Y AUXILIAR DE FERROCARRILES, S.A.': { ticker: 'CAF', yahoo: 'CAF.MC' },
  'SIEMENS GAMESA RENEWABLE ENERGY SA': { ticker: 'SGRE', yahoo: 'SGRE.MC' },
  'MEDIASET ESPAÑA COMUNICACION SA': { ticker: 'TL5', yahoo: 'TL5.MC' },

  // ITALIAN COMPANIES (.MI suffix for Milan)
  'RECORDATI INDUSTRIA CHIMICA E FARMACEUTICA S.P.A. IN BREVE RECORDATI S.P.A.': { ticker: 'REC', yahoo: 'REC.MI' },
  'BPER BANCA S.P.A.': { ticker: 'BPE', yahoo: 'BPE.MI' },
  'PIAGGIO & C. S.P.A.': { ticker: 'PIA', yahoo: 'PIA.MI' },
  'AZIMUT HOLDING S.P.A.': { ticker: 'AZM', yahoo: 'AZM.MI' },
  'FINCANTIERI S.P.A.': { ticker: 'FCT', yahoo: 'FCT.MI' },
  'DIASORIN S.P.A.': { ticker: 'DIA', yahoo: 'DIA.MI' },
  'ESPRINET S.P.A.': { ticker: 'PRT', yahoo: 'PRT.MI' },
  'GEOX S.P.A.': { ticker: 'GEO', yahoo: 'GEO.MI' },
  'BFF BANK S.P.A.': { ticker: 'BFF', yahoo: 'BFF.MI' },
  "DE' LONGHI S.P.A.": { ticker: 'DLG', yahoo: 'DLG.MI' },
  'DATALOGIC S.P.A.': { ticker: 'DAL', yahoo: 'DAL.MI' },
  'NEXI SPA': { ticker: 'NEXI', yahoo: 'NEXI.MI' },
  'SOGEFI S.P.A.': { ticker: 'SO', yahoo: 'SO.MI' },
  'FINECOBANK BANCA FINECO S.P.A.': { ticker: 'FBK', yahoo: 'FBK.MI' },
  'BANCA MONTE DEI PASCHI DI SIENA S.P.A.': { ticker: 'BMPS', yahoo: 'BMPS.MI' },
  'AMPLIFON S.P.A.': { ticker: 'AMP', yahoo: 'AMP.MI' },
  'HERA S.P.A.': { ticker: 'HER', yahoo: 'HER.MI' },
  "LEONARDO - SOCIETA' PER AZIONI": { ticker: 'LDO', yahoo: 'LDO.MI' },
  'IREN S.P.A.': { ticker: 'IRE', yahoo: 'IRE.MI' },
  'ANIMA HOLDING S.P.A.': { ticker: 'ANIM', yahoo: 'ANIM.MI' },
  'ITALGAS S.P.A.': { ticker: 'IG', yahoo: 'IG.MI' },
  'ENAV S.P.A.': { ticker: 'ENAV', yahoo: 'ENAV.MI' },
  'ACEA S.P.A.': { ticker: 'ACE', yahoo: 'ACE.MI' },
  'BRUNELLO CUCINELLI S.P.A.': { ticker: 'BC', yahoo: 'BC.MI' },
  'BIESSE S.P.A.': { ticker: 'BSS', yahoo: 'BSS.MI' },
  'SNAM S.P.A.': { ticker: 'SRG', yahoo: 'SRG.MI' },
  "UNICREDIT, SOCIETA' PER AZIONI": { ticker: 'UCG', yahoo: 'UCG.MI' },
  "\"TERNA - RETE ELETTRICA NAZIONALE SOCIETA' PER AZIONI\" (IN FORMA ABBREVIATA \"TERNA S.P.A.\")": { ticker: 'TRN', yahoo: 'TRN.MI' },
  '"INTERPUMP GROUP S.P.A."': { ticker: 'IP', yahoo: 'IP.MI' },
  'AVIO S.P.A.': { ticker: 'AVIO', yahoo: 'AVIO.MI' },
  'CAREL INDUSTRIES S.P.A.': { ticker: 'CRL', yahoo: 'CRL.MI' },
  'ASSICURAZIONI GENERALI': { ticker: 'G', yahoo: 'G.MI' },
  'ERG S.P.A.': { ticker: 'ERG', yahoo: 'ERG.MI' },
  'SALVATORE FERRAGAMO S.P.A.': { ticker: 'SFER', yahoo: 'SFER.MI' },
  'BANCA MEDIOLANUM SPA': { ticker: 'BMED', yahoo: 'BMED.MI' },
  'TINEXTA S.P.A.': { ticker: 'TNXT', yahoo: 'TNXT.MI' },
  'SOL S.P.A.': { ticker: 'SOL', yahoo: 'SOL.MI' },
  'ENEL - SPA': { ticker: 'ENEL', yahoo: 'ENEL.MI' },
  'INTESA SANPAOLO S.P.A.': { ticker: 'ISP', yahoo: 'ISP.MI' },

  // PORTUGUESE COMPANIES (.LS suffix for Lisbon)
  'EDP RENOVAVEIS SOCIEDAD ANONIMA': { ticker: 'EDPR', yahoo: 'EDPR.LS' },
  'EDP, S.A.': { ticker: 'EDP', yahoo: 'EDP.LS' },
  'THE NAVIGATOR COMPANY, S.A.': { ticker: 'NVG', yahoo: 'NVG.LS' },
  'BANCO COMERCIAL PORTUGUÊS S.A.': { ticker: 'BCP', yahoo: 'BCP.LS' },
  'JERÓNIMO MARTINS SGPS SA': { ticker: 'JMT', yahoo: 'JMT.LS' },
  'NOS, SGPS, S.A.': { ticker: 'NOS', yahoo: 'NOS.LS' },
  'REN - REDES ENERGÉTICAS NACIONAIS, SGPS, S.A.': { ticker: 'RENE', yahoo: 'RENE.LS' },
  'GREENVOLT - ENERGIAS RENOVÁVEIS, S.A.': { ticker: 'GVOLT', yahoo: 'GVOLT.LS' },
  'SEMAPA - SOCIEDADE DE INVESTIMENTO E GESTÃO, SGPS, S.A.': { ticker: 'SEM', yahoo: 'SEM.LS' },
  'CORTICEIRA AMORIM, SGPS, S.A.': { ticker: 'COR', yahoo: 'COR.LS' },
  'ALTRI, S.G.P.S., S.A.': { ticker: 'ALTR', yahoo: 'ALTR.LS' },
  'CTT - CORREIOS DE PORTUGAL S.A.': { ticker: 'CTT', yahoo: 'CTT.LS' },
  'MOTA - ENGIL, SGPS S.A.': { ticker: 'EGL', yahoo: 'EGL.LS' },
  'SONAE - SGPS, S.A.': { ticker: 'SON', yahoo: 'SON.LS' },

  // POLISH COMPANIES (.WA suffix for Warsaw)
  'KGHM Polska Miedź Spółka Akcyjna': { ticker: 'KGH', yahoo: 'KGH.WA' },
  'ORLEN SPÓŁKA AKCYJNA': { ticker: 'PKN', yahoo: 'PKN.WA' },
  'TAURON POLSKA ENERGIA SPÓŁKA AKCYJNA': { ticker: 'TPE', yahoo: 'TPE.WA' },
  'JASTRZĘBSKA SPÓŁKA WĘGLOWA SPÓŁKA AKCYJNA': { ticker: 'JSW', yahoo: 'JSW.WA' },
  'PGE POLSKA GRUPA ENERGETYCZNA SPÓŁKA AKCYJNA': { ticker: 'PGE', yahoo: 'PGE.WA' },
  'LPP SPÓŁKA AKCYJNA': { ticker: 'LPP', yahoo: 'LPP.WA' },
  'CCC SPÓŁKA AKCYJNA': { ticker: 'CCC', yahoo: 'CCC.WA' },
  'CYFROWY POLSAT SPÓŁKA AKCYJNA': { ticker: 'CPS', yahoo: 'CPS.WA' },
  'GIEŁDA PAPIERÓW WARTOŚCIOWYCH W WARSZAWIE SPÓŁKA AKCYJNA': { ticker: 'GPW', yahoo: 'GPW.WA' },
  'ASSECO POLAND SPÓŁKA AKCYJNA': { ticker: 'ACP', yahoo: 'ACP.WA' },
  'BUDIMEX SPÓŁKA AKCYJNA': { ticker: 'BDX', yahoo: 'BDX.WA' },
  'GRUPA KĘTY SPÓŁKA AKCYJNA': { ticker: 'KTY', yahoo: 'KTY.WA' },
  'ENEA SPÓŁKA AKCYJNA': { ticker: 'ENA', yahoo: 'ENA.WA' },
  '"DINO POLSKA" SPÓŁKA AKCYJNA': { ticker: 'DNP', yahoo: 'DNP.WA' },
  'BANK MILLENNIUM SPÓŁKA AKCYJNA': { ticker: 'MIL', yahoo: 'MIL.WA' },
  'CD PROJEKT SPÓŁKA AKCYJNA': { ticker: 'CDR', yahoo: 'CDR.WA' },
  'BANK HANDLOWY W WARSZAWIE SPÓŁKA AKCYJNA': { ticker: 'BHW', yahoo: 'BHW.WA' },
  'SANTANDER BANK POLSKA SPÓŁKA AKCYJNA': { ticker: 'SPL', yahoo: 'SPL.WA' },
  'POWSZECHNA KASA OSZCZĘDNOŚCI BANK POLSKI SPÓŁKA AKCYJNA': { ticker: 'PKO', yahoo: 'PKO.WA' },
  'ALIOR BANK SPÓŁKA AKCYJNA': { ticker: 'ALR', yahoo: 'ALR.WA' },
  'mBank Spółka Akcyjna': { ticker: 'MBK', yahoo: 'MBK.WA' },
  'BANK POLSKA KASA OPIEKI - SPÓŁKA AKCYJNA': { ticker: 'PEO', yahoo: 'PEO.WA' },
  'ING BANK ŚLĄSKI SPÓŁKA AKCYJNA': { ticker: 'ING', yahoo: 'ING.WA' },
  '"KRUK" SPÓŁKA AKCYJNA': { ticker: 'KRU', yahoo: 'KRU.WA' },
  '"DOM DEVELOPMENT" SPÓŁKA AKCYJNA': { ticker: 'DOM', yahoo: 'DOM.WA' },
  'LUBELSKI WĘGIEL "BOGDANKA" SPÓŁKA AKCYJNA': { ticker: 'LWB', yahoo: 'LWB.WA' },
  'BENEFIT SYSTEMS SPÓŁKA AKCYJNA': { ticker: 'BFT', yahoo: 'BFT.WA' },
  'Polskie Górnictwo Naftowe i Gazownictwo SA': { ticker: 'PGN', yahoo: 'PGN.WA' },
  'POWSZECHNY ZAKŁAD UBEZPIECZEŃ SPÓŁKA AKCYJNA': { ticker: 'PZU', yahoo: 'PZU.WA' },
  'STALPRODUKT SPÓŁKA AKCYJNA': { ticker: 'STP', yahoo: 'STP.WA' },
  'BNP PARIBAS BANK POLSKA SPÓŁKA AKCYJNA': { ticker: 'BNP', yahoo: 'BNP.WA' },
  'ORANGE POLSKA SPÓŁKA AKCYJNA': { ticker: 'OPL', yahoo: 'OPL.WA' },
  'GRUPA AZOTY SPÓŁKA AKCYJNA': { ticker: 'ATT', yahoo: 'ATT.WA' },
  'INTER CARS SPÓŁKA AKCYJNA': { ticker: 'CAR', yahoo: 'CAR.WA' },
  'ENERGA SPÓŁKA AKCYJNA': { ticker: 'ENG', yahoo: 'ENG.WA' },
  '"EUROCASH" SPÓŁKA AKCYJNA': { ticker: 'EUR', yahoo: 'EUR.WA' },
  'COMARCH SPÓŁKA AKCYJNA': { ticker: 'CMR', yahoo: 'CMR.WA' },
  'Wirtualna Polska Holding Spółka Akcyjna': { ticker: 'WPL', yahoo: 'WPL.WA' },
  'XTB SPÓŁKA AKCYJNA': { ticker: 'XTB', yahoo: 'XTB.WA' },
  'NEUCA SPÓŁKA AKCYJNA': { ticker: 'NEU', yahoo: 'NEU.WA' },
  'ECHO INVESTMENT SPÓŁKA AKCYJNA': { ticker: 'ECH', yahoo: 'ECH.WA' },
  'PLAYWAY SPÓŁKA AKCYJNA': { ticker: 'PLW', yahoo: 'PLW.WA' },
  'Ten Square Games Spółka Akcyjna': { ticker: 'TEN', yahoo: 'TEN.WA' },
  'DEVELIA SPÓŁKA AKCYJNA': { ticker: 'DVL', yahoo: 'DVL.WA' },
  'MERCATOR MEDICAL SPÓŁKA AKCYJNA': { ticker: 'MRC', yahoo: 'MRC.WA' },
  'ALLEGRO.EU': { ticker: 'ALE', yahoo: 'ALE.WA' },
  
  // GREEK COMPANIES (.AT suffix for Athens)
  'Titan': { ticker: 'TITK', yahoo: 'TITK.AT' },
  'CENERGY HOLDINGS': { ticker: 'CENER', yahoo: 'CENER.AT' },
  'VIOHALCO': { ticker: 'VIO', yahoo: 'VIO.AT' },
  'ΔΗΜΟΣΙΑ ΕΠΙΧΕΙΡΗΣΗ ΗΛΕΚΤΡΙΣΜΟΥ Α.Ε.': { ticker: 'PPC', yahoo: 'PPC.AT' },
  'HELLENIQ ENERGY ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ ΣΥΜΜΕΤΟΧΩΝ': { ticker: 'ELPE', yahoo: 'ELPE.AT' },
  'LAMDA DEVELOPMENT ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ ΣΥΜΜΕΤΟΧΩΝ ΚΑΙ ΑΞΙΟΠΟΙΗΣΗΣ ΑΚΙΝΗΤΩΝ': { ticker: 'LAMDA', yahoo: 'LAMDA.AT' },
  'ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΤΗΣ ΕΛΛΑΔΟΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ': { ticker: 'HTO', yahoo: 'HTO.AT' },
  'ΠΕΙΡΑΙΩΣ FINANCIAL HOLDINGS ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ': { ticker: 'TPEIR', yahoo: 'TPEIR.AT' },
  'METLEN ENERGY & METALS ΜΟΝΟΠΡΟΣΩΠΗ Α.Ε.': { ticker: 'METLEN', yahoo: 'METLEN.AT' },
  'ΜΟΤΟΡ ΟΙΛ (ΕΛΛΑΣ) ΔΙΥΛΙΣΤΗΡΙΑ ΚΟΡΙΝΘΟΥ Α.Ε.': { ticker: 'MOH', yahoo: 'MOH.AT' },
  'ΕΘΝΙΚΗ ΤΡΑΠΕΖΑ ΤΗΣ ΕΛΛΑΔΟΣ Α.Ε.': { ticker: 'ETE', yahoo: 'ETE.AT' },
  'JUMBO ΑΝΩΝΥΜΗ ΕΜΠΟΡΙΚΗ ΕΤΑΙΡΕΙΑ': { ticker: 'JUMBO', yahoo: 'JUMBO.AT' },
  'ALPHA ΥΠΗΡΕΣΙΩΝ ΚΑΙ ΣΥΜΜΕΤΟΧΩΝ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ': { ticker: 'ALPHA', yahoo: 'ALPHA.AT' },
  'EUROBANK ERGASIAS ΥΠΗΡΕΣΙΩΝ ΚΑΙ ΣΥΜΜΕΤΟΧΩΝ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ': { ticker: 'EUROB', yahoo: 'EUROB.AT' },
  'ΕΛΛΑΚΤΩΡ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ': { ticker: 'ELLAKTOR', yahoo: 'ELLAKTOR.AT' },
  'ΟΡΓΑΝΙΣΜΟΣ ΠΡΟΓΝΩΣΤΙΚΩΝ ΑΓΩΝΩΝ ΠΟΔΟΣΦΑΙΡΟΥ Α.Ε.': { ticker: 'OPAP', yahoo: 'OPAP.AT' },
};

// Prepare update statement
const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, link_status = 'linked'
  WHERE UPPER(legal_name) = UPPER(?) AND (ticker IS NULL OR ticker = '')
`);

let updated = 0;
let notFound = 0;

for (const [name, mapping] of Object.entries(MAPPINGS)) {
  const result = updateStmt.run(mapping.ticker, mapping.yahoo, name);
  if (result.changes > 0) {
    updated++;
    console.log(`Updated: ${name} -> ${mapping.ticker} (${mapping.yahoo})`);
  } else {
    notFound++;
  }
}

console.log(`\n=== Results ===`);
console.log(`Updated: ${updated} companies`);
console.log(`Not found in DB: ${notFound} companies`);

// Get current stats
const stats = db.prepare(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN ticker IS NOT NULL AND ticker != '' THEN 1 ELSE 0 END) as with_ticker,
    SUM(CASE WHEN link_status = 'no_symbol' THEN 1 ELSE 0 END) as no_symbol,
    SUM(CASE WHEN (ticker IS NULL OR ticker = '') AND link_status != 'no_symbol' THEN 1 ELSE 0 END) as pending
  FROM company_identifiers
`).get();

console.log(`\n=== Database Stats ===`);
console.log(`Total companies: ${stats.total}`);
console.log(`With tickers: ${stats.with_ticker}`);
console.log(`Marked no_symbol: ${stats.no_symbol}`);
console.log(`Pending: ${stats.pending}`);

// Show by country
console.log(`\n=== By Country (with tickers) ===`);
const byCountry = db.prepare(`
  SELECT country, COUNT(*) as cnt 
  FROM company_identifiers 
  WHERE ticker IS NOT NULL AND ticker != ''
  GROUP BY country 
  ORDER BY cnt DESC
`).all();
byCountry.forEach(r => console.log(`${r.country}: ${r.cnt}`));

db.close();
