// frontend/src/components/analyst/ChatMessage.jsx
import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot } from '../icons';
import './ChatMessage.css';

/**
 * Single chat message component with markdown support
 * Wrapped in React.memo to prevent unnecessary re-renders when scrolling or other messages update
 */
const ChatMessage = memo(function ChatMessage({ message, analyst }) {
  const isUser = message.role === 'user';
  const timestamp = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })
    : null;

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
      <div
        className="message-avatar"
        style={{
          backgroundColor: isUser ? 'var(--background-secondary)' : `${analyst?.color}30`
        }}
      >
        {isUser ? <User size={18} /> : (analyst?.Icon ? <analyst.Icon size={18} /> : <Bot size={18} />)}
      </div>

      <div className="message-content-wrapper">
        <div className="message-header">
          <span className="message-author">
            {isUser ? 'You' : analyst?.name || 'Analyst'}
          </span>
          {timestamp && <span className="message-time">{timestamp}</span>}
        </div>

        <div className={`message-content ${isUser ? 'user-message' : 'assistant-message'}`}>
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="markdown-content">
              <ReactMarkdown
                components={{
                  // Custom heading styles
                  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
                  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
                  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
                  // Custom table styles
                  table: ({ children }) => (
                    <div className="table-wrapper">
                      <table className="md-table">{children}</table>
                    </div>
                  ),
                  // Custom code blocks
                  code: ({ inline, children }) =>
                    inline ? (
                      <code className="inline-code">{children}</code>
                    ) : (
                      <pre className="code-block"><code>{children}</code></pre>
                    ),
                  // Strong/emphasis for ratings
                  strong: ({ children }) => <strong className="md-strong">{children}</strong>
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {message.metadata && !isUser && (
          <div className="message-metadata">
            {message.metadata.model && (
              <span className="metadata-item">
                Model: {message.metadata.model}
              </span>
            )}
            {message.metadata.tokens > 0 && (
              <span className="metadata-item">
                {message.metadata.tokens} tokens
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
