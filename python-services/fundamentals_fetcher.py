"""
Fundamentals Fetcher Service
Bulk imports shares outstanding and market cap for all companies.
Run once to populate, then daily updates will maintain it.
"""

import yfinance as yf
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional
import time
import logging
import argparse
import os

# Configuration
BATCH_SIZE = 50              # Symbols per batch
DELAY_BETWEEN_BATCHES = 3    # Seconds between batches (be conservative)
MAX_COMPANIES = None         # None = all companies

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FundamentalsFetcher:
    """Fetches fundamental data from Yahoo Finance."""

    def __init__(self, db_path: str):
        self.db_path = db_path

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_companies_needing_fundamentals(self, limit: Optional[int] = None) -> List[Dict]:
        """Get companies that don't have shares outstanding data."""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT c.id, c.symbol, c.name, c.update_tier
            FROM companies c
            LEFT JOIN price_metrics pm ON pm.company_id = c.id
            WHERE c.symbol IS NOT NULL
              AND c.symbol != ''
              AND c.symbol NOT LIKE 'CIK_%'
              AND LENGTH(c.symbol) <= 6
              AND (pm.shares_outstanding IS NULL OR pm.market_cap IS NULL)
            ORDER BY c.update_tier ASC NULLS LAST, c.symbol
            LIMIT ?
        """, (limit or 999999,))

        companies = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return companies

    def fetch_fundamentals_batch(self, symbols: List[str]) -> Dict[str, Dict]:
        """Fetch fundamental data for a batch of symbols."""
        fundamentals = {}

        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info

                if info:
                    shares = info.get('sharesOutstanding')
                    mcap = info.get('marketCap')

                    # Only store if we got at least one value
                    if shares or mcap:
                        fundamentals[symbol] = {
                            'shares_outstanding': shares,
                            'market_cap': mcap,
                        }
            except Exception as e:
                logger.debug(f"Error fetching {symbol}: {e}")

        return fundamentals

    def save_fundamentals(self, company_id: int, data: Dict) -> bool:
        """Save fundamentals to price_metrics table."""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("""
                INSERT INTO price_metrics (company_id, shares_outstanding, market_cap, updated_at)
                VALUES (?, ?, ?, datetime('now'))
                ON CONFLICT(company_id) DO UPDATE SET
                    shares_outstanding = COALESCE(excluded.shares_outstanding, price_metrics.shares_outstanding),
                    market_cap = COALESCE(excluded.market_cap, price_metrics.market_cap),
                    updated_at = datetime('now')
            """, (company_id, data.get('shares_outstanding'), data.get('market_cap')))

            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error saving fundamentals for company {company_id}: {e}")
            conn.close()
            return False


def bulk_import_fundamentals(
    db_path: str = './data/stocks.db',
    batch_size: int = BATCH_SIZE,
    delay: float = DELAY_BETWEEN_BATCHES,
    limit: Optional[int] = None
):
    """
    Bulk import fundamentals (shares outstanding, market cap) for all companies.

    Args:
        db_path: Path to SQLite database
        batch_size: Number of tickers per batch
        delay: Seconds between batches
        limit: Max companies to process (None = all)
    """
    fetcher = FundamentalsFetcher(db_path)

    # Get companies needing data
    companies = fetcher.get_companies_needing_fundamentals(limit=limit)
    total = len(companies)

    if total == 0:
        logger.info("All companies already have fundamentals!")
        return {'successful': 0, 'failed': 0}

    logger.info(f"Companies needing fundamentals: {total}")
    logger.info(f"Estimated time: {(total / batch_size) * (delay + 2) / 60:.1f} minutes")

    # Build symbol to company mapping
    symbol_to_company = {c['symbol'].upper(): c for c in companies}
    symbols = list(symbol_to_company.keys())

    stats = {
        'successful': 0,
        'failed': 0,
        'skipped': 0
    }

    total_batches = (len(symbols) + batch_size - 1) // batch_size

    for batch_idx, i in enumerate(range(0, len(symbols), batch_size)):
        batch_symbols = symbols[i:i+batch_size]

        try:
            # Fetch batch
            batch_data = fetcher.fetch_fundamentals_batch(batch_symbols)

            # Save each company's data
            for symbol in batch_symbols:
                company = symbol_to_company[symbol]

                if symbol in batch_data:
                    if fetcher.save_fundamentals(company['id'], batch_data[symbol]):
                        stats['successful'] += 1
                    else:
                        stats['failed'] += 1
                else:
                    stats['skipped'] += 1

            logger.info(f"Batch {batch_idx+1}/{total_batches}: {len(batch_data)}/{len(batch_symbols)} fetched")

        except Exception as e:
            logger.error(f"Batch error: {e}")
            stats['failed'] += len(batch_symbols)

        # Rate limiting
        if i + batch_size < len(symbols):
            time.sleep(delay)

    logger.info(f"\n{'='*60}")
    logger.info(f"FUNDAMENTALS IMPORT COMPLETE")
    logger.info(f"  Successful: {stats['successful']}")
    logger.info(f"  Failed: {stats['failed']}")
    logger.info(f"  Skipped (no data): {stats['skipped']}")
    logger.info(f"{'='*60}\n")

    return stats


def show_stats(db_path: str):
    """Show current fundamentals coverage."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            COUNT(*) as total_companies,
            SUM(CASE WHEN pm.shares_outstanding IS NOT NULL THEN 1 ELSE 0 END) as has_shares,
            SUM(CASE WHEN pm.market_cap IS NOT NULL THEN 1 ELSE 0 END) as has_mcap,
            SUM(CASE WHEN pm.shares_outstanding IS NOT NULL AND pm.market_cap IS NOT NULL THEN 1 ELSE 0 END) as has_both
        FROM companies c
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE c.symbol IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND LENGTH(c.symbol) <= 6
    """)

    row = cursor.fetchone()

    print("\n=== Fundamentals Coverage ===\n")
    print(f"Total tradeable companies: {row['total_companies']}")
    print(f"  Has shares outstanding: {row['has_shares']} ({row['has_shares']/row['total_companies']*100:.1f}%)")
    print(f"  Has market cap: {row['has_mcap']} ({row['has_mcap']/row['total_companies']*100:.1f}%)")
    print(f"  Has both: {row['has_both']} ({row['has_both']/row['total_companies']*100:.1f}%)")

    # By tier
    cursor.execute("""
        SELECT
            c.update_tier,
            COUNT(*) as total,
            SUM(CASE WHEN pm.shares_outstanding IS NOT NULL THEN 1 ELSE 0 END) as has_shares
        FROM companies c
        LEFT JOIN price_metrics pm ON pm.company_id = c.id
        WHERE c.symbol IS NOT NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND LENGTH(c.symbol) <= 6
        GROUP BY c.update_tier
        ORDER BY c.update_tier
    """)

    print("\nBy Tier:")
    tier_names = {1: 'Core', 2: 'Active', 3: 'Tracked', 4: 'Archive'}
    for row in cursor.fetchall():
        tier = row['update_tier'] or 4
        name = tier_names.get(tier, 'Unknown')
        pct = row['has_shares'] / row['total'] * 100 if row['total'] > 0 else 0
        print(f"  Tier {tier} ({name}): {row['has_shares']}/{row['total']} ({pct:.1f}%)")

    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Fundamentals Fetcher Service')
    parser.add_argument('--db', default='./data/stocks.db', help='Database path')
    parser.add_argument('command', choices=['import', 'stats'],
                       help='Command to execute')
    parser.add_argument('--limit', type=int, default=None, help='Max companies to process')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE, help='Batch size')
    parser.add_argument('--delay', type=float, default=DELAY_BETWEEN_BATCHES, help='Delay between batches')

    args = parser.parse_args()

    # Resolve database path
    db_path = args.db
    if not os.path.isabs(db_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        db_path = os.path.join(project_root, db_path)

    if args.command == 'import':
        bulk_import_fundamentals(
            db_path=db_path,
            batch_size=args.batch_size,
            delay=args.delay,
            limit=args.limit
        )

    elif args.command == 'stats':
        show_stats(db_path)


if __name__ == '__main__':
    main()
