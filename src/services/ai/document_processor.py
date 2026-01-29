# src/services/ai/document_processor.py

import os
import re
from typing import List, Dict, Generator, Optional
import logging

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """
    Process documents into chunks suitable for embedding and retrieval.

    Chunks are sized to:
    - Fit within embedding model context (usually 512 tokens ~ 2000 chars)
    - Maintain semantic coherence (paragraph-based splitting)
    - Have overlap for context continuity

    Usage:
        processor = DocumentProcessor()
        chunks = processor.process_directory("knowledge_base/")
        for chunk in chunks:
            print(chunk['content'][:100])
    """

    def __init__(self,
                 chunk_size: int = 1000,      # Target characters per chunk
                 chunk_overlap: int = 200,     # Overlap between chunks
                 min_chunk_size: int = 100):   # Minimum chunk size to keep
        """
        Args:
            chunk_size: Target size for each chunk in characters
            chunk_overlap: Number of characters to overlap between chunks
            min_chunk_size: Chunks smaller than this are discarded
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size

    def load_document(self, filepath: str) -> Dict:
        """
        Load document and extract metadata from header.

        Expected format:
        ```
        Title: ...
        Source: ...
        URL: ...
        Date: ...

        ---

        Content here...
        ```
        """
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        metadata = {
            'source_file': filepath,
            'filename': os.path.basename(filepath)
        }

        # Parse header metadata (before ---)
        if '---' in content:
            parts = content.split('---', 1)
            header = parts[0]
            body = parts[1].strip() if len(parts) > 1 else ''

            # Parse header lines
            for line in header.strip().split('\n'):
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip().lower().replace(' ', '_')
                    metadata[key] = value.strip()

            content = body
        else:
            # No header separator, use entire content
            pass

        return {
            'content': content,
            'metadata': metadata
        }

    def clean_text(self, text: str) -> str:
        """Clean and normalize text for processing"""
        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')

        # Remove excessive blank lines
        text = re.sub(r'\n{4,}', '\n\n\n', text)

        # Normalize whitespace (but preserve paragraph breaks)
        text = re.sub(r'[ \t]+', ' ', text)

        # Remove page numbers and common PDF artifacts
        text = re.sub(r'\n\s*\d+\s*\n', '\n', text)

        # Remove common header/footer patterns
        text = re.sub(r'^.*Page \d+ of \d+.*$', '', text, flags=re.MULTILINE)

        return text.strip()

    def split_into_paragraphs(self, text: str) -> List[str]:
        """Split text into paragraphs (double newline separated)"""
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]

    def split_by_sentences(self, text: str) -> List[str]:
        """Split text into sentences"""
        # Simple sentence splitting (handles common cases)
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
        return [s.strip() for s in sentences if s.strip()]

    def chunk_text(self, text: str) -> List[str]:
        """
        Split text into overlapping chunks.

        Strategy:
        1. Split by paragraphs first (semantic boundaries)
        2. Merge small paragraphs until chunk_size reached
        3. Split long paragraphs by sentences
        4. Add overlap from previous chunk
        """
        text = self.clean_text(text)
        paragraphs = self.split_into_paragraphs(text)

        chunks = []
        current_chunk = ""

        for para in paragraphs:
            # Handle long paragraphs by splitting into sentences
            if len(para) > self.chunk_size:
                # Save current chunk first
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                    current_chunk = ""

                # Split long paragraph by sentences
                sentences = self.split_by_sentences(para)
                for sentence in sentences:
                    if len(current_chunk) + len(sentence) + 1 <= self.chunk_size:
                        current_chunk += sentence + " "
                    else:
                        if current_chunk.strip():
                            chunks.append(current_chunk.strip())
                        current_chunk = sentence + " "

            # Normal case: add paragraph to current chunk
            elif len(current_chunk) + len(para) + 2 <= self.chunk_size:
                current_chunk += para + "\n\n"

            # Current chunk is full, start new one
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                current_chunk = para + "\n\n"

        # Don't forget the last chunk
        if current_chunk.strip() and len(current_chunk.strip()) >= self.min_chunk_size:
            chunks.append(current_chunk.strip())

        # Add overlap between chunks
        if self.chunk_overlap > 0 and len(chunks) > 1:
            chunks = self._add_overlap(chunks)

        return chunks

    def _add_overlap(self, chunks: List[str]) -> List[str]:
        """Add text from previous chunk as context"""
        overlapped = []

        for i, chunk in enumerate(chunks):
            if i > 0:
                # Get last N characters from previous chunk
                prev_chunk = chunks[i - 1]
                overlap_text = prev_chunk[-self.chunk_overlap:]

                # Try to start at a word/sentence boundary
                space_idx = overlap_text.find(' ')
                if space_idx > 0:
                    overlap_text = overlap_text[space_idx + 1:]

                # Mark overlap clearly
                chunk = f"[...] {overlap_text}\n\n{chunk}"

            overlapped.append(chunk)

        return overlapped

    def process_document(self, filepath: str) -> List[Dict]:
        """
        Process a single document into chunks with metadata.

        Returns:
            List of chunks, each with 'content' and 'metadata'
        """
        try:
            doc = self.load_document(filepath)
        except Exception as e:
            logger.error(f"Error loading {filepath}: {e}")
            return []

        content = doc['content']
        if not content or len(content) < self.min_chunk_size:
            logger.warning(f"Document too short: {filepath}")
            return []

        chunks = self.chunk_text(content)

        result = []
        for i, chunk in enumerate(chunks):
            result.append({
                'content': chunk,
                'metadata': {
                    **doc['metadata'],
                    'chunk_index': i,
                    'total_chunks': len(chunks),
                    'chunk_size': len(chunk)
                }
            })

        logger.debug(f"Processed {filepath}: {len(chunks)} chunks")
        return result

    def process_directory(self, directory: str) -> Generator[Dict, None, None]:
        """
        Process all documents in a directory tree.

        Yields chunks one at a time to handle large corpora efficiently.
        """
        if not os.path.exists(directory):
            logger.error(f"Directory does not exist: {directory}")
            return

        total_files = 0
        total_chunks = 0

        for root, dirs, files in os.walk(directory):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.')]

            for filename in files:
                # Only process text files
                if not filename.endswith('.txt'):
                    continue

                filepath = os.path.join(root, filename)

                try:
                    chunks = self.process_document(filepath)
                    total_files += 1
                    total_chunks += len(chunks)

                    for chunk in chunks:
                        yield chunk

                except Exception as e:
                    logger.error(f"Error processing {filepath}: {e}")

        logger.info(f"Processed {total_files} files, {total_chunks} chunks")

    def process_directory_to_list(self, directory: str) -> List[Dict]:
        """
        Process directory and return all chunks as a list.

        Use this for smaller corpora. For large corpora, use
        process_directory() which yields chunks one at a time.
        """
        return list(self.process_directory(directory))

    def get_stats(self, directory: str) -> Dict:
        """Get statistics about documents in a directory"""
        stats = {
            'total_files': 0,
            'total_chunks': 0,
            'total_chars': 0,
            'avg_chunk_size': 0,
            'sources': {}
        }

        for chunk in self.process_directory(directory):
            stats['total_chunks'] += 1
            stats['total_chars'] += len(chunk['content'])

            source = chunk['metadata'].get('source', 'Unknown')
            if source not in stats['sources']:
                stats['sources'][source] = 0
            stats['sources'][source] += 1

        if stats['total_chunks'] > 0:
            stats['avg_chunk_size'] = stats['total_chars'] / stats['total_chunks']

        # Count files separately
        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            stats['total_files'] += len([f for f in files if f.endswith('.txt')])

        return stats


# Test
if __name__ == "__main__":
    processor = DocumentProcessor()

    # Test with sample text
    sample_text = """
    This is the first paragraph. It contains some important information
    about investing and value.

    This is the second paragraph. It discusses market cycles and risk
    management strategies that are essential for long-term success.

    This third paragraph is about mental models and decision making.
    Understanding cognitive biases helps avoid common mistakes.
    """

    chunks = processor.chunk_text(sample_text)
    print(f"Created {len(chunks)} chunks:")
    for i, chunk in enumerate(chunks):
        print(f"\n--- Chunk {i+1} ({len(chunk)} chars) ---")
        print(chunk[:200] + "..." if len(chunk) > 200 else chunk)
