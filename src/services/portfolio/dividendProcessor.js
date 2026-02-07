// src/services/portfolio/dividendProcessor.js
// Automatic dividend processing for portfolio positions
// Credits dividends to portfolios when stocks go ex-dividend

const { getDatabaseAsync } = require('../../database');

class DividendProcessor {
  constructor() {
    // No database initialization needed for async pattern
  }

  /**
   * Process dividends for all portfolios
   * @param {Object} options - Processing options
   * @param {number} options.lookbackDays - Days to look back for ex-dividend dates (default: 7)
   * @param {boolean} options.dryRun - If true, don't make changes, just return what would happen
   * @returns {Object} Processing results
   */
  async processAllDividends({ lookbackDays = 7, dryRun = false } = {}) {
    const database = await getDatabaseAsync();
    const results = {
      portfoliosChecked: 0,
      dividendsProcessed: 0,
      totalAmount: 0,
      dripShares: 0,
      errors: [],
      details: []
    };

    const portfoliosResult = await database.query(`
      SELECT DISTINCT p.id, p.name, p.dividend_reinvest
      FROM portfolios p
      JOIN portfolio_positions pp ON pp.portfolio_id = p.id
      WHERE p.is_archived = false AND pp.shares > 0
    `);
    const portfolios = portfoliosResult.rows;
    results.portfoliosChecked = portfolios.length;

    for (const portfolio of portfolios) {
      try {
        const portfolioResult = await this.processPortfolioDividends(portfolio.id, { lookbackDays, dryRun });

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
  async processPortfolioDividends(portfolioId, { lookbackDays = 7, dryRun = false } = {}) {
    const database = await getDatabaseAsync();
    const result = {
      dividendsProcessed: 0,
      totalAmount: 0,
      dripShares: 0,
      dividends: []
    };

    const portfolioResult = await database.query(`
      SELECT * FROM portfolios WHERE id = $1
    `, [portfolioId]);
    const portfolio = portfolioResult.rows[0];

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const positionsResult = await database.query(`
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
      WHERE pp.portfolio_id = $1 AND pp.shares > 0
    `, [portfolioId]);
    const positions = positionsResult.rows;

    const today = new Date().toISOString().split('T')[0];
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
    const startDate = lookbackDate.toISOString().split('T')[0];

    for (const position of positions) {
      // Get dividends for this company in the lookback period
      const dividendsResult = await database.query(`
        SELECT dh.ex_date, dh.amount, dh.payment_date
        FROM dividend_history dh
        WHERE dh.company_id = $1
          AND dh.ex_date BETWEEN $2 AND $3
        ORDER BY dh.ex_date ASC
      `, [position.company_id, startDate, today]);
      const dividends = dividendsResult.rows;

      for (const dividend of dividends) {
        // Check if position was held on ex-date
        const positionAcquiredDate = position.first_bought_at?.split('T')[0] || position.first_bought_at;
        if (positionAcquiredDate > dividend.ex_date) {
          // Position was acquired after ex-date, skip
          continue;
        }

        // Check if already processed
        const processedResult = await database.query(`
          SELECT COUNT(*) as count
          FROM portfolio_transactions pt
          WHERE pt.portfolio_id = $1
            AND pt.company_id = $2
            AND pt.transaction_type = 'dividend'
            AND DATE(pt.executed_at) = DATE($3)
        `, [portfolioId, position.company_id, dividend.ex_date]);
        const processed = processedResult.rows[0];

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
            drip: portfolio.dividend_reinvest === true,
            status: 'would_process'
          });
          result.dividendsProcessed++;
          result.totalAmount += dividendAmount;
          continue;
        }

        // Process the dividend
        try {
          const processResult = await this._processSingleDividend(
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
  async _processSingleDividend(portfolio, position, dividend, dividendAmount) {
    const database = await getDatabaseAsync();
    const isDRIP = portfolio.dividend_reinvest === true;
    const execDate = dividend.payment_date || dividend.ex_date;

    // Start transaction
    await database.query('BEGIN');

    try {
      let result;
      if (isDRIP) {
        result = await this._processDripDividend(portfolio, position, dividend, dividendAmount, execDate);
      } else {
        result = await this._processCashDividend(portfolio, position, dividend, dividendAmount, execDate);
      }

      await database.query('COMMIT');
      return result;
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Process dividend as cash
   * @private
   */
  async _processCashDividend(portfolio, position, dividend, dividendAmount, execDate) {
    const database = await getDatabaseAsync();

    // Add to cash balance
    const newCash = portfolio.current_cash + dividendAmount;
    const newTotalValue = portfolio.current_value + dividendAmount;

    await database.query(`
      UPDATE portfolios
      SET current_cash = $1,
          current_value = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newCash, newTotalValue, portfolio.id]);

    // Update position dividends tracker
    await database.query(`
      UPDATE portfolio_positions
      SET total_dividends = COALESCE(total_dividends, 0) + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [dividendAmount, position.position_id]);

    // Record transaction
    await database.query(`
      INSERT INTO portfolio_transactions (
        portfolio_id, company_id, position_id, lot_id,
        transaction_type, shares, price_per_share, total_amount,
        fees, dividend_per_share, cash_balance_after, position_shares_after,
        notes, order_id, executed_at
      ) VALUES ($1, $2, $3, $4, 'dividend', $5, $6, $7, 0, $8, $9, $10, $11, NULL, $12)
    `, [
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
    ]);

    return {
      drip: false,
      cashAdded: dividendAmount
    };
  }

  /**
   * Process dividend as DRIP (reinvest)
   * @private
   */
  async _processDripDividend(portfolio, position, dividend, dividendAmount, execDate) {
    const database = await getDatabaseAsync();

    // Get current price
    const priceResult = await database.query(`
      SELECT close as price FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1
    `, [position.company_id]);
    const priceRow = priceResult.rows[0];

    if (!priceRow) {
      // Fall back to cash dividend if no price available
      return await this._processCashDividend(portfolio, position, dividend, dividendAmount, execDate);
    }

    const currentPrice = priceRow.price;
    const sharesToBuy = dividendAmount / currentPrice;

    // Get current position data
    const positionResult = await database.query(`
      SELECT * FROM portfolio_positions WHERE id = $1
    `, [position.position_id]);
    const positionData = positionResult.rows[0];

    // Create DRIP lot
    const lotResult = await database.query(`
      INSERT INTO portfolio_lots (
        portfolio_id, position_id, company_id,
        shares_original, shares_remaining, cost_per_share, total_cost,
        acquired_at, acquisition_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'drip')
      RETURNING id
    `, [
      portfolio.id,
      position.position_id,
      position.company_id,
      sharesToBuy,
      sharesToBuy,
      currentPrice,
      dividendAmount,
      execDate
    ]);
    const lotId = lotResult.rows[0].id;

    // Update position
    const newShares = positionData.shares + sharesToBuy;
    const newCostBasis = (positionData.cost_basis || 0) + dividendAmount;
    const newAvgCost = newCostBasis / newShares;
    const currentValue = newShares * currentPrice;
    const unrealizedPnl = currentValue - newCostBasis;
    const unrealizedPnlPct = newCostBasis > 0 ? (unrealizedPnl / newCostBasis) * 100 : 0;

    await database.query(`
      UPDATE portfolio_positions
      SET shares = $1,
          average_cost = $2,
          cost_basis = $3,
          current_price = $4,
          current_value = $5,
          unrealized_pnl = $6,
          unrealized_pnl_pct = $7,
          last_traded_at = $8,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [
      newShares,
      newAvgCost,
      newCostBasis,
      currentPrice,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
      execDate,
      position.position_id
    ]);

    // Update position dividends tracker
    await database.query(`
      UPDATE portfolio_positions
      SET total_dividends = COALESCE(total_dividends, 0) + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [dividendAmount, position.position_id]);

    // Update portfolio value (cash unchanged, positions increased)
    const portfolioValueChange = sharesToBuy * currentPrice;
    const newTotalValue = portfolio.current_value + portfolioValueChange;
    await database.query(`
      UPDATE portfolios
      SET current_cash = $1,
          current_value = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [portfolio.current_cash, newTotalValue, portfolio.id]);

    // Record transaction
    await database.query(`
      INSERT INTO portfolio_transactions (
        portfolio_id, company_id, position_id, lot_id,
        transaction_type, shares, price_per_share, total_amount,
        fees, dividend_per_share, cash_balance_after, position_shares_after,
        notes, order_id, executed_at
      ) VALUES ($1, $2, $3, $4, 'dividend', $5, $6, $7, 0, $8, $9, $10, $11, NULL, $12)
    `, [
      portfolio.id,
      position.company_id,
      position.position_id,
      lotId,
      sharesToBuy,
      currentPrice,
      dividendAmount,
      dividend.amount, // dividend_per_share
      portfolio.current_cash, // cash_balance_after (unchanged)
      newShares, // shares_after
      `DRIP: ${sharesToBuy.toFixed(4)} shares at $${currentPrice.toFixed(2)} (ex-date: ${dividend.ex_date})`,
      execDate
    ]);

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
  async getPendingDividends({ portfolioId = null, lookbackDays = 7 } = {}) {
    const options = { lookbackDays, dryRun: true };

    if (portfolioId) {
      return await this.processPortfolioDividends(portfolioId, options);
    }

    return await this.processAllDividends(options);
  }

  /**
   * Get dividend processing history
   * @param {number} portfolioId - Portfolio ID
   * @param {number} limit - Max records
   * @returns {Array} Recent dividend transactions
   */
  async getDividendHistory(portfolioId, limit = 50) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        pt.*,
        c.symbol,
        c.name as company_name
      FROM portfolio_transactions pt
      JOIN companies c ON pt.company_id = c.id
      WHERE pt.portfolio_id = $1
        AND pt.transaction_type = 'dividend'
      ORDER BY pt.executed_at DESC
      LIMIT $2
    `, [portfolioId, limit]);
    return result.rows;
  }
}

// Singleton instance
let instance = null;

function getDividendProcessor() {
  if (!instance) {
    instance = new DividendProcessor();
  }
  return instance;
}

module.exports = {
  DividendProcessor,
  getDividendProcessor
};
