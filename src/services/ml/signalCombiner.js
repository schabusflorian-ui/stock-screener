// src/services/ml/signalCombiner.js
// XGBoost-style Signal Combiner using Gradient Boosting

const { TrainingDataAssembler } = require('./trainingDataAssembler');

/**
 * MLSignalCombiner - Combines trading signals using gradient boosting
 *
 * This replaces linear weighted averaging with a non-linear ensemble model
 * that can capture complex interactions between signals and market conditions.
 *
 * Uses a JavaScript implementation of gradient boosting regression trees
 * since we want to avoid Python dependencies for the core trading logic.
 *
 * Training data comes from existing stock_factor_scores table (80K+ records)
 * joined with forward returns calculated from daily_prices (13.6M records).
 */

class DecisionTreeNode {
  constructor() {
    this.isLeaf = false;
    this.prediction = null;
    this.featureIndex = null;
    this.threshold = null;
    this.left = null;
    this.right = null;
  }
}

class GradientBoostingRegressor {
  /**
   * @param {Object} options Configuration options
   * @param {number} options.nEstimators Number of boosting rounds (default: 100)
   * @param {number} options.maxDepth Maximum tree depth (default: 4)
   * @param {number} options.learningRate Shrinkage factor (default: 0.1)
   * @param {number} options.minSamplesSplit Min samples to split (default: 10)
   * @param {number} options.subsample Row subsampling ratio (default: 0.8)
   * @param {number} options.colsampleBytree Feature subsampling (default: 0.8)
   */
  constructor(options = {}) {
    this.nEstimators = options.nEstimators || 100;
    this.maxDepth = options.maxDepth || 4;
    this.learningRate = options.learningRate || 0.1;
    this.minSamplesSplit = options.minSamplesSplit || 10;
    this.subsample = options.subsample || 0.8;
    this.colsampleBytree = options.colsampleBytree || 0.8;

    this.trees = [];
    this.initialPrediction = null;
    this.featureImportances = null;
    this.trained = false;
  }

  /**
   * Fit the gradient boosting model
   * @param {number[][]} X Feature matrix (n_samples x n_features)
   * @param {number[]} y Target values
   */
  fit(X, y) {
    // Null safety: validate input data
    if (!X || X.length === 0 || !X[0] || !y || y.length === 0) {
      throw new Error('Invalid training data: X and y must be non-empty arrays');
    }
    if (X.length !== y.length) {
      throw new Error(`Training data mismatch: X has ${X.length} samples but y has ${y.length}`);
    }

    const nSamples = X.length;
    const nFeatures = X[0].length;

    // Initialize with mean prediction
    this.initialPrediction = y.reduce((a, b) => a + b, 0) / nSamples;

    // Initialize predictions and residuals
    let predictions = new Array(nSamples).fill(this.initialPrediction);
    let residuals = y.map((yi, i) => yi - predictions[i]);

    // Track feature importance
    this.featureImportances = new Array(nFeatures).fill(0);

    // Boosting iterations
    for (let i = 0; i < this.nEstimators; i++) {
      // Subsample rows
      const sampleIndices = this._subsampleIndices(nSamples);
      const XSub = sampleIndices.map(idx => X[idx]);
      const residualsSub = sampleIndices.map(idx => residuals[idx]);

      // Subsample features for this tree
      const featureIndices = this._subsampleFeatures(nFeatures);

      // Fit tree to residuals
      const tree = this._fitTree(XSub, residualsSub, featureIndices, 0);
      this.trees.push({ tree, featureIndices });

      // Update predictions and residuals
      for (let j = 0; j < nSamples; j++) {
        const treePrediction = this._predictTree(tree, X[j], featureIndices);
        predictions[j] += this.learningRate * treePrediction;
        residuals[j] = y[j] - predictions[j];
      }
    }

    // Normalize feature importances
    const totalImportance = this.featureImportances.reduce((a, b) => a + b, 0);
    if (totalImportance > 0) {
      this.featureImportances = this.featureImportances.map(imp => imp / totalImportance);
    }

    this.trained = true;
    return this;
  }

  /**
   * Predict using the fitted model
   * @param {number[][]} X Feature matrix
   * @returns {number[]} Predictions
   */
  predict(X) {
    if (!this.trained) {
      throw new Error('Model not trained. Call fit() first.');
    }

    return X.map(x => {
      let prediction = this.initialPrediction;
      for (const { tree, featureIndices } of this.trees) {
        prediction += this.learningRate * this._predictTree(tree, x, featureIndices);
      }
      return prediction;
    });
  }

  /**
   * Get feature importance scores
   * @returns {number[]} Importance for each feature
   */
  getFeatureImportances() {
    return this.featureImportances;
  }

  /**
   * Subsample row indices
   */
  _subsampleIndices(n) {
    const nSub = Math.floor(n * this.subsample);
    const indices = [];
    const available = new Set([...Array(n).keys()]);

    while (indices.length < nSub) {
      const idx = Math.floor(Math.random() * n);
      if (available.has(idx)) {
        indices.push(idx);
        available.delete(idx);
      }
    }
    return indices;
  }

  /**
   * Subsample feature indices
   */
  _subsampleFeatures(n) {
    const nSub = Math.floor(n * this.colsampleBytree);
    const indices = [];
    const available = new Set([...Array(n).keys()]);

    while (indices.length < nSub) {
      const idx = Math.floor(Math.random() * n);
      if (available.has(idx)) {
        indices.push(idx);
        available.delete(idx);
      }
    }
    return indices.sort((a, b) => a - b);
  }

  /**
   * Fit a decision tree to the residuals
   */
  _fitTree(X, y, featureIndices, depth) {
    const node = new DecisionTreeNode();
    const n = X.length;

    // Check stopping conditions
    if (depth >= this.maxDepth || n < this.minSamplesSplit) {
      node.isLeaf = true;
      node.prediction = y.reduce((a, b) => a + b, 0) / n;
      return node;
    }

    // Find best split
    let bestGain = -Infinity;
    let bestFeatureIdx = null;
    let bestThreshold = null;
    let bestLeftIndices = null;
    let bestRightIndices = null;

    const currentMSE = this._calculateMSE(y);

    for (const featureIdx of featureIndices) {
      const values = X.map((x, i) => ({ value: x[featureIdx], idx: i }));
      values.sort((a, b) => a.value - b.value);

      // Try potential split points
      for (let i = 1; i < values.length; i++) {
        if (values[i].value === values[i - 1].value) continue;

        const threshold = (values[i].value + values[i - 1].value) / 2;
        const leftIndices = [];
        const rightIndices = [];

        for (let j = 0; j < n; j++) {
          if (X[j][featureIdx] <= threshold) {
            leftIndices.push(j);
          } else {
            rightIndices.push(j);
          }
        }

        if (leftIndices.length === 0 || rightIndices.length === 0) continue;

        const leftY = leftIndices.map(idx => y[idx]);
        const rightY = rightIndices.map(idx => y[idx]);

        const leftMSE = this._calculateMSE(leftY);
        const rightMSE = this._calculateMSE(rightY);
        const weightedMSE = (leftY.length * leftMSE + rightY.length * rightMSE) / n;
        const gain = currentMSE - weightedMSE;

        if (gain > bestGain) {
          bestGain = gain;
          bestFeatureIdx = featureIdx;
          bestThreshold = threshold;
          bestLeftIndices = leftIndices;
          bestRightIndices = rightIndices;
        }
      }
    }

    // If no valid split found, make leaf
    if (bestFeatureIdx === null) {
      node.isLeaf = true;
      node.prediction = y.reduce((a, b) => a + b, 0) / n;
      return node;
    }

    // Track feature importance (gain-based)
    this.featureImportances[bestFeatureIdx] += bestGain * n;

    // Create split node
    node.featureIndex = bestFeatureIdx;
    node.threshold = bestThreshold;

    const leftX = bestLeftIndices.map(idx => X[idx]);
    const leftY = bestLeftIndices.map(idx => y[idx]);
    const rightX = bestRightIndices.map(idx => X[idx]);
    const rightY = bestRightIndices.map(idx => y[idx]);

    node.left = this._fitTree(leftX, leftY, featureIndices, depth + 1);
    node.right = this._fitTree(rightX, rightY, featureIndices, depth + 1);

    return node;
  }

  /**
   * Predict using a single tree
   */
  _predictTree(node, x, featureIndices) {
    if (node.isLeaf) {
      return node.prediction;
    }

    if (x[node.featureIndex] <= node.threshold) {
      return this._predictTree(node.left, x, featureIndices);
    } else {
      return this._predictTree(node.right, x, featureIndices);
    }
  }

  /**
   * Calculate MSE of values
   */
  _calculateMSE(y) {
    const mean = y.reduce((a, b) => a + b, 0) / y.length;
    return y.reduce((sum, yi) => sum + Math.pow(yi - mean, 2), 0) / y.length;
  }

  /**
   * Serialize model for storage
   */
  toJSON() {
    return {
      nEstimators: this.nEstimators,
      maxDepth: this.maxDepth,
      learningRate: this.learningRate,
      minSamplesSplit: this.minSamplesSplit,
      subsample: this.subsample,
      colsampleBytree: this.colsampleBytree,
      initialPrediction: this.initialPrediction,
      featureImportances: this.featureImportances,
      trees: this.trees.map(({ tree, featureIndices }) => ({
        tree: this._serializeTree(tree),
        featureIndices
      })),
      trained: this.trained
    };
  }

  _serializeTree(node) {
    if (node.isLeaf) {
      return { isLeaf: true, prediction: node.prediction };
    }
    return {
      isLeaf: false,
      featureIndex: node.featureIndex,
      threshold: node.threshold,
      left: this._serializeTree(node.left),
      right: this._serializeTree(node.right)
    };
  }

  /**
   * Load model from serialized data
   */
  static fromJSON(data) {
    const model = new GradientBoostingRegressor({
      nEstimators: data.nEstimators,
      maxDepth: data.maxDepth,
      learningRate: data.learningRate,
      minSamplesSplit: data.minSamplesSplit,
      subsample: data.subsample,
      colsampleBytree: data.colsampleBytree
    });
    model.initialPrediction = data.initialPrediction;
    model.featureImportances = data.featureImportances;
    model.trees = data.trees.map(({ tree, featureIndices }) => ({
      tree: model._deserializeTree(tree),
      featureIndices
    }));
    model.trained = data.trained;
    return model;
  }

  _deserializeTree(data) {
    const node = new DecisionTreeNode();
    if (data.isLeaf) {
      node.isLeaf = true;
      node.prediction = data.prediction;
    } else {
      node.isLeaf = false;
      node.featureIndex = data.featureIndex;
      node.threshold = data.threshold;
      node.left = this._deserializeTree(data.left);
      node.right = this._deserializeTree(data.right);
    }
    return node;
  }
}


/**
 * MLSignalCombiner - Uses gradient boosting to combine trading signals
 */
class MLSignalCombiner {
  /**
   * @param {Database} db better-sqlite3 database instance
   * @param {Object} config Configuration options
   */
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      // Model parameters
      nEstimators: config.nEstimators || 100,
      maxDepth: config.maxDepth || 4,
      learningRate: config.learningRate || 0.1,
      minSamplesSplit: config.minSamplesSplit || 20,

      // Training parameters
      lookbackDays: config.lookbackDays || 365 * 2, // 2 years of data
      minSamples: config.minSamples || 100,

      // Target horizon in days
      targetHorizons: config.targetHorizons || [21, 63, 126], // 1m, 3m, 6m

      ...config
    };

    // Signal types we combine
    this.signalTypes = [
      'technical',
      'sentiment',
      'insider',
      'fundamental',
      'alternativeData',
      'valuation',
      'thirteenF',
      'earningsMomentum',
      'valueQuality'
    ];

    // Feature names for interpretability
    this.featureNames = [
      ...this.signalTypes,
      'regime_code',
      'sector_code',
      'market_cap_bucket'
    ];

    // Models for different horizons
    this.models = {};
    this.lastTrainDate = null;
    this.trainingStats = null;

    // Prepared statements
    this._initStatements();

    console.log('🤖 MLSignalCombiner initialized');
  }

  _initStatements() {
    // Get historical recommendations with outcomes
    // Note: recommendation_outcomes table uses recommended_at and return_* columns
    this.stmtGetTrainingData = this.db.prepare(`
      SELECT
        ro.company_id,
        ro.recommended_at as recommendation_date,
        json_extract(ro.signal_breakdown, '$.technical') as signal_technical,
        json_extract(ro.signal_breakdown, '$.sentiment') as signal_sentiment,
        json_extract(ro.signal_breakdown, '$.insider') as signal_insider,
        json_extract(ro.signal_breakdown, '$.fundamental') as signal_fundamental,
        json_extract(ro.signal_breakdown, '$.alternative') as signal_alternative_data,
        json_extract(ro.signal_breakdown, '$.valuation') as signal_valuation,
        json_extract(ro.signal_breakdown, '$.thirteenF') as signal_thirteen_f,
        json_extract(ro.signal_breakdown, '$.earnings') as signal_earnings_momentum,
        json_extract(ro.signal_breakdown, '$.valueQuality') as signal_value_quality,
        ro.regime,
        c.sector,
        c.market_cap,
        ro.return_1d as forward_return_1d,
        ro.return_5d as forward_return_5d,
        ro.return_21d as forward_return_21d,
        ro.return_63d as forward_return_63d,
        ro.return_63d as forward_return_126d
      FROM recommendation_outcomes ro
      JOIN companies c ON c.id = ro.company_id
      WHERE ro.recommended_at >= date('now', '-' || ? || ' days')
        AND ro.return_21d IS NOT NULL
      ORDER BY ro.recommended_at DESC
    `);

    // Store model to database
    this.stmtSaveModel = this.db.prepare(`
      INSERT OR REPLACE INTO ml_models (
        model_name, model_type, horizon_days, model_data,
        feature_importances, training_samples, validation_metrics,
        created_at, updated_at
      ) VALUES (?, 'signal_combiner', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    // Load model from database
    this.stmtLoadModel = this.db.prepare(`
      SELECT model_data, feature_importances, training_samples, validation_metrics
      FROM ml_models
      WHERE model_name = ? AND model_type = 'signal_combiner'
    `);

    // Ensure table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ml_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        horizon_days INTEGER,
        model_data TEXT,
        feature_importances TEXT,
        training_samples INTEGER,
        validation_metrics TEXT,
        created_at TEXT,
        updated_at TEXT,
        UNIQUE(model_name, model_type)
      )
    `);
  }

  /**
   * Train models on historical data using existing factor scores
   * @param {Object} options Training options
   * @returns {Object} Training results
   */
  train(options = {}) {
    const lookbackDays = options.lookbackDays || this.config.lookbackDays;

    // Use TrainingDataAssembler to get data from stock_factor_scores + daily_prices
    const assembler = new TrainingDataAssembler(this.db);

    // Check data availability
    const status = assembler.getStatus();
    console.log(`📊 Factor data available: ${status.factorRecords} records, ${status.factorCompanies} companies`);
    console.log(`📊 Factor data range: ${status.factorDateRange?.min} to ${status.factorDateRange?.max}`);

    if (!status.readyForTraining) {
      return {
        success: false,
        error: `Insufficient factor data. Need at least 100 records with returns, have ${status.trainableRecords || 0}`,
        factorRecordsAvailable: status.factorRecords
      };
    }

    // Calculate appropriate date range based on lookbackDays
    // Factor scores are quarterly, so we need to map lookback appropriately
    // 365 days = ~1 year = ~4 quarters
    // 730 days = ~2 years = ~8 quarters
    // Use the factor data range directly if lookback covers it
    const factorMinDate = status.factorDateRange?.min || '2021-01-01';
    const startDate = lookbackDays >= 1825 ? factorMinDate : this._getDateDaysAgo(lookbackDays);

    // End date needs to leave room for forward returns (max horizon + buffer)
    const maxHorizon = Math.max(...this.config.targetHorizons);
    const endDate = this._getDateDaysAgo(maxHorizon + 30); // Extra buffer for finding price dates

    console.log(`📊 Training date range: ${startDate} to ${endDate}`);

    // Get training matrices from existing factor data
    const trainingData = assembler.getTrainingMatrices({
      startDate,
      endDate,
      targetHorizon: 21, // Primary horizon
      normalizeFeatures: true,
      maxRecords: 50000,  // Limit for memory
      sampleRate: 1.0  // Use all available data
    });

    const { features, targets, featureNames, metadata, rawData } = trainingData;

    if (features.length < this.config.minSamples) {
      return {
        success: false,
        error: `Insufficient training data. Need ${this.config.minSamples}, have ${features.length}`,
        samplesAvailable: features.length,
        dateRange: metadata.dateRange
      };
    }

    console.log(`📊 Training on ${features.length} samples (${metadata.uniqueCompanies} companies, ${metadata.dateRange.min} to ${metadata.dateRange.max})`);

    // Update feature names for this data source
    this.featureNames = featureNames;

    // Train model for each target horizon
    const results = {};

    for (const horizon of this.config.targetHorizons) {
      // Calculate end date for this horizon (needs room for forward returns)
      const horizonEndDate = this._getDateDaysAgo(horizon + 30);

      // Get data for this specific horizon
      const horizonData = assembler.getTrainingMatrices({
        startDate,
        endDate: horizonEndDate,
        targetHorizon: horizon,
        normalizeFeatures: true,
        maxRecords: 50000,
        sampleRate: 1.0
      });

      const X = horizonData.features;
      const y = horizonData.targets;

      if (X.length < this.config.minSamples) {
        results[horizon] = {
          error: `Insufficient samples for ${horizon}d horizon`,
          samplesAvailable: X.length
        };
        continue;
      }

      // Train/validation split (80/20, time-ordered for proper walk-forward)
      const splitIdx = Math.floor(X.length * 0.8);
      const XTrain = X.slice(0, splitIdx);
      const yTrain = y.slice(0, splitIdx);
      const XVal = X.slice(splitIdx);
      const yVal = y.slice(splitIdx);

      console.log(`  Training ${horizon}d model: ${XTrain.length} train, ${XVal.length} validation samples`);

      // Train model
      const model = new GradientBoostingRegressor({
        nEstimators: this.config.nEstimators,
        maxDepth: this.config.maxDepth,
        learningRate: this.config.learningRate,
        minSamplesSplit: this.config.minSamplesSplit
      });

      model.fit(XTrain, yTrain);

      // Validate
      const predictions = model.predict(XVal);
      const metrics = this._calculateMetrics(yVal, predictions);

      // Store model
      this.models[horizon] = model;

      // Get feature importance with correct names
      const importances = model.getFeatureImportances();
      const featureImportanceMap = {};
      featureNames.forEach((name, idx) => {
        featureImportanceMap[name] = importances[idx] || 0;
      });

      // Save to database
      const modelName = `signal_combiner_${horizon}d`;
      this.stmtSaveModel.run(
        modelName,
        horizon,
        JSON.stringify(model.toJSON()),
        JSON.stringify(featureImportanceMap),
        XTrain.length,
        JSON.stringify(metrics)
      );

      results[horizon] = {
        trainingSamples: XTrain.length,
        validationSamples: XVal.length,
        metrics,
        featureImportance: featureImportanceMap
      };

      console.log(`  ✅ ${horizon}d model: R²=${metrics.r2.toFixed(3)}, IC=${metrics.informationCoefficient.toFixed(3)}, Direction=${(metrics.directionAccuracy * 100).toFixed(1)}%`);
    }

    this.lastTrainDate = new Date().toISOString();
    this.trainingStats = {
      totalSamples: features.length,
      uniqueCompanies: metadata.uniqueCompanies,
      dateRange: metadata.dateRange,
      targetStats: metadata.targetStats,
      results
    };

    return {
      success: true,
      trainedAt: this.lastTrainDate,
      totalSamples: features.length,
      trainingSetSize: Math.floor(features.length * 0.8),
      validationSetSize: Math.floor(features.length * 0.2),
      uniqueCompanies: metadata.uniqueCompanies,
      dateRange: metadata.dateRange,
      metrics: Object.fromEntries(
        Object.entries(results)
          .filter(([, v]) => v.metrics)
          .map(([k, v]) => [k, { r2: v.metrics.r2, mae: v.metrics.rmse, ic: v.metrics.informationCoefficient }])
      ),
      results
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

  /**
   * Load trained models from database
   */
  loadModels() {
    for (const horizon of this.config.targetHorizons) {
      const modelName = `signal_combiner_${horizon}d`;
      const row = this.stmtLoadModel.get(modelName);

      if (row && row.model_data) {
        try {
          const modelData = JSON.parse(row.model_data);
          this.models[horizon] = GradientBoostingRegressor.fromJSON(modelData);
          console.log(`📂 Loaded ML model for ${horizon}d horizon`);
        } catch (err) {
          console.error(`Failed to load model for ${horizon}d:`, err.message);
        }
      }
    }

    return Object.keys(this.models).length > 0;
  }

  /**
   * Combine signals using ML model
   * @param {Object} signals Signal scores object
   * @param {Object} context Additional context (regime, sector, marketCap)
   * @param {number} horizon Target horizon in days (default: 21)
   * @returns {Object} Combined signal and components
   */
  combine(signals, context = {}, horizon = 21) {
    // Fall back to linear combination if no model
    if (!this.models[horizon]) {
      return this._linearCombine(signals, context);
    }

    // Extract features
    const features = [
      signals.technical?.score || 0,
      signals.sentiment?.score || 0,
      signals.insider?.score || 0,
      signals.fundamental?.score || 0,
      signals.alternativeData?.score || 0,
      signals.valuation?.score || 0,
      signals.thirteenF?.score || 0,
      signals.earningsMomentum?.score || 0,
      signals.valueQuality?.score || 0,
      this._encodeRegime(context.regime || 'UNKNOWN'),
      this._encodeSector(context.sector || 'Unknown'),
      this._encodeMarketCap(context.marketCap || 0)
    ];

    // Get ML prediction
    const mlPrediction = this.models[horizon].predict([features])[0];

    // Get feature contributions (approximate using feature importances)
    const importances = this.models[horizon].getFeatureImportances();
    const contributions = {};
    this.signalTypes.forEach((signal, idx) => {
      contributions[signal] = {
        score: signals[signal]?.score || 0,
        importance: importances[idx],
        contribution: (signals[signal]?.score || 0) * importances[idx]
      };
    });

    return {
      combinedScore: mlPrediction,
      method: 'ml_gradient_boosting',
      horizon,
      contributions,
      featureImportances: this._getFeatureImportanceMap(this.models[horizon]),
      confidence: this._calculateConfidence(signals, importances)
    };
  }

  /**
   * Linear combination fallback when ML model not available
   */
  _linearCombine(signals, context) {
    // IC-optimized weights (fallback)
    const weights = {
      technical: 0.12,
      sentiment: 0.08,
      insider: 0.15,
      fundamental: 0.14,
      alternativeData: 0.11,
      valuation: 0.12,
      thirteenF: 0.10,
      earningsMomentum: 0.08,
      valueQuality: 0.10
    };

    let weightedSum = 0;
    let totalWeight = 0;
    const contributions = {};

    for (const [signal, weight] of Object.entries(weights)) {
      const score = signals[signal]?.score || 0;
      const confidence = signals[signal]?.confidence || 0;
      const effectiveWeight = weight * (0.5 + 0.5 * confidence);

      weightedSum += score * effectiveWeight;
      totalWeight += effectiveWeight;

      contributions[signal] = {
        score,
        importance: weight,
        contribution: score * weight
      };
    }

    return {
      combinedScore: totalWeight > 0 ? weightedSum / totalWeight : 0,
      method: 'linear_weighted',
      horizon: 21,
      contributions,
      featureImportances: weights,
      confidence: totalWeight / Object.keys(weights).length
    };
  }

  /**
   * Extract features from training data row
   */
  _extractFeatures(row, sectorEncoder, regimeEncoder) {
    return [
      row.signal_technical || 0,
      row.signal_sentiment || 0,
      row.signal_insider || 0,
      row.signal_fundamental || 0,
      row.signal_alternative_data || 0,
      row.signal_valuation || 0,
      row.signal_thirteen_f || 0,
      row.signal_earnings_momentum || 0,
      row.signal_value_quality || 0,
      regimeEncoder[row.regime] || 0,
      sectorEncoder[row.sector] || 0,
      this._encodeMarketCap(row.market_cap)
    ];
  }

  /**
   * Create category encoder (integer encoding)
   */
  _createCategoryEncoder(values) {
    const unique = [...new Set(values.filter(v => v))];
    const encoder = {};
    unique.forEach((val, idx) => {
      encoder[val] = idx + 1;
    });
    return encoder;
  }

  /**
   * Encode regime as numeric
   */
  _encodeRegime(regime) {
    const encoding = {
      'CRISIS': -2,
      'HIGH_VOL': -1,
      'BEAR': -0.5,
      'SIDEWAYS': 0,
      'BULL': 1,
      'LOW_VOL': 0.5,
      'UNKNOWN': 0
    };
    return encoding[regime] || 0;
  }

  /**
   * Encode sector as numeric
   */
  _encodeSector(sector) {
    const sectorCodes = {
      'Technology': 1,
      'Healthcare': 2,
      'Financials': 3,
      'Consumer Discretionary': 4,
      'Consumer Staples': 5,
      'Industrials': 6,
      'Energy': 7,
      'Materials': 8,
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
   * Calculate validation metrics
   */
  _calculateMetrics(yTrue, yPred) {
    const n = yTrue.length;

    // MSE
    const mse = yTrue.reduce((sum, yi, i) => sum + Math.pow(yi - yPred[i], 2), 0) / n;

    // R-squared
    const yMean = yTrue.reduce((a, b) => a + b, 0) / n;
    const ssTotal = yTrue.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const ssResidual = yTrue.reduce((sum, yi, i) => sum + Math.pow(yi - yPred[i], 2), 0);
    const r2 = 1 - (ssResidual / ssTotal);

    // Direction accuracy
    const directionAccuracy = yTrue.reduce((correct, yi, i) => {
      const trueDir = yi > 0 ? 1 : -1;
      const predDir = yPred[i] > 0 ? 1 : -1;
      return correct + (trueDir === predDir ? 1 : 0);
    }, 0) / n;

    // Information Coefficient (correlation)
    const yPredMean = yPred.reduce((a, b) => a + b, 0) / n;
    let covariance = 0;
    let varTrue = 0;
    let varPred = 0;

    for (let i = 0; i < n; i++) {
      covariance += (yTrue[i] - yMean) * (yPred[i] - yPredMean);
      varTrue += Math.pow(yTrue[i] - yMean, 2);
      varPred += Math.pow(yPred[i] - yPredMean, 2);
    }

    const ic = Math.sqrt(varTrue * varPred) > 0
      ? covariance / Math.sqrt(varTrue * varPred)
      : 0;

    return {
      mse,
      rmse: Math.sqrt(mse),
      r2,
      directionAccuracy,
      informationCoefficient: ic
    };
  }

  /**
   * Get feature importance as named map
   */
  _getFeatureImportanceMap(model) {
    const importances = model.getFeatureImportances();
    const map = {};
    this.featureNames.forEach((name, idx) => {
      map[name] = importances[idx] || 0;
    });
    return map;
  }

  /**
   * Calculate prediction confidence based on signal coverage
   */
  _calculateConfidence(signals, importances) {
    let totalImportance = 0;
    let coveredImportance = 0;

    this.signalTypes.forEach((signal, idx) => {
      const importance = importances[idx] || 0;
      totalImportance += importance;
      if (signals[signal] && signals[signal].confidence > 0) {
        coveredImportance += importance * signals[signal].confidence;
      }
    });

    return totalImportance > 0 ? coveredImportance / totalImportance : 0;
  }

  /**
   * Check if any model is trained
   */
  isModelTrained() {
    return Object.keys(this.models).length > 0;
  }

  /**
   * Get model status and training info
   */
  getStatus() {
    // Get factor data status
    const assembler = new TrainingDataAssembler(this.db);
    const factorStatus = assembler.getStatus();

    // Get saved model info from database
    let savedModels = [];
    try {
      savedModels = this.db.prepare(`
        SELECT model_name, horizon_days, training_samples, updated_at,
               json_extract(validation_metrics, '$.r2') as r2,
               json_extract(validation_metrics, '$.informationCoefficient') as ic
        FROM ml_models
        WHERE model_type = 'signal_combiner'
        ORDER BY horizon_days
      `).all();
    } catch (e) {
      // Table may not exist yet
    }

    return {
      modelsLoaded: Object.keys(this.models).length > 0,
      horizons: Object.keys(this.models).map(h => parseInt(h)),
      lastTrainedAt: this.lastTrainDate || (savedModels[0]?.updated_at),
      trainingSamples: this.trainingStats?.totalSamples || (savedModels[0]?.training_samples),
      trainingStats: this.trainingStats,
      // Top-level factor data fields for UI (No Model State)
      factorDataAvailable: factorStatus.readyForTraining,
      factorRecords: factorStatus.factorRecords,
      factorCompanies: factorStatus.factorCompanies,
      factorDateRange: factorStatus.factorDateRange,
      // Detailed factorData for Train tab
      factorData: {
        recordsAvailable: factorStatus.factorRecords,
        companiesAvailable: factorStatus.factorCompanies,
        dateRange: factorStatus.factorDateRange,
        trainableRecords: factorStatus.trainableRecords,
        readyForTraining: factorStatus.readyForTraining
      },
      savedModels: savedModels.map(m => ({
        horizon: m.horizon_days,
        trainingSamples: m.training_samples,
        r2: m.r2,
        ic: m.ic,
        updatedAt: m.updated_at
      })),
      performance: savedModels.length > 0 ? Object.fromEntries(
        savedModels.map(m => [m.horizon_days, { r2: m.r2, ic: m.ic }])
      ) : null
    };
  }
}

module.exports = {
  MLSignalCombiner,
  GradientBoostingRegressor
};
