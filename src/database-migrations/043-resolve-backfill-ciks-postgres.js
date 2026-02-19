// 043-resolve-backfill-ciks-postgres.js
// Update backfilled IPOs with real SEC CIKs
// These CIKs were resolved by looking up tickers in SEC company_tickers.json

// Pre-resolved CIK mappings (from SEC EDGAR lookup on 2026-02-19)
const CIK_MAPPINGS = {
  'LFTO': '0001850351',  // Liftoff Mobile, Inc.
  'GENB': '0002100782',  // Generate Biomedicines
  'CLRS': '0001881567',  // Clear Street Group Inc.
  'AGBK': '0002081206',  // AGI
  'APC': '0002080921',   // ARKO Petroleum Corp.
  'MWH': '0002065636',   // SOLV Energy, Inc.
  'AGMB': '0002020932',  // AgomAb Therapeutics
  'OFRM': '0001696556',  // Once Upon a Farm, PBC
  'SGP': '0001778922',   // SpyGlass Pharma, Inc.
  'EIKN': '0001861123',  // Eikon Therapeutics
  'FPS': '0002080126',   // Forgent Power Solutions, Inc.
  'MANE': '0001827635',  // Veradermics, Inc.
  'GRAY': '0002073548',  // Grayscale Investments
  'HMH': '0002021880',   // HMH Holding Inc.
  'PICS': '0001841644',  // PicS N.V. (Picpay Holdings)
  'LIFE': '0001788451',  // Ethos Technologies Inc.
  'BOBS': '0002085187',  // Bob's Discount Furniture, Inc.
  'YSS': '0002086587',   // York Space Systems
  'MMED': '0002062583',  // MiniMed Group, Inc.
  'BTGO': '0001740604',  // BitGo Holdings
  'EQPT': '0001693736',  // EquipmentShare.com, Inc.
  'JSTT': '0002073819',  // Nihon Shintatsu Co., Ltd.
  // Not found in SEC (may not have filed or are foreign):
  // 'PAYP': null,       // PayPay Corp. (Japanese company)
  // 'BNTY': null,       // Bounty Minerals, Inc.
};

async function run(db) {
  console.log('Updating backfilled IPOs with real SEC CIKs...');

  let updated = 0;
  let notFound = 0;

  for (const [ticker, newCIK] of Object.entries(CIK_MAPPINGS)) {
    // Find the IPO by ticker and BACKFILL CIK
    const existing = await db.query(
      `SELECT id, cik, company_name FROM ipo_tracker
       WHERE (UPPER(ticker_proposed) = UPPER($1) OR UPPER(ticker_final) = UPPER($1))
       AND cik LIKE 'BACKFILL-%'`,
      [ticker]
    );

    if (existing.rows.length === 0) {
      console.log(`  SKIP: ${ticker} (not found or already has real CIK)`);
      notFound++;
      continue;
    }

    const ipo = existing.rows[0];

    // Update with real CIK
    await db.query(
      `UPDATE ipo_tracker SET cik = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newCIK, ipo.id]
    );

    console.log(`  UPDATE: ${ticker} - ${ipo.company_name}: ${ipo.cik} -> ${newCIK}`);
    updated++;
  }

  console.log(`  CIK resolution complete: ${updated} updated, ${notFound} skipped`);
}

module.exports = { run };
