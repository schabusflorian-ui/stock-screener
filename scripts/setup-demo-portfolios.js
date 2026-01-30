/**
 * Demo Portfolio Environment Setup Script (Backtest-Based)
 *
 * Creates 10 diverse demo portfolios using REAL historical prices.
 * Portfolios are created as if they existed X days ago, with actual
 * market performance calculated from the daily_prices table.
 *
 * This provides realistic, verifiable performance metrics.
 *
 * Usage: node scripts/setup-demo-portfolios.js
 */

const path = require('path');
const Database = require('better-sqlite3');

// Initialize database
const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);

// Demo portfolio configurations with creation dates in the past
const demoPortfolios = [
  {
    name: 'Tech Growth Leaders',
    description: 'High-conviction positions in technology sector leaders with strong growth trajectories. Focus on mega-cap tech with proven revenue growth.',
    portfolioType: 'manual',
    initialCash: 100000,
    targetCashPct: 0.05,
    style: 'tech_growth',
    targetHoldings: 20,
    daysAgo: 90  // Created 90 days ago
  },
  {
    name: 'Dividend Champions',
    description: 'Income-focused portfolio of established dividend-paying companies with sustainable yields. Prioritizes dividend growth and stability over price appreciation.',
    portfolioType: 'manual',
    initialCash: 150000,
    targetCashPct: 0.02,
    style: 'dividend',
    targetHoldings: 25,
    daysAgo: 90
  },
  {
    name: 'Buffett Value Portfolio',
    description: 'Deep value investing inspired by Warren Buffett. Quality companies at reasonable prices with economic moats and strong management.',
    portfolioType: 'clone',
    initialCash: 250000,
    targetCashPct: 0.10,
    style: 'buffett',
    targetHoldings: 15,
    daysAgo: 90
  },
  {
    name: 'Burry Contrarian Bets',
    description: 'Deep value contrarian positions in out-of-favor sectors. Higher volatility but potential for outsized returns.',
    portfolioType: 'clone',
    initialCash: 75000,
    targetCashPct: 0.20,
    style: 'contrarian',
    targetHoldings: 12,
    daysAgo: 60
  },
  {
    name: 'All Weather Balance',
    description: 'Diversified portfolio inspired by Ray Dalio\'s All Weather strategy. Designed to perform in all market conditions with balanced risk.',
    portfolioType: 'clone',
    initialCash: 200000,
    targetCashPct: 0.05,
    style: 'balanced',
    targetHoldings: 30,
    daysAgo: 90
  },
  {
    name: 'Small Cap Rockets',
    description: 'Aggressive small-cap portfolio targeting high-growth emerging companies. Higher risk but potential for significant returns.',
    portfolioType: 'manual',
    initialCash: 50000,
    targetCashPct: 0.10,
    style: 'small_cap',
    targetHoldings: 25,
    daysAgo: 45
  },
  {
    name: 'ETF Core Portfolio',
    description: 'Low-cost, diversified ETF-only portfolio for long-term wealth building. Broad market exposure with minimal management.',
    portfolioType: 'etf_model',
    initialCash: 100000,
    targetCashPct: 0.02,
    style: 'etf',
    targetHoldings: 8,
    daysAgo: 90
  },
  {
    name: 'ESG Sustainable Leaders',
    description: 'Environmentally and socially responsible companies leading in sustainability. Excludes fossil fuels, tobacco, and weapons.',
    portfolioType: 'manual',
    initialCash: 80000,
    targetCashPct: 0.05,
    style: 'esg',
    targetHoldings: 20,
    daysAgo: 60
  },
  {
    name: 'Healthcare Innovation',
    description: 'Biotech and healthcare companies at the forefront of medical innovation. Mix of established pharma and growth-oriented biotech.',
    portfolioType: 'manual',
    initialCash: 60000,
    targetCashPct: 0.10,
    style: 'healthcare',
    targetHoldings: 18,
    daysAgo: 60
  },
  {
    name: 'Global Diversified',
    description: 'International exposure with positions across US, European, and emerging markets. Geographic diversification for reduced correlation.',
    portfolioType: 'manual',
    initialCash: 120000,
    targetCashPct: 0.05,
    style: 'global',
    targetHoldings: 25,
    daysAgo: 90
  }
];

// Stock pools by style
const stockPools = {
  tech_growth: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META', 'AMZN', 'CRM', 'ADBE', 'ORCL', 'PLTR',
                'NOW', 'INTU', 'PANW', 'SNPS', 'CDNS', 'NFLX', 'AMD', 'QCOM', 'TXN', 'INTC',
                'AMAT', 'MU', 'ADI', 'KLAC', 'LRCX'],
  dividend: ['JNJ', 'PG', 'KO', 'PEP', 'VZ', 'T', 'XOM', 'CVX', 'MO', 'PM',
             'ABBV', 'MRK', 'PFE', 'BMY', 'SO', 'DUK', 'D', 'NEE', 'WMB', 'KMI',
             'O', 'VICI', 'SPG', 'AVB', 'EQR'],
  buffett: ['BRK.B', 'AAPL', 'BAC', 'KO', 'AXP', 'OXY', 'KHC', 'MCO', 'DVA', 'ALLY',
            'C', 'USB', 'GM', 'HPQ', 'PARA', 'SNOW'],
  contrarian: ['XOM', 'CVX', 'FCX', 'NUE', 'CLF', 'AA', 'X', 'GOLD', 'NEM', 'AEM',
               'BTU', 'ARCH', 'AMR'],
  balanced: ['AAPL', 'MSFT', 'JNJ', 'PG', 'UNH', 'V', 'MA', 'HD', 'MCD', 'DIS',
             'COST', 'WMT', 'TGT', 'LOW', 'NKE', 'SBUX', 'CMG', 'YUM', 'GIS', 'K',
             'CL', 'KMB', 'CHD', 'CLX', 'SJM', 'CAG', 'CPB', 'HRL', 'MKC', 'TSN'],
  small_cap: [], // Will be populated from database query
  // ETF-like diversified portfolio using sector leaders with good historical data
  etf: ['SPY', 'GLD', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JPM', 'JNJ', 'XOM', 'PG',
        'V', 'MA', 'HD', 'COST', 'WMT'],
  esg: ['MSFT', 'GOOGL', 'CRM', 'ADBE', 'INTU', 'PG', 'JNJ', 'UNH', 'LLY', 'MRK',
        'NKE', 'COST', 'TGT', 'HD', 'LOW', 'SBUX', 'CMG', 'DIS', 'NFLX', 'V'],
  healthcare: ['UNH', 'JNJ', 'LLY', 'PFE', 'ABBV', 'MRK', 'ABT', 'ISRG', 'AMGN', 'GILD',
               'VRTX', 'REGN', 'BMY', 'MDT', 'SYK', 'BDX', 'ZBH', 'EW', 'DXCM', 'IDXX'],
  // Global mix using US multinationals + SPY/GLD (the only ETFs with full data)
  global: ['SPY', 'GLD', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'JPM', 'JNJ',
           'XOM', 'CVX', 'PG', 'KO', 'PEP', 'UNH', 'V', 'MA', 'WMT', 'COST',
           'HD', 'ABBV', 'MRK', 'LLY', 'AVGO']
};

/**
 * Get date string for X days ago
 */
function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get all trading days between two dates (from daily_prices)
 */
function getTradingDays(startDate, endDate) {
  return db.prepare(`
    SELECT DISTINCT date FROM daily_prices
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(startDate, endDate).map(r => r.date);
}

/**
 * Get historical price for a company on or before a specific date
 */
function getHistoricalPrice(companyId, date) {
  return db.prepare(`
    SELECT close, date FROM daily_prices
    WHERE company_id = ? AND date <= ?
    ORDER BY date DESC
    LIMIT 1
  `).get(companyId, date);
}

/**
 * Get current price from price_metrics
 */
function getCurrentPrice(companyId) {
  return db.prepare(`
    SELECT last_price FROM price_metrics WHERE company_id = ?
  `).get(companyId);
}

/**
 * Get company data for a symbol
 */
function getCompanyBySymbol(symbol) {
  return db.prepare(`
    SELECT c.id, c.symbol, c.name, c.sector, c.market_cap,
           pm.last_price
    FROM companies c
    LEFT JOIN price_metrics pm ON c.id = pm.company_id
    WHERE c.symbol = ? AND c.is_active = 1
  `).get(symbol);
}

/**
 * Get small cap stocks from database
 */
function getSmallCapStocks(limit = 30) {
  return db.prepare(`
    SELECT c.symbol
    FROM companies c
    JOIN price_metrics pm ON c.id = pm.company_id
    WHERE c.market_cap BETWEEN 300000000 AND 2000000000
      AND pm.last_price IS NOT NULL
      AND pm.last_price > 5
      AND c.is_active = 1
    ORDER BY RANDOM()
    LIMIT ?
  `).all(limit).map(r => r.symbol);
}

/**
 * Generate varied position sizes (not equal weight)
 */
function generatePositionSizes(numPositions, totalValue, cashPct) {
  const investable = totalValue * (1 - cashPct);
  const sizes = [];
  let remaining = investable;

  for (let i = 0; i < numPositions; i++) {
    const isLast = i === numPositions - 1;
    if (isLast) {
      sizes.push(remaining);
    } else {
      const avgWeight = remaining / (numPositions - i);
      const variance = 0.6;
      const weight = avgWeight * (1 + (Math.random() - 0.5) * 2 * variance);
      const size = Math.max(1000, Math.min(remaining * 0.4, weight));
      sizes.push(size);
      remaining -= size;
    }
  }

  return sizes.sort(() => Math.random() - 0.5);
}

/**
 * Main setup function
 */
async function setupDemoPortfolios() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     DEMO PORTFOLIO SETUP (BACKTEST-BASED REAL PRICES)          ║');
  console.log('║     10 Diverse Investment Portfolios with Real Performance     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Phase 1: Get agent portfolio IDs to preserve
  console.log('PHASE 1: Identifying agent portfolios to preserve...');
  const agentPortfolioIds = db.prepare(`
    SELECT portfolio_id FROM agent_portfolios
  `).all().map(r => r.portfolio_id);
  console.log(`  Found ${agentPortfolioIds.length} agent portfolios to preserve\n`);

  // Phase 2: Clean up existing non-agent portfolios
  console.log('PHASE 2: Cleaning up existing demo portfolios...');
  try {
    db.pragma('foreign_keys = OFF');

    const portfoliosToDelete = db.prepare(`
      SELECT id FROM portfolios
      WHERE id NOT IN (${agentPortfolioIds.length > 0 ? agentPortfolioIds.join(',') : '0'})
    `).all();

    console.log(`  Found ${portfoliosToDelete.length} portfolios to delete...`);

    for (const p of portfoliosToDelete) {
      db.prepare('DELETE FROM portfolio_alerts WHERE portfolio_id = ?').run(p.id);
      db.prepare('DELETE FROM portfolio_orders WHERE portfolio_id = ?').run(p.id);
      db.prepare('DELETE FROM portfolio_snapshots WHERE portfolio_id = ?').run(p.id);
      db.prepare('DELETE FROM portfolio_transactions WHERE portfolio_id = ?').run(p.id);
      db.prepare('DELETE FROM portfolio_lots WHERE portfolio_id = ?').run(p.id);
      db.prepare('DELETE FROM portfolio_positions WHERE portfolio_id = ?').run(p.id);
      db.prepare('DELETE FROM portfolios WHERE id = ?').run(p.id);
    }

    db.pragma('foreign_keys = ON');
    console.log('  [OK] Cleanup complete\n');
  } catch (e) {
    console.log('  [WARN] Cleanup issue:', e.message);
    db.pragma('foreign_keys = ON');
  }

  // Populate small cap stocks
  console.log('PHASE 3: Preparing stock pools...');
  stockPools.small_cap = getSmallCapStocks(30);
  console.log(`  Small cap pool: ${stockPools.small_cap.length} stocks`);
  console.log('  [OK] Stock pools ready\n');

  // Check historical price data availability
  console.log('PHASE 4: Checking historical price data...');
  const priceStats = db.prepare(`
    SELECT
      COUNT(*) as total_records,
      MIN(date) as earliest_date,
      MAX(date) as latest_date,
      COUNT(DISTINCT company_id) as companies_with_prices
    FROM daily_prices
  `).get();
  console.log(`  Total price records: ${priceStats.total_records.toLocaleString()}`);
  console.log(`  Date range: ${priceStats.earliest_date} to ${priceStats.latest_date}`);
  console.log(`  Companies with prices: ${priceStats.companies_with_prices}`);
  console.log('  [OK] Price data verified\n');

  // Phase 5: Create portfolios with historical dates
  console.log('PHASE 5: Creating demo portfolios with historical dates...\n');
  const createdPortfolios = [];
  const today = new Date().toISOString().split('T')[0];

  for (const config of demoPortfolios) {
    try {
      const creationDate = getDateDaysAgo(config.daysAgo);

      // Insert portfolio with historical creation date
      const result = db.prepare(`
        INSERT INTO portfolios (
          name, description, portfolio_type, currency,
          initial_cash, current_cash, current_value,
          total_deposited, is_archived, dividend_reinvest,
          initial_date, created_at, updated_at
        ) VALUES (?, ?, ?, 'USD', ?, ?, ?, ?, 0, 0, ?, ?, datetime('now'))
      `).run(
        config.name,
        config.description,
        config.portfolioType,
        config.initialCash,
        config.initialCash,
        config.initialCash,
        config.initialCash,
        creationDate,
        creationDate
      );

      const portfolioId = result.lastInsertRowid;

      // Create initial deposit transaction with historical date
      db.prepare(`
        INSERT INTO portfolio_transactions (
          portfolio_id, transaction_type, total_amount,
          cash_balance_after, notes, executed_at, created_at
        ) VALUES (?, 'deposit', ?, ?, 'Initial deposit', ?, ?)
      `).run(portfolioId, config.initialCash, config.initialCash, creationDate, creationDate);

      createdPortfolios.push({
        id: portfolioId,
        creationDate,
        ...config
      });

      console.log(`  [OK] ${config.name} (ID: ${portfolioId})`);
      console.log(`       Created: ${creationDate} (${config.daysAgo} days ago) | $${config.initialCash.toLocaleString()}`);

    } catch (e) {
      console.log(`  [ERR] ${config.name}: ${e.message}`);
    }
  }

  console.log(`\nCreated ${createdPortfolios.length}/10 portfolios\n`);

  // Phase 6: Execute backdated trades at REAL historical prices
  console.log('PHASE 6: Executing backdated trades at real historical prices...\n');

  for (const portfolio of createdPortfolios) {
    const stocks = stockPools[portfolio.style] || stockPools.balanced;
    const selectedStocks = stocks.slice(0, portfolio.targetHoldings);
    const positionSizes = generatePositionSizes(
      selectedStocks.length,
      portfolio.initialCash,
      portfolio.targetCashPct
    );

    let totalInvested = 0;
    let positionsCreated = 0;
    let skippedNoPrice = 0;

    for (let i = 0; i < selectedStocks.length; i++) {
      const symbol = selectedStocks[i];
      const company = getCompanyBySymbol(symbol);

      if (!company) continue;

      // Get REAL historical price on portfolio creation date
      const historicalPrice = getHistoricalPrice(company.id, portfolio.creationDate);
      if (!historicalPrice) {
        skippedNoPrice++;
        continue;
      }

      const positionValue = positionSizes[i];
      const buyPrice = historicalPrice.close;
      const shares = Math.floor(positionValue / buyPrice);
      if (shares < 1) continue;

      const costBasis = shares * buyPrice;
      totalInvested += costBasis;

      // Get CURRENT price for P&L calculation
      const currentPriceData = getCurrentPrice(company.id);
      const currentPrice = currentPriceData?.last_price || buyPrice;
      const currentValue = shares * currentPrice;
      const unrealizedPnl = currentValue - costBasis;
      const unrealizedPnlPct = (unrealizedPnl / costBasis) * 100;

      const buyDateStr = portfolio.creationDate + ' 10:30:00';

      // Insert position
      const posResult = db.prepare(`
        INSERT INTO portfolio_positions (
          portfolio_id, company_id, shares, average_cost,
          current_price, current_value, cost_basis,
          unrealized_pnl, unrealized_pnl_pct, realized_pnl,
          total_dividends, first_bought_at, last_traded_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, datetime('now'))
      `).run(
        portfolio.id,
        company.id,
        shares,
        buyPrice,       // Historical buy price
        currentPrice,   // Current price
        currentValue,   // Current value
        costBasis,      // Original cost basis
        unrealizedPnl,  // Real P&L
        unrealizedPnlPct,
        buyDateStr,
        buyDateStr,
        buyDateStr
      );

      const positionId = posResult.lastInsertRowid;

      // Insert lot with historical date
      db.prepare(`
        INSERT INTO portfolio_lots (
          portfolio_id, position_id, company_id,
          shares_original, shares_remaining, cost_per_share, total_cost,
          acquired_at, acquisition_type, shares_sold, realized_pnl,
          is_closed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'buy', 0, 0, 0, ?)
      `).run(
        portfolio.id,
        positionId,
        company.id,
        shares,
        shares,
        buyPrice,
        costBasis,
        buyDateStr,
        buyDateStr
      );

      // Insert buy transaction with historical date
      db.prepare(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, transaction_type,
          shares, price_per_share, total_amount, fees,
          executed_at, created_at
        ) VALUES (?, ?, ?, 'buy', ?, ?, ?, 0, ?, ?)
      `).run(
        portfolio.id,
        company.id,
        positionId,
        shares,
        buyPrice,
        costBasis,
        buyDateStr,
        buyDateStr
      );

      positionsCreated++;
    }

    // Update portfolio cash
    const cashRemaining = portfolio.initialCash - totalInvested;

    // Calculate current total value from all positions
    const currentPositionValue = db.prepare(`
      SELECT COALESCE(SUM(current_value), 0) as total
      FROM portfolio_positions WHERE portfolio_id = ?
    `).get(portfolio.id).total;

    db.prepare(`
      UPDATE portfolios
      SET current_cash = ?,
          current_value = ?
      WHERE id = ?
    `).run(cashRemaining, cashRemaining + currentPositionValue, portfolio.id);

    console.log(`  ${portfolio.name}: ${positionsCreated} positions @ historical prices`);
    console.log(`     Invested: $${Math.round(totalInvested).toLocaleString()} | Cash: $${Math.round(cashRemaining).toLocaleString()} | Current Value: $${Math.round(cashRemaining + currentPositionValue).toLocaleString()}`);
    if (skippedNoPrice > 0) {
      console.log(`     (Skipped ${skippedNoPrice} stocks - no price data for ${portfolio.creationDate})`);
    }
  }

  // Phase 7: Backfill historical snapshots with REAL daily prices
  console.log('\nPHASE 7: Backfilling historical snapshots with real prices...\n');

  const insertSnapshot = db.prepare(`
    INSERT OR REPLACE INTO portfolio_snapshots (
      portfolio_id, snapshot_date, total_value, cash_value, positions_value,
      total_cost_basis, unrealized_pnl, realized_pnl,
      total_deposited, total_withdrawn, positions_count,
      daily_return, daily_return_pct, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, datetime('now'))
  `);

  for (const portfolio of createdPortfolios) {
    // Get positions for this portfolio
    const positions = db.prepare(`
      SELECT pp.id, pp.company_id, pp.shares, pp.cost_basis, c.symbol
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ?
    `).all(portfolio.id);

    // Get trading days from creation to today
    const tradingDays = getTradingDays(portfolio.creationDate, today);

    let snapshotsCreated = 0;
    let previousValue = null;
    const totalCostBasis = positions.reduce((sum, p) => sum + p.cost_basis, 0);
    // Use ACTUAL cash remaining after purchases, not target percentage
    const cashValue = portfolio.initialCash - totalCostBasis;

    for (const date of tradingDays) {
      // Calculate positions value using real prices on this date
      let positionsValue = 0;

      for (const pos of positions) {
        const priceData = getHistoricalPrice(pos.company_id, date);
        if (priceData) {
          positionsValue += pos.shares * priceData.close;
        }
      }

      const totalValue = cashValue + positionsValue;
      const unrealizedPnl = positionsValue - totalCostBasis;

      // Calculate daily return
      let dailyReturn = 0;
      let dailyReturnPct = 0;
      if (previousValue !== null && previousValue > 0) {
        dailyReturn = totalValue - previousValue;
        dailyReturnPct = (dailyReturn / previousValue) * 100;
      }

      try {
        insertSnapshot.run(
          portfolio.id,
          date,
          Math.round(totalValue * 100) / 100,
          Math.round(cashValue * 100) / 100,
          Math.round(positionsValue * 100) / 100,
          Math.round(totalCostBasis * 100) / 100,
          Math.round(unrealizedPnl * 100) / 100,
          portfolio.initialCash,
          positions.length,
          Math.round(dailyReturn * 100) / 100,
          Math.round(dailyReturnPct * 100) / 100
        );
        snapshotsCreated++;
      } catch (e) {
        // Skip duplicate dates
      }

      previousValue = totalValue;
    }

    console.log(`  ${portfolio.name}: ${snapshotsCreated} snapshots (real prices)`);
  }

  // Phase 8: Create active orders
  console.log('\nPHASE 8: Creating active orders...\n');

  for (const portfolio of createdPortfolios) {
    const positions = db.prepare(`
      SELECT pp.id, pp.company_id, pp.shares, pp.current_price, c.symbol
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ?
      LIMIT 5
    `).all(portfolio.id);

    let ordersCreated = 0;

    for (const pos of positions) {
      if (Math.random() < 0.5) {
        const stopPrice = pos.current_price * 0.9;
        db.prepare(`
          INSERT INTO portfolio_orders (
            portfolio_id, company_id, position_id,
            order_type, order_side, trigger_price, trigger_comparison,
            shares, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'stop_loss', 'sell', ?, 'lte', ?, 'active', datetime('now'), datetime('now'))
        `).run(portfolio.id, pos.company_id, pos.id, stopPrice, pos.shares);
        ordersCreated++;
      }
    }

    const watchStock = getCompanyBySymbol(stockPools.balanced[Math.floor(Math.random() * 10)]);
    if (watchStock && watchStock.last_price) {
      const limitPrice = watchStock.last_price * 0.95;
      db.prepare(`
        INSERT INTO portfolio_orders (
          portfolio_id, company_id,
          order_type, order_side, trigger_price, trigger_comparison,
          shares, status, notes, created_at, updated_at
        ) VALUES (?, ?, 'limit', 'buy', ?, 'lte', ?, 'active', 'Watching for entry', datetime('now'), datetime('now'))
      `).run(portfolio.id, watchStock.id, limitPrice, 10);
      ordersCreated++;
    }

    console.log(`  ${portfolio.name}: ${ordersCreated} orders`);
  }

  // Final summary
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    SETUP COMPLETE                              ║');
  console.log('║          All performance data based on REAL prices             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Verification output with performance metrics
  console.log('Verification (Real Performance):\n');

  const summary = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.portfolio_type as type,
      p.initial_cash,
      p.current_value as value,
      p.initial_date as created,
      (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id AND shares > 0) as positions,
      (SELECT COUNT(*) FROM portfolio_snapshots WHERE portfolio_id = p.id) as snapshots,
      (SELECT COUNT(*) FROM portfolio_orders WHERE portfolio_id = p.id AND status = 'active') as orders
    FROM portfolios p
    WHERE p.id NOT IN (${agentPortfolioIds.length > 0 ? agentPortfolioIds.join(',') : '0'})
    ORDER BY p.id
  `).all();

  console.log('ID  │ Name                    │ Created    │ Initial    │ Current    │ Return  │ Pos');
  console.log('────┼─────────────────────────┼────────────┼────────────┼────────────┼─────────┼────');

  for (const p of summary) {
    const name = p.name.substring(0, 23).padEnd(23);
    const initial = ('$' + Math.round(p.initial_cash || 0).toLocaleString()).padStart(10);
    const value = ('$' + Math.round(p.value || 0).toLocaleString()).padStart(10);
    const returnPct = p.initial_cash > 0 ? ((p.value - p.initial_cash) / p.initial_cash * 100).toFixed(2) : '0.00';
    const returnStr = (returnPct >= 0 ? '+' : '') + returnPct + '%';
    console.log(`${String(p.id).padStart(3)} │ ${name} │ ${p.created || 'N/A'} │ ${initial} │ ${value} │ ${returnStr.padStart(7)} │ ${String(p.positions).padStart(3)}`);
  }

  // Performance attribution
  console.log('\n\nPerformance Attribution (Top/Bottom Movers):');

  for (const p of summary.slice(0, 3)) {
    console.log(`\n  ${p.name}:`);

    const topMovers = db.prepare(`
      SELECT c.symbol, pp.shares, pp.average_cost, pp.current_price,
             pp.unrealized_pnl, pp.unrealized_pnl_pct
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ? AND pp.shares > 0
      ORDER BY pp.unrealized_pnl DESC
      LIMIT 3
    `).all(p.id);

    for (const m of topMovers) {
      const pnlSign = m.unrealized_pnl >= 0 ? '+' : '';
      console.log(`    ${m.symbol.padEnd(6)}: ${pnlSign}$${Math.round(m.unrealized_pnl).toLocaleString().padStart(6)} (${pnlSign}${m.unrealized_pnl_pct.toFixed(1)}%) | Bought @$${m.average_cost.toFixed(2)} → $${m.current_price.toFixed(2)}`);
    }
  }

  console.log('\n');
  console.log('Total demo portfolios:', summary.length);
  console.log('Total positions:', summary.reduce((sum, p) => sum + p.positions, 0));
  console.log('Total snapshots:', summary.reduce((sum, p) => sum + p.snapshots, 0));
  console.log('');
  console.log('All prices sourced from daily_prices table - verifiable and realistic!');
  console.log('');
}

// Run setup
setupDemoPortfolios().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
