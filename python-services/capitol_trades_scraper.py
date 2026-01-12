#!/usr/bin/env python3
"""
Capitol Trades Website Scraper
Automates downloading CSV directly from capitoltrades.com

Uses Selenium to handle JavaScript-rendered content and export functionality.

Requirements:
    pip install selenium webdriver-manager

Usage:
    python3 python-services/capitol_trades_scraper.py
    python3 python-services/capitol_trades_scraper.py --headless
    python3 python-services/capitol_trades_scraper.py --days 180
"""

import os
import sys
import time
import argparse
from datetime import datetime
import glob


def setup_selenium():
    """Set up Selenium with Chrome"""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.service import Service
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from webdriver_manager.chrome import ChromeDriverManager

        return True
    except ImportError:
        print("❌ Required packages not installed")
        print("\nInstall with:")
        print("  pip install selenium webdriver-manager")
        print("\nOr:")
        print("  pip3 install selenium webdriver-manager")
        return False


def scrape_capitol_trades(headless=True, days_filter=180, download_path=None):
    """
    Scrape CSV from Capitol Trades website

    Args:
        headless: Run browser in headless mode (no window)
        days_filter: Number of days to filter (default 180)
        download_path: Where to save CSV (default: ./data/)
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager

    if not download_path:
        download_path = os.path.abspath('./data')

    os.makedirs(download_path, exist_ok=True)

    print(f"📂 Download path: {download_path}")

    # Configure Chrome options
    chrome_options = Options()

    if headless:
        chrome_options.add_argument('--headless=new')
        print("🤖 Running in headless mode (no browser window)")

    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option('excludeSwitches', ['enable-automation'])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    # Set download preferences
    prefs = {
        'download.default_directory': download_path,
        'download.prompt_for_download': False,
        'download.directory_upgrade': True,
        'safebrowsing.enabled': True
    }
    chrome_options.add_experimental_option('prefs', prefs)

    driver = None

    try:
        print("🚀 Starting Chrome browser...")

        # Initialize driver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)

        # Set implicit wait
        driver.implicitly_wait(10)

        print("🌐 Navigating to Capitol Trades...")
        driver.get('https://www.capitoltrades.com/trades')

        # Wait for page to load
        time.sleep(3)

        print("⏳ Waiting for page to fully load...")

        try:
            # Wait for the trades table to appear
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'table, [role="table"], .trades-table'))
            )
            print("✅ Page loaded successfully")
        except:
            print("⚠️  Couldn't detect table, but continuing...")

        # Take screenshot for debugging
        if not headless:
            screenshot_path = os.path.join(download_path, 'capitol_trades_page.png')
            driver.save_screenshot(screenshot_path)
            print(f"📸 Screenshot saved: {screenshot_path}")

        # Look for export/download button
        print("🔍 Looking for export/download button...")

        # Try multiple selectors for export button
        export_selectors = [
            "//button[contains(text(), 'Export')]",
            "//button[contains(text(), 'Download')]",
            "//a[contains(text(), 'Export')]",
            "//a[contains(text(), 'Download')]",
            "//button[contains(@class, 'export')]",
            "//button[contains(@class, 'download')]",
            "//*[contains(text(), 'CSV')]",
            "//button[contains(@aria-label, 'export')]",
            "//button[contains(@aria-label, 'download')]",
        ]

        export_button = None
        for selector in export_selectors:
            try:
                elements = driver.find_elements(By.XPATH, selector)
                if elements:
                    export_button = elements[0]
                    print(f"✅ Found export button: {selector}")
                    break
            except:
                continue

        if not export_button:
            print("❌ Could not find export/download button")
            print("\n📋 Available buttons on page:")

            # Debug: Show all buttons
            buttons = driver.find_elements(By.TAG_NAME, 'button')
            for i, btn in enumerate(buttons[:10]):  # Show first 10
                try:
                    print(f"   {i+1}. {btn.text[:50] if btn.text else '(no text)'}")
                except:
                    pass

            print("\n💡 Capitol Trades may not have a free export button.")
            print("   Consider using:")
            print("   1. Apify scraper (automated, $1-2/mo)")
            print("   2. QuiverQuant API ($40/mo)")
            print("   3. Manual CSV copy-paste")

            return False

        # Click export button
        print("🖱️  Clicking export button...")

        try:
            # Scroll into view
            driver.execute_script("arguments[0].scrollIntoView(true);", export_button)
            time.sleep(1)

            # Try regular click
            export_button.click()
        except:
            # Try JavaScript click if regular fails
            driver.execute_script("arguments[0].click();", export_button)

        print("⏳ Waiting for download to start...")

        # Wait for download to complete
        time.sleep(5)

        # Check for downloaded CSV
        csv_files = glob.glob(os.path.join(download_path, '*.csv'))

        # Find newest CSV
        if csv_files:
            newest_csv = max(csv_files, key=os.path.getctime)
            csv_age = time.time() - os.path.getctime(newest_csv)

            if csv_age < 30:  # Downloaded in last 30 seconds
                target_path = os.path.join(download_path, 'congressional_trades.csv')

                # Rename to standard name
                if newest_csv != target_path:
                    if os.path.exists(target_path):
                        backup_path = target_path.replace('.csv', f'_backup_{int(time.time())}.csv')
                        os.rename(target_path, backup_path)
                        print(f"📦 Backed up old CSV: {backup_path}")

                    os.rename(newest_csv, target_path)

                print(f"✅ CSV downloaded successfully!")
                print(f"   Location: {target_path}")

                # Show file info
                file_size = os.path.getsize(target_path)
                print(f"   Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")

                # Count rows
                with open(target_path, 'r') as f:
                    row_count = sum(1 for line in f) - 1  # Subtract header
                print(f"   Rows: {row_count:,} trades")

                return True
            else:
                print("⚠️  Found CSV but it's not recent (may be old download)")
                return False
        else:
            print("❌ No CSV file found in download directory")
            return False

    except Exception as e:
        print(f"❌ Error during scraping: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        if driver:
            print("🧹 Cleaning up...")
            driver.quit()


def scrape_with_requests():
    """
    Alternative: Try to scrape using requests (if API endpoint exists)

    Capitol Trades uses Next.js which may have internal API endpoints
    """
    import requests
    import json

    print("🔍 Attempting to find internal API endpoints...")

    # Common Next.js API patterns
    api_urls = [
        'https://www.capitoltrades.com/api/trades',
        'https://www.capitoltrades.com/api/v1/trades',
        'https://www.capitoltrades.com/_next/data/trades',
        'https://www.capitoltrades.com/api/congressional-trades',
    ]

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
    }

    for url in api_urls:
        try:
            print(f"   Trying: {url}")
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                print(f"✅ Found API endpoint: {url}")

                # Try to parse JSON
                try:
                    data = response.json()
                    print(f"   Data type: {type(data)}")
                    print(f"   Keys: {list(data.keys()) if isinstance(data, dict) else 'array'}")
                    return data
                except:
                    print(f"   Response not JSON")
            else:
                print(f"   Status: {response.status_code}")

        except Exception as e:
            print(f"   Error: {str(e)}")

    print("❌ No accessible API endpoints found")
    return None


def main():
    parser = argparse.ArgumentParser(description='Scrape Capitol Trades CSV')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode (no browser window)')
    parser.add_argument('--visible', action='store_true', help='Show browser window (opposite of headless)')
    parser.add_argument('--days', type=int, default=180, help='Days of data to fetch')
    parser.add_argument('--method', choices=['selenium', 'requests', 'both'], default='selenium',
                       help='Scraping method to use')

    args = parser.parse_args()

    print('\n' + '='*80)
    print('🏛️  CAPITOL TRADES CSV SCRAPER')
    print('='*80)
    print()

    # Check if Selenium is available
    if args.method in ['selenium', 'both']:
        if not setup_selenium():
            print("\n⚠️  Selenium not available, falling back to requests method")
            args.method = 'requests'

    success = False

    # Try Selenium scraping
    if args.method in ['selenium', 'both']:
        headless = args.headless or not args.visible

        print(f"🤖 Method: Selenium (Chrome)")
        print(f"   Headless: {headless}")
        print(f"   Days: {args.days}")
        print()

        success = scrape_capitol_trades(headless=headless, days_filter=args.days)

        if success:
            print('\n' + '='*80)
            print('✅ SCRAPING SUCCESSFUL')
            print('='*80)
            print('\nNext steps:')
            print('  1. Run: python3 python-services/capitol_trades_csv_importer.py')
            print('  2. Verify: node check-congressional-freshness.js')
            print()
            return

    # Try requests method
    if args.method in ['requests', 'both'] and not success:
        print("\n🔄 Trying alternative method (API endpoints)...")
        data = scrape_with_requests()

        if data:
            print("✅ Found data via API - but conversion to CSV not implemented yet")
            success = True
        else:
            print("❌ API method failed")

    if not success:
        print('\n' + '='*80)
        print('❌ SCRAPING FAILED')
        print('='*80)
        print('\n💡 Alternative solutions:')
        print()
        print('1. Manual Download (Free):')
        print('   - Visit: https://www.capitoltrades.com/trades')
        print('   - Export CSV manually')
        print('   - Save to: ./data/congressional_trades.csv')
        print()
        print('2. Apify Scraper ($1-2/mo):')
        print('   - Automated scraping service')
        print('   - Run: python3 python-services/congressional_auto_fetcher.py --source apify')
        print('   - Requires: APIFY_API_KEY')
        print()
        print('3. QuiverQuant API ($40/mo):')
        print('   - Best quality data')
        print('   - Run: python3 python-services/congressional_trading_fetcher.py')
        print('   - Requires: QUIVER_API_KEY')
        print()
        print('4. Financial Modeling Prep ($20-50/mo):')
        print('   - Run: python3 python-services/congressional_auto_fetcher.py --source fmp')
        print('   - Requires: FMP_API_KEY')
        print()
        print('See: CONGRESSIONAL_AUTOMATION_GUIDE.md for full details')
        print('='*80)
        print()
        sys.exit(1)


if __name__ == '__main__':
    main()
