#!/bin/bash
# auto-update-congressional.sh
# Fully automated congressional trading data update
# Scrapes Capitol Trades website and imports to database

set -e  # Exit on error

PROJECT_DIR="/Users/florianschabus/Investment Project"
BACKUP_DIR="$PROJECT_DIR/data/backups"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/congressional-auto-updates.log"
CSV_FILE="$PROJECT_DIR/data/congressional_trades.csv"

# Create directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$LOG_DIR"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "================================================================================"
log "🤖 AUTOMATED CONGRESSIONAL DATA UPDATE"
log "================================================================================"

cd "$PROJECT_DIR"

# Step 1: Backup current database
log "📦 Step 1: Backing up database..."
BACKUP_FILE="$BACKUP_DIR/stocks_$(date '+%Y%m%d_%H%M%S').db"
cp "$PROJECT_DIR/data/stocks.db" "$BACKUP_FILE"
log "   ✅ Backup saved: $BACKUP_FILE"

# Step 2: Try to scrape Capitol Trades
log ""
log "🌐 Step 2: Attempting to scrape Capitol Trades website..."

if command -v python3 &> /dev/null; then
    # Check if selenium is installed
    if python3 -c "import selenium" 2>/dev/null; then
        log "   ✅ Selenium installed - attempting scrape..."

        if python3 python-services/capitol_trades_scraper.py --headless 2>&1 | tee -a "$LOG_FILE"; then
            log "   ✅ Scraping successful!"
            SCRAPE_SUCCESS=true
        else
            log "   ⚠️  Scraping failed - will try API methods"
            SCRAPE_SUCCESS=false
        fi
    else
        log "   ⚠️  Selenium not installed"
        log "   Install with: pip3 install selenium webdriver-manager"
        SCRAPE_SUCCESS=false
    fi
else
    log "   ❌ Python3 not found"
    SCRAPE_SUCCESS=false
fi

# Step 3: If scraping failed, try API methods
if [ "$SCRAPE_SUCCESS" != true ]; then
    log ""
    log "🔄 Step 3: Trying API methods..."

    # Try QuiverQuant (best quality)
    if [ -n "$QUIVER_API_KEY" ]; then
        log "   📡 QuiverQuant API key found - fetching..."
        if python3 python-services/congressional_trading_fetcher.py 2>&1 | tee -a "$LOG_FILE"; then
            log "   ✅ QuiverQuant fetch successful!"
            API_SUCCESS=true
        else
            log "   ⚠️  QuiverQuant fetch failed"
            API_SUCCESS=false
        fi

    # Try FMP
    elif [ -n "$FMP_API_KEY" ]; then
        log "   📡 FMP API key found - fetching..."
        if python3 python-services/congressional_auto_fetcher.py --source fmp 2>&1 | tee -a "$LOG_FILE"; then
            log "   ✅ FMP fetch successful!"
            API_SUCCESS=true
        else
            log "   ⚠️  FMP fetch failed"
            API_SUCCESS=false
        fi

    # Try Apify
    elif [ -n "$APIFY_API_KEY" ]; then
        log "   📡 Apify API key found - fetching..."
        if python3 python-services/congressional_auto_fetcher.py --source apify 2>&1 | tee -a "$LOG_FILE"; then
            log "   ✅ Apify fetch successful!"
            API_SUCCESS=true
        else
            log "   ⚠️  Apify fetch failed"
            API_SUCCESS=false
        fi

    # Try Finnhub
    elif [ -n "$FINNHUB_API_KEY" ]; then
        log "   📡 Finnhub API key found - fetching..."
        if python3 python-services/congressional_auto_fetcher.py --source finnhub --days 90 2>&1 | tee -a "$LOG_FILE"; then
            log "   ✅ Finnhub fetch successful!"
            API_SUCCESS=true
        else
            log "   ⚠️  Finnhub fetch failed"
            API_SUCCESS=false
        fi

    else
        log "   ❌ No API keys found"
        log "   Set one of: QUIVER_API_KEY, FMP_API_KEY, APIFY_API_KEY, FINNHUB_API_KEY"
        API_SUCCESS=false
    fi

    if [ "$API_SUCCESS" != true ]; then
        log ""
        log "❌ All automated methods failed"
        log "   Manual intervention required:"
        log "   1. Download CSV from: https://www.capitoltrades.com/trades"
        log "   2. Save to: $CSV_FILE"
        log "   3. Run: ./update-congressional-data.sh"
        exit 1
    fi
fi

# Step 4: Import CSV if it exists and scraping succeeded
if [ "$SCRAPE_SUCCESS" = true ] && [ -f "$CSV_FILE" ]; then
    log ""
    log "📥 Step 4: Importing CSV to database..."

    # Check CSV age
    if [ -f "$CSV_FILE" ]; then
        CSV_AGE_SECONDS=$(($(date +%s) - $(stat -f %m "$CSV_FILE" 2>/dev/null || stat -c %Y "$CSV_FILE")))
        CSV_AGE_DAYS=$((CSV_AGE_SECONDS / 86400))

        log "   CSV file age: $CSV_AGE_DAYS days"

        if [ $CSV_AGE_DAYS -gt 7 ]; then
            log "   ⚠️  WARNING: CSV is $CSV_AGE_DAYS days old"
        fi
    fi

    # Run importer
    if python3 python-services/capitol_trades_csv_importer.py 2>&1 | tee -a "$LOG_FILE"; then
        log "   ✅ Import successful!"
    else
        log "   ❌ Import failed"
        exit 1
    fi
fi

# Step 5: Verify data
log ""
log "✅ Step 5: Verifying data..."
if command -v node &> /dev/null; then
    node check-congressional-freshness.js 2>&1 | tee -a "$LOG_FILE"
else
    log "   ⚠️  Node.js not found - skipping verification"
    log "   Install Node.js to enable verification"
fi

# Step 6: Cleanup old backups (keep last 7 days)
log ""
log "🧹 Step 6: Cleaning up old backups..."
if [ -d "$BACKUP_DIR" ]; then
    find "$BACKUP_DIR" -name "stocks_*.db" -mtime +7 -delete 2>/dev/null || true
    BACKUP_COUNT=$(find "$BACKUP_DIR" -name "stocks_*.db" | wc -l)
    log "   ✅ Old backups cleaned. Current backups: $BACKUP_COUNT"
fi

log ""
log "================================================================================"
log "✅ AUTOMATED UPDATE COMPLETE"
log "================================================================================"
log ""

exit 0
