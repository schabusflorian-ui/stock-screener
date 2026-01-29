#!/usr/bin/env python3
"""Calculate portfolio performance for famous investors using 13F holdings and price data."""

import sqlite3
import pandas as pd
from datetime import datetime

DB_PATH = 'data/stocks.db'

def get_investor_quarterly_returns(investor_name: str) -> pd.DataFrame:
    """Calculate quarterly weighted returns for an investor's portfolio."""
    conn = sqlite3.connect(DB_PATH)

    # Get all report dates for this investor
    dates_df = pd.read_sql_query("""
        SELECT DISTINCT h.report_date
        FROM investor_holdings h
        JOIN famous_investors fi ON h.investor_id = fi.id
        WHERE fi.name = ?
        ORDER BY h.report_date
    """, conn, params=[investor_name])

    dates = dates_df['report_date'].tolist()

    results = []

    for i in range(len(dates) - 1):
        start_date = dates[i]
        end_date = dates[i + 1]

        # Get holdings at start with weights
        holdings_df = pd.read_sql_query("""
            SELECT
                c.symbol,
                c.id as company_id,
                SUM(h.market_value) as position_value
            FROM investor_holdings h
            JOIN famous_investors fi ON h.investor_id = fi.id
            JOIN companies c ON h.company_id = c.id
            WHERE fi.name = ? AND h.report_date = ?
              AND c.symbol IS NOT NULL
            GROUP BY c.id
        """, conn, params=[investor_name, start_date])

        if holdings_df.empty:
            continue

        total_value = holdings_df['position_value'].sum()
        holdings_df['weight'] = holdings_df['position_value'] / total_value

        # Get prices for each holding
        weighted_returns = []
        for _, row in holdings_df.iterrows():
            prices = pd.read_sql_query("""
                SELECT date, close
                FROM daily_prices
                WHERE company_id = ?
                  AND date IN (
                      (SELECT MAX(date) FROM daily_prices WHERE company_id = ? AND date <= ?),
                      (SELECT MAX(date) FROM daily_prices WHERE company_id = ? AND date <= ?)
                  )
                ORDER BY date
            """, conn, params=[row['company_id'], row['company_id'], start_date,
                              row['company_id'], end_date])

            if len(prices) >= 2:
                start_price = prices.iloc[0]['close']
                end_price = prices.iloc[-1]['close']
                if start_price > 0:
                    stock_return = (end_price - start_price) / start_price
                    weighted_return = row['weight'] * stock_return
                    weighted_returns.append(weighted_return)

        if weighted_returns:
            quarterly_return = sum(weighted_returns)
            results.append({
                'start_date': start_date,
                'end_date': end_date,
                'positions': len(weighted_returns),
                'quarterly_return': quarterly_return * 100
            })

    conn.close()
    return pd.DataFrame(results)


def get_all_investors_performance():
    """Calculate performance for all famous investors."""
    conn = sqlite3.connect(DB_PATH)

    investors = pd.read_sql_query("""
        SELECT fi.name, COUNT(DISTINCT h.report_date) as quarters
        FROM famous_investors fi
        JOIN investor_holdings h ON fi.id = h.investor_id
        GROUP BY fi.id
        HAVING quarters > 1
        ORDER BY quarters DESC
    """, conn)
    conn.close()

    all_results = []

    for _, inv in investors.iterrows():
        print(f"Processing {inv['name']}...")
        try:
            returns_df = get_investor_quarterly_returns(inv['name'])
            if not returns_df.empty:
                # Calculate cumulative return
                cumulative = 1.0
                for ret in returns_df['quarterly_return']:
                    cumulative *= (1 + ret/100)

                total_return = (cumulative - 1) * 100
                avg_quarterly = returns_df['quarterly_return'].mean()
                annualized = ((1 + avg_quarterly/100) ** 4 - 1) * 100

                all_results.append({
                    'investor': inv['name'],
                    'quarters': len(returns_df),
                    'start_date': returns_df['start_date'].iloc[0],
                    'end_date': returns_df['end_date'].iloc[-1],
                    'avg_quarterly': avg_quarterly,
                    'annualized': annualized,
                    'total_return': total_return
                })
        except Exception as e:
            print(f"  Error: {e}")

    return pd.DataFrame(all_results)


if __name__ == '__main__':
    print("=" * 80)
    print("FAMOUS INVESTORS - PORTFOLIO PERFORMANCE (Based on 13F Holdings + Price Data)")
    print("=" * 80)
    print()

    # Calculate for all investors
    results = get_all_investors_performance()

    if not results.empty:
        results = results.sort_values('annualized', ascending=False)

        print("\n" + "=" * 80)
        print("SUMMARY - Annualized Portfolio Returns")
        print("=" * 80)
        print(f"{'Investor':<20} {'Quarters':>8} {'Start':>12} {'End':>12} {'Avg Qtr':>10} {'Annual':>10} {'Total':>12}")
        print("-" * 80)

        for _, row in results.iterrows():
            print(f"{row['investor']:<20} {row['quarters']:>8} {row['start_date']:>12} {row['end_date']:>12} "
                  f"{row['avg_quarterly']:>9.1f}% {row['annualized']:>9.1f}% {row['total_return']:>11.1f}%")

    print()
