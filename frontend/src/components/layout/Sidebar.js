// frontend/src/components/layout/Sidebar.js
import { PreloadNavLink } from '../../utils/routePreloader';
import {
  Home,
  Search,
  TrendingUp,
  Briefcase,
  Star,
  Settings,
  PieChart,
  ChevronLeft,
  ChevronRight,
  LineChart,
  DollarSign,
  MessageCircle,
  Bell,
  Wallet,
  Crown,
  Bot,
  Command,
  BookOpen,
  Brain,
  BarChart3
} from 'lucide-react';
import './Sidebar.css';

// DISCOVERY - Core navigation items
const navItems = [
  { path: '/', icon: Home, label: 'Home', shortcut: 'G H' },
  { path: '/screening', icon: Search, label: 'Screen', shortcut: 'G S' },
  { path: '/compare', icon: LineChart, label: 'Compare', shortcut: 'G C' },
  { path: '/capital', icon: DollarSign, label: 'Capital', shortcut: 'G D' },
  { path: '/ipo', icon: TrendingUp, label: 'IPOs', shortcut: 'G I' },
  { path: '/sectors', icon: PieChart, label: 'Sectors', shortcut: 'G E' },
];

// PORTFOLIO - User portfolio management
const portfolioItems = [
  { path: '/portfolios', icon: Wallet, label: 'Portfolios', shortcut: 'G P' },
  { path: '/investors', icon: Crown, label: 'Investors', shortcut: 'G R' },
  { path: '/agents', icon: Brain, label: 'Trading Bots', shortcut: 'G X' },
];

// RESEARCH - Market intelligence and analytics
const researchItems = [
  // Market Intelligence: combines Sentiment + Insiders + Validation (unified page)
  { path: '/signals', icon: MessageCircle, label: 'Market Intelligence', shortcut: 'G T' },
  // Factor Analysis: historical factor performance
  { path: '/research', icon: BarChart3, label: 'Factors', shortcut: 'G F' },
  { path: '/notes', icon: BookOpen, label: 'Notes', shortcut: 'G O' },
  { path: '/analyst', icon: Bot, label: 'Ask AI', shortcut: 'G A' },
];

// TOOLS - Alerts and monitoring
const secondaryItems = [
  { path: '/alerts', icon: Bell, label: 'Alerts', shortcut: 'G L' },
  { path: '/watchlist', icon: Star, label: 'Watchlist', shortcut: 'G W' },
];

const bottomItems = [
  { path: '/settings', icon: Settings, label: 'Settings', shortcut: 'G ,' },
];

function Sidebar({ collapsed, onToggle, onOpenSearch }) {
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

      {/* Global Search Button */}
      <button
        className="sidebar-search-btn"
        onClick={onOpenSearch}
        title="Search (⌘K)"
      >
        <Search size={16} />
        {!collapsed && (
          <>
            <span>Search...</span>
            <span className="search-shortcut">
              <Command size={10} />K
            </span>
          </>
        )}
      </button>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {navItems.map(item => (
            <PreloadNavLink
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
            </PreloadNavLink>
          ))}
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-section-label">Portfolio</div>
          {portfolioItems.map(item => (
            <PreloadNavLink
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
            </PreloadNavLink>
          ))}
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-section-label">Research</div>
          {researchItems.map(item => (
            <PreloadNavLink
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
            </PreloadNavLink>
          ))}
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-section-label">Tools</div>
          {secondaryItems.map(item => (
            <PreloadNavLink
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
            </PreloadNavLink>
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        {bottomItems.map(item => (
          <PreloadNavLink
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
          </PreloadNavLink>
        ))}
      </div>
    </aside>
  );
}

export default Sidebar;
