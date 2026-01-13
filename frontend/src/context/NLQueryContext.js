/**
 * NLQueryContext - Context provider for Natural Language query modal
 *
 * Provides global state for:
 * - Modal open/close state
 * - Conversation history
 * - Current context (symbol, page)
 * - Conversation persistence
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { nlQueryAPI } from '../services/api';

const NLQueryContext = createContext(null);

// Get or create a session ID for this browser
function getSessionId() {
  let sessionId = localStorage.getItem('nl_session_id');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('nl_session_id', sessionId);
  }
  return sessionId;
}

// Get saved panel state from localStorage
function getSavedPanelState() {
  const saved = localStorage.getItem('nl_panel_open');
  return saved === 'true';
}

export function NLQueryProvider({ children }) {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isPanelOpen, setPanelOpen] = useState(getSavedPanelState);
  const [initialQuery, setInitialQuery] = useState('');
  const [context, setContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [conversationList, setConversationList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [sessionId] = useState(getSessionId);

  /**
   * Load conversation list on mount
   */
  useEffect(() => {
    loadConversationList();
  }, []);

  /**
   * Load list of recent conversations
   */
  const loadConversationList = useCallback(async () => {
    try {
      const response = await nlQueryAPI.listConversations(10);
      setConversationList(response.data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversation list:', error);
    }
  }, []);

  /**
   * Load a specific conversation's messages
   */
  const loadConversation = useCallback(async (convId) => {
    if (!convId) return;

    setIsLoadingHistory(true);
    try {
      const response = await nlQueryAPI.getConversation(convId, 50);
      const data = response.data;

      if (data.messages && data.messages.length > 0) {
        // Convert DB messages to our format (reverse since DB returns DESC)
        const loadedMessages = data.messages.reverse().map(msg => ({
          id: `msg-${msg.timestamp}-${Math.random().toString(36).substr(2, 9)}`,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          intent: msg.intent,
          symbols: msg.symbols ? JSON.parse(msg.symbols) : null
        }));

        setMessages(loadedMessages);
        setConversationId(convId);

        // Set context from conversation metadata
        if (data.conversation?.last_symbol) {
          setContext(prev => ({
            ...prev,
            symbol: data.conversation.last_symbol
          }));
        }
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  /**
   * Open the NL query modal
   * @param {string} query - Initial query to send (optional)
   * @param {object} ctx - Context like { symbol, page, conversationId }
   */
  const openModal = useCallback((query = '', ctx = null) => {
    setInitialQuery(query);
    setContext(ctx);
    setModalOpen(true);

    // If opening with a specific conversation ID, load it
    if (ctx?.conversationId) {
      loadConversation(ctx.conversationId);
    }
  }, [loadConversation]);

  /**
   * Close the modal (keeps conversation history)
   */
  const closeModal = useCallback(() => {
    setModalOpen(false);
    setInitialQuery('');
    // Refresh conversation list when closing
    loadConversationList();
  }, [loadConversationList]);

  /**
   * Add a message to the conversation
   * @param {object} message - { role: 'user'|'assistant', content, result?, intent?, ... }
   * @returns {string} - The message ID
   */
  const addMessage = useCallback((message) => {
    const id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setMessages(prev => [...prev, {
      ...message,
      id,
      timestamp: new Date().toISOString()
    }]);
    return id;
  }, []);

  /**
   * Update an existing message by ID (used for streaming updates)
   * @param {string} messageId - The message ID to update
   * @param {object} updates - Fields to update/merge
   */
  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => prev.map(msg =>
      msg.id === messageId
        ? { ...msg, ...updates }
        : msg
    ));
  }, []);

  /**
   * Clear conversation history and start fresh
   */
  const clearConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  /**
   * Delete a conversation
   */
  const deleteConversation = useCallback(async (convId) => {
    try {
      await nlQueryAPI.deleteConversation(convId);
      // If deleting current conversation, clear it
      if (convId === conversationId) {
        clearConversation();
      }
      // Refresh list
      loadConversationList();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }, [conversationId, clearConversation, loadConversationList]);

  /**
   * Update the conversation ID (from API response)
   */
  const updateConversationId = useCallback((id) => {
    setConversationId(id);
  }, []);

  /**
   * Switch to a different conversation
   */
  const switchConversation = useCallback((convId) => {
    if (convId === conversationId) return;

    // Clear current messages and load new conversation
    setMessages([]);
    loadConversation(convId);
  }, [conversationId, loadConversation]);

  /**
   * Open the chat panel (sidebar)
   */
  const openPanel = useCallback(() => {
    setPanelOpen(true);
    localStorage.setItem('nl_panel_open', 'true');
  }, []);

  /**
   * Close the chat panel
   */
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    localStorage.setItem('nl_panel_open', 'false');
    // Refresh conversation list when closing
    loadConversationList();
  }, [loadConversationList]);

  /**
   * Toggle the chat panel
   */
  const togglePanel = useCallback(() => {
    setPanelOpen(prev => {
      const newValue = !prev;
      localStorage.setItem('nl_panel_open', String(newValue));
      if (!newValue) {
        loadConversationList();
      }
      return newValue;
    });
  }, [loadConversationList]);

  const value = {
    // State
    isModalOpen,
    isPanelOpen,
    initialQuery,
    context,
    messages,
    conversationId,
    conversationList,
    isLoadingHistory,
    sessionId,

    // Actions
    openModal,
    closeModal,
    openPanel,
    closePanel,
    togglePanel,
    addMessage,
    updateMessage,
    clearConversation,
    updateConversationId,
    setContext,
    loadConversationList,
    loadConversation,
    deleteConversation,
    switchConversation
  };

  return (
    <NLQueryContext.Provider value={value}>
      {children}
    </NLQueryContext.Provider>
  );
}

/**
 * Hook to access NL query context
 */
export function useNLQuery() {
  const context = useContext(NLQueryContext);
  if (!context) {
    throw new Error('useNLQuery must be used within a NLQueryProvider');
  }
  return context;
}

export default NLQueryContext;
