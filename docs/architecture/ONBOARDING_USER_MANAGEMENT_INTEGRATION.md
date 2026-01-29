# Onboarding & User Management Integration

## Overview

The onboarding system integrates with your existing user management infrastructure in a **dual-mode architecture** that supports both authenticated users and anonymous users.

---

## Authentication System

### Current Setup

Your platform uses **Google OAuth 2.0** via Passport.js:

- **Authentication**: Google OAuth (via `/api/auth/google`)
- **Session Management**: Express sessions stored in SQLite
- **User Storage**: `users` table with Google ID, email, name, picture
- **Admin Mode**: LocalStorage-based admin access (24-hour expiry)

### User Flow

```
1. User visits app
2. AuthContext checks authentication:
   - Check localStorage for admin access
   - OR fetch /api/auth/me (checks session cookie)
3. If authenticated → user object available
4. If not authenticated → user = null
```

---

## Onboarding Integration Architecture

### 🎯 Dual-Mode Storage Strategy

The onboarding system uses **localStorage + database persistence**:

#### **For Anonymous Users:**
- Onboarding data stored in **localStorage only**
- Key: `investment_onboarding_data`
- Allows trying the platform before login
- Data persists until user clears browser

#### **For Authenticated Users:**
- Onboarding data stored in **both places**:
  1. **localStorage** (immediate, offline access)
  2. **Database** (`user_preferences` table, cross-device sync)

---

## How It Works

### 1. Frontend: OnboardingContext Integration

Located at: [frontend/src/context/OnboardingContext.js](frontend/src/context/OnboardingContext.js:15)

```javascript
export function OnboardingProvider({ children }) {
  const { user, isAuthenticated } = useAuth(); // ← Gets user from AuthContext
  const [showWelcomeFlow, setShowWelcomeFlow] = useState(false);

  useEffect(() => {
    // Only trigger onboarding for authenticated users who haven't completed it
    if (isAuthenticated && !isOnboardingComplete()) {
      setTimeout(() => setShowWelcomeFlow(true), 500);
    }
  }, [isAuthenticated]);

  // Pass user object to WelcomeFlow component
  return (
    <OnboardingContext.Provider value={{ user, showWelcomeFlow, ... }}>
      {children}
    </OnboardingContext.Provider>
  );
}
```

**Key Points:**
- Waits for authentication check to complete
- Only auto-triggers for authenticated users
- Anonymous users can still manually start onboarding

---

### 2. Data Persistence: welcomeFlow.js

Located at: [frontend/src/lib/onboarding/welcomeFlow.js](frontend/src/lib/onboarding/welcomeFlow.js:58)

```javascript
export const saveOnboardingData = async (userId, data) => {
  // Step 1: Always save to localStorage (immediate persistence)
  const onboardingData = {
    completed: true,
    completedAt: new Date().toISOString(),
    data: {
      interests: data.interests,
      riskProfile: data.riskProfile,
      firstStocks: data.firstStocks,
    },
  };
  localStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify(onboardingData));

  // Step 2: If authenticated, also save to backend
  if (userId && userId !== 'anonymous') {
    try {
      const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000';
      const response = await fetch(`${API_BASE}/api/onboarding/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // ← Sends session cookie
        body: JSON.stringify({
          interests: data.interests,
          riskProfile: data.riskProfile,
          firstStocks: data.firstStocks,
        }),
      });

      if (!response.ok) {
        console.error('Failed to save to backend');
      }
    } catch (error) {
      console.error('Backend save error:', error);
      // Still works - localStorage persists
    }
  }
};
```

**Key Points:**
- localStorage save is **always** successful (offline-first)
- Backend save is **optional** (only for authenticated users)
- Graceful degradation if backend fails

---

### 3. Backend: Authentication Middleware

Located at: [src/api/routes/onboarding.js](src/api/routes/onboarding.js:10)

```javascript
router.post('/preferences', async (req, res) => {
  const userId = req.user?.id; // ← Passport sets req.user from session

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  // Save to user_preferences table
  const preferencesData = {
    user_id: userId,
    interests: JSON.stringify(req.body.interests),
    risk_profile: req.body.riskProfile,
    onboarding_completed_at: new Date(),
  };

  await db('user_preferences').insert(preferencesData);

  // Also create watchlist if stocks provided
  if (req.body.firstStocks?.length > 0) {
    // ... watchlist creation logic
  }

  res.json({ success: true });
});
```

**Key Points:**
- Uses `req.user` from Passport session
- Returns 401 if not authenticated
- Creates watchlist entries tied to user_id

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- UUID
  google_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME,
  is_admin INTEGER DEFAULT 0
);
```

### User Preferences Table
```sql
CREATE TABLE user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,                    -- Links to users.id
  interests TEXT,                           -- JSON array: ["growth", "tech", ...]
  risk_profile TEXT,                        -- "low", "medium", "high"
  onboarding_completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**⚠️ Important Note:** Your current `watchlist` table doesn't have a `user_id` column. It's a **shared watchlist** across all users. You'll need to decide:

**Option A:** Keep shared watchlist (current behavior)
- Simple, works for single-user scenarios
- Onboarding API will skip watchlist creation

**Option B:** Add multi-user watchlist support
- Create `user_watchlists` table with `user_id` column
- Requires migration

---

## User Journey Examples

### 🔵 Scenario 1: New Authenticated User

```
1. User clicks "Login with Google"
2. Redirected to /api/auth/google
3. Google OAuth flow → user created in `users` table
4. Redirected back to app with session cookie
5. AuthContext detects authentication → sets user object
6. OnboardingContext checks: !isOnboardingComplete()
7. WelcomeFlow appears automatically
8. User completes onboarding:
   - Data saved to localStorage
   - API POST to /api/onboarding/preferences
   - Database record created in user_preferences
   - Watchlist created (if applicable)
9. Future visits: data loaded from database
```

### 🟢 Scenario 2: Anonymous User

```
1. User visits app without logging in
2. AuthContext: user = null
3. OnboardingContext: no auto-trigger
4. User manually clicks "Get Started" (if offered)
5. WelcomeFlow appears
6. User completes onboarding:
   - Data saved to localStorage only
   - userId = 'anonymous'
   - No backend API call
7. Data persists in browser only
8. If user later logs in:
   - Can trigger onboarding again to sync to backend
   - OR can migrate localStorage data to backend
```

### 🟡 Scenario 3: Returning User (Different Device)

```
1. User logs in on new device
2. AuthContext authenticates → user object available
3. OnboardingContext checks localStorage: empty
4. WelcomeFlow triggers
5. BUT: Backend already has preferences
6. Solution: Fetch from API and pre-populate:

// Add to OnboardingContext.js:
useEffect(() => {
  if (isAuthenticated && !isOnboardingComplete()) {
    // Check if backend has preferences
    fetchBackendPreferences().then(prefs => {
      if (prefs) {
        // Pre-populate localStorage from backend
        localStorage.setItem('investment_onboarding_data', JSON.stringify(prefs));
      } else {
        // Show onboarding flow
        setShowWelcomeFlow(true);
      }
    });
  }
}, [isAuthenticated]);
```

---

## API Endpoints

### POST /api/onboarding/preferences
**Purpose:** Save user's onboarding preferences

**Authentication:** Required (401 if not authenticated)

**Request Body:**
```json
{
  "interests": ["growth", "tech", "dividend"],
  "riskProfile": "medium",
  "firstStocks": [
    { "symbol": "AAPL", "name": "Apple Inc." },
    { "symbol": "MSFT", "name": "Microsoft Corporation" }
  ],
  "firstWatchlistName": "My Watchlist"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Onboarding preferences saved"
}
```

---

### GET /api/onboarding/preferences
**Purpose:** Retrieve user's saved preferences

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "interests": ["growth", "tech"],
    "riskProfile": "medium",
    "completedAt": "2025-01-13T10:30:00Z"
  },
  "hasCompletedOnboarding": true
}
```

---

### GET /api/onboarding/recommendations
**Purpose:** Get personalized stock recommendations

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "stocks": ["NVDA", "TSLA", "AAPL", "MSFT"],
  "interests": ["growth", "tech"],
  "riskProfile": "medium",
  "reason": "personalized"
}
```

---

## Security Considerations

### ✅ What's Protected

1. **Backend API routes**: All require authentication via session cookie
2. **Database access**: Only authenticated users can save/retrieve preferences
3. **User isolation**: user_id prevents cross-user data access
4. **Session expiry**: 30-day cookie expiration

### ⚠️ What's Not Protected

1. **LocalStorage data**: Client-side only, can be viewed/modified
2. **Tour completion tracking**: Stored in localStorage (not sensitive)
3. **Anonymous onboarding**: No authentication required

### 🔒 Recommendations

1. **Don't store sensitive data in localStorage** (no passwords, tokens, PII)
2. **Validate all backend inputs** (already done with array checks)
3. **Use HTTPS in production** (already configured in server.js)
4. **Consider rate limiting** on onboarding endpoints to prevent spam

---

## Admin Mode Integration

Your platform has a **special admin mode** that works differently:

```javascript
// AuthContext checks localStorage first
if (checkAdminAccess()) {
  setUser({
    id: 'admin',
    name: 'Admin',
    email: 'admin@local',
  });
}
```

**Onboarding behavior for admin:**
- Admin is treated as authenticated (`isAuthenticated = true`)
- Onboarding data saved with `userId = 'admin'`
- Backend API calls will **fail** (no real session)
- Solution: Check for admin and skip backend save:

```javascript
// In welcomeFlow.js:
if (userId && userId !== 'anonymous' && userId !== 'admin') {
  // Only save to backend for real authenticated users
  await fetch('/api/onboarding/preferences', ...);
}
```

---

## Cross-Device Sync

### Current Behavior
- **Same device, same browser**: Works perfectly (localStorage)
- **Different device**: No sync (localStorage doesn't transfer)
- **Same device, different browser**: No sync

### Enabling Full Sync

To enable cross-device synchronization, modify `OnboardingContext.js`:

```javascript
useEffect(() => {
  if (isAuthenticated && user?.id) {
    // Fetch from backend on every auth
    fetchBackendPreferences(user.id).then(backendPrefs => {
      const localPrefs = getOnboardingData();

      if (backendPrefs && !localPrefs.completed) {
        // Backend has data, local doesn't → sync down
        localStorage.setItem('investment_onboarding_data', JSON.stringify(backendPrefs));
      } else if (!backendPrefs && localPrefs.completed) {
        // Local has data, backend doesn't → sync up
        saveOnboardingData(user.id, localPrefs.data);
      }
      // If both have data → use backend as source of truth
    });
  }
}, [isAuthenticated, user]);
```

---

## Testing User Management Integration

### Test 1: Authenticated User Flow
```bash
# Start backend
npm start

# Start frontend
cd frontend && npm start

# Test:
1. Go to http://localhost:3001
2. Click "Login with Google"
3. Complete OAuth flow
4. Check: Welcome flow should appear
5. Complete onboarding
6. Open DevTools → Application → Cookies
   - Should see session cookie: connect.sid
7. Open DevTools → Network → Filter by /api/onboarding/preferences
   - Should see POST request with 200 response
8. Check database:
   sqlite3 data/stocks.db "SELECT * FROM user_preferences;"
```

### Test 2: Anonymous User Flow
```bash
1. Clear localStorage: localStorage.clear()
2. Don't log in
3. Manually trigger onboarding (if available)
4. Complete flow
5. Check DevTools → Application → LocalStorage
   - Should see: investment_onboarding_data
6. Check DevTools → Network
   - Should NOT see API calls to /onboarding
```

### Test 3: Admin Mode
```javascript
// In browser console:
localStorage.setItem('adminAccess', 'true');
localStorage.setItem('adminAccessTime', Date.now().toString());
location.reload();

// Result: Should be authenticated but backend calls will fail
// Onboarding should work via localStorage only
```

---

## Migration Path

If you want to improve the integration, here's the recommended path:

### Phase 1: Current State ✅
- Dual storage (localStorage + database)
- Works for authenticated users
- Anonymous users supported

### Phase 2: Cross-Device Sync (Recommended)
1. Add sync logic to OnboardingContext
2. Fetch preferences on authentication
3. Merge localStorage and backend data

### Phase 3: Multi-User Watchlists (Optional)
1. Create migration to add user_id to watchlist
2. Update watchlist API to filter by user
3. Update onboarding API to create user-specific watchlists

### Phase 4: Onboarding Analytics (Optional)
1. Track completion rates
2. A/B test different flows
3. Measure time-to-completion

---

## Summary

### ✅ What's Working Now

1. **Authentication**: Google OAuth via Passport.js
2. **Session Management**: Express sessions in SQLite
3. **User Context**: AuthContext provides user object globally
4. **Onboarding Storage**: Dual localStorage + database
5. **API Integration**: Backend endpoints registered and working
6. **Anonymous Support**: Works without login (localStorage only)

### ⚠️ What Needs Attention

1. **Watchlist Table**: Doesn't have user_id (shared watchlist)
2. **Cross-Device Sync**: Not implemented (requires fetch on auth)
3. **Admin Mode**: Backend API calls fail (need special handling)

### 🎯 Recommended Next Steps

1. **Test with real Google OAuth** (set up credentials if not done)
2. **Run database migration**: `node src/database-migrations/add-user-preferences-table.js`
3. **Add cross-device sync** to OnboardingContext (see code above)
4. **Decide on watchlist architecture** (shared vs per-user)

---

## Code References

| Component | File | Purpose |
|-----------|------|---------|
| User Authentication | [src/auth/passport.js](src/auth/passport.js:8) | Google OAuth strategy |
| Auth Routes | [src/api/routes/auth.js](src/api/routes/auth.js:25) | Login/logout endpoints |
| Auth Context | [frontend/src/context/AuthContext.js](frontend/src/context/AuthContext.js:28) | Frontend auth state |
| Onboarding Context | [frontend/src/context/OnboardingContext.js](frontend/src/context/OnboardingContext.js:15) | Onboarding state |
| Onboarding API | [src/api/routes/onboarding.js](src/api/routes/onboarding.js:10) | Backend preferences API |
| Data Persistence | [frontend/src/lib/onboarding/welcomeFlow.js](frontend/src/lib/onboarding/welcomeFlow.js:58) | Save logic |
| Database Migration | [src/database-migrations/add-user-preferences-table.js](src/database-migrations/add-user-preferences-table.js:1) | Schema setup |

---

## Questions?

If you need to modify the integration:

1. **Change authentication provider**: Update passport.js strategy
2. **Add email/password auth**: Create new strategy in passport.js
3. **Change session storage**: Update server.js session config
4. **Add user roles**: Add column to users table, check in onboarding API
5. **Track onboarding analytics**: Add logging to onboarding.js endpoints
