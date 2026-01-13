/**
 * Email Delivery Service for Notifications
 *
 * Uses SendGrid for email delivery with support for:
 * - HTML and plain text templates
 * - Priority-based delivery
 * - Rate limiting
 * - Delivery logging
 */

const path = require('path');
const fs = require('fs');

// Optional SendGrid dependency - only load if available
let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
} catch (err) {
  console.log('[EmailDelivery] @sendgrid/mail not installed - email delivery disabled');
}

// Template cache
const templateCache = new Map();

class EmailDeliveryService {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.SENDGRID_API_KEY;
    this.fromEmail = options.fromEmail || process.env.EMAIL_FROM || 'alerts@investmentplatform.local';
    this.fromName = options.fromName || process.env.EMAIL_FROM_NAME || 'Investment Platform';
    this.enabled = !!this.apiKey && !!sgMail;
    this.templateDir = options.templateDir || path.join(__dirname, 'templates');

    // Rate limiting
    this.rateLimit = options.rateLimit || 100; // emails per minute
    this.rateLimitWindow = 60000; // 1 minute
    this.sentInWindow = 0;
    this.windowStart = Date.now();

    // Queues for different priorities
    this.queues = {
      high: [],    // Critical alerts - send immediately
      normal: [],  // Standard alerts - batch every 5 min
      low: []      // Info/digest - batch every hour
    };

    // Batch intervals
    this.batchIntervals = {
      normal: 5 * 60 * 1000,  // 5 minutes
      low: 60 * 60 * 1000     // 1 hour
    };

    if (this.enabled && sgMail) {
      sgMail.setApiKey(this.apiKey);
      console.log('[EmailDelivery] SendGrid configured');
      this.startBatchProcessors();
    } else {
      console.log('[EmailDelivery] SendGrid not configured - email delivery disabled');
    }
  }

  /**
   * Send a notification email
   */
  async send(notification, recipient, options = {}) {
    if (!this.enabled) {
      console.log('[EmailDelivery] Skipping email (not configured):', notification.title);
      return { success: false, reason: 'not_configured' };
    }

    if (!recipient?.email) {
      return { success: false, reason: 'no_recipient' };
    }

    // Determine priority and queue accordingly
    const priority = this.getPriorityLevel(notification);

    if (priority === 'high') {
      // Send immediately for critical alerts
      return this.sendImmediate(notification, recipient, options);
    } else {
      // Queue for batch delivery
      this.queues[priority].push({ notification, recipient, options, queuedAt: Date.now() });
      return { success: true, queued: true, priority };
    }
  }

  /**
   * Send email immediately (for high priority notifications)
   */
  async sendImmediate(notification, recipient, options = {}) {
    // Check rate limit
    if (!this.checkRateLimit()) {
      this.queues.high.unshift({ notification, recipient, options, queuedAt: Date.now() });
      return { success: false, reason: 'rate_limited', queued: true };
    }

    try {
      const template = await this.getTemplate(notification.category, notification.severity);
      const html = this.renderTemplate(template.html, notification, recipient);
      const text = this.renderTemplate(template.text, notification, recipient);

      const msg = {
        to: recipient.email,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: this.getSubject(notification),
        text,
        html,
        categories: ['notification', notification.category, notification.severity],
        customArgs: {
          notificationId: notification.id?.toString(),
          category: notification.category,
          severity: notification.severity
        }
      };

      // Add reply-to if configured
      if (process.env.EMAIL_REPLY_TO) {
        msg.replyTo = process.env.EMAIL_REPLY_TO;
      }

      await sgMail.send(msg);
      this.sentInWindow++;

      return {
        success: true,
        messageId: msg.customArgs.notificationId,
        sentAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[EmailDelivery] Send error:', error.message);
      return {
        success: false,
        reason: 'send_error',
        error: error.message
      };
    }
  }

  /**
   * Send a digest email (batch of notifications)
   */
  async sendDigest(notifications, recipient, options = {}) {
    if (!this.enabled || notifications.length === 0) {
      return { success: false, reason: 'not_configured_or_empty' };
    }

    if (!recipient?.email) {
      return { success: false, reason: 'no_recipient' };
    }

    try {
      const template = await this.getTemplate('digest', 'info');

      // Group notifications by category
      const byCategory = notifications.reduce((acc, n) => {
        if (!acc[n.category]) acc[n.category] = [];
        acc[n.category].push(n);
        return acc;
      }, {});

      const digestData = {
        notifications,
        byCategory,
        count: notifications.length,
        recipient
      };

      const html = this.renderDigestTemplate(template.html, digestData);
      const text = this.renderDigestTemplate(template.text, digestData);

      const msg = {
        to: recipient.email,
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        subject: `[Digest] ${notifications.length} new notifications`,
        text,
        html,
        categories: ['notification', 'digest']
      };

      await sgMail.send(msg);
      return { success: true, count: notifications.length };
    } catch (error) {
      console.error('[EmailDelivery] Digest send error:', error.message);
      return { success: false, reason: 'send_error', error: error.message };
    }
  }

  /**
   * Get email template
   */
  async getTemplate(category, severity) {
    const cacheKey = `${category}_${severity}`;

    if (templateCache.has(cacheKey)) {
      return templateCache.get(cacheKey);
    }

    // Try category-specific template first, then fall back to default
    const paths = [
      path.join(this.templateDir, `${category}_${severity}.html`),
      path.join(this.templateDir, `${category}.html`),
      path.join(this.templateDir, `default_${severity}.html`),
      path.join(this.templateDir, 'default.html')
    ];

    let html = null;
    let text = null;

    for (const templatePath of paths) {
      if (fs.existsSync(templatePath)) {
        html = fs.readFileSync(templatePath, 'utf8');
        const textPath = templatePath.replace('.html', '.txt');
        if (fs.existsSync(textPath)) {
          text = fs.readFileSync(textPath, 'utf8');
        }
        break;
      }
    }

    // Use inline default if no file found
    if (!html) {
      html = this.getDefaultHtmlTemplate();
      text = this.getDefaultTextTemplate();
    }

    const template = { html, text: text || this.htmlToText(html) };
    templateCache.set(cacheKey, template);
    return template;
  }

  /**
   * Render template with notification data
   */
  renderTemplate(template, notification, recipient) {
    const data = {
      title: notification.title || 'New Notification',
      body: notification.body || '',
      category: notification.category || 'general',
      severity: notification.severity || 'info',
      severityLabel: this.getSeverityLabel(notification.severity),
      severityColor: this.getSeverityColor(notification.severity),
      categoryLabel: this.getCategoryLabel(notification.category),
      categoryColor: this.getCategoryColor(notification.category),
      createdAt: this.formatDate(notification.createdAt),
      recipientName: recipient.name || recipient.email?.split('@')[0] || 'User',
      viewUrl: this.getViewUrl(notification),
      unsubscribeUrl: this.getUnsubscribeUrl(recipient),
      entities: notification.relatedEntities || [],
      primaryEntity: notification.relatedEntities?.[0] || null,
      actions: notification.actions || [],
      data: notification.data || {}
    };

    return this.interpolate(template, data);
  }

  /**
   * Render digest template
   */
  renderDigestTemplate(template, digestData) {
    const data = {
      count: digestData.count,
      recipientName: digestData.recipient.name || digestData.recipient.email?.split('@')[0] || 'User',
      notifications: digestData.notifications.map(n => ({
        title: n.title,
        body: n.body,
        category: n.category,
        severity: n.severity,
        createdAt: this.formatDate(n.createdAt)
      })),
      byCategory: digestData.byCategory,
      viewAllUrl: process.env.APP_URL ? `${process.env.APP_URL}/alerts` : '/alerts',
      unsubscribeUrl: this.getUnsubscribeUrl(digestData.recipient)
    };

    return this.interpolate(template, data);
  }

  /**
   * Simple template interpolation
   */
  interpolate(template, data) {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      const keys = key.split('.');
      let value = data;
      for (const k of keys) {
        value = value?.[k];
      }
      return value !== undefined ? value : match;
    });
  }

  /**
   * Get email subject line
   */
  getSubject(notification) {
    const prefix = notification.severity === 'critical' ? '[CRITICAL] ' :
                   notification.severity === 'warning' ? '[Alert] ' : '';

    const entity = notification.relatedEntities?.[0];
    const entityLabel = entity?.label ? `${entity.label}: ` : '';

    return `${prefix}${entityLabel}${notification.title}`;
  }

  /**
   * Get priority level for notification
   */
  getPriorityLevel(notification) {
    if (notification.severity === 'critical' || notification.priority >= 4) {
      return 'high';
    }
    if (notification.severity === 'warning' || notification.priority >= 2) {
      return 'normal';
    }
    return 'low';
  }

  /**
   * Check rate limit
   */
  checkRateLimit() {
    const now = Date.now();
    if (now - this.windowStart > this.rateLimitWindow) {
      this.windowStart = now;
      this.sentInWindow = 0;
    }
    return this.sentInWindow < this.rateLimit;
  }

  /**
   * Start batch processors for queued emails
   */
  startBatchProcessors() {
    // Process normal priority every 5 minutes
    setInterval(() => this.processBatch('normal'), this.batchIntervals.normal);

    // Process low priority every hour
    setInterval(() => this.processBatch('low'), this.batchIntervals.low);

    // Process high priority queue if rate limited
    setInterval(() => this.processHighPriorityQueue(), 5000);
  }

  /**
   * Process batch queue
   */
  async processBatch(priority) {
    const queue = this.queues[priority];
    if (queue.length === 0) return;

    // Group by recipient
    const byRecipient = new Map();
    while (queue.length > 0) {
      const item = queue.shift();
      const email = item.recipient.email;
      if (!byRecipient.has(email)) {
        byRecipient.set(email, { recipient: item.recipient, notifications: [] });
      }
      byRecipient.get(email).notifications.push(item.notification);
    }

    // Send digest to each recipient
    for (const [, data] of byRecipient) {
      if (data.notifications.length === 1) {
        await this.sendImmediate(data.notifications[0], data.recipient);
      } else {
        await this.sendDigest(data.notifications, data.recipient);
      }
    }
  }

  /**
   * Process high priority queue (for rate-limited items)
   */
  async processHighPriorityQueue() {
    while (this.queues.high.length > 0 && this.checkRateLimit()) {
      const item = this.queues.high.shift();
      await this.sendImmediate(item.notification, item.recipient, item.options);
    }
  }

  /**
   * Helper methods
   */
  getSeverityLabel(severity) {
    const labels = { critical: 'Critical', warning: 'Warning', info: 'Info' };
    return labels[severity] || 'Info';
  }

  getSeverityColor(severity) {
    const colors = { critical: '#DC2626', warning: '#F59E0B', info: '#3B82F6' };
    return colors[severity] || '#6B7280';
  }

  getCategoryLabel(category) {
    const labels = {
      company: 'Company Alert',
      portfolio: 'Portfolio Alert',
      watchlist: 'Watchlist Alert',
      sentiment: 'Sentiment Alert',
      ai: 'AI Insight',
      system: 'System',
      correlation: 'Correlation Alert'
    };
    return labels[category] || 'Notification';
  }

  getCategoryColor(category) {
    const colors = {
      company: '#10B981',
      portfolio: '#6366F1',
      watchlist: '#8B5CF6',
      sentiment: '#EC4899',
      ai: '#14B8A6',
      system: '#6B7280',
      correlation: '#F97316'
    };
    return colors[category] || '#6B7280';
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getViewUrl(notification) {
    const baseUrl = process.env.APP_URL || '';
    const entity = notification.relatedEntities?.[0];

    if (entity?.type === 'company' && entity.label) {
      return `${baseUrl}/company/${entity.label}`;
    }
    if (entity?.type === 'portfolio' && entity.id) {
      return `${baseUrl}/portfolios/${entity.id}`;
    }
    return `${baseUrl}/alerts`;
  }

  getUnsubscribeUrl(recipient) {
    const baseUrl = process.env.APP_URL || '';
    return `${baseUrl}/settings/notifications`;
  }

  htmlToText(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getDefaultHtmlTemplate() {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1F2937; margin: 0; padding: 0; background-color: #F9FAFB; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 24px; margin: 20px 0; }
    .header { border-bottom: 1px solid #E5E7EB; padding-bottom: 16px; margin-bottom: 16px; }
    .severity-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; background: {{severityColor}}20; color: {{severityColor}}; }
    .category-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; background: {{categoryColor}}20; color: {{categoryColor}}; margin-left: 8px; }
    .title { font-size: 20px; font-weight: 600; color: #111827; margin: 12px 0 8px; }
    .body { color: #4B5563; margin: 16px 0; }
    .meta { font-size: 14px; color: #6B7280; }
    .btn { display: inline-block; padding: 10px 20px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 16px; }
    .btn:hover { background: #1D4ED8; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #9CA3AF; }
    .footer a { color: #6B7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <span class="severity-badge">{{severityLabel}}</span>
        <span class="category-badge">{{categoryLabel}}</span>
      </div>
      <h1 class="title">{{title}}</h1>
      <p class="body">{{body}}</p>
      <p class="meta">{{createdAt}}</p>
      <a href="{{viewUrl}}" class="btn">View Details</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you have alerts enabled.</p>
      <p><a href="{{unsubscribeUrl}}">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  getDefaultTextTemplate() {
    return `
{{severityLabel}} - {{categoryLabel}}

{{title}}

{{body}}

{{createdAt}}

View details: {{viewUrl}}

---
Manage notification preferences: {{unsubscribeUrl}}
`;
  }
}

// Singleton instance
let instance = null;

function getEmailDeliveryService(options = {}) {
  if (!instance) {
    instance = new EmailDeliveryService(options);
  }
  return instance;
}

module.exports = {
  EmailDeliveryService,
  getEmailDeliveryService
};
