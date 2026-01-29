// lib/onboarding/sampleData.js

export const SAMPLE_WATCHLIST = {
  name: 'Getting Started Watchlist',
  description: 'Example stocks to explore the platform',
  stocks: [
    { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
    { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
    { symbol: 'JPM', name: 'JPMorgan Chase', sector: 'Financial Services' },
    { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Defensive' },
  ],
};

export const SUGGESTED_STOCKS_BY_INTEREST = {
  growth: [
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'META', name: 'Meta Platforms Inc.' },
  ],
  value: [
    { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'WFC', name: 'Wells Fargo' },
  ],
  dividend: [
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'PG', name: 'Procter & Gamble' },
    { symbol: 'KO', name: 'Coca-Cola' },
    { symbol: 'PEP', name: 'PepsiCo' },
  ],
  tech: [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  ],
  etf: [
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
    { symbol: 'VOO', name: 'Vanguard S&P 500 ETF' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market' },
  ],
  international: [
    { symbol: 'VXUS', name: 'Vanguard Total International Stock' },
    { symbol: 'EEM', name: 'iShares MSCI Emerging Markets' },
    { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets' },
  ],
  smallcap: [
    { symbol: 'IWM', name: 'iShares Russell 2000' },
    { symbol: 'VB', name: 'Vanguard Small-Cap' },
    { symbol: 'SCHA', name: 'Schwab U.S. Small-Cap' },
  ],
  quant: [
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  ],
};

export const SAMPLE_PORTFOLIO = {
  name: 'Demo Portfolio',
  description: 'A balanced portfolio example to explore performance tracking',
  initialCash: 100000,
  holdings: [
    { symbol: 'VTI', shares: 100, avgCost: 220.00, type: 'ETF' },
    { symbol: 'AAPL', shares: 50, avgCost: 175.00, type: 'Stock' },
    { symbol: 'MSFT', shares: 30, avgCost: 380.00, type: 'Stock' },
    { symbol: 'BND', shares: 150, avgCost: 72.00, type: 'Bond ETF' },
  ],
};

export const SAMPLE_ALERTS = [
  {
    symbol: 'AAPL',
    condition: 'below',
    price: 170,
    note: 'Potential entry point for accumulation'
  },
  {
    symbol: 'NVDA',
    condition: 'above',
    price: 500,
    note: 'Consider taking profits at resistance level'
  },
];

export const getStockSuggestionsFromInterests = (interests) => {
  const suggestions = new Set();

  interests.forEach(interest => {
    const stocks = SUGGESTED_STOCKS_BY_INTEREST[interest] || [];
    stocks.forEach(stock => suggestions.add(JSON.stringify(stock)));
  });

  return Array.from(suggestions).map(s => JSON.parse(s)).slice(0, 6);
};
