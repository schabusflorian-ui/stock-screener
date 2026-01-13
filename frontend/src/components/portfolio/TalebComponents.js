// frontend/src/components/portfolio/TalebComponents.js
// Export all Taleb-informed risk visualization components

export { default as FatTailWarningBanner } from './FatTailWarningBanner';
export { default as TalebRiskDashboard } from './TalebRiskDashboard';
export { default as DistributionComparisonChart } from './DistributionComparisonChart';
export { default as MonteCarloEnhanced } from './MonteCarloPanel.enhanced';

// Usage instructions:
//
// 1. FatTailWarningBanner:
//    <FatTailWarningBanner
//      distributionFit={results.distributionFit}
//      moments={results.distributionFit.moments}
//      varComparison={results.distributionFit.varComparison}
//    />
//
// 2. TalebRiskDashboard:
//    <TalebRiskDashboard
//      distributionFit={results.distributionFit}
//      moments={results.distributionFit.moments}
//      varComparison={results.distributionFit.varComparison}
//      simulationResults={results}
//    />
//
// 3. DistributionComparisonChart:
//    <DistributionComparisonChart
//      moments={results.distributionFit.moments}
//      distributionFit={results.distributionFit}
//      historicalReturns={results.historicalReturns}
//    />
//
// 4. Enhanced Monte Carlo (drop-in replacement):
//    import MonteCarloPanel from './components/portfolio/TalebComponents';
//    <MonteCarloPanel portfolioId={123} initialValue={100000} />
