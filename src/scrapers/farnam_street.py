# src/scrapers/farnam_street.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional
import re


class FarnamStreetScraper(BaseScraper):
    """
    Scrapes mental models and decision-making frameworks from Farnam Street.

    Shane Parrish's Farnam Street covers:
    - Mental models for better thinking
    - Cognitive biases and how to avoid them
    - Decision-making frameworks
    - First principles thinking
    - Inversion and other thinking tools

    These are critical for investment decision-making.

    Source: fs.blog
    """

    BASE_URL = "https://fs.blog"

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/mental_models/farnam_street",
            rate_limit=1.0
        )

    def get_source_name(self) -> str:
        return "Farnam Street Mental Models"

    def get_urls(self) -> List[Dict]:
        """Get mental model article URLs"""
        urls = []
        seen_urls = set()

        # Key pages to scrape
        start_pages = [
            f"{self.BASE_URL}/mental-models/",
            f"{self.BASE_URL}/thinking/",
            f"{self.BASE_URL}/smart-decisions/",
        ]

        for page_url in start_pages:
            soup = self.fetch_page(page_url)
            if not soup:
                continue

            # Find article links
            for link in soup.find_all('a', href=True):
                href = link['href']

                # Normalize URL
                if href.startswith('/'):
                    href = self.BASE_URL + href
                elif not href.startswith('http'):
                    continue

                # Filter for relevant content
                relevant_patterns = [
                    '/mental-models/',
                    '/thinking/',
                    '/decision-making/',
                    '/cognitive-bias/',
                    '/first-principles/',
                ]

                if not any(p in href for p in relevant_patterns):
                    continue

                # Skip non-article pages
                skip_patterns = [
                    '/tag/', '/category/', '/author/', '/page/',
                    '/membership/', '/newsletter/', '/about/'
                ]
                if any(p in href for p in skip_patterns):
                    continue

                # Skip duplicates
                if href in seen_urls:
                    continue
                seen_urls.add(href)

                # Extract title
                title = link.get_text(strip=True)
                if not title or len(title) < 5:
                    # Generate from URL
                    slug = href.rstrip('/').split('/')[-1]
                    title = slug.replace('-', ' ').title()

                # Generate ID
                article_id = href.rstrip('/').split('/')[-1]
                if not article_id or article_id in ['mental-models', 'thinking']:
                    continue

                urls.append({
                    'id': article_id,
                    'url': href,
                    'title': title
                })

        self.logger.info(f"Found {len(urls)} articles")
        return urls

    def _extract_article_content(self, soup) -> Optional[str]:
        """Extract article content"""
        # Try various content selectors
        content_selectors = [
            'article',
            '.entry-content',
            '.post-content',
            '.article-content',
            'main',
        ]

        content = None
        for selector in content_selectors:
            content = soup.select_one(selector)
            if content and len(content.get_text(strip=True)) > 500:
                break

        return content

    def _clean_article_text(self, content) -> str:
        """Clean up article text"""
        # Remove unwanted elements
        for elem in content.find_all(['script', 'style', 'nav', 'footer', 'aside']):
            elem.decompose()

        # Remove ads, social buttons, etc
        for elem in content.find_all(class_=re.compile(
            r'share|social|sidebar|related|comment|newsletter|subscribe|ad-'
        )):
            elem.decompose()

        # Get text
        text = content.get_text(separator='\n', strip=True)

        # Clean up
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        return text.strip()

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        """Scrape individual article"""
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
        content = self._extract_article_content(soup)
        if not content:
            self.logger.warning(f"Could not find content for: {item['url']}")
            return None

        text = self._clean_article_text(content)

        # Skip if too short
        if len(text) < 300:
            self.logger.warning(f"Article too short ({len(text)} chars): {item['url']}")
            return None

        # Determine category from URL
        category = 'mental_model'
        if '/thinking/' in item['url']:
            category = 'thinking'
        elif '/decision-making/' in item['url']:
            category = 'decision_making'
        elif '/cognitive-bias/' in item['url']:
            category = 'cognitive_bias'

        return {
            'title': title,
            'content': text,
            'url': item['url'],
            'metadata': {
                'source': 'Farnam Street',
                'author': 'Shane Parrish',
                'type': 'article',
                'category': category
            }
        }


# Quick test
if __name__ == "__main__":
    scraper = FarnamStreetScraper()
    print(f"Source: {scraper.get_source_name()}")
    print(f"Existing: {scraper.get_existing_count()}")
