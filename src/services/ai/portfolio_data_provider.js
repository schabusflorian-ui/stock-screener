/**
 * Portfolio Data Provider for AI Services
 *
 * Provides formatted portfolio data for AI analysis:
 * - Daily briefings
 * - Portfolio alerts
 * - Position analysis
 */

const db = require('../../database');

/**
 * Get portfolio summary data for AI analysis
 */
function getPortfolioDataForAI(portfolioId) {
  const database = db.getDatabase();

  // Get portfolio info
  const portfolio = database.prepare(`
    SELECT p.*,
      (SELECT name FROM market_indices WHERE id = p.benchmark_index_id) as benchmark_name
    FROM portfolios p
    WHERE p.id = ?
  `).get(portfolioId);

  if (!portfolio) {
    return null;
  }

  // Get positions with current prices
  const positions = database.prepare(`
    SELECT
      pp.*,
      c.symbol,
      c.name as company_name,
      c.sector,
      c.industry,
      dp.close as current_price,
      dp.date as price_date,
      (pp.shares * dp.close) as current_value,
      (pp.shares * dp.close) - (pp.shares * pp.average_cost) as unrealized_pnl,
      CASE WHEN pp.average_cost > 0
        THEN ((dp.close - pp.average_cost) / pp.average_cost) * 100
        ELSE 0
      END as unrealized_pnl_pct
    FROM portfolio_positions pp
    JOIN companies c ON pp.company_id = c.id
    LEFT JOIN (
      SELECT company_id, close, date,
        ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY date DESC) as rn
      FROM daily_prices
    ) dp ON dp.company_id = c.id AND dp.rn = 1
    WHERE pp.portfolio_id = ?
    ORDER BY current_value DESC
  `).all(portfolioId);

  // Get recent transactions
  const recentTransactions = database.prepare(`
    SELECT
      pt.*,
      c.symbol,
      c.name as company_name
    FROM portfolio_transactions pt
    LEFT JOIN companies c ON pt.company_id = c.id
    WHERE pt.portfolio_id = ?
    ORDER BY pt.transaction_date DESC
    LIMIT 10
  `).all(portfolioId);

  // Get recent snapshots for performance
  const snapshots = database.prepare(`
    SELECT * FROM portfolio_snapshots
    WHERE portfolio_id = ?
    ORDER BY snapshot_date DESC
    LIMIT 30
  `).all(portfolioId);

  // Calculate totals
  const totalPositionsValue = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);
  const totalValue = portfolio.current_cash + totalPositionsValue;
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  // Calculate daily change if we have snapshots
  let dailyChange = 0;
  let dailyChangePct = 0;
  if (snapshots.length >= 2) {
    const today = snapshots[0];
    const yesterday = snapshots[1];
    dailyChange = (today?.total_value || 0) - (yesterday?.total_value || 0);
    dailyChangePct = yesterday?.total_value > 0
      ? (dailyChange / yesterday.total_value) * 100
      : 0;
  }

  // Sector allocation
  const sectorAllocation = {};
  for (const pos of positions) {
    const sector = pos.sector || 'Unknown';
    if (!sectorAllocation[sector]) {
      sectorAllocation[sector] = { value: 0, weight: 0, positions: [] };
    }
    sectorAllocation[sector].value += pos.current_value || 0;
    sectorAllocation[sector].weight = totalValue > 0
      ? (sectorAllocation[sector].value / totalValue) * 100
      : 0;
    sectorAllocation[sector].positions.push(pos.symbol);
  }

  return {
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      type: portfolio.portfolio_type,
      currency: portfolio.currency,
      benchmark: portfolio.benchmark_name,
      createdAt: portfolio.created_at
    },
    values: {
      cashValue: portfolio.current_cash,
      positionsValue: totalPositionsValue,
      totalValue,
      totalCostBasis: positions.reduce((sum, p) => sum + (p.shares * p.average_cost), 0),
      totalDeposited: portfolio.total_deposited,
      totalWithdrawn: portfolio.total_withdrawn
    },
    performance: {
      unrealizedPnl: totalUnrealizedPnl,
      unrealizedPnlPct: portfolio.total_deposited > 0
        ? (totalUnrealizedPnl / portfolio.total_deposited) * 100
        : 0,
      realizedPnl: portfolio.realized_pnl || 0,
      dailyChange,
      dailyChangePct,
      totalDividends: portfolio.total_dividends || 0
    },
    positions: positions.map(p => ({
      symbol: p.symbol,
      name: p.company_name,
      sector: p.sector,
      industry: p.industry,
      shares: p.shares,
      averageCost: p.average_cost,
      currentPrice: p.current_price,
      currentValue: p.current_value,
      weight: totalValue > 0 ? ((p.current_value || 0) / totalValue) * 100 : 0,
      unrealizedPnl: p.unrealized_pnl,
      unrealizedPnlPct: p.unrealized_pnl_pct
    })),
    sectorAllocation,
    recentTransactions: recentTransactions.map(t => ({
      type: t.transaction_type,
      symbol: t.symbol,
      shares: t.shares,
      price: t.price_per_share,
      amount: t.total_amount,
      date: t.transaction_date
    })),
    snapshots: snapshots.slice(0, 10).map(s => ({
      date: s.snapshot_date,
      totalValue: s.total_value,
      cashValue: s.cash_value,
      positionsValue: s.positions_value
    }))
  };
}

/**
 * Get all portfolios summary for briefing
 */
function getAllPortfoliosForBriefing() {
  const database = db.getDatabase();

  const portfolios = database.prepare(`
    SELECT id, name FROM portfolios WHERE is_archived = 0
  `).all();

  return portfolios.map(p => getPortfolioDataForAI(p.id)).filter(p => p !== null);
}

/**
 * Get market data for briefing
 */
function getMarketDataForBriefing() {
  const database = db.getDatabase();

  // Get major indices performance
  const indices = database.prepare(`
    SELECT
      mi.id,
      mi.name,
      mi.symbol,
      ip.close as current_price,
      ip.date as price_date,
      ip.change_percent as daily_change_pct
    FROM market_indices mi
    LEFT JOIN (
      SELECT index_id, close, date, change_percent,
        ROW_NUMBER() OVER (PARTITION BY index_id ORDER BY date DESC) as rn
      FROM index_prices
    ) ip ON ip.index_id = mi.id AND ip.rn = 1
    WHERE mi.symbol IN ('SPY', 'QQQ', 'DIA', 'IWM', 'VTI')
    ORDER BY mi.symbol
  `).all();

  // Get sector performance (based on sector ETFs or sector averages)
  const sectorPerformance = database.prepare(`
    SELECT
      sector,
      COUNT(*) as company_count,
      AVG(
        CASE WHEN prev_close > 0
          THEN ((current_close - prev_close) / prev_close) * 100
          ELSE 0
        END
      ) as avg_daily_change
    FROM (
      SELECT
        c.sector,
        dp1.close as current_close,
        dp2.close as prev_close
      FROM companies c
      JOIN daily_prices dp1 ON dp1.company_id = c.id
        AND dp1.date = (SELECT MAX(date) FROM daily_prices WHERE company_id = c.id)
      LEFT JOIN daily_prices dp2 ON dp2.company_id = c.id
        AND dp2.date = (SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date < dp1.date)
      WHERE c.sector IS NOT NULL
    )
    GROUP BY sector
    ORDER BY avg_daily_change DESC
  `).all();

  return {
    indices: indices.map(i => ({
      name: i.name,
      symbol: i.symbol,
      price: i.current_price,
      dailyChangePct: i.daily_change_pct
    })),
    sectorPerformance: sectorPerformance.map(s => ({
      sector: s.sector,
      companyCount: s.company_count,
      avgDailyChange: s.avg_daily_change
    }))
  };
}

/**
 * Get company data for AI analysis
 */
function getCompanyDataForAI(companyId) {
  const database = db.getDatabase();

  // Get company info
  const company = database.prepare(`
    SELECT * FROM companies WHERE id = ?
  `).get(companyId);

  if (!company) {
    return null;
  }

  // Get latest price
  const price = database.prepare(`
    SELECT * FROM daily_prices
    WHERE company_id = ?
    ORDER BY date DESC
    LIMIT 1
  `).get(companyId);

  // Get key metrics
  const metrics = database.prepare(`
    SELECT * FROM company_metrics
    WHERE company_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(companyId);

  // Get recent financials
  const incomeStatement = database.prepare(`
    SELECT * FROM financial_data
    WHERE company_id = ? AND statement_type = 'income_statement'
    ORDER BY fiscal_date_ending DESC
    LIMIT 4
  `).all(companyId);

  // Get sentiment if available
  const sentiment = database.prepare(`
    SELECT * FROM company_sentiment
    WHERE company_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(companyId);

  return {
    company: {
      id: company.id,
      symbol: company.symbol,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      description: company.description,
      marketCap: company.market_cap,
      employees: company.employees
    },
    price: price ? {
      current: price.close,
      date: price.date,
      change: price.close - price.open,
      changePct: price.open > 0 ? ((price.close - price.open) / price.open) * 100 : 0,
      volume: price.volume,
      high: price.high,
      low: price.low
    } : null,
    metrics: metrics ? {
      peRatio: metrics.pe_ratio,
      pbRatio: metrics.pb_ratio,
      psRatio: metrics.ps_ratio,
      evEbitda: metrics.ev_ebitda,
      roe: metrics.roe,
      roa: metrics.roa,
      grossMargin: metrics.gross_margin,
      operatingMargin: metrics.operating_margin,
      netMargin: metrics.net_margin,
      debtToEquity: metrics.debt_to_equity,
      currentRatio: metrics.current_ratio,
      quickRatio: metrics.quick_ratio,
      revenueGrowth: metrics.revenue_growth,
      earningsGrowth: metrics.earnings_growth,
      dividendYield: metrics.dividend_yield
    } : null,
    financials: {
      incomeStatement: incomeStatement.map(f => ({
        period: f.fiscal_date_ending,
        periodType: f.period_type,
        revenue: f.total_revenue,
        grossProfit: f.gross_profit,
        operatingIncome: f.operating_income,
        netIncome: f.net_income,
        eps: f.eps
      }))
    },
    sentiment: sentiment ? {
      overall: sentiment.overall_score,
      news: sentiment.news_sentiment,
      social: sentiment.social_sentiment,
      analyst: sentiment.analyst_rating
    } : null
  };
}

module.exports = {
  getPortfolioDataForAI,
  getAllPortfoliosForBriefing,
  getMarketDataForBriefing,
  getCompanyDataForAI
};
