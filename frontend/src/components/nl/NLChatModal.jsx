/**
 * NLChatModal - Full-screen modal for natural language queries
 *
 * Features:
 * - Multi-turn conversation history
 * - Conversation persistence with sidebar
 * - Auto-scroll to latest message
 * - Follow-up suggestions
 * - Keyboard navigation (Escape to close, Enter to send)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, RefreshCw, MessageSquare, Trash2, ChevronLeft, ChevronRight, Clock, TrendingUp, Building2, Users } from 'lucide-react';
import { useNLQuery } from '../../context/NLQueryContext';
import { useNavigate } from 'react-router-dom';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';
import './NLChatModal.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function NLChatModal() {
  const {
    isModalOpen,
    closeModal,
    initialQuery,
    context,
    messages,
    addMessage,
    clearConversation,
    conversationId,
    updateConversationId,
    conversationList,
    loadConversationList,
    switchConversation,
    deleteConversation,
    isLoadingHistory,
    sessionId
  } = useNLQuery();

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Load conversation list when modal opens
  useEffect(() => {
    if (isModalOpen) {
      loadConversationList();
    }
  }, [isModalOpen, loadConversationList]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isModalOpen]);

  // Handle initial query when modal opens
  useEffect(() => {
    if (isModalOpen && initialQuery && messages.length === 0) {
      // Trigger initial query on modal open
      // We deliberately only depend on isModalOpen and initialQuery to avoid re-triggering
      handleSubmit(null, initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, initialQuery]);

  // Seed conversation with previous query/response from CommandPalette
  useEffect(() => {
    if (isModalOpen && context?.previousQuery && context?.previousResponse && messages.length === 0) {
      // Add the previous exchange to continue the conversation
      addMessage({
        role: 'user',
        content: context.previousQuery
      });
      addMessage({
        role: 'assistant',
        content: context.previousResponse,
        result: { type: 'llm_response', message: context.previousResponse }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, context?.previousQuery, context?.previousResponse]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, closeModal]);

  const handleSubmit = useCallback(async (e, queryOverride = null) => {
    if (e) e.preventDefault();

    const query = queryOverride || inputValue.trim();
    if (!query || isLoading) return;

    setInputValue('');
    setError(null);

    // Add user message immediately
    addMessage({
      role: 'user',
      content: query
    });

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/nl/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          context: context || {},
          conversation_id: conversationId,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      // Update conversation ID for follow-ups
      if (data.conversation_id) {
        updateConversationId(data.conversation_id);
      }

      // Add assistant message
      addMessage({
        role: 'assistant',
        content: data.result?.summary || data.result?.message || '',
        result: data.result,
        intent: data.intent,
        confidence: data.confidence,
        queryInterpretation: data.query_interpretation
      });

      // Update suggestions
      if (data.suggestions?.length > 0) {
        setSuggestions(data.suggestions.slice(0, 4));
      } else {
        setSuggestions([]);
      }

    } catch (err) {
      console.error('NL query error:', err);
      setError('Failed to process your question. Please try again.');
      // Add error message to conversation
      addMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        result: { type: 'error', message: err.message },
        intent: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, context, conversationId, addMessage, updateConversationId]);

  const handleSuggestionClick = (suggestion) => {
    handleSubmit(null, suggestion);
  };

  const handleSymbolClick = (symbol) => {
    navigate(`/company/${symbol}`);
    closeModal();
  };

  const handleNewConversation = () => {
    clearConversation();
    setSuggestions([]);
    setError(null);
    setShowSidebar(false);
    inputRef.current?.focus();
  };

  const handleSelectConversation = (convId) => {
    switchConversation(convId);
    setSuggestions([]);
    setError(null);
    setShowSidebar(false);
  };

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    if (window.confirm('Delete this conversation?')) {
      await deleteConversation(convId);
    }
  };

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isModalOpen) return null;

  return (
    <div className="nl-modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
      <div className={`nl-modal-container ${showSidebar ? 'with-sidebar' : ''}`}>
        {/* Sidebar for conversation history */}
        {showSidebar && (
          <div className="nl-sidebar">
            <div className="nl-sidebar-header">
              <h3>Chat History</h3>
              <button
                className="nl-sidebar-close"
                onClick={() => setShowSidebar(false)}
                title="Close sidebar"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
            <div className="nl-sidebar-content">
              <button
                className="nl-sidebar-new-btn"
                onClick={handleNewConversation}
              >
                <RefreshCw size={16} />
                <span>New Conversation</span>
              </button>

              {conversationList.length === 0 ? (
                <div className="nl-sidebar-empty">
                  <MessageSquare size={24} />
                  <p>No previous conversations</p>
                </div>
              ) : (
                <div className="nl-sidebar-list">
                  {conversationList.map((conv) => (
                    <div
                      key={conv.id}
                      className={`nl-sidebar-item ${conv.id === conversationId ? 'active' : ''}`}
                      onClick={() => handleSelectConversation(conv.id)}
                    >
                      <div className="nl-sidebar-item-content">
                        <span className="nl-sidebar-item-query">
                          {conv.first_query || 'New conversation'}
                        </span>
                        <span className="nl-sidebar-item-meta">
                          <Clock size={12} />
                          {formatRelativeTime(conv.updated_at || conv.created_at)}
                          {conv.last_symbol && (
                            <span className="nl-sidebar-item-symbol">{conv.last_symbol}</span>
                          )}
                        </span>
                      </div>
                      <button
                        className="nl-sidebar-item-delete"
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        title="Delete conversation"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main chat area */}
        <div className="nl-modal-main">
          {/* Header */}
          <div className="nl-modal-header">
            <div className="nl-modal-title">
              {!showSidebar && conversationList.length > 0 && (
                <button
                  className="nl-sidebar-toggle"
                  onClick={() => setShowSidebar(true)}
                  title="Show chat history"
                >
                  <ChevronRight size={18} />
                </button>
              )}
              <Sparkles size={20} className="nl-modal-icon" />
              <span>Ask Anything</span>
            </div>
            <div className="nl-modal-actions">
              {messages.length > 0 && (
                <button
                  className="nl-modal-new-btn"
                  onClick={handleNewConversation}
                  title="New conversation"
                >
                  <RefreshCw size={16} />
                </button>
              )}
              <button className="nl-modal-close-btn" onClick={closeModal} title="Close (Esc)">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="nl-modal-messages">
            {isLoadingHistory ? (
              <div className="nl-loading-history">
                <Loader2 size={24} className="nl-loading-spinner" />
                <span>Loading conversation...</span>
              </div>
            ) : messages.length === 0 && !isLoading ? (
              <div className="nl-modal-welcome">
                <Sparkles size={32} className="nl-welcome-icon" />
                <h3>How can I help you today?</h3>
                <p>Ask me anything about stocks, markets, or your portfolio.</p>

                <div className="nl-welcome-categories">
                  {/* Market Analysis Category */}
                  <div className="nl-welcome-category">
                    <div className="nl-category-header">
                      <TrendingUp size={16} />
                      <span>Market Analysis</span>
                    </div>
                    <div className="nl-category-examples">
                      <button onClick={() => handleSubmit(null, 'Show me undervalued tech stocks')}>
                        Undervalued tech stocks
                      </button>
                      <button onClick={() => handleSubmit(null, 'What sectors are trending?')}>
                        Trending sectors
                      </button>
                    </div>
                  </div>

                  {/* Company Research Category */}
                  <div className="nl-welcome-category">
                    <div className="nl-category-header">
                      <Building2 size={16} />
                      <span>Company Research</span>
                    </div>
                    <div className="nl-category-examples">
                      <button onClick={() => handleSubmit(null, "What's the sentiment on NVDA?")}>
                        NVDA sentiment
                      </button>
                      <button onClick={() => handleSubmit(null, 'Compare AAPL vs MSFT')}>
                        Compare AAPL vs MSFT
                      </button>
                    </div>
                  </div>

                  {/* Smart Money Category */}
                  <div className="nl-welcome-category">
                    <div className="nl-category-header">
                      <Users size={16} />
                      <span>Smart Money</span>
                    </div>
                    <div className="nl-category-examples">
                      <button onClick={() => handleSubmit(null, "What does Warren Buffett own?")}>
                        Buffett holdings
                      </button>
                      <button onClick={() => handleSubmit(null, 'Recent insider buying')}>
                        Insider buying
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((msg, idx) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                onSymbolClick={handleSymbolClick}
                onQuickAction={idx === messages.length - 1 ? (query) => handleSubmit(null, query) : undefined}
              />
            ))}

            {isLoading && (
              <TypingIndicator message="Thinking" />
            )}

            {error && (
              <div className="nl-error-message">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && !isLoading && (
            <div className="nl-modal-suggestions">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="nl-suggestion-btn"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Input Area */}
          <form className="nl-modal-input" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a follow-up question..."
              disabled={isLoading || isLoadingHistory}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading || isLoadingHistory}
              className="nl-send-btn"
            >
              {isLoading ? <Loader2 size={18} className="nl-loading-spinner" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default NLChatModal;
