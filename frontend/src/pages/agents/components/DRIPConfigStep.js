// frontend/src/pages/agents/components/DRIPConfigStep.js
// Configuration step for Dividend Reinvestment (DRIP) strategy

import React, { useState } from 'react';
import {
  RefreshCw,
  Plus,
  X,
  Search,
  Info,
  AlertCircle,
  DollarSign
} from '../../../components/icons';
import './BeginnerWizard.css';

const REINVEST_OPTIONS = [
  {
    id: 'same',
    label: 'Same Stock',
    description: 'Reinvest dividends back into the stock that paid them'
  },
  {
    id: 'distributed',
    label: 'Portfolio Allocation',
    description: 'Spread dividends across your target allocation'
  }
];

const DIVIDEND_ETFS = [
  { symbol: 'SCHD', name: 'Schwab US Dividend', yield: '3.5%', type: 'Dividend Growth' },
  { symbol: 'VYM', name: 'Vanguard High Dividend', yield: '3.1%', type: 'High Yield' },
  { symbol: 'DGRO', name: 'iShares Dividend Growth', yield: '2.4%', type: 'Dividend Growth' },
  { symbol: 'HDV', name: 'iShares Core High Dividend', yield: '4.0%', type: 'High Yield' },
  { symbol: 'NOBL', name: 'ProShares Dividend Aristocrats', yield: '2.0%', type: 'Aristocrats' },
  { symbol: 'VIG', name: 'Vanguard Dividend Appreciation', yield: '1.9%', type: 'Dividend Growth' }
];

const DIVIDEND_STOCKS = [
  { symbol: 'JNJ', name: 'Johnson & Johnson', yield: '2.9%', type: 'Healthcare' },
  { symbol: 'KO', name: 'Coca-Cola', yield: '3.1%', type: 'Consumer' },
  { symbol: 'PG', name: 'Procter & Gamble', yield: '2.4%', type: 'Consumer' },
  { symbol: 'O', name: 'Realty Income', yield: '5.5%', type: 'REIT' },
  { symbol: 'T', name: 'AT&T', yield: '6.5%', type: 'Telecom' },
  { symbol: 'VZ', name: 'Verizon', yield: '6.8%', type: 'Telecom' }
];

function DRIPConfigStep({ config, onConfigChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeTab, setActiveTab] = useState('etfs');

  const updateConfig = (field, value) => {
    onConfigChange({ ...config, [field]: value });
  };

  const addHolding = (symbol, name, dividendYield) => {
    const currentHoldings = config.tracked_holdings || [];
    if (currentHoldings.find(h => h.symbol === symbol)) return;

    updateConfig('tracked_holdings', [
      ...currentHoldings,
      { symbol, name, yield: dividendYield }
    ]);
    setShowSearch(false);
    setSearchTerm('');
  };

  const removeHolding = (symbol) => {
    const currentHoldings = config.tracked_holdings || [];
    updateConfig('tracked_holdings', currentHoldings.filter(h => h.symbol !== symbol));
  };

  const allAssets = [...DIVIDEND_ETFS, ...DIVIDEND_STOCKS];
  const displayAssets = activeTab === 'etfs' ? DIVIDEND_ETFS : DIVIDEND_STOCKS;
  const filteredAssets = displayAssets.filter(asset =>
    asset.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate estimated annual dividends
  const estimatedAnnualDividends = (config.tracked_holdings || []).reduce((sum, holding) => {
    const yieldPct = parseFloat(holding.yield) / 100;
    const holdingValue = 10000; // Assume $10k per position for estimate
    return sum + (holdingValue * yieldPct);
  }, 0);

  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Configure Dividend Reinvestment</h2>
        <p className="beginner-step__subtitle">
          Select dividend-paying holdings and configure how dividends are reinvested.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <RefreshCw size={18} />
          Reinvestment Mode
        </h3>

        <div className="reinvest-options">
          {REINVEST_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className={`reinvest-option ${config.reinvest_mode === option.id ? 'selected' : ''}`}
              onClick={() => updateConfig('reinvest_mode', option.id)}
            >
              <span className="reinvest-option__label">{option.label}</span>
              <span className="reinvest-option__desc">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <DollarSign size={18} />
          Minimum Dividend to Reinvest
        </h3>

        <div className="config-amount-input">
          <span className="config-amount-prefix">$</span>
          <input
            type="number"
            value={config.min_dividend_to_reinvest || ''}
            onChange={(e) => updateConfig('min_dividend_to_reinvest', parseFloat(e.target.value) || 0)}
            placeholder="10"
            min="1"
            step="1"
          />
        </div>

        <p className="config-section__hint">
          Only reinvest when accumulated dividends reach this threshold to minimize trading costs.
        </p>
      </div>

      <div className="config-section">
        <h3 className="config-section__title">
          <Plus size={18} />
          Dividend Holdings
        </h3>

        <p className="config-section__desc">
          Select dividend-paying ETFs or stocks to track and reinvest.
        </p>

        <div className="selected-assets drip-holdings">
          {(config.tracked_holdings || []).map(holding => (
            <div key={holding.symbol} className="selected-asset drip-holding">
              <div className="selected-asset__info">
                <span className="selected-asset__symbol">{holding.symbol}</span>
                <span className="selected-asset__name">{holding.name}</span>
              </div>
              <div className="drip-holding__yield">
                <span className="yield-value">{holding.yield}</span>
                <span className="yield-label">yield</span>
              </div>
              <button
                type="button"
                className="selected-asset__remove"
                onClick={() => removeHolding(holding.symbol)}
              >
                <X size={16} />
              </button>
            </div>
          ))}

          {(config.tracked_holdings || []).length === 0 && (
            <div className="no-assets-message">
              <AlertCircle size={18} />
              <span>No holdings selected. Add dividend-paying ETFs or stocks below.</span>
            </div>
          )}
        </div>

        {(config.tracked_holdings || []).length > 0 && (
          <div className="dividend-estimate">
            <span className="dividend-estimate__label">Estimated annual dividends (per $10k/position):</span>
            <span className="dividend-estimate__value">${estimatedAnnualDividends.toFixed(0)}</span>
          </div>
        )}

        <div className="add-asset-section">
          {!showSearch ? (
            <button
              type="button"
              className="add-asset-btn"
              onClick={() => setShowSearch(true)}
            >
              <Plus size={18} />
              Add Dividend Holdings
            </button>
          ) : (
            <div className="asset-search drip-search">
              <div className="asset-search__tabs">
                <button
                  type="button"
                  className={activeTab === 'etfs' ? 'active' : ''}
                  onClick={() => setActiveTab('etfs')}
                >
                  Dividend ETFs
                </button>
                <button
                  type="button"
                  className={activeTab === 'stocks' ? 'active' : ''}
                  onClick={() => setActiveTab('stocks')}
                >
                  Dividend Stocks
                </button>
              </div>
              <div className="asset-search__input">
                <Search size={18} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={`Search ${activeTab === 'etfs' ? 'ETFs' : 'stocks'}...`}
                  autoFocus
                />
                <button type="button" onClick={() => { setShowSearch(false); setSearchTerm(''); }}>
                  <X size={18} />
                </button>
              </div>
              <div className="asset-search__results">
                {filteredAssets.map(asset => (
                  <button
                    key={asset.symbol}
                    type="button"
                    className="asset-search__item drip-item"
                    onClick={() => addHolding(asset.symbol, asset.name, asset.yield)}
                    disabled={(config.tracked_holdings || []).find(h => h.symbol === asset.symbol)}
                  >
                    <span className="asset-search__symbol">{asset.symbol}</span>
                    <span className="asset-search__name">{asset.name}</span>
                    <span className="asset-search__yield">{asset.yield}</span>
                    <span className="asset-search__type">{asset.type}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="beginner-step__info-box">
        <Info size={18} />
        <div>
          <strong>The Power of DRIP</strong>
          <p>
            Dividend reinvestment compounds your returns over time. With a 3% yield
            reinvested, a $10,000 investment grows to ~$18,000 in 20 years from
            dividends alone (before price appreciation).
          </p>
        </div>
      </div>
    </div>
  );
}

export default DRIPConfigStep;
