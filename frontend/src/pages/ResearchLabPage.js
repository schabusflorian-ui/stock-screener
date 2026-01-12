// frontend/src/pages/ResearchLabPage.js
// Research Lab - unified analytics and backtesting hub
import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart3,
  FlaskConical,
  LineChart,
  PieChart,
  GitCompare,
  TestTube,
  Layers,
  Activity
} from 'lucide-react';
import { PageHeader } from '../components/ui';
import { SkeletonTable } from '../components/Skeleton';
import { tradingAPI } from '../services/api';
import './ResearchLabPage.css';

// Regime display config
const REGIME_CONFIG = {
  BULL: { color: 'var(--positive)', label: 'Bull Market' },
  BEAR: { color: 'var(--negative)', label: 'Bear Market' },
  SIDEWAYS: { color: 'var(--warning)', label: 'Sideways' },
  HIGH_VOL: { color: 'var(--warning)', label: 'High Volatility' },
  CRISIS: { color: 'var(--negative)', label: 'Crisis Mode' },
  NEUTRAL: { color: 'var(--text-tertiary)', label: 'Neutral' }
};

// Lazy load tab content components
const HistoricalAnalyticsTab = lazy(() => import('./research/HistoricalAnalyticsTab'));
const SectorAnalysisTab = lazy(() => import('./research/SectorAnalysisTab'));
const CompareTab = lazy(() => import('./research/CompareTab'));
const StrategyBacktestTab = lazy(() => import('./research/StrategyBacktestTab'));
const FactorAnalysisTab = lazy(() => import('./research/FactorAnalysisTab'));
const MonteCarloTab = lazy(() => import('./research/MonteCarloTab'));

// Top-level sections
const SECTIONS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'backtest', label: 'Backtest', icon: TestTube }
];

// Sub-tabs for each section
const ANALYTICS_TABS = [
  { id: 'historical', label: 'Historical', icon: LineChart, description: 'Factor performance & patterns' },
  { id: 'sector', label: 'Sectors', icon: PieChart, description: 'Sector analysis & heatmaps' },
  { id: 'compare', label: 'Compare', icon: GitCompare, description: 'Metrics & price comparisons' }
];

const BACKTEST_TABS = [
  { id: 'strategy', label: 'Strategy', icon: FlaskConical, description: 'Strategy backtesting' },
  { id: 'factors', label: 'Factors', icon: Layers, description: 'Factor analysis over time' },
  { id: 'montecarlo', label: 'Monte Carlo', icon: TestTube, description: 'Monte Carlo simulations' }
];

function ResearchLabPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Parse section and tab from URL hash (e.g., #analytics/historical)
  const getInitialState = () => {
    const hash = location.hash.replace('#', '');
    const [section, tab] = hash.split('/');

    if (section === 'backtest') {
      const validTab = BACKTEST_TABS.find(t => t.id === tab);
      return { section: 'backtest', tab: validTab ? tab : 'strategy' };
    }

    // Default to analytics
    const validTab = ANALYTICS_TABS.find(t => t.id === tab);
    return { section: 'analytics', tab: validTab ? tab : 'historical' };
  };

  const [activeSection, setActiveSection] = useState(getInitialState().section);
  const [activeTab, setActiveTab] = useState(getInitialState().tab);
  const [regime, setRegime] = useState(null);

  // Load market regime on mount
  useEffect(() => {
    tradingAPI.getRegime()
      .then(res => setRegime(res.data))
      .catch(() => setRegime(null));
  }, []);

  // Update URL when section/tab changes
  useEffect(() => {
    const hash = `#${activeSection}/${activeTab}`;
    if (location.hash !== hash) {
      navigate(`/research${hash}`, { replace: true });
    }
  }, [activeSection, activeTab, navigate, location.hash]);

  // Handle section change - reset to first tab of that section
  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId);
    setActiveTab(sectionId === 'analytics' ? 'historical' : 'strategy');
  };

  // Get current tabs based on section
  const currentTabs = activeSection === 'analytics' ? ANALYTICS_TABS : BACKTEST_TABS;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const currentIndex = currentTabs.findIndex(t => t.id === activeTab);
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setActiveTab(currentTabs[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < currentTabs.length - 1) {
        setActiveTab(currentTabs[currentIndex + 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentTabs]);

  const renderTabContent = () => {
    if (activeSection === 'analytics') {
      switch (activeTab) {
        case 'historical':
          return <HistoricalAnalyticsTab />;
        case 'sector':
          return <SectorAnalysisTab />;
        case 'compare':
          return <CompareTab />;
        default:
          return <HistoricalAnalyticsTab />;
      }
    } else {
      switch (activeTab) {
        case 'strategy':
          return <StrategyBacktestTab />;
        case 'factors':
          return <FactorAnalysisTab />;
        case 'montecarlo':
          return <MonteCarloTab />;
        default:
          return <StrategyBacktestTab />;
      }
    }
  };

  return (
    <div className="research-lab-page">
      <PageHeader
        title="Research Lab"
        subtitle="Analytics, backtesting, and factor analysis"
        icon={FlaskConical}
      />

      {/* Top-level section tabs with regime indicator */}
      <div className="research-header-row">
        <div className="research-section-tabs">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                className={`section-tab ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => handleSectionChange(section.id)}
              >
                <Icon size={18} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </div>

        {regime && (
          <div className="regime-indicator" title={`VIX: ${regime.vix?.toFixed(1) || 'N/A'}`}>
            <Activity size={14} style={{ color: REGIME_CONFIG[regime.regime]?.color }} />
            <span className="regime-label" style={{ color: REGIME_CONFIG[regime.regime]?.color }}>
              {REGIME_CONFIG[regime.regime]?.label || regime.regime}
            </span>
            {regime.confidence && (
              <span className="regime-confidence">{Math.round(regime.confidence * 100)}%</span>
            )}
          </div>
        )}
      </div>

      {/* Sub-tabs for current section */}
      <div className="research-sub-tabs">
        {currentTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`sub-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.description}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="research-content">
        <Suspense fallback={<SkeletonTable rows={8} />}>
          {renderTabContent()}
        </Suspense>
      </div>
    </div>
  );
}

export default ResearchLabPage;
