#!/bin/bash
# Check Railway Environment Variables

echo "🔍 Checking Railway Environment Variables"
echo "=========================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "Please install it: npm i -g @railway/cli"
    echo ""
    echo "Or check environment variables manually in Railway Dashboard:"
    echo "https://railway.app/project/your-project/settings/variables"
    exit 1
fi

echo "📋 Current Environment Variables:"
echo ""

# List all environment variables
railway variables

echo ""
echo "=========================================="
echo ""
echo "✅ Required Environment Variables for Login Fix:"
echo ""
echo "1. FRONTEND_URL should be:"
echo "   https://prism-invest.up.railway.app"
echo ""
echo "2. REACT_APP_API_URL should be:"
echo "   https://prism-invest.up.railway.app"
echo ""
echo "If these are not set or pointing to localhost, update them:"
echo "  railway variables set FRONTEND_URL=https://prism-invest.up.railway.app"
echo "  railway variables set REACT_APP_API_URL=https://prism-invest.up.railway.app"
echo ""
echo "After setting REACT_APP_API_URL, redeploy to rebuild frontend:"
echo "  git commit --allow-empty -m 'Trigger rebuild with correct env vars'"
echo "  git push origin railway-deploy-clean"
echo ""
