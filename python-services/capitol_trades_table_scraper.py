#!/usr/bin/env python3
"""
Capitol Trades Table Scraper
Scrapes the actual table data from Capitol Trades website

This scraper:
1. Visits Capitol Trades website
2. Extracts table rows directly from HTML
3. Converts to CSV format
4. Saves to ./data/congressional_trades.csv

No export button needed - just reads the visible table!

Usage:
    python3 python-services/capitol_trades_table_scraper.py
    python3 python-services/capitol_trades_table_scraper.py --headless
    python3 python-services/capitol_trades_table_scraper.py --pages 5
"""

import os
import sys
import time
import csv
import argparse
from datetime import datetime


def scrape_table_data(headless=True, max_pages=10):
    """
    Scrape table data directly from Capitol Trades

    Args:
        headless: Run in headless mode
        max_pages: Maximum pages to scrape (default 10)
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    from webdriver_manager.chrome import ChromeDriverManager

    # Configure Chrome
    chrome_options = Options()

    if headless:
        chrome_options.add_argument('--headless=new')
        print("🤖 Running in headless mode")
    else:
        print("👁️  Running with visible browser")

    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--window-size=1920,1080')
    chrome_options.add_argument('--disable-blink-features=AutomationControlled')
    chrome_options.add_experimental_option('excludeSwitches', ['enable-automation'])

    driver = None
    all_trades = []

    try:
        print("🚀 Starting Chrome browser...")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)

        print("🌐 Navigating to Capitol Trades...")
        driver.get('https://www.capitoltrades.com/trades')

        print("⏳ Waiting for page to load...")
        time.sleep(5)  # Let JavaScript render

        # Try to find the table
        print("🔍 Looking for trades table...")

        # Multiple selectors to try
        table_selectors = [
            'table',
            '[role="table"]',
            '.trades-table',
            '.q-table',
            'tbody',
            '[class*="table"]',
            '[class*="trades"]',
        ]

        table_element = None
        for selector in table_selectors:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    table_element = elements[0]
                    print(f"✅ Found table using selector: {selector}")
                    break
            except:
                continue

        if not table_element:
            print("❌ Could not find table element")
            print("\n📸 Taking screenshot for debugging...")
            driver.save_screenshot('./data/capitol_trades_debug.png')
            print("   Saved: ./data/capitol_trades_debug.png")

            # Print page source snippet
            print("\n📄 Page source snippet:")
            print(driver.page_source[:500])

            return False

        # Try to find rows
        print("🔍 Extracting table rows...")

        row_selectors = [
            'tbody tr',
            'tr',
            '[role="row"]',
            '.q-tr',
            '.trades-row',
        ]

        rows = []
        for selector in row_selectors:
            try:
                rows = driver.find_elements(By.CSS_SELECTOR, selector)
                if len(rows) > 1:  # More than just header
                    print(f"✅ Found {len(rows)} rows using: {selector}")
                    break
            except:
                continue

        if not rows:
            print("❌ Could not find table rows")
            return False

        print(f"📊 Processing {len(rows)} rows...")

        # Extract data from rows
        for i, row in enumerate(rows[:min(len(rows), 1000)]):  # Limit to 1000 rows
            try:
                # Get all cells in the row
                cells = row.find_elements(By.CSS_SELECTOR, 'td, th')

                if len(cells) < 3:  # Skip rows with too few cells
                    continue

                # Extract text from each cell
                row_data = [cell.text.strip() for cell in cells]

                # Skip empty rows or header rows
                if not any(row_data) or 'Politician' in row_data[0]:
                    continue

                all_trades.append(row_data)

                if (i + 1) % 50 == 0:
                    print(f"   Processed {i + 1} rows...")

            except Exception as e:
                if i < 5:  # Only show errors for first few rows
                    print(f"   ⚠️  Row {i}: {str(e)}")
                continue

        print(f"\n✅ Extracted {len(all_trades)} trades")

        if len(all_trades) == 0:
            print("❌ No trades extracted")
            return False

        # Show sample of what we got
        print("\n📋 Sample of extracted data:")
        for trade in all_trades[:3]:
            print(f"   {trade[:5]}")  # Show first 5 columns

        # Try to scroll and load more (if pagination exists)
        if max_pages > 1:
            print(f"\n📜 Attempting to load more pages (up to {max_pages})...")

            for page_num in range(2, max_pages + 1):
                try:
                    # Look for "next" button
                    next_button_selectors = [
                        '//button[contains(text(), "Next")]',
                        '//a[contains(text(), "Next")]',
                        '//button[contains(@aria-label, "next")]',
                        '//button[@aria-label="Go to next page"]',
                        '//*[contains(@class, "pagination-next")]',
                    ]

                    next_button = None
                    for selector in next_button_selectors:
                        try:
                            buttons = driver.find_elements(By.XPATH, selector)
                            if buttons and buttons[0].is_enabled():
                                next_button = buttons[0]
                                break
                        except:
                            continue

                    if not next_button:
                        print(f"   No more pages (stopped at page {page_num - 1})")
                        break

                    # Click next
                    driver.execute_script("arguments[0].click();", next_button)
                    time.sleep(3)  # Wait for new page to load

                    # Extract rows from new page
                    new_rows = driver.find_elements(By.CSS_SELECTOR, 'tbody tr')

                    page_trades = 0
                    for row in new_rows:
                        try:
                            cells = row.find_elements(By.CSS_SELECTOR, 'td')
                            if len(cells) >= 3:
                                row_data = [cell.text.strip() for cell in cells]
                                if any(row_data):
                                    all_trades.append(row_data)
                                    page_trades += 1
                        except:
                            continue

                    print(f"   Page {page_num}: +{page_trades} trades (total: {len(all_trades)})")

                except Exception as e:
                    print(f"   ⚠️  Pagination failed: {str(e)}")
                    break

        # Save to CSV
        print("\n💾 Saving to CSV...")

        csv_path = './data/congressional_trades.csv'
        os.makedirs('./data', exist_ok=True)

        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)

            # Detect column count from first row
            if all_trades:
                col_count = len(all_trades[0])

                # Capitol Trades actual column order (from scraped data):
                # Politician | Asset Name | Filed Date | Transaction Date | Days Ago | Owner | Type | Amount | Price
                if col_count >= 9:
                    header = ['Politician', 'Asset Name', 'Filed Date', 'Transaction Date',
                             'Days Ago', 'Owner', 'Type', 'Amount', 'Price'][:col_count]
                elif col_count >= 5:
                    header = ['Politician', 'Asset Name', 'Filed Date', 'Transaction Date', 'Days Ago'][:col_count]
                else:
                    header = [f'Column_{i+1}' for i in range(col_count)]

                print(f"   Using header: {header}")
                writer.writerow(header)

                # Write data
                for trade in all_trades:
                    # Pad or trim to match header length
                    while len(trade) < len(header):
                        trade.append('')
                    trade = trade[:len(header)]

                    writer.writerow(trade)

        print(f"✅ CSV saved: {csv_path}")
        print(f"   Rows: {len(all_trades)}")

        file_size = os.path.getsize(csv_path)
        print(f"   Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")

        return True

    except Exception as e:
        print(f"❌ Error during scraping: {str(e)}")
        import traceback
        traceback.print_exc()

        # Take screenshot on error
        if driver:
            try:
                driver.save_screenshot('./data/capitol_trades_error.png')
                print("📸 Error screenshot saved: ./data/capitol_trades_error.png")
            except:
                pass

        return False

    finally:
        if driver:
            print("🧹 Closing browser...")
            driver.quit()


def main():
    parser = argparse.ArgumentParser(description='Scrape Capitol Trades table data')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    parser.add_argument('--visible', action='store_true', help='Show browser window')
    parser.add_argument('--pages', type=int, default=10, help='Max pages to scrape (default: 10)')

    args = parser.parse_args()

    print('\n' + '='*80)
    print('🏛️  CAPITOL TRADES TABLE SCRAPER')
    print('='*80)
    print()

    headless = args.headless or not args.visible

    success = scrape_table_data(headless=headless, max_pages=args.pages)

    if success:
        print('\n' + '='*80)
        print('✅ SCRAPING SUCCESSFUL')
        print('='*80)
        print('\n📋 Next steps:')
        print('  1. Import: python3 python-services/capitol_trades_csv_importer.py')
        print('  2. Verify: node check-congressional-freshness.js')
        print()

        # Offer to import automatically
        if input('\n❓ Import now? (y/n): ').lower() == 'y':
            print("\n📥 Running importer...")
            os.system('python3 python-services/capitol_trades_csv_importer.py')
    else:
        print('\n' + '='*80)
        print('❌ SCRAPING FAILED')
        print('='*80)
        print('\n💡 Alternatives:')
        print('  1. Check screenshot: ./data/capitol_trades_debug.png')
        print('  2. Try visible mode: --visible')
        print('  3. Use Apify: python3 congressional_auto_fetcher.py --source apify')
        print('  4. Use QuiverQuant: python3 congressional_trading_fetcher.py')
        print()
        sys.exit(1)


if __name__ == '__main__':
    main()
