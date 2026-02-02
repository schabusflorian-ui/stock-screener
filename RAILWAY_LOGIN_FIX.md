# Railway Login Redirect Fix

## Problem
After logging in via dev-login on Railway, you're being redirected back to localhost instead of staying on the Railway domain.

## Root Causes

### 1. Backend Hardcoded Localhost Fallbacks ✅ FIXED
**Location:** `src/api/routes/auth.js` lines 63, 68, 71

The Google OAuth callback routes had hardcoded localhost fallbacks:
```javascript
process.env.FRONTEND_URL || 'http://localhost:3001'
```

**Fix Applied:** Changed all redirects to use relative paths (`/`, `/login?error=...`) which work correctly in all environments.

### 2. Missing Environment Variables in Railway ⚠️ NEEDS CONFIGURATION

The frontend was built without knowing the production URL, causing it to use localhost or relative paths incorrectly.

## Required Steps

### Step 1: Set Environment Variables in Railway

You need to set these environment variables in your Railway project:

**Option A: Via Railway Dashboard**
1. Go to https://railway.app
2. Select your project
3. Click **"Variables"** tab
4. Add these two variables:
   ```
   REACT_APP_API_URL=https://prism-invest.up.railway.app
   ```

**Option B: Via Railway CLI**
```bash
# Install Railway CLI if not already installed
npm i -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Set the environment variable
railway variables set REACT_APP_API_URL=https://prism-invest.up.railway.app
```

### Step 2: Trigger a Frontend Rebuild

The environment variable must be set **before** the frontend build runs, because React bakes environment variables into the compiled JavaScript at build time.

After setting `REACT_APP_API_URL` in Railway:

**Option A: Redeploy via Railway Dashboard**
1. Go to **"Deployments"** tab
2. Click **"..."** menu on the latest deployment
3. Click **"Redeploy"**

**Option B: Push a new commit**
```bash
# Make a small change or empty commit to trigger rebuild
git commit --allow-empty -m "Trigger rebuild with REACT_APP_API_URL"
git push origin railway-deploy-clean
```

### Step 3: Verify the Fix

After the rebuild completes (usually 2-3 minutes):

1. **Test dev-login URL:**
   ```
   https://prism-invest.up.railway.app/api/auth/dev-login?secret=b63580db720d310380679fdbe9ccec39
   ```
   - Should redirect to `https://prism-invest.up.railway.app/` (NOT localhost)
   - Should stay on Railway domain
   - App should load and be fully functional

2. **Check frontend configuration:**
   ```bash
   # Verify the frontend bundle contains Railway URL
   curl -s https://prism-invest.up.railway.app/static/js/main.*.js | grep -o "prism-invest" | head -1
   ```
   Should output: `prism-invest`

3. **Check browser console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Should see NO "localhost" references in API calls
   - All API calls should go to `https://prism-invest.up.railway.app/api/...`

## Technical Details

### Why This Happens

React apps are **static builds** - environment variables are baked into the JavaScript during the build process. If `REACT_APP_API_URL` is not set when running `npm run build`, the frontend defaults to:

```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL
  ? `${process.env.REACT_APP_API_URL}/api`
  : '/api';  // Fallback to relative path
```

The relative path `/api` can work for same-domain calls, but the frontend code also uses:

```javascript
const API_BASE = process.env.REACT_APP_API_URL || '';
```

An empty string causes problems in redirect logic and other frontend code that builds full URLs.

### Why Dev-Login Appeared to Work Initially

The dev-login endpoint (`/api/auth/dev-login`) itself works perfectly:
1. ✅ Creates session in Redis
2. ✅ Sets authentication cookie
3. ✅ Redirects to `/` (relative path, stays on Railway)

However, **after** the redirect:
1. Frontend loads on Railway
2. Frontend tries to make API calls using misconfigured URLs
3. Redirects may use hardcoded localhost fallbacks
4. User ends up on localhost

### Files Changed

- **src/api/routes/auth.js** - Removed hardcoded localhost fallbacks from OAuth redirects

### Environment Variables Reference

| Variable | Purpose | Value for Railway |
|----------|---------|-------------------|
| `REACT_APP_API_URL` | Frontend API endpoint | `https://prism-invest.up.railway.app` |
| `DEV_AUTH_SECRET` | Dev-login secret | ✅ Already set |
| `DATABASE_URL` | PostgreSQL connection | ✅ Already set |
| `SESSION_SECRET` | Session encryption | ✅ Already set |
| `NODE_ENV` | Environment mode | ✅ Already set to `production` |

## Next Steps After Fix

Once login works correctly:

1. **Test company data display** - Verify companies, screening, and watchlist features work
2. **Fix remaining route files** - Complete PostgreSQL migration for remaining ~10 route files
3. **Full deployment verification** - Test all features end-to-end

## Questions?

- Check Railway deployment logs: `railway logs`
- Check Railway environment variables: `railway variables`
- Test specific endpoints: See `test-railway-deployment.sh`
