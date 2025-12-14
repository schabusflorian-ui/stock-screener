// frontend/src/components/layout/Sidebar.js
import { NavLink } from 'react-router-dom';
import {
  Home,
  Search,
  BarChart3,
  TrendingUp,
  Briefcase,
  Star,
  Settings,
  PieChart,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  LineChart,
  Users,
  DollarSign
} from 'lucide-react';
import './Sidebar.css';

const navItems = [
  { path: '/', icon: Home, label: 'Home', shortcut: 'G H' },
  { path: '/screening', icon: Search, label: 'Screen', shortcut: 'G S' },
  { path: '/compare', icon: BarChart3, label: 'Compare', shortcut: 'G C' },
  { path: '/charts', icon: LineChart, label: 'Charts', shortcut: 'G A' },
  { path: '/insiders', icon: Users, label: 'Insiders', shortcut: 'G N' },
  { path: '/capital', icon: DollarSign, label: 'Capital', shortcut: 'G D' },
  { path: '/ipo', icon: TrendingUp, label: 'IPOs', shortcut: 'G I' },
  { path: '/sectors', icon: PieChart, label: 'Sectors', shortcut: 'G E' },
];

const secondaryItems = [
  { path: '/watchlist', icon: Star, label: 'Watchlist', shortcut: 'G W' },
  { path: '/updates', icon: RefreshCw, label: 'Updates', shortcut: 'G U' },
];

const bottomItems = [
  { path: '/settings', icon: Settings, label: 'Settings', shortcut: 'G ,' },
];

function Sidebar({ collapsed, onToggle }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <Briefcase size={20} />
          </div>
          {!collapsed && <span className="logo-text">Invest</span>}
        </div>
        <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="nav-icon" />
              {!collapsed && (
                <>
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-shortcut">{item.shortcut}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          {secondaryItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="nav-icon" />
              {!collapsed && (
                <>
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-shortcut">{item.shortcut}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        {bottomItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} className="nav-icon" />
            {!collapsed && (
              <>
                <span className="nav-label">{item.label}</span>
                <span className="nav-shortcut">{item.shortcut}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;
