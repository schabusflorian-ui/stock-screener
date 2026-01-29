// lib/tours/tourDriver.js
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export const createTour = (steps, options = {}) => {
  return driver({
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    steps,
    popoverClass: 'investment-tour-popover',
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Previous',
    doneBtnText: 'Done',
    ...options,
  });
};

// Define tours for different parts of the app
export const TOURS = {
  main: [
    {
      element: '[data-tour="search"]',
      popover: {
        title: 'Search for Stocks',
        description: 'Find any stock by name or ticker symbol. Try searching for "Apple" or "AAPL". You can also search for European stocks!',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="watchlist"]',
      popover: {
        title: 'Your Watchlist',
        description: 'Keep track of stocks you\'re interested in. Click the star icon on any stock to add it to your watchlist.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="ai-chat"]',
      popover: {
        title: 'AI-Powered Analysis',
        description: 'Ask questions in plain English! Get intelligent analysis, recommendations, and insights powered by AI.',
        side: 'left',
        align: 'center',
      },
    },
    {
      element: '[data-tour="screening"]',
      popover: {
        title: 'Stock Screener',
        description: 'Filter stocks by fundamentals, valuation metrics, and technical indicators to find investment opportunities.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="agents"]',
      popover: {
        title: 'Trading Agents',
        description: 'Create AI-powered trading strategies with backtesting and performance tracking. Test your ideas without risking real money!',
        side: 'bottom',
        align: 'center',
      },
    },
  ],

  stockDetail: [
    {
      element: '[data-tour="price-chart"]',
      popover: {
        title: 'Price Chart',
        description: 'View historical price data with technical indicators. Use the timeframe buttons to change the period.',
        side: 'bottom',
        align: 'center',
      },
    },
    {
      element: '[data-tour="fundamentals"]',
      popover: {
        title: 'Fundamental Metrics',
        description: 'Key financial metrics like P/E ratio, revenue growth, profit margins, and more. Hover over metrics for explanations.',
        side: 'top',
        align: 'start',
      },
    },
    {
      element: '[data-tour="financials"]',
      popover: {
        title: 'Financial Statements',
        description: 'Dive into income statements, balance sheets, and cash flow statements to understand the company\'s financial health.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: '[data-tour="ai-analysis"]',
      popover: {
        title: 'AI Analysis',
        description: 'Get an AI-generated summary of this stock\'s prospects, risks, and key considerations.',
        side: 'top',
        align: 'center',
      },
    },
  ],

  screening: [
    {
      element: '[data-tour="filters"]',
      popover: {
        title: 'Stock Filters',
        description: 'Set criteria to find stocks that match your investment strategy. Filter by market cap, P/E ratio, dividend yield, and more.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="results"]',
      popover: {
        title: 'Screening Results',
        description: 'See all stocks matching your filters. Click any stock to view detailed analysis.',
        side: 'left',
        align: 'start',
      },
    },
    {
      element: '[data-tour="save-screen"]',
      popover: {
        title: 'Save Your Screen',
        description: 'Save your filter criteria to run the same screen again later or track how results change over time.',
        side: 'bottom',
        align: 'center',
      },
    },
  ],

  agents: [
    {
      element: '[data-tour="create-agent"]',
      popover: {
        title: 'Create Trading Agent',
        description: 'Build your own AI-powered trading strategy. Define signals, risk parameters, and position sizing rules.',
        side: 'bottom',
        align: 'start',
      },
    },
    {
      element: '[data-tour="agent-list"]',
      popover: {
        title: 'Your Agents',
        description: 'View all your trading agents and their performance. Track returns, win rates, and other key metrics.',
        side: 'right',
        align: 'start',
      },
    },
    {
      element: '[data-tour="backtest"]',
      popover: {
        title: 'Backtesting',
        description: 'Test your strategy against historical data to see how it would have performed. Use walk-forward analysis to avoid overfitting.',
        side: 'left',
        align: 'center',
      },
    },
  ],
};

export const TOUR_STORAGE_KEY = 'investment_completed_tours';

export const markTourComplete = (tourId) => {
  try {
    const completed = getCompletedTours();
    if (!completed.includes(tourId)) {
      completed.push(tourId);
      localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(completed));
    }
  } catch (error) {
    console.error('Failed to mark tour complete:', error);
  }
};

export const getCompletedTours = () => {
  try {
    const data = localStorage.getItem(TOUR_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get completed tours:', error);
    return [];
  }
};

export const hasCompletedTour = (tourId) => {
  return getCompletedTours().includes(tourId);
};

export const resetTour = (tourId) => {
  try {
    const completed = getCompletedTours().filter(id => id !== tourId);
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(completed));
  } catch (error) {
    console.error('Failed to reset tour:', error);
  }
};

export const resetAllTours = () => {
  localStorage.removeItem(TOUR_STORAGE_KEY);
};
