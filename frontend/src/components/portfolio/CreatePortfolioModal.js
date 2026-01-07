// frontend/src/components/portfolio/CreatePortfolioModal.js
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Wallet, Loader, PieChart, BarChart3, TrendingUp, Shield, Zap, DollarSign, Users, Search, Trash2, Layers, ChevronRight, ChevronDown, Briefcase, BookOpen } from 'lucide-react';
import { portfoliosAPI, etfsAPI, investorsAPI } from '../../services/api';
import './CreatePortfolioModal.css';

const MODEL_ICONS = {
  'Conservative': Shield,
  'Moderate': BarChart3,
  'Aggressive Growth': TrendingUp,
  'All Weather': Zap,
  'Three Fund': PieChart,
  'Dividend Income': DollarSign
};

const RISK_COLORS = {
  'low': '#22c55e',
  'medium-low': '#84cc16',
  'medium': '#eab308',
  'high': '#ef4444'
};

function CreatePortfolioModal({ onClose, onCreated, initialMode = 'manual' }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState(initialMode); // 'manual', 'etf_model', 'clone', or 'custom_etf'
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [initialCash, setInitialCash] = useState(10000);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // ETF Model state
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelDetails, setModelDetails] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);

  // Clone from Investor state
  const [investors, setInvestors] = useState([]);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [clonePreview, setClonePreview] = useState(null);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [minWeight, setMinWeight] = useState(0);
  const [maxPositions, setMaxPositions] = useState('');

  // Custom ETF state
  const [etfSearch, setEtfSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedEtfs, setSelectedEtfs] = useState([]); // Array of { symbol, name, weight, expenseRatio }
  const [essentialEtfs, setEssentialEtfs] = useState([]);
  const [loadingEtfs, setLoadingEtfs] = useState(false);

  // ETF Browser state
  const [etfBrowserMode, setEtfBrowserMode] = useState('search'); // 'search', 'categories', 'templates'
  const [categories, setCategories] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryEtfs, setCategoryEtfs] = useState([]);
  const [loadingCategoryEtfs, setLoadingCategoryEtfs] = useState(false);
  const [lazyPortfolios, setLazyPortfolios] = useState([]);
  const [selectedLazyPortfolio, setSelectedLazyPortfolio] = useState(null);

  useEffect(() => {
    if (mode === 'etf_model') {
      loadModels();
    } else if (mode === 'clone') {
      loadInvestors();
    } else if (mode === 'custom_etf') {
      loadEtfData();
    }
  }, [mode]);

  useEffect(() => {
    if (selectedModel) {
      loadModelDetails(selectedModel.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  // Load clone preview when investor or settings change
  useEffect(() => {
    if (selectedInvestor && mode === 'clone') {
      loadClonePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvestor, initialCash, minWeight, maxPositions]);

  const loadInvestors = async () => {
    try {
      setLoadingInvestors(true);
      const res = await investorsAPI.getAll();
      setInvestors(res.data.investors || []);
    } catch (err) {
      console.error('Error loading investors:', err);
      setError('Failed to load famous investors');
    } finally {
      setLoadingInvestors(false);
    }
  };

  const loadClonePreview = async () => {
    if (!selectedInvestor) return;
    try {
      setLoadingPreview(true);
      const res = await investorsAPI.clonePreview(selectedInvestor.id, {
        amount: parseFloat(initialCash) || 10000,
        minWeight: parseFloat(minWeight) || 0,
        maxPositions: maxPositions ? parseInt(maxPositions) : null
      });
      setClonePreview(res.data);
      // Auto-set name based on investor
      if (!name || name.includes(' Clone')) {
        setName(`${selectedInvestor.name} Clone`);
      }
    } catch (err) {
      console.error('Error loading clone preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const loadModels = async () => {
    try {
      setLoadingModels(true);
      const res = await etfsAPI.getModels();
      setModels(res.data.models || []);
    } catch (err) {
      console.error('Error loading models:', err);
      setError('Failed to load model portfolios');
    } finally {
      setLoadingModels(false);
    }
  };

  const loadModelDetails = async (modelName) => {
    try {
      const res = await etfsAPI.getModel(modelName);
      setModelDetails(res.data.model);
      // Auto-set name based on model
      if (!name || name === selectedModel?.name + ' Portfolio') {
        setName(modelName + ' Portfolio');
      }
    } catch (err) {
      console.error('Error loading model details:', err);
    }
  };

  // Load ETF data for custom ETF mode
  const loadEtfData = async () => {
    try {
      setLoadingEtfs(true);
      // Load essential ETFs, categories, and lazy portfolios in parallel
      const [essentialRes, categoriesRes, portfoliosRes] = await Promise.all([
        etfsAPI.getEssential(),
        etfsAPI.getCategories(true), // with counts
        etfsAPI.getLazyPortfolios(true) // featured only
      ]);
      setEssentialEtfs(essentialRes.data.etfs || []);
      setCategories(categoriesRes.data.categories || []);
      setLazyPortfolios(portfoliosRes.data.portfolios || []);
    } catch (err) {
      console.error('Error loading ETF data:', err);
    } finally {
      setLoadingEtfs(false);
    }
  };

  // Load ETFs for a specific category
  const loadCategoryEtfs = async (categorySlug) => {
    try {
      setLoadingCategoryEtfs(true);
      const res = await etfsAPI.getAll({ category: categorySlug, limit: 50 });
      setCategoryEtfs(res.data.etfs || []);
    } catch (err) {
      console.error('Error loading category ETFs:', err);
    } finally {
      setLoadingCategoryEtfs(false);
    }
  };

  // Load lazy portfolio details
  const loadLazyPortfolioDetails = async (slug) => {
    try {
      const res = await etfsAPI.getLazyPortfolio(slug);
      return res.data.portfolio;
    } catch (err) {
      console.error('Error loading lazy portfolio:', err);
      return null;
    }
  };

  // Apply a lazy portfolio template to selected ETFs
  const applyLazyPortfolio = async (portfolio) => {
    setSelectedLazyPortfolio(portfolio);
    const details = await loadLazyPortfolioDetails(portfolio.slug);
    if (details && details.allocations) {
      const newEtfs = details.allocations.map(alloc => ({
        symbol: alloc.etf_symbol,
        name: alloc.etf_name || alloc.etf_symbol,
        weight: alloc.weight * 100, // Convert from decimal to percent
        expenseRatio: alloc.expense_ratio
      }));
      setSelectedEtfs(newEtfs);
      // Auto-set portfolio name
      if (!name || name === 'My Custom ETF Portfolio') {
        setName(`${portfolio.name} Portfolio`);
      }
    }
  };

  // Toggle category expansion
  const toggleCategory = (slug) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(slug)) {
      newExpanded.delete(slug);
      if (selectedCategory === slug) {
        setSelectedCategory(null);
        setCategoryEtfs([]);
      }
    } else {
      newExpanded.add(slug);
    }
    setExpandedCategories(newExpanded);
  };

  // Select a category to browse its ETFs
  const selectCategory = (category) => {
    setSelectedCategory(category.slug);
    loadCategoryEtfs(category.slug);
  };

  // Search ETFs with debounce
  const searchEtfs = useCallback(async (query) => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }
    try {
      setSearchLoading(true);
      const res = await etfsAPI.search(query, 10);
      // Filter out already selected ETFs
      const selectedSymbols = new Set(selectedEtfs.map(e => e.symbol));
      setSearchResults((res.data.etfs || []).filter(etf => !selectedSymbols.has(etf.symbol)));
    } catch (err) {
      console.error('Error searching ETFs:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [selectedEtfs]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mode === 'custom_etf' && etfSearch) {
        searchEtfs(etfSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [etfSearch, mode, searchEtfs]);

  // Add ETF to selection
  const addEtf = (etf) => {
    const newWeight = selectedEtfs.length === 0 ? 100 : 0;
    setSelectedEtfs([...selectedEtfs, {
      symbol: etf.symbol,
      name: etf.name || etf.symbol,
      weight: newWeight,
      expenseRatio: etf.expense_ratio || etf.expenseRatio
    }]);
    setEtfSearch('');
    setSearchResults([]);
  };

  // Remove ETF from selection
  const removeEtf = (symbol) => {
    setSelectedEtfs(selectedEtfs.filter(e => e.symbol !== symbol));
  };

  // Update ETF weight
  const updateEtfWeight = (symbol, weight) => {
    setSelectedEtfs(selectedEtfs.map(e =>
      e.symbol === symbol ? { ...e, weight: parseFloat(weight) || 0 } : e
    ));
  };

  // Equal weight distribution
  const equalizeWeights = () => {
    if (selectedEtfs.length === 0) return;
    const equalWeight = Math.floor(100 / selectedEtfs.length);
    const remainder = 100 - (equalWeight * selectedEtfs.length);
    setSelectedEtfs(selectedEtfs.map((e, i) => ({
      ...e,
      weight: equalWeight + (i === 0 ? remainder : 0)
    })));
  };

  // Calculate total weight
  const totalWeight = selectedEtfs.reduce((sum, e) => sum + (e.weight || 0), 0);

  // Calculate weighted expense ratio
  const weightedExpenseRatio = selectedEtfs.reduce((sum, e) => {
    return sum + ((e.expenseRatio || 0) * (e.weight || 0) / 100);
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Portfolio name is required');
      return;
    }

    if (mode === 'etf_model' && !selectedModel) {
      setError('Please select a model portfolio');
      return;
    }

    if (mode === 'clone' && !selectedInvestor) {
      setError('Please select an investor to clone');
      return;
    }

    if (mode === 'custom_etf') {
      if (selectedEtfs.length === 0) {
        setError('Please select at least one ETF');
        return;
      }
      if (Math.abs(totalWeight - 100) > 0.1) {
        setError(`Allocations must sum to 100% (currently ${totalWeight.toFixed(1)}%)`);
        return;
      }
    }

    try {
      setCreating(true);
      setError(null);

      // Get description based on mode
      let autoDescription = '';
      if (mode === 'etf_model') {
        autoDescription = selectedModel?.description || '';
      } else if (mode === 'clone') {
        autoDescription = `Cloned from ${selectedInvestor?.name}`;
      } else if (mode === 'custom_etf') {
        autoDescription = `Custom ETF portfolio: ${selectedEtfs.map(e => e.symbol).join(', ')}`;
      }

      // Get portfolio type
      const portfolioType = mode === 'clone' ? 'clone'
        : mode === 'etf_model' ? 'etf_model'
        : mode === 'custom_etf' ? 'custom_etf'
        : 'manual';

      // Create the portfolio
      const portfolioData = {
        name: name.trim(),
        description: description.trim() || autoDescription,
        type: portfolioType,
        initialCash: parseFloat(initialCash) || 0
      };

      const res = await portfoliosAPI.create(portfolioData);
      const newPortfolio = res.data.portfolio;

      // If clone mode, get and execute trades from investor
      if (mode === 'clone' && selectedInvestor && clonePreview?.trades) {
        try {
          const trades = clonePreview.trades || [];
          console.log('Clone trades to execute:', trades);

          // Execute each trade
          for (const trade of trades) {
            if (trade.shares > 0) {
              console.log('Executing clone trade:', trade.symbol, trade.shares, 'shares at', trade.estimatedPrice);
              try {
                await portfoliosAPI.trade(newPortfolio.id, {
                  symbol: trade.symbol,
                  type: 'buy',
                  shares: trade.shares,
                  price: trade.estimatedPrice || trade.currentPrice,
                  skipRiskCheck: true // Skip risk checks for clone portfolios
                });
                console.log('Clone trade executed successfully:', trade.symbol);
              } catch (singleTradeErr) {
                console.error('Failed to execute clone trade for', trade.symbol, ':', singleTradeErr);
              }
            }
          }
        } catch (tradeErr) {
          console.error('Error executing clone trades:', tradeErr);
          // Portfolio was created, trades failed - still navigate
        }
      }

      // If ETF model, execute the trades to populate portfolio
      if (mode === 'etf_model' && selectedModel) {
        try {
          // Get the trade preparation from the model
          const prepRes = await etfsAPI.prepareFromModel(selectedModel.name, parseFloat(initialCash) || 10000);
          const trades = prepRes.data.trades || [];
          console.log('ETF model trades to execute:', trades);

          // Execute each trade
          for (const trade of trades) {
            if (trade.shares > 0) {
              console.log('Executing trade:', trade.symbol, trade.shares, 'shares at', trade.estimatedPrice);
              try {
                await portfoliosAPI.trade(newPortfolio.id, {
                  symbol: trade.symbol,
                  type: 'buy',
                  shares: trade.shares,
                  price: trade.estimatedPrice || trade.currentPrice,
                  skipRiskCheck: true // Skip risk checks for model portfolios
                });
                console.log('Trade executed successfully:', trade.symbol);
              } catch (singleTradeErr) {
                console.error('Failed to execute trade for', trade.symbol, ':', singleTradeErr);
              }
            }
          }
        } catch (tradeErr) {
          console.error('Error executing model trades:', tradeErr);
          // Portfolio was created, trades failed - still navigate
        }
      }

      // If custom ETF mode, prepare and execute trades
      if (mode === 'custom_etf' && selectedEtfs.length > 0) {
        try {
          // Convert our selected ETFs to the format the API expects
          const allocations = selectedEtfs.map(e => ({
            symbol: e.symbol,
            weight: e.weight
          }));

          // Prepare trades using the custom ETF endpoint
          const prepRes = await etfsAPI.prepareCustom(allocations, parseFloat(initialCash) || 10000);
          const trades = prepRes.data.trades || [];
          console.log('Custom ETF trades to execute:', trades);

          // Execute each trade
          for (const trade of trades) {
            if (trade.shares > 0) {
              console.log('Executing trade:', trade.symbol, trade.shares, 'shares at', trade.estimatedPrice);
              try {
                await portfoliosAPI.trade(newPortfolio.id, {
                  symbol: trade.symbol,
                  type: 'buy',
                  shares: trade.shares,
                  price: trade.estimatedPrice || trade.currentPrice,
                  skipRiskCheck: true // Skip risk checks for custom ETF portfolios
                });
                console.log('Trade executed successfully:', trade.symbol);
              } catch (singleTradeErr) {
                console.error('Failed to execute trade for', trade.symbol, ':', singleTradeErr);
              }
            }
          }
        } catch (tradeErr) {
          console.error('Error executing custom ETF trades:', tradeErr);
          // Portfolio was created, trades failed - still navigate
        }
      }

      if (onCreated) {
        onCreated(newPortfolio);
      }

      navigate(`/portfolios/${newPortfolio.id}`);
    } catch (err) {
      console.error('Error creating portfolio:', err);
      setError(err.response?.data?.error || 'Failed to create portfolio');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="create-portfolio-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Wallet size={20} />
            <h2>Create Portfolio</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            <Wallet size={16} />
            Manual
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'etf_model' ? 'active' : ''}`}
            onClick={() => setMode('etf_model')}
          >
            <PieChart size={16} />
            ETF Model
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'clone' ? 'active' : ''}`}
            onClick={() => setMode('clone')}
          >
            <Users size={16} />
            Clone Investor
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'custom_etf' ? 'active' : ''}`}
            onClick={() => setMode('custom_etf')}
          >
            <Layers size={16} />
            Custom ETF
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {mode === 'etf_model' && (
              <div className="form-section">
                <label className="form-label">Select Model Portfolio</label>
                {loadingModels ? (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading models...
                  </div>
                ) : (
                  <div className="model-grid">
                    {models.map(model => {
                      const Icon = MODEL_ICONS[model.name] || PieChart;
                      const riskColor = RISK_COLORS[model.risk_level] || '#6b7280';
                      const isSelected = selectedModel?.id === model.id;

                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={`model-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedModel(model)}
                        >
                          <div className="model-icon" style={{ color: riskColor }}>
                            <Icon size={24} />
                          </div>
                          <div className="model-info">
                            <span className="model-name">{model.name}</span>
                            <span className="model-style">{model.investment_style}</span>
                          </div>
                          <div
                            className="model-risk"
                            style={{ background: `${riskColor}20`, color: riskColor }}
                          >
                            {model.risk_level}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Model Details */}
                {modelDetails && (
                  <div className="model-details">
                    <div className="model-description">
                      {modelDetails.description}
                    </div>
                    <div className="model-allocations">
                      <span className="allocations-label">Allocations:</span>
                      <div className="allocation-list">
                        {modelDetails.allocations?.map((alloc, idx) => (
                          <div key={idx} className="allocation-item">
                            <span className="alloc-symbol">{alloc.symbol}</span>
                            <span className="alloc-weight">{alloc.target_weight}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {modelDetails.weightedExpenseRatio && (
                      <div className="model-expense">
                        Expense Ratio: {(modelDetails.weightedExpenseRatio * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Clone from Investor Mode */}
            {mode === 'clone' && (
              <div className="form-section">
                <label className="form-label">Select Famous Investor</label>
                {loadingInvestors ? (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading investors...
                  </div>
                ) : (
                  <div className="investor-grid">
                    {investors.map(investor => {
                      const isSelected = selectedInvestor?.id === investor.id;
                      return (
                        <button
                          key={investor.id}
                          type="button"
                          className={`investor-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedInvestor(investor)}
                        >
                          <div className="investor-avatar">
                            {investor.name?.charAt(0) || 'I'}
                          </div>
                          <div className="investor-info">
                            <span className="investor-name">{investor.name}</span>
                            <span className="investor-style">{investor.investment_style || 'Value Investor'}</span>
                          </div>
                          {investor.portfolio_value && (
                            <div className="investor-value">
                              ${(investor.portfolio_value / 1e9).toFixed(1)}B
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Clone Settings */}
                {selectedInvestor && (
                  <div className="clone-settings">
                    <div className="settings-row">
                      <div className="setting-item">
                        <label className="form-label">Min Weight %</label>
                        <input
                          type="number"
                          className="form-input"
                          value={minWeight}
                          onChange={e => setMinWeight(e.target.value)}
                          min="0"
                          max="10"
                          step="0.5"
                          placeholder="0"
                        />
                        <span className="form-hint">Exclude positions below this weight</span>
                      </div>
                      <div className="setting-item">
                        <label className="form-label">Max Positions</label>
                        <input
                          type="number"
                          className="form-input"
                          value={maxPositions}
                          onChange={e => setMaxPositions(e.target.value)}
                          min="1"
                          max="100"
                          placeholder="All"
                        />
                        <span className="form-hint">Limit to top N positions</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clone Preview */}
                {loadingPreview && (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading preview...
                  </div>
                )}

                {clonePreview && !loadingPreview && (
                  <div className="clone-preview">
                    <div className="preview-header">
                      <span className="preview-title">Clone Preview</span>
                      <span className="preview-count">{clonePreview.trades?.length || 0} positions</span>
                    </div>
                    <div className="preview-trades">
                      {clonePreview.trades?.slice(0, 8).map((trade, idx) => (
                        <div key={idx} className="preview-trade">
                          <span className="trade-symbol">{trade.symbol}</span>
                          <span className="trade-weight">{trade.weight?.toFixed(1)}%</span>
                          <span className="trade-shares">{trade.shares} shares</span>
                        </div>
                      ))}
                      {clonePreview.trades?.length > 8 && (
                        <div className="preview-more">
                          +{clonePreview.trades.length - 8} more positions
                        </div>
                      )}
                    </div>
                    {clonePreview.totalEstimatedCost && (
                      <div className="preview-total">
                        <span>Total: ${clonePreview.totalEstimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        {clonePreview.remainingCash > 0 && (
                          <span className="remaining-cash"> (${clonePreview.remainingCash.toFixed(2)} remaining)</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Custom ETF Mode */}
            {mode === 'custom_etf' && (
              <div className="form-section">
                <label className="form-label">Build Custom ETF Portfolio</label>

                {loadingEtfs ? (
                  <div className="loading-models">
                    <Loader className="spinning" size={20} />
                    Loading ETFs...
                  </div>
                ) : (
                  <>
                    {/* ETF Browser Tabs */}
                    <div className="etf-browser-tabs">
                      <button
                        type="button"
                        className={`browser-tab ${etfBrowserMode === 'search' ? 'active' : ''}`}
                        onClick={() => setEtfBrowserMode('search')}
                      >
                        <Search size={14} />
                        Search
                      </button>
                      <button
                        type="button"
                        className={`browser-tab ${etfBrowserMode === 'categories' ? 'active' : ''}`}
                        onClick={() => setEtfBrowserMode('categories')}
                      >
                        <Layers size={14} />
                        Categories
                      </button>
                      <button
                        type="button"
                        className={`browser-tab ${etfBrowserMode === 'templates' ? 'active' : ''}`}
                        onClick={() => setEtfBrowserMode('templates')}
                      >
                        <BookOpen size={14} />
                        Templates
                      </button>
                    </div>

                    {/* Search Mode */}
                    {etfBrowserMode === 'search' && (
                      <>
                        <div className="etf-search-container">
                          <div className="search-input-wrapper">
                            <Search size={16} className="search-icon" />
                            <input
                              type="text"
                              className="form-input etf-search-input"
                              value={etfSearch}
                              onChange={e => setEtfSearch(e.target.value)}
                              placeholder="Search ETFs by symbol or name..."
                            />
                            {searchLoading && <Loader className="spinning search-loader" size={16} />}
                          </div>

                          {/* Search Results Dropdown */}
                          {searchResults.length > 0 && (
                            <div className="search-results">
                              {searchResults.map(etf => (
                                <button
                                  key={etf.symbol}
                                  type="button"
                                  className="search-result-item"
                                  onClick={() => addEtf(etf)}
                                >
                                  <span className="result-symbol">{etf.symbol}</span>
                                  <span className="result-name">{etf.name}</span>
                                  {etf.expense_ratio && (
                                    <span className="result-expense">{(etf.expense_ratio * 100).toFixed(2)}%</span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Essential ETFs Quick Add */}
                        {essentialEtfs.length > 0 && selectedEtfs.length === 0 && !etfSearch && (
                          <div className="essential-etfs">
                            <span className="essential-label">Popular ETFs:</span>
                            <div className="essential-chips">
                              {essentialEtfs.slice(0, 12).map(etf => (
                                <button
                                  key={etf.symbol}
                                  type="button"
                                  className="essential-chip"
                                  onClick={() => addEtf(etf)}
                                  title={etf.name}
                                >
                                  {etf.symbol}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Categories Mode */}
                    {etfBrowserMode === 'categories' && (
                      <div className="etf-categories-browser">
                        <div className="categories-tree">
                          {categories.map(category => (
                            <div key={category.slug} className="category-group">
                              <button
                                type="button"
                                className={`category-header ${expandedCategories.has(category.slug) ? 'expanded' : ''}`}
                                onClick={() => toggleCategory(category.slug)}
                              >
                                {expandedCategories.has(category.slug) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span className="category-name">{category.name}</span>
                                <span className="category-count">{category.totalCount || category.etfCount || 0}</span>
                              </button>

                              {expandedCategories.has(category.slug) && (
                                <div className="category-children">
                                  {/* Direct ETFs in this category */}
                                  {category.etfCount > 0 && (
                                    <button
                                      type="button"
                                      className={`subcategory-item ${selectedCategory === category.slug ? 'selected' : ''}`}
                                      onClick={() => selectCategory(category)}
                                    >
                                      All {category.name}
                                      <span className="subcategory-count">{category.etfCount}</span>
                                    </button>
                                  )}

                                  {/* Subcategories */}
                                  {category.children?.map(sub => (
                                    <div key={sub.slug}>
                                      {sub.children?.length > 0 ? (
                                        <>
                                          <button
                                            type="button"
                                            className={`subcategory-header ${expandedCategories.has(sub.slug) ? 'expanded' : ''}`}
                                            onClick={() => toggleCategory(sub.slug)}
                                          >
                                            {expandedCategories.has(sub.slug) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            <span>{sub.name}</span>
                                            <span className="subcategory-count">{sub.totalCount || sub.etfCount || 0}</span>
                                          </button>
                                          {expandedCategories.has(sub.slug) && (
                                            <div className="sub-children">
                                              {sub.children.map(subsub => (
                                                <button
                                                  key={subsub.slug}
                                                  type="button"
                                                  className={`subcategory-item deep ${selectedCategory === subsub.slug ? 'selected' : ''}`}
                                                  onClick={() => selectCategory(subsub)}
                                                >
                                                  {subsub.name}
                                                  <span className="subcategory-count">{subsub.etfCount}</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          className={`subcategory-item ${selectedCategory === sub.slug ? 'selected' : ''}`}
                                          onClick={() => selectCategory(sub)}
                                        >
                                          {sub.name}
                                          <span className="subcategory-count">{sub.etfCount || sub.totalCount || 0}</span>
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Category ETFs Panel */}
                        {selectedCategory && (
                          <div className="category-etfs-panel">
                            {loadingCategoryEtfs ? (
                              <div className="loading-category">
                                <Loader className="spinning" size={16} />
                              </div>
                            ) : (
                              <div className="category-etf-list">
                                {categoryEtfs.map(etf => (
                                  <button
                                    key={etf.symbol}
                                    type="button"
                                    className={`category-etf-item ${selectedEtfs.some(e => e.symbol === etf.symbol) ? 'selected' : ''}`}
                                    onClick={() => addEtf(etf)}
                                    disabled={selectedEtfs.some(e => e.symbol === etf.symbol)}
                                  >
                                    <div className="etf-main">
                                      <span className="etf-symbol">{etf.symbol}</span>
                                      <span className="etf-name">{etf.name}</span>
                                    </div>
                                    <div className="etf-meta">
                                      {etf.expense_ratio && (
                                        <span className="etf-expense">{(etf.expense_ratio * 100).toFixed(2)}%</span>
                                      )}
                                      <Plus size={14} className="add-icon" />
                                    </div>
                                  </button>
                                ))}
                                {categoryEtfs.length === 0 && (
                                  <div className="no-etfs">No ETFs in this category</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Templates Mode (Lazy Portfolios) */}
                    {etfBrowserMode === 'templates' && (
                      <div className="lazy-portfolios-browser">
                        <p className="templates-intro">Start with a proven portfolio strategy:</p>
                        <div className="lazy-portfolio-grid">
                          {lazyPortfolios.map(portfolio => (
                            <button
                              key={portfolio.id}
                              type="button"
                              className={`lazy-portfolio-card ${selectedLazyPortfolio?.id === portfolio.id ? 'selected' : ''}`}
                              onClick={() => applyLazyPortfolio(portfolio)}
                            >
                              <div className="portfolio-header">
                                <Briefcase size={18} />
                                <span className="portfolio-name">{portfolio.name}</span>
                              </div>
                              <p className="portfolio-description">{portfolio.description}</p>
                              <div className="portfolio-meta">
                                <span className="portfolio-source">{portfolio.source}</span>
                                <span className={`portfolio-risk risk-${portfolio.risk_level}`}>
                                  Risk: {portfolio.risk_level}/10
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected ETFs */}
                    {selectedEtfs.length > 0 && (
                      <div className="selected-etfs">
                        <div className="selected-header">
                          <span className="selected-title">
                            Selected ETFs
                            {selectedLazyPortfolio && (
                              <span className="template-badge">from {selectedLazyPortfolio.name}</span>
                            )}
                          </span>
                          <button
                            type="button"
                            className="equalize-btn"
                            onClick={equalizeWeights}
                          >
                            Equal Weight
                          </button>
                        </div>

                        <div className="etf-list">
                          {selectedEtfs.map(etf => (
                            <div key={etf.symbol} className="etf-row">
                              <div className="etf-info">
                                <span className="etf-symbol">{etf.symbol}</span>
                                <span className="etf-name">{etf.name}</span>
                              </div>
                              <div className="etf-weight">
                                <input
                                  type="number"
                                  className="weight-input"
                                  value={etf.weight}
                                  onChange={e => updateEtfWeight(etf.symbol, e.target.value)}
                                  min="0"
                                  max="100"
                                  step="1"
                                />
                                <span className="weight-suffix">%</span>
                              </div>
                              <button
                                type="button"
                                className="remove-etf-btn"
                                onClick={() => removeEtf(etf.symbol)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Summary */}
                        <div className="etf-summary">
                          <div className={`total-weight ${Math.abs(totalWeight - 100) > 0.1 ? 'error' : 'valid'}`}>
                            Total: {totalWeight.toFixed(1)}%
                            {Math.abs(totalWeight - 100) > 0.1 && (
                              <span className="weight-warning">
                                {totalWeight < 100 ? ` (${(100 - totalWeight).toFixed(1)}% remaining)` : ' (over 100%)'}
                              </span>
                            )}
                          </div>
                          {weightedExpenseRatio > 0 && (
                            <div className="weighted-expense">
                              Weighted Expense Ratio: {(weightedExpenseRatio * 100).toFixed(3)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="form-section">
              <label className="form-label">Portfolio Name *</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={mode === 'etf_model' ? 'My ETF Portfolio' : mode === 'clone' ? 'Investor Clone' : mode === 'custom_etf' ? 'My Custom ETF Portfolio' : 'My Portfolio'}
                autoFocus={mode === 'manual'}
              />
            </div>

            <div className="form-section">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={mode === 'etf_model' && selectedModel
                  ? selectedModel.description
                  : mode === 'clone' && selectedInvestor
                  ? `Cloned from ${selectedInvestor.name}`
                  : 'Optional description...'}
                rows={3}
              />
            </div>

            <div className="form-section">
              <label className="form-label">
                {mode === 'etf_model' || mode === 'clone' || mode === 'custom_etf' ? 'Investment Amount' : 'Initial Cash Balance'}
              </label>
              <div className="input-with-prefix">
                <span className="input-prefix">$</span>
                <input
                  type="number"
                  className="form-input"
                  value={initialCash}
                  onChange={e => setInitialCash(e.target.value)}
                  min="0"
                  step="100"
                />
              </div>
              <p className="form-hint">
                {mode === 'etf_model'
                  ? 'This amount will be invested according to the model allocation'
                  : mode === 'clone'
                  ? 'This amount will be allocated according to the investor\'s portfolio'
                  : mode === 'custom_etf'
                  ? 'This amount will be invested according to your custom allocations'
                  : 'Start with this amount of cash in your portfolio'}
              </p>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                creating ||
                !name.trim() ||
                (mode === 'etf_model' && !selectedModel) ||
                (mode === 'clone' && !selectedInvestor) ||
                (mode === 'custom_etf' && (selectedEtfs.length === 0 || Math.abs(totalWeight - 100) > 0.1))
              }
            >
              {creating ? (
                <>
                  <Loader className="spinning" size={16} />
                  Creating...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  {mode === 'etf_model' ? 'Create & Invest' : mode === 'clone' ? 'Clone Portfolio' : mode === 'custom_etf' ? 'Create & Invest' : 'Create Portfolio'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePortfolioModal;
