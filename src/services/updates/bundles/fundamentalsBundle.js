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
const { getDatabaseAsync, isUsingPostgres } = require('../../../lib/db');

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
      case 'fundamentals.dividends':
        return this.runDividendUpdate(db, onProgress);
      default:
        throw new Error(`Unknown fundamentals job: ${jobKey}`);
    }
  }

  async runQuarterlyUpdate(db, onProgress) {
    const database = await getDatabaseAsync();
    await onProgress(5, 'Starting quarterly fundamentals update...');

    // Get companies that need updating (no recent financial data)
    const interval30days = isUsingPostgres()
      ? `CURRENT_TIMESTAMP - INTERVAL '30 days'`
      : `datetime('now', '-30 days')`;
    const result = await database.query(`
      SELECT c.id, c.symbol, c.cik
      FROM companies c
      WHERE c.cik IS NOT NULL
      AND (
        c.id NOT IN (
          SELECT DISTINCT company_id FROM financial_data
          WHERE created_at > ${interval30days}
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
    const interval7days = isUsingPostgres()
      ? `CURRENT_TIMESTAMP - INTERVAL '7 days'`
      : `datetime('now', '-7 days')`;
    const result = await database.query(`
      SELECT DISTINCT c.id, c.symbol
      FROM companies c
      JOIN financial_data f ON f.company_id = c.id
      WHERE f.updated_at > ${interval7days}
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
    const date7daysAgo = isUsingPostgres()
      ? `CURRENT_DATE - INTERVAL '7 days'`
      : `date('now', '-7 days')`;
    const result = await database.query(`
      SELECT DISTINCT c.id, c.symbol
      FROM companies c
      WHERE c.id IN (SELECT company_id FROM financial_data)
      AND c.id IN (SELECT company_id FROM daily_prices WHERE date > ${date7daysAgo})
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

    // Get latest price data and market cap from companies table
    const priceResult = await database.query(`
      SELECT dp.close, c.market_cap
      FROM daily_prices dp
      JOIN companies c ON dp.company_id = c.id
      WHERE dp.company_id = $1
      ORDER BY dp.date DESC
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

  async runDividendUpdate(db, onProgress) {
    await onProgress(5, 'Starting dividend data update via Python dividend_fetcher...');

    try {
      // Path to Python script
      const pythonScript = path.join(this.projectRoot, 'python-services/dividend_fetcher.py');
      const dbPath = path.join(this.projectRoot, 'data/stocks.db');

      await onProgress(10, 'Fetching dividend data for S&P 500 companies...');

      // Call Python dividend_fetcher with sp500 command for priority companies
      const result = await new Promise((resolve) => {
        const child = spawn('python3', [
          pythonScript,
          '--db', dbPath,
          'sp500',  // Fetch S&P 500 companies (dividend-paying priority)
          '--workers', '3',  // Limit concurrent workers to avoid rate limiting
          '--years', '10'
        ], {
          cwd: path.dirname(pythonScript)
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
          // Log progress updates
          const progressMatch = data.toString().match(/Progress: (\d+)\/(\d+)/);
          if (progressMatch) {
            const current = parseInt(progressMatch[1]);
            const total = parseInt(progressMatch[2]);
            const progress = 10 + Math.round((current / total) * 80);
            onProgress(progress, `Processing ${current}/${total} companies...`).catch(() => {});
          }
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          // Parse results from output
          const processedMatch = stdout.match(/Processed:\s*(\d+)/);
          const withDividendsMatch = stdout.match(/With dividends:\s*(\d+)/);
          const errorsMatch = stdout.match(/Errors:\s*(\d+)/);

          if (code === 0) {
            resolve({
              success: true,
              processed: processedMatch ? parseInt(processedMatch[1]) : 0,
              withDividends: withDividendsMatch ? parseInt(withDividendsMatch[1]) : 0,
              errors: errorsMatch ? parseInt(errorsMatch[1]) : 0,
              output: stdout
            });
          } else {
            resolve({
              success: false,
              processed: 0,
              withDividends: 0,
              errors: 1,
              error: stderr || `Exit code ${code}`
            });
          }
        });

        child.on('error', (err) => {
          resolve({
            success: false,
            processed: 0,
            withDividends: 0,
            errors: 1,
            error: err.message
          });
        });

        // Timeout after 10 minutes (dividends fetch can take a while)
        setTimeout(() => {
          child.kill();
          resolve({
            success: false,
            processed: 0,
            withDividends: 0,
            errors: 1,
            error: 'Timeout after 10 minutes'
          });
        }, 600000);
      });

      if (result.success) {
        await onProgress(100, `Dividend update complete: ${result.withDividends} companies with dividends`);
      } else {
        console.error('Dividend fetch error:', result.error);
        await onProgress(100, `Dividend update failed: ${result.error}`);
      }

      return {
        itemsTotal: result.processed,
        itemsProcessed: result.processed,
        itemsUpdated: result.withDividends,
        itemsFailed: result.errors,
        metadata: {
          success: result.success,
          error: result.error
        }
      };
    } catch (error) {
      throw error;
    }
  }
}

const fundamentalsBundle = new FundamentalsBundle();

module.exports = {
  execute: (jobKey, db, context) => fundamentalsBundle.execute(jobKey, db, context)
};
