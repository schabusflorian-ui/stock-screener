/**
 * Unified Notifications API Routes
 *
 * Provides a single API for all notification operations.
 * Consolidates company alerts, portfolio alerts, watchlist alerts, etc.
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { NotificationService } = require('../../services/notifications');
const { CATEGORY_CONFIG, SEVERITY_CONFIG, SNOOZE_OPTIONS } = require('../../services/notifications/constants');

// Initialize notification service
let notificationService = null;

const getNotificationService = () => {
  if (!notificationService) {
    notificationService = new NotificationService(db.getDatabase());
  }
  return notificationService;
};

// Helper to get user ID from request (extend with auth later)
const getUserId = (req) => {
  return req.headers['x-user-id'] || req.query.userId || 'default';
};

// ============================================
// GET NOTIFICATIONS
// ============================================

/**
 * GET /api/notifications
 * Get all notifications with filters
 */
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      status,
      category,
      categories,
      severity,
      minPriority,
      maxPriority,
      portfolioId,
      companyId,
      symbol,
      includeExpired,
      includeDismissed,
      limit = 50,
      offset = 0
    } = req.query;

    const filters = {
      userId,
      status: status || null,
      category: category || null,
      categories: categories ? categories.split(',') : null,
      severity: severity || null,
      minPriority: minPriority ? parseInt(minPriority) : null,
      maxPriority: maxPriority ? parseInt(maxPriority) : null,
      portfolioId: portfolioId ? parseInt(portfolioId) : null,
      companyId: companyId ? parseInt(companyId) : null,
      symbol: symbol || null,
      includeExpired: includeExpired === 'true',
      includeDismissed: includeDismissed === 'true',
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0
    };

    const notifications = getNotificationService().getNotifications(filters);
    const summary = getNotificationService().getSummary(userId);

    res.json({
      success: true,
      data: notifications,
      summary,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        hasMore: notifications.length === filters.limit
      },
      config: {
        categories: CATEGORY_CONFIG,
        severities: SEVERITY_CONFIG,
        snoozeOptions: SNOOZE_OPTIONS
      }
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/summary
 * Get notification summary for header badge
 */
router.get('/summary', (req, res) => {
  try {
    const userId = getUserId(req);
    const summary = getNotificationService().getSummary(userId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching notification summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/dashboard
 * Get dashboard notifications (top priority, unread)
 */
router.get('/dashboard', (req, res) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const notifications = getNotificationService().getDashboard(userId, limit);

    res.json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error('Error fetching dashboard notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/:id
 * Get a single notification
 */
router.get('/:id', (req, res) => {
  try {
    const notification = getNotificationService().getNotification(parseInt(req.params.id));

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.json({
      success: true,
      data: notification
    });
  } catch (error) {
    console.error('Error fetching notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/clusters
 * Get notification clusters
 */
router.get('/groups/clusters', (req, res) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const clusters = getNotificationService().getClusters(userId, limit);

    res.json({
      success: true,
      data: clusters
    });
  } catch (error) {
    console.error('Error fetching clusters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// UPDATE NOTIFICATIONS
// ============================================

/**
 * POST /api/notifications/:id/read
 * Mark notification as read
 */
router.post('/:id/read', (req, res) => {
  try {
    const userId = getUserId(req);
    const result = getNotificationService().markAsRead(parseInt(req.params.id), userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/:id/action
 * Mark notification as actioned
 */
router.post('/:id/action', (req, res) => {
  try {
    const userId = getUserId(req);
    const { actionId } = req.body;
    const result = getNotificationService().markAsActioned(parseInt(req.params.id), actionId, userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error marking notification as actioned:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/:id/dismiss
 * Dismiss notification
 */
router.post('/:id/dismiss', (req, res) => {
  try {
    const userId = getUserId(req);
    const result = getNotificationService().dismiss(parseInt(req.params.id), userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/:id/snooze
 * Snooze notification
 */
router.post('/:id/snooze', (req, res) => {
  try {
    const userId = getUserId(req);
    const { until } = req.body;

    if (!until) {
      return res.status(400).json({ success: false, error: 'Missing required field: until' });
    }

    const result = getNotificationService().snooze(parseInt(req.params.id), until, userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error snoozing notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * POST /api/notifications/bulk-read
 * Mark multiple notifications as read
 */
router.post('/bulk-read', (req, res) => {
  try {
    const userId = getUserId(req);
    const { ids, category, minPriority } = req.body;

    const result = getNotificationService().bulkMarkAsRead({
      userId,
      ids: ids || null,
      category: category || null,
      minPriority: minPriority ? parseInt(minPriority) : null
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error bulk marking notifications as read:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/bulk-dismiss
 * Dismiss multiple notifications
 */
router.post('/bulk-dismiss', (req, res) => {
  try {
    const userId = getUserId(req);
    const { ids, category, olderThan } = req.body;

    const result = getNotificationService().bulkDismiss({
      userId,
      ids: ids || null,
      category: category || null,
      olderThan: olderThan || null
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error bulk dismissing notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PREFERENCES
// ============================================

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get('/user/preferences', (req, res) => {
  try {
    const userId = getUserId(req);
    const preferences = getNotificationService().getPreferences(userId);

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update user notification preferences
 */
router.put('/user/preferences', (req, res) => {
  try {
    const userId = getUserId(req);
    const updates = req.body;

    const preferences = getNotificationService().updatePreferences(userId, updates);

    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CREATE NOTIFICATIONS (Internal use)
// ============================================

/**
 * POST /api/notifications
 * Create a new notification (for internal services)
 */
router.post('/', (req, res) => {
  try {
    const notification = req.body;

    // Validate required fields
    if (!notification.type || !notification.category || !notification.title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, category, title'
      });
    }

    const result = getNotificationService().create(notification);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/batch
 * Create multiple notifications
 */
router.post('/batch', (req, res) => {
  try {
    const { notifications } = req.body;

    if (!Array.isArray(notifications)) {
      return res.status(400).json({
        success: false,
        error: 'notifications must be an array'
      });
    }

    const results = getNotificationService().createBatch(notifications);

    res.json({
      success: true,
      data: results,
      summary: {
        total: results.length,
        created: results.filter(r => r.success && r.created).length,
        updated: results.filter(r => r.success && r.updated).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    console.error('Error creating notifications batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// MAINTENANCE
// ============================================

/**
 * POST /api/notifications/cleanup
 * Clean up old notifications
 */
router.post('/maintenance/cleanup', (req, res) => {
  try {
    const { daysOld = 30, keepDismissed = 7 } = req.body;

    const result = getNotificationService().cleanup({
      daysOld: parseInt(daysOld),
      keepDismissed: parseInt(keepDismissed)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/notifications/process-snoozed
 * Process snoozed notifications that should be unsnoozed
 */
router.post('/maintenance/process-snoozed', (req, res) => {
  try {
    const result = getNotificationService().processSnoozed();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error processing snoozed notifications:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/notifications/config
 * Get notification system configuration
 */
router.get('/system/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        categories: CATEGORY_CONFIG,
        severities: SEVERITY_CONFIG,
        snoozeOptions: SNOOZE_OPTIONS
      }
    });
  } catch (error) {
    console.error('Error fetching notification config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
