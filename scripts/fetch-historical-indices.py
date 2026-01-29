#!/usr/bin/env python3
"""
Fetch historical index data from 2009 to present using yfinance.
Updates the market_index_prices table with extended historical data.
"""

import yfinance as yf
import sqlite3
from datetime import datetime
import sys
import os

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'stocks.db')

# Indices to fetch
INDICES = {
    '^GSPC': 'S&P 500',
    '^DJI': 'Dow Jones Industrial Average',
    '^IXIC': 'NASDAQ Composite',
    '^RUT': 'Russell 2000'
}

def get_index_id(conn, symbol):
    """Get or create index ID from market_indices table"""
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM market_indices WHERE symbol = ?", (symbol,))
    row = cursor.fetchone()
    if row:
        return row[0]
    return None

def fetch_and_store_index(conn, symbol, name, start_date='2009-01-01'):
    """Fetch index data from Yahoo Finance and store in database"""
    print(f"\nFetching {name} ({symbol})...")

    # Get index ID
    index_id = get_index_id(conn, symbol)
    if not index_id:
        print(f"  Warning: Index {symbol} not found in market_indices table")
        return 0

    # Check existing data range
    cursor = conn.cursor()
    cursor.execute("""
        SELECT MIN(date), MAX(date), COUNT(*)
        FROM market_index_prices
        WHERE index_id = ?
    """, (index_id,))
    existing = cursor.fetchone()
    print(f"  Existing data: {existing[2]} records from {existing[0]} to {existing[1]}")

    # Fetch data from Yahoo Finance
    try:
        ticker = yf.Ticker(symbol)
        df = ticker.history(start=start_date, end=datetime.now().strftime('%Y-%m-%d'))

        if df.empty:
            print(f"  No data returned from Yahoo Finance")
            return 0

        print(f"  Fetched {len(df)} records from {df.index[0].date()} to {df.index[-1].date()}")

        # Insert/update records
        inserted = 0
        updated = 0

        for date, row in df.iterrows():
            date_str = date.strftime('%Y-%m-%d')

            # Check if record exists
            cursor.execute("""
                SELECT id FROM market_index_prices
                WHERE index_id = ? AND date = ?
            """, (index_id, date_str))

            existing_row = cursor.fetchone()

            if existing_row:
                # Update existing record
                cursor.execute("""
                    UPDATE market_index_prices
                    SET open = ?, high = ?, low = ?, close = ?, volume = ?
                    WHERE id = ?
                """, (
                    float(row['Open']) if row['Open'] else None,
                    float(row['High']) if row['High'] else None,
                    float(row['Low']) if row['Low'] else None,
                    float(row['Close']) if row['Close'] else None,
                    int(row['Volume']) if row['Volume'] else None,
                    existing_row[0]
                ))
                updated += 1
            else:
                # Insert new record
                cursor.execute("""
                    INSERT INTO market_index_prices (index_id, date, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    index_id,
                    date_str,
                    float(row['Open']) if row['Open'] else None,
                    float(row['High']) if row['High'] else None,
                    float(row['Low']) if row['Low'] else None,
                    float(row['Close']) if row['Close'] else None,
                    int(row['Volume']) if row['Volume'] else None
                ))
                inserted += 1

        conn.commit()
        print(f"  Inserted: {inserted}, Updated: {updated}")
        return inserted + updated

    except Exception as e:
        print(f"  Error fetching {symbol}: {e}")
        return 0

def main():
    print("=" * 60)
    print("Historical Index Data Fetcher")
    print("Fetching data from 2009 to present")
    print("=" * 60)

    # Connect to database
    conn = sqlite3.connect(DB_PATH)

    total_records = 0

    for symbol, name in INDICES.items():
        records = fetch_and_store_index(conn, symbol, name, start_date='2009-01-01')
        total_records += records

    # Show final stats
    print("\n" + "=" * 60)
    print("Final Statistics:")
    print("=" * 60)

    cursor = conn.cursor()
    cursor.execute("""
        SELECT mi.symbol, mi.name, MIN(mip.date) as earliest, MAX(mip.date) as latest, COUNT(*) as count
        FROM market_index_prices mip
        JOIN market_indices mi ON mip.index_id = mi.id
        GROUP BY mi.id
        ORDER BY mi.symbol
    """)

    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[4]} records from {row[2]} to {row[3]}")

    conn.close()
    print(f"\nTotal records processed: {total_records}")

if __name__ == '__main__':
    main()
