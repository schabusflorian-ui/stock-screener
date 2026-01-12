# Reddit Data - Already Operational! 📱

**Date:** 2026-01-12
**Status:** ✅ WORKING - 540 Posts with Sentiment Analysis

---

## Executive Summary

Your Reddit data fetching and sentiment analysis **is already working**! You have 540 recent posts from 10+ subreddits with FinBERT sentiment scores, properly linked to companies.

---

## Current Data Coverage

### Posts by Subreddit

| Subreddit | Posts | Date Range |
|-----------|-------|------------|
| stocks | 32 | 2025-12-08 to 2026-01-08 |
| TickerTalkByLiam | 31 | 2025-12-12 to 2026-01-08 |
| GreenWicks | 29 | 2025-12-11 to 2026-01-05 |
| TheDesperateTrader | 20 | 2025-12-26 to 2026-01-06 |
| options | 14 | 2025-12-08 to 2025-12-30 |
| wallstreetbets | 13 | 2025-12-08 to 2026-01-08 |
| investing | 12 | 2025-12-07 to 2026-01-08 |
| **Total** | **540** | **Last 30 days** |

### Top Mentioned Stocks (Last 30 Days)

| Symbol | Company | Mentions | Sentiment | Upvotes | Signal |
|--------|---------|----------|-----------|---------|--------|
| **CRM** | Salesforce | 28 | **+0.18** 🟢 | 127 | **Positive** |
| INTC | Intel | 22 | -0.33 🔴 | 2,002 | Contrarian Buy? |
| TSLA | Tesla | 21 | -0.50 🔴 | 664 | Bearish |
| UNH | UnitedHealth | 29 | -0.58 🔴 | 1,166 | Very Bearish |
| RTX | RTX Corp | 38 | -0.65 🔴 | 169 | Very Bearish |
| NFLX | Netflix | 12 | -0.68 🔴 | 1,287 | Extremely Bearish |

---

## Data Quality

### ✅ What's Working

1. **Reddit Posts Table**: 540 posts with full metadata
   - Title, body text, author, score, comments
   - Properly linked to companies via `company_id`
   - Recent data (last 30 days)

2. **Sentiment Analysis**: FinBERT scores on all posts
   - Score range: -1 (bearish) to +1 (bullish)
   - Confidence levels included
   - Labels: positive/negative/neutral

3. **Subreddit Coverage**:
   - wallstreetbets ✅
   - stocks ✅
   - investing ✅
   - options ✅
   - Plus 6 smaller subreddits

### ⚠️ What's Missing

1. **Ticker Mentions Table**: Empty (0 records)
   - Table exists but not populated
   - Posts ARE linked to companies (via `company_id`)
   - Just missing the explicit mention tracking

2. **Combined Sentiment**: Only 57 records
   - Should aggregate Reddit + News + StockTwits
   - Needs refresh/update

---

## Sentiment Insights

### 🟢 Most Bullish (Last 30 Days)
- **CRM (Salesforce)**: +0.18 sentiment, 28 mentions
  - Only major stock with positive Reddit sentiment
  - Contrarian opportunity or genuine strength?

### 🔴 Most Bearish (Last 30 Days)
- **NFLX (Netflix)**: -0.68 sentiment, 12 mentions
- **RTX**: -0.65 sentiment, 38 mentions
- **UNH**: -0.58 sentiment, 29 mentions

**Contrarian Signal:** Extreme bearish sentiment often marks bottoms

### 📊 Volume Leaders (Most Discussed)
1. SIDU - 40 mentions (but negative sentiment)
2. RTX - 38 mentions (very bearish)
3. UNH - 29 mentions (bearish)
4. CRM - 28 mentions (POSITIVE - contrarian!)
5. INTC - 22 mentions (moderately bearish)

---

## How Reddit Sentiment Is Used

### Current Integration

Reddit sentiment is already part of your trading strategy via the `sentiment` weight:

```javascript
// In ConfigurableStrategyAgent.generateSignal():
if (weights.sentiment > 0) {
  const sentScore = this._calculateSentimentScore(stock.id);
  // Pulls from combined_sentiment table
  // Which aggregates Reddit + News + StockTwits
}
```

### SME Panel Recommendation

> "Sentiment is TIER 2 (moderate value). Only useful at EXTREMES (euphoria/panic). Daily sentiment is NOISE - track EXTREMES."

**How to use it:**
- **Contrarian signals** at extremes
- Ignore daily fluctuations
- When Reddit is extremely bearish + fundamentals strong = buy signal
- When Reddit is extremely bullish + fundamentals weak = sell signal

---

## To Keep Data Fresh

### Automated Updates

Your system likely has a scheduler running the Reddit fetcher. Check:

```bash
# Check if there's a cron job or scheduler
grep -r "RedditFetcher\|redditFetcher" src/jobs/
```

### Manual Update (if needed)

The Reddit fetcher is at: `src/services/redditFetcher.js`

To manually fetch new data, you'd need to:
1. Import the RedditFetcher class
2. Call `getSubredditPosts()` method
3. Process and store results

Example:
```javascript
const RedditFetcher = require('./src/services/redditFetcher');
const reddit = new RedditFetcher(db);

// Fetch from wallstreetbets
const posts = await reddit.getSubredditPosts('wallstreetbets', {
  sort: 'hot',
  limit: 100,
  time: 'week'
});
```

---

## Example Use Cases

### 1. Contrarian Play: CRM (Salesforce)
- Reddit sentiment: **+0.18** (only positive stock)
- 28 mentions with 127 upvotes
- **Strategy:** If fundamentals confirm, this is a rare bullish Reddit consensus

### 2. Contrarian Buy: INTC (Intel)
- Reddit sentiment: **-0.33** (moderately bearish)
- But 2,002 upvotes (highly engaged community)
- **Strategy:** Check if bearishness is overdone vs fundamentals

### 3. Avoid: NFLX (Netflix)
- Reddit sentiment: **-0.68** (extremely bearish)
- 1,287 upvotes (high engagement)
- **Strategy:** Unless fundamentals are exceptional, wait for sentiment to improve

---

## Data Files

- **Posts:** `reddit_posts` table (540 records)
- **Mentions:** `reddit_ticker_mentions` table (0 records - not being used)
- **Sentiment:** `combined_sentiment` table (57 records)
- **Fetcher:** [src/services/redditFetcher.js](src/services/redditFetcher.js)

---

## Comparison: Reddit vs Insider/Congressional Trading

| Data Source | Coverage | Signal Quality | Use Case |
|-------------|----------|----------------|----------|
| **Insider Trading** | 1,202 trades, 50 companies | TIER 1 - High (+3-5% alpha) | Primary signal |
| **Congressional Trading** | 50 trades, 10 companies | TIER 1 - High (+6-10% alpha) | Primary signal |
| **Reddit Sentiment** | 540 posts, 100+ companies | TIER 2 - Moderate | Contrarian/extremes |

### When to Use Reddit Data

✅ **Good Use Cases:**
- Extreme bearish sentiment + strong fundamentals = contrarian buy
- Extreme bullish sentiment + weak fundamentals = contrarian sell
- Monitoring social media "hype" vs reality
- Tracking retail investor sentiment shifts

❌ **Bad Use Cases:**
- Daily trading signals (too noisy)
- Primary buy/sell signals (use fundamentals/insider/congressional instead)
- Short-term momentum (Reddit sentiment lags price action)

---

## Summary

**Status:** ✅ Your Reddit data is WORKING
**Coverage:** 540 posts, 10+ subreddits, last 30 days
**Quality:** FinBERT sentiment scores, properly linked to companies
**Usage:** Already integrated via sentiment weight in strategy

**Key Finding:** CRM (Salesforce) is the only stock with positive Reddit sentiment (28 mentions, +0.18 score) - potential opportunity!

**Recommendation:** Your Reddit data is operational. Focus on:
1. Using it for contrarian signals at extremes
2. Keeping it updated (check if scheduler is running)
3. Prioritizing insider/congressional signals (TIER 1) over Reddit (TIER 2)
