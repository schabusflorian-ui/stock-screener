/**
 * Portfolio Alerts Service
 * Monitors portfolios for alert conditions and creates notifications
 */

const { getDatabaseAsync } = require('../../lib/db');
const {
  PORTFOLIO_ALERT_TYPES,
  ALERT_SEVERITY,
  DEFAULT_ALERT_THRESHOLDS
} = require('../../constants/portfolio');

class PortfolioAlertsService {
  constructor() {
    // No database initialization needed for async pattern
  }

  /**
   * Get alert settings for a portfolio
   */
  async getAlertSettings(portfolioId) {
    const database = await getDatabaseAsync();
    const settingsResult = await database.query(`
      SELECT * FROM portfolio_alert_settings
      WHERE portfolio_id = $1
    `, [portfolioId]);
    const settings = settingsResult.rows;

    // Merge with defaults
    const result = {};
    for (const [type, defaultThreshold] of Object.entries(DEFAULT_ALERT_THRESHOLDS)) {
      const setting = settings.find(s => s.alert_type === type);
      result[type] = {
        enabled: setting ? setting.enabled === true : true,
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
        enabled: setting ? setting.enabled === true : true,
        threshold: setting?.threshold ?? null
      };
    }

    return result;
  }

  /**
   * Update alert setting for a portfolio
   */
  async updateAlertSetting(portfolioId, alertType, { enabled, threshold }) {
    const database = await getDatabaseAsync();
    const existingResult = await database.query(`
      SELECT id FROM portfolio_alert_settings
      WHERE portfolio_id = $1 AND alert_type = $2
    `, [portfolioId, alertType]);
    const existing = existingResult.rows[0];

    if (existing) {
      await database.query(`
        UPDATE portfolio_alert_settings
        SET enabled = $1, threshold = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [enabled, threshold, existing.id]);
    } else {
      await database.query(`
        INSERT INTO portfolio_alert_settings (portfolio_id, alert_type, enabled, threshold)
        VALUES ($1, $2, $3, $4)
      `, [portfolioId, alertType, enabled, threshold]);
    }

    return await this.getAlertSettings(portfolioId);
  }

  /**
   * Create a new alert
   */
  async createAlert(portfolioId, alertType, { message, data, severity = ALERT_SEVERITY.INFO }) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      INSERT INTO portfolio_alerts (portfolio_id, alert_type, message, data, severity)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [portfolioId, alertType, message, JSON.stringify(data), severity]);

    return {
      id: result.rows[0].id,
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
  async getAlerts(portfolioId, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
    const database = await getDatabaseAsync();
    let query = `
      SELECT * FROM portfolio_alerts
      WHERE portfolio_id = $1
    `;
    const params = [portfolioId];
    let paramCounter = 2;

    if (unreadOnly) {
      query += ' AND is_read = false';
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    params.push(limit, offset);

    const alertsResult = await database.query(query, params);
    const alerts = alertsResult.rows;

    return alerts.map(a => ({
      id: a.id,
      portfolioId: a.portfolio_id,
      alertType: a.alert_type,
      severity: a.severity,
      message: a.message,
      data: a.data ? JSON.parse(a.data) : null,
      isRead: a.is_read === true,
      isDismissed: a.is_dismissed === true,
      createdAt: a.created_at,
      readAt: a.read_at
    }));
  }

  /**
   * Get unread alert count for a portfolio
   */
  async getUnreadCount(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT COUNT(*) as count FROM portfolio_alerts
      WHERE portfolio_id = $1 AND is_read = false
    `, [portfolioId]);
    return result.rows[0].count;
  }

  /**
   * Mark alert(s) as read
   */
  async markAsRead(alertIds) {
    const database = await getDatabaseAsync();
    if (!Array.isArray(alertIds)) {
      alertIds = [alertIds];
    }

    const placeholders = alertIds.map((_, i) => `$${i + 1}`).join(',');
    await database.query(`
      UPDATE portfolio_alerts
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `, alertIds);

    return { updated: alertIds.length };
  }

  /**
   * Mark all alerts as read for a portfolio
   */
  async markAllAsRead(portfolioId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      UPDATE portfolio_alerts
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE portfolio_id = $1 AND is_read = false
    `, [portfolioId]);

    return { updated: result.rowCount };
  }

  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId) {
    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE portfolio_alerts
      SET is_dismissed = true, is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [alertId]);
  }

  /**
   * Delete old alerts (cleanup)
   */
  async cleanupOldAlerts(daysOld = 30) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      DELETE FROM portfolio_alerts
      WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
        AND is_dismissed = true
    `, [daysOld]);

    return { deleted: result.rowCount };
  }

  /**
   * Check all alert conditions for a portfolio
   */
  async checkPortfolioAlerts(portfolioId, portfolioData) {
    const settings = await this.getAlertSettings(portfolioId);
    const triggeredAlerts = [];

    // Check drawdown
    if (settings[PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD]?.enabled) {
      const alert = await this._checkDrawdownAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    // Check position concentration
    if (settings[PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION]?.enabled) {
      const alerts = await this._checkConcentrationAlerts(portfolioId, portfolioData, settings);
      triggeredAlerts.push(...alerts);
    }

    // Check daily gain/loss
    if (settings[PORTFOLIO_ALERT_TYPES.DAILY_GAIN]?.enabled) {
      const alert = await this._checkDailyGainAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    if (settings[PORTFOLIO_ALERT_TYPES.DAILY_LOSS]?.enabled) {
      const alert = await this._checkDailyLossAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    // Check new high
    if (settings[PORTFOLIO_ALERT_TYPES.NEW_HIGH]?.enabled) {
      const alert = await this._checkNewHighAlert(portfolioId, portfolioData);
      if (alert) triggeredAlerts.push(alert);
    }

    // Check cash low
    if (settings[PORTFOLIO_ALERT_TYPES.CASH_LOW]?.enabled) {
      const alert = await this._checkCashLowAlert(portfolioId, portfolioData, settings);
      if (alert) triggeredAlerts.push(alert);
    }

    return triggeredAlerts;
  }

  /**
   * Check for drawdown alert
   */
  async _checkDrawdownAlert(portfolioId, portfolioData, settings) {
    const database = await getDatabaseAsync();
    const { totalValue, highWaterMark } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD].threshold;

    if (!highWaterMark || highWaterMark === 0) return null;

    const drawdownPct = ((highWaterMark - totalValue) / highWaterMark) * 100;

    if (drawdownPct >= threshold) {
      // Check if we already alerted for this drawdown level today
      const existingAlertResult = await database.query(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = $1
          AND alert_type = $2
          AND created_at >= CURRENT_DATE
          AND (data->>'drawdownPct')::numeric >= $3
      `, [portfolioId, PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD, drawdownPct - 1]);
      const existingAlert = existingAlertResult.rows[0];

      if (existingAlert) return null;

      return await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DRAWDOWN_THRESHOLD, {
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
  async _checkConcentrationAlerts(portfolioId, portfolioData, settings) {
    const database = await getDatabaseAsync();
    const { positions, totalValue } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION].threshold;
    const alerts = [];

    if (!positions || totalValue === 0) return alerts;

    for (const position of positions) {
      const concentrationPct = (position.currentValue / totalValue) * 100;

      if (concentrationPct >= threshold) {
        // Check if we already alerted for this position today
        const existingAlertResult = await database.query(`
          SELECT id FROM portfolio_alerts
          WHERE portfolio_id = $1
            AND alert_type = $2
            AND created_at >= CURRENT_DATE
            AND data->>'symbol' = $3
        `, [portfolioId, PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION, position.symbol]);
        const existingAlert = existingAlertResult.rows[0];

        if (!existingAlert) {
          const alert = await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.POSITION_CONCENTRATION, {
            message: `${position.symbol} concentration of ${concentrationPct.toFixed(2)}% exceeds ${threshold}% threshold`,
            data: {
              symbol: position.symbol,
              concentrationPct: parseFloat(concentrationPct.toFixed(2)),
              threshold,
              positionValue: position.currentValue,
              portfolioValue: totalValue
            },
            severity: concentrationPct >= threshold * 1.5 ? ALERT_SEVERITY.WARNING : ALERT_SEVERITY.INFO
          });
          alerts.push(alert);
        }
      }
    }

    return alerts;
  }

  /**
   * Check for daily gain alert
   */
  async _checkDailyGainAlert(portfolioId, portfolioData, settings) {
    const database = await getDatabaseAsync();
    const { dailyChangePct } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.DAILY_GAIN].threshold;

    if (dailyChangePct >= threshold) {
      // Check if we already alerted today
      const existingAlertResult = await database.query(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = $1
          AND alert_type = $2
          AND created_at >= CURRENT_DATE
      `, [portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_GAIN]);
      const existingAlert = existingAlertResult.rows[0];

      if (existingAlert) return null;

      return await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_GAIN, {
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
  async _checkDailyLossAlert(portfolioId, portfolioData, settings) {
    const database = await getDatabaseAsync();
    const { dailyChangePct } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.DAILY_LOSS].threshold;

    if (dailyChangePct <= -threshold) {
      // Check if we already alerted today
      const existingAlertResult = await database.query(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = $1
          AND alert_type = $2
          AND created_at >= CURRENT_DATE
      `, [portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_LOSS]);
      const existingAlert = existingAlertResult.rows[0];

      if (existingAlert) return null;

      return await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DAILY_LOSS, {
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
  async _checkNewHighAlert(portfolioId, portfolioData) {
    const database = await getDatabaseAsync();
    const { totalValue, highWaterMark, previousHighWaterMark } = portfolioData;

    // Only alert if this is a NEW high (higher than previous high)
    if (totalValue > highWaterMark && (!previousHighWaterMark || totalValue > previousHighWaterMark)) {
      // Check if we already alerted for this high today
      const existingAlertResult = await database.query(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = $1
          AND alert_type = $2
          AND created_at >= CURRENT_DATE
      `, [portfolioId, PORTFOLIO_ALERT_TYPES.NEW_HIGH]);
      const existingAlert = existingAlertResult.rows[0];

      if (existingAlert) return null;

      return await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.NEW_HIGH, {
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
  async _checkCashLowAlert(portfolioId, portfolioData, settings) {
    const database = await getDatabaseAsync();
    const { cashBalance } = portfolioData;
    const threshold = settings[PORTFOLIO_ALERT_TYPES.CASH_LOW].threshold;

    if (cashBalance < threshold) {
      // Check if we already alerted for low cash today
      const existingAlertResult = await database.query(`
        SELECT id FROM portfolio_alerts
        WHERE portfolio_id = $1
          AND alert_type = $2
          AND created_at >= CURRENT_DATE
      `, [portfolioId, PORTFOLIO_ALERT_TYPES.CASH_LOW]);
      const existingAlert = existingAlertResult.rows[0];

      if (existingAlert) return null;

      return await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.CASH_LOW, {
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
  async createOrderTriggeredAlert(portfolioId, order, result) {
    const alertType = order.order_type === 'stop_loss'
      ? PORTFOLIO_ALERT_TYPES.STOP_LOSS_TRIGGERED
      : order.order_type === 'take_profit'
        ? PORTFOLIO_ALERT_TYPES.TAKE_PROFIT_TRIGGERED
        : null;

    if (!alertType) return null;

    const isLoss = order.order_type === 'stop_loss';

    return await this.createAlert(portfolioId, alertType, {
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
  async createDividendAlert(portfolioId, dividendData) {
    return await this.createAlert(portfolioId, PORTFOLIO_ALERT_TYPES.DIVIDEND_RECEIVED, {
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
