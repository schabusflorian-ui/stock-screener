import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const WatchlistContext = createContext();

const STORAGE_KEY = 'stock_analyzer_watchlist';
const ALERTS_STORAGE_KEY = 'stock_analyzer_price_alerts';

export function WatchlistProvider({ children }) {
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [priceAlerts, setPriceAlerts] = useState(() => {
    try {
      const saved = localStorage.getItem(ALERTS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [triggeredAlerts, setTriggeredAlerts] = useState([]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(priceAlerts));
  }, [priceAlerts]);

  const addToWatchlist = (symbol, name, sector, companyId) => {
    setWatchlist(prev => {
      if (prev.some(item => item.symbol === symbol)) return prev;
      return [...prev, {
        symbol,
        name,
        sector,
        companyId,
        addedAt: new Date().toISOString()
      }];
    });
  };

  const removeFromWatchlist = (symbol) => {
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    // Also remove any alerts for this symbol
    setPriceAlerts(prev => prev.filter(alert => alert.symbol !== symbol));
  };

  const isInWatchlist = (symbol) => {
    return watchlist.some(item => item.symbol === symbol);
  };

  const clearWatchlist = () => {
    setWatchlist([]);
    setPriceAlerts([]);
  };

  // Price Alert Functions
  const addPriceAlert = (symbol, type, targetPrice, note = '') => {
    const newAlert = {
      id: Date.now().toString(),
      symbol,
      type, // 'above' | 'below'
      targetPrice: parseFloat(targetPrice),
      note,
      createdAt: new Date().toISOString(),
      triggered: false
    };
    setPriceAlerts(prev => [...prev, newAlert]);
    return newAlert;
  };

  const removePriceAlert = (alertId) => {
    setPriceAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  const getAlertsForSymbol = (symbol) => {
    return priceAlerts.filter(alert => alert.symbol === symbol);
  };

  const checkAlerts = useCallback((priceData) => {
    // priceData = { symbol: currentPrice, ... }
    const newTriggered = [];

    setPriceAlerts(prev => prev.map(alert => {
      if (alert.triggered) return alert;

      const currentPrice = priceData[alert.symbol];
      if (currentPrice === undefined) return alert;

      let isTriggered = false;
      if (alert.type === 'above' && currentPrice >= alert.targetPrice) {
        isTriggered = true;
      } else if (alert.type === 'below' && currentPrice <= alert.targetPrice) {
        isTriggered = true;
      }

      if (isTriggered) {
        newTriggered.push({
          ...alert,
          currentPrice,
          triggeredAt: new Date().toISOString()
        });
        return { ...alert, triggered: true, triggeredAt: new Date().toISOString() };
      }

      return alert;
    }));

    if (newTriggered.length > 0) {
      setTriggeredAlerts(prev => [...newTriggered, ...prev]);
    }

    return newTriggered;
  }, []);

  const dismissTriggeredAlert = (alertId) => {
    setTriggeredAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const clearTriggeredAlerts = () => {
    setTriggeredAlerts([]);
  };

  return (
    <WatchlistContext.Provider value={{
      watchlist,
      addToWatchlist,
      removeFromWatchlist,
      isInWatchlist,
      clearWatchlist,
      // Price Alerts
      priceAlerts,
      addPriceAlert,
      removePriceAlert,
      getAlertsForSymbol,
      checkAlerts,
      triggeredAlerts,
      dismissTriggeredAlert,
      clearTriggeredAlerts
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
