/**
 * ChatBubble - Individual message bubble for NL chat
 *
 * Features:
 * - User messages (right-aligned)
 * - Assistant messages with formatted results
 * - ReactMarkdown for text content
 * - Intent badge and confidence indicator
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { PrismSparkle, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, HelpCircle } from '../icons';
import { formatResponse } from './formatters';
import QuickActions from './QuickActions';
import './ChatBubble.css';

function ChatBubble({ message, onSymbolClick, onQuickAction }) {
  const { role, content, result, intent, confidence, timestamp, isStreaming } = message;
  const isUser = role === 'user';
  const symbol = result?.symbol;

  const formatTime = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // User message - simple text bubble
  if (isUser) {
    return (
      <div className="chat-bubble chat-bubble-user">
        <div className="bubble-content">
          {content}
        </div>
        {timestamp && <span className="bubble-time">{formatTime(timestamp)}</span>}
      </div>
    );
  }

  // Assistant message - formatted result
  return (
    <div className="chat-bubble chat-bubble-assistant">
      <div className="bubble-header">
        <div className="bubble-ai-icon">
          <PrismSparkle size={12} />
        </div>
        {intent && intent !== 'error' && (
          <span className="bubble-intent">{intent}</span>
        )}
        {confidence && <ConfidenceIndicator level={confidence} />}
      </div>

      <div className="bubble-content">
        {/* Streaming content - render incrementally as it arrives */}
        {isStreaming && content && (
          <div className="bubble-streaming">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="md-p">{children}</p>,
                strong: ({ children }) => <strong className="md-strong">{children}</strong>,
                em: ({ children }) => <em className="md-em">{children}</em>,
                ul: ({ children }) => <ul className="md-ul">{children}</ul>,
                ol: ({ children }) => <ol className="md-ol">{children}</ol>,
                li: ({ children }) => <li className="md-li">{children}</li>,
                code: ({ inline, children }) =>
                  inline ? (
                    <code className="md-code-inline">{children}</code>
                  ) : (
                    <pre className="md-code-block"><code>{children}</code></pre>
                  ),
              }}
            >
              {content}
            </ReactMarkdown>
            <span className="streaming-cursor" />
          </div>
        )}

        {/* Show summary/interpretation as markdown if available (non-streaming) */}
        {!isStreaming && result?.summary && (
          <div className="bubble-summary">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="md-p">{children}</p>,
                strong: ({ children }) => <strong className="md-strong">{children}</strong>,
                em: ({ children }) => <em className="md-em">{children}</em>,
                ul: ({ children }) => <ul className="md-ul">{children}</ul>,
                ol: ({ children }) => <ol className="md-ol">{children}</ol>,
                li: ({ children }) => <li className="md-li">{children}</li>,
                code: ({ inline, children }) =>
                  inline ? (
                    <code className="md-code-inline">{children}</code>
                  ) : (
                    <pre className="md-code-block"><code>{children}</code></pre>
                  ),
              }}
            >
              {result.summary}
            </ReactMarkdown>
          </div>
        )}

        {/* Formatted result data (only show when done streaming) */}
        {!isStreaming && result && result.type !== 'error' && (
          <div className="bubble-result">
            {formatResponse(result, onSymbolClick)}
          </div>
        )}

        {/* Error display */}
        {result?.type === 'error' && (
          <div className="bubble-error">
            <AlertCircle size={16} />
            <span>{result.message || 'An error occurred'}</span>
          </div>
        )}

        {/* Fallback to plain content if no result and not streaming */}
        {!isStreaming && !result && content && (
          <div className="bubble-text">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {/* Quick actions for follow-up queries (only when done) */}
        {!isStreaming && onQuickAction && result?.type !== 'error' && (
          <QuickActions
            result={result}
            symbol={symbol}
            onAction={onQuickAction}
          />
        )}
      </div>

      {timestamp && <span className="bubble-time">{formatTime(timestamp)}</span>}
    </div>
  );
}

function ConfidenceIndicator({ level }) {
  const getConfig = () => {
    if (level === 'high' || level > 0.7) {
      return { icon: CheckCircle, className: 'confidence-high', label: 'High' };
    } else if (level === 'medium' || (level > 0.4 && level <= 0.7)) {
      return { icon: HelpCircle, className: 'confidence-medium', label: 'Medium' };
    } else {
      return { icon: AlertCircle, className: 'confidence-low', label: 'Low' };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <span className={`confidence-indicator ${config.className}`} title={`Confidence: ${config.label}`}>
      <Icon size={12} />
    </span>
  );
}

export function SignalBadge({ signal }) {
  if (!signal) return null;

  const signalLower = signal.toLowerCase();
  let className = 'signal-badge signal-neutral';
  let Icon = Minus;

  if (signalLower.includes('buy') || signalLower.includes('bullish') || signalLower.includes('strong_buy')) {
    className = 'signal-badge signal-bullish';
    Icon = TrendingUp;
  } else if (signalLower.includes('sell') || signalLower.includes('bearish') || signalLower.includes('strong_sell')) {
    className = 'signal-badge signal-bearish';
    Icon = TrendingDown;
  }

  return (
    <span className={className}>
      <Icon size={12} />
      {signal.replace(/_/g, ' ')}
    </span>
  );
}

export default ChatBubble;
