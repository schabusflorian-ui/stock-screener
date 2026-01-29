/**
 * Calculate Price Metrics for EU/UK Companies
 *
 * Reads daily_prices and calculates:
 * - 52-week high/low
 * - Price changes (1d, 1w, 1m, 3m, 6m, 1y, YTD)
 * - Moving averages (SMA 50, 200)
 * - RSI(14)
 * - Volatility
 *
 * Updates price_metrics table
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

console.log('\n=== EU/UK Price Metrics Calculator ===\n');

// Get EU companies with daily prices
const companies = db.prepare(`
  SELECT DISTINCT c.id, c.symbol, c.name, c.country
  FROM companies c
  JOIN daily_prices dp ON c.id = dp.company_id
  WHERE c.country NOT IN ('US', 'CA')
  ORDER BY c.id
`).all();

console.log(`Found ${companies.length} EU/UK companies with price data\n`);

// Calculate metrics for each company
let processed = 0;
let updated = 0;
let skipped = 0;

const updateStmt = db.prepare(`
  INSERT INTO price_metrics (
    company_id, last_price, last_price_date,
    high_52w, high_52w_date, low_52w, low_52w_date,
    change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
    sma_50, sma_200, rsi_14, volatility_30d, avg_volume_30d
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id) DO UPDATE SET
    last_price = excluded.last_price,
    last_price_date = excluded.last_price_date,
    high_52w = excluded.high_52w,
    high_52w_date = excluded.high_52w_date,
    low_52w = excluded.low_52w,
    low_52w_date = excluded.low_52w_date,
    change_1d = excluded.change_1d,
    change_1w = excluded.change_1w,
    change_1m = excluded.change_1m,
    change_3m = excluded.change_3m,
    change_6m = excluded.change_6m,
    change_1y = excluded.change_1y,
    change_ytd = excluded.change_ytd,
    sma_50 = excluded.sma_50,
    sma_200 = excluded.sma_200,
    rsi_14 = excluded.rsi_14,
    volatility_30d = excluded.volatility_30d,
    avg_volume_30d = excluded.avg_volume_30d,
    updated_at = CURRENT_TIMESTAMP
`);

for (const company of companies) {
  processed++;

  if (processed % 100 === 0) {
    console.log(`Processed ${processed}/${companies.length}...`);
  }

  try {
    // Get price history (descending order, most recent first)
    const prices = db.prepare(`
      SELECT date, close, volume
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT 252
    `).all(company.id);

    if (prices.length === 0) {
      skipped++;
      continue;
    }

    // Current price
    const lastPrice = prices[0].close;
    const lastDate = prices[0].date;

    // 52-week high/low
    const high52w = Math.max(...prices.map(p => p.close));
    const low52w = Math.min(...prices.map(p => p.close));
    const high52wDate = prices.find(p => p.close === high52w)?.date;
    const low52wDate = prices.find(p => p.close === low52w)?.date;

    // Price changes
    const pctChange = (current, prev) => prev ? ((current - prev) / prev) * 100 : null;

    const change1d = prices.length > 1 ? pctChange(prices[0].close, prices[1].close) : null;
    const change1w = prices.length > 5 ? pctChange(prices[0].close, prices[5].close) : null;
    const change1m = prices.length > 21 ? pctChange(prices[0].close, prices[21].close) : null;
    const change3m = prices.length > 63 ? pctChange(prices[0].close, prices[63].close) : null;
    const change6m = prices.length > 126 ? pctChange(prices[0].close, prices[126].close) : null;
    const change1y = prices.length > 200 ? pctChange(prices[0].close, prices[Math.min(252, prices.length - 1)].close) : null;

    // YTD change
    const currentYear = new Date().getFullYear();
    const ytdPrices = prices.filter(p => p.date.startsWith(String(currentYear)));
    const changeYtd = ytdPrices.length > 0 ? pctChange(prices[0].close, ytdPrices[ytdPrices.length - 1].close) : null;

    // Moving averages (need ascending order)
    const pricesAsc = prices.slice().reverse();
    const sma50 = pricesAsc.length >= 50 ? pricesAsc.slice(-50).reduce((sum, p) => sum + p.close, 0) / 50 : null;
    const sma200 = pricesAsc.length >= 200 ? pricesAsc.slice(-200).reduce((sum, p) => sum + p.close, 0) / 200 : null;

    // RSI(14)
    let rsi14 = null;
    if (pricesAsc.length >= 15) {
      let gains = 0, losses = 0;
      for (let i = 1; i < 15; i++) {
        const diff = pricesAsc[pricesAsc.length - i].close - pricesAsc[pricesAsc.length - i - 1].close;
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss !== 0) {
        const rs = avgGain / avgLoss;
        rsi14 = 100 - (100 / (1 + rs));
      }
    }

    // Volatility (30-day)
    let volatility30d = null;
    if (prices.length >= 30) {
      const returns = [];
      for (let i = 0; i < Math.min(30, prices.length - 1); i++) {
        returns.push((prices[i].close - prices[i + 1].close) / prices[i + 1].close);
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      volatility30d = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized %
    }

    // Average volume (30-day)
    const avgVolume30d = prices.length >= 30
      ? Math.round(prices.slice(0, 30).reduce((sum, p) => sum + (p.volume || 0), 0) / 30)
      : null;

    // Update price_metrics
    updateStmt.run(
      company.id, lastPrice, lastDate,
      high52w, high52wDate, low52w, low52wDate,
      change1d, change1w, change1m, change3m, change6m, change1y, changeYtd,
      sma50, sma200, rsi14, volatility30d, avgVolume30d
    );

    updated++;

  } catch (error) {
    console.error(`Error processing ${company.symbol}:`, error.message);
    skipped++;
  }
}

console.log('\n=== Results ===');
console.log(`Processed: ${processed}`);
console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
console.log('\n✅ Done!\n');

db.close();
