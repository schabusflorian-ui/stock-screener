// src/api/routes/alerts.js
// API routes for alert system

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const AlertService = require('../../services/alerts');
const { SIGNAL_CONFIG, ALERT_TYPE_CONFIG } = require('../../services/alerts/alertDefinitions');
const { DigestManager, DIGEST_MODES } = require('../../services/alerts/digestManager');
const { AlertAISummarizer } = require('../../services/alerts/aiSummarizer');
const { ActionabilityScorer } = require('../../services/alerts/actionabilityScorer');
const { getCurrentRegime } = require('../../services/alerts/regimeThresholds');

// Lazy initialization - services created on first request
let servicesCache = null;

/**
 * Get initialized services with database (lazy singleton pattern)
 * Creates services on first call, reuses on subsequent calls
 */
async function getServicesLazy() {
  if (!servicesCache) {
    const database = await getDatabaseAsync();
    servicesCache = {
      database,
      alertService: new AlertService(database),
      digestManager: new DigestManager(database),
      aiSummarizer: new AlertAISummarizer(database),
      actionabilityScorer: new ActionabilityScorer(database)
    };
  }
  return servicesCache;
}

// Export individual services with getters for backward compatibility
Object.defineProperty(exports, 'alertService', {
  get: () => {
    if (!servicesCache) throw new Error('Services not initialized - call route handler first');
    return servicesCache.alertService;
  }
});

// For compatibility, create proxy objects that will be populated on first request
let database, alertService, digestManager, aiSummarizer, actionabilityScorer;

// Middleware to ensure services are initialized before any route
router.use(async (req, res, next) => {
  try {
    const services = await getServicesLazy();
    database = services.database;
    alertService = services.alertService;
    digestManager = services.digestManager;
    aiSummarizer = services.aiSummarizer;
    actionabilityScorer = services.actionabilityScorer;
    next();
  } catch (error) {
    console.error('Failed to initialize alert services:', error);
    res.status(500).json({ error: 'Service initialization failed' });
  }
});

/**
 * GET /api/alerts
 * Get all alerts with filters
 */
router.get('/', (req, res) => {
  try {
    const {
      types,
      signals,
      companies,
      watchlistOnly,
      unreadOnly,
      minPriority,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = req.query;

    const filters = {
      alertTypes: types ? types.split(',') : null,
      signalTypes: signals ? signals.split(',') : null,
      companyIds: companies ? companies.split(',').map(Number) : null,
      watchlistOnly: watchlistOnly === 'true',
      unreadOnly: unreadOnly === 'true',
      minPriority: minPriority ? parseInt(minPriority) : 1,
      startDate: startDate || null,
      endDate: endDate || null,
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0
    };

    const alerts = alertService.getAlerts(filters);

    // Parse JSON data field
    const enrichedAlerts = alerts.map(alert => ({
      ...alert,
      data: alert.data ? JSON.parse(alert.data) : {},
      signalConfig: SIGNAL_CONFIG[alert.signal_type],
      typeConfig: ALERT_TYPE_CONFIG[alert.alert_type]
    }));

    res.json({
      success: true,
      data: enrichedAlerts,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        hasMore: alerts.length === filters.limit
      }
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/summary
 * Get alert summary counts
 */
router.get('/summary', (req, res) => {
  try {
    const summary = alertService.getAlertSummary();

    res.json({
      success: true,
      data: {
        ...summary,
        signalConfig: SIGNAL_CONFIG,
        typeConfig: ALERT_TYPE_CONFIG
      }
    });
  } catch (error) {
    console.error('Error fetching alert summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/dashboard
 * Get alerts for dashboard display
 */
router.get('/dashboard', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const alerts = alertService.getDashboardAlerts(limit);

    const enrichedAlerts = alerts.map(alert => ({
      ...alert,
      data: alert.data ? JSON.parse(alert.data) : {},
      signalConfig: SIGNAL_CONFIG[alert.signal_type],
      typeConfig: ALERT_TYPE_CONFIG[alert.alert_type]
    }));

    res.json({
      success: true,
      data: enrichedAlerts
    });
  } catch (error) {
    console.error('Error fetching dashboard alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/company/:id
 * Get alerts for a specific company
 */
router.get('/company/:id', (req, res) => {
  try {
    const companyId = parseInt(req.params.id);
    const { limit, includeRead, includeDismissed } = req.query;

    const options = {
      limit: Math.min(parseInt(limit) || 20, 100),
      includeRead: includeRead !== 'false',
      includeDismissed: includeDismissed === 'true'
    };

    const alerts = alertService.getCompanyAlerts(companyId, options);

    const enrichedAlerts = alerts.map(alert => ({
      ...alert,
      data: alert.data ? JSON.parse(alert.data) : {},
      signalConfig: SIGNAL_CONFIG[alert.signal_type],
      typeConfig: ALERT_TYPE_CONFIG[alert.alert_type]
    }));

    res.json({
      success: true,
      data: enrichedAlerts
    });
  } catch (error) {
    console.error('Error fetching company alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/clusters
 * Get alert clusters
 */
router.get('/clusters', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const clusters = alertService.getClusters(limit);

    const enrichedClusters = clusters.map(cluster => ({
      ...cluster,
      signalConfig: SIGNAL_CONFIG[cluster.signal_type]
    }));

    res.json({
      success: true,
      data: enrichedClusters
    });
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/:id/read
 * Mark alert as read
 */
router.post('/:id/read', (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    alertService.markAsRead(alertId);

    res.json({ success: true, message: 'Alert marked as read' });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/read-all
 * Mark all alerts as read
 */
router.post('/read-all', (req, res) => {
  try {
    const { companyId } = req.body;
    const filters = {};
    if (companyId) filters.companyId = parseInt(companyId);

    const result = alertService.markAllAsRead(filters);

    res.json({
      success: true,
      message: `Marked ${result.changes} alerts as read`
    });
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/:id/dismiss
 * Dismiss an alert
 */
router.post('/:id/dismiss', (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    alertService.dismissAlert(alertId);

    res.json({ success: true, message: 'Alert dismissed' });
  } catch (error) {
    console.error('Error dismissing alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/scan
 * Trigger a manual alert scan
 */
router.post('/scan', (req, res) => {
  try {
    const { companyIds, trigger = 'manual' } = req.body;

    const results = await alertService.runDetection(
      trigger,
      companyIds ? companyIds.map(Number) : null
    );

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error running alert scan:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/scan/daily
 * Trigger daily alert scan for all companies
 */
router.post('/scan/daily', (req, res) => {
  try {
    const results = await alertService.runDetection('daily_scan');

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error running daily scan:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/config
 * Get alert configuration (types, signals, etc.)
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        signalTypes: SIGNAL_CONFIG,
        alertTypes: ALERT_TYPE_CONFIG
      }
    });
  } catch (error) {
    console.error('Error fetching alert config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SMART ALERTS: AI Summary & Digest Endpoints
// ============================================

/**
 * GET /api/alerts/summary/ai
 * Get AI-generated "What Matters Today" summary
 */
router.get('/summary/ai', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const summary = await aiSummarizer.generateWhatMattersToday(userId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error generating AI summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/digest/preferences
 * Get user's digest preferences
 */
router.get('/digest/preferences', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const prefs = digestManager.getDigestPreferences(userId);

    res.json({
      success: true,
      data: {
        preferences: prefs,
        availableModes: DIGEST_MODES
      }
    });
  } catch (error) {
    console.error('Error fetching digest preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/alerts/digest/preferences
 * Update user's digest preferences
 */
router.put('/digest/preferences', (req, res) => {
  try {
    const userId = req.body.userId || 'default';
    const updates = req.body;
    delete updates.userId;

    const prefs = digestManager.updateDigestPreferences(userId, updates);

    res.json({
      success: true,
      data: prefs,
      message: 'Digest preferences updated'
    });
  } catch (error) {
    console.error('Error updating digest preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/digest/pending
 * Get pending digest items for a user
 */
router.get('/digest/pending', (req, res) => {
  try {
    const userId = req.query.userId || 'default';
    const digestType = req.query.type || null;
    const pending = digestManager.getPendingDigestItems(userId, digestType);

    res.json({
      success: true,
      data: {
        items: pending,
        count: pending.length
      }
    });
  } catch (error) {
    console.error('Error fetching pending digest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts/digest/generate
 * Generate and preview a digest (without sending)
 */
router.post('/digest/generate', (req, res) => {
  try {
    const userId = req.body.userId || 'default';
    const digest = await digestManager.generateDailyDigest(userId);

    if (!digest) {
      return res.json({
        success: true,
        data: null,
        message: 'No pending alerts for digest'
      });
    }

    // Optionally generate AI summary for the digest
    if (req.body.includeAISummary && digest.topAlerts.length > 0) {
      const aiResult = await aiSummarizer.summarize(digest.topAlerts);
      digest.aiSummary = aiResult.summary;
    }

    res.json({
      success: true,
      data: digest
    });
  } catch (error) {
    console.error('Error generating digest:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/actionability
 * Get alerts filtered/sorted by actionability
 */
router.get('/actionability', (req, res) => {
  try {
    const {
      minLevel = 'medium',
      limit = 50,
      offset = 0,
      sortBy = 'actionability'
    } = req.query;

    // Get recent alerts
    const alerts = alertService.getAlerts({
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0
    });

    // Enrich with actionability scores
    const enrichedAlerts = alerts.map(alert => {
      const enriched = actionabilityScorer.enrich({
        ...alert,
        data: alert.data ? JSON.parse(alert.data) : {}
      });
      enriched.signalConfig = SIGNAL_CONFIG[alert.signal_type];
      enriched.typeConfig = ALERT_TYPE_CONFIG[alert.alert_type];
      return enriched;
    });

    // Filter by actionability level
    const filtered = actionabilityScorer.filterByActionability(enrichedAlerts, minLevel);

    // Sort
    let sorted = filtered;
    if (sortBy === 'actionability') {
      sorted = actionabilityScorer.sortByActionability(filtered);
    } else if (sortBy === 'priority') {
      sorted = [...filtered].sort((a, b) => b.priority - a.priority);
    }

    res.json({
      success: true,
      data: sorted,
      meta: {
        totalFiltered: sorted.length,
        filterLevel: minLevel,
        sortedBy: sortBy
      }
    });
  } catch (error) {
    console.error('Error fetching actionable alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/market-context
 * Get current market regime and context
 */
router.get('/market-context', (req, res) => {
  try {
    const regime = getCurrentRegime(database);

    res.json({
      success: true,
      data: regime
    });
  } catch (error) {
    console.error('Error fetching market context:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/stats
 * Get alert volume statistics
 */
router.get('/stats', (req, res) => {
  try {
    const userId = req.query.userId || 'default';

    const now = new Date();
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const stats = database.prepare(`
      SELECT
        COUNT(CASE WHEN triggered_at > ? THEN 1 END) as alerts_24h,
        COUNT(CASE WHEN triggered_at > ? THEN 1 END) as alerts_7d,
        COUNT(CASE WHEN triggered_at > ? THEN 1 END) as alerts_30d,
        COUNT(CASE WHEN triggered_at > ? AND is_read = 0 THEN 1 END) as unread_7d,
        COUNT(CASE WHEN triggered_at > ? AND is_dismissed = 1 THEN 1 END) as dismissed_7d,
        COUNT(CASE WHEN triggered_at > ? AND priority >= 4 THEN 1 END) as high_priority_7d,
        COUNT(DISTINCT company_id) as unique_companies_7d
      FROM alerts
      WHERE triggered_at > ?
    `).get(dayAgo, weekAgo, monthAgo, weekAgo, weekAgo, weekAgo, monthAgo);

    const byType = database.prepare(`
      SELECT alert_type, COUNT(*) as count
      FROM alerts
      WHERE triggered_at > ?
      GROUP BY alert_type
      ORDER BY count DESC
    `).all(weekAgo);

    const bySignal = database.prepare(`
      SELECT signal_type, COUNT(*) as count
      FROM alerts
      WHERE triggered_at > ?
      GROUP BY signal_type
      ORDER BY count DESC
    `).all(weekAgo);

    res.json({
      success: true,
      data: {
        summary: stats,
        byType,
        bySignal,
        recommendations: getVolumeRecommendations(stats)
      }
    });
  } catch (error) {
    console.error('Error fetching alert stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper: Get recommendations based on alert volume
 */
function getVolumeRecommendations(stats) {
  const recommendations = [];

  if (stats.alerts_7d > 50) {
    recommendations.push({
      type: 'high_volume',
      message: 'You have high alert volume. Consider enabling watchlist-only mode.',
      action: 'enable_watchlist_only'
    });
  }

  if (stats.dismissed_7d / stats.alerts_7d > 0.5) {
    recommendations.push({
      type: 'high_dismiss_rate',
      message: 'You dismiss over 50% of alerts. Consider using digest mode.',
      action: 'enable_digest_mode'
    });
  }

  if (stats.unread_7d > 20) {
    recommendations.push({
      type: 'unread_buildup',
      message: `You have ${stats.unread_7d} unread alerts. Review or mark all as read.`,
      action: 'review_or_clear'
    });
  }

  return recommendations;
}

module.exports = router;
