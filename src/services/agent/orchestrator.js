// src/services/agent/orchestrator.js
// Trading Orchestrator - Coordinates all components for daily analysis workflow

const { TradingAgent } = require('./tradingAgent');
const { RiskManager } = require('./riskManager');
const { OpportunityScanner } = require('./opportunityScanner');

class TradingOrchestrator {
  constructor(db, config = {}) {
    this.db = db;
    this.config = {
      maxRecommendationsPerRun: config.maxRecommendationsPerRun || 10,
      minOpportunityScore: config.minOpportunityScore || 0.3,
      autoExecute: config.autoExecute || false, // Safety: off by default
      ...config,
    };

    // Initialize components
    this.tradingAgent = new TradingAgent(db, config.agentConfig || {});
    this.riskManager = new RiskManager(db, config.riskConfig || {});
    this.scanner = new OpportunityScanner(db, config.scannerConfig || {});

    console.log('🎯 Trading Orchestrator initialized');
  }

  /**
   * Run complete daily analysis for a portfolio
   * @param {number} portfolioId
   * @returns {DailyAnalysis}
   */
  async runDailyAnalysis(portfolioId) {
    const startTime = Date.now();

    const analysis = {
      date: new Date().toISOString().split('T')[0],
      portfolioId,
      regime: null,
      opportunities: [],
      recommendations: [],
      summary: {},
      executionTime: 0,
      errors: [],
    };

    try {
      // Validate portfolio exists
      const portfolio = await this.db.get(
        'SELECT * FROM portfolios WHERE id = $1',
        [portfolioId]
      );
      if (!portfolio) {
        throw new Error(`Portfolio ${portfolioId} not found`);
      }

      console.log(`\n🎯 Starting daily analysis for portfolio: ${portfolio.name}`);

      // Step 1: Detect market regime
      console.log('\n📊 Step 1: Detecting market regime...');
      analysis.regime = await this._detectRegime();
      console.log(`   Regime: ${analysis.regime.regime} (${(analysis.regime.confidence * 100).toFixed(0)}% confidence)`);

      // Store regime in history
      await this._storeRegime(analysis.regime);

      // Step 2: Get portfolio context
      console.log('\n💼 Step 2: Getting portfolio context...');
      const portfolioContext = await this._getPortfolioContext(portfolioId);
      console.log(`   Value: $${portfolioContext.totalValue.toLocaleString()}, Cash: $${portfolioContext.cash.toLocaleString()}`);
      console.log(`   Positions: ${portfolioContext.positions.length}`);

      // Step 3: Scan for opportunities
      console.log('\n🔍 Step 3: Scanning for opportunities...');
      const scanResult = await this.scanner.scan({
        regime: analysis.regime,
        portfolioId,
      });
      analysis.opportunities = scanResult.opportunities;
      console.log(`   Found ${analysis.opportunities.length} opportunities`);

      // Step 4: Generate recommendations for top opportunities
      const opportunitiesToAnalyze = analysis.opportunities
        .filter(o => o.score >= this.config.minOpportunityScore)
        .slice(0, this.config.maxRecommendationsPerRun);

      console.log(`\n🤖 Step 4: Generating recommendations for ${opportunitiesToAnalyze.length} opportunities...`);

      for (const opp of opportunitiesToAnalyze) {
        try {
          // Get recommendation from trading agent
          const recommendation = await this.tradingAgent.getRecommendation(
            opp.symbol,
            portfolioContext,
            analysis.regime
          );

          // Skip holds
          if (recommendation.action === 'hold') {
            continue;
          }

          // Run risk check
          const riskCheck = await this.riskManager.validate(
            recommendation,
            portfolioId,
            analysis.regime
          );

          // Build enriched recommendation
          const enrichedRec = {
            ...recommendation,
            opportunity: {
              score: opp.score,
              confirmation: opp.confirmation,
              signalTypes: opp.signalTypes,
              topTrigger: opp.topTrigger,
            },
            riskCheck: {
              approved: riskCheck.approved,
              passRate: riskCheck.passRate,
              adjustedPositionSize: riskCheck.adjustedPositionSize,
              warnings: riskCheck.warnings,
              blockers: riskCheck.blockers,
            },
            actionable: riskCheck.approved,
          };

          analysis.recommendations.push(enrichedRec);
          console.log(`   ${opp.symbol}: ${recommendation.action} (score: ${recommendation.score.toFixed(2)}, ${riskCheck.approved ? '✓' : '✗'})`);

        } catch (error) {
          console.error(`   Error analyzing ${opp.symbol}:`, error.message);
          analysis.errors.push({
            symbol: opp.symbol,
            error: error.message,
          });
        }
      }

      // Sort recommendations by score
      analysis.recommendations.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

      // Step 5: Generate summary
      console.log('\n📋 Step 5: Generating summary...');
      analysis.summary = this._generateSummary(analysis, portfolioContext);

      // Step 6: Store analysis
      const analysisId = await this._storeAnalysis(analysis, Date.now() - startTime);
      analysis.id = analysisId;

      console.log('\n✅ Daily analysis complete!');
      console.log(`   Recommendations: ${analysis.recommendations.length}`);
      console.log(`   Actionable buys: ${analysis.summary.actionableBuys}`);
      console.log(`   Actionable sells: ${analysis.summary.actionableSells}`);

    } catch (error) {
      console.error('\n❌ Daily analysis failed:', error.message);
      analysis.errors.push({ general: error.message });
    }

    analysis.executionTime = Date.now() - startTime;
    return analysis;
  }

  /**
   * Detect current market regime
   */
  async _detectRegime() {
    // Get market indicators
    const indicators = await this.db.all(
      `SELECT indicator_type, indicator_value, indicator_label, components
       FROM market_sentiment
       WHERE indicator_type IN ('vix', 'cnn_fear_greed', 'overall_market')
       ORDER BY fetched_at DESC`
    );

    let vix = null;
    let fearGreed = null;
    let marketLabel = null;

    for (const ind of indicators) {
      if (ind.indicator_type === 'vix' && vix === null) {
        vix = ind.indicator_value;
      } else if (ind.indicator_type === 'cnn_fear_greed' && fearGreed === null) {
        fearGreed = ind.indicator_value;
      } else if (ind.indicator_type === 'overall_market' && marketLabel === null) {
        marketLabel = ind.indicator_label;
      }
    }

    // Calculate market breadth from recent price changes
    const breadthData = await this.db.get(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN change_1w > 0 THEN 1 ELSE 0 END) as advancing,
         SUM(CASE WHEN change_1w < 0 THEN 1 ELSE 0 END) as declining,
         AVG(change_1w) as avg_change
       FROM price_metrics
       WHERE change_1w IS NOT NULL`
    );

    const breadth = breadthData.total > 0
      ? (breadthData.advancing - breadthData.declining) / breadthData.total
      : 0;

    // Classify regime
    let regime = 'SIDEWAYS';
    let confidence = 0.5;
    let description = '';

    if (vix !== null) {
      if (vix > 35) {
        regime = 'CRISIS';
        confidence = 0.85;
        description = `Crisis conditions: VIX at ${vix.toFixed(1)}`;
      } else if (vix > 25) {
        regime = 'HIGH_VOL';
        confidence = 0.75;
        description = `High volatility: VIX at ${vix.toFixed(1)}`;
      } else if (vix < 15) {
        if (fearGreed && fearGreed > 60 && breadth > 0.3) {
          regime = 'BULL';
          confidence = 0.8;
          description = `Bullish: Low VIX (${vix.toFixed(1)}), positive breadth`;
        } else if (fearGreed && fearGreed < 30) {
          regime = 'BEAR';
          confidence = 0.7;
          description = 'Bearish: Low VIX but fearful sentiment';
        }
      } else if (vix >= 15 && vix <= 25) {
        if (breadth > 0.2 && fearGreed && fearGreed > 50) {
          regime = 'BULL';
          confidence = 0.6;
          description = 'Moderately bullish conditions';
        } else if (breadth < -0.2 && fearGreed && fearGreed < 40) {
          regime = 'BEAR';
          confidence = 0.6;
          description = 'Moderately bearish conditions';
        } else {
          regime = 'SIDEWAYS';
          confidence = 0.6;
          description = 'Range-bound market';
        }
      }
    }

    // Trend strength calculation
    const trendStrength = Math.abs(breadth);

    return {
      regime,
      confidence,
      vix,
      vixPercentile: this._calculateVixPercentile(vix),
      breadth: Math.round(breadth * 1000) / 1000,
      trendStrength: Math.round(trendStrength * 1000) / 1000,
      fearGreed,
      description: description || this._getDefaultDescription(regime),
      indicators: { vix, fearGreed, breadth, marketLabel },
    };
  }

  _calculateVixPercentile(vix) {
    if (vix === null) return null;
    // Approximate VIX percentiles based on historical data
    if (vix < 12) return 5;
    if (vix < 15) return 20;
    if (vix < 18) return 40;
    if (vix < 22) return 60;
    if (vix < 28) return 80;
    if (vix < 35) return 90;
    return 95;
  }

  _getDefaultDescription(regime) {
    const descriptions = {
      'BULL': 'Bullish market conditions favorable for risk-taking',
      'BEAR': 'Bearish conditions - defensive positioning recommended',
      'SIDEWAYS': 'Range-bound market - selective opportunities',
      'HIGH_VOL': 'High volatility - reduced position sizes recommended',
      'CRISIS': 'Crisis conditions - maximum caution advised',
    };
    return descriptions[regime] || 'Unknown market conditions';
  }

  /**
   * Get portfolio context for recommendations
   */
  async _getPortfolioContext(portfolioId) {
    const portfolio = await this.db.get(
      'SELECT * FROM portfolios WHERE id = $1',
      [portfolioId]
    );
    const positions = await this.db.all(
      `SELECT pp.*, c.symbol, c.sector
       FROM portfolio_positions pp
       JOIN companies c ON pp.company_id = c.id
       WHERE pp.portfolio_id = $1`,
      [portfolioId]
    );

    const totalPositionsValue = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);
    const cash = portfolio?.current_cash || 0;

    // Calculate sector exposure
    const sectorExposure = {};
    for (const pos of positions) {
      const sector = pos.sector || 'Unknown';
      sectorExposure[sector] = (sectorExposure[sector] || 0) + (pos.current_value || 0);
    }

    // Convert to percentages
    const totalValue = totalPositionsValue + cash;
    for (const sector of Object.keys(sectorExposure)) {
      sectorExposure[sector] = totalValue > 0 ? sectorExposure[sector] / totalValue : 0;
    }

    return {
      portfolioId,
      name: portfolio?.name,
      positions,
      positionCount: positions.length,
      totalValue: totalPositionsValue,
      cash,
      totalAssets: totalValue,
      sectorExposure,
      symbols: positions.map(p => p.symbol),
    };
  }

  /**
   * Generate analysis summary
   */
  _generateSummary(analysis, portfolioContext) {
    const buys = analysis.recommendations.filter(r =>
      r.action.includes('buy') && r.actionable
    );
    const sells = analysis.recommendations.filter(r =>
      r.action.includes('sell') && r.actionable
    );
    const blocked = analysis.recommendations.filter(r => !r.actionable);

    // Top recommendations
    const topBuy = buys.sort((a, b) => b.score - a.score)[0];
    const topSell = sells.sort((a, b) => a.score - b.score)[0];

    // Calculate total suggested investment
    const totalSuggestedValue = buys.reduce((sum, r) => sum + (r.suggestedValue || 0), 0);

    return {
      regime: analysis.regime.regime,
      regimeDescription: analysis.regime.description,
      regimeConfidence: analysis.regime.confidence,

      opportunitiesFound: analysis.opportunities.length,
      recommendationsGenerated: analysis.recommendations.length,

      actionableBuys: buys.length,
      actionableSells: sells.length,
      blockedRecommendations: blocked.length,

      topBuy: topBuy ? {
        symbol: topBuy.symbol,
        action: topBuy.action,
        score: topBuy.score,
        suggestedValue: topBuy.suggestedValue,
      } : null,

      topSell: topSell ? {
        symbol: topSell.symbol,
        action: topSell.action,
        score: topSell.score,
      } : null,

      totalSuggestedInvestment: Math.round(totalSuggestedValue * 100) / 100,
      availableCash: portfolioContext.cash,

      avgConfidence: analysis.recommendations.length > 0
        ? Math.round(analysis.recommendations.reduce((s, r) => s + r.confidence, 0) / analysis.recommendations.length * 100) / 100
        : 0,

      errorsCount: analysis.errors.length,
    };
  }

  /**
   * Store analysis in database
   */
  async _storeAnalysis(analysis, executionTimeMs) {
    const result = await this.db.get(
      `INSERT INTO daily_analyses
       (portfolio_id, date, regime, regime_confidence, regime_description,
        opportunities_count, opportunities, recommendations_count, recommendations,
        executed_count, skipped_count, blocked_count, summary, execution_time_ms, errors)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        analysis.portfolioId,
        analysis.regime.regime,
        analysis.regime.confidence,
        analysis.regime.description,
        analysis.opportunities.length,
        JSON.stringify(analysis.opportunities.slice(0, 20)), // Limit stored opportunities
        analysis.recommendations.length,
        JSON.stringify(analysis.recommendations),
        0, // executed_count
        0, // skipped_count
        analysis.recommendations.filter(r => !r.actionable).length, // blocked_count
        JSON.stringify(analysis.summary),
        executionTimeMs,
        JSON.stringify(analysis.errors)
      ]
    );

    return result.id;
  }

  /**
   * Store regime in history
   */
  async _storeRegime(regime) {
    try {
      await this.db.run(
        `INSERT INTO market_regime_history
         (date, regime, confidence, vix_level, vix_percentile, market_breadth,
          trend_strength, fear_greed_index, description, indicators)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (date) DO UPDATE SET
           regime = EXCLUDED.regime,
           confidence = EXCLUDED.confidence,
           vix_level = EXCLUDED.vix_level,
           vix_percentile = EXCLUDED.vix_percentile,
           market_breadth = EXCLUDED.market_breadth,
           trend_strength = EXCLUDED.trend_strength,
           fear_greed_index = EXCLUDED.fear_greed_index,
           description = EXCLUDED.description,
           indicators = EXCLUDED.indicators`,
        [
          regime.regime,
          regime.confidence,
          regime.vix,
          regime.vixPercentile,
          regime.breadth,
          regime.trendStrength,
          regime.fearGreed,
          regime.description,
          JSON.stringify(regime.indicators)
        ]
      );
    } catch (error) {
      console.error('Error storing regime:', error.message);
    }
  }

  /**
   * Get latest analysis for a portfolio
   */
  async getLatestAnalysis(portfolioId) {
    const row = await this.db.get(
      `SELECT * FROM daily_analyses
       WHERE portfolio_id = $1
       ORDER BY date DESC, created_at DESC
       LIMIT 1`,
      [portfolioId]
    );
    if (!row) return null;

    return {
      ...row,
      opportunities: row.opportunities ? JSON.parse(row.opportunities) : [],
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
      summary: row.summary ? JSON.parse(row.summary) : {},
      errors: row.errors ? JSON.parse(row.errors) : [],
    };
  }

  /**
   * Get analysis history for a portfolio
   */
  async getAnalysisHistory(portfolioId, days = 30) {
    const rows = await this.db.all(
      `SELECT * FROM daily_analyses
       WHERE portfolio_id = $1
       AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
       ORDER BY date DESC`,
      [portfolioId, days]
    );

    return rows.map(row => ({
      ...row,
      opportunities: row.opportunities ? JSON.parse(row.opportunities) : [],
      recommendations: row.recommendations ? JSON.parse(row.recommendations) : [],
      summary: row.summary ? JSON.parse(row.summary) : {},
      errors: row.errors ? JSON.parse(row.errors) : [],
    }));
  }

  /**
   * Get current market regime
   */
  async getCurrentRegime() {
    return await this._detectRegime();
  }

  /**
   * Get regime history
   */
  async getRegimeHistory(days = 30) {
    const rows = await this.db.all(
      `SELECT * FROM market_regime_history
       WHERE date >= CURRENT_DATE - INTERVAL '1 day' * $1
       ORDER BY date DESC`,
      [days]
    );

    return rows.map(row => ({
      ...row,
      indicators: row.indicators ? JSON.parse(row.indicators) : {},
    }));
  }

  /**
   * Quick scan without full analysis (for API)
   */
  async quickScan(options = {}) {
    const regime = await this._detectRegime();
    const opportunities = await this.scanner.scan({
      regime,
      limit: options.limit || 10,
      types: options.types,
    });

    return {
      regime,
      opportunities: opportunities.opportunities,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze a single symbol
   */
  async analyzeSymbol(symbol, portfolioId = null) {
    const regime = await this._detectRegime();

    let portfolioContext = null;
    if (portfolioId) {
      portfolioContext = await this._getPortfolioContext(portfolioId);
    }

    const recommendation = await this.tradingAgent.getRecommendation(
      symbol,
      portfolioContext,
      regime
    );

    let riskCheck = null;
    if (portfolioId && recommendation.action !== 'hold') {
      riskCheck = await this.riskManager.validate(recommendation, portfolioId, regime);
    }

    return {
      recommendation,
      riskCheck,
      regime,
      actionable: riskCheck ? riskCheck.approved : true,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get summary stats across all portfolios
   */
  async getSystemStats() {
    const stats = await this.db.get(
      `SELECT
         COUNT(DISTINCT portfolio_id) as portfolios_analyzed,
         COUNT(*) as total_analyses,
         SUM(recommendations_count) as total_recommendations,
         SUM(executed_count) as total_executed,
         AVG(execution_time_ms) as avg_execution_time
       FROM daily_analyses
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'`
    );

    const regimeBreakdown = await this.db.all(
      `SELECT regime, COUNT(*) as count
       FROM market_regime_history
       WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY regime`
    );

    const recentRecommendations = await this.db.all(
      `SELECT action, COUNT(*) as count
       FROM agent_recommendations
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY action`
    );

    return {
      ...stats,
      regimeBreakdown: Object.fromEntries(regimeBreakdown.map(r => [r.regime, r.count])),
      recentRecommendations: Object.fromEntries(recentRecommendations.map(r => [r.action, r.count])),
      lastUpdated: new Date().toISOString(),
    };
  }
}

module.exports = { TradingOrchestrator };
