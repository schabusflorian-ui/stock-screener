/**
 * UpgradeModal Component
 *
 * Global modal that shows when user tries to access premium features.
 * Listens for 'show-upgrade-modal' events from anywhere in the app.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { PrismSparkle, Check, X, Crown, Zap } from '../icons';
import './UpgradeModal.css';

export default function UpgradeModal() {
  const navigate = useNavigate();
  const { tier, getTierInfo } = useSubscription();
  const [isOpen, setIsOpen] = useState(false);
  const [modalData, setModalData] = useState({});

  // Listen for show-upgrade-modal events
  useEffect(() => {
    const handleShowModal = (event) => {
      setModalData(event.detail || {});
      setIsOpen(true);
    };

    window.addEventListener('show-upgrade-modal', handleShowModal);
    return () => window.removeEventListener('show-upgrade-modal', handleShowModal);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleUpgrade = useCallback(() => {
    setIsOpen(false);
    navigate('/pricing', {
      state: {
        feature: modalData.feature,
        requiredTier: modalData.requiredTier
      }
    });
  }, [navigate, modalData]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  const requiredTier = modalData.requiredTier || 'pro';
  const tierInfo = getTierInfo(requiredTier);
  const currentTierInfo = getTierInfo(tier);
  const feature = modalData.feature;
  const reason = modalData.reason;

  // Get tier benefits
  const tierBenefits = getTierBenefits(requiredTier);

  return (
    <div className="upgrade-modal-backdrop" onClick={handleBackdropClick}>
      <div className={`upgrade-modal upgrade-modal--${requiredTier}`} role="dialog" aria-modal="true">
        <button className="upgrade-modal__close" onClick={handleClose}>
          <X size={20} />
        </button>

        <div className="upgrade-modal__header">
          <div className={`upgrade-modal__icon upgrade-modal__icon--${requiredTier}`}>
            <PrismSparkle size={32} />
          </div>

          <h2 className="upgrade-modal__title">
            Upgrade to {tierInfo.name}
          </h2>

          {reason && (
            <p className="upgrade-modal__reason">{reason}</p>
          )}
        </div>

        <div className="upgrade-modal__content">
          <p className="upgrade-modal__description">
            {getUpgradeDescription(requiredTier)}
          </p>

          <ul className="upgrade-modal__benefits">
            {tierBenefits.map((benefit, index) => (
              <li key={index}>
                <Check size={16} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="upgrade-modal__pricing">
            <div className="upgrade-modal__price">
              <span className="upgrade-modal__price-amount">
                ${requiredTier === 'pro' ? '5' : '20'}
              </span>
              <span className="upgrade-modal__price-period">/month</span>
            </div>
            <p className="upgrade-modal__price-note">
              or save 20% with annual billing
            </p>
          </div>
        </div>

        <div className="upgrade-modal__actions">
          <button
            className={`upgrade-modal__cta upgrade-modal__cta--${requiredTier}`}
            onClick={handleUpgrade}
          >
            <PrismSparkle size={18} />
            View Plans & Upgrade
          </button>

          <button
            className="upgrade-modal__dismiss"
            onClick={handleClose}
          >
            Maybe later
          </button>
        </div>

        <p className="upgrade-modal__current">
          Currently on{' '}
          <span className={`upgrade-modal__current-tier--${tier}`}>{currentTierInfo.name}</span>
        </p>
      </div>
    </div>
  );
}

function getTierBenefits(tier) {
  if (tier === 'ultra') {
    return [
      'Unlimited AI queries & Prism reports',
      'Paper trading bots with automation',
      'Monte Carlo simulations',
      'Backtesting engine',
      'Stress testing scenarios',
      'ML signal optimization',
      'Everything in Pro'
    ];
  }

  // Pro tier
  return [
    '200 AI queries per month',
    '20 Prism reports per month',
    'Advanced stock screener',
    'AI research agents',
    'Filing analyzer (10-K, 10-Q)',
    'Real-time 13F alerts',
    'Factor analysis',
    'Data export (CSV)'
  ];
}

function getUpgradeDescription(tier) {
  if (tier === 'ultra') {
    return 'Get unlimited access to our most powerful quantitative tools. Build and test automated strategies with confidence.';
  }
  return 'Unlock the full power of AI-assisted research and advanced analysis tools.';
}

// Darken or lighten a hex color
function adjustColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}
