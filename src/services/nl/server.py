#!/usr/bin/env python3
# src/services/nl/server.py
"""
Python server for Natural Language Query processing.
Communicates with Node.js via stdin/stdout JSON.

Connects to the LLM router for:
- Complex query classification (when patterns fail)
- Explanation and driver analysis generation
- Natural language response generation
"""

import sys
import json
import asyncio
import sqlite3
import logging
import os
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.nl.query_engine import QueryEngine
from services.nl.classifier import QueryClassifier

# Try to import LLM router
try:
    from services.ai.llm.router import ModelRouter
    LLM_AVAILABLE = True
except ImportError:
    LLM_AVAILABLE = False
    ModelRouter = None

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler('nl_server.log')]
)
logger = logging.getLogger(__name__)


class NLServer:
    """Server that processes NL queries from Node.js"""

    def __init__(self):
        self.db = self._connect_db()
        self.router = self._init_router()
        self.engine = QueryEngine(db=self.db, router=self.router)
        # Pass db to classifier for company name resolution
        self.classifier = QueryClassifier(router=self.router, db=self.db)

    def _init_router(self):
        """Initialize the LLM router if available"""
        if not LLM_AVAILABLE:
            logger.warning("LLM router not available - using rule-based only")
            return None

        # Check for API keys
        claude_key = os.environ.get('ANTHROPIC_API_KEY')
        ollama_url = os.environ.get('OLLAMA_URL', 'http://localhost:11434')

        if not claude_key and not ollama_url:
            logger.warning("No LLM configuration found (ANTHROPIC_API_KEY or OLLAMA_URL)")
            return None

        try:
            router = ModelRouter(
                claude_api_key=claude_key,
                ollama_url=ollama_url,
                prefer_local=True  # Use local models for cost savings
            )

            available = router.get_available_models()
            if available:
                logger.info(f"LLM router initialized with models: {available}")
                return router
            else:
                logger.warning("No LLM models available")
                return None

        except Exception as e:
            logger.error(f"Failed to initialize LLM router: {e}")
            return None

    def _connect_db(self):
        """Connect to the SQLite database"""
        db_path = Path(__file__).parent.parent.parent.parent / 'data' / 'stocks.db'
        if db_path.exists():
            conn = sqlite3.connect(str(db_path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            logger.info(f"Connected to database: {db_path}")
            return conn
        else:
            logger.warning(f"Database not found: {db_path}")
            return None

    async def handle_request(self, request: dict) -> dict:
        """Handle a single request"""
        request_id = request.get('request_id', 'unknown')
        action = request.get('action', '')

        try:
            if action == 'query':
                query = request.get('query', '')
                context = request.get('context')
                result = await self.engine.query(query, context)
                return {
                    'request_id': request_id,
                    'success': result.success,
                    'intent': result.intent,
                    'result': result.result,
                    'query_interpretation': result.query_interpretation,
                    'suggestions': result.suggestions
                }

            elif action == 'classify':
                query = request.get('query', '')
                # classifier.classify is synchronous
                classified = self.classifier.classify(query)
                return {
                    'request_id': request_id,
                    'success': True,
                    'intent': classified.intent.value,
                    'entities': classified.entities,
                    'parameters': classified.parameters,
                    'confidence': classified.confidence
                }

            else:
                return {
                    'request_id': request_id,
                    'success': False,
                    'error': f'Unknown action: {action}'
                }

        except Exception as e:
            logger.error(f"Request {request_id} failed: {e}")
            return {
                'request_id': request_id,
                'success': False,
                'error': str(e)
            }

    async def run(self):
        """Main server loop"""
        logger.info("NL Server starting...")
        print(json.dumps({'status': 'ready'}), flush=True)

        loop = asyncio.get_event_loop()

        while True:
            try:
                # Read line from stdin
                line = await loop.run_in_executor(None, sys.stdin.readline)

                if not line:
                    break

                line = line.strip()
                if not line:
                    continue

                # Parse request
                try:
                    request = json.loads(line)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {e}")
                    continue

                # Handle request
                response = await self.handle_request(request)

                # Send response
                print(json.dumps(response), flush=True)

            except Exception as e:
                logger.error(f"Server error: {e}")

        logger.info("NL Server shutting down...")


def main():
    server = NLServer()
    asyncio.run(server.run())


if __name__ == '__main__':
    main()
