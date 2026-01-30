// frontend/src/components/research/QuantWorkbench/SectorFactorHeatmap.js
// Sector x Factor Heatmap - Shows factor exposures by sector

import { useState, useEffect, useMemo } from 'react';
import { Loader, AlertTriangle, RefreshCw, LayoutGrid, ChevronRight } from '../../icons';

// Standard factors
const FACTORS = ['Value', 'Quality', 'Momentum', 'Growth', 'Size', 'Volatility'];

// GICS Sectors
const SECTORS = [
  'Technology',
  'Healthcare',
  'Financials',
  'Consumer Discretionary',
  'Consumer Staples',
  'Industrials',
  'Energy',
  'Materials',
  'Utilities',
  'Real Estate',
  'Communication Services'
];

// Color scale for heatmap (diverging: red-white-green)
const getHeatmapColor = (value) => {
  if (value === null || isNaN(value)) return 'var(--bg-tertiary)';

  // Clamp value between -2 and 2
  const clamped = Math.max(-2, Math.min(2, value));

  if (clamped >= 0) {
    // Positive: white to green
    const intensity = Math.min(1, clamped / 2);
    return `rgba(16, 185, 129, ${0.15 + intensity * 0.6})`;
  } else {
    // Negative: white to red
    const intensity = Math.min(1, Math.abs(clamped) / 2);
    return `rgba(239, 68, 68, ${0.15 + intensity * 0.6})`;
  }
};

// Get text color based on background intensity
const getTextColor = (value) => {
  if (value === null || isNaN(value)) return 'var(--text-tertiary)';
  const absValue = Math.abs(value);
  if (absValue > 1.2) return 'white';
  return 'var(--text-primary)';
};

export default function SectorFactorHeatmap({ selectedFactor, onSectorClick, height = 400 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSector, setSelectedSector] = useState(null);
  const [sectorStocks, setSectorStocks] = useState([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Determine if a factor should be highlighted (matches selectedFactor)
  const highlightedFactor = useMemo(() => {
    if (!selectedFactor?.name) return null;
    // Match against standard factor names
    return FACTORS.find(f =>
      f.toLowerCase() === selectedFactor.name.toLowerCase() ||
      selectedFactor.name.toLowerCase().includes(f.toLowerCase())
    );
  }, [selectedFactor]);

  // Fetch sector exposures
  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/factors/sector-exposures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sector exposures');
      }

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        // Use mock data for demo
        setData(generateMockData());
      }
    } catch (err) {
      console.warn('Using mock data:', err.message);
      setData(generateMockData());
    } finally {
      setLoading(false);
    }
  };

  // Generate mock data for demo
  const generateMockData = () => {
    const mockData = {};

    SECTORS.forEach(sector => {
      mockData[sector] = {};
      FACTORS.forEach(factor => {
        // Generate realistic sector-factor relationships
        let base = (Math.random() - 0.5) * 2;

        // Add sector-specific biases
        if (sector === 'Technology') {
          if (factor === 'Growth') base += 0.8;
          if (factor === 'Value') base -= 0.6;
          if (factor === 'Momentum') base += 0.4;
        } else if (sector === 'Financials') {
          if (factor === 'Value') base += 0.7;
          if (factor === 'Size') base += 0.3;
        } else if (sector === 'Utilities') {
          if (factor === 'Volatility') base += 0.9;
          if (factor === 'Growth') base -= 0.5;
        } else if (sector === 'Healthcare') {
          if (factor === 'Quality') base += 0.5;
        } else if (sector === 'Energy') {
          if (factor === 'Value') base += 0.6;
          if (factor === 'Momentum') base -= 0.4;
        }

        mockData[sector][factor] = parseFloat(base.toFixed(2));
      });
    });

    return { exposures: mockData, lastUpdated: new Date().toISOString() };
  };

  // Fetch stocks for a sector when clicked
  const fetchSectorStocks = async (sector) => {
    setLoadingStocks(true);
    setSelectedSector(sector);

    try {
      const response = await fetch('/api/factors/sector-stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector, limit: 10 })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sector stocks');
      }

      const result = await response.json();
      setSectorStocks(result.success ? result.data : []);
    } catch (err) {
      // Generate mock stocks
      setSectorStocks(generateMockStocks(sector));
    } finally {
      setLoadingStocks(false);
    }
  };

  // Generate mock stocks for demo
  const generateMockStocks = (sector) => {
    const sectorStockMap = {
      'Technology': ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'ADBE', 'CRM', 'ORCL', 'CSCO', 'INTC'],
      'Healthcare': ['JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN'],
      'Financials': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BLK', 'SCHW', 'AXP', 'USB'],
      'Consumer Discretionary': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT', 'LOW', 'BKNG', 'CMG'],
      'Consumer Staples': ['PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'CL', 'MDLZ', 'GIS'],
      'Industrials': ['CAT', 'DE', 'UNP', 'HON', 'RTX', 'BA', 'LMT', 'GE', 'MMM', 'FDX'],
      'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL'],
      'Materials': ['LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'DOW', 'DD', 'NUE', 'VMC'],
      'Utilities': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'PEG', 'ED'],
      'Real Estate': ['PLD', 'AMT', 'EQIX', 'CCI', 'PSA', 'SPG', 'WELL', 'AVB', 'EQR', 'DLR'],
      'Communication Services': ['GOOG', 'META', 'DIS', 'CMCSA', 'NFLX', 'T', 'VZ', 'TMUS', 'CHTR', 'EA']
    };

    const symbols = sectorStockMap[sector] || sectorStockMap['Technology'];

    return symbols.map((symbol, idx) => ({
      symbol,
      name: `${symbol} Inc.`,
      factorScores: {
        Value: (Math.random() - 0.5) * 4,
        Quality: (Math.random() - 0.5) * 4,
        Momentum: (Math.random() - 0.5) * 4,
        Growth: (Math.random() - 0.5) * 4,
        Size: (Math.random() - 0.5) * 4,
        Volatility: (Math.random() - 0.5) * 4
      }
    }));
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Calculate sector averages
  const sectorAverages = useMemo(() => {
    if (!data?.exposures) return {};

    const averages = {};
    SECTORS.forEach(sector => {
      if (data.exposures[sector]) {
        const values = Object.values(data.exposures[sector]).filter(v => v !== null);
        averages[sector] = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
      }
    });
    return averages;
  }, [data]);

  // Calculate factor averages
  const factorAverages = useMemo(() => {
    if (!data?.exposures) return {};

    const averages = {};
    FACTORS.forEach(factor => {
      const values = SECTORS
        .map(sector => data.exposures[sector]?.[factor])
        .filter(v => v !== null && !isNaN(v));
      averages[factor] = values.length > 0
        ? values.reduce((a, b) => a + b, 0) / values.length
        : 0;
    });
    return averages;
  }, [data]);

  if (loading) {
    return (
      <div className="sector-heatmap-loading">
        <Loader size={24} className="spin" />
        <span>Loading sector exposures...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sector-heatmap-error">
        <AlertTriangle size={20} />
        <span>{error}</span>
        <button onClick={fetchData} className="retry-btn">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="sector-factor-heatmap">
      {/* Header */}
      <div className="heatmap-header">
        <div className="header-title">
          <LayoutGrid size={18} />
          <h3>Sector × Factor Exposures</h3>
        </div>
        <button className="refresh-btn" onClick={fetchData}>
          <RefreshCw size={14} />
        </button>
      </div>

      <p className="heatmap-description">
        Z-score exposures by sector. Green = overweight, Red = underweight. Click a sector to see top stocks.
      </p>

      {/* Heatmap Table */}
      <div className="heatmap-container" style={{ maxHeight: height }}>
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="sector-header">Sector</th>
              {FACTORS.map(factor => (
                <th
                  key={factor}
                  className={`factor-header ${highlightedFactor === factor ? 'highlighted' : ''}`}
                >
                  {factor}
                </th>
              ))}
              <th className="avg-header">Avg</th>
            </tr>
          </thead>
          <tbody>
            {SECTORS.map(sector => (
              <tr
                key={sector}
                className={`sector-row ${selectedSector === sector ? 'selected' : ''}`}
                onClick={() => {
                  fetchSectorStocks(sector);
                  onSectorClick?.(sector);
                }}
              >
                <td className="sector-name">
                  {sector}
                  <ChevronRight size={14} className="drill-icon" />
                </td>
                {FACTORS.map(factor => {
                  const value = data?.exposures?.[sector]?.[factor];
                  const isHighlighted = highlightedFactor === factor;
                  return (
                    <td
                      key={factor}
                      className={`heatmap-cell ${isHighlighted ? 'highlighted' : ''}`}
                      style={{
                        backgroundColor: getHeatmapColor(value),
                        color: getTextColor(value)
                      }}
                    >
                      {value !== null && !isNaN(value)
                        ? (value >= 0 ? '+' : '') + value.toFixed(2)
                        : '-'
                      }
                    </td>
                  );
                })}
                <td
                  className="heatmap-cell avg-cell"
                  style={{
                    backgroundColor: getHeatmapColor(sectorAverages[sector]),
                    color: getTextColor(sectorAverages[sector])
                  }}
                >
                  {sectorAverages[sector] !== undefined
                    ? (sectorAverages[sector] >= 0 ? '+' : '') + sectorAverages[sector].toFixed(2)
                    : '-'
                  }
                </td>
              </tr>
            ))}
            {/* Factor averages row */}
            <tr className="averages-row">
              <td className="sector-name">Average</td>
              {FACTORS.map(factor => (
                <td
                  key={factor}
                  className={`heatmap-cell ${highlightedFactor === factor ? 'highlighted' : ''}`}
                  style={{
                    backgroundColor: getHeatmapColor(factorAverages[factor]),
                    color: getTextColor(factorAverages[factor])
                  }}
                >
                  {factorAverages[factor] !== undefined
                    ? (factorAverages[factor] >= 0 ? '+' : '') + factorAverages[factor].toFixed(2)
                    : '-'
                  }
                </td>
              ))}
              <td className="heatmap-cell avg-cell">-</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="heatmap-legend">
        <span className="legend-label">Underweight</span>
        <div className="legend-scale">
          <div className="scale-segment" style={{ background: 'rgba(239, 68, 68, 0.75)' }}>-2</div>
          <div className="scale-segment" style={{ background: 'rgba(239, 68, 68, 0.45)' }}>-1</div>
          <div className="scale-segment" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>0</div>
          <div className="scale-segment" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>0</div>
          <div className="scale-segment" style={{ background: 'rgba(16, 185, 129, 0.45)' }}>+1</div>
          <div className="scale-segment" style={{ background: 'rgba(16, 185, 129, 0.75)' }}>+2</div>
        </div>
        <span className="legend-label">Overweight</span>
      </div>

      {/* Sector Drill-down Panel */}
      {selectedSector && (
        <div className="sector-drilldown">
          <div className="drilldown-header">
            <h5>{selectedSector} - Top Stocks</h5>
            <button onClick={() => setSelectedSector(null)} className="close-btn">×</button>
          </div>

          {loadingStocks ? (
            <div className="drilldown-loading">
              <Loader size={16} className="spin" />
              <span>Loading stocks...</span>
            </div>
          ) : (
            <table className="drilldown-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  {FACTORS.map(f => <th key={f}>{f.slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {sectorStocks.slice(0, 5).map(stock => (
                  <tr key={stock.symbol}>
                    <td className="stock-symbol">{stock.symbol}</td>
                    {FACTORS.map(factor => {
                      const score = stock.factorScores?.[factor];
                      return (
                        <td
                          key={factor}
                          className="score-cell"
                          style={{
                            backgroundColor: getHeatmapColor(score),
                            color: getTextColor(score)
                          }}
                        >
                          {score !== null && !isNaN(score)
                            ? (score >= 0 ? '+' : '') + score.toFixed(1)
                            : '-'
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
