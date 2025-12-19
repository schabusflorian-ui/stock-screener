/**
 * Sample Selector for Metrics Validation
 *
 * Implements stratified sampling to select a representative subset
 * of companies for validation while minimizing API calls.
 */

class SampleSelector {
  constructor(db) {
    this.db = db;

    // Target sample size by category
    this.config = {
      // Must-include mega caps (highest scrutiny, best ground truth)
      megaCaps: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V'],

      // Sector sampling targets
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

      // Overall target
      totalTarget: 40,

      // Minimum per sector (if sector exists)
      minPerSector: 1,
    };
  }

  /**
   * Select a stratified sample of companies for validation
   * @param {Object} options - Selection options
   * @returns {Array} Array of company symbols to validate
   */
  selectSample(options = {}) {
    const {
      includeMegaCaps = true,
      targetSize = this.config.totalTarget,
      excludeSymbols = []
    } = options;

    const sample = new Set();
    const excludeSet = new Set(excludeSymbols);

    // 1. Always include mega caps (they have the most reliable Yahoo data)
    if (includeMegaCaps) {
      for (const symbol of this.config.megaCaps) {
        if (!excludeSet.has(symbol) && this.companyExists(symbol)) {
          sample.add(symbol);
        }
      }
      console.log(`   Added ${sample.size} mega-cap companies`);
    }

    // 2. Sample by sector for diversity
    const sectorCounts = this.getSectorCounts();

    for (const [sector, target] of Object.entries(this.config.sectorTargets)) {
      const currentFromSector = this.countFromSector(sample, sector);
      const needed = Math.max(0, target - currentFromSector);

      if (needed > 0 && sectorCounts[sector]) {
        const companies = this.db.prepare(`
          SELECT c.symbol
          FROM companies c
          LEFT JOIN calculated_metrics m ON m.company_id = c.id
          WHERE c.sector = ?
            AND c.is_active = 1
            AND c.symbol NOT LIKE 'CIK_%'
            AND c.symbol NOT IN (${Array.from(sample).map(() => '?').join(',') || "''"})
            AND m.id IS NOT NULL
          ORDER BY RANDOM()
          LIMIT ?
        `).all(sector, ...Array.from(sample), needed);

        companies.forEach(c => {
          if (!excludeSet.has(c.symbol)) {
            sample.add(c.symbol);
          }
        });
      }
    }
    console.log(`   After sector sampling: ${sample.size} companies`);

    // 3. Fill remaining slots with random companies that have metrics
    const remaining = targetSize - sample.size;
    if (remaining > 0) {
      const placeholders = Array.from(sample).length > 0
        ? Array.from(sample).map(() => '?').join(',')
        : "''";

      const randomCompanies = this.db.prepare(`
        SELECT c.symbol
        FROM companies c
        INNER JOIN calculated_metrics m ON m.company_id = c.id
        WHERE c.is_active = 1
          AND c.symbol NOT LIKE 'CIK_%'
          AND c.symbol NOT IN (${placeholders})
        GROUP BY c.symbol
        ORDER BY RANDOM()
        LIMIT ?
      `).all(...Array.from(sample), remaining);

      randomCompanies.forEach(c => {
        if (!excludeSet.has(c.symbol)) {
          sample.add(c.symbol);
        }
      });
    }

    const result = Array.from(sample).slice(0, targetSize);
    console.log(`   Final sample: ${result.length} companies`);

    return result;
  }

  /**
   * Check if a company exists and has metrics
   */
  companyExists(symbol) {
    const result = this.db.prepare(`
      SELECT c.id FROM companies c
      INNER JOIN calculated_metrics m ON m.company_id = c.id
      WHERE c.symbol = ?
        AND c.is_active = 1
        AND c.symbol NOT LIKE 'CIK_%'
      LIMIT 1
    `).get(symbol);
    return !!result;
  }

  /**
   * Get count of companies per sector
   */
  getSectorCounts() {
    const rows = this.db.prepare(`
      SELECT sector, COUNT(*) as count
      FROM companies
      WHERE sector IS NOT NULL AND is_active = 1
      GROUP BY sector
    `).all();

    const counts = {};
    for (const row of rows) {
      counts[row.sector] = row.count;
    }
    return counts;
  }

  /**
   * Count how many companies from a sector are already in the sample
   */
  countFromSector(sample, sector) {
    if (sample.size === 0) return 0;

    const symbols = Array.from(sample);
    const placeholders = symbols.map(() => '?').join(',');

    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM companies
      WHERE symbol IN (${placeholders}) AND sector = ?
    `).get(...symbols, sector);

    return result?.count || 0;
  }

  /**
   * Get sample statistics for reporting
   */
  getSampleStats(sample) {
    const symbols = Array.from(sample);
    if (symbols.length === 0) return { sectors: {}, total: 0 };

    const placeholders = symbols.map(() => '?').join(',');

    const sectorStats = this.db.prepare(`
      SELECT sector, COUNT(*) as count
      FROM companies
      WHERE symbol IN (${placeholders})
      GROUP BY sector
      ORDER BY count DESC
    `).all(...symbols);

    const sectors = {};
    for (const row of sectorStats) {
      sectors[row.sector || 'Unknown'] = row.count;
    }

    return {
      total: symbols.length,
      sectors,
      megaCapsIncluded: symbols.filter(s => this.config.megaCaps.includes(s)).length,
    };
  }

  /**
   * Print sample distribution
   */
  printSampleDistribution(sample) {
    const stats = this.getSampleStats(sample);

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
