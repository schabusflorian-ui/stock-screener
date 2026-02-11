// src/services/xbrl/fundamentalStore.js

const { getDatabaseAsync } = require('../../lib/db');

/**
 * Fundamental Store
 *
 * Handles storage and retrieval of parsed XBRL financial data.
 * Manages company identifiers, filings, and fundamental metrics.
 */
class FundamentalStore {
  constructor() {
    console.log('✅ FundamentalStore initialized');
  }

  // ========================================
  // Company Identifiers
  // ========================================

  /**
   * Get or create company identifier by LEI
   * @param {Object} data - Identifier data
   * @returns {Object} - Identifier record
   */
  async upsertIdentifier(data) {
    const database = await getDatabaseAsync();
    const { lei, isin, sedol, ticker, exchange, yahooSymbol, country, companyName, legalName, companyId } = data;
    const name = legalName || companyName;

    if (!lei && !ticker) {
      throw new Error('Either LEI or ticker is required');
    }

    // Check if exists
    let existing = null;
    if (lei) {
      const result = await database.query('SELECT * FROM company_identifiers WHERE lei = $1', [lei]);
      existing = result.rows[0];
    } else if (ticker && exchange) {
      const result = await database.query('SELECT * FROM company_identifiers WHERE ticker = $1 AND exchange = $2', [ticker, exchange]);
      existing = result.rows[0];
    }

    if (existing) {
      // Update with any new data
      await database.query(`
        UPDATE company_identifiers
        SET isin = COALESCE($1, isin),
            sedol = COALESCE($2, sedol),
            ticker = COALESCE($3, ticker),
            exchange = COALESCE($4, exchange),
            yahoo_symbol = COALESCE($5, yahoo_symbol),
            country = COALESCE($6, country),
            legal_name = COALESCE($7, legal_name),
            company_id = COALESCE($8, company_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE lei = $9
      `, [
        isin || null,
        sedol || null,
        ticker || null,
        exchange || null,
        yahooSymbol || null,
        country || null,
        name || null,
        companyId || null,
        lei
      ]);
      const result = await database.query('SELECT * FROM company_identifiers WHERE lei = $1', [lei]);
      return result.rows[0];
    }

    // Insert new
    const result = await database.query(`
      INSERT INTO company_identifiers (lei, isin, sedol, ticker, exchange, yahoo_symbol, country, legal_name, company_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      lei || null,
      isin || null,
      sedol || null,
      ticker || null,
      exchange || null,
      yahooSymbol || null,
      country || null,
      name || 'Unknown',
      companyId || null
    ]);

    return { id: result.rows[0].id, lei, legal_name: name, ...data };
  }

  /**
   * Get identifier by LEI
   * @param {string} lei - Legal Entity Identifier
   * @returns {Object|null} - Identifier record
   */
  async getIdentifierByLEI(lei) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM company_identifiers WHERE lei = $1', [lei]);
    return result.rows[0] || null;
  }

  /**
   * Get identifier by ticker/exchange
   * @param {string} ticker - Stock ticker
   * @param {string} exchange - Exchange code
   * @returns {Object|null} - Identifier record
   */
  async getIdentifierByTicker(ticker, exchange) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM company_identifiers WHERE ticker = $1 AND exchange = $2', [ticker.toUpperCase(), exchange.toUpperCase()]);
    return result.rows[0] || null;
  }

  /**
   * Link identifier to existing company in database
   * @param {number} identifierId - Identifier ID
   * @param {number} companyId - Company ID from companies table
   */
  async linkToCompany(identifierId, companyId) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE company_identifiers SET company_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
    `, [companyId, identifierId]);
  }

  /**
   * Search identifiers by company name
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Array} - Matching identifiers
   */
  async searchIdentifiers(query, limit = 20) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM company_identifiers
      WHERE legal_name ILIKE $1 OR ticker ILIKE $2
      ORDER BY legal_name
      LIMIT $3
    `, [`%${query}%`, `%${query}%`, limit]);
    return result.rows;
  }

  /**
   * Get identifiers by country
   * @param {string} country - ISO country code
   * @param {number} limit - Max results
   * @returns {Array} - Identifiers
   */
  async getIdentifiersByCountry(country, limit = 100) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM company_identifiers
      WHERE country = $1
      ORDER BY legal_name
      LIMIT $2
    `, [country.toUpperCase(), limit]);
    return result.rows;
  }

  // ========================================
  // Filings
  // ========================================

  /**
   * Store filing metadata
   * @param {Object} filing - Filing data
   * @returns {Object} - Filing record
   */
  async storeFiling(filing) {
    const database = await getDatabaseAsync();
    const existing = await database.query('SELECT * FROM xbrl_filings WHERE filing_hash = $1', [filing.hash]);
    if (existing.rows.length > 0) {
      // Normalize the return to include camelCase properties for consistency
      return {
        ...existing.rows[0],
        identifierId: existing.rows[0].identifier_id  // Add camelCase alias
      };
    }

    // Get or create identifier
    let identifierId = null;
    if (filing.entityLEI) {
      const identifier = await this.upsertIdentifier({
        lei: filing.entityLEI,
        country: filing.country,
        companyName: filing.entityName
      });
      identifierId = identifier.id;
    }

    const result = await database.query(`
      INSERT INTO xbrl_filings (filing_hash, identifier_id, lei, entity_name, country, period_end, period_start, filing_date, document_type, source, source_url, json_url, currency, parsed, raw_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
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
      false, // not parsed yet
      filing.rawJson ? JSON.stringify(filing.rawJson) : null
    ]);

    return {
      id: result.rows[0].id,
      ...filing,
      identifierId
    };
  }

  /**
   * Get filing by hash
   * @param {string} filingHash - Filing hash
   * @returns {Object|null} - Filing record
   */
  async getFilingByHash(filingHash) {
    const database = await getDatabaseAsync();
    const result = await database.query('SELECT * FROM xbrl_filings WHERE filing_hash = $1', [filingHash]);
    return result.rows[0] || null;
  }

  /**
   * Mark filing as parsed
   * @param {number} filingId - Filing ID
   * @param {boolean} success - Parse success
   * @param {string} errors - Error details if any
   */
  async markFilingParsed(filingId, success, errors = null) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE xbrl_filings SET parsed = $1, parse_errors = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3
    `, [success, errors, filingId]);
  }

  /**
   * Get unparsed filings
   * @param {number} limit - Max results
   * @returns {Array} - Unparsed filings
   */
  async getUnparsedFilings(limit = 100) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM xbrl_filings
      WHERE parsed = false
      ORDER BY period_end DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  /**
   * Get filings for an identifier
   * @param {number} identifierId - Identifier ID
   * @returns {Array} - Filings
   */
  async getFilingsByIdentifier(identifierId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM xbrl_filings
      WHERE identifier_id = $1
      ORDER BY period_end DESC
    `, [identifierId]);
    return result.rows;
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
  async storeMetrics(data, identifierId, filingId, companyId = null) {
    const database = await getDatabaseAsync();
    if (!identifierId || !data.period_end) {
      throw new Error('Identifier ID and period_end are required');
    }

    // Check if already exists (matching identifier, period_end, AND period_type)
    const periodType = data.period_type || 'annual';
    const existing = await database.query(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = $1 AND period_end = $2 AND period_type = $3
    `, [identifierId, data.period_end, periodType]);
    if (existing.rows.length > 0) {
      // Update existing record
      return this._updateMetrics(existing.rows[0].id, data);
    }

    // Build insert statement dynamically
    const fields = Object.keys(data).filter(k => data[k] !== undefined);
    const allFields = ['identifier_id', 'filing_id', 'company_id', ...fields];
    const placeholders = allFields.map((_, i) => `$${i + 1}`).join(', ');
    const values = [identifierId, filingId, companyId, ...fields.map(f => data[f])];

    const result = await database.query(`
      INSERT INTO xbrl_fundamental_metrics (${allFields.join(', ')})
      VALUES (${placeholders})
      RETURNING id
    `, values);

    return { id: result.rows[0].id, identifierId, ...data };
  }

  /**
   * Update existing metrics record
   * @private
   */
  async _updateMetrics(id, data) {
    const database = await getDatabaseAsync();
    const updates = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'period_end') {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      await database.query(`
        UPDATE xbrl_fundamental_metrics SET ${updates.join(', ')} WHERE id = $${paramCount}
      `, values);
    }

    const result = await database.query('SELECT * FROM xbrl_fundamental_metrics WHERE id = $1', [id]);
    return result.rows[0];
  }

  /**
   * Get all metrics for an identifier
   * @param {number} identifierId - Identifier ID
   * @returns {Array} - Metrics by period
   */
  async getMetricsByIdentifier(identifierId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = $1
      ORDER BY period_end DESC
    `, [identifierId]);
    return result.rows;
  }

  /**
   * Get latest metrics for an identifier
   * @param {number} identifierId - Identifier ID
   * @returns {Object|null} - Latest metrics
   */
  async getLatestMetrics(identifierId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = $1
      ORDER BY period_end DESC
      LIMIT 1
    `, [identifierId]);
    return result.rows[0] || null;
  }

  /**
   * Get metrics for a specific period
   * @param {number} identifierId - Identifier ID
   * @param {string} periodEnd - Period end date
   * @returns {Object|null} - Metrics
   */
  async getMetricsByPeriod(identifierId, periodEnd, periodType = 'annual') {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM xbrl_fundamental_metrics
      WHERE identifier_id = $1 AND period_end = $2 AND period_type = $3
    `, [identifierId, periodEnd, periodType]);
    return result.rows[0] || null;
  }

  /**
   * Get metrics by company ID (linked to main companies table)
   * @param {number} companyId - Company ID
   * @returns {Array} - Metrics
   */
  async getMetricsByCompanyId(companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT m.* FROM xbrl_fundamental_metrics m
      JOIN company_identifiers ci ON m.identifier_id = ci.id
      WHERE ci.company_id = $1
      ORDER BY m.period_end DESC
    `, [companyId]);
    return result.rows;
  }

  /**
   * Get aggregate stats for all XBRL data
   * @returns {Object} - Statistics
   */
  async getStats() {
    const database = await getDatabaseAsync();
    const identifierCount = await database.query('SELECT COUNT(*) as count FROM company_identifiers');
    const filingCount = await database.query('SELECT COUNT(*) as count FROM xbrl_filings');
    const parsedFilingCount = await database.query('SELECT COUNT(*) as count FROM xbrl_filings WHERE parsed = true');
    const metricsCount = await database.query('SELECT COUNT(*) as count FROM xbrl_fundamental_metrics');

    const countryCounts = await database.query(`
      SELECT country, COUNT(*) as count FROM company_identifiers
      GROUP BY country ORDER BY count DESC LIMIT 10
    `);

    const latestFiling = await database.query(`
      SELECT period_end, entity_name FROM xbrl_filings
      ORDER BY period_end DESC LIMIT 1
    `);

    return {
      identifiers: parseInt(identifierCount.rows[0].count),
      filings: {
        total: parseInt(filingCount.rows[0].count),
        parsed: parseInt(parsedFilingCount.rows[0].count),
        pending: parseInt(filingCount.rows[0].count) - parseInt(parsedFilingCount.rows[0].count)
      },
      metrics: parseInt(metricsCount.rows[0].count),
      countryCoverage: countryCounts.rows,
      latestFiling: latestFiling.rows[0]
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
  async startSyncLog(syncType, country = null) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      INSERT INTO xbrl_sync_log (sync_type, country, status)
      VALUES ($1, $2, 'running')
      RETURNING id
    `, [syncType, country]);

    return result.rows[0].id;
  }

  /**
   * Complete sync log entry
   * @param {number} logId - Sync log ID
   * @param {Object} stats - Sync statistics
   */
  async completeSyncLog(logId, stats) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE xbrl_sync_log SET
        completed_at = CURRENT_TIMESTAMP,
        filings_processed = $1,
        filings_added = $2,
        filings_updated = $3,
        errors = $4,
        error_details = $5,
        status = $6
      WHERE id = $7
    `, [
      stats.processed || 0,
      stats.added || 0,
      stats.updated || 0,
      stats.errors || 0,
      stats.errorDetails || null,
      stats.errors > 0 ? 'completed_with_errors' : 'completed',
      logId
    ]);
  }

  /**
   * Get recent sync logs
   * @param {number} limit - Max results
   * @returns {Array} - Sync logs
   */
  async getSyncLogs(limit = 20) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT * FROM xbrl_sync_log ORDER BY started_at DESC LIMIT $1
    `, [limit]);
    return result.rows;
  }
}

module.exports = { FundamentalStore };
