# src/scrapers/damodaran.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional
import re


class DamodaranScraper(BaseScraper):
    """
    Scrapes Aswath Damodaran's valuation blog.

    Prof. Damodaran (NYU Stern) is the leading authority on valuation.
    His blog covers:
    - DCF (Discounted Cash Flow) valuation
    - Relative valuation (multiples)
    - Real-world valuation case studies
    - Market commentary and valuation metrics
    - Risk and discount rates

    Source: aswathdamodaran.blogspot.com
    """

    BASE_URL = "https://aswathdamodaran.blogspot.com"

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/investors/damodaran/blog",
            rate_limit=1.0
        )

    def get_source_name(self) -> str:
        return "Aswath Damodaran Valuation Blog"

    def get_urls(self, max_pages: int = 50) -> List[Dict]:
        """
        Get blog post URLs by paginating through the blog.

        Blogger uses "older posts" links for pagination.
        """
        urls = []
        seen_urls = set()
        page_url = self.BASE_URL
        pages_scraped = 0

        while page_url and pages_scraped < max_pages:
            self.logger.info(f"Fetching page {pages_scraped + 1}: {page_url}")

            soup = self.fetch_page(page_url)
            if not soup:
                break

            # Find post titles and links
            # Blogger typically uses h3.post-title or similar
            for post in soup.find_all('h3', class_='post-title'):
                link = post.find('a')
                if link and link.get('href'):
                    post_url = link['href']

                    # Skip duplicates
                    if post_url in seen_urls:
                        continue
                    seen_urls.add(post_url)

                    title = link.get_text(strip=True)

                    # Generate ID from URL
                    # Blogger URLs are like: /2024/01/post-title.html
                    post_id = post_url.split('/')[-1].replace('.html', '')

                    urls.append({
                        'id': post_id,
                        'url': post_url,
                        'title': title
                    })

            # Find "Older Posts" link for pagination
            older_link = soup.find('a', class_='blog-pager-older-link')
            if older_link and older_link.get('href'):
                page_url = older_link['href']
                pages_scraped += 1
            else:
                break

        self.logger.info(f"Found {len(urls)} blog posts across {pages_scraped + 1} pages")
        return urls

    def _extract_post_content(self, soup) -> Optional[str]:
        """Extract blog post content"""
        # Blogger structure
        content = soup.find('div', class_='post-body')

        if not content:
            # Try alternatives
            content = soup.find('div', class_='entry-content')

        if not content:
            content = soup.find('article')

        return content

    def _clean_post_text(self, content) -> str:
        """Clean up blog post text"""
        # Remove scripts, styles
        for elem in content.find_all(['script', 'style', 'iframe']):
            elem.decompose()

        # Remove social sharing, etc
        for elem in content.find_all(class_=re.compile(r'share|social|sidebar')):
            elem.decompose()

        # Get text
        text = content.get_text(separator='\n', strip=True)

        # Clean up
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = re.sub(r' {2,}', ' ', text)

        return text.strip()

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        """Scrape individual blog post"""
        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        # Get title
        title = None
        title_elem = soup.find('h3', class_='post-title')
        if title_elem:
            title_link = title_elem.find('a')
            if title_link:
                title = title_link.get_text(strip=True)
            else:
                title = title_elem.get_text(strip=True)

        if not title:
            title = item.get('title', 'Unknown')

        # Get content
        content = self._extract_post_content(soup)
        if not content:
            self.logger.warning(f"Could not find content for: {item['url']}")
            return None

        text = self._clean_post_text(content)

        # Skip if too short
        if len(text) < 200:
            self.logger.warning(f"Post too short ({len(text)} chars): {item['url']}")
            return None

        # Get date
        date = None
        date_elem = soup.find('abbr', class_='published')
        if date_elem:
            date = date_elem.get('title') or date_elem.get_text(strip=True)

        if not date:
            date_header = soup.find(class_='date-header')
            if date_header:
                date = date_header.get_text(strip=True)

        # Categorize based on content
        category = 'valuation'
        text_lower = text.lower()
        if 'dcf' in text_lower or 'discounted cash flow' in text_lower:
            category = 'dcf'
        elif 'multiple' in text_lower or 'p/e' in text_lower or 'ev/ebitda' in text_lower:
            category = 'relative_valuation'
        elif 'risk' in text_lower and 'premium' in text_lower:
            category = 'risk'

        return {
            'title': title,
            'content': text,
            'url': item['url'],
            'date': date,
            'metadata': {
                'author': 'Aswath Damodaran',
                'type': 'blog_post',
                'source': 'Musings on Markets',
                'category': category
            }
        }


# Quick test
if __name__ == "__main__":
    scraper = DamodaranScraper()
    print(f"Source: {scraper.get_source_name()}")
    print(f"Existing: {scraper.get_existing_count()}")
