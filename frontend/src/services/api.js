// frontend/src/services/api.js
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});

export const companyAPI = {
  getAll: (params = {}) => api.get('/companies', { params }),
  getOne: (symbol) => api.get(`/companies/${symbol}`),
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

export default api;