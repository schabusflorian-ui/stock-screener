// src/database-migrations/003-add-quant-lab-factor-tables.js
// PostgreSQL migration: Quant Lab / user-defined factors tables

async function migrate(db) {
  console.log('🔬 Creating Quant Lab factor tables for PostgreSQL...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS stock_factor_scores (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT,
      score_date DATE NOT NULL,

      value_score REAL,
      size_score REAL,
      momentum_score REAL,
      quality_score REAL,
      profitability_score REAL,
      investment_score REAL,
      growth_score REAL,
      volatility_score REAL,
      beta REAL,
      dividend_score REAL,
      leverage_score REAL,
      liquidity_score REAL,
      value_growth_blend REAL,
      defensive_score REAL,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_factor_unique ON stock_factor_scores(company_id, score_date);
    CREATE INDEX IF NOT EXISTS idx_stock_factor_date ON stock_factor_scores(score_date);
    CREATE INDEX IF NOT EXISTS idx_stock_factor_symbol ON stock_factor_scores(symbol);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_factors (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      formula TEXT NOT NULL,
      description TEXT,

      higher_is_better INTEGER DEFAULT 1,
      required_metrics TEXT,
      transformations TEXT,

      ic_stats TEXT,
      ic_tstat REAL,
      ic_ir REAL,
      wfe REAL,
      uniqueness_score REAL,
      turnover_monthly REAL,

      is_active INTEGER DEFAULT 0,
      is_valid INTEGER DEFAULT 1,
      validation_error TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_analyzed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_user_factors_user ON user_factors(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_factors_active ON user_factors(is_active);
    CREATE INDEX IF NOT EXISTS idx_user_factors_ic ON user_factors(ic_tstat DESC NULLS LAST);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS factor_values_cache (
      id SERIAL PRIMARY KEY,
      factor_id TEXT NOT NULL REFERENCES user_factors(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,

      raw_value REAL,
      zscore_value REAL,
      percentile_value REAL,
      component_values TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_values_unique ON factor_values_cache(factor_id, symbol, date);
    CREATE INDEX IF NOT EXISTS idx_factor_values_date ON factor_values_cache(date);
    CREATE INDEX IF NOT EXISTS idx_factor_values_symbol ON factor_values_cache(symbol);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS factor_ic_history (
      id SERIAL PRIMARY KEY,
      factor_id TEXT NOT NULL REFERENCES user_factors(id) ON DELETE CASCADE,
      calculation_date TEXT NOT NULL,

      ic_1d REAL,
      ic_5d REAL,
      ic_21d REAL,
      ic_63d REAL,
      ic_126d REAL,
      ic_252d REAL,
      tstat_21d REAL,
      pvalue_21d REAL,
      universe_size INTEGER,
      universe_type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_ic_unique ON factor_ic_history(factor_id, calculation_date, universe_type);
    CREATE INDEX IF NOT EXISTS idx_factor_ic_date ON factor_ic_history(calculation_date);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS factor_correlations (
      id SERIAL PRIMARY KEY,
      factor_id TEXT NOT NULL REFERENCES user_factors(id) ON DELETE CASCADE,
      calculation_date TEXT NOT NULL,

      corr_value REAL,
      corr_quality REAL,
      corr_momentum REAL,
      corr_growth REAL,
      corr_size REAL,
      corr_volatility REAL,
      user_factor_correlations TEXT,
      vif REAL,
      uniqueness_score REAL,
      most_similar_factor TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_corr_unique ON factor_correlations(factor_id, calculation_date);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS factor_backtest_runs (
      id TEXT PRIMARY KEY,
      factor_id TEXT REFERENCES user_factors(id) ON DELETE SET NULL,
      user_id TEXT,

      config TEXT NOT NULL,
      total_return REAL,
      annualized_return REAL,
      sharpe_ratio REAL,
      max_drawdown REAL,
      alpha REAL,
      beta REAL,
      is_ic REAL,
      oos_ic REAL,
      wfe REAL,
      overfitting_flags TEXT,
      deflated_sharpe REAL,
      equity_curve TEXT,
      period_returns TEXT,
      run_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      run_duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_factor_backtest_factor ON factor_backtest_runs(factor_id);
    CREATE INDEX IF NOT EXISTS idx_factor_backtest_user ON factor_backtest_runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_factor_backtest_date ON factor_backtest_runs(run_at);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS factor_signals (
      id SERIAL PRIMARY KEY,
      factor_id TEXT REFERENCES user_factors(id) ON DELETE CASCADE,
      signal_date TEXT NOT NULL,

      symbol TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_strength REAL,
      factor_value REAL,
      factor_percentile REAL,
      sector TEXT,
      market_cap REAL,
      return_1d REAL,
      return_5d REAL,
      return_21d REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_factor_signals_date ON factor_signals(signal_date);
    CREATE INDEX IF NOT EXISTS idx_factor_signals_symbol ON factor_signals(symbol);
    CREATE INDEX IF NOT EXISTS idx_factor_signals_factor ON factor_signals(factor_id);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS available_metrics (
      id SERIAL PRIMARY KEY,
      metric_code TEXT UNIQUE NOT NULL,
      metric_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      source_table TEXT,
      source_column TEXT,
      data_frequency TEXT,
      coverage_start TEXT,
      coverage_pct REAL,
      typical_range TEXT,
      is_ratio INTEGER,
      higher_is_better INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_category ON available_metrics(category);
  `);

  const countResult = await db.query('SELECT COUNT(*)::int as c FROM available_metrics');
  if (countResult.rows[0].c === 0) {
    const metrics = [
      ['pe_ratio', 'P/E Ratio', 'valuation', 'Price to earnings ratio', 'companies', 'pe_ratio', 0],
      ['pb_ratio', 'P/B Ratio', 'valuation', 'Price to book ratio', 'companies', 'pb_ratio', 0],
      ['ps_ratio', 'P/S Ratio', 'valuation', 'Price to sales ratio', 'companies', 'ps_ratio', 0],
      ['ev_ebitda', 'EV/EBITDA', 'valuation', 'Enterprise value to EBITDA', 'companies', 'ev_ebitda', 0],
      ['earnings_yield', 'Earnings Yield', 'valuation', 'Earnings per share / price', 'companies', 'earnings_yield', 1],
      ['fcf_yield', 'FCF Yield', 'valuation', 'Free cash flow yield', 'companies', 'fcf_yield', 1],
      ['dividend_yield', 'Dividend Yield', 'valuation', 'Annual dividend / price', 'companies', 'dividend_yield', 1],
      ['enterprise_value', 'Enterprise Value', 'valuation', 'Market cap + debt - cash', 'companies', 'enterprise_value', 0],
      ['market_cap', 'Market Cap', 'valuation', 'Market capitalization', 'companies', 'market_cap', 0],
      ['roe', 'Return on Equity', 'profitability', 'Net income / shareholders equity', 'companies', 'roe', 1],
      ['roic', 'ROIC', 'profitability', 'NOPAT / invested capital', 'companies', 'roic', 1],
      ['roa', 'ROA', 'profitability', 'Net income / total assets', 'companies', 'roa', 1],
      ['gross_margin', 'Gross Margin', 'profitability', 'Gross profit / revenue', 'companies', 'gross_margin', 1],
      ['operating_margin', 'Operating Margin', 'profitability', 'Operating income / revenue', 'companies', 'operating_margin', 1],
      ['net_margin', 'Net Margin', 'profitability', 'Net income / revenue', 'companies', 'net_margin', 1],
      ['asset_turnover', 'Asset Turnover', 'profitability', 'Revenue / total assets', 'companies', 'asset_turnover', 1],
      ['revenue_growth_yoy', 'Revenue Growth (YoY)', 'growth', 'Year-over-year revenue growth', 'companies', 'revenue_growth_yoy', 1],
      ['earnings_growth_yoy', 'Earnings Growth (YoY)', 'growth', 'Year-over-year earnings growth', 'companies', 'earnings_growth_yoy', 1],
      ['fcf_growth_yoy', 'FCF Growth (YoY)', 'growth', 'Year-over-year FCF growth', 'companies', 'fcf_growth_yoy', 1],
      ['debt_to_equity', 'Debt to Equity', 'quality', 'Total debt / equity', 'companies', 'debt_to_equity', 0],
      ['current_ratio', 'Current Ratio', 'quality', 'Current assets / liabilities', 'companies', 'current_ratio', 1],
      ['quick_ratio', 'Quick Ratio', 'quality', 'Quick assets / liabilities', 'companies', 'quick_ratio', 1],
      ['interest_coverage', 'Interest Coverage', 'quality', 'EBIT / interest', 'companies', 'interest_coverage', 1],
      ['piotroski_f', 'Piotroski F-Score', 'quality', 'Financial strength 0-9', 'companies', 'piotroski_f', 1],
      ['momentum_1m', '1-Month Momentum', 'technical', 'Price return 1 month', 'stock_factor_scores', 'momentum_score', 1],
      ['momentum_3m', '3-Month Momentum', 'technical', 'Price return 3 months', 'stock_factor_scores', 'momentum_score', 1],
      ['momentum_6m', '6-Month Momentum', 'technical', 'Price return 6 months', 'stock_factor_scores', 'momentum_score', 1],
      ['momentum_12m', '12-Month Momentum', 'technical', 'Price return 12 months', 'stock_factor_scores', 'momentum_score', 1],
      ['volatility', 'Volatility', 'technical', 'Price volatility', 'stock_factor_scores', 'volatility_score', 0],
      ['beta', 'Beta', 'technical', 'Market beta', 'stock_factor_scores', 'beta', 0],
      ['congressional_signal', 'Congressional Signal', 'alternative', 'Congressional trading signal', 'trading_signals', 'congressional_signal', 1],
      ['insider_signal', 'Insider Signal', 'alternative', 'Insider trading signal', 'trading_signals', 'insider_signal', 1],
      ['short_interest', 'Short Interest', 'alternative', 'Short interest % float', 'companies', 'short_interest', 0],
      ['sentiment_score', 'Sentiment Score', 'alternative', 'Aggregated sentiment', 'sentiment_history', 'sentiment_score', 1]
    ];
    for (const [metric_code, metric_name, category, description, source_table, source_column, higher_is_better] of metrics) {
      await db.query(
        `INSERT INTO available_metrics (metric_code, metric_name, category, description, source_table, source_column, higher_is_better)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (metric_code) DO NOTHING`,
        [metric_code, metric_name, category, description, source_table, source_column, higher_is_better]
      );
    }
    console.log(`   Seeded ${metrics.length} available_metrics`);
  }

  console.log('✅ Quant Lab factor tables ready');
}

module.exports = migrate;
