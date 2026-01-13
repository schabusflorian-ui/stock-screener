#!/usr/bin/env python3
"""
SIX Swiss Exchange IPO Fetcher

Fetches IPO data from SIX Swiss Exchange.
Switzerland is not in the EU, so their IPOs are not in ESMA.

Supports multiple methods:
1. Finnhub API (requires FINNHUB_API_KEY env var) - recommended
2. SIX news feed scraping (fallback)

Usage:
    python six_swiss_fetcher.py [--days 365] [--output FILE]

Environment:
    FINNHUB_API_KEY - Finnhub API key (free at finnhub.io)
"""

import argparse
import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

SIX_IPO_URL = "https://www.six-group.com/en/market-data/shares/ipo-history.html"

# Request headers to mimic browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}


class SIXSwissFetcher:
    """Fetches IPO data from SIX Swiss Exchange."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.finnhub_key = os.environ.get('FINNHUB_API_KEY')

    def fetch_ipos(self, days: int = 365) -> list:
        """
        Fetch IPOs from SIX Swiss Exchange.

        Tries Finnhub API first (if key available), falls back to web scraping.

        Args:
            days: Number of days to look back

        Returns:
            List of IPO records
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        logger.info(f"Fetching SIX Swiss IPOs from last {days} days (since {cutoff_date.date()})")

        # Try Finnhub first if API key is available
        if self.finnhub_key:
            ipos = self._fetch_from_finnhub(days)
            if ipos:
                return ipos
            logger.warning("Finnhub returned no results, trying fallback")

        # Fallback to web scraping
        return self._fetch_from_web(cutoff_date)

    def _fetch_from_finnhub(self, days: int) -> list:
        """Fetch Swiss IPOs from Finnhub API."""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        url = "https://finnhub.io/api/v1/calendar/ipo"
        params = {
            'from': start_date.strftime('%Y-%m-%d'),
            'to': end_date.strftime('%Y-%m-%d'),
            'token': self.finnhub_key
        }

        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            ipos = []
            for item in data.get('ipoCalendar', []):
                # Filter for Swiss exchange
                exchange = item.get('exchange', '').upper()
                if 'SIX' in exchange or 'SWISS' in exchange or item.get('country') == 'CH':
                    ipos.append({
                        'source': 'Finnhub',
                        'company_name': item.get('name'),
                        'ticker': item.get('symbol'),
                        'listing_date': item.get('date'),
                        'issue_price': item.get('price'),
                        'shares_offered': item.get('numberOfShares'),
                        'deal_size': item.get('totalSharesValue'),
                        'currency': 'CHF',
                        'exchange': 'SIX Swiss Exchange',
                        'country': 'Switzerland',
                        'region': 'EU',
                        'home_member_state': 'CH',
                        'status': item.get('status', 'expected'),
                    })

            logger.info(f"Finnhub returned {len(ipos)} Swiss IPOs")
            return ipos

        except Exception as e:
            logger.error(f"Finnhub API error: {e}")
            return []

    def _fetch_from_web(self, cutoff_date: datetime) -> list:
        """Fallback: scrape SIX website for IPO data."""

        try:
            response = self.session.get(SIX_IPO_URL, timeout=30)
            response.raise_for_status()
        except requests.RequestException as e:
            logger.error(f"Failed to fetch SIX IPO page: {e}")
            return []

        soup = BeautifulSoup(response.text, 'html.parser')
        ipos = []

        # Find the IPO table - SIX uses a data table with IPO listings
        # The page uses JavaScript to load data, so we need to find the data source
        # or parse whatever static content is available

        # Look for table rows with IPO data
        tables = soup.find_all('table')

        for table in tables:
            rows = table.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 3:
                    ipo = self._parse_row(cells, cutoff_date)
                    if ipo:
                        ipos.append(ipo)

        # Also try to find JSON data embedded in page
        scripts = soup.find_all('script')
        for script in scripts:
            if script.string and 'ipo' in script.string.lower():
                json_ipos = self._extract_json_data(script.string, cutoff_date)
                ipos.extend(json_ipos)

        # Deduplicate by company name
        seen = set()
        unique_ipos = []
        for ipo in ipos:
            if ipo['company_name'] not in seen:
                seen.add(ipo['company_name'])
                unique_ipos.append(ipo)

        logger.info(f"Found {len(unique_ipos)} Swiss IPOs")
        return unique_ipos

    def _parse_row(self, cells: list, cutoff_date: datetime) -> Optional[dict]:
        """Parse a table row into IPO record."""
        try:
            # Extract text from cells
            texts = [cell.get_text(strip=True) for cell in cells]

            # Skip header rows
            if any(t.lower() in ['date', 'company', 'symbol', 'listing date'] for t in texts[:3]):
                return None

            # Try to find date and company name
            date_str = None
            company_name = None
            symbol = None
            issue_price = None

            for i, text in enumerate(texts):
                # Check for date pattern (various formats)
                date_match = re.search(r'(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2})', text)
                if date_match and not date_str:
                    date_str = date_match.group(1)
                # Check for ticker symbol (2-5 uppercase letters)
                elif re.match(r'^[A-Z]{2,5}$', text) and not symbol:
                    symbol = text
                # Check for price (number with CHF or just number)
                elif re.match(r'^[\d.,]+(\s*CHF)?$', text.replace(' ', '')) and not issue_price:
                    price_text = re.sub(r'[^\d.,]', '', text)
                    try:
                        issue_price = float(price_text.replace(',', '.'))
                    except ValueError:
                        pass
                # Otherwise might be company name (longer text)
                elif len(text) > 5 and not company_name and not date_match:
                    company_name = text

            if not company_name or not date_str:
                return None

            # Parse date
            listing_date = self._parse_date(date_str)
            if not listing_date or listing_date < cutoff_date:
                return None

            return {
                'source': 'SIX',
                'company_name': company_name,
                'ticker': symbol,
                'listing_date': listing_date.strftime('%Y-%m-%d'),
                'issue_price': issue_price,
                'currency': 'CHF',
                'exchange': 'SIX Swiss Exchange',
                'country': 'Switzerland',
                'region': 'EU',  # We track Swiss as EU region for our purposes
                'home_member_state': 'CH',
            }

        except Exception as e:
            logger.debug(f"Error parsing row: {e}")
            return None

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date string in various formats."""
        formats = [
            '%Y-%m-%d',
            '%d.%m.%Y',
            '%d/%m/%Y',
            '%m/%d/%Y',
            '%d.%m.%y',
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        return None

    def _extract_json_data(self, script_content: str, cutoff_date: datetime) -> list:
        """Try to extract IPO data from embedded JSON."""
        ipos = []

        # Look for JSON arrays or objects
        json_pattern = r'\[[\s\S]*?\]|\{[\s\S]*?\}'
        matches = re.findall(json_pattern, script_content)

        for match in matches:
            try:
                data = json.loads(match)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and 'name' in item:
                            ipo = self._parse_json_item(item, cutoff_date)
                            if ipo:
                                ipos.append(ipo)
            except json.JSONDecodeError:
                continue

        return ipos

    def _parse_json_item(self, item: dict, cutoff_date: datetime) -> Optional[dict]:
        """Parse a JSON item into IPO record."""
        try:
            company_name = item.get('name') or item.get('company') or item.get('companyName')
            if not company_name:
                return None

            date_str = item.get('date') or item.get('listingDate') or item.get('ipoDate')
            if date_str:
                listing_date = self._parse_date(date_str)
                if listing_date and listing_date < cutoff_date:
                    return None
            else:
                listing_date = None

            return {
                'source': 'SIX',
                'company_name': company_name,
                'ticker': item.get('symbol') or item.get('ticker'),
                'listing_date': listing_date.strftime('%Y-%m-%d') if listing_date else None,
                'issue_price': item.get('issuePrice') or item.get('price'),
                'currency': 'CHF',
                'exchange': 'SIX Swiss Exchange',
                'country': 'Switzerland',
                'region': 'EU',
                'home_member_state': 'CH',
            }
        except Exception as e:
            logger.debug(f"Error parsing JSON item: {e}")
            return None


def main():
    parser = argparse.ArgumentParser(
        description='Fetch IPOs from SIX Swiss Exchange'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=365,
        help='Number of days to look back (default: 365)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Output JSON file path'
    )

    args = parser.parse_args()

    fetcher = SIXSwissFetcher()
    ipos = fetcher.fetch_ipos(days=args.days)

    result = {
        'source': 'SIX Swiss Exchange',
        'count': len(ipos),
        'fetched_at': datetime.now().isoformat(),
        'ipos': ipos
    }

    output = json.dumps(result, indent=2, ensure_ascii=False)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        logger.info(f"Wrote {len(ipos)} IPOs to {args.output}")
    else:
        print(output)


if __name__ == '__main__':
    main()
