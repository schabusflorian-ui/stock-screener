// frontend/src/components/portfolio/AddToPortfolioButton.js
import { useState, useEffect, useRef } from 'react';
import { Plus, X, Briefcase, Check, Loader } from 'lucide-react';
import { portfoliosAPI } from '../../services/api';
import './AddToPortfolioButton.css';

function AddToPortfolioButton({ symbol, companyId, companyName, currentPrice }) {
  const [isOpen, setIsOpen] = useState(false);
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(null);
  const [shares, setShares] = useState('1');
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const dropdownRef = useRef(null);

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

  const handleAddToPortfolio = async (portfolio) => {
    if (!shares || parseInt(shares) < 1) {
      setError('Please enter at least 1 share');
      return;
    }

    setSubmitting(portfolio.id);
    setError(null);
    try {
      await portfoliosAPI.addHolding(portfolio.id, {
        symbol,
        company_id: companyId,
        shares: parseInt(shares),
        avg_cost: currentPrice || 0
      });
      setSuccess(portfolio.id);
      setTimeout(() => {
        setSuccess(null);
        setIsOpen(false);
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

          <div className="shares-input">
            <label>Shares:</label>
            <input
              type="number"
              min="1"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="1"
            />
            {currentPrice && (
              <span className="total-value">
                ≈ ${(currentPrice * parseInt(shares || 0)).toLocaleString()}
              </span>
            )}
          </div>

          {error && (
            <div className="dropdown-error">{error}</div>
          )}

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
              portfolios.map(portfolio => (
                <button
                  key={portfolio.id}
                  className={`portfolio-option ${success === portfolio.id ? 'success' : ''}`}
                  onClick={() => handleAddToPortfolio(portfolio)}
                  disabled={submitting !== null}
                >
                  <div className="portfolio-info">
                    <span className="portfolio-name">{portfolio.name}</span>
                    <span className="portfolio-value">
                      ${(portfolio.total_value || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="portfolio-action">
                    {submitting === portfolio.id ? (
                      <Loader className="spin" size={16} />
                    ) : success === portfolio.id ? (
                      <Check size={16} className="success-icon" />
                    ) : (
                      <Plus size={16} />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AddToPortfolioButton;
