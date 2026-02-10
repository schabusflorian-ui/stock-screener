# PostgreSQL Migration Audit - Current Broken State

**Date:** 2026-02-10
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

The PostgreSQL migration has **fundamental architectural issues** that explain all current errors. The root cause is that routes are using a **stub database proxy** that returns empty data instead of the real PostgreSQL database.

### Critical Finding: Stub Database in Production

**Location:** `src/database.js` lines 55-82

The code exports a Proxy `db` object that:
- In **SQLite mode**: Works normally
- In **PostgreSQL mode**: Returns STUB methods that silently fail

**Stub behavior:**
```javascript
prepare: () => ({ get: () => null, all: () => [], run: () => ({ changes: 0 }) })
```

**Impact:** Routes using `req.app.get('db')` get stubs, not real database!

---

## Root Causes of Current Errors

### 1. Server Sets Stub Database (CRITICAL)

**File:** `src/api/server.js` line 148
```javascript
app.set('db', db.getDatabase());
```

**Problem:**
- `db.getDatabase()` returns the stub proxy in PostgreSQL mode
- All routes using `req.app.get('db')` get stubs
- Stubs return empty data ([] or null) in production
- **In production, stubs are SILENT** (no warnings logged)

**Affected Routes:**
- `src/api/routes/portfolios.js` line 18 - `req.app.get('db')`
- All routes using `getService(req)` pattern
- Unknown number of other routes

### 2. Missing asyncHandler Wrapper (CRITICAL)

**File:** `src/middleware/errorHandler.js` exports `asyncHandler` (line 178)

**Problem:** Routes don't use it!

**Evidence:**
- `src/api/routes/agents.js` line 21: `router.get('/', requireAuth, async (req, res) => {`
  - Should be: `router.get('/', requireAuth, asyncHandler(async (req, res) => {`
- `src/api/routes/portfolios.js` line 48: Same issue
- `src/api/routes/analyst.js`: Same issue (all 11 endpoints)

**Impact:** Unhandled promise rejections bypass error handlers, return HTML instead of JSON

### 3. Server Middleware Ordering (MAJOR)

**File:** `src/api/server.js`

**Problem 1 - HTTPS redirect before session (lines 195-202):**
```javascript
// HTTPS redirect happens BEFORE session middleware
if (isProduction) {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// Session middleware comes AFTER (lines 311-327)
app.use(session({...}));
```

**Result:** Session cookies not set before redirect, causing 401 errors

**Problem 2 - Catch-all before error handlers (lines 615-628):**
```javascript
// Catch-all React handler
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});

// Error handlers come AFTER (lines 634-640)
app.use(notFoundHandler);
app.use(errorHandler);
```

**Result:** API errors fall through to catch-all, return HTML instead of JSON

---

## Current Errors Explained

### 401 Errors on /api/agents, /api/portfolios, /api/analyst/*

**Root causes:**
1. ❌ HTTPS redirect before session → cookies not set
2. ❌ Missing asyncHandler → promise rejections bypass auth
3. ⚠️ Stub database → some auth checks get null data

### 500 Error on /api/ipo/statistics

**Root causes:**
1. ❌ Route calls `tracker.getStatistics()` which uses stub database
2. ❌ Stub returns empty data, causing errors in business logic
3. ❌ Missing asyncHandler → errors become HTML

**Evidence:**
```javascript
// src/api/routes/ipo.js line 142
const stats = await tracker.getStatistics({ region: region || 'all' });
// tracker.getStatistics() internally uses stub db → returns empty/null
```

### HTML Responses Instead of JSON

**Root causes:**
1. ❌ Catch-all placed before error handlers
2. ❌ Missing asyncHandler → errors bypass error middleware
3. ❌ Errors fall through to catch-all → serves index.html

---

## Database Access Patterns Audit

### Pattern 1: Stub Database (BROKEN in PostgreSQL)
**Files:**
- `src/api/routes/portfolios.js` line 18: `req.app.get('db')`
- Unknown number of services using `getPortfolioService(db)` pattern

**Returns:** Stub proxy with fake methods

### Pattern 2: Synchronous Import (BROKEN in PostgreSQL)
**Files:**
- Unknown - need to grep for `require('../../database').db`

**Returns:** Stub proxy

### Pattern 3: Async getDatabaseAsync (CORRECT)
**Files:**
- `src/api/routes/trends.js` line 38: ✅ Uses `getDatabaseAsync()`
- `src/api/routes/ipo.js`: Uses lazy service initialization (may be correct)

---

## Files Claiming to be "Fixed" But Aren't

### Recently Modified Files (from git commits):

1. **src/api/routes/analyst.js** (11 endpoints)
   - ✅ Has `requireAuth`
   - ❌ Missing `asyncHandler` wrapper
   - ⚠️ Service may use stub database

2. **src/api/routes/factors.js** (34 routes)
   - ✅ Has `requireAuth`
   - ❌ Missing `asyncHandler` wrapper
   - ⚠️ Unknown database pattern

3. **src/api/routes/trends.js** (3 endpoints)
   - ✅ Has async handlers
   - ✅ Uses `getDatabaseAsync()`
   - ❌ Missing `asyncHandler` wrapper

4. **src/api/routes/ipo.js**
   - ✅ Has async handlers
   - ⚠️ Unknown if tracker service uses real database
   - ❌ Missing `asyncHandler` wrapper

---

## Services Using Wrong Database

### Need Investigation:
- `src/services/portfolio/investorService.js` - How does it get database?
- `src/services/ipoTracker.js` - getStatistics() implementation
- `src/services/agent/agentService.js` - getAllAgents() implementation
- All services that accept `db` parameter - are they getting stubs?

---

## Recommended Immediate Actions

### Phase 0: Clean Up (Must Do First)

1. **Remove stub database from app** (src/api/server.js line 148)
   - DELETE: `app.set('db', db.getDatabase());`
   - This is POISON - it infects all routes

2. **Find all routes using req.app.get('db')**
   ```bash
   grep -r "req.app.get('db')" src/api/routes/
   ```
   - Change to: `const database = await getDatabaseAsync();`

3. **Fix middleware ordering** (src/api/server.js)
   - Move session middleware BEFORE HTTPS redirect
   - Move catch-all AFTER error handlers

4. **Add asyncHandler to ALL routes**
   - Wrap every async route handler
   - This catches promise rejections

### Phase 1: Verify Infrastructure

Test these changes locally BEFORE touching services:
- [ ] Error responses are JSON (not HTML)
- [ ] Session cookies persist
- [ ] Database calls don't use stubs

### Phase 2: Fix Services One by One

Only after infrastructure is solid.

---

## Testing Requirements

### Must Test with PostgreSQL Locally

```bash
# Setup local PostgreSQL
createdb investment_test
export DATABASE_URL=postgresql://localhost:5432/investment_test
export NODE_ENV=production  # CRITICAL - test in production mode!
export SESSION_SECRET=test-secret

# Run server
npm start

# Test endpoints
curl -v http://localhost:3000/api/ipo/statistics?region=all
# Should return JSON data, NOT empty array or HTML
```

### Verification Checklist

Before claiming "it works":
- [ ] Tested with `NODE_ENV=production` (stubs are silent in production!)
- [ ] Database queries return actual data (not [], null, or {changes: 0})
- [ ] Error responses are JSON (not HTML)
- [ ] Session persists across requests
- [ ] No warnings in logs about stubs

---

## Severity Assessment

| Issue | Severity | Impact | Files Affected |
|-------|----------|--------|----------------|
| Stub database in app.set() | CRITICAL | All routes using req.app.get('db') get fake data | Unknown (need grep) |
| Missing asyncHandler | CRITICAL | Errors return HTML instead of JSON | ~60 route files |
| Middleware ordering | MAJOR | 401 errors, session issues | 1 file (server.js) |
| Services using stubs | MAJOR | Business logic fails with empty data | Unknown (need investigation) |

---

## Conclusion

The migration has **systematic architectural flaws**, not just missing awaits:

1. ❌ **Central database is a stub** - All routes using it get fake data
2. ❌ **Error handling doesn't catch async errors** - Returns HTML
3. ❌ **Middleware ordering is wrong** - Sessions and errors fail
4. ❌ **No way to detect issues** - Stubs are silent in production

**Previous fix attempts failed because they didn't address these root causes.**

This audit confirms we need to:
1. **Clean up infrastructure first** (remove poison)
2. **Add proper error handling** (asyncHandler everywhere)
3. **Fix one route at a time** with 100% verification
4. **Test in production mode** (not development)

---

## Next Steps

See `/Users/florianschabus/.claude/plans/sequential-toasting-grove.md` for detailed implementation plan.

**DO NOT** fix individual routes until infrastructure is solid.

---

## PHASE 0.2 FINDINGS: Routes Using Stub Database

**Grep Results:** Found 16 files using problematic database patterns

### Files Using `req.app.get('db')` - ALL BROKEN (14 files)

These routes are getting the **stub proxy** that returns empty data:

1. src/api/routes/portfolios.js ⚠️ **CRITICAL - User seeing 401 errors**
2. src/api/routes/analytics.js
3. src/api/routes/investors.js
4. src/api/routes/notes.js
5. src/api/routes/rl.js
6. src/api/routes/attribution.js
7. src/api/routes/theses.js
8. src/api/routes/indices.js
9. src/api/routes/nlQuery.js
10. src/api/routes/tca.js
11. src/api/routes/subscription.js
12. src/api/routes/settings.js
13. src/api/routes/execution.js
14. src/api/routes/explainability.js

### Files Using `require('../../database').db` - BROKEN (2 files)

1. src/api/routes/factors.js ⚠️ **Known issue**
2. src/api/routes/factors.js.backup (ignore - backup file)

### Total Impact: **15 route files** affected by stub database

---

## Cleanup Strategy for Phase 0.2

### Option A: Remove Poison Immediately ✅ RECOMMENDED

**Action:** Delete `app.set('db', db.getDatabase())` from server.js

**Impact:**
- All 14 files using `req.app.get('db')` will get `undefined`
- Routes will crash immediately with clear error
- Better than silent stub failures

**Pros:**
- ✅ Forces routes to fail loudly
- ✅ Clear error messages
- ✅ Can't accidentally use stubs

**Cons:**
- ⚠️ Breaks 14 routes immediately
- Need to fix all before deploying

### Option B: Convert One by One

**Action:** Fix each route individually while keeping stub

**Impact:**
- Routes work incrementally
- Can deploy partial fixes

**Pros:**
- ✅ Gradual rollout
- ✅ Can test each fix

**Cons:**
- ⚠️ Stub still active - risk of silent failures
- ⚠️ Slower process
- ⚠️ No forcing function

---

## RECOMMENDATION: Option A (Remove Poison)

**Reasoning:**
1. Stub is causing **silent failures** in production
2. Better to have clear errors than wrong data
3. Forces us to fix routes properly
4. Prevents accidentally using stub in future

**Implementation:**
1. Remove `app.set('db', db.getDatabase())` from server.js
2. Fix infrastructure (middleware ordering, asyncHandler)
3. Fix routes one by one with proper async database access
4. Each route tested 100% before moving to next

