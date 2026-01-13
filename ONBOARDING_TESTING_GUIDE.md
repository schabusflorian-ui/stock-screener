# Onboarding System - Testing Guide

## 🧪 How to Test All Features

### Prerequisites

1. **Start the backend server:**
   ```bash
   npm start
   ```

2. **Start the frontend:**
   ```bash
   cd frontend && npm start
   ```

3. **Run database migration** (for user preferences):
   ```bash
   node src/database-migrations/add-user-preferences-table.js
   ```

4. **Add onboarding route** to your API (in `src/api/index.js` or similar):
   ```javascript
   const onboardingRoutes = require('./routes/onboarding');
   app.use('/api/onboarding', onboardingRoutes);
   ```

---

## 🎯 Test 1: Welcome Flow

### Step 1: Clear localStorage
Open browser console and run:
```javascript
localStorage.clear()
```

### Step 2: Refresh the app
After clearing, refresh the page. You should see the Welcome Flow appear automatically.

### Step 3: Complete the flow
1. **Welcome Screen** - Click "Get Started"
2. **Interests** - Select 2-3 interests (e.g., Growth, Tech, Value)
3. **Risk Profile** - Select a risk level (e.g., Moderate)
4. **First Watchlist** - Add some stocks from suggestions
5. **Tour Offer** - Choose either "Yes, show me around" or "Skip"

### Expected Results:
- Flow should be smooth with animations
- Progress dots at bottom should update
- Data should be saved to localStorage
- API call to `/api/onboarding/preferences` should succeed (check Network tab)

### Check LocalStorage:
```javascript
localStorage.getItem('investment_onboarding_data')
localStorage.getItem('investment_onboarding_complete')
```

---

## 🎯 Test 2: Feature Tours

### Method 1: Auto-start (First Time)
1. Clear localStorage: `localStorage.clear()`
2. Complete Welcome Flow and click "Yes, show me around"
3. Tour should start automatically after flow closes

### Method 2: Manual Reset
Run in console:
```javascript
localStorage.removeItem('investment_completed_tours')
```
Then refresh any page with `data-tour` attributes.

### Add Tour Attributes (if not present):
In your pages, add these attributes:

**HomePage.js:**
```jsx
<input data-tour="search" type="text" placeholder="Search..." />
<button data-tour="watchlist">Watchlist</button>
<button data-tour="ai-chat">Ask AI</button>
```

### Expected Results:
- Spotlight highlights each element
- Popover shows with title and description
- Can navigate with Next/Previous buttons
- Progress shows "1 of 5", "2 of 5", etc.
- Can close tour anytime with X button

---

## 🎯 Test 3: Empty States

### Test EmptyWatchlist:
1. Go to `/watchlist`
2. If you have stocks, delete them all
3. Should see empty state with star icon and "Add your first stock" button

### Test EmptyPortfolio:
1. Go to `/portfolios`
2. If you have portfolios, delete them
3. Should see empty state with chart icon

### Test EmptySearchResults:
1. Go to any search
2. Search for nonsense like "XYZABC123"
3. Should see "No results" empty state

### Add Empty States to Your Pages:
```jsx
import { EmptyWatchlist, EmptyPortfolio } from './components/empty-states';

// In your component:
{stocks.length === 0 ? (
  <EmptyWatchlist onAddStock={() => setShowModal(true)} />
) : (
  <StockList stocks={stocks} />
)}
```

---

## 🎯 Test 4: Metric Tooltips

### Where to Find Them:
Go to any stock detail page (e.g., `/company/AAPL`)

### Expected Behavior:
- Hover over the (?) icon next to metrics
- Tooltip should appear with:
  - Metric title
  - Description
  - Formula
  - Interpretation

### Add Tooltips to Your Components:
```jsx
import { MetricTooltip } from './components/help';

<div>
  P/E Ratio: {stock.peRatio}
  <MetricTooltip metric="pe_ratio" />
</div>
```

### Test All Available Metrics:
- `pe_ratio`
- `market_cap`
- `dividend_yield`
- `peg_ratio`
- `rsi`
- `beta`
- `debt_to_equity`
- `current_ratio`
- `roe`
- `gross_margin`
- `operating_margin`
- `free_cash_flow`
- `ev_ebitda`
- `price_to_book`
- `price_to_sales`
- `eps_growth`
- `revenue_growth`

---

## 🎯 Test 5: Help Center & AI Assistant

### Navigate to Help Center:
Go to `/help`

### Test AI Assistant:
1. Should see AI chat box at top of page
2. Try example questions (click them)
3. Type your own question: "How do I create a watchlist?"
4. Should get AI-generated response

### Test FAQ Search:
1. Type in FAQ search box: "watchlist"
2. Should filter to relevant questions
3. Click a question to expand
4. Click again to collapse

### Test Categories:
- All 5 categories should be visible
- Each should have multiple questions
- Questions should expand/collapse smoothly

---

## 🎯 Test 6: Onboarding Progress Widget

### Where to Find It:
Should appear on the home page or dashboard after completing welcome flow

### How to Test:
1. Complete welcome flow
2. Go to home page
3. Should see purple gradient widget showing "Getting Started"
4. Should show 0 of 5 tasks complete initially

### Mark Tasks Complete:
In your components, add progress tracking:

```jsx
import { useOnboardingProgress } from './hooks/useOnboardingProgress';

const { markTaskComplete } = useOnboardingProgress();

// When user adds a stock to watchlist:
markTaskComplete('watchlist');

// When user creates a portfolio:
markTaskComplete('portfolio');

// When user sets an alert:
markTaskComplete('alert');

// When user asks AI a question:
markTaskComplete('ai_query');

// When user completes profile:
markTaskComplete('profile');
```

### Expected Results:
- Progress bar fills as tasks complete
- Completed tasks show checkmark
- After all 5 complete, shows celebration message

### Dismiss Widget:
Click X button - widget should disappear and not come back

### Reset Progress:
```javascript
localStorage.removeItem('onboarding_completed_tasks')
localStorage.removeItem('onboarding_progress_dismissed')
```

---

## 🎯 Test 7: User Preferences Persistence

### Test Backend Integration:

1. **Complete onboarding** with specific preferences:
   - Interests: Growth, Tech
   - Risk: Aggressive
   - Stocks: AAPL, MSFT, NVDA

2. **Check database:**
   ```sql
   SELECT * FROM user_preferences WHERE user_id = 'your_user_id';
   ```

3. **Use preferences in app:**
   ```jsx
   import { useUserPreferences } from './hooks/useUserPreferences';

   const { preferences, hasInterest, getRiskLevel } = useUserPreferences();

   // Check if user likes growth stocks
   if (hasInterest('growth')) {
     // Show growth-focused content
   }

   // Get risk level
   const risk = getRiskLevel(); // { level: 'high', score: 3 }
   ```

4. **Fetch from API:**
   ```bash
   curl http://localhost:3000/api/onboarding/preferences \
     -H "Cookie: your_session_cookie"
   ```

5. **Get personalized recommendations:**
   ```bash
   curl http://localhost:3000/api/onboarding/recommendations \
     -H "Cookie: your_session_cookie"
   ```

---

## 🐛 Common Issues & Solutions

### Issue: Welcome flow doesn't appear
**Solution:**
```javascript
localStorage.clear()
// Then refresh
```

### Issue: Tours don't start
**Solution:**
1. Check that `data-tour` attributes exist on elements
2. Reset tours: `localStorage.removeItem('investment_completed_tours')`
3. Make sure elements are visible in DOM

### Issue: Empty states not showing
**Solution:**
- Make sure you have NO data (empty array, null, etc.)
- Check console for errors
- Verify import path is correct

### Issue: Tooltips not appearing
**Solution:**
- Check if `@radix-ui/react-tooltip` is installed
- Verify `TooltipProvider` is wrapping your component
- Check for z-index conflicts in CSS

### Issue: Progress widget not tracking
**Solution:**
- Verify `markTaskComplete()` is being called
- Check localStorage: `localStorage.getItem('onboarding_completed_tasks')`
- Make sure hook is imported correctly

### Issue: API calls failing
**Solution:**
1. Check backend is running: `http://localhost:3000`
2. Verify route is registered in API
3. Check browser Network tab for errors
4. Verify authentication cookies are present

---

## 📸 Visual Testing Checklist

### Welcome Flow
- [ ] Gradient background displays correctly
- [ ] Progress dots update as you advance
- [ ] Interest cards highlight when selected
- [ ] Risk profile cards show allocation bars
- [ ] Stock chips display in watchlist step
- [ ] Animations are smooth (no jank)
- [ ] Mobile responsive (test on narrow screen)

### Tours
- [ ] Spotlight highlights correct element
- [ ] Popover positioned correctly (not off-screen)
- [ ] Arrow points to element
- [ ] Progress text shows current step
- [ ] Navigation buttons work
- [ ] Close button exits tour

### Empty States
- [ ] Icon displays (emoji or SVG)
- [ ] Title and description centered
- [ ] Action buttons are visible and clickable
- [ ] Hover effects work
- [ ] Mobile layout looks good

### Tooltips
- [ ] Appears on hover
- [ ] Positioned correctly (not off-screen)
- [ ] Arrow points to trigger
- [ ] Text is readable (good contrast)
- [ ] Disappears on mouse leave

### Help Center
- [ ] AI assistant box displays at top
- [ ] Example questions are clickable
- [ ] Search filters FAQ correctly
- [ ] Questions expand/collapse smoothly
- [ ] Contact support section visible

### Progress Widget
- [ ] Gradient background renders
- [ ] Progress bar fills correctly
- [ ] Checkmarks appear for completed tasks
- [ ] Dismiss button works
- [ ] Mobile layout is readable

---

## 🎮 Demo Mode

To quickly test all features, run this in console:

```javascript
// Enable demo mode
window.ONBOARDING_DEMO = true;

// This will:
// 1. Show welcome flow immediately
// 2. Pre-fill some data
// 3. Auto-complete steps quickly
// 4. Show all components

// Reset everything
localStorage.clear();
window.location.reload();
```

---

## ✅ Complete Test Checklist

Run through this before marking as done:

- [ ] Welcome flow completes successfully
- [ ] Data saves to localStorage
- [ ] Data saves to backend (check database)
- [ ] Tour auto-starts after welcome flow
- [ ] Tour can be manually restarted
- [ ] All empty states render correctly
- [ ] All metric tooltips work
- [ ] Help center loads and searches work
- [ ] AI assistant responds to questions
- [ ] Progress widget appears and tracks
- [ ] Progress widget can be dismissed
- [ ] User preferences accessible via hook
- [ ] Personalized recommendations work
- [ ] All features work on mobile
- [ ] No console errors
- [ ] Network requests succeed

---

## 📞 Get Help

If you encounter issues:
1. Check browser console for errors
2. Check Network tab for failed API calls
3. Verify all dependencies are installed
4. Review [ONBOARDING_SYSTEM_README.md](ONBOARDING_SYSTEM_README.md)
5. Check [ONBOARDING_QUICK_START.md](frontend/ONBOARDING_QUICK_START.md)

**Test Data:**
- LocalStorage keys to check: `investment_onboarding_data`, `investment_onboarding_complete`, `investment_completed_tours`, `onboarding_completed_tasks`
- Database table: `user_preferences`
- API endpoints: `/api/onboarding/preferences`, `/api/onboarding/recommendations`
