#!/usr/bin/env node
/**
 * Seed AI Trading Test Data
 *
 * This script populates the database with sample data for testing
 * the AI Trading features (Agent 1, 2, 3 components).
 *
 * Usage: node scripts/seed-ai-trading-data.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/stocks.db');
const db = new Database(DB_PATH);

// Configuration
const DAYS_OF_HISTORY = 60;
const PORTFOLIO_IDS = [1, 11, 33]; // Portfolios to generate recommendations for

// Helper to get random value in range
const random = (min, max) => Math.random() * (max - min) + min;
const randomInt = (min, max) => Math.floor(random(min, max + 1));
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Get date string N days ago
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

// Regimes with realistic transitions
const REGIMES = ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS'];
const REGIME_TRANSITIONS = {
  'BULL': { 'BULL': 0.7, 'SIDEWAYS': 0.2, 'HIGH_VOL': 0.08, 'BEAR': 0.02 },
  'SIDEWAYS': { 'SIDEWAYS': 0.5, 'BULL': 0.25, 'BEAR': 0.15, 'HIGH_VOL': 0.1 },
  'BEAR': { 'BEAR': 0.6, 'SIDEWAYS': 0.2, 'HIGH_VOL': 0.15, 'CRISIS': 0.05 },
  'HIGH_VOL': { 'HIGH_VOL': 0.4, 'SIDEWAYS': 0.3, 'BULL': 0.15, 'BEAR': 0.15 },
  'CRISIS': { 'CRISIS': 0.3, 'HIGH_VOL': 0.4, 'BEAR': 0.25, 'SIDEWAYS': 0.05 }
};

// Actions with weights based on regime
const ACTIONS = ['strong_buy', 'buy', 'hold', 'sell', 'strong_sell'];
const ACTION_WEIGHTS = {
  'BULL': { 'strong_buy': 0.15, 'buy': 0.35, 'hold': 0.35, 'sell': 0.12, 'strong_sell': 0.03 },
  'SIDEWAYS': { 'strong_buy': 0.05, 'buy': 0.2, 'hold': 0.5, 'sell': 0.2, 'strong_sell': 0.05 },
  'BEAR': { 'strong_buy': 0.03, 'buy': 0.12, 'hold': 0.35, 'sell': 0.35, 'strong_sell': 0.15 },
  'HIGH_VOL': { 'strong_buy': 0.05, 'buy': 0.15, 'hold': 0.6, 'sell': 0.15, 'strong_sell': 0.05 },
  'CRISIS': { 'strong_buy': 0.02, 'buy': 0.08, 'hold': 0.3, 'sell': 0.4, 'strong_sell': 0.2 }
};

function weightedChoice(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [item, weight] of entries) {
    r -= weight;
    if (r <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

function getNextRegime(currentRegime) {
  return weightedChoice(REGIME_TRANSITIONS[currentRegime]);
}

function generateSignals(regime) {
  const bullishBias = regime === 'BULL' ? 0.3 : regime === 'BEAR' ? -0.3 : 0;

  return {
    technical: {
      score: Math.max(-1, Math.min(1, random(-0.5, 0.5) + bullishBias)),
      confidence: random(0.5, 0.95),
      rsi: random(30, 70),
      macd: random(-2, 2),
      trend: randomChoice(['bullish', 'bearish', 'neutral'])
    },
    sentiment: {
      score: Math.max(-1, Math.min(1, random(-0.4, 0.4) + bullishBias * 0.5)),
      confidence: random(0.4, 0.85),
      social: random(-1, 1),
      news: random(-1, 1)
    },
    insider: {
      score: random(-0.5, 0.5),
      confidence: random(0.3, 0.8),
      netBuying: randomChoice([true, false, null]),
      recentTransactions: randomInt(0, 10)
    },
    fundamental: {
      score: random(-0.3, 0.7),
      confidence: random(0.6, 0.9),
      peRatio: random(10, 40),
      pbRatio: random(1, 8),
      debtEquity: random(0.2, 2)
    }
  };
}

function generateReasoning(action, signals) {
  const reasons = [];

  if (signals.technical.score > 0.3) {
    reasons.push('Strong technical momentum with bullish indicators');
  } else if (signals.technical.score < -0.3) {
    reasons.push('Weak technical setup with bearish divergence');
  }

  if (signals.sentiment.score > 0.2) {
    reasons.push('Positive market sentiment and social buzz');
  } else if (signals.sentiment.score < -0.2) {
    reasons.push('Negative sentiment across news and social media');
  }

  if (signals.insider.netBuying === true) {
    reasons.push('Recent insider buying activity detected');
  } else if (signals.insider.netBuying === false) {
    reasons.push('Insider selling pressure noted');
  }

  if (signals.fundamental.score > 0.3) {
    reasons.push('Attractive valuation metrics relative to peers');
  }

  if (reasons.length === 0) {
    reasons.push('Mixed signals suggest cautious positioning');
  }

  return reasons;
}

// ============================================
// Seed Market Regimes
// ============================================
function seedMarketRegimes() {
  console.log('\n📊 Seeding market regimes...');

  const deleteStmt = db.prepare('DELETE FROM market_regimes WHERE date >= ?');
  deleteStmt.run(daysAgo(DAYS_OF_HISTORY));

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO market_regimes
    (date, regime, confidence, vix, breadth_pct, sma_spread, volatility_20d,
     spy_price, spy_sma20, spy_sma50, spy_sma200, trend_strength, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let currentRegime = 'SIDEWAYS';
  let regimeCount = 0;

  for (let i = DAYS_OF_HISTORY; i >= 0; i--) {
    const date = daysAgo(i);

    // Regime can change every few days
    regimeCount++;
    if (regimeCount > randomInt(3, 10)) {
      currentRegime = getNextRegime(currentRegime);
      regimeCount = 0;
    }

    const confidence = random(0.6, 0.95);
    const vix = currentRegime === 'CRISIS' ? random(35, 60) :
                currentRegime === 'HIGH_VOL' ? random(22, 35) :
                currentRegime === 'BEAR' ? random(18, 28) :
                random(12, 20);

    const breadth = currentRegime === 'BULL' ? random(55, 75) :
                    currentRegime === 'BEAR' ? random(25, 45) :
                    random(40, 60);

    const smaSpread = currentRegime === 'BULL' ? random(0.02, 0.08) :
                      currentRegime === 'BEAR' ? random(-0.08, -0.02) :
                      random(-0.02, 0.02);

    const volatility = vix / 100 * random(0.8, 1.2);
    const spyPrice = 450 + random(-50, 50);

    const descriptions = {
      'BULL': 'Markets trending higher with broad participation',
      'BEAR': 'Sustained downward pressure across sectors',
      'SIDEWAYS': 'Range-bound trading with mixed signals',
      'HIGH_VOL': 'Elevated volatility with rapid swings',
      'CRISIS': 'Extreme volatility and risk-off sentiment'
    };

    insertStmt.run(
      date,
      currentRegime,
      confidence,
      vix,
      breadth,
      smaSpread,
      volatility,
      spyPrice,
      spyPrice * (1 + random(-0.02, 0.02)),
      spyPrice * (1 + random(-0.05, 0.05)),
      spyPrice * (1 + random(-0.1, 0.1)),
      currentRegime === 'BULL' ? random(0.3, 1) :
        currentRegime === 'BEAR' ? random(-1, -0.3) : random(-0.3, 0.3),
      descriptions[currentRegime]
    );
  }

  console.log(`   ✅ Created ${DAYS_OF_HISTORY + 1} regime records`);
}

// ============================================
// Seed Technical Signals
// ============================================
function seedTechnicalSignals() {
  console.log('\n📈 Seeding technical signals...');

  // Get top companies by market cap or holdings
  const companies = db.prepare(`
    SELECT DISTINCT c.id, c.symbol
    FROM companies c
    WHERE c.symbol IN (
      SELECT DISTINCT symbol FROM portfolio_positions pp
      JOIN companies c2 ON pp.company_id = c2.id
      UNION
      SELECT symbol FROM companies WHERE symbol IN ('AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'V', 'JNJ')
    )
    LIMIT 50
  `).all();

  const deleteStmt = db.prepare('DELETE FROM technical_signals WHERE calculated_at >= ?');
  deleteStmt.run(daysAgo(DAYS_OF_HISTORY) + 'T00:00:00');

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO technical_signals
    (company_id, symbol, calculated_at, score, confidence, signal, signal_strength,
     rsi_14, rsi_score, macd_line, macd_signal, macd_histogram, macd_score,
     sma_20, sma_50, sma_200, trend_score, atr_14, volume_trend, volume_score,
     current_price, interpretation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const company of companies) {
    for (let i = DAYS_OF_HISTORY; i >= 0; i--) {
      const date = daysAgo(i) + 'T16:00:00.000Z';

      const score = random(-0.8, 0.8);
      const confidence = random(0.5, 0.95);
      const signal = score > 0.5 ? 'strong_buy' :
                     score > 0.2 ? 'buy' :
                     score > -0.2 ? 'hold' :
                     score > -0.5 ? 'sell' : 'strong_sell';
      const strength = Math.ceil(Math.abs(score) * 5);

      const rsi = 50 + score * 30 + random(-10, 10);
      const macdLine = score * 2 + random(-0.5, 0.5);
      const macdSignal = macdLine - random(-0.3, 0.3);
      const basePrice = 100 + Math.random() * 400;

      insertStmt.run(
        company.id,
        company.symbol,
        date,
        score,
        confidence,
        signal,
        strength,
        Math.max(0, Math.min(100, rsi)),
        (rsi - 50) / 50,
        macdLine,
        macdSignal,
        macdLine - macdSignal,
        Math.tanh(macdLine - macdSignal),
        basePrice * (1 + random(-0.02, 0.02)),
        basePrice * (1 + random(-0.05, 0.05)),
        basePrice * (1 + random(-0.1, 0.1)),
        score * 0.8,
        basePrice * random(0.01, 0.03),
        random(-1, 1),
        random(-0.5, 0.5),
        basePrice,
        JSON.stringify([
          score > 0 ? 'Bullish momentum building' : 'Bearish pressure present',
          rsi > 70 ? 'RSI overbought - watch for pullback' :
            rsi < 30 ? 'RSI oversold - potential bounce' : 'RSI neutral',
          macdLine > macdSignal ? 'MACD bullish crossover' : 'MACD bearish divergence'
        ])
      );
      count++;
    }
  }

  console.log(`   ✅ Created ${count} technical signal records for ${companies.length} companies`);
}

// ============================================
// Seed Aggregated Signals
// ============================================
function seedAggregatedSignals() {
  console.log('\n🎯 Seeding aggregated signals...');

  const companies = db.prepare(`
    SELECT DISTINCT c.id, c.symbol
    FROM companies c
    WHERE c.symbol IN (
      SELECT DISTINCT symbol FROM portfolio_positions pp
      JOIN companies c2 ON pp.company_id = c2.id
      UNION
      SELECT symbol FROM companies WHERE symbol IN ('AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'V', 'JNJ')
    )
    LIMIT 50
  `).all();

  // Get regime for each date
  const regimes = db.prepare(`
    SELECT date, regime, confidence FROM market_regimes
    WHERE date >= ? ORDER BY date
  `).all(daysAgo(DAYS_OF_HISTORY));

  const regimeMap = {};
  for (const r of regimes) {
    regimeMap[r.date] = r;
  }

  const deleteStmt = db.prepare('DELETE FROM aggregated_signals WHERE calculated_at >= ?');
  deleteStmt.run(daysAgo(DAYS_OF_HISTORY) + 'T00:00:00');

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO aggregated_signals
    (company_id, symbol, calculated_at, market_regime, regime_confidence,
     technical_score, technical_confidence, technical_signal,
     sentiment_score, sentiment_confidence, sentiment_signal,
     insider_score, insider_confidence, insider_signal,
     analyst_score, analyst_confidence, analyst_signal,
     avg_score, weighted_score, bullish_count, bearish_count, highest_confidence,
     overall_signal, overall_strength, overall_confidence, context)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const company of companies) {
    for (let i = DAYS_OF_HISTORY; i >= 0; i--) {
      const dateStr = daysAgo(i);
      const date = dateStr + 'T16:00:00.000Z';
      const regime = regimeMap[dateStr] || { regime: 'SIDEWAYS', confidence: 0.5 };

      const signals = generateSignals(regime.regime);

      const scores = [
        signals.technical.score,
        signals.sentiment.score,
        signals.insider.score,
        signals.fundamental.score
      ];
      const confidences = [
        signals.technical.confidence,
        signals.sentiment.confidence,
        signals.insider.confidence,
        signals.fundamental.confidence
      ];

      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const weightedScore = scores.reduce((sum, s, i) => sum + s * confidences[i], 0) /
                           confidences.reduce((a, b) => a + b, 0);

      const bullishCount = scores.filter(s => s > 0.1).length;
      const bearishCount = scores.filter(s => s < -0.1).length;

      const overallSignal = weightedScore > 0.4 ? 'strong_buy' :
                           weightedScore > 0.15 ? 'buy' :
                           weightedScore > -0.15 ? 'hold' :
                           weightedScore > -0.4 ? 'sell' : 'strong_sell';

      const signalToText = (score) =>
        score > 0.3 ? 'bullish' : score < -0.3 ? 'bearish' : 'neutral';

      insertStmt.run(
        company.id,
        company.symbol,
        date,
        regime.regime,
        regime.confidence,
        signals.technical.score,
        signals.technical.confidence,
        signalToText(signals.technical.score),
        signals.sentiment.score,
        signals.sentiment.confidence,
        signalToText(signals.sentiment.score),
        signals.insider.score,
        signals.insider.confidence,
        signalToText(signals.insider.score),
        signals.fundamental.score,
        signals.fundamental.confidence,
        signalToText(signals.fundamental.score),
        avgScore,
        weightedScore,
        bullishCount,
        bearishCount,
        Math.max(...confidences),
        overallSignal,
        Math.ceil(Math.abs(weightedScore) * 5),
        confidences.reduce((a, b) => a + b, 0) / confidences.length,
        JSON.stringify({
          regime: regime.regime,
          signalDetails: signals
        })
      );
      count++;
    }
  }

  console.log(`   ✅ Created ${count} aggregated signal records`);
}

// ============================================
// Seed Agent Recommendations
// ============================================
function seedAgentRecommendations() {
  console.log('\n🤖 Seeding agent recommendations...');

  // Get positions from portfolios
  const positions = db.prepare(`
    SELECT DISTINCT pp.company_id, c.symbol, pp.portfolio_id
    FROM portfolio_positions pp
    JOIN companies c ON pp.company_id = c.id
    WHERE pp.portfolio_id IN (${PORTFOLIO_IDS.join(',')})
  `).all();

  // Get regime for each date
  const regimes = db.prepare(`
    SELECT date, regime FROM market_regimes WHERE date >= ? ORDER BY date
  `).all(daysAgo(DAYS_OF_HISTORY));

  const regimeMap = {};
  for (const r of regimes) {
    regimeMap[r.date] = r.regime;
  }

  const deleteStmt = db.prepare('DELETE FROM agent_recommendations WHERE date >= ?');
  deleteStmt.run(daysAgo(DAYS_OF_HISTORY));

  const insertStmt = db.prepare(`
    INSERT INTO agent_recommendations
    (company_id, date, action, score, raw_score, confidence, position_size,
     suggested_shares, suggested_value, reasoning, signals, regime_at_time,
     price_at_time, portfolio_id, was_executed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;

  // Generate recommendations for each position every few days
  for (const pos of positions) {
    let lastRecDate = null;

    for (let i = DAYS_OF_HISTORY; i >= 0; i--) {
      const dateStr = daysAgo(i);

      // Generate recommendations every 2-5 days
      if (lastRecDate && Math.random() > 0.3) continue;
      lastRecDate = dateStr;

      const regime = regimeMap[dateStr] || 'SIDEWAYS';
      const signals = generateSignals(regime);
      const action = weightedChoice(ACTION_WEIGHTS[regime]);

      const actionScores = {
        'strong_buy': random(0.7, 1),
        'buy': random(0.3, 0.7),
        'hold': random(-0.2, 0.2),
        'sell': random(-0.7, -0.3),
        'strong_sell': random(-1, -0.7)
      };

      const score = actionScores[action];
      const rawScore = score + random(-0.1, 0.1);
      const confidence = random(0.5, 0.95);
      const positionSize = action.includes('buy') ? random(0.02, 0.08) :
                          action.includes('sell') ? random(-0.08, -0.02) : 0;
      const price = 100 + Math.random() * 400;

      const reasoning = generateReasoning(action, signals);

      insertStmt.run(
        pos.company_id,
        dateStr,
        action,
        score,
        rawScore,
        confidence,
        positionSize,
        action.includes('buy') ? randomInt(10, 100) : action.includes('sell') ? randomInt(-100, -10) : 0,
        Math.abs(positionSize) * 100000,
        JSON.stringify(reasoning),
        JSON.stringify(signals),
        regime,
        price,
        pos.portfolio_id,
        Math.random() > 0.7 ? 1 : 0 // 30% were executed
      );
      count++;
    }
  }

  // Also generate some recommendations for popular stocks not in portfolios
  const popularSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];
  const popularCompanies = db.prepare(`
    SELECT id, symbol FROM companies WHERE symbol IN (${popularSymbols.map(() => '?').join(',')})
  `).all(...popularSymbols);

  for (const company of popularCompanies) {
    for (let i = DAYS_OF_HISTORY; i >= 0; i -= randomInt(2, 5)) {
      const dateStr = daysAgo(i);
      const regime = regimeMap[dateStr] || 'SIDEWAYS';
      const signals = generateSignals(regime);
      const action = weightedChoice(ACTION_WEIGHTS[regime]);

      const actionScores = {
        'strong_buy': random(0.7, 1),
        'buy': random(0.3, 0.7),
        'hold': random(-0.2, 0.2),
        'sell': random(-0.7, -0.3),
        'strong_sell': random(-1, -0.7)
      };

      const score = actionScores[action];
      const price = 100 + Math.random() * 400;

      insertStmt.run(
        company.id,
        dateStr,
        action,
        score,
        score + random(-0.1, 0.1),
        random(0.5, 0.95),
        action.includes('buy') ? random(0.02, 0.08) : action.includes('sell') ? random(-0.08, -0.02) : 0,
        action.includes('buy') ? randomInt(10, 100) : action.includes('sell') ? randomInt(-100, -10) : 0,
        random(1000, 50000),
        JSON.stringify(generateReasoning(action, signals)),
        JSON.stringify(signals),
        regime,
        price,
        null, // No portfolio
        0
      );
      count++;
    }
  }

  console.log(`   ✅ Created ${count} agent recommendation records`);
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('🚀 Seeding AI Trading Test Data');
  console.log('================================');
  console.log(`Database: ${DB_PATH}`);
  console.log(`Days of history: ${DAYS_OF_HISTORY}`);
  console.log(`Portfolios: ${PORTFOLIO_IDS.join(', ')}`);

  try {
    seedMarketRegimes();
    seedTechnicalSignals();
    seedAggregatedSignals();
    seedAgentRecommendations();

    console.log('\n✅ All test data seeded successfully!');
    console.log('\nYou can now test the AI Trading features:');
    console.log('  - AI Trading page: http://localhost:3001/ai-trading/1');
    console.log('  - Portfolio AI tab: http://localhost:3001/portfolios/1');
    console.log('  - Check regime: http://localhost:3000/api/attribution/regime');
    console.log('  - Check signals: http://localhost:3000/api/attribution/signals/AAPL');

  } catch (error) {
    console.error('\n❌ Error seeding data:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
