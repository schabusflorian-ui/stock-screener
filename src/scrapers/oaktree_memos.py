# src/scrapers/oaktree_memos.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional
import re


class OaktreeMemosScraper(BaseScraper):
    """
    Scrapes Howard Marks' investment memos from Oaktree Capital.

    Howard Marks is famous for his insights on:
    - Market cycles and timing
    - Risk assessment and management
    - Contrarian thinking
    - Second-level thinking
    - The pendulum of investor sentiment

    His memos are available from 1990 to present.

    Source: oaktreecapital.com/insights/memos
    """

    BASE_URL = "https://www.oaktreecapital.com"
    MEMOS_URL = f"{BASE_URL}/insights/memos"

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/investors/marks/memos",
            rate_limit=1.5  # Be respectful
        )

    def get_source_name(self) -> str:
        return "Howard Marks Oaktree Memos"

    def get_urls(self) -> List[Dict]:
        """Get list of all memo URLs from the memos page"""
        soup = self.fetch_page(self.MEMOS_URL)
        if not soup:
            self.logger.error("Could not fetch memos listing page")
            return []

        memos = []
        seen_urls = set()

        # Find memo links - look for various patterns
        for link in soup.find_all('a', href=True):
            href = link['href']

            # Check for memo URLs
            if '/insights/memo/' in href or '/memo/' in href:
                # Normalize URL
                if href.startswith('/'):
                    full_url = self.BASE_URL + href
                elif href.startswith('http'):
                    full_url = href
                else:
                    continue

                # Skip duplicates
                if full_url in seen_urls:
                    continue
                seen_urls.add(full_url)

                # Extract title
                title = link.get_text(strip=True)
                if not title or len(title) < 3:
                    # Try to get from URL
                    title = href.split('/')[-1].replace('-', ' ').title()

                # Generate ID from URL
                memo_id = href.split('/')[-1] or href.split('/')[-2]
                memo_id = re.sub(r'[^a-zA-Z0-9-]', '', memo_id)

                memos.append({
                    'id': memo_id,
                    'url': full_url,
                    'title': title
                })

        self.logger.info(f"Found {len(memos)} memos")
        return memos

    def _extract_memo_content(self, soup) -> Optional[str]:
        """Extract memo content from various possible page structures"""

        # Try various content selectors (Oaktree may change their structure)
        content_selectors = [
            ('article', {}),
            ('div', {'class': 'memo-content'}),
            ('div', {'class': 'entry-content'}),
            ('div', {'class': 'post-content'}),
            ('div', {'class': 'content'}),
            ('div', {'class': 'article-content'}),
            ('main', {}),
        ]

        content = None
        for tag, attrs in content_selectors:
            if attrs:
                content = soup.find(tag, attrs)
            else:
                content = soup.find(tag)

            if content and len(content.get_text(strip=True)) > 500:
                break

        if not content:
            # Fallback: try to get the largest text block
            all_divs = soup.find_all('div')
            if all_divs:
                content = max(all_divs, key=lambda d: len(d.get_text(strip=True)))

        return content

    def _clean_memo_text(self, content) -> str:
        """Clean and extract text from content element"""
        # Remove unwanted elements
        for elem in content.find_all(['script', 'style', 'nav', 'footer', 'aside', 'form']):
            elem.decompose()

        # Remove social sharing buttons, etc
        for elem in content.find_all(class_=re.compile(r'share|social|button|nav|menu|footer')):
            elem.decompose()

        # Get text with proper spacing
        text = content.get_text(separator='\n', strip=True)

        # Clean up excessive whitespace
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        return text.strip()

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        """Scrape individual memo"""
        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        # Get title - try various selectors
        title = None
        for selector in ['h1', 'h2.memo-title', '.article-title', '.post-title']:
            title_elem = soup.select_one(selector) if '.' in selector else soup.find(selector)
            if title_elem:
                title = title_elem.get_text(strip=True)
                break

        if not title:
            title = item.get('title', 'Howard Marks Memo')

        # Get content
        content = self._extract_memo_content(soup)
        if not content:
            self.logger.warning(f"Could not find content for: {item['url']}")
            return None

        text = self._clean_memo_text(content)

        # Verify we got meaningful content
        if len(text) < 500:
            self.logger.warning(f"Memo content seems too short ({len(text)} chars)")

        # Try to find date
        date = None
        date_patterns = [
            ('time', {}),
            ('span', {'class': 'date'}),
            ('div', {'class': 'date'}),
            ('span', {'class': 'post-date'}),
        ]

        for tag, attrs in date_patterns:
            if attrs:
                date_elem = soup.find(tag, attrs)
            else:
                date_elem = soup.find(tag)

            if date_elem:
                date = date_elem.get_text(strip=True)
                if date_elem.get('datetime'):
                    date = date_elem.get('datetime')
                break

        return {
            'title': title,
            'content': text,
            'url': item['url'],
            'date': date,
            'metadata': {
                'author': 'Howard Marks',
                'type': 'investment_memo',
                'source': 'Oaktree Capital',
                'category': 'market_cycles'
            }
        }


# Quick test
if __name__ == "__main__":
    scraper = OaktreeMemosScraper()
    print(f"Source: {scraper.get_source_name()}")
    print(f"Existing: {scraper.get_existing_count()}")
