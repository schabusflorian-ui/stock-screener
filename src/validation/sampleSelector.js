/**
 * Sample Selector for Metrics Validation
 *
 * Implements stratified sampling to select a representative subset
 * of companies for validation while minimizing API calls.
 * Supports both SQLite and PostgreSQL (async).
 */

class SampleSelector {
  constructor(db) {
    this.db = db;
    this._isAsync = typeof db.query === 'function' && db.query.length >= 1;

    // Target sample size by category
    this.config = {
      megaCaps: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V'],
      sectorTargets: {
        'Technology': 6,
        'Healthcare': 5,
        'Financials': 5,
        'Consumer Cyclical': 4,
        'Consumer Defensive': 4,
        'Industrials': 4,
        'Energy': 3,
        'Utilities': 3,
        'Real Estate': 2,
        'Basic Materials': 2,
        'Communication Services': 2,
      },
      totalTarget: 40,
      minPerSector: 1,
    };
  }

  async _query(sql, params = []) {
    const result = await this.db.query(sql, params);
    return result.rows || result;
  }

  /**
   * Select a stratified sample of companies for validation
   */
  async selectSample(options = {}) {
    const {
      includeMegaCaps = true,
      targetSize = this.config.totalTarget,
      excludeSymbols = []
    } = options;

    const sample = new Set();
    const excludeSet = new Set(excludeSymbols);

    if (includeMegaCaps) {
      for (const symbol of this.config.megaCaps) {
        if (!excludeSet.has(symbol) && await this.companyExists(symbol)) {
          sample.add(symbol);
        }
      }
      console.log(`   Added ${sample.size} mega-cap companies`);
    }

    const sectorCounts = await this.getSectorCounts();

    for (const [sector, target] of Object.entries(this.config.sectorTargets)) {
      const currentFromSector = await this.countFromSector(sample, sector);
      const needed = Math.max(0, target - currentFromSector);

      if (needed > 0 && sectorCounts[sector]) {
        const sampleArr = Array.from(sample);
        const placeholders = sampleArr.length > 0
          ? sampleArr.map(() => '?').join(',')
          : "''";
        const params = [sector, ...sampleArr, needed];

        const companies = await this._query(`
          SELECT c.symbol
          FROM companies c
          LEFT JOIN calculated_metrics m ON m.company_id = c.id
          WHERE c.sector = ?
            AND c.is_active = 1
            AND c.symbol NOT LIKE 'CIK_%'
            AND c.symbol NOT IN (${placeholders})
            AND m.id IS NOT NULL
          ORDER BY RANDOM()
          LIMIT ?
        `, params);

        for (const c of companies) {
          if (!excludeSet.has(c.symbol)) sample.add(c.symbol);
        }
      }
    }
    console.log(`   After sector sampling: ${sample.size} companies`);

    const remaining = targetSize - sample.size;
    if (remaining > 0) {
      const sampleArr = Array.from(sample);
      const placeholders = sampleArr.length > 0 ? sampleArr.map(() => '?').join(',') : "''";
      const params = [...sampleArr, remaining];

      const randomCompanies = await this._query(`
        SELECT c.symbol
        FROM companies c
        INNER JOIN calculated_metrics m ON m.company_id = c.id
        WHERE c.is_active = 1
          AND c.symbol NOT LIKE 'CIK_%'
          AND c.symbol NOT IN (${placeholders})
        GROUP BY c.symbol
        ORDER BY RANDOM()
        LIMIT ?
      `, params);

      for (const c of randomCompanies) {
        if (!excludeSet.has(c.symbol)) sample.add(c.symbol);
      }
    }

    const result = Array.from(sample).slice(0, targetSize);
    console.log(`   Final sample: ${result.length} companies`);
    return result;
  }

  async companyExists(symbol) {
    const rows = await this._query(`
      SELECT c.id FROM companies c
      INNER JOIN calculated_metrics m ON m.company_id = c.id
      WHERE c.symbol = ?
        AND c.is_active = 1
        AND c.symbol NOT LIKE 'CIK_%'
      LIMIT 1
    `, [symbol]);
    const arr = Array.isArray(rows) ? rows : [];
    return !!arr[0];
  }

  async getSectorCounts() {
    const rows = await this._query(`
      SELECT sector, COUNT(*) as count
      FROM companies
      WHERE sector IS NOT NULL AND is_active = 1
      GROUP BY sector
    `);
    const counts = {};
    for (const row of (Array.isArray(rows) ? rows : [])) {
      counts[row.sector] = row.count;
    }
    return counts;
  }

  async countFromSector(sample, sector) {
    if (sample.size === 0) return 0;
    const symbols = Array.from(sample);
    const placeholders = symbols.map(() => '?').join(',');
    const result = await this._query(`
      SELECT COUNT(*) as count FROM companies
      WHERE symbol IN (${placeholders}) AND sector = ?
    `, [...symbols, sector]);
    const row = Array.isArray(result) ? result[0] : result;
    return row?.count || 0;
  }

  async getSampleStats(sample) {
    const symbols = Array.from(sample);
    if (symbols.length === 0) return { sectors: {}, total: 0 };

    const placeholders = symbols.map(() => '?').join(',');
    const sectorStats = await this._query(`
      SELECT sector, COUNT(*) as count
      FROM companies
      WHERE symbol IN (${placeholders})
      GROUP BY sector
      ORDER BY count DESC
    `, symbols);

    const sectors = {};
    for (const row of (Array.isArray(sectorStats) ? sectorStats : [])) {
      sectors[row.sector || 'Unknown'] = row.count;
    }
    return {
      total: symbols.length,
      sectors,
      megaCapsIncluded: symbols.filter(s => this.config.megaCaps.includes(s)).length,
    };
  }

  async printSampleDistribution(sample) {
    const stats = await this.getSampleStats(sample);
    console.log('\n   Sample Distribution:');
    console.log(`   - Total companies: ${stats.total}`);
    console.log(`   - Mega-caps included: ${stats.megaCapsIncluded}`);
    console.log('   - By sector:');
    for (const [sector, count] of Object.entries(stats.sectors)) {
      console.log(`     ${sector}: ${count}`);
    }
  }
}

module.exports = SampleSelector;
