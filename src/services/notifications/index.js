/**
 * Unified Notification Service
 *
 * Provides a single interface for all notification operations across the platform.
 * Consolidates company alerts, portfolio alerts, watchlist alerts, and new notification types.
 */

const { NOTIFICATION_TYPES, NOTIFICATION_CATEGORIES, SEVERITY_CONFIG, DEFAULT_CHANNELS } = require('./constants');

class NotificationService {
  constructor(db, options = {}) {
    this.db = db;
    this.options = {
      defaultUserId: 'default',
      maxNotificationsPerQuery: 200,
      clusterTimeWindowHours: 24,
      dedupeWindowHours: 24,
      ...options
    };

    // Lazy-loaded delivery services
    this._emailService = null;
  }

  // ============================================
  // NOTIFICATION CREATION
  // ============================================

  /**
   * Create a new notification
   */
  create(notification) {
    const {
      userId = this.options.defaultUserId,
      type,
      category,
      severity = 'info',
      priority = 3,
      title,
      body = null,
      data = {},
      actions = [],
      relatedEntities = [],
      channels = ['in_app'],
      groupKey = null,
      expiresAt = null,
      sourceType = 'new',
      sourceId = null
    } = notification;

    // Validate required fields
    if (!type || !category || !title) {
      throw new Error('Missing required fields: type, category, title');
    }

    // Check user preferences
    const shouldCreate = this._checkUserPreferences(userId, category, priority, channels);
    if (!shouldCreate.allowed) {
      return { created: false, reason: shouldCreate.reason };
    }

    // Check for duplicates
    if (groupKey) {
      const existing = this._findExistingNotification(userId, groupKey);
      if (existing) {
        // Update existing notification instead of creating new
        return this._updateExistingNotification(existing.id, notification);
      }
    }

    // Insert notification
    const stmt = this.db.prepare(`
      INSERT INTO notifications (
        user_id, type, category, severity, priority,
        title, body, data, actions, related_entities,
        channels, group_key, expires_at,
        source_type, source_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(
      userId,
      type,
      category,
      severity,
      priority,
      title,
      body,
      JSON.stringify(data),
      JSON.stringify(actions),
      JSON.stringify(relatedEntities),
      JSON.stringify(channels),
      groupKey,
      expiresAt,
      sourceType,
      sourceId
    );

    const notificationId = result.lastInsertRowid;

    // Queue delivery for non-in_app channels
    this._queueDelivery(notificationId, channels);

    return {
      created: true,
      id: notificationId,
      deliveryQueued: channels.filter(c => c !== 'in_app')
    };
  }

  /**
   * Create multiple notifications (batch)
   */
  createBatch(notifications) {
    const results = [];

    const transaction = this.db.transaction(() => {
      for (const notification of notifications) {
        try {
          const result = this.create(notification);
          results.push({ success: true, ...result });
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }
    });

    transaction();
    return results;
  }

  /**
   * Create notification from company alert (adapter for existing AlertService)
   */
  createFromCompanyAlert(alert, companyData) {
    const severity = alert.signal_type === 'warning' ? 'warning' :
                     alert.priority >= 4 ? 'warning' : 'info';

    return this.create({
      type: `company_${alert.alert_type}_${alert.alert_code}`,
      category: 'company',
      severity,
      priority: alert.priority,
      title: alert.title,
      body: alert.description,
      data: typeof alert.data === 'string' ? JSON.parse(alert.data) : alert.data,
      relatedEntities: [
        { type: 'company', id: alert.company_id, label: companyData?.symbol }
      ],
      actions: [
        { label: 'View Company', url: `/company/${companyData?.symbol}` }
      ],
      groupKey: `company_${alert.company_id}_${alert.alert_code}`,
      sourceType: 'company_alert',
      sourceId: alert.id
    });
  }

  /**
   * Create notification from portfolio alert (adapter for existing PortfolioAlertsService)
   */
  createFromPortfolioAlert(alert, portfolioData) {
    const priority = alert.severity === 'critical' ? 5 :
                     alert.severity === 'warning' ? 4 : 3;

    return this.create({
      type: `portfolio_${alert.alertType}`,
      category: 'portfolio',
      severity: alert.severity || 'info',
      priority,
      title: `Portfolio: ${alert.alertType.replace(/_/g, ' ')}`,
      body: alert.message,
      data: alert.data,
      relatedEntities: [
        { type: 'portfolio', id: alert.portfolioId, label: portfolioData?.name }
      ],
      actions: [
        { label: 'View Portfolio', url: `/portfolios/${alert.portfolioId}` }
      ],
      groupKey: `portfolio_${alert.portfolioId}_${alert.alertType}`,
      sourceType: 'portfolio_alert',
      sourceId: alert.id
    });
  }

  // ============================================
  // NOTIFICATION RETRIEVAL
  // ============================================

  /**
   * Get notifications with filters
   */
  getNotifications(filters = {}) {
    const {
      userId = this.options.defaultUserId,
      status = null,
      category = null,
      categories = null,
      severity = null,
      minPriority = null,
      maxPriority = null,
      portfolioId = null,
      companyId = null,
      symbol = null,
      includeExpired = false,
      includeDismissed = false,
      limit = 50,
      offset = 0
    } = filters;

    let sql = `
      SELECT n.*
      FROM notifications n
      WHERE n.user_id = ?
        AND n.deleted_at IS NULL
    `;
    const params = [userId];

    // Status filter
    if (status) {
      if (status === 'unread') {
        sql += ` AND n.status = 'unread'`;
      } else if (status === 'read') {
        sql += ` AND n.status IN ('read', 'actioned')`;
      } else {
        sql += ` AND n.status = ?`;
        params.push(status);
      }
    }

    // Don't include dismissed unless requested
    if (!includeDismissed) {
      sql += ` AND n.status != 'dismissed'`;
    }

    // Don't include snoozed that are still snoozed
    sql += ` AND (n.status != 'snoozed' OR n.snoozed_until <= datetime('now'))`;

    // Category filter
    if (category) {
      sql += ` AND n.category = ?`;
      params.push(category);
    } else if (categories && categories.length > 0) {
      sql += ` AND n.category IN (${categories.map(() => '?').join(',')})`;
      params.push(...categories);
    }

    // Severity filter
    if (severity) {
      sql += ` AND n.severity = ?`;
      params.push(severity);
    }

    // Priority filters
    if (minPriority) {
      sql += ` AND n.priority >= ?`;
      params.push(minPriority);
    }
    if (maxPriority) {
      sql += ` AND n.priority <= ?`;
      params.push(maxPriority);
    }

    // Portfolio filter (from related_entities JSON)
    if (portfolioId) {
      sql += ` AND n.related_entities LIKE ?`;
      params.push(`%"id":${portfolioId}%`);
    }

    // Company filter (from related_entities JSON)
    if (companyId) {
      sql += ` AND n.related_entities LIKE ?`;
      params.push(`%"id":${companyId}%`);
    }

    // Symbol filter (from related_entities JSON)
    if (symbol) {
      sql += ` AND n.related_entities LIKE ?`;
      params.push(`%"label":"${symbol}"%`);
    }

    // Expired filter
    if (!includeExpired) {
      sql += ` AND (n.expires_at IS NULL OR n.expires_at > datetime('now'))`;
    }

    // Order and limit
    sql += ` ORDER BY n.priority DESC, n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Math.min(limit, this.options.maxNotificationsPerQuery), offset);

    const notifications = this.db.prepare(sql).all(...params);

    // Parse JSON fields
    return notifications.map(n => this._parseNotification(n));
  }

  /**
   * Get a single notification by ID
   */
  getNotification(id) {
    const notification = this.db.prepare(`
      SELECT * FROM notifications WHERE id = ? AND deleted_at IS NULL
    `).get(id);

    return notification ? this._parseNotification(notification) : null;
  }

  /**
   * Get notification summary for header badge
   */
  getSummary(userId = this.options.defaultUserId) {
    const summary = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) as unread,
        SUM(CASE WHEN status = 'unread' AND severity = 'critical' THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN status = 'unread' AND severity = 'warning' THEN 1 ELSE 0 END) as warnings,
        SUM(CASE WHEN status = 'unread' AND priority >= 4 THEN 1 ELSE 0 END) as high_priority
      FROM notifications
      WHERE user_id = ?
        AND deleted_at IS NULL
        AND status NOT IN ('dismissed')
        AND (expires_at IS NULL OR expires_at > datetime('now'))
    `).get(userId);

    // Get counts by category
    const byCategory = this.db.prepare(`
      SELECT
        category,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) as unread
      FROM notifications
      WHERE user_id = ?
        AND deleted_at IS NULL
        AND status NOT IN ('dismissed')
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      GROUP BY category
    `).all(userId);

    return {
      ...summary,
      byCategory: byCategory.reduce((acc, row) => {
        acc[row.category] = { total: row.total, unread: row.unread };
        return acc;
      }, {})
    };
  }

  /**
   * Get dashboard notifications (top priority, unread)
   */
  getDashboard(userId = this.options.defaultUserId, limit = 10) {
    return this.getNotifications({
      userId,
      status: 'unread',
      minPriority: 2,
      limit
    });
  }

  // ============================================
  // NOTIFICATION UPDATES
  // ============================================

  /**
   * Mark notification as read
   */
  markAsRead(id, userId = null) {
    const stmt = this.db.prepare(`
      UPDATE notifications
      SET status = 'read', read_at = datetime('now')
      WHERE id = ?
        AND status = 'unread'
        ${userId ? 'AND user_id = ?' : ''}
    `);

    const result = userId ? stmt.run(id, userId) : stmt.run(id);

    // Log interaction
    this._logInteraction(id, userId, 'view');

    return { updated: result.changes > 0 };
  }

  /**
   * Mark notification as actioned
   */
  markAsActioned(id, actionId = null, userId = null) {
    const stmt = this.db.prepare(`
      UPDATE notifications
      SET status = 'actioned', actioned_at = datetime('now')
      WHERE id = ?
        ${userId ? 'AND user_id = ?' : ''}
    `);

    const result = userId ? stmt.run(id, userId) : stmt.run(id);

    // Log interaction
    this._logInteraction(id, userId, 'action', { actionId });

    return { updated: result.changes > 0 };
  }

  /**
   * Dismiss notification
   */
  dismiss(id, userId = null) {
    const stmt = this.db.prepare(`
      UPDATE notifications
      SET status = 'dismissed', dismissed_at = datetime('now')
      WHERE id = ?
        ${userId ? 'AND user_id = ?' : ''}
    `);

    const result = userId ? stmt.run(id, userId) : stmt.run(id);

    // Log interaction
    this._logInteraction(id, userId, 'dismiss');

    return { updated: result.changes > 0 };
  }

  /**
   * Snooze notification
   */
  snooze(id, until, userId = null) {
    // Parse relative times
    let snoozedUntil;
    if (typeof until === 'string') {
      const now = new Date();
      switch (until) {
        case '1h':
          snoozedUntil = new Date(now.getTime() + 60 * 60 * 1000);
          break;
        case '4h':
          snoozedUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000);
          break;
        case '1d':
          snoozedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          break;
        case '1w':
          snoozedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        default:
          snoozedUntil = new Date(until);
      }
    } else {
      snoozedUntil = until;
    }

    const stmt = this.db.prepare(`
      UPDATE notifications
      SET status = 'snoozed', snoozed_until = ?
      WHERE id = ?
        ${userId ? 'AND user_id = ?' : ''}
    `);

    const params = [snoozedUntil.toISOString(), id];
    if (userId) params.push(userId);

    const result = stmt.run(...params);

    // Log interaction
    this._logInteraction(id, userId, 'snooze', { until: snoozedUntil.toISOString() });

    return { updated: result.changes > 0, snoozedUntil };
  }

  /**
   * Bulk mark as read
   */
  bulkMarkAsRead(filters = {}) {
    const { userId = this.options.defaultUserId, ids = null, category = null, minPriority = null } = filters;

    let sql = `
      UPDATE notifications
      SET status = 'read', read_at = datetime('now')
      WHERE user_id = ?
        AND status = 'unread'
    `;
    const params = [userId];

    if (ids && ids.length > 0) {
      sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (minPriority) {
      sql += ` AND priority >= ?`;
      params.push(minPriority);
    }

    const result = this.db.prepare(sql).run(...params);
    return { updated: result.changes };
  }

  /**
   * Bulk dismiss
   */
  bulkDismiss(filters = {}) {
    const { userId = this.options.defaultUserId, ids = null, category = null, olderThan = null } = filters;

    let sql = `
      UPDATE notifications
      SET status = 'dismissed', dismissed_at = datetime('now')
      WHERE user_id = ?
        AND status NOT IN ('dismissed')
    `;
    const params = [userId];

    if (ids && ids.length > 0) {
      sql += ` AND id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (olderThan) {
      sql += ` AND created_at < datetime('now', '-' || ? || ' days')`;
      params.push(olderThan);
    }

    const result = this.db.prepare(sql).run(...params);
    return { updated: result.changes };
  }

  // ============================================
  // USER PREFERENCES
  // ============================================

  /**
   * Get user notification preferences
   */
  getPreferences(userId = this.options.defaultUserId) {
    let prefs = this.db.prepare(`
      SELECT * FROM user_notification_preferences WHERE user_id = ?
    `).get(userId);

    if (!prefs) {
      // Return defaults
      prefs = this.db.prepare(`
        SELECT * FROM user_notification_preferences WHERE user_id = 'default'
      `).get();

      if (!prefs) {
        prefs = this._getDefaultPreferences();
      }
    }

    return {
      userId: prefs.user_id,
      enabled: prefs.enabled === 1,
      mutedUntil: prefs.muted_until,
      quietHours: prefs.quiet_hours_start ? {
        start: prefs.quiet_hours_start,
        end: prefs.quiet_hours_end
      } : null,
      channels: JSON.parse(prefs.channel_preferences || '{}'),
      categories: JSON.parse(prefs.category_preferences || '{}'),
      digest: {
        enabled: prefs.digest_enabled === 1,
        frequency: prefs.digest_frequency,
        time: prefs.digest_time,
        dayOfWeek: prefs.digest_day_of_week
      },
      watchlistOnly: prefs.watchlist_only === 1,
      portfolioOnly: prefs.portfolio_only === 1,
      customRules: JSON.parse(prefs.custom_rules || '[]')
    };
  }

  /**
   * Update user notification preferences
   */
  updatePreferences(userId, updates) {
    // Check if user has preferences
    const existing = this.db.prepare(`
      SELECT id FROM user_notification_preferences WHERE user_id = ?
    `).get(userId);

    if (!existing) {
      // Create new preferences
      this.db.prepare(`
        INSERT INTO user_notification_preferences (user_id) VALUES (?)
      `).run(userId);
    }

    // Build update query
    const fields = [];
    const params = [];

    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      params.push(updates.enabled ? 1 : 0);
    }

    if (updates.mutedUntil !== undefined) {
      fields.push('muted_until = ?');
      params.push(updates.mutedUntil);
    }

    if (updates.quietHours !== undefined) {
      fields.push('quiet_hours_start = ?', 'quiet_hours_end = ?');
      params.push(updates.quietHours?.start || null, updates.quietHours?.end || null);
    }

    if (updates.channels !== undefined) {
      fields.push('channel_preferences = ?');
      params.push(JSON.stringify(updates.channels));
    }

    if (updates.categories !== undefined) {
      fields.push('category_preferences = ?');
      params.push(JSON.stringify(updates.categories));
    }

    if (updates.digest !== undefined) {
      fields.push('digest_enabled = ?', 'digest_frequency = ?', 'digest_time = ?', 'digest_day_of_week = ?');
      params.push(
        updates.digest.enabled ? 1 : 0,
        updates.digest.frequency || 'daily',
        updates.digest.time || '09:00',
        updates.digest.dayOfWeek || null
      );
    }

    if (updates.watchlistOnly !== undefined) {
      fields.push('watchlist_only = ?');
      params.push(updates.watchlistOnly ? 1 : 0);
    }

    if (updates.portfolioOnly !== undefined) {
      fields.push('portfolio_only = ?');
      params.push(updates.portfolioOnly ? 1 : 0);
    }

    if (updates.customRules !== undefined) {
      fields.push('custom_rules = ?');
      params.push(JSON.stringify(updates.customRules));
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime(\'now\')');
      params.push(userId);

      this.db.prepare(`
        UPDATE user_notification_preferences
        SET ${fields.join(', ')}
        WHERE user_id = ?
      `).run(...params);
    }

    return this.getPreferences(userId);
  }

  // ============================================
  // CLUSTERING
  // ============================================

  /**
   * Get notification clusters
   */
  getClusters(userId = this.options.defaultUserId, limit = 20) {
    const clusters = this.db.prepare(`
      SELECT nc.*,
        (SELECT COUNT(*) FROM notifications n WHERE n.cluster_id = nc.id) as actual_count
      FROM notification_clusters nc
      WHERE nc.user_id = ?
        AND nc.status = 'active'
      ORDER BY nc.highest_priority DESC, nc.created_at DESC
      LIMIT ?
    `).all(userId, limit);

    return clusters.map(c => ({
      ...c,
      relatedCompanies: c.related_companies ? JSON.parse(c.related_companies) : [],
      relatedPortfolios: c.related_portfolios ? JSON.parse(c.related_portfolios) : []
    }));
  }

  /**
   * Create or update a cluster
   */
  createCluster(cluster) {
    const {
      userId = this.options.defaultUserId,
      clusterType,
      title,
      summary = null,
      notificationIds = [],
      relatedCompanies = [],
      relatedPortfolios = []
    } = cluster;

    // Get highest priority from notifications
    let highestPriority = 3;
    if (notificationIds.length > 0) {
      const priorities = this.db.prepare(`
        SELECT MAX(priority) as max_priority FROM notifications WHERE id IN (${notificationIds.map(() => '?').join(',')})
      `).get(...notificationIds);
      highestPriority = priorities.max_priority || 3;
    }

    // Insert cluster
    const result = this.db.prepare(`
      INSERT INTO notification_clusters (
        user_id, cluster_type, title, summary,
        notification_count, highest_priority,
        related_companies, related_portfolios
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      clusterType,
      title,
      summary,
      notificationIds.length,
      highestPriority,
      JSON.stringify(relatedCompanies),
      JSON.stringify(relatedPortfolios)
    );

    const clusterId = result.lastInsertRowid;

    // Update notifications with cluster ID
    if (notificationIds.length > 0) {
      this.db.prepare(`
        UPDATE notifications SET cluster_id = ? WHERE id IN (${notificationIds.map(() => '?').join(',')})
      `).run(clusterId, ...notificationIds);
    }

    return { id: clusterId, notificationCount: notificationIds.length };
  }

  // ============================================
  // CLEANUP & MAINTENANCE
  // ============================================

  /**
   * Clean up old notifications
   */
  cleanup(options = {}) {
    const { daysOld = 30, keepDismissed = 7 } = options;

    // Soft delete old dismissed notifications
    const dismissed = this.db.prepare(`
      UPDATE notifications
      SET deleted_at = datetime('now')
      WHERE status = 'dismissed'
        AND dismissed_at < datetime('now', '-' || ? || ' days')
        AND deleted_at IS NULL
    `).run(keepDismissed);

    // Soft delete old read notifications
    const old = this.db.prepare(`
      UPDATE notifications
      SET deleted_at = datetime('now')
      WHERE status IN ('read', 'actioned')
        AND read_at < datetime('now', '-' || ? || ' days')
        AND deleted_at IS NULL
    `).run(daysOld);

    // Hard delete very old notifications
    const hardDelete = this.db.prepare(`
      DELETE FROM notifications
      WHERE deleted_at < datetime('now', '-' || ? || ' days')
    `).run(daysOld * 2);

    return {
      dismissedDeleted: dismissed.changes,
      oldDeleted: old.changes,
      hardDeleted: hardDelete.changes
    };
  }

  /**
   * Unsnooze notifications whose snooze time has passed
   */
  processSnoozed() {
    const result = this.db.prepare(`
      UPDATE notifications
      SET status = 'unread', snoozed_until = NULL
      WHERE status = 'snoozed'
        AND snoozed_until <= datetime('now')
    `).run();

    return { unsnoozed: result.changes };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  _parseNotification(n) {
    return {
      id: n.id,
      userId: n.user_id,
      type: n.type,
      category: n.category,
      severity: n.severity,
      priority: n.priority,
      title: n.title,
      body: n.body,
      data: n.data ? JSON.parse(n.data) : {},
      actions: n.actions ? JSON.parse(n.actions) : [],
      relatedEntities: n.related_entities ? JSON.parse(n.related_entities) : [],
      channels: n.channels ? JSON.parse(n.channels) : ['in_app'],
      status: n.status,
      readAt: n.read_at,
      actionedAt: n.actioned_at,
      dismissedAt: n.dismissed_at,
      snoozedUntil: n.snoozed_until,
      groupKey: n.group_key,
      clusterId: n.cluster_id,
      sourceType: n.source_type,
      sourceId: n.source_id,
      createdAt: n.created_at,
      expiresAt: n.expires_at
    };
  }

  _checkUserPreferences(userId, category, priority, channels) {
    const prefs = this.getPreferences(userId);

    if (!prefs.enabled) {
      return { allowed: false, reason: 'Notifications disabled' };
    }

    // Check mute
    if (prefs.mutedUntil && new Date(prefs.mutedUntil) > new Date()) {
      return { allowed: false, reason: 'Notifications muted' };
    }

    // Check quiet hours
    if (prefs.quietHours) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      if (prefs.quietHours.start <= currentTime || currentTime <= prefs.quietHours.end) {
        // During quiet hours, only allow critical notifications
        if (priority < 5) {
          return { allowed: false, reason: 'Quiet hours active' };
        }
      }
    }

    // Check category preferences
    const categoryPref = prefs.categories?.[category];
    if (categoryPref && !categoryPref.enabled) {
      return { allowed: false, reason: `Category ${category} disabled` };
    }
    if (categoryPref && categoryPref.minPriority && priority < categoryPref.minPriority) {
      return { allowed: false, reason: `Priority ${priority} below minimum ${categoryPref.minPriority}` };
    }

    return { allowed: true };
  }

  _findExistingNotification(userId, groupKey) {
    const windowMs = this.options.dedupeWindowHours * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - windowMs).toISOString();

    return this.db.prepare(`
      SELECT id FROM notifications
      WHERE user_id = ?
        AND group_key = ?
        AND created_at > ?
        AND status NOT IN ('dismissed')
      LIMIT 1
    `).get(userId, groupKey, cutoff);
  }

  _updateExistingNotification(id, notification) {
    // Update the notification instead of creating a duplicate
    this.db.prepare(`
      UPDATE notifications
      SET
        title = ?,
        body = ?,
        data = ?,
        priority = MAX(priority, ?),
        status = CASE WHEN status = 'read' THEN 'unread' ELSE status END,
        created_at = datetime('now')
      WHERE id = ?
    `).run(
      notification.title,
      notification.body,
      JSON.stringify(notification.data || {}),
      notification.priority,
      id
    );

    return { created: false, updated: true, id };
  }

  _queueDelivery(notificationId, channels) {
    const nonInAppChannels = channels.filter(c => c !== 'in_app');

    for (const channel of nonInAppChannels) {
      this.db.prepare(`
        INSERT INTO notification_delivery_log (notification_id, channel, status)
        VALUES (?, ?, 'pending')
      `).run(notificationId, channel);
    }
  }

  _logInteraction(notificationId, userId, interactionType, details = {}) {
    try {
      this.db.prepare(`
        INSERT INTO notification_interactions (notification_id, user_id, interaction_type, action_id, source)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        notificationId,
        userId,
        interactionType,
        details.actionId || null,
        details.source || null
      );
    } catch (err) {
      // Don't fail if interaction logging fails
      console.error('Error logging notification interaction:', err.message);
    }
  }

  _getDefaultPreferences() {
    return {
      user_id: 'default',
      enabled: 1,
      muted_until: null,
      quiet_hours_start: null,
      quiet_hours_end: null,
      channel_preferences: JSON.stringify({
        in_app: { enabled: true },
        email: { enabled: false, minPriority: 3 },
        push: { enabled: false, minPriority: 2 }
      }),
      category_preferences: JSON.stringify({
        company: { enabled: true, minPriority: 1 },
        portfolio: { enabled: true, minPriority: 1 },
        watchlist: { enabled: true, minPriority: 1 },
        sentiment: { enabled: true, minPriority: 2 },
        ai: { enabled: true, minPriority: 2 },
        system: { enabled: true, minPriority: 1 },
        correlation: { enabled: true, minPriority: 1 }
      }),
      digest_enabled: 0,
      digest_frequency: 'daily',
      digest_time: '09:00',
      digest_day_of_week: null,
      watchlist_only: 0,
      portfolio_only: 0,
      custom_rules: '[]'
    };
  }
}

// Export everything from the notifications module
const { EmailDeliveryService, getEmailDeliveryService } = require('./emailDelivery');
const CorrelationEngine = require('./correlationEngine');
const constants = require('./constants');

module.exports = {
  NotificationService,
  EmailDeliveryService,
  getEmailDeliveryService,
  CorrelationEngine,
  ...constants
};
