/**
 * Insider Metrics Service
 *
 * Provides insider ownership calculations and activity metrics
 */

const database = require('../database');

class InsiderMetrics {
  /**
   * Calculate insider ownership percentage for a company
   * @param {number} companyId - Company ID
   * @returns {number|null} Insider ownership percentage (0-100) or null if unavailable
   */
  static getInsiderOwnershipPercent(companyId) {
    // Check if there are 10%+ owners
    const tenPercentOwners = database.prepare(`
      SELECT COUNT(*) as count
      FROM insiders
      WHERE company_id = ? AND is_ten_percent_owner = 1
    `).get(companyId);

    if (tenPercentOwners && tenPercentOwners.count > 0) {
      // Estimate based on number of 10% owners (conservative estimate)
      // Each 10% owner likely holds 10-15%, but we'll use 10% to be conservative
      return Math.min(tenPercentOwners.count * 10, 100);
    }

    // Fallback: Check for insider transaction activity
    // High activity often correlates with significant ownership
    const recentActivity = database.prepare(`
      SELECT COUNT(*) as transactions
      FROM insider_transactions
      WHERE company_id = ?
        AND transaction_date >= date('now', '-365 days')
        AND transaction_type IN ('P', 'Purchase', 'BUY')
    `).get(companyId);

    if (recentActivity && recentActivity.transactions > 10) {
      // Significant insider buying suggests material ownership
      return 5; // Conservative estimate for companies with active insider buying
    }

    return null;
  }

  /**
   * Check if company has recent insider buying
   * @param {number} companyId - Company ID
   * @param {number} days - Lookback period in days (default 90)
   * @returns {boolean} True if recent insider buying detected
   */
  static hasRecentInsiderBuying(companyId, days = 90) {
    const result = database.prepare(`
      SELECT COUNT(*) as count
      FROM insider_transactions
      WHERE company_id = ?
        AND transaction_date >= date('now', '-' || ? || ' days')
        AND transaction_type IN ('P', 'Purchase', 'BUY')
        AND shares > 0
    `).get(companyId, days);

    return result && result.count > 0;
  }

  /**
   * Get insider buying signal strength (0-100)
   * @param {number} companyId - Company ID
   * @returns {number} Signal strength score
   */
  static getInsiderBuyingSignal(companyId) {
    const activity = database.prepare(`
      SELECT
        COUNT(*) as buy_count,
        SUM(CASE WHEN transaction_type IN ('S', 'Sale', 'SELL') THEN 1 ELSE 0 END) as sell_count,
        SUM(shares * COALESCE(price, 0)) as buy_value
      FROM insider_transactions
      WHERE company_id = ?
        AND transaction_date >= date('now', '-90 days')
        AND transaction_type IN ('P', 'Purchase', 'BUY', 'S', 'Sale', 'SELL')
    `).get(companyId);

    if (!activity || activity.buy_count === 0) return 0;

    // Calculate signal based on:
    // 1. Number of buy transactions
    // 2. Buy/sell ratio
    // 3. Transaction value
    const buyCount = activity.buy_count || 0;
    const sellCount = activity.sell_count || 0;
    const buyValue = activity.buy_value || 0;

    // Base score from buy count (0-40 points)
    let score = Math.min(buyCount * 10, 40);

    // Bonus for positive buy/sell ratio (0-30 points)
    if (sellCount === 0 && buyCount > 0) {
      score += 30;
    } else if (buyCount > sellCount) {
      score += 20;
    }

    // Bonus for significant transaction value (0-30 points)
    if (buyValue > 1000000) score += 30;
    else if (buyValue > 100000) score += 20;
    else if (buyValue > 10000) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Get insider activity summary for screening
   * @param {number} companyId - Company ID
   * @returns {Object} Insider metrics
   */
  static getInsiderMetrics(companyId) {
    return {
      ownershipPercent: this.getInsiderOwnershipPercent(companyId),
      hasRecentBuying: this.hasRecentInsiderBuying(companyId),
      buyingSignalStrength: this.getInsiderBuyingSignal(companyId)
    };
  }
}

module.exports = InsiderMetrics;
