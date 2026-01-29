// src/database-migrations/add-trading-signals.js
// AI Trading System - Database Schema
// Tables for market regime detection, technical signals, and signal aggregation

const db = require('../database').db;

console.log('\n📊 Creating AI Trading Signal tables...\n');

// ============================================
// TABLE: Market Regimes
// Tracks market regime classification over time
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS market_regimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    regime TEXT NOT NULL CHECK (regime IN ('BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS')),
    confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

    -- Market indicators
    vix REAL,
    breadth_pct REAL,           -- % of stocks above 50-day MA
    sma_spread REAL,            -- (SMA20 - SMA50) / SMA50
    volatility_20d REAL,        -- 20-day annualized volatility

    -- SPY data at time of classification
    spy_price REAL,
    spy_sma20 REAL,
    spy_sma50 REAL,
    spy_sma200 REAL,

    -- Additional context
    trend_strength REAL,        -- -1 to +1, strength of trend
    description TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_regimes_date ON market_regimes(date DESC);
  CREATE INDEX IF NOT EXISTS idx_regimes_regime ON market_regimes(regime);
`);

console.log('✅ Created market_regimes table');

// ============================================
// TABLE: Technical Signals
// Stores calculated technical signals for each stock
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS technical_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    calculated_at TEXT NOT NULL,

    -- Overall technical score
    score REAL CHECK (score >= -1 AND score <= 1),
    confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
    signal TEXT,                -- strong_buy, buy, lean_buy, hold, lean_sell, sell, strong_sell
    signal_strength INTEGER CHECK (signal_strength >= 1 AND signal_strength <= 5),

    -- Individual indicator values
    rsi_14 REAL,
    rsi_score REAL,

    macd_line REAL,
    macd_signal REAL,
    macd_histogram REAL,
    macd_score REAL,

    sma_20 REAL,
    sma_50 REAL,
    sma_200 REAL,
    trend_score REAL,

    atr_14 REAL,
    volume_trend REAL,
    volume_score REAL,

    -- Current price for reference
    current_price REAL,

    -- Interpretation
    interpretation TEXT,        -- JSON array of signal interpretations

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_signals_unique ON technical_signals(company_id, date(calculated_at));
  CREATE INDEX IF NOT EXISTS idx_tech_signals_symbol ON technical_signals(symbol);
  CREATE INDEX IF NOT EXISTS idx_tech_signals_date ON technical_signals(calculated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tech_signals_score ON technical_signals(score DESC);
`);

console.log('✅ Created technical_signals table');

// ============================================
// TABLE: Aggregated Signals
// Combined signals from all sources for trading decisions
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS aggregated_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    calculated_at TEXT NOT NULL,

    -- Current market regime
    market_regime TEXT,
    regime_confidence REAL,

    -- Technical signals
    technical_score REAL,
    technical_confidence REAL,
    technical_signal TEXT,

    -- Sentiment signals
    sentiment_score REAL,
    sentiment_confidence REAL,
    sentiment_signal TEXT,

    -- Insider signals
    insider_score REAL,
    insider_confidence REAL,
    insider_signal TEXT,

    -- Analyst signals (if available)
    analyst_score REAL,
    analyst_confidence REAL,
    analyst_signal TEXT,

    -- Aggregated summary
    avg_score REAL,
    weighted_score REAL,        -- Weighted by confidence
    bullish_count INTEGER,
    bearish_count INTEGER,
    highest_confidence REAL,

    -- Overall signal
    overall_signal TEXT,
    overall_strength INTEGER,
    overall_confidence REAL,

    -- Context for Agent 2
    context TEXT,               -- JSON with additional context

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_agg_signals_unique ON aggregated_signals(company_id, date(calculated_at));
  CREATE INDEX IF NOT EXISTS idx_agg_signals_symbol ON aggregated_signals(symbol);
  CREATE INDEX IF NOT EXISTS idx_agg_signals_date ON aggregated_signals(calculated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_agg_signals_overall ON aggregated_signals(overall_signal);
`);

console.log('✅ Created aggregated_signals table');

// ============================================
// TABLE: Signal Cache
// Caches expensive calculations
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS signal_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    cache_value TEXT NOT NULL,    -- JSON blob
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_signal_cache_key ON signal_cache(cache_key);
  CREATE INDEX IF NOT EXISTS idx_signal_cache_expires ON signal_cache(expires_at);
`);

console.log('✅ Created signal_cache table');

// ============================================
// TABLE: Trading Signal History
// Historical log of all signals for backtesting
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS trading_signal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    signal_date TEXT NOT NULL,

    -- Signal details
    signal_type TEXT NOT NULL,   -- 'entry', 'exit', 'hold'
    signal_direction TEXT,       -- 'long', 'short', 'neutral'
    signal_strength INTEGER,
    confidence REAL,

    -- Price at signal
    price_at_signal REAL,

    -- Contributing factors
    technical_contribution REAL,
    sentiment_contribution REAL,
    insider_contribution REAL,
    regime_contribution REAL,

    -- Regime context
    market_regime TEXT,

    -- For backtesting
    price_1d_later REAL,
    price_5d_later REAL,
    price_20d_later REAL,
    return_1d REAL,
    return_5d REAL,
    return_20d REAL,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_signal_history_symbol ON trading_signal_history(symbol);
  CREATE INDEX IF NOT EXISTS idx_signal_history_date ON trading_signal_history(signal_date DESC);
  CREATE INDEX IF NOT EXISTS idx_signal_history_type ON trading_signal_history(signal_type);
`);

console.log('✅ Created trading_signal_history table');

// ============================================
// Helper Views
// ============================================

// View: Latest signals per stock
db.exec(`
  CREATE VIEW IF NOT EXISTS v_latest_aggregated_signals AS
  SELECT ags.*
  FROM aggregated_signals ags
  INNER JOIN (
    SELECT company_id, MAX(calculated_at) as max_date
    FROM aggregated_signals
    GROUP BY company_id
  ) latest ON ags.company_id = latest.company_id AND ags.calculated_at = latest.max_date
`);

// View: Stocks with bullish signals
db.exec(`
  CREATE VIEW IF NOT EXISTS v_bullish_signals AS
  SELECT
    ags.*,
    c.name as company_name,
    c.sector,
    c.industry
  FROM v_latest_aggregated_signals ags
  JOIN companies c ON ags.company_id = c.id
  WHERE ags.overall_signal IN ('strong_buy', 'buy', 'lean_buy')
  ORDER BY ags.weighted_score DESC
`);

// View: Current market regime
db.exec(`
  CREATE VIEW IF NOT EXISTS v_current_regime AS
  SELECT *
  FROM market_regimes
  ORDER BY date DESC
  LIMIT 1
`);

console.log('✅ Created helper views');

console.log('\n✅ AI Trading Signal migration complete!\n');
