/**
 * SupportRequest Component
 *
 * Full support request form for bug reports, feature requests, and questions.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, Bug, Lightbulb, HelpCircle, FileText, Paperclip, CheckCircle } from '../icons';
import { useFeedback } from '../../context/FeedbackContext';
import { useAuth } from '../../context/AuthContext';
import './SupportRequest.css';

const REQUEST_TYPES = [
  { id: 'bug', icon: Bug, label: 'Bug Report', description: 'Something is not working correctly' },
  { id: 'feature', icon: Lightbulb, label: 'Feature Request', description: 'Suggest a new feature or improvement' },
  { id: 'question', icon: HelpCircle, label: 'Question', description: 'Need help understanding something' },
  { id: 'other', icon: FileText, label: 'Other', description: 'General feedback or inquiry' }
];

const SupportRequest = ({ isOpen, onClose, defaultType = null }) => {
  const { submitSupportRequest, isSubmitting } = useFeedback();
  const { user } = useAuth();

  const [requestType, setRequestType] = useState(defaultType);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [includeDebugInfo, setIncludeDebugInfo] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [ticketNumber, setTicketNumber] = useState(null);
  const [error, setError] = useState(null);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setRequestType(defaultType);
      setSubject('');
      setDescription('');
      setEmail(user?.email || '');
      setIncludeDebugInfo(false);
      setIncludeScreenshot(false);
      setSubmitted(false);
      setTicketNumber(null);
      setError(null);
      setIsAnimatingOut(false);
    }
  }, [isOpen, defaultType, user?.email]);

  const handleClose = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError(null);

    if (!requestType || !subject.trim() || !description.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    const result = await submitSupportRequest({
      requestType,
      subject: subject.trim(),
      description: description.trim(),
      email: email.trim() || null,
      includeDebugInfo,
      includeScreenshot
    });

    if (result.success) {
      setSubmitted(true);
      setTicketNumber(result.data.ticketNumber);
    } else {
      setError(result.error || 'Failed to submit request. Please try again.');
    }
  }, [requestType, subject, description, email, includeDebugInfo, includeScreenshot, submitSupportRequest]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`support-request-overlay ${isAnimatingOut ? 'support-request-overlay--hiding' : ''}`}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="support-request"
        role="dialog"
        aria-labelledby="support-request-title"
        aria-modal="true"
      >
        <div className="support-request__header">
          <h2 id="support-request-title" className="support-request__title">
            {'\ud83d\udcec'} Contact Support
          </h2>
          <button
            className="support-request__close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {submitted ? (
          <div className="support-request__success">
            <div className="support-request__success-icon">
              <CheckCircle size={48} />
            </div>
            <h3>Request Submitted!</h3>
            <p>Your ticket number is:</p>
            <code className="support-request__ticket-number">{ticketNumber}</code>
            <p className="support-request__success-note">
              We'll get back to you as soon as possible.
              {email && ` A confirmation has been sent to ${email}.`}
            </p>
            <button
              className="support-request__btn support-request__btn--primary"
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        ) : (
          <form className="support-request__form" onSubmit={handleSubmit}>
            <div className="support-request__body">
              <div className="support-request__section">
                <label className="support-request__label">
                  What do you need help with? <span className="required">*</span>
                </label>
                <div className="support-request__types">
                  {REQUEST_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        className={`support-request__type ${
                          requestType === type.id ? 'support-request__type--selected' : ''
                        }`}
                        onClick={() => setRequestType(type.id)}
                      >
                        <Icon size={24} />
                        <span className="support-request__type-label">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="support-request__section">
                <label htmlFor="support-subject" className="support-request__label">
                  Subject <span className="required">*</span>
                </label>
                <input
                  id="support-subject"
                  type="text"
                  className="support-request__input"
                  placeholder="Brief summary of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="support-request__section">
                <label htmlFor="support-description" className="support-request__label">
                  Describe the issue <span className="required">*</span>
                </label>
                <textarea
                  id="support-description"
                  className="support-request__textarea"
                  placeholder={
                    requestType === 'bug'
                      ? 'Please describe what happened, what you expected, and steps to reproduce...'
                      : requestType === 'feature'
                      ? 'Describe the feature you would like and how it would help you...'
                      : 'Provide as much detail as possible...'
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                />
              </div>

              <div className="support-request__section">
                <label htmlFor="support-email" className="support-request__label">
                  Email (for follow-up)
                </label>
                <input
                  id="support-email"
                  type="email"
                  className="support-request__input"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="support-request__options">
                <label className="support-request__checkbox">
                  <input
                    type="checkbox"
                    checked={includeDebugInfo}
                    onChange={(e) => setIncludeDebugInfo(e.target.checked)}
                  />
                  <span>Include anonymous usage data to help debug</span>
                </label>
              </div>

              {error && (
                <div className="support-request__error" role="alert">
                  {error}
                </div>
              )}
            </div>

            <div className="support-request__footer">
              <button
                type="button"
                className="support-request__btn support-request__btn--secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="support-request__btn support-request__btn--primary"
                disabled={isSubmitting || !requestType || !subject.trim() || !description.trim()}
              >
                {isSubmitting ? 'Sending...' : 'Send to Support'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SupportRequest;
