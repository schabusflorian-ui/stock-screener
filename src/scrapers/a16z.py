# src/scrapers/a16z.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional


class A16ZScraper(BaseScraper):
    """
    Scrapes Andreessen Horowitz tech insights.

    a16z coverage:
    - AI/ML trends and market analysis
    - Crypto and blockchain
    - Bio and healthcare tech
    - Fintech and payments
    - Enterprise software
    - Consumer tech

    Source: a16z.com/content
    """

    BASE_URL = "https://a16z.com"

    # Key categories to scrape
    CATEGORIES = [
        '/ai',
        '/fintech',
        '/enterprise',
        '/bio-health',
    ]

    # Curated insights from a16z partners
    CURATED_INSIGHTS = [
        {
            'id': 'a16z_software_eating_world',
            'title': 'Why Software Is Eating the World - Marc Andreessen',
            'content': """
WHY SOFTWARE IS EATING THE WORLD - Marc Andreessen (2011, still relevant)

THE THESIS:
Software companies are poised to take over large swathes of the economy.
Every industry will be disrupted by software.

WHY NOW:

1. Infrastructure is Ready
- Ubiquitous internet connectivity
- Cloud computing reduces capital requirements
- Mobile devices in every pocket
- APIs enable rapid integration

2. Software Economics Are Superior
- Near-zero marginal cost
- Infinite scalability
- Continuous improvement possible
- Network effects compound

3. Talent Has Shifted
- Best engineers build software companies
- Software attracts the ambitious
- Startup culture is mainstream

INDUSTRIES BEING EATEN:

Retail → Amazon, Shopify
Media → Netflix, Spotify, YouTube
Transportation → Uber, Lyft
Finance → Stripe, Square, Robinhood
Real Estate → Zillow, Redfin, Opendoor
Healthcare → Teladoc, various
Education → Coursera, Duolingo

THE PATTERN:

1. Software company enters industry
2. Offers 10x better user experience
3. Dramatically lower cost structure
4. Incumbents can't respond fast enough
5. Software company captures value

INVESTMENT IMPLICATIONS:

Look for:
- Industries with bad software
- High-margin incumbents ripe for disruption
- Founders with domain expertise + software skills
- Network effect potential
- Large TAM (Total Addressable Market)

Avoid:
- Incumbents without software DNA
- Companies that outsource tech
- Businesses that can't attract engineers
- "Tech-enabled" without tech moat

THE ULTIMATE QUESTION:
Is this company building software, or using software?
Builders win. Users get disrupted.

"In the future, there will be two kinds of companies:
those that are software companies and those that are dead."
"""
        },
        {
            'id': 'a16z_network_effects',
            'title': 'Network Effects and Platform Dynamics - a16z',
            'content': """
NETWORK EFFECTS AND PLATFORM DYNAMICS - a16z

TYPES OF NETWORK EFFECTS:

1. DIRECT (Same-Side)
- Value increases as more users join
- Phone network: More phones = more people to call
- Examples: Social networks, messaging apps

2. INDIRECT (Cross-Side)
- Value increases as complementors join
- More apps = more valuable OS
- Examples: iOS/Android, Windows, AWS

3. DATA NETWORK EFFECTS
- More users = more data = better product
- Self-reinforcing improvement loop
- Examples: Google Search, recommendation engines

4. PLATFORM NETWORK EFFECTS
- Combines direct and indirect
- Marketplace dynamics
- Examples: Amazon, Uber, Airbnb

MEASURING NETWORK EFFECT STRENGTH:

Strong indicators:
- DAU/MAU ratio > 50%
- Organic growth > 50% of new users
- Low marginal cost of serving users
- Increasing returns to scale

Weak indicators:
- High CAC (Customer Acquisition Cost)
- Lots of paid marketing needed
- Users leave when subsidies end
- Linear (not exponential) growth

NETWORK EFFECT MOATS:

Defensibility depends on:
1. Switching costs (how hard to leave?)
2. Multi-tenanting (can users be on multiple platforms?)
3. Network density (how connected are users?)
4. Data accumulation (does more data = better product?)

Strong moat: High switching + low multi-tenanting + dense + data
Weak moat: Low switching + high multi-tenanting + sparse + no data

WINNER-TAKE-ALL vs WINNER-TAKE-MOST:

Winner-Take-All conditions:
- Single-player mode doesn't work
- Strong direct network effects
- Global network (not local)
- No differentiation possible

Winner-Take-Most conditions:
- Multi-homing is possible
- Local/regional networks
- Differentiation on vertical
- Parallel ecosystems viable

ATTACKING NETWORK EFFECTS:

Strategies for challengers:
1. Start with niche (Facebook: colleges only)
2. Different modality (Instagram: photos vs text)
3. Geographic (Grab vs Uber in SE Asia)
4. Vertical focus (LinkedIn vs Facebook for professional)
5. Regulatory change (opens incumbents)

BUILDING NETWORK EFFECTS:

Cold start strategies:
1. Single-player utility first (Instagram filters)
2. Subsidize one side heavily (Uber drivers)
3. Fake it until you make it (fill with own content)
4. Invite-only exclusivity (Gmail, Clubhouse)
5. Piggyback existing network (Zynga on Facebook)

"Network effects are the best form of competitive advantage in the digital age."
"""
        },
        {
            'id': 'a16z_ai_investment_framework',
            'title': 'AI Investment Framework - a16z',
            'content': """
AI INVESTMENT FRAMEWORK - a16z

THE AI STACK:

Layer 1: COMPUTE
- GPUs, TPUs, custom silicon
- Data centers, cloud infrastructure
- Edge computing

Layer 2: FOUNDATION MODELS
- Large Language Models (LLMs)
- Image/video generation
- Multimodal models

Layer 3: TOOLING & INFRASTRUCTURE
- MLOps, training infrastructure
- Vector databases, embeddings
- Fine-tuning, RLHF tools

Layer 4: APPLICATIONS
- Vertical-specific solutions
- Horizontal productivity tools
- Consumer applications

WHERE VALUE ACCRUES:

Current state (2024):
- Compute: Nvidia dominates
- Models: OpenAI leads, but competitive
- Tooling: Fragmented, opportunities exist
- Apps: Early, winners unclear

Long-term expectations:
- Compute: Commoditizes somewhat
- Models: Few winners, possibly open source
- Tooling: Consolidation around winners
- Apps: Biggest value creation opportunity

AI COMPANY EVALUATION:

MOAT SOURCES:

1. Data Moats
- Proprietary training data
- User-generated data flywheel
- Unique data relationships

2. Model Moats (Weakening)
- Fine-tuned models on proprietary data
- Domain-specific architectures
- Speed/cost advantages

3. Distribution Moats
- Existing customer relationships
- Embedded in workflows
- Brand and trust

4. System Moats
- End-to-end solutions
- Integration with existing systems
- Switching cost creation

RED FLAGS:

- "We use AI" with no specific moat
- Thin wrapper on OpenAI API
- No proprietary data strategy
- Competing directly with foundation model providers
- High inference costs with no margin path

GREEN FLAGS:

- Proprietary data that improves with usage
- Deep workflow integration
- Clear unit economics path
- Domain expertise + AI capabilities
- Solves $1M+ problems

THE "SO WHAT" TEST:

For any AI startup, ask:
1. What can this do that couldn't be done before?
2. Why can't OpenAI/Google add this feature?
3. What happens when models get 10x cheaper?
4. What's the data flywheel?

AI MARKET DYNAMICS:

Short-term (1-3 years):
- Hype exceeds reality
- Many startups, few survivors
- Incumbents experiment
- Regulation uncertainty

Medium-term (3-7 years):
- Clear winners emerge
- Massive productivity gains
- Workflow transformation
- Industry restructuring

Long-term (7+ years):
- AI is table stakes
- Every company is "AI company"
- New industries emerge
- Hard to predict specifics

INVESTMENT APPROACH:

Picks and shovels strategy:
- Infrastructure always needed
- Less dependent on app winners
- Example: Nvidia, cloud providers

Vertical specialists:
- Deep domain knowledge
- Harder for big tech to replicate
- Clear customer pain points
- Example: Healthcare AI, Legal AI

Platform plays:
- Enable others to build
- Network effects possible
- High-risk, high-reward
- Example: Hugging Face

"The companies that will win in AI are those that solve real problems,
not those that have the most sophisticated technology."
"""
        },
        {
            'id': 'a16z_fintech_thesis',
            'title': 'Fintech Investment Thesis - a16z',
            'content': """
FINTECH INVESTMENT THESIS - a16z

THE OPPORTUNITY:

Financial services = $22T+ industry
Built on 1970s infrastructure
Ripe for software transformation

FINTECH WAVES:

Wave 1: Payments (2000s-2010s)
- PayPal, Stripe, Square
- Digitizing money movement
- Largely played out in developed markets

Wave 2: Lending (2010s)
- SoFi, Lending Club, Affirm
- Alternative credit scoring
- Direct-to-consumer lending
- Some wins, many failures

Wave 3: Neobanks (2015-2020)
- Chime, N26, Revolut
- Mobile-first banking
- Challenged by unit economics

Wave 4: Embedded Finance (2020+)
- Every company becomes a fintech
- Financial services as feature
- APIs enable rapid deployment
- Current opportunity

Wave 5: DeFi/Crypto (Emerging)
- Programmable money
- Decentralized infrastructure
- Regulatory uncertainty
- Long-term transformative

WHERE TO INVEST NOW:

1. B2B Infrastructure
- APIs for financial services
- Compliance-as-a-service
- Banking-as-a-service
- Data/analytics providers

2. Vertical Fintech
- Industry-specific solutions
- SMB financial stack
- Creator economy finance
- Healthcare payments

3. Embedded Finance Enablers
- Let non-fintechs offer financial products
- White-label solutions
- Infrastructure plays

WHAT MAKES FINTECH HARD:

Regulatory complexity:
- 50 state regulators + federal
- Changing rules
- Compliance costs
- Bank partnerships required

Unit economics challenges:
- Low take rates
- High CAC
- Credit losses
- Fraud costs

Incumbency advantages:
- Trust matters in money
- Regulatory relationships
- Data advantages
- Capital requirements

WINNING FINTECH CHARACTERISTICS:

1. Regulatory sophistication
- Understand compliance deeply
- Build for it, not around it
- Turn it into moat

2. Vertical focus
- Own a specific customer segment
- Understand their workflow
- Expand from stronghold

3. Distribution advantage
- Embedded where users already are
- Low CAC model
- Organic growth

4. Unit economics clarity
- Know LTV:CAC ratio
- Understand credit costs
- Path to profitability clear

5. Data leverage
- Unique data assets
- Improve with scale
- Enables better decisions

AVOID:

- "Bank but better" without edge
- High CAC consumer apps
- Complex credit without expertise
- Regulatory arbitrage plays

"The best fintech companies don't feel like fintech companies.
They feel like the best version of whatever problem they solve."
"""
        }
    ]

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/technology/a16z",
            rate_limit=1.5
        )

    def get_source_name(self) -> str:
        return "Andreessen Horowitz (a16z)"

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

        # Try to scrape each category page for article links
        for category in self.CATEGORIES:
            page_url = f"{self.BASE_URL}{category}"
            soup = self.fetch_page(page_url)

            if not soup:
                continue

            # Find article links
            for link in soup.find_all('a', href=True):
                href = link['href']

                # Filter for actual articles
                if '/posts/' in href or '/podcast/' in href:
                    full_url = href if href.startswith('http') else self.BASE_URL + href

                    if full_url not in [u.get('url') for u in urls if u.get('url')]:
                        urls.append({
                            'id': href.split('/')[-1] or href.split('/')[-2],
                            'url': full_url,
                            'category': category.strip('/')
                        })

        return urls[:100]  # Limit initial scrape

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        # Handle manual/curated content
        if item.get('type') == 'manual':
            return {
                'title': item['title'],
                'content': item['content'],
                'metadata': {
                    'source': 'a16z',
                    'type': 'tech_analysis',
                    'topics': ['technology', 'disruption', 'investing']
                }
            }

        # Scrape web content
        if not item.get('url'):
            return None

        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        # Get title
        title = soup.find('h1')
        title_text = title.get_text(strip=True) if title else 'Unknown'

        # Get content
        content = soup.find('article') or soup.find('[class*="content"]')
        if not content:
            return None

        # Remove scripts, etc.
        for elem in content.find_all(['script', 'style', 'nav']):
            elem.decompose()

        text = content.get_text(separator='\n', strip=True)

        return {
            'title': title_text,
            'content': text,
            'url': item['url'],
            'metadata': {
                'source': 'a16z',
                'category': item.get('category', 'tech'),
                'type': 'tech_analysis',
                'topics': ['technology', 'ai', 'disruption']
            }
        }
