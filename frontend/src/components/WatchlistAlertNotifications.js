// frontend/src/components/WatchlistAlertNotifications.js
// Component to show triggered watchlist price alerts

import { useState } from 'react';
import { Bell, X, TrendingUp, TrendingDown, Check } from 'lucide-react';
import { useWatchlist } from '../context/WatchlistContext';
import { useNavigate } from 'react-router-dom';
import './WatchlistAlertNotifications.css';

function WatchlistAlertNotifications() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { triggeredAlerts, dismissTriggeredAlert, clearTriggeredAlerts } = useWatchlist();
  const navigate = useNavigate();

  if (triggeredAlerts.length === 0) return null;

  const formatPrice = (price) => `$${parseFloat(price).toFixed(2)}`;
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`watchlist-alerts-container ${isExpanded ? 'expanded' : ''}`}>
      <button
        className="alerts-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Bell size={18} />
        <span className="alert-badge">{triggeredAlerts.length}</span>
        <span className="toggle-text">
          {triggeredAlerts.length} Price Alert{triggeredAlerts.length > 1 ? 's' : ''} Triggered
        </span>
      </button>

      {isExpanded && (
        <div className="alerts-panel">
          <div className="alerts-header">
            <h4>Triggered Alerts</h4>
            <button
              className="clear-all-btn"
              onClick={clearTriggeredAlerts}
              title="Dismiss all"
            >
              <Check size={14} />
              Clear All
            </button>
          </div>

          <div className="alerts-list">
            {triggeredAlerts.map(alert => (
              <div key={alert.id} className="alert-notification">
                <div className="alert-main">
                  <span
                    className="alert-symbol"
                    onClick={() => navigate(`/company/${alert.symbol}`)}
                  >
                    {alert.symbol}
                  </span>
                  <span className={`alert-direction ${alert.type}`}>
                    {alert.type === 'above' ? (
                      <><TrendingUp size={12} /> Above</>
                    ) : (
                      <><TrendingDown size={12} /> Below</>
                    )}
                  </span>
                  <span className="alert-target">{formatPrice(alert.targetPrice)}</span>
                </div>
                <div className="alert-details">
                  <span className="current-price">
                    Now: {formatPrice(alert.currentPrice)}
                  </span>
                  <span className="alert-time">
                    {formatTime(alert.triggeredAt)}
                  </span>
                </div>
                {alert.note && (
                  <div className="alert-note">{alert.note}</div>
                )}
                <button
                  className="dismiss-btn"
                  onClick={() => dismissTriggeredAlert(alert.id)}
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default WatchlistAlertNotifications;
