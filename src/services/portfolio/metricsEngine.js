// src/services/portfolio/metricsEngine.js
// Portfolio Analytics and Metrics Engine (Agent 2)

const { getDatabaseAsync } = require('../../lib/db');

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE = 0.05; // 5% annual risk-free rate

class MetricsEngine {
  // No constructor needed - all methods will get database async

  constructor() {
    console.log('📊 Portfolio Metrics Engine initialized');
  }

  // ============================================
  // Quick Metrics (for dashboard cards)
  // ============================================
  async getQuickMetrics(portfolioId) {
    const database = await getDatabaseAsync();
    const portfolioResult = await database.query(`
      SELECT * FROM portfolios WHERE id = $1
    `, [portfolioId]);
    const portfolio = portfolioResult.rows[0];

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Get current positions with values
    const positionsResult = await database.query(`
      SELECT
        pp.*,
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.change_1d as price_change_1d
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);
    const positions = positionsResult.rows;

    // Calculate current value
    let positionsValue = 0;
    for (const pos of positions) {
      const currentPrice = pos.last_price || pos.average_cost;
      positionsValue += pos.shares * currentPrice;
    }

    const totalValue = portfolio.current_cash + positionsValue;
    const totalCostBasis = positions.reduce((sum, p) => sum + p.cost_basis, 0);
    const unrealizedPnL = positionsValue - totalCostBasis;
    const unrealizedPnLPct = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;

    // Get period returns from snapshots
    const periodReturns = await this._getPeriodReturns(portfolioId, totalValue);

    // Get today's change
    const todayChange = await this._getTodayChange(portfolioId, totalValue);

    return {
      portfolioId,
      name: portfolio.name,
      totalValue,
      cashBalance: portfolio.current_cash,
      positionsValue,
      positionCount: positions.length,
      totalCostBasis,
      unrealizedPnL,
      unrealizedPnLPct,
      todayChange: todayChange.value,
      todayChangePct: todayChange.pct,
      ...periodReturns
    };
  }

  // ============================================
  // Full Performance Metrics
  // ============================================
  async getPerformanceMetrics(portfolioId, period = '1y') {
    const snapshots = await this._getSnapshotsForPeriod(portfolioId, period);

    if (snapshots.length < 2) {
      return {
        portfolioId,
        period,
        error: 'Insufficient data for calculations',
        dataPoints: snapshots.length
      };
    }

    const dailyReturns = this._calculateDailyReturns(snapshots);
    const benchmarkReturns = this._calculateBenchmarkReturns(snapshots);

    const startValue = snapshots[0].total_value;
    const endValue = snapshots[snapshots.length - 1].total_value;
    const totalReturn = (endValue - startValue) / startValue;
    const days = snapshots.length;
    const years = days / TRADING_DAYS_PER_YEAR;

    // Core metrics
    const cagr = this._calculateCAGR(startValue, endValue, years);
    const volatility = this._calculateVolatility(dailyReturns);
    const sharpeRatio = this._calculateSharpe(cagr, volatility);
    const sortinoRatio = this._calculateSortino(dailyReturns, cagr);
    const { maxDrawdown, maxDrawdownStart, maxDrawdownEnd } = this._calculateMaxDrawdown(snapshots);
    const calmarRatio = maxDrawdown !== 0 ? cagr / Math.abs(maxDrawdown) : null;

    // Benchmark comparison
    let benchmarkMetrics = null;
    if (benchmarkReturns.length > 0) {
      benchmarkMetrics = this._calculateBenchmarkComparison(dailyReturns, benchmarkReturns, snapshots);
    }

    return {
      portfolioId,
      period,
      dataPoints: snapshots.length,
      startDate: snapshots[0].snapshot_date,
      endDate: snapshots[snapshots.length - 1].snapshot_date,
      startValue,
      endValue,
      totalReturnPct: totalReturn * 100,
      cagr: cagr * 100,
      volatility: volatility * 100,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100,
      maxDrawdownStart,
      maxDrawdownEnd,
      calmarRatio,
      benchmark: benchmarkMetrics
    };
  }

  // ============================================
  // Allocation Analysis
  // ============================================
  async getAllocation(portfolioId) {
    const database = await getDatabaseAsync();
    const positionsResult = await database.query(`
      SELECT
        pp.*,
        c.symbol,
        c.name,
        c.sector,
        c.industry,
        c.market_cap,
        pm.last_price
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);
    const positions = positionsResult.rows;

    const portfolioResult = await database.query(`
      SELECT current_cash FROM portfolios WHERE id = $1
    `, [portfolioId]);
    const portfolio = portfolioResult.rows[0];

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Calculate current values
    let totalPositionsValue = 0;
    const positionsWithValues = positions.map(pos => {
      const currentPrice = pos.last_price || pos.average_cost;
      const marketValue = pos.shares * currentPrice;
      totalPositionsValue += marketValue;
      return { ...pos, currentPrice, marketValue };
    });

    const totalValue = portfolio.current_cash + totalPositionsValue;

    // Position breakdown
    const byPosition = positionsWithValues.map(pos => ({
      symbol: pos.symbol,
      name: pos.name,
      shares: pos.shares,
      marketValue: pos.marketValue,
      weight: (pos.marketValue / totalValue) * 100,
      costBasis: pos.cost_basis,
      unrealizedPnL: pos.marketValue - pos.cost_basis,
      unrealizedPnLPct: ((pos.marketValue - pos.cost_basis) / pos.cost_basis) * 100
    })).sort((a, b) => b.weight - a.weight);

    // Sector breakdown
    const bySector = this._groupAllocation(positionsWithValues, 'sector', totalValue);

    // Market cap breakdown
    const byMarketCap = this._getMarketCapBreakdown(positionsWithValues, totalValue);

    // Concentration metrics
    const concentration = this._calculateConcentration(byPosition);

    return {
      portfolioId,
      totalValue,
      cashBalance: portfolio.current_cash,
      cashWeight: (portfolio.current_cash / totalValue) * 100,
      positionsValue: totalPositionsValue,
      positionCount: positions.length,
      byPosition,
      bySector,
      byMarketCap,
      concentration
    };
  }

  // ============================================
  // Daily Snapshot Creation
  // ============================================
  async createDailySnapshot(portfolioId, date = null) {
    const database = await getDatabaseAsync();
    const snapshotDate = date || new Date().toISOString().split('T')[0];

    const portfolioResult = await database.query(`
      SELECT * FROM portfolios WHERE id = $1
    `, [portfolioId]);
    const portfolio = portfolioResult.rows[0];

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Get positions with current prices
    const positionsResult = await database.query(`
      SELECT
        pp.*,
        pm.last_price
      FROM portfolio_positions pp
      LEFT JOIN price_metrics pm ON pp.company_id = pm.company_id
      WHERE pp.portfolio_id = $1
    `, [portfolioId]);
    const positions = positionsResult.rows;

    // Calculate current value
    let positionsValue = 0;
    for (const pos of positions) {
      const price = pos.last_price || pos.average_cost;
      positionsValue += pos.shares * price;
    }

    const totalValue = portfolio.current_cash + positionsValue;
    const totalCostBasis = positions.reduce((sum, p) => sum + p.cost_basis, 0);
    const unrealizedPnL = positionsValue - totalCostBasis;

    // Get previous day snapshot for return calculation
    const prevSnapshotResult = await database.query(`
      SELECT * FROM portfolio_snapshots
      WHERE portfolio_id = $1 AND snapshot_date < $2
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [portfolioId, snapshotDate]);
    const prevSnapshot = prevSnapshotResult.rows[0];

    let dailyReturn = null;
    let dailyReturnPct = null;

    if (prevSnapshot) {
      dailyReturn = totalValue - prevSnapshot.total_value;
      dailyReturnPct = (dailyReturn / prevSnapshot.total_value) * 100;
    }

    // Get transaction flows for the day
    const flowsResult = await database.query(`
      SELECT
        SUM(CASE WHEN transaction_type IN ('deposit') THEN total_amount ELSE 0 END) as deposits,
        SUM(CASE WHEN transaction_type IN ('withdraw') THEN total_amount ELSE 0 END) as withdrawals
      FROM portfolio_transactions
      WHERE portfolio_id = $1 AND DATE(executed_at) = $2
    `, [portfolioId, snapshotDate]);
    const flows = flowsResult.rows[0];

    const netFlows = (flows?.deposits || 0) - (flows?.withdrawals || 0);

    // Get benchmark value
    const benchmarkValue = await this._getBenchmarkValue(portfolio.benchmark_index_id, snapshotDate);

    // Calculate benchmark return
    let benchmarkDailyReturnPct = null;
    if (prevSnapshot && benchmarkValue && prevSnapshot.benchmark_value) {
      benchmarkDailyReturnPct = ((benchmarkValue - prevSnapshot.benchmark_value) / prevSnapshot.benchmark_value) * 100;
    }

    // Get cumulative deposits/withdrawals
    const cumFlowsResult = await database.query(`
      SELECT
        SUM(CASE WHEN transaction_type = 'deposit' THEN total_amount ELSE 0 END) as total_deposited,
        SUM(CASE WHEN transaction_type = 'withdraw' THEN total_amount ELSE 0 END) as total_withdrawn
      FROM portfolio_transactions
      WHERE portfolio_id = $1 AND DATE(executed_at) <= $2
    `, [portfolioId, snapshotDate]);
    const cumFlows = cumFlowsResult.rows[0];

    // Upsert snapshot
    await database.query(`
      INSERT INTO portfolio_snapshots (
        portfolio_id, snapshot_date, total_value, cash_value, positions_value,
        total_cost_basis, unrealized_pnl, realized_pnl, total_deposited, total_withdrawn,
        positions_count, benchmark_value, net_flows, daily_return, daily_return_pct,
        benchmark_daily_return_pct
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT(portfolio_id, snapshot_date) DO UPDATE SET
        total_value = EXCLUDED.total_value,
        cash_value = EXCLUDED.cash_value,
        positions_value = EXCLUDED.positions_value,
        total_cost_basis = EXCLUDED.total_cost_basis,
        unrealized_pnl = EXCLUDED.unrealized_pnl,
        total_deposited = EXCLUDED.total_deposited,
        total_withdrawn = EXCLUDED.total_withdrawn,
        positions_count = EXCLUDED.positions_count,
        benchmark_value = EXCLUDED.benchmark_value,
        net_flows = EXCLUDED.net_flows,
        daily_return = EXCLUDED.daily_return,
        daily_return_pct = EXCLUDED.daily_return_pct,
        benchmark_daily_return_pct = EXCLUDED.benchmark_daily_return_pct
    `, [
      portfolioId,
      snapshotDate,
      totalValue,
      portfolio.current_cash,
      positionsValue,
      totalCostBasis,
      unrealizedPnL,
      portfolio.realized_pnl || 0,
      cumFlows?.total_deposited || 0,
      cumFlows?.total_withdrawn || 0,
      positions.length,
      benchmarkValue,
      netFlows,
      dailyReturn,
      dailyReturnPct,
      benchmarkDailyReturnPct
    ]);

    return {
      portfolioId,
      snapshotDate,
      totalValue,
      positionsValue,
      cashValue: portfolio.current_cash,
      positionsCount: positions.length,
      dailyReturnPct,
      benchmarkDailyReturnPct
    };
  }

  async createAllDailySnapshots(date = null) {
    const database = await getDatabaseAsync();
    const portfoliosResult = await database.query(`
      SELECT id, name FROM portfolios WHERE is_archived = false
    `);
    const portfolios = portfoliosResult.rows;

    const results = [];
    for (const portfolio of portfolios) {
      try {
        const snapshot = await this.createDailySnapshot(portfolio.id, date);
        results.push({ ...snapshot, name: portfolio.name, success: true });
      } catch (error) {
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: false,
          error: error.message
        });
      }
    }

    return {
      date: date || new Date().toISOString().split('T')[0],
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  async _getPeriodReturns(portfolioId, currentValue) {
    const database = await getDatabaseAsync();
    const periods = {
      '1d': 1,
      '1w': 7,
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      'ytd': null // Special case
    };

    const returns = {};
    const today = new Date().toISOString().split('T')[0];

    for (const [period, days] of Object.entries(periods)) {
      let targetDate;
      if (period === 'ytd') {
        targetDate = `${new Date().getFullYear()}-01-01`;
      } else {
        const d = new Date();
        d.setDate(d.getDate() - days);
        targetDate = d.toISOString().split('T')[0];
      }

      const snapshotResult = await database.query(`
        SELECT total_value FROM portfolio_snapshots
        WHERE portfolio_id = $1 AND snapshot_date <= $2
        ORDER BY snapshot_date DESC
        LIMIT 1
      `, [portfolioId, targetDate]);
      const snapshot = snapshotResult.rows[0];

      if (snapshot && snapshot.total_value > 0) {
        returns[`return_${period}`] = ((currentValue - snapshot.total_value) / snapshot.total_value) * 100;
      } else {
        returns[`return_${period}`] = null;
      }
    }

    return returns;
  }

  async _getTodayChange(portfolioId, currentValue) {
    const database = await getDatabaseAsync();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const snapshotResult = await database.query(`
      SELECT total_value FROM portfolio_snapshots
      WHERE portfolio_id = $1 AND snapshot_date <= $2
      ORDER BY snapshot_date DESC
      LIMIT 1
    `, [portfolioId, yesterdayStr]);
    const snapshot = snapshotResult.rows[0];

    if (snapshot && snapshot.total_value > 0) {
      return {
        value: currentValue - snapshot.total_value,
        pct: ((currentValue - snapshot.total_value) / snapshot.total_value) * 100
      };
    }

    return { value: 0, pct: 0 };
  }

  async _getSnapshotsForPeriod(portfolioId, period) {
    const database = await getDatabaseAsync();
    const periodDays = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      '3y': 1095,
      '5y': 1825,
      'ytd': null,
      'all': null
    };

    let startDate;
    if (period === 'ytd') {
      startDate = `${new Date().getFullYear()}-01-01`;
    } else if (period === 'all' || !periodDays[period]) {
      startDate = '1900-01-01';
    } else {
      const d = new Date();
      d.setDate(d.getDate() - periodDays[period]);
      startDate = d.toISOString().split('T')[0];
    }

    const result = await database.query(`
      SELECT * FROM portfolio_snapshots
      WHERE portfolio_id = $1 AND snapshot_date >= $2
      ORDER BY snapshot_date ASC
    `, [portfolioId, startDate]);
    return result.rows;
  }

  _calculateDailyReturns(snapshots) {
    const returns = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].total_value;
      const currValue = snapshots[i].total_value;
      const netFlows = snapshots[i].net_flows || 0;

      // Adjust for cash flows (Time-Weighted Return)
      const adjustedPrevValue = prevValue + netFlows;
      const dailyReturn = adjustedPrevValue > 0 ? (currValue - adjustedPrevValue) / adjustedPrevValue : 0;
      returns.push(dailyReturn);
    }
    return returns;
  }

  _calculateBenchmarkReturns(snapshots) {
    const returns = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].benchmark_value;
      const currValue = snapshots[i].benchmark_value;

      if (prevValue && currValue && prevValue > 0) {
        returns.push((currValue - prevValue) / prevValue);
      }
    }
    return returns;
  }

  _calculateCAGR(startValue, endValue, years) {
    if (startValue <= 0 || endValue <= 0 || years <= 0) return 0;
    return Math.pow(endValue / startValue, 1 / years) - 1;
  }

  _calculateVolatility(returns) {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (returns.length - 1);
    const dailyVol = Math.sqrt(variance);

    // Annualize
    return dailyVol * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  _calculateSharpe(cagr, volatility) {
    if (volatility === 0) return null;
    return (cagr - RISK_FREE_RATE) / volatility;
  }

  _calculateSortino(dailyReturns, annualReturn) {
    const negativeReturns = dailyReturns.filter(r => r < 0);
    if (negativeReturns.length < 2) return null;

    const squaredNegReturns = negativeReturns.map(r => Math.pow(r, 2));
    const downsideVariance = squaredNegReturns.reduce((a, b) => a + b, 0) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

    if (downsideDeviation === 0) return null;
    return (annualReturn - RISK_FREE_RATE) / downsideDeviation;
  }

  _calculateMaxDrawdown(snapshots) {
    let peak = snapshots[0].total_value;
    let maxDrawdown = 0;
    let maxDrawdownStart = snapshots[0].snapshot_date;
    let maxDrawdownEnd = snapshots[0].snapshot_date;
    let currentDrawdownStart = snapshots[0].snapshot_date;

    for (const snapshot of snapshots) {
      if (snapshot.total_value > peak) {
        peak = snapshot.total_value;
        currentDrawdownStart = snapshot.snapshot_date;
      }

      const drawdown = (peak - snapshot.total_value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownStart = currentDrawdownStart;
        maxDrawdownEnd = snapshot.snapshot_date;
      }
    }

    return { maxDrawdown, maxDrawdownStart, maxDrawdownEnd };
  }

  _calculateBenchmarkComparison(portfolioReturns, benchmarkReturns, snapshots) {
    // Use minimum length
    const len = Math.min(portfolioReturns.length, benchmarkReturns.length);
    const pReturns = portfolioReturns.slice(0, len);
    const bReturns = benchmarkReturns.slice(0, len);

    // Calculate means
    const pMean = pReturns.reduce((a, b) => a + b, 0) / len;
    const bMean = bReturns.reduce((a, b) => a + b, 0) / len;

    // Calculate covariance and variances
    let covariance = 0;
    let pVariance = 0;
    let bVariance = 0;
    const excessReturns = [];

    for (let i = 0; i < len; i++) {
      covariance += (pReturns[i] - pMean) * (bReturns[i] - bMean);
      pVariance += Math.pow(pReturns[i] - pMean, 2);
      bVariance += Math.pow(bReturns[i] - bMean, 2);
      excessReturns.push(pReturns[i] - bReturns[i]);
    }

    covariance /= len;
    pVariance /= len;
    bVariance /= len;

    const beta = bVariance > 0 ? covariance / bVariance : 1;
    const correlation = bVariance > 0 && pVariance > 0
      ? covariance / (Math.sqrt(pVariance) * Math.sqrt(bVariance))
      : 0;

    // Tracking error
    const excessMean = excessReturns.reduce((a, b) => a + b, 0) / len;
    const trackingVariance = excessReturns.reduce((sum, r) => sum + Math.pow(r - excessMean, 2), 0) / len;
    const trackingError = Math.sqrt(trackingVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

    // Annualized returns for alpha
    const startBenchmark = snapshots[0].benchmark_value;
    const endBenchmark = snapshots[snapshots.length - 1].benchmark_value;
    const years = len / TRADING_DAYS_PER_YEAR;

    const portfolioCAGR = this._calculateCAGR(
      snapshots[0].total_value,
      snapshots[snapshots.length - 1].total_value,
      years
    );
    const benchmarkCAGR = startBenchmark && endBenchmark
      ? this._calculateCAGR(startBenchmark, endBenchmark, years)
      : 0;

    const alpha = portfolioCAGR - (RISK_FREE_RATE + beta * (benchmarkCAGR - RISK_FREE_RATE));
    const informationRatio = trackingError > 0 ? (portfolioCAGR - benchmarkCAGR) / trackingError : null;

    return {
      beta,
      alpha: alpha * 100,
      correlation,
      trackingError: trackingError * 100,
      informationRatio,
      benchmarkReturn: benchmarkCAGR * 100
    };
  }

  _groupAllocation(positions, field, totalValue) {
    const groups = {};

    for (const pos of positions) {
      const key = pos[field] || 'Unknown';
      if (!groups[key]) {
        groups[key] = { name: key, marketValue: 0, positionCount: 0 };
      }
      groups[key].marketValue += pos.marketValue;
      groups[key].positionCount += 1;
    }

    return Object.values(groups)
      .map(g => ({
        ...g,
        weight: (g.marketValue / totalValue) * 100
      }))
      .sort((a, b) => b.weight - a.weight);
  }

  _getMarketCapBreakdown(positions, totalValue) {
    const caps = {
      'Large Cap (>$10B)': { min: 10e9, marketValue: 0, count: 0 },
      'Mid Cap ($2B-$10B)': { min: 2e9, max: 10e9, marketValue: 0, count: 0 },
      'Small Cap ($300M-$2B)': { min: 300e6, max: 2e9, marketValue: 0, count: 0 },
      'Micro Cap (<$300M)': { max: 300e6, marketValue: 0, count: 0 }
    };

    for (const pos of positions) {
      const mc = pos.market_cap || 0;
      if (mc >= 10e9) {
        caps['Large Cap (>$10B)'].marketValue += pos.marketValue;
        caps['Large Cap (>$10B)'].count += 1;
      } else if (mc >= 2e9) {
        caps['Mid Cap ($2B-$10B)'].marketValue += pos.marketValue;
        caps['Mid Cap ($2B-$10B)'].count += 1;
      } else if (mc >= 300e6) {
        caps['Small Cap ($300M-$2B)'].marketValue += pos.marketValue;
        caps['Small Cap ($300M-$2B)'].count += 1;
      } else {
        caps['Micro Cap (<$300M)'].marketValue += pos.marketValue;
        caps['Micro Cap (<$300M)'].count += 1;
      }
    }

    return Object.entries(caps)
      .filter(([_, data]) => data.count > 0)
      .map(([name, data]) => ({
        name,
        marketValue: data.marketValue,
        weight: (data.marketValue / totalValue) * 100,
        positionCount: data.count
      }));
  }

  _calculateConcentration(byPosition) {
    const weights = byPosition.map(p => p.weight);

    // Herfindahl-Hirschman Index (normalized)
    const hhi = weights.reduce((sum, w) => sum + Math.pow(w / 100, 2), 0);

    // Top N weights
    const top5Weight = weights.slice(0, 5).reduce((a, b) => a + b, 0);
    const top10Weight = weights.slice(0, 10).reduce((a, b) => a + b, 0);

    // Effective number of positions (inverse HHI)
    const effectivePositions = hhi > 0 ? 1 / hhi : weights.length;

    return {
      hhi: hhi * 10000, // Traditional HHI scale
      effectivePositions: Math.round(effectivePositions * 10) / 10,
      top5Weight,
      top10Weight,
      isConcentrated: top5Weight > 50
    };
  }

  async _getBenchmarkValue(benchmarkIndexId, date) {
    const database = await getDatabaseAsync();
    if (!benchmarkIndexId) {
      // Default to S&P 500 (id=1)
      benchmarkIndexId = 1;
    }

    const priceResult = await database.query(`
      SELECT close FROM market_index_prices
      WHERE index_id = $1 AND date <= $2
      ORDER BY date DESC
      LIMIT 1
    `, [benchmarkIndexId, date]);
    const price = priceResult.rows[0];

    return price?.close || null;
  }
}

// Export singleton instance
module.exports = new MetricsEngine();
