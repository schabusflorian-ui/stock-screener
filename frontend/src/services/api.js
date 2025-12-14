// frontend/src/services/api.js
import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});

export const companyAPI = {
  getAll: () => api.get('/companies'),
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
  // Preset screens
  buffett: (limit = 50) => api.get(`/screening/buffett?limit=${limit}`),
  value: (limit = 50) => api.get(`/screening/value?limit=${limit}`),
  magic: (limit = 50) => api.get(`/screening/magic?limit=${limit}`),
  quality: (limit = 50) => api.get(`/screening/quality?limit=${limit}`),
  growth: (limit = 50) => api.get(`/screening/growth?limit=${limit}`),
  dividend: (limit = 50) => api.get(`/screening/dividend?limit=${limit}`),
  fortress: (limit = 50) => api.get(`/screening/fortress?limit=${limit}`)
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
    api.get('/insiders/stats')
};

export const capitalAPI = {
  // Get companies with highest shareholder yield
  getTopYield: (limit = 20) =>
    api.get(`/capital/top-yield?limit=${limit}`),

  // Get companies with long dividend increase streaks
  getDividendAristocrats: (minYears = 10) =>
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
    api.get('/capital/sector-comparison')
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

export default api;