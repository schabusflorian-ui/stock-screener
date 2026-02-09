#!/usr/bin/env python3
"""
Fix module-level db.getDatabase() calls that crash PostgreSQL backend
"""
import re
import sys

def fix_module_level_db(filepath):
    """Fix a single file by removing module-level database and updating imports"""

    with open(filepath, 'r') as f:
        content = f.read()

    original = content

    # Step 1: Change import from db.getDatabase to getDatabaseAsync
    if "const db = require(" in content:
        content = content.replace(
            "const db = require(",
            "const { getDatabaseAsync } = require("
        )

    # Step 2: Remove module-level "const database = db.getDatabase();"
    content = re.sub(
        r'^const database = db\.getDatabase\(\);?\s*\n',
        '',
        content,
        flags=re.MULTILINE
    )

    # Step 3: Make all route handlers async if they're not already
    # Match: router.METHOD('path', (req, res) => {
    # Match: router.METHOD('path', function(req, res) {
    content = re.sub(
        r"router\.(get|post|put|delete|patch)\(([^,]+),\s*\(req,\s*res(?:,\s*next)?\)\s*=>",
        r"router.\1(\2, async (req, res) =>",
        content
    )
    content = re.sub(
        r"router\.(get|post|put|delete|patch)\(([^,]+),\s*function\s*\(req,\s*res(?:,\s*next)?\)",
        r"router.\1(\2, async function(req, res)",
        content
    )

    # Step 4: Add "const database = await getDatabaseAsync();" at start of try blocks
    # Find try blocks and add database initialization if it references 'database'
    def add_database_init(match):
        try_content = match.group(0)
        # Only add if 'database' is referenced in this try block
        if 'database.' in try_content or 'database)' in try_content:
            # Check if already has getDatabaseAsync
            if 'getDatabaseAsync()' in try_content:
                return try_content
            # Add after "try {"
            return try_content.replace(
                'try {',
                'try {\n    const database = await getDatabaseAsync();',
                1
            )
        return try_content

    # Match try blocks in route handlers
    content = re.sub(
        r'try \{[^}]*(?:\{[^}]*\}[^}]*)*\}',
        add_database_init,
        content,
        flags=re.DOTALL
    )

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"✅ Fixed: {filepath}")
        return True
    else:
        print(f"⏭️  Skipped (no changes): {filepath}")
        return False

if __name__ == '__main__':
    files = [
        'src/api/routes/alerts.js',
        'src/api/routes/capital.js',
        'src/api/routes/classifications.js',
        'src/api/routes/dcf.js',
        'src/api/routes/earnings.js',
        'src/api/routes/fiscal.js',
        'src/api/routes/insiders.js',
        'src/api/routes/ipo.js',
        'src/api/routes/metrics.js',
        'src/api/routes/nlQuery.js',
        'src/api/routes/prism.js',
        'src/api/routes/secRefresh.js',
        'src/api/routes/sentiment.js',
        'src/api/routes/xbrl.js',
    ]

    fixed_count = 0
    for filepath in files:
        if fix_module_level_db(filepath):
            fixed_count += 1

    print(f"\n✅ Fixed {fixed_count}/{len(files)} files")
