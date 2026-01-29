"""
Stock Price Update Service
Stratified daily updates for 5,000+ companies using tiered rotation.

Tier System:
- Tier 1 (Core): S&P 500, watchlist, large-cap - Daily updates
- Tier 2 (Active): Mid-cap, recent filings - Every 2 days
- Tier 3 (Tracked): Small-cap with financials - Every 3 days
- Tier 4 (Archive): Micro-cap, inactive - Weekly
"""

import yfinance as yf
import sqlite3
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import time
import logging
import argparse
import os
import sys

# Configuration
BATCH_SIZE = 100              # Tickers per yfinance call
DELAY_BETWEEN_BATCHES = 2     # Seconds between API calls
MAX_DAILY_UPDATES = 4500      # Safety cap
FETCH_DAYS = 7                # Fetch last 7 days of data

# Tier definitions
TIER_CONFIG = {
    1: {'name': 'Core', 'frequency': 'daily', 'stale_days': 2},
    2: {'name': 'Active', 'frequency': 'every_2_days', 'stale_days': 4},
    3: {'name': 'Tracked', 'frequency': 'every_3_days', 'stale_days': 5},
    4: {'name': 'Archive', 'frequency': 'weekly', 'stale_days': 10}
}

# Yahoo Finance symbol suffixes by country
COUNTRY_YAHOO_SUFFIX = {
    'US': '',
    'GB': '.L',      # London Stock Exchange
    'DE': '.DE',     # XETRA
    'FR': '.PA',     # Euronext Paris
    'NL': '.AS',     # Euronext Amsterdam
    'BE': '.BR',     # Euronext Brussels
    'ES': '.MC',     # Bolsa de Madrid
    'IT': '.MI',     # Borsa Italiana
    'CH': '.SW',     # SIX Swiss Exchange
    'SE': '.ST',     # Nasdaq Stockholm
    'DK': '.CO',     # Nasdaq Copenhagen
    'NO': '.OL',     # Oslo Bors
    'FI': '.HE',     # Nasdaq Helsinki
    'AT': '.VI',     # Vienna Stock Exchange
    'PT': '.LS',     # Euronext Lisbon
    'IE': '.IR',     # Euronext Dublin
    'PL': '.WA',     # Warsaw Stock Exchange
    'GR': '.AT',     # Athens Stock Exchange
    'CA': '.TO',     # Toronto Stock Exchange
    'AU': '.AX',     # Australian Securities Exchange
    'JP': '.T',      # Tokyo Stock Exchange
    'HK': '.HK',     # Hong Kong Stock Exchange
}

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PriceUpdater:
    """Manages stratified daily price updates."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._verify_schema()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_yahoo_symbol(self, symbol: str, country: str) -> str:
        """
        Convert database symbol to Yahoo Finance symbol with appropriate suffix.

        Args:
            symbol: Raw ticker symbol from database
            country: ISO 2-letter country code

        Returns:
            Yahoo Finance formatted symbol (e.g., 'BP' + 'GB' -> 'BP.L')
        """
        if not symbol:
            return None

        symbol = symbol.upper().strip()
        country = (country or 'US').upper()

        # If symbol already has a suffix (contains .), return as-is
        if '.' in symbol:
            return symbol

        # Handle UK-specific symbol formats
        if country == 'GB':
            # Remove trailing slash (e.g., 'NG/' -> 'NG')
            if symbol.endswith('/'):
                symbol = symbol[:-1]
            # Convert class shares: 'BT/A' -> 'BT-A', but only if / is in middle
            elif '/' in symbol:
                symbol = symbol.replace('/', '-')
            # Skip invalid symbols (numeric prefixes, special chars)
            if symbol and (symbol[0].isdigit() or '=' in symbol):
                return None
            # Handle GBX suffix - these are pence-denominated, often need removal
            if symbol.endswith('GBX'):
                # Try base symbol without GBX
                symbol = symbol[:-3]
            # Handle EUR/USD denominated UK shares
            if symbol.endswith('EUR') or symbol.endswith('USD'):
                return None  # Skip these, need special handling

        # Get suffix for country
        suffix = COUNTRY_YAHOO_SUFFIX.get(country, '')

        return f"{symbol}{suffix}"

    def _verify_schema(self):
        """Verify required columns exist."""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("PRAGMA table_info(companies)")
        columns = {row['name'] for row in cursor.fetchall()}

        required = ['update_tier', 'last_price_update', 'update_priority_score', 'is_sp500']
        missing = [c for c in required if c not in columns]

        if missing:
            logger.warning(f"Missing columns: {missing}. Run schema migration first.")

        conn.close()

    def get_companies_for_today(self) -> List[Dict]:
        """
        Get companies that need price updates today based on tier rotation.

        Rotation logic:
        - Tier 1: Every day
        - Tier 2: Alternating days (ID % 2 matches day % 2)
        - Tier 3: Every 3rd day (ID % 3 matches day % 3)
        - Tier 4: One weekday per week (ID % 5 matches weekday)
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        today = datetime.now().date()
        day_of_week = today.weekday()      # 0=Mon, 4=Fri
        day_of_month = today.day

        # Skip weekends
        if day_of_week >= 5:
            logger.info("Weekend - skipping updates")
            conn.close()
            return []

        cursor.execute("""
            SELECT
                id,
                symbol,
                name,
                country,
                update_tier,
                last_price_update,
                update_priority_score
            FROM companies
            WHERE symbol IS NOT NULL
              AND symbol != ''
              AND symbol NOT LIKE 'CIK_%'
              AND LENGTH(symbol) <= 10
              AND symbol NOT LIKE '%/%'
              AND LENGTH(symbol) >= 1
              AND (
                -- Tier 1: Daily
                (update_tier = 1)
                OR
                -- Tier 2: Every 2 days
                (update_tier = 2 AND (id % 2) = (? % 2))
                OR
                -- Tier 3: Every 3 days
                (update_tier = 3 AND (id % 3) = (? % 3))
                OR
                -- Tier 4: Weekly (spread across Mon-Fri)
                (update_tier = 4 AND (id % 5) = ?)
              )
            ORDER BY
                update_tier ASC,
                last_price_update ASC NULLS FIRST,
                update_priority_score DESC
            LIMIT ?
        """, (day_of_month, day_of_month, day_of_week, MAX_DAILY_UPDATES))

        companies = [dict(row) for row in cursor.fetchall()]
        conn.close()

        # Log tier breakdown
        tier_counts = {}
        for c in companies:
            tier = c['update_tier'] or 3
            tier_counts[tier] = tier_counts.get(tier, 0) + 1

        logger.info(f"Companies to update today: {len(companies)}")
        for tier, count in sorted(tier_counts.items()):
            tier_name = TIER_CONFIG.get(tier, {}).get('name', 'Unknown')
            logger.info(f"  Tier {tier} ({tier_name}): {count}")

        return companies

    def fetch_recent_prices(self, symbols: List[str], days: int = FETCH_DAYS) -> Dict[str, pd.DataFrame]:
        """Fetch last N days of prices for multiple symbols using yfinance batch."""
        if not symbols:
            return {}

        try:
            clean_symbols = [s.upper().strip() for s in symbols if s]

            data = yf.download(
                clean_symbols,
                period=f"{days}d",
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                threads=True,
                progress=False
            )

            if data.empty:
                return {}

            result = {}

            # Single ticker case
            if len(clean_symbols) == 1:
                symbol = clean_symbols[0]
                df = data.reset_index()
                df.columns = [str(c).lower() for c in df.columns]
                if 'adj close' in df.columns:
                    df = df.rename(columns={'adj close': 'adjusted_close'})
                df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
                df = df.dropna(subset=['close'])
                if not df.empty:
                    result[symbol] = df
            else:
                # Multi-ticker case
                for symbol in clean_symbols:
                    try:
                        if symbol in data.columns.get_level_values(0):
                            df = data[symbol].copy()
                            df = df.reset_index()
                            df.columns = [str(c).lower() for c in df.columns]
                            if 'adj close' in df.columns:
                                df = df.rename(columns={'adj close': 'adjusted_close'})
                            df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
                            df = df.dropna(subset=['close'])
                            if not df.empty:
                                result[symbol] = df
                    except Exception:
                        pass

            return result

        except Exception as e:
            logger.error(f"Batch download error: {e}")
            return {}

    def fetch_fundamentals(self, symbols: List[str]) -> Dict[str, Dict]:
        """Fetch fundamental data (shares outstanding, market cap, short interest) for multiple symbols."""
        fundamentals = {}

        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info
                if info:
                    # Convert short interest date timestamp to date string
                    short_date = info.get('dateShortInterest')
                    short_date_str = None
                    if short_date:
                        try:
                            from datetime import datetime
                            short_date_str = datetime.fromtimestamp(short_date).strftime('%Y-%m-%d')
                        except:
                            pass

                    fundamentals[symbol] = {
                        'shares_outstanding': info.get('sharesOutstanding'),
                        'market_cap': info.get('marketCap'),
                        # Short interest data
                        'shares_short': info.get('sharesShort'),
                        'short_percent_of_float': info.get('shortPercentOfFloat'),
                        'short_ratio': info.get('shortRatio'),
                        'shares_short_prior_month': info.get('sharesShortPriorMonth'),
                        'short_interest_date': short_date_str,
                    }
            except Exception as e:
                logger.debug(f"Could not fetch fundamentals for {symbol}: {e}")

        return fundamentals

    def upsert_prices(self, company_id: int, symbol: str, df: pd.DataFrame,
                      fundamentals: Optional[Dict] = None) -> Tuple[int, int]:
        """Insert/update prices. Returns (new_records, updated_records)."""
        conn = self.get_connection()
        cursor = conn.cursor()

        new_records = 0
        updated_records = 0

        for _, row in df.iterrows():
            try:
                cursor.execute(
                    "SELECT id FROM daily_prices WHERE company_id = ? AND date = ?",
                    (company_id, row['date'])
                )
                exists = cursor.fetchone()

                if exists:
                    cursor.execute("""
                        UPDATE daily_prices SET
                            open = ?, high = ?, low = ?, close = ?,
                            adjusted_close = ?, volume = ?, source = 'yfinance'
                        WHERE company_id = ? AND date = ?
                    """, (
                        row.get('open'), row.get('high'), row.get('low'), row['close'],
                        row.get('adjusted_close', row['close']),
                        int(row.get('volume', 0)) if pd.notna(row.get('volume')) else 0,
                        company_id, row['date']
                    ))
                    updated_records += 1
                else:
                    cursor.execute("""
                        INSERT INTO daily_prices
                        (company_id, date, open, high, low, close, adjusted_close, volume, source)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'yfinance')
                    """, (
                        company_id, row['date'],
                        row.get('open'), row.get('high'), row.get('low'), row['close'],
                        row.get('adjusted_close', row['close']),
                        int(row.get('volume', 0)) if pd.notna(row.get('volume')) else 0
                    ))
                    new_records += 1

            except Exception as e:
                logger.debug(f"Error saving {symbol} on {row['date']}: {e}")

        cursor.execute(
            "UPDATE companies SET last_price_update = date('now') WHERE id = ?",
            (company_id,)
        )

        # Update price_metrics with latest price, market cap, shares outstanding, and short interest
        if not df.empty:
            latest = df.iloc[-1]
            last_price = latest['close']
            market_cap = fundamentals.get('market_cap') if fundamentals else None
            shares_outstanding = fundamentals.get('shares_outstanding') if fundamentals else None
            # Short interest data
            shares_short = fundamentals.get('shares_short') if fundamentals else None
            short_percent_of_float = fundamentals.get('short_percent_of_float') if fundamentals else None
            short_ratio = fundamentals.get('short_ratio') if fundamentals else None
            shares_short_prior_month = fundamentals.get('shares_short_prior_month') if fundamentals else None
            short_interest_date = fundamentals.get('short_interest_date') if fundamentals else None

            cursor.execute("""
                INSERT INTO price_metrics (company_id, last_price, market_cap, shares_outstanding,
                    shares_short, short_percent_of_float, short_ratio, shares_short_prior_month,
                    short_interest_date, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(company_id) DO UPDATE SET
                    last_price = excluded.last_price,
                    market_cap = COALESCE(excluded.market_cap, price_metrics.market_cap),
                    shares_outstanding = COALESCE(excluded.shares_outstanding, price_metrics.shares_outstanding),
                    shares_short = COALESCE(excluded.shares_short, price_metrics.shares_short),
                    short_percent_of_float = COALESCE(excluded.short_percent_of_float, price_metrics.short_percent_of_float),
                    short_ratio = COALESCE(excluded.short_ratio, price_metrics.short_ratio),
                    shares_short_prior_month = COALESCE(excluded.shares_short_prior_month, price_metrics.shares_short_prior_month),
                    short_interest_date = COALESCE(excluded.short_interest_date, price_metrics.short_interest_date),
                    updated_at = datetime('now')
            """, (company_id, last_price, market_cap, shares_outstanding,
                  shares_short, short_percent_of_float, short_ratio, shares_short_prior_month,
                  short_interest_date))

        conn.commit()
        conn.close()

        return new_records, updated_records

    def log_update_run(self, tier, attempted, successful, failed, records, duration, errors=None):
        """Log update run to database."""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO price_update_log
            (run_date, tier, companies_attempted, companies_successful,
             companies_failed, records_upserted, duration_seconds, error_summary)
            VALUES (date('now'), ?, ?, ?, ?, ?, ?, ?)
        """, (tier, attempted, successful, failed, records, duration, errors))

        conn.commit()
        conn.close()

    def run_daily_update(self, dry_run: bool = False) -> Dict:
        """Execute daily price update."""
        start_time = datetime.now()
        logger.info(f"{'[DRY RUN] ' if dry_run else ''}Starting daily price update")

        companies = self.get_companies_for_today()

        if not companies:
            logger.info("No companies to update today")
            return {'status': 'skipped', 'reason': 'no companies'}

        if dry_run:
            # Show country breakdown in dry run
            country_counts = {}
            for c in companies:
                country = c.get('country', 'US') or 'US'
                country_counts[country] = country_counts.get(country, 0) + 1
            logger.info(f"Would update {len(companies)} companies")
            for country, count in sorted(country_counts.items(), key=lambda x: -x[1]):
                logger.info(f"  {country}: {count}")
            return {'status': 'dry_run', 'would_update': len(companies), 'by_country': country_counts}

        # Build mapping from Yahoo symbol back to company (for result lookup)
        # Key: Yahoo symbol (e.g., 'BP.L'), Value: company dict
        yahoo_to_company = {}
        for c in companies:
            yahoo_sym = self.get_yahoo_symbol(c['symbol'], c.get('country'))
            if yahoo_sym:
                yahoo_to_company[yahoo_sym] = c

        yahoo_symbols = list(yahoo_to_company.keys())

        stats = {
            'successful': 0,
            'failed': 0,
            'new_records': 0,
            'updated_records': 0,
            'errors': [],
            'by_country': {}
        }

        total_batches = (len(yahoo_symbols) + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_idx, i in enumerate(range(0, len(yahoo_symbols), BATCH_SIZE)):
            batch_symbols = yahoo_symbols[i:i+BATCH_SIZE]

            try:
                batch_data = self.fetch_recent_prices(batch_symbols)

                # Fetch fundamentals (shares outstanding, market cap) for all companies
                fundamentals = self.fetch_fundamentals(batch_symbols)

                for yahoo_symbol in batch_symbols:
                    company = yahoo_to_company[yahoo_symbol]
                    country = company.get('country', 'US') or 'US'

                    if yahoo_symbol in batch_data and not batch_data[yahoo_symbol].empty:
                        new, updated = self.upsert_prices(
                            company['id'], company['symbol'], batch_data[yahoo_symbol],
                            fundamentals=fundamentals.get(yahoo_symbol)
                        )
                        stats['successful'] += 1
                        stats['new_records'] += new
                        stats['updated_records'] += updated
                        stats['by_country'][country] = stats['by_country'].get(country, 0) + 1
                    else:
                        stats['failed'] += 1

                logger.info(f"Batch {batch_idx+1}/{total_batches}: {len(batch_data)}/{len(batch_symbols)} successful, {len(fundamentals)} fundamentals")

            except Exception as e:
                logger.error(f"Batch error: {e}")
                stats['failed'] += len(batch_symbols)

            if i + BATCH_SIZE < len(yahoo_symbols):
                time.sleep(DELAY_BETWEEN_BATCHES)

        duration = (datetime.now() - start_time).total_seconds()

        self.log_update_run(
            tier=None,
            attempted=len(companies),
            successful=stats['successful'],
            failed=stats['failed'],
            records=stats['new_records'] + stats['updated_records'],
            duration=duration
        )

        logger.info(f"\n{'='*60}")
        logger.info(f"DAILY UPDATE COMPLETE")
        logger.info(f"  Duration: {duration/60:.1f} minutes")
        logger.info(f"  Attempted: {len(companies)}")
        logger.info(f"  Successful: {stats['successful']}")
        logger.info(f"  Failed: {stats['failed']}")
        logger.info(f"  New records: {stats['new_records']}")
        logger.info(f"  Updated records: {stats['updated_records']}")
        logger.info(f"{'='*60}\n")

        return {'status': 'completed', 'duration_seconds': duration, **stats}


class TierManager:
    """Manages tier assignments for companies."""

    def __init__(self, db_path: str):
        self.db_path = db_path

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def mark_sp500_companies(self):
        """Mark S&P 500 companies based on well-known symbols."""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Major S&P 500 companies
        sp500_symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH',
            'XOM', 'JNJ', 'JPM', 'V', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV',
            'LLY', 'PEP', 'KO', 'COST', 'AVGO', 'WMT', 'MCD', 'CSCO', 'TMO', 'ABT',
            'CRM', 'ACN', 'DHR', 'NEE', 'NKE', 'LIN', 'TXN', 'PM', 'UNP', 'WFC',
            'AMD', 'ORCL', 'MS', 'CAT', 'BA', 'INTC', 'IBM', 'HON', 'GE', 'AMGN',
            'RTX', 'QCOM', 'LOW', 'SPGI', 'GS', 'DE', 'ELV', 'INTU', 'BLK', 'ISRG',
            'AXP', 'BKNG', 'MDLZ', 'GILD', 'ADI', 'VRTX', 'SYK', 'TJX', 'REGN', 'PGR',
            'MMC', 'SCHW', 'LRCX', 'CVS', 'CB', 'ZTS', 'CME', 'CI', 'MO', 'SO',
            'DUK', 'SLB', 'BDX', 'EQIX', 'BSX', 'AON', 'ITW', 'PLD', 'CL', 'KLAC',
            'NOC', 'ICE', 'FI', 'EOG', 'SHW', 'MPC', 'APD', 'MCO', 'PNC', 'WM'
        ]

        cursor.execute(f"""
            UPDATE companies SET is_sp500 = 1
            WHERE symbol IN ({','.join(['?']*len(sp500_symbols))})
        """, sp500_symbols)

        count = cursor.rowcount
        conn.commit()
        conn.close()

        logger.info(f"Marked {count} S&P 500 companies")
        return count

    def recalculate_tiers(self):
        """Recalculate priority scores and tier assignments."""
        conn = self.get_connection()
        cursor = conn.cursor()

        logger.info("Recalculating company tiers...")

        # First mark S&P 500
        self.mark_sp500_companies()

        # Calculate priority scores
        cursor.execute("""
            UPDATE companies SET update_priority_score = (
                -- S&P 500 membership
                CASE WHEN is_sp500 = 1 THEN 100 ELSE 0 END
                +
                -- Watchlist
                CASE WHEN id IN (SELECT company_id FROM watchlist) THEN 90 ELSE 0 END
                +
                -- Market cap
                CASE
                    WHEN market_cap > 10000000000 THEN 30
                    WHEN market_cap > 1000000000 THEN 20
                    WHEN market_cap > 100000000 THEN 10
                    ELSE 0
                END
                +
                -- Recent SEC filings
                CASE WHEN id IN (
                    SELECT DISTINCT company_id FROM financial_data
                    WHERE fiscal_date_ending > date('now', '-180 days')
                ) THEN 15 ELSE 0 END
                +
                -- Has recent price data
                CASE WHEN id IN (
                    SELECT DISTINCT company_id FROM daily_prices
                    WHERE date > date('now', '-30 days')
                ) THEN 5 ELSE 0 END
            )
            WHERE symbol IS NOT NULL
              AND symbol != ''
              AND symbol NOT LIKE 'CIK_%'
        """)

        # Assign tiers based on priority score
        cursor.execute("""
            UPDATE companies SET update_tier =
                CASE
                    WHEN update_priority_score >= 80 THEN 1
                    WHEN update_priority_score >= 40 THEN 2
                    WHEN update_priority_score >= 15 THEN 3
                    ELSE 4
                END
            WHERE symbol IS NOT NULL
              AND symbol != ''
              AND symbol NOT LIKE 'CIK_%'
        """)

        conn.commit()

        # Log distribution
        cursor.execute("""
            SELECT
                update_tier,
                COUNT(*) as count,
                ROUND(AVG(update_priority_score), 1) as avg_score
            FROM companies
            WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
            GROUP BY update_tier
            ORDER BY update_tier
        """)

        logger.info("\nTier distribution:")
        for row in cursor.fetchall():
            tier = row['update_tier'] or 3
            tier_name = TIER_CONFIG.get(tier, {}).get('name', 'Unknown')
            logger.info(f"  Tier {tier} ({tier_name}): {row['count']} companies, avg score {row['avg_score']}")

        conn.close()

    def get_update_stats(self) -> Dict:
        """Get statistics about update freshness."""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN last_price_update >= date('now', '-1 day') THEN 1 ELSE 0 END) as fresh_1d,
                SUM(CASE WHEN last_price_update >= date('now', '-3 days') THEN 1 ELSE 0 END) as fresh_3d,
                SUM(CASE WHEN last_price_update >= date('now', '-7 days') THEN 1 ELSE 0 END) as fresh_7d,
                SUM(CASE WHEN last_price_update IS NULL THEN 1 ELSE 0 END) as never_updated
            FROM companies
            WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
        """)

        overall = dict(cursor.fetchone())

        cursor.execute("""
            SELECT
                update_tier,
                COUNT(*) as total,
                SUM(CASE WHEN last_price_update >= date('now', '-1 day') THEN 1 ELSE 0 END) as fresh_1d,
                ROUND(AVG(julianday('now') - julianday(last_price_update)), 1) as avg_age_days
            FROM companies
            WHERE symbol IS NOT NULL AND symbol NOT LIKE 'CIK_%'
            GROUP BY update_tier
            ORDER BY update_tier
        """)

        by_tier = [dict(row) for row in cursor.fetchall()]

        cursor.execute("""
            SELECT * FROM price_update_log
            ORDER BY created_at DESC
            LIMIT 10
        """)

        recent_runs = [dict(row) for row in cursor.fetchall()]

        conn.close()

        return {'overall': overall, 'by_tier': by_tier, 'recent_runs': recent_runs}


class BackfillService:
    """Handles backfilling for companies that missed updates."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.updater = PriceUpdater(db_path)

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def find_stale_companies(self, limit: int = 500) -> List[Dict]:
        """Find companies overdue for updates."""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT id, symbol, name, update_tier, last_price_update
            FROM companies
            WHERE symbol IS NOT NULL
              AND symbol NOT LIKE 'CIK_%'
              AND (
                (update_tier = 1 AND (last_price_update < date('now', '-2 days') OR last_price_update IS NULL))
                OR (update_tier = 2 AND (last_price_update < date('now', '-4 days') OR last_price_update IS NULL))
                OR (update_tier = 3 AND (last_price_update < date('now', '-5 days') OR last_price_update IS NULL))
                OR (update_tier = 4 AND (last_price_update < date('now', '-10 days') OR last_price_update IS NULL))
              )
            ORDER BY update_tier ASC, last_price_update ASC NULLS FIRST
            LIMIT ?
        """, (limit,))

        stale = [dict(row) for row in cursor.fetchall()]
        conn.close()

        logger.info(f"Found {len(stale)} stale companies")
        return stale

    def run_backfill(self, limit: int = 500) -> Dict:
        """Backfill prices for stale companies."""
        logger.info("Starting backfill")

        stale_companies = self.find_stale_companies(limit)

        if not stale_companies:
            return {'status': 'skipped', 'reason': 'no stale companies'}

        symbol_to_company = {c['symbol'].upper(): c for c in stale_companies}
        symbols = list(symbol_to_company.keys())

        stats = {'successful': 0, 'failed': 0, 'records': 0}

        for i in range(0, len(symbols), BATCH_SIZE):
            batch_symbols = symbols[i:i+BATCH_SIZE]

            try:
                batch_data = self.updater.fetch_recent_prices(batch_symbols, days=14)

                for symbol in batch_symbols:
                    company = symbol_to_company[symbol]

                    if symbol in batch_data and not batch_data[symbol].empty:
                        new, updated = self.updater.upsert_prices(
                            company['id'], symbol, batch_data[symbol]
                        )
                        stats['successful'] += 1
                        stats['records'] += new + updated
                    else:
                        stats['failed'] += 1

            except Exception as e:
                logger.error(f"Backfill batch error: {e}")
                stats['failed'] += len(batch_symbols)

            time.sleep(DELAY_BETWEEN_BATCHES)

        logger.info(f"Backfill complete: {stats['successful']} updated, {stats['failed']} failed")
        return stats


def main():
    parser = argparse.ArgumentParser(description='Stock Price Update Service')
    parser.add_argument('--db', default='./data/stocks.db', help='Database path')
    parser.add_argument('--country', '-c', help='Filter by country code (e.g., GB, DE)')
    parser.add_argument('--limit', '-l', type=int, default=100, help='Limit number of companies (for test-country)')
    parser.add_argument('command', choices=['update', 'backfill', 'recalculate-tiers', 'stats', 'dry-run', 'backfill-marketcaps', 'test-country', 'historical-country'],
                       help='Command to execute')
    parser.add_argument('--period', '-p', default='5y', help='Historical period (1y, 2y, 5y, max) for historical-country')

    args = parser.parse_args()

    # Resolve database path
    db_path = args.db
    if not os.path.isabs(db_path):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        db_path = os.path.join(project_root, db_path)

    if args.command == 'update':
        updater = PriceUpdater(db_path)
        updater.run_daily_update()

    elif args.command == 'dry-run':
        updater = PriceUpdater(db_path)
        updater.run_daily_update(dry_run=True)

    elif args.command == 'backfill':
        backfill = BackfillService(db_path)
        backfill.run_backfill()

    elif args.command == 'recalculate-tiers':
        manager = TierManager(db_path)
        manager.recalculate_tiers()

    elif args.command == 'stats':
        manager = TierManager(db_path)
        stats = manager.get_update_stats()

        print("\n=== Update Freshness Stats ===\n")
        print(f"Total companies: {stats['overall']['total']}")
        print(f"Updated in last 1 day: {stats['overall']['fresh_1d']}")
        print(f"Updated in last 3 days: {stats['overall']['fresh_3d']}")
        print(f"Updated in last 7 days: {stats['overall']['fresh_7d']}")
        print(f"Never updated: {stats['overall']['never_updated']}")

        print("\nBy Tier:")
        for tier in stats['by_tier']:
            tier_num = tier['update_tier'] or 3
            tier_name = TIER_CONFIG.get(tier_num, {}).get('name', 'Unknown')
            print(f"  Tier {tier_num} ({tier_name}): {tier['total']} companies, "
                  f"{tier['fresh_1d']} fresh today, avg age {tier['avg_age_days'] or 'N/A'} days")

    elif args.command == 'backfill-marketcaps':
        # Backfill fundamentals (shares outstanding, market cap) for companies missing them
        updater = PriceUpdater(db_path)
        conn = updater.get_connection()
        cursor = conn.cursor()

        # Get companies without shares outstanding or market cap
        cursor.execute("""
            SELECT c.id, c.symbol, c.name
            FROM companies c
            LEFT JOIN price_metrics pm ON pm.company_id = c.id
            WHERE c.symbol IS NOT NULL
              AND c.symbol NOT LIKE 'CIK_%'
              AND LENGTH(c.symbol) <= 6
              AND (pm.shares_outstanding IS NULL OR pm.market_cap IS NULL)
            ORDER BY c.update_tier ASC
            LIMIT 500
        """)

        companies = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not companies:
            print("All companies have fundamentals")
        else:
            print(f"Backfilling fundamentals for {len(companies)} companies...")

            symbols = [c['symbol'] for c in companies]
            symbol_to_id = {c['symbol']: c['id'] for c in companies}

            # Process in batches to avoid rate limiting
            updated = 0
            for i in range(0, len(symbols), 50):
                batch = symbols[i:i+50]
                fundamentals = updater.fetch_fundamentals(batch)

                conn = updater.get_connection()
                cursor = conn.cursor()

                for symbol, data in fundamentals.items():
                    company_id = symbol_to_id.get(symbol)
                    if company_id and data:
                        shares = data.get('shares_outstanding')
                        mcap = data.get('market_cap')
                        if shares or mcap:
                            cursor.execute("""
                                INSERT INTO price_metrics (company_id, shares_outstanding, market_cap, updated_at)
                                VALUES (?, ?, ?, datetime('now'))
                                ON CONFLICT(company_id) DO UPDATE SET
                                    shares_outstanding = COALESCE(excluded.shares_outstanding, price_metrics.shares_outstanding),
                                    market_cap = COALESCE(excluded.market_cap, price_metrics.market_cap),
                                    updated_at = datetime('now')
                            """, (company_id, shares, mcap))
                            updated += 1

                conn.commit()
                conn.close()

                print(f"  Batch {i//50 + 1}: {len(fundamentals)} fetched")
                time.sleep(2)

            print(f"Updated fundamentals for {updated} companies")

    elif args.command == 'test-country':
        # Test price fetching for a specific country (bypasses weekend check)
        if not args.country:
            print("Error: --country/-c is required for test-country command")
            print("Example: python price_updater.py test-country -c GB -l 10")
            sys.exit(1)

        country = args.country.upper()
        limit = args.limit

        updater = PriceUpdater(db_path)
        conn = updater.get_connection()
        cursor = conn.cursor()

        # Get companies for this country
        cursor.execute("""
            SELECT id, symbol, name, country
            FROM companies
            WHERE country = ?
              AND symbol IS NOT NULL
              AND symbol != ''
              AND symbol NOT LIKE 'CIK_%'
              AND LENGTH(symbol) <= 10
              AND LENGTH(symbol) >= 1
              AND symbol NOT LIKE '%/%'
              AND symbol NOT GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9]*'
            ORDER BY RANDOM()
            LIMIT ?
        """, (country, limit))

        companies = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not companies:
            print(f"No companies found for country: {country}")
            sys.exit(1)

        print(f"\n=== Testing Price Fetch for {country} ===")
        print(f"Found {len(companies)} companies to test\n")

        # Convert to Yahoo symbols
        yahoo_to_company = {}
        skipped = 0
        for c in companies:
            yahoo_sym = updater.get_yahoo_symbol(c['symbol'], c['country'])
            if yahoo_sym:
                yahoo_to_company[yahoo_sym] = c
                print(f"  {c['symbol']:10} -> {yahoo_sym:15} ({c['name'][:40]})")
            else:
                print(f"  {c['symbol']:10} -> SKIPPED        (invalid symbol format)")
                skipped += 1

        if skipped:
            print(f"\nSkipped {skipped} invalid symbols")

        print(f"\nFetching prices for {len(yahoo_to_company)} symbols...")

        yahoo_symbols = list(yahoo_to_company.keys())
        batch_data = updater.fetch_recent_prices(yahoo_symbols)

        successful = 0
        failed = 0

        print("\nResults:")
        for yahoo_symbol, company in yahoo_to_company.items():
            if yahoo_symbol in batch_data and not batch_data[yahoo_symbol].empty:
                df = batch_data[yahoo_symbol]
                latest = df.iloc[-1]
                print(f"  ✓ {yahoo_symbol:15} - ${latest['close']:.2f} ({len(df)} days)")

                # Actually save the data
                new, updated = updater.upsert_prices(company['id'], company['symbol'], df)
                successful += 1
            else:
                print(f"  ✗ {yahoo_symbol:15} - No data")
                failed += 1

        print(f"\n=== Summary ===")
        print(f"Successful: {successful}")
        print(f"Failed: {failed}")
        print(f"Success rate: {successful/(successful+failed)*100:.1f}%")

    elif args.command == 'historical-country':
        # Fetch full historical data for a specific country
        if not args.country:
            print("Error: --country/-c is required for historical-country command")
            print("Example: python price_updater.py historical-country -c GB -p 5y")
            sys.exit(1)

        country = args.country.upper()
        period = args.period
        limit = args.limit if args.limit != 100 else None  # None means no limit

        updater = PriceUpdater(db_path)
        conn = updater.get_connection()
        cursor = conn.cursor()

        # Get all companies for this country with valid tickers
        query = """
            SELECT id, symbol, name, country
            FROM companies
            WHERE country = ?
              AND symbol IS NOT NULL
              AND symbol != ''
              AND symbol NOT LIKE 'CIK_%'
              AND LENGTH(symbol) <= 10
              AND LENGTH(symbol) >= 1
              AND symbol NOT GLOB '*[0-9][0-9][0-9][0-9][0-9][0-9]*'
            ORDER BY id
        """
        if limit:
            query += f" LIMIT {limit}"

        cursor.execute(query, (country,))
        companies = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not companies:
            print(f"No companies found for country: {country}")
            sys.exit(1)

        print(f"\n=== Historical Price Fetch for {country} ({period}) ===")
        print(f"Found {len(companies)} companies\n")

        # Build Yahoo symbol mapping
        yahoo_to_company = {}
        for c in companies:
            yahoo_sym = updater.get_yahoo_symbol(c['symbol'], c['country'])
            if yahoo_sym:
                yahoo_to_company[yahoo_sym] = c

        print(f"Valid symbols: {len(yahoo_to_company)}")

        # Process in batches
        yahoo_symbols = list(yahoo_to_company.keys())
        batch_size = 50  # Smaller batches for historical data
        total_batches = (len(yahoo_symbols) + batch_size - 1) // batch_size

        total_new = 0
        total_updated = 0
        successful = 0
        failed = 0

        for batch_idx in range(total_batches):
            start = batch_idx * batch_size
            end = min(start + batch_size, len(yahoo_symbols))
            batch_symbols = yahoo_symbols[start:end]

            print(f"\nBatch {batch_idx + 1}/{total_batches} ({len(batch_symbols)} symbols)...")

            try:
                # Fetch historical data
                data = yf.download(batch_symbols, period=period, progress=False, group_by='ticker')

                batch_new = 0
                batch_updated = 0
                batch_success = 0
                batch_fail = 0

                for yahoo_symbol in batch_symbols:
                    company = yahoo_to_company[yahoo_symbol]

                    try:
                        # Handle single vs multiple ticker response format
                        if len(batch_symbols) == 1:
                            df = data.copy()
                        else:
                            if yahoo_symbol not in data.columns.get_level_values(0):
                                batch_fail += 1
                                continue
                            df = data[yahoo_symbol].copy()

                        if df.empty or df['Close'].isna().all():
                            batch_fail += 1
                            continue

                        # Format dataframe
                        df = df.reset_index()
                        df.columns = [col.lower() if isinstance(col, str) else col[0].lower() for col in df.columns]
                        df = df.rename(columns={'date': 'date', 'adj close': 'adj_close'})
                        df['date'] = pd.to_datetime(df['date']).dt.date
                        df = df.dropna(subset=['close'])

                        if not df.empty:
                            new, updated = updater.upsert_prices(company['id'], company['symbol'], df)
                            batch_new += new
                            batch_updated += updated
                            batch_success += 1
                        else:
                            batch_fail += 1

                    except Exception as e:
                        batch_fail += 1

                total_new += batch_new
                total_updated += batch_updated
                successful += batch_success
                failed += batch_fail

                print(f"  Success: {batch_success}, Failed: {batch_fail}, New records: {batch_new}, Updated: {batch_updated}")

                # Rate limiting
                if batch_idx < total_batches - 1:
                    time.sleep(3)

            except Exception as e:
                print(f"  Batch error: {e}")
                failed += len(batch_symbols)

        print(f"\n=== Final Summary ===")
        print(f"Companies successful: {successful}")
        print(f"Companies failed: {failed}")
        print(f"Success rate: {successful/(successful+failed)*100:.1f}%" if (successful+failed) > 0 else "N/A")
        print(f"Total new records: {total_new}")
        print(f"Total updated records: {total_updated}")


if __name__ == '__main__':
    main()
