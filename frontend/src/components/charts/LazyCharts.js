// frontend/src/components/charts/LazyCharts.js
// Utility for lazy-loading chart-heavy components to reduce initial bundle size
import React, { lazy, Suspense, memo } from 'react';

// Loading placeholder for charts
export const ChartLoading = memo(function ChartLoading({ height = 250, message = 'Loading chart...' }) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-secondary, #f8fafc)',
        borderRadius: '8px',
        color: 'var(--text-muted, #94a3b8)',
        fontSize: '14px'
      }}
    >
      {message}
    </div>
  );
});

// Generic wrapper for lazy-loaded chart components
export const LazyChartWrapper = ({ children, height = 250, fallback }) => (
  <Suspense fallback={fallback || <ChartLoading height={height} />}>
    {children}
  </Suspense>
);

// Pre-configured lazy components for heavy chart containers
// These split Recharts into a separate chunk that loads on demand

// Lazy AnalysisDashboard - heavy component with multiple charts
export const LazyAnalysisDashboard = lazy(() =>
  import(/* webpackChunkName: "analysis-charts" */ '../AnalysisDashboard')
);

// Lazy FinancialBreakdown - contains multiple Recharts visualizations
export const LazyFinancialBreakdown = lazy(() =>
  import(/* webpackChunkName: "financial-charts" */ '../FinancialBreakdown')
);

// Lazy FinancialChart - individual chart component
export const LazyFinancialChart = lazy(() =>
  import(/* webpackChunkName: "financial-charts" */ '../FinancialChart')
);

// Lazy MultiMetricChart - complex multi-line chart
export const LazyMultiMetricChart = lazy(() =>
  import(/* webpackChunkName: "analysis-charts" */ '../MultiMetricChart')
);

// Helper HOC to wrap any component with Suspense and loading state
export function withLazyChart(LazyComponent, options = {}) {
  const { height = 300, loadingMessage = 'Loading chart...' } = options;

  return memo(function LazyChartContainer(props) {
    return (
      <Suspense fallback={<ChartLoading height={height} message={loadingMessage} />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  });
}

// Pre-wrapped lazy components ready for use
export const AnalysisDashboardLazy = withLazyChart(LazyAnalysisDashboard, {
  height: 400,
  loadingMessage: 'Loading analysis...'
});

export const FinancialBreakdownLazy = withLazyChart(LazyFinancialBreakdown, {
  height: 300,
  loadingMessage: 'Loading financials...'
});

export default {
  ChartLoading,
  LazyChartWrapper,
  LazyAnalysisDashboard,
  LazyFinancialBreakdown,
  LazyFinancialChart,
  LazyMultiMetricChart,
  withLazyChart,
  AnalysisDashboardLazy,
  FinancialBreakdownLazy
};
