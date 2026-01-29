# Deep Learning Architecture for Return Prediction

## Executive Summary

This document defines the architecture for adding institutional-grade deep learning models to the investment platform. The system will predict forward returns using Temporal Fusion Transformer (TFT) and LSTM models, combined through an uncertainty-aware ensemble.

---

## 1. Design Principles

### 1.1 Financial ML Considerations

Unlike image or NLP tasks, financial ML has unique challenges:

1. **Low Signal-to-Noise Ratio**: Markets are noisy; signals are weak
2. **Non-Stationarity**: Data distributions shift over time (regimes)
3. **Lookahead Bias**: Must use only data available at prediction time
4. **Multiple Testing**: Many strategies are tested; alpha decays
5. **Autocorrelation**: Returns exhibit temporal dependencies
6. **Fat Tails**: Extreme events occur more than normal distributions suggest

### 1.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Language** | Python for models, Node.js bridge | TensorFlow/PyTorch ecosystems are mature |
| **Prediction Target** | Forward 21-day returns (excess vs SPY) | Aligns with existing backtest horizons |
| **Model Architecture** | Transformer + LSTM ensemble | Captures both long-range and local patterns |
| **Uncertainty** | Quantile regression + ensemble disagreement | Critical for position sizing |
| **Training** | Expanding window with purge gap | Prevents lookahead, allows adaptation |

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEEP LEARNING PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     │
│  │  Historical Data │     │  Feature Engine  │     │  Model Ensemble  │     │
│  │     Provider     │────▶│    (Python)      │────▶│    (Python)      │     │
│  │    (Node.js)     │     │                  │     │                  │     │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘     │
│           │                        │                        │                │
│           │                        ▼                        ▼                │
│           │               ┌──────────────────┐     ┌──────────────────┐     │
│           │               │  Temporal Fusion │     │  Deep Ensemble   │     │
│           │               │   Transformer    │     │    Combiner      │     │
│           │               │   (Multi-head)   │────▶│  (Uncertainty)   │     │
│           │               └──────────────────┘     └──────────────────┘     │
│           │                        │                        │                │
│           │               ┌──────────────────┐              │                │
│           │               │      LSTM        │              │                │
│           │               │  (Bidirectional) │──────────────┘                │
│           │               └──────────────────┘                               │
│           │                                                                  │
│           ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        Node.js Bridge                                 │   │
│  │  - Subprocess management                                              │   │
│  │  - JSON serialization                                                 │   │
│  │  - Caching & batching                                                 │   │
│  │  - Fallback to gradient boosting                                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│                                    ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │              UnifiedStrategyEngine (16th Signal)                      │   │
│  │  signal_weights.mlPrediction = 0.05  (start conservative)            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature Engineering

### 3.1 Feature Categories

```python
FEATURE_GROUPS = {
    # Time-series features (sequential, need LSTM/Transformer)
    'price_sequence': [
        'close_returns_1d', 'close_returns_5d', 'close_returns_21d',
        'volume_ratio_20d', 'high_low_range', 'open_close_range'
    ],

    # Technical indicators (computed at each timestep)
    'technical': [
        'rsi_14', 'macd_signal', 'macd_histogram',
        'sma_20_ratio', 'sma_50_ratio', 'sma_200_ratio',
        'bb_position', 'atr_14_pct', 'adx_14'
    ],

    # Fundamental features (updated quarterly, slow-changing)
    'fundamental': [
        'pe_ratio_zscore', 'pb_ratio_zscore', 'roe', 'roa',
        'debt_to_equity', 'current_ratio', 'gross_margin',
        'revenue_growth_yoy', 'earnings_growth_yoy'
    ],

    # Alternative data (updated more frequently)
    'alternative': [
        'news_sentiment_7d', 'social_sentiment_7d',
        'insider_net_shares_90d', 'short_interest_ratio',
        'congressional_net_90d', '13f_institutional_delta'
    ],

    # Factor scores (existing quantitative factors)
    'factors': [
        'value_score', 'momentum_score', 'quality_score',
        'size_score', 'volatility_score', 'growth_score'
    ],

    # Market context (shared across all stocks)
    'market': [
        'vix_level', 'vix_change_5d', 'spy_return_21d',
        'market_regime', 'sector_relative_strength'
    ]
}
```

### 3.2 Sequence Construction

For transformer/LSTM models, we construct sequences:

```
Sequence Length: 60 trading days (3 months)
Prediction Horizon: 21 trading days forward

Feature Tensor Shape: (batch_size, 60, num_features)
Target: excess_return_21d (continuous) or quintile (classification)

Timeline:
  t-60 ──────── t-30 ──────── t ──────── t+21
   │            │             │           │
   └────────────┴─────────────┘           │
         Input sequence                   │
                                          │
                              Prediction target
```

### 3.3 Feature Preprocessing

```python
class FeaturePreprocessor:
    def __init__(self):
        self.scalers = {}
        self.feature_stats = {}

    def fit_transform(self, df, fit=True):
        """
        1. Handle missing values (forward fill, then median)
        2. Winsorize outliers (1st/99th percentile)
        3. Z-score normalization (expanding window to avoid lookahead)
        4. Add temporal encodings (day of week, month, quarter end)
        """
        pass
```

---

## 4. Model Architectures

### 4.1 Temporal Fusion Transformer (TFT)

The TFT is state-of-the-art for time series forecasting with mixed inputs.

```python
class TemporalFusionTransformer(nn.Module):
    """
    Architecture:
    1. Variable Selection Network - learns which features matter
    2. LSTM Encoder - captures local temporal patterns
    3. Multi-Head Attention - captures long-range dependencies
    4. Gated Residual Network - provides skip connections
    5. Quantile Output - predicts distribution, not just mean

    Key Advantages:
    - Interpretable attention weights show feature importance
    - Handles static (sector) and time-varying (price) features
    - Quantile regression provides uncertainty estimates
    """

    def __init__(
        self,
        num_static_features=5,       # Sector, industry, market cap bucket
        num_time_varying_known=10,   # Calendar features, scheduled events
        num_time_varying_unknown=30, # Prices, indicators (known only up to t)
        hidden_size=128,
        num_attention_heads=4,
        dropout=0.1,
        quantiles=[0.1, 0.5, 0.9]    # Predict 10th, 50th, 90th percentiles
    ):
        super().__init__()
        # ... architecture implementation
```

**Training Configuration:**
- Learning rate: 1e-4 with cosine annealing
- Batch size: 64
- Epochs: 50-100 with early stopping (patience=10)
- Regularization: Dropout 0.1, weight decay 1e-5
- Loss: Quantile loss (pinball loss)

### 4.2 Bidirectional LSTM

```python
class StockLSTM(nn.Module):
    """
    Architecture:
    1. Input projection layer
    2. 2-layer bidirectional LSTM
    3. Attention pooling over sequence
    4. Dense layers for prediction
    5. Dual output: point prediction + volatility (aleatoric uncertainty)

    Key Advantages:
    - Simpler, faster to train
    - Good at capturing local patterns
    - Volatility output enables position sizing
    """

    def __init__(
        self,
        input_size=45,
        hidden_size=128,
        num_layers=2,
        dropout=0.2
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout
        )
        # ... architecture implementation
```

### 4.3 Deep Ensemble Combiner

```python
class DeepEnsemble:
    """
    Combines TFT + LSTM + existing Gradient Boosting.

    Ensemble Methods:
    1. Simple average (baseline)
    2. Regime-weighted (different weights per regime)
    3. Uncertainty-weighted (weight by inverse variance)
    4. Meta-learner (stacked generalization)

    Uncertainty Quantification:
    - Epistemic (model disagreement): std across ensemble members
    - Aleatoric (data noise): from quantile spread or volatility output
    - Total uncertainty: sqrt(epistemic^2 + aleatoric^2)

    Position Sizing Integration:
    - High uncertainty → smaller position
    - Low uncertainty → larger position (up to Kelly limit)
    """

    def __init__(self, models, regime_weights=None):
        self.models = models
        self.regime_weights = regime_weights or {
            'BULL': {'tft': 0.4, 'lstm': 0.3, 'gb': 0.3},
            'BEAR': {'tft': 0.3, 'lstm': 0.3, 'gb': 0.4},  # GB more stable
            'CRISIS': {'tft': 0.2, 'lstm': 0.2, 'gb': 0.6}  # Conservative
        }
```

---

## 5. Training Protocol

### 5.1 Walk-Forward Training

```
Timeline:
├── 2015-2018 ──┼── 2019 ──┼── Purge ──┼── 2020 Q1 ──┤
│   Training    │Validation│  5 days  │    Test      │
└───────────────┴──────────┴──────────┴──────────────┘

Expanding Windows:
Window 1: Train 2015-2018, Val 2019, Test 2020-Q1
Window 2: Train 2015-2019, Val 2020, Test 2020-Q2
Window 3: Train 2015-2020, Val 2021, Test 2021-Q1
...

For each window:
1. Train on historical data
2. Validate hyperparameters
3. Evaluate on held-out test
4. Record metrics for WFE calculation
```

### 5.2 Hyperparameter Tuning

Using Optuna for Bayesian optimization:

```python
HYPERPARAMETER_SPACE = {
    'hidden_size': [64, 128, 256],
    'num_layers': [1, 2, 3],
    'num_attention_heads': [2, 4, 8],
    'dropout': [0.1, 0.2, 0.3],
    'learning_rate': [1e-5, 1e-3],  # log scale
    'batch_size': [32, 64, 128],
    'sequence_length': [30, 60, 90]
}

# Objective: maximize validation IC while minimizing WFE gap
```

### 5.3 Early Stopping Criteria

```python
EARLY_STOPPING = {
    'patience': 10,                    # Epochs without improvement
    'min_delta': 0.001,               # Minimum improvement threshold
    'monitor': 'val_quantile_loss',   # Primary metric
    'secondary': 'val_ic',            # Information coefficient
    'restore_best_weights': True
}
```

---

## 6. Evaluation Metrics

### 6.1 Prediction Quality

| Metric | Description | Target |
|--------|-------------|--------|
| **IC (Information Coefficient)** | Correlation of predictions with actual returns | > 0.05 |
| **ICIR (IC Information Ratio)** | Mean IC / Std IC | > 0.5 |
| **Rank IC** | Spearman correlation | > 0.03 |
| **Hit Rate** | % of correct direction predictions | > 52% |
| **Quantile Calibration** | Do 10% predictions fall below P10? | Within 2% |

### 6.2 Financial Metrics (Backtest)

| Metric | Description | Target |
|--------|-------------|--------|
| **Walk-Forward Efficiency** | Test Sharpe / Train Sharpe | 50-80% |
| **Out-of-Sample Alpha** | Excess return vs benchmark | > 0% |
| **Deflated Sharpe p-value** | Statistical significance | < 0.05 |
| **Max Drawdown** | Worst peak-to-trough | < 25% |

### 6.3 Model Health

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Feature Drift** | Distribution shift in inputs | > 2 std dev |
| **Prediction Drift** | Change in prediction distribution | > 1 std dev |
| **IC Decay** | Rolling IC vs historical | < 50% of training IC |

---

## 7. Integration with Existing System

### 7.1 Node.js Bridge (pythonMLClient.js)

```javascript
class PythonMLClient {
    constructor(options = {}) {
        this.pythonPath = options.pythonPath || 'python3';
        this.modelPath = options.modelPath || './python/models';
        this.timeout = options.timeout || 30000;  // 30s
        this.cache = new LRUCache({ max: 1000, ttl: 3600000 }); // 1hr
    }

    async predict(symbols, asOfDate, options = {}) {
        // 1. Check cache
        // 2. Prepare features via HistoricalDataProvider
        // 3. Call Python subprocess
        // 4. Parse results
        // 5. Cache and return
    }

    async train(startDate, endDate, options = {}) {
        // Full training pipeline via subprocess
    }
}
```

### 7.2 Signal Integration (UnifiedStrategyEngine)

```javascript
// In UnifiedStrategyEngine._initializeMLComponents()
try {
    const { PythonMLClient } = require('../ml/pythonMLClient');
    this.deepLearningClient = new PythonMLClient(this.db);
    console.log('Deep learning models initialized');
} catch (e) {
    this.deepLearningClient = null;
    console.warn('Deep learning not available, using gradient boosting');
}

// Add to DEFAULT_SIGNAL_WEIGHTS
DEFAULT_SIGNAL_WEIGHTS.mlPrediction = 0.05;  // Start conservative

// In signal calculation
async _calculateMLSignal(symbol) {
    if (!this.deepLearningClient) {
        return this._calculateGradientBoostingSignal(symbol);
    }

    const prediction = await this.deepLearningClient.predict(
        [symbol],
        this.simulationDate
    );

    return {
        signal: prediction.expected_return,
        confidence: 1 - prediction.uncertainty,  // Lower uncertainty = higher confidence
        components: prediction.feature_attributions
    };
}
```

---

## 8. File Structure

```
python/
├── models/
│   ├── __init__.py
│   ├── config.py                 # Hyperparameters, paths
│   ├── feature_engine.py         # Feature preprocessing
│   ├── temporal_fusion.py        # TFT implementation
│   ├── stock_lstm.py             # LSTM implementation
│   ├── deep_ensemble.py          # Ensemble combiner
│   ├── trainer.py                # Training loop
│   ├── evaluator.py              # Metrics calculation
│   └── serve.py                  # Prediction server
├── data/
│   └── .gitkeep
├── checkpoints/
│   └── .gitkeep
├── requirements.txt
└── train.py                      # Training entry point

src/services/ml/
├── pythonMLClient.js             # Node.js bridge
├── deepLearningSignal.js         # Signal calculator
└── modelHealth.js                # Monitoring
```

---

## 9. Implementation Phases

### Phase 1A: Infrastructure (This Sprint)
1. Create Python project structure
2. Build Node.js ↔ Python bridge
3. Implement feature engineering pipeline
4. Create training data export from SQLite

### Phase 1B: LSTM Model
1. Implement StockLSTM architecture
2. Training pipeline with walk-forward
3. Integrate as signal
4. Baseline metrics

### Phase 1C: Transformer Model
1. Implement Temporal Fusion Transformer
2. Attention visualization
3. Ensemble with LSTM
4. Final evaluation

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Model overfitting | Strict walk-forward, dropout, ensemble |
| Slow inference | Caching, batching, model quantization |
| Python crashes | Graceful fallback to gradient boosting |
| Feature drift | Automated monitoring, retrain triggers |
| Regime change | Regime-specific ensemble weights |

---

## 11. Success Criteria

Before adding ML signal to production:

1. **IC > 0.03** on out-of-sample data
2. **WFE > 50%** across walk-forward windows
3. **Positive alpha** after transaction costs
4. **Deflated Sharpe p-value < 0.05**
5. **No obvious regime failures** (no 3x worse in any regime)
6. **Latency < 100ms** per prediction batch

---

## Next Steps

1. ✅ Design architecture (this document)
2. ⏳ Build Python ML bridge infrastructure
3. ⏳ Implement feature engineering pipeline
4. ⏳ Build LSTM model first (simpler)
5. ⏳ Add Transformer model
6. ⏳ Build ensemble
7. ⏳ Integrate and validate
