// src/bulk-import/downloadSECBulk.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { pipeline } = require('stream');
const streamPipeline = promisify(pipeline);
const AdmZip = require('adm-zip');

/**
 * SEC Bulk Data Downloader
 *
 * Downloads quarterly SEC Financial Statement Data Sets
 * from https://www.sec.gov/data-research/sec-markets-data/financial-statement-data-sets
 *
 * Files include: sub.txt, num.txt, tag.txt, pre.txt, etc.
 */

class SECBulkDownloader {
  constructor(baseDir = 'data/sec-bulk') {
    this.baseDir = baseDir;
    this.baseUrl = 'https://www.sec.gov/files/dera/data/financial-statement-data-sets';
    this.userAgent = 'Investment Analysis App info@example.com'; // SEC requires identification
  }

  /**
   * Ensure download directory exists
   */
  ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Download a file from URL
   */
  async downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);

      const options = {
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Encoding': 'gzip, deflate',
          'Host': 'www.sec.gov'
        }
      };

      https.get(url, options, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        } else if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          file.close();
          fs.unlinkSync(dest);
          this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        } else {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        }
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        reject(err);
      });
    });
  }

  /**
   * Extract ZIP file
   */
  extractZip(zipPath, destDir) {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(destDir, true);
      return true;
    } catch (error) {
      console.error(`   ❌ Failed to extract ${zipPath}:`, error.message);
      return false;
    }
  }

  /**
   * Check if quarter data already exists
   */
  quarterExists(year, quarter) {
    const quarterDir = path.join(this.baseDir, `${year}q${quarter}`);
    const requiredFiles = ['sub.txt', 'num.txt', 'tag.txt'];

    if (!fs.existsSync(quarterDir)) {
      return false;
    }

    return requiredFiles.every(file =>
      fs.existsSync(path.join(quarterDir, file))
    );
  }

  /**
   * Get file size in MB
   */
  getFileSizeMB(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const stats = fs.statSync(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
  }

  /**
   * Download and extract a single quarter
   */
  async downloadQuarter(year, quarter, options = {}) {
    const { force = false, keepZip = false } = options;

    const quarterKey = `${year}q${quarter}`;
    const quarterDir = path.join(this.baseDir, quarterKey);
    const zipPath = path.join(this.baseDir, `${quarterKey}.zip`);
    const url = `${this.baseUrl}/${quarterKey}.zip`;

    // Check if already exists
    if (!force && this.quarterExists(year, quarter)) {
      console.log(`   ⏭️  ${quarterKey} already exists, skipping`);
      return { skipped: true, quarter: quarterKey };
    }

    console.log(`   📥 Downloading ${quarterKey}...`);

    try {
      // Ensure base directory exists
      this.ensureDir(this.baseDir);

      // Download ZIP
      await this.downloadFile(url, zipPath);
      const zipSizeMB = this.getFileSizeMB(zipPath);
      console.log(`      ✓ Downloaded (${zipSizeMB} MB)`);

      // Wait 100ms to respect SEC rate limits (10 requests/second)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Extract ZIP
      this.ensureDir(quarterDir);
      const extracted = this.extractZip(zipPath, quarterDir);

      if (extracted) {
        console.log(`      ✓ Extracted to ${quarterDir}`);

        // Show extracted file sizes
        const files = ['sub.txt', 'num.txt', 'tag.txt'];
        for (const file of files) {
          const filePath = path.join(quarterDir, file);
          if (fs.existsSync(filePath)) {
            const sizeMB = this.getFileSizeMB(filePath);
            console.log(`        - ${file}: ${sizeMB} MB`);
          }
        }
      }

      // Clean up ZIP file unless keepZip is true
      if (!keepZip && fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log(`      ✓ Cleaned up ZIP file`);
      }

      return { success: true, quarter: quarterKey, sizeMB: zipSizeMB };

    } catch (error) {
      console.error(`   ❌ Failed to download ${quarterKey}:`, error.message);

      // Clean up partial downloads
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      return { success: false, quarter: quarterKey, error: error.message };
    }
  }

  /**
   * Download all quarters in a year range
   */
  async downloadRange(startYear, endYear, options = {}) {
    console.log('\n📦 SEC BULK DATA DOWNLOADER\n');
    console.log('='.repeat(60));
    console.log(`📅 Downloading: Q1 ${startYear} - Q4 ${endYear}`);
    console.log(`📁 Destination: ${path.resolve(this.baseDir)}\n`);

    const results = {
      total: 0,
      downloaded: 0,
      skipped: 0,
      failed: 0,
      quarters: []
    };

    const startTime = Date.now();

    for (let year = startYear; year <= endYear; year++) {
      // Determine quarters for this year
      const quarters = year === endYear ? [1, 2, 3, 4] : [1, 2, 3, 4];

      console.log(`\n📆 Year ${year}`);
      console.log('-'.repeat(60));

      for (const quarter of quarters) {
        // Check if this quarter exists yet (don't try to download future quarters)
        const now = new Date();
        const quarterDate = new Date(year, quarter * 3 - 1, 1);

        if (quarterDate > now) {
          console.log(`   ⏭️  ${year}q${quarter} not yet available, skipping`);
          continue;
        }

        results.total++;

        const result = await this.downloadQuarter(year, quarter, options);
        results.quarters.push(result);

        if (result.skipped) {
          results.skipped++;
        } else if (result.success) {
          results.downloaded++;
        } else {
          results.failed++;
        }

        // Rate limiting: 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('📊 DOWNLOAD SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully downloaded: ${results.downloaded}`);
    console.log(`⏭️  Skipped (already exists): ${results.skipped}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏱️  Time elapsed: ${elapsed}s`);
    console.log(`📁 Data location: ${path.resolve(this.baseDir)}\n`);

    return results;
  }

  /**
   * List downloaded quarters
   */
  listDownloaded() {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }

    const dirs = fs.readdirSync(this.baseDir)
      .filter(name => /^\d{4}q\d$/.test(name))
      .sort();

    return dirs.map(dir => {
      const fullPath = path.join(this.baseDir, dir);
      const files = fs.readdirSync(fullPath);
      const totalSize = files.reduce((sum, file) => {
        return sum + fs.statSync(path.join(fullPath, file)).size;
      }, 0);

      return {
        quarter: dir,
        path: fullPath,
        files: files.length,
        sizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
    });
  }

  /**
   * Clean up all downloaded data
   */
  cleanup() {
    if (fs.existsSync(this.baseDir)) {
      fs.rmSync(this.baseDir, { recursive: true, force: true });
      console.log(`✅ Cleaned up ${this.baseDir}`);
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
SEC Bulk Data Downloader

Usage:
  node downloadSECBulk.js [options]

Options:
  --start YEAR     Start year (default: 2009)
  --end YEAR       End year (default: 2024)
  --force          Re-download even if exists
  --keep-zip       Keep ZIP files after extraction
  --list           List downloaded quarters
  --cleanup        Delete all downloaded data
  --help, -h       Show this help

Examples:
  node downloadSECBulk.js --start 2015 --end 2024
  node downloadSECBulk.js --start 2023 --end 2024 --force
  node downloadSECBulk.js --list
`);
    process.exit(0);
  }

  const downloader = new SECBulkDownloader();

  if (args.includes('--list')) {
    console.log('\n📋 Downloaded Quarters:\n');
    const downloaded = downloader.listDownloaded();

    if (downloaded.length === 0) {
      console.log('No quarters downloaded yet.\n');
    } else {
      downloaded.forEach(q => {
        console.log(`  ${q.quarter}: ${q.files} files, ${q.sizeMB} MB`);
      });
      console.log('');
    }
    process.exit(0);
  }

  if (args.includes('--cleanup')) {
    downloader.cleanup();
    process.exit(0);
  }

  const startYear = parseInt(args[args.indexOf('--start') + 1]) || 2009;
  const endYear = parseInt(args[args.indexOf('--end') + 1]) || 2024;
  const force = args.includes('--force');
  const keepZip = args.includes('--keep-zip');

  downloader.downloadRange(startYear, endYear, { force, keepZip })
    .then(results => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

module.exports = SECBulkDownloader;
