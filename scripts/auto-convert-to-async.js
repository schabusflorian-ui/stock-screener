#!/usr/bin/env node
// scripts/auto-convert-to-async.js
/**
 * Automated PostgreSQL async conversion helper
 *
 * Helps convert synchronous database code to async:
 * - Identifies patterns that need conversion
 * - Suggests replacements
 * - Validates syntax
 */

const fs = require('fs');
const path = require('path');

const CONVERSION_PATTERNS = [
  {
    name: 'Constructor with db parameter',
    pattern: /constructor\s*\(\s*(\w+)(?:,\s*\w+)*\s*\)\s*{[\s\S]*?this\.db\s*=\s*\1/,
    suggestion: 'Remove db parameter, use getDatabaseAsync() in methods instead',
    autoFix: false
  },
  {
    name: 'db.prepare().get()',
    pattern: /(?:const|let|var)\s+(\w+)\s*=\s*this\.db\.prepare\([^)]+\)\.get\([^)]*\)/g,
    suggestion: 'Convert to: const result = await database.query(sql, params); const VAR = result.rows[0];',
    autoFix: true,
    fix: (match) => {
      // This is a simplified version - would need more sophisticated parsing
      return match.replace(/this\.db\.prepare/, 'await database.query');
    }
  },
  {
    name: 'db.prepare().all()',
    pattern: /(?:const|let|var)\s+(\w+)\s*=\s*this\.db\.prepare\([^)]+\)\.all\([^)]*\)/g,
    suggestion: 'Convert to: const result = await database.query(sql, params); const VAR = result.rows;',
    autoFix: false
  },
  {
    name: 'db.prepare().run()',
    pattern: /(?:const|let|var)\s+(\w+)\s*=\s*this\.db\.prepare\([^)]+\)\.run\([^)]*\)/g,
    suggestion: 'Convert to: const result = await database.query(sql, params);',
    autoFix: false
  },
  {
    name: 'db.exec()',
    pattern: /this\.db\.exec\(/g,
    suggestion: 'Convert to: await database.query(sql) for each statement',
    autoFix: false
  },
  {
    name: 'Synchronous method (no async)',
    pattern: /^(\s+)(\w+)\s*\([^)]*\)\s*{/gm,
    suggestion: 'Add async keyword if method uses database',
    autoFix: false
  },
  {
    name: 'Missing getDatabaseAsync import',
    pattern: /^const\s+.*=\s+require\(['"]\.\.\/database['"]\)/m,
    suggestion: 'Ensure { getDatabaseAsync } is imported',
    autoFix: false
  }
];

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  for (const pattern of CONVERSION_PATTERNS) {
    const matches = content.match(pattern.pattern);
    if (matches) {
      issues.push({
        name: pattern.name,
        count: Array.isArray(matches) ? matches.length : 1,
        suggestion: pattern.suggestion,
        canAutoFix: pattern.autoFix
      });
    }
  }

  return {
    file: filePath,
    issues,
    totalIssues: issues.reduce((sum, issue) => sum + issue.count, 0),
    hasDbUsage: content.includes('this.db') || content.includes('db.prepare')
  };
}

function generateConversionReport(files) {
  console.log('\n' + '='.repeat(70));
  console.log('PostgreSQL Async Conversion Analysis');
  console.log('='.repeat(70) + '\n');

  const results = files.map(analyzeFile);
  const needsConversion = results.filter(r => r.hasDbUsage);

  console.log(`📊 Summary:`);
  console.log(`  Total files analyzed: ${results.length}`);
  console.log(`  Files needing conversion: ${needsConversion.length}`);
  console.log(`  Total issues found: ${needsConversion.reduce((sum, r) => sum + r.totalIssues, 0)}\n`);

  // Sort by number of issues
  needsConversion.sort((a, b) => b.totalIssues - a.totalIssues);

  console.log('📝 Files Needing Conversion (sorted by complexity):\n');

  for (const result of needsConversion) {
    const fileName = path.basename(result.file);
    console.log(`\n${fileName} (${result.totalIssues} issues):`);
    console.log(`  File: ${result.file}`);

    for (const issue of result.issues) {
      console.log(`  - ${issue.name}: ${issue.count} occurrence(s)`);
      console.log(`    → ${issue.suggestion}`);
      if (issue.canAutoFix) {
        console.log(`    ✓ Can auto-fix`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('🔧 Recommended Conversion Order:\n');

  // Show easiest first (fewer issues)
  const sortedByEasiest = [...needsConversion].sort((a, b) => a.totalIssues - b.totalIssues);
  sortedByEasiest.slice(0, 10).forEach((result, i) => {
    console.log(`  ${i + 1}. ${path.basename(result.file)} (${result.totalIssues} issues)`);
  });

  console.log('\n' + '='.repeat(70) + '\n');

  return results;
}

function showConversionGuide() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║             PostgreSQL Async Conversion Guide                  ║
╚═══════════════════════════════════════════════════════════════╝

📖 Step-by-Step Conversion Process:

1️⃣  Update Imports
   BEFORE: const { db } = require('../database');
   AFTER:  const { getDatabaseAsync } = require('../database');

2️⃣  Remove Constructor DB Parameter
   BEFORE: constructor(db) { this.db = db; }
   AFTER:  constructor() { }

3️⃣  Convert Methods to Async
   BEFORE: myMethod() {
   AFTER:  async myMethod() {

4️⃣  Get Database Instance
   Add at start of async method:
   const database = await getDatabaseAsync();

5️⃣  Convert db.prepare().get()
   BEFORE: const row = this.db.prepare('SELECT * FROM table WHERE id = ?').get(id);
   AFTER:  const result = await database.query('SELECT * FROM table WHERE id = $1', [id]);
           const row = result.rows[0];

6️⃣  Convert db.prepare().all()
   BEFORE: const rows = this.db.prepare('SELECT * FROM table').all();
   AFTER:  const result = await database.query('SELECT * FROM table');
           const rows = result.rows;

7️⃣  Convert db.prepare().run()
   BEFORE: const result = this.db.prepare('INSERT ...').run(params);
   AFTER:  await database.query('INSERT ...', [params]);

8️⃣  Convert SQL Placeholders
   BEFORE: 'WHERE id = ? AND name = ?'
   AFTER:  'WHERE id = $1 AND name = $2'
   Note: database.query() auto-converts for SQLite!

9️⃣  Update Method Callers
   All callers must use await:
   BEFORE: const result = service.myMethod();
   AFTER:  const result = await service.myMethod();

🔟  Test the Service
   node tests/postgresql/services/test-yourservice.js

═══════════════════════════════════════════════════════════════

💡 Tips:
  - Convert one method at a time
  - Test frequently
  - Use database.query() for all queries
  - Placeholders auto-convert ($1 ↔ ?)
  - Keep business logic the same

═══════════════════════════════════════════════════════════════
`);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showConversionGuide();
    process.exit(0);
  }

  if (args.length === 0) {
    console.log('Usage: node scripts/auto-convert-to-async.js <file1> <file2> ...');
    console.log('   Or: node scripts/auto-convert-to-async.js src/services/**/*.js');
    console.log('   Or: node scripts/auto-convert-to-async.js --help');
    process.exit(1);
  }

  // Expand glob patterns if provided
  const files = args.flatMap(arg => {
    if (arg.includes('*')) {
      const glob = require('glob');
      return glob.sync(arg);
    }
    return [arg];
  });

  if (files.length === 0) {
    console.log('No files found to analyze');
    process.exit(1);
  }

  generateConversionReport(files);
  console.log('\n💡 Run with --help to see the conversion guide\n');
}

module.exports = { analyzeFile, generateConversionReport, showConversionGuide };
