# src/services/ai/knowledge/citations/citation_tracker.py

"""
Citation tracking for knowledge sources.

Ensures every insight can be traced back to its original source
with proper attribution.
"""

import sqlite3
import json
import hashlib
import logging
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class Citation:
    """A citation for a piece of knowledge"""
    id: str
    source_name: str
    author: str
    title: str
    url: Optional[str]
    date: Optional[str]
    chunk_id: str
    quote: str
    context: str
    confidence: float  # How confident we are this is accurate (0-1)

    def to_short(self) -> str:
        """Short citation format: Author, Title (Year)"""
        parts = [self.author]
        if self.title:
            parts.append(f'"{self.title}"')
        if self.date:
            year = self.date[:4] if len(self.date) >= 4 else self.date
            parts.append(f"({year})")
        return ", ".join(parts)

    def to_full(self) -> str:
        """Full citation with source and URL"""
        citation = self.to_short()
        if self.source_name:
            citation += f", {self.source_name}"
        if self.url:
            citation += f" - {self.url}"
        return citation

    def to_markdown(self) -> str:
        """Markdown formatted citation with link"""
        text = self.to_short()
        if self.url:
            return f"[{text}]({self.url})"
        return text

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            'id': self.id,
            'source_name': self.source_name,
            'author': self.author,
            'title': self.title,
            'url': self.url,
            'date': self.date,
            'chunk_id': self.chunk_id,
            'quote': self.quote,
            'context': self.context,
            'confidence': self.confidence
        }


class CitationTracker:
    """
    Track and manage citations for knowledge.

    Features:
    - Create citations from knowledge chunks
    - Store and retrieve citations
    - Log citation usage
    - Generate formatted citations
    """

    def __init__(self, db_path: str = "data/citations.db"):
        """
        Args:
            db_path: Path to SQLite database for citations
        """
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._create_tables()

    def _create_tables(self):
        """Create citation tables"""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS citations (
                id TEXT PRIMARY KEY,
                source_name TEXT NOT NULL,
                author TEXT,
                title TEXT,
                url TEXT,
                date TEXT,
                chunk_id TEXT,
                quote TEXT,
                context TEXT,
                confidence REAL DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                citation_id TEXT NOT NULL,
                used_in TEXT,
                used_for TEXT,
                used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (citation_id) REFERENCES citations(id)
            );

            CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_name);
            CREATE INDEX IF NOT EXISTS idx_citations_author ON citations(author);
            CREATE INDEX IF NOT EXISTS idx_citations_chunk ON citations(chunk_id);
            CREATE INDEX IF NOT EXISTS idx_usage_citation ON usage_log(citation_id);
        """)
        self.conn.commit()

    def create_citation(self,
                        source_name: str,
                        author: str,
                        chunk_id: str,
                        quote: str,
                        title: str = None,
                        url: str = None,
                        date: str = None,
                        context: str = None,
                        confidence: float = 1.0) -> Citation:
        """
        Create a new citation.

        Args:
            source_name: Name of the source (e.g., "Berkshire Hathaway Letters")
            author: Author name
            chunk_id: ID of the knowledge chunk
            quote: The quoted text
            title: Title of the specific piece (optional)
            url: URL to the source (optional)
            date: Date of the source (optional)
            context: Surrounding context (optional)
            confidence: Confidence score 0-1 (optional)

        Returns:
            Created Citation object
        """
        # Generate unique ID from content hash
        hash_content = f"{source_name}:{author}:{quote[:100]}"
        citation_id = hashlib.sha256(hash_content.encode()).hexdigest()[:16]

        citation = Citation(
            id=citation_id,
            source_name=source_name,
            author=author,
            title=title or '',
            url=url,
            date=date,
            chunk_id=chunk_id,
            quote=quote,
            context=context or '',
            confidence=confidence
        )

        # Store in database
        self.conn.execute("""
            INSERT OR REPLACE INTO citations
            (id, source_name, author, title, url, date, chunk_id, quote, context, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            citation.id, citation.source_name, citation.author,
            citation.title, citation.url, citation.date,
            citation.chunk_id, citation.quote, citation.context,
            citation.confidence
        ))
        self.conn.commit()

        logger.debug(f"Created citation: {citation_id}")
        return citation

    def create_from_chunk(self, chunk: Dict) -> Citation:
        """
        Create citation from a knowledge chunk.

        Args:
            chunk: Dict with content and metadata

        Returns:
            Created Citation
        """
        metadata = chunk.get('metadata', {})

        return self.create_citation(
            source_name=metadata.get('source', 'Unknown Source'),
            author=metadata.get('author', 'Unknown Author'),
            chunk_id=str(chunk.get('id', '')),
            quote=chunk.get('content', '')[:500],  # First 500 chars as quote
            title=metadata.get('title'),
            url=metadata.get('url'),
            date=metadata.get('date') or metadata.get('year'),
            context=chunk.get('content', ''),
            confidence=1.0
        )

    def get_citation(self, citation_id: str) -> Optional[Citation]:
        """Retrieve a citation by ID"""
        cursor = self.conn.execute(
            "SELECT * FROM citations WHERE id = ?",
            (citation_id,)
        )
        row = cursor.fetchone()

        if row:
            return Citation(
                id=row[0],
                source_name=row[1],
                author=row[2],
                title=row[3] or '',
                url=row[4],
                date=row[5],
                chunk_id=row[6],
                quote=row[7],
                context=row[8],
                confidence=row[9]
            )
        return None

    def get_citations_for_chunk(self, chunk_id: str) -> List[Citation]:
        """Get all citations for a knowledge chunk"""
        cursor = self.conn.execute(
            "SELECT * FROM citations WHERE chunk_id = ?",
            (chunk_id,)
        )

        return [self._row_to_citation(row) for row in cursor]

    def get_citations_by_author(self, author: str) -> List[Citation]:
        """Get all citations from an author"""
        cursor = self.conn.execute(
            "SELECT * FROM citations WHERE LOWER(author) LIKE ?",
            (f"%{author.lower()}%",)
        )

        return [self._row_to_citation(row) for row in cursor]

    def get_citations_by_source(self, source: str) -> List[Citation]:
        """Get all citations from a source"""
        cursor = self.conn.execute(
            "SELECT * FROM citations WHERE LOWER(source_name) LIKE ?",
            (f"%{source.lower()}%",)
        )

        return [self._row_to_citation(row) for row in cursor]

    def _row_to_citation(self, row) -> Citation:
        """Convert database row to Citation object"""
        return Citation(
            id=row[0],
            source_name=row[1],
            author=row[2],
            title=row[3] or '',
            url=row[4],
            date=row[5],
            chunk_id=row[6],
            quote=row[7],
            context=row[8],
            confidence=row[9]
        )

    def log_usage(self, citation_id: str, used_in: str, used_for: str = None):
        """
        Log when a citation is used.

        Args:
            citation_id: ID of the citation
            used_in: Where it was used (e.g., "analysis", "chat")
            used_for: What purpose (e.g., "company_analysis", "question_answer")
        """
        self.conn.execute(
            "INSERT INTO usage_log (citation_id, used_in, used_for) VALUES (?, ?, ?)",
            (citation_id, used_in, used_for)
        )
        self.conn.commit()

    def get_usage_stats(self, citation_id: str = None) -> Dict:
        """Get usage statistics for citations"""
        if citation_id:
            cursor = self.conn.execute(
                """SELECT used_in, COUNT(*) FROM usage_log
                   WHERE citation_id = ? GROUP BY used_in""",
                (citation_id,)
            )
        else:
            cursor = self.conn.execute(
                "SELECT used_in, COUNT(*) FROM usage_log GROUP BY used_in"
            )

        by_context = {row[0]: row[1] for row in cursor}

        # Get most used citations
        cursor = self.conn.execute("""
            SELECT c.id, c.author, c.title, COUNT(u.id) as use_count
            FROM citations c
            JOIN usage_log u ON c.id = u.citation_id
            GROUP BY c.id
            ORDER BY use_count DESC
            LIMIT 10
        """)

        most_used = [
            {'id': row[0], 'author': row[1], 'title': row[2], 'count': row[3]}
            for row in cursor
        ]

        return {
            'by_context': by_context,
            'most_used': most_used,
            'total_uses': sum(by_context.values())
        }

    def format_citations(self,
                         citations: List[Citation],
                         format: str = 'markdown') -> str:
        """
        Format citations for inclusion in output.

        Args:
            citations: List of Citation objects
            format: 'markdown', 'plain', 'numbered'

        Returns:
            Formatted citations string
        """
        if not citations:
            return ""

        if format == 'markdown':
            lines = ["### Sources"]
            for c in citations:
                lines.append(f"- {c.to_markdown()}")
            return "\n".join(lines)

        elif format == 'numbered':
            lines = ["Sources:"]
            for i, c in enumerate(citations, 1):
                lines.append(f"[{i}] {c.to_full()}")
            return "\n".join(lines)

        else:  # plain
            lines = ["Sources:"]
            for c in citations:
                lines.append(f"• {c.to_short()}")
            return "\n".join(lines)

    def format_inline_citations(self,
                                text: str,
                                citations: List[Citation]) -> str:
        """
        Add inline citation references to text.

        Looks for quoted content and adds citation numbers.
        """
        # Build citation map
        citation_map = {}
        for i, c in enumerate(citations, 1):
            # Use first 50 chars of quote as key
            key = c.quote[:50].lower()
            citation_map[key] = f"[{i}]"

        # Try to match and add citations
        result = text
        for key, ref in citation_map.items():
            if key in result.lower():
                # Find and add reference after the quote
                idx = result.lower().find(key) + len(key)
                result = result[:idx] + f" {ref}" + result[idx:]

        return result

    def get_stats(self) -> Dict:
        """Get citation statistics"""
        cursor = self.conn.execute("SELECT COUNT(*) FROM citations")
        total = cursor.fetchone()[0]

        cursor = self.conn.execute(
            "SELECT author, COUNT(*) FROM citations GROUP BY author ORDER BY COUNT(*) DESC LIMIT 10"
        )
        by_author = {row[0]: row[1] for row in cursor}

        cursor = self.conn.execute(
            "SELECT source_name, COUNT(*) FROM citations GROUP BY source_name ORDER BY COUNT(*) DESC LIMIT 10"
        )
        by_source = {row[0]: row[1] for row in cursor}

        return {
            'total_citations': total,
            'by_author': by_author,
            'by_source': by_source
        }

    def close(self):
        """Close database connection"""
        self.conn.close()
