// src/services/notes/thesisService.js
// Investment thesis service for managing structured investment theses

class ThesisService {
  constructor(db, notesService) {
    this.db = db;
    this.notesService = notesService;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Thesis CRUD
      getAllTheses: this.db.prepare(`
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
      `),

      getThesesByStatus: this.db.prepare(`
        SELECT t.*, n.title, n.content, n.status as note_status,
          c.name as company_name, c.sector, c.industry,
          (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_assumptions,
          (SELECT COUNT(*) FROM thesis_catalysts WHERE thesis_id = t.id AND status = 'pending') as pending_catalysts
        FROM investment_theses t
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE t.thesis_status = ? AND n.deleted_at IS NULL
        ORDER BY t.updated_at DESC
      `),

      getThesesBySymbol: this.db.prepare(`
        SELECT t.*, n.title, n.content, n.status as note_status,
          c.name as company_name, c.sector, c.industry,
          (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_assumptions
        FROM investment_theses t
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE t.symbol = ? AND n.deleted_at IS NULL
        ORDER BY t.updated_at DESC
      `),

      getThesis: this.db.prepare(`
        SELECT t.*, n.title, n.content, n.excerpt, n.status as note_status,
          n.notebook_id, n.created_at as note_created_at, n.updated_at as note_updated_at,
          c.name as company_name, c.sector, c.industry, c.market_cap
        FROM investment_theses t
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE t.id = ?
      `),

      getThesisByNoteId: this.db.prepare(`
        SELECT * FROM investment_theses WHERE note_id = ?
      `),

      createThesis: this.db.prepare(`
        INSERT INTO investment_theses (
          note_id, symbol, company_id, thesis_type, conviction_level,
          target_price, stop_loss_price, entry_price, current_price,
          time_horizon_months, review_date, template_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateThesis: this.db.prepare(`
        UPDATE investment_theses
        SET thesis_type = COALESCE(?, thesis_type),
            conviction_level = COALESCE(?, conviction_level),
            target_price = COALESCE(?, target_price),
            stop_loss_price = COALESCE(?, stop_loss_price),
            entry_price = COALESCE(?, entry_price),
            current_price = COALESCE(?, current_price),
            time_horizon_months = COALESCE(?, time_horizon_months),
            review_date = COALESCE(?, review_date),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      updateThesisStatus: this.db.prepare(`
        UPDATE investment_theses
        SET thesis_status = ?,
            status_changed_at = CURRENT_TIMESTAMP,
            status_reason = ?,
            actual_return_pct = ?,
            outcome_notes = ?,
            closed_at = CASE WHEN ? IN ('closed', 'achieved', 'invalidated', 'expired') THEN CURRENT_TIMESTAMP ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      deleteThesis: this.db.prepare(`
        DELETE FROM investment_theses WHERE id = ?
      `),

      // Templates
      getAllTemplates: this.db.prepare(`
        SELECT * FROM thesis_templates ORDER BY is_default DESC, name ASC
      `),

      getTemplate: this.db.prepare(`
        SELECT * FROM thesis_templates WHERE id = ?
      `),

      // Assumptions
      getAssumptions: this.db.prepare(`
        SELECT * FROM thesis_assumptions
        WHERE thesis_id = ?
        ORDER BY importance DESC, sort_order ASC
      `),

      getAssumption: this.db.prepare(`
        SELECT * FROM thesis_assumptions WHERE id = ?
      `),

      createAssumption: this.db.prepare(`
        INSERT INTO thesis_assumptions (
          thesis_id, assumption_text, assumption_type, importance,
          validation_metric, validation_operator, validation_threshold,
          status, auto_validate, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateAssumption: this.db.prepare(`
        UPDATE thesis_assumptions
        SET assumption_text = COALESCE(?, assumption_text),
            assumption_type = COALESCE(?, assumption_type),
            importance = COALESCE(?, importance),
            validation_metric = COALESCE(?, validation_metric),
            validation_operator = COALESCE(?, validation_operator),
            validation_threshold = COALESCE(?, validation_threshold),
            auto_validate = COALESCE(?, auto_validate),
            sort_order = COALESCE(?, sort_order),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      updateAssumptionStatus: this.db.prepare(`
        UPDATE thesis_assumptions
        SET status = ?,
            current_value = ?,
            status_changed_at = CURRENT_TIMESTAMP,
            status_notes = ?,
            last_validated_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      deleteAssumption: this.db.prepare(`
        DELETE FROM thesis_assumptions WHERE id = ?
      `),

      // Catalysts
      getCatalysts: this.db.prepare(`
        SELECT * FROM thesis_catalysts
        WHERE thesis_id = ?
        ORDER BY expected_date ASC, sort_order ASC
      `),

      getCatalyst: this.db.prepare(`
        SELECT * FROM thesis_catalysts WHERE id = ?
      `),

      getUpcomingCatalysts: this.db.prepare(`
        SELECT tc.*, t.symbol, n.title as thesis_title, c.name as company_name
        FROM thesis_catalysts tc
        JOIN investment_theses t ON tc.thesis_id = t.id
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE tc.status = 'pending'
          AND tc.expected_date IS NOT NULL
          AND tc.expected_date >= date('now')
          AND n.deleted_at IS NULL
        ORDER BY tc.expected_date ASC
        LIMIT ?
      `),

      createCatalyst: this.db.prepare(`
        INSERT INTO thesis_catalysts (
          thesis_id, catalyst_text, catalyst_type, expected_date,
          expected_date_range, expected_impact, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `),

      updateCatalyst: this.db.prepare(`
        UPDATE thesis_catalysts
        SET catalyst_text = COALESCE(?, catalyst_text),
            catalyst_type = COALESCE(?, catalyst_type),
            expected_date = COALESCE(?, expected_date),
            expected_date_range = COALESCE(?, expected_date_range),
            expected_impact = COALESCE(?, expected_impact),
            sort_order = COALESCE(?, sort_order),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      updateCatalystStatus: this.db.prepare(`
        UPDATE thesis_catalysts
        SET status = ?,
            actual_date = ?,
            outcome = ?,
            outcome_notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      deleteCatalyst: this.db.prepare(`
        DELETE FROM thesis_catalysts WHERE id = ?
      `),

      // Dashboard queries
      getThesisSummary: this.db.prepare(`
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
      `),

      getBrokenAssumptionsTheses: this.db.prepare(`
        SELECT t.id, t.symbol, n.title, c.name as company_name,
          (SELECT COUNT(*) FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken') as broken_count
        FROM investment_theses t
        JOIN notes n ON t.note_id = n.id
        LEFT JOIN companies c ON t.company_id = c.id
        WHERE t.thesis_status = 'active'
          AND n.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM thesis_assumptions WHERE thesis_id = t.id AND status = 'broken')
        ORDER BY broken_count DESC
      `),

      // Company lookup
      getCompanyBySymbol: this.db.prepare(`
        SELECT id, symbol, name, sector, industry, market_cap FROM companies WHERE symbol = ? COLLATE NOCASE
      `),

      // Current price lookup
      getLatestPrice: this.db.prepare(`
        SELECT close as price FROM daily_prices
        WHERE company_id = ?
        ORDER BY date DESC
        LIMIT 1
      `),

      // Activity logging
      logActivity: this.db.prepare(`
        INSERT INTO note_activity_log (note_id, notebook_id, thesis_id, action, action_details)
        VALUES (?, ?, ?, ?, ?)
      `)
    };
  }

  // ============================================
  // Thesis CRUD
  // ============================================

  getAllTheses() {
    return this.stmts.getAllTheses.all().map(this._formatThesis);
  }

  getThesesByStatus(status) {
    return this.stmts.getThesesByStatus.all(status).map(this._formatThesis);
  }

  getThesesBySymbol(symbol) {
    return this.stmts.getThesesBySymbol.all(symbol.toUpperCase()).map(this._formatThesis);
  }

  getActiveThesisForSymbol(symbol) {
    const theses = this.getThesesBySymbol(symbol);
    return theses.find(t => t.thesis_status === 'active') || null;
  }

  getThesis(thesisId) {
    const thesis = this.stmts.getThesis.get(thesisId);
    if (!thesis) return null;

    const assumptions = this.stmts.getAssumptions.all(thesisId);
    const catalysts = this.stmts.getCatalysts.all(thesisId);

    return {
      ...this._formatThesis(thesis),
      assumptions,
      catalysts
    };
  }

  createThesis({
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
    // Get the thesis notebook
    const thesisNotebook = this.db.prepare(
      "SELECT id FROM notebooks WHERE notebook_type = 'thesis' LIMIT 1"
    ).get();

    if (!thesisNotebook) {
      throw new Error('Thesis notebook not found');
    }

    // Look up company
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    const companyId = company?.id || null;

    // Get current price
    let currentPrice = null;
    if (companyId) {
      const priceResult = this.stmts.getLatestPrice.get(companyId);
      currentPrice = priceResult?.price || null;
    }

    // Create the note first
    const noteResult = this.notesService.createNote({
      notebookId: thesisNotebook.id,
      title,
      content,
      noteType: 'thesis',
      status: 'published',
      symbols: [symbol]
    });

    // Create the thesis
    const thesisResult = this.stmts.createThesis.run(
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
    );

    const thesisId = thesisResult.lastInsertRowid;

    // Add assumptions
    for (let i = 0; i < assumptions.length; i++) {
      const a = assumptions[i];
      this.stmts.createAssumption.run(
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
      );
    }

    // Add catalysts
    for (let i = 0; i < catalysts.length; i++) {
      const c = catalysts[i];
      this.stmts.createCatalyst.run(
        thesisId,
        c.text,
        c.type || null,
        c.expectedDate || null,
        c.expectedDateRange || null,
        c.expectedImpact || 'medium',
        i
      );
    }

    this._logActivity(noteResult.noteId, thesisNotebook.id, thesisId, 'thesis_created', { symbol, title });

    return { success: true, thesisId, noteId: noteResult.noteId };
  }

  updateThesis(thesisId, {
    thesisType = null,
    convictionLevel = null,
    targetPrice = null,
    stopLossPrice = null,
    entryPrice = null,
    currentPrice = null,
    timeHorizonMonths = null,
    reviewDate = null
  }) {
    this.stmts.updateThesis.run(
      thesisType, convictionLevel, targetPrice, stopLossPrice,
      entryPrice, currentPrice, timeHorizonMonths, reviewDate, thesisId
    );

    const thesis = this.stmts.getThesis.get(thesisId);
    this._logActivity(thesis?.note_id, null, thesisId, 'thesis_updated', {});

    return { success: true, thesisId };
  }

  updateThesisStatus(thesisId, {
    status,
    reason = null,
    actualReturnPct = null,
    outcomeNotes = null
  }) {
    this.stmts.updateThesisStatus.run(
      status, reason, actualReturnPct, outcomeNotes, status, thesisId
    );

    const thesis = this.stmts.getThesis.get(thesisId);
    this._logActivity(thesis?.note_id, null, thesisId, 'thesis_status_changed', { status, reason });

    return { success: true, thesisId };
  }

  deleteThesis(thesisId) {
    const thesis = this.stmts.getThesis.get(thesisId);
    if (thesis) {
      // Delete the thesis (note will remain)
      this.stmts.deleteThesis.run(thesisId);
      this._logActivity(thesis.note_id, null, thesisId, 'thesis_deleted', {});
    }
    return { success: true, thesisId };
  }

  // ============================================
  // Templates
  // ============================================

  getAllTemplates() {
    return this.stmts.getAllTemplates.all().map(t => ({
      ...t,
      sections: JSON.parse(t.sections)
    }));
  }

  getTemplate(templateId) {
    const template = this.stmts.getTemplate.get(templateId);
    if (!template) return null;
    return {
      ...template,
      sections: JSON.parse(template.sections)
    };
  }

  // ============================================
  // Assumptions
  // ============================================

  getAssumptions(thesisId) {
    return this.stmts.getAssumptions.all(thesisId);
  }

  addAssumption(thesisId, {
    text,
    type = null,
    importance = 'medium',
    validationMetric = null,
    validationOperator = null,
    validationThreshold = null,
    autoValidate = false
  }) {
    const existing = this.stmts.getAssumptions.all(thesisId);
    const sortOrder = existing.length;

    const result = this.stmts.createAssumption.run(
      thesisId, text, type, importance,
      validationMetric, validationOperator, validationThreshold,
      'valid', autoValidate ? 1 : 0, sortOrder
    );

    return { success: true, assumptionId: result.lastInsertRowid };
  }

  updateAssumption(assumptionId, {
    text = null,
    type = null,
    importance = null,
    validationMetric = null,
    validationOperator = null,
    validationThreshold = null,
    autoValidate = null,
    sortOrder = null
  }) {
    this.stmts.updateAssumption.run(
      text, type, importance, validationMetric,
      validationOperator, validationThreshold,
      autoValidate !== null ? (autoValidate ? 1 : 0) : null,
      sortOrder, assumptionId
    );
    return { success: true, assumptionId };
  }

  updateAssumptionStatus(assumptionId, {
    status,
    currentValue = null,
    notes = null
  }) {
    this.stmts.updateAssumptionStatus.run(status, currentValue, notes, assumptionId);

    const assumption = this.stmts.getAssumption.get(assumptionId);
    if (assumption) {
      const thesis = this.stmts.getThesis.get(assumption.thesis_id);
      this._logActivity(thesis?.note_id, null, assumption.thesis_id, 'assumption_status_changed', {
        assumptionId, status
      });
    }

    return { success: true, assumptionId };
  }

  deleteAssumption(assumptionId) {
    this.stmts.deleteAssumption.run(assumptionId);
    return { success: true, assumptionId };
  }

  // ============================================
  // Catalysts
  // ============================================

  getCatalysts(thesisId) {
    return this.stmts.getCatalysts.all(thesisId);
  }

  getUpcomingCatalysts(limit = 20) {
    return this.stmts.getUpcomingCatalysts.all(limit);
  }

  addCatalyst(thesisId, {
    text,
    type = null,
    expectedDate = null,
    expectedDateRange = null,
    expectedImpact = 'medium'
  }) {
    const existing = this.stmts.getCatalysts.all(thesisId);
    const sortOrder = existing.length;

    const result = this.stmts.createCatalyst.run(
      thesisId, text, type, expectedDate, expectedDateRange, expectedImpact, sortOrder
    );

    return { success: true, catalystId: result.lastInsertRowid };
  }

  updateCatalyst(catalystId, {
    text = null,
    type = null,
    expectedDate = null,
    expectedDateRange = null,
    expectedImpact = null,
    sortOrder = null
  }) {
    this.stmts.updateCatalyst.run(
      text, type, expectedDate, expectedDateRange, expectedImpact, sortOrder, catalystId
    );
    return { success: true, catalystId };
  }

  updateCatalystStatus(catalystId, {
    status,
    actualDate = null,
    outcome = null,
    outcomeNotes = null
  }) {
    this.stmts.updateCatalystStatus.run(status, actualDate, outcome, outcomeNotes, catalystId);

    const catalyst = this.stmts.getCatalyst.get(catalystId);
    if (catalyst) {
      const thesis = this.stmts.getThesis.get(catalyst.thesis_id);
      this._logActivity(thesis?.note_id, null, catalyst.thesis_id, 'catalyst_status_changed', {
        catalystId, status, outcome
      });
    }

    return { success: true, catalystId };
  }

  deleteCatalyst(catalystId) {
    this.stmts.deleteCatalyst.run(catalystId);
    return { success: true, catalystId };
  }

  // ============================================
  // Dashboard
  // ============================================

  getThesisDashboard() {
    const summary = this.stmts.getThesisSummary.get();
    const activeTheses = this.getThesesByStatus('active');
    const brokenAssumptions = this.stmts.getBrokenAssumptionsTheses.all();
    const upcomingCatalysts = this.getUpcomingCatalysts(10);

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

  _logActivity(noteId, notebookId, thesisId, action, details) {
    try {
      this.stmts.logActivity.run(
        noteId, notebookId, thesisId, action, JSON.stringify(details)
      );
    } catch (e) {
      console.error('Failed to log activity:', e);
    }
  }
}

function getThesisService(db, notesService) {
  return new ThesisService(db, notesService);
}

module.exports = { ThesisService, getThesisService };
