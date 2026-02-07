# PostgreSQL Conversion Bug Tracker

This document tracks all bugs found during PostgreSQL conversion testing.

## Bug Status Legend
- 🔴 **Critical** - Service completely broken
- 🟡 **Major** - Service partially working
- 🟢 **Minor** - Small issue, workaround available
- ✅ **Fixed** - Bug resolved

---

## 🔴 BUG #1: ScreeningService Parameter Mismatch

**Status:** 🔴 Critical
**Found:** 2026-02-07
**Service:** `src/services/screeningService.js`
**Method:** `screen()` → `buffettQuality()`
**Line:** 618

### Error Message
```
RangeError: Too many parameter values were provided
    at Object.query (/Users/florianschabus/Investment Project/src/lib/db.js:43:29)
    at ScreeningService.screen (/Users/florianschabus/Investment Project/src/services/screeningService.js:618:41)
```

### Root Cause
SQL parameter binding mismatch. The dynamic query builder adds `$N` placeholders, but the parameter count tracking is incorrect. Likely issues:
1. `paramCounter` variable increments don't match actual params added
2. Subqueries with their own parameters interfere with main query counting
3. Conditional logic adds parameters in some paths but not others

### Impact
- All screening operations fail
- Any screen (Buffett Quality, Deep Value, Magic Formula, etc.) cannot run
- Core functionality broken

### Example Problem Code
```javascript
// Line 259-266: Subquery uses multiple parameters
where.push(`m.fiscal_period = (
  SELECT MAX(m2.fiscal_period)
  FROM calculated_metrics m2
  WHERE m2.company_id = m.company_id
    AND m2.fiscal_period <= $${paramCounter++}  // Param added
    AND m2.period_type = $${paramCounter++}     // Param added
)`);
params.push(asOfDate, periodType);  // 2 params pushed, but paramCounter might not match
```

### Solution
Need to carefully audit the entire `screen()` method to ensure:
1. Every `$${paramCounter++}` has exactly one matching `params.push(value)`
2. Subqueries correctly track parameters
3. Conditional branches maintain parameter count consistency

### Test Case
```javascript
const ScreeningService = require('./src/services/screeningService');
const service = new ScreeningService();
const results = await service.buffettQuality({ limit: 5 });
// Should return results, not throw RangeError
```

---

## Summary Statistics

**Total Bugs Found:** 1
**Critical:** 1 🔴
**Major:** 0 🟡
**Minor:** 0 🟢
**Fixed:** 0 ✅

**Services with Known Issues:**
1. ScreeningService (🔴 Critical)

**Services Verified Working:**
1. CurrencyService (✅ Pass)

---

## Testing Progress

| Service Category | Tested | Pass | Fail | Not Tested |
|-----------------|--------|------|------|------------|
| Core Services | 2 | 1 | 1 | 7 |
| Portfolio (21) | 0 | 0 | 0 | 21 |
| Agent (13) | 0 | 0 | 0 | 13 |
| Backtesting (20) | 0 | 0 | 0 | 20 |
| Alerts (11) | 0 | 0 | 0 | 11 |
| XBRL (6) | 0 | 0 | 0 | 6 |
| Updates (11) | 0 | 0 | 0 | 11 |
| **TOTAL (103)** | **2** | **1** | **1** | **101** |

---

## Next Steps

1. ✅ Document Bug #1 (ScreeningService)
2. ⏳ Create comprehensive test suite
3. ⏳ Fix Bug #1
4. ⏳ Test remaining 101 services systematically
5. ⏳ Document and fix all issues found

---

## Notes

### Common Patterns to Watch For

Based on Bug #1, watch for these patterns in other services:

1. **Dynamic Query Building with Parameter Counters**
   ```javascript
   let paramCounter = 1;
   // Must carefully track increments
   ```

2. **Subqueries with Parameters**
   ```javascript
   // Subqueries can mess up parameter counting
   WHERE id = (SELECT... WHERE col = $${paramCounter++})
   ```

3. **Conditional Parameter Addition**
   ```javascript
   if (condition) {
     params.push(value);  // Must match $N placeholder
   }
   ```

4. **Loop-based Query Construction**
   ```javascript
   for (const item of items) {
     // Parameters in loops are particularly tricky
   }
   ```

### Testing Strategy

For each service:
1. **Smoke test** - Can it instantiate and run basic operations?
2. **SQL test** - Run a representative query with parameters
3. **Edge cases** - Test with null/undefined/empty values
4. **Integration** - Test with dependent services
