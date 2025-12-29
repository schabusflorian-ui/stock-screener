# src/scrapers/collaborative_fund.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional
import re


class CollaborativeFundScraper(BaseScraper):
    """
    Scrapes Morgan Housel's essays from Collaborative Fund blog.

    Morgan Housel (author of "The Psychology of Money") writes about:
    - Behavioral finance and investing psychology
    - Long-term thinking
    - Wealth building and compounding
    - Common investing mistakes
    - Historical perspectives on markets

    Source: collabfund.com/blog
    """

    BASE_URL = "https://collabfund.com"
    BLOG_URL = f"{BASE_URL}/blog/"

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/investors/housel/essays",
            rate_limit=1.0
        )

    def get_source_name(self) -> str:
        return "Morgan Housel - Collaborative Fund"

    def get_urls(self, max_pages: int = 20) -> List[Dict]:
        """Get blog post URLs"""
        urls = []
        seen_urls = set()
        page_num = 1

        while page_num <= max_pages:
            if page_num == 1:
                page_url = self.BLOG_URL
            else:
                page_url = f"{self.BLOG_URL}page/{page_num}/"

            self.logger.info(f"Fetching page {page_num}: {page_url}")

            soup = self.fetch_page(page_url)
            if not soup:
                break

            posts_found = 0

            # Find article links
            for article in soup.find_all('article'):
                link = article.find('a', href=True)
                if not link:
                    continue

                href = link['href']

                # Normalize URL
                if href.startswith('/'):
                    href = self.BASE_URL + href

                # Skip non-blog URLs
                if '/blog/' not in href:
                    continue

                # Skip duplicates
                if href in seen_urls:
                    continue
                seen_urls.add(href)

                # Get title
                title = None
                h2 = article.find('h2')
                if h2:
                    title = h2.get_text(strip=True)
                if not title:
                    title = link.get_text(strip=True)
                if not title or len(title) < 3:
                    slug = href.rstrip('/').split('/')[-1]
                    title = slug.replace('-', ' ').title()

                # Generate ID
                article_id = href.rstrip('/').split('/')[-1]
                if not article_id:
                    continue

                urls.append({
                    'id': article_id,
                    'url': href,
                    'title': title
                })
                posts_found += 1

            # If no posts found on this page, stop
            if posts_found == 0:
                break

            page_num += 1

        self.logger.info(f"Found {len(urls)} articles")
        return urls

    def _extract_essay_content(self, soup) -> Optional[str]:
        """Extract essay content"""
        content_selectors = [
            'article',
            '.post-content',
            '.entry-content',
            '.blog-post-content',
            'main',
        ]

        content = None
        for selector in content_selectors:
            content = soup.select_one(selector)
            if content and len(content.get_text(strip=True)) > 300:
                break

        return content

    def _clean_essay_text(self, content) -> str:
        """Clean up essay text"""
        # Remove unwanted elements
        for elem in content.find_all(['script', 'style', 'nav', 'footer', 'aside', 'form']):
            elem.decompose()

        # Remove social sharing, newsletter signup, etc
        for elem in content.find_all(class_=re.compile(
            r'share|social|newsletter|subscribe|related|comment|author-bio'
        )):
            elem.decompose()

        # Get text
        text = content.get_text(separator='\n', strip=True)

        # Clean up
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        return text.strip()

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        """Scrape individual essay"""
        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        # Get title
        title = None
        title_elem = soup.find('h1')
        if title_elem:
            title = title_elem.get_text(strip=True)
        if not title:
            title = item.get('title', 'Unknown')

        # Get content
        content = self._extract_essay_content(soup)
        if not content:
            self.logger.warning(f"Could not find content for: {item['url']}")
            return None

        text = self._clean_essay_text(content)

        # Skip if too short
        if len(text) < 300:
            self.logger.warning(f"Essay too short ({len(text)} chars): {item['url']}")
            return None

        # Get date
        date = None
        date_elem = soup.find('time')
        if date_elem:
            date = date_elem.get('datetime') or date_elem.get_text(strip=True)

        # Categorize based on content
        category = 'behavioral_finance'
        text_lower = text.lower()
        if 'compound' in text_lower or 'long-term' in text_lower or 'time' in text_lower:
            category = 'long_term_thinking'
        elif 'mistake' in text_lower or 'error' in text_lower or 'bias' in text_lower:
            category = 'investing_mistakes'
        elif 'history' in text_lower or 'past' in text_lower:
            category = 'market_history'
        elif 'wealth' in text_lower or 'rich' in text_lower or 'money' in text_lower:
            category = 'wealth_building'

        return {
            'title': title,
            'content': text,
            'url': item['url'],
            'date': date,
            'metadata': {
                'author': 'Morgan Housel',
                'type': 'essay',
                'source': 'Collaborative Fund',
                'category': category
            }
        }


# Quick test
if __name__ == "__main__":
    scraper = CollaborativeFundScraper()
    print(f"Source: {scraper.get_source_name()}")
    print(f"Existing: {scraper.get_existing_count()}")
