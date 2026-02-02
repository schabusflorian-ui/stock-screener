#!/usr/bin/env python3
import re

with open('src/api/routes/companies.js', 'r') as f:
    lines = f.readlines()

output = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # Pattern: router.get/post without async keyword
    if re.match(r"^router\.(get|post|put|patch|delete)\([^,]+,\s*\(req,\s*res\)\s*=>", line):
        line = re.sub(r"\(req,\s*res\)\s*=>", "async (req, res) =>", line)
    
    # If we're in a try block after a route definition, add database = await getDatabaseAsync()
    if "try {" in line:
        output.append(line)
        # Look ahead - if next few lines don't have "const database", add it
        next_lines = ''.join(lines[i+1:min(i+5, len(lines))])
        if "const database" not in next_lines and "getDatabaseAsync" not in next_lines:
            # Check if we're in a route handler (has req, res context)
            prev_lines = ''.join(lines[max(0,i-10):i])
            if "router." in prev_lines and "(req, res)" in prev_lines:
                output.append("    const database = await getDatabaseAsync();\n")
        i += 1
        continue
    
    # Pattern: const x = database.prepare(multiline
    # Detect start of multiline prepare
    if "= database.prepare(" in line and ".get(" not in line and ".all(" not in line:
        # Multiline query
        query_lines = [line]
        i += 1
        while i < len(lines) and (".get(" not in lines[i] and ".all(" not in lines[i]):
            query_lines.append(lines[i])
            i += 1
        if i < len(lines):
            query_lines.append(lines[i])
        
        # Extract var name
        var_match = re.search(r"const\s+(\w+)\s*=", query_lines[0])
        if var_match:
            var_name = var_match.group(1)
            full_query = ''.join(query_lines)
            
            # Extract SQL
            sql_match = re.search(r"`([^`]+)`", full_query, re.DOTALL)
            if sql_match:
                sql = sql_match.group(1)
                
                # Check if .get or .all
                if ".get(" in full_query:
                    # Extract param
                    param_match = re.search(r"\.get\(([^)]*)\)", full_query)
                    param = param_match.group(1) if param_match else ""
                    param = param.strip()
                    params_array = f"[{param}]" if param else "[]"
                    
                    output.append(f"    const {var_name}Result = await database.query(`{sql}`, {params_array});\n")
                    output.append(f"    const {var_name} = {var_name}Result.rows[0];\n")
                elif ".all(" in full_query:
                    param_match = re.search(r"\.all\(([^)]*)\)", full_query)
                    param = param_match.group(1) if param_match else ""
                    param = param.strip()
                    params_array = f"[{param}]" if param else "[]"
                    
                    output.append(f"    const {var_name}Result = await database.query(`{sql}`, {params_array});\n")
                    output.append(f"    const {var_name} = {var_name}Result.rows;\n")
        i += 1
        continue
    
    output.append(line)
    i += 1

with open('src/api/routes/companies.js', 'w') as f:
    f.writelines(output)

print("✅ Fixed remaining sync calls")
