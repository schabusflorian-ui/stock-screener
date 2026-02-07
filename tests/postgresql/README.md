# PostgreSQL Conversion Test Suite

This directory contains tests specifically designed to validate the SQLite → PostgreSQL async conversion.

## Purpose

Validate that all 103 converted services work correctly with:
- PostgreSQL async patterns
- SQL parameter binding ($1, $2 vs ?)
- Date/time functions (CURRENT_TIMESTAMP vs datetime('now'))
- Boolean handling (true/false vs 1/0)
- Result object access (.rows vs direct)
- INSERT/UPDATE conflict handling

## Test Structure

```
tests/postgresql/
├── README.md                          # This file
├── testRunner.js                      # Main test orchestrator
├── testUtils.js                       # Shared test utilities
├── bugTracker.md                      # Known issues log
│
├── services/
│   ├── test-currency.js               # CurrencyService tests ✅
│   ├── test-screening.js              # ScreeningService tests ❌ (bug found)
│   ├── test-etf.js                    # ETFService tests
│   ├── test-portfolio.js              # Portfolio services tests
│   ├── test-agent.js                  # Agent services tests
│   ├── test-backtesting.js            # Backtesting services tests
│   ├── test-alerts.js                 # Alert services tests
│   ├── test-xbrl.js                   # XBRL services tests
│   └── test-updates.js                # Update services tests
│
└── integration/
    ├── test-end-to-end.js             # Full workflow tests
    └── test-api-endpoints.js          # API endpoint tests
```

## Running Tests

### Run all tests
```bash
npm run test:postgresql
```

### Run specific service tests
```bash
node tests/postgresql/services/test-screening.js
```

### Run with verbose output
```bash
DEBUG=true npm run test:postgresql
```

## Test Status

**Last Run:** 2026-02-07
**Services Tested:** 2 / 103
**Pass Rate:** 50% (1 pass, 1 fail)

### Known Issues
See [bugTracker.md](./bugTracker.md) for detailed bug reports.

## Test Categories

### 1. Smoke Tests (Quick validation)
- Can the service instantiate?
- Do basic methods run without crashing?
- Can it connect to the database?

### 2. SQL Tests (Parameter binding)
- Are $N placeholders correctly mapped?
- Do queries return expected structure?
- Are result objects accessed correctly?

### 3. Data Tests (Type conversions)
- Booleans: true/false vs 1/0
- Dates: ISO strings vs SQLite date functions
- Numbers: proper parsing from PostgreSQL

### 4. Integration Tests (Cross-service)
- Services that depend on each other
- End-to-end workflows
- API endpoint validation

## Adding New Tests

1. Create test file in `services/`
2. Follow the template pattern (see test-currency.js)
3. Add to testRunner.js
4. Run and document results

## Debug Mode

Set `DEBUG=true` to see detailed SQL queries and parameter bindings:

```bash
DEBUG=true node tests/postgresql/services/test-screening.js
```
