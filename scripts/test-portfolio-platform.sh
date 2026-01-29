#!/bin/bash
# Portfolio Platform Integration Test Script
# Tests all major endpoints across Agent 1, 2, and 3 components

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASSED=0
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo "=============================================="
    echo "$1"
    echo "=============================================="
}

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_field="$5"

    printf "Testing: %-50s " "$name"

    if [ "$method" = "GET" ]; then
        response=$(curl -s --max-time 10 "$BASE_URL$endpoint" 2>/dev/null || echo "timeout")
    else
        response=$(curl -s --max-time 10 -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null || echo "timeout")
    fi

    # Check if response contains expected field
    if echo "$response" | grep -q "$expected_field"; then
        echo -e "${GREEN}PASS${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}FAIL${NC}"
        echo "  Response: ${response:0:200}..."
        FAILED=$((FAILED + 1))
    fi
}

# Check if server is running
echo ""
echo "Portfolio Platform Integration Tests"
echo "====================================="
echo "Base URL: $BASE_URL"
echo ""

printf "Checking server health... "
health=$(curl -s "$BASE_URL/api/health" 2>/dev/null || echo "")
if echo "$health" | grep -q "ok"; then
    echo -e "${GREEN}Server is running${NC}"
else
    echo -e "${RED}Server not responding. Please start the API server first.${NC}"
    echo "Run: node src/api/server.js"
    exit 1
fi

# ============================================
# Agent 1: Core Portfolio Engine Tests
# ============================================
print_header "Agent 1: Core Portfolio Engine"

test_endpoint "List portfolios" "GET" "/api/portfolios" "" "success"
test_endpoint "Get portfolio summaries" "GET" "/api/portfolios/summaries" "" "summaries"

# Create a test portfolio
echo ""
echo "Creating test portfolio..."
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/portfolios" \
    -H "Content-Type: application/json" \
    -d '{"name":"Integration Test Portfolio","initialCash":100000,"description":"Created by test script"}')

PORTFOLIO_ID=$(echo "$CREATE_RESPONSE" | grep -o '"portfolioId":[0-9]*' | grep -o '[0-9]*' || echo "")

if [ -n "$PORTFOLIO_ID" ]; then
    echo -e "${GREEN}Created portfolio with ID: $PORTFOLIO_ID${NC}"

    test_endpoint "Get portfolio details" "GET" "/api/portfolios/$PORTFOLIO_ID" "" "portfolio"
    test_endpoint "Get portfolio positions" "GET" "/api/portfolios/$PORTFOLIO_ID/positions" "" "positions"
    test_endpoint "Get portfolio transactions" "GET" "/api/portfolios/$PORTFOLIO_ID/transactions" "" "transactions"
    test_endpoint "Get portfolio orders" "GET" "/api/portfolios/$PORTFOLIO_ID/orders" "" "orders"
    test_endpoint "Get portfolio alerts" "GET" "/api/portfolios/$PORTFOLIO_ID/alerts" "" "alerts"
    test_endpoint "Get alert settings" "GET" "/api/portfolios/$PORTFOLIO_ID/alert-settings" "" "settings"

    # Test trading (need a valid company ID)
    # Get a company ID first
    COMPANY=$(curl -s "$BASE_URL/api/companies?limit=1")
    COMPANY_ID=$(echo "$COMPANY" | grep -o '"id":[0-9]*' | head -1 | grep -o '[0-9]*' || echo "1")

    if [ -n "$COMPANY_ID" ]; then
        test_endpoint "Execute buy trade" "POST" "/api/portfolios/$PORTFOLIO_ID/trade" \
            "{\"companyId\":$COMPANY_ID,\"side\":\"buy\",\"shares\":10,\"pricePerShare\":150}" "success"

        test_endpoint "Validate trade" "POST" "/api/portfolios/$PORTFOLIO_ID/validate-trade" \
            "{\"companyId\":$COMPANY_ID,\"side\":\"buy\",\"shares\":5,\"price\":100}" "valid"
    fi

    # Test snapshots
    test_endpoint "Take snapshot" "POST" "/api/portfolios/$PORTFOLIO_ID/snapshots" \
        "{}" "success"
    test_endpoint "Get snapshots" "GET" "/api/portfolios/$PORTFOLIO_ID/snapshots" "" "snapshots"

    # Clean up - delete the test portfolio
    echo ""
    echo "Cleaning up test portfolio..."
    curl -s -X DELETE "$BASE_URL/api/portfolios/$PORTFOLIO_ID" > /dev/null
    echo -e "${GREEN}Deleted test portfolio${NC}"
else
    echo -e "${YELLOW}Skipping portfolio-specific tests (could not create test portfolio)${NC}"
fi

# ============================================
# Agent 2: Analytics & Simulation Tests
# ============================================
print_header "Agent 2: Analytics & Simulation"

test_endpoint "Get simulation methods" "GET" "/api/simulate/methods" "" "positionSizing"
test_endpoint "Get stress test scenarios" "GET" "/api/simulate/stress-test/scenarios" "" "data"
test_endpoint "Get rebalance templates" "GET" "/api/simulate/rebalance-templates" "" "data"
test_endpoint "List backtests" "GET" "/api/simulate/backtests" "" "data"
test_endpoint "List Monte Carlo simulations" "GET" "/api/simulate/monte-carlo" "" "data"

# Test backtest
test_endpoint "Run backtest" "POST" "/api/simulate/backtest" \
    '{"allocations":[{"symbol":"AAPL","weight":0.5},{"symbol":"MSFT","weight":0.5}],"startDate":"2023-01-01","endDate":"2023-12-31","initialValue":10000}' \
    "totalReturnPct"

# Test position sizing
test_endpoint "Calculate position size" "POST" "/api/simulate/position-size" \
    '{"method":"fixed_risk","portfolioValue":100000,"entryPrice":150,"stopLossPrice":140}' \
    "shares"

# Test risk/reward analysis
test_endpoint "Analyze risk/reward" "POST" "/api/simulate/risk-reward" \
    '{"entryPrice":100,"stopLossPrice":90,"takeProfitPrice":120}' \
    "riskRewardRatio"

# ============================================
# Agent 3: Investors & 13F Tests
# ============================================
print_header "Agent 3: Famous Investors & 13F"

test_endpoint "List investors" "GET" "/api/investors" "" "investors"
test_endpoint "Get investor details" "GET" "/api/investors/1" "" "investor"
test_endpoint "Get investor holdings" "GET" "/api/investors/1/holdings" "" "holdings"
test_endpoint "Get investor changes" "GET" "/api/investors/1/changes" "" "changes"
test_endpoint "Get investor history" "GET" "/api/investors/1/history" "" "history"
test_endpoint "Get investor stats" "GET" "/api/investors/1/stats" "" "stats"
test_endpoint "Get most owned stocks" "GET" "/api/investors/most-owned" "" "stocks"
test_endpoint "Get investor activity" "GET" "/api/investors/activity" "" "activity"
test_endpoint "Clone preview" "GET" "/api/investors/1/clone-preview?amount=50000" "" "success"

# ============================================
# Cross-Component Integration Tests
# ============================================
print_header "Cross-Component Integration"

# Test that analytics can access portfolio data
test_endpoint "Portfolio performance (requires portfolio)" "GET" "/api/simulate/portfolios/11/performance" "" "portfolioId"
test_endpoint "Portfolio allocation" "GET" "/api/simulate/portfolios/11/allocation" "" "portfolioId"
test_endpoint "Portfolio correlation" "GET" "/api/simulate/portfolios/11/correlation" "" "success"
test_endpoint "Portfolio diversification" "GET" "/api/simulate/portfolios/11/diversification" "" "portfolioId"

# ============================================
# Summary
# ============================================
print_header "Test Summary"

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "Total Tests: $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}Some tests failed. Check the output above for details.${NC}"
    exit 1
fi
