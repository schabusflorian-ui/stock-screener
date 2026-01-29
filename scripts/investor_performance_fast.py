#!/usr/bin/env python3
"""Fast portfolio performance calculation using bulk price lookups."""

import sqlite3
import pandas as pd
from datetime import datetime

DB_PATH = 'data/stocks.db'

def calculate_all_returns():
    """Calculate returns for all investors using bulk queries."""
    conn = sqlite3.connect(DB_PATH)

    print("Loading holdings data...")
    # Get all holdings with weights calculated
    holdings = pd.read_sql_query("""
        WITH totals AS (
            SELECT investor_id, report_date, SUM(market_value) as total_value
            FROM investor_holdings
            GROUP BY investor_id, report_date
        )
        SELECT
            fi.name as investor_name,
            h.investor_id,
            h.report_date,
            c.id as company_id,
            c.symbol,
            SUM(h.market_value) as position_value,
            SUM(h.market_value) * 1.0 / t.total_value as weight
        FROM investor_holdings h
        JOIN famous_investors fi ON h.investor_id = fi.id
        JOIN companies c ON h.company_id = c.id
        JOIN totals t ON h.investor_id = t.investor_id AND h.report_date = t.report_date
        WHERE c.symbol IS NOT NULL
        GROUP BY h.investor_id, h.report_date, c.id
    """, conn)

    print(f"Loaded {len(holdings):,} holdings records")

    # Get unique dates needed
    dates = holdings['report_date'].unique()
    print(f"Need prices for {len(dates)} quarter-end dates")

    # Build quarter-end price lookup
    print("Loading price data...")
    prices_query = """
        SELECT
            company_id,
            date,
            close
        FROM daily_prices
        WHERE date IN ({})
    """.format(','.join([f"'{d}'" for d in dates]))

    prices = pd.read_sql_query(prices_query, conn)
    print(f"Loaded {len(prices):,} price records")

    # Also get closest prior dates for missing prices
    missing_query = """
        WITH needed AS (
            SELECT DISTINCT company_id, report_date
            FROM investor_holdings h
            JOIN companies c ON h.company_id = c.id
            WHERE c.symbol IS NOT NULL
        )
        SELECT n.company_id, n.report_date,
               (SELECT close FROM daily_prices dp
                WHERE dp.company_id = n.company_id AND dp.date <= n.report_date
                ORDER BY date DESC LIMIT 1) as close
        FROM needed n
    """
    print("Loading fallback prices (this may take a moment)...")
    fallback_prices = pd.read_sql_query(missing_query, conn)
    print(f"Loaded {len(fallback_prices):,} fallback price records")

    conn.close()

    # Create price lookup dict
    price_lookup = {}
    for _, row in fallback_prices.iterrows():
        if row['close'] and row['close'] > 0:
            price_lookup[(row['company_id'], row['report_date'])] = row['close']

    print("Calculating returns...")

    # Get unique investor-date pairs
    investor_dates = holdings.groupby(['investor_name', 'investor_id', 'report_date']).size().reset_index()
    investor_dates = investor_dates.sort_values(['investor_id', 'report_date'])

    results = []

    for inv_id in holdings['investor_id'].unique():
        inv_data = holdings[holdings['investor_id'] == inv_id].copy()
        inv_name = inv_data['investor_name'].iloc[0]
        dates = sorted(inv_data['report_date'].unique())

        quarterly_returns = []

        for i in range(len(dates) - 1):
            start_date = dates[i]
            end_date = dates[i + 1]

            # Get holdings at start
            period_holdings = inv_data[inv_data['report_date'] == start_date]

            weighted_returns = []
            for _, h in period_holdings.iterrows():
                start_price = price_lookup.get((h['company_id'], start_date))
                end_price = price_lookup.get((h['company_id'], end_date))

                if start_price and end_price and start_price > 0:
                    stock_return = (end_price - start_price) / start_price
                    weighted_returns.append(h['weight'] * stock_return)

            if weighted_returns:
                qtr_return = sum(weighted_returns)
                quarterly_returns.append({
                    'start': start_date,
                    'end': end_date,
                    'return': qtr_return
                })

        if quarterly_returns:
            # Calculate cumulative return
            cumulative = 1.0
            for qr in quarterly_returns:
                cumulative *= (1 + qr['return'])

            total_return = (cumulative - 1) * 100
            avg_qtr = sum(qr['return'] for qr in quarterly_returns) / len(quarterly_returns) * 100
            annualized = ((1 + avg_qtr/100) ** 4 - 1) * 100

            results.append({
                'investor': inv_name,
                'quarters': len(quarterly_returns),
                'start': quarterly_returns[0]['start'],
                'end': quarterly_returns[-1]['end'],
                'avg_qtr': avg_qtr,
                'annualized': annualized,
                'total': total_return
            })

    return pd.DataFrame(results)


if __name__ == '__main__':
    print("=" * 90)
    print("FAMOUS INVESTORS - PORTFOLIO PERFORMANCE")
    print("(Calculated from 13F Holdings + Historical Price Data)")
    print("=" * 90)
    print()

    results = calculate_all_returns()

    if not results.empty:
        results = results.sort_values('annualized', ascending=False)

        print("\n" + "=" * 90)
        print("PERFORMANCE SUMMARY - Based on Weighted Holdings Returns")
        print("=" * 90)
        print()
        print(f"{'Investor':<20} {'Qtrs':>6} {'Start':>12} {'End':>12} {'Avg Qtr':>10} {'Annual':>10} {'Total':>12}")
        print("-" * 90)

        for _, row in results.iterrows():
            print(f"{row['investor']:<20} {row['quarters']:>6} {row['start']:>12} {row['end']:>12} "
                  f"{row['avg_qtr']:>9.1f}% {row['annualized']:>9.1f}% {row['total']:>11.1f}%")

        print()
        print("Notes:")
        print("- Returns are based on price changes of disclosed 13F holdings")
        print("- Does not account for: cash, derivatives, short positions, or intra-quarter trading")
        print("- This is a proxy measure, not actual fund performance")
