/**
 * Unified Strategy Routes - Stub
 * This is a placeholder to allow the server to start.
 */

const express = require('express');
const router = express.Router();

// GET all unified strategies
router.get('/', async (req, res) => {
  res.json({ strategies: [], message: 'Unified strategies endpoint (stub)' });
});

// GET single strategy by ID
router.get('/:id', async (req, res) => {
  res.status(404).json({ error: 'Strategy not found' });
});

module.exports = router;
