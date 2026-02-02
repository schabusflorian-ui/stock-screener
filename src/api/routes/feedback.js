/**
 * Feedback API Routes
 *
 * Endpoints for submitting feedback, managing support requests,
 * and accessing help articles.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDatabaseAsync, isPostgres } = require('../../database');

// Middleware imports
const { optionalAuth, requireAdmin, attachUserId } = require('../../middleware/auth');

// Helper to generate ticket numbers
function generateTicketNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

// ============================================
// QUICK FEEDBACK ENDPOINTS
// ============================================

/**
 * POST /api/feedback/quick
 * Submit quick thumbs up/down feedback
 */
router.post('/quick', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      type,
      feature,
      contentId,
      response,
      sessionId,
      page
    } = req.body;

    // Validate required fields
    if (!type || !feature || !response || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, feature, response, sessionId'
      });
    }

    // Validate response value
    if (!['positive', 'negative', 'skipped'].includes(response)) {
      return res.status(400).json({
        success: false,
        error: 'Response must be: positive, negative, or skipped'
      });
    }

    // Check if user has opted out of feedback prompts
    if (req.userId) {
      const prefsResult = await database.query(`
        SELECT feedback_prompts_enabled FROM user_preferences WHERE user_id = ?
      `, [req.userId]);
      const prefs = prefsResult.rows[0];

      if (prefs && prefs.feedback_prompts_enabled === 0) {
        return res.json({ success: true, recorded: false });
      }
    }

    // Insert quick feedback
    const result = await database.query(`
      INSERT INTO quick_feedback (
        user_id, session_id, feedback_type, feature, content_id, response, page
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      req.userId || null,
      sessionId,
      type,
      feature,
      contentId || null,
      response,
      page || null
    ]);

    res.json({
      success: true,
      recorded: true,
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error recording quick feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to record feedback' });
  }
});

// ============================================
// DETAILED FEEDBACK ENDPOINTS
// ============================================

/**
 * POST /api/feedback
 * Submit detailed feedback
 */
router.post('/', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      type,
      category,
      rating,
      message,
      feature,
      page,
      sessionId,
      metadata = {}
    } = req.body;

    // Validate required fields
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Feedback type is required'
      });
    }

    // Validate type
    if (!['quick', 'contextual', 'detailed', 'support'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feedback type'
      });
    }

    // Determine sentiment from rating
    let sentiment = null;
    if (rating !== undefined && rating !== null) {
      if (rating <= 2) sentiment = 'negative';
      else if (rating === 3) sentiment = 'neutral';
      else sentiment = 'positive';
    }

    // Insert feedback
    const result = await database.query(`
      INSERT INTO user_feedback (
        user_id, session_id, feedback_type, category, rating, sentiment,
        message, feature, page, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.userId || null,
      sessionId || null,
      type,
      category || null,
      rating || null,
      sentiment,
      message || null,
      feature || null,
      page || null,
      JSON.stringify(metadata)
    ]);

    // Update user's last feedback prompt time
    if (req.userId) {
      await database.query(`UPDATE user_preferences
        SET last_feedback_prompt_at = CURRENT_TIMESTAMP
        WHERE user_id = ?`, [
        req.userId,
      ]);
    }

    res.json({
      success: true,
      id: result.insertId || result.lastInsertRowid || result.rowCount
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
});

/**
 * POST /api/feedback/support
 * Submit a support request
 */
router.post('/support', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      requestType,
      subject,
      description,
      email,
      sessionId,
      page,
      browser,
      device,
      os,
      includeDebugInfo,
      debugInfo,
      includeScreenshot
    } = req.body;

    // Validate required fields
    if (!requestType || !subject || !description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: requestType, subject, description'
      });
    }

    // Validate request type
    if (!['bug', 'feature', 'question', 'other'].includes(requestType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request type. Must be: bug, feature, question, or other'
      });
    }

    // Generate ticket number
    const ticketNumber = generateTicketNumber();

    // Determine priority based on request type
    let priority = 3; // Default: medium
    if (requestType === 'bug') priority = 2; // Higher priority for bugs

    // Insert support request
    const result = await database.query(`
      INSERT INTO support_requests (
        ticket_number, user_id, email, session_id, request_type,
        subject, description, page, browser, device, os,
        debug_info, include_screenshot, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticketNumber,
      req.userId || null,
      email || null,
      sessionId || null,
      requestType,
      subject,
      description,
      page || null,
      browser || null,
      device || null,
      os || null,
      includeDebugInfo ? JSON.stringify(debugInfo || {}) : null,
      includeScreenshot ? 1 : 0,
      priority
    ]);

    res.json({
      success: true,
      ticketNumber,
      id: result.insertId || result.lastInsertRowid || result.rowCount
    });
  } catch (error) {
    console.error('Error submitting support request:', error);
    res.status(500).json({ success: false, error: 'Failed to submit support request' });
  }
});

/**
 * GET /api/feedback/support/mine
 * Get user's support requests
 */
router.get('/support/mine', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const requestsResult = await database.query(`
      SELECT
        id, ticket_number, request_type, subject, description,
        status, priority, created_at, resolved_at, resolution
      FROM support_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [req.userId]);
    const requests = requestsResult.rows;

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching support requests:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch support requests' });
  }
});

/**
 * GET /api/feedback/support/:ticketNumber
 * Get a specific support request
 */
router.get('/support/:ticketNumber', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { ticketNumber } = req.params;

    const requestResult = await database.query(`
      SELECT * FROM support_requests WHERE ticket_number = ?
    `, [ticketNumber]);
    const request = requestResult.rows[0];

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Support request not found'
      });
    }

    // Check ownership (unless admin)
    if (req.userId !== request.user_id && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this request'
      });
    }

    // Get responses
    const responsesResult = await database.query(`
      SELECT
        id, responder_type, message, is_internal, created_at
      FROM support_responses
      WHERE request_id = ? AND is_internal = 0
      ORDER BY created_at ASC
    `, [request.id]);
    const responses = responsesResult.rows;

    res.json({
      success: true,
      data: {
        ...request,
        debug_info: request.debug_info ? JSON.parse(request.debug_info) : null,
        attachments: request.attachments ? JSON.parse(request.attachments) : [],
        responses
      }
    });
  } catch (error) {
    console.error('Error fetching support request:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch support request' });
  }
});

// ============================================
// FEEDBACK PROMPT TRACKING
// ============================================

/**
 * POST /api/feedback/prompt/shown
 * Record that a feedback prompt was shown
 */
router.post('/prompt/shown', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { promptType, trigger, sessionId, page } = req.body;

    if (!promptType || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'promptType and sessionId are required'
      });
    }

    const result = await database.query(`
      INSERT INTO feedback_prompts_shown (
        user_id, session_id, prompt_type, prompt_trigger, page
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      req.userId || null,
      sessionId,
      promptType,
      trigger || null,
      page || null
    ]);

    res.json({
      success: true,
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error recording prompt shown:', error);
    res.status(500).json({ success: false, error: 'Failed to record prompt' });
  }
});

/**
 * POST /api/feedback/prompt/response
 * Record response to a feedback prompt
 */
router.post('/prompt/response', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { promptId, response, dismissed } = req.body;

    if (!promptId) {
      return res.status(400).json({
        success: false,
        error: 'promptId is required'
      });
    }

    await database.query(`UPDATE feedback_prompts_shown
      SET response = ?,
          dismissed = ?,
          responded_at = CURRENT_TIMESTAMP
      WHERE id = ?`, [
      response || null,
      dismissed ? 1 : 0,
      promptId,
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording prompt response:', error);
    res.status(500).json({ success: false, error: 'Failed to record response' });
  }
});

module.exports = router;
