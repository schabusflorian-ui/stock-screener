// frontend/src/components/prism/PRISMReport.js
// Premium PRISM Investment Report - Full Depth View

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Target,
  AlertTriangle,
  CheckCircle,
  RefreshCcw,
  FileText,
  BarChart2,
  Zap,
  DollarSign,
  Building2,
  Clock,
  Database,
  Award,
  AlertCircle,
  Play
} from 'lucide-react';
import { prismAPI } from '../../services/api';
import { PrismLogo } from '../icons';
import { KeyMetricsTable } from './KeyMetricsTable';
import { BusinessAnalysisCards } from './BusinessAnalysisCards';
import { ValuationScenarios } from './ValuationScenarios';
import { PRISMSectionHeader } from './PRISMSectionHeader';
import FeatureGate from '../subscription/FeatureGate';
import './PRISMReport.css';

// Generation steps for progress tracking
const GENERATION_STEPS = [
  { id: 'data', label: 'Collecting financial data', duration: 8 },
  { id: 'scorecard', label: 'Calculating business scorecard', duration: 5 },
  { id: 'fusion', label: 'Running data fusion engine', duration: 10 },
  { id: 'analysis', label: 'AI analyzing business quality', duration: 25 },
  { id: 'valuation', label: 'Triangulating valuation', duration: 12 },
  { id: 'synthesis', label: 'Synthesizing final report', duration: 15 }
];
const TOTAL_ESTIMATED_TIME = GENERATION_STEPS.reduce((sum, s) => sum + s.duration, 0);

export function PRISMReport({ symbol, companyName, currentPrice, onNavigateToDCF }) {
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | refreshing | error | ready
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const stepTimerRef = useRef(null);
  // Set section expansion states - all sections expanded by default
  const [expandedSections, setExpandedSections] = useState({
    conclusion: true,       // Primary insight - expanded
    businessAnalysis: true, // Core analysis - expanded
    whatMatters: true,      // Key drivers - expanded
    valuation: true         // Key valuation - expanded
  });

  // Progress simulation based on estimated step durations
  useEffect(() => {
    if (status === 'loading' || status === 'refreshing') {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);

      let stepIndex = 0;
      let accumulatedTime = 0;

      const advanceStep = () => {
        if (stepIndex < GENERATION_STEPS.length - 1) {
          accumulatedTime += GENERATION_STEPS[stepIndex].duration;
          stepIndex++;
          setCurrentStep(stepIndex);
          stepTimerRef.current = setTimeout(advanceStep, GENERATION_STEPS[stepIndex].duration * 1000);
        }
      };

      stepTimerRef.current = setTimeout(advanceStep, GENERATION_STEPS[0].duration * 1000);

      return () => {
        clearInterval(timerRef.current);
        clearTimeout(stepTimerRef.current);
      };
    } else {
      setCurrentStep(0);
      setElapsedTime(0);
    }
  }, [status]);

  const loadReport = useCallback(async (forceRefresh = false) => {
    setStatus(forceRefresh ? 'refreshing' : 'loading');
    setError(null);
    setCurrentStep(0);
    setElapsedTime(0);

    try {
      const response = await prismAPI.getReport(symbol, forceRefresh);

      if (response.success) {
        setReport(response.report);
        setStatus('ready');
      } else {
        setError(response.error || 'Failed to load PRISM report');
        setStatus('error');
      }
    } catch (err) {
      console.error('Error loading PRISM report:', err);
      setError(err.message || 'Failed to load PRISM report');
      setStatus('error');
    }
  }, [symbol]);

  // Don't auto-load - wait for user to click Generate

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Calculate progress percentage
  const getProgressPercentage = () => {
    if (currentStep === 0) return 5;
    let completed = 0;
    for (let i = 0; i < currentStep; i++) {
      completed += GENERATION_STEPS[i].duration;
    }
    const stepStart = GENERATION_STEPS.slice(0, currentStep).reduce((sum, s) => sum + s.duration, 0);
    const stepProgress = Math.min(elapsedTime - stepStart, GENERATION_STEPS[currentStep]?.duration || 0);
    completed += stepProgress;
    return Math.min(95, (completed / TOTAL_ESTIMATED_TIME) * 100);
  };

  // Idle state - show Generate button
  if (status === 'idle') {
    return (
      <FeatureGate
        feature="prism_reports"
        showPreview={true}
        previewHeight="400px"
        title="PRISM Investment Reports"
        description="Generate institutional-quality equity research reports with AI-powered analysis of fundamentals, competitive position, and valuation scenarios."
      >
        <div className="prism-report-v3">
          <div className="prism-generate-state">
            <div className="prism-generate-icon">
              <PrismLogo size={48} />
            </div>
            <h3>PRISM Investment Report</h3>
            <p className="prism-generate-description">
              Generate an institutional-quality equity research report with AI-powered
              analysis of fundamentals, competitive position, and valuation scenarios.
            </p>
            <div className="prism-generate-features">
              <div className="feature-item">
                <BarChart2 size={16} />
                <span>12-Factor Business Scorecard</span>
              </div>
              <div className="feature-item">
                <Target size={16} />
                <span>Triangulated Valuation</span>
              </div>
              <div className="feature-item">
                <FileText size={16} />
                <span>AI-Synthesized Analysis</span>
              </div>
            </div>
            <div className="prism-generate-time">
              <Clock size={14} />
              <span>Estimated time: ~{Math.ceil(TOTAL_ESTIMATED_TIME / 60)} minute{TOTAL_ESTIMATED_TIME > 60 ? 's' : ''}</span>
            </div>
            <button className="prism-generate-btn" onClick={() => loadReport(false)}>
              <Play size={18} />
              Generate Report
            </button>
          </div>
        </div>
      </FeatureGate>
    );
  }

  // Loading state with progress bar
  if (status === 'loading' || status === 'refreshing') {
    const progress = getProgressPercentage();
    const currentStepData = GENERATION_STEPS[currentStep];
    const remainingTime = Math.max(0, TOTAL_ESTIMATED_TIME - elapsedTime);

    return (
      <div className="prism-report-v3">
        <div className="prism-loading-state">
          <div className="prism-loader">
            <div className="loader-ring" />
            <PrismLogo className="loader-icon" size={24} />
          </div>
          <h3>{status === 'refreshing' ? 'Regenerating' : 'Generating'} PRISM Report</h3>

          <div className="prism-progress-container">
            <div className="prism-progress-bar">
              <div className="prism-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="prism-progress-info">
              <span className="progress-step">{currentStepData?.label || 'Initializing'}...</span>
              <span className="progress-time">
                ~{remainingTime > 60 ? `${Math.ceil(remainingTime / 60)}m` : `${remainingTime}s`} remaining
              </span>
            </div>
          </div>

          <div className="prism-steps">
            {GENERATION_STEPS.map((step, index) => (
              <div
                key={step.id}
                className={`prism-step ${index < currentStep ? 'completed' : ''} ${index === currentStep ? 'active' : ''}`}
              >
                <div className="step-indicator">
                  {index < currentStep ? (
                    <CheckCircle size={14} />
                  ) : index === currentStep ? (
                    <div className="step-pulse" />
                  ) : (
                    <div className="step-dot" />
                  )}
                </div>
                <span className="step-label">{step.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="prism-report-v3">
        <div className="prism-error-state">
          <AlertTriangle size={32} />
          <h3>Unable to Load Report</h3>
          <p>{error}</p>
          <button onClick={() => loadReport(false)} className="prism-btn primary">
            <RefreshCcw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const scoreRating = getScoreRating(report.overallScore);

  return (
    <div className="prism-report-v3 full-depth">
      {/* Premium Header with Prismatic Gradient */}
      <header className="prism-header-v3">
        <div className="prism-header-gradient" />
        <div className="prism-header-content">
          <div className="prism-brand">
            <div className="prism-logo-mark">
              <Target size={20} />
            </div>
            <div className="prism-brand-text">
              <span className="prism-wordmark">PRISM</span>
              <span className="prism-tagline">Investment Report</span>
            </div>
          </div>

          <div className="prism-header-meta">
            <div className="confidence-pill">
              <Database size={12} />
              <span>{report.confidenceLevel || 'HIGH'} Confidence</span>
            </div>
            <div className="generated-date">
              <Clock size={12} />
              <span>{formatDate(report.metadata?.generatedAt)}</span>
            </div>
            <button
              className="refresh-btn"
              onClick={() => loadReport(true)}
              disabled={status === 'refreshing'}
              title="Regenerate Report"
            >
              <RefreshCcw size={14} className={status === 'refreshing' ? 'spinning' : ''} />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section: Score + Quick Scenarios */}
      <section className="prism-hero">
        <div className="hero-score-card">
          <div className="score-gauge">
            <svg viewBox="0 0 120 120" className="gauge-svg">
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke="var(--border-subtle)"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={`url(#scoreGradient-${scoreRating})`}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(report.overallScore / 10) * 339} 339`}
                transform="rotate(-90 60 60)"
                className="gauge-progress"
              />
              <defs>
                <linearGradient id="scoreGradient-excellent" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--positive)" />
                  <stop offset="100%" stopColor="var(--color-ai-emerald-light)" />
                </linearGradient>
                <linearGradient id="scoreGradient-good" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--color-ai-blue)" />
                  <stop offset="100%" stopColor="var(--color-ai-cyan)" />
                </linearGradient>
                <linearGradient id="scoreGradient-fair" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--warning)" />
                  <stop offset="100%" stopColor="var(--color-gold-400)" />
                </linearGradient>
                <linearGradient id="scoreGradient-poor" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--negative)" />
                  <stop offset="100%" stopColor="var(--negative-light)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="gauge-center">
              <span className="gauge-score">{report.overallScore?.toFixed(1) || '—'}</span>
              <span className="gauge-max">/10</span>
            </div>
          </div>
          <div className="score-label">
            <span className={`score-rating ${scoreRating}`}>{scoreRating.toUpperCase()}</span>
            <span className="score-descriptor">PRISM Score</span>
          </div>
        </div>

        <div className="hero-scenarios">
          <h3 className="scenarios-title">Price Scenarios</h3>
          <div className="scenario-bars">
            <ScenarioBar
              type="bull"
              label="Bull"
              price={report.scenarios?.bull?.price}
              probability={report.scenarios?.bull?.probability}
              currentPrice={currentPrice || report.triangulatedValuation?.currentPrice}
            />
            <ScenarioBar
              type="base"
              label="Base"
              price={report.scenarios?.base?.price}
              probability={report.scenarios?.base?.probability}
              currentPrice={currentPrice || report.triangulatedValuation?.currentPrice}
              isMain
            />
            <ScenarioBar
              type="bear"
              label="Bear"
              price={report.scenarios?.bear?.price}
              probability={report.scenarios?.bear?.probability}
              currentPrice={currentPrice || report.triangulatedValuation?.currentPrice}
            />
          </div>
          <div className="current-price-line">
            <span className="label">Current</span>
            <span className="price">${(currentPrice || report.triangulatedValuation?.currentPrice)?.toFixed(2)}</span>
          </div>
        </div>

        <div className="hero-verdict">
          <div className="verdict-badge">
            <Award size={18} />
            <span>{getVerdict(report.overallScore)}</span>
          </div>
          <p className="verdict-summary">{report.investmentThesis}</p>
        </div>
      </section>

      {/* Investment Conclusion */}
      {(report.conclusion || report.sections?.conclusion) && (
        <CollapsibleSection
          id="conclusion"
          title="Investment Conclusion"
          subtitle="Core thesis and investment rationale"
          icon={<FileText size={18} />}
          isExpanded={expandedSections.conclusion}
          onToggle={() => toggleSection('conclusion')}
          accentColor="emerald"
        >
          <MarkdownContent content={report.conclusion || report.sections?.conclusion} />
        </CollapsibleSection>
      )}

      {/* Business Quality Score */}
      {(report.sections?.companyOverview || report.scorecard) && (
        <CollapsibleSection
          id="businessAnalysis"
          title="Business Quality Score"
          subtitle="12-factor fundamental analysis across 4 categories"
          icon={<Building2 size={18} />}
          isExpanded={expandedSections.businessAnalysis}
          onToggle={() => toggleSection('businessAnalysis')}
          accentColor="blue"
        >
          {/* Company Overview Narrative (at top) */}
          {report.sections?.companyOverview && (
            <div className="company-narrative">
              <MarkdownContent content={report.sections.companyOverview} />
            </div>
          )}

          {/* Business Analysis Cards (below) */}
          {report.scorecard && (
            <BusinessAnalysisCards
              scorecard={report.scorecard}
              analysis={report.businessAnalysis}
              overallScore={report.overallScore}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Key Metrics Table */}
      {report.keyMetrics && (
        <KeyMetricsTable metrics={report.keyMetrics} years={4} />
      )}

      {/* What Matters - Key Drivers */}
      {(report.whatMatters || report.sections?.whatMatters) && (
        <CollapsibleSection
          id="whatMatters"
          title="What Matters"
          subtitle="Key drivers that will determine performance"
          icon={<Zap size={18} />}
          isExpanded={expandedSections.whatMatters}
          onToggle={() => toggleSection('whatMatters')}
          accentColor="warning"
        >
          <MarkdownContent content={report.whatMatters || report.sections?.whatMatters} />
        </CollapsibleSection>
      )}


      {/* Valuation Deep Dive with Triangulation */}
      {(report.triangulatedValuation || report.sections?.valuationScenarios) && (
        <CollapsibleSection
          id="valuation"
          title="Valuation Analysis"
          subtitle="Triangulated perspectives & scenario breakdown"
          icon={<DollarSign size={18} />}
          isExpanded={expandedSections.valuation}
          onToggle={() => toggleSection('valuation')}
          accentColor="info"
        >
          {report.triangulatedValuation ? (
            <ValuationScenarios
              scenarios={report.scenarios}
              currentPrice={currentPrice || report.triangulatedValuation?.currentPrice}
              triangulatedValuation={report.triangulatedValuation}
              onNavigateToDCF={onNavigateToDCF}
            />
          ) : (
            <MarkdownContent content={report.sections?.valuationScenarios} />
          )}
        </CollapsibleSection>
      )}


      {/* Data Quality Footer */}
      <footer className="prism-footer">
        <div className="data-quality-bar">
          <div className="quality-item">
            <CheckCircle size={14} />
            <span>Data Quality: {report.dataSummary?.dataQuality?.overall || 'HIGH'}</span>
          </div>
          {report.dataFusion?.dataGaps?.length > 0 && (
            <div className="quality-item warning">
              <AlertCircle size={14} />
              <span>Gaps: {report.dataFusion.dataGaps.map(g => g.gap).join(', ')}</span>
            </div>
          )}
          <div className="quality-item">
            <Database size={14} />
            <span>Sources: {report.metadata?.dataSources?.length || 0}</span>
          </div>
        </div>
        <div className="prism-disclaimer">
          PRISM reports are AI-generated research tools. Not investment advice.
        </div>
      </footer>
    </div>
  );
}

// Scenario Bar Component
function ScenarioBar({ type, label, price, probability, currentPrice, isMain }) {
  const change = currentPrice && price ? ((price - currentPrice) / currentPrice) * 100 : 0;
  const prob = probability ? (probability * 100).toFixed(0) : '—';

  return (
    <div className={`scenario-bar ${type} ${isMain ? 'main' : ''}`}>
      <div className="scenario-label">{label}</div>
      <div className="scenario-price-info">
        <span className="scenario-price">${price?.toFixed(0) || '—'}</span>
        <span className={`scenario-change ${change >= 0 ? 'up' : 'down'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(0)}%
        </span>
      </div>
      <div className="scenario-prob-bar">
        <div className="prob-fill" style={{ width: `${prob}%` }} />
      </div>
      <div className="scenario-prob">{prob}%</div>
    </div>
  );
}

// Collapsible Section Component - Uses PRISMSectionHeader for consistent styling
function CollapsibleSection({ id, title, subtitle, icon, isExpanded, onToggle, accentColor, children }) {
  return (
    <section className={`prism-section ${isExpanded ? 'expanded' : ''}`}>
      <PRISMSectionHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        accentColor={accentColor}
        collapsible={true}
        expanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="section-content">
          {children}
        </div>
      )}
    </section>
  );
}

// Markdown Content Renderer - Enhanced with tables and blockquotes
function MarkdownContent({ content }) {
  if (!content) return null;

  // Ensure content is a string - handle objects or other types gracefully
  if (typeof content !== 'string') {
    console.warn('MarkdownContent received non-string content:', typeof content);
    return null;
  }

  const parseMarkdown = (text) => {
    const lines = text.split('\n');
    const elements = [];
    let currentList = null;
    let listItems = [];
    let listKey = 0;
    let currentBlockquote = [];
    let blockquoteKey = 0;
    let tableLines = [];
    let tableKey = 0;

    const flushList = () => {
      if (listItems.length > 0) {
        const ListTag = currentList === 'ol' ? 'ol' : 'ul';
        elements.push(<ListTag key={`list-${listKey++}`} className="md-list">{listItems}</ListTag>);
        listItems = [];
        currentList = null;
      }
    };

    const flushBlockquote = () => {
      if (currentBlockquote.length > 0) {
        elements.push(
          <blockquote key={`bq-${blockquoteKey++}`} className="md-blockquote">
            {currentBlockquote.map((line, i) => (
              <p key={i}>{parseInline(line)}</p>
            ))}
          </blockquote>
        );
        currentBlockquote = [];
      }
    };

    const flushTable = () => {
      if (tableLines.length >= 2) {
        const headerRow = tableLines[0];
        const dataRows = tableLines.slice(2); // Skip separator row

        const parseTableRow = (row) => {
          return row
            .split('|')
            .map(cell => cell.trim())
            .filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1 || cell !== '');
        };

        const headers = parseTableRow(headerRow);

        elements.push(
          <div key={`table-wrap-${tableKey}`} className="md-table-wrapper">
            <table className="md-table">
              <thead>
                <tr>
                  {headers.map((header, i) => (
                    <th key={i}>{parseInline(header)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rowIdx) => {
                  const cells = parseTableRow(row);
                  return (
                    <tr key={rowIdx}>
                      {cells.map((cell, cellIdx) => (
                        <td key={cellIdx}>{parseInline(cell)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        tableKey++;
      }
      tableLines = [];
    };

    const flushAll = () => {
      flushList();
      flushBlockquote();
      flushTable();
    };

    const isTableSeparator = (line) => /^\|?[\s-:|]+\|?$/.test(line) && line.includes('-');
    const isTableRow = (line) => line.trim().startsWith('|') && line.trim().endsWith('|');

    lines.forEach((line, index) => {
      // Table detection
      if (isTableRow(line) || (tableLines.length === 1 && isTableSeparator(line))) {
        flushList();
        flushBlockquote();
        tableLines.push(line);
        return;
      }

      // Flush table if we had one and this line isn't part of it
      if (tableLines.length > 0) {
        flushTable();
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        flushList();
        currentBlockquote.push(line.slice(2));
        return;
      }
      if (line.startsWith('>')) {
        flushList();
        currentBlockquote.push(line.slice(1).trim());
        return;
      }

      // Flush blockquote if we had one
      if (currentBlockquote.length > 0) {
        flushBlockquote();
      }

      // Headers
      if (line.startsWith('## ')) {
        flushAll();
        elements.push(<h4 key={index} className="md-h2">{parseInline(line.slice(3))}</h4>);
        return;
      }
      if (line.startsWith('### ')) {
        flushAll();
        elements.push(<h5 key={index} className="md-h3">{parseInline(line.slice(4))}</h5>);
        return;
      }

      // Horizontal rule
      if (/^[-*_]{3,}$/.test(line.trim())) {
        flushAll();
        elements.push(<hr key={index} className="md-hr" />);
        return;
      }

      // Bullet list
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (currentList !== 'ul') flushList();
        currentList = 'ul';
        listItems.push(<li key={index}>{parseInline(line.slice(2))}</li>);
        return;
      }

      // Numbered list
      if (/^\d+\.\s/.test(line)) {
        if (currentList !== 'ol') flushList();
        currentList = 'ol';
        listItems.push(<li key={index}>{parseInline(line.replace(/^\d+\.\s/, ''))}</li>);
        return;
      }

      // Empty line - flush all
      if (line.trim() === '') {
        flushAll();
        return;
      }

      // Regular paragraph
      flushAll();
      elements.push(<p key={index} className="md-p">{parseInline(line)}</p>);
    });

    flushAll();
    return elements;
  };

  const parseInline = (text) => {
    if (!text) return null;
    // Match bold, italic, citations, and inline code
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]|`[^`]+`)/g);

    return parts.map((part, i) => {
      if (!part) return null;
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('[') && part.endsWith(']')) {
        return <span key={i} className="md-citation">{part}</span>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="md-code-inline">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  return <div className="prism-markdown">{parseMarkdown(content)}</div>;
}

// Helper Functions
function getScoreRating(score) {
  if (!score) return 'na';
  if (score >= 8) return 'excellent';
  if (score >= 6) return 'good';
  if (score >= 4) return 'fair';
  return 'poor';
}

function getVerdict(score) {
  if (!score) return 'Under Review';
  if (score >= 8.5) return 'Strong Buy';
  if (score >= 7) return 'Compelling';
  if (score >= 5.5) return 'Hold';
  if (score >= 4) return 'Caution';
  return 'Avoid';
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export default PRISMReport;
