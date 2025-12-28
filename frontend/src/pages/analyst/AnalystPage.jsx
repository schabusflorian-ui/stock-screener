// frontend/src/pages/analyst/AnalystPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnalystSelector, ChatInterface, ConversationHistory } from '../../components/analyst';
import { analystAPI, companyAPI, sentimentAPI } from '../../services/api';
import './AnalystPage.css';

/**
 * Main page for AI investment analysts
 */
export default function AnalystPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [analysts, setAnalysts] = useState([]);
  const [selectedAnalyst, setSelectedAnalyst] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAnalysts, setLoadingAnalysts] = useState(true);
  const [error, setError] = useState(null);
  const [streamingContent, setStreamingContent] = useState('');

  // Company context (optional)
  const [companySymbol, setCompanySymbol] = useState(searchParams.get('symbol') || '');
  const [companyContext, setCompanyContext] = useState(null);
  const [loadingCompany, setLoadingCompany] = useState(false);

  // Load analysts on mount
  useEffect(() => {
    loadAnalysts();
  }, []);

  // Auto-select analyst from URL param
  useEffect(() => {
    const analystParam = searchParams.get('analyst');
    if (analystParam && analysts.length > 0) {
      const analyst = analysts.find(a => a.id === analystParam);
      if (analyst && !selectedAnalyst) {
        handleSelectAnalyst(analystParam);
      }
    }
  }, [analysts, searchParams]);

  // Load company context when symbol changes
  useEffect(() => {
    if (companySymbol) {
      loadCompanyContext(companySymbol);
    } else {
      setCompanyContext(null);
    }
  }, [companySymbol]);

  const loadAnalysts = async () => {
    setLoadingAnalysts(true);
    try {
      const response = await analystAPI.getAnalysts();
      setAnalysts(response.data.analysts || []);
    } catch (err) {
      console.error('Failed to load analysts:', err);
      setError('Failed to load analysts. Please try again.');
    } finally {
      setLoadingAnalysts(false);
    }
  };

  const loadCompanyContext = async (symbol) => {
    if (!symbol) return;

    setLoadingCompany(true);
    try {
      // Fetch company data, metrics, and sentiment in parallel
      const [companyRes, metricsRes, sentimentRes] = await Promise.allSettled([
        companyAPI.getOne(symbol),
        companyAPI.getMetrics(symbol),
        sentimentAPI.getAnalyst(symbol)
      ]);

      const context = {
        company: companyRes.status === 'fulfilled' ? companyRes.value.data : null,
        metrics: metricsRes.status === 'fulfilled' ? metricsRes.value.data?.metrics?.[0] : null,
        analyst_ratings: sentimentRes.status === 'fulfilled' ? sentimentRes.value.data : null
      };

      setCompanyContext(context);
    } catch (err) {
      console.error('Failed to load company context:', err);
      // Don't show error, just proceed without context
    } finally {
      setLoadingCompany(false);
    }
  };

  const handleSelectAnalyst = async (analystId) => {
    setError(null);

    const analyst = analysts.find(a => a.id === analystId);
    if (!analyst) return;

    setSelectedAnalyst(analyst);
    setMessages([]);

    // Update URL
    const params = new URLSearchParams(searchParams);
    params.set('analyst', analystId);
    setSearchParams(params, { replace: true });

    // Create conversation
    try {
      const response = await analystAPI.createConversation({
        analystId,
        companySymbol: companySymbol || undefined
      });
      setConversation(response.data.conversation);
    } catch (err) {
      console.error('Failed to create conversation:', err);
      setError('Failed to start conversation. Please try again.');
    }
  };

  const handleSendMessage = useCallback(async (message) => {
    if (!conversation || isLoading) return;

    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    // Optimistically add user message
    const userMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMessage]);

    // Use streaming API
    analystAPI.sendMessageStream(
      conversation.id,
      message,
      companyContext,
      {
        onStart: (messageId) => {
          // Streaming has started
        },
        onToken: (token) => {
          // Append token to streaming content
          setStreamingContent(prev => prev + token);
        },
        onComplete: (assistantMessage) => {
          // Add the complete message to messages array
          setMessages(prev => [...prev, assistantMessage]);
          setStreamingContent('');
          setIsLoading(false);
        },
        onError: (err) => {
          console.error('Streaming error:', err);
          setError('Failed to get response. Please try again.');
          // Remove the optimistic user message on error
          setMessages(prev => prev.filter(m => m.id !== userMessage.id));
          setStreamingContent('');
          setIsLoading(false);
        },
        onDone: () => {
          // Stream finished
          setIsLoading(false);
        }
      }
    );
  }, [conversation, companyContext, isLoading]);

  const handleBack = () => {
    setSelectedAnalyst(null);
    setConversation(null);
    setMessages([]);

    // Remove analyst from URL
    const params = new URLSearchParams(searchParams);
    params.delete('analyst');
    setSearchParams(params, { replace: true });
  };

  const handleResumeConversation = async (conv) => {
    try {
      // Get full conversation with messages
      const response = await analystAPI.getConversation(conv.id);
      const fullConv = response.data.conversation;

      // Find the analyst
      const analyst = analysts.find(a => a.id === conv.analyst_id);
      if (analyst) {
        setSelectedAnalyst(analyst);
      }

      setConversation(fullConv);
      setMessages(fullConv.messages || []);

      // Update company symbol if conversation has one
      if (conv.company_symbol && conv.company_symbol !== companySymbol) {
        setCompanySymbol(conv.company_symbol);
      }

      // Update URL
      const params = new URLSearchParams(searchParams);
      params.set('analyst', conv.analyst_id);
      if (conv.company_symbol) {
        params.set('symbol', conv.company_symbol);
      }
      setSearchParams(params, { replace: true });
    } catch (err) {
      console.error('Failed to resume conversation:', err);
      setError('Failed to load conversation');
    }
  };

  const handleCompanyChange = (e) => {
    const symbol = e.target.value.toUpperCase();
    setCompanySymbol(symbol);

    // Update URL
    const params = new URLSearchParams(searchParams);
    if (symbol) {
      params.set('symbol', symbol);
    } else {
      params.delete('symbol');
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="analyst-page">
      <div className="analyst-page-header">
        <div className="header-content">
          <h1 className="page-title">
            <span className="title-icon">🤖</span>
            AI Investment Analysts
          </h1>
          <p className="page-subtitle">
            Get investment analysis from AI analysts with different perspectives and philosophies
          </p>
        </div>

        <div className="company-input-wrapper">
          <label htmlFor="company-symbol" className="company-label">
            Analyze Company:
          </label>
          <div className="company-input-group">
            <input
              id="company-symbol"
              type="text"
              value={companySymbol}
              onChange={handleCompanyChange}
              placeholder="Enter symbol (e.g., AAPL)"
              className="company-input"
              maxLength={10}
            />
            {loadingCompany && (
              <span className="company-loading">Loading...</span>
            )}
            {companyContext?.company && (
              <span className="company-name">
                {companyContext.company.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="analyst-error">
          <span className="error-icon">⚠️</span>
          {error}
          <button onClick={() => setError(null)} className="error-dismiss">×</button>
        </div>
      )}

      <div className="analyst-page-content">
        {!selectedAnalyst ? (
          <div className="analyst-selection-layout">
            <div className="analyst-selection">
              <h2 className="section-title">Choose Your Analyst</h2>
              <p className="section-description">
                Each analyst has a unique investment philosophy and analytical approach
              </p>
              <AnalystSelector
                analysts={analysts}
                selected={selectedAnalyst?.id}
                onSelect={handleSelectAnalyst}
                loading={loadingAnalysts}
              />
            </div>
            <aside className="analyst-sidebar">
              <ConversationHistory
                onSelectConversation={handleResumeConversation}
                currentConversationId={null}
                companySymbol={companySymbol}
              />
            </aside>
          </div>
        ) : (
          <div className="analyst-chat-layout">
            <div className="analyst-chat-container">
              <ChatInterface
                analyst={selectedAnalyst}
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                streamingContent={streamingContent}
                companySymbol={companySymbol}
                onBack={handleBack}
              />
            </div>
            <aside className="analyst-sidebar">
              <ConversationHistory
                onSelectConversation={handleResumeConversation}
                currentConversationId={conversation?.id}
                companySymbol={companySymbol}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
