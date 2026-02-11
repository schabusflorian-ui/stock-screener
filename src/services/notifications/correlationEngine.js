/**
 * CorrelationEngine - Cross-Feature Alert Detection
 *
 * Detects meaningful correlations between different data sources:
 * - Portfolio positions + Company signals
 * - Watchlist items + Market sentiment
 * - Insider activity + Price movements
 * - Multiple signals converging on same company
 *
 * Creates compound "correlation alerts" that provide higher signal value
 * than individual alerts alone.
 */

const { NOTIFICATION_CATEGORIES, PRIORITY_LEVELS } = require('./constants');

class CorrelationEngine {
  constructor(db, notificationService) {
    this.db = db;
    this.notificationService = notificationService;

    // Correlation rules configuration
    this.rules = [
      {
        id: 'portfolio_company_signal',
        name: 'Portfolio Position + Buy Signal',
        description: 'Company in your portfolio received a strong buy signal',
        weight: 5,
        handler: this.detectPortfolioCompanySignal.bind(this)
      },
      {
        id: 'watchlist_price_signal',
        name: 'Watchlist + Price Alert',
        description: 'Watched company hit price target with corroborating signal',
        weight: 4,
        handler: this.detectWatchlistPriceSignal.bind(this)
      },
      {
        id: 'multiple_signals',
        name: 'Multiple Signals Convergence',
        description: 'Multiple independent signals point to same company',
        weight: 4,
        handler: this.detectMultipleSignals.bind(this)
      },
      {
        id: 'insider_sentiment',
        name: 'Insider Activity + Sentiment',
        description: 'Insider buying coincides with positive sentiment shift',
        weight: 3,
        handler: this.detectInsiderSentiment.bind(this)
      },
      {
        id: 'sector_correlation',
        name: 'Sector-Wide Pattern',
        description: 'Multiple companies in sector showing same signal',
        weight: 3,
        handler: this.detectSectorCorrelation.bind(this)
      },
      {
        id: 'fundamental_technical',
        name: 'Fundamental + Technical Alignment',
        description: 'Valuation signal aligns with technical indicator',
        weight: 4,
        handler: this.detectFundamentalTechnical.bind(this)
      }
    ];

    // Time windows for correlation detection (in milliseconds)
    this.timeWindows = {
      short: 24 * 60 * 60 * 1000,      // 24 hours
      medium: 7 * 24 * 60 * 60 * 1000,  // 7 days
      long: 30 * 24 * 60 * 60 * 1000    // 30 days
    };

    console.log('[CorrelationEngine] Initialized with', this.rules.length, 'correlation rules');
  }

  /**
   * Run all correlation detectors
   */
  async runCorrelationAnalysis(options = {}) {
    const results = {
      correlationsFound: 0,
      notificationsCreated: 0,
      ruleResults: {}
    };

    console.log('[CorrelationEngine] Starting correlation analysis...');

    for (const rule of this.rules) {
      try {
        const correlations = await rule.handler(options);
        results.ruleResults[rule.id] = correlations.length;

        for (const correlation of correlations) {
          const notification = await this.createCorrelationNotification(correlation, rule);
          if (notification) {
            results.notificationsCreated++;
          }
        }

        results.correlationsFound += correlations.length;
      } catch (err) {
        console.error(`[CorrelationEngine] Error in rule ${rule.id}:`, err);
        results.ruleResults[rule.id] = { error: err.message };
      }
    }

    console.log('[CorrelationEngine] Analysis complete:', results);
    return results;
  }

  /**
   * Detect portfolio positions with matching company signals
   */
  async detectPortfolioCompanySignal(options = {}) {
    const correlations = [];
    const since = new Date(Date.now() - this.timeWindows.short).toISOString();

    // Find recent company alerts for stocks in portfolios
    const query = `
      SELECT
        a.id as alert_id,
        a.company_id,
        a.alert_type,
        a.signal_type,
        a.priority,
        a.title,
        a.description,
        a.triggered_at,
        c.symbol,
        c.name as company_name,
        pp.portfolio_id,
        pp.shares,
        pp.cost_basis,
        p.name as portfolio_name
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      JOIN portfolio_positions pp ON c.id = pp.company_id
      JOIN portfolios p ON pp.portfolio_id = p.id
      WHERE a.triggered_at > $1
        AND a.signal_type IN ('strong_buy', 'buy')
        AND a.is_dismissed = 0
      ORDER BY a.priority DESC, a.triggered_at DESC
      LIMIT 50
    `;

    try {
      const result = await this.db.query(query, [since]);
      const matches = result.rows || [];

      for (const match of matches) {
        // Check if we already created this correlation recently
        if (await this.isDuplicate('portfolio_company_signal', match.company_id, match.portfolio_id)) {
          continue;
        }

        correlations.push({
          type: 'portfolio_company_signal',
          severity: match.signal_type === 'strong_buy' ? 'critical' : 'warning',
          priority: Math.min(5, match.priority + 1), // Boost priority for correlation
          title: `${match.symbol}: ${match.signal_type.replace('_', ' ')} signal on your position`,
          body: `${match.company_name} in "${match.portfolio_name}" received a ${match.signal_type.replace('_', ' ')} signal. ${match.title}`,
          relatedEntities: [
            { type: 'company', id: match.company_id, label: match.symbol },
            { type: 'portfolio', id: match.portfolio_id, label: match.portfolio_name }
          ],
          correlatedAlerts: [match.alert_id],
          data: {
            symbol: match.symbol,
            signalType: match.signal_type,
            alertType: match.alert_type,
            portfolioId: match.portfolio_id,
            shares: match.shares,
            costBasis: match.cost_basis
          }
        });
      }
    } catch (err) {
      console.error('[CorrelationEngine] Portfolio signal detection error:', err);
    }

    return correlations;
  }

  /**
   * Detect watchlist price alerts with corroborating signals
   */
  async detectWatchlistPriceSignal(options = {}) {
    const correlations = [];
    const since = new Date(Date.now() - this.timeWindows.short).toISOString();

    // Find watchlist items with recent alerts
    const query = `
      SELECT
        w.symbol,
        w.target_price_above,
        w.target_price_below,
        w.notes,
        c.id as company_id,
        c.name as company_name,
        a.id as alert_id,
        a.signal_type,
        a.alert_type,
        a.title as alert_title,
        a.priority,
        pm.last_price
      FROM watchlist w
      JOIN companies c ON w.symbol = c.symbol
      JOIN alerts a ON c.id = a.company_id
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      WHERE a.triggered_at > $1
        AND a.is_dismissed = 0
        AND (
          (w.target_price_above IS NOT NULL AND pm.last_price >= w.target_price_above)
          OR (w.target_price_below IS NOT NULL AND pm.last_price <= w.target_price_below)
        )
      ORDER BY a.priority DESC
      LIMIT 30
    `;

    try {
      const result = await this.db.query(query, [since]);
      const matches = result.rows || [];

      for (const match of matches) {
        if (await this.isDuplicate('watchlist_price_signal', match.company_id)) {
          continue;
        }

        const priceDirection = match.target_price_above && match.last_price >= match.target_price_above
          ? 'above'
          : 'below';

        correlations.push({
          type: 'watchlist_price_signal',
          severity: 'warning',
          priority: Math.min(5, match.priority + 1),
          title: `${match.symbol}: Price target hit with ${match.signal_type.replace('_', ' ')} signal`,
          body: `${match.company_name} broke ${priceDirection} your price target while also showing a ${match.signal_type.replace('_', ' ')} signal.`,
          relatedEntities: [
            { type: 'company', id: match.company_id, label: match.symbol }
          ],
          correlatedAlerts: [match.alert_id],
          data: {
            symbol: match.symbol,
            lastPrice: match.last_price,
            targetAbove: match.target_price_above,
            targetBelow: match.target_price_below,
            signalType: match.signal_type,
            notes: match.notes
          }
        });
      }
    } catch (err) {
      console.error('[CorrelationEngine] Watchlist price detection error:', err);
    }

    return correlations;
  }

  /**
   * Detect multiple independent signals on the same company
   */
  async detectMultipleSignals(options = {}) {
    const correlations = [];
    const since = new Date(Date.now() - this.timeWindows.short).toISOString();

    // Find companies with multiple recent alerts of different types
    const query = `
      SELECT
        c.id as company_id,
        c.symbol,
        c.name as company_name,
        COUNT(DISTINCT a.alert_type) as alert_type_count,
        GROUP_CONCAT(DISTINCT a.alert_type) as alert_types,
        GROUP_CONCAT(DISTINCT a.signal_type) as signal_types,
        GROUP_CONCAT(a.id) as alert_ids,
        MAX(a.priority) as max_priority,
        COUNT(*) as total_alerts
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      WHERE a.triggered_at > $1
        AND a.is_dismissed = 0
        AND a.signal_type IN ('strong_buy', 'buy', 'watch')
      GROUP BY c.id
      HAVING COUNT(DISTINCT a.alert_type) >= 2
      ORDER BY alert_type_count DESC, max_priority DESC
      LIMIT 20
    `;

    try {
      const result = await this.db.query(query, [since]);
      const matches = result.rows || [];

      for (const match of matches) {
        if (await this.isDuplicate('multiple_signals', match.company_id)) {
          continue;
        }

        const alertTypes = match.alert_types.split(',');
        const hasStrongBuy = match.signal_types.includes('strong_buy');

        correlations.push({
          type: 'multiple_signals',
          severity: hasStrongBuy ? 'critical' : 'warning',
          priority: Math.min(5, match.max_priority + alertTypes.length - 1),
          title: `${match.symbol}: ${alertTypes.length} different signals converging`,
          body: `${match.company_name} is showing ${match.total_alerts} alerts across ${alertTypes.length} categories: ${alertTypes.join(', ')}.`,
          relatedEntities: [
            { type: 'company', id: match.company_id, label: match.symbol }
          ],
          correlatedAlerts: match.alert_ids.split(',').map(id => parseInt(id)),
          data: {
            symbol: match.symbol,
            alertTypes,
            signalTypes: match.signal_types.split(','),
            totalAlerts: match.total_alerts,
            alertTypeCount: match.alert_type_count
          }
        });
      }
    } catch (err) {
      console.error('[CorrelationEngine] Multiple signals detection error:', err);
    }

    return correlations;
  }

  /**
   * Detect insider buying with positive sentiment
   */
  async detectInsiderSentiment(options = {}) {
    const correlations = [];
    const since = new Date(Date.now() - this.timeWindows.medium).toISOString();

    // Find insider buys with positive sentiment data
    const query = `
      SELECT
        c.id as company_id,
        c.symbol,
        c.name as company_name,
        it.transaction_type,
        it.shares,
        it.value,
        it.insider_name,
        it.insider_title,
        it.transaction_date,
        s.sentiment_score,
        s.sentiment_change_7d
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      LEFT JOIN sentiment_data s ON c.id = s.company_id
      WHERE it.transaction_date > $1
        AND it.transaction_type = 'buy'
        AND it.value > 10000
        AND s.sentiment_score > 0.6
      ORDER BY it.value DESC
      LIMIT 20
    `;

    try {
      const result = await this.db.query(query, [since]);
      const matches = result.rows || [];

      for (const match of matches) {
        if (await this.isDuplicate('insider_sentiment', match.company_id)) {
          continue;
        }

        correlations.push({
          type: 'insider_sentiment',
          severity: 'warning',
          priority: PRIORITY_LEVELS.MEDIUM,
          title: `${match.symbol}: Insider buying + positive sentiment`,
          body: `${match.insider_name} (${match.insider_title}) bought $${match.value.toLocaleString()} of ${match.company_name} stock. Sentiment score: ${(match.sentiment_score * 100).toFixed(0)}%.`,
          relatedEntities: [
            { type: 'company', id: match.company_id, label: match.symbol }
          ],
          data: {
            symbol: match.symbol,
            insiderName: match.insider_name,
            insiderTitle: match.insider_title,
            transactionValue: match.value,
            shares: match.shares,
            sentimentScore: match.sentiment_score,
            sentimentChange: match.sentiment_change_7d
          }
        });
      }
    } catch (err) {
      // Table might not exist - that's OK
      if (!err.message.includes('no such table')) {
        console.error('[CorrelationEngine] Insider sentiment detection error:', err);
      }
    }

    return correlations;
  }

  /**
   * Detect sector-wide patterns
   */
  async detectSectorCorrelation(options = {}) {
    const correlations = [];
    const since = new Date(Date.now() - this.timeWindows.short).toISOString();

    // Find sectors with multiple companies showing same signal type
    const query = `
      SELECT
        c.sector,
        a.signal_type,
        COUNT(DISTINCT c.id) as company_count,
        GROUP_CONCAT(DISTINCT c.symbol) as symbols,
        GROUP_CONCAT(DISTINCT c.id) as company_ids,
        AVG(a.priority) as avg_priority
      FROM alerts a
      JOIN companies c ON a.company_id = c.id
      WHERE a.triggered_at > $1
        AND a.is_dismissed = 0
        AND a.signal_type IN ('strong_buy', 'buy')
        AND c.sector IS NOT NULL
        AND c.sector != ''
      GROUP BY c.sector, a.signal_type
      HAVING COUNT(DISTINCT c.id) >= 3
      ORDER BY company_count DESC
      LIMIT 10
    `;

    try {
      const result = await this.db.query(query, [since]);
      const matches = result.rows || [];

      for (const match of matches) {
        if (await this.isDuplicate('sector_correlation', match.sector)) {
          continue;
        }

        const symbols = match.symbols.split(',').slice(0, 5);
        const hasMore = match.company_count > 5;

        correlations.push({
          type: 'sector_correlation',
          severity: 'info',
          priority: PRIORITY_LEVELS.MEDIUM,
          title: `${match.sector}: ${match.company_count} companies showing ${match.signal_type.replace('_', ' ')} signals`,
          body: `Sector-wide pattern detected in ${match.sector}. Companies: ${symbols.join(', ')}${hasMore ? ` and ${match.company_count - 5} more` : ''}.`,
          relatedEntities: match.company_ids.split(',').slice(0, 5).map((id, i) => ({
            type: 'company',
            id: parseInt(id),
            label: symbols[i]
          })),
          data: {
            sector: match.sector,
            signalType: match.signal_type,
            companyCount: match.company_count,
            symbols: match.symbols.split(','),
            avgPriority: match.avg_priority
          }
        });
      }
    } catch (err) {
      console.error('[CorrelationEngine] Sector correlation detection error:', err);
    }

    return correlations;
  }

  /**
   * Detect fundamental + technical alignment
   */
  async detectFundamentalTechnical(options = {}) {
    const correlations = [];
    const since = new Date(Date.now() - this.timeWindows.short).toISOString();

    // Find companies with both fundamental and technical alerts
    const query = `
      SELECT
        c.id as company_id,
        c.symbol,
        c.name as company_name,
        fa.id as fundamental_alert_id,
        fa.alert_code as fundamental_code,
        fa.title as fundamental_title,
        ta.id as technical_alert_id,
        ta.alert_code as technical_code,
        ta.title as technical_title,
        GREATEST(fa.priority, ta.priority) as max_priority
      FROM alerts fa
      JOIN alerts ta ON fa.company_id = ta.company_id
      JOIN companies c ON fa.company_id = c.id
      WHERE fa.triggered_at > $1
        AND ta.triggered_at > $2
        AND fa.alert_type = 'valuation'
        AND ta.alert_type = 'price'
        AND fa.signal_type IN ('strong_buy', 'buy')
        AND ta.signal_type IN ('strong_buy', 'buy')
        AND fa.is_dismissed = 0
        AND ta.is_dismissed = 0
      ORDER BY max_priority DESC
      LIMIT 15
    `;

    try {
      const result = await this.db.query(query, [since, since]);
      const matches = result.rows || [];

      for (const match of matches) {
        if (await this.isDuplicate('fundamental_technical', match.company_id)) {
          continue;
        }

        correlations.push({
          type: 'fundamental_technical',
          severity: 'warning',
          priority: Math.min(5, match.max_priority + 1),
          title: `${match.symbol}: Valuation + technical signals aligned`,
          body: `${match.company_name} shows both fundamental value (${match.fundamental_title}) and technical strength (${match.technical_title}).`,
          relatedEntities: [
            { type: 'company', id: match.company_id, label: match.symbol }
          ],
          correlatedAlerts: [match.fundamental_alert_id, match.technical_alert_id],
          data: {
            symbol: match.symbol,
            fundamentalCode: match.fundamental_code,
            technicalCode: match.technical_code,
            fundamentalTitle: match.fundamental_title,
            technicalTitle: match.technical_title
          }
        });
      }
    } catch (err) {
      console.error('[CorrelationEngine] Fundamental/technical detection error:', err);
    }

    return correlations;
  }

  /**
   * Create a correlation notification
   */
  async createCorrelationNotification(correlation, rule) {
    try {
      const notification = await this.notificationService.create({
        category: NOTIFICATION_CATEGORIES.CORRELATION,
        type: correlation.type,
        severity: correlation.severity,
        priority: correlation.priority,
        title: correlation.title,
        body: correlation.body,
        relatedEntities: correlation.relatedEntities,
        data: {
          ...correlation.data,
          correlationRule: rule.id,
          correlatedAlerts: correlation.correlatedAlerts
        }
      });

      return notification;
    } catch (err) {
      console.error('[CorrelationEngine] Error creating notification:', err);
      return null;
    }
  }

  /**
   * Check if we've already created this correlation recently
   */
  async isDuplicate(correlationType, entityId, secondaryId = null) {
    const since = new Date(Date.now() - this.timeWindows.short).toISOString();

    try {
      const query = `
        SELECT COUNT(*) as count
        FROM notifications
        WHERE type = $1
          AND created_at > $2
          AND JSON_EXTRACT(data, '$.correlationRule') = $3
          ${secondaryId ? 'AND JSON_EXTRACT(related_entities, \'$[0].id\') = $4' : ''}
      `;

      const params = secondaryId
        ? [correlationType, since, correlationType, entityId]
        : [correlationType, since, correlationType];

      const result = await this.db.query(query, params);
      const row = result.rows?.[0];
      return row?.count > 0;
    } catch (err) {
      // If notifications table doesn't exist yet, no duplicates
      return false;
    }
  }

  /**
   * Get correlation statistics
   */
  getStats() {
    return {
      rules: this.rules.map(r => ({
        id: r.id,
        name: r.name,
        weight: r.weight
      })),
      timeWindows: Object.entries(this.timeWindows).map(([name, ms]) => ({
        name,
        hours: ms / (60 * 60 * 1000)
      }))
    };
  }
}

module.exports = CorrelationEngine;
