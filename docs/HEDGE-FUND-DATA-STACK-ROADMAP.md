# Hedge Fund Data Stack Roadmap

## Executive Summary

This document outlines the path from the current investment platform to a professional-grade hedge fund data infrastructure. The roadmap is organized by priority and estimated implementation effort.

---

## Current Infrastructure Assessment

### Strengths
- 4,956 companies tracked with 13.65M price records
- Comprehensive SEC EDGAR integration (10-K, 10-Q, Form 4)
- Multi-source sentiment aggregation (Reddit, StockTwits, News)
- 129 database tables with sophisticated schema
- Working factor analysis and portfolio management
- Python + Node.js hybrid for data processing

### Critical Gaps
| Gap | Business Impact | Priority |
|-----|-----------------|----------|
| No real-time/intraday data | Can't do intraday strategies | P0 |
| No options data | Missing volatility signals | P0 |
| No macro data | No economic context | P1 |
| Basic sentiment only | Limited alpha generation | P1 |
| No broker integration | Paper trading only | P2 |
| No advanced risk metrics | Inadequate risk management | P1 |

---

## Phase 1: Foundation (Weeks 1-4)

### 1.1 FRED Macroeconomic Integration (FREE)

The Federal Reserve Economic Data API provides 800,000+ time series.

**Implementation:**

```javascript
// src/services/data/fredService.js
const FRED_BASE = 'https://api.stlouisfed.org/fred';
const FRED_API_KEY = process.env.FRED_API_KEY;

const KEY_SERIES = {
  // Interest Rates
  'DFF': 'Federal Funds Rate',
  'DGS2': '2-Year Treasury',
  'DGS10': '10-Year Treasury',
  'DGS30': '30-Year Treasury',
  'T10Y2Y': '10Y-2Y Spread (Yield Curve)',
  'T10Y3M': '10Y-3M Spread',

  // Inflation
  'CPIAUCSL': 'CPI All Items',
  'CPILFESL': 'Core CPI',
  'PCEPI': 'PCE Price Index',
  'T5YIE': '5Y Breakeven Inflation',

  // Employment
  'UNRATE': 'Unemployment Rate',
  'PAYEMS': 'Nonfarm Payrolls',
  'ICSA': 'Initial Claims',
  'CCSA': 'Continuing Claims',

  // Growth & Activity
  'GDP': 'GDP',
  'GDPC1': 'Real GDP',
  'INDPRO': 'Industrial Production',
  'RSAFS': 'Retail Sales',

  // Credit & Financial
  'BAMLH0A0HYM2': 'High Yield Spread',
  'BAMLC0A0CM': 'IG Corporate Spread',
  'VIXCLS': 'VIX',
  'DCOILWTICO': 'WTI Crude Oil',

  // Housing
  'HOUST': 'Housing Starts',
  'CSUSHPISA': 'Case-Shiller Home Price',

  // Consumer
  'UMCSENT': 'Consumer Sentiment',
  'PCE': 'Personal Consumption'
};

class FREDService {
  async fetchSeries(seriesId, startDate, endDate) {
    const url = `${FRED_BASE}/series/observations`;
    const params = {
      series_id: seriesId,
      api_key: FRED_API_KEY,
      file_type: 'json',
      observation_start: startDate,
      observation_end: endDate
    };
    // ... implementation
  }

  async getYieldCurve() {
    // Fetch 1M, 3M, 6M, 1Y, 2Y, 5Y, 10Y, 30Y yields
    // Calculate slope, curvature
    // Detect inversions
  }

  async getMacroContext() {
    // Returns current state of all key indicators
    // Plus recent changes and trends
  }
}
```

**Database Schema:**

```sql
CREATE TABLE economic_indicators (
  id INTEGER PRIMARY KEY,
  series_id TEXT NOT NULL,
  series_name TEXT,
  observation_date DATE NOT NULL,
  value REAL,
  change_1m REAL,
  change_3m REAL,
  change_1y REAL,
  percentile_10y REAL,  -- Where is current value vs history?
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, observation_date)
);

CREATE TABLE yield_curve (
  id INTEGER PRIMARY KEY,
  curve_date DATE NOT NULL UNIQUE,
  y_1m REAL, y_3m REAL, y_6m REAL,
  y_1y REAL, y_2y REAL, y_3y REAL,
  y_5y REAL, y_7y REAL, y_10y REAL,
  y_20y REAL, y_30y REAL,
  slope_2s10s REAL,
  slope_3m10y REAL,
  curvature REAL,
  is_inverted INTEGER DEFAULT 0
);

CREATE TABLE macro_regimes (
  id INTEGER PRIMARY KEY,
  regime_date DATE NOT NULL UNIQUE,
  growth_regime TEXT,       -- expansion, slowdown, recession, recovery
  inflation_regime TEXT,    -- deflation, low, moderate, high
  policy_regime TEXT,       -- easing, neutral, tightening
  credit_regime TEXT,       -- tight, normal, loose
  volatility_regime TEXT,   -- calm, elevated, crisis
  composite_score REAL,
  description TEXT
);
```

**Cost: FREE** (FRED API is free with registration)

---

### 1.2 Options & Volatility Data (Polygon.io)

**Cost: $199/month** for full options chain + real-time

**Implementation:**

```javascript
// src/services/data/optionsService.js

class OptionsService {
  constructor(polygonApiKey) {
    this.apiKey = polygonApiKey;
    this.baseUrl = 'https://api.polygon.io';
  }

  async getOptionsChain(symbol, expirationDate) {
    // Fetch all strikes for given expiration
    // Returns: strike, type (call/put), bid, ask, volume, OI, IV, greeks
  }

  async getImpliedVolatility(symbol) {
    // Calculate ATM IV across expirations
    // Build volatility surface
    // Detect skew
  }

  async getUnusualActivity(minVolume = 1000, minOIRatio = 3) {
    // Scan for unusual options volume
    // Volume >> Open Interest suggests new positions
    // Track smart money flow
  }

  async getPutCallRatio(symbol) {
    // Calculate put/call ratios
    // Compare to historical norms
    // Detect sentiment extremes
  }

  calculateGreeks(optionData, spotPrice, riskFreeRate) {
    // Black-Scholes Greeks
    // Delta, Gamma, Vega, Theta, Rho
  }
}
```

**Database Schema:**

```sql
CREATE TABLE options_chain (
  id INTEGER PRIMARY KEY,
  company_id INTEGER,
  symbol TEXT,
  option_symbol TEXT,
  expiration_date DATE,
  strike REAL,
  option_type TEXT,  -- 'call' or 'put'

  -- Pricing
  bid REAL, ask REAL, mid REAL,
  last_price REAL,

  -- Volume & Interest
  volume INTEGER,
  open_interest INTEGER,

  -- Greeks
  implied_volatility REAL,
  delta REAL,
  gamma REAL,
  theta REAL,
  vega REAL,
  rho REAL,

  -- Metadata
  days_to_expiry INTEGER,
  moneyness REAL,  -- strike/spot
  snapshot_time DATETIME,

  FOREIGN KEY (company_id) REFERENCES companies(id)
);

CREATE TABLE iv_surface (
  id INTEGER PRIMARY KEY,
  company_id INTEGER,
  surface_date DATE,

  -- ATM IV by expiration
  iv_1w REAL, iv_2w REAL, iv_1m REAL,
  iv_2m REAL, iv_3m REAL, iv_6m REAL,
  iv_1y REAL,

  -- Skew metrics
  skew_25d REAL,  -- 25-delta put vs call IV
  skew_10d REAL,

  -- Term structure
  term_slope REAL,
  is_backwardated INTEGER,

  -- Percentiles
  iv_percentile_30d REAL,
  iv_percentile_1y REAL,

  UNIQUE(company_id, surface_date)
);

CREATE TABLE unusual_options_activity (
  id INTEGER PRIMARY KEY,
  company_id INTEGER,
  detected_at DATETIME,
  option_type TEXT,
  expiration DATE,
  strike REAL,
  volume INTEGER,
  open_interest INTEGER,
  volume_oi_ratio REAL,
  implied_volatility REAL,
  premium_value REAL,
  sentiment TEXT,  -- bullish/bearish based on position
  significance_score REAL
);
```

---

### 1.3 Real-Time Price Infrastructure

**Option A: Alpaca (FREE for market data)**

```javascript
// src/services/data/realtimeService.js
const WebSocket = require('ws');

class RealtimeService {
  constructor() {
    this.ws = null;
    this.subscriptions = new Set();
    this.handlers = new Map();
  }

  connect() {
    this.ws = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);
      this.handleMessage(msg);
    });
  }

  subscribe(symbols, channels = ['trades', 'quotes']) {
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      trades: symbols,
      quotes: symbols
    }));
  }

  onTrade(symbol, callback) {
    this.handlers.set(`trade:${symbol}`, callback);
  }

  onQuote(symbol, callback) {
    this.handlers.set(`quote:${symbol}`, callback);
  }
}
```

**Option B: Polygon.io (included in $199/mo plan)**

---

## Phase 2: Alternative Data (Weeks 5-8)

### 2.1 Enhanced NLP & Sentiment

**Upgrade from basic sentiment to transformer-based:**

```python
# python-services/advanced_sentiment.py
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

class FinancialSentimentAnalyzer:
    def __init__(self):
        # FinBERT - pretrained on financial text
        self.tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
        self.model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert")

    def analyze(self, text):
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        outputs = self.model(**inputs)
        probs = torch.nn.functional.softmax(outputs.logits, dim=-1)

        return {
            'positive': probs[0][0].item(),
            'negative': probs[0][1].item(),
            'neutral': probs[0][2].item(),
            'score': probs[0][0].item() - probs[0][1].item()  # -1 to +1
        }

    def analyze_10k_changes(self, current_10k, previous_10k):
        # Detect language changes between filings
        # Risk factor changes
        # Tone shifts
        pass

    def analyze_earnings_call(self, transcript):
        # Segment by speaker (CEO, CFO, analysts)
        # Track Q&A sentiment separately
        # Detect hedging language
        pass
```

### 2.2 Web Traffic & App Data

```javascript
// src/services/data/alternativeDataService.js

class AlternativeDataService {
  async getGoogleTrends(keywords, timeframe = 'today 12-m') {
    // Google Trends API (unofficial, rate-limited)
    // Track search interest over time
    // Compare related queries
  }

  async getWebTraffic(domain) {
    // SimilarWeb API (paid) or scraping
    // Monthly visits, bounce rate, time on site
    // Traffic sources breakdown
  }

  async getAppRankings(appId, store = 'ios') {
    // App Annie / Sensor Tower API
    // Daily rankings, downloads estimates
    // User ratings over time
  }

  async getJobPostings(company) {
    // LinkedIn / Indeed scraping
    // Track hiring trends by department
    // Correlate with revenue growth
  }
}
```

### 2.3 Earnings Call Transcripts

```javascript
// FREE sources: Seeking Alpha, Yahoo Finance, Motley Fool

class EarningsCallService {
  async getTranscript(symbol, fiscalQuarter) {
    // Scrape from Seeking Alpha (free, rate-limited)
    // Parse into sections: prepared remarks, Q&A
    // Extract speaker segments
  }

  async analyzeTranscript(transcript) {
    // Key metrics mentioned
    // Guidance language
    // Uncertainty phrases ("we think", "we hope", "challenging")
    // Forward-looking statements count
    // Management confidence score
  }
}
```

---

## Phase 3: Risk Infrastructure (Weeks 9-12)

### 3.1 Value at Risk (VaR) Engine

```javascript
// src/services/risk/varEngine.js

class VaREngine {
  constructor(db) {
    this.db = db;
  }

  // Parametric VaR (assumes normal distribution)
  parametricVaR(positions, confidence = 0.95, horizon = 1) {
    const portfolioReturn = this.calculatePortfolioReturn(positions);
    const portfolioVol = this.calculatePortfolioVolatility(positions);
    const zScore = this.getZScore(confidence);

    return portfolioVol * zScore * Math.sqrt(horizon);
  }

  // Historical VaR (uses actual return distribution)
  historicalVaR(positions, confidence = 0.95, lookback = 252) {
    const historicalReturns = this.getHistoricalPortfolioReturns(positions, lookback);
    const sortedReturns = historicalReturns.sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);

    return -sortedReturns[index];
  }

  // Monte Carlo VaR
  monteCarloVaR(positions, confidence = 0.95, simulations = 10000) {
    const covMatrix = this.getCovarianceMatrix(positions);
    const simulatedReturns = this.generateScenarios(covMatrix, simulations);

    return this.calculateVaRFromSimulations(simulatedReturns, confidence);
  }

  // Conditional VaR (Expected Shortfall)
  conditionalVaR(positions, confidence = 0.95) {
    // Average of losses beyond VaR threshold
    // Better captures tail risk
  }

  // Component VaR (contribution by position)
  componentVaR(positions) {
    // How much each position contributes to total VaR
    // For risk budgeting
  }
}
```

### 3.2 Factor Risk Decomposition

```javascript
// src/services/risk/factorRiskService.js

class FactorRiskService {
  async decomposeRisk(portfolio) {
    // Load factor exposures
    const exposures = await this.getFactorExposures(portfolio);

    // Load factor covariance matrix
    const factorCov = await this.getFactorCovariance();

    // Calculate systematic risk (explained by factors)
    const systematicRisk = this.calculateSystematicRisk(exposures, factorCov);

    // Calculate idiosyncratic risk (stock-specific)
    const idiosyncraticRisk = this.calculateIdiosyncraticRisk(portfolio);

    return {
      totalRisk: Math.sqrt(systematicRisk + idiosyncraticRisk),
      systematicRisk,
      idiosyncraticRisk,
      riskContributions: {
        market: exposures.beta * factorCov.market,
        size: exposures.size * factorCov.size,
        value: exposures.value * factorCov.value,
        momentum: exposures.momentum * factorCov.momentum,
        quality: exposures.quality * factorCov.quality,
        volatility: exposures.volatility * factorCov.volatility
      }
    };
  }
}
```

### 3.3 Stress Testing Framework

```javascript
// src/services/risk/stressTestService.js

const STRESS_SCENARIOS = {
  '2008_FINANCIAL_CRISIS': {
    name: '2008 Financial Crisis',
    equity: -0.50,
    credit_spread: 0.06,
    vix: 80,
    rates_10y: -0.015,
    oil: -0.60
  },
  '2020_COVID_CRASH': {
    name: 'COVID-19 Crash',
    equity: -0.35,
    credit_spread: 0.03,
    vix: 82,
    rates_10y: -0.01,
    oil: -0.65
  },
  'RATE_SHOCK_UP': {
    name: 'Interest Rate Shock (+200bp)',
    equity: -0.15,
    rates_10y: 0.02,
    credit_spread: 0.01,
    duration_impact: true
  },
  'STAGFLATION': {
    name: 'Stagflation Scenario',
    equity: -0.25,
    inflation: 0.08,
    rates_10y: 0.015,
    growth: -0.02
  }
};

class StressTestService {
  async runScenario(portfolio, scenarioId) {
    const scenario = STRESS_SCENARIOS[scenarioId];
    const positions = await this.getPositions(portfolio);

    let portfolioImpact = 0;
    const positionImpacts = [];

    for (const position of positions) {
      const impact = await this.calculatePositionImpact(position, scenario);
      portfolioImpact += impact.dollarImpact;
      positionImpacts.push(impact);
    }

    return {
      scenario: scenario.name,
      totalImpact: portfolioImpact,
      impactPercent: portfolioImpact / portfolio.totalValue,
      positionDetails: positionImpacts,
      survivability: this.assessSurvivability(portfolioImpact, portfolio)
    };
  }
}
```

---

## Phase 4: Execution Infrastructure (Weeks 13-16)

### 4.1 Broker Integration (IBKR/Alpaca)

```javascript
// src/services/execution/brokerService.js

class BrokerService {
  constructor(broker = 'alpaca') {
    this.broker = broker;
    this.client = this.initializeClient();
  }

  async submitOrder(order) {
    const validated = this.validateOrder(order);

    if (this.broker === 'alpaca') {
      return this.alpacaOrder(validated);
    } else if (this.broker === 'ibkr') {
      return this.ibkrOrder(validated);
    }
  }

  async getPositions() {
    // Real-time positions from broker
  }

  async getAccountInfo() {
    // Buying power, margin, equity
  }

  async reconcile(internalPositions) {
    // Compare internal records to broker
    // Flag discrepancies
  }
}
```

### 4.2 Order Management System (OMS)

```javascript
// src/services/execution/orderManagementService.js

class OrderManagementService {
  async createOrder(signal) {
    // Convert signal to order
    const order = {
      symbol: signal.symbol,
      side: signal.direction,
      quantity: this.calculateQuantity(signal),
      type: this.selectOrderType(signal),
      timeInForce: 'day',

      // Risk checks
      maxSlippage: 0.001,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit
    };

    // Pre-trade compliance checks
    await this.complianceCheck(order);

    // Submit to broker
    return this.brokerService.submitOrder(order);
  }

  async complianceCheck(order) {
    // Position limits
    // Sector concentration
    // Liquidity check
    // Margin requirements
  }
}
```

---

## Data Source Cost Summary

| Source | Cost | Value |
|--------|------|-------|
| FRED API | FREE | Macro data (800K+ series) |
| Alpaca | FREE | Real-time quotes + execution |
| Polygon.io | $199/mo | Options, tick data, full market |
| IEX Cloud | $19/mo | Alternative to Polygon |
| FMP | $29/mo | Financial data validation |
| NewsAPI | FREE (100/day) | News aggregation |
| **Total** | **~$250/mo** | Professional-grade data stack |

---

## Implementation Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │ FRED Macro Data   │ Options Data      │
    │ (FREE, 1 week)    │ (Polygon, 2 weeks)│
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT│ Web Scraping    │ Real-time Infra   │ EFFORT
    │ Enhancements     │ + Execution       │
    │ (1 week)         │ (4 weeks)         │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

---

## Success Metrics

After implementation, measure:

1. **Data Freshness**: <15 min delay on market data
2. **Coverage**: 100% of investable universe
3. **Signal Quality**: Sharpe ratio improvement
4. **Risk Accuracy**: VaR breaches < 5%
5. **Execution Quality**: Slippage < 5bps
6. **System Uptime**: 99.9% during market hours

---

## Next Steps

1. **Week 1**: Implement FRED integration (FREE, high impact)
2. **Week 2**: Set up Polygon.io options data
3. **Week 3**: Build VaR engine
4. **Week 4**: Integrate Alpaca for paper trading
5. **Week 5-8**: Advanced sentiment + alternative data
6. **Week 9-12**: Full risk infrastructure
7. **Week 13+**: Live trading capabilities
