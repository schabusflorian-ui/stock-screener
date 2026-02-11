// src/api/routes/theses.js
// API routes for investment theses management

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const { createNotesServices } = require('../../services/notes');

// Middleware to get notes services (async)
const getServices = async (req) => {
  const db = await getDatabaseAsync();
  return createNotesServices(db);
};

// ============================================
// Dashboard Routes
// ============================================

// GET /api/theses/dashboard - Get thesis dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const dashboard = await thesis.getThesisDashboard();

    res.json({
      success: true,
      dashboard
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Template Routes
// ============================================

// GET /api/theses/templates - List all templates
router.get('/templates', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const templates = await thesis.getAllTemplates();

    res.json({
      success: true,
      count: templates.length,
      templates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/theses/templates/:id - Get specific template
router.get('/templates/:id', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const templateId = req.params.id;

    const template = await thesis.getTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Catalyst Routes
// ============================================

// GET /api/theses/catalysts/upcoming - Get upcoming catalysts across all theses
router.get('/catalysts/upcoming', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const { limit = 20 } = req.query;

    const catalysts = await thesis.getUpcomingCatalysts(parseInt(limit));

    res.json({
      success: true,
      count: catalysts.length,
      catalysts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Company Thesis Routes
// ============================================

// GET /api/theses/company/:symbol - Get theses for a company
router.get('/company/:symbol', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const symbol = req.params.symbol.toUpperCase();

    const theses = thesis.getThesesBySymbol(symbol);
    const activeThesis = thesis.getActiveThesisForSymbol(symbol);

    res.json({
      success: true,
      symbol,
      theses,
      activeThesis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Thesis CRUD Routes
// ============================================

// GET /api/theses - List all theses
router.get('/', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const { status } = req.query;

    let theses;
    if (status) {
      theses = thesis.getThesesByStatus(status);
    } else {
      theses = thesis.getAllTheses();
    }

    res.json({
      success: true,
      count: theses.length,
      theses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/theses/:id - Get a specific thesis
router.get('/:id', async (req, res) => {
  try {
    const { thesis, snapshot } = await getServices(req);
    const thesisId = parseInt(req.params.id);

    const thesisData = thesis.getThesis(thesisId);
    if (!thesisData) {
      return res.status(404).json({ error: 'Thesis not found' });
    }

    // Get snapshots for the thesis note
    const snapshots = snapshot.getSnapshotsByNote(thesisData.note_id);

    res.json({
      success: true,
      thesis: {
        ...thesisData,
        snapshots
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/theses - Create a new thesis
router.post('/', async (req, res) => {
  try {
    const { thesis, snapshot } = await getServices(req);
    const {
      symbol,
      title,
      content,
      thesisType,
      convictionLevel,
      targetPrice,
      stopLossPrice,
      entryPrice,
      timeHorizonMonths,
      reviewDate,
      templateId,
      assumptions = [],
      catalysts = [],
      captureSnapshot = true
    } = req.body;

    if (!symbol || !title) {
      return res.status(400).json({ error: 'symbol and title are required' });
    }

    const result = thesis.createThesis({
      symbol,
      title,
      content,
      thesisType,
      convictionLevel,
      targetPrice: targetPrice ? parseFloat(targetPrice) : null,
      stopLossPrice: stopLossPrice ? parseFloat(stopLossPrice) : null,
      entryPrice: entryPrice ? parseFloat(entryPrice) : null,
      timeHorizonMonths: timeHorizonMonths ? parseInt(timeHorizonMonths) : null,
      reviewDate,
      templateId,
      assumptions,
      catalysts
    });

    // Capture snapshot
    if (captureSnapshot) {
      snapshot.captureSnapshot(result.noteId, symbol);
    }

    const thesisData = thesis.getThesis(result.thesisId);

    res.status(201).json({
      success: true,
      thesis: thesisData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/theses/:id - Update a thesis
router.put('/:id', async (req, res) => {
  try {
    const { thesis, notes } = await getServices(req);
    const thesisId = parseInt(req.params.id);
    const {
      title,
      content,
      thesisType,
      convictionLevel,
      targetPrice,
      stopLossPrice,
      entryPrice,
      currentPrice,
      timeHorizonMonths,
      reviewDate
    } = req.body;

    // Update thesis-specific fields
    thesis.updateThesis(thesisId, {
      thesisType,
      convictionLevel: convictionLevel ? parseInt(convictionLevel) : null,
      targetPrice: targetPrice !== undefined ? parseFloat(targetPrice) : null,
      stopLossPrice: stopLossPrice !== undefined ? parseFloat(stopLossPrice) : null,
      entryPrice: entryPrice !== undefined ? parseFloat(entryPrice) : null,
      currentPrice: currentPrice !== undefined ? parseFloat(currentPrice) : null,
      timeHorizonMonths: timeHorizonMonths ? parseInt(timeHorizonMonths) : null,
      reviewDate
    });

    // Update the underlying note if title/content provided
    const thesisData = thesis.getThesis(thesisId);
    if (title || content) {
      notes.updateNote(thesisData.note_id, { title, content });
    }

    const updatedThesis = thesis.getThesis(thesisId);

    res.json({
      success: true,
      thesis: updatedThesis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/theses/:id/status - Update thesis status
router.put('/:id/status', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const thesisId = parseInt(req.params.id);
    const { status, reason, actualReturnPct, outcomeNotes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    thesis.updateThesisStatus(thesisId, {
      status,
      reason,
      actualReturnPct: actualReturnPct ? parseFloat(actualReturnPct) : null,
      outcomeNotes
    });

    const updatedThesis = thesis.getThesis(thesisId);

    res.json({
      success: true,
      thesis: updatedThesis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/theses/:id - Delete a thesis
router.delete('/:id', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const thesisId = parseInt(req.params.id);

    thesis.deleteThesis(thesisId);

    res.json({
      success: true,
      thesisId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Assumption Routes
// ============================================

// GET /api/theses/:id/assumptions - Get assumptions for a thesis
router.get('/:id/assumptions', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const thesisId = parseInt(req.params.id);

    const assumptions = thesis.getAssumptions(thesisId);

    res.json({
      success: true,
      count: assumptions.length,
      assumptions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/theses/:id/assumptions - Add assumption
router.post('/:id/assumptions', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const thesisId = parseInt(req.params.id);
    const {
      text,
      type,
      importance,
      validationMetric,
      validationOperator,
      validationThreshold,
      autoValidate
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const result = thesis.addAssumption(thesisId, {
      text,
      type,
      importance,
      validationMetric,
      validationOperator,
      validationThreshold: validationThreshold ? parseFloat(validationThreshold) : null,
      autoValidate
    });

    res.status(201).json({
      success: true,
      assumptionId: result.assumptionId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/theses/:thesisId/assumptions/:assumptionId - Update assumption
router.put('/:thesisId/assumptions/:assumptionId', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const assumptionId = parseInt(req.params.assumptionId);
    const {
      text,
      type,
      importance,
      validationMetric,
      validationOperator,
      validationThreshold,
      autoValidate,
      sortOrder
    } = req.body;

    thesis.updateAssumption(assumptionId, {
      text,
      type,
      importance,
      validationMetric,
      validationOperator,
      validationThreshold: validationThreshold !== undefined ? parseFloat(validationThreshold) : null,
      autoValidate,
      sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : null
    });

    res.json({
      success: true,
      assumptionId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/theses/:thesisId/assumptions/:assumptionId/status - Update assumption status
router.put('/:thesisId/assumptions/:assumptionId/status', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const assumptionId = parseInt(req.params.assumptionId);
    const { status, currentValue, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    thesis.updateAssumptionStatus(assumptionId, {
      status,
      currentValue: currentValue ? parseFloat(currentValue) : null,
      notes
    });

    res.json({
      success: true,
      assumptionId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/theses/:thesisId/assumptions/:assumptionId - Delete assumption
router.delete('/:thesisId/assumptions/:assumptionId', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const assumptionId = parseInt(req.params.assumptionId);

    thesis.deleteAssumption(assumptionId);

    res.json({
      success: true,
      assumptionId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Catalyst Routes
// ============================================

// GET /api/theses/:id/catalysts - Get catalysts for a thesis
router.get('/:id/catalysts', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const thesisId = parseInt(req.params.id);

    const catalysts = thesis.getCatalysts(thesisId);

    res.json({
      success: true,
      count: catalysts.length,
      catalysts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/theses/:id/catalysts - Add catalyst
router.post('/:id/catalysts', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const thesisId = parseInt(req.params.id);
    const {
      text,
      type,
      expectedDate,
      expectedDateRange,
      expectedImpact
    } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const result = thesis.addCatalyst(thesisId, {
      text,
      type,
      expectedDate,
      expectedDateRange,
      expectedImpact
    });

    res.status(201).json({
      success: true,
      catalystId: result.catalystId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/theses/:thesisId/catalysts/:catalystId - Update catalyst
router.put('/:thesisId/catalysts/:catalystId', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const catalystId = parseInt(req.params.catalystId);
    const {
      text,
      type,
      expectedDate,
      expectedDateRange,
      expectedImpact,
      sortOrder
    } = req.body;

    thesis.updateCatalyst(catalystId, {
      text,
      type,
      expectedDate,
      expectedDateRange,
      expectedImpact,
      sortOrder: sortOrder !== undefined ? parseInt(sortOrder) : null
    });

    res.json({
      success: true,
      catalystId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/theses/:thesisId/catalysts/:catalystId/status - Update catalyst status
router.put('/:thesisId/catalysts/:catalystId/status', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const catalystId = parseInt(req.params.catalystId);
    const { status, actualDate, outcome, outcomeNotes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    thesis.updateCatalystStatus(catalystId, {
      status,
      actualDate,
      outcome,
      outcomeNotes
    });

    res.json({
      success: true,
      catalystId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/theses/:thesisId/catalysts/:catalystId - Delete catalyst
router.delete('/:thesisId/catalysts/:catalystId', async (req, res) => {
  try {
    const { thesis } = await getServices(req);
    const catalystId = parseInt(req.params.catalystId);

    thesis.deleteCatalyst(catalystId);

    res.json({
      success: true,
      catalystId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
