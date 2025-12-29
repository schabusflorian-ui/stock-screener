# src/scrapers/ark_invest.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional
import io


class ARKInvestScraper(BaseScraper):
    """
    Scrapes ARK Invest research on disruptive innovation.

    ARK coverage:
    - Artificial Intelligence
    - Robotics and Automation
    - Energy Storage
    - DNA Sequencing
    - Blockchain
    - Autonomous Vehicles

    Key resources:
    - Big Ideas Report (annual)
    - Research articles
    - Webinars and presentations

    Source: ark-invest.com/articles, ark-invest.com/big-ideas
    """

    BASE_URL = "https://ark-invest.com"

    # Curated insights from ARK research
    CURATED_INSIGHTS = [
        {
            'id': 'ark_disruptive_innovation',
            'title': 'Disruptive Innovation Framework - ARK Invest',
            'content': """
DISRUPTIVE INNOVATION FRAMEWORK - ARK Invest

WHAT ARK LOOKS FOR:

Five innovation platforms:
1. Artificial Intelligence
2. Robotics & Automation
3. Energy Storage
4. DNA Sequencing/Gene Editing
5. Blockchain Technology

These platforms are:
- Converging (AI + Robotics = Autonomous systems)
- Experiencing exponential cost declines
- Creating new markets
- Displacing incumbents

EXPONENTIAL COST DECLINES:

Wright's Law: Every doubling of cumulative production
reduces costs by a consistent percentage.

Historical examples:
- Computing: Moore's Law (2x performance / 2 years)
- Solar: 40% cost decline per doubling
- Batteries: 28% cost decline per doubling
- DNA sequencing: Faster than Moore's Law

Implication: Today's expensive tech becomes tomorrow's commodity.

THE CONVERGENCE THESIS:

Technologies don't operate in isolation:
- AI + Batteries + Sensors = Autonomous Vehicles
- AI + Robotics = Intelligent Automation
- DNA Sequencing + AI = Precision Medicine
- Blockchain + AI = Trustless Intelligent Systems

Convergence creates:
- 10x improvement possibilities
- New market categories
- Unexpected applications
- Winner-take-most dynamics

INVESTMENT APPROACH:

ARK focuses on:
1. Technology leaders in each platform
2. Companies benefiting from convergence
3. Pure-play disruptors (not diversified conglomerates)
4. High growth over profitability (early stage)

Contrarian elements:
- Ignore short-term earnings
- Focus on 5-year potential
- High conviction, concentrated portfolios
- Accept high volatility

VALUATION FRAMEWORK:

Traditional metrics fail for disruptive companies:
- P/E meaningless for growth companies
- Revenue growth more important than margins
- TAM expansion is the key variable

ARK methodology:
1. Model long-term market opportunity
2. Estimate company's potential market share
3. Apply normalized margins at scale
4. Discount to present value
5. Compare to current price

RISK FACTORS:

Platform risks:
- Technology doesn't scale as expected
- Regulatory barriers
- Incumbent response
- Competition within platform

Company-specific risks:
- Execution failure
- Management issues
- Capital requirements
- Valuation compression

Portfolio risks:
- High correlation in downturns
- Concentrated positions
- Style rotation
- Duration risk (distant profits)

TIME HORIZON:

"The stock market is a device for transferring money
from the impatient to the patient." - Buffett

ARK's view:
- 5+ year investment horizon
- Volatility is opportunity
- Short-term pain for long-term gain
- Conviction through cycles
"""
        },
        {
            'id': 'ark_ai_thesis',
            'title': 'AI Investment Thesis - ARK Invest',
            'content': """
AI INVESTMENT THESIS - ARK Invest

THE AI OPPORTUNITY:

ARK's view: AI could add $200T+ to global GDP by 2030.

Key drivers:
1. Software 2.0: AI writes better code than humans
2. Knowledge worker productivity: 10x improvements
3. New products/services: Currently impossible
4. Cost deflation across industries

AI INVESTMENT LAYERS:

Layer 1: Compute (Semiconductors)
- Nvidia (dominant in training GPUs)
- AMD, Intel (competition emerging)
- Custom silicon (Google TPU, Amazon)
- Specialized AI chips startups

Layer 2: Cloud/Infrastructure
- Hyperscalers (AWS, Azure, GCP)
- AI-specific infrastructure
- Edge computing
- Data centers

Layer 3: Foundation Models
- OpenAI, Anthropic, Google
- Open source alternatives
- Vertical-specific models

Layer 4: Applications
- Enterprise AI tools
- Consumer AI products
- Vertical solutions
- AI-native companies

WHERE ARK IS INVESTING:

Primary focus:
- AI hardware (especially Nvidia)
- AI-enabled software companies
- Companies leveraging AI for competitive advantage

Selection criteria:
- Clear AI integration
- Proprietary data advantages
- Scalable AI applications
- Strong R&D investment

AUTONOMOUS SYSTEMS:

Robotaxis:
- Tesla Autopilot/FSD
- Waymo, Cruise
- Potential for $10T+ market
- Hardware + software + data flywheel

Drones:
- Delivery (Amazon, Wing)
- Industrial inspection
- Agriculture
- Military/defense

Industrial Automation:
- Manufacturing robots
- Warehouse automation
- Logistics optimization
- Quality control

AI PRODUCTIVITY GAINS:

Knowledge work transformation:
- Coding: 10x productivity (GitHub Copilot)
- Writing: 5x productivity
- Research: 100x faster
- Customer service: 90% automation potential

Enterprise adoption curve:
- 2023-2025: Experimentation
- 2025-2027: Integration
- 2027-2030: Transformation

RISKS AND CONCERNS:

Technical:
- AI capability plateau
- Hallucination/reliability issues
- Energy consumption
- Talent concentration

Economic:
- Job displacement
- Wealth concentration
- Regulatory backlash
- Security concerns

Investment:
- Valuation bubbles
- Technology obsolescence
- Competitive dynamics
- Execution risk

POSITION SIZING:

Given uncertainty:
- Diversify across AI stack
- Higher allocation to picks-and-shovels
- Accept high volatility
- 5+ year time horizon
"""
        },
        {
            'id': 'ark_robotics_thesis',
            'title': 'Robotics Investment Thesis - ARK Invest',
            'content': """
ROBOTICS INVESTMENT THESIS - ARK Invest

THE OPPORTUNITY:

Global labor costs: $30T+ annually
Robot costs falling exponentially
Convergence point approaching

ARK projection: Robots could generate $24T+ in revenue by 2030.

ROBOTICS SEGMENTS:

1. INDUSTRIAL ROBOTS (Mature)
Market leaders: Fanuc, ABB, KUKA
Current use: Manufacturing, assembly
Trend: Collaborative robots (cobots)
Growth: 10-15% annually

2. LOGISTICS/WAREHOUSE ROBOTS (High Growth)
Market leaders: Amazon Robotics, Symbotic
Current use: Fulfillment, sorting
Trend: Full warehouse automation
Growth: 30%+ annually

3. SERVICE ROBOTS (Emerging)
Current use: Cleaning, delivery
Examples: iRobot, delivery bots
Trend: Hospitality, healthcare
Growth: 40%+ annually

4. AUTONOMOUS VEHICLES (Pre-Commercial)
Leaders: Tesla, Waymo, Cruise
Current use: Testing, limited deployment
Trend: Robotaxis, autonomous trucks
Growth: Exponential once proven

5. HUMANOID ROBOTS (Early Stage)
Players: Tesla Optimus, Figure
Current use: R&D, demos
Trend: General-purpose robots
Growth: Speculative

COST CURVES:

Industrial robots:
- 2015: $100K average
- 2023: $40K average
- 2030: $15K projected (ARK)

Autonomous driving:
- Sensor costs falling 70%+ per year
- Compute costs following Moore's Law
- Data advantage compounds

LABOR VS ROBOT ECONOMICS:

When robots become cheaper than labor:
- Minimum wage: $15/hr = $30K/year
- Robot cost: Falling toward $15-20K
- Robot works 24/7 (3x human hours)
- No benefits, sick days, turnover

Payback period approaching 1 year
Then adoption accelerates rapidly

INVESTMENT APPROACH:

Direct plays:
- Robot manufacturers
- Autonomous vehicle developers
- Sensor/component suppliers

Indirect plays:
- Companies using robots for advantage
- Software for robot operations
- AI/ML for robot intelligence

WHAT TO WATCH:

Technical milestones:
- Humanoid dexterity improvements
- Autonomous driving safety metrics
- Robot reliability/uptime
- AI reasoning capabilities

Adoption indicators:
- Enterprise robot deployments
- Robotaxi miles/passengers
- Warehouse automation rates
- Manufacturing penetration

RISKS:

Technical:
- Harder than expected
- Safety issues
- Reliability challenges

Economic:
- Job displacement backlash
- Regulatory restrictions
- Union resistance

Competitive:
- Chinese competition
- Commoditization
- Winner-take-all risks

"Robots are not the future. They are the present being deployed."
"""
        },
        {
            'id': 'ark_energy_storage',
            'title': 'Energy Storage Investment Thesis - ARK Invest',
            'content': """
ENERGY STORAGE INVESTMENT THESIS - ARK Invest

THE OPPORTUNITY:

Energy storage is foundational to:
- Electric vehicles
- Renewable energy grid
- Consumer electronics
- Autonomous systems

ARK view: Battery costs will decline 40% by 2030.

BATTERY TECHNOLOGY:

Lithium-ion evolution:
- 2010: $1,100/kWh
- 2020: $137/kWh
- 2023: $100/kWh
- 2030: $60/kWh (ARK projection)

Cost decline drivers:
- Manufacturing scale
- Chemistry improvements
- Supply chain optimization
- New materials

BEYOND LITHIUM-ION:

Solid-state batteries:
- Higher energy density
- Faster charging
- Safer
- 3-5 years from commercial scale

Sodium-ion:
- Cheaper materials
- Good for grid storage
- Lower energy density

Other technologies:
- Flow batteries
- Hydrogen fuel cells
- Compressed air
- Various chemistries

ELECTRIC VEHICLES:

EV adoption curve:
- 2023: ~15% of new car sales
- 2030: 60-70% (ARK projection)
- Faster than consensus expects

Key drivers:
- Cost parity approaching
- Charging infrastructure growing
- Consumer preference shifting
- Regulatory push

Winners:
- Tesla (vertical integration)
- Battery suppliers (CATL, LG, Panasonic)
- Material suppliers (lithium, nickel, cobalt)

GRID STORAGE:

Renewable + Storage = Baseload replacement

Solar + battery becomes cheaper than:
- New coal plants (already)
- New gas plants (by 2025)
- Existing plants (by 2030)

Implications:
- Utility model transformation
- Distributed energy growth
- Grid modernization required

INVESTMENT FRAMEWORK:

Direct exposure:
- EV manufacturers (Tesla)
- Battery manufacturers
- Battery material suppliers

Indirect exposure:
- Charging infrastructure
- Mining companies
- Utility-scale storage developers

Value chain analysis:
- Most value in cells/packs
- Materials are commodity
- Integration is key

RISKS:

Technology:
- New chemistry disruption
- Safety issues
- Recycling challenges

Supply chain:
- Lithium supply constraints
- China dominance
- Geopolitical risks

Adoption:
- Charging infrastructure gaps
- Consumer hesitancy
- Grid integration challenges

Competition:
- Chinese manufacturers
- Overcapacity risk
- Margin pressure

"The energy transition is happening faster than most realize."
"""
        }
    ]

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/technology/ark_invest",
            rate_limit=2.0
        )

    def get_source_name(self) -> str:
        return "ARK Invest Research"

    def get_urls(self) -> List[Dict]:
        urls = []

        # Add curated insights first
        for insight in self.CURATED_INSIGHTS:
            urls.append({
                'id': insight['id'],
                'url': None,
                'title': insight['title'],
                'type': 'manual',
                'content': insight['content']
            })

        # Try to scrape articles page
        articles_url = f"{self.BASE_URL}/articles"
        soup = self.fetch_page(articles_url)

        if soup:
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '/articles/' in href and href != '/articles/':
                    full_url = href if href.startswith('http') else self.BASE_URL + href
                    if full_url not in [u.get('url') for u in urls if u.get('url')]:
                        urls.append({
                            'id': href.split('/')[-1] or href.split('/')[-2],
                            'url': full_url,
                            'type': 'article'
                        })

        # Try Big Ideas page (usually PDFs)
        big_ideas_url = f"{self.BASE_URL}/big-ideas"
        soup = self.fetch_page(big_ideas_url)

        if soup:
            for link in soup.find_all('a', href=True):
                href = link['href']
                if '.pdf' in href.lower() or 'big-ideas' in href:
                    full_url = href if href.startswith('http') else self.BASE_URL + href
                    if full_url not in [u.get('url') for u in urls if u.get('url')]:
                        urls.append({
                            'id': 'big_ideas_' + href.split('/')[-1],
                            'url': full_url,
                            'type': 'report'
                        })

        return urls

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        # Handle manual content
        if item.get('type') == 'manual':
            return {
                'title': item['title'],
                'content': item['content'],
                'metadata': {
                    'source': 'ARK Invest',
                    'type': 'research',
                    'topics': ['technology', 'disruption', 'ai', 'robotics', 'energy']
                }
            }

        # Handle PDFs
        if item.get('url') and '.pdf' in item['url'].lower():
            return self._scrape_pdf(item)

        # Regular web page
        if not item.get('url'):
            return None

        soup = self.fetch_page(item['url'])
        if not soup:
            return None

        title = soup.find('h1')
        title_text = title.get_text(strip=True) if title else 'ARK Research'

        content = soup.find('article') or soup.find('[class*="content"]') or soup.find('main')
        if not content:
            return None

        text = content.get_text(separator='\n', strip=True)

        # Determine topics from content
        topics = ['technology', 'disruption']
        text_lower = text.lower()
        if 'artificial intelligence' in text_lower or ' ai ' in text_lower:
            topics.append('ai')
        if 'robot' in text_lower or 'automat' in text_lower:
            topics.append('robotics')
        if 'autonomous' in text_lower or 'self-driving' in text_lower:
            topics.append('autonomous_vehicles')
        if 'battery' in text_lower or 'energy storage' in text_lower:
            topics.append('energy')
        if 'dna' in text_lower or 'genomic' in text_lower:
            topics.append('biotech')

        return {
            'title': title_text,
            'content': text,
            'url': item['url'],
            'metadata': {
                'source': 'ARK Invest',
                'type': item.get('type', 'article'),
                'topics': topics
            }
        }

    def _scrape_pdf(self, item: Dict) -> Optional[Dict]:
        """Handle PDF reports"""
        try:
            import PyPDF2
        except ImportError:
            self.logger.warning("PyPDF2 not installed, skipping PDF")
            return None

        pdf_content = self.fetch_pdf(item['url'])
        if not pdf_content:
            return None

        try:
            pdf_file = io.BytesIO(pdf_content)
            reader = PyPDF2.PdfReader(pdf_file)

            text = ""
            for page in reader.pages[:50]:  # Limit pages
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n\n"

            return {
                'title': f"ARK Big Ideas - {item['id']}",
                'content': text,
                'url': item['url'],
                'metadata': {
                    'source': 'ARK Invest',
                    'type': 'research_report',
                    'topics': ['technology', 'ai', 'robotics', 'disruption']
                }
            }
        except Exception as e:
            self.logger.error(f"Error processing PDF: {e}")
            return None
