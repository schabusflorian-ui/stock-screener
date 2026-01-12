// frontend/src/components/nl/NLQueryBar.jsx
/**
 * Natural Language Query Bar Component
 *
 * A search bar that accepts natural language investment queries
 * and opens a chat modal for results.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Sparkles } from 'lucide-react';
import { useNLQuery } from '../../context/NLQueryContext';
import './NLQueryBar.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function NLQueryBar({ context, placeholder }) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsGreeting, setSuggestionsGreeting] = useState(null);
  const inputRef = useRef(null);

  const { openModal } = useNLQuery();

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

    // Open the chat modal with the query
    openModal(query, context);

    // Clear the input after opening modal
    setQuery('');
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (suggestion) => {
    setShowSuggestions(false);
    // Open the chat modal with the suggestion
    openModal(suggestion, context);
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

  return (
    <div className="nl-query-bar">
      <form onSubmit={handleSubmit} className="nl-query-form">
        <div className="nl-input-wrapper">
          <Sparkles size={18} className="nl-icon sparkles" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={placeholder || "Ask anything about stocks..."}
            className="nl-input"
          />
          {query && (
            <button type="button" onClick={clearQuery} className="nl-clear-btn">
              <X size={16} />
            </button>
          )}
          <button type="submit" className="nl-submit-btn" disabled={!query.trim()}>
            <Search size={18} />
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
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
