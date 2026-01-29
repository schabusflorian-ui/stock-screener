// src/services/identifiers/companyLinker.js
// Links XBRL-identified companies (by LEI) to the existing companies table
// Creates unified company_identifiers mapping

const { SymbolResolver } = require('./symbolResolver');

class CompanyLinker {
  /**
   * Create a new CompanyLinker instance
   * @param {Object} db - better-sqlite3 database instance
   * @param {SymbolResolver} symbolResolver - Symbol resolver instance
   */
  constructor(db, symbolResolver = null) {
    this.db = db;
    this.resolver = symbolResolver || new SymbolResolver(db);

    this._prepareStatements();
  }

  /**
   * Prepare SQLite statements
   * @private
   */
  _prepareStatements() {
    // Create company_identifiers table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS company_identifiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,

        -- Primary identifiers
        lei TEXT UNIQUE,
        isin TEXT,
        cusip TEXT,
        sedol TEXT,
        figi TEXT,
        composite_figi TEXT,
        cik TEXT,

        -- Trading identifiers
        ticker TEXT,
        exchange TEXT,
        yahoo_symbol TEXT,

        -- Company info from GLEIF/filing
        legal_name TEXT,
        country TEXT,
        jurisdiction TEXT,

        -- Linking status
        link_status TEXT DEFAULT 'pending',
        link_method TEXT,
        link_confidence REAL,

        -- Timestamps
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        linked_at DATETIME,

        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_company_identifiers_company
      ON company_identifiers(company_id);

      CREATE INDEX IF NOT EXISTS idx_company_identifiers_lei
      ON company_identifiers(lei);

      CREATE INDEX IF NOT EXISTS idx_company_identifiers_isin
      ON company_identifiers(isin);

      CREATE INDEX IF NOT EXISTS idx_company_identifiers_ticker
      ON company_identifiers(ticker, exchange);

      CREATE INDEX IF NOT EXISTS idx_company_identifiers_yahoo
      ON company_identifiers(yahoo_symbol);

      CREATE INDEX IF NOT EXISTS idx_company_identifiers_status
      ON company_identifiers(link_status);
    `);

    // Prepare statements
    this.stmtGetByLei = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE lei = ?
    `);

    this.stmtGetByIsin = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE isin = ?
    `);

    this.stmtGetByYahoo = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE yahoo_symbol = ?
    `);

    this.stmtGetByCompanyId = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE company_id = ?
    `);

    this.stmtUpsertIdentifiers = this.db.prepare(`
      INSERT INTO company_identifiers (
        lei, isin, cusip, sedol, figi, composite_figi, cik,
        ticker, exchange, yahoo_symbol,
        legal_name, country, jurisdiction,
        link_status, link_method, link_confidence, linked_at
      ) VALUES (
        @lei, @isin, @cusip, @sedol, @figi, @composite_figi, @cik,
        @ticker, @exchange, @yahoo_symbol,
        @legal_name, @country, @jurisdiction,
        @link_status, @link_method, @link_confidence, @linked_at
      )
      ON CONFLICT(lei) DO UPDATE SET
        isin = coalesce(@isin, isin),
        cusip = coalesce(@cusip, cusip),
        sedol = coalesce(@sedol, sedol),
        figi = coalesce(@figi, figi),
        composite_figi = coalesce(@composite_figi, composite_figi),
        cik = coalesce(@cik, cik),
        ticker = coalesce(@ticker, ticker),
        exchange = coalesce(@exchange, exchange),
        yahoo_symbol = coalesce(@yahoo_symbol, yahoo_symbol),
        legal_name = coalesce(@legal_name, legal_name),
        country = coalesce(@country, country),
        jurisdiction = coalesce(@jurisdiction, jurisdiction),
        link_status = @link_status,
        link_method = @link_method,
        link_confidence = @link_confidence,
        linked_at = @linked_at,
        updated_at = datetime('now')
    `);

    this.stmtUpdateCompanyLink = this.db.prepare(`
      UPDATE company_identifiers
      SET company_id = ?,
          link_status = 'linked',
          link_method = ?,
          link_confidence = ?,
          linked_at = datetime('now'),
          updated_at = datetime('now')
      WHERE lei = ?
    `);

    this.stmtGetCompanyBySymbol = this.db.prepare(`
      SELECT id, symbol, name, exchange, country FROM companies
      WHERE LOWER(symbol) = LOWER(?)
    `);

    this.stmtGetCompanyByName = this.db.prepare(`
      SELECT id, symbol, name, exchange, country FROM companies
      WHERE name LIKE ?
      ORDER BY
        CASE WHEN name = ? THEN 0 ELSE 1 END,
        LENGTH(name)
      LIMIT 5
    `);

    this.stmtInsertCompany = this.db.prepare(`
      INSERT INTO companies (symbol, name, exchange, country, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `);

    this.stmtGetUnlinked = this.db.prepare(`
      SELECT * FROM company_identifiers
      WHERE link_status = 'pending' OR link_status = 'no_match'
      ORDER BY created_at DESC
      LIMIT ?
    `);
  }

  /**
   * Link a company by LEI to the companies table
   * Creates company record if needed
   *
   * @param {string} lei - Legal Entity Identifier
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Linking result
   */
  async linkCompany(lei, options = {}) {
    const {
      companyName = null,
      country = null,
      isin = null,
      cik = null,
      createIfMissing = true
    } = options;

    // Check if already linked
    const existing = this.stmtGetByLei.get(lei);
    if (existing?.company_id) {
      return {
        linked: true,
        alreadyLinked: true,
        companyId: existing.company_id,
        lei,
        ticker: existing.ticker,
        yahooSymbol: existing.yahoo_symbol,
        method: existing.link_method
      };
    }

    // Resolve identifiers from LEI
    const resolution = await this.resolver.resolveFromLEI(lei);

    if (!resolution) {
      // Save the LEI with failed status
      this.stmtUpsertIdentifiers.run({
        lei,
        isin: isin || null,
        cusip: null,
        sedol: null,
        figi: null,
        composite_figi: null,
        cik: cik || null,
        ticker: null,
        exchange: null,
        yahoo_symbol: null,
        legal_name: companyName || null,
        country: country || null,
        jurisdiction: null,
        link_status: 'resolution_failed',
        link_method: null,
        link_confidence: null,
        linked_at: null
      });

      return {
        linked: false,
        reason: 'LEI not found in GLEIF',
        lei
      };
    }

    const primaryListing = resolution.primaryListing;

    if (!primaryListing) {
      // No tradeable listings found
      this.stmtUpsertIdentifiers.run({
        lei,
        isin: isin || null,
        cusip: null,
        sedol: null,
        figi: null,
        composite_figi: null,
        cik: cik || null,
        ticker: null,
        exchange: null,
        yahoo_symbol: null,
        legal_name: resolution.companyName || companyName,
        country: resolution.country || country,
        jurisdiction: resolution.jurisdiction || null,
        link_status: 'no_symbol',
        link_method: null,
        link_confidence: null,
        linked_at: null
      });

      return {
        linked: false,
        reason: 'No tradeable symbol found',
        lei,
        companyName: resolution.companyName
      };
    }

    // Try to find existing company by symbol
    let company = this.stmtGetCompanyBySymbol.get(primaryListing.ticker);
    let linkMethod = 'symbol_exact';
    let linkConfidence = 1.0;

    // If not found by symbol, try by name
    if (!company && resolution.companyName) {
      const nameMatches = this.stmtGetCompanyByName.all(
        `%${resolution.companyName}%`,
        resolution.companyName
      );

      if (nameMatches.length > 0) {
        // Use first match, but with lower confidence
        company = nameMatches[0];
        linkMethod = 'name_fuzzy';
        linkConfidence = this._calculateNameConfidence(
          resolution.companyName,
          company.name
        );
      }
    }

    // Create new company if not found and allowed
    if (!company && createIfMissing) {
      const result = this.stmtInsertCompany.run(
        primaryListing.ticker,
        resolution.companyName || primaryListing.name,
        primaryListing.exchange,
        resolution.country || country || null
      );

      company = {
        id: result.lastInsertRowid,
        symbol: primaryListing.ticker
      };
      linkMethod = 'created_new';
      linkConfidence = 1.0;
    }

    // Save identifier mapping
    this.stmtUpsertIdentifiers.run({
      lei,
      isin: primaryListing.isin || isin || null,
      cusip: null,
      sedol: null,
      figi: primaryListing.figi || null,
      composite_figi: primaryListing.compositeFigi || null,
      cik: cik || null,
      ticker: primaryListing.ticker,
      exchange: primaryListing.exchange,
      yahoo_symbol: primaryListing.yahooSymbol,
      legal_name: resolution.companyName,
      country: resolution.country || country,
      jurisdiction: resolution.jurisdiction,
      link_status: company ? 'linked' : 'no_match',
      link_method: company ? linkMethod : null,
      link_confidence: company ? linkConfidence : null,
      linked_at: company ? new Date().toISOString() : null
    });

    // Update company_id link
    if (company) {
      this.stmtUpdateCompanyLink.run(
        company.id,
        linkMethod,
        linkConfidence,
        lei
      );
    }

    return {
      linked: !!company,
      companyId: company?.id || null,
      lei,
      ticker: primaryListing.ticker,
      yahooSymbol: primaryListing.yahooSymbol,
      exchange: primaryListing.exchange,
      companyName: resolution.companyName,
      method: linkMethod,
      confidence: linkConfidence,
      created: linkMethod === 'created_new',
      allListings: resolution.listings
    };
  }

  /**
   * Link a company by ISIN
   *
   * @param {string} isin - 12-character ISIN
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Linking result
   */
  async linkCompanyByISIN(isin, options = {}) {
    const { createIfMissing = true } = options;

    // Check if already linked
    const existing = this.stmtGetByIsin.get(isin);
    if (existing?.company_id) {
      return {
        linked: true,
        alreadyLinked: true,
        companyId: existing.company_id,
        isin,
        ticker: existing.ticker,
        yahooSymbol: existing.yahoo_symbol
      };
    }

    // Resolve identifiers
    const resolution = await this.resolver.resolveFromISIN(isin);
    const primaryListing = resolution.primaryListing;

    if (!primaryListing) {
      return {
        linked: false,
        reason: 'No tradeable symbol found',
        isin
      };
    }

    // Try to find existing company
    let company = this.stmtGetCompanyBySymbol.get(primaryListing.ticker);
    let linkMethod = 'symbol_exact';

    // Create if needed
    if (!company && createIfMissing) {
      const result = this.stmtInsertCompany.run(
        primaryListing.ticker,
        primaryListing.name,
        primaryListing.exchange,
        resolution.countryCode
      );

      company = { id: result.lastInsertRowid };
      linkMethod = 'created_new';
    }

    if (!company) {
      return {
        linked: false,
        reason: 'Company not found and createIfMissing=false',
        isin,
        ticker: primaryListing.ticker
      };
    }

    // Save identifier mapping with ISIN as key (no LEI)
    // We use a synthetic LEI-like key for ISIN-only entries
    const syntheticLei = `ISIN_${isin}`.padEnd(20, '0').substring(0, 20);

    this.stmtUpsertIdentifiers.run({
      lei: syntheticLei,
      isin,
      cusip: null,
      sedol: null,
      figi: primaryListing.figi || null,
      composite_figi: primaryListing.compositeFigi || null,
      cik: null,
      ticker: primaryListing.ticker,
      exchange: primaryListing.exchange,
      yahoo_symbol: primaryListing.yahooSymbol,
      legal_name: primaryListing.name,
      country: resolution.countryCode,
      jurisdiction: null,
      link_status: 'linked',
      link_method: linkMethod,
      link_confidence: 1.0,
      linked_at: new Date().toISOString()
    });

    this.stmtUpdateCompanyLink.run(company.id, linkMethod, 1.0, syntheticLei);

    return {
      linked: true,
      companyId: company.id,
      isin,
      ticker: primaryListing.ticker,
      yahooSymbol: primaryListing.yahooSymbol,
      method: linkMethod
    };
  }

  /**
   * Look up company identifiers by various keys
   *
   * @param {Object} query - Query parameters
   * @returns {Object|null} Identifier record
   */
  lookupIdentifiers(query) {
    if (query.lei) {
      return this.stmtGetByLei.get(query.lei);
    }
    if (query.isin) {
      return this.stmtGetByIsin.get(query.isin);
    }
    if (query.yahooSymbol) {
      return this.stmtGetByYahoo.get(query.yahooSymbol);
    }
    if (query.companyId) {
      return this.stmtGetByCompanyId.get(query.companyId);
    }
    return null;
  }

  /**
   * Get all identifiers for a company
   *
   * @param {number} companyId - Company ID
   * @returns {Array} Array of identifier records
   */
  getCompanyIdentifiers(companyId) {
    const stmt = this.db.prepare(`
      SELECT * FROM company_identifiers WHERE company_id = ?
    `);
    return stmt.all(companyId);
  }

  /**
   * Get unlinked identifiers for manual review
   *
   * @param {number} limit - Maximum records to return
   * @returns {Array} Unlinked identifier records
   */
  getUnlinkedIdentifiers(limit = 100) {
    return this.stmtGetUnlinked.all(limit);
  }

  /**
   * Manually link an identifier to a company
   *
   * @param {string} lei - LEI to link
   * @param {number} companyId - Target company ID
   * @returns {boolean} Success
   */
  manualLink(lei, companyId) {
    const result = this.stmtUpdateCompanyLink.run(
      companyId,
      'manual',
      1.0,
      lei
    );
    return result.changes > 0;
  }

  /**
   * Get linking statistics
   *
   * @returns {Object} Statistics
   */
  getStatistics() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN link_status = 'linked' THEN 1 ELSE 0 END) as linked,
        SUM(CASE WHEN link_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN link_status = 'no_match' THEN 1 ELSE 0 END) as no_match,
        SUM(CASE WHEN link_status = 'no_symbol' THEN 1 ELSE 0 END) as no_symbol,
        SUM(CASE WHEN link_status = 'resolution_failed' THEN 1 ELSE 0 END) as resolution_failed,
        AVG(CASE WHEN link_confidence IS NOT NULL THEN link_confidence END) as avg_confidence
      FROM company_identifiers
    `).get();

    const methodCounts = this.db.prepare(`
      SELECT link_method, COUNT(*) as count
      FROM company_identifiers
      WHERE link_status = 'linked'
      GROUP BY link_method
    `).all();

    return {
      ...stats,
      linkMethods: Object.fromEntries(
        methodCounts.map(m => [m.link_method, m.count])
      )
    };
  }

  /**
   * Calculate name matching confidence
   * @private
   */
  _calculateNameConfidence(name1, name2) {
    if (!name1 || !name2) return 0;

    const normalize = (s) => s.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/(inc|corp|ltd|plc|ag|sa|nv|se)$/g, '');

    const n1 = normalize(name1);
    const n2 = normalize(name2);

    if (n1 === n2) return 0.95;

    // Simple containment check
    if (n1.includes(n2) || n2.includes(n1)) {
      return 0.8;
    }

    // Levenshtein-based similarity
    const distance = this._levenshteinDistance(n1, n2);
    const maxLen = Math.max(n1.length, n2.length);
    const similarity = 1 - (distance / maxLen);

    return Math.max(0, Math.min(1, similarity * 0.9));
  }

  /**
   * Levenshtein distance calculation
   * @private
   */
  _levenshteinDistance(s1, s2) {
    const m = s1.length;
    const n = s2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const d = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + cost
        );
      }
    }

    return d[m][n];
  }
}

module.exports = { CompanyLinker };
