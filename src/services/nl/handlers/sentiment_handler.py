# src/services/nl/handlers/sentiment_handler.py
"""
Handler for sentiment and news queries.

Supports queries like:
- "What's the sentiment on AAPL?"
- "Any news about Tesla?"
- "Is NVDA bullish or bearish?"
- "What's trending on Reddit?"
- "Show analyst ratings for MSFT"
- "Insider activity for Apple"
"""

import logging
import re
import aiohttp
import asyncio
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class SentimentHandler:
    """Handle sentiment, news, and social media queries"""

    # Query type detection patterns
    QUERY_TYPES = {
        'combined': ['sentiment', 'feeling', 'mood', 'overall'],
        'news': ['news', 'headlines', 'articles', 'press', 'stories'],
        'social': ['reddit', 'stocktwits', 'twitter', 'social'],
        'trending': ['trending', 'popular', 'hot', 'buzzing', 'viral'],
        'analyst': ['analyst', 'rating', 'upgrade', 'downgrade', 'target', 'consensus'],
        'insider': ['insider', 'form 4', 'bought', 'sold', 'buying', 'selling'],
        'market': ['market sentiment', 'fear', 'greed', 'vix', 'market mood'],
    }

    # API base URL - use port 3000 (backend) not 3001 (frontend proxy)
    API_BASE = 'http://localhost:3000/api/sentiment'

    def __init__(self, db=None, router=None, api_base: str = None):
        """
        Initialize the sentiment handler.

        Args:
            db: Database connection
            router: LLM router (optional, for enhanced responses)
            api_base: API base URL override
        """
        self.db = db
        self.router = router
        if api_base:
            self.API_BASE = api_base

    async def handle(self, classified_query) -> Dict:
        """
        Handle a sentiment query.

        Args:
            classified_query: ClassifiedQuery with intent, entities, etc.

        Returns:
            Result dictionary with sentiment data
        """
        query = classified_query.original_query.lower()
        symbols = classified_query.entities.get('symbols', [])
        symbol = symbols[0] if symbols else None

        # Detect query type
        query_type = self._detect_query_type(query)

        logger.info(f"Sentiment query type: {query_type}, symbol: {symbol}")

        try:
            if query_type == 'trending':
                return await self._get_trending()
            elif query_type == 'market':
                return await self._get_market_sentiment()
            elif not symbol:
                # No symbol specified, return general sentiment overview
                return await self._get_sentiment_overview()

            # Symbol-specific queries
            if query_type == 'combined' or query_type == 'social':
                return await self._get_combined_sentiment(symbol)
            elif query_type == 'news':
                return await self._get_news_sentiment(symbol)
            elif query_type == 'analyst':
                return await self._get_analyst_sentiment(symbol)
            elif query_type == 'insider':
                return await self._get_insider_activity(symbol)
            else:
                # Default to combined sentiment
                return await self._get_combined_sentiment(symbol)

        except Exception as e:
            logger.error(f"Sentiment handler error: {e}")
            return {
                'type': 'error',
                'message': f'Failed to get sentiment data: {str(e)}',
                'query': classified_query.original_query,
            }

    def _detect_query_type(self, query: str) -> str:
        """Detect what type of sentiment query this is"""
        query_lower = query.lower()

        for query_type, keywords in self.QUERY_TYPES.items():
            for keyword in keywords:
                if keyword in query_lower:
                    return query_type

        return 'combined'  # Default

    async def _fetch_api(self, endpoint: str, params: Dict = None) -> Optional[Dict]:
        """Fetch data from the sentiment API"""
        url = f"{self.API_BASE}{endpoint}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.warning(f"API returned {response.status} for {endpoint}")
                        return None
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching {endpoint}")
            return None
        except Exception as e:
            logger.error(f"Error fetching {endpoint}: {e}")
            return None

    async def _get_combined_sentiment(self, symbol: str) -> Dict:
        """Get combined multi-source sentiment for a stock"""
        data = await self._fetch_api(f'/{symbol}/combined')

        if not data:
            # Fall back to database if API unavailable
            return await self._get_sentiment_from_db(symbol)

        # Format response
        combined = data.get('combined', {})
        sources = data.get('sources', {})

        # Determine overall signal
        overall_score = combined.get('score', 0)
        if overall_score > 0.1:
            signal = 'Bullish'
        elif overall_score < -0.1:
            signal = 'Bearish'
        else:
            signal = 'Neutral'

        return {
            'type': 'sentiment_analysis',
            'symbol': symbol.upper(),
            'name': data.get('name', symbol),
            'overall_signal': signal,
            'sentiment_score': round(overall_score, 3),
            'confidence': combined.get('confidence', 'medium'),
            'sources': self._format_sources(sources),
            'sources_used': combined.get('sourcesUsed', []),
            'interpretation': self._generate_sentiment_interpretation(
                symbol, overall_score, sources
            ),
            'updated_at': data.get('timestamp'),
        }

    def _format_sources(self, sources: Dict) -> Dict:
        """Format source data for display"""
        formatted = {}

        if sources.get('reddit'):
            reddit = sources['reddit']
            formatted['reddit'] = {
                'sentiment': round(reddit.get('sentiment', 0), 3),
                'post_count': reddit.get('postCount', 0),
                'signal': self._score_to_signal(reddit.get('sentiment', 0)),
            }

        if sources.get('stocktwits'):
            st = sources['stocktwits']
            formatted['stocktwits'] = {
                'sentiment': round(st.get('sentiment', 0), 3),
                'message_count': st.get('messageCount', 0),
                'bullish_pct': st.get('bullishPercent', 0),
                'signal': self._score_to_signal(st.get('sentiment', 0)),
            }

        if sources.get('news'):
            news = sources['news']
            formatted['news'] = {
                'sentiment': round(news.get('sentiment', 0), 3),
                'article_count': news.get('articleCount', 0),
                'signal': self._score_to_signal(news.get('sentiment', 0)),
            }

        if sources.get('analyst'):
            analyst = sources['analyst']
            formatted['analyst'] = {
                'buy_percent': analyst.get('buyPercent', 0),
                'target_price': analyst.get('targetPrice'),
                'upside': analyst.get('upsidePotential'),
                'recommendation': analyst.get('recommendation', 'N/A'),
            }

        return formatted

    def _score_to_signal(self, score: float) -> str:
        """Convert sentiment score to signal label"""
        if score > 0.15:
            return 'Strong Bullish'
        elif score > 0.05:
            return 'Bullish'
        elif score < -0.15:
            return 'Strong Bearish'
        elif score < -0.05:
            return 'Bearish'
        else:
            return 'Neutral'

    def _generate_sentiment_interpretation(
        self, symbol: str, score: float, sources: Dict
    ) -> str:
        """Generate a human-readable interpretation"""
        parts = []

        if score > 0.1:
            parts.append(f"{symbol} shows bullish sentiment")
        elif score < -0.1:
            parts.append(f"{symbol} shows bearish sentiment")
        else:
            parts.append(f"{symbol} shows mixed/neutral sentiment")

        # Add source highlights
        if sources.get('reddit', {}).get('postCount', 0) > 10:
            reddit_sentiment = sources['reddit'].get('sentiment', 0)
            parts.append(f"Reddit ({sources['reddit']['postCount']} posts) is {'positive' if reddit_sentiment > 0 else 'negative'}")

        if sources.get('analyst', {}).get('buyPercent'):
            buy_pct = sources['analyst']['buyPercent']
            if buy_pct >= 70:
                parts.append(f"Analysts are bullish ({buy_pct}% buy)")
            elif buy_pct <= 30:
                parts.append(f"Analysts are cautious ({buy_pct}% buy)")

        return '. '.join(parts) + '.'

    async def _get_news_sentiment(self, symbol: str) -> Dict:
        """Get news sentiment for a stock"""
        data = await self._fetch_api(f'/{symbol}/news')

        if not data:
            return {
                'type': 'news_sentiment',
                'symbol': symbol.upper(),
                'message': 'No news data available',
                'articles': [],
            }

        articles = data.get('articles', [])
        summary = data.get('summary', {})

        # Format articles for display
        formatted_articles = []
        for article in articles[:10]:  # Limit to 10
            formatted_articles.append({
                'title': article.get('title', 'Untitled'),
                'source': article.get('source', 'Unknown'),
                'sentiment': round(article.get('sentiment_score', 0), 2),
                'published': article.get('published_at'),
                'url': article.get('url'),
            })

        return {
            'type': 'news_sentiment',
            'symbol': symbol.upper(),
            'overall_sentiment': self._score_to_signal(summary.get('avgSentiment', 0)),
            'article_count': summary.get('articleCount', len(articles)),
            'avg_sentiment': round(summary.get('avgSentiment', 0), 3),
            'articles': formatted_articles,
            'interpretation': f"Found {len(formatted_articles)} recent news articles for {symbol}. "
                             f"Overall news sentiment is {self._score_to_signal(summary.get('avgSentiment', 0)).lower()}.",
        }

    async def _get_analyst_sentiment(self, symbol: str) -> Dict:
        """Get analyst ratings and estimates"""
        data = await self._fetch_api(f'/{symbol}/analyst')

        if not data:
            return {
                'type': 'analyst_sentiment',
                'symbol': symbol.upper(),
                'message': 'No analyst data available',
            }

        return {
            'type': 'analyst_sentiment',
            'symbol': symbol.upper(),
            'name': data.get('name', symbol),
            'recommendation': data.get('recommendationKey', 'N/A'),
            'target_price': {
                'mean': data.get('targetMean'),
                'high': data.get('targetHigh'),
                'low': data.get('targetLow'),
            },
            'current_price': data.get('currentPrice'),
            'upside_potential': data.get('upsidePotential'),
            'num_analysts': data.get('numberOfAnalysts', 0),
            'buy_percent': data.get('buyPercent', 0),
            'rating_distribution': {
                'strong_buy': data.get('strongBuy', 0),
                'buy': data.get('buy', 0),
                'hold': data.get('hold', 0),
                'sell': data.get('sell', 0),
                'strong_sell': data.get('strongSell', 0),
            },
            'signal': data.get('signal', 'Neutral'),
            'interpretation': self._generate_analyst_interpretation(data),
        }

    def _generate_analyst_interpretation(self, data: Dict) -> str:
        """Generate analyst interpretation"""
        parts = []
        symbol = data.get('symbol', 'Stock')

        buy_pct = data.get('buyPercent', 0)
        if buy_pct >= 80:
            parts.append(f"Strong analyst consensus with {buy_pct}% rating Buy or better")
        elif buy_pct >= 60:
            parts.append(f"Positive analyst sentiment with {buy_pct}% rating Buy or better")
        elif buy_pct <= 30:
            parts.append(f"Cautious analyst sentiment with only {buy_pct}% rating Buy")
        else:
            parts.append(f"Mixed analyst opinions ({buy_pct}% Buy)")

        upside = data.get('upsidePotential')
        if upside:
            if upside > 20:
                parts.append(f"Target implies {upside:.1f}% upside")
            elif upside < -10:
                parts.append(f"Target implies {abs(upside):.1f}% downside")

        return '. '.join(parts) + '.' if parts else 'Analyst data available.'

    async def _get_insider_activity(self, symbol: str) -> Dict:
        """Get insider trading activity"""
        # Get overall insider activity (symbol-specific would need additional endpoint)
        data = await self._fetch_api('/insider-activity', {'days': 30})

        if not data:
            return {
                'type': 'insider_activity',
                'symbol': symbol.upper(),
                'message': 'No insider data available',
            }

        # Filter for the specific symbol
        buys = [b for b in data.get('significantBuys', []) if b.get('symbol') == symbol.upper()]
        sells = [s for s in data.get('significantSells', []) if s.get('symbol') == symbol.upper()]

        # Also check net buying/selling lists
        net_buying = [n for n in data.get('netBuying', []) if n.get('symbol') == symbol.upper()]
        net_selling = [n for n in data.get('netSelling', []) if n.get('symbol') == symbol.upper()]

        signal = 'Neutral'
        if net_buying:
            signal = 'Bullish'
        elif net_selling:
            signal = 'Bearish'

        return {
            'type': 'insider_activity',
            'symbol': symbol.upper(),
            'signal': signal,
            'significant_buys': buys[:5],
            'significant_sells': sells[:5],
            'net_position': net_buying[0] if net_buying else (net_selling[0] if net_selling else None),
            'interpretation': self._generate_insider_interpretation(symbol, buys, sells, net_buying, net_selling),
        }

    def _generate_insider_interpretation(
        self, symbol: str, buys: List, sells: List, net_buying: List, net_selling: List
    ) -> str:
        """Generate insider activity interpretation"""
        if net_buying:
            return f"Insiders at {symbol} have been net buyers recently, which is typically a bullish signal."
        elif net_selling:
            return f"Insiders at {symbol} have been net sellers recently. This may warrant caution."
        elif buys and not sells:
            return f"Some insider buying activity detected for {symbol}."
        elif sells and not buys:
            return f"Some insider selling activity detected for {symbol}."
        else:
            return f"Limited or no recent insider activity for {symbol}."

    async def _get_trending(self) -> Dict:
        """Get trending stocks from social media"""
        data = await self._fetch_api('/trending', {'period': '24h', 'limit': 20})

        if not data:
            return {
                'type': 'trending_sentiment',
                'message': 'Unable to fetch trending data',
                'trending': [],
            }

        trending = data.get('trending', [])

        formatted = []
        for t in trending[:15]:
            formatted.append({
                'symbol': t.get('symbol'),
                'name': t.get('companyName', t.get('symbol')),
                'mention_count': t.get('mentionCount', 0),
                'sentiment': round(t.get('avgSentiment', 0), 3),
                'signal': self._score_to_signal(t.get('avgSentiment', 0)),
            })

        return {
            'type': 'trending_sentiment',
            'period': '24h',
            'count': len(formatted),
            'trending': formatted,
            'interpretation': f"Found {len(formatted)} trending stocks on social media. "
                             f"Most mentioned: {', '.join([t['symbol'] for t in formatted[:5]])}.",
        }

    async def _get_market_sentiment(self) -> Dict:
        """Get overall market sentiment (Fear & Greed, VIX)"""
        data = await self._fetch_api('/market')

        if not data:
            return {
                'type': 'market_sentiment',
                'message': 'Unable to fetch market sentiment',
            }

        cnn = data.get('cnn', {})
        vix = data.get('vix', {})
        overall = data.get('overall', {})

        # Determine market mood
        fg_value = cnn.get('value', 50)
        if fg_value >= 75:
            mood = 'Extreme Greed'
        elif fg_value >= 55:
            mood = 'Greed'
        elif fg_value <= 25:
            mood = 'Extreme Fear'
        elif fg_value <= 45:
            mood = 'Fear'
        else:
            mood = 'Neutral'

        return {
            'type': 'market_sentiment',
            'fear_greed': {
                'value': fg_value,
                'label': cnn.get('label', mood),
                'previous_close': cnn.get('previousClose'),
            },
            'vix': {
                'value': vix.get('value'),
                'change': vix.get('change'),
            },
            'overall_mood': mood,
            'interpretation': f"Market sentiment is at {mood} levels. "
                             f"Fear & Greed Index: {fg_value}/100. "
                             + (f"VIX: {vix.get('value', 'N/A')}" if vix.get('value') else ''),
        }

    async def _get_sentiment_overview(self) -> Dict:
        """Get general sentiment overview when no symbol specified"""
        # Get trending and market sentiment in parallel
        trending_task = self._get_trending()
        market_task = self._get_market_sentiment()

        trending, market = await asyncio.gather(trending_task, market_task)

        return {
            'type': 'sentiment_overview',
            'market': market,
            'trending': trending.get('trending', [])[:10],
            'interpretation': f"Market mood: {market.get('overall_mood', 'Unknown')}. "
                             f"Top trending: {', '.join([t['symbol'] for t in trending.get('trending', [])[:5]])}.",
        }

    async def _get_sentiment_from_db(self, symbol: str) -> Dict:
        """Fallback: Get sentiment directly from database"""
        if not self.db:
            return {
                'type': 'error',
                'message': f'No sentiment data available for {symbol}',
            }

        try:
            cursor = self.db.cursor()

            # Get company data with sentiment
            cursor.execute("""
                SELECT
                    c.symbol, c.name,
                    c.sentiment_signal, c.sentiment_score, c.sentiment_confidence,
                    c.reddit_mentions_24h, c.combined_sentiment
                FROM companies c
                WHERE c.symbol = ?
            """, (symbol.upper(),))

            row = cursor.fetchone()
            if not row:
                return {
                    'type': 'error',
                    'message': f'Company not found: {symbol}',
                }

            return {
                'type': 'sentiment_analysis',
                'symbol': row[0],
                'name': row[1],
                'overall_signal': row[2] or 'Neutral',
                'sentiment_score': row[3] or 0,
                'confidence': row[4] or 'low',
                'reddit_mentions': row[5] or 0,
                'combined_sentiment': row[6] or 0,
                'source': 'database',
                'interpretation': f"{row[0]} sentiment from database: {row[2] or 'Unknown'}.",
            }

        except Exception as e:
            logger.error(f"Database sentiment lookup failed: {e}")
            return {
                'type': 'error',
                'message': f'Failed to get sentiment for {symbol}: {str(e)}',
            }
