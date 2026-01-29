// src/services/alerts/detectors/filingDetector.js
// Detects filing-related alerts (insider transactions)

const { ALERT_DEFINITIONS } = require('../alertDefinitions');

class FilingDetector {
  constructor(db) {
    this.db = db;
    this.definitions = ALERT_DEFINITIONS.filing;
  }

  async detect(company, previousState) {
    const alerts = [];

    // Check insider transactions
    const insiderActivity = this.getRecentInsiderActivity(company.id);

    // Insider buying cluster (3+ buyers in 30 days)
    if (insiderActivity.buyCount >= 3) {
      alerts.push(this.createAlert(company, 'insider_buying_cluster', {
        count: insiderActivity.buyCount,
        days: 30,
        totalValue: insiderActivity.buyValue
      }));
    }

    // Large individual insider buy (>$500K)
    const largeBuys = this.getLargeInsiderBuys(company.id);
    for (const buy of largeBuys) {
      if (buy.value >= 500000) {
        alerts.push(this.createAlert(company, 'large_insider_buy', {
          insiderName: buy.insider_name,
          title: buy.insider_title,
          value: buy.value,
          shares: buy.shares
        }));
      }
    }

    // Individual insider buys (>$100K, not already covered by cluster or large)
    if (insiderActivity.buyCount < 3) {
      const recentBuys = this.getRecentInsiderBuys(company.id);
      for (const buy of recentBuys) {
        if (buy.value >= 100000 && buy.value < 500000) {
          alerts.push(this.createAlert(company, 'insider_buying', {
            insiderName: buy.insider_name,
            title: buy.insider_title,
            value: buy.value,
            shares: buy.shares
          }));
        }
      }
    }

    // Insider selling cluster (warning)
    if (insiderActivity.sellCount >= 3) {
      alerts.push(this.createAlert(company, 'insider_selling_cluster', {
        count: insiderActivity.sellCount,
        days: 30,
        totalValue: insiderActivity.sellValue
      }));
    }

    return alerts;
  }

  getRecentInsiderActivity(companyId) {
    const row = this.db.prepare(`
      SELECT
        SUM(CASE WHEN transaction_type = 'Buy' OR transaction_code = 'P' THEN 1 ELSE 0 END) as buyCount,
        SUM(CASE WHEN transaction_type = 'Buy' OR transaction_code = 'P' THEN COALESCE(total_value, 0) ELSE 0 END) as buyValue,
        SUM(CASE WHEN transaction_type = 'Sell' OR transaction_code = 'S' THEN 1 ELSE 0 END) as sellCount,
        SUM(CASE WHEN transaction_type = 'Sell' OR transaction_code = 'S' THEN COALESCE(total_value, 0) ELSE 0 END) as sellValue
      FROM insider_transactions
      WHERE company_id = ?
        AND transaction_date >= date('now', '-30 days')
    `).get(companyId);

    return row || { buyCount: 0, buyValue: 0, sellCount: 0, sellValue: 0 };
  }

  getLargeInsiderBuys(companyId) {
    return this.db.prepare(`
      SELECT
        i.name as insider_name,
        i.title as insider_title,
        it.shares_transacted as shares,
        it.total_value as value,
        it.transaction_date
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.company_id = ?
        AND (it.transaction_type = 'Buy' OR it.transaction_code = 'P')
        AND it.total_value >= 500000
        AND it.transaction_date >= date('now', '-7 days')
      ORDER BY it.total_value DESC
      LIMIT 5
    `).all(companyId);
  }

  getRecentInsiderBuys(companyId) {
    return this.db.prepare(`
      SELECT
        i.name as insider_name,
        i.title as insider_title,
        it.shares_transacted as shares,
        it.total_value as value,
        it.transaction_date
      FROM insider_transactions it
      JOIN insiders i ON it.insider_id = i.id
      WHERE it.company_id = ?
        AND (it.transaction_type = 'Buy' OR it.transaction_code = 'P')
        AND it.total_value >= 100000
        AND it.transaction_date >= date('now', '-7 days')
      ORDER BY it.transaction_date DESC
      LIMIT 5
    `).all(companyId);
  }

  createAlert(company, alertCode, data) {
    const def = this.definitions[alertCode];
    if (!def) {
      console.warn(`Unknown alert code: ${alertCode}`);
      return null;
    }

    return {
      company_id: company.id,
      alert_type: 'filing',
      alert_code: alertCode,
      signal_type: def.signal,
      priority: def.priority,
      title: `${company.symbol}: ${def.name}`,
      description: def.getMessage(data),
      data: data,
      triggered_by: 'filing_detector'
    };
  }
}

module.exports = FilingDetector;
