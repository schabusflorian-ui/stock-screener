// src/services/notes/notesService.js
// Core notes service for CRUD operations on research notes

const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

class NotesService {
  constructor() {
    // No database parameter needed - using getDatabaseAsync()
  }

  // ============================================
  // Notebook Operations
  // ============================================

  async getAllNotebooks() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT n.*,
        (SELECT COUNT(*) FROM notes WHERE notebook_id = n.id AND deleted_at IS NULL) as notes_count
      FROM notebooks n
      WHERE n.archived_at IS NULL
      ORDER BY n.is_default DESC, n.name ASC
    `);
    return result.rows;
  }

  async getNotebook(notebookId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM notebooks WHERE id = $1
    `, [notebookId]);
    return result.rows[0];
  }

  async createNotebook({ name, description = null, notebookType = 'research', color = '#3B82F6', icon = 'book' }) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      INSERT INTO notebooks (name, description, notebook_type, color, icon)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [name, description, notebookType, color, icon]);
    const notebookId = result.rows[0].id;
    await this._logActivity(null, notebookId, null, 'notebook_created', { name });
    return { success: true, notebookId };
  }

  async updateNotebook(notebookId, { name = null, description = null, color = null, icon = null }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE notebooks
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          color = COALESCE($3, color),
          icon = COALESCE($4, icon),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `, [name, description, color, icon, notebookId]);
    return { success: true, notebookId };
  }

  async archiveNotebook(notebookId) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE notebooks SET archived_at = CURRENT_TIMESTAMP WHERE id = $1
    `, [notebookId]);
    await this._logActivity(null, notebookId, null, 'notebook_archived', {});
    return { success: true, notebookId };
  }

  // ============================================
  // Note CRUD Operations
  // ============================================

  async getAllNotes({ limit = 100 } = {}) {
    const database = await getDatabaseAsync();
    const aggregateFunc = isUsingPostgres() ? 'STRING_AGG' : 'GROUP_CONCAT';
    const aggregateSeparator = isUsingPostgres() ? ", ', '" : '';

    const query = isUsingPostgres()
      ? `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          STRING_AGG(DISTINCT na.symbol, ', ') as symbols,
          (SELECT STRING_AGG(t.name, ', ') FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names,
          (SELECT STRING_AGG(p.name, ', ') FROM note_attachments na2
           JOIN portfolios p ON na2.portfolio_id = p.id
           WHERE na2.note_id = n.id AND na2.attachment_type = 'portfolio') as portfolio_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.deleted_at IS NULL
        GROUP BY n.id, nb.name, nb.color
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `
      : `
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
      `;

    const result = await database.query(query);
    const notes = result.rows.slice(0, limit);
    return notes.map(this._formatNote);
  }

  async getNotesByNotebook(notebookId) {
    const database = await getDatabaseAsync();
    const query = isUsingPostgres()
      ? `
        SELECT n.*,
          STRING_AGG(DISTINCT na.symbol, ', ') as symbols,
          (SELECT STRING_AGG(t.name, ', ') FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.notebook_id = $1 AND n.deleted_at IS NULL
        GROUP BY n.id
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `
      : `
        SELECT n.*,
          GROUP_CONCAT(DISTINCT na.symbol) as symbols,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.notebook_id = $1 AND n.deleted_at IS NULL
        GROUP BY n.id
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `;

    const result = await database.query(query, [notebookId]);
    return result.rows.map(this._formatNote);
  }

  async getNotesBySymbol(symbol) {
    const database = await getDatabaseAsync();
    const query = isUsingPostgres()
      ? `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          na.is_primary,
          (SELECT STRING_AGG(t.name, ', ') FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        JOIN note_attachments na ON n.id = na.note_id
        WHERE na.symbol = $1 AND n.deleted_at IS NULL
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `
      : `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          na.is_primary,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        JOIN note_attachments na ON n.id = na.note_id
        WHERE na.symbol = $1 AND n.deleted_at IS NULL
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `;

    const result = await database.query(query, [symbol.toUpperCase()]);
    return result.rows.map(this._formatNote);
  }

  async getNotesByPortfolio(portfolioId) {
    const database = await getDatabaseAsync();
    const query = isUsingPostgres()
      ? `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          (SELECT STRING_AGG(t.name, ', ') FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        JOIN note_attachments na ON n.id = na.note_id
        WHERE na.portfolio_id = $1 AND na.attachment_type = 'portfolio' AND n.deleted_at IS NULL
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `
      : `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          (SELECT GROUP_CONCAT(t.name) FROM note_tags nt
           JOIN tags t ON nt.tag_id = t.id WHERE nt.note_id = n.id) as tag_names
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        JOIN note_attachments na ON n.id = na.note_id
        WHERE na.portfolio_id = $1 AND na.attachment_type = 'portfolio' AND n.deleted_at IS NULL
        ORDER BY n.is_pinned DESC, n.updated_at DESC
      `;

    const result = await database.query(query, [portfolioId]);
    return result.rows.map(this._formatNote);
  }

  async getNote(noteId) {
    const database = await getDatabaseAsync();
    const noteResult = await database.query(`
      SELECT n.*,
        nb.name as notebook_name,
        nb.notebook_type,
        nb.color as notebook_color
      FROM notes n
      JOIN notebooks nb ON n.notebook_id = nb.id
      WHERE n.id = $1
    `, [noteId]);
    const note = noteResult.rows[0];
    if (!note) return null;

    const attachmentsResult = await database.query(`
      SELECT na.*, c.name as company_name, c.sector, c.industry
      FROM note_attachments na
      LEFT JOIN companies c ON na.company_id = c.id
      WHERE na.note_id = $1
    `, [noteId]);
    const attachments = attachmentsResult.rows;

    const tagsResult = await database.query(`
      SELECT t.* FROM tags t
      JOIN note_tags nt ON t.id = nt.tag_id
      WHERE nt.note_id = $1
    `, [noteId]);
    const tags = tagsResult.rows;

    return {
      ...this._formatNote(note),
      attachments,
      tags
    };
  }

  async createNote({
    notebookId,
    title,
    content = '',
    noteType = 'general',
    status = 'draft',
    symbols = [],
    portfolioIds = [],
    tagIds = []
  }) {
    const database = await getDatabaseAsync();
    const excerpt = this._generateExcerpt(content);
    const wordCount = this._countWords(content);
    const readingTime = Math.ceil(wordCount / 200);

    const result = await database.query(`
      INSERT INTO notes (notebook_id, title, content, excerpt, note_type, status, word_count, reading_time_minutes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [notebookId, title, content, excerpt, noteType, status, wordCount, readingTime]);
    const noteId = result.rows[0].id;

    // Add company attachments
    for (const symbol of symbols) {
      await this._addCompanyAttachment(noteId, symbol, symbols.indexOf(symbol) === 0);
    }

    // Add portfolio attachments
    for (const portfolioId of portfolioIds) {
      await this._addPortfolioAttachment(noteId, portfolioId);
    }

    // Add tags
    for (const tagId of tagIds) {
      const onConflict = isUsingPostgres() ? 'ON CONFLICT DO NOTHING' : 'OR IGNORE';
      await database.query(`
        INSERT ${onConflict} INTO note_tags (note_id, tag_id) VALUES ($1, $2)
      `, [noteId, tagId]);
    }

    // Create initial version
    await database.query(`
      INSERT INTO note_versions (note_id, version_number, title, content, change_summary)
      VALUES ($1, $2, $3, $4, $5)
    `, [noteId, 1, title, content, 'Initial creation']);

    await this._logActivity(noteId, notebookId, null, 'note_created', { title });

    return { success: true, noteId };
  }

  async updateNote(noteId, {
    title = null,
    content = null,
    noteType = null,
    status = null,
    symbols = null,
    portfolioIds = null,
    tagIds = null,
    createVersion = true
  }) {
    const database = await getDatabaseAsync();
    const existingNoteResult = await database.query(`
      SELECT n.*,
        nb.name as notebook_name,
        nb.notebook_type,
        nb.color as notebook_color
      FROM notes n
      JOIN notebooks nb ON n.notebook_id = nb.id
      WHERE n.id = $1
    `, [noteId]);
    const existingNote = existingNoteResult.rows[0];
    if (!existingNote) {
      throw new Error(`Note ${noteId} not found`);
    }

    // Calculate new values
    const newContent = content !== null ? content : existingNote.content;
    const excerpt = content !== null ? this._generateExcerpt(newContent) : null;
    const wordCount = content !== null ? this._countWords(newContent) : null;
    const readingTime = wordCount !== null ? Math.ceil(wordCount / 200) : null;

    await database.query(`
      UPDATE notes
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          excerpt = COALESCE($3, excerpt),
          note_type = COALESCE($4, note_type),
          status = COALESCE($5, status),
          word_count = COALESCE($6, word_count),
          reading_time_minutes = COALESCE($7, reading_time_minutes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
    `, [title, content, excerpt, noteType, status, wordCount, readingTime, noteId]);

    // Update attachments if symbols or portfolioIds provided
    if (symbols !== null || portfolioIds !== null) {
      await database.query('DELETE FROM note_attachments WHERE note_id = $1', [noteId]);
      // Re-add company attachments
      if (symbols !== null) {
        for (const symbol of symbols) {
          await this._addCompanyAttachment(noteId, symbol, symbols.indexOf(symbol) === 0);
        }
      }
      // Re-add portfolio attachments
      if (portfolioIds !== null) {
        for (const portfolioId of portfolioIds) {
          await this._addPortfolioAttachment(noteId, portfolioId);
        }
      }
    }

    // Update tags if provided
    if (tagIds !== null) {
      await database.query('DELETE FROM note_tags WHERE note_id = $1', [noteId]);
      for (const tagId of tagIds) {
        const onConflict = isUsingPostgres() ? 'ON CONFLICT DO NOTHING' : 'OR IGNORE';
        await database.query(`
          INSERT ${onConflict} INTO note_tags (note_id, tag_id) VALUES ($1, $2)
        `, [noteId, tagId]);
      }
    }

    // Create version if content changed
    if (createVersion && content !== null && content !== existingNote.content) {
      const versionResult = await database.query(`
        SELECT MAX(version_number) as max_version FROM note_versions WHERE note_id = $1
      `, [noteId]);
      const newVersionNumber = (versionResult.rows[0]?.max_version || 0) + 1;
      await database.query(`
        INSERT INTO note_versions (note_id, version_number, title, content, change_summary)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        noteId,
        newVersionNumber,
        title || existingNote.title,
        content,
        'Content updated'
      ]);
    }

    await this._logActivity(noteId, existingNote.notebook_id, null, 'note_updated', { title: title || existingNote.title });

    return { success: true, noteId };
  }

  async deleteNote(noteId, hard = false) {
    const database = await getDatabaseAsync();
    if (hard) {
      await database.query('DELETE FROM notes WHERE id = $1', [noteId]);
    } else {
      await database.query('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [noteId]);
    }
    await this._logActivity(noteId, null, null, 'note_deleted', {});
    return { success: true, noteId };
  }

  async pinNote(noteId, isPinned = true) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE notes SET is_pinned = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [isPinned ? 1 : 0, noteId]);
    return { success: true, noteId, isPinned };
  }

  async publishNote(noteId) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE notes
      SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [noteId]);
    await this._logActivity(noteId, null, null, 'note_published', {});
    return { success: true, noteId };
  }

  // ============================================
  // Attachments
  // ============================================

  async addAttachment(noteId, { type, symbol = null, portfolioId = null, sector = null, industry = null, isPrimary = false }) {
    const database = await getDatabaseAsync();
    let companyId = null;
    if (symbol) {
      const companyResult = await database.query(`
        SELECT id, symbol, name, sector, industry FROM companies WHERE LOWER(symbol) = LOWER($1)
      `, [symbol]);
      const company = companyResult.rows[0];
      if (company) {
        companyId = company.id;
        sector = sector || company.sector;
        industry = industry || company.industry;
      }
    }

    const result = await database.query(`
      INSERT INTO note_attachments (note_id, attachment_type, symbol, company_id, portfolio_id, sector, industry, is_primary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [noteId, type, symbol?.toUpperCase(), companyId, portfolioId, sector, industry, isPrimary ? 1 : 0]);
    return { success: true, attachmentId: result.rows[0].id };
  }

  async removeAttachment(attachmentId) {
    const database = await getDatabaseAsync();
    await database.query('DELETE FROM note_attachments WHERE id = $1', [attachmentId]);
    return { success: true };
  }

  async getAttachments(noteId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT na.*, c.name as company_name, c.sector, c.industry
      FROM note_attachments na
      LEFT JOIN companies c ON na.company_id = c.id
      WHERE na.note_id = $1
    `, [noteId]);
    return result.rows;
  }

  // ============================================
  // Tags
  // ============================================

  async getAllTags() {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT t.*,
        (SELECT COUNT(*) FROM note_tags WHERE tag_id = t.id) as usage_count
      FROM tags t
      ORDER BY usage_count DESC, t.name ASC
    `);
    return result.rows;
  }

  async createTag({ name, color = '#6B7280' }) {
    const database = await getDatabaseAsync();
    const existingResult = await database.query(`
      SELECT * FROM tags WHERE name = $1
    `, [name]);
    const existing = existingResult.rows[0];
    if (existing) {
      return { success: false, error: 'Tag already exists', tagId: existing.id };
    }
    const result = await database.query(`
      INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING id
    `, [name, color]);
    return { success: true, tagId: result.rows[0].id };
  }

  async updateTag(tagId, { name, color }) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE tags SET name = $1, color = $2 WHERE id = $3
    `, [name, color, tagId]);
    return { success: true, tagId };
  }

  async deleteTag(tagId) {
    const database = await getDatabaseAsync();
    await database.query('DELETE FROM tags WHERE id = $1', [tagId]);
    return { success: true, tagId };
  }

  async addTagToNote(noteId, tagId) {
    const database = await getDatabaseAsync();
    const onConflict = isUsingPostgres() ? 'ON CONFLICT DO NOTHING' : 'OR IGNORE';
    await database.query(`
      INSERT ${onConflict} INTO note_tags (note_id, tag_id) VALUES ($1, $2)
    `, [noteId, tagId]);
    return { success: true };
  }

  async removeTagFromNote(noteId, tagId) {
    const database = await getDatabaseAsync();
    await database.query(`
      DELETE FROM note_tags WHERE note_id = $1 AND tag_id = $2
    `, [noteId, tagId]);
    return { success: true };
  }

  async getOrCreateTag(name, color = '#6B7280') {
    const database = await getDatabaseAsync();
    const tagResult = await database.query(`
      SELECT * FROM tags WHERE name = $1
    `, [name]);
    let tag = tagResult.rows[0];
    if (!tag) {
      const result = await database.query(`
        INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING id
      `, [name, color]);
      tag = { id: result.rows[0].id, name, color };
    }
    return tag;
  }

  // ============================================
  // Versions
  // ============================================

  async getVersions(noteId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM note_versions
      WHERE note_id = $1
      ORDER BY version_number DESC
    `, [noteId]);
    return result.rows;
  }

  async getVersion(noteId, versionNumber) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM note_versions WHERE note_id = $1 AND version_number = $2
    `, [noteId, versionNumber]);
    return result.rows[0];
  }

  async restoreVersion(noteId, versionNumber) {
    const database = await getDatabaseAsync();
    const versionResult = await database.query(`
      SELECT * FROM note_versions WHERE note_id = $1 AND version_number = $2
    `, [noteId, versionNumber]);
    const version = versionResult.rows[0];
    if (!version) {
      throw new Error(`Version ${versionNumber} not found for note ${noteId}`);
    }

    await this.updateNote(noteId, {
      title: version.title,
      content: version.content,
      createVersion: true
    });

    await this._logActivity(noteId, null, null, 'version_restored', { versionNumber });
    return { success: true, noteId, restoredVersion: versionNumber };
  }

  // ============================================
  // Search
  // ============================================

  async searchNotes(query, { limit = 50 } = {}) {
    const database = await getDatabaseAsync();
    const searchPattern = `%${query}%`;
    const aggregateQuery = isUsingPostgres()
      ? `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          STRING_AGG(DISTINCT na.symbol, ', ') as symbols
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.deleted_at IS NULL
          AND (n.title ILIKE $1 OR n.content ILIKE $2 OR na.symbol ILIKE $3)
        GROUP BY n.id, nb.name, nb.color
        ORDER BY n.updated_at DESC
        LIMIT $4
      `
      : `
        SELECT n.*,
          nb.name as notebook_name,
          nb.color as notebook_color,
          GROUP_CONCAT(DISTINCT na.symbol) as symbols
        FROM notes n
        JOIN notebooks nb ON n.notebook_id = nb.id
        LEFT JOIN note_attachments na ON n.id = na.note_id AND na.attachment_type = 'company'
        WHERE n.deleted_at IS NULL
          AND (n.title LIKE $1 OR n.content LIKE $2 OR na.symbol LIKE $3)
        GROUP BY n.id
        ORDER BY n.updated_at DESC
        LIMIT $4
      `;

    const result = await database.query(aggregateQuery, [searchPattern, searchPattern, searchPattern, limit]);
    return result.rows.map(this._formatNote);
  }

  // ============================================
  // Activity
  // ============================================

  async getRecentActivity(limit = 50) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT al.*, n.title as note_title, nb.name as notebook_name
      FROM note_activity_log al
      LEFT JOIN notes n ON al.note_id = n.id
      LEFT JOIN notebooks nb ON al.notebook_id = nb.id
      ORDER BY al.created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  // ============================================
  // Private Helpers
  // ============================================

  async _addCompanyAttachment(noteId, symbol, isPrimary = false) {
    const database = await getDatabaseAsync();
    const companyResult = await database.query(`
      SELECT id, symbol, name, sector, industry FROM companies WHERE LOWER(symbol) = LOWER($1)
    `, [symbol]);
    const company = companyResult.rows[0];
    await database.query(`
      INSERT INTO note_attachments (note_id, attachment_type, symbol, company_id, portfolio_id, sector, industry, is_primary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      noteId,
      'company',
      symbol.toUpperCase(),
      company?.id || null,
      null,
      company?.sector || null,
      company?.industry || null,
      isPrimary ? 1 : 0
    ]);
  }

  async _addPortfolioAttachment(noteId, portfolioId) {
    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO note_attachments (note_id, attachment_type, symbol, company_id, portfolio_id, sector, industry, is_primary)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      noteId,
      'portfolio',
      null,
      null,
      portfolioId,
      null,
      null,
      0
    ]);
  }

  _formatNote(note) {
    return {
      ...note,
      symbols: note.symbols ? note.symbols.split(',').map(s => s.trim()) : [],
      tagNames: note.tag_names ? note.tag_names.split(',').map(t => t.trim()) : [],
      portfolioNames: note.portfolio_names ? note.portfolio_names.split(',').map(p => p.trim()) : [],
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

// Factory function for creating service
function getNotesService() {
  return new NotesService();
}

module.exports = { NotesService, getNotesService };
