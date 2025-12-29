#!/usr/bin/env python3
"""
Seed the knowledge base with curated investment wisdom.

This script populates the vector store with foundational investment knowledge
from famous investors, covering key topics like:
- Valuation methods
- Competitive moats
- Risk management
- Psychology and behavior
- Growth investing
- Value investing principles

Usage:
    python seed_knowledge.py
"""

import sys
import os

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
sys.path.insert(0, PROJECT_ROOT)

from src.services.ai.vector_store import VectorStore
from src.services.ai.embeddings import EmbeddingGenerator


# Investment wisdom organized by topic
INVESTMENT_WISDOM = [
    # === Valuation Principles ===
    {
        "content": "The margin of safety concept is the cornerstone of investment success. Buy securities at a significant discount to intrinsic value to protect against errors in analysis and unforeseen events. The bigger the discount, the greater your margin of safety.",
        "metadata": {
            "source": "Value Investing Principles",
            "author": "Benjamin Graham",
            "topics": ["valuation", "risk", "margin_of_safety"],
            "primary_topic": "valuation"
        }
    },
    {
        "content": "Price is what you pay, value is what you get. A wonderful company at a fair price is far better than a fair company at a wonderful price. Focus on the intrinsic value of the business, not the current market quotation.",
        "metadata": {
            "source": "Value Investing Principles",
            "author": "Warren Buffett",
            "topics": ["valuation", "quality", "price_vs_value"],
            "primary_topic": "valuation"
        }
    },
    {
        "content": "Intrinsic value is the discounted present value of all future cash flows. Use conservative estimates for growth rates and discount rates. When the margin of safety is large enough, errors in estimation become less important.",
        "metadata": {
            "source": "Valuation Methodology",
            "author": "Investment Analysis",
            "topics": ["valuation", "dcf", "intrinsic_value"],
            "primary_topic": "valuation"
        }
    },
    {
        "content": "P/E ratios must be viewed in context of growth rates, competitive position, and interest rates. A low P/E alone does not indicate value; it may reflect deteriorating fundamentals. High P/E can be justified by sustained above-average growth.",
        "metadata": {
            "source": "Valuation Methodology",
            "author": "Investment Analysis",
            "topics": ["valuation", "pe_ratio", "growth"],
            "primary_topic": "valuation"
        }
    },
    {
        "content": "Enterprise Value to EBITDA (EV/EBITDA) is useful for comparing companies with different capital structures. It helps identify companies trading below their cash-generating ability. However, capital expenditure requirements must be considered separately.",
        "metadata": {
            "source": "Valuation Methodology",
            "author": "Investment Analysis",
            "topics": ["valuation", "ev_ebitda", "metrics"],
            "primary_topic": "valuation"
        }
    },

    # === Competitive Moats ===
    {
        "content": "Economic moats protect business returns from competitive erosion. The five sources of moat are: 1) Intangible assets (brands, patents), 2) Switching costs, 3) Network effects, 4) Cost advantages, 5) Efficient scale. Wide moats sustain high returns on capital.",
        "metadata": {
            "source": "Competitive Advantage Analysis",
            "author": "Morningstar",
            "topics": ["moats", "competitive_advantage", "quality"],
            "primary_topic": "moats"
        }
    },
    {
        "content": "Network effects create the most powerful moats. Each additional user increases value for all users, creating a virtuous cycle. Examples include payment networks, social platforms, and marketplaces. These moats strengthen over time.",
        "metadata": {
            "source": "Competitive Advantage Analysis",
            "author": "Investment Analysis",
            "topics": ["moats", "network_effects", "technology"],
            "primary_topic": "moats"
        }
    },
    {
        "content": "High switching costs lock in customers and protect pricing power. Look for products deeply embedded in customer workflows, significant retraining requirements, or high data migration costs. Enterprise software and financial services often have high switching costs.",
        "metadata": {
            "source": "Competitive Advantage Analysis",
            "author": "Investment Analysis",
            "topics": ["moats", "switching_costs", "customer_retention"],
            "primary_topic": "moats"
        }
    },
    {
        "content": "Brand moats derive from pricing power and customer loyalty. Strong brands allow premium pricing and reduce marketing costs. The moat exists when customers willingly pay more for the brand versus generic alternatives.",
        "metadata": {
            "source": "Competitive Advantage Analysis",
            "author": "Investment Analysis",
            "topics": ["moats", "brands", "pricing_power"],
            "primary_topic": "moats"
        }
    },
    {
        "content": "Durable competitive advantage shows up in consistently high returns on invested capital (ROIC). Companies with ROIC above 15% for 10+ years likely have real moats. Watch for declining ROIC as a sign of moat erosion.",
        "metadata": {
            "source": "Competitive Advantage Analysis",
            "author": "Investment Analysis",
            "topics": ["moats", "roic", "quality"],
            "primary_topic": "moats"
        }
    },

    # === Risk Management ===
    {
        "content": "Risk comes from not knowing what you're doing. The best risk control is deep knowledge of your investments. Circle of competence matters - stick to businesses you truly understand.",
        "metadata": {
            "source": "Risk Management Principles",
            "author": "Warren Buffett",
            "topics": ["risk", "circle_of_competence", "knowledge"],
            "primary_topic": "risk"
        }
    },
    {
        "content": "Position sizing is critical to portfolio survival. Never put so much in one position that a 50% decline would cause permanent capital impairment. The Kelly Criterion suggests betting a fraction proportional to your edge.",
        "metadata": {
            "source": "Risk Management Principles",
            "author": "Investment Analysis",
            "topics": ["risk", "position_sizing", "portfolio"],
            "primary_topic": "risk"
        }
    },
    {
        "content": "Leverage amplifies both gains and losses. Avoid or minimize leverage; it has destroyed many investors. Debt at the company level deserves extra scrutiny during economic stress - high debt increases equity risk exponentially.",
        "metadata": {
            "source": "Risk Management Principles",
            "author": "Investment Analysis",
            "topics": ["risk", "leverage", "debt"],
            "primary_topic": "risk"
        }
    },
    {
        "content": "Distinguish between volatility and permanent capital loss. Temporary price declines are opportunities; permanent impairment is risk. Focus on business fundamentals, not price movements. Volatility creates opportunity for the patient investor.",
        "metadata": {
            "source": "Risk Management Principles",
            "author": "Howard Marks",
            "topics": ["risk", "volatility", "permanent_loss"],
            "primary_topic": "risk"
        }
    },
    {
        "content": "The biggest risk is overpaying for growth. When high expectations are priced in, even good results can lead to poor returns. The risk is not in the business but in the price you pay relative to its value.",
        "metadata": {
            "source": "Risk Management Principles",
            "author": "Investment Analysis",
            "topics": ["risk", "valuation", "expectations"],
            "primary_topic": "risk"
        }
    },

    # === Psychology and Behavior ===
    {
        "content": "Be fearful when others are greedy, and greedy when others are fearful. Market extremes create the best opportunities. Emotional discipline separates successful investors from the crowd.",
        "metadata": {
            "source": "Investment Psychology",
            "author": "Warren Buffett",
            "topics": ["psychology", "contrarian", "emotions"],
            "primary_topic": "psychology"
        }
    },
    {
        "content": "Mr. Market offers prices daily but you're not obligated to trade. His mood swings create opportunities, not obligations. Think of the market as a manic-depressive partner who offers to buy or sell at varying prices.",
        "metadata": {
            "source": "Investment Psychology",
            "author": "Benjamin Graham",
            "topics": ["psychology", "mr_market", "patience"],
            "primary_topic": "psychology"
        }
    },
    {
        "content": "Loss aversion causes investors to hold losers too long and sell winners too early. The disposition effect destroys returns. Evaluate each position on its current merits, not your cost basis.",
        "metadata": {
            "source": "Investment Psychology",
            "author": "Behavioral Finance",
            "topics": ["psychology", "loss_aversion", "behavioral_bias"],
            "primary_topic": "psychology"
        }
    },
    {
        "content": "Confirmation bias leads investors to seek information supporting existing beliefs. Actively seek disconfirming evidence. The best investment decisions come from rigorous devil's advocacy.",
        "metadata": {
            "source": "Investment Psychology",
            "author": "Behavioral Finance",
            "topics": ["psychology", "confirmation_bias", "critical_thinking"],
            "primary_topic": "psychology"
        }
    },
    {
        "content": "Patience is the most important virtue in investing. Great opportunities are rare; most of the time, the best action is no action. Compound interest works best when given decades to work.",
        "metadata": {
            "source": "Investment Psychology",
            "author": "Charlie Munger",
            "topics": ["psychology", "patience", "long_term"],
            "primary_topic": "psychology"
        }
    },

    # === Growth Investing ===
    {
        "content": "Growth investing works when you buy companies that can reinvest at high rates of return for extended periods. The key is runway - how long can the company sustain high growth? Look for large total addressable markets.",
        "metadata": {
            "source": "Growth Investing Principles",
            "author": "Investment Analysis",
            "topics": ["growth", "reinvestment", "tam"],
            "primary_topic": "growth"
        }
    },
    {
        "content": "Growth at a reasonable price (GARP) combines growth and value. Use PEG ratios (P/E divided by growth rate) to find attractively priced growth. PEG below 1 suggests potential undervaluation for growth companies.",
        "metadata": {
            "source": "Growth Investing Principles",
            "author": "Peter Lynch",
            "topics": ["growth", "garp", "peg_ratio"],
            "primary_topic": "growth"
        }
    },
    {
        "content": "Sustainable growth requires reinvestment moats. Companies must have places to deploy capital at high returns. When reinvestment opportunities dry up, growth companies become value traps.",
        "metadata": {
            "source": "Growth Investing Principles",
            "author": "Investment Analysis",
            "topics": ["growth", "reinvestment", "capital_allocation"],
            "primary_topic": "growth"
        }
    },
    {
        "content": "Revenue growth without margin expansion may not create value. Look for operating leverage - fixed costs spread over growing revenue should improve margins. Gross margin trends reveal pricing power.",
        "metadata": {
            "source": "Growth Investing Principles",
            "author": "Investment Analysis",
            "topics": ["growth", "margins", "operating_leverage"],
            "primary_topic": "growth"
        }
    },

    # === Value Investing Specifics ===
    {
        "content": "Avoid value traps by focusing on quality and catalysts. A cheap stock without improvement catalysts may stay cheap forever. Look for management changes, asset sales, or operational improvements.",
        "metadata": {
            "source": "Value Investing Principles",
            "author": "Investment Analysis",
            "topics": ["value", "value_traps", "catalysts"],
            "primary_topic": "value"
        }
    },
    {
        "content": "Deep value works when assets can be liquidated or redeployed. Net-net stocks (trading below net current asset value) offer strong downside protection. However, these situations are rare in modern markets.",
        "metadata": {
            "source": "Value Investing Principles",
            "author": "Benjamin Graham",
            "topics": ["value", "deep_value", "net_nets"],
            "primary_topic": "value"
        }
    },
    {
        "content": "Quality value focuses on wonderful businesses at fair prices rather than fair businesses at wonderful prices. The power of compounding makes quality worth paying up for - a great business compounds wealth for decades.",
        "metadata": {
            "source": "Value Investing Principles",
            "author": "Warren Buffett",
            "topics": ["value", "quality", "compounding"],
            "primary_topic": "value"
        }
    },

    # === Capital Allocation ===
    {
        "content": "Capital allocation is the most important job of management. The best managers reinvest in high-ROIC projects, make value-creating acquisitions, and return excess cash to shareholders. Poor allocators destroy value.",
        "metadata": {
            "source": "Capital Allocation",
            "author": "Investment Analysis",
            "topics": ["management", "capital_allocation", "quality"],
            "primary_topic": "management"
        }
    },
    {
        "content": "Share buybacks create value only when shares trade below intrinsic value. Buying back overvalued shares transfers wealth from remaining shareholders to sellers. Watch for buybacks funded by debt.",
        "metadata": {
            "source": "Capital Allocation",
            "author": "Investment Analysis",
            "topics": ["management", "buybacks", "shareholder_returns"],
            "primary_topic": "management"
        }
    },
    {
        "content": "Dividend policy signals management confidence. Growing dividends indicate sustainable earnings and good capital allocation. Dividend cuts often precede larger problems.",
        "metadata": {
            "source": "Capital Allocation",
            "author": "Investment Analysis",
            "topics": ["management", "dividends", "income"],
            "primary_topic": "management"
        }
    },

    # === Financial Analysis ===
    {
        "content": "Free cash flow is more reliable than earnings. Cash can't be manipulated as easily as accounting earnings. Compare operating cash flow to net income - persistent gaps signal potential accounting issues.",
        "metadata": {
            "source": "Financial Analysis",
            "author": "Investment Analysis",
            "topics": ["financials", "cash_flow", "quality_of_earnings"],
            "primary_topic": "financials"
        }
    },
    {
        "content": "Return on Equity (ROE) measures profitability but can be inflated by leverage. Return on Invested Capital (ROIC) better measures business quality as it includes debt. High ROIC with low debt signals true quality.",
        "metadata": {
            "source": "Financial Analysis",
            "author": "Investment Analysis",
            "topics": ["financials", "roe", "roic", "metrics"],
            "primary_topic": "financials"
        }
    },
    {
        "content": "Working capital trends reveal business health. Growing receivables relative to revenue may signal revenue recognition issues. Rising inventory could mean demand problems. Cash conversion cycle shows operational efficiency.",
        "metadata": {
            "source": "Financial Analysis",
            "author": "Investment Analysis",
            "topics": ["financials", "working_capital", "balance_sheet"],
            "primary_topic": "financials"
        }
    },

    # === Market Cycles ===
    {
        "content": "Markets cycle between fear and greed. Bull markets end in euphoria and excess valuations. Bear markets end in despair and extreme undervaluation. Understanding where we are in the cycle guides position sizing.",
        "metadata": {
            "source": "Market Cycles",
            "author": "Howard Marks",
            "topics": ["cycles", "market_timing", "sentiment"],
            "primary_topic": "cycles"
        }
    },
    {
        "content": "Mean reversion is the most powerful force in investing. High valuations predict low future returns; low valuations predict high returns. But timing mean reversion is nearly impossible - focus on valuation, not timing.",
        "metadata": {
            "source": "Market Cycles",
            "author": "Investment Analysis",
            "topics": ["cycles", "mean_reversion", "valuation"],
            "primary_topic": "cycles"
        }
    },

    # === Sector-Specific Wisdom ===
    {
        "content": "Technology investing requires understanding winner-take-all dynamics. Platform businesses with network effects often dominate. But technology also faces rapid obsolescence risk - today's winner may be tomorrow's has-been.",
        "metadata": {
            "source": "Sector Analysis",
            "author": "Investment Analysis",
            "topics": ["technology", "platform", "disruption"],
            "primary_topic": "technology"
        }
    },
    {
        "content": "Financial services analysis requires understanding credit cycles. Banks look cheap before loan losses materialize. Focus on credit quality, loan loss reserves, and tangible book value for bank investments.",
        "metadata": {
            "source": "Sector Analysis",
            "author": "Investment Analysis",
            "topics": ["financials_sector", "banks", "credit"],
            "primary_topic": "financials_sector"
        }
    },
    {
        "content": "Consumer companies with strong brands can raise prices through inflation. Look for recurring revenue models and high customer lifetime value. Subscription businesses often command premium valuations.",
        "metadata": {
            "source": "Sector Analysis",
            "author": "Investment Analysis",
            "topics": ["consumer", "brands", "pricing_power"],
            "primary_topic": "consumer"
        }
    },

    # === Contrarian Investing ===
    {
        "content": "Contrarian investing profits from crowd extremes. When everyone agrees, the consensus is usually priced in. Look for unloved sectors, hated companies, and out-of-favor asset classes.",
        "metadata": {
            "source": "Contrarian Investing",
            "author": "Investment Analysis",
            "topics": ["contrarian", "sentiment", "crowd_psychology"],
            "primary_topic": "contrarian"
        }
    },
    {
        "content": "Short-term pain often creates long-term opportunity. Companies facing temporary challenges frequently trade below intrinsic value. Distinguish between temporary problems and permanent impairment.",
        "metadata": {
            "source": "Contrarian Investing",
            "author": "Investment Analysis",
            "topics": ["contrarian", "turnaround", "opportunity"],
            "primary_topic": "contrarian"
        }
    },
]


def seed_knowledge_base():
    """Seed the knowledge base with investment wisdom."""
    print("🌱 Seeding knowledge base with investment wisdom...")

    # Initialize vector store
    db_path = os.path.join(PROJECT_ROOT, "data", "knowledge_vectors.db")
    store = VectorStore(db_path)

    # Initialize embedder (will use local method)
    try:
        embedder = EmbeddingGenerator(method='local')
    except Exception as e:
        print(f"⚠️ Could not initialize embedder: {e}")
        print("Using simple hash-based embeddings as fallback...")
        embedder = None

    # Check current count
    current_count = store.get_count()
    print(f"Current documents in store: {current_count}")

    if current_count > 0:
        print("Knowledge base already has content. Skipping seed.")
        print("To reseed, clear the database first: store.clear()")
        return

    # Prepare chunks with embeddings
    chunks = []
    for i, wisdom in enumerate(INVESTMENT_WISDOM):
        try:
            if embedder:
                embedding = embedder.embed_text(wisdom["content"])
            else:
                # Simple fallback: hash-based pseudo-embedding
                import hashlib
                hash_obj = hashlib.sha256(wisdom["content"].encode())
                # Create a 384-dim embedding from hash
                hash_bytes = hash_obj.digest() * 12  # 32 bytes * 12 = 384 bytes
                embedding = [b / 255.0 for b in hash_bytes]

            chunks.append({
                "content": wisdom["content"],
                "metadata": wisdom["metadata"],
                "embedding": embedding
            })

            if (i + 1) % 10 == 0:
                print(f"  Processed {i + 1}/{len(INVESTMENT_WISDOM)} entries...")

        except Exception as e:
            print(f"  ⚠️ Error processing entry {i}: {e}")
            continue

    # Add to store
    if chunks:
        added = store.add_documents(chunks)
        print(f"✅ Added {added} investment wisdom entries to knowledge base")

    # Update source info
    store.update_source("Investment Wisdom Seed", len(chunks))

    # Print stats
    stats = store.get_stats()
    print(f"\n📊 Knowledge Base Stats:")
    print(f"  Total documents: {stats['total_documents']}")
    print(f"  Topics: {list(stats['topics'].keys())[:10]}...")
    print(f"  Sources: {list(stats['sources'].keys())}")

    store.close()
    print("\n✅ Knowledge base seeding complete!")


if __name__ == "__main__":
    seed_knowledge_base()
