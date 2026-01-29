#!/usr/bin/env python3
"""
Bundesanzeiger Scraper using Playwright

Fetches financial reports from the German Federal Gazette (Bundesanzeiger)
using a headless browser to handle JavaScript-heavy pages.

Usage:
  python3 bundesanzeiger_scraper.py "SAP SE"
  python3 bundesanzeiger_scraper.py "Siemens AG" --limit 5
  python3 bundesanzeiger_scraper.py --bulk-import  # Import all DAX 40 companies
"""

import asyncio
import json
import re
import sys
import argparse
import sqlite3
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from playwright.async_api import async_playwright, Page, Browser

# DAX 40 companies for bulk import
DAX_COMPANIES = [
    "SAP SE", "Siemens AG", "Allianz SE", "Deutsche Telekom AG", "Airbus SE",
    "Merck KGaA", "Deutsche Post AG", "Münchener Rück AG", "BASF SE", "BMW AG",
    "Infineon Technologies AG", "Mercedes-Benz Group AG", "Volkswagen AG", "adidas AG",
    "Deutsche Börse AG", "Deutsche Bank AG", "Beiersdorf AG", "Henkel AG",
    "E.ON SE", "RWE AG", "Continental AG", "HeidelbergCement AG", "Fresenius SE",
    "Fresenius Medical Care AG", "Vonovia SE", "Symrise AG", "Siemens Healthineers AG",
    "QIAGEN NV", "Siemens Energy AG", "Zalando SE", "Hannover Rück SE",
    "MTU Aero Engines AG", "Porsche Automobil Holding SE", "Porsche AG",
    "Sartorius AG", "Brenntag SE", "Covestro AG", "Puma SE", "Rheinmetall AG",
    "Commerzbank AG"
]


class BundesanzeigerScraper:
    """Scraper for German Federal Gazette (Bundesanzeiger) financial reports."""

    BASE_URL = "https://www.bundesanzeiger.de"
    SEARCH_URL = f"{BASE_URL}/pub/de/suche"

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    async def __aenter__(self):
        playwright = await async_playwright().start()
        self.browser = await playwright.chromium.launch(headless=self.headless)
        self.page = await self.browser.new_page()
        # Set a realistic user agent
        await self.page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        })
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            await self.browser.close()

    async def _dismiss_cookie_banner(self):
        """Dismiss the cookie consent banner if present."""
        try:
            # Try multiple common cookie consent button selectors
            selectors = [
                'button:has-text("Alle akzeptieren")',
                'button:has-text("Akzeptieren")',
                'button:has-text("Accept")',
                '#cc button.accept',
                '.cookie-consent button.accept',
                'button[data-argus*="accept"]',
                '#cc .btn-green',
            ]

            for selector in selectors:
                try:
                    btn = await self.page.query_selector(selector)
                    if btn:
                        await btn.click()
                        await self.page.wait_for_timeout(1000)
                        return True
                except:
                    pass

            # If no button found, try to hide the banner via JavaScript
            await self.page.evaluate('document.querySelector("#cc")?.remove()')
            return True
        except Exception as e:
            print(f"Cookie banner handling: {e}", file=sys.stderr)
            return False

    async def search_company(self, company_name: str, limit: int = 10) -> List[Dict]:
        """
        Search for a company's financial reports on Bundesanzeiger.

        Args:
            company_name: Name of the company to search for
            limit: Maximum number of reports to return

        Returns:
            List of report metadata dictionaries
        """
        reports = []

        try:
            # Navigate to search page
            await self.page.goto(self.SEARCH_URL, wait_until="networkidle", timeout=30000)

            # Handle cookie consent banner
            await self._dismiss_cookie_banner()

            # Wait for the search form to be ready
            await self.page.wait_for_selector('input[name="fulltext"]', timeout=10000)

            # Fill in search term
            await self.page.fill('input[name="fulltext"]', company_name)

            # Click search button using JavaScript to avoid overlay issues
            await self.page.evaluate('document.querySelector("input[type=submit][value=Suchen]").click()')

            # Wait for results to load
            await self.page.wait_for_selector('.result_container', timeout=15000)

            # Get all result rows
            rows = await self.page.query_selector_all('.result_container .row')

            for i, row in enumerate(rows):
                if i >= limit:
                    break

                try:
                    report = await self._parse_result_row(row)
                    if report:
                        reports.append(report)
                except Exception as e:
                    print(f"Error parsing row {i}: {e}", file=sys.stderr)

        except Exception as e:
            print(f"Search error for '{company_name}': {e}", file=sys.stderr)

        return reports

    async def _parse_result_row(self, row) -> Optional[Dict]:
        """Parse a single search result row."""
        info_elem = await row.query_selector('.info')
        if not info_elem:
            return None

        link_elem = await info_elem.query_selector('a')
        if not link_elem:
            return None

        # Get report title and URL
        title = await link_elem.inner_text()
        href = await link_elem.get_attribute('href')
        report_url = f"{self.BASE_URL}{href}" if href and not href.startswith('http') else href

        # Get date info
        date_elem = await row.query_selector('.date')
        date_str = await date_elem.inner_text() if date_elem else None

        # Get company name
        company_elem = await row.query_selector('.company')
        company = await company_elem.inner_text() if company_elem else None

        # Parse the date
        report_date = None
        if date_str:
            try:
                # German date format: "DD.MM.YYYY"
                report_date = datetime.strptime(date_str.strip(), "%d.%m.%Y").strftime("%Y-%m-%d")
            except ValueError:
                report_date = date_str.strip()

        # Determine report type from title
        report_type = self._classify_report_type(title)

        return {
            "title": title.strip() if title else None,
            "company": company.strip() if company else None,
            "date": report_date,
            "url": report_url,
            "type": report_type
        }

    def _classify_report_type(self, title: str) -> str:
        """Classify the report type based on its title."""
        if not title:
            return "unknown"

        title_lower = title.lower()

        if "jahresabschluss" in title_lower or "annual" in title_lower:
            return "annual_report"
        elif "konzernabschluss" in title_lower:
            return "consolidated_report"
        elif "halbjahr" in title_lower or "semi-annual" in title_lower:
            return "semi_annual"
        elif "quartals" in title_lower or "quarterly" in title_lower:
            return "quarterly"
        elif "bilanz" in title_lower:
            return "balance_sheet"
        elif "lagebericht" in title_lower:
            return "management_report"
        else:
            return "other"

    async def get_report_content(self, report_url: str) -> Optional[Dict]:
        """
        Fetch and parse the content of a specific report.

        Args:
            report_url: URL of the report to fetch

        Returns:
            Dictionary with report content and extracted data
        """
        try:
            await self.page.goto(report_url, wait_until="networkidle", timeout=30000)

            # Wait for content to load
            await self.page.wait_for_selector('.publication_container', timeout=10000)

            # Get the main content
            content_elem = await self.page.query_selector('.publication_container')
            if not content_elem:
                return None

            content_text = await content_elem.inner_text()

            # Try to extract financial figures
            financials = self._extract_financials(content_text)

            return {
                "url": report_url,
                "content_text": content_text[:5000],  # First 5000 chars
                "financials": financials
            }

        except Exception as e:
            print(f"Error fetching report: {e}", file=sys.stderr)
            return None

    def _extract_financials(self, text: str) -> Dict:
        """
        Extract financial figures from report text using regex patterns.
        This is a best-effort extraction - German financial reports vary in format.
        """
        financials = {}

        # Common patterns for German financial data
        patterns = {
            "revenue": [
                r"Umsatzerlöse[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
                r"Umsatz[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
                r"Erlöse[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
            ],
            "net_income": [
                r"Jahresüberschuss[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
                r"Jahresergebnis[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
                r"Nettoergebnis[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
            ],
            "total_assets": [
                r"Bilanzsumme[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
                r"Aktiva gesamt[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
            ],
            "equity": [
                r"Eigenkapital[:\s]+([\d.,]+)\s*(Mio|Tsd|EUR|€)?",
            ],
            "employees": [
                r"Mitarbeiter[:\s]+([\d.,]+)",
                r"Beschäftigte[:\s]+([\d.,]+)",
            ],
        }

        for field, field_patterns in patterns.items():
            for pattern in field_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    value_str = match.group(1).replace(".", "").replace(",", ".")
                    try:
                        value = float(value_str)
                        unit = match.group(2) if len(match.groups()) > 1 else None
                        if unit and "Mio" in unit:
                            value *= 1_000_000
                        elif unit and "Tsd" in unit:
                            value *= 1_000
                        financials[field] = value
                    except ValueError:
                        pass
                    break

        return financials


class BundesanzeigerDB:
    """Database handler for storing Bundesanzeiger reports."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._ensure_tables()

    def _ensure_tables(self):
        """Ensure the bundesanzeiger_filings table exists."""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS bundesanzeiger_filings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filing_hash TEXT UNIQUE,
                company_name TEXT NOT NULL,
                company_search_term TEXT,
                title TEXT,
                report_type TEXT,
                filing_date DATE,
                fiscal_year_start DATE,
                fiscal_year_end DATE,
                url TEXT,
                source TEXT DEFAULT 'bundesanzeiger',
                country TEXT DEFAULT 'DE',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_bundesanzeiger_company ON bundesanzeiger_filings(company_name)
        """)
        self.conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_bundesanzeiger_type ON bundesanzeiger_filings(report_type)
        """)
        self.conn.commit()

    def filing_exists(self, filing_hash: str) -> bool:
        """Check if a filing already exists."""
        result = self.conn.execute(
            "SELECT 1 FROM bundesanzeiger_filings WHERE filing_hash = ?",
            (filing_hash,)
        ).fetchone()
        return result is not None

    def store_filing(self, report: Dict, company_search_term: str) -> bool:
        """Store a filing in the database."""
        # Create unique hash from title + date + company
        hash_str = f"{report.get('title', '')}-{report.get('date', '')}-{company_search_term}"
        filing_hash = hashlib.md5(hash_str.encode()).hexdigest()

        if self.filing_exists(filing_hash):
            return False  # Already exists

        # Extract fiscal year from title if possible
        fiscal_start, fiscal_end = self._extract_fiscal_period(report.get('title', ''))

        try:
            self.conn.execute("""
                INSERT INTO bundesanzeiger_filings
                (filing_hash, company_name, company_search_term, title, report_type,
                 filing_date, fiscal_year_start, fiscal_year_end, url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                filing_hash,
                report.get('company') or company_search_term,
                company_search_term,
                report.get('title'),
                report.get('type'),
                report.get('date'),
                fiscal_start,
                fiscal_end,
                report.get('url')
            ))
            self.conn.commit()
            return True
        except sqlite3.Error as e:
            print(f"DB error: {e}", file=sys.stderr)
            return False

    def _extract_fiscal_period(self, title: str) -> tuple:
        """Extract fiscal year start/end from title like 'Jahresabschluss vom 01.01.2019 bis zum 31.12.2019'"""
        if not title:
            return None, None

        # Pattern for German date format in title
        pattern = r"vom\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(?:zum\s+)?(\d{2}\.\d{2}\.\d{4})"
        match = re.search(pattern, title, re.IGNORECASE)

        if match:
            try:
                start_str = match.group(1)
                end_str = match.group(2)
                start_date = datetime.strptime(start_str, "%d.%m.%Y").strftime("%Y-%m-%d")
                end_date = datetime.strptime(end_str, "%d.%m.%Y").strftime("%Y-%m-%d")
                return start_date, end_date
            except ValueError:
                pass

        return None, None

    def get_stats(self) -> Dict:
        """Get statistics about stored filings."""
        stats = {}
        stats['total'] = self.conn.execute(
            "SELECT COUNT(*) FROM bundesanzeiger_filings"
        ).fetchone()[0]
        stats['by_type'] = dict(self.conn.execute(
            "SELECT report_type, COUNT(*) FROM bundesanzeiger_filings GROUP BY report_type"
        ).fetchall())
        stats['by_company'] = self.conn.execute(
            "SELECT COUNT(DISTINCT company_search_term) FROM bundesanzeiger_filings"
        ).fetchone()[0]
        return stats

    def close(self):
        self.conn.close()


async def bulk_import(db_path: str, companies: List[str] = None, limit_per_company: int = 10):
    """
    Bulk import annual reports for multiple companies.

    Args:
        db_path: Path to SQLite database
        companies: List of company names (defaults to DAX 40)
        limit_per_company: Max reports per company
    """
    if companies is None:
        companies = DAX_COMPANIES

    db = BundesanzeigerDB(db_path)
    stats = {"searched": 0, "added": 0, "skipped": 0, "errors": 0}

    print(f"🇩🇪 Bundesanzeiger Bulk Import", file=sys.stderr)
    print(f"   Companies: {len(companies)}", file=sys.stderr)
    print(f"   Limit per company: {limit_per_company}", file=sys.stderr)
    print(f"   Database: {db_path}", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    async with BundesanzeigerScraper(headless=True) as scraper:
        for i, company in enumerate(companies):
            print(f"\n[{i+1}/{len(companies)}] {company}", file=sys.stderr)

            # Search for annual reports (Jahresabschluss)
            search_term = f"{company} Jahresabschluss"

            try:
                reports = await scraper.search_company(search_term, limit=limit_per_company)
                stats["searched"] += 1

                # Filter to only annual/consolidated reports
                annual_reports = [r for r in reports if r.get('type') in
                                  ('annual_report', 'consolidated_report', 'balance_sheet')]

                for report in annual_reports:
                    if db.store_filing(report, company):
                        stats["added"] += 1
                        print(f"   ✅ {report.get('title', 'Unknown')[:60]}", file=sys.stderr)
                    else:
                        stats["skipped"] += 1

                print(f"   Found: {len(reports)}, Annual: {len(annual_reports)}", file=sys.stderr)

                # Rate limiting - be nice to the server
                await asyncio.sleep(2)

            except Exception as e:
                stats["errors"] += 1
                print(f"   ❌ Error: {e}", file=sys.stderr)

    # Final stats
    db_stats = db.get_stats()
    db.close()

    print("\n" + "=" * 50, file=sys.stderr)
    print("📊 SUMMARY", file=sys.stderr)
    print(f"   Companies searched: {stats['searched']}", file=sys.stderr)
    print(f"   Filings added: {stats['added']}", file=sys.stderr)
    print(f"   Filings skipped (duplicates): {stats['skipped']}", file=sys.stderr)
    print(f"   Errors: {stats['errors']}", file=sys.stderr)
    print(f"\n   Total in DB: {db_stats['total']}", file=sys.stderr)
    print(f"   Companies in DB: {db_stats['by_company']}", file=sys.stderr)
    print(f"   By type: {db_stats['by_type']}", file=sys.stderr)

    return stats


async def main():
    parser = argparse.ArgumentParser(description="Scrape Bundesanzeiger for company financial reports")
    parser.add_argument("company", nargs="?", help="Company name to search for")
    parser.add_argument("--limit", type=int, default=5, help="Max reports to fetch")
    parser.add_argument("--fetch-content", action="store_true", help="Also fetch full report content")
    parser.add_argument("--visible", action="store_true", help="Run browser in visible mode (for debugging)")
    parser.add_argument("--bulk-import", action="store_true", help="Import all DAX 40 companies")
    parser.add_argument("--db", type=str, default=None, help="Database path for bulk import")

    args = parser.parse_args()

    if args.bulk_import:
        # Determine database path
        db_path = args.db
        if not db_path:
            script_dir = Path(__file__).parent.parent
            db_path = str(script_dir / "data" / "stocks.db")

        await bulk_import(db_path, limit_per_company=args.limit)
        return

    if not args.company:
        parser.error("Company name is required (or use --bulk-import)")

    async with BundesanzeigerScraper(headless=not args.visible) as scraper:
        print(f"Searching for: {args.company}", file=sys.stderr)

        reports = await scraper.search_company(args.company, limit=args.limit)

        if args.fetch_content and reports:
            for i, report in enumerate(reports):
                if report.get("url"):
                    print(f"Fetching content for report {i+1}/{len(reports)}...", file=sys.stderr)
                    content = await scraper.get_report_content(report["url"])
                    if content:
                        report["content"] = content

        result = {
            "success": True,
            "company": args.company,
            "reports_found": len(reports),
            "reports": reports
        }

        print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
