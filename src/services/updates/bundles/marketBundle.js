// src/services/updates/bundles/marketBundle.js
/**
 * Market Data Update Bundle
 *
 * Handles all market-wide data update jobs:
 * - market.indices - Major index data updates
 * - market.sectors - Sector performance data
 * - market.calendar - Earnings and economic calendar
 */

const path = require('path');
const { getDatabaseAsync } = require('../../../lib/db');

// FMP API rate limiting: 300 req/min for most plans, be conservative
const FMP_RATE_LIMIT_MS = 250;

class MarketBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
    this.lastFmpRequest = 0;
  }

  /**
   * Rate limit FMP API requests
   */
  async rateLimitFMP() {
    const now = Date.now();
    const elapsed = now - this.lastFmpRequest;
    if (elapsed < FMP_RATE_LIMIT_MS) {
      await new Promise(resolve => setTimeout(resolve, FMP_RATE_LIMIT_MS - elapsed));
    }
    this.lastFmpRequest = Date.now();
  }

  /**
   * Check if FMP API key is configured
   */
  checkFmpApiKey() {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      return { available: false, reason: 'FMP_API_KEY environment variable not set' };
    }
    return { available: true, apiKey };
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'market.indices':
        return this.runIndicesUpdate(db, onProgress);
      case 'market.sectors':
        return this.runSectorsUpdate(db, onProgress);
      case 'market.calendar':
        return this.runCalendarUpdate(db, onProgress);
      case 'market.economic':
        return this.runEconomicUpdate(db, onProgress);
      default:
        throw new Error(`Unknown market job: ${jobKey}`);
    }
  }

  async runIndicesUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting index data update...');

    try {
      // Import index service
      const indexService = require('../../../services/indexService');

      await onProgress(10, 'Fetching major indices...');

      const indices = ['SPY', 'QQQ', 'DIA', 'IWM', 'VTI'];
      let updated = 0;
      let failed = 0;

      for (let i = 0; i < indices.length; i++) {
        const symbol = indices[i];
        try {
          await indexService.updateIndexData(symbol);
          updated++;
        } catch (error) {
          console.error(`Error updating index ${symbol}:`, error.message);
          failed++;
        }

        const progress = 10 + Math.round(((i + 1) / indices.length) * 85);
        await onProgress(progress, `Updated ${symbol}`);
      }

      await onProgress(100, 'Index update complete');

      return {
        itemsTotal: indices.length,
        itemsProcessed: indices.length,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      throw error;
    }
  }

  async runSectorsUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting sector performance update...');

    // Check for FMP API key
    const fmpCheck = this.checkFmpApiKey();
    if (!fmpCheck.available) {
      console.warn(`[market.sectors] Skipped: ${fmpCheck.reason}`);
      await onProgress(100, `Skipped: ${fmpCheck.reason}`);
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        skipped: true,
        reason: fmpCheck.reason
      };
    }

    try {
      // Get sector ETFs
      const sectorETFs = [
        { symbol: 'XLK', sector: 'Technology' },
        { symbol: 'XLF', sector: 'Financials' },
        { symbol: 'XLV', sector: 'Healthcare' },
        { symbol: 'XLE', sector: 'Energy' },
        { symbol: 'XLI', sector: 'Industrials' },
        { symbol: 'XLY', sector: 'Consumer Discretionary' },
        { symbol: 'XLP', sector: 'Consumer Staples' },
        { symbol: 'XLU', sector: 'Utilities' },
        { symbol: 'XLB', sector: 'Materials' },
        { symbol: 'XLRE', sector: 'Real Estate' },
        { symbol: 'XLC', sector: 'Communication Services' }
      ];

      await onProgress(10, `Updating ${sectorETFs.length} sector ETFs...`);

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < sectorETFs.length; i++) {
        const etf = sectorETFs[i];
        try {
          // Get latest price for sector ETF
          const priceData = await this.fetchSectorPrice(etf.symbol);

          if (priceData) {
            // Update index_prices table with sector ETF data
            await database.query(`
              INSERT INTO index_prices (
                symbol, name, index_type,
                last_price, last_price_date, change_1d, updated_at
              ) VALUES ($1, $2, 'sector', $3, CURRENT_DATE, $4, CURRENT_TIMESTAMP)
              ON CONFLICT (symbol) DO UPDATE SET
                name = EXCLUDED.name,
                last_price = EXCLUDED.last_price,
                last_price_date = EXCLUDED.last_price_date,
                change_1d = EXCLUDED.change_1d,
                updated_at = EXCLUDED.updated_at
            `, [
              etf.symbol,
              etf.sector,
              priceData.close,
              priceData.changePercent
            ]);
            updated++;
          }
        } catch (error) {
          console.error(`Error updating sector ${etf.sector}:`, error.message);
          failed++;
        }

        const progress = 10 + Math.round(((i + 1) / sectorETFs.length) * 85);
        await onProgress(progress, `Updated ${etf.sector}`);
      }

      await onProgress(100, 'Sector update complete');

      return {
        itemsTotal: sectorETFs.length,
        itemsProcessed: sectorETFs.length,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      throw error;
    }
  }

  async runCalendarUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting calendar update...');

    // Check for FMP API key
    const fmpCheck = this.checkFmpApiKey();
    if (!fmpCheck.available) {
      console.warn(`[market.calendar] Skipped: ${fmpCheck.reason}`);
      await onProgress(100, `Skipped: ${fmpCheck.reason}`);
      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0,
        skipped: true,
        reason: fmpCheck.reason
      };
    }

    try {
      await onProgress(10, 'Fetching earnings calendar...');

      // Get upcoming earnings from FMP or other source
      const earningsData = await this.fetchEarningsCalendar();

      if (earningsData && earningsData.length > 0) {
        await onProgress(50, `Processing ${earningsData.length} earnings events...`);

        let inserted = 0;
        for (const event of earningsData) {
          try {
            await database.query(`
              INSERT INTO earnings_calendar (
                symbol, company_name, report_date, fiscal_quarter,
                eps_estimate, revenue_estimate, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
              ON CONFLICT (symbol, report_date) DO UPDATE SET
              company_name = $2,
              fiscal_quarter = $4,
              eps_estimate = $5,
              revenue_estimate = $6,
              updated_at = CURRENT_TIMESTAMP
            `, [
              event.symbol,
              event.companyName,
              event.date,
              event.fiscalQuarter,
              event.epsEstimate,
              event.revenueEstimate
            ]);
            inserted++;
          } catch (err) {
            // Ignore duplicate errors
          }
        }

        await onProgress(100, 'Calendar update complete');

        return {
          itemsTotal: earningsData.length,
          itemsProcessed: earningsData.length,
          itemsUpdated: inserted,
          itemsFailed: earningsData.length - inserted
        };
      }

      await onProgress(100, 'No calendar data available');

      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update economic indicators (GDP, rates, etc.) from FRED
   */
  async runEconomicUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting economic indicators update...');

    try {
      // Check if FREDService is available
      let fredService;
      try {
        const { FREDService } = require('../../../services/dataProviders/fredService');
        fredService = new FREDService();
      } catch (error) {
        console.warn('FREDService not available:', error.message);
        await onProgress(100, 'Economic update skipped - FREDService not available');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          skipped: true,
          reason: 'FREDService not available'
        };
      }

      // Key economic indicators to fetch
      const indicators = [
        { series: 'GDP', name: 'US GDP' },
        { series: 'CPIAUCSL', name: 'CPI' },
        { series: 'UNRATE', name: 'Unemployment Rate' },
        { series: 'FEDFUNDS', name: 'Federal Funds Rate' },
        { series: 'DGS10', name: '10-Year Treasury' },
        { series: 'DGS2', name: '2-Year Treasury' },
        { series: 'VIXCLS', name: 'VIX' }
      ];

      await onProgress(10, `Fetching ${indicators.length} economic indicators from FRED...`);

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < indicators.length; i++) {
        const indicator = indicators[i];
        try {
          await fredService.updateSeries(indicator.series);
          updated++;
        } catch (error) {
          console.error(`Error fetching ${indicator.name}:`, error.message);
          failed++;
        }

        const progress = 10 + Math.round(((i + 1) / indicators.length) * 85);
        await onProgress(progress, `Updated ${indicator.name}`);
      }

      await onProgress(100, 'Economic indicators update complete');

      return {
        itemsTotal: indicators.length,
        itemsProcessed: indicators.length,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      throw error;
    }
  }

  async fetchSectorPrice(symbol) {
    try {
      const apiKey = process.env.FMP_API_KEY;
      if (!apiKey) {
        return null;
      }

      // Rate limit FMP API calls
      await this.rateLimitFMP();

      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data && data[0]) {
        return {
          close: data[0].price,
          changePercent: data[0].changesPercentage,
          volume: data[0].volume
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error.message);
      return null;
    }
  }

  async fetchEarningsCalendar() {
    try {
      const apiKey = process.env.FMP_API_KEY;
      if (!apiKey) {
        return [];
      }

      // Rate limit FMP API calls
      await this.rateLimitFMP();

      // Get next 30 days of earnings
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 30);

      const fromStr = today.toISOString().split('T')[0];
      const toStr = endDate.toISOString().split('T')[0];

      const response = await fetch(
        `https://financialmodelingprep.com/api/v3/earning_calendar?from=${fromStr}&to=${toStr}&apikey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching earnings calendar:', error.message);
      return [];
    }
  }
}

const marketBundle = new MarketBundle();

module.exports = {
  execute: (jobKey, db, context) => marketBundle.execute(jobKey, db, context)
};
