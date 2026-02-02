// src/api/routes/admin.js
// Admin routes for user and system management

const express = require('express');
const { getDatabaseAsync, isPostgres } = require('../../database');
const router = express.Router();
const { requireAdmin } = require('../../middleware/auth');

// All admin routes require admin access
router.use(requireAdmin);

// ============================================
// User Management
// ============================================

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { limit = 100, offset = 0, search = '' } = req.query;

    let query = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.picture,
        u.is_admin,
        u.created_at,
        u.last_login_at,
        (SELECT COUNT(*) FROM portfolios WHERE user_id = u.id) as portfolio_count,
        (SELECT COUNT(*) FROM notes WHERE user_id = u.id) as notes_count
      FROM users u
    `;

    const params = [];

    if (search) {
      query += ' WHERE u.email LIKE ? OR u.name LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const usersResult = await database.query(query, [...params]);
    const users = usersResult.rows;

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM users';
    if (search) {
      countQuery += ' WHERE email LIKE ? OR name LIKE ?';
    }
    const countParams = search ? [`%${search}%`, `%${search}%`] : [];
    const { total } = database.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      users,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/users/:id - Get user details
router.get('/users/:id', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.id;

    const userResult = await database.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.picture,
        u.is_admin,
        u.created_at,
        u.last_login_at
      FROM users u
      WHERE u.id = ?
    `, [userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's portfolios
    const portfoliosResult = await database.query(`
      SELECT id, name, portfolio_type, current_value, created_at
      FROM portfolios
      WHERE user_id = ? AND is_archived = 0
      ORDER BY created_at DESC
    `, [userId]);
    const portfolios = portfoliosResult.rows;

    // Get user's notes count
    const { notes_count } = database.prepare(`
      SELECT COUNT(*) as notes_count FROM notes WHERE user_id = ?
    `).get(userId);

    // Get user's theses count
    const { theses_count } = database.prepare(`
      SELECT COUNT(*) as theses_count FROM theses WHERE user_id = ?
    `).get(userId);

    res.json({
      success: true,
      user: {
        ...user,
        portfolios,
        stats: {
          portfolioCount: portfolios.length,
          notesCount: notes_count,
          thesesCount: theses_count
        }
      }
    });
  } catch (error) {
    console.error('Error getting user details:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.id;
    const { name, is_admin } = req.body;

    // Check user exists
    const userResult = await database.query('SELECT id FROM users WHERE id = ?', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-demotion (admin removing their own admin status)
    if (userId === req.user.id && is_admin === false) {
      return res.status(400).json({ error: 'Cannot remove your own admin status' });
    }

    // Update user
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    if (is_admin !== undefined) {
      updates.push('is_admin = ?');
      params.push(is_admin ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(userId);
    database.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Get updated user
    const updatedUserResult = await database.query(`
      SELECT id, email, name, is_admin, created_at, last_login_at
      FROM users WHERE id = ?
    `, [userId]);
    const updatedUser = updatedUserResult.rows[0];

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/users/:id - Delete user (soft delete by default)
router.delete('/users/:id', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.id;
    const { hard = 'false' } = req.query;

    // Check user exists
    const userResult = await database.query('SELECT id, email FROM users WHERE id = ?', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    if (hard === 'true') {
      // Hard delete - remove user and their data
      // Note: This should cascade due to FK constraints, but we'll be explicit

      // Archive portfolios first (keep data for audit)
      database.prepare('UPDATE portfolios SET is_archived = 1 WHERE user_id = ?').run(userId);

      // Delete user
      database.prepare('DELETE FROM users WHERE id = ?').run(userId);

      res.json({
        success: true,
        deleted: true,
        userId,
        email: user.email
      });
    } else {
      // Soft delete - just mark as inactive (future: add is_active column)
      // For now, we'll remove admin access and archive their portfolios
      database.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(userId);
      database.prepare('UPDATE portfolios SET is_archived = 1 WHERE user_id = ?').run(userId);

      res.json({
        success: true,
        deactivated: true,
        userId,
        email: user.email
      });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/users/:id/grant-admin - Grant admin access
router.post('/users/:id/grant-admin', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.id;

    const userResult = await database.query('SELECT id, email FROM users WHERE id = ?', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    database.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);

    res.json({
      success: true,
      userId,
      email: user.email,
      isAdmin: true
    });
  } catch (error) {
    console.error('Error granting admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/users/:id/revoke-admin - Revoke admin access
router.post('/users/:id/revoke-admin', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.id;

    // Prevent self-demotion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot revoke your own admin access' });
    }

    const userResult = await database.query('SELECT id, email FROM users WHERE id = ?', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    database.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(userId);

    res.json({
      success: true,
      userId,
      email: user.email,
      isAdmin: false
    });
  } catch (error) {
    console.error('Error revoking admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Portfolio Management (Admin View)
// ============================================

// GET /api/admin/portfolios - List all portfolios across all users
router.get('/portfolios', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { limit = 100, offset = 0, userId = null } = req.query;

    let query = `
      SELECT
        p.id,
        p.name,
        p.portfolio_type,
        p.user_id,
        u.email as user_email,
        u.name as user_name,
        p.current_value,
        p.current_cash,
        p.is_archived,
        p.created_at,
        (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as positions_count
      FROM portfolios p
      LEFT JOIN users u ON p.user_id = u.id
    `;

    const params = [];
    const conditions = [];

    if (userId) {
      conditions.push('p.user_id = ?');
      params.push(userId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const portfoliosResult = await database.query(query, [...params]);
    const portfolios = portfoliosResult.rows;

    // Get total
    let countQuery = 'SELECT COUNT(*) as total FROM portfolios';
    const countParams = [];
    if (userId) {
      countQuery += ' WHERE user_id = ?';
      countParams.push(userId);
    }
    const { total } = database.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      portfolios,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error listing portfolios:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/portfolios/:id/transfer - Transfer portfolio to another user
router.post('/portfolios/:id/transfer', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const portfolioId = parseInt(req.params.id);
    const { newUserId } = req.body;

    if (!newUserId) {
      return res.status(400).json({ error: 'newUserId is required' });
    }

    // Check portfolio exists
    const portfolioResult = await database.query('SELECT id, name, user_id FROM portfolios WHERE id = ?', [portfolioId]);
    const portfolio = portfolioResult.rows[0];
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // Check new user exists
    const newUserResult = await database.query('SELECT id, email FROM users WHERE id = ?', [newUserId]);
    const newUser = newUserResult.rows[0];
    if (!newUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Transfer
    database.prepare('UPDATE portfolios SET user_id = ? WHERE id = ?').run(newUserId, portfolioId);

    res.json({
      success: true,
      portfolioId,
      portfolioName: portfolio.name,
      previousUserId: portfolio.user_id,
      newUserId,
      newUserEmail: newUser.email
    });
  } catch (error) {
    console.error('Error transferring portfolio:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// System Stats
// ============================================

// GET /api/admin/stats - Get system statistics
router.get('/stats', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    const stats = {
      users: database.prepare('SELECT COUNT(*) as count FROM users').get().count,
      admins: database.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1').get().count,
      portfolios: database.prepare('SELECT COUNT(*) as count FROM portfolios WHERE is_archived = 0').get().count,
      portfoliosArchived: database.prepare('SELECT COUNT(*) as count FROM portfolios WHERE is_archived = 1').get().count,
      totalPortfolioValue: database.prepare('SELECT SUM(current_value) as total FROM portfolios WHERE is_archived = 0').get().total || 0,
      positions: database.prepare('SELECT COUNT(*) as count FROM portfolio_positions').get().count,
      transactions: database.prepare('SELECT COUNT(*) as count FROM portfolio_transactions').get().count,
      notes: database.prepare('SELECT COUNT(*) as count FROM notes').get().count,
      theses: database.prepare('SELECT COUNT(*) as count FROM theses').get().count,
      companies: database.prepare('SELECT COUNT(*) as count FROM companies').get().count
    };

    // Recent activity
    const recentUsersResult = await database.query(`
      SELECT id, email, name, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `, []);
    const recentUsers = recentUsersResult.rows;

    const recentPortfoliosResult = await database.query(`
      SELECT p.id, p.name, p.created_at, u.email as user_email
      FROM portfolios p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
      LIMIT 5
    `, []);
    const recentPortfolios = recentPortfoliosResult.rows;

    res.json({
      success: true,
      stats,
      recentActivity: {
        users: recentUsers,
        portfolios: recentPortfolios
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Session Management
// ============================================

// GET /api/admin/sessions - List active sessions
router.get('/sessions', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    const sessions = database.prepare(`
      SELECT
        sess,
        expired
      FROM sessions
      WHERE expired > datetime('now')
      ORDER BY expired DESC
      LIMIT 100
    `).all();

    // Parse session data to extract user info
    const parsedSessions = sessions.map(s => {
      try {
        const data = JSON.parse(s.sess);
        return {
          expires: s.expired,
          userId: data.passport?.user?.id,
          userEmail: data.passport?.user?.email
        };
      } catch {
        return { expires: s.expired, error: 'Parse error' };
      }
    });

    res.json({
      success: true,
      count: parsedSessions.length,
      sessions: parsedSessions
    });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/sessions/:userId - Invalidate all sessions for a user
router.delete('/sessions/:userId', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.userId;

    // Prevent self-logout
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot invalidate your own sessions' });
    }

    // This is a bit hacky since sessions are stored as JSON strings
    // We need to find sessions containing this user ID
    const sessionsResult = await database.query('SELECT sid, sess FROM sessions', []);
    const sessions = sessionsResult.rows;

    let invalidated = 0;
    for (const session of sessions) {
      try {
        const data = JSON.parse(session.sess);
        if (data.passport?.user?.id === userId) {
          database.prepare('DELETE FROM sessions WHERE sid = ?').run(session.sid);
          invalidated++;
        }
      } catch {
        // Skip invalid sessions
      }
    }

    res.json({
      success: true,
      userId,
      sessionsInvalidated: invalidated
    });
  } catch (error) {
    console.error('Error invalidating sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
