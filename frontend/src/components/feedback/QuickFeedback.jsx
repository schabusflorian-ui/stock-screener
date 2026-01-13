/**
 * QuickFeedback Component
 *
 * Non-intrusive inline feedback collection with thumbs up/down.
 * Appears after content, disappears after interaction or timeout.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import './QuickFeedback.css';

const QuickFeedback = ({
  feature,
  contentId = null,
  question = 'Was this helpful?',
  type = 'helpful',
  autoHideDelay = 10000,
  onFeedbackSubmitted,
  showSkip = true,
  className = ''
}) => {
  const { submitQuickFeedback, hasFeedbackBeenGiven, isSubmitting } = useFeedback();
  const [isVisible, setIsVisible] = useState(true);
  const [response, setResponse] = useState(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Check if feedback was already given
  const alreadyGiven = hasFeedbackBeenGiven(feature, contentId);

  // Auto-hide after delay
  useEffect(() => {
    if (autoHideDelay && isVisible && !response) {
      const timer = setTimeout(() => {
        handleDismiss('timeout');
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [autoHideDelay, isVisible, response]);

  const handleDismiss = useCallback((reason = 'dismissed') => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      if (reason === 'skipped') {
        submitQuickFeedback(type, feature, 'skipped', contentId);
      }
    }, 200);
  }, [submitQuickFeedback, type, feature, contentId]);

  const handleFeedback = useCallback(async (feedbackResponse) => {
    setResponse(feedbackResponse);

    const result = await submitQuickFeedback(type, feature, feedbackResponse, contentId);

    if (onFeedbackSubmitted) {
      onFeedbackSubmitted(feedbackResponse, result);
    }

    // Hide after showing thank you
    setTimeout(() => {
      handleDismiss('submitted');
    }, 1500);
  }, [submitQuickFeedback, type, feature, contentId, onFeedbackSubmitted, handleDismiss]);

  // Don't show if already given feedback or hidden
  if (!isVisible || alreadyGiven) {
    return null;
  }

  return (
    <div
      className={`quick-feedback ${isAnimatingOut ? 'quick-feedback--hiding' : ''} ${className}`}
      role="region"
      aria-label="Feedback"
    >
      {response ? (
        <div className="quick-feedback__thanks">
          Thanks for your feedback!
        </div>
      ) : (
        <>
          <span className="quick-feedback__question">{question}</span>

          <div className="quick-feedback__actions">
            <button
              className="quick-feedback__btn quick-feedback__btn--positive"
              onClick={() => handleFeedback('positive')}
              disabled={isSubmitting}
              aria-label="Yes, this was helpful"
            >
              <ThumbsUp size={16} />
              <span>Yes</span>
            </button>

            <button
              className="quick-feedback__btn quick-feedback__btn--negative"
              onClick={() => handleFeedback('negative')}
              disabled={isSubmitting}
              aria-label="No, this was not helpful"
            >
              <ThumbsDown size={16} />
              <span>No</span>
            </button>

            {showSkip && (
              <button
                className="quick-feedback__btn quick-feedback__btn--skip"
                onClick={() => handleDismiss('skipped')}
                disabled={isSubmitting}
                aria-label="Skip this feedback"
              >
                Skip
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default QuickFeedback;
