/**
 * Feedback API Routes
 *
 * Endpoints for submitting feedback, managing support requests,
 * and accessing help articles.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

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
    const db = req.app.get('db');
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
      const prefs = db.prepare(`
        SELECT feedback_prompts_enabled FROM user_preferences WHERE user_id = ?
      `).get(req.userId);

      if (prefs && prefs.feedback_prompts_enabled === 0) {
        return res.json({ success: true, recorded: false });
      }
    }

    // Insert quick feedback
    const stmt = db.prepare(`
      INSERT INTO quick_feedback (
        user_id, session_id, feedback_type, feature, content_id, response, page
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      req.userId || null,
      sessionId,
      type,
      feature,
      contentId || null,
      response,
      page || null
    );

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
    const db = req.app.get('db');
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
    const stmt = db.prepare(`
      INSERT INTO user_feedback (
        user_id, session_id, feedback_type, category, rating, sentiment,
        message, feature, page, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
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
    );

    // Update user's last feedback prompt time
    if (req.userId) {
      db.prepare(`
        UPDATE user_preferences
        SET last_feedback_prompt_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(req.userId);
    }

    res.json({
      success: true,
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  }
});

/**
 * GET /api/feedback/mine
 * Get user's own feedback history
 */
router.get('/mine', optionalAuth, attachUserId, async (req, res) => {
  try {
    const db = req.app.get('db');

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const feedback = db.prepare(`
      SELECT
        id, feedback_type, category, rating, sentiment,
        message, feature, page, status, created_at
      FROM user_feedback
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.userId);

    res.json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error('Error fetching user feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch feedback' });
  }
});

// ============================================
// SUPPORT REQUEST ENDPOINTS
// ============================================

/**
 * POST /api/feedback/support
 * Submit a support request
 */
router.post('/support', optionalAuth, attachUserId, async (req, res) => {
  try {
    const db = req.app.get('db');
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
    const stmt = db.prepare(`
      INSERT INTO support_requests (
        ticket_number, user_id, email, session_id, request_type,
        subject, description, page, browser, device, os,
        debug_info, include_screenshot, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
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
    );

    res.json({
      success: true,
      ticketNumber,
      id: result.lastInsertRowid
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
    const db = req.app.get('db');

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const requests = db.prepare(`
      SELECT
        id, ticket_number, request_type, subject, description,
        status, priority, created_at, resolved_at, resolution
      FROM support_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.userId);

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
    const db = req.app.get('db');
    const { ticketNumber } = req.params;

    const request = db.prepare(`
      SELECT * FROM support_requests WHERE ticket_number = ?
    `).get(ticketNumber);

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
    const responses = db.prepare(`
      SELECT
        id, responder_type, message, is_internal, created_at
      FROM support_responses
      WHERE request_id = ? AND is_internal = 0
      ORDER BY created_at ASC
    `).all(request.id);

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
    const db = req.app.get('db');
    const { promptType, trigger, sessionId, page } = req.body;

    if (!promptType || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'promptType and sessionId are required'
      });
    }

    const stmt = db.prepare(`
      INSERT INTO feedback_prompts_shown (
        user_id, session_id, prompt_type, prompt_trigger, page
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      req.userId || null,
      sessionId,
      promptType,
      trigger || null,
      page || null
    );

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
    const db = req.app.get('db');
    const { promptId, response, dismissed } = req.body;

    if (!promptId) {
      return res.status(400).json({
        success: false,
        error: 'promptId is required'
      });
    }

    db.prepare(`
      UPDATE feedback_prompts_shown
      SET response = ?,
          dismissed = ?,
          responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(response || null, dismissed ? 1 : 0, promptId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording prompt response:', error);
    res.status(500).json({ success: false, error: 'Failed to record response' });
  }
});

/**
 * GET /api/feedback/prompt/should-show
 * Check if a feedback prompt should be shown
 */
router.get('/prompt/should-show', optionalAuth, attachUserId, async (req, res) => {
  try {
    const db = req.app.get('db');
    const { promptType, sessionId } = req.query;

    if (!promptType || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'promptType and sessionId are required'
      });
    }

    // Check if user has opted out
    if (req.userId) {
      const prefs = db.prepare(`
        SELECT feedback_prompts_enabled, last_feedback_prompt_at, feedback_prompt_cooldown_days
        FROM user_preferences
        WHERE user_id = ?
      `).get(req.userId);

      if (prefs && prefs.feedback_prompts_enabled === 0) {
        return res.json({ success: true, shouldShow: false, reason: 'opted_out' });
      }

      // Check cooldown
      if (prefs && prefs.last_feedback_prompt_at) {
        const lastPrompt = new Date(prefs.last_feedback_prompt_at);
        const cooldownMs = (prefs.feedback_prompt_cooldown_days || 7) * 24 * 60 * 60 * 1000;
        if (Date.now() - lastPrompt.getTime() < cooldownMs) {
          return res.json({ success: true, shouldShow: false, reason: 'cooldown' });
        }
      }
    }

    // Check if prompt was already shown in this session
    const shownInSession = db.prepare(`
      SELECT id FROM feedback_prompts_shown
      WHERE session_id = ? AND prompt_type = ?
    `).get(sessionId, promptType);

    if (shownInSession) {
      return res.json({ success: true, shouldShow: false, reason: 'shown_in_session' });
    }

    // Check if prompt type has been shown before (for one-time prompts)
    const oneTimePrompts = ['first_analysis', 'welcome', 'first_week'];
    if (oneTimePrompts.includes(promptType) && req.userId) {
      const everShown = db.prepare(`
        SELECT id FROM feedback_prompts_shown
        WHERE user_id = ? AND prompt_type = ? AND (response IS NOT NULL OR dismissed = 1)
      `).get(req.userId, promptType);

      if (everShown) {
        return res.json({ success: true, shouldShow: false, reason: 'already_responded' });
      }
    }

    res.json({ success: true, shouldShow: true });
  } catch (error) {
    console.error('Error checking prompt eligibility:', error);
    res.status(500).json({ success: false, error: 'Failed to check prompt eligibility' });
  }
});

// ============================================
// ADMIN FEEDBACK MANAGEMENT
// ============================================

/**
 * GET /api/feedback/admin/list
 * Get all feedback (admin)
 */
router.get('/admin/list', requireAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const {
      status = 'all',
      category,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        f.*,
        u.name as user_name,
        u.email as user_email
      FROM user_feedback f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status !== 'all') {
      query += ' AND f.status = ?';
      params.push(status);
    }

    if (category) {
      query += ' AND f.category = ?';
      params.push(category);
    }

    query += ' ORDER BY f.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const feedback = db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM user_feedback WHERE 1=1';
    const countParams = [];

    if (status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    if (category) {
      countQuery += ' AND category = ?';
      countParams.push(category);
    }

    const total = db.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      data: {
        feedback: feedback.map(f => ({
          ...f,
          metadata: f.metadata ? JSON.parse(f.metadata) : {},
          tags: f.tags ? JSON.parse(f.tags) : []
        })),
        total: total.total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error fetching feedback list:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch feedback' });
  }
});

/**
 * PATCH /api/feedback/admin/:id
 * Update feedback status (admin)
 */
router.patch('/admin/:id', requireAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const { id } = req.params;
    const { status, priority, internalNotes, resolutionNotes, tags } = req.body;

    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);

      if (status === 'resolved') {
        updates.push('resolved_at = CURRENT_TIMESTAMP');
        updates.push('resolved_by = ?');
        params.push(req.userId);
      }
    }

    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    if (internalNotes !== undefined) {
      updates.push('internal_notes = ?');
      params.push(internalNotes);
    }

    if (resolutionNotes !== undefined) {
      updates.push('resolution_notes = ?');
      params.push(resolutionNotes);
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(tags));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`
      UPDATE user_feedback
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ success: false, error: 'Failed to update feedback' });
  }
});

/**
 * GET /api/feedback/admin/support
 * Get all support requests (admin)
 */
router.get('/admin/support', requireAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const {
      status = 'all',
      type,
      limit = 50,
      offset = 0
    } = req.query;

    let query = `
      SELECT
        sr.*,
        u.name as user_name,
        u.email as user_email
      FROM support_requests sr
      LEFT JOIN users u ON sr.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status !== 'all') {
      query += ' AND sr.status = ?';
      params.push(status);
    }

    if (type) {
      query += ' AND sr.request_type = ?';
      params.push(type);
    }

    query += ' ORDER BY sr.priority ASC, sr.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const requests = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: {
        requests: requests.map(r => ({
          ...r,
          attachments: r.attachments ? JSON.parse(r.attachments) : [],
          tags: r.tags ? JSON.parse(r.tags) : []
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching support requests:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch support requests' });
  }
});

/**
 * PATCH /api/feedback/admin/support/:id
 * Update support request (admin)
 */
router.patch('/admin/support/:id', requireAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const { id } = req.params;
    const { status, priority, assignedTo, resolution, tags } = req.body;

    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);

      if (status === 'resolved') {
        updates.push('resolved_at = CURRENT_TIMESTAMP');
        updates.push('resolved_by = ?');
        params.push(req.userId);
      }
    }

    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }

    if (assignedTo !== undefined) {
      updates.push('assigned_to = ?');
      updates.push('assigned_at = CURRENT_TIMESTAMP');
      params.push(assignedTo);
    }

    if (resolution !== undefined) {
      updates.push('resolution = ?');
      params.push(resolution);
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(tags));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    db.prepare(`
      UPDATE support_requests
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating support request:', error);
    res.status(500).json({ success: false, error: 'Failed to update support request' });
  }
});

/**
 * POST /api/feedback/admin/support/:id/respond
 * Add response to support request (admin)
 */
router.post('/admin/support/:id/respond', requireAdmin, async (req, res) => {
  try {
    const db = req.app.get('db');
    const { id } = req.params;
    const { message, isInternal = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Insert response
    const stmt = db.prepare(`
      INSERT INTO support_responses (
        request_id, responder_id, responder_type, message, is_internal
      ) VALUES (?, ?, 'admin', ?, ?)
    `);

    stmt.run(id, req.userId, message, isInternal ? 1 : 0);

    // Update request
    db.prepare(`
      UPDATE support_requests
      SET last_response_at = CURRENT_TIMESTAMP,
          response_count = response_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error adding response:', error);
    res.status(500).json({ success: false, error: 'Failed to add response' });
  }
});

module.exports = router;
