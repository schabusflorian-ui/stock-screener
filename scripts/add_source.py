#!/usr/bin/env python3
"""
Add a new source to the knowledge base incrementally.

This script adds content from a new scraper without rebuilding
the entire knowledge base. Useful for:
- Adding new sources after initial build
- Updating a single source with new content
- Testing new scrapers

Usage:
    # Add a specific source
    python scripts/add_source.py buffett

    # Add with limit for testing
    python scripts/add_source.py marks --limit 5

    # Force re-scrape (don't skip existing)
    python scripts/add_source.py damodaran --no-resume

    # Replace existing content from this source
    python scripts/add_source.py housel --replace
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
    CollaborativeFundScraper
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
    'buffett': BerkshireLettersScraper,
    'marks': OaktreeMemosScraper,
    'farnam': FarnamStreetScraper,
    'damodaran': DamodaranScraper,
    'housel': CollaborativeFundScraper,
}


def main():
    parser = argparse.ArgumentParser(
        description='Add a source to the knowledge base'
    )

    parser.add_argument(
        'source',
        choices=list(SCRAPERS.keys()),
        help='Source to add'
    )
    parser.add_argument(
        '--limit',
        type=int,
        help='Limit number of items to scrape'
    )
    parser.add_argument(
        '--no-resume',
        action='store_true',
        help='Re-scrape even if files exist'
    )
    parser.add_argument(
        '--replace',
        action='store_true',
        help='Remove existing docs from this source before adding'
    )
    parser.add_argument(
        '--embedding-method',
        choices=['local', 'huggingface', 'ollama'],
        default='local',
        help='Embedding method'
    )
    parser.add_argument(
        '--db-path',
        default='data/knowledge_vectors.db',
        help='Vector database path'
    )

    args = parser.parse_args()

    start_time = datetime.now()
    source_key = args.source

    logger.info(f"Adding source: {source_key}")

    try:
        # Step 1: Scrape
        logger.info(f"\n{'='*50}")
        logger.info("Scraping...")
        logger.info(f"{'='*50}")

        scraper = SCRAPERS[source_key]()
        scrape_result = scraper.scrape_all(
            resume=not args.no_resume,
            limit=args.limit
        )
        logger.info(f"Scrape result: {scrape_result}")

        source_name = scraper.get_source_name()
        output_dir = scraper.output_dir

        # Step 2: Process documents from this source only
        logger.info(f"\n{'='*50}")
        logger.info("Processing documents...")
        logger.info(f"{'='*50}")

        processor = DocumentProcessor()
        chunks = processor.process_directory_to_list(output_dir)
        logger.info(f"Created {len(chunks)} chunks")

        if not chunks:
            logger.warning("No chunks created! Check scraper output.")
            return 1

        # Step 3: Tag chunks
        logger.info(f"\n{'='*50}")
        logger.info("Tagging by topic...")
        logger.info(f"{'='*50}")

        tagger = TopicTagger()
        chunks = tagger.tag_chunks(chunks)

        # Step 4: Generate embeddings
        logger.info(f"\n{'='*50}")
        logger.info("Generating embeddings...")
        logger.info(f"{'='*50}")

        embedder = EmbeddingGenerator(method=args.embedding_method)
        chunks = embedder.embed_chunks(chunks, show_progress=True)

        # Step 5: Store
        logger.info(f"\n{'='*50}")
        logger.info("Storing in database...")
        logger.info(f"{'='*50}")

        store = VectorStore(args.db_path)

        # Optionally remove existing docs from this source
        if args.replace:
            deleted = store.clear_source(source_name)
            logger.info(f"Removed {deleted} existing docs from {source_name}")

        # Add new chunks
        added = store.add_documents(chunks)
        store.update_source(source_name, added)

        logger.info(f"Added {added} documents from {source_name}")

        # Summary
        elapsed = datetime.now() - start_time
        stats = store.get_stats()

        logger.info(f"\n{'='*50}")
        logger.info("COMPLETE")
        logger.info(f"{'='*50}")
        logger.info(f"  Time: {elapsed}")
        logger.info(f"  Source: {source_name}")
        logger.info(f"  Documents added: {added}")
        logger.info(f"  Total in database: {stats['total_documents']}")

        store.close()
        return 0

    except KeyboardInterrupt:
        logger.info("\nInterrupted by user")
        return 1

    except Exception as e:
        logger.exception(f"Failed: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
