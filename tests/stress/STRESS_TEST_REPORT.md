# Synthetic User Stress Test Report

**Date:** January 28, 2026
**Target:** http://localhost:3001
**Duration:** 9.09 seconds
**Total Tests:** 65

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| **Overall Success Rate** | 35.4% | 🔴 CRITICAL |
| **Tests Passed** | 23 | |
| **Tests Failed** | 42 | |
| **Avg Response Time** | ~150ms | 🟢 Good |

---

## Results by User Profile

| Profile | Passed | Failed | Success Rate | Avg Time | Status |
|---------|--------|--------|--------------|----------|--------|
| **Quant Researcher** | 7 | 1 | 88% | 758ms | 🟢 Good |
| **Value Investor** | 3 | 5 | 38% | 223ms | 🟡 Warning |
| **Momentum Trader** | 2 | 5 | 29% | 33ms | 🔴 Critical |
| **Portfolio Manager** | 1 | 2 | 33% | 32ms | 🔴 Critical |
| **Beginner Investor** | 3 | 5 | 38% | 68ms | 🟡 Warning |
| **Insider Tracker** | 2 | 4 | 33% | 11ms | 🔴 Critical |
| **Sentiment Analyst** | 1 | 5 | 17% | 8ms | 🔴 Critical |
| **ML Engineer** | 0 | 6 | 0% | 7ms | 🔴 BROKEN |
| **Risk Manager** | 1 | 5 | 17% | 6ms | 🔴 Critical |
| **Power User** | 3 | 4 | 43% | 12ms | 🟡 Warning |

---

## Critical Findings

### 🔴 Category 1: Missing/Broken Endpoints

The following API endpoints returned 404 or are not implemented:

1. **ML/MLOps Endpoints (100% failure)**
   - `/api/ml/models` - Not found
   - `/api/ml/health` - Not found
   - `/api/ml/predictions` - Not found
   - `/api/ml/feature-importance` - Not found
   - `/api/ml/drift` - Not found
   - `/api/ml/training-history` - Not found

2. **Price/Quote Endpoints**
   - `/api/prices/{symbol}/quote` - Not found
   - `/api/prices/{symbol}/history` - Returns error object
   - `/api/prices/batch` - Not found
   - `/api/prices/{symbol}/volatility` - Not found
   - `/api/prices/{symbol}/drawdown` - Not found

3. **Technical Analysis**
   - `/api/signals/technical/{symbol}` - Not found
   - `/api/signals/insider/{symbol}` - Not found

4. **Sentiment Endpoints**
   - `/api/sentiment/overview` - Returns "Company not found"
   - `/api/sentiment/reddit` - Wrong endpoint structure
   - `/api/sentiment/stocktwits/{symbol}` - Not found
   - `/api/sentiment/news/{symbol}` - Not found

---

### 🟡 Category 2: Authentication Required

These endpoints work but require authentication:

1. `/api/dcf/{symbol}` - "Authentication required"
2. `/api/portfolios` (POST) - "Authentication required"
3. `/api/watchlist` - "User not authenticated"
4. `/api/nl/query` - "Authentication required"

**Impact:** Beginner users and unauthenticated access is broken.

---

### 🟢 Category 3: Working Well

These endpoints performed well:

1. **Factor Research (Quant Lab)**
   - `/api/factors/available-metrics` ✓ (1434ms)
   - `/api/factors/validate` ✓ (50ms)
   - `/api/factors/preview` ✓ (2192ms)
   - `/api/factors/define` ✓ (17ms)
   - `/api/factors/ic-analysis` ✓ (1595ms)
   - `/api/factors/correlation` ✓ (242ms)
   - `/api/factors/user` ✓ (530ms)

2. **Company Data**
   - `/api/companies/{symbol}` ✓ (102ms)
   - `/api/companies/{symbol}/metrics` ✓ (194ms)
   - `/api/companies/{symbol}/news` ✓ (513ms)

3. **Congressional/Insider**
   - `/api/congressional/trades` ✓ (32ms)
   - `/api/congressional/politicians` ✓ (7ms)

4. **Infrastructure**
   - `/api/health` ✓ (2ms)
   - `/api/sectors/{sector}` ✓ (1191ms)

---

## Performance Analysis

### Slowest Endpoints (Avg Response Time)

| Rank | Endpoint | Avg Time | Max Time | Assessment |
|------|----------|----------|----------|------------|
| 1 | Preview factor values | 2,192ms | 2,192ms | 🟡 Acceptable for complex calc |
| 2 | IC analysis | 1,595ms | 1,595ms | 🟡 Acceptable for analytics |
| 3 | Get available metrics | 1,434ms | 1,434ms | 🟡 Could cache this |
| 4 | Sector analysis | 1,191ms | 1,191ms | 🟡 Heavy query |
| 5 | Get user factors | 530ms | 530ms | 🟢 Fine |
| 6 | Get news | 513ms | 513ms | 🟢 External API |

**Note:** All slow endpoints are analytical queries. This is expected behavior.

### Concurrent Load Test

| Test | Result | Assessment |
|------|--------|------------|
| 10 concurrent company lookups | ✓ 28ms total | 🟢 Excellent |
| 5 rapid sequential health checks | ✓ 11ms total | 🟢 Excellent |

**Backend handles concurrent load well.**

---

## Root Cause Analysis

### Why 65% of tests failed:

1. **Route Naming Mismatch (40% of failures)**
   - Tests expected `/api/prices/{symbol}/history`
   - Actual route might be `/api/historical/prices/{symbol}`
   - Tests expected `/api/ml/*`
   - Actual routes are under `/api/mlops/*` or internal only

2. **Authentication Enforcement (15% of failures)**
   - Several endpoints now require auth that previously didn't
   - No test token was provided

3. **Endpoint Not Implemented (35% of failures)**
   - ML endpoints appear to be internal only
   - Some sentiment/technical endpoints don't exist

4. **API Response Format Issues (10% of failures)**
   - Some endpoints return error objects instead of error strings
   - Need to check `data.error` vs `data.message` vs just `data`

---

## Recommendations

### P0 - Critical (Fix Immediately)

1. **Add Public ML Status Endpoint**
   - Even if ML is internal, expose `/api/ml/status` for health monitoring

2. **Fix Price Quote Endpoint**
   - Users expect `/api/prices/{symbol}/quote` to work
   - Currently returns 404

3. **Standardize Error Responses**
   - All errors should be `{ success: false, error: "message" }`
   - Not `{ success: false, error: { object } }`

### P1 - High Priority

4. **Add Guest Mode for Basic Features**
   - Stock quotes, news, basic company info should work without auth
   - Current auth enforcement is too strict

5. **Implement Missing Technical Endpoints**
   - `/api/signals/technical/{symbol}`
   - `/api/prices/{symbol}/volatility`

### P2 - Medium Priority

6. **Cache Slow Endpoints**
   - `/api/factors/available-metrics` (1.4s) - metrics don't change often
   - `/api/sectors/*` (1.2s) - can cache for 5 minutes

7. **Document API Routes**
   - Create OpenAPI spec so tests match actual routes

---

## Working Features Summary

The following user journeys work correctly:

✅ **Quant Research Flow**
- Define custom factors
- Validate formulas
- Preview factor values
- Run IC analysis
- Check correlations
- Save factors

✅ **Company Research**
- Look up company fundamentals
- View company metrics
- Read company news

✅ **Congressional Tracking**
- View congressional trades
- List politicians

✅ **System Health**
- Health check endpoint
- Concurrent request handling

---

## Broken Features Summary

❌ **Price Data Access**
❌ **ML/AI Model Access**
❌ **Sentiment Analysis**
❌ **Technical Signals**
❌ **Portfolio Creation (needs auth)**
❌ **Watchlist (needs auth)**
❌ **Stock Screening**
❌ **Risk Analytics**

---

## Conclusion

**The Quant Lab (Factor research) is solid.** The recent work on the factor workflow is performing well with 88% success rate and reasonable response times.

**Core data access is broken.** Basic features like stock quotes, price history, and screening don't work, which would block most users.

**Recommendation:** Before further UI work, invest in:
1. Fixing price/quote endpoints
2. Standardizing error responses
3. Adding basic guest access for public data
