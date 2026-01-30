# Custom Factors in ML Ops - Complete Guide

## Overview

You can now use your custom factors from Quant Workbench as direct features in ML training. This allows you to combine research-tested factors with production ML models.

## Quick Start

```bash
# 1. Create and test a custom factor in Quant Workbench
POST /api/factors/create
{
  "name": "Quality Blend",
  "formula": "roe * 0.6 + roic * 0.4",
  "category": "quality"
}
# Returns: { factorId: 123 }

# 2. Backfill historical values for ML training
POST /api/factors/backfill
{
  "factorId": 123,
  "formula": "roe * 0.6 + roic * 0.4",
  "startDate": "2021-01-01",
  "endDate": "2024-12-31",
  "frequency": "monthly"
}

# 3. Train ML model with custom factor
POST /api/validation/ml/train
{
  "lookbackDays": 730,
  "customFactorIds": [123]
}

# 4. Check feature importance
GET /api/validation/ml/importance?horizon=21
```

## Detailed Workflow

### Step 1: Discover High-Performing Factors

Use Quant Workbench to research and validate factor performance:

```javascript
// In Quant Workbench:
// 1. Configure Tab → Create factor
// 2. Test Tab → Run IC Analysis, Walk-Forward, Backtest
// 3. Look for:
//    - IC > 0.05 (strong predictive power)
//    - WFE > 0.7 (works out-of-sample)
//    - Sharpe > 1.0 (good risk-adjusted returns)
```

### Step 2: Backfill Historical Data

Before using a factor in ML, you need historical values:

```bash
POST /api/factors/backfill
{
  "factorId": 123,
  "formula": "roe * 0.6 + roic * 0.4",
  "startDate": "2021-01-01",
  "endDate": "2024-12-31",
  "frequency": "monthly"  # Options: "daily", "weekly", "monthly", "quarterly"
}

# Response:
{
  "success": true,
  "data": {
    "totalDates": 48,
    "successCount": 47,
    "errorCount": 1
  }
}
```

**Frequency Guidelines:**
- `monthly`: 12 data points/year (recommended for factors)
- `weekly`: 52 data points/year (for technical factors)
- `quarterly`: 4 data points/year (for fundamental factors)
- `daily`: 252 data points/year (only for high-frequency factors)

### Step 3: Check Available Factors

See which custom factors have enough data for ML training:

```bash
GET /api/validation/ml/available-factors

# Response:
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "Quality Blend",
      "formula": "roe * 0.6 + roic * 0.4",
      "category": "quality",
      "ic_mean": 0.075,
      "wfe": 0.82,
      "coverage_companies": 487,
      "total_values": 23376,
      "min_date": "2021-01-31",
      "max_date": "2024-12-31"
    }
  ],
  "count": 1
}
```

### Step 4: Train ML Model with Custom Factors

```bash
POST /api/validation/ml/train
{
  "lookbackDays": 730,  # 2 years of training data
  "customFactorIds": [123, 456, 789]  # Include multiple custom factors
}

# Response:
{
  "success": true,
  "data": {
    "totalSamples": 8542,
    "uniqueCompanies": 487,
    "customFactors": [
      {
        "id": 123,
        "name": "Quality Blend",
        "featureIndex": 19  # Position in feature matrix
      }
    ],
    "results": {
      "21": {
        "trainingSamples": 6833,
        "validationSamples": 1709,
        "metrics": {
          "r2": 0.142,
          "informationCoefficient": 0.089,
          "directionAccuracy": 0.587
        }
      }
    }
  }
}
```

### Step 5: Analyze Feature Importance

See how important your custom factors are vs standard factors:

```bash
GET /api/validation/ml/importance?horizon=21

# Response:
{
  "success": true,
  "horizon": 21,
  "data": [
    {
      "feature": "momentum_score",
      "displayName": "momentum_score",
      "importance": 0.23,
      "percentContribution": "23.0%",
      "isCustomFactor": false
    },
    {
      "feature": "custom_factor_123",
      "displayName": "Quality Blend (Custom)",
      "importance": 0.18,
      "percentContribution": "18.0%",
      "isCustomFactor": true,
      "customFactorId": 123
    },
    ...
  ],
  "customFactorsUsed": [
    { "id": 123, "name": "Quality Blend", "featureIndex": 19 }
  ]
}
```

## Use Cases

### Use Case 1: Sector-Specific Factors

```javascript
// Create tech sector quality factor
{
  "name": "Tech Quality",
  "formula": "revenue_growth_yoy * 0.4 + gross_margin * 0.3 + roe * 0.3",
  "category": "sector_specific"
}

// Backfill → Train with sector filter → Deploy to tech-focused agent
```

### Use Case 2: Macro-Aware Factors

```javascript
// Create factor that performs well in different regimes
{
  "name": "Defensive Quality",
  "formula": "dividend_yield * 0.4 + debt_to_equity * -0.3 + roe * 0.3",
  "category": "defensive"
}

// Test in Walk-Forward → Backfill → Train → Use for market downturns
```

### Use Case 3: Multi-Factor Blends

```javascript
// Combine multiple tested factors
{
  "name": "VQM Blend",
  "formula": "(pe_ratio * -0.33) + (roe * 0.33) + (momentum_3m * 0.33)",
  "category": "combination"
}

// Research optimal weights in Quant Workbench
// → Backfill → Train as single feature
```

## Advanced: Batch Training Workflow

Train multiple model variations to find best configuration:

```bash
# Train baseline (no custom factors)
POST /api/validation/ml/train
{"lookbackDays": 730, "customFactorIds": []}

# Train with quality factors
POST /api/validation/ml/train
{"lookbackDays": 730, "customFactorIds": [123, 124]}

# Train with momentum factors
POST /api/validation/ml/train
{"lookbackDays": 730, "customFactorIds": [125, 126]}

# Train with all custom factors
POST /api/validation/ml/train
{"lookbackDays": 730, "customFactorIds": [123, 124, 125, 126]}

# Compare feature importance and validation metrics
GET /api/validation/ml/importance?horizon=21
```

## API Reference

### POST /api/factors/backfill

Calculate and store historical factor values.

**Request:**
```json
{
  "factorId": 123,
  "formula": "roe + roic / 2",
  "startDate": "2021-01-01",
  "endDate": "2024-12-31",
  "frequency": "monthly"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "factorId": 123,
    "totalDates": 48,
    "successCount": 47,
    "errorCount": 1,
    "errors": []
  }
}
```

### POST /api/validation/ml/train

Train ML model with optional custom factors.

**Request:**
```json
{
  "lookbackDays": 730,
  "customFactorIds": [123, 456]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSamples": 8542,
    "customFactors": [...],
    "results": { "21": {...}, "63": {...}, "126": {...} }
  }
}
```

### GET /api/validation/ml/importance

Get feature importance including custom factors.

**Query Params:**
- `horizon`: Target horizon in days (21, 63, or 126)

**Response:**
```json
{
  "success": true,
  "horizon": 21,
  "data": [
    {
      "feature": "custom_factor_123",
      "displayName": "Quality Blend (Custom)",
      "importance": 0.18,
      "percentContribution": "18.0%",
      "isCustomFactor": true,
      "customFactorId": 123
    }
  ],
  "customFactorsUsed": [...]
}
```

### GET /api/validation/ml/available-factors

List custom factors available for ML training.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "Quality Blend",
      "formula": "roe * 0.6 + roic * 0.4",
      "coverage_companies": 487,
      "total_values": 23376,
      "min_date": "2021-01-31",
      "max_date": "2024-12-31"
    }
  ],
  "count": 1
}
```

## Database Tables

### factor_values_cache

Stores calculated factor values for ML training.

```sql
CREATE TABLE factor_values_cache (
  id INTEGER PRIMARY KEY,
  factor_id INTEGER,  -- Links to user_factors
  company_id INTEGER,
  date TEXT,
  rawValue REAL,
  zscoreValue REAL,   -- Used as ML feature
  percentileRank REAL
);
```

### user_factors

Stores custom factor definitions.

```sql
CREATE TABLE user_factors (
  id INTEGER PRIMARY KEY,
  name TEXT,
  formula TEXT,
  category TEXT,
  ic_mean REAL,
  wfe REAL,
  created_at TIMESTAMP
);
```

## Performance Considerations

### Memory Usage

- **50,000 samples** × **25 features** = 1.25M data points (~10 MB)
- Each custom factor adds ~500KB to training data
- Recommended: ≤10 custom factors per training run

### Training Time

| Configuration | Training Time |
|---------------|---------------|
| Standard factors only (19 features) | ~5 seconds |
| + 3 custom factors (22 features) | ~6 seconds |
| + 10 custom factors (29 features) | ~8 seconds |

### Backfill Time

| Frequency | Date Range | Approx Time |
|-----------|------------|-------------|
| Monthly | 2 years | ~30 seconds |
| Weekly | 2 years | ~2 minutes |
| Daily | 2 years | ~10 minutes |

## Troubleshooting

### Issue: "Insufficient training data"

**Problem:** Custom factor has too few historical values.

**Solution:**
```bash
# Check factor coverage
GET /api/validation/ml/available-factors

# Look for:
# - total_values > 1000
# - date range covers at least 2 years
# - coverage_companies > 100

# If insufficient, run backfill with longer date range
```

### Issue: "Custom factor IDs not found"

**Problem:** Factor ID doesn't exist or has no calculated values.

**Solution:**
```bash
# 1. Verify factor exists
GET /api/factors/user

# 2. Run backfill to create values
POST /api/factors/backfill

# 3. Retry training
```

### Issue: Custom factor shows low importance

**Possible Reasons:**
1. **Redundant**: Factor is correlated with existing standard factors
2. **Noisy**: IC < 0.03 in Quant Workbench validation
3. **Overfitted**: High WFE decay (OOS IC << IS IC)

**Solution:**
- Check factor correlation with standard factors in Quant Workbench
- Use orthogonal factors (e.g., don't use both "roe" and "roe + roic")
- Validate out-of-sample performance before backfilling

## Best Practices

1. **Test First**: Always validate factor in Quant Workbench before ML training
2. **Check Coverage**: Ensure factor has values for >80% of companies in universe
3. **Start Small**: Begin with 1-3 custom factors, add more gradually
4. **Monitor Performance**: Compare validation metrics with/without custom factors
5. **Iterate**: Use feature importance to refine factor selection

## Next Steps

After integrating custom factors into ML:

1. **Deploy to Agents**: Use trained model in agent signal generation
2. **Monitor Drift**: Track custom factor IC over time
3. **Retrain Periodically**: Re-run training as new data arrives
4. **Refine Factors**: Update formulas based on feature importance

---

**Questions?** Check the [Quant Workbench Guide](./QUANT_WORKBENCH_GUIDE.md) or [ML Ops Documentation](./MLOPS_GUIDE.md).
