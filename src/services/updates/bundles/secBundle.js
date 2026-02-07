// src/services/updates/bundles/secBundle.js
/**
 * SEC Filing Update Bundle
 *
 * Handles all SEC-related update jobs:
 * - sec.filings - Check for new 10-K/10-Q filings
 * - sec.insider - Insider trading updates (Form 4)
 * - sec.13f - Institutional holdings (13F)
 */

const path = require('path');
const { spawn } = require('child_process');
const { getDatabaseAsync } = require('../../../database');

class SECBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'sec.filings':
        return this.runFilingsCheck(db, onProgress);
      case 'sec.insider':
        return this.runInsiderUpdate(db, onProgress);
      case 'sec.13f':
        return this.run13FUpdate(db, onProgress);
      default:
        throw new Error(`Unknown SEC job: ${jobKey}`);
    }
  }

  async runFilingsCheck(db, onProgress) {
    await onProgress(5, 'Starting SEC filings check...');

    try {
      // Run the SEC direct refresh script
      await onProgress(10, 'Checking for new filings...');

      const result = await this.runSecRefreshScript();

      await onProgress(100, 'SEC filings check complete');

      // Parse results from script output if possible
      const stats = this.parseScriptOutput(result);

      return {
        itemsTotal: stats.total || 0,
        itemsProcessed: stats.processed || 0,
        itemsUpdated: stats.updated || 0,
        itemsFailed: stats.failed || 0
      };
    } catch (error) {
      throw error;
    }
  }

  async runInsiderUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting insider trading update...');

    try {
      // Get companies to check for insider trading
      const result = await database.query(`
        SELECT c.id, c.symbol, c.cik
        FROM companies c
        WHERE c.cik IS NOT NULL
        AND c.market_cap > 1000000000
        ORDER BY c.market_cap DESC
        LIMIT 100
      `);
      const companies = result.rows;

      await onProgress(10, `Checking insider trades for ${companies.length} companies...`);

      let processed = 0;
      let updated = 0;
      let failed = 0;

      for (const company of companies) {
        try {
          const trades = await this.fetchInsiderTrades(company.symbol);

          if (trades && trades.length > 0) {
            for (const trade of trades) {
              try {
                await database.query(`
                  INSERT INTO insider_trades (
                    company_id, symbol, filing_date, transaction_date,
                    owner_name, owner_title, transaction_type,
                    shares, price_per_share, total_value, created_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
                  ON CONFLICT (company_id, symbol, filing_date, transaction_date) DO NOTHING
                `, [
                  company.id,
                  company.symbol,
                  trade.filingDate,
                  trade.transactionDate,
                  trade.reportingName,
                  trade.typeOfOwner,
                  trade.transactionType,
                  trade.securitiesTransacted,
                  trade.price,
                  trade.securitiesTransacted * (trade.price || 0)
                ]);
              } catch (e) {
                // Ignore duplicate entries
              }
            }
            updated++;
          }
        } catch (error) {
          console.error(`Error fetching insider trades for ${company.symbol}:`, error.message);
          failed++;
        }

        processed++;
        if (processed % 10 === 0) {
          const progress = 10 + Math.round((processed / companies.length) * 85);
          await onProgress(progress, `Processed ${processed}/${companies.length} companies`);
        }

        // Rate limiting
        await this.sleep(200);
      }

      await onProgress(100, 'Insider trading update complete');

      return {
        itemsTotal: companies.length,
        itemsProcessed: processed,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      throw error;
    }
  }

  async run13FUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting 13F institutional holdings update...');

    try {
      // Run the 13F refresh job
      const Investor13FRefresh = require('../../../jobs/investor13FRefresh');
      const refresher = new Investor13FRefresh();

      await onProgress(10, 'Fetching institutional holdings...');

      // Get tracked investors
      const result = await database.query(`
        SELECT id, name, cik
        FROM famous_investors
        WHERE cik IS NOT NULL AND active = true
        ORDER BY aum DESC
        LIMIT 50
      `);
      const investors = result.rows;

      let updated = 0;
      let failed = 0;

      for (let i = 0; i < investors.length; i++) {
        const investor = investors[i];
        try {
          await refresher.refreshInvestor(investor.cik);
          updated++;
        } catch (error) {
          console.error(`Error updating 13F for ${investor.name}:`, error.message);
          failed++;
        }

        const progress = 10 + Math.round(((i + 1) / investors.length) * 85);
        await onProgress(progress, `Processed ${investor.name}`);

        // Rate limiting for SEC EDGAR
        await this.sleep(500);
      }

      await onProgress(100, '13F update complete');

      return {
        itemsTotal: investors.length,
        itemsProcessed: investors.length,
        itemsUpdated: updated,
        itemsFailed: failed
      };
    } catch (error) {
      // 13F refresh module may not exist
      console.error('13F update error:', error.message);
      await onProgress(100, '13F update skipped - module not available');

      return {
        itemsTotal: 0,
        itemsProcessed: 0,
        itemsUpdated: 0,
        itemsFailed: 0
      };
    }
  }

  runSecRefreshScript() {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'src/jobs/secDirectRefresh.js');
      const child = spawn('node', [script], {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });

      let output = '';
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { output += data.toString(); });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`SEC refresh failed with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  parseScriptOutput(output) {
    // Try to extract stats from script output
    const stats = { total: 0, processed: 0, updated: 0, failed: 0 };

    try {
      const totalMatch = output.match(/Total:\s*(\d+)/i);
      const processedMatch = output.match(/Processed:\s*(\d+)/i);
      const updatedMatch = output.match(/Updated:\s*(\d+)/i);
      const failedMatch = output.match(/Failed:\s*(\d+)/i);

      if (totalMatch) stats.total = parseInt(totalMatch[1]);
      if (processedMatch) stats.processed = parseInt(processedMatch[1]);
      if (updatedMatch) stats.updated = parseInt(updatedMatch[1]);
      if (failedMatch) stats.failed = parseInt(failedMatch[1]);
    } catch (e) {
      // Ignore parsing errors
    }

    return stats;
  }

  async fetchInsiderTrades(symbol) {
    try {
      const apiKey = process.env.FMP_API_KEY;
      if (!apiKey) {
        return [];
      }

      const response = await fetch(
        `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${symbol}&limit=20&apikey=${apiKey}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching insider trades for ${symbol}:`, error.message);
      return [];
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const secBundle = new SECBundle();

module.exports = {
  execute: (jobKey, db, context) => secBundle.execute(jobKey, db, context)
};
