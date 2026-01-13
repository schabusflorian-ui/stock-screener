/**
 * FeedbackManager Component
 *
 * Global component that manages feedback prompts, help center, and support modals.
 * Should be placed at the app root level.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useFeedback } from '../../context/FeedbackContext';
import { useAuth } from '../../context/AuthContext';
import { useAnalytics } from '../../context/AnalyticsContext';
import { useHelp } from '../../hooks/useHelp';
import ContextualFeedback from './ContextualFeedback';
import SupportRequest from './SupportRequest';
import HelpCenter from './HelpCenter';

// Keyboard shortcut for help (Ctrl/Cmd + /)
const HELP_SHORTCUT = '/';

const FeedbackManager = () => {
  const { currentPrompt, showPrompt, isEnabled } = useFeedback();
  const { user } = useAuth();
  const { trackEvent } = useAnalytics();
  const helpState = useHelp();
  const { isOpen: isHelpOpen, openHelp, closeHelp } = helpState;

  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [supportType, setSupportType] = useState(null);

  // Check for feedback prompts on specific triggers
  useEffect(() => {
    if (!isEnabled || !user) return;

    // Check session count for "first week" prompt
    const sessionCount = parseInt(sessionStorage.getItem('session_count') || '0');
    const promptShown = sessionStorage.getItem('first_week_prompt_shown');

    if (sessionCount >= 5 && !promptShown) {
      const timer = setTimeout(() => {
        showPrompt('first_week', 'session_count', {
          title: 'Quick feedback',
          question: "You've been using the platform for a while! How's it going so far?"
        });
        sessionStorage.setItem('first_week_prompt_shown', 'true');
      }, 30000); // Show after 30 seconds

      return () => clearTimeout(timer);
    }
  }, [isEnabled, user, showPrompt]);

  // Keyboard shortcut for help
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + / to open help
      if ((e.ctrlKey || e.metaKey) && e.key === HELP_SHORTCUT) {
        e.preventDefault();
        if (isHelpOpen) {
          closeHelp();
        } else {
          openHelp();
          trackEvent('help_opened', 'help', { method: 'keyboard_shortcut' });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isHelpOpen, openHelp, closeHelp, trackEvent]);

  const handleOpenSupport = useCallback((type = null) => {
    setSupportType(type);
    setIsSupportOpen(true);
    trackEvent('support_modal_opened', 'feedback', { requestType: type });
  }, [trackEvent]);

  const handleCloseSupport = useCallback(() => {
    setIsSupportOpen(false);
    setSupportType(null);
  }, []);

  const handleRequestFeature = useCallback(() => {
    handleOpenSupport('feature');
  }, [handleOpenSupport]);

  const handleReportBug = useCallback(() => {
    handleOpenSupport('bug');
  }, [handleOpenSupport]);

  // Expose methods globally for other components to use
  useEffect(() => {
    window.openHelp = openHelp;
    window.openSupport = handleOpenSupport;
    window.requestFeature = handleRequestFeature;
    window.reportBug = handleReportBug;

    return () => {
      delete window.openHelp;
      delete window.openSupport;
      delete window.requestFeature;
      delete window.reportBug;
    };
  }, [openHelp, handleOpenSupport, handleRequestFeature, handleReportBug]);

  return (
    <>
      {/* Contextual Feedback Prompt */}
      {currentPrompt && (
        <ContextualFeedback
          title={currentPrompt.title || 'Quick feedback'}
          question={currentPrompt.question || "How's your experience so far?"}
          feature={currentPrompt.type}
        />
      )}

      {/* Help Center Panel */}
      <HelpCenter
        helpState={helpState}
        onContactSupport={() => handleOpenSupport()}
        onRequestFeature={handleRequestFeature}
      />

      {/* Support Request Modal */}
      <SupportRequest
        isOpen={isSupportOpen}
        onClose={handleCloseSupport}
        defaultType={supportType}
      />
    </>
  );
};

export default FeedbackManager;
