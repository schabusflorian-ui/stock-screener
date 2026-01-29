// populate-sectors.js
// Maps SIC codes to sectors and updates companies table

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stocks.db');
const db = new Database(dbPath);

// SIC Division to Sector mapping (based on standard SIC classification)
// https://www.osha.gov/data/sic-manual
const SIC_SECTOR_MAP = {
  // Division A: Agriculture, Forestry, and Fishing (01-09)
  '01': 'Agriculture',
  '02': 'Agriculture',
  '07': 'Agriculture',
  '08': 'Agriculture',
  '09': 'Agriculture',

  // Division B: Mining (10-14)
  '10': 'Mining',
  '12': 'Mining',
  '13': 'Mining',
  '14': 'Mining',

  // Division C: Construction (15-17)
  '15': 'Construction',
  '16': 'Construction',
  '17': 'Construction',

  // Division D: Manufacturing (20-39)
  '20': 'Manufacturing',
  '21': 'Manufacturing',
  '22': 'Manufacturing',
  '23': 'Manufacturing',
  '24': 'Manufacturing',
  '25': 'Manufacturing',
  '26': 'Manufacturing',
  '27': 'Manufacturing',
  '28': 'Manufacturing',
  '29': 'Manufacturing',
  '30': 'Manufacturing',
  '31': 'Manufacturing',
  '32': 'Manufacturing',
  '33': 'Manufacturing',
  '34': 'Manufacturing',
  '35': 'Manufacturing',
  '36': 'Manufacturing',
  '37': 'Manufacturing',
  '38': 'Manufacturing',
  '39': 'Manufacturing',

  // Division E: Transportation, Communications, Electric, Gas, and Sanitary Services (40-49)
  '40': 'Transportation & Utilities',
  '41': 'Transportation & Utilities',
  '42': 'Transportation & Utilities',
  '43': 'Transportation & Utilities',
  '44': 'Transportation & Utilities',
  '45': 'Transportation & Utilities',
  '46': 'Transportation & Utilities',
  '47': 'Transportation & Utilities',
  '48': 'Communication',
  '49': 'Utilities',

  // Division F: Wholesale Trade (50-51)
  '50': 'Wholesale Trade',
  '51': 'Wholesale Trade',

  // Division G: Retail Trade (52-59)
  '52': 'Retail Trade',
  '53': 'Retail Trade',
  '54': 'Retail Trade',
  '55': 'Retail Trade',
  '56': 'Retail Trade',
  '57': 'Retail Trade',
  '58': 'Retail Trade',
  '59': 'Retail Trade',

  // Division H: Finance, Insurance, and Real Estate (60-67)
  '60': 'Finance',
  '61': 'Finance',
  '62': 'Finance',
  '63': 'Insurance',
  '64': 'Insurance',
  '65': 'Real Estate',
  '67': 'Finance',

  // Division I: Services (70-89)
  '70': 'Services',
  '72': 'Services',
  '73': 'Technology',
  '75': 'Services',
  '76': 'Services',
  '78': 'Services',
  '79': 'Services',
  '80': 'Healthcare',
  '81': 'Services',
  '82': 'Services',
  '83': 'Services',
  '84': 'Services',
  '86': 'Services',
  '87': 'Services',
  '88': 'Services',
  '89': 'Services',

  // Division J: Public Administration (91-99)
  '91': 'Government',
  '92': 'Government',
  '93': 'Government',
  '94': 'Government',
  '95': 'Government',
  '96': 'Government',
  '97': 'Government',
  '99': 'Other'
};

// More specific mappings for 4-digit SIC codes (Technology refinements)
const SIC_4DIGIT_MAP = {
  '3571': 'Technology',      // Electronic Computers
  '3572': 'Technology',      // Computer Storage Devices
  '3575': 'Technology',      // Computer Terminals
  '3576': 'Technology',      // Computer Communication Equipment
  '3577': 'Technology',      // Computer Peripheral Equipment
  '3578': 'Technology',      // Calculating & Accounting Machines
  '3579': 'Technology',      // Office Machines
  '3661': 'Technology',      // Telephone & Telegraph Apparatus
  '3663': 'Technology',      // Radio & TV Broadcasting Equipment
  '3669': 'Technology',      // Communications Equipment
  '3670': 'Technology',      // Electronic Components
  '3672': 'Technology',      // Printed Circuit Boards
  '3674': 'Technology',      // Semiconductors
  '3677': 'Technology',      // Electronic Coils, Transformers
  '3678': 'Technology',      // Electronic Connectors
  '3679': 'Technology',      // Electronic Components
  '7370': 'Technology',      // Computer Programming Services
  '7371': 'Technology',      // Computer Programming Services
  '7372': 'Technology',      // Prepackaged Software
  '7373': 'Technology',      // Computer Integrated Systems Design
  '7374': 'Technology',      // Computer Processing & Data Preparation
  '7375': 'Technology',      // Information Retrieval Services
  '7376': 'Technology',      // Computer Facilities Management Services
  '7377': 'Technology',      // Computer Rental & Leasing
  '7378': 'Technology',      // Computer Maintenance & Repair
  '7379': 'Technology',      // Computer Related Services
  '4812': 'Communication',   // Radiotelephone Communications
  '4813': 'Communication',   // Telephone Communications
  '4822': 'Communication',   // Telegraph & Other Message Communications
  '4832': 'Communication',   // Radio Broadcasting Stations
  '4833': 'Communication',   // Television Broadcasting Stations
  '4841': 'Communication',   // Cable & Other Pay Television Services
  '8011': 'Healthcare',      // Offices & Clinics of Doctors
  '8021': 'Healthcare',      // Offices & Clinics of Dentists
  '8031': 'Healthcare',      // Offices & Clinics of Osteopathic Physicians
  '8041': 'Healthcare',      // Offices & Clinics of Chiropractors
  '8042': 'Healthcare',      // Offices & Clinics of Optometrists
  '8049': 'Healthcare',      // Offices & Clinics of Health Practitioners
  '8051': 'Healthcare',      // Skilled Nursing Care Facilities
  '8052': 'Healthcare',      // Intermediate Care Facilities
  '8059': 'Healthcare',      // Nursing & Personal Care Facilities
  '8060': 'Healthcare',      // Hospitals
  '8062': 'Healthcare',      // General Medical & Surgical Hospitals
  '8063': 'Healthcare',      // Psychiatric Hospitals
  '8069': 'Healthcare',      // Specialty Hospitals
  '8071': 'Healthcare',      // Medical Laboratories
  '8072': 'Healthcare',      // Dental Laboratories
  '8082': 'Healthcare',      // Home Health Care Services
  '8092': 'Healthcare',      // Kidney Dialysis Centers
  '8093': 'Healthcare',      // Specialty Outpatient Facilities
  '8099': 'Healthcare',      // Health & Allied Services
  '2833': 'Healthcare',      // Medicinal Chemicals
  '2834': 'Healthcare',      // Pharmaceutical Preparations
  '2835': 'Healthcare',      // In Vitro Diagnostics
  '2836': 'Healthcare',      // Biological Products
  '3826': 'Healthcare',      // Laboratory Analytical Instruments
  '3841': 'Healthcare',      // Surgical & Medical Instruments
  '3842': 'Healthcare',      // Orthopedic, Prosthetic, Surgical Appliances
  '3843': 'Healthcare',      // Dental Equipment & Supplies
  '3844': 'Healthcare',      // X-Ray Apparatus & Tubes
  '3845': 'Healthcare',      // Electromedical & Electrotherapeutic Apparatus
  '3851': 'Healthcare',      // Ophthalmic Goods
  '5912': 'Healthcare',      // Drug Stores & Proprietary Stores
  '6324': 'Healthcare',      // Hospital & Medical Service Plans
};

function getSector(sicCode) {
  if (!sicCode) return null;

  const sic = sicCode.toString().trim();

  // Try 4-digit specific mapping first
  if (SIC_4DIGIT_MAP[sic]) {
    return SIC_4DIGIT_MAP[sic];
  }

  // Try 2-digit division mapping
  const division = sic.substring(0, 2);
  if (SIC_SECTOR_MAP[division]) {
    return SIC_SECTOR_MAP[division];
  }

  return null;
}

console.log('Populating sectors from SIC codes...\n');

// Get all companies with SIC codes
const companies = db.prepare(`
  SELECT id, symbol, sic_code, sector
  FROM companies
  WHERE sic_code IS NOT NULL AND sic_code != ''
`).all();

console.log(`Found ${companies.length} companies with SIC codes\n`);

// Count current state
const beforeStats = db.prepare(`
  SELECT
    CASE WHEN sector IS NOT NULL AND sector != '' THEN 'Has Sector' ELSE 'No Sector' END as status,
    COUNT(*) as count
  FROM companies
  GROUP BY status
`).all();

console.log('Before update:');
beforeStats.forEach(s => console.log(`  ${s.status}: ${s.count}`));

// Prepare update statement
const updateStmt = db.prepare('UPDATE companies SET sector = ? WHERE id = ?');

// Track stats
let updated = 0;
let skipped = 0;
const sectorCounts = {};

// Update each company
const transaction = db.transaction(() => {
  for (const company of companies) {
    const newSector = getSector(company.sic_code);

    if (newSector) {
      updateStmt.run(newSector, company.id);
      updated++;
      sectorCounts[newSector] = (sectorCounts[newSector] || 0) + 1;
    } else {
      skipped++;
    }
  }
});

transaction();

console.log(`\nUpdated ${updated} companies, skipped ${skipped}\n`);

// Show sector distribution
console.log('Sector distribution:');
const sortedSectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]);
for (const [sector, count] of sortedSectors) {
  console.log(`  ${sector}: ${count}`);
}

// Show after stats
const afterStats = db.prepare(`
  SELECT sector, COUNT(*) as count
  FROM companies
  WHERE sector IS NOT NULL AND sector != ''
  GROUP BY sector
  ORDER BY count DESC
`).all();

console.log('\nFinal sector counts in database:');
afterStats.forEach(s => console.log(`  ${s.sector}: ${s.count}`));

db.close();
console.log('\nDone!');
