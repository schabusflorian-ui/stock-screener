// src/data/lazy-portfolios.js
// Pre-defined "lazy" portfolio allocations

/**
 * Lazy Portfolio Definition
 * @typedef {Object} LazyPortfolio
 * @property {string} name - Display name
 * @property {string} slug - URL-safe identifier
 * @property {string} description - Short description
 * @property {string} source - Attribution (author, book, etc.)
 * @property {number} riskLevel - 1-10 scale (1=very conservative, 10=very aggressive)
 * @property {boolean} isFeatured - Show in featured list
 * @property {Object[]} allocations - ETF allocations
 */

const LAZY_PORTFOLIOS = [
  // =========================================================================
  // CLASSIC PORTFOLIOS
  // =========================================================================
  {
    name: 'Three-Fund Portfolio',
    slug: 'three-fund',
    description: 'Classic Bogleheads approach: US stocks, international stocks, bonds. Simple, low-cost diversification.',
    source: 'Bogleheads',
    riskLevel: 6,
    isFeatured: true,
    allocations: [
      { symbol: 'VTI', weight: 0.50, assetClass: 'US Equity' },
      { symbol: 'VXUS', weight: 0.30, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.20, assetClass: 'US Bonds' }
    ]
  },
  {
    name: 'All Weather Portfolio',
    slug: 'all-weather',
    description: "Ray Dalio's risk parity approach designed to perform in any economic environment.",
    source: 'Ray Dalio / Bridgewater',
    riskLevel: 4,
    isFeatured: true,
    allocations: [
      { symbol: 'VTI', weight: 0.30, assetClass: 'US Equity' },
      { symbol: 'TLT', weight: 0.40, assetClass: 'Long-Term Treasury' },
      { symbol: 'IEF', weight: 0.15, assetClass: 'Intermediate Treasury' },
      { symbol: 'GLD', weight: 0.075, assetClass: 'Gold' },
      { symbol: 'GSG', weight: 0.075, assetClass: 'Commodities' }
    ]
  },
  {
    name: 'Permanent Portfolio',
    slug: 'permanent-portfolio',
    description: "Harry Browne's equal-weight approach to weather any economic cycle: prosperity, inflation, deflation, recession.",
    source: 'Harry Browne',
    riskLevel: 3,
    isFeatured: true,
    allocations: [
      { symbol: 'VTI', weight: 0.25, assetClass: 'US Equity' },
      { symbol: 'TLT', weight: 0.25, assetClass: 'Long-Term Treasury' },
      { symbol: 'GLD', weight: 0.25, assetClass: 'Gold' },
      { symbol: 'SHY', weight: 0.25, assetClass: 'Short-Term Treasury' }
    ]
  },
  {
    name: 'Golden Butterfly',
    slug: 'golden-butterfly',
    description: 'Permanent Portfolio with small cap value tilt for enhanced returns while maintaining stability.',
    source: 'Portfolio Charts',
    riskLevel: 4,
    isFeatured: true,
    allocations: [
      { symbol: 'VTI', weight: 0.20, assetClass: 'US Equity' },
      { symbol: 'VBR', weight: 0.20, assetClass: 'US Small Value' },
      { symbol: 'TLT', weight: 0.20, assetClass: 'Long-Term Treasury' },
      { symbol: 'SHY', weight: 0.20, assetClass: 'Short-Term Treasury' },
      { symbol: 'GLD', weight: 0.20, assetClass: 'Gold' }
    ]
  },

  // =========================================================================
  // RISK-BASED ALLOCATIONS
  // =========================================================================
  {
    name: 'Conservative (30/70)',
    slug: 'conservative',
    description: 'Low-risk portfolio for capital preservation with 30% stocks and 70% bonds.',
    source: 'Traditional Allocation',
    riskLevel: 2,
    isFeatured: false,
    allocations: [
      { symbol: 'VTI', weight: 0.21, assetClass: 'US Equity' },
      { symbol: 'VXUS', weight: 0.09, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.49, assetClass: 'US Bonds' },
      { symbol: 'BNDX', weight: 0.21, assetClass: 'International Bonds' }
    ]
  },
  {
    name: 'Moderate (60/40)',
    slug: 'moderate',
    description: 'Balanced portfolio with 60% stocks and 40% bonds for moderate growth and income.',
    source: 'Traditional Allocation',
    riskLevel: 5,
    isFeatured: true,
    allocations: [
      { symbol: 'VTI', weight: 0.36, assetClass: 'US Equity' },
      { symbol: 'VXUS', weight: 0.24, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.28, assetClass: 'US Bonds' },
      { symbol: 'BNDX', weight: 0.12, assetClass: 'International Bonds' }
    ]
  },
  {
    name: 'Aggressive (80/20)',
    slug: 'aggressive',
    description: 'Growth-focused for higher risk tolerance with 80% stocks and 20% bonds.',
    source: 'Traditional Allocation',
    riskLevel: 8,
    isFeatured: false,
    allocations: [
      { symbol: 'VTI', weight: 0.48, assetClass: 'US Equity' },
      { symbol: 'VXUS', weight: 0.32, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.14, assetClass: 'US Bonds' },
      { symbol: 'BNDX', weight: 0.06, assetClass: 'International Bonds' }
    ]
  },
  {
    name: 'All Equity',
    slug: 'all-equity',
    description: '100% stocks for maximum growth potential. Long time horizon required.',
    source: 'Traditional Allocation',
    riskLevel: 10,
    isFeatured: false,
    allocations: [
      { symbol: 'VTI', weight: 0.60, assetClass: 'US Equity' },
      { symbol: 'VXUS', weight: 0.40, assetClass: 'International Equity' }
    ]
  },

  // =========================================================================
  // INCOME-FOCUSED
  // =========================================================================
  {
    name: 'Dividend Growth',
    slug: 'dividend-growth',
    description: 'Focus on companies with growing dividends for reliable income and appreciation.',
    source: 'Dividend Investing',
    riskLevel: 5,
    isFeatured: true,
    allocations: [
      { symbol: 'SCHD', weight: 0.30, assetClass: 'US Dividend' },
      { symbol: 'VIG', weight: 0.20, assetClass: 'US Dividend' },
      { symbol: 'VYM', weight: 0.15, assetClass: 'US Dividend' },
      { symbol: 'VXUS', weight: 0.15, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.20, assetClass: 'US Bonds' }
    ]
  },
  {
    name: 'High Yield Income',
    slug: 'high-yield-income',
    description: 'Maximizes current income from dividends and bond yields.',
    source: 'Income Investing',
    riskLevel: 6,
    isFeatured: false,
    allocations: [
      { symbol: 'VYM', weight: 0.25, assetClass: 'US Dividend' },
      { symbol: 'SCHD', weight: 0.20, assetClass: 'US Dividend' },
      { symbol: 'VNQ', weight: 0.15, assetClass: 'Real Estate' },
      { symbol: 'HYG', weight: 0.20, assetClass: 'High Yield Bonds' },
      { symbol: 'EMB', weight: 0.10, assetClass: 'EM Bonds' },
      { symbol: 'BND', weight: 0.10, assetClass: 'US Bonds' }
    ]
  },

  // =========================================================================
  // FACTOR-TILTED
  // =========================================================================
  {
    name: 'Small Cap Value Tilt',
    slug: 'small-cap-value',
    description: 'Tilts toward small cap value for historically higher expected returns.',
    source: 'Factor Investing',
    riskLevel: 7,
    isFeatured: false,
    allocations: [
      { symbol: 'VTI', weight: 0.30, assetClass: 'US Equity' },
      { symbol: 'VBR', weight: 0.25, assetClass: 'US Small Value' },
      { symbol: 'AVUV', weight: 0.15, assetClass: 'US Small Value' },
      { symbol: 'VEA', weight: 0.15, assetClass: 'International Developed' },
      { symbol: 'BND', weight: 0.15, assetClass: 'US Bonds' }
    ]
  },
  {
    name: 'Quality + Momentum',
    slug: 'quality-momentum',
    description: 'Combines quality and momentum factors for market-beating potential.',
    source: 'Factor Investing',
    riskLevel: 7,
    isFeatured: false,
    allocations: [
      { symbol: 'QUAL', weight: 0.30, assetClass: 'Quality Factor' },
      { symbol: 'MTUM', weight: 0.30, assetClass: 'Momentum Factor' },
      { symbol: 'VXUS', weight: 0.20, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.20, assetClass: 'US Bonds' }
    ]
  },

  // =========================================================================
  // ALTERNATIVE STRATEGIES
  // =========================================================================
  {
    name: 'Crisis Alpha',
    slug: 'crisis-alpha',
    description: 'Includes managed futures for crisis protection and diversification.',
    source: 'Tail Risk Management',
    riskLevel: 6,
    isFeatured: false,
    allocations: [
      { symbol: 'VTI', weight: 0.45, assetClass: 'US Equity' },
      { symbol: 'VXUS', weight: 0.15, assetClass: 'International Equity' },
      { symbol: 'BND', weight: 0.15, assetClass: 'US Bonds' },
      { symbol: 'DBMF', weight: 0.15, assetClass: 'Managed Futures' },
      { symbol: 'GLD', weight: 0.10, assetClass: 'Gold' }
    ]
  },
  {
    name: 'Inflation Protection',
    slug: 'inflation-protection',
    description: 'Designed to protect purchasing power during inflationary periods.',
    source: 'Inflation Hedging',
    riskLevel: 5,
    isFeatured: false,
    allocations: [
      { symbol: 'VTI', weight: 0.30, assetClass: 'US Equity' },
      { symbol: 'TIP', weight: 0.25, assetClass: 'TIPS' },
      { symbol: 'VNQ', weight: 0.15, assetClass: 'Real Estate' },
      { symbol: 'GSG', weight: 0.15, assetClass: 'Commodities' },
      { symbol: 'GLD', weight: 0.15, assetClass: 'Gold' }
    ]
  },

  // =========================================================================
  // RETIREMENT-FOCUSED
  // =========================================================================
  {
    name: 'Retirement Income',
    slug: 'retirement-income',
    description: 'Conservative allocation for retirees prioritizing income and capital preservation.',
    source: 'Retirement Planning',
    riskLevel: 3,
    isFeatured: false,
    allocations: [
      { symbol: 'SCHD', weight: 0.20, assetClass: 'US Dividend' },
      { symbol: 'VYM', weight: 0.10, assetClass: 'US Dividend' },
      { symbol: 'BND', weight: 0.35, assetClass: 'US Bonds' },
      { symbol: 'VCIT', weight: 0.15, assetClass: 'Corporate Bonds' },
      { symbol: 'TIP', weight: 0.10, assetClass: 'TIPS' },
      { symbol: 'VGSH', weight: 0.10, assetClass: 'Short Treasury' }
    ]
  },

  // =========================================================================
  // SECTOR ROTATION
  // =========================================================================
  {
    name: 'Tech & Growth',
    slug: 'tech-growth',
    description: 'Overweight technology and growth sectors for maximum growth exposure.',
    source: 'Sector Investing',
    riskLevel: 9,
    isFeatured: false,
    allocations: [
      { symbol: 'QQQ', weight: 0.40, assetClass: 'Growth Equity' },
      { symbol: 'XLK', weight: 0.25, assetClass: 'Technology' },
      { symbol: 'VUG', weight: 0.20, assetClass: 'Growth Equity' },
      { symbol: 'ARKK', weight: 0.15, assetClass: 'Innovation' }
    ]
  }
];

/**
 * Get portfolio by slug
 * @param {string} slug
 * @returns {Object|undefined}
 */
function getPortfolioBySlug(slug) {
  return LAZY_PORTFOLIOS.find(p => p.slug === slug);
}

/**
 * Get featured portfolios
 * @returns {Object[]}
 */
function getFeaturedPortfolios() {
  return LAZY_PORTFOLIOS.filter(p => p.isFeatured);
}

/**
 * Get portfolios by risk level range
 * @param {number} minRisk
 * @param {number} maxRisk
 * @returns {Object[]}
 */
function getPortfoliosByRiskLevel(minRisk, maxRisk) {
  return LAZY_PORTFOLIOS.filter(p => p.riskLevel >= minRisk && p.riskLevel <= maxRisk);
}

/**
 * Calculate weighted expense ratio for a portfolio
 * @param {Object} portfolio
 * @param {Map<string, number>} expenseRatios - Map of symbol to expense ratio
 * @returns {number}
 */
function calculatePortfolioExpenseRatio(portfolio, expenseRatios) {
  let totalExpense = 0;
  for (const alloc of portfolio.allocations) {
    const er = expenseRatios.get(alloc.symbol) || 0;
    totalExpense += er * alloc.weight;
  }
  return totalExpense;
}

module.exports = {
  LAZY_PORTFOLIOS,
  getPortfolioBySlug,
  getFeaturedPortfolios,
  getPortfoliosByRiskLevel,
  calculatePortfolioExpenseRatio
};
