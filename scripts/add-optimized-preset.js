// scripts/add-optimized-preset.js
// Add preset based on backtested optimized weights

const db = require('../src/database');
const database = db.getDatabase();

// Mapping old 6-signal optimized weights to new 15-signal format
// Old: technical: 0.10, fundamental: 0.30, sentiment: 0.00, insider: 0.20, valuation: 0.00, factor: 0.40
const optimizedWeights = {
  // Technical (0.10) - split between technical and momentum
  technical: 0.06,
  momentum: 0.04,

  // Fundamental (0.30) - split across fundamental signals
  fundamental: 0.12,
  valueQuality: 0.10,
  earningsMomentum: 0.05,
  magicFormula: 0.03,

  // Sentiment (0.00)
  sentiment: 0.00,
  analyst: 0.00,

  // Insider (0.20) - split between insider and congressional
  insider: 0.12,
  congressional: 0.05,
  thirteenF: 0.03,

  // Valuation (0.00)
  valuation: 0.00,

  // Factor (0.40) - the factor-based signals
  factorScores: 0.30,
  alternative: 0.05,
  contrarian: 0.05
};

// Verify sum
const sum = Object.values(optimizedWeights).reduce((a, b) => a + b, 0);
console.log('Weights sum:', sum.toFixed(2));

// Check if preset exists
const existing = database.prepare(`SELECT id FROM strategy_presets_v2 WHERE name = ?`).get('Backtested Optimized');

if (existing) {
  console.log('Preset exists, updating...');
  database.prepare(`
    UPDATE strategy_presets_v2
    SET signal_weights = ?, description = ?
    WHERE name = ?
  `).run(
    JSON.stringify(optimizedWeights),
    'Weights derived from walk-forward optimization with factor-heavy allocation',
    'Backtested Optimized'
  );
  console.log('✅ Updated Backtested Optimized preset');
} else {
  console.log('Creating new preset...');
  database.prepare(`
    INSERT INTO strategy_presets_v2 (
      name, description, category, risk_profile, holding_period_type,
      signal_weights, risk_params, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Backtested Optimized',
    'Weights derived from walk-forward optimization with factor-heavy allocation',
    'specialized',
    'moderate',
    'medium',
    JSON.stringify(optimizedWeights),
    JSON.stringify({
      maxPositionSize: 0.08,
      maxSectorConcentration: 0.25,
      stopLoss: 0.12,
      maxCorrelation: 0.70,
      maxPositions: 20
    }),
    0  // Sort order at top
  );
  console.log('✅ Created Backtested Optimized preset');
}

console.log('\nOptimized weights:');
console.log(JSON.stringify(optimizedWeights, null, 2));
