// src/api/routes/classifications.js
const express = require('express');
const router = express.Router();
const { getDatabaseAsync, isPostgres } = require('../../database');

/**
 * GET /api/classifications
 * Get all custom classification definitions
 */
router.get('/', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { type } = req.query;

    let sql = 'SELECT * FROM custom_classifications';
    const params = [];

    if (type) {
      sql += ' WHERE type = $1';
      params.push(type);
    }

    sql += ' ORDER BY type, name';

    const result = await database.query(sql, params);
    const classifications = result.rows;

    // Group by type
    const grouped = {
      sectors: classifications.filter(c => c.type === 'sector'),
      industries: classifications.filter(c => c.type === 'industry'),
      subsectors: classifications.filter(c => c.type === 'subsector'),
      tags: classifications.filter(c => c.type === 'tag')
    };

    res.json({
      classifications: type ? classifications : grouped,
      count: classifications.length
    });
  } catch (error) {
    console.error('Error getting classifications:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/classifications
 * Create a new custom classification
 */
router.post('/', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { type, name, description, parent_name, color } = req.body;

    if (!type || !name) {
      return res.status(400).json({ error: 'type and name are required' });
    }

    if (!['sector', 'industry', 'subsector', 'tag'].includes(type)) {
      return res.status(400).json({ error: 'type must be sector, industry, subsector, or tag' });
    }

    const result = await database.query(`
      INSERT INTO custom_classifications (type, name, description, parent_name, color)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [type, name, description || null, parent_name || null, color || null]);

    const insertedId = result.rows[0].id;

    res.json({
      success: true,
      id: insertedId,
      classification: { id: insertedId, type, name, description, parent_name, color }
    });
  } catch (error) {
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({ error: 'Classification with this type and name already exists' });
    }
    console.error('Error creating classification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/classifications/:id
 * Update a custom classification
 */
router.put('/:id', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { id } = req.params;
    const { name, description, parent_name, color } = req.body;

    const result = await database.query(`
      UPDATE custom_classifications
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          parent_name = $3,
          color = COALESCE($4, color),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [name, description, parent_name, color, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Classification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating classification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/classifications/:id
 * Delete a custom classification
 */
router.delete('/:id', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { id } = req.params;

    const result = await database.query('DELETE FROM custom_classifications WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Classification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting classification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/classifications/company/:symbol
 * Get custom classifications for a company
 */
router.get('/company/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;

    const result = await database.query(`
      SELECT symbol, name, sector, industry, user_sector, user_industry, user_subsector, user_tags
      FROM companies
      WHERE symbol = $1
    `, [symbol]);

    const company = result.rows[0];
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Parse user_tags from JSON
    let tags = [];
    if (company.user_tags) {
      try {
        tags = JSON.parse(company.user_tags);
      } catch (e) {
        tags = [];
      }
    }

    res.json({
      symbol: company.symbol,
      name: company.name,
      default_sector: company.sector,
      default_industry: company.industry,
      user_sector: company.user_sector,
      user_industry: company.user_industry,
      user_subsector: company.user_subsector,
      user_tags: tags,
      // Effective values (user override or default)
      effective_sector: company.user_sector || company.sector,
      effective_industry: company.user_industry || company.industry
    });
  } catch (error) {
    console.error('Error getting company classifications:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/classifications/company/:symbol
 * Update custom classifications for a company
 */
router.put('/company/:symbol', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { user_sector, user_industry, user_subsector, user_tags } = req.body;

    // Convert tags array to JSON
    const tagsJson = user_tags ? JSON.stringify(user_tags) : null;

    const result = await database.query(`
      UPDATE companies
      SET user_sector = $1,
          user_industry = $2,
          user_subsector = $3,
          user_tags = $4
      WHERE symbol = $5
    `, [
      user_sector || null,
      user_industry || null,
      user_subsector || null,
      tagsJson,
      symbol
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating company classifications:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/classifications/company/:symbol/tags
 * Add a tag to a company
 */
router.post('/company/:symbol/tags', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol } = req.params;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'tag is required' });
    }

    // Get current tags
    const result = await database.query('SELECT user_tags FROM companies WHERE symbol = $1', [symbol]);
    const company = result.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    let tags = [];
    if (company.user_tags) {
      try {
        tags = JSON.parse(company.user_tags);
      } catch (e) {
        tags = [];
      }
    }

    // Add tag if not already present
    if (!tags.includes(tag)) {
      tags.push(tag);
    }

    // Update
    await database.query('UPDATE companies SET user_tags = $1 WHERE symbol = $2', [JSON.stringify(tags), symbol]);

    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error adding tag:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/classifications/company/:symbol/tags/:tag
 * Remove a tag from a company
 */
router.delete('/company/:symbol/tags/:tag', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbol, tag } = req.params;

    // Get current tags
    const result = await database.query('SELECT user_tags FROM companies WHERE symbol = $1', [symbol]);
    const company = result.rows[0];

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    let tags = [];
    if (company.user_tags) {
      try {
        tags = JSON.parse(company.user_tags);
      } catch (e) {
        tags = [];
      }
    }

    // Remove tag
    tags = tags.filter(t => t !== tag);

    // Update
    await database.query('UPDATE companies SET user_tags = $1 WHERE symbol = $2', [
      tags.length > 0 ? JSON.stringify(tags) : null,
      symbol
    ]);

    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/classifications/companies
 * Get companies filtered by custom classification
 */
router.get('/companies', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { user_sector, user_industry, user_subsector, tag, limit = 100 } = req.query;

    let sql = `
      SELECT c.symbol, c.name, c.sector, c.industry, c.user_sector, c.user_industry, c.user_subsector, c.user_tags
      FROM companies c
      WHERE 1=1
    `;
    const params = [];
    let paramCounter = 1;

    if (user_sector) {
      sql += ` AND c.user_sector = $${paramCounter++}`;
      params.push(user_sector);
    }

    if (user_industry) {
      sql += ` AND c.user_industry = $${paramCounter++}`;
      params.push(user_industry);
    }

    if (user_subsector) {
      sql += ` AND c.user_subsector = $${paramCounter++}`;
      params.push(user_subsector);
    }

    if (tag) {
      sql += ` AND c.user_tags LIKE $${paramCounter++}`;
      params.push(`%"${tag}"%`);
    }

    sql += ` LIMIT $${paramCounter++}`;
    params.push(parseInt(limit));

    const result = await database.query(sql, params);
    const companies = result.rows;

    // Parse tags for each company
    const result = companies.map(c => ({
      ...c,
      user_tags: c.user_tags ? JSON.parse(c.user_tags) : []
    }));

    res.json({
      companies: result,
      count: result.length
    });
  } catch (error) {
    console.error('Error getting classified companies:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/classifications/bulk
 * Bulk assign classification to multiple companies
 */
router.post('/bulk', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const { symbols, user_sector, user_industry, user_subsector, add_tags, remove_tags } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    const updateParts = [];
    const params = [];
    let paramCounter = 1;

    if (user_sector !== undefined) {
      updateParts.push(`user_sector = $${paramCounter++}`);
      params.push(user_sector || null);
    }

    if (user_industry !== undefined) {
      updateParts.push(`user_industry = $${paramCounter++}`);
      params.push(user_industry || null);
    }

    if (user_subsector !== undefined) {
      updateParts.push(`user_subsector = $${paramCounter++}`);
      params.push(user_subsector || null);
    }

    // Handle bulk updates for sector/industry/subsector
    let updated = 0;
    if (updateParts.length > 0) {
      const placeholders = symbols.map((_, idx) => `$${paramCounter + idx}`).join(',');
      const sql = `
        UPDATE companies
        SET ${updateParts.join(', ')}
        WHERE symbol IN (${placeholders})
      `;
      const result = await database.query(sql, [...params, ...symbols]);
      updated = result.rowCount;
    }

    // Handle tags separately (need to merge with existing)
    if (add_tags || remove_tags) {
      for (const symbol of symbols) {
        const result = await database.query('SELECT user_tags FROM companies WHERE symbol = $1', [symbol]);
        const company = result.rows[0];
        if (!company) continue;

        let tags = [];
        if (company.user_tags) {
          try {
            tags = JSON.parse(company.user_tags);
          } catch (e) {
            tags = [];
          }
        }

        // Add new tags
        if (add_tags && Array.isArray(add_tags)) {
          for (const tag of add_tags) {
            if (!tags.includes(tag)) {
              tags.push(tag);
            }
          }
        }

        // Remove tags
        if (remove_tags && Array.isArray(remove_tags)) {
          tags = tags.filter(t => !remove_tags.includes(t));
        }

        await database.query('UPDATE companies SET user_tags = $1 WHERE symbol = $2', [
          tags.length > 0 ? JSON.stringify(tags) : null,
          symbol
        ]);
      }
      updated = symbols.length;
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('Error bulk updating classifications:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
