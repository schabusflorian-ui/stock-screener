# PostgreSQL Conversion Plan - Railway Migration

**Status**: PostgreSQL database migrated (303 tables, 17.5M rows) ✅
**Challenge**: 197 services still using SQLite-specific `.prepare()` calls ❌
**Goal**: Convert all services to async PostgreSQL for full Railway compatibility

---

## 📊 Current Status

### Migration Summary
- **Total Service Files**: 262
- **Services Using `.prepare()`**: 197 (75%)
- **Services Already Converted**: 10 (4%)
  - currencyService.js ✅
  - dividendService.js ✅
- **Services Remaining**: 187

### What's Working ✅
- Core company endpoints (companies.js)
- Classifications API
- Prices API
- Indices API
- Database: All 303 tables with 17.5M rows migrated

### What's Broken ❌
- Portfolio analytics (21 services)
- Backtesting engine (17 services)
- Trading agents (13 services)
- Alerts system (11 services)
- Factor analysis (10 services)
- And 125+ more services...

---

## 🎯 Conversion Strategy

### Phase 1: Critical Path (Week 1-2)
**Goal**: Get core user-facing features working

#### Priority 1A: Data Access Layer (2-3 days)
These services are dependencies for many features:

1. **screeningService.js** (HIGH IMPACT)
   - Used by: screening routes, portfolio analysis
   - Complexity: Medium (complex SQL with filters)
   - Estimated effort: 4-6 hours

2. **etfService.js**
   - Used by: ETF routes, portfolio comparison
   - Complexity: Low
   - Estimated effort: 2-3 hours

3. **sectorAnalysisService.js**
   - Used by: sector routes, market overview
   - Complexity: Medium
   - Estimated effort: 3-4 hours

4. **stockImporter.js**
   - Used by: data updates, admin functions
   - Complexity: Medium
   - Estimated effort: 3-4 hours

#### Priority 1B: Portfolio Core (3-4 days)
Portfolio features are the most complex with 21 interconnected services.

**Start with foundation:**
1. `portfolio/index.js` - Main portfolio service
2. `portfolio/holdingsEngine.js` - Position management
3. `portfolio/metricsEngine.js` - Performance calculations

**Then analytics:**
4. `portfolio/performanceAttribution.js` - Attribution analysis
5. `portfolio/correlationManager.js` - Correlation matrices
6. `portfolio/dividendProcessor.js` - Dividend tracking

**Advanced features:**
7. `portfolio/rebalanceCalculator.js` - Rebalancing logic
8. `portfolio/riskManagement.js` - Risk metrics
9. `portfolio/backtestEngine.js` - Historical simulation

#### Priority 1C: Market Data (2-3 days)
10. **earningsCalendar.js** - Earnings dates
11. **fiscalCalendar.js** - Fiscal periods
12. **insiderTracker.js** - Insider trading
13. **capitalAllocationTracker.js** - Capital allocation

### Phase 2: Analytics & Intelligence (Week 3)
**Goal**: Restore advanced analysis features

#### Factor Analysis (2-3 days)
14. `factors/index.js`
15. `factors/factorCalculator.js`
16. `factors/factorAnalyzer.js`
17. `factors/factorAttribution.js`
18. `factors/factorExposure.js`
19. `factors/factorSignalGenerator.js`

#### Historical Analysis (1-2 days)
20. `historical/index.js`
21. `historical/contextBuilder.js`
22. `historical/patternMatcher.js`
23. `historical/precedentFinder.js`

### Phase 3: Trading & Automation (Week 4)
**Goal**: Enable trading features

#### Agent System (3-4 days)
24. `agent/tradingAgent.js`
25. `agent/orchestrator.js`
26. `agent/opportunityScanner.js`
27. `agent/riskManager.js`
28. `agent/signalOptimizer.js`
29. `agent/recommendationTracker.js`
30. `agent/metaAllocator.js`

#### Backtesting (2-3 days)
31. `backtesting/unifiedBacktestEngine.js`
32. `backtesting/strategyBenchmark.js`
33. `backtesting/historicalDataProvider.js`
34. `backtesting/factorBacktestEngine.js`

### Phase 4: Alerts & Notifications (Week 5)
**Goal**: Restore monitoring features

35. `alerts/index.js`
36. `alerts/detectors/priceDetector.js`
37. `alerts/detectors/fundamentalDetector.js`
38. `alerts/detectors/valuationDetector.js`
39. `alerts/processors/clusterProcessor.js`
40. `alerts/digestManager.js`

### Phase 5: Remaining Services (Week 6-8)
**Goal**: Complete the migration

- ML services (5 files)
- MLOps (4 files)
- Alternative data (3 files)
- Strategy engines (3 files)
- Signal generators (3 files)
- Notes/theses (3 files)
- XBRL parsing (6 files)
- Macro indicators (2 files)
- Transcript analysis (2 files)
- ~100 remaining root-level services

---

## 🔧 Conversion Methodology

### Standard Conversion Pattern

**Before (SQLite):**
```javascript
class MyService {
  constructor() {
    this.db = getDatabase();
  }

  getData(id) {
    const sql = `SELECT * FROM table WHERE id = ?`;
    return this.db.prepare(sql).get(id);
  }

  getAll(limit) {
    const sql = `SELECT * FROM table LIMIT ?`;
    return this.db.prepare(sql).all(limit);
  }
}
```

**After (PostgreSQL):**
```javascript
const { getDatabaseAsync } = require('../database');

class MyService {
  async getData(id) {
    const database = await getDatabaseAsync();
    const sql = `SELECT * FROM table WHERE id = $1`;
    const result = await database.query(sql, [id]);
    return result.rows[0];
  }

  async getAll(limit) {
    const database = await getDatabaseAsync();
    const sql = `SELECT * FROM table LIMIT $1`;
    const result = await database.query(sql, [limit]);
    return result.rows;
  }
}
```

### Key Changes Checklist

- [ ] Remove constructor with `this.db = getDatabase()`
- [ ] Add `const { getDatabaseAsync } = require('../database')`
- [ ] Convert all methods to `async`
- [ ] Add `const database = await getDatabaseAsync()` at method start
- [ ] Convert `?` placeholders to `$1, $2, $3...`
- [ ] Track parameter numbers with `paramCounter` for dynamic queries
- [ ] Convert `.prepare(sql).get()` → `await database.query(sql).rows[0]`
- [ ] Convert `.prepare(sql).all()` → `await database.query(sql).rows`
- [ ] Convert `.prepare(sql).run()` → `await database.query(sql)`
- [ ] Handle `result.changes` → `result.rowCount`
- [ ] Handle `result.lastInsertRowid` → `result.rows[0].id` with `RETURNING id`
- [ ] Update route handlers to add `async` and `await` service calls

### PostgreSQL-Specific Conversions

**SQLite → PostgreSQL function mappings:**
```javascript
// Date functions
date('now') → CURRENT_DATE
datetime('now') → CURRENT_TIMESTAMP
date('now', '+X days') → CURRENT_DATE + INTERVAL 'X days'

// Error codes
SQLITE_CONSTRAINT_UNIQUE → error.code === '23505'

// Boolean values
WHERE active = 1 → WHERE active = true
```

---

## 📋 Execution Plan

### Week 1: Foundation
**Days 1-2**: Priority 1A (Data Access Layer)
- screeningService.js
- etfService.js
- sectorAnalysisService.js
- stockImporter.js

**Days 3-5**: Priority 1B Part 1 (Portfolio Foundation)
- portfolio/index.js
- portfolio/holdingsEngine.js
- portfolio/metricsEngine.js
- portfolio/performanceAttribution.js

**Test checkpoint**: Verify portfolios load and display metrics

### Week 2: Complete Critical Path
**Days 1-3**: Priority 1B Part 2 (Portfolio Analytics)
- portfolio/correlationManager.js
- portfolio/dividendProcessor.js
- portfolio/rebalanceCalculator.js
- portfolio/riskManagement.js

**Days 4-5**: Priority 1C (Market Data)
- earningsCalendar.js
- fiscalCalendar.js
- insiderTracker.js
- capitalAllocationTracker.js

**Test checkpoint**: Full portfolio analytics working

### Week 3: Analytics
**Days 1-3**: Factor Analysis (6 services)
**Days 4-5**: Historical Analysis (4 services)

**Test checkpoint**: Factor screening and historical context working

### Week 4: Trading
**Days 1-3**: Agent System (7 services)
**Days 4-5**: Backtesting (4 services)

**Test checkpoint**: Trading agents can generate signals and backtest

### Week 5: Monitoring
**Days 1-3**: Alerts System (6 services)
**Days 4-5**: Notifications (2 services)

**Test checkpoint**: Alerts trigger and notify correctly

### Week 6-8: Long Tail
- Convert remaining 100+ services
- Prioritize based on user needs
- Batch similar services together

---

## ✅ Testing Strategy

### Per-Service Testing
After each service conversion:
1. Run TypeScript/linting checks
2. Test all methods with sample data
3. Verify error handling works
4. Check performance (should be similar or better)

### Integration Testing
After each phase:
1. Test all routes using the converted services
2. Verify data correctness vs. SQLite baseline
3. Load test critical paths
4. Monitor Railway logs for errors

### Regression Testing
Weekly:
1. Run full API test suite
2. Test frontend against new backend
3. Compare results with SQLite version (if still available)

---

## 🚨 Risk Mitigation

### High-Risk Areas

**Portfolio Services** (21 files)
- **Risk**: Complex interdependencies, math-heavy calculations
- **Mitigation**:
  - Convert in dependency order (foundation → analytics → advanced)
  - Extensive testing with known portfolios
  - Keep SQLite version for comparison during transition

**Backtesting Engine** (17 files)
- **Risk**: Performance-critical, large dataset operations
- **Mitigation**:
  - Profile PostgreSQL queries
  - Add indexes if needed
  - Consider batching for large backtests

**Agent System** (13 files)
- **Risk**: Real-time decision making, state management
- **Mitigation**:
  - Test with paper trading first
  - Verify state persistence
  - Monitor for race conditions

### Fallback Strategy
- Keep git branches for each phase
- Ability to rollback individual services if critical issues found
- Monitor Railway metrics (CPU, memory, query performance)

---

## 📈 Progress Tracking

### Metrics to Track
- **Services converted**: X / 197
- **Routes working**: X / 80
- **Test coverage**: X%
- **Performance**: Query time comparisons
- **Errors**: Production error rate

### Weekly Milestones
- **Week 1**: 10 services, core portfolio working
- **Week 2**: 25 services, full portfolio analytics
- **Week 3**: 35 services, factor analysis working
- **Week 4**: 46 services, trading features enabled
- **Week 5**: 52 services, alerts active
- **Week 8**: 197 services, 100% complete

---

## 🎬 Getting Started

### Immediate Next Steps

1. **Start with screeningService.js** (4-6 hours)
   - Most-used service
   - Clear conversion path
   - High user impact

2. **Create conversion template** (1 hour)
   - Standardized pattern for team
   - Automated regex replacements where safe
   - Testing checklist

3. **Set up monitoring** (1 hour)
   - Railway metrics dashboard
   - Error tracking
   - Performance baselines

### Daily Workflow
1. Convert 2-3 services per day
2. Test each service thoroughly
3. Deploy to Railway staging
4. Monitor for 24 hours
5. Repeat

---

## 💡 Optimization Opportunities

While converting, consider:

1. **Add database indexes** for common queries
2. **Cache expensive calculations** (Redis on Railway)
3. **Batch database operations** where possible
4. **Use PostgreSQL-specific features**:
   - JSON/JSONB columns for flexible data
   - Array operations
   - Window functions
   - CTEs for complex queries
5. **Connection pooling** optimization

---

## 📝 Notes

- **Total Estimated Effort**: 6-8 weeks (1 developer full-time)
- **Faster if parallelized**: 3-4 weeks (2 developers)
- **Critical path**: Weeks 1-2 (most user-facing impact)
- **Can be done incrementally**: Deploy working services as they're completed

**This plan prioritizes user-facing features first, then gradually restores advanced capabilities.**
