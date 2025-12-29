// src/services/updates/bundles/knowledgeBundle.js
/**
 * Knowledge Base Update Bundle
 *
 * Handles all knowledge base update jobs:
 * - knowledge.incremental - Daily incremental refresh
 * - knowledge.full - Weekly full rebuild
 */

const KnowledgeBaseRefresh = require('../../../jobs/knowledgeBaseRefresh');

class KnowledgeBundle {
  constructor() {
    this.knowledgeRefresher = new KnowledgeBaseRefresh();
  }

  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'knowledge.incremental':
        return this.runIncrementalRefresh(db, onProgress);
      case 'knowledge.full':
        return this.runFullRefresh(db, onProgress);
      default:
        throw new Error(`Unknown knowledge job: ${jobKey}`);
    }
  }

  async runIncrementalRefresh(db, onProgress) {
    await onProgress(5, 'Starting incremental knowledge base refresh...');

    try {
      await onProgress(10, 'Refreshing investment sources...');
      await this.knowledgeRefresher.runIncrementalRefresh();

      const stats = this.getKnowledgeStats(db);
      await onProgress(100, 'Incremental refresh complete');

      return {
        itemsTotal: stats.totalDocuments,
        itemsProcessed: stats.recentlyUpdated,
        itemsUpdated: stats.recentlyUpdated,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  async runFullRefresh(db, onProgress) {
    await onProgress(5, 'Starting full knowledge base rebuild...');

    try {
      await onProgress(10, 'Rebuilding knowledge base...');
      await this.knowledgeRefresher.runFullRefresh();

      const stats = this.getKnowledgeStats(db);
      await onProgress(100, 'Full rebuild complete');

      return {
        itemsTotal: stats.totalDocuments,
        itemsProcessed: stats.totalDocuments,
        itemsUpdated: stats.totalDocuments,
        itemsFailed: 0
      };
    } catch (error) {
      throw error;
    }
  }

  getKnowledgeStats(db) {
    try {
      const totalDocuments = db.prepare(`
        SELECT COUNT(*) as count FROM knowledge_base
      `).get()?.count || 0;

      const recentlyUpdated = db.prepare(`
        SELECT COUNT(*) as count FROM knowledge_base
        WHERE updated_at > datetime('now', '-1 day')
      `).get()?.count || 0;

      return { totalDocuments, recentlyUpdated };
    } catch {
      return { totalDocuments: 0, recentlyUpdated: 0 };
    }
  }
}

const knowledgeBundle = new KnowledgeBundle();

module.exports = {
  execute: (jobKey, db, context) => knowledgeBundle.execute(jobKey, db, context)
};
