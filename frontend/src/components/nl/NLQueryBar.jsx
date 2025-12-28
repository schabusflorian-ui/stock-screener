// frontend/src/components/nl/NLQueryBar.jsx
/**
 * Natural Language Query Bar Component
 *
 * A search bar that accepts natural language investment queries
 * and displays results inline.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader, X, Sparkles, ChevronDown, ChevronUp, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';
import './NLQueryBar.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function NLQueryBar({ onResultSelect, context, placeholder }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsGreeting, setSuggestionsGreeting] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const inputRef = useRef(null);

  // Fetch suggestions based on context
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const params = new URLSearchParams();
        if (context?.symbol) params.append('symbol', context.symbol);
        if (context?.page) params.append('page', context.page);
        if (context?.sector) params.append('sector', context.sector);

        const response = await fetch(`${API_BASE}/api/nl/suggestions?${params}`);
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setSuggestionsGreeting(data.greeting || null);
      } catch (e) {
        console.error('Failed to fetch suggestions:', e);
      }
    };

    fetchSuggestions();
  }, [context]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setConfirmation(null);

    try {
      const response = await fetch(`${API_BASE}/api/nl/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context })
      });

      const data = await response.json();

      if (data.success) {
        // Show confirmation first if available
        if (data.confirmation) {
          setConfirmation(data.confirmation);
        }
        setResult(data);
        setExpanded(true);
      } else {
        setError(data.error || 'Query failed');
      }
    } catch (e) {
      setError('Failed to process query');
      console.error('NL query error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    // Trigger search
    setTimeout(() => {
      inputRef.current?.form?.requestSubmit();
    }, 100);
  };

  const clearQuery = () => {
    setQuery('');
    setResult(null);
    setError(null);
    setExpanded(false);
    setConfirmation(null);
    inputRef.current?.focus();
  };

  return (
    <div className={`nl-query-bar ${expanded ? 'expanded' : ''}`}>
      <form onSubmit={handleSubmit} className="nl-query-form">
        <div className="nl-input-wrapper">
          <Sparkles size={18} className="nl-icon sparkles" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={placeholder || "Ask anything about stocks..."}
            className="nl-input"
            disabled={loading}
          />
          {loading && <Loader size={18} className="nl-icon loading" />}
          {query && !loading && (
            <button type="button" onClick={clearQuery} className="nl-clear-btn">
              <X size={16} />
            </button>
          )}
          <button type="submit" className="nl-submit-btn" disabled={loading || !query.trim()}>
            <Search size={18} />
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && !result && (
          <div className="nl-suggestions">
            <div className="nl-suggestions-label">
              {suggestionsGreeting || 'Try asking:'}
            </div>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className="nl-suggestion-item"
                onClick={() => handleSuggestionClick(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Confirmation message while loading or as header */}
      {confirmation && loading && (
        <div className="nl-confirmation">
          <Loader size={14} className="nl-confirmation-icon spinning" />
          <span>{confirmation}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="nl-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* Results display */}
      {result && (
        <div className="nl-results">
          <div className="nl-results-header">
            <div className="nl-interpretation">
              <span className="nl-intent-badge">{result.intent}</span>
              {result.confirmation && !loading && (
                <span className="nl-confirmation-text">{result.confirmation}</span>
              )}
              <ConfidenceIndicator
                level={result.confidence}
                reason={result.confidence_reason}
              />
            </div>
            <button
              className="nl-expand-btn"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {expanded && (
            <div className="nl-results-content">
              <NLResultDisplay result={result.result} onSelect={onResultSelect} />

              {/* Follow-up suggestions */}
              {result.suggestions && result.suggestions.length > 0 && (
                <div className="nl-followup">
                  <div className="nl-followup-label">Related queries:</div>
                  <div className="nl-followup-items">
                    {result.suggestions.map((s, i) => (
                      <button
                        key={i}
                        className="nl-followup-btn"
                        onClick={() => handleSuggestionClick(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Display LLM-generated insight
 */
function LLMInsight({ insight }) {
  if (!insight) return null;

  return (
    <div className="nl-llm-insight">
      <div className="nl-insight-icon">
        <Sparkles size={14} />
      </div>
      <div className="nl-insight-text">{insight}</div>
    </div>
  );
}

/**
 * Display confidence indicator with tooltip
 */
function ConfidenceIndicator({ level, reason }) {
  if (!level) return null;

  const getIcon = () => {
    switch (level) {
      case 'high':
        return <CheckCircle size={14} className="confidence-icon high" />;
      case 'medium':
        return <HelpCircle size={14} className="confidence-icon medium" />;
      case 'low':
        return <AlertCircle size={14} className="confidence-icon low" />;
      default:
        return null;
    }
  };

  return (
    <div className={`nl-confidence confidence-${level}`} title={reason || `Confidence: ${level}`}>
      {getIcon()}
      <span className="confidence-label">{level}</span>
      {reason && <span className="confidence-reason">{reason}</span>}
    </div>
  );
}

/**
 * Display component for NL query results
 */
function NLResultDisplay({ result, onSelect }) {
  if (!result) return null;

  // Wrap result display with LLM insight if available
  const renderWithInsight = (content) => (
    <>
      {result.llm_insight && <LLMInsight insight={result.llm_insight} />}
      {content}
    </>
  );

  switch (result.type) {
    case 'screen_results':
      return renderWithInsight(<ScreenResults result={result} onSelect={onSelect} />);
    case 'comparison_results':
      return renderWithInsight(<ComparisonResults result={result} onSelect={onSelect} />);
    case 'similarity_results':
      return renderWithInsight(<SimilarityResults result={result} onSelect={onSelect} />);
    case 'historical_results':
      return renderWithInsight(<HistoricalResults result={result} />);
    case 'driver_analysis':
      return renderWithInsight(<DriverResults result={result} />);
    case 'metric_lookup':
    case 'company_summary':
      return renderWithInsight(<LookupResults result={result} onSelect={onSelect} />);
    case 'error':
      return <div className="nl-result-error">{result.message}</div>;
    case 'unknown':
      return (
        <div className="nl-result-unknown">
          <p>{result.message}</p>
          {result.suggestions && (
            <ul>
              {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          )}
        </div>
      );
    default:
      return (
        <div className="nl-result-raw">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      );
  }
}

function ScreenResults({ result, onSelect }) {
  return (
    <div className="nl-screen-results">
      <div className="nl-screen-filters">
        {result.filters_applied?.map((f, i) => (
          <span key={i} className="nl-filter-tag">{f}</span>
        ))}
      </div>
      <div className="nl-screen-count">{result.results_count} stocks found</div>
      <div className="nl-screen-table">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Sector</th>
              <th>Market Cap</th>
              <th>P/E</th>
              <th>Div Yield</th>
            </tr>
          </thead>
          <tbody>
            {result.results?.slice(0, 10).map((stock, i) => (
              <tr key={i} onClick={() => onSelect?.(stock.symbol)} className="clickable">
                <td className="symbol">{stock.symbol}</td>
                <td className="name">{stock.name}</td>
                <td>{stock.sector}</td>
                <td>{formatLargeNumber(stock.market_cap)}</td>
                <td>{stock.pe_ratio?.toFixed(1) || '-'}</td>
                <td>{stock.dividend_yield ? (stock.dividend_yield * 100).toFixed(2) + '%' : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.results_count > 10 && (
          <div className="nl-more-results">+ {result.results_count - 10} more results</div>
        )}
      </div>
    </div>
  );
}

function ComparisonResults({ result, onSelect }) {
  const companies = result.companies || [];

  return (
    <div className="nl-comparison-results">
      <div className="nl-comparison-header">
        {companies.map((c, i) => (
          <div key={i} className="nl-company-card" onClick={() => onSelect?.(c.symbol)}>
            <span className="symbol">{c.symbol}</span>
            <span className="name">{c.name}</span>
          </div>
        ))}
      </div>

      <div className="nl-comparison-metrics">
        {result.comparisons?.slice(0, 8).map((comp, i) => (
          <div key={i} className="nl-metric-row">
            <span className="metric-name">{comp.display_name}</span>
            <div className="metric-values">
              {companies.map((c, j) => (
                <span
                  key={j}
                  className={`metric-value ${comp.winner === c.symbol ? 'winner' : ''}`}
                >
                  {formatMetricValue(comp.values?.[c.symbol], comp.metric_name)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {result.overall_assessment && (
        <div className="nl-comparison-summary">
          <strong>Leader:</strong> {result.overall_assessment.leader}
          ({result.overall_assessment.leader_wins}/{result.overall_assessment.total_metrics_compared} metrics)
        </div>
      )}
    </div>
  );
}

function SimilarityResults({ result, onSelect }) {
  return (
    <div className="nl-similarity-results">
      <div className="nl-similarity-header">
        Stocks similar to <strong>{result.target_symbol}</strong>
      </div>
      <div className="nl-similarity-list">
        {result.similar_stocks?.slice(0, 8).map((stock, i) => (
          <div key={i} className="nl-similar-item" onClick={() => onSelect?.(stock.symbol)}>
            <div className="similar-main">
              <span className="symbol">{stock.symbol}</span>
              <span className="score">{(stock.similarity_score * 100).toFixed(0)}% match</span>
            </div>
            <div className="similar-name">{stock.name}</div>
            <div className="similar-reasons">
              {stock.match_reasons?.slice(0, 2).map((r, j) => (
                <span key={j} className="reason-tag">{r}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoricalResults({ result }) {
  return (
    <div className="nl-historical-results">
      <div className="nl-historical-header">
        <strong>{result.symbol}</strong> - {result.period?.label}
      </div>
      <div className="nl-historical-summary">{result.summary}</div>
      <div className="nl-metrics-list">
        {result.metrics?.map((metric, i) => (
          <div key={i} className="nl-metric-item">
            <span className="metric-name">{metric.display_name}</span>
            <span className={`metric-change ${metric.change_summary?.direction}`}>
              {metric.change_summary?.percent_change != null
                ? `${metric.change_summary.percent_change > 0 ? '+' : ''}${metric.change_summary.percent_change.toFixed(1)}%`
                : 'N/A'
              }
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DriverResults({ result }) {
  return (
    <div className="nl-driver-results">
      <div className="nl-driver-header">
        What's driving <strong>{result.symbol}</strong>'s {result.focus_area}
      </div>
      <div className="nl-driver-explanation">{result.explanation}</div>
      <div className="nl-drivers-list">
        {result.drivers?.map((driver, i) => (
          <div key={i} className={`nl-driver-item impact-${driver.impact}`}>
            <div className="driver-header">
              <span className="driver-name">{driver.name}</span>
              <span className={`driver-impact ${driver.impact}`}>{driver.impact}</span>
            </div>
            <div className="driver-evidence">
              {driver.evidence?.map((e, j) => <span key={j}>{e}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LookupResults({ result, onSelect }) {
  return (
    <div className="nl-lookup-results">
      <div className="nl-lookup-header" onClick={() => onSelect?.(result.symbol)}>
        <span className="symbol">{result.symbol}</span>
        <span className="name">{result.name}</span>
      </div>
      {result.summary && <div className="nl-lookup-summary">{result.summary}</div>}

      {result.metrics && (
        <div className="nl-lookup-metrics">
          {result.metrics.map((m, i) => (
            <div key={i} className="nl-lookup-metric">
              <span className="metric-label">{m.display_name}</span>
              <span className="metric-value">{m.formatted_value}</span>
              {m.context && <span className="metric-context">{m.context}</span>}
            </div>
          ))}
        </div>
      )}

      {result.metrics_by_category && (
        <div className="nl-lookup-categories">
          {Object.entries(result.metrics_by_category).map(([cat, metrics]) => (
            <div key={cat} className="nl-category">
              <div className="category-name">{cat.replace('_', ' ')}</div>
              <div className="category-metrics">
                {metrics.slice(0, 4).map((m, i) => (
                  <div key={i} className="category-metric">
                    <span>{m.display_name}</span>
                    <span>{m.formatted_value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Utility functions
function formatLargeNumber(num) {
  if (!num) return '-';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function formatMetricValue(value, metricName) {
  if (value == null) return '-';

  if (metricName.includes('margin') || metricName.includes('yield') ||
      metricName.includes('roe') || metricName.includes('roa') ||
      metricName.includes('growth')) {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (metricName.includes('ratio') || metricName.includes('ebitda')) {
    return `${value.toFixed(1)}x`;
  }

  if (metricName === 'market_cap' || metricName === 'enterprise_value') {
    return formatLargeNumber(value);
  }

  return value.toFixed(2);
}

export default NLQueryBar;
