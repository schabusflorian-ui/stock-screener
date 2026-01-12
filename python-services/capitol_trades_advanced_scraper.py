#!/usr/bin/env python3
"""
Capitol Trades Advanced Scraper with Pagination
Handles infinite scroll, "Load More" buttons, and pagination

Usage:
    python3 python-services/capitol_trades_advanced_scraper.py --visible
    python3 python-services/capitol_trades_advanced_scraper.py --headless --max-trades 500
"""

import os
import sys
import time
import csv
import argparse
from datetime import datetime


def scrape_with_pagination(headless=True, max_trades=500, max_scrolls=50):
    """
    Advanced scraper with pagination support

    Handles:
    - Infinite scroll (keeps scrolling to load more)
    - "Load More" buttons
    - Page navigation (1, 2, 3...)
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
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
    seen_trades = set()  # Deduplication

    try:
        print("🚀 Starting Chrome browser...")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)

        print("🌐 Navigating to Capitol Trades...")
        driver.get('https://www.capitoltrades.com/trades')

        print("⏳ Waiting for initial page load...")
        time.sleep(5)

        # Try to get initial trades
        print("🔍 Extracting initial trades...")
        initial_trades = extract_trades_from_page(driver)

        for trade in initial_trades:
            trade_hash = hash(str(trade))
            if trade_hash not in seen_trades:
                seen_trades.add(trade_hash)
                all_trades.append(trade)

        print(f"   ✅ Initial: {len(all_trades)} trades")

        # Try different pagination strategies
        scroll_count = 0
        no_new_trades_count = 0

        while len(all_trades) < max_trades and scroll_count < max_scrolls:
            previous_count = len(all_trades)

            # Strategy 1: Look for "Load More" button
            load_more_clicked = try_load_more_button(driver)

            if load_more_clicked:
                print(f"   🔄 Clicked 'Load More' button")
                time.sleep(3)

                # Extract new trades
                new_trades = extract_trades_from_page(driver)
                for trade in new_trades:
                    trade_hash = hash(str(trade))
                    if trade_hash not in seen_trades:
                        seen_trades.add(trade_hash)
                        all_trades.append(trade)

                if len(all_trades) > previous_count:
                    print(f"   ✅ Total: {len(all_trades)} trades (+{len(all_trades) - previous_count})")
                    no_new_trades_count = 0
                else:
                    no_new_trades_count += 1

                continue

            # Strategy 2: Try infinite scroll
            scroll_success = try_infinite_scroll(driver)

            if scroll_success:
                time.sleep(2)

                # Extract new trades
                new_trades = extract_trades_from_page(driver)
                for trade in new_trades:
                    trade_hash = hash(str(trade))
                    if trade_hash not in seen_trades:
                        seen_trades.add(trade_hash)
                        all_trades.append(trade)

                scroll_count += 1

                if len(all_trades) > previous_count:
                    print(f"   📜 Scroll {scroll_count}: {len(all_trades)} trades (+{len(all_trades) - previous_count})")
                    no_new_trades_count = 0
                else:
                    no_new_trades_count += 1

                # If no new trades after multiple attempts, stop
                if no_new_trades_count >= 5:
                    print(f"   ⏹️  No new trades after {no_new_trades_count} attempts - stopping")
                    break

                continue

            # Strategy 3: Try page navigation (1, 2, 3...)
            next_page_clicked = try_next_page_button(driver)

            if next_page_clicked:
                print(f"   ➡️  Navigated to next page")
                time.sleep(3)

                # Extract trades from new page
                new_trades = extract_trades_from_page(driver)
                for trade in new_trades:
                    trade_hash = hash(str(trade))
                    if trade_hash not in seen_trades:
                        seen_trades.add(trade_hash)
                        all_trades.append(trade)

                if len(all_trades) > previous_count:
                    print(f"   ✅ Total: {len(all_trades)} trades (+{len(all_trades) - previous_count})")
                    no_new_trades_count = 0
                else:
                    no_new_trades_count += 1

                continue

            # If none of the strategies worked, we're done
            print(f"   ⏹️  No pagination methods available - stopping at {len(all_trades)} trades")
            break

        print(f"\n✅ Extraction complete: {len(all_trades)} total trades")

        if len(all_trades) == 0:
            print("❌ No trades extracted")
            return False

        # Save to CSV
        print("\n💾 Saving to CSV...")
        save_to_csv(all_trades)

        return True

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

        if driver:
            try:
                driver.save_screenshot('./data/scraper_error.png')
                print("📸 Screenshot saved: ./data/scraper_error.png")
            except:
                pass

        return False

    finally:
        if driver:
            print("🧹 Closing browser...")
            driver.quit()


def extract_trades_from_page(driver):
    """Extract all visible trades from current page"""
    trades = []

    try:
        # Find all table rows
        rows = driver.find_elements(By.CSS_SELECTOR, 'tbody tr, tr[role="row"]')

        for row in rows:
            try:
                cells = row.find_elements(By.CSS_SELECTOR, 'td, [role="cell"]')

                if len(cells) < 3:
                    continue

                # Extract text from each cell
                row_data = [cell.text.strip() for cell in cells]

                # Skip empty rows or headers
                if not any(row_data) or 'Politician' in str(row_data[0]):
                    continue

                trades.append(row_data)

            except:
                continue

    except Exception as e:
        print(f"   ⚠️  Extraction error: {str(e)}")

    return trades


def try_load_more_button(driver):
    """Try to find and click 'Load More' button"""
    load_more_selectors = [
        '//button[contains(text(), "Load More")]',
        '//button[contains(text(), "Show More")]',
        '//button[contains(text(), "More")]',
        '//a[contains(text(), "Load More")]',
        '//a[contains(text(), "Show More")]',
        '//*[contains(@class, "load-more")]',
        '//*[contains(@class, "show-more")]',
        '//button[contains(@aria-label, "load more")]',
    ]

    for selector in load_more_selectors:
        try:
            buttons = driver.find_elements(By.XPATH, selector)
            for button in buttons:
                if button.is_displayed() and button.is_enabled():
                    driver.execute_script("arguments[0].scrollIntoView(true);", button)
                    time.sleep(0.5)
                    driver.execute_script("arguments[0].click();", button)
                    return True
        except:
            continue

    return False


def try_infinite_scroll(driver):
    """Scroll to bottom to trigger infinite scroll loading"""
    try:
        # Get current scroll position
        old_position = driver.execute_script("return window.pageYOffset;")

        # Scroll to bottom
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1)

        # Check if scroll position changed
        new_position = driver.execute_script("return window.pageYOffset;")

        return new_position > old_position

    except:
        return False


def try_next_page_button(driver):
    """Try to find and click 'Next' page button"""
    next_page_selectors = [
        '//button[contains(text(), "Next")]',
        '//a[contains(text(), "Next")]',
        '//button[@aria-label="Go to next page"]',
        '//button[@aria-label="Next page"]',
        '//*[contains(@class, "pagination-next")]',
        '//*[contains(@class, "next-page")]',
        '//button[contains(@class, "next")]',
        '//*[@aria-label="next"]',
    ]

    for selector in next_page_selectors:
        try:
            buttons = driver.find_elements(By.XPATH, selector)
            for button in buttons:
                if button.is_displayed() and button.is_enabled():
                    # Check if button is not disabled
                    disabled = button.get_attribute('disabled')
                    if disabled:
                        continue

                    driver.execute_script("arguments[0].scrollIntoView(true);", button)
                    time.sleep(0.5)
                    driver.execute_script("arguments[0].click();", button)
                    return True
        except:
            continue

    return False


def save_to_csv(all_trades):
    """Save trades to CSV file"""
    csv_path = './data/congressional_trades.csv'
    os.makedirs('./data', exist_ok=True)

    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)

        if all_trades:
            col_count = len(all_trades[0])

            # Capitol Trades column order
            if col_count >= 9:
                header = ['Politician', 'Asset Name', 'Filed Date', 'Transaction Date',
                         'Days Ago', 'Owner', 'Type', 'Amount', 'Price'][:col_count]
            elif col_count >= 5:
                header = ['Politician', 'Asset Name', 'Filed Date', 'Transaction Date', 'Days Ago'][:col_count]
            else:
                header = [f'Column_{i+1}' for i in range(col_count)]

            print(f"   Columns: {header}")
            writer.writerow(header)

            # Write data
            for trade in all_trades:
                # Pad or trim
                while len(trade) < len(header):
                    trade.append('')
                trade = trade[:len(header)]

                writer.writerow(trade)

    print(f"✅ CSV saved: {csv_path}")
    print(f"   Rows: {len(all_trades)}")

    file_size = os.path.getsize(csv_path)
    print(f"   Size: {file_size:,} bytes ({file_size/1024:.1f} KB)")


def main():
    parser = argparse.ArgumentParser(description='Advanced Capitol Trades scraper with pagination')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    parser.add_argument('--visible', action='store_true', help='Show browser window')
    parser.add_argument('--max-trades', type=int, default=500, help='Maximum trades to scrape (default: 500)')
    parser.add_argument('--max-scrolls', type=int, default=50, help='Maximum scroll attempts (default: 50)')

    args = parser.parse_args()

    print('\n' + '='*80)
    print('🏛️  CAPITOL TRADES ADVANCED SCRAPER')
    print('='*80)
    print()

    headless = args.headless or not args.visible

    print(f"Settings:")
    print(f"  Headless: {headless}")
    print(f"  Max trades: {args.max_trades}")
    print(f"  Max scrolls: {args.max_scrolls}")
    print()

    success = scrape_with_pagination(
        headless=headless,
        max_trades=args.max_trades,
        max_scrolls=args.max_scrolls
    )

    if success:
        print('\n' + '='*80)
        print('✅ SCRAPING SUCCESSFUL')
        print('='*80)
        print('\n📋 Next steps:')
        print('  1. Import: python3 python-services/capitol_trades_csv_importer.py')
        print('  2. Verify: node check-congressional-freshness.js')
        print()
    else:
        print('\n' + '='*80)
        print('❌ SCRAPING FAILED')
        print('='*80)
        print('\n💡 Alternatives:')
        print('  1. Try visible mode: --visible')
        print('  2. Use Apify: python3 congressional_auto_fetcher.py --source apify')
        print('  3. Use QuiverQuant: python3 congressional_trading_fetcher.py')
        print()
        sys.exit(1)


if __name__ == '__main__':
    main()
