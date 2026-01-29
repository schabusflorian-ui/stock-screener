// frontend/src/pages/agents/components/AssetSearchInput.js
// Reusable asset search component with both ETF presets and stock search

import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Plus } from '../../../components/icons';
import { companyAPI } from '../../../services/api';
import './BeginnerWizard.css';

// Popular ETFs for quick selection
const POPULAR_ETFS = [
  { symbol: 'VTI', name: 'Vanguard Total Stock Market', type: 'US Total Market' },
  { symbol: 'VOO', name: 'Vanguard S&P 500', type: 'Large Cap US' },
  { symbol: 'VXUS', name: 'Vanguard Total International', type: 'International' },
  { symbol: 'BND', name: 'Vanguard Total Bond', type: 'Bonds' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'Tech/Growth' },
  { symbol: 'SCHD', name: 'Schwab US Dividend', type: 'Dividend' },
  { symbol: 'VGT', name: 'Vanguard Info Tech', type: 'Technology' },
  { symbol: 'VNQ', name: 'Vanguard Real Estate', type: 'REITs' },
  { symbol: 'VYM', name: 'Vanguard High Dividend', type: 'Dividend' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'Innovation' },
  { symbol: 'SPY', name: 'SPDR S&P 500', type: 'Large Cap US' },
  { symbol: 'IWM', name: 'iShares Russell 2000', type: 'Small Cap US' }
];

function AssetSearchInput({
  onSelect,
  selectedSymbols = [],
  placeholder = 'Search stocks or ETFs...',
  onClose
}) {
  const [activeTab, setActiveTab] = useState('etfs'); // 'etfs' or 'search'
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  // Load all companies when search tab is activated
  useEffect(() => {
    if (activeTab === 'search' && !companiesLoaded) {
      loadCompanies();
    }
  }, [activeTab, companiesLoaded]);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const response = await companyAPI.getAll();
      setAllCompanies(response.data.companies || []);
      setCompaniesLoaded(true);
    } catch (error) {
      console.error('Error loading companies:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 1) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      const queryUpper = searchTerm.toUpperCase();
      const filtered = allCompanies
        .filter(c =>
          c.symbol.toUpperCase().includes(queryUpper) ||
          c.name?.toUpperCase().includes(queryUpper)
        )
        .filter(c => !selectedSymbols.includes(c.symbol))
        .slice(0, 12);
      setSearchResults(filtered);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchTerm, allCompanies, selectedSymbols]);

  const handleSelect = useCallback((symbol, name) => {
    onSelect(symbol, name);
    setSearchTerm('');
    setSearchResults([]);
  }, [onSelect]);

  // Filter ETFs based on search and already selected
  const filteredETFs = POPULAR_ETFS
    .filter(etf => !selectedSymbols.includes(etf.symbol))
    .filter(etf =>
      !searchTerm ||
      etf.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      etf.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  return (
    <div className="asset-search">
      {/* Tabs */}
      <div className="asset-search__tabs">
        <button
          type="button"
          className={activeTab === 'etfs' ? 'active' : ''}
          onClick={() => setActiveTab('etfs')}
        >
          Popular ETFs
        </button>
        <button
          type="button"
          className={activeTab === 'search' ? 'active' : ''}
          onClick={() => setActiveTab('search')}
        >
          Search All Stocks
        </button>
      </div>

      {/* Search Input */}
      <div className="asset-search__input">
        <Search size={18} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={activeTab === 'etfs' ? 'Filter ETFs...' : placeholder}
          autoFocus
        />
        {onClose && (
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Results */}
      <div className="asset-search__results">
        {activeTab === 'etfs' ? (
          // ETF List
          filteredETFs.length > 0 ? (
            filteredETFs.map(etf => (
              <button
                key={etf.symbol}
                type="button"
                className="asset-search__item"
                onClick={() => handleSelect(etf.symbol, etf.name)}
              >
                <span className="asset-search__symbol">{etf.symbol}</span>
                <span className="asset-search__name">{etf.name}</span>
                <span className="asset-search__type">{etf.type}</span>
              </button>
            ))
          ) : (
            <div className="asset-search__empty">
              {searchTerm ? 'No matching ETFs' : 'All ETFs already selected'}
            </div>
          )
        ) : (
          // Stock Search Results
          loading ? (
            <div className="asset-search__loading">Loading stocks...</div>
          ) : searchTerm.length < 1 ? (
            <div className="asset-search__hint">
              Type to search stocks by symbol or company name
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map(company => (
              <button
                key={company.symbol}
                type="button"
                className="asset-search__item"
                onClick={() => handleSelect(company.symbol, company.name)}
              >
                <span className="asset-search__symbol">{company.symbol}</span>
                <span className="asset-search__name">{company.name}</span>
                {company.sector && (
                  <span className="asset-search__type">{company.sector}</span>
                )}
              </button>
            ))
          ) : (
            <div className="asset-search__empty">
              No stocks found matching "{searchTerm}"
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default AssetSearchInput;
