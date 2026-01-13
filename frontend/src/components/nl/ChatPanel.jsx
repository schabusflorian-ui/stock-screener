/**
 * ChatPanel - Right sidebar chat panel for natural language queries
 *
 * Features:
 * - Fixed right sidebar (not modal)
 * - Multi-turn conversation history
 * - Auto-scroll to latest message
 * - Follow-up suggestions
 * - Keyboard navigation (Escape to close)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, RefreshCw, TrendingUp, Building2, Users } from 'lucide-react';
import { useNLQuery } from '../../context/NLQueryContext';
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
    isLoadingHistory,
    sessionId
  } = useNLQuery();

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [streamingStatus, setStreamingStatus] = useState(null); // Current tool being executed

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
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
    if (isPanelOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isPanelOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPanelOpen) {
        closePanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPanelOpen, closePanel]);

  const handleSubmit = useCallback(async (e, queryOverride = null) => {
    if (e) e.preventDefault();

    const query = queryOverride || inputValue.trim();
    if (!query || isLoading) return;

    setInputValue('');
    setError(null);
    setStreamingStatus(null);

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
      const response = await fetch(`${API_BASE}/api/nl/query/stream`, {
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
                  setStreamingStatus(`Fetching ${formatToolName(data.tool)}...`);
                  break;

                case SSE_EVENTS.TOOL_RESULT:
                  setStreamingStatus(null);
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
      setStreamingStatus(null);
    }
  }, [inputValue, isLoading, context, conversationId, addMessage, updateMessage, updateConversationId, sessionId]);

  // Helper to format tool names for display
  const formatToolName = (toolName) => {
    const names = {
      'lookup_company_metrics': 'company data',
      'get_price_history': 'price history',
      'get_sentiment': 'sentiment data',
      'screen_stocks': 'stock screener',
      'compare_companies': 'comparison data',
      'get_investor_holdings': 'investor holdings',
      'get_macro_data': 'macro data',
      'get_congressional_trades': 'congressional trades',
      'get_financial_statements': 'financial statements',
      'calculate_metric': 'calculations',
      'get_insider_activity': 'insider activity',
      'get_technical_signals': 'technical signals',
      'get_earnings_calendar': 'earnings data',
      'get_short_interest': 'short interest'
    };
    return names[toolName] || toolName.replace(/_/g, ' ');
  };

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
    inputRef.current?.focus();
  };

  if (!isPanelOpen) return null;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-panel-header">
        <div className="chat-panel-title">
          <Sparkles size={18} className="chat-panel-icon" />
          <span>Ask AI</span>
        </div>
        <div className="chat-panel-actions">
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
            <Sparkles size={24} className="chat-welcome-icon" />
            <h4>How can I help?</h4>
            <p>Ask about stocks, markets, or your portfolio.</p>

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
          <TypingIndicator message={streamingStatus || "Thinking"} />
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
          placeholder="Ask a question..."
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
    </div>
  );
}

export default ChatPanel;
