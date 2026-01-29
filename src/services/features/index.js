// src/services/features/index.js
// Feature Store Module - Centralized feature management for ML

const { FeatureRegistry, getRegistry, FEATURE_TYPES, FREQUENCIES } = require('./featureRegistry');
const { FeatureStore, getStore } = require('./featureStore');
const { FeatureMonitor, getMonitor } = require('./featureMonitor');
const { FeatureStoreIntegration, createFeatureStoreIntegration } = require('./featureStoreIntegration');

/**
 * Feature Store Module
 *
 * Provides institutional-grade feature management:
 *
 * 1. Feature Registry
 *    - Central catalog of all features
 *    - Metadata, versioning, lineage
 *    - SQL/JS computation definitions
 *
 * 2. Feature Store
 *    - Point-in-time correct retrieval
 *    - Batch operations for ML
 *    - Caching for performance
 *
 * 3. Feature Monitor
 *    - Distribution drift detection (PSI)
 *    - Data quality alerts
 *    - Health scoring
 *
 * Usage:
 * ```javascript
 * const { getStore, getMonitor } = require('./services/features');
 *
 * // Get features for ML
 * const store = getStore();
 * const features = store.getFeatures('AAPL', ['rsi_14', 'pe_ratio'], '2024-01-15');
 *
 * // Check feature health
 * const monitor = getMonitor();
 * const health = await monitor.runFullHealthCheck(['AAPL', 'MSFT'], '2024-01-15');
 * ```
 */

// Lazy initialization wrapper
let initialized = false;

function initialize() {
  if (initialized) return;

  try {
    // Create singleton instances
    getRegistry();
    getStore();
    getMonitor();
    initialized = true;
    console.log('Feature Store module initialized');
  } catch (err) {
    console.error('Failed to initialize Feature Store:', err);
  }
}

module.exports = {
  // Classes
  FeatureRegistry,
  FeatureStore,
  FeatureMonitor,
  FeatureStoreIntegration,

  // Singleton getters
  getRegistry,
  getStore,
  getMonitor,

  // Factory functions
  createFeatureStoreIntegration,

  // Constants
  FEATURE_TYPES,
  FREQUENCIES,

  // Initialization
  initialize
};
