# OAuth Setup Guide for Railway Deployment

## Problem: Redirecting to localhost:3000 after Google login

This happens because the Google OAuth configuration in Google Cloud Console points to localhost instead of your production URL.

## Solution: Update Google OAuth Configuration

### Step 1: Update Railway Environment Variables

1. Go to your Railway project dashboard
2. Click on your service
3. Go to **Variables** tab
4. Add/update these variables:

```bash
APP_URL=https://your-app-name.up.railway.app
NODE_ENV=production
SESSION_SECRET=<generate with: openssl rand -hex 32>
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
```

**CRITICAL**: The `APP_URL` must match your Railway deployment URL exactly (including `https://`).

### Step 2: Update Google Cloud Console OAuth Configuration

This is the **MOST IMPORTANT** step - Google determines where to redirect users after login based on the **Authorized redirect URIs** configured in Google Cloud Console, NOT based on your application code.

#### 2.1 Go to Google Cloud Console

1. Visit https://console.cloud.google.com/apis/credentials
2. Select your project
3. Find your OAuth 2.0 Client ID (the one you're using for this app)
4. Click **Edit** (pencil icon)

#### 2.2 Update Authorized JavaScript Origins

Add your Railway URL to **Authorized JavaScript origins**:

```
https://your-app-name.up.railway.app
```

#### 2.3 Update Authorized Redirect URIs

**This is the critical step!** Add your Railway callback URL to **Authorized redirect URIs**:

```
https://your-app-name.up.railway.app/api/auth/google/callback
```

**Common mistake**: Make sure you have:
- ✅ `https://your-app-name.up.railway.app/api/auth/google/callback` (production)
- You can keep `http://localhost:3000/api/auth/google/callback` (for local development)

**DO NOT** use:
- ❌ `http://your-app-name.up.railway.app/...` (Railway uses HTTPS)
- ❌ `https://your-app-name.up.railway.app` (missing the callback path)
- ❌ `https://localhost:3000/...` (mixing localhost with https)

#### 2.4 Save Changes

Click **Save** at the bottom of the page.

**Important**: Changes in Google Cloud Console may take a few minutes to propagate.

### Step 3: Redeploy Your Railway App

After setting environment variables in Railway:

1. Go to your Railway dashboard
2. Click **Deployments**
3. Railway should auto-deploy when you push code
4. Or manually trigger a deployment by clicking **Deploy**

### Step 4: Test the OAuth Flow

1. Visit your Railway app: `https://your-app-name.up.railway.app`
2. Click the login button
3. You should be redirected to Google OAuth
4. After authentication, you should be redirected back to your Railway app (NOT localhost)
5. Check the browser URL - it should stay on `https://your-app-name.up.railway.app`

## Debugging Tips

### Check Railway Logs

```bash
railway logs --tail
```

Look for:
- `[OAuth] Session saved successfully for user: <email>` - Good!
- `[OAuth] Session save failed: <error>` - Session issue
- `[Passport] deserializeUser error: <error>` - Database issue

### Check Session Cookie

1. Open browser DevTools (F12)
2. Go to **Application** → **Cookies**
3. Look for `connect.sid` cookie
4. Check:
   - Domain should be your Railway domain
   - Secure should be `true`
   - HttpOnly should be `true`
   - SameSite should be `Strict` or `Lax`

### Common Issues

#### Issue 1: Still redirecting to localhost
**Cause**: Google Cloud Console redirect URI still points to localhost
**Fix**: Update Google Cloud Console (Step 2 above)

#### Issue 2: Session not persisting after login
**Cause**: Cookie not being set correctly
**Fix**:
- Check that `APP_URL` is set correctly
- Check that `SESSION_SECRET` is set
- Check that `REDIS_URL` or SQLite is working

#### Issue 3: CORS errors
**Cause**: Frontend trying to make requests to different domain
**Fix**: Frontend and backend should be on same domain (Railway serves both)

## Technical Details

### How OAuth Redirect Works

1. User clicks login → redirected to `https://your-app.railway.app/api/auth/google`
2. Backend redirects to Google OAuth with client ID
3. User authenticates with Google
4. **Google redirects to the URI configured in Google Cloud Console** (this is the key!)
5. Our app receives the callback at `/api/auth/google/callback`
6. Backend creates session and redirects to `/` (homepage)

### Why APP_URL is Important

The `APP_URL` environment variable is used in these places:

1. **Passport OAuth callback URL** (`src/auth/passport.js:51`):
   ```javascript
   callbackURL: `${process.env.APP_URL}/api/auth/google/callback`
   ```

2. **Stripe checkout URLs** (`src/api/routes/subscription.js:228-230`):
   ```javascript
   const successUrl = `${appUrl}/pricing/success?session_id={CHECKOUT_SESSION_ID}`;
   const cancelUrl = `${appUrl}/pricing?cancelled=true`;
   ```

3. **Stripe customer portal** (`src/api/routes/subscription.js:296-297`):
   ```javascript
   const returnUrl = `${appUrl}/settings/subscription`;
   ```

### Session Configuration

Production sessions use:
- **secure**: `true` (HTTPS only)
- **httpOnly**: `true` (prevent XSS)
- **sameSite**: `'strict'` (CSRF protection)
- **maxAge**: 8 hours (security)

Local development uses:
- **secure**: `false` (HTTP ok)
- **sameSite**: `'lax'` (easier testing)
- **maxAge**: 30 days (convenience)

## Verification Checklist

After completing setup, verify:

- [ ] `APP_URL` set in Railway to your production URL
- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` set in Railway
- [ ] Google Cloud Console has Railway callback URL in Authorized redirect URIs
- [ ] Railway app is deployed and running
- [ ] Login redirects to Google OAuth page
- [ ] After Google auth, redirected back to Railway app (not localhost)
- [ ] Session persists (user stays logged in after page refresh)
- [ ] User info appears in UI (navbar shows user name/picture)

## Need Help?

If you're still having issues:

1. Check Railway logs: `railway logs --tail`
2. Check browser console for errors
3. Check Network tab in DevTools for failed requests
4. Verify session cookie is being set
5. Double-check all URLs match exactly (no trailing slashes, correct protocol)

## Example: Complete Railway Environment Variables

```bash
# Required
APP_URL=https://prism-invest.up.railway.app
NODE_ENV=production
SESSION_SECRET=<32+ character random string>
DATABASE_URL=<auto-set by Railway PostgreSQL addon>
REDIS_URL=<auto-set by Railway Redis addon>

# OAuth
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret-here

# API Keys (for features)
ANTHROPIC_API_KEY=sk-ant-...
ALPHA_VANTAGE_KEY=...
```

## Security Notes

⚠️ **Never commit** OAuth secrets or session secrets to git
⚠️ **Always use HTTPS** in production
⚠️ **Regenerate SESSION_SECRET** if compromised
⚠️ **Use environment variables** for all secrets
