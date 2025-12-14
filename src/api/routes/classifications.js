// src/api/routes/classifications.js
const express = require('express');
const router = express.Router();
const db = require('../../database');

const database = db.getDatabase();

/**
 * GET /api/classifications
 * Get all custom classification definitions
 */
router.get('/', (req, res) => {
  try {
    const { type } = req.query;

    let sql = 'SELECT * FROM custom_classifications';
    const params = [];

    if (type) {
      sql += ' WHERE type = ?';
      params.push(type);
    }

    sql += ' ORDER BY type, name';

    const classifications = database.prepare(sql).all(...params);

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
router.post('/', (req, res) => {
  try {
    const { type, name, description, parent_name, color } = req.body;

    if (!type || !name) {
      return res.status(400).json({ error: 'type and name are required' });
    }

    if (!['sector', 'industry', 'subsector', 'tag'].includes(type)) {
      return res.status(400).json({ error: 'type must be sector, industry, subsector, or tag' });
    }

    const stmt = database.prepare(`
      INSERT INTO custom_classifications (type, name, description, parent_name, color)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(type, name, description || null, parent_name || null, color || null);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      classification: { id: result.lastInsertRowid, type, name, description, parent_name, color }
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
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
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parent_name, color } = req.body;

    const stmt = database.prepare(`
      UPDATE custom_classifications
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          parent_name = ?,
          color = COALESCE(?, color),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(name, description, parent_name, color, id);

    if (result.changes === 0) {
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
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const result = database.prepare('DELETE FROM custom_classifications WHERE id = ?').run(id);

    if (result.changes === 0) {
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
router.get('/company/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;

    const company = database.prepare(`
      SELECT symbol, name, sector, industry, user_sector, user_industry, user_subsector, user_tags
      FROM companies
      WHERE symbol = ?
    `).get(symbol);

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
router.put('/company/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { user_sector, user_industry, user_subsector, user_tags } = req.body;

    // Convert tags array to JSON
    const tagsJson = user_tags ? JSON.stringify(user_tags) : null;

    const stmt = database.prepare(`
      UPDATE companies
      SET user_sector = ?,
          user_industry = ?,
          user_subsector = ?,
          user_tags = ?
      WHERE symbol = ?
    `);

    const result = stmt.run(
      user_sector || null,
      user_industry || null,
      user_subsector || null,
      tagsJson,
      symbol
    );

    if (result.changes === 0) {
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
router.post('/company/:symbol/tags', (req, res) => {
  try {
    const { symbol } = req.params;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'tag is required' });
    }

    // Get current tags
    const company = database.prepare('SELECT user_tags FROM companies WHERE symbol = ?').get(symbol);

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
    database.prepare('UPDATE companies SET user_tags = ? WHERE symbol = ?')
      .run(JSON.stringify(tags), symbol);

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
router.delete('/company/:symbol/tags/:tag', (req, res) => {
  try {
    const { symbol, tag } = req.params;

    // Get current tags
    const company = database.prepare('SELECT user_tags FROM companies WHERE symbol = ?').get(symbol);

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
    database.prepare('UPDATE companies SET user_tags = ? WHERE symbol = ?')
      .run(tags.length > 0 ? JSON.stringify(tags) : null, symbol);

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
router.get('/companies', (req, res) => {
  try {
    const { user_sector, user_industry, user_subsector, tag, limit = 100 } = req.query;

    let sql = `
      SELECT c.symbol, c.name, c.sector, c.industry, c.user_sector, c.user_industry, c.user_subsector, c.user_tags
      FROM companies c
      WHERE 1=1
    `;
    const params = [];

    if (user_sector) {
      sql += ' AND c.user_sector = ?';
      params.push(user_sector);
    }

    if (user_industry) {
      sql += ' AND c.user_industry = ?';
      params.push(user_industry);
    }

    if (user_subsector) {
      sql += ' AND c.user_subsector = ?';
      params.push(user_subsector);
    }

    if (tag) {
      sql += " AND c.user_tags LIKE ?";
      params.push(`%"${tag}"%`);
    }

    sql += ' LIMIT ?';
    params.push(parseInt(limit));

    const companies = database.prepare(sql).all(...params);

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
router.post('/bulk', (req, res) => {
  try {
    const { symbols, user_sector, user_industry, user_subsector, add_tags, remove_tags } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    const updateParts = [];
    const params = [];

    if (user_sector !== undefined) {
      updateParts.push('user_sector = ?');
      params.push(user_sector || null);
    }

    if (user_industry !== undefined) {
      updateParts.push('user_industry = ?');
      params.push(user_industry || null);
    }

    if (user_subsector !== undefined) {
      updateParts.push('user_subsector = ?');
      params.push(user_subsector || null);
    }

    // Handle bulk updates for sector/industry/subsector
    let updated = 0;
    if (updateParts.length > 0) {
      const placeholders = symbols.map(() => '?').join(',');
      const sql = `
        UPDATE companies
        SET ${updateParts.join(', ')}
        WHERE symbol IN (${placeholders})
      `;
      const result = database.prepare(sql).run(...params, ...symbols);
      updated = result.changes;
    }

    // Handle tags separately (need to merge with existing)
    if (add_tags || remove_tags) {
      for (const symbol of symbols) {
        const company = database.prepare('SELECT user_tags FROM companies WHERE symbol = ?').get(symbol);
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

        database.prepare('UPDATE companies SET user_tags = ? WHERE symbol = ?')
          .run(tags.length > 0 ? JSON.stringify(tags) : null, symbol);
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
