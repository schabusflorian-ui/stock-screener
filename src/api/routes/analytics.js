/**
 * Analytics API Routes
 *
 * Privacy-respecting analytics tracking and admin dashboard endpoints.
 */

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');

// Middleware imports
const { optionalAuth, requireAdmin, attachUserId } = require('../../middleware/auth');

/**
 * POST /api/analytics/track
 * Track a single analytics event
 */
router.post('/track', optionalAuth, attachUserId, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const {
      event,
      category,
      properties = {},
      sessionId,
      page,
      referrer,
      device,
      browser,
      sessionDuration
    } = req.body;

    // Validate required fields
    if (!event || !category || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: event, category, sessionId'
      });
    }

    // Check if user has opted out of analytics
    if (req.userId) {
      const prefsResult = await db.query(`
        SELECT analytics_opted_in FROM user_preferences WHERE user_id = $1
      `, [req.userId]);
      const prefs = prefsResult.rows?.[0];

      if (prefs && prefs.analytics_opted_in === 0) {
        // User opted out, don't track but return success
        return res.json({ success: true, tracked: false });
      }
    }

    // Insert event
    await db.query(`
      INSERT INTO analytics_events (
        session_id, user_id, event_name, event_category,
        properties, page, referrer, device, browser, session_duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      sessionId,
      req.userId || null,
      event,
      category,
      JSON.stringify(properties),
      page || null,
      referrer || null,
      device || null,
      browser || null,
      sessionDuration || null
    ]);

    res.json({ success: true, tracked: true });
  } catch (error) {
    console.error('Error tracking event:', error);
    res.status(500).json({ success: false, error: 'Failed to track event' });
  }
});

/**
 * POST /api/analytics/track/batch
 * Track multiple analytics events at once
 */
router.post('/track/batch', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Events must be a non-empty array'
      });
    }

    // Check if user has opted out
    if (req.userId) {
      const prefsResult = await database.query(`
        SELECT analytics_opted_in FROM user_preferences WHERE user_id = $1
      `, [req.userId]);
      const prefs = prefsResult.rows?.[0];

      if (prefs && prefs.analytics_opted_in === 0) {
        return res.json({ success: true, tracked: 0 });
      }
    }

    // Execute batch insert in transaction
    let count = 0;
    await database.query('BEGIN');
    try {
      for (const ev of events) {
        if (ev.event && ev.category && ev.sessionId) {
          await database.query(`
            INSERT INTO analytics_events (
              session_id, user_id, event_name, event_category,
              properties, page, referrer, device, browser, session_duration_seconds
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            ev.sessionId,
            req.userId || null,
            ev.event,
            ev.category,
            JSON.stringify(ev.properties || {}),
            ev.page || null,
            ev.referrer || null,
            ev.device || null,
            ev.browser || null,
            ev.sessionDuration || null
          ]);
          count++;
        }
      }
      await database.query('COMMIT');
    } catch (transactionError) {
      await database.query('ROLLBACK');
      throw transactionError;
    }
    res.json({ success: true, tracked: count });
  } catch (error) {
    console.error('Error batch tracking events:', error);
    res.status(500).json({ success: false, error: 'Failed to batch track events' });
  }
});

/**
 * POST /api/analytics/session/start
 * Start or resume a session
 */
router.post('/session/start', optionalAuth, attachUserId, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const {
      sessionId,
      device,
      browser,
      os,
      screenWidth,
      screenHeight,
      landingPage,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    // Check if session already exists
    const existingResult = await db.query('SELECT id FROM analytics_sessions WHERE session_id = $1', [sessionId]);
    const existing = existingResult.rows?.[0];

    if (existing) {
      // Update existing session
      await db.query(`
        UPDATE analytics_sessions
        SET user_id = COALESCE($1, user_id)
        WHERE session_id = $2
      `, [req.userId, sessionId]);
    } else {
      // Create new session
      await db.query(`
        INSERT INTO analytics_sessions (
          session_id, user_id, device, browser, os,
          screen_width, screen_height, landing_page, referrer,
          utm_source, utm_medium, utm_campaign
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        sessionId,
        req.userId || null,
        device || null,
        browser || null,
        os || null,
        screenWidth || null,
        screenHeight || null,
        landingPage || null,
        referrer || null,
        utmSource || null,
        utmMedium || null,
        utmCampaign || null
      ]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ success: false, error: 'Failed to start session' });
  }
});

/**
 * POST /api/analytics/session/end
 * End a session
 */
router.post('/session/end', async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { sessionId, duration, pageViews, eventsCount } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    await db.query(`
      UPDATE analytics_sessions
      SET ended_at = CURRENT_TIMESTAMP,
          duration_seconds = $1,
          page_views = COALESCE($2, page_views),
          events_count = COALESCE($3, events_count)
      WHERE session_id = $4
    `, [duration || null, pageViews, eventsCount, sessionId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ success: false, error: 'Failed to end session' });
  }
});

// ============================================
// ADMIN ANALYTICS ENDPOINTS
// ============================================

/**
 * GET /api/analytics/admin/summary
 * Get analytics dashboard summary
 */
router.get('/admin/summary', requireAdmin, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { period = '7d' } = req.query;

    // Parse period
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Previous period for comparison
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    const prevStartDateStr = prevStartDate.toISOString().split('T')[0];

    // Current period metrics
    const currentMetricsResult = await db.query(`
      SELECT
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_events
      FROM analytics_events
      WHERE created_at >= $1
    `, [startDateStr]);
    const currentMetrics = currentMetricsResult.rows?.[0];

    // Previous period metrics
    const prevMetricsResult = await db.query(`
      SELECT
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_events
      FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2
    `, [prevStartDateStr, startDateStr]);
    const prevMetrics = prevMetricsResult.rows?.[0];

    // Page views
    const pageViewsResult = await db.query(`
      SELECT COUNT(*) as count
      FROM analytics_events
      WHERE event_name = 'page_view' AND created_at >= $1
    `, [startDateStr]);
    const pageViews = pageViewsResult.rows?.[0];

    // Average feedback rating
    const feedbackStatsResult = await db.query(`
      SELECT
        AVG(rating) as avg_rating,
        COUNT(*) as count
      FROM user_feedback
      WHERE rating IS NOT NULL AND created_at >= $1
    `, [startDateStr]);
    const feedbackStats = feedbackStatsResult.rows?.[0];

    // Open issues count
    const openIssuesResult = await db.query(`
      SELECT COUNT(*) as count
      FROM user_feedback
      WHERE status = 'new' AND category = 'bug'
    `);
    const openIssues = openIssuesResult.rows?.[0];

    // Feature usage
    const featureUsageResult = await db.query(`
      SELECT
        event_name,
        COUNT(*) as count,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM analytics_events
      WHERE event_category = 'feature' AND created_at >= $1
      GROUP BY event_name
      ORDER BY count DESC
      LIMIT 10
    `, [startDateStr]);
    const featureUsage = featureUsageResult.rows || [];

    // Recent feedback
    const recentFeedbackResult = await db.query(`
      SELECT
        id, feedback_type, rating, sentiment, message, feature, created_at
      FROM user_feedback
      WHERE message IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);
    const recentFeedback = recentFeedbackResult.rows || [];

    // Calculate changes
    const calculateChange = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous * 100).toFixed(1);
    };

    res.json({
      success: true,
      data: {
        period: { days, startDate: startDateStr },
        metrics: {
          activeUsers: {
            value: currentMetrics.unique_users || 0,
            change: calculateChange(currentMetrics.unique_users, prevMetrics.unique_users)
          },
          sessions: {
            value: currentMetrics.unique_sessions || 0,
            change: calculateChange(currentMetrics.unique_sessions, prevMetrics.unique_sessions)
          },
          pageViews: {
            value: pageViews.count || 0
          },
          events: {
            value: currentMetrics.total_events || 0
          }
        },
        feedback: {
          averageRating: feedbackStats.avg_rating ? feedbackStats.avg_rating.toFixed(1) : null,
          totalResponses: feedbackStats.count || 0,
          openIssues: openIssues.count || 0
        },
        featureUsage,
        recentFeedback
      }
    });
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics summary' });
  }
});

/**
 * GET /api/analytics/admin/features
 * Get feature usage statistics
 */
router.get('/admin/features', requireAdmin, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { period = '30d' } = req.query;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Feature usage with completion rates
    const featuresResult = await db.query(`
      SELECT
        COALESCE(JSON_EXTRACT(properties, '$.feature'), event_name) as feature_name,
        COUNT(*) as usage_count,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) as unique_users
      FROM analytics_events
      WHERE event_category IN ('feature', 'analysis', 'portfolio')
        AND created_at >= $1
      GROUP BY feature_name
      ORDER BY usage_count DESC
    `, [startDateStr]);
    const features = featuresResult.rows || [];

    // Feature feedback (quick feedback)
    const featureFeedbackResult = await db.query(`
      SELECT
        feature,
        SUM(CASE WHEN response = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN response = 'negative' THEN 1 ELSE 0 END) as negative,
        COUNT(*) as total
      FROM quick_feedback
      WHERE created_at >= $1
      GROUP BY feature
    `, [startDateStr]);
    const featureFeedback = featureFeedbackResult.rows || [];

    // Create a map for quick lookup
    const feedbackMap = {};
    for (const fb of featureFeedback) {
      feedbackMap[fb.feature] = {
        positive: fb.positive,
        negative: fb.negative,
        total: fb.total,
        satisfaction: fb.total > 0 ? ((fb.positive / fb.total) * 100).toFixed(1) : null
      };
    }

    // Merge feature data with feedback
    const enrichedFeatures = features.map(f => ({
      ...f,
      feedback: feedbackMap[f.feature_name] || null
    }));

    res.json({
      success: true,
      data: {
        period: { days, startDate: startDateStr },
        features: enrichedFeatures
      }
    });
  } catch (error) {
    console.error('Error fetching feature analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch feature analytics' });
  }
});

/**
 * GET /api/analytics/admin/funnel
 * Get funnel analysis
 */
router.get('/admin/funnel', requireAdmin, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { funnel = 'onboarding', period = '30d' } = req.query;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Define funnel steps based on funnel type
    const funnelSteps = {
      onboarding: [
        { step: 1, name: 'Landing Page', event: 'page_view', filter: { page: '/' } },
        { step: 2, name: 'Sign Up Started', event: 'auth_started' },
        { step: 3, name: 'Sign Up Completed', event: 'auth_completed' },
        { step: 4, name: 'First Analysis', event: 'analysis_completed' },
        { step: 5, name: 'Return Visit', event: 'page_view', filter: { returning: true } }
      ],
      analysis: [
        { step: 1, name: 'View Portfolio', event: 'page_view', filter: { page: '/portfolios' } },
        { step: 2, name: 'Start Analysis', event: 'analysis_started' },
        { step: 3, name: 'Analysis Complete', event: 'analysis_completed' },
        { step: 4, name: 'View Results', event: 'analysis_viewed' },
        { step: 5, name: 'Take Action', event: 'analysis_action' }
      ]
    };

    const steps = funnelSteps[funnel] || funnelSteps.onboarding;

    // Calculate counts for each step
    const funnelData = [];
    for (const step of steps) {
      let query = `
        SELECT COUNT(DISTINCT session_id) as count
        FROM analytics_events
        WHERE event_name = ? AND created_at >= ?
      `;
      const params = [step.event, startDateStr];

      if (step.filter?.page) {
        query += ' AND page = ?';
        params.push(step.filter.page);
      }

      let pgQuery = query;
      let n = 0;
      pgQuery = query.replace(/\?/g, () => `$${++n}`);
      const result = await db.query(pgQuery, params);
      const row = result.rows?.[0];

      funnelData.push({
        step: step.step,
        name: step.name,
        count: row?.count || 0
      });
    }

    // Calculate conversion rates
    const enrichedFunnel = funnelData.map((step, index) => {
      const prevCount = index > 0 ? funnelData[index - 1].count : step.count;
      const conversionRate = prevCount > 0 ? ((step.count / prevCount) * 100).toFixed(1) : 100;
      const dropoffRate = prevCount > 0 ? (100 - (step.count / prevCount) * 100).toFixed(1) : 0;

      return {
        ...step,
        conversionRate: parseFloat(conversionRate),
        dropoffRate: parseFloat(dropoffRate),
        cumulativeConversion: funnelData[0].count > 0
          ? ((step.count / funnelData[0].count) * 100).toFixed(1)
          : 100
      };
    });

    res.json({
      success: true,
      data: {
        funnel,
        period: { days, startDate: startDateStr },
        steps: enrichedFunnel
      }
    });
  } catch (error) {
    console.error('Error fetching funnel analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch funnel analytics' });
  }
});

/**
 * GET /api/analytics/admin/feedback
 * Get feedback analysis
 */
router.get('/admin/feedback', requireAdmin, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const { period = '30d', status = 'all' } = req.query;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Feedback by category
    const byCategoryResult = await db.query(`
      SELECT
        category,
        COUNT(*) as count,
        AVG(rating) as avg_rating
      FROM user_feedback
      WHERE created_at >= $1
      GROUP BY category
      ORDER BY count DESC
    `, [startDateStr]);
    const byCategory = byCategoryResult.rows || [];

    // Feedback by sentiment
    const bySentimentResult = await db.query(`
      SELECT
        sentiment,
        COUNT(*) as count
      FROM user_feedback
      WHERE sentiment IS NOT NULL AND created_at >= $1
      GROUP BY sentiment
    `, [startDateStr]);
    const bySentiment = bySentimentResult.rows || [];

    // Feedback by status
    const byStatusResult = await db.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM user_feedback
      WHERE created_at >= $1
      GROUP BY status
    `, [startDateStr]);
    const byStatus = byStatusResult.rows || [];

    // Recent feedback with messages
    const recentParams = status !== 'all' ? [startDateStr, status] : [startDateStr];
    let recentQuery = `
      SELECT
        id, feedback_type, category, rating, sentiment,
        message, feature, page, status, priority, created_at
      FROM user_feedback
      WHERE message IS NOT NULL AND created_at >= $1
    `;
    if (status !== 'all') {
      recentQuery += ' AND status = $2';
    }
    recentQuery += ' ORDER BY created_at DESC LIMIT 20';

    const recentResult = await db.query(recentQuery, recentParams);
    const recent = recentResult.rows || [];

    // Quick feedback stats
    const quickFeedbackStatsResult = await db.query(`
      SELECT
        response,
        COUNT(*) as count
      FROM quick_feedback
      WHERE created_at >= $1
      GROUP BY response
    `, [startDateStr]);
    const quickFeedbackStats = quickFeedbackStatsResult.rows || [];

    res.json({
      success: true,
      data: {
        period: { days, startDate: startDateStr },
        byCategory,
        bySentiment,
        byStatus,
        quickFeedback: quickFeedbackStats,
        recent
      }
    });
  } catch (error) {
    console.error('Error fetching feedback analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch feedback analytics' });
  }
});

/**
 * GET /api/analytics/admin/events
 * Get raw events for detailed analysis
 */
router.get('/admin/events', requireAdmin, async (req, res) => {
  try {
    const db = await getDatabaseAsync();
    const {
      period = '7d',
      category,
      event,
      limit = 100,
      offset = 0
    } = req.query;

    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    let query = `
      SELECT
        id, session_id, user_id, event_name, event_category,
        properties, page, device, created_at
      FROM analytics_events
      WHERE created_at >= ?
    `;
    const params = [startDateStr];

    if (category) {
      query += ' AND event_category = ?';
      params.push(category);
    }

    if (event) {
      query += ' AND event_name = ?';
      params.push(event);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    let n = 0;
    const pgQuery = query.replace(/\?/g, () => `$${++n}`);
    const eventsResult = await db.query(pgQuery, params);
    const events = eventsResult.rows || [];

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM analytics_events
      WHERE created_at >= ?
    `;
    const countParams = [startDateStr];

    if (category) {
      countQuery += ' AND event_category = ?';
      countParams.push(category);
    }

    if (event) {
      countQuery += ' AND event_name = ?';
      countParams.push(event);
    }
    let cn = 0;
    const countPgQuery = countQuery.replace(/\?/g, () => `$${++cn}`);
    const totalResult = await db.query(countPgQuery, countParams);
    const total = totalResult.rows?.[0];

    // Parse properties JSON
    const parsedEvents = events.map(e => ({
      ...e,
      properties: JSON.parse(e.properties || '{}')
    }));

    res.json({
      success: true,
      data: {
        events: parsedEvents,
        total: total.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/analytics/user/summary
 * Get user's own activity summary (transparent analytics)
 */
router.get('/user/summary', optionalAuth, attachUserId, async (req, res) => {
  try {
    const db = await getDatabaseAsync();

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get activity summary for the current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startDateStr = startOfMonth.toISOString();

    // Total analyses
    const analysesResult = await db.query(`
      SELECT COUNT(*) as count
      FROM analytics_events
      WHERE user_id = $1
        AND event_category = 'analysis'
        AND created_at >= $2
    `, [req.userId, startDateStr]);
    const analyses = analysesResult.rows?.[0];

    // Total page views
    const pageViewsResult = await db.query(`
      SELECT COUNT(*) as count
      FROM analytics_events
      WHERE user_id = $1
        AND event_name = 'page_view'
        AND created_at >= $2
    `, [req.userId, startDateStr]);
    const pageViews = pageViewsResult.rows?.[0];

    // Most used features
    const topFeaturesResult = await db.query(`
      SELECT
        COALESCE(JSON_EXTRACT(properties, '$.feature'), event_name) as feature,
        COUNT(*) as count
      FROM analytics_events
      WHERE user_id = $1
        AND event_category IN ('feature', 'analysis')
        AND created_at >= $2
      GROUP BY feature
      ORDER BY count DESC
      LIMIT 5
    `, [req.userId, startDateStr]);
    const topFeatures = topFeaturesResult.rows || [];

    // Session count
    const sessionsResult = await db.query(`
      SELECT COUNT(DISTINCT session_id) as count
      FROM analytics_events
      WHERE user_id = $1 AND created_at >= $2
    `, [req.userId, startDateStr]);
    const sessions = sessionsResult.rows?.[0];

    res.json({
      success: true,
      data: {
        period: 'This month',
        startDate: startOfMonth.toISOString().split('T')[0],
        metrics: {
          analysesRun: analyses.count || 0,
          pageViews: pageViews.count || 0,
          sessions: sessions.count || 0
        },
        topFeatures
      }
    });
  } catch (error) {
    console.error('Error fetching user activity:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity summary' });
  }
});

module.exports = router;
