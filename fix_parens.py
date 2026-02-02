#!/usr/bin/env python3

with open('src/api/routes/companies.js', 'r') as f:
    content = f.read()

# Fix parseInt(limit]); -> parseInt(limit)]);
content = content.replace('parseInt(limit]);', 'parseInt(limit)]);')

with open('src/api/routes/companies.js', 'w') as f:
    f.write(content)

print("✅ Fixed parentheses")
