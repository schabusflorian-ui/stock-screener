/**
 * Route Preloader
 *
 * Utilities for preloading route bundles before navigation
 * to make page transitions feel instant.
 *
 * Usage:
 *   import { preloadRoute, PreloadLink } from '../utils/routePreloader';
 *
 *   // Manual preload
 *   preloadRoute('company');
 *
 *   // Or use PreloadLink component
 *   <PreloadLink to="/company/AAPL" preload="company">AAPL</PreloadLink>
 */

import { lazy } from 'react';
import { Link, NavLink } from 'react-router-dom';

// Map of route keys to their dynamic imports
// These must match the lazy() calls in App.js
const routeImports = {
  home: () => import('../pages/HomePage'),
  company: () => import('../pages/CompanyPage'),
  screening: () => import('../pages/ScreeningPage'),
  watchlist: () => import('../pages/WatchlistPage'),
  sectors: () => import('../pages/SectorAnalysisPage'),
  ipo: () => import('../pages/IPOPipelinePage'),
  ipoDetail: () => import('../pages/IPODetailPage'),
  capital: () => import('../pages/CapitalAllocationPage'),
  alerts: () => import('../pages/AlertsPage'),
  investors: () => import('../pages/investors/InvestorListPage'),
  investorDetail: () => import('../pages/investors/InvestorDetailPage'),
  portfolios: () => import('../pages/portfolios/PortfolioListPage'),
  portfolioDetail: () => import('../pages/portfolios/PortfolioDetailPage'),
  analyst: () => import('../pages/analyst/AnalystPage'),
  agents: () => import('../pages/agents/AgentListPage'),
  agentDetail: () => import('../pages/agents/AgentDetailPage'),
  notes: () => import('../pages/notes/NotesPage'),
  settings: () => import('../pages/settings/SettingsPage'),
  backtest: () => import('../pages/backtesting/BacktestDashboard'),
  signals: () => import('../pages/MarketSignalsPage'),
  research: () => import('../pages/ResearchLabPage'),
};

// Track which routes have been preloaded to avoid duplicate requests
const preloadedRoutes = new Set();

/**
 * Preload a route's bundle
 * @param {string} routeKey - Key from routeImports
 */
export function preloadRoute(routeKey) {
  if (preloadedRoutes.has(routeKey)) {
    return; // Already preloaded
  }

  const importFn = routeImports[routeKey];
  if (importFn) {
    preloadedRoutes.add(routeKey);
    // Start the import but don't wait for it
    importFn().catch(() => {
      // Remove from set if import fails so it can be retried
      preloadedRoutes.delete(routeKey);
    });
  }
}

/**
 * Preload multiple routes at once
 * @param {string[]} routeKeys - Array of route keys
 */
export function preloadRoutes(routeKeys) {
  routeKeys.forEach(preloadRoute);
}

/**
 * Get route key from a path
 * @param {string} path - URL path
 * @returns {string|null} Route key or null
 */
export function getRouteKeyFromPath(path) {
  if (path === '/' || path === '/home') return 'home';
  if (path.startsWith('/company/')) return 'company';
  if (path === '/screening') return 'screening';
  if (path === '/watchlist') return 'watchlist';
  if (path === '/sectors') return 'sectors';
  if (path === '/ipo') return 'ipo';
  if (path.startsWith('/ipo/')) return 'ipoDetail';
  if (path === '/capital') return 'capital';
  if (path === '/alerts') return 'alerts';
  if (path === '/investors') return 'investors';
  if (path.startsWith('/investors/')) return 'investorDetail';
  if (path === '/portfolios') return 'portfolios';
  if (path.startsWith('/portfolios/')) return 'portfolioDetail';
  if (path === '/analyst') return 'analyst';
  if (path === '/agents') return 'agents';
  if (path.startsWith('/agents/')) return 'agentDetail';
  if (path === '/notes') return 'notes';
  if (path === '/settings') return 'settings';
  if (path === '/backtest') return 'backtest';
  if (path === '/signals') return 'signals';
  if (path === '/research') return 'research';
  return null;
}

/**
 * Link component that preloads route on hover/focus
 *
 * @param {Object} props
 * @param {string} props.to - Destination path
 * @param {string} [props.preload] - Route key to preload (auto-detected from 'to' if not provided)
 * @param {string} [props.className] - CSS class
 * @param {React.ReactNode} props.children - Link content
 */
export function PreloadLink({ to, preload, children, className, ...props }) {
  const routeKey = preload || getRouteKeyFromPath(to);

  const handleMouseEnter = () => {
    if (routeKey) {
      preloadRoute(routeKey);
    }
  };

  const handleFocus = () => {
    if (routeKey) {
      preloadRoute(routeKey);
    }
  };

  return (
    <Link
      to={to}
      className={className}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...props}
    >
      {children}
    </Link>
  );
}

/**
 * NavLink component that preloads route on hover/focus
 * Supports className as function for active state styling
 *
 * @param {Object} props
 * @param {string} props.to - Destination path
 * @param {string} [props.preload] - Route key to preload (auto-detected from 'to' if not provided)
 * @param {string|function} [props.className] - CSS class or function receiving { isActive }
 * @param {React.ReactNode} props.children - Link content
 */
export function PreloadNavLink({ to, preload, children, className, ...props }) {
  const routeKey = preload || getRouteKeyFromPath(to);

  const handleMouseEnter = () => {
    if (routeKey) {
      preloadRoute(routeKey);
    }
  };

  const handleFocus = () => {
    if (routeKey) {
      preloadRoute(routeKey);
    }
  };

  return (
    <NavLink
      to={to}
      className={className}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      {...props}
    >
      {children}
    </NavLink>
  );
}

/**
 * Preload common routes after initial app load
 * Call this after the app has fully rendered
 */
export function preloadCommonRoutes() {
  // Use requestIdleCallback to preload during idle time
  const preload = () => {
    // Preload the most commonly visited pages
    preloadRoutes(['company', 'screening', 'portfolios']);
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preload, { timeout: 5000 });
  } else {
    // Fallback for Safari
    setTimeout(preload, 2000);
  }
}

export default {
  preloadRoute,
  preloadRoutes,
  preloadCommonRoutes,
  getRouteKeyFromPath,
  PreloadLink,
  PreloadNavLink,
};
