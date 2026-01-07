// src/services/agent/index.js
// AI Trading Agent - Main exports

const { TradingAgent, ACTIONS } = require('./tradingAgent');
const { RiskManager } = require('./riskManager');
const { OpportunityScanner } = require('./opportunityScanner');
const { TradingOrchestrator } = require('./orchestrator');
const {
  SignalEnhancer,
  REGIME_WEIGHT_MATRIX,
  SIGNAL_HALF_LIVES,
  DEFAULT_COST_PARAMS,
} = require('./signalEnhancements');
const { SignalOptimizer } = require('./signalOptimizer');
const { SignalPerformanceTracker } = require('./signalPerformanceTracker');
const { RecommendationTracker } = require('./recommendationTracker');

// Singleton instances
let _tradingAgent = null;
let _riskManager = null;
let _scanner = null;
let _orchestrator = null;

/**
 * Initialize all agent services with database connection
 * @param {Database} db - better-sqlite3 database instance
 * @param {Object} config - Configuration options
 */
function initializeAgentServices(db, config = {}) {
  _tradingAgent = new TradingAgent(db, config.agentConfig);
  _riskManager = new RiskManager(db, config.riskConfig);
  _scanner = new OpportunityScanner(db, config.scannerConfig);
  _orchestrator = new TradingOrchestrator(db, config);

  console.log('🤖 AI Trading Agent services initialized');

  return {
    tradingAgent: _tradingAgent,
    riskManager: _riskManager,
    scanner: _scanner,
    orchestrator: _orchestrator,
  };
}

/**
 * Get initialized agent services
 */
function getAgentServices() {
  return {
    tradingAgent: _tradingAgent,
    riskManager: _riskManager,
    scanner: _scanner,
    orchestrator: _orchestrator,
  };
}

/**
 * Get or create orchestrator instance
 */
function getOrchestrator(db, config = {}) {
  if (!_orchestrator) {
    _orchestrator = new TradingOrchestrator(db, config);
  }
  return _orchestrator;
}

/**
 * Get or create trading agent instance
 */
function getTradingAgent(db, config = {}) {
  if (!_tradingAgent) {
    _tradingAgent = new TradingAgent(db, config);
  }
  return _tradingAgent;
}

/**
 * Get or create risk manager instance
 */
function getRiskManager(db, config = {}) {
  if (!_riskManager) {
    _riskManager = new RiskManager(db, config);
  }
  return _riskManager;
}

/**
 * Get or create opportunity scanner instance
 */
function getScanner(db, config = {}) {
  if (!_scanner) {
    _scanner = new OpportunityScanner(db, config);
  }
  return _scanner;
}

module.exports = {
  // Classes
  TradingAgent,
  RiskManager,
  OpportunityScanner,
  TradingOrchestrator,
  SignalEnhancer,
  SignalOptimizer,
  SignalPerformanceTracker,
  RecommendationTracker,

  // Constants
  ACTIONS,
  REGIME_WEIGHT_MATRIX,
  SIGNAL_HALF_LIVES,
  DEFAULT_COST_PARAMS,

  // Factory functions
  initializeAgentServices,
  getAgentServices,
  getOrchestrator,
  getTradingAgent,
  getRiskManager,
  getScanner,
};
