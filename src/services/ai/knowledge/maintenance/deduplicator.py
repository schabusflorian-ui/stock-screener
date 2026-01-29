# src/services/ai/knowledge/maintenance/deduplicator.py

"""
Deduplicate knowledge chunks.

Removes exact duplicates and near-duplicates to keep the
knowledge base clean and efficient.
"""

import hashlib
import logging
from typing import List, Dict, Set, Tuple
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


class Deduplicator:
    """
    Remove duplicate and near-duplicate chunks.

    Uses multiple strategies:
    - Exact hash matching (fast, catches identical content)
    - MinHash similarity (approximate, catches near-duplicates)
    - Content prefix matching (catches chunks from same document)
    """

    def __init__(self,
                 similarity_threshold: float = 0.85,
                 prefix_length: int = 100):
        """
        Args:
            similarity_threshold: Threshold for near-duplicate detection (0-1)
            prefix_length: Characters to use for prefix matching
        """
        self.similarity_threshold = similarity_threshold
        self.prefix_length = prefix_length

    def deduplicate(self,
                    chunks: List[Dict],
                    method: str = 'combined') -> List[Dict]:
        """
        Remove duplicates from chunks.

        Args:
            chunks: List of chunk dicts
            method: 'hash', 'similarity', or 'combined'

        Returns:
            Deduplicated list
        """
        if not chunks:
            return []

        original_count = len(chunks)

        if method == 'hash':
            result = self._dedupe_by_hash(chunks)
        elif method == 'similarity':
            result = self._dedupe_by_similarity(chunks)
        else:  # combined
            # First pass: exact hash
            result = self._dedupe_by_hash(chunks)
            # Second pass: similarity (more expensive)
            result = self._dedupe_by_similarity(result)

        removed = original_count - len(result)
        if removed > 0:
            logger.info(f"Deduplication: Removed {removed} duplicates ({original_count} → {len(result)})")

        return result

    def _dedupe_by_hash(self, chunks: List[Dict]) -> List[Dict]:
        """Remove exact duplicates using content hash"""
        seen_hashes: Set[str] = set()
        unique = []

        for chunk in chunks:
            content = chunk.get('content', '')
            # Normalize: lowercase, remove extra whitespace
            normalized = ' '.join(content.lower().split())
            content_hash = hashlib.md5(normalized.encode()).hexdigest()

            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                unique.append(chunk)

        return unique

    def _dedupe_by_similarity(self, chunks: List[Dict]) -> List[Dict]:
        """Remove near-duplicates using similarity scoring"""
        if len(chunks) <= 1:
            return chunks

        unique = []
        used_indices: Set[int] = set()

        for i, chunk in enumerate(chunks):
            if i in used_indices:
                continue

            content = chunk.get('content', '')
            is_duplicate = False

            # Compare with already accepted chunks
            for accepted in unique:
                if self._is_similar(content, accepted.get('content', '')):
                    is_duplicate = True
                    break

            if not is_duplicate:
                unique.append(chunk)
                used_indices.add(i)

        return unique

    def _is_similar(self, text1: str, text2: str) -> bool:
        """Check if two texts are similar enough to be duplicates"""
        # Quick prefix check first
        prefix1 = text1[:self.prefix_length].lower()
        prefix2 = text2[:self.prefix_length].lower()

        if prefix1 == prefix2:
            return True

        # Length-based filter (very different lengths = probably not duplicates)
        len1, len2 = len(text1), len(text2)
        if max(len1, len2) > 0:
            length_ratio = min(len1, len2) / max(len1, len2)
            if length_ratio < 0.5:
                return False

        # Sequence matching (expensive, use on short texts or samples)
        if len1 > 1000 or len2 > 1000:
            # Use sampled comparison for long texts
            sample1 = text1[:500] + text1[-500:]
            sample2 = text2[:500] + text2[-500:]
            similarity = SequenceMatcher(None, sample1, sample2).ratio()
        else:
            similarity = SequenceMatcher(None, text1, text2).ratio()

        return similarity >= self.similarity_threshold

    def find_duplicates(self, chunks: List[Dict]) -> List[Tuple[int, int, float]]:
        """
        Find all duplicate pairs in chunks.

        Returns:
            List of (index1, index2, similarity) tuples
        """
        duplicates = []

        for i in range(len(chunks)):
            for j in range(i + 1, len(chunks)):
                content1 = chunks[i].get('content', '')
                content2 = chunks[j].get('content', '')

                # Quick check
                if len(content1) < 50 or len(content2) < 50:
                    continue

                # Calculate similarity
                if len(content1) > 1000 or len(content2) > 1000:
                    sample1 = content1[:500] + content1[-500:]
                    sample2 = content2[:500] + content2[-500:]
                    similarity = SequenceMatcher(None, sample1, sample2).ratio()
                else:
                    similarity = SequenceMatcher(None, content1, content2).ratio()

                if similarity >= self.similarity_threshold:
                    duplicates.append((i, j, round(similarity, 3)))

        return duplicates

    def get_duplicate_groups(self, chunks: List[Dict]) -> List[List[int]]:
        """
        Group duplicate chunks together.

        Returns:
            List of groups, where each group is a list of chunk indices
        """
        duplicates = self.find_duplicates(chunks)

        # Build adjacency map
        adjacency: Dict[int, Set[int]] = {}
        for i, j, _ in duplicates:
            if i not in adjacency:
                adjacency[i] = set()
            if j not in adjacency:
                adjacency[j] = set()
            adjacency[i].add(j)
            adjacency[j].add(i)

        # Find connected components (groups)
        visited: Set[int] = set()
        groups = []

        def dfs(node: int, group: List[int]):
            if node in visited:
                return
            visited.add(node)
            group.append(node)
            for neighbor in adjacency.get(node, []):
                dfs(neighbor, group)

        for node in adjacency:
            if node not in visited:
                group: List[int] = []
                dfs(node, group)
                if len(group) > 1:
                    groups.append(sorted(group))

        return groups

    def get_stats(self, chunks: List[Dict]) -> Dict:
        """Get deduplication statistics"""
        hash_unique = self._dedupe_by_hash(chunks)
        full_unique = self.deduplicate(chunks)
        duplicate_pairs = self.find_duplicates(chunks)

        return {
            'original_count': len(chunks),
            'after_hash_dedupe': len(hash_unique),
            'after_full_dedupe': len(full_unique),
            'exact_duplicates': len(chunks) - len(hash_unique),
            'near_duplicates': len(hash_unique) - len(full_unique),
            'duplicate_pairs': len(duplicate_pairs),
            'duplicate_groups': len(self.get_duplicate_groups(chunks))
        }
