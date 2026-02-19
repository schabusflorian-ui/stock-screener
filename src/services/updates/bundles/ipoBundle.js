// src/services/updates/bundles/ipoBundle.js
/**
 * IPO Tracker Update Bundle
 *
 * Handles all IPO-related update jobs:
 * - ipo.scan - Scan SEC for new S-1 filings (US IPOs)
 * - ipo.scan_eu - Scan ESMA/FCA for new prospectuses (EU/UK IPOs)
 * - ipo.sync_trading_companies - Create company records for trading IPOs without company_id
 * - ipo.check_status - Check and update IPO status based on trading dates
 */

const { getDatabaseAsync } = require('../../../lib/db');
const { IPOTracker } = require('../../ipoTracker');

class IPOBundle {
  constructor() {
    this.ipoTracker = null;
    this.lastDatabase = null;
  }

  getIPOTracker(database) {
    // Create new instance if database changed or not yet created
    if (!this.ipoTracker || this.lastDatabase !== database) {
      this.ipoTracker = new IPOTracker(database);
      this.lastDatabase = database;
    }
    return this.ipoTracker;
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;
    const database = await getDatabaseAsync();

    switch (jobKey) {
      case 'ipo.scan':
        return this.scanForNewIPOs(database, onProgress);
      case 'ipo.scan_eu':
        return this.scanForEUIPOs(database, onProgress);
      case 'ipo.sync_trading_companies':
        return this.syncTradingCompanies(database, onProgress);
      case 'ipo.check_status':
        return this.checkIPOStatus(database, onProgress);
      default:
        throw new Error(`Unknown IPO job: ${jobKey}`);
    }
  }

  /**
   * Scan SEC for new S-1 filings (US IPOs)
   * This is the main job that discovers new IPOs
   */
  async scanForNewIPOs(database, onProgress) {
    await onProgress(5, 'Scanning SEC for new IPO filings...');

    try {
      const tracker = this.getIPOTracker(database);

      await onProgress(10, 'Fetching recent S-1 filings from SEC EDGAR...');

      // Call the IPOTracker's checkForNewFilings method
      const results = await tracker.checkForNewFilings();

      await onProgress(100, `Scan complete: ${results.newIPOs.length} new, ${results.updates.length} updated`);

      return {
        itemsTotal: results.newIPOs.length + results.updates.length,
        itemsProcessed: results.newIPOs.length + results.updates.length,
        itemsUpdated: results.newIPOs.length,
        itemsFailed: results.errors.length,
        metadata: {
          newIPOs: results.newIPOs.length,
          updates: results.updates.length,
          errors: results.errors.slice(0, 10)
        }
      };
    } catch (error) {
      console.error('Error in scanForNewIPOs:', error);
      throw error;
    }
  }

  /**
   * Scan ESMA/FCA for new EU/UK prospectuses
   */
  async scanForEUIPOs(database, onProgress) {
    await onProgress(5, 'Scanning EU/UK regulatory sources for new IPOs...');

    try {
      const tracker = this.getIPOTracker(database);

      await onProgress(10, 'Fetching from ESMA and FCA...');

      // Call the IPOTracker's checkForEUFilings method
      const results = await tracker.checkForEUFilings({ days: 30 });

      await onProgress(100, `EU/UK scan complete: ${results.newIPOs} new IPOs found`);

      return {
        itemsTotal: results.updates || 0,
        itemsProcessed: results.updates || 0,
        itemsUpdated: results.newIPOs || 0,
        itemsFailed: results.errors?.length || 0,
        metadata: {
          newIPOs: results.newIPOs,
          skipped: results.skipped,
          sources: results.sources,
          duration: results.duration
        }
      };
    } catch (error) {
      console.error('Error in scanForEUIPOs:', error);
      throw error;
    }
  }

  /**
   * Sync Trading IPOs - Create company records for trading IPOs without company_id
   * This handles cases where EU/UK IPOs started trading but company wasn't created
   */
  async syncTradingCompanies(database, onProgress) {
    await onProgress(5, 'Finding trading IPOs without company records...');

    try {
      // Get all trading IPOs without company_id
      const result = await database.query(`
        SELECT * FROM ipo_tracker
        WHERE status = 'TRADING'
          AND (company_id IS NULL OR company_id = 0)
          AND (ticker_final IS NOT NULL OR ticker_proposed IS NOT NULL OR isin IS NOT NULL)
      `);
      const tradingIPOs = result.rows;

      await onProgress(10, `Found ${tradingIPOs.length} trading IPOs needing company sync`);

      if (tradingIPOs.length === 0) {
        await onProgress(100, 'No IPOs need syncing');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0
        };
      }

      const tracker = this.getIPOTracker(database);
      let processed = 0;
      let created = 0;
      let linked = 0;
      let failed = 0;
      const errors = [];

      for (const ipo of tradingIPOs) {
        processed++;

        try {
          // Try standard ticker first
          let ticker = ipo.ticker_final || ipo.ticker_proposed;

          // For EU/UK IPOs without ticker, try to generate one
          if (!ticker && ipo.isin) {
            // Use ISIN prefix as temporary identifier (e.g., "SE0021309689" -> "SE0021")
            ticker = ipo.isin.substring(0, 6);
          }

          if (!ticker && ipo.company_name) {
            // Generate ticker from company name (first 5 uppercase chars)
            ticker = ipo.company_name.replace(/[^A-Za-z]/g, '').substring(0, 5).toUpperCase();
          }

          if (!ticker) {
            errors.push({ ipoId: ipo.id, company: ipo.company_name, error: 'No ticker could be determined' });
            failed++;
            continue;
          }

          // Check if company already exists by ticker
          const existingByTickerResult = await database.query(`
            SELECT id FROM companies WHERE LOWER(symbol) = LOWER($1)
          `, [ticker]);
          const existingByTicker = existingByTickerResult.rows[0];

          if (existingByTicker) {
            // Link to existing company
            await database.query('UPDATE ipo_tracker SET company_id = $1 WHERE id = $2', [existingByTicker.id, ipo.id]);
            linked++;
            console.log(`  Linked IPO ${ipo.company_name} to existing company ${ticker}`);
          } else {
            // Also check by ISIN if available
            let existingByIsin = null;
            if (ipo.isin) {
              const existingByIsinResult = await database.query(`
                SELECT id FROM companies WHERE isin = $1
              `, [ipo.isin]);
              existingByIsin = existingByIsinResult.rows[0];
            }

            if (existingByIsin) {
              await database.query('UPDATE ipo_tracker SET company_id = $1 WHERE id = $2', [existingByIsin.id, ipo.id]);
              linked++;
              console.log(`  Linked IPO ${ipo.company_name} to existing company by ISIN`);
            } else {
              // Create new company
              const exchange = ipo.exchange_final || ipo.exchange_proposed || ipo.listing_venue || 'UNKNOWN';
              const country = ipo.headquarters_country ||
                (ipo.region === 'US' ? 'US' : null) ||
                ipo.home_member_state ||
                (ipo.isin ? ipo.isin.substring(0, 2) : 'XX');

              const insertResult = await database.query(`
                INSERT INTO companies (symbol, name, sector, industry, exchange, country, is_active, cik, isin)
                VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
                RETURNING id
              `, [
                ticker,
                ipo.company_name,
                ipo.sector || null,
                ipo.industry || null,
                exchange,
                country,
                ipo.cik || null,
                ipo.isin || null
              ]);

              const companyId = insertResult.rows[0].id;
              await database.query('UPDATE ipo_tracker SET company_id = $1 WHERE id = $2', [companyId, ipo.id]);
              created++;
              console.log(`  Created company ${ticker} (id: ${companyId}) for IPO ${ipo.company_name}`);
            }
          }
        } catch (error) {
          errors.push({ ipoId: ipo.id, company: ipo.company_name, error: error.message });
          failed++;
          console.error(`  Error syncing IPO ${ipo.company_name}: ${error.message}`);
        }

        // Update progress
        const progress = 10 + Math.round((processed / tradingIPOs.length) * 85);
        await onProgress(progress, `Processed ${processed}/${tradingIPOs.length} IPOs`);

        // Small delay to prevent overwhelming DB
        await this.sleep(50);
      }

      await onProgress(100, `Sync complete: ${created} created, ${linked} linked, ${failed} failed`);

      return {
        itemsTotal: tradingIPOs.length,
        itemsProcessed: processed,
        itemsUpdated: created + linked,
        itemsSkipped: 0,
        itemsFailed: failed,
        metadata: {
          created,
          linked,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Include first 10 errors
        }
      };
    } catch (error) {
      console.error('Error in syncTradingCompanies:', error);
      throw error;
    }
  }

  /**
   * Check IPO Status - Update status based on expected trading dates
   */
  async checkIPOStatus(database, onProgress) {
    await onProgress(5, 'Checking IPO statuses...');

    try {
      const today = new Date().toISOString().split('T')[0];

      // Find IPOs that should have started trading
      const result = await database.query(`
        SELECT * FROM ipo_tracker
        WHERE status IN ('PRICED', 'APPROVED', 'EXPECTED')
          AND (
            trading_date <= $1
            OR pricing_date <= $1
          )
      `, [today]);
      const shouldBeTrading = result.rows;

      await onProgress(10, `Found ${shouldBeTrading.length} IPOs to check`);

      let processed = 0;
      let updated = 0;
      let failed = 0;

      const tracker = this.getIPOTracker(database);

      for (const ipo of shouldBeTrading) {
        processed++;

        try {
          // Update to TRADING status
          await database.query(`
            UPDATE ipo_tracker
            SET status = 'TRADING',
                trading_date = COALESCE(trading_date, $1),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [today, ipo.id]);

          // Try to create/link company
          const updatedIpoResult = await database.query('SELECT * FROM ipo_tracker WHERE id = $1', [ipo.id]);
          const updatedIpo = updatedIpoResult.rows[0];
          if (updatedIpo && !updatedIpo.company_id) {
            await tracker.ensureCompanyExists(updatedIpo);
          }

          updated++;
          console.log(`  Updated IPO ${ipo.company_name} to TRADING status`);
        } catch (error) {
          failed++;
          console.error(`  Error updating IPO ${ipo.company_name}: ${error.message}`);
        }

        const progress = 10 + Math.round((processed / shouldBeTrading.length) * 85);
        await onProgress(progress, `Checked ${processed}/${shouldBeTrading.length} IPOs`);
      }

      await onProgress(100, `Status check complete: ${updated} updated, ${failed} failed`);

      return {
        itemsTotal: shouldBeTrading.length,
        itemsProcessed: processed,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      console.error('Error in checkIPOStatus:', error);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const ipoBundle = new IPOBundle();

module.exports = {
  execute: async (jobKey, db, context) => ipoBundle.execute(jobKey, db, context)
};
