# src/services/ai/embeddings.py

from typing import List, Dict, Optional
import os
import logging
import time

logger = logging.getLogger(__name__)


class EmbeddingGenerator:
    """
    Generate embeddings for text using multiple backends:
    - Hugging Face Inference API (free tier, rate limited)
    - Local sentence-transformers model (no rate limit, requires install)
    - Ollama (if running locally with nomic-embed-text)

    Embeddings are used to find semantically similar chunks during retrieval.

    Usage:
        embedder = EmbeddingGenerator(method='local')
        embedding = embedder.embed_text("What is intrinsic value?")
        # Returns: [0.123, -0.456, ...]  # 384-dimensional vector

    Recommended models:
    - all-MiniLM-L6-v2: Fast, good quality, 384 dimensions
    - all-mpnet-base-v2: Better quality, 768 dimensions, slower
    """

    # Default model for sentence-transformers
    DEFAULT_MODEL = 'sentence-transformers/all-MiniLM-L6-v2'

    def __init__(self,
                 method: str = 'local',  # 'huggingface', 'local', 'ollama'
                 model: str = None):
        """
        Args:
            method: Backend to use for embeddings
            model: Model name (defaults to all-MiniLM-L6-v2)
        """
        self.method = method
        self.model_name = model or self.DEFAULT_MODEL
        self._model = None

        # For Hugging Face API
        if method == 'huggingface':
            self.api_key = os.getenv('HF_API_KEY') or os.getenv('HUGGINGFACE_API_KEY')
            if not self.api_key:
                logger.warning("HF_API_KEY not set, falling back to local model")
                self.method = 'local'

        logger.info(f"EmbeddingGenerator initialized: method={self.method}, model={self.model_name}")

    def _init_local_model(self):
        """Lazily initialize local sentence-transformers model"""
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self.model_name)
                logger.info(f"Loaded local model: {self.model_name}")
            except ImportError:
                raise ImportError(
                    "sentence-transformers not installed. "
                    "Run: pip install sentence-transformers"
                )
        return self._model

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats
        """
        embeddings = self.embed_texts([text])
        return embeddings[0]

    def embed_texts(self, texts: List[str], show_progress: bool = False) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed
            show_progress: Show progress bar (for local method)

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        if self.method == 'huggingface':
            return self._embed_huggingface(texts)
        elif self.method == 'local':
            return self._embed_local(texts, show_progress)
        elif self.method == 'ollama':
            return self._embed_ollama(texts)
        else:
            raise ValueError(f"Unknown embedding method: {self.method}")

    def _embed_huggingface(self, texts: List[str]) -> List[List[float]]:
        """Use Hugging Face Inference API"""
        import requests

        api_url = f"https://api-inference.huggingface.co/models/{self.model_name}"
        headers = {"Authorization": f"Bearer {self.api_key}"}

        # HF API has rate limits, batch appropriately
        batch_size = 32
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            # Truncate long texts (HF API has limits)
            batch = [t[:4000] for t in batch]

            try:
                response = requests.post(
                    api_url,
                    headers=headers,
                    json={"inputs": batch, "options": {"wait_for_model": True}},
                    timeout=60
                )

                if response.status_code == 503:
                    # Model loading, wait and retry
                    logger.info("Model loading, waiting...")
                    time.sleep(20)
                    response = requests.post(
                        api_url,
                        headers=headers,
                        json={"inputs": batch, "options": {"wait_for_model": True}},
                        timeout=60
                    )

                if response.status_code != 200:
                    logger.error(f"HF API error: {response.status_code} - {response.text}")
                    raise Exception(f"HF API error: {response.status_code}")

                embeddings = response.json()
                all_embeddings.extend(embeddings)

                # Rate limiting
                if i + batch_size < len(texts):
                    time.sleep(0.5)

            except requests.exceptions.Timeout:
                logger.error("HF API timeout")
                raise

        return all_embeddings

    def _embed_local(self, texts: List[str], show_progress: bool = False) -> List[List[float]]:
        """Use local sentence-transformers model"""
        model = self._init_local_model()

        # Truncate texts if too long
        max_length = 512  # tokens, roughly
        texts = [t[:2000] for t in texts]  # approximate

        embeddings = model.encode(
            texts,
            show_progress_bar=show_progress,
            convert_to_numpy=True
        )

        return embeddings.tolist()

    def _embed_ollama(self, texts: List[str]) -> List[List[float]]:
        """Use Ollama for embeddings (requires running Ollama with nomic-embed-text)"""
        import requests

        ollama_url = os.getenv('OLLAMA_URL', 'http://localhost:11434')
        embeddings = []

        for text in texts:
            try:
                response = requests.post(
                    f"{ollama_url}/api/embeddings",
                    json={
                        "model": "nomic-embed-text",
                        "prompt": text[:2000]  # Truncate
                    },
                    timeout=30
                )

                if response.status_code == 200:
                    embeddings.append(response.json()['embedding'])
                else:
                    logger.error(f"Ollama error: {response.status_code} - {response.text}")
                    raise Exception(f"Ollama error: {response.status_code}")

            except requests.exceptions.ConnectionError:
                raise Exception(
                    "Could not connect to Ollama. "
                    "Make sure Ollama is running: ollama serve"
                )

        return embeddings

    def embed_chunks(self, chunks: List[Dict], show_progress: bool = True) -> List[Dict]:
        """
        Add embeddings to chunks in place.

        Args:
            chunks: List of chunk dicts with 'content' key
            show_progress: Show progress (for local method)

        Returns:
            Same chunks with 'embedding' key added
        """
        if not chunks:
            return chunks

        # Extract texts
        texts = [c['content'] for c in chunks]

        # Generate embeddings
        logger.info(f"Generating embeddings for {len(texts)} chunks...")
        embeddings = self.embed_texts(texts, show_progress=show_progress)

        # Add to chunks
        for chunk, embedding in zip(chunks, embeddings):
            chunk['embedding'] = embedding

        logger.info(f"Generated {len(embeddings)} embeddings")
        return chunks

    def get_embedding_dimension(self) -> int:
        """Get the dimension of embeddings from this model"""
        # Common model dimensions
        dimensions = {
            'sentence-transformers/all-MiniLM-L6-v2': 384,
            'sentence-transformers/all-mpnet-base-v2': 768,
            'nomic-embed-text': 768,
        }

        if self.model_name in dimensions:
            return dimensions[self.model_name]

        # Get actual dimension by embedding a test text
        test_embedding = self.embed_text("test")
        return len(test_embedding)


# Test
if __name__ == "__main__":
    # Test with local embeddings
    print("Testing EmbeddingGenerator...")

    try:
        embedder = EmbeddingGenerator(method='local')

        test_texts = [
            "Warren Buffett looks for companies with durable competitive advantages.",
            "Margin of safety is the difference between price and intrinsic value.",
            "Market cycles swing between fear and greed."
        ]

        embeddings = embedder.embed_texts(test_texts)

        print(f"Generated {len(embeddings)} embeddings")
        print(f"Embedding dimension: {len(embeddings[0])}")
        print(f"First embedding sample: {embeddings[0][:5]}...")

    except ImportError as e:
        print(f"Could not run local test: {e}")
        print("To test, install: pip install sentence-transformers")
