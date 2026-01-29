/**
 * Trading Services Index
 *
 * Exports all trading-related services:
 * - Signal processing and aggregation
 * - Regime detection
 * - Paper trading engine
 * - Order abstraction layer for broker integration
 */

const { RegimeDetector, REGIMES, REGIME_DESCRIPTIONS } = require('./regimeDetector');
const { TechnicalSignals } = require('./technicalSignals');
const { SignalAggregator, SOURCE_WEIGHTS } = require('./signalAggregator');
const { PaperTradingEngine } = require('./paperTrading');
const {
  OrderAbstractionLayer,
  BrokerAdapter,
  PaperTradingAdapter,
  InteractiveBrokersAdapter,
  AlpacaAdapter,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce
} = require('./orderAbstraction');

// Singleton instance for trading layer
let _tradingLayer = null;

/**
 * Initialize trading services with specified broker
 * @param {string} brokerType Type of broker ('paper', 'ib', 'alpaca')
 * @param {Object} config Broker-specific configuration
 */
async function initializeTradingServices(brokerType = 'paper', config = {}) {
  _tradingLayer = new OrderAbstractionLayer(brokerType, config);
  await _tradingLayer.connect();

  console.log(`💹 Trading services initialized (${brokerType})`);

  return _tradingLayer;
}

/**
 * Get the trading layer instance
 */
function getTradingLayer() {
  if (!_tradingLayer) {
    throw new Error('Trading services not initialized. Call initializeTradingServices() first.');
  }
  return _tradingLayer;
}

/**
 * Quick access to paper trading
 */
async function getPaperTradingLayer(config = {}) {
  if (!_tradingLayer || _tradingLayer.getBrokerType() !== 'paper') {
    _tradingLayer = new OrderAbstractionLayer('paper', config);
    await _tradingLayer.connect();
  }
  return _tradingLayer;
}

module.exports = {
  // Signal Services
  RegimeDetector,
  TechnicalSignals,
  SignalAggregator,

  // Paper Trading
  PaperTradingEngine,

  // Order Abstraction
  OrderAbstractionLayer,
  BrokerAdapter,
  PaperTradingAdapter,
  InteractiveBrokersAdapter,
  AlpacaAdapter,

  // Constants
  REGIMES,
  REGIME_DESCRIPTIONS,
  SOURCE_WEIGHTS,
  OrderType,
  OrderSide,
  OrderStatus,
  TimeInForce,

  // Factory functions
  initializeTradingServices,
  getTradingLayer,
  getPaperTradingLayer
};
