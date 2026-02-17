// src/services/updates/bundles/capitalBundle.js
/**
 * Capital Update Bundle
 *
 * Handles capital allocation update jobs:
 * - capital.allocation - Recalculate capital_allocation_summary from financial_data
 */

const { getDatabaseAsync } = require('../../../lib/db');

class CapitalBundle {
  async execute(jobKey, db, context) {
    const { onProgress } = context;

    switch (jobKey) {
      case 'capital.allocation':
        return this.runCapitalAllocationUpdate(db, onProgress);
      default:
        throw new Error(`Unknown capital job: ${jobKey}`);
    }
  }

  async runCapitalAllocationUpdate(db, onProgress) {
    await onProgress(5, 'Starting capital allocation update...');

    try {
      // Import the runCapitalUpdate function from capital routes
      const capitalRouter = require('../../../api/routes/capital');

      if (typeof capitalRouter.runCapitalUpdate !== 'function') {
        await onProgress(100, 'Skipped: runCapitalUpdate function not available');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          metadata: { skipped: true, reason: 'runCapitalUpdate function not available' }
        };
      }

      await onProgress(10, 'Recalculating capital allocation summaries...');

      // Run the capital update
      await capitalRouter.runCapitalUpdate();

      await onProgress(90, 'Capital allocation update complete, counting records...');

      // Get count of updated records for metrics
      const database = await getDatabaseAsync();
      const countResult = await database.query(
        'SELECT COUNT(DISTINCT company_id) as count FROM capital_allocation_summary'
      );
      const count = parseInt(countResult.rows[0]?.count || 0, 10);

      await onProgress(100, `Capital allocation update complete: ${count} companies updated`);

      return {
        itemsTotal: count,
        itemsProcessed: count,
        itemsUpdated: count,
        itemsFailed: 0,
        metadata: { companiesUpdated: count }
      };
    } catch (error) {
      // If the capital allocation table or function doesn't exist, return gracefully
      if (error.message.includes('does not exist') || error.message.includes('Cannot find module')) {
        await onProgress(100, 'Skipped: Capital allocation not available');
        return {
          itemsTotal: 0,
          itemsProcessed: 0,
          itemsUpdated: 0,
          itemsFailed: 0,
          metadata: { skipped: true, reason: error.message }
        };
      }
      throw error;
    }
  }
}

const capitalBundle = new CapitalBundle();

module.exports = {
  execute: (jobKey, db, context) => capitalBundle.execute(jobKey, db, context)
};
