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
    description: "Get historical price data for a SINGLE stock by its ticker symbol. Returns price charts and technical data. IMPORTANT: This tool only works with individual US stock tickers (like AAPL, NVDA, MSFT). It does NOT support: market indices (S&P 500, NASDAQ, etc.), international indices (DAX, ATX, FTSE, etc.), ETFs that track indices, or multiple symbols at once. If the user asks about an index or non-US market, tell them this data is not available rather than substituting a different stock.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol (US stocks only, e.g., 'AAPL', 'NVDA'). Do NOT use index symbols like SPX, NDX, ^GSPC, ATX, etc."
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
  },
  {
    name: "get_market_index",
    description: "Get price history and performance data for market indices like S&P 500, NASDAQ, Dow Jones, DAX, FTSE, etc. Use this when users ask about market indices, market performance, or want to see how the overall market is doing. Supports major US and international indices.",
    input_schema: {
      type: "object",
      properties: {
        index_name: {
          type: "string",
          description: "Name or symbol of the index. Examples: 'S&P 500', 'NASDAQ', 'Dow Jones', 'Russell 2000', 'DAX', 'FTSE', 'Nikkei'. Case-insensitive."
        },
        days: {
          type: "number",
          description: "Number of days of history (default: 90, max: 365)"
        }
      },
      required: ["index_name"]
    }
  },
  {
    name: "get_market_sentiment",
    description: "Get current market sentiment indicators including CNN Fear & Greed Index, VIX level, put/call ratio, advance/decline ratio, and high-yield credit spreads. Use this when users ask about market sentiment, fear and greed, whether the market is bullish/bearish, or overall market mood.",
    input_schema: {
      type: "object",
      properties: {
        include_history: {
          type: "boolean",
          description: "Include historical sentiment data for trend analysis (default: false)"
        }
      }
    }
  },
  {
    name: "get_portfolio",
    description: "Get information about user's investment portfolios including positions, allocations, and performance. Use when users ask about 'my portfolio', 'my holdings', 'what do I own', or portfolio performance.",
    input_schema: {
      type: "object",
      properties: {
        portfolio_name: {
          type: "string",
          description: "Name of the portfolio to retrieve. If not specified, returns list of all portfolios."
        },
        include_performance: {
          type: "boolean",
          description: "Include performance metrics and returns (default: true)"
        }
      }
    }
  },
  {
    name: "get_congressional_trades",
    description: "Get recent stock trades by US Congress members. Use when users ask about congressional trading, politician trades, what Congress is buying/selling, or Nancy Pelosi trades.",
    input_schema: {
      type: "object",
      properties: {
        politician: {
          type: "string",
          description: "Filter by politician name (e.g., 'Pelosi', 'Tuberville'). If not specified, returns all recent trades."
        },
        symbol: {
          type: "string",
          description: "Filter by stock symbol to see which politicians traded it."
        },
        trade_type: {
          type: "string",
          enum: ["buy", "sell", "all"],
          description: "Filter by trade type (default: all)"
        },
        days: {
          type: "number",
          description: "Look back period in days (default: 90)"
        }
      }
    }
  },
  {
    name: "get_insider_activity",
    description: "Get insider trading activity (buys/sells by executives, directors, and 10% owners) for a company. Use when users ask about insider trading, what executives are buying/selling, or insider sentiment for a stock.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        days: {
          type: "number",
          description: "Look back period in days (default: 90)"
        },
        transaction_type: {
          type: "string",
          enum: ["buy", "sell", "all"],
          description: "Filter by transaction type (default: all)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "get_technical_signals",
    description: "Get technical analysis signals and indicators for a stock including RSI, MACD, moving average crossovers, support/resistance levels, and pattern detection. Use when users ask about technical analysis, chart patterns, or trading signals.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol"
        },
        indicators: {
          type: "array",
          items: {
            type: "string",
            enum: ["rsi", "macd", "moving_averages", "bollinger", "support_resistance", "volume", "momentum", "all"]
          },
          description: "Which indicators to retrieve (default: all)"
        }
      },
      required: ["symbol"]
    }
  },
  {
    name: "get_earnings_calendar",
    description: "Get upcoming or recent earnings announcements for a stock or list of stocks. Shows expected earnings dates, EPS estimates, and recent earnings surprises. Use when users ask about earnings dates, upcoming reports, or earnings history.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol. If not provided, shows upcoming earnings for all tracked stocks."
        },
        direction: {
          type: "string",
          enum: ["upcoming", "recent", "both"],
          description: "Show upcoming earnings, recent past earnings, or both (default: upcoming)"
        },
        days: {
          type: "number",
          description: "Days to look ahead (for upcoming) or behind (for recent). Default: 30"
        }
      }
    }
  },
  {
    name: "get_short_interest",
    description: "Get short interest data for a stock including shares short, short ratio (days to cover), short percent of float, and squeeze potential. Use when users ask about short interest, short squeezes, or heavily shorted stocks.",
    input_schema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Stock ticker symbol. If not provided, shows most heavily shorted stocks."
        },
        include_history: {
          type: "boolean",
          description: "Include historical short interest data for trend analysis (default: false)"
        }
      }
    }
  },
  {
    name: "get_risk_metrics",
    description: "Calculate risk-adjusted performance metrics including Sharpe ratio, Sortino ratio, alpha, beta, max drawdown, and volatility. Use this for any question about risk metrics, risk-adjusted returns, portfolio performance, Sharpe, Sortino, alpha, or beta. Can analyze both portfolios and individual stocks.",
    input_schema: {
      type: "object",
      properties: {
        portfolio_name: {
          type: "string",
          description: "Name of the portfolio to analyze. Use for portfolio-level metrics including alpha/beta vs S&P 500 benchmark."
        },
        symbol: {
          type: "string",
          description: "Stock ticker symbol for single-stock risk metrics (e.g., 'AAPL', 'NVDA'). Use this OR portfolio_name, not both."
        },
        period: {
          type: "string",
          enum: ["1m", "3m", "6m", "1y", "2y", "3y"],
          description: "Time period for calculation. Default: '1y' (1 year / 252 trading days)"
        }
      }
    }
  },
  {
    name: "get_data_methodology",
    description: "Get detailed information about data sources, calculation methodologies, and how metrics are computed. Use this when users ask about where data comes from, how calculations work, methodology details, data sources, accuracy, or want to understand how Sharpe/Sortino/alpha/beta/correlations are calculated.",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Specific topic to explain. Options: 'general' (data sources overview), 'sharpe_ratio', 'sortino_ratio', 'alpha', 'beta', 'correlations', 'valuation_metrics'. Default: 'general'"
        }
      }
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

**Technical/Price Data (get_price_history, get_technical_signals):**
- Daily OHLCV for all tracked stocks
- Liquidity metrics: 30/60-day volume, bid-ask spreads, Amihud illiquidity
- Volatility: 30/60-day annualized, volume volatility
- Technical signals: RSI, MACD, moving averages, Bollinger Bands, support/resistance
- Chart patterns, momentum indicators, overall technical score

**Macroeconomic (get_macro_data) - 60+ FRED series:**
- Interest rates: Fed Funds, Treasury yields (1M-30Y), yield spreads
- Inflation: CPI, PCE, breakeven expectations
- Employment: Unemployment, payrolls, jobless claims
- Growth: GDP, industrial production, retail sales
- Credit spreads, financial stress indices, VIX
- Macro regime classification: growth, inflation, policy, credit, volatility regimes
- Recession probability indicators

**Institutional/Smart Money (get_investor_holdings, get_congressional_trades, get_insider_activity):**
- 13F holdings from 20+ famous investors (Buffett, Burry, Ackman, Dalio, etc.)
- Position changes: new buys, increases, decreases, exits
- Congressional trading activity with politician names, parties, and trade details
- Insider trading: executive/director buys and sells with sentiment analysis

**Market Indices (get_market_index):**
- Price history for major indices: S&P 500, NASDAQ, Dow Jones, Russell 2000
- International indices: DAX, FTSE 100, CAC 40, Nikkei 225, and more
- Performance metrics: returns, highs/lows, charts

**Market Sentiment (get_market_sentiment):**
- CNN Fear & Greed Index with interpretation
- VIX level and volatility status
- Put/Call ratio, advance/decline, credit spreads
- Overall market mood indicator

**User Portfolios (get_portfolio):**
- List all portfolios or get details for a specific one
- Position breakdown with weights and gain/loss
- Sector allocation analysis

**Earnings (get_earnings_calendar):**
- Upcoming earnings dates with EPS/revenue estimates
- Recent earnings results with beat/miss analysis
- Historical earnings track record

**Short Interest (get_short_interest):**
- Shares short, short percent of float, days to cover
- Short squeeze potential analysis
- Most heavily shorted stocks across the market

**Risk Metrics (get_risk_metrics):**
- Sharpe ratio, Sortino ratio, alpha, beta
- Max drawdown, annualized volatility
- Works for both portfolios and individual stocks
- Includes benchmark comparison vs S&P 500
- USE THIS for questions about Sharpe, Sortino, alpha, beta, or risk-adjusted returns

**Data Methodology (get_data_methodology):**
- Detailed explanation of data sources
- Calculation methodology for all metrics
- Use when users ask "how is X calculated?" or "where does the data come from?"

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

1. **Be concise** - Keep responses SHORT and focused. Aim for 2-4 key insights, not exhaustive coverage. Users can ask follow-up questions.

2. **Never repeat information** - If you already mentioned a number or fact, don't repeat it. Each sentence should add new information.

3. **Let charts speak** - When returning chart data, provide a brief 1-2 sentence summary. The chart visualization will show the details - don't list all the data points in text.

4. **One tool per question** - Usually one tool call is enough. Don't call multiple tools that return overlapping data.

5. **Always fetch real data** - Use tools to get actual numbers. Never estimate or use outdated knowledge.

6. **Be direct** - Lead with the answer in 1-2 sentences. Only add supporting details if truly valuable.

## CRITICAL: SYMBOL VALIDATION RULES

**NEVER invent or guess stock symbols.** Only use symbols that are:
- Explicitly mentioned by the user (e.g., "AAPL", "NVDA", "MSFT")
- Returned by a previous tool call (e.g., from screening results)
- Well-known, standard US stock tickers

**DO NOT extract symbols from:**
- Random words in the query (e.g., "WD" from "walk through", "ME" from "show me")
- Technical terms (e.g., "CPPTL" is not a symbol)
- Abbreviations that aren't stock tickers

**If a query doesn't mention specific stocks:**
- For methodology questions (correlation, Sharpe, etc.) - use get_data_methodology instead of looking up random symbols
- For general questions - answer directly without fetching stock data
- If user wants metrics for their portfolio - use get_risk_metrics with portfolio_name

**If a tool returns "symbol not found":**
- Do NOT try variations of the symbol
- Tell the user the symbol wasn't found and ask for clarification

7. **Format numbers properly:**
   - Large numbers: $1.2B, $450M, $12.5K
   - Percentages: 15.3%, -2.1%
   - Ratios: 28.5x PE, 1.2x P/B

8. **Multi-turn context** - Remember what stock/topic the user is asking about.

## EXAMPLE INTERACTIONS

User: "Show NVIDIA's revenue for the last 5 years in a chart"
→ Use get_financial_statements with symbol="NVDA", periods=5
→ Response: "Here's NVIDIA's 5-year revenue trend. Revenue grew from $16.7B (2021) to $130.5B (2025), an 8x increase driven by the AI boom."
(Let the chart show the details - don't list every year's numbers)

User: "Is NVDA overvalued?"
→ Use get_valuation_models ONLY (one tool)
→ Response: "NVDA trades at 45x earnings vs intrinsic value of $165, suggesting 12% upside. Analysts rate it a Buy with $210 target."

User: "What does Buffett own?"
→ Use get_investor_holdings with investor="buffett"
→ Response: "Buffett's top holdings: AAPL (48%), BAC (9%), AXP (8%). Recently added OXY, trimmed AAPL."

User: "Compare AAPL and MSFT"
→ Use compare_companies (one tool)
→ Response: "MSFT leads in profitability (ROIC 28% vs 22%). AAPL is cheaper (PE 28x vs 34x). Both strong quality."

User: "Technical analysis for TSLA"
→ Use get_technical_signals (one tool)
→ Response: "TSLA is oversold (RSI 28) near support at $180. MACD bearish but momentum slowing."`;


module.exports = {
  TOOLS,
  INVESTMENT_ASSISTANT_PROMPT
};
