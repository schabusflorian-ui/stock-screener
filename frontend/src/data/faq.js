// data/faq.js

export const FAQ_CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: '🚀',
    questions: [
      {
        q: 'How do I create a watchlist?',
        a: 'Click the "+" button in the Watchlists section from the navigation menu, give your watchlist a name, then search for stocks to add. You can also click the star icon on any stock page to add it to your default watchlist.',
      },
      {
        q: 'What data sources do you use?',
        a: 'We aggregate data from multiple sources including Alpha Vantage for US stocks, official XBRL filings from ESMA and Companies House for European companies, and various news and social media APIs for sentiment analysis. All data is updated regularly to ensure accuracy.',
      },
      {
        q: 'Is my portfolio real money?',
        a: 'No! All portfolios and trading agents on this platform are simulations. We don\'t connect to any brokers or handle real money. It\'s a safe way to practice investment strategies and test ideas without financial risk.',
      },
      {
        q: 'How do I search for stocks?',
        a: 'Use the search bar at the top of the page. You can search by company name (e.g., "Apple") or ticker symbol (e.g., "AAPL"). We support both US and European stocks.',
      },
      {
        q: 'Can I track European stocks?',
        a: 'Yes! We support stocks from major European markets including UK, Germany, France, Switzerland, and more. Search for them by ticker symbol or company name.',
      },
    ],
  },
  {
    id: 'features',
    title: 'Features & Analysis',
    icon: '⚡',
    questions: [
      {
        q: 'How does the AI analysis work?',
        a: 'Our AI analyzes multiple data sources including financial statements, news articles, social media sentiment, and technical indicators to provide insights. It uses large language models to synthesize information and identify key trends. Remember, this is for informational purposes only and not financial advice.',
      },
      {
        q: 'What do the sentiment scores mean?',
        a: 'Sentiment scores range from -100 (very negative) to +100 (very positive). We analyze Reddit discussions, Twitter/X posts, and news articles to gauge market sentiment around each stock. The score reflects the overall tone and emotion in these sources.',
      },
      {
        q: 'How often is data updated?',
        a: 'Stock prices update every 15 minutes during market hours for our data plan. Fundamental data (financials, ratios) updates daily after market close. Sentiment data updates hourly. News updates in real-time as articles are published.',
      },
      {
        q: 'What are trading agents?',
        a: 'Trading agents are AI-powered strategies that use technical indicators, fundamental signals, and market data to make simulated buy/sell decisions. You can create custom agents with your own criteria and backtest them against historical data.',
      },
      {
        q: 'How does backtesting work?',
        a: 'Backtesting runs your strategy against historical data to see how it would have performed. We use walk-forward analysis to avoid overfitting and provide realistic performance metrics including returns, win rate, Sharpe ratio, and maximum drawdown.',
      },
      {
        q: 'What is the stock screener?',
        a: 'The stock screener lets you filter thousands of stocks by criteria like P/E ratio, market cap, dividend yield, revenue growth, and more. It\'s useful for finding investment opportunities that match your strategy.',
      },
    ],
  },
  {
    id: 'metrics',
    title: 'Financial Metrics',
    icon: '📊',
    questions: [
      {
        q: 'What\'s the difference between P/E and PEG ratio?',
        a: 'P/E ratio (Price-to-Earnings) measures stock price relative to earnings. PEG ratio (Price/Earnings to Growth) adjusts P/E for the earnings growth rate. PEG below 1 may indicate undervaluation relative to growth potential.',
      },
      {
        q: 'How should I interpret RSI?',
        a: 'RSI (Relative Strength Index) measures momentum. Above 70 typically indicates overbought conditions (potential price decline), below 30 indicates oversold (potential price increase). Use in conjunction with other indicators.',
      },
      {
        q: 'What is a good debt-to-equity ratio?',
        a: 'It varies by industry. Generally, below 1.0 is considered healthy. Capital-intensive industries (utilities, telecom) tend to have higher ratios. Compare to industry peers rather than absolute thresholds.',
      },
      {
        q: 'Why is free cash flow important?',
        a: 'Free cash flow (FCF) shows cash available after capital expenditures. Positive FCF means the company can fund growth, pay dividends, or reduce debt. It\'s harder to manipulate than earnings, making it a reliable metric.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Account & Privacy',
    icon: '🔒',
    questions: [
      {
        q: 'How do I delete my account?',
        a: 'Go to Settings > Account > Delete Account. This will permanently remove all your data including watchlists, portfolios, and agents. You can also export your data first from the same page.',
      },
      {
        q: 'What data do you collect?',
        a: 'We collect your email (from Google login), your watchlists, portfolios, trading agents, and usage analytics to improve the platform. We never sell your data to third parties. See our Privacy Policy for full details.',
      },
      {
        q: 'Is my data secure?',
        a: 'Yes. We use industry-standard encryption for data in transit and at rest. Authentication is handled by Google OAuth. We don\'t store financial account credentials since we don\'t connect to brokers.',
      },
      {
        q: 'Can I export my data?',
        a: 'Yes! Go to Settings > Account > Export Data to download all your watchlists, portfolios, and agent configurations in JSON format.',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: '🔧',
    questions: [
      {
        q: 'Why is some data showing as "N/A"?',
        a: 'Some data may be unavailable for certain stocks, especially smaller companies, recent IPOs, or stocks with limited reporting requirements. We\'re constantly working to expand our coverage.',
      },
      {
        q: 'The app feels slow. What can I do?',
        a: 'Try refreshing the page, clearing your browser cache, or using a different browser (Chrome or Firefox recommended). If issues persist, check your internet connection or contact support.',
      },
      {
        q: 'Why can\'t I find a specific stock?',
        a: 'We cover major US and European markets. Some smaller OTC stocks, penny stocks, or stocks from other regions may not be available. If you think a stock should be included, contact support.',
      },
      {
        q: 'My backtest is taking a long time. Is that normal?',
        a: 'Backtests with walk-forward analysis and multiple years of data can take 1-2 minutes. If it takes longer than 5 minutes, try refreshing the page and running again with a shorter time period.',
      },
      {
        q: 'How do I report a bug?',
        a: 'Use the feedback button in the bottom right corner or email support@yourplatform.com with details about the issue, including what you were doing when it occurred and any error messages.',
      },
    ],
  },
];
