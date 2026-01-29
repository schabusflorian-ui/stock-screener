// frontend/src/components/portfolio/AddToPortfolioButton.js
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, X, Briefcase, Check, Loader, DollarSign, TrendingUp, Target, AlertTriangle, ChevronDown, ChevronUp } from '../icons';
import { portfoliosAPI, simulateAPI } from '../../services/api';
import './AddToPortfolioButton.css';

function AddToPortfolioButton({ symbol, companyId, companyName, currentPrice }) {
  const [isOpen, setIsOpen] = useState(false);
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(null);
  const [shares, setShares] = useState('1');
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [kellyData, setKellyData] = useState(null);
  const [kellyLoading, setKellyLoading] = useState(false);
  const [showKellyDetails, setShowKellyDetails] = useState(false);
  const dropdownRef = useRef(null);

  // Calculate total cost
  const totalCost = useMemo(() => {
    const shareCount = parseInt(shares) || 0;
    return currentPrice ? shareCount * currentPrice : 0;
  }, [shares, currentPrice]);

  // Load Kelly recommendation for symbol
  const loadKellyRecommendation = useCallback(async (portfolioId = null) => {
    setKellyLoading(true);
    try {
      const res = await simulateAPI.analyzeSingleHolding(symbol, {
        portfolioId,
        period: '3y',
        riskFreeRate: 0.05
      });
      const data = res.data.data || res.data;
      if (!data?.error) {
        setKellyData(data);
      }
    } catch (err) {
      console.log('Kelly data not available:', err.message);
    } finally {
      setKellyLoading(false);
    }
  }, [symbol]);

  // Load portfolios when popup opens
  useEffect(() => {
    if (isOpen) {
      loadPortfolios();
      loadKellyRecommendation();
    }
  }, [isOpen, loadKellyRecommendation]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSelectedPortfolio(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const loadPortfolios = async () => {
    setLoading(true);
    try {
      const res = await portfoliosAPI.getAll();
      setPortfolios(res.data.portfolios || []);
    } catch (err) {
      console.error('Failed to load portfolios:', err);
      setError('Failed to load portfolios');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPortfolio = (portfolio) => {
    setSelectedPortfolio(portfolio);
    setError(null);
    // Reload Kelly data with portfolio context for correlation info
    loadKellyRecommendation(portfolio.id);
  };

  const handleConfirmAdd = async () => {
    if (!selectedPortfolio) return;

    if (!shares || parseInt(shares) < 1) {
      setError('Please enter at least 1 share');
      return;
    }

    const cashBalance = selectedPortfolio.cash_balance || 0;
    if (totalCost > cashBalance) {
      setError(`Insufficient cash. Need $${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, have $${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      return;
    }

    setSubmitting(selectedPortfolio.id);
    setError(null);
    try {
      await portfoliosAPI.addHolding(selectedPortfolio.id, {
        symbol,
        company_id: companyId,
        shares: parseInt(shares),
        avg_cost: currentPrice || 0
      });
      setSuccess(selectedPortfolio.id);
      setTimeout(() => {
        setSuccess(null);
        setIsOpen(false);
        setSelectedPortfolio(null);
        setShares('1');
      }, 1500);
    } catch (err) {
      console.error('Failed to add to portfolio:', err);
      setError(err.response?.data?.error || 'Failed to add to portfolio');
    } finally {
      setSubmitting(null);
    }
  };

  const toggleOpen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
    setError(null);
    setSuccess(null);
    setSelectedPortfolio(null);
    setShares('1');
  };

  const formatCurrency = (value) => {
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="add-portfolio-wrapper" ref={dropdownRef}>
      <button
        className="add-to-portfolio-btn"
        onClick={toggleOpen}
        title="Add to Portfolio"
      >
        <Plus size={14} />
        <span>Add</span>
      </button>

      {isOpen && (
        <div className="portfolio-dropdown">
          <div className="dropdown-header">
            <Briefcase size={16} />
            <span>Add {symbol} to Portfolio</span>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {/* Current Price Display */}
          {currentPrice && (
            <div className="price-display">
              <TrendingUp size={14} />
              <span className="price-label">Current Price:</span>
              <span className="price-value">${currentPrice.toFixed(2)}</span>
            </div>
          )}

          {/* Shares Input with Cost Preview */}
          <div className="shares-input-section">
            <div className="shares-row">
              <label>Shares:</label>
              <input
                type="number"
                min="1"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="1"
              />
            </div>
            {currentPrice && (
              <div className="cost-preview">
                <DollarSign size={14} />
                <span>Total Cost: <strong>${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
              </div>
            )}
          </div>

          {/* Kelly Sizing Recommendation */}
          <div className="kelly-recommendation-section">
            <button
              className="kelly-toggle"
              onClick={() => setShowKellyDetails(!showKellyDetails)}
            >
              <Target size={14} />
              <span>Position Sizing Recommendation</span>
              {showKellyDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showKellyDetails && (
              <div className="kelly-content">
                {kellyLoading ? (
                  <div className="kelly-loading">
                    <Loader className="spin" size={14} />
                    <span>Analyzing...</span>
                  </div>
                ) : kellyData ? (
                  <>
                    <div className="kelly-recommendation">
                      <div className="kelly-header">
                        <span className="kelly-label">Recommended Size</span>
                        <span className="kelly-value">
                          {(kellyData.kelly?.recommended?.fraction * 100 || 0).toFixed(0)}%
                        </span>
                        <span className="kelly-name">{kellyData.kelly?.recommended?.label || 'Kelly'}</span>
                      </div>
                      <p className="kelly-reason">{kellyData.kelly?.recommended?.reason}</p>
                    </div>

                    <div className="kelly-stats">
                      <div className="kelly-stat">
                        <span className="stat-label">Win Rate</span>
                        <span className="stat-value">{kellyData.statistics?.winRate}%</span>
                      </div>
                      <div className="kelly-stat">
                        <span className="stat-label">Sharpe</span>
                        <span className="stat-value">{kellyData.statistics?.sharpeRatio}</span>
                      </div>
                      <div className="kelly-stat">
                        <span className="stat-label">Volatility</span>
                        <span className="stat-value">{kellyData.statistics?.annualVolatility}%</span>
                      </div>
                    </div>

                    {kellyData.tailRisk?.warning && (
                      <div className="kelly-warning">
                        <AlertTriangle size={12} />
                        <span>{kellyData.tailRisk.warning}</span>
                      </div>
                    )}

                    {selectedPortfolio && kellyData.portfolioContext?.suggestedShares && currentPrice && (
                      <div className="kelly-suggestion">
                        <span>Suggested for this portfolio: </span>
                        <strong>{kellyData.portfolioContext.suggestedShares} shares</strong>
                        <button
                          className="apply-btn"
                          onClick={() => setShares(String(kellyData.portfolioContext.suggestedShares))}
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="kelly-unavailable">
                    <span>Insufficient historical data for analysis</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="dropdown-error">{error}</div>
          )}

          {success && (
            <div className="dropdown-success">
              <Check size={14} />
              Added {shares} shares to {selectedPortfolio?.name}!
            </div>
          )}

          {!success && (
            <>
              {/* Portfolio Selection */}
              <div className="portfolio-section-label">Select Portfolio:</div>
              <div className="portfolio-list">
                {loading ? (
                  <div className="dropdown-loading">
                    <Loader className="spin" size={20} />
                    <span>Loading portfolios...</span>
                  </div>
                ) : portfolios.length === 0 ? (
                  <div className="no-portfolios">
                    No portfolios found. Create one first.
                  </div>
                ) : (
                  portfolios.map(portfolio => {
                    const cashBalance = portfolio.cash_balance || 0;
                    const hasEnoughCash = cashBalance >= totalCost;
                    const isSelected = selectedPortfolio?.id === portfolio.id;

                    return (
                      <button
                        key={portfolio.id}
                        className={`portfolio-option ${isSelected ? 'selected' : ''} ${!hasEnoughCash ? 'insufficient' : ''}`}
                        onClick={() => handleSelectPortfolio(portfolio)}
                        disabled={submitting !== null}
                      >
                        <div className="portfolio-info">
                          <span className="portfolio-name">{portfolio.name}</span>
                          <div className="portfolio-stats">
                            <span className="portfolio-value">
                              Value: {formatCurrency(portfolio.total_value || 0)}
                            </span>
                            <span className={`portfolio-cash ${!hasEnoughCash ? 'low' : ''}`}>
                              Cash: {formatCurrency(cashBalance)}
                            </span>
                          </div>
                        </div>
                        <div className="portfolio-action">
                          {isSelected ? (
                            <Check size={16} className="selected-icon" />
                          ) : (
                            <span className="select-text">Select</span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Confirm Button */}
              {selectedPortfolio && (
                <button
                  className="confirm-add-btn"
                  onClick={handleConfirmAdd}
                  disabled={submitting !== null}
                >
                  {submitting ? (
                    <>
                      <Loader className="spin" size={16} />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Add {shares} share{parseInt(shares) !== 1 ? 's' : ''} to {selectedPortfolio.name}
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AddToPortfolioButton;
