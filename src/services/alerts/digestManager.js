// src/services/alerts/digestManager.js
// Manages configurable digest modes for intelligent alert delivery

/**
 * Digest Modes:
 * - realtime_critical: Only P5 critical alerts in real-time, everything else batched daily
 * - realtime_important: P4+ alerts in real-time, P1-P3 batched daily
 * - daily_digest: All alerts batched into a daily summary at configured time
 * - weekly_digest: P5 only in real-time, weekly summary for everything else
 */

const DIGEST_MODES = {
  realtime_critical: {
    name: 'Critical Only',
    description: 'Only critical alerts (P5) in real-time, others in daily digest',
    realtimeFilter: (alert) => alert.priority >= 5,
    digestFrequency: 'daily'
  },
  realtime_important: {
    name: 'Important Alerts',
    description: 'Important alerts (P4+) in real-time, low priority in daily digest',
    realtimeFilter: (alert) => alert.priority >= 4,
    digestFrequency: 'daily'
  },
  daily_digest: {
    name: 'Daily Digest Only',
    description: 'All alerts bundled into a daily summary',
    realtimeFilter: () => false, // Nothing real-time
    digestFrequency: 'daily'
  },
  weekly_digest: {
    name: 'Weekly Summary',
    description: 'Only critical alerts real-time, weekly summary for the rest',
    realtimeFilter: (alert) => alert.priority >= 5,
    digestFrequency: 'weekly'
  }
};

class DigestManager {
  constructor(db, notificationService = null) {
    this.db = db;
    this.notificationService = notificationService;
    this.modes = DIGEST_MODES;
  }

  /**
   * Get user's digest preferences
   */
  getDigestPreferences(userId = 'default') {
    const prefs = this.db.prepare(`
      SELECT * FROM user_digest_preferences WHERE user_id = ?
    `).get(userId);

    if (!prefs) {
      // Return defaults
      return {
        userId,
        digestMode: 'realtime_important',
        dailyDigestTime: '07:00',
        weeklyDigestDay: 'monday',
        weeklyDigestTime: '09:00',
        timezone: 'UTC',
        minPriorityRealtime: 4,
        watchlistOnly: true,
        portfolioOnly: false,
        includeAISummary: true,
        maxAlertsInSummary: 10
      };
    }

    return {
      userId: prefs.user_id,
      digestMode: prefs.digest_mode,
      dailyDigestTime: prefs.daily_digest_time,
      weeklyDigestDay: prefs.weekly_digest_day,
      weeklyDigestTime: prefs.weekly_digest_time,
      timezone: prefs.timezone,
      minPriorityRealtime: prefs.min_priority_realtime,
      watchlistOnly: prefs.watchlist_only === 1,
      portfolioOnly: prefs.portfolio_only === 1,
      includeAISummary: prefs.include_ai_summary === 1,
      maxAlertsInSummary: prefs.max_alerts_in_summary
    };
  }

  /**
   * Update user's digest preferences
   */
  updateDigestPreferences(userId, updates) {
    const current = this.getDigestPreferences(userId);
    const merged = { ...current, ...updates };

    this.db.prepare(`
      INSERT INTO user_digest_preferences (
        user_id, digest_mode, daily_digest_time, weekly_digest_day,
        weekly_digest_time, timezone, min_priority_realtime,
        watchlist_only, portfolio_only, include_ai_summary,
        max_alerts_in_summary, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        digest_mode = excluded.digest_mode,
        daily_digest_time = excluded.daily_digest_time,
        weekly_digest_day = excluded.weekly_digest_day,
        weekly_digest_time = excluded.weekly_digest_time,
        timezone = excluded.timezone,
        min_priority_realtime = excluded.min_priority_realtime,
        watchlist_only = excluded.watchlist_only,
        portfolio_only = excluded.portfolio_only,
        include_ai_summary = excluded.include_ai_summary,
        max_alerts_in_summary = excluded.max_alerts_in_summary,
        updated_at = datetime('now')
    `).run(
      userId,
      merged.digestMode,
      merged.dailyDigestTime,
      merged.weeklyDigestDay,
      merged.weeklyDigestTime,
      merged.timezone,
      merged.minPriorityRealtime,
      merged.watchlistOnly ? 1 : 0,
      merged.portfolioOnly ? 1 : 0,
      merged.includeAISummary ? 1 : 0,
      merged.maxAlertsInSummary
    );

    return this.getDigestPreferences(userId);
  }

  /**
   * Process an alert according to user's digest mode
   * Returns: { delivery: 'realtime' | 'queued', queuedFor: 'daily' | 'weekly' | null }
   */
  processAlert(alert, userId = 'default') {
    const prefs = this.getDigestPreferences(userId);
    const modeConfig = this.modes[prefs.digestMode] || this.modes.realtime_important;

    // Check if alert passes the real-time filter
    if (modeConfig.realtimeFilter(alert)) {
      return { delivery: 'realtime', queuedFor: null };
    }

    // Queue for digest
    this.queueForDigest(alert, userId, modeConfig.digestFrequency);

    return {
      delivery: 'queued',
      queuedFor: modeConfig.digestFrequency
    };
  }

  /**
   * Queue an alert for digest delivery
   */
  queueForDigest(alert, userId, digestType = 'daily') {
    try {
      // Check if digest_queue table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='digest_queue'
      `).get();

      if (!tableExists) {
        console.warn('[DigestManager] digest_queue table not found, skipping queue');
        return null;
      }

      const stmt = this.db.prepare(`
        INSERT INTO digest_queue (
          user_id, alert_id, notification_id, company_id, symbol,
          alert_code, alert_type, signal_type, priority,
          title, description, data, digest_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const result = stmt.run(
        userId,
        alert.id || null,
        alert.notification_id || null,
        alert.company_id,
        alert.symbol || null,
        alert.alert_code,
        alert.alert_type,
        alert.signal_type,
        alert.priority,
        alert.title,
        alert.description,
        JSON.stringify(alert.data || {}),
        digestType
      );

      return result.lastInsertRowid;
    } catch (err) {
      console.error('[DigestManager] Error queuing alert for digest:', err.message);
      return null;
    }
  }

  /**
   * Get pending digest items for a user
   */
  getPendingDigestItems(userId = 'default', digestType = null) {
    let sql = `
      SELECT * FROM digest_queue
      WHERE user_id = ? AND sent = 0
    `;
    const params = [userId];

    if (digestType) {
      sql += ' AND digest_type = ?';
      params.push(digestType);
    }

    sql += ' ORDER BY priority DESC, created_at ASC';

    try {
      return this.db.prepare(sql).all(...params);
    } catch (err) {
      console.warn('[DigestManager] Error getting pending digest items:', err.message);
      return [];
    }
  }

  /**
   * Generate a daily digest for a user
   */
  async generateDailyDigest(userId = 'default') {
    const prefs = this.getDigestPreferences(userId);
    const pending = this.getPendingDigestItems(userId, 'daily');

    if (pending.length === 0) {
      return null;
    }

    // Group by category/type
    const byType = this.groupBy(pending, 'alert_type');
    const byCompany = this.groupBy(pending, 'company_id');

    // Identify top priority items
    const topAlerts = pending
      .sort((a, b) => b.priority - a.priority)
      .slice(0, prefs.maxAlertsInSummary);

    // Generate headline
    const headline = this.generateHeadline(pending);

    // Identify action items (high actionability)
    const actionItems = pending.filter(a => {
      const data = typeof a.data === 'string' ? JSON.parse(a.data) : a.data;
      return data.actionabilityScore >= 0.7 || a.priority >= 4;
    });

    const digest = {
      userId,
      generatedAt: new Date().toISOString(),
      headline,
      summary: {
        totalAlerts: pending.length,
        byType: Object.fromEntries(
          Object.entries(byType).map(([k, v]) => [k, v.length])
        ),
        companiesAffected: Object.keys(byCompany).length,
        highPriorityCount: pending.filter(a => a.priority >= 4).length
      },
      topAlerts,
      actionItems,
      byCategory: byType,
      aiSummary: null // To be filled by aiSummarizer if enabled
    };

    return digest;
  }

  /**
   * Generate a headline for the digest
   */
  generateHeadline(alerts) {
    const buySignals = alerts.filter(a =>
      ['strong_bullish', 'bullish', 'strong_buy', 'buy'].includes(a.signal_type)
    );
    const warnings = alerts.filter(a => a.signal_type === 'warning');
    const highPriority = alerts.filter(a => a.priority >= 4);

    if (highPriority.length > 0) {
      if (buySignals.length > warnings.length) {
        return `${highPriority.length} important bullish signals detected`;
      } else if (warnings.length > 2) {
        return `${warnings.length} warnings require your attention`;
      } else {
        return `${highPriority.length} important alerts for your review`;
      }
    }

    return `${alerts.length} alerts since your last digest`;
  }

  /**
   * Mark digest items as sent
   */
  markDigestSent(userId, digestType = 'daily') {
    try {
      this.db.prepare(`
        UPDATE digest_queue
        SET sent = 1, sent_at = datetime('now')
        WHERE user_id = ? AND digest_type = ? AND sent = 0
      `).run(userId, digestType);
    } catch (err) {
      console.error('[DigestManager] Error marking digest as sent:', err.message);
    }
  }

  /**
   * Clean up old digest queue entries
   */
  cleanupOldEntries(daysToKeep = 30) {
    try {
      const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
      this.db.prepare(`
        DELETE FROM digest_queue WHERE created_at < ? AND sent = 1
      `).run(cutoff);
    } catch (err) {
      console.error('[DigestManager] Error cleaning up old entries:', err.message);
    }
  }

  /**
   * Get users who need their digest generated
   */
  getUsersNeedingDigest(digestType = 'daily') {
    const prefs = this.db.prepare(`
      SELECT user_id, daily_digest_time, weekly_digest_day, weekly_digest_time, timezone
      FROM user_digest_preferences
      WHERE digest_mode IN (?, 'realtime_critical', 'realtime_important')
    `).all(digestType === 'daily' ? 'daily_digest' : 'weekly_digest');

    // For now, return all users with pending items
    const usersWithPending = this.db.prepare(`
      SELECT DISTINCT user_id FROM digest_queue
      WHERE sent = 0 AND digest_type = ?
    `).all(digestType);

    return usersWithPending.map(u => u.user_id);
  }

  /**
   * Helper: Group array by key
   */
  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const k = typeof key === 'function' ? key(item) : item[key];
      if (k !== null && k !== undefined) {
        if (!groups[k]) groups[k] = [];
        groups[k].push(item);
      }
      return groups;
    }, {});
  }
}

module.exports = {
  DigestManager,
  DIGEST_MODES
};
