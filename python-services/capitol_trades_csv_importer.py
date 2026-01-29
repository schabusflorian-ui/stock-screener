#!/usr/bin/env python3
"""
Capitol Trades CSV Importer
Imports congressional trading data from Capitol Trades CSV downloads

CSV Format Expected (from capitoltrades.com):
- Politician, Transaction Date, Ticker, Asset Name, Asset Type, Type, Amount, Comment, etc.

Download from: https://www.capitoltrades.com/trades
- Click "Export" to download CSV
- Save to: ./data/congressional_trades.csv
"""

import sqlite3
import csv
import os
import sys
from datetime import datetime
import re


class CapitolTradesImporter:
    def __init__(self, db_path='./data/stocks.db'):
        self.db_path = db_path
        self.conn = None

        # Column mapping for different CSV formats
        self.column_mappings = {
            'capitoltrades': {
                'politician': ['Politician', 'Representative', 'Senator', 'Name'],
                'transaction_date': ['Transaction Date', 'TransactionDate', 'Date', 'Trade Date'],
                'ticker': ['Ticker', 'Symbol', 'Stock Symbol'],
                'asset_name': ['Asset Name', 'AssetName', 'Asset', 'Description'],
                'asset_type': ['Asset Type', 'AssetType', 'Type'],
                'transaction_type': ['Type', 'Transaction Type', 'TransactionType', 'Trade Type'],
                'amount': ['Amount', 'Range', 'Amount Range', 'Size'],
                'filed_date': ['Filed Date', 'FiledDate', 'Disclosure Date', 'Filed'],
                'owner': ['Owner', 'Ownership'],
                'comment': ['Comment', 'Comments', 'Notes']
            }
        }

    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

    def detect_csv_format(self, csv_path):
        """Detect CSV format by examining headers"""
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader)

            print(f"📋 Detected CSV columns: {', '.join(headers[:5])}...")

            # Check for Capitol Trades format
            if any(col in headers for col in ['Politician', 'Representative', 'Senator']):
                return 'capitoltrades', headers

            return 'unknown', headers

    def find_column(self, headers, field_name, mappings):
        """Find column name in headers using mappings"""
        possible_names = mappings.get(field_name, [field_name])

        for possible in possible_names:
            for i, header in enumerate(headers):
                if header.strip().lower() == possible.lower():
                    return header
        return None

    def parse_politician_info(self, politician_str):
        """
        Parse politician string to extract name, chamber, party, state
        Examples:
        - "Rep. Nancy Pelosi (D-CA)"
        - "Sen. Tommy Tuberville (R-AL)"
        - "Nancy Pelosi"
        """
        chamber = None
        party = None
        state = None
        name = politician_str.strip()

        # Extract chamber
        if politician_str.startswith('Rep.') or politician_str.startswith('Representative'):
            chamber = 'House'
            name = re.sub(r'^Rep\.\s*|^Representative\s*', '', name).strip()
        elif politician_str.startswith('Sen.') or politician_str.startswith('Senator'):
            chamber = 'Senate'
            name = re.sub(r'^Sen\.\s*|^Senator\s*', '', name).strip()

        # Extract party and state from (D-CA) format
        match = re.search(r'\(([A-Z])-([A-Z]{2})\)', name)
        if match:
            party_abbr = match.group(1)
            state = match.group(2)
            name = name[:match.start()].strip()

            party = {
                'D': 'Democratic',
                'R': 'Republican',
                'I': 'Independent'
            }.get(party_abbr, party_abbr)

        # Default to House if not specified
        if not chamber:
            chamber = 'House'

        return {
            'full_name': name,
            'chamber': chamber,
            'party': party,
            'state': state
        }

    def parse_amount_range(self, amount_str):
        """
        Parse amount range string
        Examples:
        - "$1,001 - $15,000"
        - "$15,001 - $50,000"
        - "$1,000,001 +"
        - "Over $5,000,000"
        """
        if not amount_str or amount_str.lower() in ['n/a', 'unknown', '']:
            return None, None, amount_str

        # Remove $ and commas
        cleaned = amount_str.replace('$', '').replace(',', '').strip()

        try:
            # Range with dash
            if '-' in cleaned:
                parts = cleaned.split('-')
                min_val = float(parts[0].strip())
                max_val = float(parts[1].strip().replace('+', ''))
                return min_val, max_val, amount_str

            # "Over" or "+"
            elif 'over' in cleaned.lower() or '+' in cleaned:
                val = float(''.join(filter(str.isdigit, cleaned)))
                return val, val * 10, amount_str

            # Single value
            else:
                val = float(cleaned)
                return val, val, amount_str

        except (ValueError, IndexError):
            return None, None, amount_str

    def parse_transaction_type(self, type_str):
        """Normalize transaction type"""
        if not type_str:
            return 'unknown'

        type_lower = type_str.lower()

        if any(word in type_lower for word in ['purchase', 'buy', 'bought']):
            return 'purchase'
        elif any(word in type_lower for word in ['sale', 'sell', 'sold']):
            return 'sale'
        elif 'exchange' in type_lower:
            return 'exchange'
        else:
            return type_str.lower()

    def parse_date(self, date_str):
        """Parse date string to YYYY-MM-DD format"""
        if not date_str:
            return None

        # Try various date formats
        formats = [
            '%Y-%m-%d',
            '%m/%d/%Y',
            '%m/%d/%y',
            '%Y/%m/%d',
            '%d-%m-%Y',
            '%B %d, %Y',
            '%b %d, %Y'
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str.strip(), fmt).strftime('%Y-%m-%d')
            except ValueError:
                continue

        print(f"⚠️  Could not parse date: {date_str}")
        return None

    def get_or_create_politician(self, politician_info):
        """Get existing politician or create new entry"""
        cursor = self.conn.cursor()

        # Try to find existing
        result = cursor.execute("""
            SELECT id FROM politicians
            WHERE full_name = ? AND chamber = ?
        """, (politician_info['full_name'], politician_info['chamber'])).fetchone()

        if result:
            return result[0]

        # Create new politician
        cursor.execute("""
            INSERT INTO politicians (full_name, chamber, party, state, is_current)
            VALUES (?, ?, ?, ?, 1)
        """, (
            politician_info['full_name'],
            politician_info['chamber'],
            politician_info['party'],
            politician_info['state']
        ))

        self.conn.commit()
        return cursor.lastrowid

    def match_ticker_to_company(self, ticker):
        """Match ticker to company in database"""
        if not ticker:
            return None

        cursor = self.conn.cursor()
        result = cursor.execute(
            "SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE",
            (ticker.strip(),)
        ).fetchone()

        return result[0] if result else None

    def import_csv(self, csv_path):
        """Import congressional trades from CSV file"""
        if not os.path.exists(csv_path):
            print(f"❌ CSV file not found: {csv_path}")
            return False

        print(f"📂 Reading CSV: {csv_path}")

        # Detect format
        csv_format, headers = self.detect_csv_format(csv_path)

        if csv_format == 'unknown':
            print("⚠️  Unknown CSV format - attempting to parse anyway")

        # Get column mappings
        mappings = self.column_mappings.get(csv_format, self.column_mappings['capitoltrades'])

        # Import trades
        imported = 0
        skipped = 0
        errors = 0

        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row_num, row in enumerate(reader, start=2):
                try:
                    # Extract fields
                    politician_str = None
                    for field in mappings['politician']:
                        if field in row and row[field]:
                            politician_str = row[field]
                            break

                    if not politician_str:
                        skipped += 1
                        continue

                    # Parse politician info
                    politician_info = self.parse_politician_info(politician_str)
                    politician_id = self.get_or_create_politician(politician_info)

                    # Get transaction date
                    transaction_date = None
                    for field in mappings['transaction_date']:
                        if field in row and row[field]:
                            transaction_date = self.parse_date(row[field])
                            break

                    if not transaction_date:
                        skipped += 1
                        continue

                    # Get ticker
                    ticker = None
                    for field in mappings['ticker']:
                        if field in row and row[field]:
                            ticker = row[field].strip().upper()
                            if ticker and ticker != '--':
                                break

                    # Get asset name
                    asset_name = None
                    for field in mappings['asset_name']:
                        if field in row and row[field]:
                            asset_name = row[field].strip()
                            break

                    if not asset_name:
                        asset_name = ticker or 'Unknown Asset'

                    # Get transaction type
                    trans_type = None
                    for field in mappings['transaction_type']:
                        if field in row and row[field]:
                            trans_type = self.parse_transaction_type(row[field])
                            break

                    # Get amount
                    amount_str = None
                    for field in mappings['amount']:
                        if field in row and row[field]:
                            amount_str = row[field]
                            break

                    amount_min, amount_max, amount_range = self.parse_amount_range(amount_str)

                    # Get filed date
                    filed_date = None
                    for field in mappings['filed_date']:
                        if field in row and row[field]:
                            filed_date = self.parse_date(row[field])
                            break

                    # Get owner
                    owner = 'self'
                    for field in mappings['owner']:
                        if field in row and row[field]:
                            owner_str = row[field].lower()
                            if 'spouse' in owner_str:
                                owner = 'spouse'
                            elif 'joint' in owner_str:
                                owner = 'joint'
                            elif 'child' in owner_str or 'dependent' in owner_str:
                                owner = 'dependent_child'
                            break

                    # Match ticker to company
                    company_id = self.match_ticker_to_company(ticker)
                    symbol_matched = 1 if company_id else 0

                    # Check if already exists
                    cursor = self.conn.cursor()
                    existing = cursor.execute("""
                        SELECT id FROM congressional_trades
                        WHERE politician_id = ?
                          AND transaction_date = ?
                          AND asset_description = ?
                          AND amount_range = ?
                    """, (politician_id, transaction_date, asset_name, amount_range)).fetchone()

                    if existing:
                        skipped += 1
                        continue

                    # Insert trade
                    cursor.execute("""
                        INSERT INTO congressional_trades (
                            politician_id, company_id, filing_date, transaction_date,
                            transaction_type, asset_type, ticker, asset_description,
                            amount_min, amount_max, amount_range, owner,
                            symbol_matched, match_confidence, source, data_quality
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        politician_id,
                        company_id,
                        filed_date,
                        transaction_date,
                        trans_type,
                        'stock',
                        ticker,
                        asset_name,
                        amount_min,
                        amount_max,
                        amount_range,
                        owner,
                        symbol_matched,
                        1.0 if symbol_matched else 0.5,
                        'capitol_trades_csv',
                        'complete'
                    ))

                    imported += 1

                    if imported % 100 == 0:
                        print(f"   📥 Imported {imported} trades...")
                        self.conn.commit()

                except Exception as e:
                    errors += 1
                    if errors <= 5:  # Only show first 5 errors
                        print(f"   ⚠️  Row {row_num}: {str(e)}")

        self.conn.commit()

        print(f"\n✅ Import complete!")
        print(f"   Imported: {imported}")
        print(f"   Skipped: {skipped}")
        print(f"   Errors: {errors}")

        return True


def main():
    """Main import function"""
    print('\n' + '='*80)
    print('🏛️  CAPITOL TRADES CSV IMPORTER')
    print('='*80)

    # Check for CSV file
    csv_path = './data/congressional_trades.csv'

    if len(sys.argv) > 1:
        csv_path = sys.argv[1]

    if not os.path.exists(csv_path):
        print(f"\n❌ CSV file not found: {csv_path}")
        print("\n📥 To download Capitol Trades data:")
        print("   1. Go to https://www.capitoltrades.com/trades")
        print("   2. Click 'Export' or download CSV")
        print("   3. Save to: ./data/congressional_trades.csv")
        print("   4. Run: python3 python-services/capitol_trades_csv_importer.py")
        sys.exit(1)

    # Import CSV
    importer = CapitolTradesImporter()
    importer.connect()

    try:
        success = importer.import_csv(csv_path)

        if success:
            # Show summary
            cursor = importer.conn.cursor()

            total = cursor.execute("SELECT COUNT(*) as cnt FROM congressional_trades").fetchone()[0]
            politicians = cursor.execute("SELECT COUNT(DISTINCT politician_id) as cnt FROM congressional_trades").fetchone()[0]
            companies = cursor.execute("SELECT COUNT(DISTINCT company_id) as cnt FROM congressional_trades WHERE company_id IS NOT NULL").fetchone()[0]
            matched = cursor.execute("SELECT COUNT(*) as cnt FROM congressional_trades WHERE symbol_matched = 1").fetchone()[0]

            print('\n' + '='*80)
            print('📊 DATABASE SUMMARY')
            print('='*80)
            print(f"\nTotal Trades: {total}")
            print(f"Politicians: {politicians}")
            print(f"Companies: {companies}")
            print(f"Matched Tickers: {matched}/{total} ({matched/max(total,1)*100:.1f}%)")

            # Recent activity
            recent = cursor.execute("""
                SELECT
                    p.full_name,
                    p.chamber,
                    COUNT(*) as trade_count
                FROM congressional_trades ct
                JOIN politicians p ON ct.politician_id = p.id
                WHERE ct.transaction_date >= date('now', '-30 days')
                GROUP BY p.id
                ORDER BY trade_count DESC
                LIMIT 5
            """).fetchall()

            if recent:
                print("\n🔥 Most Active Traders (Last 30 Days):")
                for pol in recent:
                    print(f"   {pol[0]} ({pol[1]}): {pol[2]} trades")

    finally:
        importer.close()

    print('\n' + '='*80)
    print('✅ Import complete')
    print('='*80 + '\n')


if __name__ == '__main__':
    main()
