// src/services/notes/thesisService.js
// Investment thesis service for managing structured investment theses

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class ThesisService {
  constructor(notesService) {
    // No db parameter needed - using getDatabaseAsync()
    this.notesService = notesService;
  }

  // ============================================
  // Thesis CRUD
  // ============================================

  async getAllTheses() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT t.*, n.title, n.content, n.status as note_status, n.created_at as note_created_at,
        c.name as company_name, c.sector, c.industry,
        (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id) as assumptions_count,
        (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_assumptions,
        (SELECT COUNT(*) FROM thesis_catalysts WHERE thesis_id = t.id) as catalysts_count,
        (SELECT COUNT(*) FROM thesis_catalysts WHERE thesis_id = t.id AND status = 'pending') as pending_catalysts
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE n.deleted_at IS NULL
      ORDER BY t.updated_at DESC
    `);
    return result.rows.map(this._formatThesis);
  }

  async getThesesByStatus(status) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT t.*, n.title, n.content, n.status as note_status,
        c.name as company_name, c.sector, c.industry,
        (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_assumptions,
        (SELECT COUNT(*) FROM thesis_catalysts WHERE thesis_id = t.id AND status = 'pending') as pending_catalysts
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.thesis_status = $1 AND n.deleted_at IS NULL
      ORDER BY t.updated_at DESC
    `, [status]);
    return result.rows.map(this._formatThesis);
  }

  async getThesesBySymbol(symbol) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT t.*, n.title, n.content, n.status as note_status,
        c.name as company_name, c.sector, c.industry,
        (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_assumptions
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.symbol = $1 AND n.deleted_at IS NULL
      ORDER BY t.updated_at DESC
    `, [symbol.toUpperCase()]);
    return result.rows.map(this._formatThesis);
  }

  async getActiveThesisForSymbol(symbol) {
    const theses = await this.getThesesBySymbol(symbol);
    return theses.find(t => t.thesis_status === 'active') || null;
  }

  async getThesis(thesisId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
        n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
        c.name as company_name, c.sector, c.industry, c.market_cap
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.id = $1
    `, [thesisId]);
    const thesis = result.rows[0];
    if (!thesis) return null;

    const assumptionsResult = await database.query(`
      SELECT * FROM thesis_assumptions
      WHERE thesis_id = $1
      ORDER BY importance DESC, sort_order ASC
    `, [thesisId]);

    const catalystsResult = await database.query(`
      SELECT * FROM thesis_catalysts
      WHERE thesis_id = $1
      ORDER BY expected_date ASC, sort_order ASC
    `, [thesisId]);

    return {
      ...this._formatThesis(thesis),
      assumptions: assumptionsResult.rows,
      catalysts: catalystsResult.rows
    };
  }

  async getThesisByNoteId(noteId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM investment_theses WHERE note_id = $1
    `, [noteId]);
    return result.rows[0];
  }

  async createThesis({
    symbol,
    title,
    content = '',
    thesisType = 'long',
    convictionLevel = 3,
    targetPrice = null,
    stopLossPrice = null,
    entryPrice = null,
    timeHorizonMonths = 12,
    reviewDate = null,
    templateId = 'long-standard',
    assumptions = [],
    catalysts = []
  }) {
    const database = await getDatabaseAsync();

    // Get the thesis notebook
    const thesisNotebookResult = await database.query(
      "SELECT id FROM notebooks WHERE notebook_type = 'thesis' LIMIT 1"
    );
    const thesisNotebook = thesisNotebookResult.rows[0];

    if (!thesisNotebook) {
      throw new Error('Thesis notebook not found');
    }

    // Look up company
    const companyResult = await database.query(`
      SELECT id, symbol, name, sector, industry, market_cap FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);
    const company = companyResult.rows[0];
    const companyId = company?.id || null;

    // Get current price
    let currentPrice = null;
    if (companyId) {
      const priceResult = await database.query(`
        SELECT close as price FROM daily_prices
        WHERE company_id = $1
        ORDER BY date DESC
        LIMIT 1
      `, [companyId]);
      currentPrice = priceResult.rows[0]?.price || null;
    }

    // Create the note first
    const noteResult = await this.notesService.createNote({
      notebookId: thesisNotebook.id,
      title,
      content,
      noteType: 'thesis',
      status: 'published',
      symbols: [symbol]
    });

    // Create the thesis
    const thesisResult = await database.query(`
      INSERT INTO investment_theses (
        note_id, symbol, company_id, thesis_type, conviction_level,
        target_price, stop_loss_price, entry_price, current_price,
        time_horizon_months, review_date, template_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      noteResult.noteId,
      symbol.toUpperCase(),
      companyId,
      thesisType,
      convictionLevel,
      targetPrice,
      stopLossPrice,
      entryPrice,
      currentPrice,
      timeHorizonMonths,
      reviewDate,
      templateId
    ]);

    const thesisId = thesisResult.rows[0].id;

    // Add assumptions
    for (let i = 0; i < assumptions.length; i++) {
      const a = assumptions[i];
      await database.query(`
        INSERT INTO thesis_assumptions (
          thesis_id, assumption_text, assumption_type, importance,
          validation_metric, validation_operator, validation_threshold,
          status, auto_validate, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        thesisId,
        a.text,
        a.type || null,
        a.importance || 'medium',
        a.validationMetric || null,
        a.validationOperator || null,
        a.validationThreshold || null,
        'valid',
        a.autoValidate ? 1 : 0,
        i
      ]);
    }

    // Add catalysts
    for (let i = 0; i < catalysts.length; i++) {
      const c = catalysts[i];
      await database.query(`
        INSERT INTO thesis_catalysts (
          thesis_id, catalyst_text, catalyst_type, expected_date,
          expected_date_range, expected_impact, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        thesisId,
        c.text,
        c.type || null,
        c.expectedDate || null,
        c.expectedDateRange || null,
        c.expectedImpact || 'medium',
        i
      ]);
    }

    await this._logActivity(noteResult.noteId, thesisNotebook.id, thesisId, 'thesis_created', { symbol, title });

    return { success: true, thesisId, noteId: noteResult.noteId };
  }

  async updateThesis(thesisId, {
    thesisType = null,
    convictionLevel = null,
    targetPrice = null,
    stopLossPrice = null,
    entryPrice = null,
    currentPrice = null,
    timeHorizonMonths = null,
    reviewDate = null
  }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE investment_theses
      SET thesis_type = COALESCE($1, thesis_type),
          conviction_level = COALESCE($2, conviction_level),
          target_price = COALESCE($3, target_price),
          stop_loss_price = COALESCE($4, stop_loss_price),
          entry_price = COALESCE($5, entry_price),
          current_price = COALESCE($6, current_price),
          time_horizon_months = COALESCE($7, time_horizon_months),
          review_date = COALESCE($8, review_date),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [
      thesisType, convictionLevel, targetPrice, stopLossPrice,
      entryPrice, currentPrice, timeHorizonMonths, reviewDate, thesisId
    ]);

    const thesisResult = await database.query(`
      SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
        n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
        c.name as company_name, c.sector, c.industry, c.market_cap
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.id = $1
    `, [thesisId]);
    const thesis = thesisResult.rows[0];
    await this._logActivity(thesis?.note_id, null, thesisId, 'thesis_updated', {});

    return { success: true, thesisId };
  }

  async updateThesisStatus(thesisId, {
    status,
    reason = null,
    actualReturnPct = null,
    outcomeNotes = null
  }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE investment_theses
      SET thesis_status = $1,
          status_changed_at = CURRENT_TIMESTAMP,
          status_reason = $2,
          actual_return_pct = $3,
          outcome_notes = $4,
          closed_at = CASE WHEN $5 IN ('closed', 'achieved', 'invalidated', 'expired') THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [status, reason, actualReturnPct, outcomeNotes, status, thesisId]);

    const thesisResult = await database.query(`
      SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
        n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
        c.name as company_name, c.sector, c.industry, c.market_cap
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.id = $1
    `, [thesisId]);
    const thesis = thesisResult.rows[0];
    await this._logActivity(thesis?.note_id, null, thesisId, 'thesis_status_changed', { status, reason });

    return { success: true, thesisId };
  }

  async deleteThesis(thesisId) {
    const database = await getDatabaseAsync();
    const thesisResult = await database.query(`
      SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
        n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
        c.name as company_name, c.sector, c.industry, c.market_cap
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.id = $1
    `, [thesisId]);
    const thesis = thesisResult.rows[0];

    if (thesis) {
      // Delete the thesis (note will remain)
      await database.query(`
        DELETE FROM investment_theses WHERE id = $1
      `, [thesisId]);
      await this._logActivity(thesis.note_id, null, thesisId, 'thesis_deleted', {});
    }
    return { success: true, thesisId };
  }

  // ============================================
  // Templates
  // ============================================

  async getAllTemplates() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM thesis_templates ORDER BY is_default DESC, name ASC
    `);
    return result.rows.map(t => ({
      ...t,
      sections: JSON.parse(t.sections)
    }));
  }

  async getTemplate(templateId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM thesis_templates WHERE id = $1
    `, [templateId]);
    const template = result.rows[0];
    if (!template) return null;
    return {
      ...template,
      sections: JSON.parse(template.sections)
    };
  }

  // ============================================
  // Assumptions
  // ============================================

  async getAssumptions(thesisId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM thesis_assumptions
      WHERE thesis_id = $1
      ORDER BY importance DESC, sort_order ASC
    `, [thesisId]);
    return result.rows;
  }

  async addAssumption(thesisId, {
    text,
    type = null,
    importance = 'medium',
    validationMetric = null,
    validationOperator = null,
    validationThreshold = null,
    autoValidate = false
  }) {
    const database = await getDatabaseAsync();
    const existingResult = await database.query(`
      SELECT * FROM thesis_assumptions
      WHERE thesis_id = $1
      ORDER BY importance DESC, sort_order ASC
    `, [thesisId]);
    const existing = existingResult.rows;
    const sortOrder = existing.length;

    const result = await database.query(`
      INSERT INTO thesis_assumptions (
        thesis_id, assumption_text, assumption_type, importance,
        validation_metric, validation_operator, validation_threshold,
        status, auto_validate, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      thesisId, text, type, importance,
      validationMetric, validationOperator, validationThreshold,
      'valid', autoValidate ? 1 : 0, sortOrder
    ]);

    return { success: true, assumptionId: result.rows[0].id };
  }

  async updateAssumption(assumptionId, {
    text = null,
    type = null,
    importance = null,
    validationMetric = null,
    validationOperator = null,
    validationThreshold = null,
    autoValidate = null,
    sortOrder = null
  }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE thesis_assumptions
      SET assumption_text = COALESCE($1, assumption_text),
          assumption_type = COALESCE($2, assumption_type),
          importance = COALESCE($3, importance),
          validation_metric = COALESCE($4, validation_metric),
          validation_operator = COALESCE($5, validation_operator),
          validation_threshold = COALESCE($6, validation_threshold),
          auto_validate = COALESCE($7, auto_validate),
          sort_order = COALESCE($8, sort_order),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
    `, [
      text, type, importance, validationMetric,
      validationOperator, validationThreshold,
      autoValidate !== null ? (autoValidate ? 1 : 0) : null,
      sortOrder, assumptionId
    ]);
    return { success: true, assumptionId };
  }

  async updateAssumptionStatus(assumptionId, {
    status,
    currentValue = null,
    notes = null
  }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE thesis_assumptions
      SET status = $1,
          current_value = $2,
          status_changed_at = CURRENT_TIMESTAMP,
          status_notes = $3,
          last_validated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [status, currentValue, notes, assumptionId]);

    const assumptionResult = await database.query(`
      SELECT * FROM thesis_assumptions WHERE id = $1
    `, [assumptionId]);
    const assumption = assumptionResult.rows[0];

    if (assumption) {
      const thesisResult = await database.query(`
        SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
          n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
          c.name as company_name, c.sector, c.industry, c.market_cap
        FROM investment_theses t
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE t.id = $1
      `, [assumption.thesis_id]);
      const thesis = thesisResult.rows[0];

      await this._logActivity(thesis?.note_id, null, assumption.thesis_id, 'assumption_status_changed', {
        assumptionId, status
      });
    }

    return { success: true, assumptionId };
  }

  async deleteAssumption(assumptionId) {
    const database = await getDatabaseAsync();
    await database.query(`
      DELETE FROM thesis_assumptions WHERE id = $1
    `, [assumptionId]);
    return { success: true, assumptionId };
  }

  // ============================================
  // Catalysts
  // ============================================

  async getCatalysts(thesisId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM thesis_catalysts
      WHERE thesis_id = $1
      ORDER BY expected_date ASC, sort_order ASC
    `, [thesisId]);
    return result.rows;
  }

  async getUpcomingCatalysts(limit = 20) {
    const database = await getDatabaseAsync();
    const dateFunc = isUsingPostgres() ? "CURRENT_DATE" : "date('now')";
    const result = await database.query(`
      SELECT tc.*, t.symbol, n.title as thesis_title, c.name as company_name
      FROM thesis_catalysts tc
      JOIN investment_theses t ON tc.thesis_id = t.id
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE tc.status = 'pending'
        AND tc.expected_date IS NOT NULL
        AND tc.expected_date >= ${dateFunc}
        AND n.deleted_at IS NULL
      ORDER BY tc.expected_date ASC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  async addCatalyst(thesisId, {
    text,
    type = null,
    expectedDate = null,
    expectedDateRange = null,
    expectedImpact = 'medium'
  }) {
    const database = await getDatabaseAsync();
    const existingResult = await database.query(`
      SELECT * FROM thesis_catalysts
      WHERE thesis_id = $1
      ORDER BY expected_date ASC, sort_order ASC
    `, [thesisId]);
    const existing = existingResult.rows;
    const sortOrder = existing.length;

    const result = await database.query(`
      INSERT INTO thesis_catalysts (
        thesis_id, catalyst_text, catalyst_type, expected_date,
        expected_date_range, expected_impact, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [thesisId, text, type, expectedDate, expectedDateRange, expectedImpact, sortOrder]);

    return { success: true, catalystId: result.rows[0].id };
  }

  async updateCatalyst(catalystId, {
    text = null,
    type = null,
    expectedDate = null,
    expectedDateRange = null,
    expectedImpact = null,
    sortOrder = null
  }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE thesis_catalysts
      SET catalyst_text = COALESCE($1, catalyst_text),
          catalyst_type = COALESCE($2, catalyst_type),
          expected_date = COALESCE($3, expected_date),
          expected_date_range = COALESCE($4, expected_date_range),
          expected_impact = COALESCE($5, expected_impact),
          sort_order = COALESCE($6, sort_order),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [text, type, expectedDate, expectedDateRange, expectedImpact, sortOrder, catalystId]);
    return { success: true, catalystId };
  }

  async updateCatalystStatus(catalystId, {
    status,
    actualDate = null,
    outcome = null,
    outcomeNotes = null
  }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE thesis_catalysts
      SET status = $1,
          actual_date = $2,
          outcome = $3,
          outcome_notes = $4,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [status, actualDate, outcome, outcomeNotes, catalystId]);

    const catalystResult = await database.query(`
      SELECT * FROM thesis_catalysts WHERE id = $1
    `, [catalystId]);
    const catalyst = catalystResult.rows[0];

    if (catalyst) {
      const thesisResult = await database.query(`
        SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
          n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
          c.name as company_name, c.sector, c.industry, c.market_cap
        FROM investment_theses t
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE t.id = $1
      `, [catalyst.thesis_id]);
      const thesis = thesisResult.rows[0];

      await this._logActivity(thesis?.note_id, null, catalyst.thesis_id, 'catalyst_status_changed', {
        catalystId, status, outcome
      });
    }

    return { success: true, catalystId };
  }

  async deleteCatalyst(catalystId) {
    const database = await getDatabaseAsync();
    await database.query(`
      DELETE FROM thesis_catalysts WHERE id = $1
    `, [catalystId]);
    return { success: true, catalystId };
  }

  // ============================================
  // Dashboard
  // ============================================

  async getThesisDashboard() {
    const database = await getDatabaseAsync();

    const summaryResult = await database.query(`
      SELECT
        COUNT(*) as total_theses,
        SUM(CASE WHEN thesis_status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN thesis_status = 'achieved' THEN 1 ELSE 0 END) as achieved_count,
        SUM(CASE WHEN thesis_status = 'invalidated' THEN 1 ELSE 0 END) as invalidated_count,
        SUM(CASE WHEN thesis_status = 'closed' THEN 1 ELSE 0 END) as closed_count,
        SUM(CASE WHEN thesis_type = 'long' THEN 1 ELSE 0 END) as long_count,
        SUM(CASE WHEN thesis_type = 'short' THEN 1 ELSE 0 END) as short_count
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      WHERE n.deleted_at IS NULL
    `);
    const summary = summaryResult.rows[0];

    const activeTheses = await this.getThesesByStatus('active');

    const brokenAssumptionsResult = await database.query(`
      SELECT t.id, t.symbol, n.title, c.name as company_name,
        (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_count
      FROM investment_theses t
      JOIN notes n ON t.note_id = n.id
      LEFT JOIN companies c ON t.company_id = c.id
      WHERE t.thesis_status = 'active'
        AND n.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken')
      ORDER BY broken_count DESC
    `);
    const brokenAssumptions = brokenAssumptionsResult.rows;

    const upcomingCatalysts = await this.getUpcomingCatalysts(10);

    return {
      summary,
      activeTheses: activeTheses.slice(0, 10),
      thesesWithBrokenAssumptions: brokenAssumptions,
      upcomingCatalysts
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  _formatThesis(thesis) {
    return {
      ...thesis,
      upside: thesis.target_price && thesis.current_price
        ? ((thesis.target_price - thesis.current_price) / thesis.current_price * 100).toFixed(1)
        : null,
      downside: thesis.stop_loss_price && thesis.current_price
        ? ((thesis.current_price - thesis.stop_loss_price) / thesis.current_price * 100).toFixed(1)
        : null
    };
  }

  async _logActivity(noteId, notebookId, thesisId, action, details) {
    try {
      const database = await getDatabaseAsync();
      await database.query(`
        INSERT INTO note_activity_log (note_id, notebook_id, thesis_id, action, action_details)
        VALUES ($1, $2, $3, $4, $5)
      `, [noteId, notebookId, thesisId, action, JSON.stringify(details)]);
    } catch (e) {
      console.error('Failed to log activity:', e);
    }
  }
}

function getThesisService(notesService) {
  return new ThesisService(notesService);
}

module.exports = { ThesisService, getThesisService };
