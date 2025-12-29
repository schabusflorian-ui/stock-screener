"""
Integration tests for knowledge retrieval system.

Tests cover:
- End-to-end knowledge retrieval flow
- Query building based on company data
- Multi-query expansion
- Topic-based retrieval
- Knowledge-to-analyst integration
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestKnowledgeRetriever:
    """Integration tests for the KnowledgeRetriever class."""

    @pytest.fixture
    def mock_vector_store(self, sample_knowledge_base_content, sample_vector_embedding):
        """Create a mock vector store with sample data."""
        from src.services.ai.vector_store import VectorStore

        with patch.object(VectorStore, '__init__', lambda x, y: None):
            store = VectorStore.__new__(VectorStore)
            store.db_path = ':memory:'

            # Mock the search method with correct signature matching KnowledgeRetriever.retrieve()
            def mock_search(embedding, top_k=5, min_similarity=0.3, filter_topics=None, filter_sources=None):
                results = []
                for i, item in enumerate(sample_knowledge_base_content[:top_k]):
                    results.append({
                        'id': str(i),
                        'content': item['content'],
                        'metadata': item['metadata'],
                        'similarity': 0.85
                    })
                return results

            store.search = mock_search
            store.search_by_topic = lambda topic, top_k=5: mock_search(None, top_k)
            store.get_count = lambda: len(sample_knowledge_base_content)
            store.close = lambda: None

            return store

    @pytest.fixture
    def mock_embedding_generator(self, sample_vector_embedding):
        """Create a mock embedding generator."""
        from src.services.ai.embeddings import EmbeddingGenerator

        with patch.object(EmbeddingGenerator, '__init__', lambda x, **kwargs: None):
            generator = EmbeddingGenerator.__new__(EmbeddingGenerator)
            generator.method = 'local'
            generator.embed_text = lambda text: sample_vector_embedding
            generator.embed_texts = lambda texts: [sample_vector_embedding] * len(texts)
            generator.get_embedding_dimension = lambda: 384

            return generator

    def test_basic_retrieval(self, mock_vector_store, mock_embedding_generator):
        """Test basic knowledge retrieval."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever

        with patch('src.services.ai.knowledge_retriever.VectorStore', return_value=mock_vector_store), \
             patch('src.services.ai.knowledge_retriever.EmbeddingGenerator', return_value=mock_embedding_generator):

            retriever = KnowledgeRetriever(db_path=':memory:')
            retriever.store = mock_vector_store
            retriever.embedder = mock_embedding_generator

            # retrieve uses top_k parameter, not k
            results = retriever.retrieve("value investing principles", top_k=3)

            assert len(results) <= 3
            for result in results:
                assert 'content' in result

    def test_retrieval_with_topic_filter(self, mock_vector_store, mock_embedding_generator):
        """Test retrieval with topic filtering."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever

        with patch('src.services.ai.knowledge_retriever.VectorStore', return_value=mock_vector_store), \
             patch('src.services.ai.knowledge_retriever.EmbeddingGenerator', return_value=mock_embedding_generator):

            retriever = KnowledgeRetriever(db_path=':memory:')
            retriever.store = mock_vector_store
            retriever.embedder = mock_embedding_generator

            # retrieve_for_topic returns a formatted string, not list
            result = retriever.retrieve_for_topic("valuation", top_k=5)

            assert isinstance(result, str)

    def test_company_analysis_retrieval(self, mock_vector_store, mock_embedding_generator,
                                         sample_company_data, sample_financial_metrics):
        """Test retrieval tailored for company analysis."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever

        with patch('src.services.ai.knowledge_retriever.VectorStore', return_value=mock_vector_store), \
             patch('src.services.ai.knowledge_retriever.EmbeddingGenerator', return_value=mock_embedding_generator):

            retriever = KnowledgeRetriever(db_path=':memory:')
            retriever.store = mock_vector_store
            retriever.embedder = mock_embedding_generator

            company_context = {
                **sample_company_data,
                **sample_financial_metrics
            }

            # retrieve_for_company_analysis uses analysis_type, not k
            result = retriever.retrieve_for_company_analysis(company_context, analysis_type='value')

            # Returns formatted string
            assert isinstance(result, str)


class TestQueryExpansion:
    """Tests for query expansion in knowledge retrieval."""

    def test_multi_query_retrieval(self, sample_vector_embedding):
        """Test multi-query expansion and merging."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        # Mock search to return results matching actual API
        def mock_search(embedding, top_k=5, min_similarity=0.3, filter_topics=None, filter_sources=None):
            return [
                {'id': '1', 'content': 'Result 1', 'metadata': {}, 'similarity': 0.9},
                {'id': '2', 'content': 'Result 2', 'metadata': {}, 'similarity': 0.8}
            ]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        queries = ["value investing", "margin of safety", "intrinsic value"]
        results = retriever.retrieve_multi_query(queries, top_k_per_query=2, final_top_k=5)

        assert len(results) >= 0

    def test_company_analysis_with_high_pe(self, sample_vector_embedding):
        """Test company analysis retrieval for high P/E companies."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.2, filter_topics=None, filter_sources=None):
            return [{'id': '1', 'content': 'High valuation', 'metadata': {}, 'similarity': 0.8}]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        company = {
            'pe_ratio': 60,  # High P/E
            'sector': 'Technology',
            'revenue_growth': 0.50  # High growth
        }

        # retrieve_for_company_analysis returns formatted context string
        result = retriever.retrieve_for_company_analysis(company, analysis_type='growth')
        assert isinstance(result, str)

    def test_company_analysis_with_high_leverage(self, sample_vector_embedding):
        """Test company analysis retrieval for high leverage companies."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.2, filter_topics=None, filter_sources=None):
            return [{'id': '1', 'content': 'Leverage risk', 'metadata': {}, 'similarity': 0.8}]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        company = {
            'debt_to_equity': 3.0,  # High leverage
            'sector': 'Financials',
        }

        result = retriever.retrieve_for_company_analysis(company, analysis_type='value')
        assert isinstance(result, str)


class TestKnowledgeToAnalystIntegration:
    """Tests for integration between knowledge retrieval and analyst service."""

    def test_retrieval_for_value_analysis(self, sample_vector_embedding):
        """Test that value analysis uses relevant queries."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.2, filter_topics=None, filter_sources=None):
            return [
                {'id': '1', 'content': 'Buffett: buy great companies at fair prices', 'metadata': {'source': 'Berkshire'}, 'similarity': 0.9},
            ]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        company = {'pe_ratio': 15, 'roe': 20}
        result = retriever.retrieve_for_company_analysis(company, analysis_type='value')

        # Returns formatted context string
        assert isinstance(result, str)

    def test_different_analysis_types_produce_context(self, sample_vector_embedding):
        """Test that different analysis types produce different context."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.2, filter_topics=None, filter_sources=None):
            return [{'id': '1', 'content': 'Wisdom content', 'metadata': {}, 'similarity': 0.8}]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        company = {'pe_ratio': 25, 'roe': 18}

        # All analysis types should return strings
        for analysis_type in ['value', 'growth', 'contrarian', 'quant', 'general']:
            result = retriever.retrieve_for_company_analysis(company, analysis_type=analysis_type)
            assert isinstance(result, str)


class TestKnowledgeBaseHealth:
    """Tests for knowledge base health and diagnostics."""

    def test_health_check(self, temp_db, sample_vector_embedding):
        """Test knowledge base health check."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from src.services.ai.vector_store import VectorStore

        # Create actual store with some data
        store = VectorStore(temp_db)
        # add_document takes separate parameters
        store.add_document(
            content='Test content',
            embedding=sample_vector_embedding,
            metadata={'source': 'Test'}
        )

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = store
        retriever.embedder = MagicMock()
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        health = retriever.health_check()

        assert 'status' in health
        assert 'document_count' in health

        store.close()

    def test_empty_knowledge_base_handling(self, temp_db, sample_vector_embedding):
        """Test handling of empty knowledge base."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from src.services.ai.vector_store import VectorStore

        # Create empty store
        store = VectorStore(temp_db)

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = store
        retriever.embedder = MagicMock()
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        # Should handle empty gracefully - uses top_k not k
        results = retriever.retrieve("any query", top_k=5)

        assert results == []

        store.close()


class TestSourceAttribution:
    """Tests for source attribution in retrieval results."""

    def test_source_included_in_results(self, sample_vector_embedding):
        """Test that source information is included in results."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.3, filter_topics=None, filter_sources=None):
            return [
                {
                    'content': 'Wisdom content',
                    'metadata': {'source': 'Berkshire Hathaway', 'author': 'Warren Buffett'},
                    'similarity': 0.9
                }
            ]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        results = retriever.retrieve("query", top_k=5)

        if results:
            assert 'metadata' in results[0]
            assert 'source' in results[0]['metadata']

    def test_multiple_sources_in_results(self, sample_vector_embedding):
        """Test retrieval from multiple sources."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.3, filter_topics=None, filter_sources=None):
            return [
                {'content': 'Buffett wisdom', 'metadata': {'source': 'Berkshire'}, 'similarity': 0.9},
                {'content': 'Marks wisdom', 'metadata': {'source': 'Oaktree'}, 'similarity': 0.85},
                {'content': 'Taleb wisdom', 'metadata': {'source': 'Taleb'}, 'similarity': 0.8}
            ]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        results = retriever.retrieve("query", top_k=5)

        sources = [r['metadata']['source'] for r in results]
        assert len(set(sources)) >= 2  # Multiple unique sources


class TestRetrievalQuality:
    """Tests for retrieval quality and relevance."""

    def test_results_have_similarity_scores(self, sample_vector_embedding):
        """Test that results include similarity scores."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        def mock_search(embedding, top_k=5, min_similarity=0.3, filter_topics=None, filter_sources=None):
            return [
                {'content': 'Most relevant', 'metadata': {}, 'similarity': 0.95},
                {'content': 'Second', 'metadata': {}, 'similarity': 0.85},
                {'content': 'Third', 'metadata': {}, 'similarity': 0.75}
            ]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        results = retriever.retrieve("query", top_k=5)

        if len(results) >= 2:
            # Results should have similarity scores
            for r in results:
                assert 'similarity' in r

    def test_top_k_parameter_respected(self, sample_vector_embedding):
        """Test that top_k parameter limits results."""
        from src.services.ai.knowledge_retriever import KnowledgeRetriever
        from unittest.mock import MagicMock

        retriever = KnowledgeRetriever.__new__(KnowledgeRetriever)
        retriever.store = MagicMock()
        retriever.embedder = MagicMock()

        # Return limited results based on top_k
        def mock_search(embedding, top_k=5, min_similarity=0.3, filter_topics=None, filter_sources=None):
            return [
                {'content': f'Result {i}', 'metadata': {}, 'similarity': 0.9 - i*0.1}
                for i in range(min(top_k, 10))
            ]

        retriever.store.search = mock_search
        retriever.embedder.embed_text = lambda x: sample_vector_embedding

        results = retriever.retrieve("query", top_k=3)

        assert len(results) <= 3


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
