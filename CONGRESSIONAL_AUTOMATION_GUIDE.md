# Congressional Trading Data - Automation Options 🤖

**Goal:** Fully automated congressional trading data updates (no manual CSV downloads)

---

## TL;DR - Recommended Options

| Option | Cost | Setup Time | Best For |
|--------|------|------------|----------|
| **QuiverQuant API** | $40/mo | 5 min | Best quality, already built ✅ |
| **Financial Modeling Prep** | $20-50/mo | 10 min | Budget option, good coverage |
| **Apify Scraper** | Pay-per-use | 15 min | Occasional use, Capitol Trades data |
| **Finnhub Premium** | $60+/mo | 10 min | If already subscribed |
| **Manual CSV** | Free | 5 min/week | Bootstrap phase |

---

## Option 1: QuiverQuant API ⭐ RECOMMENDED

### Overview
- **Cost:** $40/month
- **Quality:** Excellent (cleaned, normalized data)
- **Coverage:** Both House and Senate, historical data
- **Status:** ✅ Already implemented in your project!

### Setup (5 Minutes)

```bash
# 1. Get API key
# Sign up at: https://www.quiverquant.com/sources/congresstrading

# 2. Set environment variable
export QUIVER_API_KEY="your_api_key_here"

# Add to your shell profile for persistence:
echo 'export QUIVER_API_KEY="your_api_key_here"' >> ~/.zshrc
source ~/.zshrc

# 3. Run fetcher (already built!)
python3 python-services/congressional_trading_fetcher.py

# 4. Verify
node check-congressional-freshness.js
```

### Automation (Cron Job)

```bash
# Edit crontab
crontab -e

# Add weekly update (every Monday at 8am)
0 8 * * 1 cd "/Users/florianschabus/Investment Project" && /usr/local/bin/python3 python-services/congressional_trading_fetcher.py >> logs/congressional-auto-updates.log 2>&1

# Or daily update (every day at 8am)
0 8 * * * cd "/Users/florianschabus/Investment Project" && /usr/local/bin/python3 python-services/congressional_trading_fetcher.py >> logs/congressional-auto-updates.log 2>&1
```

### Pros
- ✅ Best data quality (cleaned and normalized)
- ✅ Already implemented in your project
- ✅ Historical data included
- ✅ Both House and Senate
- ✅ No rate limits for typical use
- ✅ Reliable uptime

### Cons
- ❌ $40/month cost

**Verdict:** Best option if budget allows. Already built and tested.

---

## Option 2: Financial Modeling Prep API 💰 BUDGET OPTION

### Overview
- **Cost:** $20-50/month (depending on plan)
- **Quality:** Good (direct from SEC filings)
- **Coverage:** Both House and Senate (separate endpoints)
- **Status:** 🆕 Auto-fetcher created!

### Setup (10 Minutes)

```bash
# 1. Get API key
# Sign up at: https://site.financialmodelingprep.com/developer/docs/pricing

# 2. Set environment variable
export FMP_API_KEY="your_api_key_here"
echo 'export FMP_API_KEY="your_api_key_here"' >> ~/.zshrc

# 3. Run auto-fetcher
python3 python-services/congressional_auto_fetcher.py --source fmp

# 4. Verify
node check-congressional-freshness.js
```

### Automation (Cron Job)

```bash
# Weekly update (every Monday at 8am)
0 8 * * 1 cd "/Users/florianschabus/Investment Project" && /usr/local/bin/python3 python-services/congressional_auto_fetcher.py --source fmp >> logs/congressional-auto-updates.log 2>&1
```

### Pros
- ✅ Cheaper than QuiverQuant ($20-50/mo)
- ✅ Good data quality
- ✅ Both House and Senate
- ✅ Historical data available

### Cons
- ❌ Two separate endpoints (Senate + House)
- ❌ May have rate limits on lower tiers
- ❌ Less data normalization

**Verdict:** Good budget alternative to QuiverQuant.

---

## Option 3: Apify Capitol Trades Scraper 🔍 PAY-PER-USE

### Overview
- **Cost:** Pay-per-use (~$0.25 per 1,000 results)
- **Quality:** Excellent (scrapes Capitol Trades directly)
- **Coverage:** Both House and Senate
- **Status:** 🆕 Auto-fetcher created!

### Setup (15 Minutes)

```bash
# 1. Get API key
# Sign up at: https://apify.com/
# Find scraper: https://apify.com/saswave/capitol-trades-scraper

# 2. Set environment variable
export APIFY_API_KEY="your_api_key_here"
echo 'export APIFY_API_KEY="your_api_key_here"' >> ~/.zshrc

# 3. Run auto-fetcher (takes 1-2 minutes)
python3 python-services/congressional_auto_fetcher.py --source apify

# 4. Verify
node check-congressional-freshness.js
```

### Automation (Cron Job)

```bash
# Weekly update (every Monday at 8am)
0 8 * * 1 cd "/Users/florianschabus/Investment Project" && /usr/local/bin/python3 python-services/congressional_auto_fetcher.py --source apify >> logs/congressional-auto-updates.log 2>&1
```

### Pros
- ✅ Pay only when you use it
- ✅ Same data as Capitol Trades website
- ✅ Scrapes up to 5,000 trades per run
- ✅ Good for occasional updates

### Cons
- ❌ Takes 1-2 minutes to complete scrape
- ❌ Depends on Capitol Trades website structure
- ❌ Small per-use cost adds up with daily updates

**Verdict:** Best for weekly/monthly updates on a budget.

---

## Option 4: Finnhub Premium API 📊 IF ALREADY SUBSCRIBED

### Overview
- **Cost:** $60+/month (Premium subscription)
- **Quality:** Good
- **Coverage:** Both House and Senate
- **Status:** 🆕 Auto-fetcher created!

### Setup (10 Minutes)

```bash
# 1. Get API key (requires Premium subscription)
# Sign up at: https://finnhub.io/pricing

# 2. Set environment variable
export FINNHUB_API_KEY="your_api_key_here"
echo 'export FINNHUB_API_KEY="your_api_key_here"' >> ~/.zshrc

# 3. Run auto-fetcher
python3 python-services/congressional_auto_fetcher.py --source finnhub --days 180

# 4. Verify
node check-congressional-freshness.js
```

### Automation (Cron Job)

```bash
# Weekly update (every Monday at 8am)
0 8 * * 1 cd "/Users/florianschabus/Investment Project" && /usr/local/bin/python3 python-services/congressional_auto_fetcher.py --source finnhub --days 90 >> logs/congressional-auto-updates.log 2>&1
```

### Pros
- ✅ Good if already subscribed to Finnhub
- ✅ Rate limit: 30 calls/second
- ✅ Reliable data quality

### Cons
- ❌ Most expensive option ($60+/mo)
- ❌ Requires Premium subscription
- ❌ Must query per-symbol (slower)

**Verdict:** Only if already using Finnhub for other data.

---

## Option 5: Manual CSV Download (FREE) 🆓 BOOTSTRAP

### Overview
- **Cost:** Free
- **Quality:** Excellent (Capitol Trades data)
- **Coverage:** Both House and Senate
- **Status:** ✅ Already built (CSV importer)

### Setup (5 Minutes/Week)

```bash
# 1. Download CSV from Capitol Trades
# Go to: https://www.capitoltrades.com/trades
# Click "Export" and download CSV

# 2. Save to project
# Save as: ./data/congressional_trades.csv

# 3. Run importer
./update-congressional-data.sh

# 4. Verify
node check-congressional-freshness.js
```

### Pros
- ✅ Free
- ✅ High-quality data from Capitol Trades
- ✅ Already implemented

### Cons
- ❌ Manual process (5 min/week)
- ❌ Easy to forget
- ❌ Not scalable

**Verdict:** Good for getting started, but upgrade to automation soon.

---

## Comparison Matrix

| Feature | QuiverQuant | FMP | Apify | Finnhub | Manual |
|---------|-------------|-----|-------|---------|--------|
| **Monthly Cost** | $40 | $20-50 | Pay-per-use | $60+ | Free |
| **Setup Time** | 5 min | 10 min | 15 min | 10 min | 5 min/week |
| **Data Quality** | Excellent | Good | Excellent | Good | Excellent |
| **Automation** | Full | Full | Full | Full | None |
| **Historical Data** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | Limited |
| **Rate Limits** | None | Tier-based | Per-run | 30/sec | N/A |
| **Already Built** | ✅ Yes | 🆕 New | 🆕 New | 🆕 New | ✅ Yes |

---

## Cost Analysis (Annual)

### Manual CSV (Free)
- **Cost:** $0/year
- **Time:** 4 hours/year (5 min × 52 weeks)
- **Total Value:** $0 + 4 hours labor

### QuiverQuant ($480/year)
- **Cost:** $480/year
- **Time:** 10 minutes setup
- **Total Value:** $480 + minimal ongoing time
- **ROI:** If +6% alpha on $50K portfolio = $3,000/year → 6.3x ROI

### FMP ($240-600/year)
- **Cost:** $240-600/year
- **Time:** 10 minutes setup
- **Total Value:** 50% cost of QuiverQuant
- **ROI:** Similar alpha potential, better ROI

### Apify (Pay-per-use)
- **Cost:** ~$3-15/year (weekly updates)
- **Time:** 10 minutes setup
- **Total Value:** Cheapest automation option
- **ROI:** Best cost/benefit for weekly updates

---

## Recommended Path

### Phase 1: Bootstrap (Weeks 1-4)
Use **Manual CSV** to validate the system works:
- Test signal generation
- Verify strategy integration
- Measure alpha contribution
- Build confidence in the approach

### Phase 2: Automate (Month 2+)
Choose automation based on budget:

**If Budget Allows ($40/mo):**
→ QuiverQuant API (best quality, already built)

**If Budget Constrained:**
→ Apify ($3-15/year) or FMP ($20/mo)

**If Validating Concept:**
→ Manual CSV until you see real alpha

---

## Migration Instructions

### From Manual to QuiverQuant

```bash
# 1. Get API key
# https://www.quiverquant.com/sources/congresstrading

# 2. Set key
export QUIVER_API_KEY="your_key"
echo 'export QUIVER_API_KEY="your_key"' >> ~/.zshrc

# 3. Run fetcher (already built!)
python3 python-services/congressional_trading_fetcher.py

# 4. Set up cron
crontab -e
# Add: 0 8 * * 1 cd "/Users/florianschabus/Investment Project" && /usr/local/bin/python3 python-services/congressional_trading_fetcher.py >> logs/congressional-auto-updates.log 2>&1

# Done! Fully automated.
```

### From Manual to FMP/Apify/Finnhub

```bash
# 1. Get API key from provider
# 2. Set environment variable
export FMP_API_KEY="your_key"  # or APIFY_API_KEY or FINNHUB_API_KEY

# 3. Test once
python3 python-services/congressional_auto_fetcher.py --source fmp  # or apify/finnhub

# 4. Set up cron
crontab -e
# Add appropriate cron job (see examples above)
```

---

## Monitoring Automation

### Check Last Update

```bash
# View last auto-update log
tail -50 logs/congressional-auto-updates.log

# Check data freshness
node check-congressional-freshness.js
```

### Alert on Stale Data

```bash
# Add to cron (daily check)
0 9 * * * cd "/Users/florianschabus/Investment Project" && node check-congressional-freshness.js | grep -q "STALE" && echo "Congressional data is stale!" | mail -s "Data Alert" your@email.com
```

---

## FAQ

**Q: Can I scrape Capitol Trades directly without Apify?**
A: Technically yes (Selenium/Puppeteer), but Capitol Trades ToS is unclear on scraping. Apify provides a legal, maintained solution.

**Q: Which API has the best data quality?**
A: QuiverQuant > Capitol Trades (via Apify) > FMP ≈ Finnhub. QuiverQuant cleans and normalizes the data best.

**Q: Can I use multiple sources?**
A: Yes! Different sources can complement each other. Deduplication is automatic.

**Q: What's the minimum update frequency?**
A: Weekly minimum. Congressional trades are filed within 45 days, so daily updates add little value.

**Q: Do I need to delete old data when switching sources?**
A: No! The system tracks data source. You can mix sources safely.

---

## Summary

### Best for Most Users
**QuiverQuant API** ($40/mo)
- Already implemented
- Best quality
- Set and forget

### Best Budget Option
**Apify Scraper** (~$3-15/year)
- Pay-per-use
- Weekly updates affordable
- Same data as Capitol Trades

### Best to Start
**Manual CSV** (Free)
- Validate the approach
- Then upgrade to automation

### Not Recommended
**Building your own scraper**
- ToS unclear
- Maintenance burden
- Apify is cheap enough

---

## Support

- **QuiverQuant:** Already built in [congressional_trading_fetcher.py](python-services/congressional_trading_fetcher.py)
- **FMP/Apify/Finnhub:** New auto-fetcher in [congressional_auto_fetcher.py](python-services/congressional_auto_fetcher.py)
- **Manual CSV:** Use [capitol_trades_csv_importer.py](python-services/capitol_trades_csv_importer.py)

All automation options create same database format - signals work with any source!

---

**Ready to automate?** Pick an option above and set up in 5-15 minutes! 🚀
