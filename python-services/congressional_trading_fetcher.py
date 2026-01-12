#!/usr/bin/env python3
"""
Congressional Trading Data Fetcher
Fetches stock trading data from US Congress members

Data Sources (in order of preference):
1. Capitol Trades API (if available)
2. QuiverQuant API (if available)
3. House/Senate disclosure websites (web scraping)
4. Manual CSV import

This fetcher will:
- Download recent congressional trades
- Parse and normalize the data
- Match tickers to companies in our database
- Store in congressional_trades table
"""

import sqlite3
import json
import os
from datetime import datetime, timedelta
import time

# Try importing requests for API calls
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    print("⚠️  'requests' not installed. Install with: pip install requests")
    HAS_REQUESTS = False


class CongressionalTradingFetcher:
    def __init__(self, db_path='./data/stocks.db'):
        self.db_path = db_path
        self.conn = None

    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

    def fetch_from_capitol_trades(self, days_back=90):
        """
        Fetch from Capitol Trades website
        Note: This is a placeholder - Capitol Trades doesn't have a free API
        You would need to either:
        1. Subscribe to their API
        2. Web scrape (check their robots.txt and terms)
        3. Use an alternative source
        """
        print("⚠️  Capitol Trades API not implemented")
        print("   Capitol Trades requires subscription or web scraping")
        return []

    def fetch_from_quiver(self, api_key=None, days_back=90):
        """
        Fetch from Quiver Quant API
        Requires API key: https://www.quiverquant.com/
        """
        if not api_key:
            api_key = os.getenv('QUIVER_API_KEY')

        if not api_key:
            print("⚠️  QuiverQuant API key not found")
            print("   Set QUIVER_API_KEY environment variable or pass api_key parameter")
            return []

        if not HAS_REQUESTS:
            print("⚠️  'requests' module required for API calls")
            return []

        print(f"📡 Fetching congressional trades from QuiverQuant (last {days_back} days)...")

        headers = {
            'Authorization': f'Token {api_key}'
        }

        # Quiver endpoint for congressional trading
        url = 'https://api.quiverquant.com/beta/bulk/congresstrading'

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            data = response.json()

            # Filter to recent trades
            cutoff_date = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
            recent_trades = [t for t in data if t.get('TransactionDate', '') >= cutoff_date]

            print(f"✅ Fetched {len(recent_trades)} recent trades from QuiverQuant")
            return recent_trades

        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching from QuiverQuant: {e}")
            return []

    def load_from_csv(self, csv_path):
        """
        Load congressional trading data from CSV file
        CSV format expected:
        - Representative, Transaction Date, Ticker, Transaction Type, Amount, Filed Date
        """
        print(f"📂 Loading congressional trades from {csv_path}...")

        if not os.path.exists(csv_path):
            print(f"❌ File not found: {csv_path}")
            return []

        try:
            import csv
            trades = []

            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    trades.append(row)

            print(f"✅ Loaded {len(trades)} trades from CSV")
            return trades

        except Exception as e:
            print(f"❌ Error loading CSV: {e}")
            return []

    def normalize_trade_data(self, raw_trades, source='unknown'):
        """
        Normalize trade data from various sources into our schema
        """
        normalized = []

        for trade in raw_trades:
            # Normalize based on source
            if source == 'quiver':
                norm = {
                    'politician_name': trade.get('Representative', ''),
                    'transaction_date': trade.get('TransactionDate', ''),
                    'filing_date': trade.get('FiledDate', ''),
                    'ticker': trade.get('Ticker', '').upper(),
                    'asset_description': trade.get('AssetDescription', ''),
                    'transaction_type': trade.get('TransactionType', '').lower(),
                    'amount_range': trade.get('Amount', ''),
                    'owner': trade.get('Owner', 'self'),
                    'chamber': 'House' if 'Rep.' in trade.get('Representative', '') else 'Senate'
                }
            elif source == 'csv':
                # Generic CSV format
                norm = {
                    'politician_name': trade.get('Representative') or trade.get('Senator') or trade.get('Name', ''),
                    'transaction_date': trade.get('Transaction Date') or trade.get('TransactionDate', ''),
                    'filing_date': trade.get('Filed Date') or trade.get('FiledDate', ''),
                    'ticker': (trade.get('Ticker') or '').upper(),
                    'asset_description': trade.get('Asset') or trade.get('AssetDescription', ''),
                    'transaction_type': (trade.get('Type') or trade.get('TransactionType', '')).lower(),
                    'amount_range': trade.get('Amount') or trade.get('Range', ''),
                    'owner': trade.get('Owner', 'self'),
                    'chamber': trade.get('Chamber', 'House')
                }
            else:
                continue

            # Parse amount range
            amount_min, amount_max = self.parse_amount_range(norm['amount_range'])
            norm['amount_min'] = amount_min
            norm['amount_max'] = amount_max

            # Normalize transaction type
            if 'purchase' in norm['transaction_type'] or 'buy' in norm['transaction_type']:
                norm['transaction_type'] = 'purchase'
            elif 'sale' in norm['transaction_type'] or 'sell' in norm['transaction_type']:
                norm['transaction_type'] = 'sale'
            elif 'exchange' in norm['transaction_type']:
                norm['transaction_type'] = 'exchange'

            normalized.append(norm)

        return normalized

    def parse_amount_range(self, range_str):
        """
        Parse amount range like '$1,001 - $15,000' into (min, max)
        """
        if not range_str or range_str == 'N/A':
            return None, None

        try:
            # Remove $ and commas
            range_str = range_str.replace('$', '').replace(',', '')

            if '-' in range_str:
                parts = range_str.split('-')
                min_val = float(parts[0].strip())
                max_val = float(parts[1].strip())
                return min_val, max_val
            elif 'over' in range_str.lower() or '>' in range_str:
                # "$50,000,001 +" or "> $5,000,000"
                val = float(''.join(filter(str.isdigit, range_str)))
                return val, val * 10  # Assume 10x for "over" amounts
            else:
                # Single value
                val = float(range_str.strip())
                return val, val

        except (ValueError, IndexError):
            return None, None

    def match_ticker_to_company(self, ticker):
        """Match ticker symbol to company in database"""
        if not ticker:
            return None

        cursor = self.conn.cursor()
        result = cursor.execute(
            "SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE",
            (ticker,)
        ).fetchone()

        if result:
            return result['id']
        return None

    def get_or_create_politician(self, name, chamber, party=None, state=None):
        """Get existing politician or create new entry"""
        cursor = self.conn.cursor()

        # Try to find existing
        result = cursor.execute(
            "SELECT id FROM politicians WHERE full_name = ? AND chamber = ?",
            (name, chamber)
        ).fetchone()

        if result:
            return result['id']

        # Create new politician
        cursor.execute("""
            INSERT INTO politicians (full_name, chamber, party, state, is_current)
            VALUES (?, ?, ?, ?, 1)
        """, (name, chamber, party, state))

        self.conn.commit()
        return cursor.lastrowid

    def store_trades(self, normalized_trades):
        """Store normalized trades in database"""
        cursor = self.conn.cursor()

        stored = 0
        skipped = 0

        for trade in normalized_trades:
            # Get or create politician
            politician_id = self.get_or_create_politician(
                trade['politician_name'],
                trade['chamber']
            )

            # Match ticker to company
            company_id = self.match_ticker_to_company(trade['ticker'])
            symbol_matched = 1 if company_id else 0

            # Check if trade already exists
            existing = cursor.execute("""
                SELECT id FROM congressional_trades
                WHERE politician_id = ?
                  AND transaction_date = ?
                  AND asset_description = ?
                  AND amount_range = ?
            """, (
                politician_id,
                trade['transaction_date'],
                trade['asset_description'],
                trade['amount_range']
            )).fetchone()

            if existing:
                skipped += 1
                continue

            # Insert trade
            cursor.execute("""
                INSERT INTO congressional_trades (
                    politician_id, company_id, filing_date, transaction_date,
                    transaction_type, asset_type, ticker, asset_description,
                    amount_min, amount_max, amount_range, owner,
                    symbol_matched, match_confidence, source
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                politician_id,
                company_id,
                trade['filing_date'],
                trade['transaction_date'],
                trade['transaction_type'],
                'stock',  # Assume stock for now
                trade['ticker'],
                trade['asset_description'],
                trade['amount_min'],
                trade['amount_max'],
                trade['amount_range'],
                trade['owner'],
                symbol_matched,
                1.0 if symbol_matched else 0.0,
                'python_fetcher'
            ))

            stored += 1

        self.conn.commit()

        print(f"\n✅ Stored {stored} new trades")
        if skipped > 0:
            print(f"⏭️  Skipped {skipped} duplicate trades")

        return stored

    def get_summary_stats(self):
        """Get summary statistics of congressional trading data"""
        cursor = self.conn.cursor()

        # Total trades
        total = cursor.execute("SELECT COUNT(*) as cnt FROM congressional_trades").fetchone()['cnt']

        # Matched vs unmatched
        matched = cursor.execute(
            "SELECT COUNT(*) as cnt FROM congressional_trades WHERE symbol_matched = 1"
        ).fetchone()['cnt']

        # Recent trades (last 30 days)
        cutoff = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        recent = cursor.execute(
            "SELECT COUNT(*) as cnt FROM congressional_trades WHERE transaction_date >= ?",
            (cutoff,)
        ).fetchone()['cnt']

        # Purchases vs sales
        purchases = cursor.execute(
            "SELECT COUNT(*) as cnt FROM congressional_trades WHERE transaction_type = 'purchase'"
        ).fetchone()['cnt']

        sales = cursor.execute(
            "SELECT COUNT(*) as cnt FROM congressional_trades WHERE transaction_type = 'sale'"
        ).fetchone()['cnt']

        # Top politicians by trade count
        top_traders = cursor.execute("""
            SELECT p.full_name, p.chamber, COUNT(*) as trade_count
            FROM congressional_trades ct
            JOIN politicians p ON ct.politician_id = p.id
            GROUP BY p.id
            ORDER BY trade_count DESC
            LIMIT 10
        """).fetchall()

        return {
            'total_trades': total,
            'matched_companies': matched,
            'recent_trades_30d': recent,
            'purchases': purchases,
            'sales': sales,
            'top_traders': [dict(t) for t in top_traders]
        }


def main():
    """Main function - fetch and store congressional trading data"""
    print('\n' + '='*80)
    print('🏛️  CONGRESSIONAL TRADING DATA FETCHER')
    print('='*80)

    fetcher = CongressionalTradingFetcher()
    fetcher.connect()

    # Try different data sources
    trades = []

    # 1. Try QuiverQuant API (if key available)
    quiver_key = os.getenv('QUIVER_API_KEY')
    if quiver_key:
        print("\n🔑 QuiverQuant API key found - fetching data...")
        quiver_trades = fetcher.fetch_from_quiver(api_key=quiver_key, days_back=365)
        if quiver_trades:
            trades.extend(fetcher.normalize_trade_data(quiver_trades, source='quiver'))

    # 2. Try loading from CSV (manual download)
    csv_path = './data/congressional_trades.csv'
    if os.path.exists(csv_path):
        print(f"\n📂 Found CSV file: {csv_path}")
        csv_trades = fetcher.load_from_csv(csv_path)
        if csv_trades:
            trades.extend(fetcher.normalize_trade_data(csv_trades, source='csv'))

    # 3. No data sources available
    if not trades:
        print("\n⚠️  No data sources available!")
        print("\n📝 To fetch congressional trading data, either:")
        print("   1. Set QUIVER_API_KEY environment variable (https://www.quiverquant.com/)")
        print("   2. Download CSV from https://www.capitoltrades.com/ to ./data/congressional_trades.csv")
        print("   3. Use the sample data generator below for testing\n")

        # Generate sample data for testing
        print("🧪 Generating sample test data...")
        trades = generate_sample_trades()

    # Store trades
    if trades:
        print(f"\n💾 Storing {len(trades)} congressional trades...")
        stored = fetcher.store_trades(trades)

        # Show summary
        print('\n' + '='*80)
        print('📊 CONGRESSIONAL TRADING DATA SUMMARY')
        print('='*80)

        stats = fetcher.get_summary_stats()
        print(f"\nTotal Trades: {stats['total_trades']}")
        print(f"Matched to Companies: {stats['matched_companies']} ({stats['matched_companies']/max(stats['total_trades'],1)*100:.1f}%)")
        print(f"Recent Trades (30 days): {stats['recent_trades_30d']}")
        print(f"Purchases: {stats['purchases']}")
        print(f"Sales: {stats['sales']}")

        if stats['top_traders']:
            print("\n🏆 Most Active Traders:")
            for trader in stats['top_traders'][:5]:
                print(f"   {trader['full_name']} ({trader['chamber']}): {trader['trade_count']} trades")

    fetcher.close()

    print('\n' + '='*80)
    print('✅ Congressional trading data fetch complete')
    print('='*80 + '\n')


def generate_sample_trades():
    """Generate sample congressional trades for testing"""
    from datetime import datetime, timedelta
    import random

    politicians = [
        ('Nancy Pelosi', 'House', 'Democratic'),
        ('Josh Gottheimer', 'House', 'Democratic'),
        ('Dan Crenshaw', 'House', 'Republican'),
        ('Tommy Tuberville', 'Senate', 'Republican'),
        ('Mark Kelly', 'Senate', 'Democratic')
    ]

    tickers = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', 'META', 'JPM', 'V', 'MA']

    amount_ranges = [
        ('$1,001 - $15,000', 1001, 15000),
        ('$15,001 - $50,000', 15001, 50000),
        ('$50,001 - $100,000', 50001, 100000),
        ('$100,001 - $250,000', 100001, 250000),
        ('$250,001 - $500,000', 250001, 500000),
        ('$500,001 - $1,000,000', 500001, 1000000)
    ]

    trades = []
    base_date = datetime.now() - timedelta(days=180)

    for i in range(50):  # Generate 50 sample trades
        politician = random.choice(politicians)
        ticker = random.choice(tickers)
        amount = random.choice(amount_ranges)

        trade_date = base_date + timedelta(days=random.randint(0, 180))
        file_date = trade_date + timedelta(days=random.randint(1, 45))  # Filed 1-45 days later

        trade = {
            'politician_name': politician[0],
            'chamber': politician[1],
            'transaction_date': trade_date.strftime('%Y-%m-%d'),
            'filing_date': file_date.strftime('%Y-%m-%d'),
            'ticker': ticker,
            'asset_description': f'{ticker} Common Stock',
            'transaction_type': random.choice(['purchase', 'sale']),
            'amount_range': amount[0],
            'amount_min': amount[1],
            'amount_max': amount[2],
            'owner': random.choice(['self', 'spouse', 'joint'])
        }

        trades.append(trade)

    return trades


if __name__ == '__main__':
    main()
