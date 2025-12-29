# src/services/ai/vector_store.py

import sqlite3
import json
import numpy as np
from typing import List, Dict, Optional, Tuple
import os
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class VectorStore:
    """
    SQLite-based vector store with cosine similarity search.

    Simple and dependency-free implementation. Suitable for knowledge bases
    up to ~100k documents. For larger scale, consider:
    - ChromaDB (simple, local)
    - Pinecone (managed, cloud)
    - pgvector (PostgreSQL extension)
    - Qdrant (local or cloud)

    Usage:
        store = VectorStore("data/knowledge_vectors.db")
        store.add_documents(chunks_with_embeddings)
        results = store.search(query_embedding, top_k=5)

    Schema:
        documents:
            - id: auto-increment
            - content: text content
            - metadata: JSON blob
            - embedding: binary blob (numpy float32)
            - created_at: timestamp

        sources:
            - id: auto-increment
            - name: source name
            - last_updated: timestamp
            - document_count: int
    """

    def __init__(self, db_path: str = "data/knowledge_vectors.db"):
        """
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path

        # Ensure directory exists
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else '.', exist_ok=True)

        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._create_tables()

        logger.info(f"VectorStore initialized: {db_path}")

    def _create_tables(self):
        """Create necessary tables if they don't exist"""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                metadata TEXT,
                embedding BLOB,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                last_updated DATETIME,
                document_count INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_docs_created
            ON documents(created_at);
        """)
        self.conn.commit()

    def add_documents(self, chunks: List[Dict], batch_size: int = 100) -> int:
        """
        Add documents with their embeddings.

        Each chunk should have:
        - content: str (required)
        - metadata: dict (optional)
        - embedding: List[float] (required)

        Args:
            chunks: List of chunk dicts
            batch_size: Insert in batches for performance

        Returns:
            Number of documents added
        """
        if not chunks:
            return 0

        cursor = self.conn.cursor()
        added = 0

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            rows = []

            for chunk in batch:
                if 'embedding' not in chunk:
                    logger.warning("Chunk missing embedding, skipping")
                    continue

                # Convert embedding to bytes
                embedding_bytes = np.array(
                    chunk['embedding'], dtype=np.float32
                ).tobytes()

                rows.append((
                    chunk.get('content', ''),
                    json.dumps(chunk.get('metadata', {})),
                    embedding_bytes
                ))

            if rows:
                cursor.executemany(
                    "INSERT INTO documents (content, metadata, embedding) VALUES (?, ?, ?)",
                    rows
                )
                added += len(rows)

        self.conn.commit()
        logger.info(f"Added {added} documents to vector store")

        return added

    def add_document(self, content: str, embedding: List[float],
                     metadata: Dict = None) -> int:
        """
        Add a single document.

        Returns:
            Document ID
        """
        cursor = self.conn.cursor()

        embedding_bytes = np.array(embedding, dtype=np.float32).tobytes()

        cursor.execute(
            "INSERT INTO documents (content, metadata, embedding) VALUES (?, ?, ?)",
            (content, json.dumps(metadata or {}), embedding_bytes)
        )
        self.conn.commit()

        return cursor.lastrowid

    def search(self,
               query_embedding: List[float],
               top_k: int = 5,
               min_similarity: float = 0.0,
               filter_topics: List[str] = None,
               filter_sources: List[str] = None) -> List[Dict]:
        """
        Find most similar documents using cosine similarity.

        Args:
            query_embedding: Query vector
            top_k: Number of results to return
            min_similarity: Minimum similarity threshold (0-1)
            filter_topics: Only return docs matching these topics
            filter_sources: Only return docs from these sources

        Returns:
            List of matching documents with similarity scores, sorted by similarity
        """
        query_vec = np.array(query_embedding, dtype=np.float32)
        query_norm = np.linalg.norm(query_vec)

        if query_norm == 0:
            logger.warning("Query embedding has zero norm")
            return []

        cursor = self.conn.execute(
            "SELECT id, content, metadata, embedding FROM documents"
        )

        results = []
        for row in cursor:
            doc_id, content, metadata_json, embedding_bytes = row

            # Deserialize embedding
            doc_vec = np.frombuffer(embedding_bytes, dtype=np.float32)
            doc_norm = np.linalg.norm(doc_vec)

            if doc_norm == 0:
                continue

            # Cosine similarity
            similarity = float(np.dot(query_vec, doc_vec) / (query_norm * doc_norm))

            if similarity < min_similarity:
                continue

            metadata = json.loads(metadata_json) if metadata_json else {}

            # Topic filter
            if filter_topics:
                doc_topics = metadata.get('topics', [])
                if not any(t in doc_topics for t in filter_topics):
                    continue

            # Source filter
            if filter_sources:
                doc_source = metadata.get('source', '')
                if doc_source not in filter_sources:
                    continue

            results.append({
                'id': doc_id,
                'content': content,
                'metadata': metadata,
                'similarity': similarity
            })

        # Sort by similarity (descending) and take top_k
        results.sort(key=lambda x: x['similarity'], reverse=True)

        return results[:top_k]

    def search_by_topic(self, topic: str, limit: int = 20) -> List[Dict]:
        """
        Get documents matching a specific topic.

        Uses metadata JSON search (slower for large datasets).
        """
        cursor = self.conn.execute(
            """SELECT id, content, metadata FROM documents
               WHERE metadata LIKE ?
               LIMIT ?""",
            (f'%"{topic}"%', limit)
        )

        results = []
        for row in cursor:
            results.append({
                'id': row[0],
                'content': row[1],
                'metadata': json.loads(row[2]) if row[2] else {}
            })

        return results

    def get_document(self, doc_id: int) -> Optional[Dict]:
        """Get a single document by ID"""
        cursor = self.conn.execute(
            "SELECT id, content, metadata, created_at FROM documents WHERE id = ?",
            (doc_id,)
        )
        row = cursor.fetchone()

        if not row:
            return None

        return {
            'id': row[0],
            'content': row[1],
            'metadata': json.loads(row[2]) if row[2] else {},
            'created_at': row[3]
        }

    def delete_document(self, doc_id: int) -> bool:
        """Delete a document by ID"""
        cursor = self.conn.execute(
            "DELETE FROM documents WHERE id = ?",
            (doc_id,)
        )
        self.conn.commit()
        return cursor.rowcount > 0

    def update_source(self, source_name: str, doc_count: int):
        """Update source statistics"""
        self.conn.execute(
            """INSERT INTO sources (name, last_updated, document_count)
               VALUES (?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                   last_updated = excluded.last_updated,
                   document_count = excluded.document_count""",
            (source_name, datetime.now().isoformat(), doc_count)
        )
        self.conn.commit()

    def get_stats(self) -> Dict:
        """Get statistics about the vector store"""
        cursor = self.conn.execute("SELECT COUNT(*) FROM documents")
        doc_count = cursor.fetchone()[0]

        # Sample metadata for topic/source distribution
        cursor = self.conn.execute(
            "SELECT metadata FROM documents ORDER BY RANDOM() LIMIT 1000"
        )

        topics = {}
        sources = {}
        authors = {}

        for row in cursor:
            if not row[0]:
                continue
            meta = json.loads(row[0])

            for topic in meta.get('topics', []):
                topics[topic] = topics.get(topic, 0) + 1

            source = meta.get('source', 'Unknown')
            sources[source] = sources.get(source, 0) + 1

            author = meta.get('author', 'Unknown')
            authors[author] = authors.get(author, 0) + 1

        # Get source last updated times
        cursor = self.conn.execute(
            "SELECT name, last_updated, document_count FROM sources"
        )
        source_info = {row[0]: {'last_updated': row[1], 'count': row[2]}
                       for row in cursor}

        return {
            'total_documents': doc_count,
            'topics': dict(sorted(topics.items(), key=lambda x: x[1], reverse=True)),
            'sources': dict(sorted(sources.items(), key=lambda x: x[1], reverse=True)),
            'authors': dict(sorted(authors.items(), key=lambda x: x[1], reverse=True)),
            'source_info': source_info
        }

    def get_count(self) -> int:
        """Get total document count"""
        cursor = self.conn.execute("SELECT COUNT(*) FROM documents")
        return cursor.fetchone()[0]

    def clear(self):
        """Clear all documents (use with caution!)"""
        self.conn.execute("DELETE FROM documents")
        self.conn.execute("DELETE FROM sources")
        self.conn.commit()
        logger.warning("Cleared all documents from vector store")

    def clear_source(self, source_name: str) -> int:
        """
        Delete all documents from a specific source.

        Returns:
            Number of documents deleted
        """
        cursor = self.conn.execute(
            """DELETE FROM documents
               WHERE metadata LIKE ?""",
            (f'%"source": "{source_name}"%',)
        )
        self.conn.commit()

        deleted = cursor.rowcount
        logger.info(f"Deleted {deleted} documents from source: {source_name}")

        return deleted

    def vacuum(self):
        """Reclaim space after deletions"""
        self.conn.execute("VACUUM")
        logger.info("Vacuumed database")

    def close(self):
        """Close database connection"""
        self.conn.close()


# Test
if __name__ == "__main__":
    import tempfile

    print("Testing VectorStore...")

    # Create temp database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name

    try:
        store = VectorStore(db_path)

        # Add test documents
        test_chunks = [
            {
                'content': 'Margin of safety is key to value investing.',
                'embedding': [0.1, 0.2, 0.3, 0.4],
                'metadata': {'source': 'Test', 'topics': ['valuation', 'risk']}
            },
            {
                'content': 'Network effects create strong moats.',
                'embedding': [0.2, 0.3, 0.4, 0.5],
                'metadata': {'source': 'Test', 'topics': ['moats']}
            },
            {
                'content': 'Fear and greed drive market cycles.',
                'embedding': [0.3, 0.4, 0.5, 0.6],
                'metadata': {'source': 'Test', 'topics': ['psychology', 'cycles']}
            }
        ]

        store.add_documents(test_chunks)
        print(f"Added {store.get_count()} documents")

        # Search
        query = [0.15, 0.25, 0.35, 0.45]
        results = store.search(query, top_k=2)

        print(f"\nSearch results for query {query}:")
        for r in results:
            print(f"  - {r['content'][:50]}... (similarity: {r['similarity']:.3f})")

        # Stats
        stats = store.get_stats()
        print(f"\nStats: {stats['total_documents']} docs, topics: {stats['topics']}")

        store.close()

    finally:
        os.unlink(db_path)

    print("\nTest passed!")
