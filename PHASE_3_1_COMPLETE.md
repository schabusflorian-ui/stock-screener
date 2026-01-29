# Phase 3.1: API Cost Tracking - Implementation Complete ✅

**Date**: 2026-01-29
**Status**: Complete and Ready for Testing

---

## 🎯 Objective

Implement comprehensive API cost tracking system to:
- Track all API calls with cost calculation
- Enforce budget limits ($10/day, $50/month for Claude)
- Provide visibility into API usage
- Prevent budget overruns

---

## ✅ Completed Work

### 1. Database Migration ✅

**File**: [src/database-migrations/add-cost-tracking.js](src/database-migrations/add-cost-tracking.js)

**Tables Created**:
- `api_usage_log` - Individual API call records
- `api_usage_daily` - Daily aggregates by provider/job
- `api_budgets` - Budget configuration

**Migration Status**: Successfully executed

**Default Budgets**:
- Alpha Vantage: No budget (free tier)
- Claude: $10/day, $50/month
- SEC EDGAR: No budget (free)
- FRED: No budget (free)

---

### 2. API Cost Tracker Service ✅

**File**: [src/services/costs/apiCostTracker.js](src/services/costs/apiCostTracker.js) (~400 lines)

**Key Methods**:
- `logCall(provider, endpoint, jobKey, cost, tokens, cached)` - Log API call
- `checkBudget(provider)` - Verify budget before API calls
- `getUsageStats(provider, period)` - Get usage statistics
- `getUsageByJob(provider, period)` - Get usage breakdown by job
- `updateBudget(provider, dailyBudget, monthlyBudget)` - Update budget limits
- `getAllProviderStatus()` - Get status of all providers

**Features**:
- Automatic cost calculation for Claude API (input: $3/1M tokens, output: $15/1M tokens)
- Budget enforcement before expensive API calls
- Daily and monthly usage aggregates
- Cache hit rate tracking
- Provider-level and job-level breakdowns

---

### 3. Cost Tracking Integration ✅

**File**: [src/services/costs/index.js](src/services/costs/index.js)

**Added Exports**:
- `getCostTracker()` - Get singleton cost tracker instance
- `trackClaudeCall(apiCallFn, options)` - Wrap Claude API calls with cost tracking
- `trackAlphaVantageCall(endpoint, jobKey)` - Track Alpha Vantage calls
- `trackSECCall(endpoint, jobKey)` - Track SEC EDGAR calls
- `trackFREDCall(endpoint, jobKey)` - Track FRED calls

**Integration Points**:
- Wraps existing API calls transparently
- Checks budget before making expensive calls
- Logs cost after calls complete
- Throws `BUDGET_EXCEEDED` error when over limit

---

### 4. LLM Handler Integration ✅

**File**: [src/services/nl/llmHandler.js](src/services/nl/llmHandler.js)

**Changes**:
- Added `trackClaudeCall` import
- Wrapped initial API call with cost tracking (line 138-149)
- Wrapped follow-up API calls in tool loop with cost tracking (line 204-215)

**Budget Enforcement**:
- Checks budget before each Claude API call
- Throws error if budget exceeded
- Logs token usage and cost after each call
- Includes job context for tracking

---

### 5. System API Endpoints ✅

**File**: [src/api/routes/system.js](src/api/routes/system.js)

**New Endpoints**:

#### GET `/api/system/costs`
- Get all provider budget status
- Shows daily/monthly usage and limits
- Authentication required

#### GET `/api/system/costs/:provider`
- Detailed cost breakdown for specific provider
- Usage statistics by time period (today/week/month)
- Usage breakdown by job
- Budget status
- Authentication required

#### PUT `/api/system/costs/:provider/budget`
- Update budget limits for a provider
- Admin access required

**Updated Endpoint**:

#### GET `/api/system/health`
- Now includes real-time API quota health using cost tracker
- Shows Claude daily/monthly budget status with percentages
- Degrades overall health status if budget exceeded

---

## 📊 How It Works

### Budget Enforcement Flow

```
1. User triggers Claude API call (e.g., natural language query)
2. trackClaudeCall() wrapper intercepts the call
3. getCostTracker().checkBudget('claude') checks current usage
4. If budget exceeded:
   - Throws BUDGET_EXCEEDED error
   - User receives "Budget exceeded" message
5. If within budget:
   - Makes API call
   - Tracks token usage from response
   - Calculates cost: (input_tokens/1M × $3) + (output_tokens/1M × $15)
   - Logs to api_usage_log and updates api_usage_daily
   - Returns response to user
```

### Cost Calculation Example

```javascript
// Claude Sonnet 4 API call with:
// - Input: 5,000 tokens
// - Output: 2,000 tokens

Input cost: (5,000 / 1,000,000) × $3.00 = $0.015
Output cost: (2,000 / 1,000,000) × $15.00 = $0.030
Total cost: $0.045

Logged to database:
- provider: 'claude'
- endpoint: '/v1/messages'
- job_key: 'nl_query'
- cost_usd: 0.045
- tokens: 7000
```

---

## 🧪 Testing Checklist

### 1. Database Migration
- ✅ Run migration: `node src/database-migrations/add-cost-tracking.js`
- ✅ Verify tables created: api_usage_log, api_usage_daily, api_budgets
- ✅ Verify default budgets inserted

### 2. Cost Tracking
- ⏸️ Make Claude API call via natural language query
- ⏸️ Verify call logged to api_usage_log table
- ⏸️ Verify daily aggregate updated in api_usage_daily
- ⏸️ Verify cost calculated correctly

### 3. Budget Enforcement
- ⏸️ Temporarily set daily budget to $0.01 for testing
- ⏸️ Make API call, verify BUDGET_EXCEEDED error
- ⏸️ Check error message includes budget status
- ⏸️ Reset budget to normal ($10/day, $50/month)

### 4. API Endpoints
- ⏸️ Test GET /api/system/health - verify API quota section populated
- ⏸️ Test GET /api/system/costs - verify all providers listed
- ⏸️ Test GET /api/system/costs/claude - verify detailed breakdown
- ⏸️ Test PUT /api/system/costs/claude/budget - verify budget update

### 5. Integration
- ⏸️ Run natural language query that uses Claude
- ⏸️ Verify query succeeds
- ⏸️ Check logs for cost tracking output
- ⏸️ Query api_usage_log table, verify entry created

---

## 📈 Expected Results

### Database Queries

**View today's usage:**
```sql
SELECT * FROM api_usage_daily
WHERE provider = 'claude'
AND date = date('now');
```

**View all Claude calls:**
```sql
SELECT
  job_key,
  COUNT(*) as calls,
  SUM(cost_usd) as total_cost,
  SUM(tokens) as total_tokens
FROM api_usage_log
WHERE provider = 'claude'
GROUP BY job_key
ORDER BY total_cost DESC;
```

**Check budget status:**
```sql
SELECT * FROM api_budgets WHERE provider = 'claude';
```

### API Responses

**GET /api/system/health** (excerpt):
```json
{
  "status": "healthy",
  "checks": {
    "api_quotas": {
      "claude": {
        "status": "healthy",
        "daily": {
          "used": 0.45,
          "limit": 10.00,
          "percent": 5,
          "exceeded": false
        },
        "monthly": {
          "used": 12.30,
          "limit": 50.00,
          "percent": 25,
          "exceeded": false
        }
      }
    }
  }
}
```

**GET /api/system/costs/claude**:
```json
{
  "provider": "claude",
  "period": "month",
  "stats": {
    "total_requests": 245,
    "total_cost": 12.30,
    "cache_hits": 0,
    "cache_hit_rate": 0,
    "avg_cost_per_request": 0.0502
  },
  "usage_by_job": [
    {
      "job_key": "nl_query",
      "total_requests": 180,
      "total_cost": 9.50,
      "cache_hits": 0
    },
    {
      "job_key": "sentiment_hourly",
      "total_requests": 65,
      "total_cost": 2.80,
      "cache_hits": 0
    }
  ],
  "budget": {
    "withinBudget": true,
    "daily": { "used": 0.45, "limit": 10.00, "percent": 5 },
    "monthly": { "used": 12.30, "limit": 50.00, "percent": 25 }
  }
}
```

---

## 🚀 Deployment Notes

### Environment Variables (Unchanged)
```bash
ANTHROPIC_API_KEY=sk-ant-...
LLM_DAILY_BUDGET=10      # $10/day limit
LLM_MONTHLY_BUDGET=50    # $50/month limit
```

### Migration Required
Before deploying to production, run the migration:
```bash
node src/database-migrations/add-cost-tracking.js
```

### Monitoring
After deployment, monitor:
1. `/api/system/health` endpoint - check `api_quotas.claude` section
2. `/api/system/costs/claude` endpoint - detailed breakdown
3. Database table `api_usage_daily` - direct usage data

---

## 💡 Benefits

### Before Phase 3.1:
- ❌ No tracking of Claude API costs
- ❌ No budget enforcement ($50/month target at risk)
- ❌ No visibility into which jobs consume most budget
- ❌ No cost data for optimization decisions

### After Phase 3.1:
- ✅ Every Claude API call tracked with exact cost
- ✅ Budget enforced automatically ($10/day, $50/month)
- ✅ Real-time visibility via `/api/system/costs` endpoints
- ✅ Usage breakdown by job for optimization
- ✅ Health monitoring includes budget status
- ✅ Historical data for trend analysis

---

## 🔄 Next Steps

### Immediate (Before Deploy):
1. Test locally - make Claude API calls, verify tracking
2. Query database to confirm costs logged correctly
3. Test budget enforcement by setting low limit
4. Verify health endpoint shows cost data

### Short Term (Week 2):
- Phase 3.3: Optimize batch endpoint (5-10x faster)
- Phase 3.4: Extend request deduplication (100x fewer duplicate calls)
- Add frontend dashboard for cost visualization

### Long Term (Month 2):
- Add cache hit rate optimization
- Implement cost alerts (email/Slack when >80% budget)
- Historical cost trending charts
- Per-user cost tracking (future multi-tenant support)

---

## 📝 Files Modified/Created

### New Files:
1. `src/database-migrations/add-cost-tracking.js` (~150 lines)
2. `src/services/costs/apiCostTracker.js` (~400 lines)

### Modified Files:
1. `src/services/costs/index.js` (+100 lines) - Added cost tracking exports
2. `src/services/nl/llmHandler.js` (+20 lines) - Integrated cost tracking
3. `src/api/routes/system.js` (+100 lines) - Added cost endpoints

**Total**: ~770 new/modified lines

---

## 🎯 Success Metrics

**Target**:
- Daily budget: <$10 (enforced)
- Monthly budget: <$50 (enforced)
- Budget violations: 0 (prevented by enforcement)
- Cost visibility: 100% of API calls tracked

**Current Status**: ✅ Ready for testing

---

**Next Phase**: Phase 3.3 - Optimize batch endpoint for 5-10x performance improvement
