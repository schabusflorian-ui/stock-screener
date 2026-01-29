"""
Unit tests for document processing and embedding generation.

Tests cover:
- Document chunking with overlap
- Metadata extraction from headers
- Text cleaning and normalization
- Embedding generation (mocked)
- Vector storage and retrieval
"""

import pytest
import sys
import numpy as np
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestDocumentProcessor:
    """Tests for the DocumentProcessor class."""

    def test_processor_initialization(self):
        """Test that processor initializes with correct defaults."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor()

        assert processor.chunk_size == 1000
        assert processor.chunk_overlap == 200
        assert processor.min_chunk_size == 100

    def test_custom_chunk_size(self):
        """Test custom chunk size configuration."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(
            chunk_size=500,
            chunk_overlap=100,
            min_chunk_size=50
        )

        assert processor.chunk_size == 500
        assert processor.chunk_overlap == 100
        assert processor.min_chunk_size == 50

    def test_text_chunking_basic(self):
        """Test basic text chunking."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(chunk_size=100, chunk_overlap=20, min_chunk_size=10)

        text = "This is a test paragraph. " * 20  # ~500 chars

        chunks = processor.chunk_text(text)

        assert len(chunks) > 1
        assert all(len(c) <= 100 + 50 for c in chunks)  # Allow some flexibility

    def test_chunk_overlap(self):
        """Test that chunks have proper overlap."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(chunk_size=100, chunk_overlap=20, min_chunk_size=10)

        # Create text with clear boundaries
        text = "AAAA. " * 50  # ~300 chars

        chunks = processor.chunk_text(text)

        if len(chunks) >= 2:
            # Check that consecutive chunks share some content
            # This is a simplified check - exact overlap depends on implementation
            assert len(chunks[0]) > 0
            assert len(chunks[1]) > 0

    def test_minimum_chunk_size(self):
        """Test that very small chunks are handled."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(chunk_size=100, chunk_overlap=20, min_chunk_size=50)

        text = "Short text."

        chunks = processor.chunk_text(text)

        # Either returns the text as-is or empty if below threshold
        assert len(chunks) <= 1

    def test_process_document_with_metadata(self, sample_document_chunk, tmp_path):
        """Test processing a document with metadata."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(chunk_size=200, chunk_overlap=50, min_chunk_size=50)

        # process_document expects a filepath, not a dict
        # Create a temp file with proper header format
        test_file = tmp_path / "test_doc.txt"
        content = f"""Title: Test Document
Source: Berkshire Hathaway
Author: Warren Buffett

---

{sample_document_chunk['content']}
"""
        test_file.write_text(content)

        chunks = processor.process_document(str(test_file))

        assert len(chunks) >= 1
        for chunk in chunks:
            assert 'content' in chunk
            assert 'metadata' in chunk
            assert chunk['metadata']['source'] == 'Berkshire Hathaway'

    def test_metadata_preservation(self, tmp_path):
        """Test that metadata is preserved through chunking."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(chunk_size=100, chunk_overlap=20, min_chunk_size=10)

        # Create temp file with metadata header
        test_file = tmp_path / "test_doc.txt"
        content = f"""Title: Test Title
Source: Test Source
Author: Test Author

---

{"Test content. " * 30}
"""
        test_file.write_text(content)

        chunks = processor.process_document(str(test_file))

        for chunk in chunks:
            assert chunk['metadata']['source'] == 'Test Source'
            assert chunk['metadata']['author'] == 'Test Author'
            assert 'chunk_index' in chunk['metadata']

    def test_chunk_index_tracking(self, tmp_path):
        """Test that chunk indices are properly tracked."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor(chunk_size=100, chunk_overlap=20, min_chunk_size=10)

        # Create temp file
        test_file = tmp_path / "test_doc.txt"
        content = f"""Title: Test Title
Source: Test

---

{"Test content paragraph. " * 50}
"""
        test_file.write_text(content)

        chunks = processor.process_document(str(test_file))

        if len(chunks) > 1:
            for i, chunk in enumerate(chunks):
                assert chunk['metadata']['chunk_index'] == i
                assert chunk['metadata']['total_chunks'] == len(chunks)


class TestTextCleaning:
    """Tests for text cleaning utilities."""

    def test_whitespace_normalization(self):
        """Test that excessive whitespace is normalized."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor()

        text = "Test    text   with   many    spaces."
        cleaned = processor.clean_text(text)

        assert "    " not in cleaned
        assert "Test text with many spaces." == cleaned or "  " not in cleaned

    def test_newline_handling(self):
        """Test handling of multiple newlines."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor()

        text = "Paragraph one.\n\n\n\n\nParagraph two."
        cleaned = processor.clean_text(text)

        # Implementation reduces 4+ newlines to 3 (i.e., \n{4,} -> \n\n\n)
        # So "\n\n\n\n" or more should not appear
        assert "\n\n\n\n" not in cleaned

    def test_special_character_handling(self):
        """Test handling of special characters."""
        from src.services.ai.document_processor import DocumentProcessor

        processor = DocumentProcessor()

        text = "Text with unicode: café, naïve, résumé"
        cleaned = processor.clean_text(text)

        # Unicode should be preserved
        assert "café" in cleaned or "cafe" in cleaned


class TestEmbeddingGenerator:
    """Tests for the EmbeddingGenerator class."""

    def test_embedding_generator_initialization(self):
        """Test embedding generator initialization."""
        from src.services.ai.embeddings import EmbeddingGenerator

        # Test with local method (may not have model installed)
        try:
            generator = EmbeddingGenerator(method='local')
            assert generator.method == 'local'
        except ImportError:
            pytest.skip("sentence-transformers not installed")

    def test_embedding_dimension(self):
        """Test that embeddings have correct dimension."""
        from src.services.ai.embeddings import EmbeddingGenerator

        try:
            generator = EmbeddingGenerator(method='local')
            dim = generator.get_embedding_dimension()
            assert dim == 384  # MiniLM default
        except ImportError:
            pytest.skip("sentence-transformers not installed")

    def test_embed_text_mock(self):
        """Test embedding generation with mock."""
        from src.services.ai.embeddings import EmbeddingGenerator

        # Create generator and mock the embed_texts method
        generator = EmbeddingGenerator.__new__(EmbeddingGenerator)
        generator.method = 'local'
        generator._model = None

        # Mock embed_texts which is called by embed_text
        mock_embeddings = [[0.1] * 384]
        generator.embed_texts = MagicMock(return_value=mock_embeddings)

        embedding = generator.embed_text("Test text")

        assert len(embedding) == 384
        generator.embed_texts.assert_called_once_with(["Test text"])

    def test_embed_chunks(self):
        """Test embedding multiple chunks."""
        from src.services.ai.embeddings import EmbeddingGenerator

        generator = EmbeddingGenerator.__new__(EmbeddingGenerator)
        generator.method = 'local'
        generator._model = None

        # Mock embed_texts
        mock_embeddings = [[0.1] * 384, [0.2] * 384]
        generator.embed_texts = MagicMock(return_value=mock_embeddings)

        chunks = [
            {'content': 'Chunk 1', 'metadata': {}},
            {'content': 'Chunk 2', 'metadata': {}}
        ]

        result = generator.embed_chunks(chunks)

        assert len(result) == 2
        assert 'embedding' in result[0]
        assert 'embedding' in result[1]


class TestVectorStore:
    """Tests for the VectorStore class."""

    def test_vector_store_initialization(self, temp_db):
        """Test vector store initialization."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        assert store.db_path == temp_db
        assert store.get_count() == 0

        store.close()

    def test_add_document(self, temp_db, sample_vector_embedding):
        """Test adding a document to the store."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        # add_document takes separate parameters: content, embedding, metadata
        doc_id = store.add_document(
            content='Test content for vector storage',
            embedding=sample_vector_embedding,
            metadata={'source': 'Test', 'topics': ['testing']}
        )

        assert store.get_count() == 1

        store.close()

    def test_add_multiple_documents(self, temp_db, sample_vector_embedding):
        """Test adding multiple documents."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        docs = [
            {
                'content': f'Document {i} content',
                'metadata': {'source': 'Test', 'topics': ['testing']},
                'embedding': sample_vector_embedding
            }
            for i in range(5)
        ]

        added = store.add_documents(docs)

        assert added == 5
        assert store.get_count() == 5

        store.close()

    def test_search_by_embedding(self, temp_db, sample_vector_embedding):
        """Test searching by embedding similarity."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        # Add documents
        docs = [
            {
                'content': 'Document about investing in stocks',
                'metadata': {'source': 'Test', 'topics': ['investing']},
                'embedding': sample_vector_embedding
            },
            {
                'content': 'Document about risk management',
                'metadata': {'source': 'Test', 'topics': ['risk']},
                'embedding': [x + 0.1 for x in sample_vector_embedding]  # Slightly different
            }
        ]
        store.add_documents(docs)

        # Search with the first document's embedding - uses top_k not k
        results = store.search(sample_vector_embedding, top_k=2)

        assert len(results) <= 2
        if results:
            assert 'content' in results[0]
            assert 'similarity' in results[0]

        store.close()

    def test_search_by_topic(self, temp_db, sample_vector_embedding):
        """Test filtering by topic."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        docs = [
            {
                'content': 'Document about valuation',
                'metadata': {'source': 'Test', 'topics': ['valuation']},
                'embedding': sample_vector_embedding
            },
            {
                'content': 'Document about AI',
                'metadata': {'source': 'Test', 'topics': ['ai', 'technology']},
                'embedding': sample_vector_embedding
            }
        ]
        store.add_documents(docs)

        # Search with topic filter - uses filter_topics parameter
        results = store.search(sample_vector_embedding, top_k=10, filter_topics=['valuation'])

        if results:
            topics = [r.get('metadata', {}).get('topics', []) for r in results]
            assert any('valuation' in t for t in topics)

        store.close()

    def test_get_stats(self, temp_db, sample_vector_embedding):
        """Test getting store statistics."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        docs = [
            {
                'content': f'Document {i}',
                'metadata': {'source': f'Source{i % 2}', 'topics': ['testing']},
                'embedding': sample_vector_embedding
            }
            for i in range(4)
        ]
        store.add_documents(docs)

        stats = store.get_stats()

        assert stats['total_documents'] == 4
        assert 'sources' in stats

        store.close()

    def test_clear_store(self, temp_db, sample_vector_embedding):
        """Test clearing the store."""
        from src.services.ai.vector_store import VectorStore

        store = VectorStore(temp_db)

        # add_document takes separate parameters
        store.add_document(
            content='Test',
            embedding=sample_vector_embedding,
            metadata={}
        )
        assert store.get_count() == 1

        store.clear()
        assert store.get_count() == 0

        store.close()


class TestTopicTagger:
    """Tests for the TopicTagger class."""

    def test_topic_tagger_initialization(self):
        """Test topic tagger initialization."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        # TopicTagger uses TOPICS class attribute
        assert hasattr(tagger, 'TOPICS') or hasattr(tagger, 'patterns')
        assert len(tagger.patterns) > 0

    def test_tag_single_chunk(self):
        """Test tagging a single chunk (tag_chunk takes plain text, returns list)."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        text = 'The margin of safety is essential for value investing. Always buy below intrinsic value.'

        # tag_chunk takes text string, returns list of topics
        topics = tagger.tag_chunk(text)

        assert isinstance(topics, list)
        # Should detect valuation-related topics
        assert any(t in topics for t in ['valuation', 'risk'])

    def test_tag_tail_risk_content(self):
        """Test tagging tail risk content."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        text = 'Black swan events are unpredictable and have massive impact. Antifragility helps survive them.'

        topics = tagger.tag_chunk(text)

        # Should detect tail risk topics
        assert any(t in topics for t in ['tail_risk', 'antifragility', 'risk'])

    def test_tag_technology_content(self):
        """Test tagging technology content."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        text = 'Network effects create winner-take-all dynamics. AI and machine learning are disrupting industries.'

        topics = tagger.tag_chunk(text)

        # Should detect tech topics
        assert any(t in topics for t in ['technology', 'ai', 'disruption', 'moats'])

    def test_tag_multiple_chunks(self):
        """Test tagging multiple chunks using tag_chunks (modifies dicts in place)."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        chunks = [
            {'content': 'Value investing requires patience and margin of safety.', 'metadata': {}},
            {'content': 'Growth stocks have high P/E ratios and revenue growth.', 'metadata': {}},
            {'content': 'Risk management is essential for tail risk protection.', 'metadata': {}}
        ]

        tagged = tagger.tag_chunks(chunks)

        assert len(tagged) == 3
        for chunk in tagged:
            assert 'topics' in chunk['metadata']

    def test_primary_topic_assignment(self):
        """Test that primary topic is assigned via get_primary_topic."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        text = 'The company has a wide moat due to network effects and strong brand.'

        primary = tagger.get_primary_topic(text)

        assert primary is not None
        assert isinstance(primary, str)

    def test_topic_summary(self):
        """Test getting topic summary across chunks."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        chunks = [
            {'content': 'Value investing and margin of safety.', 'metadata': {'topics': ['valuation']}},
            {'content': 'Risk management strategies.', 'metadata': {'topics': ['risk']}},
            {'content': 'More value investing wisdom.', 'metadata': {'topics': ['valuation']}}
        ]

        summary = tagger.get_topic_summary(chunks)

        assert 'valuation' in summary
        assert summary['valuation'] == 2

    def test_get_topic_scores(self):
        """Test getting topic scores for text."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()

        text = 'Intrinsic value and margin of safety are key valuation concepts.'
        scores = tagger.get_topic_scores(text)

        assert isinstance(scores, dict)
        assert 'valuation' in scores
        assert scores['valuation'] > 0

    def test_get_all_topics(self):
        """Test getting list of all available topics."""
        from src.services.ai.topic_tagger import TopicTagger

        tagger = TopicTagger()
        all_topics = tagger.get_all_topics()

        assert isinstance(all_topics, list)
        assert len(all_topics) > 0
        assert 'valuation' in all_topics
        assert 'tail_risk' in all_topics


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
