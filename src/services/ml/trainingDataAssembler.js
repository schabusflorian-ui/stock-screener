// src/services/ml/trainingDataAssembler.js
// Assembles ML training data from existing factor scores and price data

/**
 * TrainingDataAssembler - Joins existing factor scores with forward returns
 *
 * Uses existing data:
 * - stock_factor_scores (80K+ records, 21 factors)
 * - daily_prices (13.6M+ records) for return calculation
 * - companies table for sector/metadata
 *
 * Outputs feature matrix + return targets ready for ML training
 */
class TrainingDataAssembler {
  constructor(db) {
    this.db = db;

    // Feature columns we extract
    this.factorColumns = [
      'value_score', 'momentum_score', 'quality_score', 'size_score',
      'volatility_score', 'growth_score', 'profitability_score', 'investment_score',
      'dividend_score', 'leverage_score', 'liquidity_score',
      'value_growth_blend', 'defensive_score', 'beta'
    ];

    this.percentileColumns = [
      'value_percentile', 'quality_percentile', 'momentum_percentile',
      'growth_percentile', 'size_percentile'
    ];

    console.log('📊 TrainingDataAssembler initialized');
  }

  /**
   * Get training data status
   * @returns {Object} Status of available training data
   */
  getStatus() {
    const factorStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT company_id) as unique_companies,
        MIN(score_date) as min_date,
        MAX(score_date) as max_date
      FROM stock_factor_scores
      WHERE value_score IS NOT NULL
    `).get();

    const priceStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT company_id) as unique_companies,
        MIN(date) as min_date,
        MAX(date) as max_date
      FROM daily_prices
    `).get();

    // Check how many factor records have price data for forward returns
    const joinableCount = this.db.prepare(`
      SELECT COUNT(*) as cnt
      FROM stock_factor_scores f
      JOIN daily_prices p1 ON p1.company_id = f.company_id AND p1.date = f.score_date
      JOIN daily_prices p2 ON p2.company_id = f.company_id AND p2.date = date(f.score_date, '+21 days')
      WHERE f.value_score IS NOT NULL
    `).get().cnt;

    return {
      factorRecords: factorStats.total_records,
      factorCompanies: factorStats.unique_companies,
      factorDateRange: { min: factorStats.min_date, max: factorStats.max_date },
      priceRecords: priceStats.total_records,
      priceCompanies: priceStats.unique_companies,
      priceDateRange: { min: priceStats.min_date, max: priceStats.max_date },
      trainableRecords: joinableCount,
      readyForTraining: joinableCount >= 100
    };
  }

  /**
   * Assemble training data from existing tables
   * @param {Object} options Configuration options
   * @returns {Array} Training data rows with features and targets
   */
  assembleTrainingData(options = {}) {
    const {
      startDate = '2021-04-01',  // After factor data starts
      endDate = null,             // Leave room for forward returns
      horizons = [5, 21, 63],     // Return horizons in days
      maxRecords = 100000,        // Limit for memory
      sampleRate = 1.0            // Subsample for faster training
    } = options;

    // Calculate endDate leaving room for longest horizon
    const maxHorizon = Math.max(...horizons);
    const effectiveEndDate = endDate || this._getDateDaysAgo(maxHorizon + 5);

    console.log(`📊 Assembling training data from ${startDate} to ${effectiveEndDate}`);

    // Build the query dynamically based on horizons
    const returnColumns = horizons.map(h => `
      (SELECT p2.adjusted_close / p1.adjusted_close - 1
       FROM daily_prices p1
       JOIN daily_prices p2 ON p2.company_id = p1.company_id
         AND p2.date = (
           SELECT MIN(d.date) FROM daily_prices d
           WHERE d.company_id = p1.company_id
             AND d.date >= date(f.score_date, '+${h} days')
         )
       WHERE p1.company_id = f.company_id
         AND p1.date = f.score_date
      ) as return_${h}d`
    ).join(',');

    const query = `
      SELECT
        f.company_id,
        f.symbol,
        f.score_date,
        c.sector,
        c.market_cap,

        -- Factor scores
        ${this.factorColumns.map(col => `f.${col}`).join(', ')},

        -- Percentiles
        ${this.percentileColumns.map(col => `f.${col}`).join(', ')},

        -- Forward returns
        ${returnColumns}

      FROM stock_factor_scores f
      JOIN companies c ON c.id = f.company_id
      WHERE f.score_date >= ?
        AND f.score_date <= ?
        AND f.value_score IS NOT NULL
        ${sampleRate < 1.0 ? `AND ABS(RANDOM() % 1000) < ${Math.floor(sampleRate * 1000)}` : ''}
      ORDER BY f.score_date, f.symbol
      LIMIT ?
    `;

    const rows = this.db.prepare(query).all(startDate, effectiveEndDate, maxRecords);

    // Filter to rows with valid 21d returns (or primary horizon)
    const primaryHorizon = horizons.includes(21) ? 21 : horizons[0];
    const validRows = rows.filter(r => r[`return_${primaryHorizon}d`] !== null);

    console.log(`📊 Assembled ${validRows.length} valid training samples (${rows.length} total, ${rows.length - validRows.length} filtered)`);

    return validRows;
  }

  /**
   * Get feature matrix and targets for ML training
   * @param {Object} options Configuration options
   * @returns {Object} { features, targets, featureNames, metadata }
   */
  getTrainingMatrices(options = {}) {
    const {
      targetHorizon = 21,
      normalizeFeatures = true,
      ...assembleOptions
    } = options;

    const data = this.assembleTrainingData({
      horizons: [5, targetHorizon, 63],
      ...assembleOptions
    });

    if (data.length === 0) {
      return { features: [], targets: [], featureNames: [], metadata: { sampleCount: 0 } };
    }

    // Define feature names
    const featureNames = [
      ...this.factorColumns,
      ...this.percentileColumns,
      'regime_code',
      'sector_code',
      'market_cap_bucket'
    ];

    // Extract features
    const features = data.map(row => {
      const factorFeatures = this.factorColumns.map(col => row[col] || 0);
      const percentileFeatures = this.percentileColumns.map(col => row[col] || 50);

      return [
        ...factorFeatures,
        ...percentileFeatures,
        this._inferRegime(row),
        this._encodeSector(row.sector),
        this._encodeMarketCap(row.market_cap)
      ];
    });

    // Extract targets
    const targets = data.map(row => row[`return_${targetHorizon}d`]);

    // Normalize features if requested
    let normalizedFeatures = features;
    let featureStats = null;

    if (normalizeFeatures) {
      const result = this._normalizeFeatures(features);
      normalizedFeatures = result.normalized;
      featureStats = result.stats;
    }

    // Calculate metadata
    const metadata = {
      sampleCount: data.length,
      dateRange: {
        min: data[0].score_date,
        max: data[data.length - 1].score_date
      },
      uniqueCompanies: new Set(data.map(d => d.company_id)).size,
      targetStats: this._calculateStats(targets),
      featureStats
    };

    return {
      features: normalizedFeatures,
      targets,
      featureNames,
      metadata,
      rawData: data  // Include raw data for regime/sector analysis
    };
  }

  /**
   * Get data split by regime for regime-specific training
   * @param {Object} options Configuration options
   * @returns {Object} Data split by inferred regime
   */
  getDataByRegime(options = {}) {
    const { features, targets, featureNames, rawData, metadata } = this.getTrainingMatrices(options);

    const regimes = {};
    rawData.forEach((row, idx) => {
      const regime = this._inferRegimeFromData(row);
      if (!regimes[regime]) {
        regimes[regime] = { features: [], targets: [], indices: [] };
      }
      regimes[regime].features.push(features[idx]);
      regimes[regime].targets.push(targets[idx]);
      regimes[regime].indices.push(idx);
    });

    return { regimes, featureNames, metadata };
  }

  /**
   * Infer market regime from factor data
   * (Approximation based on volatility and momentum)
   */
  _inferRegime(row) {
    // Use volatility and momentum to approximate regime
    const vol = row.volatility_score || 0;
    const mom = row.momentum_score || 0;

    if (vol < -30) return -2;  // CRISIS (high vol = negative score)
    if (vol < -10) return -1;  // HIGH_VOL
    if (mom < -20) return -0.5; // BEAR
    if (mom > 20) return 1;    // BULL
    return 0;                   // SIDEWAYS
  }

  _inferRegimeFromData(row) {
    const vol = row.volatility_score || 0;
    const mom = row.momentum_score || 0;

    if (vol < -30) return 'CRISIS';
    if (vol < -10) return 'HIGH_VOL';
    if (mom < -20) return 'BEAR';
    if (mom > 20) return 'BULL';
    return 'SIDEWAYS';
  }

  /**
   * Encode sector as numeric
   */
  _encodeSector(sector) {
    const sectorCodes = {
      'Technology': 1,
      'Healthcare': 2,
      'Financials': 3,
      'Financial Services': 3,
      'Consumer Discretionary': 4,
      'Consumer Cyclical': 4,
      'Consumer Staples': 5,
      'Consumer Defensive': 5,
      'Industrials': 6,
      'Energy': 7,
      'Materials': 8,
      'Basic Materials': 8,
      'Utilities': 9,
      'Real Estate': 10,
      'Communication Services': 11
    };
    return sectorCodes[sector] || 0;
  }

  /**
   * Encode market cap as bucket
   */
  _encodeMarketCap(marketCap) {
    if (!marketCap || marketCap <= 0) return 0;
    if (marketCap < 2e9) return 1;        // Small cap
    if (marketCap < 10e9) return 2;       // Mid cap
    if (marketCap < 200e9) return 3;      // Large cap
    return 4;                              // Mega cap
  }

  /**
   * Normalize features (z-score normalization)
   */
  _normalizeFeatures(features) {
    if (features.length === 0) return { normalized: [], stats: [] };

    const nFeatures = features[0].length;
    const stats = [];

    // Calculate mean and std for each feature
    for (let j = 0; j < nFeatures; j++) {
      const values = features.map(row => row[j]).filter(v => v !== null && !isNaN(v));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance) || 1;
      stats.push({ mean, std });
    }

    // Normalize
    const normalized = features.map(row =>
      row.map((val, j) => {
        if (val === null || isNaN(val)) return 0;
        return (val - stats[j].mean) / stats[j].std;
      })
    );

    return { normalized, stats };
  }

  /**
   * Calculate basic statistics for an array
   */
  _calculateStats(values) {
    const validValues = values.filter(v => v !== null && !isNaN(v));
    if (validValues.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };

    const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    const variance = validValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validValues.length;

    return {
      mean,
      std: Math.sqrt(variance),
      min: Math.min(...validValues),
      max: Math.max(...validValues),
      count: validValues.length
    };
  }

  /**
   * Get date N days ago in YYYY-MM-DD format
   */
  _getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}

module.exports = { TrainingDataAssembler };
