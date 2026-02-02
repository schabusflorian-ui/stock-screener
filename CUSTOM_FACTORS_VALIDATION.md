# Custom Factors ML Integration - Validation & Testing Guide

## ✅ Implementation Checklist

### Backend Components
- [x] **TrainingDataAssembler.js** - Added custom factor support
  - `getAvailableCustomFactors()` - Query factors with backfill data
  - `getCustomFactorMetadata()` - Get factor details
  - Updated `assembleTrainingData()` with `customFactorIds` parameter
  - Dynamic SQL joins for custom factors
- [x] **SignalCombiner.js** - Updated ML trainer
  - Accepts `customFactorIds` in `train()` method
  - Validates factor IDs exist before training
- [x] **validation.js API** - Enhanced ML endpoints
  - `/ml/train` accepts `customFactorIds` array
  - `/ml/importance` shows custom factor names with "(Custom)" badge
  - NEW: `/ml/available-factors` endpoint
- [x] **factors.js API** - Backfill endpoints
  - NEW: `POST /api/factors/backfill` - Calculate historical values
  - NEW: `GET /api/factors/:id/backfill-status` - Check existing data
  - Includes `generateDateList()` helper for date generation

### Frontend Components
- [x] **api.js** - API client updates
  - `factorsAPI.backfill()` - Call backfill endpoint
  - `mlCombinerAPI.getAvailableFactors()` - Fetch factors with data
  - Updated `mlCombinerAPI.train()` to accept `customFactorIds`
- [x] **BackfillPanel.js** - NEW component
  - Status display (existing backfill coverage)
  - Configuration form (date range + frequency)
  - Progress tracking and result display
  - Error handling
- [x] **MLCombinerPanel.js** - Enhanced training UI
  - Custom factor multi-select checkboxes
  - Factor metadata display (IC, formula, coverage)
  - Enhanced feature importance with custom factor badges
- [x] **QuantWorkbench/index.js** - Deploy tab integration
  - Integrated BackfillPanel into Deploy tab
  - Replaced simple ML card with full backfill UI
- [x] **CSS Styling**
  - Complete BackfillPanel styles
  - Custom factor selection styles
  - Feature importance custom factor styling

### Documentation
- [x] **CUSTOM_FACTORS_ML_INTEGRATION.md** - Complete user guide
- [x] **This validation guide**

---

## 🧪 Testing Plan

### Test 1: Create Custom Factor
**Location:** Quant Workbench → Configure tab

1. Enter factor formula: `roe + roic`
2. Name: "Quality Score"
3. Category: "quality"
4. Click "Create Factor"
5. **Expected:** Factor saved with ID (e.g., 123)

### Test 2: Backfill Historical Data
**Location:** Quant Workbench → Deploy tab → BackfillPanel

1. Select the "Quality Score" factor
2. Configure backfill:
   - Start Date: `2022-01-01`
   - End Date: `2024-12-31`
   - Frequency: `monthly`
3. Click "Start Backfill"
4. **Expected:**
   - Progress indicator shows
   - After completion: ~36 dates processed (3 years × 12 months)
   - Success count should be high (35-36 successful)
   - Status card shows date range and coverage
5. **Verify in database:**
   ```sql
   SELECT COUNT(*), MIN(date), MAX(date)
   FROM factor_values_cache
   WHERE factor_id = 123;
   ```

### Test 3: Check Available Factors in ML
**Location:** Agents → Deploy → ML Combiner Panel → Train Model tab

1. Navigate to training form
2. Look for "Custom Factors (Optional)" section
3. **Expected:**
   - "Quality Score" appears in the list
   - Shows formula: "roe + roic"
   - Shows IC score (if available)
   - Shows coverage: "487 companies, 23,376 values" (approximate)

### Test 4: Train ML Model with Custom Factor
**Location:** ML Combiner Panel → Train Model tab

1. Select "Quality Score" checkbox
2. Choose lookback: "2 Years (730 days)"
3. Click "Train ML Model"
4. **Expected:**
   - Training starts (may take 1-2 minutes)
   - Console logs show: "Including 1 custom factors: 123"
   - Training completes successfully
   - Result shows training/validation samples

### Test 5: Verify Feature Importance
**Location:** ML Combiner Panel → Feature Importance tab

1. Click "Feature Importance" tab
2. **Expected:**
   - "Quality Score (Custom)" appears in the list
   - Has purple "CUSTOM" badge
   - Left border is violet (3px solid)
   - Shows importance percentage
   - Can compare to standard factors

---

## 🔍 Manual Code Review

### Critical Code Sections

#### 1. SQL Join Pattern (trainingDataAssembler.js:119-127)
```javascript
const customFactorJoins = customFactorIds.map((factorId, idx) => `
  LEFT JOIN factor_values_cache cf${idx} ON cf${idx}.company_id = f.company_id
    AND cf${idx}.factor_id = ${factorId}
    AND cf${idx}.date = f.score_date
`).join(' ');
```
**Validation:**
- ✓ Uses LEFT JOIN (won't exclude rows if custom factor missing)
- ✓ Matches on company_id, factor_id, and date
- ✓ Dynamic alias (cf0, cf1, cf2, ...) prevents conflicts

#### 2. Feature Extraction (trainingDataAssembler.js:196-209)
```javascript
const features = data.map(row => {
  const factorFeatures = this.factorColumns.map(col => row[col] || 0);
  const percentileFeatures = this.percentileColumns.map(col => row[col] || 50);
  const customFeatures = customFactorMetadata.map(cf => row[cf.columnKey] || 0);

  return [
    ...factorFeatures,
    ...percentileFeatures,
    ...customFeatures,
    this._inferRegime(row),
    this._encodeSector(row.sector),
    this._encodeMarketCap(row.market_cap)
  ];
});
```
**Validation:**
- ✓ Handles missing values (|| 0 for factors, || 50 for percentiles)
- ✓ Custom features default to 0 if NULL
- ✓ Order matches featureNames array

#### 3. Backfill Date Generation (factors.js:2317-2342)
```javascript
function generateDateList(startDate, endDate, frequency) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);

    if (frequency === 'monthly') {
      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
      current.setDate(current.getDate() - 1); // Last day of month
    }
    // ... other frequencies
  }
  return dates;
}
```
**Validation:**
- ✓ Handles month-end dates correctly
- ✓ Generates YYYY-MM-DD format
- ⚠️ Note: "Last day of month" is approximate for monthly frequency

---

## 🐛 Known Issues & Limitations

### 1. Database Dependency
**Issue:** BackfillPanel tries to fetch status on component mount, but endpoint may not exist yet.
**Mitigation:** Wrapped in try-catch, falls back to "no data" state
**Status:** ✅ Handled

### 2. Date Alignment
**Issue:** Monthly frequency uses "last day of month" which may not align with trading days.
**Impact:** Minor - factor values calculated for closest available date
**Status:** ⚠️ Acceptable limitation

### 3. Z-Score Storage
**Issue:** Custom factors stored as z-scores in `factor_values_cache`, but backfill calculates across all stocks at each date.
**Impact:** Z-scores may differ slightly between backfill and real-time calculation
**Status:** ✅ Consistent within training period

### 4. Large Backfills
**Issue:** Daily frequency over 3+ years = 750+ dates = slow operation
**Mitigation:** Frontend warns "may take a few minutes", uses long timeout API client
**Status:** ✅ User informed

---

## 📊 Database Validation Queries

### Check Custom Factor Data
```sql
-- See all custom factors with backfill coverage
SELECT
  uf.id,
  uf.name,
  uf.formula,
  COUNT(DISTINCT fvc.company_id) as companies,
  COUNT(*) as total_values,
  MIN(fvc.date) as min_date,
  MAX(fvc.date) as max_date
FROM user_factors uf
LEFT JOIN factor_values_cache fvc ON fvc.factor_id = uf.id
GROUP BY uf.id
ORDER BY uf.created_at DESC;
```

### Verify Z-Score Distribution
```sql
-- Check if z-scores are properly normalized (mean ~0, std ~1)
SELECT
  factor_id,
  COUNT(*) as samples,
  AVG(zscoreValue) as mean_zscore,
  -- SQLite doesn't have STDDEV, but mean should be ~0
  MIN(zscoreValue) as min_zscore,
  MAX(zscoreValue) as max_zscore
FROM factor_values_cache
WHERE factor_id = 123
  AND date = '2024-12-31';
```

### Check Training Data Availability
```sql
-- Verify we can join custom factors with standard factors
SELECT COUNT(*) as joinable_records
FROM stock_factor_scores f
LEFT JOIN factor_values_cache cf ON cf.company_id = f.company_id
  AND cf.factor_id = 123
  AND cf.date = f.score_date
WHERE f.score_date >= '2022-01-01'
  AND f.score_date <= '2024-12-31'
  AND cf.zscoreValue IS NOT NULL;
```

---

## ✅ Final Validation Checklist

### Backend
- [ ] Server starts without errors
- [ ] `GET /api/validation/ml/available-factors` returns custom factors
- [ ] `POST /api/factors/backfill` completes successfully
- [ ] `GET /api/factors/:id/backfill-status` returns coverage data
- [ ] `POST /api/validation/ml/train` accepts customFactorIds
- [ ] Feature importance includes custom factors with correct names

### Frontend
- [ ] Quant Workbench loads without errors
- [ ] BackfillPanel renders in Deploy tab
- [ ] Backfill configuration form submits successfully
- [ ] ML Combiner Panel shows custom factors list
- [ ] Custom factor checkboxes work correctly
- [ ] Training with custom factors completes
- [ ] Feature importance shows custom badge and styling

### End-to-End
- [ ] Create factor → Backfill → Train → Check importance workflow completes
- [ ] Custom factor appears in feature importance ranked by actual contribution
- [ ] Multiple custom factors can be selected and trained together
- [ ] Error states handled gracefully (no backfill data, invalid formula, etc.)

---

## 🚀 Performance Expectations

| Operation | Expected Duration |
|-----------|------------------|
| Backfill (monthly, 3 years) | 30-60 seconds |
| Backfill (daily, 1 year) | 2-5 minutes |
| ML Training (no custom factors) | 5-10 seconds |
| ML Training (+ 3 custom factors) | 6-12 seconds |
| Feature importance fetch | < 1 second |

---

## 📝 Notes for Production

1. **Backfill should be run once** - Store results, don't recalculate unless formula changes
2. **Monitor memory usage** - 10+ custom factors may increase training memory by ~5-10 MB
3. **IC updates** - Consider periodic re-backfill if factor formula is modified
4. **Cache invalidation** - Clear ML cache after retraining with new factors

---

**Last Updated:** 2026-01-30
**Implementation Status:** ✅ Complete - Ready for Testing
