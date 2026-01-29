#!/usr/bin/env python3
"""
Calculate Max Drawdown metrics for all companies in the database.
Uses historical price data from daily_prices table.

Max Drawdown = (Trough - Peak) / Peak * 100
Where Peak is the highest price before the trough.
"""

import sqlite3
import numpy as np
from datetime import datetime, timedelta
import logging
import argparse
from typing import Dict, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

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


def calculate_max_drawdown(prices: np.ndarray) -> Tuple[float, int]:
    """
    Calculate maximum drawdown and recovery time from price array.

    Args:
        prices: numpy array of adjusted closing prices (oldest first)

    Returns:
        (max_drawdown_percent, recovery_days)
        max_drawdown_percent is negative (e.g., -45.5 for 45.5% drawdown)
        recovery_days is None if not yet recovered
    """
    if len(prices) < 2:
        return None, None

    # Calculate running maximum (peak)
    running_max = np.maximum.accumulate(prices)

    # Calculate drawdown at each point
    drawdowns = (prices - running_max) / running_max * 100

    # Find max drawdown (most negative value)
    max_dd = np.min(drawdowns)

    if max_dd >= 0:
        return 0.0, 0  # No drawdown

    # Find recovery days (time from trough to new high)
    trough_idx = np.argmin(drawdowns)
    recovery_days = None

    # Look for recovery after trough
    for i in range(trough_idx + 1, len(prices)):
        if prices[i] >= running_max[trough_idx]:
            recovery_days = i - trough_idx
            break

    return round(max_dd, 2), recovery_days


def get_prices_for_period(conn, company_id: int, days: int) -> np.ndarray:
    """Get adjusted close prices for the specified period."""
    cutoff_date = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')

    cursor = conn.execute("""
        SELECT COALESCE(adjusted_close, close) as price
        FROM daily_prices
        WHERE company_id = ?
          AND date >= ?
        ORDER BY date ASC
    """, (company_id, cutoff_date))

    rows = cursor.fetchall()
    if not rows:
        return np.array([])

    return np.array([row['price'] for row in rows if row['price'] is not None])


def calculate_drawdowns_for_company(company_id: int, symbol: str) -> Optional[Dict]:
    """Calculate all drawdown metrics for a single company."""
    conn = get_db_connection()

    try:
        results = {
            'company_id': company_id,
            'symbol': symbol,
            'max_drawdown_1y': None,
            'max_drawdown_3y': None,
            'max_drawdown_5y': None,
            'drawdown_recovery_days': None
        }

        # 1-year drawdown
        prices_1y = get_prices_for_period(conn, company_id, 365)
        if len(prices_1y) >= 20:  # Need at least 20 data points
            dd_1y, _ = calculate_max_drawdown(prices_1y)
            results['max_drawdown_1y'] = dd_1y

        # 3-year drawdown
        prices_3y = get_prices_for_period(conn, company_id, 365 * 3)
        if len(prices_3y) >= 60:
            dd_3y, _ = calculate_max_drawdown(prices_3y)
            results['max_drawdown_3y'] = dd_3y

        # 5-year drawdown (also calculate recovery days from this)
        prices_5y = get_prices_for_period(conn, company_id, 365 * 5)
        if len(prices_5y) >= 100:
            dd_5y, recovery = calculate_max_drawdown(prices_5y)
            results['max_drawdown_5y'] = dd_5y
            results['drawdown_recovery_days'] = recovery

        return results

    except Exception as e:
        logger.debug(f"Error calculating drawdowns for {symbol}: {e}")
        return None
    finally:
        conn.close()


def update_drawdown_metrics(conn, data: Dict) -> bool:
    """Update drawdown metrics in database."""
    try:
        # Check if price_metrics row exists
        cursor = conn.execute(
            "SELECT id FROM price_metrics WHERE company_id = ?",
            (data['company_id'],)
        )
        existing = cursor.fetchone()

        if existing:
            conn.execute("""
                UPDATE price_metrics SET
                    max_drawdown_1y = ?,
                    max_drawdown_3y = ?,
                    max_drawdown_5y = ?,
                    drawdown_recovery_days = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE company_id = ?
            """, (
                data['max_drawdown_1y'],
                data['max_drawdown_3y'],
                data['max_drawdown_5y'],
                data['drawdown_recovery_days'],
                data['company_id']
            ))
        else:
            conn.execute("""
                INSERT INTO price_metrics (
                    company_id, max_drawdown_1y, max_drawdown_3y,
                    max_drawdown_5y, drawdown_recovery_days, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                data['company_id'],
                data['max_drawdown_1y'],
                data['max_drawdown_3y'],
                data['max_drawdown_5y'],
                data['drawdown_recovery_days']
            ))

        return True
    except Exception as e:
        logger.error(f"Error updating {data['symbol']}: {e}")
        return False


def get_companies_with_prices(conn) -> List[Dict]:
    """Get all companies that have price data."""
    cursor = conn.execute("""
        SELECT DISTINCT c.id, c.symbol
        FROM companies c
        INNER JOIN daily_prices dp ON dp.company_id = c.id
        WHERE c.symbol IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
        ORDER BY c.update_tier ASC, c.symbol ASC
    """)
    return [{'id': row['id'], 'symbol': row['symbol']} for row in cursor.fetchall()]


def main():
    parser = argparse.ArgumentParser(description='Calculate max drawdown metrics')
    parser.add_argument('--limit', type=int, default=None, help='Limit number of companies')
    parser.add_argument('--batch-size', type=int, default=100, help='Batch size for commits')
    parser.add_argument('--workers', type=int, default=4, help='Number of parallel workers')
    args = parser.parse_args()

    logger.info("Starting max drawdown calculation...")

    conn = get_db_connection()
    companies = get_companies_with_prices(conn)
    conn.close()

    if args.limit:
        companies = companies[:args.limit]

    logger.info(f"Processing {len(companies)} companies...")

    processed = 0
    updated = 0

    # Process in parallel
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(calculate_drawdowns_for_company, c['id'], c['symbol']): c
            for c in companies
        }

        batch_results = []

        for future in as_completed(futures):
            company = futures[future]
            try:
                result = future.result()
                if result and any([
                    result['max_drawdown_1y'] is not None,
                    result['max_drawdown_3y'] is not None,
                    result['max_drawdown_5y'] is not None
                ]):
                    batch_results.append(result)
            except Exception as e:
                logger.debug(f"Error processing {company['symbol']}: {e}")

            processed += 1

            # Commit batch
            if len(batch_results) >= args.batch_size:
                conn = get_db_connection()
                for r in batch_results:
                    if update_drawdown_metrics(conn, r):
                        updated += 1
                conn.commit()
                conn.close()

                progress = (processed / len(companies)) * 100
                logger.info(f"Progress: {progress:.1f}% ({processed}/{len(companies)}) - Updated: {updated}")
                batch_results = []

    # Final batch
    if batch_results:
        conn = get_db_connection()
        for r in batch_results:
            if update_drawdown_metrics(conn, r):
                updated += 1
        conn.commit()
        conn.close()

    logger.info(f"\n{'='*50}")
    logger.info(f"COMPLETE: Processed {processed} companies")
    logger.info(f"Updated drawdown metrics for {updated} companies")


if __name__ == '__main__':
    main()
