// frontend/src/pages/ResearchLabPage.js
// Factor Analysis page - historical factor performance and quintile analysis
import { useState, useEffect, Suspense, lazy } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
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

// Lazy load factor analysis components
const HistoricalAnalyticsTab = lazy(() => import('./research/HistoricalAnalyticsTab'));

function ResearchLabPage() {
  const [regime, setRegime] = useState(null);

  // Load market regime on mount
  useEffect(() => {
    tradingAPI.getRegime()
      .then(res => setRegime(res.data))
      .catch(() => setRegime(null));
  }, []);

  return (
    <div className="research-lab-page factor-analysis-page">
      <PageHeader
        title="Factor Analysis"
        subtitle="Historical factor performance and quintile analysis"
        icon={TrendingUp}
      >
        {/* Regime indicator */}
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
      </PageHeader>

      <main className="factor-analysis-content">
        <Suspense fallback={<SkeletonTable rows={8} />}>
          <HistoricalAnalyticsTab />
        </Suspense>
      </main>
    </div>
  );
}

export default ResearchLabPage;
