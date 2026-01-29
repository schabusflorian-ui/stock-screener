// src/data/etf-categories.js
// Hierarchical ETF category definitions

/**
 * ETF Category Definition
 * @typedef {Object} ETFCategory
 * @property {string} name - Display name
 * @property {string} slug - URL-safe identifier
 * @property {string} [parentSlug] - Parent category slug (null for top-level)
 * @property {string} [description] - Category description
 * @property {string} [icon] - Icon identifier for UI
 * @property {number} displayOrder - Sort order within parent
 */

const ETF_CATEGORIES = [
  // =========================================================================
  // Level 0: Asset Classes (Top-Level)
  // =========================================================================
  { name: 'Equity', slug: 'equity', parentSlug: null, icon: 'trending-up', displayOrder: 1, description: 'Stock-based ETFs' },
  { name: 'Fixed Income', slug: 'fixed-income', parentSlug: null, icon: 'shield', displayOrder: 2, description: 'Bond and debt instrument ETFs' },
  { name: 'Commodity', slug: 'commodity', parentSlug: null, icon: 'box', displayOrder: 3, description: 'Physical commodities and futures' },
  { name: 'Real Estate', slug: 'real-estate', parentSlug: null, icon: 'home', displayOrder: 4, description: 'REITs and real estate focused' },
  { name: 'Alternative', slug: 'alternative', parentSlug: null, icon: 'zap', displayOrder: 5, description: 'Non-traditional strategies' },
  { name: 'Multi-Asset', slug: 'multi-asset', parentSlug: null, icon: 'layers', displayOrder: 6, description: 'Balanced and allocation funds' },

  // =========================================================================
  // Level 1: Equity Subcategories
  // =========================================================================
  { name: 'US Equity', slug: 'us-equity', parentSlug: 'equity', displayOrder: 1 },
  { name: 'International Developed', slug: 'intl-developed', parentSlug: 'equity', displayOrder: 2 },
  { name: 'Emerging Markets', slug: 'emerging-markets', parentSlug: 'equity', displayOrder: 3 },
  { name: 'Sector Equity', slug: 'sector-equity', parentSlug: 'equity', displayOrder: 4 },
  { name: 'Factor/Smart Beta', slug: 'factor-smart-beta', parentSlug: 'equity', displayOrder: 5 },
  { name: 'Dividend Equity', slug: 'dividend-equity', parentSlug: 'equity', displayOrder: 6 },
  { name: 'Thematic', slug: 'thematic', parentSlug: 'equity', displayOrder: 7 },

  // =========================================================================
  // Level 2: US Equity (by cap/style)
  // =========================================================================
  { name: 'US Total Market', slug: 'us-total-market', parentSlug: 'us-equity', displayOrder: 1 },
  { name: 'US Large Cap Blend', slug: 'us-large-cap-blend', parentSlug: 'us-equity', displayOrder: 2 },
  { name: 'US Large Cap Growth', slug: 'us-large-cap-growth', parentSlug: 'us-equity', displayOrder: 3 },
  { name: 'US Large Cap Value', slug: 'us-large-cap-value', parentSlug: 'us-equity', displayOrder: 4 },
  { name: 'US Mid Cap', slug: 'us-mid-cap', parentSlug: 'us-equity', displayOrder: 5 },
  { name: 'US Small Cap', slug: 'us-small-cap', parentSlug: 'us-equity', displayOrder: 6 },

  // =========================================================================
  // Level 1: Fixed Income Subcategories
  // =========================================================================
  { name: 'US Treasury', slug: 'us-treasury', parentSlug: 'fixed-income', displayOrder: 1 },
  { name: 'US Aggregate', slug: 'us-aggregate', parentSlug: 'fixed-income', displayOrder: 2 },
  { name: 'Corporate Bonds', slug: 'corporate-bonds', parentSlug: 'fixed-income', displayOrder: 3 },
  { name: 'TIPS', slug: 'tips', parentSlug: 'fixed-income', displayOrder: 4 },
  { name: 'International Bonds', slug: 'intl-bonds', parentSlug: 'fixed-income', displayOrder: 5 },

  // =========================================================================
  // Level 2: Treasury Durations
  // =========================================================================
  { name: 'Short-Term Treasury', slug: 'short-term-treasury', parentSlug: 'us-treasury', displayOrder: 1 },
  { name: 'Intermediate Treasury', slug: 'intermediate-treasury', parentSlug: 'us-treasury', displayOrder: 2 },
  { name: 'Long-Term Treasury', slug: 'long-term-treasury', parentSlug: 'us-treasury', displayOrder: 3 },

  // =========================================================================
  // Level 1: Commodity Subcategories
  // =========================================================================
  { name: 'Gold', slug: 'gold', parentSlug: 'commodity', displayOrder: 1 },
  { name: 'Silver', slug: 'silver', parentSlug: 'commodity', displayOrder: 2 },
  { name: 'Broad Commodities', slug: 'broad-commodities', parentSlug: 'commodity', displayOrder: 3 },

  // =========================================================================
  // Level 1: Sector Subcategories
  // =========================================================================
  { name: 'Technology', slug: 'sector-technology', parentSlug: 'sector-equity', displayOrder: 1 },
  { name: 'Healthcare', slug: 'sector-healthcare', parentSlug: 'sector-equity', displayOrder: 2 },
  { name: 'Financials', slug: 'sector-financials', parentSlug: 'sector-equity', displayOrder: 3 },
  { name: 'Energy', slug: 'sector-energy', parentSlug: 'sector-equity', displayOrder: 4 },
  { name: 'Consumer Discretionary', slug: 'sector-consumer-disc', parentSlug: 'sector-equity', displayOrder: 5 },
  { name: 'Consumer Staples', slug: 'sector-consumer-staples', parentSlug: 'sector-equity', displayOrder: 6 },
  { name: 'Industrials', slug: 'sector-industrials', parentSlug: 'sector-equity', displayOrder: 7 },
  { name: 'Utilities', slug: 'sector-utilities', parentSlug: 'sector-equity', displayOrder: 8 },
  { name: 'Materials', slug: 'sector-materials', parentSlug: 'sector-equity', displayOrder: 9 },
  { name: 'Real Estate (Sector)', slug: 'sector-real-estate', parentSlug: 'sector-equity', displayOrder: 10 },
  { name: 'Communication Services', slug: 'sector-communication', parentSlug: 'sector-equity', displayOrder: 11 },

  // =========================================================================
  // Level 1: Factor Subcategories
  // =========================================================================
  { name: 'Value Factor', slug: 'factor-value', parentSlug: 'factor-smart-beta', displayOrder: 1 },
  { name: 'Momentum Factor', slug: 'factor-momentum', parentSlug: 'factor-smart-beta', displayOrder: 2 },
  { name: 'Quality Factor', slug: 'factor-quality', parentSlug: 'factor-smart-beta', displayOrder: 3 },
  { name: 'Low Volatility', slug: 'factor-low-vol', parentSlug: 'factor-smart-beta', displayOrder: 4 },
  { name: 'Size Factor', slug: 'factor-size', parentSlug: 'factor-smart-beta', displayOrder: 5 },

  // =========================================================================
  // Level 1: Alternative Subcategories
  // =========================================================================
  { name: 'Volatility', slug: 'volatility', parentSlug: 'alternative', displayOrder: 1 },
  { name: 'Managed Futures', slug: 'managed-futures', parentSlug: 'alternative', displayOrder: 2 }
];

/**
 * Build a tree structure from flat categories
 * @returns {Object[]} Nested category tree
 */
function buildCategoryTree() {
  const categoryMap = new Map();
  const roots = [];

  // First pass: create all nodes
  for (const cat of ETF_CATEGORIES) {
    categoryMap.set(cat.slug, { ...cat, children: [] });
  }

  // Second pass: build tree
  for (const cat of ETF_CATEGORIES) {
    const node = categoryMap.get(cat.slug);
    if (cat.parentSlug) {
      const parent = categoryMap.get(cat.parentSlug);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Sort children by displayOrder
  const sortChildren = (node) => {
    node.children.sort((a, b) => a.displayOrder - b.displayOrder);
    node.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);
  roots.sort((a, b) => a.displayOrder - b.displayOrder);

  return roots;
}

/**
 * Get category by slug
 * @param {string} slug
 * @returns {Object|undefined}
 */
function getCategoryBySlug(slug) {
  return ETF_CATEGORIES.find(c => c.slug === slug);
}

/**
 * Get all descendants of a category (including itself)
 * @param {string} slug
 * @returns {string[]} Array of slugs
 */
function getCategoryDescendants(slug) {
  const descendants = [slug];
  const children = ETF_CATEGORIES.filter(c => c.parentSlug === slug);
  for (const child of children) {
    descendants.push(...getCategoryDescendants(child.slug));
  }
  return descendants;
}

/**
 * Get breadcrumb path for a category
 * @param {string} slug
 * @returns {Object[]} Array of categories from root to current
 */
function getCategoryBreadcrumb(slug) {
  const path = [];
  let current = getCategoryBySlug(slug);

  while (current) {
    path.unshift(current);
    current = current.parentSlug ? getCategoryBySlug(current.parentSlug) : null;
  }

  return path;
}

module.exports = {
  ETF_CATEGORIES,
  buildCategoryTree,
  getCategoryBySlug,
  getCategoryDescendants,
  getCategoryBreadcrumb
};
