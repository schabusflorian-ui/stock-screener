// frontend/src/components/settings/NotificationTriggers.js
// User-Configurable Notification Triggers
import React, { useState } from 'react';
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  Briefcase,
  Bot,
  Mail,
  Smartphone,
  ChevronDown,
  ChevronRight,
  Save,
  Info
} from '../icons';
import './NotificationTriggers.css';

// Default trigger settings
const DEFAULT_TRIGGERS = {
  price: {
    enabled: true,
    threshold: 5,
    upEnabled: true,
    downEnabled: true
  },
  agents: {
    enabled: true,
    signalTypes: ['buy', 'sell', 'hold']
  },
  insider: {
    enabled: true,
    minTransactionSize: 100000,
    buyOnly: false
  },
  earnings: {
    enabled: true,
    preReminder: true,
    reminderDays: 3,
    postAlert: true
  },
  portfolio: {
    enabled: true,
    drawdownThreshold: 10,
    concentrationThreshold: 25,
    gainThreshold: 20
  },
  delivery: {
    inApp: true,
    email: false,
    push: false
  }
};

// Category configuration
const CATEGORIES = [
  {
    key: 'price',
    icon: TrendingUp,
    label: 'Price Alerts',
    description: 'Get notified when watchlist stocks move significantly'
  },
  {
    key: 'agents',
    icon: Bot,
    label: 'AI Agent Signals',
    description: 'Receive alerts when your agents generate trading signals'
  },
  {
    key: 'insider',
    icon: Users,
    label: 'Insider Activity',
    description: 'Track when executives buy or sell company stock'
  },
  {
    key: 'earnings',
    icon: Calendar,
    label: 'Earnings Events',
    description: 'Reminders before earnings and alerts after reports'
  },
  {
    key: 'portfolio',
    icon: Briefcase,
    label: 'Portfolio Alerts',
    description: 'Monitor drawdowns, concentration, and significant gains'
  }
];

function CategorySection({ category, settings, onChange, expanded, onToggleExpand }) {
  const Icon = category.icon;
  const isEnabled = settings?.enabled ?? true;

  const handleToggle = () => {
    onChange({ ...settings, enabled: !isEnabled });
  };

  return (
    <div className={`trigger-category ${isEnabled ? '' : 'disabled'}`}>
      <div className="trigger-category-header" onClick={onToggleExpand}>
        <div className="category-toggle">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          />
        </div>
        <div className="category-icon">
          <Icon size={18} />
        </div>
        <div className="category-info">
          <span className="category-label">{category.label}</span>
          <span className="category-description">{category.description}</span>
        </div>
        <div className="category-expand">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {expanded && isEnabled && (
        <div className="trigger-category-settings">
          {category.key === 'price' && (
            <PriceSettings settings={settings} onChange={onChange} />
          )}
          {category.key === 'agents' && (
            <AgentSettings settings={settings} onChange={onChange} />
          )}
          {category.key === 'insider' && (
            <InsiderSettings settings={settings} onChange={onChange} />
          )}
          {category.key === 'earnings' && (
            <EarningsSettings settings={settings} onChange={onChange} />
          )}
          {category.key === 'portfolio' && (
            <PortfolioSettings settings={settings} onChange={onChange} />
          )}
        </div>
      )}
    </div>
  );
}

function PriceSettings({ settings, onChange }) {
  return (
    <div className="settings-group">
      <div className="setting-row">
        <label>Price change threshold</label>
        <div className="setting-input-group">
          <input
            type="number"
            min="1"
            max="50"
            value={settings?.threshold || 5}
            onChange={(e) => onChange({ ...settings, threshold: parseInt(e.target.value) || 5 })}
          />
          <span className="input-suffix">%</span>
        </div>
      </div>
      <div className="setting-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings?.upEnabled ?? true}
            onChange={(e) => onChange({ ...settings, upEnabled: e.target.checked })}
          />
          <TrendingUp size={14} />
          Price increases
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings?.downEnabled ?? true}
            onChange={(e) => onChange({ ...settings, downEnabled: e.target.checked })}
          />
          <TrendingDown size={14} />
          Price decreases
        </label>
      </div>
    </div>
  );
}

function AgentSettings({ settings, onChange }) {
  const signalTypes = settings?.signalTypes || ['buy', 'sell', 'hold'];

  const toggleSignalType = (type) => {
    const newTypes = signalTypes.includes(type)
      ? signalTypes.filter(t => t !== type)
      : [...signalTypes, type];
    onChange({ ...settings, signalTypes: newTypes });
  };

  return (
    <div className="settings-group">
      <div className="setting-row">
        <label>Signal types to receive</label>
      </div>
      <div className="setting-row chips">
        <button
          className={`chip ${signalTypes.includes('buy') ? 'active positive' : ''}`}
          onClick={() => toggleSignalType('buy')}
        >
          Buy Signals
        </button>
        <button
          className={`chip ${signalTypes.includes('sell') ? 'active negative' : ''}`}
          onClick={() => toggleSignalType('sell')}
        >
          Sell Signals
        </button>
        <button
          className={`chip ${signalTypes.includes('hold') ? 'active neutral' : ''}`}
          onClick={() => toggleSignalType('hold')}
        >
          Hold Updates
        </button>
      </div>
    </div>
  );
}

function InsiderSettings({ settings, onChange }) {
  return (
    <div className="settings-group">
      <div className="setting-row">
        <label>Minimum transaction size</label>
        <div className="setting-input-group">
          <span className="input-prefix">$</span>
          <input
            type="number"
            min="0"
            step="10000"
            value={settings?.minTransactionSize || 100000}
            onChange={(e) => onChange({ ...settings, minTransactionSize: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="setting-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings?.buyOnly ?? false}
            onChange={(e) => onChange({ ...settings, buyOnly: e.target.checked })}
          />
          Only notify for insider buys (more bullish signal)
        </label>
      </div>
    </div>
  );
}

function EarningsSettings({ settings, onChange }) {
  return (
    <div className="settings-group">
      <div className="setting-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings?.preReminder ?? true}
            onChange={(e) => onChange({ ...settings, preReminder: e.target.checked })}
          />
          Pre-earnings reminder
        </label>
      </div>
      {settings?.preReminder && (
        <div className="setting-row nested">
          <label>Days before earnings</label>
          <div className="setting-input-group">
            <input
              type="number"
              min="1"
              max="14"
              value={settings?.reminderDays || 3}
              onChange={(e) => onChange({ ...settings, reminderDays: parseInt(e.target.value) || 3 })}
            />
            <span className="input-suffix">days</span>
          </div>
        </div>
      )}
      <div className="setting-row checkboxes">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings?.postAlert ?? true}
            onChange={(e) => onChange({ ...settings, postAlert: e.target.checked })}
          />
          Post-earnings results alert
        </label>
      </div>
    </div>
  );
}

function PortfolioSettings({ settings, onChange }) {
  return (
    <div className="settings-group">
      <div className="setting-row">
        <label>Drawdown alert threshold</label>
        <div className="setting-input-group">
          <input
            type="number"
            min="1"
            max="50"
            value={settings?.drawdownThreshold || 10}
            onChange={(e) => onChange({ ...settings, drawdownThreshold: parseInt(e.target.value) || 10 })}
          />
          <span className="input-suffix">%</span>
        </div>
      </div>
      <div className="setting-row">
        <label>Concentration warning</label>
        <div className="setting-input-group">
          <input
            type="number"
            min="10"
            max="100"
            value={settings?.concentrationThreshold || 25}
            onChange={(e) => onChange({ ...settings, concentrationThreshold: parseInt(e.target.value) || 25 })}
          />
          <span className="input-suffix">%</span>
        </div>
      </div>
      <div className="setting-row">
        <label>Significant gain alert</label>
        <div className="setting-input-group">
          <input
            type="number"
            min="5"
            max="100"
            value={settings?.gainThreshold || 20}
            onChange={(e) => onChange({ ...settings, gainThreshold: parseInt(e.target.value) || 20 })}
          />
          <span className="input-suffix">%</span>
        </div>
      </div>
    </div>
  );
}

function DeliverySettings({ settings, onChange }) {
  return (
    <div className="delivery-settings">
      <h4>
        <Bell size={16} />
        Delivery Methods
      </h4>
      <div className="delivery-options">
        <label className="delivery-option">
          <input
            type="checkbox"
            checked={settings?.inApp ?? true}
            onChange={(e) => onChange({ ...settings, inApp: e.target.checked })}
          />
          <span className="delivery-icon">
            <Bell size={18} />
          </span>
          <div className="delivery-info">
            <span className="delivery-label">In-App</span>
            <span className="delivery-description">Notifications in the app</span>
          </div>
        </label>
        <label className="delivery-option">
          <input
            type="checkbox"
            checked={settings?.email ?? false}
            onChange={(e) => onChange({ ...settings, email: e.target.checked })}
          />
          <span className="delivery-icon">
            <Mail size={18} />
          </span>
          <div className="delivery-info">
            <span className="delivery-label">Email</span>
            <span className="delivery-description">Daily digest emails</span>
          </div>
        </label>
        <label className="delivery-option disabled" title="Coming soon">
          <input
            type="checkbox"
            checked={settings?.push ?? false}
            disabled
            onChange={(e) => onChange({ ...settings, push: e.target.checked })}
          />
          <span className="delivery-icon">
            <Smartphone size={18} />
          </span>
          <div className="delivery-info">
            <span className="delivery-label">Push</span>
            <span className="delivery-description">Mobile push (coming soon)</span>
          </div>
        </label>
      </div>
    </div>
  );
}

function NotificationTriggers({ onSave, initialSettings = null }) {
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_TRIGGERS,
    ...initialSettings
  }));
  const [expandedCategory, setExpandedCategory] = useState('price');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleCategoryChange = (categoryKey, newSettings) => {
    setSettings(prev => ({
      ...prev,
      [categoryKey]: newSettings
    }));
    setHasChanges(true);
  };

  const handleDeliveryChange = (newDelivery) => {
    setSettings(prev => ({
      ...prev,
      delivery: newDelivery
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(settings);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="notification-triggers">
      <div className="triggers-header">
        <div className="triggers-title">
          <Bell size={20} />
          <div>
            <h3>Notification Triggers</h3>
            <p>Configure what events trigger alerts and how you receive them</p>
          </div>
        </div>
        {hasChanges && (
          <button
            className="save-triggers-btn"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="triggers-categories">
        {CATEGORIES.map(category => (
          <CategorySection
            key={category.key}
            category={category}
            settings={settings[category.key]}
            onChange={(newSettings) => handleCategoryChange(category.key, newSettings)}
            expanded={expandedCategory === category.key}
            onToggleExpand={() => setExpandedCategory(
              expandedCategory === category.key ? null : category.key
            )}
          />
        ))}
      </div>

      <DeliverySettings
        settings={settings.delivery}
        onChange={handleDeliveryChange}
      />

      <div className="triggers-info">
        <Info size={14} />
        <span>
          Changes apply to all watchlist stocks. For per-stock settings, configure alerts from the company page.
        </span>
      </div>
    </div>
  );
}

export default NotificationTriggers;
