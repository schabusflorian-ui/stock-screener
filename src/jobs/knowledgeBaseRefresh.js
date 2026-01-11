/**
 * Knowledge Base Refresh Job
 *
 * Maintains the AI knowledge base by:
 * 1. Scraping new content from investment sources (Buffett letters, Marks memos, etc.)
 * 2. Integrating market commentary from sentiment sources
 * 3. Rebuilding vector embeddings incrementally
 *
 * Schedule recommendations:
 * - Weekly: Full scrape of all sources (Sundays)
 * - Daily: Incremental scrape of dynamic sources (tech/market commentary)
 * - On-demand: After major market events
 *
 * Usage:
 *   node src/jobs/knowledgeBaseRefresh.js                 # Run full refresh
 *   node src/jobs/knowledgeBaseRefresh.js --incremental   # Run incremental (tech sources only)
 *   node src/jobs/knowledgeBaseRefresh.js --status        # Show status
 *   node src/jobs/knowledgeBaseRefresh.js --schedule      # Start scheduler daemon
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class KnowledgeBaseRefresh {
  constructor() {
    this.pythonScript = path.join(__dirname, '../../scripts/build_knowledge_base.py');
    this.dbPath = path.join(__dirname, '../../data/knowledge_vectors.db');
    this.knowledgeDir = path.join(__dirname, '../../knowledge_base');
    this.statusFile = path.join(__dirname, '../../data/knowledge_refresh_status.json');
    this.isRunning = false;
    this.lastRun = null;
    this.lastResult = null;
  }

  /**
   * Source categories for different refresh strategies
   *
   * Note: These refer to scraper sources. The knowledge base also includes
   * manually curated content in knowledge_base/ that gets processed during
   * embedding rebuilds (--skip-scrape mode processes all .txt files).
   */
  static SOURCES = {
    // Static sources - update weekly (new letters/memos are rare)
    static: ['buffett', 'marks', 'damodaran', 'taleb', 'spitznagel', 'farnam', 'housel'],

    // Dynamic sources - update daily (regular blog posts, market commentary)
    dynamic: ['a16z', 'evans', 'ark', 'ai'],

    // All scraper sources
    all: ['buffett', 'marks', 'farnam', 'damodaran', 'housel',
          'taleb', 'spitznagel', 'a16z', 'evans', 'ark', 'ai'],

    // Manually curated thought leaders (no scrapers, content added via files)
    // These are included automatically during embedding rebuilds
    curated: ['druckenmiller', 'gundlach', 'thiel', 'andreessen', 'klarman', 'chamath', 'sequoia']
  };

  /**
   * Run the Python knowledge base builder
   * @param {Object} options - Build options
   * @param {string[]} options.sources - Source keys to scrape
   * @param {boolean} options.skipScrape - Skip scraping, just rebuild embeddings
   * @param {number} options.limit - Limit items per source
   */
  runBuild(options = {}) {
    return new Promise((resolve, reject) => {
      if (this.isRunning) {
        reject(new Error('Knowledge base refresh already in progress'));
        return;
      }

      this.isRunning = true;
      const startTime = Date.now();

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${new Date().toISOString()}] Starting knowledge base refresh...`);
      console.log('='.repeat(60));

      // Build command arguments
      const args = [this.pythonScript];

      if (options.sources && options.sources.length > 0) {
        args.push('--sources', ...options.sources);
      }

      if (options.skipScrape) {
        args.push('--skip-scrape');
      }

      if (options.limit) {
        args.push('--limit', options.limit.toString());
      }

      console.log(`Command: python3 ${args.join(' ')}`);

      const pythonProcess = spawn('python3', args, {
        cwd: path.join(__dirname, '../..'),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      pythonProcess.on('close', (code) => {
        this.isRunning = false;
        this.lastRun = new Date();

        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

        const result = {
          success: code === 0,
          exitCode: code,
          duration: `${duration} minutes`,
          timestamp: this.lastRun.toISOString(),
          sources: options.sources || KnowledgeBaseRefresh.SOURCES.all,
          incremental: options.sources === KnowledgeBaseRefresh.SOURCES.dynamic,
          output: stdout,
          errors: stderr
        };

        this.lastResult = result;
        this.saveStatus(result);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${this.lastRun.toISOString()}] Knowledge base refresh completed`);
        console.log(`  Exit code: ${code}`);
        console.log(`  Duration: ${duration} minutes`);
        console.log(`  Sources: ${result.sources.join(', ')}`);
        console.log('='.repeat(60) + '\n');

        if (code === 0) {
          resolve(result);
        } else {
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      pythonProcess.on('error', (error) => {
        this.isRunning = false;
        reject(error);
      });
    });
  }

  /**
   * Run full refresh of all sources
   * This scrapes new content AND rebuilds all embeddings (including curated thought leaders)
   */
  runFullRefresh() {
    console.log('Running FULL knowledge base refresh (all sources + curated content)...');
    console.log('  Scraping: ' + KnowledgeBaseRefresh.SOURCES.all.join(', '));
    console.log('  Curated (auto-included): ' + KnowledgeBaseRefresh.SOURCES.curated.join(', '));
    return this.runBuild({
      sources: KnowledgeBaseRefresh.SOURCES.all
    });
  }

  /**
   * Run incremental refresh of dynamic sources only
   */
  runIncrementalRefresh() {
    console.log('Running INCREMENTAL knowledge base refresh (dynamic sources)...');
    return this.runBuild({
      sources: KnowledgeBaseRefresh.SOURCES.dynamic
    });
  }

  /**
   * Rebuild embeddings without re-scraping
   * This processes ALL content in knowledge_base/, including curated thought leaders
   */
  rebuildEmbeddings() {
    console.log('Rebuilding embeddings from ALL existing content...');
    console.log('  Includes curated thought leaders: ' + KnowledgeBaseRefresh.SOURCES.curated.join(', '));
    return this.runBuild({
      skipScrape: true
    });
  }

  /**
   * Save status to file for monitoring
   */
  saveStatus(result) {
    try {
      const statusDir = path.dirname(this.statusFile);
      if (!fs.existsSync(statusDir)) {
        fs.mkdirSync(statusDir, { recursive: true });
      }

      // Load existing history
      let history = [];
      if (fs.existsSync(this.statusFile)) {
        const existing = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        history = existing.history || [];
      }

      // Add new result (keep last 30)
      history.unshift({
        timestamp: result.timestamp,
        success: result.success,
        duration: result.duration,
        sources: result.sources,
        incremental: result.incremental
      });
      history = history.slice(0, 30);

      const status = {
        lastRun: result.timestamp,
        lastSuccess: result.success,
        isRunning: this.isRunning,
        history
      };

      fs.writeFileSync(this.statusFile, JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('Failed to save status:', error.message);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    const status = {
      isRunning: this.isRunning,
      lastRun: this.lastRun?.toISOString() || null,
      lastResult: this.lastResult ? {
        success: this.lastResult.success,
        duration: this.lastResult.duration,
        sources: this.lastResult.sources
      } : null,
      database: null,
      sources: null
    };

    // Check database stats
    if (fs.existsSync(this.dbPath)) {
      const stats = fs.statSync(this.dbPath);
      status.database = {
        path: this.dbPath,
        size: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        modified: stats.mtime.toISOString()
      };
    }

    // Check source directories
    if (fs.existsSync(this.knowledgeDir)) {
      status.sources = {};
      const categories = fs.readdirSync(this.knowledgeDir);

      for (const category of categories) {
        const categoryPath = path.join(this.knowledgeDir, category);
        if (fs.statSync(categoryPath).isDirectory()) {
          const subDirs = fs.readdirSync(categoryPath);
          for (const subDir of subDirs) {
            const subPath = path.join(categoryPath, subDir);
            if (fs.statSync(subPath).isDirectory()) {
              const files = fs.readdirSync(subPath).filter(f => f.endsWith('.txt'));
              status.sources[`${category}/${subDir}`] = files.length;
            }
          }
        }
      }
    }

    // Load history
    if (fs.existsSync(this.statusFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.statusFile, 'utf8'));
        status.history = saved.history || [];
      } catch (e) {
        status.history = [];
      }
    }

    return status;
  }

  /**
   * Start the scheduler daemon
   *
   * Schedule:
   * - Sunday 3:00 AM: Full refresh (all sources)
   * - Daily 6:00 AM: Incremental refresh (dynamic sources)
   */
  start() {
    console.log('\n' + '='.repeat(60));
    console.log('  Knowledge Base Refresh Scheduler Started');
    console.log('='.repeat(60));
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('  Schedule:');
    console.log('    - Sunday 3:00 AM: Full refresh (all sources)');
    console.log('    - Daily 6:00 AM: Incremental refresh (tech sources)');
    console.log('='.repeat(60) + '\n');

    // Weekly full refresh: Sunday at 3:00 AM
    const weeklyTask = cron.schedule('0 3 * * 0', async () => {
      console.log(`\n[${new Date().toISOString()}] Weekly full refresh triggered`);
      try {
        await this.runFullRefresh();
      } catch (error) {
        console.error('Weekly refresh failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    // Daily incremental: Every day at 6:00 AM (except Sunday)
    const dailyTask = cron.schedule('0 6 * * 1-6', async () => {
      console.log(`\n[${new Date().toISOString()}] Daily incremental refresh triggered`);
      try {
        await this.runIncrementalRefresh();
      } catch (error) {
        console.error('Daily refresh failed:', error.message);
      }
    }, {
      scheduled: true,
      timezone: 'America/New_York'
    });

    console.log('Scheduler running. Press Ctrl+C to stop.\n');

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nScheduler stopped.');
      weeklyTask.stop();
      dailyTask.stop();
      process.exit(0);
    });
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const refresher = new KnowledgeBaseRefresh();

  if (args.includes('--status') || args.includes('-s')) {
    // Show status
    const status = refresher.getStatus();
    console.log('\n' + '='.repeat(50));
    console.log('  Knowledge Base Status');
    console.log('='.repeat(50));

    if (status.database) {
      console.log('\nDatabase:');
      console.log(`  Path: ${status.database.path}`);
      console.log(`  Size: ${status.database.size}`);
      console.log(`  Modified: ${status.database.modified}`);
    }

    if (status.sources) {
      console.log('\nSources (document count):');
      for (const [source, count] of Object.entries(status.sources)) {
        console.log(`  ${source}: ${count}`);
      }
    }

    if (status.history && status.history.length > 0) {
      console.log('\nRecent runs:');
      for (const run of status.history.slice(0, 5)) {
        const marker = run.success ? '✓' : '✗';
        const type = run.incremental ? 'incremental' : 'full';
        console.log(`  ${marker} ${run.timestamp} (${type}, ${run.duration})`);
      }
    }
    console.log('');

  } else if (args.includes('--incremental') || args.includes('-i')) {
    // Incremental refresh
    refresher.runIncrementalRefresh()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Incremental refresh failed:', err.message);
        process.exit(1);
      });

  } else if (args.includes('--rebuild') || args.includes('-r')) {
    // Rebuild embeddings only
    refresher.rebuildEmbeddings()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Rebuild failed:', err.message);
        process.exit(1);
      });

  } else if (args.includes('--schedule') || args.includes('-d')) {
    // Start scheduler daemon
    refresher.start();

  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Knowledge Base Refresh Job

Usage:
  node src/jobs/knowledgeBaseRefresh.js [options]

Options:
  (none)            Run full refresh of all sources
  --incremental, -i Run incremental refresh (tech sources only)
  --rebuild, -r     Rebuild embeddings from existing content
  --status, -s      Show current knowledge base status
  --schedule, -d    Start scheduler daemon
  --help, -h        Show this help message

Sources (with scrapers):
  Static (weekly):  buffett, marks, damodaran, taleb, spitznagel, farnam, housel
  Dynamic (daily):  a16z, evans, ark, ai

Curated thought leaders (no scrapers, included in rebuilds):
  druckenmiller, gundlach, thiel, andreessen, klarman, chamath, sequoia

Schedule (when using --schedule):
  - Sunday 3:00 AM ET: Full refresh (all sources + rebuild embeddings)
  - Mon-Sat 6:00 AM ET: Incremental refresh (dynamic sources only)
`);

  } else {
    // Default: run full refresh
    refresher.runFullRefresh()
      .then(() => process.exit(0))
      .catch(err => {
        console.error('Full refresh failed:', err.message);
        process.exit(1);
      });
  }
}

module.exports = KnowledgeBaseRefresh;
