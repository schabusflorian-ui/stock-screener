#!/usr/bin/env python3
"""
Convert prices.js from SQLite sync to PostgreSQL async
"""

import re

def convert_prices():
    with open('src/api/routes/prices.js', 'r') as f:
        content = f.read()

    # Change import
    content = content.replace(
        "const db = require('../../database');",
        "const { getDatabaseAsync } = require('../../database');"
    )

    # Convert all route handlers to async
    # Match: router.METHOD('path', (req, res) => {
    content = re.sub(
        r"router\.(get|post|put|delete|patch)\(([^,]+),\s*\(req,\s*res\)\s*=>\s*\{",
        r"router.\1(\2, async (req, res) => {",
        content
    )

    # Convert database initialization from sync to async
    # Replace: const database = db.getDatabase();
    content = re.sub(
        r'(\s+)const database = db\.getDatabase\(\);',
        r'\1const database = await getDatabaseAsync();',
        content
    )

    # Convert .prepare(sql).get(params) to await database.query
    # Single param
    content = re.sub(
        r'database\.prepare\(([^)]+)\)\.get\(([^)]+)\)',
        lambda m: f"(await database.query({m.group(1)}, [{m.group(2)}])).rows[0]",
        content
    )

    # No params
    content = re.sub(
        r'database\.prepare\(([^)]+)\)\.get\(\)',
        lambda m: f"(await database.query({m.group(1)})).rows[0]",
        content
    )

    # Convert .prepare(sql).all(params) to await database.query
    # Multiple params
    content = re.sub(
        r'database\.prepare\(([^)]+)\)\.all\(([^)]+)\)',
        lambda m: f"(await database.query({m.group(1)}, [{m.group(2)}])).rows",
        content
    )

    # No params
    content = re.sub(
        r'database\.prepare\(([^)]+)\)\.all\(\)',
        lambda m: f"(await database.query({m.group(1)})).rows",
        content
    )

    # Fix .rows[0] cases where we need just the first element
    # This handles things like: const company = (await database.query(...)).rows[0]

    # Fix common patterns with ...params spread
    content = content.replace('...params', '*params')  # Mark for later fix
    content = re.sub(
        r'\[\*params\]',
        'params',
        content
    )

    with open('src/api/routes/prices.js', 'w') as f:
        f.write(content)

    print("✅ Converted prices.js to async PostgreSQL")

if __name__ == '__main__':
    convert_prices()
