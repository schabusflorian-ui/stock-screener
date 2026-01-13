// pages/help/AIHelpAssistant.jsx
import { useState } from 'react';
import { Sparkles, Send } from 'lucide-react';
import './AIHelpAssistant.css';

/**
 * AI-Powered Help Assistant
 * Provides intelligent search and answers using the NL Query system
 */
export const AIHelpAssistant = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setResponse(null);

    try {
      const API_BASE = process.env.REACT_APP_API_URL || '';

      // Use the existing NL Query system with help context
      const res = await fetch(`${API_BASE}/api/nl/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query,
          context: 'help', // Tell AI this is a help query
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResponse({
          answer: data.response,
          suggestedActions: data.suggestedActions || [],
        });
      } else {
        setResponse({
          answer: 'I couldn\'t find a specific answer, but here are some resources that might help:',
          suggestedActions: [
            { label: 'Browse FAQ', link: '#faq' },
            { label: 'Contact Support', link: 'mailto:support@yourplatform.com' },
          ],
        });
      }
    } catch (error) {
      console.error('AI help query failed:', error);
      setResponse({
        answer: 'Sorry, I\'m having trouble connecting right now. Please try browsing the FAQ below or contact support.',
        suggestedActions: [
          { label: 'Browse FAQ', link: '#faq' },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const exampleQuestions = [
    'How do I create a watchlist?',
    'What does P/E ratio mean?',
    'How to set up price alerts?',
    'How does backtesting work?',
  ];

  return (
    <div className="ai-help-assistant">
      <div className="ai-help-header">
        <div className="ai-help-title">
          <Sparkles className="ai-icon" />
          <span>Ask AI Assistant</span>
        </div>
      </div>

      <div className="ai-help-body">
        {!response && !loading && (
          <div className="ai-help-examples">
            <p className="examples-title">Try asking:</p>
            {exampleQuestions.map((q, i) => (
              <button
                key={i}
                onClick={() => setQuery(q)}
                className="example-question"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="ai-help-loading">
            <div className="loading-spinner" />
            <p>Thinking...</p>
          </div>
        )}

        {response && (
          <div className="ai-help-response">
            <div className="response-answer">
              {response.answer}
            </div>

            {response.suggestedActions?.length > 0 && (
              <div className="response-actions">
                <p className="actions-title">Suggested actions:</p>
                {response.suggestedActions.map((action, i) => (
                  <a
                    key={i}
                    href={action.link}
                    className="action-button"
                    onClick={(e) => {
                      if (action.link.startsWith('#')) {
                        e.preventDefault();
                        document.querySelector(action.link)?.scrollIntoView({
                          behavior: 'smooth'
                        });
                      }
                    }}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setResponse(null);
                setQuery('');
              }}
              className="ask-another-btn"
            >
              Ask another question
            </button>
          </div>
        )}
      </div>

      <div className="ai-help-footer">
        <div className="ai-help-input-wrapper">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about the platform..."
            className="ai-help-input"
            rows={2}
          />
          <button
            onClick={handleAsk}
            disabled={!query.trim() || loading}
            className="ai-help-send"
            aria-label="Send question"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="ai-help-disclaimer">
          AI-powered answers. May not be 100% accurate.
        </p>
      </div>
    </div>
  );
};
