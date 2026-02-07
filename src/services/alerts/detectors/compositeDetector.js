// src/services/alerts/detectors/compositeDetector.js
// Detects composite alerts (combinations of multiple signals)

const { getDatabaseAsync } = require('../../../database');
const { ALERT_DEFINITIONS } = require('../alertDefinitions');

class CompositeDetector {
  constructor() {
    this.definitions = ALERT_DEFINITIONS.composite;
  }

  async detect(company, previousState, otherAlerts = []) {
    const alerts = [];
    const prev = previousState || {};

    // Get comprehensive metrics
    const metrics = await this.getCompositeMetrics(company.id);
    if (!metrics) return alerts;

    // Count buy signals from other alerts
    const buySignals = otherAlerts.filter(a =>
      a.signal_type === 'buy' || a.signal_type === 'strong_buy'
    );
    const warnings = otherAlerts.filter(a => a.signal_type === 'warning');

    // Quality + Value Convergence
    if (this.isQualityValueConvergence(metrics) && !prev.quality_and_value) {
      alerts.push(this.createAlert(company, 'quality_value_convergence', {
        roic: metrics.roic,
        discount: metrics.dcfDiscount,
        debtEquity: metrics.debtEquity,
        pe: metrics.pe
      }));
    }

    // Triple Buy Signal (3+ buy signals)
    if (buySignals.length >= 3) {
      alerts.push(this.createAlert(company, 'triple_buy_signal', {
        count: buySignals.length,
        signals: buySignals.map(a => a.alert_code)
      }));
    }

    // Fallen Angel (quality company down significantly)
    if (this.isFallenAngel(metrics, company.id) && !prev.fallen_angel) {
      alerts.push(this.createAlert(company, 'fallen_angel', {
        roic: metrics.roic,
        dropPct: metrics.dropFromHigh,
        pe: metrics.pe
      }));
    }

    // Accumulation Zone (oversold + insider buying + quality)
    if (await this.isAccumulationZone(metrics, company.id)) {
      alerts.push(this.createAlert(company, 'accumulation_zone', {
        rsi: metrics.rsi,
        roic: metrics.roic,
        insiderBuying: true
      }));
    }

    // Red Flag Cluster (3+ warnings)
    if (warnings.length >= 3) {
      alerts.push(this.createAlert(company, 'red_flag_cluster', {
        count: warnings.length,
        warnings: warnings.map(a => a.alert_code)
      }));
    }

    return alerts;
  }

  async getCompositeMetrics(companyId) {
    const database = getDatabaseAsync();
    const result = await database.query(`
      SELECT
        cm.roic,
        cm.operating_margin as operatingMargin,
        cm.debt_to_equity as debtEquity,
        cm.pe_ratio as pe,
        cm.pb_ratio as pb,
        cm.fcf,
        cm.fcf_yield as fcfYield,
        pm.last_price as price,
        pm.high_52w as high52w,
        pm.low_52w as low52w,
        pm.rsi_14 as rsi,
        dcf.intrinsic_value_per_share as intrinsicValue,
        CASE
          WHEN dcf.intrinsic_value_per_share > 0 AND pm.last_price > 0
          THEN ((dcf.intrinsic_value_per_share - pm.last_price) / dcf.intrinsic_value_per_share * 100)
          ELSE NULL
        END as dcfDiscount,
        CASE
          WHEN pm.high_52w > 0 AND pm.last_price > 0
          THEN ((pm.high_52w - pm.last_price) / pm.high_52w * 100)
          ELSE NULL
        END as dropFromHigh
      FROM companies c
      LEFT JOIN calculated_metrics cm ON c.id = cm.company_id AND cm.period_type = 'annual'
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      LEFT JOIN dcf_valuations dcf ON c.id = dcf.company_id
      WHERE c.id = $1
      ORDER BY cm.fiscal_period DESC
      LIMIT 1
    `, [companyId]);

    return result.rows[0];
  }

  /**
   * Quality + Value: ROIC > 15%, DCF undervalued, low debt
   */
  isQualityValueConvergence(metrics) {
    return (
      metrics.roic >= 15 &&
      metrics.dcfDiscount >= 25 &&
      (metrics.debtEquity === null || metrics.debtEquity < 0.5)
    );
  }

  /**
   * Fallen Angel: Was quality, now trading cheap
   */
  isFallenAngel(metrics, companyId) {
    // Quality metrics still OK
    const hasQuality = metrics.roic >= 12 && metrics.operatingMargin > 10;

    // Significant price drop
    const hasFallen = metrics.dropFromHigh >= 30;

    // Valuation now attractive
    const isValue = (
      (metrics.pe > 0 && metrics.pe < 15) ||
      (metrics.dcfDiscount >= 20)
    );

    return hasQuality && hasFallen && isValue;
  }

  /**
   * Accumulation Zone: RSI oversold + insider buying + quality
   */
  async isAccumulationZone(metrics, companyId) {
    // RSI oversold
    if (!metrics.rsi || metrics.rsi >= 30) return false;

    // Quality stock
    if (!metrics.roic || metrics.roic < 12) return false;

    // Recent insider buying
    const insiderBuying = await this.hasRecentInsiderBuying(companyId);

    return insiderBuying;
  }

  /**
   * Check for recent insider buying activity
   */
  async hasRecentInsiderBuying(companyId) {
    const database = getDatabaseAsync();
    const result = await database.query(`
      SELECT COUNT(*) as count
      FROM insider_transactions
      WHERE company_id = $1
        AND transaction_type = 'Buy'
        AND transaction_date >= CURRENT_DATE - INTERVAL '30 days'
    `, [companyId]);

    const row = result.rows[0];
    return row && row.count >= 2;
  }

  /**
   * Get current state for updating alert_state table
   */
  async getCurrentState(companyId) {
    const metrics = await this.getCompositeMetrics(companyId);
    if (!metrics) return {};

    return {
      quality_and_value: this.isQualityValueConvergence(metrics),
      fallen_angel: this.isFallenAngel(metrics, companyId)
    };
  }

  createAlert(company, alertCode, data) {
    const def = this.definitions[alertCode];
    if (!def) {
      console.warn(`Unknown alert code: ${alertCode}`);
      return null;
    }

    return {
      company_id: company.id,
      alert_type: 'composite',
      alert_code: alertCode,
      signal_type: def.signal,
      priority: def.priority,
      title: `${company.symbol}: ${def.name}`,
      description: def.getMessage(data),
      data: data,
      triggered_by: 'composite_detector'
    };
  }
}

module.exports = CompositeDetector;
