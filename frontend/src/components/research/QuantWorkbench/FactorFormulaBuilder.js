// frontend/src/components/research/QuantWorkbench/FactorFormulaBuilder.js
// Build custom factor formulas from available metrics

import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, Check, Info, TrendingUp, TrendingDown, FileText } from '../../icons';
import api, { factorsAPI } from '../../../services/api';

// Default available metrics (fallback when API returns empty)
const DEFAULT_METRICS = {
  valuation: [
    { metric_code: 'pe_ratio', metric_name: 'P/E Ratio', description: 'Price to earnings ratio', higher_is_better: 0 },
    { metric_code: 'pb_ratio', metric_name: 'P/B Ratio', description: 'Price to book ratio', higher_is_better: 0 },
    { metric_code: 'ps_ratio', metric_name: 'P/S Ratio', description: 'Price to sales ratio', higher_is_better: 0 },
    { metric_code: 'ev_ebitda', metric_name: 'EV/EBITDA', description: 'Enterprise value to EBITDA', higher_is_better: 0 },
    { metric_code: 'earnings_yield', metric_name: 'Earnings Yield', description: 'Earnings per share / price (inverse of P/E)', higher_is_better: 1 },
    { metric_code: 'fcf_yield', metric_name: 'FCF Yield', description: 'Free cash flow yield', higher_is_better: 1 },
    { metric_code: 'dividend_yield', metric_name: 'Dividend Yield', description: 'Annual dividend / price', higher_is_better: 1 },
    { metric_code: 'enterprise_value', metric_name: 'Enterprise Value', description: 'Market cap + debt - cash', higher_is_better: 0 },
    { metric_code: 'market_cap', metric_name: 'Market Cap', description: 'Market capitalization', higher_is_better: 0 },
  ],
  profitability: [
    { metric_code: 'roe', metric_name: 'Return on Equity', description: 'Net income / shareholders equity', higher_is_better: 1 },
    { metric_code: 'roic', metric_name: 'Return on Invested Capital', description: 'NOPAT / invested capital', higher_is_better: 1 },
    { metric_code: 'roa', metric_name: 'Return on Assets', description: 'Net income / total assets', higher_is_better: 1 },
    { metric_code: 'gross_margin', metric_name: 'Gross Margin', description: 'Gross profit / revenue', higher_is_better: 1 },
    { metric_code: 'operating_margin', metric_name: 'Operating Margin', description: 'Operating income / revenue', higher_is_better: 1 },
    { metric_code: 'net_margin', metric_name: 'Net Margin', description: 'Net income / revenue', higher_is_better: 1 },
    { metric_code: 'asset_turnover', metric_name: 'Asset Turnover', description: 'Revenue / total assets', higher_is_better: 1 },
  ],
  growth: [
    { metric_code: 'revenue_growth_yoy', metric_name: 'Revenue Growth (YoY)', description: 'Year-over-year revenue growth', higher_is_better: 1 },
    { metric_code: 'earnings_growth_yoy', metric_name: 'Earnings Growth (YoY)', description: 'Year-over-year earnings growth', higher_is_better: 1 },
    { metric_code: 'fcf_growth_yoy', metric_name: 'FCF Growth (YoY)', description: 'Year-over-year free cash flow growth', higher_is_better: 1 },
  ],
  quality: [
    { metric_code: 'debt_to_equity', metric_name: 'Debt to Equity', description: 'Total debt / shareholders equity', higher_is_better: 0 },
    { metric_code: 'current_ratio', metric_name: 'Current Ratio', description: 'Current assets / current liabilities', higher_is_better: 1 },
    { metric_code: 'quick_ratio', metric_name: 'Quick Ratio', description: '(Current assets - inventory) / current liabilities', higher_is_better: 1 },
    { metric_code: 'interest_coverage', metric_name: 'Interest Coverage', description: 'EBIT / interest expense', higher_is_better: 1 },
    { metric_code: 'piotroski_f', metric_name: 'Piotroski F-Score', description: 'Financial strength score (0-9)', higher_is_better: 1 },
  ],
  technical: [
    { metric_code: 'momentum_1m', metric_name: '1-Month Momentum', description: 'Price return over 1 month', higher_is_better: 1 },
    { metric_code: 'momentum_3m', metric_name: '3-Month Momentum', description: 'Price return over 3 months', higher_is_better: 1 },
    { metric_code: 'momentum_6m', metric_name: '6-Month Momentum', description: 'Price return over 6 months', higher_is_better: 1 },
    { metric_code: 'momentum_12m', metric_name: '12-Month Momentum', description: 'Price return over 12 months', higher_is_better: 1 },
    { metric_code: 'volatility', metric_name: 'Volatility', description: 'Price volatility (standard deviation)', higher_is_better: 0 },
    { metric_code: 'beta', metric_name: 'Beta', description: 'Market beta', higher_is_better: 0 },
  ],
  alternative: [
    { metric_code: 'congressional_signal', metric_name: 'Congressional Signal', description: 'Congressional trading activity signal', higher_is_better: 1 },
    { metric_code: 'insider_signal', metric_name: 'Insider Signal', description: 'Insider trading activity signal', higher_is_better: 1 },
    { metric_code: 'short_interest', metric_name: 'Short Interest', description: 'Short interest as % of float', higher_is_better: 0 },
    { metric_code: 'sentiment_score', metric_name: 'Sentiment Score', description: 'Aggregated sentiment from news/social', higher_is_better: 1 },
  ],
};

// Pre-built factor templates
const FACTOR_TEMPLATES = [
  {
    id: 'classic_value',
    name: 'Classic Value',
    category: 'Valuation',
    formula: '1 / pe_ratio',
    description: 'Inverse P/E ratio - higher means cheaper stocks. Classic value investing metric.',
    higherIsBetter: true
  },
  {
    id: 'fcf_yield',
    name: 'FCF Yield',
    category: 'Valuation',
    formula: 'fcf_yield',
    description: 'Free cash flow yield. Measures how much cash a company generates relative to price.',
    higherIsBetter: true
  },
  {
    id: 'quality_factor',
    name: 'Quality Factor',
    category: 'Quality',
    formula: 'roe * (1 - debt_to_equity)',
    description: 'ROE adjusted for leverage. High ROE with low debt indicates true quality.',
    higherIsBetter: true
  },
  {
    id: 'composite_quality',
    name: 'Composite Quality',
    category: 'Quality',
    formula: '(roe + roic + gross_margin) / 3',
    description: 'Average of key profitability metrics. Robust quality signal.',
    higherIsBetter: true
  },
  {
    id: 'piotroski_score',
    name: 'Piotroski F-Score',
    category: 'Quality',
    formula: 'piotroski_f',
    description: 'Piotroski F-Score (0-9). Academic measure of financial strength.',
    higherIsBetter: true
  },
  {
    id: 'earnings_momentum',
    name: 'Earnings Momentum',
    category: 'Growth',
    formula: 'earnings_growth_yoy',
    description: 'Year-over-year earnings growth. Captures improving fundamentals.',
    higherIsBetter: true
  },
  {
    id: 'dividend_yield_factor',
    name: 'Dividend Yield',
    category: 'Income',
    formula: 'dividend_yield',
    description: 'Dividend yield - higher means more income returned to shareholders.',
    higherIsBetter: true
  },
  {
    id: 'value_quality_combo',
    name: 'Value-Quality Combo',
    category: 'Combination',
    formula: 'fcf_yield * roe',
    description: 'FCF yield times ROE. Cheap stocks with good profitability.',
    higherIsBetter: true
  },
  {
    id: 'magic_formula',
    name: 'Magic Formula (Greenblatt)',
    category: 'Combination',
    formula: 'earnings_yield + roic',
    description: 'Joel Greenblatt\'s magic formula: earnings yield + ROIC.',
    higherIsBetter: true
  },
  {
    id: 'deep_value',
    name: 'Deep Value',
    category: 'Valuation',
    formula: '1 / pb_ratio',
    description: 'Inverse price-to-book. Identifies asset-rich bargains.',
    higherIsBetter: true
  }
];

export default function FactorFormulaBuilder({ onFactorCreated, onRunFullAnalysis, initialFactor }) {
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [runningFullAnalysis, setRunningFullAnalysis] = useState(false);
  const [higherIsBetter, setHigherIsBetter] = useState(true);
  const [transformations, setTransformations] = useState({
    zscore: true,
    winsorize: true,
    sectorNeutral: false
  });

  const [availableMetrics, setAvailableMetrics] = useState([]);
  const [validation, setValidation] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load available metrics
  useEffect(() => {
    fetch('/api/factors/available-metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.byCategory && Object.keys(data.data.byCategory).length > 0) {
          setAvailableMetrics(data.data.byCategory);
        } else {
          // Use fallback metrics if API returns empty
          console.log('Using fallback metrics (API returned empty)');
          setAvailableMetrics(DEFAULT_METRICS);
        }
      })
      .catch(err => {
        console.error('Failed to load metrics:', err);
        // Use fallback metrics on error
        setAvailableMetrics(DEFAULT_METRICS);
      });
  }, []);

  // Initialize with existing factor if provided
  useEffect(() => {
    if (initialFactor) {
      setName(initialFactor.name || '');
      setFormula(initialFactor.formula || '');
      setDescription(initialFactor.description || '');
      setHigherIsBetter(initialFactor.higherIsBetter ?? true);
      setTransformations(initialFactor.transformations || {
        zscore: true,
        winsorize: true,
        sectorNeutral: false
      });
    }
  }, [initialFactor]);

  // Validate formula as user types
  useEffect(() => {
    if (!formula.trim()) {
      setValidation(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await api.post('/factors/validate', { formula });
        setValidation(response.data?.data);
      } catch (err) {
        setValidation({ valid: false, error: err?.message || 'Validation failed' });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formula]);

  // Preview factor values
  const handlePreview = async () => {
    if (!formula.trim() || !validation?.valid) return;

    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const response = await api.post('/factors/preview', {
        formula,
        sampleSize: 30
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Preview failed');
      }

      setPreview(response.data.data);
    } catch (err) {
      setError(err?.message);
    } finally {
      setLoading(false);
    }
  };

  // Save factor
  const handleSave = async () => {
    if (!name.trim() || !formula.trim() || !validation?.valid) return;

    setSaving(true);
    setError(null);

    try {
      const response = await api.post('/factors/define', {
        name,
        formula,
        description,
        higherIsBetter,
        transformations
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Failed to save factor');
      }

      onFactorCreated?.(response.data.data);

      // Reset form
      setName('');
      setFormula('');
      setDescription('');
      setValidation(null);
      setPreview(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Insert metric into formula
  const insertMetric = (metricCode) => {
    const textarea = document.getElementById('formula-input');
    const start = textarea?.selectionStart || formula.length;
    const newFormula = formula.slice(0, start) + metricCode + formula.slice(start);
    setFormula(newFormula);
    textarea?.focus();
  };

  // Load a template
  const loadTemplate = (templateId) => {
    if (!templateId) {
      setSelectedTemplate('');
      return;
    }
    const template = FACTOR_TEMPLATES.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(templateId);
      setName(template.name);
      setFormula(template.formula);
      setDescription(template.description);
      setHigherIsBetter(template.higherIsBetter);
    }
  };

  // Group templates by category
  const templatesByCategory = FACTOR_TEMPLATES.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {});

  // One-click full analysis: save + run IC + run correlations
  const handleOneClickAnalysis = async () => {
    if (!name.trim() || !formula.trim() || !validation?.valid) return;

    setRunningFullAnalysis(true);
    setError(null);

    try {
      // Step 1: Save the factor
      const saveResponse = await fetch('/api/factors/define', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          formula,
          description,
          higherIsBetter,
          transformations
        })
      });
      const saveData = await saveResponse.json();

      if (!saveData.success) {
        throw new Error(saveData.error || 'Failed to save factor');
      }

      const savedFactor = saveData.data;

      // Step 2: Run IC analysis
      const icRes = await factorsAPI.icAnalysis({
        factorId: savedFactor.id,
        formula,
        horizons: [1, 5, 21, 63, 126, 252]
      });
      const icData = icRes.data;

      // Step 3: Run correlation analysis
      const corrRes = await factorsAPI.correlation({ formula });
      const corrData = corrRes.data;

      // Pass results to parent to switch to IC Dashboard tab
      onRunFullAnalysis?.({
        factor: savedFactor,
        icResults: icData.success ? icData.data : null,
        correlations: corrData.success ? corrData.data : null
      });

      // Notify factor was created
      onFactorCreated?.(savedFactor);

    } catch (err) {
      setError(err.message);
    } finally {
      setRunningFullAnalysis(false);
    }
  };

  return (
    <div className="factor-formula-builder">
      {/* Template selector */}
      <div className="template-selector">
        <div className="template-header">
          <FileText size={18} />
          <span>Quick Start: Load a Template</span>
        </div>
        <div className="template-grid">
          {Object.entries(templatesByCategory).map(([category, templates]) => (
            <div key={category} className="template-category">
              <span className="category-label">{category}</span>
              <div className="template-buttons">
                {templates.map(template => (
                  <button
                    key={template.id}
                    className={`template-btn ${selectedTemplate === template.id ? 'active' : ''}`}
                    onClick={() => loadTemplate(template.id)}
                    title={template.description}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {selectedTemplate && (
          <button
            className="clear-template-btn"
            onClick={() => {
              setSelectedTemplate('');
              setName('');
              setFormula('');
              setDescription('');
            }}
          >
            Clear and start fresh
          </button>
        )}
      </div>

      <div className="builder-layout">
        {/* Left side: Formula editor */}
        <div className="formula-editor">
          <div className="form-group">
            <label>Factor Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Quality-Adjusted FCF Yield"
              className="factor-name-input"
            />
          </div>

          <div className="form-group">
            <label>
              Formula
              {validation && (
                <span className={`validation-badge ${validation.valid ? 'valid' : 'invalid'}`}>
                  {validation.valid ? <><Check size={12} /> Valid</> : <><AlertTriangle size={12} /> Invalid</>}
                </span>
              )}
            </label>
            <textarea
              id="formula-input"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="e.g., (fcf_yield * roe) / (debt_to_equity + 0.1)"
              className={`formula-textarea ${validation?.valid ? 'valid' : validation?.error ? 'invalid' : ''}`}
              rows={4}
            />
            {validation?.error && (
              <div className="formula-error">
                <AlertTriangle size={14} />
                {validation.error}
              </div>
            )}
            {validation?.valid && validation.requiredMetrics && (
              <div className="formula-metrics">
                <Info size={14} />
                Uses: {validation.requiredMetrics.join(', ')}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this factor measures and why it might predict returns..."
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-group inline">
              <label>
                <input
                  type="checkbox"
                  checked={higherIsBetter}
                  onChange={(e) => setHigherIsBetter(e.target.checked)}
                />
                Higher values are better
              </label>
            </div>
          </div>

          <div className="transformations-section">
            <label>Transformations</label>
            <div className="transformation-options">
              <label>
                <input
                  type="checkbox"
                  checked={transformations.zscore}
                  onChange={(e) => setTransformations(prev => ({ ...prev, zscore: e.target.checked }))}
                />
                Z-score normalize
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={transformations.winsorize}
                  onChange={(e) => setTransformations(prev => ({ ...prev, winsorize: e.target.checked }))}
                />
                Winsorize outliers
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={transformations.sectorNeutral}
                  onChange={(e) => setTransformations(prev => ({ ...prev, sectorNeutral: e.target.checked }))}
                />
                Sector neutral
              </label>
            </div>
          </div>

          <div className="builder-actions">
            <button
              className="preview-btn"
              onClick={handlePreview}
              disabled={loading || !validation?.valid}
            >
              {loading ? <><Loader size={16} /> Calculating...</> : 'Preview Values'}
            </button>
            <button
              className="save-btn"
              onClick={handleSave}
              disabled={saving || !name.trim() || !validation?.valid}
            >
              {saving ? <><Loader size={16} /> Saving...</> : 'Save Factor'}
            </button>
          </div>

          {/* One-Click Full Analysis */}
          <button
            className="one-click-analysis-btn"
            onClick={handleOneClickAnalysis}
            disabled={runningFullAnalysis || !name.trim() || !validation?.valid}
          >
            {runningFullAnalysis ? (
              <><Loader size={18} /> Running Full Analysis...</>
            ) : (
              <><TrendingUp size={18} /> Save &amp; Run Full Analysis</>
            )}
          </button>

          {error && (
            <div className="builder-error">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
        </div>

        {/* Right side: Metrics browser */}
        <div className="metrics-browser">
          <h4>Available Metrics</h4>
          <p className="metrics-hint">Click to insert into formula</p>

          <div className="metrics-categories">
            {Object.entries(availableMetrics).map(([category, metrics]) => (
              <div key={category} className="metric-category">
                <h5>{category.charAt(0).toUpperCase() + category.slice(1)}</h5>
                <div className="metric-list">
                  {metrics.map(metric => (
                    <button
                      key={metric.metric_code}
                      className="metric-chip"
                      onClick={() => insertMetric(metric.metric_code)}
                      title={metric.description}
                    >
                      {metric.metric_code}
                      <span className={`direction ${metric.higher_is_better ? 'up' : 'down'}`}>
                        {metric.higher_is_better ? '↑' : '↓'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="functions-section">
            <h5>Functions</h5>
            <div className="function-list">
              {['log', 'sqrt', 'abs', 'max', 'min', 'pow', 'if', 'ifnan', 'ratio', 'growth'].map(fn => (
                <button
                  key={fn}
                  className="function-chip"
                  onClick={() => insertMetric(fn + '(')}
                >
                  {fn}()
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Preview results */}
      {preview && (
        <div className="preview-results">
          <div className="preview-header">
            <h4>Factor Preview</h4>
            <span className="preview-stats">
              {preview.universeSize} stocks analyzed | Mean: {preview.stats?.mean?.toFixed(2)} | Std: {preview.stats?.std?.toFixed(2)}
            </span>
          </div>

          <div className="preview-tables">
            <div className="preview-section top-stocks">
              <h5>
                <TrendingUp size={16} />
                Top Stocks (Highest Values)
              </h5>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Sector</th>
                    <th>Raw Value</th>
                    <th>Z-Score</th>
                    <th>Percentile</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.topStocks?.slice(0, 10).map(stock => (
                    <tr key={stock.symbol}>
                      <td className="symbol">{stock.symbol}</td>
                      <td className="sector">{stock.sector || '-'}</td>
                      <td className="value">{stock.rawValue?.toFixed(3)}</td>
                      <td className="zscore positive">{stock.zscoreValue?.toFixed(2)}</td>
                      <td className="percentile">{stock.percentileValue?.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="preview-section bottom-stocks">
              <h5>
                <TrendingDown size={16} />
                Bottom Stocks (Lowest Values)
              </h5>
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Sector</th>
                    <th>Raw Value</th>
                    <th>Z-Score</th>
                    <th>Percentile</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.bottomStocks?.slice(0, 10).map(stock => (
                    <tr key={stock.symbol}>
                      <td className="symbol">{stock.symbol}</td>
                      <td className="sector">{stock.sector || '-'}</td>
                      <td className="value">{stock.rawValue?.toFixed(3)}</td>
                      <td className="zscore negative">{stock.zscoreValue?.toFixed(2)}</td>
                      <td className="percentile">{stock.percentileValue?.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
