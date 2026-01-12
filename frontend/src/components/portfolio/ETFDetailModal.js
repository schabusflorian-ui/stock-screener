// frontend/src/components/portfolio/ETFDetailModal.js
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Loader, TrendingUp, PieChart, DollarSign, Percent, RefreshCw } from 'lucide-react';
import { etfsAPI } from '../../services/api';
import './ETFDetailModal.css';

function ETFDetailModal({ symbol, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [etfData, setEtfData] = useState(null);
  const [holdings, setHoldings] = useState([]);

  useEffect(() => {
    loadETFData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const loadETFData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch ETF holdings (includes ETF metadata)
      const holdingsRes = await etfsAPI.getHoldings(symbol, { limit: 20 });

      if (holdingsRes.data.etf) {
        setEtfData(holdingsRes.data.etf);
      }
      setHoldings(holdingsRes.data.holdings || []);
    } catch (err) {
      console.error('Error loading ETF data:', err);
      setError(err.message || 'Failed to load ETF data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      await etfsAPI.refreshHoldings(symbol);
      await loadETFData();
    } catch (err) {
      console.error('Error refreshing ETF holdings:', err);
      setError('Failed to refresh holdings');
      setLoading(false);
    }
  };

  const formatExpenseRatio = (value) => {
    if (value === null || value === undefined) return '-';
    return `${(value * 100).toFixed(3)}%`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="etf-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <PieChart size={20} />
            <div className="etf-title-info">
              <h2>{symbol}</h2>
              {etfData?.name && <span className="etf-name">{etfData.name}</span>}
            </div>
          </div>
          <div className="header-actions">
            <button
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh holdings from Yahoo Finance"
            >
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            </button>
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <Loader size={32} className="spinning" />
              <p>Loading ETF data...</p>
            </div>
          )}

          {error && !loading && (
            <div className="error-state">
              <p>{error}</p>
              <button className="btn btn-secondary" onClick={loadETFData}>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* ETF Overview */}
              {etfData && (
                <div className="etf-overview">
                  <div className="overview-grid">
                    {etfData.expense_ratio !== null && (
                      <div className="overview-item">
                        <Percent size={16} />
                        <div>
                          <span className="label">Expense Ratio</span>
                          <span className="value">{formatExpenseRatio(etfData.expense_ratio)}</span>
                        </div>
                      </div>
                    )}
                    {etfData.category && (
                      <div className="overview-item">
                        <PieChart size={16} />
                        <div>
                          <span className="label">Category</span>
                          <span className="value">{etfData.category.replace(/-/g, ' ')}</span>
                        </div>
                      </div>
                    )}
                    {etfData.asset_class && (
                      <div className="overview-item">
                        <TrendingUp size={16} />
                        <div>
                          <span className="label">Asset Class</span>
                          <span className="value">{etfData.asset_class}</span>
                        </div>
                      </div>
                    )}
                    {etfData.aum && (
                      <div className="overview-item">
                        <DollarSign size={16} />
                        <div>
                          <span className="label">AUM</span>
                          <span className="value">${(etfData.aum / 1e9).toFixed(1)}B</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {etfData.description && (
                    <p className="etf-description">{etfData.description}</p>
                  )}
                </div>
              )}

              {/* Holdings Table */}
              <div className="holdings-section">
                <h3>Top Holdings</h3>
                {holdings.length > 0 ? (
                  <div className="holdings-table-wrapper">
                    <table className="holdings-table">
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Name</th>
                          <th className="text-right">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map((holding, idx) => (
                          <tr key={idx}>
                            <td className="symbol-cell">
                              {holding.symbol && holding.company_id ? (
                                <Link to={`/company/${holding.symbol}`} onClick={onClose}>
                                  {holding.symbol}
                                </Link>
                              ) : (
                                <span className="symbol-text">{holding.symbol || holding.security_name || '-'}</span>
                              )}
                            </td>
                            <td className="name-cell">
                              {holding.security_name || holding.company_name || holding.symbol || '-'}
                            </td>
                            <td className="weight-cell text-right">
                              {holding.weight?.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-holdings">
                    <p>No holdings data available.</p>
                    <button className="btn btn-primary" onClick={handleRefresh}>
                      <RefreshCw size={16} />
                      Fetch Holdings
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ETFDetailModal;
