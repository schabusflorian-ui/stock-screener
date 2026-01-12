// src/services/identifiers/index.js
// Symbol Resolution & Market Mapping Services
// Agent 11: EU/UK Public Markets Coverage - Identifier Layer

const { OpenFigiClient } = require('./openFigiClient');
const { GleifClient } = require('./gleifClient');
const { ExchangeMapper, EXCHANGE_MAPPINGS, COUNTRY_PRIMARY_EXCHANGE } = require('./exchangeMapper');
const { SymbolResolver } = require('./symbolResolver');
const { CompanyLinker } = require('./companyLinker');

/**
 * Create a fully initialized identifier services instance
 *
 * @param {Object} db - better-sqlite3 database instance
 * @param {Object} config - Configuration options
 * @returns {Object} Initialized services
 *
 * @example
 * const { db } = require('../database');
 * const identifiers = require('./identifiers').createServices(db);
 *
 * // Resolve a company by LEI
 * const result = await identifiers.resolver.resolveFromLEI('5493001KJTIIGC8Y1R12');
 *
 * // Link an XBRL filing to your companies table
 * const linkResult = await identifiers.linker.linkCompany('5493001KJTIIGC8Y1R12', {
 *   companyName: 'BP PLC',
 *   country: 'GB'
 * });
 */
function createServices(db, config = {}) {
  const figi = new OpenFigiClient(config.openFigiKey);
  const gleif = new GleifClient();
  const exchange = new ExchangeMapper();
  const resolver = new SymbolResolver(db, config);
  const linker = new CompanyLinker(db, resolver);

  return {
    figi,
    gleif,
    exchange,
    resolver,
    linker,

    // Convenience methods
    resolveFromLEI: (lei) => resolver.resolveFromLEI(lei),
    resolveFromISIN: (isin) => resolver.resolveFromISIN(isin),
    linkCompany: (lei, options) => linker.linkCompany(lei, options),
    getYahooSymbol: (ticker, exchangeCode) => exchange.getYahooSymbol(ticker, exchangeCode),
    parseYahooSymbol: (symbol) => exchange.parseYahooSymbol(symbol)
  };
}

module.exports = {
  // Factory function
  createServices,

  // Individual classes for direct use
  OpenFigiClient,
  GleifClient,
  ExchangeMapper,
  SymbolResolver,
  CompanyLinker,

  // Constants
  EXCHANGE_MAPPINGS,
  COUNTRY_PRIMARY_EXCHANGE
};
