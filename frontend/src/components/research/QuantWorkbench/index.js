// frontend/src/components/research/QuantWorkbench/index.js
// Quant Lab - Two-workspace design: Factors + ML Ops
// Factors workflow: Browse → Configure → Test → Deploy

import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator, Sliders, BookOpen, TrendingUp, Activity,
  Target, FlaskConical, Cpu, Search, Settings, Play, Rocket, TestTube,
  ChevronDown, ChevronUp, PrismSparkle
} from '../../icons';
import { Skeleton } from '../../Skeleton';
import FactorFormulaBuilder from './FactorFormulaBuilder';
import ICDashboard from './ICDashboard';
import FactorRepository from './FactorRepository';
import SignalGenerator from './SignalGenerator';
import FactorHealthDashboard from './FactorHealthDashboard';
import SectorFactorHeatmap from './SectorFactorHeatmap';
import WalkForwardVisualization from './WalkForwardVisualization';
// Import Factor Lab components
import FactorCombinationTester from '../FactorLab/FactorCombinationTester';
import ScreeningBacktest from '../FactorLab/ScreeningBacktest';
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

// Configure tab modes
const CONFIGURE_MODES = [
  { id: 'single', label: 'Single Factor', Icon: Calculator, description: 'Define a custom factor from metrics' },
  { id: 'combination', label: 'Combination', Icon: Sliders, description: 'Combine multiple factors with weights' },
  { id: 'screen', label: 'Screen', Icon: Target, description: 'Create a stock screening strategy' }
];

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

  // Configure tab mode state
  const [configureMode, setConfigureMode] = useState('single');

  // Test tab expanded sections
  const [expandedTestSections, setExpandedTestSections] = useState(['ic']);

  // Factor selection state (flows through tabs)
  const [selectedFactor, setSelectedFactor] = useState(null);
  const [preloadedResults, setPreloadedResults] = useState(null);

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

  // Run all tests
  const runAllTests = () => {
    setExpandedTestSections(['ic', 'backtest', 'validation']);
    // The individual components will detect they're expanded and run their analysis
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
            <div className="browse-tab">
              {/* Factor Health Overview */}
              <FactorHealthDashboard onFactorSelect={handleFactorSelect} />

              {/* Factor Repository */}
              <FactorRepository
                onFactorSelect={handleFactorSelect}
                selectedFactorId={selectedFactor?.id}
                showStandardFactors={true}
                showCombinations={true}
              />
            </div>
          );

        case 'configure':
          return (
            <div className="configure-tab">
              {/* Mode selector */}
              <div className="configure-mode-selector">
                {CONFIGURE_MODES.map(mode => (
                  <button
                    key={mode.id}
                    className={`mode-btn ${configureMode === mode.id ? 'active' : ''}`}
                    onClick={() => setConfigureMode(mode.id)}
                    title={mode.description}
                  >
                    <mode.Icon size={16} className="mode-icon" />
                    <span className="mode-label">{mode.label}</span>
                  </button>
                ))}
              </div>

              {/* Mode content */}
              <div className="configure-content">
                {configureMode === 'single' && (
                  <FactorFormulaBuilder
                    onFactorCreated={handleFactorCreated}
                    onRunFullAnalysis={handleFullAnalysis}
                    initialFactor={selectedFactor}
                  />
                )}
                {configureMode === 'combination' && (
                  <FactorCombinationTester />
                )}
                {configureMode === 'screen' && (
                  <ScreeningBacktest />
                )}
              </div>
            </div>
          );

        case 'test':
          return (
            <div className="test-tab">
              {/* Selected factor context */}
              {selectedFactor && (
                <div className="test-context">
                  <div className="context-label">Testing:</div>
                  <div className="context-factor">
                    <strong>{selectedFactor.name}</strong>
                    {selectedFactor.formula && (
                      <code>{selectedFactor.formula}</code>
                    )}
                  </div>
                  <button
                    className="clear-factor-btn"
                    onClick={() => setSelectedFactor(null)}
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Run All Tests button */}
              <button className="run-all-tests-btn" onClick={runAllTests}>
                <Play size={16} />
                Run All Tests
              </button>

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
                            onFactorChange={(f) => {
                              setSelectedFactor(f);
                              setPreloadedResults(null);
                            }}
                            preloadedResults={preloadedResults}
                          />
                        )}
                        {section.id === 'backtest' && (
                          <ScreeningBacktest factor={selectedFactor} />
                        )}
                        {section.id === 'walkforward' && (
                          <WalkForwardVisualization
                            factorId={selectedFactor?.id}
                            formula={selectedFactor?.formula}
                          />
                        )}
                        {section.id === 'sectors' && (
                          <SectorFactorHeatmap />
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
              <div className="deploy-options">
                {/* Generate Signals option */}
                <div className="deploy-option signals-option">
                  <div className="option-header">
                    <Target size={24} className="option-icon" />
                    <h4>Generate Signals</h4>
                    <p>Create trading signals for today based on your factor</p>
                  </div>
                  <div className="option-content">
                    <SignalGenerator factor={selectedFactor} />
                  </div>
                </div>

                {/* Export to ML option */}
                <div className="deploy-option ml-option">
                  <div className="option-header">
                    <Cpu size={24} className="option-icon ai-icon" />
                    <h4>Export to ML</h4>
                    <p>Use this factor as input for machine learning models</p>
                  </div>
                  <div className="option-content">
                    {selectedFactor ? (
                      <div className="ml-export-form">
                        <div className="export-preview">
                          <label>Factor to export:</label>
                          <div className="factor-preview">
                            <strong>{selectedFactor.name}</strong>
                            {selectedFactor.formula && (
                              <code>{selectedFactor.formula}</code>
                            )}
                          </div>
                        </div>
                        <p className="export-description">
                          This factor will be available as a feature in the ML Ops workspace
                          for training models and generating predictions.
                        </p>
                        <button className="go-to-mlops-btn" onClick={goToMLOps}>
                          <Cpu size={16} />
                          Go to ML Ops
                        </button>
                      </div>
                    ) : (
                      <div className="no-factor-selected">
                        <p>Select a factor from the Browse tab to export it to ML</p>
                        <button
                          className="go-browse-btn"
                          onClick={() => setActiveTab('browse')}
                        >
                          <Search size={16} />
                          Browse Factors
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
