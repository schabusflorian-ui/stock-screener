#!/usr/bin/env python3
"""
Verify the knowledge base quality with test queries.

This script tests the retrieval system to ensure:
- Embeddings are working correctly
- Search returns relevant results
- Topic filtering works
- Quality meets expectations

Usage:
    # Run all verification tests
    python scripts/verify_knowledge.py

    # Verbose output
    python scripts/verify_knowledge.py -v

    # Custom database path
    python scripts/verify_knowledge.py --db-path data/test_vectors.db
"""

import argparse
import logging
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.ai import KnowledgeRetriever, VectorStore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Test queries with expected topics/keywords in results
TEST_QUERIES = [
    {
        'query': 'What is margin of safety in investing?',
        'expected_topics': ['valuation', 'risk'],
        'expected_keywords': ['margin', 'safety', 'value', 'intrinsic']
    },
    {
        'query': 'How do you identify a company with a moat?',
        'expected_topics': ['moats', 'quality'],
        'expected_keywords': ['competitive', 'advantage', 'moat', 'durable']
    },
    {
        'query': 'How do market cycles work?',
        'expected_topics': ['cycles', 'psychology'],
        'expected_keywords': ['cycle', 'pendulum', 'sentiment', 'fear', 'greed']
    },
    {
        'query': 'What mental models are useful for investing?',
        'expected_topics': ['mental_models', 'psychology'],
        'expected_keywords': ['model', 'thinking', 'framework', 'bias']
    },
    {
        'query': 'How should management allocate capital?',
        'expected_topics': ['management'],
        'expected_keywords': ['capital', 'allocation', 'buyback', 'dividend', 'reinvest']
    },
    {
        'query': 'What is discounted cash flow valuation?',
        'expected_topics': ['valuation'],
        'expected_keywords': ['dcf', 'cash flow', 'discount', 'value']
    }
]


def check_health(retriever: KnowledgeRetriever) -> bool:
    """Check basic health of the retriever."""
    print("\n" + "="*60)
    print("HEALTH CHECK")
    print("="*60)

    health = retriever.health_check()
    print(f"Status: {health['status']}")
    print(f"Document count: {health.get('document_count', 'N/A')}")
    print(f"Embedding dimension: {health.get('embedding_dimension', 'N/A')}")
    print(f"Search working: {health.get('search_working', 'N/A')}")

    if health.get('error'):
        print(f"Error: {health['error']}")

    return health['status'] == 'healthy'


def check_stats(store: VectorStore) -> dict:
    """Check knowledge base statistics."""
    print("\n" + "="*60)
    print("DATABASE STATISTICS")
    print("="*60)

    stats = store.get_stats()

    print(f"\nTotal documents: {stats['total_documents']}")

    print("\nBy source:")
    for source, count in list(stats['sources'].items())[:10]:
        print(f"  {source}: {count}")

    print("\nBy author:")
    for author, count in list(stats['authors'].items())[:10]:
        print(f"  {author}: {count}")

    print("\nBy topic:")
    for topic, count in list(stats['topics'].items())[:15]:
        print(f"  {topic}: {count}")

    return stats


def run_query_tests(retriever: KnowledgeRetriever, verbose: bool = False) -> dict:
    """Run test queries and check results."""
    print("\n" + "="*60)
    print("QUERY TESTS")
    print("="*60)

    results = {
        'passed': 0,
        'failed': 0,
        'warnings': 0,
        'details': []
    }

    for test in TEST_QUERIES:
        query = test['query']
        expected_topics = test['expected_topics']
        expected_keywords = test['expected_keywords']

        print(f"\n--- Query: {query}")

        # Run query
        search_results = retriever.retrieve(query, top_k=5, min_similarity=0.2)

        if not search_results:
            print("  ❌ FAILED: No results returned")
            results['failed'] += 1
            results['details'].append({
                'query': query,
                'status': 'failed',
                'reason': 'no_results'
            })
            continue

        # Check results
        test_passed = True
        warnings = []

        # Check topic relevance
        found_topics = set()
        for r in search_results:
            topics = r.get('metadata', {}).get('topics', [])
            found_topics.update(topics)

        topic_match = any(t in found_topics for t in expected_topics)
        if not topic_match:
            warnings.append(f"Expected topics {expected_topics} not found in {found_topics}")

        # Check keyword relevance
        all_content = ' '.join(r['content'].lower() for r in search_results)
        keyword_matches = sum(1 for kw in expected_keywords if kw.lower() in all_content)
        keyword_ratio = keyword_matches / len(expected_keywords)

        if keyword_ratio < 0.25:
            test_passed = False
            warnings.append(f"Only {keyword_matches}/{len(expected_keywords)} expected keywords found")
        elif keyword_ratio < 0.5:
            warnings.append(f"Only {keyword_matches}/{len(expected_keywords)} expected keywords found")

        # Check similarity scores
        avg_similarity = sum(r['similarity'] for r in search_results) / len(search_results)
        top_similarity = search_results[0]['similarity']

        if top_similarity < 0.3:
            warnings.append(f"Low top similarity: {top_similarity:.3f}")

        # Report results
        if test_passed:
            if warnings:
                print(f"  ⚠️  PASSED with warnings")
                results['warnings'] += 1
            else:
                print(f"  ✅ PASSED")
            results['passed'] += 1
        else:
            print(f"  ❌ FAILED")
            results['failed'] += 1

        # Verbose output
        if verbose or warnings:
            print(f"     Results: {len(search_results)}")
            print(f"     Top similarity: {top_similarity:.3f}")
            print(f"     Avg similarity: {avg_similarity:.3f}")
            print(f"     Topics found: {list(found_topics)[:5]}")

            for w in warnings:
                print(f"     Warning: {w}")

            if verbose:
                print("     Top result preview:")
                preview = search_results[0]['content'][:200]
                print(f"       \"{preview}...\"")

        results['details'].append({
            'query': query,
            'status': 'passed' if test_passed else 'failed',
            'result_count': len(search_results),
            'top_similarity': top_similarity,
            'topics_found': list(found_topics),
            'warnings': warnings
        })

    return results


def run_company_analysis_test(retriever: KnowledgeRetriever, verbose: bool = False) -> bool:
    """Test company analysis retrieval."""
    print("\n" + "="*60)
    print("COMPANY ANALYSIS TEST")
    print("="*60)

    test_companies = [
        {
            'name': 'High-quality value stock',
            'data': {
                'pe_ratio': 18,
                'roe': 25,
                'debt_to_equity': 0.3,
                'profit_margin': 0.20,
                'sector': 'Consumer Staples'
            },
            'type': 'value'
        },
        {
            'name': 'High-growth tech stock',
            'data': {
                'pe_ratio': 45,
                'roe': 15,
                'revenue_growth': 0.35,
                'debt_to_equity': 0.1,
                'sector': 'Technology'
            },
            'type': 'growth'
        },
        {
            'name': 'Distressed situation',
            'data': {
                'pe_ratio': -5,
                'roe': -10,
                'debt_to_equity': 2.5,
                'revenue_growth': -0.15
            },
            'type': 'contrarian'
        }
    ]

    all_passed = True

    for company in test_companies:
        print(f"\n--- {company['name']}")

        context = retriever.retrieve_for_company_analysis(
            company_data=company['data'],
            analysis_type=company['type']
        )

        if context and len(context) > 100:
            print(f"  ✅ Retrieved {len(context)} chars of context")

            if verbose:
                print("  Context preview:")
                print(f"    {context[:300]}...")
        else:
            print(f"  ❌ Insufficient context: {len(context)} chars")
            all_passed = False

    return all_passed


def main():
    parser = argparse.ArgumentParser(description='Verify knowledge base quality')

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )
    parser.add_argument(
        '--db-path',
        default='data/knowledge_vectors.db',
        help='Vector database path'
    )

    args = parser.parse_args()

    print("="*60)
    print("KNOWLEDGE BASE VERIFICATION")
    print("="*60)

    try:
        # Initialize
        retriever = KnowledgeRetriever(db_path=args.db_path)
        store = retriever.store

        # Check health
        healthy = check_health(retriever)
        if not healthy:
            print("\n❌ Health check failed!")
            return 1

        # Check stats
        stats = check_stats(store)
        if stats['total_documents'] == 0:
            print("\n❌ No documents in database!")
            print("Run: python scripts/build_knowledge_base.py")
            return 1

        # Run query tests
        query_results = run_query_tests(retriever, verbose=args.verbose)

        # Run company analysis test
        analysis_passed = run_company_analysis_test(retriever, verbose=args.verbose)

        # Summary
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)

        print(f"\nQuery tests:")
        print(f"  Passed: {query_results['passed']}")
        print(f"  Failed: {query_results['failed']}")
        print(f"  Warnings: {query_results['warnings']}")

        print(f"\nCompany analysis: {'PASSED' if analysis_passed else 'FAILED'}")

        total_passed = query_results['passed']
        total_tests = query_results['passed'] + query_results['failed']
        pass_rate = total_passed / total_tests * 100 if total_tests > 0 else 0

        print(f"\nOverall pass rate: {pass_rate:.0f}%")

        if query_results['failed'] == 0 and analysis_passed:
            print("\n✅ All tests passed!")
            return 0
        else:
            print("\n⚠️  Some tests failed - review above for details")
            return 1

    except Exception as e:
        logger.exception(f"Verification failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
