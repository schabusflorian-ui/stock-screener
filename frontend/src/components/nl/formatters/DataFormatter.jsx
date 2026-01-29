/**
 * DataFormatter - Handles lookup, info, and general data response types
 *
 * Types handled:
 * - data_response, info, not_found, company_summary, metric_lookup
 * - llm_response, explanation
 * - screen_results, comparison_results, similarity_results
 * - historical_results, driver_analysis
 * - calculation, calculation_result
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { TrendingUp, TrendingDown, Search, BarChart2, AlertCircle } from '../../icons';
import ChartRenderer from './ChartRenderer';
import './Formatters.css';

function DataFormatter({ result, onSymbolClick }) {
  const { type } = result;

  switch (type) {
    case 'data_response':
    case 'company_summary':
    case 'metric_lookup':
      return <CompanyDataView result={result} onSymbolClick={onSymbolClick} />;

    case 'info':
      return <InfoView result={result} />;

    case 'not_found':
      return <NotFoundView result={result} />;

    case 'llm_response':
    case 'explanation':
      return <LLMResponseView result={result} />;

    case 'screen_results':
      return <ScreenResultsView result={result} onSymbolClick={onSymbolClick} />;

    case 'comparison_results':
      return <ComparisonView result={result} onSymbolClick={onSymbolClick} />;

    case 'similarity_results':
      return <SimilarityView result={result} onSymbolClick={onSymbolClick} />;

    case 'historical_results':
      return <HistoricalView result={result} onSymbolClick={onSymbolClick} />;

    case 'driver_analysis':
      return <DriverView result={result} onSymbolClick={onSymbolClick} />;

    case 'calculation':
    case 'calculation_result':
      return <CalculationView result={result} />;

    default:
      return <GenericDataView result={result} onSymbolClick={onSymbolClick} />;
  }
}

/**
 * Company data with metrics by category
 */
function CompanyDataView({ result, onSymbolClick }) {
  const { symbol, name, metrics_by_category, metrics } = result;

  return (
    <div className="fmt-company-data">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {name && <span className="fmt-name">{name}</span>}
        </div>
      )}

      {/* Metrics by category */}
      {metrics_by_category && (
        <div className="fmt-metrics-categories">
          {Object.entries(metrics_by_category).map(([category, categoryMetrics]) => (
            <div key={category} className="fmt-metric-category">
              <h4 className="fmt-category-title">{formatLabel(category)}</h4>
              <div className="fmt-metrics-grid">
                {categoryMetrics.map((metric, i) => (
                  <div key={i} className="fmt-metric-card">
                    <span className="fmt-metric-label">{metric.name || metric.display_name}</span>
                    <span className="fmt-metric-value">{metric.value || metric.formatted_value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat metrics array */}
      {!metrics_by_category && metrics && metrics.length > 0 && (
        <div className="fmt-metrics-grid">
          {metrics.map((metric, i) => (
            <div key={i} className="fmt-metric-card">
              <span className="fmt-metric-label">{metric.display_name || metric.metric}</span>
              <span className="fmt-metric-value">{metric.formatted_value || metric.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Info message display
 */
function InfoView({ result }) {
  return (
    <div className="fmt-info">
      {result.symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol">{result.symbol}</span>
        </div>
      )}
      <div className="fmt-text-content">
        {result.message || result.info}
      </div>
    </div>
  );
}

/**
 * Not found display
 */
function NotFoundView({ result }) {
  return (
    <div className="fmt-not-found">
      <AlertCircle size={18} style={{ color: '#D97706' }} />
      <span>{result.message || 'No results found'}</span>
      {result.suggestions && result.suggestions.length > 0 && (
        <div className="fmt-suggestions">
          <span>Try: </span>
          {result.suggestions.slice(0, 3).join(', ')}
        </div>
      )}
    </div>
  );
}

/**
 * LLM generated response
 */
function LLMResponseView({ result }) {
  const content = result.message || result.response || result.answer || result.text || result.content;

  // Debug: log chart data
  console.log('[LLMResponseView] Result keys:', Object.keys(result));
  if (result.chart_data) {
    console.log('[LLMResponseView] chart_data:', result.chart_data.type, result.chart_data.series?.length);
  }
  if (result.price_comparison_chart) {
    console.log('[LLMResponseView] price_comparison_chart:', result.price_comparison_chart.type, 'series:', result.price_comparison_chart.series?.length);
  } else {
    console.log('[LLMResponseView] NO price_comparison_chart');
  }
  if (result.scatter_chart) {
    console.log('[LLMResponseView] scatter_chart present');
  }

  return (
    <div className="fmt-llm-response">
      {result.symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol">{result.symbol}</span>
        </div>
      )}
      <div className="fmt-text-content">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>

      {/* Render multi-series price comparison chart if present */}
      {result.price_comparison_chart && (
        <ChartRenderer chartData={result.price_comparison_chart} />
      )}

      {/* Render inline chart if present */}
      {result.chart_data && (
        <ChartRenderer chartData={result.chart_data} />
      )}

      {/* Render scatter plot if present (risk vs return) */}
      {result.scatter_chart && (
        <ChartRenderer chartData={result.scatter_chart} />
      )}

      {/* Render correlation heatmap if present */}
      {result.heatmap_chart && (
        <ChartRenderer chartData={result.heatmap_chart} />
      )}

      {/* Render additional price charts (for multi-stock queries) */}
      {result.additional_charts && result.additional_charts.length > 0 && (
        <div className="fmt-additional-charts">
          {result.additional_charts.map((chart, i) => (
            <ChartRenderer key={i} chartData={chart} />
          ))}
        </div>
      )}

      {/* Render analyst ratings pie chart if present */}
      {result.analyst_chart_data && (
        <ChartRenderer chartData={result.analyst_chart_data} />
      )}

      {result.tools_used && result.tools_used.length > 0 && (
        <div className="fmt-tools-used">
          <span className="fmt-tools-label">Data sources:</span>
          {result.tools_used.map((tool, i) => (
            <span key={i} className="fmt-tool-badge">
              {tool.replace(/_/g, ' ').replace('get ', '')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Screen results - list of stocks matching criteria
 */
function ScreenResultsView({ result, onSymbolClick }) {
  const stocks = result.results || result.stocks || [];

  return (
    <div className="fmt-screen-results">
      {result.criteria && (
        <div className="fmt-criteria">
          <Search size={14} />
          <span>{result.criteria}</span>
        </div>
      )}

      <div className="fmt-results-count">
        Found {result.results_count || stocks.length} stocks
      </div>

      {stocks.length > 0 && (
        <div className="fmt-table-wrapper">
          <table className="fmt-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                {stocks[0].pe_ratio !== undefined && <th>P/E</th>}
                {stocks[0].market_cap !== undefined && <th>Mkt Cap</th>}
                {stocks[0].score !== undefined && <th>Score</th>}
              </tr>
            </thead>
            <tbody>
              {stocks.slice(0, 10).map((stock, i) => (
                <tr key={i}>
                  <td>
                    <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(stock.symbol)}>
                      {stock.symbol}
                    </span>
                  </td>
                  <td>{stock.name || stock.company_name || '-'}</td>
                  {stock.pe_ratio !== undefined && <td>{formatNumber(stock.pe_ratio)}x</td>}
                  {stock.market_cap !== undefined && <td>{formatLargeNumber(stock.market_cap)}</td>}
                  {stock.score !== undefined && <td>{(stock.score * 100).toFixed(0)}%</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {stocks.length > 10 && (
            <div className="fmt-table-more">+{stocks.length - 10} more</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Comparison results
 */
function ComparisonView({ result, onSymbolClick }) {
  const companies = result.companies || [];
  const metrics = result.metrics || [];

  return (
    <div className="fmt-comparison">
      {result.overall_assessment && (
        <div className="fmt-assessment">
          <strong>{result.overall_assessment.leader}</strong> leads in{' '}
          {result.overall_assessment.leader_wins}/{result.overall_assessment.total_metrics_compared} metrics
        </div>
      )}

      {/* Render multi-series price comparison chart if present */}
      {result.price_comparison_chart && (
        <ChartRenderer chartData={result.price_comparison_chart} />
      )}

      {/* Render comparison bar chart if present */}
      {result.chart_data && (
        <ChartRenderer chartData={result.chart_data} />
      )}

      {/* Render scatter plot if present (risk vs return) */}
      {result.scatter_chart && (
        <ChartRenderer chartData={result.scatter_chart} />
      )}

      {/* Render correlation heatmap if present */}
      {result.heatmap_chart && (
        <ChartRenderer chartData={result.heatmap_chart} />
      )}

      {/* Render additional comparison charts */}
      {result.additional_charts && result.additional_charts.length > 0 && (
        <div className="fmt-additional-charts">
          {result.additional_charts.map((chart, i) => (
            <ChartRenderer key={i} chartData={chart} />
          ))}
        </div>
      )}

      {companies.length > 0 && metrics.length > 0 && (
        <div className="fmt-table-wrapper">
          <table className="fmt-table">
            <thead>
              <tr>
                <th>Metric</th>
                {companies.map(c => (
                  <th key={c.symbol}>
                    <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(c.symbol)}>
                      {c.symbol}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.slice(0, 8).map((metric, i) => (
                <tr key={i}>
                  <td>{metric.display_name || metric.metric}</td>
                  {companies.map(c => (
                    <td key={c.symbol}>
                      {metric.values?.[c.symbol]?.formatted || metric.values?.[c.symbol] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Similarity results
 */
function SimilarityView({ result, onSymbolClick }) {
  const similar = result.similar_stocks || [];

  return (
    <div className="fmt-similarity">
      {result.target_symbol && (
        <div className="fmt-header">
          Stocks similar to{' '}
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(result.target_symbol)}>
            {result.target_symbol}
          </span>
        </div>
      )}

      {similar.length > 0 && (
        <div className="fmt-similar-list">
          {similar.slice(0, 6).map((stock, i) => (
            <div key={i} className="fmt-similar-item">
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(stock.symbol)}>
                {stock.symbol}
              </span>
              <span className="fmt-similarity-score">
                {((stock.similarity_score || stock.score || 0) * 100).toFixed(0)}% match
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Historical results
 */
function HistoricalView({ result, onSymbolClick }) {
  const { symbol, metrics } = result;

  return (
    <div className="fmt-historical">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          <span className="fmt-name">Historical Trends</span>
        </div>
      )}

      {metrics && metrics.length > 0 && (
        <div className="fmt-historical-metrics">
          {metrics.slice(0, 4).map((metric, i) => {
            const change = metric.change_summary?.percent_change || 0;
            return (
              <div key={i} className="fmt-historical-item">
                <div className="fmt-historical-name">{metric.display_name || metric.metric}</div>
                <div className="fmt-historical-values">
                  <span>{metric.start_value} → {metric.end_value}</span>
                  <span className={`fmt-change ${change >= 0 ? 'positive' : 'negative'}`}>
                    {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {Math.abs(change).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Driver analysis
 */
function DriverView({ result, onSymbolClick }) {
  const { symbol, drivers } = result;

  return (
    <div className="fmt-drivers">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          <span className="fmt-name">Key Drivers</span>
        </div>
      )}

      {drivers && drivers.length > 0 && (
        <div className="fmt-driver-list">
          {drivers.slice(0, 5).map((driver, i) => (
            <div key={i} className={`fmt-driver-item ${driver.impact >= 0 ? 'positive' : 'negative'}`}>
              <div className="fmt-driver-icon">
                {driver.impact >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              </div>
              <div className="fmt-driver-info">
                <span className="fmt-driver-name">{driver.name}</span>
                <span className="fmt-driver-detail">{driver.description || driver.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Calculation result
 */
function CalculationView({ result }) {
  const { symbol, inputs, calculation_result } = result;
  const calcResult = calculation_result || result.result || {};

  return (
    <div className="fmt-calculation">
      {symbol && (
        <div className="fmt-header">
          <BarChart2 size={16} />
          <span className="fmt-symbol">{symbol}</span>
          <span className="fmt-name">Valuation Calculation</span>
        </div>
      )}

      <div className="fmt-calc-result">
        {calcResult.target_price && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Target Price</span>
            <span className="fmt-metric-value">${formatNumber(calcResult.target_price)}</span>
          </div>
        )}
        {calcResult.change_percent !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Change</span>
            <span className={`fmt-metric-value ${calcResult.change_percent >= 0 ? 'positive' : 'negative'}`}>
              {calcResult.change_percent >= 0 ? '+' : ''}{calcResult.change_percent.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {inputs && (
        <div className="fmt-calc-inputs">
          <span className="fmt-label">Inputs: </span>
          {Object.entries(inputs).map(([key, value]) => (
            <span key={key} className="fmt-input-tag">
              {formatLabel(key)}: {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Generic data view for unhandled types
 */
function GenericDataView({ result, onSymbolClick }) {
  const { type, symbol, name, chart_data, analyst_chart_data, additional_charts, ...data } = result;

  return (
    <div className="fmt-generic">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {name && <span className="fmt-name">{name}</span>}
        </div>
      )}

      {/* Render any charts included in the response */}
      {chart_data && <ChartRenderer chartData={chart_data} />}
      {analyst_chart_data && <ChartRenderer chartData={analyst_chart_data} />}
      {additional_charts && additional_charts.map((chart, i) => (
        <ChartRenderer key={i} chartData={chart} />
      ))}

      <div className="fmt-data-preview">
        {Object.entries(data)
          .filter(([k, v]) => v !== null && typeof v !== 'object')
          .slice(0, 8)
          .map(([key, value]) => (
            <div key={key} className="fmt-preview-item">
              <span className="fmt-preview-label">{formatLabel(key)}</span>
              <span className="fmt-preview-value">{formatValue(value)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// Utility functions
function formatLabel(str) {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return typeof num === 'number' ? num.toFixed(2) : num;
}

function formatLargeNumber(num) {
  if (num === null || num === undefined) return '-';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function formatValue(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

export default DataFormatter;
