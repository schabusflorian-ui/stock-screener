// src/services/mlops/index.js
// MLOps module exports

const { ModelRegistry } = require('./modelRegistry');
const { WeightUpdateService } = require('./weightUpdateService');
const {
  RetrainingScheduler,
  createWeeklyScheduler,
  createMonthlyScheduler
} = require('./retrainingScheduler');

module.exports = {
  // Core classes
  ModelRegistry,
  WeightUpdateService,
  RetrainingScheduler,

  // Convenience factories
  createWeeklyScheduler,
  createMonthlyScheduler
};
