// src/services/alerts/detectors/fundamentalDetector.js
// Detects fundamental alerts (ROIC, margins, debt, FCF)

const { getDatabaseAsync } = require('../../../database');
const { ALERT_DEFINITIONS } = require('../alertDefinitions');

class FundamentalDetector {
  constructor() {
    this.definitions = ALERT_DEFINITIONS.fundamental;
  }

  async detect(company, previousState) {
    const alerts = [];
    const prev = previousState || {};

    // Get current and previous fundamental metrics
    const metrics = await this.getFundamentalMetrics(company.id);
    if (!metrics.current) return alerts;

    const current = metrics.current;
    const previous = metrics.previous || {};

    // ROIC crossed 15%
    if (current.roic !== null) {
      const isAbove15 = current.roic >= 15;
      if (isAbove15 && !prev.roic_above_15) {
        alerts.push(this.createAlert(company, 'roic_crossed_15', {
          roic: current.roic
        }));
      }

      // ROIC crossed 20%
      const isAbove20 = current.roic >= 20;
      if (isAbove20 && !prev.roic_above_20) {
        alerts.push(this.createAlert(company, 'roic_crossed_20', {
          roic: current.roic
        }));
      }

      // ROIC deterioration (was above 15, now below 12)
      if (previous.roic && previous.roic >= 15 && current.roic < 12) {
        alerts.push(this.createAlert(company, 'roic_deteriorated', {
          previous: previous.roic,
          current: current.roic
        }));
      }
    }

    // Margin changes
    if (current.operatingMargin !== null && previous.operatingMargin !== null) {
      // Margin expansion (>10% improvement)
      if (current.operatingMargin > previous.operatingMargin * 1.1) {
        if (!prev.margin_expanding) {
          alerts.push(this.createAlert(company, 'margin_expansion', {
            previous: previous.operatingMargin,
            current: current.operatingMargin
          }));
        }
      }

      // Margin compression (>15% decline)
      if (current.operatingMargin < previous.operatingMargin * 0.85) {
        if (!prev.margin_contracting) {
          alerts.push(this.createAlert(company, 'margin_compression', {
            previous: previous.operatingMargin,
            current: current.operatingMargin
          }));
        }
      }
    }

    // Debt level checks
    if (current.debtEquity !== null) {
      // Debt improved below 0.5
      const isLowDebt = current.debtEquity < 0.5;
      if (isLowDebt && !prev.debt_equity_below_05) {
        alerts.push(this.createAlert(company, 'debt_improved', {
          debtEquity: current.debtEquity
        }));
      }

      // Debt warning (increased significantly to high level)
      if (previous.debtEquity !== null &&
          current.debtEquity > previous.debtEquity * 1.3 &&
          current.debtEquity > 0.8) {
        alerts.push(this.createAlert(company, 'debt_warning', {
          previous: previous.debtEquity,
          current: current.debtEquity
        }));
      }
    }

    // FCF changes
    if (current.fcf !== null && previous.fcf !== null) {
      // FCF turned positive
      if (current.fcf > 0 && previous.fcf <= 0 && !prev.fcf_positive) {
        alerts.push(this.createAlert(company, 'fcf_turned_positive', {
          fcf: current.fcf
        }));
      }

      // FCF turned negative
      if (current.fcf <= 0 && previous.fcf > 0) {
        alerts.push(this.createAlert(company, 'fcf_turned_negative', {
          fcf: current.fcf
        }));
      }
    }

    return alerts;
  }

  async getFundamentalMetrics(companyId) {
    // Get current and previous period metrics
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        roic,
        operating_margin as operatingMargin,
        net_margin as netMargin,
        debt_to_equity as debtEquity,
        fcf,
        fcf_yield as fcfYield,
        fiscal_period
      FROM calculated_metrics
      WHERE company_id = $1
        AND period_type = 'annual'
      ORDER BY fiscal_period DESC
      LIMIT 2
    `, [companyId]);

    const rows = result.rows;
    return {
      current: rows[0] || null,
      previous: rows[1] || null
    };
  }

  /**
   * Get current state for updating alert_state table
   */
  async getCurrentState(companyId) {
    const { current, previous } = await this.getFundamentalMetrics(companyId);
    if (!current) return {};

    const marginExpanding = previous && current.operatingMargin > previous.operatingMargin * 1.1;
    const marginContracting = previous && current.operatingMargin < previous.operatingMargin * 0.85;

    return {
      roic_above_15: current.roic >= 15 ? true : false,
      roic_above_20: current.roic >= 20 ? true : false,
      debt_equity_below_05: current.debtEquity !== null && current.debtEquity < 0.5 ? true : false,
      fcf_positive: current.fcf !== null && current.fcf > 0 ? true : false,
      margin_expanding: marginExpanding ? true : false,
      margin_contracting: marginContracting ? true : false
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
      alert_type: 'fundamental',
      alert_code: alertCode,
      signal_type: def.signal,
      priority: def.priority,
      title: `${company.symbol}: ${def.name}`,
      description: def.getMessage(data),
      data: data,
      triggered_by: 'fundamental_detector'
    };
  }
}

module.exports = FundamentalDetector;
