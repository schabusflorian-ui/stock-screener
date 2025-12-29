# src/scrapers/benedict_evans.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional


class BenedictEvansScraper(BaseScraper):
    """
    Scrapes Benedict Evans' tech analysis.

    Benedict Evans:
    - Former a16z partner
    - Deep analysis of tech trends
    - Market sizing and TAM analysis
    - Mobile, AI, enterprise coverage

    Source: ben-evans.com
    """

    BASE_URL = "https://www.ben-evans.com"

    # Curated insights from Benedict Evans essays
    CURATED_INSIGHTS = [
        {
            'id': 'evans_market_sizing',
            'title': 'How to Think About Market Sizing - Benedict Evans',
            'content': """
HOW TO THINK ABOUT MARKET SIZING - Benedict Evans

THE PROBLEM WITH TAM:

Total Addressable Market (TAM) is often misused:
- "The global X market is $500B"
- "If we get just 1%..."
- These numbers are often meaningless

BETTER FRAMEWORKS:

1. BOTTOM-UP vs TOP-DOWN

Top-down (usually wrong):
"The CRM market is $50B, we'll get 5% = $2.5B"
- Assumes you can actually reach that market
- Ignores product-market fit
- Ignores competition

Bottom-up (usually better):
"There are 10,000 potential customers"
"Each could pay $10K/year"
"We can reach 20% = $20M TAM"
- Based on actual customer understanding
- Realistic about reach
- Grounds assumptions

2. EXPANSION PATH THINKING

Instead of: "The market is X"
Think: "The market starts at X and expands to Y"

Example - Uber:
- Start: Black car service ($4B market)
- Expand: All taxis ($11B market)
- Then: All car travel ($100B+ market)
- Eventually: All transportation?

The initial market is the wedge.
The expansion path is the opportunity.

3. CREATION vs CAPTURE

Some products capture existing spend:
- CRM software replaces salesforce costs
- Streaming replaces cable
- E-commerce replaces retail

Some products create new markets:
- iPhone created new use cases
- Cloud created new businesses
- Social media created new behaviors

Creation is harder to size but often bigger.

SIZING QUESTIONS TO ASK:

1. Who is the actual buyer?
- Not "enterprises" but specific people
- What's their budget?
- How do they buy?

2. What's being replaced?
- Existing software?
- Manual processes?
- Nothing (new behavior)?

3. What's the switching cost?
- Technical integration
- Training
- Organizational change

4. What's the expansion potential?
- Adjacent markets
- Geographic expansion
- Product extensions

RED FLAGS IN MARKET SIZING:

- "We only need 1% of a huge market"
- Citing analyst reports without questioning
- Conflating adjacent markets
- Ignoring competitive dynamics
- Assuming the market stays static

GREEN FLAGS:

- Clear identification of buyer
- Realistic reach assumptions
- Expansion path articulated
- Competition acknowledged
- Bottom-up validation

"A small market that you can dominate is better than
a large market where you're irrelevant."
"""
        },
        {
            'id': 'evans_disruption_patterns',
            'title': 'Disruption Patterns in Technology - Benedict Evans',
            'content': """
DISRUPTION PATTERNS IN TECHNOLOGY - Benedict Evans

CLASSIC DISRUPTION (Christensen Model):

New product is:
- Worse on traditional metrics
- Better on new dimension
- Cheaper or more convenient
- Improves faster than market needs

Example - Digital cameras:
- Worse image quality initially
- More convenient (instant viewing)
- Improved until "good enough"
- Killed film industry

BUT TECH DISRUPTION IS DIFFERENT:

Not always from below:
- iPhone was MORE expensive
- Tesla started at premium
- Salesforce was enterprise-grade

Tech disruption often comes from:
- Changing the basis of competition
- Enabling new behaviors
- Redefining the product

PATTERNS OF TECH DISRUPTION:

1. HORIZONTAL TO VERTICAL
- Start: General purpose tool
- End: Industry-specific solutions
- Example: Excel → industry-specific software

2. BUNDLING TO UNBUNDLING
- Newspaper → multiple digital products
- Cable → streaming services
- Banks → fintech specialists

3. UNBUNDLING TO RE-BUNDLING
- Individual apps → super apps
- Point solutions → platforms
- Cycle continues

4. HARDWARE TO SOFTWARE
- Dedicated devices → apps on phones
- Example: GPS, cameras, music players

5. ON-PREMISE TO CLOUD
- Enterprise software transformation
- SaaS as default
- API-first architecture

6. ANALOG TO DIGITAL TO AI
- First: Digitize the process
- Then: Optimize with software
- Finally: Automate with AI

PREDICTING DISRUPTION:

Look for:
- Customer frustration with incumbents
- New technology enabling new solutions
- Changing customer expectations
- Regulatory shifts
- Generational changes

Questions:
- What can you now do that you couldn't before?
- What will be possible in 5 years?
- What do young people expect?
- What are incumbents ignoring?

INCUMBENT RESPONSES:

Usually fail because:
- Protect existing revenue
- Organizational antibodies
- Wrong metrics
- Too slow

Sometimes succeed when:
- CEO drives transformation
- Separate unit created
- Acquisition of disruptor
- Threat is existential enough

TIMING:

"Being early is the same as being wrong"

Disruption takes longer than expected:
- Technology needs to mature
- Customer behavior needs to change
- Infrastructure needs to build
- Regulation needs to adapt

But when it hits, it's fast:
- Adoption curves are S-curves
- Slow start, rapid growth, plateau
- Hard to predict inflection point

"The future is already here, it's just not evenly distributed."
- William Gibson

Investment implication:
Be patient on timing, aggressive on outcome.
"""
        },
        {
            'id': 'evans_ai_analysis',
            'title': 'AI as Technology Platform - Benedict Evans',
            'content': """
AI AS TECHNOLOGY PLATFORM - Benedict Evans

WHAT KIND OF TECHNOLOGY IS AI?

Historical analogies:
1. Like electricity (enables everything)
2. Like databases (enterprise infrastructure)
3. Like the internet (platform shift)
4. Like SaaS (deployment model change)

Reality: Elements of all, but unique

AI IS AUTOMATION AT SCALE:

Previous automation:
- Assembly lines (physical tasks)
- Spreadsheets (calculation tasks)
- Databases (storage/retrieval tasks)

AI automation:
- Pattern recognition tasks
- Language tasks
- Creative tasks (partially)
- Decision tasks (partially)

The question isn't "will AI take jobs"
It's "which tasks will AI do"

ENTERPRISE AI ADOPTION:

Adoption phases:
1. Point solutions (current)
   - Specific use cases
   - Clear ROI
   - Limited integration

2. Workflow integration (emerging)
   - AI embedded in existing tools
   - Augments human workers
   - Microsoft Copilot model

3. Process transformation (future)
   - Redesign work around AI
   - New job categories
   - New business models

BOTTLENECKS TO AI ADOPTION:

Technical:
- Model accuracy/reliability
- Hallucination problem
- Context limitations
- Integration complexity

Organizational:
- Change management
- Skill gaps
- Process redesign needed
- Unclear ROI measurement

Structural:
- Data quality/access
- Regulatory uncertainty
- Liability questions
- Trust deficit

INVESTMENT OPPORTUNITIES:

Layer analysis:
- Infrastructure (Nvidia, cloud): Concentrated, clear winners
- Models (OpenAI, etc.): Competitive, uncertain
- Tools/middleware: Fragmented, opportunities
- Applications: Early, biggest opportunity

Horizontal vs Vertical:
- Horizontal: Word processor, spreadsheet equivalents
- Vertical: Industry-specific solutions
- Both can win, vertical often easier

Build vs Buy for enterprises:
- Most will buy
- Few will build differentiated models
- Many will fine-tune

WHERE VALUE WILL CONCENTRATE:

Not obvious it follows previous patterns:
- Search: One winner (Google)
- Social: Few winners (FB, Twitter, etc.)
- SaaS: Many winners (fragmented)

AI could be:
- Model layer concentrates (few foundation models)
- Application layer fragments (many winners)
- Or something new

Watch for:
- Data network effects
- Integration moats
- Distribution advantages
- Regulatory capture

THE BIG QUESTIONS:

1. How good does AI get?
- Current: Impressive but limited
- 5 years: Much better at current tasks
- 10 years: New capabilities?

2. How fast is adoption?
- Faster than previous tech transitions?
- Or slower due to complexity?
- Industry variation likely

3. Where does value accrue?
- To model providers?
- To app builders?
- To data owners?
- To end users?

"AI is like teenage sex: everyone talks about it,
nobody really knows how to do it,
everyone thinks everyone else is doing it,
so everyone claims they are doing it."
"""
        },
        {
            'id': 'evans_platform_analysis',
            'title': 'Platform Business Models - Benedict Evans',
            'content': """
PLATFORM BUSINESS MODELS - Benedict Evans

WHAT IS A PLATFORM?

Definition: Enables value creation by third parties.

Key characteristics:
- Two or more sides
- Network effects between sides
- Value increases with participation
- Platform captures portion of value

Not a platform if:
- You create all the value yourself
- No network effects
- Doesn't enable others

PLATFORM TYPES:

1. MARKETPLACES
- Connect buyers and sellers
- Take transaction fee
- Examples: Amazon, Uber, Airbnb

2. DEVELOPER PLATFORMS
- Enable building applications
- Take revenue share or fees
- Examples: iOS, Android, AWS

3. SOCIAL PLATFORMS
- Connect people
- Monetize attention
- Examples: Facebook, TikTok

4. DATA PLATFORMS
- Aggregate data
- Provide insights/services
- Examples: Bloomberg, Nielsen

PLATFORM ECONOMICS:

Revenue models:
- Transaction fee (% of GMV)
- Subscription (per user/month)
- Advertising (attention monetization)
- Take rate (platform fee)

Key metrics:
- GMV (Gross Merchandise Value)
- Take rate (Revenue/GMV)
- CAC (Customer Acquisition Cost)
- LTV (Lifetime Value)
- Net revenue retention

PLATFORM POWER:

Sources of power:
1. Network effects (more users = more value)
2. Data accumulation (better with more usage)
3. Switching costs (hard to leave)
4. Ecosystem (third parties invested)

Limits to power:
- Regulation
- Multi-tenanting (users on multiple platforms)
- Disintermediation risk
- New technology shifts

PLATFORM RISKS:

1. Chicken and egg problem
- Need both sides
- Cold start is hard
- Solutions: Subsidize one side, fake supply

2. Quality control
- Platform reputation depends on participants
- But you don't control them
- Trust and safety challenges

3. Disintermediation
- Participants bypass platform
- After initial connection made
- Example: Craigslist → direct contact

4. Commoditization
- Platform becomes utility
- Pressure on take rates
- Race to bottom

ATTACKING PLATFORMS:

Strategies:
1. Vertical focus (specialize in niche)
2. Geographic focus (local strength)
3. Different modality (photos vs text)
4. Better experience (10x improvement)
5. Lower take rate (price competition)
6. New technology (mobile, AI, crypto)

DEFENDING PLATFORMS:

Strategies:
1. Increase switching costs
2. Vertical integration
3. Acquire threats
4. Continuous innovation
5. Reduce take rate preemptively
6. Regulation as moat

"Platforms are powerful when they seem inevitable."
"""
        }
    ]

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/technology/benedict_evans",
            rate_limit=1.0
        )

    def get_source_name(self) -> str:
        return "Benedict Evans"

    def get_urls(self) -> List[Dict]:
        urls = []

        # Add curated insights first (these always work)
        for insight in self.CURATED_INSIGHTS:
            urls.append({
                'id': insight['id'],
                'url': None,
                'title': insight['title'],
                'type': 'manual',
                'content': insight['content']
            })

        # Try to get essays page
        soup = self.fetch_page(f"{self.BASE_URL}/essays")
        if soup:
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/benedictevans/' in href or '/essays/' in href:
                    full_url = href if href.startswith('http') else self.BASE_URL + href
                    if full_url not in [u.get('url') for u in urls if u.get('url')]:
                        urls.append({
                            'id': href.split('/')[-1] or href.split('/')[-2],
                            'url': full_url,
                            'type': 'essay'
                        })

        # Try to get newsletter archive
        soup = self.fetch_page(f"{self.BASE_URL}/newsletter")
        if soup:
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/newsletter/' in href:
                    full_url = href if href.startswith('http') else self.BASE_URL + href
                    if full_url not in [u.get('url') for u in urls if u.get('url')]:
                        urls.append({
                            'id': href.split('/')[-1] or href.split('/')[-2],
                            'url': full_url,
                            'type': 'newsletter'
                        })

        return urls

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        # Handle manual/curated content
        if item.get('type') == 'manual':
            return {
                'title': item['title'],
                'content': item['content'],
                'metadata': {
                    'author': 'Benedict Evans',
                    'type': 'tech_analysis',
                    'topics': ['technology', 'market_analysis', 'disruption']
                }
            }

        # Scrape web content
        if not item.get('url'):
            return None

        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        title = soup.find('h1')
        title_text = title.get_text(strip=True) if title else 'Unknown'

        content = soup.find('article') or soup.find('[class*="post"]')
        if not content:
            return None

        text = content.get_text(separator='\n', strip=True)

        return {
            'title': title_text,
            'content': text,
            'url': item['url'],
            'metadata': {
                'author': 'Benedict Evans',
                'type': item.get('type', 'essay'),
                'topics': ['technology', 'market_analysis', 'disruption']
            }
        }
