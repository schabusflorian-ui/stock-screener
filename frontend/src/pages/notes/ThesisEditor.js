import { useState, useEffect, useCallback } from 'react';
import {
  X, Save, Target, TrendingUp, TrendingDown, Plus, Trash2,
  CheckCircle, AlertTriangle, XCircle, HelpCircle, Calendar, Building2
} from 'lucide-react';
import { thesesAPI, companyAPI } from '../../services/api';
import { Button, Badge, Card } from '../../components/ui';
import './ThesisEditor.css';

function ThesisEditor({ thesis, onSave, onClose }) {
  // Basic form state
  const [symbol, setSymbol] = useState(thesis?.symbol || '');
  const [title, setTitle] = useState(thesis?.title || '');
  const [content, setContent] = useState(thesis?.content || '');
  const [thesisType, setThesisType] = useState(thesis?.thesis_type || 'long');
  const [convictionLevel, setConvictionLevel] = useState(thesis?.conviction_level || 3);

  // Price targets
  const [targetPrice, setTargetPrice] = useState(thesis?.target_price || '');
  const [stopLossPrice, setStopLossPrice] = useState(thesis?.stop_loss_price || '');
  const [entryPrice, setEntryPrice] = useState(thesis?.entry_price || '');

  // Time horizon
  const [timeHorizonMonths, setTimeHorizonMonths] = useState(thesis?.time_horizon_months || 12);
  const [reviewDate, setReviewDate] = useState(thesis?.review_date || '');

  // Assumptions and Catalysts
  const [assumptions, setAssumptions] = useState(thesis?.assumptions || []);
  const [catalysts, setCatalysts] = useState(thesis?.catalysts || []);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(thesis?.template_id || 'long-standard');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [symbolSuggestions, setSymbolSuggestions] = useState([]);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [currentSection, setCurrentSection] = useState('overview');

  // Load templates
  useEffect(() => {
    loadTemplates();
  }, []);

  // Load company info when symbol changes
  useEffect(() => {
    if (symbol.length >= 1) {
      loadCompanyInfo(symbol);
    }
  }, [symbol]);

  const loadTemplates = async () => {
    try {
      const res = await thesesAPI.getTemplates();
      setTemplates(res.data.templates || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadCompanyInfo = async (sym) => {
    try {
      const res = await companyAPI.getOne(sym);
      if (res.data.company) {
        setCompanyInfo(res.data.company);
      }
    } catch (error) {
      setCompanyInfo(null);
    }
  };

  const searchSymbols = useCallback(async (query) => {
    if (query.length < 1) {
      setSymbolSuggestions([]);
      return;
    }
    try {
      const res = await companyAPI.search(query);
      setSymbolSuggestions(res.data.companies?.slice(0, 5) || []);
    } catch (error) {
      console.error('Error searching symbols:', error);
    }
  }, []);

  // Assumption handlers
  const addAssumption = () => {
    setAssumptions([...assumptions, {
      text: '',
      type: 'growth',
      importance: 'medium',
      validationMetric: '',
      validationOperator: '>',
      validationThreshold: '',
      autoValidate: false
    }]);
  };

  const updateAssumption = (index, field, value) => {
    const updated = [...assumptions];
    updated[index] = { ...updated[index], [field]: value };
    setAssumptions(updated);
  };

  const removeAssumption = (index) => {
    setAssumptions(assumptions.filter((_, i) => i !== index));
  };

  // Catalyst handlers
  const addCatalyst = () => {
    setCatalysts([...catalysts, {
      text: '',
      type: 'earnings',
      expectedDate: '',
      expectedDateRange: '',
      expectedImpact: 'medium'
    }]);
  };

  const updateCatalyst = (index, field, value) => {
    const updated = [...catalysts];
    updated[index] = { ...updated[index], [field]: value };
    setCatalysts(updated);
  };

  const removeCatalyst = (index) => {
    setCatalysts(catalysts.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!symbol.trim()) {
      setError('Symbol is required');
      return;
    }
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        symbol: symbol.toUpperCase(),
        title: title.trim(),
        content,
        thesisType,
        convictionLevel,
        targetPrice: targetPrice ? parseFloat(targetPrice) : null,
        stopLossPrice: stopLossPrice ? parseFloat(stopLossPrice) : null,
        entryPrice: entryPrice ? parseFloat(entryPrice) : null,
        timeHorizonMonths: parseInt(timeHorizonMonths),
        reviewDate: reviewDate || null,
        templateId: selectedTemplate,
        assumptions: assumptions.filter(a => a.text.trim()),
        catalysts: catalysts.filter(c => c.text.trim())
      });
    } catch (err) {
      setError(err.message || 'Failed to save thesis');
    } finally {
      setSaving(false);
    }
  };

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'assumptions', label: 'Assumptions' },
    { id: 'catalysts', label: 'Catalysts' },
    { id: 'notes', label: 'Notes' }
  ];

  return (
    <div className="thesis-editor">
      <div className="editor-header">
        <div className="header-left">
          <Target size={24} />
          <h1>{thesis ? 'Edit Thesis' : 'New Investment Thesis'}</h1>
        </div>
        <div className="editor-actions">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Thesis'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>
      </div>

      {error && <div className="editor-error">{error}</div>}

      <div className="editor-nav">
        {sections.map(section => (
          <button
            key={section.id}
            className={`nav-btn ${currentSection === section.id ? 'active' : ''}`}
            onClick={() => setCurrentSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="editor-body">
        {currentSection === 'overview' && (
          <div className="section-content">
            {/* Symbol & Title */}
            <div className="form-row">
              <div className="form-group symbol-group">
                <label>Symbol</label>
                <div className="symbol-input-wrapper">
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => {
                      setSymbol(e.target.value.toUpperCase());
                      searchSymbols(e.target.value);
                    }}
                    placeholder="AAPL"
                    disabled={!!thesis}
                  />
                  {symbolSuggestions.length > 0 && !thesis && (
                    <ul className="symbol-suggestions">
                      {symbolSuggestions.map(company => (
                        <li
                          key={company.symbol}
                          onClick={() => {
                            setSymbol(company.symbol);
                            setSymbolSuggestions([]);
                          }}
                        >
                          <strong>{company.symbol}</strong>
                          <span>{company.name}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {companyInfo && (
                  <div className="company-info">
                    <Building2 size={14} />
                    <span>{companyInfo.name}</span>
                    <span className="sector">{companyInfo.sector}</span>
                  </div>
                )}
              </div>

              <div className="form-group flex-2">
                <label>Thesis Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Long AAPL - Services growth story"
                />
              </div>
            </div>

            {/* Type & Conviction */}
            <div className="form-row">
              <div className="form-group">
                <label>Position Type</label>
                <div className="type-selector">
                  {['long', 'short', 'hold', 'avoid'].map(type => (
                    <button
                      key={type}
                      className={`type-btn ${thesisType === type ? 'active' : ''} ${type}`}
                      onClick={() => setThesisType(type)}
                    >
                      {type === 'long' && <TrendingUp size={16} />}
                      {type === 'short' && <TrendingDown size={16} />}
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Conviction Level</label>
                <div className="conviction-selector">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      className={`star-btn ${level <= convictionLevel ? 'active' : ''}`}
                      onClick={() => setConvictionLevel(level)}
                    >
                      ★
                    </button>
                  ))}
                  <span className="conviction-label">
                    {convictionLevel === 1 && 'Low'}
                    {convictionLevel === 2 && 'Below Average'}
                    {convictionLevel === 3 && 'Average'}
                    {convictionLevel === 4 && 'High'}
                    {convictionLevel === 5 && 'Very High'}
                  </span>
                </div>
              </div>
            </div>

            {/* Price Targets */}
            <div className="form-row">
              <div className="form-group">
                <label>Entry Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Target Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="0.00"
                />
                {entryPrice && targetPrice && (
                  <span className="price-calc positive">
                    +{((parseFloat(targetPrice) - parseFloat(entryPrice)) / parseFloat(entryPrice) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="form-group">
                <label>Stop Loss</label>
                <input
                  type="number"
                  step="0.01"
                  value={stopLossPrice}
                  onChange={(e) => setStopLossPrice(e.target.value)}
                  placeholder="0.00"
                />
                {entryPrice && stopLossPrice && (
                  <span className="price-calc negative">
                    {((parseFloat(stopLossPrice) - parseFloat(entryPrice)) / parseFloat(entryPrice) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            {/* Time Horizon */}
            <div className="form-row">
              <div className="form-group">
                <label>Time Horizon (months)</label>
                <select
                  value={timeHorizonMonths}
                  onChange={(e) => setTimeHorizonMonths(e.target.value)}
                >
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                  <option value={18}>18 months</option>
                  <option value={24}>24 months</option>
                  <option value={36}>36 months</option>
                  <option value={60}>5 years</option>
                </select>
              </div>
              <div className="form-group">
                <label>Review Date</label>
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {currentSection === 'assumptions' && (
          <div className="section-content">
            <div className="section-header">
              <h3>Key Assumptions</h3>
              <p>What must be true for this thesis to work?</p>
              <Button variant="secondary" onClick={addAssumption}>
                <Plus size={16} />
                Add Assumption
              </Button>
            </div>

            <div className="assumptions-list">
              {assumptions.map((assumption, index) => (
                <Card key={index} className="assumption-card">
                  <div className="assumption-header">
                    <select
                      value={assumption.type}
                      onChange={(e) => updateAssumption(index, 'type', e.target.value)}
                      className="type-select"
                    >
                      <option value="growth">Growth</option>
                      <option value="margin">Margin</option>
                      <option value="market">Market</option>
                      <option value="competitive">Competitive</option>
                      <option value="management">Management</option>
                      <option value="macro">Macro</option>
                    </select>
                    <select
                      value={assumption.importance}
                      onChange={(e) => updateAssumption(index, 'importance', e.target.value)}
                      className="importance-select"
                    >
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <button
                      className="remove-btn"
                      onClick={() => removeAssumption(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <textarea
                    value={assumption.text}
                    onChange={(e) => updateAssumption(index, 'text', e.target.value)}
                    placeholder="Describe the assumption..."
                    rows={2}
                  />
                  <div className="validation-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={assumption.autoValidate}
                        onChange={(e) => updateAssumption(index, 'autoValidate', e.target.checked)}
                      />
                      Auto-validate
                    </label>
                    {assumption.autoValidate && (
                      <>
                        <input
                          type="text"
                          value={assumption.validationMetric}
                          onChange={(e) => updateAssumption(index, 'validationMetric', e.target.value)}
                          placeholder="Metric name"
                          className="metric-input"
                        />
                        <select
                          value={assumption.validationOperator}
                          onChange={(e) => updateAssumption(index, 'validationOperator', e.target.value)}
                        >
                          <option value=">">&gt;</option>
                          <option value=">=">&ge;</option>
                          <option value="<">&lt;</option>
                          <option value="<=">&le;</option>
                          <option value="=">=</option>
                        </select>
                        <input
                          type="number"
                          value={assumption.validationThreshold}
                          onChange={(e) => updateAssumption(index, 'validationThreshold', e.target.value)}
                          placeholder="Threshold"
                          className="threshold-input"
                        />
                      </>
                    )}
                  </div>
                </Card>
              ))}

              {assumptions.length === 0 && (
                <div className="empty-state">
                  <HelpCircle size={32} />
                  <p>Add your key assumptions</p>
                  <span>What must happen for this investment to work?</span>
                </div>
              )}
            </div>
          </div>
        )}

        {currentSection === 'catalysts' && (
          <div className="section-content">
            <div className="section-header">
              <h3>Catalysts</h3>
              <p>What events could drive the stock price?</p>
              <Button variant="secondary" onClick={addCatalyst}>
                <Plus size={16} />
                Add Catalyst
              </Button>
            </div>

            <div className="catalysts-list">
              {catalysts.map((catalyst, index) => (
                <Card key={index} className="catalyst-card">
                  <div className="catalyst-header">
                    <select
                      value={catalyst.type}
                      onChange={(e) => updateCatalyst(index, 'type', e.target.value)}
                      className="type-select"
                    >
                      <option value="earnings">Earnings</option>
                      <option value="product_launch">Product Launch</option>
                      <option value="regulatory">Regulatory</option>
                      <option value="acquisition">Acquisition</option>
                      <option value="management">Management</option>
                      <option value="macro">Macro</option>
                      <option value="other">Other</option>
                    </select>
                    <select
                      value={catalyst.expectedImpact}
                      onChange={(e) => updateCatalyst(index, 'expectedImpact', e.target.value)}
                      className="impact-select"
                    >
                      <option value="high">High Impact</option>
                      <option value="medium">Medium Impact</option>
                      <option value="low">Low Impact</option>
                    </select>
                    <button
                      className="remove-btn"
                      onClick={() => removeCatalyst(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <textarea
                    value={catalyst.text}
                    onChange={(e) => updateCatalyst(index, 'text', e.target.value)}
                    placeholder="Describe the catalyst..."
                    rows={2}
                  />
                  <div className="date-row">
                    <div className="form-group">
                      <label>Expected Date</label>
                      <input
                        type="date"
                        value={catalyst.expectedDate}
                        onChange={(e) => updateCatalyst(index, 'expectedDate', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Or Date Range</label>
                      <input
                        type="text"
                        value={catalyst.expectedDateRange}
                        onChange={(e) => updateCatalyst(index, 'expectedDateRange', e.target.value)}
                        placeholder="e.g., Q2 2025"
                      />
                    </div>
                  </div>
                </Card>
              ))}

              {catalysts.length === 0 && (
                <div className="empty-state">
                  <Calendar size={32} />
                  <p>Add potential catalysts</p>
                  <span>What events could move the stock?</span>
                </div>
              )}
            </div>
          </div>
        )}

        {currentSection === 'notes' && (
          <div className="section-content">
            <div className="section-header">
              <h3>Full Thesis Notes</h3>
              <p>Document your complete investment thesis</p>
            </div>
            <textarea
              className="thesis-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your full investment thesis here...

Consider including:
- Business overview and competitive position
- Key growth drivers
- Valuation analysis
- Risk factors
- What would make you sell"
              rows={20}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ThesisEditor;
