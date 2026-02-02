#!/bin/bash
# Test Railway Deployment - PostgreSQL Compatibility Fixes
# Tests the 6 route files we've fixed so far

RAILWAY_URL="https://prism-invest.up.railway.app"

echo "🧪 Testing Railway Deployment - PostgreSQL Fixes"
echo "================================================"
echo ""

# Test 1: System Health
echo "1️⃣  Testing System Health Endpoint..."
HEALTH=$(curl -s "${RAILWAY_URL}/api/system/health")
if echo "$HEALTH" | grep -q "database"; then
    echo "✅ System health endpoint working"
    echo "$HEALTH" | jq '.checks.database.status' 2>/dev/null || echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1
else
    echo "❌ System health endpoint failed"
    echo "$HEALTH"
fi
echo ""

# Test 2: Help Articles
echo "2️⃣  Testing Help Articles Endpoint..."
HELP=$(curl -s "${RAILWAY_URL}/api/help/articles?limit=3")
if echo "$HELP" | grep -q "success"; then
    echo "✅ Help articles endpoint working"
    echo "$HELP" | jq '.data | length' 2>/dev/null || echo "Response received"
else
    echo "❌ Help articles endpoint failed"
    echo "$HELP"
fi
echo ""

# Test 3: Help Categories
echo "3️⃣  Testing Help Categories..."
CATEGORIES=$(curl -s "${RAILWAY_URL}/api/help/categories")
if echo "$CATEGORIES" | grep -q "success"; then
    echo "✅ Help categories endpoint working"
else
    echo "❌ Help categories endpoint failed"
    echo "$CATEGORIES"
fi
echo ""

# Test 4: Feedback Prompt Check
echo "4️⃣  Testing Feedback System..."
FEEDBACK=$(curl -s "${RAILWAY_URL}/api/feedback/prompt/should-show?promptType=welcome&sessionId=test-$(date +%s)")
if echo "$FEEDBACK" | grep -q "shouldShow"; then
    echo "✅ Feedback system endpoint working"
    echo "$FEEDBACK" | jq '.shouldShow' 2>/dev/null || echo "Response received"
else
    echo "❌ Feedback system endpoint failed"
    echo "$FEEDBACK"
fi
echo ""

# Test 5: Auth Status (should work even without auth)
echo "5️⃣  Testing Auth Status..."
AUTH=$(curl -s "${RAILWAY_URL}/api/auth/status")
if echo "$AUTH" | grep -q "authenticated"; then
    echo "✅ Auth endpoint working"
    echo "$AUTH" | jq '.authenticated' 2>/dev/null || echo "$AUTH"
else
    echo "❌ Auth endpoint failed"
    echo "$AUTH"
fi
echo ""

# Test 6: Index Service (from earlier fix)
echo "6️⃣  Testing Index Service..."
INDICES=$(curl -s "${RAILWAY_URL}/api/indices?limit=2")
if echo "$INDICES" | grep -q "success"; then
    echo "✅ Index service working"
    echo "$INDICES" | jq '.data | length' 2>/dev/null || echo "Response received"
else
    echo "❌ Index service failed"
    echo "$INDICES"
fi
echo ""

# Test 7: Dev Login (critical for accessing the app)
echo "7️⃣  Testing Dev Login Access..."
DEV_LOGIN=$(curl -sL -w "%{http_code}" -o /dev/null "${RAILWAY_URL}/api/auth/dev-login?secret=b63580db720d310380679fdbe9ccec39")
if [ "$DEV_LOGIN" = "302" ] || [ "$DEV_LOGIN" = "200" ]; then
    echo "✅ Dev login accessible (HTTP $DEV_LOGIN)"
else
    echo "⚠️  Dev login returned HTTP $DEV_LOGIN"
fi
echo ""

echo "================================================"
echo "✨ Testing Complete!"
echo ""
echo "Next Steps:"
echo "1. Review results above"
echo "2. Check Railway logs for any database errors"
echo "3. Test frontend at: ${RAILWAY_URL}"
echo "4. Use dev-login URL: ${RAILWAY_URL}/api/auth/dev-login?secret=b63580db720d310380679fdbe9ccec39"
echo ""
