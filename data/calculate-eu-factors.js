/**
 * Calculate Factor Scores for EU/UK Companies
 *
 * Uses XBRL fundamental metrics and daily prices to calculate factor scores
 * for European companies.
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

const TODAY = new Date().toISOString().split('T')[0];

/**
 * Get EU/UK stocks with fundamental metrics
 */
function getStocksWithMetrics() {
  return db.prepare(`
    SELECT DISTINCT
      c.id as company_id,
      c.symbol,
      c.name,
      c.country,
      c.sector,
      ci.id as identifier_id,
      m.period_end,
      m.revenue,
      m.net_income,
      m.operating_income,
      m.ebitda,
      m.total_assets,
      m.total_equity,
      m.total_liabilities,
      m.current_assets,
      m.current_liabilities,
      m.total_debt,
      m.cash_and_equivalents,
      m.gross_profit,
      m.operating_margin,
      m.net_margin,
      m.roe,
      m.roa,
      m.roic,
      m.current_ratio,
      m.debt_to_equity,
      m.currency
    FROM companies c
    JOIN company_identifiers ci ON ci.company_id = c.id
    JOIN xbrl_fundamental_metrics m ON m.identifier_id = ci.id
    WHERE c.country NOT IN ('US', 'CA')
      AND LENGTH(c.symbol) < 20
      AND m.period_type = 'annual'
    GROUP BY c.id
    HAVING m.period_end = MAX(m.period_end)
  `).all();
}

/**
 * Get price data for momentum/volatility calculation
 */
function getPriceData(companyId) {
  return db.prepare(`
    SELECT date, close, volume
    FROM daily_prices
    WHERE company_id = ?
    ORDER BY date DESC
    LIMIT 260
  `).all(companyId);
}

/**
 * Calculate momentum metrics
 */
function calculateMomentum(prices) {
  if (!prices || prices.length < 21) {
    return { return_1m: null, return_3m: null, return_6m: null, return_12m: null };
  }

  const current = prices[0]?.close;
  const p1m = prices[Math.min(21, prices.length - 1)]?.close;
  const p3m = prices[Math.min(63, prices.length - 1)]?.close;
  const p6m = prices[Math.min(126, prices.length - 1)]?.close;
  const p12m = prices[Math.min(252, prices.length - 1)]?.close;

  return {
    return_1m: p1m ? ((current - p1m) / p1m) * 100 : null,
    return_3m: p3m ? ((current - p3m) / p3m) * 100 : null,
    return_6m: p6m ? ((current - p6m) / p6m) * 100 : null,
    return_12m: p12m ? ((current - p12m) / p12m) * 100 : null
  };
}

/**
 * Calculate volatility metrics
 */
function calculateVolatility(prices) {
  if (!prices || prices.length < 60) {
    return { volatility_60d: null, volatility_252d: null };
  }

  // Calculate daily returns
  const returns = [];
  for (let i = 0; i < prices.length - 1; i++) {
    if (prices[i].close && prices[i + 1].close) {
      returns.push((prices[i].close - prices[i + 1].close) / prices[i + 1].close);
    }
  }

  const calcStdDev = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized %
  };

  return {
    volatility_60d: returns.length >= 60 ? calcStdDev(returns.slice(0, 60)) : null,
    volatility_252d: returns.length >= 200 ? calcStdDev(returns.slice(0, 200)) : null
  };
}

/**
 * Calculate market cap from price and shares
 */
function getMarketCap(companyId, prices) {
  if (!prices || prices.length === 0) return null;

  const lastPrice = prices[0].close;
  const avgVolume = prices.slice(0, 30).reduce((sum, p) => sum + (p.volume || 0), 0) / 30;

  // Get shares outstanding from XBRL if available
  const shares = db.prepare(`
    SELECT shares_outstanding FROM xbrl_fundamental_metrics
    WHERE company_id = ? AND shares_outstanding IS NOT NULL
    ORDER BY period_end DESC LIMIT 1
  `).get(companyId);

  if (shares?.shares_outstanding && lastPrice) {
    return (shares.shares_outstanding * lastPrice) / 1e9; // In billions
  }

  return null;
}

/**
 * Rank values and return percentiles
 */
function rankPercentile(values, higherIsBetter = true) {
  const valid = values
    .map((v, i) => ({ index: i, value: v }))
    .filter(v => v.value != null && !isNaN(v.value) && isFinite(v.value));

  if (valid.length === 0) return new Array(values.length).fill(null);

  valid.sort((a, b) => higherIsBetter ? a.value - b.value : b.value - a.value);

  const percentiles = new Array(values.length).fill(null);
  valid.forEach((v, rank) => {
    percentiles[v.index] = (rank / Math.max(1, valid.length - 1)) * 100;
  });

  return percentiles;
}

/**
 * Calculate composite score from components
 */
function compositeScore(components) {
  const valid = components.filter(c => c != null && !isNaN(c));
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

async function main() {
  console.log('\n=== EU/UK Factor Score Calculator ===\n');

  // Get stocks with metrics
  const stocks = getStocksWithMetrics();
  console.log(`Found ${stocks.length} EU/UK stocks with fundamental metrics\n`);

  if (stocks.length === 0) {
    console.log('No stocks to process');
    return;
  }

  // Calculate raw factors for each stock
  console.log('Calculating raw factors...');
  const factorData = [];

  for (const stock of stocks) {
    const prices = getPriceData(stock.company_id);
    const momentum = calculateMomentum(prices);
    const volatility = calculateVolatility(prices);
    const marketCap = getMarketCap(stock.company_id, prices);

    // Calculate derived metrics if not available
    let roe = stock.roe;
    let roa = stock.roa;
    let operatingMargin = stock.operating_margin;
    let netMargin = stock.net_margin;

    if (!roe && stock.net_income && stock.total_equity && stock.total_equity !== 0) {
      roe = stock.net_income / stock.total_equity;
    }
    if (!roa && stock.net_income && stock.total_assets && stock.total_assets !== 0) {
      roa = stock.net_income / stock.total_assets;
    }
    if (!operatingMargin && stock.operating_income && stock.revenue && stock.revenue !== 0) {
      operatingMargin = stock.operating_income / stock.revenue;
    }
    if (!netMargin && stock.net_income && stock.revenue && stock.revenue !== 0) {
      netMargin = stock.net_income / stock.revenue;
    }

    // Calculate valuation ratios
    let pe_ratio = null;
    let pb_ratio = null;
    let earningsYield = null;

    if (marketCap && stock.net_income) {
      pe_ratio = (marketCap * 1e9) / stock.net_income;
      earningsYield = pe_ratio > 0 ? 1 / pe_ratio : null;
    }
    if (marketCap && stock.total_equity) {
      pb_ratio = (marketCap * 1e9) / stock.total_equity;
    }

    factorData.push({
      company_id: stock.company_id,
      symbol: stock.symbol,
      country: stock.country,
      sector: stock.sector,

      // Value metrics
      pe_ratio,
      pb_ratio,
      earnings_yield: earningsYield,

      // Quality metrics
      roe,
      roa,
      roic: stock.roic,
      operating_margin: operatingMargin,
      net_margin: netMargin,
      current_ratio: stock.current_ratio,
      debt_to_equity: stock.debt_to_equity,

      // Size
      market_cap: marketCap,

      // Momentum
      ...momentum,

      // Volatility
      ...volatility,

      // Price data
      has_prices: prices.length > 0,
      last_price: prices[0]?.close
    });
  }

  console.log(`Processed ${factorData.length} stocks\n`);

  // Calculate percentile ranks
  console.log('Calculating percentile ranks...');

  const valueRanks = {
    earnings_yield: rankPercentile(factorData.map(s => s.earnings_yield), true),
    pe_ratio: rankPercentile(factorData.map(s => s.pe_ratio), false),
    pb_ratio: rankPercentile(factorData.map(s => s.pb_ratio), false)
  };

  const qualityRanks = {
    roe: rankPercentile(factorData.map(s => s.roe), true),
    roa: rankPercentile(factorData.map(s => s.roa), true),
    operating_margin: rankPercentile(factorData.map(s => s.operating_margin), true),
    current_ratio: rankPercentile(factorData.map(s => s.current_ratio), true)
  };

  const momentumRanks = {
    return_12m: rankPercentile(factorData.map(s => s.return_12m), true),
    return_6m: rankPercentile(factorData.map(s => s.return_6m), true)
  };

  const sizeRanks = {
    market_cap: rankPercentile(factorData.map(s => s.market_cap), false) // Small cap = higher
  };

  const volatilityRanks = {
    volatility_252d: rankPercentile(factorData.map(s => s.volatility_252d), false) // Low vol = higher
  };

  const leverageRanks = {
    debt_to_equity: rankPercentile(factorData.map(s => s.debt_to_equity), false) // Low debt = higher
  };

  // Calculate composite scores
  console.log('Calculating composite scores...');

  const finalScores = factorData.map((stock, i) => {
    const value_score = compositeScore([
      valueRanks.earnings_yield[i],
      valueRanks.pe_ratio[i],
      valueRanks.pb_ratio[i]
    ]);

    const quality_score = compositeScore([
      qualityRanks.roe[i],
      qualityRanks.roa[i],
      qualityRanks.operating_margin[i],
      qualityRanks.current_ratio[i]
    ]);

    const momentum_score = compositeScore([
      momentumRanks.return_12m[i],
      momentumRanks.return_6m[i]
    ]);

    const size_score = sizeRanks.market_cap[i];
    const volatility_score = volatilityRanks.volatility_252d[i];
    const leverage_score = leverageRanks.debt_to_equity[i];

    const profitability_score = compositeScore([
      qualityRanks.roe[i],
      qualityRanks.operating_margin[i]
    ]);

    const value_growth_blend = value_score != null ? value_score : null;

    const defensive_score = compositeScore([
      quality_score,
      volatility_score,
      leverage_score
    ]);

    return {
      company_id: stock.company_id,
      symbol: stock.symbol,
      country: stock.country,
      score_date: TODAY,
      value_score,
      quality_score,
      momentum_score,
      size_score,
      volatility_score,
      leverage_score,
      profitability_score,
      value_growth_blend,
      defensive_score,
      value_percentile: value_score,
      quality_percentile: quality_score,
      momentum_percentile: momentum_score,
      growth_percentile: null, // Need YoY data
      size_percentile: size_score
    };
  });

  // Store scores
  console.log('Storing factor scores...\n');

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO stock_factor_scores (
      company_id, symbol, score_date,
      value_score, size_score, momentum_score,
      quality_score, profitability_score, investment_score,
      growth_score, volatility_score, beta,
      dividend_score, leverage_score, liquidity_score,
      value_growth_blend, defensive_score,
      value_percentile, quality_percentile, momentum_percentile,
      growth_percentile, size_percentile,
      universe_size, calculation_version, created_at
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, datetime('now')
    )
  `);

  const transaction = db.transaction(() => {
    for (const score of finalScores) {
      insertStmt.run(
        score.company_id, score.symbol, score.score_date,
        score.value_score, score.size_score, score.momentum_score,
        score.quality_score, score.profitability_score, null,
        null, score.volatility_score, null,
        null, score.leverage_score, null,
        score.value_growth_blend, score.defensive_score,
        score.value_percentile, score.quality_percentile, score.momentum_percentile,
        score.growth_percentile, score.size_percentile,
        finalScores.length, '2.0-EU'
      );
    }
  });

  transaction();

  console.log('=== Results ===');
  console.log(`Stored ${finalScores.length} factor scores\n`);

  // Summary by country
  const byCountry = {};
  for (const score of finalScores) {
    byCountry[score.country] = (byCountry[score.country] || 0) + 1;
  }
  console.log('By country:');
  Object.entries(byCountry).sort((a, b) => b[1] - a[1]).forEach(([country, count]) => {
    console.log(`  ${country}: ${count}`);
  });

  // Show some sample scores
  console.log('\n=== Sample Top Value Scores ===');
  const topValue = db.prepare(`
    SELECT symbol, country, value_score, quality_score, momentum_score
    FROM stock_factor_scores
    WHERE score_date = ? AND value_score IS NOT NULL
    ORDER BY value_score DESC
    LIMIT 10
  `).all(TODAY);

  topValue.forEach(s => {
    console.log(`  ${s.symbol} (${s.country}): V=${s.value_score?.toFixed(1)} Q=${s.quality_score?.toFixed(1)} M=${s.momentum_score?.toFixed(1)}`);
  });

  console.log('\n=== Sample Top Quality Scores ===');
  const topQuality = db.prepare(`
    SELECT symbol, country, value_score, quality_score, momentum_score
    FROM stock_factor_scores
    WHERE score_date = ? AND quality_score IS NOT NULL
    ORDER BY quality_score DESC
    LIMIT 10
  `).all(TODAY);

  topQuality.forEach(s => {
    console.log(`  ${s.symbol} (${s.country}): V=${s.value_score?.toFixed(1)} Q=${s.quality_score?.toFixed(1)} M=${s.momentum_score?.toFixed(1)}`);
  });
}

main().catch(console.error);
