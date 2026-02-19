// 044-fix-backfill-ciks-postgres.js
// Fix: Migration 043 was recorded but didn't actually update CIKs
// This migration directly updates all backfilled IPOs with their real SEC CIKs

// Pre-resolved CIK mappings (from SEC EDGAR lookup on 2026-02-19)
const CIK_UPDATES = [
  { ticker: 'LFTO', cik: '0001850351' },  // Liftoff Mobile, Inc.
  { ticker: 'GENB', cik: '0002100782' },  // Generate Biomedicines
  { ticker: 'CLRS', cik: '0001881567' },  // Clear Street Group Inc.
  { ticker: 'AGBK', cik: '0002081206' },  // AGI
  { ticker: 'APC', cik: '0002080921' },   // ARKO Petroleum Corp.
  { ticker: 'MWH', cik: '0002065636' },   // SOLV Energy, Inc.
  { ticker: 'AGMB', cik: '0002020932' },  // AgomAb Therapeutics
  { ticker: 'OFRM', cik: '0001696556' },  // Once Upon a Farm, PBC
  { ticker: 'SGP', cik: '0001778922' },   // SpyGlass Pharma, Inc.
  { ticker: 'EIKN', cik: '0001861123' },  // Eikon Therapeutics
  { ticker: 'FPS', cik: '0002080126' },   // Forgent Power Solutions, Inc.
  { ticker: 'MANE', cik: '0001827635' },  // Veradermics, Inc.
  { ticker: 'GRAY', cik: '0002073548' },  // Grayscale Investments
  { ticker: 'HMH', cik: '0002021880' },   // HMH Holding Inc.
  { ticker: 'PICS', cik: '0001841644' },  // PicS N.V. (Picpay Holdings)
  { ticker: 'LIFE', cik: '0001788451' },  // Ethos Technologies Inc.
  { ticker: 'BOBS', cik: '0002085187' },  // Bob's Discount Furniture, Inc.
  { ticker: 'YSS', cik: '0002086587' },   // York Space Systems
  { ticker: 'MMED', cik: '0002062583' },  // MiniMed Group, Inc.
  { ticker: 'BTGO', cik: '0001740604' },  // BitGo Holdings
  { ticker: 'EQPT', cik: '0001693736' },  // EquipmentShare.com, Inc.
  { ticker: 'JSTT', cik: '0002073819' },  // Nihon Shintatsu Co., Ltd.
  // Not found in SEC (keeping placeholder CIKs):
  // PAYP - PayPay Corp. (Japanese company)
  // BNTY - Bounty Minerals, Inc.
];

async function run(db) {
  console.log('Fixing backfilled IPO CIKs (migration 043 fix)...');

  let updated = 0;
  let notFound = 0;

  for (const { ticker, cik } of CIK_UPDATES) {
    try {
      // Update using direct match - no subquery issues
      const result = await db.query(
        `UPDATE ipo_tracker
         SET cik = $1, updated_at = CURRENT_TIMESTAMP
         WHERE (UPPER(ticker_proposed) = UPPER($2) OR UPPER(ticker_final) = UPPER($2))
         RETURNING id, company_name`,
        [cik, ticker]
      );

      if (result.rows && result.rows.length > 0) {
        const ipo = result.rows[0];
        console.log(`  UPDATE: ${ticker} - ${ipo.company_name} -> ${cik}`);
        updated++;
      } else {
        console.log(`  SKIP: ${ticker} (not found)`);
        notFound++;
      }
    } catch (error) {
      console.error(`  ERROR: ${ticker} - ${error.message}`);
    }
  }

  console.log(`  CIK fix complete: ${updated} updated, ${notFound} not found`);
}

module.exports = { run };
