#!/usr/bin/env node

/**
 * CSS CONSISTENCY CHECKER
 *
 * Scans codebase for design system violations in CSS files.
 * Run: node scripts/visual-audit/css-checker.js
 *
 * Checks for:
 * - Hardcoded px values instead of CSS variables
 * - Hardcoded colors instead of CSS variables
 * - Non-standard font sizes
 * - Non-standard spacing values
 * - Inline styles in React components
 */

const fs = require('fs');
const path = require('path');

// Design system values from design-system.css
const VALID_SPACING = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]; // px
const VALID_FONT_SIZES = [12, 13, 14, 16, 18, 20, 24, 30, 36]; // px
const VALID_RADIUS = [6, 8, 12, 16, 24, 9999]; // px

// CSS Variable patterns that should be used
const CSS_VAR_PATTERNS = {
  spacing: /var\(--space-\d+\)/,
  fontSize: /var\(--text-(xs|sm|base|md|lg|xl|2xl|3xl|4xl)\)/,
  color: /var\(--(text|bg|border|brand|positive|negative|warning|info|chart|glass)-/,
  radius: /var\(--radius-(sm|md|lg|xl|2xl|full)\)/,
  shadow: /var\(--shadow-(sm|md|lg|xl|glow)\)/,
  transition: /var\(--transition-(fast|normal|slow)\)/,
};

// Violation patterns to check
const VIOLATION_PATTERNS = [
  // Hardcoded pixel spacing (padding, margin, gap)
  {
    pattern: /(padding|margin|gap):\s*(\d+)px/gi,
    rule: 'hardcoded-spacing',
    check: (match) => {
      const value = parseInt(match[2]);
      return !VALID_SPACING.includes(value);
    },
    message: (match) => `Use var(--space-*) instead of ${match[2]}px for ${match[1]}`,
  },
  // Hardcoded hex colors
  {
    pattern: /(color|background|border-color|fill|stroke):\s*(#[0-9a-fA-F]{3,8})\b/gi,
    rule: 'hardcoded-color',
    check: () => true,
    message: (match) => `Use CSS variable instead of ${match[2]} for ${match[1]}`,
  },
  // Hardcoded rgba colors
  {
    pattern: /(color|background|border-color):\s*(rgba?\([^)]+\))/gi,
    rule: 'hardcoded-rgba',
    check: (match) => {
      // Allow common rgba patterns used in design system
      const value = match[2];
      if (value.includes('99, 102, 241')) return false; // brand color
      if (value.includes('0, 0, 0, 0.')) return false; // standard overlays
      return true;
    },
    message: (match) => `Consider using CSS variable instead of ${match[2]}`,
  },
  // Hardcoded font-size
  {
    pattern: /font-size:\s*(\d+)px/gi,
    rule: 'hardcoded-font-size',
    check: (match) => {
      const value = parseInt(match[1]);
      return !VALID_FONT_SIZES.includes(value);
    },
    message: (match) => `Use var(--text-*) instead of ${match[1]}px font-size`,
  },
  // Hardcoded border-radius
  {
    pattern: /border-radius:\s*(\d+)px/gi,
    rule: 'hardcoded-radius',
    check: (match) => {
      const value = parseInt(match[1]);
      return !VALID_RADIUS.includes(value);
    },
    message: (match) => `Use var(--radius-*) instead of ${match[1]}px border-radius`,
  },
  // Inline styles in JSX with px values
  {
    pattern: /style=\{\s*\{[^}]*:\s*['"]?\d+px['"]?/gi,
    rule: 'inline-style-px',
    check: () => true,
    message: () => 'Avoid inline styles with px values; use CSS classes',
  },
  // Inline styles with hardcoded colors
  {
    pattern: /style=\{\s*\{[^}]*:\s*['"]#[0-9a-fA-F]{3,8}['"]/gi,
    rule: 'inline-style-color',
    check: () => true,
    message: () => 'Avoid inline styles with hardcoded colors',
  },
];

// Files/patterns to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'build',
  'dist',
  'design-system.css', // The source of truth
  'responsive.css',    // Utility file
  '.min.css',
];

class Violation {
  constructor(file, line, rule, found, suggestion) {
    this.file = file;
    this.line = line;
    this.rule = rule;
    this.found = found;
    this.suggestion = suggestion;
  }
}

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

function checkFile(filePath) {
  const violations = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const ext = path.extname(filePath);

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    for (const { pattern, rule, check, message } of VIOLATION_PATTERNS) {
      // Skip JSX-specific checks for CSS files
      if (ext === '.css' && rule.includes('inline')) continue;
      // Skip CSS-specific checks for JS files
      if ((ext === '.js' || ext === '.jsx') && !rule.includes('inline') && !line.includes('className')) continue;

      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(line)) !== null) {
        if (check(match)) {
          violations.push(new Violation(
            filePath,
            lineNum,
            rule,
            match[0],
            message(match)
          ));
        }
      }
    }
  });

  return violations;
}

function scanDirectory(dir) {
  const violations = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;

    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const filePath = path.join(currentDir, file);

      if (shouldSkip(filePath)) continue;

      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        walk(filePath);
      } else if (file.match(/\.(css|js|jsx)$/)) {
        violations.push(...checkFile(filePath));
      }
    }
  }

  walk(dir);
  return violations;
}

function generateReport(violations) {
  if (violations.length === 0) {
    return '\n✅ No design system violations found!\n';
  }

  let report = '\n# CSS Consistency Report\n\n';
  report += `Found **${violations.length}** potential violations\n\n`;

  // Group by rule
  const byRule = violations.reduce((acc, v) => {
    if (!acc[v.rule]) acc[v.rule] = [];
    acc[v.rule].push(v);
    return acc;
  }, {});

  for (const [rule, ruleViolations] of Object.entries(byRule)) {
    report += `## ${rule} (${ruleViolations.length})\n\n`;

    // Show first 15 violations per rule
    const shown = ruleViolations.slice(0, 15);
    for (const v of shown) {
      const relativePath = path.relative(process.cwd(), v.file);
      report += `- \`${relativePath}:${v.line}\`\n`;
      report += `  Found: \`${v.found.substring(0, 60)}\`\n`;
      report += `  → ${v.suggestion}\n\n`;
    }

    if (ruleViolations.length > 15) {
      report += `_... and ${ruleViolations.length - 15} more_\n\n`;
    }
  }

  return report;
}

function generateSummary(violations) {
  const byRule = violations.reduce((acc, v) => {
    acc[v.rule] = (acc[v.rule] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📊 Summary by Rule:\n');
  Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .forEach(([rule, count]) => {
      console.log(`  ${rule}: ${count}`);
    });
}

// Main execution
const targetDir = process.argv[2] || './frontend/src';
console.log(`\n🔍 Scanning ${targetDir} for design system violations...\n`);

const violations = scanDirectory(targetDir);
const report = generateReport(violations);

console.log(report);

if (violations.length > 0) {
  generateSummary(violations);
  console.log('\n⚠️  Review these violations and consider using design system variables.\n');
  console.log('Tip: Run `node scripts/visual-audit/auto-fix.js` to auto-fix common issues.\n');
}

// Export for programmatic use
module.exports = { scanDirectory, checkFile, VIOLATION_PATTERNS };
