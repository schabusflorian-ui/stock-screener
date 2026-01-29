#!/usr/bin/env python3
"""
Bulk update short interest data for all companies in the database.
Uses yfinance to fetch short interest metrics and saves to price_metrics table.
"""

import sqlite3
import yfinance as yf
from datetime import datetime
import time
import logging
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional
import sys

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DB_PATH = '../data/stocks.db'

def get_db_connection():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_all_symbols(conn) -> List[str]:
    """Get all company symbols from database."""
    cursor = conn.execute("SELECT symbol FROM companies ORDER BY symbol")
    return [row['symbol'] for row in cursor.fetchall()]

def get_symbols_without_short_data(conn) -> List[str]:
    """Get symbols that don't have short interest data yet."""
    cursor = conn.execute("""
        SELECT c.symbol
        FROM companies c
        LEFT JOIN price_metrics pm ON c.id = pm.company_id
        WHERE pm.shares_short IS NULL OR pm.company_id IS NULL
        ORDER BY c.symbol
    """)
    return [row['symbol'] for row in cursor.fetchall()]

def fetch_short_interest(symbol: str) -> Optional[Dict]:
    """Fetch short interest data for a single symbol."""
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info

        if not info:
            return None

        # Parse short interest date
        short_date = info.get('dateShortInterest')
        short_date_str = None
        if short_date:
            try:
                short_date_str = datetime.fromtimestamp(short_date).strftime('%Y-%m-%d')
            except:
                pass

        # Only return if we have at least some short data
        shares_short = info.get('sharesShort')
        short_percent = info.get('shortPercentOfFloat')

        if not shares_short and not short_percent:
            return None

        return {
            'symbol': symbol,
            'shares_short': shares_short,
            'short_percent_of_float': short_percent,
            'short_ratio': info.get('shortRatio'),
            'shares_short_prior_month': info.get('sharesShortPriorMonth'),
            'short_interest_date': short_date_str,
            'shares_outstanding': info.get('sharesOutstanding'),
            'market_cap': info.get('marketCap'),
        }
    except Exception as e:
        logger.debug(f"Error fetching {symbol}: {e}")
        return None

def update_short_interest(conn, data: Dict) -> bool:
    """Update short interest data in database."""
    try:
        # Get company_id
        cursor = conn.execute(
            "SELECT id FROM companies WHERE symbol = ?",
            (data['symbol'],)
        )
        row = cursor.fetchone()
        if not row:
            return False

        company_id = row['id']

        # Check if price_metrics row exists
        cursor = conn.execute(
            "SELECT id FROM price_metrics WHERE company_id = ?",
            (company_id,)
        )
        existing = cursor.fetchone()

        if existing:
            # Update existing row
            conn.execute("""
                UPDATE price_metrics SET
                    shares_short = ?,
                    short_percent_of_float = ?,
                    short_ratio = ?,
                    shares_short_prior_month = ?,
                    short_interest_date = ?,
                    shares_outstanding = COALESCE(?, shares_outstanding),
                    market_cap = COALESCE(?, market_cap),
                    updated_at = CURRENT_TIMESTAMP
                WHERE company_id = ?
            """, (
                data['shares_short'],
                data['short_percent_of_float'],
                data['short_ratio'],
                data['shares_short_prior_month'],
                data['short_interest_date'],
                data['shares_outstanding'],
                data['market_cap'],
                company_id
            ))
        else:
            # Insert new row
            conn.execute("""
                INSERT INTO price_metrics (
                    company_id, shares_short, short_percent_of_float,
                    short_ratio, shares_short_prior_month, short_interest_date,
                    shares_outstanding, market_cap, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                company_id,
                data['shares_short'],
                data['short_percent_of_float'],
                data['short_ratio'],
                data['shares_short_prior_month'],
                data['short_interest_date'],
                data['shares_outstanding'],
                data['market_cap']
            ))

        return True
    except Exception as e:
        logger.error(f"Error updating {data['symbol']}: {e}")
        return False

def process_batch(symbols: List[str], batch_num: int, total_batches: int) -> List[Dict]:
    """Process a batch of symbols with threading."""
    results = []

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_symbol = {
            executor.submit(fetch_short_interest, symbol): symbol
            for symbol in symbols
        }

        for future in as_completed(future_to_symbol):
            symbol = future_to_symbol[future]
            try:
                data = future.result()
                if data:
                    results.append(data)
            except Exception as e:
                logger.debug(f"Error processing {symbol}: {e}")

    return results

def main():
    parser = argparse.ArgumentParser(description='Update short interest data')
    parser.add_argument('--all', action='store_true', help='Update all companies, not just missing')
    parser.add_argument('--batch-size', type=int, default=50, help='Batch size for processing')
    parser.add_argument('--delay', type=float, default=1.0, help='Delay between batches (seconds)')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of symbols to process')
    args = parser.parse_args()

    conn = get_db_connection()

    # Get symbols to process
    if args.all:
        symbols = get_all_symbols(conn)
        logger.info(f"Processing ALL {len(symbols)} companies")
    else:
        symbols = get_symbols_without_short_data(conn)
        logger.info(f"Processing {len(symbols)} companies without short data")

    if args.limit:
        symbols = symbols[:args.limit]
        logger.info(f"Limited to {len(symbols)} symbols")

    if not symbols:
        logger.info("No symbols to process")
        return

    # Process in batches
    batch_size = args.batch_size
    total_batches = (len(symbols) + batch_size - 1) // batch_size

    total_updated = 0
    total_with_data = 0

    for batch_num in range(total_batches):
        start_idx = batch_num * batch_size
        end_idx = min(start_idx + batch_size, len(symbols))
        batch_symbols = symbols[start_idx:end_idx]

        logger.info(f"Batch {batch_num + 1}/{total_batches}: Processing {len(batch_symbols)} symbols ({start_idx + 1}-{end_idx})")

        # Fetch short interest data
        results = process_batch(batch_symbols, batch_num + 1, total_batches)

        # Update database
        batch_updated = 0
        for data in results:
            if update_short_interest(conn, data):
                batch_updated += 1

        conn.commit()

        total_with_data += len(results)
        total_updated += batch_updated

        logger.info(f"  Found short data: {len(results)}/{len(batch_symbols)}, Updated: {batch_updated}")

        # Progress report
        progress = (batch_num + 1) / total_batches * 100
        logger.info(f"  Progress: {progress:.1f}% - Total updated: {total_updated}")

        # Delay between batches to avoid rate limiting
        if batch_num < total_batches - 1:
            time.sleep(args.delay)

    conn.close()

    logger.info(f"\n{'='*50}")
    logger.info(f"COMPLETE: Processed {len(symbols)} symbols")
    logger.info(f"  Found short data for: {total_with_data} companies")
    logger.info(f"  Updated in database: {total_updated} companies")

if __name__ == '__main__':
    main()
