// src/services/updates/bundles/knowledgeBundle.js
/**
 * Knowledge Base Update Bundle
 *
 * Handles all knowledge base update jobs:
 * - knowledge.incremental - Daily incremental refresh
 * - knowledge.full - Weekly full rebuild
 */

const { getDatabaseAsync } = require('../../../database');
const KnowledgeBaseRefresh = require('../../../jobs/knowledgeBaseRefresh');

class KnowledgeBundle {
  constructor() {
    this.knowledgeRefresher = new KnowledgeBaseRefresh();
  }

  async execute(jobKey, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'knowledge.incremental':
        return this.runIncrementalRefresh(onProgress);
      case 'knowledge.full':
        return this.runFullRefresh(onProgress);
      default:
        throw new Error(`Unknown knowledge job: ${jobKey}`);
    }
  }

  async runIncrementalRefresh(onProgress) {
    const database = await getDatabaseAsync();

    await onProgress(5, 'Starting incremental knowledge base refresh...');

    await onProgress(10, 'Refreshing investment sources...');
    await this.knowledgeRefresher.runIncrementalRefresh();

    const stats = await this.getKnowledgeStats(database);
    await onProgress(100, 'Incremental refresh complete');

    return {
      itemsTotal: stats.totalDocuments,
      itemsProcessed: stats.recentlyUpdated,
      itemsUpdated: stats.recentlyUpdated,
      itemsFailed: 0
    };
  }

  async runFullRefresh(onProgress) {
    const database = await getDatabaseAsync();

    await onProgress(5, 'Starting full knowledge base rebuild...');

    await onProgress(10, 'Rebuilding knowledge base...');
    await this.knowledgeRefresher.runFullRefresh();

    const stats = await this.getKnowledgeStats(database);
    await onProgress(100, 'Full rebuild complete');

    return {
      itemsTotal: stats.totalDocuments,
      itemsProcessed: stats.totalDocuments,
      itemsUpdated: stats.totalDocuments,
      itemsFailed: 0
    };
  }

  async getKnowledgeStats(database) {
    try {
      const totalDocumentsResult = await database.query(`
        SELECT COUNT(*) as count FROM knowledge_base
      `);
      const totalDocuments = totalDocumentsResult.rows[0]?.count || 0;

      const recentlyUpdatedResult = await database.query(`
        SELECT COUNT(*) as count FROM knowledge_base
        WHERE updated_at > CURRENT_TIMESTAMP - INTERVAL '1 day'
      `);
      const recentlyUpdated = recentlyUpdatedResult.rows[0]?.count || 0;

      return { totalDocuments, recentlyUpdated };
    } catch {
      return { totalDocuments: 0, recentlyUpdated: 0 };
    }
  }
}

const knowledgeBundle = new KnowledgeBundle();

module.exports = {
  execute: (jobKey, context) => knowledgeBundle.execute(jobKey, context)
};
