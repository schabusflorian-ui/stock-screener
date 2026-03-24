#!/bin/bash
# update-congressional-data.sh
# Regular update script for congressional trading data

set -e

PROJECT_DIR="/Users/florianschabus/Investment Project"
CSV_FILE="$PROJECT_DIR/data/congressional_trades.csv"
LOG_FILE="$PROJECT_DIR/logs/congressional-updates.log"
BACKUP_DIR="$PROJECT_DIR/data/backups"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$BACKUP_DIR"

# Timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Starting congressional data update..." | tee -a "$LOG_FILE"

# Check if CSV file exists
if [ ! -f "$CSV_FILE" ]; then
    echo "[$TIMESTAMP] ❌ CSV file not found: $CSV_FILE" | tee -a "$LOG_FILE"
    echo "[$TIMESTAMP] Please download from https://www.capitoltrades.com/trades" | tee -a "$LOG_FILE"
    exit 1
fi

# Check CSV age
CSV_AGE_DAYS=$(( ($(date +%s) - $(stat -f %m "$CSV_FILE")) / 86400 ))

if [ $CSV_AGE_DAYS -gt 7 ]; then
    echo "[$TIMESTAMP] ⚠️  CSV file is $CSV_AGE_DAYS days old" | tee -a "$LOG_FILE"
    echo "[$TIMESTAMP] Consider downloading fresh data from Capitol Trades" | tee -a "$LOG_FILE"
fi

# Backup current database
BACKUP_FILE="$BACKUP_DIR/stocks_$(date '+%Y%m%d_%H%M%S').db"
cp "$PROJECT_DIR/data/stocks.db" "$BACKUP_FILE"
echo "[$TIMESTAMP] ✅ Database backed up to: $BACKUP_FILE" | tee -a "$LOG_FILE"

# Run import
cd "$PROJECT_DIR"
python3 python-services/capitol_trades_csv_importer.py 2>&1 | tee -a "$LOG_FILE"

# Check exit code
if [ $? -eq 0 ]; then
    echo "[$TIMESTAMP] ✅ Congressional data update complete" | tee -a "$LOG_FILE"

    # Clean up old backups (keep last 7 days)
    find "$BACKUP_DIR" -name "stocks_*.db" -mtime +7 -delete
    echo "[$TIMESTAMP] 🧹 Cleaned up old backups" | tee -a "$LOG_FILE"
else
    echo "[$TIMESTAMP] ❌ Congressional data update failed" | tee -a "$LOG_FILE"
    exit 1
fi

echo "[$TIMESTAMP] Done" | tee -a "$LOG_FILE"
