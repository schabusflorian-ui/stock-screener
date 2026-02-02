#!/bin/bash
# Custom Factors ML Integration - Validation Script

echo "🔍 Validating Custom Factors ML Integration..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $1 - NOT FOUND"
    ((FAILED++))
  fi
}

check_content() {
  if grep -q "$2" "$1" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $3"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $3 - NOT FOUND"
    ((FAILED++))
  fi
}

echo "📁 Checking Backend Files..."
check_file "src/services/ml/trainingDataAssembler.js"
check_content "src/services/ml/trainingDataAssembler.js" "getAvailableCustomFactors" "  - getAvailableCustomFactors() method"
check_content "src/services/ml/trainingDataAssembler.js" "customFactorIds = \[\]" "  - customFactorIds parameter support"

check_file "src/services/ml/signalCombiner.js"
check_content "src/services/ml/signalCombiner.js" "customFactorIds" "  - signalCombiner customFactorIds support"

check_file "src/api/routes/validation.js"
check_content "src/api/routes/validation.js" "/ml/available-factors" "  - /ml/available-factors endpoint"
check_content "src/api/routes/validation.js" "customFactorIds" "  - /ml/train customFactorIds parameter"

check_file "src/api/routes/factors.js"
check_content "src/api/routes/factors.js" "/backfill" "  - POST /api/factors/backfill endpoint"
check_content "src/api/routes/factors.js" "backfill-status" "  - GET /api/factors/:id/backfill-status endpoint"

echo ""
echo "📁 Checking Frontend Files..."
check_file "frontend/src/services/api.js"
check_content "frontend/src/services/api.js" "factorsAPI.*backfill" "  - factorsAPI.backfill() function"
check_content "frontend/src/services/api.js" "getAvailableFactors" "  - mlCombinerAPI.getAvailableFactors() function"

check_file "frontend/src/components/research/QuantWorkbench/BackfillPanel.js"
check_content "frontend/src/components/research/QuantWorkbench/BackfillPanel.js" "BackfillPanel" "  - BackfillPanel component export"

check_file "frontend/src/components/agents/MLCombinerPanel.js"
check_content "frontend/src/components/agents/MLCombinerPanel.js" "availableFactors" "  - MLCombinerPanel custom factors state"
check_content "frontend/src/components/agents/MLCombinerPanel.js" "custom-factors-list" "  - Custom factors list UI"

check_file "frontend/src/components/research/QuantWorkbench/index.js"
check_content "frontend/src/components/research/QuantWorkbench/index.js" "BackfillPanel" "  - BackfillPanel import"

check_file "frontend/src/components/research/QuantWorkbench/QuantWorkbench.css"
check_content "frontend/src/components/research/QuantWorkbench/QuantWorkbench.css" "backfill-panel" "  - BackfillPanel styles"

check_file "frontend/src/components/agents/MLCombinerPanel.css"
check_content "frontend/src/components/agents/MLCombinerPanel.css" "custom-factors-list" "  - Custom factor selection styles"

echo ""
echo "📁 Checking Documentation..."
check_file "CUSTOM_FACTORS_ML_INTEGRATION.md"
check_file "CUSTOM_FACTORS_VALIDATION.md"

echo ""
echo "📊 Summary:"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All validation checks passed!${NC}"
  echo "Ready to start server and test in browser."
  exit 0
else
  echo -e "${RED}✗ Some validation checks failed.${NC}"
  echo "Please review missing files/content above."
  exit 1
fi
