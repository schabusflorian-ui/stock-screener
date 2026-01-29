/**
 * Risk Management Services Index
 *
 * Exports all risk management modules:
 * - MarginOfSafetyCalculator: Multi-method intrinsic value calculation
 * - BuffettTalebRiskManager: Comprehensive risk checks combining value + antifragile principles
 */

const { MarginOfSafetyCalculator } = require('./marginOfSafety');
const { BuffettTalebRiskManager } = require('./buffettTalebRisk');

module.exports = {
  MarginOfSafetyCalculator,
  BuffettTalebRiskManager
};
