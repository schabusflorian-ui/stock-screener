"""
Stock Price Fetcher Service
Uses yfinance to download historical stock prices
Optimized for 10,000+ companies with batch downloads
"""

import yfinance as yf
import pandas as pd
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import time
import logging
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db_adapter import DatabaseAdapter

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
START_DATE = "2009-01-01"  # Data from 2009 onwards
BATCH_SIZE = 50            # Tickers per yfinance batch call
DELAY_BETWEEN_BATCHES = 2  # Seconds between batch downloads


class PriceFetcher:
    def __init__(self, db_adapter: DatabaseAdapter):
        self.db = db_adapter

    def fetch_batch_prices(
        self,
        symbols: List[str],
        start_date: str = START_DATE
    ) -> Dict[str, pd.DataFrame]:
        """
        Fetch historical prices for multiple symbols in one API call.
        Much more efficient than individual calls for 10k+ companies.
        """
        try:
            # yfinance batch download
            data = yf.download(
                symbols,
                start=start_date,
                end=None,  # Today
                group_by="ticker",
                auto_adjust=False,  # Keep both close and adj close
                threads=True,
                progress=False
            )

            if data.empty:
                logger.warning(f"No data returned for batch")
                return {}

            # Split into per-ticker dataframes
            result = {}

            # Handle single ticker case (different structure)
            if len(symbols) == 1:
                symbol = symbols[0]
                df = data.copy()
                df = df.reset_index()
                # Handle different column name formats
                new_columns = []
                for col in df.columns:
                    if isinstance(col, tuple):
                        new_columns.append(col[0].lower().replace(' ', '_'))
                    else:
                        new_columns.append(col.lower().replace(' ', '_'))
                df.columns = new_columns

                if 'adj_close' in df.columns:
                    df = df.rename(columns={'adj_close': 'adjusted_close'})
                df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
                df = df.dropna(subset=['close'])
                if not df.empty:
                    result[symbol] = df
            else:
                # Multi-ticker case
                for symbol in symbols:
                    try:
                        if symbol in data.columns.get_level_values(0):
                            df = data[symbol].copy()
                            df = df.reset_index()
                            df.columns = [col.lower().replace(' ', '_') for col in df.columns]
                            if 'adj_close' in df.columns:
                                df = df.rename(columns={'adj_close': 'adjusted_close'})
                            df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
                            # Drop rows with NaN close prices
                            df = df.dropna(subset=['close'])
                            if not df.empty:
                                result[symbol] = df
                    except Exception as e:
                        logger.warning(f"Error extracting {symbol} from batch: {e}")

            return result

        except Exception as e:
            logger.error(f"Batch download error: {e}")
            return {}

    def save_prices_to_db(
        self,
        company_id: int,
        symbol: str,
        df: pd.DataFrame,
        source: str = 'yfinance'
    ) -> int:
        """Save price data to database with upsert."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        records_imported = 0

        # Use executemany for bulk insert (much faster)
        rows = []
        for _, row in df.iterrows():
            volume = row.get('volume', 0)
            if pd.isna(volume):
                volume = 0
            else:
                volume = int(volume)

            rows.append((
                company_id,
                row['date'],
                row.get('open') if pd.notna(row.get('open')) else None,
                row.get('high') if pd.notna(row.get('high')) else None,
                row.get('low') if pd.notna(row.get('low')) else None,
                row['close'],
                row.get('adjusted_close', row['close']) if pd.notna(row.get('adjusted_close')) else row['close'],
                volume,
                source
            ))

        # Check if source column exists
        has_source = 'source' in self.db.schema_cache.get('daily_prices', {})

        if has_source:
            cursor.executemany("""
                INSERT INTO daily_prices
                (company_id, date, open, high, low, close, adjusted_close, volume, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(company_id, date) DO UPDATE SET
                    open = excluded.open,
                    high = excluded.high,
                    low = excluded.low,
                    close = excluded.close,
                    adjusted_close = excluded.adjusted_close,
                    volume = excluded.volume,
                    source = excluded.source
            """, rows)
        else:
            # Without source column
            rows_no_source = [(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]) for r in rows]
            cursor.executemany("""
                INSERT INTO daily_prices
                (company_id, date, open, high, low, close, adjusted_close, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(company_id, date) DO UPDATE SET
                    open = excluded.open,
                    high = excluded.high,
                    low = excluded.low,
                    close = excluded.close,
                    adjusted_close = excluded.adjusted_close,
                    volume = excluded.volume
            """, rows_no_source)

        records_imported = len(rows)
        conn.commit()
        conn.close()

        return records_imported

    def log_import(
        self,
        company_id: int,
        symbol: str,
        source: str,
        status: str,
        records: int = 0,
        date_from: str = None,
        date_to: str = None,
        error: str = None
    ):
        """Log import attempt."""
        conn = self.db.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO price_import_log
            (company_id, symbol, source, status, records_imported,
             date_from, date_to, error_message, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (company_id, symbol, source, status, records, date_from, date_to, error))

        conn.commit()
        conn.close()


def bulk_import_prices(
    db_path: str = './data/stocks.db',
    batch_size: int = BATCH_SIZE,
    delay: float = DELAY_BETWEEN_BATCHES,
    limit: Optional[int] = None,
    resume: bool = True,
    start_date: str = START_DATE
):
    """
    Bulk import historical prices for all companies.
    Optimized for 10,000+ companies.

    Args:
        db_path: Path to SQLite database
        batch_size: Number of tickers per yfinance call (50-100 recommended)
        delay: Seconds between batch API calls
        limit: Max companies to process (None = all)
        resume: Skip already imported companies
        start_date: Start date for historical data (YYYY-MM-DD)
    """
    # Initialize
    db = DatabaseAdapter(db_path)
    db.ensure_price_tables_exist()
    fetcher = PriceFetcher(db)

    # Get companies needing import
    companies = db.get_companies_for_import(limit=limit, exclude_imported=resume)
    total = len(companies)
    total_all = db.get_total_company_count()

    logger.info(f"Total companies in database: {total_all}")
    logger.info(f"Companies to import: {total}")
    logger.info(f"Estimated time: {(total / batch_size) * (delay + 3) / 60:.1f} minutes")

    if total == 0:
        logger.info("All companies already imported!")
        return

    # Build symbol to company mapping
    symbol_to_company = {c['symbol']: c for c in companies}
    symbols = list(symbol_to_company.keys())

    # Process in batches
    successful = 0
    failed = 0
    total_records = 0

    if HAS_TQDM:
        pbar = tqdm(total=total, desc="Importing prices", unit="company")
    else:
        pbar = None

    for i in range(0, len(symbols), batch_size):
        batch_symbols = symbols[i:i+batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(symbols) + batch_size - 1) // batch_size

        if not HAS_TQDM:
            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch_symbols)} symbols)")

        try:
            # Fetch batch
            batch_data = fetcher.fetch_batch_prices(batch_symbols, start_date)

            # Process each company in batch
            for symbol in batch_symbols:
                company = symbol_to_company[symbol]

                if symbol in batch_data and not batch_data[symbol].empty:
                    df = batch_data[symbol]
                    records = fetcher.save_prices_to_db(company['id'], symbol, df)

                    date_from = df['date'].min()
                    date_to = df['date'].max()
                    fetcher.log_import(company['id'], symbol, 'yfinance', 'success',
                                      records, date_from, date_to)

                    successful += 1
                    total_records += records
                else:
                    fetcher.log_import(company['id'], symbol, 'yfinance', 'failed',
                                      error="No data returned")
                    failed += 1

                if pbar:
                    pbar.update(1)

        except Exception as e:
            logger.error(f"Batch error: {e}")
            # Log failures for all in batch
            for symbol in batch_symbols:
                company = symbol_to_company[symbol]
                fetcher.log_import(company['id'], symbol, 'yfinance', 'failed',
                                  error=str(e))
                failed += 1
                if pbar:
                    pbar.update(1)

        # Rate limiting
        if i + batch_size < len(symbols):
            time.sleep(delay)

    if pbar:
        pbar.close()

    logger.info(f"\n{'='*60}")
    logger.info(f"IMPORT COMPLETE")
    logger.info(f"  Successful: {successful}/{total}")
    logger.info(f"  Failed: {failed}/{total}")
    logger.info(f"  Total records: {total_records:,}")
    logger.info(f"{'='*60}\n")

    return {
        'successful': successful,
        'failed': failed,
        'total_records': total_records
    }


def calculate_price_metrics(db_path: str = './data/stocks.db'):
    """
    Calculate price metrics for all companies with price data.
    """
    db = DatabaseAdapter(db_path)
    conn = db.get_connection()
    cursor = conn.cursor()

    logger.info("Calculating price metrics...")

    # Get companies with price data
    cursor.execute("""
        SELECT DISTINCT company_id FROM daily_prices
    """)
    company_ids = [row[0] for row in cursor.fetchall()]

    logger.info(f"Calculating metrics for {len(company_ids)} companies")

    for company_id in company_ids:
        try:
            # Get recent prices (last 252 trading days ~ 1 year)
            cursor.execute("""
                SELECT date, close, adjusted_close, volume
                FROM daily_prices
                WHERE company_id = ?
                ORDER BY date DESC
                LIMIT 252
            """, (company_id,))
            rows = cursor.fetchall()

            if not rows:
                continue

            # Convert to lists (already in desc order)
            dates = [r[0] for r in rows]
            closes = [r[1] for r in rows]
            adj_closes = [r[2] if r[2] else r[1] for r in rows]
            volumes = [r[3] if r[3] else 0 for r in rows]

            # Current price
            last_price = adj_closes[0]
            last_date = dates[0]

            # 52-week high/low
            high_52w = max(adj_closes)
            high_52w_date = dates[adj_closes.index(high_52w)]
            low_52w = min(adj_closes)
            low_52w_date = dates[adj_closes.index(low_52w)]

            # Price changes
            def pct_change(current, previous):
                if previous and previous != 0:
                    return ((current - previous) / previous) * 100
                return None

            change_1d = pct_change(adj_closes[0], adj_closes[1]) if len(adj_closes) > 1 else None
            change_1w = pct_change(adj_closes[0], adj_closes[5]) if len(adj_closes) > 5 else None
            change_1m = pct_change(adj_closes[0], adj_closes[21]) if len(adj_closes) > 21 else None
            change_3m = pct_change(adj_closes[0], adj_closes[63]) if len(adj_closes) > 63 else None
            change_6m = pct_change(adj_closes[0], adj_closes[126]) if len(adj_closes) > 126 else None
            change_1y = pct_change(adj_closes[0], adj_closes[-1]) if len(adj_closes) > 200 else None

            # YTD change
            current_year = datetime.now().year
            ytd_prices = [(d, p) for d, p in zip(dates, adj_closes) if d.startswith(str(current_year))]
            if ytd_prices:
                ytd_start = ytd_prices[-1][1]
                change_ytd = pct_change(adj_closes[0], ytd_start)
            else:
                change_ytd = None

            # Moving averages (need prices in ascending order)
            adj_closes_asc = adj_closes[::-1]
            sma_50 = sum(adj_closes_asc[-50:]) / 50 if len(adj_closes_asc) >= 50 else None
            sma_200 = sum(adj_closes_asc[-200:]) / 200 if len(adj_closes_asc) >= 200 else None

            # RSI (14-day)
            rsi_14 = None
            if len(adj_closes_asc) >= 15:
                gains = []
                losses = []
                for i in range(1, 15):
                    diff = adj_closes_asc[-i] - adj_closes_asc[-i-1]
                    if diff > 0:
                        gains.append(diff)
                        losses.append(0)
                    else:
                        gains.append(0)
                        losses.append(abs(diff))

                avg_gain = sum(gains) / 14
                avg_loss = sum(losses) / 14

                if avg_loss != 0:
                    rs = avg_gain / avg_loss
                    rsi_14 = 100 - (100 / (1 + rs))
                else:
                    rsi_14 = 100

            # Volatility (30-day std dev of returns)
            volatility_30d = None
            if len(adj_closes_asc) >= 31:
                returns = [(adj_closes_asc[i] - adj_closes_asc[i-1]) / adj_closes_asc[i-1]
                          for i in range(-30, 0) if adj_closes_asc[i-1] != 0]
                if returns:
                    mean_return = sum(returns) / len(returns)
                    variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
                    volatility_30d = (variance ** 0.5) * 100  # As percentage

            # Average volume (30-day)
            avg_volume_30d = int(sum(volumes[:30]) / 30) if len(volumes) >= 30 else None

            # Upsert metrics
            cursor.execute("""
                INSERT INTO price_metrics
                (company_id, last_price, last_price_date, high_52w, high_52w_date,
                 low_52w, low_52w_date, change_1d, change_1w, change_1m, change_3m,
                 change_6m, change_1y, change_ytd, sma_50, sma_200, rsi_14,
                 volatility_30d, avg_volume_30d, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(company_id) DO UPDATE SET
                    last_price = excluded.last_price,
                    last_price_date = excluded.last_price_date,
                    high_52w = excluded.high_52w,
                    high_52w_date = excluded.high_52w_date,
                    low_52w = excluded.low_52w,
                    low_52w_date = excluded.low_52w_date,
                    change_1d = excluded.change_1d,
                    change_1w = excluded.change_1w,
                    change_1m = excluded.change_1m,
                    change_3m = excluded.change_3m,
                    change_6m = excluded.change_6m,
                    change_1y = excluded.change_1y,
                    change_ytd = excluded.change_ytd,
                    sma_50 = excluded.sma_50,
                    sma_200 = excluded.sma_200,
                    rsi_14 = excluded.rsi_14,
                    volatility_30d = excluded.volatility_30d,
                    avg_volume_30d = excluded.avg_volume_30d,
                    updated_at = excluded.updated_at
            """, (company_id, last_price, last_date, high_52w, high_52w_date,
                  low_52w, low_52w_date, change_1d, change_1w, change_1m, change_3m,
                  change_6m, change_1y, change_ytd, sma_50, sma_200, rsi_14,
                  volatility_30d, avg_volume_30d))

        except Exception as e:
            logger.warning(f"Error calculating metrics for company {company_id}: {e}")
            continue

    conn.commit()
    conn.close()
    logger.info("Price metrics calculation complete")


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Stock Price Bulk Importer')
    parser.add_argument('--db', default='./data/stocks.db', help='Database path')
    parser.add_argument('--batch-size', type=int, default=50, help='Tickers per API call')
    parser.add_argument('--delay', type=float, default=2, help='Delay between batches')
    parser.add_argument('--limit', type=int, default=None, help='Max companies (for testing)')
    parser.add_argument('--no-resume', action='store_true', help='Re-import all companies')
    parser.add_argument('--start-date', default=START_DATE, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--calculate-metrics', action='store_true', help='Calculate metrics after import')

    args = parser.parse_args()

    result = bulk_import_prices(
        db_path=args.db,
        batch_size=args.batch_size,
        delay=args.delay,
        limit=args.limit,
        resume=not args.no_resume,
        start_date=args.start_date
    )

    if args.calculate_metrics and result and result.get('successful', 0) > 0:
        calculate_price_metrics(args.db)
