/**
 * ContextualFeedback Component
 *
 * Modal/slide-in feedback prompt that appears at natural moments.
 * Includes emoji rating scale and optional text input.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import './ContextualFeedback.css';

const RATING_OPTIONS = [
  { value: 1, emoji: '\ud83d\ude1f', label: 'Frustrated' },
  { value: 2, emoji: '\ud83d\ude15', label: 'Meh' },
  { value: 3, emoji: '\ud83d\ude10', label: 'Okay' },
  { value: 4, emoji: '\ud83d\ude0a', label: 'Good' },
  { value: 5, emoji: '\ud83e\udd29', label: 'Loving it' }
];

const ContextualFeedback = ({
  title = 'Quick feedback',
  question = "How's it going so far?",
  showComment = true,
  commentPlaceholder = 'Anything specific? (optional)',
  submitLabel = 'Send Feedback',
  laterLabel = 'Maybe Later',
  onSubmit,
  onDismiss,
  feature = null,
  className = ''
}) => {
  const { submitFeedback, dismissPrompt, respondToPrompt, currentPrompt, isSubmitting } = useFeedback();
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Use current prompt or standalone mode
  const isPromptMode = !!currentPrompt;

  const handleClose = useCallback((reason = 'dismissed') => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      if (isPromptMode) {
        dismissPrompt(reason);
      }
      if (onDismiss) {
        onDismiss(reason);
      }
    }, 200);
  }, [isPromptMode, dismissPrompt, onDismiss]);

  const handleSubmit = useCallback(async () => {
    if (!rating) return;

    const result = await submitFeedback({
      type: 'contextual',
      rating,
      message: comment || null,
      feature: feature || currentPrompt?.type
    });

    if (result.success) {
      setSubmitted(true);

      if (isPromptMode) {
        respondToPrompt({ rating, comment });
      }

      if (onSubmit) {
        onSubmit({ rating, comment }, result);
      }

      // Auto-close after showing success
      setTimeout(() => {
        handleClose('submitted');
      }, 1500);
    }
  }, [rating, comment, feature, currentPrompt, submitFeedback, respondToPrompt, isPromptMode, onSubmit, handleClose]);

  const handleLater = useCallback(() => {
    handleClose('later');
  }, [handleClose]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose('escape');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    <div className={`contextual-feedback-overlay ${isAnimatingOut ? 'contextual-feedback-overlay--hiding' : ''}`}>
      <div
        className={`contextual-feedback ${className}`}
        role="dialog"
        aria-labelledby="contextual-feedback-title"
        aria-modal="true"
      >
        <div className="contextual-feedback__header">
          <span className="contextual-feedback__icon">\ud83c\udfaf</span>
          <h3 id="contextual-feedback-title" className="contextual-feedback__title">
            {title}
          </h3>
          <button
            className="contextual-feedback__close"
            onClick={() => handleClose('close_button')}
            aria-label="Close feedback"
          >
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="contextual-feedback__success">
            <span className="contextual-feedback__success-icon">\u2713</span>
            <p>Thanks for your feedback!</p>
          </div>
        ) : (
          <>
            <div className="contextual-feedback__body">
              <p className="contextual-feedback__question">{question}</p>

              <div className="contextual-feedback__ratings" role="radiogroup" aria-label="Rating">
                {RATING_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`contextual-feedback__rating ${
                      rating === option.value ? 'contextual-feedback__rating--selected' : ''
                    }`}
                    onClick={() => setRating(option.value)}
                    role="radio"
                    aria-checked={rating === option.value}
                    aria-label={option.label}
                  >
                    <span className="contextual-feedback__rating-emoji">{option.emoji}</span>
                    <span className="contextual-feedback__rating-label">{option.label}</span>
                  </button>
                ))}
              </div>

              {showComment && (
                <textarea
                  className="contextual-feedback__comment"
                  placeholder={commentPlaceholder}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  aria-label="Additional comments"
                />
              )}
            </div>

            <div className="contextual-feedback__footer">
              <button
                className="contextual-feedback__btn contextual-feedback__btn--primary"
                onClick={handleSubmit}
                disabled={!rating || isSubmitting}
              >
                {isSubmitting ? 'Sending...' : submitLabel}
              </button>
              <button
                className="contextual-feedback__btn contextual-feedback__btn--secondary"
                onClick={handleLater}
                disabled={isSubmitting}
              >
                {laterLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ContextualFeedback;
