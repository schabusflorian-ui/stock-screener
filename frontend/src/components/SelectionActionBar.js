// frontend/src/components/SelectionActionBar.js
// Reusable selection action bar for bulk actions on selected items
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Briefcase, X, Check, ChevronDown, Star, Download } from './icons';
import { portfoliosAPI } from '../services/api';
import './SelectionActionBar.css';

export function SelectionActionBar({
  selectedItems,
  onClear,
  showRemove = false,
  onRemove,
  showWatchlist = false,
  onAddToWatchlist,
  showExport = false,
  onExport,
  itemType = 'stocks'
}) {
  const navigate = useNavigate();
  const [portfolios, setPortfolios] = useState([]);
  const [showPortfolioDropdown, setShowPortfolioDropdown] = useState(false);
  const [addingToPortfolio, setAddingToPortfolio] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // Load portfolios when dropdown opens
  useEffect(() => {
    if (showPortfolioDropdown && portfolios.length === 0) {
      portfoliosAPI.getAll()
        .then(res => setPortfolios(res.data?.portfolios || []))
        .catch(err => console.error('Failed to load portfolios:', err));
    }
  }, [showPortfolioDropdown, portfolios.length]);

  // Auto-hide success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  if (!selectedItems || selectedItems.length === 0) {
    return null;
  }

  const handleCompare = () => {
    const symbols = selectedItems.join(',');
    navigate(`/compare?symbols=${symbols}`);
  };

  const handleAddToPortfolio = async (portfolioId, portfolioName) => {
    setAddingToPortfolio(true);
    try {
      // Add each selected symbol to the portfolio with 1 share
      const promises = selectedItems.map(symbol =>
        portfoliosAPI.addPosition(portfolioId, {
          symbol,
          shares: 1,
          avg_price: null // Let the API fetch current price
        }).catch(err => {
          // Ignore "already exists" errors for bulk add
          if (!err.response?.data?.error?.includes('already')) {
            throw err;
          }
        })
      );
      await Promise.all(promises);
      setSuccessMessage(`Added ${selectedItems.length} ${itemType} to ${portfolioName}`);
      setShowPortfolioDropdown(false);
      onClear();
    } catch (error) {
      console.error('Failed to add to portfolio:', error);
    } finally {
      setAddingToPortfolio(false);
    }
  };

  return (
    <div className="selection-action-bar">
      <div className="selection-info">
        <span className="selection-count">{selectedItems.length}</span>
        <span className="selection-label">selected</span>
      </div>

      <div className="selection-actions">
        {/* Compare button - only show if 2-5 items selected */}
        {selectedItems.length >= 2 && selectedItems.length <= 5 && (
          <button className="action-btn compare" onClick={handleCompare}>
            <BarChart3 size={14} />
            <span>Compare ({selectedItems.length})</span>
          </button>
        )}
        {selectedItems.length > 5 && (
          <button className="action-btn compare disabled" disabled title="Max 5 stocks for comparison">
            <BarChart3 size={14} />
            <span>Compare (max 5)</span>
          </button>
        )}

        {/* Add to Portfolio dropdown */}
        <div className="portfolio-dropdown-wrapper">
          <button
            className="action-btn portfolio"
            onClick={() => setShowPortfolioDropdown(!showPortfolioDropdown)}
          >
            <Briefcase size={14} />
            <span>Add to Portfolio</span>
            <ChevronDown size={12} />
          </button>
          {showPortfolioDropdown && (
            <div className="portfolio-dropdown">
              {portfolios.length === 0 ? (
                <div className="dropdown-loading">Loading portfolios...</div>
              ) : (
                portfolios.map(p => (
                  <button
                    key={p.id}
                    className="dropdown-item"
                    onClick={() => handleAddToPortfolio(p.id, p.name)}
                    disabled={addingToPortfolio}
                  >
                    {p.name}
                  </button>
                ))
              )}
              {portfolios.length === 0 && (
                <button
                  className="dropdown-item create-new"
                  onClick={() => navigate('/portfolios')}
                >
                  Create Portfolio...
                </button>
              )}
            </div>
          )}
        </div>

        {/* Add to Watchlist button */}
        {showWatchlist && onAddToWatchlist && (
          <button className="action-btn watchlist" onClick={onAddToWatchlist}>
            <Star size={14} />
            <span>Add to Watchlist ({selectedItems.length})</span>
          </button>
        )}

        {/* Export button */}
        {showExport && onExport && (
          <button className="action-btn export" onClick={onExport}>
            <Download size={14} />
            <span>Export ({selectedItems.length})</span>
          </button>
        )}

        {/* Remove button (for watchlist) */}
        {showRemove && onRemove && (
          <button className="action-btn remove" onClick={onRemove}>
            <X size={14} />
            <span>Remove ({selectedItems.length})</span>
          </button>
        )}

        {/* Clear selection */}
        <button className="action-btn clear" onClick={onClear}>
          <X size={14} />
          <span>Clear</span>
        </button>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="selection-success">
          <Check size={14} />
          <span>{successMessage}</span>
        </div>
      )}
    </div>
  );
}

export default SelectionActionBar;
