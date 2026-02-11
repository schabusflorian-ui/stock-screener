# Database Async Migration – Root Cause Fix Plan

## Objective

Eliminate sync SQLite usage and standardize on `getDatabaseAsync()` + `database.query()` so the codebase works with both SQLite (dev) and PostgreSQL (production) without file-by-file band-aids.

---

## Phase 1: Migration Checklist (Complete the Remaining Files)

### API Routes
| File | Status | Notes |
|------|--------|-------|
| orchestrator.js | ✅ Done | |
| agent.js | ✅ Done | |
| macro.js | ✅ Done | /refresh-current-quarter |
| updates.js | ⏸️ Deferred | 503 for Postgres; depends on QuarterlyUpdater |
| Other routes | 🔍 Audit | Grep for prepare/get/all/getDatabaseSync |

### Services
| File | Status | Notes |
|------|--------|-------|
| TradingOrchestrator | ✅ Done | |
| CorrelationEngine | ✅ Done | |
| SentimentAggregator | ✅ Done | |
| xbrlProvider | ✅ Done | |
| inputValidator | ✅ Done | |
| featureStore.js | ⏳ Pending | ~33 prepare calls; heavy refactor |
| moatScoring.js | ✅ Done | |
| signalCombiner.js | ✅ Done | |
| strategyManager.js | ✅ Done | |
| paperTrading.js | ⏳ Pending | ~33 calls |
| trainingDataAssembler.js | ⏳ Pending | ~11 calls |
| outcomeCalculator.js | ⏳ Pending | ~34 calls |
| unifiedStrategyEngine.js | ⏳ Pending | ~18 calls |
| nl/tools/executors.js | ⏳ Pending | ~112 calls (large) |
| schemaManager.js | ⏸️ Special | Uses PRAGMA; needs dialect branching |
| *Other services* | 🔍 Audit | Run grep to discover |

### Jobs
| File | Status |
|------|--------|
| masterScheduler.js | ⏳ Pending |
| historicalInvestorBackfill.js | ⏳ Pending |
| backfillGermanFinancials.js | ⏳ Pending |

---

## Phase 2: Deprecate Sync DB Surface

### 2.1 database.js (src/database.js)

- [ ] Add deprecation warning when `getDatabaseSync()` is called (even in SQLite mode)
- [ ] In Postgres mode: `getDatabaseSync()` already throws – keep that
- [ ] Document that new code must use `getDatabaseAsync()` only

### 2.2 lib/db.js

- [ ] Ensure `getDatabaseAsync` is the primary export
- [ ] Consider exporting `getDatabase` as alias for `getDatabaseAsync` (avoid "Sync" in name)
- [ ] No changes to `.query()` – it remains the single DB API

---

## Phase 3: ESLint Rules (Prevent Regressions)

### 3.1 Create custom rule or use no-restricted-syntax

Add to `.eslintrc.js`:

```javascript
rules: {
  // Prevent sync SQLite usage - enforce async DB pattern
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.property.name='prepare']",
      message: 'Use database.query() instead of prepare(). Migrate to async DB pattern.'
    },
    {
      selector: "CallExpression[callee.property.name='get'] MemberExpression[object.name=/stmt|prepared/]",
      message: 'Use database.query() and result.rows[0] instead of stmt.get().'
    },
    {
      selector: "CallExpression[callee.property.name='all'] MemberExpression[object.name=/stmt|prepared/]",
      message: 'Use database.query() and result.rows instead of stmt.all().'
    }
  ],
  // Restrict getDatabaseSync usage
  'no-restricted-imports': ['error', {
    patterns: [{
      group: ['**/database', '**/db'],
      importNames: ['getDatabaseSync'],
      message: 'Use getDatabaseAsync() instead of getDatabaseSync().'
    }]
  }]
}
```

**Note:** The above may need tuning – `no-restricted-syntax` selectors can be tricky. Alternative: use `eslint-plugin-no-restricted-syntax` or a custom rule.

### 3.2 Simpler approach: grep in CI

Add a script `scripts/check-sync-db-usage.sh`:

```bash
#!/bin/bash
# Fail if sync DB patterns found (excluding allowed files)
PATTERNS="\.prepare\(|\.get\(.*\)|\.all\(.*\)|getDatabaseSync"
EXCLUDE="schemaManager|database\.js|lib/db\.js|test"
if grep -r -E "$PATTERNS" src/ --include="*.js" | grep -v -E "$EXCLUDE"; then
  echo "ERROR: Sync DB usage detected. Use getDatabaseAsync() and database.query()."
  exit 1
fi
exit 0
```

Run in CI before tests. Script: `scripts/check-sync-db-usage.sh`

Add to package.json:
```json
"scripts": {
  "check:sync-db": "bash scripts/check-sync-db-usage.sh"
}
```

---

## Phase 4: Standardize Service Wiring

### 4.1 Convention

- **All services** that need DB access receive the result of `await getDatabaseAsync()` (the lib/db wrapper).
- **Never** pass `db.raw` or raw better-sqlite3.
- **Never** pass the `database` module’s sync `db` proxy.

### 4.2 Document in AGENTS.md

Add a section:

```markdown
### Database Access (MANDATORY)

- Use `const { getDatabaseAsync } = require('../lib/db')` (or appropriate path)
- Get DB: `const database = await getDatabaseAsync()`
- Query: `const result = await database.query(sql, params)` with `$1`, `$2` placeholders
- Results: `result.rows` (array) or `result.rows[0]` (single row)
- Do NOT use: `prepare()`, `.get()`, `.all()`, `.run()`, `getDatabaseSync()`
```

---

## Phase 5: schemaManager.js (Special Case)

`schemaManager` uses `PRAGMA table_info()` which is SQLite-only. Options:

1. **Keep SQLite-only** – Use only when `!isUsingPostgres()`, skip in Postgres.
2. **Add dialect support** – Use `information_schema.columns` for Postgres (lib/db has `dialect.columnInfoQuery()`).
3. **Replace with migration-based schema** – Manage schema via migrations only; avoid runtime introspection.

Recommendation: Option 2 – add `isUsingPostgres()` branches and use `dialect.columnInfoQuery()` for the appropriate DB.

---

## Phase 6: Execution Order

1. **Phase 3** – Add ESLint / grep check (can be lenient at first – warn only).
2. **Phase 1** – Continue migrating remaining files in order of priority (small → large).
3. **Phase 4** – Update AGENTS.md with DB conventions.
4. **Phase 2** – Add deprecation warning to `getDatabaseSync()`.
5. **Phase 3** – Tighten to error once migration is complete.
6. **Phase 5** – Handle schemaManager when needed.

---

## Quick Reference: Migration Pattern

**Before:**
```javascript
const db = getDatabaseSync();
const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
const rows = db.prepare('SELECT * FROM companies').all();
```

**After:**
```javascript
const { getDatabaseAsync } = require('../lib/db');
const database = await getDatabaseAsync();
const result = await database.query('SELECT * FROM companies WHERE id = $1', [id]);
const row = result.rows[0];
const result2 = await database.query('SELECT * FROM companies');
const rows = result2.rows;
```

**Date intervals (dialect-aware):**
```javascript
const { isUsingPostgres } = require('../lib/db');
const condition = isUsingPostgres()
  ? "date >= CURRENT_DATE - INTERVAL '30 days'"
  : "date >= date('now', '-30 days')";
```
