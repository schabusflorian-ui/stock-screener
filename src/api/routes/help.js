/**
 * Help API Routes
 *
 * Endpoints for help articles, contextual help, and search.
 */

const express = require('express');
const router = express.Router();
const { getDatabaseAsync, isPostgres } = require('../../database');

// Middleware imports
const { optionalAuth, requireAdmin, attachUserId } = require('../../middleware/auth');

// ============================================
// PUBLIC HELP ENDPOINTS
// ============================================

/**
 * GET /api/help/articles
 * Get help articles (optionally filtered by category or search)
 */
router.get('/articles', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { category, search, featured, limit = 20 } = req.query;

    let query = `
      SELECT
        id, slug, title, summary, category, subcategory, tags,
        relevant_pages, relevant_features, is_featured, sort_order
      FROM help_articles
      WHERE status = 'published'
    `;
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ` AND (
        title LIKE ? OR
        summary LIKE ? OR
        content LIKE ? OR
        search_keywords LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (featured === 'true') {
      query += ' AND is_featured = 1';
    }

    query += ' ORDER BY is_featured DESC, sort_order ASC, title ASC LIMIT ?';
    params.push(parseInt(limit));

    const articlesResult = await database.query(query, [...params]);
    const articles = articlesResult.rows;

    // Parse JSON fields
    const parsedArticles = articles.map(a => ({
      ...a,
      tags: JSON.parse(a.tags || '[]'),
      relevant_pages: JSON.parse(a.relevant_pages || '[]'),
      relevant_features: JSON.parse(a.relevant_features || '[]')
    }));

    res.json({
      success: true,
      data: parsedArticles
    });
  } catch (error) {
    console.error('Error fetching help articles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch articles' });
  }
});

/**
 * GET /api/help/articles/:slug
 * Get a single help article by slug
 */
router.get('/articles/:slug', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { slug } = req.params;
    const { sessionId, fromPage, searchQuery } = req.query;

    const articleResult = await database.query(`
      SELECT * FROM help_articles WHERE slug = ? AND status = 'published'
    `, [slug]);
    const article = articleResult.rows[0];

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    // Track view
    if (sessionId) {
      await database.query(`
        INSERT INTO help_article_views (
          article_id, user_id, session_id, from_page, search_query
        ) VALUES (?, ?, ?, ?, ?)
      `, [article.id, req.userId || null, sessionId, fromPage || null, searchQuery || null]);
    }

    // Parse JSON fields
    const parsedArticle = {
      ...article,
      tags: JSON.parse(article.tags || '[]'),
      relevant_pages: JSON.parse(article.relevant_pages || '[]'),
      relevant_features: JSON.parse(article.relevant_features || '[]'),
      search_keywords: JSON.parse(article.search_keywords || '[]')
    };

    res.json({
      success: true,
      data: parsedArticle
    });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch article' });
  }
});

/**
 * GET /api/help/contextual
 * Get contextual help for a specific page/feature
 */
router.get('/contextual', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { page, feature } = req.query;

    if (!page && !feature) {
      return res.status(400).json({
        success: false,
        error: 'Either page or feature is required'
      });
    }

    let query = `
      SELECT
        id, slug, title, summary, category
      FROM help_articles
      WHERE status = 'published'
    `;
    const conditions = [];
    const params = [];

    if (page) {
      conditions.push('relevant_pages LIKE ?');
      params.push(`%"${page}"%`);
    }

    if (feature) {
      conditions.push('relevant_features LIKE ?');
      params.push(`%"${feature}"%`);
    }

    if (conditions.length > 0) {
      query += ' AND (' + conditions.join(' OR ') + ')';
    }

    query += ' ORDER BY sort_order ASC LIMIT 5';

    const articlesResult = await database.query(query, [...params]);
    const articles = articlesResult.rows;

    res.json({
      success: true,
      data: articles
    });
  } catch (error) {
    console.error('Error fetching contextual help:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch contextual help' });
  }
});

/**
 * GET /api/help/categories
 * Get all help categories
 */
router.get('/categories', async (req, res) => {
  try {
    const database = await getDatabaseAsync();

    const categoriesResult = await database.query(`
      SELECT
        category,
        COUNT(*) as article_count
      FROM help_articles
      WHERE status = 'published'
      GROUP BY category
      ORDER BY category ASC
    `);
    const categories = categoriesResult.rows;

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/help/popular
 * Get most viewed help articles
 */
router.get('/popular', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { limit = 5 } = req.query;

    // Get articles with most views in last 30 days
    const articlesResult = await database.query(`
      SELECT
        ha.id, ha.slug, ha.title, ha.summary, ha.category,
        COUNT(hav.id) as view_count
      FROM help_articles ha
      LEFT JOIN help_article_views hav ON ha.id = hav.article_id
        AND hav.viewed_at >= ${isPostgres ? "NOW() - INTERVAL '30 days'" : "datetime('now', '-30 days')"}
      WHERE ha.status = 'published'
      GROUP BY ha.id
      ORDER BY view_count DESC, ha.sort_order ASC
      LIMIT ?
    `, [parseInt(limit)]);
    const articles = articlesResult.rows;

    res.json({
      success: true,
      data: articles
    });
  } catch (error) {
    console.error('Error fetching popular articles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch popular articles' });
  }
});

/**
 * POST /api/help/articles/:slug/helpful
 * Mark an article as helpful or not
 */
router.post('/articles/:slug/helpful', optionalAuth, attachUserId, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { slug } = req.params;
    const { helpful, sessionId } = req.body;

    if (helpful === undefined || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'helpful and sessionId are required'
      });
    }

    const articleResult = await database.query('SELECT id FROM help_articles WHERE slug = ?', [slug]);
    const article = articleResult.rows[0];

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    // Update most recent view for this session
    await database.query(`
      UPDATE help_article_views
      SET was_helpful = ?
      WHERE article_id = ? AND session_id = ?
      ORDER BY viewed_at DESC
      LIMIT 1
    `, [helpful ? 1 : 0, article.id, sessionId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording helpfulness:', error);
    res.status(500).json({ success: false, error: 'Failed to record helpfulness' });
  }
});

/**
 * GET /api/help/search
 * Search help articles with fuzzy matching
 */
router.get('/search', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    // Simple search with LIKE
    // For production, consider FTS5 or external search service
    const searchTerm = `%${q}%`;

    const articlesResult = await database.query(`
      SELECT
        id, slug, title, summary, category,
        CASE
          WHEN title LIKE ? THEN 10
          WHEN summary LIKE ? THEN 5
          WHEN content LIKE ? THEN 2
          ELSE 1
        END as relevance
      FROM help_articles
      WHERE status = 'published'
        AND (
          title LIKE ? OR
          summary LIKE ? OR
          content LIKE ? OR
          search_keywords LIKE ?
        )
      ORDER BY relevance DESC, sort_order ASC
      LIMIT ?
    `, [
      searchTerm, searchTerm, searchTerm,
      searchTerm, searchTerm, searchTerm, searchTerm,
      parseInt(limit)
    ]);
    const articles = articlesResult.rows;

    res.json({
      success: true,
      data: articles,
      query: q
    });
  } catch (error) {
    console.error('Error searching help:', error);
    res.status(500).json({ success: false, error: 'Failed to search' });
  }
});

// ============================================
// ADMIN HELP MANAGEMENT
// ============================================

/**
 * GET /api/help/admin/articles
 * Get all articles including drafts (admin)
 */
router.get('/admin/articles', requireAdmin, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { status = 'all', limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM help_articles WHERE 1=1';
    const params = [];

    if (status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY category ASC, sort_order ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const articlesResult = await database.query(query, [...params]);
    const articles = articlesResult.rows;

    // Get view stats for each article
    const articlesWithStats = await Promise.all(articles.map(async (article) => {
      const statsResult = await database.query(`
        SELECT
          COUNT(*) as total_views,
          SUM(CASE WHEN was_helpful = 1 THEN 1 ELSE 0 END) as helpful_count,
          SUM(CASE WHEN was_helpful = 0 THEN 1 ELSE 0 END) as not_helpful_count
        FROM help_article_views
        WHERE article_id = ?
      `, [article.id]);
      const stats = statsResult.rows[0];

      return {
        ...article,
        tags: JSON.parse(article.tags || '[]'),
        relevant_pages: JSON.parse(article.relevant_pages || '[]'),
        relevant_features: JSON.parse(article.relevant_features || '[]'),
        search_keywords: JSON.parse(article.search_keywords || '[]'),
        stats: {
          totalViews: stats.total_views || 0,
          helpfulCount: stats.helpful_count || 0,
          notHelpfulCount: stats.not_helpful_count || 0,
          helpfulRate: stats.total_views > 0
            ? ((stats.helpful_count / (stats.helpful_count + stats.not_helpful_count || 1)) * 100).toFixed(1)
            : null
        }
      };
    }));

    res.json({
      success: true,
      data: articlesWithStats
    });
  } catch (error) {
    console.error('Error fetching admin articles:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch articles' });
  }
});

/**
 * POST /api/help/admin/articles
 * Create a new help article (admin)
 */
router.post('/admin/articles', requireAdmin, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const {
      slug,
      title,
      summary,
      content,
      category,
      subcategory,
      tags = [],
      relevantPages = [],
      relevantFeatures = [],
      searchKeywords = [],
      sortOrder = 0,
      isFeatured = false,
      status = 'draft'
    } = req.body;

    // Validate required fields
    if (!slug || !title || !content || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: slug, title, content, category'
      });
    }

    // Check slug uniqueness
    const existingResult = await database.query('SELECT id FROM help_articles WHERE slug = ?', [slug]);
    const existing = existingResult.rows[0];
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'An article with this slug already exists'
      });
    }

    const result = await database.query(`
      INSERT INTO help_articles (
        slug, title, summary, content, category, subcategory,
        tags, relevant_pages, relevant_features, search_keywords,
        sort_order, is_featured, status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      slug,
      title,
      summary || null,
      content,
      category,
      subcategory || null,
      JSON.stringify(tags),
      JSON.stringify(relevantPages),
      JSON.stringify(relevantFeatures),
      JSON.stringify(searchKeywords),
      sortOrder,
      isFeatured ? 1 : 0,
      status,
      req.userId
    ]);

    res.json({
      success: true,
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error creating article:', error);
    res.status(500).json({ success: false, error: 'Failed to create article' });
  }
});

/**
 * PUT /api/help/admin/articles/:id
 * Update a help article (admin)
 */
router.put('/admin/articles/:id', requireAdmin, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { id } = req.params;
    const {
      slug,
      title,
      summary,
      content,
      category,
      subcategory,
      tags,
      relevantPages,
      relevantFeatures,
      searchKeywords,
      sortOrder,
      isFeatured,
      status
    } = req.body;

    const updates = [];
    const params = [];

    if (slug !== undefined) {
      // Check slug uniqueness (excluding current article)
      const existingResult = await database.query('SELECT id FROM help_articles WHERE slug = ? AND id != ?', [slug, id]);
    const existing = existingResult.rows[0];
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'An article with this slug already exists'
        });
      }
      updates.push('slug = ?');
      params.push(slug);
    }

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }

    if (summary !== undefined) {
      updates.push('summary = ?');
      params.push(summary);
    }

    if (content !== undefined) {
      updates.push('content = ?');
      params.push(content);
    }

    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }

    if (subcategory !== undefined) {
      updates.push('subcategory = ?');
      params.push(subcategory);
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(tags));
    }

    if (relevantPages !== undefined) {
      updates.push('relevant_pages = ?');
      params.push(JSON.stringify(relevantPages));
    }

    if (relevantFeatures !== undefined) {
      updates.push('relevant_features = ?');
      params.push(JSON.stringify(relevantFeatures));
    }

    if (searchKeywords !== undefined) {
      updates.push('search_keywords = ?');
      params.push(JSON.stringify(searchKeywords));
    }

    if (sortOrder !== undefined) {
      updates.push('sort_order = ?');
      params.push(sortOrder);
    }

    if (isFeatured !== undefined) {
      updates.push('is_featured = ?');
      params.push(isFeatured ? 1 : 0);
    }

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No updates provided'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    updates.push('updated_by = ?');
    params.push(req.userId);
    params.push(id);

    await database.query(`
      UPDATE help_articles
      SET ${updates.join(', ')}
      WHERE id = ?
    `, params);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating article:', error);
    res.status(500).json({ success: false, error: 'Failed to update article' });
  }
});

/**
 * DELETE /api/help/admin/articles/:id
 * Delete a help article (admin)
 */
router.delete('/admin/articles/:id', requireAdmin, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { id } = req.params;

    // Check if article exists
    const articleResult = await database.query('SELECT id FROM help_articles WHERE id = ?', [id]);
    const article = articleResult.rows[0];
    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'Article not found'
      });
    }

    // Delete article (views are cascaded)
    await database.query('DELETE FROM help_articles WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting article:', error);
    res.status(500).json({ success: false, error: 'Failed to delete article' });
  }
});

/**
 * GET /api/help/admin/analytics
 * Get help article analytics (admin)
 */
router.get('/admin/analytics', requireAdmin, async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { period = '30d' } = req.query;

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString();

    // Total views
    const totalViewsResult = await database.query(`
      SELECT COUNT(*) as count
      FROM help_article_views
      WHERE viewed_at >= ?
    `, [startDateStr]);
    const totalViews = totalViewsResult.rows[0];

    // Helpfulness rate
    const helpfulnessResult = await database.query(`
      SELECT
        SUM(CASE WHEN was_helpful = 1 THEN 1 ELSE 0 END) as helpful,
        SUM(CASE WHEN was_helpful = 0 THEN 1 ELSE 0 END) as not_helpful,
        COUNT(was_helpful) as total_rated
      FROM help_article_views
      WHERE was_helpful IS NOT NULL AND viewed_at >= ?
    `, [startDateStr]);
    const helpfulness = helpfulnessResult.rows[0];

    // Most viewed articles
    const mostViewedResult = await database.query(`
      SELECT
        ha.id, ha.slug, ha.title, ha.category,
        COUNT(hav.id) as view_count
      FROM help_articles ha
      JOIN help_article_views hav ON ha.id = hav.article_id
      WHERE hav.viewed_at >= ?
      GROUP BY ha.id
      ORDER BY view_count DESC
      LIMIT 10
    `, [startDateStr]);
    const mostViewed = mostViewedResult.rows;

    // Most searched queries
    const searchQueriesResult = await database.query(`
      SELECT
        search_query,
        COUNT(*) as count
      FROM help_article_views
      WHERE search_query IS NOT NULL AND viewed_at >= ?
      GROUP BY search_query
      ORDER BY count DESC
      LIMIT 10
    `, [startDateStr]);
    const searchQueries = searchQueriesResult.rows;

    // Articles needing attention (low helpfulness)
    const needsAttentionResult = await database.query(`
      SELECT
        ha.id, ha.slug, ha.title,
        COUNT(hav.id) as view_count,
        SUM(CASE WHEN hav.was_helpful = 0 THEN 1 ELSE 0 END) as not_helpful_count,
        CAST(SUM(CASE WHEN hav.was_helpful = 0 THEN 1 ELSE 0 END) AS FLOAT) /
          NULLIF(COUNT(hav.was_helpful), 0) * 100 as not_helpful_rate
      FROM help_articles ha
      JOIN help_article_views hav ON ha.id = hav.article_id
      WHERE hav.viewed_at >= ? AND hav.was_helpful IS NOT NULL
      GROUP BY ha.id
      HAVING not_helpful_count >= 3 AND not_helpful_rate > 30
      ORDER BY not_helpful_rate DESC
    `, [startDateStr]);
    const needsAttention = needsAttentionResult.rows;

    res.json({
      success: true,
      data: {
        period: { days, startDate: startDateStr.split('T')[0] },
        overview: {
          totalViews: totalViews.count,
          helpfulRate: helpfulness.total_rated > 0
            ? ((helpfulness.helpful / helpfulness.total_rated) * 100).toFixed(1)
            : null,
          helpfulCount: helpfulness.helpful || 0,
          notHelpfulCount: helpfulness.not_helpful || 0
        },
        mostViewed,
        searchQueries,
        needsAttention
      }
    });
  } catch (error) {
    console.error('Error fetching help analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
