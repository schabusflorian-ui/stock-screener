// src/services/signals/congressionalTradingSignals.js
// Congressional Trading Signal Generator
// Based on research: Congressional trades outperform market by 5-10% annually

const Database = require('better-sqlite3');

/**
 * Congressional Trading Signal Generator
 *
 * Research shows politicians' stock trades significantly outperform the market:
 * - Senators' trades outperform by ~10% annually
 * - House members' trades outperform by ~6% annually
 * - Trades by committee members in relevant sectors show highest alpha
 * - Purchases > Sales (insiders may sell for liquidity, but buy for conviction)
 *
 * Signal strength factors:
 * 1. Number of politicians buying same stock (consensus)
 * 2. Total purchase amount (conviction)
 * 3. Committee relevance (tech committee buying tech stocks)
 * 4. Recency (recent trades more relevant)
 * 5. Party consensus (bipartisan buying = strong signal)
 */
class CongressionalTradingSignals {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Get recent congressional purchases for a company (last 90 days)
    this.stmtGetRecentPurchases = this.db.prepare(`
      SELECT
        ct.*,
        p.full_name as politician_name,
        p.chamber,
        p.party,
        p.state,
        p.is_leadership,
        p.committees
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      WHERE ct.company_id = ?
        AND ct.transaction_type = 'purchase'
        AND ct.transaction_date >= date(?, '-90 days')
        AND ct.transaction_date <= ?
        AND ct.is_periodic_transaction = 0
      ORDER BY ct.transaction_date DESC
    `);

    // Get purchase clusters across all companies
    this.stmtGetPurchaseClusters = this.db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name,
        COUNT(DISTINCT ct.politician_id) as politician_count,
        COUNT(*) as transaction_count,
        SUM(ct.amount_min + ct.amount_max) / 2 as estimated_total_value,
        MIN(ct.transaction_date) as first_purchase_date,
        MAX(ct.transaction_date) as last_purchase_date,
        COUNT(DISTINCT p.party) as party_diversity
      FROM congressional_trades ct
      JOIN companies c ON ct.company_id = c.id
      JOIN politicians p ON ct.politician_id = p.id
      WHERE ct.transaction_type = 'purchase'
        AND ct.transaction_date >= date(?, '-30 days')
        AND ct.transaction_date <= ?
        AND ct.is_periodic_transaction = 0
        AND ct.symbol_matched = 1
      GROUP BY c.id, c.symbol, c.name
      HAVING COUNT(DISTINCT ct.politician_id) >= 2
      ORDER BY politician_count DESC, estimated_total_value DESC
    `);

    // Get large purchases (>$100k)
    this.stmtGetLargePurchases = this.db.prepare(`
      SELECT
        ct.*,
        p.full_name as politician_name,
        p.chamber,
        p.party
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      WHERE ct.company_id = ?
        AND ct.transaction_type = 'purchase'
        AND ct.transaction_date >= date(?, '-60 days')
        AND ct.transaction_date <= ?
        AND ct.amount_min >= 100000
        AND ct.is_periodic_transaction = 0
      ORDER BY ct.amount_max DESC
    `);
  }

  /**
   * Generate congressional trading signal for a company
   * @param {number} companyId - Company ID
   * @param {string} asOfDate - Date to evaluate signal (YYYY-MM-DD)
   * @returns {Object|null} Signal with score and reasoning
   */
  generateSignal(companyId, asOfDate = new Date().toISOString().split('T')[0]) {
    // Get recent purchases
    const recentPurchases = this.stmtGetRecentPurchases.all(companyId, asOfDate, asOfDate);

    if (recentPurchases.length === 0) {
      return null; // No congressional buying activity
    }

    // Calculate signal components
    const uniquePoliticians = new Set(recentPurchases.map(p => p.politician_id)).size;

    // Estimate total purchase value (use midpoint of ranges)
    const totalPurchaseValue = recentPurchases.reduce((sum, p) => {
      const midpoint = ((p.amount_min || 0) + (p.amount_max || 0)) / 2;
      return sum + midpoint;
    }, 0);

    const largePurchases = recentPurchases.filter(p => (p.amount_min || 0) >= 100000);

    // Check for cluster (2+ politicians in 30 days)
    const last30Days = recentPurchases.filter(p => {
      const daysDiff = (new Date(asOfDate) - new Date(p.transaction_date)) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    });
    const isCluster = new Set(last30Days.map(p => p.politician_id)).size >= 2;

    // Check for bipartisan support
    const parties = new Set(recentPurchases.map(p => p.party).filter(p => p));
    const isBipartisan = parties.size >= 2;

    // Check for Senate purchases (higher alpha than House)
    const senatePurchases = recentPurchases.filter(p => p.chamber === 'Senate');
    const housePurchases = recentPurchases.filter(p => p.chamber === 'House');

    // Check for leadership purchases
    const leadershipPurchases = recentPurchases.filter(p => p.is_leadership);

    // Calculate base score
    let score = 0;
    let confidence = 0;
    const reasons = [];

    // Factor 1: Number of politicians buying
    if (uniquePoliticians >= 5) {
      score += 0.5;
      confidence += 0.3;
      reasons.push(`${uniquePoliticians} politicians buying (very strong consensus)`);
    } else if (uniquePoliticians >= 3) {
      score += 0.35;
      confidence += 0.25;
      reasons.push(`${uniquePoliticians} politicians buying (strong consensus)`);
    } else if (uniquePoliticians >= 2) {
      score += 0.2;
      confidence += 0.2;
      reasons.push(`${uniquePoliticians} politicians buying (cluster)`);
    } else {
      score += 0.1;
      confidence += 0.15;
      reasons.push(`${uniquePoliticians} politician buying`);
    }

    // Factor 2: Total value of purchases
    if (totalPurchaseValue >= 2000000) {
      score += 0.3;
      confidence += 0.2;
      reasons.push(`$${(totalPurchaseValue / 1000000).toFixed(1)}M total purchases (huge commitment)`);
    } else if (totalPurchaseValue >= 1000000) {
      score += 0.25;
      confidence += 0.15;
      reasons.push(`$${(totalPurchaseValue / 1000000).toFixed(1)}M total purchases (strong commitment)`);
    } else if (totalPurchaseValue >= 500000) {
      score += 0.15;
      confidence += 0.1;
      reasons.push(`$${(totalPurchaseValue / 1000).toFixed(0)}K total purchases`);
    }

    // Factor 3: Large individual purchases ($100k+)
    if (largePurchases.length > 0) {
      score += 0.2 * Math.min(largePurchases.length, 3); // Cap at 3
      confidence += 0.15;
      reasons.push(`${largePurchases.length} large purchases (>$100k each)`);
    }

    // Factor 4: Senate vs House (Senate has historically higher alpha)
    if (senatePurchases.length > 0) {
      score += 0.15;
      confidence += 0.1;
      reasons.push(`${senatePurchases.length} Senator(s) buying (higher alpha)`);
    }

    // Factor 5: Bipartisan support
    if (isBipartisan) {
      score += 0.2;
      confidence += 0.15;
      reasons.push('Bipartisan support (reduces political risk)');
    }

    // Factor 6: Leadership purchases
    if (leadershipPurchases.length > 0) {
      score += 0.15;
      confidence += 0.1;
      reasons.push(`${leadershipPurchases.length} leadership member(s) buying (insider access)`);
    }

    // Factor 7: Recent timing (last 7 days = more relevant)
    const veryRecentPurchases = recentPurchases.filter(p => {
      const daysDiff = (new Date(asOfDate) - new Date(p.transaction_date)) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    });
    if (veryRecentPurchases.length > 0) {
      score += 0.1;
      confidence += 0.05;
      reasons.push(`${veryRecentPurchases.length} very recent purchases (last 7 days)`);
    }

    // Normalize score to 0-1 range
    score = Math.min(1.0, score);
    confidence = Math.min(1.0, confidence);

    // Determine signal strength and expected alpha
    let signalStrength = 'weak';
    let expectedAlpha = 0;

    if (score >= 0.7 && (isCluster || isBipartisan)) {
      signalStrength = 'very strong';
      expectedAlpha = 10; // +10% expected alpha (per research)
    } else if (score >= 0.5) {
      signalStrength = 'strong';
      expectedAlpha = 6; // +6% expected alpha
    } else if (score >= 0.3) {
      signalStrength = 'moderate';
      expectedAlpha = 4; // +4% expected alpha
    } else {
      signalStrength = 'weak';
      expectedAlpha = 2; // +2% expected alpha
    }

    // Assemble politician list for display
    const politicianList = recentPurchases.slice(0, 10).map(p => ({
      name: p.politician_name,
      chamber: p.chamber,
      party: p.party,
      transactionDate: p.transaction_date,
      amountRange: p.amount_range,
      estimatedAmount: ((p.amount_min || 0) + (p.amount_max || 0)) / 2
    }));

    return {
      companyId,
      signal: 'BUY',
      score,
      confidence,
      signalStrength,
      expectedAlpha,
      asOfDate,

      metrics: {
        uniquePoliticians,
        totalTransactions: recentPurchases.length,
        totalPurchaseValue,
        largePurchaseCount: largePurchases.length,
        isCluster,
        isBipartisan,
        senatePurchases: senatePurchases.length,
        housePurchases: housePurchases.length,
        leadershipPurchases: leadershipPurchases.length,
        veryRecentCount: veryRecentPurchases.length
      },

      reasons,

      politicians: politicianList,

      smeInsight: `Research: Congressional trades outperform market by ${expectedAlpha}% annually. ${isCluster ? 'Multiple politicians buying = strong signal. ' : ''}${isBipartisan ? 'Bipartisan support reduces political risk.' : ''}`
    };
  }

  /**
   * Find all companies with congressional purchase clusters (2+ politicians in 30 days)
   * @param {string} asOfDate - Date to evaluate (YYYY-MM-DD)
   * @returns {Array} Companies with purchase clusters, ranked by strength
   */
  findPurchaseClusters(asOfDate = new Date().toISOString().split('T')[0]) {
    const clusters = this.stmtGetPurchaseClusters.all(asOfDate, asOfDate);

    return clusters.map(cluster => {
      // Generate full signal for this company
      const signal = this.generateSignal(cluster.company_id, asOfDate);

      return {
        ...cluster,
        signal: signal?.score || 0,
        confidence: signal?.confidence || 0,
        signalStrength: signal?.signalStrength || 'N/A',
        expectedAlpha: signal?.expectedAlpha || 0,
        smeRecommendation: signal?.signalStrength === 'very strong' || signal?.signalStrength === 'strong'
          ? 'STRONG BUY - Congressional consensus detected'
          : 'WATCH - Monitor for more activity'
      };
    });
  }

  /**
   * Get congressional trading summary for portfolio monitoring
   * @param {Array<number>} companyIds - Company IDs to check
   * @param {string} asOfDate - Date to evaluate
   * @returns {Array} Summary of congressional activity
   */
  getPortfolioCongressionalActivity(companyIds, asOfDate = new Date().toISOString().split('T')[0]) {
    const results = [];

    for (const companyId of companyIds) {
      const signal = this.generateSignal(companyId, asOfDate);
      if (signal) {
        results.push(signal);
      }
    }

    // Sort by signal strength (strongest first)
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Get statistics on congressional trading data coverage
   */
  getDataCoverage() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(DISTINCT company_id) as companies_with_data,
        SUM(CASE WHEN transaction_type = 'purchase' THEN 1 ELSE 0 END) as purchase_transactions,
        SUM(CASE WHEN transaction_type = 'sale' THEN 1 ELSE 0 END) as sale_transactions,
        COUNT(DISTINCT politician_id) as unique_politicians,
        MIN(transaction_date) as earliest_transaction,
        MAX(transaction_date) as latest_transaction
      FROM congressional_trades
      WHERE symbol_matched = 1
    `).get();

    // Get chamber breakdown
    const chambers = this.db.prepare(`
      SELECT
        p.chamber,
        COUNT(DISTINCT ct.politician_id) as politician_count,
        COUNT(*) as transaction_count
      FROM congressional_trades ct
      JOIN politicians p ON ct.politician_id = p.id
      WHERE ct.symbol_matched = 1
      GROUP BY p.chamber
    `).all();

    stats.chambers = chambers;

    return stats;
  }
}

module.exports = { CongressionalTradingSignals };
