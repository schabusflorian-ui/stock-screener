#!/bin/bash
# scripts/backup-db.sh
# Database backup script for PostgreSQL

set -e

# Configuration
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
S3_BUCKET="${S3_BUCKET:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    log_error "DATABASE_URL environment variable is not set"
    echo ""
    echo "Usage:"
    echo "  DATABASE_URL=postgresql://user:pass@host:5432/dbname ./scripts/backup-db.sh"
    echo ""
    echo "Environment variables:"
    echo "  DATABASE_URL    - PostgreSQL connection string (required)"
    echo "  BACKUP_DIR      - Directory to store backups (default: ./backups)"
    echo "  RETENTION_DAYS  - Days to keep local backups (default: 7)"
    echo "  S3_BUCKET       - S3 bucket for remote backup (optional)"
    echo "  AWS_ACCESS_KEY_ID - AWS credentials for S3 (if using S3)"
    echo "  AWS_SECRET_ACCESS_KEY - AWS credentials for S3 (if using S3)"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

FILENAME="backup_${TIMESTAMP}.sql"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

log_info "Starting database backup..."
log_info "Timestamp: $TIMESTAMP"
log_info "Output: $FILEPATH.gz"

# Perform backup
log_info "Running pg_dump..."
if pg_dump "$DATABASE_URL" > "$FILEPATH"; then
    log_info "Database dump completed"
else
    log_error "pg_dump failed"
    exit 1
fi

# Compress backup
log_info "Compressing backup..."
if gzip "$FILEPATH"; then
    log_info "Compression completed"
    FILEPATH="${FILEPATH}.gz"
else
    log_error "Compression failed"
    exit 1
fi

# Get file size
FILESIZE=$(ls -lh "$FILEPATH" | awk '{print $5}')
log_info "Backup size: $FILESIZE"

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
    log_info "Uploading to S3: $S3_BUCKET"

    if command -v aws &> /dev/null; then
        if aws s3 cp "$FILEPATH" "s3://${S3_BUCKET}/backups/${FILENAME}.gz"; then
            log_info "S3 upload completed"
        else
            log_warn "S3 upload failed - backup saved locally"
        fi
    else
        log_warn "AWS CLI not installed - skipping S3 upload"
    fi
fi

# Clean up old local backups
log_info "Cleaning up backups older than $RETENTION_DAYS days..."
DELETED=$(find "$BACKUP_DIR" -name "backup_*.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    log_info "Deleted $DELETED old backup(s)"
fi

# Summary
echo ""
echo "=================================="
log_info "Backup completed successfully!"
echo "=================================="
echo "  File: $FILEPATH"
echo "  Size: $FILESIZE"
echo ""

# List recent backups
log_info "Recent backups:"
ls -lht "$BACKUP_DIR"/*.gz 2>/dev/null | head -5 || echo "  No backups found"
