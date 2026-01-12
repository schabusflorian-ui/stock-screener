// src/lib/gracefulShutdown.js
// Graceful shutdown handler for production deployments

/**
 * Graceful shutdown manager
 * Handles SIGTERM, SIGINT, and uncaught exceptions
 */
class GracefulShutdown {
  constructor() {
    this.isShuttingDown = false;
    this.shutdownTimeout = 30000; // 30 seconds
    this.handlers = [];
    this.server = null;
  }

  /**
   * Register a cleanup handler
   * @param {string} name - Handler name for logging
   * @param {Function} handler - Async function to run on shutdown
   */
  register(name, handler) {
    this.handlers.push({ name, handler });
    console.log(`📝 Registered shutdown handler: ${name}`);
  }

  /**
   * Set the HTTP server to close
   * @param {Object} server - Express server instance
   */
  setServer(server) {
    this.server = server;
  }

  /**
   * Initialize signal handlers
   */
  init() {
    // Handle graceful shutdown signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('💥 Uncaught Exception:', err);
      this.shutdown('uncaughtException', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit on unhandled rejections, just log
    });

    console.log('✅ Graceful shutdown handlers initialized');
  }

  /**
   * Perform graceful shutdown
   * @param {string} signal - Signal that triggered shutdown
   * @param {number} exitCode - Exit code (default 0)
   */
  async shutdown(signal, exitCode = 0) {
    if (this.isShuttingDown) {
      console.log('⏳ Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    // Set a timeout for force exit
    const forceExitTimeout = setTimeout(() => {
      console.error('⚠️  Shutdown timeout reached, forcing exit...');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Stop accepting new connections
      if (this.server) {
        console.log('📡 Stopping HTTP server...');
        await new Promise((resolve, reject) => {
          this.server.close((err) => {
            if (err) {
              console.error('❌ Error closing server:', err);
              reject(err);
            } else {
              console.log('✅ HTTP server closed');
              resolve();
            }
          });
        });
      }

      // Run all registered cleanup handlers
      for (const { name, handler } of this.handlers) {
        try {
          console.log(`🧹 Running cleanup: ${name}...`);
          await handler();
          console.log(`✅ ${name} cleanup complete`);
        } catch (err) {
          console.error(`❌ Error in ${name} cleanup:`, err);
        }
      }

      clearTimeout(forceExitTimeout);
      console.log('👋 Graceful shutdown complete');
      process.exit(exitCode);
    } catch (err) {
      clearTimeout(forceExitTimeout);
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get the graceful shutdown manager instance
 */
function getGracefulShutdown() {
  if (!instance) {
    instance = new GracefulShutdown();
  }
  return instance;
}

/**
 * Initialize graceful shutdown for an Express app
 * @param {Object} server - Express server instance
 * @param {Object} db - Database instance to close
 */
function initGracefulShutdown(server, db = null) {
  const shutdown = getGracefulShutdown();

  shutdown.setServer(server);

  // Register database cleanup
  if (db) {
    shutdown.register('database', async () => {
      if (typeof db.close === 'function') {
        await db.close();
      } else if (db.raw && typeof db.raw.close === 'function') {
        await db.raw.close();
      }
    });
  }

  // Register Sentry flush (if available)
  try {
    const Sentry = require('@sentry/node');
    shutdown.register('sentry', async () => {
      await Sentry.close(2000);
    });
  } catch {
    // Sentry not installed, skip
  }

  shutdown.init();
  return shutdown;
}

module.exports = {
  GracefulShutdown,
  getGracefulShutdown,
  initGracefulShutdown,
};
