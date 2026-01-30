// frontend/src/components/research/QuantWorkbench/index.js
// Quant Lab - Two-workspace design: Factors + ML Ops
// Factors workflow: Browse → Configure → Test → Deploy

import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator, TrendingUp, Activity, Target, Cpu,
  Search, Settings, Play, Rocket, TestTube,
  ChevronDown, ChevronUp, PrismSparkle, X, Edit3, Loader
} from '../../icons';
import { Skeleton } from '../../Skeleton';
import FactorFormulaBuilder from './FactorFormulaBuilder';
import ICDashboard from './ICDashboard';
import FactorRepository, { STANDARD_FACTORS } from './FactorRepository';
import FactorSelectorPanel from './FactorSelectorPanel';
import SignalGenerator from './SignalGenerator';
import SectorFactorHeatmap from './SectorFactorHeatmap';
import WalkForwardVisualization from './WalkForwardVisualization';
import FactorBacktest from './FactorBacktest';
import './QuantWorkbench.css';

// Lazy load heavier components
const ValidationTab = lazy(() => import('../../../pages/signals/ValidationTab'));
const MLOpsDashboard = lazy(() => import('../../../pages/mlops/MLOpsDashboard'));

// ============================================================
// WORKSPACE DEFINITIONS
// ============================================================

const WORKSPACES = {
  factors: {
    id: 'factors',
    label: 'Factors',
    Icon: Calculator,
    description: 'Factor research workflow',
    tabs: {
      browse: {
        id: 'browse',
        label: 'Browse',
        Icon: Search,
        description: 'View all factors'
      },
      configure: {
        id: 'configure',
        label: 'Configure',
        Icon: Settings,
        description: 'Create or edit factors'
      },
      test: {
        id: 'test',
        label: 'Test',
        Icon: TestTube,
        description: 'Validate factor performance'
      },
      deploy: {
        id: 'deploy',
        label: 'Deploy',
        Icon: Rocket,
        description: 'Generate signals or export to ML'
      }
    }
  },
  mlops: {
    id: 'mlops',
    label: 'ML Ops',
    Icon: Cpu,
    description: 'Machine learning model management',
    tabs: null // Full dashboard, no sub-tabs
  }
};

// Test tab sections
const TEST_SECTIONS = [
  { id: 'ic', label: 'IC Analysis', Icon: TrendingUp, description: 'Statistical validation' },
  { id: 'backtest', label: 'Backtest', Icon: Activity, description: 'Historical performance' },
  { id: 'walkforward', label: 'Walk-Forward', Icon: TestTube, description: 'Rolling out-of-sample validation' },
  { id: 'sectors', label: 'Sector Analysis', Icon: Target, description: 'Factor exposures by sector' }
];

export default function QuantWorkbench({ standalone = false }) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get workspace/tab state from URL or defaults
  const urlWorkspace = searchParams.get('workspace');
  const urlTab = searchParams.get('tab');

  const [workspace, setWorkspace] = useState(
    urlWorkspace && WORKSPACES[urlWorkspace] ? urlWorkspace : 'factors'
  );
  const [activeTab, setActiveTab] = useState(() => {
    const ws = WORKSPACES[urlWorkspace] || WORKSPACES.factors;
    if (ws.tabs && urlTab && ws.tabs[urlTab]) {
      return urlTab;
    }
    return ws.tabs ? Object.keys(ws.tabs)[0] : null;
  });

  // Test tab expanded sections
  const [expandedTestSections, setExpandedTestSections] = useState(['ic']);

  // Factor selector expanded state - removed, always visible now

  // Factor selection state (flows through tabs)
  const [selectedFactor, setSelectedFactor] = useState(null);
  const [preloadedResults, setPreloadedResults] = useState(null);

  // User factors for quick select in Test tab
  const [userFactors, setUserFactors] = useState([]);
  const [loadingUserFactors, setLoadingUserFactors] = useState(false);

  // Trigger for running all tests centrally (incremented to trigger re-runs)
  const [triggerAnalysis, setTriggerAnalysis] = useState(0);

  // Fetch user factors for Test tab selector
  useEffect(() => {
    const fetchUserFactors = async () => {
      setLoadingUserFactors(true);
      try {
        const response = await fetch('/api/factors/user');
        const data = await response.json();
        if (data.success) {
          setUserFactors(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load user factors:', err);
      } finally {
        setLoadingUserFactors(false);
      }
    };
    fetchUserFactors();
  }, []);

  // Sync URL with state
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('workspace', workspace);
    if (activeTab && WORKSPACES[workspace].tabs) {
      params.set('tab', activeTab);
    }
    setSearchParams(params, { replace: true });
  }, [workspace, activeTab, setSearchParams]);

  // Handle workspace change
  const handleWorkspaceChange = (wsId) => {
    setWorkspace(wsId);
    const ws = WORKSPACES[wsId];
    if (ws.tabs) {
      setActiveTab(Object.keys(ws.tabs)[0]);
    } else {
      setActiveTab(null);
    }
  };

  // Handle tab change within workspace
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  // Factor selection handler - used by Browse tab
  const handleFactorSelect = (factor) => {
    setSelectedFactor(factor);
    setPreloadedResults(null);
    // Auto-navigate to Test tab when factor is selected
    setActiveTab('test');
  };

  // Factor created handler - used by Configure tab
  const handleFactorCreated = (factor) => {
    setSelectedFactor(factor);
    // Auto-navigate to Test tab
    setActiveTab('test');
  };

  // Full analysis handler - runs from Configure tab
  const handleFullAnalysis = (results) => {
    setSelectedFactor(results.factor);
    setPreloadedResults({
      icResults: results.icResults,
      correlations: results.correlations
    });
    setActiveTab('test');
  };

  // Toggle test section expansion
  const toggleTestSection = (sectionId) => {
    setExpandedTestSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  // Run all tests - expand sections AND trigger analyses
  const runAllTests = () => {
    setExpandedTestSections(['ic', 'walkforward', 'sectors']);
    // Increment trigger to signal child components to run their analyses
    setTriggerAnalysis(prev => prev + 1);
  };

  // Navigate to ML Ops from Deploy tab
  const goToMLOps = () => {
    setWorkspace('mlops');
    setActiveTab(null);
  };

  const currentWorkspace = WORKSPACES[workspace];

  // ============================================================
  // RENDER CONTENT BASED ON WORKSPACE/TAB
  // ============================================================

  const renderContent = () => {
    // ML Ops workspace - full dashboard
    if (workspace === 'mlops') {
      return (
        <Suspense fallback={<Skeleton className="mlops-skeleton" />}>
          <div className="quant-mlops-wrapper">
            <MLOpsDashboard />
          </div>
        </Suspense>
      );
    }

    // Factors workspace tabs
    if (workspace === 'factors') {
      switch (activeTab) {
        case 'browse':
          return (
            <FactorRepository
              onFactorSelect={handleFactorSelect}
              selectedFactorId={selectedFactor?.id}
              showStandardFactors={true}
              showCombinations={true}
            />
          );

        case 'configure':
          return (
            <FactorFormulaBuilder
              onFactorCreated={handleFactorCreated}
              onRunFullAnalysis={handleFullAnalysis}
              initialFactor={selectedFactor}
            />
          );

        case 'test':
          return (
            <div className="test-tab">
              {/* Factor Selector Panel - Reusable component */}
              <FactorSelectorPanel
                selectedFactor={selectedFactor}
                onSelectFactor={setSelectedFactor}
                userFactors={userFactors}
                context="test"
                onAction={runAllTests}
                onCreateNew={() => setActiveTab('configure')}
              />

              {/* Collapsible test sections */}
              <div className="test-sections">
                {TEST_SECTIONS.map(section => (
                  <div
                    key={section.id}
                    className={`test-section ${expandedTestSections.includes(section.id) ? 'expanded' : ''}`}
                  >
                    <button
                      className="section-header"
                      onClick={() => toggleTestSection(section.id)}
                    >
                      <section.Icon size={16} className="section-icon" />
                      <span className="section-label">{section.label}</span>
                      <span className="section-description">{section.description}</span>
                      <span className="expand-icon">
                        {expandedTestSections.includes(section.id)
                          ? <ChevronUp size={16} />
                          : <ChevronDown size={16} />
                        }
                      </span>
                    </button>

                    {expandedTestSections.includes(section.id) && (
                      <div className="section-content">
                        {section.id === 'ic' && (
                          <ICDashboard
                            factor={selectedFactor}
                            preloadedResults={preloadedResults}
                            triggerAnalysis={triggerAnalysis}
                          />
                        )}
                        {section.id === 'backtest' && (
                          <FactorBacktest
                            factor={selectedFactor}
                            triggerAnalysis={triggerAnalysis}
                          />
                        )}
                        {section.id === 'walkforward' && (
                          <WalkForwardVisualization
                            factor={selectedFactor}
                            triggerAnalysis={triggerAnalysis}
                          />
                        )}
                        {section.id === 'sectors' && (
                          <SectorFactorHeatmap
                            selectedFactor={selectedFactor}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );

        case 'deploy':
          return (
            <div className="deploy-tab">
              {/* Factor Selector Panel - Reusable component */}
              <FactorSelectorPanel
                selectedFactor={selectedFactor}
                onSelectFactor={setSelectedFactor}
                userFactors={userFactors}
                context="deploy"
                onCreateNew={() => setActiveTab('configure')}
              />

              {selectedFactor && (
                <>
                  {/* Primary Action: Generate Signals */}
                  <div className="deploy-section primary">
                    <SignalGenerator factor={selectedFactor} />
                  </div>

                  {/* Secondary Actions Grid */}
                  <div className="deploy-actions-grid">
                    {/* ML Export Card */}
                    <div className="action-card ml-card">
                      <div className="card-icon">
                        <Cpu size={24} />
                      </div>
                      <div className="card-content">
                        <h4>Export to ML</h4>
                        <p>Use this factor as a feature in machine learning models</p>
                      </div>
                      <button className="card-action" onClick={goToMLOps}>
                        Go to ML Ops
                      </button>
                    </div>

                    {/* Quick Links */}
                    <div className="action-card links-card">
                      <div className="card-icon">
                        <Target size={24} />
                      </div>
                      <div className="card-content">
                        <h4>Next Steps</h4>
                        <ul className="quick-links">
                          <li>
                            <button onClick={() => setActiveTab('test')}>
                              <TestTube size={14} />
                              Run validation tests
                            </button>
                          </li>
                          <li>
                            <button onClick={() => setActiveTab('configure')}>
                              <Settings size={14} />
                              Modify factor formula
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          );

        default:
          return null;
      }
    }

    return null;
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className={`quant-workbench ${standalone ? 'standalone' : ''}`}>
      {/* Header - only show when embedded, not standalone */}
      {!standalone && (
        <div className="quant-workbench-header">
          <div className="header-content">
            <h3>Quant Lab</h3>
            <p className="workbench-description">
              Research, build, validate, and deploy quantitative factors
            </p>
          </div>
          <div className="header-badge">
            <PrismSparkle size={14} className="badge-icon" />
            <span className="badge-text">AI-Powered</span>
          </div>
        </div>
      )}

      {/* Meta Tabs (Workspace Switcher) */}
      <div className="quant-meta-tabs">
        {Object.values(WORKSPACES).map(ws => {
          const Icon = ws.Icon;
          const isActive = workspace === ws.id;
          const tabClasses = [
            'quant-meta-tab',
            ws.id === 'mlops' ? 'ml-tab' : '',
            isActive ? 'active' : ''
          ].filter(Boolean).join(' ');

          return (
            <button
              key={ws.id}
              className={tabClasses}
              onClick={() => handleWorkspaceChange(ws.id)}
              title={ws.description}
            >
              <Icon size={20} className="meta-tab-icon" />
              <span className="meta-tab-label">{ws.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub Tabs (for Factors workspace) */}
      {currentWorkspace.tabs && (
        <div className="quant-sub-tabs">
          {Object.values(currentWorkspace.tabs).map(tab => {
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                className={`quant-sub-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
                title={tab.description}
              >
                <Icon size={16} className="sub-tab-icon" />
                <span className="sub-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Content Area */}
      <div className="quant-workbench-content">
        {renderContent()}
      </div>
    </div>
  );
}

export { FactorFormulaBuilder, ICDashboard, FactorRepository };
