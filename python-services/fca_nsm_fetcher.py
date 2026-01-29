#!/usr/bin/env python3
"""
FCA National Storage Mechanism (NSM) Fetcher

Fetches prospectus documents from the UK FCA National Storage Mechanism.
The NSM is the official repository for UK regulatory disclosures including
prospectuses approved by the FCA UKLA.

Data Source: https://data.fca.org.uk/

Usage:
    python fca_nsm_fetcher.py --days 30                     # Last 30 days
    python fca_nsm_fetcher.py --output /tmp/uk_prosp.json   # Custom output
    python fca_nsm_fetcher.py --lei 2138001WXZQOPMPA3D50    # Search by LEI

Output:
    JSON file with prospectus data including:
    - Company name, LEI
    - Approval date, document type
    - Prospectus URL
"""

import argparse
import json
import logging
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode, quote
import urllib.request

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FCA NSM API endpoints
FCA_NSM_BASE_URL = "https://data.fca.org.uk"
FCA_NSM_SEARCH_URL = f"{FCA_NSM_BASE_URL}/nsm"

# Document categories that indicate prospectuses/IPOs
PROSPECTUS_CATEGORIES = [
    'Prospectus',
    'Registration document',
    'Securities note',
    'Summary',
    'Supplementary prospectus',
    'Final terms',
]


class FCANSMFetcher:
    """Fetches prospectus data from UK FCA National Storage Mechanism."""

    def __init__(self, user_agent: str = "Investment Project UK Prospectus Fetcher"):
        self.user_agent = user_agent
        self.session_start = datetime.now()

    def _make_request(self, url: str) -> str:
        """Make HTTP request with proper headers, returns HTML/text."""
        headers = {
            'User-Agent': self.user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }

        request = urllib.request.Request(url, headers=headers)

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            logger.error(f"HTTP Error {e.code}: {e.reason}")
            raise
        except urllib.error.URLError as e:
            logger.error(f"URL Error: {e.reason}")
            raise

    def fetch_prospectuses(
        self,
        days: int = 30,
        limit: int = 100
    ) -> list:
        """
        Fetch recent prospectus documents from FCA NSM.

        Args:
            days: Number of days to look back
            limit: Maximum results to return

        Returns:
            List of prospectus records
        """
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')

        logger.info(f"Fetching FCA NSM prospectuses: {days} days")

        results = []

        # The FCA NSM portal uses a search interface
        # We'll search for prospectus-related documents
        search_terms = ['prospectus', 'admission', 'listing']

        for term in search_terms:
            try:
                docs = self._search_nsm(term, start_str, end_str, limit // len(search_terms))
                results.extend(docs)
            except Exception as e:
                logger.warning(f"Search for '{term}' failed: {e}")
                continue

        # Deduplicate by document ID
        seen = set()
        unique_results = []
        for doc in results:
            doc_id = doc.get('document_id')
            if doc_id and doc_id not in seen:
                seen.add(doc_id)
                unique_results.append(doc)

        logger.info(f"Found {len(unique_results)} unique prospectus documents")
        return unique_results

    def _search_nsm(
        self,
        search_term: str,
        start_date: str,
        end_date: str,
        limit: int
    ) -> list:
        """
        Search FCA NSM for documents matching criteria.

        The FCA NSM uses a form-based search interface.
        """
        # Build search URL
        params = {
            'q': search_term,
            'from': start_date,
            'to': end_date,
            'category': 'Prospectus',
        }

        url = f"{FCA_NSM_SEARCH_URL}/search?{urlencode(params)}"

        try:
            html = self._make_request(url)
            return self._parse_nsm_results(html)
        except Exception as e:
            logger.warning(f"NSM search failed for '{search_term}': {e}")
            return []

    def _parse_nsm_results(self, html: str) -> list:
        """
        Parse FCA NSM search results HTML.

        The NSM results page contains a table with document listings.
        """
        results = []

        # Look for document entries in the HTML
        # Pattern depends on actual NSM page structure
        # This is a generic pattern - may need adjustment based on actual HTML

        # Try to find table rows with document data
        doc_pattern = re.compile(
            r'<tr[^>]*class="[^"]*document[^"]*"[^>]*>.*?</tr>',
            re.DOTALL | re.IGNORECASE
        )

        for match in doc_pattern.finditer(html):
            row_html = match.group(0)
            doc = self._parse_document_row(row_html)
            if doc:
                results.append(doc)

        # Alternative: Look for JSON-LD structured data
        json_ld_pattern = re.compile(
            r'<script type="application/ld\+json">(.*?)</script>',
            re.DOTALL
        )

        for match in json_ld_pattern.finditer(html):
            try:
                data = json.loads(match.group(1))
                if isinstance(data, list):
                    for item in data:
                        doc = self._parse_json_ld_document(item)
                        if doc:
                            results.append(doc)
                elif isinstance(data, dict):
                    doc = self._parse_json_ld_document(data)
                    if doc:
                        results.append(doc)
            except json.JSONDecodeError:
                continue

        return results

    def _parse_document_row(self, row_html: str) -> Optional[dict]:
        """Parse a single document row from NSM results table."""
        # Extract company name
        name_match = re.search(r'<td[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)</td>', row_html, re.DOTALL)
        company_name = name_match.group(1).strip() if name_match else None

        # Extract LEI
        lei_match = re.search(r'LEI[:\s]*([A-Z0-9]{20})', row_html)
        lei = lei_match.group(1) if lei_match else None

        # Extract date
        date_match = re.search(r'(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})', row_html)
        filing_date = date_match.group(1) if date_match else None

        # Extract document URL
        url_match = re.search(r'href="([^"]*(?:pdf|document)[^"]*)"', row_html, re.IGNORECASE)
        doc_url = url_match.group(1) if url_match else None
        if doc_url and not doc_url.startswith('http'):
            doc_url = f"{FCA_NSM_BASE_URL}{doc_url}"

        # Extract document type
        type_match = re.search(r'<td[^>]*class="[^"]*type[^"]*"[^>]*>(.*?)</td>', row_html, re.DOTALL)
        doc_type = type_match.group(1).strip() if type_match else 'Prospectus'

        if company_name:
            # Clean up company name
            company_name = re.sub(r'<[^>]+>', '', company_name).strip()

            return {
                'source': 'FCA_NSM',
                'entity_name': company_name,
                'lei': lei,
                'document_type': doc_type,
                'filing_date': filing_date,
                'prospectus_url': doc_url,
                'region': 'UK',
                'regulator': 'FCA',
                'is_ipo': self._is_likely_ipo(doc_type, company_name),
            }

        return None

    def _parse_json_ld_document(self, data: dict) -> Optional[dict]:
        """Parse JSON-LD structured data into document record."""
        if data.get('@type') not in ['Document', 'DigitalDocument', 'Report']:
            return None

        return {
            'source': 'FCA_NSM',
            'entity_name': data.get('name') or data.get('about', {}).get('name'),
            'lei': data.get('identifier'),
            'document_type': data.get('additionalType', 'Prospectus'),
            'filing_date': data.get('datePublished'),
            'prospectus_url': data.get('url'),
            'region': 'UK',
            'regulator': 'FCA',
            'is_ipo': True,
        }

    def _is_likely_ipo(self, doc_type: str, company_name: str) -> bool:
        """Determine if document is likely for an IPO."""
        doc_type_lower = (doc_type or '').lower()

        # Supplements are updates, not initial offerings
        if 'supplement' in doc_type_lower:
            return False

        # Final terms are for existing programs
        if 'final terms' in doc_type_lower:
            return False

        # Registration documents and full prospectuses are likely IPOs
        if any(kw in doc_type_lower for kw in ['prospectus', 'registration', 'admission']):
            return True

        return False

    def fetch_by_lei(self, lei: str) -> list:
        """Fetch all prospectuses for a specific LEI from FCA NSM."""
        logger.info(f"Fetching FCA NSM documents for LEI: {lei}")

        params = {'lei': lei}
        url = f"{FCA_NSM_SEARCH_URL}/search?{urlencode(params)}"

        try:
            html = self._make_request(url)
            return self._parse_nsm_results(html)
        except Exception as e:
            logger.error(f"Failed to fetch by LEI {lei}: {e}")
            return []

    def fetch_by_company_name(self, name: str) -> list:
        """Search FCA NSM by company name."""
        logger.info(f"Searching FCA NSM for company: {name}")

        params = {'q': name, 'category': 'Prospectus'}
        url = f"{FCA_NSM_SEARCH_URL}/search?{urlencode(params)}"

        try:
            html = self._make_request(url)
            return self._parse_nsm_results(html)
        except Exception as e:
            logger.error(f"Failed to search for '{name}': {e}")
            return []


def main():
    parser = argparse.ArgumentParser(
        description='Fetch prospectus documents from UK FCA NSM'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=30,
        help='Number of days to look back (default: 30)'
    )
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Output JSON file path'
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=100,
        help='Maximum results (default: 100)'
    )
    parser.add_argument(
        '--lei',
        type=str,
        default=None,
        help='Fetch by specific LEI'
    )
    parser.add_argument(
        '--company',
        type=str,
        default=None,
        help='Search by company name'
    )
    parser.add_argument(
        '--ipo-only',
        action='store_true',
        help='Only return likely IPO prospectuses'
    )

    args = parser.parse_args()

    # Initialize fetcher
    fetcher = FCANSMFetcher()

    # Fetch based on mode
    if args.lei:
        results = fetcher.fetch_by_lei(args.lei)
    elif args.company:
        results = fetcher.fetch_by_company_name(args.company)
    else:
        results = fetcher.fetch_prospectuses(
            days=args.days,
            limit=args.limit
        )

    # Filter to IPO-only if requested
    if args.ipo_only:
        results = [r for r in results if r.get('is_ipo', False)]
        logger.info(f"Filtered to {len(results)} likely IPO prospectuses")

    # Output
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump({
                'fetched_at': datetime.now().isoformat(),
                'params': {
                    'days': args.days,
                    'limit': args.limit,
                    'ipo_only': args.ipo_only,
                },
                'count': len(results),
                'prospectuses': results,
            }, f, indent=2, default=str)
        logger.info(f"Saved {len(results)} prospectuses to {output_path}")
    else:
        # Print to stdout as JSON
        print(json.dumps({
            'count': len(results),
            'prospectuses': results,
        }, indent=2, default=str))


if __name__ == '__main__':
    main()
