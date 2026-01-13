#!/bin/bash
# Test Congressional Frontend Integration

echo "================================================================================================"
echo "🧪 TESTING CONGRESSIONAL FRONTEND INTEGRATION"
echo "================================================================================================"
echo ""

echo "1️⃣ Backend API Test"
echo "-------------------"
echo "Testing: http://localhost:3000/api/congressional/company/META"
curl -s "http://localhost:3000/api/congressional/company/META?days=180" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'✅ API Response: {len(data.get(\"trades\", []))} trades found for META')
if data.get('trades'):
    print(f'   Latest trade: {data[\"trades\"][0][\"transaction_date\"]}')
    print(f'   Politician: {data[\"trades\"][0][\"politician_name\"]}')
"
echo ""

echo "2️⃣ Frontend Code Check"
echo "----------------------"
if grep -q "congressionalAPI" "/Users/florianschabus/Investment Project/frontend/src/pages/CompanyPage.js"; then
    echo "✅ congressionalAPI imported in CompanyPage.js"
else
    echo "❌ congressionalAPI NOT found in CompanyPage.js"
fi

if grep -q "Congressional Trading" "/Users/florianschabus/Investment Project/frontend/src/pages/CompanyPage.js"; then
    echo "✅ Congressional Trading section added to CompanyPage.js"
else
    echo "❌ Congressional Trading section NOT found in CompanyPage.js"
fi

if grep -q "getCompanyTrades" "/Users/florianschabus/Investment Project/frontend/src/services/api.js"; then
    echo "✅ getCompanyTrades function exists in api.js"
else
    echo "❌ getCompanyTrades function NOT found in api.js"
fi
echo ""

echo "3️⃣ Sample Companies with Congressional Data"
echo "--------------------------------------------"
curl -s "http://localhost:3000/api/congressional/trades?limit=100" | python3 -c "
import sys, json
data = json.load(sys.stdin)
tickers = {}
for t in data['trades']:
    ticker = t.get('ticker')
    if ticker:
        tickers[ticker] = tickers.get(ticker, 0) + 1

print('Companies you can test:')
for ticker, count in sorted(tickers.items(), key=lambda x: x[1], reverse=True)[:5]:
    print(f'  • {ticker}: {count} trades')
    print(f'    URL: http://localhost:3001/company/{ticker}')
"
echo ""

echo "================================================================================================"
echo "📋 NEXT STEPS TO SEE DATA IN BROWSER"
echo "================================================================================================"
echo ""
echo "Option 1: Hard Refresh Browser"
echo "   1. Open http://localhost:3001/company/META"
echo "   2. Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows) to hard refresh"
echo "   3. Scroll down to see 'Congressional Trading (6 months)' section"
echo ""
echo "Option 2: Clear Browser Cache"
echo "   1. Open DevTools (F12 or Cmd+Option+I)"
echo "   2. Right-click the refresh button"
echo "   3. Select 'Empty Cache and Hard Reload'"
echo ""
echo "Option 3: Check Browser Console"
echo "   1. Open DevTools Console (F12 → Console tab)"
echo "   2. Look for 'Congressional API response:' log"
echo "   3. Should show: {trades: Array(X)}"
echo ""
echo "================================================================================================"
