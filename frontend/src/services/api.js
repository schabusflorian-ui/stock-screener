// frontend/src/services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/api`
  : 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  withCredentials: true // Enable credentials for session cookies
});

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login on auth failure
      window.location.href = '/login';
    }
    return Promise.reject(error);
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
  moats: (limit) => api.get(`/screening/moats${limit ? `?limit=${limit}` : ''}`)
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
    if (options.status) params.append('status', options.status);
    if (options.sector) params.append('sector', options.sector);
    if (options.sortBy) params.append('sortBy', options.sortBy);
    if (options.sortOrder) params.append('sortOrder', options.sortOrder);
    if (options.limit) params.append('limit', options.limit);
    return api.get(`/ipo/pipeline?${params.toString()}`);
  },
  getByStage: () => api.get('/ipo/by-stage'),
  getUpcoming: () => api.get('/ipo/upcoming'),
  getRecent: (limit = 20) => api.get(`/ipo/recent?limit=${limit}`),

  // Statistics and metadata
  getStatistics: () => api.get('/ipo/statistics'),
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
    api.post(`/sentiment/${symbol}/refresh`, {}, { timeout: 120000 }),

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
  getTrending: (period = '24h', limit = 20, refresh = false) =>
    api.get(`/sentiment/trending?period=${period}&limit=${limit}&refresh=${refresh}`, {
      timeout: refresh ? 180000 : 30000 // 3 min for refresh, 30s for cached
    }),

  // Get sentiment signals for multiple stocks (watchlist)
  getBatchSignals: (symbols) =>
    api.get(`/sentiment/batch/signals?symbols=${symbols.join(',')}`),

  // Get news sentiment for a stock
  getNews: (symbol, { limit = 20, refresh = false } = {}) =>
    api.get(`/sentiment/${symbol}/news?limit=${limit}&refresh=${refresh}`),

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
  getCombined: (symbol, refresh = false) =>
    api.get(`/sentiment/${symbol}/combined?refresh=${refresh}`, {
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
    api.get(`/sentiment/${symbol}/analyst/history?limit=${limit}`)
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
  getAlphaTimeseries: (symbol, period = '1y') =>
    api.get(`/indices/alpha/timeseries/${symbol}?period=${period}`),

  // Get stocks outperforming the market
  getOutperformers: (period = 'ytd', limit = 50) =>
    api.get(`/prices/screen/outperformers?period=${period}&limit=${limit}`),

  // Get stocks underperforming the market
  getUnderperformers: (period = 'ytd', limit = 50) =>
    api.get(`/prices/screen/underperformers?period=${period}&limit=${limit}`),

  // Trigger index price update (admin)
  update: () => api.post('/indices/update', {}, { timeout: 120000 }),

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

  // Trigger quarterly update
  run: async (quarter, forceFullUpdate = false) => {
    const response = await api.post('/updates/run', { quarter, forceFullUpdate });
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
  run: () => api.post('/price-updates/run'),

  // Run dry-run to see what would be updated
  dryRun: () => api.post('/price-updates/dry-run', {}, { timeout: 60000 }),

  // Run backfill for stale companies
  backfill: () => api.post('/price-updates/backfill'),

  // Recalculate company tier assignments
  recalculateTiers: () => api.post('/price-updates/recalculate-tiers', {}, { timeout: 120000 })
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
  getConfig: () => api.get('/alerts/config')
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

  // Get sensitivity analysis matrix
  getSensitivity: (symbol) =>
    api.get(`/dcf/${symbol}/sensitivity`, { timeout: 60000 }),

  // Get historical DCF valuations
  getHistory: (symbol, limit = 10) =>
    api.get(`/dcf/${symbol}/history?limit=${limit}`),

  // Get industry benchmarks
  getBenchmarks: (industry) =>
    api.get(`/dcf/benchmarks/${encodeURIComponent(industry)}`),

  // Get all industry benchmarks
  getAllBenchmarks: () =>
    api.get('/dcf/benchmarks')
};

// ============================================
// ETF and Model Portfolio API
// ============================================
export const etfsAPI = {
  // Get all ETFs
  getAll: (options = {}) => {
    const params = new URLSearchParams();
    if (options.category) params.append('category', options.category);
    if (options.assetClass) params.append('assetClass', options.assetClass);
    if (options.issuer) params.append('issuer', options.issuer);
    if (options.limit) params.append('limit', options.limit);
    return api.get(`/etfs?${params.toString()}`);
  },

  // Get ETF by symbol
  get: (symbol) => api.get(`/etfs/${symbol}`),

  // Get ETF categories
  getCategories: () => api.get('/etfs/categories'),

  // Get ETF holdings
  getHoldings: (symbol, options = {}) => {
    const params = new URLSearchParams();
    if (options.minWeight) params.append('minWeight', options.minWeight);
    if (options.limit) params.append('limit', options.limit);
    return api.get(`/etfs/${symbol}/holdings?${params.toString()}`);
  },

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
    api.post('/etfs/rebalance', { currentHoldings, targetModel, portfolioValue })
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
  getKellyBacktest: (portfolioId, params = {}) => {
    const { period = '3y', rebalanceFrequency = 'monthly', initialCapital = 100000 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/backtest?period=${period}&rebalanceFrequency=${rebalanceFrequency}&initialCapital=${initialCapital}`, { timeout: 60000 });
  },
  getKellyOptimize: (portfolioId, params = {}) => {
    const { period = '3y', maxWeight = 0.40, minWeight = 0.02, leverageAllowed = false } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/optimize?period=${period}&maxWeight=${maxWeight}&minWeight=${minWeight}&leverageAllowed=${leverageAllowed}`, { timeout: 60000 });
  },
  getKellyRegime: (portfolioId, params = {}) => {
    const { period = '5y', regimeWindow = 60 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/regime?period=${period}&regimeWindow=${regimeWindow}`, { timeout: 60000 });
  },
  getKellyDrawdown: (portfolioId, params = {}) => {
    const { period = '5y', initialCapital = 100000 } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/drawdown?period=${period}&initialCapital=${initialCapital}`, { timeout: 60000 });
  },
  getKellyCompare: (portfolioId, params = {}) => {
    const { period = '5y', initialCapital = 100000, rebalanceFrequency = 'monthly' } = params;
    return api.get(`/simulate/portfolios/${portfolioId}/kelly/compare?period=${period}&initialCapital=${initialCapital}&rebalanceFrequency=${rebalanceFrequency}`, { timeout: 60000 });
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
    api.post('/knowledge/update/refresh', { mode }, { timeout: 300000 }),

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

  // Send a message with streaming response (returns EventSource)
  sendMessageStream: (conversationId, message, companyContext = null, callbacks = {}) => {
    const { onStart, onToken, onComplete, onError, onDone } = callbacks;

    // Build URL with query parameters
    const params = new URLSearchParams({ message });
    if (companyContext) {
      params.append('companyContext', JSON.stringify(companyContext));
    }

    const url = `${API_BASE_URL}/analyst/conversations/${conversationId}/messages/stream?${params.toString()}`;

    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
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
            eventSource.close();
            break;
          case 'done':
            onDone?.();
            eventSource.close();
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Error parsing SSE event:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      onError?.(error);
      eventSource.close();
    };

    // Return the EventSource so caller can close it if needed
    return eventSource;
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
  health: () => api.get('/nl/health')
};

// SEC Direct Refresh API
export const secRefreshAPI = {
  // Get status of SEC direct refresh
  getStatus: () => api.get('/sec-refresh/status'),

  // Run SEC direct refresh
  run: (mode = 'watchlist', symbols = []) =>
    api.post('/sec-refresh/run', { mode, symbols }),

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
  deleteSnapshot: (snapshotId) => api.delete(`/notes/snapshots/${snapshotId}`)
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
    api.post('/historical/refresh-outcomes', { daysOld, limit })
};

export default api;