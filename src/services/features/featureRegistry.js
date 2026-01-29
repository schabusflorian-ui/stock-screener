// src/services/features/featureRegistry.js
// Central Feature Registry - Catalog of all features with metadata and versioning

const { db } = require('../../database');

/**
 * Feature Types
 */
const FEATURE_TYPES = {
  PRICE: 'price',           // Raw price data
  TECHNICAL: 'technical',    // Technical indicators
  FUNDAMENTAL: 'fundamental', // Financial metrics
  SENTIMENT: 'sentiment',    // Sentiment scores
  FACTOR: 'factor',          // Factor scores
  ALTERNATIVE: 'alternative', // Alternative data
  DERIVED: 'derived',        // Computed from other features
  ML: 'ml'                   // ML model outputs
};

/**
 * Feature Frequencies
 */
const FREQUENCIES = {
  TICK: 'tick',
  MINUTE: 'minute',
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ANNUAL: 'annual'
};

/**
 * Feature Registry
 *
 * Central catalog of all features with:
 * - Metadata (type, frequency, description)
 * - SQL/computation definitions
 * - Version tracking
 * - Lineage information
 */
class FeatureRegistry {
  constructor() {
    this.features = new Map();
    this.versions = new Map();
    this._ensureTablesExist();
    this._registerBuiltInFeatures();
  }

  /**
   * Create database tables for feature metadata
   */
  _ensureTablesExist() {
    db.exec(`
      -- Feature definitions
      CREATE TABLE IF NOT EXISTS feature_definitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT,
        description TEXT,
        feature_type TEXT NOT NULL,
        frequency TEXT NOT NULL,

        -- Source information
        source_table TEXT,
        source_column TEXT,
        computation_sql TEXT,
        computation_js TEXT,

        -- Dependencies
        depends_on TEXT, -- JSON array of feature names

        -- Metadata
        unit TEXT,
        value_type TEXT DEFAULT 'float', -- float, int, category, boolean
        nullable BOOLEAN DEFAULT 0,

        -- Statistics
        expected_min REAL,
        expected_max REAL,
        expected_mean REAL,
        expected_std REAL,

        -- Versioning
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deprecated BOOLEAN DEFAULT 0,
        deprecated_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_feature_def_name ON feature_definitions(name);
      CREATE INDEX IF NOT EXISTS idx_feature_def_type ON feature_definitions(feature_type);

      -- Feature versions history
      CREATE TABLE IF NOT EXISTS feature_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_name TEXT NOT NULL,
        version INTEGER NOT NULL,
        computation_sql TEXT,
        computation_js TEXT,
        change_description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        created_by TEXT DEFAULT 'system'
      );

      -- Feature access log for lineage
      CREATE TABLE IF NOT EXISTS feature_access_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_name TEXT NOT NULL,
        entity_id INTEGER,
        as_of_date TEXT,
        accessed_at TEXT DEFAULT (datetime('now')),
        access_context TEXT -- 'training', 'inference', 'backtest', 'live'
      );

      CREATE INDEX IF NOT EXISTS idx_feature_access_date ON feature_access_log(accessed_at);
    `);
  }

  /**
   * Register all built-in features
   */
  _registerBuiltInFeatures() {
    // Price features
    this._registerPriceFeatures();

    // Technical features
    this._registerTechnicalFeatures();

    // Fundamental features
    this._registerFundamentalFeatures();

    // Factor features
    this._registerFactorFeatures();

    // Sentiment features
    this._registerSentimentFeatures();

    // Alternative data features
    this._registerAlternativeFeatures();
  }

  /**
   * Register price-based features
   */
  _registerPriceFeatures() {
    const priceFeatures = [
      {
        name: 'close',
        displayName: 'Close Price',
        description: 'Daily closing price',
        type: FEATURE_TYPES.PRICE,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'daily_prices',
        sourceColumn: 'close',
        unit: 'USD'
      },
      {
        name: 'adjusted_close',
        displayName: 'Adjusted Close',
        description: 'Split and dividend adjusted closing price',
        type: FEATURE_TYPES.PRICE,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'daily_prices',
        sourceColumn: 'adjusted_close',
        unit: 'USD'
      },
      {
        name: 'volume',
        displayName: 'Volume',
        description: 'Daily trading volume',
        type: FEATURE_TYPES.PRICE,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'daily_prices',
        sourceColumn: 'volume',
        unit: 'shares'
      },
      {
        name: 'return_1d',
        displayName: '1-Day Return',
        description: 'One day price return',
        type: FEATURE_TYPES.DERIVED,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['adjusted_close'],
        computationSql: `
          (dp.adjusted_close - LAG(dp.adjusted_close) OVER (PARTITION BY dp.company_id ORDER BY dp.date))
          / LAG(dp.adjusted_close) OVER (PARTITION BY dp.company_id ORDER BY dp.date)
        `,
        unit: 'ratio'
      },
      {
        name: 'return_5d',
        displayName: '5-Day Return',
        description: 'Five day price return',
        type: FEATURE_TYPES.DERIVED,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['adjusted_close'],
        computationSql: `
          (dp.adjusted_close - LAG(dp.adjusted_close, 5) OVER (PARTITION BY dp.company_id ORDER BY dp.date))
          / LAG(dp.adjusted_close, 5) OVER (PARTITION BY dp.company_id ORDER BY dp.date)
        `,
        unit: 'ratio'
      },
      {
        name: 'return_21d',
        displayName: '21-Day Return',
        description: 'Twenty-one day price return (approx 1 month)',
        type: FEATURE_TYPES.DERIVED,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['adjusted_close'],
        computationSql: `
          (dp.adjusted_close - LAG(dp.adjusted_close, 21) OVER (PARTITION BY dp.company_id ORDER BY dp.date))
          / LAG(dp.adjusted_close, 21) OVER (PARTITION BY dp.company_id ORDER BY dp.date)
        `,
        unit: 'ratio'
      },
      {
        name: 'volatility_20d',
        displayName: '20-Day Volatility',
        description: 'Annualized 20-day rolling standard deviation of returns',
        type: FEATURE_TYPES.DERIVED,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['return_1d'],
        unit: 'ratio'
      }
    ];

    priceFeatures.forEach(f => this.register(f));
  }

  /**
   * Register technical indicator features
   */
  _registerTechnicalFeatures() {
    const technicalFeatures = [
      {
        name: 'rsi_14',
        displayName: 'RSI (14)',
        description: 'Relative Strength Index with 14-day period',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close'],
        expectedMin: 0,
        expectedMax: 100,
        unit: 'index'
      },
      {
        name: 'macd',
        displayName: 'MACD',
        description: 'Moving Average Convergence Divergence',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close'],
        unit: 'price_diff'
      },
      {
        name: 'macd_signal',
        displayName: 'MACD Signal',
        description: 'MACD Signal Line (9-day EMA of MACD)',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['macd'],
        unit: 'price_diff'
      },
      {
        name: 'sma_20',
        displayName: 'SMA (20)',
        description: '20-day Simple Moving Average',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close'],
        unit: 'USD'
      },
      {
        name: 'sma_50',
        displayName: 'SMA (50)',
        description: '50-day Simple Moving Average',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close'],
        unit: 'USD'
      },
      {
        name: 'sma_200',
        displayName: 'SMA (200)',
        description: '200-day Simple Moving Average',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close'],
        unit: 'USD'
      },
      {
        name: 'bollinger_upper',
        displayName: 'Bollinger Upper',
        description: 'Bollinger Band Upper (SMA20 + 2*std)',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close', 'sma_20'],
        unit: 'USD'
      },
      {
        name: 'bollinger_lower',
        displayName: 'Bollinger Lower',
        description: 'Bollinger Band Lower (SMA20 - 2*std)',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close', 'sma_20'],
        unit: 'USD'
      },
      {
        name: 'atr_14',
        displayName: 'ATR (14)',
        description: 'Average True Range (14-day)',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        dependsOn: ['close', 'high', 'low'],
        unit: 'USD'
      },
      {
        name: 'adx_14',
        displayName: 'ADX (14)',
        description: 'Average Directional Index (14-day)',
        type: FEATURE_TYPES.TECHNICAL,
        frequency: FREQUENCIES.DAILY,
        expectedMin: 0,
        expectedMax: 100,
        unit: 'index'
      }
    ];

    technicalFeatures.forEach(f => this.register(f));
  }

  /**
   * Register fundamental features
   */
  _registerFundamentalFeatures() {
    const fundamentalFeatures = [
      {
        name: 'pe_ratio',
        displayName: 'P/E Ratio',
        description: 'Price to Earnings ratio',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'pe_ratio',
        unit: 'ratio'
      },
      {
        name: 'pb_ratio',
        displayName: 'P/B Ratio',
        description: 'Price to Book ratio',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'pb_ratio',
        unit: 'ratio'
      },
      {
        name: 'ps_ratio',
        displayName: 'P/S Ratio',
        description: 'Price to Sales ratio',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'ps_ratio',
        unit: 'ratio'
      },
      {
        name: 'roe',
        displayName: 'ROE',
        description: 'Return on Equity',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'roe',
        unit: 'ratio'
      },
      {
        name: 'roa',
        displayName: 'ROA',
        description: 'Return on Assets',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'roa',
        unit: 'ratio'
      },
      {
        name: 'gross_margin',
        displayName: 'Gross Margin',
        description: 'Gross Profit / Revenue',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'gross_margin',
        unit: 'ratio'
      },
      {
        name: 'operating_margin',
        displayName: 'Operating Margin',
        description: 'Operating Income / Revenue',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'operating_margin',
        unit: 'ratio'
      },
      {
        name: 'net_margin',
        displayName: 'Net Margin',
        description: 'Net Income / Revenue',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'net_margin',
        unit: 'ratio'
      },
      {
        name: 'debt_to_equity',
        displayName: 'Debt/Equity',
        description: 'Total Debt / Total Equity',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'debt_to_equity',
        unit: 'ratio'
      },
      {
        name: 'current_ratio',
        displayName: 'Current Ratio',
        description: 'Current Assets / Current Liabilities',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'current_ratio',
        unit: 'ratio'
      },
      {
        name: 'revenue_growth',
        displayName: 'Revenue Growth',
        description: 'Year-over-year revenue growth rate',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'revenue_growth_yoy',
        unit: 'ratio'
      },
      {
        name: 'earnings_growth',
        displayName: 'Earnings Growth',
        description: 'Year-over-year earnings growth rate',
        type: FEATURE_TYPES.FUNDAMENTAL,
        frequency: FREQUENCIES.QUARTERLY,
        sourceTable: 'calculated_metrics',
        sourceColumn: 'eps_growth_yoy',
        unit: 'ratio'
      }
    ];

    fundamentalFeatures.forEach(f => this.register(f));
  }

  /**
   * Register factor features
   */
  _registerFactorFeatures() {
    const factorFeatures = [
      {
        name: 'factor_value',
        displayName: 'Value Factor',
        description: 'Composite value score (PE, PB, PS, EY)',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'value_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      },
      {
        name: 'factor_quality',
        displayName: 'Quality Factor',
        description: 'Composite quality score (ROE, margins, stability)',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'quality_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      },
      {
        name: 'factor_momentum',
        displayName: 'Momentum Factor',
        description: '12-1 month price momentum',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'momentum_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      },
      {
        name: 'factor_size',
        displayName: 'Size Factor',
        description: 'Market cap ranking (lower = smaller)',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'size_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      },
      {
        name: 'factor_volatility',
        displayName: 'Volatility Factor',
        description: 'Low volatility score (higher = less volatile)',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'volatility_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      },
      {
        name: 'factor_growth',
        displayName: 'Growth Factor',
        description: 'Revenue and earnings growth',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'growth_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      },
      {
        name: 'composite_score',
        displayName: 'Composite Score',
        description: 'Combined multi-factor score',
        type: FEATURE_TYPES.FACTOR,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'stock_factor_scores',
        sourceColumn: 'composite_score',
        expectedMin: 0,
        expectedMax: 100,
        unit: 'percentile'
      }
    ];

    factorFeatures.forEach(f => this.register(f));
  }

  /**
   * Register sentiment features
   */
  _registerSentimentFeatures() {
    const sentimentFeatures = [
      {
        name: 'sentiment_composite',
        displayName: 'Composite Sentiment',
        description: 'Combined sentiment from all sources',
        type: FEATURE_TYPES.SENTIMENT,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'sentiment_summary',
        sourceColumn: 'weighted_sentiment',
        expectedMin: -1,
        expectedMax: 1,
        unit: 'score'
      },
      {
        name: 'sentiment_news',
        displayName: 'News Sentiment',
        description: 'Sentiment from news articles',
        type: FEATURE_TYPES.SENTIMENT,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'sentiment_summary',
        sourceColumn: 'avg_sentiment',
        expectedMin: -1,
        expectedMax: 1,
        unit: 'score'
      },
      {
        name: 'sentiment_social',
        displayName: 'Social Sentiment',
        description: 'Sentiment from social media (Reddit, StockTwits)',
        type: FEATURE_TYPES.SENTIMENT,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'combined_sentiment',
        sourceColumn: 'reddit_sentiment',
        expectedMin: -1,
        expectedMax: 1,
        unit: 'score'
      }
    ];

    sentimentFeatures.forEach(f => this.register(f));
  }

  /**
   * Register alternative data features
   */
  _registerAlternativeFeatures() {
    const alternativeFeatures = [
      {
        name: 'insider_signal',
        displayName: 'Insider Signal',
        description: 'Net insider buying/selling signal',
        type: FEATURE_TYPES.ALTERNATIVE,
        frequency: FREQUENCIES.DAILY,
        dependsOn: [],
        expectedMin: -1,
        expectedMax: 1,
        unit: 'score'
      },
      {
        name: 'congressional_signal',
        displayName: 'Congressional Signal',
        description: 'Congressional trading signal',
        type: FEATURE_TYPES.ALTERNATIVE,
        frequency: FREQUENCIES.DAILY,
        dependsOn: [],
        expectedMin: -1,
        expectedMax: 1,
        unit: 'score'
      },
      {
        name: 'institutional_ownership',
        displayName: 'Institutional Ownership',
        description: 'Percentage held by institutions',
        type: FEATURE_TYPES.ALTERNATIVE,
        frequency: FREQUENCIES.QUARTERLY,
        expectedMin: 0,
        expectedMax: 1,
        unit: 'ratio'
      },
      {
        name: 'analyst_rating',
        displayName: 'Analyst Rating',
        description: 'Consensus analyst rating',
        type: FEATURE_TYPES.ALTERNATIVE,
        frequency: FREQUENCIES.DAILY,
        sourceTable: 'analyst_estimates',
        expectedMin: 1,
        expectedMax: 5,
        unit: 'rating'
      }
    ];

    alternativeFeatures.forEach(f => this.register(f));
  }

  /**
   * Register a new feature
   */
  register(definition) {
    const {
      name,
      displayName,
      description,
      type,
      frequency,
      sourceTable,
      sourceColumn,
      computationSql,
      computationJs,
      dependsOn = [],
      unit,
      valueType = 'float',
      nullable = false,
      expectedMin,
      expectedMax,
      expectedMean,
      expectedStd
    } = definition;

    // Store in memory
    this.features.set(name, {
      name,
      displayName: displayName || name,
      description,
      type,
      frequency,
      sourceTable,
      sourceColumn,
      computationSql,
      computationJs,
      dependsOn,
      unit,
      valueType,
      nullable,
      expectedMin,
      expectedMax,
      expectedMean,
      expectedStd,
      version: 1
    });

    // Store in database (upsert)
    try {
      db.prepare(`
        INSERT INTO feature_definitions (
          name, display_name, description, feature_type, frequency,
          source_table, source_column, computation_sql, computation_js,
          depends_on, unit, value_type, nullable,
          expected_min, expected_max, expected_mean, expected_std
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          display_name = excluded.display_name,
          description = excluded.description,
          updated_at = datetime('now')
      `).run(
        name, displayName || name, description, type, frequency,
        sourceTable || null, sourceColumn || null,
        computationSql || null, computationJs || null,
        JSON.stringify(dependsOn), unit || null, valueType, nullable ? 1 : 0,
        expectedMin ?? null, expectedMax ?? null, expectedMean ?? null, expectedStd ?? null
      );
    } catch (err) {
      console.error(`Error registering feature ${name}:`, err.message);
    }

    return this;
  }

  /**
   * Get feature definition
   */
  get(name) {
    return this.features.get(name) || this._loadFromDb(name);
  }

  /**
   * Load feature from database
   */
  _loadFromDb(name) {
    const row = db.prepare(`
      SELECT * FROM feature_definitions WHERE name = ?
    `).get(name);

    if (!row) return null;

    const feature = {
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      type: row.feature_type,
      frequency: row.frequency,
      sourceTable: row.source_table,
      sourceColumn: row.source_column,
      computationSql: row.computation_sql,
      computationJs: row.computation_js,
      dependsOn: JSON.parse(row.depends_on || '[]'),
      unit: row.unit,
      valueType: row.value_type,
      nullable: row.nullable === 1,
      expectedMin: row.expected_min,
      expectedMax: row.expected_max,
      expectedMean: row.expected_mean,
      expectedStd: row.expected_std,
      version: row.version
    };

    this.features.set(name, feature);
    return feature;
  }

  /**
   * Get all features by type
   */
  getByType(type) {
    const result = [];
    for (const [name, feature] of this.features) {
      if (feature.type === type) {
        result.push(feature);
      }
    }
    return result;
  }

  /**
   * Get all registered features
   */
  getAll() {
    return Array.from(this.features.values());
  }

  /**
   * Get features required for ML training
   */
  getMLFeatures() {
    const mlFeatures = [
      // Price-based
      'return_1d', 'return_5d', 'return_21d', 'volatility_20d',
      // Technical
      'rsi_14', 'macd', 'sma_20', 'sma_50', 'atr_14',
      // Fundamental
      'pe_ratio', 'pb_ratio', 'roe', 'roa', 'gross_margin', 'debt_to_equity',
      // Factors
      'factor_value', 'factor_quality', 'factor_momentum', 'factor_size', 'factor_volatility',
      // Sentiment
      'sentiment_composite',
      // Alternative
      'insider_signal', 'institutional_ownership'
    ];

    return mlFeatures.map(name => this.get(name)).filter(Boolean);
  }

  /**
   * Update feature version
   */
  updateVersion(name, changes, changeDescription) {
    const feature = this.get(name);
    if (!feature) {
      throw new Error(`Feature ${name} not found`);
    }

    const newVersion = feature.version + 1;

    // Update in memory
    Object.assign(feature, changes, { version: newVersion });

    // Store old version
    db.prepare(`
      INSERT INTO feature_versions (feature_name, version, computation_sql, computation_js, change_description)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name,
      feature.version,
      feature.computationSql,
      feature.computationJs,
      changeDescription
    );

    // Update current
    db.prepare(`
      UPDATE feature_definitions
      SET computation_sql = ?, computation_js = ?, version = ?, updated_at = datetime('now')
      WHERE name = ?
    `).run(
      changes.computationSql || feature.computationSql,
      changes.computationJs || feature.computationJs,
      newVersion,
      name
    );

    return feature;
  }

  /**
   * Deprecate a feature
   */
  deprecate(name, reason) {
    db.prepare(`
      UPDATE feature_definitions
      SET deprecated = 1, deprecated_reason = ?, updated_at = datetime('now')
      WHERE name = ?
    `).run(reason, name);

    const feature = this.features.get(name);
    if (feature) {
      feature.deprecated = true;
      feature.deprecatedReason = reason;
    }
  }

  /**
   * Log feature access for lineage tracking
   */
  logAccess(featureName, entityId, asOfDate, context = 'live') {
    try {
      db.prepare(`
        INSERT INTO feature_access_log (feature_name, entity_id, as_of_date, access_context)
        VALUES (?, ?, ?, ?)
      `).run(featureName, entityId, asOfDate, context);
    } catch (err) {
      // Non-critical, just log
      console.debug(`Feature access log error: ${err.message}`);
    }
  }

  /**
   * Get feature lineage (what uses this feature)
   */
  getLineage(featureName) {
    // Downstream - features that depend on this one
    const downstream = [];
    for (const [name, feature] of this.features) {
      if (feature.dependsOn && feature.dependsOn.includes(featureName)) {
        downstream.push(name);
      }
    }

    // Upstream - features this one depends on
    const feature = this.get(featureName);
    const upstream = feature?.dependsOn || [];

    return { upstream, downstream };
  }

  /**
   * Export feature definitions to JSON
   */
  export() {
    return {
      features: this.getAll(),
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
  }
}

// Singleton instance
let registryInstance = null;

function getRegistry() {
  if (!registryInstance) {
    registryInstance = new FeatureRegistry();
  }
  return registryInstance;
}

module.exports = {
  FeatureRegistry,
  getRegistry,
  FEATURE_TYPES,
  FREQUENCIES
};
