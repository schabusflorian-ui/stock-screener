// frontend/src/components/layout/Layout.js
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import CommandPalette from './CommandPalette';
import './Layout.css';

function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    let gPressed = false;
    let gTimeout = null;

    const handleKeyDown = (e) => {
      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // / to focus search
      if (e.key === '/' && !commandPaletteOpen) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      // G-based navigation shortcuts
      if (e.key === 'g' && !gPressed) {
        gPressed = true;
        gTimeout = setTimeout(() => {
          gPressed = false;
        }, 500);
        return;
      }

      if (gPressed) {
        gPressed = false;
        clearTimeout(gTimeout);

        switch (e.key) {
          case 'h':
            navigate('/');
            break;
          case 's':
            navigate('/screening');
            break;
          case 'c':
            navigate('/compare');
            break;
          case 'i':
            navigate('/ipo');
            break;
          case 'e':
            navigate('/sectors');
            break;
          case 'w':
            navigate('/watchlist');
            break;
          case 'u':
            navigate('/updates');
            break;
          case ',':
            navigate('/settings');
            break;
          default:
            break;
        }
      }

      // Escape to close mobile sidebar
      if (e.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, [navigate, commandPaletteOpen]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const newValue = !prev;
      localStorage.setItem('sidebarCollapsed', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  const handleToggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(prev => !prev);
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, []);

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={handleToggleSidebar}
        onOpenSearch={handleOpenCommandPalette}
      />

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="mobile-sidebar-overlay" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <div className="main-wrapper">
        <Header
          onOpenCommandPalette={handleOpenCommandPalette}
          onToggleMobileSidebar={handleToggleMobileSidebar}
        />
        <main className="main-content">
          {children}
        </main>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </div>
  );
}

export default Layout;
