#!/usr/bin/env python3
"""
Complete conversion script for investorService.js from sync to async PostgreSQL pattern.
"""

import re
import sys

def convert_file(input_path, output_path):
    with open(input_path, 'r') as f:
        content = f.read()

    # Step 1: Update import
    content = re.sub(
        r"const db = require\('\.\.\/\.\.\/database'\)\.db;",
        "const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');",
        content
    )

    # Step 2: List of functions to convert (NOT including already async functions)
    functions_to_convert = [
        'getAllInvestors', 'getInvestor', 'getInvestorByCik', 'getLatestHoldings',
        'getHoldingChanges', 'getInvestorsByStock', 'getInvestorsBySymbol',
        'getHoldingsHistory', 'getPortfolioReturns', 'getAllInvestorReturnsSummary',
        'getSpyReturn', 'getPortfolioValueHistory', 'getPreviousHoldings',
        'storeUnmappedSecurities', 'findCompanyByName', 'storeHoldings',
        'getHoldingsMapForDate', 'getPreviousFilingDate', 'storeHistoricalHoldings',
        'prepareClone', 'getInvestorStats', 'getMostOwnedStocks', 'getRecentActivity',
        'getUnmappedSecurities', 'getUnmappedSecuritiesSummary', 'mapSecurityToCompany',
        'markSecurityReviewed', 'deleteUnmappedSecurity', 'calculateAndCachePerformance',
        'getCachedPerformance', 'invalidatePerformanceCache', 'recalculateAllPerformance',
        'getPerformanceCacheStatus'
    ]

    # Step 3: Make functions async
    for func_name in functions_to_convert:
        # Match function definition and add async
        content = re.sub(
            rf'(\n)(function {func_name}\()',
            r'\1async function ' + func_name + '(',
            content
        )

    # Step 4: Convert db.prepare().get() to async query
    # This is complex due to multiline queries, so we handle it iteratively

    # Simple single-line pattern first
    content = re.sub(
        r"db\.prepare\('([^']+)'\)\.get\(([^)]*)\)",
        lambda m: convert_get_call(m.group(1), m.group(2)),
        content
    )

    # Convert db.prepare().all() to async query
    content = re.sub(
        r"db\.prepare\('([^']+)'\)\.all\(([^)]*)\)",
        lambda m: convert_all_call(m.group(1), m.group(2)),
        content
    )

    # Convert db.prepare().run() to async query
    content = re.sub(
        r"db\.prepare\('([^']+)'\)\.run\(([^)]*)\)",
        lambda m: convert_run_call(m.group(1), m.group(2)),
        content
    )

    # Step 5: Handle backtick queries (more complex)
    # Pattern: db.prepare(`...`).get/all/run(...)
    content = handle_backtick_queries(content)

    # Step 6: Add await getDatabaseAsync() at start of converted functions
    for func_name in functions_to_convert:
        content = add_database_const(content, func_name)

    # Step 7: Add await to calls to other async functions
    content = add_await_to_async_calls(content, functions_to_convert)

    with open(output_path, 'w') as f:
        f.write(content)

    print(f"✓ Converted {input_path} -> {output_path}")
    print(f"✓ Converted {len(functions_to_convert)} functions to async")

def convert_placeholders(sql):
    """Convert ? placeholders to $1, $2, $3..."""
    count = 0
    def replace(m):
        nonlocal count
        count += 1
        return f'${count}'
    return re.sub(r'\?', replace, sql)

def convert_get_call(sql, params):
    """Convert .get() call to async pattern"""
    sql_converted = convert_placeholders(sql)
    params_str = f', [{params}]' if params.strip() else ''
    return f"(await database.query('{sql_converted}'{params_str})).rows[0]"

def convert_all_call(sql, params):
    """Convert .all() call to async pattern"""
    sql_converted = convert_placeholders(sql)
    params_str = f', [{params}]' if params.strip() else ''
    return f"(await database.query('{sql_converted}'{params_str})).rows"

def convert_run_call(sql, params):
    """Convert .run() call to async pattern"""
    sql_converted = convert_placeholders(sql)
    params_str = f', [{params}]' if params.strip() else ''
    return f"await database.query('{sql_converted}'{params_str})"

def handle_backtick_queries(content):
    """Handle complex backtick queries with multiline SQL"""
    # This is tricky - we need to handle template literals
    # For now, we'll use a regex that matches db.prepare(`) ... `).get/all/run

    # Pattern for backtick queries (non-greedy to avoid matching too much)
    pattern = r'db\.prepare\(`([\s\S]*?)`\)\.(get|all|run)\(([^)]*)\)'

    def replacer(match):
        sql = match.group(1)
        method = match.group(2)
        params = match.group(3)

        sql_converted = convert_placeholders(sql)
        params_str = f', [{params}]' if params.strip() else ''

        if method == 'get':
            return f'(await database.query(`{sql_converted}`{params_str})).rows[0]'
        elif method == 'all':
            return f'(await database.query(`{sql_converted}`{params_str})).rows'
        elif method == 'run':
            return f'await database.query(`{sql_converted}`{params_str})'

    return re.sub(pattern, replacer, content)

def add_database_const(content, func_name):
    """Add const database = await getDatabaseAsync(); after function opening brace"""
    # Find the function and add database const if not already present
    pattern = rf'(async function {func_name}\([^)]*\)\s*\{{\n)((?!\s*const database = await getDatabaseAsync))'
    replacement = r'\1  const database = await getDatabaseAsync();\n\2'
    return re.sub(pattern, replacement, content)

def add_await_to_async_calls(content, async_functions):
    """Add await keyword to calls to converted async functions"""
    for func_name in async_functions:
        # Match function calls (not definitions)
        # Pattern: funcName( but not: function funcName( or async function funcName(
        pattern = rf'(?<!function )(?<!async function )({func_name}\()'
        # Add await before the call if not already there
        content = re.sub(
            rf'(?<!await )(?<!async )({func_name}\()',
            r'await \1',
            content
        )
    return content

if __name__ == '__main__':
    input_file = '/Users/florianschabus/Investment Project/src/services/portfolio/investorService.js'
    output_file = '/Users/florianschabus/Investment Project/src/services/portfolio/investorService.js.new'

    try:
        convert_file(input_file, output_file)
        print("\n✓ Conversion complete!")
        print(f"✓ Review the output file: {output_file}")
        print(f"✓ If satisfied, replace the original file")
    except Exception as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        sys.exit(1)
