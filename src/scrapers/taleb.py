# src/scrapers/taleb.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional


class TalebScraper(BaseScraper):
    """
    Scrapes Nassim Nicholas Taleb's investment and risk philosophy.

    Nassim Taleb:
    - Author of Incerto series (Fooled by Randomness, Black Swan, Antifragile, Skin in the Game)
    - Former options trader
    - Expert on probability and risk

    Key concepts:
    - Black Swans (rare, high-impact events)
    - Antifragility (gains from disorder)
    - Fat tails (extreme events more common than predicted)
    - Skin in the game (alignment of incentives)
    - Via negativa (what to avoid vs what to do)

    Sources:
    - Medium articles
    - Published papers (academia.edu)
    - Interview transcripts
    """

    # Taleb's Medium
    MEDIUM_BASE = "https://medium.com/@nntaleb"

    # Key concepts (manually curated from books)
    CORE_CONCEPTS = [
        {
            'id': 'taleb_black_swan',
            'title': 'Black Swan Theory - Nassim Taleb',
            'content': """
BLACK SWAN THEORY - Nassim Nicholas Taleb

DEFINITION:
A Black Swan is an event that:
1. Is an outlier (outside regular expectations)
2. Has extreme impact
3. Is retrospectively predictable (we invent explanations after)

THE PROBLEM:
- We systematically underestimate rare events
- Our models assume normal distributions
- Reality has "fat tails" - extremes happen more often

INVESTING IMPLICATIONS:

1. Don't Trust Models
- VaR (Value at Risk) is dangerous
- Models work until they catastrophically fail
- "All models are wrong, some are dangerous"

2. Position for Black Swans
- Negative Black Swans: Prepare for crashes
- Positive Black Swans: Position for unexpected upside
- Asymmetric payoffs are key

3. Avoid Fragility
- Leverage kills in Black Swans
- Concentration kills in Black Swans
- Complexity kills in Black Swans

4. The Barbell Strategy
- 85-90% in extremely safe assets (T-bills)
- 10-15% in extremely risky/speculative bets
- NOTHING in the middle (pseudo-safe is dangerous)

WHY THE BARBELL WORKS:
- Safe portion: Survives any Black Swan
- Risky portion: Benefits from positive Black Swans
- Middle ground: Destroyed by negative Black Swans

PRACTICAL APPLICATIONS:

Portfolio:
- Avoid "moderate risk" funds (fragile)
- Hold real cash (not "cash equivalents")
- Small bets on asymmetric opportunities

Career:
- Have optionality (multiple income sources)
- Avoid single points of failure
- Build skills that compound

Business:
- Avoid excessive debt
- Maintain optionality
- Be ready to pivot

"The inability to predict outliers implies the inability to predict the course of history."
"""
        },
        {
            'id': 'taleb_antifragile',
            'title': 'Antifragility - Nassim Taleb',
            'content': """
ANTIFRAGILITY - Nassim Nicholas Taleb

DEFINITIONS:
- Fragile: Harmed by volatility/stress (glass)
- Robust: Unaffected by volatility (rock)
- Antifragile: BENEFITS from volatility (immune system)

THE KEY INSIGHT:
Most systems are not just robust - they NEED stress to improve.
- Muscles need exercise stress
- Immune systems need pathogen exposure
- Economies need recessions to clear malinvestment

FRAGILE VS ANTIFRAGILE INVESTMENTS:

FRAGILE:
- Leveraged positions
- Short volatility strategies
- Concentrated portfolios
- Complex derivatives
- Illiquid investments
- Anything that needs "everything to go right"

ANTIFRAGILE:
- Optionality (limited downside, unlimited upside)
- Cash + opportunistic deployment
- Barbell portfolios
- Small bets with big payoffs
- Owning convexity
- Businesses that strengthen from crises

BUILDING ANTIFRAGILE PORTFOLIOS:

1. Eliminate Fragility First (Via Negativa)
- Remove leverage
- Remove concentration
- Remove complexity
- Remove illiquidity

2. Add Optionality
- Hold cash for opportunities
- Own options (explicit or embedded)
- Maintain flexibility

3. Position for Convexity
- Asymmetric payoff structures
- More upside than downside
- "Win big or lose small"

THE CONVEXITY TEST:
Ask: "Does this position benefit from volatility?"
- If yes → Antifragile (own it)
- If no → Fragile (avoid it)

DOMAIN TRANSFER:

Health: Intermittent fasting (stress → adaptation)
Learning: Struggle → understanding
Business: Competition → innovation
Investing: Volatility → opportunity

"Wind extinguishes a candle but fuels a fire."

PRACTICAL RULES:

1. Never be in a position where a Black Swan can destroy you
2. Always be in a position where a Black Swan can help you
3. Reduce downside, don't cap upside
4. Own things that benefit from disorder
5. Rent things that are harmed by disorder
"""
        },
        {
            'id': 'taleb_skin_in_the_game',
            'title': 'Skin in the Game - Nassim Taleb',
            'content': """
SKIN IN THE GAME - Nassim Nicholas Taleb

CORE PRINCIPLE:
People who make decisions should bear the consequences of those decisions.

THE PROBLEM:
Modern society has separated decision-making from consequences:
- Bankers get bonuses for risky bets, taxpayers pay losses
- Consultants give advice but don't suffer if wrong
- Academics theorize but don't practice
- Politicians spend but don't earn

INVESTING APPLICATIONS:

1. EVALUATE MANAGEMENT BY OWNERSHIP
- Does the CEO own significant stock?
- Are insiders buying or selling?
- Is their wealth tied to the company?

Taleb's rule: Don't invest with someone who doesn't
have most of their net worth in their own fund.

2. BEWARE FORECASTERS WITHOUT STAKES
- Analysts who recommend but don't own
- Economists who predict but don't trade
- Advisors who charge fees regardless of outcome

3. ASYMMETRIC INCENTIVES = DANGER
- Fund managers: 2% management + 20% performance
- They keep upside, you keep downside
- Incentive to take excessive risk

4. SOUL IN THE GAME
Beyond money - reputation, career, wellbeing:
- Does this person's career depend on being right?
- Will they suffer socially if wrong?
- Is their reputation at stake?

THE AGENCY PROBLEM IN INVESTING:

Bad incentives:
- Broker: Paid per trade → Churning
- Fund manager: AUM fees → Asset gathering, not returns
- Advisor: Commission → Sell high-fee products

Good incentives:
- Owner-operators
- Founders with concentrated positions
- Managers who eat their own cooking

PRACTICAL FILTERS:

1. Check insider ownership before investing
2. Prefer founder-led companies
3. Avoid companies where management sells
4. Be skeptical of "experts" without stakes
5. Track forecasters' actual investments, not words

"Don't tell me what you think, tell me what you have in your portfolio."

THE LINDY EFFECT:

Things that have survived have "skin in the game" with time:
- Old books are better than new books (survived test of time)
- Old companies more likely to survive than new
- Time is the ultimate filter

"If you want to know if someone is competent,
check if they are still alive."
"""
        },
        {
            'id': 'taleb_fat_tails',
            'title': 'Fat Tails and Risk - Nassim Taleb',
            'content': """
FAT TAILS AND RISK - Nassim Nicholas Taleb

THE NORMAL DISTRIBUTION LIE:

Finance assumes normal (Gaussian) distributions:
- Most returns near average
- Extremes very rare
- 3+ sigma events almost never happen

Reality has fat tails:
- Extremes happen FAR more often than predicted
- 5+ sigma events happen regularly
- Most damage comes from extremes

EXAMPLES:

Normal distribution says:
- 1987 crash was 20+ sigma (should never happen)
- 2008 crisis was 25+ sigma (impossible)
- Yet these happen every decade

The problem:
- Risk models dramatically underestimate tail risk
- Banks, funds, regulators all use bad models
- This is why crises "surprise" everyone

MEDIOCRISTAN VS EXTREMISTAN:

Mediocristan (normal distributions):
- Height, weight, calorie consumption
- No single observation changes the average much
- Extremes are bounded

Extremistan (fat tail distributions):
- Wealth, market returns, book sales
- Single observation can dominate
- Extremes are unbounded

INVESTING IS EXTREMISTAN:
- One trade can make a career
- One crash can end a fund
- One stock can drive portfolio returns
- Must plan for extremes

PRACTICAL IMPLICATIONS:

1. NEVER Use VaR (Value at Risk)
- Tells you nothing about tails
- Gives false confidence
- "Like airbag that works except in crashes"

2. Position Sizing
- Size for worst case, not expected case
- If you can't survive the extreme, position smaller
- Leverage amplifies tail risk

3. Correlation in Crises
- In normal times: Assets uncorrelated
- In crises: Everything correlates to 1
- Diversification fails when you need it most

4. Time Horizon
- Longer horizon → more likely to see fat tail
- If you invest for 30 years, you WILL see Black Swans
- Plan accordingly

THE PRECAUTIONARY PRINCIPLE:

When facing:
- Fat tails (extreme outcomes possible)
- Uncertainty (don't know distribution)
- Irreversibility (can't undo damage)

→ Be extremely conservative
→ Don't rely on models
→ Eliminate ruin scenarios

"In Extremistan, one should be paranoid."

TALEB'S RULES FOR FAT TAIL WORLD:

1. Don't cross a river that is "on average" 4 feet deep
2. Never get into a situation where you can blow up
3. Avoid optimization; seek robustness
4. Don't confuse absence of evidence with evidence of absence
5. The safer you feel, the more danger you're probably in
"""
        },
        {
            'id': 'taleb_via_negativa',
            'title': 'Via Negativa - Nassim Taleb',
            'content': """
VIA NEGATIVA - Nassim Nicholas Taleb

THE PRINCIPLE:
Addition by subtraction. Improvement through removal.
What you DON'T do is often more important than what you DO.

WHY VIA NEGATIVA WORKS:

1. We know what's wrong more reliably than what's right
2. Removing negatives is more robust than adding positives
3. Fewer moving parts = less fragility
4. Avoiding stupidity is easier than seeking brilliance

INVESTING APPLICATIONS:

WHAT TO AVOID (More Important Than What to Buy):

1. Avoid Leverage
- Leverage turns temporary losses into permanent ones
- Can't recover from ruin
- "If you must use leverage, you don't need it"

2. Avoid Complexity
- Complex investments hide risks
- If you can't explain it simply, don't own it
- Complexity is the enemy of execution

3. Avoid Illiquidity
- Can't exit when you need to
- Liquidity disappears exactly when you need it
- Pay the liquidity premium

4. Avoid Overconfidence
- You know less than you think
- Markets know more than you think
- Humility is a survival trait

5. Avoid Predictions
- Nobody can predict consistently
- Prepare for scenarios, don't forecast
- Be robust to multiple futures

6. Avoid Crowds at Extremes
- Don't buy what everyone loves
- Don't sell what everyone hates
- Contrarian by default

CHARLIE MUNGER'S VERSION:
"All I want to know is where I'm going to die, so I'll never go there."

PRACTICAL CHECKLIST:

Before any investment, ask:
□ Am I avoiding excessive leverage?
□ Am I avoiding excessive concentration?
□ Am I avoiding excessive complexity?
□ Am I avoiding excessive illiquidity?
□ Am I avoiding overconfidence?
□ Can I survive being wrong?

THE SUBTRACTION APPROACH TO PORTFOLIO MANAGEMENT:

Instead of: "What should I add?"
Ask: "What should I remove?"

Remove:
- High-fee products
- Underperformers held for tax reasons
- Positions you don't understand
- Positions too small to matter
- Investments bought for bad reasons

"The three most harmful addictions are heroin, carbohydrates, and a monthly salary."

IN LIFE AND INVESTING:
- Don't try to be brilliant, try not to be stupid
- Don't try to predict the future, try to survive all futures
- Don't try to maximize returns, try to minimize regret
"""
        }
    ]

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/investors/taleb",
            rate_limit=2.0
        )

    def get_source_name(self) -> str:
        return "Nassim Nicholas Taleb"

    def get_urls(self) -> List[Dict]:
        items = []

        # Add core concepts (manual)
        for concept in self.CORE_CONCEPTS:
            items.append({
                'id': concept['id'],
                'url': None,
                'title': concept['title'],
                'type': 'manual',
                'content': concept['content']
            })

        return items

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        if item.get('type') == 'manual':
            return {
                'title': item['title'],
                'content': item['content'],
                'metadata': {
                    'author': 'Nassim Nicholas Taleb',
                    'type': 'investment_philosophy',
                    'topics': ['risk_management', 'black_swan', 'antifragility', 'psychology']
                }
            }

        # Web scraping for Medium, etc.
        if not item.get('url'):
            return None

        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        content = soup.find('article') or soup.find('main')
        if not content:
            return None

        text = content.get_text(separator='\n', strip=True)

        return {
            'title': item['title'],
            'content': text,
            'url': item['url'],
            'metadata': {
                'author': 'Nassim Nicholas Taleb',
                'type': 'article',
                'topics': ['risk_management', 'antifragility']
            }
        }
