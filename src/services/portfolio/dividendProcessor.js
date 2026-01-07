// src/services/portfolio/dividendProcessor.js
// Automatic dividend processing for portfolio positions
// Credits dividends to portfolios when stocks go ex-dividend

const { getDatabase } = require('../../database');

class DividendProcessor {
  constructor(db = null) {
    this.db = db || getDatabase();
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Get all portfolios with positions
      getPortfoliosWithPositions: this.db.prepare(`
        SELECT DISTINCT p.id, p.name, p.dividend_reinvest
        FROM portfolios p
        JOIN portfolio_positions pp ON pp.portfolio_id = p.id
        WHERE p.is_archived = 0 AND pp.shares > 0
      `),

      // Get positions for a portfolio with dividend data
      getPositionsWithDividends: this.db.prepare(`
        SELECT
          pp.id as position_id,
          pp.portfolio_id,
          pp.company_id,
          pp.shares,
          pp.first_bought_at,
          c.symbol,
          c.name as company_name
        FROM portfolio_positions pp
        JOIN companies c ON pp.company_id = c.id
        WHERE pp.portfolio_id = ? AND pp.shares > 0
      `),

      // Get dividend history for a company within a date range
      getDividendsInRange: this.db.prepare(`
        SELECT dh.ex_date, dh.amount, dh.payment_date
        FROM dividend_history dh
        WHERE dh.company_id = ?
          AND dh.ex_date BETWEEN ? AND ?
        ORDER BY dh.ex_date ASC
      `),

      // Check if dividend was already processed
      isDividendProcessed: this.db.prepare(`
        SELECT COUNT(*) as count
        FROM portfolio_transactions pt
        WHERE pt.portfolio_id = ?
          AND pt.company_id = ?
          AND pt.transaction_type = 'dividend'
          AND DATE(pt.executed_at) = DATE(?)
      `),

      // Get latest price for DRIP calculation
      getLatestPrice: this.db.prepare(`
        SELECT close as price FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `),

      // Portfolio update
      getPortfolio: this.db.prepare(`
        SELECT * FROM portfolios WHERE id = ?
      `),

      updatePortfolioCash: this.db.prepare(`
        UPDATE portfolios
        SET current_cash = ?,
            current_value = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      // Position update for dividends
      updatePositionDividends: this.db.prepare(`
        UPDATE portfolio_positions
        SET total_dividends = COALESCE(total_dividends, 0) + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      // Create dividend transaction
      createDividendTransaction: this.db.prepare(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id,
          transaction_type, shares, price_per_share, total_amount,
          fees, dividend_per_share, cash_balance_after, position_shares_after,
          notes, order_id, executed_at
        ) VALUES (?, ?, ?, ?, 'dividend', ?, ?, ?, 0, ?, ?, ?, ?, NULL, ?)
      `),

      // Create lot for DRIP
      createDripLot: this.db.prepare(`
        INSERT INTO portfolio_lots (
          portfolio_id, position_id, company_id,
          shares_original, shares_remaining, cost_per_share, total_cost,
          acquired_at, acquisition_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'drip')
      `),

      // Update position after DRIP
      updatePosition: this.db.prepare(`
        UPDATE portfolio_positions
        SET shares = ?,
            average_cost = ?,
            cost_basis = ?,
            current_price = ?,
            current_value = ?,
            unrealized_pnl = ?,
            unrealized_pnl_pct = ?,
            last_traded_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      // Get position by ID
      getPositionById: this.db.prepare(`
        SELECT * FROM portfolio_positions WHERE id = ?
      `)
    };
  }

  /**
   * Process dividends for all portfolios
   * @param {Object} options - Processing options
   * @param {number} options.lookbackDays - Days to look back for ex-dividend dates (default: 7)
   * @param {boolean} options.dryRun - If true, don't make changes, just return what would happen
   * @returns {Object} Processing results
   */
  processAllDividends({ lookbackDays = 7, dryRun = false } = {}) {
    const results = {
      portfoliosChecked: 0,
      dividendsProcessed: 0,
      totalAmount: 0,
      dripShares: 0,
      errors: [],
      details: []
    };

    const portfolios = this.stmts.getPortfoliosWithPositions.all();
    results.portfoliosChecked = portfolios.length;

    for (const portfolio of portfolios) {
      try {
        const portfolioResult = this.processPortfolioDividends(portfolio.id, { lookbackDays, dryRun });

        results.dividendsProcessed += portfolioResult.dividendsProcessed;
        results.totalAmount += portfolioResult.totalAmount;
        results.dripShares += portfolioResult.dripShares;

        if (portfolioResult.dividendsProcessed > 0) {
          results.details.push({
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            ...portfolioResult
          });
        }
      } catch (error) {
        results.errors.push({
          portfolioId: portfolio.id,
          portfolioName: portfolio.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Process dividends for a single portfolio
   * @param {number} portfolioId - Portfolio ID
   * @param {Object} options - Processing options
   * @returns {Object} Processing results
   */
  processPortfolioDividends(portfolioId, { lookbackDays = 7, dryRun = false } = {}) {
    const result = {
      dividendsProcessed: 0,
      totalAmount: 0,
      dripShares: 0,
      dividends: []
    };

    const portfolio = this.stmts.getPortfolio.get(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const positions = this.stmts.getPositionsWithDividends.all(portfolioId);
    const today = new Date().toISOString().split('T')[0];
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
    const startDate = lookbackDate.toISOString().split('T')[0];

    for (const position of positions) {
      // Get dividends for this company in the lookback period
      const dividends = this.stmts.getDividendsInRange.all(
        position.company_id,
        startDate,
        today
      );

      for (const dividend of dividends) {
        // Check if position was held on ex-date
        const positionAcquiredDate = position.first_bought_at?.split('T')[0] || position.first_bought_at;
        if (positionAcquiredDate > dividend.ex_date) {
          // Position was acquired after ex-date, skip
          continue;
        }

        // Check if already processed
        const processed = this.stmts.isDividendProcessed.get(
          portfolioId,
          position.company_id,
          dividend.ex_date
        );

        if (processed.count > 0) {
          // Already processed
          continue;
        }

        // Calculate dividend amount
        const dividendAmount = position.shares * dividend.amount;

        if (dryRun) {
          result.dividends.push({
            symbol: position.symbol,
            exDate: dividend.ex_date,
            dividendPerShare: dividend.amount,
            shares: position.shares,
            totalAmount: dividendAmount,
            drip: portfolio.dividend_reinvest === 1,
            status: 'would_process'
          });
          result.dividendsProcessed++;
          result.totalAmount += dividendAmount;
          continue;
        }

        // Process the dividend
        try {
          const processResult = this._processSingleDividend(
            portfolio,
            position,
            dividend,
            dividendAmount
          );

          result.dividends.push({
            symbol: position.symbol,
            exDate: dividend.ex_date,
            dividendPerShare: dividend.amount,
            shares: position.shares,
            totalAmount: dividendAmount,
            drip: processResult.drip,
            dripShares: processResult.dripShares || 0,
            status: 'processed'
          });

          result.dividendsProcessed++;
          result.totalAmount += dividendAmount;
          if (processResult.dripShares) {
            result.dripShares += processResult.dripShares;
          }
        } catch (error) {
          result.dividends.push({
            symbol: position.symbol,
            exDate: dividend.ex_date,
            dividendPerShare: dividend.amount,
            shares: position.shares,
            totalAmount: dividendAmount,
            status: 'error',
            error: error.message
          });
        }
      }
    }

    return result;
  }

  /**
   * Process a single dividend payment
   * @private
   */
  _processSingleDividend(portfolio, position, dividend, dividendAmount) {
    const isDRIP = portfolio.dividend_reinvest === 1;
    const execDate = dividend.payment_date || dividend.ex_date;

    return this.db.transaction(() => {
      if (isDRIP) {
        return this._processDripDividend(portfolio, position, dividend, dividendAmount, execDate);
      } else {
        return this._processCashDividend(portfolio, position, dividend, dividendAmount, execDate);
      }
    })();
  }

  /**
   * Process dividend as cash
   * @private
   */
  _processCashDividend(portfolio, position, dividend, dividendAmount, execDate) {
    // Add to cash balance
    const newCash = portfolio.current_cash + dividendAmount;
    const newTotalValue = portfolio.current_value + dividendAmount;

    this.stmts.updatePortfolioCash.run(newCash, newTotalValue, portfolio.id);

    // Update position dividends tracker
    this.stmts.updatePositionDividends.run(dividendAmount, position.position_id);

    // Record transaction
    this.stmts.createDividendTransaction.run(
      portfolio.id,
      position.company_id,
      position.position_id,
      null, // lot_id
      position.shares,
      null, // price_per_share
      dividendAmount,
      dividend.amount, // dividend_per_share
      newCash, // cash_balance_after
      position.shares, // shares_after
      `Cash dividend: $${dividend.amount.toFixed(4)}/share (ex-date: ${dividend.ex_date})`,
      execDate
    );

    return {
      drip: false,
      cashAdded: dividendAmount
    };
  }

  /**
   * Process dividend as DRIP (reinvest)
   * @private
   */
  _processDripDividend(portfolio, position, dividend, dividendAmount, execDate) {
    // Get current price
    const priceRow = this.stmts.getLatestPrice.get(position.company_id);
    if (!priceRow) {
      // Fall back to cash dividend if no price available
      return this._processCashDividend(portfolio, position, dividend, dividendAmount, execDate);
    }

    const currentPrice = priceRow.price;
    const sharesToBuy = dividendAmount / currentPrice;

    // Get current position data
    const positionData = this.stmts.getPositionById.get(position.position_id);

    // Create DRIP lot
    const lotResult = this.stmts.createDripLot.run(
      portfolio.id,
      position.position_id,
      position.company_id,
      sharesToBuy,
      sharesToBuy,
      currentPrice,
      dividendAmount,
      execDate
    );

    // Update position
    const newShares = positionData.shares + sharesToBuy;
    const newCostBasis = (positionData.cost_basis || 0) + dividendAmount;
    const newAvgCost = newCostBasis / newShares;
    const currentValue = newShares * currentPrice;
    const unrealizedPnl = currentValue - newCostBasis;
    const unrealizedPnlPct = newCostBasis > 0 ? (unrealizedPnl / newCostBasis) * 100 : 0;

    this.stmts.updatePosition.run(
      newShares,
      newAvgCost,
      newCostBasis,
      currentPrice,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
      execDate,
      position.position_id
    );

    // Update position dividends tracker
    this.stmts.updatePositionDividends.run(dividendAmount, position.position_id);

    // Update portfolio value (cash unchanged, positions increased)
    const portfolioValueChange = sharesToBuy * currentPrice;
    const newTotalValue = portfolio.current_value + portfolioValueChange;
    this.stmts.updatePortfolioCash.run(portfolio.current_cash, newTotalValue, portfolio.id);

    // Record transaction
    this.stmts.createDividendTransaction.run(
      portfolio.id,
      position.company_id,
      position.position_id,
      lotResult.lastInsertRowid,
      sharesToBuy,
      currentPrice,
      dividendAmount,
      dividend.amount, // dividend_per_share
      portfolio.current_cash, // cash_balance_after (unchanged)
      newShares, // shares_after
      `DRIP: ${sharesToBuy.toFixed(4)} shares at $${currentPrice.toFixed(2)} (ex-date: ${dividend.ex_date})`,
      execDate
    );

    return {
      drip: true,
      dripShares: sharesToBuy,
      purchasePrice: currentPrice
    };
  }

  /**
   * Get pending dividends (preview what would be processed)
   * @param {Object} options - Options
   * @param {number} options.portfolioId - Optional portfolio ID (all if not specified)
   * @param {number} options.lookbackDays - Days to look back
   * @returns {Array} Pending dividends
   */
  getPendingDividends({ portfolioId = null, lookbackDays = 7 } = {}) {
    const options = { lookbackDays, dryRun: true };

    if (portfolioId) {
      return this.processPortfolioDividends(portfolioId, options);
    }

    return this.processAllDividends(options);
  }

  /**
   * Get dividend processing history
   * @param {number} portfolioId - Portfolio ID
   * @param {number} limit - Max records
   * @returns {Array} Recent dividend transactions
   */
  getDividendHistory(portfolioId, limit = 50) {
    return this.db.prepare(`
      SELECT
        pt.*,
        c.symbol,
        c.name as company_name
      FROM portfolio_transactions pt
      JOIN companies c ON pt.company_id = c.id
      WHERE pt.portfolio_id = ?
        AND pt.transaction_type = 'dividend'
      ORDER BY pt.executed_at DESC
      LIMIT ?
    `).all(portfolioId, limit);
  }
}

// Singleton instance
let instance = null;

function getDividendProcessor(db = null) {
  if (!instance) {
    instance = new DividendProcessor(db);
  }
  return instance;
}

module.exports = {
  DividendProcessor,
  getDividendProcessor
};
