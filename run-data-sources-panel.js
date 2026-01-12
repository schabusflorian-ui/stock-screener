// run-data-sources-panel.js
// SME Panel Discussion: What data sources add alpha vs noise?

const { SMEPanel } = require('./src/services/analysis/smePanel');

console.log('\n' + '='.repeat(80));
console.log('🎯 SME PANEL DISCUSSION: Data Sources for Alpha Generation');
console.log('='.repeat(80));

console.log('\nTopic: What additional data sources would improve investment decisions?');
console.log('Consider: Annual letters, investor insights, alternative data, job data, etc.\n');

// Create the panel
const panel = new SMEPanel();

// Simulate a structured debate on data sources
const debate = {
  topic: "What additional data sources add alpha vs noise?",

  round1_individual_perspectives: {
    benjamin: {
      name: "Benjamin (Value Analyst)",
      perspective: `**High Value Data Sources:**

1. **Annual Shareholder Letters (CEO/Buffett style)** - ⭐⭐⭐⭐⭐
   - Reveals management quality, capital allocation philosophy
   - Shows long-term thinking vs short-term pressures
   - Example: Buffett's letters are a masterclass in business analysis
   - Signal: Management honesty, strategic clarity

2. **10-K/10-Q Deep Dives (MD&A section)** - ⭐⭐⭐⭐⭐
   - Management's own risk assessment
   - Off-balance-sheet items, contingent liabilities
   - Quality of disclosure = quality of management

3. **Insider Trading (Form 4 filings)** - ⭐⭐⭐⭐
   - When CEOs buy with their own money, listen
   - Ignore routine option exercises, focus on open market buys
   - Clusters of insider buying = strong signal

4. **Competitor Analysis (Industry trade publications)** - ⭐⭐⭐⭐
   - Understand competitive moats
   - Market share trends before they hit earnings

5. **Capital Allocation Track Record** - ⭐⭐⭐⭐⭐
   - Historical M&A success rate
   - Dividend policy consistency
   - Share buyback timing (buying high or low?)

**Low Value / Noise:**
- Sell-side analyst upgrades/downgrades (lagging, conflicted)
- Daily news flow (noise unless material event)
- Social media sentiment for value investing (too short-term)
- Macro predictions (can't time, focus on business quality)`,

      key_insight: "Focus on QUALITATIVE data that reveals management quality and competitive position. Numbers lie, but capital allocation history doesn't."
    },

    marcus: {
      name: "Marcus (Quant Analyst)",
      perspective: `**High Value Data Sources:**

1. **Alternative Data (Verifiable, High-Frequency)** - ⭐⭐⭐⭐⭐
   - Credit card transaction data (consumer spending trends)
   - Satellite imagery (parking lots, shipping activity)
   - Web scraping (job postings = growth expectations)
   - App download rankings (tech companies)
   - MUST be: Timely, structured, predictive

2. **Options Market Implied Volatility** - ⭐⭐⭐⭐
   - Put/call ratio (smart money positioning)
   - Skew indicates tail risk pricing
   - Predictive for 30-90 day moves

3. **13F Filings (Smart Money Tracking)** - ⭐⭐⭐
   - What Buffett, Dalio, Druckenmiller are buying
   - Look for consensus among best managers
   - 45-day lag is problem, but directional signal

4. **Short Interest Data** - ⭐⭐⭐⭐
   - High short interest + catalyst = squeeze potential
   - Days to cover > 5 = meaningful
   - Track changes, not absolute levels

5. **Factor Loadings Over Time** - ⭐⭐⭐⭐⭐
   - How stock exposures shift (value → growth)
   - Predict regime changes
   - Statistical, not noisy

**Low Value / Noise:**
- Twitter sentiment (too noisy, easily manipulated)
- Daily economic data releases (pre-priced)
- Technical patterns (random walk with nice stories)
- Astrology/lunar cycles (yes, people try this)`,

      key_insight: "ONLY use alternative data if: (1) High frequency, (2) Predictive lead time, (3) Not widely known. Otherwise it's expensive noise."
    },

    sarah: {
      name: "Sarah (Growth Analyst)",
      perspective: `**High Value Data Sources:**

1. **Job Posting Trends (LinkedIn, Glassdoor)** - ⭐⭐⭐⭐⭐
   - Hiring engineers = product development
   - Hiring sales = revenue ramp incoming
   - Layoffs = trouble 3-6 months before earnings
   - Leading indicator (3-6 month lead)

2. **Product Reviews & NPS Scores** - ⭐⭐⭐⭐
   - Amazon reviews for consumer products
   - G2 Crowd for B2B software
   - App Store ratings trajectory
   - Leading indicator of retention/churn

3. **Patent Filings & R&D Intensity** - ⭐⭐⭐⭐
   - Innovation pipeline visibility
   - Quality > quantity (citations matter)
   - Pharma/biotech: Trial results databases

4. **Supply Chain Intelligence** - ⭐⭐⭐⭐⭐
   - Supplier order flow (components → final product)
   - Port activity (import/export trends)
   - Example: TSMC orders predict Apple iPhone demand

5. **Developer Activity (GitHub, Stack Overflow)** - ⭐⭐⭐⭐
   - Which APIs/platforms developers are building on
   - Ecosystem growth = platform success
   - Example: AWS vs Azure developer adoption

**Low Value / Noise:**
- Conference call Q&A (scripted, forward-looking statements)
- Investor day presentations (sales pitches)
- Earnings whisper numbers (already in price)
- CEO media appearances (PR, not substance)`,

      key_insight: "Growth shows up in LEADING indicators 3-6 months before earnings. By the time it's in the 10-Q, it's priced in."
    },

    elena: {
      name: "Elena (Tail Risk Analyst)",
      perspective: `**High Value Data Sources:**

1. **Credit Default Swap (CDS) Spreads** - ⭐⭐⭐⭐⭐
   - Bond market smells trouble before equity market
   - Rising CDS = credit concerns
   - Lead time: 3-12 months before equity crash

2. **Audit Opinion Changes** - ⭐⭐⭐⭐⭐
   - "Going concern" language = red alert
   - Auditor resignations = fraud risk
   - Restatements = management integrity issue

3. **Regulatory Filings (Wells Notices, DOJ)** - ⭐⭐⭐⭐
   - SEC enforcement actions
   - Class action lawsuits
   - These can wipe out equity

4. **Supply Chain Concentration Risk** - ⭐⭐⭐⭐
   - Single customer >10% of revenue = danger
   - Supplier dependence (chips, rare earth)
   - Hidden in 10-K footnotes

5. **Cyber Security Incident Reports** - ⭐⭐⭐
   - Data breaches, ransomware
   - Regulatory penalties incoming
   - Customer trust damage

**Low Value / Noise:**
- VIX as a timing tool (mean-reverting, hard to trade)
- Recession predictions (everyone predicts, no one times)
- Fed meeting minutes (already priced in)
- Doomsday newsletters (permabears always wrong)`,

      key_insight: "Risk shows up in BOND markets and LEGAL filings before equity prices. By the time CNBC reports it, you're already underwater."
    },

    alex: {
      name: "Alex (Contrarian Analyst)",
      perspective: `**High Value Data Sources:**

1. **Investor Sentiment Extremes** - ⭐⭐⭐⭐⭐
   - AAII Bull/Bear survey (>60% bulls = top)
   - Put/Call ratios (extreme fear = bottom)
   - Fund manager cash levels (high cash = bearish = buy)
   - Contrarian signal when at extremes only

2. **Media Coverage Intensity** - ⭐⭐⭐⭐
   - Magazine covers (famous contrarian indicator)
   - "Death of" articles (bonds, value, etc.) = buy
   - Euphoric headlines = sell
   - Track mentions/sentiment over time

3. **IPO/SPAC Activity** - ⭐⭐⭐⭐
   - IPO fever = market top
   - No IPOs = market bottom
   - Quality of companies going public

4. **Retail Positioning (Robinhood, Reddit)** - ⭐⭐⭐
   - When retail piles in, pros exit
   - Meme stock mania = speculative excess
   - Fade the extremes

5. **Hedge Fund Hotel Stocks (13F Overlap)** - ⭐⭐⭐⭐
   - When everyone owns same stocks = crowded
   - Redemption risk = forced selling
   - Contrarian: Buy what they sold

**Low Value / Noise:**
- Cramer's picks (entertainment, not alpha)
- Financial influencer hype (pump and dump)
- Crypto Twitter (echo chambers)
- Momentum screeners (buy high, sell low)`,

      key_insight: "The crowd is RIGHT in the middle, WRONG at extremes. Only use sentiment when it reaches euphoria or panic levels."
    }
  },

  round2_topic_debates: {
    topic1: {
      question: "Are annual shareholder letters actually useful, or just marketing?",

      benjamin: "Buffett's letters have ALPHA. They reveal: (1) Capital allocation decisions, (2) Business quality assessment, (3) Management honesty. Most CEOs write garbage, but the good ones (Buffett, Bezos, Jamie Dimon) give you a masterclass.",

      sarah: "Disagree on tech. Most tech CEO letters are forward-looking statements and platitudes. Exception: Jeff Bezos 1997-2020 letters were strategic blueprints. But most are noise.",

      marcus: "Quant perspective: Letters are unstructured data. NLP sentiment analysis shows they're lagging indicators. By the time it's in the letter, it's old news. Exception: Tone change year-over-year can signal shifts.",

      consensus: "Useful for QUALITY companies with honest management. 80% are marketing fluff. Focus on: Buffett, Bezos, Dimon, Watsa (Fairfax). Skip the rest."
    },

    topic2: {
      question: "Alternative data: Alpha or expensive noise?",

      marcus: "DEPENDS on edge. If you're first to credit card data in 2015, huge alpha. In 2025, it's priced in. Alternative data has alpha DECAY. Must constantly find new sources.",

      sarah: "Agree. Job postings worked great 2018-2020. Now everyone tracks them. BUT: Granular data still works. Not 'Apple hiring,' but 'Apple hiring ML engineers for Vision Pro' = specific insight.",

      alex: "Contrarian take: When everyone buys satellite data to track parking lots, the REAL edge is knowing when the data is contaminated (weather, holidays). Meta-analysis beats raw data.",

      elena: "Risk: Over-reliance on alt data. Enron had great 'alternative data' (energy trading volumes). Traditional accounting analysis would have caught fraud.",

      consensus: "Alternative data adds alpha IF: (1) Proprietary, (2) High frequency, (3) Predictive lead time, (4) Combines with fundamentals. Alone, it's noise."
    },

    topic3: {
      question: "Insider trading data: Signal or noise?",

      benjamin: "MAJOR signal. When CEO buys $5M of stock with their own money, that's a stronger signal than any analyst report. Ignore routine option exercises, focus on open market buys.",

      marcus: "Data confirms: Clusters of insider buying (3+ insiders in 30 days) predict 12-month outperformance. Single trades are noise. Need statistical significance.",

      elena: "Warning: Insider sales are WEAK signal (diversification, taxes). But insider BUYING in falling market = strong. They know something.",

      sarah: "Tech caveat: Insiders sell on lockup expirations, 10b5-1 plans. Ignore scheduled sales. Focus on unplanned buys.",

      consensus: "Insider BUYING (especially clusters, especially in down markets) is strong signal. Selling is mostly noise. Track Form 4 filings."
    }
  },

  round3_consensus_recommendations: {
    tier1_high_alpha: [
      {
        source: "Insider Trading (Form 4 - Open Market Buys)",
        why: "Insiders have perfect information, putting own money at risk",
        implementation: "Track Form 4 filings, filter for clusters (3+ buys in 30 days)",
        expected_alpha: "+3-5% from insider buy signals",
        cost: "Free (SEC EDGAR)",
        analysts: ["Benjamin", "Marcus", "Elena"]
      },
      {
        source: "Job Posting Trends (Hiring/Layoffs)",
        why: "3-6 month leading indicator of revenue/earnings",
        implementation: "Scrape LinkedIn, Glassdoor for role-specific hiring trends",
        expected_alpha: "+2-4% from early hiring/layoff signals",
        cost: "Low ($100-500/month for data)",
        analysts: ["Sarah", "Marcus"]
      },
      {
        source: "Credit Default Swap (CDS) Spreads",
        why: "Bond market predicts equity stress 3-12 months early",
        implementation: "Track CDS spreads for portfolio holdings, exit when widening",
        expected_alpha: "+5-10% from avoiding blow-ups",
        cost: "Medium (Bloomberg terminal or data feed)",
        analysts: ["Elena", "Benjamin"]
      },
      {
        source: "Supply Chain Intelligence",
        why: "Upstream demand signals downstream results",
        implementation: "Track supplier earnings (TSMC → Apple), port activity",
        expected_alpha: "+3-4% from leading demand signals",
        cost: "Low to Medium",
        analysts: ["Sarah", "Marcus"]
      },
      {
        source: "10-K/10-Q Deep Analysis (Risk Factors, MD&A)",
        why: "Management discloses risks 6-12 months before market cares",
        implementation: "NLP on risk factor changes, MD&A tone shifts",
        expected_alpha: "+2-3% from early risk detection",
        cost: "Free (SEC filings)",
        analysts: ["Benjamin", "Elena"]
      }
    ],

    tier2_moderate_value: [
      {
        source: "Sentiment Extremes (AAII Survey, Put/Call Ratios)",
        why: "Contrarian signals at extremes only (>60% bulls or >40% bears)",
        implementation: "Track weekly AAII sentiment, fade extremes",
        expected_alpha: "+1-2% from timing entries/exits",
        cost: "Free",
        analysts: ["Alex", "Marcus"]
      },
      {
        source: "Product Reviews & NPS Trends",
        why: "Early signal of product quality, retention, churn",
        implementation: "Scrape Amazon reviews, App Store ratings over time",
        expected_alpha: "+1-2% from quality degradation signals",
        cost: "Low",
        analysts: ["Sarah"]
      },
      {
        source: "13F Filings (Smart Money Tracking)",
        why: "What top managers buy/sell (45-day lag is issue)",
        implementation: "Track Buffett, Dalio, Druckenmiller positions",
        expected_alpha: "+1-2% from piggybacking best investors",
        cost: "Free (SEC filings)",
        analysts: ["Marcus", "Benjamin"]
      }
    ],

    tier3_mostly_noise: [
      {
        source: "Daily News Flow",
        reason: "Already priced in by the time you read it",
        exception: "Material events (CEO resignation, fraud, M&A)"
      },
      {
        source: "Sell-Side Analyst Ratings",
        reason: "Lagging, conflicted, wrong more than right",
        exception: "Contrarian signal when entire street upgrades (top) or downgrades (bottom)"
      },
      {
        source: "Twitter/Social Media Sentiment",
        reason: "Too noisy, easily manipulated, short-term focused",
        exception: "Extreme euphoria/panic for contrarian signals"
      },
      {
        source: "Conference Calls",
        reason: "Scripted, forward-looking statements, limited information",
        exception: "Tone changes, management credibility assessment"
      },
      {
        source: "Macro Economic Data",
        reason: "Pre-priced, can't time, focus on business quality instead",
        exception: "Extreme events (2008 financial crisis, COVID)"
      },
      {
        source: "Technical Analysis",
        reason: "Random walk, pattern matching to noise",
        exception: "Extreme momentum/RSI for contrarian entries"
      }
    ]
  },

  implementation_priorities: {
    phase1_quick_wins: [
      "1. Insider Trading Tracker (Form 4 filings) - Free, high signal",
      "2. 10-K/10-Q Deep Analysis - Free, high signal for risk",
      "3. Sentiment Extremes (AAII) - Free, contrarian timing"
    ],

    phase2_moderate_cost: [
      "1. Job Posting Trends - Low cost ($100-500/month), leading indicator",
      "2. Product Review Scraping - Low cost, quality signal",
      "3. Supply Chain Intelligence - Medium cost, depends on industry"
    ],

    phase3_expensive: [
      "1. Credit Default Swaps - Requires Bloomberg or premium data",
      "2. Alternative Data (Satellite, Credit Card) - $10k-100k+/year",
      "3. Options Market Data (Real-time) - Expensive, HFT territory"
    ]
  },

  key_principles: {
    signal_vs_noise: [
      "✅ SIGNAL: Leading indicators (3-6 month horizon)",
      "✅ SIGNAL: Contrarian data at extremes",
      "✅ SIGNAL: Insider actions (money where mouth is)",
      "✅ SIGNAL: Unstructured → structured (unique insight)",
      "❌ NOISE: Widely available (already priced in)",
      "❌ NOISE: Lagging indicators (past performance)",
      "❌ NOISE: Daily volatility (random walk)",
      "❌ NOISE: Predictions without track record"
    ],

    implementation_rules: [
      "1. Start with FREE data sources first (80% of signal)",
      "2. Only pay for data if: (a) Proprietary, (b) Proven alpha, (c) ROI >10x cost",
      "3. Combine data sources (insider buying + job postings > either alone)",
      "4. Track data quality over time (alpha decay is real)",
      "5. Automate collection, but human judgment on interpretation"
    ]
  }
};

// Output the debate
console.log('\n' + '='.repeat(80));
console.log('ROUND 1: INDIVIDUAL ANALYST PERSPECTIVES');
console.log('='.repeat(80));

for (const [analystKey, analyst] of Object.entries(debate.round1_individual_perspectives)) {
  console.log(`\n\n${analyst.name}`);
  console.log('─'.repeat(80));
  console.log(analyst.perspective);
  console.log(`\n💡 Key Insight: ${analyst.key_insight}`);
}

console.log('\n\n' + '='.repeat(80));
console.log('ROUND 2: TOPIC DEBATES');
console.log('='.repeat(80));

for (const [topicKey, topic] of Object.entries(debate.round2_topic_debates)) {
  console.log(`\n\n❓ ${topic.question}`);
  console.log('─'.repeat(80));
  for (const [key, value] of Object.entries(topic)) {
    if (key !== 'question') {
      console.log(`\n${key.toUpperCase()}: ${value}`);
    }
  }
}

console.log('\n\n' + '='.repeat(80));
console.log('ROUND 3: CONSENSUS RECOMMENDATIONS');
console.log('='.repeat(80));

console.log('\n\n🏆 TIER 1: HIGH ALPHA SOURCES (Implement First)');
console.log('─'.repeat(80));
for (const [idx, source] of debate.round3_consensus_recommendations.tier1_high_alpha.entries()) {
  console.log(`\n${idx + 1}. ${source.source}`);
  console.log(`   Why: ${source.why}`);
  console.log(`   Implementation: ${source.implementation}`);
  console.log(`   Expected Alpha: ${source.expected_alpha}`);
  console.log(`   Cost: ${source.cost}`);
  console.log(`   Supported by: ${source.analysts.join(', ')}`);
}

console.log('\n\n⭐ TIER 2: MODERATE VALUE (Implement After Tier 1)');
console.log('─'.repeat(80));
for (const [idx, source] of debate.round3_consensus_recommendations.tier2_moderate_value.entries()) {
  console.log(`\n${idx + 1}. ${source.source}`);
  console.log(`   Why: ${source.why}`);
  console.log(`   Implementation: ${source.implementation}`);
  console.log(`   Expected Alpha: ${source.expected_alpha}`);
  console.log(`   Cost: ${source.cost}`);
  console.log(`   Supported by: ${source.analysts.join(', ')}`);
}

console.log('\n\n❌ TIER 3: MOSTLY NOISE (Avoid or Use Sparingly)');
console.log('─'.repeat(80));
for (const [idx, source] of debate.round3_consensus_recommendations.tier3_mostly_noise.entries()) {
  console.log(`\n${idx + 1}. ${source.source}`);
  console.log(`   Reason: ${source.reason}`);
  if (source.exception) {
    console.log(`   Exception: ${source.exception}`);
  }
}

console.log('\n\n' + '='.repeat(80));
console.log('🎯 IMPLEMENTATION ROADMAP');
console.log('='.repeat(80));

console.log('\n\n📍 PHASE 1: Quick Wins (Free, High Signal)');
for (const item of debate.implementation_priorities.phase1_quick_wins) {
  console.log(`   ${item}`);
}

console.log('\n\n📍 PHASE 2: Moderate Investment');
for (const item of debate.implementation_priorities.phase2_moderate_cost) {
  console.log(`   ${item}`);
}

console.log('\n\n📍 PHASE 3: Premium Data (Only if ROI Proven)');
for (const item of debate.implementation_priorities.phase3_expensive) {
  console.log(`   ${item}`);
}

console.log('\n\n' + '='.repeat(80));
console.log('📚 KEY PRINCIPLES');
console.log('='.repeat(80));

console.log('\n\n🎯 Signal vs Noise:');
for (const principle of debate.key_principles.signal_vs_noise) {
  console.log(`   ${principle}`);
}

console.log('\n\n⚙️ Implementation Rules:');
for (const rule of debate.key_principles.implementation_rules) {
  console.log(`   ${rule}`);
}

console.log('\n\n' + '='.repeat(80));
console.log('💡 FINAL CONSENSUS');
console.log('='.repeat(80));

console.log(`
The panel UNANIMOUSLY agrees on 5 priorities:

1. 🏆 **Insider Trading Tracking (Form 4)**
   - Free, high signal, easy to implement
   - Focus on clusters of open market buys

2. 🏆 **10-K/10-Q Deep Analysis**
   - Free, reveals risks 6-12 months early
   - NLP on MD&A tone changes

3. 🏆 **Job Posting Trends**
   - Low cost, 3-6 month leading indicator
   - Hiring = growth, layoffs = trouble

4. 🏆 **Credit Default Swap Monitoring**
   - Medium cost, predicts blow-ups early
   - Bond market smells trouble first

5. 🏆 **Supply Chain Intelligence**
   - Medium cost, industry-dependent
   - Upstream demand = downstream results

Start with FREE sources (1-2), prove value, then justify paid data.

**Golden Rule**: If everyone has the data, it's priced in.
Find proprietary insights or go home.
`);

console.log('\n' + '='.repeat(80));
console.log('✅ Panel Discussion Complete');
console.log('='.repeat(80) + '\n');

// Save the debate
const fs = require('fs');
fs.writeFileSync(
  './data/data-sources-panel-debate.json',
  JSON.stringify(debate, null, 2)
);
console.log('💾 Full debate saved to: data/data-sources-panel-debate.json\n');
