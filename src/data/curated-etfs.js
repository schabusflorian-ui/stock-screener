// src/data/curated-etfs.js
// Curated list of ~100 Tier 1 ETFs with full metadata

/**
 * Curated ETF Definition
 * @typedef {Object} CuratedETF
 * @property {string} symbol - ETF ticker symbol
 * @property {string} name - Full ETF name
 * @property {string} category - Category slug (must match etf_categories.slug)
 * @property {string} issuer - Issuer slug (must match etf_issuers.slug)
 * @property {number} expenseRatio - As decimal (0.0003 = 0.03%)
 * @property {boolean} isEssential - Include in essentials shortlist
 * @property {string} [indexTracked] - Underlying index name
 * @property {string} [strategy] - Passive, Active, Smart Beta
 */

const CURATED_ETFS = [
  // =========================================================================
  // US TOTAL MARKET
  // =========================================================================
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', category: 'us-total-market', issuer: 'vanguard', expenseRatio: 0.0003, isEssential: true, indexTracked: 'CRSP US Total Market Index', strategy: 'Passive' },
  { symbol: 'ITOT', name: 'iShares Core S&P Total US Stock Market ETF', category: 'us-total-market', issuer: 'ishares', expenseRatio: 0.0003, isEssential: false, strategy: 'Passive' },
  { symbol: 'SPTM', name: 'SPDR Portfolio S&P 1500 Composite Stock Market ETF', category: 'us-total-market', issuer: 'spdr', expenseRatio: 0.0003, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // US LARGE CAP BLEND (S&P 500)
  // =========================================================================
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', category: 'us-large-cap-blend', issuer: 'spdr', expenseRatio: 0.0945, isEssential: true, indexTracked: 'S&P 500', strategy: 'Passive' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'us-large-cap-blend', issuer: 'vanguard', expenseRatio: 0.0003, isEssential: true, indexTracked: 'S&P 500', strategy: 'Passive' },
  { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', category: 'us-large-cap-blend', issuer: 'ishares', expenseRatio: 0.0003, isEssential: false, indexTracked: 'S&P 500', strategy: 'Passive' },
  { symbol: 'SPLG', name: 'SPDR Portfolio S&P 500 ETF', category: 'us-large-cap-blend', issuer: 'spdr', expenseRatio: 0.0002, isEssential: false, indexTracked: 'S&P 500', strategy: 'Passive' },

  // =========================================================================
  // US LARGE CAP GROWTH
  // =========================================================================
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', category: 'us-large-cap-growth', issuer: 'invesco', expenseRatio: 0.002, isEssential: true, indexTracked: 'NASDAQ-100', strategy: 'Passive' },
  { symbol: 'VUG', name: 'Vanguard Growth ETF', category: 'us-large-cap-growth', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: true, strategy: 'Passive' },
  { symbol: 'IWF', name: 'iShares Russell 1000 Growth ETF', category: 'us-large-cap-growth', issuer: 'ishares', expenseRatio: 0.0019, isEssential: false, strategy: 'Passive' },
  { symbol: 'SCHG', name: 'Schwab U.S. Large-Cap Growth ETF', category: 'us-large-cap-growth', issuer: 'schwab', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'MGK', name: 'Vanguard Mega Cap Growth ETF', category: 'us-large-cap-growth', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // US LARGE CAP VALUE
  // =========================================================================
  { symbol: 'VTV', name: 'Vanguard Value ETF', category: 'us-large-cap-value', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: true, strategy: 'Passive' },
  { symbol: 'IWD', name: 'iShares Russell 1000 Value ETF', category: 'us-large-cap-value', issuer: 'ishares', expenseRatio: 0.0019, isEssential: false, strategy: 'Passive' },
  { symbol: 'SCHV', name: 'Schwab U.S. Large-Cap Value ETF', category: 'us-large-cap-value', issuer: 'schwab', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'RPV', name: 'Invesco S&P 500 Pure Value ETF', category: 'us-large-cap-value', issuer: 'invesco', expenseRatio: 0.0035, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // US MID CAP
  // =========================================================================
  { symbol: 'VO', name: 'Vanguard Mid-Cap ETF', category: 'us-mid-cap', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: true, strategy: 'Passive' },
  { symbol: 'IJH', name: 'iShares Core S&P Mid-Cap ETF', category: 'us-mid-cap', issuer: 'ishares', expenseRatio: 0.0005, isEssential: false, indexTracked: 'S&P MidCap 400', strategy: 'Passive' },
  { symbol: 'MDY', name: 'SPDR S&P MidCap 400 ETF Trust', category: 'us-mid-cap', issuer: 'spdr', expenseRatio: 0.0023, isEssential: false, indexTracked: 'S&P MidCap 400', strategy: 'Passive' },
  { symbol: 'VOT', name: 'Vanguard Mid-Cap Growth ETF', category: 'us-mid-cap', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },
  { symbol: 'VOE', name: 'Vanguard Mid-Cap Value ETF', category: 'us-mid-cap', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // US SMALL CAP
  // =========================================================================
  { symbol: 'VB', name: 'Vanguard Small-Cap ETF', category: 'us-small-cap', issuer: 'vanguard', expenseRatio: 0.0005, isEssential: true, strategy: 'Passive' },
  { symbol: 'IJR', name: 'iShares Core S&P Small-Cap ETF', category: 'us-small-cap', issuer: 'ishares', expenseRatio: 0.0006, isEssential: false, indexTracked: 'S&P SmallCap 600', strategy: 'Passive' },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', category: 'us-small-cap', issuer: 'ishares', expenseRatio: 0.0019, isEssential: true, indexTracked: 'Russell 2000', strategy: 'Passive' },
  { symbol: 'VBR', name: 'Vanguard Small-Cap Value ETF', category: 'us-small-cap', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: true, strategy: 'Passive' },
  { symbol: 'VBK', name: 'Vanguard Small-Cap Growth ETF', category: 'us-small-cap', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },
  { symbol: 'AVUV', name: 'Avantis U.S. Small Cap Value ETF', category: 'us-small-cap', issuer: 'dimensional', expenseRatio: 0.0025, isEssential: false, strategy: 'Smart Beta' },
  { symbol: 'SLYV', name: 'SPDR S&P 600 Small Cap Value ETF', category: 'us-small-cap', issuer: 'spdr', expenseRatio: 0.0015, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // DIVIDEND
  // =========================================================================
  { symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', category: 'dividend-equity', issuer: 'schwab', expenseRatio: 0.0006, isEssential: true, strategy: 'Smart Beta' },
  { symbol: 'VYM', name: 'Vanguard High Dividend Yield ETF', category: 'dividend-equity', issuer: 'vanguard', expenseRatio: 0.0006, isEssential: true, strategy: 'Passive' },
  { symbol: 'VIG', name: 'Vanguard Dividend Appreciation ETF', category: 'dividend-equity', issuer: 'vanguard', expenseRatio: 0.0006, isEssential: false, strategy: 'Passive' },
  { symbol: 'DVY', name: 'iShares Select Dividend ETF', category: 'dividend-equity', issuer: 'ishares', expenseRatio: 0.0038, isEssential: false, strategy: 'Passive' },
  { symbol: 'DGRO', name: 'iShares Core Dividend Growth ETF', category: 'dividend-equity', issuer: 'ishares', expenseRatio: 0.0008, isEssential: false, strategy: 'Passive' },
  { symbol: 'NOBL', name: 'ProShares S&P 500 Dividend Aristocrats ETF', category: 'dividend-equity', issuer: 'proshares', expenseRatio: 0.0035, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // INTERNATIONAL DEVELOPED
  // =========================================================================
  { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', category: 'intl-developed', issuer: 'vanguard', expenseRatio: 0.0005, isEssential: true, strategy: 'Passive' },
  { symbol: 'IEFA', name: 'iShares Core MSCI EAFE ETF', category: 'intl-developed', issuer: 'ishares', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },
  { symbol: 'EFA', name: 'iShares MSCI EAFE ETF', category: 'intl-developed', issuer: 'ishares', expenseRatio: 0.0032, isEssential: false, strategy: 'Passive' },
  { symbol: 'SCHF', name: 'Schwab International Equity ETF', category: 'intl-developed', issuer: 'schwab', expenseRatio: 0.0006, isEssential: false, strategy: 'Passive' },
  { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', category: 'intl-developed', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: true, strategy: 'Passive' },
  { symbol: 'IXUS', name: 'iShares Core MSCI Total International Stock ETF', category: 'intl-developed', issuer: 'ishares', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // EMERGING MARKETS
  // =========================================================================
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', category: 'emerging-markets', issuer: 'vanguard', expenseRatio: 0.0008, isEssential: true, strategy: 'Passive' },
  { symbol: 'IEMG', name: 'iShares Core MSCI Emerging Markets ETF', category: 'emerging-markets', issuer: 'ishares', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', category: 'emerging-markets', issuer: 'ishares', expenseRatio: 0.0068, isEssential: false, strategy: 'Passive' },
  { symbol: 'SCHE', name: 'Schwab Emerging Markets Equity ETF', category: 'emerging-markets', issuer: 'schwab', expenseRatio: 0.0011, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // US TOTAL BOND
  // =========================================================================
  { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', category: 'us-aggregate', issuer: 'vanguard', expenseRatio: 0.0003, isEssential: true, strategy: 'Passive' },
  { symbol: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', category: 'us-aggregate', issuer: 'ishares', expenseRatio: 0.0003, isEssential: false, strategy: 'Passive' },
  { symbol: 'SCHZ', name: 'Schwab U.S. Aggregate Bond ETF', category: 'us-aggregate', issuer: 'schwab', expenseRatio: 0.0003, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // US TREASURY
  // =========================================================================
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', category: 'long-term-treasury', issuer: 'ishares', expenseRatio: 0.0015, isEssential: true, strategy: 'Passive' },
  { symbol: 'IEF', name: 'iShares 7-10 Year Treasury Bond ETF', category: 'intermediate-treasury', issuer: 'ishares', expenseRatio: 0.0015, isEssential: true, strategy: 'Passive' },
  { symbol: 'SHY', name: 'iShares 1-3 Year Treasury Bond ETF', category: 'short-term-treasury', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Passive' },
  { symbol: 'GOVT', name: 'iShares U.S. Treasury Bond ETF', category: 'us-treasury', issuer: 'ishares', expenseRatio: 0.0005, isEssential: false, strategy: 'Passive' },
  { symbol: 'VGSH', name: 'Vanguard Short-Term Treasury ETF', category: 'short-term-treasury', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'VGIT', name: 'Vanguard Intermediate-Term Treasury ETF', category: 'intermediate-treasury', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'VGLT', name: 'Vanguard Long-Term Treasury ETF', category: 'long-term-treasury', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'EDV', name: 'Vanguard Extended Duration Treasury ETF', category: 'long-term-treasury', issuer: 'vanguard', expenseRatio: 0.0006, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // TIPS
  // =========================================================================
  { symbol: 'TIP', name: 'iShares TIPS Bond ETF', category: 'tips', issuer: 'ishares', expenseRatio: 0.0019, isEssential: true, strategy: 'Passive' },
  { symbol: 'SCHP', name: 'Schwab U.S. TIPS ETF', category: 'tips', issuer: 'schwab', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'VTIP', name: 'Vanguard Short-Term Inflation-Protected Securities ETF', category: 'tips', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // CORPORATE BONDS
  // =========================================================================
  { symbol: 'LQD', name: 'iShares iBoxx Investment Grade Corporate Bond ETF', category: 'corporate-bonds', issuer: 'ishares', expenseRatio: 0.0014, isEssential: true, strategy: 'Passive' },
  { symbol: 'VCIT', name: 'Vanguard Intermediate-Term Corporate Bond ETF', category: 'corporate-bonds', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'VCSH', name: 'Vanguard Short-Term Corporate Bond ETF', category: 'corporate-bonds', issuer: 'vanguard', expenseRatio: 0.0004, isEssential: false, strategy: 'Passive' },
  { symbol: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond ETF', category: 'corporate-bonds', issuer: 'ishares', expenseRatio: 0.0049, isEssential: true, strategy: 'Passive' },
  { symbol: 'JNK', name: 'SPDR Bloomberg High Yield Bond ETF', category: 'corporate-bonds', issuer: 'spdr', expenseRatio: 0.004, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // INTERNATIONAL BONDS
  // =========================================================================
  { symbol: 'BNDX', name: 'Vanguard Total International Bond ETF', category: 'intl-bonds', issuer: 'vanguard', expenseRatio: 0.0007, isEssential: true, strategy: 'Passive' },
  { symbol: 'IAGG', name: 'iShares Core International Aggregate Bond ETF', category: 'intl-bonds', issuer: 'ishares', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },
  { symbol: 'EMB', name: 'iShares J.P. Morgan USD Emerging Markets Bond ETF', category: 'intl-bonds', issuer: 'ishares', expenseRatio: 0.0039, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // REAL ESTATE
  // =========================================================================
  { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', category: 'real-estate', issuer: 'vanguard', expenseRatio: 0.0012, isEssential: true, strategy: 'Passive' },
  { symbol: 'SCHH', name: 'Schwab U.S. REIT ETF', category: 'real-estate', issuer: 'schwab', expenseRatio: 0.0007, isEssential: false, strategy: 'Passive' },
  { symbol: 'IYR', name: 'iShares U.S. Real Estate ETF', category: 'real-estate', issuer: 'ishares', expenseRatio: 0.0039, isEssential: false, strategy: 'Passive' },
  { symbol: 'VNQI', name: 'Vanguard Global ex-U.S. Real Estate ETF', category: 'real-estate', issuer: 'vanguard', expenseRatio: 0.0012, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // COMMODITIES - GOLD
  // =========================================================================
  { symbol: 'GLD', name: 'SPDR Gold Shares', category: 'gold', issuer: 'spdr', expenseRatio: 0.004, isEssential: true, strategy: 'Passive' },
  { symbol: 'IAU', name: 'iShares Gold Trust', category: 'gold', issuer: 'ishares', expenseRatio: 0.0025, isEssential: false, strategy: 'Passive' },
  { symbol: 'GLDM', name: 'SPDR Gold MiniShares Trust', category: 'gold', issuer: 'spdr', expenseRatio: 0.001, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // COMMODITIES - OTHER
  // =========================================================================
  { symbol: 'SLV', name: 'iShares Silver Trust', category: 'silver', issuer: 'ishares', expenseRatio: 0.005, isEssential: false, strategy: 'Passive' },
  { symbol: 'GSG', name: 'iShares S&P GSCI Commodity-Indexed Trust', category: 'broad-commodities', issuer: 'ishares', expenseRatio: 0.0075, isEssential: true, strategy: 'Passive' },
  { symbol: 'DBC', name: 'Invesco DB Commodity Index Tracking Fund', category: 'broad-commodities', issuer: 'invesco', expenseRatio: 0.0087, isEssential: false, strategy: 'Passive' },
  { symbol: 'PDBC', name: 'Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF', category: 'broad-commodities', issuer: 'invesco', expenseRatio: 0.0059, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // SECTORS
  // =========================================================================
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', category: 'sector-technology', issuer: 'spdr', expenseRatio: 0.0009, isEssential: true, strategy: 'Passive' },
  { symbol: 'VGT', name: 'Vanguard Information Technology ETF', category: 'sector-technology', issuer: 'vanguard', expenseRatio: 0.001, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', category: 'sector-healthcare', issuer: 'spdr', expenseRatio: 0.0009, isEssential: true, strategy: 'Passive' },
  { symbol: 'VHT', name: 'Vanguard Health Care ETF', category: 'sector-healthcare', issuer: 'vanguard', expenseRatio: 0.001, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', category: 'sector-financials', issuer: 'spdr', expenseRatio: 0.0009, isEssential: true, strategy: 'Passive' },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', category: 'sector-energy', issuer: 'spdr', expenseRatio: 0.0009, isEssential: true, strategy: 'Passive' },
  { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR Fund', category: 'sector-consumer-disc', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR Fund', category: 'sector-consumer-staples', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', category: 'sector-industrials', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', category: 'sector-utilities', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', category: 'sector-materials', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', category: 'sector-real-estate', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },
  { symbol: 'XLC', name: 'Communication Services Select Sector SPDR Fund', category: 'sector-communication', issuer: 'spdr', expenseRatio: 0.0009, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // FACTOR ETFs
  // =========================================================================
  { symbol: 'MTUM', name: 'iShares MSCI USA Momentum Factor ETF', category: 'factor-momentum', issuer: 'ishares', expenseRatio: 0.0015, isEssential: true, strategy: 'Smart Beta' },
  { symbol: 'QUAL', name: 'iShares MSCI USA Quality Factor ETF', category: 'factor-quality', issuer: 'ishares', expenseRatio: 0.0015, isEssential: true, strategy: 'Smart Beta' },
  { symbol: 'VLUE', name: 'iShares MSCI USA Value Factor ETF', category: 'factor-value', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Smart Beta' },
  { symbol: 'USMV', name: 'iShares MSCI USA Min Vol Factor ETF', category: 'factor-low-vol', issuer: 'ishares', expenseRatio: 0.0015, isEssential: true, strategy: 'Smart Beta' },
  { symbol: 'SPLV', name: 'Invesco S&P 500 Low Volatility ETF', category: 'factor-low-vol', issuer: 'invesco', expenseRatio: 0.0025, isEssential: false, strategy: 'Smart Beta' },
  { symbol: 'SIZE', name: 'iShares MSCI USA Size Factor ETF', category: 'factor-size', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Smart Beta' },

  // =========================================================================
  // ALTERNATIVE - VOLATILITY
  // =========================================================================
  { symbol: 'VIXY', name: 'ProShares VIX Short-Term Futures ETF', category: 'volatility', issuer: 'proshares', expenseRatio: 0.0085, isEssential: true, strategy: 'Active' },
  { symbol: 'UVXY', name: 'ProShares Ultra VIX Short-Term Futures ETF', category: 'volatility', issuer: 'proshares', expenseRatio: 0.0095, isEssential: false, strategy: 'Active' },

  // =========================================================================
  // ALTERNATIVE - MANAGED FUTURES
  // =========================================================================
  { symbol: 'DBMF', name: 'iMGP DBi Managed Futures Strategy ETF', category: 'managed-futures', issuer: 'imgp', expenseRatio: 0.0085, isEssential: true, strategy: 'Active' },
  { symbol: 'CTA', name: 'Simplify Managed Futures Strategy ETF', category: 'managed-futures', issuer: 'simplify', expenseRatio: 0.0075, isEssential: false, strategy: 'Active' },
  { symbol: 'KMLM', name: 'KFA Mount Lucas Managed Futures Index Strategy ETF', category: 'managed-futures', issuer: 'kfa', expenseRatio: 0.009, isEssential: false, strategy: 'Active' },

  // =========================================================================
  // MULTI-ASSET
  // =========================================================================
  { symbol: 'AOR', name: 'iShares Core Growth Allocation ETF', category: 'multi-asset', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Passive' },
  { symbol: 'AOA', name: 'iShares Core Aggressive Allocation ETF', category: 'multi-asset', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Passive' },
  { symbol: 'AOM', name: 'iShares Core Moderate Allocation ETF', category: 'multi-asset', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Passive' },
  { symbol: 'AOK', name: 'iShares Core Conservative Allocation ETF', category: 'multi-asset', issuer: 'ishares', expenseRatio: 0.0015, isEssential: false, strategy: 'Passive' },

  // =========================================================================
  // THEMATIC / INNOVATION
  // =========================================================================
  { symbol: 'ARKK', name: 'ARK Innovation ETF', category: 'thematic', issuer: 'ark', expenseRatio: 0.0075, isEssential: false, strategy: 'Active' },
  { symbol: 'ARKG', name: 'ARK Genomic Revolution ETF', category: 'thematic', issuer: 'ark', expenseRatio: 0.0075, isEssential: false, strategy: 'Active' },
  { symbol: 'ARKW', name: 'ARK Next Generation Internet ETF', category: 'thematic', issuer: 'ark', expenseRatio: 0.0075, isEssential: false, strategy: 'Active' }
];

// Get essential ETFs only (~40)
const ESSENTIAL_ETFS = CURATED_ETFS.filter(e => e.isEssential);

// Get by category
function getByCategory(categorySlug) {
  return CURATED_ETFS.filter(e => e.category === categorySlug);
}

// Get by issuer
function getByIssuer(issuerSlug) {
  return CURATED_ETFS.filter(e => e.issuer === issuerSlug);
}

module.exports = {
  CURATED_ETFS,
  ESSENTIAL_ETFS,
  getByCategory,
  getByIssuer
};
