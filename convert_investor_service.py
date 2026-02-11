#!/usr/bin/env python3
"""
Script to help convert investorService.js from synchronous to async PostgreSQL pattern.
This script handles the complex conversions systematically.
"""

import re

def convert_db_prepare_get(content):
    """Convert db.prepare().get() patterns to async database.query()"""
    # Pattern: db.prepare('SQL').get(params)
    # or: const x = db.prepare(...).get(...)

    # Handle multi-line queries
    pattern = r'(const\s+(\w+)\s+=\s+)?db\.prepare\(([\s\S]*?)\)\.get\((.*?)\);'

    def replacer(match):
        var_name = match.group(2)
        sql = match.group(3).strip()
        params = match.group(4).strip()

        # Convert ? placeholders to $1, $2, etc.
        param_list = [p.strip() for p in params.split(',') if p.strip()] if params else []

        # Count ? in SQL and replace with $1, $2, $3...
        count = 0
        def replace_placeholder(m):
            nonlocal count
            count += 1
            return f'${count}'

        sql_converted = re.sub(r'\?', replace_placeholder, sql)

        if var_name:
            # With variable assignment
            params_str = f', [{params}]' if params else ''
            return f'const {var_name}Result = await database.query({sql_converted}{params_str});\n  const {var_name} = {var_name}Result.rows[0];'
        else:
            # Direct return or usage
            params_str = f', [{params}]' if params else ''
            return f'const result = await database.query({sql_converted}{params_str});\n  return result.rows[0];'

    return re.sub(pattern, replacer, content)

def convert_db_prepare_all(content):
    """Convert db.prepare().all() patterns to async database.query()"""
    pattern = r'(const\s+(\w+)\s+=\s+)?db\.prepare\(([\s\S]*?)\)\.all\((.*?)\);'

    def replacer(match):
        var_name = match.group(2)
        sql = match.group(3).strip()
        params = match.group(4).strip()

        # Convert ? placeholders to $1, $2, etc.
        param_list = [p.strip() for p in params.split(',') if p.strip()] if params else []

        # Count ? in SQL and replace with $1, $2, $3...
        count = 0
        def replace_placeholder(m):
            nonlocal count
            count += 1
            return f'${count}'

        sql_converted = re.sub(r'\?', replace_placeholder, sql)

        if var_name:
            # With variable assignment
            params_str = f', [{params}]' if params else ''
            return f'const {var_name}Result = await database.query({sql_converted}{params_str});\n  const {var_name} = {var_name}Result.rows;'
        else:
            # Direct return
            params_str = f', [{params}]' if params else ''
            return f'const result = await database.query({sql_converted}{params_str});\n  return result.rows;'

    return re.sub(pattern, replacer, content)

def convert_db_prepare_run(content):
    """Convert db.prepare().run() patterns to async database.query()"""
    pattern = r'(const\s+(\w+)\s+=\s+)?db\.prepare\(([\s\S]*?)\)\.run\((.*?)\);'

    def replacer(match):
        var_name = match.group(2)
        sql = match.group(3).strip()
        params = match.group(4).strip()

        # Convert ? placeholders to $1, $2, etc.
        count = 0
        def replace_placeholder(m):
            nonlocal count
            count += 1
            return f'${count}'

        sql_converted = re.sub(r'\?', replace_placeholder, sql)

        if var_name:
            params_str = f', [{params}]' if params else ''
            return f'const {var_name} = await database.query({sql_converted}{params_str});'
        else:
            params_str = f', [{params}]' if params else ''
            return f'await database.query({sql_converted}{params_str});'

    return re.sub(pattern, replacer, content)

def make_function_async(content, func_name):
    """Add async keyword to function definition"""
    # Match: function funcName(
    pattern = rf'(function\s+{func_name}\s*\()'
    return re.sub(pattern, r'async function ' + func_name + '(', content)

def add_database_const(content, func_name):
    """Add const database = await getDatabaseAsync(); at start of function"""
    # Find function and add after opening brace
    pattern = rf'(function\s+{func_name}\([^)]*\)\s*\{{)'
    replacement = r'\1\n  const database = await getDatabaseAsync();'
    return re.sub(pattern, replacement, content)

if __name__ == '__main__':
    print("This script provides helper functions for conversion.")
    print("Use it as a module or adapt the patterns for manual conversion.")
