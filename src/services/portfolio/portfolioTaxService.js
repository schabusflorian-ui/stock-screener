// src/services/portfolio/portfolioTaxService.js
/**
 * Portfolio Tax Service
 *
 * Provides tax tracking and reporting for portfolios:
 * - Realized gains/losses tracking
 * - Tax lot management
 * - Tax loss harvesting opportunities
 * - Year-end tax summaries
 * - Multi-jurisdiction support
 */

const { getTaxRegime, calculateTax, checkWashSale, isLongTermHolding } = require('../costs/taxRegimes');
const { AustrianTaxTracker } = require('../costs/austrianTaxTracker');
const { TaxTracker } = require('../costs/taxTracker');

class PortfolioTaxService {
  constructor(db) {
    this.db = db.getDatabase ? db.getDatabase() : db;
    this._prepareStatements();
    this._taxTrackers = new Map(); // portfolioId -> TaxTracker instance
  }

  _prepareStatements() {
    // Get portfolio tax settings
    this.stmtGetPortfolioTaxSettings = this.db.prepare(`
      SELECT tax_country, tax_year, lot_method, broker_type
      FROM portfolios WHERE id = ?
    `);

    // Get or create tax settings table
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS portfolio_tax_settings (
          portfolio_id INTEGER PRIMARY KEY,
          tax_country TEXT DEFAULT 'AT',
          tax_year INTEGER DEFAULT 2024,
          lot_method TEXT DEFAULT 'fifo',
          broker_type TEXT DEFAULT 'foreign',
          track_tax_lots INTEGER DEFAULT 1,
          enable_tax_loss_harvesting INTEGER DEFAULT 1,
          tax_loss_threshold REAL DEFAULT 500,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
        )
      `);
    } catch (e) {
      // Table may already exist
    }

    // Get tax settings
    this.stmtGetTaxSettings = this.db.prepare(`
      SELECT * FROM portfolio_tax_settings WHERE portfolio_id = ?
    `);

    // Upsert tax settings
    this.stmtUpsertTaxSettings = this.db.prepare(`
      INSERT INTO portfolio_tax_settings (portfolio_id, tax_country, tax_year, lot_method, broker_type, track_tax_lots, enable_tax_loss_harvesting, tax_loss_threshold)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(portfolio_id) DO UPDATE SET
        tax_country = excluded.tax_country,
        tax_year = excluded.tax_year,
        lot_method = excluded.lot_method,
        broker_type = excluded.broker_type,
        track_tax_lots = excluded.track_tax_lots,
        enable_tax_loss_harvesting = excluded.enable_tax_loss_harvesting,
        tax_loss_threshold = excluded.tax_loss_threshold,
        updated_at = CURRENT_TIMESTAMP
    `);

    // Get realized gains for portfolio
    this.stmtGetRealizedGains = this.db.prepare(`
      SELECT
        pt.id,
        pt.company_id,
        c.symbol,
        pt.shares,
        pt.price_per_share,
        pt.total_amount,
        pt.executed_at,
        pl.cost_per_share,
        pl.acquired_at,
        (pt.price_per_share - pl.cost_per_share) * pt.shares as gain_loss
      FROM portfolio_transactions pt
      JOIN companies c ON pt.company_id = c.id
      LEFT JOIN portfolio_lots pl ON pt.lot_id = pl.id
      WHERE pt.portfolio_id = ?
        AND pt.transaction_type = 'SELL'
        AND strftime('%Y', pt.executed_at) = ?
      ORDER BY pt.executed_at DESC
    `);

    // Get open positions with lots
    this.stmtGetPositionsWithLots = this.db.prepare(`
      SELECT
        pp.id as position_id,
        pp.company_id,
        c.symbol,
        c.name,
        pp.shares,
        pp.average_cost,
        pp.cost_basis,
        pp.current_price,
        pp.current_value,
        pp.unrealized_pnl,
        pp.unrealized_pnl_pct
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ? AND pp.shares > 0
      ORDER BY pp.current_value DESC
    `);

    // Get lots for position
    this.stmtGetLotsForPosition = this.db.prepare(`
      SELECT
        id,
        shares_remaining,
        cost_per_share,
        total_cost,
        acquired_at,
        acquisition_type
      FROM portfolio_lots
      WHERE position_id = ? AND is_closed = 0
      ORDER BY acquired_at ASC
    `);
  }

  /**
   * Get or create tax tracker for portfolio
   */
  getTaxTracker(portfolioId) {
    if (this._taxTrackers.has(portfolioId)) {
      return this._taxTrackers.get(portfolioId);
    }

    const settings = this.getTaxSettings(portfolioId);
    const regime = getTaxRegime(settings.tax_country);

    let tracker;
    if (settings.tax_country === 'AT') {
      tracker = new AustrianTaxTracker({
        year: settings.tax_year,
        lotMethod: settings.lot_method
      });
    } else {
      tracker = new TaxTracker({
        lotMethod: settings.lot_method,
        trackWashSales: regime.lossRules.washSaleRule
      });
    }

    this._taxTrackers.set(portfolioId, tracker);
    return tracker;
  }

  /**
   * Get tax settings for portfolio
   */
  getTaxSettings(portfolioId) {
    let settings = this.stmtGetTaxSettings.get(portfolioId);

    if (!settings) {
      // Create default settings
      settings = {
        portfolio_id: portfolioId,
        tax_country: 'AT',
        tax_year: new Date().getFullYear(),
        lot_method: 'fifo',
        broker_type: 'foreign',
        track_tax_lots: 1,
        enable_tax_loss_harvesting: 1,
        tax_loss_threshold: 500
      };
      this.updateTaxSettings(portfolioId, settings);
    }

    return settings;
  }

  /**
   * Update tax settings for portfolio
   */
  updateTaxSettings(portfolioId, settings) {
    this.stmtUpsertTaxSettings.run(
      portfolioId,
      settings.tax_country || 'AT',
      settings.tax_year || new Date().getFullYear(),
      settings.lot_method || 'fifo',
      settings.broker_type || 'foreign',
      settings.track_tax_lots ? 1 : 0,
      settings.enable_tax_loss_harvesting ? 1 : 0,
      settings.tax_loss_threshold || 500
    );

    // Clear cached tracker to pick up new settings
    this._taxTrackers.delete(portfolioId);

    return this.getTaxSettings(portfolioId);
  }

  /**
   * Calculate tax impact before executing a trade
   */
  calculateTradeImpact(portfolioId, symbol, shares, currentPrice, side) {
    const settings = this.getTaxSettings(portfolioId);
    const regime = getTaxRegime(settings.tax_country);

    if (side === 'buy') {
      return {
        taxImpact: 0,
        message: 'No tax impact on purchase',
        regime: regime.name
      };
    }

    // Get position and lots for sell
    const position = this._getPositionBySymbol(portfolioId, symbol);
    if (!position) {
      return { error: 'Position not found' };
    }

    const lots = this.stmtGetLotsForPosition.all(position.position_id);
    if (!lots || lots.length === 0) {
      // Use average cost if no lots
      const avgCost = position.average_cost;
      const gain = (currentPrice - avgCost) * shares;

      const taxResult = calculateTax(gain, regime, {
        isLongTerm: false // Can't determine without lot info
      });

      return {
        estimatedGain: gain,
        estimatedTax: taxResult.tax,
        netProceeds: (currentPrice * shares) - taxResult.tax,
        effectiveRate: taxResult.rate * 100,
        regime: regime.name,
        warning: 'Tax estimate based on average cost'
      };
    }

    // Calculate using lot method
    const sortedLots = this._sortLots(lots, settings.lot_method, currentPrice);
    let totalGain = 0;
    let shortTermGain = 0;
    let longTermGain = 0;
    let remainingShares = shares;
    const lotsUsed = [];

    for (const lot of sortedLots) {
      if (remainingShares <= 0) break;

      const sharesToSell = Math.min(lot.shares_remaining, remainingShares);
      const gain = (currentPrice - lot.cost_per_share) * sharesToSell;
      totalGain += gain;

      const holding = isLongTermHolding(regime, lot.acquired_at);

      if (holding.isLongTerm) {
        longTermGain += gain;
      } else {
        shortTermGain += gain;
      }

      lotsUsed.push({
        shares: sharesToSell,
        costBasis: lot.cost_per_share,
        acquiredAt: lot.acquired_at,
        gain,
        isLongTerm: holding.isLongTerm,
        daysHeld: holding.daysHeld
      });

      remainingShares -= sharesToSell;
    }

    // Calculate taxes
    const shortTermTax = calculateTax(shortTermGain, regime, { isLongTerm: false });
    const longTermTax = calculateTax(longTermGain, regime, { isLongTerm: true });
    const totalTax = shortTermTax.tax + longTermTax.tax;

    return {
      estimatedGain: totalGain,
      shortTermGain,
      longTermGain,
      estimatedTax: totalTax,
      shortTermTax: shortTermTax.tax,
      longTermTax: longTermTax.tax,
      netProceeds: (currentPrice * shares) - totalTax,
      effectiveRate: totalGain > 0 ? (totalTax / totalGain) * 100 : 0,
      lotsUsed,
      regime: regime.name,
      hasLongTermBenefit: regime.capitalGains.hasHoldingPeriodBenefit
    };
  }

  /**
   * Get tax loss harvesting opportunities
   */
  getTaxLossHarvestingOpportunities(portfolioId) {
    const settings = this.getTaxSettings(portfolioId);
    const regime = getTaxRegime(settings.tax_country);

    // No benefit if no capital gains tax
    if (regime.capitalGains.rate === 0) {
      return {
        opportunities: [],
        message: 'Tax loss harvesting not applicable - no capital gains tax in ' + regime.name
      };
    }

    const positions = this.stmtGetPositionsWithLots.all(portfolioId);
    const opportunities = [];

    for (const pos of positions) {
      if (pos.unrealized_pnl < -settings.tax_loss_threshold) {
        const lots = this.stmtGetLotsForPosition.all(pos.position_id);

        // Calculate potential tax savings
        const taxSavings = Math.abs(pos.unrealized_pnl) * regime.capitalGains.rate;

        // Check wash sale implications
        let washSaleWarning = null;
        if (regime.lossRules.washSaleRule) {
          washSaleWarning = `If you repurchase within ${regime.lossRules.washSaleWindowDays} days, the loss will be disallowed`;
        }

        opportunities.push({
          symbol: pos.symbol,
          name: pos.name,
          shares: pos.shares,
          currentPrice: pos.current_price,
          avgCost: pos.average_cost,
          unrealizedLoss: pos.unrealized_pnl,
          unrealizedLossPct: pos.unrealized_pnl_pct,
          potentialTaxSavings: taxSavings,
          lots: lots.map(l => ({
            shares: l.shares_remaining,
            costBasis: l.cost_per_share,
            acquiredAt: l.acquired_at,
            loss: (pos.current_price - l.cost_per_share) * l.shares_remaining
          })),
          washSaleWarning
        });
      }
    }

    // Sort by potential tax savings
    opportunities.sort((a, b) => b.potentialTaxSavings - a.potentialTaxSavings);

    const totalPotentialSavings = opportunities.reduce((sum, o) => sum + o.potentialTaxSavings, 0);

    return {
      opportunities,
      totalPotentialSavings,
      count: opportunities.length,
      regime: regime.name,
      taxRate: regime.capitalGains.rate * 100
    };
  }

  /**
   * Get year-end tax summary
   */
  getYearEndSummary(portfolioId, year = new Date().getFullYear()) {
    const settings = this.getTaxSettings(portfolioId);
    const regime = getTaxRegime(settings.tax_country);

    // Get realized gains from transactions
    const trades = this.stmtGetRealizedGains.all(portfolioId, year.toString());

    let totalGains = 0;
    let totalLosses = 0;
    let shortTermGains = 0;
    let shortTermLosses = 0;
    let longTermGains = 0;
    let longTermLosses = 0;

    const tradeDetails = [];

    for (const trade of trades) {
      const gain = trade.gain_loss || 0;
      const holding = trade.acquired_at
        ? isLongTermHolding(regime, trade.acquired_at, trade.executed_at)
        : { isLongTerm: false };

      if (gain > 0) {
        totalGains += gain;
        if (holding.isLongTerm) {
          longTermGains += gain;
        } else {
          shortTermGains += gain;
        }
      } else {
        totalLosses += Math.abs(gain);
        if (holding.isLongTerm) {
          longTermLosses += Math.abs(gain);
        } else {
          shortTermLosses += Math.abs(gain);
        }
      }

      tradeDetails.push({
        symbol: trade.symbol,
        shares: trade.shares,
        salePrice: trade.price_per_share,
        costBasis: trade.cost_per_share,
        gain,
        isLongTerm: holding.isLongTerm,
        date: trade.executed_at
      });
    }

    const netGain = totalGains - totalLosses;

    // Calculate tax
    let estimatedTax = 0;
    if (regime.capitalGains.hasHoldingPeriodBenefit) {
      const stTax = calculateTax(shortTermGains - shortTermLosses, regime, { isLongTerm: false });
      const ltTax = calculateTax(longTermGains - longTermLosses, regime, { isLongTerm: true });
      estimatedTax = stTax.tax + ltTax.tax;
    } else {
      const taxResult = calculateTax(netGain, regime);
      estimatedTax = taxResult.tax;
    }

    // Get unrealized gains for context
    const positions = this.stmtGetPositionsWithLots.all(portfolioId);
    const totalUnrealizedGain = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

    return {
      year,
      regime: {
        name: regime.name,
        code: regime.code,
        rate: regime.capitalGains.rate * 100,
        hasLongTermBenefit: regime.capitalGains.hasHoldingPeriodBenefit
      },
      realized: {
        totalGains,
        totalLosses,
        netGain,
        shortTermGains,
        shortTermLosses,
        longTermGains,
        longTermLosses,
        tradeCount: trades.length
      },
      unrealized: {
        totalGain: totalUnrealizedGain,
        positionCount: positions.length
      },
      tax: {
        estimatedTax,
        effectiveRate: netGain > 0 ? (estimatedTax / netGain) * 100 : 0
      },
      trades: tradeDetails.slice(0, 50), // Limit for response size
      reporting: {
        form: regime.reporting.form,
        brokerWithholding: regime.reporting.brokerWithholding,
        selfReportRequired: settings.broker_type === 'foreign'
      }
    };
  }

  /**
   * Helper: Get position by symbol
   */
  _getPositionBySymbol(portfolioId, symbol) {
    return this.db.prepare(`
      SELECT pp.*, c.symbol
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ? AND LOWER(c.symbol) = LOWER(?)
    `).get(portfolioId, symbol);
  }

  /**
   * Helper: Sort lots by method
   */
  _sortLots(lots, method, currentPrice) {
    const sorted = [...lots];

    switch (method) {
      case 'fifo':
        sorted.sort((a, b) => new Date(a.acquired_at) - new Date(b.acquired_at));
        break;
      case 'lifo':
        sorted.sort((a, b) => new Date(b.acquired_at) - new Date(a.acquired_at));
        break;
      case 'hifo':
        sorted.sort((a, b) => b.cost_per_share - a.cost_per_share);
        break;
      case 'lofo':
        sorted.sort((a, b) => a.cost_per_share - b.cost_per_share);
        break;
      default:
        // FIFO default
        sorted.sort((a, b) => new Date(a.acquired_at) - new Date(b.acquired_at));
    }

    return sorted;
  }
}

module.exports = { PortfolioTaxService };
