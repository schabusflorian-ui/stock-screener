// frontend/src/components/layout/CommandPalette.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Zap,
  Bot,
  Send,
  Sparkles,
  Loader,
  Building2,
  HelpCircle
} from 'lucide-react';
import { companyAPI, analystAPI, sentimentAPI } from '../../services/api';
import './CommandPalette.css';

function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [loading, setLoading] = useState(false);

  // NL Query state
  const [mode, setMode] = useState('search'); // 'search' or 'ask'
  const [nlResponse, setNlResponse] = useState(null);
  const [nlLoading, setNlLoading] = useState(false);
  const inputRef = useRef(null);

  // Company context state
  const [currentCompany, setCurrentCompany] = useState(null);
  const [companyContext, setCompanyContext] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);

  // Detect current company from URL
  useEffect(() => {
    const match = location.pathname.match(/^\/company\/([A-Z0-9.]+)$/i);
    if (match) {
      const symbol = match[1].toUpperCase();
      setCurrentCompany(symbol);
    } else {
      setCurrentCompany(null);
      setCompanyContext(null);
    }
  }, [location.pathname]);

  // Load company context when on a company page and palette opens
  useEffect(() => {
    if (open && currentCompany && !companyContext) {
      loadCompanyContext(currentCompany);
    }
  }, [open, currentCompany]);

  const loadCompanyContext = async (symbol) => {
    setLoadingContext(true);
    try {
      const [companyRes, metricsRes, sentimentRes] = await Promise.allSettled([
        companyAPI.getOne(symbol),
        companyAPI.getMetrics(symbol),
        sentimentAPI.getAnalyst(symbol)
      ]);

      setCompanyContext({
        company: companyRes.status === 'fulfilled' ? companyRes.value.data : null,
        metrics: metricsRes.status === 'fulfilled' ? metricsRes.value.data?.metrics?.[0] : null,
        analyst_ratings: sentimentRes.status === 'fulfilled' ? sentimentRes.value.data : null
      });
    } catch (err) {
      console.error('Failed to load company context:', err);
    } finally {
      setLoadingContext(false);
    }
  };

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, [open]);

  // Reset state when closing
  useEffect(() => {
    if (!open) {
      setMode('search');
      setNlResponse(null);
      setNlLoading(false);
      setSearch('');
    }
  }, [open]);

  // Detect if input looks like a question (NL query)
  const looksLikeQuestion = useCallback((text) => {
    if (!text || text.length < 3) return false;
    const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'is', 'are', 'can', 'should', 'would', 'could', 'will', 'does', 'do', 'compare', 'analyze', 'explain', 'tell', 'show', 'find'];
    const firstWord = text.toLowerCase().split(' ')[0];
    return questionWords.includes(firstWord) || text.endsWith('?');
  }, []);

  // Company-specific quick queries
  const companyQueries = currentCompany ? [
    { query: `What's the investment thesis for ${currentCompany}?`, label: 'Investment thesis' },
    { query: `What are the main risks for ${currentCompany}?`, label: 'Key risks' },
    { query: `Is ${currentCompany} fairly valued?`, label: 'Valuation check' },
    { query: `What's the competitive moat for ${currentCompany}?`, label: 'Competitive moat' },
    { query: `How is ${currentCompany}'s management?`, label: 'Management quality' }
  ] : [];

  // Handle NL Query submission
  const handleAskAI = useCallback(async (queryOverride = null) => {
    const queryText = queryOverride || search;
    if (!queryText.trim() || nlLoading) return;

    setNlLoading(true);
    setNlResponse(null);
    setMode('ask');
    if (queryOverride) {
      setSearch(queryOverride);
    }

    try {
      // Create a quick conversation and get response
      const convResponse = await analystAPI.createConversation({
        analystId: 'value', // Value analyst for comprehensive analysis
        companySymbol: currentCompany || undefined
      });

      const conversation = convResponse.data.conversation;

      const msgResponse = await analystAPI.sendMessage(
        conversation.id,
        queryText,
        currentCompany ? companyContext : null
      );

      setNlResponse({
        query: queryText,
        response: msgResponse.data.message.content,
        company: currentCompany,
        conversationId: conversation.id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('NL Query error:', error);
      setNlResponse({
        query: queryText,
        error: 'Failed to get AI response. Try again or visit the AI Analyst page.',
        timestamp: new Date().toISOString()
      });
    } finally {
      setNlLoading(false);
    }
  }, [search, nlLoading, currentCompany, companyContext]);

  // Search for companies (includes inactive for discoverability)
  useEffect(() => {
    if (!search || search.length < 1) {
      setSearchResults([]);
      return;
    }

    const searchCompanies = async () => {
      setLoading(true);
      try {
        // Include inactive companies so they're searchable
        const response = await companyAPI.getAll({ include_inactive: 'true' });
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
            {mode === 'ask' ? (
              <Bot size={18} className="command-search-icon ai" />
            ) : (
              <Search size={18} className="command-search-icon" />
            )}
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={(val) => {
                setSearch(val);
                if (mode === 'ask' && !nlResponse) {
                  setMode('search');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && looksLikeQuestion(search) && !nlLoading) {
                  e.preventDefault();
                  handleAskAI();
                }
              }}
              placeholder={mode === 'ask'
                ? (currentCompany ? `Ask about ${currentCompany}...` : "Ask a question about investments...")
                : (currentCompany ? `Search or ask about ${currentCompany}...` : "Search stocks or ask a question...")}
              className="command-input"
              autoFocus
            />
            {search && looksLikeQuestion(search) && !nlLoading && mode !== 'ask' && (
              <button
                className="command-ask-btn"
                onClick={handleAskAI}
                title="Ask AI (Enter)"
              >
                <Sparkles size={14} />
                Ask AI
              </button>
            )}
            {nlLoading && (
              <div className="command-loading-indicator">
                <Loader size={14} className="spin" />
              </div>
            )}
            <kbd className="command-kbd">ESC</kbd>
          </div>

          <Command.List className="command-list">
            {/* NL Query Response */}
            {mode === 'ask' && (nlResponse || nlLoading) && (
              <div className="nl-response-container">
                {nlLoading ? (
                  <div className="nl-loading">
                    <Bot size={20} className="nl-loading-icon" />
                    <div className="nl-loading-text">
                      <span className="nl-loading-title">Thinking...</span>
                      <span className="nl-loading-subtitle">Getting AI response</span>
                    </div>
                  </div>
                ) : nlResponse?.error ? (
                  <div className="nl-error">
                    <span className="nl-error-icon">⚠️</span>
                    <span>{nlResponse.error}</span>
                    <button
                      className="nl-retry-btn"
                      onClick={() => navigate('/analyst')}
                    >
                      Open AI Analyst
                    </button>
                  </div>
                ) : nlResponse ? (
                  <div className="nl-response">
                    <div className="nl-response-header">
                      <Bot size={16} className="nl-response-icon" />
                      <span className="nl-response-label">AI Response</span>
                      {nlResponse.company && (
                        <span className="nl-response-company">
                          <Building2 size={12} />
                          {nlResponse.company}
                        </span>
                      )}
                    </div>
                    <div className="nl-response-content">
                      {nlResponse.response}
                    </div>
                    <div className="nl-response-actions">
                      <button
                        className="nl-action-btn"
                        onClick={() => {
                          setMode('search');
                          setNlResponse(null);
                          setSearch('');
                        }}
                      >
                        New Search
                      </button>
                      <button
                        className="nl-action-btn primary"
                        onClick={() => {
                          const analystUrl = nlResponse.company
                            ? `/analyst?symbol=${nlResponse.company}`
                            : '/analyst';
                          navigate(analystUrl);
                          onOpenChange(false);
                        }}
                      >
                        Continue in AI Analyst →
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {mode === 'search' && loading && (
              <Command.Loading className="command-loading">
                Searching...
              </Command.Loading>
            )}

            {mode === 'search' && (
              <Command.Empty className="command-empty">
                No results found. Try searching for a stock symbol or company name.
              </Command.Empty>
            )}

            {/* Search Results */}
            {mode === 'search' && searchResults.length > 0 && (
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
                      {company.is_active === 0 && (
                        <span className="command-item-badge inactive">Inactive</span>
                      )}
                    </div>
                    <ArrowRight size={14} className="command-item-arrow" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Recent Searches */}
            {mode === 'search' && !search && recentSearches.length > 0 && (
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

            {/* Company-Specific Quick Queries */}
            {mode === 'search' && !search && currentCompany && companyQueries.length > 0 && (
              <Command.Group heading={`Ask about ${currentCompany}`} className="command-group company-queries">
                {loadingContext ? (
                  <div className="command-context-loading">
                    <Loader size={14} className="spin" />
                    <span>Loading company data...</span>
                  </div>
                ) : (
                  companyQueries.map((item, idx) => (
                    <Command.Item
                      key={idx}
                      value={`ask:${item.query}`}
                      onSelect={() => handleAskAI(item.query)}
                      className="command-item company-query-item"
                    >
                      <HelpCircle size={16} className="command-item-icon ai-icon" />
                      <div className="command-item-content">
                        <span className="command-item-label">{item.label}</span>
                      </div>
                      <Sparkles size={14} className="command-item-arrow ai" />
                    </Command.Item>
                  ))
                )}
              </Command.Group>
            )}

            {/* Quick Actions */}
            {mode === 'search' && !search && (
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
            {mode === 'search' && !search && (
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
