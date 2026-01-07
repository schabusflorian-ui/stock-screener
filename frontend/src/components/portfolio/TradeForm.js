// frontend/src/components/portfolio/TradeForm.js
import { useState, useEffect, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, Loader, Search, AlertCircle, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { portfoliosAPI, companyAPI } from '../../services/api';
import './TradeForm.css';

function TradeForm({ portfolioId, holdings, cashBalance, onClose, onComplete }) {
  const [tradeType, setTradeType] = useState('buy');
  const [symbol, setSymbol] = useState('');
  const [companyId, setCompanyId] = useState(null);
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);

  // Risk assessment state
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [marginOfSafety, setMarginOfSafety] = useState(null);
  const [validating, setValidating] = useState(false);
  const [acknowledgeWarnings, setAcknowledgeWarnings] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  const existingHolding = holdings?.find(h => h.symbol?.toUpperCase() === symbol.toUpperCase());

  // Validate trade with risk assessment (debounced)
  const validateTrade = useCallback(async () => {
    if (!companyId || !shares || !price || parseFloat(shares) <= 0 || tradeType !== 'buy') {
      setRiskAssessment(null);
      setMarginOfSafety(null);
      return;
    }

    try {
      setValidating(true);
      const res = await portfoliosAPI.validateTrade(portfolioId, {
        symbol: symbol.toUpperCase(),
        side: tradeType,
        shares: parseFloat(shares),
        price: parseFloat(price),
        includeRisk: true
      });

      setRiskAssessment(res.data.riskAssessment);
      setMarginOfSafety(res.data.marginOfSafety);
    } catch (err) {
      console.error('Validation failed:', err);
    } finally {
      setValidating(false);
    }
  }, [portfolioId, companyId, symbol, shares, price, tradeType]);

  // Debounce risk validation
  useEffect(() => {
    if (tradeType !== 'buy') return;

    const timer = setTimeout(() => {
      validateTrade();
    }, 500);

    return () => clearTimeout(timer);
  }, [validateTrade, tradeType]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 1) {
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
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch current price when company is selected
  const handleSelectCompany = async (company) => {
    setSymbol(company.symbol);
    setCompanyId(company.id);
    setSearchQuery(company.symbol);
    setShowResults(false);
    setSearchResults([]);
    setCompanyInfo(company);

    // Fetch real-time price
    try {
      const res = await companyAPI.getOne(company.symbol);
      const currentPrice = res.data.price_metrics?.last_price;
      if (currentPrice) {
        setPrice(currentPrice.toFixed(2));
        setCompanyInfo({
          ...res.data.company,
          current_price: currentPrice
        });
      }
    } catch (err) {
      console.error('Failed to fetch price:', err);
    }
  };

  const totalCost = parseFloat(shares || 0) * parseFloat(price || 0);
  const availableCash = cashBalance ?? 0;
  const canAfford = tradeType === 'buy' ? totalCost <= availableCash : true;
  const canSell = tradeType === 'sell' ? (existingHolding?.shares || 0) >= parseFloat(shares || 0) : true;

  // Form validity check
  const isFormValid = symbol && shares && parseFloat(shares) > 0 && price && parseFloat(price) > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isFormValid) {
      setError('Please fill in all fields');
      return;
    }

    if (tradeType === 'buy' && !canAfford) {
      setError('Insufficient cash balance');
      return;
    }

    if (tradeType === 'sell' && !canSell) {
      setError('Not enough shares to sell');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await portfoliosAPI.trade(portfolioId, {
        type: tradeType,
        symbol: symbol.toUpperCase(),
        shares: parseFloat(shares),
        price: parseFloat(price),
        acknowledgeWarnings: acknowledgeWarnings
      });

      onComplete();
    } catch (err) {
      console.error('Trade failed:', err);
      const errorData = err.response?.data;
      if (errorData?.riskAssessment) {
        setRiskAssessment(errorData.riskAssessment);
        setError(errorData.message || 'Trade blocked by risk checks');
      } else {
        setError(errorData?.error || 'Trade failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Render risk assessment panel
  const renderRiskAssessment = () => {
    if (tradeType !== 'buy' || !companyId) return null;

    return (
      <div className="risk-assessment-panel">
        <div className="risk-header">
          <Shield size={16} />
          <span>Risk Assessment</span>
          {validating && <Loader className="spinning" size={14} />}
        </div>

        {/* Margin of Safety */}
        {marginOfSafety && !marginOfSafety.error && (
          <div className={`mos-indicator ${marginOfSafety.marginOfSafety >= 0.25 ? 'positive' : marginOfSafety.marginOfSafety >= 0 ? 'neutral' : 'negative'}`}>
            <div className="mos-label">Margin of Safety</div>
            <div className="mos-value">
              {marginOfSafety.marginOfSafety !== null
                ? `${(marginOfSafety.marginOfSafety * 100).toFixed(1)}%`
                : 'N/A'}
            </div>
            {marginOfSafety.valuationSignal && (
              <div className="mos-signal">{marginOfSafety.valuationSignal.replace(/_/g, ' ')}</div>
            )}
            {marginOfSafety.intrinsicValue && (
              <div className="mos-detail">
                Intrinsic Value: ${marginOfSafety.intrinsicValue.toFixed(2)}
              </div>
            )}
          </div>
        )}

        {/* Risk Check Results */}
        {riskAssessment && !riskAssessment.error && (
          <div className="risk-checks">
            {riskAssessment.approved ? (
              <div className="risk-status approved">
                <CheckCircle size={14} />
                <span>Risk checks passed</span>
              </div>
            ) : (
              <div className="risk-status blocked">
                <AlertCircle size={14} />
                <span>Trade blocked</span>
              </div>
            )}

            {/* Blockers */}
            {riskAssessment.blockers?.length > 0 && (
              <div className="risk-blockers">
                {riskAssessment.blockers.map((b, i) => (
                  <div key={i} className="risk-blocker-item">
                    <AlertCircle size={12} />
                    {b}
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {riskAssessment.warnings?.length > 0 && (
              <div className="risk-warnings">
                {riskAssessment.warnings.map((w, i) => (
                  <div key={i} className="risk-warning-item">
                    <AlertTriangle size={12} />
                    {w}
                  </div>
                ))}
                <label className="acknowledge-checkbox">
                  <input
                    type="checkbox"
                    checked={acknowledgeWarnings}
                    onChange={(e) => setAcknowledgeWarnings(e.target.checked)}
                  />
                  I acknowledge these warnings and want to proceed
                </label>
              </div>
            )}

            {/* Individual Check Results */}
            {riskAssessment.checks && (
              <div className="risk-check-details">
                {Object.entries(riskAssessment.checks).map(([key, check]) => (
                  <div key={key} className={`check-item ${check.passed ? 'passed' : 'failed'}`}>
                    {check.passed ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                    <span className="check-name">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const formatValue = (value) => {
    const num = value ?? 0;
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const clearSelection = () => {
    setSymbol('');
    setCompanyId(null);
    setSearchQuery('');
    setCompanyInfo(null);
    setPrice('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="trade-form-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {tradeType === 'buy' ? (
              <><TrendingUp size={20} /> Buy Stock</>
            ) : (
              <><TrendingDown size={20} /> Sell Stock</>
            )}
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Trade Type Toggle */}
            <div className="trade-type-toggle">
              <button
                type="button"
                className={`toggle-btn buy ${tradeType === 'buy' ? 'active' : ''}`}
                onClick={() => setTradeType('buy')}
              >
                <TrendingUp size={16} />
                Buy
              </button>
              <button
                type="button"
                className={`toggle-btn sell ${tradeType === 'sell' ? 'active' : ''}`}
                onClick={() => setTradeType('sell')}
              >
                <TrendingDown size={16} />
                Sell
              </button>
            </div>

            {/* Symbol Selection - Different UI for Buy vs Sell */}
            <div className="form-section">
              <label className="form-label">Symbol</label>

              {/* For SELL: Show dropdown of current holdings */}
              {tradeType === 'sell' ? (
                <div className="holdings-selector">
                  {holdings && holdings.length > 0 ? (
                    <>
                      <select
                        className="form-input holdings-dropdown"
                        value={symbol}
                        onChange={(e) => {
                          const selectedHolding = holdings.find(h => h.symbol === e.target.value);
                          if (selectedHolding) {
                            setSymbol(selectedHolding.symbol);
                            setCompanyId(selectedHolding.company_id);
                            setCompanyInfo({
                              name: selectedHolding.name || selectedHolding.symbol,
                              current_price: selectedHolding.current_price
                            });
                            if (selectedHolding.current_price) {
                              setPrice(selectedHolding.current_price.toFixed(2));
                            }
                          }
                        }}
                      >
                        <option value="">Select a holding to sell...</option>
                        {holdings.map(h => (
                          <option key={h.company_id || h.symbol} value={h.symbol}>
                            {h.symbol} - {h.shares?.toLocaleString()} shares @ {formatValue(h.current_price)}
                          </option>
                        ))}
                      </select>
                      {existingHolding && (
                        <div className="holding-info">
                          You own {existingHolding.shares.toLocaleString()} shares (worth {formatValue(existingHolding.current_value)})
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="no-holdings-message">
                      <AlertCircle size={16} />
                      No holdings to sell. Buy some stocks first.
                    </div>
                  )}
                </div>
              ) : (
                /* For BUY: Show search input */
                <div className="search-container">
                  <div className="search-input-wrapper">
                    <Search size={16} className="search-icon" />
                    <input
                      type="text"
                      className="form-input search-input"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value.toUpperCase());
                        if (symbol && e.target.value.toUpperCase() !== symbol) {
                          clearSelection();
                        }
                        setShowResults(true);
                      }}
                      onFocus={() => searchResults.length > 0 && setShowResults(true)}
                      placeholder="Search by symbol or company name..."
                    />
                    {searching && <Loader className="spinning search-loader" size={16} />}
                  </div>

                  {showResults && searchResults.length > 0 && !companyId && (
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
                </div>
              )}

              {/* Selected stock info - only show for buy mode */}
              {tradeType === 'buy' && companyInfo && companyId && (
                <div className="selected-stock">
                  <div className="stock-details">
                    <span className="stock-symbol">{symbol}</span>
                    <span className="stock-name">{companyInfo.name}</span>
                  </div>
                  {companyInfo.current_price && (
                    <div className="stock-price">
                      {formatValue(companyInfo.current_price)}
                    </div>
                  )}
                  <button type="button" className="clear-btn" onClick={clearSelection}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Shares Input */}
            <div className="form-row">
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

              <div className="form-section">
                <label className="form-label">Price per Share</label>
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    type="text"
                    className="form-input price-readonly"
                    value={price || '-'}
                    readOnly
                    placeholder="Select a stock"
                  />
                </div>
                <div className="price-hint">Current market price</div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="order-summary">
              <div className="summary-row">
                <span>Total {tradeType === 'buy' ? 'Cost' : 'Proceeds'}</span>
                <span className="summary-value">{formatValue(totalCost)}</span>
              </div>
              <div className="summary-row">
                <span>Cash Available</span>
                <span>{formatValue(availableCash)}</span>
              </div>
              {tradeType === 'buy' && (
                <div className="summary-row">
                  <span>Remaining Cash</span>
                  <span className={availableCash - totalCost < 0 ? 'negative' : ''}>
                    {formatValue(availableCash - totalCost)}
                  </span>
                </div>
              )}
            </div>

            {/* Risk Assessment Panel */}
            {renderRiskAssessment()}

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
              className={`btn ${tradeType === 'buy' ? 'btn-buy' : 'btn-sell'}`}
              disabled={submitting || !isFormValid || (tradeType === 'buy' && !canAfford) || (tradeType === 'sell' && !canSell)}
            >
              {submitting ? (
                <>
                  <Loader className="spinning" size={16} />
                  Processing...
                </>
              ) : (
                <>
                  {tradeType === 'buy' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {tradeType === 'buy' ? 'Buy' : 'Sell'} {symbol || 'Stock'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default TradeForm;
