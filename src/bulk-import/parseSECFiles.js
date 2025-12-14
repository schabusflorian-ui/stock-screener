// src/bulk-import/parseSECFiles.js
const fs = require('fs');
const readline = require('readline');
const path = require('path');

/**
 * SEC TSV File Parser
 *
 * Parses the tab-separated value files from SEC bulk downloads:
 * - sub.txt: Submission metadata (companies, filings)
 * - num.txt: Numerical data (financial line items)
 * - tag.txt: Tag definitions
 *
 * Uses streaming for memory efficiency on large files
 */

class SECFileParser {
  /**
   * Parse a TSV line into an object
   */
  static parseTSVLine(line, headers) {
    const values = line.split('\t');
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] || null;
    });

    return obj;
  }

  /**
   * Parse sub.txt file (Submission metadata)
   *
   * Returns array of submission objects
   */
  static async parseSubmissions(filePath, options = {}) {
    const { filter = null, limit = null } = options;

    return new Promise((resolve, reject) => {
      const submissions = [];
      let headers = null;
      let lineCount = 0;

      const stream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        lineCount++;

        // First line is headers
        if (!headers) {
          headers = line.split('\t');
          return;
        }

        // Apply limit
        if (limit && submissions.length >= limit) {
          rl.close();
          return;
        }

        const submission = this.parseTSVLine(line, headers);

        // Apply filter
        if (!filter || filter(submission)) {
          submissions.push(submission);
        }
      });

      rl.on('close', () => {
        resolve(submissions);
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stream num.txt file (Numerical data)
   *
   * Calls callback for each batch of records
   * Much more memory efficient for large files (500MB+)
   */
  static async streamNumbers(filePath, callback, options = {}) {
    const { filter = null, batchSize = 10000 } = options;

    return new Promise((resolve, reject) => {
      let headers = null;
      let batch = [];
      let totalProcessed = 0;
      let lineCount = 0;

      const stream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        lineCount++;

        // First line is headers
        if (!headers) {
          headers = line.split('\t');
          return;
        }

        const number = this.parseTSVLine(line, headers);

        // Apply filter
        if (!filter || filter(number)) {
          batch.push(number);

          // Process batch when full
          if (batch.length >= batchSize) {
            totalProcessed += batch.length;
            callback(batch, totalProcessed);
            batch = [];
          }
        }
      });

      rl.on('close', () => {
        // Process remaining items
        if (batch.length > 0) {
          totalProcessed += batch.length;
          callback(batch, totalProcessed);
        }
        resolve({ totalLines: lineCount, totalProcessed });
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse tag.txt file (Tag definitions)
   *
   * Returns array of tag objects
   */
  static async parseTags(filePath, options = {}) {
    const { limit = null } = options;

    return new Promise((resolve, reject) => {
      const tags = [];
      let headers = null;
      let lineCount = 0;

      const stream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        lineCount++;

        // First line is headers
        if (!headers) {
          headers = line.split('\t');
          return;
        }

        // Apply limit
        if (limit && tags.length >= limit) {
          rl.close();
          return;
        }

        const tag = this.parseTSVLine(line, headers);
        tags.push(tag);
      });

      rl.on('close', () => {
        resolve(tags);
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get submission by ADSH (Accession Number)
   *
   * Efficiently searches for a specific submission
   */
  static async getSubmission(filePath, adsh) {
    return new Promise((resolve, reject) => {
      let headers = null;
      let found = null;

      const stream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', (line) => {
        if (found) {
          rl.close();
          return;
        }

        // First line is headers
        if (!headers) {
          headers = line.split('\t');
          return;
        }

        const submission = this.parseTSVLine(line, headers);

        if (submission.adsh === adsh) {
          found = submission;
          rl.close();
        }
      });

      rl.on('close', () => {
        resolve(found);
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get file statistics
   */
  static getFileStats(filePath) {
    const stats = fs.statSync(filePath);
    return {
      path: filePath,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      exists: true
    };
  }

  /**
   * Count lines in file (fast)
   */
  static async countLines(filePath) {
    return new Promise((resolve, reject) => {
      let count = 0;
      const stream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });

      rl.on('line', () => count++);
      rl.on('close', () => resolve(count));
      rl.on('error', reject);
    });
  }
}

// CLI usage for testing
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
SEC File Parser - Testing Utility

Usage:
  node parseSECFiles.js <command> <file>

Commands:
  count <file>         Count lines in file
  stats <file>         Show file statistics
  peek <file> [n]      Show first n records (default: 10)
  test-sub <file>      Test submission parsing
  test-num <file>      Test number streaming

Examples:
  node parseSECFiles.js count data/sec-bulk/2024q1/num.txt
  node parseSECFiles.js peek data/sec-bulk/2024q1/sub.txt 5
  node parseSECFiles.js test-num data/sec-bulk/2024q1/num.txt
`);
    process.exit(1);
  }

  const [command, file, ...rest] = args;

  (async () => {
    try {
      switch (command) {
        case 'count': {
          console.log('Counting lines...');
          const count = await SECFileParser.countLines(file);
          console.log(`Total lines: ${count.toLocaleString()}`);
          break;
        }

        case 'stats': {
          const stats = SECFileParser.getFileStats(file);
          console.log('File Statistics:');
          console.log(`  Path: ${stats.path}`);
          console.log(`  Size: ${stats.sizeMB} MB`);
          break;
        }

        case 'peek': {
          const limit = parseInt(rest[0]) || 10;
          console.log(`Reading first ${limit} records...`);

          if (file.includes('sub.txt')) {
            const submissions = await SECFileParser.parseSubmissions(file, { limit });
            console.log(JSON.stringify(submissions, null, 2));
          } else if (file.includes('num.txt')) {
            const numbers = [];
            await SECFileParser.streamNumbers(file, (batch) => {
              numbers.push(...batch);
            }, { batchSize: limit });
            console.log(JSON.stringify(numbers.slice(0, limit), null, 2));
          } else if (file.includes('tag.txt')) {
            const tags = await SECFileParser.parseTags(file, { limit });
            console.log(JSON.stringify(tags, null, 2));
          }
          break;
        }

        case 'test-sub': {
          console.log('Testing submission parsing...');
          const filter = (sub) => sub.form === '10-K' || sub.form === '10-Q';
          const submissions = await SECFileParser.parseSubmissions(file, { filter, limit: 100 });
          console.log(`Found ${submissions.length} 10-K/10-Q submissions`);
          console.log('Sample:', submissions[0]);
          break;
        }

        case 'test-num': {
          console.log('Testing number streaming...');
          let batches = 0;
          let total = 0;

          const filter = (num) => num.uom === 'USD';
          await SECFileParser.streamNumbers(file, (batch, processed) => {
            batches++;
            total = processed;
            if (batches % 10 === 0) {
              console.log(`  Processed ${processed.toLocaleString()} records...`);
            }
          }, { filter, batchSize: 10000 });

          console.log(`Total USD records: ${total.toLocaleString()}`);
          console.log(`Batches processed: ${batches}`);
          break;
        }

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = SECFileParser;
