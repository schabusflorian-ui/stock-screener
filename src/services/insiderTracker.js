/**
 * Insider Tracker Service
 *
 * Handles:
 * - Fetching and parsing Form 4 filings from SEC
 * - Storing insider and transaction data
 * - Calculating insider activity summaries and signals
 * - Detecting significant insider activity patterns
 */

const Form4Parser = require('./form4Parser');
const { getDatabaseAsync } = require('../lib/db');

// Signal calculation weights
const SIGNAL_WEIGHTS = {
  CEO_BUY: 15,
  CFO_BUY: 12,
  COO_BUY: 10,
  DIRECTOR_BUY: 5,
  OFFICER_BUY: 4,
  TEN_PERCENT_BUY: 3,

  CEO_SELL: -5,
  CFO_SELL: -4,
  OFFICER_SELL: -2,
  TEN_PERCENT_SELL: -3,

  CLUSTER_BONUS: 5,
  LARGE_BUY_BONUS: 3,
  VERY_LARGE_BUY_BONUS: 5,
};

// Event types for alerts
const EVENT_TYPES = {
  INSIDER_BUY_LARGE: 'insider_buy_large',
  INSIDER_BUY_CLUSTER: 'insider_buy_cluster',
  INSIDER_SELL_LARGE: 'insider_sell_large',
  CEO_BUY: 'ceo_buy',
  CFO_BUY: 'cfo_buy',
  DIRECTOR_BUY: 'director_buy',
  OFFICER_BUY: 'officer_buy',
};

class InsiderTracker {
  constructor(secFilingFetcher) {
    this.secFetcher = secFilingFetcher;
    this.form4Parser = new Form4Parser();
  }

  /**
   * Fetch recent Form 4 filings for a company
   */
  async fetchRecentFilings(companyId, cik, days = 30) {
    const filings = await this.secFetcher.getFilingsList(cik, '4');
    const results = [];

    // Filter to recent filings
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    for (const filing of filings.slice(0, 50)) {
      try {
        const filingDate = new Date(filing.filedAt || filing.filingDate);
        if (filingDate < cutoffDate) continue;

        // Get the XML content
        const xmlUrl = this.getForm4XmlUrl(filing, cik);
        if (!xmlUrl) continue;

        const xmlContent = await this.secFetcher.fetch(xmlUrl);
        if (!xmlContent) continue;

        const parsed = await this.form4Parser.parse(xmlContent);

        // Store the filing
        const stored = await this.storeForm4(companyId, filing, parsed);
        results.push(stored);
      } catch (error) {
        console.error(`Error processing Form 4 ${filing.accessionNumber}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Get the XML document URL from a Form 4 filing
   */
  getForm4XmlUrl(filing, cik) {
    if (filing.primaryDocument?.endsWith('.xml')) {
      const accessionNoDashes = filing.accessionNumber.replace(/-/g, '');
      return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${filing.primaryDocument}`;
    }
    return null;
  }

  /**
   * Store a parsed Form 4 filing
   */
  async storeForm4(companyId, filing, parsed) {
    const { issuer, owner, transactions } = parsed;

    // Process each owner (usually just one)
    const owners = Array.isArray(owner) ? owner : [owner];
    const storedTransactions = [];

    for (const ownerData of owners) {
      if (!ownerData) continue;

      // Upsert insider record
      const insiderId = await this.upsertInsider(companyId, ownerData);

      // Store each transaction
      for (const tx of transactions) {
        if (tx.isHolding) continue; // Skip holdings, only store actual transactions

        const stored = await this.storeTransaction(companyId, insiderId, filing, tx, ownerData);
        if (stored) {
          // Check for alerts
          await this.checkForAlerts(companyId, { ...stored, ...tx }, { id: insiderId, ...ownerData });
          storedTransactions.push({ ...stored, insider: ownerData });
        }
      }
    }

    return {
      accessionNumber: filing.accessionNumber,
      issuer,
      transactionCount: storedTransactions.length,
      transactions: storedTransactions,
    };
  }

  /**
   * Upsert an insider record
   */
  async upsertInsider(companyId, ownerData) {
    const database = await getDatabaseAsync();

    // Try to find existing insider by CIK
    let insider = null;
    if (ownerData.cik) {
      const result = await database.query(`
        SELECT id FROM insiders WHERE company_id = $1 AND cik = $2
      `, [companyId, ownerData.cik]);
      insider = result.rows[0];
    }

    if (insider) {
      // Update existing
      await database.query(`
        UPDATE insiders SET
          name = COALESCE($1, name),
          title = COALESCE($2, title),
          is_officer = $3,
          is_director = $4,
          is_ten_percent_owner = $5
        WHERE id = $6
      `, [
        ownerData.name,
        ownerData.officerTitle,
        ownerData.isOfficer ? true : false,
        ownerData.isDirector ? true : false,
        ownerData.isTenPercentOwner ? true : false,
        insider.id
      ]);
      return insider.id;
    } else {
      // Insert new
      const result = await database.query(`
        INSERT INTO insiders (company_id, cik, name, title, is_officer, is_director, is_ten_percent_owner, first_filing_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
        RETURNING id
      `, [
        companyId,
        ownerData.cik,
        ownerData.name,
        ownerData.officerTitle,
        ownerData.isOfficer ? true : false,
        ownerData.isDirector ? true : false,
        ownerData.isTenPercentOwner ? true : false
      ]);
      return result.rows[0].id;
    }
  }

  /**
   * Store a single transaction
   */
  async storeTransaction(companyId, insiderId, filing, tx, ownerData) {
    try {
      const database = await getDatabaseAsync();

      const result = await database.query(`
        INSERT INTO insider_transactions (
          company_id, insider_id, accession_number, filing_date,
          transaction_date, transaction_code, transaction_type,
          shares_transacted, shares_owned_after, price_per_share, total_value,
          is_derivative, derivative_security, exercise_price, expiration_date, underlying_shares,
          acquisition_disposition, direct_indirect
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (company_id, insider_id, transaction_date, accession_number) DO NOTHING
        RETURNING id
      `, [
        companyId,
        insiderId,
        filing.accessionNumber,
        filing.filedAt?.split('T')[0] || filing.filingDate || new Date().toISOString().split('T')[0],
        tx.transactionDate,
        tx.transactionCode,
        tx.transactionType,
        tx.shares,
        tx.sharesOwnedAfter,
        tx.pricePerShare,
        tx.totalValue,
        tx.isDerivative ? true : false,
        tx.securityTitle,
        tx.conversionOrExercisePrice || tx.exercisePrice,
        tx.expirationDate,
        tx.underlyingShares,
        tx.acquisitionDisposition,
        tx.directIndirect
      ]);

      if (result.rowCount > 0) {
        return {
          id: result.rows[0].id,
          ...tx,
        };
      }
    } catch (error) {
      // Likely duplicate, ignore
      if (!error.message.includes('duplicate key')) {
        console.error('Error storing transaction:', error.message);
      }
    }

    return null;
  }

  /**
   * Calculate insider activity summary and signal for a company
   */
  async calculateSummary(companyId, period = '90d') {
    const database = await getDatabaseAsync();
    const days = this.parsePeriod(period);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Get all transactions in period
    const result = await database.query(`
      SELECT
        t.*,
        i.name as insider_name,
        i.title as insider_title,
        i.is_officer,
        i.is_director,
        i.is_ten_percent_owner
      FROM insider_transactions t
      JOIN insiders i ON t.insider_id = i.id
      WHERE t.company_id = $1
        AND t.transaction_date >= $2
        AND t.transaction_type IN ('buy', 'sell')
        AND t.is_derivative = false
      ORDER BY t.transaction_date DESC
    `, [companyId, cutoffStr]);

    const transactions = result.rows;

    // Separate buys and sells
    const buys = transactions.filter(t => t.transaction_type === 'buy');
    const sells = transactions.filter(t => t.transaction_type === 'sell');

    // Calculate metrics
    const summary = {
      period,
      days,

      // Buy metrics
      buyCount: buys.length,
      buyShares: buys.reduce((sum, t) => sum + (t.shares_transacted || 0), 0),
      buyValue: buys.reduce((sum, t) => sum + (t.total_value || 0), 0),
      uniqueBuyers: new Set(buys.map(t => t.insider_id)).size,

      // Sell metrics
      sellCount: sells.length,
      sellShares: sells.reduce((sum, t) => sum + (t.shares_transacted || 0), 0),
      sellValue: sells.reduce((sum, t) => sum + (t.total_value || 0), 0),
      uniqueSellers: new Set(sells.map(t => t.insider_id)).size,

      // Net
      netShares: 0,
      netValue: 0,

      // Transactions by insider type
      ceoBuys: buys.filter(t => this.isCeo(t)),
      cfoBuys: buys.filter(t => this.isCfo(t)),
      directorBuys: buys.filter(t => t.is_director),
      officerBuys: buys.filter(t => t.is_officer),

      ceoSells: sells.filter(t => this.isCeo(t)),
      cfoSells: sells.filter(t => this.isCfo(t)),

      // Recent transactions for display
      recentTransactions: transactions.slice(0, 20),
    };

    summary.netShares = summary.buyShares - summary.sellShares;
    summary.netValue = summary.buyValue - summary.sellValue;

    // Calculate signal
    const signal = this.calculateSignal(summary);
    summary.signal = signal.signal;
    summary.signalStrength = signal.strength;
    summary.signalScore = signal.score;

    // Store summary
    await this.storeSummary(companyId, summary);

    return summary;
  }

  /**
   * Calculate insider sentiment signal
   */
  calculateSignal(summary) {
    let score = 0;

    // CEO/CFO buying is very bullish
    if (summary.ceoBuys.length > 0) {
      score += SIGNAL_WEIGHTS.CEO_BUY;
    }
    if (summary.cfoBuys.length > 0) {
      score += SIGNAL_WEIGHTS.CFO_BUY;
    }

    // Director buying is bullish
    summary.directorBuys.forEach(() => {
      score += SIGNAL_WEIGHTS.DIRECTOR_BUY;
    });

    // Officer buying
    summary.officerBuys.forEach(() => {
      score += SIGNAL_WEIGHTS.OFFICER_BUY;
    });

    // Cluster buying bonus (multiple insiders)
    if (summary.uniqueBuyers >= 3) {
      score += SIGNAL_WEIGHTS.CLUSTER_BONUS * 2;
    } else if (summary.uniqueBuyers >= 2) {
      score += SIGNAL_WEIGHTS.CLUSTER_BONUS;
    }

    // Large buy bonus
    if (summary.buyValue >= 500000) {
      score += SIGNAL_WEIGHTS.VERY_LARGE_BUY_BONUS;
    } else if (summary.buyValue >= 100000) {
      score += SIGNAL_WEIGHTS.LARGE_BUY_BONUS;
    }

    // Selling (less negative weight - selling is often for diversification)
    if (summary.ceoSells.length > 0) {
      score += SIGNAL_WEIGHTS.CEO_SELL;
    }
    if (summary.cfoSells.length > 0) {
      score += SIGNAL_WEIGHTS.CFO_SELL;
    }

    // Convert score to signal
    let signal, strength;
    if (score >= 20) {
      signal = 'bullish';
      strength = 5;
    } else if (score >= 10) {
      signal = 'bullish';
      strength = 4;
    } else if (score >= 5) {
      signal = 'slightly_bullish';
      strength = 3;
    } else if (score >= 1) {
      signal = 'slightly_bullish';
      strength = 2;
    } else if (score <= -10) {
      signal = 'bearish';
      strength = 4;
    } else if (score <= -5) {
      signal = 'slightly_bearish';
      strength = 3;
    } else if (score < 0) {
      signal = 'slightly_bearish';
      strength = 2;
    } else {
      signal = 'neutral';
      strength = 1;
    }

    return { signal, strength, score };
  }

  /**
   * Store summary in database
   */
  async storeSummary(companyId, summary) {
    const database = await getDatabaseAsync();

    await database.query(`
      INSERT INTO insider_activity_summary (
        company_id, period,
        buy_count, buy_shares, buy_value, unique_buyers,
        sell_count, sell_shares, sell_value, unique_sellers,
        net_shares, net_value,
        insider_signal, signal_strength, signal_score,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
      ON CONFLICT (company_id, period) DO UPDATE SET
        buy_count = EXCLUDED.buy_count,
        buy_shares = EXCLUDED.buy_shares,
        buy_value = EXCLUDED.buy_value,
        unique_buyers = EXCLUDED.unique_buyers,
        sell_count = EXCLUDED.sell_count,
        sell_shares = EXCLUDED.sell_shares,
        sell_value = EXCLUDED.sell_value,
        unique_sellers = EXCLUDED.unique_sellers,
        net_shares = EXCLUDED.net_shares,
        net_value = EXCLUDED.net_value,
        insider_signal = EXCLUDED.insider_signal,
        signal_strength = EXCLUDED.signal_strength,
        signal_score = EXCLUDED.signal_score,
        updated_at = CURRENT_TIMESTAMP
    `, [
      companyId,
      summary.period,
      summary.buyCount,
      summary.buyShares,
      summary.buyValue,
      summary.uniqueBuyers,
      summary.sellCount,
      summary.sellShares,
      summary.sellValue,
      summary.uniqueSellers,
      summary.netShares,
      summary.netValue,
      summary.signal,
      summary.signalStrength,
      summary.signalScore
    ]);
  }

  /**
   * Get insider activity for a company
   */
  async getInsiderActivity(companyId, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 50, transactionType, insiderType } = options;

    let whereClause = 'WHERE t.company_id = $1';
    const params = [companyId];
    let paramCounter = 2;

    if (transactionType) {
      whereClause += ` AND t.transaction_type = $${paramCounter++}`;
      params.push(transactionType);
    }

    if (insiderType === 'officer') {
      whereClause += ' AND i.is_officer = true';
    } else if (insiderType === 'director') {
      whereClause += ' AND i.is_director = true';
    } else if (insiderType === 'owner') {
      whereClause += ' AND i.is_ten_percent_owner = true';
    }

    params.push(limit);

    const result = await database.query(`
      SELECT
        t.*,
        i.name as insider_name,
        i.title as insider_title,
        i.is_officer,
        i.is_director,
        i.is_ten_percent_owner
      FROM insider_transactions t
      JOIN insiders i ON t.insider_id = i.id
      ${whereClause}
      ORDER BY t.transaction_date DESC
      LIMIT $${paramCounter}
    `, params);

    return result.rows;
  }

  /**
   * Get all insiders for a company
   */
  async getInsiders(companyId) {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        i.*,
        COUNT(t.id) as transaction_count,
        SUM(CASE WHEN t.transaction_type = 'buy' THEN t.total_value ELSE 0 END) as total_bought,
        SUM(CASE WHEN t.transaction_type = 'sell' THEN t.total_value ELSE 0 END) as total_sold,
        MAX(t.transaction_date) as last_transaction_date
      FROM insiders i
      LEFT JOIN insider_transactions t ON i.id = t.insider_id
      WHERE i.company_id = $1
      GROUP BY i.id
      ORDER BY last_transaction_date DESC
    `, [companyId]);

    return result.rows;
  }

  /**
   * Get activity summary from database
   */
  async getSummary(companyId, period = '90d') {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT * FROM insider_activity_summary
      WHERE company_id = $1 AND period = $2
    `, [companyId, period]);

    return result.rows[0];
  }

  /**
   * Check and generate alerts for significant insider activity
   */
  async checkForAlerts(companyId, transaction, insider) {
    const alerts = [];

    // Only alert on open market buys/sells
    if (transaction.transactionType !== 'buy' && transaction.transactionType !== 'sell') {
      return alerts;
    }

    const value = transaction.totalValue || 0;
    const isBuy = transaction.transactionType === 'buy';

    // CEO buy - always alert
    if (isBuy && this.isCeo(insider)) {
      alerts.push({
        eventType: EVENT_TYPES.CEO_BUY,
        headline: `CEO ${insider.name} purchased $${this.formatValue(value)} in stock`,
        significance: 9,
        isPositive: true,
      });
    }
    // CFO buy
    else if (isBuy && this.isCfo(insider)) {
      alerts.push({
        eventType: EVENT_TYPES.CFO_BUY,
        headline: `CFO ${insider.name} purchased $${this.formatValue(value)} in stock`,
        significance: 8,
        isPositive: true,
      });
    }
    // Large insider buy (>$100K)
    else if (isBuy && value >= 100000) {
      alerts.push({
        eventType: EVENT_TYPES.INSIDER_BUY_LARGE,
        headline: `${insider.name} (${insider.title || insider.officerTitle || 'Insider'}) purchased $${this.formatValue(value)} in stock`,
        significance: value >= 500000 ? 8 : 7,
        isPositive: true,
      });
    }
    // Large insider sell (>$1M)
    else if (!isBuy && value >= 1000000) {
      alerts.push({
        eventType: EVENT_TYPES.INSIDER_SELL_LARGE,
        headline: `${insider.name} (${insider.title || insider.officerTitle || 'Insider'}) sold $${this.formatValue(value)} in stock`,
        significance: 5,
        isPositive: false,
      });
    }

    // Store alerts
    for (const alert of alerts) {
      await this.storeAlert(companyId, transaction, insider, alert);
    }

    return alerts;
  }

  /**
   * Store an alert event
   */
  async storeAlert(companyId, transaction, insider, alert) {
    try {
      const database = await getDatabaseAsync();

      await database.query(`
        INSERT INTO significant_events (
          company_id, event_type, event_date, headline,
          value, value_formatted, significance_score, is_positive,
          source_type, accession_number, insider_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'form4', $9, $10)
      `, [
        companyId,
        alert.eventType,
        transaction.transactionDate,
        alert.headline,
        transaction.totalValue,
        `$${this.formatValue(transaction.totalValue)}`,
        alert.significance,
        alert.isPositive ? true : false,
        transaction.accessionNumber,
        insider.id
      ]);
    } catch (error) {
      // Ignore duplicate events
    }
  }

  /**
   * Get significant events for a company
   */
  async getSignificantEvents(companyId, options = {}) {
    const database = await getDatabaseAsync();
    const { limit = 20, eventType } = options;

    let whereClause = 'WHERE company_id = $1';
    const params = [companyId];
    let paramCounter = 2;

    if (eventType) {
      whereClause += ` AND event_type = $${paramCounter++}`;
      params.push(eventType);
    }

    params.push(limit);

    const result = await database.query(`
      SELECT * FROM significant_events
      ${whereClause}
      ORDER BY event_date DESC, significance_score DESC
      LIMIT $${paramCounter}
    `, params);

    return result.rows;
  }

  /**
   * Get companies with strongest insider buying signals
   */
  async getTopInsiderBuying(limit = 20, period = '90d') {
    const database = await getDatabaseAsync();

    const result = await database.query(`
      SELECT
        s.*,
        c.symbol,
        c.name as company_name,
        c.sector,
        c.industry
      FROM insider_activity_summary s
      JOIN companies c ON s.company_id = c.id
      WHERE s.period = $1
        AND s.insider_signal IN ('bullish', 'slightly_bullish')
      ORDER BY s.signal_score DESC, s.buy_value DESC
      LIMIT $2
    `, [period, limit]);

    return result.rows;
  }

  // Helper methods
  parsePeriod(period) {
    const match = period.match(/^(\d+)([dmy])$/);
    if (!match) return 90;
    const [, num, unit] = match;
    switch (unit) {
      case 'd': return parseInt(num);
      case 'm': return parseInt(num) * 30;
      case 'y': return parseInt(num) * 365;
      default: return 90;
    }
  }

  isCeo(insider) {
    const title = (insider.insider_title || insider.title || insider.officerTitle || '').toLowerCase();
    return /\b(ceo|chief\s+executive)\b/.test(title);
  }

  isCfo(insider) {
    const title = (insider.insider_title || insider.title || insider.officerTitle || '').toLowerCase();
    return /\b(cfo|chief\s+financial)\b/.test(title);
  }

  formatValue(value) {
    if (!value) return '0';
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
    return value.toFixed(0);
  }
}

module.exports = InsiderTracker;
