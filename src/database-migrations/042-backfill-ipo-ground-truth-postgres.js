// 042-backfill-ipo-ground-truth-postgres.js
// Backfill IPO Tracker with missing operating company IPOs from ground truth data
// These IPOs were missed when the ipo.scan job was broken (Dec 2025 - Feb 2026)

// Ground truth IPO data - filtered to only real operating companies (no SPACs)
const GROUND_TRUTH_IPOS = [
  { date: '2026-02-17', company: 'Liftoff Mobile', symbol: 'LFTO', managers: 'Goldman Sachs/Jefferies/Morgan Stanley', shares_mm: 25.4, price_low: 26, price_high: 30, est_vol_mm: 711.2, status: 'WITHDRAWN', sector: 'Technology' },
  { date: '2026-02-13', company: 'Generate Biomedicines', symbol: 'GENB', managers: 'Goldman Sachs/Morgan Stanley/Piper Sandler', shares_mm: 0, price_low: null, price_high: null, est_vol_mm: 100, status: 'EXPECTED', sector: 'Healthcare' },
  { date: '2026-02-12', company: 'Clear Street Group Inc.', symbol: 'CLRS', managers: 'Goldman Sachs/BofA Securities/Morgan Stanley', shares_mm: 13, price_low: 26, price_high: 28, est_vol_mm: 351, status: 'POSTPONED', sector: 'Financials' },
  { date: '2026-02-12', company: 'PayPay Corp.', symbol: 'PAYP', managers: 'Goldman Sachs/J.P.Morgan/Mizuho/Morgan Stanley', shares_mm: 0, price_low: null, price_high: null, est_vol_mm: 100, status: 'EXPECTED', sector: 'Technology' },
  { date: '2026-02-11', company: 'AGI', symbol: 'AGBK', managers: 'Goldman Sachs/Morgan Stanley/Citigroup', shares_mm: 20, price_low: 12, price_high: 12, est_vol_mm: 240, status: 'PRICED', sector: 'Technology' },
  { date: '2026-02-11', company: 'ARKO Petroleum Corp.', symbol: 'APC', managers: 'UBS Investment Bank/Raymond James/Stifel', shares_mm: 11.11, price_low: 18, price_high: 18, est_vol_mm: 200, status: 'PRICED', sector: 'Energy' },
  { date: '2026-02-11', company: 'SOLV Energy, Inc.', symbol: 'MWH', managers: 'Jefferies/J.P. Morgan/KeyBanc', shares_mm: 20.5, price_low: 25, price_high: 25, est_vol_mm: 512.5, status: 'PRICED', sector: 'Energy' },
  { date: '2026-02-05', company: 'AgomAb Therapeutics', symbol: 'AGMB', managers: 'J.P. Morgan/Morgan Stanley/Leerink Partners', shares_mm: 12.5, price_low: 16, price_high: 16, est_vol_mm: 200, status: 'PRICED', sector: 'Healthcare' },
  { date: '2026-02-05', company: 'Once Upon a Farm, PBC', symbol: 'OFRM', managers: 'Goldman Sachs/J.P. Morgan/BofA Securities', shares_mm: 10.99, price_low: 18, price_high: 18, est_vol_mm: 197.95, status: 'PRICED', sector: 'Consumer' },
  { date: '2026-02-05', company: 'SpyGlass Pharma, Inc.', symbol: 'SGP', managers: 'Jefferies/Leerink Partners/Citigroup', shares_mm: 9.38, price_low: 16, price_high: 16, est_vol_mm: 150, status: 'PRICED', sector: 'Healthcare' },
  { date: '2026-02-04', company: 'Eikon Therapeutics', symbol: 'EIKN', managers: 'J.P.Morgan/Morgan Stanley/BofA Securities', shares_mm: 21.18, price_low: 18, price_high: 18, est_vol_mm: 381.24, status: 'PRICED', sector: 'Healthcare' },
  { date: '2026-02-04', company: 'Forgent Power Solutions, Inc.', symbol: 'FPS', managers: 'Goldman Sachs/Jefferies/Morgan Stanley', shares_mm: 56, price_low: 27, price_high: 27, est_vol_mm: 1512, status: 'PRICED', sector: 'Energy' },
  { date: '2026-02-02', company: 'Veradermics, Inc.', symbol: 'MANE', managers: 'Jefferies/Leerink Partners/Citigroup', shares_mm: 15.08, price_low: 17, price_high: 17, est_vol_mm: 256.36, status: 'PRICED', sector: 'Healthcare' },
  { date: '2026-01-29', company: 'Bounty Minerals, Inc.', symbol: 'BNTY', managers: 'Raymond James/Stifel/Stephens', shares_mm: 0, price_low: null, price_high: null, est_vol_mm: 100, status: 'EXPECTED', sector: 'Materials' },
  { date: '2026-01-29', company: 'Grayscale Investments', symbol: 'GRAY', managers: 'Morgan Stanley/Jefferies/BofA Securities', shares_mm: 0, price_low: null, price_high: null, est_vol_mm: 100, status: 'EXPECTED', sector: 'Financials' },
  { date: '2026-01-29', company: 'HMH Holding Inc.', symbol: 'HMH', managers: 'J.P. Morgan/Piper Sandler/Evercore ISI', shares_mm: 0, price_low: null, price_high: null, est_vol_mm: 100, status: 'EXPECTED', sector: 'Industrials' },
  { date: '2026-01-29', company: 'PicS N.V. (Picpay Holdings)', symbol: 'PICS', managers: 'Citigroup/BofA Securities/RBC Capital', shares_mm: 22.86, price_low: 19, price_high: 19, est_vol_mm: 434.28, status: 'PRICED', sector: 'Technology' },
  { date: '2026-01-28', company: 'Ethos Technologies Inc.', symbol: 'LIFE', managers: 'Goldman Sachs/J.P.Morgan/BofA Securities', shares_mm: 10.53, price_low: 19, price_high: 19, est_vol_mm: 199.99, status: 'PRICED', sector: 'Technology' },
  { date: '2026-01-26', company: "Bob's Discount Furniture, Inc.", symbol: 'BOBS', managers: 'J.P. Morgan/Morgan Stanley/RBC Capital', shares_mm: 19.45, price_low: 17, price_high: 17, est_vol_mm: 330.65, status: 'PRICED', sector: 'Consumer' },
  { date: '2026-01-26', company: 'York Space Systems', symbol: 'YSS', managers: 'Goldman Sachs/Jefferies/Wells Fargo', shares_mm: 18.5, price_low: 34, price_high: 34, est_vol_mm: 629, status: 'PRICED', sector: 'Industrials' },
  { date: '2026-01-23', company: 'MiniMed Group, Inc.', symbol: 'MMED', managers: 'Goldman Sachs/BofA Securities/Citigroup', shares_mm: 0, price_low: null, price_high: null, est_vol_mm: 100, status: 'EXPECTED', sector: 'Healthcare' },
  { date: '2026-01-22', company: 'BitGo Holdings', symbol: 'BTGO', managers: 'Goldman Sachs/Citigroup/Deutsche Bank', shares_mm: 11.82, price_low: 18, price_high: 18, est_vol_mm: 212.76, status: 'PRICED', sector: 'Financials' },
  { date: '2026-01-22', company: 'EquipmentShare.com, Inc.', symbol: 'EQPT', managers: 'Goldman Sachs/Wells Fargo/UBS', shares_mm: 30.5, price_low: 24.5, price_high: 24.5, est_vol_mm: 747.25, status: 'PRICED', sector: 'Industrials' },
  { date: '2026-01-15', company: 'Nihon Shintatsu Co., Ltd.', symbol: 'JSTT', managers: 'Spartan Capital Securities', shares_mm: 3.75, price_low: 4, price_high: 6, est_vol_mm: 18.75, status: 'EXPECTED', sector: 'Industrials' },
];

async function run(db) {
  console.log('Backfilling IPO ground truth data (24 operating company IPOs)...');

  let inserted = 0;
  let skipped = 0;

  for (const ipo of GROUND_TRUTH_IPOS) {
    // Check if already exists
    const existing = await db.query(
      'SELECT id FROM ipo_tracker WHERE UPPER(ticker_proposed) = UPPER($1) OR UPPER(ticker_final) = UPPER($1)',
      [ipo.symbol]
    );

    if (existing.rows && existing.rows.length > 0) {
      console.log(`  SKIP: ${ipo.symbol} (already exists)`);
      skipped++;
      continue;
    }

    const placeholderCik = `BACKFILL-2026-${ipo.symbol}`;
    const isPriced = ipo.status === 'PRICED';

    await db.query(`
      INSERT INTO ipo_tracker (
        cik, company_name, ticker_proposed, status, region,
        price_range_low, price_range_high, final_price,
        shares_offered, deal_size,
        initial_s1_date, pricing_date, trading_date,
        lead_underwriters, sector,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [
      placeholderCik,
      ipo.company,
      ipo.symbol,
      ipo.status,
      'US',
      ipo.price_low,
      ipo.price_high,
      isPriced ? (ipo.price_low || ipo.price_high) : null,
      ipo.shares_mm ? Math.round(ipo.shares_mm * 1000000) : null,
      ipo.est_vol_mm ? ipo.est_vol_mm * 1000000 : null,
      ipo.date,
      isPriced ? ipo.date : null,
      isPriced ? ipo.date : null,
      ipo.managers,
      ipo.sector
    ]);

    console.log(`  INSERT: ${ipo.symbol} - ${ipo.company} (${ipo.status})`);
    inserted++;
  }

  console.log(`  Backfill complete: ${inserted} inserted, ${skipped} skipped`);
}

module.exports = { run };
