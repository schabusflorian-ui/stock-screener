#!/usr/bin/env python3
"""
Dividend Data Fetcher - Fetches dividend history and metrics using yfinance
"""

import yfinance as yf
import pandas as pd
import numpy as np
import sqlite3
import argparse
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# PostgreSQL support (optional)
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database path (SQLite fallback)
DB_PATH = Path(__file__).parent.parent / 'data' / 'stocks.db'

# Check for PostgreSQL via environment variable
DATABASE_URL = os.environ.get('DATABASE_URL')


class DividendFetcher:
    """Fetches and stores dividend data"""

    def __init__(self, db_path=None):
        # PostgreSQL takes priority over SQLite path argument
        self.use_postgres = DATABASE_URL is not None and HAS_PSYCOPG2
        self.db_path = db_path or DB_PATH
        if self.use_postgres:
            logger.info("Using PostgreSQL database (DATABASE_URL set)")
        else:
            logger.info(f"Using SQLite database: {self.db_path}")

    def get_connection(self):
        """Get database connection"""
        if self.use_postgres:
            return psycopg2.connect(DATABASE_URL)
        return sqlite3.connect(self.db_path)

    def _sql(self, query):
        """Convert SQLite-style ? placeholders to PostgreSQL %s if needed"""
        if self.use_postgres:
            return query.replace('?', '%s')
        return query

    def get_companies_to_fetch(self, sp500_only=False, limit=None):
        """Get list of companies to fetch dividends for"""
        conn = self.get_connection()

        sql = """
            SELECT id, symbol, name
            FROM companies
            WHERE is_active = 1
        """
        if sp500_only:
            sql += " AND is_sp500 = 1"
        sql += " ORDER BY market_cap DESC NULLS LAST"
        if limit:
            sql += f" LIMIT {limit}"

        df = pd.read_sql(sql, conn)
        conn.close()
        return df

    def fetch_dividend_history(self, symbol, years=10):
        """
        Fetch dividend history for a symbol

        Args:
            symbol: Stock symbol
            years: Years of history to fetch

        Returns:
            DataFrame with dividend history
        """
        try:
            ticker = yf.Ticker(symbol)

            # Use history method with actions=True to get dividends
            end_date = datetime.now()
            start_date = end_date - timedelta(days=years * 365)

            hist = ticker.history(start=start_date, end=end_date, actions=True)

            if hist.empty or 'Dividends' not in hist.columns:
                return None

            # Extract dividends (non-zero values)
            dividends = hist[hist['Dividends'] > 0]['Dividends']

            if dividends.empty:
                return None

            # Convert to DataFrame
            df = dividends.reset_index()
            df.columns = ['ex_date', 'amount']
            df['ex_date'] = pd.to_datetime(df['ex_date']).dt.date

            return df

        except yf.exceptions.YFRateLimitError:
            logger.warning(f"Rate limited while fetching {symbol}")
            raise  # Re-raise to handle at higher level
        except Exception as e:
            logger.debug(f"Error fetching dividends for {symbol}: {e}")
            return None

    def fetch_dividend_info(self, symbol):
        """
        Fetch current dividend info for a symbol

        Returns:
            Dict with dividend metrics
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            return {
                'dividend_rate': info.get('dividendRate'),
                'dividend_yield': info.get('dividendYield'),
                'payout_ratio': info.get('payoutRatio'),
                'ex_dividend_date': info.get('exDividendDate'),
                'five_year_avg_yield': info.get('fiveYearAvgDividendYield'),
                'trailing_annual_dividend_rate': info.get('trailingAnnualDividendRate'),
                'trailing_annual_dividend_yield': info.get('trailingAnnualDividendYield'),
            }

        except Exception as e:
            logger.debug(f"Error fetching dividend info for {symbol}: {e}")
            return None

    def store_dividend_history(self, company_id, df):
        """Store dividend history in database"""
        if df is None or df.empty:
            return 0

        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            inserted = 0
            for _, row in df.iterrows():
                cursor.execute('''
                    INSERT OR IGNORE INTO dividend_history
                    (company_id, ex_date, amount)
                    VALUES (?, ?, ?)
                ''', (company_id, str(row['ex_date']), row['amount']))
                inserted += cursor.rowcount

            conn.commit()
            return inserted

        except Exception as e:
            logger.error(f"Error storing dividend history: {e}")
            conn.rollback()
            return 0
        finally:
            conn.close()

    def calculate_dividend_metrics(self, company_id, current_price=None):
        """
        Calculate dividend metrics for a company based on history

        Args:
            company_id: Company ID
            current_price: Current stock price (optional, will fetch if not provided)
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get dividend history
            cursor.execute('''
                SELECT ex_date, amount
                FROM dividend_history
                WHERE company_id = ?
                ORDER BY ex_date DESC
            ''', (company_id,))

            dividends = cursor.fetchall()

            if not dividends:
                return None

            df = pd.DataFrame(dividends, columns=['ex_date', 'amount'])
            df['ex_date'] = pd.to_datetime(df['ex_date'])

            # Calculate annual dividend (trailing 12 months)
            one_year_ago = datetime.now() - timedelta(days=365)
            recent_divs = df[df['ex_date'] >= one_year_ago]
            annual_dividend = recent_divs['amount'].sum() if not recent_divs.empty else 0

            # Determine frequency
            if len(recent_divs) >= 10:
                frequency = 'monthly'
            elif len(recent_divs) >= 3:
                frequency = 'quarterly'
            elif len(recent_divs) >= 1:
                frequency = 'annual'
            else:
                frequency = None

            # Get current price if not provided
            if current_price is None:
                cursor.execute('''
                    SELECT last_price FROM price_metrics
                    WHERE company_id = ?
                ''', (company_id,))
                result = cursor.fetchone()
                current_price = result[0] if result else None

            # Calculate yield
            dividend_yield = None
            if current_price and current_price > 0 and annual_dividend > 0:
                dividend_yield = (annual_dividend / current_price) * 100

            # Calculate growth rates
            def calc_growth(years):
                """Calculate annualized dividend growth over N years"""
                cutoff = datetime.now() - timedelta(days=years * 365)
                old_divs = df[(df['ex_date'] >= cutoff - timedelta(days=365)) & (df['ex_date'] < cutoff)]

                if old_divs.empty or recent_divs.empty:
                    return None

                old_annual = old_divs['amount'].sum()
                if old_annual <= 0:
                    return None

                # Annualized growth rate
                total_growth = (annual_dividend / old_annual) - 1
                annualized = ((1 + total_growth) ** (1/years)) - 1
                return annualized * 100

            growth_1y = calc_growth(1)
            growth_3y = calc_growth(3)
            growth_5y = calc_growth(5)
            growth_10y = calc_growth(10)

            # Calculate years of consecutive growth
            years_of_growth = self._calc_years_of_growth(df)

            # Dividend aristocrat (25+ years) and king (50+ years)
            is_aristocrat = 1 if years_of_growth and years_of_growth >= 25 else 0
            is_king = 1 if years_of_growth and years_of_growth >= 50 else 0

            # Last increase info
            last_increase_date = None
            last_increase_pct = None
            if len(df) >= 2:
                # Group by year and get annual totals
                df['year'] = df['ex_date'].dt.year
                yearly = df.groupby('year')['amount'].sum().sort_index(ascending=False)

                if len(yearly) >= 2:
                    years_list = yearly.index.tolist()
                    for i in range(len(years_list) - 1):
                        current_year = yearly.iloc[i]
                        prev_year = yearly.iloc[i + 1]
                        if current_year > prev_year:
                            last_increase_pct = ((current_year / prev_year) - 1) * 100
                            last_increase_date = f"{years_list[i]}-01-01"
                            break

            # Get payout ratio from financial data
            cursor.execute('''
                SELECT net_income
                FROM financial_data
                WHERE company_id = ?
                  AND statement_type = 'income_statement'
                  AND period_type = 'annual'
                ORDER BY fiscal_date_ending DESC
                LIMIT 1
            ''', (company_id,))
            result = cursor.fetchone()
            net_income = result[0] if result else None

            # Get shares outstanding from latest balance sheet (stored in JSON data column)
            cursor.execute('''
                SELECT data
                FROM financial_data
                WHERE company_id = ?
                  AND statement_type = 'balance_sheet'
                  AND data IS NOT NULL
                ORDER BY fiscal_date_ending DESC
                LIMIT 1
            ''', (company_id,))
            result = cursor.fetchone()
            shares = None
            if result and result[0]:
                try:
                    data = json.loads(result[0])
                    shares = float(data.get('commonSharesOutstanding') or
                                   data.get('CommonStockSharesOutstanding') or
                                   data.get('sharesOutstanding') or 0)
                    if shares <= 0:
                        shares = None
                except (json.JSONDecodeError, ValueError, TypeError):
                    shares = None

            payout_ratio = None
            if net_income and shares and annual_dividend > 0:
                total_dividends_paid = annual_dividend * shares
                if net_income > 0:
                    payout_ratio = (total_dividends_paid / net_income) * 100

            # Store metrics
            cursor.execute('''
                INSERT OR REPLACE INTO dividend_metrics (
                    company_id,
                    current_annual_dividend,
                    dividend_yield,
                    payout_ratio,
                    dividend_growth_1y,
                    dividend_growth_3y,
                    dividend_growth_5y,
                    dividend_growth_10y,
                    years_of_growth,
                    last_increase_date,
                    last_increase_pct,
                    dividend_frequency,
                    ex_dividend_date,
                    is_dividend_aristocrat,
                    is_dividend_king,
                    last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                company_id,
                annual_dividend,
                dividend_yield,
                payout_ratio,
                growth_1y,
                growth_3y,
                growth_5y,
                growth_10y,
                years_of_growth,
                last_increase_date,
                last_increase_pct,
                frequency,
                str(df.iloc[0]['ex_date'].date()) if not df.empty else None,
                is_aristocrat,
                is_king,
                datetime.now().isoformat()
            ))

            conn.commit()
            return True

        except Exception as e:
            logger.error(f"Error calculating metrics for company {company_id}: {e}")
            conn.rollback()
            return False
        finally:
            conn.close()

    def _calc_years_of_growth(self, df):
        """Calculate consecutive years of dividend growth"""
        if df.empty:
            return 0

        df = df.copy()
        df['year'] = df['ex_date'].dt.year
        yearly = df.groupby('year')['amount'].sum().sort_index(ascending=False)

        if len(yearly) < 2:
            return 0

        years_of_growth = 0
        for i in range(len(yearly) - 1):
            if yearly.iloc[i] > yearly.iloc[i + 1]:
                years_of_growth += 1
            else:
                break

        return years_of_growth

    def fetch_company(self, company_id, symbol, years=10):
        """Fetch and store dividend data for a single company"""
        try:
            # Fetch dividend history
            df = self.fetch_dividend_history(symbol, years)

            if df is not None and not df.empty:
                count = self.store_dividend_history(company_id, df)
                self.calculate_dividend_metrics(company_id)
                return {'symbol': symbol, 'dividends': len(df), 'stored': count}
            else:
                return {'symbol': symbol, 'dividends': 0, 'stored': 0}

        except Exception as e:
            logger.debug(f"Error fetching {symbol}: {e}")
            return {'symbol': symbol, 'dividends': 0, 'stored': 0, 'error': str(e)}

    def fetch_all(self, sp500_only=False, limit=None, workers=5, years=10):
        """
        Fetch dividend data for multiple companies

        Args:
            sp500_only: Only fetch S&P 500 companies
            limit: Limit number of companies
            workers: Number of parallel workers
            years: Years of history to fetch
        """
        companies = self.get_companies_to_fetch(sp500_only, limit)
        total = len(companies)

        logger.info(f"Fetching dividend data for {total} companies...")

        results = {
            'processed': 0,
            'with_dividends': 0,
            'total_dividends': 0,
            'errors': 0
        }

        def process_company(row):
            result = self.fetch_company(row['id'], row['symbol'], years)
            return result

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(process_company, row): row['symbol']
                for _, row in companies.iterrows()
            }

            for i, future in enumerate(as_completed(futures)):
                symbol = futures[future]
                try:
                    result = future.result()
                    results['processed'] += 1

                    if result.get('dividends', 0) > 0:
                        results['with_dividends'] += 1
                        results['total_dividends'] += result['dividends']

                    if 'error' in result:
                        results['errors'] += 1

                    if (i + 1) % 50 == 0:
                        logger.info(f"Progress: {i + 1}/{total} ({results['with_dividends']} with dividends)")

                except Exception as e:
                    results['errors'] += 1
                    logger.debug(f"Error processing {symbol}: {e}")

        logger.info(f"\nComplete!")
        logger.info(f"Processed: {results['processed']}")
        logger.info(f"With dividends: {results['with_dividends']}")
        logger.info(f"Total dividend records: {results['total_dividends']}")
        logger.info(f"Errors: {results['errors']}")

        return results

    def recalculate_all_metrics(self):
        """Recalculate dividend metrics for all companies with dividend history"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT DISTINCT company_id FROM dividend_history
        ''')
        company_ids = [row[0] for row in cursor.fetchall()]
        conn.close()

        logger.info(f"Recalculating metrics for {len(company_ids)} companies...")

        for i, company_id in enumerate(company_ids):
            self.calculate_dividend_metrics(company_id)
            if (i + 1) % 100 == 0:
                logger.info(f"Progress: {i + 1}/{len(company_ids)}")

        logger.info("Complete!")

    def get_dividend_summary(self):
        """Get summary statistics of dividend data"""
        conn = self.get_connection()

        sql = """
        SELECT
            COUNT(DISTINCT dh.company_id) as companies_with_dividends,
            COUNT(*) as total_dividend_records,
            (SELECT COUNT(*) FROM dividend_metrics WHERE dividend_yield IS NOT NULL) as with_yield,
            (SELECT COUNT(*) FROM dividend_metrics WHERE is_dividend_aristocrat = 1) as aristocrats,
            (SELECT COUNT(*) FROM dividend_metrics WHERE is_dividend_king = 1) as kings,
            (SELECT ROUND(AVG(dividend_yield), 2) FROM dividend_metrics WHERE dividend_yield > 0 AND dividend_yield < 20) as avg_yield,
            (SELECT ROUND(AVG(years_of_growth), 1) FROM dividend_metrics WHERE years_of_growth > 0) as avg_growth_years
        FROM dividend_history dh
        """

        result = pd.read_sql(sql, conn)
        conn.close()

        return result.iloc[0].to_dict()


def main():
    parser = argparse.ArgumentParser(description='Fetch dividend data')
    parser.add_argument('command', choices=['fetch', 'sp500', 'metrics', 'summary', 'single'],
                       help='Command to run')
    parser.add_argument('--symbol', '-s', help='Symbol for single fetch')
    parser.add_argument('--limit', '-l', type=int, help='Limit number of companies')
    parser.add_argument('--workers', '-w', type=int, default=5, help='Number of parallel workers')
    parser.add_argument('--years', '-y', type=int, default=10, help='Years of history')
    parser.add_argument('--db', help='Database path')

    args = parser.parse_args()

    fetcher = DividendFetcher(args.db)

    if args.command == 'fetch':
        fetcher.fetch_all(sp500_only=False, limit=args.limit, workers=args.workers, years=args.years)

    elif args.command == 'sp500':
        fetcher.fetch_all(sp500_only=True, workers=args.workers, years=args.years)

    elif args.command == 'metrics':
        fetcher.recalculate_all_metrics()

    elif args.command == 'summary':
        summary = fetcher.get_dividend_summary()
        print("\nDividend Data Summary:")
        print("-" * 40)
        for key, value in summary.items():
            print(f"  {key}: {value}")

    elif args.command == 'single':
        if not args.symbol:
            print("Error: --symbol required for single fetch")
            return

        conn = fetcher.get_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM companies WHERE symbol = ?', (args.symbol,))
        result = cursor.fetchone()
        conn.close()

        if not result:
            print(f"Error: Company {args.symbol} not found")
            return

        company_id = result[0]
        result = fetcher.fetch_company(company_id, args.symbol, args.years)
        print(f"\nResult for {args.symbol}:")
        print(f"  Dividend records: {result.get('dividends', 0)}")
        print(f"  Stored: {result.get('stored', 0)}")


if __name__ == '__main__':
    main()
