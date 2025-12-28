// frontend/src/components/portfolio/HoldingsTable.js
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Search,
  Bot,
  RefreshCw,
  Loader
} from 'lucide-react';
import { pricesAPI, analystAPI, companyAPI } from '../../services/api';
import './HoldingsTable.css';

// Simple SVG Sparkline component
function Sparkline({ data, width = 80, height = 24, positive = true }) {
  if (!data || data.length < 2) {
    return <div className="sparkline-placeholder" style={{ width, height }} />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  // Create SVG path
  const points = data.map((value, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const color = positive ? '#22c55e' : '#ef4444';

  return (
    <svg width={width} height={height} className="sparkline">
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// AI Rating badge component
function AIRatingBadge({ rating, loading, onClick }) {
  if (loading) {
    return (
      <div className="ai-rating-badge loading">
        <Loader size={12} className="spin" />
      </div>
    );
  }

  if (!rating) {
    return (
      <button className="ai-rating-badge empty" onClick={onClick} title="Get AI Rating">
        <Bot size={12} />
      </button>
    );
  }

  const ratingClass = rating.score >= 7 ? 'bullish' : rating.score >= 4 ? 'neutral' : 'bearish';

  return (
    <div className={`ai-rating-badge ${ratingClass}`} title={rating.summary}>
      <span className="rating-score">{rating.score}</span>
      <span className="rating-label">{rating.label}</span>
    </div>
  );
}

function HoldingsTable({ holdings, portfolioId, onRefresh }) {
  const [sortBy, setSortBy] = useState('current_value');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [sparklineData, setSparklineData] = useState({});
  const [aiRatings, setAiRatings] = useState({});
  const [loadingRatings, setLoadingRatings] = useState({});
  const [showAiColumn] = useState(true);

  // Load sparkline data for holdings
  useEffect(() => {
    const loadSparklines = async () => {
      const symbols = holdings.map(h => h.symbol).filter(Boolean);
      if (symbols.length === 0) return;

      try {
        // Fetch recent price history for all holdings (last 30 days)
        const sparklines = {};
        await Promise.all(
          symbols.map(async (symbol) => {
            try {
              const res = await pricesAPI.getHistory(symbol, '1m');
              const prices = res.data.prices || [];
              // Get last 30 closing prices
              sparklines[symbol] = prices.slice(-30).map(p => p.close);
            } catch (err) {
              sparklines[symbol] = [];
            }
          })
        );
        setSparklineData(sparklines);
      } catch (err) {
        console.log('Failed to load sparklines:', err.message);
      }
    };

    loadSparklines();
  }, [holdings]);

  // Load cached AI ratings from localStorage
  useEffect(() => {
    const cached = localStorage.getItem(`aiRatings_${portfolioId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        // Only use cache if less than 24 hours old
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        if (cacheAge < 24 * 60 * 60 * 1000) {
          setAiRatings(parsed.ratings || {});
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, [portfolioId]);

  // Get AI rating for a single holding
  const getAIRating = useCallback(async (symbol) => {
    if (loadingRatings[symbol]) return;

    setLoadingRatings(prev => ({ ...prev, [symbol]: true }));

    try {
      // Get company data for context
      const companyRes = await companyAPI.getMetrics(symbol);
      const metrics = companyRes.data?.metrics?.[0];

      // Create a quick conversation and ask for a rating
      const convResponse = await analystAPI.createConversation({
        analystId: 'value',
        companySymbol: symbol
      });

      const msgResponse = await analystAPI.sendMessage(
        convResponse.data.conversation.id,
        `Rate ${symbol} from 1-10 as an investment. Respond with ONLY a JSON object in this exact format: {"score": 7, "label": "Buy", "summary": "Brief 1-sentence reason"}. The label should be one of: "Strong Buy", "Buy", "Hold", "Sell", "Strong Sell". No other text.`,
        { metrics }
      );

      // Parse the response
      const content = msgResponse.data.message.content;
      let rating;

      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          rating = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Fallback parsing if JSON fails
        const scoreMatch = content.match(/(\d+)/);
        rating = {
          score: scoreMatch ? parseInt(scoreMatch[1]) : 5,
          label: 'Hold',
          summary: content.slice(0, 100)
        };
      }

      // Update ratings and save to cache
      setAiRatings(prev => {
        const updated = { ...prev, [symbol]: rating };
        localStorage.setItem(`aiRatings_${portfolioId}`, JSON.stringify({
          ratings: updated,
          timestamp: Date.now()
        }));
        return updated;
      });
    } catch (err) {
      console.error(`Failed to get AI rating for ${symbol}:`, err);
    } finally {
      setLoadingRatings(prev => ({ ...prev, [symbol]: false }));
    }
  }, [portfolioId, loadingRatings]);

  // Get AI ratings for all holdings
  const getAllAIRatings = useCallback(async () => {
    const symbols = holdings.map(h => h.symbol).filter(s => s && !aiRatings[s]);
    for (const symbol of symbols.slice(0, 5)) { // Limit to 5 at a time
      await getAIRating(symbol);
    }
  }, [holdings, aiRatings, getAIRating]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const sortedHoldings = [...holdings]
    .filter(h =>
      h.symbol?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.company_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let aVal = a[sortBy] ?? 0;
      let bVal = b[sortBy] ?? 0;
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const SortIcon = ({ column }) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  return (
    <div className="holdings-section">
      <div className="section-header">
        <h2>Holdings ({holdings.length})</h2>
        <div className="section-controls">
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search holdings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="holdings-table-wrapper">
        <table className="holdings-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('symbol')} className="sortable">
                Symbol <SortIcon column="symbol" />
              </th>
              <th className="sparkline-header">30D</th>
              {showAiColumn && (
                <th className="ai-rating-header">
                  <div className="ai-header-content">
                    <Bot size={14} />
                    <span>AI</span>
                    <button
                      className="refresh-all-btn"
                      onClick={getAllAIRatings}
                      title="Get ratings for all holdings"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </th>
              )}
              <th onClick={() => handleSort('shares')} className="sortable right">
                Shares <SortIcon column="shares" />
              </th>
              <th onClick={() => handleSort('avg_cost')} className="sortable right">
                Avg Cost <SortIcon column="avg_cost" />
              </th>
              <th onClick={() => handleSort('current_price')} className="sortable right">
                Price <SortIcon column="current_price" />
              </th>
              <th onClick={() => handleSort('current_value')} className="sortable right">
                Value <SortIcon column="current_value" />
              </th>
              <th onClick={() => handleSort('unrealized_gain')} className="sortable right">
                Gain/Loss <SortIcon column="unrealized_gain" />
              </th>
              <th onClick={() => handleSort('unrealized_gain_pct')} className="sortable right">
                Return <SortIcon column="unrealized_gain_pct" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedHoldings.map((holding, idx) => {
              const isPositive = (holding.unrealized_gain || 0) >= 0;
              const sparkData = sparklineData[holding.symbol] || [];
              const sparkPositive = sparkData.length > 1 ? sparkData[sparkData.length - 1] >= sparkData[0] : isPositive;
              return (
                <tr key={idx}>
                  <td>
                    <div className="symbol-cell">
                      <Link to={`/company/${holding.symbol}`} className="symbol-link">
                        {holding.symbol}
                      </Link>
                      {holding.company_name && (
                        <span className="company-name">{holding.company_name}</span>
                      )}
                    </div>
                  </td>
                  <td className="sparkline-cell">
                    <Sparkline
                      data={sparkData}
                      positive={sparkPositive}
                      width={80}
                      height={24}
                    />
                  </td>
                  {showAiColumn && (
                    <td className="ai-rating-cell">
                      <AIRatingBadge
                        rating={aiRatings[holding.symbol]}
                        loading={loadingRatings[holding.symbol]}
                        onClick={() => getAIRating(holding.symbol)}
                      />
                    </td>
                  )}
                  <td className="right">{holding.shares?.toLocaleString()}</td>
                  <td className="right">{formatValue(holding.avg_cost)}</td>
                  <td className="right">{formatValue(holding.current_price)}</td>
                  <td className="right font-medium">{formatValue(holding.current_value)}</td>
                  <td className={`right ${isPositive ? 'positive' : 'negative'}`}>
                    <div className="gain-cell">
                      {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {formatValue(holding.unrealized_gain)}
                    </div>
                  </td>
                  <td className={`right ${isPositive ? 'positive' : 'negative'}`}>
                    {formatPercent(holding.unrealized_gain_pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedHoldings.length === 0 && (
          <div className="empty-table">
            {searchTerm ? (
              <p>No holdings match your search</p>
            ) : (
              <p>No holdings in this portfolio yet</p>
            )}
          </div>
        )}
      </div>

      {holdings.length > 0 && (
        <div className="holdings-summary">
          <div className="summary-item">
            <span className="summary-label">Total Cost Basis</span>
            <span className="summary-value">
              {formatValue(holdings.reduce((sum, h) => sum + (h.cost_basis || 0), 0))}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Market Value</span>
            <span className="summary-value">
              {formatValue(holdings.reduce((sum, h) => sum + (h.current_value || 0), 0))}
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Total Gain/Loss</span>
            <span className={`summary-value ${holdings.reduce((sum, h) => sum + (h.unrealized_gain || 0), 0) >= 0 ? 'positive' : 'negative'}`}>
              {formatValue(holdings.reduce((sum, h) => sum + (h.unrealized_gain || 0), 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default HoldingsTable;
