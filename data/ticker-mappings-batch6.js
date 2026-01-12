/**
 * Ticker Mappings Batch 6 - French, Italian, Spanish Companies
 *
 * Maps EU companies from XBRL filings to Yahoo Finance symbols.
 * France (.PA), Italy (.MI), Spain (.MC)
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// French company mappings (Euronext Paris - .PA suffix)
const FRENCH_MAPPINGS = {
  'ABIONYX PHARMA': { ticker: 'ABNX', yahoo: 'ABNX.PA' },
  'ACTEOS': { ticker: 'EOS', yahoo: 'EOS.PA' },
  'ACTIA GROUP': { ticker: 'ATI', yahoo: 'ATI.PA' },
  'AFFLUENT MEDICAL': { ticker: 'AFME', yahoo: 'AFME.PA' },
  'ALBIOMA': { ticker: 'ABIO', yahoo: 'ABIO.PA' },
  'ALTAMIR': { ticker: 'LTA', yahoo: 'LTA.PA' },
  'ALTEN': { ticker: 'ATE', yahoo: 'ATE.PA' },
  'AMPLITUDE SURGICAL': { ticker: 'AMPLI', yahoo: 'AMPLI.PA' },
  'ARAMIS GROUP': { ticker: 'ARAMI', yahoo: 'ARAMI.PA' },
  'ARGAN': { ticker: 'ARG', yahoo: 'ARG.PA' },
  'ASSYSTEM': { ticker: 'ASY', yahoo: 'ASY.PA' },
  'AUREA': { ticker: 'AURE', yahoo: 'AURE.PA' },
  'BALYO': { ticker: 'BALYO', yahoo: 'BALYO.PA' },
  'BERTRAND': { ticker: 'BER', yahoo: 'BER.PA' },
  'BIOMERIEUX': { ticker: 'BIM', yahoo: 'BIM.PA' },
  'BOIRON': { ticker: 'BOI', yahoo: 'BOI.PA' },
  'BOLLORE': { ticker: 'BOL', yahoo: 'BOL.PA' },
  'BOURSE DIRECT': { ticker: 'BSD', yahoo: 'BSD.PA' },
  'CAPGEMINI': { ticker: 'CAP', yahoo: 'CAP.PA' },
  'CARMILA': { ticker: 'CARM', yahoo: 'CARM.PA' },
  'CATERING INTERNATIONAL': { ticker: 'CTRG', yahoo: 'CTRG.PA' },
  'CEGEDIM': { ticker: 'CGM', yahoo: 'CGM.PA' },
  'CNP ASSURANCES': { ticker: 'CNP', yahoo: 'CNP.PA' },
  'CHARGEURS': { ticker: 'CRI', yahoo: 'CRI.PA' },
  'COMPAGNIE CHARGEURS': { ticker: 'CRI', yahoo: 'CRI.PA' },
  'SAINT-GOBAIN': { ticker: 'SGO', yahoo: 'SGO.PA' },
  'COMPAGNIE DE SAINT-GOBAIN': { ticker: 'SGO', yahoo: 'SGO.PA' },
  'MICHELIN': { ticker: 'ML', yahoo: 'ML.PA' },
  'COMPAGNIE GENERALE DES ETABLISSEMENTS MICHELIN': { ticker: 'ML', yahoo: 'ML.PA' },
  'COMPAGNIE LEBON': { ticker: 'LBON', yahoo: 'LBON.PA' },
  'COFACE': { ticker: 'COFA', yahoo: 'COFA.PA' },
  'DASSAULT': { ticker: 'AM', yahoo: 'AM.PA' },
  'DASSAULT SYSTEMES': { ticker: 'DSY', yahoo: 'DSY.PA' },
  'DERICHEBOURG': { ticker: 'DBG', yahoo: 'DBG.PA' },
  'EDENRED': { ticker: 'EDEN', yahoo: 'EDEN.PA' },
  'EDF': { ticker: 'EDF', yahoo: 'EDF.PA' },
  'ELECTRICITE DE FRANCE': { ticker: 'EDF', yahoo: 'EDF.PA' },
  'ELIOR': { ticker: 'ELIOR', yahoo: 'ELIOR.PA' },
  'ENGIE': { ticker: 'ENGI', yahoo: 'ENGI.PA' },
  'ERAMET': { ticker: 'ERA', yahoo: 'ERA.PA' },
  'ESSILOR': { ticker: 'EL', yahoo: 'EL.PA' },
  'EURAZEO': { ticker: 'RF', yahoo: 'RF.PA' },
  'EUROFINS': { ticker: 'ERF', yahoo: 'ERF.PA' },
  'EUTELSAT': { ticker: 'ETL', yahoo: 'ETL.PA' },
  'FAURECIA': { ticker: 'EO', yahoo: 'EO.PA' },
  'FORVIA': { ticker: 'EO', yahoo: 'FRVIA.PA' },
  'GECINA': { ticker: 'GFC', yahoo: 'GFC.PA' },
  'GETLINK': { ticker: 'GET', yahoo: 'GET.PA' },
  'GL EVENTS': { ticker: 'GLO', yahoo: 'GLO.PA' },
  'GROUPAMA': { ticker: 'CGRP', yahoo: 'CGRP.PA' },
  'HERMES': { ticker: 'RMS', yahoo: 'RMS.PA' },
  'ICADE': { ticker: 'ICAD', yahoo: 'ICAD.PA' },
  'ILIAD': { ticker: 'ILD', yahoo: 'ILD.PA' },
  'IMERYS': { ticker: 'NK', yahoo: 'NK.PA' },
  'IPSEN': { ticker: 'IPN', yahoo: 'IPN.PA' },
  'IPSOS': { ticker: 'IPS', yahoo: 'IPS.PA' },
  'JC DECAUX': { ticker: 'DEC', yahoo: 'DEC.PA' },
  'KERING': { ticker: 'KER', yahoo: 'KER.PA' },
  'KLEPIERRE': { ticker: 'LI', yahoo: 'LI.PA' },
  'KORIAN': { ticker: 'KORI', yahoo: 'KORI.PA' },
  'LAGARDERE': { ticker: 'MMB', yahoo: 'MMB.PA' },
  'LEGRAND': { ticker: 'LR', yahoo: 'LR.PA' },
  'LVMH': { ticker: 'MC', yahoo: 'MC.PA' },
  'M6': { ticker: 'MMT', yahoo: 'MMT.PA' },
  'MAISONS DU MONDE': { ticker: 'MDM', yahoo: 'MDM.PA' },
  'MERSEN': { ticker: 'MRN', yahoo: 'MRN.PA' },
  'NATIXIS': { ticker: 'KN', yahoo: 'KN.PA' },
  'NEXANS': { ticker: 'NEX', yahoo: 'NEX.PA' },
  'NEXITY': { ticker: 'NXI', yahoo: 'NXI.PA' },
  'OREAL': { ticker: 'OR', yahoo: 'OR.PA' },
  'ORPEA': { ticker: 'ORP', yahoo: 'ORP.PA' },
  'PERNOD RICARD': { ticker: 'RI', yahoo: 'RI.PA' },
  'PEUGEOT': { ticker: 'UG', yahoo: 'UG.PA' },
  'PLASTIC OMNIUM': { ticker: 'POM', yahoo: 'POM.PA' },
  'PUBLICIS': { ticker: 'PUB', yahoo: 'PUB.PA' },
  'RALLYE': { ticker: 'RAL', yahoo: 'RAL.PA' },
  'REMY COINTREAU': { ticker: 'RCO', yahoo: 'RCO.PA' },
  'RENAULT': { ticker: 'RNO', yahoo: 'RNO.PA' },
  'REXEL': { ticker: 'RXL', yahoo: 'RXL.PA' },
  'RUBIS': { ticker: 'RUI', yahoo: 'RUI.PA' },
  'SAFRAN': { ticker: 'SAF', yahoo: 'SAF.PA' },
  'SANOFI': { ticker: 'SAN', yahoo: 'SAN.PA' },
  'SARTORIUS STEDIM': { ticker: 'DIM', yahoo: 'DIM.PA' },
  'SCHNEIDER': { ticker: 'SU', yahoo: 'SU.PA' },
  'SEB': { ticker: 'SK', yahoo: 'SK.PA' },
  'SES-IMAGOTAG': { ticker: 'SESL', yahoo: 'SESL.PA' },
  'SODEXO': { ticker: 'SW', yahoo: 'SW.PA' },
  'SOITEC': { ticker: 'SOI', yahoo: 'SOI.PA' },
  'SOLVAY': { ticker: 'SOLB', yahoo: 'SOLB.PA' },
  'SOPRA': { ticker: 'SOP', yahoo: 'SOP.PA' },
  'SPIE': { ticker: 'SPIE', yahoo: 'SPIE.PA' },
  'STEF': { ticker: 'STF', yahoo: 'STF.PA' },
  'STELLANTIS': { ticker: 'STLAP', yahoo: 'STLAP.PA' },
  'SUEZ': { ticker: 'SEV', yahoo: 'SEV.PA' },
  'TARKETT': { ticker: 'TKTT', yahoo: 'TKTT.PA' },
  'TECHNICOLOR': { ticker: 'TCH', yahoo: 'TCH.PA' },
  'TELEPERFORMANCE': { ticker: 'TEP', yahoo: 'TEP.PA' },
  'TF1': { ticker: 'TFI', yahoo: 'TFI.PA' },
  'THALES': { ticker: 'HO', yahoo: 'HO.PA' },
  'TOTAL': { ticker: 'TTE', yahoo: 'TTE.PA' },
  'TOTALENERGIES': { ticker: 'TTE', yahoo: 'TTE.PA' },
  'TRIGANO': { ticker: 'TRI', yahoo: 'TRI.PA' },
  'UBISOFT': { ticker: 'UBI', yahoo: 'UBI.PA' },
  'UNIBAIL': { ticker: 'URW', yahoo: 'URW.PA' },
  'VALEO': { ticker: 'FR', yahoo: 'FR.PA' },
  'VALLOUREC': { ticker: 'VK', yahoo: 'VK.PA' },
  'VEOLIA': { ticker: 'VIE', yahoo: 'VIE.PA' },
  'VINCI': { ticker: 'DG', yahoo: 'DG.PA' },
  'VIRBAC': { ticker: 'VIRP', yahoo: 'VIRP.PA' },
  'VIVENDI': { ticker: 'VIV', yahoo: 'VIV.PA' },
  'WENDEL': { ticker: 'MF', yahoo: 'MF.PA' },
  'WORLDLINE': { ticker: 'WLN', yahoo: 'WLN.PA' },
};

// Italian company mappings (Borsa Italiana - .MI suffix)
const ITALIAN_MAPPINGS = {
  'A2A': { ticker: 'A2A', yahoo: 'A2A.MI' },
  'A2A ENERGIA': { ticker: 'A2A', yahoo: 'A2A.MI' },
  'ABITARE IN': { ticker: 'ABT', yahoo: 'ABT.MI' },
  'ACINQUE': { ticker: 'AC5', yahoo: 'AC5.MI' },
  'AEDES': { ticker: 'AED', yahoo: 'AED.MI' },
  'AEROPORTO GUGLIELMO MARCONI DI BOLOGNA': { ticker: 'ADB', yahoo: 'ADB.MI' },
  'ALERION': { ticker: 'ARN', yahoo: 'ARN.MI' },
  'ALERION CLEAN POWER': { ticker: 'ARN', yahoo: 'ARN.MI' },
  'ALKEMY': { ticker: 'ALK', yahoo: 'ALK.MI' },
  'ALTEA GREEN POWER': { ticker: 'AGP', yahoo: 'AGP.MI' },
  'AMPLIFON': { ticker: 'AMP', yahoo: 'AMP.MI' },
  'ANIMA': { ticker: 'ANIM', yahoo: 'ANIM.MI' },
  'ANTARES VISION': { ticker: 'AV', yahoo: 'AV.MI' },
  'AQUAFIL': { ticker: 'ECNL', yahoo: 'ECNL.MI' },
  'ASCOPIAVE': { ticker: 'ASC', yahoo: 'ASC.MI' },
  'ATLANTIA': { ticker: 'ATL', yahoo: 'ATL.MI' },
  'AUTOGRILL': { ticker: 'AGL', yahoo: 'AGL.MI' },
  'AZIMUT': { ticker: 'AZM', yahoo: 'AZM.MI' },
  'B&C SPEAKERS': { ticker: 'BEC', yahoo: 'BEC.MI' },
  'BANCA GENERALI': { ticker: 'BGN', yahoo: 'BGN.MI' },
  'BANCA MEDIOLANUM': { ticker: 'BMED', yahoo: 'BMED.MI' },
  'BANCA MONTE DEI PASCHI': { ticker: 'BMPS', yahoo: 'BMPS.MI' },
  'BANCA POPOLARE DI SONDRIO': { ticker: 'BPSO', yahoo: 'BPSO.MI' },
  'BANCA PROFILO': { ticker: 'PRO', yahoo: 'PRO.MI' },
  'BANCA SISTEMA': { ticker: 'BST', yahoo: 'BST.MI' },
  'BANCO BPM': { ticker: 'BAMI', yahoo: 'BAMI.MI' },
  'BASIC NET': { ticker: 'BAN', yahoo: 'BAN.MI' },
  'BEGHELLI': { ticker: 'BE', yahoo: 'BE.MI' },
  'BIALETTI': { ticker: 'BIALETTI', yahoo: 'BIALETTI.MI' },
  'BIALETTI INDUSTRIE': { ticker: 'BIALETTI', yahoo: 'BIALETTI.MI' },
  'BIESSE': { ticker: 'BSS', yahoo: 'BSS.MI' },
  'BPER': { ticker: 'BPE', yahoo: 'BPE.MI' },
  'BREMBO': { ticker: 'BRE', yahoo: 'BRE.MI' },
  'BRUNELLO CUCINELLI': { ticker: 'BC', yahoo: 'BC.MI' },
  'BUZZI': { ticker: 'BZU', yahoo: 'BZU.MI' },
  'CAIRO COMMUNICATION': { ticker: 'CAI', yahoo: 'CAI.MI' },
  'CALTAGIRONE': { ticker: 'CALT', yahoo: 'CALT.MI' },
  'CAMPARI': { ticker: 'CPR', yahoo: 'CPR.MI' },
  'CELLULARLINE': { ticker: 'CELL', yahoo: 'CELL.MI' },
  'CERVED': { ticker: 'CERV', yahoo: 'CERV.MI' },
  'CIR': { ticker: 'CIR', yahoo: 'CIR.MI' },
  'CLASS EDITORI': { ticker: 'CLA', yahoo: 'CLA.MI' },
  'CNH INDUSTRIAL': { ticker: 'CNHI', yahoo: 'CNHI.MI' },
  'COFIDE': { ticker: 'COF', yahoo: 'COF.MI' },
  'COMER INDUSTRIES': { ticker: 'COM', yahoo: 'COM.MI' },
  'CREDITO EMILIANO': { ticker: 'CE', yahoo: 'CE.MI' },
  'CREDEM': { ticker: 'CE', yahoo: 'CE.MI' },
  'CY4GATE': { ticker: 'CY4', yahoo: 'CY4.MI' },
  'DANIELI': { ticker: 'DAN', yahoo: 'DAN.MI' },
  'DATALOGIC': { ticker: 'DAL', yahoo: 'DAL.MI' },
  'DE LONGHI': { ticker: 'DLG', yahoo: 'DLG.MI' },
  'DIASORIN': { ticker: 'DIA', yahoo: 'DIA.MI' },
  'DIGITAL BROS': { ticker: 'DIB', yahoo: 'DIB.MI' },
  'DOVALUE': { ticker: 'DOV', yahoo: 'DOV.MI' },
  'ELES': { ticker: 'ELES', yahoo: 'ELES.MI' },
  'ELICA': { ticker: 'ELC', yahoo: 'ELC.MI' },
  'EMAK': { ticker: 'EM', yahoo: 'EM.MI' },
  'ENEL': { ticker: 'ENEL', yahoo: 'ENEL.MI' },
  'ENI': { ticker: 'ENI', yahoo: 'ENI.MI' },
  'ERG': { ticker: 'ERG', yahoo: 'ERG.MI' },
  'EXOR': { ticker: 'EXO', yahoo: 'EXO.MI' },
  'FILA': { ticker: 'FILA', yahoo: 'FILA.MI' },
  'FINE FOODS': { ticker: 'FF', yahoo: 'FF.MI' },
  'FINE FOODS & PHARMACEUTICALS': { ticker: 'FF', yahoo: 'FF.MI' },
  'FINCANTIERI': { ticker: 'FCT', yahoo: 'FCT.MI' },
  'FINECOBANK': { ticker: 'FBK', yahoo: 'FBK.MI' },
  'GENERALI': { ticker: 'G', yahoo: 'G.MI' },
  'GEOX': { ticker: 'GEO', yahoo: 'GEO.MI' },
  'GVS': { ticker: 'GVS', yahoo: 'GVS.MI' },
  'HERA': { ticker: 'HER', yahoo: 'HER.MI' },
  'IGD': { ticker: 'IGD', yahoo: 'IGD.MI' },
  'ILLIMITY': { ticker: 'ILTY', yahoo: 'ILTY.MI' },
  'IMMSI': { ticker: 'IMS', yahoo: 'IMS.MI' },
  'INTERPUMP': { ticker: 'IP', yahoo: 'IP.MI' },
  'INTESA SANPAOLO': { ticker: 'ISP', yahoo: 'ISP.MI' },
  'INWIT': { ticker: 'INW', yahoo: 'INW.MI' },
  'IREN': { ticker: 'IRE', yahoo: 'IRE.MI' },
  'ITALGAS': { ticker: 'IG', yahoo: 'IG.MI' },
  'IVECO': { ticker: 'IVG', yahoo: 'IVG.MI' },
  'JUVENTUS': { ticker: 'JUVE', yahoo: 'JUVE.MI' },
  'LEONARDO': { ticker: 'LDO', yahoo: 'LDO.MI' },
  'LU-VE': { ticker: 'LUVE', yahoo: 'LUVE.MI' },
  'MARR': { ticker: 'MARR', yahoo: 'MARR.MI' },
  'MASI': { ticker: 'MSI', yahoo: 'MSI.MI' },
  'MEDIASET': { ticker: 'MS', yahoo: 'MS.MI' },
  'MEDIOBANCA': { ticker: 'MB', yahoo: 'MB.MI' },
  'MONCLER': { ticker: 'MONC', yahoo: 'MONC.MI' },
  'MONDADORI': { ticker: 'MN', yahoo: 'MN.MI' },
  'MONRIF': { ticker: 'MON', yahoo: 'MON.MI' },
  'NEXI': { ticker: 'NEXI', yahoo: 'NEXI.MI' },
  'OVS': { ticker: 'OVS', yahoo: 'OVS.MI' },
  'PIAGGIO': { ticker: 'PIA', yahoo: 'PIA.MI' },
  'PIRELLI': { ticker: 'PIRC', yahoo: 'PIRC.MI' },
  'POSTE ITALIANE': { ticker: 'PST', yahoo: 'PST.MI' },
  'PRADA': { ticker: '1913', yahoo: '1913.MI' },
  'PRYSMIAN': { ticker: 'PRY', yahoo: 'PRY.MI' },
  'RAIWAY': { ticker: 'RWAY', yahoo: 'RWAY.MI' },
  'RECORDATI': { ticker: 'REC', yahoo: 'REC.MI' },
  'REPLY': { ticker: 'REY', yahoo: 'REY.MI' },
  'SAFILO': { ticker: 'SFL', yahoo: 'SFL.MI' },
  'SAIPEM': { ticker: 'SPM', yahoo: 'SPM.MI' },
  'SALVATORE FERRAGAMO': { ticker: 'SFER', yahoo: 'SFER.MI' },
  'SARAS': { ticker: 'SRS', yahoo: 'SRS.MI' },
  'SESA': { ticker: 'SES', yahoo: 'SES.MI' },
  'SNAM': { ticker: 'SRG', yahoo: 'SRG.MI' },
  'SOL': { ticker: 'SOL', yahoo: 'SOL.MI' },
  'STELLANTIS': { ticker: 'STLAM', yahoo: 'STLAM.MI' },
  'STM': { ticker: 'STMMI', yahoo: 'STMMI.MI' },
  'TECHNOGYM': { ticker: 'TGYM', yahoo: 'TGYM.MI' },
  'TELECOM ITALIA': { ticker: 'TIT', yahoo: 'TIT.MI' },
  'TENARIS': { ticker: 'TEN', yahoo: 'TEN.MI' },
  'TERNA': { ticker: 'TRN', yahoo: 'TRN.MI' },
  'TINEXTA': { ticker: 'TNXT', yahoo: 'TNXT.MI' },
  'TOD\'S': { ticker: 'TOD', yahoo: 'TOD.MI' },
  'UNICREDIT': { ticker: 'UCG', yahoo: 'UCG.MI' },
  'UNIPOL': { ticker: 'UNI', yahoo: 'UNI.MI' },
  'UNIPOLSAI': { ticker: 'US', yahoo: 'US.MI' },
  'WEBUILD': { ticker: 'WBD', yahoo: 'WBD.MI' },
  'ZIGNAGO VETRO': { ticker: 'ZV', yahoo: 'ZV.MI' },
};

// Spanish company mappings (Bolsa de Madrid - .MC suffix)
const SPANISH_MAPPINGS = {
  'ADOLFO DOMINGUEZ': { ticker: 'ADZ', yahoo: 'ADZ.MC' },
  'AEDAS HOMES': { ticker: 'AEDAS', yahoo: 'AEDAS.MC' },
  'AENA': { ticker: 'AENA', yahoo: 'AENA.MC' },
  'AIRTIFICIAL': { ticker: 'AI', yahoo: 'AI.MC' },
  'ALANTRA': { ticker: 'ALNT', yahoo: 'ALNT.MC' },
  'ALMIRALL': { ticker: 'ALM', yahoo: 'ALM.MC' },
  'AMADEUS': { ticker: 'AMS', yahoo: 'AMS.MC' },
  'AMPER': { ticker: 'AMP', yahoo: 'AMP.MC' },
  'APPLUS': { ticker: 'APPS', yahoo: 'APPS.MC' },
  'APPLUS SERVICES': { ticker: 'APPS', yahoo: 'APPS.MC' },
  'ARIMA REAL ESTATE': { ticker: 'ARM', yahoo: 'ARM.MC' },
  'ATRYS HEALTH': { ticker: 'ATRY', yahoo: 'ATRY.MC' },
  'AUDAX RENOVABLES': { ticker: 'ADX', yahoo: 'ADX.MC' },
  'AZKOYEN': { ticker: 'AZK', yahoo: 'AZK.MC' },
  'BANCO SANTANDER': { ticker: 'SAN', yahoo: 'SAN.MC' },
  'BANCO SABADELL': { ticker: 'SAB', yahoo: 'SAB.MC' },
  'BANCO DE SABADELL': { ticker: 'SAB', yahoo: 'SAB.MC' },
  'BANKINTER': { ticker: 'BKT', yahoo: 'BKT.MC' },
  'BBVA': { ticker: 'BBVA', yahoo: 'BBVA.MC' },
  'BODEGAS RIOJANAS': { ticker: 'RIO', yahoo: 'RIO.MC' },
  'BORGES': { ticker: 'BAIN', yahoo: 'BAIN.MC' },
  'CAIXABANK': { ticker: 'CABK', yahoo: 'CABK.MC' },
  'CELLNEX': { ticker: 'CLNX', yahoo: 'CLNX.MC' },
  'CEMENTOS MOLINS': { ticker: 'MOL', yahoo: 'MOL.MC' },
  'CLINICA BAVIERA': { ticker: 'CBAV', yahoo: 'CBAV.MC' },
  'COLONIAL': { ticker: 'COL', yahoo: 'COL.MC' },
  'DEOLEO': { ticker: 'OLE', yahoo: 'OLE.MC' },
  'DIA': { ticker: 'DIA', yahoo: 'DIA.MC' },
  'DISTRIBUIDORA INTERNACIONAL DE ALIMENTACION': { ticker: 'DIA', yahoo: 'DIA.MC' },
  'DURO FELGUERA': { ticker: 'MDF', yahoo: 'MDF.MC' },
  'EBRO FOODS': { ticker: 'EBRO', yahoo: 'EBRO.MC' },
  'ECOENER': { ticker: 'ECNR', yahoo: 'ECNR.MC' },
  'EDREAMS ODIGEO': { ticker: 'EDR', yahoo: 'EDR.MC' },
  'ENDESA': { ticker: 'ELE', yahoo: 'ELE.MC' },
  'ENAGAS': { ticker: 'ENG', yahoo: 'ENG.MC' },
  'ENCE': { ticker: 'ENC', yahoo: 'ENC.MC' },
  'ERCROS': { ticker: 'ECR', yahoo: 'ECR.MC' },
  'FAES FARMA': { ticker: 'FAE', yahoo: 'FAE.MC' },
  'FERROVIAL': { ticker: 'FER', yahoo: 'FER.MC' },
  'FLUIDRA': { ticker: 'FDR', yahoo: 'FDR.MC' },
  'GESTAMP': { ticker: 'GEST', yahoo: 'GEST.MC' },
  'GRIFOLS': { ticker: 'GRF', yahoo: 'GRF.MC' },
  'IAG': { ticker: 'IAG', yahoo: 'IAG.MC' },
  'IBERDROLA': { ticker: 'IBE', yahoo: 'IBE.MC' },
  'IBERPAPEL': { ticker: 'IBG', yahoo: 'IBG.MC' },
  'INDITEX': { ticker: 'ITX', yahoo: 'ITX.MC' },
  'INDRA': { ticker: 'IDR', yahoo: 'IDR.MC' },
  'LAR ESPANA': { ticker: 'LRE', yahoo: 'LRE.MC' },
  'LIBERBANK': { ticker: 'LBK', yahoo: 'LBK.MC' },
  'LINGOTES ESPECIALES': { ticker: 'LGT', yahoo: 'LGT.MC' },
  'LOGISTA': { ticker: 'LOG', yahoo: 'LOG.MC' },
  'MAPFRE': { ticker: 'MAP', yahoo: 'MAP.MC' },
  'MEDIASET ESPANA': { ticker: 'TL5', yahoo: 'TL5.MC' },
  'MELIA': { ticker: 'MEL', yahoo: 'MEL.MC' },
  'MERLIN': { ticker: 'MRL', yahoo: 'MRL.MC' },
  'METROVACESA': { ticker: 'MVC', yahoo: 'MVC.MC' },
  'MIQUEL Y COSTAS': { ticker: 'MCM', yahoo: 'MCM.MC' },
  'NATRA': { ticker: 'NAT', yahoo: 'NAT.MC' },
  'NATURGY': { ticker: 'NTGY', yahoo: 'NTGY.MC' },
  'NH HOTEL': { ticker: 'NHH', yahoo: 'NHH.MC' },
  'NEINOR HOMES': { ticker: 'HOME', yahoo: 'HOME.MC' },
  'ORYZON': { ticker: 'ORY', yahoo: 'ORY.MC' },
  'PHARMA MAR': { ticker: 'PHM', yahoo: 'PHM.MC' },
  'PRISA': { ticker: 'PRS', yahoo: 'PRS.MC' },
  'PROSEGUR': { ticker: 'PSG', yahoo: 'PSG.MC' },
  'REALIA': { ticker: 'RLIA', yahoo: 'RLIA.MC' },
  'RED ELECTRICA': { ticker: 'RED', yahoo: 'RED.MC' },
  'RENTA CORPORACION': { ticker: 'REN', yahoo: 'REN.MC' },
  'REPSOL': { ticker: 'REP', yahoo: 'REP.MC' },
  'ROVI': { ticker: 'ROVI', yahoo: 'ROVI.MC' },
  'SACYR': { ticker: 'SCYR', yahoo: 'SCYR.MC' },
  'SOLARPACK': { ticker: 'SPK', yahoo: 'SPK.MC' },
  'SOLARIA': { ticker: 'SLR', yahoo: 'SLR.MC' },
  'TALGO': { ticker: 'TLGO', yahoo: 'TLGO.MC' },
  'TELEFONICA': { ticker: 'TEF', yahoo: 'TEF.MC' },
  'UNICAJA': { ticker: 'UNI', yahoo: 'UNI.MC' },
  'VIDRALA': { ticker: 'VID', yahoo: 'VID.MC' },
  'VISCOFAN': { ticker: 'VIS', yahoo: 'VIS.MC' },
  'ZARDOYA OTIS': { ticker: 'ZOT', yahoo: 'ZOT.MC' },
};

// Prepare update statement
const updateStmt = db.prepare(`
  UPDATE company_identifiers
  SET ticker = ?, yahoo_symbol = ?, link_status = 'linked'
  WHERE id = ?
`);

function processCountry(country, mappings, suffix) {
  const pending = db.prepare(`
    SELECT id, legal_name
    FROM company_identifiers
    WHERE country = ?
    AND link_status = 'pending'
    AND (ticker IS NULL OR ticker = '')
  `).all(country);

  console.log(`\n=== ${country} Companies (${pending.length} pending) ===`);

  let updated = 0;
  let notFound = [];

  for (const company of pending) {
    const cleanName = company.legal_name
      .toUpperCase()
      .replace(/^["']|["']$/g, '')
      .replace(/\s*S\.?A\.?\s*$/i, '')
      .replace(/\s*S\.?P\.?A\.?\s*$/i, '')
      .replace(/\s*S\.?E\.?\s*$/i, '')
      .replace(/\s*PLC\s*$/i, '')
      .replace(/\s*SOCIETE ANONYME\s*$/i, '')
      .replace(/\s*SOCIETA' PER AZIONI\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    let matched = false;

    for (const [pattern, data] of Object.entries(mappings)) {
      const cleanPattern = pattern.toUpperCase().trim();

      if (cleanName === cleanPattern ||
          cleanName.includes(cleanPattern) ||
          (cleanPattern.length > 5 && cleanName.startsWith(cleanPattern.substring(0, Math.min(cleanPattern.length, 10))))) {
        updateStmt.run(data.ticker, data.yahoo, company.id);
        console.log(`✓ ${company.legal_name.substring(0, 50)} → ${data.yahoo}`);
        updated++;
        matched = true;
        break;
      }
    }

    if (!matched) {
      notFound.push(company.legal_name);
    }
  }

  console.log(`\nUpdated: ${updated}, Not found: ${notFound.length}`);
  return { updated, notFound };
}

// Process each country
const frResults = processCountry('FR', FRENCH_MAPPINGS, '.PA');
const itResults = processCountry('IT', ITALIAN_MAPPINGS, '.MI');
const esResults = processCountry('ES', SPANISH_MAPPINGS, '.MC');

// Show final stats
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
console.log(`\nTotal updated this batch: ${frResults.updated + itResults.updated + esResults.updated}`);

db.close();
