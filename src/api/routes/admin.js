// src/api/routes/admin.js
// Admin routes for user and system management

const express = require('express');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');
const router = express.Router();
const { requireAdmin } = require('../../middleware/auth');
const { getSubscriptionService } = require('../../services/subscriptionService');

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
      query += ' WHERE u.email LIKE $1 OR u.name LIKE $2';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY u.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const usersResult = await database.query(query, params);
    const users = usersResult.rows;

    let countQuery = 'SELECT COUNT(*) as total FROM users';
    const countParams = search ? [`%${search}%`, `%${search}%`] : [];
    if (search) {
      countQuery += ' WHERE email LIKE $1 OR name LIKE $2';
    }
    const countRes = await database.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0]?.total ?? 0, 10);

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
      WHERE u.id = $1
    `, [userId]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const portfoliosResult = await database.query(`
      SELECT id, name, portfolio_type, current_value, created_at
      FROM portfolios
      WHERE user_id = $1 AND is_archived = 0
      ORDER BY created_at DESC
    `, [userId]);
    const portfolios = portfoliosResult.rows;

    const notesRes = await database.query(
      'SELECT COUNT(*) as notes_count FROM notes WHERE user_id = $1',
      [userId]
    );
    const notes_count = parseInt(notesRes.rows[0]?.notes_count ?? 0, 10);

    const thesesRes = await database.query(
      'SELECT COUNT(*) as theses_count FROM theses WHERE user_id = $1',
      [userId]
    );
    const theses_count = parseInt(thesesRes.rows[0]?.theses_count ?? 0, 10);

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
    const userResult = await database.query('SELECT id FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-demotion (admin removing their own admin status)
    if (userId === req.user.id && is_admin === false) {
      return res.status(400).json({ error: 'Cannot remove your own admin status' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = $' + (params.length + 1));
      params.push(name);
    }

    if (is_admin !== undefined) {
      updates.push('is_admin = $' + (params.length + 1));
      params.push(is_admin ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(userId);
    await database.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );

    const updatedUserResult = await database.query(`
      SELECT id, email, name, is_admin, created_at, last_login_at
      FROM users WHERE id = $1
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
    const userResult = await database.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    if (hard === 'true') {
      await database.query('UPDATE portfolios SET is_archived = 1 WHERE user_id = $1', [userId]);
      await database.query('DELETE FROM users WHERE id = $1', [userId]);

      res.json({
        success: true,
        deleted: true,
        userId,
        email: user.email
      });
    } else {
      await database.query('UPDATE users SET is_admin = 0 WHERE id = $1', [userId]);
      await database.query('UPDATE portfolios SET is_archived = 1 WHERE user_id = $1', [userId]);

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

// POST /api/admin/users/set-tier-by-email - Set subscription tier by email (production-safe)
router.post('/users/set-tier-by-email', async (req, res) => {
  try {
    const { email, tier } = req.body;
    if (!email || !tier) {
      return res.status(400).json({ error: 'email and tier are required' });
    }
    const tierName = String(tier).toLowerCase();
    const validTiers = ['free', 'pro', 'ultra'];
    if (!validTiers.includes(tierName)) {
      return res.status(400).json({ error: 'tier must be one of: free, pro, ultra' });
    }

    const database = await getDatabaseAsync();
    const userResult = await database.query(
      'SELECT id, email, name FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: `No user found with email: ${email}` });
    }

    const tierResult = await database.query(
      'SELECT id, name, display_name FROM subscription_tiers WHERE name = $1 AND is_active = 1',
      [tierName]
    );
    const tierRow = tierResult.rows[0];
    if (!tierRow) {
      return res.status(404).json({ error: `Tier "${tierName}" not found` });
    }

    const subscriptionService = getSubscriptionService();
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    await subscriptionService.createOrUpdateSubscription(user.id, {
      tierId: tierRow.id,
      status: 'active',
      billingPeriod: 'monthly',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString()
    });

    res.json({
      success: true,
      email: user.email,
      userId: user.id,
      tier: tierRow.display_name,
      tierName: tierRow.name
    });
  } catch (error) {
    console.error('Error setting tier by email:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/users/:id/grant-admin - Grant admin access
router.post('/users/:id/grant-admin', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const userId = req.params.id;

    const userResult = await database.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await database.query('UPDATE users SET is_admin = 1 WHERE id = $1', [userId]);

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

    const userResult = await database.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await database.query('UPDATE users SET is_admin = 0 WHERE id = $1', [userId]);

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
      conditions.push('p.user_id = $1');
      params.push(userId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const portfoliosResult = await database.query(query, params);
    const portfolios = portfoliosResult.rows;

    let countQuery = 'SELECT COUNT(*) as total FROM portfolios';
    const countParams = userId ? [userId] : [];
    if (userId) {
      countQuery += ' WHERE user_id = $1';
    }
    const countRes = await database.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0]?.total ?? 0, 10);

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

    const portfolioResult = await database.query('SELECT id, name, user_id FROM portfolios WHERE id = $1', [portfolioId]);
    const portfolio = portfolioResult.rows[0];
    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const newUserResult = await database.query('SELECT id, email FROM users WHERE id = $1', [newUserId]);
    const newUser = newUserResult.rows[0];
    if (!newUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    await database.query('UPDATE portfolios SET user_id = $1 WHERE id = $2', [newUserId, portfolioId]);

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

    const runCount = async (sql) => {
      const r = await database.query(sql);
      return parseInt(r.rows[0]?.count ?? r.rows[0]?.total ?? 0, 10);
    };

    const stats = {
      users: await runCount('SELECT COUNT(*) as count FROM users'),
      admins: await runCount('SELECT COUNT(*) as count FROM users WHERE is_admin = 1'),
      portfolios: await runCount('SELECT COUNT(*) as count FROM portfolios WHERE is_archived = 0'),
      portfoliosArchived: await runCount('SELECT COUNT(*) as count FROM portfolios WHERE is_archived = 1'),
      totalPortfolioValue: (await database.query('SELECT SUM(current_value) as total FROM portfolios WHERE is_archived = 0')).rows[0]?.total ?? 0,
      positions: await runCount('SELECT COUNT(*) as count FROM portfolio_positions'),
      transactions: await runCount('SELECT COUNT(*) as count FROM portfolio_transactions'),
      notes: await runCount('SELECT COUNT(*) as count FROM notes'),
      theses: await runCount('SELECT COUNT(*) as count FROM theses'),
      companies: await runCount('SELECT COUNT(*) as count FROM companies')
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

    const expiredExpr = isUsingPostgres() ? 'NOW()' : "datetime('now')";
    const sessionsRes = await database.query(`
      SELECT sess, expired
      FROM sessions
      WHERE expired > ${expiredExpr}
      ORDER BY expired DESC
      LIMIT 100
    `);
    const sessions = sessionsRes.rows;

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
    const sessionsResult = await database.query('SELECT sid, sess FROM sessions');
    const sessions = sessionsResult.rows;

    let invalidated = 0;
    for (const session of sessions) {
      try {
        const data = JSON.parse(session.sess);
        if (data.passport?.user?.id === userId) {
          await database.query('DELETE FROM sessions WHERE sid = $1', [session.sid]);
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

// POST /api/admin/seed-portfolio-eu-jobs - Seed missing portfolio/EU update jobs
router.post('/seed-portfolio-eu-jobs', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const results = [];

    // Helper to get bundle ID
    async function getBundleId(name) {
      const result = await database.query('SELECT id FROM update_bundles WHERE name = $1', [name]);
      return result.rows[0]?.id;
    }

    // Helper to insert job
    async function insertJob(bundleId, jobKey, name, description, cronExpression, isAutomatic = 1, batchSize = 100, batchDelayMs = 500, timeoutSeconds = 3600) {
      if (!bundleId) {
        results.push({ job: jobKey, status: 'skipped', reason: 'no bundle' });
        return false;
      }
      const checkResult = await database.query('SELECT id FROM update_jobs WHERE job_key = $1', [jobKey]);
      if (checkResult.rows.length > 0) {
        results.push({ job: jobKey, status: 'exists' });
        return false;
      }
      await database.query(
        `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [bundleId, jobKey, name, description, cronExpression, isAutomatic, batchSize, batchDelayMs, timeoutSeconds]
      );
      results.push({ job: jobKey, status: 'inserted' });
      return true;
    }

    // Ensure bundles exist
    const portfolioCheck = await database.query("SELECT id FROM update_bundles WHERE name = 'portfolio'");
    if (portfolioCheck.rows.length === 0) {
      await database.query(
        `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
         VALUES ('portfolio', 'Portfolio', 'Portfolio snapshots and liquidity metrics', 55, 1)`
      );
      results.push({ bundle: 'portfolio', status: 'created' });
    }

    const euCheck = await database.query("SELECT id FROM update_bundles WHERE name = 'eu'");
    if (euCheck.rows.length === 0) {
      await database.query(
        `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
         VALUES ('eu', 'EU/UK Data', 'European and UK company data from XBRL', 65, 1)`
      );
      results.push({ bundle: 'eu', status: 'created' });
    }

    // Get bundle IDs
    const portfolioId = await getBundleId('portfolio');
    const euId = await getBundleId('eu');

    // Portfolio jobs
    await insertJob(portfolioId, 'portfolio.liquidity', 'Liquidity Metrics',
        'Calculate liquidity metrics (volume, volatility, spreads) for all companies',
        '0 20 * * 1-5', 1, 500, 100, 7200);
    await insertJob(portfolioId, 'portfolio.snapshots', 'Portfolio Snapshots',
        'Create daily portfolio value snapshots for performance tracking',
        '0 19 * * 1-5', 1, 50, 500, 3600);

    // EU jobs
    await insertJob(euId, 'eu.xbrl_import', 'XBRL Filing Import',
        'Import XBRL filings from EU/UK regulatory sources',
        '0 2 * * 0', 1, 100, 2000, 14400);
    await insertJob(euId, 'eu.sync', 'XBRL Data Sync',
        'Link XBRL companies and sync metrics to main tables',
        '0 4 * * 0', 1, 200, 500, 7200);
    await insertJob(euId, 'eu.indices', 'European Indices',
        'Update European stock indices (FTSE, DAX, CAC, etc.)',
        '0 18 * * 1-5', 1, 30, 1000, 1800);
    await insertJob(euId, 'eu.prices', 'EU/UK Prices',
        'Fetch daily prices for EU/UK companies',
        '0 17 * * 1-5', 1, 100, 500, 3600);

    // Count results
    const inserted = results.filter(r => r.status === 'inserted').length;
    const existed = results.filter(r => r.status === 'exists').length;

    res.json({
      success: true,
      message: `Seeded ${inserted} new jobs, ${existed} already existed`,
      results
    });
  } catch (error) {
    console.error('Error seeding jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
