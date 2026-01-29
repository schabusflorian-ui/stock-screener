#!/usr/bin/env node
/**
 * Fix Migration Imports
 *
 * Automatically updates migration files to use the centralized _migrationHelper
 * instead of direct `new Database()` calls.
 *
 * Usage:
 *   node scripts/fix-migration-imports.js --dry-run    # Preview changes
 *   node scripts/fix-migration-imports.js              # Apply changes
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../src/database-migrations');
const DRY_RUN = process.argv.includes('--dry-run');

// Patterns to replace
const REPLACEMENTS = [
  // Remove require('better-sqlite3')
  {
    pattern: /const Database = require\(['"]better-sqlite3['"]\);?\n?/g,
    replacement: ''
  },
  // Remove path require if only used for db path
  {
    pattern: /const path = require\(['"]path['"]\);?\n?/g,
    replacement: (match, content) => {
      // Keep if path is used elsewhere
      if (content.match(/path\.(join|resolve|dirname)/g)?.length > 2) {
        return match;
      }
      return '';
    }
  },
  // Replace various db path definitions + new Database patterns
  {
    pattern: /const dbPath = .*?;\nconst db = new Database\(dbPath\);?/gs,
    replacement: "const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');\n\nconst db = getDb();"
  },
  {
    pattern: /const DB_PATH = .*?;\n.*?const db = new Database\(DB_PATH\);?/gs,
    replacement: "const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');\n\nconst db = getDb();"
  },
  {
    pattern: /const db = new Database\(['"]\.\/data\/stocks\.db['"]\);?/g,
    replacement: "const { getDb } = require('./_migrationHelper');\n\nconst db = getDb();"
  },
  {
    pattern: /const db = new Database\(path\.join\(__dirname.*?\)\);?/g,
    replacement: "const { getDb } = require('./_migrationHelper');\n\nconst db = getDb();"
  },
  // Inside functions
  {
    pattern: /const db = new Database\(dbPath.*?\);/g,
    replacement: "const db = getDb();"
  },
  // Remove db.close() calls (abstraction handles this)
  {
    pattern: /\n?\s*db\.close\(\);?\n?/g,
    replacement: '\n'
  },
  // Fix local helper function definitions that duplicate the helper
  {
    pattern: /function tableExists\(tableName\)[\s\S]*?return !!\s*result;\s*\}\n?/g,
    replacement: ''
  },
  {
    pattern: /function columnExists\(table,\s*column\)[\s\S]*?return.*?;\s*\}\n?/g,
    replacement: ''
  },
  // Fix calls to local helper functions to use db parameter
  {
    pattern: /tableExists\((['"])/g,
    replacement: "tableExists(db, $1"
  },
  {
    pattern: /columnExists\((['"])/g,
    replacement: "columnExists(db, $1"
  },
];

function processFile(filePath) {
  const fileName = path.basename(filePath);

  // Skip the helper itself
  if (fileName === '_migrationHelper.js') {
    return { skipped: true, reason: 'helper file' };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Check if already using the helper
  if (content.includes("require('./_migrationHelper')")) {
    return { skipped: true, reason: 'already updated' };
  }

  // Check if uses new Database
  if (!content.includes('new Database(')) {
    return { skipped: true, reason: 'no Database usage' };
  }

  // Apply replacements
  for (const { pattern, replacement } of REPLACEMENTS) {
    if (typeof replacement === 'function') {
      content = content.replace(pattern, (match) => replacement(match, content));
    } else {
      content = content.replace(pattern, replacement);
    }
  }

  // Add helper import if not present and still has db usage
  if (!content.includes("require('./_migrationHelper')") && content.includes('db.')) {
    // Add at the top after any initial comments
    const lines = content.split('\n');
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('//') && lines[i].trim() !== '') {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, "const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');\n\nconst db = getDb();");
    content = lines.join('\n');
  }

  // Clean up multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content === originalContent) {
    return { skipped: true, reason: 'no changes needed' };
  }

  if (DRY_RUN) {
    return { updated: true, preview: true };
  }

  fs.writeFileSync(filePath, content);
  return { updated: true };
}

function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           FIX MIGRATION IMPORTS                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();

  let updated = 0;
  let skipped = 0;

  console.log('Processing migration files:');
  console.log('-'.repeat(60));

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const result = processFile(filePath);

    if (result.updated) {
      console.log(`  ✅ ${file}${result.preview ? ' (would update)' : ''}`);
      updated++;
    } else if (result.skipped) {
      console.log(`  ⏭️  ${file} - ${result.reason}`);
      skipped++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${files.length}`);
  console.log('='.repeat(60));

  if (DRY_RUN && updated > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

main();
