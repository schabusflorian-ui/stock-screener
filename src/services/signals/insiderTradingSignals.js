// src/services/signals/insiderTradingSignals.js
// Insider Trading Signal Generator
// Based on SME Panel recommendations: +3-5% expected alpha

const Database = require('better-sqlite3');

/**
 * Insider Trading Signal Generator
 *
 * According to SME Panel consensus:
 * - Insider BUYING (especially clusters) = strong signal
 * - Insider SELLING = weak signal (diversification, taxes)
 * - Focus on open market buys, ignore option exercises
 * - Clusters (3+ insiders in 30 days) predict 12-month outperformance
 */
class InsiderTradingSignals {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Get recent insider buys for a company (last 90 days)
    this.stmtGetRecentBuys = this.db.prepare(`
      SELECT
        it.*,
        i.name as insider_name,
        i.title as insider_title,
        c.symbol,
        c.name as company_name
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      JOIN companies c ON it.company_id = c.id
      WHERE it.company_id = ?
        AND it.acquisition_disposition = 'A'  -- Acquisitions (buys)
        AND it.transaction_date >= date(?, '-90 days')
        AND it.transaction_date <= ?
        AND it.is_derivative = 0  -- Exclude option exercises
      ORDER BY it.transaction_date DESC
    `);

    // Get insider buy clusters across all companies
    this.stmtGetBuyClusters = this.db.prepare(`
      SELECT
        c.id as company_id,
        c.symbol,
        c.name,
        COUNT(DISTINCT it.insider_id) as insider_count,
        COUNT(*) as transaction_count,
        SUM(it.total_value) as total_buy_value,
        AVG(it.price_per_share) as avg_buy_price,
        MIN(it.transaction_date) as first_buy_date,
        MAX(it.transaction_date) as last_buy_date
      FROM insider_transactions it
      JOIN companies c ON it.company_id = c.id
      WHERE it.acquisition_disposition = 'A'
        AND it.transaction_date >= date(?, '-30 days')
        AND it.transaction_date <= ?
        AND it.is_derivative = 0
      GROUP BY c.id, c.symbol, c.name
      HAVING COUNT(DISTINCT it.insider_id) >= 3  -- 3+ insiders = cluster
      ORDER BY insider_count DESC, total_buy_value DESC
    `);

    // Check if company has recent large buys (>$100k)
    this.stmtGetLargeBuys = this.db.prepare(`
      SELECT
        it.*,
        i.name as insider_name,
        i.title as insider_title
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.company_id = ?
        AND it.acquisition_disposition = 'A'
        AND it.transaction_date >= date(?, '-60 days')
        AND it.transaction_date <= ?
        AND it.total_value >= 100000  -- $100k+ = meaningful
        AND it.is_derivative = 0
      ORDER BY it.total_value DESC
    `);
  }

  /**
   * Generate insider trading signal for a company
   * @param {number} companyId - Company ID
   * @param {string} asOfDate - Date to evaluate signal (YYYY-MM-DD)
   * @returns {Object|null} Signal with score and reasoning
   */
  generateSignal(companyId, asOfDate = new Date().toISOString().split('T')[0]) {
    // Get recent buys
    const recentBuys = this.stmtGetRecentBuys.all(companyId, asOfDate, asOfDate);

    if (recentBuys.length === 0) {
      return null; // No insider buying activity
    }

    // Calculate signal components
    const uniqueInsiders = new Set(recentBuys.map(b => b.insider_id)).size;
    const totalBuyValue = recentBuys.reduce((sum, b) => sum + (b.total_value || 0), 0);
    const largeBuys = recentBuys.filter(b => b.total_value >= 100000);

    // Check for cluster (3+ insiders in 30 days)
    const last30Days = recentBuys.filter(b => {
      const daysDiff = (new Date(asOfDate) - new Date(b.transaction_date)) / (1000 * 60 * 60 * 24);
      return daysDiff <= 30;
    });
    const isCluster = new Set(last30Days.map(b => b.insider_id)).size >= 3;

    // Calculate base score
    let score = 0;
    let confidence = 0;
    const reasons = [];

    // Factor 1: Number of insiders buying
    if (uniqueInsiders >= 5) {
      score += 0.4;
      confidence += 0.3;
      reasons.push(`${uniqueInsiders} insiders buying (very strong)`);
    } else if (uniqueInsiders >= 3) {
      score += 0.3;
      confidence += 0.25;
      reasons.push(`${uniqueInsiders} insiders buying (cluster)`);
    } else if (uniqueInsiders >= 2) {
      score += 0.15;
      confidence += 0.15;
      reasons.push(`${uniqueInsiders} insiders buying`);
    } else {
      score += 0.05;
      confidence += 0.1;
      reasons.push(`${uniqueInsiders} insider buying`);
    }

    // Factor 2: Total value of buys
    if (totalBuyValue >= 5000000) {
      score += 0.3;
      confidence += 0.2;
      reasons.push(`$${(totalBuyValue / 1000000).toFixed(1)}M total insider buying (huge commitment)`);
    } else if (totalBuyValue >= 1000000) {
      score += 0.2;
      confidence += 0.15;
      reasons.push(`$${(totalBuyValue / 1000000).toFixed(1)}M total insider buying (strong commitment)`);
    } else if (totalBuyValue >= 500000) {
      score += 0.1;
      confidence += 0.1;
      reasons.push(`$${(totalBuyValue / 1000).toFixed(0)}K total insider buying`);
    }

    // Factor 3: Large individual buys ($100k+)
    if (largeBuys.length > 0) {
      score += 0.15 * Math.min(largeBuys.length, 3); // Cap at 3
      confidence += 0.1;
      reasons.push(`${largeBuys.length} large buys (>$100k each)`);
    }

    // Factor 4: Cluster bonus (3+ insiders in 30 days)
    if (isCluster) {
      score += 0.2;
      confidence += 0.2;
      reasons.push('Cluster pattern (3+ insiders in 30 days) - historically predicts outperformance');
    }

    // Factor 5: Recent timing (last 7 days = more relevant)
    const veryRecentBuys = recentBuys.filter(b => {
      const daysDiff = (new Date(asOfDate) - new Date(b.transaction_date)) / (1000 * 60 * 60 * 24);
      return daysDiff <= 7;
    });
    if (veryRecentBuys.length > 0) {
      score += 0.1;
      confidence += 0.05;
      reasons.push(`${veryRecentBuys.length} very recent buys (last 7 days)`);
    }

    // Normalize score to 0-1 range
    score = Math.min(1.0, score);
    confidence = Math.min(1.0, confidence);

    // Apply SME panel insights
    let signalStrength = 'weak';
    let expectedAlpha = 0;

    if (score >= 0.7 && isCluster) {
      signalStrength = 'very strong';
      expectedAlpha = 5; // +5% expected alpha
    } else if (score >= 0.5) {
      signalStrength = 'strong';
      expectedAlpha = 3; // +3% expected alpha
    } else if (score >= 0.3) {
      signalStrength = 'moderate';
      expectedAlpha = 2; // +2% expected alpha
    } else {
      signalStrength = 'weak';
      expectedAlpha = 1; // +1% expected alpha
    }

    return {
      companyId,
      symbol: recentBuys[0].symbol,
      companyName: recentBuys[0].company_name,
      signal: 'BUY',
      score,
      confidence,
      signalStrength,
      expectedAlpha,
      asOfDate,

      metrics: {
        uniqueInsiders,
        totalTransactions: recentBuys.length,
        totalBuyValue,
        largeBuyCount: largeBuys.length,
        isCluster,
        veryRecentCount: veryRecentBuys.length
      },

      reasons,

      recentTransactions: recentBuys.slice(0, 5).map(b => ({
        insiderName: b.insider_name,
        insiderTitle: b.insider_title,
        transactionDate: b.transaction_date,
        shares: b.shares_transacted,
        pricePerShare: b.price_per_share,
        totalValue: b.total_value
      })),

      smeInsight: `SME Panel: Insider buying ${isCluster ? '(cluster pattern)' : ''} historically predicts 12-month outperformance. Expected alpha: +${expectedAlpha}%`
    };
  }

  /**
   * Find all companies with insider buy clusters (3+ insiders in 30 days)
   * @param {string} asOfDate - Date to evaluate (YYYY-MM-DD)
   * @returns {Array} Companies with buy clusters, ranked by strength
   */
  findBuyClusters(asOfDate = new Date().toISOString().split('T')[0]) {
    const clusters = this.stmtGetBuyClusters.all(asOfDate, asOfDate);

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
          ? 'STRONG BUY - Cluster pattern detected'
          : 'WATCH - Monitor for more buying'
      };
    });
  }

  /**
   * Get insider trading summary for portfolio monitoring
   * @param {Array<number>} companyIds - Company IDs to check
   * @param {string} asOfDate - Date to evaluate
   * @returns {Array} Summary of insider activity
   */
  getPortfolioInsiderActivity(companyIds, asOfDate = new Date().toISOString().split('T')[0]) {
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
   * Get statistics on insider trading data coverage
   */
  getDataCoverage() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        COUNT(DISTINCT company_id) as companies_with_data,
        SUM(CASE WHEN acquisition_disposition = 'A' THEN 1 ELSE 0 END) as buy_transactions,
        SUM(CASE WHEN acquisition_disposition = 'D' THEN 1 ELSE 0 END) as sell_transactions,
        MIN(transaction_date) as earliest_transaction,
        MAX(transaction_date) as latest_transaction
      FROM insider_transactions
    `).get();

    return stats;
  }
}

module.exports = { InsiderTradingSignals };
