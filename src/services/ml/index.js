// src/services/ml/index.js
// Machine Learning Services - Main exports

const { MLSignalCombiner, GradientBoostingRegressor } = require('./signalCombiner');
const { HiddenMarkovRegimeModel, RegimeHMMService } = require('./regimeHMM');

// Singleton instances
let _signalCombiner = null;
let _regimeHMM = null;

/**
 * Initialize ML services with database connection
 * @param {Database} db - lib/db wrapper or better-sqlite3 instance
 * @param {Object} config - Configuration options
 */
async function initializeMLServices(db, config = {}) {
  _signalCombiner = new MLSignalCombiner(db, config.signalCombinerConfig);
  _regimeHMM = new RegimeHMMService(db, config.regimeHMMConfig);

  // Try to load pre-trained models (fire-and-forget - models load in background)
  _signalCombiner.loadModels().catch(e => console.warn('ML model load:', e.message));
  _regimeHMM.loadModel();

  console.log('🤖 ML Services initialized');

  return {
    signalCombiner: _signalCombiner,
    regimeHMM: _regimeHMM
  };
}

/**
 * Get or create signal combiner instance
 */
function getSignalCombiner(db, config = {}) {
  if (!_signalCombiner) {
    _signalCombiner = new MLSignalCombiner(db, config);
    _signalCombiner.loadModels().catch(e => console.warn('ML model load:', e.message));
  }
  return _signalCombiner;
}

/**
 * Get initialized ML services
 */
function getMLServices() {
  return {
    signalCombiner: _signalCombiner,
    regimeHMM: _regimeHMM
  };
}

/**
 * Get or create regime HMM instance
 */
function getRegimeHMM(db, config = {}) {
  if (!_regimeHMM) {
    _regimeHMM = new RegimeHMMService(db, config);
    _regimeHMM.loadModel();
  }
  return _regimeHMM;
}

module.exports = {
  // Classes
  MLSignalCombiner,
  GradientBoostingRegressor,
  HiddenMarkovRegimeModel,
  RegimeHMMService,

  // Factory functions
  initializeMLServices,
  getMLServices,
  getSignalCombiner,
  getRegimeHMM
};
