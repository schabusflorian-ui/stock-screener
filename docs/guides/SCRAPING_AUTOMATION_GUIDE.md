# Automating Capitol Trades CSV Download 🤖

**Goal:** Automatically download CSV from Capitol Trades website (no manual clicking)

---

## Overview

Capitol Trades is a **JavaScript-heavy website** (Next.js) that requires browser automation to download CSVs. Here are your options:

| Method | Cost | Reliability | Setup | Maintenance |
|--------|------|-------------|-------|-------------|
| **Selenium Scraper** | Free | Medium | 15 min | May break |
| **Apify Scraper** | $1-2/mo | High | 5 min | Maintained |
| **QuiverQuant API** | $40/mo | Highest | 5 min | Zero maintenance |

---

## Option 1: Selenium Web Scraper (Free) 🆓

Automates a real Chrome browser to visit Capitol Trades and click the export button.

### Requirements

```bash
# Install Selenium and Chrome driver manager
pip3 install selenium webdriver-manager

# Chrome browser must be installed
# (Already have it if you browse the web)
```

### Setup (15 Minutes)

**1. Install dependencies:**
```bash
pip3 install selenium webdriver-manager
```

**2. Test the scraper:**
```bash
# With visible browser (see what's happening)
python3 python-services/capitol_trades_scraper.py --visible

# Headless mode (no browser window)
python3 python-services/capitol_trades_scraper.py --headless
```

**3. If it works, automate with cron:**
```bash
crontab -e

# Add weekly scraping (every Monday at 8am)
0 8 * * 1 cd "/Users/florianschabus/Investment Project" && python3 python-services/capitol_trades_scraper.py --headless >> logs/scraper.log 2>&1 && python3 python-services/capitol_trades_csv_importer.py >> logs/scraper.log 2>&1
```

### Pros
- ✅ Free
- ✅ Works with dynamic JavaScript sites
- ✅ Same data as manual download
- ✅ Can see what it's doing (non-headless mode)

### Cons
- ❌ May break if Capitol Trades changes website
- ❌ Requires Chrome browser
- ❌ Slower than API methods (30-60 seconds)
- ❌ Capitol Trades may not have free export button

### Troubleshooting

**Issue:** "Could not find export button"
- Capitol Trades may require paid subscription for CSV export
- Try the visible mode to see what's on the page: `--visible`
- Check if you need to be logged in

**Issue:** "Selenium not found"
```bash
pip3 install selenium webdriver-manager
```

**Issue:** "Chrome driver error"
- The script auto-downloads correct driver
- Make sure Chrome browser is installed
- Try: `brew install --cask google-chrome` (Mac)

---

## Option 2: All-in-One Auto-Update Script 🚀

Combines scraping + API fallback + importing in one command.

### Usage

```bash
# Run the all-in-one script
./auto-update-congressional.sh
```

### What It Does

1. **Backs up database** (safety first)
2. **Tries Selenium scraping** (if installed)
3. **Falls back to APIs** (if scraping fails):
   - QuiverQuant (if `QUIVER_API_KEY` set)
   - FMP (if `FMP_API_KEY` set)
   - Apify (if `APIFY_API_KEY` set)
   - Finnhub (if `FINNHUB_API_KEY` set)
4. **Imports CSV** (if scraping worked)
5. **Verifies data** (shows freshness stats)
6. **Cleans old backups** (keeps 7 days)

### Automate with Cron

```bash
crontab -e

# Weekly update (every Monday at 8am)
0 8 * * 1 cd "/Users/florianschabus/Investment Project" && ./auto-update-congressional.sh
```

### Pros
- ✅ Tries multiple methods automatically
- ✅ Falls back gracefully
- ✅ One command does everything
- ✅ Logs all actions
- ✅ Auto-backup before changes

### Cons
- ❌ Still needs Selenium OR an API key
- ❌ More complex (but more robust)

---

## Option 3: Apify Scraper Service (Recommended) ⭐

Apify maintains a professional scraper for Capitol Trades.

### Why Better Than DIY?

- ✅ **Maintained**: They fix it when Capitol Trades changes
- ✅ **Reliable**: Runs on their infrastructure
- ✅ **Cheap**: ~$1-2/month for weekly updates
- ✅ **Legal**: Proper scraping service

### Setup (5 Minutes)

```bash
# 1. Sign up at apify.com
# 2. Find Capitol Trades scraper: https://apify.com/saswave/capitol-trades-scraper
# 3. Get API key from account settings

# 4. Set API key
export APIFY_API_KEY="your_key"
echo 'export APIFY_API_KEY="your_key"' >> ~/.zshrc

# 5. Run scraper
python3 python-services/congressional_auto_fetcher.py --source apify

# 6. Automate
crontab -e
# Add: 0 8 * * 1 cd "$PWD" && python3 python-services/congressional_auto_fetcher.py --source apify >> logs/auto-update.log 2>&1
```

### Cost Breakdown

- **Platform fee:** $0.25 per 1,000 results typically
- **Weekly scraping:** 500-1,000 trades × 52 weeks = 26K-52K results/year
- **Annual cost:** $6.50-$13/year (~$1-2/month)

**ROI:** If you get +6% alpha on $50K portfolio = $3,000 gain. Cost: $13. ROI: 230x!

---

## Option 4: QuiverQuant API (Best Quality) 💎

Skip scraping entirely - use clean, normalized API data.

### Setup (5 Minutes)

```bash
# 1. Sign up: https://www.quiverquant.com/sources/congresstrading
# 2. Get API key from dashboard

# 3. Set API key
export QUIVER_API_KEY="your_key"
echo 'export QUIVER_API_KEY="your_key"' >> ~/.zshrc

# 4. Run fetcher (already built!)
python3 python-services/congressional_trading_fetcher.py

# 5. Automate
crontab -e
# Add: 0 8 * * 1 cd "$PWD" && python3 python-services/congressional_trading_fetcher.py >> logs/auto-update.log 2>&1
```

### Cost
- **$40/month** ($480/year)

### ROI
- $50K portfolio + 6% alpha = $3,000 gain
- Cost: $480
- ROI: 6.3x

**Worth it if:**
- You value your time (no maintenance)
- You want best data quality
- You manage $50K+ portfolio

---

## Comparison: Which Should You Use?

### For Starting Out
**Use:** Selenium scraper (free)
**Why:** Validate the system works before paying

**Then upgrade to:** Apify ($1-2/mo) when you confirm it generates alpha

### For Budget-Conscious
**Use:** Apify scraper ($1-2/mo)
**Why:** Best value - maintained, cheap, reliable

### For Serious Traders
**Use:** QuiverQuant API ($40/mo)
**Why:** Best quality, zero maintenance, already built

### For Developers
**Use:** Selenium scraper + fallback to Apify
**Why:** Free primary method, paid backup

---

## Technical Details: Why Scraping is Hard

Capitol Trades uses:
- **Next.js**: JavaScript-rendered content
- **Dynamic loading**: Data loaded after page load
- **No public API**: Must scrape frontend
- **Possible auth**: Export may require account

**Solution:** Selenium automates a real browser that executes JavaScript.

---

## Selenium Scraper Implementation

The scraper (`capitol_trades_scraper.py`) does:

1. **Launches Chrome** (headless or visible)
2. **Navigates to** https://www.capitoltrades.com/trades
3. **Waits for page load** (JavaScript execution)
4. **Finds export button** (tries multiple selectors)
5. **Clicks export** (triggers download)
6. **Waits for download** (5 seconds)
7. **Renames CSV** to `congressional_trades.csv`
8. **Closes browser**

**Runtime:** 30-60 seconds

**Failure points:**
- Export button selector changed (Capitol Trades update)
- Export requires login/subscription
- Download blocked by browser
- Network timeout

---

## Debugging Selenium Scraper

### View What It's Doing

```bash
# Run with visible browser
python3 python-services/capitol_trades_scraper.py --visible
```

You'll see Chrome open and attempt to click export.

### Check Screenshots

The scraper saves screenshots to `data/capitol_trades_page.png` for debugging.

### Common Issues

**"Export button not found"**
- Capitol Trades may have changed layout
- Export may require paid subscription
- Try logging in first (manual)

**Solution:** Switch to Apify or QuiverQuant

---

## Fallback Strategy

Best approach: **Layered automation**

```bash
#!/bin/bash
# Try methods in order of preference

# 1. Try Selenium (free)
if python3 python-services/capitol_trades_scraper.py --headless; then
    echo "Selenium worked!"
    exit 0
fi

# 2. Try Apify (cheap)
if [ -n "$APIFY_API_KEY" ]; then
    if python3 python-services/congressional_auto_fetcher.py --source apify; then
        echo "Apify worked!"
        exit 0
    fi
fi

# 3. Try QuiverQuant (best)
if [ -n "$QUIVER_API_KEY" ]; then
    if python3 python-services/congressional_trading_fetcher.py; then
        echo "QuiverQuant worked!"
        exit 0
    fi
fi

# 4. Alert for manual intervention
echo "All methods failed - manual update required"
exit 1
```

This is exactly what `auto-update-congressional.sh` does!

---

## Automation Summary

### What You've Built

1. **capitol_trades_scraper.py** - Selenium web scraper
2. **auto-update-congressional.sh** - All-in-one automation with fallbacks
3. **congressional_auto_fetcher.py** - Multi-API fetcher (4 APIs)
4. **congressional_trading_fetcher.py** - QuiverQuant fetcher (already built)

### Recommended Setup

**Week 1-4:** Test with Selenium scraper (free)
```bash
./auto-update-congressional.sh
```

**Week 5+:** If it works, keep using it. If it breaks, upgrade to:
- Apify ($1-2/mo) for best value
- QuiverQuant ($40/mo) for best quality

### Monitoring

```bash
# Check last update
tail -50 logs/congressional-auto-updates.log

# Check data freshness
node check-congressional-freshness.js

# Test scraper manually
python3 python-services/capitol_trades_scraper.py --visible
```

---

## Legal & Ethical Considerations

### Is Web Scraping Legal?

- ✅ **Public data**: Capitol Trades shows public government data
- ✅ **No circumvention**: Not bypassing authentication
- ⚠️ **ToS unclear**: Terms don't explicitly allow/forbid scraping
- ✅ **Rate limiting**: Scraper waits and doesn't hammer server

### Best Practices

1. **Respect robots.txt** (if exists)
2. **Rate limit** (scraper waits between requests)
3. **User agent** (identifies as real browser)
4. **Don't resell data** (personal use only)

### Safer Alternatives

If you're concerned about scraping:
- ✅ Use Apify (professional scraping service)
- ✅ Use APIs (QuiverQuant, FMP)
- ✅ Manual CSV (totally fine)

---

## Cost-Benefit Analysis

### Annual Cost Comparison

| Method | Setup | Annual Cost | Maintenance | Risk |
|--------|-------|-------------|-------------|------|
| Manual | 5 min | $0 | 4 hrs/year | None |
| Selenium | 15 min | $0 | ~2 hrs/year | May break |
| Apify | 5 min | $13/year | 0 hrs | None |
| QuiverQuant | 5 min | $480/year | 0 hrs | None |

### Break-Even Analysis

Assuming +6% alpha from congressional signals:

| Portfolio Size | Annual Gain | Apify ROI | QuiverQuant ROI |
|----------------|-------------|-----------|-----------------|
| $10,000 | $600 | 46x | 1.25x |
| $25,000 | $1,500 | 115x | 3.1x |
| $50,000 | $3,000 | 230x | 6.3x |
| $100,000 | $6,000 | 460x | 12.5x |

**Conclusion:** Even QuiverQuant has excellent ROI at $25K+ portfolio.

---

## Next Steps

### 1. Test Selenium Scraper

```bash
# Try it with visible browser to see what happens
python3 python-services/capitol_trades_scraper.py --visible
```

### 2. If It Works

```bash
# Set up weekly automation
crontab -e
# Add: 0 8 * * 1 cd "$PWD" && ./auto-update-congressional.sh
```

### 3. If It Doesn't Work

**Upgrade to Apify ($1-2/mo):**
```bash
# Sign up: https://apify.com/
export APIFY_API_KEY="your_key"
python3 python-services/congressional_auto_fetcher.py --source apify
```

---

## Support

- **Selenium Issues:** Run with `--visible` to debug
- **API Issues:** Check API key and subscription status
- **Automation Issues:** Check `logs/congressional-auto-updates.log`

---

**Ready to automate!** Start with Selenium scraper, upgrade if needed. 🚀
