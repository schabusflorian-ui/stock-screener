#!/usr/bin/env python3
import re

# Read the file
with open('src/api/routes/companies.js', 'r') as f:
    content = f.read()

# Pattern 1: Convert route handlers to async
# Match: router.get('/path', (req, res) => {
# Replace: router.get('/path', async (req, res) => {
content = re.sub(
    r"router\.(get|post|put|patch|delete)\(([^,]+),\s*\(req,\s*res\)\s*=>",
    r"router.\1(\2, async (req, res) =>",
    content
)

# Pattern 2: Add database = await getDatabaseAsync() at start of try blocks
# Match: try { followed by const { symbol } or similar
# This is tricky - let's do it for specific patterns

# Pattern 3: Convert database.prepare(sql).get(params)
# Match: database.prepare(`...`).get(...)
# Replace: const result = await database.query(`...`, [...]); const data = result.rows[0];

# This is complex due to template literals and multiline queries
# Let's use a more targeted approach

# Pattern 4: Convert const x = database.prepare(sql).get(param)
pattern_get = r"const\s+(\w+)\s*=\s*database\.prepare\(\s*`([^`]+)`\s*\)\.get\(([^)]+)\)"
def replace_get(match):
    var_name = match.group(1)
    sql = match.group(2)
    param = match.group(3)
    return f"const {var_name}Result = await database.query(`{sql}`, [{param}]);\n    const {var_name} = {var_name}Result.rows[0]"

content = re.sub(pattern_get, replace_get, content)

# Pattern 5: Convert const x = database.prepare(sql).all(params)
pattern_all = r"const\s+(\w+)\s*=\s*database\.prepare\(\s*`([^`]+)`\s*\)\.all\(([^)]*)\)"
def replace_all(match):
    var_name = match.group(1)
    sql = match.group(2)
    params = match.group(3)
    params_array = f"[{params}]" if params.strip() else "[]"
    return f"const {var_name}Result = await database.query(`{sql}`, {params_array});\n    const {var_name} = {var_name}Result.rows"

content = re.sub(pattern_all, replace_all, content)

# Write back
with open('src/api/routes/companies.js', 'w') as f:
    f.write(content)

print("✅ Conversion complete!")
print("Note: Manual verification needed for complex patterns")
