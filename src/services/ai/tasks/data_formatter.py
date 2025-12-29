# src/services/ai/tasks/data_formatter.py

from typing import Dict, List, Any, Optional
from datetime import datetime


class DataFormatter:
    """
    Format company and market data for LLM prompts.

    Converts raw data structures into readable text
    that LLMs can easily understand and analyze.
    """

    def format_company_data(self, company: Dict, metrics: Dict = None) -> str:
        """
        Format company data for analysis.

        Args:
            company: Company basic info
            metrics: Calculated metrics

        Returns:
            Formatted string for prompt
        """
        lines = []

        # Basic info
        lines.append(f"## Company: {company.get('name', 'Unknown')}")
        lines.append(f"Ticker: {company.get('symbol', 'N/A')}")
        lines.append(f"Sector: {company.get('sector', 'N/A')}")
        lines.append(f"Industry: {company.get('industry', 'N/A')}")
        lines.append("")

        # Price info
        if company.get('price'):
            lines.append("## Current Price")
            lines.append(f"Price: ${company['price']:.2f}")
            if company.get('change_percent'):
                lines.append(f"Change: {company['change_percent']:.2f}%")
            if company.get('market_cap'):
                lines.append(f"Market Cap: ${self._format_large_number(company['market_cap'])}")
            lines.append("")

        # Valuation metrics
        if metrics:
            lines.append("## Valuation Metrics")
            valuation_metrics = ['pe_ratio', 'forward_pe', 'peg_ratio', 'pb_ratio',
                                 'ps_ratio', 'ev_ebitda', 'ev_revenue']
            for key in valuation_metrics:
                if key in metrics and metrics[key]:
                    lines.append(f"{self._format_metric_name(key)}: {self._format_value(metrics[key])}")
            lines.append("")

            # Profitability
            lines.append("## Profitability")
            profit_metrics = ['gross_margin', 'operating_margin', 'profit_margin',
                              'roe', 'roa', 'roic']
            for key in profit_metrics:
                if key in metrics and metrics[key]:
                    lines.append(f"{self._format_metric_name(key)}: {self._format_percent(metrics[key])}")
            lines.append("")

            # Growth
            lines.append("## Growth")
            growth_metrics = ['revenue_growth', 'earnings_growth', 'revenue_growth_3y',
                              'earnings_growth_3y']
            for key in growth_metrics:
                if key in metrics and metrics[key]:
                    lines.append(f"{self._format_metric_name(key)}: {self._format_percent(metrics[key])}")
            lines.append("")

            # Financial health
            lines.append("## Financial Health")
            health_metrics = ['debt_to_equity', 'current_ratio', 'quick_ratio',
                              'interest_coverage', 'free_cash_flow']
            for key in health_metrics:
                if key in metrics and metrics[key]:
                    if key == 'free_cash_flow':
                        lines.append(f"{self._format_metric_name(key)}: ${self._format_large_number(metrics[key])}")
                    else:
                        lines.append(f"{self._format_metric_name(key)}: {self._format_value(metrics[key])}")
            lines.append("")

            # DCF Valuation if available
            if metrics.get('dcf_value'):
                lines.append("## DCF Valuation")
                lines.append(f"Fair Value Estimate: ${metrics['dcf_value']:.2f}")
                if company.get('price'):
                    upside = ((metrics['dcf_value'] / company['price']) - 1) * 100
                    lines.append(f"Upside/Downside: {upside:+.1f}%")
                lines.append("")

        return "\n".join(lines)

    def format_insider_data(self, transactions: List[Dict]) -> str:
        """Format insider trading data"""
        if not transactions:
            return "## Insider Activity\nNo recent insider transactions."

        lines = ["## Recent Insider Activity"]

        # Summarize
        buys = sum(1 for t in transactions if t.get('transaction_type') == 'buy')
        sells = sum(1 for t in transactions if t.get('transaction_type') == 'sell')
        lines.append(f"Last 6 months: {buys} buys, {sells} sells")
        lines.append("")

        # Recent transactions
        for t in transactions[:5]:
            date = t.get('date', 'N/A')
            name = t.get('insider_name', 'Unknown')
            type_ = t.get('transaction_type', 'N/A')
            shares = t.get('shares', 0)
            value = t.get('value', 0)

            lines.append(f"- {date}: {name} {type_} {shares:,} shares (${value:,.0f})")

        return "\n".join(lines)

    def format_sentiment_data(self, sentiment: Dict) -> str:
        """Format sentiment analysis data"""
        lines = ["## Sentiment Analysis"]

        if sentiment.get('overall_score'):
            score = sentiment['overall_score']
            label = 'Bullish' if score > 0.2 else 'Bearish' if score < -0.2 else 'Neutral'
            lines.append(f"Overall Sentiment: {label} ({score:+.2f})")

        if sentiment.get('news_sentiment'):
            lines.append(f"News Sentiment: {sentiment['news_sentiment']}")

        if sentiment.get('social_sentiment'):
            lines.append(f"Social Sentiment: {sentiment['social_sentiment']}")

        if sentiment.get('analyst_consensus'):
            lines.append(f"Analyst Consensus: {sentiment['analyst_consensus']}")

        return "\n".join(lines)

    def format_comparison_data(self, companies: List[Dict]) -> str:
        """Format data for company comparison"""
        if not companies:
            return ""

        lines = ["## Company Comparison", ""]

        # Create comparison table
        metrics_to_compare = ['pe_ratio', 'revenue_growth', 'profit_margin', 'roe', 'debt_to_equity']

        # Header
        header = "| Metric | " + " | ".join(c.get('symbol', 'N/A') for c in companies) + " |"
        separator = "|" + "|".join(["---"] * (len(companies) + 1)) + "|"
        lines.append(header)
        lines.append(separator)

        # Rows
        for metric in metrics_to_compare:
            row = f"| {self._format_metric_name(metric)} |"
            for company in companies:
                value = company.get('metrics', {}).get(metric)
                row += f" {self._format_value(value)} |"
            lines.append(row)

        return "\n".join(lines)

    def format_portfolio_data(self, portfolio: Dict, positions: List[Dict]) -> str:
        """Format portfolio data for analysis"""
        lines = [f"## Portfolio: {portfolio.get('name', 'Unnamed')}"]

        lines.append(f"Total Value: ${portfolio.get('total_value', 0):,.2f}")
        lines.append(f"Cash: ${portfolio.get('cash', 0):,.2f}")
        lines.append(f"Total Return: {portfolio.get('total_return', 0):+.2f}%")
        lines.append("")

        if positions:
            lines.append("### Holdings")
            for pos in sorted(positions, key=lambda x: x.get('value', 0), reverse=True):
                symbol = pos.get('symbol', 'N/A')
                shares = pos.get('shares', 0)
                value = pos.get('value', 0)
                weight = pos.get('weight', 0) * 100
                gain = pos.get('unrealized_gain_pct', 0)

                lines.append(f"- {symbol}: {shares:.0f} shares, ${value:,.0f} ({weight:.1f}%), {gain:+.1f}%")

        return "\n".join(lines)

    def format_financial_statements(self, income: List[Dict] = None,
                                     balance: List[Dict] = None,
                                     cashflow: List[Dict] = None) -> str:
        """Format financial statement data"""
        lines = []

        if income:
            lines.append("## Income Statement (Recent Periods)")
            for period in income[:4]:
                date = period.get('fiscal_date_ending', 'N/A')
                revenue = self._format_large_number(period.get('total_revenue', 0))
                net_income = self._format_large_number(period.get('net_income', 0))
                lines.append(f"- {date}: Revenue ${revenue}, Net Income ${net_income}")
            lines.append("")

        if balance:
            lines.append("## Balance Sheet (Most Recent)")
            recent = balance[0] if balance else {}
            lines.append(f"Total Assets: ${self._format_large_number(recent.get('total_assets', 0))}")
            lines.append(f"Total Liabilities: ${self._format_large_number(recent.get('total_liabilities', 0))}")
            lines.append(f"Total Equity: ${self._format_large_number(recent.get('total_equity', 0))}")
            lines.append(f"Cash: ${self._format_large_number(recent.get('cash_and_equivalents', 0))}")
            lines.append(f"Total Debt: ${self._format_large_number(recent.get('total_debt', 0))}")
            lines.append("")

        if cashflow:
            lines.append("## Cash Flow (Recent Periods)")
            for period in cashflow[:4]:
                date = period.get('fiscal_date_ending', 'N/A')
                operating = self._format_large_number(period.get('operating_cash_flow', 0))
                capex = self._format_large_number(period.get('capital_expenditure', 0))
                fcf = self._format_large_number(period.get('free_cash_flow', 0))
                lines.append(f"- {date}: Operating CF ${operating}, CapEx ${capex}, FCF ${fcf}")
            lines.append("")

        return "\n".join(lines)

    def format_news_items(self, news: List[Dict], limit: int = 5) -> str:
        """Format news items for context"""
        if not news:
            return "## Recent News\nNo recent news available."

        lines = ["## Recent News"]

        for item in news[:limit]:
            title = item.get('title', 'Untitled')
            source = item.get('source', 'Unknown')
            date = item.get('published_at', 'N/A')
            sentiment = item.get('sentiment', 'neutral')

            lines.append(f"- [{sentiment.upper()}] {title}")
            lines.append(f"  Source: {source} | {date}")

        return "\n".join(lines)

    def format_analyst_ratings(self, ratings: Dict) -> str:
        """Format analyst ratings data"""
        lines = ["## Analyst Ratings"]

        if ratings.get('consensus'):
            lines.append(f"Consensus: {ratings['consensus']}")

        if ratings.get('target_price'):
            lines.append(f"Price Target: ${ratings['target_price']:.2f}")
            if ratings.get('target_high') and ratings.get('target_low'):
                lines.append(f"Range: ${ratings['target_low']:.2f} - ${ratings['target_high']:.2f}")

        if ratings.get('num_analysts'):
            lines.append(f"Number of Analysts: {ratings['num_analysts']}")

        if ratings.get('breakdown'):
            breakdown = ratings['breakdown']
            lines.append(f"Buy: {breakdown.get('buy', 0)} | Hold: {breakdown.get('hold', 0)} | Sell: {breakdown.get('sell', 0)}")

        return "\n".join(lines)

    def _format_metric_name(self, key: str) -> str:
        """Convert metric key to display name"""
        names = {
            'pe_ratio': 'P/E Ratio',
            'forward_pe': 'Forward P/E',
            'peg_ratio': 'PEG Ratio',
            'pb_ratio': 'P/B Ratio',
            'ps_ratio': 'P/S Ratio',
            'ev_ebitda': 'EV/EBITDA',
            'ev_revenue': 'EV/Revenue',
            'gross_margin': 'Gross Margin',
            'operating_margin': 'Operating Margin',
            'profit_margin': 'Profit Margin',
            'roe': 'ROE',
            'roa': 'ROA',
            'roic': 'ROIC',
            'revenue_growth': 'Revenue Growth (YoY)',
            'earnings_growth': 'Earnings Growth (YoY)',
            'revenue_growth_3y': 'Revenue Growth (3Y CAGR)',
            'earnings_growth_3y': 'Earnings Growth (3Y CAGR)',
            'debt_to_equity': 'Debt/Equity',
            'current_ratio': 'Current Ratio',
            'quick_ratio': 'Quick Ratio',
            'interest_coverage': 'Interest Coverage',
            'free_cash_flow': 'Free Cash Flow',
            'dividend_yield': 'Dividend Yield'
        }
        return names.get(key, key.replace('_', ' ').title())

    def _format_value(self, value: Any) -> str:
        """Format a numeric value"""
        if value is None:
            return 'N/A'
        if isinstance(value, float):
            if abs(value) >= 100:
                return f"{value:.1f}"
            return f"{value:.2f}"
        return str(value)

    def _format_percent(self, value: float) -> str:
        """Format a percentage"""
        if value is None:
            return 'N/A'
        return f"{value * 100:.1f}%" if abs(value) < 1 else f"{value:.1f}%"

    def _format_large_number(self, value: float) -> str:
        """Format large numbers with B/M/K suffixes"""
        if value is None:
            return 'N/A'

        abs_value = abs(value)
        if abs_value >= 1e12:
            return f"{value / 1e12:.2f}T"
        elif abs_value >= 1e9:
            return f"{value / 1e9:.2f}B"
        elif abs_value >= 1e6:
            return f"{value / 1e6:.2f}M"
        elif abs_value >= 1e3:
            return f"{value / 1e3:.1f}K"
        return f"{value:.0f}"
