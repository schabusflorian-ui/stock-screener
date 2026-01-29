// frontend/src/pages/quant/QuantWorkbenchPage.js
// Standalone page for Quant Workbench - factor research environment

import { Suspense, lazy } from 'react';
import { PageHeader } from '../../components/ui';
import { PrismSparkle } from '../../components/icons';
import { SkeletonTable } from '../../components/Skeleton';
import FeatureGate from '../../components/subscription/FeatureGate';
import './QuantWorkbenchPage.css';

const QuantWorkbench = lazy(() => import('../../components/research/QuantWorkbench'));

export default function QuantWorkbenchPage() {
  return (
    <FeatureGate
      feature="quant_workbench"
      showPreview={true}
      previewHeight="400px"
      title="Quant Lab"
      description="Define custom factors, test predictive power, and build trading signals with institutional-grade analysis tools."
    >
      <div className="quant-workbench-page">
        <PageHeader
          title="Quant Lab"
          subtitle="Define custom factors, test predictive power, and build trading signals"
          icon={PrismSparkle}
        />
        <main className="quant-workbench-content">
          <Suspense fallback={<SkeletonTable rows={8} />}>
            <QuantWorkbench standalone />
          </Suspense>
        </main>
      </div>
    </FeatureGate>
  );
}
