// src/database-migrations/001-add-all-missing-tables.js
// Comprehensive PostgreSQL migration for all missing tables
// Converts SQLite schemas to PostgreSQL

async function migrate(db) {
  console.log('🐘 Running comprehensive table migration for PostgreSQL...');
  console.log('='.repeat(70));

  try {
    // Start transaction
    await db.query('BEGIN');

    // ============================================
    // SUBREDDIT TRACKING
    // ============================================
    console.log('📱 Creating tracked_subreddits table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS tracked_subreddits (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        category TEXT DEFAULT 'general',
        priority INTEGER DEFAULT 50,
        is_active INTEGER DEFAULT 1,
        quality_score NUMERIC DEFAULT 50,

        total_posts_scanned INTEGER DEFAULT 0,
        ticker_mentions_found INTEGER DEFAULT 0,
        avg_post_score NUMERIC DEFAULT 0,
        avg_comments NUMERIC DEFAULT 0,
        last_scanned_at TIMESTAMP,

        discovered_from TEXT,
        discovered_at TIMESTAMP DEFAULT NOW(),

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_subreddits_active
        ON tracked_subreddits(is_active, priority DESC) WHERE is_active = 1;
      CREATE INDEX IF NOT EXISTS idx_subreddits_quality
        ON tracked_subreddits(quality_score DESC);
    `);

    // Seed default subreddits
    console.log('🌱 Seeding default subreddits...');
    const subredditCount = await db.query('SELECT COUNT(*) as count FROM tracked_subreddits');
    if (parseInt(subredditCount.rows[0].count) === 0) {
      const coreSubreddits = [
        ['wallstreetbets', 'core', 100, 60],
        ['stocks', 'core', 95, 75],
        ['investing', 'core', 90, 80],
        ['stockmarket', 'core', 85, 70],
        ['options', 'core', 80, 65],
        ['SecurityAnalysis', 'core', 75, 90],
        ['ValueInvesting', 'core', 75, 85],
        ['dividends', 'core', 70, 80],
        ['thetagang', 'core', 65, 70],
        ['smallstreetbets', 'core', 60, 55],
      ];

      const additionalSubreddits = [
        ['FluentInFinance', 'general', 55, 75],
        ['Bogleheads', 'general', 50, 85],
        ['personalfinance', 'general', 45, 70],
        ['FinancialPlanning', 'general', 40, 75],
        ['pennystocks', 'general', 35, 40],
        ['RobinhoodTrade', 'general', 30, 50],
        ['SPACs', 'sector', 35, 55],
        ['weedstocks', 'sector', 25, 45],
        ['biotech', 'sector', 30, 65],
        ['semiconductor', 'sector', 30, 70],
        ['energy_stocks', 'sector', 25, 60],
        ['REITs', 'sector', 25, 70],
      ];

      for (const [name, category, priority, quality] of [...coreSubreddits, ...additionalSubreddits]) {
        await db.query(
          `INSERT INTO tracked_subreddits (name, category, priority, quality_score)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO NOTHING`,
          [name, category, priority, quality]
        );
      }
      console.log('  ✓ Seeded 22 default subreddits');
    } else {
      console.log('  ⏭️  Subreddits already seeded, skipping');
    }

    // ============================================
    // STOCKTWITS & NEWS
    // ============================================
    console.log('📰 Creating stocktwits_messages table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS stocktwits_messages (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,

        message_id TEXT NOT NULL UNIQUE,
        body TEXT NOT NULL,

        user_id TEXT,
        username TEXT,
        user_followers INTEGER,
        user_join_date TEXT,

        user_sentiment TEXT,
        likes_count INTEGER DEFAULT 0,
        reshares_count INTEGER DEFAULT 0,

        posted_at TIMESTAMP NOT NULL,
        fetched_at TIMESTAMP DEFAULT NOW(),

        nlp_sentiment_score NUMERIC,
        nlp_sentiment_label TEXT,

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_stocktwits_company ON stocktwits_messages(company_id);
      CREATE INDEX IF NOT EXISTS idx_stocktwits_posted ON stocktwits_messages(posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_stocktwits_sentiment ON stocktwits_messages(user_sentiment);
    `);

    console.log('📰 Creating news_articles table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS news_articles (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,

        source TEXT NOT NULL,
        source_name TEXT,

        article_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        url TEXT NOT NULL,

        published_at TIMESTAMP,
        fetched_at TIMESTAMP DEFAULT NOW(),

        sentiment_score NUMERIC,
        sentiment_label TEXT,
        sentiment_confidence NUMERIC,

        UNIQUE(source, url),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_news_company ON news_articles(company_id);
      CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(source);
    `);

    console.log('📊 Creating market_sentiment table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS market_sentiment (
        id SERIAL PRIMARY KEY,

        indicator_type TEXT NOT NULL,
        indicator_value NUMERIC,
        indicator_label TEXT,
        components TEXT,

        previous_value NUMERIC,
        change_value NUMERIC,

        fetched_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_market_sentiment_type ON market_sentiment(indicator_type);
      CREATE INDEX IF NOT EXISTS idx_market_sentiment_date ON market_sentiment(fetched_at DESC);
    `);

    // ============================================
    // ANALYST ESTIMATES
    // ============================================
    console.log('💼 Creating analyst_estimates table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS analyst_estimates (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        fetched_at TIMESTAMP DEFAULT NOW(),

        current_price NUMERIC,
        target_high NUMERIC,
        target_low NUMERIC,
        target_mean NUMERIC,
        target_median NUMERIC,
        number_of_analysts INTEGER,
        recommendation_key TEXT,
        recommendation_mean NUMERIC,
        upside_potential NUMERIC,

        strong_buy INTEGER DEFAULT 0,
        buy INTEGER DEFAULT 0,
        hold INTEGER DEFAULT 0,
        sell INTEGER DEFAULT 0,
        strong_sell INTEGER DEFAULT 0,
        buy_percent NUMERIC,
        hold_percent NUMERIC,
        sell_percent NUMERIC,

        earnings_beat_rate NUMERIC,

        signal TEXT,
        signal_strength INTEGER,
        signal_confidence NUMERIC,
        signal_score INTEGER,

        raw_data TEXT,

        UNIQUE(company_id),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_analyst_company ON analyst_estimates(company_id);
      CREATE INDEX IF NOT EXISTS idx_analyst_signal ON analyst_estimates(signal);
      CREATE INDEX IF NOT EXISTS idx_analyst_upside ON analyst_estimates(upside_potential DESC);
    `);

    // ============================================
    // LIQUIDITY METRICS
    // ============================================
    console.log('💧 Creating liquidity_metrics table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS liquidity_metrics (
        company_id INTEGER PRIMARY KEY,

        avg_volume_30d NUMERIC,
        avg_value_30d NUMERIC,
        volume_volatility NUMERIC,

        bid_ask_spread_bps NUMERIC,
        amihud_illiquidity NUMERIC,

        volatility_30d NUMERIC,
        volatility_60d NUMERIC,

        turnover_ratio NUMERIC,

        estimated_impact_1pct NUMERIC,
        estimated_impact_5pct NUMERIC,

        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_liquidity_volume ON liquidity_metrics(avg_volume_30d DESC);
      CREATE INDEX IF NOT EXISTS idx_liquidity_volatility ON liquidity_metrics(volatility_30d);
    `);

    // ============================================
    // NL CHATBOT CONVERSATIONS
    // ============================================
    console.log('💬 Creating nl_conversations and nl_messages tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS nl_conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_symbol TEXT,
        last_intent TEXT,
        message_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_nl_conv_session ON nl_conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_nl_conv_updated ON nl_conversations(updated_at);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS nl_messages (
        id SERIAL PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        intent TEXT,
        symbols TEXT,
        entities TEXT,
        timestamp TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (conversation_id) REFERENCES nl_conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_nl_msg_conv ON nl_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_nl_msg_time ON nl_messages(timestamp);
    `);

    // ============================================
    // ANALYST CONVERSATIONS (AI)
    // ============================================
    console.log('🤖 Creating analyst_conversations and analyst_messages tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS analyst_conversations (
        id TEXT PRIMARY KEY,
        analyst_id TEXT NOT NULL,
        company_id INTEGER,
        company_symbol TEXT,
        title TEXT,
        summary TEXT,
        message_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        metadata TEXT DEFAULT '{}',

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_analyst ON analyst_conversations(analyst_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_company ON analyst_conversations(company_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_symbol ON analyst_conversations(company_symbol);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON analyst_conversations(updated_at DESC);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS analyst_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        tokens_used INTEGER DEFAULT 0,
        model TEXT,
        metadata TEXT DEFAULT '{}',

        FOREIGN KEY (conversation_id) REFERENCES analyst_conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON analyst_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON analyst_messages(timestamp);
    `);

    // ============================================
    // INSIDER TRADING
    // ============================================
    console.log('👔 Creating insider trading tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS insiders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        cik TEXT,
        name TEXT NOT NULL,
        title TEXT,
        is_officer INTEGER DEFAULT 0,
        is_director INTEGER DEFAULT 0,
        is_ten_percent_owner INTEGER DEFAULT 0,
        first_filing_date TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        UNIQUE(company_id, cik)
      );

      CREATE INDEX IF NOT EXISTS idx_insiders_company ON insiders(company_id);
      CREATE INDEX IF NOT EXISTS idx_insiders_cik ON insiders(cik);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS insider_transactions (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        insider_id INTEGER NOT NULL,

        accession_number TEXT UNIQUE,
        filing_date TEXT NOT NULL,

        transaction_date TEXT NOT NULL,
        transaction_code TEXT,
        transaction_type TEXT,

        shares_transacted NUMERIC,
        shares_owned_after NUMERIC,

        price_per_share NUMERIC,
        total_value NUMERIC,

        is_derivative INTEGER DEFAULT 0,
        derivative_security TEXT,
        exercise_price NUMERIC,
        expiration_date TEXT,
        underlying_shares NUMERIC,

        acquisition_disposition TEXT,
        direct_indirect TEXT,

        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (insider_id) REFERENCES insiders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_insider_tx_company ON insider_transactions(company_id);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_insider ON insider_transactions(insider_id);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_date ON insider_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_type ON insider_transactions(transaction_type);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_accession ON insider_transactions(accession_number);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS insider_activity_summary (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        period TEXT NOT NULL,

        buy_count INTEGER DEFAULT 0,
        buy_shares NUMERIC DEFAULT 0,
        buy_value NUMERIC DEFAULT 0,
        unique_buyers INTEGER DEFAULT 0,

        sell_count INTEGER DEFAULT 0,
        sell_shares NUMERIC DEFAULT 0,
        sell_value NUMERIC DEFAULT 0,
        unique_sellers INTEGER DEFAULT 0,

        net_shares NUMERIC DEFAULT 0,
        net_value NUMERIC DEFAULT 0,

        insider_signal TEXT,
        signal_strength INTEGER,
        signal_score INTEGER,

        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(company_id, period),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_insider_summary_company ON insider_activity_summary(company_id);
    `);

    // ============================================
    // CAPITAL ALLOCATION
    // ============================================
    console.log('💰 Creating capital allocation tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS buyback_programs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,

        announced_date TEXT NOT NULL,
        authorization_amount NUMERIC,
        authorization_shares NUMERIC,
        expiration_date TEXT,

        shares_repurchased NUMERIC DEFAULT 0,
        amount_spent NUMERIC DEFAULT 0,
        average_price NUMERIC,
        remaining_authorization NUMERIC,

        status TEXT DEFAULT 'active',

        source_filing TEXT,
        accession_number TEXT,
        notes TEXT,

        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_buyback_prog_company ON buyback_programs(company_id);
      CREATE INDEX IF NOT EXISTS idx_buyback_prog_status ON buyback_programs(status);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS buyback_activity (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        program_id INTEGER,

        fiscal_quarter TEXT NOT NULL,

        shares_repurchased NUMERIC,
        amount_spent NUMERIC,
        average_price NUMERIC,

        month1_shares NUMERIC,
        month1_amount NUMERIC,
        month2_shares NUMERIC,
        month2_amount NUMERIC,
        month3_shares NUMERIC,
        month3_amount NUMERIC,

        source_filing TEXT,
        accession_number TEXT,

        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(company_id, fiscal_quarter),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (program_id) REFERENCES buyback_programs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_buyback_activity_company ON buyback_activity(company_id);
      CREATE INDEX IF NOT EXISTS idx_buyback_activity_quarter ON buyback_activity(fiscal_quarter);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS dividends (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,

        declared_date TEXT,
        ex_dividend_date TEXT NOT NULL,
        record_date TEXT,
        payment_date TEXT,

        dividend_amount NUMERIC NOT NULL,
        dividend_type TEXT DEFAULT 'regular',
        frequency TEXT,

        prior_dividend NUMERIC,
        change_amount NUMERIC,
        change_pct NUMERIC,
        consecutive_increases INTEGER DEFAULT 0,

        is_increase INTEGER DEFAULT 0,
        is_decrease INTEGER DEFAULT 0,
        is_initiation INTEGER DEFAULT 0,
        is_suspension INTEGER DEFAULT 0,

        source_filing TEXT,
        accession_number TEXT,

        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(company_id, ex_dividend_date, dividend_type),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_dividends_company ON dividends(company_id);
      CREATE INDEX IF NOT EXISTS idx_dividends_exdate ON dividends(ex_dividend_date);
      CREATE INDEX IF NOT EXISTS idx_dividends_payment ON dividends(payment_date);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS capital_allocation_summary (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        fiscal_quarter TEXT NOT NULL,

        operating_cash_flow NUMERIC,
        free_cash_flow NUMERIC,

        dividends_paid NUMERIC,
        buybacks_executed NUMERIC,
        capex NUMERIC,
        acquisitions NUMERIC,
        debt_repayment NUMERIC,
        debt_issuance NUMERIC,

        total_shareholder_return NUMERIC,
        shareholder_yield NUMERIC,
        dividend_pct_of_fcf NUMERIC,
        buyback_pct_of_fcf NUMERIC,
        capex_pct_of_revenue NUMERIC,

        dividend_payout_ratio NUMERIC,
        total_payout_ratio NUMERIC,

        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(company_id, fiscal_quarter),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_capital_summary_company ON capital_allocation_summary(company_id);
      CREATE INDEX IF NOT EXISTS idx_capital_summary_quarter ON capital_allocation_summary(fiscal_quarter);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS significant_events (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,

        event_type TEXT NOT NULL,
        event_date TEXT NOT NULL,

        headline TEXT NOT NULL,
        description TEXT,

        value NUMERIC,
        value_formatted TEXT,

        significance_score INTEGER,
        is_positive INTEGER,

        source_type TEXT,
        source_url TEXT,
        accession_number TEXT,

        alert_sent INTEGER DEFAULT 0,
        alert_sent_at TIMESTAMP,

        insider_id INTEGER,
        program_id INTEGER,

        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (insider_id) REFERENCES insiders(id) ON DELETE SET NULL,
        FOREIGN KEY (program_id) REFERENCES buyback_programs(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_company ON significant_events(company_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON significant_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_date ON significant_events(event_date);
      CREATE INDEX IF NOT EXISTS idx_events_significance ON significant_events(significance_score DESC);
    `);

    // ============================================
    // EARNINGS TRANSCRIPTS
    // ============================================
    console.log('📋 Creating earnings transcripts tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS earnings_transcripts (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,

        fiscal_year INTEGER NOT NULL,
        fiscal_quarter INTEGER NOT NULL,
        call_date DATE NOT NULL,
        call_type TEXT DEFAULT 'earnings',

        title TEXT,
        full_transcript TEXT,
        prepared_remarks TEXT,
        qa_section TEXT,

        executives TEXT,
        analysts TEXT,

        sentiment_score NUMERIC,
        confidence_score NUMERIC,
        tone TEXT,

        guidance_phrases TEXT,
        uncertainty_phrases INTEGER,
        forward_looking_count INTEGER,
        risk_mentions INTEGER,

        tone_change NUMERIC,
        guidance_change TEXT,

        source TEXT,
        source_url TEXT,

        fetched_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        UNIQUE(company_id, fiscal_year, fiscal_quarter, call_type)
      );

      CREATE INDEX IF NOT EXISTS idx_transcripts_company ON earnings_transcripts(company_id);
      CREATE INDEX IF NOT EXISTS idx_transcripts_date ON earnings_transcripts(call_date DESC);
      CREATE INDEX IF NOT EXISTS idx_transcripts_symbol ON earnings_transcripts(symbol);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS management_guidance (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,

        guidance_date DATE NOT NULL,
        fiscal_year INTEGER NOT NULL,
        fiscal_quarter INTEGER,

        revenue_low NUMERIC,
        revenue_high NUMERIC,
        revenue_mid NUMERIC,
        revenue_prior_low NUMERIC,
        revenue_prior_high NUMERIC,
        revenue_change TEXT,

        eps_low NUMERIC,
        eps_high NUMERIC,
        eps_mid NUMERIC,
        eps_prior_low NUMERIC,
        eps_prior_high NUMERIC,
        eps_change TEXT,

        gross_margin_guidance TEXT,
        operating_margin_guidance TEXT,

        tone TEXT,
        key_drivers TEXT,
        headwinds TEXT,
        tailwinds TEXT,

        beat_prior_guidance INTEGER,

        source TEXT,
        created_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_guidance_company ON management_guidance(company_id);
      CREATE INDEX IF NOT EXISTS idx_guidance_date ON management_guidance(guidance_date DESC);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS valuation_history (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        snapshot_date DATE NOT NULL,

        price NUMERIC,
        market_cap NUMERIC,
        enterprise_value NUMERIC,

        pe_ratio NUMERIC,
        pe_forward NUMERIC,
        pb_ratio NUMERIC,
        ps_ratio NUMERIC,
        ev_ebitda NUMERIC,
        ev_sales NUMERIC,
        fcf_yield NUMERIC,
        earnings_yield NUMERIC,
        dividend_yield NUMERIC,

        peg_ratio NUMERIC,

        roic NUMERIC,
        roe NUMERIC,
        operating_margin NUMERIC,
        revenue_growth_yoy NUMERIC,

        pe_percentile_1y NUMERIC,
        pe_percentile_3y NUMERIC,
        pe_percentile_5y NUMERIC,
        pb_percentile_5y NUMERIC,
        fcf_yield_percentile_5y NUMERIC,

        created_at TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        UNIQUE(company_id, snapshot_date)
      );

      CREATE INDEX IF NOT EXISTS idx_valuation_company ON valuation_history(company_id);
      CREATE INDEX IF NOT EXISTS idx_valuation_date ON valuation_history(snapshot_date DESC);
      CREATE INDEX IF NOT EXISTS idx_valuation_symbol ON valuation_history(symbol);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS valuation_ranges (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL UNIQUE,
        symbol TEXT NOT NULL,
        calculated_at TIMESTAMP DEFAULT NOW(),

        pe_min_1y NUMERIC, pe_max_1y NUMERIC, pe_avg_1y NUMERIC, pe_median_1y NUMERIC,
        pe_min_3y NUMERIC, pe_max_3y NUMERIC, pe_avg_3y NUMERIC, pe_median_3y NUMERIC,
        pe_min_5y NUMERIC, pe_max_5y NUMERIC, pe_avg_5y NUMERIC, pe_median_5y NUMERIC,

        pb_min_5y NUMERIC, pb_max_5y NUMERIC, pb_avg_5y NUMERIC, pb_median_5y NUMERIC,

        ev_ebitda_min_5y NUMERIC, ev_ebitda_max_5y NUMERIC, ev_ebitda_avg_5y NUMERIC,

        fcf_yield_min_5y NUMERIC, fcf_yield_max_5y NUMERIC, fcf_yield_avg_5y NUMERIC,

        current_pe NUMERIC,
        current_pe_percentile NUMERIC,
        current_pb NUMERIC,
        current_pb_percentile NUMERIC,
        current_fcf_yield NUMERIC,
        current_fcf_yield_percentile NUMERIC,

        valuation_signal TEXT,
        signal_confidence NUMERIC,

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_valuation_ranges_symbol ON valuation_ranges(symbol);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS management_track_record (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL UNIQUE,
        symbol TEXT NOT NULL,

        total_guidance_given INTEGER DEFAULT 0,
        guidance_beats INTEGER DEFAULT 0,
        guidance_misses INTEGER DEFAULT 0,
        guidance_accuracy_rate NUMERIC,

        earnings_beats INTEGER DEFAULT 0,
        earnings_misses INTEGER DEFAULT 0,
        earnings_beat_rate NUMERIC,

        buyback_roi NUMERIC,
        dividend_growth_cagr NUMERIC,
        acquisition_success_rate NUMERIC,
        capital_allocation_score NUMERIC,

        transparency_score NUMERIC,
        consistency_score NUMERIC,

        credibility_score NUMERIC,

        last_updated TIMESTAMP DEFAULT NOW(),

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_track_record_symbol ON management_track_record(symbol);
    `);

    // ============================================
    // SENTIMENT SUMMARY & TRENDING
    // ============================================
    console.log('📈 Creating sentiment summary tables...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS sentiment_summary (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL,

        period TEXT NOT NULL,
        source TEXT DEFAULT 'reddit',

        calculated_at TIMESTAMP DEFAULT NOW(),

        total_posts INTEGER DEFAULT 0,
        positive_count INTEGER DEFAULT 0,
        negative_count INTEGER DEFAULT 0,
        neutral_count INTEGER DEFAULT 0,

        total_score INTEGER DEFAULT 0,
        total_comments INTEGER DEFAULT 0,

        avg_sentiment NUMERIC,
        weighted_sentiment NUMERIC,
        sentiment_std_dev NUMERIC,

        sentiment_change NUMERIC,
        volume_change NUMERIC,

        dd_posts INTEGER DEFAULT 0,
        yolo_posts INTEGER DEFAULT 0,
        buy_mentions INTEGER DEFAULT 0,
        sell_mentions INTEGER DEFAULT 0,
        rocket_count INTEGER DEFAULT 0,

        signal TEXT,
        signal_strength INTEGER,
        confidence NUMERIC,

        UNIQUE(company_id, period, source),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_summary_company ON sentiment_summary(company_id);
      CREATE INDEX IF NOT EXISTS idx_summary_period ON sentiment_summary(period);
      CREATE INDEX IF NOT EXISTS idx_summary_signal ON sentiment_summary(signal);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS trending_tickers (
        id SERIAL PRIMARY KEY,

        symbol TEXT NOT NULL,
        company_id INTEGER,

        mention_count INTEGER DEFAULT 0,
        unique_posts INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        avg_sentiment NUMERIC,

        rank_by_mentions INTEGER,
        rank_by_sentiment INTEGER,

        period TEXT NOT NULL,
        calculated_at TIMESTAMP DEFAULT NOW(),

        UNIQUE(symbol, period),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_trending_period ON trending_tickers(period, rank_by_mentions);
      CREATE INDEX IF NOT EXISTS idx_trending_symbol ON trending_tickers(symbol);
    `);

    // ============================================
    // EXCHANGE RATES
    // ============================================
    console.log('💱 Creating exchange_rates_history table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS exchange_rates_history (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        base_currency TEXT DEFAULT 'USD',
        currency TEXT NOT NULL,
        rate NUMERIC NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(date, base_currency, currency)
      );

      CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates_history(date);
      CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates_history(currency);
    `);

    // ============================================
    // ADD MISSING COLUMNS TO COMPANIES
    // ============================================
    console.log('🏢 Adding sentiment columns to companies table...');

    // Check and add columns if they don't exist
    const addColumnIfNotExists = async (table, column, type, defaultVal = null) => {
      const checkQuery = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = $1 AND column_name = $2
      `;
      const result = await db.query(checkQuery, [table, column]);

      if (result.rows.length === 0) {
        const defaultClause = defaultVal ? `DEFAULT ${defaultVal}` : '';
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} ${defaultClause}`);
        console.log(`  ✓ Added ${column} to ${table}`);
      }
    };

    await addColumnIfNotExists('companies', 'sentiment_signal', 'TEXT');
    await addColumnIfNotExists('companies', 'sentiment_score', 'NUMERIC');
    await addColumnIfNotExists('companies', 'sentiment_confidence', 'NUMERIC');
    await addColumnIfNotExists('companies', 'sentiment_updated_at', 'TIMESTAMP');
    await addColumnIfNotExists('companies', 'reddit_mentions_24h', 'INTEGER', '0');

    // Commit transaction
    await db.query('COMMIT');

    console.log('='.repeat(70));
    console.log('✅ All missing tables migrated successfully!');
    console.log('');
    console.log('Tables created:');
    console.log('  - tracked_subreddits');
    console.log('  - stocktwits_messages');
    console.log('  - news_articles');
    console.log('  - market_sentiment');
    console.log('  - analyst_estimates');
    console.log('  - liquidity_metrics');
    console.log('  - nl_conversations');
    console.log('  - nl_messages');
    console.log('  - analyst_conversations');
    console.log('  - analyst_messages');
    console.log('  - insiders');
    console.log('  - insider_transactions');
    console.log('  - insider_activity_summary');
    console.log('  - buyback_programs');
    console.log('  - buyback_activity');
    console.log('  - dividends');
    console.log('  - capital_allocation_summary');
    console.log('  - significant_events');
    console.log('  - earnings_transcripts');
    console.log('  - management_guidance');
    console.log('  - valuation_history');
    console.log('  - valuation_ranges');
    console.log('  - management_track_record');
    console.log('  - sentiment_summary');
    console.log('  - trending_tickers');
    console.log('  - exchange_rates_history');
    console.log('');
    console.log('Columns added to companies table:');
    console.log('  - sentiment_signal');
    console.log('  - sentiment_score');
    console.log('  - sentiment_confidence');
    console.log('  - sentiment_updated_at');
    console.log('  - reddit_mentions_24h');

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  }
}

module.exports = migrate;
