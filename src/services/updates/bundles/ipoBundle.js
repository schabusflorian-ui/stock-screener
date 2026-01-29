// src/services/updates/bundles/ipoBundle.js
/**
 * IPO Tracker Update Bundle
 *
 * Handles all IPO-related update jobs:
 * - ipo.sync_trading_companies - Create company records for trading IPOs without company_id
 * - ipo.check_status - Check and update IPO status based on trading dates
 */

class IPOBundle {
  constructor() {
    this.ipoTracker = null;
  }

  getIPOTracker() {
    if (!this.ipoTracker) {
      const IPOTracker = require('../../ipoTracker');
      this.ipoTracker = new IPOTracker();
    }
    return this.ipoTracker;
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'ipo.sync_trading_companies':
        return this.syncTradingCompanies(db, onProgress);
      case 'ipo.check_status':
        return this.checkIPOStatus(db, onProgress);
      default:
        throw new Error(`Unknown IPO job: ${jobKey}`);
    }
  }

  /**
   * Sync Trading IPOs - Create company records for trading IPOs without company_id
   * This handles cases where EU/UK IPOs started trading but company wasn't created
   */
  async syncTradingCompanies(db, onProgress) {
    await onProgress(5, 'Finding trading IPOs without company records...');

    try {
      // Get all trading IPOs without company_id
      const tradingIPOs = db.prepare(`
        SELECT * FROM ipo_tracker
        WHERE status = 'TRADING'
          AND (company_id IS NULL OR company_id = 0)
          AND (ticker_final IS NOT NULL OR ticker_proposed IS NOT NULL OR isin IS NOT NULL)
      `).all();

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

      const tracker = this.getIPOTracker();
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
          const existingByTicker = db.prepare(`
            SELECT id FROM companies WHERE LOWER(symbol) = LOWER(?)
          `).get(ticker);

          if (existingByTicker) {
            // Link to existing company
            db.prepare('UPDATE ipo_tracker SET company_id = ? WHERE id = ?').run(existingByTicker.id, ipo.id);
            linked++;
            console.log(`  Linked IPO ${ipo.company_name} to existing company ${ticker}`);
          } else {
            // Also check by ISIN if available
            let existingByIsin = null;
            if (ipo.isin) {
              existingByIsin = db.prepare(`
                SELECT id FROM companies WHERE isin = ?
              `).get(ipo.isin);
            }

            if (existingByIsin) {
              db.prepare('UPDATE ipo_tracker SET company_id = ? WHERE id = ?').run(existingByIsin.id, ipo.id);
              linked++;
              console.log(`  Linked IPO ${ipo.company_name} to existing company by ISIN`);
            } else {
              // Create new company
              const exchange = ipo.exchange_final || ipo.exchange_proposed || ipo.listing_venue || 'UNKNOWN';
              const country = ipo.headquarters_country ||
                (ipo.region === 'US' ? 'US' : null) ||
                ipo.home_member_state ||
                (ipo.isin ? ipo.isin.substring(0, 2) : 'XX');

              const result = db.prepare(`
                INSERT INTO companies (symbol, name, sector, industry, exchange, country, is_active, cik, isin)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
              `).run(
                ticker,
                ipo.company_name,
                ipo.sector || null,
                ipo.industry || null,
                exchange,
                country,
                ipo.cik || null,
                ipo.isin || null
              );

              const companyId = result.lastInsertRowid;
              db.prepare('UPDATE ipo_tracker SET company_id = ? WHERE id = ?').run(companyId, ipo.id);
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
  async checkIPOStatus(db, onProgress) {
    await onProgress(5, 'Checking IPO statuses...');

    try {
      const today = new Date().toISOString().split('T')[0];

      // Find IPOs that should have started trading
      const shouldBeTrading = db.prepare(`
        SELECT * FROM ipo_tracker
        WHERE status IN ('PRICED', 'APPROVED', 'EXPECTED')
          AND (
            expected_trade_date <= ?
            OR first_trade_date <= ?
            OR pricing_date <= ?
          )
      `).all(today, today, today);

      await onProgress(10, `Found ${shouldBeTrading.length} IPOs to check`);

      let processed = 0;
      let updated = 0;
      let failed = 0;

      const tracker = this.getIPOTracker();

      for (const ipo of shouldBeTrading) {
        processed++;

        try {
          // Update to TRADING status
          db.prepare(`
            UPDATE ipo_tracker
            SET status = 'TRADING',
                first_trade_date = COALESCE(first_trade_date, ?),
                updated_at = datetime('now')
            WHERE id = ?
          `).run(today, ipo.id);

          // Try to create/link company
          const updatedIpo = db.prepare('SELECT * FROM ipo_tracker WHERE id = ?').get(ipo.id);
          if (updatedIpo && !updatedIpo.company_id) {
            tracker.ensureCompanyExists(updatedIpo);
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
  execute: (jobKey, db, context) => ipoBundle.execute(jobKey, db, context)
};
