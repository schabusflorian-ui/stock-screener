// src/services/xbrl/fundamentalStore.js

/**
 * Fundamental Store
 *
 * Handles storage and retrieval of parsed XBRL financial data.
 * Manages company identifiers, filings, and fundamental metrics.
 */
class FundamentalStore {
  constructor(database) {
    this.db = database;
    this._prepareStatements();
    console.log('✅ FundamentalStore initialized');
  }

  /**
   * Prepare SQL statements for better performance
   * @private
   */
  _prepareStatements() {
    // Company identifiers
    this.stmtGetIdentifierByLEI = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE lei = ?
    `);

    this.stmtGetIdentifierByTicker = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE ticker = ? AND exchange = ?
    `);

    this.stmtInsertIdentifier = this.db.prepare(`
      INSERT INTO company_identifiers (lei, isin, sedol, ticker, exchange, yahoo_symbol, country, legal_name, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateIdentifier = this.db.prepare(`
      UPDATE company_identifiers
      SET isin = COALESCE(?, isin),
          sedol = COALESCE(?, sedol),
          ticker = COALESCE(?, ticker),
          exchange = COALESCE(?, exchange),
          yahoo_symbol = COALESCE(?, yahoo_symbol),
          country = COALESCE(?, country),
          legal_name = COALESCE(?, legal_name),
          company_id = COALESCE(?, company_id),
          updated_at = CURRENT_TIMESTAMP
      WHERE lei = ?
    `);

    // Filings
    this.stmtGetFilingByHash = this.db.prepare(`
      SELECT * FROM xbrl_filings WHERE filing_hash = ?
    `);

    this.stmtInsertFiling = this.db.prepare(`
      INSERT INTO xbrl_filings (filing_hash, identifier_id, lei, entity_name, country, period_end, period_start, filing_date, document_type, source, source_url, json_url, currency, parsed, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateFilingParsed = this.db.prepare(`
      UPDATE xbrl_filings SET parsed = ?, parse_errors = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    // Fundamental metrics
    this.stmtGetMetricsByIdentifier = this.db.prepare(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = ?
      ORDER BY period_end DESC
    `);

    this.stmtGetMetricsByPeriod = this.db.prepare(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = ? AND period_end = ? AND period_type = ?
    `);

    this.stmtGetLatestMetrics = this.db.prepare(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = ?
      ORDER BY period_end DESC
      LIMIT 1
    `);
  }

  // ========================================
  // Company Identifiers
  // ========================================

  /**
   * Get or create company identifier by LEI
   * @param {Object} data - Identifier data
   * @returns {Object} - Identifier record
   */
  upsertIdentifier(data) {
    const { lei, isin, sedol, ticker, exchange, yahooSymbol, country, companyName, legalName, companyId } = data;
    const name = legalName || companyName;

    if (!lei && !ticker) {
      throw new Error('Either LEI or ticker is required');
    }

    // Check if exists
    let existing = null;
    if (lei) {
      existing = this.stmtGetIdentifierByLEI.get(lei);
    } else if (ticker && exchange) {
      existing = this.stmtGetIdentifierByTicker.get(ticker, exchange);
    }

    if (existing) {
      // Update with any new data
      this.stmtUpdateIdentifier.run(
        isin || null,
        sedol || null,
        ticker || null,
        exchange || null,
        yahooSymbol || null,
        country || null,
        name || null,
        companyId || null,
        lei
      );
      return this.stmtGetIdentifierByLEI.get(lei);
    }

    // Insert new
    const result = this.stmtInsertIdentifier.run(
      lei || null,
      isin || null,
      sedol || null,
      ticker || null,
      exchange || null,
      yahooSymbol || null,
      country || null,
      name || 'Unknown',
      companyId || null
    );

    return { id: result.lastInsertRowid, lei, legal_name: name, ...data };
  }

  /**
   * Get identifier by LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Object|null} - Identifier record
   */
  getIdentifierByLEI(lei) {
    return this.stmtGetIdentifierByLEI.get(lei);
  }

  /**
   * Get identifier by ticker/exchange
   * @param {string} ticker - Stock ticker
   * @param {string} exchange - Exchange code
   * @returns {Object|null} - Identifier record
   */
  getIdentifierByTicker(ticker, exchange) {
    return this.stmtGetIdentifierByTicker.get(ticker.toUpperCase(), exchange.toUpperCase());
  }

  /**
   * Link identifier to existing company in database
   * @param {number} identifierId - Identifier ID
   * @param {number} companyId - Company ID from companies table
   */
  linkToCompany(identifierId, companyId) {
    this.db.prepare(`
      UPDATE company_identifiers SET company_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(companyId, identifierId);
  }

  /**
   * Search identifiers by company name
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} - Matching identifiers
   */
  searchIdentifiers(query, limit = 20) {
    return this.db.prepare(`
      SELECT * FROM company_identifiers
      WHERE legal_name LIKE ? OR ticker LIKE ?
      ORDER BY legal_name
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit);
  }

  /**
   * Get identifiers by country
   * @param {string} country - ISO country code
   * @param {number} limit - Max results
   * @returns {Array} - Identifiers
   */
  getIdentifiersByCountry(country, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM company_identifiers
      WHERE country = ?
      ORDER BY legal_name
      LIMIT ?
    `).all(country.toUpperCase(), limit);
  }

  // ========================================
  // Filings
  // ========================================

  /**
   * Store filing metadata
   * @param {Object} filing - Filing data
   * @returns {Object} - Filing record
   */
  storeFiling(filing) {
    const existing = this.stmtGetFilingByHash.get(filing.hash);
    if (existing) {
      // Normalize the return to include camelCase properties for consistency
      return {
        ...existing,
        identifierId: existing.identifier_id  // Add camelCase alias
      };
    }

    // Get or create identifier
    let identifierId = null;
    if (filing.entityLEI) {
      const identifier = this.upsertIdentifier({
        lei: filing.entityLEI,
        country: filing.country,
        companyName: filing.entityName
      });
      identifierId = identifier.id;
    }

    const result = this.stmtInsertFiling.run(
      filing.hash,
      identifierId,
      filing.entityLEI || null,
      filing.entityName || null,
      filing.country || null,
      filing.periodEnd || null,
      filing.periodStart || null,
      filing.filingDate || null,
      filing.documentType || null,
      filing.source || 'filings.xbrl.org',
      filing.urls?.viewer || null,
      filing.jsonUrl || null,  // Store the json_url for fetching xBRL-JSON
      filing.currency || 'EUR',
      0, // not parsed yet
      filing.rawJson ? JSON.stringify(filing.rawJson) : null
    );

    return {
      id: result.lastInsertRowid,
      ...filing,
      identifierId
    };
  }

  /**
   * Get filing by hash
   * @param {string} filingHash - Filing hash
   * @returns {Object|null} - Filing record
   */
  getFilingByHash(filingHash) {
    return this.stmtGetFilingByHash.get(filingHash);
  }

  /**
   * Mark filing as parsed
   * @param {number} filingId - Filing ID
   * @param {boolean} success - Parse success
   * @param {string} errors - Error details if any
   */
  markFilingParsed(filingId, success, errors = null) {
    this.stmtUpdateFilingParsed.run(success ? 1 : 0, errors, filingId);
  }

  /**
   * Get unparsed filings
   * @param {number} limit - Max results
   * @returns {Array} - Unparsed filings
   */
  getUnparsedFilings(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM xbrl_filings
      WHERE parsed = 0
      ORDER BY period_end DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get filings for an identifier
   * @param {number} identifierId - Identifier ID
   * @returns {Array} - Filings
   */
  getFilingsByIdentifier(identifierId) {
    return this.db.prepare(`
      SELECT * FROM xbrl_filings
      WHERE identifier_id = ?
      ORDER BY period_end DESC
    `).all(identifierId);
  }

  // ========================================
  // Fundamental Metrics
  // ========================================

  /**
   * Store fundamental metrics
   * @param {Object} data - Metrics data (from parser.toFlatRecord)
   * @param {number} identifierId - Identifier ID
   * @param {number} filingId - Filing ID
   * @param {number} companyId - Company ID (optional)
   * @returns {Object} - Stored record
   */
  storeMetrics(data, identifierId, filingId, companyId = null) {
    if (!identifierId || !data.period_end) {
      throw new Error('Identifier ID and period_end are required');
    }

    // Check if already exists (matching identifier, period_end, AND period_type)
    const periodType = data.period_type || 'annual';
    const existing = this.stmtGetMetricsByPeriod.get(identifierId, data.period_end, periodType);
    if (existing) {
      // Update existing record
      return this._updateMetrics(existing.id, data);
    }

    // Build insert statement dynamically
    const fields = Object.keys(data).filter(k => data[k] !== undefined);
    const allFields = ['identifier_id', 'filing_id', 'company_id', ...fields];
    const placeholders = allFields.map(() => '?').join(', ');
    const values = [identifierId, filingId, companyId, ...fields.map(f => data[f])];

    const stmt = this.db.prepare(`
      INSERT INTO xbrl_fundamental_metrics (${allFields.join(', ')})
      VALUES (${placeholders})
    `);

    const result = stmt.run(...values);
    return { id: result.lastInsertRowid, identifierId, ...data };
  }

  /**
   * Update existing metrics record
   * @private
   */
  _updateMetrics(id, data) {
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'period_end') {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      this.db.prepare(`
        UPDATE xbrl_fundamental_metrics SET ${updates.join(', ')} WHERE id = ?
      `).run(...values);
    }

    return this.db.prepare('SELECT * FROM xbrl_fundamental_metrics WHERE id = ?').get(id);
  }

  /**
   * Get all metrics for an identifier
   * @param {number} identifierId - Identifier ID
   * @returns {Array} - Metrics by period
   */
  getMetricsByIdentifier(identifierId) {
    return this.stmtGetMetricsByIdentifier.all(identifierId);
  }

  /**
   * Get latest metrics for an identifier
   * @param {number} identifierId - Identifier ID
   * @returns {Object|null} - Latest metrics
   */
  getLatestMetrics(identifierId) {
    return this.stmtGetLatestMetrics.get(identifierId);
  }

  /**
   * Get metrics for a specific period
   * @param {number} identifierId - Identifier ID
   * @param {string} periodEnd - Period end date
   * @returns {Object|null} - Metrics
   */
  getMetricsByPeriod(identifierId, periodEnd, periodType = 'annual') {
    return this.stmtGetMetricsByPeriod.get(identifierId, periodEnd, periodType);
  }

  /**
   * Get metrics by company ID (linked to main companies table)
   * @param {number} companyId - Company ID
   * @returns {Array} - Metrics
   */
  getMetricsByCompanyId(companyId) {
    return this.db.prepare(`
      SELECT m.* FROM xbrl_fundamental_metrics m
      JOIN company_identifiers ci ON m.identifier_id = ci.id
      WHERE ci.company_id = ?
      ORDER BY m.period_end DESC
    `).all(companyId);
  }

  /**
   * Get aggregate stats for all XBRL data
   * @returns {Object} - Statistics
   */
  getStats() {
    const identifierCount = this.db.prepare('SELECT COUNT(*) as count FROM company_identifiers').get();
    const filingCount = this.db.prepare('SELECT COUNT(*) as count FROM xbrl_filings').get();
    const parsedFilingCount = this.db.prepare('SELECT COUNT(*) as count FROM xbrl_filings WHERE parsed = 1').get();
    const metricsCount = this.db.prepare('SELECT COUNT(*) as count FROM xbrl_fundamental_metrics').get();

    const countryCounts = this.db.prepare(`
      SELECT country, COUNT(*) as count FROM company_identifiers
      GROUP BY country ORDER BY count DESC LIMIT 10
    `).all();

    const latestFiling = this.db.prepare(`
      SELECT period_end, entity_name FROM xbrl_filings
      ORDER BY period_end DESC LIMIT 1
    `).get();

    return {
      identifiers: identifierCount.count,
      filings: {
        total: filingCount.count,
        parsed: parsedFilingCount.count,
        pending: filingCount.count - parsedFilingCount.count
      },
      metrics: metricsCount.count,
      countryCoverage: countryCounts,
      latestFiling
    };
  }

  // ========================================
  // Sync Log
  // ========================================

  /**
   * Start sync log entry
   * @param {string} syncType - Type of sync (country, full, etc.)
   * @param {string} country - Country being synced (optional)
   * @returns {number} - Sync log ID
   */
  startSyncLog(syncType, country = null) {
    const result = this.db.prepare(`
      INSERT INTO xbrl_sync_log (sync_type, country, status)
      VALUES (?, ?, 'running')
    `).run(syncType, country);

    return result.lastInsertRowid;
  }

  /**
   * Complete sync log entry
   * @param {number} logId - Sync log ID
   * @param {Object} stats - Sync statistics
   */
  completeSyncLog(logId, stats) {
    this.db.prepare(`
      UPDATE xbrl_sync_log SET
        completed_at = CURRENT_TIMESTAMP,
        filings_processed = ?,
        filings_added = ?,
        filings_updated = ?,
        errors = ?,
        error_details = ?,
        status = ?
      WHERE id = ?
    `).run(
      stats.processed || 0,
      stats.added || 0,
      stats.updated || 0,
      stats.errors || 0,
      stats.errorDetails || null,
      stats.errors > 0 ? 'completed_with_errors' : 'completed',
      logId
    );
  }

  /**
   * Get recent sync logs
   * @param {number} limit - Max results
   * @returns {Array} - Sync logs
   */
  getSyncLogs(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM xbrl_sync_log ORDER BY started_at DESC LIMIT ?
    `).all(limit);
  }
}

module.exports = { FundamentalStore };
