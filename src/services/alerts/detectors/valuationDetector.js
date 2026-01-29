// src/services/alerts/detectors/valuationDetector.js
// Detects valuation-based alerts (DCF, P/E, P/B, FCF Yield)

const { ALERT_DEFINITIONS } = require('../alertDefinitions');

class ValuationDetector {
  constructor(db) {
    this.db = db;
    this.definitions = ALERT_DEFINITIONS.valuation;
  }

  async detect(company, previousState) {
    const alerts = [];
    const prev = previousState || {};

    // Get current valuation metrics
    const metrics = this.getCurrentMetrics(company.id);
    if (!metrics) return alerts;

    // DCF Undervaluation checks
    if (metrics.dcfDiscount !== null && metrics.dcfDiscount > 0) {
      // 25% undervalued
      const isUndervalued25 = metrics.dcfDiscount >= 25;
      if (isUndervalued25 && !prev.dcf_undervalued_25) {
        alerts.push(this.createAlert(company, 'dcf_undervalued_25', {
          discount: metrics.dcfDiscount,
          intrinsic: metrics.intrinsicValue,
          current: metrics.currentPrice
        }));
      }

      // 50% undervalued (strong buy)
      const isUndervalued50 = metrics.dcfDiscount >= 50;
      if (isUndervalued50 && !prev.dcf_undervalued_50) {
        alerts.push(this.createAlert(company, 'dcf_undervalued_50', {
          discount: metrics.dcfDiscount,
          intrinsic: metrics.intrinsicValue,
          current: metrics.currentPrice
        }));
      }
    }

    // P/E checks
    if (metrics.pe !== null && metrics.pe > 0) {
      // P/E below 15 (Graham)
      const isPEBelow15 = metrics.pe < 15;
      if (isPEBelow15 && !prev.pe_below_15) {
        alerts.push(this.createAlert(company, 'pe_below_15', {
          pe: metrics.pe
        }));
      }

      // P/E below 10 (deep value)
      const isPEBelow10 = metrics.pe < 10;
      if (isPEBelow10 && !prev.pe_below_10) {
        alerts.push(this.createAlert(company, 'pe_below_10', {
          pe: metrics.pe
        }));
      }
    }

    // P/B checks
    if (metrics.pb !== null && metrics.pb > 0) {
      const isPBBelow1 = metrics.pb < 1;
      if (isPBBelow1 && !prev.pb_below_1) {
        alerts.push(this.createAlert(company, 'pb_below_1', {
          pb: metrics.pb
        }));
      }
    }

    // FCF Yield check
    if (metrics.fcfYield !== null && metrics.fcfYield > 0) {
      // FCF yield above 10%
      const isFCFYieldHigh = metrics.fcfYield > 10;
      if (isFCFYieldHigh && !prev.fcf_yield_above_10) {
        alerts.push(this.createAlert(company, 'fcf_yield_above_10', {
          fcfYield: metrics.fcfYield
        }));
      }

      // FCF yield above 15% (exceptional)
      const isFCFYieldExceptional = metrics.fcfYield > 15;
      if (isFCFYieldExceptional && !prev.fcf_yield_above_15) {
        alerts.push(this.createAlert(company, 'fcf_yield_above_15', {
          fcfYield: metrics.fcfYield
        }));
      }
    }

    return alerts;
  }

  getCurrentMetrics(companyId) {
    // Join DCF valuations, price metrics, and get most recent non-null calculated metrics
    const row = this.db.prepare(`
      SELECT
        pm.last_price as currentPrice,
        dcf.intrinsic_value_per_share as intrinsicValue,
        CASE
          WHEN dcf.intrinsic_value_per_share > 0 AND pm.last_price > 0
          THEN ((dcf.intrinsic_value_per_share - pm.last_price) / dcf.intrinsic_value_per_share * 100)
          ELSE NULL
        END as dcfDiscount,
        (SELECT pe_ratio FROM calculated_metrics WHERE company_id = c.id AND pe_ratio IS NOT NULL ORDER BY fiscal_period DESC LIMIT 1) as pe,
        (SELECT pb_ratio FROM calculated_metrics WHERE company_id = c.id AND pb_ratio IS NOT NULL ORDER BY fiscal_period DESC LIMIT 1) as pb,
        (SELECT fcf_yield FROM calculated_metrics WHERE company_id = c.id AND fcf_yield IS NOT NULL ORDER BY fiscal_period DESC LIMIT 1) as fcfYield,
        (SELECT roic FROM calculated_metrics WHERE company_id = c.id AND roic IS NOT NULL ORDER BY fiscal_period DESC LIMIT 1) as roic,
        (SELECT debt_to_equity FROM calculated_metrics WHERE company_id = c.id AND debt_to_equity IS NOT NULL ORDER BY fiscal_period DESC LIMIT 1) as debtEquity
      FROM companies c
      LEFT JOIN price_metrics pm ON c.id = pm.company_id
      LEFT JOIN dcf_valuations dcf ON c.id = dcf.company_id
      WHERE c.id = ?
      ORDER BY dcf.calculated_at DESC
      LIMIT 1
    `).get(companyId);

    return row;
  }

  /**
   * Get current state for updating alert_state table
   */
  getCurrentState(companyId) {
    const metrics = this.getCurrentMetrics(companyId);
    if (!metrics) return {};

    return {
      dcf_undervalued_25: metrics.dcfDiscount >= 25 ? 1 : 0,
      dcf_undervalued_50: metrics.dcfDiscount >= 50 ? 1 : 0,
      pe_below_15: metrics.pe > 0 && metrics.pe < 15 ? 1 : 0,
      pe_below_10: metrics.pe > 0 && metrics.pe < 10 ? 1 : 0,
      pb_below_1: metrics.pb > 0 && metrics.pb < 1 ? 1 : 0,
      fcf_yield_above_10: metrics.fcfYield > 10 ? 1 : 0,
      fcf_yield_above_15: metrics.fcfYield > 15 ? 1 : 0
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
      alert_type: 'valuation',
      alert_code: alertCode,
      signal_type: def.signal,
      priority: def.priority,
      title: `${company.symbol}: ${def.name}`,
      description: def.getMessage(data),
      data: data,
      triggered_by: 'valuation_detector'
    };
  }
}

module.exports = ValuationDetector;
