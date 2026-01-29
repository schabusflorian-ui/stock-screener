// src/services/providers/index.js

/**
 * Data Providers Module
 *
 * Unified provider wrappers for different data sources.
 * Used by the DataRouter to access data in a consistent format.
 */

const { XBRLProvider } = require('./xbrlProvider');
const { PriceProvider } = require('./priceProvider');

module.exports = {
  XBRLProvider,
  PriceProvider,
};
