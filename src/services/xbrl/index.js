// src/services/xbrl/index.js

/**
 * XBRL Data Infrastructure Module
 *
 * Provides full fundamental coverage of UK/EU listed companies
 * using FREE official sources (filings.xbrl.org and Companies House).
 *
 * Components:
 * - XBRLFilingsClient: Fetch EU ESEF filings from filings.xbrl.org
 * - CompaniesHouseClient: Fetch UK company data from Companies House API
 * - XBRLParser: Parse pre-parsed xBRL-JSON into normalized financials
 * - FundamentalStore: Store/retrieve parsed data in database
 * - DataSyncService: Automated sync orchestration
 */

const { XBRLFilingsClient } = require('./xbrlFilingsClient');
const { CompaniesHouseClient } = require('./companiesHouseClient');
const { XBRLParser, IFRS_MAPPINGS, UK_GAAP_MAPPINGS } = require('./xbrlParser');
const { FundamentalStore } = require('./fundamentalStore');
const { DataSyncService, scheduleSync } = require('./dataSyncService');
const { XBRLSyncService } = require('./xbrlSyncService');
const { EnrichmentService } = require('./enrichmentService');
const { ValuationService } = require('./valuationService');

module.exports = {
  // Clients
  XBRLFilingsClient,
  CompaniesHouseClient,

  // Parser
  XBRLParser,
  IFRS_MAPPINGS,
  UK_GAAP_MAPPINGS,

  // Storage
  FundamentalStore,

  // Sync & Enrichment
  DataSyncService,
  scheduleSync,
  XBRLSyncService,
  EnrichmentService,
  ValuationService
};
