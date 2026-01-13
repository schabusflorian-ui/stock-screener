/**
 * Index Price Service
 * Fetches and maintains price data for market indices (SPY, QQQ, etc.)
 * Calculates alpha (performance vs benchmark) for all stocks
 * Supports dual alpha calculation: vs SPY (global) and vs home index
 */

const { spawn } = require('child_process');
const path = require('path');
const indexMappingService = require('./indexMappingService');

class IndexPriceService {
  constructor(db) {
    this.db = db;
    this.pythonScript = path.join(__dirname, '../../python-services/index_etf_fetcher.py');
    this.dbPath = path.join(__dirname, '../../data/stocks.db');
  }

  /**
   * Get all tracked indices
   */
  getAllIndices() {
    return this.db.prepare(`
      SELECT
        symbol, name, index_type, is_primary,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
        high_52w, low_52w, sma_50, sma_200, rsi_14,
        updated_at
      FROM index_prices
      ORDER BY is_primary DESC, index_type, symbol
    `).all();
  }

  /**
   * Get market indices only (SPY, QQQ, DIA, etc.)
   */
  getMarketIndices() {
    return this.db.prepare(`
      SELECT
        symbol, name, is_primary,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
        high_52w, low_52w,
        updated_at
      FROM index_prices
      WHERE index_type = 'market'
      ORDER BY is_primary DESC, symbol
    `).all();
  }

  /**
   * Get sector ETFs
   */
  getSectorIndices() {
    return this.db.prepare(`
      SELECT
        symbol, name,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_ytd, change_1y,
        updated_at
      FROM index_prices
      WHERE index_type = 'sector'
      ORDER BY symbol
    `).all();
  }

  /**
   * Get primary benchmark (SPY)
   */
  getBenchmark() {
    return this.db.prepare(`
      SELECT
        symbol, name,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
        updated_at
      FROM index_prices
      WHERE is_primary = 1
      LIMIT 1
    `).get();
  }

  /**
   * Get index by symbol
   */
  getIndex(symbol) {
    return this.db.prepare(`
      SELECT * FROM index_prices WHERE symbol = ? COLLATE NOCASE
    `).get(symbol);
  }

  /**
   * Calculate and store alpha for all stocks
   * Alpha = stock_change - benchmark_change
   * Calculates both SPY alpha (global) and home index alpha
   */
  calculateAlphaForAll() {
    const benchmark = this.getBenchmark();
    if (!benchmark) {
      throw new Error('No benchmark index found. Run index price update first.');
    }

    // Step 1: Calculate alpha vs SPY for all stocks
    const updateSpyAlpha = this.db.prepare(`
      UPDATE price_metrics SET
        alpha_1d = change_1d - ?,
        alpha_1w = change_1w - ?,
        alpha_1m = change_1m - ?,
        alpha_3m = change_3m - ?,
        alpha_6m = change_6m - ?,
        alpha_1y = change_1y - ?,
        alpha_ytd = change_ytd - ?,
        benchmark_symbol = 'SPY'
      WHERE change_1d IS NOT NULL
    `);

    const spyResult = updateSpyAlpha.run(
      benchmark.change_1d || 0,
      benchmark.change_1w || 0,
      benchmark.change_1m || 0,
      benchmark.change_3m || 0,
      benchmark.change_6m || 0,
      benchmark.change_1y || 0,
      benchmark.change_ytd || 0
    );

    // Step 2: Calculate alpha vs home index for non-US stocks
    const homeAlphaResult = this.calculateHomeAlphaForAll();

    return {
      updated: spyResult.changes,
      benchmark: benchmark.symbol,
      benchmarkChanges: {
        '1d': benchmark.change_1d,
        '1w': benchmark.change_1w,
        '1m': benchmark.change_1m,
        '3m': benchmark.change_3m,
        '6m': benchmark.change_6m,
        '1y': benchmark.change_1y,
        'ytd': benchmark.change_ytd
      },
      homeAlpha: homeAlphaResult
    };
  }

  /**
   * Calculate alpha vs home index for all non-US stocks
   * Groups companies by country and calculates alpha against their respective home index
   */
  calculateHomeAlphaForAll() {
    // Get all companies grouped by country
    const countriesWithCompanies = this.db.prepare(`
      SELECT DISTINCT c.country, COUNT(*) as company_count
      FROM companies c
      JOIN price_metrics pm ON c.id = pm.company_id
      WHERE c.country IS NOT NULL
        AND c.country != 'US'
        AND pm.change_1d IS NOT NULL
      GROUP BY c.country
    `).all();

    const results = {
      processed: 0,
      byCountry: {}
    };

    // Process each country
    for (const countryData of countriesWithCompanies) {
      const country = countryData.country;
      const homeIndex = indexMappingService.getHomeIndex(country);

      // Get index data for the home benchmark
      // Try to find by symbol in index_prices table
      const indexData = this.db.prepare(`
        SELECT
          change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd
        FROM index_prices
        WHERE symbol = ? COLLATE NOCASE
      `).get(homeIndex.etf);

      if (indexData) {
        // Update alpha_home for all companies in this country
        // SQLite UPDATE...FROM requires careful handling - use subquery instead
        const updateResult = this.db.prepare(`
          UPDATE price_metrics SET
            alpha_1d_home = change_1d - ?,
            alpha_1w_home = change_1w - ?,
            alpha_1m_home = change_1m - ?,
            alpha_3m_home = change_3m - ?,
            alpha_6m_home = change_6m - ?,
            alpha_1y_home = change_1y - ?,
            alpha_ytd_home = change_ytd - ?,
            home_benchmark = ?
          WHERE company_id IN (
            SELECT id FROM companies WHERE country = ?
          )
          AND change_1d IS NOT NULL
        `).run(
          indexData.change_1d || 0,
          indexData.change_1w || 0,
          indexData.change_1m || 0,
          indexData.change_3m || 0,
          indexData.change_6m || 0,
          indexData.change_1y || 0,
          indexData.change_ytd || 0,
          homeIndex.code,
          country
        );

        results.byCountry[country] = {
          index: homeIndex.code,
          etf: homeIndex.etf,
          updated: updateResult.changes,
          indexData: {
            '1m': indexData.change_1m,
            '1y': indexData.change_1y
          }
        };
        results.processed += updateResult.changes;
      } else {
        // No index data available for this home index
        // Set home_benchmark but leave alpha_home as null
        this.db.prepare(`
          UPDATE price_metrics SET
            home_benchmark = ?
          WHERE company_id IN (
            SELECT id FROM companies WHERE country = ?
          )
        `).run(homeIndex.code, country);

        results.byCountry[country] = {
          index: homeIndex.code,
          etf: homeIndex.etf,
          updated: 0,
          noIndexData: true
        };
      }
    }

    // For US companies, home alpha = SPY alpha (same benchmark)
    const usResult = this.db.prepare(`
      UPDATE price_metrics SET
        alpha_1d_home = alpha_1d,
        alpha_1w_home = alpha_1w,
        alpha_1m_home = alpha_1m,
        alpha_3m_home = alpha_3m,
        alpha_6m_home = alpha_6m,
        alpha_1y_home = alpha_1y,
        alpha_ytd_home = alpha_ytd,
        home_benchmark = 'SPX'
      WHERE company_id IN (
        SELECT id FROM companies WHERE country = 'US' OR country IS NULL
      )
      AND alpha_1d IS NOT NULL
    `).run();

    results.byCountry['US'] = {
      index: 'SPX',
      etf: 'SPY',
      updated: usResult.changes,
      sameAsSpy: true
    };
    results.processed += usResult.changes;

    return results;
  }

  /**
   * Get alpha metrics for a specific stock
   * Returns both SPY alpha and home index alpha
   */
  getStockAlpha(symbol) {
    const company = this.db.prepare(`
      SELECT id, country FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(symbol);

    if (!company) return null;

    const alphaData = this.db.prepare(`
      SELECT
        pm.alpha_1d, pm.alpha_1w, pm.alpha_1m,
        pm.alpha_3m, pm.alpha_6m, pm.alpha_1y, pm.alpha_ytd,
        pm.benchmark_symbol,
        pm.alpha_1d_home, pm.alpha_1w_home, pm.alpha_1m_home,
        pm.alpha_3m_home, pm.alpha_6m_home, pm.alpha_1y_home, pm.alpha_ytd_home,
        pm.home_benchmark,
        ip.change_1d as benchmark_1d,
        ip.change_1w as benchmark_1w,
        ip.change_1m as benchmark_1m,
        ip.change_ytd as benchmark_ytd,
        ip.change_1y as benchmark_1y
      FROM price_metrics pm
      LEFT JOIN index_prices ip ON ip.symbol = pm.benchmark_symbol
      WHERE pm.company_id = ?
    `).get(company.id);

    if (!alphaData) return null;

    // Get home index info
    const homeIndex = indexMappingService.getHomeIndex(company.country);
    const isUS = indexMappingService.isUSCompany(company.country);

    return {
      // SPY alpha (global benchmark)
      spy: {
        alpha_1d: alphaData.alpha_1d,
        alpha_1w: alphaData.alpha_1w,
        alpha_1m: alphaData.alpha_1m,
        alpha_3m: alphaData.alpha_3m,
        alpha_6m: alphaData.alpha_6m,
        alpha_1y: alphaData.alpha_1y,
        alpha_ytd: alphaData.alpha_ytd,
        benchmark: 'SPY',
        benchmarkName: 'S&P 500'
      },
      // Home index alpha
      home: {
        alpha_1d: alphaData.alpha_1d_home,
        alpha_1w: alphaData.alpha_1w_home,
        alpha_1m: alphaData.alpha_1m_home,
        alpha_3m: alphaData.alpha_3m_home,
        alpha_6m: alphaData.alpha_6m_home,
        alpha_1y: alphaData.alpha_1y_home,
        alpha_ytd: alphaData.alpha_ytd_home,
        benchmark: homeIndex.code,
        benchmarkName: homeIndex.name,
        flag: homeIndex.flag
      },
      isUS,
      // For backward compatibility
      benchmark_symbol: alphaData.benchmark_symbol,
      home_benchmark: alphaData.home_benchmark
    };
  }

  /**
   * Get update status
   */
  getUpdateStatus() {
    const indices = this.db.prepare(`
      SELECT symbol, last_price_date, updated_at
      FROM index_prices
      ORDER BY is_primary DESC, symbol
    `).all();

    const alphaStats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN alpha_1d IS NOT NULL THEN 1 ELSE 0 END) as with_alpha
      FROM price_metrics
    `).get();

    return {
      indices,
      alphaStats
    };
  }

  /**
   * Run Python index fetcher
   */
  _runPythonCommand(command) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        this.pythonScript,
        '--db', this.dbPath,
        command
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(data.toString());
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: stdout });
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  /**
   * Update index prices (calls Python script)
   */
  async updateIndexPrices() {
    return this._runPythonCommand('update');
  }

  /**
   * Full update: fetch index prices + calculate alpha
   */
  async fullUpdate() {
    // Update index prices
    await this.updateIndexPrices();

    // Calculate alpha for all stocks
    const alphaResult = this.calculateAlphaForAll();

    return {
      success: true,
      alphaUpdated: alphaResult.updated,
      benchmark: alphaResult.benchmark
    };
  }
}

module.exports = IndexPriceService;
