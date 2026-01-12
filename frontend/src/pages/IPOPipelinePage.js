// frontend/src/pages/IPOPipelinePage.js
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ipoAPI } from '../services/api';
import { PageHeader, Button } from '../components/ui';
import { SkeletonIPOPipeline } from '../components/Skeleton';
import { useFormatters } from '../hooks/useFormatters';
import './IPOPipelinePage.css';

// IPO stage definitions with colors
const IPO_STAGES = {
  S1_FILED: { name: 'Filed', shortName: 'Filed', color: '#6b7280', order: 1 },
  S1_AMENDED: { name: 'Amended', shortName: 'Amended', color: '#3b82f6', order: 2 },
  PRICE_RANGE_SET: { name: 'Price Set', shortName: 'Price Set', color: '#8b5cf6', order: 3 },
  EFFECTIVE: { name: 'Effective', shortName: 'Effective', color: '#f59e0b', order: 4 },
  PRICED: { name: 'Priced', shortName: 'Priced', color: '#10b981', order: 5 }
};

// Region definitions
const IPO_REGIONS = {
  all: { name: 'All Regions', flag: '🌍' },
  US: { name: 'United States', flag: '🇺🇸', regulator: 'SEC' },
  EU: { name: 'European Union', flag: '🇪🇺', regulator: 'ESMA' },
  UK: { name: 'United Kingdom', flag: '🇬🇧', regulator: 'FCA' }
};

// IPO Card Component
function IPOCard({ ipo, formatCurrency, formatDate }) {
  const region = IPO_REGIONS[ipo.region] || IPO_REGIONS.US;

  return (
    <Link to={`/ipo/${ipo.id}`} className="ipo-card">
      <div className="ipo-card-header">
        <div className="ipo-ticker">
          {ipo.ticker_proposed || ipo.ticker_final || '???'}
        </div>
        <div className="ipo-header-right">
          {ipo.region && ipo.region !== 'US' && (
            <span className="ipo-region-badge" title={region.name}>
              {region.flag}
            </span>
          )}
          {ipo.exchange_proposed && (
            <span className="ipo-exchange">{ipo.exchange_proposed}</span>
          )}
        </div>
      </div>

      <div className="ipo-company-name">{ipo.company_name}</div>

      <div className="ipo-card-meta">
        {ipo.sector && <span className="ipo-sector">{ipo.sector}</span>}
        {ipo.industry && <span className="ipo-industry">{ipo.industry}</span>}
      </div>

      {(ipo.price_range_low || ipo.final_price) && (
        <div className="ipo-price-info">
          {ipo.final_price ? (
            <span className="final-price">${ipo.final_price}</span>
          ) : (
            <span className="price-range">
              ${ipo.price_range_low} - ${ipo.price_range_high}
            </span>
          )}
        </div>
      )}

      {ipo.deal_size > 0 && (
        <div className="ipo-deal-size">
          {formatCurrency(ipo.deal_size)} deal
        </div>
      )}

      <div className="ipo-card-footer">
        <span className="ipo-date">
          {ipo.region === 'US' ? 'Filed' : 'Approved'}: {formatDate(ipo.initial_s1_date || ipo.approval_date)}
        </span>
        {ipo.amendment_count > 0 && (
          <span className="ipo-amendments">{ipo.amendment_count} amendments</span>
        )}
      </div>
    </Link>
  );
}

// Stats Bar Component
function StatsBar({ statistics, formatCurrency }) {
  if (!statistics) return null;

  return (
    <div className="ipo-stats-bar">
      <div className="stat-item">
        <span className="stat-value">{statistics.total_active || 0}</span>
        <span className="stat-label">Active IPOs</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{statistics.priced || 0}</span>
        <span className="stat-label">Ready to Trade</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{statistics.price_set || 0}</span>
        <span className="stat-label">Price Set</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{statistics.completed_last_30_days || 0}</span>
        <span className="stat-label">Completed (30d)</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{formatCurrency(statistics.total_deal_size)}</span>
        <span className="stat-label">Total Deal Size</span>
      </div>
    </div>
  );
}

function IPOPipelinePage() {
  const fmt = useFormatters();

  // Format functions using preferences
  const formatCurrency = (value) => {
    if (!value) return '-';
    return fmt.currency(value, { compact: true });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return fmt.date(dateStr);
  };
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'list'
  const [selectedRegion, setSelectedRegion] = useState('all'); // 'all' | 'US' | 'EU' | 'UK'
  const [pipeline, setPipeline] = useState({});
  const [listData, setListData] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [filters, setFilters] = useState({
    sector: '',
    sortBy: 'initial_s1_date',
    sortOrder: 'DESC'
  });
  const [filterType, setFilterType] = useState('all'); // 'all' | 'watchlist' | 'recent'
  const [watchlistData, setWatchlistData] = useState([]);
  const [recentData, setRecentData] = useState([]);

  // Load pipeline data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pipelineRes, statsRes] = await Promise.all([
        ipoAPI.getByStage(selectedRegion),
        ipoAPI.getStatistics(selectedRegion)
      ]);

      setPipeline(pipelineRes.data);
      setStatistics(statsRes.data);
    } catch (error) {
      console.error('Error loading IPO data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRegion]);

  // Load list view data
  const loadListData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipoAPI.getPipeline({
        region: selectedRegion,
        sector: filters.sector || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      });
      setListData(res.data.data);
    } catch (error) {
      console.error('Error loading list data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRegion, filters]);

  // Load watchlist data
  const loadWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipoAPI.getWatchlist();
      setWatchlistData(res.data.data || []);
    } catch (error) {
      console.error('Error loading watchlist:', error);
      setWatchlistData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load recently completed IPOs
  const loadRecent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ipoAPI.getRecent(20);
      setRecentData(res.data.data || []);
    } catch (error) {
      console.error('Error loading recent IPOs:', error);
      setRecentData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (filterType === 'watchlist') {
      loadWatchlist();
    } else if (filterType === 'recent') {
      loadRecent();
    } else if (viewMode === 'kanban') {
      loadData();
    } else {
      loadListData();
    }
  }, [viewMode, filterType, selectedRegion, loadData, loadListData, loadWatchlist, loadRecent]);

  // Check for new filings
  const checkForNewFilings = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await ipoAPI.check();
      setCheckResult(res.data);
      // Reload data after check
      if (viewMode === 'kanban') {
        await loadData();
      } else {
        await loadListData();
      }
    } catch (error) {
      console.error('Error checking for filings:', error);
      setCheckResult({ error: error.message });
    } finally {
      setChecking(false);
    }
  };

  // Search IPOs
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults(null);
      return;
    }

    try {
      const res = await ipoAPI.search(searchQuery);
      setSearchResults(res.data.data);
    } catch (error) {
      console.error('Error searching:', error);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  if (loading && !pipeline.S1_FILED) {
    return (
      <div className="ipo-pipeline-page">
        <PageHeader
          title="IPO Pipeline"
          subtitle="Track upcoming IPOs from S-1 filing to trading"
        />
        <SkeletonIPOPipeline />
      </div>
    );
  }

  return (
    <div className="ipo-pipeline-page">
      <PageHeader
        title="IPO Pipeline"
        subtitle="Track upcoming IPOs from S-1 filing to trading"
        actions={
          <>
            <div className="region-selector">
              {Object.entries(IPO_REGIONS).map(([key, region]) => (
                <button
                  key={key}
                  className={`region-btn ${selectedRegion === key ? 'active' : ''}`}
                  onClick={() => setSelectedRegion(key)}
                  title={region.name}
                >
                  <span className="region-flag">{region.flag}</span>
                  <span className="region-name">{key === 'all' ? 'All' : key}</span>
                </button>
              ))}
            </div>
            <div className="view-toggle">
              <button
                className={viewMode === 'kanban' ? 'active' : ''}
                onClick={() => setViewMode('kanban')}
              >
                Kanban
              </button>
              <button
                className={viewMode === 'list' ? 'active' : ''}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
            </div>
            <Button
              variant="primary"
              onClick={checkForNewFilings}
              disabled={checking}
            >
              {checking ? 'Checking...' : 'Check for New Filings'}
            </Button>
          </>
        }
      />

      {/* Check Result Banner */}
      {checkResult && (
        <div className={`check-result ${checkResult.error ? 'error' : 'success'}`}>
          {checkResult.error ? (
            <span>Error: {checkResult.error}</span>
          ) : (
            <span>
              Found {checkResult.newIPOs} new IPOs and {checkResult.updates} updates
            </span>
          )}
          <button onClick={() => setCheckResult(null)}>Dismiss</button>
        </div>
      )}

      {/* Search Bar */}
      <div className="ipo-search-section">
        <form onSubmit={handleSearch} className="ipo-search-form">
          <input
            type="text"
            placeholder="Search by company name, ticker, or industry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="ipo-search-input"
          />
          <button type="submit" className="ipo-search-button">Search</button>
          {searchResults && (
            <button type="button" onClick={clearSearch} className="ipo-clear-button">
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="search-results-section">
          <h2>Search Results ({searchResults.length})</h2>
          <div className="ipo-list">
            {searchResults.length === 0 ? (
              <p className="no-results">No IPOs found matching "{searchQuery}"</p>
            ) : (
              searchResults.map(ipo => (
                <IPOCard key={ipo.id} ipo={ipo} formatCurrency={formatCurrency} formatDate={formatDate} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Statistics Bar */}
      {!searchResults && filterType === 'all' && <StatsBar statistics={statistics} formatCurrency={formatCurrency} />}

      {/* Main Content - Kanban or List View */}
      {!searchResults && filterType === 'all' && (
        <>
          {viewMode === 'kanban' ? (
            <div className="ipo-kanban">
              {Object.entries(IPO_STAGES).map(([status, config]) => {
                const stageData = pipeline[status];
                const ipos = stageData?.ipos || [];

                return (
                  <div key={status} className="kanban-column">
                    <div
                      className="column-header"
                      style={{ borderTopColor: config.color }}
                    >
                      <h3>{config.name}</h3>
                      <span className="column-count">{ipos.length}</span>
                    </div>

                    <div className="column-content">
                      {ipos.length === 0 ? (
                        <div className="empty-column">No IPOs in this stage</div>
                      ) : (
                        ipos.map(ipo => (
                          <IPOCard key={ipo.id} ipo={ipo} formatCurrency={formatCurrency} formatDate={formatDate} />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="ipo-list-view">
              <div className="list-filters">
                <select
                  value={filters.sector}
                  onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                >
                  <option value="">All Sectors</option>
                  {statistics?.by_sector?.map(s => (
                    <option key={s.sector} value={s.sector}>
                      {s.sector} ({s.count})
                    </option>
                  ))}
                </select>

                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                >
                  <option value="initial_s1_date">Filing Date</option>
                  <option value="company_name">Company Name</option>
                  <option value="deal_size">Deal Size</option>
                  <option value="amendment_count">Amendments</option>
                </select>

                <select
                  value={filters.sortOrder}
                  onChange={(e) => setFilters({ ...filters, sortOrder: e.target.value })}
                >
                  <option value="DESC">Newest First</option>
                  <option value="ASC">Oldest First</option>
                </select>
              </div>

              <table className="ipo-table">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Company</th>
                    <th>Ticker</th>
                    <th>Status</th>
                    <th>Exchange</th>
                    <th>Price Range</th>
                    <th>Deal Size</th>
                    <th>Filed</th>
                    <th>Amendments</th>
                  </tr>
                </thead>
                <tbody>
                  {listData.map(ipo => {
                    const stage = IPO_STAGES[ipo.status];
                    const region = IPO_REGIONS[ipo.region] || IPO_REGIONS.US;
                    return (
                      <tr key={ipo.id}>
                        <td className="region-cell" title={region.name}>
                          {region.flag}
                        </td>
                        <td>
                          <Link to={`/ipo/${ipo.id}`} className="company-link">
                            {ipo.company_name}
                          </Link>
                          {ipo.sector && (
                            <span className="company-sector">{ipo.sector}</span>
                          )}
                        </td>
                        <td className="ticker-cell">
                          {ipo.ticker_proposed || ipo.ticker_final || '-'}
                        </td>
                        <td>
                          <span
                            className="status-badge"
                            style={{ backgroundColor: stage?.color || '#6b7280' }}
                          >
                            {stage?.shortName || ipo.status}
                          </span>
                        </td>
                        <td>{ipo.exchange_proposed || ipo.listing_venue || '-'}</td>
                        <td>
                          {ipo.final_price ? (
                            `$${ipo.final_price}`
                          ) : ipo.price_range_low ? (
                            `$${ipo.price_range_low} - $${ipo.price_range_high}`
                          ) : (
                            '-'
                          )}
                        </td>
                        <td>{formatCurrency(ipo.deal_size)}</td>
                        <td>{formatDate(ipo.initial_s1_date || ipo.approval_date)}</td>
                        <td>{ipo.amendment_count || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {listData.length === 0 && (
                <div className="no-results">No IPOs found with current filters</div>
              )}
            </div>
          )}
        </>
      )}

      {/* Quick Filter Buttons */}
      <div className="ipo-quick-links">
        <button
          className={`quick-link ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          All IPOs
        </button>
        <button
          className={`quick-link ${filterType === 'watchlist' ? 'active' : ''}`}
          onClick={() => setFilterType('watchlist')}
        >
          My Watchlist
        </button>
        <button
          className={`quick-link ${filterType === 'recent' ? 'active' : ''}`}
          onClick={() => setFilterType('recent')}
        >
          Recently Completed
        </button>
      </div>

      {/* Watchlist View */}
      {filterType === 'watchlist' && !loading && (
        <div className="filtered-ipo-view">
          <h3>My IPO Watchlist</h3>
          {watchlistData.length === 0 ? (
            <div className="no-results">
              No IPOs in your watchlist yet. Click the star icon on any IPO to add it.
            </div>
          ) : (
            <div className="ipo-cards-grid">
              {watchlistData.map(ipo => (
                <IPOCard
                  key={ipo.id}
                  ipo={ipo}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recently Completed View */}
      {filterType === 'recent' && !loading && (
        <div className="filtered-ipo-view">
          <h3>Recently Completed IPOs</h3>
          {recentData.length === 0 ? (
            <div className="no-results">No recently completed IPOs found.</div>
          ) : (
            <div className="ipo-cards-grid">
              {recentData.map(ipo => (
                <IPOCard
                  key={ipo.id}
                  ipo={ipo}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default IPOPipelinePage;
