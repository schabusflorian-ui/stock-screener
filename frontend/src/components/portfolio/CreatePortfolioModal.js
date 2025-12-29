// frontend/src/components/portfolio/CreatePortfolioModal.js
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Wallet, Loader, PieChart, BarChart3, TrendingUp, Shield, Zap, DollarSign, Users } from 'lucide-react';
import { portfoliosAPI, etfsAPI, investorsAPI } from '../../services/api';
import './CreatePortfolioModal.css';

const MODEL_ICONS = {
  'Conservative': Shield,
  'Moderate': BarChart3,
  'Aggressive Growth': TrendingUp,
  'All Weather': Zap,
  'Three Fund': PieChart,
  'Dividend Income': DollarSign
};

const RISK_COLORS = {
  'low': '#22c55e',
  'medium-low': '#84cc16',
  'medium': '#eab308',
  'high': '#ef4444'
};

function CreatePortfolioModal({ onClose, onCreated, initialMode = 'manual' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // 'manual', 'etf_model', or 'clone'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialCash, setInitialCash] = useState(10000);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // ETF Model state
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelDetails, setModelDetails] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);

  // Clone from Investor state
  const [investors, setInvestors] = useState([]);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [clonePreview, setClonePreview] = useState(null);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [minWeight, setMinWeight] = useState(0);
  const [maxPositions, setMaxPositions] = useState('');

  useEffect(() => {
    if (mode === 'etf_model') {
      loadModels();
    } else if (mode === 'clone') {
      loadInvestors();
    }
  }, [mode]);

  useEffect(() => {
    if (selectedModel) {
      loadModelDetails(selectedModel.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  // Load clone preview when investor or settings change
  useEffect(() => {
    if (selectedInvestor && mode === 'clone') {
      loadClonePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvestor, initialCash, minWeight, maxPositions]);

  const loadInvestors = async () => {
    try {
      setLoadingInvestors(true);
      const res = await investorsAPI.getAll();
      setInvestors(res.data.investors || []);
    } catch (err) {
      console.error('Error loading investors:', err);
      setError('Failed to load famous investors');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const loadClonePreview = async () => {
    if (!selectedInvestor) return;
    try {
      setLoadingPreview(true);
      const res = await investorsAPI.clonePreview(selectedInvestor.id, {
        amount: parseFloat(initialCash) || 10000,
        minWeight: parseFloat(minWeight) || 0,
        maxPositions: maxPositions ? parseInt(maxPositions) : null
      });
      setClonePreview(res.data);
      // Auto-set name based on investor
      if (!name || name.includes(' Clone')) {
        setName(`${selectedInvestor.name} Clone`);
      }
    } catch (err) {
      console.error('Error loading clone preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadModels = async () => {
    try {
      setLoadingModels(true);
      const res = await etfsAPI.getModels();
      setModels(res.data.models || []);
    } catch (err) {
      console.error('Error loading models:', err);
      setError('Failed to load model portfolios');
    } finally {
      setLoadingModels(false);
    }
  };

  const loadModelDetails = async (modelName) => {
    try {
      const res = await etfsAPI.getModel(modelName);
      setModelDetails(res.data.model);
      // Auto-set name based on model
      if (!name || name === selectedModel?.name + ' Portfolio') {
        setName(modelName + ' Portfolio');
      }
    } catch (err) {
      console.error('Error loading model details:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Portfolio name is required');
      return;
    }

    if (mode === 'etf_model' && !selectedModel) {
      setError('Please select a model portfolio');
      return;
    }

    if (mode === 'clone' && !selectedInvestor) {
      setError('Please select an investor to clone');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      // Create the portfolio
      const portfolioData = {
        name: name.trim(),
        description: description.trim() || (mode === 'etf_model' ? selectedModel?.description : mode === 'clone' ? `Cloned from ${selectedInvestor?.name}` : ''),
        type: mode === 'clone' ? 'clone' : mode === 'etf_model' ? 'etf_model' : 'manual',
        initialCash: parseFloat(initialCash) || 0
      };

      const res = await portfoliosAPI.create(portfolioData);
      const newPortfolio = res.data.portfolio;

      // If clone mode, get and execute trades from investor
      if (mode === 'clone' && selectedInvestor && clonePreview?.trades) {
        try {
          const trades = clonePreview.trades || [];

          // Execute each trade
          for (const trade of trades) {
            if (trade.shares > 0) {
              await portfoliosAPI.trade(newPortfolio.id, {
                symbol: trade.symbol,
                type: 'buy',
                shares: trade.shares,
                price: trade.estimatedPrice || trade.currentPrice
              });
            }
          }
        } catch (tradeErr) {
          console.error('Error executing clone trades:', tradeErr);
          // Portfolio was created, trades failed - still navigate
        }
      }

      // If ETF model, execute the trades to populate portfolio
      if (mode === 'etf_model' && selectedModel) {
        try {
          // Get the trade preparation from the model
          const prepRes = await etfsAPI.prepareFromModel(selectedModel.name, initialCash);
          const trades = prepRes.data.trades || [];

          // Execute each trade
          for (const trade of trades) {
            if (trade.shares > 0) {
              await portfoliosAPI.trade(newPortfolio.id, {
                symbol: trade.symbol,
                type: 'buy',
                shares: trade.shares,
                price: trade.estimatedPrice || trade.currentPrice
              });
            }
          }
        } catch (tradeErr) {
          console.error('Error executing model trades:', tradeErr);
          // Portfolio was created, trades failed - still navigate
        }
      }

      if (onCreated) {
        onCreated(newPortfolio);
      }

      navigate(`/portfolios/${newPortfolio.id}`);
    } catch (err) {
      console.error('Error creating portfolio:', err);
      setError(err.response?.data?.error || 'Failed to create portfolio');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-portfolio-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Wallet size={20} />
            <h2>Create Portfolio</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            <Wallet size={16} />
            Manual
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'etf_model' ? 'active' : ''}`}
            onClick={() => setMode('etf_model')}
          >
            <PieChart size={16} />
            ETF Model
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'clone' ? 'active' : ''}`}
            onClick={() => setMode('clone')}
          >
            <Users size={16} />
            Clone Investor
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {mode === 'etf_model' && (
              <div className="form-section">
                <label className="form-label">Select Model Portfolio</label>
                {loadingModels ? (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading models...
                  </div>
                ) : (
                  <div className="model-grid">
                    {models.map(model => {
                      const Icon = MODEL_ICONS[model.name] || PieChart;
                      const riskColor = RISK_COLORS[model.risk_level] || '#6b7280';
                      const isSelected = selectedModel?.id === model.id;

                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={`model-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedModel(model)}
                        >
                          <div className="model-icon" style={{ color: riskColor }}>
                            <Icon size={24} />
                          </div>
                          <div className="model-info">
                            <span className="model-name">{model.name}</span>
                            <span className="model-style">{model.investment_style}</span>
                          </div>
                          <div
                            className="model-risk"
                            style={{ background: `${riskColor}20`, color: riskColor }}
                          >
                            {model.risk_level}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Model Details */}
                {modelDetails && (
                  <div className="model-details">
                    <div className="model-description">
                      {modelDetails.description}
                    </div>
                    <div className="model-allocations">
                      <span className="allocations-label">Allocations:</span>
                      <div className="allocation-list">
                        {modelDetails.allocations?.map((alloc, idx) => (
                          <div key={idx} className="allocation-item">
                            <span className="alloc-symbol">{alloc.symbol}</span>
                            <span className="alloc-weight">{alloc.target_weight}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {modelDetails.weightedExpenseRatio && (
                      <div className="model-expense">
                        Expense Ratio: {(modelDetails.weightedExpenseRatio * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Clone from Investor Mode */}
            {mode === 'clone' && (
              <div className="form-section">
                <label className="form-label">Select Famous Investor</label>
                {loadingInvestors ? (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading investors...
                  </div>
                ) : (
                  <div className="investor-grid">
                    {investors.map(investor => {
                      const isSelected = selectedInvestor?.id === investor.id;
                      return (
                        <button
                          key={investor.id}
                          type="button"
                          className={`investor-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedInvestor(investor)}
                        >
                          <div className="investor-avatar">
                            {investor.name?.charAt(0) || 'I'}
                          </div>
                          <div className="investor-info">
                            <span className="investor-name">{investor.name}</span>
                            <span className="investor-style">{investor.investment_style || 'Value Investor'}</span>
                          </div>
                          {investor.portfolio_value && (
                            <div className="investor-value">
                              ${(investor.portfolio_value / 1e9).toFixed(1)}B
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Clone Settings */}
                {selectedInvestor && (
                  <div className="clone-settings">
                    <div className="settings-row">
                      <div className="setting-item">
                        <label className="form-label">Min Weight %</label>
                        <input
                          type="number"
                          className="form-input"
                          value={minWeight}
                          onChange={e => setMinWeight(e.target.value)}
                          min="0"
                          max="10"
                          step="0.5"
                          placeholder="0"
                        />
                        <span className="form-hint">Exclude positions below this weight</span>
                      </div>
                      <div className="setting-item">
                        <label className="form-label">Max Positions</label>
                        <input
                          type="number"
                          className="form-input"
                          value={maxPositions}
                          onChange={e => setMaxPositions(e.target.value)}
                          min="1"
                          max="100"
                          placeholder="All"
                        />
                        <span className="form-hint">Limit to top N positions</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clone Preview */}
                {loadingPreview && (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading preview...
                  </div>
                )}

                {clonePreview && !loadingPreview && (
                  <div className="clone-preview">
                    <div className="preview-header">
                      <span className="preview-title">Clone Preview</span>
                      <span className="preview-count">{clonePreview.trades?.length || 0} positions</span>
                    </div>
                    <div className="preview-trades">
                      {clonePreview.trades?.slice(0, 8).map((trade, idx) => (
                        <div key={idx} className="preview-trade">
                          <span className="trade-symbol">{trade.symbol}</span>
                          <span className="trade-weight">{trade.weight?.toFixed(1)}%</span>
                          <span className="trade-shares">{trade.shares} shares</span>
                        </div>
                      ))}
                      {clonePreview.trades?.length > 8 && (
                        <div className="preview-more">
                          +{clonePreview.trades.length - 8} more positions
                        </div>
                      )}
                    </div>
                    {clonePreview.totalInvested && (
                      <div className="preview-total">
                        Total: ${clonePreview.totalInvested.toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="form-section">
              <label className="form-label">Portfolio Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={mode === 'etf_model' ? 'My ETF Portfolio' : mode === 'clone' ? 'Investor Clone' : 'My Portfolio'}
                autoFocus={mode === 'manual'}
              />
            </div>

            <div className="form-section">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={mode === 'etf_model' && selectedModel
                  ? selectedModel.description
                  : mode === 'clone' && selectedInvestor
                  ? `Cloned from ${selectedInvestor.name}`
                  : 'Optional description...'}
                rows={3}
              />
            </div>

            <div className="form-section">
              <label className="form-label">
                {mode === 'etf_model' || mode === 'clone' ? 'Investment Amount' : 'Initial Cash Balance'}
              </label>
              <div className="input-with-prefix">
                <span className="input-prefix">$</span>
                <input
                  type="number"
                  className="form-input"
                  value={initialCash}
                  onChange={e => setInitialCash(e.target.value)}
                  min="0"
                  step="100"
                />
              </div>
              <p className="form-hint">
                {mode === 'etf_model'
                  ? 'This amount will be invested according to the model allocation'
                  : mode === 'clone'
                  ? 'This amount will be allocated according to the investor\'s portfolio'
                  : 'Start with this amount of cash in your portfolio'}
              </p>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creating || !name.trim() || (mode === 'etf_model' && !selectedModel) || (mode === 'clone' && !selectedInvestor)}
            >
              {creating ? (
                <>
                  <Loader className="spinning" size={16} />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {mode === 'etf_model' ? 'Create & Invest' : mode === 'clone' ? 'Clone Portfolio' : 'Create Portfolio'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePortfolioModal;
