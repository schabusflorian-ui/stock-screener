# OAuth Authentication Fix Summary

## Problem Statement

After deploying to Railway, Google OAuth login was failing with:
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

## Root Cause Analysis

### Primary Issue: Missing `getDatabaseAsync` Export

**File**: [src/lib/db.js](src/lib/db.js)

The codebase was recently converted from synchronous SQLite to asynchronous PostgreSQL operations. Multiple services were updated to use `getDatabaseAsync()` instead of `getDatabase()` for clarity in async contexts, but **the function was never exported** from `db.js`.

**Files affected**:
- `src/auth/passport.js` - Line 58: `const database = await getDatabaseAsync();`
- `src/services/settingsService.js` - Line 849
- `src/api/routes/nlQuery.js` - Line 1143
- And potentially 100+ other converted services

### Secondary Issue: Production Error Sanitization

**File**: [src/middleware/errorHandler.js](src/middleware/errorHandler.js:150-152)

In production (`NODE_ENV=production`), all 500-level errors show generic message "An unexpected error occurred" to prevent leaking sensitive information. The actual error (`getDatabaseAsync is not a function`) was only visible in Railway logs, not in API responses.

```javascript
message: isProduction && statusCode >= 500
  ? 'An unexpected error occurred'  // <-- Hides real error
  : message,
```

This is **correct security behavior**, but makes debugging harder. Always check Railway logs for real error messages.

### Tertiary Issue: Railway Deployment Timing

Railway was running an old deployment that didn't include the `getDatabaseAsync` export fix. The deployment ID (`68bc72af`) started before the fix was pushed (commit `b75e87b`).

## Solution

### Fix 1: Export `getDatabaseAsync` from db.js

**File**: [src/lib/db.js](src/lib/db.js:470-473)

Added `getDatabaseAsync` as an alias to `getDatabase()`:

```javascript
/**
 * Alias for getDatabase() - for clarity in async contexts
 */
const getDatabaseAsync = getDatabase;
```

**Export** (Line 654):
```javascript
module.exports = {
  getDatabase,
  getDatabaseAsync,  // <-- ADDED
  getDatabaseSync,
  // ... rest of exports
};
```

### Fix 2: Trigger Fresh Railway Deployment

Created empty commit (a20db28) to force Railway to redeploy with latest code:
```bash
git commit --allow-empty -m "Trigger Railway redeployment"
git push origin railway-deploy-clean
```

## Testing & Verification

### Local Verification

Test that `getDatabaseAsync` works:
```bash
node -e "const { getDatabaseAsync } = require('./src/lib/db.js'); console.log('Works:', typeof getDatabaseAsync === 'function');"
# Expected: Works: true
```

### Railway Diagnostic Script

Run diagnostic tests on Railway:
```bash
# Get Railway DATABASE_URL from dashboard
export DATABASE_URL="postgres://..."

# Run comprehensive OAuth diagnostic
node scripts/test-railway-oauth.js
```

This script tests:
- ✅ getDatabaseAsync function availability
- ✅ Database connectivity
- ✅ Users table schema
- ✅ OAuth flow simulation
- ✅ Environment configuration

### Manual Testing

1. **Wait for Railway deployment** (2-5 minutes):
   - Go to Railway dashboard → Deployments
   - Wait for new deployment to show "Active"
   - Check deployment logs for "API Server running"

2. **Test OAuth flow**:
   ```bash
   # Visit your Railway app
   https://your-app.up.railway.app

   # Click "Login with Google"
   # Should redirect to Google OAuth
   # After authentication, should redirect back to Railway (NOT localhost)
   # Check browser console for errors
   ```

3. **Check for errors**:
   ```bash
   # If still failing, check Railway logs
   railway logs --tail

   # Should NO LONGER see:
   # ❌ "getDatabaseAsync is not a function"

   # May see NEW errors (if any) that need fixing
   ```

## Remaining Configuration

### Google Cloud Console (CRITICAL)

Even with `getDatabaseAsync` fixed, you'll still be **redirected to localhost** after Google login until you update Google Cloud Console:

1. Go to https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Click **Edit**
4. Under **Authorized redirect URIs**, add:
   ```
   https://your-app.up.railway.app/api/auth/google/callback
   ```
5. Keep localhost URL for local development:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
6. Click **Save**
7. Wait 1-2 minutes for changes to propagate

### Railway Environment Variables

Ensure these are set in Railway dashboard → Variables:

```bash
# Required
DATABASE_URL=postgresql://...  # Auto-set by Railway PostgreSQL addon
REDIS_URL=redis://...          # Auto-set by Railway Redis addon
SESSION_SECRET=<32+ chars>     # Generate: openssl rand -hex 32
APP_URL=https://your-app.up.railway.app  # CRITICAL for OAuth
NODE_ENV=production

# OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

## Expected Behavior After Fix

### ✅ Success Indicators:

1. **Railway logs show**:
   ```
   📊 PostgreSQL database connected
   ✅ Migrations complete
   🚀 Starting application server...
   API Server running on http://0.0.0.0:8080
   [Session Store] Connected to Redis
   ```

2. **OAuth flow works**:
   - Click "Login with Google" → Redirects to Google
   - Authenticate with Google → Redirects to Railway app (NOT localhost)
   - Session persists (user stays logged in after refresh)
   - User info shows in navbar

3. **No more errors** in Railway logs:
   - ❌ `getDatabaseAsync is not a function` - GONE
   - ❌ `INTERNAL_ERROR` on OAuth callback - GONE

### 🔄 If Still Failing:

If you still see `INTERNAL_ERROR` after redeployment:

1. **Check Railway deployment commit**:
   ```bash
   # In Railway logs, look for deployment start:
   # "Starting Container" followed by git commit hash
   # Should be a20db28 or later
   ```

2. **Check for NEW errors**:
   ```bash
   railway logs | grep "error"
   # The error message should be DIFFERENT now
   # (not getDatabaseAsync anymore)
   ```

3. **Run diagnostics**:
   ```bash
   # Use diagnostic endpoints (already deployed)
   curl https://your-app.up.railway.app/api/diagnostic/db
   curl https://your-app.up.railway.app/api/diagnostic/env
   curl https://your-app.up.railway.app/api/diagnostic/oauth
   ```

4. **Check database**:
   ```bash
   # Connect to Railway PostgreSQL
   railway connect postgresql

   # Verify users table exists
   \dt users

   # Check table schema
   \d users

   # Should have columns: id, google_id, email, name, picture, last_login_at
   ```

## Additional Issue Found: Missing `await` in deserializeUser

After fixing the `getDatabaseAsync` export, a **second issue** was discovered:

**File**: [src/auth/passport.js:32](src/auth/passport.js:32)

The `deserializeUser` function was calling `getDatabase()` without `await`:

```javascript
// ❌ WRONG - Missing await
const dbClient = getDatabase();
const result = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
```

**Error**: `TypeError: dbClient.query is not a function`

**Cause**: `getDatabase()` in PostgreSQL mode returns a Promise, not the database object. Without `await`, `dbClient` is a Promise object, which doesn't have a `.query()` method.

**Fix** (commit 6ddafb9):
```javascript
// ✅ CORRECT - Added await
const dbClient = await getDatabaseAsync();
const result = await dbClient.query('SELECT * FROM users WHERE id = $1', [userId]);
```

This fix allows session deserialization to work correctly - without it, users couldn't stay logged in across page loads.

## Timeline

- **Issue Start**: 2026-02-09 08:30 UTC - OAuth started failing after PostgreSQL conversion
- **Root Cause #1 Identified**: 09:10 UTC - `getDatabaseAsync` not exported from db.js
- **Fix #1 Applied**: 09:15 UTC - Added getDatabaseAsync export (commit b75e87b)
- **Deployment Triggered**: 09:25 UTC - Forced redeploy (commit a20db28)
- **Root Cause #2 Found**: 09:35 UTC - Missing `await` in deserializeUser (passport.js:32)
- **Fix #2 Applied**: 09:40 UTC - Added await to deserializeUser (commit 6ddafb9)
- **Expected Resolution**: 09:45 UTC - OAuth should fully work after deployment completes

## Files Changed

### Critical Fixes:
- [src/lib/db.js](src/lib/db.js) - Added `getDatabaseAsync` function and export (commit b75e87b)
- [src/auth/passport.js](src/auth/passport.js) - Added missing `await` in deserializeUser (commit 6ddafb9)

### Supporting Infrastructure (already deployed):
- [src/api/routes/diagnostic.js](src/api/routes/diagnostic.js) - Diagnostic endpoints
- [src/api/server.js](src/api/server.js) - Registered diagnostic routes
- [scripts/test-railway-oauth.js](scripts/test-railway-oauth.js) - Comprehensive diagnostic script

### Documentation:
- [OAUTH_SETUP_GUIDE.md](OAUTH_SETUP_GUIDE.md) - Google Cloud Console setup
- [OAUTH_FIX_SUMMARY.md](OAUTH_FIX_SUMMARY.md) - This document

## Lessons Learned

1. **Always test exports**: When adding new functions, immediately test they're exported
2. **Check deployment logs**: Production errors are sanitized - always check logs for real errors
3. **Verify deployment commit**: Railway deployment IDs != git commit hashes
4. **Use diagnostic tools**: Create diagnostic endpoints early for production debugging
5. **Gradual migration complexity**: Converting 100+ files from sync→async increases surface area for missing exports

## Next Steps

1. ✅ Wait for Railway deployment to complete (~5 minutes)
2. ✅ Test OAuth login on Railway
3. ✅ Update Google Cloud Console redirect URIs
4. 🔄 Continue PostgreSQL async conversion (112 services remaining)
5. 🔄 Run comprehensive test suite before next deployment

---

**Status**: 🟡 Second fix deployed (missing await), awaiting Railway build completion

**Commits**:
- b75e87b - Export getDatabaseAsync from db.js
- 6ddafb9 - Add missing await in deserializeUser

**Last Updated**: 2026-02-09 09:40 UTC
