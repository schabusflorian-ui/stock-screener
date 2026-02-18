// src/services/priceService.js
/**
 * Node.js-native price update service using yahoo-finance2
 * Replaces the Python price_updater.py for PostgreSQL compatibility
 */

const YahooFinanceClass = require('yahoo-finance2').default;
const { getDatabaseAsync, isUsingPostgres } = require('../lib/db');

// Initialize Yahoo Finance
const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] });

// Configuration
const BATCH_SIZE = 20;  // Reduced from 50 to avoid rate limits
const DELAY_BETWEEN_BATCHES_MS = 10000;  // Increased from 5000
const FETCH_DAYS = 7;
const MAX_DAILY_UPDATES = 2000;  // Reduced from 4500

// Tier definitions
const TIER_CONFIG = {
  1: { name: 'Core', frequency: 'daily', staleDays: 2 },
  2: { name: 'Active', frequency: 'every_2_days', staleDays: 4 },
  3: { name: 'Tracked', frequency: 'every_3_days', staleDays: 5 },
  4: { name: 'Archive', frequency: 'weekly', staleDays: 10 }
};

// Yahoo Finance symbol suffixes by country
const COUNTRY_YAHOO_SUFFIX = {
  'US': '',
  'GB': '.L',
  'DE': '.DE',
  'FR': '.PA',
  'NL': '.AS',
  'BE': '.BR',
  'ES': '.MC',
  'IT': '.MI',
  'CH': '.SW',
  'SE': '.ST',
  'DK': '.CO',
  'NO': '.OL',
  'FI': '.HE',
  'AT': '.VI',
  'PT': '.LS',
  'IE': '.IR',
  'PL': '.WA',
  'GR': '.AT',
  'CA': '.TO',
  'AU': '.AX',
  'JP': '.T',
  'HK': '.HK',
};

class PriceService {
  constructor() {
    this.rateLimitMs = 2000;  // Increased from 500ms to 2 seconds
    this.lastRequestTime = 0;
    this.consecutiveErrors = 0;
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitMs) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitMs - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  getYahooSymbol(symbol, country) {
    if (!symbol) return null;
    symbol = symbol.toUpperCase().trim();
    country = (country || 'US').toUpperCase();

    if (symbol.includes('.')) return symbol;

    if (country === 'GB') {
      if (symbol.endsWith('/')) symbol = symbol.slice(0, -1);
      else if (symbol.includes('/')) symbol = symbol.replace('/', '-');
      if (symbol && (symbol[0].match(/\d/) || symbol.includes('='))) return null;
      if (symbol.endsWith('GBX')) symbol = symbol.slice(0, -3);
      if (symbol.endsWith('EUR') || symbol.endsWith('USD')) return null;
    }

    const suffix = COUNTRY_YAHOO_SUFFIX[country] || '';
    return `${symbol}${suffix}`;
  }

  /**
   * Get companies that need updates today based on tier rotation
   */
  async getCompaniesForToday(db) {
    const isPostgres = isUsingPostgres();
    const today = new Date();
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('[PriceService] Weekend - skipping updates');
      return [];
    }

    // PostgreSQL uses different modulo and date syntax
    const query = isPostgres ? `
      SELECT id, symbol, name, country, update_tier, last_price_update, update_priority_score
      FROM companies
      WHERE symbol IS NOT NULL
        AND symbol != ''
        AND symbol NOT LIKE 'CIK_%'
        AND LENGTH(symbol) <= 10
        AND symbol NOT LIKE '%/%'
        AND LENGTH(symbol) >= 1
        AND (
          (update_tier = 1)
          OR (update_tier = 2 AND (id % 2) = ($1 % 2))
          OR (update_tier = 3 AND (id % 3) = ($1 % 3))
          OR (update_tier = 4 AND (id % 5) = $2)
        )
      ORDER BY
        update_tier ASC,
        last_price_update ASC NULLS FIRST,
        update_priority_score DESC
      LIMIT $3
    ` : `
      SELECT id, symbol, name, country, update_tier, last_price_update, update_priority_score
      FROM companies
      WHERE symbol IS NOT NULL
        AND symbol != ''
        AND symbol NOT LIKE 'CIK_%'
        AND LENGTH(symbol) <= 10
        AND symbol NOT LIKE '%/%'
        AND LENGTH(symbol) >= 1
        AND (
          (update_tier = 1)
          OR (update_tier = 2 AND (id % 2) = (? % 2))
          OR (update_tier = 3 AND (id % 3) = (? % 3))
          OR (update_tier = 4 AND (id % 5) = ?)
        )
      ORDER BY
        update_tier ASC,
        last_price_update ASC,
        update_priority_score DESC
      LIMIT ?
    `;

    const params = isPostgres
      ? [dayOfMonth, dayOfWeek, MAX_DAILY_UPDATES]
      : [dayOfMonth, dayOfMonth, dayOfWeek, MAX_DAILY_UPDATES];

    const result = await db.query(query, params);
    return result.rows || result;
  }

  /**
   * Fetch historical prices for symbols using yahoo-finance2
   */
  async fetchPrices(symbols, days = FETCH_DAYS) {
    const results = new Map();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (const symbol of symbols) {
      try {
        await this.throttle();

        const data = await yahooFinance.chart(symbol, {
          period1: startDate,
          period2: endDate,
          interval: '1d'
        });

        if (data && data.quotes && data.quotes.length > 0) {
          results.set(symbol, data.quotes.map(q => ({
            date: new Date(q.date).toISOString().split('T')[0],
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            adjusted_close: q.adjclose || q.close,
            volume: q.volume || 0
          })).filter(q => q.close !== null));

          // Reset error counter on success
          this.consecutiveErrors = 0;
        }
      } catch (error) {
        const errMsg = error.message || '';

        // Handle rate limiting
        if (errMsg.includes('Too Many Requests') || errMsg.includes('429')) {
          this.consecutiveErrors++;
          const backoffMs = Math.min(30000, 5000 * this.consecutiveErrors);
          console.log(`[PriceService] Rate limited, backing off ${backoffMs}ms (attempt ${this.consecutiveErrors})`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        } else if (!errMsg.includes('Not Found') && !errMsg.includes('404')) {
          console.log(`[PriceService] Error fetching ${symbol}: ${errMsg}`);
        }
      }
    }

    return results;
  }

  /**
   * Fetch quote data for a symbol
   */
  async fetchQuote(symbol) {
    try {
      await this.throttle();
      return await yahooFinance.quote(symbol);
    } catch {
      return null;
    }
  }

  /**
   * Upsert prices to database
   */
  async upsertPrices(db, companyId, prices, quote = null) {
    const isPostgres = isUsingPostgres();
    let newRecords = 0;
    let updatedRecords = 0;

    for (const price of prices) {
      try {
        // Check if record exists
        const checkQuery = isPostgres
          ? 'SELECT id FROM daily_prices WHERE company_id = $1 AND date = $2'
          : 'SELECT id FROM daily_prices WHERE company_id = ? AND date = ?';

        const existing = await db.query(checkQuery, [companyId, price.date]);
        const exists = (existing.rows || existing).length > 0;

        if (exists) {
          const updateQuery = isPostgres ? `
            UPDATE daily_prices SET
              open = $1, high = $2, low = $3, close = $4,
              adjusted_close = $5, volume = $6, source = 'yfinance'
            WHERE company_id = $7 AND date = $8
          ` : `
            UPDATE daily_prices SET
              open = ?, high = ?, low = ?, close = ?,
              adjusted_close = ?, volume = ?, source = 'yfinance'
            WHERE company_id = ? AND date = ?
          `;
          await db.query(updateQuery, [
            price.open, price.high, price.low, price.close,
            price.adjusted_close, price.volume || 0,
            companyId, price.date
          ]);
          updatedRecords++;
        } else {
          const insertQuery = isPostgres ? `
            INSERT INTO daily_prices
            (company_id, date, open, high, low, close, adjusted_close, volume, source)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'yfinance')
          ` : `
            INSERT INTO daily_prices
            (company_id, date, open, high, low, close, adjusted_close, volume, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yfinance')
          `;
          await db.query(insertQuery, [
            companyId, price.date,
            price.open, price.high, price.low, price.close,
            price.adjusted_close, price.volume || 0
          ]);
          newRecords++;
        }
      } catch (error) {
        console.log(`[PriceService] Error saving price for company ${companyId}: ${error.message}`);
      }
    }

    // Update last_price_update on company
    const updateCompanyQuery = isPostgres
      ? 'UPDATE companies SET last_price_update = CURRENT_DATE WHERE id = $1'
      : "UPDATE companies SET last_price_update = date('now') WHERE id = ?";
    await db.query(updateCompanyQuery, [companyId]);

    // Update price_metrics if we have quote data
    if (prices.length > 0) {
      const latest = prices[prices.length - 1];
      // Ensure values are numbers or null (not booleans)
      const marketCap = typeof quote?.marketCap === 'number' ? quote.marketCap : null;
      const sharesOutstanding = typeof quote?.sharesOutstanding === 'number' ? quote.sharesOutstanding : null;

      const metricsQuery = isPostgres ? `
        INSERT INTO price_metrics (company_id, last_price, market_cap, shares_outstanding, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT(company_id) DO UPDATE SET
          last_price = EXCLUDED.last_price,
          market_cap = COALESCE(EXCLUDED.market_cap, price_metrics.market_cap),
          shares_outstanding = COALESCE(EXCLUDED.shares_outstanding, price_metrics.shares_outstanding),
          updated_at = NOW()
      ` : `
        INSERT INTO price_metrics (company_id, last_price, market_cap, shares_outstanding, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(company_id) DO UPDATE SET
          last_price = excluded.last_price,
          market_cap = COALESCE(excluded.market_cap, price_metrics.market_cap),
          shares_outstanding = COALESCE(excluded.shares_outstanding, price_metrics.shares_outstanding),
          updated_at = datetime('now')
      `;

      try {
        await db.query(metricsQuery, [companyId, latest.close, marketCap, sharesOutstanding]);
      } catch (error) {
        // Ignore metrics errors
      }
    }

    return { newRecords, updatedRecords };
  }

  /**
   * Run daily price update
   */
  async runDailyUpdate(onProgress) {
    const db = await getDatabaseAsync();
    const startTime = Date.now();

    await onProgress?.(5, 'Getting companies to update...');
    const companies = await this.getCompaniesForToday(db);

    if (companies.length === 0) {
      await onProgress?.(100, 'No companies to update today');
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0
      };
    }

    console.log(`[PriceService] Updating ${companies.length} companies`);
    await onProgress?.(10, `Updating ${companies.length} companies...`);

    // Build Yahoo symbol mapping
    const yahooToCompany = new Map();
    for (const company of companies) {
      const yahooSym = this.getYahooSymbol(company.symbol, company.country);
      if (yahooSym) {
        yahooToCompany.set(yahooSym, company);
      }
    }

    const yahooSymbols = Array.from(yahooToCompany.keys());
    let successful = 0;
    let failed = 0;
    let newRecords = 0;
    let updatedRecords = 0;

    // Process in batches
    const totalBatches = Math.ceil(yahooSymbols.length / BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const start = batchIdx * BATCH_SIZE;
      const batchSymbols = yahooSymbols.slice(start, start + BATCH_SIZE);

      const progress = 10 + Math.floor((batchIdx / totalBatches) * 85);
      await onProgress?.(progress, `Batch ${batchIdx + 1}/${totalBatches}: ${batchSymbols.length} symbols...`);

      try {
        const priceData = await this.fetchPrices(batchSymbols);

        for (const yahooSymbol of batchSymbols) {
          const company = yahooToCompany.get(yahooSymbol);
          const prices = priceData.get(yahooSymbol);

          if (prices && prices.length > 0) {
            const quote = await this.fetchQuote(yahooSymbol);
            const result = await this.upsertPrices(db, company.id, prices, quote);
            newRecords += result.newRecords;
            updatedRecords += result.updatedRecords;
            successful++;
          } else {
            failed++;
          }
        }

        console.log(`[PriceService] Batch ${batchIdx + 1}/${totalBatches}: ${priceData.size}/${batchSymbols.length} successful`);

        if (batchIdx < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
        }
      } catch (error) {
        console.error(`[PriceService] Batch error: ${error.message}`);
        failed += batchSymbols.length;
      }
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`[PriceService] Update complete: ${successful} successful, ${failed} failed, ${duration} minutes`);

    await onProgress?.(100, `Updated ${successful} companies in ${duration} minutes`);

    return {
      itemsTotal: companies.length,
      itemsProcessed: successful + failed,
      itemsUpdated: successful,
      itemsFailed: failed,
      newRecords,
      updatedRecords
    };
  }

  /**
   * Run backfill for stale companies
   */
  async runBackfill(onProgress) {
    const db = await getDatabaseAsync();
    const isPostgres = isUsingPostgres();

    await onProgress?.(5, 'Finding stale companies...');

    const query = isPostgres ? `
      SELECT id, symbol, name, country, update_tier, last_price_update
      FROM companies
      WHERE symbol IS NOT NULL
        AND symbol NOT LIKE 'CIK_%'
        AND (
          (update_tier = 1 AND (last_price_update < CURRENT_DATE - INTERVAL '2 days' OR last_price_update IS NULL))
          OR (update_tier = 2 AND (last_price_update < CURRENT_DATE - INTERVAL '4 days' OR last_price_update IS NULL))
          OR (update_tier = 3 AND (last_price_update < CURRENT_DATE - INTERVAL '5 days' OR last_price_update IS NULL))
          OR (update_tier = 4 AND (last_price_update < CURRENT_DATE - INTERVAL '10 days' OR last_price_update IS NULL))
        )
      ORDER BY update_tier ASC, last_price_update ASC NULLS FIRST
      LIMIT 500
    ` : `
      SELECT id, symbol, name, country, update_tier, last_price_update
      FROM companies
      WHERE symbol IS NOT NULL
        AND symbol NOT LIKE 'CIK_%'
        AND (
          (update_tier = 1 AND (last_price_update < date('now', '-2 days') OR last_price_update IS NULL))
          OR (update_tier = 2 AND (last_price_update < date('now', '-4 days') OR last_price_update IS NULL))
          OR (update_tier = 3 AND (last_price_update < date('now', '-5 days') OR last_price_update IS NULL))
          OR (update_tier = 4 AND (last_price_update < date('now', '-10 days') OR last_price_update IS NULL))
        )
      ORDER BY update_tier ASC, last_price_update ASC
      LIMIT 500
    `;

    const result = await db.query(query);
    const companies = result.rows || result;

    if (companies.length === 0) {
      await onProgress?.(100, 'No stale companies found');
      return { itemsTotal: 0, itemsProcessed: 0, itemsUpdated: 0, itemsFailed: 0 };
    }

    console.log(`[PriceService] Backfilling ${companies.length} stale companies`);
    await onProgress?.(10, `Backfilling ${companies.length} stale companies...`);

    let successful = 0;
    let failed = 0;

    for (const company of companies) {
      const yahooSym = this.getYahooSymbol(company.symbol, company.country);
      if (!yahooSym) {
        failed++;
        continue;
      }

      try {
        const priceData = await this.fetchPrices([yahooSym], 14);
        const prices = priceData.get(yahooSym);

        if (prices && prices.length > 0) {
          await this.upsertPrices(db, company.id, prices);
          successful++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      const progress = 10 + Math.floor(((successful + failed) / companies.length) * 85);
      await onProgress?.(progress, `Backfilled ${successful}/${companies.length}...`);
    }

    await onProgress?.(100, `Backfill complete: ${successful} updated`);

    return {
      itemsTotal: companies.length,
      itemsProcessed: successful + failed,
      itemsUpdated: successful,
      itemsFailed: failed
    };
  }

  /**
   * Update index prices (SPY, QQQ, etc.)
   */
  async runIndexUpdate(onProgress) {
    const db = await getDatabaseAsync();
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI', 'BND', 'GLD', 'TLT'];

    await onProgress?.(5, `Updating ${indices.length} indices...`);

    let successful = 0;
    let failed = 0;

    for (const symbol of indices) {
      try {
        const priceData = await this.fetchPrices([symbol]);
        const prices = priceData.get(symbol);

        if (prices && prices.length > 0) {
          // Find company_id for this symbol
          const isPostgres = isUsingPostgres();
          const findQuery = isPostgres
            ? 'SELECT id FROM companies WHERE symbol = $1 LIMIT 1'
            : 'SELECT id FROM companies WHERE symbol = ? LIMIT 1';

          const result = await db.query(findQuery, [symbol]);
          const company = (result.rows || result)[0];

          if (company) {
            const quote = await this.fetchQuote(symbol);
            await this.upsertPrices(db, company.id, prices, quote);
            successful++;
          } else {
            console.log(`[PriceService] Index ${symbol} not found in companies table`);
            failed++;
          }
        } else {
          failed++;
        }
      } catch (error) {
        console.log(`[PriceService] Index update error for ${symbol}: ${error.message}`);
        failed++;
      }

      const progress = 5 + Math.floor(((successful + failed) / indices.length) * 90);
      await onProgress?.(progress, `Updated ${successful}/${indices.length} indices...`);
    }

    await onProgress?.(100, `Index update complete: ${successful}/${indices.length} updated`);

    return {
      itemsTotal: indices.length,
      itemsProcessed: successful + failed,
      itemsUpdated: successful,
      itemsFailed: failed
    };
  }

  /**
   * Update intraday prices for watchlist/portfolio stocks
   */
  async runIntradayUpdate(onProgress) {
    const db = await getDatabaseAsync();
    const isPostgres = isUsingPostgres();

    await onProgress?.(5, 'Getting tracked stocks...');

    // Get watchlist and portfolio stocks
    let stocks = [];
    try {
      const query = isPostgres ? `
        SELECT DISTINCT c.id, c.symbol, c.country FROM (
          SELECT company_id FROM watchlist
          UNION
          SELECT company_id FROM portfolio_positions
        ) AS tracked
        JOIN companies c ON tracked.company_id = c.id
      ` : `
        SELECT DISTINCT c.id, c.symbol, c.country FROM (
          SELECT company_id FROM watchlist
          UNION
          SELECT company_id FROM portfolio_positions
        ) AS tracked
        JOIN companies c ON tracked.company_id = c.id
      `;
      const result = await db.query(query);
      stocks = result.rows || result;
    } catch (error) {
      // Fallback to watchlist only
      if (error.message?.includes('portfolio_positions')) {
        console.log('[PriceService] portfolio_positions not found, using watchlist only');
        const query = isPostgres
          ? 'SELECT DISTINCT c.id, c.symbol, c.country FROM watchlist w JOIN companies c ON w.company_id = c.id'
          : 'SELECT DISTINCT c.id, c.symbol, c.country FROM watchlist w JOIN companies c ON w.company_id = c.id';
        const result = await db.query(query);
        stocks = result.rows || result;
      } else {
        throw error;
      }
    }

    if (stocks.length === 0) {
      await onProgress?.(100, 'No tracked stocks to update');
      return { itemsTotal: 0, itemsProcessed: 0, itemsUpdated: 0, itemsFailed: 0 };
    }

    console.log(`[PriceService] Updating ${stocks.length} tracked stocks`);
    await onProgress?.(10, `Updating ${stocks.length} tracked stocks...`);

    let successful = 0;
    let failed = 0;

    for (const stock of stocks) {
      const yahooSym = this.getYahooSymbol(stock.symbol, stock.country);
      if (!yahooSym) {
        failed++;
        continue;
      }

      try {
        const priceData = await this.fetchPrices([yahooSym], 1);
        const prices = priceData.get(yahooSym);

        if (prices && prices.length > 0) {
          const quote = await this.fetchQuote(yahooSym);
          await this.upsertPrices(db, stock.id, prices, quote);
          successful++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      const progress = 10 + Math.floor(((successful + failed) / stocks.length) * 85);
      await onProgress?.(progress, `Updated ${successful}/${stocks.length}...`);
    }

    await onProgress?.(100, `Intraday update complete: ${successful} updated`);

    return {
      itemsTotal: stocks.length,
      itemsProcessed: successful + failed,
      itemsUpdated: successful,
      itemsFailed: failed
    };
  }
}

// Singleton
let instance = null;

function getPriceService() {
  if (!instance) {
    instance = new PriceService();
  }
  return instance;
}

module.exports = {
  PriceService,
  getPriceService
};
