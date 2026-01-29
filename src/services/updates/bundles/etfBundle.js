// src/services/updates/bundles/etfBundle.js
/**
 * ETF Update Bundle
 *
 * Handles all ETF-related update jobs:
 * - etf.tier1 - Daily update of essential ETFs
 * - etf.tier2 - Weekly update of indexed ETFs
 * - etf.holdings - Quarterly holdings import from Yahoo Finance
 * - etf.holdings_static - Preload ETF holdings with static data (fallback)
 * - etf.promotion - Tier 3 to Tier 2 promotion checks
 */

const { getETFUpdateScheduler } = require('../../../jobs/etfUpdateScheduler');

class ETFBundle {
  constructor() {
    this.etfScheduler = getETFUpdateScheduler();
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'etf.tier1':
        return this.runTier1Update(db, onProgress);
      case 'etf.tier2':
        return this.runTier2Update(db, onProgress);
      case 'etf.holdings':
        return this.runHoldingsImport(db, onProgress);
      case 'etf.holdings_static':
        return this.runStaticHoldingsPreload(db, onProgress);
      case 'etf.promotion':
        return this.runPromotionCheck(db, onProgress);
      default:
        throw new Error(`Unknown ETF job: ${jobKey}`);
    }
  }

  async runTier1Update(db, onProgress) {
    await onProgress(5, 'Starting Tier 1 ETF update...');

    // Use existing ETF scheduler
    await onProgress(10, 'Updating curated ETFs...');
    await this.etfScheduler.runTier1Update();

    const stats = this.getETFStats(db, 1);
    await onProgress(100, 'Tier 1 update complete');

    return {
      itemsTotal: stats.count,
      itemsProcessed: stats.count,
      itemsUpdated: stats.count,
      itemsFailed: 0
    };
  }

  async runTier2Update(db, onProgress) {
    await onProgress(5, 'Starting Tier 2 ETF update...');

    await onProgress(10, 'Updating indexed ETFs...');
    await this.etfScheduler.runTier2Update();

    const stats = this.getETFStats(db, 2);
    await onProgress(100, 'Tier 2 update complete');

    return {
      itemsTotal: stats.count,
      itemsProcessed: stats.count,
      itemsUpdated: stats.count,
      itemsFailed: 0
    };
  }

  async runHoldingsImport(db, onProgress) {
    await onProgress(5, 'Starting ETF holdings import...');

    const { getEtfService } = require('../../etfService');
    const etfService = getEtfService();

    // Get ETFs that need holdings update (tier 1 and 2, no recent update)
    const etfs = db.prepare(`
      SELECT symbol FROM etf_definitions
      WHERE tier IN (1, 2)
      AND (last_holdings_update IS NULL OR last_holdings_update < date('now', '-90 days'))
      ORDER BY tier ASC, symbol ASC
    `).all();

    await onProgress(10, `Importing holdings for ${etfs.length} ETFs...`);

    let updated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < etfs.length; i++) {
      const progress = 10 + Math.floor((i / etfs.length) * 85);
      await onProgress(progress, `Processing ${etfs[i].symbol} (${i + 1}/${etfs.length})...`);

      try {
        // Fetch holdings from Yahoo Finance with rate limiting
        const result = await etfService.fetchAndStoreHoldings(etfs[i].symbol);
        if (result.success) {
          updated++;
        } else {
          failed++;
          errors.push({ symbol: etfs[i].symbol, error: result.message });
        }

        // Additional delay to avoid rate limiting (2 seconds between requests)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        failed++;
        errors.push({ symbol: etfs[i].symbol, error: err.message });
        // If rate limited, wait longer
        if (err.message?.includes('429')) {
          await onProgress(progress, 'Rate limited, waiting 30 seconds...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    }

    await onProgress(100, `Holdings import complete: ${updated} updated, ${failed} failed`);

    return {
      itemsTotal: etfs.length,
      itemsProcessed: etfs.length,
      itemsUpdated: updated,
      itemsFailed: failed,
      errors: errors.slice(0, 10) // Only return first 10 errors
    };
  }

  async runStaticHoldingsPreload(db, onProgress) {
    await onProgress(5, 'Loading static ETF holdings data...');

    // Static holdings data for common ETFs
    const staticHoldings = {
      'SPY': [
        { symbol: 'AAPL', name: 'Apple Inc.', weight: 7.2 },
        { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.8 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.4 },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 3.2 },
        { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 2.1 },
        { symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 1.8 },
        { symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.4 },
        { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', weight: 1.7 },
        { symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.9 },
        { symbol: 'UNH', name: 'UnitedHealth Group Inc.', weight: 1.3 },
        { symbol: 'JPM', name: 'JPMorgan Chase & Co.', weight: 1.2 },
        { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 1.1 },
        { symbol: 'V', name: 'Visa Inc.', weight: 1.0 },
        { symbol: 'XOM', name: 'Exxon Mobil Corporation', weight: 1.0 },
        { symbol: 'PG', name: 'Procter & Gamble Co.', weight: 0.9 }
      ],
      'QQQ': [
        { symbol: 'AAPL', name: 'Apple Inc.', weight: 11.5 },
        { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 10.2 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 5.8 },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 5.1 },
        { symbol: 'META', name: 'Meta Platforms Inc.', weight: 4.2 },
        { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 3.5 },
        { symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 3.3 },
        { symbol: 'TSLA', name: 'Tesla Inc.', weight: 3.0 },
        { symbol: 'AVGO', name: 'Broadcom Inc.', weight: 2.8 },
        { symbol: 'COST', name: 'Costco Wholesale Corp.', weight: 2.5 },
        { symbol: 'ADBE', name: 'Adobe Inc.', weight: 2.0 },
        { symbol: 'PEP', name: 'PepsiCo Inc.', weight: 1.8 },
        { symbol: 'CSCO', name: 'Cisco Systems Inc.', weight: 1.7 },
        { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', weight: 1.6 },
        { symbol: 'NFLX', name: 'Netflix Inc.', weight: 1.5 }
      ],
      'VTI': [
        { symbol: 'AAPL', name: 'Apple Inc.', weight: 6.5 },
        { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.1 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.0 },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 2.9 },
        { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 1.9 },
        { symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.1 },
        { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', weight: 1.5 },
        { symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.7 },
        { symbol: 'UNH', name: 'UnitedHealth Group Inc.', weight: 1.2 },
        { symbol: 'JPM', name: 'JPMorgan Chase & Co.', weight: 1.1 },
        { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 1.0 },
        { symbol: 'V', name: 'Visa Inc.', weight: 0.9 },
        { symbol: 'XOM', name: 'Exxon Mobil Corporation', weight: 0.9 },
        { symbol: 'PG', name: 'Procter & Gamble Co.', weight: 0.8 },
        { symbol: 'MA', name: 'Mastercard Inc.', weight: 0.8 }
      ],
      'VOO': [
        { symbol: 'AAPL', name: 'Apple Inc.', weight: 7.2 },
        { symbol: 'MSFT', name: 'Microsoft Corporation', weight: 6.8 },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', weight: 3.4 },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', weight: 3.2 },
        { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', weight: 2.1 },
        { symbol: 'GOOG', name: 'Alphabet Inc. Class C', weight: 1.8 },
        { symbol: 'META', name: 'Meta Platforms Inc.', weight: 2.4 },
        { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', weight: 1.7 },
        { symbol: 'TSLA', name: 'Tesla Inc.', weight: 1.9 },
        { symbol: 'UNH', name: 'UnitedHealth Group Inc.', weight: 1.3 },
        { symbol: 'JPM', name: 'JPMorgan Chase & Co.', weight: 1.2 },
        { symbol: 'JNJ', name: 'Johnson & Johnson', weight: 1.1 },
        { symbol: 'V', name: 'Visa Inc.', weight: 1.0 },
        { symbol: 'XOM', name: 'Exxon Mobil Corporation', weight: 1.0 },
        { symbol: 'PG', name: 'Procter & Gamble Co.', weight: 0.9 }
      ],
      'BND': [
        { symbol: null, name: 'U.S. Treasury Bonds', weight: 45.0 },
        { symbol: null, name: 'Government-Related Bonds', weight: 6.0 },
        { symbol: null, name: 'Corporate Bonds', weight: 25.0 },
        { symbol: null, name: 'Securitized Bonds', weight: 22.0 },
        { symbol: null, name: 'Other Bonds', weight: 2.0 }
      ],
      'AGG': [
        { symbol: null, name: 'U.S. Treasury Bonds', weight: 42.0 },
        { symbol: null, name: 'Government-Related Bonds', weight: 5.0 },
        { symbol: null, name: 'Corporate Bonds', weight: 27.0 },
        { symbol: null, name: 'Securitized Bonds', weight: 24.0 },
        { symbol: null, name: 'Other Bonds', weight: 2.0 }
      ],
      'IWM': [
        { symbol: 'SMCI', name: 'Super Micro Computer Inc.', weight: 0.8 },
        { symbol: 'MSTR', name: 'MicroStrategy Inc.', weight: 0.7 },
        { symbol: 'FTNT', name: 'Fortinet Inc.', weight: 0.5 },
        { symbol: 'RCL', name: 'Royal Caribbean Cruises', weight: 0.5 },
        { symbol: 'DECK', name: 'Deckers Outdoor Corp.', weight: 0.5 },
        { symbol: 'TOST', name: 'Toast Inc.', weight: 0.4 },
        { symbol: 'FIX', name: 'Comfort Systems USA', weight: 0.4 },
        { symbol: 'WING', name: 'Wingstop Inc.', weight: 0.4 },
        { symbol: 'WSM', name: 'Williams-Sonoma Inc.', weight: 0.4 },
        { symbol: 'EME', name: 'EMCOR Group Inc.', weight: 0.4 }
      ],
      'VEA': [
        { symbol: null, name: 'Nestlé SA', weight: 1.8 },
        { symbol: null, name: 'ASML Holding NV', weight: 1.7 },
        { symbol: null, name: 'Novo Nordisk A/S', weight: 1.6 },
        { symbol: null, name: 'Samsung Electronics', weight: 1.5 },
        { symbol: null, name: 'LVMH', weight: 1.3 },
        { symbol: null, name: 'Toyota Motor Corp', weight: 1.2 },
        { symbol: null, name: 'AstraZeneca PLC', weight: 1.1 },
        { symbol: null, name: 'Shell PLC', weight: 1.0 },
        { symbol: null, name: 'SAP SE', weight: 0.9 },
        { symbol: null, name: 'Roche Holding AG', weight: 0.9 }
      ],
      'VWO': [
        { symbol: null, name: 'Taiwan Semiconductor', weight: 6.5 },
        { symbol: null, name: 'Tencent Holdings', weight: 3.8 },
        { symbol: null, name: 'Alibaba Group', weight: 2.1 },
        { symbol: null, name: 'Reliance Industries', weight: 1.5 },
        { symbol: null, name: 'Meituan', weight: 1.2 },
        { symbol: null, name: 'China Construction Bank', weight: 1.0 },
        { symbol: null, name: 'ICICI Bank', weight: 0.9 },
        { symbol: null, name: 'Infosys', weight: 0.8 },
        { symbol: null, name: 'Vale SA', weight: 0.8 },
        { symbol: null, name: 'JD.com', weight: 0.7 }
      ]
    };

    const insertStmt = db.prepare(`
      INSERT INTO etf_holdings (etf_id, symbol, security_name, weight, company_id, as_of_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const getCompanyId = db.prepare('SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)');
    const getEtf = db.prepare('SELECT id FROM etf_definitions WHERE symbol = ?');

    const etfSymbols = Object.keys(staticHoldings);
    let totalInserted = 0;
    let etfsUpdated = 0;

    for (let i = 0; i < etfSymbols.length; i++) {
      const etfSymbol = etfSymbols[i];
      const holdings = staticHoldings[etfSymbol];
      const progress = 10 + Math.floor((i / etfSymbols.length) * 85);
      await onProgress(progress, `Processing ${etfSymbol}...`);

      const etf = getEtf.get(etfSymbol);
      if (!etf) {
        continue;
      }

      // Delete existing holdings
      db.prepare('DELETE FROM etf_holdings WHERE etf_id = ?').run(etf.id);

      // Insert new holdings
      for (const holding of holdings) {
        const company = holding.symbol ? getCompanyId.get(holding.symbol) : null;
        insertStmt.run(
          etf.id,
          holding.symbol || 'BOND',
          holding.name,
          holding.weight,
          company?.id || null,
          new Date().toISOString().split('T')[0]
        );
        totalInserted++;
      }

      // Update last_holdings_update
      db.prepare('UPDATE etf_definitions SET last_holdings_update = CURRENT_TIMESTAMP WHERE id = ?').run(etf.id);
      etfsUpdated++;
    }

    await onProgress(100, `Static holdings loaded: ${etfsUpdated} ETFs, ${totalInserted} holdings`);

    return {
      itemsTotal: etfSymbols.length,
      itemsProcessed: etfSymbols.length,
      itemsUpdated: etfsUpdated,
      itemsFailed: etfSymbols.length - etfsUpdated
    };
  }

  async runPromotionCheck(db, onProgress) {
    await onProgress(5, 'Checking Tier 3 ETFs for promotion...');

    // Find frequently accessed Tier 3 ETFs
    const candidates = db.prepare(`
      SELECT symbol, access_count
      FROM etf_definitions
      WHERE tier = 3 AND access_count >= 10
      ORDER BY access_count DESC
      LIMIT 50
    `).all();

    await onProgress(30, `Found ${candidates.length} promotion candidates...`);

    let promoted = 0;

    for (const etf of candidates) {
      try {
        db.prepare(`
          UPDATE etf_definitions SET tier = 2, updated_at = CURRENT_TIMESTAMP
          WHERE LOWER(symbol) = LOWER(?)
        `).run(etf.symbol);
        promoted++;
      } catch {
        // Ignore promotion errors
      }
    }

    // Reset access counts
    db.prepare('UPDATE etf_definitions SET access_count = 0').run();

    await onProgress(100, `Promoted ${promoted} ETFs to Tier 2`);

    return {
      itemsTotal: candidates.length,
      itemsProcessed: candidates.length,
      itemsUpdated: promoted,
      itemsFailed: 0
    };
  }

  getETFStats(db, tier) {
    try {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM etf_definitions WHERE tier = ?
      `).get(tier);
      return { count: result?.count || 0 };
    } catch {
      return { count: 0 };
    }
  }
}

const etfBundle = new ETFBundle();

module.exports = {
  execute: (jobKey, db, context) => etfBundle.execute(jobKey, db, context)
};
