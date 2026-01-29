#!/usr/bin/env python3
"""
Historical 13F Filing Backfill Script

Fetches and stores historical 13F filings from SEC EDGAR for famous investors.
Backfills 10-16 years of data (back to ~2009) for portfolio performance tracking.

Usage:
    python scripts/backfill_historical_13f.py                    # Run for all investors
    python scripts/backfill_historical_13f.py --investor 1       # Run for specific investor ID
    python scripts/backfill_historical_13f.py --cik 0001067983   # Run for specific CIK
    python scripts/backfill_historical_13f.py --resume           # Resume from checkpoint
    python scripts/backfill_historical_13f.py --status           # Show progress status
    python scripts/backfill_historical_13f.py --dry-run          # Parse but don't store
"""

import argparse
import json
import logging
import os
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Configuration
DB_PATH = Path(__file__).parent.parent / "data" / "stocks.db"
CHECKPOINT_FILE = Path(__file__).parent.parent / "data" / "13f_backfill_checkpoint.json"
SEC_BASE_URL = "https://data.sec.gov"
SEC_ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data"
USER_AGENT = "InvestmentResearchApp admin@example.com"
RATE_LIMIT_MS = 150  # 10 requests/second max
DEFAULT_MIN_YEAR = 2009  # How far back to go

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class SECRateLimiter:
    """Rate limiter for SEC API requests (max 10/second)."""

    def __init__(self):
        self.last_request_time = 0

    def wait(self):
        """Wait if necessary to respect rate limit."""
        now = time.time() * 1000
        elapsed = now - self.last_request_time
        if elapsed < RATE_LIMIT_MS:
            time.sleep((RATE_LIMIT_MS - elapsed) / 1000)
        self.last_request_time = time.time() * 1000


class CheckpointManager:
    """Manages checkpoint state for resume capability."""

    def __init__(self, checkpoint_file: Path):
        self.checkpoint_file = checkpoint_file
        self.state = self._load()

    def _load(self) -> Dict:
        """Load checkpoint state from file."""
        if self.checkpoint_file.exists():
            try:
                with open(self.checkpoint_file, 'r') as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return {}
        return {}

    def save(self):
        """Save current state to checkpoint file."""
        with open(self.checkpoint_file, 'w') as f:
            json.dump(self.state, f, indent=2)

    def get_processed_filings(self, investor_id: int) -> set:
        """Get set of already processed accession numbers for an investor."""
        key = f"investor_{investor_id}"
        return set(self.state.get(key, {}).get("processed_filings", []))

    def mark_filing_processed(self, investor_id: int, accession_number: str):
        """Mark a filing as processed."""
        key = f"investor_{investor_id}"
        if key not in self.state:
            self.state[key] = {"processed_filings": [], "last_updated": None}
        if accession_number not in self.state[key]["processed_filings"]:
            self.state[key]["processed_filings"].append(accession_number)
        self.state[key]["last_updated"] = datetime.now().isoformat()
        self.save()

    def get_status(self) -> Dict:
        """Get overall status of the backfill."""
        return {
            "investors_started": len(self.state),
            "total_filings_processed": sum(
                len(v.get("processed_filings", []))
                for v in self.state.values()
                if isinstance(v, dict)
            ),
            "state": self.state
        }

    def clear(self):
        """Clear all checkpoint state."""
        self.state = {}
        if self.checkpoint_file.exists():
            self.checkpoint_file.unlink()


class Historical13FBackfill:
    """Main class for backfilling historical 13F filings."""

    def __init__(self, db_path: Path, dry_run: bool = False, min_year: int = DEFAULT_MIN_YEAR):
        self.db_path = db_path
        self.dry_run = dry_run
        self.min_year = min_year
        self.rate_limiter = SECRateLimiter()
        self.checkpoint = CheckpointManager(CHECKPOINT_FILE)
        self.conn = None
        self.stats = {
            "investors_processed": 0,
            "filings_processed": 0,
            "filings_skipped": 0,
            "holdings_stored": 0,
            "errors": []
        }

    def connect_db(self):
        """Connect to SQLite database."""
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        logger.info(f"Connected to database: {self.db_path}")

    def close_db(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()

    def fetch_sec(self, url: str, retries: int = 3) -> Optional[bytes]:
        """Fetch data from SEC with rate limiting and retries."""
        self.rate_limiter.wait()

        for attempt in range(retries):
            try:
                request = Request(url, headers={"User-Agent": USER_AGENT})
                with urlopen(request, timeout=30) as response:
                    return response.read()
            except HTTPError as e:
                if e.code == 404:
                    logger.warning(f"Not found: {url}")
                    return None
                elif e.code == 429:
                    # Rate limited - back off
                    wait_time = (attempt + 1) * 5
                    logger.warning(f"Rate limited, waiting {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    logger.error(f"HTTP error {e.code} for {url}")
                    if attempt == retries - 1:
                        raise
            except URLError as e:
                logger.error(f"URL error for {url}: {e.reason}")
                if attempt == retries - 1:
                    raise
                time.sleep(2)
            except Exception as e:
                logger.error(f"Unexpected error fetching {url}: {e}")
                if attempt == retries - 1:
                    raise
                time.sleep(2)

        return None

    def get_all_filings_for_cik(self, cik: str) -> List[Dict]:
        """
        Get all 13F-HR filings for a CIK, including paginated older filings.
        SEC paginates at ~1000 filings, so we need to fetch additional files.
        """
        # Ensure CIK is padded to 10 digits
        cik_padded = cik.zfill(10)
        url = f"{SEC_BASE_URL}/submissions/CIK{cik_padded}.json"

        logger.info(f"Fetching submissions for CIK {cik_padded}")
        data = self.fetch_sec(url)
        if not data:
            return []

        submissions = json.loads(data)
        filings = []

        # Parse recent filings
        recent = submissions.get("filings", {}).get("recent", {})
        filings.extend(self._parse_filing_arrays(recent))

        # Check for additional older filing files
        older_files = submissions.get("filings", {}).get("files", [])
        for file_info in older_files:
            file_name = file_info.get("name")
            if not file_name:
                continue

            older_url = f"{SEC_BASE_URL}/submissions/{file_name}"
            logger.info(f"Fetching older filings from {file_name}")
            older_data = self.fetch_sec(older_url)
            if older_data:
                older_json = json.loads(older_data)
                filings.extend(self._parse_filing_arrays(older_json))

        # Filter for 13F-HR and 13F-HR/A forms only
        filings_13f = [
            f for f in filings
            if f["form"] in ("13F-HR", "13F-HR/A")
        ]

        # Filter by date (only back to min_year)
        min_date = f"{self.min_year}-01-01"
        filings_13f = [f for f in filings_13f if f["filing_date"] >= min_date]

        # Sort by filing date descending (newest first)
        filings_13f.sort(key=lambda x: x["filing_date"], reverse=True)

        logger.info(f"Found {len(filings_13f)} 13F filings since {self.min_year}")
        return filings_13f

    def _parse_filing_arrays(self, data: Dict) -> List[Dict]:
        """Parse filing arrays from SEC submission data."""
        filings = []

        forms = data.get("form", [])
        accession_numbers = data.get("accessionNumber", [])
        filing_dates = data.get("filingDate", [])
        report_dates = data.get("reportDate", [])
        primary_documents = data.get("primaryDocument", [])

        for i in range(len(forms)):
            filings.append({
                "form": forms[i] if i < len(forms) else None,
                "accession_number": accession_numbers[i] if i < len(accession_numbers) else None,
                "filing_date": filing_dates[i] if i < len(filing_dates) else None,
                "report_date": report_dates[i] if i < len(report_dates) else None,
                "primary_document": primary_documents[i] if i < len(primary_documents) else None
            })

        return filings

    def parse_infotable(self, cik: str, accession_number: str) -> List[Dict]:
        """
        Parse 13F infotable XML to extract holdings.
        Handles various XML formats and namespaces from different time periods.
        Falls back to HTML directory parsing if JSON index unavailable.
        """
        # Clean accession number (remove dashes)
        clean_accession = accession_number.replace("-", "")
        cik_clean = cik.lstrip("0")

        # Get filing index to find the infotable file
        index_url = f"{SEC_ARCHIVES_URL}/{cik_clean}/{clean_accession}/index.json"
        index_data = self.fetch_sec(index_url)

        items = []
        if index_data:
            index = json.loads(index_data)
            items = index.get("directory", {}).get("item", [])
        else:
            # Fallback: parse HTML directory listing
            html_url = f"{SEC_ARCHIVES_URL}/{cik_clean}/{clean_accession}/"
            html_data = self.fetch_sec(html_url)
            if html_data:
                items = self._parse_html_directory(html_data.decode('utf-8', errors='replace'))

        if not items:
            logger.warning(f"Could not fetch index for {accession_number}")
            return []

        # Find infotable file - try multiple patterns
        infotable_file = None

        # Pattern 1: Files with 'infotable' in name (case insensitive)
        for item in items:
            name = item.get("name", "").lower()
            if "infotable" in name and name.endswith(".xml"):
                infotable_file = item.get("name")
                break

        # Pattern 2: Files like form13fInfoTable.xml
        if not infotable_file:
            for item in items:
                name = item.get("name", "").lower()
                if "13f" in name and name.endswith(".xml"):
                    infotable_file = item.get("name")
                    break

        # Pattern 3: Any XML that's not primary_doc or index
        if not infotable_file:
            for item in items:
                name = item.get("name", "").lower()
                if name.endswith(".xml") and "primary_doc" not in name and "-index" not in name:
                    infotable_file = item.get("name")
                    break

        # Pattern 4: Numeric XML files (e.g., 46994.xml)
        if not infotable_file:
            for item in items:
                name = item.get("name", "")
                if re.match(r'^\d+\.xml$', name, re.IGNORECASE):
                    infotable_file = name
                    break

        if not infotable_file:
            logger.warning(f"No infotable found for {accession_number}")
            return []

        # Fetch and parse the infotable
        infotable_url = f"{SEC_ARCHIVES_URL}/{cik_clean}/{clean_accession}/{infotable_file}"
        xml_data = self.fetch_sec(infotable_url)

        if not xml_data:
            return []

        return self._parse_infotable_xml(xml_data.decode('utf-8', errors='replace'))

    def _parse_html_directory(self, html: str) -> List[Dict]:
        """Parse HTML directory listing to extract file names."""
        items = []
        # Match href patterns like /Archives/edgar/data/.../filename.xml
        pattern = re.compile(r'href="[^"]*?/([^/"]+\.(xml|txt))"', re.IGNORECASE)
        for match in pattern.finditer(html):
            items.append({"name": match.group(1)})
        return items

    def _parse_infotable_xml(self, xml_text: str) -> List[Dict]:
        """
        Parse infotable XML text into holdings list.
        Handles multiple XML formats used over the years.
        Note: Pre-2023 filings report values in thousands, post-2023 in actual dollars.
        We detect this by checking if average value per share seems reasonable.
        """
        holdings = []

        # Try to extract using regex patterns (more reliable for varied formats)
        # Pattern 1: Standard format without namespace
        pattern1 = re.compile(
            r'<infoTable[^>]*>(.*?)</infoTable>',
            re.DOTALL | re.IGNORECASE
        )

        # Pattern 2: With ns1: namespace prefix
        pattern2 = re.compile(
            r'<ns1:infoTable[^>]*>(.*?)</ns1:infoTable>',
            re.DOTALL | re.IGNORECASE
        )

        # Pattern 3: With other namespace prefixes
        pattern3 = re.compile(
            r'<\w+:infoTable[^>]*>(.*?)</\w+:infoTable>',
            re.DOTALL | re.IGNORECASE
        )

        entries = pattern1.findall(xml_text)
        if not entries:
            entries = pattern2.findall(xml_text)
        if not entries:
            entries = pattern3.findall(xml_text)

        for entry in entries:
            holding = self._extract_holding_from_entry(entry)
            if holding:
                holdings.append(holding)

        # Detect if values are in thousands (pre-2023 format)
        # If average price per share < $1, values are likely in thousands
        if holdings:
            total_value = sum(h["value"] for h in holdings)
            total_shares = sum(h["shares"] for h in holdings if h["shares"] > 0)
            if total_shares > 0:
                avg_price = total_value / total_shares
                # If average price is unreasonably low (< $0.10), values are in thousands
                if avg_price < 0.10:
                    for h in holdings:
                        h["value"] = h["value"] * 1000

        return holdings

    def _extract_holding_from_entry(self, entry: str) -> Optional[Dict]:
        """Extract holding data from a single infoTable entry."""

        def get_value(tag: str) -> Optional[str]:
            """Extract value for a tag, handling namespaces."""
            # Try without namespace
            match = re.search(
                rf'<{tag}[^>]*>([^<]*)</{tag}>',
                entry,
                re.IGNORECASE
            )
            if match:
                return match.group(1).strip()

            # Try with namespace prefix
            match = re.search(
                rf'<\w+:{tag}[^>]*>([^<]*)</\w+:{tag}>',
                entry,
                re.IGNORECASE
            )
            if match:
                return match.group(1).strip()

            return None

        cusip = get_value("cusip")
        name_of_issuer = get_value("nameOfIssuer")
        value_str = get_value("value")

        # Handle shares - multiple possible tag names
        shares_str = (
            get_value("sshPrnamt") or
            get_value("shrsOrPrnAmt") or
            "0"
        )

        # Parse and validate
        if not cusip or not value_str:
            return None

        try:
            # Value in XML is already in dollars (not thousands as older docs claim)
            value = float(value_str.replace(",", ""))
            shares = float(shares_str.replace(",", "")) if shares_str else 0
        except (ValueError, TypeError):
            return None

        return {
            "cusip": cusip,
            "security_name": name_of_issuer or "",
            "value": value,
            "shares": shares
        }

    def filing_exists(self, investor_id: int, accession_number: str) -> bool:
        """Check if a filing already exists in the database."""
        cursor = self.conn.cursor()
        result = cursor.execute(
            "SELECT id FROM investor_filings WHERE investor_id = ? AND accession_number = ?",
            (investor_id, accession_number)
        ).fetchone()
        return result is not None

    def get_previous_holdings(self, investor_id: int, before_date: str) -> Dict[str, Dict]:
        """Get holdings from the most recent filing before a given date."""
        cursor = self.conn.cursor()

        # Find the previous filing date
        prev_filing = cursor.execute(
            """SELECT filing_date FROM investor_filings
               WHERE investor_id = ? AND filing_date < ?
               ORDER BY filing_date DESC LIMIT 1""",
            (investor_id, before_date)
        ).fetchone()

        if not prev_filing:
            return {}

        # Get holdings from that filing
        holdings = cursor.execute(
            """SELECT cusip, shares, market_value, security_name
               FROM investor_holdings
               WHERE investor_id = ? AND filing_date = ?""",
            (investor_id, prev_filing["filing_date"])
        ).fetchall()

        return {h["cusip"]: dict(h) for h in holdings}

    def lookup_company_by_cusip(self, cusip: str) -> Optional[int]:
        """Look up company ID by CUSIP from cusip_mapping table."""
        cursor = self.conn.cursor()
        result = cursor.execute(
            "SELECT company_id FROM cusip_mapping WHERE cusip = ?",
            (cusip,)
        ).fetchone()
        return result["company_id"] if result else None

    def get_filing_date_price(self, company_id: int, filing_date: str) -> Optional[float]:
        """Get stock price on or before filing date."""
        if not company_id:
            return None

        cursor = self.conn.cursor()
        result = cursor.execute(
            """SELECT close FROM daily_prices
               WHERE company_id = ? AND date <= ?
               ORDER BY date DESC LIMIT 1""",
            (company_id, filing_date)
        ).fetchone()
        return result["close"] if result else None

    def store_filing(self, investor_id: int, filing: Dict, holdings: List[Dict],
                     previous_holdings: Dict[str, Dict]) -> bool:
        """Store a filing and its holdings in the database."""
        if self.dry_run:
            logger.info(f"[DRY RUN] Would store filing {filing['accession_number']} with {len(holdings)} holdings")
            return True

        cursor = self.conn.cursor()

        try:
            # Calculate total value and position counts
            total_value = sum(h["value"] for h in holdings)

            # Process holdings and calculate changes
            change_counts = {"new": 0, "increased": 0, "decreased": 0, "sold": 0, "unchanged": 0}
            processed_holdings = []
            processed_cusips = set()

            for h in holdings:
                company_id = self.lookup_company_by_cusip(h["cusip"])
                prev = previous_holdings.get(h["cusip"])

                # Calculate change type
                if not prev:
                    change_type = "new"
                    shares_change = 0
                    shares_change_pct = 0
                    value_change = 0
                    prev_shares = None
                else:
                    prev_shares = prev["shares"]
                    shares_change = h["shares"] - prev_shares
                    shares_change_pct = (shares_change / prev_shares * 100) if prev_shares > 0 else 0
                    value_change = h["value"] - prev["market_value"]

                    if abs(shares_change_pct) < 1:
                        change_type = "unchanged"
                    elif shares_change > 0:
                        change_type = "increased"
                    else:
                        change_type = "decreased"

                change_counts[change_type] += 1
                processed_cusips.add(h["cusip"])

                processed_holdings.append({
                    "investor_id": investor_id,
                    "company_id": company_id,
                    "filing_date": filing["filing_date"],
                    "report_date": filing["report_date"],
                    "cusip": h["cusip"],
                    "security_name": h["security_name"],
                    "shares": h["shares"],
                    "market_value": h["value"],
                    "portfolio_weight": (h["value"] / total_value * 100) if total_value > 0 else 0,
                    "prev_shares": prev_shares,
                    "shares_change": shares_change,
                    "shares_change_pct": shares_change_pct,
                    "value_change": value_change,
                    "change_type": change_type
                })

            # Add sold positions (in previous but not current)
            for cusip, prev in previous_holdings.items():
                if cusip not in processed_cusips:
                    company_id = self.lookup_company_by_cusip(cusip)
                    change_counts["sold"] += 1
                    processed_holdings.append({
                        "investor_id": investor_id,
                        "company_id": company_id,
                        "filing_date": filing["filing_date"],
                        "report_date": filing["report_date"],
                        "cusip": cusip,
                        "security_name": prev.get("security_name", ""),
                        "shares": 0,
                        "market_value": 0,
                        "portfolio_weight": 0,
                        "prev_shares": prev["shares"],
                        "shares_change": -prev["shares"],
                        "shares_change_pct": -100,
                        "value_change": -prev["market_value"],
                        "change_type": "sold"
                    })

            # Insert filing record
            cursor.execute(
                """INSERT OR REPLACE INTO investor_filings (
                    investor_id, filing_date, report_date, accession_number,
                    form_type, total_value, positions_count, new_positions,
                    increased_positions, decreased_positions, sold_positions,
                    unchanged_positions, fetched_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    investor_id,
                    filing["filing_date"],
                    filing["report_date"],
                    filing["accession_number"],
                    filing["form"],
                    total_value,
                    len(holdings),
                    change_counts["new"],
                    change_counts["increased"],
                    change_counts["decreased"],
                    change_counts["sold"],
                    change_counts["unchanged"],
                    datetime.now().isoformat()
                )
            )

            # Insert holdings
            for h in processed_holdings:
                cursor.execute(
                    """INSERT INTO investor_holdings (
                        investor_id, company_id, filing_date, report_date,
                        cusip, security_name, shares, market_value,
                        portfolio_weight, prev_shares, shares_change,
                        shares_change_pct, value_change, change_type
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        h["investor_id"], h["company_id"], h["filing_date"],
                        h["report_date"], h["cusip"], h["security_name"],
                        h["shares"], h["market_value"], h["portfolio_weight"],
                        h["prev_shares"], h["shares_change"], h["shares_change_pct"],
                        h["value_change"], h["change_type"]
                    )
                )

            self.conn.commit()
            self.stats["holdings_stored"] += len(processed_holdings)
            return True

        except Exception as e:
            self.conn.rollback()
            logger.error(f"Error storing filing: {e}")
            return False

    def process_investor(self, investor: Dict) -> Dict:
        """Process all historical filings for an investor."""
        investor_id = investor["id"]
        cik = investor["cik"]
        name = investor["name"]

        logger.info(f"\n{'='*60}")
        logger.info(f"Processing: {name} (CIK: {cik})")
        logger.info(f"{'='*60}")

        result = {
            "investor_id": investor_id,
            "name": name,
            "filings_found": 0,
            "filings_processed": 0,
            "filings_skipped": 0,
            "errors": []
        }

        # Get all 13F filings
        filings = self.get_all_filings_for_cik(cik)
        result["filings_found"] = len(filings)

        if not filings:
            logger.warning(f"No filings found for {name}")
            return result

        # Get already processed filings from checkpoint
        processed_filings = self.checkpoint.get_processed_filings(investor_id)

        # Date range for logging
        oldest_date = filings[-1]["filing_date"] if filings else "N/A"
        newest_date = filings[0]["filing_date"] if filings else "N/A"
        logger.info(f"Filing date range: {oldest_date} to {newest_date}")

        # Process filings from oldest to newest (for proper change tracking)
        for filing in reversed(filings):
            accession = filing["accession_number"]

            # Skip if already processed (in checkpoint or DB)
            if accession in processed_filings:
                result["filings_skipped"] += 1
                continue

            if self.filing_exists(investor_id, accession):
                self.checkpoint.mark_filing_processed(investor_id, accession)
                result["filings_skipped"] += 1
                continue

            try:
                logger.info(f"  Processing: {filing['filing_date']} ({accession})")

                # Parse holdings
                holdings = self.parse_infotable(cik, accession)

                if not holdings:
                    logger.warning(f"    No holdings found in {accession}")
                    self.checkpoint.mark_filing_processed(investor_id, accession)
                    continue

                # Get previous holdings for change calculation
                previous_holdings = self.get_previous_holdings(investor_id, filing["filing_date"])

                # Store in database
                if self.store_filing(investor_id, filing, holdings, previous_holdings):
                    result["filings_processed"] += 1
                    self.stats["filings_processed"] += 1
                    self.checkpoint.mark_filing_processed(investor_id, accession)
                    logger.info(f"    Stored {len(holdings)} holdings (${sum(h['value'] for h in holdings)/1e9:.2f}B)")
                else:
                    result["errors"].append(f"Failed to store {accession}")
                    self.stats["errors"].append(f"{name}: Failed to store {accession}")

            except Exception as e:
                error_msg = f"Error processing {accession}: {e}"
                logger.error(f"    {error_msg}")
                result["errors"].append(error_msg)
                self.stats["errors"].append(f"{name}: {error_msg}")

        self.stats["investors_processed"] += 1
        logger.info(f"Completed: {result['filings_processed']} processed, {result['filings_skipped']} skipped")

        return result

    def run(self, investor_id: Optional[int] = None, cik: Optional[str] = None):
        """Run the backfill process."""
        self.connect_db()

        try:
            cursor = self.conn.cursor()

            # Get investors to process
            if investor_id:
                investors = cursor.execute(
                    "SELECT * FROM famous_investors WHERE id = ? AND is_active = 1",
                    (investor_id,)
                ).fetchall()
            elif cik:
                investors = cursor.execute(
                    "SELECT * FROM famous_investors WHERE cik = ? AND is_active = 1",
                    (cik,)
                ).fetchall()
            else:
                investors = cursor.execute(
                    "SELECT * FROM famous_investors WHERE is_active = 1 ORDER BY display_order"
                ).fetchall()

            if not investors:
                logger.error("No investors found")
                return

            logger.info(f"\n{'#'*60}")
            logger.info(f"Historical 13F Backfill")
            logger.info(f"{'#'*60}")
            logger.info(f"Investors to process: {len(investors)}")
            logger.info(f"Date range: {self.min_year} to present")
            logger.info(f"Dry run: {self.dry_run}")

            start_time = time.time()
            results = []

            for investor in investors:
                result = self.process_investor(dict(investor))
                results.append(result)

            # Print summary
            duration = time.time() - start_time
            self._print_summary(results, duration)

        finally:
            self.close_db()

    def _print_summary(self, results: List[Dict], duration: float):
        """Print summary of backfill results."""
        logger.info(f"\n{'='*60}")
        logger.info("BACKFILL SUMMARY")
        logger.info(f"{'='*60}")

        total_found = sum(r["filings_found"] for r in results)
        total_processed = sum(r["filings_processed"] for r in results)
        total_skipped = sum(r["filings_skipped"] for r in results)
        total_errors = sum(len(r["errors"]) for r in results)

        logger.info(f"Duration: {duration:.1f} seconds")
        logger.info(f"Investors processed: {len(results)}")
        logger.info(f"Filings found: {total_found}")
        logger.info(f"Filings processed: {total_processed}")
        logger.info(f"Filings skipped (already exist): {total_skipped}")
        logger.info(f"Holdings stored: {self.stats['holdings_stored']}")
        logger.info(f"Errors: {total_errors}")

        if total_errors > 0:
            logger.info("\nErrors by investor:")
            for r in results:
                if r["errors"]:
                    logger.info(f"  {r['name']}: {len(r['errors'])} errors")
                    for err in r["errors"][:3]:  # Show first 3
                        logger.info(f"    - {err}")

        logger.info("\nPer-investor breakdown:")
        for r in results:
            status = "✓" if not r["errors"] else "⚠"
            logger.info(
                f"  {status} {r['name']}: {r['filings_processed']}/{r['filings_found']} processed"
            )

    def generate_performance_report(self):
        """Generate performance analytics report for all investors."""
        self.connect_db()
        cursor = self.conn.cursor()

        logger.info(f"\n{'='*60}")
        logger.info("PORTFOLIO PERFORMANCE ANALYTICS")
        logger.info(f"{'='*60}")

        investors = cursor.execute(
            "SELECT id, name FROM famous_investors WHERE is_active = 1 ORDER BY display_order"
        ).fetchall()

        for investor in investors:
            investor_id = investor["id"]
            name = investor["name"]

            # Get filing history with portfolio values (only full 13F-HR, not amendments)
            filings = cursor.execute(
                """SELECT filing_date, total_value, positions_count
                   FROM investor_filings
                   WHERE investor_id = ?
                     AND form_type = '13F-HR'
                     AND positions_count > 10
                   ORDER BY filing_date DESC
                   LIMIT 20""",
                (investor_id,)
            ).fetchall()

            if len(filings) < 2:
                continue

            logger.info(f"\n{name}:")
            logger.info(f"  Filings: {len(filings)}")
            logger.info(f"  Date range: {filings[-1]['filing_date']} to {filings[0]['filing_date']}")

            # Calculate quarter-over-quarter returns
            returns = []
            for i in range(len(filings) - 1):
                current = filings[i]
                previous = filings[i + 1]

                if previous["total_value"] and previous["total_value"] > 0:
                    qoq_return = ((current["total_value"] - previous["total_value"]) /
                                  previous["total_value"]) * 100
                    returns.append({
                        "date": current["filing_date"],
                        "return": qoq_return,
                        "value": current["total_value"]
                    })

            if returns:
                avg_return = sum(r["return"] for r in returns) / len(returns)
                best = max(returns, key=lambda x: x["return"])
                worst = min(returns, key=lambda x: x["return"])

                logger.info(f"  Avg quarterly return: {avg_return:.2f}%")
                logger.info(f"  Best quarter: {best['date']} ({best['return']:.2f}%)")
                logger.info(f"  Worst quarter: {worst['date']} ({worst['return']:.2f}%)")
                logger.info(f"  Latest value: ${filings[0]['total_value']/1e9:.2f}B")

        self.close_db()


def main():
    parser = argparse.ArgumentParser(
        description="Backfill historical 13F filings from SEC EDGAR"
    )
    parser.add_argument(
        "--investor",
        type=int,
        help="Process specific investor by ID"
    )
    parser.add_argument(
        "--cik",
        type=str,
        help="Process specific investor by CIK number"
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from checkpoint (skip already processed)"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show backfill progress status"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse filings but don't store in database"
    )
    parser.add_argument(
        "--clear-checkpoint",
        action="store_true",
        help="Clear checkpoint file and start fresh"
    )
    parser.add_argument(
        "--min-year",
        type=int,
        default=DEFAULT_MIN_YEAR,
        help=f"Minimum year to backfill (default: {DEFAULT_MIN_YEAR})"
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Generate performance analytics report"
    )

    args = parser.parse_args()

    # Handle status check
    if args.status:
        checkpoint = CheckpointManager(CHECKPOINT_FILE)
        status = checkpoint.get_status()
        print("\n" + "="*50)
        print("13F Backfill Status")
        print("="*50)
        print(f"Investors started: {status['investors_started']}")
        print(f"Total filings processed: {status['total_filings_processed']}")

        if status["state"]:
            print("\nPer-investor progress:")
            for key, data in status["state"].items():
                if isinstance(data, dict):
                    investor_id = key.replace("investor_", "")
                    count = len(data.get("processed_filings", []))
                    last_updated = data.get("last_updated", "N/A")
                    print(f"  Investor {investor_id}: {count} filings (last: {last_updated})")
        return

    # Handle clear checkpoint
    if args.clear_checkpoint:
        checkpoint = CheckpointManager(CHECKPOINT_FILE)
        checkpoint.clear()
        print("Checkpoint cleared.")
        return

    # Handle performance report
    if args.report:
        backfill = Historical13FBackfill(DB_PATH)
        backfill.generate_performance_report()
        return

    # Run backfill
    backfill = Historical13FBackfill(DB_PATH, dry_run=args.dry_run, min_year=args.min_year)
    backfill.run(investor_id=args.investor, cik=args.cik)


if __name__ == "__main__":
    main()
