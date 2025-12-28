// frontend/src/components/analyst/ConversationHistory.jsx
/**
 * Displays conversation history with ability to resume or delete conversations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { History, Trash2, MessageCircle, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { analystAPI } from '../../services/api';
import './ConversationHistory.css';

const ANALYST_NAMES = {
  value: 'Benjamin',
  growth: 'Catherine',
  contrarian: 'Diana',
  quant: 'Marcus',
  risk: 'Nikolai',
  tech: 'Elena'
};

const ANALYST_ICONS = {
  value: '📊',
  growth: '📈',
  contrarian: '🔄',
  quant: '🧮',
  risk: '🛡️',
  tech: '💻'
};

export default function ConversationHistory({ onSelectConversation, currentConversationId, companySymbol }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (companySymbol) {
        params.companySymbol = companySymbol;
      }
      params.limit = 20;

      const response = await analystAPI.listConversations(params);
      setConversations(response.data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [companySymbol]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleDelete = async (e, conversationId) => {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation?')) return;

    try {
      await analystAPI.deleteConversation(conversationId);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
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

  if (loading) {
    return (
      <div className="conversation-history">
        <div className="history-header">
          <History size={16} />
          <span>Recent Chats</span>
        </div>
        <div className="history-loading">
          <RefreshCw size={16} className="spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="conversation-history">
        <div className="history-header">
          <History size={16} />
          <span>Recent Chats</span>
          <button className="refresh-btn" onClick={loadConversations}>
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="history-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="conversation-history">
      <div className="history-header">
        <History size={16} />
        <span>Recent Chats</span>
        <button className="refresh-btn" onClick={loadConversations} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="history-empty">
          <MessageCircle size={20} />
          <span>No conversations yet</span>
          <p>Start a chat with an analyst to see it here</p>
        </div>
      ) : (
        <div className="history-list">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`history-item ${conv.id === currentConversationId ? 'active' : ''}`}
              onClick={() => onSelectConversation(conv)}
            >
              <div className="history-item-icon">
                {ANALYST_ICONS[conv.analyst_id] || '🤖'}
              </div>
              <div className="history-item-content">
                <div className="history-item-title">
                  {conv.title || `Chat with ${ANALYST_NAMES[conv.analyst_id] || 'Analyst'}`}
                </div>
                <div className="history-item-meta">
                  {conv.company_symbol && (
                    <span className="history-symbol">{conv.company_symbol}</span>
                  )}
                  <span className="history-messages">
                    <MessageCircle size={12} />
                    {conv.message_count || 0}
                  </span>
                  <span className="history-time">
                    <Clock size={12} />
                    {formatDate(conv.updated_at)}
                  </span>
                </div>
              </div>
              <div className="history-item-actions">
                <button
                  className="history-delete-btn"
                  onClick={(e) => handleDelete(e, conv.id)}
                  title="Delete conversation"
                >
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={16} className="history-arrow" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
