# src/services/ai/knowledge/advanced/hybrid_search.py

"""
Hybrid Search combining semantic (embedding) and keyword (BM25) search.

Benefits:
- Semantic: Understands meaning, handles synonyms, conceptual similarity
- Keyword: Exact matching, rare terms, proper nouns, technical terms
- Combined: Best of both worlds with configurable weighting
"""

import math
import re
from typing import List, Dict, Tuple, Optional
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class BM25:
    """
    BM25 (Best Matching 25) keyword search implementation.

    A probabilistic ranking function used for information retrieval.
    Complements semantic search for:
    - Exact term matching
    - Rare/specific terms
    - Author names
    - Technical terminology
    """

    # Common English stop words to ignore
    STOP_WORDS = {
        'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
        'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them',
        'their', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his',
        'she', 'her', 'i', 'me', 'my', 'who', 'what', 'which', 'when',
        'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
        'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
        'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now'
    }

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        """
        Args:
            k1: Term frequency saturation parameter (1.2-2.0 typical)
            b: Document length normalization (0.75 typical)
        """
        self.k1 = k1
        self.b = b
        self.documents = {}  # doc_id -> document dict
        self.doc_lengths = {}  # doc_id -> token count
        self.avg_doc_length = 0
        self.doc_freqs = defaultdict(int)  # term -> count of docs containing term
        self.term_freqs = {}  # doc_id -> {term: count}
        self.doc_count = 0
        self.idf_cache = {}

    def index(self, documents: List[Dict]):
        """
        Index documents for BM25 search.

        Args:
            documents: List of dicts with 'id' and 'content' keys
        """
        self.documents = {doc['id']: doc for doc in documents}
        self.doc_count = len(documents)
        total_length = 0

        for doc in documents:
            doc_id = doc['id']
            text = doc.get('content', '').lower()
            terms = self._tokenize(text)

            self.doc_lengths[doc_id] = len(terms)
            total_length += len(terms)

            # Count term frequencies within document
            term_counts = defaultdict(int)
            for term in terms:
                term_counts[term] += 1
            self.term_freqs[doc_id] = dict(term_counts)

            # Count document frequencies (how many docs contain each term)
            for term in set(terms):
                self.doc_freqs[term] += 1

        self.avg_doc_length = total_length / self.doc_count if self.doc_count > 0 else 0

        # Pre-compute IDF for all terms
        for term, df in self.doc_freqs.items():
            # IDF formula: log((N - df + 0.5) / (df + 0.5) + 1)
            self.idf_cache[term] = math.log(
                (self.doc_count - df + 0.5) / (df + 0.5) + 1
            )

        logger.info(f"BM25: Indexed {self.doc_count} documents, {len(self.doc_freqs)} unique terms")

    def search(self, query: str, top_k: int = 10) -> List[Tuple[str, float]]:
        """
        Search for documents matching query.

        Args:
            query: Search query string
            top_k: Number of results to return

        Returns:
            List of (doc_id, score) tuples sorted by score descending
        """
        query_terms = self._tokenize(query.lower())

        if not query_terms:
            return []

        scores = {}

        for doc_id, term_freqs in self.term_freqs.items():
            score = 0
            doc_length = self.doc_lengths[doc_id]

            for term in query_terms:
                if term not in term_freqs:
                    continue

                tf = term_freqs[term]  # Term frequency in document
                idf = self.idf_cache.get(term, 0)  # Inverse document frequency

                # BM25 scoring formula
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (
                    1 - self.b + self.b * (doc_length / self.avg_doc_length)
                )
                score += idf * (numerator / denominator)

            if score > 0:
                scores[doc_id] = score

        # Sort by score descending
        sorted_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return sorted_results[:top_k]

    def _tokenize(self, text: str) -> List[str]:
        """
        Tokenize text into searchable terms.

        - Removes punctuation
        - Lowercases
        - Removes stop words
        - Removes very short tokens
        """
        # Remove punctuation and special characters
        text = re.sub(r'[^\w\s\'-]', ' ', text)

        # Split on whitespace
        tokens = text.lower().split()

        # Filter tokens
        filtered = []
        for token in tokens:
            # Remove leading/trailing punctuation
            token = token.strip("'-")

            # Skip stop words and short tokens
            if token and len(token) > 2 and token not in self.STOP_WORDS:
                filtered.append(token)

        return filtered

    def get_document(self, doc_id: str) -> Optional[Dict]:
        """Get a document by ID"""
        return self.documents.get(doc_id)


class HybridSearcher:
    """
    Combine semantic search (embeddings) with keyword search (BM25).

    Configurable weighting allows tuning based on use case:
    - Higher semantic weight: Better for conceptual queries
    - Higher keyword weight: Better for specific term/name searches
    """

    def __init__(self,
                 vector_store,
                 embedder=None,
                 semantic_weight: float = 0.7,
                 keyword_weight: float = 0.3):
        """
        Args:
            vector_store: VectorStore instance for semantic search
            embedder: EmbeddingGenerator for query embeddings
            semantic_weight: Weight for semantic search scores (0-1)
            keyword_weight: Weight for keyword search scores (0-1)
        """
        self.vector_store = vector_store
        self.embedder = embedder
        self.semantic_weight = semantic_weight
        self.keyword_weight = keyword_weight
        self.bm25 = BM25()
        self._indexed = False

    def index_documents(self, documents: List[Dict]):
        """
        Index documents for keyword search.

        Call this after adding documents to vector store.

        Args:
            documents: List of dicts with 'id' and 'content'
        """
        self.bm25.index(documents)
        self._indexed = True
        logger.info(f"HybridSearcher: Indexed {len(documents)} documents for keyword search")

    def index_from_vector_store(self):
        """Index all documents currently in vector store"""
        # Get all documents from vector store
        documents = self.vector_store.get_all_documents()
        if documents:
            self.index_documents(documents)

    def search(self,
               query: str,
               query_embedding: List[float] = None,
               top_k: int = 10,
               semantic_only: bool = False,
               keyword_only: bool = False) -> List[Dict]:
        """
        Hybrid search combining semantic and keyword results.

        Args:
            query: Search query string
            query_embedding: Pre-computed query embedding (optional)
            top_k: Number of results to return
            semantic_only: Use only semantic search
            keyword_only: Use only keyword search

        Returns:
            List of result dicts with combined scores
        """
        results = {}

        # Semantic search
        if not keyword_only:
            # Get query embedding if not provided
            if query_embedding is None and self.embedder:
                query_embedding = self.embedder.embed_text(query)

            if query_embedding:
                semantic_results = self.vector_store.search(
                    query_embedding,
                    top_k=top_k * 2  # Get more for combining
                )

                for r in semantic_results:
                    doc_id = r['id']
                    results[doc_id] = {
                        **r,
                        'semantic_score': r.get('similarity', 0),
                        'keyword_score': 0,
                        'combined_score': 0
                    }

        # Keyword search
        if not semantic_only and self._indexed:
            keyword_results = self.bm25.search(query, top_k=top_k * 2)

            # Normalize keyword scores (0-1 range)
            max_keyword_score = keyword_results[0][1] if keyword_results else 1

            for doc_id, score in keyword_results:
                normalized_score = score / max_keyword_score if max_keyword_score > 0 else 0

                if doc_id in results:
                    results[doc_id]['keyword_score'] = normalized_score
                else:
                    # Fetch document details
                    doc = self.bm25.get_document(doc_id)
                    if doc:
                        results[doc_id] = {
                            'id': doc_id,
                            'content': doc.get('content', ''),
                            'metadata': doc.get('metadata', {}),
                            'semantic_score': 0,
                            'keyword_score': normalized_score,
                            'combined_score': 0
                        }

        # Calculate combined scores
        for doc_id, doc in results.items():
            doc['combined_score'] = (
                self.semantic_weight * doc.get('semantic_score', 0) +
                self.keyword_weight * doc.get('keyword_score', 0)
            )

        # Sort by combined score
        sorted_results = sorted(
            results.values(),
            key=lambda x: x['combined_score'],
            reverse=True
        )

        return sorted_results[:top_k]

    def search_with_filters(self,
                            query: str,
                            query_embedding: List[float] = None,
                            top_k: int = 10,
                            authors: List[str] = None,
                            topics: List[str] = None,
                            sources: List[str] = None,
                            min_date: str = None,
                            max_date: str = None) -> List[Dict]:
        """
        Search with metadata filters applied.

        Args:
            query: Search query
            query_embedding: Optional pre-computed embedding
            top_k: Results to return
            authors: Filter by author names
            topics: Filter by topics
            sources: Filter by source names
            min_date: Minimum date (YYYY-MM-DD or YYYY)
            max_date: Maximum date
        """
        # Get more results to filter
        results = self.search(query, query_embedding, top_k=top_k * 3)

        filtered = []
        for r in results:
            metadata = r.get('metadata', {})

            # Author filter
            if authors:
                doc_author = (metadata.get('author', '') or '').lower()
                if not any(a.lower() in doc_author for a in authors):
                    continue

            # Topic filter
            if topics:
                doc_topics = metadata.get('topics', [])
                if not any(t in doc_topics for t in topics):
                    continue

            # Source filter
            if sources:
                doc_source = (metadata.get('source', '') or '').lower()
                if not any(s.lower() in doc_source for s in sources):
                    continue

            # Date filter
            doc_date = metadata.get('date', '') or metadata.get('year', '')
            if doc_date:
                doc_date_str = str(doc_date)[:10]  # Take YYYY-MM-DD or YYYY
                if min_date and doc_date_str < min_date:
                    continue
                if max_date and doc_date_str > max_date:
                    continue

            filtered.append(r)

        return filtered[:top_k]

    def adjust_weights(self, semantic: float, keyword: float):
        """Adjust search weights dynamically"""
        total = semantic + keyword
        self.semantic_weight = semantic / total
        self.keyword_weight = keyword / total


# Convenience function for quick hybrid search setup
def create_hybrid_searcher(vector_store, embedder=None) -> HybridSearcher:
    """Create and initialize a HybridSearcher"""
    searcher = HybridSearcher(vector_store, embedder)

    # Try to index from vector store
    try:
        searcher.index_from_vector_store()
    except Exception as e:
        logger.warning(f"Could not auto-index: {e}")

    return searcher
