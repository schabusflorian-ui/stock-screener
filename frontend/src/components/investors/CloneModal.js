// frontend/src/components/investors/CloneModal.js
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Copy,
  DollarSign,
  BarChart3,
  Percent,
  AlertCircle,
  CheckCircle,
  Loader,
  AlertTriangle
} from 'lucide-react';
import { investorsAPI, portfoliosAPI } from '../../services/api';
import './CloneModal.css';

function CloneModal({ investor, onClose }) {
  const navigate = useNavigate();
  const [amount, setAmount] = useState(10000);
  const [portfolioName, setPortfolioName] = useState(`${investor.name} Clone`);
  const [minWeight, setMinWeight] = useState(0);
  const [maxPositions, setMaxPositions] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState({});

  // Validation
  const validation = useMemo(() => {
    const errors = {};
    const warnings = [];

    // Portfolio name validation
    if (!portfolioName.trim()) {
      errors.portfolioName = 'Portfolio name is required';
    } else if (portfolioName.length < 3) {
      errors.portfolioName = 'Name must be at least 3 characters';
    } else if (portfolioName.length > 50) {
      errors.portfolioName = 'Name must be less than 50 characters';
    }

    // Amount validation
    if (!amount || amount < 100) {
      errors.amount = 'Minimum investment is $100';
    } else if (amount > 10000000) {
      errors.amount = 'Maximum investment is $10,000,000';
    } else if (amount < 1000) {
      warnings.push('Small amounts may result in fractional shares');
    }

    // Min weight validation
    const minWeightNum = parseFloat(minWeight) || 0;
    if (minWeightNum < 0) {
      errors.minWeight = 'Weight cannot be negative';
    } else if (minWeightNum > 50) {
      errors.minWeight = 'Max weight filter is 50%';
    } else if (minWeightNum > 10) {
      warnings.push('High min weight may exclude many positions');
    }

    // Max positions validation
    if (maxPositions) {
      const maxPosNum = parseInt(maxPositions);
      if (maxPosNum < 1) {
        errors.maxPositions = 'Must have at least 1 position';
      } else if (maxPosNum > 500) {
        errors.maxPositions = 'Maximum is 500 positions';
      } else if (maxPosNum < 5) {
        warnings.push('Very few positions reduces diversification');
      }
    }

    return { errors, warnings, isValid: Object.keys(errors).length === 0 };
  }, [portfolioName, amount, minWeight, maxPositions]);

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, minWeight, maxPositions]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await investorsAPI.clonePreview(investor.id, {
        amount,
        minWeight: parseFloat(minWeight) || 0,
        maxPositions: maxPositions ? parseInt(maxPositions) : null
      });
      setPreview(res.data);
    } catch (err) {
      console.error('Error loading preview:', err);
      setError('Failed to load clone preview');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);

      // First, prepare the clone data
      const cloneRes = await investorsAPI.clone(investor.id, {
        amount,
        minWeight: parseFloat(minWeight) || 0,
        maxPositions: maxPositions ? parseInt(maxPositions) : null
      });

      // Then create the portfolio using Agent 1's API
      const portfolioRes = await portfoliosAPI.create({
        name: portfolioName,
        type: 'clone',
        initialCash: amount,
        description: `Clone of ${investor.name}'s portfolio from ${cloneRes.data.filingDate}`,
        sourceInvestorId: investor.id,
        trades: cloneRes.data.trades
      });

      // Navigate to the new portfolio
      navigate(`/portfolios/${portfolioRes.data.portfolio.id}`);
      onClose();
    } catch (err) {
      console.error('Error creating clone:', err);
      setError(err.response?.data?.error || 'Failed to create portfolio');
    } finally {
      setCreating(false);
    }
  };

  const formatValue = (value) => {
    if (!value) return '$0';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="clone-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Copy size={20} />
            <h2>Clone Portfolio</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="investor-info">
            <div className="investor-avatar">
              {investor.name?.charAt(0)}
            </div>
            <div>
              <h3>{investor.name}</h3>
              <p>{investor.fund_name}</p>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">Portfolio Name</label>
            <input
              type="text"
              className={`form-input ${touched.portfolioName && validation.errors.portfolioName ? 'error' : ''}`}
              value={portfolioName}
              onChange={e => setPortfolioName(e.target.value)}
              onBlur={() => handleBlur('portfolioName')}
              placeholder="Enter portfolio name"
            />
            {touched.portfolioName && validation.errors.portfolioName && (
              <span className="field-error">{validation.errors.portfolioName}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-section">
              <label className="form-label">
                <DollarSign size={14} />
                Investment Amount
              </label>
              <input
                type="number"
                className={`form-input ${touched.amount && validation.errors.amount ? 'error' : ''}`}
                value={amount}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                onBlur={() => handleBlur('amount')}
                min="100"
                step="100"
              />
              {touched.amount && validation.errors.amount && (
                <span className="field-error">{validation.errors.amount}</span>
              )}
            </div>

            <div className="form-section">
              <label className="form-label">
                <Percent size={14} />
                Min Weight (%)
              </label>
              <input
                type="number"
                className={`form-input ${touched.minWeight && validation.errors.minWeight ? 'error' : ''}`}
                value={minWeight}
                onChange={e => setMinWeight(e.target.value)}
                onBlur={() => handleBlur('minWeight')}
                min="0"
                max="50"
                step="0.1"
                placeholder="0"
              />
              {touched.minWeight && validation.errors.minWeight && (
                <span className="field-error">{validation.errors.minWeight}</span>
              )}
              <span className="field-hint">Filter out small positions</span>
            </div>

            <div className="form-section">
              <label className="form-label">
                <BarChart3 size={14} />
                Max Positions
              </label>
              <input
                type="number"
                className={`form-input ${touched.maxPositions && validation.errors.maxPositions ? 'error' : ''}`}
                value={maxPositions}
                onChange={e => setMaxPositions(e.target.value)}
                onBlur={() => handleBlur('maxPositions')}
                min="1"
                placeholder="All"
              />
              {touched.maxPositions && validation.errors.maxPositions && (
                <span className="field-error">{validation.errors.maxPositions}</span>
              )}
              <span className="field-hint">Limit to top N holdings</span>
            </div>
          </div>

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="warnings-section">
              {validation.warnings.map((warning, idx) => (
                <div key={idx} className="warning-message">
                  <AlertTriangle size={14} />
                  {warning}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="error-message">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Preview */}
          {loading ? (
            <div className="preview-loading">
              <Loader className="spinning" size={24} />
              <p>Loading preview...</p>
            </div>
          ) : preview && (
            <div className="preview-section">
              <div className="preview-header">
                <h4>Preview</h4>
                <span className="preview-info">
                  {preview.positionsCount} positions
                  {preview.excludedCount > 0 && ` (${preview.excludedCount} excluded)`}
                </span>
              </div>

              <div className="preview-list">
                {preview.preview?.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="preview-item">
                    <div className="preview-symbol">
                      <span className="symbol">{item.symbol}</span>
                      <span className="name">{item.companyName}</span>
                    </div>
                    <div className="preview-allocation">
                      <span className="weight">{item.weight.toFixed(1)}%</span>
                      <span className="value">{formatValue(item.targetValue)}</span>
                    </div>
                  </div>
                ))}
                {preview.positionsCount > 10 && (
                  <div className="preview-more">
                    +{preview.positionsCount - 10} more positions
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="footer-info">
            {preview && preview.positionsCount > 0 && (
              <span className="summary-text">
                {preview.positionsCount} positions totaling {formatValue(amount)}
              </span>
            )}
          </div>
          <div className="footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating || !validation.isValid || !preview || preview.positionsCount === 0}
            >
              {creating ? (
                <>
                  <Loader className="spinning" size={16} />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Create Portfolio
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CloneModal;
