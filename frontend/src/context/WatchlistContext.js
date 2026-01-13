import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WatchlistContext = createContext();

const STORAGE_KEY = 'stock_analyzer_watchlist';
const ALERTS_STORAGE_KEY = 'stock_analyzer_price_alerts';
const API_BASE = process.env.REACT_APP_API_URL || '';

// Helper function to mark onboarding task complete
const markOnboardingTaskComplete = (taskId) => {
  try {
    const stored = localStorage.getItem('onboarding_completed_tasks');
    const completed = stored ? JSON.parse(stored) : [];
    if (!completed.includes(taskId)) {
      completed.push(taskId);
      localStorage.setItem('onboarding_completed_tasks', JSON.stringify(completed));
    }
  } catch (error) {
    console.error('Failed to mark onboarding task complete:', error);
  }
};

export function WatchlistProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
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
  const [syncing, setSyncing] = useState(false);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(priceAlerts));
  }, [priceAlerts]);

  // Sync with backend when user authenticates
  useEffect(() => {
    if (isAuthenticated && user?.id && user.id !== 'admin' && user.id !== 'legacy') {
      syncWithBackend();
    }
  }, [isAuthenticated, user?.id]);

  /**
   * Sync watchlist with backend
   * - Fetch user's watchlist from backend
   * - Merge with localStorage (union of both)
   * - Update both localStorage and backend
   */
  const syncWithBackend = async () => {
    if (syncing) return;

    setSyncing(true);
    try {
      // Fetch backend watchlist
      const response = await fetch(`${API_BASE}/api/watchlist`, {
        credentials: 'include'
      });

      if (!response.ok) {
        console.warn('Failed to fetch watchlist from backend');
        setSyncing(false);
        return;
      }

      const data = await response.json();
      const backendWatchlist = data.data || [];

      // Get local watchlist
      const localWatchlist = watchlist;

      // Create a map of symbols for fast lookup
      const backendSymbols = new Set(backendWatchlist.map(item => item.symbol));
      const localSymbols = new Set(localWatchlist.map(item => item.symbol));

      // Find items only in local (need to push to backend)
      const toUpload = localWatchlist.filter(item => !backendSymbols.has(item.symbol));

      // Find items only in backend (need to pull to local)
      const toDownload = backendWatchlist.filter(item => !localSymbols.has(item.symbol));

      // Upload local-only items to backend
      if (toUpload.length > 0) {
        await fetch(`${API_BASE}/api/watchlist/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            stocks: toUpload.map(item => ({
              symbol: item.symbol,
              name: item.name,
              sector: item.sector,
              companyId: item.companyId
            }))
          })
        });
      }

      // Merge: backend + local (backend is source of truth for addedAt dates)
      const merged = [...backendWatchlist, ...toDownload];

      // Update local state
      setWatchlist(merged);

      console.log(`Watchlist synced: ${backendWatchlist.length} from backend, ${toUpload.length} uploaded, ${toDownload.length} downloaded`);

    } catch (error) {
      console.error('Watchlist sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const addToWatchlist = async (symbol, name, sector, companyId) => {
    // Check if already in watchlist
    if (watchlist.some(item => item.symbol === symbol)) {
      return;
    }

    const newItem = {
      symbol,
      name,
      sector,
      companyId,
      addedAt: new Date().toISOString()
    };

    // Optimistic update
    setWatchlist(prev => {
      const updated = [...prev, newItem];
      // Check if user has added 3 stocks (onboarding task)
      if (updated.length >= 3) {
        markOnboardingTaskComplete('watchlist');
      }
      return updated;
    });

    // Sync to backend if authenticated
    if (isAuthenticated && user?.id && user.id !== 'admin' && user.id !== 'legacy') {
      try {
        await fetch(`${API_BASE}/api/watchlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            symbol,
            name,
            sector,
            companyId
          })
        });
      } catch (error) {
        console.error('Failed to add to backend watchlist:', error);
        // Keep local change even if backend fails
      }
    }
  };

  const removeFromWatchlist = async (symbol) => {
    // Optimistic update
    setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
    setPriceAlerts(prev => prev.filter(alert => alert.symbol !== symbol));

    // Sync to backend if authenticated
    if (isAuthenticated && user?.id && user?.id !== 'admin' && user.id !== 'legacy') {
      try {
        await fetch(`${API_BASE}/api/watchlist/${symbol}`, {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch (error) {
        console.error('Failed to remove from backend watchlist:', error);
        // Keep local change even if backend fails
      }
    }
  };

  const isInWatchlist = (symbol) => {
    return watchlist.some(item => item.symbol === symbol);
  };

  const clearWatchlist = async () => {
    // Optimistic update
    setWatchlist([]);
    setPriceAlerts([]);

    // Sync to backend if authenticated
    if (isAuthenticated && user?.id && user.id !== 'admin' && user.id !== 'legacy') {
      try {
        await fetch(`${API_BASE}/api/watchlist`, {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch (error) {
        console.error('Failed to clear backend watchlist:', error);
      }
    }
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
    setPriceAlerts(prev => {
      const updated = [...prev, newAlert];
      // Mark onboarding task complete on first alert
      if (updated.length >= 1) {
        markOnboardingTaskComplete('alert');
      }
      return updated;
    });
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
      syncWithBackend,
      syncing,
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
