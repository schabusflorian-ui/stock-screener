// src/api/routes/settings.js
// Settings & Support Hub API routes

const express = require('express');
const router = express.Router();
const { createSettingsService } = require('../../services/settingsService');

// Get settings service instance from request
function getService(req) {
  const db = req.app.get('db');
  return createSettingsService(db);
}

// =========================================================================
// UPDATE SCHEDULES
// =========================================================================

// GET /api/settings/updates - List all update schedules
router.get('/updates', async (req, res) => {
  try {
    const service = getService(req);
    const schedules = await service.getUpdateSchedules();
    res.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Error fetching update schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch update schedules' });
  }
});

// PATCH /api/settings/updates/:name - Toggle schedule enabled/disabled
router.patch('/updates/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
    }

    const service = getService(req);
    const updated = await service.toggleUpdateSchedule(name, enabled);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error toggling update schedule:', error);
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
});

// GET /api/settings/updates/history - Get update history
router.get('/updates/history', async (req, res) => {
  try {
    const { schedule, limit = 50 } = req.query;
    const service = getService(req);
    const history = await service.getUpdateHistory(schedule || null, parseInt(limit));
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error fetching update history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// =========================================================================
// DATA HEALTH
// =========================================================================

// GET /api/settings/data-health - Generate data health report
router.get('/data-health', async (req, res) => {
  try {
    const service = getService(req);
    const report = await service.generateDataHealthReport();
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error generating data health report:', error);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
});

// GET /api/settings/health - Quick health check
router.get('/health', async (req, res) => {
  try {
    const service = getService(req);
    const health = await service.runHealthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    console.error('Error running health check:', error);
    res.status(500).json({ success: false, error: 'Health check failed' });
  }
});

// =========================================================================
// API INTEGRATIONS
// =========================================================================

// GET /api/settings/integrations - List all API integrations
router.get('/integrations', async (req, res) => {
  try {
    const service = getService(req);
    const integrations = await service.getApiIntegrations();
    res.json({ success: true, data: integrations });
  } catch (error) {
    console.error('Error fetching API integrations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch integrations' });
  }
});

// PATCH /api/settings/integrations/:name - Update API key
router.patch('/integrations/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ success: false, error: 'apiKey is required' });
    }

    const service = getService(req);
    const updated = await service.updateApiKey(name, apiKey);

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Integration not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to update API key' });
  }
});

// POST /api/settings/integrations/:name/test - Test API connection
router.post('/integrations/:name/test', async (req, res) => {
  try {
    const { name } = req.params;
    const service = getService(req);
    const result = await service.testApiConnection(name);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error testing API connection:', error);
    res.status(500).json({ success: false, error: 'Test failed' });
  }
});

// =========================================================================
// USER PREFERENCES
// =========================================================================

// GET /api/settings/preferences - Get user preferences
router.get('/preferences', async (req, res) => {
  try {
    const service = getService(req);
    const preferences = await service.getUserPreferences('default');
    res.json({ success: true, data: preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch preferences' });
  }
});

// PATCH /api/settings/preferences - Update user preferences
router.patch('/preferences', async (req, res) => {
  try {
    const service = getService(req);
    await service.updateUserPreferences('default', req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

// =========================================================================
// DATABASE & DIAGNOSTICS
// =========================================================================

// GET /api/settings/database - Get database stats
router.get('/database', async (req, res) => {
  try {
    const service = getService(req);
    const stats = await service.getDatabaseStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching database stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch database stats' });
  }
});

// GET /api/settings/diagnostics - Get system diagnostics
router.get('/diagnostics', async (req, res) => {
  try {
    const service = getService(req);
    const diagnostics = await service.getSystemDiagnostics();
    res.json({ success: true, data: diagnostics });
  } catch (error) {
    console.error('Error fetching diagnostics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch diagnostics' });
  }
});

// GET /api/settings/logs - Query diagnostic logs
router.get('/logs', async (req, res) => {
  try {
    const { level, category, limit = 100 } = req.query;
    const service = getService(req);
    const logs = await service.getLogs({
      level: level || undefined,
      category: category || undefined,
      limit: parseInt(limit),
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
});

// POST /api/settings/logs/cleanup - Clean up old logs
router.post('/logs/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;
    const service = getService(req);
    const deleted = await service.cleanupOldLogs(daysToKeep);
    res.json({ success: true, data: { deleted } });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ success: false, error: 'Failed to clean up logs' });
  }
});

// =========================================================================
// SYSTEM SETTINGS (Key-Value)
// =========================================================================

// GET /api/settings/system - Get all system settings
router.get('/system', async (req, res) => {
  try {
    const service = getService(req);
    const settings = await service.getAllSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

// GET /api/settings/system/:key - Get specific setting
router.get('/system/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const service = getService(req);
    const value = await service.getSetting(key);

    if (value === null) {
      return res.status(404).json({ success: false, error: 'Setting not found' });
    }

    res.json({ success: true, data: { key, value } });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch setting' });
  }
});

// PUT /api/settings/system/:key - Set a system setting
router.put('/system/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    const service = getService(req);
    await service.setSetting(key, value, description);
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting value:', error);
    res.status(500).json({ success: false, error: 'Failed to set value' });
  }
});

// =========================================================================
// EXCHANGE RATES
// =========================================================================

// Cache for exchange rates
let ratesCache = {
  rates: null,
  lastFetched: null,
};

// GET /api/settings/exchange-rates - Get current exchange rates
router.get('/exchange-rates', async (req, res) => {
  try {
    // Return cached rates if less than 1 hour old
    const oneHour = 60 * 60 * 1000;
    if (ratesCache.rates && ratesCache.lastFetched && (Date.now() - ratesCache.lastFetched) < oneHour) {
      return res.json({
        success: true,
        rates: ratesCache.rates,
        lastUpdated: ratesCache.lastFetched,
        cached: true,
      });
    }

    // Try to fetch from free API (exchangerate-api.com free tier or fallback)
    let rates = null;

    try {
      // Try exchangerate.host (free, no key required)
      const response = await fetch('https://api.exchangerate.host/latest?base=USD');
      if (response.ok) {
        const data = await response.json();
        if (data.success !== false && data.rates) {
          rates = data.rates;
        }
      }
    } catch (fetchErr) {
      console.log('Exchange rate API failed, using fallback rates');
    }

    // Fallback to static rates if API fails
    if (!rates) {
      rates = {
        USD: 1,
        EUR: 0.92,
        GBP: 0.79,
        JPY: 157.5,
        CHF: 0.90,
        CAD: 1.44,
        AUD: 1.62,
        CNY: 7.30,
        INR: 85.5,
        KRW: 1480,
        BRL: 6.20,
        MXN: 17.2,
        SGD: 1.36,
        HKD: 7.82,
        SEK: 11.0,
        NOK: 11.3,
        DKK: 7.05,
        PLN: 4.02,
        ZAR: 18.5,
        NZD: 1.78,
      };
    }

    // Cache the rates
    ratesCache = {
      rates,
      lastFetched: Date.now(),
    };

    res.json({
      success: true,
      rates,
      lastUpdated: ratesCache.lastFetched,
      cached: false,
    });

  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    // Return fallback rates on error
    res.json({
      success: true,
      rates: {
        USD: 1, EUR: 0.92, GBP: 0.79, JPY: 157.5, CHF: 0.90,
        CAD: 1.44, AUD: 1.62, CNY: 7.30, INR: 85.5, KRW: 1480,
      },
      error: 'Using fallback rates',
    });
  }
});

module.exports = router;
