// src/services/conversationStore.js
/**
 * Persistent storage for AI analyst conversations.
 *
 * Stores conversations and messages in SQLite with caching
 * for frequently accessed conversations.
 */

const Database = require('better-sqlite3');
const path = require('path');

class ConversationStore {
  constructor(dbPath) {
    this.db = new Database(dbPath || path.join(__dirname, '../../data/stocks.db'));
    this.cache = new Map();
    this.cacheMaxSize = 100;
    this.cacheMaxAge = 30 * 60 * 1000; // 30 minutes

    this._prepareStatements();
  }

  _prepareStatements() {
    // Conversation statements
    this.stmtInsertConversation = this.db.prepare(`
      INSERT INTO analyst_conversations (id, analyst_id, company_id, company_symbol, title, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetConversation = this.db.prepare(`
      SELECT * FROM analyst_conversations WHERE id = ?
    `);

    this.stmtUpdateConversation = this.db.prepare(`
      UPDATE analyst_conversations
      SET title = COALESCE(?, title),
          summary = COALESCE(?, summary),
          metadata = COALESCE(?, metadata),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    this.stmtListConversations = this.db.prepare(`
      SELECT c.*, co.name as company_name
      FROM analyst_conversations c
      LEFT JOIN companies co ON c.company_id = co.id
      ORDER BY c.updated_at DESC
      LIMIT ?
    `);

    this.stmtListByAnalyst = this.db.prepare(`
      SELECT c.*, co.name as company_name
      FROM analyst_conversations c
      LEFT JOIN companies co ON c.company_id = co.id
      WHERE c.analyst_id = ?
      ORDER BY c.updated_at DESC
      LIMIT ?
    `);

    this.stmtListByCompany = this.db.prepare(`
      SELECT c.*
      FROM analyst_conversations c
      WHERE c.company_symbol = ?
      ORDER BY c.updated_at DESC
      LIMIT ?
    `);

    this.stmtDeleteConversation = this.db.prepare(`
      DELETE FROM analyst_conversations WHERE id = ?
    `);

    // Message statements
    this.stmtInsertMessage = this.db.prepare(`
      INSERT INTO analyst_messages (id, conversation_id, role, content, timestamp, tokens_used, model, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetMessages = this.db.prepare(`
      SELECT * FROM analyst_messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);

    this.stmtGetRecentMessages = this.db.prepare(`
      SELECT * FROM analyst_messages
      WHERE conversation_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    this.stmtCountMessages = this.db.prepare(`
      SELECT COUNT(*) as count FROM analyst_messages WHERE conversation_id = ?
    `);
  }

  /**
   * Create a new conversation.
   */
  createConversation(id, analystId, companyId = null, companySymbol = null, title = null) {
    const metadata = JSON.stringify({});

    try {
      this.stmtInsertConversation.run(
        id,
        analystId,
        companyId,
        companySymbol,
        title,
        metadata
      );

      const conversation = {
        id,
        analyst_id: analystId,
        company_id: companyId,
        company_symbol: companySymbol,
        title,
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {}
      };

      this._cacheSet(id, conversation);
      return conversation;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      throw error;
    }
  }

  /**
   * Get a conversation by ID.
   */
  getConversation(id) {
    // Check cache first
    const cached = this._cacheGet(id);
    if (cached) return cached;

    // Load from database
    const row = this.stmtGetConversation.get(id);
    if (!row) return null;

    // Load messages
    const messages = this.stmtGetMessages.all(id).map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      tokens_used: m.tokens_used,
      model: m.model,
      metadata: m.metadata ? JSON.parse(m.metadata) : {}
    }));

    const conversation = {
      id: row.id,
      analyst_id: row.analyst_id,
      company_id: row.company_id,
      company_symbol: row.company_symbol,
      title: row.title,
      summary: row.summary,
      messages,
      message_count: row.message_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    };

    this._cacheSet(id, conversation);
    return conversation;
  }

  /**
   * Add a message to a conversation.
   */
  addMessage(conversationId, message) {
    const {
      id,
      role,
      content,
      timestamp = new Date().toISOString(),
      tokens_used = 0,
      model = null,
      metadata = {}
    } = message;

    try {
      this.stmtInsertMessage.run(
        id,
        conversationId,
        role,
        content,
        timestamp,
        tokens_used,
        model,
        JSON.stringify(metadata)
      );

      // Update cache if conversation is cached
      const cached = this.cache.get(conversationId);
      if (cached) {
        cached.data.messages.push({
          id,
          role,
          content,
          timestamp,
          tokens_used,
          model,
          metadata
        });
        cached.data.updated_at = new Date().toISOString();
        cached.data.message_count = (cached.data.message_count || 0) + 1;
      }

      return true;
    } catch (error) {
      console.error('Failed to add message:', error);
      throw error;
    }
  }

  /**
   * Update conversation title or summary.
   */
  updateConversation(id, { title, summary, metadata }) {
    try {
      this.stmtUpdateConversation.run(
        title || null,
        summary || null,
        metadata ? JSON.stringify(metadata) : null,
        id
      );

      // Update cache
      const cached = this.cache.get(id);
      if (cached) {
        if (title) cached.data.title = title;
        if (summary) cached.data.summary = summary;
        if (metadata) cached.data.metadata = metadata;
        cached.data.updated_at = new Date().toISOString();
      }

      return true;
    } catch (error) {
      console.error('Failed to update conversation:', error);
      throw error;
    }
  }

  /**
   * List recent conversations.
   */
  listConversations(limit = 50) {
    const rows = this.stmtListConversations.all(limit);
    return rows.map(row => ({
      id: row.id,
      analyst_id: row.analyst_id,
      company_id: row.company_id,
      company_symbol: row.company_symbol,
      company_name: row.company_name,
      title: row.title,
      summary: row.summary,
      message_count: row.message_count,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  /**
   * List conversations for a specific analyst.
   */
  listByAnalyst(analystId, limit = 50) {
    const rows = this.stmtListByAnalyst.all(analystId, limit);
    return rows.map(row => ({
      id: row.id,
      analyst_id: row.analyst_id,
      company_id: row.company_id,
      company_symbol: row.company_symbol,
      company_name: row.company_name,
      title: row.title,
      summary: row.summary,
      message_count: row.message_count,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  /**
   * List conversations for a specific company.
   */
  listByCompany(companySymbol, limit = 50) {
    const rows = this.stmtListByCompany.all(companySymbol.toUpperCase(), limit);
    return rows.map(row => ({
      id: row.id,
      analyst_id: row.analyst_id,
      company_id: row.company_id,
      company_symbol: row.company_symbol,
      title: row.title,
      summary: row.summary,
      message_count: row.message_count,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }

  /**
   * Delete a conversation.
   */
  deleteConversation(id) {
    try {
      this.stmtDeleteConversation.run(id);
      this.cache.delete(id);
      return true;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      throw error;
    }
  }

  /**
   * Get recent messages from a conversation.
   */
  getRecentMessages(conversationId, limit = 10) {
    const rows = this.stmtGetRecentMessages.all(conversationId, limit);
    return rows.reverse().map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      tokens_used: m.tokens_used,
      model: m.model,
      metadata: m.metadata ? JSON.parse(m.metadata) : {}
    }));
  }

  /**
   * Get statistics.
   */
  getStats() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(DISTINCT c.analyst_id) as analysts_used,
        SUM(c.message_count) as total_messages,
        COUNT(DISTINCT c.company_symbol) as companies_discussed,
        MAX(c.updated_at) as last_activity
      FROM analyst_conversations c
    `).get();

    const byAnalyst = this.db.prepare(`
      SELECT analyst_id, COUNT(*) as count
      FROM analyst_conversations
      GROUP BY analyst_id
      ORDER BY count DESC
    `).all();

    return {
      ...stats,
      by_analyst: byAnalyst
    };
  }

  // Cache helpers
  _cacheGet(id) {
    const entry = this.cache.get(id);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.cacheMaxAge) {
      this.cache.delete(id);
      return null;
    }

    return entry.data;
  }

  _cacheSet(id, data) {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.floor(this.cacheMaxSize / 4));

      for (const [key] of oldest) {
        this.cache.delete(key);
      }
    }

    this.cache.set(id, { data, timestamp: Date.now() });
  }

  close() {
    this.db.close();
  }
}

// Singleton instance
let instance = null;

function getConversationStore(dbPath) {
  if (!instance) {
    instance = new ConversationStore(dbPath);
  }
  return instance;
}

module.exports = { ConversationStore, getConversationStore };
