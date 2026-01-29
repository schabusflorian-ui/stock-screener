# src/scrapers/ai_insights.py

from .base_scraper import BaseScraper
from typing import List, Dict, Optional


class AIInsightsScraper(BaseScraper):
    """
    AI and robotics investment insights.

    Curated content on:
    - AI capabilities and limitations
    - AI business models
    - AI investment frameworks
    - Robotics and automation economics
    - Semiconductor industry analysis
    - Autonomous systems
    - Tech market dynamics
    """

    # Manually curated AI investing wisdom
    AI_INSIGHTS = [
        {
            'id': 'ai_investment_framework',
            'title': 'AI Investment Framework',
            'content': """
AI INVESTMENT FRAMEWORK

WHERE VALUE ACCRUES IN AI:

1. COMPUTE LAYER
- Nvidia (GPUs) - Current winner
- Custom chips (Google TPU, Amazon Inferentia)
- Risk: Commoditization over time
- Moat: Manufacturing complexity, CUDA ecosystem

2. MODEL LAYER
- OpenAI, Anthropic, Google, Meta
- Massive capital requirements
- Winner-take-most dynamics likely
- Risk: Open source competition

3. APPLICATION LAYER
- Vertical-specific AI applications
- Workflow integration
- Data moats possible
- Risk: Platform dependence

4. INFRASTRUCTURE LAYER
- Cloud providers (AWS, Azure, GCP)
- MLOps tools (Weights & Biases, etc.)
- Data infrastructure

INVESTMENT CRITERIA FOR AI COMPANIES:

1. Data Advantage
- Proprietary data that improves with use
- Network effects in data collection
- Regulatory moats (healthcare, finance)

2. Workflow Integration
- Deep embedding in customer processes
- High switching costs
- Mission-critical use cases

3. Vertical Focus
- Domain expertise
- Specialized models
- Less competition from giants

4. Unit Economics
- Inference costs declining
- Gross margin trajectory
- Path to profitability

RED FLAGS:

- "We use AI" without specific value prop
- AI as feature vs AI as core product
- No data moat or network effects
- Competition with foundation model providers
- High inference costs with no path to improvement

THE SHOVEL SELLERS:

In gold rushes, sell picks and shovels:
- Nvidia (GPUs)
- Cloud providers (compute)
- Data labeling (Scale AI)
- MLOps tools
- Cybersecurity for AI

These often have better risk/reward than picking AI application winners.
"""
        },
        {
            'id': 'semiconductor_industry_analysis',
            'title': 'Semiconductor Industry Investment Analysis',
            'content': """
SEMICONDUCTOR INDUSTRY INVESTMENT ANALYSIS

THE CHIP STACK - LAYERS OF VALUE:

1. EQUIPMENT MAKERS (Picks & Shovels)
- ASML: Monopoly on EUV lithography
- Applied Materials, Lam Research, KLA
- Tokyo Electron (Japan)
- Critical bottleneck in chip production
- Long-term secular growth

2. FOUNDRIES (Manufacturing)
- TSMC: 90%+ of advanced chips
- Samsung Foundry
- Intel Foundry Services (catching up)
- Massive capex requirements
- Geographic concentration risk (Taiwan)

3. CHIP DESIGNERS
- Nvidia (AI/Gaming GPUs)
- AMD (CPUs, GPUs, Data Center)
- Qualcomm (Mobile)
- Broadcom (Networking)
- Marvell (Data Infrastructure)

4. MEMORY
- Samsung, SK Hynix (Korea)
- Micron (US)
- Commodity-like, cyclical
- HBM (High Bandwidth Memory) for AI is hot

AI CHIP LANDSCAPE 2024-2025:

NVIDIA DOMINANCE:
- 80%+ market share in AI training
- CUDA ecosystem lock-in
- Data center revenue > gaming
- Blackwell architecture (2024)
- Competition emerging but years behind

CHALLENGERS:
- AMD MI300 series: Gaining traction
- Intel Gaudi: Struggling for adoption
- Google TPU: Internal use primarily
- Amazon Trainium/Inferentia: AWS-focused
- Startups: Cerebras, Groq, SambaNova

CUSTOM SILICON TREND:
- Apple M-series: Vertical integration
- Google TPU: Training efficiency
- Amazon Graviton: Cost advantage
- Microsoft Maia: Azure AI
- Meta MTIA: Internal workloads

INVESTMENT THEMES:

1. AI Compute Demand
- 10x growth in AI compute demand expected
- Supply constraints on advanced chips
- Nvidia pricing power
- HBM shortage through 2025

2. Geopolitical Risk
- Taiwan concentration (TSMC)
- China restrictions (CHIPS Act)
- Reshoring/friendshoring
- Supply chain resilience

3. Memory Renaissance
- HBM demand from AI
- DDR5 transition
- Storage for AI workloads

4. Edge AI
- On-device inference
- Qualcomm, MediaTek
- Power efficiency matters
- Privacy/latency benefits

VALUATION CONSIDERATIONS:

Nvidia at 30x+ forward P/E:
- Is the growth priced in?
- How long can dominance last?
- What happens when demand normalizes?

Equipment makers:
- ASML monopoly = premium valuation
- Cyclical but with secular tailwinds
- China exposure risk

Memory:
- Highly cyclical historically
- AI changes demand dynamics?
- Boom/bust patterns

KEY METRICS TO WATCH:
- Data center revenue growth
- AI chip ASPs (average selling price)
- Foundry utilization rates
- HBM capacity additions
- Customer concentration
- China revenue exposure

RISK FACTORS:

1. Cyclicality
- Chip industry is boom/bust
- Inventory corrections happen
- Demand can collapse quickly

2. Competition
- China developing alternatives
- Open-source chip designs
- New architectures

3. Customer Concentration
- Big tech is major buyer
- Vertical integration threat
- Pricing pressure

4. Technology Transitions
- New architectures could disrupt
- Quantum computing (long-term)
- Novel materials

"Semiconductors are the new oil - critical infrastructure
for the digital economy."
"""
        },
        {
            'id': 'humanoid_robotics_investment',
            'title': 'Humanoid Robotics Investment Thesis',
            'content': """
HUMANOID ROBOTICS INVESTMENT THESIS

THE HUMANOID OPPORTUNITY:

Why humanoid form factor:
- Built for human environments
- Can use human tools
- Massive TAM (human labor market)
- General-purpose capability

Market size potential:
- Human labor market: $30T+ annually
- Even 1% replacement = $300B+
- Long-term could exceed auto industry

KEY PLAYERS (2024-2025):

1. TESLA OPTIMUS
Strengths:
- Vertical integration (AI, manufacturing)
- Deep pockets
- Autopilot AI transfer
- Manufacturing scale expertise

Challenges:
- Hardware is hard
- Competition for talent
- Timeline optimism

Strategy: Internal deployment first, then external

2. FIGURE AI
- $675M funding (2024)
- BMW partnership
- Focus on manufacturing
- OpenAI collaboration for AI

3. 1X TECHNOLOGIES (EVE)
- OpenAI backed
- Norwegian company
- Focus on security, logistics

4. AGILITY ROBOTICS (DIGIT)
- Amazon partnership
- Focus on logistics
- More mature than competitors

5. BOSTON DYNAMICS
- Hyundai owned
- Best mobility (Atlas)
- Not focused on cost reduction

6. CHINESE PLAYERS
- Unitree (low-cost leader)
- UBTECH
- Many startups
- Government support

TECHNOLOGY STACK:

Hardware challenges:
- Actuators (joints, muscles)
- Power/battery
- Manipulation (hands)
- Sensors
- Durability
- Cost reduction

Software/AI challenges:
- Perception
- Planning
- Manipulation learning
- Human interaction
- Safety

INVESTMENT TIMELINE:

2024-2025: R&D, demos, limited pilots
2025-2027: Factory deployments, high cost
2027-2030: Cost curve decline, broader adoption
2030+: Consumer applications possible

COST CURVE EXPECTATIONS:

Current (2024): $50K-100K+ per unit
Target (2030): $20K or less
Eventually: Cheaper than annual wage

Tesla's Optimus target: Under $20K at scale

INVESTMENT APPROACHES:

1. Direct equity (if accessible)
- High risk, high reward
- Most are private
- Tesla is public proxy

2. Component suppliers
- Actuator makers
- Sensor companies
- Battery technology

3. Pick-and-shovel plays
- Nvidia (AI training)
- Simulation software
- Manufacturing equipment

4. Adoption beneficiaries
- Companies that will deploy robots
- Warehouse operators
- Manufacturers

WHAT TO WATCH:

1. Manipulation capability
- Can it do useful tasks?
- Dexterity improvements
- Tool use ability

2. Reliability metrics
- Mean time between failures
- Maintenance requirements
- Uptime percentage

3. Unit economics
- Cost per hour vs human
- Deployment costs
- Training time

4. Customer adoption
- Real deployments (not demos)
- Use case expansion
- Customer satisfaction

RISKS:

1. Technical
- Harder than expected
- AI plateaus
- Safety incidents

2. Economic
- Cost reduction slower
- Use cases limited
- Competition intense

3. Social/Regulatory
- Job displacement concerns
- Safety regulations
- Public acceptance

4. Business model
- Capital intensive
- Long development cycles
- Winner-take-all dynamics?

THE BULL CASE:
"The last great hardware opportunity of our lifetime.
Human-like robots will be as transformative as
smartphones and automobiles."

THE BEAR CASE:
"Humanoid robots are a solution looking for a problem.
Specialized robots are more practical. General-purpose
robotics is decades away from practical deployment."

POSITION SIZING:
Given uncertainty, treat as venture-style bet:
- Small allocation to direct plays
- Larger allocation to picks-and-shovels
- Prepare for 5-10 year horizon
"""
        },
        {
            'id': 'ai_agents_investment',
            'title': 'AI Agents and Autonomous Systems Investment',
            'content': """
AI AGENTS AND AUTONOMOUS SYSTEMS INVESTMENT

WHAT ARE AI AGENTS?

Definition: AI systems that can:
- Perceive environment
- Make decisions
- Take actions
- Learn from outcomes
- Operate autonomously

Spectrum of autonomy:
1. Copilots (human in loop)
2. Agents (human on loop)
3. Autonomous systems (human out of loop)

THE AGENT OPPORTUNITY:

Market drivers:
- LLM capabilities explosion
- Reasoning improvements
- Tool use / function calling
- Multi-modal understanding
- Memory and planning

Use cases emerging:
- Customer service agents
- Coding assistants
- Research agents
- Sales development
- Data analysis
- Workflow automation

AGENT CATEGORIES:

1. SINGLE-TASK AGENTS
- Customer support (Intercom, Zendesk AI)
- Coding (GitHub Copilot, Cursor)
- Writing (Jasper, Copy.ai)
- Data analysis (various)

Characteristics:
- Narrow domain
- High accuracy achievable
- Fastest to deploy
- Lower risk

2. WORKFLOW AGENTS
- Multi-step task completion
- Cross-application orchestration
- Examples: Zapier AI, Microsoft Copilot

Characteristics:
- Higher complexity
- Integration challenges
- Needs robust error handling
- Emerging category

3. AUTONOMOUS AGENTS
- Long-running tasks
- Minimal human intervention
- Self-correction
- Examples: AutoGPT concept, Devin (coding)

Characteristics:
- Most ambitious
- Hardest to build
- Highest potential value
- Highest risk

INVESTMENT FRAMEWORK:

WHERE VALUE ACCRUES:

1. Foundation Model Providers
- OpenAI, Anthropic, Google
- Enable agent capabilities
- Take platform cut?

2. Agent Platforms
- Orchestration layers
- Agent marketplaces
- Development tools

3. Vertical Applications
- Domain-specific agents
- Data moat potential
- Workflow integration

4. Infrastructure
- Memory/state management
- Observability
- Security/governance

EVALUATION CRITERIA:

1. Task completion rate
- What % of tasks succeed?
- How do failures degrade?
- Human escalation rate

2. Economic efficiency
- Cost per task vs human
- Speed advantage
- Quality comparison

3. Defensibility
- Why not use ChatGPT directly?
- Data moat exists?
- Integration moat?

4. Trust and safety
- Error handling
- Guardrails
- Audit trails

RED FLAGS:
- "Just a GPT wrapper"
- No unique data/workflow
- Unreliable task completion
- No clear unit economics
- Overpromising autonomy

GREEN FLAGS:
- Deep domain expertise
- Proprietary data advantage
- Proven task completion
- Clear economic value
- Thoughtful safety approach

MARKET DYNAMICS:

The commoditization risk:
- Base models improve rapidly
- OpenAI/Google add features
- Thin wrappers get squeezed

Durable advantages:
- Workflow integration
- Domain data
- Customer relationships
- Regulatory compliance

TIMELINE EXPECTATIONS:

2024: Copilots dominant, agents emerging
2025: Agents for structured workflows
2026-2027: More autonomous capabilities
2028+: Broadly autonomous agents?

INVESTMENT IMPLICATIONS:

Short-term (1-2 years):
- Copilot plays are safer
- Vertical specialists
- Infrastructure providers

Medium-term (3-5 years):
- Agent platforms consolidate
- Clear winners emerge
- Autonomy increases

Long-term (5+ years):
- Agents reshape work
- New job categories
- Economic restructuring

RISKS:

Technical:
- Reliability plateaus
- Hallucination problems
- Security vulnerabilities

Market:
- Big tech captures value
- Commoditization
- Switching costs low

Regulatory:
- AI liability questions
- Industry regulations
- Employment law

"Agents are the killer app for LLMs - but the path
from demo to reliable production is longer than
most investors expect."
"""
        },
        {
            'id': 'autonomous_vehicles_investment',
            'title': 'Autonomous Vehicles Investment Analysis',
            'content': """
AUTONOMOUS VEHICLES INVESTMENT ANALYSIS

STATE OF AUTONOMY (2024-2025):

ROBOTAXI LEADERS:

1. Waymo (Alphabet)
- Most mature technology
- Operating in SF, Phoenix, LA
- 100K+ weekly rides
- No safety driver
- IPO speculation

2. Cruise (GM) - Paused
- Suspended operations (Oct 2023)
- Safety incident setback
- Unclear restart timeline
- Structural challenges

3. Tesla FSD
- Different approach (vision-only)
- Massive data advantage
- V12 shows improvement
- Robotaxi announced for 2024
- Supervised still required

4. Chinese Players
- Baidu Apollo
- Pony.ai
- AutoX
- WeRide
- Regulatory support in China

AUTONOMOUS TRUCKING:

1. Aurora
- Partnered with PACCAR, Volvo
- Freight focus
- Launching 2024
- Highway-focused

2. TuSimple
- Troubled history
- Delisted from NASDAQ
- Pivoting to Asia

3. Kodiak Robotics
- U.S. focused
- Defense applications
- Steady progress

4. Gatik
- Middle-mile focus
- Walmart partnership
- Shorter routes

TECHNOLOGY MATURITY LEVELS:

Level 4 (Geofenced):
- Waymo: Operational
- Cruise: Paused
- Zoox: Testing
- Nuro: Delivery

Level 2+ (Driver Assistance):
- Tesla Autopilot/FSD
- GM Super Cruise
- Ford BlueCruise
- Mercedes Drive Pilot

INVESTMENT CONSIDERATIONS:

BULL CASE:
- $10T+ TAM (mobility + logistics)
- Labor cost elimination
- 24/7 operation
- Safety improvements
- Convenience revolution

BEAR CASE:
- "10 years away for 10 years"
- Edge cases are endless
- Regulatory hurdles
- Liability unclear
- Unit economics challenged

KEY METRICS:

1. Miles between interventions
- Critical safety metric
- Waymo leads
- Tesla improving rapidly

2. ODD (Operational Design Domain)
- Where can it operate?
- Weather limitations
- Geographic constraints

3. Unit economics
- Cost per mile
- Utilization rates
- Maintenance costs

4. Customer adoption
- Wait times
- Satisfaction scores
- Repeat usage

INVESTMENT APPROACHES:

1. Pure-play AV
- Waymo (via Alphabet)
- Aurora (NASDAQ: AUR)
- Tesla (robotaxi optionality)

2. Suppliers/Enablers
- Nvidia (Drive platform)
- Mobileye (Intel)
- Luminar (LiDAR)
- Innoviz (LiDAR)

3. Adoption beneficiaries
- Ride-sharing platforms
- Logistics companies
- Insurance (if safety proven)

4. Losers if AV succeeds
- Traditional auto (driver ownership)
- Parking (utilization increases)
- Auto insurance (fewer accidents)

TIMELINE REALITY CHECK:

2024-2025:
- Waymo continues expansion
- Tesla robotaxi testing
- Aurora truck pilot
- Limited scale

2026-2028:
- Broader robotaxi availability
- Truck corridors operational
- Unit economics proven?
- Regulatory clarity

2030+:
- Mass market potential
- Personal vehicle autonomy
- Industry restructuring

RISKS:

Safety/Regulatory:
- High-profile accidents
- Regulatory backlash
- Liability framework

Technology:
- Edge case plateau
- Weather limitations
- Adversarial attacks

Business model:
- High capex per vehicle
- Utilization challenges
- Competition with Uber/Lyft

Competitive:
- Big tech resources
- Startup capital needs
- Winner-take-most?

THE TESLA QUESTION:

Unique position:
- Largest real-world data
- Vision-only approach
- Manufacturing scale
- Vertical integration
- Consumer revenue while developing

Risks:
- Different tech approach
- Safety concerns
- Elon timeline optimism
- Regulatory approval needed

If Tesla succeeds:
- Stock re-rates massively
- Transportation transformed
- Current valuation justified

If Tesla fails:
- Other players continue
- Likely industry consolidation
- Waymo as survivor

INVESTMENT FRAMEWORK:

Size position for uncertainty:
- High potential, long timeline
- Binary outcomes possible
- Portfolio, not single bet

Watch for inflection points:
- Regulatory approvals
- Safety data milestones
- Unit economics proof
- Competitive dynamics

"Autonomous vehicles are inevitable - the question
is timing and who captures the value."
"""
        },
        {
            'id': 'robotics_investment_thesis',
            'title': 'Robotics Investment Thesis',
            'content': """
ROBOTICS INVESTMENT THESIS

THE OPPORTUNITY:

Labor costs rising + robot costs falling = massive adoption curve

Key inflection points:
- Manufacturing robots: Already economic
- Warehouse robots: Rapidly becoming economic
- Humanoid robots: 5-10 years from economic viability

SEGMENTS:

1. INDUSTRIAL ROBOTICS (Mature)
- Fanuc, ABB, KUKA
- Commoditizing
- Growth in emerging markets
- Margin pressure

2. LOGISTICS/WAREHOUSE (High Growth)
- Amazon Robotics (Kiva)
- Locus Robotics
- Symbotic
- Massive TAM as e-commerce grows

3. AUTONOMOUS VEHICLES (Uncertain)
- Robotaxis: Waymo, Cruise
- Trucks: Aurora, TuSimple
- Regulatory uncertainty
- High capital requirements

4. HUMANOID ROBOTS (Speculative)
- Tesla Optimus
- Figure AI
- 1X Technologies
- High risk, high reward

WHAT TO LOOK FOR:

1. Unit Economics
- Cost per task vs human labor
- Payback period for customers
- Utilization rates

2. Technical Moat
- Proprietary perception systems
- Manipulation capabilities
- Fleet learning

3. Go-to-Market
- Robotics-as-a-Service (RaaS) models
- Integration with existing workflows
- Customer concentration

4. Competitive Dynamics
- Can big tech/auto replicate?
- Patent protection
- Talent moat

RISKS:

- Hardware is hard (margins, reliability)
- Long sales cycles
- Customer concentration
- Big tech competition
- Regulatory (especially autonomous vehicles)

HISTORICAL LESSON:

Many robotics companies have failed despite good technology:
- Rethink Robotics (Baxter)
- Anki
- Jibo

Common failure modes:
- Technology ahead of economics
- Poor product-market fit
- Undercapitalized for hardware development

Success requires: Right technology + Right economics + Right timing
"""
        },
        {
            'id': 'ai_hype_cycles',
            'title': 'AI Hype Cycles and Investment Timing',
            'content': """
AI HYPE CYCLES AND INVESTMENT TIMING

HISTORICAL AI HYPE CYCLES:

1. 1960s - Early AI (GOFAI)
- Expert systems
- Symbolic AI
- Result: AI Winter #1

2. 1980s - Neural Networks Revival
- Backpropagation
- Commercial applications
- Result: AI Winter #2

3. 2012-2022 - Deep Learning Era
- ImageNet breakthrough
- GPUs + Big Data
- Massive funding

4. 2022+ - Foundation Models/LLMs
- ChatGPT moment
- Generative AI
- Current cycle

PATTERNS TO WATCH:

1. The Hype Peak
- "This changes everything"
- Valuations detach from reality
- Every company adds "AI" to name
- We are likely here now (2024)

2. The Trough
- Promised capabilities don't materialize
- Funding dries up
- Consolidation
- Best companies emerge stronger

3. The Plateau
- Real applications mature
- Sustainable business models
- Realistic expectations

INVESTMENT IMPLICATIONS:

In Hype Phase:
- Avoid overvalued pure-plays
- Look for picks-and-shovels
- Incumbent beneficiaries often better
- Focus on cash flow, not story

In Trough Phase:
- Best buying opportunities
- Survivors are battle-tested
- Still avoiding crowds

CURRENT CYCLE SPECIFICS (2024):

Signs of peak hype:
- Every startup is "AI-first"
- Massive funding at high valuations
- Public market premiums for AI exposure
- Limited revenue traction at many companies

What's different this time:
- Real, demonstrable capabilities
- Major tech companies all-in
- Actual products shipping
- Revenue at leading companies

What's the same:
- Overestimating short-term impact
- Underestimating long-term impact
- Most startups will fail
- Winners will be huge

STRATEGY:

1. Accept we don't know the winner
2. Bet on infrastructure/picks-and-shovels
3. Prefer profitable tech giants adding AI
4. Avoid money-losing pure-plays at high valuations
5. Keep dry powder for the trough
"""
        },
        {
            'id': 'ai_moat_analysis',
            'title': 'AI Company Moat Analysis',
            'content': """
AI COMPANY MOAT ANALYSIS

TYPES OF AI MOATS:

1. DATA MOATS

Strong data moat characteristics:
- Proprietary data source
- Data improves with usage
- Network effects in data collection
- Regulatory barriers to replication

Examples:
- Tesla: Billions of real driving miles
- Google: Search query data
- Scale AI: Labeled data relationships

Weak data moat signs:
- Public data only
- Data doesn't improve model
- Easy to replicate collection
- No network effects

2. MODEL MOATS (Weakening)

Historically:
- Best models = competitive advantage
- High barriers to entry
- Talent scarcity

Now:
- Open source closing gap
- Foundation models commoditizing
- Fine-tuning more important than training
- Model performance converging

Model moat now requires:
- Unique architecture for specific domain
- Massive scale (only for largest players)
- Continuous improvement infrastructure

3. DISTRIBUTION MOATS

The real moat in AI:
- Existing customer relationships
- Embedded in workflows
- Brand trust
- Switching costs created

Examples:
- Microsoft: Office integration with Copilot
- Salesforce: CRM integration with Einstein
- Adobe: Creative tool integration with Firefly

4. SYSTEM MOATS

End-to-end solutions harder to replicate:
- Multiple components integrated
- Data flows between components
- Optimization across stack
- Deep customer integration

Example: Tesla's full stack
- Hardware (cars, FSD computer)
- Software (Autopilot, OS)
- Data (fleet learning)
- Manufacturing (cost advantage)

5. TALENT MOATS (Temporary)

AI talent concentration matters:
- Top researchers create step changes
- Culture attracts more talent
- But talent is mobile
- Not sustainable alone

EVALUATING AI COMPANIES:

Score each moat (1-5):
□ Data moat strength
□ Model differentiation
□ Distribution advantage
□ System integration
□ Talent concentration

Strong AI companies: 15+ total
Risky AI companies: <10 total

QUESTIONS TO ASK:

1. What data does the company have that others don't?
2. Does the model improve with more usage?
3. How embedded is the product in customer workflows?
4. Can OpenAI/Google easily replicate this?
5. What happens when models get 10x cheaper?

THE ULTIMATE MOAT TEST:

"If [Big Tech Company] launched this exact product tomorrow,
would customers switch?"

If yes → Weak moat, avoid
If no → Investigate why not
"""
        },
        {
            'id': 'ai_valuation_framework',
            'title': 'AI Company Valuation Framework',
            'content': """
AI COMPANY VALUATION FRAMEWORK

WHY TRADITIONAL METRICS FAIL:

P/E Ratio:
- Most AI companies unprofitable
- Investing heavily in growth
- Earnings not meaningful

Revenue Multiples:
- Better but still challenging
- Revenue quality varies widely
- Growth rates very different

THE AI VALUATION CHALLENGE:

Uncertain variables:
1. How big does the market get?
2. Who wins market share?
3. What margins are achievable?
4. When does profit materialize?

VALUATION APPROACHES:

1. TAM-BASED VALUATION

Start with market opportunity:
- Current market size
- Growth rate assumptions
- Company's potential share
- Terminal margin assumptions

Example:
- TAM in 5 years: $100B
- Company market share: 10%
- Revenue: $10B
- Net margin at scale: 20%
- Profit: $2B
- 25x multiple: $50B valuation

Problems:
- TAM often overstated
- Market share speculative
- Margins uncertain
- Discount rate matters hugely

2. RULE OF X (Growth-Adjusted)

For SaaS/software:
Rule of 40: Growth + Margin > 40% is good

For AI companies:
May need Rule of 60+ given higher growth expectations

Formula:
Revenue growth rate + FCF margin

Example:
- 80% growth + (-10%) margin = 70 (excellent)
- 30% growth + 5% margin = 35 (mediocre)

3. COHORT ECONOMICS

Analyze unit economics:
- Customer acquisition cost (CAC)
- Lifetime value (LTV)
- Payback period
- Net revenue retention

For AI specifically:
- Inference cost per user
- Gross margin trajectory
- Scaling economics

4. OPTIONALITY VALUATION

AI companies often have embedded options:
- Platform expansion potential
- Adjacent market opportunities
- Technology breakthroughs

Value like options:
- Base case + Option value
- Higher volatility = higher option value

5. COMPARABLE TRANSACTIONS

Look at:
- M&A in the space
- Private funding rounds
- Public company multiples

Adjust for:
- Growth rate differences
- Moat strength
- Market position

PRACTICAL FRAMEWORK:

For each AI investment:

1. Base case scenario
- Conservative market size
- Reasonable share capture
- Achievable margins
→ What's the company worth?

2. Bull case scenario
- Market expands
- Company wins
- Margins exceed expectations
→ Upside potential

3. Bear case scenario
- Market disappoints
- Competition intensifies
- Margins compressed
→ Downside risk

4. Weight scenarios
- Bull: 20%
- Base: 50%
- Bear: 30%

5. Calculate expected value
- Compare to current price
- Margin of safety required

RED FLAGS IN AI VALUATIONS:

- "Just needs 1% of market"
- Ignoring inference costs
- Assuming no competition
- Projecting current growth forever
- No path to profitability

"Price is what you pay. Value is what you get."
- Warren Buffett (applies to AI too)
"""
        },
        {
            'id': 'tech_platform_dynamics',
            'title': 'Technology Platform Investment Dynamics',
            'content': """
TECHNOLOGY PLATFORM INVESTMENT DYNAMICS

PLATFORM ECONOMICS:

What makes a platform:
- Multi-sided market
- Network effects between sides
- Infrastructure that others build on
- Value from orchestration, not production

Types of platforms:
1. Marketplaces (Amazon, Airbnb)
2. Operating systems (iOS, Windows)
3. Infrastructure (AWS, Stripe)
4. Social/Content (YouTube, TikTok)

PLATFORM VS LINEAR BUSINESS:

Linear business:
- Owns the means of production
- Scales by adding capacity
- Margins capped by costs
- Value in operations

Platform business:
- Owns the orchestration layer
- Scales by adding participants
- Margins expand with scale
- Value in network effects

WHY PLATFORMS WIN:

1. Zero marginal cost of distribution
2. Supply scales with demand
3. Data improves the product
4. Winner-take-most dynamics
5. High barriers to entry once established

PLATFORM LIFECYCLE:

1. SEED
- Build initial supply
- Solve chicken-and-egg
- Often subsidize one side
- Find initial product-market fit

2. GROWTH
- Network effects kick in
- Rapid user growth
- Platform captures value
- Competition intensifies

3. MATURITY
- Growth slows
- Margins optimize
- Regulation increases
- Adjacent expansion

4. DISRUPTION
- New platforms emerge
- Technology shifts
- User preferences change
- Bundle/unbundle cycles

PLATFORM MOATS:

Strong moats:
- Direct network effects (more users = more value)
- Cross-side effects (more supply = more demand)
- Data network effects (usage improves product)
- High switching costs

Weak moats:
- Low switching costs
- Multi-tenanting easy
- No data advantage
- Commodity supply

VALUATION CONSIDERATIONS:

Platform premium:
- Higher multiple for platform vs linear
- Justified by margin expansion potential
- Network effects durability
- TAM expansion

Key metrics:
- Gross merchandise value (GMV)
- Take rate trajectory
- Unit economics
- Engagement/retention
- Supply/demand balance

RED FLAGS:
- Unsustainable subsidies
- Negative unit economics
- High multi-tenanting
- Regulatory exposure
- Single point of failure

CURRENT PLATFORM OPPORTUNITIES:

1. AI Platforms
- Foundation model providers
- Agent platforms
- Industry-specific AI platforms

2. Creator Economy
- Tools for creators
- Monetization platforms
- Distribution platforms

3. B2B Platforms
- Industry marketplaces
- SaaS ecosystems
- API platforms

4. Fintech Platforms
- Embedded finance
- Payment infrastructure
- DeFi protocols

INVESTMENT APPROACH:

Early stage platforms:
- Bet on team and vision
- Watch for product-market fit
- Network effects evidence
- Capital efficiency

Mature platforms:
- Moat durability
- Margin trajectory
- Competitive position
- Regulatory risk

"The best platforms make the pie bigger for everyone,
while capturing a share of the expanded pie."
"""
        },
        {
            'id': 'cloud_computing_investment',
            'title': 'Cloud Computing Investment Analysis',
            'content': """
CLOUD COMPUTING INVESTMENT ANALYSIS

THE CLOUD LANDSCAPE:

HYPERSCALERS:
1. AWS (Amazon) - Market leader
2. Azure (Microsoft) - Fastest growing
3. GCP (Google) - Strong in AI/ML
4. Alibaba Cloud - China leader
5. Oracle Cloud - Enterprise focus

MARKET DYNAMICS:

Cloud adoption curve:
- Still early innings (30-40% of workloads)
- Secular growth continues
- AI accelerating adoption
- Hybrid/multi-cloud emerging

Growth rates:
- Overall market: 15-20% CAGR
- AI/ML services: 30%+ CAGR
- Individual companies vary

CLOUD LAYERS:

1. Infrastructure (IaaS)
- Compute, storage, networking
- Commodity-like, margin pressure
- Scale advantages matter

2. Platform (PaaS)
- Databases, containers, serverless
- Higher margins
- Stickier than IaaS

3. Software (SaaS)
- Application layer
- Highest margins
- Direct customer relationship

AI CLOUD OPPORTUNITY:

New revenue streams:
- AI/ML training infrastructure
- Inference APIs
- Model hosting
- Vector databases

Who benefits:
- All hyperscalers adding AI
- Nvidia GPU demand
- AI-native SaaS
- MLOps tools

INVESTMENT APPROACHES:

1. Hyperscalers
- Amazon (AWS ~15% of revenue, 60%+ operating income)
- Microsoft (Azure growing 25%+, Copilot monetization)
- Google (GCP losses improving, AI leadership)

2. Cloud-Native Software
- Snowflake, Datadog, MongoDB
- Pure-play cloud beneficiaries
- Higher growth, higher valuations

3. Infrastructure Enablers
- Nvidia (GPUs for cloud)
- Arista (data center networking)
- Pure Storage (flash storage)

4. Security
- CrowdStrike, Palo Alto
- Security spending resilient
- AI enhancing products

VALUATION FRAMEWORK:

For cloud software:
- Rule of 40+ (Growth + FCF margin)
- EV/Revenue vs growth rate
- Net revenue retention (>120% is elite)
- Gross margins (>75% is good)

For hyperscalers:
- Segment cloud from other businesses
- Look at operating margins
- Capex efficiency
- Customer acquisition

CURRENT THEMES:

1. AI Infrastructure Buildout
- Massive capex from hyperscalers
- GPU/AI chip demand
- Data center construction

2. Efficiency Focus
- Customers optimizing spend
- Cost optimization tools
- Better unit economics

3. Vertical Clouds
- Industry-specific solutions
- Compliance/regulatory needs
- Healthcare, finance, government

4. Edge Computing
- Latency-sensitive applications
- 5G enablement
- IoT integration

RISKS:

1. Cyclicality
- Tech spending cuts
- Optimization headwinds
- Budget scrutiny

2. Competition
- Price pressure
- Feature commoditization
- Open source alternatives

3. Concentration
- AWS dominance
- Vendor lock-in concerns
- Regulatory attention

4. Execution
- Capex discipline
- AI transition costs
- Talent competition

THE AI CATALYST:

Why AI accelerates cloud:
- Massive compute requirements
- Data gravity (data in cloud, AI in cloud)
- Model hosting complexity
- Continuous training needs

Who wins:
- Hyperscalers with AI infrastructure
- GPU providers (Nvidia)
- AI-native SaaS
- Data platform companies

"Cloud computing is the foundation of the AI era.
Every AI application runs on cloud infrastructure."
"""
        },
        {
            'id': 'big_tech_investment_analysis',
            'title': 'Big Tech (Magnificent 7) Investment Analysis',
            'content': """
BIG TECH INVESTMENT ANALYSIS

THE MAGNIFICENT 7:

1. APPLE (AAPL)
Thesis: Hardware ecosystem + services
Moat: Vertical integration, brand, switching costs
AI exposure: On-device AI, Siri improvements
Risk: iPhone maturity, China exposure
Key metrics: iPhone units, services growth

2. MICROSOFT (MSFT)
Thesis: Enterprise software + cloud + AI
Moat: Distribution (Office, Windows), Azure
AI exposure: OpenAI partnership, Copilot
Risk: Antitrust, AI commoditization
Key metrics: Azure growth, Copilot revenue

3. ALPHABET/GOOGLE (GOOGL)
Thesis: Advertising + cloud + AI
Moat: Search monopoly, YouTube, data
AI exposure: Gemini, AI in search, GCP
Risk: Search disruption, antitrust
Key metrics: Search share, GCP growth

4. AMAZON (AMZN)
Thesis: E-commerce + AWS + advertising
Moat: Logistics, AWS infrastructure
AI exposure: AWS AI services, Alexa
Risk: Retail margins, competition
Key metrics: AWS revenue/margins, ad growth

5. META (META)
Thesis: Social + advertising + AI/VR
Moat: User network, advertiser relationships
AI exposure: Llama models, AI ad targeting
Risk: VR losses, regulation, youth engagement
Key metrics: User engagement, VR adoption

6. NVIDIA (NVDA)
Thesis: AI compute infrastructure
Moat: CUDA ecosystem, R&D leadership
AI exposure: Core business (GPUs for AI)
Risk: Valuation, competition, cyclicality
Key metrics: Data center revenue, margins

7. TESLA (TSLA)
Thesis: EVs + Energy + Autonomy + Robots
Moat: Vertical integration, manufacturing, data
AI exposure: FSD, Optimus, AI training
Risk: Competition, execution, valuation
Key metrics: Deliveries, FSD progress, margins

PORTFOLIO CONSTRUCTION:

Index weight matters:
- Magnificent 7 = 30%+ of S&P 500
- Concentration risk
- Passive flows support prices

Active approach:
- Over/underweight based on view
- Consider valuations
- Diversify across themes

VALUATION COMPARISON (2024):

Premium valuations justified by:
- AI optionality
- Cash flow generation
- Market position
- Secular growth

Watch for:
- Valuation expansion limits
- Growth deceleration
- Multiple compression
- Interest rate sensitivity

AI POSITIONING:

Best positioned for AI:
1. Nvidia - Infrastructure
2. Microsoft - Enterprise AI
3. Google - AI research depth

Strong AI potential:
4. Meta - AI in ads, open source models
5. Amazon - AWS AI services
6. Apple - On-device AI

Uncertain AI position:
7. Tesla - Robotics/autonomy bet

RISKS BY COMPANY:

Regulatory:
- Google (antitrust, search)
- Apple (App Store)
- Meta (privacy, competition)
- Amazon (labor, antitrust)

Competitive:
- Apple (China, premium fatigue)
- Meta (TikTok, Apple privacy)
- Amazon (Temu, Shein)

Execution:
- Tesla (margin pressure, competition)
- Meta (VR investment)
- Google (AI transition)

Macro:
- All sensitive to ad spending
- Consumer spending impact
- Interest rates affect valuations

INVESTMENT FRAMEWORK:

Core holdings approach:
- Smaller positions across Mag 7
- Overweight highest conviction
- Accept concentration risk
- Long-term horizon

Tactical approach:
- Trade relative value
- React to earnings
- Manage position sizing
- Take profits on runs

THE AI QUESTION:

Each company's AI thesis:
- Nvidia: Pure AI play, valuation reflects it
- Microsoft: Best AI distribution, Copilot key
- Google: Existential need to win, resources exist
- Amazon: AWS AI services, less direct
- Meta: Open source leader, ad monetization
- Apple: Slow and steady, on-device focus
- Tesla: Moonshot (FSD, Optimus)

Position sizing should reflect:
- AI upside conviction
- Base business strength
- Valuation discipline
- Risk tolerance

"The best companies of the next decade will likely
come from this group - but which ones, and at what
valuation, matters enormously."
"""
        },
        {
            'id': 'tech_disruption_patterns',
            'title': 'Technology Disruption Patterns for Investors',
            'content': """
TECHNOLOGY DISRUPTION PATTERNS FOR INVESTORS

CLASSIC DISRUPTION THEORY:

Clayton Christensen's Framework:
- Disruptors enter at low end
- Incumbents ignore them (low margin)
- Disruptors move upmarket
- Eventually displace incumbents

Classic examples:
- Netflix vs Blockbuster
- Amazon vs traditional retail
- iPhone vs Nokia
- Digital cameras vs film

WHY INCUMBENTS FAIL:

1. Innovator's Dilemma
- New tech initially worse on key metrics
- Incumbents optimize for existing customers
- Disruptors improve faster
- By the time threat is clear, too late

2. Business Model Conflict
- New business model cannibalizes old
- Existing customers don't want change
- Organization resists
- Incentives misaligned

3. Cultural Inertia
- "That's not how we do things"
- Success breeds complacency
- Talent attracted elsewhere
- Risk aversion

PATTERNS IN TECH DISRUPTION:

1. THE PRICE COLLAPSE
Technology gets 10x cheaper:
- Cloud storage
- Compute
- Bandwidth
- Enables new use cases

2. THE PLATFORM SHIFT
New platform emerges:
- Mobile disrupted desktop
- Cloud disrupted on-premise
- AI disrupting everything
- Value migrates to new platform

3. THE UNBUNDLING
Single product splits:
- Media (cable → streaming)
- Banking (banks → fintech)
- Software (suites → best-of-breed)

4. THE REBUNDLING
Fragments consolidate:
- Streaming (Disney+, HBO Max)
- SaaS suites (Microsoft 365)
- Super apps (WeChat)

5. THE DATA ADVANTAGE
Whoever has data wins:
- Google in search
- Facebook in social
- Tesla in autonomous driving

IDENTIFYING DISRUPTION:

Signs of vulnerability:
- High margins with poor service
- Complex, fragmented industry
- Middlemen adding little value
- Technology debt
- Customer frustration

Signs of disruptor success:
- 10x better on key metric
- New business model
- Strong team
- Capital availability
- Market timing right

INVESTMENT IMPLICATIONS:

Betting on disruptors:
- High risk, high reward
- Most fail
- Winners can be huge
- Portfolio approach

Avoiding disruption:
- Identify vulnerable incumbents
- Short or avoid
- Timing is hard
- Incumbents often fight back

Disruption-proof investments:
- Platform winners
- Picks-and-shovels
- Regulated monopolies
- Essential infrastructure

CURRENT DISRUPTION WAVES:

1. AI Disrupting:
- Customer service
- Coding
- Content creation
- Knowledge work
- Search?

2. EVs Disrupting:
- Internal combustion
- Oil industry
- Auto dealers
- Auto parts suppliers

3. Fintech Disrupting:
- Traditional banking
- Insurance
- Wealth management
- Payments

4. Remote Work Disrupting:
- Commercial real estate
- Business travel
- Urban retail
- Corporate headquarters

LESSONS FOR INVESTORS:

1. Disruption takes longer than expected
- But then happens faster than expected
- The "long fuse, big bang" pattern

2. Incumbents can adapt
- Microsoft reinvented (cloud, AI)
- Disney pivoted (streaming)
- Don't assume failure

3. Regulation matters
- Can protect incumbents (banking)
- Can enable disruptors (telecom)
- Changes the game

4. Cash flow buys time
- Profitable companies can adapt
- Cash-burning companies die first

5. The customer decides
- Better product wins eventually
- Price isn't everything
- Experience matters

"The question isn't whether disruption will happen.
It's whether you're investing in the disruptor or the disrupted."
"""
        },
        {
            'id': 'ai_safety_investment_implications',
            'title': 'AI Safety and Governance Investment Implications',
            'content': """
AI SAFETY AND GOVERNANCE INVESTMENT IMPLICATIONS

WHY AI SAFETY MATTERS FOR INVESTORS:

1. Regulatory risk
- Governments will regulate AI
- Compliance costs
- Potential restrictions

2. Liability risk
- AI errors cause harm
- Who is responsible?
- Insurance implications

3. Reputational risk
- Public backlash to AI failures
- Brand damage
- Customer trust

4. Business model risk
- Regulation could restrict use cases
- Safety requirements add costs
- Competition from "safer" alternatives

AI SAFETY LANDSCAPE:

Key concerns:
- Misinformation/deepfakes
- Bias and discrimination
- Privacy violations
- Job displacement
- Autonomous weapons
- Existential risk (long-term)

Regulatory responses:
- EU AI Act (comprehensive)
- US Executive Order
- China AI regulations
- Industry self-regulation

INVESTMENT IMPLICATIONS:

WINNERS FROM AI SAFETY:

1. AI Safety Companies
- Anthropic (Constitutional AI)
- Scale AI (data quality)
- Alignment research firms
- Evaluation/testing companies

2. Compliance Tools
- Model monitoring
- Bias detection
- Audit trails
- Governance platforms

3. Trusted Incumbents
- Microsoft (responsible AI focus)
- Google DeepMind (safety research)
- Companies with safety credibility

4. Industry Verticals
- Healthcare AI (regulated = moat)
- Financial AI (compliance focus)
- Government/defense AI

LOSERS FROM AI SAFETY:

1. Reckless Deployers
- "Move fast, break things" with AI
- Companies ignoring safety
- Regulatory targets

2. Pure Open Source
- Unrestricted model release
- Potential regulation
- Liability questions

3. Deepfake Tools
- Regulatory crackdown likely
- Platform bans
- Reputational issues

4. Surveillance Tech
- Privacy backlash
- Regulatory restrictions
- Export controls

SAFETY AS COMPETITIVE ADVANTAGE:

Why safety can be a moat:
- Trust matters for enterprise adoption
- Regulatory compliance is hard
- First-mover in responsible AI
- Brand premium for safe AI

Companies doing well:
- Anthropic: Safety-first positioning
- Microsoft: Responsible AI framework
- Google: Safety research investment

REGULATORY SCENARIOS:

Scenario 1: Light touch
- Self-regulation dominates
- Innovation continues
- Current leaders win
- Probability: 30%

Scenario 2: Moderate regulation
- EU AI Act type
- Compliance costs increase
- Big tech advantaged (can afford)
- Probability: 50%

Scenario 3: Heavy regulation
- Strict licensing required
- Limited applications
- Incumbents protected
- Probability: 20%

PORTFOLIO IMPLICATIONS:

1. Diversify across scenarios
- Some regulated exposure
- Some innovation exposure
- Balance risk/reward

2. Favor companies with:
- Safety research programs
- Compliance infrastructure
- Enterprise focus
- Government relationships

3. Avoid companies with:
- Reckless deployment
- Consumer exposure without safety
- Regulatory red flags
- Ethical controversies

4. Monitor regulatory developments
- EU AI Act implementation
- US policy evolution
- China regulations
- Industry standards

QUESTIONS TO ASK:

For any AI investment:
1. How is the company approaching safety?
2. What's the regulatory exposure?
3. Could regulation help or hurt?
4. Is safety a competitive advantage?
5. What's the liability framework?

"The AI companies that win will be those that are
both innovative AND responsible. Safety isn't just
ethics - it's good business."
"""
        }
    ]

    def __init__(self):
        super().__init__(
            output_dir="knowledge_base/technology/ai_insights",
            rate_limit=1.0
        )

    def get_source_name(self) -> str:
        return "AI & Robotics Investment Insights"

    def get_urls(self) -> List[Dict]:
        return [
            {
                'id': item['id'],
                'url': None,
                'title': item['title'],
                'type': 'manual',
                'content': item['content']
            }
            for item in self.AI_INSIGHTS
        ]

    def scrape_item(self, item: Dict) -> Optional[Dict]:
        if item.get('type') == 'manual':
            return {
                'title': item['title'],
                'content': item['content'],
                'metadata': {
                    'type': 'investment_framework',
                    'topics': ['technology', 'ai', 'robotics', 'disruption']
                }
            }
        return None
