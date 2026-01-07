/**
 * Alternative Data Services Index
 *
 * Exports all alternative data integrations:
 * - Quiver Quantitative (congressional trades, gov contracts)
 * - FINRA Short Interest
 * - Alternative Data Aggregator (unified interface)
 */

const { QuiverQuantitativeService } = require('./quiverQuantitative');
const { FinraShortInterestService } = require('./finraShortInterest');
const { AlternativeDataAggregator } = require('./alternativeDataAggregator');

module.exports = {
  QuiverQuantitativeService,
  FinraShortInterestService,
  AlternativeDataAggregator
};
