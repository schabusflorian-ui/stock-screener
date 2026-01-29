#!/bin/bash
# 1-Hour API Server Monitoring Script
# Tests all Phase 3 components and monitors system health

PORT=3000
BASE_URL="http://localhost:${PORT}"
LOG_FILE="/tmp/api-monitoring-$(date +%Y%m%d-%H%M%S).log"
START_TIME=$(date +%s)
END_TIME=$((START_TIME + 3600)) # 1 hour from now
CHECK_INTERVAL=60 # Check every 60 seconds

echo "🔍 Starting 1-Hour API Server Monitoring" | tee -a "$LOG_FILE"
echo "Start Time: $(date)" | tee -a "$LOG_FILE"
echo "Log File: $LOG_FILE" | tee -a "$LOG_FILE"
echo "Server: $BASE_URL" | tee -a "$LOG_FILE"
echo "Duration: 60 minutes" | tee -a "$LOG_FILE"
echo "Check Interval: ${CHECK_INTERVAL}s" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Counters
TOTAL_CHECKS=0
SUCCESSFUL_CHECKS=0
FAILED_CHECKS=0

# Function to check health endpoint
check_health() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
    echo "🏥 Health Check #$TOTAL_CHECKS - $(date)" | tee -a "$LOG_FILE"

    RESPONSE=$(curl -s "${BASE_URL}/api/system/health" 2>&1)
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ] && echo "$RESPONSE" | grep -q '"status"'; then
        STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
        echo "✅ Health endpoint responding" | tee -a "$LOG_FILE"
        echo "   Status: $STATUS" | tee -a "$LOG_FILE"

        # Check individual components
        DB_STATUS=$(echo "$RESPONSE" | jq -r '.checks.database.status // "unknown"' 2>/dev/null)
        JOBS_STATUS=$(echo "$RESPONSE" | jq -r '.checks.jobs.status // "unknown"' 2>/dev/null)
        QUEUE_STATUS=$(echo "$RESPONSE" | jq -r '.checks.queue.status // "unknown"' 2>/dev/null)

        echo "   Database: $DB_STATUS" | tee -a "$LOG_FILE"
        echo "   Jobs: $JOBS_STATUS" | tee -a "$LOG_FILE"
        echo "   Queue: $QUEUE_STATUS" | tee -a "$LOG_FILE"

        return 0
    else
        echo "❌ Health endpoint failed" | tee -a "$LOG_FILE"
        echo "   Error: $RESPONSE" | tee -a "$LOG_FILE"
        return 1
    fi
}

# Function to check cost tracking
check_costs() {
    echo "" | tee -a "$LOG_FILE"
    echo "💰 Cost Tracking Check - $(date)" | tee -a "$LOG_FILE"

    RESPONSE=$(curl -s "${BASE_URL}/api/system/costs" 2>&1)
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ] && echo "$RESPONSE" | grep -q '"providers"'; then
        echo "✅ Cost tracking endpoint responding" | tee -a "$LOG_FILE"

        # Extract Claude budget info
        CLAUDE_DAILY_USED=$(echo "$RESPONSE" | jq -r '.providers.claude.daily.used // 0' 2>/dev/null)
        CLAUDE_DAILY_LIMIT=$(echo "$RESPONSE" | jq -r '.providers.claude.daily.limit // 0' 2>/dev/null)
        CLAUDE_MONTHLY_USED=$(echo "$RESPONSE" | jq -r '.providers.claude.monthly.used // 0' 2>/dev/null)
        CLAUDE_MONTHLY_LIMIT=$(echo "$RESPONSE" | jq -r '.providers.claude.monthly.limit // 0' 2>/dev/null)

        echo "   Claude API:" | tee -a "$LOG_FILE"
        echo "   - Daily: \$${CLAUDE_DAILY_USED} / \$${CLAUDE_DAILY_LIMIT}" | tee -a "$LOG_FILE"
        echo "   - Monthly: \$${CLAUDE_MONTHLY_USED} / \$${CLAUDE_MONTHLY_LIMIT}" | tee -a "$LOG_FILE"

        return 0
    else
        echo "❌ Cost tracking endpoint failed" | tee -a "$LOG_FILE"
        echo "   Error: $RESPONSE" | tee -a "$LOG_FILE"
        return 1
    fi
}

# Function to test batch endpoint
test_batch() {
    echo "" | tee -a "$LOG_FILE"
    echo "📦 Batch Endpoint Test - $(date)" | tee -a "$LOG_FILE"

    # Test with a simple batch request
    PAYLOAD='{"requests":[{"id":"test1","path":"/api/companies/AAPL/metrics"}]}'

    START_MS=$(date +%s%3N)
    RESPONSE=$(curl -s -X POST "${BASE_URL}/api/batch" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>&1)
    END_MS=$(date +%s%3N)
    DURATION=$((END_MS - START_MS))
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ] && echo "$RESPONSE" | grep -q '"success"'; then
        SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false' 2>/dev/null)

        if [ "$SUCCESS" = "true" ]; then
            echo "✅ Batch endpoint responding" | tee -a "$LOG_FILE"
            echo "   Response time: ${DURATION}ms" | tee -a "$LOG_FILE"

            if [ $DURATION -lt 100 ]; then
                echo "   🚀 Excellent performance (<100ms)" | tee -a "$LOG_FILE"
            fi

            return 0
        else
            echo "⚠️  Batch request completed but returned success=false" | tee -a "$LOG_FILE"
            return 1
        fi
    else
        echo "❌ Batch endpoint failed" | tee -a "$LOG_FILE"
        echo "   Error: $RESPONSE" | tee -a "$LOG_FILE"
        return 1
    fi
}

# Function to check server logs for errors
check_logs() {
    echo "" | tee -a "$LOG_FILE"
    echo "📋 Recent Server Logs - $(date)" | tee -a "$LOG_FILE"

    if [ -f "/tmp/investment-project-server.log" ]; then
        # Check for errors in last 60 seconds
        RECENT_ERRORS=$(tail -100 /tmp/investment-project-server.log | grep -i "error\|fail\|exception" | tail -5)

        if [ -n "$RECENT_ERRORS" ]; then
            echo "⚠️  Recent errors detected:" | tee -a "$LOG_FILE"
            echo "$RECENT_ERRORS" | tee -a "$LOG_FILE"
        else
            echo "✅ No errors in recent logs" | tee -a "$LOG_FILE"
        fi
    else
        echo "⚠️  Server log file not found" | tee -a "$LOG_FILE"
    fi
}

# Main monitoring loop
echo "Starting monitoring loop..." | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

while [ $(date +%s) -lt $END_TIME ]; do
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))

    # Run all checks
    CHECKS_PASSED=0

    if check_health; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    if check_costs; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    if test_batch; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    fi

    check_logs

    # Update counters
    if [ $CHECKS_PASSED -eq 3 ]; then
        SUCCESSFUL_CHECKS=$((SUCCESSFUL_CHECKS + 1))
        echo "" | tee -a "$LOG_FILE"
        echo "✅ All checks passed (${CHECKS_PASSED}/3)" | tee -a "$LOG_FILE"
    else
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
        echo "" | tee -a "$LOG_FILE"
        echo "⚠️  Some checks failed (${CHECKS_PASSED}/3)" | tee -a "$LOG_FILE"
    fi

    # Calculate time remaining
    CURRENT_TIME=$(date +%s)
    TIME_REMAINING=$((END_TIME - CURRENT_TIME))
    MINUTES_REMAINING=$((TIME_REMAINING / 60))

    echo "" | tee -a "$LOG_FILE"
    echo "📊 Progress: Check ${TOTAL_CHECKS} complete | ${MINUTES_REMAINING} minutes remaining" | tee -a "$LOG_FILE"
    echo "   Success rate: ${SUCCESSFUL_CHECKS}/${TOTAL_CHECKS} ($(( SUCCESSFUL_CHECKS * 100 / TOTAL_CHECKS ))%)" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"

    # Wait for next check
    if [ $TIME_REMAINING -gt $CHECK_INTERVAL ]; then
        echo "⏳ Waiting ${CHECK_INTERVAL}s until next check..." | tee -a "$LOG_FILE"
        sleep $CHECK_INTERVAL
    else
        # Last check - wait remaining time
        if [ $TIME_REMAINING -gt 0 ]; then
            echo "⏳ Final wait (${TIME_REMAINING}s)..." | tee -a "$LOG_FILE"
            sleep $TIME_REMAINING
        fi
        break
    fi
done

# Final summary
echo "" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "📊 1-Hour Monitoring Complete!" | tee -a "$LOG_FILE"
echo "End Time: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Summary:" | tee -a "$LOG_FILE"
echo "  Total Checks: $TOTAL_CHECKS" | tee -a "$LOG_FILE"
echo "  Successful: $SUCCESSFUL_CHECKS" | tee -a "$LOG_FILE"
echo "  Failed: $FAILED_CHECKS" | tee -a "$LOG_FILE"
echo "  Success Rate: $(( SUCCESSFUL_CHECKS * 100 / TOTAL_CHECKS ))%" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [ $FAILED_CHECKS -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED - System is stable and ready for deployment!" | tee -a "$LOG_FILE"
    exit 0
elif [ $FAILED_CHECKS -lt 3 ]; then
    echo "⚠️  System mostly stable with minor issues (${FAILED_CHECKS} failures)" | tee -a "$LOG_FILE"
    exit 0
else
    echo "❌ System has significant issues (${FAILED_CHECKS} failures)" | tee -a "$LOG_FILE"
    exit 1
fi
