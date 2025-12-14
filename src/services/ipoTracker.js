// src/services/ipoTracker.js
// Main IPO tracking service - discovers, tracks, and manages IPO pipeline

const SECFilingFetcher = require('./secFilingFetcher');

/**
 * IPO lifecycle stages
 */
const IPO_STAGES = {
  S1_FILED: {
    name: 'Registration Filed',
    description: 'Initial S-1 filed with SEC',
    order: 1,
    color: '#6b7280'
  },
  S1_AMENDED: {
    name: 'Amendment Filed',
    description: 'Responding to SEC comments',
    order: 2,
    color: '#3b82f6'
  },
  PRICE_RANGE_SET: {
    name: 'Price Range Set',
    description: 'Expected price range disclosed',
    order: 3,
    color: '#8b5cf6'
  },
  EFFECTIVE: {
    name: 'Registration Effective',
    description: 'SEC approved, ready to price',
    order: 4,
    color: '#f59e0b'
  },
  PRICED: {
    name: 'IPO Priced',
    description: 'Final price set, trading imminent',
    order: 5,
    color: '#10b981'
  },
  TRADING: {
    name: 'Now Trading',
    description: 'Listed and trading on exchange',
    order: 6,
    color: '#059669'
  },
  WITHDRAWN: {
    name: 'Withdrawn',
    description: 'IPO cancelled',
    order: -1,
    color: '#ef4444'
  }
};

/**
 * Form types relevant to IPO tracking
 */
const IPO_FORM_TYPES = {
  REGISTRATION: ['S-1', 'S-1/A', 'F-1', 'F-1/A'],
  PROSPECTUS: ['424B1', '424B2', '424B3', '424B4', '424B5'],
  EFFECTIVE: ['EFFECT'],
  WITHDRAWN: ['RW', 'RW WD']
};

class IPOTracker {
  constructor(database, userAgent = 'Stock Analyzer contact@example.com') {
    this.db = database;
    this.userAgent = userAgent;
    this.secFetcher = new SECFilingFetcher(userAgent);
  }

  // ============================================
  // ENRICHMENT METHODS
  // ============================================

  /**
   * Fetch company info from SEC submissions API
   */
  async fetchCompanyInfo(cik) {
    const https = require('https');
    const paddedCik = cik.toString().padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;

    return new Promise((resolve) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(15000, () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Map SIC code to sector/industry
   */
  mapSICToSector(sicCode) {
    const sic = parseInt(sicCode);
    if (!sic) return { sector: null, industry: null };

    // SIC code ranges to sectors
    if (sic >= 100 && sic < 1000) return { sector: 'Agriculture', industry: 'Agriculture, Forestry, Fishing' };
    if (sic >= 1000 && sic < 1500) return { sector: 'Mining', industry: 'Mining & Extraction' };
    if (sic >= 1500 && sic < 1800) return { sector: 'Construction', industry: 'Construction' };
    if (sic >= 2000 && sic < 4000) return { sector: 'Manufacturing', industry: this.mapManufacturingIndustry(sic) };
    if (sic >= 4000 && sic < 5000) return { sector: 'Transportation & Utilities', industry: this.mapTransportIndustry(sic) };
    if (sic >= 5000 && sic < 5200) return { sector: 'Wholesale Trade', industry: 'Wholesale Trade' };
    if (sic >= 5200 && sic < 6000) return { sector: 'Retail Trade', industry: 'Retail Trade' };
    if (sic >= 6000 && sic < 6800) return { sector: 'Finance', industry: this.mapFinanceIndustry(sic) };
    if (sic >= 7000 && sic < 9000) return { sector: 'Services', industry: this.mapServicesIndustry(sic) };
    if (sic >= 9000) return { sector: 'Public Administration', industry: 'Government' };

    return { sector: 'Other', industry: 'Other' };
  }

  mapManufacturingIndustry(sic) {
    if (sic >= 2800 && sic < 2900) return 'Chemicals & Pharmaceuticals';
    if (sic >= 3500 && sic < 3600) return 'Industrial Machinery';
    if (sic >= 3570 && sic < 3580) return 'Computer Equipment';
    if (sic >= 3600 && sic < 3700) return 'Electronics & Electrical';
    if (sic >= 3670 && sic < 3680) return 'Semiconductors';
    if (sic >= 3700 && sic < 3800) return 'Transportation Equipment';
    if (sic >= 3800 && sic < 3900) return 'Instruments & Medical Devices';
    return 'Manufacturing';
  }

  mapTransportIndustry(sic) {
    if (sic >= 4800 && sic < 4900) return 'Communications & Telecom';
    if (sic >= 4900 && sic < 5000) return 'Utilities';
    return 'Transportation';
  }

  mapFinanceIndustry(sic) {
    if (sic >= 6000 && sic < 6100) return 'Banking';
    if (sic >= 6200 && sic < 6300) return 'Securities & Investment';
    if (sic >= 6300 && sic < 6400) return 'Insurance';
    if (sic >= 6500 && sic < 6600) return 'Real Estate';
    if (sic >= 6700 && sic < 6800) return 'Investment Funds';
    return 'Financial Services';
  }

  mapServicesIndustry(sic) {
    if (sic >= 7370 && sic < 7380) return 'Software & IT Services';
    if (sic >= 7300 && sic < 7400) return 'Business Services';
    if (sic >= 8000 && sic < 8100) return 'Healthcare Services';
    if (sic >= 8700 && sic < 8800) return 'Engineering & R&D';
    return 'Services';
  }

  /**
   * Enrich IPO with company metadata from SEC submissions API
   * Called automatically after creating new IPO records
   */
  async enrichIPO(ipoId, cik) {
    try {
      const updates = {};
      const ipo = this.getIPO(ipoId);
      if (!ipo) return;

      // Fetch company info from SEC API
      const companyInfo = await this.fetchCompanyInfo(cik);

      if (companyInfo) {
        // Get ticker
        if (!ipo.ticker_proposed && companyInfo.tickers?.length > 0) {
          updates.ticker_proposed = companyInfo.tickers[0];
        }

        // Get sector/industry from SIC code
        if (!ipo.sector || !ipo.industry) {
          const sicCode = companyInfo.sic;
          if (sicCode) {
            const { sector, industry } = this.mapSICToSector(sicCode);
            if (!ipo.sector && sector) updates.sector = sector;
            if (!ipo.industry && industry) updates.industry = industry;
          }
        }

        // Get state from addresses
        if (!ipo.headquarters_state && companyInfo.addresses?.business?.stateOrCountry) {
          const state = companyInfo.addresses.business.stateOrCountry;
          if (state.length === 2) {
            updates.headquarters_state = state;
          }
        }

        // Get exchange
        if (!ipo.exchange_proposed && companyInfo.exchanges?.length > 0) {
          updates.exchange_proposed = companyInfo.exchanges[0];
        }
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        this.updateIPO(ipoId, updates);
        console.log(`    Enriched: ${Object.keys(updates).join(', ')}`);
      }

    } catch (error) {
      console.warn(`    Warning: Could not enrich IPO: ${error.message}`);
    }
  }

  // ============================================
  // FILING CHECK METHODS
  // ============================================

  /**
   * Check SEC for new IPO filings
   * Call this daily or on-demand
   */
  async checkForNewFilings() {
    const startTime = Date.now();
    console.log('\n========================================');
    console.log('Starting IPO filing check...');
    console.log('========================================\n');

    const results = {
      newIPOs: [],
      updates: [],
      errors: []
    };

    try {
      // 1. Check S-1 filings (new IPOs)
      console.log('1. Checking for new S-1 filings...');
      const s1Filings = await this.secFetcher.fetchRecentFilings('S-1', 50);

      for (const filing of s1Filings) {
        try {
          const result = await this.processS1Filing(filing);
          if (result.isNew) {
            results.newIPOs.push(result.ipo);
            console.log(`   NEW IPO: ${result.ipo.company_name} (CIK: ${result.ipo.cik})`);
          }
        } catch (error) {
          results.errors.push(`S-1 processing error for ${filing.cik}: ${error.message}`);
        }
      }

      // 2. Check S-1/A amendments
      console.log('\n2. Checking for S-1/A amendments...');
      const amendments = await this.secFetcher.fetchRecentFilings('S-1/A', 100);

      for (const filing of amendments) {
        try {
          const result = await this.processAmendment(filing);
          if (result) {
            results.updates.push(result);
            console.log(`   UPDATED: ${result.company_name} - Amendment #${result.amendment_count}`);
          }
        } catch (error) {
          results.errors.push(`Amendment processing error for ${filing.cik}: ${error.message}`);
        }
      }

      // 3. Check 424B prospectuses (pricing)
      console.log('\n3. Checking for 424B4 prospectuses (pricing)...');
      const prospectuses = await this.secFetcher.fetchRecentFilings('424B4', 50);

      for (const filing of prospectuses) {
        try {
          const result = await this.processPricingFiling(filing);
          if (result) {
            results.updates.push(result);
            console.log(`   PRICED: ${result.company_name} at $${result.final_price}`);
          }
        } catch (error) {
          results.errors.push(`Pricing filing error for ${filing.cik}: ${error.message}`);
        }
      }

      // 4. Check EFFECT notices
      console.log('\n4. Checking for EFFECT notices...');
      const effectives = await this.secFetcher.fetchRecentFilings('EFFECT', 50);

      for (const filing of effectives) {
        try {
          const result = await this.processEffectiveNotice(filing);
          if (result) {
            results.updates.push(result);
            console.log(`   EFFECTIVE: ${result.company_name}`);
          }
        } catch (error) {
          results.errors.push(`Effective notice error for ${filing.cik}: ${error.message}`);
        }
      }

      // 5. Log the check
      const duration = Date.now() - startTime;
      this.logCheck('full_scan', results.newIPOs.length, results.updates.length, null, duration);

      console.log('\n========================================');
      console.log(`IPO check completed in ${(duration / 1000).toFixed(1)}s`);
      console.log(`  New IPOs: ${results.newIPOs.length}`);
      console.log(`  Updates: ${results.updates.length}`);
      console.log(`  Errors: ${results.errors.length}`);
      console.log('========================================\n');

    } catch (error) {
      results.errors.push(error.message);
      this.logCheck('full_scan', 0, 0, error.message, Date.now() - startTime);
      console.error('IPO check failed:', error.message);
    }

    return results;
  }

  /**
   * Process a new S-1 filing
   */
  async processS1Filing(filing) {
    // Check if we already track this CIK
    const existing = this.getIPOByCIK(filing.cik);

    if (existing) {
      // Already tracking - not a new IPO
      return { isNew: false, isUpdate: false, ipo: existing };
    }

    // New IPO - parse S-1 for details
    let s1Data = {
      companyName: filing.companyName,
      proposedTicker: null,
      proposedExchange: null,
      industry: null,
      sector: null,
      businessDescription: null,
      headquartersState: null,
      revenueLatest: null,
      netIncomeLatest: null,
      totalAssets: null,
      leadUnderwriters: null
    };

    // Try to parse the S-1 for more details
    try {
      const parsed = await this.secFetcher.parseS1Filing(filing.cik, filing.accessionNumber);
      s1Data = { ...s1Data, ...parsed };
    } catch (error) {
      console.warn(`    Warning: Could not parse S-1 details: ${error.message}`);
    }

    // Create IPO record
    const ipo = this.createIPO({
      cik: filing.cik,
      company_name: s1Data.companyName || filing.companyName,
      ticker_proposed: s1Data.proposedTicker,
      initial_s1_date: filing.filingDate,
      exchange_proposed: s1Data.proposedExchange,
      industry: s1Data.industry,
      sector: s1Data.sector,
      business_description: s1Data.businessDescription,
      headquarters_state: s1Data.headquartersState,
      revenue_latest: s1Data.revenueLatest,
      net_income_latest: s1Data.netIncomeLatest,
      total_assets: s1Data.totalAssets,
      lead_underwriters: s1Data.leadUnderwriters,
      price_range_low: s1Data.priceRangeLow,
      price_range_high: s1Data.priceRangeHigh,
      shares_offered: s1Data.sharesOffered,
      status: s1Data.priceRangeLow ? 'PRICE_RANGE_SET' : 'S1_FILED'
    });

    // Record the filing
    this.createIPOFiling({
      ipo_id: ipo.id,
      form_type: filing.formType || 'S-1',
      accession_number: filing.accessionNumber,
      filing_date: filing.filingDate,
      filing_url: this.secFetcher.buildFilingUrl(filing.cik, filing.accessionNumber),
      price_range_low: s1Data.priceRangeLow,
      price_range_high: s1Data.priceRangeHigh,
      shares_offered: s1Data.sharesOffered
    });

    // Automatically enrich with company metadata from SEC API
    await this.enrichIPO(ipo.id, filing.cik);

    // Return the enriched IPO
    return { isNew: true, isUpdate: false, ipo: this.getIPO(ipo.id) };
  }

  /**
   * Process an S-1/A amendment
   */
  async processAmendment(filing) {
    const ipo = this.getIPOByCIK(filing.cik);
    if (!ipo) return null; // Not tracking this IPO

    // Check if we already have this filing
    const existingFiling = this.getFilingByAccession(filing.accessionNumber);
    if (existingFiling) return null;

    // Parse amendment for updates
    let amendmentData = {
      priceRangeLow: null,
      priceRangeHigh: null,
      sharesOffered: null
    };

    try {
      amendmentData = await this.secFetcher.parseAmendment(filing.cik, filing.accessionNumber);
    } catch (error) {
      console.warn(`    Warning: Could not parse amendment: ${error.message}`);
    }

    // Build updates
    const updates = {
      latest_amendment_date: filing.filingDate,
      amendment_count: ipo.amendment_count + 1,
      updated_at: new Date().toISOString()
    };

    // Check for price range
    if (amendmentData.priceRangeLow && amendmentData.priceRangeHigh) {
      updates.price_range_low = amendmentData.priceRangeLow;
      updates.price_range_high = amendmentData.priceRangeHigh;
      updates.shares_offered = amendmentData.sharesOffered;

      // Calculate deal size estimate (midpoint * shares)
      const midPrice = (amendmentData.priceRangeLow + amendmentData.priceRangeHigh) / 2;
      if (amendmentData.sharesOffered) {
        updates.deal_size = midPrice * amendmentData.sharesOffered;
      }

      updates.status = 'PRICE_RANGE_SET';
    } else if (ipo.status === 'S1_FILED') {
      updates.status = 'S1_AMENDED';
    }

    this.updateIPO(ipo.id, updates);

    // Record the filing
    this.createIPOFiling({
      ipo_id: ipo.id,
      form_type: filing.formType || 'S-1/A',
      accession_number: filing.accessionNumber,
      filing_date: filing.filingDate,
      filing_url: this.secFetcher.buildFilingUrl(filing.cik, filing.accessionNumber),
      is_amendment: 1,
      amendment_number: ipo.amendment_count + 1,
      price_range_low: amendmentData.priceRangeLow,
      price_range_high: amendmentData.priceRangeHigh,
      shares_offered: amendmentData.sharesOffered
    });

    return this.getIPO(ipo.id);
  }

  /**
   * Process 424B prospectus (final pricing)
   */
  async processPricingFiling(filing) {
    const ipo = this.getIPOByCIK(filing.cik);
    if (!ipo) return null;

    // Check if we already have this filing
    const existingFiling = this.getFilingByAccession(filing.accessionNumber);
    if (existingFiling) return null;

    // Parse prospectus for pricing
    let pricingData = {
      finalPrice: null,
      sharesOffered: null,
      ticker: null,
      exchange: null
    };

    try {
      pricingData = await this.secFetcher.parsePricingProspectus(filing.cik, filing.accessionNumber);
    } catch (error) {
      console.warn(`    Warning: Could not parse prospectus: ${error.message}`);
    }

    // Only update if we got a final price
    if (!pricingData.finalPrice) return null;

    const updates = {
      final_price: pricingData.finalPrice,
      pricing_date: filing.filingDate,
      status: 'PRICED',
      updated_at: new Date().toISOString()
    };

    if (pricingData.sharesOffered) {
      updates.shares_offered = pricingData.sharesOffered;
      updates.deal_size = pricingData.finalPrice * pricingData.sharesOffered;
    }

    if (pricingData.ticker) {
      updates.ticker_final = pricingData.ticker;
    }

    if (pricingData.exchange) {
      updates.exchange_final = pricingData.exchange;
    }

    this.updateIPO(ipo.id, updates);

    // Record the filing
    this.createIPOFiling({
      ipo_id: ipo.id,
      form_type: filing.formType || '424B4',
      accession_number: filing.accessionNumber,
      filing_date: filing.filingDate,
      filing_url: this.secFetcher.buildFilingUrl(filing.cik, filing.accessionNumber),
      final_price: pricingData.finalPrice,
      shares_offered: pricingData.sharesOffered
    });

    return this.getIPO(ipo.id);
  }

  /**
   * Process EFFECT notice (registration effective)
   */
  async processEffectiveNotice(filing) {
    const ipo = this.getIPOByCIK(filing.cik);
    if (!ipo) return null;

    // Check if we already have this filing
    const existingFiling = this.getFilingByAccession(filing.accessionNumber);
    if (existingFiling) return null;

    // Only update status if not already priced or trading
    if (ipo.status !== 'PRICED' && ipo.status !== 'TRADING') {
      this.updateIPO(ipo.id, {
        effective_date: filing.filingDate,
        status: 'EFFECTIVE',
        updated_at: new Date().toISOString()
      });
    } else {
      // Still record the effective date
      this.updateIPO(ipo.id, {
        effective_date: filing.filingDate,
        updated_at: new Date().toISOString()
      });
    }

    // Record the filing
    this.createIPOFiling({
      ipo_id: ipo.id,
      form_type: 'EFFECT',
      accession_number: filing.accessionNumber,
      filing_date: filing.filingDate,
      filing_url: this.secFetcher.buildFilingUrl(filing.cik, filing.accessionNumber)
    });

    return this.getIPO(ipo.id);
  }

  /**
   * Mark IPO as trading (manual trigger)
   */
  async markAsTrading(ipoId, tradingDate, finalTicker = null) {
    const ipo = this.getIPO(ipoId);
    if (!ipo) throw new Error('IPO not found');

    const updates = {
      trading_date: tradingDate,
      ticker_final: finalTicker || ipo.ticker_final || ipo.ticker_proposed,
      status: 'TRADING',
      is_active: 0, // No longer in pipeline
      updated_at: new Date().toISOString()
    };

    this.updateIPO(ipoId, updates);

    // Optionally create company record and link
    if (updates.ticker_final) {
      try {
        const companyId = await this.createCompanyFromIPO(ipo, updates);
        if (companyId) {
          this.updateIPO(ipoId, { company_id: companyId });
        }
      } catch (error) {
        console.warn(`Could not create company from IPO: ${error.message}`);
      }
    }

    return this.getIPO(ipoId);
  }

  /**
   * Mark IPO as withdrawn
   */
  async markAsWithdrawn(ipoId, withdrawnDate, reason = null) {
    const ipo = this.getIPO(ipoId);
    if (!ipo) throw new Error('IPO not found');

    this.updateIPO(ipoId, {
      withdrawn_date: withdrawnDate,
      status: 'WITHDRAWN',
      is_active: 0,
      updated_at: new Date().toISOString()
    });

    return this.getIPO(ipoId);
  }

  /**
   * Create company record when IPO completes
   */
  async createCompanyFromIPO(ipo, updates) {
    const ticker = updates.ticker_final || ipo.ticker_final || ipo.ticker_proposed;
    if (!ticker) return null;

    // Check if company already exists
    const existing = this.db.prepare(`
      SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(ticker);

    if (existing) {
      // Update existing company with IPO info
      this.db.prepare(`
        UPDATE companies SET
          ipo_date = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(updates.trading_date || ipo.trading_date, existing.id);
      return existing.id;
    }

    // Create new company
    const result = this.db.prepare(`
      INSERT INTO companies (
        symbol, name, sector, industry, exchange, country, is_active
      ) VALUES (?, ?, ?, ?, ?, 'US', 1)
    `).run(
      ticker,
      ipo.company_name,
      ipo.sector,
      ipo.industry,
      updates.exchange_final || ipo.exchange_final || ipo.exchange_proposed
    );

    return result.lastInsertRowid;
  }

  // ============================================
  // DATABASE CRUD OPERATIONS
  // ============================================

  /**
   * Create new IPO record
   */
  createIPO(data) {
    const stmt = this.db.prepare(`
      INSERT INTO ipo_tracker (
        cik, company_name, ticker_proposed, initial_s1_date,
        exchange_proposed, industry, sector, business_description,
        headquarters_state, revenue_latest, net_income_latest,
        total_assets, lead_underwriters, price_range_low,
        price_range_high, shares_offered, status
      ) VALUES (
        @cik, @company_name, @ticker_proposed, @initial_s1_date,
        @exchange_proposed, @industry, @sector, @business_description,
        @headquarters_state, @revenue_latest, @net_income_latest,
        @total_assets, @lead_underwriters, @price_range_low,
        @price_range_high, @shares_offered, @status
      )
    `);

    const result = stmt.run({
      cik: data.cik,
      company_name: data.company_name,
      ticker_proposed: data.ticker_proposed || null,
      initial_s1_date: data.initial_s1_date,
      exchange_proposed: data.exchange_proposed || null,
      industry: data.industry || null,
      sector: data.sector || null,
      business_description: data.business_description || null,
      headquarters_state: data.headquarters_state || null,
      revenue_latest: data.revenue_latest || null,
      net_income_latest: data.net_income_latest || null,
      total_assets: data.total_assets || null,
      lead_underwriters: data.lead_underwriters || null,
      price_range_low: data.price_range_low || null,
      price_range_high: data.price_range_high || null,
      shares_offered: data.shares_offered || null,
      status: data.status || 'S1_FILED'
    });

    return this.getIPO(result.lastInsertRowid);
  }

  /**
   * Update IPO record
   */
  updateIPO(ipoId, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }

    if (fields.length === 0) return;

    values.push(ipoId);

    this.db.prepare(`
      UPDATE ipo_tracker SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  /**
   * Get IPO by ID
   */
  getIPO(ipoId) {
    return this.db.prepare(`SELECT * FROM ipo_tracker WHERE id = ?`).get(ipoId);
  }

  /**
   * Get IPO by CIK
   */
  getIPOByCIK(cik) {
    // Normalize CIK (remove leading zeros for comparison)
    const normalizedCik = cik.toString().replace(/^0+/, '');
    return this.db.prepare(`
      SELECT * FROM ipo_tracker
      WHERE CAST(cik AS TEXT) = ? OR CAST(cik AS TEXT) = ?
    `).get(normalizedCik, cik);
  }

  /**
   * Create IPO filing record
   */
  createIPOFiling(data) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO ipo_filings (
        ipo_id, form_type, accession_number, filing_date, filing_url,
        price_range_low, price_range_high, final_price, shares_offered,
        is_amendment, amendment_number
      ) VALUES (
        @ipo_id, @form_type, @accession_number, @filing_date, @filing_url,
        @price_range_low, @price_range_high, @final_price, @shares_offered,
        @is_amendment, @amendment_number
      )
    `);

    return stmt.run({
      ipo_id: data.ipo_id,
      form_type: data.form_type,
      accession_number: data.accession_number,
      filing_date: data.filing_date,
      filing_url: data.filing_url || null,
      price_range_low: data.price_range_low || null,
      price_range_high: data.price_range_high || null,
      final_price: data.final_price || null,
      shares_offered: data.shares_offered || null,
      is_amendment: data.is_amendment || 0,
      amendment_number: data.amendment_number || null
    });
  }

  /**
   * Get filing by accession number
   */
  getFilingByAccession(accessionNumber) {
    return this.db.prepare(`
      SELECT * FROM ipo_filings WHERE accession_number = ?
    `).get(accessionNumber);
  }

  /**
   * Log check activity
   */
  logCheck(checkType, newFound, updatesFound, errorMessage = null, durationMs = null) {
    this.db.prepare(`
      INSERT INTO ipo_check_log (check_type, new_filings_found, updates_found, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(checkType, newFound, updatesFound, errorMessage, durationMs);
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get IPO pipeline (all active IPOs)
   */
  getPipeline(options = {}) {
    const { status, sector, sortBy = 'initial_s1_date', sortOrder = 'DESC', limit } = options;

    let sql = `
      SELECT * FROM ipo_tracker
      WHERE is_active = 1
    `;

    const params = [];

    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }

    if (sector) {
      sql += ` AND sector = ?`;
      params.push(sector);
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortColumns = [
      'initial_s1_date', 'latest_amendment_date', 'effective_date',
      'pricing_date', 'trading_date', 'deal_size', 'company_name',
      'price_range_high', 'amendment_count', 'created_at'
    ];

    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'initial_s1_date';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${safeSortBy} ${safeSortOrder}`;

    if (limit) {
      sql += ` LIMIT ?`;
      params.push(limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get IPOs grouped by stage
   */
  getByStage() {
    const stages = {};

    for (const status of Object.keys(IPO_STAGES)) {
      stages[status] = this.db.prepare(`
        SELECT * FROM ipo_tracker
        WHERE status = ? AND is_active = 1
        ORDER BY initial_s1_date DESC
      `).all(status);
    }

    return stages;
  }

  /**
   * Get recently completed IPOs
   */
  getRecentlyCompleted(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM ipo_tracker
      WHERE status = 'TRADING'
      ORDER BY trading_date DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get IPOs expected soon (have price range)
   */
  getExpectedSoon() {
    return this.db.prepare(`
      SELECT * FROM ipo_tracker
      WHERE status IN ('PRICE_RANGE_SET', 'EFFECTIVE', 'PRICED')
        AND is_active = 1
      ORDER BY
        CASE status
          WHEN 'PRICED' THEN 1
          WHEN 'EFFECTIVE' THEN 2
          WHEN 'PRICE_RANGE_SET' THEN 3
        END,
        latest_amendment_date DESC
    `).all();
  }

  /**
   * Get single IPO with all filings
   */
  getIPOWithFilings(ipoId) {
    const ipo = this.db.prepare(`SELECT * FROM ipo_tracker WHERE id = ?`).get(ipoId);

    if (!ipo) return null;

    const filings = this.db.prepare(`
      SELECT * FROM ipo_filings
      WHERE ipo_id = ?
      ORDER BY filing_date DESC
    `).all(ipoId);

    // Check if in watchlist
    const watchlist = this.db.prepare(`
      SELECT * FROM ipo_watchlist WHERE ipo_id = ?
    `).get(ipoId);

    return {
      ...ipo,
      filings,
      inWatchlist: !!watchlist,
      watchlistNotes: watchlist?.notes
    };
  }

  /**
   * Search IPOs by name, ticker, or industry
   */
  searchIPOs(query) {
    const searchTerm = `%${query}%`;
    return this.db.prepare(`
      SELECT * FROM ipo_tracker
      WHERE company_name LIKE ?
         OR ticker_proposed LIKE ?
         OR ticker_final LIKE ?
         OR industry LIKE ?
         OR sector LIKE ?
         OR cik LIKE ?
      ORDER BY
        CASE
          WHEN is_active = 1 THEN 0
          ELSE 1
        END,
        initial_s1_date DESC
      LIMIT 50
    `).all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  /**
   * Get pipeline statistics
   */
  getStatistics() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_active,
        SUM(CASE WHEN status = 'S1_FILED' THEN 1 ELSE 0 END) as filed,
        SUM(CASE WHEN status = 'S1_AMENDED' THEN 1 ELSE 0 END) as amended,
        SUM(CASE WHEN status = 'PRICE_RANGE_SET' THEN 1 ELSE 0 END) as price_set,
        SUM(CASE WHEN status = 'EFFECTIVE' THEN 1 ELSE 0 END) as effective,
        SUM(CASE WHEN status = 'PRICED' THEN 1 ELSE 0 END) as priced,
        AVG(deal_size) as avg_deal_size,
        SUM(deal_size) as total_deal_size
      FROM ipo_tracker
      WHERE is_active = 1
    `).get();

    const recentCompleted = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM ipo_tracker
      WHERE status = 'TRADING'
        AND trading_date > date('now', '-30 days')
    `).get();

    const withdrawn = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM ipo_tracker
      WHERE status = 'WITHDRAWN'
        AND withdrawn_date > date('now', '-90 days')
    `).get();

    const bySector = this.db.prepare(`
      SELECT sector, COUNT(*) as count
      FROM ipo_tracker
      WHERE is_active = 1 AND sector IS NOT NULL
      GROUP BY sector
      ORDER BY count DESC
    `).all();

    const lastCheck = this.db.prepare(`
      SELECT * FROM ipo_check_log
      ORDER BY checked_at DESC
      LIMIT 1
    `).get();

    return {
      ...stats,
      completed_last_30_days: recentCompleted.count,
      withdrawn_last_90_days: withdrawn.count,
      by_sector: bySector,
      last_check: lastCheck
    };
  }

  /**
   * Get sector breakdown
   */
  getSectorBreakdown() {
    return this.db.prepare(`
      SELECT
        COALESCE(sector, 'Unknown') as sector,
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        AVG(CASE WHEN deal_size > 0 THEN deal_size END) as avg_deal_size
      FROM ipo_tracker
      GROUP BY sector
      ORDER BY total DESC
    `).all();
  }

  // ============================================
  // WATCHLIST METHODS
  // ============================================

  /**
   * Add IPO to watchlist
   */
  addToWatchlist(ipoId, notes = null) {
    return this.db.prepare(`
      INSERT OR REPLACE INTO ipo_watchlist (ipo_id, notes)
      VALUES (?, ?)
    `).run(ipoId, notes);
  }

  /**
   * Remove IPO from watchlist
   */
  removeFromWatchlist(ipoId) {
    return this.db.prepare(`
      DELETE FROM ipo_watchlist WHERE ipo_id = ?
    `).run(ipoId);
  }

  /**
   * Update watchlist notes
   */
  updateWatchlistNotes(ipoId, notes) {
    return this.db.prepare(`
      UPDATE ipo_watchlist SET notes = ? WHERE ipo_id = ?
    `).run(notes, ipoId);
  }

  /**
   * Get user's watchlist
   */
  getWatchlist() {
    return this.db.prepare(`
      SELECT i.*, w.added_at as watchlist_added_at, w.notes as watchlist_notes
      FROM ipo_tracker i
      JOIN ipo_watchlist w ON i.id = w.ipo_id
      ORDER BY w.added_at DESC
    `).all();
  }

  /**
   * Check if IPO is in watchlist
   */
  isInWatchlist(ipoId) {
    const result = this.db.prepare(`
      SELECT 1 FROM ipo_watchlist WHERE ipo_id = ?
    `).get(ipoId);
    return !!result;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get check history
   */
  getCheckHistory(limit = 20) {
    return this.db.prepare(`
      SELECT * FROM ipo_check_log
      ORDER BY checked_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get stage info
   */
  static getStageInfo(status) {
    return IPO_STAGES[status] || null;
  }

  /**
   * Get all stage definitions
   */
  static getAllStages() {
    return IPO_STAGES;
  }

  /**
   * Get form type categories
   */
  static getFormTypes() {
    return IPO_FORM_TYPES;
  }
}

module.exports = { IPOTracker, IPO_STAGES, IPO_FORM_TYPES };
