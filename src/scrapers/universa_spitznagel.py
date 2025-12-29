# src/scrapers/universa_spitznagel.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional


class UniversaSpitznagelScraper(BaseScraper):
    """
    Scrapes Mark Spitznagel's investment philosophy.

    Mark Spitznagel:
    - Founder of Universa Investments (tail risk fund)
    - Author of "The Dao of Capital" and "Safe Haven"
    - Austrian economics approach to investing
    - Focus on rare, extreme events

    Key concepts:
    - Roundabout investing (indirect path to returns)
    - Tail risk hedging
    - Time preference and patience
    - Austrian business cycle theory

    Sources:
    - Universa investor letters (limited public availability)
    - Published interviews and talks
    - Book excerpts and summaries
    """

    # Known interview/article sources
    SOURCES = [
        {
            'id': 'spitznagel_dao_capital_summary',
            'url': 'https://www.grahamvalue.com/book-summaries/the-dao-of-capital',
            'title': 'The Dao of Capital - Summary',
            'type': 'book_summary'
        },
        {
            'id': 'spitznagel_safe_haven_summary',
            'url': 'https://www.grahamvalue.com/book-summaries/safe-haven',
            'title': 'Safe Haven - Summary',
            'type': 'book_summary'
        },
    ]

    # Key concepts to manually add (from books/interviews)
    MANUAL_CONTENT = [
        {
            'id': 'spitznagel_roundabout_investing',
            'title': 'Roundabout Investing - Mark Spitznagel',
            'content': """
Mark Spitznagel's Roundabout Investing Philosophy:

THE INDIRECT PATH (From "The Dao of Capital"):

1. SHI (Strategic Advantage through Positioning)
- Great investors position themselves BEFORE opportunities arise
- Like a farmer planting seeds, not hunting for food
- Accept short-term disadvantage for long-term advantage

2. WU WEI (Effortless Action)
- Don't force trades; let opportunities come to you
- The best trades feel effortless because you're positioned correctly
- Patience is the ultimate edge

3. ROUNDABOUT vs DIRECT
- Direct: Chase immediate returns (most investors)
- Roundabout: Build infrastructure for future returns
- Example: Hold cash during bubbles, deploy during crashes

AUSTRIAN ECONOMICS APPLICATION:

1. Time Preference
- Low time preference = patient capital = better returns
- High time preference = chasing returns = poor timing

2. Boom-Bust Cycles
- Central bank intervention creates artificial booms
- Artificial booms ALWAYS bust
- Position for the inevitable correction

3. Malinvestment
- Easy money leads to bad investments
- When tide goes out, malinvestments are exposed
- Be ready to buy quality assets cheaply

TAIL RISK STRATEGY:

1. Convexity
- Small losses in normal times
- Massive gains in crashes
- Asymmetric payoff structure

2. Insurance Premium
- Pay a small premium continuously
- Collect huge payoff during black swans
- Net positive over full cycles

3. Portfolio Construction
- Core: Quality assets bought cheaply
- Hedge: Tail risk protection (puts, volatility)
- Result: Sleep well AND compound wealth

KEY QUOTES:
"The best trades are the ones you don't have to make often."
"Patience isn't just a virtue in investing—it's the primary edge."
"Position yourself so that time is your friend, not your enemy."
"""
        },
        {
            'id': 'spitznagel_safe_haven_principles',
            'title': 'Safe Haven Investing Principles - Mark Spitznagel',
            'content': """
Safe Haven Investing - Mark Spitznagel:

WHAT IS A SAFE HAVEN?

A true safe haven must:
1. Protect during crashes (obvious)
2. Not destroy wealth over time (often ignored)
3. Improve overall portfolio CAGR (the real test)

WHAT FAILS AS SAFE HAVEN:

1. Gold
- Doesn't consistently protect in crashes
- Long periods of underperformance
- Fails the "raises CAGR" test

2. Bonds (Traditional)
- Work until they don't
- Zero/negative rates eliminate upside
- Correlated with stocks in some crashes

3. Simple Diversification
- Correlations spike in crashes
- When you need protection most, it fails
- "Diworsification" destroys returns

WHAT WORKS:

1. Tail Risk Hedging (Universa approach)
- Far out-of-the-money puts
- Lose small amounts regularly
- Win enormous amounts in crashes
- NET: Raises portfolio CAGR

2. Cash + Patience
- Dry powder for crashes
- Opportunity cost in bull markets
- But HUGE gains buying bottoms

3. The "Barbell" Approach
- 90% in safe assets
- 10% in extremely aggressive bets
- No middle ground (fragile zone)

THE MATH OF SAFE HAVENS:

Traditional thinking: "What returns during crashes?"
Correct thinking: "What raises my LONG-TERM CAGR?"

Example:
- Strategy A: +8% normally, -40% in crashes
- Strategy B: +6% normally, +0% in crashes
- Strategy B is BETTER over time

The cost of large losses is geometric:
- Lose 50% → Need 100% to recover
- Lose 75% → Need 300% to recover
- AVOIDING large losses > SEEKING large gains

IMPLEMENTATION:

1. Accept lower returns in normal times
2. Structure for massive outperformance in crashes
3. Use crashes to redeploy at low prices
4. Compound from a higher base

"It's not about predicting crashes. It's about being positioned for them."
"""
        },
        {
            'id': 'spitznagel_austrian_investing',
            'title': 'Austrian Economics for Investors - Mark Spitznagel',
            'content': """
AUSTRIAN ECONOMICS FOR INVESTORS - Mark Spitznagel

CORE AUSTRIAN PRINCIPLES:

1. SUBJECTIVE VALUE THEORY
- Value is not intrinsic; it's determined by individuals
- Market prices reflect collective subjective valuations
- Price discovery is a dynamic process

2. TIME PREFERENCE
- Preference for present goods over future goods
- Lower time preference = more savings = more investment
- Investors with low time preference have an edge

3. CAPITAL STRUCTURE
- Economy has a structure of production
- Different stages from raw materials to consumer goods
- Credit expansion distorts this structure

4. BUSINESS CYCLE THEORY (ABCT)

The Austrian Business Cycle:

1. Central bank lowers interest rates artificially
2. Cheap credit flows to longer-term projects
3. Boom: Asset prices rise, malinvestment occurs
4. Reality: Savings don't support the structure
5. Bust: Malinvestments liquidated
6. Recovery: Healthy structure rebuilds

INVESTMENT IMPLICATIONS:

During Boom Phase:
- Asset prices inflated beyond fundamental value
- Risk appears low but is actually high
- Credit is easy; leverage is tempting
- AVOID: Don't chase, build cash, wait

During Bust Phase:
- Asset prices collapse below fundamental value
- Risk appears high but is actually low
- Credit is tight; fear is everywhere
- ACT: Deploy cash into quality assets

IDENTIFYING MALINVESTMENT:

Red Flags:
- Business models that only work with cheap credit
- Projects with very long payback periods
- Excessive leverage across the economy
- "This time is different" narratives
- Yield-chasing behavior

Quality Assets:
- Businesses that generate real cash flows
- Low or no debt dependence
- Essential products/services
- Pricing power
- Strong balance sheets

THE ROUNDABOUT PATH:

Austrian economics teaches roundabout production:
- Invest in capital goods first
- More indirect production is more productive
- But requires patience and low time preference

Applied to investing:
- Don't chase immediate returns
- Build positions during pain
- Wait for the roundabout payoff
- Patience is productive

PRACTICAL FRAMEWORK:

1. Watch credit growth vs GDP growth
2. Monitor asset price inflation
3. Track corporate leverage trends
4. Note quality spread compression
5. Observe behavioral indicators (greed/fear)

When cycle is extended:
- Raise cash
- Reduce risk
- Prepare shopping list
- Wait for reset

"The boom sows the seeds of its own destruction."
"""
        },
        {
            'id': 'spitznagel_portfolio_construction',
            'title': 'Portfolio Construction for Tail Risk - Mark Spitznagel',
            'content': """
PORTFOLIO CONSTRUCTION FOR TAIL RISK - Mark Spitznagel

THE UNIVERSA APPROACH:

Core insight: Most investors are fragile to crashes.
They either:
1. Suffer massive drawdowns
2. Miss out on upside by being too conservative
3. Try (and fail) to time markets

The solution: STRUCTURED CONVEXITY

COMPONENTS:

1. CORE PORTFOLIO (85-95%)
Risk assets that compound over time:
- Quality equities
- Real assets
- Growth exposure

This portion WILL suffer in crashes.
That's expected and acceptable.

2. TAIL HEDGE (5-15%)
Explicit crash protection:
- Far out-of-the-money puts
- Volatility strategies
- Designed to explode upward in crashes

This portion bleeds slowly in normal times.
That's the cost of insurance.

THE MATHEMATICS:

Without tail hedge:
- Years 1-9: +10% per year = 2.36x
- Year 10: -50% crash
- End result: 1.18x (1.7% CAGR)

With 5% tail hedge allocation:
- Years 1-9: +8% per year (drag from hedge cost)
- Year 10: Hedge returns +300%, core -50%
- Net year 10: -15% instead of -50%
- End result: 1.68x (5.3% CAGR)

The hedge RAISES long-term returns by reducing crash damage.

IMPLEMENTATION OPTIONS:

For Institutions:
- Universa-style tail hedge funds
- Managed volatility strategies
- Systematic put buying programs

For Individuals:
- Cash as dry powder (less efficient but simple)
- Long-dated put options (requires expertise)
- Barbell with quality bonds (traditional)

KEY PRINCIPLES:

1. Cost Efficiency
- Tail hedge must be cheap enough
- Expensive insurance kills returns
- Focus on far OTM, long-dated options

2. Explosive Payoff
- Hedge must pay off BIG in crashes
- Small protection is useless
- Need 10x+ returns in tail events

3. Discipline
- Keep paying the "premium"
- Don't remove hedge during long bull markets
- That's when you need it most

4. Reinvestment
- After crash gains, redeploy into cheap assets
- This is where long-term wealth is made
- "Make money during crashes, compound during recovery"

BEHAVIORAL CHALLENGE:

The hardest part: Watching hedge "bleed" for years.

In calm markets:
- Tail hedge loses money every year
- Looks like a waste
- Pressure to remove it

But crashes come eventually.
Those who removed protection are devastated.
Those who maintained it prosper.

"Pay a little, make a lot. That's the whole strategy."
"""
        }
    ]

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/investors/spitznagel",
            rate_limit=2.0
        )

    def get_source_name(self) -> str:
        return "Mark Spitznagel - Universa Investments"

    def get_urls(self) -> List[Dict]:
        # Combine web sources and manual content
        items = self.SOURCES.copy()
        for manual in self.MANUAL_CONTENT:
            items.append({
                'id': manual['id'],
                'url': None,
                'title': manual['title'],
                'type': 'manual',
                'content': manual['content']
            })
        return items

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        # Handle manual content
        if item.get('type') == 'manual':
            return {
                'title': item['title'],
                'content': item['content'],
                'metadata': {
                    'author': 'Mark Spitznagel',
                    'type': 'investment_philosophy',
                    'topics': ['tail_risk', 'risk_management', 'austrian_economics']
                }
            }

        # Scrape web content
        if not item.get('url'):
            return None

        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        content = soup.find('article') or soup.find('main') or soup.find('body')
        if not content:
            return None

        text = content.get_text(separator='\n', strip=True)

        return {
            'title': item['title'],
            'content': text,
            'url': item['url'],
            'metadata': {
                'author': 'Mark Spitznagel',
                'type': item.get('type', 'article'),
                'topics': ['tail_risk', 'risk_management']
            }
        }
