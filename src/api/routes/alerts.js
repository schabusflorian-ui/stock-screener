// src/api/routes/alerts.js
// API routes for alert system

const express = require('express');
const router = express.Router();
const db = require('../../database');
const AlertService = require('../../services/alerts');
const { SIGNAL_CONFIG, ALERT_TYPE_CONFIG } = require('../../services/alerts/alertDefinitions');

// Initialize alert service
const alertService = new AlertService(db.getDatabase());

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
router.post('/scan', async (req, res) => {
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
router.post('/scan/daily', async (req, res) => {
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

module.exports = router;
