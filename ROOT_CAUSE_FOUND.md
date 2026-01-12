# ROOT CAUSE FOUND: Invalid Benchmark Data

**Date:** 2026-01-12

---

## The Mystery: 0% Win Rate

All 6 strategies showed:
- 0% win rate
- -87% average alpha
- Every trade was a loss

---

## Investigation Path

1. Checked if data quality issue (it was)
2. Found all stocks sold at -16% to -55% losses after 7 days
3. Discovered buy prices were **1.9x actual market prices**

### Evidence

| Stock | Benchmark Buy | Database Price | Ratio |
|-------|--------------|---------------|-------|
| JPM   | $327.43      | $172.08       | 1.90x |
| WFC   | $94.39       | $47.40        | 1.99x |
| XOM   | $119.36      | $99.95        | 1.19x |
| RTX   | $190.58      | $86.33        | 2.21x |

---

## Root Cause

The file **`data/strategy-benchmark-results.json`** contains **INVALID DATA**.

### Test Confirmed

Created `test-price-bug.js` to verify:
- ✅ ConfigurableStrategyAgent returns **CORRECT** price ($172.08)
- ✅ Database has **CORRECT** historical prices
- ❌ Benchmark results file has **WRONG** prices ($327.43)

###Conclusion

The `strategy-benchmark-results.json` file was generated with:
1. **Either**: Before we fixed the lookahead bias (using wrong data source)
2. **Or**: With a different price calculation bug that has since been fixed

---

## Impact on Previous Analysis

### ALL PRIOR CONCLUSIONS ARE INVALID

1. ❌ **SME Panel Recommendations**: Based on invalid data
2. ❌ **Validation Analysis**: Analyzed wrong results  
3. ❌ **Optimization Reverts**: Done for wrong reasons
4. ❌ **Win Rate Analysis**: 0% was due to bad data, not bad strategy

### What We Thought vs Reality

| Metric | Invalid Data Said | Likely Reality |
|--------|-------------------|----------------|
| Win Rate | 0% | Unknown (need rerun) |
| Alpha | -87% | Unknown |
| Sharpe | -1.31 | Unknown |
| Problem | Strategy broken | **Data was broken** |

---

## Next Steps

### IMMEDIATE: Re-run Benchmark with Clean Data

```bash
# This will use the CORRECTED lookahead-bias-fixed agent
node src/services/backtesting/strategyBenchmark.js
```

**Expected:**
- Prices will match database
- Win rate will be > 0%
- We'll see TRUE baseline performance

### Then: Re-evaluate Optimizations

Once we have valid baseline:
1. Compare to the optimized parameters (if we hadn't reverted)
2. Test monthly rebalancing (the safe optimization)
3. Re-run SME panel on VALID data

---

## Lessons Learned

1. **Always validate input data** before analyzing results
2. **Test end-to-end** with simple cases first
3. **Price sanity checks** should be built into backtesting
4. Invalid data led to hours of analysis on phantom problems

---

## Files to Check

- ✅ [src/services/agent/configurableStrategyAgent.js](src/services/agent/configurableStrategyAgent.js) - Agent returns correct prices
- ✅ [src/services/backtesting/historicalDataProvider.js](src/services/backtesting/historicalDataProvider.js) - Data provider correct
- ⚠️  [data/strategy-benchmark-results.json](data/strategy-benchmark-results.json) - **INVALID - DELETE AND REGENERATE**
- ⚠️  [src/services/backtesting/strategyBenchmark.js](src/services/backtesting/strategyBenchmark.js) - May have had bug (now fixed?)

---

**Status:** Ready to re-run benchmark with corrected code
**Priority:** HIGH - All analysis depends on valid baseline data
