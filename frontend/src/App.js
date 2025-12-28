// frontend/src/App.js
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { Layout } from './components/layout';
import { ProtectedRoute } from './components/auth';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/design-system.css';
import './App.css';

// Eager load - frequently accessed pages
import HomePage from './pages/HomePage';
import CompanyPage from './pages/CompanyPage';

// Lazy load - less frequently accessed pages
const ScreeningPage = lazy(() => import('./pages/ScreeningPage'));
const WatchlistPage = lazy(() => import('./pages/WatchlistPage'));
const SectorAnalysisPage = lazy(() => import('./pages/SectorAnalysisPage'));
const AdvancedChartsPage = lazy(() => import('./pages/AdvancedChartsPage'));
const IPOPipelinePage = lazy(() => import('./pages/IPOPipelinePage'));
const IPODetailPage = lazy(() => import('./pages/IPODetailPage'));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const InsiderTradingPage = lazy(() => import('./pages/InsiderTradingPage'));
const CapitalAllocationPage = lazy(() => import('./pages/CapitalAllocationPage'));
const TrendingTickersPage = lazy(() => import('./pages/TrendingTickersPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));

// Lazy load investor and portfolio pages
const InvestorListPage = lazy(() => import('./pages/investors/InvestorListPage'));
const InvestorDetailPage = lazy(() => import('./pages/investors/InvestorDetailPage'));
const PortfolioListPage = lazy(() => import('./pages/portfolios/PortfolioListPage'));
const PortfolioDetailPage = lazy(() => import('./pages/portfolios/PortfolioDetailPage'));

// Lazy load AI analyst page
const AnalystPage = lazy(() => import('./pages/analyst/AnalystPage'));

// Lazy load notes and theses pages
const NotesPage = lazy(() => import('./pages/notes/NotesPage'));
const ThesesPage = lazy(() => import('./pages/notes/ThesesPage'));
const NoteEditorPage = lazy(() => import('./pages/notes/NoteEditor'));
const ThesisEditorPage = lazy(() => import('./pages/notes/ThesisEditor'));
const NoteVersionHistoryPage = lazy(() => import('./components/notes/NoteVersionHistory'));

// Lazy load settings page
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

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
  return (
    <ErrorBoundary>
      <AuthProvider>
        <PreferencesProvider>
          <WatchlistProvider>
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
                          <Route path="/compare" element={<Navigate to="/charts" replace />} />
                          <Route path="/charts" element={<AdvancedChartsPage />} />
                          <Route path="/watchlist" element={<WatchlistPage />} />
                          <Route path="/updates" element={<UpdatesPage />} />
                          <Route path="/insiders" element={<InsiderTradingPage />} />
                          <Route path="/capital" element={<CapitalAllocationPage />} />
                          <Route path="/trending" element={<TrendingTickersPage />} />
                          <Route path="/alerts" element={<AlertsPage />} />
                          <Route path="/investors" element={<InvestorListPage />} />
                          <Route path="/investors/:id" element={<InvestorDetailPage />} />
                          <Route path="/portfolios" element={<PortfolioListPage />} />
                          <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
                          <Route path="/analyst" element={<AnalystPage />} />
                          <Route path="/notes" element={<NotesPage />} />
                          <Route path="/notes/new" element={<NoteEditorPage />} />
                          <Route path="/notes/:noteId" element={<NoteEditorPage />} />
                          <Route path="/notes/:noteId/history" element={<NoteVersionHistoryPage />} />
                          <Route path="/theses" element={<ThesesPage />} />
                          <Route path="/theses/new" element={<ThesisEditorPage />} />
                          <Route path="/theses/:thesisId" element={<ThesisEditorPage />} />
                          <Route path="/theses/:thesisId/edit" element={<ThesisEditorPage />} />
                          <Route path="/settings" element={<SettingsPage />} />
                        </Routes>
                      </Layout>
                    </ProtectedRoute>
                  } />
                </Routes>
              </Suspense>
            </Router>
          </WatchlistProvider>
        </PreferencesProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
