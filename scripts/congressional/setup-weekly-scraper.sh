#!/bin/bash
# setup-weekly-scraper.sh
# Sets up weekly automated scraping of congressional trades

PROJECT_DIR="/Users/florianschabus/Investment Project"

echo "================================================================================"
echo "⏰ SETUP WEEKLY CONGRESSIONAL SCRAPER"
echo "================================================================================"
echo ""

# Check if cron is available
if ! command -v crontab &> /dev/null; then
    echo "❌ crontab not found"
    echo "   Cron may not be available on this system"
    exit 1
fi

echo "📋 Current crontab:"
crontab -l 2>/dev/null || echo "   (empty)"
echo ""

# Create the cron job entry
CRON_JOB="0 8 * * 1 cd \"$PROJECT_DIR\" && ./scrape-and-import.sh >> logs/weekly-scraper.log 2>&1"

echo "📝 Proposed cron job:"
echo "   $CRON_JOB"
echo ""
echo "   This will run:"
echo "   - Every Monday at 8:00 AM"
echo "   - Scrape latest trades from Capitol Trades"
echo "   - Convert and import to database"
echo "   - Log to: logs/weekly-scraper.log"
echo ""

read -p "❓ Add this cron job? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Get current crontab
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

    echo "✅ Cron job added!"
    echo ""
    echo "📋 Updated crontab:"
    crontab -l
    echo ""
    echo "================================================================================"
    echo "✅ WEEKLY SCRAPER CONFIGURED"
    echo "================================================================================"
    echo ""
    echo "📅 Schedule:"
    echo "   Every Monday at 8:00 AM"
    echo ""
    echo "🧪 Test manually:"
    echo "   ./scrape-and-import.sh"
    echo ""
    echo "📊 View logs:"
    echo "   tail -f logs/weekly-scraper.log"
    echo ""
    echo "📋 Edit cron:"
    echo "   crontab -e"
    echo ""
    echo "🗑️  Remove cron:"
    echo "   crontab -l | grep -v 'scrape-and-import' | crontab -"
    echo ""
else
    echo "❌ Cron job not added"
    echo ""
    echo "💡 To add manually:"
    echo "   1. Run: crontab -e"
    echo "   2. Add: $CRON_JOB"
    echo "   3. Save and exit"
fi

echo ""
