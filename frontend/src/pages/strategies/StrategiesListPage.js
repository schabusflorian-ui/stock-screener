// frontend/src/pages/strategies/StrategiesListPage.js
// Strategies List - View and manage all trading strategies

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import './StrategiesListPage.css';

const StrategiesListPage = () => {
  const navigate = useNavigate();
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [strategyDetails, setStrategyDetails] = useState(null);

  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      setLoading(true);
      const response = await api.get('/strategies');
      if (response.data.success) {
        setStrategies(response.data.strategies);
      }
    } catch (err) {
      setError('Failed to load strategies');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadStrategyDetails = async (id) => {
    try {
      const response = await api.get(`/strategies/${id}/summary`);
      if (response.data.success) {
        setStrategyDetails(response.data);
      }
    } catch (err) {
      console.error('Failed to load strategy details:', err);
    }
  };

  const handleSelectStrategy = (strategy) => {
    setSelectedStrategy(strategy);
    loadStrategyDetails(strategy.id);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate this strategy?')) {
      return;
    }

    try {
      await api.delete(`/strategies/${id}`);
      loadStrategies();
      setSelectedStrategy(null);
      setStrategyDetails(null);
    } catch (err) {
      console.error('Failed to delete strategy:', err);
    }
  };

  const handleGenerateSignals = async (id) => {
    try {
      const response = await api.post(`/strategies/${id}/signals`, {
        currentPositions: []
      });

      if (response.data.success) {
        navigate(`/strategies/${id}/signals`, { state: { signals: response.data } });
      }
    } catch (err) {
      console.error('Failed to generate signals:', err);
    }
  };

  if (loading) {
    return <div className="strategies-page loading">Loading strategies...</div>;
  }

  return (
    <div className="strategies-page">
      <header className="strategies-header">
        <div>
          <h1>Trading Strategies</h1>
          <p>Configure and manage your trading strategies</p>
        </div>
        <Link to="/strategies/new" className="create-btn">
          + Create Strategy
        </Link>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="strategies-layout">
        {/* Strategy List */}
        <div className="strategies-list">
          <h3>Your Strategies</h3>
          {strategies.length === 0 ? (
            <div className="no-strategies">
              <p>No strategies yet</p>
              <p>Create your first strategy to get started</p>
            </div>
          ) : (
            <div className="strategy-cards">
              {strategies.map(strategy => (
                <div
                  key={strategy.id}
                  className={`strategy-card ${selectedStrategy?.id === strategy.id ? 'selected' : ''} ${!strategy.isActive ? 'inactive' : ''}`}
                  onClick={() => handleSelectStrategy(strategy)}
                >
                  <div className="strategy-card-header">
                    <h4>{strategy.name}</h4>
                    <span className={`mode-badge ${strategy.mode}`}>
                      {strategy.mode === 'multi' ? 'Multi' : 'Single'}
                    </span>
                  </div>
                  {strategy.description && (
                    <p className="strategy-description">{strategy.description}</p>
                  )}
                  <div className="strategy-meta">
                    <span>Created: {new Date(strategy.createdAt).toLocaleDateString()}</span>
                    {!strategy.isActive && <span className="inactive-badge">Inactive</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strategy Details */}
        <div className="strategy-details">
          {selectedStrategy ? (
            <>
              <div className="details-header">
                <h3>{selectedStrategy.name}</h3>
                <div className="details-actions">
                  <button onClick={() => handleGenerateSignals(selectedStrategy.id)}>
                    Generate Signals
                  </button>
                  <Link to={`/strategies/${selectedStrategy.id}/edit`} className="edit-btn">
                    Edit
                  </Link>
                  <button
                    className="delete-btn"
                    onClick={() => handleDelete(selectedStrategy.id)}
                  >
                    Deactivate
                  </button>
                </div>
              </div>

              {strategyDetails ? (
                <div className="details-content">
                  {/* Mode Info */}
                  <div className="detail-section">
                    <h4>Mode</h4>
                    <p>{strategyDetails.mode === 'multi' ? 'Multi-Strategy' : 'Single Strategy'}</p>
                  </div>

                  {/* Weights (for single strategy) */}
                  {strategyDetails.weights && (
                    <div className="detail-section">
                      <h4>Signal Weights</h4>
                      <div className="weights-display">
                        {Object.entries(strategyDetails.weights).map(([signal, weight]) => (
                          <div key={signal} className="weight-bar">
                            <span className="weight-label">{signal}</span>
                            <div className="weight-bar-bg">
                              <div
                                className="weight-bar-fill"
                                style={{ width: `${weight * 100}%` }}
                              />
                            </div>
                            <span className="weight-value">{(weight * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risk Parameters (for single strategy) */}
                  {strategyDetails.risk && (
                    <div className="detail-section">
                      <h4>Risk Parameters</h4>
                      <div className="params-grid">
                        <div className="param">
                          <span>Max Position</span>
                          <strong>{(strategyDetails.risk.maxPositionSize * 100).toFixed(1)}%</strong>
                        </div>
                        <div className="param">
                          <span>Max Positions</span>
                          <strong>{strategyDetails.risk.maxPositions}</strong>
                        </div>
                        <div className="param">
                          <span>Stop Loss</span>
                          <strong>{(strategyDetails.risk.stopLoss * 100).toFixed(0)}%</strong>
                        </div>
                        <div className="param">
                          <span>Tail Hedge</span>
                          <strong>{(strategyDetails.risk.tailHedgeAllocation * 100).toFixed(1)}%</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Child Strategies (for multi-strategy) */}
                  {strategyDetails.childStrategies && (
                    <div className="detail-section">
                      <h4>Child Strategies</h4>
                      <div className="child-strategies">
                        {strategyDetails.childStrategies.map(child => (
                          <div key={child.id} className="child-strategy">
                            <span className="child-name">{child.name}</span>
                            <span className="child-allocation">
                              {(child.currentAllocation * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Market Context (for multi-strategy) */}
                  {strategyDetails.marketContext && (
                    <div className="detail-section">
                      <h4>Current Market Context</h4>
                      <div className="params-grid">
                        <div className="param">
                          <span>Regime</span>
                          <strong>{strategyDetails.marketContext.regime}</strong>
                        </div>
                        <div className="param">
                          <span>Risk Level</span>
                          <strong className={`risk-${strategyDetails.marketContext.riskLevel}`}>
                            {strategyDetails.marketContext.riskLevel}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reasoning (for multi-strategy) */}
                  {strategyDetails.reasoning && (
                    <div className="detail-section">
                      <h4>Allocation Reasoning</h4>
                      <pre className="reasoning-text">{strategyDetails.reasoning}</pre>
                    </div>
                  )}

                  {/* Holding Period */}
                  {strategyDetails.holdingPeriod && (
                    <div className="detail-section">
                      <h4>Holding Period</h4>
                      <div className="params-grid">
                        <div className="param">
                          <span>Min Days</span>
                          <strong>{strategyDetails.holdingPeriod.min}</strong>
                        </div>
                        <div className="param">
                          <span>Target Days</span>
                          <strong>{strategyDetails.holdingPeriod.target}</strong>
                        </div>
                        {strategyDetails.holdingPeriod.max && (
                          <div className="param">
                            <span>Max Days</span>
                            <strong>{strategyDetails.holdingPeriod.max}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Regime Overlay */}
                  {strategyDetails.regimeEnabled !== undefined && (
                    <div className="detail-section">
                      <h4>Regime Overlay</h4>
                      <p>{strategyDetails.regimeEnabled ? 'Enabled' : 'Disabled'}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="details-loading">Loading details...</div>
              )}
            </>
          ) : (
            <div className="no-selection">
              <p>Select a strategy to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StrategiesListPage;
