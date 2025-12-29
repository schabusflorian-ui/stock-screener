# src/services/ai/knowledge/graph/concept_extractor.py

"""
Extract investment concepts from text chunks.

Uses pattern matching and optional LLM for concept identification.
"""

import re
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


class ConceptExtractor:
    """
    Extract investment concepts from text.

    Identifies references to:
    - Named concepts (margin of safety, moat, etc.)
    - Authors (Buffett, Munger, Taleb, etc.)
    - Frameworks (DCF, mental models, etc.)
    """

    # Concept patterns to detect
    CONCEPT_PATTERNS = {
        # Core value investing
        'margin_of_safety': [
            r'margin of safety', r'margin-of-safety', r'safety margin',
            r'discount to (intrinsic )?value'
        ],
        'intrinsic_value': [
            r'intrinsic value', r'intrinsic worth', r'true value',
            r'fundamental value'
        ],
        'moat': [
            r'\bmoat\b', r'economic moat', r'competitive moat',
            r'wide moat', r'narrow moat', r'durable (competitive )?advantage'
        ],
        'circle_of_competence': [
            r'circle of competence', r'competence circle',
            r'what (you|we|i) understand', r'stay within'
        ],
        'owner_earnings': [
            r'owner earnings', r"owner's earnings"
        ],

        # Competitive advantage types
        'network_effects': [
            r'network effect', r'network economics', r'network-based',
            r'more users.*more valuable'
        ],
        'switching_costs': [
            r'switching cost', r'lock-in', r'customer lock',
            r'hard to switch', r'sticky customer'
        ],
        'pricing_power': [
            r'pricing power', r'price increase', r'raise prices',
            r'pass.* cost.* customer'
        ],
        'economies_of_scale': [
            r'econom(y|ies) of scale', r'scale advantage',
            r'cost advantage', r'volume discount'
        ],

        # Risk concepts
        'antifragility': [
            r'antifragil', r'anti-fragil', r'gain from disorder',
            r'benefit from volatility'
        ],
        'black_swan': [
            r'black swan', r'tail event', r'tail risk',
            r'fat tail', r'extreme event'
        ],
        'optionality': [
            r'\boptionality\b', r'option value', r'asymmetric',
            r'upside.*limited downside', r'convex'
        ],
        'barbell_strategy': [
            r'barbell', r'bar-bell', r'extreme.*conservative',
            r'bimodal'
        ],
        'skin_in_the_game': [
            r'skin in the game', r'eat your own cooking',
            r'personal stake', r'alignment of interest'
        ],

        # Market psychology
        'mr_market': [
            r'mr\.? market', r'mister market',
            r'market as.*partner', r'moody market'
        ],
        'fear_and_greed': [
            r'fear and greed', r'greed and fear',
            r'fearful.*greedy', r'greedy.*fearful'
        ],
        'second_level_thinking': [
            r'second[ -]level thinking', r'second order',
            r'think.*what others think'
        ],
        'market_cycles': [
            r'market cycle', r'cycle.*market', r'boom.*bust',
            r'bull.*bear', r'pendulum'
        ],
        'mean_reversion': [
            r'mean reversion', r'revert to.*mean',
            r'regression to.*mean'
        ],

        # Valuation
        'dcf': [
            r'\bdcf\b', r'discounted cash flow', r'discount.*future.*cash'
        ],
        'earnings_power': [
            r'earnings power', r'earning power', r'normalized earnings'
        ],
        'free_cash_flow': [
            r'free cash flow', r'\bfcf\b', r'cash.*after.*capex'
        ],

        # Quality
        'compounding': [
            r'compound', r'compounding', r'geometric growth',
            r'snowball', r'exponential'
        ],
        'capital_allocation': [
            r'capital allocation', r'allocat.*capital',
            r'deploy.*cash', r'reinvest'
        ],
        'management_quality': [
            r'management quality', r'quality of management',
            r'able management', r'competent management'
        ],

        # Mental models
        'inversion': [
            r'\binversion\b', r'invert.*always', r'think backward',
            r'avoid failure'
        ],
        'mental_model': [
            r'mental model', r'latticework', r'framework.*thinking'
        ],
        'first_principles': [
            r'first principle', r'from scratch', r'basic truth'
        ],
        'confirmation_bias': [
            r'confirmation bias', r'seek.*confirm',
            r'disconfirming evidence'
        ],

        # Austrian economics
        'roundabout': [
            r'roundabout', r'indirect.*approach', r'austrian'
        ],
        'time_preference': [
            r'time preference', r'patience premium', r'delay gratification'
        ]
    }

    # Author detection patterns
    AUTHOR_PATTERNS = {
        'buffett': [r'buffett', r'warren', r'berkshire', r'omaha'],
        'munger': [r'munger', r'charlie', r'daily journal'],
        'graham': [r'graham', r'benjamin graham', r'ben graham', r'intelligent investor'],
        'taleb': [r'taleb', r'nassim', r'black swan author', r'fooled by randomness'],
        'marks': [r'howard marks', r'oaktree', r'most important thing'],
        'damodaran': [r'damodaran', r'aswath', r'nyu.*valuation'],
        'klarman': [r'klarman', r'seth', r'baupost'],
        'lynch': [r'peter lynch', r'lynch', r'fidelity.*magellan'],
        'templeton': [r'templeton', r'john templeton'],
        'fisher': [r'philip fisher', r'fisher', r'scuttlebutt'],
        'soros': [r'george soros', r'soros', r'reflexivity'],
        'spitznagel': [r'spitznagel', r'universa', r'mark spitznagel'],
        'li_lu': [r'li lu', r'himalaya', r'modern value'],
        'greenblatt': [r'greenblatt', r'joel', r'magic formula'],
        'burry': [r'michael burry', r'burry', r'scion'],
        'housel': [r'morgan housel', r'housel', r'psychology of money'],
        'parrish': [r'shane parrish', r'farnam street'],
    }

    def __init__(self, min_relevance: float = 0.5):
        """
        Args:
            min_relevance: Minimum relevance score to include (0-1)
        """
        self.min_relevance = min_relevance

        # Compile patterns for efficiency
        self.compiled_concepts = {}
        for concept, patterns in self.CONCEPT_PATTERNS.items():
            combined = '|'.join(f'({p})' for p in patterns)
            self.compiled_concepts[concept] = re.compile(combined, re.IGNORECASE)

        self.compiled_authors = {}
        for author, patterns in self.AUTHOR_PATTERNS.items():
            combined = '|'.join(f'({p})' for p in patterns)
            self.compiled_authors[author] = re.compile(combined, re.IGNORECASE)

    def extract_concepts(self, text: str) -> List[Tuple[str, float]]:
        """
        Extract concepts from text with relevance scores.

        Args:
            text: Text to analyze

        Returns:
            List of (concept_id, relevance) tuples
        """
        text_lower = text.lower()
        text_len = len(text)
        concepts = []

        for concept_id, pattern in self.compiled_concepts.items():
            matches = list(pattern.finditer(text_lower))
            if matches:
                # Calculate relevance based on:
                # - Number of matches
                # - Text coverage
                match_count = len(matches)
                coverage = sum(m.end() - m.start() for m in matches) / text_len

                # Score: more matches and more coverage = higher relevance
                relevance = min(1.0, 0.5 + (match_count * 0.15) + (coverage * 2))

                if relevance >= self.min_relevance:
                    concepts.append((concept_id, round(relevance, 2)))

        return concepts

    def extract_authors(self, text: str) -> List[Tuple[str, float]]:
        """
        Extract author references from text.

        Returns:
            List of (author_id, relevance) tuples
        """
        text_lower = text.lower()
        authors = []

        for author_id, pattern in self.compiled_authors.items():
            matches = list(pattern.finditer(text_lower))
            if matches:
                match_count = len(matches)
                # More mentions = higher relevance
                relevance = min(1.0, 0.6 + (match_count * 0.1))
                authors.append((f"author_{author_id}", round(relevance, 2)))

        return authors

    def extract_all(self, text: str) -> Dict[str, List[Tuple[str, float]]]:
        """
        Extract all concepts and authors from text.

        Returns:
            Dict with 'concepts' and 'authors' keys
        """
        return {
            'concepts': self.extract_concepts(text),
            'authors': self.extract_authors(text)
        }

    def get_primary_concepts(self, text: str, top_k: int = 5) -> List[str]:
        """Get top K most relevant concepts"""
        concepts = self.extract_concepts(text)
        sorted_concepts = sorted(concepts, key=lambda x: x[1], reverse=True)
        return [c[0] for c in sorted_concepts[:top_k]]

    def extract_for_chunk(self, chunk: Dict) -> List[Tuple[str, float]]:
        """
        Extract concepts for a knowledge chunk.

        Considers both content and metadata.
        """
        content = chunk.get('content', '')
        metadata = chunk.get('metadata', {})

        # Extract from content
        concepts = self.extract_concepts(content)
        authors = self.extract_authors(content)

        # Boost if metadata mentions specific topics/authors
        if metadata.get('author'):
            author_key = metadata['author'].lower().replace(' ', '_')
            # Find matching author pattern
            for author_id, pattern in self.compiled_authors.items():
                if pattern.search(author_key):
                    # Boost this author's concepts
                    authors.append((f"author_{author_id}", 0.9))

        if metadata.get('topics'):
            for topic in metadata['topics']:
                topic_key = topic.lower().replace(' ', '_')
                if topic_key in self.CONCEPT_PATTERNS:
                    concepts.append((topic_key, 0.7))

        # Combine and dedupe
        all_items = concepts + authors
        seen = {}
        for item_id, relevance in all_items:
            if item_id not in seen or seen[item_id] < relevance:
                seen[item_id] = relevance

        return list(seen.items())
