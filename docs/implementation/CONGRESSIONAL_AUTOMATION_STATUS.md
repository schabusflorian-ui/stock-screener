# Congressional Trading Data - Automation Status

## ✅ Current Setup

### Weekly Automation
**Status:** ✅ ACTIVE  
**Schedule:** Every Monday at 8:00 AM  
**Cron Expression:** `0 8 * * 1`

### What Happens Automatically
1. **Scrape** - Capitol Trades website (gets ~12 recent trades)
2. **Convert** - Transform CSV format for database compatibility
3. **Import** - Add new trades to database (with deduplication)
4. **Verify** - Check data freshness and quality
5. **Backup** - Database backup before each import (7-day retention)
6. **Log** - All activities logged to `logs/weekly-scraper.log`

---

## 📊 Current Database Status

**Last Updated:** 2026-01-12  
- **Total Trades:** 62
- **Politicians Tracked:** 11
- **Companies:** 18
- **Latest Trade:** 2026-01-11
- **Purchases:** 31 | **Sales:** 31

### Data Breakdown
- **Real Scraped Data:** 12 trades (from Capitol Trades)
- **Sample Data:** 50 trades (initial seed)
- **Deduplication:** ✅ Working (prevents corruption on re-imports)

---

## 📈 Historical Buildup Plan

### Target: 250+ trades in 8 weeks

| Week | Expected Total | New Trades/Week | Data Coverage |
|------|---------------|-----------------|---------------|
| Week 1 (Current) | 62 | - | Initial state |
| Week 2 | ~74 | 12 | 2 weeks |
| Week 3 | ~86 | 12 | 3 weeks |
| Week 4 | ~98 | 12 | 1 month |
| Week 6 | ~122 | 12 | 6 weeks |
| Week 8 | ~146 | 12 | 2 months |
| Week 12 | ~194 | 12 | 3 months |

**Note:** Actual numbers may vary based on congressional trading activity.

---

## 🔍 Monitoring Commands

### Check Automation Logs
```bash
# View latest scraping activity
tail -50 logs/weekly-scraper.log

# Watch log in real-time (during Monday 8am run)
tail -f logs/weekly-scraper.log

# Check detailed import logs
tail -100 logs/scrape-import.log
```

### Check Database Status
```bash
# Quick stats via API
curl -s http://localhost:3000/api/congressional/stats | python3 -m json.tool

# Full freshness report
node check-congressional-freshness.js

# Database query
sqlite3 data/stocks.db "SELECT COUNT(*) as trades, 
  MAX(transaction_date) as latest 
  FROM congressional_trades;"
```

### Manual Trigger (Testing)
```bash
# Run scraper manually
./scrape-and-import.sh

# View what was just imported
tail -100 logs/scrape-import.log
```

---

## 🛠️ Cron Job Management

### View Current Schedule
```bash
crontab -l
```

### Edit Schedule
```bash
crontab -e
```

### Remove Automation (if needed)
```bash
crontab -l | grep -v 'scrape-and-import' | crontab -
```

### Test Cron Job Manually
```bash
# Run the exact command cron will execute
cd "/Users/florianschabus/Investment Project" && ./scrape-and-import.sh >> logs/weekly-scraper.log 2>&1
```

---

## 📋 Maintenance

### Backup Management
- **Location:** `data/backups/stocks_YYYYMMDD_HHMMSS.db`
- **Retention:** 7 days (auto-cleanup)
- **Manual Restore:** `cp data/backups/stocks_20260112_*.db data/stocks.db`

### Disk Space Check
```bash
# Check backup directory size
du -h data/backups/

# Count backup files
ls -1 data/backups/*.db | wc -l
```

### Log Rotation (Optional)
```bash
# Archive old logs
gzip logs/weekly-scraper.log
mv logs/weekly-scraper.log.gz logs/archive/

# Clear current log
> logs/weekly-scraper.log
```

---

## 🎯 Integration Status

### Frontend
- ✅ CompanyPage displays congressional trades
- ✅ Shows last 6 months of activity
- ✅ Politician details (chamber, party)
- ✅ Transaction types (BUY/SELL)

### Backend API
- ✅ `/api/congressional/stats` - Overall statistics
- ✅ `/api/congressional/company/:ticker` - Company trades
- ✅ `/api/congressional/clusters` - Purchase clusters
- ✅ `/api/congressional/trades` - All trades with filters
- ✅ `/api/congressional/politicians` - Politician list

### Strategy Integration
- ✅ Congressional signals in `src/services/ml/congressionalTradingSignals.js`
- ✅ 9.7% weight in Benchmark_Deep Value strategy
- ✅ Purchase clusters = strong buy signals
- ✅ Bipartisan support = reduced political risk

---

## 📅 Next Milestones

- **Week 2 (Jan 19):** First automated scrape
- **Week 4 (Feb 2):** 100 trades milestone
- **Week 8 (Mar 2):** 150 trades milestone (sufficient for analysis)
- **Week 12 (Apr 6):** 200+ trades (robust dataset)

---

## ⚙️ Configuration Files

- `scrape-and-import.sh` - Main workflow script
- `setup-weekly-scraper.sh` - Cron setup helper
- `python-services/capitol_trades_table_scraper.py` - Web scraper
- `python-services/convert_scraped_csv.py` - CSV converter
- `python-services/capitol_trades_csv_importer.py` - Database importer
- `check-congressional-freshness.js` - Data quality checker

---

**Last Updated:** 2026-01-12 20:11  
**Next Scheduled Run:** Monday, January 19, 2026 at 8:00 AM
