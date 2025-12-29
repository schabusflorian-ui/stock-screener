/**
 * Portfolio Alerts Service
 * Monitors portfolios for alert conditions and creates notifications
 */

const {
  PORTFOLIO_ALERT_TYPES,
  ALERT_SEVERITY,
  DEFAULT_ALERT_THRESHOLDS
} = require('../../constants/portfolio');

class PortfolioAlertsService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get alert settings for a portfolio
   */
  getAlertSettings(portfolioId) {
    const settings = this.db.prepare(`
      SELECT * FROM portfolio_alert_settings
      WHERE portfolio_id = ?
    `).all(portfolioId);

    // Merge with defaults
    const result = {};
    for (const [type, defaultThreshold] of Object.entries(DEFAULT_ALERT_THRESHOLDS)) {
      const setting = settings.find(s => s.alert_type === type);
      result[type] = {
        enabled: setting ? setting.enabled === 1 : true,
        threshold: setting?.threshold ?? defaultThreshold
      };
    }

    // Add settings for alerts without default thresholds
    const alertsWithoutDefaults = [
      PORTFOLIO_ALERT_TYPES.STOP_LOSS_TRIGGERED,
      PORTFOLIO_ALERT_TYPES.TAKE_PROFIT_TRIGGERED,
      PORTFOLIO_ALERT_TYPES.DIVIDEND_RECEIVED,
      PORTFOLIO_ALERT_TYPES.REBALANCE_NEEDED,
      PORTFOLIO_ALERT_TYPES.NEW_HIGH
    ];

    for (const type of alertsWithoutDefaults) {
      const setting = settings.find(s => s.alert_type === type);
      result[type] = {
        enabled: setting ? setting.enabled === 1 : true,
        threshold: setting?.threshold ?? null
      };
    }

    return result;
  }

  /**
   * Update alert setting for a portfolio
   */
  updateAlertSetting(portfolioId, alertType, { enabled, threshold }) {
    const existing = this.db.prepare(`
      SELECT id FROM portfolio_alert_settings
      WHERE portfolio_id = ? AND alert_type = ?
    `).get(portfolioId, alertType);

    if (existing) {
      this.db.prepare(`
        UPDATE portfolio_alert_settings
        SET enabled = ?, threshold = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(enabled ? 1 : 0, threshold, existing.id);
    } else {
      this.db.prepare(`
        INSERT INTO portfolio_alert_settings (portfolio_id, alert_type, enabled, threshold)
        VALUES (?, ?, ?, ?)
      `).run(portfolioId, alertType, enabled ? 1 : 0, threshold);
    }

    return this.getAlertSettings(portfolioId);
  }

  /**
   * Create a new alert
   */
  createAlert(portfolioId, alertType, { message, data, severity = ALERT_SEVERITY.INFO }) {
    const result = this.db.prepare(`
      INSERT INTO portfolio_alerts (portfolio_id, alert_type, message, data, severity)
      VALUES (?, ?, ?, ?, ?)
    `).run(portfolioId, alertType, message, JSON.stringify(data), severity);

    return {
      id: result.lastInsertRowid,
      portfolioId,
      alertType,
      message,
      data,
      severity,
      isRead: false,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Get alerts for a portfolio
   */
  getAlerts(portfolioId, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
    let query = `
      SELECT * FROM portfolio_alerts
      WHERE portfolio_id = ?
    `;
    const params = [portfolioId];

    if (unreadOnly) {
      query += ` AND is_read = 0`;
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const alerts = this.db.prepare(query).all(...params);

    return alerts.map(a => ({
      id: a.id,
      portfolioId: a.portfolio_id,
      alertType: a.alert_type,
      severity: a.severity,
      message: a.message,
      data: a.data ? JSON.parse(a.data) : null,
      isRead: a.is_read === 1,
      isDismissed: a.is_dismissed === 1,
      createdAt: a.created_at,
      readAt: a.read_at
    }));
  }

  /**
   * Get unread alert count for a portfolio
   */
  getUnreadCount(portfolioId) {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM portfolio_alerts
      WHERE portfolio_id = ? AND is_read = 0
    `).get(portfolioId);
    return result.count;
  }

  /**
   * Mark alert(s) as read
   */
  markAsRead(alertIds) {
    if (!Array.isArray(alertIds)) {
      alertIds = [alertIds];
    }

    const placeholders = alertIds.map(() => '?').join(',');
    this.db.prepare(`
      UPDATE portfolio_alerts
      SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(...alertIds);

    return { updated: alertIds.length };
  }

  /**
   * Mark all alerts as read for a portfolio
   */
  markAllAsRead(portfolioId) {
    const result = this.db.prepare(`
      UPDATE portfolio_alerts
      SET is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE portfolio_id = ? AND is_read = 0
    `).run(portfolioId);

    return { updated: result.changes };
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(alertId) {
    this.db.prepare(`
      UPDATE portfolio_alerts
      SET is_dismissed = 1, is_read = 1, read_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(alertId);
  }

  /**
   * Delete old alerts (cleanup)
   */
  cleanupOldAlerts(daysOld = 30) {
    const result = this.db.prepare(`
      DELETE FROM portfolio_alerts
      WHERE created_at < datetime('now', '-' || ? || ' days')
        AND is_dismissed = 1
    `).run(daysOld);

    return { deleted: result.changes };
  }

  /**
   * Check all alert conditions for a portfolio
   */
  checkPortfolioAlerts(portfolioId, portfolioData) {
    const settings = this.getAlertSettings(portfolioId);
    const triggeredAlerts = [];

    // Check drawdown
    if (settings[PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD]?.enabled) {
      const alert = this._checkDrawdownAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    // Check position concentration
    if (settings[PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION]?.enabled) {
      const alerts = this._checkConcentrationAlerts(portfolioId, portfolioData, settings);
      triggeredAlerts.push(...alerts);
    }

    // Check daily gain/loss
    if (settings[PORTFOLIO_ALERT_TYPES.DAILY_GAIN]?.enabled) {
      const alert = this._checkDailyGainAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    if (settings[PORTFOLIO_ALERT_TYPES.DAILY_LOSS]?.enabled) {
      const alert = this._checkDailyLossAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    // Check new high
    if (settings[PORTFOLIO_ALERT_TYPES.NEW_HIGH]?.enabled) {
      const alert = this._checkNewHighAlert(portfolioId, portfolioData);
      if (alert) triggeredAlerts.push(alert);
    }

    // Check cash low
    if (settings[PORTFOLIO_ALERT_TYPES.CASH_LOW]?.enabled) {
      const alert = this._checkCashLowAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    return triggeredAlerts;
  }

  /**
   * Check for drawdown alert
   */
  _checkDrawdownAlert(portfolioId, portfolioData, settings) {
    const { totalValue, highWaterMark } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD].threshold;

    if (!highWaterMark || highWaterMark === 0) return null;

    const drawdownPct = ((highWaterMark - totalValue) / highWaterMark) * 100;

    if (drawdownPct >= threshold) {
      // Check if we already alerted for this drawdown level today
      const existingAlert = this.db.prepare(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = ?
          AND alert_type = ?
          AND created_at >= date('now')
          AND json_extract(data, '$.drawdownPct') >= ?
      `).get(portfolioId, PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD, drawdownPct - 1);

      if (existingAlert) return null;

      return this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD, {
        message: `Portfolio drawdown of ${drawdownPct.toFixed(2)}% exceeds ${threshold}% threshold`,
        data: {
          drawdownPct: parseFloat(drawdownPct.toFixed(2)),
          threshold,
          currentValue: totalValue,
          highWaterMark
        },
        severity: drawdownPct >= threshold * 1.5 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING
      });
    }

    return null;
  }

  /**
   * Check for position concentration alerts
   */
  _checkConcentrationAlerts(portfolioId, portfolioData, settings) {
    const { positions, totalValue } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION].threshold;
    const alerts = [];

    if (!positions || totalValue === 0) return alerts;

    for (const position of positions) {
      const concentrationPct = (position.currentValue / totalValue) * 100;

      if (concentrationPct >= threshold) {
        // Check if we already alerted for this position today
        const existingAlert = this.db.prepare(`
          SELECT id FROM portfolio_alerts
          WHERE portfolio_id = ?
            AND alert_type = ?
            AND created_at >= date('now')
            AND json_extract(data, '$.symbol') = ?
        `).get(portfolioId, PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION, position.symbol);

        if (!existingAlert) {
          alerts.push(this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION, {
            message: `${position.symbol} concentration of ${concentrationPct.toFixed(2)}% exceeds ${threshold}% threshold`,
            data: {
              symbol: position.symbol,
              concentrationPct: parseFloat(concentrationPct.toFixed(2)),
              threshold,
              positionValue: position.currentValue,
              portfolioValue: totalValue
            },
            severity: concentrationPct >= threshold * 1.5 ? ALERT_SEVERITY.WARNING : ALERT_SEVERITY.INFO
          }));
        }
      }
    }

    return alerts;
  }

  /**
   * Check for daily gain alert
   */
  _checkDailyGainAlert(portfolioId, portfolioData, settings) {
    const { dailyChangePct } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.DAILY_GAIN].threshold;

    if (dailyChangePct >= threshold) {
      // Check if we already alerted today
      const existingAlert = this.db.prepare(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = ?
          AND alert_type = ?
          AND created_at >= date('now')
      `).get(portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_GAIN);

      if (existingAlert) return null;

      return this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_GAIN, {
        message: `Portfolio gained ${dailyChangePct.toFixed(2)}% today (threshold: ${threshold}%)`,
        data: {
          dailyChangePct: parseFloat(dailyChangePct.toFixed(2)),
          threshold,
          dailyChange: portfolioData.dailyChange || 0
        },
        severity: ALERT_SEVERITY.INFO
      });
    }

    return null;
  }

  /**
   * Check for daily loss alert
   */
  _checkDailyLossAlert(portfolioId, portfolioData, settings) {
    const { dailyChangePct } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.DAILY_LOSS].threshold;

    if (dailyChangePct <= -threshold) {
      // Check if we already alerted today
      const existingAlert = this.db.prepare(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = ?
          AND alert_type = ?
          AND created_at >= date('now')
      `).get(portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_LOSS);

      if (existingAlert) return null;

      return this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_LOSS, {
        message: `Portfolio lost ${Math.abs(dailyChangePct).toFixed(2)}% today (threshold: ${threshold}%)`,
        data: {
          dailyChangePct: parseFloat(dailyChangePct.toFixed(2)),
          threshold,
          dailyChange: portfolioData.dailyChange || 0
        },
        severity: Math.abs(dailyChangePct) >= threshold * 1.5 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING
      });
    }

    return null;
  }

  /**
   * Check for new all-time high alert
   */
  _checkNewHighAlert(portfolioId, portfolioData) {
    const { totalValue, highWaterMark, previousHighWaterMark } = portfolioData;

    // Only alert if this is a NEW high (higher than previous high)
    if (totalValue > highWaterMark && (!previousHighWaterMark || totalValue > previousHighWaterMark)) {
      // Check if we already alerted for this high today
      const existingAlert = this.db.prepare(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = ?
          AND alert_type = ?
          AND created_at >= date('now')
      `).get(portfolioId, PORTFOLIO_ALERT_TYPES.NEW_HIGH);

      if (existingAlert) return null;

      return this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.NEW_HIGH, {
        message: `Portfolio reached new all-time high of $${totalValue.toLocaleString()}`,
        data: {
          newHigh: totalValue,
          previousHigh: highWaterMark
        },
        severity: ALERT_SEVERITY.INFO
      });
    }

    return null;
  }

  /**
   * Check for low cash alert
   */
  _checkCashLowAlert(portfolioId, portfolioData, settings) {
    const { cashBalance } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.CASH_LOW].threshold;

    if (cashBalance < threshold) {
      // Check if we already alerted for low cash today
      const existingAlert = this.db.prepare(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = ?
          AND alert_type = ?
          AND created_at >= date('now')
      `).get(portfolioId, PORTFOLIO_ALERT_TYPES.CASH_LOW);

      if (existingAlert) return null;

      return this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.CASH_LOW, {
        message: `Cash balance of $${cashBalance.toLocaleString()} is below $${threshold.toLocaleString()} threshold`,
        data: {
          cashBalance,
          threshold
        },
        severity: cashBalance < threshold / 2 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING
      });
    }

    return null;
  }

  /**
   * Create alert for triggered order (called from orderEngine)
   */
  createOrderTriggeredAlert(portfolioId, order, result) {
    const alertType = order.order_type === 'stop_loss'
      ? PORTFOLIO_ALERT_TYPES.STOP_LOSS_TRIGGERED
      : order.order_type === 'take_profit'
        ? PORTFOLIO_ALERT_TYPES.TAKE_PROFIT_TRIGGERED
        : null;

    if (!alertType) return null;

    const isLoss = order.order_type === 'stop_loss';

    return this.createAlert(portfolioId, alertType, {
      message: `${isLoss ? 'Stop loss' : 'Take profit'} triggered for ${order.symbol} at $${order.triggered_price.toFixed(2)}`,
      data: {
        symbol: order.symbol,
        orderId: order.id,
        orderType: order.order_type,
        triggerPrice: order.trigger_price,
        triggeredPrice: order.triggered_price,
        shares: order.shares,
        realizedPnl: result?.realizedPnl || 0
      },
      severity: isLoss ? ALERT_SEVERITY.WARNING : ALERT_SEVERITY.INFO
    });
  }

  /**
   * Create alert for dividend received (called from holdingsEngine)
   */
  createDividendAlert(portfolioId, dividendData) {
    return this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DIVIDEND_RECEIVED, {
      message: `Received $${dividendData.amount.toFixed(2)} dividend from ${dividendData.symbol}`,
      data: {
        symbol: dividendData.symbol,
        amount: dividendData.amount,
        shares: dividendData.shares,
        perShare: dividendData.perShare,
        reinvested: dividendData.reinvested || false,
        reinvestedShares: dividendData.reinvestedShares || 0
      },
      severity: ALERT_SEVERITY.INFO
    });
  }
}

module.exports = PortfolioAlertsService;
