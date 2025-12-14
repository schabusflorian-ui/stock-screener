// src/api/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies

// Import routes
const companiesRouter = require('./routes/companies.js');
const metricsRouter = require('./routes/metrics');
const screeningRouter = require('./routes/screening');
const trendsRouter = require('./routes/trends');
const sectorsRouter = require('./routes/sectors');
const classificationsRouter = require('./routes/classifications');
const ipoRouter = require('./routes/ipo');
const updatesRouter = require('./routes/updates');
const insidersRouter = require('./routes/insiders');
const capitalRouter = require('./routes/capital');

// Use routes
app.use('/api/companies', companiesRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/screening', screeningRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/sectors', sectorsRouter);
app.use('/api/classifications', classificationsRouter);
app.use('/api/ipo', ipoRouter);
app.use('/api/updates', updatesRouter);
app.use('/api/insiders', insidersRouter);
app.use('/api/capital', capitalRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Stock Analysis API',
    version: '1.0.0',
    endpoints: {
      companies: '/api/companies',
      metrics: '/api/metrics',
      screening: '/api/screening',
      trends: '/api/trends',
      sectors: '/api/sectors',
      classifications: '/api/classifications',
      ipo: '/api/ipo',
      updates: '/api/updates',
      insiders: '/api/insiders',
      capital: '/api/capital',
      health: '/api/health'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 API Server running on http://localhost:${PORT}`);
  console.log(`📚 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Companies: http://localhost:${PORT}/api/companies\n`);
});

module.exports = app;