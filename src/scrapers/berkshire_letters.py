# src/scrapers/berkshire_letters.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional
import io
import re

try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False


class BerkshireLettersScraper(BaseScraper):
    """
    Scrapes Warren Buffett's annual shareholder letters (1977-2024).

    These are the primary source of Buffett's investment philosophy,
    covering topics like:
    - Intrinsic value and margin of safety
    - Competitive advantages (moats)
    - Management quality
    - Capital allocation
    - Long-term thinking

    Source: berkshirehathaway.com/letters.html
    """

    BASE_URL = "https://www.berkshirehathaway.com/letters"

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/investors/buffett/shareholder_letters",
            rate_limit=2.0  # Be respectful to Berkshire's servers
        )

    def get_source_name(self) -> str:
        return "Berkshire Hathaway Shareholder Letters"

    def get_urls(self) -> List[Dict]:
        """
        Get URLs for all letters 1977-2024.

        Berkshire has used different URL patterns over the years:
        - 1977-2003: HTML format {year}.html
        - 2004-2024: PDF format {year}ltr.pdf
        """
        letters = []

        # HTML format for older letters (1977-2003)
        for year in range(1977, 2004):
            letters.append({
                'id': str(year),
                'year': year,
                'url': f"{self.BASE_URL}/{year}.html",
                'format': 'html'
            })

        # PDF format for newer letters (2004-2024)
        for year in range(2004, 2025):
            letters.append({
                'id': str(year),
                'year': year,
                'url': f"{self.BASE_URL}/{year}ltr.pdf",
                'format': 'pdf'
            })

        return letters

    def _extract_text_from_pdf(self, pdf_content: bytes) -> Optional[str]:
        """Extract text from PDF content"""
        if not HAS_PYPDF2:
            self.logger.error("PyPDF2 not installed. Run: pip install PyPDF2")
            return None

        try:
            pdf_file = io.BytesIO(pdf_content)
            reader = PyPDF2.PdfReader(pdf_file)

            text = ""
            for page_num, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n\n"
                except Exception as e:
                    self.logger.warning(f"Error extracting page {page_num}: {e}")

            return text.strip() if text else None

        except Exception as e:
            self.logger.error(f"Error reading PDF: {e}")
            return None

    def _clean_buffett_letter(self, text: str) -> str:
        """Clean up common issues in Buffett letter PDFs"""
        # Remove excessive whitespace
        text = re.sub(r'\n{4,}', '\n\n\n', text)

        # Remove page headers/footers (common patterns)
        text = re.sub(r'\n\d+\n', '\n', text)  # Page numbers
        text = re.sub(r'BERKSHIRE HATHAWAY INC\.?\n?', '', text, flags=re.IGNORECASE)

        return text.strip()

    def _extract_text_from_soup(self, soup) -> Optional[str]:
        """Extract text from BeautifulSoup object"""
        try:
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            # Get text from pre tags (Berkshire letters use <pre> for formatting)
            pre_tags = soup.find_all('pre')
            if pre_tags:
                text = '\n\n'.join(pre.get_text() for pre in pre_tags)
            else:
                # Fallback to body text
                text = soup.get_text()

            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)

            return text.strip() if text else None

        except Exception as e:
            self.logger.error(f"Error parsing HTML: {e}")
            return None

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        """Download and extract text from letter (PDF or HTML)"""
        year = item['year']
        format_type = item.get('format', 'pdf')

        if format_type == 'html':
            # Fetch HTML page
            soup = self.fetch_page(item['url'])
            if not soup:
                self.logger.error(f"Could not download HTML letter for {year}")
                return None

            text = self._extract_text_from_soup(soup)
        else:
            # Try main URL pattern for PDF
            pdf_content = self.fetch_pdf(item['url'])

            # If that fails, try alternate URL patterns
            if not pdf_content:
                alternate_urls = [
                    f"{self.BASE_URL}/{year}.pdf",
                    f"{self.BASE_URL}/{year}ltr.PDF",
                    f"https://www.berkshirehathaway.com/{year}ltr.pdf",
                ]

                for alt_url in alternate_urls:
                    self.logger.info(f"Trying alternate URL: {alt_url}")
                    pdf_content = self.fetch_pdf(alt_url)
                    if pdf_content:
                        item['url'] = alt_url
                        break

            if not pdf_content:
                self.logger.error(f"Could not download PDF letter for {year}")
                return None

            # Extract text from PDF
            text = self._extract_text_from_pdf(pdf_content)

        if not text:
            self.logger.error(f"Could not extract text from {year} letter")
            return None

        # Clean up the text
        text = self._clean_buffett_letter(text)

        # Verify we got meaningful content
        if len(text) < 1000:
            self.logger.warning(f"Letter for {year} seems too short ({len(text)} chars)")

        return {
            'title': f"Berkshire Hathaway {year} Annual Letter to Shareholders",
            'content': text,
            'url': item['url'],
            'date': str(year),
            'metadata': {
                'author': 'Warren Buffett',
                'type': 'shareholder_letter',
                'year': year,
                'company': 'Berkshire Hathaway'
            }
        }


# Quick test
if __name__ == "__main__":
    scraper = BerkshireLettersScraper()
    print(f"Source: {scraper.get_source_name()}")
    print(f"Existing: {scraper.get_existing_count()}")
    urls = scraper.get_urls()
    print(f"Total URLs: {len(urls)}")
    print(f"Sample: {urls[0]}")
