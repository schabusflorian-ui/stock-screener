// src/api/routes/cache.js
// Cache management and statistics endpoint

const express = require('express');
const router = express.Router();
const { cache } = require('../../lib/cache');

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
router.get('/stats', (req, res) => {
  const stats = cache.getStats();

  res.json({
    success: true,
    data: {
      ...stats,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/cache/clear
 * Clear all cache entries (admin only)
 */
router.post('/clear', (req, res) => {
  // In production, add authentication check here
  const statsBefore = cache.getStats();

  cache.clear();

  res.json({
    success: true,
    message: 'Cache cleared',
    cleared: statsBefore.size,
  });
});

/**
 * DELETE /api/cache/pattern/:pattern
 * Clear cache entries matching a pattern (admin only)
 */
router.delete('/pattern/:pattern', (req, res) => {
  const { pattern } = req.params;

  // Basic validation
  if (!pattern || pattern.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Pattern must be at least 2 characters',
    });
  }

  const statsBefore = cache.getStats();
  cache.deletePattern(pattern);
  const statsAfter = cache.getStats();

  const cleared = statsBefore.size - statsAfter.size;

  res.json({
    success: true,
    message: `Cleared entries matching pattern: ${pattern}`,
    cleared,
  });
});

module.exports = router;
