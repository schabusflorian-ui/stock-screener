// frontend/src/components/portfolio/CreatePortfolioModal.js
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Wallet, Loader, PieChart, BarChart3, TrendingUp, Shield, Zap, DollarSign } from 'lucide-react';
import { portfoliosAPI, etfsAPI } from '../../services/api';
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
  const [mode, setMode] = useState(initialMode); // 'manual' or 'etf_model'
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

  useEffect(() => {
    if (mode === 'etf_model') {
      loadModels();
    }
  }, [mode]);

  useEffect(() => {
    if (selectedModel) {
      loadModelDetails(selectedModel.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

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

    try {
      setCreating(true);
      setError(null);

      // Create the portfolio
      const portfolioData = {
        name: name.trim(),
        description: description.trim() || (mode === 'etf_model' ? selectedModel.description : ''),
        type: mode === 'etf_model' ? 'etf_model' : 'manual',
        initialCash: parseFloat(initialCash) || 0
      };

      const res = await portfoliosAPI.create(portfolioData);
      const newPortfolio = res.data.portfolio;

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
            Manual Portfolio
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'etf_model' ? 'active' : ''}`}
            onClick={() => setMode('etf_model')}
          >
            <PieChart size={16} />
            ETF Model
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

            <div className="form-section">
              <label className="form-label">Portfolio Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={mode === 'etf_model' ? 'My ETF Portfolio' : 'My Portfolio'}
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
                  : 'Optional description...'}
                rows={3}
              />
            </div>

            <div className="form-section">
              <label className="form-label">
                {mode === 'etf_model' ? 'Investment Amount' : 'Initial Cash Balance'}
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
              disabled={creating || !name.trim() || (mode === 'etf_model' && !selectedModel)}
            >
              {creating ? (
                <>
                  <Loader className="spinning" size={16} />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {mode === 'etf_model' ? 'Create & Invest' : 'Create Portfolio'}
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
