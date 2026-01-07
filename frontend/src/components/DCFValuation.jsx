import React, { useState, useEffect, useCallback } from 'react';
import { dcfAPI } from '../services/api';
import './DCFValuation.css';

/**
 * Professional DCF Valuation Component - PE/Hedge Fund Grade
 *
 * Features:
 * - Full control over base financials and assumptions
 * - Editable scenario probabilities
 * - Multi-stage growth model visualization
 * - Bull/Base/Bear scenario comparison (football field style)
 * - Sensitivity analysis matrix with CUSTOM INTERVALS
 * - Reverse DCF ("What's Priced In?")
 * - Tornado chart for key driver analysis
 * - Break-even analysis
 * - Sanity checks and warnings
 * - Implicit model assumptions disclosure
 */
export function DCFValuation({ symbol, currentPrice, sharesOutstanding }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('valuation');
  const [sensitivityData, setSensitivityData] = useState(null);
  const [sensitivityLoading, setSensitivityLoading] = useState(false);
  const [showImplicitAssumptions, setShowImplicitAssumptions] = useState(false);

  // NEW: Reverse DCF state
  const [reverseData, setReverseData] = useState(null);
  const [reverseLoading, setReverseLoading] = useState(false);

  // NEW: Tornado chart state
  const [tornadoData, setTornadoData] = useState(null);
  const [tornadoLoading, setTornadoLoading] = useState(false);

  // NEW: Projections table state
  const [showProjections, setShowProjections] = useState(false);

  // Base financials (actuals - revenue is the primary driver)
  const [baseFinancials, setBaseFinancials] = useState({
    revenue: null,
    netDebt: null
  });

  // Revenue growth assumptions (multi-stage)
  const [growthAssumptions, setGrowthAssumptions] = useState({
    stage1: 0.10,       // Years 1-3
    stage2: 0.08,       // Years 4-7
    stage3: 0.05,       // Years 8-10
    terminal: 0.025     // Perpetuity
  });

  // Margin-based assumptions (Excel-style)
  const [marginAssumptions, setMarginAssumptions] = useState({
    ebitdaMargin: 0.20,           // Current EBITDA margin
    targetEbitdaMargin: 0.25,     // Target EBITDA margin
    capexPctRevenue: 0.05,        // CapEx as % of revenue
    daPctRevenue: 0.04,           // D&A as % of revenue
    nwcPctRevenueChange: 0.10,    // NWC change as % of revenue change
    taxRate: 0.21,                // Corporate tax rate
    marginImprovementYears: 5     // Years to reach target margin
  });

  // Discount rate & terminal
  const [discountAssumptions, setDiscountAssumptions] = useState({
    wacc: 0.10,
    exitMultiple: 12
  });

  // Editable scenario probabilities
  const [scenarioWeights, setScenarioWeights] = useState({
    bull: 25,
    base: 50,
    bear: 25
  });

  const [isCustom, setIsCustom] = useState(false);

  // Sensitivity configuration - NOW WITH CUSTOM INTERVALS
  const [sensitivityConfig, setSensitivityConfig] = useState({
    rowVariable: 'wacc',
    colVariable: 'growthStage1',
    // Custom interval mode
    useCustomIntervals: false,
    rowMin: 0.06,
    rowMax: 0.14,
    rowStep: 0.01,
    colMin: 0.00,
    colMax: 0.20,
    colStep: 0.02,
    // Legacy mode (deltas from base)
    rowSteps: [-0.02, -0.01, 0, 0.01, 0.02],
    colSteps: [-0.04, -0.02, 0, 0.02, 0.04]
  });

  const fetchDCF = useCallback(async (overrides = {}) => {
    setLoading(true);
    setError(null);
    try {
      // Convert scenario weights to decimals
      const weightOverrides = {
        scenarioWeights: {
          bull: scenarioWeights.bull / 100,
          base: scenarioWeights.base / 100,
          bear: scenarioWeights.bear / 100
        }
      };

      const params = {
        ...overrides,
        ...weightOverrides,
        currentPrice: currentPrice || overrides.currentPrice,
        sharesOutstanding: sharesOutstanding || overrides.sharesOutstanding
      };

      const response = Object.keys(overrides).length > 0
        ? await dcfAPI.calculateCustom(symbol, params)
        : await dcfAPI.getValuation(symbol, currentPrice, sharesOutstanding);

      if (response.data.success) {
        setData(response.data);
        // Initialize values from API response on first load
        if (!isCustom && response.data.assumptions) {
          const a = response.data.assumptions;
          // Base financials
          setBaseFinancials({
            revenue: a.revenue,
            netDebt: a.netDebt
          });
          // Growth assumptions
          setGrowthAssumptions({
            stage1: a.growth.stage1,
            stage2: a.growth.stage2,
            stage3: a.growth.stage3,
            terminal: a.growth.terminal
          });
          // Margin assumptions (from new margins object)
          if (a.margins) {
            setMarginAssumptions({
              ebitdaMargin: a.margins.ebitdaMargin,
              targetEbitdaMargin: a.margins.targetEbitdaMargin,
              capexPctRevenue: a.margins.capexPctRevenue,
              daPctRevenue: a.margins.daPctRevenue,
              nwcPctRevenueChange: a.margins.nwcPctRevenueChange,
              taxRate: a.margins.taxRate,
              marginImprovementYears: a.margins.marginImprovementYears
            });
          }
          // Discount assumptions
          setDiscountAssumptions({
            wacc: a.wacc,
            exitMultiple: a.exitMultiple
          });
          // Scenario weights
          if (a.scenarioWeights) {
            setScenarioWeights({
              bull: Math.round(a.scenarioWeights.bull * 100),
              base: Math.round(a.scenarioWeights.base * 100),
              bear: Math.round(a.scenarioWeights.bear * 100)
            });
          }
        }
      } else {
        setError(response.data.errors?.join(', ') || response.data.error || 'Calculation failed');
      }
    } catch (err) {
      console.error('Error fetching DCF:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load DCF');
    } finally {
      setLoading(false);
    }
  }, [symbol, currentPrice, sharesOutstanding, isCustom, scenarioWeights]);

  useEffect(() => {
    fetchDCF();
    // Also fetch reverse DCF data on load
    fetchReverseDCF();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // NEW: Fetch reverse DCF data ("What's Priced In?")
  const fetchReverseDCF = useCallback(async () => {
    setReverseLoading(true);
    try {
      const response = await dcfAPI.getReverse(symbol);
      if (response.data.success) {
        setReverseData(response.data);
      }
    } catch (err) {
      console.error('Reverse DCF error:', err);
    } finally {
      setReverseLoading(false);
    }
  }, [symbol]);

  // NEW: Fetch tornado chart data
  const fetchTornadoData = useCallback(async () => {
    setTornadoLoading(true);
    try {
      const response = await dcfAPI.getTornado(symbol, 20); // ±20% variation
      if (response.data.success) {
        setTornadoData(response.data);
      }
    } catch (err) {
      console.error('Tornado chart error:', err);
    } finally {
      setTornadoLoading(false);
    }
  }, [symbol]);

  const handleBaseFinancialChange = (key, value) => {
    setBaseFinancials(prev => ({ ...prev, [key]: value }));
    setIsCustom(true);
  };

  const handleGrowthChange = (key, value) => {
    setGrowthAssumptions(prev => ({ ...prev, [key]: value }));
    setIsCustom(true);
  };

  const handleMarginChange = (key, value) => {
    setMarginAssumptions(prev => ({ ...prev, [key]: value }));
    setIsCustom(true);
  };

  const handleDiscountChange = (key, value) => {
    setDiscountAssumptions(prev => ({ ...prev, [key]: value }));
    setIsCustom(true);
  };

  const handleWeightChange = (scenario, value) => {
    const newWeights = { ...scenarioWeights, [scenario]: value };
    // Auto-adjust to maintain 100%
    const total = newWeights.bull + newWeights.base + newWeights.bear;
    if (total !== 100) {
      const diff = 100 - total;
      if (scenario === 'bull') {
        newWeights.base += diff;
      } else if (scenario === 'bear') {
        newWeights.base += diff;
      } else {
        newWeights.bear += diff;
      }
    }
    setScenarioWeights(newWeights);
    setIsCustom(true);
  };

  const recalculate = () => {
    const overrides = {
      // Growth assumptions
      growthStage1: growthAssumptions.stage1,
      growthStage2: growthAssumptions.stage2,
      growthStage3: growthAssumptions.stage3,
      terminalGrowth: growthAssumptions.terminal,
      // Margin assumptions
      ebitdaMargin: marginAssumptions.ebitdaMargin,
      targetEbitdaMargin: marginAssumptions.targetEbitdaMargin,
      capexPctRevenue: marginAssumptions.capexPctRevenue,
      daPctRevenue: marginAssumptions.daPctRevenue,
      nwcPctRevenueChange: marginAssumptions.nwcPctRevenueChange,
      taxRate: marginAssumptions.taxRate,
      marginImprovementYears: marginAssumptions.marginImprovementYears,
      // Discount assumptions
      wacc: discountAssumptions.wacc,
      exitMultiple: discountAssumptions.exitMultiple,
      // Base financials
      revenue: baseFinancials.revenue,
      netDebt: baseFinancials.netDebt,
      // Scenario weights
      scenarioWeights: {
        bull: scenarioWeights.bull / 100,
        base: scenarioWeights.base / 100,
        bear: scenarioWeights.bear / 100
      }
    };
    fetchDCF(overrides);
  };

  const resetAssumptions = () => {
    setIsCustom(false);
    fetchDCF();
  };

  // Get value for sensitivity analysis variable
  const getSensitivityValue = (varName) => {
    switch (varName) {
      case 'wacc': return discountAssumptions.wacc;
      case 'growthStage1': return growthAssumptions.stage1;
      case 'growthStage2': return growthAssumptions.stage2;
      case 'growthStage3': return growthAssumptions.stage3;
      case 'terminalGrowth': return growthAssumptions.terminal;
      case 'exitMultiple': return discountAssumptions.exitMultiple;
      case 'ebitdaMargin': return marginAssumptions.ebitdaMargin;
      case 'targetEbitdaMargin': return marginAssumptions.targetEbitdaMargin;
      default: return 0;
    }
  };

  // Generate sensitivity matrix - NOW WITH CUSTOM INTERVALS
  const generateSensitivityMatrix = useCallback(async () => {
    if (!data) return;

    setSensitivityLoading(true);
    try {
      const { rowVariable, colVariable, useCustomIntervals, rowMin, rowMax, rowStep, colMin, colMax, colStep, rowSteps, colSteps } = sensitivityConfig;
      const baseRowValue = getSensitivityValue(rowVariable);
      const baseColValue = getSensitivityValue(colVariable);

      if (useCustomIntervals) {
        // NEW: Use API with custom intervals
        const response = await dcfAPI.getSensitivity(symbol, {
          rowVariable,
          colVariable,
          rowMin,
          rowMax,
          rowStep,
          colMin,
          colMax,
          colStep
        });

        if (response.data.success && response.data.sensitivity) {
          const sens = response.data.sensitivity;
          setSensitivityData({
            rowVariable: sens.rowVariable,
            colVariable: sens.colVariable,
            rowValues: sens.rowValues,
            colValues: sens.colValues,
            matrix: sens.matrix,
            baseRowValue,
            baseColValue,
            gridSize: sens.gridSize
          });
        }
      } else {
        // Legacy mode: calculate locally with deltas
        const matrix = [];

        for (const rowDelta of rowSteps) {
          const row = [];
          for (const colDelta of colSteps) {
            const params = {
              growthStage1: growthAssumptions.stage1,
              growthStage2: growthAssumptions.stage2,
              growthStage3: growthAssumptions.stage3,
              terminalGrowth: growthAssumptions.terminal,
              wacc: discountAssumptions.wacc,
              exitMultiple: discountAssumptions.exitMultiple,
              ebitdaMargin: marginAssumptions.ebitdaMargin,
              targetEbitdaMargin: marginAssumptions.targetEbitdaMargin,
              revenue: baseFinancials.revenue,
              [rowVariable]: baseRowValue + rowDelta,
              [colVariable]: baseColValue + colDelta
            };

            try {
              const response = await dcfAPI.calculateCustom(symbol, params);
              row.push(response.data.success ? response.data.intrinsicValue : null);
            } catch {
              row.push(null);
            }
          }
          matrix.push(row);
        }

        setSensitivityData({
          rowVariable,
          colVariable,
          rowValues: rowSteps.map(d => baseRowValue + d),
          colValues: colSteps.map(d => baseColValue + d),
          matrix,
          baseRowValue,
          baseColValue
        });
      }
    } catch (err) {
      console.error('Sensitivity analysis error:', err);
    } finally {
      setSensitivityLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, growthAssumptions, discountAssumptions, marginAssumptions, baseFinancials, sensitivityConfig, symbol]);

  // Calculate grid size preview for custom intervals
  const getGridSizePreview = () => {
    if (!sensitivityConfig.useCustomIntervals) return '5x5';
    const rows = Math.floor((sensitivityConfig.rowMax - sensitivityConfig.rowMin) / sensitivityConfig.rowStep) + 1;
    const cols = Math.floor((sensitivityConfig.colMax - sensitivityConfig.colMin) / sensitivityConfig.colStep) + 1;
    return `${rows}x${cols}`;
  };

  const gridSize = getGridSizePreview();
  const gridCells = gridSize.split('x').reduce((a, b) => parseInt(a) * parseInt(b), 1);

  // Consistent currency formatting - always show unit (M or B)
  // eslint-disable-next-line no-unused-vars
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '—';
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (absValue >= 1e9) {
      return `${sign}$${(absValue / 1e9).toFixed(1)}B`;
    }
    if (absValue >= 1e6) {
      return `${sign}$${(absValue / 1e6).toFixed(0)}M`;
    }
    return `${sign}$${absValue.toFixed(0)}`;
  };

  // Format for editable inputs (raw billions)
  const formatBillions = (value) => {
    if (value === null || value === undefined) return '';
    return (value / 1e9).toFixed(2);
  };

  const parseBillions = (str) => {
    const num = parseFloat(str);
    return isNaN(num) ? null : num * 1e9;
  };

  const formatPercent = (value, decimals = 1) => {
    if (value === null || value === undefined) return '—';
    return `${(value * 100).toFixed(decimals)}%`;
  };

  const variableLabels = {
    growthStage1: 'Rev Growth (Yr 1-3)',
    growthStage2: 'Rev Growth (Yr 4-7)',
    growthStage3: 'Rev Growth (Yr 8-10)',
    terminalGrowth: 'Terminal Growth',
    wacc: 'WACC',
    exitMultiple: 'Exit Multiple',
    ebitdaMargin: 'EBITDA Margin',
    targetEbitdaMargin: 'Target EBITDA Margin'
  };

  if (loading && !data) {
    return (
      <div className="dcf-valuation">
        <div className="dcf-loading">
          <div className="loading-spinner"></div>
          <span>Calculating DCF valuation...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dcf-valuation">
        <div className="dcf-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { intrinsicValue, scenarios, sanityChecks, buyTargets, warnings } = data;
  const upside = data.upside;

  // Calculate range for football field
  const rangeMin = scenarios.bear.intrinsicValuePerShare * 0.9;
  const rangeMax = scenarios.bull.intrinsicValuePerShare * 1.1;
  const rangeSpan = rangeMax - rangeMin;

  const getPosition = (value) => {
    return ((value - rangeMin) / rangeSpan) * 100;
  };

  return (
    <div className="dcf-valuation">
      {/* Header */}
      <div className="dcf-header">
        <div className="dcf-title">
          <h2>DCF Valuation</h2>
          {isCustom && <span className="custom-badge">Custom</span>}
          {loading && <span className="recalc-indicator">Recalculating...</span>}
        </div>
        <div className="dcf-tabs">
          <button
            className={`dcf-tab ${activeTab === 'valuation' ? 'active' : ''}`}
            onClick={() => setActiveTab('valuation')}
          >
            Valuation
          </button>
          <button
            className={`dcf-tab ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('analysis');
              if (!tornadoData) fetchTornadoData();
            }}
          >
            Analysis
          </button>
          <button
            className={`dcf-tab ${activeTab === 'sensitivity' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('sensitivity');
              if (!sensitivityData) generateSensitivityMatrix();
            }}
          >
            Sensitivity
          </button>
        </div>
      </div>

      {/* Assumptions Panel - Excel-style Revenue-Driven Model */}
      <div className="assumptions-panel">
        <div className="assumptions-header">
          <h3>Model Inputs</h3>
          <span className={`health-badge ${sanityChecks.overallHealth}`}>
            {sanityChecks.overallHealth === 'good' ? '✓ Reliable' :
             sanityChecks.overallHealth === 'caution' ? '⚠ Caution' : '⚠ Review'}
          </span>
        </div>

        <div className="assumptions-grid-top">
          {/* Base Financials - Revenue is the driver */}
          <div className="assumption-card">
            <h4>Base Year <span className="unit-hint">(in $B)</span></h4>
            <div className="assumption-item editable">
              <label>LTM Revenue</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="1"
                  value={formatBillions(baseFinancials.revenue)}
                  onChange={(e) => handleBaseFinancialChange('revenue', parseBillions(e.target.value))}
                />
                <span className="unit">B</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Net Debt</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.1"
                  value={formatBillions(baseFinancials.netDebt)}
                  onChange={(e) => handleBaseFinancialChange('netDebt', parseBillions(e.target.value))}
                />
                <span className="unit">B</span>
              </div>
            </div>
            <div className="assumption-item">
              <label>Hist. Growth (3Y)</label>
              <span className="value-sm">{formatPercent(data.assumptions.historicalGrowth?.threeYearCAGR)}</span>
            </div>
          </div>

          {/* Revenue Growth Rates */}
          <div className="assumption-card">
            <h4>Revenue Growth</h4>
            <div className="assumption-item editable">
              <label>Stage 1 (Yr 1-3)</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(growthAssumptions.stage1 * 100).toFixed(1)}
                  onChange={(e) => handleGrowthChange('stage1', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Stage 2 (Yr 4-7)</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(growthAssumptions.stage2 * 100).toFixed(1)}
                  onChange={(e) => handleGrowthChange('stage2', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Stage 3 (Yr 8-10)</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(growthAssumptions.stage3 * 100).toFixed(1)}
                  onChange={(e) => handleGrowthChange('stage3', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Terminal</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.25"
                  max="3"
                  value={(growthAssumptions.terminal * 100).toFixed(2)}
                  onChange={(e) => handleGrowthChange('terminal', Math.min(parseFloat(e.target.value) / 100, 0.03))}
                />
                <span className="unit">%</span>
              </div>
            </div>
          </div>

          {/* Margin Assumptions - Excel-style */}
          <div className="assumption-card">
            <h4>Margins & CapEx</h4>
            <div className="assumption-item editable">
              <label>EBITDA Margin</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(marginAssumptions.ebitdaMargin * 100).toFixed(1)}
                  onChange={(e) => handleMarginChange('ebitdaMargin', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Target Margin</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(marginAssumptions.targetEbitdaMargin * 100).toFixed(1)}
                  onChange={(e) => handleMarginChange('targetEbitdaMargin', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>CapEx % Rev</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(marginAssumptions.capexPctRevenue * 100).toFixed(1)}
                  onChange={(e) => handleMarginChange('capexPctRevenue', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>D&A % Rev</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={(marginAssumptions.daPctRevenue * 100).toFixed(1)}
                  onChange={(e) => handleMarginChange('daPctRevenue', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
          </div>

          {/* Discount Rate & Terminal */}
          <div className="assumption-card">
            <h4>Discount & Terminal</h4>
            <div className="assumption-item editable">
              <label>WACC</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.25"
                  value={(discountAssumptions.wacc * 100).toFixed(1)}
                  onChange={(e) => handleDiscountChange('wacc', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Exit EV/EBITDA</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="0.5"
                  value={discountAssumptions.exitMultiple.toFixed(1)}
                  onChange={(e) => handleDiscountChange('exitMultiple', parseFloat(e.target.value))}
                />
                <span className="unit">x</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Tax Rate</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="1"
                  value={(marginAssumptions.taxRate * 100).toFixed(0)}
                  onChange={(e) => handleMarginChange('taxRate', parseFloat(e.target.value) / 100)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item">
              <label>Industry EV/EBITDA</label>
              <span className="value-sm">{sanityChecks.checks.industryMultiples?.evEbitda?.toFixed(1) || '—'}x</span>
            </div>
          </div>

          {/* Scenario Probabilities */}
          <div className="assumption-card">
            <h4>Scenario Weights</h4>
            <div className="assumption-item editable">
              <label>Bull Case</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={scenarioWeights.bull}
                  onChange={(e) => handleWeightChange('bull', parseInt(e.target.value) || 0)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Base Case</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={scenarioWeights.base}
                  onChange={(e) => handleWeightChange('base', parseInt(e.target.value) || 0)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item editable">
              <label>Bear Case</label>
              <div className="input-group compact">
                <input
                  type="number"
                  step="5"
                  min="0"
                  max="100"
                  value={scenarioWeights.bear}
                  onChange={(e) => handleWeightChange('bear', parseInt(e.target.value) || 0)}
                />
                <span className="unit">%</span>
              </div>
            </div>
            <div className="assumption-item">
              <label>Total</label>
              <span className={`value-sm ${scenarioWeights.bull + scenarioWeights.base + scenarioWeights.bear !== 100 ? 'warning' : ''}`}>
                {scenarioWeights.bull + scenarioWeights.base + scenarioWeights.bear}%
              </span>
            </div>
          </div>
        </div>

        <div className="assumptions-actions">
          <button className="btn-recalculate" onClick={recalculate} disabled={loading}>
            {loading ? 'Calculating...' : 'Recalculate'}
          </button>
          {isCustom && (
            <button className="btn-reset" onClick={resetAssumptions}>
              Reset to Default
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'valuation' && (
        <>
          {/* Main Valuation Summary */}
          <div className="valuation-summary">
            <div className="value-box primary">
              <span className="label">Intrinsic Value</span>
              <span className="value">${intrinsicValue?.toFixed(2) || '—'}</span>
            </div>
            <div className="value-box">
              <span className="label">Current Price</span>
              <span className="value">${data.currentPrice?.toFixed(2) || '—'}</span>
            </div>
            <div className={`value-box ${upside >= 0 ? 'positive' : 'negative'}`}>
              <span className="label">Upside</span>
              <span className="value">
                {upside !== null ? `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%` : '—'}
              </span>
            </div>
          </div>

          {/* NEW: Reverse DCF - "What's Priced In?" */}
          {reverseData && (
            <div className="reverse-dcf-section">
              <h3>What's Priced In?</h3>
              <p className="reverse-dcf-subtitle">Market expectations implied by current price</p>
              <div className="reverse-dcf-grid">
                {reverseData.impliedGrowth && (
                  <div className="implied-metric">
                    <div className="implied-header">
                      <span className="implied-label">Implied Growth (Yr 1-3)</span>
                      <span className={`implied-gap ${reverseData.impliedGrowth.gapPct > 0 ? 'negative' : 'positive'}`}>
                        {reverseData.impliedGrowth.gapPct > 0 ? '+' : ''}{reverseData.impliedGrowth.gapPct?.toFixed(1)}pp vs your estimate
                      </span>
                    </div>
                    <div className="implied-comparison">
                      <div className="implied-value">
                        <span className="value-large">{reverseData.impliedGrowth.valuePct?.toFixed(1)}%</span>
                        <span className="value-note">Market expects</span>
                      </div>
                      <span className="vs-divider">vs</span>
                      <div className="implied-value">
                        <span className="value-large">{reverseData.impliedGrowth.baseValuePct?.toFixed(1)}%</span>
                        <span className="value-note">Your estimate</span>
                      </div>
                    </div>
                    <p className="implied-interpretation">{reverseData.impliedGrowth.interpretation}</p>
                  </div>
                )}
                {reverseData.impliedWACC && (
                  <div className="implied-metric">
                    <div className="implied-header">
                      <span className="implied-label">Implied WACC</span>
                      <span className={`implied-gap ${reverseData.impliedWACC.gapPct < 0 ? 'negative' : 'positive'}`}>
                        {reverseData.impliedWACC.gapPct > 0 ? '+' : ''}{(reverseData.impliedWACC.gapPct * 100)?.toFixed(0)}bps vs your estimate
                      </span>
                    </div>
                    <div className="implied-comparison">
                      <div className="implied-value">
                        <span className="value-large">{reverseData.impliedWACC.valuePct?.toFixed(1)}%</span>
                        <span className="value-note">Market expects</span>
                      </div>
                      <span className="vs-divider">vs</span>
                      <div className="implied-value">
                        <span className="value-large">{reverseData.impliedWACC.baseValuePct?.toFixed(1)}%</span>
                        <span className="value-note">Your estimate</span>
                      </div>
                    </div>
                    <p className="implied-interpretation">{reverseData.impliedWACC.interpretation}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          {reverseLoading && (
            <div className="reverse-dcf-section loading">
              <div className="loading-spinner small"></div>
              <span>Calculating market-implied assumptions...</span>
            </div>
          )}

          {/* Football Field - Scenario Range */}
          <div className="scenario-range">
            <h3>Valuation Range</h3>
            <div className="range-container">
              <div className="range-bar">
                <div
                  className="range-fill"
                  style={{
                    left: `${getPosition(scenarios.bear.intrinsicValuePerShare)}%`,
                    width: `${getPosition(scenarios.bull.intrinsicValuePerShare) - getPosition(scenarios.bear.intrinsicValuePerShare)}%`
                  }}
                />
                <div
                  className="base-marker"
                  style={{ left: `${getPosition(scenarios.base.intrinsicValuePerShare)}%` }}
                  title={`Base: $${scenarios.base.intrinsicValuePerShare.toFixed(2)}`}
                />
                {data.currentPrice > 0 && (
                  <div
                    className="price-marker"
                    style={{ left: `${Math.min(Math.max(getPosition(data.currentPrice), 0), 100)}%` }}
                    title={`Current: $${data.currentPrice.toFixed(2)}`}
                  >
                    <div className="price-flag">Current</div>
                  </div>
                )}
              </div>
              <div className="range-labels">
                <div className="range-label bear">
                  <span className="scenario-name">Bear ({scenarioWeights.bear}%)</span>
                  <span className="scenario-value">${scenarios.bear.intrinsicValuePerShare.toFixed(0)}</span>
                </div>
                <div className="range-label base">
                  <span className="scenario-name">Base ({scenarioWeights.base}%)</span>
                  <span className="scenario-value">${scenarios.base.intrinsicValuePerShare.toFixed(0)}</span>
                </div>
                <div className="range-label bull">
                  <span className="scenario-name">Bull ({scenarioWeights.bull}%)</span>
                  <span className="scenario-value">${scenarios.bull.intrinsicValuePerShare.toFixed(0)}</span>
                </div>
              </div>
            </div>
            <div className="weighted-value">
              Weighted Value: <strong>${scenarios.weighted.value.toFixed(2)}</strong>
              <span className="weighted-note">({scenarioWeights.bear}% × ${scenarios.bear.intrinsicValuePerShare.toFixed(0)} + {scenarioWeights.base}% × ${scenarios.base.intrinsicValuePerShare.toFixed(0)} + {scenarioWeights.bull}% × ${scenarios.bull.intrinsicValuePerShare.toFixed(0)})</span>
            </div>
          </div>

          {/* Buy Targets */}
          <div className="buy-targets">
            <h3>Buy Targets (Margin of Safety)</h3>
            <div className="targets-grid">
              <div className={`target ${data.currentPrice <= buyTargets.marginOfSafety25 ? 'active' : ''}`}>
                <span className="target-label">25% MoS</span>
                <span className="target-value">${buyTargets.marginOfSafety25.toFixed(2)}</span>
                <span className={`target-status ${data.currentPrice <= buyTargets.marginOfSafety25 ? 'buy' : 'wait'}`}>
                  {data.currentPrice <= buyTargets.marginOfSafety25 ? '✓ BUY' : 'Wait'}
                </span>
              </div>
              <div className={`target ${data.currentPrice <= buyTargets.marginOfSafety33 ? 'active' : ''}`}>
                <span className="target-label">33% MoS</span>
                <span className="target-value">${buyTargets.marginOfSafety33.toFixed(2)}</span>
                <span className={`target-status ${data.currentPrice <= buyTargets.marginOfSafety33 ? 'buy' : 'wait'}`}>
                  {data.currentPrice <= buyTargets.marginOfSafety33 ? '✓ BUY' : 'Wait'}
                </span>
              </div>
              <div className={`target ${data.currentPrice <= buyTargets.marginOfSafety50 ? 'active' : ''}`}>
                <span className="target-label">50% MoS</span>
                <span className="target-value">${buyTargets.marginOfSafety50.toFixed(2)}</span>
                <span className={`target-status ${data.currentPrice <= buyTargets.marginOfSafety50 ? 'strong-buy' : 'wait'}`}>
                  {data.currentPrice <= buyTargets.marginOfSafety50 ? '✓ STRONG' : 'Wait'}
                </span>
              </div>
            </div>
          </div>

          {/* Sanity Checks */}
          <div className="sanity-checks">
            <h3>Model Sanity Checks</h3>
            <div className="checks-grid">
              <div className="check">
                <span className="check-label">Terminal Value %</span>
                <span className={`check-value ${sanityChecks.checks.terminalPct > 75 ? 'warning' : ''}`}>
                  {sanityChecks.checks.terminalPct?.toFixed(0)}%
                </span>
                <span className="check-note">{sanityChecks.checks.terminalPct > 75 ? 'High' : sanityChecks.checks.terminalPct > 60 ? 'Moderate' : 'Good'}</span>
              </div>
              <div className="check">
                <span className="check-label">Implied EV/EBITDA</span>
                <span className="check-value">
                  {sanityChecks.checks.impliedMultiples?.evEbitda?.toFixed(1) || '—'}x
                </span>
                <span className="check-note">
                  Industry: {sanityChecks.checks.industryMultiples?.evEbitda?.toFixed(1) || '—'}x
                </span>
              </div>
              <div className="check">
                <span className="check-label">TV Method Divergence</span>
                <span className={`check-value ${sanityChecks.checks.terminalDivergence > 30 ? 'warning' : ''}`}>
                  {sanityChecks.checks.terminalDivergence?.toFixed(0)}%
                </span>
                <span className="check-note">{sanityChecks.checks.terminalDivergence > 30 ? 'Review' : 'OK'}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="warnings">
              <h3>⚠️ Warnings ({warnings.length})</h3>
              <ul>
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Implicit Model Assumptions - Collapsible */}
          <div className="implicit-assumptions">
            <button
              className="toggle-implicit"
              onClick={() => setShowImplicitAssumptions(!showImplicitAssumptions)}
            >
              {showImplicitAssumptions ? '▼' : '▶'} Implicit Model Assumptions
            </button>
            {showImplicitAssumptions && (
              <div className="implicit-content">
                <div className="implicit-grid">
                  <div className="implicit-item">
                    <span className="implicit-label">Risk-Free Rate</span>
                    <span className="implicit-value">{formatPercent(data.assumptions.riskFreeRate, 2)}</span>
                    <span className="implicit-note">10-Year Treasury</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Equity Risk Premium</span>
                    <span className="implicit-value">{formatPercent(data.assumptions.equityRiskPremium, 1)}</span>
                    <span className="implicit-note">Historical average</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Beta</span>
                    <span className="implicit-value">{data.assumptions.beta?.toFixed(2) || '—'}</span>
                    <span className="implicit-note">Industry median</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Cost of Equity</span>
                    <span className="implicit-value">{formatPercent(data.assumptions.costOfEquity, 1)}</span>
                    <span className="implicit-note">CAPM: Rf + β × ERP</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Tax Rate</span>
                    <span className="implicit-value">21%</span>
                    <span className="implicit-note">US Corporate</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Debt Spread</span>
                    <span className="implicit-value">2.0%</span>
                    <span className="implicit-note">Over risk-free</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Capital Structure</span>
                    <span className="implicit-value">80% / 20%</span>
                    <span className="implicit-note">Equity / Debt</span>
                  </div>
                  <div className="implicit-item">
                    <span className="implicit-label">Projection Period</span>
                    <span className="implicit-value">10 years</span>
                    <span className="implicit-note">3-stage model</span>
                  </div>
                </div>
                <p className="implicit-disclaimer">
                  Revenue-driven model: Revenue → EBITDA (via margin) → EBIT → NOPAT → FCF.
                  FCF = NOPAT + D&A - CapEx - ΔNWC. 3-stage growth with margin improvement over specified years.
                  Terminal value uses average of Gordon Growth Model and Exit Multiple (if within 20% divergence).
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* NEW: Analysis Tab - Tornado Chart & Key Drivers */}
      {activeTab === 'analysis' && (
        <div className="analysis-section">
          <div className="tornado-section">
            <div className="tornado-header">
              <h3>Key Value Drivers</h3>
              <p className="tornado-subtitle">Which assumptions have the biggest impact on valuation?</p>
            </div>

            {tornadoLoading && (
              <div className="tornado-loading">
                <div className="loading-spinner"></div>
                <span>Calculating sensitivity for all variables...</span>
              </div>
            )}

            {tornadoData && !tornadoLoading && (
              <>
                <div className="top-drivers">
                  <span className="drivers-label">Top 3 Drivers:</span>
                  {tornadoData.topDrivers?.map((driver, i) => (
                    <span key={i} className="driver-badge">{i + 1}. {driver}</span>
                  ))}
                </div>

                <div className="tornado-chart">
                  {tornadoData.variables?.map((v, i) => {
                    const maxRange = Math.max(...tornadoData.variables.map(x => x.impact));
                    const barWidth = (v.impact / maxRange) * 100;
                    const baseValue = tornadoData.baseIntrinsicValue;
                    const lowPct = ((v.lowValue - baseValue) / baseValue) * 100;
                    const highPct = ((v.highValue - baseValue) / baseValue) * 100;

                    return (
                      <div key={v.variable} className="tornado-row">
                        <div className="tornado-label">
                          <span className="var-name">{v.label}</span>
                          <span className="var-base">
                            Base: {v.variable === 'exitMultiple' ? `${v.baseValue?.toFixed(1)}x` : formatPercent(v.baseValue)}
                          </span>
                        </div>
                        <div className="tornado-bar-container">
                          <div className="tornado-bar-wrapper">
                            <div
                              className="tornado-bar low"
                              style={{ width: `${Math.abs(lowPct) / (Math.abs(lowPct) + Math.abs(highPct)) * barWidth}%` }}
                              title={`Low: $${v.lowValue?.toFixed(0)} (${lowPct >= 0 ? '+' : ''}${lowPct.toFixed(1)}%)`}
                            >
                              <span className="bar-value">${v.lowValue?.toFixed(0)}</span>
                            </div>
                            <div className="tornado-center-line" style={{ left: `${Math.abs(lowPct) / (Math.abs(lowPct) + Math.abs(highPct)) * barWidth}%` }}></div>
                            <div
                              className="tornado-bar high"
                              style={{ width: `${Math.abs(highPct) / (Math.abs(lowPct) + Math.abs(highPct)) * barWidth}%` }}
                              title={`High: $${v.highValue?.toFixed(0)} (${highPct >= 0 ? '+' : ''}${highPct.toFixed(1)}%)`}
                            >
                              <span className="bar-value">${v.highValue?.toFixed(0)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="tornado-range">
                          <span className="range-value">{v.rangePct?.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="tornado-legend">
                  <span className="legend-note">
                    Bars show value range when each variable is changed ±{tornadoData.variationPct}% from base.
                    Base intrinsic value: ${tornadoData.baseIntrinsicValue?.toFixed(2)}
                  </span>
                </div>

                <button className="btn-refresh" onClick={fetchTornadoData}>
                  Refresh Analysis
                </button>
              </>
            )}
          </div>

          {/* Break-Even Summary */}
          {reverseData && (
            <div className="breakeven-summary">
              <h3>Break-Even Analysis</h3>
              <p className="breakeven-subtitle">What assumptions would make intrinsic value = current price?</p>
              <div className="breakeven-grid">
                {reverseData.impliedGrowth && (
                  <div className="breakeven-item">
                    <span className="breakeven-label">Break-even Growth</span>
                    <span className="breakeven-value">{reverseData.impliedGrowth.valuePct?.toFixed(1)}%</span>
                    <span className="breakeven-note">
                      You use {reverseData.impliedGrowth.baseValuePct?.toFixed(1)}%
                      ({reverseData.impliedGrowth.gapPct > 0 ? '+' : ''}{reverseData.impliedGrowth.gapPct?.toFixed(1)}pp gap)
                    </span>
                  </div>
                )}
                {reverseData.impliedWACC && (
                  <div className="breakeven-item">
                    <span className="breakeven-label">Break-even WACC</span>
                    <span className="breakeven-value">{reverseData.impliedWACC.valuePct?.toFixed(1)}%</span>
                    <span className="breakeven-note">
                      You use {reverseData.impliedWACC.baseValuePct?.toFixed(1)}%
                      ({reverseData.impliedWACC.gapPct > 0 ? '+' : ''}{(reverseData.impliedWACC.gapPct * 100)?.toFixed(0)}bps gap)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sensitivity Tab */}
      {activeTab === 'sensitivity' && (
        <div className="sensitivity-section">
          <div className="sensitivity-controls">
            <h3>Sensitivity Analysis</h3>
            <div className="sensitivity-config">
              <div className="config-group">
                <label>Row Variable</label>
                <select
                  value={sensitivityConfig.rowVariable}
                  onChange={(e) => setSensitivityConfig(prev => ({ ...prev, rowVariable: e.target.value }))}
                >
                  <option value="wacc">WACC</option>
                  <option value="growthStage1">Rev Growth (Yr 1-3)</option>
                  <option value="growthStage2">Rev Growth (Yr 4-7)</option>
                  <option value="growthStage3">Rev Growth (Yr 8-10)</option>
                  <option value="terminalGrowth">Terminal Growth</option>
                  <option value="exitMultiple">Exit Multiple</option>
                  <option value="ebitdaMargin">EBITDA Margin</option>
                  <option value="targetEbitdaMargin">Target Margin</option>
                </select>
              </div>
              <div className="config-group">
                <label>Column Variable</label>
                <select
                  value={sensitivityConfig.colVariable}
                  onChange={(e) => setSensitivityConfig(prev => ({ ...prev, colVariable: e.target.value }))}
                >
                  <option value="growthStage1">Rev Growth (Yr 1-3)</option>
                  <option value="wacc">WACC</option>
                  <option value="growthStage2">Rev Growth (Yr 4-7)</option>
                  <option value="growthStage3">Rev Growth (Yr 8-10)</option>
                  <option value="terminalGrowth">Terminal Growth</option>
                  <option value="exitMultiple">Exit Multiple</option>
                  <option value="ebitdaMargin">EBITDA Margin</option>
                  <option value="targetEbitdaMargin">Target Margin</option>
                </select>
              </div>
              <button
                className="btn-generate"
                onClick={generateSensitivityMatrix}
                disabled={sensitivityLoading}
              >
                {sensitivityLoading ? 'Generating...' : 'Generate Matrix'}
              </button>
            </div>

            {/* NEW: Custom Intervals Toggle */}
            <div className="custom-intervals-section">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={sensitivityConfig.useCustomIntervals}
                  onChange={(e) => setSensitivityConfig(prev => ({ ...prev, useCustomIntervals: e.target.checked }))}
                />
                <span>Use Custom Intervals</span>
              </label>

              {sensitivityConfig.useCustomIntervals && (
                <div className="custom-intervals-grid">
                  <div className="interval-row">
                    <span className="interval-label">Row ({variableLabels[sensitivityConfig.rowVariable]}):</span>
                    <div className="interval-inputs">
                      <label>
                        Min
                        <input
                          type="number"
                          step="0.01"
                          value={(sensitivityConfig.rowMin * 100).toFixed(1)}
                          onChange={(e) => setSensitivityConfig(prev => ({ ...prev, rowMin: parseFloat(e.target.value) / 100 }))}
                        />
                        <span className="unit">%</span>
                      </label>
                      <label>
                        Max
                        <input
                          type="number"
                          step="0.01"
                          value={(sensitivityConfig.rowMax * 100).toFixed(1)}
                          onChange={(e) => setSensitivityConfig(prev => ({ ...prev, rowMax: parseFloat(e.target.value) / 100 }))}
                        />
                        <span className="unit">%</span>
                      </label>
                      <label>
                        Step
                        <input
                          type="number"
                          step="0.1"
                          value={(sensitivityConfig.rowStep * 100).toFixed(1)}
                          onChange={(e) => setSensitivityConfig(prev => ({ ...prev, rowStep: parseFloat(e.target.value) / 100 }))}
                        />
                        <span className="unit">%</span>
                      </label>
                    </div>
                  </div>
                  <div className="interval-row">
                    <span className="interval-label">Column ({variableLabels[sensitivityConfig.colVariable]}):</span>
                    <div className="interval-inputs">
                      <label>
                        Min
                        <input
                          type="number"
                          step="0.01"
                          value={(sensitivityConfig.colMin * 100).toFixed(1)}
                          onChange={(e) => setSensitivityConfig(prev => ({ ...prev, colMin: parseFloat(e.target.value) / 100 }))}
                        />
                        <span className="unit">%</span>
                      </label>
                      <label>
                        Max
                        <input
                          type="number"
                          step="0.01"
                          value={(sensitivityConfig.colMax * 100).toFixed(1)}
                          onChange={(e) => setSensitivityConfig(prev => ({ ...prev, colMax: parseFloat(e.target.value) / 100 }))}
                        />
                        <span className="unit">%</span>
                      </label>
                      <label>
                        Step
                        <input
                          type="number"
                          step="0.1"
                          value={(sensitivityConfig.colStep * 100).toFixed(1)}
                          onChange={(e) => setSensitivityConfig(prev => ({ ...prev, colStep: parseFloat(e.target.value) / 100 }))}
                        />
                        <span className="unit">%</span>
                      </label>
                    </div>
                  </div>
                  <div className="grid-preview">
                    Grid Size: <strong>{gridSize}</strong> ({gridCells} calculations)
                    {gridCells > 200 && <span className="grid-warning"> - Large grid may be slow</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {sensitivityLoading && (
            <div className="sensitivity-loading">
              <div className="loading-spinner"></div>
              <span>Generating sensitivity matrix (25 calculations)...</span>
            </div>
          )}

          {sensitivityData && !sensitivityLoading && (
            <div className="sensitivity-matrix">
              <div className="matrix-header">
                <span className="matrix-title">
                  Intrinsic Value: {variableLabels[sensitivityData.rowVariable]} vs {variableLabels[sensitivityData.colVariable]}
                </span>
                <span className="current-price-note">Current: ${data.currentPrice?.toFixed(2)}</span>
              </div>
              <div className="matrix-table-container">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="corner-cell">
                        {variableLabels[sensitivityData.rowVariable]} ↓
                      </th>
                      {sensitivityData.colValues.map((val, i) => (
                        <th key={i} className={i === 2 ? 'base-col' : ''}>
                          {sensitivityData.colVariable === 'exitMultiple'
                            ? `${val.toFixed(1)}x`
                            : formatPercent(val)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensitivityData.matrix.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        <th className={rowIdx === 2 ? 'base-row' : ''}>
                          {sensitivityData.rowVariable === 'exitMultiple'
                            ? `${sensitivityData.rowValues[rowIdx].toFixed(1)}x`
                            : formatPercent(sensitivityData.rowValues[rowIdx])}
                        </th>
                        {row.map((value, colIdx) => {
                          const isBase = rowIdx === 2 && colIdx === 2;
                          // Use currentPrice if available, otherwise compare to base case (middle cell)
                          const baseValue = data.currentPrice > 0
                            ? data.currentPrice
                            : (sensitivityData.matrix[2]?.[2] || intrinsicValue);
                          const pctDiff = value && baseValue
                            ? ((value - baseValue) / baseValue) * 100
                            : 0;
                          const isSignificantUpside = pctDiff > 20;
                          const isModerateUpside = pctDiff > 0 && pctDiff <= 20;
                          const isModerateDownside = pctDiff < 0 && pctDiff >= -20;
                          const isSignificantDownside = pctDiff < -20;

                          const cellClass = [
                            isBase && 'base-cell',
                            !isBase && isSignificantUpside && 'strong-upside',
                            !isBase && isModerateUpside && 'moderate-upside',
                            !isBase && isModerateDownside && 'moderate-downside',
                            !isBase && isSignificantDownside && 'strong-downside'
                          ].filter(Boolean).join(' ');

                          return (
                            <td
                              key={colIdx}
                              className={cellClass}
                              title={value ? `${pctDiff >= 0 ? '+' : ''}${pctDiff.toFixed(0)}% vs current` : ''}
                            >
                              {value ? `$${value.toFixed(0)}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="matrix-legend">
                <span className="legend-item">
                  <span className="legend-color strong-upside"></span> &gt;20% upside
                </span>
                <span className="legend-item">
                  <span className="legend-color moderate-upside"></span> 0-20% upside
                </span>
                <span className="legend-item">
                  <span className="legend-color moderate-downside"></span> 0-20% downside
                </span>
                <span className="legend-item">
                  <span className="legend-color strong-downside"></span> &gt;20% downside
                </span>
                <span className="legend-item">
                  <span className="legend-color base"></span> Base case
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calculation Details */}
      <div className="calculation-meta">
        <span>Model: 3-Stage DCF with Gordon Growth + Exit Multiple Terminal</span>
        <span>Calculated: {new Date(data.calculatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

export default DCFValuation;
