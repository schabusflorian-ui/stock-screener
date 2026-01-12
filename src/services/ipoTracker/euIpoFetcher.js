// src/services/ipoTracker/euIpoFetcher.js

/**
 * EU/UK IPO Fetcher
 *
 * Node.js wrapper that calls Python scripts to fetch prospectus data
 * from ESMA (EU) and FCA NSM (UK) regulatory sources.
 *
 * Integrates with existing IPOTracker infrastructure to provide
 * unified IPO tracking across US, EU, and UK markets.
 */

const { spawn } = require('child_process');
const path = require('path');

/**
 * Execute Python script and return parsed JSON output
 * @param {string} scriptName - Python script filename
 * @param {string[]} args - Command line arguments
 * @returns {Promise<Object>} Parsed JSON output
 */
async function runPythonScript(scriptName, args = []) {
  const projectRoot = path.join(__dirname, '../../..');
  const scriptPath = path.join(projectRoot, 'python-services', scriptName);

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script ${scriptName} exited with code ${code}`);
        console.error(`stderr: ${stderr}`);
        // Don't reject - return empty result
        resolve({ count: 0, prospectuses: [], error: stderr });
        return;
      }

      try {
        // Find JSON in output (may have log lines before it)
        const jsonMatch = stdout.match(/\{[\s\S]*\}$/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          resolve(result);
        } else {
          resolve({ count: 0, prospectuses: [], error: 'No JSON output' });
        }
      } catch (error) {
        console.error(`Failed to parse Python output: ${error.message}`);
        resolve({ count: 0, prospectuses: [], error: error.message });
      }
    });

    python.on('error', (error) => {
      console.error(`Failed to spawn Python process: ${error.message}`);
      resolve({ count: 0, prospectuses: [], error: error.message });
    });
  });
}

class EUIpoFetcher {
  constructor(database) {
    this.db = database;
  }

  /**
   * Fetch prospectuses from ESMA (EU-wide)
   * @param {Object} options - Fetch options
   * @param {number} options.days - Days to look back (default 30)
   * @param {string} options.country - Filter by country code
   * @param {number} options.limit - Max results
   * @param {boolean} options.ipoOnly - Only return likely IPOs
   * @returns {Promise<Object>} Fetch results
   */
  async fetchESMA(options = {}) {
    const {
      days = 30,
      country = null,
      limit = 500,
      ipoOnly = true,
    } = options;

    const args = [
      '--days', days.toString(),
      '--limit', limit.toString(),
    ];

    if (country) {
      args.push('--country', country);
    }

    if (ipoOnly) {
      args.push('--ipo-only');
    }

    console.log(`Fetching ESMA prospectuses (${days} days, country=${country || 'all'})...`);

    const result = await runPythonScript('esma_prospectus_fetcher.py', args);

    if (result.error) {
      console.warn(`ESMA fetch warning: ${result.error}`);
    }

    return {
      source: 'ESMA',
      region: 'EU',
      count: result.count || 0,
      prospectuses: (result.prospectuses || []).map(p => this._normalizeProspectus(p, 'ESMA', 'EU')),
      error: result.error,
    };
  }

  /**
   * Fetch prospectuses from FCA NSM (UK)
   * @param {Object} options - Fetch options
   * @param {number} options.days - Days to look back (default 30)
   * @param {number} options.limit - Max results
   * @param {boolean} options.ipoOnly - Only return likely IPOs
   * @returns {Promise<Object>} Fetch results
   */
  async fetchFCA(options = {}) {
    const {
      days = 30,
      limit = 100,
      ipoOnly = true,
    } = options;

    const args = [
      '--days', days.toString(),
      '--limit', limit.toString(),
    ];

    if (ipoOnly) {
      args.push('--ipo-only');
    }

    console.log(`Fetching FCA NSM prospectuses (${days} days)...`);

    const result = await runPythonScript('fca_nsm_fetcher.py', args);

    if (result.error) {
      console.warn(`FCA fetch warning: ${result.error}`);
    }

    return {
      source: 'FCA',
      region: 'UK',
      count: result.count || 0,
      prospectuses: (result.prospectuses || []).map(p => this._normalizeProspectus(p, 'FCA', 'UK')),
      error: result.error,
    };
  }

  /**
   * Fetch from all EU/UK sources
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Combined fetch results
   */
  async fetchAll(options = {}) {
    const { days = 30, ipoOnly = true } = options;

    console.log(`\nFetching EU/UK prospectuses from all sources (${days} days)...`);

    // Fetch in parallel
    const [esmaResult, fcaResult] = await Promise.all([
      this.fetchESMA({ days, ipoOnly }),
      this.fetchFCA({ days, ipoOnly }),
    ]);

    // Combine results
    const allProspectuses = [
      ...esmaResult.prospectuses,
      ...fcaResult.prospectuses,
    ];

    // Deduplicate by LEI if available
    const seen = new Set();
    const uniqueProspectuses = [];

    for (const p of allProspectuses) {
      const key = p.lei || `${p.entity_name}_${p.approval_date}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueProspectuses.push(p);
      }
    }

    return {
      sources: {
        esma: { count: esmaResult.count, error: esmaResult.error },
        fca: { count: fcaResult.count, error: fcaResult.error },
      },
      totalCount: uniqueProspectuses.length,
      prospectuses: uniqueProspectuses,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Normalize prospectus data to consistent format
   * @private
   */
  _normalizeProspectus(p, source, region) {
    return {
      source,
      region,
      entity_name: p.entity_name || p.company_name,
      lei: p.lei,
      isin: p.isin,
      document_type: p.document_type,
      approval_date: p.approval_date || p.filing_date,
      home_member_state: p.home_member_state || (region === 'UK' ? 'GB' : null),
      prospectus_url: p.prospectus_url,
      prospectus_id: p.document_id || p.prospectus_id,
      is_ipo: p.is_ipo !== false,
      raw_data: p,
    };
  }

  /**
   * Check if a prospectus already exists in database
   * @param {Object} prospectus - Prospectus data
   * @returns {boolean} Whether it exists
   */
  prospectusExists(prospectus) {
    if (prospectus.lei) {
      const existing = this.db.prepare(`
        SELECT id FROM ipo_tracker WHERE lei = ? AND region IN ('EU', 'UK')
      `).get(prospectus.lei);
      if (existing) return true;
    }

    if (prospectus.prospectus_id) {
      const existing = this.db.prepare(`
        SELECT id FROM ipo_tracker WHERE prospectus_id = ?
      `).get(prospectus.prospectus_id);
      if (existing) return true;
    }

    return false;
  }

  /**
   * Create IPO record from prospectus
   * @param {Object} prospectus - Normalized prospectus data
   * @returns {Object} Created IPO record
   */
  createIPOFromProspectus(prospectus) {
    // Generate synthetic CIK for EU/UK IPOs (required field in schema)
    // Format: {REGION}-{prospectus_id or LEI}
    const regionPrefix = prospectus.region || 'EU';
    const uniqueId = prospectus.prospectus_id || prospectus.lei || Date.now().toString(36);
    const syntheticCik = `${regionPrefix}-${uniqueId}`;

    // Map prospectus to ipo_tracker fields
    const data = {
      cik: syntheticCik,
      company_name: prospectus.entity_name,
      lei: prospectus.lei,
      isin: prospectus.isin,
      region: prospectus.region,
      regulator: prospectus.source,
      prospectus_id: prospectus.prospectus_id,
      prospectus_url: prospectus.prospectus_url,
      home_member_state: prospectus.home_member_state,
      approval_date: prospectus.approval_date,
      initial_s1_date: prospectus.approval_date, // Use approval date as filing date
      status: 'EFFECTIVE', // Prospectus approved = effective
      is_active: 1,
    };

    const stmt = this.db.prepare(`
      INSERT INTO ipo_tracker (
        cik, company_name, lei, isin, region, regulator,
        prospectus_id, prospectus_url, home_member_state,
        approval_date, initial_s1_date, status, is_active
      ) VALUES (
        @cik, @company_name, @lei, @isin, @region, @regulator,
        @prospectus_id, @prospectus_url, @home_member_state,
        @approval_date, @initial_s1_date, @status, @is_active
      )
    `);

    try {
      const result = stmt.run(data);
      console.log(`  Created IPO: ${data.company_name} (${data.region})`);

      return {
        id: result.lastInsertRowid,
        ...data,
        created: true,
      };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        console.log(`  Skipped (duplicate): ${data.company_name}`);
        return { created: false, duplicate: true };
      }
      throw error;
    }
  }

  /**
   * Process fetched prospectuses - create new IPO records
   * @param {Object} fetchResult - Result from fetchAll()
   * @returns {Object} Processing summary
   */
  processProspectuses(fetchResult) {
    const summary = {
      processed: 0,
      created: 0,
      skipped: 0,
      errors: 0,
    };

    for (const prospectus of fetchResult.prospectuses) {
      summary.processed++;

      try {
        // Skip if already exists
        if (this.prospectusExists(prospectus)) {
          summary.skipped++;
          continue;
        }

        // Create IPO record
        const result = this.createIPOFromProspectus(prospectus);

        if (result.created) {
          summary.created++;
        } else if (result.duplicate) {
          summary.skipped++;
        }
      } catch (error) {
        console.error(`Error processing ${prospectus.entity_name}: ${error.message}`);
        summary.errors++;
      }
    }

    return summary;
  }

  /**
   * Full check: fetch and process all EU/UK prospectuses
   * @param {Object} options - Options
   * @returns {Promise<Object>} Check results
   */
  async checkForNewProspectuses(options = {}) {
    const { days = 30 } = options;

    console.log('\n========================================');
    console.log('Starting EU/UK IPO prospectus check...');
    console.log('========================================\n');

    const startTime = Date.now();

    // Fetch from all sources
    const fetchResult = await this.fetchAll({ days });

    console.log(`\nFetched ${fetchResult.totalCount} prospectuses from ${Object.keys(fetchResult.sources).length} sources`);

    // Process and create IPO records
    const processResult = this.processProspectuses(fetchResult);

    const duration = Date.now() - startTime;

    // Log the check
    this.logCheck('eu_uk_scan', processResult.created, fetchResult.totalCount, null, duration);

    console.log('\n========================================');
    console.log(`EU/UK IPO check completed in ${(duration / 1000).toFixed(1)}s`);
    console.log(`  Fetched: ${fetchResult.totalCount}`);
    console.log(`  Created: ${processResult.created}`);
    console.log(`  Skipped: ${processResult.skipped}`);
    console.log(`  Errors: ${processResult.errors}`);
    console.log('========================================\n');

    return {
      fetchResult,
      processResult,
      duration,
    };
  }

  /**
   * Log check activity
   * @private
   */
  logCheck(checkType, newFound, updatesFound, errorMessage, durationMs) {
    try {
      this.db.prepare(`
        INSERT INTO ipo_check_log (check_type, region, data_source, new_filings_found, updates_found, error_message, duration_ms)
        VALUES (?, 'EU', 'ESMA_FCA', ?, ?, ?, ?)
      `).run(checkType, newFound, updatesFound, errorMessage, durationMs);
    } catch (error) {
      console.warn(`Failed to log check: ${error.message}`);
    }
  }
}

module.exports = { EUIpoFetcher };
