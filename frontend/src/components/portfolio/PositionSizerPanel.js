// frontend/src/components/portfolio/PositionSizerPanel.js
import { useState, useMemo } from 'react';
import { Loader, AlertTriangle, Target, Calculator, DollarSign, Percent, BarChart3, TrendingUp, Shield, Zap, Info, ChevronDown, ChevronUp, Activity, TrendingDown, Layers } from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

const METHODS = [
  { id: 'fixed_risk', name: 'Fixed Risk', icon: Target, description: 'Risk a fixed percentage of portfolio per trade', recommended: true },
  { id: 'kelly', name: 'Kelly Criterion', icon: Calculator, description: 'Optimal sizing based on win rate and payoff ratio' },
  { id: 'multi_kelly', name: 'Multi-Asset Kelly', icon: Layers, description: 'Kelly with portfolio correlations and existing positions' },
  { id: 'equal_weight', name: 'Equal Weight', icon: BarChart3, description: 'Divide capital equally among positions' },
  { id: 'volatility', name: 'Volatility-Based', icon: Percent, description: 'Size inversely proportional to volatility' },
  { id: 'percent', name: 'Percent of Portfolio', icon: DollarSign, description: 'Simple fixed percentage allocation' }
];

function PositionSizerPanel({ portfolioId, portfolioValue = 100000, positions = [] }) {
  const [method, setMethod] = useState('fixed_risk');
  const [config, setConfig] = useState({
    portfolioValue: portfolioValue,
    entryPrice: 100,
    stopLoss: 95,
    targetPrice: 115,
    riskPercent: 2,
    winRate: 55,
    avgWin: 10,
    avgLoss: 5,
    numPositions: 10,
    symbol: '',
    allocationPercent: 5,
    // Multi-asset Kelly settings
    newSymbol: 'AAPL',
    newWinRate: 55,
    newAvgWin: 12,
    newAvgLoss: 6,
    existingCorrelation: 0.5,
    // Risk of Ruin settings
    ruinThreshold: 50, // 50% drawdown = ruin
    numTrades: 100
  });
  const [calculating, setCalculating] = useState(false);
  const [results, setResults] = useState(null);
  const [riskRewardResults, setRiskRewardResults] = useState(null);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRiskOfRuin, setShowRiskOfRuin] = useState(false);
  const [showSensitivity, setShowSensitivity] = useState(false);

  const calculatePositionSize = async () => {
    try {
      setCalculating(true);
      setError(null);
      setResults(null);

      const payload = {
        method,
        portfolioValue: config.portfolioValue,
        entryPrice: config.entryPrice,
        stopLoss: config.stopLoss,
        targetPrice: config.targetPrice,
        riskPercent: config.riskPercent / 100,
        winRate: config.winRate / 100,
        avgWin: config.avgWin / 100,
        avgLoss: config.avgLoss / 100,
        numPositions: config.numPositions,
        symbol: config.symbol,
        allocationPercent: config.allocationPercent / 100
      };

      const res = await simulateAPI.calculatePositionSize(payload);
      setResults(res.data.data || res.data);

      // Also calculate risk/reward if we have entry/stop/target
      if (config.entryPrice && config.stopLoss && config.targetPrice) {
        const rrRes = await simulateAPI.analyzeRiskReward({
          entryPrice: config.entryPrice,
          stopLoss: config.stopLoss,
          targetPrice: config.targetPrice,
          winRate: config.winRate / 100
        });
        setRiskRewardResults(rrRes.data.data || rrRes.data);
      }
    } catch (err) {
      console.error('Position sizing failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setCalculating(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(2)}%`;
  };

  // Calculate quick stats for display
  const quickStats = useMemo(() => {
    const riskAmount = (config.portfolioValue * config.riskPercent) / 100;
    const riskPerShare = config.entryPrice - config.stopLoss;
    const shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
    const positionValue = shares * config.entryPrice;
    const positionPercent = (positionValue / config.portfolioValue) * 100;
    const reward = config.targetPrice - config.entryPrice;
    const risk = config.entryPrice - config.stopLoss;
    const rrRatio = risk > 0 ? reward / risk : 0;
    const potentialProfit = shares * reward;
    const maxLoss = shares * risk;

    return {
      riskAmount,
      shares,
      positionValue,
      positionPercent,
      rrRatio,
      potentialProfit,
      maxLoss
    };
  }, [config]);

  // Risk ladder showing different risk levels
  const riskLadder = useMemo(() => {
    const riskLevels = [0.5, 1, 1.5, 2, 2.5, 3, 5];
    const riskPerShare = config.entryPrice - config.stopLoss;

    return riskLevels.map(riskPct => {
      const riskAmount = (config.portfolioValue * riskPct) / 100;
      const shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
      const positionValue = shares * config.entryPrice;
      const positionPercent = (positionValue / config.portfolioValue) * 100;

      return {
        riskPct,
        riskAmount,
        shares,
        positionValue,
        positionPercent
      };
    });
  }, [config]);

  // Kelly calculation
  const kellyCalc = useMemo(() => {
    const winRate = config.winRate / 100;
    const avgWin = config.avgWin / 100;
    const avgLoss = config.avgLoss / 100;

    if (avgLoss === 0) return null;

    const b = avgWin / avgLoss; // Win/loss ratio
    const p = winRate;
    const q = 1 - p;

    const kellyFraction = (p * b - q) / b;
    const halfKelly = kellyFraction / 2;
    const quarterKelly = kellyFraction / 4;

    const expectedValue = (p * avgWin) - (q * avgLoss);

    return {
      kellyFraction: Math.max(0, kellyFraction),
      halfKelly: Math.max(0, halfKelly),
      quarterKelly: Math.max(0, quarterKelly),
      expectedValue,
      payoffRatio: b,
      edge: kellyFraction > 0
    };
  }, [config]);

  // Multi-Asset Kelly Calculation
  const multiAssetKelly = useMemo(() => {
    const newWinRate = config.newWinRate / 100;
    const newAvgWin = config.newAvgWin / 100;
    const newAvgLoss = config.newAvgLoss / 100;
    const correlation = config.existingCorrelation;

    if (newAvgLoss === 0) return null;

    // Calculate individual Kelly for new position
    const b = newAvgWin / newAvgLoss;
    const p = newWinRate;
    const q = 1 - p;
    const individualKelly = Math.max(0, (p * b - q) / b);

    // Calculate existing portfolio exposure
    const existingExposure = positions.reduce((sum, pos) => sum + (pos.weight || 0), 0) / 100;

    // Adjust Kelly based on correlation with existing positions
    // Higher correlation = lower additional Kelly (diversification benefit lost)
    // Formula: Adjusted Kelly = Individual Kelly * (1 - correlation * existing_exposure)
    const correlationPenalty = correlation * existingExposure;
    const adjustedKelly = individualKelly * Math.max(0.1, 1 - correlationPenalty);

    // Calculate optimal allocation considering existing positions
    const remainingCapacity = Math.max(0, 1 - existingExposure);
    const recommendedAllocation = Math.min(adjustedKelly, remainingCapacity);

    // Simulate portfolio impact
    const portfolioEdge = (p * newAvgWin) - (q * newAvgLoss);
    const diversificationBenefit = (1 - correlation) * 100;

    return {
      individualKelly,
      adjustedKelly,
      recommendedAllocation,
      existingExposure,
      correlationPenalty,
      portfolioEdge,
      diversificationBenefit,
      remainingCapacity,
      hasEdge: individualKelly > 0
    };
  }, [config, positions]);

  // Risk of Ruin Calculator
  const riskOfRuin = useMemo(() => {
    const winRate = config.winRate / 100;
    const avgWin = config.avgWin / 100;
    const avgLoss = config.avgLoss / 100;
    const ruinThreshold = config.ruinThreshold / 100;
    const numTrades = config.numTrades;

    if (avgLoss === 0 || !kellyCalc) return null;

    // Risk fractions to analyze
    const fractions = [
      { name: 'Quarter Kelly', fraction: kellyCalc.quarterKelly },
      { name: 'Half Kelly', fraction: kellyCalc.halfKelly },
      { name: 'Full Kelly', fraction: kellyCalc.kellyFraction },
      { name: '1.5x Kelly', fraction: kellyCalc.kellyFraction * 1.5 },
      { name: '2x Kelly', fraction: kellyCalc.kellyFraction * 2 }
    ];

    // Monte Carlo simulation for risk of ruin
    const simulations = 1000;
    const results = fractions.map(({ name, fraction }) => {
      if (fraction <= 0) {
        return { name, fraction, ruinProb: 1, avgDrawdown: 100, maxDrawdown: 100 };
      }

      let ruinCount = 0;
      let totalMaxDrawdown = 0;
      let allDrawdowns = [];

      for (let sim = 0; sim < simulations; sim++) {
        let equity = 1;
        let peak = 1;
        let maxDrawdown = 0;

        for (let trade = 0; trade < numTrades; trade++) {
          const isWin = Math.random() < winRate;
          const returnPct = isWin ? (avgWin * fraction) : (-avgLoss * fraction);
          equity *= (1 + returnPct);

          peak = Math.max(peak, equity);
          const drawdown = (peak - equity) / peak;
          maxDrawdown = Math.max(maxDrawdown, drawdown);

          if (drawdown >= ruinThreshold) {
            ruinCount++;
            break;
          }
        }

        totalMaxDrawdown += maxDrawdown;
        allDrawdowns.push(maxDrawdown);
      }

      const ruinProb = ruinCount / simulations;
      const avgDrawdown = totalMaxDrawdown / simulations;
      const medianDrawdown = allDrawdowns.sort((a, b) => a - b)[Math.floor(simulations / 2)];

      return {
        name,
        fraction,
        ruinProb,
        avgDrawdown: avgDrawdown * 100,
        medianDrawdown: medianDrawdown * 100,
        safetyScore: Math.max(0, 100 - ruinProb * 100 - avgDrawdown * 50)
      };
    });

    return results;
  }, [config, kellyCalc]);

  // Kelly Edge Sensitivity Analysis
  const sensitivityAnalysis = useMemo(() => {
    if (!kellyCalc) return null;

    const baseWinRate = config.winRate;
    const baseAvgWin = config.avgWin;
    const baseAvgLoss = config.avgLoss;

    // Generate sensitivity grid
    const winRateVariations = [-10, -5, 0, 5, 10];
    const payoffVariations = [-20, -10, 0, 10, 20];

    const grid = [];

    winRateVariations.forEach(winDelta => {
      const row = [];
      payoffVariations.forEach(payoffDelta => {
        const adjWinRate = Math.max(1, Math.min(99, baseWinRate + winDelta)) / 100;
        const adjAvgWin = Math.max(0.5, baseAvgWin * (1 + payoffDelta / 100)) / 100;
        const adjAvgLoss = baseAvgLoss / 100;

        const b = adjAvgWin / adjAvgLoss;
        const p = adjWinRate;
        const q = 1 - p;
        const kelly = Math.max(0, (p * b - q) / b);
        const ev = (p * adjAvgWin) - (q * adjAvgLoss);

        row.push({
          winRateDelta: winDelta,
          payoffDelta,
          kelly: kelly * 100,
          ev: ev * 100,
          hasEdge: kelly > 0
        });
      });
      grid.push(row);
    });

    // Find cliff points (where Kelly goes to 0)
    const cliffPoints = [];
    for (let winOffset = -20; winOffset <= 0; winOffset++) {
      const testWinRate = (baseWinRate + winOffset) / 100;
      const b = (baseAvgWin / 100) / (baseAvgLoss / 100);
      const kelly = (testWinRate * b - (1 - testWinRate)) / b;
      if (kelly <= 0) {
        cliffPoints.push({ type: 'winRate', offset: winOffset, threshold: baseWinRate + winOffset });
        break;
      }
    }

    return {
      grid,
      cliffPoints,
      currentKelly: kellyCalc.kellyFraction * 100,
      robustness: cliffPoints.length > 0 ? Math.abs(cliffPoints[0].offset) : 20
    };
  }, [config, kellyCalc]);

  const selectedMethod = METHODS.find(m => m.id === method);

  return (
    <div className="simulation-panel position-sizer-panel">
      <div className="panel-header">
        <h3>Position Sizing Calculator</h3>
        <p className="panel-description">
          Calculate optimal position sizes using various risk management methods
        </p>
      </div>

      <div className="panel-content">
        {/* Method Selector */}
        <div className="ps-method-grid">
          {METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                className={`ps-method-card ${method === m.id ? 'active' : ''}`}
                onClick={() => setMethod(m.id)}
              >
                <div className="method-icon-wrapper">
                  <Icon size={20} />
                </div>
                <div className="method-info">
                  <span className="method-name">
                    {m.name}
                    {m.recommended && <span className="recommended-badge">Recommended</span>}
                  </span>
                  <span className="method-desc">{m.description}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="ps-main-grid">
          {/* Left Column - Inputs */}
          <div className="ps-inputs">
            <div className="config-section">
              <h4>Portfolio & Trade Setup</h4>

              <div className="form-group">
                <label>Portfolio Value</label>
                <div className="input-with-icon">
                  <DollarSign size={16} />
                  <input
                    type="number"
                    value={config.portfolioValue}
                    onChange={(e) => setConfig({ ...config, portfolioValue: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="1000"
                  />
                </div>
              </div>

              {(method === 'fixed_risk' || method === 'volatility') && (
                <>
                  <div className="form-group">
                    <label>Entry Price</label>
                    <div className="input-with-icon">
                      <TrendingUp size={16} />
                      <input
                        type="number"
                        value={config.entryPrice}
                        onChange={(e) => setConfig({ ...config, entryPrice: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Stop Loss</label>
                      <input
                        type="number"
                        value={config.stopLoss}
                        onChange={(e) => setConfig({ ...config, stopLoss: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                        className="stop-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Target Price</label>
                      <input
                        type="number"
                        value={config.targetPrice}
                        onChange={(e) => setConfig({ ...config, targetPrice: parseFloat(e.target.value) || 0 })}
                        min="0"
                        step="0.01"
                        className="target-input"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Method-Specific Inputs */}
            <div className="config-section">
              <h4>{selectedMethod?.name} Parameters</h4>

              {method === 'fixed_risk' && (
                <div className="form-group">
                  <label>Risk Per Trade</label>
                  <div className="risk-slider">
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={config.riskPercent}
                      onChange={(e) => setConfig({ ...config, riskPercent: parseFloat(e.target.value) })}
                    />
                    <div className="risk-slider-labels">
                      <span>0.5%</span>
                      <span className="current-risk">{config.riskPercent}%</span>
                      <span>5%</span>
                    </div>
                  </div>
                  <div className="risk-amount-display">
                    Risking <strong>{formatValue(quickStats.riskAmount)}</strong> per trade
                  </div>
                </div>
              )}

              {(method === 'kelly' || method === 'multi_kelly') && (
                <>
                  <div className="form-group">
                    <label>Historical Win Rate</label>
                    <div className="percent-input">
                      <input
                        type="number"
                        value={method === 'multi_kelly' ? config.newWinRate : config.winRate}
                        onChange={(e) => setConfig({
                          ...config,
                          [method === 'multi_kelly' ? 'newWinRate' : 'winRate']: parseFloat(e.target.value) || 0
                        })}
                        min="1"
                        max="99"
                        step="1"
                      />
                      <span>%</span>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Average Win</label>
                      <div className="percent-input">
                        <input
                          type="number"
                          value={method === 'multi_kelly' ? config.newAvgWin : config.avgWin}
                          onChange={(e) => setConfig({
                            ...config,
                            [method === 'multi_kelly' ? 'newAvgWin' : 'avgWin']: parseFloat(e.target.value) || 0
                          })}
                          min="0"
                          step="0.5"
                        />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Average Loss</label>
                      <div className="percent-input">
                        <input
                          type="number"
                          value={method === 'multi_kelly' ? config.newAvgLoss : config.avgLoss}
                          onChange={(e) => setConfig({
                            ...config,
                            [method === 'multi_kelly' ? 'newAvgLoss' : 'avgLoss']: parseFloat(e.target.value) || 0
                          })}
                          min="0"
                          step="0.5"
                        />
                        <span>%</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {method === 'multi_kelly' && (
                <>
                  <div className="form-group">
                    <label>New Position Symbol</label>
                    <input
                      type="text"
                      value={config.newSymbol}
                      onChange={(e) => setConfig({ ...config, newSymbol: e.target.value.toUpperCase() })}
                      placeholder="e.g., AAPL"
                    />
                  </div>
                  <div className="form-group">
                    <label>Correlation with Existing Portfolio</label>
                    <div className="correlation-slider">
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.1"
                        value={config.existingCorrelation}
                        onChange={(e) => setConfig({ ...config, existingCorrelation: parseFloat(e.target.value) })}
                      />
                      <div className="correlation-labels">
                        <span>-1 (Hedge)</span>
                        <span className={`current-corr ${config.existingCorrelation > 0.5 ? 'high' : config.existingCorrelation < 0 ? 'negative' : ''}`}>
                          {config.existingCorrelation.toFixed(1)}
                        </span>
                        <span>+1 (Same)</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {method === 'equal_weight' && (
                <div className="form-group">
                  <label>Number of Positions</label>
                  <input
                    type="number"
                    value={config.numPositions}
                    onChange={(e) => setConfig({ ...config, numPositions: parseInt(e.target.value) || 1 })}
                    min="1"
                    max="100"
                  />
                  <span className="form-hint">Each position: {formatValue(config.portfolioValue / config.numPositions)}</span>
                </div>
              )}

              {method === 'volatility' && (
                <div className="form-group">
                  <label>Symbol (for volatility lookup)</label>
                  <input
                    type="text"
                    value={config.symbol}
                    onChange={(e) => setConfig({ ...config, symbol: e.target.value.toUpperCase() })}
                    placeholder="e.g., AAPL"
                  />
                </div>
              )}

              {method === 'percent' && (
                <div className="form-group">
                  <label>Allocation Percent</label>
                  <div className="percent-input">
                    <input
                      type="number"
                      value={config.allocationPercent}
                      onChange={(e) => setConfig({ ...config, allocationPercent: parseFloat(e.target.value) || 0 })}
                      min="0.1"
                      max="100"
                      step="0.5"
                    />
                    <span>%</span>
                  </div>
                  <span className="form-hint">Position: {formatValue(config.portfolioValue * config.allocationPercent / 100)}</span>
                </div>
              )}
            </div>

            <button
              className="btn btn-primary run-btn"
              onClick={calculatePositionSize}
              disabled={calculating}
            >
              {calculating ? (
                <>
                  <Loader className="spinning" size={16} />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator size={16} />
                  Calculate Position Size
                </>
              )}
            </button>
          </div>

          {/* Right Column - Visual Preview */}
          <div className="ps-preview">
            {/* Risk/Reward Visual */}
            {(method === 'fixed_risk' || method === 'volatility') && (
              <div className="rr-visual-card">
                <h5>Trade Setup Visual</h5>
                <RiskRewardVisual
                  entry={config.entryPrice}
                  stopLoss={config.stopLoss}
                  target={config.targetPrice}
                  rrRatio={quickStats.rrRatio}
                />
                <div className="rr-quick-stats">
                  <div className="rr-stat">
                    <span className="label">Risk/Reward</span>
                    <span className={`value ${quickStats.rrRatio >= 2 ? 'good' : quickStats.rrRatio >= 1 ? 'ok' : 'bad'}`}>
                      1:{quickStats.rrRatio.toFixed(2)}
                    </span>
                  </div>
                  <div className="rr-stat">
                    <span className="label">Risk %</span>
                    <span className="value">
                      {((config.entryPrice - config.stopLoss) / config.entryPrice * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="rr-stat">
                    <span className="label">Reward %</span>
                    <span className="value positive">
                      {((config.targetPrice - config.entryPrice) / config.entryPrice * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Kelly Preview */}
            {method === 'kelly' && kellyCalc && (
              <div className="kelly-preview-card">
                <h5>Kelly Criterion Analysis</h5>
                <KellyVisual
                  kellyFraction={kellyCalc.kellyFraction}
                  halfKelly={kellyCalc.halfKelly}
                  edge={kellyCalc.edge}
                />
                <div className="kelly-stats">
                  <div className="kelly-stat">
                    <span className="label">Full Kelly</span>
                    <span className="value">{(kellyCalc.kellyFraction * 100).toFixed(1)}%</span>
                  </div>
                  <div className="kelly-stat recommended">
                    <span className="label">Half Kelly (Safer)</span>
                    <span className="value">{(kellyCalc.halfKelly * 100).toFixed(1)}%</span>
                  </div>
                  <div className="kelly-stat">
                    <span className="label">Expected Value</span>
                    <span className={`value ${kellyCalc.expectedValue >= 0 ? 'positive' : 'negative'}`}>
                      {(kellyCalc.expectedValue * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
                {!kellyCalc.edge && (
                  <div className="kelly-warning">
                    <AlertTriangle size={14} />
                    No edge detected. Kelly suggests 0% position.
                  </div>
                )}
              </div>
            )}

            {/* Multi-Asset Kelly Preview */}
            {method === 'multi_kelly' && multiAssetKelly && (
              <div className="multi-kelly-card">
                <h5>Portfolio-Adjusted Kelly</h5>
                <MultiAssetKellyVisual data={multiAssetKelly} positions={positions} />
              </div>
            )}

            {/* Quick Position Preview */}
            {method === 'fixed_risk' && (
              <div className="quick-position-card">
                <h5>Quick Preview</h5>
                <div className="position-preview">
                  <div className="preview-main">
                    <span className="preview-label">Position Size</span>
                    <span className="preview-value">{formatValue(quickStats.positionValue)}</span>
                    <span className="preview-shares">{quickStats.shares} shares @ ${config.entryPrice}</span>
                  </div>
                  <div className="preview-stats">
                    <div className="preview-stat">
                      <span>Portfolio %</span>
                      <span>{quickStats.positionPercent.toFixed(1)}%</span>
                    </div>
                    <div className="preview-stat negative">
                      <span>Max Loss</span>
                      <span>{formatValue(quickStats.maxLoss)}</span>
                    </div>
                    <div className="preview-stat positive">
                      <span>Potential Gain</span>
                      <span>{formatValue(quickStats.potentialProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Risk of Ruin Section - Show for Kelly methods */}
        {(method === 'kelly' || method === 'multi_kelly') && kellyCalc && kellyCalc.edge && (
          <div className="advanced-kelly-section">
            <button
              className="section-toggle"
              onClick={() => setShowRiskOfRuin(!showRiskOfRuin)}
            >
              <TrendingDown size={18} />
              <span>Risk of Ruin Analysis</span>
              {showRiskOfRuin ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showRiskOfRuin && riskOfRuin && (
              <div className="risk-of-ruin-panel">
                <div className="ror-config">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Ruin Threshold (Max Drawdown)</label>
                      <div className="percent-input">
                        <input
                          type="number"
                          value={config.ruinThreshold}
                          onChange={(e) => setConfig({ ...config, ruinThreshold: parseFloat(e.target.value) || 50 })}
                          min="10"
                          max="90"
                          step="5"
                        />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Simulation Trades</label>
                      <input
                        type="number"
                        value={config.numTrades}
                        onChange={(e) => setConfig({ ...config, numTrades: parseInt(e.target.value) || 100 })}
                        min="20"
                        max="500"
                        step="10"
                      />
                    </div>
                  </div>
                </div>

                <RiskOfRuinChart data={riskOfRuin} />

                <div className="ror-table">
                  <div className="ror-header">
                    <span>Sizing</span>
                    <span>Fraction</span>
                    <span>Ruin Risk</span>
                    <span>Avg Drawdown</span>
                    <span>Safety</span>
                  </div>
                  {riskOfRuin.map((row, idx) => (
                    <div
                      key={idx}
                      className={`ror-row ${row.name === 'Half Kelly' ? 'recommended' : ''}`}
                    >
                      <span className="ror-name">{row.name}</span>
                      <span className="ror-fraction">{(row.fraction * 100).toFixed(1)}%</span>
                      <span className={`ror-ruin ${row.ruinProb > 0.1 ? 'danger' : row.ruinProb > 0.01 ? 'warning' : 'safe'}`}>
                        {(row.ruinProb * 100).toFixed(1)}%
                      </span>
                      <span className="ror-dd">{row.avgDrawdown.toFixed(1)}%</span>
                      <span className={`ror-safety ${row.safetyScore > 70 ? 'good' : row.safetyScore > 40 ? 'ok' : 'poor'}`}>
                        {row.safetyScore.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ror-insight">
                  <Info size={14} />
                  <p>
                    <strong>Insight:</strong> At Full Kelly, your risk of hitting {config.ruinThreshold}% drawdown over {config.numTrades} trades
                    is {(riskOfRuin.find(r => r.name === 'Full Kelly')?.ruinProb * 100 || 0).toFixed(1)}%.
                    Half Kelly reduces this to {(riskOfRuin.find(r => r.name === 'Half Kelly')?.ruinProb * 100 || 0).toFixed(1)}%
                    while capturing ~75% of optimal growth.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edge Sensitivity Section */}
        {(method === 'kelly' || method === 'multi_kelly') && sensitivityAnalysis && (
          <div className="advanced-kelly-section">
            <button
              className="section-toggle"
              onClick={() => setShowSensitivity(!showSensitivity)}
            >
              <Activity size={18} />
              <span>Edge Sensitivity Analysis</span>
              {showSensitivity ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showSensitivity && (
              <div className="sensitivity-panel">
                <div className="sensitivity-header">
                  <h5>How Kelly Changes with Win Rate & Payoff</h5>
                  <p className="sensitivity-description">
                    Current Kelly: <strong>{sensitivityAnalysis.currentKelly.toFixed(1)}%</strong> |
                    Edge Robustness: <strong className={sensitivityAnalysis.robustness >= 10 ? 'good' : 'warning'}>
                      {sensitivityAnalysis.robustness}%
                    </strong> margin before edge disappears
                  </p>
                </div>

                <SensitivityHeatmap
                  grid={sensitivityAnalysis.grid}
                  currentWinRate={config.winRate}
                />

                {sensitivityAnalysis.cliffPoints.length > 0 && (
                  <div className="cliff-warning">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>Edge Cliff Detected!</strong>
                      <p>
                        If your win rate drops to {sensitivityAnalysis.cliffPoints[0].threshold}%
                        ({Math.abs(sensitivityAnalysis.cliffPoints[0].offset)}% lower than current),
                        your edge disappears completely. Consider using conservative sizing.
                      </p>
                    </div>
                  </div>
                )}

                <div className="sensitivity-insight">
                  <Info size={14} />
                  <p>
                    <strong>Reading the Heatmap:</strong> Green cells show positive edge (where Kelly {'>'} 0).
                    Red cells mean no edge. The darker the green, the stronger your edge.
                    If small changes in your assumptions turn cells red, your edge may not be as robust as you think.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {results && (
          <div className="results-section">
            <h4>Position Size Recommendation</h4>

            <div className="results-grid ps-results-grid">
              <div className="result-card primary large ps-main-result">
                <div className="result-icon-large">
                  <Target size={32} />
                </div>
                <div className="result-content">
                  <span className="result-label">Recommended Position</span>
                  <span className="result-value">{formatValue(results.positionValue)}</span>
                  <span className="result-hint">{results.shares} shares @ ${results.price?.toFixed(2)}</span>
                </div>
              </div>

              <div className="result-card">
                <span className="result-label">Portfolio %</span>
                <span className="result-value">{formatPercent((results.portfolioPercent || 0) * 100)}</span>
              </div>

              <div className="result-card">
                <span className="result-label">Risk Amount</span>
                <span className="result-value">{formatValue(results.riskAmount)}</span>
              </div>

              {results.maxLoss && (
                <div className="result-card warning">
                  <span className="result-label">Max Loss if Stopped</span>
                  <span className="result-value" style={{ color: 'var(--danger-color)' }}>
                    {formatValue(results.maxLoss)}
                  </span>
                </div>
              )}

              {results.potentialProfit && (
                <div className="result-card">
                  <span className="result-label">Potential Profit</span>
                  <span className="result-value" style={{ color: 'var(--success-color)' }}>
                    {formatValue(results.potentialProfit)}
                  </span>
                </div>
              )}
            </div>

            {/* Risk Ladder */}
            <div className="risk-ladder-section">
              <div className="section-header">
                <h5>Position Size at Different Risk Levels</h5>
                <span className="form-hint">Compare how position size changes with risk tolerance</span>
              </div>
              <div className="risk-ladder">
                {riskLadder.map((level, idx) => (
                  <div
                    key={idx}
                    className={`ladder-row ${level.riskPct === config.riskPercent ? 'current' : ''}`}
                  >
                    <span className="ladder-risk">{level.riskPct}%</span>
                    <div className="ladder-bar-container">
                      <div
                        className="ladder-bar"
                        style={{ width: `${Math.min(100, level.positionPercent)}%` }}
                      />
                    </div>
                    <span className="ladder-shares">{level.shares} shares</span>
                    <span className="ladder-value">{formatValue(level.positionValue)}</span>
                    <span className="ladder-pct">{level.positionPercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Kelly Explanation */}
            {method === 'kelly' && results.kellyFraction && (
              <div className="kelly-explanation enhanced">
                <div className="kelly-header">
                  <Zap size={20} />
                  <h5>Kelly Criterion Insight</h5>
                </div>
                <div className="kelly-comparison">
                  <div className="kelly-option">
                    <span className="option-name">Full Kelly</span>
                    <span className="option-value">{(results.kellyFraction * 100).toFixed(1)}%</span>
                    <span className="option-amount">{formatValue(config.portfolioValue * results.kellyFraction)}</span>
                    <span className="option-desc">Maximum growth, high volatility</span>
                  </div>
                  <div className="kelly-option recommended">
                    <Shield size={16} />
                    <span className="option-name">Half Kelly</span>
                    <span className="option-value">{(results.kellyFraction * 50).toFixed(1)}%</span>
                    <span className="option-amount">{formatValue(config.portfolioValue * results.kellyFraction * 0.5)}</span>
                    <span className="option-desc">75% of optimal growth, much smoother</span>
                  </div>
                  <div className="kelly-option">
                    <span className="option-name">Quarter Kelly</span>
                    <span className="option-value">{(results.kellyFraction * 25).toFixed(1)}%</span>
                    <span className="option-amount">{formatValue(config.portfolioValue * results.kellyFraction * 0.25)}</span>
                    <span className="option-desc">Conservative, minimal drawdowns</span>
                  </div>
                </div>
                <div className="kelly-info">
                  <Info size={14} />
                  <p>
                    Half-Kelly is recommended for most traders. It provides approximately 75% of the optimal growth
                    rate while reducing volatility by 50%. This makes drawdowns more manageable psychologically.
                  </p>
                </div>
              </div>
            )}

            {/* Risk/Reward Analysis */}
            {riskRewardResults && (
              <div className="rr-analysis-section">
                <h5>Risk/Reward Analysis</h5>
                <div className="rr-analysis-grid">
                  <div className="rr-analysis-card">
                    <span className="label">R:R Ratio</span>
                    <span className={`value ${riskRewardResults.ratio >= 2 ? 'positive' : ''}`}>
                      1:{riskRewardResults.ratio?.toFixed(2)}
                    </span>
                    <span className="hint">
                      {riskRewardResults.ratio >= 2 ? 'Favorable' : riskRewardResults.ratio >= 1 ? 'Acceptable' : 'Poor'}
                    </span>
                  </div>
                  <div className="rr-analysis-card">
                    <span className="label">Breakeven Win Rate</span>
                    <span className="value">
                      {formatPercent((riskRewardResults.breakevenWinRate || 0) * 100)}
                    </span>
                    <span className="hint">You need this to break even</span>
                  </div>
                  <div className="rr-analysis-card">
                    <span className="label">Expected Value</span>
                    <span className={`value ${riskRewardResults.expectedValue >= 0 ? 'positive' : 'negative'}`}>
                      {riskRewardResults.expectedValue >= 0 ? '+' : ''}
                      {formatPercent((riskRewardResults.expectedValue || 0) * 100)}
                    </span>
                    <span className="hint">Per trade average</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Educational Info */}
        <div className="ps-info-section">
          <Info size={16} />
          <div>
            <strong>Position Sizing Best Practices:</strong>
            <ul>
              <li>Never risk more than 1-2% of your portfolio on a single trade</li>
              <li>A favorable risk/reward ratio (1:2 or better) improves long-term results</li>
              <li>Kelly Criterion provides optimal sizing but use half-Kelly for practical trading</li>
              <li>Position sizing is more important than entry timing for long-term success</li>
              <li>Account for correlation when adding positions - diversification reduces optimal Kelly</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// Risk/Reward Visual Component
function RiskRewardVisual({ entry, stopLoss, target, rrRatio }) {
  const range = target - stopLoss;
  const entryPercent = range > 0 ? ((entry - stopLoss) / range) * 100 : 50;

  return (
    <div className="rr-visual">
      <div className="rr-chart">
        <div className="rr-zone loss" style={{ height: `${entryPercent}%` }}>
          <span className="zone-label">Loss Zone</span>
        </div>
        <div className="rr-entry-line" style={{ bottom: `${entryPercent}%` }}>
          <span className="entry-price">${entry.toFixed(2)}</span>
          <span className="entry-label">Entry</span>
        </div>
        <div className="rr-zone profit" style={{ height: `${100 - entryPercent}%` }}>
          <span className="zone-label">Profit Zone</span>
        </div>
      </div>
      <div className="rr-prices">
        <div className="price-row target">
          <span className="price-label">Target</span>
          <span className="price-value">${target.toFixed(2)}</span>
        </div>
        <div className="price-row stop">
          <span className="price-label">Stop</span>
          <span className="price-value">${stopLoss.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// Kelly Visual Component
function KellyVisual({ kellyFraction, halfKelly, edge }) {
  const maxPercent = 40; // Scale visualization

  return (
    <div className="kelly-visual">
      <div className="kelly-bars">
        <div className="kelly-bar-group">
          <div className="kelly-bar-label">Full Kelly</div>
          <div className="kelly-bar-track">
            <div
              className={`kelly-bar-fill full ${!edge ? 'no-edge' : ''}`}
              style={{ width: `${Math.min(100, (kellyFraction * 100 / maxPercent) * 100)}%` }}
            />
          </div>
          <div className="kelly-bar-value">{(kellyFraction * 100).toFixed(1)}%</div>
        </div>
        <div className="kelly-bar-group recommended">
          <div className="kelly-bar-label">Half Kelly</div>
          <div className="kelly-bar-track">
            <div
              className={`kelly-bar-fill half ${!edge ? 'no-edge' : ''}`}
              style={{ width: `${Math.min(100, (halfKelly * 100 / maxPercent) * 100)}%` }}
            />
          </div>
          <div className="kelly-bar-value">{(halfKelly * 100).toFixed(1)}%</div>
        </div>
      </div>
      <div className="kelly-scale">
        <span>0%</span>
        <span>10%</span>
        <span>20%</span>
        <span>30%</span>
        <span>40%</span>
      </div>
    </div>
  );
}

// Multi-Asset Kelly Visual Component
function MultiAssetKellyVisual({ data, positions }) {
  const formatPercent = (v) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="multi-kelly-visual">
      {/* Existing Portfolio */}
      <div className="portfolio-exposure-bar">
        <div className="exposure-label">Portfolio Utilization</div>
        <div className="exposure-track-large">
          <div
            className="exposure-fill existing"
            style={{ width: `${Math.min(100, data.existingExposure * 100)}%` }}
          />
          <div
            className="exposure-fill new"
            style={{
              width: `${Math.min(100 - data.existingExposure * 100, data.recommendedAllocation * 100)}%`,
              left: `${data.existingExposure * 100}%`
            }}
          />
        </div>
        <div className="exposure-legend">
          <span className="legend-item existing">
            <span className="dot" />
            Existing: {formatPercent(data.existingExposure)}
          </span>
          <span className="legend-item new">
            <span className="dot" />
            New Position: {formatPercent(data.recommendedAllocation)}
          </span>
          <span className="legend-item remaining">
            <span className="dot" />
            Remaining: {formatPercent(data.remainingCapacity - data.recommendedAllocation)}
          </span>
        </div>
      </div>

      {/* Kelly Breakdown */}
      <div className="kelly-breakdown">
        <div className="breakdown-item">
          <span className="breakdown-label">Individual Kelly</span>
          <span className="breakdown-value">{formatPercent(data.individualKelly)}</span>
          <span className="breakdown-hint">Before correlation adjustment</span>
        </div>
        <div className="breakdown-arrow">→</div>
        <div className="breakdown-item highlight">
          <span className="breakdown-label">Adjusted Kelly</span>
          <span className="breakdown-value">{formatPercent(data.adjustedKelly)}</span>
          <span className="breakdown-hint">After {formatPercent(data.correlationPenalty)} penalty</span>
        </div>
        <div className="breakdown-arrow">→</div>
        <div className="breakdown-item recommended">
          <Shield size={14} />
          <span className="breakdown-label">Recommended</span>
          <span className="breakdown-value">{formatPercent(data.recommendedAllocation / 2)}</span>
          <span className="breakdown-hint">Half Kelly (safer)</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="multi-kelly-metrics">
        <div className="metric-card">
          <span className="metric-label">Diversification Benefit</span>
          <span className={`metric-value ${data.diversificationBenefit > 30 ? 'good' : 'low'}`}>
            {data.diversificationBenefit.toFixed(0)}%
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Expected Edge</span>
          <span className={`metric-value ${data.portfolioEdge > 0 ? 'positive' : 'negative'}`}>
            {(data.portfolioEdge * 100).toFixed(2)}%
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Correlation Impact</span>
          <span className={`metric-value ${data.correlationPenalty > 0.2 ? 'warning' : ''}`}>
            -{formatPercent(data.correlationPenalty)}
          </span>
        </div>
      </div>

      {!data.hasEdge && (
        <div className="kelly-warning">
          <AlertTriangle size={14} />
          No edge detected for new position. Kelly suggests 0% allocation.
        </div>
      )}
    </div>
  );
}

// Risk of Ruin Chart Component
function RiskOfRuinChart({ data }) {
  const maxRuin = Math.max(...data.map(d => d.ruinProb)) * 100;
  const chartHeight = 120;

  return (
    <div className="ror-chart">
      <svg viewBox={`0 0 400 ${chartHeight + 40}`} className="ror-svg">
        {/* Y-axis grid lines */}
        {[0, 25, 50, 75, 100].map((pct, i) => (
          <g key={i}>
            <line
              x1="60"
              y1={chartHeight - (pct / 100) * chartHeight}
              x2="380"
              y2={chartHeight - (pct / 100) * chartHeight}
              stroke="var(--border-color)"
              strokeDasharray="2,2"
            />
            <text
              x="55"
              y={chartHeight - (pct / 100) * chartHeight + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-tertiary)"
            >
              {pct}%
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const barWidth = 50;
          const gap = 15;
          const x = 70 + i * (barWidth + gap);
          const barHeight = (d.ruinProb * 100 / Math.max(maxRuin, 10)) * chartHeight;
          const isRecommended = d.name === 'Half Kelly';
          const isDanger = d.ruinProb > 0.1;

          return (
            <g key={i}>
              <rect
                x={x}
                y={chartHeight - barHeight}
                width={barWidth}
                height={barHeight}
                fill={isDanger ? 'var(--danger-color)' : isRecommended ? 'var(--success-color)' : 'var(--accent-primary)'}
                opacity={isRecommended ? 1 : 0.7}
                rx="4"
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 15}
                textAnchor="middle"
                fontSize="9"
                fill="var(--text-secondary)"
              >
                {d.name.replace(' Kelly', '')}
              </text>
              <text
                x={x + barWidth / 2}
                y={chartHeight - barHeight - 5}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={isDanger ? 'var(--danger-color)' : 'var(--text-primary)'}
              >
                {(d.ruinProb * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* Labels */}
        <text x="10" y="10" fontSize="11" fill="var(--text-secondary)" fontWeight="600">
          Ruin Probability
        </text>
      </svg>
    </div>
  );
}

// Sensitivity Heatmap Component
function SensitivityHeatmap({ grid, currentWinRate }) {
  const getColor = (kelly, hasEdge) => {
    if (!hasEdge) return 'rgba(239, 68, 68, 0.6)';
    const intensity = Math.min(1, kelly / 30); // Normalize to 30% max
    return `rgba(34, 197, 94, ${0.2 + intensity * 0.6})`;
  };

  return (
    <div className="sensitivity-heatmap">
      <div className="heatmap-container">
        {/* Column Headers */}
        <div className="heatmap-row header">
          <div className="heatmap-cell corner">
            <span className="axis-label-y">Win Rate</span>
            <span className="axis-label-x">Payoff</span>
          </div>
          {grid[0].map((cell, i) => (
            <div key={i} className={`heatmap-cell header ${cell.payoffDelta === 0 ? 'current' : ''}`}>
              {cell.payoffDelta > 0 ? '+' : ''}{cell.payoffDelta}%
            </div>
          ))}
        </div>

        {/* Data Rows */}
        {grid.map((row, i) => (
          <div key={i} className="heatmap-row">
            <div className={`heatmap-cell row-header ${row[0].winRateDelta === 0 ? 'current' : ''}`}>
              {row[0].winRateDelta > 0 ? '+' : ''}{row[0].winRateDelta}%
            </div>
            {row.map((cell, j) => (
              <div
                key={j}
                className={`heatmap-cell data ${cell.winRateDelta === 0 && cell.payoffDelta === 0 ? 'current' : ''}`}
                style={{ background: getColor(cell.kelly, cell.hasEdge) }}
                title={`Win Rate: ${currentWinRate + cell.winRateDelta}%\nKelly: ${cell.kelly.toFixed(1)}%\nEV: ${cell.ev.toFixed(2)}%`}
              >
                <span className="cell-kelly">{cell.kelly.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="heatmap-legend">
        <span className="legend-item">
          <span className="legend-color" style={{ background: 'rgba(239, 68, 68, 0.6)' }} />
          No Edge
        </span>
        <span className="legend-item">
          <span className="legend-color" style={{ background: 'rgba(34, 197, 94, 0.3)' }} />
          Weak Edge
        </span>
        <span className="legend-item">
          <span className="legend-color" style={{ background: 'rgba(34, 197, 94, 0.8)' }} />
          Strong Edge
        </span>
        <span className="legend-item current-marker">
          <span className="legend-box" />
          Current
        </span>
      </div>
    </div>
  );
}

export default PositionSizerPanel;
