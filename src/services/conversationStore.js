// src/services/conversationStore.js
/**
 * Persistent storage for AI analyst conversations.
 *
 * Stores conversations and messages with caching for frequently accessed conversations.
 * Fully async with PostgreSQL/SQLite support via database abstraction layer.
 */

const { getDatabaseAsync } = require('../lib/db');

class ConversationStore {
  constructor() {
    this.cache = new Map();
    this.cacheMaxSize = 100;
    this.cacheMaxAge = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Create a new conversation.
   */
  async createConversation(id, analystId, companyId = null, companySymbol = null, title = null) {
    const metadata = JSON.stringify({});
    const database = await getDatabaseAsync();

    try {
      await database.query(`
        INSERT INTO analyst_conversations (id, analyst_id, company_id, company_symbol, title, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [id, analystId, companyId, companySymbol, title, metadata]);

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
  async getConversation(id) {
    // Check cache first
    const cached = this._cacheGet(id);
    if (cached) return cached;

    const database = await getDatabaseAsync();

    // Load from database
    const result = await database.query(`
      SELECT * FROM analyst_conversations WHERE id = $1
    `, [id]);
    const row = result.rows[0];
    if (!row) return null;

    // Load messages
    const messagesResult = await database.query(`
      SELECT * FROM analyst_messages
      WHERE conversation_id = $1
      ORDER BY timestamp ASC
    `, [id]);

    const messages = messagesResult.rows.map(m => ({
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
  async addMessage(conversationId, message) {
    const {
      id,
      role,
      content,
      timestamp = new Date().toISOString(),
      tokens_used = 0,
      model = null,
      metadata = {}
    } = message;

    const database = await getDatabaseAsync();

    try {
      await database.query(`
        INSERT INTO analyst_messages (id, conversation_id, role, content, timestamp, tokens_used, model, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [id, conversationId, role, content, timestamp, tokens_used, model, JSON.stringify(metadata)]);

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
  async updateConversation(id, { title, summary, metadata }) {
    const database = await getDatabaseAsync();

    try {
      await database.query(`
        UPDATE analyst_conversations
        SET title = COALESCE($1, title),
            summary = COALESCE($2, summary),
            metadata = COALESCE($3, metadata),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [title || null, summary || null, metadata ? JSON.stringify(metadata) : null, id]);

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
  async listConversations(limit = 50) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT c.*, co.name as company_name
      FROM analyst_conversations c
      LEFT JOIN companies co ON c.company_id = co.id
      ORDER BY c.updated_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
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
  async listByAnalyst(analystId, limit = 50) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT c.*, co.name as company_name
      FROM analyst_conversations c
      LEFT JOIN companies co ON c.company_id = co.id
      WHERE c.analyst_id = $1
      ORDER BY c.updated_at DESC
      LIMIT $2
    `, [analystId, limit]);

    return result.rows.map(row => ({
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
  async listByCompany(companySymbol, limit = 50) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT c.*
      FROM analyst_conversations c
      WHERE c.company_symbol = $1
      ORDER BY c.updated_at DESC
      LIMIT $2
    `, [companySymbol.toUpperCase(), limit]);

    return result.rows.map(row => ({
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
  async deleteConversation(id) {
    const database = await getDatabaseAsync();

    try {
      await database.query(`
        DELETE FROM analyst_conversations WHERE id = $1
      `, [id]);
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
  async getRecentMessages(conversationId, limit = 10) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM analyst_messages
      WHERE conversation_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `, [conversationId, limit]);

    return result.rows.reverse().map(m => ({
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
  async getStats() {
    const database = await getDatabaseAsync();

    const statsResult = await database.query(`
      SELECT
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(DISTINCT c.analyst_id) as analysts_used,
        SUM(c.message_count) as total_messages,
        COUNT(DISTINCT c.company_symbol) as companies_discussed,
        MAX(c.updated_at) as last_activity
      FROM analyst_conversations c
    `);

    const byAnalystResult = await database.query(`
      SELECT analyst_id, COUNT(*) as count
      FROM analyst_conversations
      GROUP BY analyst_id
      ORDER BY count DESC
    `);

    return {
      ...statsResult.rows[0],
      by_analyst: byAnalystResult.rows
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
    // The main database.js module manages the connection lifecycle
    this.cache.clear();
  }
}

// Singleton instance
let instance = null;

function getConversationStore() {
  if (!instance) {
    instance = new ConversationStore();
  }
  return instance;
}

module.exports = { ConversationStore, getConversationStore };
