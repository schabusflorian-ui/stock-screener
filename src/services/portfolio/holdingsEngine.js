// src/services/portfolio/holdingsEngine.js
// Holdings engine for managing portfolio positions, lots, and trades

const { getDatabaseAsync } = require('../../lib/db');
const { TRANSACTION_TYPES, LOT_METHODS } = require('../../constants/portfolio');

class HoldingsEngine {
  // No constructor needed - all methods will get database async

  // ============================================
  // Portfolio Methods
  // ============================================

  async getPortfolio(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM portfolios WHERE id = $1', [portfolioId]);
    return result.rows[0];
  }

  // ============================================
  // Position Methods
  // ============================================

  async getPositions(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT pp.*, c.symbol, c.name as company_name, c.sector,
             COALESCE(dm.dividend_yield, 0) as dividend_yield
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      LEFT JOIN dividend_metrics dm ON dm.company_id = c.id
      WHERE pp.portfolio_id = $1 AND pp.shares > 0
      ORDER BY pp.current_value DESC
    `, [portfolioId]);
    return result.rows;
  }

  async getPosition(portfolioId, companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT pp.*, c.symbol, c.name as company_name
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = $1 AND pp.company_id = $2
    `, [portfolioId, companyId]);
    return result.rows[0];
  }

  async getPositionById(positionId) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM portfolio_positions WHERE id = $1', [positionId]);
    return result.rows[0];
  }

  // ============================================
  // Lot Methods
  // ============================================

  async getLots(positionId, openOnly = false) {
    const database = await getDatabaseAsync();
    if (openOnly) {
      const result = await database.query(`
        SELECT * FROM portfolio_lots
        WHERE position_id = $1 AND is_closed = false
        ORDER BY acquired_at ASC
      `, [positionId]);
      return result.rows;
    }
    const result = await database.query(`
      SELECT * FROM portfolio_lots
      WHERE position_id = $1
      ORDER BY acquired_at ASC
    `, [positionId]);
    return result.rows;
  }

  // ============================================
  // Trading Methods
  // ============================================

  async executeBuy(portfolioId, { companyId, shares, pricePerShare, fees = 0, notes = null, executedAt = null, orderId = null }) {
    const database = await getDatabaseAsync();
    const execDate = executedAt || new Date().toISOString();
    const totalCost = (shares * pricePerShare) + fees;

    // Get portfolio
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Check sufficient cash
    if (portfolio.current_cash < totalCost) {
      throw new Error(`Insufficient cash. Required: ${totalCost.toFixed(2)}, Available: ${portfolio.current_cash.toFixed(2)}`);
    }

    // Use transaction for atomic operation
    await database.query('BEGIN');

    try {
      // Get or create position
      const position = await this.getPosition(portfolioId, companyId);
      let positionId;
      let newShares;
      let newCostBasis;
      let newAvgCost;

      if (position) {
        // Update existing position
        positionId = position.id;
        newShares = position.shares + shares;
        newCostBasis = (position.cost_basis || 0) + (shares * pricePerShare);
        newAvgCost = newCostBasis / newShares;
      } else {
        // Create new position
        const insertResult = await database.query(`
          INSERT INTO portfolio_positions (
            portfolio_id, company_id, shares, average_cost, cost_basis,
            first_bought_at, last_traded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [portfolioId, companyId, shares, pricePerShare, shares * pricePerShare, execDate, execDate]);
        positionId = insertResult.rows[0].id;
        newShares = shares;
        newCostBasis = shares * pricePerShare;
        newAvgCost = pricePerShare;
      }

      // Create lot
      const lotResult = await database.query(`
        INSERT INTO portfolio_lots (
          portfolio_id, position_id, company_id, shares_original, shares_remaining,
          cost_per_share, total_cost, acquired_at, acquisition_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [portfolioId, positionId, companyId, shares, shares, pricePerShare, shares * pricePerShare, execDate, 'buy']);
      const lotId = lotResult.rows[0].id;

      // Update position with current values
      const latestPriceResult = await database.query(`
        SELECT close as price FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [companyId]);
      const latestPrice = latestPriceResult.rows[0];
      const currentPrice = latestPrice ? latestPrice.price : pricePerShare;
      const currentValue = newShares * currentPrice;
      const unrealizedPnl = currentValue - newCostBasis;
      const unrealizedPnlPct = newCostBasis > 0 ? (unrealizedPnl / newCostBasis) * 100 : 0;

      await database.query(`
        UPDATE portfolio_positions
        SET shares = $1, average_cost = $2, cost_basis = $3, current_price = $4,
            current_value = $5, unrealized_pnl = $6, unrealized_pnl_pct = $7,
            last_traded_at = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `, [newShares, newAvgCost, newCostBasis, currentPrice, currentValue, unrealizedPnl, unrealizedPnlPct, execDate, positionId]);

      // Update portfolio cash
      const newCash = portfolio.current_cash - totalCost;
      const positionsValue = await this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      await database.query(`
        UPDATE portfolios
        SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newCash, totalValue, portfolioId]);

      // Record transaction
      const transactionResult = await database.query(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id, transaction_type,
          shares, price_per_share, total_amount, fees, dividend_per_share,
          cash_balance_after, position_shares_after, notes, order_id, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, [portfolioId, companyId, positionId, lotId, TRANSACTION_TYPES.BUY, shares, pricePerShare, totalCost, fees, null, newCash, newShares, notes, orderId, execDate]);
      const transactionId = transactionResult.rows[0].id;

      await database.query('COMMIT');

      return {
        success: true,
        transactionId,
        positionId,
        lotId,
        shares,
        pricePerShare,
        totalCost,
        newCashBalance: newCash,
        newPositionShares: newShares
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  async executeSell(portfolioId, { companyId, shares, pricePerShare, fees = 0, notes = null, executedAt = null, orderId = null, lotMethod = LOT_METHODS.FIFO }) {
    const database = await getDatabaseAsync();
    const execDate = executedAt || new Date().toISOString();
    const grossProceeds = shares * pricePerShare;
    const netProceeds = grossProceeds - fees;

    // Get portfolio
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Get position
    const position = await this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
    }

    // Check sufficient shares
    if (position.shares < shares) {
      throw new Error(`Insufficient shares. Required: ${shares}, Available: ${position.shares}`);
    }

    // Use transaction for atomic operation
    await database.query('BEGIN');

    try {
      // Get open lots
      const openLots = await this.getLots(position.id, true);

      // Sort lots based on method
      switch (lotMethod) {
        case LOT_METHODS.LIFO:
          openLots.sort((a, b) => new Date(b.acquired_at) - new Date(a.acquired_at));
          break;
        case LOT_METHODS.HIFO:
          openLots.sort((a, b) => b.cost_per_share - a.cost_per_share);
          break;
        case LOT_METHODS.FIFO:
        default:
          // Already sorted by acquired_at ASC
          break;
      }

      let sharesToSell = shares;
      let totalRealizedPnl = 0;
      const lotsSold = [];

      // Sell from lots
      for (const lot of openLots) {
        if (sharesToSell <= 0) break;

        const sharesToSellFromLot = Math.min(lot.shares_remaining, sharesToSell);
        const lotProceeds = sharesToSellFromLot * pricePerShare;
        const lotCost = sharesToSellFromLot * lot.cost_per_share;
        const lotPnl = lotProceeds - lotCost;

        const newRemaining = lot.shares_remaining - sharesToSellFromLot;
        const isClosed = newRemaining <= 0 ? true : false;
        const closedAt = isClosed ? execDate : null;

        await database.query(`
          UPDATE portfolio_lots
          SET shares_remaining = $1,
              shares_sold = COALESCE(shares_sold, 0) + $2,
              realized_pnl = COALESCE(realized_pnl, 0) + $3,
              is_closed = $4,
              closed_at = $5
          WHERE id = $6
        `, [newRemaining, sharesToSellFromLot, lotPnl, isClosed, closedAt, lot.id]);

        totalRealizedPnl += lotPnl;
        sharesToSell -= sharesToSellFromLot;
        lotsSold.push({
          lotId: lot.id,
          sharesSold: sharesToSellFromLot,
          costBasis: lotCost,
          proceeds: lotProceeds,
          realizedPnl: lotPnl
        });
      }

      // Update position
      const newShares = position.shares - shares;
      const shouldDeletePosition = newShares <= 0;

      if (!shouldDeletePosition) {
        // Recalculate cost basis from remaining lots
        const remainingLots = await this.getLots(position.id, true);
        const newCostBasis = remainingLots.reduce((sum, lot) =>
          sum + (lot.shares_remaining * lot.cost_per_share), 0);
        const newAvgCost = newCostBasis / newShares;

        const latestPriceResult = await database.query(`
          SELECT close as price FROM daily_prices
          WHERE company_id = $1
          ORDER BY date DESC
          LIMIT 1
        `, [companyId]);
        const latestPrice = latestPriceResult.rows[0];
        const currentPrice = latestPrice ? latestPrice.price : pricePerShare;
        const currentValue = newShares * currentPrice;
        const unrealizedPnl = currentValue - newCostBasis;
        const unrealizedPnlPct = newCostBasis > 0 ? (unrealizedPnl / newCostBasis) * 100 : 0;

        await database.query(`
          UPDATE portfolio_positions
          SET shares = $1, average_cost = $2, cost_basis = $3, current_price = $4,
              current_value = $5, unrealized_pnl = $6, unrealized_pnl_pct = $7,
              last_traded_at = $8, updated_at = CURRENT_TIMESTAMP
          WHERE id = $9
        `, [newShares, newAvgCost, newCostBasis, currentPrice, currentValue, unrealizedPnl, unrealizedPnlPct, execDate, position.id]);

        // Update realized P&L
        await database.query(`
          UPDATE portfolio_positions
          SET realized_pnl = COALESCE(realized_pnl, 0) + $1
          WHERE id = $2
        `, [totalRealizedPnl, position.id]);
      }

      // Update portfolio cash
      const newCash = portfolio.current_cash + netProceeds;
      const positionsValue = await this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      await database.query(`
        UPDATE portfolios
        SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newCash, totalValue, portfolioId]);

      // Record transaction (before deleting position to avoid FK constraint)
      const transactionResult = await database.query(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id, transaction_type,
          shares, price_per_share, total_amount, fees, dividend_per_share,
          cash_balance_after, position_shares_after, notes, order_id, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, [portfolioId, companyId, position.id, null, TRANSACTION_TYPES.SELL, shares, pricePerShare, netProceeds, fees, null, newCash, newShares, notes, orderId, execDate]);
      const transactionId = transactionResult.rows[0].id;

      // If position is fully sold, update to 0 shares rather than delete
      // (to preserve transaction history which references position_id)
      if (shouldDeletePosition) {
        await database.query(`
          UPDATE portfolio_positions
          SET shares = 0,
              average_cost = 0,
              cost_basis = 0,
              current_value = 0,
              unrealized_pnl = 0,
              unrealized_pnl_pct = 0,
              realized_pnl = COALESCE(realized_pnl, 0) + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [totalRealizedPnl, position.id]);
      }

      await database.query('COMMIT');

      return {
        success: true,
        transactionId,
        positionId: position.id,
        shares,
        pricePerShare,
        grossProceeds,
        fees,
        netProceeds,
        realizedPnl: totalRealizedPnl,
        lotsSold,
        newCashBalance: newCash,
        newPositionShares: newShares,
        positionClosed: shouldDeletePosition
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  // ============================================
  // Cash Management Methods
  // ============================================

  async deposit(portfolioId, amount, { date = null, notes = null } = {}) {
    const database = await getDatabaseAsync();
    const execDate = date || new Date().toISOString();

    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    await database.query('BEGIN');

    try {
      // Update portfolio
      await database.query(`
        UPDATE portfolios
        SET current_cash = current_cash + $1,
            current_value = current_value + $2,
            total_deposited = COALESCE(total_deposited, 0) + $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [amount, amount, amount, portfolioId]);

      // Get new cash balance
      const updatedPortfolio = await this.getPortfolio(portfolioId);
      const newCash = updatedPortfolio.current_cash;

      // Record transaction
      await database.query(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id, transaction_type,
          shares, price_per_share, total_amount, fees, dividend_per_share,
          cash_balance_after, position_shares_after, notes, order_id, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [portfolioId, null, null, null, TRANSACTION_TYPES.DEPOSIT, null, null, amount, 0, null, newCash, null, notes, null, execDate]);

      await database.query('COMMIT');

      return {
        success: true,
        amount,
        newCashBalance: newCash,
        totalDeposited: updatedPortfolio.total_deposited
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  async withdraw(portfolioId, amount, { date = null, notes = null } = {}) {
    const database = await getDatabaseAsync();
    const execDate = date || new Date().toISOString();

    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    if (portfolio.current_cash < amount) {
      throw new Error(`Insufficient cash. Available: ${portfolio.current_cash.toFixed(2)}, Requested: ${amount.toFixed(2)}`);
    }

    await database.query('BEGIN');

    try {
      // Update portfolio
      await database.query(`
        UPDATE portfolios
        SET current_cash = current_cash - $1,
            current_value = current_value - $2,
            total_withdrawn = COALESCE(total_withdrawn, 0) + $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [amount, amount, amount, portfolioId]);

      // Get new cash balance
      const updatedPortfolio = await this.getPortfolio(portfolioId);
      const newCash = updatedPortfolio.current_cash;

      // Record transaction
      await database.query(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id, transaction_type,
          shares, price_per_share, total_amount, fees, dividend_per_share,
          cash_balance_after, position_shares_after, notes, order_id, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [portfolioId, null, null, null, TRANSACTION_TYPES.WITHDRAW, null, null, -amount, 0, null, newCash, null, notes, null, execDate]);

      await database.query('COMMIT');

      return {
        success: true,
        amount,
        newCashBalance: newCash,
        totalWithdrawn: updatedPortfolio.total_withdrawn
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  async recordDividend(portfolioId, { companyId, amount, dividendPerShare = null, date = null, notes = null }) {
    const database = await getDatabaseAsync();
    const execDate = date || new Date().toISOString();

    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const position = await this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId}`);
    }

    await database.query('BEGIN');

    try {
      // Update portfolio cash
      const newCash = portfolio.current_cash + amount;
      const positionsValue = await this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      await database.query(`
        UPDATE portfolios
        SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newCash, totalValue, portfolioId]);

      // Update position dividends
      await database.query(`
        UPDATE portfolio_positions
        SET total_dividends = COALESCE(total_dividends, 0) + $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [amount, position.id]);

      // Record transaction
      await database.query(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id, transaction_type,
          shares, price_per_share, total_amount, fees, dividend_per_share,
          cash_balance_after, position_shares_after, notes, order_id, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [portfolioId, companyId, position.id, null, TRANSACTION_TYPES.DIVIDEND, position.shares, null, amount, 0, dividendPerShare, newCash, position.shares, notes, null, execDate]);

      await database.query('COMMIT');

      return {
        success: true,
        amount,
        dividendPerShare,
        newCashBalance: newCash
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  async recordFee(portfolioId, { amount, notes = null, date = null }) {
    const database = await getDatabaseAsync();
    const execDate = date || new Date().toISOString();

    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    if (portfolio.current_cash < amount) {
      throw new Error(`Insufficient cash for fee. Available: ${portfolio.current_cash.toFixed(2)}`);
    }

    await database.query('BEGIN');

    try {
      const newCash = portfolio.current_cash - amount;
      const positionsValue = await this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      await database.query(`
        UPDATE portfolios
        SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newCash, totalValue, portfolioId]);

      await database.query(`
        INSERT INTO portfolio_transactions (
          portfolio_id, company_id, position_id, lot_id, transaction_type,
          shares, price_per_share, total_amount, fees, dividend_per_share,
          cash_balance_after, position_shares_after, notes, order_id, executed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [portfolioId, null, null, null, TRANSACTION_TYPES.FEE, null, null, -amount, amount, null, newCash, null, notes, null, execDate]);

      await database.query('COMMIT');

      return {
        success: true,
        amount,
        newCashBalance: newCash
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  // ============================================
  // Value Calculation Methods
  // ============================================

  async refreshPositionValues(portfolioId) {
    if (portfolioId == null) {
      throw new Error('Portfolio ID is required for refreshPositionValues');
    }
    const database = await getDatabaseAsync();
    const positions = await this.getPositions(portfolioId);
    let totalPositionsValue = 0;

    for (const position of positions) {
      const latestPriceResult = await database.query(`
        SELECT close as price FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [position.company_id]);
      const latestPrice = latestPriceResult.rows[0];
      if (!latestPrice) continue;

      const currentPrice = latestPrice.price;
      const currentValue = position.shares * currentPrice;
      const unrealizedPnl = currentValue - (position.cost_basis || 0);
      const unrealizedPnlPct = position.cost_basis > 0
        ? (unrealizedPnl / position.cost_basis) * 100
        : 0;

      await database.query(`
        UPDATE portfolio_positions
        SET shares = $1, average_cost = $2, cost_basis = $3, current_price = $4,
            current_value = $5, unrealized_pnl = $6, unrealized_pnl_pct = $7,
            last_traded_at = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
      `, [position.shares, position.average_cost, position.cost_basis, currentPrice, currentValue, unrealizedPnl, unrealizedPnlPct, position.last_traded_at, position.id]);

      totalPositionsValue += currentValue;
    }

    // Update portfolio total value
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }
    const currentCash = Number(portfolio.current_cash) || 0;
    const totalValue = currentCash + totalPositionsValue;
    await database.query(`
      UPDATE portfolios
      SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [currentCash, totalValue, portfolioId]);

    return {
      positionsUpdated: positions.length,
      positionsValue: totalPositionsValue,
      cashValue: currentCash,
      totalValue
    };
  }

  async calculatePortfolioValue(portfolioId) {
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const positions = await this.getPositions(portfolioId);
    let positionsValue = 0;
    let totalCostBasis = 0;
    let unrealizedPnl = 0;
    let realizedPnl = 0;
    let totalDividends = 0;

    for (const position of positions) {
      positionsValue += position.current_value || 0;
      totalCostBasis += position.cost_basis || 0;
      unrealizedPnl += position.unrealized_pnl || 0;
      realizedPnl += position.realized_pnl || 0;
      totalDividends += position.total_dividends || 0;
    }

    return {
      portfolioId,
      cashValue: portfolio.current_cash,
      positionsValue,
      totalValue: portfolio.current_cash + positionsValue,
      totalCostBasis,
      unrealizedPnl,
      realizedPnl,
      totalDividends,
      totalReturn: unrealizedPnl + realizedPnl + totalDividends,
      positionsCount: positions.length,
      netInvested: portfolio.total_deposited - portfolio.total_withdrawn
    };
  }

  async _calculatePositionsValue(portfolioId) {
    const positions = await this.getPositions(portfolioId);
    return positions.reduce((sum, pos) => sum + (pos.current_value || 0), 0);
  }

  // ============================================
  // Transaction History
  // ============================================

  async getTransactions(portfolioId, { limit = 50, offset = 0 } = {}) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT pt.*, c.symbol, c.name as company_name
      FROM portfolio_transactions pt
      LEFT JOIN companies c ON pt.company_id = c.id
      WHERE pt.portfolio_id = $1
      ORDER BY pt.executed_at DESC, pt.id DESC
      LIMIT $2 OFFSET $3
    `, [portfolioId, limit, offset]);
    return result.rows;
  }

  // ============================================
  // Dividend Processing with DRIP Support
  // ============================================

  async processDividend(portfolioId, { companyId, dividendPerShare, exDate = null, payDate = null }) {
    const database = await getDatabaseAsync();
    const execDate = payDate || new Date().toISOString();

    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const position = await this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId}`);
    }

    // Calculate total dividend
    const totalDividend = position.shares * dividendPerShare;
    const isDRIP = portfolio.dividend_reinvest === true;

    await database.query('BEGIN');

    try {
      if (isDRIP) {
        // Reinvest dividend - buy more shares at current price
        const latestPriceResult = await database.query(`
          SELECT close as price FROM daily_prices
          WHERE company_id = $1
          ORDER BY date DESC
          LIMIT 1
        `, [companyId]);
        const latestPrice = latestPriceResult.rows[0];
        if (!latestPrice) {
          throw new Error(`No price data available for company ${companyId}`);
        }

        const currentPrice = latestPrice.price;
        const sharesToBuy = totalDividend / currentPrice;

        // Create DRIP lot
        const lotResult = await database.query(`
          INSERT INTO portfolio_lots (
            portfolio_id, position_id, company_id, shares_original, shares_remaining,
            cost_per_share, total_cost, acquired_at, acquisition_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `, [portfolioId, position.id, companyId, sharesToBuy, sharesToBuy, currentPrice, totalDividend, execDate, 'drip']);

        // Update position
        const newShares = position.shares + sharesToBuy;
        const newCostBasis = (position.cost_basis || 0) + totalDividend;
        const newAvgCost = newCostBasis / newShares;
        const currentValue = newShares * currentPrice;
        const unrealizedPnl = currentValue - newCostBasis;
        const unrealizedPnlPct = newCostBasis > 0 ? (unrealizedPnl / newCostBasis) * 100 : 0;

        await database.query(`
          UPDATE portfolio_positions
          SET shares = $1, average_cost = $2, cost_basis = $3, current_price = $4,
              current_value = $5, unrealized_pnl = $6, unrealized_pnl_pct = $7,
              last_traded_at = $8, updated_at = CURRENT_TIMESTAMP
          WHERE id = $9
        `, [newShares, newAvgCost, newCostBasis, currentPrice, currentValue, unrealizedPnl, unrealizedPnlPct, execDate, position.id]);

        // Update position dividends tracker
        await database.query(`
          UPDATE portfolio_positions
          SET total_dividends = COALESCE(total_dividends, 0) + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [totalDividend, position.id]);

        // Record DRIP transaction
        await database.query(`
          INSERT INTO portfolio_transactions (
            portfolio_id, company_id, position_id, lot_id, transaction_type,
            shares, price_per_share, total_amount, fees, dividend_per_share,
            cash_balance_after, position_shares_after, notes, order_id, executed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [portfolioId, companyId, position.id, lotResult.rows[0].id, TRANSACTION_TYPES.DIVIDEND, sharesToBuy, currentPrice, totalDividend, 0, dividendPerShare, portfolio.current_cash, newShares, `DRIP: ${sharesToBuy.toFixed(4)} shares at $${currentPrice.toFixed(2)}`, null, execDate]);

        // Update portfolio value (cash unchanged, positions value increased)
        const positionsValue = await this._calculatePositionsValue(portfolioId);
        const totalValue = portfolio.current_cash + positionsValue;
        await database.query(`
          UPDATE portfolios
          SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [portfolio.current_cash, totalValue, portfolioId]);

        await database.query('COMMIT');

        return {
          success: true,
          type: 'drip',
          dividendAmount: totalDividend,
          dividendPerShare,
          sharesOwned: position.shares,
          sharesPurchased: sharesToBuy,
          purchasePrice: currentPrice,
          newTotalShares: newShares,
          cashBalance: portfolio.current_cash
        };
      } else {
        // Regular dividend - add to cash
        const newCash = portfolio.current_cash + totalDividend;
        const positionsValue = await this._calculatePositionsValue(portfolioId);
        const totalValue = newCash + positionsValue;
        await database.query(`
          UPDATE portfolios
          SET current_cash = $1, current_value = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [newCash, totalValue, portfolioId]);

        // Update position dividends tracker
        await database.query(`
          UPDATE portfolio_positions
          SET total_dividends = COALESCE(total_dividends, 0) + $1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [totalDividend, position.id]);

        // Record cash dividend transaction
        await database.query(`
          INSERT INTO portfolio_transactions (
            portfolio_id, company_id, position_id, lot_id, transaction_type,
            shares, price_per_share, total_amount, fees, dividend_per_share,
            cash_balance_after, position_shares_after, notes, order_id, executed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [portfolioId, companyId, position.id, null, TRANSACTION_TYPES.DIVIDEND, position.shares, null, totalDividend, 0, dividendPerShare, newCash, position.shares, `Cash dividend: $${dividendPerShare.toFixed(4)}/share`, null, execDate]);

        await database.query('COMMIT');

        return {
          success: true,
          type: 'cash',
          dividendAmount: totalDividend,
          dividendPerShare,
          sharesOwned: position.shares,
          newCashBalance: newCash
        };
      }
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }

  // ============================================
  // Bulk Operations
  // ============================================

  async closePosition(portfolioId, companyId) {
    const database = await getDatabaseAsync();
    const position = await this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
    }

    if (position.shares <= 0) {
      throw new Error('Position already closed');
    }

    // Get current price
    const latestPriceResult = await database.query(`
      SELECT close as price FROM daily_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1
    `, [companyId]);
    const latestPrice = latestPriceResult.rows[0];
    if (!latestPrice) {
      throw new Error(`No price data available for company ${companyId}`);
    }

    // Sell all shares
    return await this.executeSell(portfolioId, {
      companyId,
      shares: position.shares,
      pricePerShare: latestPrice.price,
      fees: 0,
      notes: 'Position closed'
    });
  }

  async liquidatePortfolio(portfolioId) {
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const positions = await this.getPositions(portfolioId);
    const results = [];

    for (const position of positions) {
      try {
        const result = await this.closePosition(portfolioId, position.company_id);
        results.push({
          symbol: position.symbol,
          companyId: position.company_id,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          symbol: position.symbol,
          companyId: position.company_id,
          success: false,
          error: error.message
        });
      }
    }

    // Get final portfolio state
    const updatedPortfolio = await this.getPortfolio(portfolioId);

    return {
      success: true,
      positionsLiquidated: results.filter(r => r.success).length,
      positionsFailed: results.filter(r => !r.success).length,
      results,
      finalCashBalance: updatedPortfolio.current_cash,
      totalRealizedPnl: results.filter(r => r.success).reduce((sum, r) => sum + (r.realizedPnl || 0), 0)
    };
  }

  // ============================================
  // Validation Helpers
  // ============================================

  async validateTrade(portfolioId, { companyId, side, shares, price }) {
    const database = await getDatabaseAsync();
    const warnings = [];
    const errors = [];

    // Get portfolio
    const portfolio = await this.getPortfolio(portfolioId);
    if (!portfolio) {
      return { valid: false, error: `Portfolio ${portfolioId} not found` };
    }

    // Validate shares
    if (!shares || shares <= 0) {
      errors.push('Shares must be positive');
    }

    // Validate price
    if (!price || price <= 0) {
      errors.push('Price must be positive');
    }

    if (errors.length > 0) {
      return { valid: false, error: errors.join('; '), warnings };
    }

    const totalValue = shares * price;

    if (side === 'buy') {
      // Check cash
      if (portfolio.current_cash < totalValue) {
        return {
          valid: false,
          error: `Insufficient cash. Required: $${totalValue.toFixed(2)}, Available: $${portfolio.current_cash.toFixed(2)}`,
          warnings
        };
      }

      // Check if this would use more than 50% of portfolio (warning only)
      if (totalValue > portfolio.current_value * 0.5) {
        warnings.push(`This trade uses ${((totalValue / portfolio.current_value) * 100).toFixed(1)}% of portfolio value`);
      }

      // Check if company exists
      const companyResult = await database.query('SELECT id, symbol FROM companies WHERE id = $1', [companyId]);
      const company = companyResult.rows[0];
      if (!company) {
        return { valid: false, error: `Company ${companyId} not found`, warnings };
      }

    } else if (side === 'sell') {
      // Check position exists
      const position = await this.getPosition(portfolioId, companyId);
      if (!position) {
        return { valid: false, error: `No position found for company ${companyId}`, warnings };
      }

      // Check sufficient shares
      if (position.shares < shares) {
        return {
          valid: false,
          error: `Insufficient shares. Required: ${shares}, Available: ${position.shares}`,
          warnings
        };
      }

      // Check if selling at loss (warning only)
      const latestPriceResult = await database.query(`
        SELECT close as price FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [companyId]);
      const latestPrice = latestPriceResult.rows[0];
      if (latestPrice && price < position.average_cost) {
        const lossPercent = ((position.average_cost - price) / position.average_cost * 100).toFixed(1);
        warnings.push(`Selling at ${lossPercent}% loss (avg cost: $${position.average_cost.toFixed(2)})`);
      }
    } else {
      return { valid: false, error: 'Side must be "buy" or "sell"', warnings };
    }

    return { valid: true, warnings };
  }

  // ============================================
  // Stock Split Processing
  // ============================================

  /**
   * Process a stock split for a company across all portfolios
   * @param {number} companyId - The company undergoing the split
   * @param {number} splitRatio - The split ratio (e.g., 4 for a 4:1 split, 0.5 for a 1:2 reverse split)
   * @param {string} effectiveDate - The date the split takes effect
   * @returns {object} Summary of all affected portfolios
   */
  async processStockSplit(companyId, splitRatio, effectiveDate = null) {
    const database = await getDatabaseAsync();
    const execDate = effectiveDate || new Date().toISOString().split('T')[0];

    if (!splitRatio || splitRatio <= 0) {
      throw new Error('Split ratio must be positive');
    }

    // Get company info
    const companyResult = await database.query('SELECT id, symbol, name FROM companies WHERE id = $1', [companyId]);
    const company = companyResult.rows[0];
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Find all positions for this company across all portfolios
    const positionsResult = await database.query(`
      SELECT pp.*, p.id as portfolio_id, p.name as portfolio_name
      FROM portfolio_positions pp
      JOIN portfolios p ON pp.portfolio_id = p.id
      WHERE pp.company_id = $1 AND pp.shares > 0
    `, [companyId]);
    const positions = positionsResult.rows;

    if (positions.length === 0) {
      return {
        success: true,
        companyId,
        symbol: company.symbol,
        splitRatio,
        effectiveDate: execDate,
        affectedPortfolios: 0,
        message: 'No positions found for this company'
      };
    }

    const results = [];

    // Process each position in a transaction
    await database.query('BEGIN');

    try {
      for (const position of positions) {
        try {
          // Calculate new values
          const oldShares = position.shares;
          const newShares = oldShares * splitRatio;
          const oldAvgCost = position.average_cost;
          const newAvgCost = oldAvgCost / splitRatio;
          const oldCostBasis = position.cost_basis;
          // Cost basis stays the same, just spread across more shares

          // Update position
          await database.query(`
            UPDATE portfolio_positions
            SET shares = $1,
                average_cost = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [newShares, newAvgCost, position.id]);

          // Update all open lots for this position
          const lotsResult = await database.query(`
            SELECT * FROM portfolio_lots
            WHERE position_id = $1 AND is_closed = false
          `, [position.id]);
          const lots = lotsResult.rows;

          for (const lot of lots) {
            const newLotShares = lot.shares_remaining * splitRatio;
            const newLotOriginal = lot.shares_original * splitRatio;
            const newLotCost = lot.cost_per_share / splitRatio;

            await database.query(`
              UPDATE portfolio_lots
              SET shares_remaining = $1,
                  shares_original = $2,
                  cost_per_share = $3
              WHERE id = $4
            `, [newLotShares, newLotOriginal, newLotCost, lot.id]);
          }

          // Record split transaction (no cash impact)
          await database.query(`
            INSERT INTO portfolio_transactions
            (portfolio_id, company_id, position_id, transaction_type, shares,
             price_per_share, total_amount, notes, executed_at)
            VALUES ($1, $2, $3, 'split', $4, $5, 0, $6, $7)
          `, [position.portfolio_id, companyId, position.id, newShares - oldShares, newAvgCost, `Stock split ${splitRatio}:1 - ${oldShares.toFixed(4)} shares became ${newShares.toFixed(4)} shares`, execDate]);

          results.push({
            portfolioId: position.portfolio_id,
            portfolioName: position.portfolio_name,
            success: true,
            oldShares,
            newShares,
            oldAvgCost,
            newAvgCost,
            lotsUpdated: lots.length
          });
        } catch (error) {
          results.push({
            portfolioId: position.portfolio_id,
            portfolioName: position.portfolio_name,
            success: false,
            error: error.message
          });
        }
      }

      await database.query('COMMIT');
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }

    return {
      success: true,
      companyId,
      symbol: company.symbol,
      companyName: company.name,
      splitRatio,
      effectiveDate: execDate,
      affectedPortfolios: results.filter(r => r.success).length,
      failedPortfolios: results.filter(r => !r.success).length,
      results: results
    };
  }

  /**
   * Process a stock split for a specific portfolio only
   * @param {number} portfolioId - The portfolio to update
   * @param {number} companyId - The company undergoing the split
   * @param {number} splitRatio - The split ratio
   * @param {string} effectiveDate - The date the split takes effect
   * @returns {object} Result of the split processing
   */
  async processStockSplitForPortfolio(portfolioId, companyId, splitRatio, effectiveDate = null) {
    const database = await getDatabaseAsync();
    const execDate = effectiveDate || new Date().toISOString().split('T')[0];

    if (!splitRatio || splitRatio <= 0) {
      throw new Error('Split ratio must be positive');
    }

    const position = await this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
    }

    if (position.shares <= 0) {
      throw new Error('Position has no shares');
    }

    const companyResult = await database.query('SELECT symbol, name FROM companies WHERE id = $1', [companyId]);
    const company = companyResult.rows[0];

    await database.query('BEGIN');

    try {
      const oldShares = position.shares;
      const newShares = oldShares * splitRatio;
      const oldAvgCost = position.average_cost;
      const newAvgCost = oldAvgCost / splitRatio;

      // Update position
      await database.query(`
        UPDATE portfolio_positions
        SET shares = $1,
            average_cost = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newShares, newAvgCost, position.id]);

      // Update all open lots
      const lotsUpdated = await database.query(`
        UPDATE portfolio_lots
        SET shares_remaining = shares_remaining * $1,
            shares_original = shares_original * $2,
            cost_per_share = cost_per_share / $3
        WHERE position_id = $4 AND is_closed = false
      `, [splitRatio, splitRatio, splitRatio, position.id]);

      // Record transaction
      await database.query(`
        INSERT INTO portfolio_transactions
        (portfolio_id, company_id, position_id, transaction_type, shares,
         price_per_share, total_amount, notes, executed_at)
        VALUES ($1, $2, $3, 'split', $4, $5, 0, $6, $7)
      `, [portfolioId, companyId, position.id, newShares - oldShares, newAvgCost, `Stock split ${splitRatio}:1 - ${oldShares.toFixed(4)} shares became ${newShares.toFixed(4)} shares`, execDate]);

      await database.query('COMMIT');

      return {
        success: true,
        portfolioId,
        companyId,
        symbol: company?.symbol,
        splitRatio,
        effectiveDate: execDate,
        oldShares,
        newShares,
        oldAvgCost,
        newAvgCost,
        lotsUpdated: lotsUpdated.rowCount
      };
    } catch (error) {
      await database.query('ROLLBACK');
      throw error;
    }
  }
}

module.exports = HoldingsEngine;
