// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { WatchlistProvider } from './context/WatchlistContext';
import { Layout } from './components/layout';
import './styles/design-system.css';
import './App.css';

import HomePage from './pages/HomePage';
import CompanyPage from './pages/CompanyPage';
import ScreeningPage from './pages/ScreeningPage';
import WatchlistPage from './pages/WatchlistPage';
import SectorAnalysisPage from './pages/SectorAnalysisPage';
import AdvancedChartsPage from './pages/AdvancedChartsPage';
import IPOPipelinePage from './pages/IPOPipelinePage';
import IPODetailPage from './pages/IPODetailPage';
import UpdatesPage from './pages/UpdatesPage';
import InsiderTradingPage from './pages/InsiderTradingPage';
import CapitalAllocationPage from './pages/CapitalAllocationPage';
import TrendingTickersPage from './pages/TrendingTickersPage';
import AlertsPage from './pages/AlertsPage';

function App() {
  return (
    <WatchlistProvider>
      <Router>
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
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </Router>
    </WatchlistProvider>
  );
}

// Placeholder Settings Page
function SettingsPage() {
  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <p className="text-secondary">Application settings coming soon.</p>
    </div>
  );
}

export default App;
