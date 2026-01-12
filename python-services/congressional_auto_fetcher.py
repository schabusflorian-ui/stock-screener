#!/usr/bin/env python3
"""
Congressional Trading Auto-Fetcher
Automated download of congressional trading data using multiple sources

Supported Sources:
1. Finnhub API (Premium) - Both House and Senate
2. Financial Modeling Prep API - Senate + House (separate endpoints)
3. Apify Capitol Trades Scraper - Web scraping service
4. QuiverQuant API (already implemented) - Best quality

Usage:
    export FINNHUB_API_KEY="your_key"
    export FMP_API_KEY="your_key"
    export APIFY_API_KEY="your_key"
    export QUIVER_API_KEY="your_key"  # Already supported

    python3 python-services/congressional_auto_fetcher.py --source finnhub
    python3 python-services/congressional_auto_fetcher.py --source fmp
    python3 python-services/congressional_auto_fetcher.py --source apify
    python3 python-services/congressional_auto_fetcher.py --source quiver
"""

import os
import sys
import sqlite3
import requests
from datetime import datetime, timedelta
import argparse
import time


class CongressionalAutoFetcher:
    def __init__(self, db_path='./data/stocks.db'):
        self.db_path = db_path
        self.conn = None

        # API keys from environment
        self.finnhub_key = os.getenv('FINNHUB_API_KEY')
        self.fmp_key = os.getenv('FMP_API_KEY')
        self.apify_key = os.getenv('APIFY_API_KEY')
        self.quiver_key = os.getenv('QUIVER_API_KEY')

    def connect(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

    # ==================== FINNHUB API ====================

    def fetch_finnhub(self, symbol=None, days_back=180):
        """
        Fetch congressional trades from Finnhub API

        Premium subscription required (~$60/month)
        Endpoint: /stock/congressional-trading
        Rate limit: 30 calls/second
        """
        if not self.finnhub_key:
            print("❌ FINNHUB_API_KEY not set")
            print("   Get API key from: https://finnhub.io/")
            print("   Requires: Premium subscription ($60+/month)")
            return False

        print("📡 Fetching from Finnhub API...")

        base_url = "https://finnhub.io/api/v1/stock/congressional-trading"

        # Date range
        to_date = datetime.now().strftime('%Y-%m-%d')
        from_date = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')

        # Get all companies to check
        cursor = self.conn.cursor()
        companies = cursor.execute(
            "SELECT symbol FROM companies WHERE market_cap > 1000000000 ORDER BY market_cap DESC"
        ).fetchall()

        total_trades = 0

        for i, company in enumerate(companies):
            symbol = company[0]

            try:
                params = {
                    'symbol': symbol,
                    'from': from_date,
                    'to': to_date,
                    'token': self.finnhub_key
                }

                response = requests.get(base_url, params=params, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    trades = data.get('data', [])

                    for trade in trades:
                        self._process_finnhub_trade(trade, symbol)
                        total_trades += 1

                    if trades:
                        print(f"   ✅ {symbol}: {len(trades)} trades")

                elif response.status_code == 429:
                    print(f"   ⏸️  Rate limit hit - waiting...")
                    time.sleep(2)
                    continue

                elif response.status_code == 403:
                    print(f"   ❌ Premium subscription required")
                    return False

                # Rate limiting
                if i % 30 == 0:
                    time.sleep(1)

            except Exception as e:
                print(f"   ⚠️  {symbol}: {str(e)}")

        self.conn.commit()
        print(f"\n✅ Finnhub import complete: {total_trades} trades")
        return True

    def _process_finnhub_trade(self, trade, symbol):
        """Process a single Finnhub trade record"""
        # Extract politician info
        politician_name = trade.get('name', 'Unknown')
        transaction_date = trade.get('transactionDate', '')
        transaction_type = trade.get('transactionType', '').lower()
        amount_range = trade.get('amount', '')

        # Parse politician
        politician_info = self._parse_politician_name(politician_name)
        politician_id = self._get_or_create_politician(politician_info)

        # Match company
        company_id = self._match_ticker(symbol)

        # Insert trade (with deduplication)
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO congressional_trades (
                politician_id, company_id, transaction_date, transaction_type,
                ticker, amount_range, source, data_quality
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            politician_id, company_id, transaction_date, transaction_type,
            symbol, amount_range, 'finnhub_api', 'complete'
        ))

    # ==================== FINANCIAL MODELING PREP API ====================

    def fetch_fmp(self, days_back=180):
        """
        Fetch congressional trades from Financial Modeling Prep API

        Pricing: ~$20-50/month depending on plan
        Endpoints: /senate-trading and /house-disclosure
        """
        if not self.fmp_key:
            print("❌ FMP_API_KEY not set")
            print("   Get API key from: https://site.financialmodelingprep.com/")
            print("   Pricing: $20-50/month")
            return False

        print("📡 Fetching from Financial Modeling Prep API...")

        total_trades = 0

        # Fetch Senate trades
        senate_trades = self._fetch_fmp_senate()
        total_trades += senate_trades

        # Fetch House trades
        house_trades = self._fetch_fmp_house()
        total_trades += house_trades

        self.conn.commit()
        print(f"\n✅ FMP import complete: {total_trades} trades")
        return True

    def _fetch_fmp_senate(self):
        """Fetch Senate trades from FMP"""
        url = f"https://financialmodelingprep.com/api/v4/senate-trading?apikey={self.fmp_key}"

        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                trades = response.json()
                print(f"   ✅ Senate: {len(trades)} trades")

                for trade in trades:
                    self._process_fmp_trade(trade, 'Senate')

                return len(trades)
            else:
                print(f"   ❌ Senate fetch failed: {response.status_code}")
                return 0
        except Exception as e:
            print(f"   ⚠️  Senate error: {str(e)}")
            return 0

    def _fetch_fmp_house(self):
        """Fetch House trades from FMP"""
        url = f"https://financialmodelingprep.com/api/v4/house-disclosure?apikey={self.fmp_key}"

        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                trades = response.json()
                print(f"   ✅ House: {len(trades)} trades")

                for trade in trades:
                    self._process_fmp_trade(trade, 'House')

                return len(trades)
            else:
                print(f"   ❌ House fetch failed: {response.status_code}")
                return 0
        except Exception as e:
            print(f"   ⚠️  House error: {str(e)}")
            return 0

    def _process_fmp_trade(self, trade, chamber):
        """Process a single FMP trade record"""
        politician_name = trade.get('representative', '') or trade.get('senator', '')
        ticker = trade.get('ticker', '')
        transaction_date = trade.get('transactionDate', '')
        transaction_type = trade.get('type', '').lower()
        amount = trade.get('amount', '')

        politician_info = {
            'full_name': politician_name,
            'chamber': chamber,
            'party': None,
            'state': None
        }

        politician_id = self._get_or_create_politician(politician_info)
        company_id = self._match_ticker(ticker)

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO congressional_trades (
                politician_id, company_id, transaction_date, transaction_type,
                ticker, amount_range, source, data_quality
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            politician_id, company_id, transaction_date, transaction_type,
            ticker, amount, 'fmp_api', 'complete'
        ))

    # ==================== APIFY SCRAPER ====================

    def fetch_apify(self):
        """
        Fetch congressional trades via Apify scraper

        Pricing: Pay-per-use ($0.25 per 1000 results typically)
        Uses web scraping of Capitol Trades
        """
        if not self.apify_key:
            print("❌ APIFY_API_KEY not set")
            print("   Get API key from: https://apify.com/")
            print("   Pricing: Pay-per-use (~$0.25/1000 results)")
            return False

        print("📡 Fetching from Apify Capitol Trades Scraper...")
        print("   (This may take 1-2 minutes to complete the scrape)")

        # Start the scraper
        run_url = "https://api.apify.com/v2/acts/saswave~capitol-trades-scraper/runs"

        headers = {"Authorization": f"Bearer {self.apify_key}"}

        # Configure scraper
        payload = {
            "maxItems": 5000,  # Fetch last 5000 trades
            "proxyConfiguration": {"useApifyProxy": True}
        }

        try:
            # Start the run
            response = requests.post(run_url, json=payload, headers=headers, timeout=10)

            if response.status_code != 201:
                print(f"   ❌ Failed to start scraper: {response.status_code}")
                return False

            run_data = response.json()['data']
            run_id = run_data['id']

            print(f"   ⏳ Scraper started (ID: {run_id[:8]}...)")
            print(f"   ⏳ Waiting for completion...")

            # Poll for completion
            status_url = f"https://api.apify.com/v2/acts/saswave~capitol-trades-scraper/runs/{run_id}"

            while True:
                time.sleep(10)
                status_response = requests.get(status_url, headers=headers, timeout=10)
                status = status_response.json()['data']['status']

                if status == 'SUCCEEDED':
                    break
                elif status in ['FAILED', 'ABORTED', 'TIMED-OUT']:
                    print(f"   ❌ Scraper {status.lower()}")
                    return False

                print(f"   ⏳ Status: {status}...")

            # Get results
            dataset_id = status_response.json()['data']['defaultDatasetId']
            results_url = f"https://api.apify.com/v2/datasets/{dataset_id}/items"

            results_response = requests.get(results_url, headers=headers, timeout=30)
            trades = results_response.json()

            print(f"   ✅ Scraped {len(trades)} trades")

            # Process trades
            for trade in trades:
                self._process_apify_trade(trade)

            self.conn.commit()
            print(f"\n✅ Apify import complete: {len(trades)} trades")
            return True

        except Exception as e:
            print(f"   ❌ Error: {str(e)}")
            return False

    def _process_apify_trade(self, trade):
        """Process a single Apify trade record"""
        politician_name = trade.get('politician', '')
        ticker = trade.get('ticker', '')
        transaction_date = trade.get('transactionDate', '')
        transaction_type = trade.get('type', '').lower()
        amount = trade.get('amount', '')

        politician_info = self._parse_politician_name(politician_name)
        politician_id = self._get_or_create_politician(politician_info)
        company_id = self._match_ticker(ticker)

        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO congressional_trades (
                politician_id, company_id, transaction_date, transaction_type,
                ticker, amount_range, source, data_quality
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            politician_id, company_id, transaction_date, transaction_type,
            ticker, amount, 'apify_scraper', 'complete'
        ))

    # ==================== QUIVERQUANT API ====================

    def fetch_quiver(self):
        """
        Fetch from QuiverQuant API (already implemented)

        This uses the existing congressional_trading_fetcher.py
        """
        print("📡 Using QuiverQuant API (best quality)...")
        print("   Redirecting to existing fetcher...")

        # Import and use existing fetcher
        from congressional_trading_fetcher import CongressionalTradingFetcher

        fetcher = CongressionalTradingFetcher(self.db_path)
        return fetcher.fetch_all_data()

    # ==================== HELPER METHODS ====================

    def _parse_politician_name(self, name):
        """Parse politician name to extract chamber and party"""
        import re

        chamber = 'House'
        party = None
        state = None

        if name.startswith('Sen.') or 'Senator' in name:
            chamber = 'Senate'
        elif name.startswith('Rep.') or 'Representative' in name:
            chamber = 'House'

        # Extract (D-CA) format
        match = re.search(r'\(([A-Z])-([A-Z]{2})\)', name)
        if match:
            party_abbr = match.group(1)
            state = match.group(2)
            party = {'D': 'Democratic', 'R': 'Republican', 'I': 'Independent'}.get(party_abbr)
            name = name[:match.start()].strip()

        # Clean prefixes
        name = re.sub(r'^(Rep\.|Sen\.|Representative|Senator)\s*', '', name).strip()

        return {
            'full_name': name,
            'chamber': chamber,
            'party': party,
            'state': state
        }

    def _get_or_create_politician(self, politician_info):
        """Get existing politician or create new entry"""
        cursor = self.conn.cursor()

        result = cursor.execute("""
            SELECT id FROM politicians
            WHERE full_name = ? AND chamber = ?
        """, (politician_info['full_name'], politician_info['chamber'])).fetchone()

        if result:
            return result[0]

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

    def _match_ticker(self, ticker):
        """Match ticker to company in database"""
        if not ticker:
            return None

        cursor = self.conn.cursor()
        result = cursor.execute(
            "SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE",
            (ticker.strip(),)
        ).fetchone()

        return result[0] if result else None


def main():
    parser = argparse.ArgumentParser(description='Auto-fetch congressional trading data')
    parser.add_argument(
        '--source',
        choices=['finnhub', 'fmp', 'apify', 'quiver'],
        required=True,
        help='Data source to use'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=180,
        help='Days of historical data to fetch (default: 180)'
    )

    args = parser.parse_args()

    print('\n' + '='*80)
    print('🤖 CONGRESSIONAL TRADING AUTO-FETCHER')
    print('='*80)

    fetcher = CongressionalAutoFetcher()
    fetcher.connect()

    try:
        if args.source == 'finnhub':
            success = fetcher.fetch_finnhub(days_back=args.days)
        elif args.source == 'fmp':
            success = fetcher.fetch_fmp(days_back=args.days)
        elif args.source == 'apify':
            success = fetcher.fetch_apify()
        elif args.source == 'quiver':
            success = fetcher.fetch_quiver()

        if success:
            # Show summary
            cursor = fetcher.conn.cursor()
            total = cursor.execute("SELECT COUNT(*) FROM congressional_trades").fetchone()[0]
            politicians = cursor.execute("SELECT COUNT(DISTINCT politician_id) FROM congressional_trades").fetchone()[0]

            print('\n' + '='*80)
            print('📊 DATABASE SUMMARY')
            print('='*80)
            print(f"\nTotal Trades: {total}")
            print(f"Politicians: {politicians}")
            print(f"\n✅ Automation complete!")
        else:
            print("\n❌ Automation failed - see errors above")
            sys.exit(1)

    finally:
        fetcher.close()

    print('='*80 + '\n')


if __name__ == '__main__':
    main()
