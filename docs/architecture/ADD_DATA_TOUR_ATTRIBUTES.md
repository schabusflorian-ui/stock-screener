# Quick Guide: Add data-tour Attributes

## What are data-tour attributes?

These are special HTML attributes that mark elements for the tour system to highlight and explain.

## Where to Add Them

### 1. HomePage.js (Main Dashboard)

Find these elements and add attributes:

```jsx
// Search bar
<input
  data-tour="search"  // ← ADD THIS
  type="text"
  placeholder="Search stocks..."
/>

// AI Chat button
<button
  data-tour="ai-chat"  // ← ADD THIS
  onClick={openAIChat}
>
  Ask AI
</button>

// Watchlist link/button
<Link
  data-tour="watchlist"  // ← ADD THIS
  to="/watchlist"
>
  Watchlist
</Link>

// Screening link
<Link
  data-tour="screening"  // ← ADD THIS
  to="/screening"
>
  Stock Screener
</Link>

// Agents link
<Link
  data-tour="agents"  // ← ADD THIS
  to="/agents"
>
  Trading Agents
</Link>
```

### 2. CompanyPage.js (Stock Detail)

```jsx
// Price chart
<div
  data-tour="price-chart"  // ← ADD THIS
  className="price-chart"
>
  {/* Chart component */}
</div>

// Fundamentals section
<div
  data-tour="fundamentals"  // ← ADD THIS
  className="fundamentals"
>
  {/* Metrics */}
</div>

// Financial statements
<div
  data-tour="financials"  // ← ADD THIS
  className="financials"
>
  {/* Statements */}
</div>

// AI Analysis button/section
<button
  data-tour="ai-analysis"  // ← ADD THIS
  onClick={getAIAnalysis}
>
  AI Analysis
</button>
```

### 3. ScreeningPage.js

```jsx
// Filters panel
<div
  data-tour="filters"  // ← ADD THIS
  className="filters-panel"
>
  {/* Filter controls */}
</div>

// Results table
<div
  data-tour="results"  // ← ADD THIS
  className="results-table"
>
  {/* Stock results */}
</div>

// Save screen button
<button
  data-tour="save-screen"  // ← ADD THIS
  onClick={saveScreen}
>
  Save Screen
</button>
```

### 4. AgentsPage.js (Trading Agents)

```jsx
// Create agent button
<button
  data-tour="create-agent"  // ← ADD THIS
  onClick={createNewAgent}
>
  Create Agent
</button>

// Agent list
<div
  data-tour="agent-list"  // ← ADD THIS
  className="agent-list"
>
  {/* List of agents */}
</div>

// Backtest section
<div
  data-tour="backtest"  // ← ADD THIS
  className="backtest-section"
>
  {/* Backtest controls */}
</div>
```

## That's It!

Once you add these attributes:
1. The tours will automatically highlight these elements
2. Show helpful popovers explaining each feature
3. Guide users through the app step-by-step

## Test It

```javascript
// In browser console:
localStorage.removeItem('investment_completed_tours')

// Then refresh the page
// Tour should auto-start for new users!
```

## Tour Definitions

All tour content is in: [frontend/src/lib/tours/tourDriver.js](frontend/src/lib/tours/tourDriver.js#L13)

You can customize the text, order, and positioning there!
