// frontend/src/pages/HomePage.js
import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PrismSparkle
} from '../components/icons';
import { statsAPI, indicesAPI, portfoliosAPI, agentsAPI, alertsAPI, macroAPI, screeningAPI } from '../services/api';
import { useFormatters } from '../hooks/useFormatters';
import { useAskAI, AskAIProvider } from '../hooks';
import { WatchlistButton, MiniChart, SelectionActionBar } from '../components';
import { NLQueryBar } from '../components/nl';
import { SkeletonTable, SkeletonDashboard } from '../components/Skeleton';
import { MarketPulsePanel, YourPrismPanel } from '../components/home';
import { Badge } from '../components/ui';
import { FeatureGate } from '../components/subscription';
import './HomePage.css';

const API_BASE = process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/api` : '/api';

// Macro regime colors and icons
const REGIME_CONFIG = {
  CRISIS: { color: '#DC2626', icon: AlertTriangle, label: 'Crisis Mode', bgClass: 'regime-crisis' },
  LATE_CYCLE: { color: '#D97706', icon: Activity, label: 'Late Cycle', bgClass: 'regime-late-cycle' },
  FEAR: { color: '#D97706', icon: TrendingDown, label: 'Fear Mode', bgClass: 'regime-fear' },
  EARLY_CYCLE: { color: '#059669', icon: TrendingUp, label: 'Early Cycle', bgClass: 'regime-early-cycle' },
  NEUTRAL: { color: '#2563EB', icon: BarChart3, label: 'Neutral', bgClass: 'regime-neutral' }
};

// Macro screen presets
const MACRO_SCREENS = [
  { id: 'value-with-macro', name: 'Smart Value', description: 'Auto-adjusts for macro conditions', endpoint: 'value-with-macro' },
  { id: 'recession-resistant', name: 'Recession-Resistant', description: 'Defensive sectors with FCF', endpoint: 'recession-resistant' },
  { id: 'deep-value-safe', name: 'Deep Value + Safe', description: 'Deep value when curve is normal', endpoint: 'deep-value-safe' },
  { id: 'garp-low-vol', name: 'GARP + Low Vol', description: 'Quality when VIX is calm', endpoint: 'garp-low-vol' },
  { id: 'cyclical', name: 'Cyclical Value', description: 'Cyclicals for early cycle', endpoint: 'cyclical' },
  { id: 'fear-buying', name: 'Fear Buying', description: 'Quality during fear', endpoint: 'fear-buying' },
  { id: 'credit-stress', name: 'Credit Fortress', description: 'Strong balance sheets', endpoint: 'credit-stress' }
];

// Get time-based greeting
function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

// Quick query suggestions based on regime
function getQuerySuggestions(regime) {
  const baseSuggestions = [
    'Undervalued tech stocks',
    'Compare AAPL vs MSFT',
    'High dividend stocks'
  ];

  const regimeSuggestions = {
    CRISIS: ['Defensive stocks', 'Low volatility picks'],
    LATE_CYCLE: ['Quality value stocks', 'Recession-resistant'],
    FEAR: ['Fear buying opportunities', 'Quality at discount'],
    EARLY_CYCLE: ['Cyclical plays', 'Growth momentum'],
  };

  if (regime && regimeSuggestions[regime]) {
    return [...regimeSuggestions[regime], ...baseSuggestions.slice(0, 2)];
  }

  return baseSuggestions;
}

// Hero Zone Component with Search
const HeroZone = memo(function HeroZone({ navigate, regime }) {
  const timeOfDay = getTimeOfDay();
  const suggestions = useMemo(() => getQuerySuggestions(regime), [regime]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="hero-zone">
      <div className="hero-header">
        <div className="hero-greeting">
          <div className="ai-icon-container">
            <PrismSparkle size={14} />
          </div>
          <span className="hero-greeting-text">Good {timeOfDay}</span>
        </div>
        <span className="hero-date">{today}</span>
      </div>

      <div className="hero-search-wrapper">
        <NLQueryBar
          placeholder="Ask PRISM anything... stocks, portfolios, market analysis"
          context={{ page: 'home' }}
          onResultSelect={(symbol) => navigate(`/company/${symbol}`)}
          className="hero-search"
        />
      </div>

      <div className="hero-query-chips">
        {suggestions.slice(0, 4).map((suggestion, idx) => (
          <button
            key={idx}
            className="query-chip"
            onClick={() => {
              // Could trigger search with this query
              navigate(`/screening?query=${encodeURIComponent(suggestion)}`);
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
});

// Regime Banner Component - memoized
const RegimeBanner = memo(function RegimeBanner({ regime, loading }) {
  if (loading) {
    return (
      <div className="regime-banner regime-loading">
        <Activity size={20} className="loading-pulse" />
        <span>Loading market regime...</span>
      </div>
    );
  }

  // Don't show if neutral - per user feedback
  if (!regime || regime === 'NEUTRAL') {
    return null;
  }

  const config = REGIME_CONFIG[regime] || REGIME_CONFIG.NEUTRAL;
  const Icon = config.icon;

  const regimeDescriptions = {
    CRISIS: 'Prioritize quality and defensive positions',
    LATE_CYCLE: 'Favor defensive sectors, reduce cyclical exposure',
    FEAR: 'Opportunity for quality accumulation',
    EARLY_CYCLE: 'Cyclicals may outperform, risk-on environment'
  };

  return (
    <Link
      to={`/screening?regime=${regime}`}
      className={`regime-banner ${config.bgClass}`}
      style={{ backgroundColor: `${config.color}15`, borderColor: config.color }}
    >
      <div className="regime-banner-left">
        <div className="regime-icon-wrapper" style={{ backgroundColor: `${config.color}20` }}>
          <Icon size={18} color={config.color} />
        </div>
        <div>
          <div className="regime-label" style={{ color: config.color }}>{config.label}</div>
          <div className="regime-description">{regimeDescriptions[regime]}</div>
        </div>
      </div>
      <div className="regime-cta">
        View adjusted screens <ChevronDown size={14} style={{ transform: 'rotate(-90deg)' }} />
      </div>
    </Link>
  );
});

// Valuation Card with Ask AI support
const ValuationCard = memo(function ValuationCard({ title, subtitle, value, assessment, assessmentClass, chartData, formatValue, unit, linkTo }) {
  // Memoize chart statistics calculation - expensive reduce/map/filter operations
  const chartStats = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;
    const values = chartData.map(d => d.value).filter(v => v != null);
    if (values.length === 0) return null;

    return {
      currentValue: chartData[chartData.length - 1]?.value,
      historicalAvg: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      periodMonths: chartData.length,
      trend: chartData.length > 3
        ? (chartData[chartData.length - 1]?.value > chartData[chartData.length - 4]?.value ? 'rising' : 'falling')
        : undefined
    };
  }, [chartData]);

  // Memoize askAIContext to prevent new object creation on every render
  const askAIContext = useMemo(() => ({
    type: 'valuation_indicator',
    metric: title,
    label: title,
    value,
    assessment,
    chartStats,
    interpretation: chartStats
      ? `${title} at ${value} (${assessment}). Historical range: ${chartStats.min?.toFixed(0)}-${chartStats.max?.toFixed(0)}, avg: ${chartStats.historicalAvg?.toFixed(0)}. Currently ${chartStats.trend || 'stable'}.`
      : `${title} at ${value} (${assessment})`
  }), [title, value, assessment, chartStats]);

  const askAIProps = useAskAI(askAIContext);

  const content = (
    <div className="valuation-card-compact" {...askAIProps}>
      <div className="valuation-card-header">
        <span className="valuation-card-title">{title}</span>
        {subtitle && <span className="valuation-card-subtitle">{subtitle}</span>}
      </div>
      <div className="valuation-card-main">
        <span className="valuation-card-value">{typeof value === 'string' || typeof value === 'number' ? value : String(value ?? '')}</span>
        <span className={`valuation-card-badge ${assessmentClass}`}>
          {typeof assessment === 'string' || typeof assessment === 'number' ? assessment : String(assessment ?? '')}
        </span>
      </div>
      {chartData && chartData.length > 0 && (
        <div className="valuation-card-chart">
          <MiniChart
            data={chartData}
            width={180}
            height={60}
            showYAxis={true}
            showTimeLabels={true}
            formatValue={formatValue}
            unit={unit}
          />
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <AskAIProvider value={askAIContext}>
        <Link to={linkTo} className="valuation-card-link">{content}</Link>
      </AskAIProvider>
    );
  }

  return (
    <AskAIProvider value={askAIContext}>
      {content}
    </AskAIProvider>
  );
});

// Buffett Comparison Card with dual-line chart (All Stocks vs S&P 500)
const BuffettComparisonCard = memo(function BuffettComparisonCard({ data, linkTo }) {
  // Prepare chart data - merge the two series
  const chartData = useMemo(() => {
    if (!data?.totalMarketGDP || !data?.sp500GDP) return [];

    // Create a map of quarters to values
    const quarterMap = {};

    // Add total market data
    data.totalMarketGDP.forEach(d => {
      quarterMap[d.quarter] = { quarter: d.quarter, buffett: d.value };
    });

    // Add S&P 500 data
    data.sp500GDP.forEach(d => {
      if (quarterMap[d.quarter]) {
        quarterMap[d.quarter].sp500 = d.value;
      } else {
        quarterMap[d.quarter] = { quarter: d.quarter, sp500: d.value };
      }
    });

    // Convert to array and sort
    // Filter out incomplete quarters (where data drops significantly - indicates partial data)
    const sorted = Object.values(quarterMap)
      .sort((a, b) => a.quarter.localeCompare(b.quarter));

    // Remove last quarter if it shows a significant drop (incomplete data)
    if (sorted.length >= 2) {
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      if (last.buffett && prev.buffett && last.buffett < prev.buffett * 0.85) {
        sorted.pop(); // Remove incomplete quarter
      }
    }

    return sorted.slice(-40); // Last 10 years (40 quarters)
  }, [data]);

  // Get current values
  const currentBuffett = data?.currentValues?.buffett;
  const currentSP500 = data?.currentValues?.sp500;
  const largecapShare = data?.currentValues?.largecapShare;

  // Assessment based on Buffett value (matches backend thresholds)
  const getAssessment = (value) => {
    if (!value) return 'N/A';
    if (value >= 200) return 'Extremely Overvalued';
    if (value >= 150) return 'Significantly Overvalued';
    if (value >= 120) return 'Modestly Overvalued';
    if (value >= 80) return 'Fair Value';
    if (value >= 60) return 'Modestly Undervalued';
    return 'Significantly Undervalued';
  };

  const assessment = getAssessment(currentBuffett);
  const assessmentClass = currentBuffett >= 150 ? 'negative' : currentBuffett >= 100 ? 'neutral' : 'positive';

  const askAIContext = useMemo(() => ({
    type: 'valuation_comparison',
    metric: 'Buffett Comparison',
    label: 'Market to GDP Comparison',
    values: { buffett: currentBuffett, sp500: currentSP500, largecapShare },
    interpretation: `Total Market/GDP: ${currentBuffett?.toFixed(0)}%, S&P 500/GDP: ${currentSP500?.toFixed(0)}%. Large-caps represent ${largecapShare}% of total market cap.`
  }), [currentBuffett, currentSP500, largecapShare]);

  const askAIProps = useAskAI(askAIContext);

  const content = (
    <div className="valuation-card-compact buffett-comparison" {...askAIProps}>
      <div className="valuation-card-header">
        <span className="valuation-card-title">Market to GDP</span>
        <span className="valuation-card-subtitle">Buffett Indicator vs S&P 500</span>
      </div>
      <div className="valuation-card-main">
        <div className="buffett-values">
          <div className="buffett-value-item">
            <span className="buffett-label" style={{ color: '#2563EB' }}>All Stocks</span>
            <span className="buffett-num">{currentBuffett ? `${currentBuffett.toFixed(0)}%` : 'N/A'}</span>
          </div>
          <div className="buffett-value-item">
            <span className="buffett-label" style={{ color: '#059669' }}>S&P 500</span>
            <span className="buffett-num">{currentSP500 ? `${currentSP500.toFixed(0)}%` : 'N/A'}</span>
          </div>
        </div>
        <span className={`valuation-card-badge ${assessmentClass}`}>
          {assessment}
        </span>
      </div>
      {chartData.length > 0 && (
        <div className="buffett-comparison-chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={chartData} margin={{ top: 5, right: 45, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="quarter"
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                interval={7}
                tickFormatter={(q) => q.split('-')[0]}
              />
              <YAxis
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v)}%`}
                domain={[
                  (dataMin) => Math.max(0, Math.floor(dataMin / 10) * 10 - 10),
                  (dataMax) => Math.ceil(dataMax / 10) * 10 + 10
                ]}
              />
              <Tooltip
                formatter={(value, name) => [`${value?.toFixed(0)}%`, name]}
                labelFormatter={(label) => label}
                contentStyle={{
                  background: '#1E293B',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '6px 10px'
                }}
              />
              <Line
                type="monotone"
                dataKey="buffett"
                stroke="#2563EB"
                strokeWidth={1.5}
                dot={false}
                name="All Stocks"
              />
              <Line
                type="monotone"
                dataKey="sp500"
                stroke="#059669"
                strokeWidth={1.5}
                dot={false}
                name="S&P 500"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <AskAIProvider value={askAIContext}>
        <Link to={linkTo} className="valuation-card-link">{content}</Link>
      </AskAIProvider>
    );
  }

  return (
    <AskAIProvider value={askAIContext}>
      {content}
    </AskAIProvider>
  );
});

// S&P 500 P/E Card with reference lines (Mean, +50%, +100%)
const SP500PECard = memo(function SP500PECard({ chartData, linkTo }) {
  // Historical mean P/E for S&P 500 is around 17x
  const MEAN_PE = 17;
  const PLUS_50_PE = MEAN_PE * 1.5;  // ~25.5x
  const PLUS_100_PE = MEAN_PE * 2.0; // ~34x

  // Prepare chart data
  const processedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map(d => ({
      quarter: d.quarter,
      date: d.date,
      value: d.value
    }));
  }, [chartData]);

  // Get current value
  const currentValue = processedData.length > 0
    ? processedData[processedData.length - 1]?.value
    : null;

  // Assessment based on P/E vs historical bands
  const getAssessment = (value) => {
    if (!value) return 'N/A';
    if (value >= PLUS_100_PE) return 'Extremely Expensive';
    if (value >= PLUS_50_PE) return 'Expensive';
    if (value >= MEAN_PE) return 'Above Average';
    if (value >= MEAN_PE * 0.75) return 'Fair Value';
    return 'Attractive';
  };

  const assessment = getAssessment(currentValue);
  const assessmentClass = currentValue >= PLUS_50_PE ? 'negative' : currentValue >= MEAN_PE ? 'neutral' : 'positive';

  const askAIContext = useMemo(() => ({
    type: 'valuation_indicator',
    metric: 'S&P 500 P/E Ratio',
    label: 'S&P 500 P/E with Historical Bands',
    value: currentValue,
    assessment,
    bands: { mean: MEAN_PE, plus50: PLUS_50_PE, plus100: PLUS_100_PE },
    interpretation: `S&P 500 P/E at ${currentValue?.toFixed(1)}x (${assessment}). Historical mean: ${MEAN_PE}x, +50%: ${PLUS_50_PE.toFixed(0)}x, +100%: ${PLUS_100_PE.toFixed(0)}x.`
  }), [currentValue, assessment]);

  const askAIProps = useAskAI(askAIContext);

  // Calculate Y-axis bounds for reference areas
  const yMin = Math.max(0, Math.floor(MEAN_PE * 0.6 / 5) * 5);
  const yMax = Math.ceil(PLUS_100_PE * 1.3 / 5) * 5;

  const content = (
    <div className="valuation-card-compact sp500-pe-card" {...askAIProps}>
      <div className="valuation-card-header">
        <span className="valuation-card-title">S&P 500 P/E Ratio</span>
        <span className="valuation-card-subtitle">Cap-Weighted TTM Earnings</span>
      </div>
      <div className="valuation-card-main">
        <span className="sp500-pe-current">{currentValue ? `${currentValue.toFixed(1)}x` : 'N/A'}</span>
      </div>
      <span className={`valuation-card-badge ${assessmentClass}`}>
        {assessment}
      </span>
      {processedData.length > 0 && (
        <div className="sp500-pe-chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={processedData} margin={{ top: 5, right: 45, bottom: 0, left: -20 }}>
              {/* Background bands for valuation zones - subtle transparency */}
              <ReferenceArea
                y1={yMin}
                y2={MEAN_PE}
                fill="#22C55E"
                fillOpacity={0.04}
              />
              <ReferenceArea
                y1={MEAN_PE}
                y2={PLUS_50_PE}
                fill="#F59E0B"
                fillOpacity={0.04}
              />
              <ReferenceArea
                y1={PLUS_50_PE}
                y2={PLUS_100_PE}
                fill="#EF4444"
                fillOpacity={0.05}
              />
              <ReferenceArea
                y1={PLUS_100_PE}
                y2={yMax}
                fill="#EF4444"
                fillOpacity={0.08}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(processedData.length / 5)}
                tickFormatter={(d) => d?.split('-')[0]}
              />
              <YAxis
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v)}x`}
                domain={[yMin, yMax]}
              />
              {/* Reference lines - dotted with labels on right */}
              <ReferenceLine
                y={MEAN_PE}
                stroke="#22C55E"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ value: 'Mean', position: 'right', fontSize: 8, fill: '#22C55E' }}
              />
              <ReferenceLine
                y={PLUS_50_PE}
                stroke="#F59E0B"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: '+50%', position: 'right', fontSize: 8, fill: '#F59E0B' }}
              />
              <ReferenceLine
                y={PLUS_100_PE}
                stroke="#EF4444"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: '+100%', position: 'right', fontSize: 8, fill: '#EF4444' }}
              />
              <Tooltip
                formatter={(value, name) => [`${value?.toFixed(1)}x`, name]}
                labelFormatter={(label, payload) => {
                  // Show quarter label from the data point
                  if (payload && payload.length > 0 && payload[0].payload.quarter) {
                    return payload[0].payload.quarter;
                  }
                  return label;
                }}
                contentStyle={{
                  background: '#1E293B',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '6px 10px'
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#1E3A5F"
                strokeWidth={2}
                dot={false}
                name="P/E Ratio"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <AskAIProvider value={askAIContext}>
        <Link to={linkTo} className="valuation-card-link">{content}</Link>
      </AskAIProvider>
    );
  }

  return (
    <AskAIProvider value={askAIContext}>
      {content}
    </AskAIProvider>
  );
});

// MSI Card with reference lines and color bands (similar to S&P 500 P/E)
const MSICard = memo(function MSICard({ chartData, currentValue, assessment, linkTo }) {
  // MSI (EV/Book Value) historical bands
  // Historical mean is around 1.5x
  const MEAN_MSI = 1.5;
  const PLUS_50_MSI = MEAN_MSI * 1.5;  // ~2.25x
  const PLUS_100_MSI = MEAN_MSI * 2.0; // ~3.0x

  // Prepare chart data
  const processedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map(d => ({
      date: d.date,
      value: d.value
    }));
  }, [chartData]);

  // Get display value
  const displayValue = currentValue ?? (processedData.length > 0 ? processedData[processedData.length - 1]?.value : null);

  // Assessment based on MSI vs historical bands
  const getAssessment = (value) => {
    if (!value) return 'N/A';
    if (value >= PLUS_100_MSI) return 'Extremely Expensive';
    if (value >= PLUS_50_MSI) return 'Expensive';
    if (value >= MEAN_MSI) return 'Above Average';
    if (value >= MEAN_MSI * 0.75) return 'Fair Value';
    return 'Attractive';
  };

  const displayAssessment = assessment || getAssessment(displayValue);
  const assessmentClass = displayValue >= PLUS_50_MSI ? 'negative' : displayValue >= MEAN_MSI ? 'neutral' : 'positive';

  const askAIContext = useMemo(() => ({
    type: 'valuation_indicator',
    metric: 'MSI Score',
    label: 'MSI (EV/Book Value) with Historical Bands',
    value: displayValue,
    assessment: displayAssessment,
    bands: { mean: MEAN_MSI, plus50: PLUS_50_MSI, plus100: PLUS_100_MSI },
    interpretation: `MSI at ${displayValue?.toFixed(2)}x (${displayAssessment}). Historical mean: ${MEAN_MSI}x, +50%: ${PLUS_50_MSI.toFixed(1)}x, +100%: ${PLUS_100_MSI.toFixed(1)}x.`
  }), [displayValue, displayAssessment]);

  const askAIProps = useAskAI(askAIContext);

  // Calculate Y-axis bounds for reference areas
  const yMin = Math.max(0, Math.floor(MEAN_MSI * 0.5 / 0.5) * 0.5);
  const yMax = Math.ceil(PLUS_100_MSI * 1.2 / 0.5) * 0.5;

  const content = (
    <div className="valuation-card-compact msi-card" {...askAIProps}>
      <div className="valuation-card-header">
        <span className="valuation-card-title">MSI Score</span>
        <span className="valuation-card-subtitle">EV ÷ Book Value (4Q Avg)</span>
      </div>
      <div className="valuation-card-main">
        <span className="msi-current">{displayValue ? `${displayValue.toFixed(2)}x` : 'N/A'}</span>
      </div>
      <span className={`valuation-card-badge ${assessmentClass}`}>
        {displayAssessment}
      </span>
      {processedData.length > 0 && (
        <div className="msi-chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={processedData} margin={{ top: 5, right: 45, bottom: 0, left: -20 }}>
              {/* Background bands for valuation zones */}
              <ReferenceArea
                y1={yMin}
                y2={MEAN_MSI}
                fill="#22C55E"
                fillOpacity={0.04}
              />
              <ReferenceArea
                y1={MEAN_MSI}
                y2={PLUS_50_MSI}
                fill="#F59E0B"
                fillOpacity={0.04}
              />
              <ReferenceArea
                y1={PLUS_50_MSI}
                y2={PLUS_100_MSI}
                fill="#EF4444"
                fillOpacity={0.05}
              />
              <ReferenceArea
                y1={PLUS_100_MSI}
                y2={yMax}
                fill="#EF4444"
                fillOpacity={0.08}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(processedData.length / 5)}
                tickFormatter={(d) => d?.split('-')[0]}
              />
              <YAxis
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v.toFixed(1)}x`}
                domain={[yMin, yMax]}
              />
              {/* Reference lines with labels */}
              <ReferenceLine
                y={MEAN_MSI}
                stroke="#22C55E"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ value: 'Mean', position: 'right', fontSize: 8, fill: '#22C55E' }}
              />
              <ReferenceLine
                y={PLUS_50_MSI}
                stroke="#F59E0B"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: '+50%', position: 'right', fontSize: 8, fill: '#F59E0B' }}
              />
              <ReferenceLine
                y={PLUS_100_MSI}
                stroke="#EF4444"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: '+100%', position: 'right', fontSize: 8, fill: '#EF4444' }}
              />
              <Tooltip
                formatter={(value) => [`${value?.toFixed(2)}x`, 'MSI']}
                labelFormatter={(label) => label}
                contentStyle={{
                  background: '#1E293B',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '6px 10px'
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={false}
                name="MSI"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <AskAIProvider value={askAIContext}>
        <Link to={linkTo} className="valuation-card-link">{content}</Link>
      </AskAIProvider>
    );
  }

  return (
    <AskAIProvider value={askAIContext}>
      {content}
    </AskAIProvider>
  );
});

// FRED MSI Card - Official Federal Reserve Equity/Net Worth ratio
// This is the industry-standard MSI matching external benchmarks
const FREDMSICard = memo(function FREDMSICard({ chartData, linkTo }) {
  // FRED MSI (Equity / Net Worth) - equilibrium is 1.0
  const EQUILIBRIUM = 1.0;
  const OVERVALUED = 1.5;    // 50% above equilibrium
  const EXPENSIVE = 2.0;      // 100% above equilibrium

  // Prepare chart data
  const processedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map(d => ({
      date: d.date,
      value: d.value
    }));
  }, [chartData]);

  const currentValue = processedData.length > 0 ? processedData[processedData.length - 1]?.value : null;

  // Assessment based on FRED MSI vs equilibrium
  const getAssessment = (value) => {
    if (!value) return 'N/A';
    if (value >= EXPENSIVE) return 'Extremely Overvalued';
    if (value >= OVERVALUED) return 'Overvalued';
    if (value >= EQUILIBRIUM) return 'Above Equilibrium';
    if (value >= 0.75) return 'Fair Value';
    return 'Undervalued';
  };

  const assessment = getAssessment(currentValue);
  const assessmentClass = currentValue >= OVERVALUED ? 'negative' : currentValue >= EQUILIBRIUM ? 'neutral' : 'positive';

  const askAIContext = useMemo(() => ({
    type: 'valuation_indicator',
    metric: 'MSI Score',
    label: 'Misean Stationarity Index',
    value: currentValue,
    assessment: assessment,
    bands: { equilibrium: EQUILIBRIUM, overvalued: OVERVALUED, expensive: EXPENSIVE },
    interpretation: `MSI at ${currentValue?.toFixed(2)} (${assessment}). Equilibrium: ${EQUILIBRIUM}, Overvalued: ${OVERVALUED}, Expensive: ${EXPENSIVE}. MSI = Corporate Equity / Net Worth from Federal Reserve data.`
  }), [currentValue, assessment]);

  const askAIProps = useAskAI(askAIContext);

  // Y-axis bounds
  const yMin = 0.5;
  const yMax = 2.5;

  const content = (
    <div className="valuation-card-compact msi-card" {...askAIProps}>
      <div className="valuation-card-header">
        <span className="valuation-card-title">MSI Score</span>
        <span className="valuation-card-subtitle">Equity ÷ Net Worth</span>
      </div>
      <div className="valuation-card-main">
        <span className="msi-current">{currentValue ? currentValue.toFixed(2) : 'N/A'}</span>
      </div>
      <span className={`valuation-card-badge ${assessmentClass}`}>
        {assessment}
      </span>
      {processedData.length > 0 && (
        <div className="msi-chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={processedData} margin={{ top: 5, right: 45, bottom: 0, left: -20 }}>
              {/* Background bands */}
              <ReferenceArea y1={yMin} y2={EQUILIBRIUM} fill="#22C55E" fillOpacity={0.04} />
              <ReferenceArea y1={EQUILIBRIUM} y2={OVERVALUED} fill="#F59E0B" fillOpacity={0.04} />
              <ReferenceArea y1={OVERVALUED} y2={EXPENSIVE} fill="#EF4444" fillOpacity={0.05} />
              <ReferenceArea y1={EXPENSIVE} y2={yMax} fill="#EF4444" fillOpacity={0.08} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(processedData.length / 5)}
                tickFormatter={(d) => d?.split('-')[0]}
              />
              <YAxis
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v.toFixed(1)}
                domain={[yMin, yMax]}
              />
              {/* Reference lines */}
              <ReferenceLine y={EQUILIBRIUM} stroke="#22C55E" strokeWidth={1} strokeDasharray="3 3" label={{ value: '1.0', position: 'right', fontSize: 8, fill: '#22C55E' }} />
              <ReferenceLine y={OVERVALUED} stroke="#F59E0B" strokeDasharray="3 3" strokeWidth={1} label={{ value: '1.5', position: 'right', fontSize: 8, fill: '#F59E0B' }} />
              <ReferenceLine y={EXPENSIVE} stroke="#EF4444" strokeDasharray="3 3" strokeWidth={1} label={{ value: '2.0', position: 'right', fontSize: 8, fill: '#EF4444' }} />
              <Tooltip
                formatter={(value) => [value?.toFixed(3), 'MSI']}
                labelFormatter={(label) => label}
                contentStyle={{ background: '#1E293B', border: 'none', borderRadius: '6px', fontSize: '11px', padding: '6px 10px' }}
              />
              <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={false} name="MSI" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <AskAIProvider value={askAIContext}>
        <Link to={linkTo} className="valuation-card-link">{content}</Link>
      </AskAIProvider>
    );
  }

  return (
    <AskAIProvider value={askAIContext}>
      {content}
    </AskAIProvider>
  );
});

// Undervalued Card with same formatting as Buffett/PE charts
const UndervaluedCard = memo(function UndervaluedCard({ chartData, currentValue, stockCount, totalCount, linkTo }) {
  // Prepare chart data
  const processedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map(d => ({
      date: d.date,
      value: d.value
    }));
  }, [chartData]);

  // Get display value
  const displayValue = currentValue ?? (processedData.length > 0 ? processedData[processedData.length - 1]?.value : null);

  // Assessment based on % undervalued
  const getAssessment = () => {
    if (stockCount && totalCount) {
      return `${stockCount} of ${totalCount} stocks`;
    }
    return 'N/A';
  };

  const askAIContext = useMemo(() => ({
    type: 'valuation_indicator',
    metric: '% Stocks Undervalued',
    label: 'Percentage of Stocks Trading Below Fair Value',
    value: displayValue,
    stockCount,
    totalCount,
    interpretation: `${displayValue?.toFixed(0)}% of stocks trading below fair value (P/E < 16). ${stockCount || '?'} of ${totalCount || '?'} stocks are undervalued.`
  }), [displayValue, stockCount, totalCount]);

  const askAIProps = useAskAI(askAIContext);

  // Calculate Y-axis bounds
  const values = processedData.map(d => d.value).filter(v => v != null);
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const dataMax = values.length > 0 ? Math.max(...values) : 100;
  const yMin = Math.max(0, Math.floor(dataMin / 10) * 10 - 10);
  const yMax = Math.min(100, Math.ceil(dataMax / 10) * 10 + 10);

  const content = (
    <div className="valuation-card-compact undervalued-card" {...askAIProps}>
      <div className="valuation-card-header">
        <span className="valuation-card-title">% Stocks Undervalued</span>
        <span className="valuation-card-subtitle">Trading Below Fair Value (P/E &lt; 16)</span>
      </div>
      <div className="valuation-card-main">
        <span className="undervalued-current">{displayValue ? `${displayValue.toFixed(0)}%` : 'N/A'}</span>
      </div>
      <span className="valuation-card-badge info">
        {getAssessment()}
      </span>
      {processedData.length > 0 && (
        <div className="undervalued-chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={processedData} margin={{ top: 5, right: 45, bottom: 0, left: -20 }}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(processedData.length / 5)}
                tickFormatter={(d) => d?.split('-')[0]}
              />
              <YAxis
                tick={{ fontSize: 8, fill: '#94A3B8' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v)}%`}
                domain={[yMin, yMax]}
              />
              {/* Reference line at 50% */}
              <ReferenceLine
                y={50}
                stroke="#94A3B8"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ value: '50%', position: 'right', fontSize: 8, fill: '#94A3B8' }}
              />
              <Tooltip
                formatter={(value) => [`${value?.toFixed(0)}%`, 'Undervalued']}
                labelFormatter={(label) => label}
                contentStyle={{
                  background: '#1E293B',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '6px 10px'
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#06B6D4"
                strokeWidth={2}
                dot={false}
                name="% Undervalued"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <AskAIProvider value={askAIContext}>
        <Link to={linkTo} className="valuation-card-link">{content}</Link>
      </AskAIProvider>
    );
  }

  return (
    <AskAIProvider value={askAIContext}>
      {content}
    </AskAIProvider>
  );
});

// Simplified Valuation Dashboard - 4 metrics in 2x2 grid, no Treasury yields
const ValuationDashboard = memo(function ValuationDashboard({ indicators, valuationHistory, buffettComparison, loading }) {
  if (loading) {
    return (
      <div className="valuation-panel loading">
        <div className="skeleton-grid-2x2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!indicators) return null;

  const { buffettIndicator, aggregateValuation } = indicators;

  const getAssessmentClass = (assessment) => {
    if (!assessment) return '';
    const lower = assessment.toLowerCase();
    if (lower.includes('overvalued') || lower.includes('expensive') || lower.includes('high')) return 'negative';
    if (lower.includes('undervalued') || lower.includes('attractive') || lower.includes('cheap') || lower.includes('low')) return 'positive';
    return 'neutral';
  };

  return (
    <div className="valuation-panel">
      <div className="valuation-panel-header">
        <span className="section-label">VALUATION SNAPSHOT</span>
        <h3><BarChart3 size={16} /> Aggregate Market Valuation</h3>
      </div>

      <div className="valuation-grid-2x2">
        {/* Buffett Indicator Comparison (All Stocks vs S&P 500 / GDP) */}
        {buffettComparison ? (
          <BuffettComparisonCard
            data={buffettComparison}
            linkTo="/research/factors?factor=valuation"
          />
        ) : (
          <ValuationCard
            title="Buffett Indicator"
            subtitle="Total Market Cap ÷ GDP"
            value={buffettIndicator?.value ? `${buffettIndicator.value.toFixed(0)}%` : 'N/A'}
            assessment={buffettIndicator?.assessment || 'N/A'}
            assessmentClass={getAssessmentClass(buffettIndicator?.assessment)}
            chartData={valuationHistory?.buffett}
            formatValue={(v) => v?.toFixed(0)}
            unit="%"
            linkTo="/research/factors?factor=valuation"
          />
        )}

        {/* S&P 500 P/E with historical bands */}
        <SP500PECard
          chartData={valuationHistory?.sp500PE}
          linkTo="/research/factors?factor=valuation"
        />

        {/* MSI Score - Federal Reserve Equity/Net Worth ratio */}
        <FREDMSICard
          chartData={valuationHistory?.fredMSI}
          linkTo="/research/factors?factor=valuation"
        />

        {/* % Undervalued with same chart formatting */}
        <UndervaluedCard
          chartData={valuationHistory?.pctUndervalued}
          currentValue={aggregateValuation?.pctUndervalued}
          stockCount={aggregateValuation?.undervaluedStocks}
          totalCount={aggregateValuation?.totalStocks}
          linkTo="/screening?filter=undervalued"
        />
      </div>
    </div>
  );
});

// Single Screen Result Row with Ask AI support
const ScreenResultRow = memo(function ScreenResultRow({ stock, isSelected, onToggleSelect, formatPercent, formatNumber }) {
  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    symbol: stock.symbol,
    label: `${stock.symbol} - ${stock.name}`,
    data: { roic: stock.roic, pe_ratio: stock.pe_ratio, fcf_yield: stock.fcf_yield }
  }));

  return (
    <tr
      className={isSelected ? 'selected' : ''}
      onClick={(e) => {
        if (e.target.closest('a, button')) return;
        onToggleSelect(stock.symbol);
      }}
      {...askAIProps}
    >
      <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(stock.symbol)}
        />
      </td>
      <td>
        <Link to={`/company/${stock.symbol}`} className="symbol-link">
          {stock.symbol}
        </Link>
      </td>
      <td className="company-name">{stock.name?.substring(0, 20)}</td>
      <td className={stock.roic > 15 ? 'value-good' : stock.roic > 10 ? 'value-neutral' : 'value-bad'}>
        {formatPercent(stock.roic)}
      </td>
      <td className={stock.pe_ratio < 15 ? 'value-good' : stock.pe_ratio < 25 ? 'value-neutral' : 'value-bad'}>
        {stock.pe_ratio ? formatNumber(stock.pe_ratio, 1) : 'N/A'}
      </td>
      <td className={stock.fcf_yield > 5 ? 'value-good' : stock.fcf_yield > 0 ? 'value-neutral' : 'value-bad'}>
        {formatPercent(stock.fcf_yield)}
      </td>
      <td>
        <WatchlistButton symbol={stock.symbol} size="small" />
      </td>
    </tr>
  );
});

// Value Screen Results Table - memoized with selection support
const ScreenResultsTable = memo(function ScreenResultsTable({
  results,
  loading,
  selectedSymbols = [],
  onToggleSelect,
  onToggleSelectAll
}) {
  const { percent: formatPercent, number: formatNumber } = useFormatters();

  if (loading) {
    return <SkeletonTable rows={5} columns={6} />;
  }

  if (!results || results.length === 0) {
    return <div className="no-results">No stocks match the current criteria</div>;
  }

  // Reduced from 8 to 5 per plan
  const displayedResults = results.slice(0, 5);
  const allDisplayedSelected = displayedResults.every(s => selectedSymbols.includes(s.symbol));
  const someSelected = selectedSymbols.length > 0 && !allDisplayedSelected;

  return (
    <div className="screen-results-table-container">
      <table className="screen-results-table selectable">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={allDisplayedSelected && displayedResults.length > 0}
                ref={el => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={() => onToggleSelectAll(displayedResults.map(s => s.symbol))}
                title="Select all displayed"
              />
            </th>
            <th>Symbol</th>
            <th>Company</th>
            <th>ROIC</th>
            <th>P/E</th>
            <th>FCF Yield</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {displayedResults.map((stock) => (
            <ScreenResultRow
              key={stock.symbol}
              stock={stock}
              isSelected={selectedSymbols.includes(stock.symbol)}
              onToggleSelect={onToggleSelect}
              formatPercent={formatPercent}
              formatNumber={formatNumber}
            />
          ))}
        </tbody>
      </table>
      {results.length > 5 && (
        <div className="results-more">
          <Link to="/screening">View all {results.length} results</Link>
        </div>
      )}
    </div>
  );
});

// Value Screens Section Component - memoized with selection support
const ValueScreensSection = memo(function ValueScreensSection({ screens, activeScreen, setActiveScreen, screenResults, screenLoading, screenMeta }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedSymbols, setSelectedSymbols] = useState([]);

  useEffect(() => {
    setSelectedSymbols([]);
  }, [activeScreen]);

  const handleToggleSelect = useCallback((symbol) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  }, []);

  const handleToggleSelectAll = useCallback((symbols) => {
    setSelectedSymbols(prev => {
      const allSelected = symbols.every(s => prev.includes(s));
      if (allSelected) {
        return prev.filter(s => !symbols.includes(s));
      } else {
        return [...new Set([...prev, ...symbols])];
      }
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSymbols([]);
  }, []);

  return (
    <div className="screens-section">
      <div className="section-header clickable" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="section-header-content">
          <span className="section-label">SCREENING</span>
          <h3>
            <Target size={18} />
            Value Screens
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </h3>
        </div>
        <Link to="/screening" className="section-action" onClick={(e) => e.stopPropagation()}>All Screens</Link>
      </div>

      {isExpanded && (
        <div className="screens-content">
          <div className="screen-chips">
            {screens.map(screen => (
              <button
                key={screen.id}
                className={`screen-chip ${activeScreen === screen.id ? 'active' : ''}`}
                onClick={() => setActiveScreen(screen.id)}
              >
                {screen.name}
              </button>
            ))}
          </div>

          {screenMeta && (
            <div className="screen-meta-row">
              <span className="screen-meta-name">{screenMeta.name}</span>
              <Badge variant="blue">{screenMeta.count || 0} stocks</Badge>
              {screenMeta.warning && (
                <span className="screen-meta-warning">
                  <AlertTriangle size={12} />
                  {screenMeta.warning}
                </span>
              )}
            </div>
          )}

          <SelectionActionBar
            selectedItems={selectedSymbols}
            onClear={handleClearSelection}
          />

          <ScreenResultsTable
            results={screenResults}
            loading={screenLoading}
            selectedSymbols={selectedSymbols}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
          />
        </div>
      )}
    </div>
  );
});

function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [marketIndices, setMarketIndices] = useState([]);
  const [indexPriceHistory, setIndexPriceHistory] = useState({});

  // User data state
  const [portfolios, setPortfolios] = useState([]);
  const [agents, setAgents] = useState([]);
  const [alertsSummary, setAlertsSummary] = useState(null);
  const [commandCenterLoading, setCommandCenterLoading] = useState(true);

  // Market indicators state
  const [marketIndicators, setMarketIndicators] = useState(null);
  const [indicatorsLoading, setIndicatorsLoading] = useState(true);
  const [valuationHistory, setValuationHistory] = useState({});
  const [buffettComparison, setBuffettComparison] = useState(null);

  // Value Investing states
  const [activeScreen, setActiveScreen] = useState('value-with-macro');
  const [screenResults, setScreenResults] = useState(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenMeta, setScreenMeta] = useState(null);

  // Fetch user data (portfolios, agents, alerts)
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const [portfoliosRes, agentsRes, alertsSummaryRes] = await Promise.all([
          portfoliosAPI.getAll().catch(() => ({ data: [] })),
          agentsAPI.getAll().catch(() => ({ data: [] })),
          alertsAPI.getSummary().catch(() => ({ data: {} }))
        ]);

        setPortfolios(portfoliosRes.data || []);
        setAgents(agentsRes.data || []);
        setAlertsSummary(alertsSummaryRes.data || null);
      } catch (err) {
        console.error('Failed to fetch user data:', err);
      } finally {
        setCommandCenterLoading(false);
      }
    };
    fetchUserData();
  }, []);

  // Fetch market indicators (use macroAPI for credentials + X-Admin-Bypass)
  useEffect(() => {
    const fetchIndicators = async () => {
      try {
        const response = await macroAPI.getMarketIndicators();
        setMarketIndicators(response.data);
      } catch (err) {
        console.error('Failed to fetch market indicators:', err);
      } finally {
        setIndicatorsLoading(false);
      }
    };
    fetchIndicators();
  }, []);

  // Fetch historical valuation data (use macroAPI for credentials + X-Admin-Bypass)
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        const result = await macroAPI.getMarketIndicatorsHistory('2015-Q1');
        if (result.data?.success && result.data?.data) {
          const d = result.data.data;
          setValuationHistory({
            buffett: d.buffett || [],
            tobinQ: d.tobinQ || [],
            medianPE: d.medianPE || [],
            sp500PE: d.sp500PE || [],
            medianMSI: d.medianMSI || [],
            fredMSI: d.fredMSI || [],
            stockMSI: d.stockMSI || [],
            pctUndervalued: d.pctUndervalued || [],
            currentMSISmoothed: result.data.current?.medianMSISmoothed || null
          });
        }
      } catch (err) {
        console.error('Failed to fetch historical valuation data:', err);
      }
    };
    fetchHistoricalData();
  }, []);

  // Fetch Buffett Indicator comparison (total market vs S&P 500 / GDP)
  useEffect(() => {
    const fetchBuffettComparison = async () => {
      try {
        const response = await macroAPI.getBuffettComparison('2015-Q1');
        // Accept data if it has the required arrays
        if (response.data?.totalMarketGDP && response.data?.sp500GDP) {
          setBuffettComparison(response.data);
        } else {
          console.warn('Buffett comparison: missing data arrays', response.data);
        }
      } catch (err) {
        console.error('Failed to fetch Buffett comparison:', err);
      }
    };
    fetchBuffettComparison();
  }, []);

  // Fetch screen results (use screeningAPI for credentials + X-Admin-Bypass)
  const fetchScreen = useCallback(async (screenId) => {
    setScreenLoading(true);
    try {
      const screen = MACRO_SCREENS.find(s => s.id === screenId);
      if (!screen) return;

      const response = await screeningAPI.getMacroScreen(screen.endpoint, 50);
      const data = response.data;
      setScreenResults(data.results || []);
      setScreenMeta({
        name: data.screen,
        description: data.description,
        regime: data.regime,
        strategy: data.strategy,
        recommendation: data.recommendation,
        warning: data.warning,
        count: data.count,
        macroContext: data.macroContext
      });
    } catch (err) {
      console.error('Failed to fetch screen:', err);
      setScreenResults([]);
    } finally {
      setScreenLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScreen(activeScreen);
  }, [activeScreen, fetchScreen]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [, indicesRes] = await Promise.all([
        statsAPI.getDashboard(),
        indicesAPI.getAll().catch(() => ({ data: { data: [] } }))
      ]);
      const indices = (indicesRes.data?.data || indicesRes.data || []).slice(0, 4);
      setMarketIndices(indices);

      // Load price history for index charts
      if (indices.length > 0) {
        const priceHistoryPromises = indices.map(async (idx) => {
          try {
            const res = await indicesAPI.getPrices(idx.symbol, '3m');
            const rawPrices = res.data?.data || [];
            const prices = rawPrices.map(p => ({ date: p.date, value: p.close }));
            return { symbol: idx.symbol, data: prices };
          } catch (e) {
            console.log(`Failed to fetch prices for ${idx.symbol}:`, e.message);
            return { symbol: idx.symbol, data: [] };
          }
        });

        const priceHistories = await Promise.all(priceHistoryPromises);
        const historyMap = {};
        priceHistories.forEach(ph => {
          if (ph.data.length > 0) {
            historyMap[ph.symbol] = ph.data;
          }
        });
        setIndexPriceHistory(historyMap);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="home-page">
        <SkeletonDashboard />
      </div>
    );
  }

  return (
    <div className="home-page home-page-redesign">
      {/* 1. Hero Zone - Search at top */}
      <HeroZone navigate={navigate} regime={screenMeta?.regime} />

      {/* 2. Regime Banner - Only shows if NOT neutral */}
      <RegimeBanner
        regime={screenMeta?.regime}
        loading={indicatorsLoading && !screenMeta}
      />

      {/* 3. Market Pulse Panel - Unified indices + risk + yields */}
      <MarketPulsePanel
        indices={marketIndices}
        priceHistory={indexPriceHistory}
        macroIndicators={marketIndicators}
        loading={loading || indicatorsLoading}
      />

      {/* 4. Two-Column Grid: Your PRISM + Valuation */}
      <div className="home-two-column-grid">
        <FeatureGate
          feature="prism_reports"
          showPreview={true}
          previewHeight="200px"
          title="Your PRISM Dashboard"
          description="Access your portfolios, AI agents, and alerts"
        >
          <YourPrismPanel
            portfolios={portfolios}
            agents={agents}
            alertsSummary={alertsSummary}
            loading={commandCenterLoading}
          />
        </FeatureGate>
        <ValuationDashboard
          indicators={marketIndicators}
          valuationHistory={valuationHistory}
          buffettComparison={buffettComparison}
          loading={indicatorsLoading}
        />
      </div>

      {/* 5. Value Screens */}
      <ValueScreensSection
        screens={MACRO_SCREENS}
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        screenResults={screenResults}
        screenLoading={screenLoading}
        screenMeta={screenMeta}
      />
    </div>
  );
}

export default HomePage;
