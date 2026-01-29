#!/usr/bin/env python3
"""
Fetch Yahoo Finance data for a German company
Usage: python3 fetch_yahoo_german.py SAP.DE
"""

import yfinance as yf
import json
import sys
import warnings
import math

warnings.filterwarnings('ignore')

def safe_float(val):
    """Convert to float, handling NaN and None"""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (TypeError, ValueError):
        return None

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'No ticker provided'}))
        sys.exit(1)

    ticker = sys.argv[1]

    try:
        stock = yf.Ticker(ticker)
        info = stock.info

        # Get quarterly financials for historical data
        qf = stock.quarterly_financials
        quarterly_data = []
        if qf is not None and not qf.empty:
            for col in qf.columns[:8]:  # Last 8 quarters
                period_data = {
                    'period_end': col.strftime('%Y-%m-%d'),
                    'revenue': safe_float(qf.loc['Total Revenue', col]) if 'Total Revenue' in qf.index else None,
                    'operating_income': safe_float(qf.loc['Operating Income', col]) if 'Operating Income' in qf.index else None,
                    'net_income': safe_float(qf.loc['Net Income', col]) if 'Net Income' in qf.index else None,
                    'ebitda': safe_float(qf.loc['EBITDA', col]) if 'EBITDA' in qf.index else None,
                }
                quarterly_data.append(period_data)

        # Get balance sheet
        bs = stock.quarterly_balance_sheet
        balance_sheet = {}
        if bs is not None and not bs.empty and len(bs.columns) > 0:
            latest = bs.columns[0]
            balance_sheet = {
                'total_assets': safe_float(bs.loc['Total Assets', latest]) if 'Total Assets' in bs.index else None,
                'total_liabilities': safe_float(bs.loc['Total Liabilities Net Minority Interest', latest]) if 'Total Liabilities Net Minority Interest' in bs.index else None,
                'total_equity': safe_float(bs.loc['Stockholders Equity', latest]) if 'Stockholders Equity' in bs.index else None,
                'total_debt': safe_float(bs.loc['Total Debt', latest]) if 'Total Debt' in bs.index else None,
                'cash': safe_float(bs.loc['Cash And Cash Equivalents', latest]) if 'Cash And Cash Equivalents' in bs.index else None,
            }

        # Get cash flow
        cf = stock.quarterly_cashflow
        cash_flow = {}
        if cf is not None and not cf.empty and len(cf.columns) > 0:
            latest = cf.columns[0]
            cash_flow = {
                'operating_cash_flow': safe_float(cf.loc['Operating Cash Flow', latest]) if 'Operating Cash Flow' in cf.index else None,
                'capital_expenditure': safe_float(cf.loc['Capital Expenditure', latest]) if 'Capital Expenditure' in cf.index else None,
                'free_cash_flow': safe_float(cf.loc['Free Cash Flow', latest]) if 'Free Cash Flow' in cf.index else None,
            }

        result = {
            'success': True,
            'ticker': ticker,
            'name': info.get('shortName') or info.get('longName'),
            'sector': info.get('sector'),
            'industry': info.get('industry'),
            'country': info.get('country', 'Germany'),
            'currency': info.get('currency', 'EUR'),
            'exchange': info.get('exchange'),
            'market_cap': safe_float(info.get('marketCap')),
            'current_price': safe_float(info.get('currentPrice')),
            'trailing_pe': safe_float(info.get('trailingPE')),
            'forward_pe': safe_float(info.get('forwardPE')),
            'dividend_yield': safe_float(info.get('dividendYield')),
            'info': {
                'revenue': safe_float(info.get('totalRevenue')),
                'net_income': safe_float(info.get('netIncomeToCommon')),
                'total_debt': safe_float(info.get('totalDebt')),
                'total_cash': safe_float(info.get('totalCash')),
                'profit_margins': safe_float(info.get('profitMargins')),
                'operating_margins': safe_float(info.get('operatingMargins')),
                'roe': safe_float(info.get('returnOnEquity')),
                'roa': safe_float(info.get('returnOnAssets')),
            },
            'balance_sheet': balance_sheet,
            'cash_flow': cash_flow,
            'quarterly_data': quarterly_data,
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'success': False, 'ticker': ticker, 'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    main()
