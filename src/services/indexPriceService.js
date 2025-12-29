/**
 * Index Price Service
 * Fetches and maintains price data for market indices (SPY, QQQ, etc.)
 * Calculates alpha (performance vs benchmark) for all stocks
 */

const { spawn } = require('child_process');
const path = require('path');

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
   */
  calculateAlphaForAll() {
    const benchmark = this.getBenchmark();
    if (!benchmark) {
      throw new Error('No benchmark index found. Run index price update first.');
    }

    const updateStmt = this.db.prepare(`
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

    const result = updateStmt.run(
      benchmark.change_1d || 0,
      benchmark.change_1w || 0,
      benchmark.change_1m || 0,
      benchmark.change_3m || 0,
      benchmark.change_6m || 0,
      benchmark.change_1y || 0,
      benchmark.change_ytd || 0
    );

    return {
      updated: result.changes,
      benchmark: benchmark.symbol,
      benchmarkChanges: {
        '1d': benchmark.change_1d,
        '1w': benchmark.change_1w,
        '1m': benchmark.change_1m,
        '3m': benchmark.change_3m,
        '6m': benchmark.change_6m,
        '1y': benchmark.change_1y,
        'ytd': benchmark.change_ytd
      }
    };
  }

  /**
   * Get alpha metrics for a specific stock
   */
  getStockAlpha(symbol) {
    const company = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(symbol);

    if (!company) return null;

    return this.db.prepare(`
      SELECT
        pm.alpha_1d, pm.alpha_1w, pm.alpha_1m,
        pm.alpha_3m, pm.alpha_6m, pm.alpha_1y, pm.alpha_ytd,
        pm.benchmark_symbol,
        ip.change_1d as benchmark_1d,
        ip.change_1w as benchmark_1w,
        ip.change_1m as benchmark_1m,
        ip.change_ytd as benchmark_ytd,
        ip.change_1y as benchmark_1y
      FROM price_metrics pm
      LEFT JOIN index_prices ip ON ip.symbol = pm.benchmark_symbol
      WHERE pm.company_id = ?
    `).get(company.id);
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
