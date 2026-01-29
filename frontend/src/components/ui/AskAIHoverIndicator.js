/**
 * AskAIHoverIndicator - Shows a pulsating icon at cursor with tooltip
 *
 * This component renders:
 * 1. A pulsating gradient circle with sparkle icon at the cursor position
 * 2. An "Ask AI" text box offset below-right of the icon
 *
 * Appears after a 1.5s delay when hovering over data-ask-ai="true" elements.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import './AskAIHoverIndicator.css';

function AskAIHoverIndicator() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef(null);
  const currentTargetRef = useRef(null);

  const clearHoverTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    // Check if we're hovering over an Ask AI element
    const target = e.target.closest('[data-ask-ai="true"]');

    if (target) {
      // Store cursor position (icon will be centered on this)
      setPosition({ x: e.clientX, y: e.clientY });

      // Only start the delay timer if we entered a new target
      if (currentTargetRef.current !== target) {
        currentTargetRef.current = target;
        clearHoverTimeout();
        setVisible(false);

        // Show indicator after 1.5s delay
        timeoutRef.current = setTimeout(() => {
          setVisible(true);
        }, 1500);
      }
    } else {
      // Left Ask AI element
      currentTargetRef.current = null;
      clearHoverTimeout();
      setVisible(false);
    }
  }, [clearHoverTimeout]);

  const handleMouseLeave = useCallback(() => {
    currentTargetRef.current = null;
    clearHoverTimeout();
    setVisible(false);
  }, [clearHoverTimeout]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      clearHoverTimeout();
    };
  }, [handleMouseMove, handleMouseLeave, clearHoverTimeout]);

  if (!visible) return null;

  // Calculate text box position (offset below-right of icon)
  const textX = Math.min(position.x + 18, window.innerWidth - 70);
  const textY = Math.min(position.y + 18, window.innerHeight - 30);

  return (
    <>
      {/* Pulsating icon circle at cursor position */}
      <div
        className="ask-ai-cursor-icon"
        style={{
          left: position.x,
          top: position.y
        }}
        aria-hidden="true"
      >
        <span className="ask-ai-pulse-ring" />
        <span className="ask-ai-icon-bg">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L14 9L21 12L14 15L12 22L10 15L3 12L10 9Z"
              fill="currentColor"
            />
          </svg>
        </span>
      </div>

      {/* Text box offset below-right */}
      <div
        className="ask-ai-tooltip-text"
        style={{
          left: textX,
          top: textY
        }}
        aria-hidden="true"
      >
        Ask AI
      </div>
    </>
  );
}

export default AskAIHoverIndicator;
