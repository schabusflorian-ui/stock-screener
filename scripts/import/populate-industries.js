// populate-industries.js
// Maps SIC codes to detailed industry classifications

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stocks.db');
const db = new Database(dbPath);

// SIC code to Industry mapping (2-digit level for broader categories, 3-4 digit for specifics)
const SIC_INDUSTRY_MAP = {
  // Agriculture
  '01': 'Agricultural Production - Crops',
  '02': 'Agricultural Production - Livestock',
  '07': 'Agricultural Services',
  '08': 'Forestry',
  '09': 'Fishing, Hunting, Trapping',

  // Mining
  '10': 'Metal Mining',
  '12': 'Coal Mining',
  '13': 'Oil & Gas Extraction',
  '14': 'Mining & Quarrying',

  // Construction
  '15': 'Building Construction',
  '16': 'Heavy Construction',
  '17': 'Special Trade Contractors',

  // Manufacturing - Food & Tobacco
  '20': 'Food Products',
  '21': 'Tobacco Products',

  // Manufacturing - Textiles & Apparel
  '22': 'Textile Mill Products',
  '23': 'Apparel & Accessories',

  // Manufacturing - Wood & Paper
  '24': 'Lumber & Wood Products',
  '25': 'Furniture & Fixtures',
  '26': 'Paper & Allied Products',
  '27': 'Printing & Publishing',

  // Manufacturing - Chemicals & Petroleum
  '28': 'Chemicals & Allied Products',
  '29': 'Petroleum Refining',

  // Manufacturing - Rubber, Plastics, Leather
  '30': 'Rubber & Plastics Products',
  '31': 'Leather & Leather Products',

  // Manufacturing - Stone, Clay, Glass, Metals
  '32': 'Stone, Clay, Glass Products',
  '33': 'Primary Metal Industries',
  '34': 'Fabricated Metal Products',

  // Manufacturing - Industrial & Commercial Machinery
  '35': 'Industrial Machinery & Equipment',

  // Manufacturing - Electronics
  '36': 'Electronic Equipment',

  // Manufacturing - Transportation Equipment
  '37': 'Transportation Equipment',

  // Manufacturing - Instruments
  '38': 'Instruments & Related Products',

  // Manufacturing - Misc
  '39': 'Miscellaneous Manufacturing',

  // Transportation
  '40': 'Railroad Transportation',
  '41': 'Local & Suburban Transit',
  '42': 'Motor Freight & Warehousing',
  '43': 'Postal Service',
  '44': 'Water Transportation',
  '45': 'Air Transportation',
  '46': 'Pipelines',
  '47': 'Transportation Services',

  // Communications
  '48': 'Communications',

  // Utilities
  '49': 'Electric, Gas & Sanitary Services',

  // Wholesale Trade
  '50': 'Wholesale Trade - Durable Goods',
  '51': 'Wholesale Trade - Nondurable Goods',

  // Retail Trade
  '52': 'Building Materials & Garden Supplies',
  '53': 'General Merchandise Stores',
  '54': 'Food Stores',
  '55': 'Auto Dealers & Gas Stations',
  '56': 'Apparel & Accessory Stores',
  '57': 'Home Furniture & Equipment',
  '58': 'Eating & Drinking Places',
  '59': 'Miscellaneous Retail',

  // Finance
  '60': 'Banking',
  '61': 'Credit Institutions',
  '62': 'Securities & Commodities',
  '63': 'Insurance Carriers',
  '64': 'Insurance Agents & Brokers',
  '65': 'Real Estate',
  '67': 'Holding & Investment Offices',

  // Services
  '70': 'Hotels & Lodging',
  '72': 'Personal Services',
  '73': 'Business Services',
  '75': 'Automotive Services',
  '76': 'Miscellaneous Repair Services',
  '78': 'Motion Pictures',
  '79': 'Amusement & Recreation',
  '80': 'Health Services',
  '81': 'Legal Services',
  '82': 'Educational Services',
  '83': 'Social Services',
  '84': 'Museums & Botanical Gardens',
  '86': 'Membership Organizations',
  '87': 'Engineering & Management Services',
  '88': 'Private Households',
  '89': 'Miscellaneous Services',

  // Public Administration
  '91': 'Executive & Legislative',
  '92': 'Justice, Public Order & Safety',
  '93': 'Public Finance',
  '94': 'Administration of Human Resources',
  '95': 'Environmental & Housing Programs',
  '96': 'Administration of Economic Programs',
  '97': 'National Security',
  '99': 'Nonclassifiable Establishments'
};

// More specific 3-4 digit SIC to industry mappings
const SIC_DETAILED_MAP = {
  // Technology - Software
  '7370': 'Software & IT Services',
  '7371': 'Computer Programming Services',
  '7372': 'Prepackaged Software',
  '7373': 'Computer Integrated Systems',
  '7374': 'Data Processing Services',
  '7375': 'Information Retrieval Services',
  '7376': 'Computer Facilities Management',
  '7377': 'Computer Rental & Leasing',
  '7378': 'Computer Maintenance & Repair',
  '7379': 'Computer Related Services',

  // Technology - Hardware
  '3571': 'Computer Hardware',
  '3572': 'Computer Storage Devices',
  '3575': 'Computer Terminals',
  '3576': 'Networking Equipment',
  '3577': 'Computer Peripherals',
  '3578': 'Calculating Machines',
  '3579': 'Office Machines',

  // Semiconductors
  '3674': 'Semiconductors',
  '3672': 'Printed Circuit Boards',
  '3677': 'Electronic Coils & Transformers',
  '3678': 'Electronic Connectors',
  '3679': 'Electronic Components',
  '3670': 'Electronic Components & Accessories',

  // Communications Equipment
  '3661': 'Telephone Equipment',
  '3663': 'Radio & TV Equipment',
  '3669': 'Communications Equipment',

  // Telecom Services
  '4812': 'Wireless Telecommunications',
  '4813': 'Telephone Services',
  '4822': 'Telegraph Services',
  '4832': 'Radio Broadcasting',
  '4833': 'Television Broadcasting',
  '4841': 'Cable & Streaming',

  // Healthcare - Services
  '8011': 'Physicians & Clinics',
  '8021': 'Dental Services',
  '8031': 'Osteopathic Services',
  '8041': 'Chiropractic Services',
  '8042': 'Optometry Services',
  '8049': 'Health Practitioners',
  '8051': 'Skilled Nursing Facilities',
  '8052': 'Intermediate Care Facilities',
  '8059': 'Nursing & Personal Care',
  '8060': 'Hospitals',
  '8062': 'General Hospitals',
  '8063': 'Psychiatric Hospitals',
  '8069': 'Specialty Hospitals',
  '8071': 'Medical Laboratories',
  '8072': 'Dental Laboratories',
  '8082': 'Home Health Care',
  '8092': 'Dialysis Centers',
  '8093': 'Outpatient Facilities',
  '8099': 'Health Services NEC',

  // Healthcare - Pharma & Biotech
  '2833': 'Medicinal Chemicals',
  '2834': 'Pharmaceuticals',
  '2835': 'Diagnostics',
  '2836': 'Biotechnology',

  // Medical Devices
  '3826': 'Laboratory Instruments',
  '3841': 'Surgical Instruments',
  '3842': 'Orthopedic & Prosthetic Devices',
  '3843': 'Dental Equipment',
  '3844': 'X-Ray Equipment',
  '3845': 'Electromedical Equipment',
  '3851': 'Ophthalmic Goods',

  // Healthcare - Distribution
  '5912': 'Drug Stores & Pharmacies',
  '6324': 'Health Insurance',

  // Banks
  '6020': 'Commercial Banks',
  '6021': 'National Commercial Banks',
  '6022': 'State Commercial Banks',
  '6025': 'National Savings Banks',
  '6029': 'Commercial Banks NEC',
  '6035': 'Savings Institutions',
  '6036': 'Savings Institutions',

  // Financial Services
  '6141': 'Personal Credit Institutions',
  '6153': 'Short-Term Business Credit',
  '6159': 'Business Credit Institutions',
  '6162': 'Mortgage Bankers',
  '6163': 'Loan Brokers',
  '6172': 'Finance Lessors',
  '6189': 'Asset-Backed Financing',

  // Securities & Investment
  '6211': 'Security Brokers & Dealers',
  '6221': 'Commodity Brokers & Dealers',
  '6282': 'Investment Advisers',
  '6289': 'Financial Services NEC',

  // Insurance
  '6311': 'Life Insurance',
  '6321': 'Accident & Health Insurance',
  '6324': 'Hospital & Medical Insurance',
  '6331': 'Fire, Marine & Casualty Insurance',
  '6351': 'Surety Insurance',
  '6361': 'Title Insurance',
  '6371': 'Pension Funds',
  '6399': 'Insurance Carriers NEC',
  '6411': 'Insurance Agents & Brokers',

  // Real Estate
  '6512': 'Real Estate Operators',
  '6513': 'Apartment Operators',
  '6514': 'Dwelling Operators',
  '6515': 'Mobile Home Site Operators',
  '6517': 'Railroad Property Lessors',
  '6519': 'Real Property Lessors',
  '6531': 'Real Estate Agents',
  '6541': 'Title Abstract Offices',
  '6552': 'Land Subdividers & Developers',
  '6553': 'Cemetery Management',

  // Investment Companies
  '6722': 'Management Investment Offices',
  '6726': 'Unit Investment Trusts',
  '6732': 'Educational & Religious Trusts',
  '6733': 'Trusts NEC',
  '6792': 'Oil Royalty Traders',
  '6794': 'Patent Owners & Lessors',
  '6795': 'Mineral Royalty Traders',
  '6798': 'REITs',
  '6799': 'Investors NEC',

  // Oil & Gas
  '1311': 'Crude Petroleum & Natural Gas',
  '1321': 'Natural Gas Liquids',
  '1381': 'Drilling Oil & Gas Wells',
  '1382': 'Oil & Gas Field Exploration',
  '1389': 'Oil & Gas Field Services',

  // Automotive
  '3711': 'Motor Vehicles & Car Bodies',
  '3713': 'Truck & Bus Bodies',
  '3714': 'Motor Vehicle Parts',
  '3715': 'Truck Trailers',
  '3716': 'Motor Homes',
  '5511': 'Motor Vehicle Dealers (New)',
  '5521': 'Motor Vehicle Dealers (Used)',
  '5531': 'Auto Parts & Accessories',
  '5541': 'Gasoline Service Stations',
  '5571': 'Motorcycle Dealers',
  '5599': 'Automotive Dealers NEC',

  // Aerospace & Defense
  '3721': 'Aircraft',
  '3724': 'Aircraft Engines',
  '3728': 'Aircraft Parts',
  '3761': 'Guided Missiles & Space Vehicles',
  '3764': 'Guided Missile Propulsion',
  '3769': 'Guided Missile Parts',
  '3812': 'Search & Navigation Equipment',

  // Retail - General
  '5311': 'Department Stores',
  '5331': 'Variety Stores',
  '5399': 'Miscellaneous General Merchandise',

  // Retail - E-commerce
  '5961': 'Catalog & Mail-Order',

  // Retail - Food
  '5411': 'Grocery Stores',
  '5412': 'Convenience Stores',
  '5431': 'Fruit & Vegetable Markets',
  '5441': 'Candy & Confectionery',
  '5451': 'Dairy Products',
  '5461': 'Bakeries',
  '5499': 'Food Stores NEC',

  // Restaurants
  '5812': 'Eating Places',
  '5813': 'Drinking Places',

  // Consumer Products - Food & Beverage
  '2011': 'Meat Packing',
  '2013': 'Sausages & Prepared Meats',
  '2015': 'Poultry Processing',
  '2020': 'Dairy Products',
  '2024': 'Ice Cream',
  '2030': 'Canned & Frozen Foods',
  '2040': 'Grain Mill Products',
  '2050': 'Bakery Products',
  '2060': 'Sugar & Confectionery',
  '2070': 'Fats & Oils',
  '2080': 'Beverages',
  '2082': 'Malt Beverages',
  '2084': 'Wines & Brandy',
  '2085': 'Distilled Spirits',
  '2086': 'Soft Drinks',
  '2087': 'Flavoring Extracts',
  '2090': 'Miscellaneous Food',

  // Consumer Products - Household
  '2840': 'Soap & Detergents',
  '2841': 'Soap & Detergents',
  '2842': 'Specialty Cleaning Products',
  '2843': 'Surface Active Agents',
  '2844': 'Cosmetics & Perfumes',

  // Entertainment & Media
  '7810': 'Motion Picture Production',
  '7812': 'Motion Picture & Video Production',
  '7819': 'Motion Picture Services',
  '7822': 'Motion Picture Distribution',
  '7829': 'Motion Picture Distribution Services',
  '7832': 'Motion Picture Theaters',
  '7833': 'Drive-In Theaters',
  '7841': 'Video Tape Rental',
  '7911': 'Dance Studios & Schools',
  '7922': 'Theatrical Producers',
  '7929': 'Bands & Entertainers',
  '7933': 'Bowling Centers',
  '7941': 'Sports Clubs & Promoters',
  '7948': 'Racing & Track Operations',
  '7991': 'Physical Fitness Facilities',
  '7992': 'Golf Courses',
  '7993': 'Coin-Operated Amusement',
  '7996': 'Amusement Parks',
  '7997': 'Membership Sports Clubs',
  '7999': 'Amusement & Recreation NEC',

  // Utilities
  '4911': 'Electric Services',
  '4922': 'Natural Gas Transmission',
  '4923': 'Natural Gas Distribution',
  '4924': 'Natural Gas Distribution',
  '4931': 'Electric & Other Services Combined',
  '4932': 'Gas & Other Services Combined',
  '4939': 'Combination Utilities',
  '4941': 'Water Supply',
  '4952': 'Sewerage Systems',
  '4953': 'Refuse Systems',
  '4959': 'Sanitary Services NEC',
  '4961': 'Steam & Air-Conditioning Supply',
  '4971': 'Irrigation Systems'
};

function getIndustry(sicCode) {
  if (!sicCode) return null;

  const sic = sicCode.toString().trim();

  // Try 4-digit specific mapping first
  if (SIC_DETAILED_MAP[sic]) {
    return SIC_DETAILED_MAP[sic];
  }

  // Try 3-digit
  const sic3 = sic.substring(0, 3) + '0';
  if (SIC_DETAILED_MAP[sic3]) {
    return SIC_DETAILED_MAP[sic3];
  }

  // Try 2-digit division mapping
  const division = sic.substring(0, 2);
  if (SIC_INDUSTRY_MAP[division]) {
    return SIC_INDUSTRY_MAP[division];
  }

  return null;
}

console.log('Populating industries from SIC codes...\n');

// Get all companies with SIC codes
const companies = db.prepare(`
  SELECT id, symbol, sic_code, industry
  FROM companies
  WHERE sic_code IS NOT NULL AND sic_code != ''
`).all();

console.log(`Found ${companies.length} companies with SIC codes\n`);

// Count current state
const beforeStats = db.prepare(`
  SELECT
    CASE WHEN industry IS NOT NULL AND industry != '' THEN 'Has Industry' ELSE 'No Industry' END as status,
    COUNT(*) as count
  FROM companies
  GROUP BY status
`).all();

console.log('Before update:');
beforeStats.forEach(s => console.log(`  ${s.status}: ${s.count}`));

// Prepare update statement
const updateStmt = db.prepare('UPDATE companies SET industry = ? WHERE id = ?');

// Track stats
let updated = 0;
let skipped = 0;
const industryCounts = {};

// Update each company
const transaction = db.transaction(() => {
  for (const company of companies) {
    const newIndustry = getIndustry(company.sic_code);

    if (newIndustry) {
      updateStmt.run(newIndustry, company.id);
      updated++;
      industryCounts[newIndustry] = (industryCounts[newIndustry] || 0) + 1;
    } else {
      skipped++;
    }
  }
});

transaction();

console.log(`\nUpdated ${updated} companies, skipped ${skipped}\n`);

// Show top industries
console.log('Top 30 industries by count:');
const sortedIndustries = Object.entries(industryCounts).sort((a, b) => b[1] - a[1]).slice(0, 30);
for (const [industry, count] of sortedIndustries) {
  console.log(`  ${industry}: ${count}`);
}

// Count total unique industries
const totalIndustries = Object.keys(industryCounts).length;
console.log(`\nTotal unique industries: ${totalIndustries}`);

db.close();
console.log('\nDone!');
