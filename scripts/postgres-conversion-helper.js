#!/usr/bin/env node

/**
 * PostgreSQL Conversion Helper
 *
 * This script helps identify and analyze services that need PostgreSQL conversion
 *
 * Usage:
 *   node scripts/postgres-conversion-helper.js analyze <service-file>
 *   node scripts/postgres-conversion-helper.js list-services
 *   node scripts/postgres-conversion-helper.js generate-checklist <service-file>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function analyzeService(servicePath) {
  console.log(`\n${colors.cyan}Analyzing: ${servicePath}${colors.reset}\n`);

  if (!fs.existsSync(servicePath)) {
    console.error(`${colors.red}Error: File not found: ${servicePath}${colors.reset}`);
    process.exit(1);
  }

  const content = fs.readFileSync(servicePath, 'utf8');
  const lines = content.split('\n');

  // Analysis results
  const results = {
    hasPrepare: false,
    hasGetDatabase: false,
    hasGetDatabaseAsync: false,
    hasConstructor: false,
    prepareCount: 0,
    getCount: 0,
    allCount: 0,
    runCount: 0,
    methodCount: 0,
    asyncMethodCount: 0,
    questionMarkParams: 0,
    dollarSignParams: 0,
    sqliteFunctions: [],
    issues: [],
  };

  // Patterns to detect
  const patterns = {
    prepare: /\.prepare\(/g,
    get: /\.prepare\([^)]+\)\.get\(/g,
    all: /\.prepare\([^)]+\)\.all\(/g,
    run: /\.prepare\([^)]+\)\.run\(/g,
    getDatabase: /getDatabase\(\)/g,
    getDatabaseAsync: /getDatabaseAsync\(\)/g,
    constructor: /constructor\s*\(/g,
    method: /^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*{/g,
    questionMark: /\?(?![^"]*"[^"]*$)/g, // ? not inside quotes
    dollarSign: /\$\d+/g,
    dateNow: /date\s*\(\s*['"]now['"]\s*\)/gi,
    datetimeNow: /datetime\s*\(\s*['"]now['"]\s*\)/gi,
    sqliteConstraint: /SQLITE_CONSTRAINT/gi,
  };

  // Count occurrences
  results.prepareCount = (content.match(patterns.prepare) || []).length;
  results.getCount = (content.match(patterns.get) || []).length;
  results.allCount = (content.match(patterns.all) || []).length;
  results.runCount = (content.match(patterns.run) || []).length;
  results.questionMarkParams = (content.match(patterns.questionMark) || []).length;
  results.dollarSignParams = (content.match(patterns.dollarSign) || []).length;

  results.hasPrepare = results.prepareCount > 0;
  results.hasGetDatabase = patterns.getDatabase.test(content);
  results.hasGetDatabaseAsync = patterns.getDatabaseAsync.test(content);
  results.hasConstructor = patterns.constructor.test(content);

  // Count methods
  lines.forEach((line, idx) => {
    const methodMatch = line.match(/^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*{/);
    if (methodMatch && !line.includes('constructor')) {
      results.methodCount++;
      if (methodMatch[1]) results.asyncMethodCount++;
    }
  });

  // Detect SQLite-specific functions
  if (patterns.dateNow.test(content)) {
    results.sqliteFunctions.push("date('now') - should be CURRENT_DATE");
  }
  if (patterns.datetimeNow.test(content)) {
    results.sqliteFunctions.push("datetime('now') - should be CURRENT_TIMESTAMP");
  }
  if (patterns.sqliteConstraint.test(content)) {
    results.sqliteFunctions.push("SQLITE_CONSTRAINT - should be error.code === '23505'");
  }

  // Generate issues/warnings
  if (results.hasPrepare && !results.hasGetDatabaseAsync) {
    results.issues.push('Uses .prepare() but not getDatabaseAsync() - needs conversion');
  }
  if (results.hasConstructor && results.hasPrepare) {
    results.issues.push('Has constructor with database initialization - should be removed');
  }
  if (results.methodCount > results.asyncMethodCount && results.hasPrepare) {
    results.issues.push(`${results.methodCount - results.asyncMethodCount} sync methods need to be async`);
  }
  if (results.questionMarkParams > 0 && results.dollarSignParams === 0) {
    results.issues.push(`${results.questionMarkParams} ? parameters need conversion to $1, $2, etc.`);
  }

  // Display results
  console.log(`${colors.yellow}Database Access:${colors.reset}`);
  console.log(`  .prepare() calls: ${results.hasPrepare ? colors.red + results.prepareCount : colors.green + '0'} ${colors.reset}`);
  console.log(`  .get() calls: ${results.getCount}`);
  console.log(`  .all() calls: ${results.allCount}`);
  console.log(`  .run() calls: ${results.runCount}`);

  console.log(`\n${colors.yellow}Async Status:${colors.reset}`);
  console.log(`  Total methods: ${results.methodCount}`);
  console.log(`  Async methods: ${results.asyncMethodCount}`);
  console.log(`  Sync methods needing conversion: ${results.methodCount - results.asyncMethodCount}`);

  console.log(`\n${colors.yellow}Parameters:${colors.reset}`);
  console.log(`  ? placeholders: ${results.questionMarkParams > 0 ? colors.red + results.questionMarkParams : colors.green + '0'}${colors.reset}`);
  console.log(`  $N placeholders: ${results.dollarSignParams > 0 ? colors.green + results.dollarSignParams : colors.yellow + '0'}${colors.reset}`);

  if (results.sqliteFunctions.length > 0) {
    console.log(`\n${colors.yellow}SQLite-specific functions found:${colors.reset}`);
    results.sqliteFunctions.forEach(fn => console.log(`  ${colors.red}•${colors.reset} ${fn}`));
  }

  if (results.issues.length > 0) {
    console.log(`\n${colors.red}Issues to fix:${colors.reset}`);
    results.issues.forEach(issue => console.log(`  ${colors.red}⚠${colors.reset}  ${issue}`));
  }

  // Estimate complexity
  const complexity = estimateComplexity(results);
  console.log(`\n${colors.cyan}Estimated Complexity: ${complexity.level} (${complexity.hours})${colors.reset}`);
  console.log(`${colors.cyan}Reasoning: ${complexity.reason}${colors.reset}`);

  // Status
  const isConverted = !results.hasPrepare && results.hasGetDatabaseAsync;
  console.log(`\n${colors.cyan}Status: ${isConverted ? colors.green + '✓ Already converted' : colors.red + '✗ Needs conversion'}${colors.reset}\n`);

  return results;
}

function estimateComplexity(results) {
  let score = 0;
  let factors = [];

  // Factor in number of methods
  if (results.prepareCount > 20) {
    score += 3;
    factors.push(`${results.prepareCount} database calls`);
  } else if (results.prepareCount > 10) {
    score += 2;
    factors.push(`${results.prepareCount} database calls`);
  } else if (results.prepareCount > 0) {
    score += 1;
    factors.push(`${results.prepareCount} database calls`);
  }

  // Factor in SQLite-specific code
  if (results.sqliteFunctions.length > 0) {
    score += 1;
    factors.push('SQLite-specific functions');
  }

  // Factor in parameter conversion
  if (results.questionMarkParams > 20) {
    score += 2;
    factors.push('many parameters to convert');
  } else if (results.questionMarkParams > 0) {
    score += 1;
  }

  // Determine complexity level
  let level, hours, reason;
  if (score === 0) {
    level = colors.green + 'Already Converted' + colors.reset;
    hours = '0h';
    reason = 'No conversion needed';
  } else if (score <= 2) {
    level = colors.green + 'Low' + colors.reset;
    hours = '1-3h';
    reason = factors.join(', ');
  } else if (score <= 4) {
    level = colors.yellow + 'Medium' + colors.reset;
    hours = '3-6h';
    reason = factors.join(', ');
  } else {
    level = colors.red + 'High' + colors.reset;
    hours = '6-12h';
    reason = factors.join(', ');
  }

  return { level, hours, reason, score };
}

function listServices() {
  console.log(`\n${colors.cyan}Services needing conversion:${colors.reset}\n`);

  try {
    const output = execSync(
      'grep -l "\\.prepare(" src/services/**/*.js src/services/*.js 2>/dev/null || true',
      { encoding: 'utf8' }
    );

    const files = output.trim().split('\n').filter(f => f);

    if (files.length === 0) {
      console.log(`${colors.green}No services need conversion!${colors.reset}\n`);
      return;
    }

    console.log(`Found ${colors.yellow}${files.length}${colors.reset} services:\n`);

    files.forEach((file, idx) => {
      const shortPath = file.replace('src/services/', '');
      console.log(`  ${idx + 1}. ${shortPath}`);
    });

    console.log(`\n${colors.cyan}Total: ${files.length} services${colors.reset}\n`);
  } catch (err) {
    console.error(`${colors.red}Error listing services:${colors.reset}`, err.message);
  }
}

function generateChecklist(servicePath) {
  console.log(`\n${colors.cyan}Conversion Checklist for: ${servicePath}${colors.reset}\n`);

  const results = analyzeService(servicePath);

  console.log(`${colors.yellow}Step-by-step conversion guide:${colors.reset}\n`);

  const checklist = [
    '[ ] 1. Remove constructor with this.db = getDatabase()',
    '[ ] 2. Add: const { getDatabaseAsync } = require(\'../database\')',
    `[ ] 3. Convert ${results.methodCount - results.asyncMethodCount} methods to async`,
    '[ ] 4. Add \'const database = await getDatabaseAsync()\' to each method',
    `[ ] 5. Convert ${results.questionMarkParams} ? placeholders to $1, $2, $3...`,
    `[ ] 6. Convert ${results.getCount} .prepare().get() → await database.query().rows[0]`,
    `[ ] 7. Convert ${results.allCount} .prepare().all() → await database.query().rows`,
    `[ ] 8. Convert ${results.runCount} .prepare().run() → await database.query()`,
    '[ ] 9. Handle result.changes → result.rowCount',
    '[ ] 10. Handle result.lastInsertRowid → RETURNING id',
  ];

  if (results.sqliteFunctions.length > 0) {
    checklist.push('[ ] 11. Fix SQLite-specific functions (see analysis above)');
  }

  checklist.push('[ ] 12. Update route handlers to add async/await');
  checklist.push('[ ] 13. Test all methods');
  checklist.push('[ ] 14. Deploy and verify on Railway');

  checklist.forEach(item => console.log(`  ${item}`));

  console.log(`\n${colors.green}Estimated time: ${estimateComplexity(results).hours}${colors.reset}\n`);
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

if (!command) {
  console.log(`
${colors.cyan}PostgreSQL Conversion Helper${colors.reset}

Usage:
  ${colors.yellow}node scripts/postgres-conversion-helper.js analyze <service-file>${colors.reset}
    Analyze a service file for conversion needs

  ${colors.yellow}node scripts/postgres-conversion-helper.js list-services${colors.reset}
    List all services that need conversion

  ${colors.yellow}node scripts/postgres-conversion-helper.js generate-checklist <service-file>${colors.reset}
    Generate a conversion checklist for a service

Examples:
  node scripts/postgres-conversion-helper.js analyze src/services/screeningService.js
  node scripts/postgres-conversion-helper.js list-services
  node scripts/postgres-conversion-helper.js generate-checklist src/services/etfService.js
`);
  process.exit(0);
}

switch (command) {
  case 'analyze':
    if (!arg) {
      console.error(`${colors.red}Error: Please provide a service file path${colors.reset}`);
      process.exit(1);
    }
    analyzeService(arg);
    break;

  case 'list-services':
  case 'list':
    listServices();
    break;

  case 'generate-checklist':
  case 'checklist':
    if (!arg) {
      console.error(`${colors.red}Error: Please provide a service file path${colors.reset}`);
      process.exit(1);
    }
    generateChecklist(arg);
    break;

  default:
    console.error(`${colors.red}Unknown command: ${command}${colors.reset}`);
    process.exit(1);
}
