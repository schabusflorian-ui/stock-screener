// frontend/src/pages/settings/SettingsPage.js
import { useState } from 'react';
import {
  RefreshCw,
  Activity,
  Key,
  Database,
  Settings,
  LifeBuoy,
  Users
} from 'lucide-react';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import UpdateDashboard from '../../components/settings/UpdateDashboard';
import DataHealthReport from '../../components/settings/DataHealthReport';
import IntegrationsPanel from '../../components/settings/IntegrationsPanel';
import DatabaseStats from '../../components/settings/DatabaseStats';
import PreferencesForm from '../../components/settings/PreferencesForm';
import SupportPanel from '../../components/settings/SupportPanel';
import UserManagementPanel from '../../components/settings/UserManagementPanel';
import './SettingsPage.css';

const BASE_TABS = [
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'health', label: 'Data Health', icon: Activity },
  { id: 'integrations', label: 'Integrations', icon: Key },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'preferences', label: 'Preferences', icon: Settings },
  { id: 'support', label: 'Support', icon: LifeBuoy },
];

const ADMIN_TABS = [
  { id: 'users', label: 'Users', icon: Users, adminOnly: true },
];

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('updates');
  const { isAdmin } = useAuth();

  // Combine tabs, adding admin tabs if user is admin
  const TABS = isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'updates':
        return <UpdateDashboard />;
      case 'health':
        return <DataHealthReport />;
      case 'integrations':
        return <IntegrationsPanel />;
      case 'database':
        return <DatabaseStats />;
      case 'preferences':
        return <PreferencesForm />;
      case 'support':
        return <SupportPanel />;
      case 'users':
        return <UserManagementPanel />;
      default:
        return <UpdateDashboard />;
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
