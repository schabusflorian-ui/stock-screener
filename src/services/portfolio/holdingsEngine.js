// src/services/portfolio/holdingsEngine.js
// Holdings engine for managing portfolio positions, lots, and trades

const { TRANSACTION_TYPES, LOT_METHODS } = require('../../constants/portfolio');

class HoldingsEngine {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Portfolio queries
    this.stmts = {
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

      updatePortfolioDeposited: this.db.prepare(`
        UPDATE portfolios
        SET current_cash = current_cash + ?,
            total_deposited = total_deposited + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      updatePortfolioWithdrawn: this.db.prepare(`
        UPDATE portfolios
        SET current_cash = current_cash - ?,
            total_withdrawn = total_withdrawn + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      // Position queries (filter out closed positions with 0 shares)
      getPositions: this.db.prepare(`
        SELECT pp.*, c.symbol, c.name as company_name, c.sector
        FROM portfolio_positions pp
        JOIN companies c ON pp.company_id = c.id
        WHERE pp.portfolio_id = ? AND pp.shares > 0
        ORDER BY pp.current_value DESC
      `),

      getPosition: this.db.prepare(`
        SELECT pp.*, c.symbol, c.name as company_name
        FROM portfolio_positions pp
        JOIN companies c ON pp.company_id = c.id
        WHERE pp.portfolio_id = ? AND pp.company_id = ?
      `),

      getPositionById: this.db.prepare(`
        SELECT * FROM portfolio_positions WHERE id = ?
      `),

      createPosition: this.db.prepare(`
        INSERT INTO portfolio_positions
        (portfolio_id, company_id, shares, average_cost, cost_basis, first_bought_at, last_traded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

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

      updatePositionRealized: this.db.prepare(`
        UPDATE portfolio_positions
        SET realized_pnl = realized_pnl + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      deletePosition: this.db.prepare(`
        DELETE FROM portfolio_positions WHERE id = ?
      `),

      // Lot queries
      getLots: this.db.prepare(`
        SELECT * FROM portfolio_lots
        WHERE position_id = ?
        ORDER BY acquired_at ASC
      `),

      getOpenLots: this.db.prepare(`
        SELECT * FROM portfolio_lots
        WHERE position_id = ? AND is_closed = 0
        ORDER BY acquired_at ASC
      `),

      createLot: this.db.prepare(`
        INSERT INTO portfolio_lots
        (portfolio_id, position_id, company_id, shares_original, shares_remaining,
         cost_per_share, total_cost, acquired_at, acquisition_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateLot: this.db.prepare(`
        UPDATE portfolio_lots
        SET shares_remaining = ?,
            shares_sold = shares_sold + ?,
            realized_pnl = realized_pnl + ?,
            is_closed = ?,
            closed_at = ?
        WHERE id = ?
      `),

      // Transaction queries
      createTransaction: this.db.prepare(`
        INSERT INTO portfolio_transactions
        (portfolio_id, company_id, position_id, lot_id, transaction_type,
         shares, price_per_share, total_amount, fees, dividend_per_share,
         cash_balance_after, position_shares_after, notes, order_id, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getTransactions: this.db.prepare(`
        SELECT pt.*, c.symbol, c.name as company_name
        FROM portfolio_transactions pt
        LEFT JOIN companies c ON pt.company_id = c.id
        WHERE pt.portfolio_id = ?
        ORDER BY pt.executed_at DESC
        LIMIT ? OFFSET ?
      `),

      // Price queries
      getLatestPrice: this.db.prepare(`
        SELECT close as price, date
        FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `)
    };
  }

  // ============================================
  // Portfolio Methods
  // ============================================

  getPortfolio(portfolioId) {
    return this.stmts.getPortfolio.get(portfolioId);
  }

  // ============================================
  // Position Methods
  // ============================================

  getPositions(portfolioId) {
    return this.stmts.getPositions.all(portfolioId);
  }

  getPosition(portfolioId, companyId) {
    return this.stmts.getPosition.get(portfolioId, companyId);
  }

  getPositionById(positionId) {
    return this.stmts.getPositionById.get(positionId);
  }

  // ============================================
  // Lot Methods
  // ============================================

  getLots(positionId, openOnly = false) {
    if (openOnly) {
      return this.stmts.getOpenLots.all(positionId);
    }
    return this.stmts.getLots.all(positionId);
  }

  // ============================================
  // Trading Methods
  // ============================================

  executeBuy(portfolioId, { companyId, shares, pricePerShare, fees = 0, notes = null, executedAt = null, orderId = null }) {
    const execDate = executedAt || new Date().toISOString();
    const totalCost = (shares * pricePerShare) + fees;

    // Get portfolio
    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Check sufficient cash
    if (portfolio.current_cash < totalCost) {
      throw new Error(`Insufficient cash. Required: ${totalCost.toFixed(2)}, Available: ${portfolio.current_cash.toFixed(2)}`);
    }

    // Use transaction for atomic operation
    const result = this.db.transaction(() => {
      // Get or create position
      let position = this.getPosition(portfolioId, companyId);
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
        const insertResult = this.stmts.createPosition.run(
          portfolioId,
          companyId,
          shares,
          pricePerShare,
          shares * pricePerShare,
          execDate,
          execDate
        );
        positionId = insertResult.lastInsertRowid;
        newShares = shares;
        newCostBasis = shares * pricePerShare;
        newAvgCost = pricePerShare;
      }

      // Create lot
      const lotResult = this.stmts.createLot.run(
        portfolioId,
        positionId,
        companyId,
        shares,
        shares,
        pricePerShare,
        shares * pricePerShare,
        execDate,
        'buy'
      );
      const lotId = lotResult.lastInsertRowid;

      // Update position with current values
      const latestPrice = this.stmts.getLatestPrice.get(companyId);
      const currentPrice = latestPrice ? latestPrice.price : pricePerShare;
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
        positionId
      );

      // Update portfolio cash
      const newCash = portfolio.current_cash - totalCost;
      const positionsValue = this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      this.stmts.updatePortfolioCash.run(newCash, totalValue, portfolioId);

      // Record transaction
      this.stmts.createTransaction.run(
        portfolioId,
        companyId,
        positionId,
        lotId,
        TRANSACTION_TYPES.BUY,
        shares,
        pricePerShare,
        totalCost,
        fees,
        null, // dividend_per_share
        newCash,
        newShares,
        notes,
        orderId,
        execDate
      );

      return {
        success: true,
        positionId,
        lotId,
        shares,
        pricePerShare,
        totalCost,
        newCashBalance: newCash,
        newPositionShares: newShares
      };
    })();

    return result;
  }

  executeSell(portfolioId, { companyId, shares, pricePerShare, fees = 0, notes = null, executedAt = null, orderId = null, lotMethod = LOT_METHODS.FIFO }) {
    const execDate = executedAt || new Date().toISOString();
    const grossProceeds = shares * pricePerShare;
    const netProceeds = grossProceeds - fees;

    // Get portfolio
    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Get position
    const position = this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
    }

    // Check sufficient shares
    if (position.shares < shares) {
      throw new Error(`Insufficient shares. Required: ${shares}, Available: ${position.shares}`);
    }

    // Use transaction for atomic operation
    const result = this.db.transaction(() => {
      // Get open lots
      let openLots = this.getLots(position.id, true);

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
        const isClosed = newRemaining <= 0 ? 1 : 0;
        const closedAt = isClosed ? execDate : null;

        this.stmts.updateLot.run(
          newRemaining,
          sharesToSellFromLot,
          lotPnl,
          isClosed,
          closedAt,
          lot.id
        );

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
        const remainingLots = this.getLots(position.id, true);
        const newCostBasis = remainingLots.reduce((sum, lot) =>
          sum + (lot.shares_remaining * lot.cost_per_share), 0);
        const newAvgCost = newCostBasis / newShares;

        const latestPrice = this.stmts.getLatestPrice.get(companyId);
        const currentPrice = latestPrice ? latestPrice.price : pricePerShare;
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
          position.id
        );

        // Update realized P&L
        this.stmts.updatePositionRealized.run(totalRealizedPnl, position.id);
      }

      // Update portfolio cash
      const newCash = portfolio.current_cash + netProceeds;
      const positionsValue = this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      this.stmts.updatePortfolioCash.run(newCash, totalValue, portfolioId);

      // Record transaction (before deleting position to avoid FK constraint)
      this.stmts.createTransaction.run(
        portfolioId,
        companyId,
        position.id,
        null, // Multiple lots possible
        TRANSACTION_TYPES.SELL,
        shares,
        pricePerShare,
        netProceeds,
        fees,
        null,
        newCash,
        newShares,
        notes,
        orderId,
        execDate
      );

      // If position is fully sold, update to 0 shares rather than delete
      // (to preserve transaction history which references position_id)
      if (shouldDeletePosition) {
        this.db.prepare(`
          UPDATE portfolio_positions
          SET shares = 0,
              average_cost = 0,
              cost_basis = 0,
              current_value = 0,
              unrealized_pnl = 0,
              unrealized_pnl_pct = 0,
              realized_pnl = realized_pnl + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalRealizedPnl, position.id);
      }

      return {
        success: true,
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
    })();

    return result;
  }

  // ============================================
  // Cash Management Methods
  // ============================================

  deposit(portfolioId, amount, { date = null, notes = null } = {}) {
    const execDate = date || new Date().toISOString();

    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const result = this.db.transaction(() => {
      // Update portfolio
      this.stmts.updatePortfolioDeposited.run(amount, amount, portfolioId);

      // Get new cash balance
      const updatedPortfolio = this.getPortfolio(portfolioId);
      const newCash = updatedPortfolio.current_cash;

      // Record transaction
      this.stmts.createTransaction.run(
        portfolioId,
        null, // no company
        null, // no position
        null, // no lot
        TRANSACTION_TYPES.DEPOSIT,
        null, // no shares
        null, // no price
        amount,
        0, // no fees
        null,
        newCash,
        null,
        notes,
        null,
        execDate
      );

      return {
        success: true,
        amount,
        newCashBalance: newCash,
        totalDeposited: updatedPortfolio.total_deposited
      };
    })();

    return result;
  }

  withdraw(portfolioId, amount, { date = null, notes = null } = {}) {
    const execDate = date || new Date().toISOString();

    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    if (portfolio.current_cash < amount) {
      throw new Error(`Insufficient cash. Available: ${portfolio.current_cash.toFixed(2)}, Requested: ${amount.toFixed(2)}`);
    }

    const result = this.db.transaction(() => {
      // Update portfolio
      this.stmts.updatePortfolioWithdrawn.run(amount, amount, portfolioId);

      // Get new cash balance
      const updatedPortfolio = this.getPortfolio(portfolioId);
      const newCash = updatedPortfolio.current_cash;

      // Record transaction
      this.stmts.createTransaction.run(
        portfolioId,
        null,
        null,
        null,
        TRANSACTION_TYPES.WITHDRAW,
        null,
        null,
        -amount, // Negative for withdrawal
        0,
        null,
        newCash,
        null,
        notes,
        null,
        execDate
      );

      return {
        success: true,
        amount,
        newCashBalance: newCash,
        totalWithdrawn: updatedPortfolio.total_withdrawn
      };
    })();

    return result;
  }

  recordDividend(portfolioId, { companyId, amount, dividendPerShare = null, date = null, notes = null }) {
    const execDate = date || new Date().toISOString();

    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const position = this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId}`);
    }

    const result = this.db.transaction(() => {
      // Update portfolio cash
      const newCash = portfolio.current_cash + amount;
      const positionsValue = this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      this.stmts.updatePortfolioCash.run(newCash, totalValue, portfolioId);

      // Update position dividends
      this.db.prepare(`
        UPDATE portfolio_positions
        SET total_dividends = total_dividends + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(amount, position.id);

      // Record transaction
      this.stmts.createTransaction.run(
        portfolioId,
        companyId,
        position.id,
        null,
        TRANSACTION_TYPES.DIVIDEND,
        position.shares,
        null,
        amount,
        0,
        dividendPerShare,
        newCash,
        position.shares,
        notes,
        null,
        execDate
      );

      return {
        success: true,
        amount,
        dividendPerShare,
        newCashBalance: newCash
      };
    })();

    return result;
  }

  recordFee(portfolioId, { amount, notes = null, date = null }) {
    const execDate = date || new Date().toISOString();

    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    if (portfolio.current_cash < amount) {
      throw new Error(`Insufficient cash for fee. Available: ${portfolio.current_cash.toFixed(2)}`);
    }

    const result = this.db.transaction(() => {
      const newCash = portfolio.current_cash - amount;
      const positionsValue = this._calculatePositionsValue(portfolioId);
      const totalValue = newCash + positionsValue;
      this.stmts.updatePortfolioCash.run(newCash, totalValue, portfolioId);

      this.stmts.createTransaction.run(
        portfolioId,
        null,
        null,
        null,
        TRANSACTION_TYPES.FEE,
        null,
        null,
        -amount,
        amount,
        null,
        newCash,
        null,
        notes,
        null,
        execDate
      );

      return {
        success: true,
        amount,
        newCashBalance: newCash
      };
    })();

    return result;
  }

  // ============================================
  // Value Calculation Methods
  // ============================================

  refreshPositionValues(portfolioId) {
    const positions = this.getPositions(portfolioId);
    let totalPositionsValue = 0;

    for (const position of positions) {
      const latestPrice = this.stmts.getLatestPrice.get(position.company_id);
      if (!latestPrice) continue;

      const currentPrice = latestPrice.price;
      const currentValue = position.shares * currentPrice;
      const unrealizedPnl = currentValue - (position.cost_basis || 0);
      const unrealizedPnlPct = position.cost_basis > 0
        ? (unrealizedPnl / position.cost_basis) * 100
        : 0;

      this.stmts.updatePosition.run(
        position.shares,
        position.average_cost,
        position.cost_basis,
        currentPrice,
        currentValue,
        unrealizedPnl,
        unrealizedPnlPct,
        position.last_traded_at,
        position.id
      );

      totalPositionsValue += currentValue;
    }

    // Update portfolio total value
    const portfolio = this.getPortfolio(portfolioId);
    const totalValue = portfolio.current_cash + totalPositionsValue;
    this.stmts.updatePortfolioCash.run(portfolio.current_cash, totalValue, portfolioId);

    return {
      positionsUpdated: positions.length,
      positionsValue: totalPositionsValue,
      cashValue: portfolio.current_cash,
      totalValue
    };
  }

  calculatePortfolioValue(portfolioId) {
    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const positions = this.getPositions(portfolioId);
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

  _calculatePositionsValue(portfolioId) {
    const positions = this.getPositions(portfolioId);
    return positions.reduce((sum, pos) => sum + (pos.current_value || 0), 0);
  }

  // ============================================
  // Transaction History
  // ============================================

  getTransactions(portfolioId, { limit = 50, offset = 0 } = {}) {
    return this.stmts.getTransactions.all(portfolioId, limit, offset);
  }

  // ============================================
  // Dividend Processing with DRIP Support
  // ============================================

  processDividend(portfolioId, { companyId, dividendPerShare, exDate = null, payDate = null }) {
    const execDate = payDate || new Date().toISOString();

    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const position = this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId}`);
    }

    // Calculate total dividend
    const totalDividend = position.shares * dividendPerShare;
    const isDRIP = portfolio.dividend_reinvest === 1;

    const result = this.db.transaction(() => {
      if (isDRIP) {
        // Reinvest dividend - buy more shares at current price
        const latestPrice = this.stmts.getLatestPrice.get(companyId);
        if (!latestPrice) {
          throw new Error(`No price data available for company ${companyId}`);
        }

        const currentPrice = latestPrice.price;
        const sharesToBuy = totalDividend / currentPrice;

        // Create DRIP lot
        const lotResult = this.stmts.createLot.run(
          portfolioId,
          position.id,
          companyId,
          sharesToBuy,
          sharesToBuy,
          currentPrice,
          totalDividend,
          execDate,
          'drip'
        );

        // Update position
        const newShares = position.shares + sharesToBuy;
        const newCostBasis = (position.cost_basis || 0) + totalDividend;
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
          position.id
        );

        // Update position dividends tracker
        this.db.prepare(`
          UPDATE portfolio_positions
          SET total_dividends = total_dividends + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalDividend, position.id);

        // Record DRIP transaction
        this.stmts.createTransaction.run(
          portfolioId,
          companyId,
          position.id,
          lotResult.lastInsertRowid,
          TRANSACTION_TYPES.DIVIDEND,
          sharesToBuy,
          currentPrice,
          totalDividend,
          0,
          dividendPerShare,
          portfolio.current_cash, // Cash unchanged
          newShares,
          `DRIP: ${sharesToBuy.toFixed(4)} shares at $${currentPrice.toFixed(2)}`,
          null,
          execDate
        );

        // Update portfolio value (cash unchanged, positions value increased)
        const positionsValue = this._calculatePositionsValue(portfolioId);
        const totalValue = portfolio.current_cash + positionsValue;
        this.stmts.updatePortfolioCash.run(portfolio.current_cash, totalValue, portfolioId);

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
        const positionsValue = this._calculatePositionsValue(portfolioId);
        const totalValue = newCash + positionsValue;
        this.stmts.updatePortfolioCash.run(newCash, totalValue, portfolioId);

        // Update position dividends tracker
        this.db.prepare(`
          UPDATE portfolio_positions
          SET total_dividends = total_dividends + ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalDividend, position.id);

        // Record cash dividend transaction
        this.stmts.createTransaction.run(
          portfolioId,
          companyId,
          position.id,
          null,
          TRANSACTION_TYPES.DIVIDEND,
          position.shares,
          null,
          totalDividend,
          0,
          dividendPerShare,
          newCash,
          position.shares,
          `Cash dividend: $${dividendPerShare.toFixed(4)}/share`,
          null,
          execDate
        );

        return {
          success: true,
          type: 'cash',
          dividendAmount: totalDividend,
          dividendPerShare,
          sharesOwned: position.shares,
          newCashBalance: newCash
        };
      }
    })();

    return result;
  }

  // ============================================
  // Bulk Operations
  // ============================================

  closePosition(portfolioId, companyId) {
    const position = this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
    }

    if (position.shares <= 0) {
      throw new Error('Position already closed');
    }

    // Get current price
    const latestPrice = this.stmts.getLatestPrice.get(companyId);
    if (!latestPrice) {
      throw new Error(`No price data available for company ${companyId}`);
    }

    // Sell all shares
    return this.executeSell(portfolioId, {
      companyId,
      shares: position.shares,
      pricePerShare: latestPrice.price,
      fees: 0,
      notes: 'Position closed'
    });
  }

  liquidatePortfolio(portfolioId) {
    const portfolio = this.getPortfolio(portfolioId);
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const positions = this.getPositions(portfolioId);
    const results = [];

    for (const position of positions) {
      try {
        const result = this.closePosition(portfolioId, position.company_id);
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
    const updatedPortfolio = this.getPortfolio(portfolioId);

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

  validateTrade(portfolioId, { companyId, side, shares, price }) {
    const warnings = [];
    const errors = [];

    // Get portfolio
    const portfolio = this.getPortfolio(portfolioId);
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
      const company = this.db.prepare('SELECT id, symbol FROM companies WHERE id = ?').get(companyId);
      if (!company) {
        return { valid: false, error: `Company ${companyId} not found`, warnings };
      }

    } else if (side === 'sell') {
      // Check position exists
      const position = this.getPosition(portfolioId, companyId);
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
      const latestPrice = this.stmts.getLatestPrice.get(companyId);
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
  processStockSplit(companyId, splitRatio, effectiveDate = null) {
    const execDate = effectiveDate || new Date().toISOString().split('T')[0];

    if (!splitRatio || splitRatio <= 0) {
      throw new Error('Split ratio must be positive');
    }

    // Get company info
    const company = this.db.prepare('SELECT id, symbol, name FROM companies WHERE id = ?').get(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Find all positions for this company across all portfolios
    const positions = this.db.prepare(`
      SELECT pp.*, p.id as portfolio_id, p.name as portfolio_name
      FROM portfolio_positions pp
      JOIN portfolios p ON pp.portfolio_id = p.id
      WHERE pp.company_id = ? AND pp.shares > 0
    `).all(companyId);

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
    const processResult = this.db.transaction(() => {
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
          this.db.prepare(`
            UPDATE portfolio_positions
            SET shares = ?,
                average_cost = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newShares, newAvgCost, position.id);

          // Update all open lots for this position
          const lots = this.db.prepare(`
            SELECT * FROM portfolio_lots
            WHERE position_id = ? AND is_closed = 0
          `).all(position.id);

          for (const lot of lots) {
            const newLotShares = lot.shares_remaining * splitRatio;
            const newLotOriginal = lot.shares_original * splitRatio;
            const newLotCost = lot.cost_per_share / splitRatio;

            this.db.prepare(`
              UPDATE portfolio_lots
              SET shares_remaining = ?,
                  shares_original = ?,
                  cost_per_share = ?
              WHERE id = ?
            `).run(newLotShares, newLotOriginal, newLotCost, lot.id);
          }

          // Record split transaction (no cash impact)
          this.db.prepare(`
            INSERT INTO portfolio_transactions
            (portfolio_id, company_id, position_id, transaction_type, shares,
             price_per_share, total_amount, notes, executed_at)
            VALUES (?, ?, ?, 'split', ?, ?, 0, ?, ?)
          `).run(
            position.portfolio_id,
            companyId,
            position.id,
            newShares - oldShares, // Net new shares
            newAvgCost,
            `Stock split ${splitRatio}:1 - ${oldShares.toFixed(4)} shares became ${newShares.toFixed(4)} shares`,
            execDate
          );

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
      return results;
    })();

    return {
      success: true,
      companyId,
      symbol: company.symbol,
      companyName: company.name,
      splitRatio,
      effectiveDate: execDate,
      affectedPortfolios: processResult.filter(r => r.success).length,
      failedPortfolios: processResult.filter(r => !r.success).length,
      results: processResult
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
  processStockSplitForPortfolio(portfolioId, companyId, splitRatio, effectiveDate = null) {
    const execDate = effectiveDate || new Date().toISOString().split('T')[0];

    if (!splitRatio || splitRatio <= 0) {
      throw new Error('Split ratio must be positive');
    }

    const position = this.getPosition(portfolioId, companyId);
    if (!position) {
      throw new Error(`No position found for company ${companyId} in portfolio ${portfolioId}`);
    }

    if (position.shares <= 0) {
      throw new Error('Position has no shares');
    }

    const company = this.db.prepare('SELECT symbol, name FROM companies WHERE id = ?').get(companyId);

    return this.db.transaction(() => {
      const oldShares = position.shares;
      const newShares = oldShares * splitRatio;
      const oldAvgCost = position.average_cost;
      const newAvgCost = oldAvgCost / splitRatio;

      // Update position
      this.db.prepare(`
        UPDATE portfolio_positions
        SET shares = ?,
            average_cost = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newShares, newAvgCost, position.id);

      // Update all open lots
      const lotsUpdated = this.db.prepare(`
        UPDATE portfolio_lots
        SET shares_remaining = shares_remaining * ?,
            shares_original = shares_original * ?,
            cost_per_share = cost_per_share / ?
        WHERE position_id = ? AND is_closed = 0
      `).run(splitRatio, splitRatio, splitRatio, position.id);

      // Record transaction
      this.db.prepare(`
        INSERT INTO portfolio_transactions
        (portfolio_id, company_id, position_id, transaction_type, shares,
         price_per_share, total_amount, notes, executed_at)
        VALUES (?, ?, ?, 'split', ?, ?, 0, ?, ?)
      `).run(
        portfolioId,
        companyId,
        position.id,
        newShares - oldShares,
        newAvgCost,
        `Stock split ${splitRatio}:1 - ${oldShares.toFixed(4)} shares became ${newShares.toFixed(4)} shares`,
        execDate
      );

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
        lotsUpdated: lotsUpdated.changes
      };
    })();
  }
}

module.exports = HoldingsEngine;
