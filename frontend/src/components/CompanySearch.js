import React, { useState, useEffect, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { Search, X } from './icons';
import { companyAPI } from '../services/api';
import { useDebounce } from '../hooks/useAsync';
import './CompanySearch.css';

/**
 * CompanySearch - Reusable company search with dropdown results
 */
function CompanySearch({
  onSelect,
  excludeSymbols = [],
  placeholder = 'Search companies...',
  maxResults = 8,
  showSector = true,
  autoFocus = false
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [allCompanies, setAllCompanies] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Debounce search query
  const debouncedQuery = useDebounce(query, 150);

  // Load all companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const response = await companyAPI.getAll();
        setAllCompanies(response.data.companies || []);
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    };
    loadCompanies();
  }, []);

  // Filter companies based on query
  useEffect(() => {
    if (debouncedQuery.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const queryUpper = debouncedQuery.toUpperCase();
    const filtered = allCompanies
      .filter(c =>
        c.symbol.toUpperCase().includes(queryUpper) ||
        c.name?.toUpperCase().includes(queryUpper)
      )
      .filter(c => !excludeSymbols.includes(c.symbol))
      .slice(0, maxResults);

    setResults(filtered);
    setIsOpen(filtered.length > 0);
  }, [debouncedQuery, allCompanies, excludeSymbols, maxResults]);

  // Handle company selection
  const handleSelect = useCallback((company) => {
    onSelect(company);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }, [onSelect]);

  // Handle input change
  const handleInputChange = useCallback((e) => {
    setQuery(e.target.value);
  }, []);

  // Clear input
  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      handleClear();
    } else if (e.key === 'Enter' && results.length > 0) {
      handleSelect(results[0]);
    }
  }, [results, handleSelect, handleClear]);

  return (
    <div className="company-search">
      <div className="search-input-wrapper">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="search-input"
        />
        {query && (
          <button onClick={handleClear} className="clear-btn">
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="search-results">
          {results.map(company => (
            <button
              key={company.symbol}
              className="search-result-item"
              onClick={() => handleSelect(company)}
            >
              <div className="result-main">
                <span className="result-symbol">{company.symbol}</span>
                <span className="result-name">{company.name}</span>
              </div>
              {showSector && company.sector && (
                <span className="result-sector">{company.sector}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

CompanySearch.propTypes = {
  onSelect: PropTypes.func.isRequired,
  excludeSymbols: PropTypes.arrayOf(PropTypes.string),
  placeholder: PropTypes.string,
  maxResults: PropTypes.number,
  showSector: PropTypes.bool,
  autoFocus: PropTypes.bool
};

export default memo(CompanySearch);
