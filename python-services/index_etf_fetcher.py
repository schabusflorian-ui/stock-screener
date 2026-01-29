"""
Index ETF Price Fetcher
Fetches and updates price data for market index ETFs (SPY, QQQ, etc.)
Used for calculating alpha (performance vs benchmark)
"""

import yfinance as yf
import sqlite3
from datetime import datetime, timedelta
import argparse
import sys

def get_index_symbols(conn):
    """Get all index ETF symbols from database."""
    cursor = conn.cursor()
    cursor.execute("SELECT symbol FROM index_prices")
    return [row[0] for row in cursor.fetchall()]

def fetch_index_prices(symbols):
    """Fetch current prices and metrics for index symbols."""
    results = {}

    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)

            # Get 1 year of history for calculations
            hist = ticker.history(period="1y")

            if hist.empty:
                print(f"  ⚠️  No data for {symbol}")
                continue

            # Current price
            last_price = hist['Close'].iloc[-1]
            last_date = hist.index[-1].strftime('%Y-%m-%d')

            # 52-week high/low
            high_52w = hist['Close'].max()
            low_52w = hist['Close'].min()

            # Calculate changes
            def pct_change(current, previous):
                if previous and previous != 0:
                    return ((current - previous) / previous) * 100
                return None

            closes = hist['Close'].tolist()

            change_1d = pct_change(closes[-1], closes[-2]) if len(closes) > 1 else None
            change_1w = pct_change(closes[-1], closes[-5]) if len(closes) > 5 else None
            change_1m = pct_change(closes[-1], closes[-21]) if len(closes) > 21 else None
            change_3m = pct_change(closes[-1], closes[-63]) if len(closes) > 63 else None
            change_6m = pct_change(closes[-1], closes[-126]) if len(closes) > 126 else None
            change_1y = pct_change(closes[-1], closes[0]) if len(closes) > 200 else None

            # YTD calculation
            current_year = datetime.now().year
            ytd_mask = hist.index.year == current_year
            if ytd_mask.any():
                ytd_closes = hist.loc[ytd_mask, 'Close']
                if len(ytd_closes) > 0:
                    ytd_start = ytd_closes.iloc[0]
                    change_ytd = pct_change(closes[-1], ytd_start)
                else:
                    change_ytd = None
            else:
                change_ytd = None

            # Moving averages
            sma_50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else None
            sma_200 = sum(closes[-200:]) / 200 if len(closes) >= 200 else None

            # RSI (14-day)
            rsi_14 = None
            if len(closes) >= 15:
                gains = []
                losses = []
                for i in range(1, 15):
                    diff = closes[-i] - closes[-i-1]
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

            results[symbol] = {
                'last_price': round(last_price, 2),
                'last_price_date': last_date,
                'high_52w': round(high_52w, 2),
                'low_52w': round(low_52w, 2),
                'change_1d': round(change_1d, 2) if change_1d else None,
                'change_1w': round(change_1w, 2) if change_1w else None,
                'change_1m': round(change_1m, 2) if change_1m else None,
                'change_3m': round(change_3m, 2) if change_3m else None,
                'change_6m': round(change_6m, 2) if change_6m else None,
                'change_1y': round(change_1y, 2) if change_1y else None,
                'change_ytd': round(change_ytd, 2) if change_ytd else None,
                'sma_50': round(sma_50, 2) if sma_50 else None,
                'sma_200': round(sma_200, 2) if sma_200 else None,
                'rsi_14': round(rsi_14, 2) if rsi_14 else None
            }

            d1 = f"{change_1d:+.1f}%" if change_1d else "-"
            ytd = f"{change_ytd:+.1f}%" if change_ytd else "-"
            print(f"  ✅ {symbol}: ${last_price:.2f} (1D: {d1}, YTD: {ytd})")

        except Exception as e:
            print(f"  ❌ {symbol}: {e}")

    return results

def update_index_prices(conn, results):
    """Update index prices in database."""
    cursor = conn.cursor()

    for symbol, data in results.items():
        cursor.execute("""
            UPDATE index_prices SET
                last_price = ?,
                last_price_date = ?,
                high_52w = ?,
                low_52w = ?,
                change_1d = ?,
                change_1w = ?,
                change_1m = ?,
                change_3m = ?,
                change_6m = ?,
                change_1y = ?,
                change_ytd = ?,
                sma_50 = ?,
                sma_200 = ?,
                rsi_14 = ?,
                updated_at = datetime('now')
            WHERE symbol = ?
        """, (
            data['last_price'],
            data['last_price_date'],
            data['high_52w'],
            data['low_52w'],
            data['change_1d'],
            data['change_1w'],
            data['change_1m'],
            data['change_3m'],
            data['change_6m'],
            data['change_1y'],
            data['change_ytd'],
            data['sma_50'],
            data['sma_200'],
            data['rsi_14'],
            symbol
        ))

    conn.commit()
    return len(results)

def calculate_alpha(conn):
    """Calculate alpha for all stocks based on SPY benchmark."""
    cursor = conn.cursor()

    # Get benchmark data
    cursor.execute("""
        SELECT change_1d, change_1w, change_1m, change_3m, change_6m, change_1y, change_ytd
        FROM index_prices
        WHERE is_primary = 1
        LIMIT 1
    """)
    benchmark = cursor.fetchone()

    if not benchmark:
        print("  ⚠️  No primary benchmark found")
        return 0

    print(f"  Benchmark (SPY): 1D={benchmark[0]:.1f}%, YTD={benchmark[6]:.1f}%, 1Y={benchmark[5]:.1f}%")

    # Update alpha for all price_metrics
    cursor.execute("""
        UPDATE price_metrics SET
            alpha_1d = CASE WHEN change_1d IS NOT NULL THEN change_1d - ? ELSE NULL END,
            alpha_1w = CASE WHEN change_1w IS NOT NULL THEN change_1w - ? ELSE NULL END,
            alpha_1m = CASE WHEN change_1m IS NOT NULL THEN change_1m - ? ELSE NULL END,
            alpha_3m = CASE WHEN change_3m IS NOT NULL THEN change_3m - ? ELSE NULL END,
            alpha_6m = CASE WHEN change_6m IS NOT NULL THEN change_6m - ? ELSE NULL END,
            alpha_1y = CASE WHEN change_1y IS NOT NULL THEN change_1y - ? ELSE NULL END,
            alpha_ytd = CASE WHEN change_ytd IS NOT NULL THEN change_ytd - ? ELSE NULL END,
            benchmark_symbol = 'SPY'
        WHERE company_id IS NOT NULL
    """, benchmark)

    conn.commit()
    return cursor.rowcount

def main():
    parser = argparse.ArgumentParser(description='Index ETF Price Fetcher')
    parser.add_argument('--db', default='./data/stocks.db', help='Database path')
    parser.add_argument('command', nargs='?', default='update',
                       choices=['update', 'alpha', 'status'],
                       help='Command to run')

    args = parser.parse_args()

    conn = sqlite3.connect(args.db)

    if args.command == 'update':
        print("\n📊 Updating index ETF prices...")

        # Get symbols
        symbols = get_index_symbols(conn)
        print(f"   Found {len(symbols)} index ETFs to update\n")

        # Fetch prices
        results = fetch_index_prices(symbols)

        # Update database
        updated = update_index_prices(conn, results)
        print(f"\n✅ Updated {updated} index ETFs")

        # Calculate alpha
        print("\n📈 Calculating alpha for all stocks...")
        alpha_count = calculate_alpha(conn)
        print(f"✅ Updated alpha for {alpha_count} stocks")

    elif args.command == 'alpha':
        print("\n📈 Calculating alpha for all stocks...")
        alpha_count = calculate_alpha(conn)
        print(f"✅ Updated alpha for {alpha_count} stocks")

    elif args.command == 'status':
        cursor = conn.cursor()
        cursor.execute("""
            SELECT symbol, name, last_price, change_1d, change_ytd, updated_at
            FROM index_prices
            ORDER BY is_primary DESC, index_type, symbol
        """)
        indices = cursor.fetchall()

        print("\n📊 Index ETF Status:")
        print(f"{'Symbol':<8} {'Name':<40} {'Price':>10} {'1D':>8} {'YTD':>8} {'Updated'}")
        print("-" * 90)

        for idx in indices:
            symbol, name, price, d1, ytd, updated = idx
            price_str = f"${price:.2f}" if price else "-"
            d1_str = f"{d1:+.1f}%" if d1 is not None else "-"
            ytd_str = f"{ytd:+.1f}%" if ytd is not None else "-"
            name_short = name[:38] + ".." if name and len(name) > 40 else (name or "")
            print(f"{symbol:<8} {name_short:<40} {price_str:>10} {d1_str:>8} {ytd_str:>8} {updated or '-'}")

    conn.close()
    print()

if __name__ == '__main__':
    main()
