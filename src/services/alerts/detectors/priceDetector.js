// src/services/alerts/detectors/priceDetector.js
// Detects price-based alerts (52w lows, RSI, SMA crossings)

const { ALERT_DEFINITIONS } = require('../alertDefinitions');
const { getDatabaseAsync } = require('../../../database');

class PriceDetector {
  constructor() {
    this.definitions = ALERT_DEFINITIONS.price;
  }

  async detect(company, previousState) {
    const alerts = [];
    const prev = previousState || {};

    // Get current price metrics
    const metrics = await this.getPriceMetrics(company.id);
    if (!metrics || !metrics.lastPrice) return alerts;

    // Near 52-week low (within 10%)
    if (metrics.low52w && metrics.low52w > 0) {
      const pctFromLow = ((metrics.lastPrice - metrics.low52w) / metrics.low52w) * 100;
      const isNear52wLow = pctFromLow <= 10;

      if (isNear52wLow && !prev.price_near_52w_low) {
        alerts.push(this.createAlert(company, 'near_52w_low', {
          price: metrics.lastPrice,
          low52w: metrics.low52w,
          pctFromLow: pctFromLow
        }));
      }

      // New 52-week low (within 1%)
      const isNew52wLow = pctFromLow <= 1;
      if (isNew52wLow) {
        alerts.push(this.createAlert(company, 'new_52w_low', {
          price: metrics.lastPrice,
          low52w: metrics.low52w
        }));
      }
    }

    // RSI oversold
    if (metrics.rsi14 !== null) {
      // RSI below 30
      const isOversold = metrics.rsi14 < 30;
      if (isOversold && !prev.rsi_oversold) {
        alerts.push(this.createAlert(company, 'rsi_oversold', {
          rsi: metrics.rsi14
        }));
      }

      // RSI below 20 (deeply oversold)
      const isDeeplyOversold = metrics.rsi14 < 20;
      if (isDeeplyOversold && !prev.rsi_deeply_oversold) {
        alerts.push(this.createAlert(company, 'rsi_deeply_oversold', {
          rsi: metrics.rsi14
        }));
      }
    }

    // Below 200 SMA
    if (metrics.sma200 && metrics.sma200 > 0) {
      const isBelowSMA200 = metrics.lastPrice < metrics.sma200;
      if (isBelowSMA200 && !prev.below_sma_200) {
        alerts.push(this.createAlert(company, 'crossed_below_sma200', {
          price: metrics.lastPrice,
          sma200: metrics.sma200
        }));
      }
    }

    // Significant price drops
    if (metrics.change1w !== null && metrics.change1w < -15) {
      alerts.push(this.createAlert(company, 'significant_drop_5d', {
        change: metrics.change1w
      }));
    }

    if (metrics.change1m !== null && metrics.change1m < -25) {
      alerts.push(this.createAlert(company, 'significant_drop_1m', {
        change: metrics.change1m
      }));
    }

    return alerts;
  }

  async getPriceMetrics(companyId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        last_price as lastPrice,
        high_52w as high52w,
        low_52w as low52w,
        sma_50 as sma50,
        sma_200 as sma200,
        rsi_14 as rsi14,
        change_1d as change1d,
        change_1w as change1w,
        change_1m as change1m,
        change_3m as change3m,
        volatility_30d as volatility
      FROM price_metrics
      WHERE company_id = $1
    `, [companyId]);

    return result.rows[0];
  }

  /**
   * Get current state for updating alert_state table
   */
  async getCurrentState(companyId) {
    const metrics = await this.getPriceMetrics(companyId);
    if (!metrics) return {};

    const pctFromLow = metrics.low52w > 0
      ? ((metrics.lastPrice - metrics.low52w) / metrics.low52w) * 100
      : null;

    const pctFromHigh = metrics.high52w > 0
      ? ((metrics.high52w - metrics.lastPrice) / metrics.high52w) * 100
      : null;

    return {
      price_near_52w_low: pctFromLow !== null && pctFromLow <= 10,
      price_near_52w_high: pctFromHigh !== null && pctFromHigh <= 5,
      below_sma_200: metrics.sma200 > 0 && metrics.lastPrice < metrics.sma200,
      rsi_oversold: metrics.rsi14 !== null && metrics.rsi14 < 30,
      rsi_overbought: metrics.rsi14 !== null && metrics.rsi14 > 70
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
      alert_type: 'price',
      alert_code: alertCode,
      signal_type: def.signal,
      priority: def.priority,
      title: `${company.symbol}: ${def.name}`,
      description: def.getMessage(data),
      data: data,
      triggered_by: 'price_detector',
      expires_at: this.getExpiry(alertCode)
    };
  }

  getExpiry(alertCode) {
    // Price alerts expire more quickly
    const hours = {
      'near_52w_low': 72,
      'new_52w_low': 24,
      'rsi_oversold': 48,
      'rsi_deeply_oversold': 24,
      'crossed_below_sma200': 168,
      'significant_drop_5d': 48,
      'significant_drop_1m': 72
    };

    const h = hours[alertCode] || 72;
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + h);
    return expiry.toISOString();
  }
}

module.exports = PriceDetector;
