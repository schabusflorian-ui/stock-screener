// frontend/src/services/backtestingAPI.js
// Frontend API service for HF-style backtesting framework

import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: `${API_BASE}/backtesting`,
  timeout: 120000 // 2 minutes for long-running analyses
});

// Add response interceptor for error handling
api.interceptors.response.use(
  response => response,
  error => {
    console.error('Backtesting API error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * Walk-Forward Analysis
 */
export const walkForward = {
  /**
   * Run walk-forward optimization analysis
   */
  run: async (params) => {
    const response = await api.post('/walk-forward', params);
    return response.data;
  },

  /**
   * Run Combinatorial Purged Cross-Validation
   */
  runCPCV: async (params) => {
    const response = await api.post('/cpcv', params);
    return response.data;
  },

  /**
   * Get walk-forward history for a portfolio
   */
  getHistory: async (portfolioId, limit = 10) => {
    const response = await api.get(`/walk-forward/${portfolioId}`, { params: { limit } });
    return response.data;
  }
};

/**
 * IC (Information Coefficient) Analysis
 */
export const ic = {
  /**
   * Analyze signal IC with decay curves
   */
  analyze: async (params) => {
    const response = await api.post('/ic-analysis', params);
    return response.data;
  },

  /**
   * Get IC history for a signal type
   */
  getHistory: async (signalType, days = 90) => {
    const response = await api.get(`/ic-history/${signalType}`, { params: { days } });
    return response.data;
  },

  /**
   * Get signal correlation matrix
   */
  getCorrelationMatrix: async (signalTypes, startDate, endDate) => {
    const response = await api.post('/ic-correlation', { signalTypes, startDate, endDate });
    return response.data;
  },

  /**
   * Get all available signal types
   */
  getSignalTypes: async () => {
    const response = await api.get('/signal-types');
    return response.data;
  }
};

/**
 * VaR Backtesting
 */
export const varBacktest = {
  /**
   * Run VaR model validation
   */
  run: async (params) => {
    const response = await api.post('/var-backtest', params);
    return response.data;
  },

  /**
   * Get VaR backtest history
   */
  getHistory: async (portfolioId, limit = 10) => {
    const response = await api.get(`/var-history/${portfolioId}`, { params: { limit } });
    return response.data;
  },

  /**
   * Get VaR exceptions
   */
  getExceptions: async (portfolioId, days = 90) => {
    const response = await api.get(`/var-exceptions/${portfolioId}`, { params: { days } });
    return response.data;
  }
};

/**
 * Alpha Validation / Statistical Testing
 */
export const alpha = {
  /**
   * Run comprehensive alpha validation
   */
  run: async (params) => {
    const response = await api.post('/alpha-validation', params);
    return response.data;
  },

  /**
   * Get alpha validation history
   */
  getHistory: async (portfolioId, limit = 10) => {
    const response = await api.get(`/alpha-history/${portfolioId}`, { params: { limit } });
    return response.data;
  },

  /**
   * Calculate Deflated Sharpe Ratio
   */
  deflatedSharpe: async (params) => {
    const response = await api.post('/deflated-sharpe', params);
    return response.data;
  },

  /**
   * Calculate minimum track record length
   */
  minimumTrackRecord: async (params) => {
    const response = await api.post('/minimum-track-record', params);
    return response.data;
  }
};

/**
 * Stress Testing
 */
export const stress = {
  /**
   * Run historical stress test
   */
  runHistorical: async (params) => {
    const response = await api.post('/stress-test', params);
    return response.data;
  },

  /**
   * Run factor stress test
   */
  runFactor: async (params) => {
    const response = await api.post('/factor-stress', params);
    return response.data;
  },

  /**
   * Run reverse stress test
   */
  runReverse: async (params) => {
    const response = await api.post('/reverse-stress', params);
    return response.data;
  },

  /**
   * Get available stress scenarios
   */
  getScenarios: async () => {
    const response = await api.get('/stress-scenarios');
    return response.data;
  },

  /**
   * Get stress test history
   */
  getHistory: async (portfolioId, limit = 10) => {
    const response = await api.get(`/stress-history/${portfolioId}`, { params: { limit } });
    return response.data;
  }
};

/**
 * Regime Analysis
 */
export const regime = {
  /**
   * Get regime-conditional performance analysis
   */
  analyze: async (portfolioId, startDate, endDate) => {
    const response = await api.get(`/regime-analysis/${portfolioId}`, {
      params: { startDate, endDate }
    });
    return response.data;
  },

  /**
   * Analyze signal performance by regime
   */
  analyzeSignals: async (params) => {
    const response = await api.post('/signal-regime-analysis', params);
    return response.data;
  },

  /**
   * Get current market regime
   */
  getCurrent: async () => {
    const response = await api.get('/current-regime');
    return response.data;
  }
};

/**
 * Execution Analysis
 */
export const execution = {
  /**
   * Simulate order execution
   */
  simulate: async (params) => {
    const response = await api.post('/execution-simulate', params);
    return response.data;
  },

  /**
   * Analyze execution costs
   */
  analyze: async (params) => {
    const response = await api.post('/execution-analysis', params);
    return response.data;
  },

  /**
   * Compare execution strategies (Market vs TWAP vs VWAP)
   */
  compare: async (params) => {
    const response = await api.post('/execution-compare', params);
    return response.data;
  }
};

/**
 * Capacity Analysis
 */
export const capacity = {
  /**
   * Estimate strategy capacity
   */
  estimate: async (params) => {
    const response = await api.post('/capacity', params);
    return response.data;
  },

  /**
   * Calculate liquidity-adjusted returns
   */
  liquidityAdjustedReturns: async (params) => {
    const response = await api.post('/liquidity-adjusted-returns', params);
    return response.data;
  },

  /**
   * Get capacity analysis history
   */
  getHistory: async (portfolioId, limit = 10) => {
    const response = await api.get(`/capacity-history/${portfolioId}`, { params: { limit } });
    return response.data;
  }
};

/**
 * Comprehensive Report
 */
export const report = {
  /**
   * Generate comprehensive backtesting report
   */
  generate: async (portfolioId, startDate, endDate) => {
    const response = await api.post('/comprehensive-report', {
      portfolioId,
      startDate,
      endDate
    });
    return response.data;
  }
};

// Default export with all modules
const backtestingAPI = {
  walkForward,
  ic,
  varBacktest,
  alpha,
  stress,
  regime,
  execution,
  capacity,
  report
};

export default backtestingAPI;
