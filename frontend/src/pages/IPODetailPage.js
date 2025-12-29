// frontend/src/pages/IPODetailPage.js
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ipoAPI } from '../services/api';
import './IPODetailPage.css';

// IPO stage definitions
const IPO_STAGES = {
  S1_FILED: { name: 'Registration Filed', description: 'Initial S-1 filed with SEC', color: '#6b7280', order: 1 },
  S1_AMENDED: { name: 'Amendment Filed', description: 'Responding to SEC comments', color: '#3b82f6', order: 2 },
  PRICE_RANGE_SET: { name: 'Price Range Set', description: 'Expected price range disclosed', color: '#8b5cf6', order: 3 },
  EFFECTIVE: { name: 'Registration Effective', description: 'SEC approved, ready to price', color: '#f59e0b', order: 4 },
  PRICED: { name: 'IPO Priced', description: 'Final price set, trading imminent', color: '#10b981', order: 5 },
  TRADING: { name: 'Now Trading', description: 'Listed and trading on exchange', color: '#059669', order: 6 },
  WITHDRAWN: { name: 'Withdrawn', description: 'IPO cancelled', color: '#ef4444', order: -1 }
};

// Format currency
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '-';
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

// Format short date
const formatShortDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

// Timeline Progress Component
function TimelineProgress({ ipo }) {
  const stages = ['S1_FILED', 'S1_AMENDED', 'PRICE_RANGE_SET', 'EFFECTIVE', 'PRICED', 'TRADING'];

  if (ipo.status === 'WITHDRAWN') {
    return (
      <div className="timeline-withdrawn">
        <span className="withdrawn-badge">WITHDRAWN</span>
        <span className="withdrawn-date">on {formatDate(ipo.withdrawn_date)}</span>
      </div>
    );
  }

  const currentIndex = stages.indexOf(ipo.status);

  return (
    <div className="timeline-progress">
      {stages.map((stage, index) => {
        const stageInfo = IPO_STAGES[stage];
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div
            key={stage}
            className={`timeline-step ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}
          >
            <div
              className="step-dot"
              style={{
                backgroundColor: isComplete || isCurrent ? stageInfo.color : '#334155',
                borderColor: isCurrent ? stageInfo.color : 'transparent'
              }}
            />
            <div className="step-label">{stageInfo.name}</div>
            {index < stages.length - 1 && (
              <div
                className="step-line"
                style={{
                  backgroundColor: isComplete ? stageInfo.color : '#334155'
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Data Row Component
function DataRow({ label, value, highlight = false }) {
  return (
    <div className={`data-row ${highlight ? 'highlight' : ''}`}>
      <span className="data-label">{label}</span>
      <span className="data-value">{value || '-'}</span>
    </div>
  );
}

function IPODetailPage() {
  const { id } = useParams();
  const [ipo, setIPO] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistNotes, setWatchlistNotes] = useState('');
  const [showNotesInput, setShowNotesInput] = useState(false);

  useEffect(() => {
    loadIPO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadIPO = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ipoAPI.getOne(id);
      setIPO(res.data);
      setWatchlistNotes(res.data.watchlistNotes || '');
    } catch (err) {
      console.error('Error loading IPO:', err);
      setError(err.response?.data?.error || 'Failed to load IPO details');
    } finally {
      setLoading(false);
    }
  };

  const toggleWatchlist = async () => {
    setWatchlistLoading(true);
    try {
      if (ipo.inWatchlist) {
        await ipoAPI.removeFromWatchlist(id);
      } else {
        await ipoAPI.addToWatchlist(id, watchlistNotes);
      }
      await loadIPO();
    } catch (err) {
      console.error('Error updating watchlist:', err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const saveWatchlistNotes = async () => {
    try {
      await ipoAPI.updateWatchlistNotes(id, watchlistNotes);
      setShowNotesInput(false);
      await loadIPO();
    } catch (err) {
      console.error('Error saving notes:', err);
    }
  };

  if (loading) {
    return <div className="loading">Loading IPO details...</div>;
  }

  if (error) {
    return (
      <div className="error-page">
        <h2>Error</h2>
        <p>{error}</p>
        <Link to="/ipo" className="back-link">Back to Pipeline</Link>
      </div>
    );
  }

  if (!ipo) {
    return (
      <div className="error-page">
        <h2>IPO Not Found</h2>
        <Link to="/ipo" className="back-link">Back to Pipeline</Link>
      </div>
    );
  }

  const currentStage = IPO_STAGES[ipo.status] || { name: ipo.status, color: '#6b7280' };

  return (
    <div className="ipo-detail-page">
      {/* Header */}
      <header className="ipo-detail-header">
        <Link to="/ipo" className="back-link">Back to Pipeline</Link>

        <div className="header-main">
          <div className="header-title">
            <h1>
              <span className="ticker">
                {ipo.ticker_final || ipo.ticker_proposed || 'TBD'}
              </span>
              <span className="company-name">{ipo.company_name}</span>
            </h1>

            <div className="header-badges">
              <span
                className="status-badge"
                style={{ backgroundColor: currentStage.color }}
              >
                {currentStage.name}
              </span>
              {ipo.exchange_final || ipo.exchange_proposed ? (
                <span className="exchange-badge">
                  {ipo.exchange_final || ipo.exchange_proposed}
                </span>
              ) : null}
            </div>
          </div>

          <div className="header-actions">
            <button
              onClick={toggleWatchlist}
              disabled={watchlistLoading}
              className={`watchlist-button ${ipo.inWatchlist ? 'in-watchlist' : ''}`}
            >
              {watchlistLoading ? 'Updating...' : ipo.inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
        </div>

        {currentStage.description && (
          <p className="status-description">{currentStage.description}</p>
        )}
      </header>

      {/* Timeline Progress */}
      <section className="timeline-section">
        <TimelineProgress ipo={ipo} />
      </section>

      {/* Watchlist Notes */}
      {ipo.inWatchlist && (
        <section className="watchlist-notes-section">
          <h3>Watchlist Notes</h3>
          {showNotesInput ? (
            <div className="notes-input-area">
              <textarea
                value={watchlistNotes}
                onChange={(e) => setWatchlistNotes(e.target.value)}
                placeholder="Add notes about this IPO..."
                rows={3}
              />
              <div className="notes-actions">
                <button onClick={saveWatchlistNotes} className="save-button">Save</button>
                <button onClick={() => setShowNotesInput(false)} className="cancel-button">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="notes-display" onClick={() => setShowNotesInput(true)}>
              {ipo.watchlistNotes || 'Click to add notes...'}
            </div>
          )}
        </section>
      )}

      {/* Main Content Grid */}
      <div className="ipo-detail-grid">
        {/* Deal Terms */}
        <section className="detail-card deal-terms">
          <h2>Deal Terms</h2>
          <div className="card-content">
            <DataRow
              label="Price Range"
              value={
                ipo.price_range_low && ipo.price_range_high
                  ? `$${ipo.price_range_low} - $${ipo.price_range_high}`
                  : 'Not set'
              }
            />
            <DataRow
              label="Final Price"
              value={ipo.final_price ? `$${ipo.final_price}` : 'Not priced'}
              highlight={!!ipo.final_price}
            />
            <DataRow
              label="Shares Offered"
              value={ipo.shares_offered ? ipo.shares_offered.toLocaleString() : 'TBD'}
            />
            <DataRow
              label="Deal Size"
              value={ipo.deal_size ? formatCurrency(ipo.deal_size) : 'TBD'}
              highlight={!!ipo.deal_size}
            />
            <DataRow
              label="Overallotment"
              value={ipo.overallotment_shares ? ipo.overallotment_shares.toLocaleString() : '-'}
            />
            <DataRow
              label="Lead Underwriters"
              value={ipo.lead_underwriters}
            />
            {ipo.all_underwriters && ipo.all_underwriters !== ipo.lead_underwriters && (
              <DataRow
                label="All Underwriters"
                value={ipo.all_underwriters}
              />
            )}
          </div>
        </section>

        {/* Company Info */}
        <section className="detail-card company-info">
          <h2>Company Info</h2>
          <div className="card-content">
            <DataRow label="CIK" value={ipo.cik} />
            <DataRow label="Industry" value={ipo.industry} />
            <DataRow label="Sector" value={ipo.sector} />
            <DataRow label="Headquarters" value={ipo.headquarters_state} />
            <DataRow label="Country" value={ipo.headquarters_country || 'United States'} />
            {ipo.employee_count && (
              <DataRow label="Employees" value={ipo.employee_count.toLocaleString()} />
            )}
            {ipo.founded_year && (
              <DataRow label="Founded" value={ipo.founded_year} />
            )}
            {ipo.website && (
              <DataRow
                label="Website"
                value={
                  <a href={ipo.website} target="_blank" rel="noreferrer">
                    {ipo.website.replace(/^https?:\/\//, '')}
                  </a>
                }
              />
            )}
          </div>

          {ipo.business_description && (
            <div className="business-description">
              <h4>Business Description</h4>
              <p>{ipo.business_description}</p>
            </div>
          )}
        </section>

        {/* Pre-IPO Financials */}
        <section className="detail-card financials">
          <h2>Pre-IPO Financials</h2>
          <div className="card-content">
            <DataRow
              label="Revenue (Latest FY)"
              value={formatCurrency(ipo.revenue_latest)}
            />
            <DataRow
              label="Revenue (Prior FY)"
              value={formatCurrency(ipo.revenue_prior_year)}
            />
            {ipo.revenue_latest && ipo.revenue_prior_year && (
              <DataRow
                label="Revenue Growth"
                value={`${(((ipo.revenue_latest - ipo.revenue_prior_year) / ipo.revenue_prior_year) * 100).toFixed(1)}%`}
                highlight={true}
              />
            )}
            <DataRow
              label="Net Income (Latest)"
              value={formatCurrency(ipo.net_income_latest)}
            />
            <DataRow
              label="Net Income (Prior)"
              value={formatCurrency(ipo.net_income_prior_year)}
            />
            <DataRow
              label="Total Assets"
              value={formatCurrency(ipo.total_assets)}
            />
            <DataRow
              label="Total Liabilities"
              value={formatCurrency(ipo.total_liabilities)}
            />
            <DataRow
              label="Stockholders' Equity"
              value={formatCurrency(ipo.stockholders_equity)}
            />
            <DataRow
              label="Cash & Equivalents"
              value={formatCurrency(ipo.cash_and_equivalents)}
            />
          </div>
        </section>

        {/* Timeline */}
        <section className="detail-card timeline">
          <h2>Key Dates</h2>
          <div className="card-content">
            <DataRow
              label="S-1 Filed"
              value={formatDate(ipo.initial_s1_date)}
            />
            <DataRow
              label="Last Amendment"
              value={formatDate(ipo.latest_amendment_date)}
            />
            <DataRow
              label="Total Amendments"
              value={ipo.amendment_count || 0}
            />
            <DataRow
              label="Effective Date"
              value={formatDate(ipo.effective_date)}
            />
            <DataRow
              label="Pricing Date"
              value={formatDate(ipo.pricing_date)}
            />
            <DataRow
              label="Trading Date"
              value={formatDate(ipo.trading_date)}
              highlight={!!ipo.trading_date}
            />
            {ipo.withdrawn_date && (
              <DataRow
                label="Withdrawn Date"
                value={formatDate(ipo.withdrawn_date)}
                highlight={true}
              />
            )}
          </div>
        </section>
      </div>

      {/* SEC Filings Table */}
      <section className="filings-section">
        <h2>SEC Filings ({ipo.filings?.length || 0})</h2>

        {ipo.filings && ipo.filings.length > 0 ? (
          <table className="filings-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Form Type</th>
                <th>Details</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {ipo.filings.map(filing => (
                <tr key={filing.id}>
                  <td>{formatShortDate(filing.filing_date)}</td>
                  <td>
                    <span className="form-type">{filing.form_type}</span>
                    {filing.is_amendment === 1 && (
                      <span className="amendment-badge">#{filing.amendment_number}</span>
                    )}
                  </td>
                  <td>
                    {filing.final_price ? (
                      <span className="filing-price">Final Price: ${filing.final_price}</span>
                    ) : filing.price_range_low ? (
                      <span className="filing-price">
                        Range: ${filing.price_range_low} - ${filing.price_range_high}
                      </span>
                    ) : filing.shares_offered ? (
                      <span className="filing-shares">
                        {filing.shares_offered.toLocaleString()} shares
                      </span>
                    ) : (
                      <span className="filing-no-details">-</span>
                    )}
                  </td>
                  <td>
                    {filing.filing_url ? (
                      <a
                        href={filing.filing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="filing-link"
                      >
                        View on SEC
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-filings">No filings recorded yet</p>
        )}
      </section>

      {/* Link to company page if trading */}
      {ipo.status === 'TRADING' && ipo.company_id && (
        <section className="trading-link-section">
          <Link
            to={`/company/${ipo.ticker_final || ipo.ticker_proposed}`}
            className="company-page-link"
          >
            View Full Company Analysis
          </Link>
        </section>
      )}
    </div>
  );
}

export default IPODetailPage;
