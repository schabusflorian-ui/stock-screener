// src/jobs/snapshotCreator.js
// Daily Portfolio Snapshot Creator (Agent 2)
// Run at 7:00 PM ET daily (after market close)

const cron = require('node-cron');
const { metricsEngine } = require('../services/portfolio');

class SnapshotCreator {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  // Schedule daily snapshot creation at 7:00 PM ET (weekdays only)
  start() {
    // Cron format: second minute hour day month day-of-week
    // 0 19 * * 1-5 = 7:00 PM, Monday through Friday
    cron.schedule('0 19 * * 1-5', async () => {
      console.log('📸 Running scheduled portfolio snapshot creation...');
      await this.createSnapshots();
    }, {
      timezone: 'America/New_York'
    });

    console.log('📸 Snapshot Creator scheduled: 7:00 PM ET, weekdays');
  }

  // Manually trigger snapshot creation
  async createSnapshots(date = null) {
    if (this.isRunning) {
      console.log('⚠️ Snapshot creation already in progress');
      return {
        success: false,
        error: 'Snapshot creation already in progress'
      };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const snapshotDate = date || new Date().toISOString().split('T')[0];
      console.log(`📸 Creating snapshots for ${snapshotDate}...`);

      const result = metricsEngine.createAllDailySnapshots(snapshotDate);

      const elapsedMs = Date.now() - startTime;
      this.lastRun = new Date().toISOString();
      this.lastResult = {
        ...result,
        executionTimeMs: elapsedMs
      };

      console.log(`✅ Snapshots complete: ${result.successful}/${result.processed} successful in ${elapsedMs}ms`);

      if (result.failed > 0) {
        console.log('⚠️ Failed snapshots:');
        result.results
          .filter(r => !r.success)
          .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
      }

      return this.lastResult;
    } catch (error) {
      console.error('❌ Error creating snapshots:', error);
      this.lastResult = {
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startTime
      };
      return this.lastResult;
    } finally {
      this.isRunning = false;
    }
  }

  // Get status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      lastResult: this.lastResult,
      schedule: {
        time: '7:00 PM ET',
        days: 'Monday - Friday',
        timezone: 'America/New_York'
      }
    };
  }

  // Backfill snapshots for date range
  async backfillSnapshots(startDate, endDate) {
    console.log(`📸 Backfilling snapshots from ${startDate} to ${endDate}...`);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const results = [];

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();

      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        console.log(`   Creating snapshots for ${dateStr}...`);
        const result = await this.createSnapshots(dateStr);
        results.push({ date: dateStr, ...result });

        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      current.setDate(current.getDate() + 1);
    }

    const successful = results.filter(r => r.success !== false).length;
    console.log(`✅ Backfill complete: ${successful}/${results.length} days processed`);

    return {
      startDate,
      endDate,
      daysProcessed: results.length,
      successful,
      results
    };
  }
}

// Create singleton instance
const snapshotCreator = new SnapshotCreator();

// Export both the class and the instance
module.exports = {
  SnapshotCreator,
  snapshotCreator
};

// If run directly, start the scheduler
if (require.main === module) {
  console.log('🚀 Starting Snapshot Creator...');
  snapshotCreator.start();

  // Run immediately for testing if --now flag is passed
  if (process.argv.includes('--now')) {
    snapshotCreator.createSnapshots().then(result => {
      console.log('Result:', JSON.stringify(result, null, 2));
    });
  }
}
