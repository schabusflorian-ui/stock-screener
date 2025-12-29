# src/services/ai/knowledge/graph/knowledge_graph.py

"""
Knowledge Graph for connecting investment concepts.

Enables:
- "Find all concepts related to X"
- "What does Buffett say that relates to Taleb's ideas?"
- "Find contradicting viewpoints on Y"
- "Show me the connection between margin of safety and antifragility"
"""

import sqlite3
import json
import logging
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass, field
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class ConceptNode:
    """A concept in the knowledge graph"""
    id: str
    name: str
    type: str  # 'concept', 'author', 'topic', 'principle', 'framework'
    description: str = ""
    metadata: Dict = field(default_factory=dict)


@dataclass
class ConceptRelation:
    """A relationship between concepts"""
    source_id: str
    target_id: str
    relation_type: str  # 'related_to', 'authored_by', 'contradicts', 'supports', 'applies_to', 'part_of'
    weight: float = 1.0
    metadata: Dict = field(default_factory=dict)


class KnowledgeGraph:
    """
    Graph-based knowledge representation.

    Connects:
    - Concepts (moat, margin of safety, antifragility)
    - Authors (Buffett, Munger, Taleb, Marks)
    - Topics (valuation, risk, psychology)
    - Principles (specific investment rules)
    - Frameworks (checklists, mental models)
    """

    # Core investment concepts with relationships
    CORE_CONCEPTS = {
        # Value investing concepts
        'margin_of_safety': {
            'type': 'principle',
            'authors': ['graham', 'buffett', 'klarman'],
            'related': ['valuation', 'risk_management', 'intrinsic_value', 'downside_protection'],
            'description': 'Buy at a significant discount to intrinsic value to protect against errors'
        },
        'intrinsic_value': {
            'type': 'concept',
            'authors': ['graham', 'buffett', 'damodaran'],
            'related': ['dcf', 'valuation', 'margin_of_safety', 'owner_earnings'],
            'description': 'The true worth of a business based on its fundamentals'
        },
        'moat': {
            'type': 'concept',
            'authors': ['buffett', 'munger', 'dorsey'],
            'related': ['competitive_advantage', 'pricing_power', 'durability', 'network_effects'],
            'description': 'Durable competitive advantage that protects profits'
        },
        'circle_of_competence': {
            'type': 'principle',
            'authors': ['buffett', 'munger'],
            'related': ['risk_management', 'self_awareness', 'focus'],
            'description': 'Only invest in what you understand'
        },
        'owner_earnings': {
            'type': 'concept',
            'authors': ['buffett'],
            'related': ['free_cash_flow', 'intrinsic_value', 'capital_allocation'],
            'description': 'Cash that can be extracted without impairing the business'
        },

        # Risk concepts (Taleb)
        'antifragility': {
            'type': 'concept',
            'authors': ['taleb'],
            'related': ['optionality', 'convexity', 'barbell', 'volatility'],
            'description': 'Systems that gain from disorder and volatility'
        },
        'black_swan': {
            'type': 'concept',
            'authors': ['taleb'],
            'related': ['tail_risk', 'fat_tails', 'uncertainty', 'fragility'],
            'description': 'Rare, high-impact, unpredictable events'
        },
        'skin_in_the_game': {
            'type': 'principle',
            'authors': ['taleb'],
            'related': ['incentives', 'management', 'alignment', 'asymmetry'],
            'description': 'Decision makers should bear consequences of their decisions'
        },
        'barbell_strategy': {
            'type': 'framework',
            'authors': ['taleb', 'spitznagel'],
            'related': ['antifragility', 'risk_management', 'optionality'],
            'description': 'Extreme caution combined with extreme risk-taking'
        },
        'optionality': {
            'type': 'concept',
            'authors': ['taleb', 'spitznagel'],
            'related': ['antifragility', 'asymmetry', 'convexity'],
            'description': 'The right but not obligation to take action'
        },

        # Market cycle concepts (Marks)
        'second_level_thinking': {
            'type': 'principle',
            'authors': ['marks'],
            'related': ['contrarian', 'consensus', 'market_efficiency'],
            'description': 'Think about what others think and where they might be wrong'
        },
        'market_cycles': {
            'type': 'concept',
            'authors': ['marks', 'templeton'],
            'related': ['pendulum', 'sentiment', 'fear_greed'],
            'description': 'Markets swing between extremes of optimism and pessimism'
        },
        'pendulum': {
            'type': 'concept',
            'authors': ['marks'],
            'related': ['market_cycles', 'sentiment', 'mean_reversion'],
            'description': 'Investor sentiment swings from euphoria to panic'
        },

        # Psychology concepts
        'mr_market': {
            'type': 'concept',
            'authors': ['graham', 'buffett'],
            'related': ['market_psychology', 'volatility', 'opportunity'],
            'description': 'The market as an emotional counterparty offering prices'
        },
        'fear_and_greed': {
            'type': 'concept',
            'authors': ['buffett', 'marks', 'graham'],
            'related': ['psychology', 'sentiment', 'contrarian'],
            'description': 'The two emotions that drive investor behavior'
        },

        # Quality investing
        'compounding': {
            'type': 'concept',
            'authors': ['buffett', 'munger'],
            'related': ['quality', 'long_term', 'reinvestment'],
            'description': 'The exponential growth of value over time'
        },
        'capital_allocation': {
            'type': 'concept',
            'authors': ['buffett', 'thorndike'],
            'related': ['management', 'buybacks', 'dividends', 'reinvestment'],
            'description': "How management deploys the company's cash"
        },

        # Mental models
        'inversion': {
            'type': 'mental_model',
            'authors': ['munger'],
            'related': ['mental_models', 'thinking', 'problem_solving'],
            'description': 'Solve problems by thinking backwards - how to fail'
        },
        'latticework': {
            'type': 'framework',
            'authors': ['munger'],
            'related': ['mental_models', 'multidisciplinary', 'thinking'],
            'description': 'Network of mental models from multiple disciplines'
        },

        # Austrian economics
        'roundabout_investing': {
            'type': 'principle',
            'authors': ['spitznagel'],
            'related': ['patience', 'positioning', 'austrian_economics'],
            'description': 'Indirect path to returns through strategic positioning'
        }
    }

    # Known contradictions/tensions
    CONTRADICTIONS = [
        ('diversification', 'concentration', 'Whether to spread or focus bets'),
        ('momentum', 'mean_reversion', 'Whether trends continue or reverse'),
        ('efficient_markets', 'value_investing', 'Whether markets are beatable'),
    ]

    def __init__(self, db_path: str = "data/knowledge_graph.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self._create_tables()
        self._seed_core_concepts()

    def _create_tables(self):
        """Create graph tables"""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS concepts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                description TEXT,
                metadata TEXT
            );

            CREATE TABLE IF NOT EXISTS relations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                relation_type TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                metadata TEXT,
                FOREIGN KEY (source_id) REFERENCES concepts(id),
                FOREIGN KEY (target_id) REFERENCES concepts(id),
                UNIQUE(source_id, target_id, relation_type)
            );

            CREATE TABLE IF NOT EXISTS chunk_concepts (
                chunk_id TEXT NOT NULL,
                concept_id TEXT NOT NULL,
                relevance REAL DEFAULT 1.0,
                PRIMARY KEY (chunk_id, concept_id),
                FOREIGN KEY (concept_id) REFERENCES concepts(id)
            );

            CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
            CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
            CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
            CREATE INDEX IF NOT EXISTS idx_chunk_concepts ON chunk_concepts(concept_id);
        """)
        self.conn.commit()

    def _seed_core_concepts(self):
        """Seed the graph with core investment concepts"""
        # Check if already seeded
        cursor = self.conn.execute("SELECT COUNT(*) FROM concepts")
        if cursor.fetchone()[0] > 0:
            return

        logger.info("Seeding knowledge graph with core concepts...")

        for concept_id, data in self.CORE_CONCEPTS.items():
            # Add concept
            self.add_concept(ConceptNode(
                id=concept_id,
                name=concept_id.replace('_', ' ').title(),
                type=data['type'],
                description=data['description']
            ))

            # Add author relationships
            for author in data.get('authors', []):
                author_id = f"author_{author}"
                self.add_concept(ConceptNode(
                    id=author_id,
                    name=author.title(),
                    type='author'
                ))
                self.add_relation(ConceptRelation(
                    source_id=concept_id,
                    target_id=author_id,
                    relation_type='authored_by'
                ))

            # Add related concept relationships
            for related in data.get('related', []):
                self.add_relation(ConceptRelation(
                    source_id=concept_id,
                    target_id=related,
                    relation_type='related_to'
                ))

        # Add known contradictions
        for concept_a, concept_b, description in self.CONTRADICTIONS:
            self.add_relation(ConceptRelation(
                source_id=concept_a,
                target_id=concept_b,
                relation_type='contradicts',
                metadata={'description': description}
            ))

        logger.info(f"Seeded {len(self.CORE_CONCEPTS)} core concepts")

    def add_concept(self, concept: ConceptNode) -> bool:
        """Add a concept to the graph"""
        try:
            self.conn.execute("""
                INSERT OR REPLACE INTO concepts (id, name, type, description, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (
                concept.id,
                concept.name,
                concept.type,
                concept.description,
                json.dumps(concept.metadata) if concept.metadata else None
            ))
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error adding concept: {e}")
            return False

    def add_relation(self, relation: ConceptRelation) -> bool:
        """Add a relationship between concepts"""
        try:
            self.conn.execute("""
                INSERT OR IGNORE INTO relations
                (source_id, target_id, relation_type, weight, metadata)
                VALUES (?, ?, ?, ?, ?)
            """, (
                relation.source_id,
                relation.target_id,
                relation.relation_type,
                relation.weight,
                json.dumps(relation.metadata) if relation.metadata else None
            ))
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error adding relation: {e}")
            return False

    def get_concept(self, concept_id: str) -> Optional[ConceptNode]:
        """Get a concept by ID"""
        cursor = self.conn.execute(
            "SELECT * FROM concepts WHERE id = ?",
            (concept_id,)
        )
        row = cursor.fetchone()
        if row:
            return ConceptNode(
                id=row[0],
                name=row[1],
                type=row[2],
                description=row[3] or '',
                metadata=json.loads(row[4]) if row[4] else {}
            )
        return None

    def get_related_concepts(self,
                             concept_id: str,
                             max_depth: int = 2,
                             relation_types: List[str] = None) -> List[Dict]:
        """Get concepts related to a given concept"""
        visited = set()
        results = []

        def traverse(current_id: str, depth: int, path: List[str]):
            if depth > max_depth or current_id in visited:
                return
            visited.add(current_id)

            query = """
                SELECT c.*, r.relation_type, r.weight
                FROM relations r
                JOIN concepts c ON r.target_id = c.id
                WHERE r.source_id = ?
            """
            params = [current_id]

            if relation_types:
                placeholders = ','.join('?' * len(relation_types))
                query += f" AND r.relation_type IN ({placeholders})"
                params.extend(relation_types)

            cursor = self.conn.execute(query, params)

            for row in cursor:
                if row[0] not in visited:
                    results.append({
                        'id': row[0],
                        'name': row[1],
                        'type': row[2],
                        'description': row[3],
                        'relation': row[5],
                        'weight': row[6],
                        'depth': depth,
                        'path': path + [row[0]]
                    })
                    traverse(row[0], depth + 1, path + [row[0]])

        traverse(concept_id, 1, [concept_id])
        return results

    def get_author_concepts(self, author_name: str) -> List[Dict]:
        """Get all concepts associated with an author"""
        author_id = f"author_{author_name.lower()}"

        cursor = self.conn.execute("""
            SELECT c.* FROM concepts c
            JOIN relations r ON c.id = r.source_id
            WHERE r.target_id = ? AND r.relation_type = 'authored_by'
        """, (author_id,))

        return [
            {'id': row[0], 'name': row[1], 'type': row[2], 'description': row[3]}
            for row in cursor
        ]

    def find_connections(self,
                         concept_a: str,
                         concept_b: str,
                         max_depth: int = 4) -> List[List[str]]:
        """Find paths connecting two concepts"""
        paths = []

        def dfs(current: str, target: str, path: List[str], depth: int):
            if depth > max_depth:
                return
            if current == target:
                paths.append(path.copy())
                return

            # Get neighbors (both directions)
            cursor = self.conn.execute("""
                SELECT target_id FROM relations WHERE source_id = ?
                UNION
                SELECT source_id FROM relations WHERE target_id = ?
            """, (current, current))

            for row in cursor:
                next_id = row[0]
                if next_id not in path:
                    path.append(next_id)
                    dfs(next_id, target, path, depth + 1)
                    path.pop()

        dfs(concept_a, concept_b, [concept_a], 0)
        return paths

    def find_contradictions(self, concept_id: str) -> List[Dict]:
        """Find concepts that contradict a given concept"""
        cursor = self.conn.execute("""
            SELECT c.*, r.metadata FROM concepts c
            JOIN relations r ON (c.id = r.target_id OR c.id = r.source_id)
            WHERE (r.source_id = ? OR r.target_id = ?)
            AND r.relation_type = 'contradicts'
            AND c.id != ?
        """, (concept_id, concept_id, concept_id))

        return [
            {
                'id': row[0],
                'name': row[1],
                'type': row[2],
                'description': row[3],
                'context': json.loads(row[5]).get('description') if row[5] else None
            }
            for row in cursor
        ]

    def link_chunk_to_concepts(self, chunk_id: str, concepts: List[Tuple[str, float]]):
        """Link a knowledge chunk to concepts with relevance scores"""
        for concept_id, relevance in concepts:
            try:
                self.conn.execute("""
                    INSERT OR REPLACE INTO chunk_concepts (chunk_id, concept_id, relevance)
                    VALUES (?, ?, ?)
                """, (chunk_id, concept_id, relevance))
            except Exception as e:
                logger.debug(f"Error linking chunk to concept: {e}")
        self.conn.commit()

    def get_chunks_for_concepts(self, concept_ids: List[str], limit: int = 50) -> List[str]:
        """Get chunk IDs linked to given concepts"""
        if not concept_ids:
            return []

        placeholders = ','.join('?' * len(concept_ids))
        cursor = self.conn.execute(f"""
            SELECT chunk_id, SUM(relevance) as total_relevance
            FROM chunk_concepts
            WHERE concept_id IN ({placeholders})
            GROUP BY chunk_id
            ORDER BY total_relevance DESC
            LIMIT ?
        """, concept_ids + [limit])

        return [row[0] for row in cursor]

    def get_stats(self) -> Dict:
        """Get graph statistics"""
        concepts = self.conn.execute("SELECT COUNT(*) FROM concepts").fetchone()[0]
        relations = self.conn.execute("SELECT COUNT(*) FROM relations").fetchone()[0]
        chunk_links = self.conn.execute("SELECT COUNT(*) FROM chunk_concepts").fetchone()[0]

        # Count by type
        type_cursor = self.conn.execute(
            "SELECT type, COUNT(*) FROM concepts GROUP BY type"
        )
        by_type = {row[0]: row[1] for row in type_cursor}

        # Count by relation type
        rel_cursor = self.conn.execute(
            "SELECT relation_type, COUNT(*) FROM relations GROUP BY relation_type"
        )
        by_relation = {row[0]: row[1] for row in rel_cursor}

        return {
            'total_concepts': concepts,
            'total_relations': relations,
            'chunk_links': chunk_links,
            'concepts_by_type': by_type,
            'relations_by_type': by_relation
        }

    def search_concepts(self, query: str, limit: int = 10) -> List[ConceptNode]:
        """Search concepts by name or description"""
        cursor = self.conn.execute("""
            SELECT * FROM concepts
            WHERE name LIKE ? OR description LIKE ? OR id LIKE ?
            LIMIT ?
        """, (f"%{query}%", f"%{query}%", f"%{query}%", limit))

        return [
            ConceptNode(
                id=row[0],
                name=row[1],
                type=row[2],
                description=row[3] or '',
                metadata=json.loads(row[4]) if row[4] else {}
            )
            for row in cursor
        ]

    def close(self):
        """Close database connection"""
        self.conn.close()
