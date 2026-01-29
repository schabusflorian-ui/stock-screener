# src/scrapers/base_scraper.py

from abc import ABC, abstractmethod
import requests
import time
import os
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
import logging
import hashlib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BaseScraper(ABC):
    """
    Abstract base class for all knowledge scrapers.

    To add a new source:
    1. Create new file in /src/scrapers/
    2. Inherit from BaseScraper
    3. Implement get_source_name(), get_urls() and scrape_item()
    4. Add to build_knowledge_base.py

    Features:
    - Rate limiting to be respectful to sources
    - Resume capability (skip already scraped items)
    - Standardized output format
    - Error handling and logging
    """

    def __init__(self, output_dir: str, rate_limit: float = 1.0):
        """
        Args:
            output_dir: Where to save scraped content
            rate_limit: Seconds between requests (be respectful!)
        """
        self.output_dir = output_dir
        self.rate_limit = rate_limit
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0',
        })
        self.logger = logger
        os.makedirs(output_dir, exist_ok=True)

    @abstractmethod
    def get_source_name(self) -> str:
        """Return human-readable source name"""
        pass

    @abstractmethod
    def get_urls(self) -> List[Dict]:
        """
        Return list of items to scrape.
        Each item should have at minimum: {'url': '...', 'id': '...'}
        Additional fields like 'title', 'year', 'format' are optional.
        """
        pass

    @abstractmethod
    def scrape_item(self, item: Dict) -> Optional[Dict]:
        """
        Scrape a single item.

        Args:
            item: Dict with at least 'url' and 'id' keys

        Returns:
            Dict with keys:
            - title: str
            - content: str (the main text content)
            - url: str (source URL)
            - date: str (optional)
            - metadata: dict (additional info like author, type, etc.)
        """
        pass

    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch and parse a page with rate limiting"""
        try:
            time.sleep(self.rate_limit)
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return BeautifulSoup(response.text, 'html.parser')
        except requests.exceptions.HTTPError as e:
            self.logger.error(f"HTTP error fetching {url}: {e}")
            return None
        except requests.exceptions.ConnectionError as e:
            self.logger.error(f"Connection error fetching {url}: {e}")
            return None
        except requests.exceptions.Timeout as e:
            self.logger.error(f"Timeout fetching {url}: {e}")
            return None
        except Exception as e:
            self.logger.error(f"Unexpected error fetching {url}: {e}")
            return None

    def fetch_pdf(self, url: str) -> Optional[bytes]:
        """Fetch PDF content with rate limiting"""
        try:
            time.sleep(self.rate_limit)
            response = self.session.get(url, timeout=60)
            response.raise_for_status()

            # Verify it's actually a PDF
            content_type = response.headers.get('Content-Type', '')
            if 'pdf' not in content_type.lower() and not response.content[:4] == b'%PDF':
                self.logger.warning(f"URL {url} may not be a PDF (Content-Type: {content_type})")

            return response.content
        except Exception as e:
            self.logger.error(f"Error fetching PDF {url}: {e}")
            return None

    def generate_item_id(self, item: Dict) -> str:
        """Generate a safe, unique ID for an item"""
        if 'id' in item:
            base_id = str(item['id'])
        else:
            # Use URL hash as fallback
            base_id = hashlib.md5(item['url'].encode()).hexdigest()[:12]

        # Make filename safe
        safe_id = "".join(c if c.isalnum() or c in '-_' else '_' for c in base_id)
        return safe_id

    def get_filepath(self, item_id: str) -> str:
        """Get the full filepath for an item"""
        safe_id = "".join(c if c.isalnum() or c in '-_' else '_' for c in str(item_id))
        return os.path.join(self.output_dir, f"{safe_id}.txt")

    def save_item(self, item_id: str, content: Dict):
        """
        Save scraped item to file in standardized format.

        Format:
        - Header with metadata (Title, Source, URL, Date)
        - Separator (---)
        - Main content
        """
        filepath = self.get_filepath(item_id)

        with open(filepath, 'w', encoding='utf-8') as f:
            # Write header
            f.write(f"Title: {content.get('title', 'Unknown')}\n")
            f.write(f"Source: {self.get_source_name()}\n")

            if content.get('url'):
                f.write(f"URL: {content['url']}\n")
            if content.get('date'):
                f.write(f"Date: {content['date']}\n")

            # Write metadata if present
            metadata = content.get('metadata', {})
            if metadata.get('author'):
                f.write(f"Author: {metadata['author']}\n")
            if metadata.get('type'):
                f.write(f"Type: {metadata['type']}\n")
            if metadata.get('category'):
                f.write(f"Category: {metadata['category']}\n")

            # Separator
            f.write("\n---\n\n")

            # Main content
            f.write(content.get('content', ''))

        self.logger.info(f"Saved: {filepath}")

    def item_exists(self, item_id: str) -> bool:
        """Check if an item has already been scraped"""
        filepath = self.get_filepath(item_id)
        return os.path.exists(filepath)

    def scrape_all(self, resume: bool = True, limit: int = None) -> Dict:
        """
        Scrape all items from this source.

        Args:
            resume: Skip items that already exist
            limit: Maximum number of items to scrape (None for all)

        Returns:
            Dict with statistics:
            - total: Total items found
            - scraped: Items scraped this run
            - skipped: Items skipped (already exist)
            - failed: Items that failed to scrape
        """
        self.logger.info(f"Starting scrape of {self.get_source_name()}")

        items = self.get_urls()
        self.logger.info(f"Found {len(items)} items to scrape")

        stats = {
            'total': len(items),
            'scraped': 0,
            'skipped': 0,
            'failed': 0
        }

        for i, item in enumerate(items):
            # Check limit
            if limit and stats['scraped'] >= limit:
                self.logger.info(f"Reached limit of {limit} items")
                break

            item_id = self.generate_item_id(item)

            # Skip if exists and resume mode
            if resume and self.item_exists(item_id):
                self.logger.debug(f"Skipping existing: {item_id}")
                stats['skipped'] += 1
                continue

            # Progress logging
            self.logger.info(f"Scraping [{i+1}/{len(items)}]: {item_id}")

            # Scrape the item
            try:
                content = self.scrape_item(item)
                if content:
                    self.save_item(item_id, content)
                    stats['scraped'] += 1
                else:
                    self.logger.warning(f"No content returned for {item_id}")
                    stats['failed'] += 1
            except Exception as e:
                self.logger.error(f"Error scraping {item_id}: {e}")
                stats['failed'] += 1

        self.logger.info(
            f"Completed {self.get_source_name()}: "
            f"{stats['scraped']} scraped, {stats['skipped']} skipped, {stats['failed']} failed"
        )
        return stats

    def get_existing_count(self) -> int:
        """Count already scraped items"""
        if not os.path.exists(self.output_dir):
            return 0
        return len([f for f in os.listdir(self.output_dir) if f.endswith('.txt')])

    def get_scraped_files(self) -> List[str]:
        """Get list of all scraped file paths"""
        if not os.path.exists(self.output_dir):
            return []
        return [
            os.path.join(self.output_dir, f)
            for f in os.listdir(self.output_dir)
            if f.endswith('.txt')
        ]
