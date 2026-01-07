// frontend/src/components/portfolio/AddToPortfolioButton.js
import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, X, Briefcase, Check, Loader, DollarSign, TrendingUp } from 'lucide-react';
import { portfoliosAPI } from '../../services/api';
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
  const dropdownRef = useRef(null);

  // Calculate total cost
  const totalCost = useMemo(() => {
    const shareCount = parseInt(shares) || 0;
    return currentPrice ? shareCount * currentPrice : 0;
  }, [shares, currentPrice]);

  // Load portfolios when popup opens
  useEffect(() => {
    if (isOpen) {
      loadPortfolios();
    }
  }, [isOpen]);

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
