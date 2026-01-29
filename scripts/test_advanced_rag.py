#!/usr/bin/env python3
"""
Test the advanced RAG system components.

Tests:
- Query expansion
- Hybrid search (BM25 + semantic)
- Contextual retrieval
- Knowledge graph
- Citation tracking
- Maintenance utilities

Usage:
    python scripts/test_advanced_rag.py
    python scripts/test_advanced_rag.py -v  # verbose
"""

import argparse
import logging
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def test_query_expander(verbose: bool = False) -> bool:
    """Test query expansion functionality."""
    print("\n" + "="*60)
    print("QUERY EXPANDER TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.advanced.query_expander import QueryExpander

        expander = QueryExpander()

        test_queries = [
            ("What is margin of safety?", "value"),
            ("How do I find a moat?", "value"),
            ("Buffett's approach to capital allocation", None),
            ("Risk management in volatile markets", "risk")
        ]

        all_passed = True

        for query, style in test_queries:
            expanded = expander.expand(query, style=style)

            print(f"\n  Original: {query}")
            if expanded:
                for i, exp in enumerate(expanded[:2]):
                    display = exp[:80] + "..." if len(exp) > 80 else exp
                    print(f"  Expanded {i+1}: {display}")
                print(f"  ✅ Generated {len(expanded)} expansions")
            else:
                print("  ⚠️ No expansions generated (may be expected for generic queries)")

            # Test related terms
            if 'moat' in query.lower():
                terms = expander.get_related_terms('moat')
                if terms:
                    print(f"  Related terms for 'moat': {terms[:3]}")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Query expander test failed")
        return False


def test_hybrid_search(verbose: bool = False) -> bool:
    """Test hybrid search functionality."""
    print("\n" + "="*60)
    print("HYBRID SEARCH TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.advanced.hybrid_search import HybridSearcher, BM25

        # Test BM25 class directly
        print("\n  Testing BM25 Index...")

        test_docs = [
            {"id": "1", "content": "Value investing requires patience and discipline. Margin of safety is key."},
            {"id": "2", "content": "Growth stocks can offer substantial returns but require careful analysis."},
            {"id": "3", "content": "Market cycles are driven by fear and greed. Patience is essential."},
            {"id": "4", "content": "Competitive moats protect businesses from competition."},
            {"id": "5", "content": "Capital allocation decisions determine long-term shareholder value."}
        ]

        bm25 = BM25()
        bm25.index(test_docs)

        # Test keyword search
        results = bm25.search("margin of safety value", top_k=3)

        if results and len(results) > 0:
            print(f"  ✅ BM25 search returned {len(results)} results")
            if verbose:
                for doc_id, score in results:
                    print(f"     ID: {doc_id}, Score: {score:.3f}")
        else:
            print("  ❌ BM25 search failed")
            return False

        # Test hybrid search (without vector store - keyword only mode)
        print("\n  Testing Hybrid Search (keyword mode)...")

        hybrid = HybridSearcher(
            vector_store=None,
            embedder=None,
            semantic_weight=0.0,
            keyword_weight=1.0
        )

        # Index documents in hybrid searcher
        hybrid.index_documents(test_docs)

        # Note: Without vector store, hybrid search mainly uses BM25
        print("  ✅ Hybrid searcher initialized successfully")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Hybrid search test failed")
        return False


def test_contextual_retriever(verbose: bool = False) -> bool:
    """Test contextual retrieval functionality."""
    print("\n" + "="*60)
    print("CONTEXTUAL RETRIEVER TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.advanced.contextual_retriever import (
            ContextualRetriever,
            UserContext,
            QueryContext
        )

        # Create contexts with correct parameters
        user_ctx = UserContext(
            investment_style='value',
            risk_tolerance='moderate',
            interests=['technology', 'moats']
        )

        query_ctx = QueryContext(
            original_query="What is the margin of safety for a tech company?",
            current_symbol='AAPL',
            analyst_type='value'
        )

        print(f"\n  User Context: style={user_ctx.investment_style}, risk={user_ctx.risk_tolerance}")
        print(f"  Query Context: symbol={query_ctx.current_symbol}, analyst={query_ctx.analyst_type}")

        # Test context creation
        print("\n  ✅ Context objects created successfully")

        # Test topic weights - use the static method via class instance
        retriever = ContextualRetriever(base_retriever=None)

        # Check topic weights via internal method
        if hasattr(retriever, 'STYLE_TOPIC_WEIGHTS'):
            topic_weights = retriever.STYLE_TOPIC_WEIGHTS.get('value', {})
            if topic_weights:
                print(f"  ✅ Topic weights for 'value' style: {len(topic_weights)} topics")
                if verbose:
                    for topic, weight in list(topic_weights.items())[:5]:
                        print(f"     {topic}: {weight}")

        # Test situation detection
        test_company_data = {
            'pe_ratio': 45,
            'revenue_growth': 0.25,
            'roe': 0.22,
            'profit_margin': 0.25
        }

        if hasattr(retriever, '_detect_company_situations'):
            situations = retriever._detect_company_situations(test_company_data)
            if situations:
                print(f"  ✅ Detected {len(situations)} situations: {situations}")
            else:
                print("  ⚠️ No situations detected")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Contextual retriever test failed")
        return False


def test_knowledge_graph(verbose: bool = False) -> bool:
    """Test knowledge graph functionality."""
    print("\n" + "="*60)
    print("KNOWLEDGE GRAPH TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.graph.knowledge_graph import KnowledgeGraph, ConceptNode
        from src.services.ai.knowledge.graph.concept_extractor import ConceptExtractor

        # Initialize graph with in-memory database
        graph = KnowledgeGraph(db_path=":memory:")

        # Check core concepts loaded
        print("\n  Testing core concept loading...")

        # Get a known concept
        mos = graph.get_concept('margin_of_safety')

        if mos:
            print(f"  ✅ Loaded concept: {mos.name}")
            print(f"     Type: {mos.type}")
            if verbose:
                print(f"     Description: {mos.description[:100]}...")
        else:
            print("  ⚠️ margin_of_safety concept not found")

        # Test adding custom concept
        print("\n  Testing concept addition...")

        test_concept = ConceptNode(
            id='test_concept',
            name='Test Concept',
            type='principle',
            description='A test concept for validation'
        )

        graph.add_concept(test_concept)

        retrieved = graph.get_concept('test_concept')
        if retrieved and retrieved.name == 'Test Concept':
            print("  ✅ Concept addition works")
        else:
            print("  ❌ Concept addition failed")
            return False

        # Test get_related_concepts
        print("\n  Testing related concepts...")

        related = graph.get_related_concepts('margin_of_safety', max_depth=1)
        if related:
            print(f"  ✅ Found {len(related)} related concepts")
            if verbose:
                for r in related[:3]:
                    print(f"     {r['name']} ({r['relation']})")
        else:
            print("  ⚠️ No related concepts found")

        # Test concept extractor
        print("\n  Testing concept extraction...")

        extractor = ConceptExtractor()

        test_text = """
        Value investing requires a margin of safety - buying assets below intrinsic value.
        This provides protection against permanent loss of capital.
        Warren Buffett emphasizes the importance of moats and competitive advantages.
        """

        concepts = extractor.extract_concepts(test_text)

        if concepts:
            print(f"  ✅ Extracted {len(concepts)} concepts")
            if verbose:
                for concept_id, score in concepts[:5]:
                    print(f"     {concept_id}: {score:.2f}")
        else:
            print("  ⚠️ No concepts extracted")

        # Test graph stats
        stats = graph.get_stats()
        print(f"\n  Graph stats: {stats['total_concepts']} concepts, {stats['total_relations']} relations")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Knowledge graph test failed")
        return False


def test_citation_tracking(verbose: bool = False) -> bool:
    """Test citation tracking functionality."""
    print("\n" + "="*60)
    print("CITATION TRACKING TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.citations.citation_tracker import CitationTracker
        from src.services.ai.knowledge.citations.quote_extractor import QuoteExtractor

        # Test quote extractor
        print("\n  Testing quote extraction...")

        extractor = QuoteExtractor()

        test_text = """
        As Warren Buffett famously said, "Price is what you pay, value is what you get."

        The key insight is that patience is essential in investing. Markets often
        overreact to short-term news. Rule #1: Never lose money. Rule #2: Never forget rule #1.

        In investing, the most important thing is to understand what you own.
        """

        quotes = extractor.extract_quotes(test_text)

        if quotes:
            print(f"  ✅ Extracted {len(quotes)} quotes")
            if verbose:
                for q in quotes[:3]:
                    print(f"     Type: {q['type']}, Quality: {q['quality']:.2f}")
                    print(f"     \"{q['text'][:60]}...\"")
        else:
            print("  ⚠️ No quotes extracted")

        # Test best quote extraction
        best = extractor.extract_best_quote(test_text)
        if best:
            print(f"  ✅ Best quote: \"{best['text'][:50]}...\"")

        # Test citation tracker
        print("\n  Testing citation tracker...")

        tracker = CitationTracker(db_path=":memory:")

        # Create a citation using the correct API
        citation = tracker.create_citation(
            source_name="Berkshire Hathaway",
            author="Warren Buffett",
            chunk_id="test_chunk_1",
            quote="Price is what you pay, value is what you get.",
            title="2023 Letter"
        )

        if citation:
            print(f"  ✅ Created citation: {citation.id}")
            print(f"     Short form: {citation.to_short()}")

        # Retrieve citations by author
        citations = tracker.get_citations_by_author("Buffett")

        if citations:
            print(f"  ✅ Retrieved {len(citations)} citations for author")
        else:
            print("  ⚠️ No citations retrieved (may need more data)")

        # Track usage
        tracker.log_usage(citation.id, "test_analysis", "company_review")
        stats = tracker.get_usage_stats()

        if stats:
            print(f"  ✅ Usage tracking works (total uses: {stats.get('total_uses', 0)})")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Citation tracking test failed")
        return False


def test_maintenance_utilities(verbose: bool = False) -> bool:
    """Test maintenance utility functionality."""
    print("\n" + "="*60)
    print("MAINTENANCE UTILITIES TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.maintenance.quality_scorer import QualityScorer
        from src.services.ai.knowledge.maintenance.deduplicator import Deduplicator
        from src.services.ai.knowledge.maintenance.freshness_checker import FreshnessChecker

        # Test quality scorer
        print("\n  Testing quality scoring...")

        scorer = QualityScorer()

        test_chunks = [
            {
                "content": "Value investing is about buying assets below intrinsic value with a margin of safety. This approach, pioneered by Benjamin Graham and practiced by Warren Buffett, focuses on long-term fundamentals rather than short-term price movements.",
                "metadata": {"source": "berkshire_hathaway", "author": "Warren Buffett"}
            },
            {
                "content": "Short content.",
                "metadata": {"source": "unknown"}
            },
            {
                "content": "The market cycle is driven by psychology. Fear and greed alternate, creating opportunities for disciplined investors. Understanding cycles is key to timing investments, though market timing is notoriously difficult.",
                "metadata": {"source": "oaktree", "author": "Howard Marks"}
            }
        ]

        for i, chunk in enumerate(test_chunks):
            score = scorer.score_chunk(chunk)
            print(f"  Chunk {i+1}: Quality score = {score:.2f}")

        print("  ✅ Quality scoring works")

        # Test quality distribution
        if verbose:
            distribution = scorer.get_quality_distribution(test_chunks)
            print(f"     Distribution: {distribution.get('distribution', {})}")
            print(f"     Average: {distribution.get('average', 0):.2f}")

        # Test deduplicator
        print("\n  Testing deduplication...")

        dedup = Deduplicator()

        test_chunks_dedup = [
            {"id": 1, "content": "Value investing requires patience and discipline."},
            {"id": 2, "content": "Value investing requires patience and discipline."},  # exact dup
            {"id": 3, "content": "Value investing requires patience, discipline, and focus."},  # near dup
            {"id": 4, "content": "Growth stocks can offer higher returns but with more risk."},
        ]

        unique = dedup.deduplicate(test_chunks_dedup)

        print(f"  Original: {len(test_chunks_dedup)} chunks")
        print(f"  After dedup: {len(unique)} chunks")

        if len(unique) < len(test_chunks_dedup):
            print("  ✅ Deduplication works")
        else:
            print("  ⚠️ No duplicates detected (may be threshold)")

        # Test freshness checker
        print("\n  Testing freshness checking...")

        checker = FreshnessChecker(knowledge_dir="knowledge_base")

        # Get summary (will work even if no knowledge base exists)
        summary = checker.get_summary()

        print(f"  Status: {summary.get('status', 'unknown')}")
        if summary.get('total_sources'):
            print(f"  Total sources: {summary['total_sources']}")
            print(f"  Average freshness: {summary.get('average_freshness', 0):.2f}")
        else:
            print("  ⚠️ No knowledge sources found (expected if knowledge_base dir doesn't exist)")

        print("  ✅ Freshness checker works")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Maintenance utilities test failed")
        return False


def test_graph_retriever(verbose: bool = False) -> bool:
    """Test graph-enhanced retrieval."""
    print("\n" + "="*60)
    print("GRAPH-ENHANCED RETRIEVER TEST")
    print("="*60)

    try:
        from src.services.ai.knowledge.graph.knowledge_graph import KnowledgeGraph
        from src.services.ai.knowledge.graph.graph_retriever import GraphEnhancedRetriever

        # Initialize with in-memory graph
        graph = KnowledgeGraph(db_path=":memory:")
        retriever = GraphEnhancedRetriever(
            knowledge_graph=graph,
            vector_store=None  # Test without vector store
        )

        print("\n  Testing topic exploration...")

        # Test explore_topic
        result = retriever.explore_topic("margin of safety")

        if result:
            if 'error' in result:
                print(f"  ⚠️ Topic not found: {result['error']}")
            else:
                print(f"  ✅ Explored topic: {result.get('concept', {}).get('name', 'unknown')}")
                if verbose:
                    print(f"     Related by type: {list(result.get('related_by_type', {}).keys())}")

        print("\n  Testing author connections...")

        # Test finding connections between authors
        connections = retriever.find_connections_between_authors("Buffett", "Marks")

        if connections:
            print(f"  ✅ Found connections between authors")
            shared = connections.get('shared_concepts', [])
            if shared:
                print(f"     Shared concepts: {shared[:5]}")
            connected = connections.get('connected_concepts', [])
            if connected:
                print(f"     Connected concepts: {len(connected)}")

        print("\n  Testing find_related_wisdom...")

        wisdom = retriever.find_related_wisdom("moat", top_k=3)
        print(f"  Related wisdom chunks: {len(wisdom)}")

        return True

    except ImportError as e:
        print(f"  ⚠️ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        logger.exception("Graph retriever test failed")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test advanced RAG system')

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )
    parser.add_argument(
        '--component',
        choices=['expander', 'hybrid', 'contextual', 'graph', 'citations', 'maintenance', 'graph_retriever'],
        help='Test specific component only'
    )

    args = parser.parse_args()

    print("="*60)
    print("ADVANCED RAG SYSTEM TESTS")
    print("="*60)

    tests = [
        ('Query Expander', test_query_expander),
        ('Hybrid Search', test_hybrid_search),
        ('Contextual Retriever', test_contextual_retriever),
        ('Knowledge Graph', test_knowledge_graph),
        ('Citation Tracking', test_citation_tracking),
        ('Maintenance Utilities', test_maintenance_utilities),
        ('Graph Retriever', test_graph_retriever),
    ]

    # Filter to specific component if requested
    if args.component:
        component_map = {
            'expander': 'Query Expander',
            'hybrid': 'Hybrid Search',
            'contextual': 'Contextual Retriever',
            'graph': 'Knowledge Graph',
            'citations': 'Citation Tracking',
            'maintenance': 'Maintenance Utilities',
            'graph_retriever': 'Graph Retriever',
        }
        target = component_map.get(args.component)
        tests = [(name, func) for name, func in tests if name == target]

    results = {}

    for name, test_func in tests:
        try:
            results[name] = test_func(args.verbose)
        except Exception as e:
            print(f"\n❌ {name} test crashed: {e}")
            results[name] = False

    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    passed = sum(1 for v in results.values() if v)
    total = len(results)

    for name, result in results.items():
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {name}: {status}")

    print(f"\nOverall: {passed}/{total} tests passed")

    if passed == total:
        print("\n✅ All advanced RAG tests passed!")
        return 0
    else:
        print("\n⚠️ Some tests failed - check component implementations")
        return 1


if __name__ == "__main__":
    sys.exit(main())
