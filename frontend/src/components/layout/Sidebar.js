// frontend/src/components/layout/Sidebar.js
import { PreloadNavLink } from '../../utils/routePreloader';
import {
  Home,
  Search,
  TrendingUp,
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
  BookOpen,
  Brain,
  BarChart3,
  BarChart2,
  PrismSparkle,
  FlaskConical
} from '../icons';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

// DISCOVERY - Core navigation items
const navItems = [
  { path: '/', icon: Home, label: 'Home', shortcut: 'G H', dataTour: 'home' },
  { path: '/screening', icon: Search, label: 'Screen', shortcut: 'G S', dataTour: 'screening' },
  { path: '/compare', icon: LineChart, label: 'Compare', shortcut: 'G C', dataTour: 'compare' },
  { path: '/capital', icon: DollarSign, label: 'Capital', shortcut: 'G D', dataTour: 'capital' },
  { path: '/ipo', icon: TrendingUp, label: 'IPOs', shortcut: 'G I', dataTour: 'ipo' },
  { path: '/sectors', icon: PieChart, label: 'Sectors', shortcut: 'G E', dataTour: 'sectors' },
];

// PORTFOLIO - User portfolio management
const portfolioItems = [
  { path: '/portfolios', icon: Wallet, label: 'Portfolios', shortcut: 'G P', dataTour: 'portfolios' },
  { path: '/investors', icon: Crown, label: 'Investors', shortcut: 'G R', dataTour: 'investors' },
  { path: '/agents', icon: Brain, label: 'AI Agents', shortcut: 'G X', dataTour: 'agents' },
];

// RESEARCH - Market intelligence and analytics
const researchItems = [
  // Market Intelligence: combines Sentiment + Insiders + Validation (unified page)
  { path: '/signals', icon: MessageCircle, label: 'Market Intelligence', shortcut: 'G T' },
  // Factor Analysis: historical factor performance
  { path: '/research', icon: BarChart3, label: 'Factors', shortcut: 'G F' },
  // Quant Lab: custom factor research workbench (includes ML/MLOps)
  { path: '/quant', icon: FlaskConical, label: 'Quant Lab', shortcut: 'G Q' },
  { path: '/notes', icon: BookOpen, label: 'Notes', shortcut: 'G O' },
  { path: '/analyst', icon: Bot, label: 'Ask AI', shortcut: 'G A' },
];

// TOOLS - Alerts and monitoring
const secondaryItems = [
  { path: '/alerts', icon: Bell, label: 'Alerts', shortcut: 'G L', dataTour: 'alerts' },
  { path: '/watchlist', icon: Star, label: 'Watchlist', shortcut: 'G W', dataTour: 'watchlist' },
];

const bottomItems = [
  { path: '/settings', icon: Settings, label: 'Settings', shortcut: 'G ,' },
];

// Admin-only items
const adminItems = [
  { path: '/admin/analytics', icon: BarChart2, label: 'Analytics', shortcut: 'G Y', adminOnly: true },
];

function Sidebar({ collapsed, onToggle }) {
  const { isAdmin } = useAuth();

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">
            <PrismSparkle size={18} />
          </div>
          {!collapsed && <span className="logo-text">PRISM</span>}
        </div>
        <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>


      <nav className="sidebar-nav">
        <div className="nav-section">
          {navItems.map(item => (
            <PreloadNavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
              data-tour={item.dataTour}
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
              data-tour={item.dataTour}
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
              data-tour={item.dataTour}
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

        {/* Admin Analytics - only visible to admins */}
        {isAdmin && adminItems.map(item => (
          <PreloadNavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item admin-nav-item ${isActive ? 'active' : ''}`}
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
