# src/services/ai/knowledge_retriever.py

from typing import List, Dict, Optional
from .vector_store import VectorStore
from .embeddings import EmbeddingGenerator
import logging

logger = logging.getLogger(__name__)


class KnowledgeRetriever:
    """
    High-level interface for retrieving relevant investment wisdom.

    Used by the analyst service (Agent 6/7) to get context for analysis.
    Combines vector similarity search with topic filtering to find
    the most relevant knowledge for any query.

    Usage:
        retriever = KnowledgeRetriever()

        # Simple query
        results = retriever.retrieve("What is margin of safety?")

        # Filtered by topic
        results = retriever.retrieve(
            "valuation methods",
            topics=['valuation', 'quality']
        )

        # For company analysis
        context = retriever.retrieve_for_company_analysis(
            company_data={'pe_ratio': 15, 'roe': 25},
            analysis_type='value'
        )
    """

    def __init__(self,
                 vector_store: VectorStore = None,
                 embedder: EmbeddingGenerator = None,
                 db_path: str = "data/knowledge_vectors.db"):
        """
        Args:
            vector_store: VectorStore instance (created if not provided)
            embedder: EmbeddingGenerator instance (created if not provided)
            db_path: Path to vector database (if creating new store)
        """
        self.store = vector_store or VectorStore(db_path)
        self.embedder = embedder or EmbeddingGenerator(method='local')

        logger.info("KnowledgeRetriever initialized")

    def retrieve(self,
                 query: str,
                 top_k: int = 5,
                 topics: List[str] = None,
                 sources: List[str] = None,
                 min_similarity: float = 0.3) -> List[Dict]:
        """
        Retrieve relevant knowledge for a query.

        Args:
            query: Natural language query
            top_k: Number of results to return
            topics: Filter by topics (optional)
            sources: Filter by sources (optional)
            min_similarity: Minimum similarity threshold (0-1)

        Returns:
            List of relevant chunks with metadata and similarity scores
        """
        if not query.strip():
            return []

        # Generate query embedding
        try:
            query_embedding = self.embedder.embed_text(query)
        except Exception as e:
            logger.error(f"Error generating query embedding: {e}")
            return []

        # Search vector store
        results = self.store.search(
            query_embedding,
            top_k=top_k,
            min_similarity=min_similarity,
            filter_topics=topics,
            filter_sources=sources
        )

        logger.debug(f"Retrieved {len(results)} results for query: {query[:50]}...")

        return results

    def retrieve_multi_query(self,
                              queries: List[str],
                              top_k_per_query: int = 3,
                              final_top_k: int = 10,
                              min_similarity: float = 0.25) -> List[Dict]:
        """
        Retrieve using multiple queries and merge results.

        Useful for complex topics that can be expressed multiple ways.

        Args:
            queries: List of query strings
            top_k_per_query: Results per individual query
            final_top_k: Total results to return after merging
            min_similarity: Minimum similarity threshold

        Returns:
            Merged and deduplicated results
        """
        all_results = []
        seen_ids = set()

        for query in queries:
            results = self.retrieve(
                query,
                top_k=top_k_per_query,
                min_similarity=min_similarity
            )

            for r in results:
                if r['id'] not in seen_ids:
                    seen_ids.add(r['id'])
                    all_results.append(r)

        # Sort by similarity and take top results
        all_results.sort(key=lambda x: x['similarity'], reverse=True)

        return all_results[:final_top_k]

    def retrieve_for_company_analysis(self,
                                       company_data: Dict,
                                       analysis_type: str = 'general') -> str:
        """
        Retrieve wisdom relevant to analyzing a specific company.

        Builds queries based on company characteristics and analysis type.

        Args:
            company_data: Dict with company metrics like:
                - pe_ratio, pb_ratio, ev_ebitda
                - roe, roic, profit_margin
                - debt_to_equity, current_ratio
                - revenue_growth, earnings_growth
                - sector, industry
            analysis_type: 'value', 'growth', 'contrarian', 'quant', 'general'

        Returns:
            Formatted context string for analyst prompt
        """
        queries = []

        # Base queries for analysis type
        type_queries = {
            'value': [
                "margin of safety intrinsic value valuation",
                "competitive advantage moat durable business",
                "management capital allocation shareholder returns"
            ],
            'growth': [
                "growth investing sustainable competitive advantage",
                "total addressable market TAM expansion runway",
                "paying up for quality growth reinvestment"
            ],
            'contrarian': [
                "contrarian investing sentiment extreme",
                "buying fear selling greed panic",
                "value trap vs opportunity turnaround"
            ],
            'quant': [
                "factor investing value momentum quality",
                "quantitative screening metrics ratios",
                "risk adjusted returns sharpe ratio"
            ],
            'general': [
                "investment analysis framework checklist",
                "competitive advantage sustainable moat",
                "risk assessment downside protection"
            ]
        }

        queries.extend(type_queries.get(analysis_type, type_queries['general']))

        # Add queries based on company characteristics
        pe = company_data.get('pe_ratio')
        if pe:
            if pe > 30:
                queries.append("high valuation expensive stocks when justified premium")
            elif pe < 12:
                queries.append("low P/E value investing avoid value traps")
            elif pe < 0:
                queries.append("negative earnings unprofitable turnaround")

        roe = company_data.get('roe')
        if roe:
            if roe > 20:
                queries.append("high return on equity quality business compounding")
            elif roe < 8:
                queries.append("low profitability capital intensive turnaround")

        debt_to_equity = company_data.get('debt_to_equity')
        if debt_to_equity:
            if debt_to_equity > 1.5:
                queries.append("high leverage debt risk financial distress")
            elif debt_to_equity < 0.2:
                queries.append("low debt conservative balance sheet")

        revenue_growth = company_data.get('revenue_growth')
        if revenue_growth:
            if revenue_growth > 0.2:
                queries.append("high growth sustainability competitive moat")
            elif revenue_growth < 0:
                queries.append("declining revenue secular decline turnaround")

        margin = company_data.get('profit_margin') or company_data.get('operating_margin')
        if margin:
            if margin > 0.2:
                queries.append("high margin pricing power competitive advantage")
            elif margin < 0.05:
                queries.append("low margin commodity business cost leadership")

        # Sector-specific queries
        sector = company_data.get('sector', '').lower()
        if 'tech' in sector or 'software' in sector:
            queries.append("technology software recurring revenue network effects")
        elif 'financ' in sector or 'bank' in sector:
            queries.append("financial services banking credit risk capital ratios")
        elif 'consumer' in sector:
            queries.append("consumer brand loyalty pricing power moat")
        elif 'health' in sector:
            queries.append("healthcare pharmaceutical regulatory moat patents")

        # Retrieve for each query
        all_results = self.retrieve_multi_query(
            queries,
            top_k_per_query=2,
            final_top_k=8,
            min_similarity=0.2
        )

        # Format as context string
        return self._format_context(all_results)

    def retrieve_for_topic(self, topic: str, top_k: int = 5) -> str:
        """
        Retrieve wisdom about a specific investment topic.

        Args:
            topic: Topic name (e.g., 'valuation', 'moats', 'psychology')
            top_k: Number of results

        Returns:
            Formatted context string
        """
        # Direct topic query
        query = f"{topic} investing principles framework"
        results = self.retrieve(query, top_k=top_k, topics=[topic])

        return self._format_context(results)

    def _format_context(self, results: List[Dict]) -> str:
        """
        Format retrieved results as a context string for LLM prompts.

        Format:
        ---
        [Source: X | Author: Y | Topic: Z]
        Content here...
        ---
        """
        if not results:
            return "No relevant knowledge found."

        context_parts = []

        for r in results:
            meta = r.get('metadata', {})

            # Build header
            header_parts = []
            if meta.get('source'):
                header_parts.append(f"Source: {meta['source']}")
            if meta.get('author'):
                header_parts.append(f"Author: {meta['author']}")
            if meta.get('primary_topic'):
                header_parts.append(f"Topic: {meta['primary_topic']}")

            header = " | ".join(header_parts) if header_parts else "Knowledge Base"

            # Build context block
            block = f"---\n[{header}]\n{r['content']}\n---"
            context_parts.append(block)

        return "\n\n".join(context_parts)

    def get_stats(self) -> Dict:
        """Get statistics about the knowledge base"""
        return self.store.get_stats()

    def health_check(self) -> Dict:
        """Check if the retriever is working properly"""
        try:
            count = self.store.get_count()

            # Test embedding generation
            test_embedding = self.embedder.embed_text("test query")
            embedding_ok = len(test_embedding) > 0

            # Test search (if we have documents)
            search_ok = True
            if count > 0:
                results = self.store.search(test_embedding, top_k=1)
                search_ok = len(results) >= 0  # Even 0 results is OK

            return {
                'status': 'healthy' if embedding_ok and search_ok else 'degraded',
                'document_count': count,
                'embedding_dimension': len(test_embedding),
                'search_working': search_ok
            }
        except Exception as e:
            return {
                'status': 'error',
                'error': str(e)
            }


# Test
if __name__ == "__main__":
    print("Testing KnowledgeRetriever...")

    # This will fail if no embeddings model installed, that's OK
    try:
        retriever = KnowledgeRetriever(db_path="data/test_vectors.db")

        # Health check
        health = retriever.health_check()
        print(f"Health: {health}")

        # Test query (will return empty if no docs)
        results = retriever.retrieve("margin of safety value investing")
        print(f"Retrieved {len(results)} results")

        # Test company analysis context
        context = retriever.retrieve_for_company_analysis(
            company_data={
                'pe_ratio': 25,
                'roe': 18,
                'debt_to_equity': 0.5,
                'sector': 'Technology'
            },
            analysis_type='value'
        )
        print(f"Context length: {len(context)} chars")

    except Exception as e:
        print(f"Test error (expected if no model): {e}")
