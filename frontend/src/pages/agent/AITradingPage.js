// frontend/src/pages/agent/AITradingPage.js
// Agent 3: Main AI Trading Dashboard Page

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Brain,
  BarChart3,
  Settings,
  History,
  Activity,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { portfoliosAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import {
  DailyAnalysisDashboard,
  RiskLimitsSettings,
  FactorPerformance
} from '../../components/agent';
import RecommendationHistory from '../../components/agent/RecommendationHistory';
import RegimeHistory from '../../components/agent/RegimeHistory';
import { Skeleton } from '../../components/Skeleton';
import './AITradingPage.css';

/**
 * Tab options for the AI Trading page
 */
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Brain },
  { id: 'history', label: 'Recommendations', icon: History },
  { id: 'performance', label: 'Factor Analysis', icon: BarChart3 },
  { id: 'regime', label: 'Market Regime', icon: Activity },
  { id: 'settings', label: 'Risk Settings', icon: Settings },
];

/**
 * AITradingPage
 *
 * Main page for AI-assisted trading features.
 * Combines daily analysis, recommendations, factor performance,
 * and risk settings into a unified interface.
 */
function AITradingPage() {
  const { portfolioId } = useParams();
  const [portfolio, setPortfolio] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const parsedPortfolioId = portfolioId ? parseInt(portfolioId, 10) : null;

  useEffect(() => {
    if (parsedPortfolioId) {
      fetchPortfolio();
    }
  }, [parsedPortfolioId]);

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await portfoliosAPI.get(parsedPortfolioId);
      if (response.data) {
        setPortfolio(response.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  if (!parsedPortfolioId) {
    return (
      <div className="ai-trading-page">
        <Card variant="base" className="ai-trading-page__error">
          <p>Please select a portfolio to use AI Trading features.</p>
          <Link to="/portfolios" className="ai-trading-page__link">
            <ArrowLeft size={16} /> Go to Portfolios
          </Link>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ai-trading-page">
        <Skeleton className="ai-trading-page__skeleton-header" />
        <Skeleton className="ai-trading-page__skeleton-tabs" />
        <Skeleton className="ai-trading-page__skeleton-content" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="ai-trading-page">
        <Card variant="base" className="ai-trading-page__error">
          <p>{error}</p>
          <Button variant="secondary" onClick={fetchPortfolio} icon={RefreshCw}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="ai-trading-page">
      {/* Header */}
      <div className="ai-trading-page__header">
        <div className="ai-trading-page__title-section">
          <Link to={`/portfolios/${parsedPortfolioId}`} className="ai-trading-page__back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="ai-trading-page__title">
              <Brain size={24} />
              AI Trading
            </h1>
            <p className="ai-trading-page__subtitle">
              {portfolio?.name || 'Portfolio'} - AI-Assisted Analysis & Recommendations
            </p>
          </div>
        </div>
        <div className="ai-trading-page__portfolio-value">
          <span className="ai-trading-page__value-label">Portfolio Value</span>
          <span className="ai-trading-page__value">
            ${(portfolio?.current_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="ai-trading-page__tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`ai-trading-page__tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="ai-trading-page__content">
        {activeTab === 'dashboard' && (
          <DailyAnalysisDashboard portfolioId={parsedPortfolioId} />
        )}

        {activeTab === 'history' && (
          <RecommendationHistory portfolioId={parsedPortfolioId} />
        )}

        {activeTab === 'performance' && (
          <div className="ai-trading-page__performance">
            <FactorPerformance portfolioId={parsedPortfolioId} />
            <Card variant="glass" className="ai-trading-page__performance-note">
              <Card.Content>
                <h4>Understanding Factor Performance</h4>
                <p>
                  This chart shows how well each signal type (technical, sentiment, insider, fundamental)
                  has predicted successful trades. A higher win rate indicates the signal is more
                  reliable for this portfolio's trading style.
                </p>
                <ul>
                  <li><strong>Technical:</strong> Price patterns, RSI, MACD, moving averages</li>
                  <li><strong>Sentiment:</strong> Social media sentiment, news analysis</li>
                  <li><strong>Insider:</strong> Insider buying/selling activity</li>
                  <li><strong>Fundamental:</strong> Valuation, earnings quality, financial health</li>
                </ul>
              </Card.Content>
            </Card>
          </div>
        )}

        {activeTab === 'regime' && (
          <RegimeHistory />
        )}

        {activeTab === 'settings' && (
          <RiskLimitsSettings
            portfolioId={parsedPortfolioId}
            onSave={() => {
              // Could show a toast notification here
            }}
          />
        )}
      </div>
    </div>
  );
}

export default AITradingPage;
