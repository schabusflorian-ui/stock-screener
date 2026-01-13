# Frontend Integration Guide

Quick guide to integrate the legal infrastructure into your frontend.

## Step 1: Add Legal Page Imports to App.js

Add these imports after the LoginPage import (around line 74):

```javascript
// Lazy load login page
const LoginPage = lazy(() => import('./pages/LoginPage'));

// Lazy load legal pages (ADD THESE)
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const DisclaimerPage = lazy(() => import('./pages/legal/DisclaimerPage'));
const CookiesPage = lazy(() => import('./pages/legal/CookiesPage'));
```

## Step 2: Add Legal Routes to App.js

Add these routes in the PUBLIC section (around line 103, BEFORE the protected routes):

```javascript
<Routes>
  {/* Public route - Login */}
  <Route path="/login" element={<LoginPage />} />

  {/* ADD THESE PUBLIC LEGAL ROUTES */}
  <Route path="/legal/terms" element={<TermsPage />} />
  <Route path="/legal/privacy" element={<PrivacyPage />} />
  <Route path="/legal/disclaimer" element={<PrivacyPage />} />
  <Route path="/legal/cookies" element={<CookiesPage />} />

  {/* Protected routes */}
  <Route path="/*" element={
    <ProtectedRoute>
```

##Step 3: Add CookieConsent to App.js

Add at the top of imports:

```javascript
import CookieConsent from './components/legal/CookieConsent';
```

Then add before the closing `</Router>` tag (around line 166):

```javascript
              </Router>
            </NLQueryProvider>
          </WatchlistProvider>
        </PreferencesProvider>
      </AuthProvider>

      {/* ADD THIS */}
      <CookieConsent />

    </ErrorBoundary>
  );
}
```

## Step 4: Create Simplified Legal Pages

The simplified legal pages have already been created in:
- `frontend/src/pages/legal/TermsPage.js` ✓
- `frontend/src/pages/legal/PrivacyPage.js` (needs update)
- `frontend/src/pages/legal/DisclaimerPage.js` (needs update)
- `frontend/src/pages/legal/CookiesPage.js` (needs update)

## Step 5: Optional - Add Footer to Layout (skip for now)

Since this is a personal project, you may want to skip the footer or add a simpler version later.

## Step 6: Test the Integration

1. Start your dev server:
   ```bash
   cd frontend && npm start
   ```

2. Visit these URLs:
   - http://localhost:3000/legal/terms
   - http://localhost:3000/legal/privacy
   - http://localhost:3000/legal/disclaimer
   - http://localhost:3000/legal/cookies

3. Check that cookie consent banner appears on first visit

## Quick Copy-Paste Integration

### App.js Complete Addition

After line 74 (LoginPage import), add:

```javascript
// Legal pages
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const DisclaimerPage = lazy(() => import('./pages/legal/DisclaimerPage'));
const CookiesPage = lazy(() => import('./pages/legal/CookiesPage'));
```

After line 103 (Login route), add:

```javascript
{/* Legal pages - public */}
<Route path="/legal/terms" element={<TermsPage />} />
<Route path="/legal/privacy" element={<PrivacyPage />} />
<Route path="/legal/disclaimer" element={<DisclaimerPage />} />
<Route path="/legal/cookies" element={<CookiesPage />} />
```

At top of file, add import:

```javascript
import CookieConsent from './components/legal/CookieConsent';
```

Before closing `</ErrorBoundary>`, add:

```javascript
<CookieConsent />
```

## What's Been Created

### Components:
- ✓ `frontend/src/components/legal/CookieConsent.js`
- ✓ `frontend/src/components/legal/CookieConsent.css`
- ✓ `frontend/src/components/legal/LegalPageLayout.js`
- ✓ `frontend/src/components/legal/LegalPageLayout.css`
- ✓ `frontend/src/components/layout/Footer.js` (optional)
- ✓ `frontend/src/components/layout/Footer.css` (optional)

### Pages:
- ✓ `frontend/src/pages/legal/TermsPage.js` (simplified)
- ✓ `frontend/src/pages/legal/PrivacyPage.js` (needs simplification)
- ✓ `frontend/src/pages/legal/DisclaimerPage.js` (needs simplification)
- ✓ `frontend/src/pages/legal/CookiesPage.js` (needs simplification)

### Utilities:
- ✓ `frontend/src/lib/cookies.js`

### Backend:
- ✓ `src/api/routes/gdpr.js` (optional for personal use)

### Documentation:
- ✓ `docs/legal/TERMS_OF_SERVICE.md`
- ✓ `docs/legal/PRIVACY_POLICY.md`
- ✓ `docs/legal/FINANCIAL_DISCLAIMER.md`
- ✓ `docs/legal/COOKIE_POLICY.md`
- ✓ `docs/legal/README.md`
- ✓ `docs/legal/IMPLEMENTATION_GUIDE.md`

## For Personal/Friends Use

Since this is a personal project:

1. **Required**:
   - Legal pages (to inform users)
   - Financial disclaimer (to protect you)
   - Cookie consent (if using analytics)

2. **Optional** (can skip):
   - GDPR endpoints (unless you have EU users who request data)
   - Footer component (adds to every page)
   - Privacy settings page (basic cookie consent is enough)

## Next Steps

1. Copy the code snippets above into `frontend/src/App.js`
2. Test that legal pages load
3. Verify cookie consent appears
4. You're done!

The simplified version is perfect for a personal project shared with friends.
