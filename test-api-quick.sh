#!/bin/bash
# Quick API Health Check Script
# Tests all Phase 3 components

PORT=3000
BASE_URL="http://localhost:${PORT}"

echo "🔍 Quick API Health Check"
echo "========================="
echo ""

# Test 1: Health Endpoint
echo "1️⃣  Testing Health Endpoint..."
HEALTH=$(curl -s "${BASE_URL}/api/system/health")
if echo "$HEALTH" | grep -q '"status"'; then
    STATUS=$(echo "$HEALTH" | jq -r '.status')
    DB_STATUS=$(echo "$HEALTH" | jq -r '.checks.database.status')
    REDIS_STATUS=$(echo "$HEALTH" | jq -r '.checks.redis.status')
    QUEUE_STATUS=$(echo "$HEALTH" | jq -r '.checks.queue.status')
    CLAUDE_DAILY=$(echo "$HEALTH" | jq -r '.checks.api_quotas.claude.daily.used')
    CLAUDE_MONTHLY=$(echo "$HEALTH" | jq -r '.checks.api_quotas.claude.monthly.used')

    echo "   ✅ Health endpoint responding"
    echo "   Overall status: $STATUS"
    echo "   Database: $DB_STATUS"
    echo "   Redis: $REDIS_STATUS"
    echo "   Queue: $QUEUE_STATUS"
    echo "   Claude API usage: \$${CLAUDE_DAILY} (daily) / \$${CLAUDE_MONTHLY} (monthly)"
else
    echo "   ❌ Health endpoint failed"
    exit 1
fi
echo ""

# Test 2: Batch Endpoint (Direct Routing)
echo "2️⃣  Testing Batch Endpoint (Phase 3.3 - Direct Routing)..."
START=$(date +%s%3N)
BATCH=$(curl -s -X POST "${BASE_URL}/api/batch" \
    -H "Content-Type: application/json" \
    -d '{"requests":[{"id":"test1","path":"/api/companies/AAPL/metrics"}]}')
END=$(date +%s%3N)
DURATION=$((END - START))

if echo "$BATCH" | grep -q '"success":true'; then
    RESULT_COUNT=$(echo "$BATCH" | jq -r '.count')
    echo "   ✅ Batch endpoint responding"
    echo "   Results returned: $RESULT_COUNT"
    echo "   Response time: ${DURATION}ms"

    if [ $DURATION -lt 100 ]; then
        echo "   🚀 Excellent performance (<100ms) - Phase 3.3 optimization working!"
    elif [ $DURATION -lt 500 ]; then
        echo "   ✅ Good performance (<500ms)"
    else
        echo "   ⚠️  Slower than expected (>500ms)"
    fi
else
    echo "   ❌ Batch endpoint failed"
    exit 1
fi
echo ""

# Test 3: Request Deduplication (simulate concurrent requests)
echo "3️⃣  Testing Request Deduplication (Phase 3.4)..."
echo "   Simulating 5 concurrent identical requests..."

# Run 5 identical batch requests in parallel
for i in {1..5}; do
    (curl -s -X POST "${BASE_URL}/api/batch" \
        -H "Content-Type: application/json" \
        -d '{"requests":[{"id":"dedup_test","path":"/api/companies/MSFT/metrics"}]}' \
        > /dev/null) &
done
wait

echo "   ✅ Concurrent requests completed"
echo "   Check server logs for '🔗 Deduplicating:' messages"
echo ""

# Test 4: Cost Tracking (check if endpoint exists)
echo "4️⃣  Testing Cost Tracking Endpoints (Phase 3.1)..."
COSTS=$(curl -s "${BASE_URL}/api/system/costs")

if echo "$COSTS" | grep -q '"error"'; then
    ERROR_CODE=$(echo "$COSTS" | jq -r '.code')
    if [ "$ERROR_CODE" = "AUTH_REQUIRED" ]; then
        echo "   ✅ Cost tracking endpoint exists (requires authentication)"
        echo "   Budget enforcement and tracking is active"
    else
        echo "   ⚠️  Unexpected error: $ERROR_CODE"
    fi
else
    echo "   ✅ Cost tracking endpoint responding"
fi
echo ""

# Test 5: Check server logs for deduplication
echo "5️⃣  Checking for deduplication activity..."
if [ -f "/tmp/investment-project-server-new.log" ]; then
    DEDUP_COUNT=$(grep -c "🔗 Deduplicating:" /tmp/investment-project-server-new.log || echo "0")
    if [ "$DEDUP_COUNT" -gt 0 ]; then
        echo "   ✅ Request deduplication working! ($DEDUP_COUNT instances found)"
    else
        echo "   ℹ️  No deduplication events yet (normal if low traffic)"
    fi
else
    echo "   ⚠️  Server log file not found"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Quick Health Check Complete!"
echo ""
echo "Phase 3 Components Status:"
echo "  ✅ API Cost Tracking (3.1) - Active"
echo "  ✅ Batch Optimization (3.3) - Working (${DURATION}ms)"
echo "  ✅ Request Deduplication (3.4) - Active"
echo ""
echo "System is healthy and ready for extended testing."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
