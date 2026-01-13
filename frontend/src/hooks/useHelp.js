/**
 * useHelp Hook
 *
 * Provides help article functionality including search, contextual help,
 * and article viewing with helpfulness tracking.
 */

import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

// Map of page paths to feature names
const PAGE_FEATURE_MAP = {
  '/': 'dashboard',
  '/portfolios': 'portfolio',
  '/portfolios/': 'portfolio_detail',
  '/screening': 'screening',
  '/watchlist': 'watchlist',
  '/analysis': 'analysis',
  '/companies/': 'company_detail',
  '/settings': 'settings',
  '/compare': 'compare'
};

// Get feature name from path
const getFeatureFromPath = (path) => {
  for (const [pattern, feature] of Object.entries(PAGE_FEATURE_MAP)) {
    if (pattern.endsWith('/') ? path.startsWith(pattern) : path === pattern) {
      return feature;
    }
  }
  return null;
};

export const useHelp = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [contextualArticles, setContextualArticles] = useState([]);
  const [popularArticles, setPopularArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Session ID for tracking
  const sessionId = sessionStorage.getItem('analytics_session_id');

  /**
   * Fetch articles for the current page context
   */
  const fetchContextualHelp = useCallback(async () => {
    const feature = getFeatureFromPath(location.pathname);

    try {
      const result = await api.get('/help/contextual', {
        params: {
          page: location.pathname,
          feature
        }
      });
      setContextualArticles(result.data.data || []);
    } catch (err) {
      console.debug('Failed to fetch contextual help:', err);
    }
  }, [location.pathname]);

  /**
   * Fetch popular articles
   */
  const fetchPopularArticles = useCallback(async () => {
    try {
      const result = await api.get('/help/popular', { params: { limit: 5 } });
      setPopularArticles(result.data.data || []);
    } catch (err) {
      console.debug('Failed to fetch popular articles:', err);
    }
  }, []);

  /**
   * Fetch categories
   */
  const fetchCategories = useCallback(async () => {
    try {
      const result = await api.get('/help/categories');
      setCategories(result.data.data || []);
    } catch (err) {
      console.debug('Failed to fetch categories:', err);
    }
  }, []);

  /**
   * Fetch all articles (optionally by category)
   */
  const fetchArticles = useCallback(async (category = null) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = { limit: 50 };
      if (category) params.category = category;

      const result = await api.get('/help/articles', { params });
      setArticles(result.data.data || []);
    } catch (err) {
      setError('Failed to load articles');
      console.error('Failed to fetch articles:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Fetch a single article by slug
   */
  const fetchArticle = useCallback(async (slug) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await api.get(`/help/articles/${slug}`, {
        params: {
          sessionId,
          fromPage: location.pathname,
          searchQuery: searchQuery || null
        }
      });
      setCurrentArticle(result.data.data);
      return result.data.data;
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Article not found');
      } else {
        setError('Failed to load article');
      }
      console.error('Failed to fetch article:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, location.pathname, searchQuery]);

  /**
   * Search articles
   */
  const searchArticles = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return [];
    }

    setIsLoading(true);
    setSearchQuery(query);

    try {
      const result = await api.get('/help/search', {
        params: { q: query, limit: 10 }
      });
      const results = result.data.data || [];
      setSearchResults(results);
      return results;
    } catch (err) {
      console.error('Failed to search articles:', err);
      setSearchResults([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Mark article as helpful or not
   */
  const markHelpful = useCallback(async (slug, helpful) => {
    try {
      await api.post(`/help/articles/${slug}/helpful`, {
        helpful,
        sessionId
      });
      return true;
    } catch (err) {
      console.error('Failed to record helpfulness:', err);
      return false;
    }
  }, [sessionId]);

  /**
   * Open the help center
   */
  const openHelp = useCallback((articleSlug = null) => {
    setIsOpen(true);
    if (articleSlug) {
      fetchArticle(articleSlug);
    }
  }, [fetchArticle]);

  /**
   * Close the help center
   */
  const closeHelp = useCallback(() => {
    setIsOpen(false);
    setCurrentArticle(null);
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  /**
   * Clear current article (go back to list)
   */
  const clearArticle = useCallback(() => {
    setCurrentArticle(null);
  }, []);

  // Fetch contextual help when path changes
  useEffect(() => {
    if (isOpen) {
      fetchContextualHelp();
    }
  }, [isOpen, fetchContextualHelp]);

  // Fetch initial data when help opens
  useEffect(() => {
    if (isOpen) {
      fetchPopularArticles();
      fetchCategories();
    }
  }, [isOpen, fetchPopularArticles, fetchCategories]);

  return {
    // State
    isOpen,
    articles,
    contextualArticles,
    popularArticles,
    categories,
    currentArticle,
    searchResults,
    searchQuery,
    isLoading,
    error,

    // Actions
    openHelp,
    closeHelp,
    fetchArticles,
    fetchArticle,
    searchArticles,
    markHelpful,
    clearArticle,
    fetchContextualHelp
  };
};

export default useHelp;
