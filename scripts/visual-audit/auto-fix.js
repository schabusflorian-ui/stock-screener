#!/usr/bin/env node

/**
 * CSS AUTO-FIX SCRIPT
 *
 * Automatically fixes common design system violations in CSS files.
 * Run: node scripts/visual-audit/auto-fix.js [--dry-run]
 *
 * Fixes:
 * - Converts px spacing values to CSS variables
 * - Converts px font-sizes to CSS variables
 * - Converts px border-radius to CSS variables
 *
 * Use --dry-run to see what would be changed without modifying files.
 */

const fs = require('fs');
const path = require('path');

// Mapping of px values to CSS variables
const SPACING_MAP = {
  0: 'var(--space-0)',
  4: 'var(--space-1)',
  8: 'var(--space-2)',
  12: 'var(--space-3)',
  16: 'var(--space-4)',
  20: 'var(--space-5)',
  24: 'var(--space-6)',
  32: 'var(--space-8)',
  40: 'var(--space-10)',
  48: 'var(--space-12)',
  64: 'var(--space-16)',
  80: 'var(--space-20)',
};

const FONT_SIZE_MAP = {
  12: 'var(--text-xs)',
  13: 'var(--text-sm)',
  14: 'var(--text-base)',
  16: 'var(--text-md)',
  18: 'var(--text-lg)',
  20: 'var(--text-xl)',
  24: 'var(--text-2xl)',
  30: 'var(--text-3xl)',
  36: 'var(--text-4xl)',
};

const RADIUS_MAP = {
  0: 'var(--radius-none)',
  6: 'var(--radius-sm)',
  8: 'var(--radius-md)',
  12: 'var(--radius-lg)',
  16: 'var(--radius-xl)',
  24: 'var(--radius-2xl)',
  9999: 'var(--radius-full)',
};

// Files/patterns to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'build',
  'dist',
  'design-system.css',
  'responsive.css',
  '.min.css',
];

// Find closest value in a map
function findClosest(value, map) {
  const keys = Object.keys(map).map(Number);
  const closest = keys.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
  return map[closest];
}

// Fix patterns
const FIXES = [
  // Fix spacing (padding, margin, gap) - excludes border properties and 1px values
  {
    pattern: /(padding|margin|gap):\s*(\d+)px/gi,
    replace: (match, prop, value) => {
      const px = parseInt(value);
      // Don't convert 1px - it's usually intentional for fine details
      if (px === 1) return match;
      if (SPACING_MAP[px]) {
        return `${prop}: ${SPACING_MAP[px]}`;
      }
      // Find closest if exact match not found
      const closest = findClosest(px, SPACING_MAP);
      return `${prop}: ${closest}`;
    },
    description: 'Convert spacing to CSS variables',
  },
  // Fix font-size
  {
    pattern: /font-size:\s*(\d+)px/gi,
    replace: (match, value) => {
      const px = parseInt(value);
      if (FONT_SIZE_MAP[px]) {
        return `font-size: ${FONT_SIZE_MAP[px]}`;
      }
      // Find closest if exact match not found
      const closest = findClosest(px, FONT_SIZE_MAP);
      return `font-size: ${closest}`;
    },
    description: 'Convert font-size to CSS variables',
  },
  // Fix border-radius (but not 50% for circles)
  {
    pattern: /border-radius:\s*(\d+)px(?!\s*\d)/gi,
    replace: (match, value) => {
      const px = parseInt(value);
      if (RADIUS_MAP[px]) {
        return `border-radius: ${RADIUS_MAP[px]}`;
      }
      // Find closest if exact match not found
      const closest = findClosest(px, RADIUS_MAP);
      return `border-radius: ${closest}`;
    },
    description: 'Convert border-radius to CSS variables',
  },
];

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

function fixFile(filePath, dryRun = false) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;
  let fixCount = 0;
  const changes = [];

  for (const { pattern, replace, description } of FIXES) {
    const matches = content.match(pattern);
    if (matches) {
      content = content.replace(pattern, replace);
      if (matches.length > 0) {
        changes.push({ description, count: matches.length });
        fixCount += matches.length;
      }
    }
  }

  if (fixCount > 0 && content !== originalContent) {
    if (!dryRun) {
      fs.writeFileSync(filePath, content);
    }
    return { fixed: fixCount, changes, modified: true };
  }

  return { fixed: 0, changes: [], modified: false };
}

function scanAndFix(dir, dryRun = false) {
  let totalFixes = 0;
  const modifiedFiles = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);

      if (shouldSkip(filePath)) continue;

      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walk(filePath);
      } else if (file.endsWith('.css')) {
        const result = fixFile(filePath, dryRun);
        if (result.modified) {
          const relativePath = path.relative(process.cwd(), filePath);
          modifiedFiles.push({
            file: relativePath,
            fixes: result.fixed,
            changes: result.changes,
          });
          totalFixes += result.fixed;
        }
      }
    }
  }

  walk(dir);
  return { totalFixes, modifiedFiles };
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetDir = args.find(arg => !arg.startsWith('--')) || './frontend/src';

console.log(`\n🔧 ${dryRun ? '[DRY RUN] ' : ''}Auto-fixing CSS in ${targetDir}...\n`);

const { totalFixes, modifiedFiles } = scanAndFix(targetDir, dryRun);

if (modifiedFiles.length === 0) {
  console.log('✅ No fixable issues found!\n');
} else {
  console.log(`📁 ${dryRun ? 'Would modify' : 'Modified'} ${modifiedFiles.length} files:\n`);

  for (const { file, fixes, changes } of modifiedFiles) {
    console.log(`  ${dryRun ? '~' : '✓'} ${file} (${fixes} fixes)`);
    for (const change of changes) {
      console.log(`      - ${change.description}: ${change.count}`);
    }
  }

  console.log(`\n${dryRun ? '📊 Would apply' : '✅ Applied'} ${totalFixes} fixes total\n`);

  if (dryRun) {
    console.log('Run without --dry-run to apply these changes.\n');
  }
}

// Export for programmatic use
module.exports = { scanAndFix, fixFile, FIXES };
