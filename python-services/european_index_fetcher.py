#!/usr/bin/env python3
"""
European Index Constituents Fetcher
Fetches constituents for FTSE 100, DAX 40, CAC 40, and other European indices
from Wikipedia and populates the database.

Usage:
    python european_index_fetcher.py ftse      # Fetch FTSE 100 only
    python european_index_fetcher.py dax       # Fetch DAX 40 only
    python european_index_fetcher.py cac       # Fetch CAC 40 only
    python european_index_fetcher.py all       # Fetch all European indices
    python european_index_fetcher.py --list    # List available indices
"""

import sqlite3
import pandas as pd
import argparse
import logging
from pathlib import Path
from datetime import datetime
import time
import urllib.request

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database path
DB_PATH = Path(__file__).parent.parent / 'data' / 'stocks.db'

# European index definitions
EUROPEAN_INDICES = {
    'FTSE': {
        'code': 'FTSE',
        'name': 'FTSE 100',
        'country': 'GB',
        'wiki_url': 'https://en.wikipedia.org/wiki/FTSE_100_Index',
        'yahoo_suffix': '.L',
        'flag_column': 'is_ftse',
        'expected_count': 100
    },
    'DAX': {
        'code': 'DAX',
        'name': 'DAX 40',
        'country': 'DE',
        'wiki_url': 'https://en.wikipedia.org/wiki/DAX',
        'yahoo_suffix': '.DE',
        'flag_column': 'is_dax',
        'expected_count': 40
    },
    'CAC': {
        'code': 'CAC',
        'name': 'CAC 40',
        'country': 'FR',
        'wiki_url': 'https://en.wikipedia.org/wiki/CAC_40',
        'yahoo_suffix': '.PA',
        'flag_column': 'is_cac',
        'expected_count': 40
    },
    'AEX': {
        'code': 'AEX',
        'name': 'AEX',
        'country': 'NL',
        'wiki_url': 'https://en.wikipedia.org/wiki/AEX_index',
        'yahoo_suffix': '.AS',
        'flag_column': 'is_aex',
        'expected_count': 25
    },
    'SMI': {
        'code': 'SMI',
        'name': 'SMI',
        'country': 'CH',
        'wiki_url': 'https://en.wikipedia.org/wiki/Swiss_Market_Index',
        'yahoo_suffix': '.SW',
        'flag_column': 'is_smi',
        'expected_count': 20
    },
    'IBEX': {
        'code': 'IBEX',
        'name': 'IBEX 35',
        'country': 'ES',
        'wiki_url': 'https://en.wikipedia.org/wiki/IBEX_35',
        'yahoo_suffix': '.MC',
        'flag_column': 'is_ibex',
        'expected_count': 35
    },
    'FTSEMIB': {
        'code': 'FTSEMIB',
        'name': 'FTSE MIB',
        'country': 'IT',
        'wiki_url': 'https://en.wikipedia.org/wiki/FTSE_MIB',
        'yahoo_suffix': '.MI',
        'flag_column': 'is_ftsemib',
        'expected_count': 40
    },
    'OMX30': {
        'code': 'OMX30',
        'name': 'OMX Stockholm 30',
        'country': 'SE',
        'wiki_url': 'https://en.wikipedia.org/wiki/OMX_Stockholm_30',
        'yahoo_suffix': '.ST',
        'flag_column': 'is_omx30',
        'expected_count': 30
    },
    'SX5E': {
        'code': 'SX5E',
        'name': 'Euro Stoxx 50',
        'country': 'EU',
        'wiki_url': 'https://en.wikipedia.org/wiki/EURO_STOXX_50',
        'yahoo_suffix': None,  # Mixed exchanges
        'flag_column': 'is_eurostoxx50',
        'expected_count': 50
    },
    'ATX': {
        'code': 'ATX',
        'name': 'ATX',
        'country': 'AT',
        'wiki_url': 'https://en.wikipedia.org/wiki/Austrian_Traded_Index',
        'yahoo_suffix': '.VI',
        'flag_column': 'is_atx',
        'expected_count': 20
    }
}


class EuropeanIndexFetcher:
    """Fetches European index constituents from Wikipedia"""

    def __init__(self, db_path=None):
        self.db_path = db_path or DB_PATH
        self.headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}

    def get_connection(self):
        """Get database connection"""
        return sqlite3.connect(self.db_path)

    def _fetch_html(self, url):
        """Fetch HTML from URL"""
        req = urllib.request.Request(url, headers=self.headers)
        return urllib.request.urlopen(req).read()

    def _find_constituents_table(self, tables, expected_count, ticker_columns=None):
        """
        Find the table containing index constituents

        Args:
            tables: List of DataFrames from pd.read_html
            expected_count: Expected number of constituents
            ticker_columns: List of possible column names for ticker
        """
        if ticker_columns is None:
            ticker_columns = ['Ticker', 'Symbol', 'ticker', 'symbol', 'Code', 'Ticker symbol',
                              'Stock symbol', 'Bloomberg ticker']

        for table in tables:
            # Check if any ticker column exists
            cols = [str(c).lower() for c in table.columns]

            has_ticker = any(tc.lower() in cols for tc in ticker_columns)

            # Also check for company name columns
            name_columns = ['company', 'name', 'security', 'constituent']
            has_name = any(nc in cols for nc in name_columns)

            # Table should have reasonable row count
            reasonable_count = len(table) >= expected_count * 0.8 and len(table) <= expected_count * 1.5

            if (has_ticker or has_name) and reasonable_count:
                return table

        return None

    def _standardize_columns(self, df):
        """Standardize column names across different Wikipedia formats"""
        column_mapping = {
            'ticker': ['Ticker', 'Symbol', 'ticker', 'symbol', 'Code', 'Ticker symbol',
                       'Stock symbol', 'Bloomberg ticker', 'Ticker[1]'],
            'company': ['Company', 'Name', 'Security', 'Constituent', 'company', 'name',
                        'Company name', 'Corporation'],
            'sector': ['Sector', 'GICS sector', 'Industry', 'ICB Sector', 'sector'],
            'isin': ['ISIN', 'isin'],
        }

        for standard_name, variations in column_mapping.items():
            for var in variations:
                if var in df.columns:
                    df = df.rename(columns={var: standard_name})
                    break

        return df

    def fetch_ftse100(self):
        """Fetch FTSE 100 constituents"""
        logger.info("Fetching FTSE 100 constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['FTSE']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 100)
            if df is None:
                logger.error("Could not find FTSE 100 constituents table")
                return None

            df = self._standardize_columns(df)

            # FTSE 100 tickers need .L suffix for Yahoo
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.L" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} FTSE 100 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching FTSE 100: {e}")
            return None

    def fetch_dax40(self):
        """Fetch DAX 40 constituents"""
        logger.info("Fetching DAX 40 constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['DAX']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 40)
            if df is None:
                logger.error("Could not find DAX 40 constituents table")
                return None

            df = self._standardize_columns(df)

            # DAX tickers need .DE suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.DE" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} DAX 40 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching DAX 40: {e}")
            return None

    def fetch_cac40(self):
        """Fetch CAC 40 constituents"""
        logger.info("Fetching CAC 40 constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['CAC']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 40)
            if df is None:
                logger.error("Could not find CAC 40 constituents table")
                return None

            df = self._standardize_columns(df)

            # CAC tickers need .PA suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.PA" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} CAC 40 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching CAC 40: {e}")
            return None

    def fetch_eurostoxx50(self):
        """Fetch Euro Stoxx 50 constituents"""
        logger.info("Fetching Euro Stoxx 50 constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['SX5E']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 50)
            if df is None:
                logger.error("Could not find Euro Stoxx 50 constituents table")
                return None

            df = self._standardize_columns(df)

            # Euro Stoxx 50 has mixed exchanges, need country info to determine suffix
            # We'll set yahoo_symbol later based on country/exchange

            logger.info(f"Found {len(df)} Euro Stoxx 50 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching Euro Stoxx 50: {e}")
            return None

    def fetch_aex(self):
        """Fetch AEX constituents (Netherlands)"""
        logger.info("Fetching AEX constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['AEX']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 25)
            if df is None:
                logger.error("Could not find AEX constituents table")
                return None

            df = self._standardize_columns(df)

            # AEX tickers need .AS suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.AS" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} AEX constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching AEX: {e}")
            return None

    def fetch_smi(self):
        """Fetch SMI constituents (Switzerland)"""
        logger.info("Fetching SMI constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['SMI']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 20)
            if df is None:
                logger.error("Could not find SMI constituents table")
                return None

            df = self._standardize_columns(df)

            # SMI tickers need .SW suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.SW" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} SMI constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching SMI: {e}")
            return None

    def fetch_ibex(self):
        """Fetch IBEX 35 constituents (Spain)"""
        logger.info("Fetching IBEX 35 constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['IBEX']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 35)
            if df is None:
                logger.error("Could not find IBEX 35 constituents table")
                return None

            df = self._standardize_columns(df)

            # IBEX tickers need .MC suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.MC" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} IBEX 35 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching IBEX 35: {e}")
            return None

    def fetch_ftsemib(self):
        """Fetch FTSE MIB constituents (Italy)"""
        logger.info("Fetching FTSE MIB constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['FTSEMIB']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 40)
            if df is None:
                logger.error("Could not find FTSE MIB constituents table")
                return None

            df = self._standardize_columns(df)

            # FTSE MIB tickers need .MI suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.MI" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} FTSE MIB constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching FTSE MIB: {e}")
            return None

    def fetch_omx30(self):
        """Fetch OMX Stockholm 30 constituents (Sweden)"""
        logger.info("Fetching OMX Stockholm 30 constituents from Wikipedia...")

        try:
            html = self._fetch_html(EUROPEAN_INDICES['OMX30']['wiki_url'])
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 30)
            if df is None:
                logger.error("Could not find OMX Stockholm 30 constituents table")
                return None

            df = self._standardize_columns(df)

            # OMX30 tickers need .ST suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.ST" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} OMX Stockholm 30 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching OMX Stockholm 30: {e}")
            return None

    def fetch_atx(self):
        """Fetch ATX constituents (Austria)"""
        logger.info("Fetching ATX constituents from Wikipedia...")

        try:
            # ATX Wikipedia page
            wiki_url = 'https://en.wikipedia.org/wiki/Austrian_Traded_Index'
            html = self._fetch_html(wiki_url)
            tables = pd.read_html(html)

            df = self._find_constituents_table(tables, 20)
            if df is None:
                logger.error("Could not find ATX constituents table")
                return None

            df = self._standardize_columns(df)

            # ATX tickers need .VI suffix
            if 'ticker' in df.columns:
                df['yahoo_symbol'] = df['ticker'].apply(
                    lambda x: f"{str(x).strip()}.VI" if pd.notna(x) else None
                )

            logger.info(f"Found {len(df)} ATX constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching ATX: {e}")
            return None

    def ensure_index_flags_exist(self):
        """Ensure index flag columns exist in companies table"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get existing columns
            cursor.execute("PRAGMA table_info(companies)")
            existing_columns = {row[1] for row in cursor.fetchall()}

            # Add missing flag columns
            flag_columns = [
                'is_ftse', 'is_dax', 'is_cac', 'is_aex', 'is_smi',
                'is_ibex', 'is_ftsemib', 'is_omx30', 'is_eurostoxx50', 'is_atx'
            ]

            for flag in flag_columns:
                if flag not in existing_columns:
                    logger.info(f"Adding column {flag} to companies table")
                    cursor.execute(f"ALTER TABLE companies ADD COLUMN {flag} INTEGER DEFAULT 0")

            conn.commit()
            logger.info("Index flag columns verified")

        except Exception as e:
            logger.error(f"Error ensuring index flags: {e}")
            conn.rollback()
        finally:
            conn.close()

    def update_index_membership(self, index_code, constituents_df):
        """
        Update index membership flags for companies

        Args:
            index_code: Index code (e.g., 'FTSE', 'DAX')
            constituents_df: DataFrame with constituents
        """
        if constituents_df is None or constituents_df.empty:
            return 0

        index_info = EUROPEAN_INDICES.get(index_code)
        if not index_info:
            logger.error(f"Unknown index: {index_code}")
            return 0

        flag_column = index_info['flag_column']
        yahoo_suffix = index_info['yahoo_suffix']

        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Reset all flags for this index
            cursor.execute(f"UPDATE companies SET {flag_column} = 0")

            updated = 0
            not_found = []

            for _, row in constituents_df.iterrows():
                ticker = None
                yahoo_symbol = None
                company_name = None

                # Get ticker
                if 'ticker' in row and pd.notna(row['ticker']):
                    ticker = str(row['ticker']).strip().upper()

                # Get yahoo symbol
                if 'yahoo_symbol' in row and pd.notna(row['yahoo_symbol']):
                    yahoo_symbol = str(row['yahoo_symbol']).strip().upper()
                elif ticker and yahoo_suffix:
                    yahoo_symbol = f"{ticker}{yahoo_suffix}"

                # Get company name for fallback
                if 'company' in row and pd.notna(row['company']):
                    company_name = str(row['company']).strip()

                # Try to find company in database
                found = False

                # Method 1: Match by symbol (with or without suffix)
                if ticker:
                    # Try exact ticker match
                    cursor.execute(
                        f"UPDATE companies SET {flag_column} = 1 WHERE UPPER(symbol) = ?",
                        (ticker,)
                    )
                    if cursor.rowcount > 0:
                        found = True
                        updated += cursor.rowcount
                    else:
                        # Try with suffix
                        if yahoo_symbol:
                            cursor.execute(
                                f"UPDATE companies SET {flag_column} = 1 WHERE UPPER(symbol) = ?",
                                (yahoo_symbol,)
                            )
                            if cursor.rowcount > 0:
                                found = True
                                updated += cursor.rowcount

                # Method 2: Match by company_identifiers table
                if not found and ticker:
                    cursor.execute("""
                        SELECT ci.company_id FROM company_identifiers ci
                        WHERE UPPER(ci.ticker) = ? OR UPPER(ci.yahoo_symbol) = ?
                    """, (ticker, yahoo_symbol or ticker))
                    result = cursor.fetchone()
                    if result:
                        cursor.execute(
                            f"UPDATE companies SET {flag_column} = 1 WHERE id = ?",
                            (result[0],)
                        )
                        if cursor.rowcount > 0:
                            found = True
                            updated += 1

                # Method 3: Fuzzy match by company name
                if not found and company_name:
                    # Try partial name match
                    search_name = company_name.split()[0] if company_name else ''
                    if len(search_name) >= 3:
                        cursor.execute(f"""
                            UPDATE companies SET {flag_column} = 1
                            WHERE country = ? AND name LIKE ?
                            AND {flag_column} = 0
                            LIMIT 1
                        """, (index_info['country'], f"%{search_name}%"))
                        if cursor.rowcount > 0:
                            found = True
                            updated += 1

                if not found:
                    not_found.append(ticker or company_name or 'Unknown')

            conn.commit()

            if not_found:
                logger.warning(f"Could not find {len(not_found)} companies: {not_found[:10]}...")

            logger.info(f"Updated {updated} companies as {index_info['name']} members")
            return updated

        except Exception as e:
            logger.error(f"Error updating {index_code} membership: {e}")
            conn.rollback()
            return 0
        finally:
            conn.close()

    def populate_index_constituents(self, index_code, constituents_df):
        """
        Populate index_constituents table

        Args:
            index_code: Index code (e.g., 'FTSE', 'DAX')
            constituents_df: DataFrame with constituents
        """
        if constituents_df is None or constituents_df.empty:
            return 0

        index_info = EUROPEAN_INDICES.get(index_code)
        if not index_info:
            return 0

        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get or create index in stock_indexes table
            cursor.execute('SELECT id FROM stock_indexes WHERE code = ?', (index_code,))
            result = cursor.fetchone()

            if not result:
                cursor.execute('''
                    INSERT INTO stock_indexes (code, name, country, description)
                    VALUES (?, ?, ?, ?)
                ''', (index_code, index_info['name'], index_info['country'],
                      f"{index_info['name']} - {index_info['country']} blue-chip index"))
                index_id = cursor.lastrowid
            else:
                index_id = result[0]

            # Clear existing constituents
            cursor.execute('DELETE FROM index_constituents WHERE index_id = ?', (index_id,))

            # Add constituents
            added = 0
            flag_column = index_info['flag_column']

            cursor.execute(f'SELECT id, symbol FROM companies WHERE {flag_column} = 1')
            member_companies = cursor.fetchall()

            for company_id, symbol in member_companies:
                cursor.execute('''
                    INSERT INTO index_constituents (index_id, company_id, weight, added_at)
                    VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
                ''', (index_id, company_id))
                added += 1

            conn.commit()
            logger.info(f"Added {added} constituents to {index_code} index")
            return added

        except Exception as e:
            logger.error(f"Error populating {index_code} constituents: {e}")
            conn.rollback()
            return 0
        finally:
            conn.close()

    def fetch_and_populate(self, index_code):
        """
        Fetch constituents and populate database for an index

        Args:
            index_code: Index code (e.g., 'FTSE', 'DAX', 'CAC')
        """
        index_code = index_code.upper()

        # Fetch methods for each index
        fetch_methods = {
            'FTSE': self.fetch_ftse100,
            'DAX': self.fetch_dax40,
            'CAC': self.fetch_cac40,
            'SX5E': self.fetch_eurostoxx50,
            'AEX': self.fetch_aex,
            'SMI': self.fetch_smi,
            'IBEX': self.fetch_ibex,
            'FTSEMIB': self.fetch_ftsemib,
            'OMX30': self.fetch_omx30,
            'ATX': self.fetch_atx,
        }

        if index_code not in fetch_methods:
            logger.error(f"No fetch method for index: {index_code}")
            return

        # Ensure flag columns exist
        self.ensure_index_flags_exist()

        # Fetch constituents
        df = fetch_methods[index_code]()

        if df is not None and not df.empty:
            # Update membership flags
            self.update_index_membership(index_code, df)

            # Populate index_constituents table
            self.populate_index_constituents(index_code, df)

    def fetch_all(self):
        """Fetch all major European indices"""
        all_indices = ['FTSE', 'DAX', 'CAC', 'SX5E', 'AEX', 'SMI', 'IBEX', 'FTSEMIB', 'OMX30', 'ATX']
        for index_code in all_indices:
            logger.info(f"\n{'='*50}")
            logger.info(f"Processing {index_code}")
            logger.info(f"{'='*50}")

            self.fetch_and_populate(index_code)
            time.sleep(2)  # Be nice to Wikipedia

    def get_stats(self):
        """Get statistics about European index membership"""
        conn = self.get_connection()
        cursor = conn.cursor()

        stats = {}

        try:
            for code, info in EUROPEAN_INDICES.items():
                flag = info['flag_column']

                # Check if column exists
                cursor.execute("PRAGMA table_info(companies)")
                columns = {row[1] for row in cursor.fetchall()}

                if flag in columns:
                    cursor.execute(f"SELECT COUNT(*) FROM companies WHERE {flag} = 1")
                    count = cursor.fetchone()[0]
                    stats[code] = {
                        'name': info['name'],
                        'country': info['country'],
                        'expected': info['expected_count'],
                        'actual': count
                    }

            return stats

        finally:
            conn.close()


def main():
    parser = argparse.ArgumentParser(description='Fetch European index constituents')
    parser.add_argument('command', nargs='?', default='all',
                        choices=['ftse', 'dax', 'cac', 'eurostoxx', 'all', 'stats'],
                        help='Index to fetch or "all" for all indices')
    parser.add_argument('--db', help='Database path')
    parser.add_argument('--list', action='store_true', help='List available indices')

    args = parser.parse_args()

    if args.list:
        print("\nAvailable European Indices:")
        print("-" * 50)
        for code, info in EUROPEAN_INDICES.items():
            print(f"  {code:10} - {info['name']:20} ({info['country']})")
        return

    fetcher = EuropeanIndexFetcher(args.db)

    if args.command == 'stats':
        stats = fetcher.get_stats()
        print("\nEuropean Index Membership Statistics:")
        print("-" * 50)
        for code, data in stats.items():
            print(f"  {data['name']:20} - {data['actual']:3}/{data['expected']} companies ({data['country']})")
        return

    if args.command == 'all':
        fetcher.fetch_all()
    elif args.command == 'ftse':
        fetcher.fetch_and_populate('FTSE')
    elif args.command == 'dax':
        fetcher.fetch_and_populate('DAX')
    elif args.command == 'cac':
        fetcher.fetch_and_populate('CAC')
    elif args.command == 'eurostoxx':
        fetcher.fetch_and_populate('SX5E')


if __name__ == '__main__':
    main()
