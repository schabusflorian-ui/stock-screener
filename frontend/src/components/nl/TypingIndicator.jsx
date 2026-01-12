/**
 * TypingIndicator - Animated dots showing the AI is thinking
 *
 * Shows a subtle bouncing animation while waiting for response
 */

import React from 'react';
import './TypingIndicator.css';

function TypingIndicator({ message = 'Thinking' }) {
  return (
    <div className="typing-indicator">
      <span className="typing-text">{message}</span>
      <div className="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  );
}

export default TypingIndicator;
