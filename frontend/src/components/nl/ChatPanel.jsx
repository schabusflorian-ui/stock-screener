/**
 * ChatPanel - Right sidebar chat panel for PRISM AI assistant
 *
 * Features:
 * - Fixed right sidebar (not modal)
 * - Multi-turn conversation history
 * - Conversation history drawer
 * - Minimized/docked mode
 * - Auto-scroll to latest message
 * - Follow-up suggestions
 * - Keyboard navigation (Escape to close)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Send, PrismSparkle, Loader2, RefreshCw, TrendingUp,
  Building2, Users, Clock, Trash2, History, Plus,
  Database, LineChart, BarChart3, Search, Calculator, Newspaper,
  MessageSquare, Minimize2
} from '../icons';
import { useNLQuery } from '../../context/NLQueryContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import ChatBubble from './ChatBubble';
import TypingIndicator from './TypingIndicator';
import './ChatPanel.css';

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

// SSE Event Types (must match backend)
const SSE_EVENTS = {
  TEXT_DELTA: 'text_delta',
  TOOL_START: 'tool_start',
  TOOL_RESULT: 'tool_result',
  METADATA: 'metadata',
  DONE: 'done',
  ERROR: 'error'
};

// Tool icons and descriptive names for enhanced status display
const TOOL_CONFIG = {
  'lookup_company_metrics': {
    icon: Database,
    label: 'Fetching company data',
    shortLabel: 'Company data'
  },
  'get_price_history': {
    icon: LineChart,
    label: 'Loading price history',
    shortLabel: 'Price data'
  },
  'get_sentiment': {
    icon: MessageSquare,
    label: 'Analyzing sentiment',
    shortLabel: 'Sentiment'
  },
  'screen_stocks': {
    icon: Search,
    label: 'Screening stocks',
    shortLabel: 'Screener'
  },
  'compare_companies': {
    icon: BarChart3,
    label: 'Comparing companies',
    shortLabel: 'Comparison'
  },
  'get_investor_holdings': {
    icon: Users,
    label: 'Loading investor holdings',
    shortLabel: 'Holdings'
  },
  'get_macro_data': {
    icon: TrendingUp,
    label: 'Fetching macro data',
    shortLabel: 'Macro'
  },
  'get_congressional_trades': {
    icon: Building2,
    label: 'Checking congressional trades',
    shortLabel: 'Congress'
  },
  'get_financial_statements': {
    icon: Database,
    label: 'Loading financials',
    shortLabel: 'Financials'
  },
  'calculate_metric': {
    icon: Calculator,
    label: 'Calculating metrics',
    shortLabel: 'Calculating'
  },
  'get_insider_activity': {
    icon: Users,
    label: 'Checking insider activity',
    shortLabel: 'Insiders'
  },
  'get_technical_signals': {
    icon: LineChart,
    label: 'Analyzing technicals',
    shortLabel: 'Technicals'
  },
  'get_earnings_calendar': {
    icon: Clock,
    label: 'Loading earnings calendar',
    shortLabel: 'Earnings'
  },
  'get_short_interest': {
    icon: TrendingUp,
    label: 'Checking short interest',
    shortLabel: 'Short interest'
  },
  'get_news': {
    icon: Newspaper,
    label: 'Fetching latest news',
    shortLabel: 'News'
  }
};

function ChatPanel() {
  const {
    isPanelOpen,
    closePanel,
    context,
    messages,
    addMessage,
    updateMessage,
    clearConversation,
    conversationId,
    updateConversationId,
    loadConversationList,
    conversationList,
    switchConversation,
    deleteConversation,
    isLoadingHistory,
    sessionId
  } = useNLQuery();

  const { getUsageStatus, incrementUsage, promptUpgrade } = useSubscription();
  const { isAdmin } = useAuth();
  const aiQueryUsage = getUsageStatus('ai_queries_monthly');

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [currentTool, setCurrentTool] = useState(null); // { name, icon, label }
  const [showHistory, setShowHistory] = useState(false);
  const [isMinimized, setIsMinimized] = useState(() => {
    return localStorage.getItem('nl_panel_minimized') === 'true';
  });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const historyDropdownRef = useRef(null);
  const handleSubmitRef = useRef(null);
  const navigate = useNavigate();

  // Load conversation list when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      loadConversationList();
    }
  }, [isPanelOpen, loadConversationList]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isPanelOpen, isMinimized]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPanelOpen) {
        if (showHistory) {
          setShowHistory(false);
        } else {
          closePanel();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, closePanel, showHistory]);

  // Save minimized state
  useEffect(() => {
    localStorage.setItem('nl_panel_minimized', String(isMinimized));
  }, [isMinimized]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(e.target)) {
        setShowHistory(false);
      }
    };
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHistory]);

  const handleSubmit = useCallback(async (e, queryOverride = null, contextOverride = null) => {
    if (e) e.preventDefault();

    const query = queryOverride || inputValue.trim();
    if (!query || isLoading) return;

    // Check usage limits before proceeding
    if (aiQueryUsage.status === 'exceeded' && !aiQueryUsage.unlimited) {
      promptUpgrade({
        metric: 'ai_queries_monthly',
        reason: `You've used all ${aiQueryUsage.limit} AI queries this month`,
        requiredTier: 'pro'
      });
      return;
    }

    // Use context override if provided (e.g., from right-click Ask AI)
    const effectiveContext = contextOverride || context || {};

    // Expand if minimized
    if (isMinimized) {
      setIsMinimized(false);
    }

    setInputValue('');
    setError(null);
    setCurrentTool(null);

    // Add user message immediately
    addMessage({
      role: 'user',
      content: query
    });

    // Add placeholder assistant message for streaming
    const assistantMsgId = addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true
    });

    setIsLoading(true);

    try {
      // Use streaming endpoint
      const headers = { 'Content-Type': 'application/json' };
      if (isAdmin) headers['X-Admin-Bypass'] = 'true';
      const response = await fetch(`${API_BASE}/api/nl/query/stream`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          query,
          context: effectiveContext,
          conversation_id: conversationId,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let metadata = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case SSE_EVENTS.TEXT_DELTA:
                  accumulatedText += data.text;
                  updateMessage(assistantMsgId, {
                    content: accumulatedText,
                    isStreaming: true
                  });
                  break;

                case SSE_EVENTS.TOOL_START:
                  const toolConfig = TOOL_CONFIG[data.tool] || {
                    icon: Database,
                    label: `Fetching ${data.tool.replace(/_/g, ' ')}`,
                    shortLabel: data.tool.replace(/_/g, ' ')
                  };
                  setCurrentTool({
                    name: data.tool,
                    icon: toolConfig.icon,
                    label: toolConfig.label
                  });
                  break;

                case SSE_EVENTS.TOOL_RESULT:
                  setCurrentTool(null);
                  break;

                case SSE_EVENTS.METADATA:
                  metadata = data;
                  console.log('[ChatPanel] METADATA received:', {
                    hasChartData: !!data?.chart_data,
                    chartType: data?.chart_data?.type,
                    seriesCount: data?.chart_data?.series?.length
                  });
                  break;

                case SSE_EVENTS.DONE:
                  // Finalize the message with full result
                  updateMessage(assistantMsgId, {
                    content: accumulatedText,
                    isStreaming: false,
                    result: {
                      type: 'llm_response',
                      message: accumulatedText,
                      tools_used: metadata?.tools_used || [],
                      chart_data: metadata?.chart_data,
                      analyst_chart_data: metadata?.analyst_chart_data,
                      additional_charts: metadata?.additional_charts,
                      price_comparison_chart: metadata?.price_comparison_chart,
                      scatter_chart: metadata?.scatter_chart,
                      heatmap_chart: metadata?.heatmap_chart,
                      symbol: metadata?.symbol,
                      data: metadata?.data
                    },
                    intent: 'llm_processed'
                  });
                  // Mark onboarding task complete on first AI query
                  markOnboardingTaskComplete('ai_query');
                  break;

                case SSE_EVENTS.ERROR:
                  throw new Error(data.error);

                case 'conversation':
                  if (data.conversation_id) {
                    updateConversationId(data.conversation_id);
                  }
                  break;

                default:
                  break;
              }
            } catch (parseErr) {
              console.warn('Failed to parse SSE data:', parseErr);
            }
            currentEvent = null;
          }
        }
      }

      setSuggestions([]);

    } catch (err) {
      console.error('NL query error:', err);
      setError('Failed to process your question. Please try again.');
      updateMessage(assistantMsgId, {
        content: 'Sorry, I encountered an error processing your question. Please try again.',
        isStreaming: false,
        result: { type: 'error', message: err.message },
        intent: 'error'
      });
    } finally {
      setIsLoading(false);
      setCurrentTool(null);
    }
  }, [inputValue, isLoading, context, conversationId, addMessage, updateMessage, updateConversationId, sessionId, isMinimized]);

  // Keep ref updated with latest handleSubmit
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Listen for context menu query events (from right-click "Ask AI" feature)
  // Uses ref to avoid re-registering listener when handleSubmit changes
  useEffect(() => {
    const handleContextQuery = (e) => {
      console.log('[ChatPanel] Received prism-context-query event', e.detail);
      const { query, context: eventContext } = e.detail || {};
      if (query && handleSubmitRef.current) {
        // Delay to ensure panel is fully open and state is ready
        setTimeout(() => {
          console.log('[ChatPanel] Calling handleSubmit with query and context:', { query, eventContext });
          // Pass context directly from event to avoid React state timing issues
          handleSubmitRef.current(null, query, eventContext);
        }, 100);
      }
    };

    window.addEventListener('prism-context-query', handleContextQuery);
    console.log('[ChatPanel] Event listener for prism-context-query registered');
    return () => {
      window.removeEventListener('prism-context-query', handleContextQuery);
      console.log('[ChatPanel] Event listener for prism-context-query removed');
    };
  }, []);  // Empty deps - listener is stable

  const handleSuggestionClick = (suggestion) => {
    handleSubmit(null, suggestion);
  };

  const handleSymbolClick = (symbol) => {
    navigate(`/company/${symbol}`);
  };

  const handleNewConversation = () => {
    clearConversation();
    setSuggestions([]);
    setError(null);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const handleConversationSelect = (convId) => {
    switchConversation(convId);
    setShowHistory(false);
  };

  const handleDeleteConversation = (e, convId) => {
    e.stopPropagation();
    deleteConversation(convId);
  };

  const toggleMinimize = () => {
    setIsMinimized(prev => !prev);
  };

  // Format conversation title from first message
  const getConversationTitle = (conv) => {
    if (conv.title) return conv.title;
    const firstMsg = conv.preview || conv.first_message;
    if (firstMsg) {
      return firstMsg.length > 40 ? firstMsg.slice(0, 40) + '...' : firstMsg;
    }
    return 'New conversation';
  };

  // Format relative time
  const formatRelativeTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isPanelOpen) return null;

  // Minimized state - just a floating button
  if (isMinimized) {
    return (
      <div className="chat-panel-minimized" onClick={toggleMinimize}>
        <div className="chat-panel-minimized-icon">
          <PrismSparkle size={20} />
        </div>
        <span className="chat-panel-minimized-label">PRISM</span>
        {messages.length > 0 && (
          <span className="chat-panel-minimized-badge">{messages.length}</span>
        )}
      </div>
    );
  }

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel-header">
        <div className="chat-panel-title">
          <div className="chat-panel-icon">
            <PrismSparkle size={12} />
          </div>
          <span>PRISM AI</span>
        </div>
        <div className="chat-panel-actions">
          {/* History dropdown */}
          <div className="chat-history-dropdown-wrapper" ref={historyDropdownRef}>
            <button
              className={`chat-panel-action-btn ${showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory(!showHistory)}
              title="Conversation history"
            >
              <History size={16} />
            </button>
            {showHistory && (
              <div className="chat-history-dropdown">
                <div className="chat-history-dropdown-header">
                  <span>Recent Chats</span>
                  <button
                    className="chat-history-new-btn"
                    onClick={handleNewConversation}
                    title="New conversation"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <div className="chat-history-dropdown-list">
                  {conversationList.length === 0 ? (
                    <div className="chat-history-dropdown-empty">
                      No conversations yet
                    </div>
                  ) : (
                    conversationList.slice(0, 8).map(conv => (
                      <div
                        key={conv.id}
                        className={`chat-history-dropdown-item ${conv.id === conversationId ? 'active' : ''}`}
                        onClick={() => handleConversationSelect(conv.id)}
                      >
                        <div className="chat-history-dropdown-item-content">
                          <span className="chat-history-dropdown-item-title">
                            {getConversationTitle(conv)}
                          </span>
                          <span className="chat-history-dropdown-item-time">
                            {formatRelativeTime(conv.updated_at || conv.created_at)}
                          </span>
                        </div>
                        <button
                          className="chat-history-dropdown-item-delete"
                          onClick={(e) => handleDeleteConversation(e, conv.id)}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {messages.length > 0 && (
            <button
              className="chat-panel-action-btn"
              onClick={handleNewConversation}
              title="New conversation"
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button
            className="chat-panel-action-btn"
            onClick={toggleMinimize}
            title="Minimize"
          >
            <Minimize2 size={16} />
          </button>
          <button
            className="chat-panel-close-btn"
            onClick={closePanel}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-panel-messages">
        {isLoadingHistory ? (
          <div className="chat-panel-loading">
            <Loader2 size={20} className="chat-panel-spinner" />
            <span>Loading...</span>
          </div>
        ) : messages.length === 0 && !isLoading ? (
          <div className="chat-panel-welcome">
            <div className="chat-welcome-icon">
              <PrismSparkle size={16} />
            </div>
            <h4>PRISM AI Assistant</h4>
            <p>Ask about stocks, markets, or your portfolio. I'll analyze data and provide insights.</p>

            <div className="chat-welcome-examples">
              <button onClick={() => handleSubmit(null, 'Show me undervalued tech stocks')}>
                <TrendingUp size={14} />
                Undervalued tech
              </button>
              <button onClick={() => handleSubmit(null, "What's the sentiment on NVDA?")}>
                <Building2 size={14} />
                NVDA sentiment
              </button>
              <button onClick={() => handleSubmit(null, "What does Warren Buffett own?")}>
                <Users size={14} />
                Buffett holdings
              </button>
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
          <TypingIndicator
            tool={currentTool}
            message={currentTool?.label || "Thinking"}
          />
        )}

        {error && (
          <div className="chat-panel-error">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && !isLoading && (
        <div className="chat-panel-suggestions">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSuggestionClick(suggestion)}
              className="chat-suggestion-btn"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <form className="chat-panel-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Ask PRISM anything..."
          disabled={isLoading || isLoadingHistory}
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading || isLoadingHistory}
          className="chat-send-btn"
        >
          {isLoading ? <Loader2 size={16} className="chat-panel-spinner" /> : <Send size={16} />}
        </button>
      </form>

      {/* Usage indicator */}
      {!aiQueryUsage.unlimited && (
        <div className={`chat-panel-usage ${aiQueryUsage.status}`}>
          <span className="chat-panel-usage__count">
            {aiQueryUsage.remaining > 0 ? aiQueryUsage.remaining : 0}
          </span>
          <span className="chat-panel-usage__label">
            {aiQueryUsage.status === 'exceeded' ? 'queries used' : 'queries left'}
          </span>
          {aiQueryUsage.status === 'exceeded' && (
            <button
              className="chat-panel-usage__upgrade"
              onClick={() => promptUpgrade({
                metric: 'ai_queries_monthly',
                reason: 'Get more AI queries',
                requiredTier: 'pro'
              })}
            >
              Upgrade
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
