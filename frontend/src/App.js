// frontend/src/App.tsx
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { preloadCommonRoutes } from './utils/routePreloader';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { NLQueryProvider } from './context/NLQueryContext';
import { ContextMenuProvider } from './context/ContextMenuContext';
import { OnboardingProvider } from './context/OnboardingContext';
import { AnalyticsProvider } from './context/AnalyticsContext';
import { FeedbackProvider } from './context/FeedbackContext';
import { Layout } from './components/layout';
import { ProtectedRoute, AdminRoute } from './components/auth';
import ErrorBoundary from './components/ErrorBoundary';
import CookieConsent from './components/legal/CookieConsent';
import { OnboardingManager } from './components/onboarding';
import { FeedbackManager } from './components/feedback';
import ContextMenu from './components/ui/ContextMenu'; // Import directly for immediate availability on right-click
import AskAIHoverIndicator from './components/ui/AskAIHoverIndicator'; // Tooltip on hover
import { UpgradeModal } from './components/subscription'; // Global upgrade modal
import './styles/design-system.css';
import './App.css';

// Lazy load NLChatModal - only needed when user opens chat
const NLChatModal = lazy(() => import('./components/nl/NLChatModal'));

// Lazy load all pages for better initial bundle
const HomePage = lazy(() => import('./pages/HomePage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));
const CompaniesPage = lazy(() => import('./pages/CompaniesPage'));
const ScreeningPage = lazy(() => import('./pages/ScreeningPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const SectorAnalysisPage = lazy(() => import('./pages/SectorAnalysisPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));
const IPOPipelinePage = lazy(() => import('./pages/IPOPipelinePage'));
const IPODetailPage = lazy(() => import('./pages/IPODetailPage'));
const CapitalAllocationPage = lazy(() => import('./pages/CapitalAllocationPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));

// Lazy load investor and portfolio pages
const InvestorListPage = lazy(() => import('./pages/investors/InvestorListPage'));
const InvestorDetailPage = lazy(() => import('./pages/investors/InvestorDetailPage'));
const PortfolioListPage = lazy(() => import('./pages/portfolios/PortfolioListPage'));
const PortfolioDetailPage = lazy(() => import('./pages/portfolios/PortfolioDetailPage'));

// Lazy load AI analyst page
const AnalystPage = lazy(() => import('./pages/analyst/AnalystPage'));

// Lazy load AI Trading page (legacy)
const AITradingPage = lazy(() => import('./pages/agent/AITradingPage'));

// Lazy load new Agent Dashboard (legacy, portfolio-centric)
const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard'));

// Lazy load new first-class Trading Agents pages
const AgentListPage = lazy(() => import('./pages/agents/AgentListPage'));
const CreateAgentPage = lazy(() => import('./pages/agents/CreateAgentPage'));
const CreateBeginnerAgentPage = lazy(() => import('./pages/agents/CreateBeginnerAgentPage'));
const AgentDetailPageNew = lazy(() => import('./pages/agents/AgentDetailPage'));
const AgentSettingsPage = lazy(() => import('./pages/agents/AgentSettingsPage'));

// Lazy load unified strategy backtest page
const BacktestPage = lazy(() => import('./pages/backtest/BacktestPage'));

// MLOpsDashboard - Merged into Quant Lab (redirect to /quant?workspace=mlops)

// HistoricalAnalyticsPage - MERGED into Research Lab (redirect below)

// ValueInvestingPage - MERGED into HomePage (redirect below)

// Lazy load notes and theses pages
const NotesPage = lazy(() => import('./pages/notes/NotesPage'));
const NoteEditorPage = lazy(() => import('./pages/notes/NoteEditor'));
const ThesisEditorPage = lazy(() => import('./pages/notes/ThesisEditor'));
const NoteVersionHistoryPage = lazy(() => import('./components/notes/NoteVersionHistory'));

// Lazy load settings page
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

// Lazy load backtesting dashboard
const BacktestDashboard = lazy(() => import('./pages/backtesting/BacktestDashboard'));

// Lazy load unified Market Signals page
const MarketSignalsPage = lazy(() => import('./pages/MarketSignalsPage'));

// Lazy load Research Lab page
const ResearchLabPage = lazy(() => import('./pages/ResearchLabPage'));

// Lazy load Quant Workbench page
const QuantWorkbenchPage = lazy(() => import('./pages/quant/QuantWorkbenchPage'));

// Lazy load login page
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Lazy load legal pages
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const DisclaimerPage = lazy(() => import('./pages/legal/DisclaimerPage'));
const CookiesPage = lazy(() => import('./pages/legal/CookiesPage'));

// Lazy load help center
const HelpCenter = lazy(() => import('./pages/help/HelpCenter'));

// Lazy load pricing pages
const PricingPage = lazy(() => import('./pages/PricingPage'));
const PricingSuccess = lazy(() => import('./pages/PricingSuccess'));

// Lazy load test/demo pages
const DistributionVisualizationDemo = lazy(() => import('./pages/test/DistributionVisualizationDemo'));
const IconGallery = lazy(() => import('./pages/dev/IconGallery'));

// Lazy load admin pages
const AnalyticsDashboard = lazy(() => import('./pages/admin/AnalyticsDashboard'));

// Page loading fallback
function PageLoading() {
  return (
    <div className="page-loading">
      <div className="page-loading-spinner" />
      <span>Loading...</span>
    </div>
  );
}


function App() {
  // Preload common routes during idle time after initial render
  useEffect(() => {
    preloadCommonRoutes();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SubscriptionProvider>
          <OnboardingProvider>
            <PreferencesProvider>
              <WatchlistProvider>
              <NLQueryProvider>
              <ContextMenuProvider>
                <Router>
                  <AnalyticsProvider>
                    <FeedbackProvider>
                      {/* Onboarding Manager - Shows welcome flow and manages tours */}
                      <OnboardingManager />
                      {/* Feedback Manager - Handles prompts, help, and support */}
                      <FeedbackManager />
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    {/* Public route - Login */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* Public legal pages */}
                    <Route path="/legal/terms" element={<TermsPage />} />
                    <Route path="/legal/privacy" element={<PrivacyPage />} />
                    <Route path="/legal/disclaimer" element={<DisclaimerPage />} />
                    <Route path="/legal/cookies" element={<CookiesPage />} />

                    {/* Help Center - accessible to all users */}
                    <Route path="/help" element={<HelpCenter />} />

                    {/* Pricing pages - public but with auth context */}
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/pricing/success" element={<PricingSuccess />} />

                    {/* Dev tools - public for convenience */}
                    <Route path="/dev/icons" element={<IconGallery />} />

                    {/* Protected routes */}
                    <Route path="/*" element={
                      <ProtectedRoute>
                        <Layout>
                          <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/company/:symbol" element={<CompanyPage />} />
                            <Route path="/companies" element={<CompaniesPage />} />
                            <Route path="/screening" element={<ScreeningPage />} />
                            <Route path="/sectors" element={<SectorAnalysisPage />} />
                            <Route path="/ipo" element={<IPOPipelinePage />} />
                            <Route path="/ipo/:id" element={<IPODetailPage />} />
                            <Route path="/compare" element={<ComparePage />} />
                            <Route path="/charts" element={<ComparePage />} />
                            <Route path="/watchlist" element={<WatchlistPage />} />
                            <Route path="/updates" element={<Navigate to="/settings" replace />} />
                            <Route path="/signals" element={<MarketSignalsPage />} />
                            <Route path="/insiders" element={<Navigate to="/signals#insiders" replace />} />
                            <Route path="/capital" element={<CapitalAllocationPage />} />
                            <Route path="/trending" element={<Navigate to="/signals#sentiment" replace />} />
                            <Route path="/alerts" element={<AlertsPage />} />
                            <Route path="/investors" element={<InvestorListPage />} />
                            <Route path="/investors/:id" element={<InvestorDetailPage />} />
                            <Route path="/portfolios" element={<PortfolioListPage />} />
                            <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
                            <Route path="/analyst" element={<AnalystPage />} />
                            <Route path="/agents" element={<AgentListPage />} />
                            <Route path="/agents/new" element={<CreateAgentPage />} />
                            <Route path="/agents/new/simple" element={<CreateBeginnerAgentPage />} />
                            <Route path="/agents/:id" element={<AgentDetailPageNew />} />
                            <Route path="/agents/:id/settings" element={<AgentSettingsPage />} />
                            <Route path="/backtest" element={<BacktestPage />} />
                            <Route path="/ai-trading" element={<AITradingPage />} />
                            <Route path="/ai-trading/:portfolioId" element={<AITradingPage />} />
                            <Route path="/agent/:portfolioId" element={<AgentDashboard />} />
                            <Route path="/analytics" element={<Navigate to="/research" replace />} />
                            <Route path="/historical" element={<Navigate to="/research" replace />} />
                            <Route path="/factors" element={<Navigate to="/research" replace />} />
                            <Route path="/montecarlo" element={<Navigate to="/research" replace />} />
                            <Route path="/value-investing" element={<Navigate to="/" replace />} />
                            <Route path="/notes" element={<NotesPage />} />
                            <Route path="/notes/new" element={<NoteEditorPage />} />
                            <Route path="/notes/:noteId" element={<NoteEditorPage />} />
                            <Route path="/notes/:noteId/history" element={<NoteVersionHistoryPage />} />
                            <Route path="/theses" element={<NotesPage />} />
                            <Route path="/theses/new" element={<ThesisEditorPage />} />
                            <Route path="/theses/:thesisId" element={<ThesisEditorPage />} />
                            <Route path="/theses/:thesisId/edit" element={<ThesisEditorPage />} />
                            <Route path="/lab" element={<ResearchLabPage />} />
                            <Route path="/research" element={<ResearchLabPage />} />
                            <Route path="/quant" element={<QuantWorkbenchPage />} />
                            <Route path="/backtesting" element={<BacktestDashboard />} />
                            <Route path="/backtesting/:portfolioId" element={<BacktestDashboard />} />
                            <Route path="/validation" element={<Navigate to="/quant?workspace=factors&tab=test" replace />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="/mlops" element={<Navigate to="/quant?workspace=mlops" replace />} />
                            <Route path="/admin/analytics" element={<AdminRoute><AnalyticsDashboard /></AdminRoute>} />
                            <Route path="/test/distribution-visualization-demo" element={<DistributionVisualizationDemo />} />
                          </Routes>
                        </Layout>
                      </ProtectedRoute>
                    } />
                  </Routes>
                </Suspense>
                {/* NL Chat Modal - lazy loaded, available globally */}
                <Suspense fallback={null}>
                  <NLChatModal />
                </Suspense>
                {/* Context Menu - directly imported for immediate availability on right-click */}
                <ContextMenu />
                {/* Hover tooltip for Ask AI elements */}
                <AskAIHoverIndicator />
                {/* Upgrade Modal - triggered by subscription events */}
                <UpgradeModal />
                    </FeedbackProvider>
                  </AnalyticsProvider>
                </Router>
              </ContextMenuProvider>
            </NLQueryProvider>
          </WatchlistProvider>
        </PreferencesProvider>
          </OnboardingProvider>
        </SubscriptionProvider>
      </AuthProvider>
      {/* Cookie Consent Banner */}
      <CookieConsent />
    </ErrorBoundary>
  );
}

export default App;
