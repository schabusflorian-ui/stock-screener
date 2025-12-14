// frontend/src/components/layout/Header.js
import { Search, Command, Bell, Menu } from 'lucide-react';
import './Header.css';

function Header({ onOpenCommandPalette, onToggleMobileSidebar }) {

  return (
    <header className="header">
      <div className="header-left">
        <button className="mobile-menu-btn" onClick={onToggleMobileSidebar}>
          <Menu size={20} />
        </button>
      </div>

      <div className="header-center">
        <button className="search-trigger" onClick={onOpenCommandPalette}>
          <Search size={16} className="search-icon" />
          <span className="search-placeholder">Search stocks, metrics, or commands...</span>
          <div className="search-shortcut">
            <kbd>
              <Command size={12} />
            </kbd>
            <kbd>K</kbd>
          </div>
        </button>
      </div>

      <div className="header-right">
        <button className="header-btn" title="Notifications">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}

export default Header;
