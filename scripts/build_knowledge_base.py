#!/usr/bin/env python3
"""
Master script to build the complete knowledge base.

This script:
1. Scrapes all configured sources (or uses existing scraped content)
2. Processes documents into chunks
3. Tags chunks by topic
4. Generates embeddings
5. Stores in vector database

Usage:
    # Full build (scrape + process + embed)
    python scripts/build_knowledge_base.py

    # Skip scraping, just reprocess existing documents
    python scripts/build_knowledge_base.py --skip-scrape

    # Only scrape specific sources
    python scripts/build_knowledge_base.py --sources buffett marks

    # Limit scraping for testing
    python scripts/build_knowledge_base.py --limit 5

    # Use Hugging Face API for embeddings
    python scripts/build_knowledge_base.py --embedding-method huggingface
"""

import argparse
import logging
import sys
import os
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.scrapers import (
    BerkshireLettersScraper,
    OaktreeMemosScraper,
    FarnamStreetScraper,
    DamodaranScraper,
    CollaborativeFundScraper,
    # Tail Risk & Anti-Fragility
    TalebScraper,
    UniversaSpitznagelScraper,
    # Technology & Disruption
    A16ZScraper,
    BenedictEvansScraper,
    ARKInvestScraper,
    AIInsightsScraper,
)
from src.services.ai import (
    DocumentProcessor,
    TopicTagger,
    EmbeddingGenerator,
    VectorStore
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Available scrapers
SCRAPERS = {
    # Value/Traditional Investing
    'buffett': BerkshireLettersScraper,
    'marks': OaktreeMemosScraper,
    'farnam': FarnamStreetScraper,
    'damodaran': DamodaranScraper,
    'housel': CollaborativeFundScraper,
    # Tail Risk & Anti-Fragility
    'taleb': TalebScraper,
    'spitznagel': UniversaSpitznagelScraper,
    # Technology & Disruption
    'a16z': A16ZScraper,
    'evans': BenedictEvansScraper,
    'ark': ARKInvestScraper,
    'ai': AIInsightsScraper,
}


def scrape_sources(sources: list = None, limit: int = None, resume: bool = True) -> dict:
    """
    Scrape knowledge from configured sources.

    Args:
        sources: List of source keys to scrape (None = all)
        limit: Max items per source (for testing)
        resume: Skip already scraped items

    Returns:
        Dict of scrape statistics per source
    """
    if sources is None:
        sources = list(SCRAPERS.keys())

    stats = {}

    for source_key in sources:
        if source_key not in SCRAPERS:
            logger.warning(f"Unknown source: {source_key}")
            continue

        logger.info(f"\n{'='*50}")
        logger.info(f"Scraping: {source_key}")
        logger.info(f"{'='*50}")

        try:
            scraper = SCRAPERS[source_key]()
            result = scraper.scrape_all(resume=resume, limit=limit)
            stats[source_key] = result
            logger.info(f"Completed {source_key}: {result}")

        except Exception as e:
            logger.error(f"Error scraping {source_key}: {e}")
            stats[source_key] = {'error': str(e)}

    return stats


def process_documents(knowledge_dir: str = "knowledge_base") -> list:
    """
    Process all scraped documents into chunks.

    Args:
        knowledge_dir: Root directory of scraped content

    Returns:
        List of processed chunks
    """
    logger.info(f"\n{'='*50}")
    logger.info("Processing documents")
    logger.info(f"{'='*50}")

    processor = DocumentProcessor(
        chunk_size=1000,
        chunk_overlap=200,
        min_chunk_size=100
    )

    # Get stats first
    stats = processor.get_stats(knowledge_dir)
    logger.info(f"Found {stats['total_files']} files to process")

    # Process all documents
    chunks = processor.process_directory_to_list(knowledge_dir)
    logger.info(f"Created {len(chunks)} chunks (avg size: {stats['avg_chunk_size']:.0f} chars)")

    return chunks


def tag_chunks(chunks: list) -> list:
    """Add topic tags to all chunks."""
    logger.info(f"\n{'='*50}")
    logger.info("Tagging chunks by topic")
    logger.info(f"{'='*50}")

    tagger = TopicTagger()
    chunks = tagger.tag_chunks(chunks)

    # Log topic distribution
    summary = tagger.get_topic_summary(chunks)
    logger.info("Topic distribution:")
    for topic, count in list(summary.items())[:10]:
        logger.info(f"  {topic}: {count}")

    return chunks


def generate_embeddings(chunks: list, method: str = 'local') -> list:
    """Generate embeddings for all chunks."""
    logger.info(f"\n{'='*50}")
    logger.info(f"Generating embeddings (method: {method})")
    logger.info(f"{'='*50}")

    embedder = EmbeddingGenerator(method=method)
    chunks = embedder.embed_chunks(chunks, show_progress=True)

    # Verify
    sample = chunks[0] if chunks else None
    if sample and 'embedding' in sample:
        logger.info(f"Embedding dimension: {len(sample['embedding'])}")

    return chunks


def store_chunks(chunks: list, db_path: str = "data/knowledge_vectors.db") -> int:
    """Store chunks in vector database."""
    logger.info(f"\n{'='*50}")
    logger.info(f"Storing in vector database: {db_path}")
    logger.info(f"{'='*50}")

    store = VectorStore(db_path)

    # Clear existing (for full rebuild)
    existing = store.get_count()
    if existing > 0:
        logger.info(f"Clearing {existing} existing documents")
        store.clear()

    # Add new chunks
    added = store.add_documents(chunks)
    logger.info(f"Added {added} documents")

    # Update source tracking
    sources = {}
    for chunk in chunks:
        source = chunk.get('metadata', {}).get('source', 'Unknown')
        sources[source] = sources.get(source, 0) + 1

    for source, count in sources.items():
        store.update_source(source, count)

    # Final stats
    stats = store.get_stats()
    logger.info(f"\nFinal stats:")
    logger.info(f"  Total documents: {stats['total_documents']}")
    logger.info(f"  Sources: {len(stats['sources'])}")
    logger.info(f"  Topics: {len(stats['topics'])}")

    store.close()

    return added


def main():
    parser = argparse.ArgumentParser(description='Build the knowledge base')

    parser.add_argument(
        '--skip-scrape',
        action='store_true',
        help='Skip scraping, use existing files'
    )
    parser.add_argument(
        '--sources',
        nargs='+',
        choices=list(SCRAPERS.keys()),
        help='Only scrape specific sources'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Limit items per source (for testing)'
    )
    parser.add_argument(
        '--embedding-method',
        choices=['local', 'huggingface', 'ollama'],
        default='local',
        help='Method for generating embeddings'
    )
    parser.add_argument(
        '--db-path',
        default='data/knowledge_vectors.db',
        help='Path to vector database'
    )
    parser.add_argument(
        '--knowledge-dir',
        default='knowledge_base',
        help='Directory with scraped content'
    )

    args = parser.parse_args()

    start_time = datetime.now()
    logger.info(f"Starting knowledge base build at {start_time}")

    try:
        # Step 1: Scrape
        if not args.skip_scrape:
            scrape_stats = scrape_sources(
                sources=args.sources,
                limit=args.limit,
                resume=True
            )
            logger.info(f"\nScrape complete: {scrape_stats}")
        else:
            logger.info("Skipping scrape (--skip-scrape)")

        # Step 2: Process documents
        chunks = process_documents(args.knowledge_dir)

        if not chunks:
            logger.error("No chunks created! Check knowledge_base directory.")
            return 1

        # Step 3: Tag by topic
        chunks = tag_chunks(chunks)

        # Step 4: Generate embeddings
        chunks = generate_embeddings(chunks, method=args.embedding_method)

        # Step 5: Store in vector DB
        stored = store_chunks(chunks, db_path=args.db_path)

        # Summary
        elapsed = datetime.now() - start_time
        logger.info(f"\n{'='*50}")
        logger.info("BUILD COMPLETE")
        logger.info(f"{'='*50}")
        logger.info(f"  Time: {elapsed}")
        logger.info(f"  Chunks processed: {len(chunks)}")
        logger.info(f"  Documents stored: {stored}")
        logger.info(f"  Database: {args.db_path}")

        return 0

    except KeyboardInterrupt:
        logger.info("\nBuild interrupted by user")
        return 1

    except Exception as e:
        logger.exception(f"Build failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
