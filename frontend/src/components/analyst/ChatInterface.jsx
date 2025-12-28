// frontend/src/components/analyst/ChatInterface.jsx
import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import { analystAPI } from '../../services/api';
import './ChatInterface.css';

/**
 * Chat interface for conversing with an AI analyst
 */
export default function ChatInterface({
  analyst,
  messages,
  onSendMessage,
  isLoading,
  streamingContent = '',
  companySymbol,
  onBack
}) {
  const [input, setInput] = useState('');
  const [llmStatus, setLlmStatus] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Check LLM status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await analystAPI.health();
        setLlmStatus(response.data.llm);
      } catch (err) {
        setLlmStatus({ enabled: false, mode: 'offline' });
      }
    };
    checkStatus();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [analyst]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    onSendMessage(input.trim());
    setInput('');
  };

  const handleSuggestionClick = (question) => {
    setInput(question);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!analyst) {
    return (
      <div className="chat-interface-empty">
        <p>Select an analyst to start chatting</p>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {/* Header */}
      <div className="chat-header" style={{ borderColor: analyst.color }}>
        {onBack && (
          <button className="chat-back-btn" onClick={onBack} title="Choose different analyst">
            <span className="back-icon">←</span>
          </button>
        )}
        <span className="chat-analyst-icon">{analyst.icon}</span>
        <div className="chat-analyst-info">
          <h2 className="chat-analyst-name">{analyst.name}</h2>
          <span className="chat-analyst-title">
            {analyst.title}
            {companySymbol && <span className="chat-company"> • Analyzing {companySymbol}</span>}
          </span>
        </div>
        {llmStatus && (
          <div className={`llm-status ${llmStatus.enabled ? 'active' : 'mock'}`}>
            <span className="llm-status-dot" />
            <span className="llm-status-text">
              {llmStatus.enabled
                ? llmStatus.mode === 'claude' ? 'Claude AI' : 'Ollama'
                : 'Demo Mode'}
            </span>
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <span className="welcome-icon">{analyst.icon}</span>
            <h3 className="welcome-title">Hi, I'm {analyst.name}</h3>
            <p className="welcome-description">{analyst.description}</p>

            {analyst.suggested_questions?.length > 0 && (
              <div className="welcome-suggestions">
                <span className="suggestions-label">Try asking:</span>
                <div className="suggestions-list">
                  {analyst.suggested_questions.map((q, i) => (
                    <button
                      key={i}
                      className="suggestion-btn"
                      onClick={() => handleSuggestionClick(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {analyst.influences?.length > 0 && (
              <div className="welcome-influences">
                <span className="influences-label">My thinking is influenced by: </span>
                <span className="influences-names">{analyst.influences.join(', ')}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatMessage key={msg.id || i} message={msg} analyst={analyst} />
            ))}
          </>
        )}

        {isLoading && (
          streamingContent ? (
            // Show streaming response
            <div className="chat-streaming">
              <div className="streaming-avatar" style={{ backgroundColor: `${analyst.color}30` }}>
                {analyst.icon}
              </div>
              <div className="streaming-content">
                <div className="streaming-text">{streamingContent}</div>
                <span className="streaming-cursor">▋</span>
              </div>
            </div>
          ) : (
            // Show loading animation before streaming starts
            <div className="chat-loading">
              <div className="loading-avatar" style={{ backgroundColor: `${analyst.color}30` }}>
                {analyst.icon}
              </div>
              <div className="loading-content">
                <span className="loading-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
                <span className="loading-text">{analyst.name} is thinking...</span>
              </div>
            </div>
          )
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${analyst.name}...`}
            disabled={isLoading}
            rows={1}
            className="chat-input"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="chat-send-btn"
            style={{ backgroundColor: input.trim() && !isLoading ? analyst.color : undefined }}
          >
            <span className="send-icon">↑</span>
          </button>
        </div>
        <div className="chat-input-hint">
          Press Enter to send, Shift+Enter for new line
        </div>
      </form>
    </div>
  );
}
