// frontend/src/components/PriceAlertButton.js
// Button component for setting price alerts on watchlist items

import { useState, useRef, useEffect } from 'react';
import { Bell, BellOff, X, TrendingUp, TrendingDown, Trash2, Plus } from 'lucide-react';
import { useWatchlist } from '../context/WatchlistContext';
import './PriceAlertButton.css';

function PriceAlertButton({ symbol, currentPrice }) {
  const [isOpen, setIsOpen] = useState(false);
  const [alertType, setAlertType] = useState('below');
  const [targetPrice, setTargetPrice] = useState('');
  const [note, setNote] = useState('');
  const dropdownRef = useRef(null);

  const { addPriceAlert, removePriceAlert, getAlertsForSymbol } = useWatchlist();
  const symbolAlerts = getAlertsForSymbol(symbol);
  const activeAlerts = symbolAlerts.filter(a => !a.triggered);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Set default target based on alert type and current price
  useEffect(() => {
    if (currentPrice && isOpen) {
      if (alertType === 'below') {
        setTargetPrice((currentPrice * 0.9).toFixed(2)); // 10% below
      } else {
        setTargetPrice((currentPrice * 1.1).toFixed(2)); // 10% above
      }
    }
  }, [alertType, isOpen, currentPrice]);

  const handleAddAlert = () => {
    if (!targetPrice || parseFloat(targetPrice) <= 0) return;

    addPriceAlert(symbol, alertType, targetPrice, note);
    setTargetPrice('');
    setNote('');
  };

  const formatPrice = (price) => {
    return price ? `$${parseFloat(price).toFixed(2)}` : '-';
  };

  return (
    <div className="price-alert-wrapper" ref={dropdownRef}>
      <button
        className={`price-alert-btn ${activeAlerts.length > 0 ? 'has-alerts' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={activeAlerts.length > 0 ? `${activeAlerts.length} active alert(s)` : 'Set price alert'}
      >
        {activeAlerts.length > 0 ? (
          <>
            <Bell size={14} />
            <span className="alert-count">{activeAlerts.length}</span>
          </>
        ) : (
          <BellOff size={14} />
        )}
      </button>

      {isOpen && (
        <div className="price-alert-dropdown">
          <div className="dropdown-header">
            <Bell size={16} />
            <span>Price Alerts for {symbol}</span>
            <button className="close-btn" onClick={() => setIsOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {currentPrice && (
            <div className="current-price">
              Current: <strong>{formatPrice(currentPrice)}</strong>
            </div>
          )}

          {/* Add New Alert Form */}
          <div className="add-alert-form">
            <div className="alert-type-selector">
              <button
                className={`type-btn ${alertType === 'below' ? 'active' : ''}`}
                onClick={() => setAlertType('below')}
              >
                <TrendingDown size={14} />
                Below
              </button>
              <button
                className={`type-btn ${alertType === 'above' ? 'active' : ''}`}
                onClick={() => setAlertType('above')}
              >
                <TrendingUp size={14} />
                Above
              </button>
            </div>

            <div className="price-input-row">
              <span className="currency-prefix">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="Target price"
              />
            </div>

            <input
              type="text"
              className="note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note..."
              maxLength={100}
            />

            <button className="add-alert-btn" onClick={handleAddAlert}>
              <Plus size={14} />
              Add Alert
            </button>
          </div>

          {/* Existing Alerts List */}
          {symbolAlerts.length > 0 && (
            <div className="alerts-list">
              <div className="alerts-header">Active Alerts</div>
              {symbolAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={`alert-item ${alert.triggered ? 'triggered' : ''}`}
                >
                  <div className="alert-info">
                    <span className={`alert-type ${alert.type}`}>
                      {alert.type === 'above' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {alert.type === 'above' ? 'Above' : 'Below'}
                    </span>
                    <span className="alert-target">{formatPrice(alert.targetPrice)}</span>
                    {alert.triggered && (
                      <span className="triggered-badge">Triggered!</span>
                    )}
                  </div>
                  {alert.note && (
                    <div className="alert-note">{alert.note}</div>
                  )}
                  <button
                    className="delete-alert-btn"
                    onClick={() => removePriceAlert(alert.id)}
                    title="Delete alert"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {symbolAlerts.length === 0 && (
            <div className="no-alerts">
              No alerts set for {symbol}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PriceAlertButton;
