# src/services/ai/knowledge/graph/graph_retriever.py

"""
Graph-enhanced retrieval.

Combines vector similarity search with knowledge graph traversal
for richer, more contextual results.
"""

import logging
from typing import List, Dict, Optional, Set

from .knowledge_graph import KnowledgeGraph
from .concept_extractor import ConceptExtractor

logger = logging.getLogger(__name__)


class GraphEnhancedRetriever:
    """
    Enhance retrieval using knowledge graph.

    Workflow:
    1. Extract concepts from query
    2. Expand concepts using graph relationships
    3. Find chunks linked to those concepts
    4. Combine with vector search results
    5. Re-rank based on concept coverage
    """

    def __init__(self,
                 knowledge_graph: KnowledgeGraph,
                 vector_store=None,
                 concept_extractor: ConceptExtractor = None):
        """
        Args:
            knowledge_graph: KnowledgeGraph instance
            vector_store: VectorStore for similarity search
            concept_extractor: ConceptExtractor for query analysis
        """
        self.graph = knowledge_graph
        self.vector_store = vector_store
        self.extractor = concept_extractor or ConceptExtractor()

    def retrieve(self,
                 query: str,
                 top_k: int = 5,
                 expand_depth: int = 1,
                 include_contradictions: bool = False) -> List[Dict]:
        """
        Graph-enhanced retrieval.

        Args:
            query: Search query
            top_k: Number of results
            expand_depth: How deep to expand concepts in graph
            include_contradictions: Include chunks about contradicting concepts

        Returns:
            List of enhanced results
        """
        # Step 1: Extract concepts from query
        query_concepts = self.extractor.extract_concepts(query)
        concept_ids = [c[0] for c in query_concepts]

        logger.debug(f"Query concepts: {concept_ids}")

        # Step 2: Expand concepts using graph
        expanded_concepts = set(concept_ids)

        for concept_id in concept_ids:
            related = self.graph.get_related_concepts(
                concept_id,
                max_depth=expand_depth
            )
            for r in related:
                expanded_concepts.add(r['id'])

        # Optionally add contradicting concepts
        if include_contradictions:
            for concept_id in concept_ids:
                contradictions = self.graph.find_contradictions(concept_id)
                for c in contradictions:
                    expanded_concepts.add(c['id'])

        logger.debug(f"Expanded to {len(expanded_concepts)} concepts")

        # Step 3: Get chunks linked to these concepts
        graph_chunk_ids = set(
            self.graph.get_chunks_for_concepts(list(expanded_concepts))
        )

        # Step 4: Vector search if available
        vector_results = []
        if self.vector_store:
            # Use embedder if available
            from ...embeddings import EmbeddingGenerator
            try:
                embedder = EmbeddingGenerator(method='local')
                query_embedding = embedder.embed_text(query)
                vector_results = self.vector_store.search(
                    query_embedding,
                    top_k=top_k * 2
                )
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")

        # Step 5: Combine and rank results
        combined_results = {}

        # Add vector search results
        for r in vector_results:
            chunk_id = str(r.get('id', ''))
            combined_results[chunk_id] = {
                **r,
                'vector_score': r.get('similarity', 0),
                'graph_score': 0,
                'concept_matches': []
            }

            # Check if this chunk is in graph results
            if chunk_id in graph_chunk_ids:
                combined_results[chunk_id]['graph_score'] = 0.5
                graph_chunk_ids.discard(chunk_id)

        # Add graph-only results (chunks not found in vector search)
        for chunk_id in graph_chunk_ids:
            if chunk_id not in combined_results:
                # Try to get chunk content
                chunk = self._get_chunk_content(chunk_id)
                if chunk:
                    combined_results[chunk_id] = {
                        **chunk,
                        'id': chunk_id,
                        'vector_score': 0,
                        'graph_score': 0.7,  # Higher graph score for graph-only
                        'concept_matches': []
                    }

        # Step 6: Compute concept coverage for each result
        for chunk_id, result in combined_results.items():
            content = result.get('content', '')
            chunk_concepts = self.extractor.extract_concepts(content)
            chunk_concept_ids = set(c[0] for c in chunk_concepts)

            # Find intersection with query concepts
            matches = chunk_concept_ids.intersection(expanded_concepts)
            result['concept_matches'] = list(matches)
            result['concept_coverage'] = len(matches) / len(expanded_concepts) if expanded_concepts else 0

            # Compute final score
            result['final_score'] = (
                result['vector_score'] * 0.5 +
                result['graph_score'] * 0.3 +
                result['concept_coverage'] * 0.2
            )

        # Sort by final score
        sorted_results = sorted(
            combined_results.values(),
            key=lambda x: x['final_score'],
            reverse=True
        )

        return sorted_results[:top_k]

    def _get_chunk_content(self, chunk_id: str) -> Optional[Dict]:
        """Get chunk content from vector store"""
        if not self.vector_store:
            return None

        try:
            return self.vector_store.get_document(int(chunk_id))
        except Exception:
            return None

    def find_related_wisdom(self,
                            concept: str,
                            top_k: int = 5) -> List[Dict]:
        """
        Find wisdom related to a specific concept.

        Useful for deep dives into a topic.
        """
        # Get related concepts from graph
        related = self.graph.get_related_concepts(concept, max_depth=2)
        all_concepts = [concept] + [r['id'] for r in related]

        # Get chunks for these concepts
        chunk_ids = self.graph.get_chunks_for_concepts(all_concepts)

        results = []
        for chunk_id in chunk_ids[:top_k * 2]:
            chunk = self._get_chunk_content(chunk_id)
            if chunk:
                # Add concept info
                chunk_concepts = self.extractor.extract_concepts(
                    chunk.get('content', '')
                )
                chunk['concepts'] = [c[0] for c in chunk_concepts]
                chunk['primary_concept'] = concept
                results.append(chunk)

        return results[:top_k]

    def find_author_insights(self,
                             author: str,
                             topic: str = None,
                             top_k: int = 5) -> List[Dict]:
        """
        Find insights from a specific author, optionally on a topic.
        """
        # Get author's concepts from graph
        author_concepts = self.graph.get_author_concepts(author)
        concept_ids = [c['id'] for c in author_concepts]

        if topic:
            # Filter to topic-related concepts
            topic_concepts = self.extractor.extract_concepts(topic)
            topic_ids = set(c[0] for c in topic_concepts)

            # Expand topic concepts
            expanded = set()
            for cid in topic_ids:
                expanded.add(cid)
                related = self.graph.get_related_concepts(cid, max_depth=1)
                for r in related:
                    expanded.add(r['id'])

            # Intersection of author concepts and topic concepts
            concept_ids = [c for c in concept_ids if c in expanded]

        if not concept_ids:
            concept_ids = [c['id'] for c in author_concepts[:5]]

        # Get chunks
        chunk_ids = self.graph.get_chunks_for_concepts(concept_ids)

        results = []
        for chunk_id in chunk_ids[:top_k * 2]:
            chunk = self._get_chunk_content(chunk_id)
            if chunk:
                # Filter to author's content
                metadata = chunk.get('metadata', {})
                if author.lower() in (metadata.get('author', '') or '').lower():
                    results.append(chunk)

        return results[:top_k]

    def find_connections_between_authors(self,
                                         author_a: str,
                                         author_b: str) -> Dict:
        """
        Find conceptual connections between two authors.

        Returns shared concepts and any contradictions.
        """
        concepts_a = self.graph.get_author_concepts(author_a)
        concepts_b = self.graph.get_author_concepts(author_b)

        ids_a = set(c['id'] for c in concepts_a)
        ids_b = set(c['id'] for c in concepts_b)

        # Direct overlap
        shared = ids_a.intersection(ids_b)

        # Find connected concepts
        connected = []
        for concept_a in ids_a:
            for concept_b in ids_b:
                if concept_a != concept_b:
                    paths = self.graph.find_connections(
                        concept_a, concept_b, max_depth=2
                    )
                    if paths:
                        connected.append({
                            'from': concept_a,
                            'to': concept_b,
                            'path': paths[0]
                        })

        # Find contradictions
        contradictions = []
        for concept in ids_a:
            contras = self.graph.find_contradictions(concept)
            for c in contras:
                if c['id'] in ids_b:
                    contradictions.append({
                        'concept_a': concept,
                        'concept_b': c['id'],
                        'context': c.get('context')
                    })

        return {
            'author_a': author_a,
            'author_b': author_b,
            'shared_concepts': list(shared),
            'connected_concepts': connected[:10],
            'potential_contradictions': contradictions
        }

    def explore_topic(self, topic: str, depth: int = 2) -> Dict:
        """
        Explore a topic deeply using the knowledge graph.

        Returns a structured view of the topic.
        """
        # Find matching concept
        concept = self.graph.get_concept(topic.lower().replace(' ', '_'))
        if not concept:
            # Try searching
            matches = self.graph.search_concepts(topic, limit=1)
            if matches:
                concept = matches[0]
            else:
                return {'error': f'Concept not found: {topic}'}

        # Get related concepts
        related = self.graph.get_related_concepts(concept.id, max_depth=depth)

        # Group by relation type
        by_relation = {}
        for r in related:
            rel_type = r['relation']
            if rel_type not in by_relation:
                by_relation[rel_type] = []
            by_relation[rel_type].append({
                'id': r['id'],
                'name': r['name'],
                'description': r.get('description', ''),
                'depth': r['depth']
            })

        # Get contradictions
        contradictions = self.graph.find_contradictions(concept.id)

        # Get sample chunks
        chunk_ids = self.graph.get_chunks_for_concepts([concept.id])
        sample_chunks = []
        for chunk_id in chunk_ids[:3]:
            chunk = self._get_chunk_content(chunk_id)
            if chunk:
                sample_chunks.append({
                    'preview': chunk.get('content', '')[:300] + '...',
                    'source': chunk.get('metadata', {}).get('source', 'Unknown')
                })

        return {
            'concept': {
                'id': concept.id,
                'name': concept.name,
                'type': concept.type,
                'description': concept.description
            },
            'related_by_type': by_relation,
            'contradictions': contradictions,
            'sample_content': sample_chunks,
            'total_chunks': len(chunk_ids)
        }
