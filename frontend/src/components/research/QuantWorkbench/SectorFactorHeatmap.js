// frontend/src/components/research/QuantWorkbench/SectorFactorHeatmap.js
// Sector x Factor Heatmap - Shows factor exposures by sector
// Option 1: Displays standard factors + selected custom factor for comparison

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader, AlertTriangle, RefreshCw, LayoutGrid, ChevronRight, Sparkles } from '../../icons';

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

// Sector mapping for grouping stocks (matches backend SECTOR_GICS_MAP)
const SECTOR_KEYWORDS = {
  'Technology': ['technology', 'software', 'hardware', 'semiconductor', 'internet'],
  'Healthcare': ['healthcare', 'pharmaceutical', 'biotech', 'medical'],
  'Financials': ['financial', 'bank', 'insurance', 'capital markets'],
  'Consumer Discretionary': ['consumer discretionary', 'retail', 'automotive', 'leisure'],
  'Consumer Staples': ['consumer staples', 'food', 'beverage', 'household'],
  'Energy': ['energy', 'oil', 'gas', 'petroleum'],
  'Industrials': ['industrial', 'aerospace', 'defense', 'machinery'],
  'Materials': ['materials', 'chemicals', 'metals', 'mining'],
  'Utilities': ['utilities', 'electric', 'gas utilities', 'water'],
  'Real Estate': ['real estate', 'reit'],
  'Communication Services': ['communication', 'media', 'entertainment', 'telecom']
};

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

// Color scale for custom factor (AI violet theme - all values use violet shades)
// Intensity based on absolute value - stronger signals are darker violet
const getCustomFactorColor = (value) => {
  if (value === null || isNaN(value)) return 'var(--bg-tertiary)';

  // Clamp absolute value between 0 and 2
  const absValue = Math.min(2, Math.abs(value));

  // All values use violet - intensity based on magnitude
  // Base opacity 0.18, max opacity 0.78 for darker shades
  const intensity = absValue / 2;
  return `rgba(109, 40, 217, ${0.18 + intensity * 0.6})`; // #6D28D9 deep violet
};

// Text color for custom factor cells (white on dark violet)
const getCustomFactorTextColor = (value) => {
  if (value === null || isNaN(value)) return 'var(--text-tertiary)';
  const absValue = Math.abs(value);
  // Use white text when background is dark enough (|value| > 0.8)
  if (absValue > 0.8) return 'white';
  return 'var(--text-primary)';
};

export default function SectorFactorHeatmap({ selectedFactor, onSectorClick, height = 400 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSector, setSelectedSector] = useState(null);
  const [sectorStocks, setSectorStocks] = useState([]);
  const [loadingStocks, setLoadingStocks] = useState(false);

  // Custom factor exposures state
  const [customFactorExposures, setCustomFactorExposures] = useState(null);
  const [loadingCustomFactor, setLoadingCustomFactor] = useState(false);

  // Check if selected factor is a custom factor (has formula and is not a standard factor)
  const isCustomFactor = useMemo(() => {
    if (!selectedFactor?.formula) return false;
    // Not a standard factor name
    return !FACTORS.some(f =>
      f.toLowerCase() === selectedFactor.name?.toLowerCase()
    );
  }, [selectedFactor]);

  // Determine if a factor should be highlighted (matches selectedFactor)
  // Only highlight standard factors when a STANDARD factor is selected (not custom)
  const highlightedFactor = useMemo(() => {
    if (!selectedFactor?.name) return null;
    // Don't highlight standard factor columns when a custom factor is selected
    // Custom factors get their own dedicated column instead
    if (isCustomFactor) return null;
    // Only exact match for standard factors (no partial matching)
    return FACTORS.find(f =>
      f.toLowerCase() === selectedFactor.name.toLowerCase()
    );
  }, [selectedFactor, isCustomFactor]);

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

  // Calculate custom factor exposures when a custom factor is selected
  const calculateCustomFactorExposures = useCallback(async () => {
    if (!isCustomFactor || !selectedFactor?.formula) {
      setCustomFactorExposures(null);
      return;
    }

    setLoadingCustomFactor(true);

    try {
      // Use dedicated endpoint that calculates sector exposures for ALL stocks
      const response = await fetch('/api/factors/custom-sector-exposures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formula: selectedFactor.formula,
          factorId: selectedFactor.id,
          factorName: selectedFactor.name
        })
      });

      if (!response.ok) {
        throw new Error('Failed to calculate custom factor sector exposures');
      }

      const result = await response.json();

      if (result.success && result.data) {
        setCustomFactorExposures({
          name: result.data.name || selectedFactor.name || 'Custom',
          exposures: result.data.exposures,
          stockCount: result.data.totalStocks,
          stockCounts: result.data.stockCounts,
          topStocksBySector: result.data.topStocksBySector
        });
      } else {
        // Generate mock data for demo
        setCustomFactorExposures(generateMockCustomExposures(selectedFactor.name));
      }
    } catch (err) {
      console.warn('Using mock custom factor exposures:', err.message);
      setCustomFactorExposures(generateMockCustomExposures(selectedFactor.name));
    } finally {
      setLoadingCustomFactor(false);
    }
  }, [isCustomFactor, selectedFactor?.formula, selectedFactor?.id, selectedFactor?.name]);

  // Trigger custom factor calculation when factor changes
  useEffect(() => {
    calculateCustomFactorExposures();
  }, [calculateCustomFactorExposures]);

  // Helper: Try to map a stock symbol to a sector (fallback)
  const mapSectorFromSymbol = (symbol) => {
    // Known sector mappings for common stocks
    const knownMappings = {
      'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOGL': 'Technology', 'NVDA': 'Technology',
      'META': 'Technology', 'AMZN': 'Consumer Discretionary', 'TSLA': 'Consumer Discretionary',
      'JPM': 'Financials', 'BAC': 'Financials', 'WFC': 'Financials', 'GS': 'Financials',
      'JNJ': 'Healthcare', 'UNH': 'Healthcare', 'PFE': 'Healthcare', 'ABBV': 'Healthcare',
      'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy', 'SLB': 'Energy',
      'PG': 'Consumer Staples', 'KO': 'Consumer Staples', 'PEP': 'Consumer Staples',
      'NEE': 'Utilities', 'DUK': 'Utilities', 'SO': 'Utilities',
      'CAT': 'Industrials', 'HON': 'Industrials', 'UNP': 'Industrials',
      'LIN': 'Materials', 'APD': 'Materials', 'SHW': 'Materials',
      'PLD': 'Real Estate', 'AMT': 'Real Estate', 'EQIX': 'Real Estate',
      'DIS': 'Communication Services', 'NFLX': 'Communication Services', 'T': 'Communication Services'
    };
    return knownMappings[symbol] || null;
  };

  // Generate mock custom factor exposures for demo
  const generateMockCustomExposures = (factorName) => {
    const exposures = {};
    SECTORS.forEach(sector => {
      // Generate realistic looking exposures with some variation
      exposures[sector] = (Math.random() - 0.5) * 2.5;
    });
    return {
      name: factorName || 'Your Factor',
      exposures,
      stockCount: 100
    };
  };

  // Calculate sector averages (including custom factor if present)
  const sectorAverages = useMemo(() => {
    if (!data?.exposures) return {};

    const averages = {};
    SECTORS.forEach(sector => {
      if (data.exposures[sector]) {
        const standardValues = Object.values(data.exposures[sector]).filter(v => v !== null);
        // Include custom factor in average if present
        const customValue = customFactorExposures?.exposures?.[sector];
        const allValues = customValue !== null && customValue !== undefined
          ? [...standardValues, customValue]
          : standardValues;

        averages[sector] = allValues.length > 0
          ? allValues.reduce((a, b) => a + b, 0) / allValues.length
          : 0;
      }
    });
    return averages;
  }, [data, customFactorExposures]);

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

  // Calculate custom factor average across all sectors
  const customFactorAverage = useMemo(() => {
    if (!customFactorExposures?.exposures) return null;
    const values = SECTORS
      .map(sector => customFactorExposures.exposures[sector])
      .filter(v => v !== null && !isNaN(v));
    return values.length > 0
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null;
  }, [customFactorExposures]);

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
        {isCustomFactor && customFactorExposures && (
          <span className="custom-factor-note">
            {' '}Your factor "<strong>{customFactorExposures.name}</strong>" shown in violet.
          </span>
        )}
      </p>

      {/* Heatmap Table */}
      <div className="heatmap-container" style={{ maxHeight: height }}>
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="sector-header">Sector</th>
              {/* Custom Factor Column - FIRST after Sector for prominence */}
              {isCustomFactor && customFactorExposures && (
                <th className="factor-header custom-factor-header">
                  <span className="custom-factor-label">
                    <Sparkles size={12} className="custom-factor-icon" />
                    <span className="custom-factor-name">
                      {customFactorExposures.name?.length > 10
                        ? customFactorExposures.name.slice(0, 8) + '…'
                        : customFactorExposures.name || 'Custom'
                      }
                    </span>
                  </span>
                </th>
              )}
              {isCustomFactor && loadingCustomFactor && (
                <th className="factor-header custom-factor-header loading">
                  <Loader size={12} className="spin" />
                </th>
              )}
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
                {/* Custom Factor Cell - FIRST for prominence */}
                {isCustomFactor && customFactorExposures && (
                  <td
                    className="heatmap-cell custom-factor-cell"
                    style={{
                      backgroundColor: getCustomFactorColor(customFactorExposures.exposures?.[sector]),
                      color: getCustomFactorTextColor(customFactorExposures.exposures?.[sector])
                    }}
                  >
                    {customFactorExposures.exposures?.[sector] !== null &&
                     !isNaN(customFactorExposures.exposures?.[sector])
                      ? (customFactorExposures.exposures[sector] >= 0 ? '+' : '') +
                        customFactorExposures.exposures[sector].toFixed(2)
                      : '-'
                    }
                  </td>
                )}
                {isCustomFactor && loadingCustomFactor && (
                  <td className="heatmap-cell custom-factor-cell loading">
                    <span className="loading-placeholder">...</span>
                  </td>
                )}
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
              {/* Custom Factor Average - FIRST for prominence */}
              {isCustomFactor && customFactorExposures && (
                <td
                  className="heatmap-cell custom-factor-cell"
                  style={{
                    backgroundColor: getCustomFactorColor(customFactorAverage),
                    color: getCustomFactorTextColor(customFactorAverage)
                  }}
                >
                  {customFactorAverage !== null
                    ? (customFactorAverage >= 0 ? '+' : '') + customFactorAverage.toFixed(2)
                    : '-'
                  }
                </td>
              )}
              {isCustomFactor && loadingCustomFactor && (
                <td className="heatmap-cell custom-factor-cell loading">...</td>
              )}
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
                  {/* Custom factor column header */}
                  {isCustomFactor && customFactorExposures && (
                    <th className="custom-factor-header-small">
                      <Sparkles size={10} style={{ marginRight: 2 }} />
                      {customFactorExposures.name?.slice(0, 4) || 'Cust'}
                    </th>
                  )}
                  {FACTORS.map(f => <th key={f}>{f.slice(0, 3)}</th>)}
                </tr>
              </thead>
              <tbody>
                {sectorStocks.slice(0, 5).map(stock => {
                  // Find custom factor z-score for this stock from topStocksBySector
                  const customStockData = customFactorExposures?.topStocksBySector?.[selectedSector]
                    ?.find(s => s.symbol === stock.symbol);
                  const customZScore = customStockData?.zscoreValue;

                  return (
                    <tr key={stock.symbol}>
                      <td className="stock-symbol">{stock.symbol}</td>
                      {/* Custom factor cell - show actual z-score if available */}
                      {isCustomFactor && customFactorExposures && (
                        <td
                          className="score-cell custom-factor-cell"
                          style={{
                            backgroundColor: customZScore != null
                              ? getCustomFactorColor(customZScore)
                              : 'rgba(109, 40, 217, 0.15)',
                            color: customZScore != null
                              ? getCustomFactorTextColor(customZScore)
                              : 'var(--text-tertiary)'
                          }}
                        >
                          {customZScore != null
                            ? (customZScore >= 0 ? '+' : '') + customZScore.toFixed(1)
                            : '-'
                          }
                        </td>
                      )}
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
