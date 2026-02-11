// src/services/updates/bundles/fundamentalsBundle.js
/**
 * Fundamentals Update Bundle
 *
 * Handles all fundamental data update jobs:
 * - fundamentals.quarterly - Quarterly SEC filing updates
 * - fundamentals.metrics - Financial metrics recalculation
 * - fundamentals.ratios - Ratio calculations
 */

const path = require('path');
const { spawn } = require('child_process');
const { getDatabaseAsync } = require('../../../lib/db');

class FundamentalsBundle {
  constructor() {
    this.projectRoot = path.join(__dirname, '../../../..');
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'fundamentals.quarterly':
        return this.runQuarterlyUpdate(db, onProgress);
      case 'fundamentals.metrics':
        return this.runMetricsUpdate(db, onProgress);
      case 'fundamentals.ratios':
        return this.runRatiosUpdate(db, onProgress);
      default:
        throw new Error(`Unknown fundamentals job: ${jobKey}`);
    }
  }

  async runQuarterlyUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting quarterly fundamentals update...');

    // Get companies that need updating (no recent financial data)
    const result = await database.query(`
      SELECT c.id, c.symbol, c.cik
      FROM companies c
      WHERE c.cik IS NOT NULL
      AND (
        c.id NOT IN (
          SELECT DISTINCT company_id FROM financial_data
          WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
        )
        OR c.id IN (
          SELECT company_id FROM update_queue
          WHERE job_key = 'fundamentals.quarterly' AND status = 'pending'
        )
      )
      ORDER BY c.market_cap DESC NULLS LAST
      LIMIT 50
    `);
    const companies = result.rows;

    await onProgress(10, `Found ${companies.length} companies to update`);

    let processed = 0;
    let updated = 0;
    let failed = 0;

    for (const company of companies) {
      try {
        // Call SEC refresh for this company
        await this.refreshCompanyFundamentals(company.cik);
        updated++;
      } catch (error) {
        console.error(`Error updating ${company.symbol}:`, error.message);
        failed++;
      }

      processed++;
      const progress = 10 + Math.round((processed / companies.length) * 85);
      await onProgress(progress, `Processed ${processed}/${companies.length} companies`);
    }

    await onProgress(100, 'Quarterly update complete');

    return {
      itemsTotal: companies.length,
      itemsProcessed: processed,
      itemsUpdated: updated,
      itemsFailed: failed
    };
  }

  async runMetricsUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting metrics recalculation...');

    // Get companies with financial data
    const result = await database.query(`
      SELECT DISTINCT c.id, c.symbol
      FROM companies c
      JOIN financial_data f ON f.company_id = c.id
      WHERE f.updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      ORDER BY c.market_cap DESC NULLS LAST
    `);
    const companies = result.rows;

    await onProgress(10, `Recalculating metrics for ${companies.length} companies`);

    let processed = 0;
    let updated = 0;

    // Import metric calculator
    const metricCalculator = require('../../../services/metricCalculator');

    for (const company of companies) {
      try {
        await metricCalculator.calculateAllMetrics(company.id);
        updated++;
      } catch (error) {
        console.error(`Error calculating metrics for ${company.symbol}:`, error.message);
      }

      processed++;
      const progress = 10 + Math.round((processed / companies.length) * 85);
      await onProgress(progress, `Processed ${processed}/${companies.length}`);
    }

    await onProgress(100, 'Metrics recalculation complete');

    return {
      itemsTotal: companies.length,
      itemsProcessed: processed,
      itemsUpdated: updated,
      itemsFailed: companies.length - updated
    };
  }

  async runRatiosUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting ratios calculation...');

    // Get companies with price and fundamental data
    const result = await database.query(`
      SELECT DISTINCT c.id, c.symbol
      FROM companies c
      WHERE c.id IN (SELECT company_id FROM financial_data)
      AND c.id IN (SELECT company_id FROM stock_prices WHERE date > CURRENT_DATE - INTERVAL '7 days')
      ORDER BY c.market_cap DESC NULLS LAST
      LIMIT 500
    `);
    const companies = result.rows;

    await onProgress(10, `Calculating ratios for ${companies.length} companies`);

    let processed = 0;
    let updated = 0;

    for (const company of companies) {
      try {
        // Calculate key ratios
        await this.calculateCompanyRatios(db, company.id);
        updated++;
      } catch (error) {
        console.error(`Error calculating ratios for ${company.symbol}:`, error.message);
      }

      processed++;
      if (processed % 50 === 0) {
        const progress = 10 + Math.round((processed / companies.length) * 85);
        await onProgress(progress, `Processed ${processed}/${companies.length}`);
      }
    }

    await onProgress(100, 'Ratios calculation complete');

    return {
      itemsTotal: companies.length,
      itemsProcessed: processed,
      itemsUpdated: updated,
      itemsFailed: companies.length - updated
    };
  }

  async refreshCompanyFundamentals(cik) {
    return new Promise((resolve, reject) => {
      const script = path.join(this.projectRoot, 'src/jobs/secDirectRefresh.js');
      const child = spawn('node', [script, '--cik', cik], {
        cwd: this.projectRoot,
        stdio: 'pipe',
        timeout: 60000
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

  async calculateCompanyRatios(db, companyId) {
    const database = await getDatabaseAsync();

    // Get latest financial data
    const financialResult = await database.query(`
      SELECT
        total_revenue,
        net_income,
        total_assets,
        total_liabilities,
        shareholders_equity,
        operating_cash_flow
      FROM financial_data
      WHERE company_id = $1 AND statement_type = 'income_statement'
      ORDER BY fiscal_date_ending DESC
      LIMIT 1
    `, [companyId]);

    const financial = financialResult.rows[0];
    if (!financial) return;

    // Get latest price data
    const priceResult = await database.query(`
      SELECT close_price, market_cap
      FROM stock_prices
      WHERE company_id = $1
      ORDER BY date DESC
      LIMIT 1
    `, [companyId]);

    const price = priceResult.rows[0];
    if (!price || !price.market_cap) return;

    // Calculate and store ratios
    const ratios = {};

    if (financial.net_income && price.market_cap) {
      ratios.pe_ratio = price.market_cap / financial.net_income;
    }

    if (financial.total_revenue && price.market_cap) {
      ratios.ps_ratio = price.market_cap / financial.total_revenue;
    }

    if (financial.shareholders_equity && price.market_cap) {
      ratios.pb_ratio = price.market_cap / financial.shareholders_equity;
    }

    if (financial.net_income && financial.shareholders_equity) {
      ratios.roe = financial.net_income / financial.shareholders_equity;
    }

    if (financial.net_income && financial.total_assets) {
      ratios.roa = financial.net_income / financial.total_assets;
    }

    // Update company metrics
    await database.query(`
      UPDATE companies
      SET
        pe_ratio = $1,
        ps_ratio = $2,
        pb_ratio = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [ratios.pe_ratio || null, ratios.ps_ratio || null, ratios.pb_ratio || null, companyId]);
  }
}

const fundamentalsBundle = new FundamentalsBundle();

module.exports = {
  execute: (jobKey, db, context) => fundamentalsBundle.execute(jobKey, db, context)
};
