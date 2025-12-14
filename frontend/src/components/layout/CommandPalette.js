// frontend/src/components/layout/CommandPalette.js
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
  Search,
  TrendingUp,
  Home,
  BarChart3,
  Star,
  PieChart,
  Settings,
  RefreshCw,
  Plus,
  ArrowRight,
  Clock,
  Zap
} from 'lucide-react';
import { companyAPI } from '../../services/api';
import './CommandPalette.css';

function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, [open]);

  // Search for companies
  useEffect(() => {
    if (!search || search.length < 1) {
      setSearchResults([]);
      return;
    }

    const searchCompanies = async () => {
      setLoading(true);
      try {
        const response = await companyAPI.getAll();
        const companies = response.data.companies || [];
        const filtered = companies
          .filter(c =>
            c.symbol.toLowerCase().includes(search.toLowerCase()) ||
            c.name.toLowerCase().includes(search.toLowerCase())
          )
          .slice(0, 8);
        setSearchResults(filtered);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchCompanies, 150);
    return () => clearTimeout(debounce);
  }, [search]);

  const addToRecentSearches = useCallback((item) => {
    const recent = [item, ...recentSearches.filter(r => r.symbol !== item.symbol)].slice(0, 5);
    setRecentSearches(recent);
    localStorage.setItem('recentSearches', JSON.stringify(recent));
  }, [recentSearches]);

  const handleAction = useCallback((action) => {
    switch (action) {
      case 'refresh':
        window.location.reload();
        break;
      case 'watchlist':
        navigate('/watchlist');
        break;
      case 'compare':
        navigate('/compare');
        break;
      case 'screen':
        navigate('/screening');
        break;
      default:
        break;
    }
  }, [navigate]);

  const handleSelect = useCallback((value) => {
    if (value.startsWith('/')) {
      navigate(value);
    } else if (value.startsWith('stock:')) {
      const symbol = value.replace('stock:', '');
      const company = searchResults.find(c => c.symbol === symbol) ||
                      recentSearches.find(c => c.symbol === symbol);
      if (company) {
        addToRecentSearches({ symbol: company.symbol, name: company.name });
      }
      navigate(`/company/${symbol}`);
    } else if (value.startsWith('action:')) {
      const action = value.replace('action:', '');
      handleAction(action);
    }
    onOpenChange(false);
    setSearch('');
  }, [navigate, onOpenChange, searchResults, recentSearches, addToRecentSearches, handleAction]);

  // Close on escape
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onOpenChange]);

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={() => onOpenChange(false)}>
      <div className="command-palette-container" onClick={e => e.stopPropagation()}>
        <Command className="command-palette" shouldFilter={false}>
          <div className="command-input-wrapper">
            <Search size={18} className="command-search-icon" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search stocks, metrics, or commands..."
              className="command-input"
              autoFocus
            />
            <kbd className="command-kbd">ESC</kbd>
          </div>

          <Command.List className="command-list">
            {loading && (
              <Command.Loading className="command-loading">
                Searching...
              </Command.Loading>
            )}

            <Command.Empty className="command-empty">
              No results found. Try searching for a stock symbol or company name.
            </Command.Empty>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <Command.Group heading="Stocks" className="command-group">
                {searchResults.map(company => (
                  <Command.Item
                    key={company.symbol}
                    value={`stock:${company.symbol}`}
                    onSelect={handleSelect}
                    className="command-item"
                  >
                    <TrendingUp size={16} className="command-item-icon" />
                    <div className="command-item-content">
                      <span className="command-item-symbol">{company.symbol}</span>
                      <span className="command-item-name">{company.name}</span>
                    </div>
                    <ArrowRight size={14} className="command-item-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Recent Searches */}
            {!search && recentSearches.length > 0 && (
              <Command.Group heading="Recent" className="command-group">
                {recentSearches.map(item => (
                  <Command.Item
                    key={item.symbol}
                    value={`stock:${item.symbol}`}
                    onSelect={handleSelect}
                    className="command-item"
                  >
                    <Clock size={16} className="command-item-icon muted" />
                    <div className="command-item-content">
                      <span className="command-item-symbol">{item.symbol}</span>
                      <span className="command-item-name">{item.name}</span>
                    </div>
                    <ArrowRight size={14} className="command-item-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Actions */}
            {!search && (
              <Command.Group heading="Actions" className="command-group">
                <Command.Item value="action:watchlist" onSelect={handleSelect} className="command-item">
                  <Plus size={16} className="command-item-icon" />
                  <span className="command-item-label">Add to Watchlist</span>
                  <kbd className="command-shortcut">W</kbd>
                </Command.Item>
                <Command.Item value="action:compare" onSelect={handleSelect} className="command-item">
                  <BarChart3 size={16} className="command-item-icon" />
                  <span className="command-item-label">Compare Stocks</span>
                  <kbd className="command-shortcut">C</kbd>
                </Command.Item>
                <Command.Item value="action:screen" onSelect={handleSelect} className="command-item">
                  <Zap size={16} className="command-item-icon" />
                  <span className="command-item-label">Run Screen</span>
                  <kbd className="command-shortcut">S</kbd>
                </Command.Item>
                <Command.Item value="action:refresh" onSelect={handleSelect} className="command-item">
                  <RefreshCw size={16} className="command-item-icon" />
                  <span className="command-item-label">Refresh Data</span>
                  <kbd className="command-shortcut">R</kbd>
                </Command.Item>
              </Command.Group>
            )}

            {/* Navigation */}
            {!search && (
              <Command.Group heading="Navigation" className="command-group">
                <Command.Item value="/" onSelect={handleSelect} className="command-item">
                  <Home size={16} className="command-item-icon" />
                  <span className="command-item-label">Home Dashboard</span>
                  <div className="command-shortcut-group">
                    <kbd>G</kbd><kbd>H</kbd>
                  </div>
                </Command.Item>
                <Command.Item value="/screening" onSelect={handleSelect} className="command-item">
                  <Search size={16} className="command-item-icon" />
                  <span className="command-item-label">Screener</span>
                  <div className="command-shortcut-group">
                    <kbd>G</kbd><kbd>S</kbd>
                  </div>
                </Command.Item>
                <Command.Item value="/ipo" onSelect={handleSelect} className="command-item">
                  <TrendingUp size={16} className="command-item-icon" />
                  <span className="command-item-label">IPO Pipeline</span>
                  <div className="command-shortcut-group">
                    <kbd>G</kbd><kbd>I</kbd>
                  </div>
                </Command.Item>
                <Command.Item value="/sectors" onSelect={handleSelect} className="command-item">
                  <PieChart size={16} className="command-item-icon" />
                  <span className="command-item-label">Sector Analysis</span>
                  <div className="command-shortcut-group">
                    <kbd>G</kbd><kbd>E</kbd>
                  </div>
                </Command.Item>
                <Command.Item value="/watchlist" onSelect={handleSelect} className="command-item">
                  <Star size={16} className="command-item-icon" />
                  <span className="command-item-label">Watchlist</span>
                  <div className="command-shortcut-group">
                    <kbd>G</kbd><kbd>W</kbd>
                  </div>
                </Command.Item>
                <Command.Item value="/settings" onSelect={handleSelect} className="command-item">
                  <Settings size={16} className="command-item-icon" />
                  <span className="command-item-label">Settings</span>
                  <div className="command-shortcut-group">
                    <kbd>G</kbd><kbd>,</kbd>
                  </div>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
