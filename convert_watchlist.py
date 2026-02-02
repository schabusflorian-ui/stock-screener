#!/usr/bin/env python3
import re

with open('src/api/routes/watchlist.js', 'r') as f:
    content = f.read()

# Convert all route handlers to async
content = re.sub(
    r"router\.(get|post|put|patch|delete)\(([^,]+),\s*(async\s+)?\(req,\s*res\)\s*=>",
    r"router.\1(\2, async (req, res) =>",
    content
)

# Remove old const database = db.getDatabase() lines
content = re.sub(r"\s*const database = db\.getDatabase\(\);\n", "", content)

# Pattern: database.prepare(`...`).get(...)
def replace_prepare_get(match):
    var = match.group(1) if match.group(1) else "_temp"
    sql = match.group(2)
    params = match.group(3).strip() if match.group(3) else ""
    params_array = f"[{params}]" if params else "[]"
    
    if var == "_temp":
        return f"const result = await database.query(`{sql}`, {params_array});\n    const data = result.rows[0];"
    else:
        return f"const {var}Result = await database.query(`{sql}`, {params_array});\n    const {var} = {var}Result.rows[0];"

# Pattern: const x = database.prepare(`...`).get(...)
pattern1 = r"const\s+(\w+)\s*=\s*database\.prepare\(\s*`([^`]+)`\s*\)\.get\(([^)]*)\)"
content = re.sub(pattern1, replace_prepare_get, content, flags=re.MULTILINE)

# Pattern: database.prepare(`...`).get(...) without assignment
pattern1b = r"database\.prepare\(\s*`([^`]+)`\s*\)\.get\(([^)]*)\)"
content = re.sub(pattern1b, lambda m: f"(await database.query(`{m.group(1)}`, [{m.group(2)}])).rows[0]", content)

# Pattern: const x = database.prepare(`...`).all(...)
def replace_prepare_all(match):
    var = match.group(1)
    sql = match.group(2)
    params = match.group(3).strip() if match.group(3) else ""
    params_array = f"[{params}]" if params else "[]"
    return f"const {var}Result = await database.query(`{sql}`, {params_array});\n    const {var} = {var}Result.rows;"

pattern2 = r"const\s+(\w+)\s*=\s*database\.prepare\(\s*`([^`]+)`\s*\)\.all\(([^)]*)\)"
content = re.sub(pattern2, replace_prepare_all, content, flags=re.MULTILINE)

# Pattern: database.prepare(`...`).run(...)
def replace_prepare_run(match):
    var = match.group(1) if match.group(1) else "result"
    sql = match.group(2)
    params = match.group(3).strip() if match.group(3) else ""
    params_array = f"[{params}]" if params else "[]"
    return f"const {var} = await database.query(`{sql}`, {params_array});"

pattern3 = r"(?:const\s+(\w+)\s*=\s*)?database\.prepare\(\s*`([^`]+)`\s*\)\.run\(([^)]*)\)"
content = re.sub(pattern3, replace_prepare_run, content, flags=re.MULTILINE)

# Add const database = await getDatabaseAsync() after try { in each route
lines = content.split('\n')
output = []
for i, line in enumerate(lines):
    output.append(line)
    if "  try {" in line:
        # Check if next few lines already have getDatabaseAsync
        next_lines = '\n'.join(lines[i+1:min(i+5, len(lines))])
        if "const database" not in next_lines:
            # Check if we're in a route handler
            prev_lines = '\n'.join(lines[max(0,i-10):i])
            if "router." in prev_lines and "(req, res)" in prev_lines:
                output.append("    const database = await getDatabaseAsync();")

content = '\n'.join(output)

with open('src/api/routes/watchlist.js', 'w') as f:
    f.write(content)

print("✅ Converted watchlist.js")
