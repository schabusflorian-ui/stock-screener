#!/usr/bin/env python3
"""
Index Data Fetcher - Fetches market index data using yfinance
Supports S&P 500, Dow Jones, NASDAQ Composite, and Russell 2000
"""

import yfinance as yf
import pandas as pd
import numpy as np
import sqlite3
import argparse
from datetime import datetime, timedelta
from pathlib import Path
import logging
import sys
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database path
DB_PATH = Path(__file__).parent.parent / 'data' / 'stocks.db'

# Core indices to track
CORE_INDICES = {
    '^GSPC': 'S&P 500',
    '^DJI': 'Dow Jones Industrial Average',
    '^IXIC': 'NASDAQ Composite',
    '^RUT': 'Russell 2000'
}


class IndexFetcher:
    """Fetches and stores market index data"""

    def __init__(self, db_path=None):
        self.db_path = db_path or DB_PATH

    def get_connection(self):
        """Get database connection"""
        return sqlite3.connect(self.db_path)

    def fetch_historical(self, symbol, years=10):
        """
        Fetch historical price data for an index

        Args:
            symbol: Index symbol (e.g., '^GSPC')
            years: Number of years of history to fetch

        Returns:
            DataFrame with OHLCV data
        """
        logger.info(f"Fetching {years} years of historical data for {symbol}")

        end_date = datetime.now()
        start_date = end_date - timedelta(days=years * 365)

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(start=start_date, end=end_date, auto_adjust=True)

            if df.empty:
                logger.warning(f"No data returned for {symbol}")
                return None

            # Reset index to get date as column
            df = df.reset_index()
            df['Date'] = pd.to_datetime(df['Date']).dt.date

            # Rename columns to match our schema
            df = df.rename(columns={
                'Date': 'date',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume'
            })

            # Select only needed columns
            df = df[['date', 'open', 'high', 'low', 'close', 'volume']]

            logger.info(f"Retrieved {len(df)} days of data for {symbol}")
            return df

        except Exception as e:
            logger.error(f"Error fetching data for {symbol}: {e}")
            return None

    def store_prices(self, symbol, df):
        """
        Store price data in database

        Args:
            symbol: Index symbol
            df: DataFrame with price data
        """
        if df is None or df.empty:
            return 0

        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get index_id for this symbol
            cursor.execute('SELECT id FROM market_indices WHERE symbol = ?', (symbol,))
            result = cursor.fetchone()

            if not result:
                logger.error(f"Index {symbol} not found in market_indices table")
                return 0

            index_id = result[0]

            # Insert or replace prices
            inserted = 0
            for _, row in df.iterrows():
                cursor.execute('''
                    INSERT OR REPLACE INTO market_index_prices
                    (index_id, date, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    index_id,
                    str(row['date']),
                    row['open'],
                    row['high'],
                    row['low'],
                    row['close'],
                    int(row['volume']) if pd.notna(row['volume']) else None
                ))
                inserted += 1

            conn.commit()
            logger.info(f"Stored {inserted} price records for {symbol}")
            return inserted

        except Exception as e:
            logger.error(f"Error storing prices for {symbol}: {e}")
            conn.rollback()
            return 0
        finally:
            conn.close()

    def calculate_metrics(self, symbol):
        """
        Calculate and store metrics for an index

        Args:
            symbol: Index symbol
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # Get index_id
            cursor.execute('SELECT id FROM market_indices WHERE symbol = ?', (symbol,))
            result = cursor.fetchone()
            if not result:
                logger.error(f"Index {symbol} not found")
                return

            index_id = result[0]

            # Get price data
            cursor.execute('''
                SELECT date, close FROM market_index_prices
                WHERE index_id = ?
                ORDER BY date DESC
            ''', (index_id,))

            rows = cursor.fetchall()
            if len(rows) < 2:
                logger.warning(f"Not enough data for {symbol} to calculate metrics")
                return

            # Convert to DataFrame for easier calculations
            df = pd.DataFrame(rows, columns=['date', 'close'])
            df['date'] = pd.to_datetime(df['date'])
            df = df.sort_values('date', ascending=False)

            # Current values
            last_price = df.iloc[0]['close']
            last_date = df.iloc[0]['date'].strftime('%Y-%m-%d')
            previous_close = df.iloc[1]['close'] if len(df) > 1 else None

            # 52-week high/low (approximately 252 trading days)
            df_52w = df.head(252)
            high_52w = df_52w['close'].max()
            low_52w = df_52w['close'].min()
            pct_from_52w_high = ((last_price - high_52w) / high_52w) * 100 if high_52w else None
            pct_from_52w_low = ((last_price - low_52w) / low_52w) * 100 if low_52w else None

            # Price changes
            def get_change(days):
                """Calculate price change over N days"""
                if len(df) > days:
                    old_price = df.iloc[days]['close']
                    return ((last_price - old_price) / old_price) * 100
                return None

            change_1d = ((last_price - previous_close) / previous_close) * 100 if previous_close else None
            change_1d_abs = last_price - previous_close if previous_close else None
            change_1w = get_change(5)
            change_1m = get_change(21)
            change_3m = get_change(63)
            change_6m = get_change(126)
            change_1y = get_change(252)

            # YTD change
            year_start = datetime(datetime.now().year, 1, 1)
            df_ytd = df[df['date'] >= year_start]
            if len(df_ytd) > 0:
                # Find the first trading day of the year
                first_day_price = df_ytd.iloc[-1]['close']
                change_ytd = ((last_price - first_day_price) / first_day_price) * 100
            else:
                change_ytd = None

            # Moving averages
            df_sorted = df.sort_values('date', ascending=True)
            closes = df_sorted['close'].values

            sma_50 = np.mean(closes[-50:]) if len(closes) >= 50 else None
            sma_200 = np.mean(closes[-200:]) if len(closes) >= 200 else None

            price_vs_sma_50 = ((last_price - sma_50) / sma_50) * 100 if sma_50 else None
            price_vs_sma_200 = ((last_price - sma_200) / sma_200) * 100 if sma_200 else None

            # RSI (14-day)
            rsi_14 = self._calculate_rsi(closes, 14) if len(closes) >= 15 else None

            # Volatility (20-day annualized)
            if len(closes) >= 21:
                returns = np.diff(closes[-21:]) / closes[-21:-1]
                volatility_20d = np.std(returns) * np.sqrt(252) * 100  # Annualized %
            else:
                volatility_20d = None

            # Store metrics
            cursor.execute('''
                INSERT OR REPLACE INTO market_index_metrics (
                    index_id, last_price, last_price_date, previous_close,
                    high_52w, low_52w, pct_from_52w_high, pct_from_52w_low,
                    change_1d, change_1d_pct, change_1w, change_1m,
                    change_3m, change_6m, change_ytd, change_1y,
                    sma_50, sma_200, price_vs_sma_50, price_vs_sma_200,
                    rsi_14, volatility_20d, calculated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                index_id, last_price, last_date, previous_close,
                high_52w, low_52w, pct_from_52w_high, pct_from_52w_low,
                change_1d_abs, change_1d, change_1w, change_1m,
                change_3m, change_6m, change_ytd, change_1y,
                sma_50, sma_200, price_vs_sma_50, price_vs_sma_200,
                rsi_14, volatility_20d, datetime.now().isoformat()
            ))

            conn.commit()
            logger.info(f"Calculated and stored metrics for {symbol}")

        except Exception as e:
            logger.error(f"Error calculating metrics for {symbol}: {e}")
            conn.rollback()
        finally:
            conn.close()

    def _calculate_rsi(self, prices, period=14):
        """Calculate RSI indicator"""
        if len(prices) < period + 1:
            return None

        # Get the most recent prices needed for RSI
        recent_prices = prices[-(period + 1):]
        deltas = np.diff(recent_prices)

        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        avg_gain = np.mean(gains)
        avg_loss = np.mean(losses)

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))

        return round(rsi, 2)

    def fetch_daily_update(self, symbol):
        """
        Fetch latest daily data for an index

        Args:
            symbol: Index symbol
        """
        logger.info(f"Fetching daily update for {symbol}")

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period='5d', auto_adjust=True)

            if df.empty:
                logger.warning(f"No daily data for {symbol}")
                return None

            # Process data
            df = df.reset_index()
            df['Date'] = pd.to_datetime(df['Date']).dt.date
            df = df.rename(columns={
                'Date': 'date',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume'
            })
            df = df[['date', 'open', 'high', 'low', 'close', 'volume']]

            return df

        except Exception as e:
            logger.error(f"Error fetching daily data for {symbol}: {e}")
            return None

    def fetch_all_historical(self, years=10):
        """Fetch historical data for all core indices"""
        results = {}
        for symbol, name in CORE_INDICES.items():
            logger.info(f"\n{'='*50}")
            logger.info(f"Processing {name} ({symbol})")
            logger.info(f"{'='*50}")

            df = self.fetch_historical(symbol, years)
            if df is not None:
                count = self.store_prices(symbol, df)
                results[symbol] = count
            else:
                results[symbol] = 0

            # Be nice to the API
            time.sleep(1)

        return results

    def update_all_metrics(self):
        """Calculate metrics for all indices"""
        for symbol in CORE_INDICES:
            self.calculate_metrics(symbol)
            time.sleep(0.5)


class SP500Constituents:
    """Manage S&P 500 constituents data"""

    def __init__(self, db_path=None):
        self.db_path = db_path or DB_PATH

    def get_connection(self):
        return sqlite3.connect(self.db_path)

    def fetch_constituents(self):
        """
        Fetch current S&P 500 constituents from Wikipedia

        Returns:
            DataFrame with constituent data
        """
        logger.info("Fetching S&P 500 constituents from Wikipedia")

        try:
            import urllib.request
            url = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies'

            # Add headers to avoid 403 error
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}
            )
            html = urllib.request.urlopen(req).read()
            tables = pd.read_html(html)

            if not tables:
                logger.error("No tables found on Wikipedia page")
                return None

            df = tables[0]

            # Standardize column names
            df = df.rename(columns={
                'Symbol': 'symbol',
                'Security': 'company_name',
                'GICS Sector': 'sector',
                'GICS Sub-Industry': 'industry',
                'CIK': 'cik'
            })

            logger.info(f"Found {len(df)} S&P 500 constituents")
            return df

        except Exception as e:
            logger.error(f"Error fetching S&P 500 constituents: {e}")
            return None

    def update_sp500_membership(self):
        """
        Update the is_sp500 flag in companies table
        """
        df = self.fetch_constituents()
        if df is None:
            return

        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            # First, check if is_sp500 column exists
            cursor.execute("PRAGMA table_info(companies)")
            columns = [row[1] for row in cursor.fetchall()]

            if 'is_sp500' not in columns:
                logger.info("Adding is_sp500 column to companies table")
                cursor.execute('ALTER TABLE companies ADD COLUMN is_sp500 INTEGER DEFAULT 0')

            # Reset all to 0
            cursor.execute('UPDATE companies SET is_sp500 = 0')

            # Set is_sp500 = 1 for constituents
            symbols = df['symbol'].tolist()
            # Handle symbols with periods (BRK.B -> BRK-B format if needed)
            updated = 0

            for symbol in symbols:
                # Try exact match first
                cursor.execute(
                    'UPDATE companies SET is_sp500 = 1 WHERE symbol = ?',
                    (symbol,)
                )
                if cursor.rowcount > 0:
                    updated += 1
                else:
                    # Try with hyphen instead of period
                    alt_symbol = symbol.replace('.', '-')
                    cursor.execute(
                        'UPDATE companies SET is_sp500 = 1 WHERE symbol = ?',
                        (alt_symbol,)
                    )
                    if cursor.rowcount > 0:
                        updated += 1

            conn.commit()
            logger.info(f"Updated {updated} companies as S&P 500 members")

            # Log companies not found
            cursor.execute('SELECT COUNT(*) FROM companies WHERE is_sp500 = 1')
            actual_count = cursor.fetchone()[0]
            logger.info(f"Total S&P 500 companies in database: {actual_count}")

        except Exception as e:
            logger.error(f"Error updating S&P 500 membership: {e}")
            conn.rollback()
        finally:
            conn.close()


def main():
    parser = argparse.ArgumentParser(description='Fetch market index data')
    parser.add_argument('command', choices=['historical', 'daily', 'metrics', 'sp500', 'all'],
                       help='Command to run')
    parser.add_argument('--symbol', '-s', help='Specific index symbol (e.g., ^GSPC)')
    parser.add_argument('--years', '-y', type=int, default=10,
                       help='Years of historical data to fetch (default: 10)')
    parser.add_argument('--db', help='Database path')

    args = parser.parse_args()

    fetcher = IndexFetcher(args.db)

    if args.command == 'historical':
        if args.symbol:
            df = fetcher.fetch_historical(args.symbol, args.years)
            if df is not None:
                fetcher.store_prices(args.symbol, df)
        else:
            fetcher.fetch_all_historical(args.years)

    elif args.command == 'daily':
        symbols = [args.symbol] if args.symbol else CORE_INDICES.keys()
        for symbol in symbols:
            df = fetcher.fetch_daily_update(symbol)
            if df is not None:
                fetcher.store_prices(symbol, df)
            time.sleep(0.5)

    elif args.command == 'metrics':
        if args.symbol:
            fetcher.calculate_metrics(args.symbol)
        else:
            fetcher.update_all_metrics()

    elif args.command == 'sp500':
        sp500 = SP500Constituents(args.db)
        sp500.update_sp500_membership()

    elif args.command == 'all':
        logger.info("Running full index data update...")

        # Fetch historical data
        logger.info("\n=== Fetching Historical Data ===")
        fetcher.fetch_all_historical(args.years)

        # Calculate metrics
        logger.info("\n=== Calculating Metrics ===")
        fetcher.update_all_metrics()

        # Update S&P 500 membership
        logger.info("\n=== Updating S&P 500 Constituents ===")
        sp500 = SP500Constituents(args.db)
        sp500.update_sp500_membership()

        logger.info("\n=== Complete ===")


if __name__ == '__main__':
    main()
