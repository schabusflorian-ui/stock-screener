# Authentication Plan: Express + React + SQLite

## Overview

Implement Google OAuth authentication for your **Express.js backend + React frontend + SQLite database** architecture.

**Tech Stack Alignment:**
- Backend: Express.js 5.x with Passport.js
- Frontend: React 19 (Create React App)
- Database: SQLite (better-sqlite3)
- Session: express-session with SQLite store

---

## PART 1: INSTALL DEPENDENCIES

```bash
# Backend (run in project root)
npm install passport passport-google-oauth20 express-session better-sqlite3-session-store uuid
```

| Package | Purpose |
|---------|---------|
| `passport` | Authentication middleware for Express |
| `passport-google-oauth20` | Google OAuth 2.0 strategy |
| `express-session` | Session management |
| `better-sqlite3-session-store` | SQLite session storage |
| `uuid` | Generate unique user IDs |

---

## PART 2: ENVIRONMENT VARIABLES

Add to your `.env` file:

```env
# Google OAuth (get from console.cloud.google.com)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Session Secret (generate a random 32+ character string)
SESSION_SECRET=your-super-secret-random-string-here

# Your app URL
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001
```

### How to Get Google Credentials (5 minutes)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Name: "Investment Project"
7. Authorized JavaScript origins:
   - `http://localhost:3000` (backend)
   - `http://localhost:3001` (frontend)
8. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/google/callback`
9. Click Create
10. Copy "Client ID" and "Client Secret" to your `.env`

---

## PART 3: DATABASE MIGRATION

Create file: `src/database-migrations/add-auth-tables.js`

```javascript
// src/database-migrations/add-auth-tables.js
// Database migration for authentication system

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('Starting auth tables migration...');

// ============================================
// TABLE 1: Users
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
  )
`);
console.log('Created users table');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

// ============================================
// TABLE 2: Sessions (for express-session)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired DATETIME NOT NULL
  )
`);
console.log('Created sessions table');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);

// ============================================
// ADD user_id TO EXISTING TABLES
// ============================================

// Helper to check if column exists
function columnExists(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some(col => col.name === column);
}

// Helper to check if table exists
function tableExists(tableName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name=?
  `).get(tableName);
  return !!result;
}

// Add user_id to portfolios
if (tableExists('portfolios') && !columnExists('portfolios', 'user_id')) {
  db.exec(`ALTER TABLE portfolios ADD COLUMN user_id TEXT REFERENCES users(id)`);
  console.log('Added user_id to portfolios table');
}

// Add user_id to user_preferences (update existing column type)
if (tableExists('user_preferences')) {
  // Check if we need to migrate
  const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get('default');
  if (prefs) {
    console.log('user_preferences already has default user, will migrate after first login');
  }
}

// Create indexes for user_id lookups
if (tableExists('portfolios') && columnExists('portfolios', 'user_id')) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id)`);
}

db.close();
console.log('Auth tables migration completed successfully!');
```

Run migration:
```bash
node src/database-migrations/add-auth-tables.js
```

---

## PART 4: PASSPORT CONFIGURATION

Create file: `src/auth/passport.js`

```javascript
// src/auth/passport.js
// Passport.js configuration for Google OAuth

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');

function configurePassport(db) {
  // Serialize user ID into session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser((id, done) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      done(null, user || null);
    } catch (error) {
      done(error, null);
    }
  });

  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/google/callback`,
      scope: ['profile', 'email']
    },
    (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
        let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);

        if (user) {
          // Update last login
          db.prepare(`
            UPDATE users
            SET last_login_at = CURRENT_TIMESTAMP,
                name = ?,
                picture = ?
            WHERE id = ?
          `).run(profile.displayName, profile.photos?.[0]?.value, user.id);

          // Refresh user data
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        } else {
          // Create new user
          const userId = uuidv4();
          db.prepare(`
            INSERT INTO users (id, google_id, email, name, picture, last_login_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(
            userId,
            profile.id,
            profile.emails[0].value,
            profile.displayName,
            profile.photos?.[0]?.value
          );

          user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

          console.log(`New user created: ${user.email}`);
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  ));

  return passport;
}

module.exports = { configurePassport };
```

---

## PART 5: AUTH ROUTES

Create file: `src/api/routes/auth.js`

```javascript
// src/api/routes/auth.js
// Authentication routes

const express = require('express');
const passport = require('passport');
const router = express.Router();

// GET /api/auth/google - Initiate Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// GET /api/auth/google/callback - Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=auth_failed`
  }),
  (req, res) => {
    // Successful authentication
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/`);
  }
);

// GET /api/auth/me - Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture
      }
    });
  } else {
    res.json({
      success: false,
      user: null
    });
  }
});

// POST /api/auth/logout - Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Session destruction failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

// GET /api/auth/status - Check auth status (lightweight)
router.get('/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    userId: req.user?.id || null
  });
});

module.exports = router;
```

---

## PART 6: AUTH MIDDLEWARE

Create file: `src/auth/middleware.js`

```javascript
// src/auth/middleware.js
// Authentication middleware functions

/**
 * Require authentication for a route
 * Returns 401 if not authenticated
 */
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    success: false,
    error: 'Authentication required'
  });
}

/**
 * Optional auth - attaches user to req if authenticated
 * Does not block unauthenticated requests
 */
function optionalAuth(req, res, next) {
  // User is already attached by passport if authenticated
  next();
}

/**
 * Get user ID from request (returns null if not authenticated)
 */
function getUserId(req) {
  return req.user?.id || null;
}

/**
 * Require user ID - throws if not authenticated
 */
function requireUserId(req) {
  if (!req.user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  return req.user.id;
}

module.exports = {
  requireAuth,
  optionalAuth,
  getUserId,
  requireUserId
};
```

---

## PART 7: UPDATE SERVER.JS

Update `src/api/server.js`:

```javascript
// src/api/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
const SQLiteStore = require('better-sqlite3-session-store')(session);
const db = require('../database');
const { configurePassport } = require('../auth/passport');

const app = express();
const PORT = process.env.PORT || 3000;

// Make database available to routes via req.app.get('db')
app.set('db', db.getDatabase());

// Configure Passport
const passport = configurePassport(db.getDatabase());

// Middleware
app.use(helmet({
  // Allow cross-origin requests for frontend
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true  // Required for sessions/cookies
}));

app.use(morgan('dev'));
app.use(express.json());

// Session configuration
app.use(session({
  store: new SQLiteStore({
    client: db.getDatabase(),
    expired: {
      clear: true,
      intervalMs: 900000 // Clear expired sessions every 15 min
    }
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Import routes
const authRouter = require('./routes/auth');
const companiesRouter = require('./routes/companies.js');
// ... rest of your existing routes

// Use routes
app.use('/api/auth', authRouter);  // Add auth routes FIRST
app.use('/api/companies', companiesRouter);
// ... rest of your existing routes

// ... rest of server.js unchanged
```

---

## PART 8: UPDATE PORTFOLIO ROUTES (Example)

Update `src/api/routes/portfolios.js` to scope data by user:

```javascript
// src/api/routes/portfolios.js (updated)
const express = require('express');
const router = express.Router();
const { getPortfolioService } = require('../../services/portfolio');
const { requireAuth, getUserId } = require('../../auth/middleware');

// Middleware to get portfolio service
const getService = (req) => {
  const db = req.app.get('db');
  return getPortfolioService(db);
};

// ============================================
// Portfolio CRUD Routes (now user-scoped)
// ============================================

// GET /api/portfolios - List user's portfolios
router.get('/', requireAuth, (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);

    // Filter by user_id
    const portfolios = service.getPortfoliosByUser(userId);

    res.json({
      success: true,
      count: portfolios.length,
      portfolios
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/portfolios - Create a new portfolio
router.post('/', requireAuth, (req, res) => {
  try {
    const service = getService(req);
    const userId = getUserId(req);
    const {
      name,
      description,
      portfolioType,
      type,
      benchmarkIndexId,
      currency,
      initialCash,
      initialDate,
      cloneInvestorId
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = service.createPortfolio({
      userId,  // Pass user ID
      name,
      description,
      portfolioType: portfolioType || type || 'manual',
      benchmarkIndexId,
      currency,
      initialCash: parseFloat(initialCash) || 0,
      initialDate,
      cloneInvestorId
    });

    res.status(201).json({
      ...result,
      portfolio: {
        id: result.portfolioId,
        user_id: userId,
        name: result.name,
        type: portfolioType || type || 'manual',
        // ... rest unchanged
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/portfolios/:id - Get portfolio (verify ownership)
router.get('/:id', requireAuth, (req, res) => {
  try {
    const service = getService(req);
    const portfolioId = parseInt(req.params.id);
    const userId = getUserId(req);

    const summary = service.getPortfolioSummary(portfolioId);

    // Verify ownership
    if (summary.portfolio.user_id && summary.portfolio.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(summary);
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message
    });
  }
});

// ... update other routes similarly
```

---

## PART 9: UPDATE PORTFOLIO SERVICE

Update `src/services/portfolio/index.js` to support user scoping:

```javascript
// Add these methods to PortfolioService class

getPortfoliosByUser(userId) {
  if (!userId) {
    // For backwards compatibility, return all if no user specified
    return this.getAllPortfolios();
  }

  return this.db.prepare(`
    SELECT
      p.*,
      COUNT(DISTINCT pp.id) as positions_count,
      COALESCE(SUM(pp.current_value), 0) as positions_value
    FROM portfolios p
    LEFT JOIN portfolio_positions pp ON p.id = pp.portfolio_id AND pp.shares > 0
    WHERE p.user_id = ? AND p.is_archived = 0
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(userId);
}

createPortfolio({ userId, name, description, portfolioType, ... }) {
  // Include user_id in insert
  const result = this.db.prepare(`
    INSERT INTO portfolios (
      user_id, name, description, portfolio_type, benchmark_index_id,
      currency, initial_cash, initial_date, current_cash, clone_investor_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,  // Add user_id
    name,
    description || null,
    portfolioType || 'manual',
    // ... rest unchanged
  );
  // ... rest of method
}

// Helper to verify portfolio ownership
verifyPortfolioOwnership(portfolioId, userId) {
  const portfolio = this.db.prepare(
    'SELECT user_id FROM portfolios WHERE id = ?'
  ).get(portfolioId);

  if (!portfolio) {
    throw new Error('Portfolio not found');
  }

  // Allow access if no user_id set (legacy data) or if user owns it
  if (portfolio.user_id && portfolio.user_id !== userId) {
    throw new Error('Access denied');
  }

  return true;
}
```

---

## PART 10: FRONTEND - AUTH CONTEXT

Create file: `frontend/src/context/AuthContext.js`

```javascript
// frontend/src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include'  // Important for cookies
      });
      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    // Redirect to backend OAuth endpoint
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
      // Optionally redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

---

## PART 11: FRONTEND - LOGIN PAGE

Create file: `frontend/src/pages/LoginPage.js`

```javascript
// frontend/src/pages/LoginPage.js
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const error = searchParams.get('error');

  useEffect(() => {
    // If already logged in, redirect to home
    if (!loading && isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Logo/Title */}
        <div className="login-header">
          <h1>Investment Project</h1>
          <p>Sign in to access your portfolios</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="login-error">
            Authentication failed. Please try again.
          </div>
        )}

        {/* Login Card */}
        <div className="login-card">
          <button onClick={login} className="google-login-btn">
            <svg className="google-icon" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer */}
        <p className="login-footer">
          Single-user app for personal portfolio tracking
        </p>
      </div>
    </div>
  );
}
```

Create file: `frontend/src/pages/LoginPage.css`

```css
/* frontend/src/pages/LoginPage.css */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  padding: var(--spacing-4);
}

.login-container {
  max-width: 400px;
  width: 100%;
}

.login-header {
  text-align: center;
  margin-bottom: var(--spacing-6);
}

.login-header h1 {
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-2) 0;
}

.login-header p {
  color: var(--text-secondary);
  margin: 0;
}

.login-error {
  background: var(--color-red-50);
  border: 1px solid var(--color-red-200);
  color: var(--color-red-700);
  padding: var(--spacing-3);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-4);
  text-align: center;
}

.login-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-6);
  box-shadow: var(--shadow-md);
}

.google-login-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 500;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.15s, box-shadow 0.15s;
}

.google-login-btn:hover {
  background: var(--bg-tertiary);
  box-shadow: var(--shadow-sm);
}

.google-login-btn:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-blue-500);
}

.google-icon {
  width: 20px;
  height: 20px;
}

.login-footer {
  margin-top: var(--spacing-6);
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-primary);
  border-top-color: var(--color-blue-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## PART 12: FRONTEND - USER MENU

Create file: `frontend/src/components/auth/UserMenu.js`

```javascript
// frontend/src/components/auth/UserMenu.js
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Settings, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import './UserMenu.css';

export default function UserMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="user-avatar"
          />
        ) : (
          <div className="user-avatar-placeholder">
            {user.name?.charAt(0) || user.email?.charAt(0) || '?'}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="user-menu-dropdown">
          {/* User Info */}
          <div className="user-menu-header">
            <p className="user-name">{user.name}</p>
            <p className="user-email">{user.email}</p>
          </div>

          {/* Menu Items */}
          <div className="user-menu-items">
            <Link
              to="/settings"
              className="user-menu-item"
              onClick={() => setIsOpen(false)}
            >
              <Settings size={16} />
              Settings
            </Link>
          </div>

          {/* Sign Out */}
          <div className="user-menu-footer">
            <button onClick={logout} className="user-menu-logout">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Create file: `frontend/src/components/auth/UserMenu.css`

```css
/* frontend/src/components/auth/UserMenu.css */
.user-menu {
  position: relative;
}

.user-menu-trigger {
  display: flex;
  align-items: center;
  padding: 4px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.15s;
}

.user-menu-trigger:hover {
  background: var(--bg-tertiary);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.user-avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-blue-500);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.user-menu-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  width: 220px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  overflow: hidden;
}

.user-menu-header {
  padding: var(--spacing-3) var(--spacing-4);
  border-bottom: 1px solid var(--border-primary);
}

.user-name {
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 4px 0 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-menu-items {
  padding: var(--spacing-2) 0;
}

.user-menu-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  color: var(--text-secondary);
  text-decoration: none;
  transition: background-color 0.15s;
}

.user-menu-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.user-menu-footer {
  padding: var(--spacing-2) 0;
  border-top: 1px solid var(--border-primary);
}

.user-menu-logout {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
  padding: var(--spacing-2) var(--spacing-4);
  border: none;
  background: transparent;
  color: var(--color-red-600);
  cursor: pointer;
  text-align: left;
  font-size: inherit;
  transition: background-color 0.15s;
}

.user-menu-logout:hover {
  background: var(--bg-tertiary);
}
```

---

## PART 13: FRONTEND - PROTECTED ROUTE

Create file: `frontend/src/components/auth/ProtectedRoute.js`

```javascript
// frontend/src/components/auth/ProtectedRoute.js
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login, but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
```

---

## PART 14: UPDATE APP.JS

Update `frontend/src/App.js`:

```javascript
// frontend/src/App.js
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';

// ... your existing page imports

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route - Login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes - everything else */}
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/company/:symbol" element={<CompanyPage />} />
                  <Route path="/portfolios" element={<PortfoliosPage />} />
                  <Route path="/portfolios/:id" element={<PortfolioDetailPage />} />
                  {/* ... rest of your routes */}
                </Routes>
              </Layout>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
```

---

## PART 15: UPDATE API SERVICE

Update `frontend/src/services/api.js` to include credentials:

```javascript
// frontend/src/services/api.js

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// Helper for fetch with credentials
async function fetchWithAuth(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',  // Include cookies for session
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle 401 - redirect to login
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  return response;
}

// Example: Get portfolios
export async function getPortfolios() {
  const response = await fetchWithAuth(`${API_BASE}/api/portfolios`);
  return response.json();
}

// Example: Create portfolio
export async function createPortfolio(data) {
  const response = await fetchWithAuth(`${API_BASE}/api/portfolios`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.json();
}

// ... update other API calls similarly
```

---

## PART 16: DATA MIGRATION SCRIPT

Create file: `src/scripts/migrate-data-to-user.js`

```javascript
// src/scripts/migrate-data-to-user.js
// Run this AFTER your first Google login to assign existing data to your user

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

async function migrateData() {
  // Get the user ID from command line or find the first/only user
  let userId = process.argv[2];

  if (!userId) {
    const user = db.prepare('SELECT id, email FROM users ORDER BY created_at LIMIT 1').get();
    if (!user) {
      console.error('No users found! Please login with Google first.');
      process.exit(1);
    }
    userId = user.id;
    console.log(`Using user: ${user.email} (${userId})`);
  }

  // Verify user exists
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!user) {
    console.error(`User ${userId} not found!`);
    process.exit(1);
  }

  console.log(`\nMigrating data to user: ${user.email}`);
  console.log('='.repeat(50));

  // Migrate portfolios
  const portfolioResult = db.prepare(`
    UPDATE portfolios SET user_id = ? WHERE user_id IS NULL
  `).run(userId);
  console.log(`Portfolios migrated: ${portfolioResult.changes}`);

  // Update user_preferences
  const prefsResult = db.prepare(`
    UPDATE user_preferences SET user_id = ? WHERE user_id = 'default'
  `).run(userId);
  console.log(`User preferences migrated: ${prefsResult.changes}`);

  console.log('\nMigration complete!');
}

migrateData()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('Migration failed:', err);
    db.close();
    process.exit(1);
  });
```

---

## SUMMARY

### Files to Create

| File | Purpose |
|------|---------|
| `src/database-migrations/add-auth-tables.js` | Database schema for auth |
| `src/auth/passport.js` | Passport.js configuration |
| `src/auth/middleware.js` | Auth middleware functions |
| `src/api/routes/auth.js` | Auth API routes |
| `src/scripts/migrate-data-to-user.js` | Data migration script |
| `frontend/src/context/AuthContext.js` | React auth context |
| `frontend/src/pages/LoginPage.js` | Login page |
| `frontend/src/pages/LoginPage.css` | Login page styles |
| `frontend/src/components/auth/UserMenu.js` | User dropdown menu |
| `frontend/src/components/auth/UserMenu.css` | User menu styles |
| `frontend/src/components/auth/ProtectedRoute.js` | Route protection |

### Files to Update

| File | Changes |
|------|---------|
| `src/api/server.js` | Add session, passport middleware |
| `src/api/routes/portfolios.js` | Add user scoping |
| `src/services/portfolio/index.js` | Add user-scoped methods |
| `frontend/src/App.js` | Add AuthProvider, routes |
| `frontend/src/services/api.js` | Add credentials to fetch |
| `.env` | Add Google OAuth credentials |

### Setup Steps

1. Install dependencies: `npm install passport passport-google-oauth20 express-session better-sqlite3-session-store uuid`
2. Create Google OAuth credentials (5 min)
3. Add env variables to `.env`
4. Run migration: `node src/database-migrations/add-auth-tables.js`
5. Create auth files (passport.js, middleware.js, routes/auth.js)
6. Update server.js with session and passport
7. Create frontend auth components
8. Update App.js with AuthProvider
9. Login with Google
10. Run data migration: `node src/scripts/migrate-data-to-user.js`

### Security Notes

- All user-specific queries MUST include `user_id` filter
- Never trust client-provided user IDs - always get from `req.user`
- Sessions stored in SQLite database
- CORS configured for frontend origin with credentials
- Cookies are httpOnly and secure in production
