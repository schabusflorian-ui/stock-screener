#!/bin/bash
# scrape-and-import.sh
# Complete workflow: Scrape → Convert → Import → Verify

set -e

PROJECT_DIR="/Users/florianschabus/Investment Project"
SCRAPED_CSV="$PROJECT_DIR/data/congressional_trades.csv"
FORMATTED_CSV="$PROJECT_DIR/data/congressional_trades_formatted.csv"
BACKUP_DIR="$PROJECT_DIR/data/backups"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/scrape-import.log"

# Create directories
mkdir -p "$BACKUP_DIR" "$LOG_DIR"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "================================================================================"
log "🤖 SCRAPE & IMPORT CONGRESSIONAL TRADES"
log "================================================================================"

cd "$PROJECT_DIR"

# Step 1: Backup database
log "📦 Step 1: Backing up database..."
BACKUP_FILE="$BACKUP_DIR/stocks_$(date '+%Y%m%d_%H%M%S').db"
cp "$PROJECT_DIR/data/stocks.db" "$BACKUP_FILE"
log "   ✅ Backup: $BACKUP_FILE"

# Step 2: Scrape Capitol Trades
log ""
log "🌐 Step 2: Scraping Capitol Trades..."

if python3 python-services/capitol_trades_table_scraper.py --headless --pages 1 2>&1 | tee -a "$LOG_FILE"; then
    log "   ✅ Scraping successful"
else
    log "   ❌ Scraping failed"
    exit 1
fi

# Step 3: Convert CSV format
log ""
log "🔄 Step 3: Converting CSV format..."

if [ -f "$SCRAPED_CSV" ]; then
    if python3 python-services/convert_scraped_csv.py --input "$SCRAPED_CSV" --output "$FORMATTED_CSV" 2>&1 | tee -a "$LOG_FILE"; then
        log "   ✅ Conversion successful"
    else
        log "   ❌ Conversion failed"
        exit 1
    fi
else
    log "   ❌ Scraped CSV not found: $SCRAPED_CSV"
    exit 1
fi

# Step 4: Import to database
log ""
log "📥 Step 4: Importing to database..."

if [ -f "$FORMATTED_CSV" ]; then
    if python3 python-services/capitol_trades_csv_importer.py "$FORMATTED_CSV" 2>&1 | tee -a "$LOG_FILE"; then
        log "   ✅ Import successful"
    else
        log "   ❌ Import failed"
        exit 1
    fi
else
    log "   ❌ Formatted CSV not found: $FORMATTED_CSV"
    exit 1
fi

# Step 5: Verify data
log ""
log "✅ Step 5: Verifying data..."
if command -v node &> /dev/null; then
    node check-congressional-freshness.js 2>&1 | tee -a "$LOG_FILE"
else
    log "   ⚠️  Node.js not found - skipping verification"
fi

# Step 6: Cleanup old backups
log ""
log "🧹 Step 6: Cleaning up old backups..."
find "$BACKUP_DIR" -name "stocks_*.db" -mtime +7 -delete 2>/dev/null || true
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "stocks_*.db" | wc -l)
log "   ✅ Backups remaining: $BACKUP_COUNT"

log ""
log "================================================================================"
log "✅ SCRAPE & IMPORT COMPLETE"
log "================================================================================"
log ""

exit 0
