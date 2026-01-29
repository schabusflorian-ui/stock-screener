# Onboarding System - Quick Start Guide

## 🚀 5-Minute Integration Guide

### 1. Use Empty States

```jsx
import { EmptyWatchlist, EmptyPortfolio, EmptyAgents } from './components/empty-states';

// In your component
{watchlist.length === 0 ? (
  <EmptyWatchlist onAddStock={() => setShowAddModal(true)} />
) : (
  <WatchlistTable stocks={watchlist} />
)}
```

### 2. Add Metric Tooltips

```jsx
import { MetricTooltip } from './components/help';

<div className="metric-card">
  <span>P/E Ratio <MetricTooltip metric="pe_ratio" /></span>
  <span>{stock.peRatio}</span>
</div>
```

### 3. Enable Tours

```jsx
// Add data-tour attributes
<input data-tour="search" type="text" placeholder="Search..." />
<button data-tour="ai-chat">Ask AI</button>
<div data-tour="watchlist">Watchlist</div>

// Auto-start tour
import { useTour } from './hooks/useTour';
useTour('main', true, 1000); // Auto-start after 1 sec
```

### 4. Track Progress

```jsx
import { useOnboardingProgress } from './hooks/useOnboardingProgress';

const { markTaskComplete } = useOnboardingProgress();

// When user completes an action
const handleAddStock = () => {
  addToWatchlist(stock);
  markTaskComplete('watchlist'); // ← Add this
};
```

### 5. Show Progress Widget

```jsx
import { OnboardingProgress } from './components/onboarding';

// Add to your dashboard/home page
<OnboardingProgress />
```

---

## 📋 Task IDs for Progress Tracking

- `'profile'` - User completes profile
- `'watchlist'` - User adds stocks to watchlist
- `'portfolio'` - User creates a portfolio
- `'alert'` - User sets a price alert
- `'ai_query'` - User asks AI a question

---

## 🎯 Tour IDs

- `'main'` - Dashboard tour
- `'stockDetail'` - Stock detail page tour
- `'screening'` - Screener tour
- `'agents'` - Trading agents tour

---

## 🎨 Available Empty States

```jsx
import {
  EmptyWatchlist,      // No stocks in watchlist
  EmptyPortfolio,      // No portfolios
  EmptyAlerts,         // No price alerts
  EmptyAgents,         // No trading agents
  EmptySearchResults,  // No search results
  EmptyNews,           // No news articles
  EmptyBacktest,       // No backtest results
  EmptyScreening,      // No stocks match filters
  EmptyInsiderTrades,  // No insider trades
  EmptyEarnings,       // No earnings data
} from './components/empty-states';
```

---

## 💡 Available Metric Tooltips

```jsx
<MetricTooltip metric="pe_ratio" />
<MetricTooltip metric="market_cap" />
<MetricTooltip metric="dividend_yield" />
<MetricTooltip metric="peg_ratio" />
<MetricTooltip metric="rsi" />
<MetricTooltip metric="beta" />
<MetricTooltip metric="debt_to_equity" />
<MetricTooltip metric="current_ratio" />
<MetricTooltip metric="roe" />
<MetricTooltip metric="gross_margin" />
<MetricTooltip metric="operating_margin" />
<MetricTooltip metric="free_cash_flow" />
<MetricTooltip metric="ev_ebitda" />
<MetricTooltip metric="price_to_book" />
<MetricTooltip metric="price_to_sales" />
<MetricTooltip metric="eps_growth" />
<MetricTooltip metric="revenue_growth" />
```

---

## 🔧 Testing Locally

```bash
# Reset onboarding (in browser console)
localStorage.clear()

# Reset specific tour
import { resetTour } from './lib/tours/tourDriver';
resetTour('main');

# Reset onboarding progress
import { resetOnboarding } from './lib/onboarding/welcomeFlow';
resetOnboarding();
```

---

## 📖 Full Documentation

See [ONBOARDING_SYSTEM_README.md](../ONBOARDING_SYSTEM_README.md) for complete documentation.
