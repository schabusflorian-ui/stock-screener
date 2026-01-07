// frontend/src/components/SmartMoneySignals.js
// Display "Smart Money" signals: 13F activity, insider buys, earnings momentum

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Award,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Percent,
  Calendar
} from 'lucide-react';
import { signalsAPI } from '../services/api';
import './SmartMoneySignals.css';

function SmartMoneySignals() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    newPositions: [],
    increases: [],
    exits: [],
    insiderBuys: [],
    earningsMomentum: [],
    summary: null
  });
  const [activeSection, setActiveSection] = useState('newPositions');
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [newPositions, increases, exits, insiderBuys, earningsMomentum, summary] = await Promise.all([
        signalsAPI.getTop13FNewPositions(30).catch(() => ({ data: [] })),
        signalsAPI.getTop13FIncreases(30).catch(() => ({ data: [] })),
        signalsAPI.getTop13FExits(30).catch(() => ({ data: [] })),
        signalsAPI.getTopOpenMarketBuys(30).catch(() => ({ data: [] })),
        signalsAPI.getTopEarningsMomentum(30, 2).catch(() => ({ data: [] })),
        signalsAPI.getSummary().catch(() => ({ data: null }))
      ]);

      setData({
        newPositions: newPositions.data?.positions || newPositions.data || [],
        increases: increases.data?.positions || increases.data || [],
        exits: exits.data?.positions || exits.data || [],
        insiderBuys: insiderBuys.data?.transactions || insiderBuys.data || [],
        earningsMomentum: earningsMomentum.data?.stocks || earningsMomentum.data || [],
        summary: summary.data
      });
    } catch (err) {
      console.error('Error loading smart money data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatPercent = (value, decimals = 1) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  if (loading) {
    return (
      <div className="smart-money-signals loading">
        <RefreshCw size={24} className="spinning" />
        <span>Loading smart money signals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="smart-money-signals error">
        <AlertCircle size={24} />
        <p>Error loading data: {error}</p>
        <button className="btn btn-secondary" onClick={loadData}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const sections = [
    { id: 'newPositions', label: 'New Positions', icon: TrendingUp, color: 'success', count: data.newPositions.length },
    { id: 'increases', label: 'Increases', icon: TrendingUp, color: 'success', count: data.increases.length },
    { id: 'exits', label: 'Exits', icon: TrendingDown, color: 'danger', count: data.exits.length },
    { id: 'insiderBuys', label: 'Insider Buys', icon: Users, color: 'info', count: data.insiderBuys.length },
    { id: 'earningsMomentum', label: 'Earnings Momentum', icon: BarChart3, color: 'warning', count: data.earningsMomentum.length }
  ];

  return (
    <div className="smart-money-signals">
      {/* Summary Stats */}
      {data.summary && (
        <div className="signals-summary">
          <div className="summary-card">
            <Briefcase size={20} />
            <div className="summary-content">
              <span className="summary-value">{data.summary.thirteenF?.totalInvestors || 0}</span>
              <span className="summary-label">Super-Investors Tracked</span>
            </div>
          </div>
          <div className="summary-card">
            <TrendingUp size={20} />
            <div className="summary-content">
              <span className="summary-value">{data.summary.thirteenF?.recentActivity || 0}</span>
              <span className="summary-label">Recent 13F Changes</span>
            </div>
          </div>
          <div className="summary-card">
            <Users size={20} />
            <div className="summary-content">
              <span className="summary-value">{data.summary.insider?.openMarketBuys || 0}</span>
              <span className="summary-label">Open Market Buys (90d)</span>
            </div>
          </div>
          <div className="summary-card">
            <Award size={20} />
            <div className="summary-content">
              <span className="summary-value">{data.summary.earnings?.beaters || 0}</span>
              <span className="summary-label">Consistent Beaters</span>
            </div>
          </div>
        </div>
      )}

      {/* Section Tabs */}
      <div className="section-tabs">
        {sections.map(section => {
          const IconComponent = section.icon;
          return (
            <button
              key={section.id}
              className={`section-tab ${activeSection === section.id ? 'active' : ''} ${section.color}`}
              onClick={() => setActiveSection(section.id)}
            >
              <IconComponent size={16} />
              <span>{section.label}</span>
              {section.count > 0 && (
                <span className="tab-count">{section.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      <div className="section-content">
        {/* 13F New Positions */}
        {activeSection === 'newPositions' && (
          <div className="signals-section">
            <div className="section-header">
              <h3><TrendingUp size={18} /> New Positions by Super-Investors</h3>
              <p className="section-description">
                Stocks where legendary investors initiated new positions in their latest 13F filings
              </p>
            </div>
            {data.newPositions.length === 0 ? (
              <div className="empty-state">
                <Briefcase size={32} />
                <p>No new positions found in recent filings</p>
              </div>
            ) : (
              <div className="signals-table">
                <div className="table-header">
                  <span className="col-symbol">Symbol</span>
                  <span className="col-investor">Investor</span>
                  <span className="col-value">Value</span>
                  <span className="col-shares">Shares</span>
                  <span className="col-date">Filing Date</span>
                  <span className="col-expand"></span>
                </div>
                {data.newPositions.map((item, idx) => (
                  <div key={`new-${idx}`} className="table-row-wrapper">
                    <div
                      className="table-row clickable"
                      onClick={() => toggleRow(`new-${idx}`)}
                    >
                      <span className="col-symbol">
                        <Link to={`/company/${item.symbol}`} onClick={e => e.stopPropagation()}>
                          {item.symbol}
                        </Link>
                      </span>
                      <span className="col-investor">{item.investor_name || item.investor}</span>
                      <span className="col-value positive">{formatValue(item.value)}</span>
                      <span className="col-shares">{item.shares?.toLocaleString() || '-'}</span>
                      <span className="col-date">{formatDate(item.report_date || item.date)}</span>
                      <span className="col-expand">
                        {expandedRows[`new-${idx}`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                    {expandedRows[`new-${idx}`] && (
                      <div className="expanded-details">
                        {item.company_name && <div className="detail-item"><span>Company:</span> {item.company_name}</div>}
                        {item.portfolio_pct && <div className="detail-item"><span>Portfolio %:</span> {formatPercent(item.portfolio_pct)}</div>}
                        {item.avg_cost && <div className="detail-item"><span>Avg Cost:</span> {formatValue(item.avg_cost)}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 13F Increases */}
        {activeSection === 'increases' && (
          <div className="signals-section">
            <div className="section-header">
              <h3><TrendingUp size={18} /> Position Increases</h3>
              <p className="section-description">
                Existing positions that super-investors significantly increased
              </p>
            </div>
            {data.increases.length === 0 ? (
              <div className="empty-state">
                <Briefcase size={32} />
                <p>No significant position increases found</p>
              </div>
            ) : (
              <div className="signals-table">
                <div className="table-header">
                  <span className="col-symbol">Symbol</span>
                  <span className="col-investor">Investor</span>
                  <span className="col-change">Change %</span>
                  <span className="col-value">New Value</span>
                  <span className="col-date">Filing Date</span>
                  <span className="col-expand"></span>
                </div>
                {data.increases.map((item, idx) => (
                  <div key={`inc-${idx}`} className="table-row-wrapper">
                    <div
                      className="table-row clickable"
                      onClick={() => toggleRow(`inc-${idx}`)}
                    >
                      <span className="col-symbol">
                        <Link to={`/company/${item.symbol}`} onClick={e => e.stopPropagation()}>
                          {item.symbol}
                        </Link>
                      </span>
                      <span className="col-investor">{item.investor_name || item.investor}</span>
                      <span className="col-change positive">+{item.change_pct?.toFixed(0) || item.changePct?.toFixed(0)}%</span>
                      <span className="col-value">{formatValue(item.value || item.new_value)}</span>
                      <span className="col-date">{formatDate(item.report_date || item.date)}</span>
                      <span className="col-expand">
                        {expandedRows[`inc-${idx}`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                    {expandedRows[`inc-${idx}`] && (
                      <div className="expanded-details">
                        {item.company_name && <div className="detail-item"><span>Company:</span> {item.company_name}</div>}
                        {item.previous_shares && <div className="detail-item"><span>Previous Shares:</span> {item.previous_shares.toLocaleString()}</div>}
                        {item.new_shares && <div className="detail-item"><span>New Shares:</span> {item.new_shares.toLocaleString()}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 13F Exits */}
        {activeSection === 'exits' && (
          <div className="signals-section">
            <div className="section-header">
              <h3><TrendingDown size={18} /> Position Exits</h3>
              <p className="section-description">
                Positions that super-investors completely exited (bearish signal)
              </p>
            </div>
            {data.exits.length === 0 ? (
              <div className="empty-state">
                <TrendingDown size={32} />
                <p>No position exits found in recent filings</p>
              </div>
            ) : (
              <div className="signals-table">
                <div className="table-header">
                  <span className="col-symbol">Symbol</span>
                  <span className="col-investor">Investor</span>
                  <span className="col-value">Sold Value</span>
                  <span className="col-shares">Shares Sold</span>
                  <span className="col-date">Filing Date</span>
                  <span className="col-expand"></span>
                </div>
                {data.exits.map((item, idx) => (
                  <div key={`exit-${idx}`} className="table-row-wrapper">
                    <div
                      className="table-row clickable"
                      onClick={() => toggleRow(`exit-${idx}`)}
                    >
                      <span className="col-symbol">
                        <Link to={`/company/${item.symbol}`} onClick={e => e.stopPropagation()}>
                          {item.symbol}
                        </Link>
                      </span>
                      <span className="col-investor">{item.investor_name || item.investor}</span>
                      <span className="col-value negative">{formatValue(item.value || item.previous_value)}</span>
                      <span className="col-shares">{item.shares?.toLocaleString() || item.previous_shares?.toLocaleString() || '-'}</span>
                      <span className="col-date">{formatDate(item.report_date || item.date)}</span>
                      <span className="col-expand">
                        {expandedRows[`exit-${idx}`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                    {expandedRows[`exit-${idx}`] && (
                      <div className="expanded-details">
                        {item.company_name && <div className="detail-item"><span>Company:</span> {item.company_name}</div>}
                        {item.held_quarters && <div className="detail-item"><span>Quarters Held:</span> {item.held_quarters}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Insider Open Market Buys */}
        {activeSection === 'insiderBuys' && (
          <div className="signals-section">
            <div className="section-header">
              <h3><Users size={18} /> Insider Open Market Buys</h3>
              <p className="section-description">
                Executives buying shares with their own money (most bullish insider signal)
              </p>
            </div>
            {data.insiderBuys.length === 0 ? (
              <div className="empty-state">
                <Users size={32} />
                <p>No significant insider buys found</p>
              </div>
            ) : (
              <div className="signals-table">
                <div className="table-header">
                  <span className="col-symbol">Symbol</span>
                  <span className="col-insider">Insider</span>
                  <span className="col-title">Title</span>
                  <span className="col-value">Value</span>
                  <span className="col-date">Date</span>
                  <span className="col-expand"></span>
                </div>
                {data.insiderBuys.map((item, idx) => (
                  <div key={`insider-${idx}`} className="table-row-wrapper">
                    <div
                      className="table-row clickable"
                      onClick={() => toggleRow(`insider-${idx}`)}
                    >
                      <span className="col-symbol">
                        <Link to={`/company/${item.symbol}`} onClick={e => e.stopPropagation()}>
                          {item.symbol}
                        </Link>
                      </span>
                      <span className="col-insider">{item.insider_name || item.insider}</span>
                      <span className="col-title">{item.title || '-'}</span>
                      <span className="col-value positive">{formatValue(item.value)}</span>
                      <span className="col-date">{formatDate(item.transaction_date || item.date)}</span>
                      <span className="col-expand">
                        {expandedRows[`insider-${idx}`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                    {expandedRows[`insider-${idx}`] && (
                      <div className="expanded-details">
                        {item.company_name && <div className="detail-item"><span>Company:</span> {item.company_name}</div>}
                        {item.shares && <div className="detail-item"><span>Shares:</span> {item.shares.toLocaleString()}</div>}
                        {item.price && <div className="detail-item"><span>Price:</span> ${item.price.toFixed(2)}</div>}
                        {item.ownership_pct && <div className="detail-item"><span>Ownership:</span> {item.ownership_pct.toFixed(2)}%</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Earnings Momentum */}
        {activeSection === 'earningsMomentum' && (
          <div className="signals-section">
            <div className="section-header">
              <h3><BarChart3 size={18} /> Earnings Momentum Leaders</h3>
              <p className="section-description">
                Companies with consecutive earnings beats and positive surprise trends
              </p>
            </div>
            {data.earningsMomentum.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={32} />
                <p>No earnings momentum leaders found</p>
              </div>
            ) : (
              <div className="signals-table">
                <div className="table-header">
                  <span className="col-symbol">Symbol</span>
                  <span className="col-streak">Beat Streak</span>
                  <span className="col-rate">Beat Rate</span>
                  <span className="col-surprise">Avg Surprise</span>
                  <span className="col-trend">Trend</span>
                  <span className="col-expand"></span>
                </div>
                {data.earningsMomentum.map((item, idx) => (
                  <div key={`earn-${idx}`} className="table-row-wrapper">
                    <div
                      className="table-row clickable"
                      onClick={() => toggleRow(`earn-${idx}`)}
                    >
                      <span className="col-symbol">
                        <Link to={`/company/${item.symbol}`} onClick={e => e.stopPropagation()}>
                          {item.symbol}
                        </Link>
                      </span>
                      <span className="col-streak">
                        <span className="streak-badge positive">
                          {item.consecutive_beats || item.consecutiveBeats} quarters
                        </span>
                      </span>
                      <span className="col-rate">
                        {((item.beat_rate || item.beatRate) * 100).toFixed(0)}%
                      </span>
                      <span className={`col-surprise ${(item.avg_surprise || item.avgSurprise) > 0 ? 'positive' : 'negative'}`}>
                        {formatPercent(item.avg_surprise || item.avgSurprise)}
                      </span>
                      <span className={`col-trend trend-${item.trend?.toLowerCase() || 'neutral'}`}>
                        {item.trend || '-'}
                      </span>
                      <span className="col-expand">
                        {expandedRows[`earn-${idx}`] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                    {expandedRows[`earn-${idx}`] && (
                      <div className="expanded-details">
                        {item.company_name && <div className="detail-item"><span>Company:</span> {item.company_name}</div>}
                        {item.next_earnings && <div className="detail-item"><span>Next Earnings:</span> {formatDate(item.next_earnings)}</div>}
                        {item.quarters_analyzed && <div className="detail-item"><span>Quarters Analyzed:</span> {item.quarters_analyzed}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="info-box">
        <AlertCircle size={16} />
        <div>
          <strong>About Smart Money Signals</strong>
          <p>
            These signals track institutional investor activity from SEC 13F filings, insider transactions
            from Form 4 filings, and earnings consistency. Super-investors include Berkshire Hathaway,
            Pershing Square, Third Point, and other legendary fund managers. Open market buys (vs.
            option exercises) are considered the strongest bullish insider signal.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SmartMoneySignals;
