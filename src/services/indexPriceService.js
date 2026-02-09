/**
 * Index Price Service
 * Fetches and maintains price data for market indices (SPY, QQQ, etc.)
 * Calculates alpha (performance vs benchmark) for all stocks
 * Supports dual alpha calculation: vs SPY (global) and vs home index
 */

const { spawn } = require('child_process');
const path = require('path');
const indexMappingService = require('./indexMappingService');
const { getDatabaseAsync } = require('../lib/db');

class IndexPriceService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
    this.pythonScript = path.join(__dirname, '../../python-services/index_etf_fetcher.py');
    this.dbPath = path.join(__dirname, '../../data/stocks.db');
  }

  /**
   * Get all tracked indices
   */
  async getAllIndices() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        symbol, name, index_type, is_primary,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
        high_52w, low_52w, sma_50, sma_200, rsi_14,
        updated_at
      FROM index_prices
      ORDER BY is_primary DESC, index_type, symbol
    `);
    return result.rows;
  }

  /**
   * Get market indices only (SPY, QQQ, DIA, etc.)
   */
  async getMarketIndices() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        symbol, name, is_primary,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
        high_52w, low_52w,
        updated_at
      FROM index_prices
      WHERE index_type = 'market'
      ORDER BY is_primary DESC, symbol
    `);
    return result.rows;
  }

  /**
   * Get sector ETFs
   */
  async getSectorIndices() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        symbol, name,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_ytd, change_1y,
        updated_at
      FROM index_prices
      WHERE index_type = 'sector'
      ORDER BY symbol
    `);
    return result.rows;
  }

  /**
   * Get primary benchmark (SPY)
   */
  async getBenchmark() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        symbol, name,
        last_price, last_price_date,
        change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd,
        updated_at
      FROM index_prices
      WHERE is_primary = 1
      LIMIT 1
    `);
    return result.rows[0];
  }

  /**
   * Get index by symbol
   */
  async getIndex(symbol) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM index_prices WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);
    return result.rows[0];
  }

  /**
   * Calculate and store alpha for all stocks
   * Alpha = stock_change - benchmark_change
   * Calculates both SPY alpha (global) and home index alpha
   */
  async calculateAlphaForAll() {
    const benchmark = await this.getBenchmark();
    if (!benchmark) {
      throw new Error('No benchmark index found. Run index price update first.');
    }

    const database = await getDatabaseAsync();

    // Step 1: Calculate alpha vs SPY for all stocks
    const spyResult = await database.query(`
      UPDATE price_metrics SET
        alpha_1d = change_1d - $1,
        alpha_1w = change_1w - $2,
        alpha_1m = change_1m - $3,
        alpha_3m = change_3m - $4,
        alpha_6m = change_6m - $5,
        alpha_1y = change_1y - $6,
        alpha_ytd = change_ytd - $7,
        benchmark_symbol = 'SPY'
      WHERE change_1d IS NOT NULL
    `, [
      benchmark.change_1d || 0,
      benchmark.change_1w || 0,
      benchmark.change_1m || 0,
      benchmark.change_3m || 0,
      benchmark.change_6m || 0,
      benchmark.change_1y || 0,
      benchmark.change_ytd || 0
    ]);

    // Step 2: Calculate alpha vs home index for non-US stocks
    const homeAlphaResult = await this.calculateHomeAlphaForAll();

    return {
      updated: spyResult.rowCount,
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
  async calculateHomeAlphaForAll() {
    const database = await getDatabaseAsync();

    // Get all companies grouped by country
    const countriesResult = await database.query(`
      SELECT DISTINCT c.country, COUNT(*) as company_count
      FROM companies c
      JOIN price_metrics pm ON c.id = pm.company_id
      WHERE c.country IS NOT NULL
        AND c.country != 'US'
        AND pm.change_1d IS NOT NULL
      GROUP BY c.country
    `);
    const countriesWithCompanies = countriesResult.rows;

    const results = {
      processed: 0,
      byCountry: {}
    };

    // Process each country
    for (const countryData of countriesWithCompanies) {
      const country = countryData.country;
      const homeIndex = indexMappingService.getHomeIndex(country);

      // Get index data for the home benchmark
      const indexDataResult = await database.query(`
        SELECT
          change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd
        FROM index_prices
        WHERE LOWER(symbol) = LOWER($1)
      `, [homeIndex.etf]);
      const indexData = indexDataResult.rows[0];

      if (indexData) {
        // Update alpha_home for all companies in this country
        const updateResult = await database.query(`
          UPDATE price_metrics SET
            alpha_1d_home = change_1d - $1,
            alpha_1w_home = change_1w - $2,
            alpha_1m_home = change_1m - $3,
            alpha_3m_home = change_3m - $4,
            alpha_6m_home = change_6m - $5,
            alpha_1y_home = change_1y - $6,
            alpha_ytd_home = change_ytd - $7,
            home_benchmark = $8
          WHERE company_id IN (
            SELECT id FROM companies WHERE country = $9
          )
          AND change_1d IS NOT NULL
        `, [
          indexData.change_1d || 0,
          indexData.change_1w || 0,
          indexData.change_1m || 0,
          indexData.change_3m || 0,
          indexData.change_6m || 0,
          indexData.change_1y || 0,
          indexData.change_ytd || 0,
          homeIndex.code,
          country
        ]);

        results.byCountry[country] = {
          index: homeIndex.code,
          etf: homeIndex.etf,
          updated: updateResult.rowCount,
          indexData: {
            '1m': indexData.change_1m,
            '1y': indexData.change_1y
          }
        };
        results.processed += updateResult.rowCount;
      } else {
        // No index data available for this home index
        // Set home_benchmark but leave alpha_home as null
        await database.query(`
          UPDATE price_metrics SET
            home_benchmark = $1
          WHERE company_id IN (
            SELECT id FROM companies WHERE country = $2
          )
        `, [homeIndex.code, country]);

        results.byCountry[country] = {
          index: homeIndex.code,
          etf: homeIndex.etf,
          updated: 0,
          noIndexData: true
        };
      }
    }

    // For US companies, home alpha = SPY alpha (same benchmark)
    const usResult = await database.query(`
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
    `);

    results.byCountry['US'] = {
      index: 'SPX',
      etf: 'SPY',
      updated: usResult.rowCount,
      sameAsSpy: true
    };
    results.processed += usResult.rowCount;

    return results;
  }

  /**
   * Get alpha metrics for a specific stock
   * Returns both SPY alpha and home index alpha
   */
  async getStockAlpha(symbol) {
    const database = await getDatabaseAsync();

    const companyResult = await database.query(`
      SELECT id, country FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);
    const company = companyResult.rows[0];

    if (!company) return null;

    const alphaDataResult = await database.query(`
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
      WHERE pm.company_id = $1
    `, [company.id]);
    const alphaData = alphaDataResult.rows[0];

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
  async getUpdateStatus() {
    const database = await getDatabaseAsync();

    const indicesResult = await database.query(`
      SELECT symbol, last_price_date, updated_at
      FROM index_prices
      ORDER BY is_primary DESC, symbol
    `);

    const alphaStatsResult = await database.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN alpha_1d IS NOT NULL THEN 1 ELSE 0 END) as with_alpha
      FROM price_metrics
    `);

    return {
      indices: indicesResult.rows,
      alphaStats: alphaStatsResult.rows[0]
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
    const alphaResult = await this.calculateAlphaForAll();

    return {
      success: true,
      alphaUpdated: alphaResult.updated,
      benchmark: alphaResult.benchmark
    };
  }
}

module.exports = IndexPriceService;
