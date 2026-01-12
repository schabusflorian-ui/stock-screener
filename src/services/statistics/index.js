// src/services/statistics/index.js
// Statistics Module - Main exports

const { ParametricDistributions } = require('./parametricDistributions');

// Singleton instance for convenience
let _instance = null;

function getParametricDistributions() {
  if (!_instance) {
    _instance = new ParametricDistributions();
  }
  return _instance;
}

module.exports = {
  ParametricDistributions,
  getParametricDistributions
};
