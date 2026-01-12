/**
 * Tool definitions for Claude API tool calling
 *
 * These tools give Claude direct access to our financial database
 * so it can answer investment questions intelligently.
 */

const TOOLS = [
  {
    name: "lookup_company_metrics",
    description: "Get financial metrics and company information for a stock. Returns valuation (P/E, P/B, EV/EBITDA), profitability (ROE, ROIC, margins), growth rates, and financial health metrics. Use this for any question about a specific company's fundamentals.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'NVDA')"
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "Specific metrics to fetch. Options: pe_ratio, pb_ratio, ps_ratio, ev_ebitda, roe, roa, roic, gross_margin, operating_margin, net_margin, revenue_growth_yoy, debt_to_equity, current_ratio, fcf_yield, dividend_yield. If empty, returns all available metrics."
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "screen_stocks",
    description: "Find stocks matching specific criteria. Use for questions like 'show me undervalued tech stocks' or 'find high dividend stocks with low debt'. IMPORTANT: Percentage metrics (roe, roic, roa, gross_margin, net_margin, revenue_growth_yoy, fcf_yield, dividend_yield) are stored as whole numbers, not decimals. For example: ROE of 15% is stored as 15, not 0.15. When user says 'ROE above 15%', use value=15.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                description: "Metric to filter on: pe_ratio, pb_ratio, roic, roe, gross_margin, net_margin, revenue_growth_yoy, debt_to_equity, dividend_yield, market_cap, fcf_yield"
              },
              operator: {
                type: "string",
                enum: [">", "<", ">=", "<=", "=", "between"],
                description: "Comparison operator"
              },
              value: {
                type: "number",
                description: "Value to compare against. For percentage metrics (roe, roic, margins, growth), use whole numbers (15 means 15%, not 0.15)"
              },
              value2: {
                type: "number",
                description: "Second value for 'between' operator"
              }
            },
            required: ["field", "operator", "value"]
          },
          description: "Array of filter conditions. Remember: percentage metrics use whole numbers (15 = 15%)"
        },
        sector: {
          type: "string",
          description: "Filter by sector: Technology, Healthcare, Financials, Consumer Cyclical, Consumer Defensive, Industrials, Energy, Materials, Utilities, Real Estate, Communication Services"
        },
        sort_by: {
          type: "string",
          description: "Sort results by this metric (ascending by default unless metric suggests otherwise)"
        },
        sort_direction: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction"
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 20, max: 50)"
        }
      }
    }
  },
  {
    name: "get_price_history",
    description: "Get historical price data for a stock. Use for questions about price trends, returns, or technical analysis.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        days: {
          type: "number",
          description: "Number of days of history (default: 90, max: 365)"
        },
        include_technicals: {
          type: "boolean",
          description: "Include technical indicators (RSI, moving averages, volatility)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "calculate_metric",
    description: "Calculate a derived financial metric like NOPAT, WACC, or intrinsic value. Use when users ask for calculations or valuations not directly stored in the database.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        metric: {
          type: "string",
          enum: ["nopat", "wacc", "intrinsic_value", "dcf_value", "graham_number", "peg_ratio", "ev", "enterprise_value", "invested_capital", "fcf_conversion"],
          description: "Metric to calculate"
        },
        parameters: {
          type: "object",
          description: "Optional parameters for calculation (e.g., discount_rate, growth_rate, terminal_multiple)",
          properties: {
            discount_rate: { type: "number", description: "Discount rate for DCF (default: 0.10)" },
            growth_rate: { type: "number", description: "Growth rate assumption" },
            terminal_multiple: { type: "number", description: "Terminal EV/EBITDA multiple" },
            margin_of_safety: { type: "number", description: "Margin of safety percentage" }
          }
        }
      },
      required: ["symbol", "metric"]
    }
  },
  {
    name: "get_sentiment",
    description: "Get sentiment data for a company from multiple sources: Reddit, news, analyst ratings, and StockTwits. Use for questions about market sentiment, what people think about a stock, or if a stock is bullish/bearish.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        sources: {
          type: "array",
          items: {
            type: "string",
            enum: ["reddit", "news", "analyst", "stocktwits", "combined"]
          },
          description: "Which sentiment sources to include (default: all)"
        },
        include_details: {
          type: "boolean",
          description: "Include individual articles/posts (default: false)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "get_investor_holdings",
    description: "Get holdings of famous investors from 13F filings. Includes Buffett, Burry, Ackman, Dalio, Icahn, and 15+ others. Use for questions like 'what does Buffett own' or 'does Burry hold NVDA'.",
    input_schema: {
      type: "object",
      properties: {
        investor: {
          type: "string",
          description: "Investor name or alias: buffett, berkshire, burry, scion, ackman, pershing, dalio, bridgewater, icahn, soros, druckenmiller, tepper, cohen, einhorn, loeb, klarman, marks"
        },
        symbol: {
          type: "string",
          description: "Optional: check if investor holds this specific stock"
        },
        show_changes: {
          type: "boolean",
          description: "Include recent position changes (buys, sells, new positions)"
        }
      },
      required: ["investor"]
    }
  },
  {
    name: "get_financial_statements",
    description: "Get detailed financial statement data (income statement, balance sheet, cash flow) for a company. Use when users need specific line items not in calculated metrics.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        statement_type: {
          type: "string",
          enum: ["income_statement", "balance_sheet", "cash_flow", "all"],
          description: "Which statement(s) to retrieve"
        },
        periods: {
          type: "number",
          description: "Number of periods to retrieve (default: 4 quarters or 3 years)"
        },
        period_type: {
          type: "string",
          enum: ["annual", "quarterly"],
          description: "Annual or quarterly data (default: annual)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "get_macro_data",
    description: "Get macroeconomic data and market regime indicators. Includes Fed rates, treasury yields, inflation (CPI/PCE), unemployment, GDP, VIX, credit spreads, and recession probability.",
    input_schema: {
      type: "object",
      properties: {
        indicators: {
          type: "array",
          items: {
            type: "string",
            enum: ["fed_funds", "treasury_10y", "treasury_2y", "yield_spread", "cpi", "pce", "unemployment", "gdp", "vix", "credit_spread", "recession_probability", "financial_stress"]
          },
          description: "Which indicators to retrieve (default: key indicators)"
        },
        include_regime: {
          type: "boolean",
          description: "Include macro regime classification (growth, inflation, policy regimes)"
        }
      }
    }
  },
  {
    name: "compare_companies",
    description: "Compare two or more companies side by side on key metrics. Use for questions like 'compare AAPL and MSFT' or 'which is better NVDA or AMD'.",
    input_schema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
          description: "List of stock symbols to compare"
        },
        metrics: {
          type: "array",
          items: { type: "string" },
          description: "Metrics to compare. If empty, compares key metrics from each category"
        }
      },
      required: ["symbols"]
    }
  },
  {
    name: "get_valuation_models",
    description: "Get pre-calculated valuation model results including DCF (bull/bear/base cases), Graham Number, EPV, and analyst price targets with implied upside.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        models: {
          type: "array",
          items: {
            type: "string",
            enum: ["dcf", "graham", "epv", "ddm", "analyst_target", "all"]
          },
          description: "Which valuation models to retrieve"
        }
      },
      required: ["symbol"]
    }
  }
];

/**
 * System prompt for the investment assistant
 */
const INVESTMENT_ASSISTANT_PROMPT = `You are an expert investment research assistant with access to comprehensive financial data. You help users analyze stocks, understand market conditions, and make informed investment decisions.

## YOUR CAPABILITIES

You have access to real-time tools that query actual financial databases. ALWAYS use these tools to get data - never make up numbers or say "I don't have access."

### Data Available Through Tools:

**Company Fundamentals (lookup_company_metrics, get_financial_statements):**
- 200+ XBRL financial statement line items (balance sheet, income statement, cash flow)
- 24 pre-calculated metrics: ROIC, ROE, ROA, ROCE, FCF yield, PE, PB, PS, EV/EBITDA, margins, growth rates
- Historical metrics for trend analysis
- Industry benchmarks and percentile rankings

**Valuation (calculate_metric, get_valuation_models):**
- DCF models with bull/bear/base cases
- Multiple valuation methods: Graham Number, EPV, Book Value, DDM
- Intrinsic value estimates with margin of safety calculations
- Implied upside/downside from analyst targets

**Sentiment (get_sentiment) - 4 sources combined:**
- Reddit sentiment from 20+ subreddits (WSB, investing, stocks, sector-specific)
- News sentiment from Reuters, Bloomberg, Seeking Alpha, Yahoo Finance
- Analyst recommendations and price targets (buy/hold/sell distribution)
- StockTwits sentiment and message volume

**Technical/Price Data (get_price_history):**
- Daily OHLCV for all tracked stocks
- Liquidity metrics: 30/60-day volume, bid-ask spreads, Amihud illiquidity
- Volatility: 30/60-day annualized, volume volatility
- Support for calculating RSI, MACD, moving averages

**Macroeconomic (get_macro_data) - 60+ FRED series:**
- Interest rates: Fed Funds, Treasury yields (1M-30Y), yield spreads
- Inflation: CPI, PCE, breakeven expectations
- Employment: Unemployment, payrolls, jobless claims
- Growth: GDP, industrial production, retail sales
- Credit spreads, financial stress indices, VIX
- Macro regime classification: growth, inflation, policy, credit, volatility regimes
- Recession probability indicators

**Institutional/Smart Money (get_investor_holdings):**
- 13F holdings from 20+ famous investors (Buffett, Burry, Ackman, Dalio, etc.)
- Position changes: new buys, increases, decreases, exits
- Congressional trading activity with track records
- Short interest data with squeeze potential scoring

**Screening (screen_stocks):**
- Filter by any metric: valuation, profitability, growth, quality
- Sector filtering
- Custom sorting
- CRITICAL: Percentage metrics (ROE, ROIC, margins, growth rates) are stored as whole numbers, NOT decimals:
  * "ROE > 15%" → use value=15 (NOT 0.15)
  * "Growth > 20%" → use value=20 (NOT 0.20)
  * "Margin between 10-20%" → use value=10, value2=20

**Comparison (compare_companies):**
- Side-by-side metric comparison
- Relative valuation analysis

## RESPONSE GUIDELINES

1. **Always fetch real data** - Use tools to get actual numbers. Never estimate or use outdated knowledge.

2. **Show calculations** - When computing derived metrics (NOPAT, WACC, etc.), show the formula and inputs.

3. **Provide context** - Compare metrics to:
   - Historical values (is PE higher or lower than usual?)
   - Industry benchmarks (is this ROIC good for the sector?)
   - Percentile rankings when available

4. **Be direct** - Lead with the answer, then provide supporting details.

5. **Cite data freshness** - Mention when data was last updated if relevant.

6. **Format numbers properly:**
   - Large numbers: $1.2B, $450M, $12.5K
   - Percentages: 15.3%, -2.1%
   - Ratios: 28.5x PE, 1.2x P/B
   - Dates: Jan 15, 2024

7. **Handle uncertainty** - If data is missing or stale, say so clearly. Suggest alternatives.

8. **Multi-turn context** - Remember what stock/topic the user is asking about. "Calculate it" refers to the previous metric discussed.

## EXAMPLE INTERACTIONS

User: "What's Apple's NOPAT?"
→ Use calculate_metric tool with symbol="AAPL" and metric="nopat"
→ Response: "Apple's NOPAT (Net Operating Profit After Tax) is $94.7B, calculated as:
   - Operating Income: $118.7B
   - Tax Rate: 20.2%
   - NOPAT = $118.7B × (1 - 0.202) = $94.7B"

User: "Is NVDA overvalued?"
→ Use lookup_company_metrics for PE, then get_valuation_models for intrinsic value, then get_sentiment
→ Response: Compare current PE vs historical, intrinsic value vs price, analyst consensus

User: "What does Buffett own?"
→ Use get_investor_holdings with investor="buffett"
→ Response: List top holdings with recent changes

User: "Show me undervalued tech stocks"
→ Use screen_stocks with sector="Technology" and filters for low PE, high quality
→ Response: Table of matching stocks with key metrics

User: "Compare AAPL and MSFT"
→ Use compare_companies with symbols=["AAPL", "MSFT"]
→ Response: Side-by-side comparison table with analysis`;

module.exports = {
  TOOLS,
  INVESTMENT_ASSISTANT_PROMPT
};
