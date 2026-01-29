# src/services/nl/handlers/technical_handler.py
"""
Handler for technical analysis queries.

Supports queries like:
- "Is AAPL oversold?"
- "What's the RSI for NVDA?"
- "MACD signal for TSLA"
- "Is there a golden cross on MSFT?"
- "Support and resistance for GOOGL"
- "Technical analysis of AMD"
"""

import logging
import re
import aiohttp
import asyncio
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)


class TechnicalHandler:
    """Handle technical analysis queries"""

    # Technical indicators and their interpretations
    INDICATORS = {
        'rsi': {
            'name': 'RSI (Relative Strength Index)',
            'overbought': 70,
            'oversold': 30,
            'neutral_low': 40,
            'neutral_high': 60,
        },
        'macd': {
            'name': 'MACD',
        },
        'sma_20': {'name': '20-day SMA'},
        'sma_50': {'name': '50-day SMA'},
        'sma_200': {'name': '200-day SMA'},
        'ema_12': {'name': '12-day EMA'},
        'ema_26': {'name': '26-day EMA'},
        'atr': {'name': 'ATR (Average True Range)'},
        'bollinger': {'name': 'Bollinger Bands'},
        'stochastic': {'name': 'Stochastic Oscillator'},
        'obv': {'name': 'On-Balance Volume'},
        'vwap': {'name': 'VWAP'},
    }

    # Pattern detection keywords
    PATTERNS = {
        'oversold': ['oversold', 'extremely low', 'bottoming'],
        'overbought': ['overbought', 'extremely high', 'topping'],
        'golden_cross': ['golden cross', 'bullish crossover', '50 above 200'],
        'death_cross': ['death cross', 'bearish crossover', '50 below 200'],
        'bullish_macd': ['macd bullish', 'macd cross up', 'macd positive'],
        'bearish_macd': ['macd bearish', 'macd cross down', 'macd negative'],
        'support': ['support', 'support level', 'floor'],
        'resistance': ['resistance', 'resistance level', 'ceiling'],
        'breakout': ['breakout', 'breaking out', 'breaking above'],
        'breakdown': ['breakdown', 'breaking down', 'breaking below'],
    }

    # API base URL - use port 3000 (backend) not 3001 (frontend proxy)
    API_BASE = 'http://localhost:3000/api/trading'

    def __init__(self, db=None, router=None, api_base: str = None):
        """
        Initialize the technical handler.

        Args:
            db: Database connection
            router: LLM router (optional)
            api_base: API base URL override
        """
        self.db = db
        self.router = router
        if api_base:
            self.API_BASE = api_base

    async def handle(self, classified_query) -> Dict:
        """
        Handle a technical analysis query.

        Args:
            classified_query: ClassifiedQuery with intent, entities, etc.

        Returns:
            Result dictionary with technical data
        """
        query = classified_query.original_query.lower()
        symbols = classified_query.entities.get('symbols', [])
        symbol = symbols[0] if symbols else None

        if not symbol:
            return {
                'type': 'error',
                'message': 'Please specify a stock symbol for technical analysis.',
                'suggestions': [
                    "Try: 'Is AAPL oversold?'",
                    "Or: 'What's the RSI for NVDA?'",
                    "Or: 'Technical analysis of MSFT'",
                ],
            }

        # Detect what indicator/pattern is being asked about
        indicator = self._detect_indicator(query)
        pattern = self._detect_pattern(query)

        logger.info(f"Technical query: symbol={symbol}, indicator={indicator}, pattern={pattern}")

        try:
            # Fetch technical data
            tech_data = await self._get_technical_data(symbol)

            if not tech_data or tech_data.get('error'):
                return {
                    'type': 'error',
                    'symbol': symbol.upper(),
                    'message': f'Unable to get technical data for {symbol}',
                }

            # Format response based on what was asked
            if indicator:
                return self._format_indicator_response(symbol, indicator, tech_data, query)
            elif pattern:
                return self._format_pattern_response(symbol, pattern, tech_data, query)
            else:
                # Return full technical analysis
                return self._format_full_analysis(symbol, tech_data)

        except Exception as e:
            logger.error(f"Technical handler error: {e}")
            return {
                'type': 'error',
                'message': f'Failed to get technical data: {str(e)}',
            }

    def _detect_indicator(self, query: str) -> Optional[str]:
        """Detect which indicator is being asked about"""
        query_lower = query.lower()

        indicator_keywords = {
            'rsi': ['rsi', 'relative strength'],
            'macd': ['macd', 'moving average convergence'],
            'sma_20': ['20 day', '20-day', 'sma 20', '20 sma'],
            'sma_50': ['50 day', '50-day', 'sma 50', '50 sma'],
            'sma_200': ['200 day', '200-day', 'sma 200', '200 sma'],
            'atr': ['atr', 'average true range', 'volatility'],
            'bollinger': ['bollinger', 'bb', 'bands'],
            'stochastic': ['stochastic', 'stoch'],
            'obv': ['obv', 'on balance volume', 'on-balance'],
            'vwap': ['vwap', 'volume weighted'],
        }

        for indicator, keywords in indicator_keywords.items():
            for keyword in keywords:
                if keyword in query_lower:
                    return indicator

        return None

    def _detect_pattern(self, query: str) -> Optional[str]:
        """Detect which pattern is being asked about"""
        query_lower = query.lower()

        for pattern, keywords in self.PATTERNS.items():
            for keyword in keywords:
                if keyword in query_lower:
                    return pattern

        return None

    async def _fetch_api(self, endpoint: str, method: str = 'GET', data: Dict = None) -> Optional[Dict]:
        """Fetch data from the trading API"""
        url = f"{self.API_BASE}{endpoint}"

        try:
            async with aiohttp.ClientSession() as session:
                if method == 'GET':
                    async with session.get(url, timeout=10) as response:
                        if response.status == 200:
                            return await response.json()
                else:
                    async with session.post(url, json=data, timeout=10) as response:
                        if response.status == 200:
                            return await response.json()
                return None
        except Exception as e:
            logger.error(f"API error: {e}")
            return None

    async def _get_technical_data(self, symbol: str) -> Optional[Dict]:
        """Get technical signals data for a symbol"""
        return await self._fetch_api(f'/technical/{symbol.upper()}')

    def _format_indicator_response(
        self, symbol: str, indicator: str, tech_data: Dict, query: str
    ) -> Dict:
        """Format response for a specific indicator query"""
        indicators = tech_data.get('indicators', {})
        indicator_data = indicators.get(indicator, {})

        if not indicator_data:
            # Try alternative names
            alt_names = {
                'sma_20': 'sma20',
                'sma_50': 'sma50',
                'sma_200': 'sma200',
            }
            alt_name = alt_names.get(indicator, indicator)
            indicator_data = indicators.get(alt_name, {})

        indicator_info = self.INDICATORS.get(indicator, {'name': indicator.upper()})

        value = indicator_data.get('value') or indicator_data.get('current')
        interpretation = self._interpret_indicator(indicator, indicator_data, tech_data)

        return {
            'type': 'technical_indicator',
            'symbol': symbol.upper(),
            'indicator': indicator_info['name'],
            'value': value,
            'raw_data': indicator_data,
            'interpretation': interpretation,
            'overall_signal': tech_data.get('overallSignal', 'NEUTRAL'),
            'confidence': tech_data.get('confidence', 'medium'),
        }

    def _interpret_indicator(self, indicator: str, data: Dict, tech_data: Dict) -> str:
        """Generate interpretation for an indicator"""
        if indicator == 'rsi':
            value = data.get('value') or data.get('current', 50)
            info = self.INDICATORS['rsi']

            if value >= info['overbought']:
                return f"RSI at {value:.1f} indicates overbought conditions. The stock may be due for a pullback."
            elif value <= info['oversold']:
                return f"RSI at {value:.1f} indicates oversold conditions. This could be a buying opportunity."
            elif value >= info['neutral_high']:
                return f"RSI at {value:.1f} shows bullish momentum but not yet overbought."
            elif value <= info['neutral_low']:
                return f"RSI at {value:.1f} shows bearish momentum but not yet oversold."
            else:
                return f"RSI at {value:.1f} is in the neutral zone, indicating balanced momentum."

        elif indicator == 'macd':
            histogram = data.get('histogram', 0)
            signal_line = data.get('signal', 0)
            macd_line = data.get('macd', data.get('value', 0))

            if histogram > 0 and macd_line > signal_line:
                return "MACD is bullish - the MACD line is above the signal line with positive histogram."
            elif histogram < 0 and macd_line < signal_line:
                return "MACD is bearish - the MACD line is below the signal line with negative histogram."
            else:
                return "MACD is showing mixed signals. Watch for a potential crossover."

        elif indicator in ['sma_20', 'sma_50', 'sma_200', 'sma20', 'sma50', 'sma200']:
            price = tech_data.get('currentPrice', 0)
            sma_value = data.get('value') or data.get('current', 0)

            if price and sma_value:
                if price > sma_value:
                    pct_above = ((price - sma_value) / sma_value) * 100
                    return f"Price is {pct_above:.1f}% above the {indicator.upper()}, indicating bullish trend."
                else:
                    pct_below = ((sma_value - price) / sma_value) * 100
                    return f"Price is {pct_below:.1f}% below the {indicator.upper()}, indicating bearish trend."

        elif indicator == 'atr':
            value = data.get('value', 0)
            pct_of_price = data.get('percentOfPrice', 0)
            return f"ATR is {value:.2f} ({pct_of_price:.1f}% of price), indicating {'high' if pct_of_price > 3 else 'moderate' if pct_of_price > 1.5 else 'low'} volatility."

        return f"{indicator.upper()}: {data.get('value', 'N/A')}"

    def _format_pattern_response(
        self, symbol: str, pattern: str, tech_data: Dict, query: str
    ) -> Dict:
        """Format response for a pattern query (oversold, golden cross, etc.)"""
        indicators = tech_data.get('indicators', {})
        signals = tech_data.get('signals', {})

        result = {
            'type': 'technical_pattern',
            'symbol': symbol.upper(),
            'pattern': pattern.replace('_', ' ').title(),
            'detected': False,
            'interpretation': '',
            'overall_signal': tech_data.get('overallSignal', 'NEUTRAL'),
        }

        if pattern == 'oversold':
            rsi = indicators.get('rsi', {}).get('value', 50)
            if rsi <= 30:
                result['detected'] = True
                result['interpretation'] = f"Yes, {symbol} appears oversold with RSI at {rsi:.1f}. This could indicate a potential buying opportunity, but confirm with other indicators."
            else:
                result['detected'] = False
                result['interpretation'] = f"No, {symbol} is not currently oversold. RSI is at {rsi:.1f}."
            result['rsi'] = rsi

        elif pattern == 'overbought':
            rsi = indicators.get('rsi', {}).get('value', 50)
            if rsi >= 70:
                result['detected'] = True
                result['interpretation'] = f"Yes, {symbol} appears overbought with RSI at {rsi:.1f}. The stock may be due for a pullback."
            else:
                result['detected'] = False
                result['interpretation'] = f"No, {symbol} is not currently overbought. RSI is at {rsi:.1f}."
            result['rsi'] = rsi

        elif pattern == 'golden_cross':
            sma50 = indicators.get('sma50', {}).get('value') or indicators.get('sma_50', {}).get('value', 0)
            sma200 = indicators.get('sma200', {}).get('value') or indicators.get('sma_200', {}).get('value', 0)

            if sma50 and sma200:
                if sma50 > sma200:
                    result['detected'] = True
                    result['interpretation'] = f"Yes, the 50-day SMA (${sma50:.2f}) is above the 200-day SMA (${sma200:.2f}), indicating a golden cross pattern - a bullish signal."
                else:
                    result['detected'] = False
                    result['interpretation'] = f"No golden cross currently. The 50-day SMA (${sma50:.2f}) is below the 200-day SMA (${sma200:.2f})."

        elif pattern == 'death_cross':
            sma50 = indicators.get('sma50', {}).get('value') or indicators.get('sma_50', {}).get('value', 0)
            sma200 = indicators.get('sma200', {}).get('value') or indicators.get('sma_200', {}).get('value', 0)

            if sma50 and sma200:
                if sma50 < sma200:
                    result['detected'] = True
                    result['interpretation'] = f"Yes, the 50-day SMA (${sma50:.2f}) is below the 200-day SMA (${sma200:.2f}), indicating a death cross pattern - a bearish signal."
                else:
                    result['detected'] = False
                    result['interpretation'] = f"No death cross currently. The 50-day SMA (${sma50:.2f}) is above the 200-day SMA (${sma200:.2f})."

        elif pattern == 'bullish_macd':
            macd = indicators.get('macd', {})
            histogram = macd.get('histogram', 0)

            if histogram > 0:
                result['detected'] = True
                result['interpretation'] = "MACD is showing bullish momentum with a positive histogram."
            else:
                result['detected'] = False
                result['interpretation'] = "MACD is not currently bullish. Histogram is negative or neutral."

        elif pattern == 'bearish_macd':
            macd = indicators.get('macd', {})
            histogram = macd.get('histogram', 0)

            if histogram < 0:
                result['detected'] = True
                result['interpretation'] = "MACD is showing bearish momentum with a negative histogram."
            else:
                result['detected'] = False
                result['interpretation'] = "MACD is not currently bearish. Histogram is positive or neutral."

        elif pattern in ['support', 'resistance']:
            # Support/resistance from signals if available
            support = signals.get('support', tech_data.get('support'))
            resistance = signals.get('resistance', tech_data.get('resistance'))
            price = tech_data.get('currentPrice', 0)

            if pattern == 'support':
                if support:
                    result['detected'] = True
                    result['value'] = support
                    result['interpretation'] = f"Support level identified at ${support:.2f}. Current price: ${price:.2f}."
                else:
                    result['interpretation'] = "Support levels not calculated for this analysis."
            else:
                if resistance:
                    result['detected'] = True
                    result['value'] = resistance
                    result['interpretation'] = f"Resistance level identified at ${resistance:.2f}. Current price: ${price:.2f}."
                else:
                    result['interpretation'] = "Resistance levels not calculated for this analysis."

        return result

    def _format_full_analysis(self, symbol: str, tech_data: Dict) -> Dict:
        """Format a complete technical analysis response"""
        indicators = tech_data.get('indicators', {})
        signals = tech_data.get('signals', {})

        # Extract key indicators - handle both dict and float formats
        rsi = indicators.get('rsi', {})
        macd = indicators.get('macd', {})

        # SMA values can be dicts with 'value' key or direct floats
        sma20_raw = indicators.get('sma20', indicators.get('sma_20'))
        sma50_raw = indicators.get('sma50', indicators.get('sma_50'))
        sma200_raw = indicators.get('sma200', indicators.get('sma_200'))
        atr_raw = indicators.get('atr')

        # Helper to extract value from either dict or float
        def get_value(raw, default=0):
            if raw is None:
                return default
            if isinstance(raw, (int, float)):
                return raw
            if isinstance(raw, dict):
                return raw.get('value', raw.get('current', default))
            return default

        # Determine RSI condition
        rsi_value = get_value(rsi, 50)
        if rsi_value >= 70:
            rsi_condition = 'Overbought'
        elif rsi_value <= 30:
            rsi_condition = 'Oversold'
        else:
            rsi_condition = 'Neutral'

        # Determine trend from moving averages
        price = tech_data.get('currentPrice', 0)
        sma50_val = get_value(sma50_raw, 0)
        sma200_val = get_value(sma200_raw, 0)

        trend = 'Neutral'
        if price and sma50_val and sma200_val:
            if price > sma50_val > sma200_val:
                trend = 'Strong Uptrend'
            elif price > sma50_val and price > sma200_val:
                trend = 'Uptrend'
            elif price < sma50_val < sma200_val:
                trend = 'Strong Downtrend'
            elif price < sma50_val and price < sma200_val:
                trend = 'Downtrend'

        # MACD signal
        macd_histogram = macd.get('histogram', 0)
        macd_signal = 'Bullish' if macd_histogram > 0 else 'Bearish' if macd_histogram < 0 else 'Neutral'

        # Overall signal
        overall_signal = tech_data.get('overallSignal', 'NEUTRAL')
        confidence = tech_data.get('confidence', 'medium')

        # Generate interpretation
        interpretation = self._generate_full_interpretation(
            symbol, overall_signal, trend, rsi_condition, macd_signal, price, sma50_val, sma200_val
        )

        return {
            'type': 'technical_analysis',
            'symbol': symbol.upper(),
            'current_price': price,
            'overall_signal': overall_signal,
            'confidence': confidence,
            'trend': trend,
            'indicators': {
                'rsi': {
                    'value': round(rsi_value, 1),
                    'condition': rsi_condition,
                    'interpretation': f"RSI at {rsi_value:.1f} - {rsi_condition}",
                },
                'macd': {
                    'histogram': round(macd_histogram, 4) if macd_histogram else None,
                    'signal': macd_signal,
                    'interpretation': f"MACD histogram: {macd_histogram:.4f} - {macd_signal}",
                },
                'moving_averages': {
                    'sma_20': round(get_value(sma20_raw), 2) if sma20_raw else None,
                    'sma_50': round(sma50_val, 2) if sma50_val else None,
                    'sma_200': round(sma200_val, 2) if sma200_val else None,
                    'trend': trend,
                },
                'volatility': {
                    'atr': round(get_value(atr_raw), 2) if atr_raw else None,
                    'atr_percent': round(atr_raw.get('percentOfPrice', 0), 2) if isinstance(atr_raw, dict) and atr_raw.get('percentOfPrice') else None,
                },
            },
            'signals': signals,
            'interpretation': interpretation,
        }

    def _generate_full_interpretation(
        self,
        symbol: str,
        overall_signal: str,
        trend: str,
        rsi_condition: str,
        macd_signal: str,
        price: float,
        sma50: float,
        sma200: float,
    ) -> str:
        """Generate a comprehensive interpretation"""
        parts = []

        # Overall assessment
        if overall_signal == 'STRONG_BUY':
            parts.append(f"{symbol} shows strong bullish technical signals")
        elif overall_signal == 'BUY':
            parts.append(f"{symbol} shows bullish technical signals")
        elif overall_signal == 'STRONG_SELL':
            parts.append(f"{symbol} shows strong bearish technical signals")
        elif overall_signal == 'SELL':
            parts.append(f"{symbol} shows bearish technical signals")
        else:
            parts.append(f"{symbol} shows mixed technical signals")

        # Trend
        if 'Uptrend' in trend:
            parts.append(f"The stock is in an {trend.lower()} trading above key moving averages")
        elif 'Downtrend' in trend:
            parts.append(f"The stock is in a {trend.lower()} trading below key moving averages")

        # RSI
        if rsi_condition == 'Oversold':
            parts.append("RSI indicates oversold conditions which may present a buying opportunity")
        elif rsi_condition == 'Overbought':
            parts.append("RSI indicates overbought conditions which may suggest caution")

        # MACD
        if macd_signal == 'Bullish':
            parts.append("MACD confirms bullish momentum")
        elif macd_signal == 'Bearish':
            parts.append("MACD indicates bearish momentum")

        # Golden/Death cross
        if sma50 and sma200:
            if sma50 > sma200:
                parts.append("Golden cross pattern (50 SMA > 200 SMA) supports bullish outlook")
            else:
                parts.append("Death cross pattern (50 SMA < 200 SMA) suggests caution")

        return '. '.join(parts) + '.'
