/**
 * Insider Metrics Service
 *
 * Provides insider ownership calculations and activity metrics
 */

const { getDatabaseAsync } = require('../lib/db');

class InsiderMetrics {
  /**
   * Calculate insider ownership percentage for a company
   * @param {number} companyId - Company ID
   * @returns {number|null} Insider ownership percentage (0-100) or null if unavailable
   */
  static async getInsiderOwnershipPercent(companyId) {
    const database = await getDatabaseAsync();

    // Check if there are 10%+ owners
    const tenPercentOwnersResult = await database.query(`
      SELECT COUNT(*) as count
      FROM insiders
      WHERE company_id = $1 AND is_ten_percent_owner = 1
    `, [companyId]);

    const tenPercentOwners = tenPercentOwnersResult.rows[0];

    if (tenPercentOwners && tenPercentOwners.count > 0) {
      // Estimate based on number of 10% owners (conservative estimate)
      // Each 10% owner likely holds 10-15%, but we'll use 10% to be conservative
      return Math.min(tenPercentOwners.count * 10, 100);
    }

    // Fallback: Check for insider transaction activity
    // High activity often correlates with significant ownership
    const recentActivityResult = await database.query(`
      SELECT COUNT(*) as transactions
      FROM insider_transactions
      WHERE company_id = $1
        AND transaction_date >= date('now', '-365 days')
        AND transaction_type IN ('P', 'Purchase', 'BUY')
    `, [companyId]);

    const recentActivity = recentActivityResult.rows[0];

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
  static async hasRecentInsiderBuying(companyId, days = 90) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT COUNT(*) as count
      FROM insider_transactions
      WHERE company_id = $1
        AND transaction_date >= date('now', '-' || $2 || ' days')
        AND transaction_type IN ('P', 'Purchase', 'BUY')
        AND shares > 0
    `, [companyId, days]);

    const row = result.rows[0];
    return row && row.count > 0;
  }

  /**
   * Get insider buying signal strength (0-100)
   * @param {number} companyId - Company ID
   * @returns {number} Signal strength score
   */
  static async getInsiderBuyingSignal(companyId) {
    const database = await getDatabaseAsync();

    const activityResult = await database.query(`
      SELECT
        COUNT(*) as buy_count,
        SUM(CASE WHEN transaction_type IN ('S', 'Sale', 'SELL') THEN 1 ELSE 0 END) as sell_count,
        SUM(shares * COALESCE(price, 0)) as buy_value
      FROM insider_transactions
      WHERE company_id = $1
        AND transaction_date >= date('now', '-90 days')
        AND transaction_type IN ('P', 'Purchase', 'BUY', 'S', 'Sale', 'SELL')
    `, [companyId]);

    const activity = activityResult.rows[0];

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
  static async getInsiderMetrics(companyId) {
    return {
      ownershipPercent: await this.getInsiderOwnershipPercent(companyId),
      hasRecentBuying: await this.hasRecentInsiderBuying(companyId),
      buyingSignalStrength: await this.getInsiderBuyingSignal(companyId)
    };
  }
}

module.exports = InsiderMetrics;
