# Admin Bypass Setup Guide

The admin bypass feature allows you to log in without going through Google OAuth. This is useful for:
- Testing in production
- Emergency access if OAuth fails
- Accessing admin features quickly

## How It Works

The `/api/auth/dev-login` endpoint creates an admin session when you provide the correct secret.

**Endpoint**: `GET /api/auth/dev-login?secret=YOUR_SECRET`

**Admin User Created**:
- ID: `dev-admin`
- Email: `admin@dev.local`
- Name: `Development Admin`
- Admin Flag: `isDevAdmin: true`

## Setup Instructions

### Step 1: Add Environment Variable in Railway

1. Go to your **Railway dashboard**
2. Select your project
3. Click **Variables** tab
4. Click **+ New Variable**
5. Add:
   ```
   Name: DEV_AUTH_SECRET
   Value: 4eb41c7dd8ad7c6e597dc8384724d511b7d8bf16d10aee7dd50d10a8ac74ac6d
   ```
   _(This is a randomly generated 64-character hex string)_

6. Click **Add** or **Save**
7. Railway will automatically redeploy with the new variable

### Step 2: Use Admin Bypass

Once Railway finishes redeploying (2-3 minutes), visit:

```
https://your-app.up.railway.app/api/auth/dev-login?secret=4eb41c7dd8ad7c6e597dc8384724d511b7d8bf16d10aee7dd50d10a8ac74ac6d
```

**Replace** `your-app.up.railway.app` with your actual Railway domain.

You should be:
1. Redirected to the homepage (`/`)
2. Logged in as "Development Admin"
3. Session persists across page loads

### Step 3: Verify Admin Access

Check if you're logged in:

```bash
# Visit this endpoint in your browser
https://your-app.up.railway.app/api/auth/me

# Expected response:
{
  "success": true,
  "user": {
    "id": "dev-admin",
    "email": "admin@dev.local",
    "name": "Development Admin",
    "picture": null,
    "isAdmin": true
  }
}
```

Or check the status endpoint:

```bash
https://your-app.up.railway.app/api/auth/status

# Expected response:
{
  "authenticated": true,
  "userId": "dev-admin",
  "isAdmin": true
}
```

## Security Notes

### ⚠️ Important Security Considerations

1. **Keep the secret private**: This secret grants full admin access
2. **Use a strong secret**: The provided 64-character hex is cryptographically secure
3. **Regenerate if compromised**: If someone gets the secret, regenerate it:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. **Monitor access**: Check Railway logs for dev-login usage:
   ```
   [DevLogin] Session saved successfully for dev-admin
   ```

### Production Recommendations

For production environments, consider:

1. **IP Whitelist**: Add middleware to restrict `/api/auth/dev-login` to specific IPs
2. **Time-Limited Tokens**: Modify the endpoint to generate expiring access codes
3. **Audit Logging**: Track all dev-admin actions
4. **Disable When Not Needed**: Remove `DEV_AUTH_SECRET` from Railway when not actively using it

## Troubleshooting

### Issue: Getting "Not found" error

**Cause**: `DEV_AUTH_SECRET` is not set in Railway environment variables.

**Fix**: Add the variable in Railway dashboard (see Step 1 above).

### Issue: Getting "Invalid secret" error

**Cause**: The secret in the URL doesn't match `DEV_AUTH_SECRET` in Railway.

**Fix**: Double-check the secret value:
1. Go to Railway dashboard → Variables
2. Verify `DEV_AUTH_SECRET` value
3. Use the exact same value in the URL (no extra spaces or characters)

### Issue: Redirects but not logged in

**Cause**: Session not persisting (Redis connection issue or cookie blocked).

**Fix**:
1. Check Railway logs for Redis connection errors
2. Ensure cookies are enabled in your browser
3. Try in an incognito window
4. Check browser console for errors

### Issue: Can't find Railway domain

**Find your Railway domain**:
1. Go to Railway dashboard
2. Click on your service
3. Look for **Deployments** → **Active Deployment**
4. Find the public URL (e.g., `your-app-name.up.railway.app`)

## Logout

To logout the dev-admin session:

```bash
# POST request to logout endpoint
curl -X POST https://your-app.up.railway.app/api/auth/logout \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Or simply clear your cookies/browser data.

## Alternative: Generate Your Own Secret

If you want to use a different secret:

```bash
# Generate a new 64-character secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output example:
# a3f8d92c1e6b4f7a9d2c5e8b1f4a7d9c2e5b8f1a4d7c9e2b5f8a1d4c7e9b2f5a8
```

Use this new secret in Railway's `DEV_AUTH_SECRET` variable.

## Code Reference

The admin bypass is implemented in:
- [src/api/routes/auth.js:8-44](src/api/routes/auth.js#L8-L44) - Dev login endpoint
- [src/auth/passport.js:24-26](src/auth/passport.js#L24-L26) - Dev admin session handling

---

**Quick Start** (TL;DR):

1. Railway dashboard → Variables → Add `DEV_AUTH_SECRET=4eb41c7dd8ad7c6e597dc8384724d511b7d8bf16d10aee7dd50d10a8ac74ac6d`
2. Wait 2-3 minutes for redeploy
3. Visit: `https://your-app.up.railway.app/api/auth/dev-login?secret=4eb41c7dd8ad7c6e597dc8384724d511b7d8bf16d10aee7dd50d10a8ac74ac6d`
4. You're now logged in as admin! 🎉
