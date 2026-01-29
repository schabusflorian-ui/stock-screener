// src/bulk-import/importSECBulkUnified.js
const path = require('path');
const fs = require('fs');
const db = require('../database');
const SECFileParser = require('./parseSECFiles');
const IntelligentTagMapper = require('./intelligentTagMapper');
const {
  insertTagMappings
} = require('./tagMappings');

/**
 * SEC Bulk Import - UNIFIED VERSION
 *
 * Imports bulk data directly into existing financial_data table
 * Groups line items into complete financial statements
 * Maintains compatibility with existing system
 */

class SECBulkImporterUnified {
  constructor(dbPath = null) {
    this.database = dbPath ? require('better-sqlite3')(dbPath) : db.getDatabase();
    this.companyCache = new Map(); // CIK -> company_id
    this.tagMapper = new IntelligentTagMapper(); // NEW: Intelligent tag mapping
    this.stats = {
      companiesCreated: 0,
      companiesUpdated: 0,
      statementsProcessed: 0,
      statementsInserted: 0,
      statementsUpdated: 0,
      errors: 0
    };
  }

  /**
   * Initialize tag mappings in database
   */
  initializeTagMappings() {
    return insertTagMappings(this.database);
  }

  /**
   * Find or create company by CIK
   */
  findOrCreateCompany(cik, name, sicCode = null) {
    // Check cache first
    if (this.companyCache.has(cik)) {
      return this.companyCache.get(cik);
    }

    // Pad CIK to 10 digits
    const paddedCik = cik.padStart(10, '0');

    // Try to find existing company by CIK
    const existing = this.database.prepare(`
      SELECT id FROM companies WHERE cik = ?
    `).get(paddedCik);

    if (existing) {
      this.companyCache.set(cik, existing.id);
      return existing.id;
    }

    // Try to find by name (fuzzy match)
    const nameMatch = this.database.prepare(`
      SELECT id FROM companies WHERE name LIKE ? LIMIT 1
    `).get(`%${name}%`);

    if (nameMatch) {
      // Update with CIK
      this.database.prepare(`
        UPDATE companies SET cik = ?, sic_code = ? WHERE id = ?
      `).run(paddedCik, sicCode, nameMatch.id);

      this.companyCache.set(cik, nameMatch.id);
      this.stats.companiesUpdated++;
      return nameMatch.id;
    }

    // Check if symbol already exists (to avoid UNIQUE constraint error)
    const symbolCheck = this.database.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(`CIK_${paddedCik}`);

    if (symbolCheck) {
      // Symbol exists, update it with the CIK data
      this.database.prepare(`
        UPDATE companies SET cik = ?, sic_code = ?, name = ? WHERE id = ?
      `).run(paddedCik, sicCode, name, symbolCheck.id);

      this.companyCache.set(cik, symbolCheck.id);
      this.stats.companiesUpdated++;
      return symbolCheck.id;
    }

    // Create new company
    const result = this.database.prepare(`
      INSERT INTO companies (name, cik, sic_code, is_active, symbol)
      VALUES (?, ?, ?, 1, ?)
    `).run(name, paddedCik, sicCode, `CIK_${paddedCik}`);

    this.companyCache.set(cik, result.lastInsertRowid);
    this.stats.companiesCreated++;
    return result.lastInsertRowid;
  }

  /**
   * Convert date from YYYYMMDD to YYYY-MM-DD format
   */
  convertDate(ddateStr) {
    if (!ddateStr || ddateStr.length !== 8) return ddateStr;
    const year = ddateStr.substring(0, 4);
    const month = ddateStr.substring(4, 6);
    const day = ddateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
  }

  /**
   * Derive fiscal year from fiscal date ending
   * For annual reports: use the year of the fiscal date
   * This is more reliable than SEC's fy field which uses calendar year convention
   */
  deriveFiscalYear(fiscalDateEnding) {
    if (!fiscalDateEnding) return null;
    // fiscalDateEnding is in YYYY-MM-DD format
    const year = parseInt(fiscalDateEnding.substring(0, 4));
    return year;
  }

  /**
   * Determine period type and fiscal period from qtrs
   */
  determinePeriod(qtrs, fy, fp, formType) {
    const q = parseInt(qtrs) || 0;

    // Use fiscal period from submission if available
    if (fp) {
      if (fp === 'FY') return { periodType: 'annual', fiscalPeriod: 'FY' };
      if (fp.startsWith('Q')) return { periodType: 'quarterly', fiscalPeriod: fp };
    }

    // Fallback to qtrs field
    switch (q) {
      case 0:
        // qtrs=0 means instant/point-in-time (balance sheet items)
        // For 10-Q, this should be quarterly; for 10-K, this should be annual
        if (formType === '10-Q') {
          return { periodType: 'quarterly', fiscalPeriod: fp || 'Q1' };
        }
        return { periodType: 'annual', fiscalPeriod: 'FY' };
      case 1: return { periodType: 'quarterly', fiscalPeriod: 'Q1' };
      case 2: return { periodType: 'quarterly', fiscalPeriod: 'Q2' };
      case 3: return { periodType: 'quarterly', fiscalPeriod: 'Q3' };
      case 4: return { periodType: 'annual', fiscalPeriod: 'FY' };
      default: return { periodType: 'annual', fiscalPeriod: 'FY' };
    }
  }

  /**
   * Group line items by statement type
   * CRITICAL FIX: Filter by qtrs field to separate point-in-time balances from period flows
   */
  groupLineItemsByStatement(lineItems, qtrs) {
    const statements = {
      balance_sheet: {},
      income_statement: {},
      cash_flow: {}
    };

    for (const item of lineItems) {
      // Use intelligent tag mapper instead of hardcoded mappings
      const mapping = this.tagMapper.mapTag(item.tag);

      if (mapping.statementType !== 'unknown') {
        // CRITICAL FIX: Filter by qtrs field based on statement type
        // Balance sheet items MUST have qtrs=0 (point-in-time balances)
        // Income/Cash flow items MUST have qtrs>0 (period flows)
        const itemQtrs = parseInt(item.qtrs) || 0;

        if (mapping.statementType === 'balance_sheet') {
          // Balance sheets: only accept point-in-time values (qtrs=0)
          if (itemQtrs !== 0) continue;
        } else {
          // Income statement and cash flow: only accept period flows (qtrs>0)
          // Use the qtrs parameter passed from processBatch which is already filtered
          // This ensures we only get the correct period data
          if (itemQtrs === 0) continue;
        }

        // Additional safety check: exclude movement/change tags from balance sheets
        // These should have been caught by qtrs filtering, but double-check
        if (mapping.statementType === 'balance_sheet') {
          const tag = item.tag.toLowerCase();
          if (tag.includes('increasedecrease') ||
              tag.includes('proceedsfrom') ||
              tag.includes('paymentsto') ||
              tag.includes('paymentsfor') ||
              tag.includes('duringperiod') ||
              tag.includes('repurchased') ||
              tag.includes('issued')) {
            continue; // Skip movement/change tags
          }
        }

        // Convert canonical tag to camelCase for storage
        const camelCase = mapping.canonical.charAt(0).toLowerCase() + mapping.canonical.slice(1);

        // Keep highest value for each canonical tag (consolidated totals are typically largest)
        const currentValue = parseFloat(item.value) || 0;
        const existingValue = parseFloat(statements[mapping.statementType][camelCase]) || 0;

        if (Math.abs(currentValue) > Math.abs(existingValue)) {
          statements[mapping.statementType][camelCase] = item.value;
          // Also store original tag name
          statements[mapping.statementType][item.tag] = item.value;
        }
      }
    }

    return statements;
  }

  /**
   * Derive Q4 data from FY - Q3 YTD and insert as Q4 record
   */
  deriveAndInsertQ4(sub, fyData, q3YtdData, fiscalDate) {
    // For each statement type, calculate Q4 = FY - Q3_YTD
    const statementTypes = ['balance_sheet', 'income_statement', 'cash_flow'];

    for (const statementType of statementTypes) {
      const fyStatement = fyData[statementType] || {};
      const q3Statement = q3YtdData[statementType] || {};

      if (Object.keys(fyStatement).length === 0) continue;

      // Create Q4 statement by subtracting Q3 YTD from FY
      const q4Statement = {};

      for (const [key, fyValue] of Object.entries(fyStatement)) {
        const fy = parseFloat(fyValue) || 0;
        const q3Ytd = parseFloat(q3Statement[key]) || 0;
        const q4 = fy - q3Ytd;

        // Only include if Q4 value is non-zero
        if (Math.abs(q4) > 0.01) {
          q4Statement[key] = q4.toString();
        }
      }

      // Insert Q4 if we have data
      if (Object.keys(q4Statement).length > 0) {
        // Derive fiscal year from the fiscal date (more reliable than SEC's fy field)
        const derivedFiscalYear = this.deriveFiscalYear(fiscalDate);
        this.insertOrUpdateStatement(
          sub.company_id,
          statementType,
          fiscalDate,
          derivedFiscalYear,
          'quarterly',
          'Q4',
          q4Statement,
          sub.form,
          sub.filed
        );
      }
    }
  }

  /**
   * Insert or update financial statement
   */
  insertOrUpdateStatement(companyId, statementType, fiscalDate, fiscalYear, periodType, fiscalPeriod, data, form, filedDate) {
    // Extract commonly accessed fields
    const extracted = this.extractCommonFields(statementType, data);

    const stmt = this.database.prepare(`
      INSERT INTO financial_data (
        company_id, statement_type, fiscal_date_ending, fiscal_year,
        period_type, fiscal_period, form, filed_date, data,
        total_assets, total_liabilities, shareholder_equity,
        current_assets, current_liabilities, cash_and_equivalents,
        long_term_debt, short_term_debt,
        total_revenue, net_income, operating_income,
        cost_of_revenue, gross_profit,
        operating_cashflow, capital_expenditures
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
      DO UPDATE SET
        data = excluded.data,
        filed_date = excluded.filed_date,
        form = excluded.form,
        total_assets = excluded.total_assets,
        total_liabilities = excluded.total_liabilities,
        shareholder_equity = excluded.shareholder_equity,
        current_assets = excluded.current_assets,
        current_liabilities = excluded.current_liabilities,
        cash_and_equivalents = excluded.cash_and_equivalents,
        long_term_debt = excluded.long_term_debt,
        short_term_debt = excluded.short_term_debt,
        total_revenue = excluded.total_revenue,
        net_income = excluded.net_income,
        operating_income = excluded.operating_income,
        cost_of_revenue = excluded.cost_of_revenue,
        gross_profit = excluded.gross_profit,
        operating_cashflow = excluded.operating_cashflow,
        capital_expenditures = excluded.capital_expenditures,
        updated_at = CURRENT_TIMESTAMP
      WHERE
        -- Prefer data with MORE complete fields (more non-null values = better data)
        -- Count non-null key fields in new data vs existing data
        (
          (CASE WHEN excluded.total_assets IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.total_liabilities IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.shareholder_equity IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.current_assets IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.current_liabilities IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.total_revenue IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.net_income IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN excluded.operating_cashflow IS NOT NULL THEN 1 ELSE 0 END)
        ) >= (
          (CASE WHEN financial_data.total_assets IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.total_liabilities IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.shareholder_equity IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.current_assets IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.current_liabilities IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.total_revenue IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.net_income IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN financial_data.operating_cashflow IS NOT NULL THEN 1 ELSE 0 END)
        )
    `);

    try {
      const result = stmt.run(
        companyId, statementType, fiscalDate, fiscalYear,
        periodType, fiscalPeriod, form, filedDate, JSON.stringify(data),
        extracted.totalAssets, extracted.totalLiabilities, extracted.shareholderEquity,
        extracted.currentAssets, extracted.currentLiabilities, extracted.cashAndEquivalents,
        extracted.longTermDebt, extracted.shortTermDebt,
        extracted.totalRevenue, extracted.netIncome, extracted.operatingIncome,
        extracted.costOfRevenue, extracted.grossProfit,
        extracted.operatingCashflow, extracted.capitalExpenditures
      );

      if (result.changes > 0) {
        this.stats.statementsInserted++;
      } else {
        this.stats.statementsUpdated++;
      }
    } catch (error) {
      console.error(`Error inserting statement: ${error.message}`);
      this.stats.errors++;
    }
  }

  /**
   * Extract commonly accessed fields from data object
   */
  extractCommonFields(statementType, data) {
    const fields = {
      totalAssets: null,
      totalLiabilities: null,
      shareholderEquity: null,
      currentAssets: null,
      currentLiabilities: null,
      cashAndEquivalents: null,
      longTermDebt: null,
      shortTermDebt: null,
      totalRevenue: null,
      netIncome: null,
      operatingIncome: null,
      costOfRevenue: null,
      grossProfit: null,
      operatingCashflow: null,
      capitalExpenditures: null
    };

    // Balance sheet fields
    fields.totalAssets = data.totalAssets || data.Assets || null;
    fields.totalLiabilities = data.totalLiabilities || data.Liabilities || null;
    fields.shareholderEquity = data.shareholderEquity || data.StockholdersEquity || null;
    fields.currentAssets = data.currentAssets || data.AssetsCurrent || null;
    fields.currentLiabilities = data.currentLiabilities || data.LiabilitiesCurrent || null;
    fields.cashAndEquivalents = data.cashAndEquivalents || data.CashAndCashEquivalentsAtCarryingValue || data.Cash || null;
    fields.longTermDebt = data.longTermDebt || data.LongTermDebtNoncurrent || data.LongTermDebt || null;
    fields.shortTermDebt = data.shortTermDebt || data.LongTermDebtCurrent || data.ShortTermBorrowings || null;

    // Income statement fields
    fields.totalRevenue = data.revenue || data.Revenue || data.Revenues || null;
    fields.netIncome = data.netIncome || data.NetIncomeLoss || null;
    fields.operatingIncome = data.operatingIncome || data.OperatingIncomeLoss || null;
    fields.costOfRevenue = data.costOfRevenue || data.CostOfRevenue || null;
    fields.grossProfit = data.grossProfit || data.GrossProfit || null;

    // Cash flow fields
    fields.operatingCashflow = data.operatingCashFlow || data.NetCashProvidedByUsedInOperatingActivities || null;
    fields.capitalExpenditures = data.capitalExpenditures || data.PaymentsToAcquirePropertyPlantAndEquipment || null;

    return fields;
  }

  /**
   * Process a batch of submissions and their line items
   */
  processBatch(submissions, numbersMap) {
    const insertBatch = this.database.transaction((subs) => {
      for (const sub of subs) {
        try {
          this.stats.statementsProcessed++;

          // Get line items for this submission
          const lineItems = numbersMap.get(sub.adsh) || [];
          if (lineItems.length === 0) continue;

          // Group by fiscal date and period
          // IMPORTANT: For quarterly (10-Q), only use qtrs=1 (single quarter data)
          // For annual (10-K), keep qtrs=3 (Q3 YTD) and qtrs=4 (FY) to derive Q4
          const byPeriod = new Map();

          for (const item of lineItems) {
            const qtrs = parseInt(item.qtrs) || 0;

            // Filter logic based on form type
            if (sub.form === '10-Q') {
              // For quarterly filings, use qtrs=0 (balance sheet) and qtrs=1 (income/cash flow)
              // Skip qtrs=2,3 as they contain YTD cumulative data
              if (qtrs !== 0 && qtrs !== 1) continue;
            } else if (sub.form === '10-K') {
              // For annual filings, keep qtrs=0 (balance sheet), qtrs=3 (Q3 YTD), and qtrs=4 (FY)
              // qtrs=0: Balance sheet point-in-time values
              // qtrs=3: Q3 YTD for income/cash flow (used to derive Q4)
              // qtrs=4: Full year income/cash flow
              if (qtrs !== 0 && qtrs !== 3 && qtrs !== 4) continue;
            }

            const key = `${item.ddate}_${item.qtrs}`;
            if (!byPeriod.has(key)) {
              byPeriod.set(key, []);
            }
            byPeriod.get(key).push(item);
          }

          // Track FY and Q3 YTD data for Q4 calculation
          let fyData = null;
          let q3YtdData = null;
          const fiscalDateForQ4 = sub.period ? this.convertDate(sub.period) : null;

          // Create statements for each period
          for (const [key, items] of byPeriod) {
            const firstItem = items[0];
            const qtrs = parseInt(firstItem.qtrs) || 0;
            const { periodType, fiscalPeriod } = this.determinePeriod(qtrs, sub.fy, sub.fp, sub.form);

            // Convert ddate from YYYYMMDD to YYYY-MM-DD
            const fiscalDate = this.convertDate(firstItem.ddate);

            // Group items by statement type
            const statements = this.groupLineItemsByStatement(items);

            // For 10-K, track FY and Q3 YTD data separately
            if (sub.form === '10-K') {
              if (qtrs === 4) {
                fyData = statements;
              } else if (qtrs === 3) {
                q3YtdData = statements;
                continue; // Don't insert Q3 YTD, we only use it to calculate Q4
              }
            }

            // Derive fiscal year from the actual fiscal date (more reliable than SEC's fy field)
            const derivedFiscalYear = this.deriveFiscalYear(fiscalDate);

            // Insert each statement type
            for (const [statementType, data] of Object.entries(statements)) {
              if (Object.keys(data).length > 0) {
                this.insertOrUpdateStatement(
                  sub.company_id,
                  statementType,
                  fiscalDate,
                  derivedFiscalYear,
                  periodType,
                  fiscalPeriod,
                  data,
                  sub.form,
                  sub.filed
                );
              }
            }
          }

          // Derive Q4 from FY - Q3 YTD for 10-K filings
          if (sub.form === '10-K' && fyData && q3YtdData && fiscalDateForQ4) {
            this.deriveAndInsertQ4(sub, fyData, q3YtdData, fiscalDateForQ4);
          }

        } catch (error) {
          this.stats.errors++;
          if (this.stats.errors < 10) {
            console.error('      ⚠️  Error processing submission:', error.message);
          }
        }
      }
    });

    insertBatch(submissions);
  }

  /**
   * Import a single quarter
   */
  async importQuarter(year, quarter, options = {}) {
    const { limit = null } = options;

    const quarterKey = `${year}q${quarter}`;
    const quarterDir = path.join('data/sec-bulk', quarterKey);

    console.log(`\n📊 Importing ${quarterKey}...`);
    console.log('-'.repeat(60));

    // Check if directory exists
    if (!fs.existsSync(quarterDir)) {
      console.error(`❌ Directory not found: ${quarterDir}`);
      return { success: false, error: 'Directory not found' };
    }

    const subFile = path.join(quarterDir, 'sub.txt');
    const numFile = path.join(quarterDir, 'num.txt');

    const startTime = Date.now();

    try {
      // ========================================
      // Step 1: Parse submissions (10-K, 10-Q only)
      // ========================================
      console.log('   1️⃣  Parsing submissions...');

      const submissions = await SECFileParser.parseSubmissions(subFile, {
        filter: (sub) => sub.form?.startsWith('10-K') || sub.form?.startsWith('10-Q')
      });

      console.log(`      ✓ Found ${submissions.length} filings (10-K/10-Q)`);

      // ========================================
      // Step 2: Create/update companies
      // ========================================
      console.log('   2️⃣  Processing companies...');

      for (const sub of submissions) {
        sub.company_id = this.findOrCreateCompany(sub.cik, sub.name, sub.sic);
      }

      console.log(`      ✓ Companies created: ${this.stats.companiesCreated}`);
      console.log(`      ✓ Companies updated: ${this.stats.companiesUpdated}`);

      // ========================================
      // Step 3: Parse and map numbers to submissions
      // ========================================
      console.log('   3️⃣  Processing financial data...');

      const numbersMap = new Map(); // adsh -> line items
      const adshSet = new Set(submissions.map(s => s.adsh));

      let processedCount = 0;

      await SECFileParser.streamNumbers(numFile, (batch) => {
        // Filter to USD and relevant submissions
        const filtered = batch.filter(num =>
          num.uom === 'USD' && adshSet.has(num.adsh)
        );

        // Group by submission
        for (const num of filtered) {
          if (!numbersMap.has(num.adsh)) {
            numbersMap.set(num.adsh, []);
          }
          numbersMap.get(num.adsh).push(num);
        }

        processedCount += batch.length;
        if (processedCount % 100000 === 0) {
          console.log(`      📈 Processed ${processedCount.toLocaleString()} line items...`);
        }
      }, { batchSize: 10000 });

      console.log(`      ✓ Mapped ${numbersMap.size} submissions`);

      // ========================================
      // Step 4: Create financial statements
      // ========================================
      console.log('   4️⃣  Creating financial statements...');

      this.processBatch(submissions, numbersMap);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`      ✓ Statements inserted: ${this.stats.statementsInserted.toLocaleString()}`);
      console.log(`      ✓ Statements updated: ${this.stats.statementsUpdated.toLocaleString()}`);
      console.log(`      ⏱️  Time: ${elapsed}s`);

      return {
        success: true,
        quarter: quarterKey,
        stats: { ...this.stats },
        elapsed: parseFloat(elapsed)
      };

    } catch (error) {
      console.error(`❌ Failed to import ${quarterKey}:`, error.message);
      return { success: false, quarter: quarterKey, error: error.message };
    }
  }

  /**
   * Import all quarters in range
   */
  async importAll(startYear, endYear, options = {}) {
    console.log('\n📦 SEC BULK IMPORT - UNIFIED VERSION\n');
    console.log('='.repeat(60));
    console.log(`📅 Importing: Q1 ${startYear} - Q4 ${endYear}`);
    console.log('🎯 Target: existing financial_data table\n');

    // Initialize tag mappings
    console.log('🏷️  Initializing tag mappings...');
    const tagCount = this.initializeTagMappings();
    console.log(`✅ Loaded ${tagCount} tag mappings\n`);

    const results = {
      total: 0,
      success: 0,
      failed: 0,
      quarters: [],
      totalStats: {
        companiesCreated: 0,
        companiesUpdated: 0,
        statementsInserted: 0,
        statementsUpdated: 0,
        errors: 0
      }
    };

    const globalStart = Date.now();

    for (let year = startYear; year <= endYear; year++) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        // Reset stats for this quarter
        this.stats = {
          companiesCreated: 0,
          companiesUpdated: 0,
          statementsProcessed: 0,
          statementsInserted: 0,
          statementsUpdated: 0,
          errors: 0
        };

        results.total++;

        const result = await this.importQuarter(year, quarter, options);
        results.quarters.push(result);

        if (result.success) {
          results.success++;
          // Accumulate stats
          Object.keys(results.totalStats).forEach(key => {
            results.totalStats[key] += this.stats[key] || 0;
          });
        } else {
          results.failed++;
        }
      }
    }

    const totalElapsed = ((Date.now() - globalStart) / 1000 / 60).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Quarters imported: ${results.success}/${results.total}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('\n📈 Total Statistics:');
    console.log(`   • Companies created: ${results.totalStats.companiesCreated.toLocaleString()}`);
    console.log(`   • Companies updated: ${results.totalStats.companiesUpdated.toLocaleString()}`);
    console.log(`   • Statements inserted: ${results.totalStats.statementsInserted.toLocaleString()}`);
    console.log(`   • Statements updated: ${results.totalStats.statementsUpdated.toLocaleString()}`);
    console.log(`   • Errors: ${results.totalStats.errors.toLocaleString()}`);
    console.log(`\n⏱️  Total time: ${totalElapsed} minutes`);

    // Print intelligent mapping statistics
    const mappingStats = this.tagMapper.getStats();
    console.log('\n🏷️  Tag Mapping Statistics:');
    console.log(`   • Exact matches: ${mappingStats.exactMatches.toLocaleString()}`);
    console.log(`   • Pattern matches: ${mappingStats.patternMatches.toLocaleString()}`);
    console.log(`   • Auto-categorized: ${mappingStats.autoCategorized.toLocaleString()}`);
    console.log(`   • Unmapped: ${mappingStats.unmapped.toLocaleString()}`);

    const totalMapped = mappingStats.exactMatches + mappingStats.patternMatches + mappingStats.autoCategorized;
    const total = totalMapped + mappingStats.unmapped;
    const coverage = total > 0 ? ((totalMapped / total) * 100).toFixed(1) : 0;
    console.log(`   • Coverage: ${coverage}% (${totalMapped.toLocaleString()}/${total.toLocaleString()} tags)\n`);

    return results;
  }
}

module.exports = SECBulkImporterUnified;
