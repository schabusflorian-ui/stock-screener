// frontend/src/App.tsx
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { preloadCommonRoutes } from './utils/routePreloader';
import { AuthProvider } from './context/AuthContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { NLQueryProvider } from './context/NLQueryContext';
import { Layout } from './components/layout';
import { ProtectedRoute } from './components/auth';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/design-system.css';
import './App.css';

// Lazy load NLChatModal - only needed when user opens chat
const NLChatModal = lazy(() => import('./components/nl/NLChatModal'));

// Lazy load all pages for better initial bundle
const HomePage = lazy(() => import('./pages/HomePage'));
const CompanyPage = lazy(() => import('./pages/CompanyPage'));
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
const AgentDetailPageNew = lazy(() => import('./pages/agents/AgentDetailPage'));
const AgentSettingsPage = lazy(() => import('./pages/agents/AgentSettingsPage'));

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

// Lazy load login page
const LoginPage = lazy(() => import('./pages/LoginPage'));

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
        <PreferencesProvider>
          <WatchlistProvider>
            <NLQueryProvider>
              <Router>
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    {/* Public route - Login */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* Protected routes */}
                    <Route path="/*" element={
                      <ProtectedRoute>
                        <Layout>
                          <Routes>
                            <Route path="/" element={<HomePage />} />
                            <Route path="/company/:symbol" element={<CompanyPage />} />
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
                            <Route path="/agents/:id" element={<AgentDetailPageNew />} />
                            <Route path="/agents/:id/settings" element={<AgentSettingsPage />} />
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
                            <Route path="/backtesting" element={<BacktestDashboard />} />
                            <Route path="/backtesting/:portfolioId" element={<BacktestDashboard />} />
                            <Route path="/validation" element={<Navigate to="/signals#validation" replace />} />
                            <Route path="/settings" element={<SettingsPage />} />
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
              </Router>
            </NLQueryProvider>
          </WatchlistProvider>
        </PreferencesProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
