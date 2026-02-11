// src/services/alerts/digestManager.js
// Manages configurable digest modes for intelligent alert delivery

const { getDatabaseAsync } = require('../../lib/db');

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
  constructor(notificationService = null) {
    this.notificationService = notificationService;
    this.modes = DIGEST_MODES;
  }

  /**
   * Get user's digest preferences
   */
  async getDigestPreferences(userId = 'default') {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM user_digest_preferences WHERE user_id = $1
    `, [userId]);

    const prefs = result.rows[0];

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
      watchlistOnly: prefs.watchlist_only === true,
      portfolioOnly: prefs.portfolio_only === true,
      includeAISummary: prefs.include_ai_summary === true,
      maxAlertsInSummary: prefs.max_alerts_in_summary
    };
  }

  /**
   * Update user's digest preferences
   */
  async updateDigestPreferences(userId, updates) {
    const current = await this.getDigestPreferences(userId);
    const merged = { ...current, ...updates };

    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO user_digest_preferences (
        user_id, digest_mode, daily_digest_time, weekly_digest_day,
        weekly_digest_time, timezone, min_priority_realtime,
        watchlist_only, portfolio_only, include_ai_summary,
        max_alerts_in_summary, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
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
        updated_at = CURRENT_TIMESTAMP
    `, [
      userId,
      merged.digestMode,
      merged.dailyDigestTime,
      merged.weeklyDigestDay,
      merged.weeklyDigestTime,
      merged.timezone,
      merged.minPriorityRealtime,
      merged.watchlistOnly,
      merged.portfolioOnly,
      merged.includeAISummary,
      merged.maxAlertsInSummary
    ]);

    return this.getDigestPreferences(userId);
  }

  /**
   * Process an alert according to user's digest mode
   * Returns: { delivery: 'realtime' | 'queued', queuedFor: 'daily' | 'weekly' | null }
   */
  async processAlert(alert, userId = 'default') {
    const prefs = await this.getDigestPreferences(userId);
    const modeConfig = this.modes[prefs.digestMode] || this.modes.realtime_important;

    // Check if alert passes the real-time filter
    if (modeConfig.realtimeFilter(alert)) {
      return { delivery: 'realtime', queuedFor: null };
    }

    // Queue for digest
    await this.queueForDigest(alert, userId, modeConfig.digestFrequency);

    return {
      delivery: 'queued',
      queuedFor: modeConfig.digestFrequency
    };
  }

  /**
   * Queue an alert for digest delivery
   */
  async queueForDigest(alert, userId, digestType = 'daily') {
    try {
      const database = await getDatabaseAsync();

      // Check if digest_queue table exists
      const tableResult = await database.query(`
        SELECT EXISTS(
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'digest_queue'
        ) AS exists
      `);

      if (!tableResult.rows[0].exists) {
        console.warn('[DigestManager] digest_queue table not found, skipping queue');
        return null;
      }

      const result = await database.query(`
        INSERT INTO digest_queue (
          user_id, alert_id, notification_id, company_id, symbol,
          alert_code, alert_type, signal_type, priority,
          title, description, data, digest_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
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
      ]);

      return result.rows[0]?.id || null;
    } catch (err) {
      console.error('[DigestManager] Error queuing alert for digest:', err.message);
      return null;
    }
  }

  /**
   * Get pending digest items for a user
   */
  async getPendingDigestItems(userId = 'default', digestType = null) {
    let sql = `
      SELECT * FROM digest_queue
      WHERE user_id = $1 AND sent = false
    `;
    const params = [userId];
    let paramIndex = 2;

    if (digestType) {
      sql += ` AND digest_type = $${paramIndex}`;
      params.push(digestType);
      paramIndex++;
    }

    sql += ' ORDER BY priority DESC, created_at ASC';

    try {
      const database = await getDatabaseAsync();
      const result = await database.query(sql, params);
      return result.rows;
    } catch (err) {
      console.warn('[DigestManager] Error getting pending digest items:', err.message);
      return [];
    }
  }

  /**
   * Generate a daily digest for a user
   */
  async generateDailyDigest(userId = 'default') {
    const prefs = await this.getDigestPreferences(userId);
    const pending = await this.getPendingDigestItems(userId, 'daily');

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
  async markDigestSent(userId, digestType = 'daily') {
    try {
      const database = await getDatabaseAsync();
      await database.query(`
        UPDATE digest_queue
        SET sent = true, sent_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND digest_type = $2 AND sent = false
      `, [userId, digestType]);
    } catch (err) {
      console.error('[DigestManager] Error marking digest as sent:', err.message);
    }
  }

  /**
   * Clean up old digest queue entries
   */
  async cleanupOldEntries(daysToKeep = 30) {
    try {
      const database = await getDatabaseAsync();
      await database.query(`
        DELETE FROM digest_queue
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'
        AND sent = true
      `);
    } catch (err) {
      console.error('[DigestManager] Error cleaning up old entries:', err.message);
    }
  }

  /**
   * Get users who need their digest generated
   */
  async getUsersNeedingDigest(digestType = 'daily') {
    const database = await getDatabaseAsync();
    const prefResult = await database.query(`
      SELECT user_id, daily_digest_time, weekly_digest_day, weekly_digest_time, timezone
      FROM user_digest_preferences
      WHERE digest_mode IN ($1, 'realtime_critical', 'realtime_important')
    `, [digestType === 'daily' ? 'daily_digest' : 'weekly_digest']);

    // For now, return all users with pending items
    const usersWithPending = await database.query(`
      SELECT DISTINCT user_id FROM digest_queue
      WHERE sent = false AND digest_type = $1
    `, [digestType]);

    return usersWithPending.rows.map(u => u.user_id);
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
