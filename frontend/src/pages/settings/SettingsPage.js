// frontend/src/pages/settings/SettingsPage.js
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  RefreshCw,
  Activity,
  Key,
  Database,
  Settings,
  LifeBuoy,
  Users,
  Shield,
  Bell,
  BarChart2,
  BarChart3,
  TrendingDown,
  CreditCard
} from '../../components/icons';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import UpdateDashboard from '../../components/settings/UpdateDashboard';
import DataHealthReport from '../../components/settings/DataHealthReport';
import IntegrationsPanel from '../../components/settings/IntegrationsPanel';
import DatabaseStats from '../../components/settings/DatabaseStats';
import PreferencesForm from '../../components/settings/PreferencesForm';
import SupportPanel from '../../components/settings/SupportPanel';
import UserManagementPanel from '../../components/settings/UserManagementPanel';
import LegalPanel from '../../components/settings/LegalPanel';
import NotificationPreferences from '../../components/settings/NotificationPreferences';
import NotificationTriggers from '../../components/settings/NotificationTriggers';
import ActivitySummary from '../../components/settings/ActivitySummary';
import TCABenchmarkPanel from '../../components/settings/TCABenchmarkPanel';
import ModelDriftPanel from '../../components/settings/ModelDriftPanel';
import SubscriptionSettings from '../../components/settings/SubscriptionSettings';
import './SettingsPage.css';

const BASE_TABS = [
  { id: 'subscription', label: 'Subscription', icon: CreditCard },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'health', label: 'Data Health', icon: Activity },
  { id: 'integrations', label: 'Integrations', icon: Key },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'execution', label: 'Execution Benchmarks', icon: BarChart3 },
  { id: 'drift', label: 'Model Drift', icon: TrendingDown },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'activity', label: 'My Activity', icon: BarChart2 },
  { id: 'legal', label: 'Legal & Privacy', icon: Shield },
  { id: 'support', label: 'Support', icon: LifeBuoy },
];

const ADMIN_TABS = [
  { id: 'users', label: 'Users', icon: Users, adminOnly: true },
];

function SettingsPage() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('subscription');
  const { isAdmin } = useAuth();

  // Set initial tab from location state (e.g., when navigating from AlertsPage)
  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state]);

  // Combine tabs, adding admin tabs if user is admin
  const TABS = isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'subscription':
        return <SubscriptionSettings />;
      case 'updates':
        return <UpdateDashboard />;
      case 'health':
        return <DataHealthReport />;
      case 'integrations':
        return <IntegrationsPanel />;
      case 'database':
        return <DatabaseStats />;
      case 'notifications':
        return (
          <>
            <NotificationPreferences />
            <NotificationTriggers />
          </>
        );
      case 'execution':
        return <TCABenchmarkPanel />;
      case 'drift':
        return <ModelDriftPanel />;
      case 'preferences':
        return <PreferencesForm />;
      case 'activity':
        return <ActivitySummary />;
      case 'legal':
        return <LegalPanel />;
      case 'support':
        return <SupportPanel />;
      case 'users':
        return <UserManagementPanel />;
      default:
        return <SubscriptionSettings />;
    }
  };

  return (
    <div className="settings-page">
      <PageHeader
        title="Settings"
        subtitle="System configuration and monitoring"
      />

      <div className="settings-layout">
        <nav className="settings-tabs">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''} ${tab.adminOnly ? 'admin-tab' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="settings-content">
          {renderTabContent()}
        </main>
      </div>
    </div>
  );
}

export default SettingsPage;
