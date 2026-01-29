/**
 * TypingIndicator - Enhanced animated indicator showing AI status
 *
 * Shows tool-specific icon and label when processing,
 * with prismatic gradient animations
 */

import React from 'react';
import { Database } from '../icons';
import './TypingIndicator.css';

function TypingIndicator({ message = 'Thinking', tool = null }) {
  // Get the icon component from the tool config
  const IconComponent = tool?.icon || Database;

  return (
    <div className={`typing-indicator ${tool ? 'has-tool' : ''}`}>
      {tool && (
        <div className="typing-tool-icon">
          <IconComponent size={14} />
        </div>
      )}
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
