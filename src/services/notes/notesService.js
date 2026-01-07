// src/services/notes/notesService.js
// Core notes service for CRUD operations on research notes

class NotesService {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this.stmts = {
      // Notebooks
      getAllNotebooks: this.db.prepare(`
        SELECT n.*,
          (SELECT COUNT(*) FROM notes WHERE notebook_id = n.id AND deleted_at IS NULL) as notes_count
        FROM notebooks n
        WHERE n.archived_at IS NULL
        ORDER BY n.is_default DESC, n.name ASC
      `),

      getNotebook: this.db.prepare(`
        SELECT * FROM notebooks WHERE id = ?
      `),

      createNotebook: this.db.prepare(`
        INSERT INTO notebooks (name, description, notebook_type, color, icon)
        VALUES (?, ?, ?, ?, ?)
      `),

      updateNotebook: this.db.prepare(`
        UPDATE notebooks
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            color = COALESCE(?, color),
            icon = COALESCE(?, icon),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      archiveNotebook: this.db.prepare(`
        UPDATE notebooks SET archived_at = CURRENT_TIMESTAMP WHERE id = ?
      `),

      // Notes CRUD
      getAllNotes: this.db.prepare(`
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          GROUP_CONCAT(DISTINCT na.symbol) as symbols,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names,
          (SELECT GROUP_CONCAT(p.name) FROM note_attachments na2
           JOIN portfolios p ON na2.portfolio_id = p.id
           WHERE na2.note_id = n.id AND na2.attachment_type = 'portfolio') as portfolio_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.deleted_at IS NULL
        GROUP BY n.id
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `),

      getNotesByNotebook: this.db.prepare(`
        SELECT n.*,
          GROUP_CONCAT(DISTINCT na.symbol) as symbols,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.notebook_id = ? AND n.deleted_at IS NULL
        GROUP BY n.id
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `),

      getNotesBySymbol: this.db.prepare(`
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          na.is_primary,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        JOIN note_attachments na ON n.id = na.note_id
        WHERE na.symbol = ? AND n.deleted_at IS NULL
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `),

      getNotesByPortfolio: this.db.prepare(`
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        JOIN note_attachments na ON n.id = na.note_id
        WHERE na.portfolio_id = ? AND na.attachment_type = 'portfolio' AND n.deleted_at IS NULL
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `),

      getNote: this.db.prepare(`
        SELECT n.*,
          nb.name as notebook_name,
          nb.notebook_type,
          nb.color as notebook_color
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        WHERE n.id = ?
      `),

      createNote: this.db.prepare(`
        INSERT INTO notes (notebook_id, title, content, excerpt, note_type, status, word_count, reading_time_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),

      updateNote: this.db.prepare(`
        UPDATE notes
        SET title = COALESCE(?, title),
            content = COALESCE(?, content),
            excerpt = COALESCE(?, excerpt),
            note_type = COALESCE(?, note_type),
            status = COALESCE(?, status),
            word_count = COALESCE(?, word_count),
            reading_time_minutes = COALESCE(?, reading_time_minutes),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      deleteNote: this.db.prepare(`
        UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?
      `),

      hardDeleteNote: this.db.prepare(`
        DELETE FROM notes WHERE id = ?
      `),

      pinNote: this.db.prepare(`
        UPDATE notes SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `),

      publishNote: this.db.prepare(`
        UPDATE notes
        SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `),

      // Note Attachments
      getAttachments: this.db.prepare(`
        SELECT na.*, c.name as company_name, c.sector, c.industry
        FROM note_attachments na
        LEFT JOIN companies c ON na.company_id = c.id
        WHERE na.note_id = ?
      `),

      addAttachment: this.db.prepare(`
        INSERT INTO note_attachments (note_id, attachment_type, symbol, company_id, portfolio_id, sector, industry, is_primary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),

      removeAttachment: this.db.prepare(`
        DELETE FROM note_attachments WHERE id = ?
      `),

      clearAttachments: this.db.prepare(`
        DELETE FROM note_attachments WHERE note_id = ?
      `),

      setPrimaryAttachment: this.db.prepare(`
        UPDATE note_attachments SET is_primary = 0 WHERE note_id = ?;
      `),

      markPrimaryAttachment: this.db.prepare(`
        UPDATE note_attachments SET is_primary = 1 WHERE id = ?
      `),

      // Tags
      getAllTags: this.db.prepare(`
        SELECT t.*,
          (SELECT COUNT(*) FROM note_tags WHERE tag_id = t.id) as usage_count
        FROM tags t
        ORDER BY usage_count DESC, t.name ASC
      `),

      getTagByName: this.db.prepare(`
        SELECT * FROM tags WHERE name = ?
      `),

      createTag: this.db.prepare(`
        INSERT INTO tags (name, color) VALUES (?, ?)
      `),

      updateTag: this.db.prepare(`
        UPDATE tags SET name = ?, color = ? WHERE id = ?
      `),

      deleteTag: this.db.prepare(`
        DELETE FROM tags WHERE id = ?
      `),

      getNoteTags: this.db.prepare(`
        SELECT t.* FROM tags t
        JOIN note_tags nt ON t.id = nt.tag_id
        WHERE nt.note_id = ?
      `),

      addNoteTag: this.db.prepare(`
        INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)
      `),

      removeNoteTag: this.db.prepare(`
        DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?
      `),

      clearNoteTags: this.db.prepare(`
        DELETE FROM note_tags WHERE note_id = ?
      `),

      // Versions
      getVersions: this.db.prepare(`
        SELECT * FROM note_versions
        WHERE note_id = ?
        ORDER BY version_number DESC
      `),

      getVersion: this.db.prepare(`
        SELECT * FROM note_versions WHERE note_id = ? AND version_number = ?
      `),

      getLatestVersionNumber: this.db.prepare(`
        SELECT MAX(version_number) as max_version FROM note_versions WHERE note_id = ?
      `),

      createVersion: this.db.prepare(`
        INSERT INTO note_versions (note_id, version_number, title, content, change_summary)
        VALUES (?, ?, ?, ?, ?)
      `),

      // Search
      searchNotes: this.db.prepare(`
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          GROUP_CONCAT(DISTINCT na.symbol) as symbols
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.deleted_at IS NULL
          AND (n.title LIKE ? OR n.content LIKE ? OR na.symbol LIKE ?)
        GROUP BY n.id
        ORDER BY n.updated_at DESC
        LIMIT ?
      `),

      // Activity Log
      logActivity: this.db.prepare(`
        INSERT INTO note_activity_log (note_id, notebook_id, thesis_id, action, action_details)
        VALUES (?, ?, ?, ?, ?)
      `),

      getRecentActivity: this.db.prepare(`
        SELECT al.*, n.title as note_title, nb.name as notebook_name
        FROM note_activity_log al
        LEFT JOIN notes n ON al.note_id = n.id
        LEFT JOIN notebooks nb ON al.notebook_id = nb.id
        ORDER BY al.created_at DESC
        LIMIT ?
      `),

      // Company lookup
      getCompanyBySymbol: this.db.prepare(`
        SELECT id, symbol, name, sector, industry FROM companies WHERE symbol = ? COLLATE NOCASE
      `)
    };
  }

  // ============================================
  // Notebook Operations
  // ============================================

  getAllNotebooks() {
    return this.stmts.getAllNotebooks.all();
  }

  getNotebook(notebookId) {
    return this.stmts.getNotebook.get(notebookId);
  }

  createNotebook({ name, description = null, notebookType = 'research', color = '#3B82F6', icon = 'book' }) {
    const result = this.stmts.createNotebook.run(name, description, notebookType, color, icon);
    this._logActivity(null, result.lastInsertRowid, null, 'notebook_created', { name });
    return { success: true, notebookId: result.lastInsertRowid };
  }

  updateNotebook(notebookId, { name = null, description = null, color = null, icon = null }) {
    this.stmts.updateNotebook.run(name, description, color, icon, notebookId);
    return { success: true, notebookId };
  }

  archiveNotebook(notebookId) {
    this.stmts.archiveNotebook.run(notebookId);
    this._logActivity(null, notebookId, null, 'notebook_archived', {});
    return { success: true, notebookId };
  }

  // ============================================
  // Note CRUD Operations
  // ============================================

  getAllNotes({ limit = 100 } = {}) {
    const notes = this.stmts.getAllNotes.all();
    return notes.slice(0, limit).map(this._formatNote);
  }

  getNotesByNotebook(notebookId) {
    return this.stmts.getNotesByNotebook.all(notebookId).map(this._formatNote);
  }

  getNotesBySymbol(symbol) {
    return this.stmts.getNotesBySymbol.all(symbol.toUpperCase()).map(this._formatNote);
  }

  getNotesByPortfolio(portfolioId) {
    return this.stmts.getNotesByPortfolio.all(portfolioId).map(this._formatNote);
  }

  getNote(noteId) {
    const note = this.stmts.getNote.get(noteId);
    if (!note) return null;

    const attachments = this.stmts.getAttachments.all(noteId);
    const tags = this.stmts.getNoteTags.all(noteId);

    return {
      ...this._formatNote(note),
      attachments,
      tags
    };
  }

  createNote({
    notebookId,
    title,
    content = '',
    noteType = 'general',
    status = 'draft',
    symbols = [],
    portfolioIds = [],
    tagIds = []
  }) {
    const excerpt = this._generateExcerpt(content);
    const wordCount = this._countWords(content);
    const readingTime = Math.ceil(wordCount / 200);

    const result = this.stmts.createNote.run(
      notebookId, title, content, excerpt, noteType, status, wordCount, readingTime
    );
    const noteId = result.lastInsertRowid;

    // Add company attachments
    for (const symbol of symbols) {
      this._addCompanyAttachment(noteId, symbol, symbols.indexOf(symbol) === 0);
    }

    // Add portfolio attachments
    for (const portfolioId of portfolioIds) {
      this._addPortfolioAttachment(noteId, portfolioId);
    }

    // Add tags
    for (const tagId of tagIds) {
      this.stmts.addNoteTag.run(noteId, tagId);
    }

    // Create initial version
    this.stmts.createVersion.run(noteId, 1, title, content, 'Initial creation');

    this._logActivity(noteId, notebookId, null, 'note_created', { title });

    return { success: true, noteId };
  }

  updateNote(noteId, {
    title = null,
    content = null,
    noteType = null,
    status = null,
    symbols = null,
    portfolioIds = null,
    tagIds = null,
    createVersion = true
  }) {
    const existingNote = this.stmts.getNote.get(noteId);
    if (!existingNote) {
      throw new Error(`Note ${noteId} not found`);
    }

    // Calculate new values
    const newContent = content !== null ? content : existingNote.content;
    const excerpt = content !== null ? this._generateExcerpt(newContent) : null;
    const wordCount = content !== null ? this._countWords(newContent) : null;
    const readingTime = wordCount !== null ? Math.ceil(wordCount / 200) : null;

    this.stmts.updateNote.run(
      title, content, excerpt, noteType, status, wordCount, readingTime, noteId
    );

    // Update attachments if symbols or portfolioIds provided
    if (symbols !== null || portfolioIds !== null) {
      this.stmts.clearAttachments.run(noteId);
      // Re-add company attachments
      if (symbols !== null) {
        for (const symbol of symbols) {
          this._addCompanyAttachment(noteId, symbol, symbols.indexOf(symbol) === 0);
        }
      }
      // Re-add portfolio attachments
      if (portfolioIds !== null) {
        for (const portfolioId of portfolioIds) {
          this._addPortfolioAttachment(noteId, portfolioId);
        }
      }
    }

    // Update tags if provided
    if (tagIds !== null) {
      this.stmts.clearNoteTags.run(noteId);
      for (const tagId of tagIds) {
        this.stmts.addNoteTag.run(noteId, tagId);
      }
    }

    // Create version if content changed
    if (createVersion && content !== null && content !== existingNote.content) {
      const versionResult = this.stmts.getLatestVersionNumber.get(noteId);
      const newVersionNumber = (versionResult?.max_version || 0) + 1;
      this.stmts.createVersion.run(
        noteId,
        newVersionNumber,
        title || existingNote.title,
        content,
        'Content updated'
      );
    }

    this._logActivity(noteId, existingNote.notebook_id, null, 'note_updated', { title: title || existingNote.title });

    return { success: true, noteId };
  }

  deleteNote(noteId, hard = false) {
    if (hard) {
      this.stmts.hardDeleteNote.run(noteId);
    } else {
      this.stmts.deleteNote.run(noteId);
    }
    this._logActivity(noteId, null, null, 'note_deleted', {});
    return { success: true, noteId };
  }

  pinNote(noteId, isPinned = true) {
    this.stmts.pinNote.run(isPinned ? 1 : 0, noteId);
    return { success: true, noteId, isPinned };
  }

  publishNote(noteId) {
    this.stmts.publishNote.run(noteId);
    this._logActivity(noteId, null, null, 'note_published', {});
    return { success: true, noteId };
  }

  // ============================================
  // Attachments
  // ============================================

  addAttachment(noteId, { type, symbol = null, portfolioId = null, sector = null, industry = null, isPrimary = false }) {
    let companyId = null;
    if (symbol) {
      const company = this.stmts.getCompanyBySymbol.get(symbol);
      if (company) {
        companyId = company.id;
        sector = sector || company.sector;
        industry = industry || company.industry;
      }
    }

    const result = this.stmts.addAttachment.run(
      noteId, type, symbol?.toUpperCase(), companyId, portfolioId, sector, industry, isPrimary ? 1 : 0
    );
    return { success: true, attachmentId: result.lastInsertRowid };
  }

  removeAttachment(attachmentId) {
    this.stmts.removeAttachment.run(attachmentId);
    return { success: true };
  }

  getAttachments(noteId) {
    return this.stmts.getAttachments.all(noteId);
  }

  // ============================================
  // Tags
  // ============================================

  getAllTags() {
    return this.stmts.getAllTags.all();
  }

  createTag({ name, color = '#6B7280' }) {
    const existing = this.stmts.getTagByName.get(name);
    if (existing) {
      return { success: false, error: 'Tag already exists', tagId: existing.id };
    }
    const result = this.stmts.createTag.run(name, color);
    return { success: true, tagId: result.lastInsertRowid };
  }

  updateTag(tagId, { name, color }) {
    this.stmts.updateTag.run(name, color, tagId);
    return { success: true, tagId };
  }

  deleteTag(tagId) {
    this.stmts.deleteTag.run(tagId);
    return { success: true, tagId };
  }

  addTagToNote(noteId, tagId) {
    this.stmts.addNoteTag.run(noteId, tagId);
    return { success: true };
  }

  removeTagFromNote(noteId, tagId) {
    this.stmts.removeNoteTag.run(noteId, tagId);
    return { success: true };
  }

  getOrCreateTag(name, color = '#6B7280') {
    let tag = this.stmts.getTagByName.get(name);
    if (!tag) {
      const result = this.stmts.createTag.run(name, color);
      tag = { id: result.lastInsertRowid, name, color };
    }
    return tag;
  }

  // ============================================
  // Versions
  // ============================================

  getVersions(noteId) {
    return this.stmts.getVersions.all(noteId);
  }

  getVersion(noteId, versionNumber) {
    return this.stmts.getVersion.get(noteId, versionNumber);
  }

  restoreVersion(noteId, versionNumber) {
    const version = this.stmts.getVersion.get(noteId, versionNumber);
    if (!version) {
      throw new Error(`Version ${versionNumber} not found for note ${noteId}`);
    }

    this.updateNote(noteId, {
      title: version.title,
      content: version.content,
      createVersion: true
    });

    this._logActivity(noteId, null, null, 'version_restored', { versionNumber });
    return { success: true, noteId, restoredVersion: versionNumber };
  }

  // ============================================
  // Search
  // ============================================

  searchNotes(query, { limit = 50 } = {}) {
    const searchPattern = `%${query}%`;
    return this.stmts.searchNotes.all(searchPattern, searchPattern, searchPattern, limit)
      .map(this._formatNote);
  }

  // ============================================
  // Activity
  // ============================================

  getRecentActivity(limit = 50) {
    return this.stmts.getRecentActivity.all(limit);
  }

  // ============================================
  // Private Helpers
  // ============================================

  _addCompanyAttachment(noteId, symbol, isPrimary = false) {
    const company = this.stmts.getCompanyBySymbol.get(symbol);
    this.stmts.addAttachment.run(
      noteId,
      'company',
      symbol.toUpperCase(),
      company?.id || null,
      null,
      company?.sector || null,
      company?.industry || null,
      isPrimary ? 1 : 0
    );
  }

  _addPortfolioAttachment(noteId, portfolioId) {
    this.stmts.addAttachment.run(
      noteId,
      'portfolio',
      null,
      null,
      portfolioId,
      null,
      null,
      0
    );
  }

  _formatNote(note) {
    return {
      ...note,
      symbols: note.symbols ? note.symbols.split(',') : [],
      tagNames: note.tag_names ? note.tag_names.split(',') : [],
      portfolioNames: note.portfolio_names ? note.portfolio_names.split(',') : [],
      isPinned: !!note.is_pinned
    };
  }

  _generateExcerpt(content, maxLength = 200) {
    if (!content) return '';
    // Remove markdown formatting
    const plainText = content
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength).trim() + '...';
  }

  _countWords(content) {
    if (!content) return 0;
    return content.trim().split(/\s+/).filter(word => word.length > 0).length;
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

// Factory function for creating service with db
function getNotesService(db) {
  return new NotesService(db);
}

module.exports = { NotesService, getNotesService };
