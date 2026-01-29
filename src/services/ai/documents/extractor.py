# src/services/ai/documents/extractor.py

import io
import re
import logging
from typing import Optional, Dict, List
from pathlib import Path

logger = logging.getLogger(__name__)


class DocumentExtractor:
    """
    Extract text from various document formats.

    Supported:
    - PDF
    - Plain text
    - HTML
    - Word documents (basic)
    """

    def extract(self,
                file_path: str = None,
                file_bytes: bytes = None,
                file_type: str = None) -> Optional[str]:
        """
        Extract text from a document.

        Args:
            file_path: Path to file
            file_bytes: Raw file bytes
            file_type: File type hint ('pdf', 'txt', 'html', 'docx')

        Returns:
            Extracted text or None
        """
        if file_path:
            file_type = file_type or Path(file_path).suffix.lower().strip('.')
            with open(file_path, 'rb') as f:
                file_bytes = f.read()

        if not file_bytes:
            return None

        if file_type == 'pdf':
            return self._extract_pdf(file_bytes)
        elif file_type in ('txt', 'text'):
            return file_bytes.decode('utf-8', errors='ignore')
        elif file_type in ('html', 'htm'):
            return self._extract_html(file_bytes)
        elif file_type == 'docx':
            return self._extract_docx(file_bytes)
        else:
            # Try to detect
            return self._auto_extract(file_bytes)

    def _extract_pdf(self, file_bytes: bytes) -> Optional[str]:
        """Extract text from PDF"""
        try:
            import PyPDF2

            pdf_file = io.BytesIO(file_bytes)
            reader = PyPDF2.PdfReader(pdf_file)

            text_parts = []
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

            return "\n\n".join(text_parts)
        except ImportError:
            logger.warning("PyPDF2 not installed. Install with: pip install PyPDF2")
            # Try alternative approach
            return self._extract_pdf_fallback(file_bytes)
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            return None

    def _extract_pdf_fallback(self, file_bytes: bytes) -> Optional[str]:
        """Fallback PDF extraction using pdfplumber"""
        try:
            import pdfplumber

            pdf_file = io.BytesIO(file_bytes)
            text_parts = []

            with pdfplumber.open(pdf_file) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)

            return "\n\n".join(text_parts)
        except ImportError:
            logger.error("Neither PyPDF2 nor pdfplumber installed")
            return None
        except Exception as e:
            logger.error(f"PDF fallback extraction error: {e}")
            return None

    def _extract_html(self, file_bytes: bytes) -> Optional[str]:
        """Extract text from HTML"""
        try:
            from bs4 import BeautifulSoup

            html = file_bytes.decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')

            # Remove scripts and styles
            for element in soup.find_all(['script', 'style', 'nav', 'footer', 'header']):
                element.decompose()

            return soup.get_text(separator='\n', strip=True)
        except ImportError:
            logger.warning("BeautifulSoup not installed. Install with: pip install beautifulsoup4")
            # Fallback: simple regex-based extraction
            return self._extract_html_fallback(file_bytes)
        except Exception as e:
            logger.error(f"HTML extraction error: {e}")
            return None

    def _extract_html_fallback(self, file_bytes: bytes) -> Optional[str]:
        """Simple HTML text extraction without BeautifulSoup"""
        try:
            html = file_bytes.decode('utf-8', errors='ignore')
            # Remove script and style blocks
            html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
            # Remove HTML tags
            text = re.sub(r'<[^>]+>', ' ', html)
            # Clean up whitespace
            text = re.sub(r'\s+', ' ', text)
            return text.strip()
        except Exception as e:
            logger.error(f"HTML fallback extraction error: {e}")
            return None

    def _extract_docx(self, file_bytes: bytes) -> Optional[str]:
        """Extract text from Word document"""
        try:
            from docx import Document

            doc_file = io.BytesIO(file_bytes)
            doc = Document(doc_file)

            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            return "\n\n".join(paragraphs)
        except ImportError:
            logger.warning("python-docx not installed. Install with: pip install python-docx")
            return None
        except Exception as e:
            logger.error(f"DOCX extraction error: {e}")
            return None

    def _auto_extract(self, file_bytes: bytes) -> Optional[str]:
        """Try to auto-detect and extract"""
        # Check for PDF magic number
        if file_bytes[:4] == b'%PDF':
            return self._extract_pdf(file_bytes)

        # Check for DOCX (ZIP with specific structure)
        if file_bytes[:4] == b'PK\x03\x04':
            try:
                return self._extract_docx(file_bytes)
            except:
                pass

        # Check for HTML
        try:
            text = file_bytes.decode('utf-8', errors='ignore')
            if '<html' in text.lower() or '<!doctype' in text.lower():
                return self._extract_html(file_bytes)
            return text
        except:
            return None

    def extract_with_metadata(self,
                              file_path: str = None,
                              file_bytes: bytes = None,
                              file_type: str = None) -> Dict:
        """
        Extract text with metadata.

        Returns:
            Dict with 'text', 'char_count', 'word_count', 'pages' (if applicable)
        """
        text = self.extract(file_path, file_bytes, file_type)

        if text is None:
            return {
                'text': None,
                'success': False,
                'error': 'Extraction failed'
            }

        word_count = len(text.split())
        char_count = len(text)

        # Estimate pages (roughly 3000 chars per page)
        estimated_pages = max(1, char_count // 3000)

        return {
            'text': text,
            'success': True,
            'char_count': char_count,
            'word_count': word_count,
            'estimated_pages': estimated_pages
        }


class TranscriptParser:
    """
    Parse earnings call transcripts into structured format.

    Identifies:
    - Speaker sections
    - Q&A portions
    - Prepared remarks
    """

    # Common patterns
    SPEAKER_PATTERNS = [
        r'^([A-Z][a-z]+ [A-Z][a-z]+)[\s-]+(?:CEO|CFO|President|Analyst|COO|CTO)',
        r'^(Operator):?',
        r'^Q - ([A-Z][a-z]+ [A-Z][a-z]+)',
        r'^A - ([A-Z][a-z]+ [A-Z][a-z]+)',
    ]

    QA_MARKERS = [
        'question-and-answer',
        'questions and answers',
        'q&a session',
        'operator instructions',
        'we will now begin'
    ]

    def parse(self, transcript: str) -> Dict:
        """
        Parse transcript into structured sections.

        Returns:
            Dict with 'prepared_remarks', 'qa_section', 'speakers'
        """
        # Find Q&A section start
        qa_start = self._find_qa_start(transcript)

        if qa_start:
            prepared = transcript[:qa_start]
            qa = transcript[qa_start:]
        else:
            prepared = transcript
            qa = ""

        # Extract speakers
        speakers = self._extract_speakers(transcript)

        # Parse into blocks
        prepared_blocks = self._parse_blocks(prepared)
        qa_blocks = self._parse_blocks(qa)

        return {
            'prepared_remarks': {
                'text': prepared,
                'blocks': prepared_blocks,
                'word_count': len(prepared.split())
            },
            'qa_section': {
                'text': qa,
                'blocks': qa_blocks,
                'word_count': len(qa.split())
            },
            'speakers': speakers,
            'total_word_count': len(transcript.split())
        }

    def _find_qa_start(self, transcript: str) -> Optional[int]:
        """Find the start of Q&A section"""
        transcript_lower = transcript.lower()

        for marker in self.QA_MARKERS:
            pos = transcript_lower.find(marker)
            if pos > 0:
                return pos

        return None

    def _extract_speakers(self, transcript: str) -> List[Dict]:
        """Extract unique speakers from transcript"""
        speakers = {}

        for pattern in self.SPEAKER_PATTERNS:
            matches = re.finditer(pattern, transcript, re.MULTILINE)
            for match in matches:
                name = match.group(1)
                if name not in speakers:
                    speakers[name] = {
                        'name': name,
                        'count': 0,
                        'first_appearance': match.start()
                    }
                speakers[name]['count'] += 1

        return list(speakers.values())

    def _parse_blocks(self, text: str) -> List[Dict]:
        """Parse text into speaker blocks"""
        blocks = []
        current_speaker = "Unknown"
        current_text = []

        for line in text.split('\n'):
            line = line.strip()
            if not line:
                continue

            # Check if this is a speaker line
            speaker_match = None
            for pattern in self.SPEAKER_PATTERNS:
                match = re.match(pattern, line)
                if match:
                    speaker_match = match.group(1)
                    break

            if speaker_match:
                # Save previous block
                if current_text:
                    blocks.append({
                        'speaker': current_speaker,
                        'text': ' '.join(current_text)
                    })
                current_speaker = speaker_match
                current_text = [line[len(speaker_match):].strip(': -')]
            else:
                current_text.append(line)

        # Don't forget last block
        if current_text:
            blocks.append({
                'speaker': current_speaker,
                'text': ' '.join(current_text)
            })

        return blocks
