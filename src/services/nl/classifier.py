# src/services/nl/classifier.py
"""
Query classifier for natural language investment queries.
Uses hybrid approach: rule-based patterns + LLM for complex cases.

Enhanced with:
- Synonym expansion for natural language variations
- Fuzzy matching for typo tolerance
- Company name to ticker resolution
- Improved intent classification
"""

import re
import logging
from typing import Dict, List, Optional, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum
from difflib import get_close_matches

logger = logging.getLogger(__name__)


class QueryIntent(Enum):
    """Types of queries the system can handle"""
    SCREEN = "screen"              # "Show me undervalued tech stocks"
    LOOKUP = "lookup"              # "What's AAPL's P/E ratio?"
    COMPARE = "compare"            # "Compare AAPL to MSFT"
    HISTORICAL = "historical"      # "How has AAPL's margin changed?"
    SIMILARITY = "similarity"      # "Find stocks like COST"
    DRIVER = "driver"              # "What's driving NVDA's growth?"
    RANKING = "ranking"            # "Top 10 dividend stocks"
    EXPLANATION = "explanation"    # "Why is AAPL's P/E so high?"
    CALCULATION = "calculation"    # "What would AAPL be worth at 15x earnings?"
    UNKNOWN = "unknown"


@dataclass
class ClassifiedQuery:
    """Result of query classification"""
    original_query: str
    intent: QueryIntent
    confidence: float
    entities: Dict = field(default_factory=dict)
    parameters: Dict = field(default_factory=dict)
    requires_data: List[str] = field(default_factory=list)


class QueryClassifier:
    """
    Classify natural language queries into intents.

    Uses hybrid approach:
    1. Rule-based patterns for common queries (fast)
    2. LLM for complex/ambiguous queries (smart)
    """

    # Pattern-based classification rules
    # Ordered by specificity - more specific patterns first
    INTENT_PATTERNS = {
        QueryIntent.SCREEN: [
            r'show me .* stocks',
            r'find .* stocks',
            r'find me .* stocks',
            r'list .* companies',
            r'list .* stocks',
            r'which stocks',
            r'what stocks',
            r'filter for',
            r'screen for',
            r'stocks with',
            r'companies with',
            r'\bundervalued\b.*(?:stocks?|companies)?',
            r'\bovervalued\b.*(?:stocks?|companies)?',
            r'give me .* stocks',
            r'looking for .* stocks',
            r'search for .* stocks',
            r'i want .* stocks',
            r'dividend (?:paying )?(?:stocks|companies)',
            r'growth stocks',
            r'value stocks',
            r'small cap',
            r'mid cap',
            r'large cap',
            r'(?:low|high) (?:pe|p/e|debt|dividend)',
        ],
        QueryIntent.COMPARE: [
            r'compare .* (?:to|with|vs|versus|and)',
            r'difference between .* and',
            r'how does .* compare (?:to|with)',
            r'\bvs\b',
            r'\bversus\b',
            r'(?:aapl|msft|googl|amzn|nvda|meta|tsla)[,\s]+(?:vs|versus|or|and)[,\s]+\w+',
            r'\w+ (?:vs|versus|or|and) \w+\??$',
            r'better.* (?:than|or)',
            r'which is (?:better|worse)',
            r'side by side',
            r'compare (?:all|both|these|the)',
        ],
        QueryIntent.HISTORICAL: [
            r'over (?:the )?(?:past|last) \d+',
            r'over time',
            r'over the years',
            r'historically',
            r'history of',
            r'\w+ (?:revenue|margin|earnings|growth|price) trend',
            r'\btrend(?:s|ing)? (?:of|for|in)',
            r'\bchanged?\b over',
            r'\d+ years? ago',
            r'\d+ months? ago',
            r'\d+ quarters? ago',
            r'since \d{4}',
            r'from \d{4}',
            r'(?:5|10|3|1)[- ]?year',
            r'growth rate over',
            r'how has .* (?:changed|evolved|performed|grown)',
            r'track record',
            r'^historical (?:performance|data|trend)',
            r'year over year',
            r'\byoy\b',
            r'quarterly (?:trend|growth|change)',
            r'\w+ performance (?:over|since|for)',
        ],
        QueryIntent.SIMILARITY: [
            r'stocks? (?:similar|like) (?:to )?',
            r'(?:find |show )?similar (?:to|stocks)',
            r'companies (?:similar|like) (?:to )?',
            r'alternatives? to',
            r'comparable to',
            r'peers? (?:of|for|to)',
            r'competitors? (?:of|for|to)',
            r'find .* similar',
            r'other .* like',
            r'what.* similar',
            r'stocks that resemble',
            r'equivalent to',
            r'same (?:sector|industry|profile) as',
        ],
        QueryIntent.DRIVER: [
            r"what(?:'?s| is| are) driving",
            r"what(?:'?s| is) behind",
            r'why is .* (?:growing|declining|increasing|decreasing|up|down)',
            r'explain .* (?:growth|decline|increase|decrease|performance)',
            r'breakdown of .* (?:revenue|growth|earnings|margin)',
            r'components? of .* (?:revenue|growth|earnings)',
            r'what (?:is )?caus(?:ed|ing)',
            r'drivers? (?:of|for|behind)',
            r'source of .* (?:growth|revenue)',
            r'driving .* (?:growth|revenue|earnings|margin)',
            r'contributor to',
            r'what makes .* (?:grow|profit|succeed)',
            r'analyze .* (?:growth|revenue|margin)',
            r'factors? (?:driving|behind|affecting)',
        ],
        QueryIntent.RANKING: [
            r'^top \d+ .* (?:stocks?|companies)',
            r'^top \d+ (?:dividend|growth|value|tech)',
            r'^bottom \d+ .* (?:stocks?|companies)',
            r'^best (?:\d+ )?(?:stocks?|companies|performing)',
            r'^worst (?:\d+ )?(?:stocks?|companies|performing)',
            r'\bhighest\b .+(?:stocks?|companies)?',
            r'\blowest\b .+(?:stocks?|companies)?',
            r'\bmost\b .+(?:stocks?|companies)',
            r'\bleast\b .+(?:stocks?|companies)',
            r'\brank(?:ed|ing)?\b',
            r'\bleaders?\b in',
            r'^biggest .* (?:stocks?|companies)',
            r'^largest .* (?:stocks?|companies)',
            r'^smallest .* (?:stocks?|companies)',
            r'sort(?:ed)? by',
            r'order(?:ed)? by',
            r'which (?:stocks?|companies) have the (?:highest|lowest|best|worst)',
            r'^top \d+',  # Fallback, less specific
        ],
        QueryIntent.LOOKUP: [
            r"what(?:'s| is) (?:\w+(?:'s)? )?(?:price|pe|p/e|ratio|margin|revenue|market cap|eps|roe|roa)",
            r"what(?:'s| is) the (?:current )?(?:price|pe|p/e|ratio|margin|revenue|market cap|eps)",
            r'tell me about \w+$',
            r'info(?:rmation)? (?:on|about|for)',
            r'details (?:for|about|on)',
            r'get (?:me )?(?:the )?.* for',
            r'show (?:me )?\w+ data',
            r"(?:\w+)'s (?:pe|p/e|margin|revenue|price|market cap|eps|dividend)",
            r'\w+ (?:pe|p/e|margin|revenue|price|market cap|eps|dividend)',
            r'how (?:much|big) is',
            r'current (?:price|valuation|metrics) (?:of|for)',
            r'summary (?:of|for)',
            r'profile (?:of|for)',
        ],
        QueryIntent.CALCULATION: [
            r'\bcalculate\b',
            r'\bcompute\b',
            r'what would .* be (?:worth|valued)',
            r'if .* (?:was|were|traded) at',
            r'at \d+x (?:earnings|revenue|ebitda)',
            r'fair value (?:of|for)',
            r'target price',
            r'implied (?:value|price)',
            r'what (?:should|would) .* trade at',
        ],
        QueryIntent.EXPLANATION: [
            r'why (?:is|does|has|did) \w+',
            r'explain why',
            r'how come',
            r'what explains',
            r'reason(?:s)? (?:for|behind|why)',
            r'help me understand',
            r'what does .* mean',
            r'interpret .* for me',
        ],
    }

    # Keywords that indicate specific metrics
    METRIC_KEYWORDS = {
        'pe_ratio': ['pe', 'p/e', 'price to earnings', 'earnings multiple', 'pe ratio'],
        'pb_ratio': ['pb', 'p/b', 'price to book', 'book value', 'pb ratio'],
        'ps_ratio': ['ps', 'p/s', 'price to sales', 'ps ratio'],
        'ev_ebitda': ['ev/ebitda', 'ev ebitda', 'enterprise value'],
        'dividend_yield': ['dividend', 'yield', 'dividend yield', 'div yield', 'dividends'],
        'market_cap': ['market cap', 'market capitalization', 'cap', 'size', 'market value'],
        'revenue': ['revenue', 'sales', 'top line', 'turnover'],
        'net_income': ['net income', 'earnings', 'profit', 'bottom line', 'net profit'],
        'gross_margin': ['gross margin', 'gross profit margin'],
        'operating_margin': ['operating margin', 'op margin', 'ebit margin', 'operating profit margin'],
        'net_margin': ['net margin', 'profit margin', 'net profit margin'],
        'roe': ['roe', 'return on equity'],
        'roa': ['roa', 'return on assets'],
        'roic': ['roic', 'return on invested capital', 'return on capital'],
        'debt_to_equity': ['debt to equity', 'leverage', 'd/e', 'debt/equity', 'debt equity'],
        'current_ratio': ['current ratio', 'liquidity'],
        'free_cash_flow': ['fcf', 'free cash flow', 'cash flow'],
        'revenue_growth': ['revenue growth', 'sales growth', 'top line growth', 'growing revenue'],
        'earnings_growth': ['earnings growth', 'eps growth', 'profit growth', 'growing earnings'],
        'price': ['price', 'stock price', 'share price', 'trading at'],
    }

    # Sector keywords
    SECTOR_KEYWORDS = {
        'Technology': ['tech', 'technology', 'software', 'hardware', 'semiconductor', 'saas', 'cloud'],
        'Healthcare': ['healthcare', 'health', 'pharma', 'biotech', 'medical', 'pharmaceutical'],
        'Financials': ['financial', 'bank', 'insurance', 'fintech', 'banking'],
        'Consumer Discretionary': ['consumer discretionary', 'retail', 'restaurant', 'luxury', 'auto'],
        'Consumer Staples': ['staples', 'food', 'beverage', 'household', 'consumer staples'],
        'Industrials': ['industrial', 'manufacturing', 'aerospace', 'defense', 'machinery'],
        'Energy': ['energy', 'oil', 'gas', 'renewable', 'petroleum'],
        'Utilities': ['utility', 'utilities', 'electric', 'power', 'water'],
        'Real Estate': ['real estate', 'reit', 'property', 'reits'],
        'Materials': ['materials', 'mining', 'chemicals', 'metals'],
        'Communication Services': ['communication', 'telecom', 'media', 'entertainment', 'streaming'],
    }

    # Qualifier keywords (for screening)
    QUALIFIER_KEYWORDS = {
        'high': ['high', 'large', 'big', 'above', 'over', 'more than', 'greater', 'strong', 'significant'],
        'low': ['low', 'small', 'below', 'under', 'less than', 'cheap', 'minimal', 'limited'],
        'growing': ['growing', 'increasing', 'rising', 'improving', 'expanding', 'accelerating'],
        'declining': ['declining', 'decreasing', 'falling', 'dropping', 'shrinking', 'slowing'],
        'stable': ['stable', 'consistent', 'steady', 'reliable'],
        'volatile': ['volatile', 'unstable', 'erratic', 'unpredictable'],
    }

    # Common words to exclude from symbol detection
    COMMON_WORDS = {
        'A', 'I', 'TO', 'THE', 'AND', 'OR', 'FOR', 'IN', 'ON', 'AT', 'IS', 'IT',
        'BE', 'AS', 'BY', 'ARE', 'WAS', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER',
        'HAS', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'OUT', 'OUR',
        'OWN', 'SAY', 'SHE', 'TOO', 'USE', 'TOP', 'VS', 'PE', 'PB', 'PS', 'OF',
        'SO', 'IF', 'MY', 'NO', 'UP', 'DO', 'GO', 'ME', 'WE', 'AN', 'AM', 'EPS',
        'ROE', 'ROA', 'FCF', 'YOY', 'TTM', 'FY', 'MRQ', 'ETF', 'IPO', 'CEO',
        'CFO', 'COO', 'CTO', 'USA', 'USD', 'EUR', 'GBP', 'CAD', 'TAM', 'P/E'
    }

    # Synonym expansion for natural language understanding
    # Maps colloquial terms to canonical terms that patterns recognize
    SYNONYMS = {
        # Valuation synonyms
        'cheap': ['undervalued', 'low valuation', 'bargain'],
        'expensive': ['overvalued', 'high valuation', 'pricey'],
        'fair value': ['reasonably priced', 'fairly valued'],
        'earnings multiple': ['pe ratio', 'p/e'],
        'valuation multiple': ['pe ratio', 'p/e', 'price multiple'],
        'trading at': ['valued at', 'priced at'],

        # Quality synonyms
        'quality': ['high quality', 'strong', 'excellent'],
        'profitable': ['makes money', 'in the black', 'earning'],
        'money-making': ['profitable', 'high margin'],
        'good margins': ['high margin', 'profitable'],
        'solid': ['strong', 'quality', 'stable'],
        'blue chip': ['large cap', 'quality', 'established'],

        # Growth synonyms
        'fast growing': ['high growth', 'rapidly growing'],
        'growth story': ['growth potential', 'growing'],
        'momentum': ['trending', 'rising', 'growing'],
        'hot stock': ['trending', 'momentum', 'popular'],
        'booming': ['fast growing', 'rapidly growing'],
        'exploding': ['fast growing', 'rapidly increasing'],
        'taking off': ['growing', 'increasing'],

        # Risk synonyms
        'risky': ['volatile', 'high risk'],
        'safe': ['stable', 'low risk', 'defensive'],
        'conservative': ['safe', 'low risk', 'stable'],
        'aggressive': ['high risk', 'volatile', 'speculative'],
        'speculative': ['risky', 'volatile'],
        'defensive': ['safe', 'stable'],

        # Size synonyms
        'big companies': ['large cap', 'mega cap'],
        'giant': ['large cap', 'mega cap'],
        'huge': ['large cap', 'mega cap'],
        'tiny': ['small cap', 'micro cap'],
        'small companies': ['small cap'],
        'medium sized': ['mid cap'],

        # Dividend synonyms
        'income stocks': ['dividend', 'high yield'],
        'passive income': ['dividend', 'yield'],
        'cash flow': ['dividend', 'income'],
        'pays dividends': ['dividend paying', 'dividend'],
        'dividend payers': ['dividend stocks', 'dividend paying'],

        # Comparison synonyms
        'better than': ['compare to', 'vs'],
        'which is better': ['compare', 'vs'],
        'head to head': ['compare', 'vs'],
        'side by side': ['compare', 'vs'],
        'difference between': ['compare', 'vs'],
        'or': ['vs'],  # "AAPL or MSFT" -> comparison

        # Query intent synonyms
        'give me': ['show me', 'find'],
        'i want': ['show me', 'find'],
        'looking for': ['find', 'show me'],
        'get me': ['show me', 'find'],
        'search for': ['find', 'show me'],
        'list': ['show me', 'find'],
        'what are': ['show me', 'find'],

        # Driver/reason synonyms
        'behind': ['driving', 'causing'],
        'reason for': ['why', 'what is driving'],
        'how come': ['why'],
        'whats up with': ["what's driving", 'why'],
        'what happened to': ['why', "what's behind"],

        # Time synonyms
        'recently': ['last quarter', 'past months'],
        'lately': ['recently', 'last quarter'],
        'over the years': ['historical', 'over time'],
        'long term': ['5 year', 'multi-year'],
    }

    # Common company names to ticker mapping
    COMPANY_TO_TICKER = {
        'apple': 'AAPL',
        'microsoft': 'MSFT',
        'google': 'GOOGL',
        'alphabet': 'GOOGL',
        'amazon': 'AMZN',
        'meta': 'META',
        'facebook': 'META',
        'nvidia': 'NVDA',
        'tesla': 'TSLA',
        'netflix': 'NFLX',
        'adobe': 'ADBE',
        'salesforce': 'CRM',
        'intel': 'INTC',
        'amd': 'AMD',
        'advanced micro devices': 'AMD',
        'costco': 'COST',
        'walmart': 'WMT',
        'target': 'TGT',
        'jpmorgan': 'JPM',
        'jp morgan': 'JPM',
        'goldman sachs': 'GS',
        'goldman': 'GS',
        'berkshire': 'BRK.B',
        'berkshire hathaway': 'BRK.B',
        'johnson & johnson': 'JNJ',
        'j&j': 'JNJ',
        'procter & gamble': 'PG',
        'p&g': 'PG',
        'coca cola': 'KO',
        'coke': 'KO',
        'pepsi': 'PEP',
        'pepsico': 'PEP',
        'disney': 'DIS',
        'walt disney': 'DIS',
        'nike': 'NKE',
        'starbucks': 'SBUX',
        'mcdonalds': 'MCD',
        "mcdonald's": 'MCD',
        'visa': 'V',
        'mastercard': 'MA',
        'paypal': 'PYPL',
        'boeing': 'BA',
        'caterpillar': 'CAT',
        '3m': 'MMM',
        'home depot': 'HD',
        'lowes': 'LOW',
        "lowe's": 'LOW',
        'at&t': 'T',
        'verizon': 'VZ',
        't-mobile': 'TMUS',
        'comcast': 'CMCSA',
        'uber': 'UBER',
        'airbnb': 'ABNB',
        'palantir': 'PLTR',
        'snowflake': 'SNOW',
        'crowdstrike': 'CRWD',
        'datadog': 'DDOG',
        'zoom': 'ZM',
        'shopify': 'SHOP',
        'square': 'SQ',
        'block': 'SQ',
        'spotify': 'SPOT',
        'pinterest': 'PINS',
        'snap': 'SNAP',
        'snapchat': 'SNAP',
        'twitter': 'X',
        'coinbase': 'COIN',
        'robinhood': 'HOOD',
        'eli lilly': 'LLY',
        'lilly': 'LLY',
        'pfizer': 'PFE',
        'merck': 'MRK',
        'abbvie': 'ABBV',
        'unitedhealth': 'UNH',
        'united health': 'UNH',
        'chevron': 'CVX',
        'exxon': 'XOM',
        'exxonmobil': 'XOM',
        'conocophillips': 'COP',
    }

    # Fuzzy match threshold
    FUZZY_THRESHOLD = 0.8

    def __init__(self, router=None, db=None):
        """
        Args:
            router: LLM router for complex classification
            db: Database connection for company name lookup
        """
        self.router = router
        self.db = db
        self._compile_patterns()
        self._build_synonym_index()

    def _build_synonym_index(self):
        """Build a reverse index for synonym lookup"""
        self.synonym_reverse = {}
        for canonical, synonyms in self.SYNONYMS.items():
            for syn in synonyms:
                if syn not in self.synonym_reverse:
                    self.synonym_reverse[syn] = []
                self.synonym_reverse[syn].append(canonical)

    def _expand_synonyms(self, query: str) -> str:
        """
        Expand synonyms in query to improve pattern matching.

        E.g., "cheap stocks" -> "cheap undervalued stocks"
        """
        query_lower = query.lower()
        expanded = query_lower

        # Expand each synonym found in the query
        for term, expansions in self.SYNONYMS.items():
            if term in query_lower:
                # Add the first canonical expansion to help pattern matching
                if expansions:
                    expanded = expanded + f' {expansions[0]}'

        return expanded

    def _resolve_company_names(self, query: str) -> Tuple[str, List[str]]:
        """
        Resolve company names to ticker symbols.

        Returns:
            Tuple of (modified query with tickers, list of resolved tickers)
        """
        query_lower = query.lower()
        resolved_tickers = []
        modified_query = query

        # Check static company name mappings
        for company_name, ticker in self.COMPANY_TO_TICKER.items():
            if company_name in query_lower:
                resolved_tickers.append(ticker)
                # Add ticker to query for pattern matching
                modified_query = modified_query + f' {ticker}'

        # Try fuzzy matching on company names
        words = query_lower.split()
        for word in words:
            if len(word) > 3:  # Only try fuzzy match on longer words
                matches = get_close_matches(
                    word,
                    list(self.COMPANY_TO_TICKER.keys()),
                    n=1,
                    cutoff=self.FUZZY_THRESHOLD
                )
                if matches and matches[0] not in query_lower:
                    ticker = self.COMPANY_TO_TICKER[matches[0]]
                    if ticker not in resolved_tickers:
                        resolved_tickers.append(ticker)
                        modified_query = modified_query + f' {ticker}'

        # If database available, try to look up company names
        if self.db and not resolved_tickers:
            resolved_tickers.extend(self._db_company_lookup(query_lower))

        return modified_query, resolved_tickers

    def _db_company_lookup(self, query: str) -> List[str]:
        """Look up company names in the database"""
        try:
            cursor = self.db.cursor()
            # Extract potential company name phrases (2-3 word sequences)
            words = query.split()
            tickers = []

            for i in range(len(words)):
                for length in [3, 2, 1]:
                    if i + length <= len(words):
                        phrase = ' '.join(words[i:i+length])
                        if len(phrase) > 3:
                            # Search for company name
                            cursor.execute("""
                                SELECT symbol FROM companies
                                WHERE LOWER(name) LIKE ?
                                LIMIT 1
                            """, (f'%{phrase}%',))
                            row = cursor.fetchone()
                            if row and row[0] not in tickers:
                                tickers.append(row[0])

            return tickers
        except Exception as e:
            logger.warning(f"Database company lookup failed: {e}")
            return []

    def _correct_typos(self, query: str) -> str:
        """
        Attempt to correct common typos in investment terms.
        """
        corrections = {
            'divident': 'dividend',
            'dividned': 'dividend',
            'divdend': 'dividend',
            'reveue': 'revenue',
            'revnue': 'revenue',
            'reveneu': 'revenue',
            'margni': 'margin',
            'marign': 'margin',
            'earings': 'earnings',
            'earnigns': 'earnings',
            'grwoth': 'growth',
            'growht': 'growth',
            'valuaton': 'valuation',
            'vlauation': 'valuation',
            'comprae': 'compare',
            'comapre': 'compare',
            'similiar': 'similar',
            'simlar': 'similar',
            'histroical': 'historical',
            'historicla': 'historical',
            'porfolio': 'portfolio',
            'potfolio': 'portfolio',
            'techonology': 'technology',
            'tecnology': 'technology',
            'finacial': 'financial',
            'finanical': 'financial',
        }

        result = query.lower()
        for typo, correct in corrections.items():
            result = result.replace(typo, correct)

        return result

    def _compile_patterns(self):
        """Compile regex patterns for efficiency"""
        self.compiled_patterns = {}
        for intent, patterns in self.INTENT_PATTERNS.items():
            self.compiled_patterns[intent] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]

    def classify(self, query: str) -> ClassifiedQuery:
        """
        Classify a natural language query.

        Args:
            query: User's natural language query

        Returns:
            ClassifiedQuery with intent, entities, and parameters
        """
        original_query = query
        query_lower = query.lower().strip()

        # Step 0: Pre-process query
        # - Correct common typos
        query_corrected = self._correct_typos(query_lower)

        # - Resolve company names to tickers
        query_with_tickers, resolved_tickers = self._resolve_company_names(query_corrected)

        # - Expand synonyms for better pattern matching
        query_expanded = self._expand_synonyms(query_with_tickers)

        logger.debug(f"Query preprocessing: '{query}' -> '{query_expanded}'")

        # Step 1: Rule-based classification on expanded query
        intent, confidence = self._rule_based_classify(query_expanded)

        # If still low confidence, try original query
        if confidence < 0.4:
            orig_intent, orig_confidence = self._rule_based_classify(query_lower)
            if orig_confidence > confidence:
                intent, confidence = orig_intent, orig_confidence

        # Step 2: If low confidence and LLM available, use it
        if confidence < 0.5 and self.router:
            llm_intent, llm_confidence = self._llm_classify(query)
            if llm_confidence > confidence:
                intent, confidence = llm_intent, llm_confidence
                logger.info(f"LLM classification upgraded: {intent.value} ({llm_confidence:.2f})")

        # Step 3: Extract entities (use both original and expanded query)
        entities = self._extract_entities(query, query_expanded)

        # Add resolved company name tickers
        if resolved_tickers:
            for ticker in resolved_tickers:
                if ticker not in entities['symbols']:
                    entities['symbols'].append(ticker)
            # Store the company name -> ticker resolution for user feedback
            entities['company_name_resolutions'] = resolved_tickers

        # Step 4: Extract intent-specific parameters
        parameters = self._extract_parameters(query_expanded, intent, entities)

        # Step 5: Determine data requirements
        requires_data = self._determine_data_needs(intent, entities, parameters)

        return ClassifiedQuery(
            original_query=original_query,
            intent=intent,
            confidence=confidence,
            entities=entities,
            parameters=parameters,
            requires_data=requires_data
        )

    def _rule_based_classify(self, query: str) -> Tuple[QueryIntent, float]:
        """Classify using pattern matching with priority ordering"""
        scores = {}

        # Priority order: more specific intents checked first
        # This helps when multiple intents match
        PRIORITY_ORDER = [
            QueryIntent.RANKING,      # "top 10", "best" - very specific
            QueryIntent.COMPARE,      # "vs", "compare" - specific
            QueryIntent.SIMILARITY,   # "like", "similar" - specific
            QueryIntent.DRIVER,       # "driving", "behind" - specific
            QueryIntent.CALCULATION,  # "worth", "value at" - specific
            QueryIntent.HISTORICAL,   # "trend", "over time" - specific
            QueryIntent.SCREEN,       # "show me", "find" - common
            QueryIntent.EXPLANATION,  # "why" - can overlap
            QueryIntent.LOOKUP,       # Most general - last
        ]

        for intent, patterns in self.compiled_patterns.items():
            matches = []
            for pattern in patterns:
                match = pattern.search(query)
                if match:
                    # Weight by match length relative to query length
                    match_coverage = len(match.group(0)) / len(query)
                    matches.append(match_coverage)

            if matches:
                # Score considers: match count, coverage, and priority
                priority_bonus = 0.1 if intent in PRIORITY_ORDER[:6] else 0
                avg_coverage = sum(matches) / len(matches)
                match_ratio = len(matches) / len(patterns)

                # Combined score
                scores[intent] = min(
                    (match_ratio * 0.4) +
                    (avg_coverage * 0.4) +
                    (priority_bonus * 0.2 * len(matches)),
                    1.0
                )

        if not scores:
            return QueryIntent.UNKNOWN, 0.0

        # Get top scoring intents
        sorted_intents = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        # If top two are close, prefer higher priority intent
        if len(sorted_intents) >= 2:
            top_intent, top_score = sorted_intents[0]
            second_intent, second_score = sorted_intents[1]

            if top_score - second_score < 0.1:
                # Scores are close - check priority
                top_priority = PRIORITY_ORDER.index(top_intent) if top_intent in PRIORITY_ORDER else 10
                second_priority = PRIORITY_ORDER.index(second_intent) if second_intent in PRIORITY_ORDER else 10

                if second_priority < top_priority:
                    return second_intent, second_score

        best_intent = sorted_intents[0][0]
        return best_intent, sorted_intents[0][1]

    def _llm_classify(self, query: str) -> Tuple[QueryIntent, float]:
        """Classify using LLM for complex queries"""
        try:
            from ..ai.llm.base import TaskType

            prompt = f"""Classify this investment query into ONE of these intents and extract key entities.

INTENTS:
- SCREEN: Find stocks matching criteria (e.g., "show me undervalued tech stocks", "cheap tech companies")
- COMPARE: Compare two or more stocks (e.g., "compare AAPL to MSFT", "Apple vs Microsoft")
- HISTORICAL: Query about changes over time (e.g., "how has margin changed over 5 years", "trend since 2020")
- SIMILARITY: Find similar stocks (e.g., "find stocks like COST", "what's similar to Costco")
- DRIVER: Understand what's causing something (e.g., "what's driving NVDA's growth", "why is revenue up")
- RANKING: Get top/bottom lists (e.g., "top 10 dividend stocks", "best performing tech")
- LOOKUP: Get specific data points (e.g., "what's AAPL's P/E ratio", "Apple revenue")
- EXPLANATION: Understand why something is the case (e.g., "why is PE high", "explain the valuation")
- CALCULATION: Compute values or scenarios (e.g., "what would it be worth at 15x PE", "fair value")

QUERY: "{query}"

Respond with JSON only:
{{
  "intent": "SCREEN|COMPARE|HISTORICAL|SIMILARITY|DRIVER|RANKING|LOOKUP|EXPLANATION|CALCULATION",
  "confidence": 0.0-1.0,
  "symbols": ["AAPL"],  // extracted stock tickers
  "companies": ["Apple"],  // company names mentioned
  "metrics": ["pe_ratio", "revenue"],  // financial metrics
  "reasoning": "brief explanation"
}}

JSON:"""

            response = self.router.route(
                TaskType.QUERY_PARSING,
                prompt=prompt,
                temperature=0.1
            )

            content = response.content.strip()

            # Handle markdown code blocks
            if '```' in content:
                import re
                match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if match:
                    content = match.group(1)

            import json
            try:
                data = json.loads(content)
                intent_str = data.get('intent', 'UNKNOWN').upper()
                confidence = float(data.get('confidence', 0.85))

                # Find matching intent
                for intent in QueryIntent:
                    if intent.name == intent_str:
                        logger.info(f"LLM classified '{query[:50]}...' as {intent.name} ({confidence:.2f})")
                        return intent, min(confidence, 0.95)

                return QueryIntent.UNKNOWN, 0.3

            except json.JSONDecodeError:
                # Fallback: try to extract just the intent
                for intent in QueryIntent:
                    if intent.name in content.upper():
                        return intent, 0.75

                return QueryIntent.UNKNOWN, 0.3

        except Exception as e:
            logger.warning(f"LLM classification failed: {e}")
            return QueryIntent.UNKNOWN, 0.0

    def _extract_entities(self, query: str, query_lower: str) -> Dict:
        """Extract entities from query"""
        entities = {
            'symbols': [],
            'metrics': [],
            'sectors': [],
            'qualifiers': [],
            'numbers': [],
            'time_periods': [],
        }

        # Extract stock symbols (uppercase 1-5 letter words)
        symbol_pattern = r'\b[A-Z]{1,5}\b'
        potential_symbols = re.findall(symbol_pattern, query)
        entities['symbols'] = [
            s for s in potential_symbols
            if s not in self.COMMON_WORDS and len(s) >= 2
        ]

        # Extract metrics
        for metric_key, keywords in self.METRIC_KEYWORDS.items():
            for kw in keywords:
                if kw in query_lower:
                    if metric_key not in entities['metrics']:
                        entities['metrics'].append(metric_key)
                    break

        # Extract sectors
        for sector_key, keywords in self.SECTOR_KEYWORDS.items():
            for kw in keywords:
                if kw in query_lower:
                    if sector_key not in entities['sectors']:
                        entities['sectors'].append(sector_key)
                    break

        # Extract qualifiers
        for qual_key, keywords in self.QUALIFIER_KEYWORDS.items():
            for kw in keywords:
                if kw in query_lower:
                    if qual_key not in entities['qualifiers']:
                        entities['qualifiers'].append(qual_key)
                    break

        # Extract numbers with optional % or x suffix
        numbers = re.findall(r'\b(\d+(?:\.\d+)?)\s*(%|x|times)?\b', query_lower)
        entities['numbers'] = [(float(n[0]), n[1] if n[1] else None) for n in numbers]

        # Extract time periods
        time_patterns = [
            (r'(\d+)\s*years?', 'years'),
            (r'(\d+)\s*months?', 'months'),
            (r'(\d+)\s*quarters?', 'quarters'),
            (r'since\s*(\d{4})', 'since_year'),
            (r'from\s*(\d{4})', 'from_year'),
            (r'last\s*(\d+)\s*years?', 'years'),
            (r'past\s*(\d+)\s*years?', 'years'),
        ]
        for pattern, period_type in time_patterns:
            match = re.search(pattern, query_lower)
            if match:
                entities['time_periods'].append({
                    'type': period_type,
                    'value': int(match.group(1))
                })

        return entities

    def _extract_parameters(self, query: str, intent: QueryIntent, entities: Dict) -> Dict:
        """Extract intent-specific parameters"""
        params = {}

        if intent == QueryIntent.SCREEN:
            params['filters'] = self._build_screen_filters(query, entities)
            params['limit'] = self._extract_limit(query) or 50

        elif intent == QueryIntent.COMPARE:
            params['comparison_type'] = 'side_by_side'
            if any(t in query for t in ['over time', 'historical', 'trend']):
                params['comparison_type'] = 'historical'
            params['symbols'] = entities.get('symbols', [])

        elif intent == QueryIntent.HISTORICAL:
            params['time_range'] = self._extract_time_range(entities)
            params['metrics'] = entities.get('metrics', ['price'])

        elif intent == QueryIntent.SIMILARITY:
            params['similarity_factors'] = self._determine_similarity_factors(query)
            params['limit'] = self._extract_limit(query) or 10
            params['target_symbol'] = entities['symbols'][0] if entities.get('symbols') else None

        elif intent == QueryIntent.RANKING:
            params['sort_metric'] = entities['metrics'][0] if entities.get('metrics') else 'market_cap'
            params['sort_order'] = 'asc' if any(q in entities.get('qualifiers', []) for q in ['low', 'declining']) else 'desc'
            params['limit'] = self._extract_limit(query) or 10

        elif intent == QueryIntent.DRIVER:
            params['target_symbol'] = entities['symbols'][0] if entities.get('symbols') else None
            params['driver_type'] = self._extract_driver_type(query)

        elif intent == QueryIntent.LOOKUP:
            params['symbol'] = entities['symbols'][0] if entities.get('symbols') else None
            params['metrics'] = entities.get('metrics', [])

        return params

    def _build_screen_filters(self, query: str, entities: Dict) -> List[Dict]:
        """Build screening filters from query analysis"""
        filters = []

        # Add sector filter
        if entities.get('sectors'):
            filters.append({
                'field': 'sector',
                'operator': 'in',
                'value': entities['sectors']
            })

        # Handle common investment terms
        if 'undervalued' in query:
            filters.extend([
                {'field': 'pe_ratio', 'operator': '<', 'value': 15},
                {'field': 'pb_ratio', 'operator': '<', 'value': 2}
            ])
        elif 'overvalued' in query:
            filters.append({'field': 'pe_ratio', 'operator': '>', 'value': 30})

        if 'high dividend' in query or 'dividend' in query and 'high' in entities.get('qualifiers', []):
            filters.append({'field': 'dividend_yield', 'operator': '>', 'value': 0.03})

        if 'low debt' in query or ('debt' in query and 'low' in entities.get('qualifiers', [])):
            filters.append({'field': 'debt_to_equity', 'operator': '<', 'value': 0.5})

        if 'growing' in entities.get('qualifiers', []):
            if 'revenue' in entities.get('metrics', []) or 'revenue' in query:
                filters.append({'field': 'revenue_growth', 'operator': '>', 'value': 0.1})
            if 'dividend' in query:
                filters.append({'field': 'dividend_growth_5y', 'operator': '>', 'value': 0.05})
            if 'earnings' in query or 'earnings' in entities.get('metrics', []):
                filters.append({'field': 'earnings_growth', 'operator': '>', 'value': 0.1})

        if 'profitable' in query or 'profitability' in query:
            filters.append({'field': 'net_margin', 'operator': '>', 'value': 0.05})

        if 'quality' in query:
            filters.extend([
                {'field': 'roe', 'operator': '>', 'value': 0.15},
                {'field': 'debt_to_equity', 'operator': '<', 'value': 1.0}
            ])

        # Process qualifiers with metrics
        for metric in entities.get('metrics', []):
            for qualifier in entities.get('qualifiers', []):
                if qualifier == 'high':
                    filters.append({
                        'field': metric,
                        'operator': '>',
                        'value': self._get_high_threshold(metric)
                    })
                elif qualifier == 'low':
                    filters.append({
                        'field': metric,
                        'operator': '<',
                        'value': self._get_low_threshold(metric)
                    })

        return filters

    def _get_high_threshold(self, metric: str) -> float:
        """Get 'high' threshold for a metric"""
        thresholds = {
            'dividend_yield': 0.03,
            'pe_ratio': 25,
            'pb_ratio': 3,
            'roe': 0.20,
            'roic': 0.15,
            'gross_margin': 0.40,
            'net_margin': 0.15,
            'operating_margin': 0.20,
            'revenue_growth': 0.15,
            'earnings_growth': 0.15,
        }
        return thresholds.get(metric, 0)

    def _get_low_threshold(self, metric: str) -> float:
        """Get 'low' threshold for a metric"""
        thresholds = {
            'dividend_yield': 0.01,
            'pe_ratio': 15,
            'pb_ratio': 1.5,
            'debt_to_equity': 0.5,
            'beta': 0.8,
        }
        return thresholds.get(metric, 0)

    def _extract_limit(self, query: str) -> Optional[int]:
        """Extract result limit from query"""
        patterns = [
            r'top\s*(\d+)',
            r'(\d+)\s*(?:best|worst|stocks?|companies)',
            r'first\s*(\d+)',
            r'limit\s*(?:to\s*)?(\d+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, query.lower())
            if match:
                return int(match.group(1))
        return None

    def _extract_time_range(self, entities: Dict) -> Dict:
        """Extract time range from entities"""
        time_periods = entities.get('time_periods', [])

        if not time_periods:
            return {'years': 5}  # Default 5 years

        period = time_periods[0]
        return {period['type']: period['value']}

    def _determine_similarity_factors(self, query: str) -> List[str]:
        """Determine factors for similarity search"""
        factors = []
        query_lower = query.lower()

        if any(w in query_lower for w in ['business', 'model', 'company', 'industry']):
            factors.append('business_model')
        if any(w in query_lower for w in ['financial', 'metrics', 'numbers', 'margin']):
            factors.append('financials')
        if any(w in query_lower for w in ['size', 'market cap', 'large', 'small']):
            factors.append('size')
        if any(w in query_lower for w in ['growth', 'growing']):
            factors.append('growth')
        if any(w in query_lower for w in ['valuation', 'value', 'cheap', 'expensive', 'pe', 'p/e']):
            factors.append('valuation')
        if any(w in query_lower for w in ['sector', 'industry']):
            factors.append('sector')

        return factors if factors else ['financials', 'valuation', 'growth', 'sector']

    def _extract_driver_type(self, query: str) -> str:
        """Extract what type of driver analysis is requested"""
        query_lower = query.lower()

        if 'revenue' in query_lower or 'sales' in query_lower:
            return 'revenue'
        elif 'margin' in query_lower or 'profitability' in query_lower:
            return 'margin'
        elif 'earnings' in query_lower or 'profit' in query_lower:
            return 'earnings'
        elif 'growth' in query_lower:
            return 'growth'
        elif 'price' in query_lower or 'stock' in query_lower:
            return 'price'

        return 'overall'

    def _determine_data_needs(self, intent: QueryIntent, entities: Dict, parameters: Dict) -> List[str]:
        """Determine what data sources are needed"""
        needs = set()

        if entities.get('symbols'):
            needs.add('company_data')

        intent_needs = {
            QueryIntent.SCREEN: {'screener', 'metrics'},
            QueryIntent.COMPARE: {'company_data', 'metrics'},
            QueryIntent.HISTORICAL: {'historical_data', 'time_series'},
            QueryIntent.SIMILARITY: {'company_data', 'sector_data', 'metrics'},
            QueryIntent.DRIVER: {'company_data', 'segment_data', 'historical_data'},
            QueryIntent.RANKING: {'screener', 'metrics'},
            QueryIntent.LOOKUP: {'company_data', 'metrics'},
            QueryIntent.EXPLANATION: {'company_data', 'metrics', 'historical_data'},
        }

        needs.update(intent_needs.get(intent, set()))

        if parameters.get('comparison_type') == 'historical':
            needs.add('historical_data')

        return list(needs)
