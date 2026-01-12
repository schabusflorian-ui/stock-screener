// frontend/src/pages/MarketSignalsPage.js
// Unified Market Signals page combining Sentiment, Insiders, and Validation
import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageCircle,
  Users,
  Activity,
  TrendingUp
} from 'lucide-react';
import { PageHeader } from '../components/ui';
import { SkeletonTable } from '../components/Skeleton';
import './MarketSignalsPage.css';

// Lazy load tab content components
const SentimentTab = lazy(() => import('./signals/SentimentTab'));
const InsidersTab = lazy(() => import('./signals/InsidersTab'));
const ValidationTab = lazy(() => import('./signals/ValidationTab'));

const TABS = [
  { id: 'sentiment', label: 'Sentiment', icon: MessageCircle, description: 'Social & news sentiment trends' },
  { id: 'insiders', label: 'Insiders', icon: Users, description: 'Form 4 filings & cluster buying' },
  { id: 'validation', label: 'Validation', icon: Activity, description: 'Signal performance metrics' },
];

function MarketSignalsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Get initial tab from URL hash or localStorage
  const getInitialTab = () => {
    const hash = location.hash.replace('#', '');
    if (TABS.find(t => t.id === hash)) return hash;
    return localStorage.getItem('signals-tab') || 'sentiment';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Update URL and localStorage when tab changes
  useEffect(() => {
    localStorage.setItem('signals-tab', activeTab);
    if (location.hash !== `#${activeTab}`) {
      navigate(`/signals#${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate, location.hash]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const currentIndex = TABS.findIndex(t => t.id === activeTab);
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setActiveTab(TABS[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < TABS.length - 1) {
        setActiveTab(TABS[currentIndex + 1].id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'sentiment':
        return <SentimentTab />;
      case 'insiders':
        return <InsidersTab />;
      case 'validation':
        return <ValidationTab />;
      default:
        return <SentimentTab />;
    }
  };

  return (
    <div className="signals-page">
      <PageHeader
        title="Market Signals"
        subtitle="Multi-source market intelligence"
        icon={<TrendingUp size={24} />}
      />

      {/* Tab Navigation */}
      <div className="signals-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`signals-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.description}
            >
              <Icon size={16} />
              <span className="tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="signals-content">
        <Suspense fallback={<SkeletonTable rows={10} />}>
          {renderTabContent()}
        </Suspense>
      </div>
    </div>
  );
}

export default MarketSignalsPage;
