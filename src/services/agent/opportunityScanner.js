// src/services/agent/opportunityScanner.js
// Opportunity Scanner - Surfaces best trading candidates from the stock universe
// Enhanced with alt data, 13F delta, open market buys, and earnings momentum

const { SignalEnhancements } = require('../signalEnhancements');

class OpportunityScanner {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      maxOpportunities: options.maxOpportunities || 50,
      minSignificanceScore: options.minSignificanceScore || 6,
      eventLookbackDays: options.eventLookbackDays || 7,
      sentimentLookbackDays: options.sentimentLookbackDays || 7,
      insiderLookbackPeriod: options.insiderLookbackPeriod || '90d',
      congressLookbackDays: options.congressLookbackDays || 90,
      minMarginOfSafety: options.minMarginOfSafety || 0.20, // 20% undervalued
      minShortPctFloat: options.minShortPctFloat || 0.15,   // 15%+ short interest
      minConsecutiveBeats: options.minConsecutiveBeats || 3, // 3+ earnings beats
      ...options,
    };

    // Initialize signal enhancements for 13F, insider classification, earnings
    this.signalEnhancements = new SignalEnhancements(db);

    this._prepareStatements();
    console.log('🔍 Opportunity Scanner initialized (13 opportunity types)');
  }

  _prepareStatements() {
    this.stmts = {
      // Significant events
      getSignificantEvents: this.db.prepare(`
        SELECT e.*, c.symbol, c.name, c.sector
        FROM significant_events e
        JOIN companies c ON e.company_id = c.id
        WHERE e.event_date >= date('now', '-' || ? || ' days')
        AND e.significance_score >= ?
        AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY e.significance_score DESC, e.event_date DESC
        LIMIT ?
      `),

      // Strong sentiment signals
      getSentimentSignals: this.db.prepare(`
        SELECT c.symbol, c.name, c.sector, cs.combined_score, cs.combined_signal,
               cs.confidence, cs.sources_used, cs.agreement_score, cs.calculated_at
        FROM combined_sentiment cs
        JOIN companies c ON cs.company_id = c.id
        WHERE cs.calculated_at >= datetime('now', '-' || ? || ' days')
        AND cs.combined_signal IN ('strong_buy', 'buy', 'strong_sell', 'sell')
        AND cs.confidence >= 0.5
        AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY ABS(cs.combined_score) DESC
        LIMIT ?
      `),

      // Insider activity
      getInsiderActivity: this.db.prepare(`
        SELECT c.symbol, c.name, c.sector, i.insider_signal, i.buy_value, i.sell_value,
               i.net_value, i.unique_buyers, i.unique_sellers, i.signal_strength
        FROM insider_activity_summary i
        JOIN companies c ON i.company_id = c.id
        WHERE i.period = ?
        AND i.insider_signal IN ('strong_buy', 'buy', 'bullish')
        AND i.buy_value >= 50000
        AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY i.buy_value DESC
        LIMIT ?
      `),

      // Analyst upgrades/strong buys
      getAnalystOpportunities: this.db.prepare(`
        SELECT c.symbol, c.name, c.sector, ae.recommendation_key, ae.recommendation_mean,
               ae.upside_potential, ae.number_of_analysts, ae.target_mean, ae.current_price,
               ae.signal, ae.signal_strength
        FROM analyst_estimates ae
        JOIN companies c ON ae.company_id = c.id
        WHERE ae.recommendation_key IN ('strong_buy', 'buy')
        AND ae.upside_potential >= 15
        AND ae.number_of_analysts >= 3
        AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY ae.upside_potential DESC
        LIMIT ?
      `),

      // Technical breakouts (near 52w low with improving momentum)
      getTechnicalBreakouts: this.db.prepare(`
        SELECT c.symbol, c.name, c.sector, pm.last_price, pm.high_52w, pm.low_52w,
               pm.change_1w, pm.change_1m, pm.alpha_1m, pm.alpha_3m,
               CASE
                 WHEN pm.high_52w > pm.low_52w THEN
                   (pm.last_price - pm.low_52w) / (pm.high_52w - pm.low_52w) * 100
                 ELSE 50
               END as position_52w_pct
        FROM price_metrics pm
        JOIN companies c ON pm.company_id = c.id
        WHERE pm.last_price IS NOT NULL
        AND pm.high_52w IS NOT NULL
        AND pm.low_52w IS NOT NULL
        AND (
          -- Near 52w low (bottom 25%) with positive recent momentum
          ((pm.last_price - pm.low_52w) / NULLIF(pm.high_52w - pm.low_52w, 0) < 0.25 AND pm.change_1w > 0)
          OR
          -- Breaking out with volume (strong recent alpha)
          (pm.alpha_1m > 5 AND pm.change_1w > 3)
        )
        AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY pm.alpha_1m DESC NULLS LAST
        LIMIT ?
      `),

      // Alerts from alert system
      getRecentAlerts: this.db.prepare(`
        SELECT a.*, c.symbol, c.name, c.sector
        FROM alerts a
        JOIN companies c ON a.company_id = c.id
        WHERE a.triggered_at >= datetime('now', '-3 days')
        AND a.signal_type IN ('strong_buy', 'buy')
        AND a.is_dismissed = 0
        AND a.priority >= 3
        AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY a.priority DESC, a.triggered_at DESC
        LIMIT ?
      `),

      // Value opportunities (low P/E, high ROIC)
      getValueOpportunities: this.db.prepare(`
        SELECT c.symbol, c.name, c.sector, cm.pe_ratio, cm.roic, cm.fcf_yield,
               cm.debt_to_equity, cm.revenue_growth_yoy, pm.last_price, pm.alpha_1m
        FROM calculated_metrics cm
        JOIN companies c ON cm.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE cm.fiscal_period = (
          SELECT MAX(cm2.fiscal_period) FROM calculated_metrics cm2
          WHERE cm2.company_id = cm.company_id AND cm2.period_type = 'annual'
        )
        AND cm.period_type = 'annual'
        AND cm.pe_ratio > 0 AND cm.pe_ratio < 15
        AND cm.roic > 12
        AND cm.debt_to_equity < 1.0
        AND c.symbol NOT LIKE 'CIK_%'
        AND c.is_active = 1
        ORDER BY cm.roic DESC
        LIMIT ?
      `),

      // NEW: Congressional trading activity (net buying)
      getCongressBuying: this.db.prepare(`
        SELECT
          c.symbol, c.name, c.sector,
          COUNT(CASE WHEN ct.transaction_type = 'purchase' THEN 1 END) as buy_count,
          COUNT(CASE WHEN ct.transaction_type = 'sale' THEN 1 END) as sell_count,
          SUM(CASE WHEN ct.transaction_type = 'purchase' THEN (ct.amount_min + COALESCE(ct.amount_max, ct.amount_min)) / 2 ELSE 0 END) as buy_amount,
          SUM(CASE WHEN ct.transaction_type = 'sale' THEN (ct.amount_min + COALESCE(ct.amount_max, ct.amount_min)) / 2 ELSE 0 END) as sell_amount,
          MAX(ct.transaction_date) as last_trade,
          pm.last_price,
          pm.market_cap
        FROM congressional_trades ct
        JOIN companies c ON ct.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE ct.transaction_date >= date('now', '-' || ? || ' days')
          AND c.symbol NOT LIKE 'CIK_%'
        GROUP BY c.id
        HAVING buy_count > sell_count  -- Net buyers
           AND buy_amount >= 15000     -- Meaningful amount
        ORDER BY buy_amount DESC
        LIMIT ?
      `),

      // NEW: Short squeeze candidates
      getSqueezeCandidates: this.db.prepare(`
        SELECT
          c.symbol, c.name, c.sector,
          si.short_pct_float,
          si.days_to_cover,
          si.short_interest,
          pm.last_price,
          pm.change_1w,
          pm.change_1m,
          pm.alpha_1m,
          pm.market_cap
        FROM short_interest si
        JOIN companies c ON si.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE si.settlement_date = (
          SELECT MAX(si2.settlement_date) FROM short_interest si2
          WHERE si2.company_id = si.company_id
        )
          AND si.short_pct_float >= ?
          AND si.days_to_cover >= 3
          AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY si.short_pct_float DESC
        LIMIT ?
      `),

      // NEW: Undervalued stocks (margin of safety > threshold)
      getUndervalued: this.db.prepare(`
        SELECT
          c.symbol, c.name, c.sector,
          ive.weighted_intrinsic_value as intrinsic_value_per_share,
          ive.margin_of_safety,
          ive.valuation_signal,
          CASE
            WHEN ive.dcf_confidence >= 0.5 THEN 'DCF'
            WHEN ive.graham_number IS NOT NULL THEN 'Graham'
            WHEN ive.epv_value IS NOT NULL THEN 'EPV'
            ELSE 'Blended'
          END as primary_method,
          ive.confidence_level as confidence_score,
          pm.last_price,
          pm.market_cap,
          pm.alpha_1m
        FROM intrinsic_value_estimates ive
        JOIN companies c ON ive.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE ive.margin_of_safety >= ?
          AND ive.confidence_level >= 0.5
          AND pm.last_price IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY ive.margin_of_safety DESC
        LIMIT ?
      `),

      // NEW: Government contracts opportunities
      getContractWinners: this.db.prepare(`
        SELECT
          c.symbol, c.name, c.sector,
          SUM(gc.amount) as total_contract_value,
          COUNT(*) as contract_count,
          MAX(gc.award_date) as last_award,
          pm.last_price,
          pm.market_cap,
          CASE WHEN pm.market_cap > 0
            THEN SUM(gc.amount) / pm.market_cap * 100
            ELSE NULL
          END as contracts_to_mcap_pct
        FROM government_contracts gc
        JOIN companies c ON gc.company_id = c.id
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE gc.award_date >= date('now', '-365 days')
          AND c.symbol NOT LIKE 'CIK_%'
        GROUP BY c.id
        HAVING total_contract_value >= 10000000  -- $10M+ contracts
        ORDER BY contracts_to_mcap_pct DESC
        LIMIT ?
      `),
    };
  }

  /**
   * Scan for trading opportunities
   * @param {Object} options - { regime, portfolioId, universe, types }
   * @returns {Opportunity[]}
   */
  async scan(options = {}) {
    const {
      regime = null,
      portfolioId = null,
      types = ['events', 'sentiment', 'insider', 'analyst', 'technical', 'alerts', 'value',
               'congress', 'squeeze', 'undervalued', 'contracts',
               'thirteenF', 'openMarketBuys', 'earningsMomentum'], // All 13 types
      limit = 20,
    } = options;

    console.log('🔍 Scanning for opportunities (enhanced)...');
    const startTime = Date.now();

    const allOpportunities = [];

    // 1. Significant events
    if (types.includes('events')) {
      const events = await this._scanSignificantEvents();
      allOpportunities.push(...events);
    }

    // 2. Strong sentiment signals
    if (types.includes('sentiment')) {
      const sentimentOpps = await this._scanSentimentSignals();
      allOpportunities.push(...sentimentOpps);
    }

    // 3. Insider buying clusters
    if (types.includes('insider')) {
      const insiderOpps = await this._scanInsiderActivity();
      allOpportunities.push(...insiderOpps);
    }

    // 4. Analyst opportunities
    if (types.includes('analyst')) {
      const analystOpps = await this._scanAnalystOpportunities();
      allOpportunities.push(...analystOpps);
    }

    // 5. Technical breakouts
    if (types.includes('technical')) {
      const technicalOpps = await this._scanTechnicalBreakouts();
      allOpportunities.push(...technicalOpps);
    }

    // 6. Alert system opportunities
    if (types.includes('alerts')) {
      const alertOpps = await this._scanAlerts();
      allOpportunities.push(...alertOpps);
    }

    // 7. Value opportunities
    if (types.includes('value')) {
      const valueOpps = await this._scanValueOpportunities();
      allOpportunities.push(...valueOpps);
    }

    // 8. NEW: Congressional buying activity
    if (types.includes('congress')) {
      const congressOpps = await this._scanCongressBuying();
      allOpportunities.push(...congressOpps);
    }

    // 9. NEW: Short squeeze candidates
    if (types.includes('squeeze')) {
      const squeezeOpps = await this._scanSqueezeCandidates();
      allOpportunities.push(...squeezeOpps);
    }

    // 10. NEW: Undervalued stocks (margin of safety)
    if (types.includes('undervalued')) {
      const undervaluedOpps = await this._scanUndervalued();
      allOpportunities.push(...undervaluedOpps);
    }

    // 11. NEW: Government contract winners
    if (types.includes('contracts')) {
      const contractOpps = await this._scanContractWinners();
      allOpportunities.push(...contractOpps);
    }

    // 12. NEW: 13F super-investor new positions
    if (types.includes('thirteenF')) {
      const thirteenFOpps = await this._scan13FNewPositions();
      allOpportunities.push(...thirteenFOpps);
    }

    // 13. NEW: Open market insider buys (most bullish insider signal)
    if (types.includes('openMarketBuys')) {
      const openMarketOpps = await this._scanOpenMarketBuys();
      allOpportunities.push(...openMarketOpps);
    }

    // 14. NEW: Earnings momentum (consecutive beats)
    if (types.includes('earningsMomentum')) {
      const earningsOpps = await this._scanEarningsMomentum();
      allOpportunities.push(...earningsOpps);
    }

    // Deduplicate and rank
    const ranked = this._rankOpportunities(allOpportunities, regime);

    const duration = Date.now() - startTime;
    console.log(`🔍 Found ${ranked.length} opportunities in ${duration}ms`);

    return {
      opportunities: ranked.slice(0, limit),
      totalFound: allOpportunities.length,
      uniqueSymbols: ranked.length,
      scanTypes: types,
      regime: regime?.regime || 'unknown',
      duration,
      timestamp: new Date().toISOString(),
    };
  }

  async _scanSignificantEvents() {
    const events = this.stmts.getSignificantEvents.all(
      this.options.eventLookbackDays,
      this.options.minSignificanceScore,
      this.options.maxOpportunities
    );

    return events.map(e => ({
      symbol: e.symbol,
      name: e.name,
      sector: e.sector,
      type: 'event',
      subtype: e.event_type,
      trigger: e.headline,
      score: e.significance_score / 10, // Normalize to 0-1
      direction: e.is_positive ? 'bullish' : 'bearish',
      timestamp: e.event_date,
      details: {
        eventType: e.event_type,
        value: e.value,
        valueFormatted: e.value_formatted,
      },
    }));
  }

  async _scanSentimentSignals() {
    const signals = this.stmts.getSentimentSignals.all(
      this.options.sentimentLookbackDays,
      this.options.maxOpportunities
    );

    return signals.map(s => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      type: 'sentiment',
      subtype: 'combined',
      trigger: `Sentiment: ${s.combined_signal}`,
      score: Math.abs(s.combined_score),
      direction: s.combined_score > 0 ? 'bullish' : 'bearish',
      timestamp: s.calculated_at,
      details: {
        signal: s.combined_signal,
        confidence: s.confidence,
        sourcesUsed: s.sources_used,
        agreement: s.agreement_score,
      },
    }));
  }

  async _scanInsiderActivity() {
    const activity = this.stmts.getInsiderActivity.all(
      this.options.insiderLookbackPeriod,
      this.options.maxOpportunities
    );

    return activity.map(i => ({
      symbol: i.symbol,
      name: i.name,
      sector: i.sector,
      type: 'insider',
      subtype: 'buying',
      trigger: `${i.unique_buyers} insiders bought $${(i.buy_value / 1000).toFixed(0)}K`,
      score: Math.min(i.buy_value / 1000000, 1), // Normalize: $1M = max score
      direction: 'bullish',
      timestamp: new Date().toISOString(),
      details: {
        signal: i.insider_signal,
        buyValue: i.buy_value,
        netValue: i.net_value,
        uniqueBuyers: i.unique_buyers,
        signalStrength: i.signal_strength,
      },
    }));
  }

  async _scanAnalystOpportunities() {
    const opportunities = this.stmts.getAnalystOpportunities.all(
      this.options.maxOpportunities
    );

    return opportunities.map(a => ({
      symbol: a.symbol,
      name: a.name,
      sector: a.sector,
      type: 'analyst',
      subtype: 'consensus',
      trigger: `Analyst ${a.recommendation_key}: ${a.upside_potential?.toFixed(0)}% upside`,
      score: Math.min((a.upside_potential || 0) / 50, 1), // 50% upside = max score
      direction: 'bullish',
      timestamp: new Date().toISOString(),
      details: {
        recommendation: a.recommendation_key,
        recommendationMean: a.recommendation_mean,
        upsidePotential: a.upside_potential,
        numberOfAnalysts: a.number_of_analysts,
        targetPrice: a.target_mean,
        currentPrice: a.current_price,
      },
    }));
  }

  async _scanTechnicalBreakouts() {
    const breakouts = this.stmts.getTechnicalBreakouts.all(
      this.options.maxOpportunities
    );

    return breakouts.map(b => ({
      symbol: b.symbol,
      name: b.name,
      sector: b.sector,
      type: 'technical',
      subtype: b.position_52w_pct < 25 ? 'near_low' : 'breakout',
      trigger: b.position_52w_pct < 25
        ? `Near 52W low (${b.position_52w_pct?.toFixed(0)}%), momentum turning`
        : `Breakout: +${b.alpha_1m?.toFixed(1)}% alpha (1M)`,
      score: 0.6 + (Math.abs(b.alpha_1m || 0) / 50), // Base 0.6 + alpha contribution
      direction: 'bullish',
      timestamp: new Date().toISOString(),
      details: {
        lastPrice: b.last_price,
        high52w: b.high_52w,
        low52w: b.low_52w,
        position52wPct: b.position_52w_pct,
        change1w: b.change_1w,
        change1m: b.change_1m,
        alpha1m: b.alpha_1m,
        alpha3m: b.alpha_3m,
      },
    }));
  }

  async _scanAlerts() {
    const alerts = this.stmts.getRecentAlerts.all(
      this.options.maxOpportunities
    );

    return alerts.map(a => ({
      symbol: a.symbol,
      name: a.name,
      sector: a.sector,
      type: 'alert',
      subtype: a.alert_type,
      trigger: a.title,
      score: a.priority / 5, // Priority 1-5 → 0.2-1.0
      direction: 'bullish',
      timestamp: a.triggered_at,
      details: {
        alertType: a.alert_type,
        alertCode: a.alert_code,
        signalType: a.signal_type,
        priority: a.priority,
        description: a.description,
      },
    }));
  }

  async _scanValueOpportunities() {
    const opportunities = this.stmts.getValueOpportunities.all(
      this.options.maxOpportunities
    );

    return opportunities.map(v => ({
      symbol: v.symbol,
      name: v.name,
      sector: v.sector,
      type: 'value',
      subtype: 'quality_value',
      trigger: `Quality value: P/E ${v.pe_ratio?.toFixed(1)}, ROIC ${v.roic?.toFixed(1)}%`,
      score: 0.5 + (v.roic || 0) / 50, // Higher ROIC = higher score
      direction: 'bullish',
      timestamp: new Date().toISOString(),
      details: {
        peRatio: v.pe_ratio,
        roic: v.roic,
        fcfYield: v.fcf_yield,
        debtToEquity: v.debt_to_equity,
        revenueGrowth: v.revenue_growth_yoy,
        alpha1m: v.alpha_1m,
      },
    }));
  }

  /**
   * NEW: Scan for congressional net buying activity
   * Politicians with access to insider knowledge
   */
  async _scanCongressBuying() {
    try {
      const activity = this.stmts.getCongressBuying.all(
        this.options.congressLookbackDays,
        this.options.maxOpportunities
      );

      return activity.map(c => {
        const netCount = c.buy_count - c.sell_count;
        const netAmount = c.buy_amount - c.sell_amount;

        // Score based on conviction (more buys, larger amounts = higher score)
        let score = 0.5;
        if (netCount >= 3) score += 0.2;      // Multiple politicians buying
        if (netAmount > 100000) score += 0.15; // Significant amounts
        if (netAmount > 500000) score += 0.15; // Very significant

        return {
          symbol: c.symbol,
          name: c.name,
          sector: c.sector,
          type: 'congress',
          subtype: 'net_buying',
          trigger: `${c.buy_count} congress buys vs ${c.sell_count} sells ($${(netAmount/1000).toFixed(0)}K net)`,
          score: Math.min(1, score),
          direction: 'bullish',
          timestamp: c.last_trade,
          details: {
            buyCount: c.buy_count,
            sellCount: c.sell_count,
            buyAmount: c.buy_amount,
            sellAmount: c.sell_amount,
            netAmount,
            lastTrade: c.last_trade,
            marketCap: c.market_cap,
          },
        };
      });
    } catch (error) {
      // Table might not exist yet
      console.log('Congress scan skipped (table may not exist):', error.message);
      return [];
    }
  }

  /**
   * NEW: Scan for short squeeze candidates
   * High short interest + days to cover = potential squeeze
   */
  async _scanSqueezeCandidates() {
    try {
      const candidates = this.stmts.getSqueezeCandidates.all(
        this.options.minShortPctFloat,
        this.options.maxOpportunities
      );

      return candidates.map(s => {
        // Score based on squeeze potential
        // Higher short %, higher days to cover, positive momentum = higher score
        let score = 0.5;
        if (s.short_pct_float > 0.25) score += 0.15;   // Very high short interest
        if (s.days_to_cover > 5) score += 0.15;        // Hard to cover
        if (s.days_to_cover > 10) score += 0.1;        // Very hard to cover
        if (s.change_1w > 0) score += 0.1;             // Positive momentum starting

        const shortPct = (s.short_pct_float * 100).toFixed(1);

        return {
          symbol: s.symbol,
          name: s.name,
          sector: s.sector,
          type: 'squeeze',
          subtype: 'short_squeeze',
          trigger: `Squeeze candidate: ${shortPct}% short, ${s.days_to_cover?.toFixed(1)} days to cover`,
          score: Math.min(1, score),
          direction: 'bullish', // Squeeze is inherently bullish
          timestamp: new Date().toISOString(),
          details: {
            shortPctFloat: s.short_pct_float,
            daysToCover: s.days_to_cover,
            shortInterest: s.short_interest,
            change1w: s.change_1w,
            change1m: s.change_1m,
            alpha1m: s.alpha_1m,
            marketCap: s.market_cap,
          },
        };
      });
    } catch (error) {
      console.log('Squeeze scan skipped (table may not exist):', error.message);
      return [];
    }
  }

  /**
   * NEW: Scan for undervalued stocks based on margin of safety
   * Buffett/Graham style value investing
   */
  async _scanUndervalued() {
    try {
      const undervalued = this.stmts.getUndervalued.all(
        this.options.minMarginOfSafety,
        this.options.maxOpportunities
      );

      return undervalued.map(u => {
        // Score based on margin of safety and confidence
        const mos = u.margin_of_safety || 0;
        const conf = u.confidence_score || 0.5;

        // Higher MoS and confidence = higher score
        let score = 0.4 + (mos * 0.8); // 20% MoS = 0.56, 40% = 0.72, 60% = 0.88
        score *= conf; // Adjust for methodology confidence

        const mosPct = (mos * 100).toFixed(0);

        return {
          symbol: u.symbol,
          name: u.name,
          sector: u.sector,
          type: 'undervalued',
          subtype: u.valuation_signal || 'margin_of_safety',
          trigger: `${mosPct}% margin of safety (${u.primary_method}): IV $${u.intrinsic_value_per_share?.toFixed(2)} vs $${u.last_price?.toFixed(2)}`,
          score: Math.min(1, score),
          direction: 'bullish',
          timestamp: new Date().toISOString(),
          details: {
            intrinsicValue: u.intrinsic_value_per_share,
            currentPrice: u.last_price,
            marginOfSafety: mos,
            valuationSignal: u.valuation_signal,
            primaryMethod: u.primary_method,
            confidence: conf,
            marketCap: u.market_cap,
            alpha1m: u.alpha_1m,
          },
        };
      });
    } catch (error) {
      console.log('Undervalued scan skipped (table may not exist):', error.message);
      return [];
    }
  }

  /**
   * NEW: Scan for government contract winners
   * Companies with significant new contract revenue
   */
  async _scanContractWinners() {
    try {
      const winners = this.stmts.getContractWinners.all(
        this.options.maxOpportunities
      );

      return winners.map(w => {
        // Score based on contract significance relative to market cap
        let score = 0.4;
        if (w.contracts_to_mcap_pct > 1) score += 0.15;  // >1% of market cap
        if (w.contracts_to_mcap_pct > 5) score += 0.15;  // >5% significant
        if (w.contracts_to_mcap_pct > 10) score += 0.1;  // >10% very significant
        if (w.contract_count > 3) score += 0.1;          // Multiple contracts

        const millions = (w.total_contract_value / 1000000).toFixed(1);

        return {
          symbol: w.symbol,
          name: w.name,
          sector: w.sector,
          type: 'contracts',
          subtype: 'govt_contract',
          trigger: `$${millions}M in govt contracts (${w.contracts_to_mcap_pct?.toFixed(1)}% of market cap)`,
          score: Math.min(1, score),
          direction: 'bullish', // Contract wins are bullish for revenue
          timestamp: w.last_award,
          details: {
            totalContractValue: w.total_contract_value,
            contractCount: w.contract_count,
            lastAward: w.last_award,
            contractsToMcapPct: w.contracts_to_mcap_pct,
            marketCap: w.market_cap,
          },
        };
      });
    } catch (error) {
      console.log('Contract scan skipped (table may not exist):', error.message);
      return [];
    }
  }

  /**
   * NEW: Scan for 13F super-investor new positions
   * Uses SignalEnhancements service
   */
  async _scan13FNewPositions() {
    try {
      const opps = this.signalEnhancements.getTop13FOpportunities(this.options.maxOpportunities);

      const results = [];

      // New positions from super-investors
      for (const p of opps.newPositions) {
        // Weight by portfolio significance
        let score = 0.6;
        if (p.aum && p.aum > 10000000000) score += 0.1;  // $10B+ fund
        if (p.portfolio_weight > 1) score += 0.15;       // >1% position
        if (p.portfolio_weight > 3) score += 0.1;        // >3% high conviction

        results.push({
          symbol: p.symbol,
          name: p.name,
          sector: p.sector,
          type: 'thirteenF',
          subtype: 'new_position',
          trigger: `${p.investor_name} initiated $${(p.market_value/1000000).toFixed(1)}M position (${p.portfolio_weight?.toFixed(2)}% of portfolio)`,
          score: Math.min(1, score),
          direction: 'bullish',
          timestamp: p.filing_date,
          details: {
            investor: p.investor_name,
            fund: p.fund_name,
            style: p.style,
            positionValue: p.market_value,
            portfolioWeight: p.portfolio_weight,
            filingDate: p.filing_date,
          },
        });
      }

      // Significant increases
      for (const i of opps.significantIncreases.slice(0, 20)) {
        results.push({
          symbol: i.symbol,
          name: i.name,
          sector: i.sector,
          type: 'thirteenF',
          subtype: 'increased',
          trigger: `${i.investor_name} increased position by ${i.shares_change_pct?.toFixed(0)}%`,
          score: 0.5 + Math.min(0.3, i.shares_change_pct / 200),
          direction: 'bullish',
          timestamp: i.filing_date,
          details: {
            investor: i.investor_name,
            changePct: i.shares_change_pct,
            positionValue: i.market_value,
          },
        });
      }

      return results;
    } catch (error) {
      console.log('13F scan skipped:', error.message);
      return [];
    }
  }

  /**
   * NEW: Scan for open market insider buys (most bullish insider signal)
   */
  async _scanOpenMarketBuys() {
    try {
      const buys = this.signalEnhancements.getTopOpenMarketBuys(this.options.maxOpportunities);

      return buys.map(b => {
        // Weight by seniority and value
        let score = 0.6;
        if (b.is_officer) score += 0.15;
        if (b.insider_title?.toLowerCase().includes('ceo')) score += 0.15;
        if (b.insider_title?.toLowerCase().includes('cfo')) score += 0.1;
        if (b.total_value > 100000) score += 0.1;   // $100K+
        if (b.total_value > 500000) score += 0.1;   // $500K+

        return {
          symbol: b.symbol,
          name: b.name,
          sector: b.sector,
          type: 'openMarketBuy',
          subtype: 'insider_buy',
          trigger: `${b.insider_name} (${b.insider_title}) bought $${(b.total_value/1000).toFixed(0)}K open market`,
          score: Math.min(1, score),
          direction: 'bullish',
          timestamp: b.transaction_date,
          details: {
            insider: b.insider_name,
            title: b.insider_title,
            value: b.total_value,
            shares: b.shares_transacted,
            price: b.price_per_share,
            currentPrice: b.last_price,
          },
        };
      });
    } catch (error) {
      console.log('Open market buy scan skipped:', error.message);
      return [];
    }
  }

  /**
   * NEW: Scan for earnings momentum (consecutive beats)
   */
  async _scanEarningsMomentum() {
    try {
      const momentum = this.signalEnhancements.getEarningsMomentumOpportunities(
        this.options.minConsecutiveBeats,
        this.options.maxOpportunities
      );

      return momentum.map(m => {
        // Score based on consecutive beats and surprise magnitude
        let score = 0.4 + (m.consecutive_beats * 0.1);
        if (m.avg_surprise > 5) score += 0.15;   // >5% avg surprise
        if (m.avg_surprise > 10) score += 0.1;   // >10% strong beats
        if (m.alpha_1m > 0) score += 0.1;        // Positive recent momentum

        return {
          symbol: m.symbol,
          name: m.name,
          sector: m.sector,
          type: 'earningsMomentum',
          subtype: 'consecutive_beats',
          trigger: `${m.consecutive_beats} consecutive earnings beats (avg ${m.avg_surprise?.toFixed(1)}% surprise)`,
          score: Math.min(1, score),
          direction: 'bullish',
          timestamp: new Date().toISOString(),
          details: {
            consecutiveBeats: m.consecutive_beats,
            beatRate: m.beat_rate,
            avgSurprise: m.avg_surprise,
            nextEarnings: m.next_earnings_date,
            alpha1m: m.alpha_1m,
          },
        };
      });
    } catch (error) {
      console.log('Earnings momentum scan skipped:', error.message);
      return [];
    }
  }

  /**
   * Rank and deduplicate opportunities
   */
  _rankOpportunities(opportunities, regime) {
    // Group by symbol
    const bySymbol = {};

    for (const opp of opportunities) {
      if (!bySymbol[opp.symbol]) {
        bySymbol[opp.symbol] = {
          symbol: opp.symbol,
          name: opp.name,
          sector: opp.sector,
          triggers: [],
          totalScore: 0,
          types: new Set(),
          directions: new Set(),
        };
      }
      bySymbol[opp.symbol].triggers.push(opp);
      bySymbol[opp.symbol].totalScore += opp.score;
      bySymbol[opp.symbol].types.add(opp.type);
      bySymbol[opp.symbol].directions.add(opp.direction);
    }

    // Convert to array and calculate final scores
    let ranked = Object.values(bySymbol).map(item => {
      // Confirmation bonus for multiple signal types
      const confirmationBonus = (item.types.size - 1) * 0.15;

      // Direction alignment bonus (all signals agree)
      const directionBonus = item.directions.size === 1 ? 0.1 : 0;

      // Average score per signal (to not over-reward many weak signals)
      const avgScore = item.totalScore / item.triggers.length;

      // Final score combines total, average, and bonuses
      const finalScore = avgScore * 0.6 + (item.totalScore * 0.1) + confirmationBonus + directionBonus;

      return {
        symbol: item.symbol,
        name: item.name,
        sector: item.sector,
        score: Math.round(finalScore * 1000) / 1000,
        confirmation: item.types.size,
        signalTypes: Array.from(item.types),
        direction: item.directions.size === 1 ? Array.from(item.directions)[0] : 'mixed',
        triggerCount: item.triggers.length,
        triggers: item.triggers.slice(0, 5), // Top 5 triggers
        topTrigger: item.triggers.sort((a, b) => b.score - a.score)[0]?.trigger,
      };
    });

    // Adjust for regime
    if (regime?.regime === 'BEAR') {
      // In bear market, prefer bearish opportunities or reduce bullish scores
      ranked = ranked.map(r => ({
        ...r,
        score: r.direction === 'bearish' ? r.score * 1.2 : r.score * 0.8,
      }));
    } else if (regime?.regime === 'CRISIS') {
      // In crisis, heavily penalize long opportunities
      ranked = ranked.map(r => ({
        ...r,
        score: r.direction === 'bearish' ? r.score * 1.3 : r.score * 0.5,
      }));
    }

    // Sort by score descending
    ranked.sort((a, b) => b.score - a.score);

    return ranked;
  }

  /**
   * Get opportunities for specific symbols
   */
  async scanSymbols(symbols, options = {}) {
    const results = [];

    for (const symbol of symbols) {
      try {
        // Get company ID
        const company = this.db.prepare(`
          SELECT id, symbol, name, sector FROM companies WHERE LOWER(symbol) = LOWER(?)
        `).get(symbol);

        if (!company) continue;

        const opportunities = [];

        // Check each source for this symbol
        const sentiment = this.db.prepare(`
          SELECT * FROM combined_sentiment
          WHERE company_id = ?
          ORDER BY calculated_at DESC LIMIT 1
        `).get(company.id);

        if (sentiment && Math.abs(sentiment.combined_score) > 0.2) {
          opportunities.push({
            type: 'sentiment',
            score: Math.abs(sentiment.combined_score),
            signal: sentiment.combined_signal,
            direction: sentiment.combined_score > 0 ? 'bullish' : 'bearish',
          });
        }

        const insider = this.db.prepare(`
          SELECT * FROM insider_activity_summary
          WHERE company_id = ? AND period = '90d'
        `).get(company.id);

        if (insider && (insider.buy_value > 50000 || insider.sell_value > 100000)) {
          opportunities.push({
            type: 'insider',
            score: Math.min(Math.abs(insider.net_value) / 500000, 1),
            signal: insider.insider_signal,
            direction: insider.net_value > 0 ? 'bullish' : 'bearish',
          });
        }

        const analyst = this.db.prepare(`
          SELECT * FROM analyst_estimates WHERE company_id = ?
        `).get(company.id);

        if (analyst && analyst.upside_potential) {
          opportunities.push({
            type: 'analyst',
            score: Math.min(Math.abs(analyst.upside_potential) / 50, 1),
            signal: analyst.recommendation_key,
            direction: analyst.upside_potential > 0 ? 'bullish' : 'bearish',
          });
        }

        results.push({
          symbol: company.symbol,
          name: company.name,
          sector: company.sector,
          opportunities,
          hasOpportunity: opportunities.length > 0,
          topOpportunity: opportunities.sort((a, b) => b.score - a.score)[0] || null,
        });
      } catch (error) {
        results.push({
          symbol,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Get sector breakdown of opportunities
   */
  async getSectorBreakdown() {
    const scan = await this.scan({ limit: 100 });

    const sectors = {};
    for (const opp of scan.opportunities) {
      const sector = opp.sector || 'Unknown';
      if (!sectors[sector]) {
        sectors[sector] = { count: 0, avgScore: 0, symbols: [] };
      }
      sectors[sector].count++;
      sectors[sector].avgScore += opp.score;
      sectors[sector].symbols.push(opp.symbol);
    }

    // Calculate averages
    for (const sector of Object.keys(sectors)) {
      sectors[sector].avgScore = Math.round((sectors[sector].avgScore / sectors[sector].count) * 1000) / 1000;
    }

    return sectors;
  }
}

module.exports = { OpportunityScanner };
