#!/usr/bin/env python3
"""
Convert Scraped CSV to Importer Format
Converts the table scraper output to the format expected by capitol_trades_csv_importer.py

Usage:
    python3 python-services/convert_scraped_csv.py
    python3 python-services/convert_scraped_csv.py --input data/scraped.csv --output data/congressional_trades.csv
"""

import csv
import re
import argparse
from datetime import datetime


def parse_politician_field(politician_str):
    """
    Parse: "Bernie Moreno\nRepublicanSenateOH"
    Returns: name, party, chamber, state
    """
    lines = politician_str.strip().split('\n')
    name = lines[0].strip() if lines else 'Unknown'

    if len(lines) > 1:
        details = lines[1].strip()

        # Extract party (Democrat/Republican/Independent)
        party = None
        if 'Democrat' in details:
            party = 'D'
        elif 'Republican' in details:
            party = 'R'
        elif 'Independent' in details:
            party = 'I'

        # Extract chamber
        chamber = None
        if 'Senate' in details:
            chamber = 'Senate'
        elif 'House' in details:
            chamber = 'House'

        # Extract state (last 2 characters)
        state = details[-2:] if len(details) >= 2 else None

        # Format as "Rep. Name (D-CA)"
        if party and state:
            prefix = 'Sen.' if chamber == 'Senate' else 'Rep.'
            formatted = f"{prefix} {name} ({party}-{state})"
        else:
            formatted = name

        return formatted

    return name


def parse_asset_field(asset_str):
    """
    Parse: "MercadoLibre Inc\nMELI:US"
    Returns: asset_name, ticker
    """
    lines = asset_str.strip().split('\n')
    asset_name = lines[0].strip() if lines else 'Unknown'

    ticker = None
    if len(lines) > 1:
        ticker_line = lines[1].strip()
        # Remove :US suffix and N/A
        ticker = ticker_line.replace(':US', '').replace('N/A', '').strip()
        if not ticker:
            ticker = None

    return asset_name, ticker


def parse_date_field(date_str):
    """
    Parse: "9 Jan\n2026" or "19 Dec\n2025"
    Returns: YYYY-MM-DD
    """
    date_str = date_str.strip().replace('\n', ' ')

    try:
        # Parse "9 Jan 2026" format
        date_obj = datetime.strptime(date_str, '%d %b %Y')
        return date_obj.strftime('%Y-%m-%d')
    except:
        try:
            # Try without day
            date_obj = datetime.strptime(date_str, '%b %Y')
            return date_obj.strftime('%Y-%m-01')
        except:
            return None


def parse_transaction_type(type_str):
    """Convert BUY/SELL to standard format"""
    type_str = type_str.strip().upper()
    if type_str == 'BUY':
        return 'Purchase'
    elif type_str == 'SELL':
        return 'Sale'
    else:
        return type_str


def parse_amount(amount_str):
    """Convert: "1K–15K" or "$1,001 - $15,000" """
    amount_str = amount_str.strip()

    # Convert K notation to full range
    if 'K' in amount_str:
        # "1K–15K" or "15K–50K"
        parts = amount_str.replace('K', '').split('–')
        if len(parts) == 2:
            min_k = parts[0].strip()
            max_k = parts[1].strip()
            return f"${min_k},001 - ${max_k},000"

    return amount_str


def convert_scraped_to_importer_format(input_file, output_file):
    """
    Convert scraped CSV format to importer format

    Scraped format:
    Politician,Asset Name,Filed Date,Transaction Date,Days Ago,Owner,Type,Amount,Price

    Importer expects:
    Politician,Transaction Date,Ticker,Asset Name,Type,Amount,Filed Date,Owner,Comment
    """

    print(f"📂 Reading: {input_file}")

    trades = []

    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row in reader:
            try:
                # Parse fields
                politician = parse_politician_field(row.get('Politician', ''))
                asset_name, ticker = parse_asset_field(row.get('Asset Name', ''))
                filed_date = parse_date_field(row.get('Filed Date', ''))
                transaction_date = parse_date_field(row.get('Transaction Date', ''))
                owner = row.get('Owner', 'Self')
                trans_type = parse_transaction_type(row.get('Type', ''))
                amount = parse_amount(row.get('Amount', ''))
                price = row.get('Price', 'N/A')

                # Create formatted row
                formatted_row = {
                    'Politician': politician,
                    'Transaction Date': transaction_date or '',
                    'Ticker': ticker or '',
                    'Asset Name': asset_name,
                    'Type': trans_type,
                    'Amount': amount,
                    'Filed Date': filed_date or '',
                    'Owner': owner,
                    'Comment': f'Price: {price}' if price != 'N/A' else ''
                }

                trades.append(formatted_row)

            except Exception as e:
                print(f"   ⚠️  Error parsing row: {str(e)}")
                continue

    print(f"✅ Parsed {len(trades)} trades")

    # Write to output
    print(f"💾 Writing to: {output_file}")

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        fieldnames = ['Politician', 'Transaction Date', 'Ticker', 'Asset Name',
                     'Type', 'Amount', 'Filed Date', 'Owner', 'Comment']
        writer = csv.DictWriter(f, fieldnames=fieldnames)

        writer.writeheader()
        writer.writerows(trades)

    print(f"✅ Conversion complete!")
    print(f"   Output: {output_file}")
    print(f"   Trades: {len(trades)}")

    return True


def main():
    parser = argparse.ArgumentParser(description='Convert scraped CSV to importer format')
    parser.add_argument('--input', default='./data/congressional_trades.csv',
                       help='Input file (scraped format)')
    parser.add_argument('--output', default='./data/congressional_trades_formatted.csv',
                       help='Output file (importer format)')

    args = parser.parse_args()

    print('\n' + '='*80)
    print('🔄 CSV FORMAT CONVERTER')
    print('='*80)
    print()

    success = convert_scraped_to_importer_format(args.input, args.output)

    if success:
        print('\n' + '='*80)
        print('✅ CONVERSION SUCCESSFUL')
        print('='*80)
        print('\n📋 Next step:')
        print(f'  python3 python-services/capitol_trades_csv_importer.py {args.output}')
        print()
    else:
        print('\n❌ Conversion failed')
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
