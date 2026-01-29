// Additional EU/UK Ticker Mappings - Batch 3
// Based on web research January 2026

const Database = require('better-sqlite3');
const db = new Database('/Users/florianschabus/Investment Project/data/stocks.db');

const MAPPINGS = {
  // MORE AUSTRIAN COMPANIES (.VI suffix for Vienna)
  'Rosenbauer International AG': { ticker: 'ROS', yahoo: 'ROS.VI' },
  'STRABAG SE': { ticker: 'STR', yahoo: 'STR.VI' },
  'UNIQA Insurance Group AG': { ticker: 'UQA', yahoo: 'UQA.VI' },
  'VIENNA INSURANCE GROUP AG Wiener Versicherung Gruppe': { ticker: 'VIG', yahoo: 'VIG.VI' },
  'S IMMO AG': { ticker: 'SPI', yahoo: 'SPI.VI' },
  'Semperit Aktiengesellschaft Holding': { ticker: 'SEM', yahoo: 'SEM.VI' },
  'Telekom Austria Aktiengesellschaft': { ticker: 'TKA', yahoo: 'TKA.VI' },
  'Österreichische Post Aktiengesellschaft': { ticker: 'POST', yahoo: 'POST.VI' },
  'CA Immobilien Anlagen AG': { ticker: 'CAI', yahoo: 'CAI.VI' },
  'AGRANA BETEILIGUNGS-AG': { ticker: 'AGR', yahoo: 'AGR.VI' },
  'ANDRITZ AG': { ticker: 'ANDR', yahoo: 'ANDR.VI' },
  'AT&S Austria Technologie & Systemtechnik AG': { ticker: 'ATS', yahoo: 'ATS.VI' },
  'BAWAG Group AG': { ticker: 'BG', yahoo: 'BG.VI' },
  'DO & CO Aktiengesellschaft': { ticker: 'DOC', yahoo: 'DOC.VI' },
  'EVN AG': { ticker: 'EVN', yahoo: 'EVN.VI' },
  'FACC AG': { ticker: 'FACC', yahoo: 'FACC.VI' },
  'Flughafen Wien AG': { ticker: 'FLU', yahoo: 'FLU.VI' },
  'Frequentis AG': { ticker: 'FQT', yahoo: 'FQT.VI' },
  'Immofinanz AG': { ticker: 'IIA', yahoo: 'IIA.VI' },
  'Kapsch TrafficCom AG': { ticker: 'KTCG', yahoo: 'KTCG.VI' },
  'Lenzing AG': { ticker: 'LNZ', yahoo: 'LNZ.VI' },
  'Mayr-Melnhof Karton AG': { ticker: 'MMK', yahoo: 'MMK.VI' },
  'PALFINGER AG': { ticker: 'PAL', yahoo: 'PAL.VI' },
  'Pierer Mobility AG': { ticker: 'PMAG', yahoo: 'PMAG.VI' },
  'PORR AG': { ticker: 'POS', yahoo: 'POS.VI' },
  'Schoeller-Bleckmann Oilfield Equipment AG': { ticker: 'SBO', yahoo: 'SBO.VI' },
  'SBO AG': { ticker: 'SBO', yahoo: 'SBO.VI' },
  'Zumtobel Group AG': { ticker: 'ZAG', yahoo: 'ZAG.VI' },
  'Warimpex Finanz- und Beteiligungs Aktiengesellschaft': { ticker: 'WXF', yahoo: 'WXF.VI' },
  'POLYTEC HOLDING AG': { ticker: 'PYT', yahoo: 'PYT.VI' },
  'Marinomed Biotech AG': { ticker: 'MARI', yahoo: 'MARI.VI' },
  'UBM Development AG': { ticker: 'UBS', yahoo: 'UBS.VI' },
  'VALNEVA SE': { ticker: 'VLA', yahoo: 'VLA.PA' },
  
  // MORE DANISH COMPANIES (.CO suffix for Copenhagen)
  'DAMPSKIBSSELSKABET NORDEN A/S': { ticker: 'DNORD', yahoo: 'DNORD.CO' },
  'FLSMIDTH A/S': { ticker: 'FLS', yahoo: 'FLS.CO' },
  'Better Collective A/S': { ticker: 'BETCO', yahoo: 'BETCO.CO' },
  'CHEMOMETEC A/S': { ticker: 'CHEM', yahoo: 'CHEM.CO' },
  'COLUMBUS A/S': { ticker: 'COLUM', yahoo: 'COLUM.CO' },
  'GABRIEL HOLDING A/S': { ticker: 'GABR', yahoo: 'GABR.CO' },
  'Gabriel Holding A/S': { ticker: 'GABR', yahoo: 'GABR.CO' },
  'NKT A/S': { ticker: 'NKT', yahoo: 'NKT.CO' },
  'Nilfisk Holding A/S': { ticker: 'NLFSK', yahoo: 'NLFSK.CO' },
  'Per Aarsleff Holding A/S': { ticker: 'PAAL', yahoo: 'PAAL.CO' },
  'SimCorp A/S': { ticker: 'SIM', yahoo: 'SIM.CO' },
  'Solar A/S': { ticker: 'SOLAR', yahoo: 'SOLAR-B.CO' },
  'SP Group A/S': { ticker: 'SPG', yahoo: 'SPG.CO' },
  'Spar Nord Bank A/S': { ticker: 'SPNO', yahoo: 'SPNO.CO' },
  'Topdanmark A/S': { ticker: 'TOP', yahoo: 'TOP.CO' },
  'Zealand Pharma A/S': { ticker: 'ZEAL', yahoo: 'ZEAL.CO' },
  'Össur hf.': { ticker: 'OSSR', yahoo: 'OSSR.CO' },
  'Matas A/S': { ticker: 'MATAS', yahoo: 'MATAS.CO' },
  'Alk-Abelló A/S': { ticker: 'ALK-B', yahoo: 'ALK-B.CO' },
  'Ringkjøbing Landbobank A/S': { ticker: 'RILBA', yahoo: 'RILBA.CO' },
  'Harboes Bryggeri A/S': { ticker: 'HARB', yahoo: 'HARB-B.CO' },
  'Borg Automotive A/S': { ticker: 'BORG', yahoo: 'BORG.CO' },
  'CBRAIN A/S': { ticker: 'CBRAIN', yahoo: 'CBRAIN.CO' },
  'Netcompany Group A/S': { ticker: 'NETC', yahoo: 'NETC.CO' },
  'Nnit A/S': { ticker: 'NNIT', yahoo: 'NNIT.CO' },
  
  // MORE NORWEGIAN COMPANIES (.OL suffix for Oslo)
  'NORSK HYDRO ASA': { ticker: 'NHY', yahoo: 'NHY.OL' },
  'YARA INTERNATIONAL ASA': { ticker: 'YAR', yahoo: 'YAR.OL' },
  'TELENOR ASA': { ticker: 'TEL', yahoo: 'TEL.OL' },
  'EQUINOR ASA': { ticker: 'EQNR', yahoo: 'EQNR.OL' },
  'DNB BANK ASA': { ticker: 'DNB', yahoo: 'DNB.OL' },
  'LEROY SEAFOOD GROUP ASA': { ticker: 'LSG', yahoo: 'LSG.OL' },
  'SCHIBSTED ASA': { ticker: 'SCHA', yahoo: 'SCHA.OL' },
  'SPAREBANK 1 SR-BANK ASA': { ticker: 'SRBANK', yahoo: 'SRBANK.OL' },
  'VAAR ENERGI ASA': { ticker: 'VAR', yahoo: 'VAR.OL' },
  'ARCUS ASA': { ticker: 'ARCUS', yahoo: 'ARCUS.OL' },
  'BONHEUR ASA': { ticker: 'BONHR', yahoo: 'BONHR.OL' },
  'CRAYON GROUP HOLDING ASA': { ticker: 'CRAYN', yahoo: 'CRAYN.OL' },
  'EUROPRIS ASA': { ticker: 'EPR', yahoo: 'EPR.OL' },
  'FJORD1 ASA': { ticker: 'FJORD', yahoo: 'FJORD.OL' },
  'FLEX LNG LTD.': { ticker: 'FLNG', yahoo: 'FLNG.OL' },
  'KOMPLETT ASA': { ticker: 'KOMP', yahoo: 'KOMP.OL' },
  'LERØY SEAFOOD GROUP ASA': { ticker: 'LSG', yahoo: 'LSG.OL' },
  'MULTICONSULT ASA': { ticker: 'MULTI', yahoo: 'MULTI.OL' },
  'ODFJELL SE': { ticker: 'ODF', yahoo: 'ODF.OL' },
  'OTELLO CORPORATION ASA': { ticker: 'OTEL', yahoo: 'OTEL.OL' },
  'PHOTOCURE ASA': { ticker: 'PHO', yahoo: 'PHO.OL' },
  'SALMON EVOLUTION ASA': { ticker: 'SALME', yahoo: 'SALME.OL' },
  'SBANKEN ASA': { ticker: 'SBANK', yahoo: 'SBANK.OL' },
  'SPAREBANKEN MØRE': { ticker: 'MORG', yahoo: 'MORG.OL' },
  'SPAREBANKEN ØST': { ticker: 'SPOG', yahoo: 'SPOG.OL' },
  'STOLT-NIELSEN LTD': { ticker: 'SNI', yahoo: 'SNI.OL' },
  'TREASURE ASA': { ticker: 'TRE', yahoo: 'TRE.OL' },
  'VEIDEKKE ASA': { ticker: 'VEI', yahoo: 'VEI.OL' },
  'WILH. WILHELMSEN HOLDING ASA': { ticker: 'WWI', yahoo: 'WWI.OL' },
  'XXL ASA': { ticker: 'XXL', yahoo: 'XXL.OL' },
  '2020 BULKERS LTD.': { ticker: '2020', yahoo: '2020.OL' },
  'AKASTOR ASA': { ticker: 'AKAST', yahoo: 'AKAST.OL' },
  'AKER ASA': { ticker: 'AKER', yahoo: 'AKER.OL' },
  
  // MORE UK COMPANIES (.L suffix for London)
  'ALFA FINANCIAL SOFTWARE HOLDINGS PLC': { ticker: 'ALFA', yahoo: 'ALFA.L' },
  'AMEDEO AIR FOUR PLUS LIMITED': { ticker: 'AA4', yahoo: 'AA4.L' },
  'ASA INTERNATIONAL GROUP PLC': { ticker: 'ASAI', yahoo: 'ASAI.L' },
  'ASCENTIAL PLC': { ticker: 'ASCL', yahoo: 'ASCL.L' },
  'ATRATO ONSITE ENERGY PLC': { ticker: 'ROOF', yahoo: 'ROOF.L' },
  'BEAZLEY PLC': { ticker: 'BEZ', yahoo: 'BEZ.L' },
  'BELLWAY PLC': { ticker: 'BWY', yahoo: 'BWY.L' },
  'BODYCOTE PLC': { ticker: 'BOY', yahoo: 'BOY.L' },
  'BRITVIC PLC': { ticker: 'BVIC', yahoo: 'BVIC.L' },
  'BYTES TECHNOLOGY GROUP PLC': { ticker: 'BYIT', yahoo: 'BYIT.L' },
  'CAIRN HOMES PLC': { ticker: 'CRN', yahoo: 'CRN.L' },
  'CLARKSON PLC': { ticker: 'CKN', yahoo: 'CKN.L' },
  'COMPUTACENTER PLC': { ticker: 'CCC', yahoo: 'CCC.L' },
  'CRANSWICK PLC': { ticker: 'CWK', yahoo: 'CWK.L' },
  'DARKTRACE PLC': { ticker: 'DARK', yahoo: 'DARK.L' },
  'DECHRA PHARMACEUTICALS PLC': { ticker: 'DPH', yahoo: 'DPH.L' },
  'DIPLOMA PLC': { ticker: 'DPLM', yahoo: 'DPLM.L' },
  'ELECTROCOMPONENTS PLC': { ticker: 'ECM', yahoo: 'ECM.L' },
  'ENDEAVOUR MINING PLC': { ticker: 'EDV', yahoo: 'EDV.L' },
  'ESSENTRA PLC': { ticker: 'ESNT', yahoo: 'ESNT.L' },
  'FERREXPO PLC': { ticker: 'FXPO', yahoo: 'FXPO.L' },
  'FIRSTGROUP PLC': { ticker: 'FGP', yahoo: 'FGP.L' },
  'FLUTTER ENTERTAINMENT PLC': { ticker: 'FLTR', yahoo: 'FLTR.L' },
  'GAMES WORKSHOP GROUP PLC': { ticker: 'GAW', yahoo: 'GAW.L' },
  'GENUS PLC': { ticker: 'GNS', yahoo: 'GNS.L' },
  'GRAFTON GROUP PLC': { ticker: 'GFTU', yahoo: 'GFTU.L' },
  'HARBOUR ENERGY PLC': { ticker: 'HBR', yahoo: 'HBR.L' },
  'HAYS PLC': { ticker: 'HAS', yahoo: 'HAS.L' },
  'HOCHSCHILD MINING PLC': { ticker: 'HOC', yahoo: 'HOC.L' },
  'HOMESERVE PLC': { ticker: 'HSV', yahoo: 'HSV.L' },
  'HOWDEN JOINERY GROUP PLC': { ticker: 'HWDN', yahoo: 'HWDN.L' },
  'IG GROUP HOLDINGS PLC': { ticker: 'IGG', yahoo: 'IGG.L' },
  'INDIVIOR PLC': { ticker: 'INDV', yahoo: 'INDV.L' },
  'INTERMEDIATE CAPITAL GROUP PLC': { ticker: 'ICP', yahoo: 'ICP.L' },
  'IP GROUP PLC': { ticker: 'IPO', yahoo: 'IPO.L' },
  'INVESTEC PLC': { ticker: 'INVP', yahoo: 'INVP.L' },
  'JOHN WOOD GROUP PLC': { ticker: 'WG', yahoo: 'WG.L' },
  'JUPITER FUND MANAGEMENT PLC': { ticker: 'JUP', yahoo: 'JUP.L' },
  'KAINOS GROUP PLC': { ticker: 'KNOS', yahoo: 'KNOS.L' },
  'LANCASHIRE HOLDINGS LIMITED': { ticker: 'LRE', yahoo: 'LRE.L' },
  'MAN GROUP PLC': { ticker: 'EMG', yahoo: 'EMG.L' },
  'MARSHALLS PLC': { ticker: 'MSLH', yahoo: 'MSLH.L' },
  'MITCHELLS & BUTLERS PLC': { ticker: 'MAB', yahoo: 'MAB.L' },
  'MORGAN ADVANCED MATERIALS PLC': { ticker: 'MGAM', yahoo: 'MGAM.L' },
  'OSB GROUP PLC': { ticker: 'OSB', yahoo: 'OSB.L' },
  'PAGEGROUP PLC': { ticker: 'PAGE', yahoo: 'PAGE.L' },
  'PETS AT HOME GROUP PLC': { ticker: 'PETS', yahoo: 'PETS.L' },
  'PZ CUSSONS PLC': { ticker: 'PZC', yahoo: 'PZC.L' },
  'QBE INSURANCE GROUP LIMITED': { ticker: 'QBE', yahoo: 'QBE.L' },
  'QUILTER PLC': { ticker: 'QLT', yahoo: 'QLT.L' },
  'REDDE NORTHGATE PLC': { ticker: 'REDD', yahoo: 'REDD.L' },
  'RESTORE PLC': { ticker: 'RST', yahoo: 'RST.L' },
  'ROTORK PLC': { ticker: 'ROR', yahoo: 'ROR.L' },
  'SENIOR PLC': { ticker: 'SNR', yahoo: 'SNR.L' },
  'SPECTRIS PLC': { ticker: 'SXS', yahoo: 'SXS.L' },
  'SPIRENT COMMUNICATIONS PLC': { ticker: 'SPT', yahoo: 'SPT.L' },
  'SPIRE HEALTHCARE GROUP PLC': { ticker: 'SPI', yahoo: 'SPI.L' },
  'ST. MODWEN PROPERTIES PLC': { ticker: 'SMP', yahoo: 'SMP.L' },
  'STAGECOACH GROUP PLC': { ticker: 'SGC', yahoo: 'SGC.L' },
  'SYNTHOMER PLC': { ticker: 'SYNT', yahoo: 'SYNT.L' },
  'TBC BANK GROUP PLC': { ticker: 'TBCG', yahoo: 'TBCG.L' },
  'TYMAN PLC': { ticker: 'TYMN', yahoo: 'TYMN.L' },
  'VICTREX PLC': { ticker: 'VCT', yahoo: 'VCT.L' },
  'VIRGIN MONEY UK PLC': { ticker: 'VMUK', yahoo: 'VMUK.L' },
  'VIVO ENERGY PLC': { ticker: 'VVO', yahoo: 'VVO.L' },
  'WETHERSPOON (J D) PLC': { ticker: 'JDW', yahoo: 'JDW.L' },
  'WIZZ AIR HOLDINGS PLC': { ticker: 'WIZZ', yahoo: 'WIZZ.L' },
  'WOOD GROUP (JOHN) PLC': { ticker: 'WG', yahoo: 'WG.L' },
  
  // FINNISH COMPANIES (.HE suffix for Helsinki)
  'AHLSTROM-MUNKSJÖ OYJ': { ticker: 'AHLSJ', yahoo: 'AHLSJ.HE' },
  'AMER SPORTS OYJ': { ticker: 'AMEAS', yahoo: 'AMEAS.HE' },
  'CARGOTEC OYJ': { ticker: 'CGCBV', yahoo: 'CGCBV.HE' },
  'ELISA OYJ': { ticker: 'ELISA', yahoo: 'ELISA.HE' },
  'FISKARS OYJ ABP': { ticker: 'FSKRS', yahoo: 'FSKRS.HE' },
  'HUHTAMÄKI OYJ': { ticker: 'HUH1V', yahoo: 'HUH1V.HE' },
  'KEMIRA OYJ': { ticker: 'KEMIRA', yahoo: 'KEMIRA.HE' },
  'KESKO OYJ': { ticker: 'KESKOB', yahoo: 'KESKOB.HE' },
  'KOJAMO OYJ': { ticker: 'KOJAMO', yahoo: 'KOJAMO.HE' },
  'KONECRANES OYJ': { ticker: 'KCR', yahoo: 'KCR.HE' },
  'METSA BOARD OYJ': { ticker: 'METSB', yahoo: 'METSB.HE' },
  'METSÄ BOARD OYJ': { ticker: 'METSB', yahoo: 'METSB.HE' },
  'NOKIAN RENKAAT OYJ': { ticker: 'TYRES', yahoo: 'TYRES.HE' },
  'OUTOKUMPU OYJ': { ticker: 'OUT1V', yahoo: 'OUT1V.HE' },
  'OUTOTEC OYJ': { ticker: 'OTE1V', yahoo: 'OTE1V.HE' },
  'SANOMA OYJ': { ticker: 'SANOMA', yahoo: 'SANOMA.HE' },
  'TERVEYSTALO OYJ': { ticker: 'TTALO', yahoo: 'TTALO.HE' },
  'TIETOEVRY OYJ': { ticker: 'TIETO', yahoo: 'TIETO.HE' },
  'VALMET OYJ': { ticker: 'VALMT', yahoo: 'VALMT.HE' },
  'WÄRTSILÄ OYJ ABP': { ticker: 'WRT1V', yahoo: 'WRT1V.HE' },
  'YIT OYJ': { ticker: 'YIT', yahoo: 'YIT.HE' },
  
  // SWEDISH COMPANIES (.ST suffix for Stockholm)
  'ADDTECH AB': { ticker: 'ADDTB', yahoo: 'ADDTB.ST' },
  'AFRY AB': { ticker: 'AFRY', yahoo: 'AFRY.ST' },
  'ALFA LAVAL AB': { ticker: 'ALFA', yahoo: 'ALFA.ST' },
  'AXFOOD AB': { ticker: 'AXFO', yahoo: 'AXFO.ST' },
  'BILLERUD AB': { ticker: 'BILL', yahoo: 'BILL.ST' },
  'BOLIDEN AB': { ticker: 'BOL', yahoo: 'BOL.ST' },
  'CASTELLUM AB': { ticker: 'CAST', yahoo: 'CAST.ST' },
  'DOMETIC GROUP AB': { ticker: 'DOM', yahoo: 'DOM.ST' },
  'ELEKTA AB': { ticker: 'EKTA-B', yahoo: 'EKTA-B.ST' },
  'EPIROC AB': { ticker: 'EPI-A', yahoo: 'EPI-A.ST' },
  'FABEGE AB': { ticker: 'FABG', yahoo: 'FABG.ST' },
  'GETINGE AB': { ticker: 'GETI-B', yahoo: 'GETI-B.ST' },
  'HEXPOL AB': { ticker: 'HPOL-B', yahoo: 'HPOL-B.ST' },
  'HOLMEN AB': { ticker: 'HOLM-B', yahoo: 'HOLM-B.ST' },
  'HUFVUDSTADEN AB': { ticker: 'HUFVA', yahoo: 'HUFVA.ST' },
  'HUSQVARNA AB': { ticker: 'HUSQ-B', yahoo: 'HUSQ-B.ST' },
  'ICA GRUPPEN AB': { ticker: 'ICA', yahoo: 'ICA.ST' },
  'INDUTRADE AB': { ticker: 'INDT', yahoo: 'INDT.ST' },
  'INDUSTRIVÄRDEN AB': { ticker: 'INDUC', yahoo: 'INDUC.ST' },
  'KINNEVIK AB': { ticker: 'KINV-B', yahoo: 'KINV-B.ST' },
  'LATOUR INVESTMENT AB': { ticker: 'LATO-B', yahoo: 'LATO-B.ST' },
  'LIFCO AB': { ticker: 'LIFCO-B', yahoo: 'LIFCO-B.ST' },
  'LUNDBERGFÖRETAGEN AB': { ticker: 'LUND-B', yahoo: 'LUND-B.ST' },
  'MEDICOVER AB': { ticker: 'MCOV-B', yahoo: 'MCOV-B.ST' },
  'NIBE INDUSTRIER AB': { ticker: 'NIBE-B', yahoo: 'NIBE-B.ST' },
  'PEAB AB': { ticker: 'PEAB-B', yahoo: 'PEAB-B.ST' },
  'RATOS AB': { ticker: 'RATO-B', yahoo: 'RATO-B.ST' },
  'SAAB AB': { ticker: 'SAAB-B', yahoo: 'SAAB-B.ST' },
  'SCA AB': { ticker: 'SCA-B', yahoo: 'SCA-B.ST' },
  'SKANSKA AB': { ticker: 'SKA-B', yahoo: 'SKA-B.ST' },
  'SWECO AB': { ticker: 'SWEC-B', yahoo: 'SWEC-B.ST' },
  'SWEDISH MATCH AB': { ticker: 'SWMA', yahoo: 'SWMA.ST' },
  'TRELLEBORG AB': { ticker: 'TREL-B', yahoo: 'TREL-B.ST' },
  'WALLENSTAM AB': { ticker: 'WALL-B', yahoo: 'WALL-B.ST' },
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
