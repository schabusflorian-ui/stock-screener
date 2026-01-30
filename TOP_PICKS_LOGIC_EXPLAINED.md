# Top Picks Logic - How Agent Signal Generation Works

**Date:** 2026-01-30  
**Topic:** Understanding how trading agents generate "top picks" signals for deployment

---

## Overview

When you deploy a trading agent, it scans a universe of stocks and generates **trading signals** (top picks) based on a sophisticated multi-factor scoring system. These signals represent the agent's best investment opportunities at any given time.

---

## Signal Generation Flow

### 1. Trigger Points

Signals are generated when:
- **Manual Scan:** User clicks "Run Scan" button
- **Scheduled Scan:** Agent runs on configured schedule (hourly, daily, weekly)
- **Auto-execution:** Agent is set to auto-execute approved signals

**Code Path:**
```javascript
Frontend: agentAPI.runScan(agentId)
  ↓
Backend: POST /api/agents/:id/scan
  ↓
agentService.generateSignals(agentId)
  ↓
TradingAgent.batchRecommendations(symbols)
```

---

## 2. Universe Selection

**File:** `src/services/agent/agentService.js` (line 1526)

The agent gets its universe of stocks to scan:

```javascript
const symbols = getAgentUniverse(agentId);
// Sources:
// - Agent's configured universe (SP500, NASDAQ100, ALL, etc.)
// - Watchlist stocks
// - Sector-filtered stocks
// - Custom stock lists
```

**Universe Options:**
- **SP500** - S&P 500 constituents only
- **NASDAQ100** - Nasdaq 100 stocks
- **RUSSELL2000** - Russell 2000 small caps
- **ALL** - All active stocks in database
- **CUSTOM** - User-defined list

---

## 3. Individual Stock Scoring

**File:** `src/services/agent/tradingAgent.js` (line 514)

For each stock, the agent calls `getRecommendation(symbol)`:

### Step 1: Pre-screening Filters

```javascript
// A. Earnings Blackout (lines 520-549)
if (inEarningsBlackout && applyEarningsFilter) {
  return { action: 'hold', skipReason: 'earnings_blackout' };
}

// B. Liquidity Check (line 559)
const liquidityCheck = _checkLiquidity(companyId, currentPrice);
// Rejects stocks with avg volume < 100k shares
// Or market cap < $100M (micro-caps)
```

### Step 2: Gather Multi-Source Signals (line 562)

```javascript
const signals = await _gatherSignals(companyId);
```

**Signal Sources:**
```javascript
{
  // Factor scores from stock_factor_scores table
  value: 0.75,        // Valuation metrics (PE, PB, PS, etc.)
  quality: 0.82,      // Financial health (ROE, debt ratios, etc.)
  momentum: 0.68,     // Price momentum
  growth: 0.55,       // Revenue/earnings growth
  volatility: -0.30,  // Risk measure
  
  // Technical indicators
  rsi: 45.2,          // RSI from daily_prices
  sma_crossover: 1.0, // Price vs SMA50/200
  
  // Fundamental ratios from calculated_metrics
  pe_ratio: 15.3,
  roe: 18.5,
  debt_to_equity: 0.45,
  
  // Smart money signals
  insider_sentiment: 0.6,  // From Form 4 filings
  institutional_flow: 0.4, // From 13F holdings
  
  // Alternative data
  reddit_sentiment: 0.3,
  analyst_upgrades: 2,
  
  // Market context
  sector_momentum: 0.5,
  market_regime: 'BULL'
}
```

### Step 3: Calculate Weighted Score (line 568)

```javascript
const { score, contributions, weightsUsed } = _calculateScore(signals, marketRegime, company);
```

**Weight Strategies** (configurable):

#### A. **ML Combiner (Default, Best Performance)**
```javascript
// Uses trained ML model to optimize weights
// Model: XGBoost trained on historical IC performance
// Features: All signals + regime + sector
// Target: Forward 21-day returns
score = mlModel.predict(signalVector);
```

#### B. **IC-Optimized Weights**
```javascript
// Uses Information Coefficient to weight signals
// Weights learned from historical predictive power
weights = {
  value: icAnalysis.getValue('value'),      // e.g., 0.25
  quality: icAnalysis.getValue('quality'),   // e.g., 0.22
  momentum: icAnalysis.getValue('momentum'), // e.g., 0.18
  ...
};
score = Σ(signal[i] * weight[i]);
```

#### C. **Regime-Adaptive Weights**
```javascript
// Weights change based on market regime
if (regime === 'BULL') {
  weights = { momentum: 0.3, growth: 0.25, quality: 0.20, ... };
} else if (regime === 'BEAR') {
  weights = { quality: 0.35, value: 0.30, volatility: 0.20, ... };
}
```

### Step 4: Regime Adjustment (lines 571-576)

```javascript
let adjustedScore = _adjustForRegime(score, marketRegime);

// Regime multipliers:
const REGIME_ADJUSTMENTS = {
  BULL: 1.0,        // No adjustment
  BEAR: 0.7,        // Reduce buy signals 30%
  CRISIS: 0.4,      // Reduce buy signals 60%
  HIGH_VOL: 0.8,    // Reduce buy signals 20%
  RECOVERY: 1.1     // Boost buy signals 10%
};

// Apply liquidity penalty if illiquid
if (liquidityCheck.isIlliquid) {
  adjustedScore *= 0.7; // 30% confidence reduction
}
```

### Step 5: Regime Blocking (lines 581-596)

**Expert Panel Logic (Dalio, Taleb-inspired):**
```javascript
// Block weak buys in bearish markets
if (regime in ['BEAR', 'CRISIS', 'HIGH_VOL']) {
  if (action === 'buy' && adjustedScore < 0.60) {
    action = 'hold'; // Require high conviction in bad markets
  }
}
```

### Step 6: Convert Score to Action (line 579)

```javascript
function _scoreToAction(score) {
  if (score >= 0.70) return { action: 'strong_buy', confidence: 0.9 };
  if (score >= 0.40) return { action: 'buy', confidence: 0.7 };
  if (score >= -0.30) return { action: 'hold', confidence: 0.5 };
  if (score >= -0.60) return { action: 'sell', confidence: 0.7 };
  return { action: 'strong_sell', confidence: 0.9 };
}
```

---

## 4. Signal Tier Classification

**File:** `src/services/agent/agentService.js` (lines 1564-1588)

After scoring all stocks, signals are classified into tiers:

```javascript
const SIGNAL_TIERS = {
  STRONG: {
    minConfidence: 0.55,
    minScore: 0.25,
    description: 'Auto-approve eligible, high conviction'
  },
  MODERATE: {
    minConfidence: 0.40,
    minScore: 0.15,
    description: 'Show to user, require approval'
  },
  BORDERLINE: {
    minConfidence: 0.30,
    minScore: 0.10,
    description: 'Near-miss watchlist candidates'
  }
};

// Classification logic
function classifyTier(confidence, score) {
  const absScore = Math.abs(score);
  
  if (confidence >= 0.55 && absScore >= 0.25) return 'STRONG';
  if (confidence >= 0.40 && absScore >= 0.15) return 'MODERATE';
  if (confidence >= 0.30 && absScore >= 0.10) return 'BORDERLINE';
  
  return null; // Below threshold - discarded
}
```

**Signal Filtering:**
- Agent's `min_confidence` threshold (default 0.50, configurable)
- Agent's `min_signal_score` threshold (default 0.25, configurable)
- Only `buy`, `strong_buy`, `sell`, `strong_sell` actions pass (holds are filtered)
- Signals below BORDERLINE tier are discarded

---

## 5. Ranking & Sorting

**File:** `src/services/agent/tradingAgent.js` (lines 2486-2494)

Top picks are the highest-ranked signals:

```javascript
recommendations.sort((a, b) => {
  // Primary: Absolute score descending (strongest signals first)
  const scoreDiff = Math.abs(b.score) - Math.abs(a.score);
  if (scoreDiff !== 0) return scoreDiff;
  
  // Secondary: Confidence descending
  return b.confidence - a.confidence;
});
```

**Example Top Picks:**
```javascript
[
  { symbol: 'NVDA', score: 0.85, confidence: 0.92, action: 'strong_buy', tier: 'STRONG' },
  { symbol: 'MSFT', score: 0.78, confidence: 0.88, action: 'strong_buy', tier: 'STRONG' },
  { symbol: 'AAPL', score: 0.62, confidence: 0.75, action: 'buy', tier: 'MODERATE' },
  { symbol: 'GOOGL', score: 0.48, confidence: 0.68, action: 'buy', tier: 'MODERATE' },
  ...
]
```

---

## 6. Auto-Approval Logic

**File:** `src/services/agent/agentService.js` (lines 1641-1649)

```javascript
// Auto-approve STRONG tier signals if agent configured for auto-execution
if (agent.auto_execute && tier === 'STRONG' && confidence >= agent.execution_threshold) {
  approveSignal(signalId, portfolioId);
  // Signal immediately moves to execution queue
}
```

**Auto-Execution Requirements:**
1. ✅ Agent has `auto_execute` enabled
2. ✅ Signal classified as **STRONG tier** (confidence ≥ 0.55, score ≥ 0.25)
3. ✅ Confidence exceeds agent's `execution_threshold` (default 0.70)
4. ✅ Agent has linked portfolio
5. ✅ Not in CRISIS regime (if `pause_in_crisis` enabled)

---

## 7. Signal Storage

**File:** `src/services/agent/agentService.js` (line 1618)

Signals are stored in `agent_signals` table:

```sql
INSERT INTO agent_signals (
  agent_id,
  symbol,
  company_id,
  action,                -- 'strong_buy', 'buy', 'sell', 'strong_sell'
  overall_score,         -- Combined score (0-1 range)
  confidence,            -- Model confidence (0-1 range)
  raw_score,             -- Pre-adjustment score
  signals,               -- JSON: All input signals
  regime,                -- Market regime at signal time
  price_at_signal,       -- Current price
  sector,                -- Stock sector
  position_size_pct,     -- Recommended position size (%)
  suggested_shares,      -- Calculated shares to buy
  reasoning,             -- JSON: Explanation of signal
  status,                -- 'pending', 'approved', 'rejected', 'executed'
  expires_at,            -- Signal expiry (7 days default)
  portfolio_id           -- Target portfolio
) VALUES (...);
```

---

## 8. Frontend Display

**File:** `frontend/src/pages/agents/AgentDetailPage.js` (lines 708-734)

The Signals tab displays:

```javascript
// Fetch pending signals
const signals = await agentsAPI.getSignals(agentId, { 
  status: 'pending', 
  limit: 10 
});

// Display signal cards sorted by score
signals.map(signal => (
  <SignalCard
    symbol={signal.symbol}
    action={signal.action}           // 'strong_buy', 'buy', etc.
    score={signal.overall_score}     // 0.85
    confidence={signal.confidence}   // 0.92
    reasoning={signal.reasoning}     // Factor breakdown
    priceAtSignal={signal.price_at_signal}
    suggestedShares={signal.suggested_shares}
    onApprove={() => approveSignal(signal.id)}
    onReject={() => rejectSignal(signal.id)}
  />
));
```

---

## 9. Complete Signal Lifecycle

```
1. GENERATION
   ├─ Agent scans universe (manual or scheduled)
   ├─ For each stock: gather signals → calculate score → classify tier
   ├─ Filter by thresholds → sort by score/confidence
   └─ Store in agent_signals table (status='pending')

2. REVIEW
   ├─ User views signals in Signals tab
   ├─ Sees reasoning, factor contributions, regime context
   └─ Decision: Approve or Reject

3. APPROVAL
   ├─ Manual: User clicks "Approve" button
   ├─ Auto: STRONG tier + auto_execute enabled
   └─ Status → 'approved', moves to execution queue

4. EXECUTION
   ├─ Execution engine picks up approved signals
   ├─ Places orders via broker API (paper or live)
   ├─ Updates portfolio holdings
   └─ Status → 'executed'

5. TRACKING
   ├─ Recommendation outcome stored in recommendation_outcomes
   ├─ P&L tracked against price_at_signal
   ├─ Used for ML model retraining and IC analysis
   └─ Performance analytics available in dashboard
```

---

## 10. Key Configuration Parameters

**Agent Settings (`trading_agents` table):**

```javascript
{
  // Signal Generation
  universe: 'SP500',              // Stock universe to scan
  scan_frequency: 'daily',        // Scan schedule
  min_confidence: 0.50,           // Minimum confidence threshold
  min_signal_score: 0.25,         // Minimum score threshold
  
  // Execution
  auto_execute: true,             // Enable auto-approval
  execution_threshold: 0.70,      // Min confidence for auto-approve
  max_position_pct: 5.0,          // Max position size (% of portfolio)
  
  // Risk Management
  pause_in_crisis: true,          // Pause during CRISIS regime
  apply_earnings_filter: true,    // Skip stocks near earnings
  tax_aware_trading: true,        // Consider tax implications
  
  // Scoring Strategy
  use_ml_combiner: true,          // Use ML model vs fixed weights
  use_factor_exposure: true,      // Include factor analysis
  regime_adaptive: true           // Adjust weights by regime
}
```

---

## 11. Example: Real Signal Generation

**Input:**
- Agent: "Value + Quality Focus"
- Universe: SP500
- Regime: BULL
- Scan triggered: Manual

**Process:**
```
1. Scan 503 SP500 stocks
2. Filter: Remove 28 in earnings blackout
3. Score 475 remaining stocks
4. Results:
   - 42 signals above min_score threshold
   - Classified: 12 STRONG, 18 MODERATE, 12 BORDERLINE
   - Top 10 by score:
     
     Rank  Symbol  Score  Conf   Action       Tier
     --------------------------------------------------------
     1     NVDA    0.87   0.93   strong_buy   STRONG   ✅ Auto
     2     META    0.82   0.89   strong_buy   STRONG   ✅ Auto
     3     MSFT    0.76   0.85   strong_buy   STRONG   ✅ Auto
     4     AVGO    0.71   0.82   strong_buy   STRONG   ✅ Auto
     5     AAPL    0.65   0.77   buy          MODERATE 👤 Review
     6     GOOGL   0.58   0.74   buy          MODERATE 👤 Review
     7     AMD     0.52   0.68   buy          MODERATE 👤 Review
     8     NFLX    0.48   0.65   buy          MODERATE 👤 Review
     9     CRM     0.44   0.61   buy          MODERATE 👤 Review
     10    TSLA    0.41   0.58   buy          MODERATE 👤 Review

5. Auto-approved: 4 signals (STRONG tier with conf > 0.70)
6. Pending user review: 6 signals (MODERATE tier)
7. Discarded: 32 signals (below min_confidence or BORDERLINE)
```

---

## 12. How to Influence Top Picks

### As a User:

1. **Adjust Thresholds:**
   - Lower `min_confidence` → More signals, lower quality
   - Raise `min_confidence` → Fewer signals, higher quality
   - Lower `min_signal_score` → More opportunities
   - Raise `min_signal_score` → Only strongest signals

2. **Change Universe:**
   - SP500 → Large caps, lower volatility
   - RUSSELL2000 → Small caps, higher growth potential
   - ALL → Maximum opportunities, higher noise

3. **Configure Weights:**
   - Emphasize `value` → Value investing style
   - Emphasize `momentum` → Growth/trend following
   - Emphasize `quality` → Conservative, defensive

4. **Enable/Disable Filters:**
   - `apply_earnings_filter` → Reduce volatility
   - `pause_in_crisis` → Capital preservation
   - `tax_aware_trading` → Tax efficiency

### As a Developer:

1. **Add New Signal Sources:**
   - Edit `_gatherSignals()` to include new data
   - Update ML model training to use new features
   - Retrain IC weights with new signals

2. **Modify Scoring Logic:**
   - Adjust `_calculateScore()` algorithm
   - Change regime adjustment multipliers
   - Update tier thresholds

3. **Enhance ML Model:**
   - Use more sophisticated models (LightGBM, Neural Nets)
   - Add feature engineering
   - Expand training dataset

---

## Summary

**Top Picks = Stocks with Highest Scores** where:

```
Score = f(
  Factor Signals,        // Value, Quality, Momentum, Growth
  Technical Indicators,  // RSI, SMA crossovers, volume
  Smart Money Data,      // Insider/institutional flows
  Alternative Data,      // Sentiment, upgrades
  Market Regime,         // BULL, BEAR, CRISIS
  Liquidity,             // Volume, market cap
  Earnings Timing        // Blackout periods
)

Filtered by:
  - Minimum confidence threshold
  - Minimum score threshold
  - Action type (buy/sell only, no holds)
  
Ranked by:
  1. Absolute score (descending)
  2. Confidence (descending)

Classified into:
  - STRONG tier → Auto-approve eligible
  - MODERATE tier → Requires user approval
  - BORDERLINE tier → Watchlist candidates
```

**The system is designed to surface the highest-conviction, risk-adjusted investment opportunities based on multi-factor quantitative analysis combined with machine learning optimization.** 🎯

