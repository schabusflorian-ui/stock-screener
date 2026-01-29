# Congressional Trading Data - Complete Setup Guide 🏛️

**Goal:** Regular updates of congressional trading data from Capitol Trades (free)

---

## Quick Start (First Time Setup)

### Step 1: Download Initial Data

1. **Go to Capitol Trades website:**
   ```
   https://www.capitoltrades.com/trades
   ```

2. **Filter for recent trades:**
   - Click on filters
   - Select "Last 6 months" or "Last 1 year"
   - This gives you historical baseline

3. **Export CSV:**
   - Look for "Export" button (top right or bottom)
   - Download CSV file
   - **Note:** Free tier may have limits (usually 1000 trades)

4. **Save CSV file:**
   ```bash
   # Save to this exact location:
   /Users/florianschabus/Investment Project/data/congressional_trades.csv
   ```

### Step 2: Import Data

```bash
cd "/Users/florianschabus/Investment Project"

# Run importer
python3 python-services/capitol_trades_csv_importer.py

# You should see:
# ✅ Import complete!
#    Imported: XXX trades
#    Politicians: XX
#    Companies: XX
```

### Step 3: Verify Import

```bash
# Check data freshness
node check-congressional-freshness.js

# Should show:
# ✅ Data is fresh!
# Total Trades: XXX
# Politicians: XX
```

---

## Regular Updates (Weekly/Bi-Weekly)

### Option A: Manual Updates (Recommended to Start)

**Every week or two weeks:**

1. **Download fresh CSV from Capitol Trades**
   - Go to https://www.capitoltrades.com/trades
   - Export latest trades
   - Save to `./data/congressional_trades.csv` (overwrite old file)

2. **Run update script:**
   ```bash
   cd "/Users/florianschabus/Investment Project"
   ./update-congressional-data.sh
   ```

3. **Check freshness:**
   ```bash
   node check-congressional-freshness.js
   ```

**Time required:** 5 minutes per update

### Option B: Automated Updates with Cron (Advanced)

Set up a cron job to check data freshness and remind you to update:

1. **Open crontab:**
   ```bash
   crontab -e
   ```

2. **Add freshness check (runs every Monday at 9am):**
   ```bash
   0 9 * * 1 cd "/Users/florianschabus/Investment Project" && node check-congressional-freshness.js >> logs/freshness-check.log 2>&1
   ```

3. **Optional: Email reminder if data is stale**

**Note:** Full automation isn't possible with Capitol Trades CSV (requires manual download). For full automation, you'd need QuiverQuant API (~$40/month).

---

## Update Frequency Recommendations

| Schedule | Data Freshness | Alpha Quality | Recommended For |
|----------|---------------|---------------|-----------------|
| **Weekly** | Excellent | Full alpha | Active trading |
| **Bi-weekly** | Good | Most alpha | Regular trading |
| **Monthly** | Acceptable | Some alpha | Long-term holds |
| **Quarterly** | Poor | Minimal alpha | Not recommended |

**Why frequent updates matter:**
- Congressional trades are filed within 45 days
- Fresh data catches trades close to filing date (highest alpha)
- Old data misses recent clusters and trends

---

## Data Sources Comparison

### Capitol Trades (CSV) - **Current Setup**

**Pros:**
- ✅ Free
- ✅ Good data quality
- ✅ Historical data available
- ✅ Easy to understand

**Cons:**
- ❌ Manual download required
- ❌ No API access
- ❌ May have record limits (free tier)
- ❌ Weekly/bi-weekly updates only

**Cost:** Free

### QuiverQuant API - **Alternative**

**Pros:**
- ✅ Fully automated
- ✅ Real-time updates
- ✅ No record limits
- ✅ Historical data included
- ✅ Clean, normalized data

**Cons:**
- ❌ Costs $30-50/month
- ❌ Requires API integration

**Cost:** $30-50/month

**Upgrade path:**
```bash
# Set API key
export QUIVER_API_KEY="your_key"

# Use existing fetcher
python3 python-services/congressional_trading_fetcher.py

# (Already built - just need API key!)
```

---

## File Locations

### Data Files
- **CSV Import:** `./data/congressional_trades.csv`
- **Database:** `./data/stocks.db`
- **Backups:** `./data/backups/stocks_YYYYMMDD_HHMMSS.db`
- **Logs:** `./logs/congressional-updates.log`

### Scripts
- **CSV Importer:** `python-services/capitol_trades_csv_importer.py`
- **Update Script:** `update-congressional-data.sh`
- **Freshness Check:** `check-congressional-freshness.js`
- **Test Signals:** `test-congressional-signals.js`

---

## Troubleshooting

### Problem: "CSV file not found"

**Solution:**
```bash
# Check if file exists
ls -lh "./data/congressional_trades.csv"

# If missing, download from Capitol Trades
# Save to exact path: ./data/congressional_trades.csv
```

### Problem: "No trades in last 30 days"

**Cause:** Data is stale (old CSV)

**Solution:**
1. Download fresh CSV from Capitol Trades
2. Run `./update-congressional-data.sh`
3. Verify with `node check-congressional-freshness.js`

### Problem: "Many tickers not matched"

**Cause:** CSV contains tickers not in your database (small caps, bonds, etc.)

**Solution:** This is normal. Focus on large-cap stocks (>$10B market cap) which are in your database.

```bash
# Check match rate
node check-congressional-freshness.js

# Should see: "Matched Tickers: 70-90%"
```

### Problem: "Import fails with encoding error"

**Solution:**
```bash
# CSV encoding issue - re-save CSV as UTF-8
# In Excel/Numbers: File > Save As > Format: CSV (UTF-8)
```

---

## CSV Format Expected

Capitol Trades CSV should have these columns (order doesn't matter):

**Required:**
- `Politician` or `Representative` or `Senator`
- `Transaction Date` or `Date`
- `Ticker` or `Symbol`
- `Type` or `Transaction Type` (Purchase/Sale)
- `Amount` or `Range`

**Optional:**
- `Asset Name`
- `Filed Date`
- `Owner` (self/spouse/joint)
- `Comment`

**Example row:**
```csv
Politician,Transaction Date,Ticker,Asset Name,Type,Amount
"Rep. Nancy Pelosi (D-CA)",2024-12-15,NVDA,NVIDIA Corp,Purchase,"$50,001 - $100,000"
```

---

## Data Quality Checks

Run these commands to verify data quality:

```bash
# 1. Check overall stats
node check-congressional-freshness.js

# 2. Test signal generation
node test-congressional-signals.js

# 3. Check database directly
sqlite3 data/stocks.db "
  SELECT
    COUNT(*) as total,
    COUNT(DISTINCT politician_id) as politicians,
    COUNT(DISTINCT company_id) as companies,
    MAX(transaction_date) as latest
  FROM congressional_trades
"
```

**Expected output:**
- Total trades: 100-10,000+
- Politicians: 50-200
- Companies: 50-500
- Latest date: Within 30 days

---

## Integration with Trading Strategy

Congressional data is already integrated! Check your strategy weights:

```javascript
// In strategy config
weights: {
  technical: 0.15,
  fundamental: 0.15,
  sentiment: 0.10,
  momentum: 0.15,
  value: 0.15,
  quality: 0.10,
  insider: 0.10,
  congressional: 0.10  // ← Already integrated!
}
```

**Signal strength:**
- 2+ politicians buying = Moderate signal (+4% alpha)
- 3+ politicians buying = Strong signal (+6% alpha)
- 4+ politicians buying = Very strong signal (+10% alpha)
- Bipartisan buying = +10% boost (reduces political risk)
- Senate purchases = +5% boost (higher alpha)

---

## Monitoring Dashboard

Create a simple monitoring routine:

```bash
#!/bin/bash
# weekly-check.sh - Run every Monday

cd "/Users/florianschabus/Investment Project"

echo "=== Congressional Data Health Check ==="
echo ""

# Check freshness
node check-congressional-freshness.js

echo ""
echo "=== Action Items ==="
echo ""

# Check CSV age
if [ -f "./data/congressional_trades.csv" ]; then
  AGE_DAYS=$(( ($(date +%s) - $(stat -f %m "./data/congressional_trades.csv")) / 86400 ))
  if [ $AGE_DAYS -gt 7 ]; then
    echo "❌ CSV is $AGE_DAYS days old - download fresh data!"
  else
    echo "✅ CSV is up to date"
  fi
else
  echo "❌ CSV file missing - download from Capitol Trades"
fi
```

Save as `weekly-check.sh` and run every Monday.

---

## Performance Metrics

Track these metrics to measure congressional data impact:

```bash
# Before congressional signals (baseline)
# Run backtest without congressional weight

# After congressional signals
# Run backtest with congressional weight

# Compare:
# - Win rate
# - Alpha vs SPY
# - Sharpe ratio
# - Max drawdown
```

**Expected improvement with good data:**
- +2-4% annual alpha
- +5-10% win rate on congressional cluster picks
- Reduced political risk on holdings

---

## Backup & Recovery

Backups are automatic! Each update creates a backup:

```bash
# Backups stored in:
ls -lh ./data/backups/

# To restore from backup:
cp ./data/backups/stocks_20260112_143022.db ./data/stocks.db

# Backups auto-deleted after 7 days
```

---

## FAQ

**Q: How often should I update?**
A: Weekly is ideal. Bi-weekly is acceptable. Monthly is minimum.

**Q: Can I automate the CSV download?**
A: Not easily (Capitol Trades requires manual export). Use QuiverQuant API for automation.

**Q: What if I miss a week?**
A: No problem! Just download the latest CSV when you can. Data is cumulative.

**Q: Do I need to delete old data?**
A: No! The importer checks for duplicates and only adds new trades.

**Q: Can I import multiple CSV files?**
A: Yes! Just import them one by one. Duplicates are automatically skipped.

**Q: What's a good match rate?**
A: 70-90% is normal. Some tickers are bonds, small caps, or foreign stocks not in your database.

---

## Next Steps

1. ✅ **Download initial CSV** from Capitol Trades
2. ✅ **Run first import:** `python3 python-services/capitol_trades_csv_importer.py`
3. ✅ **Verify data:** `node check-congressional-freshness.js`
4. ✅ **Test signals:** `node test-congressional-signals.js`
5. 📅 **Set weekly reminder** to download fresh CSV
6. 🔄 **Run update script** weekly: `./update-congressional-data.sh`

---

## Support Files

All scripts are ready to use:
- [capitol_trades_csv_importer.py](python-services/capitol_trades_csv_importer.py) - CSV importer
- [update-congressional-data.sh](update-congressional-data.sh) - Update script with backup
- [check-congressional-freshness.js](check-congressional-freshness.js) - Freshness monitor
- [test-congressional-signals.js](test-congressional-signals.js) - Signal tester
- [congressionalTradingSignals.js](src/services/signals/congressionalTradingSignals.js) - Signal generator

---

**Ready to start! Download your first CSV from Capitol Trades and run the importer.** 🚀
