// frontend/src/components/portfolio/OrderForm.js
import { useState, useEffect } from 'react';
import { X, Target, AlertCircle, Loader, Search } from '../icons';
import { portfoliosAPI, companyAPI } from '../../services/api';
import './OrderForm.css';

const ORDER_TYPES = [
  { value: 'stop_loss', label: 'Stop Loss', description: 'Sell when price falls to target' },
  { value: 'take_profit', label: 'Take Profit', description: 'Sell when price rises to target' },
  { value: 'limit_buy', label: 'Limit Buy', description: 'Buy when price falls to target' },
  { value: 'trailing_stop', label: 'Trailing Stop', description: 'Dynamic stop that follows price up' }
];

function OrderForm({ portfolioId, holdings, onClose, onComplete }) {
  const [orderType, setOrderType] = useState('stop_loss');
  const [symbol, setSymbol] = useState('');
  const [companyId, setCompanyId] = useState(null);
  const [triggerPrice, setTriggerPrice] = useState('');
  const [shares, setShares] = useState('');
  const [trailingPercent, setTrailingPercent] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // For limit buy search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);

  const selectedHolding = holdings.find(h => h.symbol === symbol);
  const isTrailing = orderType === 'trailing_stop';
  const isLimitBuy = orderType === 'limit_buy';

  // When selecting from holdings, set companyId
  useEffect(() => {
    if (selectedHolding) {
      setCompanyId(selectedHolding.company_id);
    }
  }, [selectedHolding]);

  // Debounced search for limit buy
  useEffect(() => {
    if (!isLimitBuy || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await companyAPI.search(searchQuery);
        setSearchResults(res.data.companies || res.data || []);
        setShowResults(true);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isLimitBuy]);

  // Reset when order type changes
  useEffect(() => {
    setSymbol('');
    setCompanyId(null);
    setSearchQuery('');
    setSearchResults([]);
    setShares('');
    setCurrentPrice(null);
  }, [orderType]);

  const handleSelectCompany = async (company) => {
    setSymbol(company.symbol);
    setCompanyId(company.id);
    setSearchQuery(company.symbol);
    setShowResults(false);
    setSearchResults([]);

    // Fetch current price
    try {
      const res = await companyAPI.getOne(company.symbol);
      const price = res.data.price_metrics?.last_price;
      if (price) {
        setCurrentPrice(price);
      }
    } catch (err) {
      console.error('Failed to fetch price:', err);
    }
  };

  const handleHoldingSelect = (e) => {
    const selectedSymbol = e.target.value;
    setSymbol(selectedSymbol);
    const h = holdings.find(h => h.symbol === selectedSymbol);
    if (h) {
      setCompanyId(h.company_id);
      setShares(h.shares.toString());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!companyId) {
      setError('Please select a valid company');
      return;
    }

    if (!isTrailing && !triggerPrice) {
      setError('Trigger price is required');
      return;
    }

    if (isTrailing && !trailingPercent) {
      setError('Trailing percentage is required for trailing stop orders');
      return;
    }

    if (!shares) {
      setError('Please enter number of shares');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await portfoliosAPI.createOrder(portfolioId, {
        companyId: companyId,
        orderType: orderType,
        triggerPrice: isTrailing ? null : parseFloat(triggerPrice),
        shares: parseFloat(shares),
        trailingPct: isTrailing ? parseFloat(trailingPercent) : null,
        validUntil: expiresAt || null
      });

      onComplete();
    } catch (err) {
      console.error('Order creation failed:', err);
      setError(err.response?.data?.error || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  const formatValue = (value) => {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="order-form-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Target size={20} />
            Create Standing Order
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Order Type Selection */}
            <div className="form-section">
              <label className="form-label">Order Type</label>
              <div className="order-type-grid">
                {ORDER_TYPES.map(type => (
                  <button
                    key={type.value}
                    type="button"
                    className={`order-type-option ${orderType === type.value ? 'active' : ''}`}
                    onClick={() => setOrderType(type.value)}
                  >
                    <span className="option-label">{type.label}</span>
                    <span className="option-description">{type.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Symbol Selection */}
            <div className="form-section">
              <label className="form-label">Symbol</label>
              {isLimitBuy ? (
                <div className="search-container">
                  <div className="search-input-wrapper">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="form-input search-input"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value.toUpperCase());
                        setShowResults(true);
                      }}
                      onFocus={() => searchResults.length > 0 && setShowResults(true)}
                      placeholder="Search by symbol or company name..."
                    />
                    {searching && <Loader className="spinning search-loader" size={16} />}
                  </div>
                  {showResults && searchResults.length > 0 && (
                    <div className="search-results">
                      {searchResults.slice(0, 8).map(company => (
                        <button
                          key={company.id}
                          type="button"
                          className="search-result-item"
                          onClick={() => handleSelectCompany(company)}
                        >
                          <span className="result-symbol">{company.symbol}</span>
                          <span className="result-name">{company.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {symbol && companyId && (
                    <div className="selected-company">
                      <span>Selected: <strong>{symbol}</strong></span>
                      {currentPrice && (
                        <span className="current-price-info">Current: {formatValue(currentPrice)}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <select
                  className="form-select"
                  value={symbol}
                  onChange={handleHoldingSelect}
                >
                  <option value="">Select a holding...</option>
                  {holdings.map(h => (
                    <option key={h.symbol} value={h.symbol}>
                      {h.symbol} - {h.shares.toLocaleString()} shares @ {formatValue(h.current_price)}
                    </option>
                  ))}
                </select>
              )}
              {selectedHolding && !isLimitBuy && (
                <div className="holding-info">
                  Current price: {formatValue(selectedHolding.current_price)}
                </div>
              )}
            </div>

            {/* Trigger Price / Trailing Percent */}
            <div className="form-row">
              {isTrailing ? (
                <div className="form-section">
                  <label className="form-label">Trailing Percent</label>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      className="form-input"
                      value={trailingPercent}
                      onChange={(e) => setTrailingPercent(e.target.value)}
                      min="0.1"
                      step="0.1"
                      placeholder="5"
                    />
                    <span className="input-suffix">%</span>
                  </div>
                  <div className="form-hint">
                    Stop will trail {trailingPercent || '0'}% below the highest price
                  </div>
                </div>
              ) : (
                <div className="form-section">
                  <label className="form-label">Trigger Price</label>
                  <div className="input-with-prefix">
                    <span className="input-prefix">$</span>
                    <input
                      type="number"
                      className="form-input"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      min="0.01"
                      step="0.01"
                      placeholder="150.00"
                    />
                  </div>
                </div>
              )}

              <div className="form-section">
                <label className="form-label">Shares</label>
                <input
                  type="number"
                  className="form-input"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  min="0.0001"
                  step="any"
                  placeholder="100"
                />
              </div>
            </div>

            {/* Expiration */}
            <div className="form-section">
              <label className="form-label">Expires (optional)</label>
              <input
                type="date"
                className="form-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <div className="form-hint">Leave empty for Good-Til-Canceled (GTC)</div>
            </div>

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
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
              disabled={submitting || !companyId || (!triggerPrice && !isTrailing) || !shares}
            >
              {submitting ? (
                <>
                  <Loader className="spinning" size={16} />
                  Creating...
                </>
              ) : (
                <>
                  <Target size={16} />
                  Create Order
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default OrderForm;
