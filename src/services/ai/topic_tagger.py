# src/services/ai/topic_tagger.py

from typing import List, Dict, Set
import re


class TopicTagger:
    """
    Automatically tag document chunks by investment topic.

    Used to enable topic-filtered retrieval, so analysts can ask for
    wisdom specifically about valuation, moats, risk, etc.

    Topics are detected via keyword matching. The tagger assigns
    multiple topics to each chunk and scores them by relevance.

    Usage:
        tagger = TopicTagger()
        tags = tagger.tag_chunk("Warren Buffett always emphasizes margin of safety...")
        # ['valuation', 'risk']
    """

    # Topic keyword definitions (all lowercase)
    TOPICS = {
        'valuation': [
            'intrinsic value', 'dcf', 'discounted cash flow', 'margin of safety',
            'p/e ratio', 'price to earnings', 'fair value', 'overvalued',
            'undervalued', 'owner earnings', 'free cash flow', 'book value',
            'enterprise value', 'ev/ebitda', 'price to sales', 'valuation',
            'worth', 'cheap', 'expensive', 'multiple', 'earnings yield',
            'price to book', 'normalized earnings', 'intrinsic', 'fair price'
        ],
        'moats': [
            'competitive advantage', 'moat', 'barrier to entry', 'network effect',
            'switching cost', 'brand', 'pricing power', 'durable advantage',
            'economic moat', 'sustainable advantage', 'defensible', 'lock-in',
            'economies of scale', 'intangible asset', 'cost advantage',
            'efficient scale', 'network economics', 'franchise value'
        ],
        'management': [
            'capital allocation', 'management', 'ceo', 'insider', 'incentive',
            'compensation', 'shareholder friendly', 'buyback', 'acquisition',
            'dividend', 'leadership', 'governance', 'executive', 'alignment',
            'skin in the game', 'insider ownership', 'board', 'stewardship'
        ],
        'risk': [
            'risk', 'downside', 'margin of safety', 'leverage', 'debt',
            'bankruptcy', 'permanent loss', 'volatility', 'uncertainty',
            'tail risk', 'black swan', 'fat tail', 'drawdown', 'liquidity',
            'concentration', 'diversification', 'correlation', 'asymmetric',
            'worst case', 'stress test', 'counterparty'
        ],
        'psychology': [
            'bias', 'emotion', 'fear', 'greed', 'psychology', 'behavioral',
            'cognitive', 'mistake', 'misjudgment', 'heuristic', 'irrational',
            'overconfidence', 'anchoring', 'confirmation bias', 'loss aversion',
            'recency', 'availability', 'narrative', 'hindsight', 'herding',
            'social proof', 'mental', 'discipline', 'temperament', 'patience'
        ],
        'cycles': [
            'cycle', 'recession', 'bubble', 'crash', 'recovery', 'bear market',
            'bull market', 'sentiment', 'extreme', 'euphoria', 'panic',
            'boom', 'bust', 'pendulum', 'reversion', 'mean reversion',
            'capitulation', 'mania', 'depression', 'expansion', 'contraction'
        ],
        'quality': [
            'quality', 'roe', 'roic', 'return on', 'margin', 'profitability',
            'earnings quality', 'cash flow', 'durable', 'consistent',
            'predictable', 'stable', 'sustainable', 'compounding machine',
            'high quality', 'wonderful business', 'franchise', 'accruals'
        ],
        'growth': [
            'growth', 'revenue growth', 'tam', 'total addressable market',
            'market size', 'expansion', 'reinvestment', 'scalable',
            'compound', 'geometric', 'exponential', 'secular', 'tailwind',
            'runway', 'optionality', 'potential', 'market share'
        ],
        'contrarian': [
            'contrarian', 'against the crowd', 'out of favor', 'hated',
            'unloved', 'sentiment', 'pessimism', 'optimism', 'consensus',
            'variant perception', 'crowded trade', 'unpopular', 'contrarian',
            'second-level thinking', 'non-consensus', 'differentiated'
        ],
        'dividends': [
            'dividend', 'yield', 'payout', 'income', 'distribution',
            'shareholder return', 'dividend growth', 'dividend aristocrat',
            'dividend safety', 'dividend coverage', 'yield on cost'
        ],
        'macro': [
            'interest rate', 'inflation', 'gdp', 'recession', 'federal reserve',
            'monetary policy', 'fiscal', 'economy', 'economic', 'macro',
            'currency', 'trade', 'unemployment', 'central bank', 'stimulus',
            'deflation', 'stagflation', 'treasury', 'bond'
        ],
        'mental_models': [
            'mental model', 'framework', 'thinking', 'decision', 'reasoning',
            'first principles', 'inversion', 'circle of competence',
            'second order', 'opportunity cost', 'incentive', 'checklist',
            'latticework', 'multidisciplinary', 'worldly wisdom'
        ],
        'accounting': [
            'accounting', 'gaap', 'earnings', 'revenue recognition',
            'depreciation', 'amortization', 'goodwill', 'impairment',
            'balance sheet', 'income statement', 'cash flow statement',
            'working capital', 'capex', 'accrual', 'cash basis', 'audit'
        ],
        'special_situations': [
            'spinoff', 'spin-off', 'merger', 'acquisition', 'restructuring',
            'bankruptcy', 'distressed', 'arbitrage', 'activist', 'tender',
            'liquidation', 'stub', 'rights offering', 'warrant'
        ],
        'tail_risk': [
            'tail risk', 'black swan', 'fat tail', 'extreme event',
            'crash', 'drawdown', 'var', 'value at risk', 'blow up',
            'ruin', 'survival', 'convexity', 'tail hedge', 'crash protection',
            'left tail', 'right tail', 'sigma event', 'outlier'
        ],
        'antifragility': [
            'antifragile', 'fragile', 'robust', 'optionality',
            'barbell', 'convex', 'asymmetric', 'skin in the game',
            'via negativa', 'lindy', 'disorder', 'volatility benefit',
            'stress test', 'hormesis', 'redundancy'
        ],
        'austrian_economics': [
            'austrian', 'time preference', 'roundabout', 'malinvestment',
            'business cycle', 'central bank', 'money printing', 'inflation',
            'credit expansion', 'boom bust', 'monetary policy', 'fiat',
            'sound money', 'capital structure'
        ],
        'technology': [
            'technology', 'tech', 'software', 'hardware', 'digital',
            'internet', 'platform', 'disruption', 'innovation', 'startup',
            'venture', 'saas', 'cloud', 'api', 'developer', 'engineering'
        ],
        'ai': [
            'artificial intelligence', ' ai ', 'machine learning', 'deep learning',
            'neural network', 'llm', 'large language model', 'chatgpt', 'gpt',
            'transformer', 'foundation model', 'generative ai', 'inference',
            'training', 'fine-tuning', 'prompt', 'embeddings', 'vector'
        ],
        'robotics': [
            'robot', 'robotics', 'automation', 'autonomous', 'self-driving',
            'drone', 'humanoid', 'manufacturing automation', 'cobot',
            'warehouse automation', 'robotaxi', 'industrial robot', 'actuator'
        ],
        'disruption': [
            'disrupt', 'disruption', 'innovator\'s dilemma', 'creative destruction',
            's-curve', 'adoption curve', 'paradigm shift', 'obsolete',
            'unbundling', 'rebundling', 'platform shift', 'winner take all',
            'network effect', 'flywheel', 'moat erosion'
        ]
    }

    def __init__(self):
        # Pre-compile regex patterns for efficiency
        self.patterns = {}
        for topic, keywords in self.TOPICS.items():
            # Create pattern that matches whole words (case insensitive)
            pattern = '|'.join(r'\b' + re.escape(kw) + r's?\b' for kw in keywords)
            self.patterns[topic] = re.compile(pattern, re.IGNORECASE)

    def tag_chunk(self, text: str) -> List[str]:
        """
        Identify all topics present in a chunk.

        Args:
            text: The text to analyze

        Returns:
            List of topic names found in the text
        """
        tags = []

        for topic, pattern in self.patterns.items():
            if pattern.search(text):
                tags.append(topic)

        return tags

    def get_topic_scores(self, text: str) -> Dict[str, int]:
        """
        Get count of keyword matches per topic.

        Higher scores indicate stronger relevance to that topic.

        Args:
            text: The text to analyze

        Returns:
            Dict mapping topic names to match counts
        """
        scores = {}

        for topic, pattern in self.patterns.items():
            matches = pattern.findall(text)
            if matches:
                scores[topic] = len(matches)

        return scores

    def get_primary_topic(self, text: str) -> str:
        """
        Get the single most relevant topic for a text.

        Args:
            text: The text to analyze

        Returns:
            The topic with highest keyword count, or 'general'
        """
        scores = self.get_topic_scores(text)
        if not scores:
            return 'general'
        return max(scores.items(), key=lambda x: x[1])[0]

    def get_top_topics(self, text: str, n: int = 3) -> List[str]:
        """
        Get the top N most relevant topics.

        Args:
            text: The text to analyze
            n: Number of topics to return

        Returns:
            List of top topic names, sorted by relevance
        """
        scores = self.get_topic_scores(text)
        if not scores:
            return ['general']

        sorted_topics = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return [t[0] for t in sorted_topics[:n]]

    def tag_chunks(self, chunks: List[Dict]) -> List[Dict]:
        """
        Add topic tags to all chunks in place.

        Modifies each chunk dict to add:
        - metadata['topics']: List of all matching topics
        - metadata['topic_scores']: Dict of topic -> match count
        - metadata['primary_topic']: Single most relevant topic

        Args:
            chunks: List of chunk dicts with 'content' key

        Returns:
            The same list with topic metadata added
        """
        for chunk in chunks:
            content = chunk.get('content', '')

            topics = self.tag_chunk(content)
            scores = self.get_topic_scores(content)
            primary = self.get_primary_topic(content)

            if 'metadata' not in chunk:
                chunk['metadata'] = {}

            chunk['metadata']['topics'] = topics
            chunk['metadata']['topic_scores'] = scores
            chunk['metadata']['primary_topic'] = primary

        return chunks

    def get_all_topics(self) -> List[str]:
        """Get list of all available topic names"""
        return list(self.TOPICS.keys())

    def get_keywords_for_topic(self, topic: str) -> List[str]:
        """Get all keywords associated with a topic"""
        return self.TOPICS.get(topic, [])

    def get_topic_summary(self, chunks: List[Dict]) -> Dict[str, int]:
        """
        Get count of chunks per topic across a corpus.

        Useful for understanding knowledge base coverage.
        """
        summary = {}

        for chunk in chunks:
            topics = chunk.get('metadata', {}).get('topics', [])
            for topic in topics:
                summary[topic] = summary.get(topic, 0) + 1

        return dict(sorted(summary.items(), key=lambda x: x[1], reverse=True))


# Test
if __name__ == "__main__":
    tagger = TopicTagger()

    test_texts = [
        "Warren Buffett emphasizes margin of safety when calculating intrinsic value.",
        "Howard Marks writes about market cycles and the pendulum of investor sentiment.",
        "A wide moat from network effects creates sustainable competitive advantage.",
        "Fear and greed drive investor psychology, leading to cognitive biases.",
        "The CEO has excellent capital allocation skills and skin in the game."
    ]

    print("Topic Tagger Test\n" + "=" * 50)

    for text in test_texts:
        print(f"\nText: {text[:60]}...")
        print(f"Topics: {tagger.tag_chunk(text)}")
        print(f"Primary: {tagger.get_primary_topic(text)}")
        print(f"Scores: {tagger.get_topic_scores(text)}")
