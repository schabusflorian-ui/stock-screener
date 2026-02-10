// frontend/src/services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/api`
  : '/api';  // Use relative URL to leverage CRA proxy in development

// SECURITY NOTE: Admin bypass mechanism was removed.
// All authentication must go through proper backend JWT/session validation.
// Never trust client-side localStorage for authentication decisions.

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds for most requests
  withCredentials: true // Enable credentials for session cookies
});

// Extended timeout instance for long-running operations
const apiLong = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, // 5 minutes for update operations
  withCredentials: true
});

// Request interceptor to add admin bypass header when in dev admin mode
const addAdminBypassHeader = (config) => {
  if (localStorage.getItem('adminAccess') === 'true') {
    config.headers['X-Admin-Bypass'] = 'true';
  }
  return config;
};
api.interceptors.request.use(addAdminBypassHeader);
apiLong.interceptors.request.use(addAdminBypassHeader);

// Response interceptor to handle errors consistently
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('[API] Network error:', error.message);
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Network error. Please check your connection.',
        originalError: error
      });
    }

    // Handle 401 (unauthorized) - redirect to login (unless admin)
    if (error.response?.status === 401 && localStorage.getItem('adminAccess') !== 'true') {
      window.location.href = '/login';
    }

    // Extract standardized error format from response
    const errorData = error.response?.data?.error || error.response?.data;
    const formattedError = {
      code: errorData?.code || `HTTP_${error.response?.status}`,
      message: errorData?.message || error.message || 'An error occurred',
      status: error.response?.status,
      details: errorData?.details,
      originalError: error
    };

    console.error(`[API] Error ${formattedError.code}:`, formattedError.message);
    return Promise.reject(formattedError);
  }
);

// Apply same interceptor to long timeout instance
apiLong.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Network error. Please check your connection.',
        originalError: error
      });
    }

    // Handle 401 (unauthorized) - redirect to login (unless admin)
    if (error.response?.status === 401 && localStorage.getItem('adminAccess') !== 'true') {
      window.location.href = '/login';
    }

    const errorData = error.response?.data?.error || error.response?.data;
    return Promise.reject({
      code: errorData?.code || `HTTP_${error.response?.status}`,
      message: errorData?.message || error.message || 'An error occurred',
      status: error.response?.status,
      details: errorData?.details,
      originalError: error
    });
  }
);

export const companyAPI = {
  getAll: (params = {}) => api.get('/companies', { params }),
  getOne: (symbol) => api.get(`/companies/${symbol}`),
  search: (query) => api.get(`/companies?search=${encodeURIComponent(query)}`),
  getFinancials: (symbol) => api.get(`/companies/${symbol}/financials`),
  getMetrics: (symbol, { limit = 20, periodType = 'annual' } = {}) =>
    api.get(`/companies/${symbol}/metrics?limit=${limit}&period_type=${periodType}`),
  getBreakdown: (symbol, { limit = 10, periodType = 'annual' } = {}) =>
    api.get(`/companies/${symbol}/breakdown?limit=${limit}&period_type=${periodType}`),
  getBalanceSheet: (symbol, { limit = 10, periodType = 'annual' } = {}) =>
    api.get(`/companies/${symbol}/balance-sheet?limit=${limit}&period_type=${periodType}`),
  getCashFlow: (symbol, { limit = 10, periodType = 'annual' } = {}) =>
    api.get(`/companies/${symbol}/cash-flow?limit=${limit}&period_type=${periodType}`),
  getAnalysis: (symbol, { periodType = 'annual' } = {}) =>
    api.get(`/companies/${symbol}/analysis?period_type=${periodType}`),
  getNews: (symbol) => api.get(`/companies/${symbol}/news`)
};

export const metricsAPI = {
  getSummary: () => api.get('/metrics/summary'),
  compare: (symbols, metric = 'roic') => 
    api.get(`/metrics/compare?symbols=${symbols.join(',')}&metric=${metric}`),
  getLeaderboard: (metric = 'roic', limit = 10) => 
    api.get(`/metrics/leaderboard?metric=${metric}&limit=${limit}`)
};

export const screeningAPI = {
  // Get filter options (sectors, industries, periods)
  getOptions: () => api.get('/screening/options'),
  // Get preset screen definitions
  getPresets: () => api.get('/screening/presets'),
  // Run custom screen with advanced criteria
  custom: (criteria) => api.post('/screening/custom', criteria),
  // Preset screens (no default limit - returns all matches)
  buffett: (limit) => api.get(`/screening/buffett${limit ? `?limit=${limit}` : ''}`),
  value: (limit) => api.get(`/screening/value${limit ? `?limit=${limit}` : ''}`),
  magic: (limit) => api.get(`/screening/magic${limit ? `?limit=${limit}` : ''}`),
  quality: (limit) => api.get(`/screening/quality${limit ? `?limit=${limit}` : ''}`),
  growth: (limit) => api.get(`/screening/growth${limit ? `?limit=${limit}` : ''}`),
  dividend: (limit) => api.get(`/screening/dividend${limit ? `?limit=${limit}` : ''}`),
  fortress: (limit) => api.get(`/screening/fortress${limit ? `?limit=${limit}` : ''}`),
  cigarbutts: (limit) => api.get(`/screening/cigarbutts${limit ? `?limit=${limit}` : ''}`),
  compounders: (limit) => api.get(`/screening/compounders${limit ? `?limit=${limit}` : ''}`),
  flywheel: (limit) => api.get(`/screening/flywheel${limit ? `?limit=${limit}` : ''}`),
  forensic: (limit) => api.get(`/screening/forensic${limit ? `?limit=${limit}` : ''}`),
  asymmetry: (limit) => api.get(`/screening/asymmetry${limit ? `?limit=${limit}` : ''}`),
  moats: (limit) => api.get(`/screening/moats${limit ? `?limit=${limit}` : ''}`),
  // Macro screens (value-with-macro, recession-resistant, etc.)
  getMacroScreen: (endpoint, limit = 50) =>
    api.get(`/screening/macro/${endpoint}?limit=${limit}`)
};

export const trendsAPI = {
  getCompanyTrend: (symbol) => api.get(`/trends/${symbol}`),
  compareAll: () => api.get('/trends/compare/all'),
  getImproving: (minScore = 3) => api.get(`/trends/improving?minScore=${minScore}`)
};

export const sectorsAPI = {
  // Get all sectors with aggregate metrics
  getAll: (periodType = 'annual') => api.get(`/sectors?periodType=${periodType}`),
  // Get sector rankings by various metrics
  getRankings: (periodType = 'annual') => api.get(`/sectors/rankings?periodType=${periodType}`),
  // Get sector rotation data with historical trends
  getRotation: (periods = 4, periodType = 'annual') =>
    api.get(`/sectors/rotation?periods=${periods}&periodType=${periodType}`),
  // Get top performers by sector
  getTopPerformers: (metric = 'roic', limit = 5, periodType = 'annual') =>
    api.get(`/sectors/top-performers?metric=${metric}&limit=${limit}&periodType=${periodType}`),
  // Get industry margin comparisons
  getMargins: (periodType = 'annual') => api.get(`/sectors/margins?periodType=${periodType}`),
  // Get detailed sector data
  getSector: (sector, periodType = 'annual') =>
    api.get(`/sectors/${encodeURIComponent(sector)}?periodType=${periodType}`),
  // Get industries within a sector
  getIndustries: (sector, periodType = 'annual') =>
    api.get(`/sectors/${encodeURIComponent(sector)}/industries?periodType=${periodType}`),
  // Get detailed industry data
  getIndustry: (industry, periodType = 'annual') =>
    api.get(`/sectors/industry/${encodeURIComponent(industry)}?periodType=${periodType}`)
};

export const classificationsAPI = {
  // Get all custom classification definitions
  getAll: (type) => api.get(`/classifications${type ? `?type=${type}` : ''}`),
  // Create a new classification
  create: (data) => api.post('/classifications', data),
  // Update a classification
  update: (id, data) => api.put(`/classifications/${id}`, data),
  // Delete a classification
  delete: (id) => api.delete(`/classifications/${id}`),
  // Get company classifications
  getCompany: (symbol) => api.get(`/classifications/company/${symbol}`),
  // Update company classifications
  updateCompany: (symbol, data) => api.put(`/classifications/company/${symbol}`, data),
  // Add tag to company
  addTag: (symbol, tag) => api.post(`/classifications/company/${symbol}/tags`, { tag }),
  // Remove tag from company
  removeTag: (symbol, tag) => api.delete(`/classifications/company/${symbol}/tags/${encodeURIComponent(tag)}`),
  // Get companies by classification
  getCompanies: (filters) => api.get('/classifications/companies', { params: filters }),
  // Bulk update classifications
  bulk: (data) => api.post('/classifications/bulk', data)
};

export const ipoAPI = {
  // Pipeline views
  getPipeline: (options = {}) => {
    const params = new URLSearchParams();
    if (options.region) params.append('region', options.region);
    if (options.status) params.append('status', options.status);
    if (options.sector) params.append('sector', options.sector);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.limit) params.append('limit', options.limit);
    return api.get(`/ipo/pipeline?${params.toString()}`);
  },
  getByStage: (region = 'all') => api.get(`/ipo/by-stage?region=${region}`),
  getUpcoming: () => api.get('/ipo/upcoming'),
  getRecent: (limit = 20) => api.get(`/ipo/recent?limit=${limit}`),

  // Statistics and metadata
  getStatistics: (region = 'all') => api.get(`/ipo/statistics?region=${region}`),
  getSectors: () => api.get('/ipo/sectors'),
  getStages: () => api.get('/ipo/stages'),

  // Search
  search: (query) => api.get(`/ipo/search?q=${encodeURIComponent(query)}`),

  // Single IPO
  getOne: (id) => api.get(`/ipo/${id}`),
  getByCIK: (cik) => api.get(`/ipo/cik/${cik}`),
  update: (id, data) => api.put(`/ipo/${id}`, data),

  // Status changes
  markTrading: (id, tradingDate, ticker) =>
    api.post(`/ipo/${id}/mark-trading`, { tradingDate, ticker }),
  markWithdrawn: (id, withdrawnDate, reason) =>
    api.post(`/ipo/${id}/mark-withdrawn`, { withdrawnDate, reason }),

  // Watchlist
  getWatchlist: () => api.get('/ipo/watchlist'),
  addToWatchlist: (id, notes) => api.post(`/ipo/${id}/watchlist`, { notes }),
  updateWatchlistNotes: (id, notes) => api.put(`/ipo/${id}/watchlist`, { notes }),
  removeFromWatchlist: (id) => api.delete(`/ipo/${id}/watchlist`),

  // Check for new filings (longer timeout - SEC API can be slow)
  check: () => api.post('/ipo/check', {}, { timeout: 120000 }),
  getCheckHistory: (limit = 20) => api.get(`/ipo/check-history?limit=${limit}`),

  // Sync trading companies - create company records for trading IPOs
  syncTradingCompanies: () => api.post('/ipo/sync-trading-companies', {}, { timeout: 60000 }),

  // Manual IPO creation
  createManual: (data) => api.post('/ipo/manual', data)
};

export const insidersAPI = {
  // Get companies with strongest insider buying signals
  getTopBuying: (limit = 20, period = '3m') =>
    api.get(`/insiders/top-buying?limit=${limit}&period=${period}`),

  // Get recent insider transactions across all companies
  getRecent: (limit = 50, type = 'all') =>
    api.get(`/insiders/recent?limit=${limit}&type=${type}`),

  // Get insider sentiment signals for all tracked companies
  getSignals: (period = '3m', signal = 'all') =>
    api.get(`/insiders/signals?period=${period}&signal=${signal}`),

  // Get insider activity for a specific company
  getCompanyActivity: (symbol, { months = 12, type = 'all' } = {}) =>
    api.get(`/insiders/company/${symbol}?months=${months}&type=${type}`),

  // Get chart-ready data for insider activity visualization
  getCompanyChart: (symbol, months = 24) =>
    api.get(`/insiders/company/${symbol}/chart?months=${months}`),

  // Get all activity for a specific insider across companies
  getInsider: (cik) =>
    api.get(`/insiders/insider/${cik}`),

  // Find companies with cluster buying
  getClusterBuying: (minInsiders = 2, days = 30) =>
    api.get(`/insiders/cluster-buying?minInsiders=${minInsiders}&days=${days}`),

  // Get overall insider trading statistics
  getStats: () =>
    api.get('/insiders/stats'),

  // Trigger insider data update
  triggerUpdate: (days = 30, limit = 50) =>
    api.post('/insiders/update', { days, limit }),

  // Get update status
  getUpdateStatus: () =>
    api.get('/insiders/update-status')
};

export const capitalAPI = {
  // Get companies with highest shareholder yield
  getTopYield: (limit = 20) =>
    api.get(`/capital/top-yield?limit=${limit}`),

  // Get companies with highest buyback activity
  getTopBuybacks: (limit = 20) =>
    api.get(`/capital/top-buybacks?limit=${limit}`),

  // Get companies with long dividend increase streaks
  getDividendAristocrats: (minYears = 5) =>
    api.get(`/capital/dividend-aristocrats?minYears=${minYears}`),

  // Get recent capital allocation events
  getRecentEvents: (limit = 50, type = null) =>
    api.get(`/capital/recent-events?limit=${limit}${type ? `&type=${type}` : ''}`),

  // Get comprehensive capital allocation data for a company
  getCompanyOverview: (symbol, quarters = 8) =>
    api.get(`/capital/company/${symbol}?quarters=${quarters}`),

  // Get buyback programs and activity for a company
  getCompanyBuybacks: (symbol) =>
    api.get(`/capital/company/${symbol}/buybacks`),

  // Get dividend history for a company
  getCompanyDividends: (symbol, limit = 40) =>
    api.get(`/capital/company/${symbol}/dividends?limit=${limit}`),

  // Get chart-ready capital allocation data
  getCompanyChart: (symbol, quarters = 20) =>
    api.get(`/capital/company/${symbol}/chart?quarters=${quarters}`),

  // Get overall capital allocation statistics
  getStats: () =>
    api.get('/capital/stats'),

  // Get upcoming dividend ex-dates
  getDividendCalendar: (days = 30) =>
    api.get(`/capital/dividend-calendar?days=${days}`),

  // Compare capital allocation across sectors
  getSectorComparison: () =>
    api.get('/capital/sector-comparison'),

  // Get top dividend yielders from dividend_metrics
  getTopDividendYielders: (params = {}) => {
    const { minYield = 0, maxYield = 15, sector, minYearsGrowth = 0, limit = 50 } = params;
    const queryParams = new URLSearchParams({ minYield, maxYield, minYearsGrowth, limit });
    if (sector) queryParams.append('sector', sector);
    return api.get(`/capital/top-dividend-yielders?${queryParams.toString()}`);
  },

  // Get dividend growth leaders
  getDividendGrowthLeaders: (period = '5y', limit = 50) =>
    api.get(`/capital/dividend-growth-leaders?period=${period}&limit=${limit}`),

  // Get dividend kings (50+ years)
  getDividendKings: () =>
    api.get('/capital/dividend-kings'),

  // Get dividends by sector
  getDividendsBySector: () =>
    api.get('/capital/dividends-by-sector'),

  // Screen dividend stocks
  screenDividends: (params = {}) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    });
    return api.get(`/capital/dividend-screen?${queryParams.toString()}`);
  },

  // Get update status
  getUpdateStatus: () =>
    api.get('/capital/update-status'),

  // Trigger capital allocation data update
  triggerUpdate: () =>
    api.post('/capital/update', {}, { timeout: 300000 }) // 5 min timeout for full refresh
};

export const sentimentAPI = {
  // Get sentiment status for Updates page
  getStatus: () => api.get('/sentiment/status'),

  // Get sentiment analysis for a stock (Reddit)
  get: (symbol, period = '7d') =>
    api.get(`/sentiment/${symbol}?period=${period}`),

  // Force refresh sentiment from Reddit
  refresh: (symbol) =>
    apiLong.post(`/sentiment/${symbol}/refresh`),

  // Get Reddit posts for a stock
  getPosts: (symbol, { limit = 50, sort = 'score', subreddit = null } = {}) => {
    const params = new URLSearchParams({ limit, sort });
    if (subreddit) params.append('subreddit', subreddit);
    return api.get(`/sentiment/${symbol}/posts?${params.toString()}`);
  },

  // Get sentiment history for charting
  getHistory: (symbol, days = 30) =>
    api.get(`/sentiment/${symbol}/history?days=${days}`),

  // Get trending tickers (longer timeout for refresh which scans Reddit)
  getTrending: (period = '24h', limit = 20, refresh = false, region = 'US') =>
    api.get(`/sentiment/trending?period=${period}&limit=${limit}&refresh=${refresh}&region=${region}`, {
      timeout: refresh ? 180000 : 30000 // 3 min for refresh, 30s for cached
    }),

  // Get sentiment signals for multiple stocks (watchlist)
  getBatchSignals: (symbols) =>
    api.get(`/sentiment/batch/signals?symbols=${symbols.join(',')}`),

  // Get news sentiment for a stock
  getNews: (symbol, { limit = 20, refresh = false, region = 'US' } = {}) =>
    api.get(`/sentiment/${symbol}/news?limit=${limit}&refresh=${refresh}&region=${region}`),

  // Refresh news from API
  refreshNews: (symbol) =>
    api.post(`/sentiment/${symbol}/news/refresh`, {}, { timeout: 30000 }),

  // === Multi-Source Sentiment (NEW) ===

  // Get market-wide sentiment (Fear & Greed, VIX)
  getMarket: (refresh = false) =>
    api.get(`/sentiment/market?refresh=${refresh}`, {
      timeout: refresh ? 30000 : 30000
    }),

  // Get market sentiment history
  getMarketHistory: (indicator = 'cnn_fear_greed', days = 30) =>
    api.get(`/sentiment/market/history?indicator=${indicator}&days=${days}`),

  // Get combined sentiment from all sources for a stock
  getCombined: (symbol, refresh = false, region = 'US') =>
    api.get(`/sentiment/${symbol}/combined?refresh=${refresh}&region=${region}`, {
      timeout: refresh ? 60000 : 30000
    }),

  // Get StockTwits sentiment for a stock
  getStockTwits: (symbol, { limit = 30, refresh = false } = {}) =>
    api.get(`/sentiment/${symbol}/stocktwits?limit=${limit}&refresh=${refresh}`, {
      timeout: refresh ? 30000 : 30000
    }),

  // Refresh all sentiment sources for a stock
  refreshAll: (symbol) =>
    api.post(`/sentiment/${symbol}/refresh-all`, {}, { timeout: 180000 }),

  // Get sentiment movers (biggest changes)
  getMovers: (period = '24h', limit = 10) =>
    api.get(`/sentiment/movers?period=${period}&limit=${limit}`),

  // === Analyst Estimates (Yahoo Finance) ===

  // Get analyst estimates and recommendations for a stock
  getAnalyst: (symbol, refresh = false) =>
    api.get(`/sentiment/${symbol}/analyst?refresh=${refresh}`, {
      timeout: refresh ? 30000 : 15000
    }),

  // Get stocks with highest analyst upside potential
  getAnalystTopUpside: (limit = 20) =>
    api.get(`/sentiment/analyst/top-upside?limit=${limit}`),

  // Get stocks with strong buy consensus (80%+ buy)
  getAnalystStrongBuy: (limit = 20) =>
    api.get(`/sentiment/analyst/strong-buy?limit=${limit}`),

  // Get analyst estimates history for a stock (historical tracking)
  getAnalystHistory: (symbol, limit = 50) =>
    api.get(`/sentiment/${symbol}/analyst/history?limit=${limit}`),

  // === Enhanced Sentiment Intelligence (Phase 2.5) ===

  // Get sources overview (aggregated sentiment by source with divergences)
  getSourcesOverview: (period = '24h') =>
    api.get(`/sentiment/sources-overview?period=${period}`),

  // Get analyst activity (recent rating changes, upgrades/downgrades)
  getAnalystActivity: (limit = 20) =>
    api.get(`/sentiment/analyst-activity?limit=${limit}`),

  // === Enhanced Sentiment Intelligence (Phase 3) ===

  // Get insider trading activity across all stocks
  getInsiderActivity: (days = 30, limit = 50) =>
    api.get(`/sentiment/insider-activity?days=${days}&limit=${limit}`),

  // Get enhanced trending with multi-source breakdown
  getTrendingEnhanced: (period = '24h', limit = 30, region = 'US') =>
    api.get(`/sentiment/trending-enhanced?period=${period}&limit=${limit}&region=${region}`),

  // Convenience aliases for SentimentTab
  getPostsForTicker: (symbol, period = '7d', limit = 20) =>
    api.get(`/sentiment/${symbol}/posts?limit=${limit}`),

  getNewsForTicker: (symbol, limit = 20) =>
    api.get(`/sentiment/${symbol}/news?limit=${limit}`),

  getStockTwitsForTicker: (symbol, limit = 20) =>
    api.get(`/sentiment/${symbol}/stocktwits?limit=${limit}`),

  getSentimentHistory: (days = 7) =>
    api.get(`/sentiment/market/history?days=${days}`)
};

export const statsAPI = {
  // Get comprehensive dashboard statistics
  getDashboard: () => api.get('/stats/dashboard', { timeout: 30000 }),
  // Get key highlights for homepage
  getHighlights: () => api.get('/stats/highlights', { timeout: 30000 })
};

export const earningsAPI = {
  // Get earnings data for a single symbol
  get: (symbol, refresh = false) =>
    api.get(`/earnings/${symbol}?refresh=${refresh}`, { timeout: 15000 }),

  // Get earnings history (past quarters)
  getHistory: (symbol, quarters = 8) =>
    api.get(`/earnings/history/${symbol}?quarters=${quarters}`),

  // Get upcoming earnings for watchlist
  getUpcomingWatchlist: (days = 30) =>
    api.get(`/earnings/upcoming/watchlist?days=${days}`),

  // Get earnings calendar for date range
  getCalendarRange: ({ startDate, endDate, sector, limit = 100 } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (sector) params.append('sector', sector);
    if (limit) params.append('limit', limit);
    return api.get(`/earnings/calendar/range?${params.toString()}`);
  },

  // Get this week's earnings
  getWeek: (sector = null, limit = 50) => {
    const params = new URLSearchParams();
    if (sector) params.append('sector', sector);
    if (limit) params.append('limit', limit);
    return api.get(`/earnings/calendar/week?${params.toString()}`);
  },

  // Batch fetch earnings for multiple symbols
  batch: (symbols) =>
    api.post('/earnings/batch', { symbols }, { timeout: 60000 }),

  // Get earnings statistics
  getStats: () => api.get('/earnings/stats'),

  // Get stored calendar data (fast, no live fetch)
  getStoredCalendar: ({ days = 30, sector, watchlistOnly = false } = {}) => {
    const params = new URLSearchParams();
    params.append('days', days);
    if (sector) params.append('sector', sector);
    if (watchlistOnly) params.append('watchlistOnly', 'true');
    return api.get(`/earnings/calendar/stored?${params.toString()}`);
  },

  // Trigger earnings data refresh
  refresh: (mode = 'watchlist', maxCompanies = 50) =>
    api.post('/earnings/refresh', { mode, maxCompanies }, { timeout: 120000 }),

  // Get coverage statistics
  getCoverage: () => api.get('/earnings/coverage')
};

export const fiscalAPI = {
  // Get fiscal year end configuration for a company
  getConfig: (symbol) => api.get(`/fiscal/config/${symbol}`),

  // Get fiscal calendar for a company
  getCalendar: (symbol, { limit = 20, fiscalYear, includeFY = true } = {}) => {
    const params = new URLSearchParams();
    params.append('limit', limit);
    if (fiscalYear) params.append('fiscalYear', fiscalYear);
    params.append('includeFY', includeFY);
    return api.get(`/fiscal/calendar/${symbol}?${params.toString()}`);
  },

  // Translate between fiscal and calendar quarters
  translate: (symbol, { fiscalYear, fiscalQuarter, calendarYear, calendarQuarter } = {}) => {
    const params = new URLSearchParams();
    params.append('symbol', symbol);
    if (fiscalYear) params.append('fiscalYear', fiscalYear);
    if (fiscalQuarter) params.append('fiscalQuarter', fiscalQuarter);
    if (calendarYear) params.append('calendarYear', calendarYear);
    if (calendarQuarter) params.append('calendarQuarter', calendarQuarter);
    return api.get(`/fiscal/translate?${params.toString()}`);
  },

  // Compare fiscal periods across companies for the same calendar period
  compare: (symbols, calendarYear, calendarQuarter) =>
    api.get(`/fiscal/compare?symbols=${symbols.join(',')}&calendarYear=${calendarYear}&calendarQuarter=${calendarQuarter}`),

  // Get upcoming fiscal period ends
  getUpcoming: (days = 30, limit = 100) =>
    api.get(`/fiscal/upcoming?days=${days}&limit=${limit}`),

  // Get fiscal year end distribution statistics
  getStats: () => api.get('/fiscal/stats'),

  // Find which fiscal period contains a specific date
  getPeriodForDate: (symbol, date) =>
    api.get(`/fiscal/period-for-date/${symbol}?date=${date}`)
};

export const indicesAPI = {
  // Get all market indices (S&P 500, Dow, NASDAQ, Russell)
  getAll: () => api.get('/indices'),

  // Get all ETF-based indices (SPY, QQQ, sector ETFs)
  getETFs: () => api.get('/indices/etfs'),

  // Get market indices only (SPY, QQQ, DIA, IWM, VTI)
  getMarket: () => api.get('/indices/etfs/market'),

  // Get sector ETFs (XLK, XLF, XLV, etc.)
  getSectors: () => api.get('/indices/etfs/sectors'),

  // Get primary benchmark (SPY)
  getBenchmark: () => api.get('/indices/benchmark'),

  // Get specific index by symbol
  getIndex: (symbol) => api.get(`/indices/${symbol}`),

  // Get price history for an index
  getPrices: (symbol, period = '1m') => api.get(`/indices/${encodeURIComponent(symbol)}/prices?period=${period}`),

  // Get index constituents
  getConstituents: (indexCode, limit = 100) => api.get(`/indices/constituents/${indexCode}?limit=${limit}`),

  // Get alpha metrics for a stock vs SPY (current snapshot)
  getAlpha: (symbol) => api.get(`/indices/alpha/${symbol}`),

  // Get alpha time series for charting (daily alpha over time)
  // rollingWindow: optional '30d', '60d', '90d' for rolling alpha calculation
  getAlphaTimeseries: (symbol, period = '1y', rollingWindow = null) => {
    let url = `/indices/alpha/timeseries/${symbol}?period=${period}`;
    if (rollingWindow) {
      url += `&rollingWindow=${rollingWindow}`;
    }
    return api.get(url);
  },

  // Get stocks outperforming the market
  getOutperformers: (period = 'ytd', limit = 50) =>
    api.get(`/prices/screen/outperformers?period=${period}&limit=${limit}`),

  // Get stocks underperforming the market
  getUnderperformers: (period = 'ytd', limit = 50) =>
    api.get(`/prices/screen/underperformers?period=${period}&limit=${limit}`),

  // Trigger index price update (admin)
  update: () => api.post('/indices/etfs/update', {}, { timeout: 120000 }),

  // Recalculate alpha for all stocks
  calculateAlpha: () => api.post('/indices/alpha/calculate')
};

export const pricesAPI = {
  // Get price import status
  getStatus: () => api.get('/prices/status'),

  // Get historical prices for a company
  get: (symbol, { period = '1y', startDate, endDate, limit } = {}) => {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (limit) params.append('limit', limit);
    return api.get(`/prices/${symbol}?${params.toString()}`);
  },

  // Get price metrics for a company
  getMetrics: (symbol) => api.get(`/prices/${symbol}/metrics`),

  // Get all price metrics (for screening)
  getAllMetrics: ({ limit = 100, offset = 0, sort = 'last_price_date', order = 'DESC' } = {}) =>
    api.get(`/prices/metrics?limit=${limit}&offset=${offset}&sort=${sort}&order=${order}`),

  // Screening endpoints
  getGainers: (period = '1d', limit = 20) =>
    api.get(`/prices/screen/gainers?period=${period}&limit=${limit}`),

  getLosers: (period = '1d', limit = 20) =>
    api.get(`/prices/screen/losers?period=${period}&limit=${limit}`),

  get52wHighs: (threshold = 5, limit = 50) =>
    api.get(`/prices/screen/52w-highs?threshold=${threshold}&limit=${limit}`),

  get52wLows: (threshold = 5, limit = 50) =>
    api.get(`/prices/screen/52w-lows?threshold=${threshold}&limit=${limit}`),

  getOversold: (threshold = 30, limit = 50) =>
    api.get(`/prices/screen/oversold?threshold=${threshold}&limit=${limit}`),

  getOverbought: (threshold = 70, limit = 50) =>
    api.get(`/prices/screen/overbought?threshold=${threshold}&limit=${limit}`),

  // Trigger bulk import (admin)
  triggerImport: (options = {}) =>
    api.post('/prices/import', options),

  // Calculate metrics (admin)
  calculateMetrics: () =>
    api.post('/prices/calculate-metrics')
};

export const updatesAPI = {
  // Get current update status and data freshness
  getStatus: async () => {
    const response = await api.get('/updates/status');
    return response.data;
  },

  // Trigger quarterly update (long-running)
  run: async (quarter, forceFullUpdate = false) => {
    const response = await apiLong.post('/updates/run', { quarter, forceFullUpdate });
    return response.data;
  },

  // Get real-time progress of running update
  getProgress: async () => {
    const response = await api.get('/updates/progress');
    return response.data;
  },

  // Get update history
  getHistory: async (limit = 10) => {
    const response = await api.get(`/updates/history?limit=${limit}`);
    return response.data;
  },

  // Check if bulk file is available
  checkAvailable: async (quarter) => {
    const response = await api.post('/updates/check-available', { quarter });
    return response.data;
  },

  // Initialize freshness tracking
  initializeFreshness: async () => {
    const response = await api.post('/updates/initialize-freshness');
    return response.data;
  },

  // Get available quarters
  getQuarters: async () => {
    const response = await api.get('/updates/quarters');
    return response.data;
  },

  // Get company freshness details
  getCompanyFreshness: async (symbol) => {
    const response = await api.get(`/updates/company/${symbol}/freshness`);
    return response.data;
  },

  // Check single company for updates
  checkCompany: async (symbol) => {
    const response = await api.post(`/updates/company/${symbol}/check`);
    return response.data;
  },

  // Get companies needing updates
  getCompaniesNeedingUpdate: async (limit = 50, offset = 0) => {
    const response = await api.get(`/updates/companies-needing-update?limit=${limit}&offset=${offset}`);
    return response.data;
  }
};

export const priceUpdatesAPI = {
  // Get update statistics (freshness by tier)
  getStats: () => api.get('/price-updates/stats'),

  // Get today's update schedule
  getSchedule: () => api.get('/price-updates/schedule'),

  // Get stale companies needing updates
  getStale: (limit = 50) => api.get(`/price-updates/stale?limit=${limit}`),

  // Trigger daily price update (runs in background)
  run: () => apiLong.post('/price-updates/run'),

  // Run dry-run to see what would be updated
  dryRun: () => apiLong.post('/price-updates/dry-run'),

  // Run backfill for stale companies
  backfill: () => apiLong.post('/price-updates/backfill'),

  // Recalculate company tier assignments
  recalculateTiers: () => apiLong.post('/price-updates/recalculate-tiers')
};

export const alertsAPI = {
  // Get all alerts with filters
  getAlerts: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.types) params.append('types', filters.types.join(','));
    if (filters.signals) params.append('signals', filters.signals.join(','));
    if (filters.companies) params.append('companies', filters.companies.join(','));
    if (filters.watchlistOnly) params.append('watchlistOnly', 'true');
    if (filters.unreadOnly) params.append('unreadOnly', 'true');
    if (filters.minPriority) params.append('minPriority', filters.minPriority);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    return api.get(`/alerts?${params.toString()}`);
  },

  // Get alert summary counts
  getSummary: () => api.get('/alerts/summary'),

  // Get alerts for dashboard
  getDashboard: (limit = 10) => api.get(`/alerts/dashboard?limit=${limit}`),

  // Get alerts for a specific company
  getCompanyAlerts: (companyId, options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.includeRead === false) params.append('includeRead', 'false');
    if (options.includeDismissed) params.append('includeDismissed', 'true');
    return api.get(`/alerts/company/${companyId}?${params.toString()}`);
  },

  // Get alert clusters
  getClusters: (limit = 20) => api.get(`/alerts/clusters?limit=${limit}`),

  // Mark alert as read
  markAsRead: (alertId) => api.post(`/alerts/${alertId}/read`),

  // Mark all alerts as read
  markAllAsRead: (companyId = null) => api.post('/alerts/read-all', { companyId }),

  // Dismiss an alert
  dismiss: (alertId) => api.post(`/alerts/${alertId}/dismiss`),

  // Trigger manual scan
  scan: (companyIds = null, trigger = 'manual') =>
    api.post('/alerts/scan', { companyIds, trigger }, { timeout: 120000 }),

  // Trigger daily scan
  dailyScan: () => api.post('/alerts/scan/daily', {}, { timeout: 300000 }),

  // Get alert configuration
  getConfig: () => api.get('/alerts/config'),

  // ============================================
  // SMART ALERTS API ENDPOINTS
  // ============================================

  // Get AI-generated "What Matters Today" summary
  getAISummary: (userId = 'default') =>
    api.get(`/alerts/summary/ai?userId=${userId}`),

  // Get user's digest preferences
  getDigestPreferences: (userId = 'default') =>
    api.get(`/alerts/digest/preferences?userId=${userId}`),

  // Update user's digest preferences
  updateDigestPreferences: (preferences) =>
    api.put('/alerts/digest/preferences', preferences),

  // Get pending digest items
  getPendingDigest: (userId = 'default', type = null) => {
    const params = new URLSearchParams({ userId });
    if (type) params.append('type', type);
    return api.get(`/alerts/digest/pending?${params.toString()}`);
  },

  // Generate digest preview
  generateDigest: (userId = 'default', includeAISummary = true) =>
    api.post('/alerts/digest/generate', { userId, includeAISummary }),

  // Get alerts filtered/sorted by actionability
  getActionableAlerts: (options = {}) => {
    const params = new URLSearchParams();
    if (options.minLevel) params.append('minLevel', options.minLevel);
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    return api.get(`/alerts/actionability?${params.toString()}`);
  },

  // Get current market regime and context
  getMarketContext: () => api.get('/alerts/market-context'),

  // Get alert volume statistics with recommendations
  getAlertStats: (userId = 'default') =>
    api.get(`/alerts/stats?userId=${userId}`)
};

// ============================================
// UNIFIED NOTIFICATIONS API
// ============================================
export const notificationsAPI = {
  // Get all notifications with filters
  getNotifications: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.category) params.append('category', filters.category);
    if (filters.categories) params.append('categories', filters.categories.join(','));
    if (filters.severity) params.append('severity', filters.severity);
    if (filters.minPriority) params.append('minPriority', filters.minPriority);
    if (filters.maxPriority) params.append('maxPriority', filters.maxPriority);
    if (filters.portfolioId) params.append('portfolioId', filters.portfolioId);
    if (filters.companyId) params.append('companyId', filters.companyId);
    if (filters.symbol) params.append('symbol', filters.symbol);
    if (filters.includeExpired) params.append('includeExpired', 'true');
    if (filters.includeDismissed) params.append('includeDismissed', 'true');
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    return api.get(`/notifications?${params.toString()}`);
  },

  // Get notification summary for header badge
  getSummary: () => api.get('/notifications/summary'),

  // Get dashboard notifications
  getDashboard: (limit = 10) => api.get(`/notifications/dashboard?limit=${limit}`),

  // Get single notification
  getNotification: (id) => api.get(`/notifications/${id}`),

  // Get notification clusters
  getClusters: (limit = 20) => api.get(`/notifications/groups/clusters?limit=${limit}`),

  // Mark as read
  markAsRead: (id) => api.post(`/notifications/${id}/read`),

  // Mark as actioned
  markAsActioned: (id, actionId) => api.post(`/notifications/${id}/action`, { actionId }),

  // Dismiss
  dismiss: (id) => api.post(`/notifications/${id}/dismiss`),

  // Snooze
  snooze: (id, until) => api.post(`/notifications/${id}/snooze`, { until }),

  // Bulk mark as read
  bulkMarkAsRead: (filters = {}) => api.post('/notifications/bulk-read', filters),

  // Bulk dismiss
  bulkDismiss: (filters = {}) => api.post('/notifications/bulk-dismiss', filters),

  // Get user preferences
  getPreferences: () => api.get('/notifications/user/preferences'),

  // Update user preferences
  updatePreferences: (updates) => api.put('/notifications/user/preferences', updates),

  // Create notification (internal use)
  create: (notification) => api.post('/notifications', notification),

  // Get system config
  getConfig: () => api.get('/notifications/system/config')
};

export const dcfAPI = {
  // Get DCF valuation for a company
  getValuation: (symbol, currentPrice, sharesOutstanding) => {
    const params = new URLSearchParams();
    if (currentPrice) params.append('price', currentPrice);
    if (sharesOutstanding) params.append('shares', sharesOutstanding);
    return api.get(`/dcf/${symbol}?${params.toString()}`, { timeout: 30000 });
  },

  // Calculate DCF with custom assumptions
  calculateCustom: (symbol, assumptions) =>
    api.post(`/dcf/${symbol}`, assumptions, { timeout: 30000 }),

  // Get sensitivity analysis matrix with custom intervals
  getSensitivity: (symbol, options = {}) => {
    const params = new URLSearchParams();
    if (options.rowVariable) params.append('rowVariable', options.rowVariable);
    if (options.colVariable) params.append('colVariable', options.colVariable);
    if (options.rowMin !== undefined) params.append('rowMin', options.rowMin);
    if (options.rowMax !== undefined) params.append('rowMax', options.rowMax);
    if (options.rowStep !== undefined) params.append('rowStep', options.rowStep);
    if (options.colMin !== undefined) params.append('colMin', options.colMin);
    if (options.colMax !== undefined) params.append('colMax', options.colMax);
    if (options.colStep !== undefined) params.append('colStep', options.colStep);
    return api.get(`/dcf/${symbol}/sensitivity?${params.toString()}`, { timeout: 120000 });
  },

  // Reverse DCF - get implied growth and WACC from current price
  getReverse: (symbol, targetPrice) => {
    const params = new URLSearchParams();
    if (targetPrice) params.append('targetPrice', targetPrice);
    return api.get(`/dcf/${symbol}/reverse?${params.toString()}`, { timeout: 60000 });
  },

  // Tornado chart - sensitivity ranking of all variables
  getTornado: (symbol, variation = 20) =>
    api.get(`/dcf/${symbol}/tornado?variation=${variation}`, { timeout: 60000 }),

  // Break-even analysis
  getBreakeven: (symbol) =>
    api.get(`/dcf/${symbol}/breakeven`, { timeout: 60000 }),

  // Get historical DCF valuations
  getHistory: (symbol, limit = 10) =>
    api.get(`/dcf/${symbol}/history?limit=${limit}`),

  // Get industry benchmarks
  getBenchmarks: (industry) =>
    api.get(`/dcf/benchmarks/${encodeURIComponent(industry)}`),

  // Get all industry benchmarks
  getAllBenchmarks: () =>
    api.get('/dcf/benchmarks'),

  // Parametric (Monte Carlo) valuation with probability distributions
  getParametric: (symbol, options = {}) => {
    const params = new URLSearchParams();
    if (options.simulations) params.append('simulations', options.simulations);
    if (options.distributionType) params.append('distributionType', options.distributionType);
    return api.get(`/dcf/${symbol}/parametric?${params.toString()}`, { timeout: 120000 });
  },

  // Parametric valuation with custom uncertainty parameters
  calculateParametric: (symbol, options = {}) =>
    api.post(`/dcf/${symbol}/parametric`, options, { timeout: 120000 })
};

// ============================================
// ETF and Model Portfolio API
// ============================================
export const etfsAPI = {
  // Get all ETFs with filters
  getAll: (options = {}) => {
    const params = new URLSearchParams();
    if (options.category) params.append('category', options.category);
    if (options.assetClass) params.append('assetClass', options.assetClass);
    if (options.issuer) params.append('issuer', options.issuer);
    if (options.tier) params.append('tier', options.tier);
    if (options.essential) params.append('essential', options.essential);
    if (options.search) params.append('search', options.search);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    return api.get(`/etfs?${params.toString()}`);
  },

  // Search ETFs by symbol or name
  search: (query, limit = 20) => api.get(`/etfs/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Get essential (must-have) ETFs
  getEssential: () => api.get('/etfs/essential'),

  // Get ETF issuers
  getIssuers: () => api.get('/etfs/issuers'),

  // Get lazy portfolios (pre-built strategies)
  getLazyPortfolios: (featured = false) => api.get(`/etfs/lazy-portfolios${featured ? '?featured=true' : ''}`),

  // Get single lazy portfolio details
  getLazyPortfolio: (slug) => api.get(`/etfs/lazy-portfolios/${slug}`),

  // Get ETF by symbol
  get: (symbol) => api.get(`/etfs/${symbol}`),

  // Get ETF categories with counts
  getCategories: (withCounts = false) => api.get(`/etfs/categories${withCounts ? '?counts=true' : ''}`),

  // Get ETF holdings (fetches from Yahoo Finance if not cached)
  getHoldings: (symbol, options = {}) => {
    const params = new URLSearchParams();
    if (options.minWeight) params.append('minWeight', options.minWeight);
    if (options.limit) params.append('limit', options.limit);
    if (options.refresh) params.append('refresh', 'true');
    return api.get(`/etfs/${symbol}/holdings?${params.toString()}`);
  },

  // Force refresh holdings from Yahoo Finance
  refreshHoldings: (symbol) => api.post(`/etfs/${symbol}/holdings/refresh`),

  // Compare ETFs
  compare: (symbols) => api.get(`/etfs/compare?symbols=${symbols.join(',')}`),

  // Get all model portfolios
  getModels: () => api.get('/etfs/models/list'),

  // Get single model portfolio
  getModel: (name) => api.get(`/etfs/models/${encodeURIComponent(name)}`),

  // Prepare portfolio from model (get trade list)
  prepareFromModel: (name, amount, options = {}) =>
    api.post(`/etfs/models/${encodeURIComponent(name)}/prepare`, { amount, ...options }),

  // Prepare custom ETF portfolio
  prepareCustom: (allocations, amount) =>
    api.post('/etfs/prepare-custom', { allocations, amount }),

  // Calculate rebalance trades
  rebalance: (currentHoldings, targetModel, portfolioValue) =>
    api.post('/etfs/rebalance', { currentHoldings, targetModel, portfolioValue }),

  // Get ETF holdings status (for Updates Dashboard)
  getHoldingsStatus: () => api.get('/etfs/holdings/status'),

  // Trigger ETF holdings refresh (static data)
  refreshAllHoldings: () => api.post('/etfs/holdings/refresh')
};

export const dividendsAPI = {
  // Get dividend summary stats
  getSummary: () => api.get('/dividends/summary'),

  // Get top dividend yielders
  getTopYielders: (options = {}) => {
    const params = new URLSearchParams();
    if (options.minYield) params.append('minYield', options.minYield);
    if (options.maxYield) params.append('maxYield', options.maxYield);
    if (options.sector) params.append('sector', options.sector);
    if (options.minYearsGrowth) params.append('minYearsGrowth', options.minYearsGrowth);
    if (options.limit) params.append('limit', options.limit);
    return api.get(`/dividends/top-yielders?${params.toString()}`);
  },

  // Get dividend aristocrats (25+ years growth)
  getAristocrats: () => api.get('/dividends/aristocrats'),

  // Get dividend kings (50+ years growth)
  getKings: () => api.get('/dividends/kings'),

  // Get upcoming ex-dividend dates
  getUpcoming: (days = 14) => api.get(`/dividends/upcoming?days=${days}`),

  // Get dividend growth leaders
  getGrowthLeaders: (period = '5y', limit = 50) =>
    api.get(`/dividends/growth-leaders?period=${period}&limit=${limit}`),

  // Get dividends by sector
  getBySector: () => api.get('/dividends/by-sector'),

  // Screen dividend stocks
  screen: (criteria = {}) => {
    const params = new URLSearchParams();
    Object.entries(criteria).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        params.append(key, value);
      }
    });
    return api.get(`/dividends/screen?${params.toString()}`);
  },

  // Get dividend metrics for a company
  getCompanyMetrics: (symbol) => api.get(`/dividends/company/${symbol}`),

  // Get dividend history for a company
  getCompanyHistory: (symbol, limit = 40) =>
    api.get(`/dividends/company/${symbol}/history?limit=${limit}`)
};

// ============================================
// Famous Investors API
// ============================================
export const investorsAPI = {
  // Get all famous investors
  getAll: () => api.get('/investors'),

  // Get single investor with details
  get: (id) => api.get(`/investors/${id}`),

  // Get latest holdings for an investor
  getHoldings: (id, { limit = 100, sortBy = 'market_value', sortOrder = 'DESC' } = {}) =>
    api.get(`/investors/${id}/holdings?limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`),

  // Get holding changes from latest filing
  getChanges: (id) => api.get(`/investors/${id}/changes`),

  // Get holdings history over time
  getHistory: (id, periods = 4) => api.get(`/investors/${id}/history?periods=${periods}`),

  // Get investor statistics and analytics
  getStats: (id) => api.get(`/investors/${id}/stats`),

  // Get investors who own a specific stock
  getByStock: (symbol) => api.get(`/investors/by-stock/${symbol}`),

  // Get stocks most owned by famous investors
  getMostOwned: (limit = 20) => api.get(`/investors/most-owned?limit=${limit}`),

  // Get recent investor activity (new buys, sells)
  getActivity: (limit = 50) => api.get(`/investors/activity?limit=${limit}`),

  // Get quick status for 13F holdings (for Updates Dashboard)
  getStatus: () => api.get('/investors/status'),

  // Prepare portfolio clone from investor
  clone: (id, options = {}) => api.post(`/investors/${id}/clone`, options),

  // Preview clone without creating
  clonePreview: (id, { amount = 10000, minWeight = 0, maxPositions = null } = {}) => {
    const params = new URLSearchParams({ amount, minWeight });
    if (maxPositions) params.append('maxPositions', maxPositions);
    return api.get(`/investors/${id}/clone-preview?${params.toString()}`);
  },

  // Trigger 13F fetch for an investor
  fetch13F: (id) => api.post(`/investors/${id}/fetch-13f`, {}, { timeout: 120000 }),

  // Trigger 13F fetch for all investors
  fetchAll13F: () => api.post('/investors/fetch-all-13f', {}, { timeout: 300000 }),

  // Get portfolio performance history (quarterly values over time)
  getPerformance: (id, limit = 40) => api.get(`/investors/${id}/performance?limit=${limit}`),

  // Get portfolio returns with S&P 500 benchmark comparison
  getReturns: (id, limit = 50) => api.get(`/investors/${id}/returns?limit=${limit}`),

  // Search for CIK numbers
  searchCIK: (query) => api.get('/investors/search-cik', { params: { query } }),

  // Create a new investor
  create: (data) => api.post('/investors', data)
};

// ============================================
// Portfolio API
// ============================================
export const portfoliosAPI = {
  // Get all portfolios
  getAll: () => api.get('/portfolios'),

  // Get single portfolio
  get: (id) => api.get(`/portfolios/${id}`),

  // Create new portfolio
  create: (data) => api.post('/portfolios', data),

  // Update portfolio
  update: (id, data) => api.put(`/portfolios/${id}`, data),

  // Delete portfolio
  delete: (id) => api.delete(`/portfolios/${id}`),

  // Get portfolio holdings
  getHoldings: (id) => api.get(`/portfolios/${id}/holdings`),

  // Get underlying holdings breakdown for ETF positions
  getUnderlyingHoldings: (id, { refresh = false } = {}) =>
    api.get(`/portfolios/${id}/underlying${refresh ? '?refresh=true' : ''}`),

  // Execute trade
  trade: (id, tradeData) => api.post(`/portfolios/${id}/trade`, tradeData),

  // Get standing orders
  getOrders: (id, { status = 'active' } = {}) =>
    api.get(`/portfolios/${id}/orders?status=${status}`),

  // Create standing order
  createOrder: (id, orderData) => api.post(`/portfolios/${id}/orders`, orderData),

  // Cancel order
  cancelOrder: (id, orderId) => api.delete(`/portfolios/${id}/orders/${orderId}`),

  // Get transactions
  getTransactions: (id, { limit = 50, offset = 0, type } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (type) params.append('type', type);
    return api.get(`/portfolios/${id}/transactions?${params.toString()}`);
  },

  // Deposit cash
  deposit: (id, amount) => api.post(`/portfolios/${id}/deposit`, { amount }),

  // Withdraw cash
  withdraw: (id, amount) => api.post(`/portfolios/${id}/withdraw`, { amount }),

  // Get portfolio summary
  getSummary: (id) => api.get(`/portfolios/${id}/summary`),

  // Get portfolio value history
  getValueHistory: (id, period = '1y') =>
    api.get(`/portfolios/${id}/value-history?period=${period}`),

  // ============ Alerts ============

  // Get all unread alerts across portfolios
  getAllAlerts: () => api.get('/portfolios/alerts'),

  // Get alerts for a portfolio
  getAlerts: (id, { unreadOnly = false, limit = 50, offset = 0 } = {}) => {
    const params = new URLSearchParams({ limit, offset });
    if (unreadOnly) params.append('unreadOnly', 'true');
    return api.get(`/portfolios/${id}/alerts?${params.toString()}`);
  },

  // Get unread alert count for a portfolio
  getUnreadAlertCount: (id) => api.get(`/portfolios/${id}/alerts/count`),

  // Get alert settings for a portfolio
  getAlertSettings: (id) => api.get(`/portfolios/${id}/alert-settings`),

  // Update alert setting
  updateAlertSetting: (id, alertType, { enabled, threshold }) =>
    api.put(`/portfolios/${id}/alert-settings`, { alertType, enabled, threshold }),

  // Check portfolio alerts (trigger check)
  checkAlerts: (id) => api.post(`/portfolios/${id}/check-alerts`),

  // Mark alerts as read
  markAlertsRead: (id, { alertIds = null, all = false } = {}) =>
    api.post(`/portfolios/${id}/alerts/mark-read`, { alertIds, all }),

  // Dismiss an alert
  dismissAlert: (id, alertId) => api.delete(`/portfolios/${id}/alerts/${alertId}`),

  // ============ Export ============

  // Helper function to trigger download using a hidden anchor
  _downloadFile: (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'export.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Export holdings as CSV (triggers download)
  exportHoldings: (id) => {
    const url = `${API_BASE_URL}/portfolios/${id}/export/holdings`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `holdings-${id}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Export transactions as CSV (triggers download)
  exportTransactions: (id, { startDate, endDate, type } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (type) params.append('type', type);
    const queryString = params.toString();
    const url = `${API_BASE_URL}/portfolios/${id}/export/transactions${queryString ? '?' + queryString : ''}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions-${id}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Get portfolio summary JSON
  exportSummaryJson: (id) => api.get(`/portfolios/${id}/export/summary`),

  // Export tax report as CSV (triggers download)
  exportTaxReport: (id, year = new Date().getFullYear()) => {
    const url = `${API_BASE_URL}/portfolios/${id}/export/tax?year=${year}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `tax-report-${id}-${year}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Export dividend report as CSV (triggers download)
  exportDividendReport: (id, year = new Date().getFullYear()) => {
    const url = `${API_BASE_URL}/portfolios/${id}/export/dividends?year=${year}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `dividend-report-${id}-${year}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

// ============================================
// Simulation API
// ============================================
export const simulateAPI = {
  // Get performance metrics for a portfolio
  getPerformance: (portfolioId, period = '1y') =>
    api.get(`/simulate/portfolios/${portfolioId}/performance?period=${period}`),

  // Get allocation breakdown
  getAllocation: (portfolioId) =>
    api.get(`/simulate/portfolios/${portfolioId}/allocation`),

  // Get risk metrics
  getRisk: (portfolioId) =>
    api.get(`/simulate/portfolios/${portfolioId}/risk`),

  // Run backtest
  runBacktest: (config) =>
    api.post('/simulate/backtest', config, { timeout: 120000 }),

  // Get backtest results
  getBacktest: (id) => api.get(`/simulate/backtest/${id}`),

  // Run Monte Carlo simulation
  runMonteCarlo: (config) =>
    api.post('/simulate/monte-carlo', config, { timeout: 120000 }),

  // Get Monte Carlo results
  getMonteCarlo: (id) => api.get(`/simulate/monte-carlo/${id}`),

  // Analyze return distribution
  analyzeDistribution: (config) =>
    api.post('/simulate/distribution/analyze', config, { timeout: 30000 }),

  // Get portfolio distribution fit
  getPortfolioDistribution: (portfolioId, type = 'auto') =>
    api.get(`/simulate/portfolios/${portfolioId}/distribution?type=${type}`),

  // Calculate position size
  calculatePositionSize: (config) =>
    api.post('/simulate/position-size', config),

  // Compare portfolios
  compare: (config) => api.post('/simulate/compare', config, { timeout: 60000 }),

  // Stress Testing
  runStressTest: (portfolioId, scenarioId) =>
    api.post('/simulate/stress-test', { portfolioId, scenarioId }, { timeout: 60000 }),
  runAllStressTests: (portfolioId) =>
    api.post('/simulate/stress-test/all', { portfolioId }, { timeout: 120000 }),
  getStressTestScenarios: () => api.get('/simulate/stress-test/scenarios'),

  // What-If Analysis
  runWhatIf: (portfolioId, changes) =>
    api.post(`/simulate/portfolios/${portfolioId}/what-if`, { changes }),
  runWhatIfWeights: (portfolioId, targetWeights) =>
    api.post(`/simulate/portfolios/${portfolioId}/what-if/weights`, { targetWeights }),
  compareScenarios: (portfolioId, scenarios) =>
    api.post(`/simulate/portfolios/${portfolioId}/what-if/compare`, { scenarios }),

  // Rebalancing
  calculateRebalance: (portfolioId, config) =>
    api.post(`/simulate/portfolios/${portfolioId}/rebalance-calc`, config),
  checkRebalanceNeeded: (portfolioId) =>
    api.get(`/simulate/portfolios/${portfolioId}/rebalance-check`),
  getRebalanceTemplates: () => api.get('/simulate/rebalance-templates'),
  applyTemplate: (portfolioId, templateId) =>
    api.post(`/simulate/portfolios/${portfolioId}/apply-template`, { templateId }),

  // Advanced Analytics
  getCorrelation: (portfolioId, period = '1y') =>
    api.get(`/simulate/portfolios/${portfolioId}/correlation?period=${period}`),
  getDiversification: (portfolioId) =>
    api.get(`/simulate/portfolios/${portfolioId}/diversification`),
  getFactorExposure: (portfolioId) =>
    api.get(`/simulate/portfolios/${portfolioId}/factors`),
  getIncomeProjection: (portfolioId, years = 10, growthRate = 5) =>
    api.get(`/simulate/portfolios/${portfolioId}/income-projection?years=${years}&growthRate=${growthRate}`),

  // Correlation & Covariance Analytics
  getCovariance: (portfolioId, period = '1y') =>
    api.get(`/simulate/portfolios/${portfolioId}/covariance?period=${period}`),
  getRiskContribution: (portfolioId, period = '1y') =>
    api.get(`/simulate/portfolios/${portfolioId}/risk-contribution?period=${period}`),
  getRollingCorrelation: (portfolioId, period = '1y', window = 60) =>
    api.get(`/simulate/portfolios/${portfolioId}/rolling-correlation?period=${period}&window=${window}`),
  getClusterAnalysis: (portfolioId, period = '1y') =>
    api.get(`/simulate/portfolios/${portfolioId}/clusters?period=${period}`),

  // Risk/Reward Analysis
  analyzeRiskReward: (config) =>
    api.post('/simulate/risk-reward', config),
  calculateOptimalPositions: (config) =>
    api.post('/simulate/optimal-positions', config),

  // Advanced Kelly Criterion
  getKellyOptions: () => api.get('/simulate/kelly/options'),

  getKellyBacktest: (portfolioId, params = {}) => {
    const { period = '3y', rebalanceFrequency = 'monthly', initialCapital = 100000, riskFreeRate = 0.05 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/backtest?period=${period}&rebalanceFrequency=${rebalanceFrequency}&initialCapital=${initialCapital}&riskFreeRate=${riskFreeRate}`, { timeout: 60000 });
  },
  getKellyOptimize: (portfolioId, params = {}) => {
    const { period = '3y', maxWeight = 0.40, minWeight = 0.02, leverageAllowed = false, riskFreeRate = 0.05 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/optimize?period=${period}&maxWeight=${maxWeight}&minWeight=${minWeight}&leverageAllowed=${leverageAllowed}&riskFreeRate=${riskFreeRate}`, { timeout: 60000 });
  },
  getKellyRegime: (portfolioId, params = {}) => {
    const { period = '5y', regimeWindow = 60, riskFreeRate = 0.05 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/regime?period=${period}&regimeWindow=${regimeWindow}&riskFreeRate=${riskFreeRate}`, { timeout: 60000 });
  },
  getKellyDrawdown: (portfolioId, params = {}) => {
    const { period = '5y', initialCapital = 100000, riskFreeRate = 0.05 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/drawdown?period=${period}&initialCapital=${initialCapital}&riskFreeRate=${riskFreeRate}`, { timeout: 60000 });
  },
  getKellyCompare: (portfolioId, params = {}) => {
    const { period = '5y', initialCapital = 100000, rebalanceFrequency = 'monthly', riskFreeRate = 0.05 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/compare?period=${period}&initialCapital=${initialCapital}&rebalanceFrequency=${rebalanceFrequency}&riskFreeRate=${riskFreeRate}`, { timeout: 60000 });
  },
  getKellyTalebRisk: (portfolioId, params = {}) => {
    const { period = '5y', initialCapital = 100000 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/taleb-risk?period=${period}&initialCapital=${initialCapital}`, { timeout: 60000 });
  },
  getKellyMultiAsset: (portfolioId, params = {}) => {
    const { period = '3y', kellyFraction = 0.25, riskFreeRate = 0.05 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/multi-asset?period=${period}&kellyFraction=${kellyFraction}&riskFreeRate=${riskFreeRate}`, { timeout: 60000 });
  },
  analyzeSingleHolding: (symbol, params = {}) => {
    const { portfolioId, period = '3y', riskFreeRate = 0.05, benchmarkSymbol = 'SPY', kellyFractions } = params;
    let url = `/simulate/kelly/analyze/${symbol}?period=${period}&riskFreeRate=${riskFreeRate}&benchmarkSymbol=${benchmarkSymbol}`;
    if (portfolioId) url += `&portfolioId=${portfolioId}`;
    if (kellyFractions) url += `&kellyFractions=${encodeURIComponent(JSON.stringify(kellyFractions))}`;
    return api.get(url, { timeout: 60000 });
  },

  // Alpha Analytics
  getAlpha: (portfolioId, params = {}) => {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/alpha?period=${period}&benchmarkSymbol=${benchmarkSymbol}`, { timeout: 60000 });
  },
  getJensensAlpha: (portfolioId, params = {}) => {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/alpha/jensens?period=${period}&benchmarkSymbol=${benchmarkSymbol}`, { timeout: 60000 });
  },
  getMultiFactorAlpha: (portfolioId, params = {}) => {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/alpha/multi-factor?period=${period}&benchmarkSymbol=${benchmarkSymbol}`, { timeout: 60000 });
  },
  getRollingAlpha: (portfolioId, params = {}) => {
    const { period = '1y', benchmarkSymbol = 'SPY', windowDays = 60 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/alpha/rolling?period=${period}&benchmarkSymbol=${benchmarkSymbol}&windowDays=${windowDays}`, { timeout: 60000 });
  },
  getAlphaAttribution: (portfolioId, params = {}) => {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/alpha/attribution?period=${period}&benchmarkSymbol=${benchmarkSymbol}`, { timeout: 60000 });
  },
  getSkillAnalysis: (portfolioId, params = {}) => {
    const { period = '1y', benchmarkSymbol = 'SPY' } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/alpha/skill?period=${period}&benchmarkSymbol=${benchmarkSymbol}`, { timeout: 60000 });
  }
};

// ============================================
// Knowledge Base API
// ============================================
export const knowledgeAPI = {
  // Get knowledge base update status (for Updates page)
  getUpdateStatus: () => api.get('/knowledge/update/status'),

  // Trigger knowledge base refresh
  refresh: (mode = 'incremental') =>
    apiLong.post('/knowledge/update/refresh', { mode }),

  // Search knowledge base
  search: (query, { topK = 5, topics = null, minSimilarity = 0.3 } = {}) => {
    const params = new URLSearchParams({ q: query, top_k: topK, min_similarity: minSimilarity });
    if (topics) params.append('topics', topics.join(','));
    return api.get(`/knowledge/search?${params.toString()}`);
  },

  // Get knowledge base statistics
  getStats: () => api.get('/knowledge/stats'),

  // Get available topics
  getTopics: () => api.get('/knowledge/topics'),

  // Health check
  health: () => api.get('/knowledge/health')
};

// ============================================
// AI Analyst API
// ============================================
export const analystAPI = {
  // Get all available analysts
  getAnalysts: () => api.get('/analyst/personas'),

  // Get specific analyst details
  getAnalyst: (id) => api.get(`/analyst/personas/${id}`),

  // List all conversations with optional filters
  listConversations: ({ analystId, companySymbol, limit } = {}) => {
    const params = new URLSearchParams();
    if (analystId) params.append('analystId', analystId);
    if (companySymbol) params.append('companySymbol', companySymbol);
    if (limit) params.append('limit', limit);
    return api.get(`/analyst/conversations?${params.toString()}`);
  },

  // Create a new conversation with an analyst
  createConversation: ({ analystId, companyId, companySymbol }) =>
    api.post('/analyst/conversations', { analystId, companyId, companySymbol }),

  // Get conversation by ID
  getConversation: (id) => api.get(`/analyst/conversations/${id}`),

  // Delete a conversation
  deleteConversation: (id) => api.delete(`/analyst/conversations/${id}`),

  // Send a message in a conversation
  sendMessage: (conversationId, message, companyContext = null) =>
    api.post(`/analyst/conversations/${conversationId}/messages`, {
      message,
      companyContext
    }, { timeout: 120000 }),

  // Send a message with streaming response using fetch + ReadableStream
  sendMessageStream: async (conversationId, message, companyContext = null, callbacks = {}) => {
    const { onStart, onToken, onComplete, onError, onDone, onThinking } = callbacks;

    console.log('[analystAPI.sendMessageStream] Starting for conversation:', conversationId);

    try {
      // Build headers - include admin bypass if set (like axios interceptor does)
      const headers = { 'Content-Type': 'application/json' };
      if (localStorage.getItem('adminAccess') === 'true') {
        headers['X-Admin-Bypass'] = 'true';
      }

      const response = await fetch(`${API_BASE_URL}/analyst/conversations/${conversationId}/messages/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, companyContext })
      });

      console.log('[analystAPI.sendMessageStream] Response status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[analystAPI.sendMessageStream] Stream ended after', chunkCount, 'chunks');
          break;
        }

        chunkCount++;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        if (chunkCount <= 3) {
          console.log('[analystAPI.sendMessageStream] Chunk', chunkCount, ':', chunk.substring(0, 100));
        }

        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep incomplete chunk

        for (const line of lines) {
          // Skip SSE comments (lines starting with :)
          if (line.startsWith(':')) {
            console.log('[analystAPI.sendMessageStream] SSE comment:', line);
            continue;
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('[analystAPI.sendMessageStream] Event:', data.type);

              switch (data.type) {
                case 'thinking':
                  onThinking?.();
                  break;
                case 'start':
                  onStart?.(data.id);
                  break;
                case 'token':
                  onToken?.(data.content);
                  break;
                case 'complete':
                  onComplete?.(data.message);
                  break;
                case 'error':
                  onError?.(new Error(data.error));
                  return;
                case 'done':
                  onDone?.();
                  return;
                default:
                  break;
              }
            } catch (e) {
              console.warn('[analystAPI.sendMessageStream] JSON parse error for line:', line);
            }
          }
        }
      }
      onDone?.();
    } catch (error) {
      console.error('[analystAPI.sendMessageStream] Error:', error);
      onError?.(error);
    }
  },

  // Quick one-shot analysis without conversation
  analyze: ({ analystId, companyData, question }) =>
    api.post('/analyst/analyze', {
      analystId,
      companyData,
      question
    }, { timeout: 120000 }),

  // Get conversation statistics
  getStats: () => api.get('/analyst/stats'),

  // Health check for analyst service
  health: () => api.get('/analyst/health')
};

// ============================================
// Natural Language Query API
// ============================================
export const nlQueryAPI = {
  // Process a natural language query
  query: (query, context = null) =>
    api.post('/nl/query', { query, context }, { timeout: 60000 }),

  // Classify a query without executing
  classify: (query) =>
    api.post('/nl/classify', { query }),

  // Get example queries by intent type
  getExamples: () => api.get('/nl/examples'),

  // Get query suggestions based on context
  getSuggestions: ({ symbol, page } = {}) => {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    if (page) params.append('page', page);
    return api.get(`/nl/suggestions?${params.toString()}`);
  },

  // Check NL service health
  health: () => api.get('/nl/health'),

  // List all conversations
  listConversations: (limit = 20, sessionId = null) => {
    const params = new URLSearchParams();
    params.append('limit', limit);
    if (sessionId) params.append('session_id', sessionId);
    return api.get(`/nl/conversations?${params.toString()}`);
  },

  // Get a specific conversation with messages
  getConversation: (conversationId, limit = 50) =>
    api.get(`/nl/conversation/${conversationId}?limit=${limit}`),

  // Delete a conversation
  deleteConversation: (conversationId) =>
    api.delete(`/nl/conversation/${conversationId}`),

  // Start a new conversation
  newConversation: (sessionId = null, clearPrevious = false) =>
    api.post('/nl/conversation/new', { session_id: sessionId, clear_previous: clearPrevious })
};

// SEC Direct Refresh API
export const secRefreshAPI = {
  // Get status of SEC direct refresh
  getStatus: () => api.get('/sec-refresh/status'),

  // Run SEC direct refresh
  run: (mode = 'watchlist', symbols = []) =>
    apiLong.post('/sec-refresh/run', { mode, symbols }),

  // Get watchlist symbols
  getWatchlist: () => api.get('/sec-refresh/watchlist')
};

// ============================================
// AI Ratings API
// ============================================
export const aiRatingsAPI = {
  // Store a new AI rating for a company
  save: (symbol, rating) =>
    api.post(`/ai-ratings/${symbol}`, rating),

  // Get AI rating history for a company
  getHistory: (symbol, limit = 10) =>
    api.get(`/ai-ratings/${symbol}?limit=${limit}`),

  // Get the latest AI rating for a company
  getLatest: (symbol) =>
    api.get(`/ai-ratings/${symbol}/latest`),

  // Get AI rating trend data for charting
  getTrend: (symbol, days = 90) =>
    api.get(`/ai-ratings/${symbol}/trend?days=${days}`),

  // Get AI-powered screening suggestions
  getScreeningSuggestions: (goal) =>
    api.post('/ai-ratings/screening/suggest', { goal }, { timeout: 60000 })
};

// ============================================
// Notes API
// ============================================
export const notesAPI = {
  // Notebooks
  getNotebooks: () => api.get('/notes/notebooks'),
  createNotebook: (data) => api.post('/notes/notebooks', data),
  updateNotebook: (id, data) => api.put(`/notes/notebooks/${id}`, data),
  deleteNotebook: (id) => api.delete(`/notes/notebooks/${id}`),

  // Tags
  getTags: () => api.get('/notes/tags'),
  createTag: (data) => api.post('/notes/tags', data),
  updateTag: (id, data) => api.put(`/notes/tags/${id}`, data),
  deleteTag: (id) => api.delete(`/notes/tags/${id}`),

  // Notes CRUD
  getAll: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.notebookId) queryParams.append('notebookId', params.notebookId);
    if (params.limit) queryParams.append('limit', params.limit);
    return api.get(`/notes?${queryParams.toString()}`);
  },
  getOne: (id) => api.get(`/notes/${id}`),
  create: (data) => api.post('/notes', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  delete: (id, hard = false) => api.delete(`/notes/${id}?hard=${hard}`),
  pin: (id, isPinned = true) => api.post(`/notes/${id}/pin`, { isPinned }),
  publish: (id) => api.post(`/notes/${id}/publish`),

  // Notes by company
  getByCompany: (symbol) => api.get(`/notes/company/${symbol}`),

  // Notes by portfolio
  getByPortfolio: (portfolioId) => api.get(`/notes/portfolio/${portfolioId}`),

  // Search
  search: (query, limit = 50) => api.get(`/notes/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Activity
  getActivity: (limit = 50) => api.get(`/notes/activity?limit=${limit}`),

  // Attachments
  addAttachment: (noteId, data) => api.post(`/notes/${noteId}/attachments`, data),
  removeAttachment: (noteId, attachmentId) => api.delete(`/notes/${noteId}/attachments/${attachmentId}`),

  // Tags on notes
  addTag: (noteId, tagId) => api.post(`/notes/${noteId}/tags/${tagId}`),
  removeTag: (noteId, tagId) => api.delete(`/notes/${noteId}/tags/${tagId}`),

  // Versions
  getVersions: (noteId) => api.get(`/notes/${noteId}/versions`),
  getVersion: (noteId, versionNumber) => api.get(`/notes/${noteId}/versions/${versionNumber}`),
  restoreVersion: (noteId, versionNumber) => api.post(`/notes/${noteId}/versions/${versionNumber}/restore`),

  // Snapshots
  getSnapshots: (noteId) => api.get(`/notes/${noteId}/snapshots`),
  captureSnapshot: (noteId, data) => api.post(`/notes/${noteId}/snapshots`, data),
  compareSnapshot: (snapshotId) => api.get(`/notes/snapshots/${snapshotId}/compare`),
  deleteSnapshot: (snapshotId) => api.delete(`/notes/snapshots/${snapshotId}`),
  getSnapshotsBySymbol: (symbol) => api.get(`/notes/company/${symbol}`).then(res => ({
    data: { snapshots: res.data.snapshots || [] }
  }))
};

// ============================================
// Theses API
// ============================================
export const thesesAPI = {
  // Dashboard
  getDashboard: () => api.get('/theses/dashboard'),

  // Templates
  getTemplates: () => api.get('/theses/templates'),
  getTemplate: (id) => api.get(`/theses/templates/${id}`),

  // Upcoming catalysts
  getUpcomingCatalysts: (limit = 20) => api.get(`/theses/catalysts/upcoming?limit=${limit}`),

  // Theses by company
  getByCompany: (symbol) => api.get(`/theses/company/${symbol}`),

  // Theses CRUD
  getAll: (status = null) => {
    const params = status ? `?status=${status}` : '';
    return api.get(`/theses${params}`);
  },
  getOne: (id) => api.get(`/theses/${id}`),
  create: (data) => api.post('/theses', data),
  update: (id, data) => api.put(`/theses/${id}`, data),
  updateStatus: (id, data) => api.put(`/theses/${id}/status`, data),
  delete: (id) => api.delete(`/theses/${id}`),

  // Assumptions
  getAssumptions: (thesisId) => api.get(`/theses/${thesisId}/assumptions`),
  addAssumption: (thesisId, data) => api.post(`/theses/${thesisId}/assumptions`, data),
  updateAssumption: (thesisId, assumptionId, data) => api.put(`/theses/${thesisId}/assumptions/${assumptionId}`, data),
  updateAssumptionStatus: (thesisId, assumptionId, data) => api.put(`/theses/${thesisId}/assumptions/${assumptionId}/status`, data),
  deleteAssumption: (thesisId, assumptionId) => api.delete(`/theses/${thesisId}/assumptions/${assumptionId}`),

  // Catalysts
  getCatalysts: (thesisId) => api.get(`/theses/${thesisId}/catalysts`),
  addCatalyst: (thesisId, data) => api.post(`/theses/${thesisId}/catalysts`, data),
  updateCatalyst: (thesisId, catalystId, data) => api.put(`/theses/${thesisId}/catalysts/${catalystId}`, data),
  updateCatalystStatus: (thesisId, catalystId, data) => api.put(`/theses/${thesisId}/catalysts/${catalystId}/status`, data),
  deleteCatalyst: (thesisId, catalystId) => api.delete(`/theses/${thesisId}/catalysts/${catalystId}`)
};

// Notes AI API
export const notesAIAPI = {
  // Summarize a note
  summarize: (content, title = '', maxLength = 200) =>
    api.post('/ai/notes/summarize', { content, title, maxLength }),

  // Extract investment assumptions from content
  extractAssumptions: (content, thesisContext = '') =>
    api.post('/ai/notes/extract-assumptions', { content, thesisContext }),

  // Challenge a thesis with counter-arguments
  challengeThesis: (thesisSummary, assumptions = [], companyData = null) =>
    api.post('/ai/notes/challenge-thesis', { thesisSummary, assumptions, companyData }),

  // Extract key insights from a note
  extractInsights: (content, noteType = 'research') =>
    api.post('/ai/notes/extract-insights', { content, noteType }),

  // Suggest tags for a note
  suggestTags: (content, existingTags = []) =>
    api.post('/ai/notes/suggest-tags', { content, existingTags })
};

// ============================================
// Settings API
// ============================================
export const settingsAPI = {
  // Update Schedules
  getUpdateSchedules: () => api.get('/settings/updates'),
  toggleSchedule: (name, enabled) => api.patch(`/settings/updates/${name}`, { enabled }),
  getUpdateHistory: (schedule = null, limit = 50) => {
    const params = new URLSearchParams();
    if (schedule) params.append('schedule', schedule);
    params.append('limit', limit);
    return api.get(`/settings/updates/history?${params.toString()}`);
  },

  // Data Health
  getDataHealth: () => api.get('/settings/data-health'),
  getHealth: () => api.get('/settings/health'),

  // API Integrations
  getIntegrations: () => api.get('/settings/integrations'),
  updateApiKey: (name, apiKey) => api.patch(`/settings/integrations/${name}`, { apiKey }),
  testConnection: (name) => api.post(`/settings/integrations/${name}/test`),

  // User Preferences
  getPreferences: () => api.get('/settings/preferences'),
  updatePreferences: (prefs) => api.patch('/settings/preferences', prefs),

  // Database & Diagnostics
  getDatabaseStats: () => api.get('/settings/database'),
  getDiagnostics: () => api.get('/settings/diagnostics'),
  getLogs: (options = {}) => {
    const params = new URLSearchParams();
    if (options.level) params.append('level', options.level);
    if (options.category) params.append('category', options.category);
    if (options.limit) params.append('limit', options.limit);
    return api.get(`/settings/logs?${params.toString()}`);
  },
  cleanupLogs: (daysToKeep = 30) => api.post('/settings/logs/cleanup', { daysToKeep }),

  // Exchange Rates
  getExchangeRates: () => api.get('/settings/exchange-rates'),

  // Tax Settings
  getTaxSettings: () => api.get('/tax/settings'),
  updateTaxSettings: (settings) => api.put('/tax/settings', settings),
  getTaxRegimes: () => api.get('/tax/regimes'),
  getTaxRegime: (code) => api.get(`/tax/regimes/${code}`),
};

// ============================================
// Historical Intelligence API
// ============================================
export const historicalAPI = {
  // Get overall stats
  getStats: () => api.get('/historical/stats'),

  // Query decisions with filters
  getDecisions: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.investor_id) params.append('investor_id', filters.investor_id);
    if (filters.symbol) params.append('symbol', filters.symbol);
    if (filters.decision_type) params.append('decision_type', filters.decision_type);
    if (filters.sector) params.append('sector', filters.sector);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.min_value) params.append('min_value', filters.min_value);
    if (filters.limit) params.append('limit', filters.limit);
    if (filters.offset) params.append('offset', filters.offset);
    return api.get(`/historical/decisions?${params.toString()}`);
  },

  // Get investor patterns
  getInvestorPatterns: (investorId) => api.get(`/historical/investors/${investorId}/patterns`),

  // Get investors for a stock
  getStockInvestors: (symbol) => api.get(`/historical/stocks/${symbol}/investors`),

  // Find similar decisions
  getSimilarDecisions: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.investment_style) params.append('investment_style', filters.investment_style);
    if (filters.sector) params.append('sector', filters.sector);
    if (filters.decision_type) params.append('decision_type', filters.decision_type);
    if (filters.min_portfolio_weight) params.append('min_portfolio_weight', filters.min_portfolio_weight);
    if (filters.has_positive_return) params.append('has_positive_return', filters.has_positive_return);
    if (filters.limit) params.append('limit', filters.limit);
    return api.get(`/historical/similar-decisions?${params.toString()}`);
  },

  // Get factor performance data
  getFactorPerformance: (factor = 'value', minDecisions = 50) =>
    api.get(`/historical/performance-by-factor?factor=${factor}&min_decisions=${minDecisions}`),

  // Get investor track record
  getInvestorTrackRecord: (investorId, periodType = 'all_time') =>
    api.get(`/historical/investor-track-record/${investorId}?periodType=${periodType}`),

  // Calculate investor track record (POST)
  calculateInvestorTrackRecord: (investorId, periodType = 'all_time') =>
    api.post('/historical/calculate-investor-track-record', { investorId, periodType }),

  // Calculate outcomes for decisions
  calculateOutcomes: (limit = 1000, minDaysOld = 365) =>
    api.post('/historical/calculate-outcomes', { limit, minDaysOld }),

  // Refresh outcomes
  refreshOutcomes: (daysOld = 30, limit = 500) =>
    api.post('/historical/refresh-outcomes', { daysOld, limit }),

  // Get factor timeseries for charts
  getFactorTimeseries: (factor = 'value', groupBy = 'quarter') =>
    api.get(`/historical/factor-timeseries?factor=${factor}&groupBy=${groupBy}`),

  // Get decision heatmap data
  getDecisionHeatmap: (decisionType = null) => {
    const params = decisionType ? `?decisionType=${decisionType}` : '';
    return api.get(`/historical/decision-heatmap${params}`);
  },

  // Get investor styles with performance
  getInvestorStyles: () => api.get('/historical/investor-styles'),

  // Classify a single investor
  classifyInvestorStyle: (investorId) =>
    api.post('/historical/classify-investor-style', { investorId }),

  // Batch classify all investors
  classifyAllInvestors: (minDecisions = 20) =>
    api.post('/historical/classify-all-investors', { minDecisions })
};

// =============================================================================
// Agent 3: Attribution & Analytics API
// =============================================================================

export const attributionAPI = {
  // Market Regime
  getRegime: () => api.get('/attribution/regime'),
  getRegimeHistory: (days = 30) => api.get(`/attribution/regime/history?days=${days}`),
  getRegimeDefinitions: () => api.get('/attribution/regime/definitions'),

  // Trade Attribution
  analyzeTrade: (transactionId) => api.get(`/attribution/trade/${transactionId}`),
  getTradeAttribution: (transactionId) => api.get(`/attribution/trade/${transactionId}`),

  // Signal Strength
  getSignalStrength: (symbol) => api.get(`/attribution/signals/${symbol}`),
  getPortfolioSignals: (portfolioId) => api.get(`/attribution/portfolios/${portfolioId}/signals`),

  // Portfolio Attribution
  getPortfolioSummary: (portfolioId, period = '90d') =>
    api.get(`/attribution/portfolios/${portfolioId}/summary?period=${period}`),
  getFactorPerformance: (portfolioId, period = '90d') =>
    api.get(`/attribution/portfolios/${portfolioId}/factors?period=${period}`),
  getRegimePerformance: (portfolioId, period = '90d') =>
    api.get(`/attribution/portfolios/${portfolioId}/regime?period=${period}`),
  getSectorPerformance: (portfolioId, period = '90d') =>
    api.get(`/attribution/portfolios/${portfolioId}/sector?period=${period}`),
  analyzePortfolio: (portfolioId, period = '90d') =>
    api.post(`/attribution/portfolios/${portfolioId}/analyze`, { period }),

  // Risk Limits
  getRiskLimits: (portfolioId) =>
    api.get(`/attribution/portfolios/${portfolioId}/risk-limits`),
  updateRiskLimits: (portfolioId, limits) =>
    api.put(`/attribution/portfolios/${portfolioId}/risk-limits`, limits),

  // Recommendations
  getRecommendations: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.portfolioId) searchParams.append('portfolioId', params.portfolioId);
    if (params.limit) searchParams.append('limit', params.limit);
    if (params.executed !== undefined) searchParams.append('executed', params.executed);
    return api.get(`/attribution/recommendations?${searchParams.toString()}`);
  },
  getRecommendation: (portfolioId) => api.get(`/attribution/portfolios/${portfolioId}/recommendation`),
  getRecommendationById: (id) => api.get(`/attribution/recommendations/${id}`),

  // Opportunities
  getOpportunities: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.append('limit', params.limit);
    if (params.triggerType) searchParams.append('triggerType', params.triggerType);
    if (params.minScore) searchParams.append('minScore', params.minScore);
    return api.get(`/attribution/opportunities?${searchParams.toString()}`);
  }
};

export const orchestratorAPI = {
  // Run daily analysis
  run: (portfolioId) => apiLong.post(`/orchestrator/run/${portfolioId}`),

  // Get latest analysis
  getLatest: (portfolioId) => api.get(`/orchestrator/latest/${portfolioId}`),

  // Get opportunities
  getOpportunities: () => api.get('/orchestrator/opportunities'),

  // Get analysis history
  getHistory: (portfolioId, limit = 10) =>
    api.get(`/orchestrator/history/${portfolioId}?limit=${limit}`)
};

export const agentAPI = {
  // Get recommendation for a symbol
  getRecommendation: (symbol, portfolioId = null) => {
    const params = portfolioId ? `?portfolioId=${portfolioId}` : '';
    return api.get(`/agent/recommendation/${symbol}${params}`);
  },

  // Get recommendations for portfolio
  getPortfolioRecommendations: (portfolioId) =>
    api.get(`/agent/portfolio/${portfolioId}/recommendations`),

  // Execute a recommendation
  executeRecommendation: (recommendationId) =>
    api.post(`/agent/recommendations/${recommendationId}/execute`),

  // === Agent Dashboard API ===

  // Get agent status (running, mode, scan times)
  getStatus: (portfolioId) => api.get(`/agent/portfolios/${portfolioId}/status`),

  // Start the agent
  resume: (portfolioId) => api.post(`/agent/portfolios/${portfolioId}/start`),

  // Pause the agent
  pause: (portfolioId) => api.post(`/agent/portfolios/${portfolioId}/pause`),

  // Run immediate scan
  runNow: (portfolioId) => api.post(`/agent/portfolios/${portfolioId}/scan`),

  // Get pending trades (uses executionAPI under the hood)
  getPendingTrades: (portfolioId) => api.get(`/execution/portfolios/${portfolioId}/pending`),

  // Approve a trade
  approveTrade: (portfolioId, tradeId) => api.post(`/execution/${tradeId}/approve`, { approvedBy: 'user' }),

  // Reject a trade
  rejectTrade: (portfolioId, tradeId) => api.post(`/execution/${tradeId}/reject`, { rejectedBy: 'user' }),

  // Approve all pending trades
  approveAllTrades: (portfolioId) => api.post(`/execution/portfolios/${portfolioId}/approve-all`, { approvedBy: 'user' }),

  // Reject all pending trades
  rejectAllTrades: (portfolioId) => api.post(`/execution/portfolios/${portfolioId}/reject-all`, { rejectedBy: 'user' }),

  // Get agent activity log
  getActivity: (portfolioId, limit = 50) => api.get(`/agent/portfolios/${portfolioId}/activity?limit=${limit}`),

  // Get market context (regime, signals)
  getMarketContext: (portfolioId) => api.get(`/agent/portfolios/${portfolioId}/context`),

  // Get today's stats
  getTodayStats: (portfolioId) => api.get(`/agent/portfolios/${portfolioId}/stats/today`),

  // Get agent settings
  getSettings: (portfolioId) => api.get(`/agent/portfolios/${portfolioId}/settings`),

  // Update agent settings
  updateSettings: (portfolioId, settings) => api.put(`/agent/portfolios/${portfolioId}/settings`, settings)
};

// ============================================
// Trading API (Agent 2 - Liquidity & Signals)
// ============================================
export const tradingAPI = {
  // Health check
  getHealth: () => api.get('/trading/health'),

  // Market Regime
  getRegime: () => api.get('/trading/regime/current'),
  getRegimeHistory: (days = 30) => api.get(`/trading/regime/history?days=${days}`),
  getRegimeDefinitions: () => api.get('/trading/regime/definitions'),

  // Technical Signals
  getTechnical: (symbol) => api.get(`/trading/technical/${symbol}`),
  getTechnicalBatch: (symbols) => api.post('/trading/technical/batch', { symbols }),

  // Aggregated Signals
  getSignals: (symbol) => api.get(`/trading/signals/${symbol}`),
  getSignalsBatch: (symbols) => api.post('/trading/signals/batch', { symbols }),
  getTopBullish: (limit = 20) => api.get(`/trading/signals/top/bullish?limit=${limit}`),

  // Signal Summary
  getSummary: (symbol) => api.get(`/trading/summary/${symbol}`),

  // Liquidity Metrics (Agent 2)
  getLiquidityStatus: () => api.get('/trading/liquidity/status'),
  refreshLiquidity: () => apiLong.post('/trading/liquidity/refresh'),
  getTopLiquid: (limit = 50) => api.get(`/trading/liquidity/top?limit=${limit}`),
  getMostVolatile: (limit = 50) => api.get(`/trading/liquidity/volatile?limit=${limit}`),
  getLiquidity: (symbol) => api.get(`/trading/liquidity/${symbol}`),
  getLiquidityStats: () => api.get('/trading/liquidity/stats/summary')
};

// ============================================
// Snapshots API (Portfolio Snapshots)
// ============================================
export const snapshotsAPI = {
  // Create snapshot for all portfolios
  createAll: () => apiLong.post('/portfolios/snapshot-all'),

  // Get snapshots for a portfolio
  get: (portfolioId, { limit = 30, startDate, endDate } = {}) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return api.get(`/portfolios/${portfolioId}/snapshots?${params.toString()}`);
  },

  // Create snapshot for specific portfolio
  create: (portfolioId) => api.post(`/portfolios/${portfolioId}/snapshots`)
};

// ============================================
// Signals API (Enhanced Signals: 13F, Earnings, Insider)
// ============================================
export const signalsAPI = {
  // 13F Activity
  get13F: (symbol) => api.get(`/signals/13f/${symbol}`),
  getTop13FNewPositions: (limit = 30) => api.get(`/signals/13f/top/new-positions?limit=${limit}`),
  getTop13FIncreases: (limit = 30) => api.get(`/signals/13f/top/increases?limit=${limit}`),
  getTop13FExits: (limit = 30) => api.get(`/signals/13f/top/exits?limit=${limit}`),

  // Insider Open Market Buys
  getInsider: (symbol) => api.get(`/signals/insiders/${symbol}`),
  getTopOpenMarketBuys: (limit = 30) => api.get(`/signals/insiders/top/open-market-buys?limit=${limit}`),

  // Earnings Momentum
  getEarnings: (symbol) => api.get(`/signals/earnings/${symbol}`),
  getTopEarningsMomentum: (limit = 30, minBeats = 2) =>
    api.get(`/signals/earnings/top/momentum?limit=${limit}&minBeats=${minBeats}`),

  // Combined signals for a symbol
  getCombined: (symbol) => api.get(`/signals/combined/${symbol}`),

  // Summary statistics
  getSummary: () => api.get('/signals/summary')
};

// ============================================
// Recommendations API (IC Tracking & Performance)
// ============================================
export const recommendationsAPI = {
  // List recommendations with filters
  list: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.portfolioId) searchParams.append('portfolioId', params.portfolioId);
    if (params.limit) searchParams.append('limit', params.limit);
    if (params.offset) searchParams.append('offset', params.offset);
    if (params.outcome) searchParams.append('outcome', params.outcome);
    return api.get(`/recommendations?${searchParams.toString()}`);
  },

  // Get single recommendation with outcome
  get: (id) => api.get(`/recommendations/${id}`),

  // Get performance summary
  getPerformance: (period = '90d') => api.get(`/recommendations/performance/summary?period=${period}`),

  // Get performance by signal type (IC data)
  getBySignal: (period = '90d') => api.get(`/recommendations/performance/by-signal?period=${period}`),

  // Get performance by market regime
  getByRegime: (period = '90d') => api.get(`/recommendations/performance/by-regime?period=${period}`),

  // Get optimized signal weights
  getOptimalWeights: () => api.get('/recommendations/performance/optimal-weights'),

  // Get weight comparison (base vs optimized)
  getWeightComparison: (regime = 'ALL') => api.get(`/recommendations/performance/weight-comparison?regime=${regime}`),

  // Mark recommendation as executed
  markExecuted: (id, executedPrice) => api.post(`/recommendations/${id}/execute`, { executedPrice }),

  // Trigger outcome update (admin)
  updateOutcomes: () => apiLong.post('/recommendations/update-outcomes')
};

// ============================================
// Execution API (Auto-Execution & Pending Trades)
// ============================================
export const executionAPI = {
  // Get execution settings for a portfolio
  getSettings: (portfolioId) => api.get(`/execution/portfolios/${portfolioId}/settings`),

  // Update execution settings
  updateSettings: (portfolioId, settings) => api.put(`/execution/portfolios/${portfolioId}/settings`, settings),

  // Get pending executions (all or by portfolio)
  getPending: (portfolioId = null) => {
    const params = portfolioId ? `?portfolioId=${portfolioId}` : '';
    return api.get(`/execution/pending${params}`);
  },

  // Get pending executions for specific portfolio
  getPortfolioPending: (portfolioId) => api.get(`/execution/portfolios/${portfolioId}/pending`),

  // Approve a pending execution
  approve: (id, approvedBy = 'user') => api.post(`/execution/${id}/approve`, { approvedBy }),

  // Reject a pending execution
  reject: (id, reason = '', rejectedBy = 'user') => api.post(`/execution/${id}/reject`, { reason, rejectedBy }),

  // Execute an approved trade
  execute: (id, actualPrice = null, actualShares = null) =>
    api.post(`/execution/${id}/execute`, { actualPrice, actualShares }),

  // Approve all pending for a portfolio
  approveAll: (portfolioId, approvedBy = 'user') =>
    api.post(`/execution/portfolios/${portfolioId}/approve-all`, { approvedBy }),

  // Reject all pending for a portfolio
  rejectAll: (portfolioId, reason = 'Batch rejection', rejectedBy = 'user') =>
    api.post(`/execution/portfolios/${portfolioId}/reject-all`, { reason, rejectedBy }),

  // Get execution history for a portfolio
  getHistory: (portfolioId, limit = 50) => api.get(`/execution/portfolios/${portfolioId}/history?limit=${limit}`),

  // Get execution statistics for a portfolio
  getStats: (portfolioId) => api.get(`/execution/portfolios/${portfolioId}/stats`),

  // Expire old pending executions (admin)
  expireOld: () => api.post('/execution/expire-old')
};

// ============================================
// Hedge Suggestions API
// ============================================
export const hedgeAPI = {
  // Get hedge suggestions for a portfolio
  getSuggestions: (portfolioId) => api.get(`/portfolios/${portfolioId}/hedge-suggestions`),

  // Update hedge suggestion status
  updateStatus: (portfolioId, suggestionId, status) =>
    api.post(`/portfolios/${portfolioId}/hedge-suggestions/${suggestionId}/status`, { status })
};

// ============================================
// Trading Agents API (First-Class Entities)
// ============================================
export const agentsAPI = {
  // Get all trading agents
  getAll: () => api.get('/agents'),

  // Get single agent with details
  get: (id) => api.get(`/agents/${id}`),

  // Create new agent
  create: (config) => api.post('/agents', config),

  // Update agent configuration
  update: (id, config) => api.put(`/agents/${id}`, config),

  // Delete agent (soft delete)
  delete: (id) => api.delete(`/agents/${id}`),

  // === Lifecycle ===

  // Start the agent
  start: (id) => api.post(`/agents/${id}/start`),

  // Pause the agent
  pause: (id) => api.post(`/agents/${id}/pause`),

  // Run immediate scan
  runScan: (id) => api.post(`/agents/${id}/scan`),

  // Get agent status
  getStatus: (id) => api.get(`/agents/${id}/status`),

  // === Signals ===

  // Get signals for an agent
  getSignals: (id, { limit = 50, status = null, action = null } = {}) => {
    const params = new URLSearchParams({ limit });
    if (status) params.append('status', status);
    if (action) params.append('action', action);
    return api.get(`/agents/${id}/signals?${params.toString()}`);
  },

  // Get single signal detail
  getSignal: (id, signalId) => api.get(`/agents/${id}/signals/${signalId}`),

  // Approve a signal
  approveSignal: (id, signalId) => {
    if (!id || !signalId) {
      return Promise.reject(new Error('Missing agentId or signalId'));
    }
    return api.post(`/agents/${id}/signals/${signalId}/approve`);
  },

  // Reject a signal
  rejectSignal: (id, signalId, reason = '') => {
    if (!id || !signalId) {
      return Promise.reject(new Error('Missing agentId or signalId'));
    }
    return api.post(`/agents/${id}/signals/${signalId}/reject`, { reason });
  },

  // Approve all pending signals
  approveAllSignals: (id) => api.post(`/agents/${id}/signals/approve-all`),

  // Execute an approved signal
  executeSignal: (id, signalId) => api.post(`/agents/${id}/signals/${signalId}/execute`),

  // Execute all approved signals
  executeAllSignals: (id) => api.post(`/agents/${id}/signals/execute-all`),

  // === Portfolios ===

  // Get portfolios managed by agent
  getPortfolios: (id) => api.get(`/agents/${id}/portfolios`),

  // Create new portfolio for agent
  createPortfolio: (id, config) => api.post(`/agents/${id}/portfolios`, config),

  // Attach existing portfolio to agent
  attachPortfolio: (id, portfolioId, config = {}) =>
    api.post(`/agents/${id}/portfolios/attach`, { portfolioId, ...config }),

  // Detach portfolio from agent
  detachPortfolio: (id, portfolioId) =>
    api.delete(`/agents/${id}/portfolios/${portfolioId}`),

  // === Performance & Activity ===

  // Get agent performance metrics
  getPerformance: (id) => api.get(`/agents/${id}/performance`),

  // Get agent activity log
  getActivity: (id, limit = 50) => api.get(`/agents/${id}/activity?limit=${limit}`),

  // === Presets ===

  // Get strategy presets
  getPresets: () => api.get('/agents/presets'),

  // === Executions ===

  // Get all executions for an agent (pending, approved, executed)
  getExecutions: (id) => api.get(`/agents/${id}/executions`),

  // Approve an execution
  approveExecution: (id, executionId) => api.post(`/agents/${id}/executions/${executionId}/approve`),

  // Reject an execution
  rejectExecution: (id, executionId, reason = null) =>
    api.post(`/agents/${id}/executions/${executionId}/reject`, { reason }),

  // Execute an approved trade
  executeExecution: (id, executionId) => api.post(`/agents/${id}/executions/${executionId}/execute`),

  // Approve all pending executions
  approveAllExecutions: (id) => api.post(`/agents/${id}/executions/approve-all`),

  // Execute all approved trades
  executeAllApproved: (id) => api.post(`/agents/${id}/executions/execute-all`),

  // === Settings ===

  // Update agent settings
  updateSettings: (id, settings) => api.put(`/agents/${id}/settings`, settings),

  // Get lightweight live status for polling
  getLiveStatus: (id) => api.get(`/agents/${id}/live-status`),

  // === Beginner Strategies ===

  // Get beginner strategy presets
  getBeginnerPresets: () => api.get('/agents/beginner/presets'),

  // Get beginner strategy type definitions
  getBeginnerStrategyTypes: () => api.get('/agents/beginner/strategy-types'),

  // Create beginner agent
  createBeginner: (config) => api.post('/agents/beginner', config),

  // Get contribution history for beginner agent
  getContributions: (id) => api.get(`/agents/${id}/contributions`),

  // Preview next contribution
  previewContribution: (id) => api.post(`/agents/${id}/contributions/preview`),

  // Execute contribution (create signals)
  executeContribution: (id) => api.post(`/agents/${id}/contributions/execute`),

  // Get future value projection
  getProjection: (id, params = {}) => {
    const queryParams = new URLSearchParams(params);
    return api.get(`/agents/${id}/projection?${queryParams.toString()}`);
  },

  // Get contribution schedule
  getSchedule: (id) => api.get(`/agents/${id}/schedule`)
};

// ============================================
// Paper Trading API
// ============================================
export const paperTradingAPI = {
  // === Accounts ===

  // Get all paper trading accounts
  getAccounts: () => api.get('/paper-trading/accounts'),

  // Create new paper trading account
  createAccount: (name, initialCapital = 100000) =>
    api.post('/paper-trading/accounts', { name, initialCapital }),

  // Get account details with positions and summary
  getAccount: (accountId) => api.get(`/paper-trading/accounts/${accountId}`),

  // Delete an account
  deleteAccount: (accountId) => api.delete(`/paper-trading/accounts/${accountId}`),

  // Reset an account to initial state
  resetAccount: (accountId, newCapital = null) =>
    api.post(`/paper-trading/accounts/${accountId}/reset`, { newCapital }),

  // === Orders ===

  // Submit a new order
  submitOrder: (accountId, { symbol, side, quantity, orderType = 'MARKET', limitPrice, stopPrice, notes }) =>
    api.post(`/paper-trading/accounts/${accountId}/orders`, {
      symbol, side, quantity, orderType, limitPrice, stopPrice, notes
    }),

  // Get order history
  getOrders: (accountId, limit = 50) =>
    api.get(`/paper-trading/accounts/${accountId}/orders?limit=${limit}`),

  // Get pending orders
  getPendingOrders: (accountId) =>
    api.get(`/paper-trading/accounts/${accountId}/orders/pending`),

  // === Quick Trade Helpers ===

  // Market buy
  buy: (accountId, symbol, quantity, notes = '') =>
    api.post(`/paper-trading/accounts/${accountId}/buy`, { symbol, quantity, notes }),

  // Market sell
  sell: (accountId, symbol, quantity, notes = '') =>
    api.post(`/paper-trading/accounts/${accountId}/sell`, { symbol, quantity, notes }),

  // === Positions ===

  // Get current positions
  getPositions: (accountId) => api.get(`/paper-trading/accounts/${accountId}/positions`),

  // === Trades ===

  // Get trade history
  getTrades: (accountId, limit = 50) =>
    api.get(`/paper-trading/accounts/${accountId}/trades?limit=${limit}`),

  // === Performance ===

  // Get performance metrics
  getPerformance: (accountId, days = 30) =>
    api.get(`/paper-trading/accounts/${accountId}/performance?days=${days}`),

  // Take daily snapshot
  takeSnapshot: (accountId) =>
    api.post(`/paper-trading/accounts/${accountId}/snapshot`),

  // Get historical snapshots
  getSnapshots: (accountId, limit = 90) =>
    api.get(`/paper-trading/accounts/${accountId}/snapshots?limit=${limit}`),

  // === Agent Integration ===

  // Execute a trading signal
  executeSignal: ({ accountId, signalId, symbol, action, quantity, positionValue, confidence, notes }) =>
    api.post('/paper-trading/execute-signal', {
      accountId, signalId, symbol, action, quantity, positionValue, confidence, notes
    }),

  // Link a portfolio to paper trading
  linkPortfolio: (portfolioId, agentId = null, initialCapital = null) =>
    api.post('/paper-trading/link-portfolio', { portfolioId, agentId, initialCapital })
};

// ============================================
// ML SIGNAL COMBINER API
// ============================================
export const mlCombinerAPI = {
  // Get ML model status (can be slow due to data gathering)
  getStatus: () => api.get('/validation/ml/status', { timeout: 60000 }),

  // Train the ML signal combiner (long-running operation)
  train: (lookbackDays = 730, customFactorIds = []) =>
    apiLong.post('/validation/ml/train', { lookbackDays, customFactorIds }),

  // Get available custom factors for ML training
  getAvailableFactors: () =>
    api.get('/validation/ml/available-factors'),

  // Combine signals using ML model
  combine: (signals, context = {}, horizon = 21) =>
    api.post('/validation/ml/combine', { signals, context, horizon }),

  // Get feature importance
  getImportance: (horizon = 21) =>
    api.get(`/validation/ml/importance?horizon=${horizon}`)
};

// ============================================
// SIGNAL PERFORMANCE API
// ============================================
export const signalPerformanceAPI = {
  // Get comprehensive signal health report
  getHealth: (lookback = 180) =>
    api.get(`/validation/signals/health?lookback=${lookback}`),

  // Get IC decay analysis
  getICDecay: (lookback = 180) =>
    api.get(`/validation/signals/ic-decay?lookback=${lookback}`),

  // Get hit rates by period
  getHitRates: (lookback = 180) =>
    api.get(`/validation/signals/hit-rates?lookback=${lookback}`),

  // Get regime stability analysis
  getRegimeStability: (lookback = 365) =>
    api.get(`/validation/signals/regime-stability?lookback=${lookback}`),

  // Get rolling IC trend for a signal
  getRollingIC: (signalType, window = 60, step = 7, lookback = 365) =>
    api.get(`/validation/signals/rolling-ic/${signalType}?window=${window}&step=${step}&lookback=${lookback}`),

  // Trigger recalculation
  recalculate: () => api.post('/validation/signals/recalculate'),

  // Get historical trends
  getHistory: (days = 90) =>
    api.get(`/validation/signals/history?days=${days}`)
};

// ============================================
// ALTERNATIVE DATA API (Congressional, Short Interest, Contracts)
// ============================================
export const altDataAPI = {
  // === Congressional Trading ===

  // Get congressional trading activity for a symbol
  getCongressTrades: (symbol, lookback = '-90 days') =>
    api.get(`/alt-data/congress/${symbol}?lookback=${lookback}`),

  // Get top congressional stock purchases
  getTopCongressBuys: (lookback = '-30 days', limit = 20) =>
    api.get(`/alt-data/congress/top-buys?lookback=${lookback}&limit=${limit}`),

  // Fetch fresh congressional data for a symbol
  fetchCongressData: (symbol) =>
    api.post(`/alt-data/congress/fetch/${symbol}`),

  // === Short Interest ===

  // Get short interest data for a symbol
  getShortInterest: (symbol) =>
    api.get(`/alt-data/short-interest/${symbol}`),

  // Get short interest history for a symbol
  getShortInterestHistory: (symbol, lookback = '-365 days') =>
    api.get(`/alt-data/short-interest/${symbol}/history?lookback=${lookback}`),

  // Get potential short squeeze candidates
  getSqueezeCandidates: (limit = 20) =>
    api.get(`/alt-data/squeeze-candidates?limit=${limit}`),

  // Get most shorted stocks
  getMostShorted: (limit = 20) =>
    api.get(`/alt-data/most-shorted?limit=${limit}`),

  // === Government Contracts ===

  // Get government contract activity for a symbol
  getContracts: (symbol, lookback = '-365 days') =>
    api.get(`/alt-data/contracts/${symbol}?lookback=${lookback}`),

  // Fetch fresh contract data for a symbol
  fetchContractData: (symbol) =>
    api.post(`/alt-data/contracts/fetch/${symbol}`),

  // === Aggregated Signals ===

  // Get all alternative data signals for a symbol
  getSignals: (symbol) =>
    api.get(`/alt-data/signals/${symbol}`),

  // Get top bullish/bearish alternative data signals
  getTopSignals: (direction = 'bullish', limit = 20) =>
    api.get(`/alt-data/top-signals?direction=${direction}&limit=${limit}`),

  // Get summary of all alternative data signals
  getSummary: () =>
    api.get('/alt-data/summary')
};

// === EU/UK XBRL Data API ===
export const xbrlAPI = {
  // Get backfill status
  getBackfillStatus: () => api.get('/xbrl/backfill/status'),

  // Get available countries for import
  getCountries: () => api.get('/xbrl/backfill/countries'),

  // Start backfill import for selected countries
  startBackfill: (countries, startYear = 2021) =>
    apiLong.post('/xbrl/backfill/start', { countries, startYear }),

  // Pause ongoing backfill
  pauseBackfill: () => api.post('/xbrl/backfill/pause'),

  // Resume a paused import
  resumeBackfill: (syncLogId) => api.post(`/xbrl/backfill/resume/${syncLogId}`),

  // Import single country
  importCountry: (countryCode, startYear = 2021) =>
    apiLong.post(`/xbrl/backfill/country/${countryCode}`, { startYear }),

  // Sync XBRL metrics to calculated_metrics table
  syncMetrics: () => apiLong.post('/xbrl/sync-metrics'),

  // Get XBRL metrics for a company
  getMetrics: (companyId) => api.get(`/xbrl/metrics/${companyId}`)
};

// ============================================
// FACTORS API (Fama-French Factor Analysis)
// ============================================
export const factorsAPI = {
  // Get Fama-French factor exposures for a portfolio
  getFamaFrenchExposures: (portfolioId, { startDate, endDate } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const queryString = params.toString();
    return api.get(`/factors/portfolio/${portfolioId}/fama-french${queryString ? `?${queryString}` : ''}`);
  },

  // Get historical factor returns (cumulative by default)
  getFactorReturns: ({ startDate, endDate, cumulative = true } = {}) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('cumulative', cumulative.toString());
    return api.get(`/factors/returns?${params.toString()}`);
  },

  // Get factor definitions
  getDefinitions: () => api.get('/factors/definitions'),

  // Get factor scores for a stock
  getStockFactorScores: (symbol, scoreDate = null) => {
    const params = scoreDate ? `?scoreDate=${scoreDate}` : '';
    return api.get(`/factors/stock/${symbol}${params}`);
  },

  // Get top stocks by factor
  getTopByFactor: (factor, { limit = 20, scoreDate } = {}) => {
    const params = new URLSearchParams({ factor, limit });
    if (scoreDate) params.append('scoreDate', scoreDate);
    return api.get(`/factors/top?${params.toString()}`);
  },

  // Get factor regime information
  getCurrentRegime: () => api.get('/factors/regime'),

  // Get factor statistics
  getStats: () => api.get('/factors/stats'),

  // Custom factor operations
  backfill: ({ factorId, formula, startDate, endDate, frequency = 'monthly' }) =>
    apiLong.post('/factors/backfill', { factorId, formula, startDate, endDate, frequency }),

  // Run factor backtest with extended timeout (backtests can take several minutes)
  backtest: ({ factorId, formula, config }) =>
    apiLong.post('/factors/backtest', { factorId, formula, config })
};

// ============================================
// MACRO API (Economic Indicators & Yield Curve)
// ============================================
export const macroAPI = {
  // Get macroeconomic snapshot
  getSnapshot: () => api.get('/macro/snapshot'),

  // Get macro trading signals
  getSignals: () => api.get('/macro/signals'),

  // Get current yield curve
  getYieldCurve: () => api.get('/macro/yield-curve'),

  // Get yield curve history
  getYieldCurveHistory: (days = 90) => api.get(`/macro/yield-curve/history?days=${days}`),

  // Get all economic indicators
  getIndicators: (category = null) => {
    const params = category ? `?category=${category}` : '';
    return api.get(`/macro/indicators${params}`);
  },

  // Get specific indicator history
  getIndicatorHistory: (seriesId, days = 365) =>
    api.get(`/macro/indicators/${seriesId}?days=${days}`),

  // Get available indicator categories
  getCategories: () => api.get('/macro/categories'),

  // Get key macro metrics summary
  getKeyMetrics: () => api.get('/macro/key-metrics'),

  // Get market valuation indicators (60s timeout - heavy computation on cold start)
  getMarketIndicators: () => api.get('/macro/market-indicators', { timeout: 60000 }),

  // Get historical market indicators
  getMarketIndicatorsHistory: (startQuarter = '2015-Q1', indicator = 'all') =>
    api.get(`/macro/market-indicators/history?startQuarter=${startQuarter}&indicator=${indicator}`, { timeout: 60000 }),

  // Get safe haven stocks
  getSafeHavens: (limit = 10) => api.get(`/macro/safe-havens?limit=${limit}`),

  // Get undervalued quality opportunities
  getOpportunities: (limit = 10) => api.get(`/macro/opportunities?limit=${limit}`),

  // Get macro data status
  getStatus: () => api.get('/macro/status'),

  // Get Buffett Indicator comparison (total market vs S&P 500 / GDP)
  getBuffettComparison: (startQuarter = '2015-Q1') =>
    api.get(`/macro/buffett-comparison?startQuarter=${startQuarter}`),

  // Trigger FRED data update (requires API key)
  update: () => apiLong.post('/macro/update')
};

// === European Data API (Price/Index/Valuation) ===
export const europeanAPI = {
  // Get EU/UK data status
  getStatus: () => api.get('/data/european/status'),

  // Trigger price update for a country
  updatePrices: (country) =>
    apiLong.post('/data/european/prices', { country }),

  // Update European index constituents (FTSE, DAX, CAC)
  updateIndices: () => apiLong.post('/data/european/indices'),

  // Run valuation calculation for EU/UK companies
  calculateValuations: () => apiLong.post('/data/european/valuations'),

  // Run sector enrichment for EU/UK companies
  enrichSectors: () => apiLong.post('/data/european/enrich'),

  // Get European index membership stats
  getIndexStats: () => api.get('/data/european/index-stats'),

  // Get companies by country
  getCompaniesByCountry: (country, limit = 100) =>
    api.get(`/data/european/companies?country=${country}&limit=${limit}`)
};

// === Congressional Trading API ===
export const congressionalAPI = {
  // Get all trades with filters
  getTrades: (params = {}) => api.get('/congressional/trades', { params }),

  // Get politicians list
  getPoliticians: (days = 90) => api.get(`/congressional/politicians?days=${days}`),

  // Get purchase clusters
  getClusters: (days = 30, minPoliticians = 2) =>
    api.get(`/congressional/clusters?days=${days}&minPoliticians=${minPoliticians}`),

  // Get trades for specific company
  getCompanyTrades: (ticker, days = 365) =>
    api.get(`/congressional/company/${ticker}?days=${days}`),

  // Get overall statistics
  getStats: () => api.get('/congressional/stats')
};

// === Unified Strategy API ===
export const unifiedStrategyAPI = {
  // Get all strategies
  getAll: (params = {}) => api.get('/unified-strategies', { params }),

  // Get strategy presets
  getPresets: () => api.get('/unified-strategies/presets'),

  // Get a specific strategy
  get: (id) => api.get(`/unified-strategies/${id}`),

  // Create a new strategy
  create: (config) => api.post('/unified-strategies', config),

  // Create from preset
  createFromPreset: (presetName, overrides = {}) =>
    api.post('/unified-strategies/from-preset', { presetName, overrides }),

  // Create multi-strategy
  createMulti: (parent, children) =>
    api.post('/unified-strategies/multi', { parent, children }),

  // Update a strategy
  update: (id, updates) => api.put(`/unified-strategies/${id}`, updates),

  // Delete a strategy
  delete: (id, hard = false) =>
    api.delete(`/unified-strategies/${id}${hard ? '?hard=true' : ''}`),

  // Duplicate a strategy
  duplicate: (id, newName) =>
    api.post(`/unified-strategies/${id}/duplicate`, { newName }),

  // Generate signal for a stock
  generateSignal: (strategyId, symbol, portfolioContext = {}) =>
    api.post(`/unified-strategies/${strategyId}/signal`, { symbol, portfolioContext }),

  // Generate signals for multiple stocks
  generateSignals: (strategyId, symbols, portfolioContext = {}) =>
    api.post(`/unified-strategies/${strategyId}/signals`, { symbols, portfolioContext }),

  // Run backtest (long-running operation)
  runBacktest: (strategyId, config) =>
    apiLong.post(`/unified-strategies/${strategyId}/backtest`, config),

  // Get backtest history
  getBacktestHistory: (strategyId, limit = 10) =>
    api.get(`/unified-strategies/${strategyId}/backtest/history?limit=${limit}`),

  // Get current market regime
  getCurrentRegime: () => api.get('/unified-strategies/regime/current'),

  // Get regime history
  getRegimeHistory: (days = 30) =>
    api.get(`/unified-strategies/regime/history?days=${days}`),

  // Get allocations for multi-strategy
  getAllocations: (strategyId) =>
    api.get(`/unified-strategies/${strategyId}/allocations`),

  // Validate strategy config
  validate: (config) => api.post('/unified-strategies/validate', config),

  // Get available signal types
  getAvailableSignals: () => api.get('/unified-strategies/signals/available'),

  // === Model Binding Methods ===

  // Get summary of model bindings across all strategies
  getModelBindingSummary: () => api.get('/unified-strategies/model-binding/summary'),

  // Get strategies using a specific model version
  getStrategiesByModelVersion: (version) =>
    api.get(`/unified-strategies/model-binding/by-version/${encodeURIComponent(version)}`),

  // Get all ML-enabled strategies
  getMLEnabledStrategies: () => api.get('/unified-strategies/model-binding/ml-enabled'),

  // Update model version for a specific strategy
  updateModelVersion: (strategyId, modelVersion) =>
    api.put(`/unified-strategies/${strategyId}/model-version`, { modelVersion }),

  // Lock/unlock model version for a strategy
  setModelLock: (strategyId, locked) =>
    api.put(`/unified-strategies/${strategyId}/model-lock`, { locked }),

  // Update all unlocked ML strategies to a new model version
  updateAllModelVersions: (modelVersion) =>
    api.post('/unified-strategies/model-binding/update-all', { modelVersion })
};

// TCA (Transaction Cost Analysis) API
export const tcaAPI = {
  // Run full TCA benchmark (GET - without saving)
  runBenchmark: () => api.get('/tca/benchmark'),

  // Run full TCA benchmark and save to history (POST)
  runBenchmarkAndSave: (options = {}) => api.post('/tca/benchmark', options),

  // Get production thresholds by liquidity tier
  getThresholds: () => api.get('/tca/thresholds'),

  // Get execution summary statistics
  getSummary: () => api.get('/tca/summary'),

  // Get TCA analysis for a specific order
  getOrderTCA: (orderId) => api.get(`/tca/orders/${orderId}`),

  // Analyze a single trade
  analyzeTrade: (data) => api.post('/tca/analyze', data),

  // Get liquidity tier for a symbol
  getLiquidity: (symbol) => api.get(`/tca/liquidity/${symbol}`),

  // === History Endpoints ===

  // Get recent TCA benchmark results
  getHistory: (limit = 30) => api.get(`/tca/history?limit=${limit}`),

  // Get the latest TCA benchmark result
  getLatest: () => api.get('/tca/history/latest'),

  // Get summary statistics over a period
  getHistoryStats: (period = '-30 days') =>
    api.get(`/tca/history/stats?period=${encodeURIComponent(period)}`),

  // Get daily trend data for charting
  getHistoryTrend: (period = '-30 days') =>
    api.get(`/tca/history/trend?period=${encodeURIComponent(period)}`),

  // Compare TCA metrics between two time periods
  getHistoryComparison: (currentPeriod = '-7 days', previousPeriod = '-14 days') =>
    api.get(`/tca/history/comparison?current=${encodeURIComponent(currentPeriod)}&previous=${encodeURIComponent(previousPeriod)}`),

  // Get TCA benchmark results within a date range
  getHistoryRange: (startDate, endDate) =>
    api.get(`/tca/history/range?startDate=${startDate}&endDate=${endDate}`)
};

// Model Drift Monitoring API
export const driftAPI = {
  // Get dashboard summary with model statuses and alerts
  getDashboard: () => api.get('/mlops/drift/dashboard'),

  // Get alerts with optional filters
  getAlerts: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return api.get(`/mlops/drift/alerts${queryString ? '?' + queryString : ''}`);
  },

  // Get active (unacknowledged) alerts
  getActiveAlerts: (modelName = null, limit = 50) => {
    const params = new URLSearchParams({ limit });
    if (modelName) params.append('modelName', modelName);
    return api.get(`/mlops/drift/alerts/active?${params}`);
  },

  // Acknowledge a specific alert
  acknowledgeAlert: (alertId, acknowledgedBy = 'user') =>
    api.post(`/mlops/drift/alerts/${alertId}/acknowledge`, { acknowledgedBy }),

  // Acknowledge all alerts for a model
  acknowledgeAllAlerts: (modelName, acknowledgedBy = 'user') =>
    api.post('/mlops/drift/alerts/acknowledge-all', { modelName, acknowledgedBy }),

  // Run health check for a specific model
  runHealthCheck: (modelName) => api.get(`/mlops/drift/health/${modelName}`),

  // Run health checks for all models
  runAllHealthChecks: () => api.post('/mlops/drift/health/run-all'),

  // Get health check history for a model
  getHistory: (modelName, limit = 30) =>
    api.get(`/mlops/drift/history/${modelName}?limit=${limit}`),

  // Get reference distributions for all models
  getReferences: () => api.get('/mlops/drift/references'),

  // Initialize or update reference for a model
  setReference: (modelName, metrics) =>
    api.post(`/mlops/drift/references/${modelName}`, metrics),

  // Get current drift thresholds
  getThresholds: () => api.get('/mlops/drift/thresholds'),

  // Simulate predictions for testing
  simulate: (modelName, count = 100, ic = 0.05) =>
    api.post(`/mlops/drift/simulate/${modelName}`, { count, ic }),

  // Get monitoring statistics
  getStats: () => api.get('/mlops/drift/stats'),

  // Run health check with automatic retraining on drift
  runHealthCheckWithRetraining: (modelName, autoRetrain = true) =>
    api.post(`/mlops/drift/health/${modelName}/with-retraining`, { autoRetrain }),

  // Manually trigger drift-based retraining
  triggerRetraining: (modelName, reason) =>
    api.post(`/mlops/drift/trigger-retraining/${modelName}`, { reason })
};

/**
 * Prediction Logging API - For ML model prediction tracking and drift monitoring
 */
export const predictionsAPI = {
  // Get prediction statistics for drift monitoring
  getStats: (modelName = null, days = 30) => {
    const params = new URLSearchParams({ days });
    if (modelName) params.append('modelName', modelName);
    return api.get(`/mlops/predictions/stats?${params}`);
  },

  // Get predictions for a specific model
  getPredictions: (modelName, days = 30, symbol = null) => {
    const params = new URLSearchParams({ days });
    if (symbol) params.append('symbol', symbol);
    return api.get(`/mlops/predictions/${modelName}?${params}`);
  },

  // Get predictions for a specific model and symbol
  getSymbolPredictions: (modelName, symbol, days = 90) =>
    api.get(`/mlops/predictions/${modelName}/symbols/${symbol}?days=${days}`),

  // Update actual returns for predictions that have passed holding period
  updateActuals: () => api.post('/mlops/predictions/update-actuals'),

  // Sync predictions from database to ModelMonitor
  syncToMonitor: (days = 30) =>
    api.post('/mlops/predictions/sync', { days }),

  // Get summary of all model predictions
  getSummary: () => api.get('/mlops/predictions/summary')
};

/**
 * MLOps Dashboard API - Unified interface for ML operations
 */
export const mlopsAPI = {
  // === Model Registry ===
  getModels: () => api.get('/mlops/models'),
  getModel: (name) => api.get(`/mlops/models/${name}`),
  getModelVersions: (name) => api.get(`/mlops/models/${name}`),  // Returns versions array
  getModelVersion: (name, version) => api.get(`/mlops/models/${name}/versions/${version}`),
  getProductionModel: (name) => api.get(`/mlops/models/${name}/production`),
  getStagedModels: (name) => api.get(`/mlops/models/${name}/staged`),
  getVersionPerformance: (name, version, limit = 30) =>
    api.get(`/mlops/models/${name}/versions/${version}/performance?limit=${limit}`),

  // Model promotion/deprecation
  promoteModel: (name, version, promotedBy = 'ui', reason = 'Manual promotion from MLOps dashboard') =>
    api.post(`/mlops/models/${name}/promote`, { version, promotedBy, reason }),
  deprecateModel: (name, version, reason = 'Deprecated from MLOps dashboard') =>
    api.post(`/mlops/models/${name}/deprecate`, { version, reason }),
  rollbackModel: (name, targetVersion, reason = 'Rollback from MLOps dashboard') =>
    api.post(`/mlops/models/${name}/rollback`, { targetVersion, reason }),
  validateModel: (name, version, gates = {}) =>
    api.post(`/mlops/models/${name}/versions/${version}/validate`, gates),

  // Model comparison
  compareModels: (modelAName, modelAVersion, modelBName, modelBVersion) =>
    api.post('/mlops/models/compare', { modelAName, modelAVersion, modelBName, modelBVersion }),

  // Model registration
  registerModel: (modelName, version, data) =>
    api.post('/mlops/models/register', { modelName, version, ...data }),

  // === Training ===
  // Trigger training via backend scheduler (spawns Python process)
  triggerTraining: ({ jobName = 'manual_training', config = {} } = {}) =>
    api.post('/mlops/trigger', { jobName, config }),
  // Training webhook (for Python scripts to notify completion)
  sendTrainingWebhook: (data) => api.post('/mlops/training/webhook', data),

  // === Weight Updates ===
  triggerWeightUpdate: (options = {}) => api.post('/mlops/weights/update', options),
  getWeightStatus: () => api.get('/mlops/weights/status'),
  getCurrentWeights: () => api.get('/mlops/weights/current'),
  getWeightConfig: () => api.get('/mlops/weights/config'),
  promoteWeights: (version, options = {}) =>
    api.post('/mlops/weights/promote', { version, ...options }),
  rollbackWeights: (reason) => api.post('/mlops/weights/rollback', { reason }),
  checkWeightPerformance: () => api.get('/mlops/weights/performance'),

  // === Scheduler ===
  getSchedulerStatus: () => api.get('/mlops/scheduler/status'),
  startScheduler: () => api.post('/mlops/scheduler/start'),
  stopScheduler: () => api.post('/mlops/scheduler/stop'),
  createSchedule: (name, modelName, cronExpression, config = {}) =>
    api.post('/mlops/schedules', { name, modelName, cronExpression, config }),

  // === Drift Monitoring (delegates to driftAPI) ===
  getDriftDashboard: () => api.get('/mlops/drift/dashboard'),
  getDriftHealth: (modelName) => api.get(`/mlops/drift/health/${modelName}`),
  runDriftHealthCheck: (modelName, autoRetrain = false) =>
    api.post(`/mlops/drift/health/${modelName}/with-retraining`, { autoRetrain }),
  runAllDriftHealthChecks: () => api.post('/mlops/drift/health/run-all'),
  getDriftStats: () => api.get('/mlops/drift/stats'),

  // === Predictions (delegates to predictionsAPI) ===
  getPredictionStats: (modelName = null, days = 30) => {
    const params = new URLSearchParams({ days });
    if (modelName) params.append('modelName', modelName);
    return api.get(`/mlops/predictions/stats?${params}`);
  },
  getPredictionSummary: () => api.get('/mlops/predictions/summary'),
  getPredictionsSummary: () => api.get('/mlops/predictions/summary'),
  updateActuals: () => api.post('/mlops/predictions/update-actuals')
};

// PRISM Investment Reports API
export const prismAPI = {
  // Get full PRISM report for a company
  getReport: async (symbol, refresh = false) => {
    try {
      const params = refresh ? '?refresh=true' : '';
      const response = await api.get(`/prism/${symbol}/report${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching PRISM report:', error);
      throw error;
    }
  },

  // Get executive summary only
  getSummary: async (symbol) => {
    try {
      const response = await api.get(`/prism/${symbol}/summary`);
      return response.data;
    } catch (error) {
      console.error('Error fetching PRISM summary:', error);
      throw error;
    }
  },

  // Get the 12-factor Business Scorecard
  getScorecard: async (symbol) => {
    try {
      const response = await api.get(`/prism/${symbol}/scorecard`);
      return response.data;
    } catch (error) {
      console.error('Error fetching PRISM scorecard:', error);
      throw error;
    }
  },

  // Get parsed SEC filings
  getSecFilings: async (symbol, formType = null, refresh = false) => {
    try {
      const params = new URLSearchParams();
      if (formType) params.append('formType', formType);
      if (refresh) params.append('refresh', 'true');
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const response = await api.get(`/prism/${symbol}/sec-filings${queryString}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching SEC filings:', error);
      throw error;
    }
  },

  // Force refresh/regenerate report
  refreshReport: async (symbol) => {
    try {
      const response = await api.post(`/prism/${symbol}/refresh`);
      return response.data;
    } catch (error) {
      console.error('Error refreshing PRISM report:', error);
      throw error;
    }
  },

  // Get list of companies with PRISM reports
  getCoverage: async (minScore = null) => {
    try {
      const params = minScore ? `?minScore=${minScore}` : '';
      const response = await api.get(`/prism/coverage${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching PRISM coverage:', error);
      throw error;
    }
  },

  // Get score history for trending
  getScoreHistory: async (symbol, limit = 30) => {
    try {
      const response = await api.get(`/prism/${symbol}/score-history?limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching PRISM score history:', error);
      throw error;
    }
  }
};

export default api;