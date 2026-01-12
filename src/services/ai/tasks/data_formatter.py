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

    def format_investor_holdings(self, investor: Dict, holdings: List[Dict]) -> str:
        """Format famous investor holdings for analysis"""
        investor_name = investor.get('name', 'Unknown Investor')
        fund_name = investor.get('fund_name', '')
        filing_date = investor.get('latest_filing_date', 'N/A')

        lines = [f"## {investor_name} Holdings"]
        if fund_name:
            lines.append(f"Fund: {fund_name}")
        lines.append(f"Filing Date: {filing_date}")
        lines.append(f"Source: SEC 13F Filing")
        lines.append("")

        if holdings:
            total_value = sum(h.get('market_value', 0) for h in holdings)
            lines.append(f"Total Portfolio Value: ${self._format_large_number(total_value)}")
            lines.append(f"Number of Positions: {len(holdings)}")
            lines.append("")

            # Top holdings
            lines.append("### Top Holdings")
            for h in holdings[:10]:
                symbol = h.get('symbol', h.get('security_name', 'N/A'))
                name = h.get('company_name', h.get('security_name', ''))
                value = h.get('market_value', 0)
                shares = h.get('shares', 0)
                weight = (value / total_value * 100) if total_value else 0
                change_type = h.get('change_type', 'UNCHANGED')

                change_indicator = ''
                if change_type == 'NEW':
                    change_indicator = ' [NEW]'
                elif change_type == 'INCREASED':
                    change_indicator = ' [+]'
                elif change_type == 'DECREASED':
                    change_indicator = ' [-]'
                elif change_type == 'SOLD':
                    change_indicator = ' [SOLD]'

                lines.append(f"- {symbol} ({name}): ${self._format_large_number(value)} ({weight:.1f}%){change_indicator}")

            # Sector breakdown if available
            sector_breakdown = {}
            for h in holdings:
                sector = h.get('sector', 'Unknown')
                sector_breakdown[sector] = sector_breakdown.get(sector, 0) + h.get('market_value', 0)

            if sector_breakdown and len(sector_breakdown) > 1:
                lines.append("")
                lines.append("### Sector Allocation")
                sorted_sectors = sorted(sector_breakdown.items(), key=lambda x: x[1], reverse=True)
                for sector, value in sorted_sectors[:6]:
                    weight = (value / total_value * 100) if total_value else 0
                    lines.append(f"- {sector}: {weight:.1f}%")

            # Recent activity summary
            activity = {
                'new': sum(1 for h in holdings if h.get('change_type') == 'NEW'),
                'increased': sum(1 for h in holdings if h.get('change_type') == 'INCREASED'),
                'decreased': sum(1 for h in holdings if h.get('change_type') == 'DECREASED'),
                'sold': sum(1 for h in holdings if h.get('change_type') == 'SOLD'),
            }

            if any(activity.values()):
                lines.append("")
                lines.append("### Recent Activity (vs. Previous Filing)")
                if activity['new']:
                    lines.append(f"- New Positions: {activity['new']}")
                if activity['increased']:
                    lines.append(f"- Increased: {activity['increased']}")
                if activity['decreased']:
                    lines.append(f"- Decreased: {activity['decreased']}")
                if activity['sold']:
                    lines.append(f"- Exited: {activity['sold']}")

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

    def format_parametric_analysis(self, distribution_data: Dict) -> str:
        """
        Format parametric return distribution analysis for AI analysts.

        Includes distribution fit, moments, VaR comparison, and risk insights.

        Args:
            distribution_data: Result from analyzeDistribution() or similar

        Returns:
            Formatted string for prompt context
        """
        if not distribution_data:
            return ""

        lines = ["## Return Distribution Analysis"]

        # Distribution type and fit
        dist_fit = distribution_data.get('distributionFit', {})
        if dist_fit:
            lines.append(f"**Fitted Distribution:** {dist_fit.get('name', 'Unknown')}")
            if dist_fit.get('params'):
                params = dist_fit['params']
                param_str = ', '.join([f"{k}={v:.4f}" for k, v in params.items() if isinstance(v, (int, float))])
                lines.append(f"**Parameters:** {param_str}")
            lines.append("")

        # Distribution moments
        moments = distribution_data.get('moments', {})
        if moments:
            lines.append("### Distribution Shape")
            lines.append(f"- Mean Return: {self._format_percent(moments.get('mean', 0))}")
            lines.append(f"- Std Deviation: {self._format_percent(moments.get('std', 0))}")

            skewness = moments.get('skewness', 0)
            skew_interpretation = (
                'left-skewed (more downside risk)' if skewness < -0.5 else
                'right-skewed (more upside potential)' if skewness > 0.5 else
                'approximately symmetric'
            )
            lines.append(f"- Skewness: {skewness:.3f} ({skew_interpretation})")

            kurtosis = moments.get('kurtosis', 3)
            tail_interpretation = (
                'EXTREME fat tails - severe tail risk' if kurtosis > 6 else
                'fat tails detected - tail risk present' if kurtosis > 4 else
                'slightly fat tails' if kurtosis > 3.5 else
                'near-normal tails'
            )
            lines.append(f"- Kurtosis: {kurtosis:.3f} ({tail_interpretation})")
            lines.append("")

        # Fat tail warning
        if moments.get('kurtosis', 3) > 4:
            lines.append("**WARNING: Fat Tails Detected**")
            lines.append("Returns exhibit excess kurtosis, meaning extreme events occur")
            lines.append("more frequently than a normal distribution predicts.")
            lines.append("Normal-based risk models will UNDERESTIMATE tail risk.")
            lines.append("")

        # VaR comparison
        var_data = distribution_data.get('varComparison', {})
        if var_data:
            lines.append("### Value at Risk Comparison (95% Confidence)")
            lines.append(f"| Method | VaR | Description |")
            lines.append("|--------|-----|-------------|")
            lines.append(f"| Normal | {self._format_percent(var_data.get('normalVaR', 0))} | Standard assumption |")
            lines.append(f"| Cornish-Fisher | {self._format_percent(var_data.get('adjustedVaR', 0))} | Adjusted for fat tails |")

            underestimation = var_data.get('underestimationPct', 0)
            if underestimation > 0:
                severity = 'CRITICAL' if underestimation > 30 else 'SIGNIFICANT' if underestimation > 15 else 'Moderate'
                lines.append(f"")
                lines.append(f"**Normal VaR Underestimates Risk by {underestimation:.1f}%** ({severity})")
            lines.append("")

        # Probabilistic valuation if available
        prob_val = distribution_data.get('probabilisticValuation', {})
        if prob_val:
            lines.append("### Probabilistic Valuation (Monte Carlo)")
            lines.append(f"- Simulations: {prob_val.get('simulations', 0):,}")
            lines.append(f"- Expected Value: ${prob_val.get('expectedValue', 0):.2f}")

            percentiles = prob_val.get('percentiles', {})
            if percentiles:
                lines.append(f"- 5th Percentile: ${percentiles.get('p5', 0):.2f} (bear case)")
                lines.append(f"- Median: ${percentiles.get('p50', 0):.2f}")
                lines.append(f"- 95th Percentile: ${percentiles.get('p95', 0):.2f} (bull case)")

            probs = prob_val.get('probabilities', {})
            if probs:
                lines.append(f"")
                lines.append("**Probability Assessment:**")
                lines.append(f"- P(undervalued by 20%+): {probs.get('undervalued20pct', 0):.1f}%")
                lines.append(f"- P(overvalued): {probs.get('overvalued', 0):.1f}%")
            lines.append("")

        # Risk implications for investment
        lines.append("### Risk Implications")
        if moments.get('kurtosis', 3) > 4:
            lines.append("- Use PARAMETRIC simulations, not normal distributions")
            lines.append("- Consider larger margin of safety for position sizing")
            lines.append("- Stress test with fat-tailed scenarios")
        if moments.get('skewness', 0) < -0.5:
            lines.append("- Negative skew means losses tend to be larger than gains")
            lines.append("- Consider protective strategies (stops, puts)")
        if moments.get('skewness', 0) > 0.5:
            lines.append("- Positive skew suggests upside potential exceeds downside")
        lines.append("")

        return "\n".join(lines)

    def format_probabilistic_dcf(self, dcf_data: Dict) -> str:
        """
        Format probabilistic DCF valuation for AI analysts.

        Args:
            dcf_data: Result from calculateParametricValuation()

        Returns:
            Formatted string for prompt context
        """
        if not dcf_data or not dcf_data.get('success'):
            return ""

        lines = ["## Probabilistic DCF Valuation"]

        # Base values
        lines.append(f"**Base Intrinsic Value:** ${dcf_data.get('baseIntrinsicValue', 0):.2f}")
        lines.append(f"**Current Price:** ${dcf_data.get('currentPrice', 0):.2f}")
        lines.append("")

        # Probabilistic results
        prob = dcf_data.get('probabilisticValuation', {})
        if prob:
            lines.append("### Monte Carlo Results")
            lines.append(f"- Simulations: {prob.get('simulations', 0):,}")
            lines.append(f"- Distribution Type: {prob.get('distributionType', 'Unknown')}")
            lines.append(f"- Expected Value: ${prob.get('expectedValue', 0):.2f}")
            lines.append(f"- Standard Deviation: ${prob.get('standardDeviation', 0):.2f}")
            lines.append(f"- Coefficient of Variation: {prob.get('coefficientOfVariation', 0):.1f}%")
            lines.append("")

            # Percentiles
            pcts = prob.get('percentiles', {})
            if pcts:
                lines.append("### Valuation Range")
                lines.append(f"| Scenario | Value | Upside/Downside |")
                lines.append("|----------|-------|-----------------|")
                current = dcf_data.get('currentPrice', 1)
                for label, key in [('Bear (5th)', 'p5'), ('Conservative (25th)', 'p25'),
                                   ('Median', 'p50'), ('Optimistic (75th)', 'p75'),
                                   ('Bull (95th)', 'p95')]:
                    val = pcts.get(key, 0)
                    pct_diff = ((val / current) - 1) * 100 if current else 0
                    lines.append(f"| {label} | ${val:.2f} | {pct_diff:+.1f}% |")
                lines.append("")

            # Probabilities
            probs = prob.get('probabilities', {})
            if probs:
                lines.append("### Investment Probabilities")
                lines.append(f"- P(undervalued by 10%+): {probs.get('undervalued10pct', 0):.1f}%")
                lines.append(f"- P(undervalued by 20%+): {probs.get('undervalued20pct', 0):.1f}%")
                lines.append(f"- P(undervalued by 50%+): {probs.get('undervalued50pct', 0):.1f}%")
                lines.append(f"- P(overvalued): {probs.get('overvalued', 0):.1f}%")
                lines.append("")

            # Moments
            mom = prob.get('moments', {})
            if mom:
                lines.append("### Valuation Distribution Shape")
                skew = mom.get('skewness', 0)
                kurt = mom.get('kurtosis', 3)
                lines.append(f"- Skewness: {skew:.3f}")
                lines.append(f"- Kurtosis: {kurt:.3f}")

                if skew > 0.5:
                    lines.append("- More upside scenarios than downside (positive skew)")
                elif skew < -0.5:
                    lines.append("- More downside scenarios than upside (negative skew)")

                if kurt > 4:
                    lines.append("- High uncertainty with fat tails in valuation outcomes")
                lines.append("")

        # Interpretation
        interpretation = dcf_data.get('interpretation', [])
        if interpretation:
            lines.append("### Analyst Interpretation")
            for item in interpretation:
                lines.append(f"- {item}")
            lines.append("")

        return "\n".join(lines)
