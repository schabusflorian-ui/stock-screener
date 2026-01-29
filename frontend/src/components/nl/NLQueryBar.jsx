// frontend/src/components/nl/NLQueryBar.jsx
/**
 * Natural Language Query Bar Component
 *
 * A search bar that accepts natural language investment queries
 * and opens the chat sidebar panel for results.
 *
 * Supports direct screening mode on the Screening page:
 * - enableDirectScreen: boolean - Enable direct screening mode
 * - onScreeningCriteria: (data) => void - Callback with extracted criteria
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, PrismSparkle, Loader, Lock, Sparkles } from '../icons';
import { useNLQuery } from '../../context/NLQueryContext';
import { useSubscription } from '../../context/SubscriptionContext';
import './NLQueryBar.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function NLQueryBar({ context, placeholder, enableDirectScreen, onScreeningCriteria }) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsGreeting, setSuggestionsGreeting] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef(null);

  const { openPanel, setContext, addMessage, clearConversation } = useNLQuery();
  const { tier, usage, hasFeature, promptUpgrade, isGrandfatheredActive } = useSubscription();

  // Check if user has AI query access
  const aiQueryLimit = tier === 'free' && !isGrandfatheredActive ? 10 : null;
  const aiQueriesUsed = usage?.ai_queries || 0;
  const hasUnlimitedAI = tier === 'pro' || tier === 'ultra' || isGrandfatheredActive;
  const remainingQueries = aiQueryLimit ? Math.max(0, aiQueryLimit - aiQueriesUsed) : null;
  const isBlocked = !hasUnlimitedAI && remainingQueries === 0;

  // Fetch suggestions based on context
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const params = new URLSearchParams();
        if (context?.symbol) params.append('symbol', context.symbol);
        if (context?.page) params.append('page', context.page);
        if (context?.sector) params.append('sector', context.sector);

        const response = await fetch(`${API_BASE}/api/nl/suggestions?${params}`);
        const data = await response.json();
        setSuggestions(data.suggestions || []);
        setSuggestionsGreeting(data.greeting || null);
      } catch (e) {
        console.error('Failed to fetch suggestions:', e);
      }
    };

    fetchSuggestions();
  }, [context]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    // Check subscription access
    if (isBlocked) {
      promptUpgrade({
        feature: 'ai_queries',
        requiredTier: 'pro',
        reason: 'You\'ve used all 10 free AI queries this month'
      });
      return;
    }

    // Debug: log props to verify they're being passed correctly
    console.log('[NLQueryBar] handleSubmit called with:', {
      query: query.trim(),
      enableDirectScreen,
      contextPage: context?.page,
      hasCallback: !!onScreeningCriteria
    });

    // If direct screening is enabled on the Screening page, try to extract criteria
    if (enableDirectScreen && context?.page === 'screening' && onScreeningCriteria) {
      setIsProcessing(true);
      setShowSuggestions(false);

      try {
        console.log('[NLQueryBar] Calling /api/nl/screen with query:', query.trim());
        const response = await fetch(`${API_BASE}/api/nl/screen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim(), context })
        });

        console.log('[NLQueryBar] Response status:', response.status);
        const data = await response.json();
        console.log('[NLQueryBar] Response data:', data);

        // If it's a screening intent with good confidence, use direct screening
        if (data.success && data.intent === 'screen' && data.confidence >= 0.5) {
          console.log('[NLQueryBar] Direct screening - calling onScreeningCriteria');
          onScreeningCriteria(data);
          setQuery('');
          setIsProcessing(false);
          return;
        }

        // Otherwise fall back to opening the chat panel
        console.log('[NLQueryBar] Falling back to chat panel:', data.intent, data.confidence);
      } catch (error) {
        console.error('[NLQueryBar] Screening extraction failed:', error);
      }

      setIsProcessing(false);
    }

    // Default behavior: open chat panel
    clearConversation();
    setContext(context);
    addMessage({ role: 'user', content: query.trim() });
    openPanel();

    // Clear the input after opening panel
    setQuery('');
    setShowSuggestions(false);
  };

  const handleSuggestionClick = async (suggestion) => {
    setShowSuggestions(false);

    // Check subscription access
    if (isBlocked) {
      promptUpgrade({
        feature: 'ai_queries',
        requiredTier: 'pro',
        reason: 'You\'ve used all 10 free AI queries this month'
      });
      return;
    }

    // If direct screening is enabled on the Screening page, use the same logic as handleSubmit
    if (enableDirectScreen && context?.page === 'screening' && onScreeningCriteria) {
      setIsProcessing(true);

      try {
        console.log('[NLQueryBar] Suggestion clicked - calling /api/nl/screen with:', suggestion);
        const response = await fetch(`${API_BASE}/api/nl/screen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: suggestion, context })
        });

        const data = await response.json();
        console.log('[NLQueryBar] Suggestion response:', data);

        if (data.success && data.intent === 'screen' && data.confidence >= 0.5) {
          console.log('[NLQueryBar] Direct screening from suggestion - calling onScreeningCriteria');
          onScreeningCriteria(data);
          setIsProcessing(false);
          return;
        }
      } catch (error) {
        console.error('[NLQueryBar] Screening extraction failed:', error);
      }

      setIsProcessing(false);
    }

    // Fallback: open chat panel
    clearConversation();
    setContext(context);
    addMessage({ role: 'user', content: suggestion });
    openPanel();
  };

  const clearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
  };

  const handleInputBlur = () => {
    // Delay to allow suggestion clicks to register
    setTimeout(() => setShowSuggestions(false), 200);
  };

  // Handle upgrade click for locked state
  const handleUpgradeClick = () => {
    promptUpgrade({
      feature: 'ai_queries',
      requiredTier: 'pro',
      reason: 'Unlock unlimited AI queries with a Pro subscription'
    });
  };

  return (
    <div className={`nl-query-bar ${isBlocked ? 'nl-query-bar--locked' : ''}`}>
      <form onSubmit={handleSubmit} className="nl-query-form">
        <div className="nl-input-wrapper">
          <div className="nl-ai-icon">
            {isBlocked ? (
              <Lock size={14} className="ai-lock" />
            ) : (
              <PrismSparkle size={14} className="ai-sparkle" />
            )}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={isBlocked ? "Upgrade to unlock AI queries" : (placeholder || "Ask anything about stocks...")}
            className="nl-input"
            disabled={isBlocked}
          />
          {query && !isBlocked && (
            <button type="button" onClick={clearQuery} className="nl-clear-btn">
              <X size={16} />
            </button>
          )}
          {/* Usage indicator for free tier */}
          {remainingQueries !== null && !isBlocked && (
            <span className="nl-usage-indicator" title={`${remainingQueries} AI queries remaining this month`}>
              {remainingQueries}
            </span>
          )}
          {isBlocked ? (
            <button type="button" className="nl-upgrade-btn" onClick={handleUpgradeClick}>
              <Sparkles size={14} />
              Upgrade
            </button>
          ) : (
            <button type="submit" className="nl-submit-btn" disabled={!query.trim() || isProcessing}>
              {isProcessing ? <Loader size={18} className="spin" /> : <Search size={18} />}
            </button>
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && !isBlocked && (
          <div className="nl-suggestions">
            <div className="nl-suggestions-label">
              {suggestionsGreeting || 'Try asking:'}
            </div>
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className="nl-suggestion-item"
                onClick={() => handleSuggestionClick(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}

export default NLQueryBar;
