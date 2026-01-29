/**
 * Agent Lifecycle Runner
 *
 * Handles agent and portfolio CRUD operations for stress testing
 */

class AgentLifecycleRunner {
  constructor(db, options = {}) {
    this.db = db;
    this.verbose = options.verbose || false;
    this.issueCollector = options.issueCollector;
    this.metricsCollector = options.metricsCollector;

    // Lazy-loaded services
    this._agentService = null;
    this._portfolioService = null;
    this._paperEngine = null;
  }

  /**
   * Get agent service (lazy load)
   */
  getAgentService() {
    if (!this._agentService) {
      try {
        this._agentService = require('../../../src/services/agent/agentService');
      } catch (e) {
        console.error('Failed to load agentService:', e.message);
        throw e;
      }
    }
    return this._agentService;
  }

  /**
   * Get portfolio service (lazy load)
   */
  getPortfolioService() {
    if (!this._portfolioService) {
      try {
        const { getPortfolioService } = require('../../../src/services/portfolio');
        this._portfolioService = getPortfolioService(this.db);
      } catch (e) {
        // Fallback to direct database operations
        this._portfolioService = this.createFallbackPortfolioService();
      }
    }
    return this._portfolioService;
  }

  /**
   * Create fallback portfolio service using direct DB
   */
  createFallbackPortfolioService() {
    const db = this.db;
    return {
      createPortfolio(config) {
        const result = db.prepare(`
          INSERT INTO portfolios (name, description, portfolio_type, initial_cash, current_cash, currency, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          config.name,
          config.description || '',
          config.portfolioType || 'manual',
          config.initialCash || 100000,
          config.initialCash || 100000,
          config.currency || 'USD'
        );
        return {
          portfolioId: result.lastInsertRowid,
          name: config.name
        };
      },
      getPortfolio(id) {
        return db.prepare('SELECT * FROM portfolios WHERE id = ?').get(id);
      }
    };
  }

  /**
   * Get paper trading engine (lazy load)
   */
  getPaperEngine() {
    if (!this._paperEngine) {
      try {
        const { PaperTradingEngine } = require('../../../src/services/trading/paperTrading');
        this._paperEngine = new PaperTradingEngine(this.db);
      } catch (e) {
        // Create fallback paper engine
        this._paperEngine = this.createFallbackPaperEngine();
      }
    }
    return this._paperEngine;
  }

  /**
   * Create fallback paper trading engine
   */
  createFallbackPaperEngine() {
    const db = this.db;
    return {
      createAccount(name, initialCapital) {
        // Check if tables exist, create if needed
        db.exec(`
          CREATE TABLE IF NOT EXISTS paper_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            initial_capital REAL,
            cash_balance REAL,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);

        const result = db.prepare(`
          INSERT INTO paper_accounts (name, initial_capital, cash_balance)
          VALUES (?, ?, ?)
        `).run(name, initialCapital, initialCapital);

        return {
          id: result.lastInsertRowid,
          name,
          initialCapital,
          cashBalance: initialCapital
        };
      },
      getAccount(name) {
        const account = db.prepare('SELECT * FROM paper_accounts WHERE name = ?').get(name);
        if (!account) throw new Error(`Account not found: ${name}`);
        return account;
      },
      takeSnapshot(accountId) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS paper_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            portfolio_value REAL,
            cash_balance REAL,
            snapshot_date TEXT DEFAULT (datetime('now'))
          )
        `);

        const account = db.prepare('SELECT * FROM paper_accounts WHERE id = ?').get(accountId);
        if (account) {
          db.prepare(`
            INSERT INTO paper_snapshots (account_id, portfolio_value, cash_balance)
            VALUES (?, ?, ?)
          `).run(accountId, account.cash_balance, account.cash_balance);
        }
      }
    };
  }

  /**
   * Create a portfolio for testing
   */
  async createPortfolio(config) {
    const startTime = Date.now();
    try {
      const service = this.getPortfolioService();
      const result = service.createPortfolio({
        name: config.name,
        description: config.description || 'Stress test portfolio',
        portfolioType: config.portfolioType || 'manual',
        initialCash: config.initialCash || 100000,
        currency: config.currency || 'USD'
      });

      this.metricsCollector?.recordPerformance('portfolio_create', Date.now() - startTime, true);

      return {
        portfolioId: result.portfolioId,
        name: result.name || config.name
      };
    } catch (error) {
      this.metricsCollector?.recordPerformance('portfolio_create', Date.now() - startTime, false);
      this.issueCollector?.addIssue({
        severity: 'HIGH',
        category: 'SETUP',
        message: `Failed to create portfolio: ${error.message}`,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create a paper trading account
   */
  async createPaperAccount(portfolioId, initialCapital) {
    const startTime = Date.now();
    const accountName = `test_portfolio_${portfolioId}_${Date.now()}`;

    try {
      const engine = this.getPaperEngine();

      // Try to get existing account first
      try {
        const existing = engine.getAccount(accountName);
        if (existing) {
          return existing;
        }
      } catch (e) {
        // Account doesn't exist, create it
      }

      const account = engine.createAccount(accountName, initialCapital);
      this.metricsCollector?.recordPerformance('paper_account_create', Date.now() - startTime, true);

      return account;
    } catch (error) {
      this.metricsCollector?.recordPerformance('paper_account_create', Date.now() - startTime, false);
      this.issueCollector?.addIssue({
        severity: 'MEDIUM',
        category: 'SETUP',
        message: `Failed to create paper account: ${error.message}`,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create an agent with full configuration
   */
  async createAgent(config, portfolioId) {
    const startTime = Date.now();
    try {
      const agentService = this.getAgentService();

      // Create the agent
      const agent = agentService.createAgent(config);

      // Attach portfolio if provided
      if (portfolioId && agent.id) {
        try {
          agentService.attachPortfolio(agent.id, portfolioId, 'paper');
        } catch (e) {
          if (this.verbose) {
            console.log(`    [WARN] Could not attach portfolio: ${e.message}`);
          }
        }
      }

      this.metricsCollector?.recordPerformance('agent_create', Date.now() - startTime, true);

      return agent;
    } catch (error) {
      this.metricsCollector?.recordPerformance('agent_create', Date.now() - startTime, false);
      this.issueCollector?.addIssue({
        severity: 'HIGH',
        category: 'SETUP',
        message: `Failed to create agent: ${error.message}`,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start an agent
   */
  async startAgent(agentId) {
    const startTime = Date.now();
    try {
      const agentService = this.getAgentService();
      const result = agentService.startAgent(agentId);
      this.metricsCollector?.recordPerformance('agent_start', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.metricsCollector?.recordPerformance('agent_start', Date.now() - startTime, false);
      this.issueCollector?.addIssue({
        severity: 'MEDIUM',
        category: 'SETUP',
        message: `Failed to start agent ${agentId}: ${error.message}`,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Pause an agent
   */
  async pauseAgent(agentId) {
    const startTime = Date.now();
    try {
      const agentService = this.getAgentService();
      const result = agentService.pauseAgent(agentId);
      this.metricsCollector?.recordPerformance('agent_pause', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.metricsCollector?.recordPerformance('agent_pause', Date.now() - startTime, false);
      if (this.verbose) {
        console.log(`    [WARN] Failed to pause agent: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Run a scan for an agent
   */
  async runScan(agentId) {
    const startTime = Date.now();
    try {
      const agentService = this.getAgentService();
      const result = agentService.runScan(agentId);
      this.metricsCollector?.recordPerformance('agent_scan', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.metricsCollector?.recordPerformance('agent_scan', Date.now() - startTime, false);
      throw error;
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    try {
      const agentService = this.getAgentService();
      return agentService.getAgent(agentId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get pending signals for an agent
   */
  getPendingSignals(agentId) {
    try {
      const agentService = this.getAgentService();
      return agentService.getPendingSignals(agentId) || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Approve a signal
   */
  async approveSignal(signalId, portfolioId) {
    const startTime = Date.now();
    try {
      const agentService = this.getAgentService();
      const result = agentService.approveSignal(signalId, portfolioId);
      this.metricsCollector?.recordPerformance('signal_approve', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.metricsCollector?.recordPerformance('signal_approve', Date.now() - startTime, false);
      throw error;
    }
  }

  /**
   * Delete an agent (cleanup)
   */
  async deleteAgent(agentId) {
    try {
      const agentService = this.getAgentService();
      return agentService.deleteAgent(agentId);
    } catch (error) {
      if (this.verbose) {
        console.log(`    [WARN] Failed to delete agent: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Delete a portfolio (cleanup)
   */
  async deletePortfolio(portfolioId) {
    try {
      this.db.prepare('DELETE FROM portfolios WHERE id = ?').run(portfolioId);
      return true;
    } catch (error) {
      if (this.verbose) {
        console.log(`    [WARN] Failed to delete portfolio: ${error.message}`);
      }
      return false;
    }
  }
}

module.exports = { AgentLifecycleRunner };
