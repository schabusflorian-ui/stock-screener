#!/bin/bash
# Check for sync SQLite usage that should be migrated to async pattern.
# Run in CI or before committing DB-related changes.
#
# Usage: ./check-sync-db-usage.sh [src_dir] [--warn]
#   --warn: Print violations but exit 0 (for migration phase)
#
# Allowed patterns: prepare/get/all are OK only in:
# - lib/db.js (defines the wrapper)
# - database.js (compat layer)
# - schemaManager.js (uses PRAGMA, special case)
# - Test files (for now)

set -e

SRC_DIR="src"
WARN_ONLY=false
for arg in "$@"; do
  if [ "$arg" = "--warn" ]; then
    WARN_ONLY=true
  elif [ -d "$arg" ]; then
    SRC_DIR="$arg"
  fi
done

EXIT_CODE=0

echo "Checking for sync DB usage in $SRC_DIR..."
[ "$WARN_ONLY" = true ] && echo "(warn-only mode – will not fail)"
echo ""

# Pattern: .prepare( - almost always sync SQLite
PREPARE_HITS=$(grep -r -n "\.prepare\s*(" "$SRC_DIR" --include="*.js" 2>/dev/null || true)
if [ -n "$PREPARE_HITS" ]; then
  # Filter out allowed files
  FILTERED=$(echo "$PREPARE_HITS" | grep -v "lib/db\.js" | grep -v "database\.js" | grep -v "schemaManager\.js" | grep -v "/test" | grep -v "\.test\.js" || true)
  if [ -n "$FILTERED" ]; then
    echo "ERROR: .prepare() usage detected (use database.query() instead):"
    echo "$FILTERED"
    echo ""
    EXIT_CODE=1
  fi
fi

# Pattern: getDatabaseSync - sync DB init
SYNC_HITS=$(grep -r -n "getDatabaseSync" "$SRC_DIR" --include="*.js" 2>/dev/null || true)
if [ -n "$SYNC_HITS" ]; then
  FILTERED=$(echo "$SYNC_HITS" | grep -v "lib/db\.js" | grep -v "database\.js" | grep -v "/test" | grep -v "\.test\.js" || true)
  if [ -n "$FILTERED" ]; then
    echo "ERROR: getDatabaseSync() usage detected (use getDatabaseAsync() instead):"
    echo "$FILTERED"
    echo ""
    EXIT_CODE=1
  fi
fi

if [ $EXIT_CODE -eq 0 ]; then
  echo "✓ No sync DB usage detected."
elif [ "$WARN_ONLY" = true ]; then
  echo "⚠ Violations found (warn-only mode)."
  EXIT_CODE=0
fi

exit $EXIT_CODE
