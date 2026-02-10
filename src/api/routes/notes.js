// src/api/routes/notes.js
// API routes for research notes and notebooks

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const { createNotesServices } = require('../../services/notes');

// Middleware to get notes services (async)
const getServices = async (req) => {
  const db = await getDatabaseAsync();
  return createNotesServices(db);
};

// ============================================
// Notebook Routes
// ============================================

// GET /api/notes/notebooks - List all notebooks
router.get('/notebooks', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const notebooks = await notes.getAllNotebooks();
    res.json({
      success: true,
      count: notebooks.length,
      notebooks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes/notebooks - Create a new notebook
router.post('/notebooks', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const { name, description, notebookType, color, icon } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await notes.createNotebook({ name, description, notebookType, color, icon });
    const notebook = await notes.getNotebook(result.notebookId);

    res.status(201).json({
      success: true,
      notebook
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notes/notebooks/:id - Update a notebook
router.put('/notebooks/:id', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const notebookId = parseInt(req.params.id);
    const { name, description, color, icon } = req.body;

    await notes.updateNotebook(notebookId, { name, description, color, icon });
    const notebook = await notes.getNotebook(notebookId);

    res.json({
      success: true,
      notebook
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/notebooks/:id - Archive a notebook
router.delete('/notebooks/:id', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const notebookId = parseInt(req.params.id);

    await notes.archiveNotebook(notebookId);

    res.json({
      success: true,
      notebookId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Tag Routes
// ============================================

// GET /api/notes/tags - List all tags
router.get('/tags', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const tags = await notes.getAllTags();
    res.json({
      success: true,
      count: tags.length,
      tags
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes/tags - Create a new tag
router.post('/tags', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await notes.createTag({ name, color: color || '#6B7280' });
    if (!result.success) {
      return res.status(400).json({ error: result.error, tagId: result.tagId });
    }

    // Return the full tag object so the frontend can use it
    res.status(201).json({
      success: true,
      tagId: result.tagId,
      tag: {
        id: result.tagId,
        name: name.trim(),
        color: color || '#6B7280',
        usage_count: 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notes/tags/:id - Update a tag
router.put('/tags/:id', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const tagId = parseInt(req.params.id);
    const { name, color } = req.body;

    await notes.updateTag(tagId, { name, color });

    res.json({
      success: true,
      tagId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/tags/:id - Delete a tag
router.delete('/tags/:id', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const tagId = parseInt(req.params.id);

    await notes.deleteTag(tagId);

    res.json({
      success: true,
      tagId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Activity Routes
// ============================================

// GET /api/notes/activity - Get recent activity
router.get('/activity', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const { limit = 50 } = req.query;

    const activity = await notes.getRecentActivity(parseInt(limit));

    res.json({
      success: true,
      count: activity.length,
      activity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Search Routes
// ============================================

// GET /api/notes/search - Search notes
router.get('/search', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const { q, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const results = await notes.searchNotes(q, { limit: parseInt(limit) });

    res.json({
      success: true,
      count: results.length,
      query: q,
      notes: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Notes by Symbol Route
// ============================================

// GET /api/notes/company/:symbol - Get notes for a company
router.get('/company/:symbol', async (req, res) => {
  try {
    const { notes, thesis, snapshot } = await getServices(req);
    const symbol = req.params.symbol.toUpperCase();

    const companyNotes = await notes.getNotesBySymbol(symbol);
    const companyTheses = await thesis.getThesesBySymbol(symbol);
    const activeThesis = await thesis.getActiveThesisForSymbol(symbol);
    const snapshots = await snapshot.getSnapshotsBySymbol(symbol);

    res.json({
      success: true,
      symbol,
      notes: companyNotes,
      theses: companyTheses,
      activeThesis,
      snapshots
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notes/portfolio/:portfolioId - Get notes for a portfolio
router.get('/portfolio/:portfolioId', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const portfolioId = parseInt(req.params.portfolioId);

    const portfolioNotes = await notes.getNotesByPortfolio(portfolioId);

    res.json({
      success: true,
      portfolioId,
      notes: portfolioNotes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Notes CRUD Routes
// ============================================

// GET /api/notes - List all notes
router.get('/', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const { notebookId, limit = 100 } = req.query;

    let notesList;
    if (notebookId) {
      notesList = await notes.getNotesByNotebook(parseInt(notebookId));
    } else {
      notesList = await notes.getAllNotes({ limit: parseInt(limit) });
    }

    res.json({
      success: true,
      count: notesList.length,
      notes: notesList
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notes/:id - Get a specific note
router.get('/:id', async (req, res) => {
  try {
    const { notes, snapshot } = await getServices(req);
    const noteId = parseInt(req.params.id);

    const note = await notes.getNote(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Get snapshots for this note
    const snapshots = await snapshot.getSnapshotsByNote(noteId);

    res.json({
      success: true,
      note: {
        ...note,
        snapshots
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes - Create a new note
router.post('/', async (req, res) => {
  try {
    const { notes, snapshot } = await getServices(req);
    const {
      notebookId,
      title,
      content,
      noteType,
      status,
      symbols = [],
      portfolioIds = [],
      tagIds = [],
      captureSnapshots = true
    } = req.body;

    if (!notebookId || !title) {
      return res.status(400).json({ error: 'notebookId and title are required' });
    }

    const result = await notes.createNote({
      notebookId: parseInt(notebookId),
      title,
      content,
      noteType,
      status,
      symbols,
      portfolioIds,
      tagIds
    });

    // Capture snapshots for attached symbols
    if (captureSnapshots && symbols.length > 0) {
      await snapshot.captureMultipleSnapshots(result.noteId, symbols);
    }

    const note = await notes.getNote(result.noteId);

    res.status(201).json({
      success: true,
      note
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notes/:id - Update a note
router.put('/:id', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const {
      title,
      content,
      noteType,
      status,
      symbols,
      portfolioIds,
      tagIds,
      createVersion = true
    } = req.body;

    await notes.updateNote(noteId, {
      title,
      content,
      noteType,
      status,
      symbols,
      portfolioIds,
      tagIds,
      createVersion
    });

    const note = await notes.getNote(noteId);

    res.json({
      success: true,
      note
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/:id - Delete a note
router.delete('/:id', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const { hard = false } = req.query;

    await notes.deleteNote(noteId, hard === 'true');

    res.json({
      success: true,
      noteId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes/:id/pin - Pin/unpin a note
router.post('/:id/pin', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const { isPinned = true } = req.body;

    await notes.pinNote(noteId, isPinned);

    res.json({
      success: true,
      noteId,
      isPinned
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes/:id/publish - Publish a note
router.post('/:id/publish', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);

    await notes.publishNote(noteId);
    const note = await notes.getNote(noteId);

    res.json({
      success: true,
      note
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Note Attachments Routes
// ============================================

// POST /api/notes/:id/attachments - Add attachment
router.post('/:id/attachments', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const { type, symbol, portfolioId, sector, industry, isPrimary } = req.body;

    const result = await notes.addAttachment(noteId, {
      type,
      symbol,
      portfolioId,
      sector,
      industry,
      isPrimary
    });

    res.status(201).json({
      success: true,
      attachmentId: result.attachmentId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/:id/attachments/:attachmentId - Remove attachment
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const attachmentId = parseInt(req.params.attachmentId);

    await notes.removeAttachment(attachmentId);

    res.json({
      success: true,
      attachmentId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Note Tags Routes
// ============================================

// POST /api/notes/:id/tags/:tagId - Add tag to note
router.post('/:id/tags/:tagId', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    await notes.addTagToNote(noteId, tagId);

    res.json({
      success: true,
      noteId,
      tagId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/:id/tags/:tagId - Remove tag from note
router.delete('/:id/tags/:tagId', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    await notes.removeTagFromNote(noteId, tagId);

    res.json({
      success: true,
      noteId,
      tagId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Version History Routes
// ============================================

// GET /api/notes/:id/versions - Get all versions
router.get('/:id/versions', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);

    const versions = await notes.getVersions(noteId);

    res.json({
      success: true,
      count: versions.length,
      versions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notes/:id/versions/:versionNumber - Get specific version
router.get('/:id/versions/:versionNumber', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const versionNumber = parseInt(req.params.versionNumber);

    const version = await notes.getVersion(noteId, versionNumber);
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({
      success: true,
      version
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes/:id/versions/:versionNumber/restore - Restore version
router.post('/:id/versions/:versionNumber/restore', async (req, res) => {
  try {
    const { notes } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const versionNumber = parseInt(req.params.versionNumber);

    const result = await notes.restoreVersion(noteId, versionNumber);
    const note = await notes.getNote(noteId);

    res.json({
      success: true,
      restoredVersion: versionNumber,
      note
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Snapshot Routes
// ============================================

// GET /api/notes/:id/snapshots - Get snapshots for a note
router.get('/:id/snapshots', async (req, res) => {
  try {
    const { snapshot } = await getServices(req);
    const noteId = parseInt(req.params.id);

    const snapshots = await snapshot.getSnapshotsByNote(noteId);

    res.json({
      success: true,
      count: snapshots.length,
      snapshots
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/notes/:id/snapshots - Capture new snapshot
router.post('/:id/snapshots', async (req, res) => {
  try {
    const { snapshot } = await getServices(req);
    const noteId = parseInt(req.params.id);
    const { symbol, symbols } = req.body;

    if (symbols && Array.isArray(symbols)) {
      const results = await snapshot.captureMultipleSnapshots(noteId, symbols);
      res.status(201).json({
        success: true,
        results
      });
    } else if (symbol) {
      const result = await snapshot.captureSnapshot(noteId, symbol);
      res.status(201).json(result);
    } else {
      return res.status(400).json({ error: 'symbol or symbols required' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notes/snapshots/:snapshotId/compare - Compare snapshot to current
router.get('/snapshots/:snapshotId/compare', async (req, res) => {
  try {
    const { snapshot } = await getServices(req);
    const snapshotId = parseInt(req.params.snapshotId);

    const result = await snapshot.compareSnapshotToCurrent(snapshotId);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/snapshots/:snapshotId - Delete a snapshot
router.delete('/snapshots/:snapshotId', async (req, res) => {
  try {
    const { snapshot } = await getServices(req);
    const snapshotId = parseInt(req.params.snapshotId);

    await snapshot.deleteSnapshot(snapshotId);

    res.json({
      success: true,
      snapshotId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
