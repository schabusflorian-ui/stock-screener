#!/usr/bin/env python3
"""
ESMA Prospectus Register Fetcher

Fetches prospectus approvals from the ESMA (European Securities and Markets Authority)
Prospectus Register. Covers all EU countries via passporting system.

Data Source: https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_priii_documents

Usage:
    python esma_prospectus_fetcher.py --days 7                    # Last 7 days
    python esma_prospectus_fetcher.py --days 30 --country DE      # Germany, 30 days
    python esma_prospectus_fetcher.py --output /tmp/prospectuses.json  # Custom output

Output:
    JSON file with prospectus data including:
    - Company name, LEI
    - Approval date, home member state
    - Document type, prospectus URL
    - Securities information
"""

import argparse
import json
import logging
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode
import urllib.request

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ESMA Prospectus Register API
# The Solr endpoint is the actual data source
ESMA_SOLR_URL = "https://registers.esma.europa.eu/solr/esma_registers_priii_documents/select"
ESMA_SEARCH_URL = "https://registers.esma.europa.eu/publication/searchRegister"

# EU Country codes (ISO 3166-1 alpha-2)
EU_COUNTRIES = {
    'AT': 'Austria',
    'BE': 'Belgium',
    'BG': 'Bulgaria',
    'HR': 'Croatia',
    'CY': 'Cyprus',
    'CZ': 'Czech Republic',
    'DK': 'Denmark',
    'EE': 'Estonia',
    'FI': 'Finland',
    'FR': 'France',
    'DE': 'Germany',
    'GR': 'Greece',
    'HU': 'Hungary',
    'IE': 'Ireland',
    'IT': 'Italy',
    'LV': 'Latvia',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'MT': 'Malta',
    'NL': 'Netherlands',
    'PL': 'Poland',
    'PT': 'Portugal',
    'RO': 'Romania',
    'SK': 'Slovakia',
    'SI': 'Slovenia',
    'ES': 'Spain',
    'SE': 'Sweden',
    # EEA countries (not EU but in ESMA)
    'IS': 'Iceland',
    'LI': 'Liechtenstein',
    'NO': 'Norway',
}

# Document types relevant to IPOs
IPO_DOCUMENT_TYPES = [
    'Prospectus',
    'Base Prospectus',
    'Registration Document',
    'EU Growth prospectus',
    'Simplified prospectus for secondary issuances',
]


class ESMAProspectusFetcher:
    """Fetches prospectus data from ESMA register."""

    def __init__(self, user_agent: str = "Investment Project Prospectus Fetcher"):
        self.user_agent = user_agent
        self.session_start = datetime.now()

    def _make_request(self, url: str, max_retries: int = 3) -> dict:
        """Make HTTP request with proper headers and retry logic."""
        headers = {
            'User-Agent': self.user_agent,
            'Accept': 'application/json',
        }

        request = urllib.request.Request(url, headers=headers)

        for attempt in range(max_retries):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    data = response.read().decode('utf-8')
                    return json.loads(data)
            except urllib.error.HTTPError as e:
                logger.error(f"HTTP Error {e.code}: {e.reason}")
                raise
            except urllib.error.URLError as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2  # 2, 4, 6 seconds
                    logger.warning(f"Connection error, retrying in {wait_time}s... ({attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    logger.error(f"URL Error after {max_retries} attempts: {e.reason}")
                    raise
            except json.JSONDecodeError as e:
                logger.error(f"JSON decode error: {e}")
                raise

        return {}

    def fetch_prospectuses(
        self,
        days: int = 30,
        country: Optional[str] = None,
        document_types: Optional[list] = None,
        limit: int = 500
    ) -> list:
        """
        Fetch prospectus approvals from ESMA register.

        Uses the ESMA public search API which provides JSON responses.

        Args:
            days: Number of days to look back
            country: Filter by home member state (ISO 2-letter code)
            document_types: Filter by document type
            limit: Maximum results to return

        Returns:
            List of prospectus records
        """
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # Format dates as YYYY-MM-DD for ESMA
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')

        logger.info(f"Fetching ESMA prospectuses: {days} days, country={country or 'all'}")

        # Build Solr query
        # Key field mappings from ESMA Solr:
        # - prospectus_type_code: STDA (Standalone = IPO), BPRO (Base Prospectus = bonds)
        # - document_type: FTWS (Final Terms), SUPP (Supplement), BPWO (Base Prospectus without FT)
        #
        # For IPOs we want: Standalone prospectuses (STDA) that are NOT supplements

        fq_parts = [
            'type_s:parent',  # Only parent documents, not child records
            f'approval_filing_date:[{start_str}T00:00:00Z TO {end_str}T23:59:59Z]',
            '-document_type:FTWS',  # Exclude Final Terms (updates to existing programs)
            '-document_type:SUPP',  # Exclude Supplements
        ]

        # For IPO-only mode, filter to standalone prospectuses (equity offerings)
        # Base prospectuses (BPRO) are typically for bond/debt issuance programs

        # Country filter
        if country:
            country = country.upper()
            if country not in EU_COUNTRIES:
                logger.warning(f"Unknown country code: {country}")
            fq_parts.append(f'home_member_state_code:{country}')

        # Build URL with query parameters
        # Solr requires separate fq parameters for AND logic
        query_parts = [
            ('q', '*:*'),
            ('rows', str(limit)),
            ('wt', 'json'),
            ('sort', 'approval_filing_date desc'),
        ]
        for fq in fq_parts:
            query_parts.append(('fq', fq))

        url = f"{ESMA_SOLR_URL}?{urlencode(query_parts)}"

        try:
            response = self._make_request(url)
            docs = response.get('response', {}).get('docs', [])
            total = response.get('response', {}).get('numFound', len(docs))

            logger.info(f"Found {total} prospectuses via Solr API, returning {len(docs)}")
            return self._parse_documents(docs)

        except Exception as e:
            logger.error(f"Solr API request failed: {e}")
            return []

    def fetch_all_countries(
        self,
        days: int = 365,
        ipo_only: bool = True,
        limit_per_country: int = 200
    ) -> list:
        """
        Fetch prospectuses from ALL EU/EEA countries.

        This avoids the global search limit issue where only 1000 results are returned
        but 6000+ exist. By searching country-by-country, we get complete coverage.

        Args:
            days: Number of days to look back
            ipo_only: If True, filter to likely IPOs only
            limit_per_country: Max results per country (200 is usually enough)

        Returns:
            List of all prospectus records, deduplicated
        """
        # Major IPO markets first, then others
        priority_countries = ['DE', 'FR', 'NL', 'ES', 'SE', 'IT', 'NO', 'PL', 'RO', 'BE', 'AT']
        other_countries = [c for c in EU_COUNTRIES.keys() if c not in priority_countries]
        all_countries = priority_countries + other_countries

        all_results = []
        seen_ids = set()

        logger.info(f"Fetching ESMA prospectuses from {len(all_countries)} countries ({days} days)")

        for country in all_countries:
            try:
                results = self.fetch_prospectuses(
                    days=days,
                    country=country,
                    limit=limit_per_country
                )

                # Filter to IPOs if requested
                if ipo_only:
                    results = [r for r in results if r.get('is_ipo')]

                # Deduplicate by document_id
                for r in results:
                    doc_id = r.get('document_id')
                    if doc_id and doc_id not in seen_ids:
                        seen_ids.add(doc_id)
                        all_results.append(r)

            except Exception as e:
                logger.warning(f"Error fetching {country}: {e}")
                continue

        logger.info(f"Total: {len(all_results)} unique prospectuses from all countries")
        return all_results

    def _parse_documents(self, docs: list) -> list:
        """Parse ESMA Solr document records into standardized format."""
        results = []

        for doc in docs:
            try:
                # Extract entity/party name (issuer) and LEI
                # Format: "Company Name - LEI_CODE" or "Company Name - "
                party_name = doc.get('party_name', '').strip()
                lei = None
                entity_name = party_name

                # LEI is 20 alphanumeric characters
                if ' - ' in party_name:
                    parts = party_name.rsplit(' - ', 1)
                    entity_name = parts[0].strip()
                    if len(parts) > 1 and len(parts[1]) == 20:
                        lei = parts[1].strip()

                # Extract ISINs (may be comma-separated)
                isins = doc.get('instrument_isins', '')
                isin = isins.split(',')[0].strip() if isins else None

                # Parse approval date
                approval_date = doc.get('approval_filing_date', '')
                if approval_date and 'T' in approval_date:
                    approval_date = approval_date.split('T')[0]

                # Build prospectus URL using national document ID
                document_id = doc.get('id')
                national_doc_id = doc.get('national_document_id')
                prospectus_url = None
                if document_id:
                    prospectus_url = f"https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_priii_documents#documentId={document_id}"

                # Get document type info
                doc_type = doc.get('document_type', '')
                doc_type_descr = doc.get('document_type_descr', '')

                record = {
                    'source': 'ESMA',
                    'document_id': document_id,
                    'national_document_id': national_doc_id,
                    'entity_name': entity_name,
                    'lei': lei,
                    'isin': isin,
                    'document_type': doc_type,
                    'document_type_descr': doc_type_descr,
                    'approval_date': approval_date,
                    'home_member_state': doc.get('home_member_state_code'),
                    'home_member_state_descr': doc.get('home_member_state_descr'),
                    'host_member_states': doc.get('member_states', ''),
                    'prospectus_type': doc.get('prospectus_type_code'),
                    'prospectus_type_descr': doc.get('prospectus_type_descr'),
                    'prospectus_url': prospectus_url,
                    'is_passported': doc.get('is_passported') == '1',
                    'raw_data': doc,  # Keep raw data for debugging
                }

                # Determine if this is likely an IPO
                record['is_ipo'] = self._is_likely_ipo(doc)

                results.append(record)

            except Exception as e:
                logger.warning(f"Error parsing document: {e}")
                continue

        return results

    def _fetch_via_web_scraping(
        self,
        start_date: str,
        end_date: str,
        country: Optional[str],
        limit: int
    ) -> list:
        """
        Fallback method: Fetch prospectuses via web scraping.

        The ESMA search page loads data via JavaScript, so we construct
        the URL parameters to get the search results page.
        """
        logger.info("Attempting web scraping fallback...")

        # Build search URL with parameters
        params = {
            'core': 'esma_registers_priii_documents',
            'filterQueries': f'approval_date:[{start_date}T00:00:00Z TO {end_date}T23:59:59Z]'
        }

        if country:
            params['filterQueries'] += f' AND home_member_state:{country}'

        url = f"{ESMA_SEARCH_URL}?{urlencode(params)}"

        headers = {
            'User-Agent': self.user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }

        request = urllib.request.Request(url, headers=headers)

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                html = response.read().decode('utf-8')

                # The page loads data dynamically, but we can extract any
                # embedded JSON data or table data
                # For now, log that we reached the page
                logger.info(f"Web scraping: Retrieved search page ({len(html)} bytes)")

                # Look for embedded JSON data
                json_match = re.search(r'var\s+searchResults\s*=\s*(\[.*?\]);', html, re.DOTALL)
                if json_match:
                    try:
                        data = json.loads(json_match.group(1))
                        logger.info(f"Found embedded JSON with {len(data)} results")
                        return self._parse_documents(data)
                    except json.JSONDecodeError:
                        pass

                # Alternative: Parse HTML table if present
                # This is complex and may not be needed if API works
                logger.warning("Web scraping: Could not extract structured data from page")
                return []

        except Exception as e:
            logger.error(f"Web scraping failed: {e}")
            return []

    def _is_likely_ipo(self, doc: dict) -> bool:
        """
        Determine if a prospectus is likely for an IPO vs other offering.

        IPO indicators based on ESMA Solr field values:
        - prospectus_type_code: STDA (Standalone) = likely equity IPO
        - prospectus_type_code: BPRO (Base Prospectus) = usually bonds/debt
        - document_type: FTWS (Final Terms), SUPP (Supplement) = updates

        We also filter out known non-IPO entities:
        - Major banks (they file prospectuses for bond issuances)
        - Securitization vehicles (SPVs for structured products)
        - Already-listed companies doing secondary offerings
        """
        doc_type = doc.get('document_type', '')
        prospectus_type = doc.get('prospectus_type_code', '')
        doc_type_descr = doc.get('document_type_descr', '').lower()
        prospectus_descr = doc.get('prospectus_type_descr', '').lower()

        # Get entity name for filtering
        party_name = doc.get('party_name', '').upper()
        entity_name = party_name.split(' - ')[0].strip() if ' - ' in party_name else party_name

        # ===== EXCLUDE NON-IPO ENTITIES =====

        # Major banks - they file prospectuses for bond programs, not IPOs
        bank_keywords = [
            'BANK', 'BANQUE', 'BANKA', 'BANCO', 'CREDIT', 'CRÉDIT',
            'CITIGROUP', 'MORGAN STANLEY', 'GOLDMAN SACHS', 'JP MORGAN',
            'HSBC', 'BARCLAYS', 'DEUTSCHE BANK', 'BNP PARIBAS', 'ING ',
            'SOCIETE GENERALE', 'SOCIÉTÉ GÉNÉRALE', 'NATWEST', 'LLOYDS',
            'SANTANDER', 'BBVA', 'UNICREDIT', 'INTESA', 'COMMERZBANK',
            'NORDEA', 'DANSKE', 'RABOBANK', 'ABN AMRO', 'CREDIT SUISSE',
            'UBS ', 'STANDARD CHARTERED', 'NOMURA', 'MIZUHO', 'DAIWA'
        ]
        if any(kw in entity_name for kw in bank_keywords):
            return False

        # Securitization vehicles and SPVs
        spv_keywords = [
            'SECURITISATION', 'SECURITIZATION', 'TITULIZACION',
            'S.R.L.', 'SRL', 'DESIGNATED ACTIVITY COMPANY', 'DAC',
            'RMBS', 'CMBS', 'ABS ', 'CLO ', 'CDO ',
            'SPECIAL PURPOSE', 'SPV', 'FUNDING', 'ISSUER',
            'COVERED BOND', 'PFANDBRIEF', 'FONDO DE'
        ]
        if any(kw in entity_name for kw in spv_keywords):
            return False

        # Export credit agencies and government entities
        gov_keywords = [
            'EXPORTKREDIT', 'EXPORT CREDIT', 'GOVERNMENT', 'SOVEREIGN',
            'TREASURY', 'REPUBLIC OF', 'KINGDOM OF', 'STATE OF'
        ]
        if any(kw in entity_name for kw in gov_keywords):
            return False

        # Investment funds and asset managers (existing entities)
        fund_keywords = [
            'FUND', 'FONDS', 'INVESTMENT', 'ASSET MANAGEMENT',
            'CAPITAL PARTNERS', 'HOLDING', 'HOLDINGS'
        ]
        # Only exclude if it looks like an existing fund, not a new company
        # Note: Some legitimate IPOs have "Holdings" in name, so be careful

        # ETP/ETN issuers
        if 'ETP' in entity_name or 'ETN' in entity_name:
            return False

        # Swedish companies ending in AB are often already-listed doing secondary offerings
        # These include: Prisma Properties, Obducat, Magnolia Bostad, etc.
        # Note: This is a heuristic - some legitimate IPOs come from Sweden
        # The issue is ESMA doesn't distinguish IPO vs secondary offering
        swedish_secondary_keywords = [
            'PROPERTIES', 'BOSTAD', 'FASTIGHETER', 'FINANS',
            'LIFESCIENCE', 'LIFECARE', 'BIOTECH'
        ]
        if entity_name.endswith(' AB') or entity_name.endswith(' AB (PUBL)'):
            # Swedish AB companies filing prospectuses are often secondary offerings
            # Real Swedish IPOs are rare - most list on Nasdaq First North without EU prospectus
            if any(kw in entity_name for kw in swedish_secondary_keywords):
                return False

        # Norwegian ASA companies - often secondary offerings
        if ' ASA' in entity_name:
            # Check for known secondary offering patterns
            if any(kw in entity_name for kw in ['REACH', 'DOF', 'PROTECTOR', 'AIRTHINGS']):
                return False

        # ===== DOCUMENT TYPE FILTERS =====

        # Base prospectus is usually for bond/debt programs, not equity IPOs
        if prospectus_type == 'BPRO' or 'base prospectus' in prospectus_descr:
            return False

        # Supplements are updates, not initial offerings
        if doc_type == 'SUPP' or 'supplement' in doc_type_descr:
            return False

        # Final terms are for existing programs
        if doc_type == 'FTWS' or 'final terms' in doc_type_descr:
            return False

        # ===== POSITIVE IPO INDICATORS =====

        # Standalone prospectuses are typically for equity IPOs
        if prospectus_type == 'STDA' or 'standalone' in prospectus_descr:
            return True

        # EU Growth prospectuses are for SME listings
        if 'growth' in prospectus_descr:
            return True

        return False

    def fetch_by_lei(self, lei: str) -> list:
        """Fetch all prospectuses for a specific LEI."""
        params = {
            'q': f'lei:{lei}',
            'rows': 100,
            'sort': 'approval_date desc',
            'wt': 'json',
        }

        url = f"{ESMA_BASE_URL}?{urlencode(params)}"

        try:
            response = self._make_request(url)
            docs = response.get('response', {}).get('docs', [])
            return self._parse_documents(docs)
        except Exception as e:
            logger.error(f"Failed to fetch by LEI {lei}: {e}")
            return []


def main():
    parser = argparse.ArgumentParser(
        description='Fetch prospectus approvals from ESMA register'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=30,
        help='Number of days to look back (default: 30)'
    )
    parser.add_argument(
        '--country',
        type=str,
        default=None,
        help='Filter by country code (e.g., DE, FR, NL)'
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
        default=500,
        help='Maximum results (default: 500)'
    )
    parser.add_argument(
        '--ipo-only',
        action='store_true',
        help='Only return likely IPO prospectuses'
    )
    parser.add_argument(
        '--lei',
        type=str,
        default=None,
        help='Fetch by specific LEI'
    )
    parser.add_argument(
        '--list-countries',
        action='store_true',
        help='List available country codes'
    )
    parser.add_argument(
        '--all-countries',
        action='store_true',
        help='Fetch from ALL EU/EEA countries (avoids global search limit issue)'
    )

    args = parser.parse_args()

    # List countries mode
    if args.list_countries:
        print("Available EU/EEA country codes:")
        for code, name in sorted(EU_COUNTRIES.items()):
            print(f"  {code}: {name}")
        return

    # Initialize fetcher
    fetcher = ESMAProspectusFetcher()

    # Fetch by LEI mode
    if args.lei:
        logger.info(f"Fetching prospectuses for LEI: {args.lei}")
        results = fetcher.fetch_by_lei(args.lei)
    elif args.all_countries:
        # Fetch from all countries to avoid global search limit
        logger.info(f"Fetching from ALL EU/EEA countries ({args.days} days)")
        results = fetcher.fetch_all_countries(
            days=args.days,
            ipo_only=args.ipo_only,
            limit_per_country=args.limit
        )
    else:
        # Standard fetch (single country or global with limit)
        results = fetcher.fetch_prospectuses(
            days=args.days,
            country=args.country,
            limit=args.limit
        )
        # Filter to IPO-only if requested
        if args.ipo_only:
            results = [r for r in results if r.get('is_ipo', False)]
            logger.info(f"Filtered to {len(results)} likely IPO prospectuses")

    # Remove raw_data for cleaner output
    for r in results:
        r.pop('raw_data', None)

    # Output
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump({
                'fetched_at': datetime.now().isoformat(),
                'params': {
                    'days': args.days,
                    'country': args.country,
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

    # Summary
    if results:
        by_country = {}
        for r in results:
            country = r.get('home_member_state', 'Unknown')
            by_country[country] = by_country.get(country, 0) + 1

        logger.info("Prospectuses by country:")
        for country, count in sorted(by_country.items(), key=lambda x: -x[1]):
            country_name = EU_COUNTRIES.get(country, country)
            logger.info(f"  {country} ({country_name}): {count}")


if __name__ == '__main__':
    main()
