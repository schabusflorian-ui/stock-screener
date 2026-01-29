// src/services/portfolio/exportService.js
// Portfolio Export Service - CSV and Summary exports

const db = require('../../database');

class ExportService {
  constructor() {
    this.db = db.getDatabase();
  }

  // ============================================
  // Holdings Export (CSV format)
  // ============================================
  exportHoldingsCSV(portfolioId) {
    const positions = this.db.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        pp.shares,
        pp.cost_basis,
        pp.cost_basis / NULLIF(pp.shares, 0) as avg_cost,
        pm.last_price,
        pp.shares * COALESCE(pm.last_price, 0) as market_value,
        (pp.shares * COALESCE(pm.last_price, 0)) - pp.cost_basis as unrealized_gain,
        CASE WHEN pp.cost_basis > 0
          THEN ((pp.shares * COALESCE(pm.last_price, 0)) - pp.cost_basis) / pp.cost_basis * 100
          ELSE 0 END as gain_pct,
        pm.change_1d as day_change_pct,
        pm.change_1w as week_change_pct,
        pm.change_1m as month_change_pct,
        pm.change_ytd as ytd_change_pct,
        pm.change_1y as year_change_pct,
        pm.beta,
        dm.dividend_yield
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      LEFT JOIN dividend_metrics dm ON c.id = dm.company_id
      WHERE pp.portfolio_id = ?
      ORDER BY pp.shares * COALESCE(pm.last_price, 0) DESC
    `).all(portfolioId);

    const headers = [
      'Symbol', 'Name', 'Sector', 'Industry', 'Shares', 'Cost Basis',
      'Avg Cost', 'Current Price', 'Market Value', 'Unrealized Gain',
      'Gain %', 'Day %', 'Week %', 'Month %', 'YTD %', '1Y %', 'Beta', 'Div Yield %'
    ];

    const rows = positions.map(p => [
      p.symbol,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      p.sector || '',
      p.industry || '',
      p.shares?.toFixed(4),
      p.cost_basis?.toFixed(2),
      p.avg_cost?.toFixed(2),
      p.last_price?.toFixed(2),
      p.market_value?.toFixed(2),
      p.unrealized_gain?.toFixed(2),
      p.gain_pct?.toFixed(2),
      p.day_change_pct?.toFixed(2),
      p.week_change_pct?.toFixed(2),
      p.month_change_pct?.toFixed(2),
      p.ytd_change_pct?.toFixed(2),
      p.year_change_pct?.toFixed(2),
      p.beta?.toFixed(2),
      p.dividend_yield?.toFixed(2)
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // ============================================
  // Transactions Export (CSV format)
  // ============================================
  exportTransactionsCSV(portfolioId, options = {}) {
    const { startDate, endDate, type } = options;

    let query = `
      SELECT
        t.executed_at,
        t.transaction_type,
        c.symbol,
        c.name,
        t.shares,
        t.price_per_share,
        t.total_amount,
        t.fees,
        t.notes
      FROM portfolio_transactions t
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.portfolio_id = ?
    `;
    const params = [portfolioId];

    if (startDate) {
      query += ' AND t.executed_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND t.executed_at <= ?';
      params.push(endDate);
    }
    if (type) {
      query += ' AND t.transaction_type = ?';
      params.push(type);
    }

    query += ' ORDER BY t.executed_at DESC';

    const transactions = this.db.prepare(query).all(...params);

    const headers = [
      'Date', 'Type', 'Symbol', 'Name', 'Shares', 'Price',
      'Total', 'Fees', 'Notes'
    ];

    const rows = transactions.map(t => [
      t.executed_at,
      t.transaction_type,
      t.symbol || '',
      `"${(t.name || '').replace(/"/g, '""')}"`,
      t.shares?.toFixed(4) || '',
      t.price_per_share?.toFixed(2) || '',
      t.total_amount?.toFixed(2),
      t.fees?.toFixed(2) || '0.00',
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // ============================================
  // Portfolio Summary Export (JSON/Text)
  // ============================================
  exportSummary(portfolioId) {
    // Get portfolio info
    const portfolio = this.db.prepare(`
      SELECT
        p.id, p.name, p.description, p.portfolio_type, p.currency,
        p.current_cash as cash_balance, p.created_at,
        (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as position_count
      FROM portfolios p
      WHERE p.id = ?
    `).get(portfolioId);

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    // Get positions summary
    const positionsSummary = this.db.prepare(`
      SELECT
        SUM(pp.shares * COALESCE(pm.last_price, 0)) as total_market_value,
        SUM(pp.cost_basis) as total_cost_basis,
        COUNT(*) as position_count
      FROM portfolio_positions pp
      LEFT JOIN price_metrics pm ON pp.company_id = pm.company_id
      WHERE pp.portfolio_id = ?
    `).get(portfolioId);

    // Get sector allocation
    const sectorAllocation = this.db.prepare(`
      SELECT
        COALESCE(c.sector, 'Unknown') as sector,
        SUM(pp.shares * COALESCE(pm.last_price, 0)) as value,
        COUNT(*) as count
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = ?
      GROUP BY COALESCE(c.sector, 'Unknown')
      ORDER BY value DESC
    `).all(portfolioId);

    // Get top holdings
    const topHoldings = this.db.prepare(`
      SELECT
        c.symbol,
        c.name,
        pp.shares * COALESCE(pm.last_price, 0) as value,
        ((pp.shares * COALESCE(pm.last_price, 0)) - pp.cost_basis) as gain
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = ?
      ORDER BY value DESC
      LIMIT 10
    `).all(portfolioId);

    // Get transaction stats
    const transactionStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_trades,
        SUM(CASE WHEN transaction_type = 'buy' THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN transaction_type = 'sell' THEN 1 ELSE 0 END) as sells,
        MIN(executed_at) as first_trade,
        MAX(executed_at) as last_trade
      FROM portfolio_transactions
      WHERE portfolio_id = ?
    `).get(portfolioId);

    const totalValue = (positionsSummary?.total_market_value || 0) + (portfolio.cash_balance || 0);
    const totalCost = positionsSummary?.total_cost_basis || 0;
    const unrealizedGain = (positionsSummary?.total_market_value || 0) - totalCost;

    return {
      exportDate: new Date().toISOString(),
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        type: portfolio.portfolio_type,
        currency: portfolio.currency || 'USD',
        createdAt: portfolio.created_at
      },
      summary: {
        totalValue: Math.round(totalValue * 100) / 100,
        cashBalance: Math.round((portfolio.cash_balance || 0) * 100) / 100,
        investedValue: Math.round((positionsSummary?.total_market_value || 0) * 100) / 100,
        costBasis: Math.round(totalCost * 100) / 100,
        unrealizedGain: Math.round(unrealizedGain * 100) / 100,
        unrealizedGainPct: totalCost > 0 ? Math.round(unrealizedGain / totalCost * 10000) / 100 : 0,
        positionCount: positionsSummary?.position_count || 0
      },
      sectorAllocation: sectorAllocation.map(s => ({
        sector: s.sector,
        value: Math.round((s.value || 0) * 100) / 100,
        weight: totalValue > 0 ? Math.round((s.value || 0) / totalValue * 10000) / 100 : 0,
        positionCount: s.count
      })),
      topHoldings: topHoldings.map(h => ({
        symbol: h.symbol,
        name: h.name,
        value: Math.round((h.value || 0) * 100) / 100,
        weight: totalValue > 0 ? Math.round((h.value || 0) / totalValue * 10000) / 100 : 0,
        gain: Math.round((h.gain || 0) * 100) / 100
      })),
      tradingActivity: {
        totalTrades: transactionStats?.total_trades || 0,
        buys: transactionStats?.buys || 0,
        sells: transactionStats?.sells || 0,
        firstTrade: transactionStats?.first_trade,
        lastTrade: transactionStats?.last_trade
      }
    };
  }

  // ============================================
  // Tax Report Export (CSV)
  // ============================================
  exportTaxReport(portfolioId, year) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Get closed lots (sales) within the year
    const closedLots = this.db.prepare(`
      SELECT
        pl.closed_at as sell_date,
        c.symbol,
        c.name,
        pl.shares_sold as shares,
        pl.total_cost / NULLIF(pl.shares_original, 0) as cost_per_share,
        pl.shares_sold * (pl.total_cost / NULLIF(pl.shares_original, 0)) as cost_basis,
        pl.realized_pnl,
        pl.acquired_at
      FROM portfolio_lots pl
      JOIN companies c ON pl.company_id = c.id
      WHERE pl.portfolio_id = ?
        AND pl.is_closed = 1
        AND pl.closed_at BETWEEN ? AND ?
      ORDER BY pl.closed_at ASC
    `).all(portfolioId, startDate, endDate);

    // Calculate short-term vs long-term
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    let shortTermGains = 0;
    let longTermGains = 0;

    const headers = [
      'Sell Date', 'Symbol', 'Name', 'Shares', 'Cost Basis',
      'Gain/Loss', 'Acquired', 'Holding Period'
    ];

    const rows = closedLots.map(s => {
      const sellDate = new Date(s.sell_date);
      const acquiredDate = s.acquired_at ? new Date(s.acquired_at) : null;
      const isLongTerm = acquiredDate && (sellDate - acquiredDate) > oneYearMs;

      if (s.realized_pnl) {
        if (isLongTerm) {
          longTermGains += s.realized_pnl;
        } else {
          shortTermGains += s.realized_pnl;
        }
      }

      return [
        s.sell_date,
        s.symbol,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        s.shares?.toFixed(4),
        s.cost_basis?.toFixed(2) || '',
        s.realized_pnl?.toFixed(2) || '',
        s.acquired_at || 'Various',
        isLongTerm ? 'Long-term' : 'Short-term'
      ];
    });

    // Add summary row
    rows.push([]);
    rows.push(['SUMMARY']);
    rows.push(['Short-term gains/losses:', '', '', '', '', shortTermGains.toFixed(2)]);
    rows.push(['Long-term gains/losses:', '', '', '', '', longTermGains.toFixed(2)]);
    rows.push(['Total gains/losses:', '', '', '', '', (shortTermGains + longTermGains).toFixed(2)]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // ============================================
  // Dividend Report Export (CSV)
  // ============================================
  exportDividendReport(portfolioId, year) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const dividends = this.db.prepare(`
      SELECT
        t.executed_at as payment_date,
        c.symbol,
        c.name,
        t.total_amount as dividend_amount,
        t.notes
      FROM portfolio_transactions t
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.portfolio_id = ?
        AND t.transaction_type = 'dividend'
        AND t.executed_at BETWEEN ? AND ?
      ORDER BY t.executed_at ASC
    `).all(portfolioId, startDate, endDate);

    const totalDividends = dividends.reduce((sum, d) => sum + (d.dividend_amount || 0), 0);

    const headers = ['Date', 'Symbol', 'Name', 'Amount', 'Notes'];

    const rows = dividends.map(d => [
      d.payment_date,
      d.symbol || 'N/A',
      `"${(d.name || '').replace(/"/g, '""')}"`,
      d.dividend_amount?.toFixed(2),
      `"${(d.notes || '').replace(/"/g, '""')}"`
    ]);

    // Add summary
    rows.push([]);
    rows.push(['TOTAL DIVIDENDS', '', '', totalDividends.toFixed(2)]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

module.exports = new ExportService();
